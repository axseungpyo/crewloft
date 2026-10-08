// S1 사무실(결정 44 · 결정 87) — 3D 사무실이 화면 전체. 대표 몫은 직원 머리 위 인주색 말풍선 → 누르면 아래 시트,
// 아래에 '팀은 지금 — …' 한 줄. 회차 띠 · 상태 칩 · 수치 · 줌 도구 막대는 숨기고(3D 안 표지 · 문서 메뉴 · '보기' 도구로), 나머지 자리도 모두 아래 시트 하나로
import { Portrait } from '../art.js';
import { Markdown, act, api, go, hhmm, html, josa, roleFull, roleLabel, stWord, toast, useApi, useEffect, useEvents, useLive, useRef, useState, when } from '../lib.js';
import { officeSVG, standPoint, VB } from '../office-art.js';
import { Upgrade } from '../facility.js';
import { DecisionSheet, bubbleText, byTurn, ownerOf } from './decisions.js';
import { BottomSheet, Sec, StWord } from '../sheet.js';
import { ic, resIc } from '../icons.js';

/** 회차 보드에 그릴 칸 — 블록 회차면 이번 주 블록 띠(P2 결정 6), 아니면 7단계 */
const boardFlow = (state) => (state.flowBlocks ? state.flowBlocks.map((b) => ({ key: b.id, label: b.name, state: b.state, who: b.who, block: true, confirm: b.confirm, tasks: b.tasks, done: b.done })) : state.flow);

const firstRank = (role) => (role === 'manager' ? '매니저(팀장)' : '사원');
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 실제 활동 상태 → 자세(domain-motion §3) */
function poseOf(e, openDecisions) {
  const a = e.activity;
  // 되묻는 중 · 잠듦이 가장 먼저(결정 80) — 손 들고 묻기 · 고개 숙여 잠들기
  if (a.status === 'asked') return { pose: 'raise' };
  if (a.status === 'asleep') return { pose: 'rest' };
  if (a.status === 'working') return { pose: a.kind === 'research' || a.kind === 'seo_keywords' ? 'read' : a.kind === 'image_brief' || a.kind === 'video_script' ? 'draw' : 'type' };
  if (a.status === 'reviewing') return { pose: 'read' };
  if (a.status === 'quota_wait') return { pose: 'rest' };
  if (a.status === 'reconnect' || a.status === 'failed') return { pose: 'warn' };
  if (a.status === 'handoff_pending') return { pose: 'wait' };
  if (e.role === 'manager' && openDecisions > 0) return { pose: 'raise' };
  return { pose: 'sit', bubble: null };
}

/** 다음 성장 단계까지 — 실제 기록만(결정 66) */
function Growth({ g, preview }) {
  if (!g) return null;
  if (preview) return html`<p class="o3-grow note">레벨 미리보기예요 — 실제 회사는 레벨 ${g.stage} ${g.name}이에요.</p>`;
  return html`<div class="o3-grow">
    ${g.overflow > 0 && html`<p class="warn">자리가 ${g.overflow}개 모자라요 — 임시 자리에 앉아 있어요</p>`}
    ${g.pendingDecisionId ? html`<a class="btn sm decide" href=${`#/decisions/${g.pendingDecisionId}`}>레벨 ${g.next?.stage} 올리기 제안 보기</a>`
      : g.next ? html`<p class="nx">다음 레벨: <b>레벨 ${g.next.stage} ${g.next.name}</b> (정원 ${g.next.capacity}명)</p>
        <div class="conds">${g.next.conditions.map((c) => html`<span class=${c.met ? 'met' : ''} title=${c.met ? '채웠어요' : `${c.goal - c.progress} 더 필요`}>${c.met ? ic('check', 12) : ''}${c.label} ${c.progress}/${c.goal}</span>`)}</div>`
      : html`<p class="nx">지금이 마지막 레벨이에요</p>`}
  </div>`;
}

/** 2D 자세 → 3D 전령 동작 */
const MODE3D = { type: 'type', draw: 'type', read: 'read', raise: 'raise', warn: 'raise' };
const FLAG = { asked: 'ask', asleep: 'sleep' };

/** 3D 본사(결정 65). WebGL이 없으면 onFail로 2D 사무실로 돌아간다 */
let lastView = null; // 짓고 나서 장면을 다시 만들 때 카메라를 그대로 둔다

/** 시점 조작 — 줌 사다리(도시 · 동네 · 건물 · 방 · 책상) · 90° 돌리기 · 자동 연출 · 미니 화면 · 배치. 켜고 끈 것은 이 브라우저에 기억한다.
    떠 있는 무리는 셋까지(brand.md §3-4 원칙 7) — 그래서 따로 떠 있지 않고 아래 도크 위에 붙은 도구 막대 하나로 모은다. 미니 화면은 처음엔 꺼 둔다 */
const CAM_PREF = 'ao.cam';
const camPref = () => { try { return { auto: false, pip: false, ...JSON.parse(localStorage.getItem(CAM_PREF) ?? '{}') }; } catch { return { auto: false, pip: false }; } };
const saveCamPref = (p) => { try { localStorage.setItem(CAM_PREF, JSON.stringify(p)); } catch { /* 저장소를 못 쓰면 이번만 */ } };
const LV_ICON = { city: 'city', block: 'block', building: 'office', room: 'room', desk: 'desk' };
function CamBar({ h, editing, onEdit }) {
  const [lv, setLv] = useState(null);
  const [dir, setDir] = useState({ on: false, active: false });
  const [pref, setPref] = useState(camPref);
  useEffect(() => { if (!h) return undefined; const a = h.onLevel((l) => setLv(l.key)), b = h.director.onChange(setDir); return () => { a(); b(); }; }, [h]);
  if (!h) return null;
  const set = (k, v) => { const p = { ...pref, [k]: v }; setPref(p); saveCamPref(p); if (k === 'auto') h.director.set(v); if (k === 'pip') h.pip?.set(v); };
  return html`<div class="o3-cam" role="toolbar" aria-label="시점">
    <div class="ladder">${[...h.levels].reverse().map((l) => html`<button class=${lv === l.key ? 'on' : ''} onClick=${() => h.zoomTo(l.key)} title=${`${l.label} 단계로 — 휠로도 확대 · 축소해요`} aria-pressed=${lv === l.key}>${ic(LV_ICON[l.key] ?? 'dot', 16)}<span>${l.label}</span></button>`)}</div>
    <span class="sep"></span>
    <button onClick=${() => h.turn(-1)} title="왼쪽으로 90° 돌리기 (Q · 오른쪽 끌기)" aria-label="왼쪽으로 돌리기">${ic('rotL', 16)}</button><button onClick=${() => h.turn(1)} title="오른쪽으로 90° 돌리기 (E · 오른쪽 끌기)" aria-label="오른쪽으로 돌리기">${ic('rotR', 16)}</button>
    <span class="sep"></span>
    <button class=${`tog${pref.auto ? ' on' : ''}${dir.active ? ' live' : ''}`} onClick=${() => set('auto', !pref.auto)} title="켜 두면, 손을 뗐을 때 카메라가 일어나는 일을 따라가요(실제 일만). 화면을 만지면 멈춰요." aria-pressed=${!!pref.auto}>${ic('camera', 16)}<span>자동</span></button>
    ${h.pip && html`<button class=${`tog pipt${pref.pip ? ' on' : ''}`} onClick=${() => set('pip', !pref.pip)} title="다른 방을 작은 실시간 화면으로 봐요. 누르면 그 방으로 가요." aria-pressed=${!!pref.pip}>${ic('pip', 16)}<span>미니</span></button>`}
    ${h.canEdit && html`<span class="sep"></span><button class=${`tog${editing ? ' on' : ''}`} onClick=${() => onEdit(!editing)} title="물건을 옮기거나 돌려요 — 물건을 0.8초 꾹 눌러도 들어가요" aria-pressed=${!!editing}>${ic('move', 16)}<span>배치</span></button>`}
  </div>`;
}

/** 3D 사무실. 설계도가 있으면 도메인 맞춤 공간(결정 67·68), 없으면 단계 레이아웃(결정 66). WebGL이 없으면 onFail로 2D */
function HQ({ state, employees, kn, bubbles, sel, setSel, onFail, space, onPlot, onFacility, editing, onSelectObj, onReady, onEditStart, lookRoom, onLooked }) {
  const host = useRef(null), over = useRef(null), pipBox = useRef(null), hq = useRef(null);
  const pickRef = useRef(setSel); pickRef.current = setSel; // 3D는 한 번만 만들어서, 누를 때마다 지금 그림의 고르기(말풍선 묶음)를 쓴다
  const [lv, setLv] = useState(null);
  const [dir, setDir] = useState({ on: false, active: false });
  const view = () => ({
    company: state.office?.name ?? '', officeLevel: `레벨 ${space?.stage ?? state.office?.stage ?? 0}`, cycleLabel: state.cycle?.label ?? null, flow: boardFlow(state), decisions: state.counts.decisions,
    books: kn?.books ?? 0, trophies: kn?.trophies ?? 0, aiOn: state.ai.status.state === 'ready' && !state.runner.paused, aiLabel: state.ai.label, selectedId: sel,
    employees: employees.map((e) => ({ id: e.id, name: e.name, role: e.role, rank: e.rank, status: e.status, statusLabel: stWord(e.activity.status, e.activity.label), mode: e.activity.status === 'asleep' ? 'sleep' : MODE3D[e.pose] ?? 'idle', flag: FLAG[e.activity.status] ?? null, bubble: bubbles[e.id]?.text ?? null, mine: !!bubbles[e.id]?.mine, task: e.activity.task ?? null })),
  });
  useEffect(() => {
    let alive = true, off = null;
    const qs = new URLSearchParams(location.search), q = Number(qs.get('stage'));
    const stageNo = Number.isInteger(q) && qs.has('stage') ? q : (state.office?.stage ?? 0); // ?stage=N 은 단계 미리보기
    const savePlace = (id, p) => api('POST', '/api/space/place', p ? { id, ...p } : { id, reset: true }).catch((e) => toast(e.message, true));
    Promise.all([import('../office3d/office.js'), import('../office3d/layouts/index.js'), import('../office3d/space/generate.js')])
      .then(async ([{ createOffice }, { loadLayout, loadSpace }, { layoutFromSpec }]) => {
        const sample = qs.get('space'); // 도메인 맞춤 공간 견본 미리보기
        const layout = sample ? await loadSpace(sample)
          : space?.spec ? layoutFromSpec(space.spec, { built: space.built, placements: space.placements, plots: space.plots, works: space.works, facLevels: Object.fromEntries(Object.entries(space.facilities ?? {}).map(([k, f]) => [k, f.level])) })
            : await loadLayout(stageNo);
        return createOffice(host.current, over.current, { layout, onPick: (id) => pickRef.current(id), onGo: go, onPlot, onFacility, onPlace: savePlace, onSelect: onSelectObj, onEditStart, view0: lastView, pipHost: pipBox.current });
      }).then((h) => {
        if (!alive) { h.dispose(); return; }
        hq.current = h; h.update(view()); h.home(state.employees); onReady?.(h);
        const offSky = h.onSky((p) => { const o = host.current?.closest('.office'); if (o) { o.dataset.sky = p.key; o.classList.toggle('sky-dark', p.dark); } });
        const offLv = h.onLevel((l) => setLv(l.key)), offDir = h.director.onChange(setDir);
        const p0 = camPref(); h.director.set(p0.auto); h.pip?.set(p0.pip);
        off = () => { offSky(); offLv(); offDir(); };
        if (lookRoom) { h.lookRoom(lookRoom); onLooked?.(); } // 방금 완공한 새 방으로(한 번만)
      }).catch((e) => { console.error('3D 사무실을 열지 못했어요', e); if (alive) onFail(); });
    return () => { alive = false; off?.(); if (hq.current) lastView = hq.current.cameraView(); hq.current?.dispose(); hq.current = null; onReady?.(null); };
  }, []);
  useEffect(() => { hq.current?.update(view()); });
  // 연출 — 이 브라우저에서 마지막으로 본 레벨 · 직급과 다르면 한 번 보여 준다(다른 화면에서 승인해도 돌아오면 보인다)
  const ranks = state.employees.map((e) => `${e.id}=${e.rank}`).join();
  useEffect(() => {
    const h = hq.current, oid = state.office?.id;
    if (!h || !oid || new URLSearchParams(location.search).has('stage')) return;
    const key = `ao.seen.${oid}`;
    let seen = null; try { seen = JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { /* 저장소를 못 쓰면 연출 없이 */ }
    const now = { level: state.office.stage ?? 0, ranks: Object.fromEntries(state.employees.map((e) => [e.id, e.rank])) };
    if (seen) {
      if (now.level > (seen.level ?? 0)) setTimeout(() => h.celebrate('level', { level: now.level, name: state.growth?.name }), 600);
      else for (const e of state.employees) if (seen.ranks?.[e.id] && seen.ranks[e.id] !== e.rank) { h.celebrate('promote', { id: e.id, rank: e.rank }); break; }
    }
    try { localStorage.setItem(key, JSON.stringify(now)); } catch { /* 무시 */ }
  }, [!!hq.current, state.office?.stage, ranks]);
  useEffect(() => { hq.current?.edit(!!editing); }, [editing, !!hq.current]);
  useEvents((ev) => { if (ev.type === 'handoff_accepted') hq.current?.handoff(ev.data.fromId, ev.data.toId); hq.current?.director.note(ev); }, []);
  return html`<div class=${`stage-wrap o3d lv-${lv ?? 'room'}`}>
    <div class="o3-canvas" ref=${host}></div><div class="o3-tags" ref=${over}></div><div class="o3-pip-box" ref=${pipBox}></div>
    ${dir.active && html`<div class="o3-autochip">${ic('camera')} 자동 연출 중<small>${hq.current?.director.label ?? ''} · 화면을 만지면 멈춰요</small></div>`}
  </div>`;
}

/** 사무실 레벨 시트 — 층 · 방 고르기, 다음 레벨까지, 새 방 요청. 위 줄 '레벨' 단추로 연다(brand.md §3-4 원칙 7) */
function LevelSheet({ h, state, sp, kn, onPlot, onClose }) {
  const [floor, setFloor] = useState(h?.floor ?? null);
  useEffect(() => (h ? h.onFloor(setFloor) : undefined), [h]);
  const info = h?.layout;
  if (!info) return null;
  const space = sp?.spec ? sp : null;
  const gen = info.key === 'gen' && space;
  const at = (f) => state.employees.filter((e) => (info.roleFloor[e.role] ?? 0) === f);
  const work = sp?.works?.find((w) => w.status === 'designing');
  // 실적 자원 — 위 줄에서 옮김(결정 87). 채용한 직무의 자원만
  const roles = new Set(state.employees.map((e) => e.role)), sv = state.space;
  const res = sv?.res ? Object.entries(sv.res).filter(([k, r]) => r.role === 'manager' || roles.has(r.role) || sv.balance[k] > 0) : [];
  return html`<${BottomSheet} title=${`사무실 레벨 ${gen ? space.stage : info.stage}`} sub="층 · 방 고르기 · 다음 레벨까지" onClose=${onClose} cls="o3-floors"><${Sec}>
    ${gen ? html`<p class="o3-place">${info.name} · ${space.spec.domain ?? '맞춤 공간'} · 방 ${space.built.rooms.length}/${space.roomCap} · 자리 ${info.capacity}개 · 직원 ${state.employees.length}명${state.employees.length > info.capacity ? html` <b class="over">(임시 자리 ${state.employees.length - info.capacity}개)</b>` : ''}</p>`
      : html`<p class="o3-place">${info.name} · ${info.place} · 정원 ${info.capacity}명</p>`}
    ${info.floors.map((_, i) => i).reverse().map((f) => html`<button class=${`flr${floor === f ? ' on' : ''}`} onClick=${() => h.setFloor(f)} aria-pressed=${floor === f}>
      <b>${gen ? ic('office') : info.floors[f].n}</b><span><em>${info.floors[f].name}</em><small>${info.floors[f].rooms}</small></span>
      <i>${at(f).map((e) => html`<u class=${`st-${e.activity.status}`} title=${`${e.name} · ${e.activity.detail ?? e.activity.label}`}>${e.name}</u>`)}${f === info.decisionFloor && state.counts.decisions ? html`<s>확인할 것 ${state.counts.decisions}</s>` : ''}${f === info.recordsFloor ? html`<s class="k">지식 ${kn?.books ?? 0} · 기록 ${kn?.trophies ?? 0}</s>` : ''}</i></button>`)}
    ${info.hasBuilding && info.floors.length > 1 && html`<button class=${`flr bld${floor === 'all' ? ' on' : ''}`} onClick=${() => h.setFloor('all')}>건물 전체 보기</button>`}
    <${Growth} g=${state.growth} preview=${!gen && info.stage !== (state.office?.stage ?? 0)} />
    ${work ? html`<button class="btn sm" onClick=${() => onPlot(`work:${work.id}`)}>${ic('build')} 공사 중인 방 보기</button>`
      : sp?.plots?.some((p) => p.id === 'new:room') && html`<button class="btn sm" title="설계도에 없는 방을 매니저에게 새로 설계해 달라고 해요" onClick=${() => onPlot('new:room')}>새 방 요청</button>`}
    ${res.length > 0 && html`<p class="o-res" title="직원이 끝낸 업무 1건 = 그 직무 자원 10 · 승인한 결정 1건 = 신뢰 3. 짓기에 쓴 만큼 줄어요.">실적 자원 ${res.map(([k, r]) => html`<span>${resIc(k)}${r.label} <b>${sv.balance[k]}</b></span>`)}</p>`}
  </${Sec}></${BottomSheet}>`;
}

/** 실적 자원을 얻는 법 — 모자랄 때 다음 행동을 알려 준다 */
const EARN = { trust: '매니저 업무를 끝내거나 결정을 승인하면', insight: '리서처가 조사를 끝내면', draft: '작가가 글을 끝내면', design: '디자이너가 이미지 기획을 끝내면', promo: '마케터가 배포 계획을 끝내면', polish: '편집자가 교정을 끝내면', scene: '영상 PD가 대본을 끝내면', keyword: 'SEO 담당이 키워드 브리프를 끝내면' };
/** 견본(가짜) AI면 구독 사용량이 들지 않는다고 말한다 */
const aiNote = (state, text) => (state?.ai?.id === 'fake' ? `견본 AI라 지금은 0 — 실제 AI면 ${text}` : text);

/** 빈 부지를 눌렀을 때 — 조건 · 비용 · AI 사용량 · 짓기 */
function BuildCard({ plot, sp, state, onClose, suggest = [] }) {
  const [opt, setOpt] = useState(null);
  const [need, setNeed] = useState('');
  if (!plot) return null;
  const res = sp?.res ?? {}, bal = sp?.resources?.balance ?? {};
  const isNew = plot.kind === 'new';
  const unmet = plot.reqs.find((r) => !r.met);
  const short = Object.entries(plot.cost).filter(([k, v]) => (bal[k] ?? 0) < v);
  const go = () => (isNew
    ? act(() => api('POST', '/api/space/rooms', { need }), '매니저가 새 방을 설계하기 시작했어요 — 그동안 공사 중이에요')
    : act(() => api('POST', '/api/space/build', { plot: plot.id, option: opt }), `${plot.title.replace(' 짓기', '')} — 지었어요`)).then(() => onClose());
  const missing = isNew ? need.trim().length < 2 : plot.options && !opt;
  return html`<${BottomSheet} title=${plot.title} onClose=${onClose} cls="bcard"><${Sec}>
    ${unmet && html`<div class="lockline">${ic('lock')} 지금은 ${isNew ? '요청할' : '지을'} 수 없어요 — ${unmet.label}</div>`}
    ${isNew && !unmet && html`<p class="note">설계도에 없는 방이 필요하면 적어 주세요. 매니저가 지금 공간에 맞춰 설계하고, 그동안 건물 옆에서 공사해요.</p>
      <textarea class="in" rows="2" maxlength="80" value=${need} onInput=${(e) => setNeed(e.target.value)} placeholder="예: 팟캐스트 녹음실이 필요해요"></textarea>
      <div class="row ex">${[...suggest, '팟캐스트 녹음실', '손님 맞는 회의실', '쉬는 라운지', '촬영 스튜디오', '자료실'].map((x) => html`<button class="chip-opt" onClick=${() => setNeed(x)}>${x}</button>`)}</div>`}
    ${isNew && unmet && html`<p class="note">설계도에 없는 방(예: 팟캐스트 녹음실)을 매니저에게 새로 설계해 달라고 할 수 있어요. 조건을 채우면 여기서 요청해요.</p>`}
    <h3>조건</h3><ul class="reqs">${plot.reqs.map((r) => html`<li class=${r.met ? 'met' : ''}><span>${ic(r.met ? 'check' : 'x', 14)}</span>${r.label}</li>`)}</ul>
    <h3>비용 — 실적 자원</h3><div class="cost">${Object.entries(plot.cost).map(([k, v]) => html`<span class=${(bal[k] ?? 0) >= v ? '' : 'short'}>${resIc(k)} ${res[k]?.label} <b>${v}</b><small>/ 가진 것 ${bal[k] ?? 0}</small></span>`)}</div>
    ${short.length > 0 && html`<p class="note warn">${short.map(([k, v]) => `${res[k]?.label} ${v - (bal[k] ?? 0)} 더 필요 — ${EARN[k] ?? '그 직무 업무를 끝내면'} 쌓여요(업무 1건 = 10)`).join(' · ')}</p>`}
    <p class="note">${isNew ? '공사 동안 비용을 잡아 두고 완공되면 써요. 설계가 실패하면 쓰지 않아요. ' : ''}AI 사용량: ${aiNote(state, plot.ai)}</p>
    ${plot.options && html`<h3>무엇을 놓을까요</h3><div class="row">${plot.options.map((o) => html`<button class=${`chip-opt${opt === o.key ? ' on' : ''}`} onClick=${() => setOpt(o.key)}>${o.label}</button>`)}</div>`}
    <div class="bs-acts"><button class="btn pri" disabled=${!plot.ready || missing} onClick=${go}>${unmet ? '조건을 채우면 열려요' : short.length ? '자원이 모자라요' : missing ? (isNew ? '어떤 방인지 적어 주세요' : '놓을 것을 골라 주세요') : isNew ? '설계 · 공사 요청' : '짓기'}</button></div>
  </${Sec}></${BottomSheet}>`;
}

/** 공사장을 눌렀을 때 — 무엇을 짓는지 · 얼마나 됐는지 · 잡아 둔 자원 */
function WorkCard({ work, sp, mgr, onClose }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  if (!work) return null;
  const res = sp?.res ?? {}, sec = Math.max(0, Math.round((Date.now() - Date.parse(work.startedAt)) / 1000));
  return html`<${BottomSheet} title=${work.status === 'failed' ? '공사가 멈췄어요' : work.status === 'done' ? '완공' : '공사 중'} onClose=${onClose} cls="bcard"><${Sec}>
    <p>요청: <b>${work.need}</b></p>
    ${work.status === 'designing' && html`<p class="note">${mgr ? `${mgr.name}가` : '매니저가'} 지금 공간에 맞춰 방을 설계하는 중이에요 · ${Math.floor(sec / 60)}분 ${sec % 60}초째. 설계가 끝나면 바로 지어져요.</p>`}
    ${work.status === 'failed' && html`<p class="note warn">${work.error} — 잡아 둔 자원은 쓰지 않았어요. 다시 요청할 수 있어요.</p>`}
    <h3>잡아 둔 자원</h3><div class="cost">${Object.entries(work.cost).map(([k, v]) => html`<span>${resIc(k)} ${res[k]?.label} <b>${v}</b></span>`)}</div>
  </${Sec}></${BottomSheet}>`;
}

/** 기능 시설을 눌렀을 때 — 레벨 · 열린 편의 기능 · 업그레이드 · 그 화면 열기 */
function FacilityCard({ f, state, onClose }) {
  if (!f) return null;
  return html`<${BottomSheet} title=${f.label} sub=${`레벨 ${f.level}`} onClose=${onClose} cls="bcard fcard"><${Sec}>
    <h3>열린 편의 기능</h3>${f.unlocked.length ? html`<ul>${f.unlocked.map((u) => html`<li>${u}</li>`)}</ul>` : html`<p class="note">기본 기능만 있어요.</p>`}
    ${f.next ? html`<h3>레벨 ${f.next.level}에서 열려요</h3><p>${f.next.unlock}</p>
      <ul class="reqs">${f.next.reqs.map((r) => html`<li class=${r.met ? 'met' : ''}><span>${ic(r.met ? 'check' : 'x', 14)}</span>${r.label}</li>`)}</ul>
      <${Upgrade} state=${state} f=${f} />` : html`<p class="note">지금 가장 높은 레벨이에요.</p>`}
    <p class="note">AI 사용량: 없음 — 업그레이드는 실적 자원만 써요.</p>
    <div class="bs-acts"><button class="btn" onClick=${() => go(f.screen)}>${f.label} 열기 →</button></div>
  </${Sec}></${BottomSheet}>`;
}

/** 설계도가 아직 없을 때 — 매니저에게 공간 설계를 부탁한다(위 줄 '공간 설계' 단추로 연다) */
function DesignSheet({ state, sp, onClose }) {
  const mgr = state.employees.find((e) => e.role === 'manager');
  const req = sp?.design;
  if (!mgr || sp?.spec) return null;
  const running = req?.status === 'running';
  return html`<${BottomSheet} title="공간 설계" onClose=${onClose} cls="design-card"><${Sec}>
    <b>${josa(mgr.name, '이', '가')} 우리 회사에 맞는 공간을 설계해 드려요.</b>
    <p class="note">사무실이 아니어도 돼요 — 스튜디오 · 연구소 · 공방처럼 하는 일에 맞춰요.</p>
    ${req?.status === 'failed' && html`<p class="note warn">설계가 멈췄어요 — ${req.error}. 다시 부탁할 수 있어요.</p>`}
    <button class="btn pri sm" disabled=${running} onClick=${() => act(() => api('POST', '/api/space/design'), '설계를 부탁했어요')}>${running ? '설계하는 중…' : '설계 부탁하기'}</button>
    <p class="muted">AI 사용 한 번${state.ai.id === 'fake' ? ' · 견본 AI라 지금은 0' : '(구독 사용량 조금)'}</p></${Sec}></${BottomSheet}>`;
}

/** 복귀 요약 하이라이트를 3D 사무실에서 다시 보기(결정 51 · 실제 기록만) — 장면마다 그 직원을 비추고 말풍선, 인계는 걸어서 */
const RP_COLOR = { handoff: 'var(--info)', result: 'var(--ok)', decision: 'var(--decide)', dm: 'var(--ink-2)', system: 'var(--ink-3)' }; // 색 토큰(base.css)
function Replay3D({ data, h3, onScene, onEnd }) {
  const ev = data.replay;
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const step = Math.max(900, Math.min(2600, 30000 / Math.max(1, ev.length))); // 15–30초 안에, 장면이 보일 만큼은 길게
  const cur = ev[i];
  useEffect(() => {
    if (!cur || !h3) return;
    const who = cur.kind === 'handoff' ? cur.toId : cur.actorId;
    if (cur.kind === 'handoff' && cur.fromId && cur.toId) h3.handoff(cur.fromId, cur.toId);
    if (who) h3.focus(who); else h3.unfocus();
    onScene(who ? { id: who, text: cur.text } : null);
  }, [i, !!h3]);
  useEffect(() => {
    if (!playing) return undefined;
    const t = setTimeout(() => (i < ev.length - 1 ? setI(i + 1) : setPlaying(false)), step / speed);
    return () => clearTimeout(t);
  }, [i, playing, speed]);
  const end = () => { h3?.unfocus(); onScene(null); onEnd(); };
  if (!cur) return null;
  const left = data.sections.decide.items.length;
  return html`<div class="rp3 card">
    <div class="row"><span class="pill" style=${`background:${RP_COLOR[cur.kind]};color:var(--on-strong)`}>${{ handoff: '인계', result: '결과', decision: '결정', dm: '대화', system: '기록' }[cur.kind]}</span>
      <b class="rp3-text">${cur.text}</b><span class="sp"></span><small class="muted">${when(cur.at)} · ${i + 1}/${ev.length}</small></div>
    <div class="rp-bar">${ev.map((e, k) => html`<span style=${`left:${(k / Math.max(1, ev.length - 1)) * 100}%;background:${RP_COLOR[e.kind]}`} class=${k <= i ? 'past' : ''} onClick=${() => { setI(k); setPlaying(false); }}></span>`)}</div>
    <div class="row"><button class="btn sm" onClick=${() => (i >= ev.length - 1 && !playing ? (setI(0), setPlaying(true)) : setPlaying(!playing))}>${ic(playing ? 'pause' : 'play')}</button>
      <button class="btn sm" onClick=${() => setSpeed(speed === 1 ? 2 : 1)}>${speed}×</button><button class="btn sm" onClick=${() => { setI(0); setPlaying(true); }}>처음부터</button>
      <span class="muted">실제 기록만 · 3D 리플레이</span><span class="sp"></span>
      ${left > 0 && html`<a class="btn sm" href="#/decisions" onClick=${end}>확인할 것 ${left}개</a>`}<button class="btn sm pri" onClick=${end}>끝내기</button></div>
  </div>`;
}

function useMotion(state) {
  const [walkers, setWalkers] = useState([]);
  const [bubbles, setBubbles] = useState({});
  const raf = useRef(0);
  useEvents((ev) => {
    if (ev.type === 'message' && ev.actorId) {
      const text = String(ev.data.body ?? '').slice(0, 46);
      setBubbles((b) => ({ ...b, [ev.actorId]: { text, until: Date.now() + 6000 } }));
    }
    // 되묻기(계약 2) — 묻는 직원 머리 위에 질문, 답한 쪽에 짧게. 서류는 들고 가지 않는다(서류 전달은 실제 인계만)
    if (ev.type === 'task_asked' && ev.data?.from) setBubbles((b) => ({ ...b, [ev.data.from]: { text: `질문 — ${String(ev.data.question ?? '').slice(0, 44)}`, until: Date.now() + 9000 } }));
    if (ev.type === 'task_answered' && ev.data?.by && ev.data.by !== 'owner') setBubbles((b) => ({ ...b, [ev.data.by]: { text: `답했어요 — ${String(ev.data.answer ?? '').slice(0, 36)}`, until: Date.now() + 6000 } }));
    // 인계는 받는 직원이 수락했을 때만 걸어서 전달한다(결정 37)
    if (ev.type === 'handoff_accepted' && !reduced()) {
      const from = state.employees.find((e) => e.id === ev.data.fromId);
      const to = state.employees.find((e) => e.id === ev.data.toId);
      if (!from || !to) return;
      const a = standPoint(from.role), b = standPoint(to.role), t0 = performance.now();
      cancelAnimationFrame(raf.current);
      const step = (t) => {
        const k = (t - t0) / 4000;
        if (k >= 1) { setWalkers([]); return; }
        const u = k < 0.5 ? k * 2 : 2 - k * 2;
        const ease = u * u * (3 - 2 * u);
        setWalkers([{ id: from.id, x: a.x + (b.x - a.x) * ease, y: a.y + (b.y - a.y) * ease, flip: (k < 0.5) === (b.x < a.x), depth: a.depth + (b.depth - a.depth) * ease }]);
        raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
    }
  }, [state.employees.map((e) => e.id).join()]);
  useEffect(() => {
    const t = setInterval(() => setBubbles((b) => Object.fromEntries(Object.entries(b).filter(([, v]) => v.until > Date.now()))), 1000);
    return () => { clearInterval(t); cancelAnimationFrame(raf.current); };
  }, []);
  return { walkers, bubbles };
}

const clip = (t, n) => { const x = String(t ?? '').trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };
const BUSY = ['working', 'reviewing', 'handoff_pending'];

/** 아래 한 줄(결정 87) — '팀은 지금 — …'. 누르면 팀 시트. 일이 없으면 시작 단추, 멈췄으면 다시 시작, 대표 차례가 있으면 인주색 한 마디 */
function TeamLine({ state, onOpen }) {
  const emps = state.employees, paused = state.runner.paused, running = state.cycle?.status === 'running', n = state.counts.decisions;
  const busy = emps.filter((e) => BUSY.includes(e.activity.status));
  const asking = emps.filter((e) => e.activity.status === 'asked');
  const aiDown = state.ai.status.state !== 'ready';
  const text = !emps.length ? '아직 팀이 없어요'
    : state.runner.pausedUntil ? `사용 한도 — ${hhmm(state.runner.pausedUntil)}에 다시 시작해요`
      : paused ? '멈춤 — 하던 일만 마무리하고 새 업무는 시작하지 않아요'
        : busy.length ? `${busy.slice(0, 2).map((e) => `${josa(e.name, '은', '는')} ${clip(e.activity.task ?? stWord(e.activity.status), 18)} 중`).join(' · ')}${busy.length > 2 ? ` 외 ${busy.length - 2}명` : ''}`
          : asking.length ? `${josa(asking[0].name, '은', '는')} 대표님 답을 기다려요`
            : running ? '다음 일을 준비하는 중' : state.cycle?.status === 'done' ? `${state.cycle.label} 일을 마쳤어요` : '이번 주 일이 아직 없어요';
  return html`<div class="o-team">
    <button class="o-team-l" onClick=${onOpen} title="팀 전체 · 활동 기록 보기"><i class=${`dot${paused || aiDown ? ' off' : busy.length ? ' on' : ''}`}></i><span>팀은 지금 — ${text}</span></button>
    ${n > 0 && html`<a class="o-mine" href="#/decisions">대표님 차례 ${n}개</a>`}
    ${aiDown && html`<a class="o-warn" href="#/settings/power" title=${state.ai.status.detail}>AI 연결 확인</a>`}
    ${paused ? html`<button class="btn sm" onClick=${() => act(() => api('POST', '/api/pause', { paused: false }), '다시 시작해요')}>${ic('play', 14)} 다시 시작</button>`
      : !running && emps.length > 0 && html`<button class="btn pri sm" onClick=${() => act(() => api('POST', '/api/cycles'), '이번 주 일을 시작했어요')}>${state.cycle ? '이번 주 일 다시 시작' : '이번 주 일 시작'}</button>`}
  </div>`;
}

/** 팀 시트 — 직원마다 한 줄(상태 낱말 · 지금 하는 일), 그 아래 활동 기록(접힘). 옛 아래 도크의 활동 줄을 옮김 */
function TeamSheet({ state, onPerson, onClose }) {
  const feed = [...state.events].reverse().filter((e) => e.type !== 'task_note');
  return html`<${BottomSheet} title="팀은 지금" sub=${state.cycle?.label ?? ''} onClose=${onClose}>
    <${Sec}><ul class="ln-list">${state.employees.map((e) => html`<li><button class="ln-row" onClick=${() => onPerson(e.id)}>
      <${Portrait} look=${e.look} size=${32} role=${e.role} rank=${e.rank} />
      <span class="ln-t"><b>${e.name}</b><small>${roleFull(e.role)}${e.activity.task ? ` · ${e.activity.task}` : ''}</small></span>
      <${StWord} st=${e.activity.status} word=${stWord(e.activity.status, e.activity.label)} title=${e.activity.detail ?? e.activity.label} /></button></li>`)}</ul></${Sec}>
    ${feed.length > 0 && html`<${Sec}><details class="bs-fold"><summary>활동 기록 ${feed.length}<small>${hhmm(feed[0].at)} ${clip(feed[0].data.text, 40)}</small></summary>
      <ol class="o-feed">${feed.map((e) => html`<li><time>${hhmm(e.at)}</time><span>${e.data.text}</span></li>`)}</ol></details></${Sec}>`}
  </${BottomSheet}>`;
}

/** 직원 시트 — 지금 하는 일 · 대화 · 결과물 · 배운 것 */
function EmployeeSheet({ emp, onClose }) {
  const [tab, setTab] = useState('now');
  const [text, setText] = useState('');
  const [always, setAlways] = useState(false);
  const d = useApi(`/api/employees/${emp.id}`).data;
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    await act(() => api('POST', `/api/employees/${emp.id}/dm`, { text, scope: always ? 'always' : null }));
    setText('');
  };
  const a = emp.activity;
  return html`<${BottomSheet} title=${emp.name} sub=${`${roleFull(emp.role)} · ${emp.rank}`} onClose=${onClose} cls="emp">
    <div class="bs-tabs" role="tablist">${[['now', '지금 하는 일'], ['dm', '대화'], ['out', '결과물'], ['learn', '배운 것']].map(([k, l]) => html`<button role="tab" aria-selected=${tab === k} class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}>${l}</button>`)}</div>
    ${tab === 'now' && html`<${Sec}>
      <p class="bs-eye"><${StWord} st=${a.status} word=${stWord(a.status, a.label)} title=${a.detail ?? a.label} /></p>
      <h3 class="bs-q">${a.task ?? '지금 맡은 일이 없어요'}</h3>
      ${a.reason && html`<p class="bs-why">${a.reason}</p>`}
      <p class="bs-why">${{ asked: '자료가 이상하거나 모자라서 짐작하지 않고 묻고 있어요. 답이 오면 이어서 해요(업무 하나에 두 번까지).', asleep: '사용 한도에 닿아 쉬고 있어요. 확인할 것의 \'계속할까요?\'에서 이번 주만 늘리면 다시 일해요.', handoff_pending: '인계는 받는 직원이 자료를 확인해야 완료돼요.', quota_wait: '한도가 재설정되면 자동으로 이어서 해요. 다른 연결로 자동 전환하거나 추가 과금하지 않아요.', reconnect: '연결을 다시 해야 이어서 할 수 있어요.', failed: '실패한 업무는 문서 › 이번 주 일에서 다시 시도할 수 있어요.' }[a.status] ?? '밖으로 나가는 일은 대표님 확인 전에는 하지 않아요.'}</p>
      <div class="bs-acts"><a class="btn sm" href=${`#/company/employees/${emp.id}`}>프로필 · 성장 보기</a></div></${Sec}>`}
    ${tab === 'dm' && html`<${Sec}><div class="dms">${(d?.dms ?? []).map((m) => html`<div class=${`dm ${m.author}`}>${m.text}<time>${hhmm(m.createdAt)}</time></div>`)}
      ${!(d?.dms ?? []).length && html`<p class="bs-why">${josa(emp.name, '에게', '에게')} 말을 걸어 보세요. 대화는 업무 기록과 매니저에게도 공유돼요.</p>`}</div>
      <form class="col" onSubmit=${send}><textarea class="in line" rows="2" value=${text} onInput=${(e) => setText(e.target.value)} placeholder="예: 다음부터 이모지는 쓰지 마"></textarea>
        <label class="bs-opt"><input type="checkbox" checked=${always} onChange=${(e) => setAlways(e.target.checked)}/>앞으로도 지킬 규칙으로 저장(배운 것)</label>
        <div class="bs-acts"><button class="btn pri sm">보내기</button></div></form></${Sec}>`}
    ${tab === 'out' && html`<${Sec}>${(d?.artifacts ?? []).map((x) => html`<details class="bs-fold"><summary>${x.title}<small>v${x.version} · ${when(x.createdAt)}</small></summary><${Markdown} src=${x.body} /></details>`)}
      ${!(d?.artifacts ?? []).length && html`<p class="bs-why">아직 결과물이 없어요.</p>`}</${Sec}>`}
    ${tab === 'learn' && html`<${Sec}>${(d?.rules ?? []).filter((r) => r.status !== 'removed').map((r) => html`<p class="rule"><b>${r.text}</b><small>${{ confirmed: '확정 · 적용 중', estimated: '추정 · 확정 전이라 적용 안 함', once: '이번만 · 규칙으로 저장 안 함' }[r.status]} · 적용 ${r.appliedCount}회</small></p>`)}
      ${!(d?.rules ?? []).length && html`<p class="bs-why">아직 배운 것이 없어요. 고쳐 달라고 할 때 '앞으로도'를 고르면 여기에 쌓여요.</p>`}</${Sec}>`}
  </${BottomSheet}>`;
}

/** '보기' 도구(결정 87) — 줌 사다리 · 돌리기 · 자동 · 미니 · 배치 + 레벨 · 공간 설계. 평소엔 숨기고, '보기' 단추나 '사무실' 메뉴를 한 번 더 누르면 편다 */
function Tools({ h3, state, sp, editing, onEdit, panel, onPanel }) {
  const canDesign = state.employees.some((e) => e.role === 'manager') && !sp?.spec;
  return html`<div class="o-tools" role="group" aria-label="보기 도구">
    ${h3 && html`<${CamBar} h=${h3} editing=${editing} onEdit=${onEdit} />`}
    <div class="o-tools-row">
      ${h3?.layout && html`<button class=${`btn sm quiet${panel === 'level' ? ' on' : ''}`} onClick=${() => onPanel(panel === 'level' ? null : 'level')}>${ic('office', 14)} 레벨 ${state.space?.stage ?? state.office?.stage ?? 0} · 층 · 방</button>`}
      ${canDesign && html`<button class=${`btn sm quiet${panel === 'design' ? ' on' : ''}`} onClick=${() => onPanel(panel === 'design' ? null : 'design')}>${ic('map', 14)} 공간 설계</button>`}
    </div>
  </div>`;
}

export function Office({ state }) {
  const live = useLive();
  const [sel, setSel] = useState(null);
  const [dec, setDec] = useState(null); // { who, id } — 말풍선을 눌러 연 대표 몫 시트
  const [team, setTeam] = useState(false);
  const [tools, setTools] = useState(false);
  const [flat, setFlat] = useState(() => !window.WebGL2RenderingContext);
  const [plotId, setPlotId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState(null);
  const [h3, setH3] = useState(null);
  const [lookRoom, setLookRoom] = useState(null);
  const [facKey, setFacKey] = useState(null);
  const [replay, setReplay] = useState(null);
  const [scene, setScene] = useState(null);
  const [panel, setPanel] = useState(null); // '보기' 도구에서 연 시트 — 'level' · 'design'
  // 아래 시트는 한 번에 하나만 — 대표 몫 · 직원 · 팀 · 부지 · 시설 · 레벨
  const only = (k) => { if (k !== 'sel') setSel(null); if (k !== 'dec') setDec(null); if (k !== 'team') setTeam(false); if (k !== 'plot') setPlotId(null); if (k !== 'fac') setFacKey(null); if (k !== 'panel') setPanel(null); };
  const startEdit = (on) => { setEditing(on); if (on) only('edit'); else setPicked(null); };
  useEffect(() => { const on = (e) => { setReplay(e.detail); only('replay'); setEditing(false); }; document.addEventListener('ao-replay', on); return () => document.removeEventListener('ao-replay', on); }, []);
  // '사무실' 메뉴를 한 번 더 누르면 보기 도구를 편다(main.js가 알린다)
  useEffect(() => { const on = () => setTools((t) => !t); document.addEventListener('ao-office-tools', on); return () => document.removeEventListener('ao-office-tools', on); }, []);
  useEvents((ev) => { if (ev.type === 'space_built' && ev.data.kind === 'room_new') setLookRoom(ev.data.roomId); }, []);
  const { walkers, bubbles } = useMotion(state);
  const spApi = useApi(state.space ? '/api/space' : null);
  const sp = spApi.data;
  const kn = useApi('/api/knowledge/summary').data;
  // 대표 몫 — 직원마다 묶어 머리 위 인주색 말풍선(질문 → 확인 → 밖으로)
  const decs = useApi('/api/decisions').data;
  const mineBy = new Map();
  for (const d of byTurn(decs?.open ?? [])) { const w = ownerOf(d, state.employees); if (w) mineBy.set(w.id, [...(mineBy.get(w.id) ?? []), d]); }
  const mine = Object.fromEntries([...mineBy].map(([id, l]) => [id, { text: bubbleText(l), mine: true }]));
  const shownBubbles = scene ? { ...bubbles, ...mine, [scene.id]: { text: scene.text } } : { ...bubbles, ...mine };
  /** 직원(또는 말풍선)을 눌렀을 때 — 대표 몫이 있으면 그 시트, 없으면 직원 시트. 빈 곳이면 닫기 */
  const pick = (id) => {
    if (!id) { setSel(null); setDec(null); return; }
    const l = mineBy.get(id);
    if (l?.length) { only('dec'); setDec({ who: id, id: l[0].id }); } else { only('sel'); setSel(id); }
  };
  // 설계도에 자리가 없는 직무(새로 뽑은 직무) — 새 방 요청의 예시로 먼저 보여 준다
  const seated = new Set((sp?.spec?.rooms ?? []).flatMap((r) => r.stations.map((z) => z.role)));
  const roomless = [...new Map(state.employees.filter((e) => !seated.has(e.role)).map((e) => [e.role, `${roleLabel(e.role)} 작업실`])).values()];
  const open = state.counts.decisions;
  const employees = state.employees.map((e) => {
    const p = poseOf(e, state.counts.publish);
    return { ...e, ...p, status: e.activity.status, promoted: e.rank !== firstRank(e.role), bubble: p.pose === 'sit' ? null : undefined };
  });
  const { svg, anchors } = !flat ? { svg: '', anchors: {} } : officeSVG({
    employees, showEmpty: true, aiOn: state.ai.status.state === 'ready' && !state.runner.paused, brand: state.office?.name ?? '',
    cycleLabel: state.cycle?.label, flow: boardFlow(state), books: kn?.books ?? 0, trophies: kn?.trophies ?? 0, mail: open,
    decor: state.decor ?? {}, walkers, selectedId: sel,
  });
  const selected = state.employees.find((e) => e.id === sel);
  const onClick = (ev) => { const g = ev.target.closest('[data-emp]'); if (g) pick(g.dataset.emp); };
  const decList = dec ? mineBy.get(dec.who) ?? [] : [];
  return html`<div class=${`office${live.on ? '' : ' offline'}${flat ? '' : ' is3d'}`}>
    ${!live.on && html`<div class="banner">연결이 끊겼어요 — 화면은 마지막으로 확인한 상태예요. 다시 연결되면 바로 갱신돼요.</div>`}
    ${flat ? html`<div class="stage-wrap" onClick=${onClick}>
      <svg class="o-svg" viewBox=${`0 0 ${VB.w} ${VB.h}`} preserveAspectRatio="xMidYMid meet" dangerouslySetInnerHTML=${{ __html: svg }}></svg>
      <div class="o-tags">${state.employees.map((e) => {
        const p = anchors[e.id];
        if (!p) return null;
        const b = shownBubbles[e.id];
        return html`<div class="o-tag" style=${`left:${(p.x / VB.w) * 100}%;top:${(p.y / VB.h) * 100}%`}>
          ${b && html`<div class=${`o-bubble${b.mine ? ' mine' : ''}`} data-emp=${b.mine ? e.id : undefined}>${b.text}</div>`}
          <button class=${`ntag${sel === e.id ? ' on' : ''}`} data-emp=${e.id}>${e.name}</button></div>`;
      })}</div>
    </div>` : (!state.space?.has || sp?.spec) && html`<${HQ} key=${`${state.office?.stage ?? 0}:${sp?.spec ? `g${sp.rev}:${(sp.works ?? []).map((w) => w.status[0]).join('')}` : 's'}`} lookRoom=${lookRoom} onLooked=${() => setLookRoom(null)} state=${state} employees=${employees} kn=${kn} bubbles=${shownBubbles} sel=${sel ?? dec?.who ?? null}
        setSel=${pick} onFail=${() => setFlat(true)} space=${sp?.spec ? sp : null}
        onPlot=${(id) => { only('plot'); setPlotId(id); }} onFacility=${(k) => { only('fac'); setFacKey(k); }} editing=${editing} onSelectObj=${setPicked} onReady=${setH3}
        onEditStart=${() => startEdit(true)} />`}
    ${!flat && h3?.canEdit && editing && html`<div class="o3-edit on">
      <span>${picked ? html`<b>${picked.label}</b> — 끌어서 옮기거나 회전(R 키)` : '물건을 눌러 고른 뒤 끌어서 옮기세요 — 고르면 회전 · 제자리로를 쓸 수 있어요'}</span>
      <button class="btn sm" disabled=${!picked} onClick=${() => h3.rotate()}>${ic('rotR')} 회전</button><button class="btn sm" disabled=${!picked} onClick=${() => h3.resetSelected()}>제자리로</button>
      <button class="btn sm pri" onClick=${() => startEdit(false)}>배치 끝내기</button></div>`}
    ${replay?.replay?.length > 0 && h3 && html`<${Replay3D} key=${`${replay.now}:${replay.replay.length}`} data=${replay} h3=${h3} onScene=${setScene} onEnd=${() => setReplay(null)} />`}
    ${!editing && !replay && html`<${TeamLine} state=${state} onOpen=${() => { only('team'); setTeam(true); }} />`}
    ${!flat && !replay && html`<button class=${`o-tools-btn${tools ? ' on' : ''}`} onClick=${() => setTools(!tools)} aria-expanded=${tools} title="줌 · 돌리기 · 자동 연출 · 미니 화면 · 배치 · 레벨">${ic('camera', 16)}<span>보기</span></button>`}
    ${tools && !flat && !replay && html`<${Tools} h3=${h3} state=${state} sp=${sp} editing=${editing} onEdit=${startEdit} panel=${panel} onPanel=${(k) => { only('panel'); setPanel(k); }} />`}
    ${dec && !editing && html`<${DecisionSheet} key=${dec.who} id=${dec.id} state=${state} list=${decList} onPick=${(x) => setDec({ ...dec, id: x })} onClose=${() => setDec(null)} onPerson=${(id) => { only('sel'); setSel(id); }} />`}
    ${team && !editing && html`<${TeamSheet} state=${state} onPerson=${pick} onClose=${() => setTeam(false)} />`}
    ${panel === 'design' && !editing && html`<${DesignSheet} state=${state} sp=${sp} onClose=${() => setPanel(null)} />`}
    ${panel === 'level' && !editing && !flat && html`<${LevelSheet} h=${h3} state=${state} sp=${sp} kn=${kn} onPlot=${(id) => { only('plot'); setPlotId(id); }} onClose=${() => setPanel(null)} />`}
    ${selected && !editing && html`<${EmployeeSheet} key=${selected.id} emp=${selected} onClose=${() => setSel(null)} />`}
    ${facKey && !editing && !plotId && html`<${FacilityCard} f=${state.space?.fac?.[facKey]} state=${state} onClose=${() => setFacKey(null)} />`}
    ${plotId && !editing && (plotId.startsWith('work:')
      ? html`<${WorkCard} key=${plotId} work=${sp?.works?.find((w) => `work:${w.id}` === plotId)} sp=${sp} mgr=${state.employees.find((e) => e.role === 'manager')} onClose=${() => setPlotId(null)} />`
      : html`<${BuildCard} key=${plotId} plot=${sp?.plots?.find((p) => p.id === plotId)} sp=${sp} state=${state} onClose=${() => setPlotId(null)} suggest=${roomless} />`)}
  </div>`;
}
