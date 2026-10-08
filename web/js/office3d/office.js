// 3D 사무실 핵심 — 무대·빛·직원·이름표·인계 걷기·클릭·실제 상태 반영.
// 공간은 성장 단계 레이아웃(layouts/*)이 짓는다: 0 공유 오피스 → 1 작은 사무실 → 2 한 층 → 3 여러 층 → 4 사옥 (성장형 오피스 기획)
// 사무실은 도시 블록(city.js) 한가운데 건물이다. 줌이 곧 '보는 단위' — 책상 · 방 · 건물(지붕 닫힘) · 동네 · 도시(시맨틱 줌)
import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { createStage, UI_LAYER } from './stage.js';
import * as P from './props.js';
import { fonts } from './tex.js';
import { m3 } from './palette.js';
import { FONT, makeKit, liveTex, drawTeam, drawBoard, drawBadge, drawLogo, drawPlate, furnishSlot } from './build.js';
import { createSky } from './sky.js';
import { createCity } from './city.js';
import { createExterior, cutawayWalls } from './exterior.js';
import { createPip } from './pip.js';
import { createDirector } from './director.js';
import { owl } from './cast.js';
import { SPECIES, RANK, KIN } from './species.js';

export async function createOffice(host, overlay, { layout, onPick, onGo, onPlot, onFacility, onPlace, onSelect, onEditStart, view0, city: withCity = true, pipHost = null } = {}) {
  await fonts([`800 92px "${FONT}"`, `500 50px "${FONT}"`, `700 50px "${FONT}"`], '리서치팀콘텐츠팀디자인팀마케팅·퍼블리싱팀경영기획실 명 일하는 중 아직 없는 팀 채용하면 열려요 1F2F3F 로비 업무층 경영층 라이브러리 회사 지식건 기록 갤러리 실제 기록이 생길 때만 채워져요 대표 대표님 자리 대표실 결재 대기건 없음 대회의실 이번 주 회차 보드 서버실 연결됨 AI 연결 확인 필요 본사 단계 진행과 같이 움직여요 아직 이번 주 일이 없어요 할 일개 중 끝 레벨 공유 오피스 작은 사무실 우리 회사 방 층 임대 중 서버룸 자료실 회의실 경영지원 책장 임시 자리 자리가 모자라요 레벨이 오르면 정리돼요 0123456789/—·');
  if (layout.fontSample) await fonts([`800 92px "${FONT}"`, `500 50px "${FONT}"`], layout.fontSample);
  const stage = createStage(host, { overlay });
  const { scene, renderer, camera } = stage;
  const kit = makeKit();
  const casters = [], refs = {}, pickables = [];
  const bookMats = kit.books.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.82 })), bookMat = (i) => bookMats[i % bookMats.length]; // 쌓이는 회사 지식 — 무채색 다섯 단계를 나눠 쓴다
  const root = new THREE.Group(); scene.add(root);
  const { floors, slots } = layout.build({ kit, root, casters, pickables, refs });
  const roleFloor = { ...layout.roleFloor };
  for (const [r, k] of Object.entries(KIN)) roleFloor[r] ??= roleFloor[k] ?? 0;
  for (const s of slots) furnishSlot(kit, s, null);
  root.traverse((o) => { if (o.userData.faceCamera) stage.faceCamera(o); }); // 떠 있는 카드 · 표지는 카메라를 본다

  // 빛 · 배경 · 후처리 — 하늘 · 해 방향 · 실내 조명은 컴퓨터 시계의 시간대를 따른다(sky.js)
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  stage.roomEnv(0.65);
  const sun = new THREE.DirectionalLight('#FFEBD0', 3.0);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#F4F7FF', 1.25); fill.position.set(14, 20, 16); scene.add(fill);
  const hemi = new THREE.HemisphereLight('#F2F6FF', '#8C8378', 0.85); scene.add(hemi);
  const sky = createSky(stage, { light: layout.light, sun, fill, hemi });

  // ── 바깥 — 도시 블록 · 외벽과 지붕(지붕 열기) · 안쪽 바깥벽 낮추기 ──
  const ex = layout.exterior ?? { rect: { x0: -8, x1: 8, z0: -6, z1: 6 }, height: 3.2 };
  const R = ex.rect, bW = R.x1 - R.x0, bD = R.z1 - R.z0, SIZE = Math.max(bW, bD), base = ex.own ? 0 : (floors[0]?.position.y ?? 0);
  const bCenter = new THREE.Vector3((R.x0 + R.x1) / 2, base + ex.height / 2, (R.z0 + R.z1) / 2);
  const lot = { x0: R.x0 - 6, x1: R.x1 + 6 + (ex.grow ?? 0), z0: R.z0 - 6, z1: R.z1 + 8 };
  const city = withCity ? createCity(stage, { lot, kit, logo: refs.logo?.t ?? null, seed: 11 }) : null;
  const ext = ex.own ? null : createExterior(stage, { rect: R, base, height: ex.height, floorH: ex.floorH ?? 3.4, logo: refs.logo?.t ?? null });
  if (ext) pickables.push(...ext.pickables);
  const cuts = cutawayWalls(root);
  sky.onApply((s) => city?.setTime(s));
  const ao = new GTAOPass(scene, camera, 960, 540); ao.blendIntensity = 0.85;
  ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.4, thickness: 1.0, scale: 1.0, samples: 16 });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16 });
  const aoRender = ao.render.bind(ao); ao.render = (...a) => { for (const c of casters) c.visible = false; aoRender(...a); for (const c of casters) c.visible = true; };
  stage.addPass(ao);

  // ── 카메라 · 줌 단계(시맨틱 줌) ──
  // 고도: 가까이선 35° 쿼터뷰, 멀어질수록 지도처럼 내려다본다
  const polar = (h) => { const u = Math.min(1, Math.max(0, Math.log(h / 10) / Math.log(20))); return 0.96 - u * 0.34; };
  stage.setRig({ polar, center: city?.center ?? bCenter, radius: city ? 150 : 40, hMin: 3.5, hMax: city ? 320 : 60 });
  const ROOF = [SIZE * 1.15, SIZE * 1.5]; // 이 사이에서 지붕이 덮이고 외벽이 올라온다
  const LEVELS = [
    { key: 'desk', label: '책상', max: 8, h: 5.5 },
    { key: 'room', label: '방', max: ROOF[1], h: null },
    { key: 'building', label: '건물', max: Math.max(SIZE * 3.6, 80, ex.height * 1.8), h: Math.max(SIZE * 2.3, ex.height * 1.3) },
    { key: 'block', label: '동네', max: 200, h: 125 },
    { key: 'city', label: '도시', max: Infinity, h: 290 },
  ];
  const levelOf = (h) => LEVELS.findIndex((l) => h < l.max);
  const floorView = layout.view, BUILDING = layout.building ?? layout.view(0);
  let floor = layout.defaultFloor ?? 0, level = -1, roofK = 0;
  const listeners = new Set(), levelListeners = new Set();
  /** 층 보이기 — 건물 단계 이상(지붕이 닫힘)이면 모든 층(여러 층 건물이 통째로 보이게) */
  const showFloors = () => floors.forEach((g, i) => { g.visible = roofK > 0.5 || floor === 'all' || i === floor; });
  function setFloor(f, fly = true) {
    floor = f; showFloors();
    if (fly) stage.setView(f === 'all' ? BUILDING : floorView(f), 1.1);
    for (const fn of listeners) fn(f);
  }
  /** 줌 단계로 날아가기 — 책상은 선택한(없으면 일하는) 직원, 방은 지금 층, 건물 · 동네 · 도시는 우리 건물을 가운데로 */
  function zoomTo(key, dur = 1.2) {
    const L = LEVELS.find((l) => l.key === key); if (!L) return;
    if (key === 'desk') {
      const p = people.get(last.sel) ?? [...people.values()].find((q) => !q.ghost && q.mode !== 'idle') ?? [...people.values()].find((q) => !q.ghost);
      if (p) { focus(p.e.id); return; }
      stage.setView({ target: bCenter.clone().setY(base + 0.6), h: L.h }, dur); return; // 아직 직원이 없으면 건물 가운데 책상 높이로
    }
    if (key === 'room') { const f = floor === 'all' ? (layout.defaultFloor ?? 0) : floor; if (floor === 'all') setFloor(f, false); stage.setView(floorView(f), dur); return; }
    const c = key === 'building' ? bCenter.clone().setY(base + Math.min(ex.height, 60) * 0.35) : (city?.center ?? bCenter).clone();
    stage.setView({ target: c, h: L.h }, dur);
  }

  // ── 직원 ──
  const people = new Map(); // id → { e, c, slot, label, mode, walking }
  const seatLocal = (c) => new THREE.Vector3(0, 0, -(0.375 + (c.deskGap ?? c.R) + 0.02));
  function labelHtml(v, sel) {
    // 되묻는 중 · 잠듦은 머리 위에서 가장 먼저 보이게(결정 80) — 휴대폰에서도 숨기지 않는다
    const flag = v.flag === 'ask' ? '<span class="o3-flag f-ask"><i>?</i>되묻는 중</span>' : v.flag === 'sleep' ? '<span class="o3-flag f-sleep"><i>z</i>잠듦</span>' : '';
    // 대표 몫 말풍선(결정 87) — 인주색, 누르면 그 직원의 시트(data-emp로 이름표와 같은 길)
    const bubble = !v.bubble ? '' : v.mine ? `<button class="o-bubble mine" data-emp="${v.id}">${esc(v.bubble)}</button>` : `<div class="o-bubble">${esc(v.bubble)}</div>`;
    return `<div class="o3-tag${v.flag ? ` has-flag fl-${v.flag}` : ''}${v.mine ? ' has-mine' : ''}">${bubble}${flag}<button class="ntag${sel ? ' on' : ''}${v.ghost ? ' ghost' : ''}" data-emp="${v.id}">${esc(v.name)}<span class="pill st-${v.status}"><i class="dot"></i>${esc(v.statusLabel)}</span></button>${v.task ? `<small class="o3-task">${esc(v.task)}</small>` : ''}</div>`;
  }
  function seat(p) {
    p.c.root.removeFromParent();
    p.c.root.position.copy(seatLocal(p.c)); p.c.root.rotation.set(0, 0, 0);
    p.slot.g.add(p.c.root);
  }
  /** 후보(면접 대기) — 반투명 회색. 책상에 앉지 않고 그 부서 빈 책상 앞에 서 있다(결정 48) */
  function ghostify(c) {
    const gray = new THREE.Color(m3('mid'));
    c.root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.5; o.material.depthWrite = true;
      o.material.color?.lerp(gray, 0.65); if (o.material.emissive) o.material.emissiveIntensity = 0; o.castShadow = false;
    });
  }
  function release(p) {
    p.c.root.removeFromParent(); p.label?.el.remove(); p.holder?.removeFromParent();
    if (!p.ghost) { p.slot.emp = null; furnishSlot(kit, p.slot, null); }
  }
  function syncPeople(list) {
    const ids = new Set(list.map((v) => v.id));
    for (const [id, p] of people) if (!ids.has(id)) { release(p); people.delete(id); }
    const ghostN = {};
    for (const v of list) {
      let p = people.get(v.id);
      const rank = RANK[v.rank] ?? 'new';
      if (p && (p.e.role !== v.role || p.rank !== rank || p.ghost !== !!v.ghost)) { release(p); people.delete(v.id); p = null; }
      if (p) { p.e = v; if (p.ghost) ghostN[v.role] = (ghostN[v.role] ?? 0) + 1; continue; }
      // 그 직무 팀 → 가까운 직무 팀(추가 직무) → 직무 없는 팀
      const team = layout.teams.find((t) => t.role === v.role) ?? layout.teams.find((t) => t.role && t.role === KIN[v.role]) ?? layout.teams.find((t) => !t.role);
      const c = (SPECIES[v.role] ?? owl)({ rank });
      c.root.traverse((o) => { o.userData.empId = v.id; });
      if (v.ghost) {
        const base = slots.find((s) => s.team === team && !s.emp) ?? slots.find((s) => s.team === team) ?? slots[0];
        if (!base) continue;
        const i = ghostN[v.role] = (ghostN[v.role] ?? 0) + 1;
        const holder = new THREE.Group(); holder.position.copy(base.g.position); holder.rotation.copy(base.g.rotation); base.g.parent.add(holder);
        c.root.position.set(((i - 1) % 3 - 1) * 0.95, 0, 1.15 + Math.floor((i - 1) / 3) * 0.9); holder.add(c.root);
        ghostify(c);
        p = { e: v, c, slot: base, rank, mode: 'idle', label: null, walk: null, ghost: true, holder };
      } else {
        // 같은 팀 → 같은 직무의 다른 팀 → 임시 자리 → 아무 빈자리
      const slot = slots.find((s) => s.team === team && !s.emp) ?? slots.find((s) => v.role && s.team?.role === v.role && !s.emp) ?? slots.find((s) => KIN[v.role] && s.team?.role === KIN[v.role] && !s.emp) ?? slots.find((s) => s.team?.key === 'overflow' && !s.emp) ?? slots.find((s) => !s.emp);
        if (!slot) continue;
        slot.emp = v.id; furnishSlot(kit, slot, v);
        p = { e: v, c, slot, rank, mode: 'idle', label: null, walk: null, ghost: false };
        seat(p);
      }
      people.set(v.id, p); pickables.push(c.root);
      p.label = stage.label(c.top, labelHtml(v, false), '', 0.18);
    }
    for (const t of layout.teams) refs.teamSign?.[t.key]?.draw(drawTeam(t, slots.filter((s) => s.team === t && s.emp).length));
  }

  // ── 인계 걷기(실제 수락 이벤트로만) ──
  function lanePath(f, A, aDir, B, bDir) {
    const L = layout.lanes?.[f]; if (!L) return [[A.x, A.z], [B.x, B.z]];
    const lanes = [...L.h.map(([z, x0, x1]) => ({ h: true, c: z, a: x0, b: x1, pts: [] })), ...L.v.map(([x, z0, z1]) => ({ h: false, c: x, a: z0, b: z1, pts: [] }))];
    const nodes = [], key = (x, z) => `${x.toFixed(2)},${z.toFixed(2)}`, idx = new Map();
    const node = (x, z) => { const k = key(x, z); if (!idx.has(k)) { idx.set(k, nodes.length); nodes.push({ x, z, adj: [] }); } return idx.get(k); };
    for (const h of lanes.filter((l) => l.h)) for (const v of lanes.filter((l) => !l.h)) if (v.c >= h.a - 1e-6 && v.c <= h.b + 1e-6 && h.c >= v.a - 1e-6 && h.c <= v.b + 1e-6) { const n = node(v.c, h.c); h.pts.push(n); v.pts.push(n); }
    const entry = (P0, dir) => {
      if (dir === 'el') { const v = lanes.filter((l) => !l.h).sort((p, q) => Math.abs(p.c - P0.x) - Math.abs(q.c - P0.x))[0]; const n = node(v.c, Math.min(v.b, Math.max(v.a, P0.z))); v.pts.push(n); return n; }
      const cands = lanes.filter((l) => l.h && (l.c - P0.z) * dir > 0 && P0.x >= l.a - 0.5 && P0.x <= l.b + 0.5).sort((p, q) => Math.abs(p.c - P0.z) - Math.abs(q.c - P0.z));
      const l = cands[0]; if (!l) return null;
      const n = node(Math.min(l.b, Math.max(l.a, P0.x)), l.c); l.pts.push(n); return n;
    };
    const ea = entry(A, aDir), eb = entry(B, bDir);
    if (ea == null || eb == null) return [[A.x, A.z], [B.x, B.z]];
    for (const l of lanes) {
      const u = [...new Set(l.pts)].sort((p, q) => (l.h ? nodes[p].x - nodes[q].x : nodes[p].z - nodes[q].z));
      for (let i = 1; i < u.length; i++) { const d = Math.hypot(nodes[u[i]].x - nodes[u[i - 1]].x, nodes[u[i]].z - nodes[u[i - 1]].z); nodes[u[i]].adj.push([u[i - 1], d]); nodes[u[i - 1]].adj.push([u[i], d]); }
    }
    const dist = nodes.map(() => Infinity), prev = nodes.map(() => -1), done = new Set(); dist[ea] = 0;
    while (done.size < nodes.length) {
      let m = -1; for (let i = 0; i < nodes.length; i++) if (!done.has(i) && (m < 0 || dist[i] < dist[m])) m = i;
      if (m < 0 || dist[m] === Infinity) break; done.add(m);
      for (const [n, d] of nodes[m].adj) if (dist[m] + d < dist[n]) { dist[n] = dist[m] + d; prev[n] = m; }
    }
    const route = []; for (let n = eb; n >= 0; n = prev[n]) { route.unshift([nodes[n].x, nodes[n].z]); if (n === ea) break; }
    return [[A.x, A.z], ...route, [B.x, B.z]];
  }
  const local = (p) => { const v = seatLocal(p.c); p.slot.g.localToWorld(v); floors[p.slot.floor].worldToLocal(v); return v; };
  const backDir = (p) => (Math.abs(p.slot.yaw) < 0.1 ? -1 : 1); // 앞줄은 뒤(-z)가 비어 있다
  /** 건네는 자리 — 받는 사람 등 뒤 옆(자리를 옮기거나 돌려도 따라간다) */
  const giveSpot = (p) => { const v = seatLocal(p.c).add(new THREE.Vector3(0.65, 0, -0.55)); p.slot.g.localToWorld(v); floors[p.slot.floor].worldToLocal(v); return v; };
  function handoff(fromId, toId) {
    const a = people.get(fromId), b = people.get(toId);
    if (!a || !b || a.ghost || b.ghost || a.walk || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const T = local(b), bd = backDir(b), yaw = b.slot.yaw;
    const G = layout.navPath ? giveSpot(b) : T.clone().add(new THREE.Vector3(0, 0, 0.6 * bd)).add(new THREE.Vector3(Math.cos(yaw) * 0.6, 0, 0));
    const route = (f, A, aDir, B, bDir) => (layout.navPath ? layout.navPath(f, A, B) : lanePath(f, A, aDir, B, bDir));
    const segs = [];
    if (a.slot.floor === b.slot.floor) segs.push({ f: b.slot.floor, pts: route(b.slot.floor, local(a), backDir(a), G, bd) });
    else {
      const E = new THREE.Vector3(layout.elevator.x, 0, layout.elevator.z);
      segs.push({ f: a.slot.floor, pts: route(a.slot.floor, local(a), backDir(a), E, 'el') });
      segs.push({ f: b.slot.floor, pts: route(b.slot.floor, E, 'el', G, bd) });
    }
    for (const s of segs) s.len = s.pts.slice(1).reduce((L, q, i) => L + Math.hypot(q[0] - s.pts[i][0], q[1] - s.pts[i][1]), 0);
    a.walk = { segs, face: T, t0: null };
  }
  const SPEED = 1.15, GIVE = 2.2;
  function walkStep(p, t) {
    const w = p.walk; if (w.t0 == null) w.t0 = t;
    const go = w.segs, back = [...w.segs].reverse().map((s) => ({ ...s, pts: [...s.pts].reverse() }));
    const timeline = [...go.map((s) => ({ s, kind: 'walk', carry: true })), { kind: 'give', s: go.at(-1) }, ...back.map((s) => ({ s, kind: 'walk', carry: false }))];
    let u = t - w.t0;
    for (const ph of timeline) {
      const dur = ph.kind === 'give' ? GIVE : ph.s.len / SPEED;
      if (u > dur) { u -= dur; continue; }
      const parent = floors[ph.s.f];
      if (p.c.root.parent !== parent) { p.c.root.removeFromParent(); parent.add(p.c.root); }
      if (ph.kind === 'give') {
        const [x, z] = ph.s.pts.at(-1); p.c.root.position.set(x, 0, z); p.c.root.rotation.y = Math.atan2(w.face.x - x, w.face.z - z);
        p.c.animate(t, 'give', { carry: true }); return;
      }
      let d = u * SPEED; const pts = ph.s.pts;
      for (let i = 1; i < pts.length; i++) {
        const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (d <= L || i === pts.length - 1) { const k = L ? Math.min(1, d / L) : 1; p.c.root.position.set(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, 0, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k); p.c.root.rotation.y = Math.atan2(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); break; }
        d -= L;
      }
      p.c.animate(t, 'walk', { carry: ph.carry, phase: t * 7 }); return;
    }
    p.walk = null; seat(p);
  }
  // 잠듦 — 느리게 숨 쉬며 고개를 숙인다(새 모델 · 조명 없이 자세만)
  stage.onUpdate((t) => { for (const p of people.values()) { if (p.walk) walkStep(p, t); else if (p.mode === 'sleep' && !p.cheer) { p.c.animate(t * 0.3 + p.e.id.length, 'idle', {}); p.c.bob.rotation.x = 0.32; p.c.bob.rotation.y = 0; } else p.c.animate(t + p.e.id.length, p.cheer ? 'raise' : p.mode, {}); } });

  // ── 연출: 레벨 업(짐 상자가 내려와 풀림) · 승급(금빛 기둥 + 고리) — 실제 기록이 바뀐 순간에만. window.__fxSlow 로 점검할 때 느리게 ──
  const fx = [];
  stage.onUpdate((t) => { for (const f of [...fx]) { f.t0 ??= t; const k = (t - f.t0) / (f.dur * (window.__fxSlow ?? 1)); if (k >= 1) { f.done?.(); fx.splice(fx.indexOf(f), 1); } else f.update(k); } });
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function banner(title, sub, tone = 'gold') {
    const b = document.createElement('div'); b.className = `o3-banner ${tone}`; b.innerHTML = `<b>${esc(title)}</b><span>${esc(sub)}</span>`;
    host.parentElement?.appendChild(b); setTimeout(() => b.remove(), 4200);
  }
  function cardboard() {
    const g = new THREE.Group(), c = kit.m.box, tape = kit.m.brass; // 짐 상자 — 무채색 상자 + 황동 띠(성장)
    g.add(P.box(kit, 0.52, 0.38, 0.4, c, 0, 0.19, 0, 0.02), P.box(kit, 0.53, 0.012, 0.1, tape, 0, 0.385, 0, 0), P.box(kit, 0.36, 0.26, 0.3, c, 0.02, 0.51, 0.02, 0.02));
    g.rotation.y = 0.3; return g;
  }
  function levelUp({ level, name }) {
    banner(`사무실 레벨 ${level}`, name ? `${name} — 레벨이 올랐어요` : '레벨이 올랐어요');
    if (calm()) return;
    let i = 0;
    for (const p of people.values()) {
      if (p.ghost) continue;
      const box = cardboard(), at = seatLocal(p.c).add(new THREE.Vector3(0.75, 0, -0.35)); box.position.copy(at); p.slot.g.add(box);
      const delay = (i++ % 6) * 0.08; p.cheer = true;
      fx.push({ dur: 3.4, update(k) { const u = Math.max(0, k - delay); box.position.y = u < 0.18 ? (1 - u / 0.18) ** 2 * 1.6 : 0; const s = u > 0.7 ? Math.max(0.01, 1 - (u - 0.7) / 0.3) : 1; box.scale.setScalar(s); }, done() { box.removeFromParent(); p.cheer = false; } });
    }
  }
  function promoted(id, rank) {
    const p = people.get(id); if (!p) return;
    banner(`${p.e.name} 승급`, `${rank} — 실제 기록으로 올랐어요`, 'gold');
    focus(id);
    if (calm()) return;
    const w = new THREE.Vector3(); p.c.root.getWorldPosition(w); const parent = floors[p.slot.floor]; parent.worldToLocal(w);
    const glow = new THREE.MeshBasicMaterial({ color: m3('brass'), transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 3.2, 32, 1, true), glow); beam.position.set(w.x, 1.6, w.z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 10, 48), glow.clone()); ring.rotation.x = Math.PI / 2; ring.position.set(w.x, 0.05, w.z);
    parent.add(beam, ring); casters.push(beam, ring); p.cheer = true;
    fx.push({ dur: 3.0, update(k) { glow.opacity = Math.sin(Math.min(1, k * 1.4) * Math.PI) * 0.45; ring.material.opacity = (1 - k) * 0.9; ring.scale.setScalar(1 + k * 2.2); ring.position.y = 0.05 + k * 1.6; }, done() { beam.removeFromParent(); ring.removeFromParent(); p.cheer = false; if (!last.sel) unfocus(); } });
  }

  // ── 줌에 따라: 지붕 · 외벽 · 안쪽 벽 낮추기 · 층 보이기 · 이름표 · 해 · 차 ──
  const anchor = new THREE.Object3D(); anchor.position.set(bCenter.x, base + ex.height + 2.2, bCenter.z); scene.add(anchor);
  const badge = stage.label(anchor, '', 'o3-bldg-lbl'); // 건물 · 동네 · 도시 단계의 우리 건물 표지
  const camDir = { x: 0, z: 1 };
  stage.onUpdate((t, dt) => {
    const h = stage.viewH, az = stage.azimuth;
    camDir.x = Math.sin(az); camDir.z = Math.cos(az);
    const k = Math.min(1, Math.max(0, (h - ROOF[0]) / (ROOF[1] - ROOF[0]))), kk = k * k * (3 - 2 * k);
    const outside = kk > 0.5;
    if (outside !== roofK > 0.5) { roofK = kk; showFloors(); } else roofK = kk;
    const f = floor === 'all' ? null : floor, clip = f == null || floors.length < 2 ? null : floors[f].position.y + 3.4;
    ext?.update(kk, camDir, sky.state?.night ?? 0, clip); cuts.update(kk, camDir); city?.hideNear(kk < 0.35);
    sky.aim(stage.controls?.target ?? bCenter, h); city?.update(t, dt);
    for (const p of people.values()) if (p.label) p.label.hidden = outside;
    if (badge) badge.hidden = !outside;
    const L = levelOf(h);
    if (L !== level) { level = L; overlay.dataset.level = LEVELS[L].key; for (const fn of levelListeners) fn(LEVELS[L]); }
  });

  // ── 클릭: 직원 → 카드, 시설 → 해당 화면, (밖에서) 건물 → 안으로 ──
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), el = renderer.domElement; let down = null;
  ray.layers.enable(UI_LAYER); // 결재 숫자 · 레벨 표도 눌린다
  const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  const hitAt = (ev) => { const r = el.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.intersectObjects(pickables, true).find((h) => shown(h.object) && (roofK > 0.5 || !h.object.userData.building)); }; // 방 보기에선 외벽을 건너뛴다
  el.addEventListener('pointerdown', (ev) => { down = [ev.clientX, ev.clientY]; });
  el.addEventListener('pointerup', (ev) => {
    if (stage.editing || !down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 6) return;
    const h = hitAt(ev);
    if (h?.object.userData.building) { zoomTo(level >= 3 ? 'building' : 'room'); return; }
    if (h?.object.userData.empId) onPick?.(h.object.userData.empId);
    else if (h?.object.userData.plot) onPlot?.(h.object.userData.plot);
    else if (h?.object.userData.fac && onFacility) onFacility(h.object.userData.fac);
    else if (h?.object.userData.go) onGo?.(h.object.userData.go);
    else onPick?.(null);
  });
  let hoverT = 0;
  el.addEventListener('pointermove', (ev) => { const now = performance.now(); if (stage.editing || now - hoverT < 120 || ev.buttons) return; hoverT = now; const h = hitAt(ev); el.style.cursor = h ? 'pointer' : ''; });
  overlay.addEventListener('click', (ev) => { const b = ev.target.closest('[data-emp]'); if (b) onPick?.(b.dataset.emp); const z = ev.target.closest('[data-zoom]'); if (z) zoomTo(z.dataset.zoom); });

  // ── 실제 상태 반영 ──
  let last = {};
  function update(v) {
    syncPeople(v.employees);
    for (const e of v.employees) {
      const p = people.get(e.id); if (!p) continue;
      p.mode = e.mode;
      const html = labelHtml(e, v.selectedId === e.id);
      if (p.label && p.labelHtml !== html) { p.label.el.innerHTML = html; p.labelHtml = html; }
    }
    const k = (x) => JSON.stringify(x);
    if (last.logo !== v.company) { last.logo = v.company; refs.logo?.draw(drawLogo(v.company ?? '')); ext?.setName(v.company); }
    if (last.board !== k([v.cycleLabel, v.flow])) { last.board = k([v.cycleLabel, v.flow]); refs.board?.draw(drawBoard(v.cycleLabel, v.flow)); }
    if (last.dec !== v.decisions) {
      last.dec = v.decisions; refs.badge?.draw(drawBadge(v.decisions));
      refs.ceoSign?.draw(drawPlate(refs.ceoName ?? '대표실', v.decisions ? `결재 대기 ${v.decisions}건` : '결재 대기 없음', v.decisions ? 'decide' : 'plain'));
      refs.papers?.clear(); if (refs.papers) for (let i = 0; i < Math.min(v.decisions, 6); i++) refs.papers.add(P.box(kit, 0.32, 0.006, 0.24, kit.m.paper, 0, 0.065 + i * 0.009, 0, 0));
    }
    if (last.ai !== k([v.aiOn, v.aiLabel])) {
      last.ai = k([v.aiOn, v.aiLabel]);
      if (refs.led) { refs.led.color.set(m3(v.aiOn ? 'on' : 'off')); refs.led.emissive.set(m3('on')); refs.led.emissiveIntensity = v.aiOn ? 2.4 : 0; }
      refs.serverSign?.draw(drawPlate(refs.serverName ?? '서버실', v.aiOn ? `${v.aiLabel} 연결됨` : 'AI 연결 확인 필요', v.aiOn ? 'ok' : 'bad'));
    }
    if (last.books !== v.books) {
      last.books = v.books; refs.books?.clear();
      for (let i = 0; refs.books && i < v.books; i++) { const at = layout.bookAt(i); if (!at) break; const it = refs.bookItem ?? [0.075, 0.38, 0.27]; refs.books.add(P.box(kit, it[0], it[1], it[2], bookMat(i), ...at, 0.004)); }
      refs.libSign?.draw(drawPlate(refs.libName ?? '라이브러리', `회사 지식 ${v.books}건`));
    }
    if (last.tro !== v.trophies) {
      last.tro = v.trophies; refs.trophies?.clear();
      for (let i = 0; refs.trophies && i < v.trophies; i++) { const at = layout.trophyAt(i); if (!at) break; const t = layout.trophyMake ? layout.trophyMake(kit, i) : P.trophy(kit, 'brass', layout.trophyScale ?? 2.2); t.position.set(...at); refs.trophies.add(t); }
    }
    const crew = v.employees.filter((e) => !e.ghost), busy = crew.filter((e) => e.status === 'working').length;
    const bh = `<button class="o3-bldg" data-zoom="room"><b>${esc(v.company || '우리 회사')}</b>${v.officeLevel ? `<em>${esc(v.officeLevel)}</em>` : ''}<span>직원 ${crew.length}${busy ? ` · <i>일하는 중 ${busy}</i>` : ''}${v.decisions ? ` · <u>결재 ${v.decisions}</u>` : ''}</span></button>`;
    if (badge && last.badge !== bh) { last.badge = bh; badge.el.innerHTML = bh; }
    if (v.selectedId && v.selectedId !== last.sel) focus(v.selectedId);
    else if (!v.selectedId && last.sel) unfocus();
    last.sel = v.selectedId;
  }
  let focusFrom = null; // 직원을 눌러 확대하기 전 시점 — 카드를 닫으면 여기로 돌아간다
  function unfocus() {
    if (!focusFrom) return;
    const { view: v0, floor: f0 } = focusFrom; focusFrom = null;
    if (f0 !== floor) setFloor(f0, false);
    stage.setView(v0, 1.0);
  }
  function focus(id, instant = false) {
    const p = people.get(id); if (!p) return;
    if (!focusFrom) focusFrom = { view: stage.getView(), floor };
    const f = p.walk ? floor : p.slot.floor;
    if (floor !== f) setFloor(f, false);
    const w = new THREE.Vector3(); p.c.root.getWorldPosition(w);
    stage.setView({ target: w.add(new THREE.Vector3(0, p.c.height * 0.45, 0)), h: 5.5 }, instant ? 0 : 1.1); // 책상 단계
  }

  // ── 방(설계도 방 · 팀 구역) — 미니 화면 · 자동 연출이 비춘다 ──
  const places = (layout.plan ? layout.plan.rooms.filter((r) => r.built !== false).map((r) => ({ id: r.id, name: r.name ?? r.id, x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, floor: 0 }))
    : layout.teams.filter((t) => t.cx != null).map((t) => ({ id: t.key, name: t.name, x0: t.cx - 3, x1: t.cx + 3, z0: t.cz - 2.4, z1: t.cz + 2.6, floor: t.floor ?? 0 })));
  const floorY = (f) => floors[f ?? 0]?.position.y ?? 0;
  const inPlace = (pl, w, f) => w.x >= pl.x0 && w.x <= pl.x1 && w.z >= pl.z0 && w.z <= pl.z1 && f === (pl.floor ?? 0);
  const busyIn = (pl) => { let n = 0; const w = new THREE.Vector3(); for (const p of people.values()) if (!p.ghost && p.mode !== 'idle' && !p.walk) { p.c.root.getWorldPosition(w); if (inPlace(pl, w, p.slot.floor)) n++; } return n; };
  const lookPlace = (pl, dur = 1.2) => { if ((pl.floor ?? 0) !== floor && floors.length > 1) setFloor(pl.floor ?? 0, false); stage.setView({ target: new THREE.Vector3((pl.x0 + pl.x1) / 2, floorY(pl.floor), (pl.z0 + pl.z1) / 2), h: Math.max(pl.x1 - pl.x0, pl.z1 - pl.z0) * 1.25 + 3 }, dur); };
  const pip = pipHost && places.length > 1 ? createPip(stage, { host: pipHost, places, floors, busy: busyIn, onPick: (pl) => lookPlace(pl),
    focusOf: () => (roofK > 0.5 ? null : { ...stage.getView().target, floor: floor === 'all' ? null : floor }) }) : null;
  let decAt = null;
  const director = createDirector({ stage, people, places, zoomTo, floorY,
    showFloor: (f) => { if (floors.length > 1 && f != null && f !== floor) setFloor(f, false); },
    floorOf: (w) => floors.reduce((best, g, i) => (Math.abs(w.y - g.position.y) < Math.abs(w.y - floorY(best)) ? i : best), 0),
    decisionsAt: () => { if (!decAt) root.traverse((o) => { if (!decAt && (o.userData.fac === 'decisions' || o.userData.go === 'decisions')) decAt = o.getWorldPosition(new THREE.Vector3()); }); return decAt?.clone(); } });

  stage.start();
  // 꾹 누르기 표시 — 누르는 동안 원이 차오른다
  const ringEl = document.createElement('div'); ringEl.className = 'hold-ring'; ringEl.hidden = true; host.parentElement?.appendChild(ringEl);
  const ring = {
    show(x, y, ms) { const r = host.getBoundingClientRect(); ringEl.style.left = `${x - r.left}px`; ringEl.style.top = `${y - r.top}px`; ringEl.style.setProperty('--ms', `${ms}ms`); ringEl.hidden = false; ringEl.classList.remove('go'); void ringEl.offsetWidth; ringEl.classList.add('go'); },
    hide() { ringEl.hidden = true; ringEl.classList.remove('go'); },
  };
  const editor = layout.attach?.(stage, { onPlace, onSelect, onEditStart, ring }) ?? null;
  if (new URLSearchParams(location.search).has('debug3d')) window.__office3d = { stage, people, focus, sky, zoomTo, city, ext, pip, director, places, movables: layout.movables ?? [], celebrate: (k, d) => (k === 'level' ? levelUp(d) : promoted(d.id, d.rank)) }; // 점검용
  return {
    update, handoff, focus, unfocus,
    /** 연출 — 레벨 업 · 승급 */
    celebrate(kind, data) { if (kind === 'level') levelUp(data); if (kind === 'promote') promoted(data.id, data.rank); },
    get floor() { return floor; },
    /** 시간대(새벽 · 아침 · 오후 · 저녁 · 밤) — 바뀔 때마다 알린다. 화면 글자 대비를 맞출 때 쓴다 */
    onSky(fn) { return sky.onChange(fn); },
    setFloor, onFloor(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** 처음 보여줄 층 — 직원이 가장 많은 층 */
    home(list) { const n = floors.map(() => 0); for (const e of list) n[roleFloor[e.role] ?? 0]++; const f = list.length ? n.indexOf(Math.max(...n)) : (layout.defaultFloor ?? 0); setFloor(f, false); stage.setView(view0 ?? floorView(f), 0); },
    layout: { key: layout.key, stage: layout.stage, name: layout.name, place: layout.place, capacity: layout.capacity, floors: layout.floors, roleFloor, hasBuilding: !!layout.building,
      recordsFloor: layout.recordsFloor ?? 0, decisionFloor: layout.decisionFloor ?? layout.roleFloor?.manager ?? (layout.floors.length - 1) },
    /** 작은 화면용 — 지금 층의 책상(후보 포함)이 꽉 차게 카메라를 맞춘다 */
    frameDesks(pad = 1.15) {
      const pts = [];
      const v = new THREE.Vector3();
      for (const s of slots) if (s.floor === floor && s.team?.key !== 'overflow') { s.g.getWorldPosition(v); pts.push(v.clone()); }
      for (const p of people.values()) if (p.ghost) { p.c.root.getWorldPosition(v); pts.push(v.clone()); }
      if (!pts.length) return;
      const box = new THREE.Box3().setFromPoints(pts), c = box.getCenter(new THREE.Vector3()), r = Math.max(2.4, box.getSize(new THREE.Vector3()).length() / 2) * pad;
      c.y += 0.6; stage.setView({ target: c, h: (2 * r) / Math.min(1, stage.width / stage.height) }, 0);
    },
    /** 배치 모드(드래그로 옮기기) — 설계도로 지은 공간만 */
    canEdit: !!editor,
    edit(on) { editor?.setEnabled(on); if (on) { overlay.style.visibility = 'hidden'; } else overlay.style.visibility = ''; },
    rotate() { return editor?.rotate(); },
    resetSelected() { editor?.reset(); },
    /** 방 하나를 보여 준다(새 방 완공 때) */
    lookRoom(id) {
      const r = layout.plan?.rooms.find((q) => q.id === id); if (!r) return;
      const c = new THREE.Vector3((r.x0 + r.x1) / 2, 0.4, (r.z0 + r.z1) / 2), span = Math.max(r.x1 - r.x0, r.z1 - r.z0);
      stage.setView({ target: c, h: span * 1.25 + 3 }, 1.4);
    },
    cameraView() { const v = focusFrom?.view ?? stage.getView(); return { target: v.target.toArray(), h: v.h, az: v.az }; },
    // ── 시점(시맨틱 줌) ──
    levels: LEVELS.map(({ key, label }) => ({ key, label })),
    get level() { return LEVELS[Math.max(0, level)].key; },
    onLevel(fn) { levelListeners.add(fn); if (level >= 0) fn(LEVELS[level]); return () => levelListeners.delete(fn); },
    zoomTo,
    /** 카메라를 90°씩 돌린다(↺ −1 · ↻ +1) */
    turn(dir) { stage.rotate(dir); },
    /** 다른 방 미니 화면 · 자동 연출 카메라 */
    pip, director,
    dispose() { listeners.clear(); levelListeners.clear(); sky.dispose(); city?.dispose(); pip?.dispose(); director.set(false); editor?.dispose(); ringEl.remove(); stage.dispose(); },
  };
}


const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
