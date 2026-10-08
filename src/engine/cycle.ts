import { blockById } from '../blocks/catalog.ts';
import { PUBLISH_TARGETS, ROLE_LABEL, WEEKLY_STEPS } from '../core/roles.ts';
import { canTransition } from '../core/task-state.ts';
import type { Cycle, Role, Task } from '../core/types.ts';
import { eulreul, eunneun, say } from '../core/voice.ts';
import { DomainError, type Repo } from '../store/repo.ts';
import { type CurrentPlan, confirmedBlueprint, currentPlan, pendingPlanDecision } from './blueprint.ts';

/** "10월 1주차" — 월요일 시작 기준 */
export function cycleLabel(d: Date): string {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  return `${d.getMonth() + 1}월 ${Math.ceil((d.getDate() + offset) / 7)}주차`;
}

/**
 * 이번 회차의 업무 블록(결정 73).
 * - 설계도가 없거나 옛 사무실(합성 설계도) → 콘텐츠 운영(지금까지 그대로)
 * - 확정한 실행 계획이 없으면 → 킥오프(사업 진단 + 이번 달 실행 계획, 매니저 혼자)
 * - 있으면 → 계획의 이번 주 블록 + 주간 회고. 계획의 주를 다 쓰면 다음 달 실행 계획
 */
export function planCycle(repo: Repo): { blocks: string[]; weekGoal: string | null; week: number | null; plan: CurrentPlan | null } {
  const bp = confirmedBlueprint(repo);
  if (!bp || bp.source === 'legacy') return { blocks: ['content_ops'], weekGoal: null, week: null, plan: null };
  const pending = pendingPlanDecision(repo);
  if (pending) throw new DomainError(409, `“${pending.title}”을 먼저 확인해 주세요 — 결정함에 있어요`);
  const plan = currentPlan(repo);
  if (!plan) return { blocks: ['kickoff'], weekGoal: null, week: null, plan: null };
  const done = repo.one<{ n: number }>("SELECT COUNT(*) AS n FROM cycles WHERE started_at > ? AND status != 'cancelled'", plan.confirmedAt)?.n ?? 0;
  const week = done + 1;
  const w = plan.weeks.find((x) => x.week === week);
  if (!w) return { blocks: ['monthly_plan'], weekGoal: null, week: null, plan };
  return { blocks: [...w.blocks.filter((id) => blockById(id)), 'weekly_retro'], weekGoal: w.goal || null, week, plan };
}

/**
 * 주간 회차를 연다. 지금 채용된 역할의 업무만 만들고,
 * 없는 역할의 단계는 "채용 후 가능"으로 기록만 남긴다(결정 54).
 */
export function startCycle(repo: Repo, trigger: Cycle['trigger'], at = new Date()): Cycle {
  return repo.tx(() => {
    if (repo.runningCycles().length) throw new DomainError(409, '이번 주 일이 끝나면 새로 시작할 수 있어요');
    const project = repo.getProject();
    if (!project) throw new DomainError(400, '먼저 사업을 소개해 주세요');
    const manager = repo.employeeByRole('manager');
    if (!manager) throw new DomainError(400, '첫 직원인 매니저를 먼저 채용해 주세요');
    const { blocks, weekGoal, week, plan } = planCycle(repo);

    const base = cycleLabel(at);
    let label = base;
    for (let n = 2; repo.cycleLabelExists(label); n++) label = `${base} · ${n}번째`; // 같은 주에 다시 돌린 회차
    const ws = new Date(at);
    ws.setHours(0, 0, 0, 0);
    ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7));
    const cycle = repo.createCycle(label, trigger, ws.toISOString(), blocks);

    const created = new Map<string, Task>();
    const skipped: string[] = [];
    // 같은 직무가 여럿이면 단계를 돌아가며 나눠 맡는다. 회차마다 시작 사람을 바꿔 한 사람만 쉬지 않게 한다(결정 71)
    const staff = new Map<string, string[]>();
    for (const e of repo.listEmployees()) staff.set(e.role, [...(staff.get(e.role) ?? []), e.id]);
    const rotation = repo.one<{ n: number }>('SELECT COUNT(*) AS n FROM cycles')?.n ?? 0;
    const turn = new Map<string, number>();
    const assign = (role: string): string | null => {
      const ids = staff.get(role);
      if (!ids?.length) return null;
      const i = turn.get(role) ?? 0;
      turn.set(role, i + 1);
      return ids[(i + rotation) % ids.length]!;
    };
    const skip = (step: string, title: string, role: Role, reason: string): void => {
      skipped.push(title);
      repo.emit('task_skipped', `${title} — ${reason}`, { subjectId: cycle.id, data: { step, title, role, reason } });
    };

    for (const id of blocks) {
      if (id === 'content_ops') {
        const channels = new Set(project.brief.channels);
        for (const s of WEEKLY_STEPS) {
          const targets = PUBLISH_TARGETS[s.step];
          if (targets && !targets.some((c) => channels.has(c))) { skip(s.step, s.title, s.role, '채널 설정에 없어요'); continue; }
          const assigneeId = assign(s.role);
          if (!assigneeId) { skip(s.step, s.title, s.role, `${eulreul(ROLE_LABEL[s.role])} 채용하면 시작해요`); continue; }
          const deps = s.deps.map((d) => created.get(d)).filter((t): t is Task => t !== undefined);
          // 기획 · 검색 키워드는 조사 없이도 할 수 있지만, 나머지 단계는 받을 결과물이 있어야 한다
          if (s.deps.length > 0 && deps.length === 0 && s.step !== 'plan' && s.step !== 'seo') { skip(s.step, s.title, s.role, '앞 단계 결과물이 없어요'); continue; }
          created.set(s.step, repo.createTask({
            cycleId: cycle.id, step: s.step, kind: s.kind, title: s.title, assigneeId,
            dependsOn: deps.map((d) => d.id), itemId: `${cycle.id}:${s.item ?? s.step}`,
          }));
        }
        continue;
      }
      const b = blockById(id);
      if (!b) continue;
      for (const s of b.steps) {
        const kind = `${b.id}.${s.step}` as const;
        const assigneeId = assign(s.role);
        if (!assigneeId) { skip(kind, s.title, s.role, `${eulreul(ROLE_LABEL[s.role])} 채용하면 시작해요`); continue; }
        // 회고는 이번 회차의 모든 업무를 받는다
        const deps = b.id === 'weekly_retro' ? [...created.values()] : (s.deps ?? []).map((d) => created.get(`${b.id}.${d}`)).filter((t): t is Task => t !== undefined);
        // 이번 회차에 없는 앞 블록은 가장 최근 결과물을, 회고 · 월 계획은 지금 실행 계획을 받는다
        const inputs = (b.needs ?? []).filter((n) => !blocks.includes(n)).map((n) => latestOfBlock(repo, n)).filter((a): a is string => a !== null);
        if (plan && (b.id === 'weekly_retro' || b.id === 'monthly_plan')) inputs.unshift(plan.artifact.id);
        created.set(kind, repo.createTask({
          cycleId: cycle.id, step: kind, kind, title: s.title, assigneeId, dependsOn: deps.map((d) => d.id), itemId: `${cycle.id}:${kind}`,
          meta: { block: b.id, ...(weekGoal ? { weekGoal } : {}), ...(week ? { week } : {}), ...(inputs.length ? { inputs } : {}) },
        }));
      }
    }

    const doing = [...created.values()].map((t) => t.title).join(', ');
    const later = skipped.length ? skipped.join(', ') : '';
    const head = `${label} 일${week ? `(이번 달 ${week}주차${weekGoal ? ` — ${weekGoal}` : ''})` : ''}`;
    repo.message(manager.id, null, say(manager, {
      haeyo: `${head} 시작해요. 이번에 할 일: ${doing}.${later ? ` ${eunneun(later)} 채용 뒤에 이어서 해요.` : ''}`,
      hamnida: `${head}을 시작하겠습니다. 이번 업무: ${doing}.${later ? ` ${eunneun(later)} 채용 후 진행합니다.` : ''}`,
      banmal: `${head} 시작하자. 할 일: ${doing}.${later ? ` ${eunneun(later)} 채용하고 나서 하자.` : ''}`,
    }), { cycleId: cycle.id });
    return cycle;
  });
}

/** 그 블록의 가장 최근 결과물(대표가 확정한 것이 있으면 그것) */
function latestOfBlock(repo: Repo, blockId: string): string | null {
  const confirmed = repo.one<{ id: string }>(
    `SELECT a.id FROM decisions d JOIN artifacts a ON a.id = d.artifact_id
     WHERE d.kind = 'artifact_confirm' AND d.status = 'approved' AND a.kind LIKE ? ORDER BY d.resolved_at DESC LIMIT 1`, `${blockId}.%`,
  );
  return confirmed?.id ?? repo.one<{ id: string }>('SELECT id FROM artifacts WHERE kind LIKE ? ORDER BY created_at DESC LIMIT 1', `${blockId}.%`)?.id ?? null;
}

/** 회차 취소 — 진행 중인 실행을 멈추고 남은 업무·확인 요청을 닫는다. */
export function cancelCycle(repo: Repo, abort: (taskIds: string[]) => void, cycleId: string): Cycle {
  const cycle = repo.getCycle(cycleId);
  if (!cycle || cycle.status !== 'running') throw new DomainError(409, '지금 하고 있는 주가 아니에요');
  const tasks = repo.listTasks(cycleId);
  abort(tasks.map((t) => t.id));
  repo.tx(() => {
    for (const t of tasks) if (canTransition(t.status, 'cancelled')) repo.setTaskStatus(t.id, 'cancelled', { reason: '이번 주 일 취소' });
    for (const d of repo.listDecisions(cycleId)) if (d.status === 'open') repo.resolveDecision(d.id, 'stale', '이번 주 일 취소');
    repo.finishCycle(cycleId, 'cancelled', `${cycle.label} 일을 취소했어요`);
  });
  return repo.getCycle(cycleId)!;
}
