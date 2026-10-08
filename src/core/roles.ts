import type { Brief, Channel, EmployeeStyle, Look, Role, TaskKind } from './types.ts';

export const ROLE_LABEL: Record<Role, string> = {
  manager: '매니저',
  researcher: '리서처',
  writer: '작가',
  designer: '디자이너',
  marketer: '마케터',
  editor: '편집자',
  producer: '영상 PD',
  seo: 'SEO',
};
/** 직무가 하는 일 — 이름 옆에 붙여 '이름 : 설명'으로 보여 준다(crewloft-brand §5-1, SEO 말고는 기획 제안) */
export const ROLE_DESC: Record<Role, string> = {
  manager: '계획 · 조율 담당',
  researcher: '조사 담당',
  writer: '글 담당',
  designer: '이미지 담당',
  marketer: '홍보 담당',
  editor: '교정 담당',
  producer: '영상 담당',
  seo: '검색 담당',
};
/** 'SEO : 검색 담당' — 직무 이름과 하는 일을 함께 쓰는 표기 */
export function roleTitle(role: Role): string {
  return `${ROLE_LABEL[role]} : ${ROLE_DESC[role]}`;
}
/** 채용할 수 있는 직무 순서 — 매니저가 먼저(결정 54), 매니저 말고는 같은 직무를 여러 명 둘 수 있다(결정 71) */
export const ALL_ROLES: readonly Role[] = ['manager', 'researcher', 'writer', 'designer', 'marketer', 'editor', 'producer', 'seo'];
export const STAFF_ROLES: readonly Role[] = ALL_ROLES.filter((r) => r !== 'manager');
/** 새 직무가 기존 단계 공간(0–4단계 레이아웃)에서 앉을 가까운 팀 */
export const ROLE_KIN: Partial<Record<Role, Role>> = { editor: 'writer', marketer: 'writer', producer: 'designer', seo: 'researcher' };

// 직급(결정 57). 승급은 실제 기록 기반 제안 + 사용자 결정이며 아직 구현하지 않았다.
export const RANKS = {
  manager: ['매니저(팀장)', '실장', '본부장'],
  staff: ['사원', '주임', '선임'],
} as const;

export function firstRank(role: Role): string {
  return role === 'manager' ? RANKS.manager[0] : RANKS.staff[0];
}

export const DEFAULT_STYLE: EmployeeStyle = {
  tone: { form: 'haeyo', emoji: false },
  traits: { bold: 50, speed: 50, data: 50, propose: 50 },
  report: { detail: 'summary', freq: 'decide', ask: 'mid' },
};

export const DEFAULT_LOOK: Look = { hair: 'short', hairColor: '#2B1D17', skin: '#F2D3B8', outfit: '#476A58', acc: 'none' };

export const DEFAULT_BRIEF: Brief = {
  goal: '주간 콘텐츠 운영',
  direction: '',
  audience: '',
  channels: ['blog', 'threads', 'linkedin'],
  cadence: '블로그 1 + SNS 6',
  principles: ['게시 전 대표 확인', 'AI 사용 한도 안에서'],
};

export interface StepDef {
  step: string;
  kind: TaskKind;
  role: Role;
  title: string;
  deps: string[];
  /** 다른 단계의 결과물을 새 버전으로 고치는 업무면 그 단계(편집자 → 블로그) */
  item?: string;
}

/**
 * 주간 회차 흐름 — 채용된 역할만 업무가 생기고, 없는 역할은 "채용 후 가능"으로 남는다(결정 54).
 * 없는 단계를 기다리는 의존은 빠진다(예: SEO가 없으면 기획은 조사만 받는다).
 */
export const WEEKLY_STEPS: readonly StepDef[] = [
  { step: 'research', kind: 'research', role: 'researcher', title: '이번 주 트렌드 조사', deps: [] },
  { step: 'seo', kind: 'seo_keywords', role: 'seo', title: '검색 키워드 브리프', deps: ['research'] },
  { step: 'plan', kind: 'plan', role: 'manager', title: '주간 주제 기획', deps: ['research', 'seo'] },
  { step: 'blog', kind: 'blog_draft', role: 'writer', title: '블로그 초안', deps: ['plan'] },
  { step: 'newsletter', kind: 'newsletter', role: 'writer', title: '뉴스레터 초안', deps: ['plan'] },
  { step: 'sns', kind: 'sns_draft', role: 'writer', title: 'SNS 글 묶음', deps: ['plan'] },
  { step: 'edit', kind: 'edit', role: 'editor', title: '블로그 교정·교열', deps: ['blog'], item: 'blog' },
  { step: 'image', kind: 'image_brief', role: 'designer', title: '썸네일·이미지 기획', deps: ['edit', 'blog'] },
  { step: 'video', kind: 'video_script', role: 'producer', title: '숏폼 대본·스토리보드', deps: ['edit', 'blog'] },
  { step: 'promo', kind: 'promo_plan', role: 'marketer', title: '배포 계획·홍보 문구', deps: ['edit', 'blog', 'sns', 'newsletter'] },
  { step: 'review', kind: 'review', role: 'manager', title: '검수', deps: ['blog', 'newsletter', 'sns', 'edit', 'image', 'video', 'promo'] },
];

/** 게시 확인을 여는 결과물과 그 채널 */
export const PUBLISH_TARGETS: Readonly<Record<string, readonly Channel[]>> = {
  blog: ['blog'],
  sns: ['threads', 'linkedin'],
};

/** 주간 7단계 흐름(S1 하단 도크·S5 회차 보드) — 업무 종류를 단계로 묶는다 */
export const FLOW_STAGES = [
  { key: 'research', label: '조사', kinds: ['research', 'seo_keywords'] },
  { key: 'plan', label: '기획', kinds: ['plan'] },
  { key: 'write', label: '작성', kinds: ['blog_draft', 'newsletter', 'sns_draft', 'edit'] },
  { key: 'image', label: '이미지', kinds: ['image_brief', 'video_script'] },
  { key: 'review', label: '검수', kinds: ['promo_plan', 'review'] },
  { key: 'confirm', label: '확인', kinds: [] },
  { key: 'publish', label: '게시', kinds: [] },
] as const;

export const CHANNEL_LABEL: Record<Channel, string> = {
  blog: '블로그',
  threads: 'Threads',
  linkedin: 'LinkedIn',
};

/** itemId(`${cycleId}:${step}`)에서 원래 단계 이름을 꺼낸다 */
export function stepOfItem(itemId: string): string {
  return itemId.slice(itemId.lastIndexOf(':') + 1);
}
