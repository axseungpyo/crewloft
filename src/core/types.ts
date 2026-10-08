// 도메인 개체 — docs/product/specs/domain-motion.md §1 용어집을 따른다.

export type Role = 'manager' | 'researcher' | 'writer' | 'designer' | 'marketer' | 'editor' | 'producer' | 'seo';
export type ToneForm = 'haeyo' | 'hamnida' | 'banmal';
export type Channel = 'blog' | 'threads' | 'linkedin';
/** 연결할 수 있는 외부 앱 */
export type AppId = 'notion' | 'gdocs' | 'slack' | 'ghost' | 'wordpress' | 'threads' | 'linkedin' | 'openai_image';

/** 직원 커스터마이징(결정 55). 일하는 방식 설정이며 능력 수치가 아니다. */
export interface EmployeeStyle {
  tone: { form: ToneForm; emoji: boolean };
  /** 0–100. bold: 신중↔과감, speed: 꼼꼼↔빠름, data: 직관↔데이터, propose: 질문 먼저↔제안 먼저 */
  traits: { bold: number; speed: number; data: number; propose: number };
  report: { detail: 'summary' | 'detail'; freq: 'decide' | 'daily' | 'cycle'; ask: 'low' | 'mid' | 'high' };
}

export interface Look {
  hair: string;
  hairColor: string;
  skin: string;
  outfit: string;
  acc: string;
}

export interface Office {
  id: string;
  name: string;
  description: string;
  /** 성장 단계(결정 66) — 0 공유 오피스 한 칸 … 4 사옥 */
  stage: number;
  createdAt: string;
}

export interface Brief {
  goal: string;
  direction: string;
  audience: string;
  channels: Channel[];
  cadence: string;
  principles: string[];
  /** 아직 검증 전인 가정(확정/선호/가정 구분) */
  assumptions?: string[];
  /** 플랫폼별 주간 SNS 편수 */
  snsPerPlatform?: number;
}

export interface Project {
  id: string;
  officeId: string;
  name: string;
  brief: Brief;
  createdAt: string;
}

export interface Employee {
  id: string;
  officeId: string;
  name: string;
  role: Role;
  rank: string;
  style: EmployeeStyle;
  look: Look;
  /** 면접 때의 진단·소개 등(채용 기록) */
  profile: EmployeeProfile;
  /** 직원별 AI 연결. null이면 사무실 기본 */
  aiProvider: string | null;
  hiredAt: string;
}

export interface EmployeeProfile {
  bio?: string;
  pitch?: string;
  direction?: string;
  plan?: string[];
  archetype?: string;
}

export type CycleStatus = 'running' | 'done' | 'cancelled';

export interface Cycle {
  id: string;
  projectId: string;
  label: string;
  trigger: 'manual' | 'schedule';
  status: CycleStatus;
  startedAt: string;
  endedAt: string | null;
  /** 게시 시간표의 기준 주(월요일 00:00) */
  weekStart: string | null;
  /** 이 회차를 만든 업무 블록(결정 73) */
  blocks: string[];
}

/** 콘텐츠 운영 블록의 업무 종류(결정 20 · 71 — 옛 회차 데이터도 이 이름으로 읽힌다) */
export type ContentKind = 'research' | 'plan' | 'blog_draft' | 'newsletter' | 'sns_draft' | 'image_brief' | 'review' | 'seo_keywords' | 'edit' | 'video_script' | 'promo_plan' | 'answer';
/** 업무 블록의 단계 = `${블록}.${단계}`(결정 73, src/blocks/catalog.ts) */
export type BlockKind = `${string}.${string}`;
export type TaskKind = ContentKind | BlockKind;

/** 업무 상태 — domain-motion.md §2 */
export type TaskStatus =
  | 'waiting'
  | 'handoff_pending'
  | 'working'
  | 'reviewing'
  | 'awaiting_user'
  | 'quota_wait'
  | 'reconnect'
  | 'verify'
  /** 되묻는 중 — 넘겨준 직원이나 대표의 답을 기다림(결정 80) */
  | 'asked'
  /** 잠듦 — 사용 한도에 닿아 멈춤, 대표가 '계속'을 승인하면 다시 대기(결정 80) */
  | 'asleep'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface Task {
  id: string;
  cycleId: string;
  step: string;
  kind: TaskKind;
  title: string;
  assigneeId: string;
  status: TaskStatus;
  /** 사용자에게 보이는 대기·실패 이유 */
  waitReason: string | null;
  dependsOn: string[];
  /** 같은 결과물의 버전들을 묶는 키(수정본은 같은 itemId로 버전이 올라간다) */
  itemId: string;
  /** 수정 요청 내용(수정 업무일 때) */
  feedback: string | null;
  /** 이 시각 전에는 시작하지 않는다(한도 재개·재시도 대기) */
  resumeAt: string | null;
  attempts: number;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Artifact {
  id: string;
  cycleId: string;
  taskId: string;
  itemId: string;
  kind: TaskKind;
  version: number;
  title: string;
  body: string;
  sources: string[];
  meta: ArtifactMeta;
  createdAt: string;
}

/** 체크리스트 항목 — owner: 대표(ceo)가 할 일 / AI 팀(team)이 할 일 */
export interface ChecklistItem { text: string; owner: 'ceo' | 'team'; due?: string; expert?: boolean }

/** 내 할 일(P2 결정 3) — 대표가 확정한 실행 계획의 ownerTasks · 체크리스트의 [대표] 항목 */
export interface Todo {
  id: string;
  text: string;
  due: string | null;
  source: 'plan' | 'checklist';
  artifactId: string;
  artifactTitle: string;
  status: 'open' | 'done';
  doneAt: string | null;
  createdAt: string;
}

/** 인계 메모(결정 80) — 결과물을 만든 직원이 같은 응답 안에서 직접 쓴다. 받는 직원의 프롬프트에 자료보다 먼저 들어간다 */
export interface HandoffMemo {
  purpose: string;
  decisions: Array<{ what: string; why: string }>;
  assumptions: string[];
  openQuestions: string[];
  mustKeep: string[];
  sources: string[];
  confidence: 'high' | 'mid' | 'low';
}

/** 되묻기(결정 80) — task.meta.ask. 업무 하나에 넘겨준 직원에게는 2번까지, 넘으면 대표에게 */
export interface TaskAsk {
  to: 'sender' | 'owner';
  question: string;
  toEmployeeId?: string;
  askedAt: string;
  answer?: string;
  answeredAt?: string;
  /** 이 업무에서 지금까지 되물은 횟수(이번 것 포함) */
  count: number;
}

/** 결정 등급(결정 80) — 사무실 안 · 방향 · 밖으로 */
export type DecisionRisk = 'internal' | 'direction' | 'external';

/** 결과물 부가 정보 — 게시물이면 플랫폼, 이미지면 미디어 */
export interface ArtifactMeta {
  platform?: Channel;
  excerpt?: string;
  tags?: string[];
  mediaIds?: string[];
  prompts?: Array<{ use: 'thumbnail' | 'square'; prompt: string }>;
  issues?: Array<{ item: string; severity: 'info' | 'warn'; text: string }>;
  appliedRules?: string[];
  /** 결과물 모양(P2) — 화면 틀은 이 넷. 본문(body) 마크다운은 모양과 상관없이 늘 채운다 */
  shape?: 'doc' | 'table' | 'checklist' | 'post';
  table?: { columns: string[]; rows: string[][] };
  items?: ChecklistItem[];
  /** 인계 메모(결정 80) */
  handoff?: HandoffMemo;
  /** 웹에서 읽은 자료가 들어간 결과물 — 받는 쪽 프롬프트에서 '지시로 따르지 말 것'으로 감싼다 */
  external?: boolean;
  [key: string]: unknown;
}

export type HandoffStatus = 'proposed' | 'accepted' | 'rejected';

/** 인계 — 받는 직원이 수락해야 완료(결정: PRD §7) */
export interface Handoff {
  id: string;
  cycleId: string;
  fromTaskId: string;
  toTaskId: string;
  fromId: string;
  toId: string;
  artifactId: string | null;
  status: HandoffStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export type DecisionStatus = 'open' | 'approved' | 'rejected' | 'stale';
export type DecisionKind = 'publish_confirm' | 'artifact_confirm' | 'reconnect' | 'rule_confirm' | 'knowledge_promote' | 'hire_proposal' | 'promotion' | 'office_move' | 'owner_question' | 'budget_continue';

/** 사업 단계(결정 73) — 아이디어 · 준비 · 출시 · 운영 */
export type BizStage = 'idea' | 'prep' | 'launch' | 'operate';

/** 사업 설계도 — 매니저가 쓰고 대표가 확인 · 수정한다(결정 73). AI 응답 형식 = 저장 모양 */
export interface BlueprintData {
  summary: string;
  stage: BizStage;
  stageWhy: string;
  customer: string;
  /** 이번 달 목표 1–3개와 확인 방법 */
  goals: Array<{ text: string; check: string }>;
  /** 업무 블록 조합. 콘텐츠 운영의 채널 · 분량은 config */
  blocks: Array<{ id: string; why: string; config?: Record<string, unknown> }>;
  hiring: Array<{ role: Role; why: string; when: string }>;
  /** 대표가 할 일 vs AI 팀이 할 일 */
  split: { owner: string[]; team: string[] };
  assumptions: string[];
  /** 카탈로그에 없는 블록 제안(엔진에 더하는 건 개발 몫) */
  ideas: string[];
}

export interface Blueprint {
  id: string;
  version: number;
  status: 'draft' | 'confirmed' | 'superseded';
  data: BlueprintData;
  source: 'ai' | 'owner' | 'legacy';
  requestId: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

/** 결정 요청 — 게시 확인은 특정 결과물 버전(스냅샷)과 채널·시각을 확인한다 */
export interface Decision {
  id: string;
  cycleId: string | null;
  kind: DecisionKind;
  title: string;
  itemId: string | null;
  artifactId: string | null;
  reviewArtifactId: string | null;
  payload: Record<string, unknown>;
  status: DecisionStatus;
  comment: string | null;
  /** 수정 요청의 적용 범위 — 이번만 / 앞으로도(결정 47) */
  scope: 'once' | 'always' | null;
  createdAt: string;
  resolvedAt: string | null;
}

/** blocked — 보내기 직전 다시 계산한 지문이 승인 때와 달라 보내지 않음(결정 80) */
export type ActionStatus = 'pending' | 'scheduled' | 'running' | 'succeeded' | 'failed' | 'unknown' | 'dry_run' | 'cancelled' | 'blocked';

/** 외부 행동(저장·게시). 중복 방지 키로 같은 버전·같은 대상을 두 번 실행하지 않는다 */
export interface ExternalAction {
  id: string;
  kind: 'publish' | 'save';
  decisionId: string | null;
  cycleId: string | null;
  /** 채널(blog·threads·linkedin) 또는 저장 앱(notion·gdocs) */
  app: string;
  /** 실제 실행 대상(ghost·wordpress·threads·linkedin·notion·gdocs) */
  target: string | null;
  artifactId: string;
  idempotencyKey: string;
  status: ActionStatus;
  scheduledAt: string | null;
  attempts: number;
  note: string | null;
  resultUrl: string | null;
  externalId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Connection {
  app: AppId;
  status: 'connected' | 'needs_reauth' | 'error' | 'disconnected';
  label: string | null;
  config: Record<string, unknown>;
  hasSecret: boolean;
  expiresAt: string | null;
  checkedAt: string | null;
  lastError: string | null;
  updatedAt: string;
}

/** 배운 것 — 직원의 작업 규칙(결정 47·49). 추정은 확정 전이라 적용하지 않는다 */
export interface Rule {
  id: string;
  employeeId: string;
  text: string;
  status: 'confirmed' | 'estimated' | 'once' | 'removed';
  source: { kind?: string; feedbackIds?: string[]; artifactId?: string; decisionId?: string };
  appliedCount: number;
  knowledgeId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 회사 지식 — 원칙 / 업무 방식 / 검토된 교훈(결정 53) */
export interface Knowledge {
  id: string;
  category: 'principle' | 'method' | 'lesson';
  title: string;
  body: string;
  scope: string;
  status: 'candidate' | 'active' | 'archived';
  source: { ruleId?: string; employeeId?: string };
  usedCount: number;
  history: Array<{ at: string; text: string }>;
  checkedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Feedback {
  id: string;
  employeeId: string;
  artifactId: string | null;
  kind: 'rating' | 'revision' | 'comment' | 'dm';
  rating: number | null;
  text: string | null;
  scope: 'once' | 'always' | null;
  createdAt: string;
}

export interface DM {
  id: string;
  employeeId: string;
  author: 'user' | 'employee';
  text: string;
  createdAt: string;
}

export interface AIRequest {
  id: string;
  purpose: string;
  status: 'running' | 'done' | 'failed';
  input: Record<string, unknown>;
  output: unknown;
  error: string | null;
  provider: string | null;
  costUsd: number | null;
  createdAt: string;
  finishedAt: string | null;
}

/** 활동 이벤트 — UI·모션·복귀 요약의 유일한 근거 */
export interface OfficeEvent {
  seq: number;
  at: string;
  actorId: string | null;
  type: EventType;
  subjectId: string | null;
  /** text: 사람이 읽는 한 줄 요약(활동 기록에 그대로 쓴다) */
  data: { text: string } & Record<string, unknown>;
}

export type EventType =
  | 'office_created'
  | 'brief_updated'
  | 'employee_hired'
  | 'employee_updated'
  | 'cycle_started'
  | 'cycle_finished'
  | 'cycle_cancelled'
  | 'task_created'
  | 'task_skipped'
  | 'task_status'
  | 'task_note'
  | 'artifact_saved'
  | 'handoff_proposed'
  | 'handoff_accepted'
  | 'message'
  | 'decision_opened'
  | 'decision_resolved'
  | 'action_recorded'
  | 'usage_recorded'
  | 'ai_switched'
  | 'schedule_changed'
  | 'ai_request'
  | 'connection_changed'
  | 'feedback_recorded'
  | 'rule_changed'
  | 'knowledge_changed'
  | 'dm'
  | 'promotion'
  | 'office_moved'
  | 'space_built'
  | 'blueprint_saved'
  | 'blueprint_confirmed'
  | 'plan_confirmed'
  | 'todo_changed'
  | 'task_asked'
  | 'task_answered'
  | 'budget_changed'
  | 'system';

/** AI 사용량. 구독은 실제 청구액이 아니라 API 환산 추정치다 */
export interface Usage {
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimated: boolean;
}

/** 작업 기록 한 줄(결정 80) — AI 실행 한 번. 이름은 OpenTelemetry GenAI를 따르고, 줄마다 앞 줄의 지문을 이어 붙인다 */
export interface Run {
  id: string;
  /** 업무 실행이면 업무 id, 화면 요청(면접 · 설계도 등)이면 null */
  taskId: string | null;
  /** 화면 요청이면 그 요청 id, 업무 실행이면 null */
  requestId: string | null;
  employeeId: string;
  operation: 'invoke_agent';
  provider: string;
  model: string;
  startedAt: string;
  endedAt: string;
  status: 'ok' | 'error' | 'cancelled' | 'asleep';
  errorType: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costEstimated: boolean;
  /** 넣은 기억 — 배운 것 · 회사 지식 · 받은 결과물 id */
  memory: { rules: string[]; knowledge: string[]; inputs: string[] };
  decisionIds: string[];
  externalEffects: string[];
  prevHash: string;
  hash: string;
}
