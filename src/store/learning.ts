import type { DM, Feedback, Knowledge, Rule } from '../core/types.ts';
import { type Repo, newId, now } from './repo.ts';

// 피드백 · 배운 것(규칙) · 회사 지식 · 문단 코멘트 · DM — 모두 같은 DB·트랜잭션·이벤트를 쓴다.

interface RuleRow { id: string; employee_id: string; text: string; status: string; source: string; applied_count: number; knowledge_id: string | null; created_at: string; updated_at: string }
interface KnowledgeRow { id: string; category: string; title: string; body: string; scope: string; status: string; source: string; used_count: number; history: string; checked_at: string | null; created_at: string; updated_at: string }
interface FeedbackRow { id: string; employee_id: string; artifact_id: string | null; kind: string; rating: number | null; text: string | null; scope: string | null; created_at: string }
export interface CommentRow { id: string; decision_id: string; artifact_id: string; anchor: string; quote: string; text: string; created_at: string; sent_at: string | null }

const toRule = (r: RuleRow): Rule => ({
  id: r.id, employeeId: r.employee_id, text: r.text, status: r.status as Rule['status'], source: JSON.parse(r.source) as Rule['source'],
  appliedCount: r.applied_count, knowledgeId: r.knowledge_id, createdAt: r.created_at, updatedAt: r.updated_at,
});
const toKnowledge = (r: KnowledgeRow): Knowledge => ({
  id: r.id, category: r.category as Knowledge['category'], title: r.title, body: r.body, scope: r.scope, status: r.status as Knowledge['status'],
  source: JSON.parse(r.source) as Knowledge['source'], usedCount: r.used_count, history: JSON.parse(r.history) as Knowledge['history'],
  checkedAt: r.checked_at, createdAt: r.created_at, updatedAt: r.updated_at,
});
const toFeedback = (r: FeedbackRow): Feedback => ({
  id: r.id, employeeId: r.employee_id, artifactId: r.artifact_id, kind: r.kind as Feedback['kind'], rating: r.rating, text: r.text,
  scope: r.scope as Feedback['scope'], createdAt: r.created_at,
});

export class LearningStore {
  #repo: Repo;
  constructor(repo: Repo) {
    this.#repo = repo;
  }

  // ── 피드백 ──
  addFeedback(input: { employeeId: string; artifactId?: string | null; kind: Feedback['kind']; rating?: number | null; text?: string | null; scope?: Feedback['scope'] }): Feedback {
    const f: Feedback = { id: newId('fb'), employeeId: input.employeeId, artifactId: input.artifactId ?? null, kind: input.kind, rating: input.rating ?? null, text: input.text ?? null, scope: input.scope ?? null, createdAt: now() };
    this.#repo.exec('INSERT INTO feedback (id, employee_id, artifact_id, kind, rating, text, scope, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', f.id, f.employeeId, f.artifactId, f.kind, f.rating, f.text, f.scope, f.createdAt);
    return f;
  }
  feedbackFor(employeeId: string): Feedback[] {
    return this.#repo.many<FeedbackRow>('SELECT * FROM feedback WHERE employee_id = ? ORDER BY created_at', employeeId).map(toFeedback);
  }
  feedbackForArtifact(artifactId: string): Feedback[] {
    return this.#repo.many<FeedbackRow>('SELECT * FROM feedback WHERE artifact_id = ? ORDER BY created_at', artifactId).map(toFeedback);
  }

  // ── 배운 것 ──
  addRule(input: { employeeId: string; text: string; status: Rule['status']; source: Rule['source'] }): Rule {
    const r: Rule = { id: newId('rl'), employeeId: input.employeeId, text: input.text, status: input.status, source: input.source, appliedCount: 0, knowledgeId: null, createdAt: now(), updatedAt: now() };
    this.#repo.exec('INSERT INTO rules (id, employee_id, text, status, source, applied_count, knowledge_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)', r.id, r.employeeId, r.text, r.status, JSON.stringify(r.source), r.createdAt, r.updatedAt);
    return r;
  }
  getRule(id: string): Rule | null {
    const r = this.#repo.one<RuleRow>('SELECT * FROM rules WHERE id = ?', id);
    return r ? toRule(r) : null;
  }
  rules(employeeId: string | null, statuses?: Rule['status'][]): Rule[] {
    const rows = employeeId
      ? this.#repo.many<RuleRow>('SELECT * FROM rules WHERE employee_id = ? ORDER BY created_at DESC', employeeId)
      : this.#repo.many<RuleRow>('SELECT * FROM rules ORDER BY created_at DESC');
    return rows.map(toRule).filter((r) => !statuses || statuses.includes(r.status));
  }
  updateRule(id: string, patch: { text?: string; status?: Rule['status']; knowledgeId?: string | null }): Rule | null {
    const cur = this.getRule(id);
    if (!cur) return null;
    this.#repo.exec('UPDATE rules SET text = ?, status = ?, knowledge_id = ?, updated_at = ? WHERE id = ?', patch.text ?? cur.text, patch.status ?? cur.status, patch.knowledgeId === undefined ? cur.knowledgeId : patch.knowledgeId, now(), id);
    return this.getRule(id);
  }
  markApplied(ids: string[]): void {
    for (const id of ids) this.#repo.exec('UPDATE rules SET applied_count = applied_count + 1 WHERE id = ?', id);
  }

  // ── 회사 지식 ──
  addKnowledge(input: { category: Knowledge['category']; title: string; body: string; scope?: string; status: Knowledge['status']; source?: Knowledge['source'] }): Knowledge {
    const k: Knowledge = { id: newId('kn'), category: input.category, title: input.title, body: input.body, scope: input.scope ?? '', status: input.status, source: input.source ?? {}, usedCount: 0, history: [{ at: now(), text: '처음 기록' }], checkedAt: now(), createdAt: now(), updatedAt: now() };
    this.#repo.exec(
      'INSERT INTO knowledge (id, category, title, body, scope, status, source, used_count, history, checked_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)',
      k.id, k.category, k.title, k.body, k.scope, k.status, JSON.stringify(k.source), JSON.stringify(k.history), k.checkedAt, k.createdAt, k.updatedAt,
    );
    return k;
  }
  getKnowledge(id: string): Knowledge | null {
    const r = this.#repo.one<KnowledgeRow>('SELECT * FROM knowledge WHERE id = ?', id);
    return r ? toKnowledge(r) : null;
  }
  knowledge(statuses?: Knowledge['status'][]): Knowledge[] {
    return this.#repo.many<KnowledgeRow>('SELECT * FROM knowledge ORDER BY category, created_at').map(toKnowledge).filter((k) => !statuses || statuses.includes(k.status));
  }
  updateKnowledge(id: string, patch: { title?: string; body?: string; scope?: string; status?: Knowledge['status']; note?: string; checked?: boolean }): Knowledge | null {
    const cur = this.getKnowledge(id);
    if (!cur) return null;
    const history = patch.note ? [...cur.history, { at: now(), text: patch.note }] : cur.history;
    this.#repo.exec(
      'UPDATE knowledge SET title = ?, body = ?, scope = ?, status = ?, history = ?, checked_at = ?, updated_at = ? WHERE id = ?',
      patch.title ?? cur.title, patch.body ?? cur.body, patch.scope ?? cur.scope, patch.status ?? cur.status, JSON.stringify(history),
      patch.checked ? now() : cur.checkedAt, now(), id,
    );
    return this.getKnowledge(id);
  }
  markKnowledgeUsed(ids: string[]): void {
    for (const id of ids) this.#repo.exec('UPDATE knowledge SET used_count = used_count + 1 WHERE id = ?', id);
  }

  // ── 문단 코멘트(결정함 작업대) ──
  addComment(input: { decisionId: string; artifactId: string; anchor: string; quote: string; text: string }): CommentRow {
    const c: CommentRow = { id: newId('cm'), decision_id: input.decisionId, artifact_id: input.artifactId, anchor: input.anchor, quote: input.quote, text: input.text, created_at: now(), sent_at: null };
    this.#repo.exec('INSERT INTO comments (id, decision_id, artifact_id, anchor, quote, text, created_at, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)', c.id, c.decision_id, c.artifact_id, c.anchor, c.quote, c.text, c.created_at);
    return c;
  }
  comments(decisionId: string): CommentRow[] {
    return this.#repo.many<CommentRow>('SELECT * FROM comments WHERE decision_id = ? ORDER BY CAST(anchor AS INTEGER), created_at', decisionId);
  }
  deleteComment(id: string): void {
    this.#repo.exec('DELETE FROM comments WHERE id = ? AND sent_at IS NULL', id);
  }
  markCommentsSent(decisionId: string): void {
    this.#repo.exec('UPDATE comments SET sent_at = ? WHERE decision_id = ? AND sent_at IS NULL', now(), decisionId);
  }

  // ── DM ──
  addDm(employeeId: string, author: DM['author'], text: string): DM {
    const d: DM = { id: newId('dm'), employeeId, author, text, createdAt: now() };
    this.#repo.exec('INSERT INTO dms (id, employee_id, author, text, created_at) VALUES (?, ?, ?, ?, ?)', d.id, d.employeeId, d.author, d.text, d.createdAt);
    return d;
  }
  dms(employeeId: string, limit = 100): DM[] {
    return this.#repo.many<{ id: string; employee_id: string; author: string; text: string; created_at: string }>(
      'SELECT * FROM (SELECT * FROM dms WHERE employee_id = ? ORDER BY created_at DESC LIMIT ?) ORDER BY created_at', employeeId, limit,
    ).map((r) => ({ id: r.id, employeeId: r.employee_id, author: r.author as DM['author'], text: r.text, createdAt: r.created_at }));
  }
}
