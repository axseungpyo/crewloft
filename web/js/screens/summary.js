// S6 복귀 요약·리플레이(결정 51) — 부재 후 접속 시 사무실 위 레이어. 결정 → 새 결과 → 지켜볼 것 → 그 밖에.
import { Portrait } from '../art.js';
import { act, api, go, hhmm, html, mins, useApi, useEffect, useRef, useState, when } from '../lib.js';
import { officeSVG, VB } from '../office-art.js';
import { ic } from '../icons.js';

const AWAY_MS = 30 * 60_000;
const KIND_COLOR = { handoff: 'var(--info)', result: 'var(--ok)', decision: 'var(--decide)', dm: 'var(--ink-2)', system: 'var(--ink-3)' }; // 색 토큰(base.css)

function dur(ms) {
  const total = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(total / 60), m = total % 60;
  return h ? `${h}시간${m ? ` ${m}분` : ''}` : `${m}분`;
}

function Replay({ data, state, onClose }) {
  const ev = data.replay;
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const timer = useRef(0);
  useEffect(() => {
    if (!playing || !ev.length) return undefined;
    timer.current = setTimeout(() => (i < ev.length - 1 ? setI(i + 1) : setPlaying(false)), step / speed);
    return () => clearTimeout(timer.current);
  }, [i, playing, speed, ev.length]);
  if (!ev.length) return html`<div class="replay card"><p class="empty">부재 동안의 기록이 없어요.</p><button class="btn" onClick=${onClose}>닫기</button></div>`;
  const cur = ev[i];
  // 하이라이트는 15–30초 안에(결정 51) — 기록이 많으면 장면당 시간을 줄인다
  const step = Math.max(350, Math.min(1600, 24000 / ev.length));
  const span = Date.parse(ev.at(-1).at) - Date.parse(ev[0].at);
  const employees = state.employees.map((e) => ({ ...e, pose: e.id === cur.actorId ? (cur.kind === 'result' ? 'type' : cur.kind === 'dm' ? 'sit' : 'read') : 'sit', status: e.id === cur.actorId ? 'working' : 'idle', promoted: false, bubble: null }));
  const { svg, anchors } = officeSVG({ employees, showEmpty: false, aiOn: true, brand: state.office?.name ?? '', flow: state.flow, books: 0, trophies: 0, mail: 0, decor: state.decor ?? {}, selectedId: cur.actorId });
  const p = cur.actorId ? anchors[cur.actorId] : null;
  const openDecisions = data.sections.decide.items.length;
  return html`<div class="replay card">
    ${openDecisions > 0 && html`<a class="rp-banner" href="#/decisions" onClick=${onClose}>확인할 것 ${openDecisions}개 — 확인하러 가기</a>`}
    <div class="rp-grid">
      <div class="rp-scene"><svg viewBox=${`0 0 ${VB.w} ${VB.h}`} preserveAspectRatio="xMidYMid meet" dangerouslySetInnerHTML=${{ __html: svg }}></svg>
        ${p && html`<div class="o-tag" style=${`left:${(p.x / VB.w) * 100}%;top:${(p.y / VB.h) * 100}%`}><div class="o-bubble">${cur.text}</div></div>`}
        <div class="rp-time">${when(cur.at)} · ${i + 1}/${ev.length}</div></div>
      <ol class="rp-list">${ev.map((e, k) => html`<li class=${k === i ? 'on' : ''} onClick=${() => { setI(k); setPlaying(false); }}><i style=${`background:${KIND_COLOR[e.kind]}`}></i><time>${hhmm(e.at)}</time><span>${e.text}</span></li>`)}</ol>
    </div>
    <div class="rp-bar">${ev.map((e, k) => html`<span style=${`left:${(k / Math.max(1, ev.length - 1)) * 100}%;background:${KIND_COLOR[e.kind]}`} class=${k <= i ? 'past' : ''}></span>`)}</div>
    <div class="row"><button class="btn sm" onClick=${() => setPlaying(!playing)}>${ic(playing ? 'pause' : 'play')}</button><button class="btn sm" onClick=${() => setSpeed(speed === 1 ? 2 : 1)}>${speed}×</button><button class="btn sm" onClick=${() => { setI(0); setPlaying(true); }}>다시보기</button>
      <span class="muted">실제 기록만 · ${dur(span)} → ${Math.round((ev.length * step) / 1000 / speed)}초</span><span class="sp"></span><button class="btn sm pri" onClick=${onClose}>사무실로</button></div>
  </div>`;
}

export function ReturnSummary({ state }) {
  const [open, setOpen] = useState(false);
  const [replay, setReplay] = useState(false);
  const [checked, setChecked] = useState(false);
  const d = useApi(checked && !open ? null : '/api/summary').data;
  useEffect(() => {
    if (!d || checked) return;
    setChecked(true);
    const away = d.lastSeen ? Date.now() - Date.parse(d.lastSeen) : 0;
    if (!d.lastSeen) act(() => api('POST', '/api/summary/seen'));
    else if (away > AWAY_MS && d.newEvents > 0) setOpen(true);
    else act(() => api('POST', '/api/summary/seen'));
  }, [d]);
  useEffect(() => { const on = () => { if (document.visibilityState === 'hidden') navigator.sendBeacon?.('/api/summary/seen', new Blob(['{}'], { type: 'application/json' })); }; document.addEventListener('visibilitychange', on); return () => document.removeEventListener('visibilitychange', on); }, []);
  if (!open || !d) return null;
  const close = (to) => { act(() => api('POST', '/api/summary/seen')); setOpen(false); if (to) go(to); };
  const s = d.sections;
  return html`<div class="summary-layer">
    ${replay ? html`<${Replay} data=${d} state=${state} onClose=${() => close()} />` : html`<div class="letter card">
      <div class="row">${d.manager && html`<${Portrait} look=${d.manager.look} size=${64} role=${d.manager.roleKey} rank=${d.manager.rank} />`}<div><p class="eyebrow">${d.manager ? `${d.manager.name}의 보고` : '복귀 요약'}</p>
        <h1>다녀오셨어요</h1><p class="muted">나간 시각 ${when(d.lastSeen)} · 지금 ${when(d.now)} · ${dur(Date.parse(d.now) - Date.parse(d.lastSeen))} 동안</p></div></div>
      <section><h3>① 결정해 주실 것</h3><p class="mline">${s.decide.line}</p>${s.decide.items.slice(0, 6).map((x) => html`<a class="srow" href=${`#/decisions/${x.id}`} onClick=${() => close()}>${x.changed && html`<span class="pill st-issue">변경됨</span>`}${x.isNew && html`<span class="pill st-me">새로</span>`}<span>${x.title}</span><small>${x.platform ?? ''}${x.at ? ` · ${when(x.at)}` : ''}</small></a>`)}</section>
      <section><h3>② 새로 끝난 것</h3><p class="mline">${s.done.line}</p>${s.done.artifacts.slice(-6).map((a) => html`<div class="srow"><span>${a.title}</span><small>${a.by} · v${a.version}</small></div>`)}
        ${s.done.published.map((p) => html`<div class="srow"><span>${p.title}</span><small>${p.platform} ${p.live ? '게시' : '연습 게시'}</small>${p.url && html`<a href=${p.url} target="_blank" rel="noopener noreferrer">열기 ${ic('share', 12)}</a>`}</div>`)}</section>
      <section><h3>③ 지켜볼 것</h3><p class="mline">${s.watch.line}</p>${s.watch.items.map((w) => html`<a class="srow" href=${w.link} onClick=${() => close()}><span>${w.text}</span></a>`)}</section>
      <section><h3>④ 그 밖에</h3><p class="mline">${s.other.line}</p>${s.other.learned.map((t) => html`<div class="srow"><small>${t}</small></div>`)}
        <p class="note">이번 주 AI 실행 ${s.other.usage.runs}회 · ${s.other.usage.note}${s.other.estimated ? ` · 확인 대기 추정 규칙 ${s.other.estimated}개` : ''}</p>
        ${d.time && html`<p class="note">이번 주 대표님이 일한 시간 ${mins(d.time.week.work)}${d.time.lastWeek.work ? `(지난주 ${mins(d.time.lastWeek.work)})` : ''} · 사무실에 머문 시간 ${mins(d.time.week.stay)}</p>`}</section>
      <div class="row"><button class="btn pri" onClick=${() => close('decisions')} disabled=${!s.decide.items.length}>결정부터 보기</button><button class="btn" onClick=${() => {
        // 3D 사무실이 떠 있으면 그 위에서 다시 본다(카메라가 그 직원을 비추고, 인계는 걸어서). 아니면 2D 리플레이
        if (document.querySelector('.office.is3d .o3-canvas canvas')) { document.dispatchEvent(new CustomEvent('ao-replay', { detail: d })); close(); } else setReplay(true);
      }} disabled=${!d.replay.length}>${d.manager?.name ?? '매니저'}와 하이라이트 보기</button><span class="sp"></span><button class="btn quiet" onClick=${() => close()}>사무실로</button></div>
    </div>`}
  </div>`;
}
