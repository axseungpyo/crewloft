import { ROLE_DESC, ROLE_LABEL } from '../core/roles.ts';
import type { Brief, Employee, Office, Role } from '../core/types.ts';
import type { Archetype } from '../engine/hiring.ts';
import type { CompleteRequest } from './provider.ts';

const STR = { type: 'string' } as const;
const strArr = { type: 'array', items: STR } as const;
const obj = (properties: Record<string, unknown>): Record<string, unknown> => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

const HONEST = [
  '원칙: 확인하지 않은 사실을 사실처럼 쓰지 않는다. 숫자·시장 규모를 지어내지 않는다. 짧고 구체적으로 쓴다.',
  '응답은 지정된 JSON 형식으로만 한다.',
].join('\n');

/** 매니저 면접 — 후보 원형마다 사업 진단(방향·첫 한 달·먼저 묻고 싶은 것)을 받는다(결정 54) */
export function interviewRequest(office: Office, archetypes: Archetype[]): CompleteRequest {
  const lines = archetypes.map((a) => `- ${a.id}: ${a.name}(${a.tags.join('·')}) — "${a.pitch}" 성향: 과감함 ${a.traits.bold}, 속도 ${a.traits.speed}, 데이터 ${a.traits.data}`);
  return {
    purpose: 'hire:interview',
    system: `당신은 혼자 · 소수로 창업을 막 시작한 대표의 AI 회사에 지원한 매니저 후보들의 생각을 대신 써 주는 도우미입니다. 후보마다 성향이 다르며, 그 성향대로 사업을 진단합니다. 블로그 · SNS 운영을 당연하게 가정하지 말고 이 사업에 정말 필요한 것부터 봅니다.\n${HONEST}`,
    prompt: [
      `## 회사: ${office.name}`, office.description, '',
      '## 후보 성향', ...lines, '',
      '후보마다 이 사업을 읽고 진단하세요: direction(한 문장 방향), plan(첫 한 달 계획 3줄), question(대표에게 먼저 묻고 싶은 것 1개). 후보 말투는 해요체.',
    ].join('\n'),
    schema: obj({ candidates: { type: 'array', items: obj({ archetype: { type: 'string', enum: archetypes.map((a) => a.id) }, direction: STR, plan: strArr, question: STR }) } }),
    context: { description: office.description, archetypes: archetypes.map((a) => a.id) },
  };
}

/** 다음 채용 — 후보 2명이 대표의 사업 주제로 짧은 샘플을 낸다(결정 56) */
export function samplesRequest(office: Office, brief: Brief, role: Role, archetypes: Archetype[]): CompleteRequest {
  const what: Record<string, string> = {
    researcher: '이 사업의 고객 · 경쟁 · 대안을 3줄로 요약(출처 확인이 필요한 건 "(가정)")',
    writer: '이 사업의 한 줄 소개와 고객에게 보여 줄 첫 문단 2–3문장',
    designer: '이 사업의 첫인상(로고 · 첫 화면 · 썸네일) 아이디어 1–2줄(문구 · 구도 · 색)',
    marketer: '첫 고객을 만날 채널 하나와 그 채널에 쓸 첫 메시지 1–2줄',
    editor: '흔히 틀리는 문장 하나를 고친 전·후 예시와 고친 이유 한 줄',
    producer: '이 사업을 소개하는 숏폼 첫 3초 훅 대사 1–2줄과 첫 장면 설명',
    seo: '이 사업의 고객이 검색할 키워드 3개와 그에 맞는 제목 1개(검색량 수치는 쓰지 않음)',
  };
  return {
    purpose: 'hire:samples',
    system: `당신은 ${ROLE_LABEL[role]}(${ROLE_DESC[role]}) 후보들의 짧은 샘플을 대신 써 주는 도우미입니다. 후보마다 성향대로 씁니다.\n${HONEST}`,
    prompt: [
      `## 회사: ${office.name}`, office.description, `방향: ${brief.direction || '미정'} · 대상: ${brief.audience || '미정'}`, '',
      '## 후보', ...archetypes.map((a) => `- ${a.id}: ${a.name}(${a.tags.join('·')}) — "${a.pitch}"`), '',
      `후보마다 sample로 ${what[role] ?? '짧은 샘플'}을 쓰세요.`,
    ].join('\n'),
    schema: obj({ candidates: { type: 'array', items: obj({ archetype: { type: 'string', enum: archetypes.map((a) => a.id) }, sample: STR }) } }),
    context: { role, archetypes: archetypes.map((a) => a.id), name: office.name },
  };
}

/** 직원 DM 답장 — 직원 말투로, 지시가 담겨 있으면 무엇을 바꿀지 한 문장으로 */
export function dmRequest(system: string, history: Array<{ author: string; text: string }>, message: string, employee: Employee): CompleteRequest {
  return {
    purpose: 'dm:reply',
    system: `${system}\n\n지금은 대표와 1:1 대화 중입니다. 짧게(1–3문장) 답하세요. 업무 지시가 있으면 무엇을 어떻게 하겠다고 구체적으로 답하세요.`,
    prompt: [...history.slice(-8).map((h) => `${h.author === 'user' ? '대표' : employee.name}: ${h.text}`), `대표: ${message}`, '', 'reply에 답장을 쓰세요.'].join('\n'),
    schema: obj({ reply: STR }),
    context: { style: employee.style, message },
  };
}
