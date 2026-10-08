import type { Decision, Task } from '../core/types.ts';
import { DomainError, type Repo, now } from '../store/repo.ts';

// 사용 한도 세 겹(결정 80) — 업무 하나 · 직원 한 명의 한 주 · 사무실 전체의 한 주.
// 한도에 닿으면 그 업무는 잠듦, 결정함에 "계속할까요? (+얼마)". 승인한 증액은 이번 주만.
// 구독(Claude Code) 경로는 실제 청구가 아니라 API 환산 추정으로 센다(usage 표의 cost_usd).

export type BudgetScope = 'task' | 'employee' | 'office';
export interface BudgetCaps { taskUsd: number | null; employeeWeekUsd: number | null; officeWeekUsd: number | null }
/** 기본값 — 출발점이고 실측으로 조정한다. 설정에서 바꾸고, 비우면(null) 그 겹은 한도 없음 */
export const DEFAULT_CAPS: BudgetCaps = { taskUsd: 0.5, employeeWeekUsd: 3, officeWeekUsd: 10 };

interface Raise { weekStart: string; scope: BudgetScope; usd: number; taskId?: string; employeeId?: string; decisionId: string; at: string }
export interface BudgetHit { scope: BudgetScope; used: number; cap: number }

const CAPS = 'budget.caps';
const RAISES = 'budget.raises';
const SCOPE_LABEL: Record<BudgetScope, string> = { task: '업무 한도', employee: '직원 주간 한도', office: '사무실 주간 한도' };
const money = (n: number): number => Math.round(n * 1e4) / 1e4;
/** 금액 표기 — 소수 둘째 자리까지($0.10). 1센트보다 잘게 쪼개진 값만 그 자리까지 보인다($0.005) */
const usd = (n: number): string => { const m = money(n); return `$${Number(m.toFixed(2)) === m ? m.toFixed(2) : String(m)}`; };

/** 이번 주 월요일 00:00(이 컴퓨터 시간대) */
export function weekStart(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
}

export function budgetCaps(repo: Repo, defaults: BudgetCaps = DEFAULT_CAPS): BudgetCaps {
  return { ...defaults, ...(repo.getSetting<Partial<BudgetCaps>>(CAPS) ?? {}) };
}

function raisesThisWeek(repo: Repo, at: Date): Raise[] {
  const ws = weekStart(at).toISOString();
  return (repo.getSetting<Raise[]>(RAISES) ?? []).filter((r) => r.weekStart === ws);
}

/** 지금 적용되는 한도 = 기본 한도 + 이번 주에 승인한 증액. 기본이 비었으면(한도 없음) 증액도 보지 않는다 */
function effectiveCap(base: number | null, raises: Raise[], match: (r: Raise) => boolean): number | null {
  return base === null ? null : base + raises.filter(match).reduce((n, r) => n + r.usd, 0);
}

/** 세 겹의 (겹, 지금까지 쓴 돈, 지금 적용되는 한도) — 한도가 없는 겹은 빠진다 */
function layers(repo: Repo, task: Task, defaults: BudgetCaps, at: Date): Array<{ scope: BudgetScope; used: number; cap: number }> {
  const caps = budgetCaps(repo, defaults);
  const raises = raisesThisWeek(repo, at);
  const ws = weekStart(at).toISOString();
  const checks: Array<[BudgetScope, () => number, number | null]> = [
    ['task', () => repo.usageForTask(task.id), effectiveCap(caps.taskUsd, raises, (r) => r.scope === 'task' && r.taskId === task.id)],
    ['employee', () => repo.usageByEmployeeSince(ws).find((u) => u.employeeId === task.assigneeId)?.costUsd ?? 0, effectiveCap(caps.employeeWeekUsd, raises, (r) => r.scope === 'employee' && r.employeeId === task.assigneeId)],
    ['office', () => repo.usageSince(ws).costUsd, effectiveCap(caps.officeWeekUsd, raises, (r) => r.scope === 'office')],
  ];
  return checks.flatMap(([scope, used, cap]) => (cap === null ? [] : [{ scope, used: money(used()), cap: money(cap) }]));
}

/** 업무를 시작하기 전에 세 겹을 차례로 본다. 닿은 겹이 없으면 null */
export function checkBudget(repo: Repo, task: Task, defaults: BudgetCaps, at = new Date()): BudgetHit | null {
  return layers(repo, task, defaults, at).find((l) => l.used >= l.cap) ?? null;
}

/**
 * 이번 실행에 쓸 수 있는 남은 돈 — 세 겹 중 가장 적게 남은 겹. 한도가 하나도 없으면 null.
 * 실행 도중에도 한도를 지키도록 AI 요청에 실어 보낸다(구독 CLI는 --max-budget-usd).
 */
export function budgetLeft(repo: Repo, task: Task, defaults: BudgetCaps, at = new Date()): (BudgetHit & { left: number }) | null {
  const all = layers(repo, task, defaults, at).map((l) => ({ ...l, left: money(Math.max(0, l.cap - l.used)) }));
  return all.reduce<(BudgetHit & { left: number }) | null>((min, l) => (min === null || l.left < min.left ? l : min), null);
}

/** 계속할 때 늘릴 금액 — 그 겹 기본 한도의 절반(최소 $0.10)에 이미 넘은 만큼을 더한다 */
function suggestRaise(base: number | null, hit: BudgetHit): number {
  return Math.round((Math.max((base ?? 0) * 0.5, 0.1) + Math.max(0, hit.used - hit.cap)) * 100) / 100;
}

/**
 * 한도에 닿은 업무를 잠재우고 "계속할까요?" 카드를 연다. 같은 겹(같은 주 · 같은 직원)의 카드가 열려 있으면 그 카드에 함께 묶는다.
 * 대표가 거절한 카드가 있으면 새로 묻지 않고 그대로 잠든다(회차 끝에 취소로 정리).
 */
export function sleepTask(repo: Repo, task: Task, hit: BudgetHit, defaults: BudgetCaps, at = new Date()): Decision {
  const ws = weekStart(at).toISOString();
  const key = hit.scope === 'task' ? `budget:task:${task.id}` : hit.scope === 'employee' ? `budget:employee:${task.assigneeId}:${ws}` : `budget:office:${ws}`;
  return repo.tx(() => {
    const last = repo.one<{ id: string; status: string }>('SELECT id, status FROM decisions WHERE item_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1', key);
    let d = last && (last.status === 'open' || last.status === 'rejected') ? repo.getDecision(last.id) : null;
    if (!d) {
      const caps = budgetCaps(repo, defaults);
      const base = hit.scope === 'task' ? caps.taskUsd : hit.scope === 'employee' ? caps.employeeWeekUsd : caps.officeWeekUsd;
      const raiseUsd = suggestRaise(base, hit);
      const who = repo.getEmployee(task.assigneeId)?.name ?? '직원';
      const whose = hit.scope === 'task' ? `“${task.title}”` : hit.scope === 'employee' ? `${who}의 이번 주` : '사무실 이번 주';
      d = repo.openDecision({
        kind: 'budget_continue', cycleId: task.cycleId, itemId: key,
        title: `계속할지 정해 주세요 — ${whose} 사용 한도 ${usd(hit.cap)}에 닿았어요. ${usd(raiseUsd)} 더 쓰면 이어서 해요(이번 주만)`,
        payload: { taskId: task.id, scope: hit.scope, used: hit.used, cap: hit.cap, raiseUsd, ...(hit.scope === 'employee' ? { employeeId: task.assigneeId } : {}) },
      });
    }
    repo.setTaskStatus(task.id, 'asleep', { reason: `결정함에서 계속할지 정해 주세요 — ${SCOPE_LABEL[hit.scope]} ${usd(hit.cap)}(실제 요금으로 친 추정값)에 닿아 쉬고 있어요` });
    repo.updateTaskMeta(task.id, { sleep: { scope: hit.scope, decisionId: d.id, used: hit.used, cap: hit.cap, at: now() } });
    return d;
  });
}

/** 잠든 업무 중 이 카드에 묶인 것 */
function sleepersOf(repo: Repo, decisionId: string): Task[] {
  return repo.tasksByStatus(['asleep']).filter((t) => (t.meta.sleep as { decisionId?: string } | undefined)?.decisionId === decisionId);
}

/** 계속 승인 — 이번 주만 raiseUsd만큼 늘리고 묶인 잠든 업무를 다시 대기로. 거절 — 그대로 잠듦 */
export function decideBudget(repo: Repo, d: Decision, approve: boolean, comment: string | null, at = new Date()): void {
  repo.tx(() => {
    if (!approve) {
      repo.resolveDecision(d.id, 'rejected', comment ?? '이번 주는 더 쓰지 않아요 — 쉬던 업무는 이번 주 일이 끝날 때 취소해요');
      return;
    }
    const scope = d.payload.scope as BudgetScope;
    const raise: Raise = {
      weekStart: weekStart(at).toISOString(), scope, usd: Number(d.payload.raiseUsd) || 0, decisionId: d.id, at: now(),
      ...(scope === 'task' ? { taskId: String(d.payload.taskId) } : {}), ...(scope === 'employee' ? { employeeId: String(d.payload.employeeId) } : {}),
    };
    // 지난 주 증액은 지운다(이번 주만)
    const keep = (repo.getSetting<Raise[]>(RAISES) ?? []).filter((r) => r.weekStart === raise.weekStart);
    repo.setSetting(RAISES, [...keep, raise]);
    repo.resolveDecision(d.id, 'approved', comment);
    repo.emit('budget_changed', `${SCOPE_LABEL[scope]}를 이번 주만 ${usd(raise.usd)} 늘렸어요`, { subjectId: d.id, data: { scope, usd: raise.usd, weekOnly: true } });
    for (const t of sleepersOf(repo, d.id)) repo.setTaskStatus(t.id, 'waiting', { reason: '대표님이 계속하기로 했어요 — 다시 일을 시작해요' });
  });
}

/** GET /api/budget(약속 (6)) */
export function budgetView(repo: Repo, defaults: BudgetCaps, at = new Date()) {
  const ws = weekStart(at).toISOString();
  return {
    caps: budgetCaps(repo, defaults),
    used: {
      officeWeekUsd: money(repo.usageSince(ws).costUsd),
      byEmployee: repo.usageByEmployeeSince(ws).filter((u) => u.employeeId).map((u) => ({ employeeId: u.employeeId, usd: money(u.costUsd) })),
    },
    raisesThisWeek: raisesThisWeek(repo, at).map((r) => ({ scope: r.scope, usd: r.usd, ...(r.taskId ? { taskId: r.taskId } : {}), ...(r.employeeId ? { employeeId: r.employeeId } : {}) })),
    weekStart: ws,
  };
}

/** PUT /api/budget — 보낸 겹만 바꾼다. 숫자(0 이상) 또는 null(한도 없음). 잠든 업무는 바뀐 한도로 다시 확인한다 */
export function setBudgetCaps(repo: Repo, body: Record<string, unknown>, defaults: BudgetCaps): ReturnType<typeof budgetView> {
  const input = (body.caps && typeof body.caps === 'object' ? body.caps : {}) as Record<string, unknown>;
  const next = budgetCaps(repo, defaults);
  for (const k of ['taskUsd', 'employeeWeekUsd', 'officeWeekUsd'] as const) {
    if (!(k in input)) continue;
    const v = input[k];
    if (v === null || v === '') next[k] = null;
    else if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100_000) next[k] = money(v);
    else throw new DomainError(400, '한도는 0 이상의 달러 금액이나 빈칸(한도 없음)으로 보내 주세요');
  }
  repo.tx(() => {
    repo.setSetting(CAPS, next);
    repo.emit('budget_changed', `사용 한도를 바꿨어요 — 업무 ${next.taskUsd === null ? '없음' : usd(next.taskUsd)} · 직원 주 ${next.employeeWeekUsd === null ? '없음' : usd(next.employeeWeekUsd)} · 사무실 주 ${next.officeWeekUsd === null ? '없음' : usd(next.officeWeekUsd)}`, { data: { caps: next } });
    for (const t of repo.tasksByStatus(['asleep'])) {
      const did = (t.meta.sleep as { decisionId?: string } | undefined)?.decisionId;
      const d = did ? repo.getDecision(did) : null;
      if (d?.status === 'open') repo.resolveDecision(d.id, 'stale', '한도를 바꿔 다시 확인해요');
      repo.setTaskStatus(t.id, 'waiting', { reason: '한도를 바꿔 다시 확인해요' });
    }
  });
  return budgetView(repo, defaults);
}
