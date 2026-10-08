import type { App } from '../app.ts';
import type { Repo } from '../store/repo.ts';
import { cycleStreak, hasContentOps } from './growth.ts';
import { ROOM_CAP } from './space.ts';

/**
 * 성장형 오피스(결정 66) — 공유 오피스 한 칸에서 시작해 사옥까지 자란다. 단계 = 사무실 레벨(결정 68의 '성').
 * 다음 레벨로 가는 조건은 모두 실제 기록이다(결정 21·22). 조건을 채우면 매니저가 레벨 업을 제안하고 대표가 결정한다.
 * (결정 종류 이름 office_move · 이벤트 office_moved 는 처음 '이사'로 만든 이름을 그대로 쓴다)
 * 조건 값은 임시값이다: docs/product/specs/growth-office.md
 */
export interface StageDef { stage: number; name: string; place: string; capacity: number }
export const STAGES: readonly StageDef[] = [
  { stage: 0, name: '공유 오피스 한 칸', place: '공유 오피스 안 작은 방', capacity: 2 },
  { stage: 1, name: '작은 사무실', place: '단독 사무실 한 칸', capacity: 4 },
  { stage: 2, name: '한 층 사무실', place: '빌딩 한 층 전체', capacity: 12 },
  { stage: 3, name: '빌딩 여러 층', place: '오피스 빌딩 2개 층 임대', capacity: 24 },
  { stage: 4, name: '사옥', place: '자체 건물(3개 층)', capacity: 32 },
];

type Metric = 'employees' | 'cyclesDone' | 'approved' | 'streak' | 'knowledge' | 'published' | 'confirmed';
export const LEVEL_LABEL: Record<Metric, string> = {
  employees: '직원', cyclesDone: '마친 주', approved: '승인한 결과물', streak: '연속으로 마친 주', knowledge: '회사 지식', published: '실제 게시', confirmed: '확정한 결과물',
};
/** 각 레벨로 오르는 조건. 인원은 지금 정원이 찬 것(자리가 모자람)을 뜻한다 */
const NEXT: Record<number, Partial<Record<Metric, number>>> = {
  1: { employees: 2, cyclesDone: 1 },
  2: { employees: 4, cyclesDone: 4, approved: 10 },
  3: { employees: 8, streak: 4, knowledge: 10 },
  4: { employees: 16, cyclesDone: 26, published: 30 },
};

/**
 * 게시 없는 사업의 조건(P2 결정 4) — '실제 게시'는 설계도에 콘텐츠 운영이 있을 때만, 없으면 '확정한 결과물'로 바꾼다.
 * 설계도가 없거나 옛 사무실(합성 설계도)은 지금까지 그대로.
 */
export function levelConditions(repo: Repo, stage: number): Partial<Record<Metric, number>> {
  const conds = { ...(NEXT[stage] ?? {}) };
  if (conds.published !== undefined && !hasContentOps(repo)) {
    conds.confirmed = conds.published;
    delete conds.published;
  }
  return conds;
}

export function metrics(app: Pick<App, 'repo'>): Record<Metric, number> {
  const n = (sql: string): number => app.repo.one<{ n: number }>(sql)?.n ?? 0;
  return {
    employees: n('SELECT COUNT(*) AS n FROM employees'),
    cyclesDone: n("SELECT COUNT(*) AS n FROM cycles WHERE status = 'done'"),
    approved: n("SELECT COUNT(*) AS n FROM decisions WHERE kind IN ('publish_confirm', 'artifact_confirm') AND status = 'approved'"),
    streak: cycleStreak(app),
    knowledge: n("SELECT COUNT(*) AS n FROM knowledge WHERE status = 'active'"),
    published: n("SELECT COUNT(*) AS n FROM external_actions WHERE kind = 'publish' AND status = 'succeeded'"),
    confirmed: n("SELECT COUNT(*) AS n FROM decisions WHERE kind = 'artifact_confirm' AND status = 'approved'"),
  };
}

export function officeGrowth(app: Pick<App, 'repo'>) {
  const stage = app.repo.getOffice()?.stage ?? 0;
  const cur = STAGES[stage] ?? STAGES[0]!;
  const m = metrics(app);
  const nxt = STAGES[stage + 1];
  const conds = nxt ? Object.entries(levelConditions(app.repo, nxt.stage)).map(([k, goal]) => ({ key: k, label: LEVEL_LABEL[k as Metric], progress: m[k as Metric], goal: goal!, met: m[k as Metric] >= goal! })) : [];
  const pending = app.repo.openDecisions().find((d) => d.kind === 'office_move') ?? null;
  return {
    ...cur, headcount: m.employees, overflow: Math.max(0, m.employees - cur.capacity),
    next: nxt ? { ...nxt, conditions: conds, ready: conds.every((c) => c.met) } : null,
    pendingDecisionId: pending?.id ?? null,
  };
}

/**
 * 조건을 채웠으면 매니저 이름으로 레벨 업 제안을 연다. 열린 제안이 있으면 다시 열지 않는다.
 * 대표가 거절했으면 그 뒤 회차를 하나 더 마칠 때까지 다시 제안하지 않는다.
 */
export function maybeProposeMove(repo: Repo): void {
  const g = officeGrowth({ repo });
  if (!g.next?.ready || g.pendingDecisionId) return;
  const declinedAt = repo.getSetting<string>('office.moveDeclinedAt');
  if (declinedAt) {
    const after = repo.one<{ n: number }>("SELECT COUNT(*) AS n FROM cycles WHERE status = 'done' AND ended_at > ?", declinedAt)?.n ?? 0;
    if (after < 1) return;
  }
  const manager = repo.listEmployees().find((e) => e.role === 'manager');
  repo.openDecision({
    kind: 'office_move', cycleId: null,
    title: `사무실 레벨을 올릴지 정해 주세요 — 레벨 ${g.next.stage} ${g.next.name}`,
    payload: {
      from: g.stage, to: g.next.stage, fromName: g.name, toName: g.next.name, place: g.next.place,
      capacity: g.next.capacity, headcount: g.headcount, conditions: g.next.conditions, by: manager?.name ?? null,
      roomCap: { from: ROOM_CAP[g.stage] ?? null, to: ROOM_CAP[g.next.stage] ?? null }, hasSpace: !!repo.getSetting('space.spec'),
    },
  });
}

/** 레벨 업 결정 처리 — 승인하면 레벨을 올리고 연대기에 남긴다. 레벨은 되돌아가지 않는다 */
export function resolveMove(repo: Repo, decisionId: string, approve: boolean, comment: string | null): void {
  const d = repo.getDecision(decisionId);
  if (!d) return;
  repo.tx(() => {
    repo.resolveDecision(d.id, approve ? 'approved' : 'rejected', comment ?? (approve ? '레벨을 올려요' : '지금은 그대로 있어요'));
    if (!approve) { repo.setSetting('office.moveDeclinedAt', new Date().toISOString()); return; }
    const to = Number(d.payload.to);
    const office = repo.getOffice();
    if (!office || to <= office.stage) return;
    repo.setOfficeStage(to);
    repo.setSetting('office.moveDeclinedAt', null);
    repo.emit('office_moved', `${office.name} 사무실이 레벨 ${to}(${String(d.payload.toName)})로 올랐어요`, { subjectId: office.id, data: { from: office.stage, to } });
  });
}
