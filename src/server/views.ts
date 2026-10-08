import { officeGrowth } from '../engine/office-growth.ts';
import { RES, resources } from '../engine/space.ts';
import { facilityState } from '../engine/facilities.ts';
import type { App } from '../app.ts';
import { blockById, blockRoles, flowKeyOf, isBlockKind, stepOfKind } from '../blocks/catalog.ts';
import { decisionRisk } from '../engine/decisions.ts';
import { CHANNEL_LABEL, FLOW_STAGES, ROLE_DESC, ROLE_LABEL } from '../core/roles.ts';
import { FINISHED_STATUSES, STATUS_DETAIL, STATUS_LABEL } from '../core/task-state.ts';
import type { Artifact, Cycle, Decision, ExternalAction, Role, Task, TaskAsk, TaskStatus } from '../core/types.ts';
import { clip } from '../core/voice.ts';
import { weekStart } from '../engine/runner.ts';
import { describeWeekly } from '../engine/scheduler.ts';
import { approvalPolicy, liveMode, timetable } from '../engine/publishing.ts';
import { openTodoCount } from '../engine/todos.ts';

const ACTIVITY_ORDER: TaskStatus[] = ['working', 'reviewing', 'asked', 'asleep', 'reconnect', 'quota_wait', 'failed', 'handoff_pending', 'waiting'];

const artifactBrief = (a: Artifact) => ({ id: a.id, itemId: a.itemId, kind: a.kind, version: a.version, title: a.title, platform: a.meta.platform ?? null, taskId: a.taskId, createdAt: a.createdAt, mediaIds: a.meta.mediaIds ?? [] });

/** 업무가 도크 · 회차 보드의 어느 칸인지 — 콘텐츠 업무는 종류로, 블록 업무는 담당 직무로 */
const stageOf = (kind: string): string | null => flowKeyOf(kind) ?? FLOW_STAGES.find((s) => (s.kinds as readonly string[]).includes(kind))?.key ?? null;

export function taskView(app: App, t: Task) {
  return { ...t, statusLabel: STATUS_LABEL[t.status], statusDetail: STATUS_DETAIL[t.status], assigneeName: app.repo.getEmployee(t.assigneeId)?.name ?? '?', stage: stageOf(t.kind), blockName: isBlockKind(t.kind) ? stepOfKind(t.kind)?.block.name ?? null : null };
}

const SCOPE_TEXT: Record<string, string> = { task: '업무 한도', employee: '직원 주간 한도', office: '사무실 주간 한도' };
/** 되묻는 중 · 잠듦 칸의 설명(결정 80) — '되묻는 중 — <질문 앞부분>' · '한도에 닿아 쉬는 중 — <어느 한도>' */
function pausedDetail(t: Task): string {
  if (t.status === 'asked') return `되묻는 중 — ${clip(String((t.meta.ask as TaskAsk | undefined)?.question ?? ''), 40)}`;
  return `${STATUS_DETAIL.asleep} — ${SCOPE_TEXT[String((t.meta.sleep as { scope?: string } | undefined)?.scope)] ?? '사용 한도'}`;
}

/** S1 하단 도크·S5 회차 보드의 7단계 상태 */
export function flowView(app: App, cycle: Cycle | null) {
  if (!cycle) return FLOW_STAGES.map((s) => ({ key: s.key, label: s.label, state: 'none', who: [] as string[], detail: '' }));
  const tasks = app.repo.listTasks(cycle.id);
  const decisions = app.repo.listDecisions(cycle.id).filter((d) => d.kind === 'publish_confirm' || d.kind === 'artifact_confirm');
  const actions = app.repo.listActions(cycle.id).filter((a) => a.kind === 'publish');
  const skipped = new Set(app.repo.eventsFor(cycle.id, 'task_skipped').map((e) => String(e.data.step)));
  const skippedKeys = new Set([...skipped].map((k) => flowKeyOf(k)).filter(Boolean));
  return FLOW_STAGES.map((s) => {
    if (s.key === 'confirm') {
      const open = decisions.filter((d) => d.status === 'open').length;
      const approved = decisions.filter((d) => d.status === 'approved').length;
      return { key: s.key, label: s.label, state: open ? 'me' : approved ? 'done' : 'none', who: ['대표'], detail: open ? `내 확인 ${open}건` : approved ? `승인 ${approved}건` : '' };
    }
    if (s.key === 'publish') {
      const by = (st: string) => actions.filter((a) => a.status === st).length;
      const issue = by('unknown') + by('failed');
      const state = issue ? 'issue' : by('scheduled') ? 'waiting' : by('succeeded') + by('dry_run') ? 'done' : 'none';
      return { key: s.key, label: s.label, state, who: [], detail: [by('scheduled') && `예약 ${by('scheduled')}`, by('succeeded') && `게시 ${by('succeeded')}`, by('dry_run') && `연습 게시 ${by('dry_run')}`, by('unknown') && `대표님 확인 ${by('unknown')}`, by('failed') && `문제 ${by('failed')}`].filter(Boolean).join(' · ') };
    }
    const mine = tasks.filter((t) => stageOf(t.kind) === s.key);
    const who = [...new Set(mine.map((t) => app.repo.getEmployee(t.assigneeId)?.name ?? '?'))];
    const has = (st: TaskStatus[]) => mine.some((t) => st.includes(t.status));
    let state = 'none';
    if (!mine.length) state = skippedKeys.has(s.key) || [...skipped].some((k) => (s.key === 'write' ? ['blog', 'newsletter', 'sns'] : [s.key]).includes(k)) ? 'skipped' : 'none';
    else if (has(['failed', 'reconnect'])) state = 'issue';
    else if (has(['asleep'])) state = 'asleep';
    else if (has(['asked'])) state = 'asked';
    else if (has(['quota_wait'])) state = 'quota';
    else if (has(['working', 'reviewing'])) state = 'active';
    else if (mine.every((t) => FINISHED_STATUSES.has(t.status))) state = 'done';
    else state = 'waiting';
    const paused = state === 'asleep' || state === 'asked' ? mine.find((t) => t.status === state) : undefined;
    const current = mine.find((t) => !FINISHED_STATUSES.has(t.status));
    return { key: s.key, label: s.label, state, who, detail: paused ? pausedDetail(paused) : current ? `${STATUS_DETAIL[current.status]}${current.waitReason ? ` — ${current.waitReason}` : ''}` : mine.length ? STATUS_LABEL.done : state === 'skipped' ? '채용하면 시작해요' : '' };
  });
}

export type BlockFlowState = 'waiting' | 'active' | 'issue' | 'asleep' | 'asked' | 'quota' | 'done' | 'skipped' | 'me';
export interface BlockFlow { id: string; name: string; state: BlockFlowState; who: string[]; tasks: number; done: number; confirm: number; detail: string }

/**
 * 이번 주 블록 띠(P2 결정 6) — 블록마다 담당 · 상태 · 확인 대기. 콘텐츠 운영만 있는 회차(옛 사무실 포함)는 null → 화면은 7단계 flow를 쓴다.
 * 콘텐츠 운영이 다른 블록과 같이 있으면 콘텐츠 업무(게시 확인 포함)를 한 칸으로 묶는다.
 */
export function flowBlocksView(app: App, cycle: Cycle | null): BlockFlow[] | null {
  if (!cycle || !cycle.blocks.some((b) => b !== 'content_ops')) return null;
  const { repo } = app;
  const tasks = repo.listTasks(cycle.id);
  const open = repo.listDecisions(cycle.id).filter((d) => d.status === 'open');
  const skips = repo.eventsFor(cycle.id, 'task_skipped').map((e) => e.data as { step?: unknown; reason?: unknown });
  const blockOf = (kind: string): string => (isBlockKind(kind) ? kind.split('.')[0]! : 'content_ops');
  const name = (id: string) => repo.getEmployee(id)?.name ?? '?';
  return cycle.blocks.map((id) => {
    const def = blockById(id);
    const mine = tasks.filter((t) => blockOf(t.kind) === id);
    const confirm = open.filter((d) => (id === 'content_ops' ? d.kind === 'publish_confirm' : d.kind === 'artifact_confirm' && String(d.payload.kind ?? '').startsWith(`${id}.`))).length;
    const skipped = skips.filter((e) => blockOf(String(e.step ?? '')) === id);
    const has = (st: TaskStatus[]) => mine.some((t) => st.includes(t.status));
    let state: BlockFlowState;
    if (!mine.length) state = skipped.length ? 'skipped' : 'waiting';
    else if (has(['failed', 'reconnect'])) state = 'issue';
    else if (confirm) state = 'me';
    else if (has(['asleep'])) state = 'asleep';
    else if (has(['asked'])) state = 'asked';
    else if (has(['quota_wait'])) state = 'quota';
    else if (has(['working', 'reviewing'])) state = 'active';
    else if (mine.every((t) => FINISHED_STATUSES.has(t.status))) state = 'done';
    else state = 'waiting';
    const current = ACTIVITY_ORDER.map((st) => mine.find((t) => t.status === st)).find((t) => t !== undefined);
    const who = mine.length ? [...new Set(mine.map((t) => name(t.assigneeId)))] : def ? blockRoles(def).map((r) => ROLE_LABEL[r]) : [];
    const paused = state === 'asleep' || state === 'asked' ? mine.find((t) => t.status === state) : undefined;
    const detail = state === 'me' ? `내 확인 ${confirm}건`
      : paused ? pausedDetail(paused)
      : state === 'skipped' ? String(skipped[0]?.reason ?? '채용하면 시작해요')
      : current ? `${current.title} — ${STATUS_DETAIL[current.status]}${current.waitReason ? ` · ${current.waitReason}` : ''}`
      : state === 'done' ? STATUS_LABEL.done : '';
    return { id, name: def?.name ?? id, state, who, tasks: mine.length, done: mine.filter((t) => t.status === 'done').length, confirm, detail };
  });
}

export async function shellState(app: App) {
  const { repo } = app;
  const ai = app.getAi();
  const office = repo.getOffice();
  const employees = repo.listEmployees();
  const running = repo.runningCycles();
  const cycle = running.at(-1) ?? repo.latestCycle();
  const openTasks = running.flatMap((c) => repo.listTasks(c.id));
  const since = weekStart(new Date()).toISOString();
  const usageBy = new Map(repo.usageByEmployeeSince(since).map((u) => [u.employeeId, u]));
  const open = repo.openDecisions();
  const weekly = app.scheduler.weekly();
  return {
    office,
    growth: office ? officeGrowth(app) : null,
    space: office ? { has: !!repo.getSetting('space.spec'), rev: repo.getSetting<number>('space.rev') ?? 0, balance: resources(repo).balance, res: RES, fac: facilityState(repo) } : null,
    project: repo.getProject(),
    onboarding: app.onboarding.stage(),
    employees: employees.map((e) => {
      const mine = openTasks.filter((t) => t.assigneeId === e.id && !FINISHED_STATUSES.has(t.status));
      const current = ACTIVITY_ORDER.map((s) => mine.find((t) => t.status === s)).find((t) => t !== undefined);
      const u = usageBy.get(e.id);
      return {
        ...e, roleLabel: ROLE_LABEL[e.role as Role], roleDesc: ROLE_DESC[e.role as Role],
        activity: current ? { status: current.status, label: STATUS_LABEL[current.status], detail: STATUS_DETAIL[current.status], task: current.title, taskId: current.id, kind: current.kind, reason: current.waitReason } : { status: 'idle', label: '시작 전', detail: '맡은 일 없음', task: null, taskId: null, kind: null, reason: null },
        usageWeek: { runs: u?.runs ?? 0, costUsd: u?.costUsd ?? 0 },
      };
    }),
    cycle,
    flow: flowView(app, cycle),
    flowBlocks: flowBlocksView(app, cycle),
    counts: {
      todos: openTodoCount(repo),
      decisions: open.length,
      publish: open.filter((d) => d.kind === 'publish_confirm').length,
      confirm: open.filter((d) => d.kind === 'artifact_confirm').length,
      reconnect: open.filter((d) => d.kind === 'reconnect').length,
      other: open.filter((d) => d.kind !== 'publish_confirm' && d.kind !== 'artifact_confirm' && d.kind !== 'reconnect').length,
      // 되묻기 대기 · 잠든 업무(결정 80)
      asked: openTasks.filter((t) => t.status === 'asked').length,
      asleep: openTasks.filter((t) => t.status === 'asleep').length,
    },
    ai: {
      id: ai.id, label: ai.label, policy: ai.policy, concurrency: ai.concurrency, status: await ai.status(), quota: ai.quota(),
      options: Object.values(app.providers).map((p) => ({ id: p.id, label: p.label })), usageWeek: repo.usageSince(since), weeklyBudgetUsd: app.cfg.weeklyBudgetUsd,
    },
    runner: { ...app.runner.state, paused: repo.getSetting<boolean>('runner.paused') === true },
    decor: repo.getSetting<Record<string, unknown>>('office.decor') ?? {},
    schedule: { weekly, text: weekly ? describeWeekly(weekly) : null, nextRunAt: app.scheduler.nextRunAt() },
    connections: app.connections.list().map((c) => ({ app: c.app, status: c.status, label: c.label })),
    publish: { live: liveMode(repo), policy: approvalPolicy(repo), timetable: timetable(repo), blogTarget: repo.getSetting<string>('publish.blogTarget') },
    lastSeq: repo.lastSeq(),
    events: repo.recentEvents(60),
    server: { startedAt: app.startedAt, now: new Date().toISOString(), allowReset: app.cfg.allowReset },
  };
}

export function actionView(app: App, a: ExternalAction) {
  const art = app.repo.getArtifact(a.artifactId);
  return { ...a, label: app.integrations.label(a.target ?? a.app), channelLabel: CHANNEL_LABEL[a.app as keyof typeof CHANNEL_LABEL] ?? app.integrations.label(a.app), artifactTitle: art?.title ?? '', version: art?.version ?? null };
}

export function cycleDetail(app: App, cycle: Cycle) {
  const { repo } = app;
  return {
    cycle,
    flow: flowView(app, cycle),
    flowBlocks: flowBlocksView(app, cycle),
    tasks: repo.listTasks(cycle.id).map((t) => taskView(app, t)),
    skipped: repo.eventsFor(cycle.id, 'task_skipped').map((e) => e.data),
    artifacts: repo.listArtifacts(cycle.id).map(artifactBrief),
    decisions: repo.listDecisions(cycle.id).map((d) => decisionBrief(app, d)),
    actions: repo.listActions(cycle.id).map((a) => actionView(app, a)),
  };
}

export function decisionBrief(app: App, d: Decision) {
  const art = d.artifactId ? app.repo.getArtifact(d.artifactId) : null;
  const author = art ? app.repo.getEmployee(app.repo.getTask(art.taskId)?.assigneeId ?? '') : null;
  return { ...d, risk: decisionRisk(d), artifact: art ? artifactBrief(art) : null, authorName: author?.name ?? null, cycleLabel: d.cycleId ? app.repo.getCycle(d.cycleId)?.label ?? null : null };
}

/** S2 작업대 — 미리보기·만든 사람 체인·적용된 배운 것·근거·경고·코멘트 */
export function decisionDetail(app: App, d: Decision) {
  const { repo, learning } = app;
  const art = d.artifactId ? repo.getArtifact(d.artifactId) : null;
  const chain: Array<{ name: string; role: string; title: string; version: number }> = [];
  if (art) {
    const task = repo.getTask(art.taskId);
    const visit = (t: Task | null, depth: number): void => {
      if (!t || depth > 4) return;
      for (const depId of t.dependsOn) visit(repo.getTask(depId), depth + 1);
      const a = repo.latestArtifact(t.itemId);
      const e = repo.getEmployee(t.assigneeId);
      if (a && e && !chain.some((c) => c.title === a.title && c.name === e.name)) chain.push({ name: e.name, role: ROLE_LABEL[e.role], title: a.title, version: a.version });
    };
    visit(task, 0);
  }
  const versions = art ? repo.many<{ id: string; version: number; created_at: string }>('SELECT id, version, created_at FROM artifacts WHERE item_id = ? ORDER BY version', art.itemId) : [];
  const appliedIds = (art?.meta.appliedRules as string[] | undefined) ?? [];
  const rules = appliedIds.map((id) => learning.getRule(id)).filter((r) => r !== null).map((r) => ({ id: r!.id, text: r!.text }));
  const review = d.reviewArtifactId ? repo.getArtifact(d.reviewArtifactId) : null;
  const sources = art ? (isBlockKind(art.kind) ? art.sources : repo.listArtifacts(art.cycleId).filter((a) => a.kind === 'research').flatMap((a) => a.sources)) : [];
  return {
    ...decisionBrief(app, d),
    artifactFull: art,
    media: art ? app.integrations.mediaFor(art) : [],
    versions,
    chain,
    rules,
    review: review ? { id: review.id, title: review.title, issues: review.meta.issues ?? [], body: review.body } : null,
    evidence: { sources: [...new Set(sources)].slice(0, 12) },
    comments: learning.comments(d.id),
    actions: art ? repo.actionsForArtifact(art.id).map((a) => actionView(app, a)) : [],
  };
}
