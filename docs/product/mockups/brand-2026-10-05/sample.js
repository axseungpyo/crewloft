// 브랜드 시안 공통 견본 — 각 시안 HTML의 window.DIR(이름 · 낱말 · 마스코트 색 · 장단점)과 CSS 토큰으로 같은 화면을 그린다.
const D = window.DIR;

const P = {
  office: '<path d="M4 21V5l8-3v19M12 21V9l8 3v9M2 21h20M7 8h2M7 12h2M7 16h2M15 14h2M15 17h2"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/>',
  work: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  company: '<path d="M5 21V4h12l-2 4 2 4H5"/>',
  settings: '<path d="M4 6h9M19 6h1M4 12h3M13 12h7M4 18h11M21 18h-1"/><circle cx="16" cy="6" r="2.2"/><circle cx="10" cy="12" r="2.2"/><circle cx="18" cy="18" r="2.2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  alert: '<path d="M12 3.5l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  comment: '<path d="M4 5h16v11H9l-5 4z"/>',
  trust: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  draft: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
  insight: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 00-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0012 3z"/>',
  design: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10.5" r="1.3"/><circle cx="12" cy="7.5" r="1.3"/><circle cx="16" cy="10.5" r="1.3"/>',
  city: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  room: '<path d="M6 21V3h12v18M3 21h18"/><path d="M14 12v.01"/>',
  desk: '<path d="M3 10h18M5 10v10M19 10v10M8 10V6h8v4"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
};
const ic = (k, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[k]}</svg>`;

// 아이소메트릭 방 — 3D 사무실을 단순화한 그림. 재질 색은 --m-* 토큰에서 온다(3D 재질도 같은 토큰을 쓴다는 규칙).
const iso = (x, y, z = 0) => [300 + (x - y) * 24, 92 + (x + y) * 12 - z];
const poly = (pts, fill, extra = '') => `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="${fill}" ${extra}/>`;
function box(x, y, w, d, h, fill) {
  const t = [iso(x, y, h), iso(x + w, y, h), iso(x + w, y + d, h), iso(x, y + d, h)];
  const l = [iso(x, y + d, 0), iso(x + w, y + d, 0), iso(x + w, y + d, h), iso(x, y + d, h)];
  const r = [iso(x + w, y, 0), iso(x + w, y + d, 0), iso(x + w, y + d, h), iso(x + w, y, h)];
  return poly(l, fill) + poly(l, '#000', 'opacity=".16"') + poly(r, fill) + poly(r, '#000', 'opacity=".28"') + poly(t, fill);
}
function mascot(x, y, color, helm, name, state) {
  const [cx, cy] = iso(x, y);
  const tag = state === 'work' ? 'var(--info-text)' : 'var(--ink-3)';
  return `<g>
    <ellipse cx="${cx}" cy="${cy}" rx="15" ry="6" fill="#000" opacity=".16"/>
    <circle cx="${cx}" cy="${cy - 17}" r="15" fill="${color}"/>
    <ellipse cx="${cx - 5}" cy="${cy - 24}" rx="5" ry="3" fill="#fff" opacity=".35"/>
    <circle cx="${cx - 5}" cy="${cy - 16}" r="2.6" fill="#111"/><circle cx="${cx + 5}" cy="${cy - 16}" r="2.6" fill="#111"/>
    <path d="M${cx - 14} ${cy - 22} a14 13 0 0 1 28 0 z" fill="${helm}"/>
    <path d="M${cx + 12} ${cy - 30} l10 -7 l-2 9 z" fill="${helm}"/>
    <g transform="translate(${cx - 34} ${cy - 62})">
      <rect width="68" height="20" rx="10" fill="var(--surface)" stroke="var(--line)"/>
      <circle cx="11" cy="10" r="3" fill="${tag}"/>
      <text x="19" y="14" font-size="10.5" font-family="var(--font-ui)" font-weight="700" fill="var(--ink)">${name}</text>
    </g></g>`;
}
function room() {
  const floor = [iso(0, 0), iso(10, 0), iso(10, 10), iso(0, 10)];
  const wl = [iso(0, 10), iso(0, 0), iso(0, 0, 70), iso(0, 10, 70)];
  const wr = [iso(0, 0), iso(10, 0), iso(10, 0, 70), iso(0, 0, 70)];
  let grid = '';
  for (let i = 1; i < 10; i++) grid += `<line x1="${iso(i, 0)[0]}" y1="${iso(i, 0)[1]}" x2="${iso(i, 10)[0]}" y2="${iso(i, 10)[1]}" stroke="var(--m-floor-line)"/><line x1="${iso(0, i)[0]}" y1="${iso(0, i)[1]}" x2="${iso(10, i)[0]}" y2="${iso(10, i)[1]}" stroke="var(--m-floor-line)"/>`;
  const [m1, m2, m3] = D.mascots;
  return `<svg class="room" viewBox="0 0 600 340" preserveAspectRatio="xMidYMid meet">
    <ellipse cx="300" cy="230" rx="330" ry="120" fill="var(--m-ground)"/>
    ${poly(floor, 'var(--m-floor)')}${grid}
    ${poly(wl, 'var(--m-wall)')}${poly(wr, 'var(--m-wall-2)')}
    ${poly([iso(3, 0, 58), iso(7, 0, 58), iso(7, 0, 22), iso(3, 0, 22)], 'var(--m-glass)')}
    ${box(1.2, 1, 2.6, 1.2, 16, 'var(--m-desk)')}${box(5.5, 1, 2.6, 1.2, 16, 'var(--m-desk)')}
    ${box(7.6, 5.6, 1.6, 1.6, 26, 'var(--m-feature)')}
    ${box(1.2, 6.5, 3.2, 1.3, 10, 'var(--m-trim)')}
    <g transform="translate(${iso(8.4, 6.4, 26)[0] - 14} ${iso(8.4, 6.4, 26)[1] - 34})"><rect width="28" height="18" rx="9" fill="var(--decide)"/><text x="14" y="13" font-size="10.5" text-anchor="middle" fill="var(--decide-ink)" font-weight="700" font-family="var(--font-num)">2</text></g>
    ${mascot(2.5, 3, m1.c, m1.h, '미나', 'work')}
    ${mascot(6.8, 3, m2.c, m2.h, '준', 'work')}
    ${mascot(4.6, 6.2, m3.c, m3.h, '하나', 'wait')}
  </svg>`;
}

function frame(dark) {
  return `<div class="${dark ? 'theme-dark' : ''}"><div class="frame">
    <nav class="rail">
      <div class="mark">로고<br>자리</div>
      <a class="on" href="#">${ic('office')}사무실</a>
      <a href="#">${ic('inbox')}결정함<span class="badge">2</span></a>
      <a href="#">${ic('work')}일</a>
      <a href="#">${ic('company')}회사</a>
      <a href="#">${ic('settings')}설정</a>
      <span class="live"><i></i>연결됨</span>
    </nav>
    <div class="main">
      <div class="top">
        <div><div class="eyebrow">골목커피</div><h2>10월 2주차</h2></div><span class="sp"></span>
        <div class="chips">
          <span class="pill p-work">${ic('play')}2명 일하는 중</span>
          <span class="chip res">${ic('trust')}신뢰 <b>43</b></span>
          <span class="chip res">${ic('draft')}원고 <b>30</b></span>
        </div>
      </div>
      <div class="stage">${room()}
        <div class="zoom"><span>${ic('city', 'sm')}</span><span class="on">${ic('room', 'sm')}</span><span>${ic('desk', 'sm')}</span></div>
        <div class="float decide"><h4>${ic('inbox', 'sm')}확인할 것 <b>2</b></h4>
          <div class="it"><span class="pill p-decide">${ic('doc')}확인</span>메뉴 원가 · 가격표</div>
          <div class="it"><span class="pill p-decide">${ic('doc')}확인</span>준비 체크리스트</div>
          <button class="btn decide sm go">결정함에서 보기</button></div>
      </div>
      <div class="dock">
        <div class="blk"><span class="t"><i>1</i>가격 · 원가 계산</span><div class="bar"><i style="width:100%"></i></div><span class="pill p-decide">${ic('doc')}대표 확인 1</span></div>
        <div class="blk"><span class="t"><i>2</i>준비 체크리스트</span><div class="bar"><i style="width:60%"></i></div><span class="pill p-work">${ic('play')}하나가 하는 중</span></div>
        <div class="blk"><span class="t"><i>3</i>주간 돌아보기</span><div class="bar"><i style="width:0"></i></div><span class="pill p-wait">${ic('time')}목요일 시작</span></div>
      </div>
    </div></div>
    <p class="frame-cap">${(D.caps || ['밝은 모드 — 사무실 메인 · 결정 대기 · 이번 주 블록', '어두운 모드 — 밤 시간대(결정 75)와 같은 결'])[dark ? 1 : 0]}</p></div>`;
}

function swatches() {
  const keys = [['--bg', '바탕'], ['--surface', '면'], ['--ink', '글자'], ['--ink-2', '보조 글자'], ['--line', '선'], ['--accent', '주 색(행동)'], ['--decide', '결정 · 대표 몫'], ['--grow', '성장 · 자원'], ['--info', '일하는 중'], ['--ok', '끝 · 확정'], ['--bad', '문제'], ['--rail-bg', '왼쪽 막대']];
  const cs = getComputedStyle(document.documentElement);
  return `<div class="sw">${keys.map(([k, n]) => `<div><i style="background:var(${k})"></i><span><b>${n}</b><br><code>${k} ${cs.getPropertyValue(k).trim()}</code></span></div>`).join('')}</div>`;
}

function render() {
  document.title = `브랜드 시안 ${D.id} — ${D.name}`;
  document.getElementById('app').innerHTML = `<div class="wrap">
  <header class="dir-head"><div><div class="kicker">시안 ${D.id} · ${D.en}</div><h1>${D.name}</h1><p class="lead">${D.lead}</p></div>
    <div class="words">${D.words.map((w) => `<span>${w}</span>`).join('')}</div></header>
  <div class="frames">${frame(false)}${frame(true)}</div>

  <section class="sec"><h3>색 토큰</h3>${swatches()}</section>

  <section class="sec grid3">
    <div class="box"><h3 style="font-size:13px;color:var(--ink-3);margin-bottom:6px">글꼴 — ${D.fonts}</h3>
      <div class="type-row"><small>제목 32</small><span style="font-family:var(--font-display);font-weight:var(--display-weight);letter-spacing:var(--display-track);font-size:32px">팀이 일했어요</span></div>
      <div class="type-row"><small>화면 제목 22</small><span style="font-family:var(--font-display);font-weight:var(--display-weight);letter-spacing:var(--display-track);font-size:22px">결정함</span></div>
      <div class="type-row"><small>본문 14</small><span>하나가 준비 체크리스트를 정리했어요. 확인해 주세요.</span></div>
      <div class="type-row"><small>숫자</small><span class="num" style="font-size:24px;font-weight:700">43 · 1,280원 · 2/7</span></div>
      <div class="type-row"><small>작은 글 12</small><span style="font-size:12px;color:var(--ink-2)">10월 2주차 · 2번째 회차</span></div></div>
    <div class="box"><h3 style="font-size:13px;color:var(--ink-3);margin-bottom:10px">아이콘 — ${D.iconRule}</h3>
      <div class="icons">${['office', 'inbox', 'work', 'company', 'settings', 'comment', 'trust', 'draft', 'insight', 'design', 'lock', 'alert'].map((k) => `<div>${ic(k)}${k}</div>`).join('')}</div></div>
    <div class="box stack"><h3 style="font-size:13px;color:var(--ink-3)">버튼 · 상태</h3>
      <div class="row"><button class="btn pri">다음 회차 시작</button><button class="btn decide">확정</button><button class="btn">수정 요청</button><button class="btn quiet">나중에</button></div>
      <div class="row"><span class="pill p-work">${ic('play')}일하는 중</span><span class="pill p-decide">${ic('doc')}대표 확인</span><span class="pill p-done">${ic('check')}끝</span><span class="pill p-wait">${ic('pause')}멈춤</span><span class="pill p-bad">${ic('alert')}다시 연결 필요</span><span class="pill p-grow">${ic('lock')}Lv 2에서 열려요</span></div>
      <p class="rule">${D.colorRule}</p></div>
  </section>

  <section class="sec grid3">
    <div class="box"><h3 style="font-size:13px;color:var(--ink-3);margin-bottom:10px">3D 재질 — 같은 토큰에서</h3>
      <div class="mat">${[['--m-floor', '바닥'], ['--m-wall', '벽'], ['--m-desk', '가구'], ['--m-feature', '기능 시설'], ['--m-ground', '바깥 땅'], ['--m-sky', '하늘 · 무대']].map(([k, n]) => `<div><i style="background:var(${k})"></i>${n}</div>`).join('')}
        ${D.mascots.map((m, i) => `<div><i style="background:radial-gradient(circle at 35% 30%, #ffffff66, transparent 40%), ${m.c}"></i>마스코트 ${i + 1}</div>`).join('')}</div></div>
    <div class="box"><h3 style="font-size:13px;color:var(--ink-3);margin-bottom:8px">3D와 2D를 한 결로</h3><p class="rule">${D.oneLook}</p></div>
    <div class="box"><h3 style="font-size:13px;color:var(--ink-3);margin-bottom:8px">어두운 모드</h3><p class="rule">${D.dark}</p></div>
  </section>

  <section class="sec pros">
    <div class="box"><b>좋은 점</b><ul>${D.pros.map((x) => `<li>${x}</li>`).join('')}</ul></div>
    <div class="box"><b>아쉬운 점 · 위험</b><ul>${D.cons.map((x) => `<li>${x}</li>`).join('')}</ul></div>
  </section>
  </div>`;
}
render();
