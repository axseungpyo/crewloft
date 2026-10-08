// 2단계 · 한 층 사무실 — 빌딩 한 층 전체를 쓴다. 부서 구역(리서치·콘텐츠·디자인·마케팅) + 경영지원 자리,
// 유리 회의실(회차 보드) · 모서리 대표실(결재함) · 서버 클로젯(AI 연결) · 자료실 책장(회사 지식) · 리셉션 로고 월과 트로피(마일스톤)
import * as THREE from 'three';
import * as P from '../props.js';
import { liveTex, drawPlate, plane, lightChair, tag, glassWalls, teamSlots, ceilingCaster, facing, cutaway, uiSprite } from '../build.js';
import { m3 } from '../palette.js';

const WH = 3.2, X0 = -8, X1 = 8, Z0 = -5.5, Z1 = 5.5;
const TEAMS = [
  { key: 'research', name: '리서치팀', floor: 0, cx: -2.4, cz: -1.7, role: 'researcher' },
  { key: 'content', name: '콘텐츠팀', floor: 0, cx: 2.8, cz: -1.7, role: 'writer' },
  { key: 'design', name: '디자인팀', floor: 0, cx: -2.4, cz: 2.4, role: 'designer' },
  { key: 'strategy', name: '경영지원', floor: 0, cx: 6.65, cz: 0.2, role: 'manager', small: true },
  { key: 'marketing', name: '마케팅·퍼블리싱팀', floor: 0, cx: 2.8, cz: 2.4, role: null },
];
const FLOORS = [{ n: '7F', name: '우리 층', rooms: '부서 구역 · 회의실 · 대표실 · 서버 클로젯' }];

export default {
  key: 's2', stage: 2, name: '한 층 사무실', place: '빌딩 한 층 전체', capacity: 12,
  floors: FLOORS, teams: TEAMS, roleFloor: { manager: 0, researcher: 0, writer: 0, designer: 0 }, defaultFloor: 0,
  elevator: null, building: null,
  // 통로 — 뒤 섬 앞줄 뒤(z -3.5), 가운데 통로(z 0.75), 앞 섬 뒷줄 뒤(z 5.0), 경영지원 뒤(z -1.9)
  lanes: {
    0: {
      h: [[-3.5, -4.0, 5.2], [0.75, -5.0, 5.2], [5.0, -5.0, 4.6], [-1.9, 5.2, 7.8]],
      v: [[0.2, -3.5, 5.0], [-5.0, 0.75, 5.0], [5.2, -3.5, 0.75]],
    },
  },
  view: () => ({ pos: [17.1, 16.4, 19.6], target: [1.8, -0.4, -1.4] }),
  light: { target: [0, 1.5, 0], half: 13, dist: 30 },
  backdrop: { cx: 0, cy: 4, z: -22, w: 60, h: 22 },
  exterior: { rect: { x0: X0, x1: X1, z0: Z0, z1: Z1 }, height: WH }, // 도시 속 건물 바닥 · 높이(지붕 열기)

  build({ kit, root, casters, pickables, refs }) {
    const F = new THREE.Group(); root.add(F);
    // 껍데기 — 슬래브 · 카펫 · 왼쪽 벽 · 뒤쪽 통유리 · 기둥 · 그림자 전용 천장
    const slab = P.box(kit, X1 - X0 + 0.5, 0.32, Z1 - Z0 + 0.5, kit.m.slab, 0, -0.16, 0, 0); slab.castShadow = false; F.add(slab);
    const fl = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 0.012, Z1 - Z0), kit.m.floor); fl.position.y = 0.006; fl.receiveShadow = true; F.add(fl);
    cutaway(F, [-1, 0], P.box(kit, 0.22, WH, Z1 - Z0, kit.m.wall, X0 - 0.11, WH / 2, 0, 0)); // 바깥 벽은 카메라 쪽이면 낮아진다
    const winWall = cutaway(F, [0, -1]);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, WH), kit.m.glass); gl.position.set(0, WH / 2, Z0 - 0.04); winWall.add(gl);
    for (let x = X0; x <= X1 + 0.01; x += 2) winWall.add(P.box(kit, 0.07, WH, 0.12, kit.m.frame, x, WH / 2, Z0 - 0.04, 0));
    for (const y of [0.05, 1.05, WH - 0.04]) winWall.add(P.box(kit, X1 - X0, 0.06, 0.12, kit.m.frame, 0, y, Z0 - 0.04, 0));
    for (const [x, z] of [[X1, Z0], [X1, Z1], [X0, Z1]]) F.add(P.box(kit, 0.36, WH, 0.36, kit.m.column, x, WH / 2, z, 0.01));
    const ceil = ceilingCaster(X1 - X0 + 0.6, Z1 - Z0 + 0.6, WH + 0.12); F.add(ceil); casters.push(ceil);
    // 리셉션·회의실·대표실 바닥은 나무
    const wood = kit.m.wood;
    for (const [x0, x1, z0, z1] of [[X0, -4.4, Z0, -2.2], [5.4, X1, Z0, -2.4], [5.6, X1, 2.6, Z1]]) { const w = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.014, z1 - z0), wood); w.position.set((x0 + x1) / 2, 0.013, (z0 + z1) / 2); w.receiveShadow = true; F.add(w); }

    // 부서 구역 — 바닥 색 · 매달린 표지 · 섬 칸막이
    refs.teamSign = {};
    for (const t of TEAMS) {
      const wide = t.small ? 2.9 : 5.6, deep = t.small ? 2.2 : 3.9;
      const rug = new THREE.Mesh(new THREE.BoxGeometry(wide, 0.014, deep), kit.m.zone); rug.position.set(t.cx, 0.014, t.small ? t.cz - 0.2 : t.cz + 0.1); rug.receiveShadow = true; F.add(rug);
      const lt = liveTex(1024, 256); refs.teamSign[t.key] = lt;
      const sg = plane(lt.t, 1.8, 0.45, { side: THREE.DoubleSide });
      sg.position.set(t.small ? t.cx : t.cx - 1.6, 2.95, t.small ? t.cz + 0.6 : t.cz + 0.4); F.add(facing(sg));
      if (!t.small) F.add(P.box(kit, 4.6, 0.3, 0.03, kit.m.frost, t.cx, 0.88, t.cz + 0.375, 0));
    }

    // 유리 회의실(뒤 왼쪽) — 회차 보드
    glassWalls(kit, F, [[X0, -2.2, -5.6, -2.2], [-4.4, Z0, -4.4, -2.2]]);
    F.add(P.box(kit, 2.4, 0.05, 1.1, kit.m.tableTop, -6.2, 0.74, -3.85, 0.03));
    for (const s of [-1, 1]) F.add(P.box(kit, 0.1, 0.72, 0.7, kit.m.metal, -6.2 + s * 0.85, 0.36, -3.85, 0.01));
    for (let i = 0; i < 6; i++) { const c = lightChair(kit, kit.m.chair2); c.position.set(-6.95 + (i % 3) * 0.75, 0, i < 3 ? -4.75 : -2.95); c.rotation.y = i < 3 ? 0 : Math.PI; F.add(c); }
    refs.board = liveTex(1024, 560);
    const wb = new THREE.Group(); wb.add(P.box(kit, 2.3, 1.3, 0.05, kit.m.frame, 0, 0, 0, 0.01));
    const wbs = plane(refs.board.t, 2.22, 1.22, { roughness: 0.45 }); wbs.position.z = 0.03; wb.add(wbs);
    wb.position.set(X0 + 0.03, 1.6, -3.85); wb.rotation.y = Math.PI / 2; F.add(wb); tag(wb, 'work/week'); pickables.push(wb);
    const mT = liveTex(1024, 384); mT.draw(drawPlate('회의실', '이번 주 회차 보드')); const ms = plane(mT.t, 1.3, 0.49); ms.position.set(-6.8, 2.4, -2.17); F.add(ms);

    // 대표실(뒤 오른쪽 모서리) — 결재함
    glassWalls(kit, F, [[5.4, -2.4, 6.3, -2.4], [7.2, -2.4, X1, -2.4], [5.4, Z0, 5.4, -2.4]]);
    F.add(P.box(kit, 1.9, 0.06, 0.9, kit.m.woodDark, 6.7, 0.75, -4.2, 0.02), P.box(kit, 1.8, 0.66, 0.05, kit.m.woodDark, 6.7, 0.36, -3.78, 0.01));
    for (const s of [-1, 1]) F.add(P.box(kit, 0.07, 0.72, 0.8, kit.m.woodDark, 6.7 + s * 0.88, 0.36, -4.2, 0.01));
    const boss = lightChair(kit, kit.m.black); boss.position.set(6.7, 0, -4.95); boss.scale.setScalar(1.1); F.add(boss);
    const npT = liveTex(1024, 384); npT.draw(drawPlate('대표', '대표님 자리')); const np = plane(npT.t, 0.46, 0.17); np.position.set(6.7, 0.86, -3.74); np.rotation.x = -0.35; F.add(np);
    const tray = new THREE.Group(); tray.position.set(6.1, 0.78, -4.15); F.add(tray);
    tray.add(P.box(kit, 0.42, 0.06, 0.32, kit.m.decide, 0, 0.03, 0, 0.01)); // 결재함 — 인주색 한 점
    refs.papers = new THREE.Group(); tray.add(refs.papers);
    refs.badge = liveTex(128, 128); const badge = uiSprite(refs.badge.t); badge.scale.setScalar(0.36); badge.position.set(0.1, 0.42, 0); tray.add(badge);
    refs.ceoName = '대표실';
    refs.ceoSign = liveTex(1024, 384); const ds = plane(refs.ceoSign.t, 1.3, 0.49); ds.position.set(6.75, 2.4, -2.37); F.add(ds);
    tag(tray, 'decisions'); tag(ds, 'decisions'); pickables.push(tray, ds);
    F.add(P.at(P.plant(kit, { h: 1.2, seed: 51 }), 7.6, 0, -5.1));

    // 서버 클로젯(앞 왼쪽) — AI 연결 불빛
    glassWalls(kit, F, [[-6.2, 2.8, -6.2, Z1], [X0, 2.8, -6.2, 2.8]]);
    refs.led = new THREE.MeshStandardMaterial({ color: m3('off'), roughness: 0.6 });
    const server = new THREE.Group(); F.add(server);
    for (const z of [3.6, 4.75]) {
      const rk = new THREE.Group(); rk.position.set(-7.35, 0, z); rk.rotation.y = Math.PI / 2; server.add(rk);
      rk.add(P.box(kit, 0.9, 1.8, 0.9, kit.m.chair2, 0, 0.9, 0, 0.01));
      for (let i = 0; i < 7; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.01), refs.led); l.position.set(0.25, 0.3 + i * 0.2, 0.455); rk.add(l); }
    }
    refs.serverName = '서버 클로젯';
    refs.serverSign = liveTex(1024, 384); const ss = plane(refs.serverSign.t, 1.3, 0.49); ss.position.set(-6.17, 2.4, 4.15); ss.rotation.y = Math.PI / 2; server.add(ss);
    tag(server, 'settings/power'); pickables.push(server);

    // 자료실 책장(왼쪽 벽) — 회사 지식
    const lib = new THREE.Group(); lib.position.set(X0 + 0.2, 0, 0.3); lib.rotation.y = Math.PI / 2; F.add(lib);
    for (let k = 0; k < 2; k++) {
      const sh = new THREE.Group(); sh.position.x = (k - 0.5) * 1.65; lib.add(sh);
      sh.add(P.box(kit, 1.55, 2.2, 0.03, kit.m.shelf, 0, 1.1, -0.17, 0), P.box(kit, 0.04, 2.2, 0.36, kit.m.shelf, -0.76, 1.1, 0, 0), P.box(kit, 0.04, 2.2, 0.36, kit.m.shelf, 0.76, 1.1, 0, 0));
      for (let r = 0; r < 4; r++) sh.add(P.box(kit, 1.5, 0.03, 0.34, kit.m.shelf, 0, 0.1 + r * 0.55, 0, 0));
    }
    refs.books = new THREE.Group(); lib.add(refs.books);
    refs.libName = '자료실';
    refs.libSign = liveTex(1024, 384); const ls = plane(refs.libSign.t, 1.5, 0.56); ls.position.set(0, 2.55, -0.05); lib.add(ls);
    tag(lib, 'company/library'); pickables.push(lib);

    // 리셉션(앞 오른쪽) — 로고 월 · 안내 데스크 · 트로피 진열장
    const lw = new THREE.Group(); lw.position.set(5.75, 0, 4.15); lw.rotation.y = Math.PI / 2; F.add(lw);
    lw.add(P.box(kit, 2.6, 2.8, 0.22, kit.m.wall2, 0, 1.4, 0, 0.02));
    refs.logo = liveTex(1024, 512); const logo = plane(refs.logo.t, 2.3, 1.15, { ui: false }); logo.position.set(0, 1.8, 0.12); lw.add(logo);
    F.add(P.box(kit, 0.7, 1.0, 1.9, kit.m.white, 6.95, 0.5, 4.15, 0.05), P.box(kit, 0.85, 0.05, 2.0, kit.m.wood, 6.95, 1.025, 4.15, 0.02));
    const cab = new THREE.Group(); cab.position.set(6.9, 0, 2.95); F.add(cab);
    cab.add(P.box(kit, 1.7, 0.8, 0.45, kit.m.white, 0, 0.4, 0, 0.02));
    refs.trophies = new THREE.Group(); refs.trophies.position.set(0, 0.8, 0); cab.add(refs.trophies);
    tag(cab, 'company/library'); pickables.push(cab);

    // 탕비 카운터(뒤 창가) · 사물함 · 화분
    F.add(P.box(kit, 2.6, 0.95, 0.6, kit.m.white, 1.1, 0.475, -5.1, 0.02), P.box(kit, 2.7, 0.05, 0.65, kit.m.wood, 1.1, 0.97, -5.08, 0.01), P.box(kit, 0.65, 1.8, 0.6, kit.m.cabinet, 2.8, 0.9, -5.1, 0.02));
    for (let i = 0; i < 4; i++) F.add(P.box(kit, 0.45, 1.7, 0.5, i % 2 ? kit.m.cabinet : kit.m.box, -3.7 + i * 0.47, 0.85, -5.2, 0.01));
    [[-4.0, 5.1, 1.3], [4.9, -5.1, 1.2], [-0.4, 5.1, 1.0], [X1 - 0.5, 1.9, 1.1]].forEach(([x, z, h], i) => F.add(P.at(P.plant(kit, { h, seed: i + 61 }), x, 0, z, i)));

    const slots = TEAMS.flatMap((t) => teamSlots(t, F, t.small ? { cols: [-0.68, 0.68], rows: 1 } : undefined).map((s) => ({ ...s, floor: 0, ...(t.small ? { w: 1.25 } : {}) })));
    return { floors: [F], slots };
  },
  /** 자료실 책장 2개 × 4칸 × 10권(위 칸부터 아래로가 아니라 아래 칸부터) */
  bookAt: (i) => { if (i >= 80) return null; const sh = Math.floor(i / 40), row = Math.floor((i % 40) / 10), j = i % 10; return [(sh - 0.5) * 1.65 - 0.62 + j * 0.135, 0.31 + row * 0.55, 0.02]; },
  trophyAt: (i) => (i < 4 ? [-0.6 + i * 0.4, 0, 0] : null),
  trophyScale: 1.8,
};
