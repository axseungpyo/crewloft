import type { App } from '../app.ts';
import { RANKS } from '../core/roles.ts';
import type { Employee } from '../core/types.ts';
import type { Repo } from '../store/repo.ts';
import { confirmedBlueprint } from './blueprint.ts';

/** 설계도에 콘텐츠 운영이 있는가 — 설계도가 없거나 옛 사무실(합성 설계도)이면 지금까지처럼 콘텐츠 운영으로 본다(P2 결정 4) */
export function hasContentOps(repo: Repo): boolean {
  const bp = confirmedBlueprint(repo);
  return !bp || bp.source === 'legacy' || bp.data.blocks.some((b) => b.id === 'content_ops');
}

/**
 * 성장·성과 — 모든 수치는 실제 기록에서만 계산한다(결정 21·22·55). 반응 지표(조회수 등)는 모으지 않는다.
 */
export interface Milestone { key: string; title: string; achieved: boolean; at: string | null; progress: number; goal: number; note: string }

const PLAN_DONE = "d.kind = 'artifact_confirm' AND d.status = 'approved' AND (a.kind = 'kickoff.plan' OR a.kind = 'monthly_plan.plan')";

export function milestones(app: App): Milestone[] {
  const { repo } = app;
  const first = (sql: string): string | null => repo.one<{ at: string | null }>(sql)?.at ?? null;
  const count = (sql: string): number => repo.one<{ n: number }>(sql)?.n ?? 0;
  const published = count("SELECT COUNT(*) AS n FROM external_actions WHERE kind = 'publish' AND status = 'succeeded'");
  const streak = cycleStreak(app);
  const bp = confirmedBlueprint(repo);
  const confirmed = count("SELECT COUNT(*) AS n FROM decisions WHERE kind = 'artifact_confirm' AND status = 'approved'");
  const list: Array<Omit<Milestone, 'achieved'> & { achieved?: boolean }> = [
    { key: 'founded', title: '사무실 설립', at: first('SELECT created_at AS at FROM offices LIMIT 1'), progress: count('SELECT COUNT(*) AS n FROM offices'), goal: 1, note: '사업 소개로 사무실을 열었어요' },
    { key: 'team', title: '첫 팀 완성(4명)', at: null, progress: count('SELECT COUNT(*) AS n FROM employees'), goal: 4, note: '한 명씩 채용해 4명이 모이면' },
    { key: 'first_cycle', title: '첫 주 일 마침', at: first("SELECT MIN(ended_at) AS at FROM cycles WHERE status = 'done'"), progress: count("SELECT COUNT(*) AS n FROM cycles WHERE status = 'done'"), goal: 1, note: '한 주 일을 처음 끝까지' },
    // 게시 마일스톤은 설계도에 콘텐츠 운영이 있을 때만, 업무 블록 사업은 실행 계획 · 확정한 결과물로(P2 결정 4)
    ...(bp && bp.source !== 'legacy' ? [
      { key: 'first_plan', title: '첫 실행 계획 확정', at: first(`SELECT MIN(d.resolved_at) AS at FROM decisions d JOIN artifacts a ON a.id = d.artifact_id WHERE ${PLAN_DONE}`), progress: count(`SELECT COUNT(*) AS n FROM decisions d JOIN artifacts a ON a.id = d.artifact_id WHERE ${PLAN_DONE}`), goal: 1, note: '사업 진단 · 이번 달 실행 계획을 대표가 확정하면' },
      { key: 'confirmed_30', title: '확정한 결과물 30', at: null, progress: confirmed, goal: 30, note: '대표가 결과물 확인에서 확정한 것만 셉니다' },
    ] : []),
    ...(hasContentOps(repo) ? [
      { key: 'first_post', title: '첫 게시', at: first("SELECT MIN(updated_at) AS at FROM external_actions WHERE kind = 'publish' AND status = 'succeeded'"), progress: published, goal: 1, note: '실제로 게시된 것만 셉니다(연습 게시 제외)' },
      { key: 'posts_30', title: '누적 게시 30', at: null, progress: published, goal: 30, note: '실제 게시 기준' },
    ] : []),
    { key: 'first_knowledge', title: '첫 회사 지식', at: first("SELECT MIN(created_at) AS at FROM knowledge WHERE status = 'active'"), progress: count("SELECT COUNT(*) AS n FROM knowledge WHERE status = 'active'"), goal: 1, note: '배운 것을 회사 지식으로 승격' },
    { key: 'streak_4', title: '4주 연속 마침', at: null, progress: streak, goal: 4, note: '매주 일을 이어서 마친 주 수' },
  ];
  return list.map((m) => ({ ...m, achieved: m.progress >= m.goal, progress: Math.min(m.progress, m.goal) }));
}

/** 회차 작업을 마친 연속 주 수(이번 주부터 거꾸로) */
export function cycleStreak(app: Pick<App, 'repo'>): number {
  const weeks = new Set(app.repo.many<{ w: string }>("SELECT week_start AS w FROM cycles WHERE status = 'done' AND week_start IS NOT NULL").map((r) => r.w.slice(0, 10)));
  let n = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (!weeks.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 7); // 이번 주가 아직이면 지난주부터
  while (weeks.has(d.toISOString().slice(0, 10))) {
    n++;
    d.setDate(d.getDate() - 7);
  }
  return n;
}

/**
 * 직원 숙련도 — 회차별 '경미 수정 이하 채택률'(수정 요청 없이 승인된 게시 확인 비율).
 * 계산식을 화면에 공개한다(결정 49). 표본이 적으면 '참고용'.
 */
export function employeeMetrics(app: App, e: Employee) {
  const rows = app.repo.many<{ cycle_id: string; label: string; status: string; version: number }>(
    `SELECT d.cycle_id, c.label, d.status, a.version FROM decisions d
       JOIN artifacts a ON a.id = d.artifact_id JOIN tasks t ON t.id = a.task_id JOIN cycles c ON c.id = d.cycle_id
     WHERE d.kind IN ('publish_confirm', 'artifact_confirm') AND d.status IN ('approved', 'rejected') AND t.assignee_id = ? ORDER BY c.started_at`, e.id,
  );
  const byCycle = new Map<string, { label: string; ok: number; total: number }>();
  for (const r of rows) {
    const b = byCycle.get(r.cycle_id) ?? { label: r.label, ok: 0, total: 0 };
    b.total++;
    if (r.status === 'approved' && r.version === 1) b.ok++;
    byCycle.set(r.cycle_id, b);
  }
  const series = [...byCycle.values()].map((b) => ({ label: b.label, rate: b.total ? Math.round((b.ok / b.total) * 100) : 0, n: b.total }));
  const total = rows.length;
  const ok = rows.filter((r) => r.status === 'approved' && r.version === 1).length;
  const rules = app.learning.rules(e.id, ['confirmed']).length;
  const revisions = app.learning.feedbackFor(e.id).filter((f) => f.kind === 'revision').length;
  const tasksDone = app.repo.one<{ n: number }>("SELECT COUNT(*) AS n FROM tasks WHERE assignee_id = ? AND status = 'done'", e.id)?.n ?? 0;
  const rate = total ? Math.round((ok / total) * 100) : null;
  // 숙련 구간 — 게임 점수가 아니라 기록 구간
  const level = tasksDone === 0 ? 1 : Math.min(9, 1 + Math.floor(tasksDone / 5) + (rate !== null && rate >= 75 ? 1 : 0));
  return {
    adoption: { rate, ok, total, formula: '수정 요청 없이 승인된 게시 확인 ÷ 처리된 게시 확인', sample: total < 6 ? '참고용(표본 적음)' : null },
    series, rulesConfirmed: rules, revisions, tasksDone, level,
    levelFormula: '레벨 = 1 + 끝낸 업무 5건마다 1 + (채택률 75% 이상이면 1), 최대 9',
  };
}

/** 승급 기준(mvp-dev-plan §3 임시값) — 최근 연속 회차 채택률 */
export function promotionCheck(app: App, e: Employee): { eligible: boolean; next: string | null; reason: string } {
  const ladder = e.role === 'manager' ? RANKS.manager : RANKS.staff;
  const idx = (ladder as readonly string[]).indexOf(e.rank);
  const next = idx >= 0 && idx < ladder.length - 1 ? ladder[idx + 1]! : null;
  if (!next) return { eligible: false, next: null, reason: '최고 직급이에요' };
  const need = e.role === 'manager' ? { cycles: 4, rate: 75 } : { cycles: 3, rate: 60 };
  const series = employeeMetrics(app, e).series;
  const recent = series.slice(-need.cycles);
  const eligible = recent.length >= need.cycles && recent.every((s) => s.n > 0 && s.rate >= need.rate);
  return { eligible, next, reason: `최근 ${need.cycles}주 연속 채택률 ${need.rate}% 이상 (현재 ${recent.map((s) => `${s.rate}%`).join(' · ') || '기록 없음'})` };
}
