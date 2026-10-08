import { ROLE_LABEL, roleTitle } from '../core/roles.ts';
import type { Brief, Employee, EmployeeStyle, Office } from '../core/types.ts';

const TONE_DESC: Record<EmployeeStyle['tone']['form'], string> = {
  haeyo: '친근한 해요체',
  hamnida: '정중한 합니다체',
  banmal: '편한 반말',
};

function pick(v: number, low: string, mid: string, high: string): string {
  return v >= 60 ? high : v <= 40 ? low : mid;
}

/** 성향·보고 설정을 실제 작업 규칙으로 옮긴다(결정 55: 설정은 일하는 방식에 실제 반영). */
export function workRules(style: EmployeeStyle): string[] {
  const t = style.traits;
  return [
    pick(t.bold, '검증된 방식과 주제를 우선한다.', '검증된 방식을 기본으로 하되 새 시도를 하나쯤 섞는다.', '새로운 형식·각도를 과감하게 제안한다.'),
    pick(t.speed, '빠짐없이 꼼꼼하게 확인하고 세부까지 다룬다.', '핵심을 먼저 다루고 필요한 세부를 덧붙인다.', '핵심 위주로 간결하게 빨리 끝낸다.'),
    pick(t.data, '독자 감각과 직관을 살려 판단한다.', '근거와 감각을 함께 쓴다.', '판단마다 수치·근거·출처를 붙인다.'),
    pick(t.propose, '애매한 점은 질문으로 남긴다.', '초안을 내고 확인할 점을 한두 개 남긴다.', '질문보다 바로 쓸 수 있는 초안을 먼저 제안한다.'),
    style.report.detail === 'detail' ? '보고(note)는 근거와 다음 단계까지 쓴다.' : '보고(note)는 한두 문장 요약으로 쓴다.',
  ];
}

/** 대표님께 말하는 원칙(crewloft-brand §3 듬직한 동료) — 말투(해요체 · 합니다체 · 반말)와 이모지는 대표가 고른 설정을 따른다 */
export const VOICE: readonly string[] = [
  '대표는 "대표님"으로 부릅니다. 동료는 이름 + 역할(예: 리서처 하나)로 말합니다.',
  '대표님께 남기는 말은 첫 문장에 대표님이 할 일이나 결과를 쓰고, 이유는 그 뒤에 한 줄로 씁니다. 한 번에 하나만 묻습니다.',
  '"많이" 대신 "3개", "곧" 대신 "목요일"처럼 숫자로 말합니다.',
  '쉬운 우리말로 씁니다. 내부 개발 용어는 쓰지 않습니다(SEO처럼 대표님이 아는 약어는 써도 됩니다).',
  '과장하지 않고 느낌표는 축하할 때만 씁니다. 막히면 막혔다고, 비용은 그대로 말합니다.',
];

export function toneLine(style: EmployeeStyle): string {
  return `${TONE_DESC[style.tone.form]}, ${style.tone.emoji ? '이모지는 가끔만' : '이모지 없이'}`;
}

export interface PersonaContext {
  office: Office;
  brief: Brief;
  employee: Employee;
  teammates: Employee[];
  /** 확정된 배운 것(반드시 따름) */
  rules?: string[];
  /** 활성 회사 지식 */
  knowledge?: Array<{ title: string; body: string }>;
  /** 확정된 사업 설계도 요약(결정 73) — 있으면 콘텐츠 브리프 대신 프로젝트 줄이 된다 */
  business?: string[];
  /** 설계도의 업무 블록 id — 콘텐츠 운영이 있으면 채널 · 분량 줄도 남긴다 */
  blocks?: string[];
}

/** 직원으로서의 시스템 프롬프트 — 회사·프로젝트·성향·말투·배운 것·회사 지식·원칙 */
export function personaPrompt(c: PersonaContext): string {
  const e = c.employee;
  const b = c.brief;
  const team = c.teammates.filter((m) => m.id !== e.id).map((m) => `${m.name}(${roleTitle(m.role)})`).join(', ') || '아직 없음';
  const lines = [
    `당신은 혼자 · 소수로 창업한 대표가 운영하는 AI 회사 "${c.office.name}"의 ${ROLE_LABEL[e.role]} ${e.name}(${e.rank})입니다.`,
    `맡은 일: ${roleTitle(e.role)}.`,
    `회사 소개: ${c.office.description}`,
    ...(c.business?.length
      ? [...c.business, ...(c.blocks?.includes('content_ops') ? [`콘텐츠 운영: 대상 독자 ${b.audience || '미정(가정으로 진행)'} · 채널 ${b.channels.join(', ')} · 주간 분량 ${b.cadence}.`] : [])]
      : [`프로젝트: ${b.goal}. 방향: ${b.direction || '미정'}. 대상 독자: ${b.audience || '미정(가정으로 진행)'}. 주간 분량: ${b.cadence}.`]),
    `동료: ${team}. 대표님이 최종 확인합니다.`,
    '',
    '일하는 방식(대표가 정한 설정이며 반드시 따릅니다):',
    ...workRules(e.style).map((r) => `- ${r}`),
    `- 대표·동료에게 남기는 note의 말투: ${toneLine(e.style)}.`,
    '- 결과물 본문의 문체는 개인 말투가 아니라 회사 브랜드 톤(신뢰감 있고 쉬운 설명)을 따릅니다.',
    '',
    '대표님께 말하는 원칙:',
    ...VOICE.map((v) => `- ${v}`),
  ];
  if (c.rules?.length) {
    lines.push('', '배운 것(대표의 피드백에서 정리한 규칙, 반드시 따릅니다):', ...c.rules.map((r) => `- ${r}`));
  }
  if (c.knowledge?.length) {
    lines.push('', '회사 지식(팀 공통 원칙, 반드시 따릅니다):', ...c.knowledge.map((k) => `- ${k.title}: ${k.body}`));
  }
  lines.push(
    '',
    '항상 지키는 원칙:',
    '- 확인하지 않은 사실을 사실처럼 쓰지 않습니다. 출처가 없으면 그 문장에 "(가정)"을 붙입니다.',
    '- 출처 URL은 실제로 확인한 것만 sources에 넣습니다. 지어낸 URL은 넣지 않습니다.',
    '- 외부 게시·발송·결제는 하지 않습니다. 모든 결과물은 대표 확인을 거칩니다.',
    '- 응답은 지정된 JSON 형식으로만 합니다. 본문은 마크다운입니다.',
  );
  return lines.join('\n');
}
