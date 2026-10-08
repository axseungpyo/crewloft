import { randomUUID } from 'node:crypto';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { DEFAULT_BRIEF, ROLE_LABEL } from '../core/roles.ts';
import { STATUS_DETAIL, canTransition } from '../core/task-state.ts';
import { iga } from '../core/voice.ts';
import type {
  ActionStatus, Artifact, ArtifactMeta, Brief, Cycle, CycleStatus, Decision, DecisionKind, DecisionStatus, Employee,
  EmployeeProfile, EmployeeStyle, EventType, ExternalAction, Handoff, HandoffStatus, Look, Office, OfficeEvent, Project,
  Role, Task, TaskKind, TaskStatus, Usage,
} from '../core/types.ts';
import { riskOf } from '../core/risk.ts';
import { DATA_TABLES } from './db.ts';

export type Param = string | number | bigint | null;

export const newId = (prefix: string): string => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
export const now = (): string => new Date().toISOString();

export class DomainError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
  }
}

export interface Job {
  id: string;
  kind: string;
  runAt: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
  dedupeKey: string | null;
}

interface TaskRow {
  id: string; cycle_id: string; step: string; kind: string; title: string; assignee_id: string; status: string;
  wait_reason: string | null; depends_on: string; item_id: string; feedback: string | null; resume_at: string | null;
  attempts: number; meta: string; created_at: string; updated_at: string;
}
interface EmployeeRow { id: string; office_id: string; name: string; role: string; rank: string; style: string; look: string; hired_at: string; profile: string; ai_provider: string | null }
interface CycleRow { id: string; project_id: string; label: string; trigger: string; status: string; started_at: string; ended_at: string | null; week_start: string | null; blocks: string | null }
interface ArtifactRow { id: string; cycle_id: string; task_id: string; item_id: string; kind: string; version: number; title: string; body: string; sources: string; meta: string; created_at: string }
interface HandoffRow { id: string; cycle_id: string; from_task_id: string; to_task_id: string; from_id: string; to_id: string; artifact_id: string | null; status: string; created_at: string; resolved_at: string | null }
interface DecisionRow { id: string; cycle_id: string | null; kind: string; title: string; item_id: string | null; artifact_id: string | null; review_artifact_id: string | null; payload: string; status: string; comment: string | null; scope: string | null; created_at: string; resolved_at: string | null }
interface ActionRow { id: string; kind: string; decision_id: string | null; cycle_id: string | null; app: string; target: string | null; artifact_id: string; idempotency_key: string; status: string; scheduled_at: string | null; attempts: number; note: string | null; result_url: string | null; external_id: string | null; payload: string; created_at: string; updated_at: string }
interface EventRow { seq: number; at: string; actor_id: string | null; type: string; subject_id: string | null; data: string }
interface JobRow { id: string; kind: string; run_at: string; payload: string; status: string; dedupe_key: string | null }

const toTask = (r: TaskRow): Task => ({
  id: r.id, cycleId: r.cycle_id, step: r.step, kind: r.kind as TaskKind, title: r.title, assigneeId: r.assignee_id,
  status: r.status as TaskStatus, waitReason: r.wait_reason, dependsOn: JSON.parse(r.depends_on) as string[],
  itemId: r.item_id, feedback: r.feedback, resumeAt: r.resume_at, attempts: r.attempts,
  meta: JSON.parse(r.meta || '{}') as Record<string, unknown>, createdAt: r.created_at, updatedAt: r.updated_at,
});
const toEmployee = (r: EmployeeRow): Employee => ({
  id: r.id, officeId: r.office_id, name: r.name, role: r.role as Role, rank: r.rank,
  style: JSON.parse(r.style) as EmployeeStyle, look: JSON.parse(r.look) as Look,
  profile: JSON.parse(r.profile || '{}') as EmployeeProfile, aiProvider: r.ai_provider, hiredAt: r.hired_at,
});
const toCycle = (r: CycleRow): Cycle => ({
  id: r.id, projectId: r.project_id, label: r.label, trigger: r.trigger as Cycle['trigger'],
  status: r.status as CycleStatus, startedAt: r.started_at, endedAt: r.ended_at, weekStart: r.week_start,
  blocks: JSON.parse(r.blocks || '[]') as string[],
});
const toArtifact = (r: ArtifactRow): Artifact => ({
  id: r.id, cycleId: r.cycle_id, taskId: r.task_id, itemId: r.item_id, kind: r.kind as TaskKind, version: r.version,
  title: r.title, body: r.body, sources: JSON.parse(r.sources) as string[], meta: JSON.parse(r.meta || '{}') as ArtifactMeta,
  createdAt: r.created_at,
});
const toHandoff = (r: HandoffRow): Handoff => ({
  id: r.id, cycleId: r.cycle_id, fromTaskId: r.from_task_id, toTaskId: r.to_task_id, fromId: r.from_id, toId: r.to_id,
  artifactId: r.artifact_id, status: r.status as HandoffStatus, createdAt: r.created_at, resolvedAt: r.resolved_at,
});
const toDecision = (r: DecisionRow): Decision => ({
  id: r.id, cycleId: r.cycle_id, kind: r.kind as DecisionKind, title: r.title, itemId: r.item_id, artifactId: r.artifact_id,
  reviewArtifactId: r.review_artifact_id, payload: JSON.parse(r.payload || '{}') as Record<string, unknown>,
  status: r.status as DecisionStatus, comment: r.comment, scope: (r.scope as Decision['scope']) ?? null,
  createdAt: r.created_at, resolvedAt: r.resolved_at,
});
const toAction = (r: ActionRow): ExternalAction => ({
  id: r.id, kind: r.kind as ExternalAction['kind'], decisionId: r.decision_id, cycleId: r.cycle_id, app: r.app,
  target: r.target, artifactId: r.artifact_id, idempotencyKey: r.idempotency_key, status: r.status as ActionStatus,
  scheduledAt: r.scheduled_at, attempts: r.attempts, note: r.note, resultUrl: r.result_url, externalId: r.external_id,
  payload: JSON.parse(r.payload || '{}') as Record<string, unknown>, createdAt: r.created_at, updatedAt: r.updated_at,
});
const toEvent = (r: EventRow): OfficeEvent => ({
  seq: r.seq, at: r.at, actorId: r.actor_id, type: r.type as EventType, subjectId: r.subject_id,
  data: JSON.parse(r.data) as OfficeEvent['data'],
});
const toJob = (r: JobRow): Job => ({
  id: r.id, kind: r.kind, runAt: r.run_at, payload: JSON.parse(r.payload) as Record<string, unknown>,
  status: r.status as Job['status'], dedupeKey: r.dedupe_key,
});

/**
 * 저장소. 모든 변경은 같은 트랜잭션 안에서 활동 이벤트를 함께 남긴다.
 * 이벤트는 커밋된 뒤에만 구독자(SSE 등)에게 알린다.
 */
export class Repo {
  readonly db: DatabaseSync;
  #stmts = new Map<string, StatementSync>();
  #listeners = new Set<(e: OfficeEvent) => void>();
  #depth = 0;
  #pending: OfficeEvent[] = [];

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  // ── 기본 ──────────────────────────────────────────────
  #stmt(sql: string): StatementSync {
    let s = this.#stmts.get(sql);
    if (!s) {
      s = this.db.prepare(sql);
      this.#stmts.set(sql, s);
    }
    return s;
  }
  #get<T>(sql: string, ...params: Param[]): T | undefined {
    return this.#stmt(sql).get(...params) as unknown as T | undefined;
  }
  #all<T>(sql: string, ...params: Param[]): T[] {
    return this.#stmt(sql).all(...params) as unknown as T[];
  }
  #run(sql: string, ...params: Param[]): number {
    return Number(this.#stmt(sql).run(...params).changes);
  }
  /** 다른 저장소 모듈(연결·학습 등)이 같은 연결·트랜잭션·이벤트를 쓰도록 공개한 도우미 */
  one<T>(sql: string, ...params: Param[]): T | undefined {
    return this.#get<T>(sql, ...params);
  }
  many<T>(sql: string, ...params: Param[]): T[] {
    return this.#all<T>(sql, ...params);
  }
  exec(sql: string, ...params: Param[]): number {
    return this.#run(sql, ...params);
  }

  tx<T>(fn: () => T): T {
    if (this.#depth > 0) {
      this.#depth++;
      try {
        return fn();
      } finally {
        this.#depth--;
      }
    }
    this.db.exec('BEGIN IMMEDIATE');
    this.#depth = 1;
    try {
      const result = fn();
      this.db.exec('COMMIT');
      this.#depth = 0;
      for (const e of this.#pending.splice(0)) this.#notify(e);
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      this.#depth = 0;
      this.#pending = [];
      throw err;
    }
  }

  onEvent(fn: (e: OfficeEvent) => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }
  #notify(e: OfficeEvent): void {
    for (const fn of this.#listeners) {
      try {
        fn(e);
      } catch (err) {
        console.error('[event listener]', err);
      }
    }
  }

  emit(type: EventType, text: string, opts: { actorId?: string | null; subjectId?: string | null; data?: Record<string, unknown> } = {}): OfficeEvent {
    const at = now();
    const data = { ...opts.data, text };
    const seq = Number(
      this.#stmt('INSERT INTO events (at, actor_id, type, subject_id, data) VALUES (?, ?, ?, ?, ?)')
        .run(at, opts.actorId ?? null, type, opts.subjectId ?? null, JSON.stringify(data)).lastInsertRowid,
    );
    const event: OfficeEvent = { seq, at, actorId: opts.actorId ?? null, type, subjectId: opts.subjectId ?? null, data };
    if (this.#depth > 0) this.#pending.push(event);
    else this.#notify(event);
    return event;
  }

  events(afterSeq: number, limit = 200): OfficeEvent[] {
    return this.#all<EventRow>('SELECT * FROM events WHERE seq > ? ORDER BY seq LIMIT ?', afterSeq, limit).map(toEvent);
  }
  recentEvents(limit: number): OfficeEvent[] {
    return this.#all<EventRow>('SELECT * FROM events ORDER BY seq DESC LIMIT ?', limit).map(toEvent).reverse();
  }
  eventsFor(subjectId: string, type: EventType): OfficeEvent[] {
    return this.#all<EventRow>('SELECT * FROM events WHERE subject_id = ? AND type = ? ORDER BY seq', subjectId, type).map(toEvent);
  }
  lastSeq(): number {
    return this.#get<{ seq: number | null }>('SELECT MAX(seq) AS seq FROM events')?.seq ?? 0;
  }

  getSetting<T>(key: string): T | null {
    const row = this.#get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
    return row ? (JSON.parse(row.value) as T) : null;
  }
  setSetting(key: string, value: unknown): void {
    this.#run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
  }
  deleteSetting(key: string): void {
    this.#run('DELETE FROM settings WHERE key = ?', key);
  }

  /** 로컬 개발용 초기화 */
  wipe(): void {
    this.tx(() => {
      for (const t of DATA_TABLES) this.db.exec(`DELETE FROM ${t}`);
      this.db.exec("DELETE FROM sqlite_sequence WHERE name IN ('events', 'runs')");
    });
  }

  // ── 사무실·프로젝트 ────────────────────────────────────
  getOffice(): Office | null {
    const r = this.#get<{ id: string; name: string; description: string; stage: number; created_at: string }>('SELECT * FROM offices LIMIT 1');
    return r ? { id: r.id, name: r.name, description: r.description, stage: Number(r.stage ?? 0), createdAt: r.created_at } : null;
  }

  /** 사무실 레벨 업 — 성장 단계를 올린다(되돌리지 않음) */
  setOfficeStage(stage: number): void {
    this.#run('UPDATE offices SET stage = ? WHERE stage < ?', stage, stage);
  }

  createOffice(name: string, description: string): { office: Office; project: Project } {
    return this.tx(() => {
      if (this.getOffice()) throw new DomainError(409, '사무실이 이미 있어요');
      const office: Office = { id: newId('of'), name, description, stage: 0, createdAt: now() };
      this.#run('INSERT INTO offices (id, name, description, created_at, stage) VALUES (?, ?, ?, ?, ?)', office.id, office.name, office.description, office.createdAt, 0);
      const project: Project = { id: newId('pj'), officeId: office.id, name: '주간 콘텐츠 운영', brief: { ...DEFAULT_BRIEF }, createdAt: now() };
      this.#run('INSERT INTO projects VALUES (?, ?, ?, ?, ?)', project.id, office.id, project.name, JSON.stringify(project.brief), project.createdAt);
      this.emit('office_created', `“${name}” 사무실을 열었어요`, { subjectId: office.id });
      return { office, project };
    });
  }

  getProject(): Project | null {
    const r = this.#get<{ id: string; office_id: string; name: string; brief: string; created_at: string }>('SELECT * FROM projects LIMIT 1');
    return r ? { id: r.id, officeId: r.office_id, name: r.name, brief: JSON.parse(r.brief) as Brief, createdAt: r.created_at } : null;
  }

  updateBrief(patch: Partial<Brief>, actorId: string | null): Project {
    return this.tx(() => {
      const project = this.getProject();
      if (!project) throw new DomainError(400, '먼저 사업을 소개해 주세요');
      const brief: Brief = { ...project.brief, ...patch };
      this.#run('UPDATE projects SET brief = ? WHERE id = ?', JSON.stringify(brief), project.id);
      this.emit('brief_updated', '사업 소개를 고쳤어요', { actorId, subjectId: project.id, data: { fields: Object.keys(patch) } });
      return { ...project, brief };
    });
  }

  // ── 직원 ──────────────────────────────────────────────
  listEmployees(): Employee[] {
    return this.#all<EmployeeRow>('SELECT * FROM employees ORDER BY hired_at').map(toEmployee);
  }
  getEmployee(id: string): Employee | null {
    const r = this.#get<EmployeeRow>('SELECT * FROM employees WHERE id = ?', id);
    return r ? toEmployee(r) : null;
  }
  employeeByRole(role: Role): Employee | null {
    const r = this.#get<EmployeeRow>('SELECT * FROM employees WHERE role = ? ORDER BY hired_at LIMIT 1', role);
    return r ? toEmployee(r) : null;
  }
  #name(id: string | null): string {
    if (!id) return '대표';
    return this.getEmployee(id)?.name ?? '알 수 없음';
  }

  insertEmployee(input: { name: string; role: Role; rank: string; style: EmployeeStyle; look: Look; profile?: EmployeeProfile }): Employee {
    return this.tx(() => {
      const office = this.getOffice();
      if (!office) throw new DomainError(400, '먼저 사업을 소개해 주세요');
      const e: Employee = { id: newId('em'), officeId: office.id, ...input, profile: input.profile ?? {}, aiProvider: null, hiredAt: now() };
      this.#run(
        'INSERT INTO employees (id, office_id, name, role, rank, style, look, hired_at, profile, ai_provider) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        e.id, e.officeId, e.name, e.role, e.rank, JSON.stringify(e.style), JSON.stringify(e.look), e.hiredAt, JSON.stringify(e.profile), null,
      );
      this.emit('employee_hired', `${ROLE_LABEL[e.role]} ${iga(e.name)} 입사했어요`, { actorId: e.id, subjectId: e.id, data: { role: e.role, rank: e.rank } });
      return e;
    });
  }

  // ── 회차 ──────────────────────────────────────────────
  activeCycle(): Cycle | null {
    const r = this.#get<CycleRow>("SELECT * FROM cycles WHERE status = 'running' ORDER BY started_at DESC LIMIT 1");
    return r ? toCycle(r) : null;
  }
  latestCycle(): Cycle | null {
    const r = this.#get<CycleRow>('SELECT * FROM cycles ORDER BY started_at DESC LIMIT 1');
    return r ? toCycle(r) : null;
  }
  getCycle(id: string): Cycle | null {
    const r = this.#get<CycleRow>('SELECT * FROM cycles WHERE id = ?', id);
    return r ? toCycle(r) : null;
  }
  cycleLabelExists(label: string): boolean {
    return !!this.#get('SELECT 1 FROM cycles WHERE label = ?', label);
  }

  createCycle(label: string, trigger: Cycle['trigger'], weekStart: string | null = null, blocks: string[] = ['content_ops']): Cycle {
    const project = this.getProject();
    if (!project) throw new DomainError(400, '먼저 사업을 소개해 주세요');
    const c: Cycle = { id: newId('cy'), projectId: project.id, label, trigger, status: 'running', startedAt: now(), endedAt: null, weekStart, blocks };
    this.#run('INSERT INTO cycles (id, project_id, label, trigger, status, started_at, ended_at, week_start, blocks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', c.id, c.projectId, c.label, c.trigger, c.status, c.startedAt, null, weekStart, JSON.stringify(blocks));
    this.emit('cycle_started', `${label} 일을 시작했어요${trigger === 'schedule' ? '(예약)' : ''}`, { subjectId: c.id, data: { label, trigger } });
    return c;
  }

  runningCycles(): Cycle[] {
    return this.#all<CycleRow>("SELECT * FROM cycles WHERE status = 'running' ORDER BY started_at").map(toCycle);
  }
  listCycles(limit = 20): Cycle[] {
    return this.#all<CycleRow>('SELECT * FROM cycles ORDER BY started_at DESC LIMIT ?', limit).map(toCycle);
  }
  /** 끝난 회차에 수정 업무가 생기면 다시 연다 */
  reopenCycle(id: string): void {
    const c = this.getCycle(id);
    if (!c || c.status === 'running') return;
    this.#run("UPDATE cycles SET status = 'running' WHERE id = ?", id);
    this.emit('cycle_started', `${c.label} 일 — 수정 작업으로 다시 열었어요`, { subjectId: id, data: { label: c.label, reopened: true } });
  }

  finishCycle(id: string, status: 'done' | 'cancelled', text: string, data: Record<string, unknown> = {}): void {
    this.#run('UPDATE cycles SET status = ?, ended_at = ? WHERE id = ?', status, now(), id);
    this.emit(status === 'done' ? 'cycle_finished' : 'cycle_cancelled', text, { subjectId: id, data });
  }

  // ── 업무 ──────────────────────────────────────────────
  createTask(input: { cycleId: string; step: string; kind: TaskKind; title: string; assigneeId: string; dependsOn: string[]; itemId: string; feedback?: string | null; meta?: Record<string, unknown> }): Task {
    const t: Task = {
      id: newId('tk'), ...input, feedback: input.feedback ?? null, meta: input.meta ?? {}, status: 'waiting', waitReason: null,
      resumeAt: null, attempts: 0, createdAt: now(), updatedAt: now(),
    };
    this.#run(
      'INSERT INTO tasks (id, cycle_id, step, kind, title, assignee_id, status, wait_reason, depends_on, item_id, feedback, resume_at, attempts, created_at, updated_at, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      t.id, t.cycleId, t.step, t.kind, t.title, t.assigneeId, t.status, null, JSON.stringify(t.dependsOn), t.itemId,
      t.feedback, null, 0, t.createdAt, t.updatedAt, JSON.stringify(t.meta),
    );
    this.emit('task_created', `${this.#name(t.assigneeId)}: ${t.title} 배정`, { actorId: t.assigneeId, subjectId: t.id, data: { cycleId: t.cycleId, step: t.step } });
    return t;
  }
  getTask(id: string): Task | null {
    const r = this.#get<TaskRow>('SELECT * FROM tasks WHERE id = ?', id);
    return r ? toTask(r) : null;
  }
  listTasks(cycleId: string): Task[] {
    return this.#all<TaskRow>('SELECT * FROM tasks WHERE cycle_id = ? ORDER BY created_at, rowid', cycleId).map(toTask);
  }
  tasksByStatus(statuses: TaskStatus[]): Task[] {
    const marks = statuses.map(() => '?').join(', ');
    return this.#all<TaskRow>(`SELECT * FROM tasks WHERE status IN (${marks})`, ...statuses).map(toTask);
  }

  /** 상태 전이. 허용되지 않은 전이는 거부한다. */
  setTaskStatus(id: string, to: TaskStatus, opts: { reason?: string | null; resumeAt?: string | null; countAttempt?: boolean } = {}): Task {
    return this.tx(() => {
      const t = this.getTask(id);
      if (!t) throw new DomainError(404, '업무를 찾을 수 없어요');
      if (!canTransition(t.status, to)) throw new DomainError(409, `‘${STATUS_DETAIL[t.status]}’ 업무는 ‘${STATUS_DETAIL[to]}’(으)로 바꿀 수 없어요`);
      const reason = opts.reason === undefined ? null : opts.reason;
      const resumeAt = opts.resumeAt === undefined ? null : opts.resumeAt;
      const attempts = t.attempts + (opts.countAttempt ? 1 : 0);
      this.#run('UPDATE tasks SET status = ?, wait_reason = ?, resume_at = ?, attempts = ?, updated_at = ? WHERE id = ?', to, reason, resumeAt, attempts, now(), id);
      const who = this.#name(t.assigneeId);
      this.emit('task_status', `${who}: ${t.title} — ${STATUS_DETAIL[to]}${reason ? ` (${reason})` : ''}`, {
        actorId: t.assigneeId, subjectId: t.id, data: { from: t.status, to, reason, cycleId: t.cycleId, kind: t.kind },
      });
      return { ...t, status: to, waitReason: reason, resumeAt, attempts };
    });
  }

  /** 상태는 그대로 두고 대기 이유만 바꾼다. 바뀔 때만 기록한다. */
  noteTask(id: string, reason: string | null): void {
    const t = this.getTask(id);
    if (!t || t.waitReason === reason) return;
    this.tx(() => {
      this.#run('UPDATE tasks SET wait_reason = ?, updated_at = ? WHERE id = ?', reason, now(), id);
      if (reason) this.emit('task_note', `${t.title}: ${reason}`, { actorId: t.assigneeId, subjectId: t.id, data: { cycleId: t.cycleId } });
    });
  }

  /** 업무 부가 정보 고치기(되묻기 · 잠듦 기록) — 상태는 setTaskStatus로 */
  updateTaskMeta(id: string, patch: Record<string, unknown>): Task | null {
    const t = this.getTask(id);
    if (!t) return null;
    const meta = { ...t.meta, ...patch };
    this.#run('UPDATE tasks SET meta = ?, updated_at = ? WHERE id = ?', JSON.stringify(meta), now(), id);
    return { ...t, meta };
  }

  setTaskResumeAt(id: string, resumeAt: string | null): void {
    this.#run('UPDATE tasks SET resume_at = ?, updated_at = ? WHERE id = ?', resumeAt, now(), id);
  }

  // ── 결과물 ────────────────────────────────────────────
  /** 결과물 저장. itemId를 주면 그 항목의 새 버전으로 저장한다(SNS 게시물처럼 한 업무가 여러 항목을 만들 때) */
  saveArtifact(task: Task, out: { title: string; body: string; sources: string[]; meta?: ArtifactMeta; itemId?: string; kind?: TaskKind }): Artifact {
    return this.tx(() => {
      const itemId = out.itemId ?? task.itemId;
      const prev = this.#get<{ v: number | null }>('SELECT MAX(version) AS v FROM artifacts WHERE item_id = ?', itemId)?.v ?? 0;
      const a: Artifact = {
        id: newId('ar'), cycleId: task.cycleId, taskId: task.id, itemId, kind: out.kind ?? task.kind, version: prev + 1,
        title: out.title, body: out.body, sources: out.sources, meta: out.meta ?? {}, createdAt: now(),
      };
      this.#run(
        'INSERT INTO artifacts (id, cycle_id, task_id, item_id, kind, version, title, body, sources, created_at, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        a.id, a.cycleId, a.taskId, a.itemId, a.kind, a.version, a.title, a.body, JSON.stringify(a.sources), a.createdAt, JSON.stringify(a.meta),
      );
      this.emit('artifact_saved', `${this.#name(task.assigneeId)}: “${a.title}” v${a.version} 저장`, {
        actorId: task.assigneeId, subjectId: a.id, data: { cycleId: a.cycleId, taskId: task.id, itemId: a.itemId, version: a.version },
      });
      return a;
    });
  }
  getArtifact(id: string): Artifact | null {
    const r = this.#get<ArtifactRow>('SELECT * FROM artifacts WHERE id = ?', id);
    return r ? toArtifact(r) : null;
  }
  latestArtifact(itemId: string): Artifact | null {
    const r = this.#get<ArtifactRow>('SELECT * FROM artifacts WHERE item_id = ? ORDER BY version DESC LIMIT 1', itemId);
    return r ? toArtifact(r) : null;
  }
  listArtifacts(cycleId: string): Artifact[] {
    return this.#all<ArtifactRow>('SELECT * FROM artifacts WHERE cycle_id = ? ORDER BY created_at', cycleId).map(toArtifact);
  }

  // ── 인계 ──────────────────────────────────────────────
  getHandoff(fromTaskId: string, toTaskId: string): Handoff | null {
    const r = this.#get<HandoffRow>('SELECT * FROM handoffs WHERE from_task_id = ? AND to_task_id = ?', fromTaskId, toTaskId);
    return r ? toHandoff(r) : null;
  }
  handoffsTo(toTaskId: string): Handoff[] {
    return this.#all<HandoffRow>('SELECT * FROM handoffs WHERE to_task_id = ?', toTaskId).map(toHandoff);
  }
  handoffsByStatus(cycleId: string, status: HandoffStatus): Handoff[] {
    return this.#all<HandoffRow>('SELECT * FROM handoffs WHERE cycle_id = ? AND status = ? ORDER BY created_at', cycleId, status).map(toHandoff);
  }

  proposeHandoff(from: Task, to: Task): Handoff {
    return this.tx(() => {
      const artifact = this.latestArtifact(from.itemId);
      const h: Handoff = {
        id: newId('ho'), cycleId: to.cycleId, fromTaskId: from.id, toTaskId: to.id, fromId: from.assigneeId,
        toId: to.assigneeId, artifactId: artifact?.id ?? null, status: 'proposed', createdAt: now(), resolvedAt: null,
      };
      this.#run('INSERT INTO handoffs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', h.id, h.cycleId, h.fromTaskId, h.toTaskId, h.fromId, h.toId, h.artifactId, h.status, h.createdAt, null);
      this.emit('handoff_proposed', `${this.#name(h.fromId)} → ${this.#name(h.toId)}: ${artifact ? `“${artifact.title}”` : from.title} 전달`, {
        actorId: h.fromId, subjectId: h.id, data: { cycleId: h.cycleId, fromId: h.fromId, toId: h.toId, toTaskId: to.id },
      });
      return h;
    });
  }

  acceptHandoff(id: string): void {
    this.tx(() => {
      const r = this.#get<HandoffRow>('SELECT * FROM handoffs WHERE id = ?', id);
      if (!r || r.status !== 'proposed') return;
      this.#run("UPDATE handoffs SET status = 'accepted', resolved_at = ? WHERE id = ?", now(), id);
      this.emit('handoff_accepted', `${this.#name(r.to_id)}: ${this.#name(r.from_id)}의 자료 확인`, {
        actorId: r.to_id, subjectId: id, data: { cycleId: r.cycle_id, fromId: r.from_id, toId: r.to_id },
      });
    });
  }

  // ── 메시지 ────────────────────────────────────────────
  message(fromId: string, toId: string | null, body: string, data: Record<string, unknown> = {}): void {
    this.emit('message', `${this.#name(fromId)}${toId ? ` → ${this.#name(toId)}` : ''}: ${body}`, {
      actorId: fromId, subjectId: toId, data: { ...data, body, fromId, toId },
    });
  }

  // ── 결정 요청 ─────────────────────────────────────────
  /** 결정 요청을 연다. 같은 항목의 열린 요청은 '다시 확인 필요'로 닫는다(새 버전 우선). */
  openDecision(input: {
    kind?: DecisionKind; cycleId: string | null; itemId?: string | null; artifactId?: string | null;
    reviewArtifactId?: string | null; title: string; payload?: Record<string, unknown>;
  }): Decision {
    // 결정 등급(결정 80) — 여는 순간 정해 payload에 남긴다
    const kind = input.kind ?? 'publish_confirm';
    input = { ...input, payload: { ...input.payload, risk: input.payload?.risk ?? riskOf(kind, input.payload ?? {}) } };
    return this.tx(() => {
      if (input.itemId) {
        for (const old of this.#all<DecisionRow>("SELECT * FROM decisions WHERE item_id = ? AND status = 'open'", input.itemId)) {
          this.resolveDecision(old.id, 'stale', '새 버전이 나와 다시 확인해요');
        }
      }
      const d: Decision = {
        id: newId('dc'), kind: input.kind ?? 'publish_confirm', cycleId: input.cycleId, title: input.title,
        itemId: input.itemId ?? null, artifactId: input.artifactId ?? null, reviewArtifactId: input.reviewArtifactId ?? null,
        payload: input.payload ?? {}, status: 'open', comment: null, scope: null, createdAt: now(), resolvedAt: null,
      };
      this.#run(
        'INSERT INTO decisions (id, cycle_id, kind, title, item_id, artifact_id, review_artifact_id, payload, status, comment, scope, created_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        d.id, d.cycleId, d.kind, d.title, d.itemId, d.artifactId, d.reviewArtifactId, JSON.stringify(d.payload), d.status, null, null, d.createdAt, null,
      );
      this.emit('decision_opened', `확인해 주세요: ${d.title}`, { subjectId: d.id, data: { cycleId: d.cycleId, kind: d.kind, artifactId: d.artifactId, risk: d.payload.risk } });
      return d;
    });
  }
  getDecision(id: string): Decision | null {
    const r = this.#get<DecisionRow>('SELECT * FROM decisions WHERE id = ?', id);
    return r ? toDecision(r) : null;
  }
  listDecisions(cycleId: string): Decision[] {
    return this.#all<DecisionRow>('SELECT * FROM decisions WHERE cycle_id = ? ORDER BY created_at', cycleId).map(toDecision);
  }
  openDecisions(): Decision[] {
    return this.#all<DecisionRow>("SELECT * FROM decisions WHERE status = 'open' ORDER BY created_at").map(toDecision);
  }
  recentDecisions(limit: number): Decision[] {
    return this.#all<DecisionRow>('SELECT * FROM decisions ORDER BY created_at DESC LIMIT ?', limit).map(toDecision);
  }
  openDecisionCount(cycleId: string): number {
    return this.#get<{ n: number }>("SELECT COUNT(*) AS n FROM decisions WHERE cycle_id = ? AND status = 'open'", cycleId)?.n ?? 0;
  }
  updateDecisionPayload(id: string, payload: Record<string, unknown>): void {
    this.#run('UPDATE decisions SET payload = ? WHERE id = ?', JSON.stringify(payload), id);
  }
  resolveDecision(id: string, status: Exclude<DecisionStatus, 'open'>, comment: string | null, scope: Decision['scope'] = null): void {
    const d = this.getDecision(id);
    if (!d) return;
    this.#run('UPDATE decisions SET status = ?, comment = ?, scope = ?, resolved_at = ? WHERE id = ?', status, comment, scope, now(), id);
    const label = { approved: '승인', rejected: '수정 요청', stale: '다시 확인 필요' }[status];
    this.emit('decision_resolved', `${d.title} — ${label}${comment ? `: ${comment}` : ''}`, { subjectId: id, data: { cycleId: d.cycleId, status, kind: d.kind } });
  }

  // ── 외부 행동(저장·게시) ───────────────────────────────
  /** 같은 키(같은 버전·같은 대상)는 한 번만 만든다. 이미 있으면 기존 기록을 돌려준다. */
  createAction(input: {
    kind: ExternalAction['kind']; decisionId: string | null; cycleId: string | null; app: string; target: string | null;
    artifactId: string; key: string; scheduledAt?: string | null; payload?: Record<string, unknown>; status?: ActionStatus;
  }): { action: ExternalAction; created: boolean } {
    const created = this.#run(
      'INSERT OR IGNORE INTO external_actions (id, kind, decision_id, cycle_id, app, target, artifact_id, idempotency_key, status, scheduled_at, attempts, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)',
      newId('ac'), input.kind, input.decisionId, input.cycleId, input.app, input.target, input.artifactId, input.key,
      input.status ?? 'pending', input.scheduledAt ?? null, JSON.stringify(input.payload ?? {}), now(), now(),
    ) > 0;
    const action = toAction(this.#get<ActionRow>('SELECT * FROM external_actions WHERE idempotency_key = ?', input.key)!);
    return { action, created };
  }
  getAction(id: string): ExternalAction | null {
    const r = this.#get<ActionRow>('SELECT * FROM external_actions WHERE id = ?', id);
    return r ? toAction(r) : null;
  }
  setActionStatus(id: string, status: ActionStatus, note: string | null, extra: { resultUrl?: string | null; externalId?: string | null; scheduledAt?: string | null; countAttempt?: boolean; silent?: boolean } = {}): void {
    const cur = this.getAction(id);
    if (!cur) return;
    this.#run(
      'UPDATE external_actions SET status = ?, note = ?, result_url = ?, external_id = ?, scheduled_at = ?, attempts = ?, updated_at = ? WHERE id = ?',
      status, note, extra.resultUrl === undefined ? cur.resultUrl : extra.resultUrl, extra.externalId === undefined ? cur.externalId : extra.externalId,
      extra.scheduledAt === undefined ? cur.scheduledAt : extra.scheduledAt, cur.attempts + (extra.countAttempt ? 1 : 0), now(), id,
    );
    if (!extra.silent) {
      this.emit('action_recorded', `${cur.target ?? cur.app}: ${note ?? status}`, { subjectId: id, data: { cycleId: cur.cycleId, status, app: cur.app, kind: cur.kind } });
    }
  }
  listActions(cycleId: string): ExternalAction[] {
    return this.#all<ActionRow>('SELECT * FROM external_actions WHERE cycle_id = ? ORDER BY COALESCE(scheduled_at, created_at)', cycleId).map(toAction);
  }
  actionsByStatus(statuses: ActionStatus[]): ExternalAction[] {
    const marks = statuses.map(() => '?').join(', ');
    return this.#all<ActionRow>(`SELECT * FROM external_actions WHERE status IN (${marks}) ORDER BY COALESCE(scheduled_at, created_at)`, ...statuses).map(toAction);
  }
  actionsForArtifact(artifactId: string): ExternalAction[] {
    return this.#all<ActionRow>('SELECT * FROM external_actions WHERE artifact_id = ? ORDER BY created_at', artifactId).map(toAction);
  }
  /** 실행 시각이 된 예약 게시를 하나 가져와 '실행 중'으로 바꾼다(두 실행기가 같은 게시를 잡지 않게). */
  claimDueAction(nowIso: string): ExternalAction | null {
    const r = this.#get<ActionRow>(
      "UPDATE external_actions SET status = 'running', attempts = attempts + 1, updated_at = ? WHERE id = (SELECT id FROM external_actions WHERE status IN ('scheduled', 'pending') AND COALESCE(scheduled_at, created_at) <= ? ORDER BY COALESCE(scheduled_at, created_at) LIMIT 1) RETURNING *",
      nowIso, nowIso,
    );
    return r ? toAction(r) : null;
  }

  // ── 사용량 ────────────────────────────────────────────
  recordUsage(input: { taskId: string; employeeId: string; provider: string; usage: Usage }): void {
    const u = input.usage;
    this.#run('INSERT INTO usage VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', newId('us'), input.taskId, input.employeeId, input.provider, u.costUsd, u.inputTokens, u.outputTokens, u.estimated ? 1 : 0, now());
  }
  usageSince(iso: string): { runs: number; costUsd: number; inputTokens: number; outputTokens: number } {
    const r = this.#get<{ runs: number; cost: number | null; inp: number | null; outp: number | null }>(
      'SELECT COUNT(*) AS runs, SUM(cost_usd) AS cost, SUM(input_tokens) AS inp, SUM(output_tokens) AS outp FROM usage WHERE at >= ?', iso,
    );
    return { runs: r?.runs ?? 0, costUsd: r?.cost ?? 0, inputTokens: r?.inp ?? 0, outputTokens: r?.outp ?? 0 };
  }
  usageForTask(taskId: string, sinceIso = ''): number {
    return this.#get<{ cost: number | null }>('SELECT SUM(cost_usd) AS cost FROM usage WHERE task_id = ? AND at >= ?', taskId, sinceIso)?.cost ?? 0;
  }
  usageByEmployeeSince(iso: string): Array<{ employeeId: string; runs: number; costUsd: number }> {
    return this.#all<{ employee_id: string; runs: number; cost: number | null }>(
      'SELECT employee_id, COUNT(*) AS runs, SUM(cost_usd) AS cost FROM usage WHERE at >= ? GROUP BY employee_id', iso,
    ).map((r) => ({ employeeId: r.employee_id, runs: r.runs, costUsd: r.cost ?? 0 }));
  }

  // ── 예약 작업 ─────────────────────────────────────────
  scheduleJob(kind: string, runAt: string, payload: Record<string, unknown>, dedupeKey: string | null): boolean {
    return this.#run('INSERT OR IGNORE INTO jobs (id, kind, run_at, payload, status, dedupe_key) VALUES (?, ?, ?, ?, ?, ?)', newId('jb'), kind, runAt, JSON.stringify(payload), 'pending', dedupeKey) > 0;
  }
  /** 실행 시각이 된 작업 하나를 원자적으로 가져온다(두 실행기가 같은 작업을 잡지 않게). */
  claimDueJob(nowIso: string): Job | null {
    const r = this.#get<JobRow>(
      "UPDATE jobs SET status = 'running', claimed_at = ? WHERE id = (SELECT id FROM jobs WHERE status = 'pending' AND run_at <= ? ORDER BY run_at LIMIT 1) RETURNING *",
      nowIso, nowIso,
    );
    return r ? toJob(r) : null;
  }
  finishJob(id: string, status: 'done' | 'failed', error: string | null = null): void {
    this.#run('UPDATE jobs SET status = ?, finished_at = ?, error = ? WHERE id = ?', status, now(), error, id);
  }
  /** 실행 도중 서버가 꺼졌던 작업을 다시 대기로 돌린다. 핸들러는 중복 실행에 안전해야 한다. */
  resetRunningJobs(): number {
    return this.#run("UPDATE jobs SET status = 'pending', claimed_at = NULL WHERE status = 'running'");
  }
  cancelPendingJobs(kind: string): number {
    // 중복 방지 키를 비워 같은 시각을 다시 예약할 수 있게 한다
    return this.#run("UPDATE jobs SET status = 'cancelled', finished_at = ?, dedupe_key = NULL WHERE kind = ? AND status = 'pending'", now(), kind);
  }
  nextJob(kind: string): Job | null {
    const r = this.#get<JobRow>("SELECT * FROM jobs WHERE kind = ? AND status = 'pending' ORDER BY run_at LIMIT 1", kind);
    return r ? toJob(r) : null;
  }
}
