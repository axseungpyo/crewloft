// 3단계 · 빌딩 여러 층 — 오피스 빌딩(20층) 중 12F·13F 두 층을 임대한다. 건물은 우리 것이 아니다.
// 12F 업무층(부서 섬) · 13F 경영·회의층(경영지원 · 대표실 · 회의실 · 서버룸 · 자료실 · 리셉션)
// 우리 층만 모델링하고 나머지 층은 흐린 유리·슬래브로만 그린다(건물 전체 보기에서만 보임).
import * as THREE from 'three';
import * as P from '../props.js';
import { FONT, liveTex, drawPlate, plane, lightChair, tag, glassWalls, teamSlots, ceilingCaster, facing, cutaway, uiSprite } from '../build.js';
import { m3 } from '../palette.js';

const FH = 4.0, WH = 3.0, X0 = -9, X1 = 9, Z0 = -6, Z1 = 6;
const TOWER = 20, OURS = 11; // 1층부터 20층까지, 우리 층 = 12F(인덱스 11)·13F
const BASE = OURS * FH;
const TEAMS = [
  { key: 'research', name: '리서치팀', floor: 0, cx: -3.0, cz: -3.0, role: 'researcher' },
  { key: 'content', name: '콘텐츠팀', floor: 0, cx: 2.8, cz: -3.0, role: 'writer' },
  { key: 'design', name: '디자인팀', floor: 0, cx: -3.0, cz: 1.8, role: 'designer' },
  { key: 'strategy', name: '경영지원', floor: 1, cx: -2.4, cz: -3.0, role: 'manager' },
  { key: 'marketing', name: '마케팅·퍼블리싱팀', floor: 0, cx: 2.8, cz: 1.8, role: null },
];
const FLOORS = [
  { n: '12F', name: '업무층', rooms: '리서치 · 콘텐츠 · 디자인 · 마케팅' },
  { n: '13F', name: '경영·회의층', rooms: '경영지원 · 대표실 · 회의실 · 서버룸 · 자료실' },
];

/** 글꼴이 늦게 오면 한 번 더 그린다(이 단계에만 쓰는 글자들) */
function plateTex(text, sub, tone = 'plain', w = 1024, h = 384) {
  const lt = liveTex(w, h), draw = () => lt.draw(drawPlate(text, sub, tone));
  draw();
  document.fonts?.load(`800 120px "${FONT}"`, `${text} ${sub ?? ''}`).then(draw, () => {});
  return lt;
}

/** 층 껍데기 — 슬래브 · 바닥 · 왼쪽 벽 · 뒤쪽 통유리 · 기둥 · 엘리베이터 코어 · 그림자 천장 */
function shell(kit, g, f, casters) {
  const slab = P.box(kit, X1 - X0 + 0.5, 0.34, Z1 - Z0 + 0.5, kit.m.slab, 0, -0.17, 0, 0); slab.castShadow = false; g.add(slab);
  const fl = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 0.012, Z1 - Z0), kit.m.floor); fl.position.y = 0.006; fl.receiveShadow = true; g.add(fl);
  cutaway(g, [-1, 0], P.box(kit, 0.22, WH, Z1 - Z0, kit.m.wall, X0 - 0.11, WH / 2, 0, 0)); // 바깥 벽은 카메라 쪽이면 낮아진다
  const winWall = cutaway(g, [0, -1]);
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, WH), kit.m.glass); gl.position.set(0, WH / 2, Z0 - 0.04); winWall.add(gl);
  for (let x = X0; x <= X1 + 0.01; x += 2.25) winWall.add(P.box(kit, 0.07, WH, 0.12, kit.m.frame, x, WH / 2, Z0 - 0.04, 0));
  for (const y of [0.05, 1.0, WH - 0.04]) winWall.add(P.box(kit, X1 - X0, 0.06, 0.12, kit.m.frame, 0, y, Z0 - 0.04, 0));
  for (const [x, z] of [[X1, Z0], [X1, Z1], [X0, Z1]]) g.add(P.box(kit, 0.34, WH, 0.34, kit.m.column, x, WH / 2, z, 0.01));
  // 엘리베이터 코어(두 층 같은 자리) — 빌딩 공용이라 회색 석재
  const core = new THREE.Group(); core.position.set(-7.8, 0, -4.7); g.add(core);
  core.add(P.box(kit, 2.4, WH, 2.6, kit.m.column, 0, WH / 2, 0, 0.02));
  for (const dx of [-0.55, 0.55]) core.add(P.box(kit, 0.9, 2.15, 0.04, kit.m.metal, dx, 1.075, 1.31, 0.01));
  const sign = plane(plateTex(FLOORS[f].n, FLOORS[f].name, 'accent').t, 1.1, 0.41); sign.position.set(0, 2.55, 1.32); core.add(sign);
  const ceil = ceilingCaster(X1 - X0 + 0.6, Z1 - Z0 + 0.6, WH + 0.12); g.add(ceil); casters.push(ceil);
}

function teamZone(kit, g, t, refs) {
  const rug = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.014, 3.7), kit.m.zone); rug.position.set(t.cx, 0.014, t.cz + 0.1); rug.receiveShadow = true; g.add(rug);
  const lt = liveTex(1024, 256); refs.teamSign[t.key] = lt;
  const sg = plane(lt.t, 2.4, 0.6, { side: THREE.DoubleSide }); sg.position.set(t.cx - 1.5, 2.55, t.cz + 0.4); g.add(facing(sg)); // 카메라를 보며 도는 표지라 매단 줄은 없앴다
  g.add(P.box(kit, 4.6, 0.3, 0.03, kit.m.frost, t.cx, 0.88, t.cz + 0.375, 0));
}

/** 빌딩 껍데기(우리 층 외 18개 층) — 건물 전체 보기에서만 보인다 */
function tower(kit) {
  const g = new THREE.Group();
  const concrete = kit.m.slab, frost = new THREE.MeshStandardMaterial({ color: m3('glass'), transparent: true, opacity: 0.45, roughness: 0.3, depthWrite: false });
  const band = new THREE.MeshStandardMaterial({ color: m3('glow'), emissive: m3('glow'), emissiveIntensity: 0.55, roughness: 0.6 }); // 우리 층 띠 — 색 대신 불빛
  const W = X1 - X0 + 0.5, D = Z1 - Z0 + 0.5;
  const solid = (m) => { m.castShadow = false; m.receiveShadow = false; return m; };
  for (let k = 0; k < TOWER; k++) {
    if (k === OURS || k === OURS + 1) continue;
    const y = k * FH;
    g.add(solid(P.box(kit, W, 0.34, D, concrete, 0, y - 0.17, 0, 0)));
    const glass = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, FH - 0.36, D - 0.2), k < 2 ? kit.m.metal : frost); glass.position.y = y + (FH - 0.36) / 2; g.add(solid(glass));
  }
  // 옥상 — 슬래브 · 난간 · 설비
  const top = TOWER * FH;
  g.add(solid(P.box(kit, W, 0.4, D, concrete, 0, top - 0.2, 0, 0)), solid(P.box(kit, W, 0.9, 0.2, concrete, 0, top + 0.45, -D / 2 + 0.1, 0)), solid(P.box(kit, 0.2, 0.9, D, concrete, -W / 2 + 0.1, top + 0.45, 0, 0)));
  g.add(solid(P.box(kit, 4.0, 2.2, 3.0, kit.m.box, -4.5, top + 1.1, -2.5, 0.05)), solid(P.box(kit, 2.6, 1.2, 2.0, kit.m.metal, 3.5, top + 0.6, -3.0, 0.05)));
  // 모서리 기둥 — 건물 높이 전체
  for (const [x, z] of [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]]) { const c = P.box(kit, 0.4, top, 0.4, kit.m.column, x, top / 2 - 0.34, z, 0); g.add(solid(c)); }
  // 1층 로비 캐노피
  g.add(solid(P.box(kit, 6, 0.2, 2.2, kit.m.chair2, 2, 3.3, Z1 + 1.1, 0.02)));
  // 우리 층 강조 띠 + 표지
  for (const y of [BASE - 0.19, BASE + 2 * FH - 0.19]) {
    g.add(solid(P.box(kit, W + 0.08, 0.1, 0.08, band, 0, y, D / 2 + 0.02, 0)), solid(P.box(kit, 0.08, 0.1, D + 0.08, band, W / 2 + 0.02, y, 0, 0)));
  }
  const mt = plateTex('우리 회사', '12F · 13F 임대 중');
  const marker = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.58), new THREE.MeshBasicMaterial({ map: mt.t, side: THREE.DoubleSide, toneMapped: false }));
  marker.position.set(X1 + 3.2, BASE + FH + 0.2, Z1 + 1.4); marker.rotation.y = 0.65; g.add(marker);
  return g;
}

export default {
  key: 's3', stage: 3, name: '빌딩 여러 층', place: '오피스 빌딩 2개 층 임대', capacity: 24,
  floors: FLOORS, teams: TEAMS, roleFloor: { manager: 1, researcher: 0, writer: 0, designer: 0 }, defaultFloor: 0, recordsFloor: 1, decisionFloor: 1,
  elevator: { x: -7.8, z: -3.0 },
  lanes: {
    0: { h: [[-5.1, -6.0, 5.8], [-0.25, -6.0, 5.8], [5.0, -6.0, 5.8]], v: [[-6.0, -5.1, 5.0], [-0.1, -5.1, 5.0], [5.8, -5.1, 5.0]] },
    1: { h: [[-5.1, -6.0, 3.4], [-0.25, -6.0, 3.4]], v: [[-6.0, -5.1, -0.25], [0.4, -5.1, -0.25], [3.4, -5.1, -0.25]] },
  },
  view: (f) => { const y = BASE + f * FH; return { pos: [14.0, y + 15.0, 19.6], target: [-1.2, y + 0.2, 0.7] }; },
  building: { pos: [36, BASE + 13, 46], target: [0, BASE + 2.5, 0] },
  light: { target: [0.5, BASE + 3, 0], half: 15, dist: 34 },
  backdrop: { cx: 2, cy: BASE + 2, z: -42, w: 150, h: 90 },
  exterior: { rect: { x0: X0, x1: X1, z0: Z0, z1: Z1 }, height: TOWER * FH, floorH: FH, own: true }, // 빌딩 껍데기는 이 레이아웃이 직접 짓는다(두 층이 다 보일 때)
  trophyScale: 2.0,

  build({ kit, root, casters, pickables, refs }) {
    const floors = [];
    for (let f = 0; f < 2; f++) { const g = new THREE.Group(); g.position.y = BASE + f * FH; root.add(g); floors.push(g); shell(kit, g, f, casters); }
    const [F12, F13] = floors;
    refs.teamSign = {};
    for (const t of TEAMS) teamZone(kit, floors[t.floor], t, refs);

    // 12F 업무층 — 탕비실 · 폰 부스 · 사물함 · 복합기
    F12.add(P.box(kit, 2.4, 0.95, 0.65, kit.m.white, 7.6, 0.475, -5.5, 0.02), P.box(kit, 2.5, 0.05, 0.7, kit.m.wood, 7.6, 0.97, -5.48, 0.01), P.box(kit, 0.7, 1.9, 0.65, kit.m.cabinet, 8.5, 0.95, -4.4, 0.02));
    F12.add(P.box(kit, 1.0, 0.05, 1.0, kit.m.wood, 7.4, 0.74, -2.8, 0.03), P.cyl(kit, 0.05, 0.05, 0.72, 'metal', 7.4, 0.36, -2.8, 8));
    for (const [x, z] of [[6.9, -3.5], [7.9, -2.2]]) { const c = lightChair(kit, kit.m.chair2); c.position.set(x, 0, z); c.rotation.y = x < 7.4 ? 1.2 : -2.4; F12.add(c); }
    for (const z of [1.2, 3.2]) F12.add(P.box(kit, 1.3, 2.2, 1.4, kit.m.partition, 8.0, 1.1, z, 0.02), P.box(kit, 0.55, 0.05, 0.38, kit.m.wood, 8.3, 0.75, z, 0));
    const pb = plane(plateTex('폰 부스', '통화 · 집중').t, 1.1, 0.41); pb.position.set(8.0, 2.45, 4.0); F12.add(facing(pb));
    for (let i = 0; i < 5; i++) F12.add(P.box(kit, 0.45, 1.8, 0.5, i % 2 ? kit.m.cabinet : kit.m.box, X0 + 0.36, 0.9, 0.4 + i * 0.47, 0.01));
    F12.add(P.box(kit, 0.75, 0.95, 0.6, kit.m.white, -7.8, 0.475, 4.6, 0.02));
    [[-8.4, 5.5, 1.3], [5.9, -5.6, 1.2], [5.9, 5.5, 1.1], [-0.1, -5.6, 1.0]].forEach(([x, z, h], i) => F12.add(P.at(P.plant(kit, { h, seed: i + 61 }), x, 0, z, i)));

    // 13F — 리셉션 · 로고 월(엘리베이터 앞)
    F13.add(P.box(kit, 0.7, 1.05, 2.4, kit.m.white, -6.9, 0.525, -1.0, 0.05), P.box(kit, 0.85, 0.05, 2.5, kit.m.wood, -6.92, 1.075, -1.0, 0.02));
    refs.logo = liveTex(1024, 512); const logo = plane(refs.logo.t, 2.6, 1.3, { ui: false }); logo.position.set(X0 + 0.02, 1.75, -1.0); logo.rotation.y = Math.PI / 2; F13.add(logo);
    // 기록(트로피) 진열장 — 왼쪽 벽
    const cab = new THREE.Group(); cab.position.set(X0 + 0.35, 0, 1.9); cab.rotation.y = Math.PI / 2; F13.add(cab);
    cab.add(P.box(kit, 1.7, 0.9, 0.5, kit.m.white, 0, 0.45, 0, 0.02));
    const ct = plane(plateTex('기록', '실제 기록만 놓여요').t, 1.2, 0.45); ct.position.set(0, 1.95, -0.2); cab.add(ct);
    refs.trophies = new THREE.Group(); cab.add(refs.trophies);
    tag(cab, 'company/library'); pickables.push(cab);
    // 대표실(앞 오른쪽 유리방) — 결재함 = 결정 대기
    glassWalls(kit, F13, [[4.0, 1.6, 5.9, 1.6], [7.1, 1.6, 9.0, 1.6], [4.0, 1.6, 4.0, Z1]]);
    F13.add(P.box(kit, 2.2, 0.06, 0.95, kit.m.woodDark, 6.6, 0.75, 4.2, 0.02), P.box(kit, 2.0, 0.7, 0.06, kit.m.woodDark, 6.6, 0.37, 4.63, 0.01));
    for (const s of [-1, 1]) F13.add(P.box(kit, 0.08, 0.72, 0.85, kit.m.woodDark, 6.6 + s * 1.0, 0.36, 4.2, 0.01));
    const boss = lightChair(kit, kit.m.black); boss.position.set(6.6, 0, 3.35); boss.scale.setScalar(1.12); F13.add(boss);
    const np = plane(plateTex('대표', '대표님 자리').t, 0.5, 0.19); np.position.set(6.6, 0.86, 4.7); np.rotation.x = -0.35; F13.add(np);
    const tray = new THREE.Group(); tray.position.set(5.95, 0.78, 4.3); F13.add(tray);
    tray.add(P.box(kit, 0.42, 0.06, 0.32, kit.m.decide, 0, 0.03, 0, 0.01)); // 결재함 — 인주색 한 점
    refs.papers = new THREE.Group(); tray.add(refs.papers);
    refs.badge = liveTex(128, 128); const badge = uiSprite(refs.badge.t); badge.scale.setScalar(0.36); badge.position.set(0.1, 0.4, 0); tray.add(badge);
    refs.ceoName = '대표실'; refs.ceoSign = liveTex(1024, 384); const ds = plane(refs.ceoSign.t, 1.4, 0.52); ds.position.set(5.0, 2.35, 1.63); F13.add(ds);
    tag(tray, 'decisions'); tag(ds, 'decisions'); pickables.push(tray, ds);
    const sofa = P.sofa(kit, { w: 1.7 }); sofa.position.set(8.5, 0, 4.0); sofa.rotation.y = -Math.PI / 2; F13.add(sofa);
    // 회의실(뒤 오른쪽 유리방) — 회차 보드
    glassWalls(kit, F13, [[4.0, Z0, 4.0, -1.6], [4.0, -1.6, 5.9, -1.6], [7.1, -1.6, 9.0, -1.6]]);
    F13.add(P.box(kit, 2.8, 0.05, 1.1, kit.m.tableTop, 6.6, 0.74, -3.9, 0.03));
    for (const s of [-1, 1]) F13.add(P.box(kit, 0.1, 0.72, 0.7, kit.m.metal, 6.6 + s * 1.0, 0.36, -3.9, 0.01));
    for (let i = 0; i < 6; i++) { const c = lightChair(kit, kit.m.chair2); c.position.set(5.7 + (i % 3) * 0.9, 0, i < 3 ? -4.85 : -2.95); c.rotation.y = i < 3 ? 0 : Math.PI; F13.add(c); }
    refs.board = liveTex(1024, 560);
    const wb = new THREE.Group(); wb.add(P.box(kit, 2.1, 1.18, 0.05, kit.m.frame, 0, 0, 0, 0.01));
    const wbs = plane(refs.board.t, 2.02, 1.1, { roughness: 0.45 }); wbs.position.z = 0.03; wb.add(wbs);
    for (const s of [-1, 1]) wb.add(P.cyl(kit, 0.02, 0.02, 1.0, 'metal', s * 0.9, -1.05, -0.05, 8));
    wb.position.set(4.3, 1.55, -3.9); wb.rotation.y = Math.PI / 2; F13.add(wb); tag(wb, 'work/week'); pickables.push(wb);
    const ms = plane(plateTex('회의실', '이번 주 회차 보드').t, 1.4, 0.52); ms.position.set(6.5, 2.35, -1.57); F13.add(ms);
    // 서버룸(앞 왼쪽 유리방) — AI 연결
    glassWalls(kit, F13, [[-4.6, 3.0, -4.6, Z1], [X0, 3.0, -6.4, 3.0], [-5.4, 3.0, -4.6, 3.0]]);
    refs.led = new THREE.MeshStandardMaterial({ color: m3('off'), roughness: 0.6 });
    const server = new THREE.Group(); F13.add(server);
    for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) {
      const rk = new THREE.Group(); rk.position.set(-8.2 + k * 1.15, 0, 3.8 + r * 1.5); server.add(rk);
      rk.add(P.box(kit, 0.85, 1.7, 0.8, kit.m.chair2, 0, 0.85, 0, 0.01));
      for (let i = 0; i < 6; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.01), refs.led); l.position.set(0.22, 0.3 + i * 0.2, 0.405); rk.add(l); }
    }
    refs.serverName = '서버룸'; refs.serverSign = liveTex(1024, 384); const ss = plane(refs.serverSign.t, 1.4, 0.52); ss.position.set(-6.8, 2.35, 3.02); server.add(ss);
    tag(server, 'settings/power'); pickables.push(server);
    // 자료실(앞 가운데) — 회사 지식 책장 3개, 앞(+z)을 본다
    const lib = new THREE.Group(); lib.position.set(-0.4, 0, 4.5); F13.add(lib);
    for (let k = 0; k < 3; k++) {
      const sh = new THREE.Group(); sh.position.x = (k - 1) * 1.65; lib.add(sh);
      sh.add(P.box(kit, 1.55, 1.75, 0.03, kit.m.shelf, 0, 0.875, -0.17, 0), P.box(kit, 0.04, 1.75, 0.36, kit.m.shelf, -0.76, 0.875, 0, 0), P.box(kit, 0.04, 1.75, 0.36, kit.m.shelf, 0.76, 0.875, 0, 0));
      for (let r = 0; r < 4; r++) sh.add(P.box(kit, 1.5, 0.03, 0.34, kit.m.shelf, 0, 0.1 + r * 0.55, 0, 0));
    }
    refs.books = new THREE.Group(); lib.add(refs.books);
    refs.libName = '자료실'; refs.libSign = liveTex(1024, 384); const ls = plane(refs.libSign.t, 1.5, 0.56); ls.position.set(0, 2.25, -0.05); lib.add(ls);
    tag(lib, 'company/library'); pickables.push(lib);
    [[-0.1, -5.6, 1.2], [3.2, 5.6, 1.0], [-3.6, 5.6, 1.1]].forEach(([x, z, h], i) => F13.add(P.at(P.plant(kit, { h, seed: i + 71 }), x, 0, z, i)));

    // 빌딩 껍데기 — 두 층이 모두 보일 때(건물 전체 보기)만 보인다
    const shellG = tower(kit); root.add(shellG); shellG.visible = false;
    const sentinel = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    sentinel.frustumCulled = false; sentinel.onBeforeRender = () => { shellG.visible = floors.every((f) => f.visible); };
    root.add(sentinel);

    const slots = TEAMS.flatMap((t) => teamSlots(t, floors[t.floor]).map((s) => ({ ...s, floor: t.floor })));
    return { floors, slots };
  },
  /** 회사 지식 책 i번째 자리(자료실 책장 3개 × 3칸 × 9권 = 81) */
  bookAt: (i) => { if (i >= 81) return null; const sh = Math.floor(i / 27), row = Math.floor((i % 27) / 9), j = i % 9; return [(sh - 1) * 1.65 - 0.56 + j * 0.14, 0.31 + row * 0.55, 0.02]; },
  trophyAt: (i) => (i < 4 ? [-0.6 + i * 0.4, 0.91, 0] : null),
};
