// 공간 설계도 → 3D 레이아웃(결정 67, '필요의 방'). AI는 뜻(방·자리·기능 자리의 모습·분위기)만 쓰고,
// 크기·배치·통로·카메라는 엔진이 정한다 — 그래서 어떤 도메인이 와도 겹치거나 끼이지 않게 지어진다.
import * as THREE from 'three';
import * as P from '../props.js';
import { FONT, liveTex, plane, ceilingCaster, glassWalls, facing, cutaway, card, uiSprite } from '../build.js';
import { tex, canvas, planks } from '../tex.js';
import { m3, ui, matte } from '../palette.js';
import { makeProp, footprint, stationFurnisher, stationWidth, boardForm, powerForm, knowledgeForm, milestoneForm, decisionsForm } from './parts.js';
import { NavGrid } from './nav.js';
import { rectOf, attachEditor } from './editor.js';

export const FACILITIES = ['board', 'decisions', 'power', 'knowledge', 'milestones'];
const ROLES = ['manager', 'researcher', 'writer', 'designer', 'marketer', 'editor', 'producer', 'seo'];
const CORE_ROLES = ROLES.slice(0, 4); // 설계도에 꼭 있어야 하는 자리(추가 직무 자리는 있으면 쓴다)
const SIZE_MIN = { s: [4.6, 4.2], m: [6.4, 5.2], l: [8.8, 6.4] };
const WH = 3.0, CORRIDOR = 1.9, BACK = 0.75, ROW_D = 2.55, ENTRY = 2.6;

/** 설계도 다듬기 — 빠진 기능 자리는 첫 방에, 범위 밖 값은 자르고, 문제는 notes 로 남긴다 */
export function normalize(raw) {
  const notes = [];
  const spec = JSON.parse(JSON.stringify(raw ?? {}));
  spec.title = String(spec.title ?? '우리 공간').slice(0, 30);
  spec.style = { floor: 'carpet', wall: '#E4E2DE', accent: '#3E6A8A', light: 'neutral', windows: true, ...(spec.style ?? {}) };
  spec.recipes = spec.recipes ?? {};
  spec.facilities = spec.facilities ?? {};
  const raws = Array.isArray(spec.rooms) ? spec.rooms : [];
  spec.rooms = [...raws.filter((r) => !r?.added).slice(0, 8), ...raws.filter((r) => r?.added).slice(0, 8)].map((r, i) => ({
    id: String(r.id ?? `room${i}`), name: String(r.name ?? `방 ${i + 1}`).slice(0, 16), walls: ['open', 'glass', 'solid'].includes(r.walls) ? r.walls : 'open',
    size: ['s', 'm', 'l'].includes(r.size) ? r.size : 'm', color: /^#[0-9a-f]{6}$/i.test(r.color ?? '') ? r.color : null,
    stations: (r.stations ?? []).slice(0, 4).map((z) => ({ role: ROLES.includes(z.role) ? z.role : null, station: z.station ?? 'desk', count: Math.max(1, Math.min(6, z.count ?? 1)), label: String(z.label ?? '').slice(0, 16), extras: (z.extras ?? []).slice(0, 2) })),
    props: (r.props ?? []).slice(0, 8).map((p) => (typeof p === 'string' ? { name: p, count: 1 } : { name: p.name, count: Math.max(1, Math.min(4, p.count ?? 1)) })),
    facilities: r.added ? [] : (r.facilities ?? []).filter((f) => FACILITIES.includes(f)),
    added: !!r.added, // 새 방 요청으로 붙인 방 — 건물 오른쪽 별관에 짓는다(있던 방은 움직이지 않는다)
  }));
  if (!spec.rooms.length) { spec.rooms.push({ id: 'main', name: '작업실', walls: 'open', size: 'm', stations: [{ role: null, station: 'desk', count: 2, label: '', extras: [] }], props: [], facilities: [] }); notes.push('방이 없어서 기본 작업실을 넣었어요'); }
  const home = spec.rooms.find((r) => !r.added) ?? spec.rooms[0];
  for (const f of FACILITIES) {
    const owners = spec.rooms.filter((r) => r.facilities.includes(f));
    if (!owners.length) { home.facilities.push(f); notes.push(`${f} 자리가 없어서 첫 방에 넣었어요`); }
    for (const extra of owners.slice(1)) extra.facilities = extra.facilities.filter((x) => x !== f);
  }
  for (const role of CORE_ROLES) if (!spec.rooms.some((r) => r.stations.some((z) => z.role === role))) notes.push(`${role} 자리가 없어요 — 빈자리에 앉아요`);
  return { spec, notes };
}

/** 바닥 — 설계도의 바닥 종류는 무늬만 받고 색은 재질 팔레트 하나(홈 · 앱 같은 재질, brand.md §3-4 원칙 6). floorColor · wall 색 값은 쓰지 않는다 */
function floorMaterial(style) {
  if (style.floor === 'wood') return matte('#ffffff', 0.9, { map: tex(planks({ base: m3('floor'), vary: 0.035, rows: 10, grain: 0, seam: m3('light-2'), seed: 12 }), { repeat: [4, 3] }) });
  if (style.floor === 'tile') return matte('#ffffff', 0.86, { map: tex(canvas(256, 256, (g) => { g.fillStyle = m3('floor'); g.fillRect(0, 0, 256, 256); g.strokeStyle = m3('light-2'); g.lineWidth = 3; for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); } }), { repeat: [8, 6] }) });
  if (style.floor === 'epoxy') return matte(m3('floor'), 0.72);
  return null; // concrete · carpet — kit 기본(밝은 콘크리트)
}

/** 방 이름표 — 2D 카드(면 · 선 · 모서리 12 · Pretendard). 방 색 띠는 없앴다(채도는 마스코트 · 결재함 · 레벨 표에만) */
const drawRoomSign = (name, sub) => (g, w, h) => {
  card(g, w, h, { k: h / 56 });
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillStyle = ui('ink'); g.font = `800 92px "${FONT}"`; g.fillText(name, 64, sub ? 100 : 128);
  if (sub) { g.fillStyle = ui('ink-2'); g.font = `600 50px "${FONT}"`; g.fillText(sub, 66, 188); }
};

/** 빈 부지 표지 — 지을 수 있으면 행동 버튼(검정 채움), 아직이면 점선 카드 */
const drawPlot = (title, sub, ok) => (g, w, h) => {
  const k = h / 60;
  if (ok) { g.beginPath(); g.roundRect(0, 0, w, h, 8 * k); g.fillStyle = ui('accent'); g.fill(); }
  else card(g, w, h, { k, dash: [4, 3] });
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = ok ? ui('on-accent') : ui('ink'); g.font = `800 84px "${FONT}"`; g.fillText(`＋ ${title}`, w / 2, h * 0.38);
  g.fillStyle = ok ? ui('on-accent') : ui('ink-2'); g.font = `600 50px "${FONT}"`; g.fillText(sub, w / 2, h * 0.75);
};

/** 시설 레벨 표 — 2D 사무실의 '레벨' 단추와 같은 황동 알약, 표기는 서버와 같게 '레벨 2' */
const drawLevel = (lv) => (g, w, h) => {
  g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, (h - 8) / 2); g.fillStyle = ui('grow'); g.fill();
  g.fillStyle = ui('on-grow'); g.font = `800 56px "${FONT}"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`레벨 ${lv}`, w / 2, h / 2 + 3);
};
/** 공사 중 표지 — 성장(황동) 카드 */
const drawSite = (title, sub) => (g, w, h) => {
  card(g, w, h, { k: h / 60, bg: ui('grow-soft'), line: ui('grow-line') });
  g.fillStyle = ui('grow-text'); g.font = `800 84px "${FONT}"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(title, w / 2, h * 0.38);
  g.fillStyle = ui('ink-2'); g.font = `600 50px "${FONT}"`; g.fillText(sub, w / 2, h * 0.72);
};

/** 바닥의 점선 칸(빈 부지) */
function dashedRect(w, d, color = m3('mid-2')) {
  const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [-w / 2, -d / 2]].map(([x, z]) => new THREE.Vector3(x, 0.03, z));
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color, dashSize: 0.16, gapSize: 0.11 }));
  line.computeLineDistances();
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, depthWrite: false }));
  fill.rotation.x = -Math.PI / 2; fill.position.y = 0.02;
  const g = new THREE.Group(); g.add(line, fill); return g;
}

/** 공사장 — 줄무늬 가림막 · 기둥 · 원뿔 · 자재 더미 */
function constructionSite(kit, w, d) {
  const g = new THREE.Group();
  const stripe = tex(canvas(256, 64, (c, cw, ch) => { c.fillStyle = m3('brass'); c.fillRect(0, 0, cw, ch); c.fillStyle = m3('dark'); for (let x = -ch; x < cw + ch; x += 48) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 24, 0); c.lineTo(x + 24 - ch, ch); c.lineTo(x - ch, ch); c.fill(); } }), { repeat: [Math.max(1, Math.round(w / 1.2)), 1] });
  const band = matte('#ffffff', 0.8, { map: stripe });
  const side = (L, x, z, rot) => {
    const s = new THREE.Group(); s.position.set(x, 0, z); s.rotation.y = rot;
    s.add(P.box(kit, L, 1.1, 0.06, kit.m.white, 0, 0.75, 0, 0.01), P.box(kit, L, 0.22, 0.07, band, 0, 1.16, 0, 0.005));
    for (let i = 0; i <= Math.round(L / 1.6); i++) s.add(P.box(kit, 0.08, 1.35, 0.08, kit.m.metal, -L / 2 + (L * i) / Math.round(L / 1.6), 0.675, 0, 0));
    g.add(s);
  };
  side(w, 0, -d / 2, 0); side(w, 0, d / 2, 0); side(d, -w / 2, 0, Math.PI / 2); side(d, w / 2, 0, Math.PI / 2);
  const cone = matte(m3('brass'), 0.75); // 공사 = 성장 — 황동 하나로
  for (const [x, z] of [[-w / 2 - 0.45, d / 2 + 0.2], [-w / 2 - 0.45, d / 2 - 0.5], [w / 2 + 0.4, d / 2 + 0.3]]) { const c = P.cyl(kit, 0.02, 0.16, 0.42, cone, x, 0.21, z, 14); g.add(c, P.box(kit, 0.36, 0.03, 0.36, kit.m.black, x, 0.015, z, 0)); }
  for (let i = 0; i < 4; i++) g.add(P.box(kit, 1.4, 0.12, 0.3, kit.m.wood, -w / 4, 0.06 + i * 0.12, -d / 4 + (i % 2) * 0.05, 0.01));
  return g;
}

/**
 * 설계도 → 코어(office.js)가 쓰는 레이아웃.
 * opts.built 가 없으면(견본 미리보기) 전부 지어진 것으로 본다. opts.plots 는 서버가 계산한 빈 부지(조건·비용 포함),
 * opts.placements 는 배치 모드에서 옮긴 위치, opts.works 는 공사 중인 새 방(가림막), opts.facLevels 는 기능 시설 레벨.
 */
export function layoutFromSpec(raw, opts = {}) {
  const { spec, notes } = normalize(raw);
  const st = spec.style, recipes = spec.recipes, F = spec.facilities;
  const built = opts.built ?? null, placements = opts.placements ?? {}, plotList = opts.plots ?? [], works = (opts.works ?? []).filter((w) => w.status === 'designing');
  const isBuilt = (roomId) => !built || built.rooms.includes(roomId);
  const stationN = (roomId, i, count) => (built ? Math.min(count, built.stations[`${roomId}:${i}`] ?? 0) : count);

  // ── 방 크기(설계도 전체 기준 — 지은 정도와 상관없이 바닥이 같다) ──
  const rooms = spec.rooms.map((r, i) => {
    const rows = [];
    r.stations.forEach((z, gi) => { for (let k = 0; k < z.count; k++) {
      const w = stationWidth(z.station) + 0.25;
      let row = rows.at(-1);
      if (!row || row.w + w > 7.4) { row = { w: 0, items: [] }; rows.push(row); }
      row.items.push({ ...z, gi, k, w }); row.w += w;
    } });
    const facW = r.facilities.filter((f) => f !== 'decisions').length * 1.9;
    const hasDec = r.facilities.includes('decisions');
    const propW = r.props.reduce((a, p) => a + p.count * 1.9, 0) + (hasDec ? 2.8 : 0) + 2 * 1.2;
    const [mw, md] = SIZE_MIN[r.size];
    const w = Math.max(mw, facW + 1.2, ...rows.map((x) => x.w + 1.2), Math.min(propW + 1.2, 9.5));
    const propRows = Math.ceil(propW / Math.max(1, w - 1.2)) || 0;
    const d = Math.max(md, BACK + 0.9 + rows.length * ROW_D + propRows * 2.0 + 0.4);
    return { ...r, idx: i, rows, w, d };
  });

  // ── 바닥에 방 놓기: 뒤쪽 줄 · 복도 · 앞쪽 줄 · 입구(임시 자리) ──
  const main = rooms.filter((r) => !r.added), annex = rooms.filter((r) => r.added);
  const back = [], front = [];
  for (const r of [...main].sort((a, b) => b.w - a.w)) (back.reduce((a, x) => a + x.w, 0) <= front.reduce((a, x) => a + x.w, 0) ? back : front).push(r);
  back.sort((a, b) => a.idx - b.idx); front.sort((a, b) => a.idx - b.idx);
  const rowW = (list) => list.reduce((a, r) => a + r.w, 0);
  const W = Math.max(rowW(back), rowW(front), 8) + 0.6;
  const stretch = (list) => { const extra = (W - 0.6 - rowW(list)) / Math.max(1, list.length); for (const r of list) r.w += extra; };
  stretch(back); stretch(front);
  const bd = Math.max(...back.map((r) => r.d)), fd = front.length ? Math.max(...front.map((r) => r.d)) : 0;
  const D = bd + (front.length ? CORRIDOR + fd : 1.2) + ENTRY + 0.4;
  const X0 = -W / 2, Z0 = -D / 2, X1 = W / 2, Z1 = D / 2;
  const corrZ = Z0 + 0.2 + bd + CORRIDOR / 2;
  let x = X0 + 0.3;
  for (const r of back) { r.x0 = x; r.x1 = x + r.w; r.z0 = Z0 + 0.2; r.z1 = r.z0 + bd; r.row = 'back'; x += r.w; }
  x = X0 + 0.3;
  for (const r of front) { r.x0 = x; r.x1 = x + r.w; r.z0 = corrZ + CORRIDOR / 2; r.z1 = r.z0 + fd; r.row = 'front'; x += r.w; }
  const entryZ0 = Z1 - ENTRY - 0.2;
  // ── 별관 — 새 방은 오른쪽으로 붙여 짓는다. 있던 방 좌표는 그대로라 옮겨 둔 물건도 제자리다 ──
  const backTop = Z0 + 0.2, frontTop = corrZ + CORRIDOR / 2, frontRoom = Z1 - 0.2 - frontTop;
  const cursor = { back: X1 - 0.3, front: X1 - 0.3 };
  const slotFor = (w, d) => {
    const row = d <= bd + 1e-6 && (cursor.back <= cursor.front || d > frontRoom) ? 'back' : 'front';
    const x0 = cursor[row], z0 = row === 'back' ? backTop : frontTop;
    const depth = row === 'back' ? bd : Math.min(frontRoom, Math.max(d, fd || d));
    return { row, x0, x1: x0 + w, z0, z1: z0 + depth };
  };
  for (const r of annex) { const q = slotFor(r.w, r.d); Object.assign(r, q); cursor[q.row] = q.x1; }
  const XE = Math.max(cursor.back, cursor.front, X1 - 0.3) + 0.3, WE = XE - X0, CX = (X0 + XE) / 2;
  const nextLot = slotFor(5.4, Math.min(bd, 5.2)); // 다음 새 방 자리(요청 부지 · 공사장)
  for (const r of rooms) {
    r.doorX = r.x0 + 0.95; r.edgeZ = r.row === 'back' ? r.z1 : r.z0;
    r.door = { ax: r.doorX - 0.6, bx: r.doorX + 0.6, az: r.row === 'back' ? r.z1 - 1.0 : r.z0, bz: r.row === 'back' ? r.z1 : r.z0 + 1.0 };
    r.rowZs = r.rows.map((_, k) => r.z0 + BACK + 0.9 + 0.375 + k * ROW_D + 0.6);
  }

  // ── 팀(직무 자리 묶음) — 지은 방의 팀만. 임시 자리(입구)는 맨 뒤 ──
  const teams = [];
  for (const r of rooms) if (isBuilt(r.id)) for (const z of r.stations) if (!teams.some((t) => t.key === `${r.id}:${z.role}:${z.label}`)) teams.push({ key: `${r.id}:${z.role}:${z.label}`, name: z.label || r.name, floor: 0, role: z.role, room: r.id });
  teams.sort((a, b) => (a.role ? 0 : 1) - (b.role ? 0 : 1));
  const overflow = { key: 'overflow', name: '임시 자리', floor: 0, role: null, room: 'entry' };
  teams.push(overflow);
  const roleFloor = Object.fromEntries(ROLES.map((r) => [r, 0]));
  const labels = [spec.title, ...rooms.map((r) => `${r.name} 짓기`), ...teams.map((t) => t.name), ...FACILITIES.map((f) => F[f]?.label ?? ''), ...works.map((w) => w.need), '자리 추가 꾸미기 짓기 조건 레벨 임시 자리 자리가 모자라요 새 방 요청 공사 중 매니저가 설계하는 중'].join(' ');

  // ── 카메라 ──
  const span = Math.max(WE, D * 1.3);
  const dir = new THREE.Vector3(0.58, 0.74, 0.78).normalize();
  const right = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
  const target = [CX + right.x * WE * 0.13, 0.2, 0.3 + right.z * WE * 0.13];
  const dist = span * 1.28 + 3;
  const view = () => ({ pos: [target[0] + dir.x * dist, target[1] + dir.y * dist, target[2] + dir.z * dist], target });

  const lightColor = { warm: '#FFE2BC', cool: '#E4EEFF', neutral: '#FFEBD0' }[st.light] ?? '#FFEBD0';
  let bookAt = () => null, trophyAt = () => null, trophyMake = null;
  const movables = [];
  let nav = null, navDirty = true, floorGroup = null;
  const capacity = rooms.reduce((a, r) => a + (isBuilt(r.id) ? r.stations.reduce((b, z, i) => b + stationN(r.id, i, z.count), 0) : 0), 0);

  function rebuildNav() {
    nav = new NavGrid(X0, Z0, XE, Z1); navDirty = false;
    for (const r of rooms) {
      if (!isBuilt(r.id) || r.walls === 'open') continue;
      nav.segment(r.x0, r.edgeZ, r.doorX - 0.5, r.edgeZ); nav.segment(r.doorX + 0.5, r.edgeZ, r.x1, r.edgeZ);
      if (r.x1 < XE - 0.5) nav.segment(r.x1, r.z0, r.x1, r.z1);
      if (r.x0 > X0 + 0.5) nav.segment(r.x0, r.z0, r.x0, r.z1);
    }
    for (const m of movables) { const q = rectOf(m); nav.rect(q.ax - 0.12, q.az - 0.12, q.bx + 0.12, q.bz + 0.12); }
  }

  /** 움직일 수 있는 물건 등록 — 저장된 위치가 있으면 그 자리로 */
  function movable(id, obj, room, fp, label) {
    const m = { id, obj, room, fp, label, home: [obj.position.x, obj.position.z, obj.rotation.y] };
    const p = placements[id];
    if (p) { obj.position.x = p.x; obj.position.z = p.z; obj.rotation.y = p.rot ?? 0; }
    movables.push(m); return m;
  }
  const localFp = (obj) => { obj.updateMatrixWorld(true); const f = footprint(obj); return { w: f.w, d: f.d, cx: (f.cx ?? 0) - obj.position.x, cz: (f.cz ?? 0) - obj.position.z }; };

  return {
    key: 'gen', stage: spec.stage ?? 0, name: spec.title, place: spec.domain ? `${spec.domain} 공간` : '맞춤 공간', capacity,
    floors: [{ n: '1', name: spec.title, rooms: rooms.filter((r) => isBuilt(r.id)).map((r) => r.name).join(' · ') }], teams, roleFloor, defaultFloor: 0, elevator: null, building: null,
    lanes: null, view, light: { target: [CX, 1, 0], half: Math.max(WE + 7, D) * 0.72, dist: 30, color: lightColor },
    backdrop: { cx: CX, cy: 4, z: Z0 - 12, w: WE * 3.2, h: 22 }, fontSample: labels, notes, spec,
    exterior: { rect: { x0: X0, x1: XE, z0: Z0, z1: Z1 }, height: WH, grow: 18 }, // 도시 속 건물 바닥 · 높이(지붕 열기). grow: 오른쪽 별관 자리
    bookAt: (i) => bookAt(i), trophyAt: (i) => trophyAt(i), get trophyMake() { return trophyMake; },
    plan: { W: WE, D, X0, X1: XE, Z0, Z1, rooms: rooms.map((r) => ({ id: r.id, name: r.name, built: isBuilt(r.id), added: r.added, x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 })), nextLot },
    movables,
    /** 걷는 길 — 바닥 칸 A* (물건을 옮기면 다시 계산) */
    navPath(f, A, B) { if (navDirty || !nav) rebuildNav(); return nav.path(A.x, A.z, B.x, B.z); },
    /** 코어가 무대를 다 지은 뒤 부른다 — 배치 모드 연결 */
    attach(stage, { onPlace, onSelect, onEditStart, ring } = {}) { return attachEditor(stage, movables, { onPlace, onSelect, onEditStart, ring, onChange: () => { navDirty = true; } }); },

    build({ kit, root, casters, pickables, refs }) {
      const g = new THREE.Group(); root.add(g); floorGroup = g;
      const fm = floorMaterial(st);
      // 껍데기 — 바닥판 · 바닥 · 왼쪽 벽 · 뒤쪽 창벽 · 기둥
      const slab = P.box(kit, WE + 1.0, 0.32, D + 1.0, kit.m.slab, CX, -0.16, 0, 0); slab.castShadow = false; g.add(slab);
      const fl = new THREE.Mesh(new THREE.BoxGeometry(WE, 0.012, D), fm ?? kit.m.floor); fl.position.set(CX, 0.006, 0); fl.receiveShadow = true; g.add(fl);
      cutaway(g, [-1, 0], P.box(kit, 0.22, WH, D, kit.m.wall, X0 - 0.11, WH / 2, 0, 0)); // 바깥 벽은 카메라 쪽이면 낮아진다
      const winWall = cutaway(g, [0, -1]);
      if (st.windows !== false) {
        const gl = new THREE.Mesh(new THREE.PlaneGeometry(WE, WH), kit.m.glass); gl.position.set(CX, WH / 2, Z0 - 0.04); winWall.add(gl);
        for (let xx = X0; xx <= XE + 0.01; xx += WE / Math.max(4, Math.round(WE / 2.4))) winWall.add(P.box(kit, 0.07, WH, 0.12, kit.m.frame, xx, WH / 2, Z0 - 0.04, 0));
        for (const y of [0.05, 1.05, WH - 0.04]) winWall.add(P.box(kit, WE, 0.06, 0.12, kit.m.frame, CX, y, Z0 - 0.04, 0));
      } else winWall.add(P.box(kit, WE, WH, 0.18, kit.m.wall, CX, WH / 2, Z0 - 0.09, 0));
      for (const [cx, cz] of [[XE, Z0], [XE, Z1], [X0, Z1]]) g.add(P.box(kit, 0.32, WH, 0.32, kit.m.column, cx, WH / 2, cz, 0.01));
      const ceil = ceilingCaster(WE + 0.6, D + 0.6, WH + 0.12); ceil.position.x = CX; g.add(ceil); casters.push(ceil);

      const slots = [];
      const plotSign = (p, w, x, y, z) => {
        const lt = liveTex(1024, 300); lt.draw(drawPlot(p.title.replace(' 짓기', '').replace(' 자리 추가', ' 자리').replace(' 꾸미기', ' 꾸미기'), p.ready ? '지을 수 있어요' : p.reqs.find((q) => !q.met)?.label ?? '자원이 모자라요', p.ready));
        const sg = plane(lt.t, w, w * 0.29, { side: THREE.DoubleSide, transparent: true }); sg.position.set(x, y, z); return facing(sg);
      };
      const plotBox = (p, obj) => { obj.traverse((o) => { o.userData.plot = p.id; }); pickables.push(obj); return obj; };
      // 기능 시설 — 누르면 시설 카드(레벨 · 업그레이드 · 열기). Lv2 이상이면 머리 위에 레벨 표
      const facMark = (obj, key) => {
        const lv = opts.facLevels?.[key] ?? 1;
        if (lv >= 2) {
          const box = new THREE.Box3(); obj.updateMatrixWorld(true); // 간판(평면)은 빼고 몸체 높이만
          obj.traverse((o) => { if (o.isMesh && o.geometry.type !== 'PlaneGeometry') box.expandByObject(o, true); });
          const h = box.isEmpty() ? 1 : box.max.y;
          const lt = liveTex(256, 112); lt.draw(drawLevel(lv));
          const sp = uiSprite(lt.t, { transparent: true, depthWrite: false, alphaTest: 0.05 }); sp.scale.set(0.62, 0.27, 1); sp.position.set(0, Math.min(Math.max(0.9, h) + 0.3, 2.0), 0); sp.renderOrder = 5; obj.add(sp); casters.push(sp); // AO 패스에서는 빼야 그림자 판이 안 생긴다
        }
        obj.traverse((o) => { o.userData.fac = key; });
      };

      for (const r of rooms) {
        const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
        if (!isBuilt(r.id)) {
          // 빈 부지 — 점선 칸 + 짓기 표지
          const p = plotList.find((q) => q.id === `room:${r.id}`);
          const lot = dashedRect(r.x1 - r.x0 - 0.3, r.z1 - r.z0 - 0.3, p?.ready ? m3('dark') : m3('mid-2')); lot.position.set(cx, 0, cz); g.add(lot);
          if (p) { plotBox(p, lot); const sg = plotSign(p, 3.4, cx, 1.6, cz); plotBox(p, sg); g.add(sg); }
          continue;
        }
        // 방 바닥 색 · 벽 · 이름표
        const rug = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0 - 0.2, 0.014, r.z1 - r.z0 - 0.2), kit.m.zone); // 방 자리 — 한 단계 짙은 콘크리트 rug.position.set(cx, 0.015, cz); rug.receiveShadow = true; g.add(rug);
        if (r.walls !== 'open') {
          const segs = [[r.x0, r.edgeZ, r.doorX - 0.5, r.edgeZ], [r.doorX + 0.5, r.edgeZ, r.x1, r.edgeZ]];
          if (r.x1 < XE - 0.5) segs.push([r.x1, r.z0, r.x1, r.z1]);
          if (r.x0 > X0 + 0.5) segs.push([r.x0, r.z0, r.x0, r.z1]);
          // 막힌 벽 — 카메라 쪽(앞 · 오른쪽) 벽은 낮게 잘라 방 안이 보이게 한다
          if (r.walls === 'solid') for (const [a, b, c, d] of segs) { const L = Math.hypot(c - a, d - b), near = (b === d && Math.abs(b - r.z1) < 1e-6) || (a === c && Math.abs(a - r.x1) < 1e-6), h = near ? 1.05 : WH * 0.9; const w = P.box(kit, L, h, 0.1, kit.m.wall2, 0, h / 2, 0, 0); w.position.set((a + c) / 2, h / 2, (b + d) / 2); w.rotation.y = -Math.atan2(d - b, c - a); g.add(w); }
          else glassWalls(kit, g, segs);
        }
        const sub = r.stations.map((z) => z.label).filter(Boolean).join(' · ');
        const lt = liveTex(1024, 256); lt.draw(drawRoomSign(r.name, sub));
        const sg = plane(lt.t, 2.3, 0.58, { side: THREE.DoubleSide }); sg.position.set(r.x0 + 1.4, 2.95, r.z0 + 0.5); g.add(facing(sg)); // 시설 레벨 표(최고 2.0m)와 겹치지 않게 벽 높이쯤에

        // 뒤쪽 띠 — 기능 자리(보드·전력·지식·마일스톤)
        let fx = r.x0 + 0.95;
        for (const f of r.facilities) {
          if (f === 'decisions') continue;
          let obj;
          if (f === 'board') obj = boardForm(kit, F.board?.form, refs);
          if (f === 'power') obj = powerForm(kit, F.power?.form, F.power?.label, refs, recipes);
          if (f === 'knowledge') { const k = knowledgeForm(kit, F.knowledge?.form, F.knowledge?.label, refs); obj = k.group; bookAt = k.bookAt; }
          if (f === 'milestones') { const m = milestoneForm(kit, F.milestones?.form, refs); obj = m.group; trophyAt = m.trophyAt; trophyMake = m.trophyMake; }
          if (!obj) continue;
          obj.position.set(fx, 0, r.z0 + BACK * 0.55); g.add(obj); pickables.push(obj); fx += 1.95;
          movable(`fac:${f}`, obj, r, localFp(obj), F[f]?.label ?? f);
          facMark(obj, f);
        }
        // 작업 자리 줄 — 지은 자리만, 다음 자리는 점선 칸
        r.rows.forEach((row, k) => {
          let sx = cx - row.w / 2;
          for (const it of row.items) {
            const at = [sx + it.w / 2, r.rowZs[k]]; sx += it.w;
            const n = stationN(r.id, it.gi, it.count);
            if (it.k < n) {
              const team = teams.find((t) => t.key === `${r.id}:${it.role}:${it.label}`);
              const sg2 = new THREE.Group(); sg2.position.set(at[0], 0, at[1]); g.add(sg2);
              slots.push({ team, g: sg2, yaw: 0, floor: 0, emp: null, furnish: stationFurnisher(it.station, it.extras, recipes) });
              movable(`st:${r.id}:${it.gi}:${it.k}`, sg2, r, { w: stationWidth(it.station), d: 0.8, cx: 0, cz: 0 }, it.label || '작업 자리');
            } else if (it.k === n) {
              const p = plotList.find((q) => q.id === `station:${r.id}:${it.gi}`);
              if (!p) continue;
              const lot = dashedRect(stationWidth(it.station), 0.8, p.ready ? m3('dark') : m3('mid-2')); lot.position.set(at[0], 0, at[1]); g.add(plotBox(p, lot));
              g.add(plotBox(p, plotSign(p, 2.2, at[0], 1.25, at[1])));
            }
          }
        });
        // 앞쪽 — 소품 · 결재 자리 · 꾸미기
        const items = [];
        r.props.forEach((pp, pi) => { for (let k = 0; k < pp.count; k++) { const o = makeProp(kit, pp.name, recipes, k); if (o) items.push({ o, id: `pr:${r.id}:${pi}:${k}`, label: pp.name }); else notes.push(`모르는 소품: ${pp.name}`); } });
        if (r.facilities.includes('decisions')) { const dsk = decisionsForm(kit, F.decisions?.form, F.decisions?.label, refs); pickables.push(dsk); facMark(dsk, 'decisions'); items.push({ o: dsk, id: 'fac:decisions', label: F.decisions?.label ?? '결재 자리' }); }
        (built?.decor?.[r.id] ?? []).forEach((name, di) => { const o = makeProp(kit, name, recipes, di); if (o) items.push({ o, id: `dc:${r.id}:${di}`, label: name }); });
        const dp = plotList.find((q) => q.id === `decor:${r.id}`);
        if (dp) items.push({ plot: dp });
        let px = r.x0 + 0.7, pz = r.z0 + BACK + 0.9 + r.rows.length * ROW_D + 0.7;
        for (const it of items) {
          const fp = it.plot ? { w: 1.0, d: 1.0, cx: 0, cz: 0 } : footprint(it.o);
          if (px + fp.w > r.x1 - 0.4) { px = r.x0 + 0.7; pz += 2.0; }
          if (pz > r.z1 - 0.4) { if (!it.plot) notes.push(`${r.name}에 자리가 모자라 소품 하나를 뺐어요`); continue; }
          const ox = px + fp.w / 2 - (fp.cx ?? 0), oz = Math.min(pz + fp.d / 2, r.z1 - fp.d / 2 - 0.25) - (fp.cz ?? 0);
          if (it.plot) { const lot = dashedRect(1.0, 1.0, it.plot.ready ? m3('dark') : m3('mid-2')); lot.position.set(ox, 0, oz); g.add(plotBox(it.plot, lot)); g.add(plotBox(it.plot, plotSign(it.plot, 2.0, ox, 1.15, oz))); }
          else { it.o.position.set(ox, 0, oz); g.add(it.o); movable(it.id, it.o, r, localFp(it.o), it.label); }
          px += fp.w + 0.45;
        }
      }
      // 입구 — 간판 · 임시 자리(정원보다 많이 채용하면 여기 앉는다)
      refs.logo = liveTex(1024, 512);
      const logo = plane(refs.logo.t, 2.0, 1.0, { ui: false }); logo.position.set(X0 + 0.02, 1.9, entryZ0 + ENTRY / 2); logo.rotation.y = Math.PI / 2; g.add(logo);
      const pl = P.plant(kit, { h: 1.2, seed: 77 }); pl.position.set(X0 + 0.6, 0, Z1 - 0.5); g.add(pl);
      const entryRoom = { id: 'entry', x0: X0 + 0.3, x1: X1 - 0.3, z0: entryZ0, z1: Z1 - 0.2, door: null };
      for (let i = 0; i < 4; i++) {
        const sg2 = new THREE.Group(); sg2.position.set(X1 - 2.2 - i * 1.75, 0, entryZ0 + ENTRY * 0.55); g.add(sg2);
        slots.push({ team: overflow, g: sg2, yaw: 0, floor: 0, emp: null, furnish: stationFurnisher('desk', [], recipes) });
        movable(`st:entry:${i}`, sg2, entryRoom, { w: 1.5, d: 0.8, cx: 0, cz: 0 }, '임시 자리');
      }
      // 다음 새 방 자리 — 공사 중이면 가림막, 아니면 '새 방 요청' 부지
      const L = nextLot, lw = L.x1 - L.x0, ld = L.z1 - L.z0, lx = (L.x0 + L.x1) / 2, lz = (L.z0 + L.z1) / 2;
      const work = works[0], newPlot = plotList.find((q) => q.id === 'new:room');
      if (work || newPlot) {
        const out = Math.max(0, L.x1 + 0.3 - XE); // 건물 밖으로 나간 만큼 땅을 깐다
        if (out > 0) { const pad = P.box(kit, out + 0.5, 0.3, ld + 0.6, kit.m.slab, XE + out / 2 + 0.25, -0.15, lz, 0); pad.castShadow = false; g.add(pad); }
      }
      if (work) {
        const site = constructionSite(kit, lw - 0.3, ld - 0.3);
        site.position.set(lx, 0, lz); site.traverse((o) => { o.userData.plot = `work:${work.id}`; }); g.add(site); pickables.push(site);
        const lt = liveTex(1024, 300); lt.draw(drawSite(`공사 중 · ${work.need.slice(0, 14)}`, '매니저가 설계하는 중'));
        const sg = plane(lt.t, 3.6, 1.05, { side: THREE.DoubleSide, transparent: true }); sg.position.set(lx, 2.0, lz); sg.userData.plot = `work:${work.id}`; g.add(facing(sg)); pickables.push(sg);
      } else if (newPlot) {
        const lot = dashedRect(lw - 0.3, ld - 0.3, newPlot.ready ? m3('dark') : m3('mid-2')); lot.position.set(lx, 0, lz); g.add(plotBox(newPlot, lot));
        g.add(plotBox(newPlot, plotSign(newPlot, 3.4, lx, 1.6, lz)));
      }
      return { floors: [g], slots };
    },
  };
}
