// 1단계 · 작은 사무실 — 평범한 건물 안의 단독 사무실 한 칸(약 10.5×8m). "우리의 첫 진짜 사무실".
// 뒤쪽 벽 창으로 해가 들고, 왼쪽 벽에 출입문·간판·회차 보드·책장. 책상 4개는 한 줄로 대표 쪽(카메라)을 본다.
// 정원(4)을 넘겨 채용하면 앞쪽 임시 자리(핫데스크 2)에 앉는다 — 레벨이 오르면 정리된다(성장형 오피스 G1).
import * as THREE from 'three';
import * as P from '../props.js';
import { FONT, liveTex, drawPlate, plane, lightChair, tag, teamSlots, ceilingCaster, facing, cutaway, uiSprite } from '../build.js';
import { m3 } from '../palette.js';

const WH = 2.9, X0 = -5.25, X1 = 5.25, Z0 = -4, Z1 = 4;
const WIN = { x0: -2.4, x1: 5.0, y0: 0.85, y1: 2.45 };
const TEAMS = [
  { key: 'all', name: '우리 회사', floor: 0, cx: 0.4, cz: 0.4, role: null },
  { key: 'overflow', name: '임시 자리', floor: 0, cx: 2.3, cz: 2.75, role: null },
];
const FLOORS = [{ n: '1실', name: '우리 사무실', rooms: '책상 4 · 대표 자리 · 회의 테이블 · 탕비 코너' }];
const SAMPLE = '우리 사무실 임시 자리 자리가 모자라요 레벨이 오르면 정리돼요 — 대표 자리 AI 연결 책장 회사 지식건 결재 대기 없음 연결됨 확인 필요';

/** 글자 판(정적) — 글꼴이 늦게 오면 한 번 더 그린다 */
function sign(fn) {
  const lt = liveTex(1024, 384); lt.draw(fn);
  document.fonts?.load(`800 120px "${FONT}"`, SAMPLE).then(() => lt.draw(fn)).catch(() => {});
  return lt;
}
const drawNote = (title, sub) => drawPlate(title, sub, 'muted'); // 임시 자리 안내 — 메모지 장식 대신 2D 카드(3단계와 같게)

export default {
  key: 's1', stage: 1, name: '작은 사무실', place: '단독 사무실 한 칸', capacity: 4,
  floors: FLOORS, teams: TEAMS, roleFloor: { manager: 0, researcher: 0, writer: 0, designer: 0 }, defaultFloor: 0,
  elevator: null,
  /** 통로: 책상 줄 뒤(z −1.6) · 책상 줄 앞(z 1.35) 가로, 양옆 세로 */
  lanes: { 0: { h: [[-1.6, -3.7, 4.4], [1.35, -3.7, 4.4]], v: [[-3.7, -1.6, 1.35], [4.4, -1.6, 1.35]] } },
  view: () => ({ pos: [9.9, 10.4, 13.2], target: [0.55, 0.3, -0.15] }),
  building: null,
  light: { target: [0, 1, 0], half: 9, dist: 22 },
  backdrop: { cx: 0, cy: 3.2, z: -15, w: 44, h: 18 },
  exterior: { rect: { x0: X0, x1: X1, z0: Z0, z1: Z1 }, height: WH }, // 도시 속 건물 바닥 · 높이(지붕 열기)
  fontSample: SAMPLE,
  trophyScale: 1.5,

  build({ kit, root, casters, pickables, refs }) {
    const g = new THREE.Group(); root.add(g);
    const W = X1 - X0, D = Z1 - Z0;
    // 껍데기 — 건물 바닥판 · 카펫 · 나무 바닥(탕비 코너) · 왼쪽 벽 · 뒤쪽 창벽 · 기둥
    const slab = P.box(kit, W + 1.2, 0.32, D + 1.2, kit.m.slab, 0, -0.16, 0, 0); slab.castShadow = false; g.add(slab);
    const fl = new THREE.Mesh(new THREE.BoxGeometry(W, 0.012, D), kit.m.floor); fl.position.y = 0.006; fl.receiveShadow = true; g.add(fl);
    const wood = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.014, 1.9), kit.m.wood); wood.position.set(X0 + 1.15, 0.008, Z0 + 0.95); wood.receiveShadow = true; g.add(wood);
    cutaway(g, [-1, 0], P.box(kit, 0.22, WH, D, kit.m.wall, X0 - 0.11, WH / 2, 0, 0)); // 바깥 벽은 카메라 쪽이면 낮아진다
    const winWall = cutaway(g, [0, -1]);
    const bz = Z0 - 0.08;
    winWall.add(P.box(kit, WIN.x0 - X0 + 0.11, WH, 0.16, kit.m.wall2, (X0 - 0.11 + WIN.x0) / 2, WH / 2, bz, 0)); // 창 왼쪽 벽
    winWall.add(P.box(kit, X1 - WIN.x1 + 0.2, WH, 0.16, kit.m.wall2, (WIN.x1 + X1 + 0.2) / 2, WH / 2, bz, 0)); // 창 오른쪽 벽
    winWall.add(P.box(kit, WIN.x1 - WIN.x0, WIN.y0, 0.16, kit.m.wall2, (WIN.x0 + WIN.x1) / 2, WIN.y0 / 2, bz, 0)); // 창 아래
    winWall.add(P.box(kit, WIN.x1 - WIN.x0, WH - WIN.y1, 0.16, kit.m.wall2, (WIN.x0 + WIN.x1) / 2, (WH + WIN.y1) / 2, bz, 0)); // 창 위
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(WIN.x1 - WIN.x0, WIN.y1 - WIN.y0), kit.m.glass); gl.position.set((WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, bz); winWall.add(gl);
    for (let i = 0; i <= 4; i++) winWall.add(P.box(kit, 0.06, WIN.y1 - WIN.y0, 0.1, kit.m.frame, WIN.x0 + ((WIN.x1 - WIN.x0) * i) / 4, (WIN.y0 + WIN.y1) / 2, bz, 0));
    for (const y of [WIN.y0, WIN.y1]) winWall.add(P.box(kit, WIN.x1 - WIN.x0 + 0.06, 0.06, 0.12, kit.m.frame, (WIN.x0 + WIN.x1) / 2, y, bz, 0));
    g.add(P.box(kit, WIN.x1 - WIN.x0, 0.04, 0.24, kit.m.white, (WIN.x0 + WIN.x1) / 2, WIN.y0 - 0.02, Z0 + 0.06, 0.01)); // 창턱
    for (const [x, z] of [[X1 + 0.1, Z0 - 0.08], [X1 + 0.1, Z1], [X0 - 0.11, Z1]]) g.add(P.box(kit, 0.3, WH, 0.3, kit.m.column, x, WH / 2, z, 0.01));
    g.add(P.box(kit, W, 0.08, 0.02, kit.m.trim, 0, 0.04, Z0 + 0.01, 0), P.box(kit, 0.02, 0.08, D, kit.m.trim, X0 + 0.01, 0.04, 0, 0)); // 걸레받이
    const ceil = ceilingCaster(W + 0.8, D + 0.8, WH + 0.12); g.add(ceil); casters.push(ceil);

    // 왼쪽 벽 — 출입문(앞쪽) · 회사 간판
    const door = new THREE.Group(); door.position.set(X0 + 0.02, 0, 2.95); door.rotation.y = Math.PI / 2; g.add(door);
    door.add(P.box(kit, 1.04, 2.2, 0.06, kit.m.frame, 0, 1.1, 0, 0.01), P.box(kit, 0.9, 2.08, 0.04, kit.m.wood, 0, 1.06, 0.03, 0.01), P.cyl(kit, 0.025, 0.025, 0.22, 'metal', 0.34, 1.05, 0.08, 8));
    refs.logo = liveTex(1024, 512);
    const logo = plane(refs.logo.t, 1.4, 0.7, { ui: false }); logo.position.set(X0 + 0.055, 1.95, 1.55); logo.rotation.y = Math.PI / 2; g.add(logo);
    g.add(P.box(kit, 0.04, 0.78, 1.48, kit.m.frame, X0 + 0.01, 1.95, 1.55, 0.01));

    // 회차 보드 — 왼쪽 벽 가운데
    refs.board = liveTex(1024, 560);
    const wb = new THREE.Group(); wb.add(P.box(kit, 2.1, 1.18, 0.05, kit.m.frame, 0, 0, 0, 0.01));
    const wbs = plane(refs.board.t, 2.02, 1.1, { roughness: 0.45 }); wbs.position.z = 0.03; wb.add(wbs);
    wb.position.set(X0 + 0.03, 1.55, -0.2); wb.rotation.y = Math.PI / 2; g.add(wb); tag(wb, 'work/week'); pickables.push(wb);

    // 책장(회사 지식) + 위 칸 트로피(마일스톤) — 왼쪽 벽 뒤쪽
    const lib = new THREE.Group(); lib.position.set(X0 + 0.22, 0, -2.55); lib.rotation.y = Math.PI / 2; g.add(lib);
    const SH = 1.75;
    lib.add(P.box(kit, 1.55, SH, 0.03, kit.m.shelf, 0, SH / 2, -0.17, 0), P.box(kit, 0.04, SH, 0.36, kit.m.shelf, -0.76, SH / 2, 0, 0), P.box(kit, 0.04, SH, 0.36, kit.m.shelf, 0.76, SH / 2, 0, 0));
    for (let r = 0; r < 4; r++) lib.add(P.box(kit, 1.5, 0.03, 0.34, kit.m.shelf, 0, 0.1 + r * 0.55, 0, 0));
    lib.add(P.box(kit, 1.56, 0.04, 0.38, kit.m.shelf, 0, SH, 0, 0));
    refs.books = new THREE.Group(); lib.add(refs.books);
    refs.trophies = new THREE.Group(); refs.trophies.position.y = SH + 0.02; lib.add(refs.trophies);
    refs.libSign = liveTex(1024, 384); refs.libName = '책장';
    const ls = plane(refs.libSign.t, 0.9, 0.34); ls.position.set(0, 0.28, 0.2); ls.rotation.x = -0.1; lib.add(ls);
    tag(lib, 'company/library'); pickables.push(lib);

    // 탕비 코너 — 뒤쪽 벽 왼편(창 없는 부분)
    g.add(P.box(kit, 1.7, 0.9, 0.6, kit.m.white, -4.25, 0.45, Z0 + 0.32, 0.02), P.box(kit, 1.78, 0.05, 0.66, kit.m.wood, -4.25, 0.92, Z0 + 0.33, 0.01));
    g.add(P.box(kit, 1.7, 0.6, 0.35, kit.m.white, -4.25, 2.1, Z0 + 0.2, 0.02));
    g.add(P.box(kit, 0.32, 0.38, 0.3, kit.m.black, -4.7, 1.13, Z0 + 0.32, 0.03), P.box(kit, 0.24, 0.3, 0.26, kit.m.metal, -4.0, 1.1, Z0 + 0.32, 0.03));
    const mg = P.mug(kit); mg.position.set(-3.65, 0.945, Z0 + 0.3); g.add(mg);

    // AI 연결 — 작은 서버(NAS) 캐비닛, 탕비 코너 옆
    refs.led = new THREE.MeshStandardMaterial({ color: m3('off'), roughness: 0.6 });
    const nas = new THREE.Group(); nas.position.set(-2.95, 0, Z0 + 0.38); g.add(nas);
    nas.add(P.box(kit, 0.6, 1.05, 0.6, kit.m.chair2, 0, 0.525, 0, 0.02));
    for (let i = 0; i < 4; i++) { nas.add(P.box(kit, 0.5, 0.16, 0.02, kit.m.device, 0, 0.22 + i * 0.22, 0.3, 0)); const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.01), refs.led); l.position.set(0.17, 0.22 + i * 0.22, 0.315); nas.add(l); }
    refs.serverSign = liveTex(1024, 384); refs.serverName = 'AI 연결';
    const ss = plane(refs.serverSign.t, 0.9, 0.34); ss.position.set(0, 1.62, -0.28); nas.add(ss);
    tag(nas, 'settings/power'); pickables.push(nas);

    // 대표 자리 — 창가 오른쪽, 카메라 쪽을 본다 · 결재함(결정 대기)
    const boss = new THREE.Group(); boss.position.set(3.55, 0, -2.75); g.add(boss);
    boss.add(P.box(kit, 1.8, 0.05, 0.85, kit.m.woodDark, 0, 0.745, 0, 0.02), P.box(kit, 1.7, 0.6, 0.04, kit.m.woodDark, 0, 0.42, 0.4, 0.01));
    for (const s of [-1, 1]) boss.add(P.box(kit, 0.06, 0.72, 0.78, kit.m.woodDark, s * 0.86, 0.36, 0, 0.01));
    const bc = lightChair(kit, kit.m.black); bc.position.set(0, 0, -0.75); bc.scale.setScalar(1.08); boss.add(bc);
    const mon = P.monitor(kit, kit.m.screenOff, { w: 0.52, h: 0.31 }); mon.position.set(0.3, 0.77, -0.15); mon.rotation.y = Math.PI; boss.add(mon);
    const np = plane(sign(drawPlate('대표', '대표님 자리')).t, 0.42, 0.16); np.position.set(-0.1, 0.83, 0.44); np.rotation.x = -0.35; boss.add(np);
    const tray = new THREE.Group(); tray.position.set(-0.5, 0.77, 0.05); boss.add(tray);
    tray.add(P.box(kit, 0.42, 0.06, 0.32, kit.m.decide, 0, 0.03, 0, 0.01)); // 결재함 — 인주색 한 점
    refs.papers = new THREE.Group(); tray.add(refs.papers);
    refs.badge = liveTex(128, 128); const badge = uiSprite(refs.badge.t); badge.scale.setScalar(0.32); badge.position.set(0.1, 0.38, 0); tray.add(badge);
    refs.ceoSign = liveTex(1024, 384); refs.ceoName = '대표 자리';
    const ds = plane(refs.ceoSign.t, 1.2, 0.45); ds.position.set(3.55, 2.68, Z0 + 0.01); g.add(ds);
    tag(tray, 'decisions'); tag(ds, 'decisions'); pickables.push(tray, ds);

    // 회의 테이블(앞 왼쪽) + 러그
    const rug = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.012, 64), kit.m.zone); rug.position.set(-2.9, 0.012, 2.75); rug.receiveShadow = true; g.add(rug);
    g.add(P.at(P.roundTable(kit, { r: 0.55 }), -2.9, 0, 2.75));
    for (const a of [0.6, 2.4, 4.3]) { const c = P.sideChair(kit, 'chair2'); c.position.set(-2.9 + Math.sin(a) * 0.85, 0, 2.75 + Math.cos(a) * 0.85); c.rotation.y = a + Math.PI; g.add(c); }

    // 임시 자리 안내판(핫데스크 옆)
    const note = new THREE.Group(); note.position.set(4.55, 0, 3.0); note.rotation.y = -0.35; g.add(note);
    note.add(P.cyl(kit, 0.025, 0.025, 1.05, 'metal', 0, 0.52, 0, 8), P.cyl(kit, 0.2, 0.2, 0.03, 'metal', 0, 0.015, 0, 18));
    const nt = plane(sign(drawNote('임시 자리', '자리가 모자라요 — 레벨이 오르면 정리돼요')).t, 0.95, 0.36, { side: THREE.DoubleSide }); nt.position.y = 1.2; note.add(facing(nt));

    // 화분
    [[4.85, -3.55, 1.2], [-1.65, -3.6, 1.0], [4.9, 1.0, 0.9]].forEach(([x, z, h], i) => g.add(P.at(P.plant(kit, { h, seed: i + 11 }), x, 0, z, i)));

    // 책상 — 한 줄 4개(카메라를 봄) + 앞쪽 임시 자리 2개(모니터 1개, 좁은 책상)
    const slots = [
      ...teamSlots(TEAMS[0], g, { cols: [-2.325, -0.775, 0.775, 2.325].map((x) => x), rows: 1 }),
      ...teamSlots(TEAMS[1], g, { cols: [-0.7, 0.7], rows: 1 }).map((s) => ({ ...s, w: 1.25, monitors: 1 })),
    ].map((s) => ({ ...s, floor: 0 }));
    return { floors: [g], slots };
  },
  /** 책장 4칸 × 10권 = 40권 (책장 그룹 기준 좌표) */
  bookAt: (i) => (i < 40 ? [-0.62 + (i % 10) * 0.135, 0.31 + Math.floor(i / 10) * 0.55, 0.02] : null),
  /** 책장 위 트로피 4개 */
  trophyAt: (i) => (i < 4 ? [-0.55 + i * 0.37, 0, 0.02] : null),
};
