// 홈(결정 74) — 10초 안에 "창업 초보에게 AI 팀이 붙는구나"를 알고 [무료로 시작]을 누르게
import { html, SOURCE_URL, useEffect, useRef, useState } from '../lib.js';
import { Footer, Header } from './common.js';
import { ic } from '../icons.js';

/** 사업마다 다른 사무실 — 견본 설계도(결정 67) */
const SPACES = [['content', '콘텐츠 브랜드'], ['music', '음악 레이블'], ['lab', '연구 스타트업']];
const CREW = [
  { id: 'd1', name: '미나', role: 'manager', rank: '매니저(팀장)', status: 'working', statusLabel: '계획 정리 중', mode: 'type', bubble: '이번 달 목표 세 가지로 정리했어요' },
  { id: 'd2', name: '준', role: 'researcher', rank: '사원', status: 'working', statusLabel: '시장 조사 중', mode: 'read', bubble: null },
  { id: 'd3', name: '하나', role: 'writer', rank: '사원', status: 'idle', statusLabel: '대기', mode: 'idle', bubble: null },
  { id: 'd4', name: '레오', role: 'designer', rank: '사원', status: 'working', statusLabel: '시안 그리는 중', mode: 'type', bubble: null },
];
const FLOW = [['조사', 'done', '준'], ['기획', 'active', '미나'], ['준비', 'none', ''], ['출시', 'none', ''], ['검수', 'none', ''], ['확인', 'none', '대표'], ['완료', 'none', '']].map(([label, state, who]) => ({ label, state, who: who ? [who] : [] }));

/** 살아 움직이는 3D 사무실 — 화면에 들어오면 불러온다. WebGL이 없으면 안내 글만 */
function Stage3D() {
  const box = useRef(null), host = useRef(null), over = useRef(null), hq = useRef(null);
  const [space, setSpace] = useState('content');
  const [seen, setSeen] = useState(false);
  const [fail, setFail] = useState(!window.WebGL2RenderingContext);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(box.current); return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!seen || fail) return undefined;
    let alive = true;
    Promise.all([import('../office3d/office.js'), import('../office3d/layouts/index.js')])
      .then(async ([{ createOffice }, { loadSpace }]) => createOffice(host.current, over.current, { layout: await loadSpace(space) }))
      .then((h) => {
        if (!alive) { h.dispose(); return; }
        hq.current = h;
        h.update({ company: '내 사업', cycleLabel: '첫 주', flow: FLOW, decisions: 1, books: 3, trophies: 1, aiOn: true, aiLabel: 'AI', selectedId: null, employees: CREW });
        h.home(CREW);
      }).catch((e) => { console.warn('3D 미리보기를 못 띄웠어요', e); if (alive) setFail(true); });
    return () => { alive = false; hq.current?.dispose(); hq.current = null; if (over.current) over.current.innerHTML = ''; };
  }, [seen, space, fail]);
  return html`<div class="stage3d" ref=${box} aria-label="AI 팀이 일하는 3D 사무실 미리보기">
    ${fail ? html`<div class="still">사업에 맞춰 생기는 3D 사무실에서 AI 팀이 일해요</div>`
      : html`<div class="o3-canvas" ref=${host}></div><div class="o3-tags" ref=${over}></div>`}
    <div class="tabs3d">${SPACES.map(([k, l]) => html`<button class=${space === k ? 'on' : ''} onClick=${() => setSpace(k)}>${l}</button>`)}</div>
  </div>`;
}

/** 첫 주에 받는 것 — 견본(예: 동네 디저트 카페를 준비하는 대표) */
const SAMPLES = [
  { tag: '첫 주 · 매니저', title: '사업 진단 + 이번 달 실행 계획', body: `사업: 동네 디저트 카페 '오후세시'(견본)
단계: 준비 중 — 오픈 6주 전

이번 달 목표
① 상권 조사로 메뉴 가격대 정하기
② 영업 준비 체크리스트 끝내기
③ 오픈 알림 신청 50명 모으기

주차별 할 일
1주 상권 · 경쟁 가게 조사(리서처)
2주 메뉴 구성 · 원가 계산(매니저)
3주 공급처 비교 · 준비 체크리스트(리서처)
4주 오픈 알림 페이지 문구(작가)

대표님이 직접: 영업 신고 · 위생 교육 — 전문가 확인 필요
AI 팀이: 조사 · 계산 · 문구 초안` },
  { tag: '조사 · 리서처', title: '고객 인터뷰 질문지', body: `목표: 동네 손님이 디저트 카페를 고르는 이유 알기(견본)

1. 최근 한 달 동안 디저트 카페에 몇 번 가셨어요?
2. 마지막으로 간 곳은 어디였고, 왜 거기였나요?
3. 한 번에 보통 얼마를 쓰세요?
4. 다시 가고 싶지 않았던 곳이 있었다면 이유는요?
5. 집 앞에 생긴다면 어떤 메뉴가 있으면 가 볼 것 같아요?

진행 팁: 답을 고르게 하지 말고 지난 경험을 물어요.` },
  { tag: '준비 · 매니저', title: '오픈 준비 체크리스트', body: `☐ 영업 신고 · 위생 교육 — 대표님(전문가 확인 필요)
☐ 사업자 등록 — 대표님
☐ 원두 · 우유 공급처 3곳 비교 — 리서처
☐ 메뉴 8개 원가표 — 매니저
☐ 가격표 · 메뉴판 문구 — 작가
☐ 오픈 알림 페이지 — 작가 · 디자이너
☐ 오픈 첫 주 이벤트 안 — 마케터

AI 팀 몫은 매주 알아서 진행하고, 끝나면 확인을 요청해요.` },
];

function Sample({ s }) {
  const [open, setOpen] = useState(false);
  return html`<div class=${`sample${open ? ' open' : ''}`}><span class="tag">${s.tag}</span><h3>${s.title}</h3><div class="body">${s.body}</div>
    <button class="more" onClick=${() => setOpen(!open)}>${open ? '접기' : '펼쳐 보기'}</button></div>`;
}

const FAQ = [
  ['제 사업도 되나요?', '네. 카페 · 온라인 판매 · 앱 서비스 · 크리에이터 · 전문 서비스처럼 종류와 상관없이, 매니저가 인터뷰로 사업을 이해하고 그에 맞는 업무를 골라요. 블로그 · SNS 같은 일은 필요한 사업에서만 해요.'],
  ['AI는 무엇을 쓰나요?', '지금은 내 컴퓨터에서 내 Claude 구독(공식 Claude Code)으로 일해요. 공개 서비스에서 AI를 연결하는 방식과 비용은 준비 중이에요.'],
  ['비용이 얼마나 드나요?', '무료 오픈소스예요. AI는 대표님의 Claude 구독(공식 Claude Code에 직접 로그인)으로 일하고, 사용량은 화면에 따로 보여 드려요. 한도에 닿으면 그 일만 쉬어요 — 자동으로 더 과금되지 않아요.'],
  ['AI가 마음대로 밖에 올리거나 보내지 않나요?', '게시 · 발송 · 결제처럼 밖으로 나가는 일은 대표님이 확인한 뒤에만 해요. 처음에는 연습 게시(기록만)로 시작해요.'],
  ['틀린 내용을 지어내면요?', '근거가 없는 내용은 "(가정)"으로 표시하고, 법 · 세무 · 인허가처럼 틀리면 안 되는 내용은 "전문가 확인 필요"로 표시해요.'],
  ['데이터는 안전한가요? 그만두면요?', '내 데이터는 언제든 내보내기 · 삭제할 수 있어요. 지금은 내 컴퓨터에만 저장돼요.'],
];

export function Home({ me }) {
  const start = me?.mode === 'local' ? '/' : '/signup';
  return html`<div class="site"><${Header} me=${me} />
    <section class="hero"><div class="wrap">
      <div><p class="eyebrow">혼자 · 소수로 창업을 시작하는 대표님께</p>
        <h1>창업, 혼자 시작해도<br/>팀이 있어요.</h1>
        <p class="lead">하려는 사업을 말해 주세요. 매니저가 사업을 이해하고, AI 팀이 조사 · 계획 · 준비를 나눠 맡아요. 대표님은 확인만 하면 돼요.</p>
        <div class="cta"><a class="btn pri big" href=${start}>${me?.mode === 'local' ? '내 사무실 열기' : '무료로 시작'}</a><a class="btn big" href="#samples">첫 주에 받는 것 보기</a></div>
        <p class="tiny">무료 오픈소스 · 내 컴퓨터에서 돌아가요 · 언제든 그만둘 수 있어요</p></div>
      <${Stage3D} />
    </div></section>

    <section class="sec alt" id="how"><div class="wrap"><h2>어떻게 돌아가나요</h2><p class="lead">처음 10분이면 팀이 꾸려지고, 첫 주에 첫 결과물을 받아요.</p>
      <div class="steps">
        <div class="step"><b class="n">1</b><h3>사업을 설명해요</h3><p>무엇을, 누구에게 팔고 싶은지 편하게 적어요. 모르는 건 "잘 모르겠어요"로 넘겨도 돼요 — 매니저가 조사해서 제안해요.</p></div>
        <div class="step"><b class="n">2</b><h3>매니저가 사업 설계도를 짜요</h3><p>지금 단계 진단, 이번 달 목표, 주간 업무, 필요한 직원과 채용 순서, 대표님이 직접 할 일까지 한 장으로 정리해요.</p></div>
        <div class="step"><b class="n">3</b><h3>AI 팀이 일하고, 대표님은 확인만</h3><p>조사 · 계산 · 계획 · 문구를 팀이 나눠 맡고, 확인이 필요한 것만 결정함에 올라와요.</p></div>
      </div></div></section>

    <section class="sec" id="samples"><div class="wrap"><h2>첫 주에 받는 것</h2><p class="lead">예: 동네 디저트 카페를 준비하는 대표님(견본). 사업마다 내용과 업무가 달라져요.</p>
      <div class="samples">${SAMPLES.map((s) => html`<${Sample} s=${s} />`)}</div></div></section>

    <section class="sec alt"><div class="wrap"><h2>믿고 맡길 수 있게</h2><p class="lead">빠르게 일하되, 대표님이 모르게 일어나는 일은 없어요.</p>
      <div class="trust">
        <div><b>밖으로 나가는 일은 확인 뒤에만</b><p>게시 · 발송 · 결제는 대표님 확인 후. 처음엔 연습 게시로.</p></div>
        <div><b>모르면 '가정'이라고</b><p>근거 없는 내용은 표시하고, 법 · 세무는 전문가 확인을 권해요.</p></div>
        <div><b>과정이 다 보여요</b><p>누가 무엇을 하고 넘겼는지 사무실과 기록에 그대로 남아요.</p></div>
        <div><b>내 데이터는 내 것</b><p>언제든 내보내고 지울 수 있어요.</p></div>
      </div></div></section>

    <section class="sec"><div class="wrap"><h2>함께 자라는 사무실</h2><p class="lead">일할수록 사무실이 넓어지고, 직원은 대표님 방식을 배우고, 대표님이 들이는 시간은 줄어요.</p>
      <div class="grow">
        <div><i>${ic('office', 26)}</i><b>사업에 맞춰 생기는 공간</b><p>카페면 주방 같은, 연구면 실험실 같은 사무실이 생기고 실적으로 방을 지어요.</p></div>
        <div><i>${ic('book', 26)}</i><b>배우는 직원</b><p>"앞으로도 이렇게 해 줘"라고 한 번 말하면 다음부터 반영돼요.</p></div>
        <div><i>${ic('timer', 26)}</i><b>줄어드는 대표 시간</b><p>매주 대표님이 일한 시간을 재서 보여 드려요 — 줄어들수록 잘 맡겨지고 있는 거예요.</p></div>
      </div></div></section>

    <section class="sec alt" id="pricing"><div class="wrap"><h2>요금</h2>
      <div class="price"><b>무료 · 오픈소스</b><p>AGPL-3.0 오픈소스라 내 컴퓨터나 내 서버에 무료로 설치해 써요. AI는 대표님의 Claude 구독으로 일하고, 사용량은 화면에 따로 보여 드려요. 설치 없이 쓰는 관리형 서비스는 나중에 검토해요. <a href=${SOURCE_URL} target="_blank" rel="noopener">소스 코드 보기</a></p><a class="btn pri" href=${start}>무료로 시작</a></div></div></section>

    <section class="sec" id="faq"><div class="wrap"><h2>자주 묻는 질문</h2>
      <div class="faq">${FAQ.map(([q, a]) => html`<details><summary>${q}</summary><p>${a}</p></details>`)}</div></div></section>

    <section class="sec alt final"><div class="wrap"><h2>오늘, 첫 팀원을 만나 보세요</h2><p class="lead" style="margin:10px auto 0">사업을 설명하면 매니저 후보 세 명이 먼저 읽고 와요.</p>
      <div class="cta"><a class="btn pri big" href=${start}>${me?.mode === 'local' ? '내 사무실 열기' : '무료로 시작'}</a></div></div></section>
    <${Footer} />
  </div>`;
}
