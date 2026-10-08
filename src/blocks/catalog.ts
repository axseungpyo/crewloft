// 업무 블록 카탈로그(결정 73) — 검증된 블록을 엔진이 갖고, 매니저(AI)가 사업 · 단계 · 목표에 맞춰 고른다.
// 블록마다 지시문 · 응답 형식 · 확인 지점을 여기서 관리한다. 블록을 더하는 건 개발 몫(설계도의 '새 블록 제안'으로 모은다).
import { ROLE_LABEL, WEEKLY_STEPS } from '../core/roles.ts';
import type { BizStage, Role, TaskKind } from '../core/types.ts';

export interface BlockStep {
  step: string;
  role: Role;
  title: string;
  guide: string;
  /** 같은 블록 안에서 먼저 끝나야 하는 단계 */
  deps?: string[];
  /** 끝나면 바로 대표의 '결과물 확인'을 연다 */
  confirm?: 'owner';
  /** 조사 계열만 웹 검색 · 읽기 */
  tools?: string[];
  /** 이번 달 실행 계획을 쓰는 단계 — 응답에 주차별 블록 · 대표 할 일이 들어간다 */
  plan?: boolean;
  /** 결과물 모양(P2 결정 1 · 2) — 없으면 doc. 대표가 바로 고치고 체크할 것만 table · checklist로 구조화한다 */
  shape?: 'table' | 'checklist';
}

/** 결과물 모양 — doc(마크다운) · table · checklist · post(콘텐츠 운영). 본문 마크다운은 모양과 상관없이 늘 함께 저장한다 */
export type ArtifactShape = 'doc' | 'table' | 'checklist' | 'post';

export interface BlockDef {
  id: string;
  name: string;
  purpose: string;
  stages: readonly BizStage[] | 'any';
  cadence: 'once' | 'weekly' | 'monthly';
  /** 회차가 알아서 넣는 블록(킥오프 · 회고 · 월 계획) — 설계도에서 고르지 않는다 */
  system?: boolean;
  steps: readonly BlockStep[];
  /** 법 · 세무 · 인허가 — '확인 필요(전문가)' 표시 필수 */
  sensitive?: boolean;
  /** 앞 블록 — 이번 회차에 없으면 가장 최근 결과물을 받는다 */
  needs?: readonly string[];
  /** 한 번 돌 때 AI 요청 수(설계도 화면의 예상치) */
  aiRequests: number;
  /** 지시문 버전 → 결과물 meta.prompt = `${id}@${version}` */
  version: number;
}

export const STAGE_LABEL: Record<BizStage, string> = { idea: '아이디어', prep: '준비 중', launch: '막 출시', operate: '운영 중' };
export const BIZ_STAGES: readonly BizStage[] = ['idea', 'prep', 'launch', 'operate'];

const NO_INVENT = '숫자 · 시장 규모 · 후기 · 가격을 지어내지 않는다. 확인하지 못한 내용은 그 문장 끝에 "(가정)"을 붙이고 assumptions에도 적는다.';
const PLAN_GUIDE = [
  '사업 설계도와 받은 자료를 바탕으로 쓰세요.',
  'body(마크다운)는 이 순서로: "## 사업 진단"(지금 단계 · 강점 · 가장 큰 위험 3가지 · 먼저 검증할 가정), "## 이번 달 목표"(확인할 수 있는 목표 1–3개와 확인 방법), "## 주차별 계획"(표: 주차 · 목표 · 업무 블록 · 담당), "## 대표가 직접 할 일", "## 아직 가정인 것".',
  'weeks에는 1–4주차를 넣고, 주마다 goal(한 줄)과 blocks(아래 "고를 수 있는 업무 블록"의 id만, 주마다 1–3개)를 쓰세요. 아직 채용되지 않은 직무가 맡는 블록은 채용 순서를 생각해 뒤 주차에 두세요.',
  'ownerTasks에는 AI가 대신할 수 없어 대표가 직접 해야 하는 일(만날 사람 · 결정할 것 · 직접 확인할 것)을 3–6개 쓰세요.',
  NO_INVENT,
].join('\n');

export const BLOCKS: readonly BlockDef[] = [
  {
    id: 'kickoff', name: '사업 진단 · 이번 달 실행 계획', purpose: '설계도를 실제 한 달 계획으로 — 대표의 첫 확인', stages: 'any', cadence: 'once', system: true, aiRequests: 1, version: 1,
    steps: [{ step: 'plan', role: 'manager', title: '사업 진단 · 이번 달 실행 계획', confirm: 'owner', plan: true, guide: PLAN_GUIDE }],
  },
  {
    id: 'monthly_plan', name: '다음 달 실행 계획', purpose: '지난 한 달의 회고로 다음 4주를 다시 짠다', stages: 'any', cadence: 'monthly', system: true, aiRequests: 1, version: 1, needs: ['weekly_retro'],
    steps: [{ step: 'plan', role: 'manager', title: '다음 달 실행 계획', confirm: 'owner', plan: true, guide: `지난 실행 계획과 주간 회고를 읽고 무엇이 됐고 무엇이 안 됐는지 먼저 정리한 뒤, 다음 4주를 다시 계획하세요.\n${PLAN_GUIDE}` }],
  },
  {
    id: 'weekly_retro', name: '주간 회고 · 다음 주 준비', purpose: '이번 주 결과를 정리하고 다음 주를 준비', stages: 'any', cadence: 'weekly', system: true, aiRequests: 1, version: 1,
    steps: [{ step: 'retro', role: 'manager', title: '주간 회고 · 다음 주 준비', guide: '이번 회차 결과물을 읽고 짧게 정리하세요: "## 한 일", "## 배운 것", "## 막힌 것"(채용 전이라 건너뛴 일 포함), "## 다음 주에 할 것", "## 대표님께 확인받을 것". 항목마다 1–3줄.' }],
  },
  {
    id: 'problem_canvas', name: '문제 · 가설 한 장', purpose: '누구의 어떤 문제를 어떻게 풀지 한 장으로 — 검증할 가설을 뽑는다', stages: ['idea', 'prep'], cadence: 'once', aiRequests: 1, version: 2,
    steps: [{ step: 'canvas', role: 'manager', title: '문제 · 가설 한 장', shape: 'table', guide: `table에 columns ["칸", "내용"]으로, rows에 고객 · 고객의 문제 · 지금 쓰는 대안 · 우리 해결책 · 고객이 우리를 고를 이유 · 핵심 가설 3개 · 가설마다 검증 방법과 성공 기준을 한 줄씩 쓰세요. body에는 같은 표를 마크다운 표로 쓰고, 표 아래에 "가장 먼저 검증할 것" 한 줄. ${NO_INVENT}` }],
  },
  {
    id: 'market_research', name: '시장 · 경쟁 조사', purpose: '고객 · 경쟁 · 대안을 조사해 들어갈 자리를 찾는다', stages: ['idea', 'prep', 'launch'], cadence: 'once', aiRequests: 1, version: 1,
    steps: [{ step: 'report', role: 'researcher', title: '시장 · 경쟁 조사', tools: ['WebSearch', 'WebFetch'], guide: `고객 · 시장 · 경쟁 상황을 조사하세요. body: "## 경쟁 · 대안"(표: 이름 · 무엇을 파는지 · 가격대(확인한 것만) · 강점 · 빈틈, 3–6개), "## 고객이 지금 문제를 푸는 방법", "## 우리에게 열린 기회"(2–3개), "## 더 확인할 것". 웹 검색 도구가 있으면 쓰고 확인한 URL만 sources에. ${NO_INVENT}` }],
  },
  {
    id: 'customer_interview', name: '고객 인터뷰 질문지 · 정리표', purpose: '대표가 직접 고객 후보를 만나 가설을 확인하게 돕는다', stages: ['idea', 'prep', 'launch'], cadence: 'once', aiRequests: 1, version: 1, needs: ['problem_canvas'],
    steps: [{ step: 'guide', role: 'researcher', title: '고객 인터뷰 질문지 · 정리표', guide: '대표가 고객 후보 5명과 나눌 인터뷰를 준비하세요. body: "## 누구를 어디서 만날까"(3가지 방법), "## 질문지"(10개 이내 — 과거에 실제로 한 행동을 묻고, 유도 질문 · 우리 아이디어 설명은 피한다), "## 인터뷰 뒤 정리표"(표 틀: 질문 × 응답자 1–5 · 패턴 칸), "## 이런 답이면 가설이 맞아요 / 틀려요". 인터뷰는 대표가 직접 해요.' }],
  },
  {
    id: 'pricing', name: '가격 · 원가 계산', purpose: '원가 · 가격 후보 · 마진 · 손익분기를 표로', stages: ['prep', 'launch', 'operate'], cadence: 'once', aiRequests: 1, version: 2,
    steps: [{ step: 'calc', role: 'manager', title: '가격 · 원가 계산', confirm: 'owner', shape: 'table', guide: `table에는 원가 표를 columns ["항목", "단위", "비용", "메모"]로 쓰세요(대표가 알려 준 숫자만, 없으면 비용 칸에 "대표 확인"). body: "## 원가"(표: 항목 · 단위 · 비용 — 대표가 알려 준 숫자만 쓰고, 없으면 빈칸에 "대표 확인"), "## 가격 후보"(2–3개, 후보마다 마진 계산식), "## 손익분기"(한 달 고정비가 있으면 몇 개를 팔아야 하는지 — 계산식을 보여 준다), "## 확인할 가정". 예시 숫자를 쓸 땐 반드시 "(가정) 예시"라고 적는다. ${NO_INVENT}` }],
  },
  {
    id: 'prep_checklist', name: '준비 체크리스트', purpose: '출시까지 할 일 — 대표 몫과 팀 몫, 인허가 · 도구 · 공급처', stages: ['prep', 'launch'], cadence: 'once', sensitive: true, aiRequests: 1, version: 2,
    steps: [{ step: 'list', role: 'manager', title: '준비 체크리스트', confirm: 'owner', shape: 'checklist', guide: '출시 전까지 할 일을 체크리스트로 쓰세요. items에 항목마다 text · owner(대표가 직접 하면 "ceo", AI 팀이 하면 "team") · due(언제까지, 예: "2주차" — 모르면 빈 문자열) · expert(전문가 확인이 필요하면 true)를 넣으세요. body: 단계별 "## " 소제목 아래 "- [ ] [대표] …" / "- [ ] [팀] …" 형식, 항목마다 언제까지(주차). 인허가 · 세무 · 법률 · 위생 같은 항목은 내용을 지어내지 말고 "확인 필요(전문가)"라고만 쓰고 어디에 물어볼지(기관 · 전문가 종류)를 적은 뒤 expertCheck에도 넣는다.' }],
  },
  {
    id: 'landing_copy', name: '랜딩 페이지 · 소개 문구', purpose: '한 줄 소개 · 헤드라인 · 섹션 문구 — 첫 고객에게 보여 줄 말', stages: ['prep', 'launch', 'operate'], cadence: 'once', aiRequests: 1, version: 1, needs: ['problem_canvas', 'market_research'],
    steps: [{ step: 'copy', role: 'writer', title: '랜딩 페이지 · 소개 문구', confirm: 'owner', guide: `body: "## 한 줄 소개", "## 헤드라인 후보"(3개), "## 섹션별 문구"(문제 · 해결 · 어떻게 이용하나 · 가격 · 신청/문의 · 자주 묻는 질문), "## 행동 유도 문구"(2개). 확인 안 된 수치 · 후기 · 수상 경력은 쓰지 않는다. ${NO_INVENT}` }],
  },
  {
    id: 'first_customers', name: '첫 고객 확보 계획', purpose: '첫 고객 10명을 만날 채널과 2주 실험', stages: ['launch', 'operate'], cadence: 'once', aiRequests: 1, version: 1, needs: ['landing_copy'],
    steps: [{ step: 'plan', role: 'marketer', title: '첫 고객 확보 계획', guide: `body: "## 채널"(3–5개: 왜 이 채널인지 · 첫 행동 · 드는 시간과 비용), "## 메시지 초안"(채널별 1개), "## 2주 실험"(무엇을 · 언제 · 성공 기준), "## 대표가 직접 할 일". 반응 · 전환 수치를 지어내지 않는다. 밖으로 올리거나 보내는 일은 하지 않는다(초안만).` }],
  },
  {
    id: 'content_ops', name: '콘텐츠 운영', purpose: '매주 조사 → 기획 → 블로그 · 뉴스레터 · SNS → 검수 → 게시 확인', stages: ['launch', 'operate'], cadence: 'weekly', aiRequests: WEEKLY_STEPS.length, version: 1,
    steps: [], // 단계는 WEEKLY_STEPS(옛 업무 종류 그대로) — cycle.ts가 펼친다
  },
];

const BY_ID = new Map(BLOCKS.map((b) => [b.id, b]));
export const blockById = (id: string): BlockDef | undefined => BY_ID.get(id);
/** 대표가 설계도에서 고르는 블록 */
export const WORK_BLOCKS: readonly BlockDef[] = BLOCKS.filter((b) => !b.system);
export const WORK_BLOCK_IDS: readonly string[] = WORK_BLOCKS.map((b) => b.id);
export const isBlockKind = (kind: string): boolean => kind.includes('.');

/** 업무 종류의 결과물 모양 — 블록 단계는 카탈로그대로, 콘텐츠 운영 업무는 post */
export function shapeOfKind(kind: TaskKind | string): ArtifactShape {
  if (!isBlockKind(kind)) return 'post';
  return stepOfKind(kind)?.step.shape ?? 'doc';
}

/** `${블록}.${단계}` → 블록과 단계 */
export function stepOfKind(kind: TaskKind | string): { block: BlockDef; step: BlockStep } | null {
  const [id, name] = kind.split('.');
  const block = id ? BY_ID.get(id) : undefined;
  const step = block?.steps.find((s) => s.step === name);
  return block && step ? { block, step } : null;
}

/** 블록을 돌리는 데 필요한 직무 */
export function blockRoles(b: BlockDef): Role[] {
  const roles = b.id === 'content_ops' ? WEEKLY_STEPS.map((s) => s.role) : b.steps.map((s) => s.role);
  return [...new Set(roles)];
}

/** 화면 · 프롬프트용 요약 */
export const blockSummary = (b: BlockDef) => ({
  id: b.id, name: b.name, purpose: b.purpose, roles: blockRoles(b), stages: b.stages, cadence: b.cadence,
  sensitive: b.sensitive === true, aiRequests: b.aiRequests, confirm: b.steps.some((s) => s.confirm === 'owner'),
  shape: (b.id === 'content_ops' ? 'post' : b.steps[0]?.shape ?? 'doc') as ArtifactShape, system: b.system === true,
});

export function catalogLines(blocks: readonly BlockDef[] = WORK_BLOCKS): string[] {
  return blocks.map((b) => `- ${b.id}: ${b.name} — ${b.purpose} (담당: ${blockRoles(b).map((r) => ROLE_LABEL[r]).join(' · ')}, 맞는 단계: ${b.stages === 'any' ? '모두' : b.stages.map((s) => STAGE_LABEL[s]).join(' · ')}${b.sensitive ? ', 전문가 확인 필요 항목 있음' : ''})`);
}

/** 단계별 기본 블록 — AI가 카탈로그 밖의 블록만 냈을 때 */
export const STAGE_DEFAULT_BLOCKS: Record<BizStage, string[]> = {
  idea: ['problem_canvas', 'market_research', 'customer_interview'],
  prep: ['market_research', 'pricing', 'prep_checklist'],
  launch: ['landing_copy', 'first_customers', 'pricing'],
  operate: ['first_customers', 'content_ops'],
};

/** S1 도크 · 회차 보드의 칸(조사 · 기획 · 작성 · 이미지 · 검수) — 블록 업무는 담당 직무로 나눈다 */
export function flowKeyOf(kind: string): string | null {
  if (!isBlockKind(kind)) return null;
  const s = stepOfKind(kind);
  if (!s) return 'plan';
  if (s.block.id === 'weekly_retro') return 'review';
  return ({ researcher: 'research', seo: 'research', manager: 'plan', writer: 'write', editor: 'write', marketer: 'write', designer: 'image', producer: 'image' } as const)[s.step.role];
}
