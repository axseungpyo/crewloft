import type { EmployeeStyle, ToneForm } from '../core/types.ts';
import { fakeBlockTask, fakeBlueprint, fakeQuestions, fakeRevise, managerDiag } from './fake-setup.ts';

// 가짜 AI의 견본 응답 — 형식(스키마)은 실제와 같고 내용은 견본이다. 화면에는 '가짜 AI'로 표시된다.
type Ctx = Record<string, unknown>;

// 공간 설계도 견본(결정 67) — 화면 미리보기와 같은 파일을 쓴다. 회사 설명의 낱말로 고른다.
const SPACE_SAMPLES: Record<string, Record<string, unknown>> = {};
for (const name of ['music', 'lab', 'content']) {
  const url = new URL(`../../web/js/office3d/space/samples/${name}.js`, import.meta.url).href;
  SPACE_SAMPLES[name] = ((await import(url)) as { default: Record<string, unknown> }).default;
}
function spaceSample(c: Ctx): Record<string, unknown> {
  const d = `${s(c.name)} ${s(c.description)}`;
  const key = /음악|음원|뮤직|레이블|작곡|밴드|사운드|music/i.test(d) ? 'music' : /연구|R&D|실험|특허|논문|바이오|과학|lab/i.test(d) ? 'lab' : 'content';
  const spec = JSON.parse(JSON.stringify(SPACE_SAMPLES[key])) as Record<string, unknown>;
  if (key === 'content' && s(c.name)) spec.title = `${s(c.name)} 콘텐츠 랩`;
  return spec;
}
const s = (v: unknown, f = ''): string => (typeof v === 'string' && v ? v : f);

// 새 방 설계 견본 — 대표가 적은 필요의 낱말로 고른다. 레시피는 이미 있으면 서버가 있던 것을 다시 쓴다
const ACOUSTIC_PANEL = { parts: [
  { s: 'box', d: [1.0, 0.04, 0.3], p: [0, 0.02, 0], m: 'black' },
  { s: 'box', d: [0.06, 1.5, 0.06], p: [-0.45, 0.75, 0], m: 'metal' },
  { s: 'box', d: [0.06, 1.5, 0.06], p: [0.45, 0.75, 0], m: 'metal' },
  { s: 'box', d: [0.92, 1.1, 0.08], p: [0, 0.95, 0], m: 'fabric', c: '#4A5560' },
  ...[0, 1, 2, 3].map((i) => ({ s: 'box', d: [0.92, 0.06, 0.05], p: [0, 0.55 + i * 0.27, 0.06], m: 'fabric', c: '#3B444D' })),
] };
function roomSample(c: Ctx): Record<string, unknown> {
  const out = roomSampleBase(c);
  // "마케터 작업실"처럼 직무가 적혀 있으면 그 직무 자리를 둔다
  const need = s(c.need);
  const role = /마케터|마케팅/.test(need) ? 'marketer' : /편집/.test(need) ? 'editor' : /PD|피디|프로듀서/i.test(need) ? 'producer' : /SEO|검색/i.test(need) ? 'seo' : /리서치|리서처/.test(need) ? 'researcher' : /작가|글쓰기/.test(need) ? 'writer' : /디자이너|디자인/.test(need) ? 'designer' : null;
  const room = out.room as { stations: Array<Record<string, unknown>> };
  if (role) room.stations = room.stations.length ? room.stations.map((z, i) => (i === 0 ? { ...z, role } : z)) : [{ role, station: 'desk', count: 2, label: need.slice(0, 12), extras: [] }];
  return out;
}
function roomSampleBase(c: Ctx): Record<string, unknown> {
  const need = s(c.need);
  const known = (c.known as string[] | undefined) ?? [];
  const R = (SPACE_SAMPLES.content!.recipes ?? {}) as Record<string, unknown>;
  const pick = (names: string[]) => Object.fromEntries(names.filter((n) => !known.includes(n)).map((n) => [n, n === 'acoustic_panel' ? ACOUSTIC_PANEL : R[n]]));
  const note = (t: string) => `${t} (가짜 AI 견본)`;
  if (/녹음|팟캐스트|방송|오디오|라디오|podcast/i.test(need)) return { room: { id: 'booth', name: '녹음 부스', walls: 'solid', size: 's', color: '#B4664C', stations: [{ role: 'writer', station: 'desk', count: 1, label: '녹음 원고', extras: [] }], props: ['podcast_desk', 'acoustic_panel', 'plant'] }, recipes: pick(['podcast_desk', 'acoustic_panel']), note: note('소리가 새지 않게 벽을 막고, 흡음판과 마이크 테이블을 뒀어요.') };
  if (/촬영|영상|사진|유튜브|스튜디오|camera/i.test(need)) return { room: { id: 'shoot', name: '촬영 스튜디오', walls: 'glass', size: 'm', color: '#8A5BB8', stations: [{ role: 'designer', station: 'drafting', count: 1, label: '촬영 편집', extras: [] }], props: ['backdrop_stand', 'camera_tripod', 'ring_light'] }, recipes: pick(['backdrop_stand', 'camera_tripod', 'ring_light']), note: note('배경지 · 삼각대 · 링라이트를 두고 편집 자리를 붙였어요.') };
  if (/회의|미팅|손님|면담|meeting/i.test(need)) return { room: { id: 'meeting', name: '회의실', walls: 'glass', size: 'm', color: '#3E6A8A', stations: [], props: ['long_table', 'printer', 'plant'] }, recipes: {}, note: note('여섯 명이 앉는 긴 테이블과 출력기를 뒀어요.') };
  if (/휴게|라운지|카페|쉬|휴식|lounge/i.test(need)) return { room: { id: 'rest', name: '휴게 라운지', walls: 'open', size: 'm', color: '#C98A2E', stations: [], props: ['sofa', 'coffee_bar', 'armchair', 'plant'] }, recipes: {}, note: note('소파와 커피 바로 쉬어 가는 자리를 만들었어요.') };
  if (/자료|서재|도서|아카이브|책/i.test(need)) return { room: { id: 'archive', name: '자료실', walls: 'solid', size: 's', color: '#5B8DB8', stations: [{ role: 'researcher', station: 'desk', count: 1, label: '자료 정리', extras: [] }], props: ['bookshelf', 'bookshelf', 'lamp'] }, recipes: {}, note: note('책장 둘과 자료 정리 자리를 뒀어요.') };
  const name = need.replace(/\s*(이|가|을|를|은|는)?\s*(필요|만들|지어|있으면|원해|좋겠|갖고).*$/, '').trim().slice(0, 12) || '프로젝트 룸';
  return { room: { id: 'project', name, walls: 'glass', size: 'm', color: '#6FA37F', stations: [{ role: null, station: 'desk', count: 2, label: '프로젝트', extras: [] }], props: ['plant', 'printer'] }, recipes: {}, note: note('누구나 앉을 수 있는 자리 둘과 출력기를 뒀어요.') };
}
const form = (c: Ctx): ToneForm => ((c.style as EmployeeStyle | undefined)?.tone.form ?? 'haeyo');
const t3 = (c: Ctx, haeyo: string, hamnida: string, banmal: string): string => ({ haeyo, hamnida, banmal })[form(c)];

function topicOf(c: Ctx): string {
  const brief = (c.brief ?? {}) as Record<string, unknown>;
  return s(brief.direction) || s(c.description).slice(0, 30) || '이번 주 주제';
}

function task(kind: string, c: Ctx): Record<string, unknown> {
  const topic = topicOf(c);
  const fb = s(c.feedback);
  const revised = fb ? `\n\n> 수정 요청 반영: ${fb}` : '';
  const base = { sources: [] as string[] };
  switch (kind) {
    case 'research':
      return { ...base, title: '이번 주 트렌드 3가지', body: `## 이번 주 트렌드 (견본)\n1. 1인 사업자 자동화 도구 관심 증가 (가정)\n2. 무료 대안 도구 비교 검색 증가 (가정)\n3. 주간 회고 템플릿 수요 꾸준 (가정)\n\n각도 제안: “${topic}”와 연결한 비교 리뷰${revised}`, note: t3(c, '조사 정리했어요. 출처 확인이 필요한 건 (가정)으로 표시했어요.', '조사를 정리했습니다. 출처 확인이 필요한 항목은 (가정)으로 표시했습니다.', '조사 정리했어. 확인 필요한 건 (가정)으로 표시해 뒀어.') };
    case 'plan':
      return { ...base, title: '주간 콘텐츠 기획', body: `## 이번 주 기획 (견본)\n- 블로그: “혼자 일할 때 꼭 필요한 자동화 3가지”\n- 뉴스레터: 이번 주 핵심 3가지 + 블로그 소개\n- SNS: Threads 3편(짧은 팁), LinkedIn 3편(인사이트)\n- 근거: ${(c.inputs as string[] | undefined)?.join(', ') || '조사 자료 없음 — 가정으로 기획'}${revised}`, note: t3(c, '기획 확정했어요. 작가에게 넘길게요.', '기획을 확정했습니다. 작가에게 전달하겠습니다.', '기획 끝! 작가한테 넘길게.') };
    case 'blog_draft':
      return { ...base, title: '혼자 일할 때 꼭 필요한 자동화 3가지', excerpt: '반복 작업을 줄이는 가장 쉬운 자동화 세 가지를 골랐어요. 오늘 하나만 시작해 보세요.', tags: ['자동화', '1인 창업', '생산성'], body: `혼자 일하면 반복 작업이 시간을 가장 많이 먹어요. (견본)\n\n## 1. 일정 자동 정리\n캘린더와 할 일 목록을 한곳에 모으면 아침 10분이 생겨요.\n\n## 2. 자료 수집 자동화\n관심 키워드 알림만 걸어 두어도 조사 시간이 줄어요. (가정)\n\n## 3. 주간 회고 템플릿\n금요일 10분 회고가 다음 주 계획을 대신해 줘요.\n\n이번 주에 하나만 먼저 해보세요.${revised}`, note: t3(c, '블로그 초안 나왔어요.', '블로그 초안을 완성했습니다.', '블로그 초안 나왔어.') };
    case 'newsletter':
      return { ...base, title: '이번 주 뉴스레터 초안', body: `안녕하세요! (견본)\n\n## 이번 주 핵심 3가지\n1. 자동화 도구 관심 증가\n2. 무료 대안 찾기\n3. 회고 습관\n\n## 이번 주 글\n“혼자 일할 때 꼭 필요한 자동화 3가지”\n\n다음 주에 만나요.${revised}`, note: t3(c, '뉴스레터 초안 저장해 둘게요. 발송은 하지 않아요.', '뉴스레터 초안을 저장하겠습니다. 발송은 하지 않습니다.', '뉴스레터 초안 저장해 둘게. 발송은 안 해.') };
    case 'sns_draft': {
      const single = s(c.single);
      const all = [
        { platform: 'threads', text: `반복 작업, 하루에 몇 분 쓰고 있나요? 저는 일정 정리 자동화로 아침 10분을 벌었어요. (견본)${fb ? ' — 수정 반영' : ''}` },
        { platform: 'threads', text: '무료 도구만으로도 자료 수집 자동화는 충분해요. 키워드 알림부터 걸어 보세요. (견본)' },
        { platform: 'threads', text: '금요일 10분 회고, 해보셨나요? 다음 주 계획이 절반은 끝나요. (견본)' },
        { platform: 'linkedin', text: `혼자 일하는 사람에게 자동화는 선택이 아니라 생존 전략입니다. (견본)\n\n이번 주에 정리한 세 가지 자동화를 공유합니다.${fb ? '\n\n(수정 반영)' : ''}` },
        { platform: 'linkedin', text: '1인 사업자의 가장 비싼 자원은 시간입니다. 반복 작업을 줄이는 작은 습관을 소개합니다. (견본)' },
        { platform: 'linkedin', text: '주간 회고가 다음 주 계획을 대신하는 이유. (견본)' },
      ];
      const per = Number(((c.brief ?? {}) as Record<string, unknown>).snsPerPlatform ?? 3) || 3;
      const posts = single ? all.filter((p) => p.platform === single).slice(0, 1) : [...all.filter((p) => p.platform === 'threads').slice(0, per), ...all.filter((p) => p.platform === 'linkedin').slice(0, per)];
      return { ...base, title: single ? 'SNS 글 수정본' : 'SNS 글 6편', body: posts.map((p, n) => `### ${p.platform === 'threads' ? 'Threads' : 'LinkedIn'} ${n + 1}\n${p.text}`).join('\n\n'), posts, note: t3(c, 'SNS 글 묶음 준비했어요.', 'SNS 글 묶음을 준비했습니다.', 'SNS 글 묶음 준비했어.') };
    }
    case 'image_brief':
      return { ...base, title: '썸네일·이미지 기획', body: `## 썸네일 1200×630 (견본)\n- 문구: “자동화 3가지”\n- 구도: 왼쪽 큰 문구, 오른쪽 체크리스트\n\n## SNS 정사각 1080×1080\n- 문구: “아침 10분 벌기”${revised}`, prompts: [{ use: 'thumbnail', prompt: 'minimal flat illustration of a solo worker with a checklist, warm beige and forest green, plenty of empty space for a title' }, { use: 'square', prompt: 'flat illustration of a calm desk with a clock and a coffee mug, warm beige palette' }], note: t3(c, '이미지 기획안 만들었어요.', '이미지 기획안을 만들었습니다.', '이미지 기획안 만들었어.') };
    case 'review':
      return { ...base, title: '검수 메모', body: `## 검수 메모 (견본)\n- 톤: 브랜드 톤과 맞음\n- 근거: (가정) 표시 2곳 — 게시 전 확인 권장\n- 길이: 채널 규격 안\n받은 결과물: ${(c.inputs as string[] | undefined)?.join(', ') || '없음'}`, issues: [{ item: '블로그', severity: 'warn', text: '(가정) 표시 문장 1곳 — 근거 확인 권장' }, { item: 'LinkedIn 1', severity: 'info', text: '첫 문장이 길어요' }], note: t3(c, '검수 끝났어요. 게시 확인 부탁드려요.', '검수를 마쳤습니다. 게시 확인 부탁드립니다.', '검수 끝! 게시 확인 부탁해.') };
    case 'seo_keywords':
      return { ...base, title: '검색 키워드 브리프', keywords: ['1인 창업 자동화', '무료 업무 자동화 도구', '주간 회고 템플릿'], titles: ['1인 창업자를 위한 무료 자동화 도구 3가지', '혼자 일할 때 시간을 버는 자동화 방법'], body: `## 검색 의도 (견본)\n- 무료로 바로 쓸 수 있는 자동화 방법을 찾는 1인 사업자 (가정)\n- 소제목에 넣을 표현: “무료”, “10분”, “템플릿”\n\n검색량 수치는 확인하지 않았어요 (가정).${revised}`, note: t3(c, '키워드 브리프 넘길게요.', '키워드 브리프를 전달하겠습니다.', '키워드 브리프 넘길게.') };
    case 'edit':
      return { ...base, title: '혼자 일할 때 꼭 필요한 자동화 3가지', excerpt: '반복 작업을 줄이는 가장 쉬운 자동화 세 가지를 골랐어요. 오늘 하나만 시작해 보세요.', tags: ['자동화', '1인 창업', '생산성'], body: `혼자 일하면 반복 작업이 시간을 가장 많이 잡아먹어요. (견본 · 교정본)\n\n## 1. 일정 자동 정리\n캘린더와 할 일 목록을 한곳에 모으면 아침 10분이 생겨요.\n\n## 2. 자료 수집 자동화\n관심 키워드 알림만 걸어 두어도 조사 시간이 줄어요. (가정)\n\n## 3. 주간 회고 템플릿\n금요일 10분 회고가 다음 주 계획을 대신해 줘요.\n\n이번 주에는 하나만 먼저 해 보세요.${revised}`, note: t3(c, '교정했어요: 띄어쓰기 2곳, 어색한 표현 1곳. 의미는 그대로예요.', '교정을 마쳤습니다: 띄어쓰기 2곳, 어색한 표현 1곳을 고쳤습니다.', '교정 끝: 띄어쓰기 2곳, 어색한 표현 1곳 고쳤어.') };
    case 'video_script':
      return { ...base, title: '숏폼 대본 — 자동화 3가지', body: `## 30초 숏폼 대본 (견본)\n| 장면 | 화면 | 자막 · 내레이션 |\n|---|---|---|\n| 1 (0–3초) | 쌓인 할 일 목록 | “아침 10분, 어디로 사라질까요?” |\n| 2 | 캘린더 정리 화면 | 일정 자동 정리 |\n| 3 | 키워드 알림 | 자료 수집 자동화 |\n| 4 | 회고 템플릿 | 금요일 10분 회고 |\n| 5 | 블로그 링크 | “하나만 먼저 해 보세요” |${revised}`, note: t3(c, '숏폼 대본 나왔어요. 영상 파일은 만들지 않았어요.', '숏폼 대본을 완성했습니다. 영상 파일은 만들지 않았습니다.', '숏폼 대본 나왔어. 영상 파일은 안 만들었어.') };
    case 'promo_plan':
      return { ...base, title: '이번 주 배포 계획', body: `## 배포 계획 (견본)\n1. 화 08:30 LinkedIn — 출근길에 읽히는 인사이트\n2. 화 09:00 블로그 — 본문 공개\n3. 수 12:00 Threads — 점심 짧은 팁\n\n## 홍보 문구\n- “아침 10분을 되찾는 가장 쉬운 방법”\n- “무료 도구로 시작하는 자동화 3가지”\n\n반응 수치는 모으지 않아요.${revised}`, note: t3(c, '배포 계획 정리했어요. 게시는 대표님 확인 뒤에만 해요.', '배포 계획을 정리했습니다. 게시는 대표님 확인 후에 진행합니다.', '배포 계획 정리했어. 게시는 대표 확인 뒤에만.') };
    default:
      return { ...base, title: s(c.title, '결과물'), body: '(견본)', note: '' };
  }
}

function hire(purpose: string, c: Ctx): Record<string, unknown> {
  if (purpose === 'hire:interview') {
    const archetypes = (c.archetypes as string[] | undefined) ?? ['careful', 'growth', 'story'];
    return { candidates: archetypes.map((a) => ({ archetype: a, ...managerDiag(a) })) };
  }
  if (purpose === 'hire:samples') {
    const role = s(c.role, 'researcher');
    const name = s(c.name, '우리 가게');
    const samples: Record<string, string[]> = {
      researcher: ['• 비슷한 대안 3곳 — 가격대는 확인 필요 (가정)\n• 고객은 지금 검색 · 지인 추천으로 해결\n• 빈틈: 빠르고 맞춤인 선택 (견본)', '핵심 세 줄: 대안은 많지만 맞춤이 없음 · 가격은 비슷 · 첫 고객은 가까운 곳에서 (견본)'],
      writer: [`${name} — 처음이라도 쉽게, 딱 맞게. 고민은 짧게 하고 선택은 정확하게 하세요. (견본)`, `${name}는 당신의 하루를 조금 가볍게 만들고 싶어요. 오늘 하나만 바꿔 보세요. (견본)`],
      designer: ['첫 화면: 큰 한 줄 소개 + 따뜻한 베이지 · 그린 2색 (견본)', '로고: 손글씨 이니셜 + 동그라미, 한 가지 색 (견본)'],
      marketer: ['채널: 동네 · 관련 커뮤니티 — “먼저 써 보실 분 10명을 찾아요” (견본)', '채널: 지인 소개 — “딱 10명에게만 먼저 보여 드려요” (견본)'],
      editor: ['전: “시간을 많이 먹어요” → 후: “시간을 가장 많이 잡아먹어요” — 뜻을 또렷하게 (견본)', '전: “해보세요” → 후: “해 보세요” — 보조 용언 띄어쓰기 (견본)'],
      producer: [`“${name}, 30초면 알아요” — 첫 장면은 대표의 손 (견본)`, '“이거 하나 바꿨더니” — 전후 비교로 시작 (견본)'],
      seo: [`키워드: ${name} · 추천 · 가격 / 제목: “처음 찾는 분을 위한 ${name} 안내” (견본)`, '키워드: 비교 · 후기 · 가격 / 제목: “고르기 전에 알아 둘 세 가지” (견본)'],
    };
    const list = samples[role] ?? samples.researcher!;
    return { candidates: ((c.archetypes as string[] | undefined) ?? ['careful', 'fast']).map((a, i) => ({ archetype: a, sample: list[i % list.length] })) };
  }
  return {};
}

/** 인계 메모 견본(결정 80) — 형식은 실제와 같다 */
function fakeHandoff(data: Record<string, unknown>, c: Ctx): Record<string, unknown> {
  const inputs = (c.inputs as string[] | undefined) ?? [];
  return {
    purpose: `${s(data.title, s(c.title, '결과물'))} — 다음 단계가 바로 쓸 수 있게 정리 (견본)`,
    decisions: [{ what: '핵심 메시지 하나에 집중', why: '대표가 한 번에 확인하기 쉽게 (견본)' }],
    assumptions: ['첫 고객의 문제가 충분히 크다 (가정)'],
    openQuestions: inputs.length ? [] : ['받은 자료가 없어 일반 지식으로 썼어요'],
    mustKeep: ['(가정) 표시는 지우지 말 것'],
    sources: inputs.length ? inputs.slice(0, 4) : [],
    confidence: inputs.length ? 'mid' : 'low',
  };
}

export function fakeData(purpose: string, context: Ctx = {}): Record<string, unknown> {
  if (purpose === 'task:answer') {
    return { title: '질문에 답하기', body: `물어본 “${s(context.question).slice(0, 60)}”에 답할게요: 받은 자료의 (가정) 표시는 아직 확인 전이에요. 그대로 쓰되 (가정)을 지우지 말아 주세요. (견본)`, note: '', sources: [] };
  }
  if (purpose.startsWith('task:')) {
    const data = purpose.includes('.') ? fakeBlockTask(purpose.slice(5), context) : task(purpose.slice(5), context);
    return { ...data, handoff: fakeHandoff(data, context) };
  }
  if (purpose === 'setup:questions') return fakeQuestions(context);
  if (purpose === 'setup:blueprint') return fakeBlueprint(context);
  if (purpose === 'setup:revise') return fakeRevise(context);
  if (purpose.startsWith('hire:')) return hire(purpose, context);
  if (purpose === 'space:design') return spaceSample(context);
  if (purpose === 'space:room') return roomSample(context);
  if (purpose === 'dm:reply') {
    return { reply: t3(context, `알겠어요. “${s(context.message).slice(0, 40)}” 기억해 둘게요. (견본)`, `알겠습니다. “${s(context.message).slice(0, 40)}” 반영하겠습니다. (견본)`, `알겠어. “${s(context.message).slice(0, 40)}” 기억할게. (견본)`) };
  }
  return {};
}
