// 사업 인터뷰 · 사업 설계도(결정 73) — 매니저가 대표의 사업을 이해하고 그에 맞춰 팀 · 업무를 짠다
import { BIZ_STAGES, WORK_BLOCK_IDS, catalogLines } from '../blocks/catalog.ts';
import { STAFF_ROLES, roleTitle } from '../core/roles.ts';
import type { BlueprintData, Employee, Office } from '../core/types.ts';
import { VOICE, toneLine, workRules } from './prompts.ts';
import type { CompleteRequest } from './provider.ts';

const STR = { type: 'string' } as const;
const strArr = { type: 'array', items: STR } as const;
const obj = (properties: Record<string, unknown>): Record<string, unknown> => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

/** 사업 인터뷰의 뼈대 — 질문은 고정, AI는 이 사업에 맞는 말과 선택지만 만든다(예측 · 테스트 가능) */
export const SETUP_KEYS = ['stage', 'customer', 'blocker', 'goal', 'assets', 'keep'] as const;
export type SetupKey = (typeof SETUP_KEYS)[number];
export const SETUP_DEFAULTS: Record<SetupKey, { text: string; options: string[] }> = {
  stage: { text: '지금 어느 단계예요?', options: ['아이디어만 있어요', '준비하고 있어요', '막 시작했어요', '이미 운영 중이에요'] },
  customer: { text: '누구에게 무엇을 팔려고 하세요?', options: [] },
  blocker: { text: '지금 가장 막히는 게 뭐예요?', options: ['무엇부터 할지 모르겠어요', '고객이 원하는지 모르겠어요', '가격을 못 정했어요', '알릴 방법을 모르겠어요'] },
  goal: { text: '이번 달 꼭 이루고 싶은 것 하나는요?', options: [] },
  assets: { text: '쓸 수 있는 시간 · 예산 · 채널 · 기술이 있나요?', options: ['주 10시간 정도', '예산은 거의 없어요', 'SNS 계정이 있어요', '관련 경력이 있어요'] },
  keep: { text: '직접 하고 싶은 일이나 맡기기 싫은 일이 있나요?', options: ['고객은 직접 만날래요', '돈 관련은 제가 정할래요', '글쓰기는 맡기고 싶어요', '딱히 없어요'] },
};
/** 단계 답(칩) → 설계도 단계 */
export const STAGE_ANSWER: Record<string, (typeof BIZ_STAGES)[number]> = { '아이디어만 있어요': 'idea', '준비하고 있어요': 'prep', '막 시작했어요': 'launch', '이미 운영 중이에요': 'operate' };

const HONEST = [
  '원칙: 확인하지 않은 사실을 사실처럼 쓰지 않는다. 숫자 · 시장 규모 · 법 규정을 지어내지 않는다(법 · 세무 · 인허가는 "확인 필요(전문가)"). 짧고 구체적으로 쓴다.',
  '응답은 지정된 JSON 형식으로만 한다.',
].join('\n');

function managerSystem(office: Office, manager: Employee, what: string): string {
  return [
    `당신은 "${office.name}"의 매니저 ${manager.name}입니다. 혼자 · 소수로 창업을 막 시작한 대표의 사업 파트너로, ${what}`,
    `맡은 일: ${roleTitle('manager')}.`,
    `회사 소개: ${office.description}`,
    `면접 때 제안한 방향: ${manager.profile.direction ?? '없음'}`,
    '일하는 방식:', ...workRules(manager.style).map((r) => `- ${r}`),
    `대표님께 말하는 말투: ${toneLine(manager.style)}.`,
    '대표님께 말하는 원칙:', ...VOICE.map((v) => `- ${v}`),
    HONEST,
  ].join('\n');
}

/** 사업 인터뷰 준비 — 뼈대 질문을 이 사업의 말로 다듬고, 고를 수 있는 답(칩)과 덧붙일 질문 0–2개 */
export function questionsRequest(office: Office, manager: Employee): CompleteRequest {
  return {
    purpose: 'setup:questions',
    system: managerSystem(office, manager, '사업을 이해하려고 짧은 인터뷰를 합니다.'),
    prompt: [
      '대표의 사업에 맞춰 인터뷰를 준비하세요. 질문 뼈대는 정해져 있어요:',
      ...SETUP_KEYS.map((k) => `- ${k}: ${SETUP_DEFAULTS[k].text}`),
      '',
      'questions에 뼈대 질문마다 key, 이 사업에 맞게 다듬은 text(한 문장), options(이 사업에 맞는 구체적인 답 3–4개, 각 20자 이내)를 쓰세요. stage의 options는 비워도 돼요(고정).',
      'extra에는 이 사업에만 꼭 필요한 질문을 0–2개(예: 매장이면 위치 · 상권, 앱이면 이미 만든 것)만 text · options로 쓰세요.',
      'greeting에는 인터뷰를 시작하는 인사 한두 문장(왜 묻는지 포함).',
    ].join('\n'),
    schema: obj({
      greeting: STR,
      questions: { type: 'array', items: obj({ key: { type: 'string', enum: [...SETUP_KEYS] }, text: STR, options: strArr }) },
      extra: { type: 'array', items: obj({ text: STR, options: strArr }) },
    }),
    context: { style: manager.style, name: office.name, description: office.description },
  };
}

const BLUEPRINT_SCHEMA = obj({
  summary: STR,
  stage: { type: 'string', enum: [...BIZ_STAGES] },
  stageWhy: STR,
  customer: STR,
  goals: { type: 'array', items: obj({ text: STR, check: STR }) },
  blocks: { type: 'array', items: obj({ id: { type: 'string', enum: [...WORK_BLOCK_IDS] }, why: STR }) },
  hiring: { type: 'array', items: obj({ role: { type: 'string', enum: [...STAFF_ROLES] }, why: STR, when: STR }) },
  split: obj({ owner: strArr, team: strArr }),
  assumptions: strArr,
  ideas: strArr,
});

const BLUEPRINT_RULES = [
  '사업 설계도를 쓰세요:',
  '- summary: 이 사업을 두세 문장으로(누구에게 · 무엇을 · 어떻게).',
  '- stage(idea 아이디어 · prep 준비 중 · launch 막 출시 · operate 운영 중)와 stageWhy(왜 그렇게 봤는지 한 줄).',
  '- customer: 첫 고객이 누구인지. 모르면 "(가정)"을 붙인 추정.',
  '- goals: 이번 달 목표 1–3개. text는 이번 달 안에 확인할 수 있는 것, check는 확인 방법.',
  '- blocks: 아래 카탈로그에서 지금 단계와 목표에 맞는 블록 3–5개(id만), why는 이 사업에서 왜 필요한지 한 줄. 블로그 · SNS 같은 콘텐츠 운영(content_ops)은 이 사업에 정말 필요할 때만.',
  `- hiring: 매니저 다음으로 채용할 순서(${STAFF_ROLES.map((r) => `${r}(${roleTitle(r)})`).join(' · ')} 중), 고른 블록을 맡을 직무만. why · when(예: 지금 · 2주 차 · 필요할 때).`,
  '- split.owner: 대표가 직접 해야 하는 일(고객 만나기 · 결정 · 계약 등), split.team: AI 팀이 맡을 일.',
  '- assumptions: 대표가 "잘 모르겠어요"라고 한 것과 아직 검증 전인 가정.',
  '- ideas: 카탈로그에 없지만 이 사업에 필요해 보이는 일(새 블록 제안).',
  '',
  '## 업무 블록 카탈로그',
  ...catalogLines(),
].join('\n');

/** 인터뷰 답 → 사업 설계도 */
export function blueprintRequest(office: Office, manager: Employee, qa: Array<{ q: string; a: string }>): CompleteRequest {
  return {
    purpose: 'setup:blueprint',
    system: managerSystem(office, manager, '대표와의 인터뷰를 바탕으로 사업 설계도를 씁니다.'),
    prompt: ['## 사업 인터뷰', ...qa.map((x) => `- ${x.q} → ${x.a}`), '', BLUEPRINT_RULES].join('\n'),
    schema: BLUEPRINT_SCHEMA,
    context: { style: manager.style, name: office.name, description: office.description, answers: qa },
  };
}

/** 대표가 글로 고쳐 달라고 한 설계도 */
export function reviseRequest(office: Office, manager: Employee, current: BlueprintData, request: string): CompleteRequest {
  return {
    purpose: 'setup:revise',
    system: managerSystem(office, manager, '대표의 요청대로 사업 설계도를 고칩니다.'),
    prompt: ['## 지금 설계도', JSON.stringify(current, null, 1), '', '## 대표의 요청', request, '', '요청을 반영한 설계도 전체를 다시 쓰세요. 요청과 상관없는 부분은 그대로 두세요.', '', BLUEPRINT_RULES].join('\n'),
    schema: BLUEPRINT_SCHEMA,
    context: { style: manager.style, name: office.name, description: office.description, current, request },
  };
}
