import type { App } from '../app.ts';
import { ROLE_DESC, ROLE_LABEL } from '../core/roles.ts';
import type { Knowledge, Rule } from '../core/types.ts';
import { clip } from '../core/voice.ts';
import { DomainError } from '../store/repo.ts';
import { cycleStreak, employeeMetrics, milestones, promotionCheck } from './growth.ts';

const words = (s: string): Set<string> => new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length >= 2));

/** 지식 후보 점검(결정 53) — 중복·충돌·근거. 자동으로 덮어쓰지 않고 대표가 고른다. */
export function inspectCandidate(app: App, k: Knowledge) {
  const active = app.learning.knowledge(['active']);
  const mine = words(`${k.title} ${k.body}`);
  const dup = active.find((a) => {
    const t = `${a.title} ${a.body}`.toLowerCase();
    return t.includes(k.body.toLowerCase().slice(0, 30)) || k.body.toLowerCase().includes(a.body.toLowerCase().slice(0, 30));
  });
  const similar = active.filter((a) => a.id !== dup?.id && [...words(`${a.title} ${a.body}`)].filter((w) => mine.has(w)).length >= 2);
  const rule = k.source.ruleId ? app.learning.getRule(k.source.ruleId) : null;
  const evidence = rule ? `${rule.source.feedbackIds?.length ?? 1}번의 피드백 · ${rule.appliedCount}번 적용` : '직접 추가';
  return {
    duplicate: dup ? { id: dup.id, title: dup.title } : null,
    conflicts: similar.map((s) => ({ id: s.id, title: s.title, body: s.body })),
    evidence,
    advice: dup ? '이미 같은 내용이 있어요 — 합치거나 직원 규칙으로만 두세요' : similar.length ? '비슷한 원칙이 있어요 — 덮어쓰지 말고 적용 조건을 나눠 저장하세요' : '문제 없어요 — 회사 지식으로 저장할 수 있어요',
  };
}

/** S4 직원 시트 */
export function employeeSheet(app: App, id: string) {
  const { repo, learning } = app;
  const e = repo.getEmployee(id);
  if (!e) throw new DomainError(404, '직원을 찾을 수 없어요');
  const rules = learning.rules(id);
  const feedback = learning.feedbackFor(id);
  // 관계: 수락된 인계만 집계 + DM + 검토
  const others = repo.listEmployees().filter((x) => x.id !== id);
  const relations = others.map((o) => {
    const handoffs = repo.one<{ n: number }>("SELECT COUNT(*) AS n FROM handoffs WHERE status = 'accepted' AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))", id, o.id, o.id, id)?.n ?? 0;
    return { id: o.id, name: o.name, role: ROLE_LABEL[o.role], handoffs };
  });
  const journal = repo.many<{ seq: number; at: string; type: string; data: string }>(
    "SELECT seq, at, type, data FROM events WHERE (actor_id = ? OR subject_id = ?) AND type IN ('employee_hired', 'employee_updated', 'rule_changed', 'feedback_recorded', 'dm', 'promotion', 'artifact_saved') ORDER BY seq DESC LIMIT 80", id, id,
  ).map((r) => ({ seq: r.seq, at: r.at, type: r.type, text: (JSON.parse(r.data) as { text: string }).text }));
  const since = new Date();
  since.setDate(since.getDate() - ((since.getDay() + 6) % 7));
  since.setHours(0, 0, 0, 0);
  const usage = repo.usageByEmployeeSince(since.toISOString());
  const total = usage.reduce((a, u) => a + u.runs, 0);
  const mine = usage.find((u) => u.employeeId === id)?.runs ?? 0;
  return {
    employee: { ...e, roleLabel: ROLE_LABEL[e.role], roleDesc: ROLE_DESC[e.role] },
    metrics: employeeMetrics(app, e),
    promotion: promotionCheck(app, e),
    rules, feedback, relations, journal,
    share: { runs: mine, total, pct: total ? Math.round((mine / total) * 100) : 0 },
    providers: Object.values(app.providers).map((p) => ({ id: p.id, label: p.label })),
  };
}

export function ruleAction(app: App, id: string, action: string, text?: string): Rule | null {
  const { repo, learning } = app;
  const r = learning.getRule(id);
  if (!r) throw new DomainError(404, '배운 것을 찾을 수 없어요');
  const name = repo.getEmployee(r.employeeId)?.name ?? '직원';
  let next: Rule | null = r;
  if (action === 'confirm' || action === 'always') next = learning.updateRule(id, { status: 'confirmed' });
  else if (action === 'remove') next = learning.updateRule(id, { status: 'removed' });
  else if (action === 'restore') next = learning.updateRule(id, { status: 'confirmed' });
  else if (action === 'edit') {
    const t = (text ?? '').trim();
    if (!t) throw new DomainError(400, '내용을 적어 주세요');
    next = learning.updateRule(id, { text: t.slice(0, 300) });
  } else throw new DomainError(400, '알 수 없는 동작이에요');
  repo.emit('rule_changed', `${name}의 배운 것 — ${{ confirm: '확정', always: '앞으로도 적용', remove: '떼기', restore: '되돌리기', edit: '고치기' }[action]}: ${clip(next?.text ?? r.text, 50)}`, { actorId: r.employeeId, subjectId: id, data: { status: next?.status } });
  return next;
}

/** 배운 것 → 회사 지식 후보(검토 대기 수레) */
export function promoteRule(app: App, ruleId: string, category: Knowledge['category'] = 'method'): Knowledge {
  const { repo, learning } = app;
  const r = learning.getRule(ruleId);
  if (!r) throw new DomainError(404, '배운 것을 찾을 수 없어요');
  if (r.knowledgeId) throw new DomainError(409, '이미 회사 지식 후보예요');
  const e = repo.getEmployee(r.employeeId);
  return repo.tx(() => {
    const k = learning.addKnowledge({ category, title: clip(r.text, 24), body: r.text, scope: e ? `${ROLE_LABEL[e.role]} 업무` : '', status: 'candidate', source: { ruleId: r.id, employeeId: r.employeeId } });
    learning.updateRule(r.id, { knowledgeId: k.id });
    repo.emit('knowledge_changed', `회사 지식 후보: ${k.title}`, { subjectId: k.id, data: { status: 'candidate' } });
    return k;
  });
}

export function knowledgeAction(app: App, id: string, action: string, patch: { title?: string; body?: string; scope?: string; category?: string }): Knowledge | null {
  const { repo, learning } = app;
  const k = learning.getKnowledge(id);
  if (!k) throw new DomainError(404, '지식을 찾을 수 없어요');
  let next: Knowledge | null = k;
  const edits = { title: patch.title?.trim() || undefined, body: patch.body?.trim() || undefined, scope: patch.scope?.trim() };
  if (action === 'activate') next = learning.updateKnowledge(id, { ...edits, status: 'active', note: '회사 지식으로 저장(대표 확인)', checked: true });
  else if (action === 'edit') next = learning.updateKnowledge(id, { ...edits, note: '고침' });
  else if (action === 'still_valid') next = learning.updateKnowledge(id, { note: '아직 맞아요(대표 확인)', checked: true });
  else if (action === 'archive') next = learning.updateKnowledge(id, { status: 'archived', note: '보관' });
  else if (action === 'keep_rule') {
    next = learning.updateKnowledge(id, { status: 'archived', note: '직원 규칙으로만 두기' });
    if (k.source.ruleId) learning.updateRule(k.source.ruleId, { knowledgeId: null });
  } else throw new DomainError(400, '알 수 없는 동작이에요');
  repo.emit('knowledge_changed', `회사 지식 — ${{ activate: '저장', edit: '고침', still_valid: '아직 맞아요', archive: '보관', keep_rule: '직원 규칙으로만' }[action]}: ${next?.title ?? k.title}`, { subjectId: id, data: { status: next?.status } });
  return next;
}

export function companyView(app: App) {
  const { repo, learning } = app;
  const count = (sql: string): number => repo.one<{ n: number }>(sql)?.n ?? 0;
  const knowledge = learning.knowledge();
  const chronicle = repo.many<{ seq: number; at: string; type: string; data: string; subject_id: string | null }>(
    "SELECT seq, at, type, data, subject_id FROM events WHERE type IN ('office_created', 'employee_hired', 'cycle_finished', 'knowledge_changed', 'promotion', 'office_moved') OR (type = 'action_recorded' AND data LIKE '%\"status\":\"succeeded\"%' AND data LIKE '%\"kind\":\"publish\"%') ORDER BY seq DESC LIMIT 120",
  ).map((r) => ({ seq: r.seq, at: r.at, type: r.type, subjectId: r.subject_id, text: (JSON.parse(r.data) as { text: string }).text }));
  return {
    milestones: milestones(app),
    totals: {
      cycles: count("SELECT COUNT(*) AS n FROM cycles WHERE status = 'done'"), streak: cycleStreak(app),
      published: count("SELECT COUNT(*) AS n FROM external_actions WHERE kind = 'publish' AND status = 'succeeded'"),
      newsletters: count("SELECT COUNT(*) AS n FROM artifacts WHERE kind = 'newsletter'"),
      rules: count("SELECT COUNT(*) AS n FROM rules WHERE status = 'confirmed'"), knowledge: knowledge.filter((k) => k.status === 'active').length,
    },
    involvement: app.repo.listCycles(8).reverse().map((c) => ({ label: c.label, handled: repo.one<{ n: number }>("SELECT COUNT(*) AS n FROM decisions WHERE cycle_id = ? AND status != 'open'", c.id)?.n ?? 0 })),
    knowledge: knowledge.map((k) => ({ ...k, check: k.status === 'candidate' ? inspectCandidate(app, k) : null, users: k.source.employeeId ? repo.getEmployee(k.source.employeeId)?.name ?? null : null })),
    chronicle,
  };
}

/** 승급 — 기준 충족 시 제안, 결정은 대표(결정 57). 책임 범위가 넓어지고 확인 원칙은 그대로다. */
export function promote(app: App, id: string): void {
  const { repo } = app;
  const e = repo.getEmployee(id);
  if (!e) throw new DomainError(404, '직원을 찾을 수 없어요');
  const check = promotionCheck(app, e);
  if (!check.next) throw new DomainError(409, '더 오를 직급이 없어요');
  if (!check.eligible) throw new DomainError(409, `아직 승급 기준을 채우지 않았어요 — ${check.reason}`);
  repo.exec('UPDATE employees SET rank = ? WHERE id = ?', check.next, id);
  repo.emit('promotion', `${e.name} 승급: ${e.rank} → ${check.next}`, { actorId: id, subjectId: id, data: { from: e.rank, to: check.next } });
}
