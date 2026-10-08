// 가짜 AI 견본 — 사업 인터뷰 · 사업 설계도 · 업무 블록(결정 73). 형식은 실제와 같고 내용은 견본이다.
// 사업 종류는 회사 설명의 낱말로 고른다(카페 · 앱 서비스 · 온라인 판매 · 콘텐츠 · 그 밖).
import { STAGE_DEFAULT_BLOCKS, WORK_BLOCK_IDS, blockById, blockRoles } from '../blocks/catalog.ts';
import type { BizStage, EmployeeStyle, Role } from '../core/types.ts';

type Ctx = Record<string, unknown>;
type Biz = 'cafe' | 'app' | 'shop' | 'content' | 'other';
const s = (v: unknown, f = ''): string => (typeof v === 'string' && v ? v : f);
const form = (c: Ctx) => (c.style as EmployeeStyle | undefined)?.tone.form ?? 'haeyo';
const t3 = (c: Ctx, haeyo: string, hamnida: string, banmal: string): string => ({ haeyo, hamnida, banmal })[form(c)];

export function bizOf(c: Ctx): Biz {
  const d = `${s(c.name)} ${s(c.description)}`;
  if (/카페|커피|베이커리|디저트|빵|식당|음식점|레스토랑|매장|가게/.test(d)) return 'cafe';
  if (/앱|어플|SaaS|플랫폼|소프트웨어|서비스를 만들|웹 ?서비스|개발/i.test(d)) return 'app';
  if (/쇼핑몰|온라인 판매|스마트스토어|판매|커머스|굿즈|핸드메이드|상품/.test(d)) return 'shop';
  if (/블로그|SNS|콘텐츠|리뷰|유튜브|뉴스레터|인스타/i.test(d)) return 'content';
  return 'other';
}

const Q: Record<Biz, { customer: string[]; goal: string[]; extra: Array<{ text: string; options: string[] }> }> = {
  cafe: { customer: ['근처 직장인', '동네 주민 · 가족', '근처 대학생'], goal: ['메뉴 · 가격 확정', '매장 자리 정하기', '오픈 체크리스트 완성'], extra: [{ text: '매장 위치나 상권은 정했어요?', options: ['정했어요', '후보가 2–3곳', '아직이요'] }] },
  app: { customer: ['1인 창업자', '작은 팀', '프리랜서'], goal: ['고객 후보 5명 인터뷰', '대기 신청 페이지 열기', '첫 베타 사용자 10명'], extra: [{ text: '지금 만들어 둔 게 있어요?', options: ['아이디어만', '화면 시안', '작동하는 시제품'] }] },
  shop: { customer: ['20–30대 여성', '선물용 구매자', '취미 모임'], goal: ['첫 주문 10건', '상세 페이지 완성', '원가 · 가격 확정'], extra: [{ text: '어디서 팔 계획이에요?', options: ['스마트스토어', '자사몰', 'SNS로 직접'] }] },
  content: { customer: ['1인 창업자', '사이드 프로젝트 직장인', '프리랜서'], goal: ['매주 꾸준히 발행', '구독자 100명', '첫 협업 문의'], extra: [] },
  other: { customer: ['아직 정하지 않았어요', '주변 지인부터', '온라인 고객'], goal: ['고객 문제 확인', '첫 고객 만나기', '할 일 정리'], extra: [] },
};

export function fakeQuestions(c: Ctx): Record<string, unknown> {
  const q = Q[bizOf(c)];
  return {
    greeting: t3(c, '이제 사업을 제대로 이해하려고 몇 가지 여쭐게요. 모르는 건 "잘 모르겠어요"로 넘기면 가정으로 두고 제가 조사해 제안할게요. (견본)', '사업을 정확히 이해하기 위해 몇 가지 여쭙겠습니다. 모르는 항목은 "잘 모르겠어요"로 넘기시면 가정으로 두고 조사해 제안드리겠습니다. (견본)', '사업 제대로 이해하려고 몇 가지 물어볼게. 모르면 "잘 모르겠어요"로 넘겨 — 가정으로 두고 내가 조사해 볼게. (견본)'),
    questions: [
      { key: 'stage', text: '지금 어느 단계예요?', options: [] },
      { key: 'customer', text: '첫 고객은 누구라고 생각하세요?', options: q.customer },
      { key: 'blocker', text: '지금 가장 막히는 게 뭐예요?', options: ['무엇부터 할지 모르겠어요', '고객이 원하는지 모르겠어요', '가격을 못 정했어요', '알릴 방법을 모르겠어요'] },
      { key: 'goal', text: '이번 달 안에 꼭 이루고 싶은 것 하나는요?', options: q.goal },
      { key: 'assets', text: '쓸 수 있는 시간 · 예산 · 채널 · 기술이 있나요?', options: ['주 10시간 정도', '예산은 거의 없어요', 'SNS 계정이 있어요', '관련 경력이 있어요'] },
      { key: 'keep', text: '직접 하고 싶은 일이나 맡기기 싫은 일이 있나요?', options: ['고객은 직접 만날래요', '돈 관련은 제가 정할래요', '글쓰기는 맡기고 싶어요', '딱히 없어요'] },
    ],
    extra: q.extra,
  };
}

const answerOf = (c: Ctx, word: string): string => {
  const qa = (c.answers as Array<{ q: string; a: string }> | undefined) ?? [];
  const hit = qa.find((x) => x.q.includes(word));
  return hit && !hit.a.startsWith('잘 모르겠어요') ? hit.a : '';
};

const BP: Record<Biz, { stage: BizStage; stageWhy: string; customer: string; goals: Array<{ text: string; check: string }>; blocks: Array<[string, string]>; hiring: Array<[Role, string, string]>; owner: string[]; team: string[]; assumptions: string[]; ideas: string[] }> = {
  cafe: {
    stage: 'prep', stageWhy: '메뉴 · 자리 · 인허가를 준비하는 단계예요', customer: '근처 직장인 (가정)',
    goals: [{ text: '메뉴 6개와 가격 확정', check: '원가표 · 가격표 확정본' }, { text: '오픈 준비 체크리스트 완성', check: '대표 할 일 · 팀 할 일로 나눈 목록 확정' }],
    blocks: [['market_research', '근처 카페 · 상권을 먼저 봐야 메뉴와 가격을 정할 수 있어요'], ['pricing', '원두 · 우유 · 컵 원가로 메뉴 가격을 정해요'], ['prep_checklist', '영업 신고 · 위생 교육처럼 오픈 전에 꼭 할 일이 많아요'], ['landing_copy', '지도 · SNS에 올릴 한 줄 소개가 필요해요']],
    hiring: [['researcher', '상권 · 경쟁 카페 조사를 맡아요', '지금'], ['writer', '소개 문구를 맡아요', '3주 차']],
    owner: ['매장 계약 · 인테리어 결정', '영업 신고 · 위생 교육(직접)', '메뉴 맛 테스트'], team: ['상권 · 경쟁 카페 조사', '원가 · 가격 계산', '준비 체크리스트', '소개 문구'],
    assumptions: ['근처 직장인의 점심 · 오후 수요가 충분하다 (가정)'], ideas: ['메뉴 사진 촬영 계획 — 카탈로그에 아직 없음'],
  },
  app: {
    stage: 'idea', stageWhy: '아이디어를 고객에게 확인하기 전이에요', customer: '혼자 일하는 창업자 (가정)',
    goals: [{ text: '고객 후보 5명 인터뷰', check: '정리표 5칸 채우기' }, { text: '대기 신청 페이지 열기', check: '랜딩 문구 확정 · 신청 1건' }],
    blocks: [['problem_canvas', '누구의 어떤 문제를 푸는지 한 장으로 정리해요'], ['customer_interview', '만들기 전에 고객이 정말 원하는지 확인해요'], ['market_research', '이미 있는 대안을 알아야 다르게 만들 수 있어요'], ['landing_copy', '대기 신청을 받을 페이지 문구예요']],
    hiring: [['researcher', '인터뷰 질문지 · 경쟁 조사를 맡아요', '지금'], ['writer', '랜딩 문구를 맡아요', '3주 차']],
    owner: ['고객 후보 5명 직접 만나기', '무엇을 먼저 만들지 결정'], team: ['문제 · 가설 정리', '인터뷰 질문지', '경쟁 조사', '랜딩 문구'],
    assumptions: ['고객이 지금 쓰는 대안에 불편을 느낀다 (가정)'], ideas: [],
  },
  shop: {
    stage: 'launch', stageWhy: '상품은 있고 첫 판매를 시작하는 단계예요', customer: '선물용으로 사는 20–30대 (가정)',
    goals: [{ text: '첫 주문 10건', check: '주문 기록' }, { text: '상세 페이지 문구 확정', check: '결정함에서 확정' }],
    blocks: [['pricing', '원가 · 배송비 · 수수료를 넣어 가격을 다시 봐요'], ['landing_copy', '상세 페이지 문구예요'], ['first_customers', '첫 주문 10건을 어디서 받을지 계획해요']],
    hiring: [['writer', '상세 페이지 문구를 맡아요', '지금'], ['marketer', '첫 고객 확보를 맡아요', '2주 차']],
    owner: ['상품 사진 촬영', '주문 · 배송 처리', '가격 최종 결정'], team: ['원가 · 가격 계산', '상세 페이지 문구', '첫 고객 확보 계획'],
    assumptions: ['선물 수요가 연말에 몰린다 (가정)'], ideas: [],
  },
  content: {
    stage: 'operate', stageWhy: '이미 콘텐츠를 만들고 있어 꾸준함이 중요해요', customer: '1인 창업자 (가정)',
    goals: [{ text: '4주 연속 주간 발행', check: '게시 확인 4회' }],
    blocks: [['content_ops', '매주 조사 → 글 → 게시 확인 흐름이 필요해요'], ['first_customers', '구독자를 모을 채널을 정해요']],
    hiring: [['researcher', '매주 주제와 근거를 찾아요', '지금'], ['writer', '글을 맡아요', '지금'], ['marketer', '구독자 모으기를 맡아요', '3주 차']],
    owner: ['게시 전 확인', '방향 결정'], team: ['조사 · 기획 · 글 · 이미지', '구독자 확보 계획'],
    assumptions: ['독자는 실용적인 비교 글을 원한다 (가정)'], ideas: [],
  },
  other: {
    stage: 'idea', stageWhy: '아직 고객과 문제를 확인하기 전이에요', customer: '아직 정하지 않음 (가정)',
    goals: [{ text: '고객 문제 한 장으로 정리', check: '문제 · 가설 한 장 확정' }, { text: '고객 후보 3명 만나기', check: '인터뷰 정리표' }],
    blocks: STAGE_DEFAULT_BLOCKS.idea.map((id) => [id, blockById(id)!.purpose]),
    hiring: [['researcher', '조사 · 인터뷰 준비를 맡아요', '지금']],
    owner: ['고객 후보 만나기', '방향 결정'], team: ['문제 · 가설 정리', '시장 조사', '인터뷰 질문지'],
    assumptions: [], ideas: [],
  },
};

export function fakeBlueprint(c: Ctx): Record<string, unknown> {
  const biz = bizOf(c);
  const b = BP[biz];
  const stageHint = ((c.answers as Array<{ q: string; a: string }> | undefined) ?? []).find((x) => x.q === '(단계 해석)')?.a as BizStage | undefined;
  const customer = answerOf(c, '고객') || b.customer;
  const goal = answerOf(c, '이번 달');
  return {
    summary: `${s(c.description).slice(0, 140)} — 매니저가 정리한 설계도예요. (가짜 AI 견본)`,
    stage: stageHint ?? b.stage, stageWhy: b.stageWhy, customer,
    goals: goal ? [{ text: goal, check: b.goals[0]!.check }, ...b.goals.slice(1)] : b.goals,
    blocks: b.blocks.map(([id, why]) => ({ id, why })),
    hiring: b.hiring.map(([role, why, when]) => ({ role, why, when })),
    split: { owner: b.owner, team: b.team }, assumptions: [...b.assumptions, ...((c.answers as Array<{ a: string }> | undefined) ?? []).filter((x) => x.a.startsWith('잘 모르겠어요')).map(() => '모르는 답은 조사 뒤 확정 (가정)').slice(0, 1)],
    ideas: b.ideas,
  };
}

const KEYWORDS: Array<[RegExp, string]> = [
  [/SNS|블로그|콘텐츠|뉴스레터/, 'content_ops'], [/가격|원가/, 'pricing'], [/인터뷰/, 'customer_interview'], [/조사|경쟁|시장|상권/, 'market_research'],
  [/랜딩|소개 문구|상세 페이지/, 'landing_copy'], [/체크리스트|인허가|준비/, 'prep_checklist'], [/고객 확보|홍보|마케팅/, 'first_customers'], [/가설|문제/, 'problem_canvas'],
];
/** 글로 고쳐 달라기 — 블록 이름이 나오면 빼거나 더한다 */
export function fakeRevise(c: Ctx): Record<string, unknown> {
  const cur = JSON.parse(JSON.stringify(c.current ?? {})) as Record<string, unknown> & { blocks: Array<{ id: string; why: string }>; summary: string };
  const req = s(c.request);
  const drop = /빼|없애|필요 ?없|말고/.test(req);
  for (const [re, id] of KEYWORDS) {
    if (!re.test(req)) continue;
    if (drop) cur.blocks = cur.blocks.filter((b) => b.id !== id);
    else if (!cur.blocks.some((b) => b.id === id)) cur.blocks.push({ id, why: `대표 요청: ${req.slice(0, 40)}` });
  }
  cur.summary = `${cur.summary.replace(/ \(수정: .*\)$/, '')} (수정: ${req.slice(0, 40)})`;
  return cur;
}

const MANAGER_DIAG: Record<string, { direction: string; plan: string[]; question: string }> = {
  careful: { direction: '고객이 정말 원하는지부터 확인하고 가요.', plan: ['고객 후보 5명 인터뷰로 문제 확인', '원가 · 가격을 숫자로 맞춰 보기', '4주 차에 첫 판매 · 신청으로 검증'], question: '첫 고객은 누구라고 생각하세요?' },
  growth: { direction: '작게 빨리 내놓고 반응을 봐요.', plan: ['2주 안에 첫 버전(메뉴 · 페이지 · 시제품) 공개', '첫 고객 10명을 직접 모으기', '매주 금요일 숫자로 회고'], question: '한 달 안에 무엇이 되면 성공이에요?' },
  story: { direction: '왜 이 사업인지부터 세워요.', plan: ['한 줄 소개 · 말투 정하기', '첫 고객에게 보여 줄 소개 문구', '이야기를 담은 출시 공지'], question: '이 사업을 시작한 이유가 뭐예요?' },
};
export const managerDiag = (archetype: string) => MANAGER_DIAG[archetype] ?? MANAGER_DIAG.careful!;

// ── 업무 블록 견본 ──
const revisedNote = (c: Ctx) => (s(c.feedback) ? `\n\n> 수정 요청 반영: ${s(c.feedback)}` : '');

function planWeeks(c: Ctx): Array<{ week: number; goal: string; blocks: string[] }> {
  const hired = new Set((c.hiredRoles as Role[] | undefined) ?? ['manager']);
  const chosen = ((c.blocks as string[] | undefined) ?? []).filter((id) => WORK_BLOCK_IDS.includes(id));
  const list = chosen.length ? chosen : ['problem_canvas'];
  // 지금 팀이 바로 할 수 있는 블록을 앞 주에
  const ready = (id: string) => blockRoles(blockById(id)!).every((r) => r === 'manager' || hired.has(r));
  const ordered = [...list.filter(ready), ...list.filter((id) => !ready(id))];
  const weeks: Array<{ week: number; goal: string; blocks: string[] }> = [];
  for (let i = 0; i < ordered.length && weeks.length < 4; i += 2) weeks.push({ week: weeks.length + 1, goal: `${blockById(ordered[i]!)!.name}${ordered[i + 1] ? ` · ${blockById(ordered[i + 1]!)!.name}` : ''} 끝내기`, blocks: ordered.slice(i, i + 2) });
  return weeks;
}

export function fakeBlockTask(kind: string, c: Ctx): Record<string, unknown> {
  const [block] = kind.split('.');
  const biz = bizOf(c);
  const base = { sources: [] as string[], assumptions: [] as string[], expertCheck: [] as string[] };
  const fb = revisedNote(c);
  const note = (h: string, m: string, b: string) => t3(c, h, m, b);
  switch (block) {
    case 'kickoff':
    case 'monthly_plan': {
      const weeks = planWeeks(c);
      const ownerTasks = { cafe: ['매장 후보 2곳 직접 보기', '메뉴 맛 테스트 · 원두 정하기', '영업 신고 절차를 구청에 문의'], app: ['고객 후보 5명에게 인터뷰 요청', '무엇을 먼저 만들지 결정', '이번 달 예산 상한 정하기'], shop: ['상품 사진 찍기', '배송 · 포장 방법 정하기', '가격 최종 결정'], content: ['게시 전 확인 시간 정하기(주 1회)', '방향 · 말투 확인'], other: ['고객 후보 3명 만나기', '이번 달 예산 상한 정하기', '매주 금요일 결정함 확인'] }[biz];
      const title = block === 'kickoff' ? '사업 진단 · 이번 달 실행 계획' : '다음 달 실행 계획';
      return {
        ...base, title, weeks, ownerTasks, assumptions: ['첫 고객의 문제가 충분히 크다 (가정)'],
        body: [
          `## 사업 진단 (견본)`, `- 지금 단계: ${{ cafe: '준비 중', app: '아이디어', shop: '막 출시', content: '운영 중', other: '아이디어' }[biz]}`, '- 강점: 대표가 고객을 직접 만날 수 있어요', '- 가장 큰 위험: ① 고객 수요 미확인 ② 가격이 원가를 못 덮음 ③ 알릴 채널 없음 (가정)', '- 먼저 검증할 것: 첫 고객이 정말 돈을 낼지',
          '', '## 이번 달 목표', '1. 설계도의 목표 1을 끝까지', '2. 대표 확인 결과물 2개 이상',
          '', '## 주차별 계획', '| 주차 | 목표 | 업무 블록 |', '|---|---|---|', ...weeks.map((w) => `| ${w.week}주 | ${w.goal} | ${w.blocks.map((b) => blockById(b)?.name ?? b).join(' · ')} |`),
          '', '## 대표가 직접 할 일', ...ownerTasks.map((t) => `- [ ] ${t}`),
          '', '## 아직 가정인 것', '- 첫 고객의 문제가 충분히 크다 (가정)',
        ].join('\n') + fb,
        note: note('이번 달 계획 짰어요. 확인해 주시면 다음 회차부터 1주차대로 일할게요.', '이번 달 계획을 작성했습니다. 확인해 주시면 다음 회차부터 1주차 계획대로 진행하겠습니다.', '이번 달 계획 짰어. 확인해 주면 다음 회차부터 1주차대로 갈게.'),
      };
    }
    case 'weekly_retro': {
      const todos = c.todos as { done: string[]; open: Array<{ text: string }> } | null | undefined;
      const owner = todos ? `\n\n## 대표 할 일\n- 끝낸 것 ${todos.done.length}개${todos.done.length ? `: ${todos.done.join(' · ')}` : ''}\n- 남은 것 ${todos.open.length}개${todos.open.length ? `: ${todos.open.map((x) => x.text).join(' · ')}` : ''}` : '';
      return { ...base, title: '주간 회고 · 다음 주 준비', body: `## 한 일 (견본)\n${((c.inputs as string[] | undefined) ?? []).map((x) => `- ${x}`).join('\n') || '- 이번 주 결과물 없음'}${owner}\n\n## 배운 것\n- 고객 가정 하나가 더 분명해졌어요 (가정)\n\n## 막힌 것\n- 채용 전이라 건너뛴 일이 있으면 다음 채용 뒤에 이어서 해요\n\n## 다음 주에 할 것\n- 계획의 다음 주차 블록\n\n## 대표님께 확인받을 것\n- 결정함의 확인 요청${fb}`, note: note('이번 주 회고 정리했어요.', '이번 주 회고를 정리했습니다.', '이번 주 회고 정리했어.') };
    }
    case 'problem_canvas': {
      const rows = [
        ['고객', `${s(c.description).slice(0, 30)}의 첫 고객 (가정)`], ['고객의 문제', '시간이 없어 제대로 고르지 못함 (가정)'], ['지금 쓰는 대안', '지인 추천 · 검색'],
        ['우리 해결책', '고객 상황에 맞춘 선택지'], ['고를 이유', '빠르고 믿을 수 있음'], ['핵심 가설', '① 문제가 자주 생긴다 ② 돈을 낼 의향이 있다 ③ 이 채널로 닿는다'],
        ['검증 방법 · 기준', '인터뷰 5명 중 3명 이상이 같은 문제를 말함'],
      ];
      return { ...base, title: '문제 · 가설 한 장', assumptions: ['고객이 지금 대안에 불편을 느낀다 (가정)'], table: { columns: ['칸', '내용 (견본)'], rows }, body: `| 칸 | 내용 (견본) |\n|---|---|\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}\n\n가장 먼저 검증할 것: 문제가 정말 자주 생기는지${fb}`, note: note('한 장으로 정리했어요. 가설 ①부터 확인해요.', '한 장으로 정리했습니다. 가설 ①부터 확인하겠습니다.', '한 장으로 정리했어. 가설 ①부터 보자.') };
    }
    case 'market_research':
      return { ...base, title: biz === 'cafe' ? '상권 · 경쟁 카페 조사' : '시장 · 경쟁 조사', assumptions: ['경쟁 가격대는 웹 검색 없이 쓴 견본이에요 (가정)'], body: `## 경쟁 · 대안 (견본)\n| 이름 | 무엇을 파는지 | 가격대 | 강점 | 빈틈 |\n|---|---|---|---|---|\n| 대안 A | 비슷한 상품 | 확인 필요 | 접근성 | 맞춤 부족 (가정) |\n| 대안 B | 대형 브랜드 | 확인 필요 | 신뢰 | 느림 (가정) |\n| 직접 해결 | 고객이 스스로 | — | 무료 | 시간이 듦 |\n\n## 고객이 지금 문제를 푸는 방법\n- 검색 · 지인 추천 (가정)\n\n## 우리에게 열린 기회\n1. 빠르고 개인화된 선택\n2. 동네 · 커뮤니티 밀착\n\n## 더 확인할 것\n- 실제 가격대 · 고객 수 — 웹 검색 · 현장 확인 필요${fb}`, note: note('조사 정리했어요. 출처 확인이 필요한 건 (가정)으로 표시했어요.', '조사를 정리했습니다. 확인이 필요한 항목은 (가정)으로 표시했습니다.', '조사 정리했어. 확인 필요한 건 (가정) 표시.') };
    case 'customer_interview':
      return { ...base, title: '고객 인터뷰 질문지 · 정리표', body: `## 누구를 어디서 만날까 (견본)\n- 지인 소개 · 관련 커뮤니티 · 근처 현장\n\n## 질문지\n1. 최근에 이 문제를 겪은 때를 이야기해 주세요.\n2. 그때 어떻게 해결했나요?\n3. 그 방법에서 가장 불편했던 건요?\n4. 그 문제에 돈이나 시간을 얼마나 썼나요?\n5. 더 나은 방법을 찾아본 적 있나요?\n\n## 인터뷰 뒤 정리표\n| 질문 | 1 | 2 | 3 | 4 | 5 | 패턴 |\n|---|---|---|---|---|---|---|\n| 1 |  |  |  |  |  |  |\n\n## 이런 답이면 가설이 맞아요 / 틀려요\n- 5명 중 3명 이상이 같은 불편을 말하면 맞아요${fb}`, note: note('질문지 만들었어요. 인터뷰는 대표님이 직접 해 주세요.', '질문지를 만들었습니다. 인터뷰는 대표님께서 직접 진행해 주세요.', '질문지 만들었어. 인터뷰는 대표가 직접!') };
    case 'pricing':
      return { ...base, title: biz === 'cafe' ? '메뉴 원가 · 가격 계산' : '가격 · 원가 계산', assumptions: ['예시 숫자는 (가정) 예시 — 대표 확인 필요'], table: { columns: ['항목', '단위', '비용', '메모'], rows: [['재료', '1개', '대표 확인', biz === 'cafe' ? '원두 · 우유 (견본)' : '(견본)'], ['포장', '1개', '대표 확인', ''], ['수수료 · 배송', '1건', '대표 확인', '']] }, body: `## 원가 (견본)\n| 항목 | 단위 | 비용 |\n|---|---|---|\n| 재료 | 1개 | 대표 확인 |\n| 포장 | 1개 | 대표 확인 |\n| 수수료 · 배송 | 1건 | 대표 확인 |\n\n## 가격 후보\n- A: 원가 × 3 — 마진 = 가격 − 원가 (가정) 예시\n- B: 경쟁 가격대에 맞춤 — 원가 확인 뒤 계산\n\n## 손익분기\n- 한 달 고정비 ÷ (가격 − 원가) = 팔아야 할 개수 — 고정비를 알려 주시면 계산해요\n\n## 확인할 가정\n- 고객이 이 가격을 낼 의향 (가정)${fb}`, note: note('계산 틀 만들었어요. 빈칸 숫자를 알려 주시면 채울게요.', '계산 틀을 만들었습니다. 빈칸의 숫자를 알려 주시면 채우겠습니다.', '계산 틀 만들었어. 빈칸 숫자 알려 주면 채울게.') };
    case 'prep_checklist':
      return { ...base, title: '준비 체크리스트', items: [
        { text: '사업자 등록 — 확인 필요(전문가: 세무사)', owner: 'ceo', due: '1–2주', expert: true },
        { text: '필요한 도구 · 공급처 목록', owner: 'team', due: '1–2주', expert: false },
        { text: biz === 'cafe' ? '영업 신고 · 위생 교육 — 확인 필요(전문가: 관할 구청 위생과)' : '약관 · 개인정보 처리방침 — 확인 필요(전문가)', owner: 'ceo', due: '3–4주', expert: true },
        { text: '오픈 소개 문구 초안', owner: 'team', due: '3–4주', expert: false },
        { text: '첫 고객 연락', owner: 'ceo', due: '', expert: false },
      ], expertCheck: biz === 'cafe' ? ['영업 신고 · 위생 교육 — 관할 구청 위생과에 확인', '사업자 등록 · 세금 — 세무사 상담'] : ['사업자 등록 · 세금 — 세무사 상담', '약관 · 개인정보 — 전문가 확인'], body: `## 1–2주 (견본)\n- [ ] [대표] 사업자 등록 — 확인 필요(전문가: 세무사)\n- [ ] [팀] 필요한 도구 · 공급처 목록\n\n## 3–4주\n- [ ] [대표] ${biz === 'cafe' ? '영업 신고 · 위생 교육 — 확인 필요(전문가: 관할 구청 위생과)' : '약관 · 개인정보 처리방침 — 확인 필요(전문가)'}\n- [ ] [팀] 오픈 소개 문구 초안\n- [ ] [대표] 첫 고객 연락${fb}`, note: note('체크리스트 만들었어요. 법 · 세무는 전문가 확인 필요로 표시했어요.', '체크리스트를 작성했습니다. 법 · 세무 항목은 전문가 확인 필요로 표시했습니다.', '체크리스트 만들었어. 법 · 세무는 전문가 확인 필요로 표시했어.') };
    case 'landing_copy':
      return { ...base, title: '랜딩 페이지 · 소개 문구', body: `## 한 줄 소개 (견본)\n${s(c.office)} — 당신에게 꼭 맞는 선택을 빠르게\n\n## 헤드라인 후보\n1. 고민은 짧게, 선택은 정확하게\n2. 처음이라도 쉽게 시작하세요\n3. 딱 필요한 것만\n\n## 섹션별 문구\n- 문제: 고르는 데 시간이 너무 들어요\n- 해결: 상황에 맞춘 추천\n- 어떻게: 세 단계로 끝나요\n- 가격: 확정 뒤 채워요\n- 신청: 지금 대기 신청하기\n\n## 행동 유도 문구\n- 먼저 받아 보기 · 대기 신청${fb}`, note: note('소개 문구 썼어요. 확인 안 된 수치 · 후기는 넣지 않았어요.', '소개 문구를 작성했습니다. 확인되지 않은 수치 · 후기는 넣지 않았습니다.', '소개 문구 썼어. 확인 안 된 수치 · 후기는 안 넣었어.') };
    case 'first_customers':
      return { ...base, title: '첫 고객 확보 계획', body: `## 채널 (견본)\n| 채널 | 왜 | 첫 행동 | 시간 · 비용 |\n|---|---|---|---|\n| 지인 · 소개 | 가장 빠름 | 10명에게 직접 연락 | 2시간 · 0원 |\n| 관련 커뮤니티 | 고객이 모여 있음 | 소개 글 1개 (대표 확인 뒤) | 1시간 · 0원 |\n| 동네 · 현장 | 직접 만남 | 전단 · 방문 | 반나절 |\n\n## 2주 실험\n- 1주: 지인 10명 연락 → 반응 기록\n- 2주: 커뮤니티 글 1개 → 신청 수 기록\n- 성공 기준: 첫 고객 3명\n\n## 대표가 직접 할 일\n- 연락 · 만남은 대표님이 직접${fb}`, note: note('첫 고객 계획 정리했어요. 올리는 건 대표님 확인 뒤에만 해요.', '첫 고객 확보 계획을 정리했습니다. 게시는 대표님 확인 후에만 진행합니다.', '첫 고객 계획 정리했어. 올리는 건 대표 확인 뒤에만.') };
    default:
      return { ...base, title: s(c.title, '결과물'), body: `(견본)${fb}`, note: '' };
  }
}
