// 4단계 · 사옥 — 1F 로비 · 2F 부서별 업무층 · 3F 경영층 (결정 65)
import * as THREE from 'three';
import * as P from '../props.js';
import { liveTex, drawPlate, plane, lightChair, tag, glassWalls, teamSlots, ceilingCaster, facing, cutaway, uiSprite } from '../build.js';
import { m3 } from '../palette.js';

const FH = 4.2, WH = 3.2, X0 = -10, X1 = 10, Z0 = -6.5, Z1 = 6.5;
const TEAMS = [
  { key: 'research', name: '리서치팀', floor: 1, cx: -3.4, cz: -3.4, role: 'researcher' },
  { key: 'content', name: '콘텐츠팀', floor: 1, cx: 2.6, cz: -3.4, role: 'writer' },
  { key: 'design', name: '디자인팀', floor: 1, cx: -3.4, cz: 1.9, role: 'designer' },
  { key: 'marketing', name: '마케팅·퍼블리싱팀', floor: 1, cx: 2.6, cz: 1.9, role: 'marketer' },
  { key: 'strategy', name: '경영기획실', floor: 2, cx: -3.4, cz: -3.4, role: 'manager' },
];
const FLOORS = [
  { n: '1F', name: '로비', rooms: '리셉션 · 라이브러리 · 기록 갤러리' },
  { n: '2F', name: '업무층', rooms: '리서치팀 · 콘텐츠팀 · 디자인팀 · 마케팅팀' },
  { n: '3F', name: '경영층', rooms: '경영기획실 · 대표실 · 대회의실 · 서버실' },
];

export default {
  key: 'hq', stage: 4, name: '사옥', place: '자체 건물(3개 층)', capacity: 32,
  floors: FLOORS, teams: TEAMS, roleFloor: { manager: 2, researcher: 1, writer: 1, designer: 1, marketer: 1 }, defaultFloor: 1,
  elevator: { x: -8.6, z: -3.2 },
  lanes: {
    1: { h: [[-5.4, -6.3, 5.6], [-0.4, -6.3, 5.6], [5.6, -6.3, 5.6]], v: [[-6.3, -5.4, 5.6], [-0.4, -5.4, 5.6], [5.6, -5.4, 5.6]] },
    2: { h: [[-5.4, -6.3, 2.8], [-0.4, -6.3, 2.8]], v: [[-6.3, -5.4, -0.4], [-0.4, -5.4, -0.4], [2.8, -5.4, -0.4]] },
  },
  view: (f) => { const y = f * FH; return { pos: [15.6, y + 16.6, 21.8], target: [-1.4, y + 0.2, 0.8] }; },
  building: { pos: [31, 15, 36], target: [0.5, 5.6, 0] },
  light: { target: [1, 4, 0], half: 17, dist: 34 },
  backdrop: { cx: 2, cy: 6, z: -26, w: 70, h: 26 },
  exterior: { rect: { x0: X0, x1: X1, z0: Z0, z1: Z1 }, height: 2 * FH + WH, floorH: FH }, // 도시 속 건물 바닥 · 높이(지붕 열기)

  /** ctx: { kit, root, casters, pickables, refs } → floors[] */
  build({ kit, root, casters, pickables, refs }) {
    const floors = [];
    // 층 껍데기
    for (let f = 0; f < 3; f++) {
      const g = new THREE.Group(); g.position.y = f * FH; root.add(g); floors.push(g);
      const slab = P.box(kit, X1 - X0 + 0.5, 0.32, Z1 - Z0 + 0.5, kit.m.slab, 0, -0.16, 0, 0); slab.castShadow = false; g.add(slab);
      const fl = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 0.012, Z1 - Z0), f === 0 ? kit.m.zone : kit.m.floor); fl.position.y = 0.006; fl.receiveShadow = true; g.add(fl);
      cutaway(g, [-1, 0], P.box(kit, 0.22, WH, Z1 - Z0, kit.m.wall, X0 - 0.11, WH / 2, 0, 0)); // 바깥 벽은 카메라 쪽이면 낮아진다
      const winWall = cutaway(g, [0, -1]);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, WH), kit.m.glass); gl.position.set(0, WH / 2, Z0 - 0.04); winWall.add(gl);
      for (let x = X0; x <= X1 + 0.01; x += 2.5) winWall.add(P.box(kit, 0.07, WH, 0.12, kit.m.frame, x, WH / 2, Z0 - 0.04, 0));
      for (const y of [0.05, 1.05, WH - 0.04]) winWall.add(P.box(kit, X1 - X0, 0.06, 0.12, kit.m.frame, 0, y, Z0 - 0.04, 0));
      for (const [x, z] of [[X1, Z0], [X1, Z1], [X0, Z1]]) g.add(P.box(kit, 0.36, WH, 0.36, kit.m.column, x, WH / 2, z, 0.01));
      const core = new THREE.Group(); core.position.set(-8.6, 0, -5.05); g.add(core);
      core.add(P.box(kit, 2.8, WH, 2.9, kit.m.wall2, 0, WH / 2, 0, 0.02));
      for (const dx of [-0.65, 0.65]) core.add(P.box(kit, 1.0, 2.2, 0.04, kit.m.metal, dx, 1.1, 1.46, 0.01));
      const lt = liveTex(1024, 384); lt.draw(drawPlate(FLOORS[f].n, FLOORS[f].name, 'accent'));
      const sign = plane(lt.t, 1.2, 0.45); sign.position.set(0, 2.6, 1.47); core.add(sign);
      const ceil = ceilingCaster(X1 - X0 + 0.6, Z1 - Z0 + 0.6, WH + 0.12); g.add(ceil); casters.push(ceil);
    }
    const [F1, F2, F3] = floors;

    // 1F 로비
    F1.add(P.box(kit, 3.4, 1.05, 0.8, kit.m.white, -1.0, 0.525, 0.6, 0.06), P.box(kit, 3.6, 0.05, 0.95, kit.m.wood, -1.0, 1.075, 0.58, 0.02));
    F1.add(P.box(kit, 6.0, 3.0, 0.25, kit.m.wall2, -1.0, 1.5, -1.3, 0.02));
    refs.logo = liveTex(1024, 512); const logo = plane(refs.logo.t, 3.6, 1.8, { ui: false }); logo.position.set(-1.0, 1.75, -1.17); F1.add(logo);
    for (let i = 0; i < 5; i++) F1.add(P.box(kit, 0.18, 1.0, 1.2, kit.m.metal, -3.4 + i * 1.2, 0.5, 3.0, 0.03));
    const so1 = P.sofa(kit, { w: 2.2 }); so1.position.set(6.6, 0, 4.9); so1.rotation.y = Math.PI; F1.add(so1);
    const so2 = P.sofa(kit, { w: 2.2 }); so2.position.set(8.9, 0, 2.6); so2.rotation.y = -Math.PI / 2; F1.add(so2);
    F1.add(P.box(kit, 1.2, 0.38, 0.7, kit.m.wood, 6.8, 0.19, 2.9, 0.03));
    F1.add(P.box(kit, 3.6, 1.05, 0.7, kit.m.black, 1.6, 0.525, -5.5, 0.03), P.box(kit, 3.8, 0.05, 0.85, kit.m.wood, 1.6, 1.075, -5.45, 0.02));
    for (let i = 0; i < 4; i++) F1.add(P.cyl(kit, 0.2, 0.2, 0.06, kit.m.wood, 0.3 + i * 0.85, 0.75, -4.75, 18), P.cyl(kit, 0.03, 0.03, 0.72, 'metal', 0.3 + i * 0.85, 0.36, -4.75, 8));
    // 라이브러리(회사 지식)
    const lib = new THREE.Group(); lib.position.set(7.5, 0, -5.9); F1.add(lib);
    for (let k = 0; k < 3; k++) {
      const sh = new THREE.Group(); sh.position.x = (k - 1) * 1.65; lib.add(sh);
      sh.add(P.box(kit, 1.55, 2.2, 0.03, kit.m.shelf, 0, 1.1, -0.17, 0), P.box(kit, 0.04, 2.2, 0.36, kit.m.shelf, -0.76, 1.1, 0, 0), P.box(kit, 0.04, 2.2, 0.36, kit.m.shelf, 0.76, 1.1, 0, 0));
      for (let r = 0; r < 4; r++) sh.add(P.box(kit, 1.5, 0.03, 0.34, kit.m.shelf, 0, 0.1 + r * 0.55, 0, 0));
    }
    refs.books = new THREE.Group(); lib.add(refs.books);
    refs.libSign = liveTex(1024, 384); const ls = plane(refs.libSign.t, 1.6, 0.6); ls.position.set(0, 2.55, -0.05); lib.add(ls);
    tag(lib, 'company/library'); pickables.push(lib);
    F1.add(P.box(kit, 2.0, 0.05, 0.9, kit.m.wood, 7.5, 0.74, -3.6, 0.02), P.box(kit, 0.1, 0.72, 0.6, kit.m.metal, 6.7, 0.36, -3.6, 0.01), P.box(kit, 0.1, 0.72, 0.6, kit.m.metal, 8.3, 0.36, -3.6, 0.01));
    // 기록 갤러리(마일스톤)
    const gal = new THREE.Group(); gal.position.set(X0 + 0.5, 0, 1.6); gal.rotation.y = Math.PI / 2; F1.add(gal);
    const gt = liveTex(1024, 384); gt.draw(drawPlate('기록 갤러리', '실제 기록이 생길 때만 채워져요')); const gs = plane(gt.t, 2.4, 0.9); gs.position.set(0, 2.4, -0.38); gal.add(gs);
    refs.trophies = new THREE.Group(); gal.add(refs.trophies);
    for (let i = 0; i < 4; i++) gal.add(P.box(kit, 0.7, 1.0, 0.5, kit.m.white, -2.1 + i * 1.4, 0.5, 0, 0.02));
    tag(gal, 'company/library'); pickables.push(gal);
    [[-6.2, 5.6, 1.5], [9.3, -1.2, 1.3], [-6.2, -2.4, 1.2], [4.0, 5.8, 1.1]].forEach(([x, z, h], i) => F1.add(P.at(P.plant(kit, { h, seed: i + 21 }), x, 0, z, i)));

    // 2F 업무층 — 부서 구역 · 표지 · 칸막이
    refs.teamSign = {};
    for (const t of TEAMS) {
      const g = floors[t.floor];
      const rug = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.014, 3.9), kit.m.zone); rug.position.set(t.cx, 0.014, t.cz + 0.1); rug.receiveShadow = true; g.add(rug);
      const lt = liveTex(1024, 256); refs.teamSign[t.key] = lt;
      const sg = plane(lt.t, 2.6, 0.65, { side: THREE.DoubleSide }); sg.position.set(t.cx - 1.6, 2.75, t.cz + 0.4); g.add(facing(sg));
      g.add(P.box(kit, 4.6, 0.3, 0.03, kit.m.frost, t.cx, 0.88, t.cz + 0.375, 0));
    }
    F2.add(P.box(kit, 2.6, 0.95, 0.65, kit.m.white, 8.2, 0.475, -5.9, 0.02), P.box(kit, 2.7, 0.05, 0.7, kit.m.wood, 8.2, 0.97, -5.88, 0.01), P.box(kit, 0.7, 1.9, 0.65, kit.m.cabinet, 9.4, 0.95, -5.9, 0.02));
    F2.add(P.box(kit, 1.1, 0.05, 1.1, kit.m.wood, 8.0, 0.74, -3.6, 0.03), P.cyl(kit, 0.05, 0.05, 0.72, 'metal', 8.0, 0.36, -3.6, 8));
    for (const z of [2.0, 4.0]) F2.add(P.box(kit, 1.4, 2.3, 1.5, kit.m.partition, 8.9, 1.15, z, 0.02), P.box(kit, 0.6, 0.05, 0.4, kit.m.wood, 9.2, 0.75, z, 0));
    for (let i = 0; i < 6; i++) F2.add(P.box(kit, 0.45, 1.8, 0.5, i % 2 ? kit.m.cabinet : kit.m.box, X0 + 0.37, 0.9, 0.6 + i * 0.47, 0.01));
    F2.add(P.box(kit, 0.75, 0.95, 0.6, kit.m.white, -8.6, 0.475, 4.7, 0.02));
    [[-9.2, 5.9, 1.4], [6.4, -6.0, 1.3], [6.2, 5.9, 1.2], [-0.4, -6.0, 1.1]].forEach(([x, z, h], i) => F2.add(P.at(P.plant(kit, { h, seed: i + 31 }), x, 0, z, i)));

    // 3F 경영층 — 대표실(결재함) · 대회의실(회차 보드) · 서버실(AI)
    glassWalls(kit, F3, [[4.0, 2.0, 6.8, 2.0], [8.1, 2.0, 10.0, 2.0], [4.0, 2.0, 4.0, Z1]]);
    F3.add(P.box(kit, 2.4, 0.06, 1.0, kit.m.woodDark, 7.2, 0.75, 4.4, 0.02), P.box(kit, 2.2, 0.7, 0.06, kit.m.woodDark, 7.2, 0.37, 4.85, 0.01));
    for (const s of [-1, 1]) F3.add(P.box(kit, 0.08, 0.72, 0.9, kit.m.woodDark, 7.2 + s * 1.1, 0.36, 4.4, 0.01));
    const boss = lightChair(kit, kit.m.black); boss.position.set(7.2, 0, 3.55); boss.scale.setScalar(1.15); F3.add(boss);
    const npT = liveTex(1024, 384); npT.draw(drawPlate('대표', '대표님 자리')); const np = plane(npT.t, 0.5, 0.19); np.position.set(7.2, 0.86, 4.92); np.rotation.x = -0.35; F3.add(np);
    const tray = new THREE.Group(); tray.position.set(6.5, 0.78, 4.5); F3.add(tray);
    tray.add(P.box(kit, 0.42, 0.06, 0.32, kit.m.decide, 0, 0.03, 0, 0.01)); // 결재함 — 인주색 한 점
    refs.papers = new THREE.Group(); tray.add(refs.papers);
    refs.badge = liveTex(128, 128); const badge = uiSprite(refs.badge.t); badge.scale.setScalar(0.38); badge.position.set(0.1, 0.42, 0); tray.add(badge);
    refs.ceoSign = liveTex(1024, 384); const ds = plane(refs.ceoSign.t, 1.5, 0.56); ds.position.set(5.4, 2.4, 2.03); F3.add(ds);
    tag(tray, 'decisions'); tag(ds, 'decisions'); pickables.push(tray, ds);
    const sofa = P.sofa(kit, { w: 1.9 }); sofa.position.set(9.3, 0, 4.4); sofa.rotation.y = -Math.PI / 2; F3.add(sofa);
    glassWalls(kit, F3, [[-4.2, 1.2, -4.2, Z1], [X0, 1.2, -6.0, 1.2]]);
    F3.add(P.box(kit, 3.6, 0.05, 1.3, kit.m.tableTop, -7.1, 0.74, 3.9, 0.03));
    for (const s of [-1, 1]) F3.add(P.box(kit, 0.1, 0.72, 0.8, kit.m.metal, -7.1 + s * 1.3, 0.36, 3.9, 0.01));
    for (let i = 0; i < 8; i++) { const c = lightChair(kit, kit.m.chair2); c.position.set(-8.4 + (i % 4) * 0.86, 0, i < 4 ? 2.95 : 4.85); c.rotation.y = i < 4 ? 0 : Math.PI; F3.add(c); }
    refs.board = liveTex(1024, 560);
    const wb = new THREE.Group(); wb.add(P.box(kit, 2.5, 1.4, 0.05, kit.m.frame, 0, 0, 0, 0.01));
    const wbs = plane(refs.board.t, 2.42, 1.32, { roughness: 0.45 }); wbs.position.z = 0.03; wb.add(wbs);
    wb.position.set(X0 + 0.03, 1.6, 3.9); wb.rotation.y = Math.PI / 2; F3.add(wb); tag(wb, 'work/week'); pickables.push(wb);
    const mT = liveTex(1024, 384); mT.draw(drawPlate('대회의실', '이번 주 회차 보드')); const ms = plane(mT.t, 1.5, 0.56); ms.position.set(-7.1, 2.4, 1.22); F3.add(ms);
    glassWalls(kit, F3, [[4.0, -1.6, 6.8, -1.6], [8.1, -1.6, 10.0, -1.6], [4.0, Z0, 4.0, -1.6]]);
    refs.led = new THREE.MeshStandardMaterial({ color: m3('off'), roughness: 0.6 });
    const server = new THREE.Group(); F3.add(server);
    for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) {
      const rk = new THREE.Group(); rk.position.set(5.2 + k * 1.2, 0, -5.5 + r * 2.0); server.add(rk);
      rk.add(P.box(kit, 0.9, 1.8, 0.9, kit.m.chair2, 0, 0.9, 0, 0.01));
      for (let i = 0; i < 7; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.01), refs.led); l.position.set(0.25, 0.3 + i * 0.2, 0.455); rk.add(l); }
    }
    refs.serverSign = liveTex(1024, 384); const ss = plane(refs.serverSign.t, 1.5, 0.56); ss.position.set(5.4, 2.4, -1.57); server.add(ss);
    tag(server, 'settings/power'); pickables.push(server);
    [[-0.6, -5.9, 1.3], [2.5, 5.9, 1.2], [-3.2, 5.9, 1.1]].forEach(([x, z, h], i) => F3.add(P.at(P.plant(kit, { h, seed: i + 41 }), x, 0, z, i)));
    const slots = TEAMS.flatMap((t) => teamSlots(t, floors[t.floor]).map((s) => ({ ...s, floor: t.floor })));
    return { floors, slots };
  },
  /** 회사 지식 책 i번째 자리(라이브러리 책장 3개 × 4칸 × 10권) */
  bookAt: (i) => { if (i >= 120) return null; const sh = Math.floor(i / 40) % 3, row = Math.floor((i % 40) / 10), j = i % 10; return [(sh - 1) * 1.65 - 0.62 + j * 0.135, 0.31 + row * 0.55, 0.02]; },
  trophyAt: (i) => (i < 4 ? [-2.1 + i * 1.4, 1.0, 0] : null),
};
