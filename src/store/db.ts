import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// R0는 소유자 1명·사무실 1개·프로젝트 1개. 단일 파일 SQLite로 충분하다.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS offices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  office_id TEXT NOT NULL REFERENCES offices(id),
  name TEXT NOT NULL,
  brief TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  office_id TEXT NOT NULL REFERENCES offices(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  rank TEXT NOT NULL,
  style TEXT NOT NULL,
  look TEXT NOT NULL,
  hired_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cycles (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  label TEXT NOT NULL,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES cycles(id),
  step TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  assignee_id TEXT NOT NULL REFERENCES employees(id),
  status TEXT NOT NULL,
  wait_reason TEXT,
  depends_on TEXT NOT NULL,
  item_id TEXT NOT NULL,
  feedback TEXT,
  resume_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tasks_cycle ON tasks(cycle_id);
CREATE INDEX IF NOT EXISTS tasks_status ON tasks(status);
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES cycles(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  item_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sources TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (item_id, version)
);
CREATE TABLE IF NOT EXISTS handoffs (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES cycles(id),
  from_task_id TEXT NOT NULL REFERENCES tasks(id),
  to_task_id TEXT NOT NULL REFERENCES tasks(id),
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  artifact_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE (from_task_id, to_task_id)
);
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES cycles(id),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  item_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL REFERENCES artifacts(id),
  review_artifact_id TEXT,
  status TEXT NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS external_actions (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL REFERENCES decisions(id),
  cycle_id TEXT NOT NULL,
  app TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  note TEXT,
  result_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS usage (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  cost_usd REAL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated INTEGER NOT NULL,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  run_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  dedupe_key TEXT UNIQUE,
  claimed_at TEXT,
  finished_at TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS jobs_due ON jobs(status, run_at);
CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_id TEXT,
  type TEXT NOT NULL,
  subject_id TEXT,
  data TEXT NOT NULL
);
`;

/** v2 — MVP: 비게시 결정, 저장·게시 실행 기록, 연결, 학습·지식, AI 요청, 미디어, 세션 */
const V2 = `
CREATE TABLE decisions_v2 (
  id TEXT PRIMARY KEY,
  cycle_id TEXT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  item_id TEXT,
  artifact_id TEXT,
  review_artifact_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL,
  comment TEXT,
  scope TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
INSERT INTO decisions_v2 (id, cycle_id, kind, title, item_id, artifact_id, review_artifact_id, status, comment, created_at, resolved_at)
  SELECT id, cycle_id, kind, title, item_id, artifact_id, review_artifact_id, status, comment, created_at, resolved_at FROM decisions;
DROP TABLE decisions;
ALTER TABLE decisions_v2 RENAME TO decisions;
CREATE INDEX decisions_status ON decisions(status);

CREATE TABLE external_actions_v2 (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  decision_id TEXT,
  cycle_id TEXT,
  app TEXT NOT NULL,
  target TEXT,
  artifact_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  scheduled_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  result_url TEXT,
  external_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO external_actions_v2 (id, kind, decision_id, cycle_id, app, artifact_id, idempotency_key, status, note, result_url, created_at, updated_at)
  SELECT id, 'publish', decision_id, cycle_id, app, artifact_id, idempotency_key, status, note, result_url, created_at, updated_at FROM external_actions;
DROP TABLE external_actions;
ALTER TABLE external_actions_v2 RENAME TO external_actions;
CREATE INDEX actions_due ON external_actions(status, scheduled_at);

ALTER TABLE artifacts ADD COLUMN meta TEXT NOT NULL DEFAULT '{}';
ALTER TABLE tasks ADD COLUMN meta TEXT NOT NULL DEFAULT '{}';
ALTER TABLE employees ADD COLUMN profile TEXT NOT NULL DEFAULT '{}';
ALTER TABLE employees ADD COLUMN ai_provider TEXT;
ALTER TABLE cycles ADD COLUMN week_start TEXT;

CREATE TABLE ai_requests (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL,
  input TEXT NOT NULL,
  output TEXT,
  error TEXT,
  provider TEXT,
  cost_usd REAL,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE connections (
  app TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  label TEXT,
  config TEXT NOT NULL DEFAULT '{}',
  secret TEXT,
  expires_at TEXT,
  checked_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  anchor TEXT NOT NULL,
  quote TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  artifact_id TEXT,
  kind TEXT NOT NULL,
  rating INTEGER,
  text TEXT,
  scope TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE rules (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '{}',
  applied_count INTEGER NOT NULL DEFAULT 0,
  knowledge_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE knowledge (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '{}',
  used_count INTEGER NOT NULL DEFAULT 0,
  history TEXT NOT NULL DEFAULT '[]',
  checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE dms (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  author TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX dms_employee ON dms(employee_id, created_at);
CREATE TABLE media (
  id TEXT PRIMARY KEY,
  artifact_id TEXT,
  use TEXT NOT NULL,
  file TEXT NOT NULL,
  mime TEXT NOT NULL,
  public_token TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
`;

/** 순서대로 적용하는 스키마 버전. 이미 적용된 버전은 건너뛴다. */
/** v3 — 성장형 오피스 단계(결정 66). 기존 사무실은 0단계(공유 오피스 한 칸)에서 시작한다 */
const V3 = `ALTER TABLE offices ADD COLUMN stage INTEGER NOT NULL DEFAULT 0;`;

/** v4 — 짓기 기록(실적 자원을 쓴 내역, 결정 68). 번 자원은 기록에서 계산하므로 저장하지 않는다 */
const V4 = `CREATE TABLE builds (id TEXT PRIMARY KEY, kind TEXT NOT NULL, target TEXT NOT NULL, cost TEXT NOT NULL, created_at TEXT NOT NULL);`;

/** v5 — 대표가 들인 시간(결정 72). 화면이 보이고 움직임이 있을 때만, 영역 · 날짜 · 회차별 초만 모은다(내용은 저장 안 함) */
const V5 = `CREATE TABLE owner_time (day TEXT NOT NULL, area TEXT NOT NULL, cycle_id TEXT NOT NULL DEFAULT '', seconds INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, area, cycle_id));`;

/** v6 — 계정(결정 74): 이메일 · 비밀번호 / 구글. 세션은 계정에 묶인다. 메일 링크(가입 확인 · 비밀번호 재설정)는 해시만 저장 */
const V6 = `CREATE TABLE accounts (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT, password_hash TEXT, google_sub TEXT UNIQUE, email_verified INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE auth_tokens (hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, kind TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT);
ALTER TABLE sessions ADD COLUMN account_id TEXT;`;

/** v7 — 사업 설계도(결정 73): 버전마다 한 줄, 확정은 하나. 회차는 어떤 업무 블록으로 만들었는지 남긴다(지금까지는 모두 콘텐츠 운영) */
const V7 = `CREATE TABLE blueprints (id TEXT PRIMARY KEY, version INTEGER NOT NULL UNIQUE, status TEXT NOT NULL, data TEXT NOT NULL, source TEXT NOT NULL, request_id TEXT, created_at TEXT NOT NULL, confirmed_at TEXT);
ALTER TABLE cycles ADD COLUMN blocks TEXT NOT NULL DEFAULT '[]';
UPDATE cycles SET blocks = '["content_ops"]';`;

/** v8 — 내 할 일(P2 결정 3): 대표가 확정한 실행 계획의 ownerTasks · 체크리스트의 [대표] 항목. 체크는 대표가, 주간 회고가 진행을 읽는다 */
const V8 = `CREATE TABLE owner_todos (id TEXT PRIMARY KEY, text TEXT NOT NULL, due TEXT, source TEXT NOT NULL, artifact_id TEXT NOT NULL, item_id TEXT NOT NULL, status TEXT NOT NULL, done_at TEXT, created_at TEXT NOT NULL);
CREATE INDEX owner_todos_status ON owner_todos(status, created_at);`;

/** v9 — 작업 기록(결정 80): AI 실행 한 번마다 한 줄. 이름은 OpenTelemetry GenAI를 따르고, 줄마다 앞 줄의 지문(prev_hash)을 이어 붙여 고친 흔적이 드러난다.
 * usage 표는 화면 집계용으로 그대로 함께 쓴다(docs/tech/architecture.md). 되묻기 · 잠듦 · 결정 등급 · 승인 지문은 기존 JSON 칸(meta · payload)에 담는다 */
const V9 = `CREATE TABLE runs (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  task_id TEXT,
  request_id TEXT,
  employee_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  status TEXT NOT NULL,
  error_type TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  cost_estimated INTEGER NOT NULL,
  memory TEXT NOT NULL DEFAULT '{}',
  decision_ids TEXT NOT NULL DEFAULT '[]',
  external_effects TEXT NOT NULL DEFAULT '[]',
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);
CREATE INDEX runs_task ON runs(task_id, seq);`;

const MIGRATIONS: readonly string[] = [SCHEMA, V2, V3, V4, V5, V6, V7, V8, V9];

export const DATA_TABLES = [
  'events', 'jobs', 'usage', 'external_actions', 'decisions', 'handoffs', 'artifacts', 'tasks', 'cycles',
  'employees', 'projects', 'offices', 'settings', 'ai_requests', 'connections', 'comments', 'feedback',
  'rules', 'knowledge', 'dms', 'media', 'sessions', 'builds', 'owner_time', 'auth_tokens', 'accounts', 'blueprints', 'owner_todos', 'runs',
] as const;

function migrate(db: DatabaseSync, dataDir: string): void {
  const current = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  // 이전 전에 지금 상태를 한 파일로 남긴다 — 이전이 잘못되면 이 파일로 되돌린다
  if (current > 0 && current < MIGRATIONS.length) {
    const bak = path.join(dataDir, `office.db.v${current}.bak`);
    if (!existsSync(bak)) db.prepare('VACUUM INTO ?').run(bak);
  }
  for (let v = current + 1; v <= MIGRATIONS.length; v++) {
    // 표를 다시 만드는 이전이 있어 외래 키 검사를 잠시 끈다(트랜잭션 밖에서만 바꿀 수 있음)
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v - 1]!);
      db.exec(`PRAGMA user_version = ${v}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`스키마 v${v} 적용 실패: ${(err as Error).message}`);
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
  }
}

export function openDb(dataDir: string): DatabaseSync {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'office.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
  migrate(db, dataDir);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}
