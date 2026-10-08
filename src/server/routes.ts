import type { App } from '../app.ts';
import type { ProviderId } from '../config.ts';
import { ALL_ROLES } from '../core/roles.ts';
import { RETRYABLE_STATUSES, STATUS_DETAIL } from '../core/task-state.ts';
import type { Brief, Channel, Role } from '../core/types.ts';
import { cancelCycle, startCycle } from '../engine/cycle.ts';
import { confirmedBlueprint, currentPlan, draftBlueprint, listBlueprints } from '../engine/blueprint.ts';
import { decide, markPreviewed } from '../engine/decisions.ts';
import { budgetView, setBudgetCaps } from '../engine/budget.ts';
import { listRuns, verifyRuns } from '../store/runs.ts';
import { reschedule } from '../engine/publishing.ts';
import { parseWeekly } from '../engine/scheduler.ts';
import { DomainError } from '../store/repo.ts';
import { eunneun } from '../core/voice.ts';
import type { Route } from './http.ts';
import { cycleDetail, decisionBrief, decisionDetail, shellState } from './views.ts';

export const str = (v: unknown, label: string, min: number, max: number): string => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min || s.length > max) throw new DomainError(400, `${eunneun(label)} ${min}–${max}자로 써 주세요`);
  return s;
};
const optStr = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

function parseBrief(body: Record<string, unknown>): Partial<Brief> {
  const patch: Partial<Brief> = {};
  for (const key of ['goal', 'direction', 'audience', 'cadence'] as const) {
    if (body[key] !== undefined) patch[key] = str(body[key], key, 0, 300);
  }
  if (body.channels !== undefined) {
    const all: Channel[] = ['blog', 'threads', 'linkedin'];
    const list = Array.isArray(body.channels) ? body.channels.filter((c): c is Channel => all.includes(c as Channel)) : [];
    if (!list.length) throw new DomainError(400, '채널을 하나 이상 골라 주세요');
    patch.channels = [...new Set(list)];
  }
  return patch;
}

const ROLES: readonly Role[] = ALL_ROLES;
const role = (v: unknown): Role => {
  if (!ROLES.includes(v as Role)) throw new DomainError(400, '알 수 없는 역할이에요');
  return v as Role;
};

export function coreRoutes(app: App): Route[] {
  const { repo, runner, onboarding } = app;
  return [
    { method: 'GET', path: '/healthz', handler: () => ({ ok: true, lastTickAt: runner.state.lastTickAt }) },
    { method: 'GET', path: '/api/state', handler: () => shellState(app) },
    {
      method: 'GET', path: '/api/events',
      handler: ({ query }) => repo.events(Number(query.get('after') ?? 0) || 0, Math.min(Number(query.get('limit') ?? 200) || 200, 500)),
    },
    { method: 'POST', path: '/api/office', handler: ({ body }) => repo.createOffice(str(body.name, '회사 이름', 1, 40), str(body.description, '사업 설명', 1, 2000)) },
    { method: 'POST', path: '/api/brief', handler: ({ body }) => repo.updateBrief(parseBrief(body), repo.employeeByRole('manager')?.id ?? null) },

    // ── 채용(S3) ──
    { method: 'GET', path: '/api/onboarding', handler: () => onboarding.state() },
    { method: 'POST', path: '/api/onboarding/power', handler: () => { onboarding.confirmPower(); return onboarding.state(); } },
    { method: 'POST', path: '/api/onboarding/interview', handler: () => onboarding.startInterview() },
    { method: 'POST', path: '/api/onboarding/intro', handler: () => { onboarding.seenIntro(); return { ok: true }; } },
    // 사업 인터뷰 → 사업 설계도(결정 73)
    { method: 'POST', path: '/api/onboarding/setup/start', handler: () => onboarding.startSetup() },
    { method: 'POST', path: '/api/onboarding/setup', handler: ({ body }) => onboarding.submitSetup((body.answers && typeof body.answers === 'object' ? body.answers : {}) as Record<string, unknown>) },
    { method: 'POST', path: '/api/onboarding/blueprint/revise', handler: ({ body }) => onboarding.reviseBlueprint(str(body.text, '고칠 내용', 2, 600)) },
    {
      method: 'POST', path: '/api/onboarding/blueprint/confirm',
      handler: ({ body }) => onboarding.confirmBlueprint({ blocks: body.blocks, goals: body.goals, channels: optStr(body.channels, 10), cadence: optStr(body.cadence, 10) }),
    },
    { method: 'GET', path: '/api/blueprint', handler: () => ({ current: confirmedBlueprint(repo), draft: draftBlueprint(repo), plan: currentPlan(repo), versions: listBlueprints(repo).map((b) => ({ id: b.id, version: b.version, status: b.status, source: b.source, createdAt: b.createdAt })) }) },
    { method: 'POST', path: '/api/onboarding/samples', handler: ({ body }) => onboarding.startSamples(role(body.role)) },
    { method: 'POST', path: '/api/onboarding/finish', handler: () => { onboarding.finish(); return { ok: true }; } },
    {
      method: 'POST', path: '/api/employees',
      handler: ({ body }) => onboarding.hireFromCandidate({ role: role(body.role), archetype: String(body.archetype ?? ''), name: String(body.name ?? ''), style: body.style, look: body.look }),
    },
    { method: 'GET', path: '/api/requests/:id', handler: ({ params }) => app.requests.get(params.id ?? '') ?? (() => { throw new DomainError(404, '요청을 찾을 수 없어요'); })() },

    // ── 회차·업무 ──
    { method: 'GET', path: '/api/cycles', handler: () => repo.listCycles(12).map((c) => ({ ...c, tasks: repo.listTasks(c.id).length, artifacts: repo.listArtifacts(c.id).length, open: repo.openDecisionCount(c.id) })) },
    {
      method: 'GET', path: '/api/cycles/:id',
      handler: ({ params }) => {
        const c = params.id === 'current' ? repo.runningCycles().at(-1) ?? repo.latestCycle() : repo.getCycle(params.id ?? '');
        return c ? cycleDetail(app, c) : null;
      },
    },
    { method: 'POST', path: '/api/cycles', handler: () => startCycle(repo, 'manual') },
    { method: 'POST', path: '/api/cycles/:id/cancel', handler: ({ params }) => cancelCycle(repo, (ids) => runner.abort(ids), params.id ?? '') },
    {
      method: 'POST', path: '/api/tasks/:id/retry',
      handler: ({ params }) => {
        const t = repo.getTask(params.id ?? '');
        if (!t) throw new DomainError(404, '업무를 찾을 수 없어요');
        if (!RETRYABLE_STATUSES.has(t.status)) throw new DomainError(409, `‘${STATUS_DETAIL[t.status]}’ 업무는 다시 시도할 수 없어요 — 문제가 생겼거나 한도 · 연결로 멈춘 업무만 다시 시도해요`);
        runner.clearBlocks();
        return repo.setTaskStatus(t.id, 'waiting', { reason: '대표님이 다시 시도를 눌렀어요' });
      },
    },
    {
      method: 'GET', path: '/api/artifacts/:id',
      handler: ({ params }) => {
        const a = repo.getArtifact(params.id ?? '');
        if (!a) throw new DomainError(404, '결과물을 찾을 수 없어요');
        const author = repo.getEmployee(repo.getTask(a.taskId)?.assigneeId ?? '');
        const versions = repo.many<{ id: string; version: number; created_at: string }>('SELECT id, version, created_at FROM artifacts WHERE item_id = ? ORDER BY version', a.itemId);
        return { ...a, authorName: author?.name ?? null, versions, media: app.integrations.mediaFor(a), actions: repo.actionsForArtifact(a.id) };
      },
    },

    // ── 결정함(S2) ──
    {
      method: 'GET', path: '/api/decisions',
      handler: () => ({ open: repo.openDecisions().map((d) => decisionBrief(app, d)), recent: repo.recentDecisions(30).filter((d) => d.status !== 'open').map((d) => decisionBrief(app, d)) }),
    },
    {
      method: 'GET', path: '/api/decisions/:id',
      handler: ({ params }) => {
        const d = repo.getDecision(params.id ?? '');
        if (!d) throw new DomainError(404, '결정 요청을 찾을 수 없어요');
        return decisionDetail(app, d);
      },
    },
    {
      method: 'POST', path: '/api/decisions/:id',
      handler: ({ params, body }) => {
        const action = body.action;
        if (action !== 'approve' && action !== 'reject' && action !== 'dismiss') throw new DomainError(400, 'approve·reject·dismiss 중 하나로 보내 주세요');
        return decide(repo, app.learning, params.id ?? '', {
          action, comment: optStr(body.comment, 2000), scope: body.scope === 'always' ? 'always' : 'once',
          scheduledAt: typeof body.scheduledAt === 'string' ? body.scheduledAt : undefined,
        });
      },
    },
    // 밖으로 등급 — 원문 미리보기를 열었다고 기록(이게 있어야 승인된다, 결정 80)
    { method: 'POST', path: '/api/decisions/:id/preview', handler: ({ params }) => markPreviewed(repo, params.id ?? '') },
    {
      method: 'POST', path: '/api/decisions/:id/comments',
      handler: ({ params, body }) => {
        const d = repo.getDecision(params.id ?? '');
        if (!d || !d.artifactId || d.status !== 'open') throw new DomainError(409, '열린 게시 확인에만 코멘트를 달 수 있어요');
        return app.learning.addComment({ decisionId: d.id, artifactId: d.artifactId, anchor: String(Number(body.anchor) || 0), quote: optStr(body.quote, 200) ?? '', text: str(body.text, '코멘트', 1, 1000) });
      },
    },
    { method: 'DELETE', path: '/api/comments/:id', handler: ({ params }) => { app.learning.deleteComment(params.id ?? ''); return { ok: true }; } },

    // ── 저장·게시 기록(S5 상태별 행동) ──
    { method: 'POST', path: '/api/actions/:id/retry', handler: ({ params }) => { app.executor.retry(params.id ?? ''); return { ok: true }; } },
    { method: 'POST', path: '/api/actions/:id/cancel', handler: ({ params }) => { app.executor.cancel(params.id ?? ''); return { ok: true }; } },
    {
      method: 'POST', path: '/api/actions/:id/resolve',
      handler: ({ params, body }) => {
        app.executor.resolveUnknown(params.id ?? '', body.outcome === 'published' ? 'published' : 'not_published', optStr(body.url, 500));
        return { ok: true };
      },
    },
    { method: 'POST', path: '/api/actions/:id/reschedule', handler: ({ params, body }) => reschedule(repo, params.id ?? '', String(body.at ?? '')) },

    // ── 작업 기록 · 사용 한도(결정 80) ──
    {
      method: 'GET', path: '/api/runs',
      handler: ({ query }) => listRuns(repo, { taskId: query.get('taskId') || null, limit: Number(query.get('limit') ?? 100) || 100 }),
    },
    { method: 'GET', path: '/api/runs/verify', handler: () => verifyRuns(repo) },
    { method: 'GET', path: '/api/budget', handler: () => budgetView(repo, app.budgetDefaults) },
    { method: 'PUT', path: '/api/budget', handler: ({ body }) => setBudgetCaps(repo, body, app.budgetDefaults) },

    // ── AI·예약·개발 ──
    {
      method: 'POST', path: '/api/ai',
      handler: async ({ body }) => {
        const id = body.provider as ProviderId;
        if (!(id in app.providers)) throw new DomainError(400, '알 수 없는 AI 연결이에요');
        app.setAi(id);
        return app.providers[id].status(true);
      },
    },
    { method: 'GET', path: '/api/ai/status', handler: () => app.getAi().status(true) },
    { method: 'POST', path: '/api/schedule', handler: ({ body }) => app.scheduler.setWeekly(parseWeekly(body)) },
    { method: 'DELETE', path: '/api/schedule', handler: () => app.scheduler.setWeekly(null) },
    {
      method: 'POST', path: '/api/dev/reset',
      handler: () => {
        if (!app.cfg.allowReset) throw new DomainError(403, '운영 모드에서는 초기화할 수 없어요');
        runner.abortAll();
        app.requests.abortAll();
        runner.clearBlocks();
        repo.wipe();
        (app.providers.fake as { reset?: () => void }).reset?.();
        return { ok: true };
      },
    },
  ];
}
