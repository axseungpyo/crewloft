// 0단계 · 공유 오피스 한 칸 — 공유 오피스 층 안의 작은 유리방 하나가 우리 회사(성장형 오피스 기획)
// 우리 방(카펫 바닥·회사 색)과 다른 입주사 공간(콘크리트 바닥·회색 가구, 사람 없음)을 또렷이 나눈다.
// 정원 2명 — 넘치는 직원은 방 밖 공용 핫데스크(임시 자리)에 앉아 "레벨 업할 때"를 보여준다.
import * as THREE from 'three';
import * as P from '../props.js';
import { liveTex, drawPlate, plane, lightChair, tag, ceilingCaster, facing, cutaway, uiSprite } from '../build.js';
import { m3 } from '../palette.js';

const WH = 3.2, X0 = -8, X1 = 8, Z0 = -5.5, Z1 = 5.5;
const ROOM = { x0: -2.2, x1: 3.4, z0: -0.6, z1: 3.6 }; // 우리 방
const DOOR = { z0: -0.05, z1: 1.3 }; // 오른쪽 유리벽의 문
const TEAMS = [
  { key: 'all', name: '우리 회사', role: null },
  { key: 'overflow', name: '임시 자리', role: null },
];
const FLOORS = [{ n: '1칸', name: '우리 방', rooms: '책상 2 · 대표 자리 · 공용 라운지' }];

/** 유리벽 한 장 — 카메라 쪽 벽은 젖빛 띠 없이(앉은 직원 얼굴이 가리지 않게) */
function glassSeg(kit, g, x0, z0, x1, z1, frost = false) {
  const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(z1 - z0, x1 - x0), w = new THREE.Group(), n = Math.max(1, Math.round(L / (frost ? 1.4 : 2.6)));
  w.add(P.box(kit, L, 2.6, 0.025, kit.m.partition, L / 2, 1.3, 0, 0), P.box(kit, L, 0.05, 0.06, kit.m.frame, L / 2, 2.62, 0, 0), P.box(kit, L, 0.04, 0.06, kit.m.frame, L / 2, 0.02, 0, 0));
  if (frost) w.add(P.box(kit, L, 0.22, 0.03, kit.m.frost, L / 2, 1.25, 0, 0));
  for (let i = 0; i <= n; i++) w.add(P.box(kit, 0.045, 2.6, 0.06, kit.m.frame, (L * i) / n, 1.3, 0, 0));
  w.position.set(x0, 0, z0); w.rotation.y = -a; g.add(w);
}

export default {
  key: 's0', stage: 0, name: '공유 오피스 한 칸', place: '공유 오피스 안 작은 방', capacity: 2,
  floors: FLOORS, teams: TEAMS, roleFloor: { manager: 0, researcher: 0, writer: 0, designer: 0 }, defaultFloor: 0,
  building: null,
  // 의자 뒤로 지나가는 통로 한 줄 — 방 안(대표 자리 뒤 ~ 문) → 문 → 방 밖 임시 자리 뒤
  lanes: { 0: { h: [[0.55, -1.7, 7.2]], v: [] } },
  view: () => ({ pos: [16.4, 14.6, 18.6], target: [2.0, -0.2, -0.3] }),
  light: { target: [0, 2, 0], half: 13, dist: 30 },
  backdrop: { cx: 1, cy: 4, z: -20, w: 56, h: 22 },
  exterior: { rect: { x0: X0, x1: X1, z0: Z0, z1: Z1 }, height: WH }, // 도시 속 건물 바닥 · 높이(지붕 열기)
  trophyScale: 1.4,

  build({ kit, root, casters, pickables, refs }) {
    const g = new THREE.Group(); root.add(g);
    // 남의 공간용 회색 재료(모양은 같은 가구, 색만 뺀다)
    const mute = { ...kit, m: { ...kit.m, deskTop: kit.m.cabinet, metal: kit.m.box, sofa: kit.m.box, pillow: kit.m.cabinet, legs: kit.m.box, white: kit.m.cabinet } }; // 다른 입주사 자리 — 한 단계 흐린 회색
    const grey = kit.m.box;

    // 층 껍데기 — 슬래브 · 바닥 · 왼쪽 벽 · 뒤쪽 통유리 · 기둥 · 그림자 전용 천장
    const slab = P.box(kit, X1 - X0 + 0.5, 0.32, Z1 - Z0 + 0.5, kit.m.slab, 0, -0.16, 0, 0); slab.castShadow = false; g.add(slab);
    const conc = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 0.012, Z1 - Z0), kit.m.floor); conc.position.y = 0.006; conc.receiveShadow = true; g.add(conc);
    cutaway(g, [-1, 0], P.box(kit, 0.22, WH, Z1 - Z0, kit.m.wall, X0 - 0.11, WH / 2, 0, 0)); // 바깥 벽은 카메라 쪽이면 낮아진다
    const winWall = cutaway(g, [0, -1]);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, WH), kit.m.glass); gl.position.set(0, WH / 2, Z0 - 0.04); winWall.add(gl);
    for (let x = X0; x <= X1 + 0.01; x += 2) winWall.add(P.box(kit, 0.07, WH, 0.12, kit.m.frame, x, WH / 2, Z0 - 0.04, 0));
    for (const y of [0.05, 1.05, WH - 0.04]) winWall.add(P.box(kit, X1 - X0, 0.06, 0.12, kit.m.frame, 0, y, Z0 - 0.04, 0));
    for (const [x, z] of [[X1, Z0], [X1, Z1], [X0, Z1]]) g.add(P.box(kit, 0.34, WH, 0.34, kit.m.column, x, WH / 2, z, 0.01));
    const ceil = ceilingCaster(X1 - X0 + 0.6, Z1 - Z0 + 0.6, WH + 0.12); g.add(ceil); casters.push(ceil);
    const coS = liveTex(1024, 384); coS.draw(drawPlate('공유 오피스', '다른 입주사와 함께 쓰는 공간', 'muted'));
    const co = plane(coS.t, 1.9, 0.71); co.position.set(X0 + 0.02, 2.3, -1.6); co.rotation.y = Math.PI / 2; g.add(co);

    // ── 다른 입주사 공간(회색 · 사람 없음) ──
    // 뒤왼쪽 — 핫데스크 벤치 두 줄
    for (const z of [-4.2, -2.4]) {
      g.add(P.box(mute, 4.2, 0.04, 0.9, mute.m.deskTop, -5.0, 0.74, z, 0.01));
      for (const sx of [-1, 1]) g.add(P.box(mute, 0.05, 0.72, 0.8, mute.m.metal, -5.0 + sx * 2.0, 0.36, z, 0));
      for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const c = lightChair(mute, grey); c.position.set(-6.4 + i * 1.4, 0, z + s * 0.75); c.rotation.y = s > 0 ? Math.PI : 0; g.add(c); }
      for (let i = 0; i < 2; i++) g.add(P.box(mute, 0.32, 0.016, 0.22, kit.m.box, -5.7 + i * 1.6, 0.77, z - 0.1, 0.004));
    }
    // 뒤오른쪽 — 공용 탕비실(통유리 앞 카운터 · 냉장고 · 스툴)
    g.add(P.box(mute, 3.6, 0.95, 0.65, mute.m.white, 5.4, 0.475, -4.95, 0.02), P.box(mute, 3.7, 0.05, 0.72, kit.m.wood, 5.4, 0.97, -4.93, 0.01), P.box(mute, 0.7, 1.9, 0.65, kit.m.cabinet, 7.5, 0.95, -4.95, 0.02));
    for (let i = 0; i < 3; i++) g.add(P.cyl(mute, 0.18, 0.18, 0.05, grey, 4.4 + i * 1.0, 0.7, -4.15, 16), P.cyl(mute, 0.025, 0.025, 0.68, 'metal', 4.4 + i * 1.0, 0.34, -4.15, 8));
    // 앞왼쪽 — 공용 라운지
    const lounge = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.012, 48), kit.m.zone); lounge.position.set(-5.2, 0.012, 2.9); lounge.receiveShadow = true; g.add(lounge);
    const so1 = P.sofa(mute, { w: 2.0 }); so1.position.set(-5.3, 0, 4.4); so1.rotation.y = Math.PI; g.add(so1);
    const so2 = P.sofa(mute, { w: 1.8 }); so2.position.set(-7.1, 0, 2.6); so2.rotation.y = Math.PI / 2; g.add(so2);
    g.add(P.cyl(mute, 0.45, 0.45, 0.4, mute.m.deskTop, -5.0, 0.2, 2.7, 28));
    // 앞오른쪽 — 폰 부스 2개
    for (const z of [3.6, 4.85]) { g.add(P.box(kit, 1.15, 2.2, 1.1, kit.m.partition, 7.25, 1.1, z, 0.02), P.box(mute, 0.5, 0.04, 0.32, mute.m.deskTop, 7.45, 0.75, z, 0)); for (const [dx, dz] of [[-0.57, -0.54], [0.57, -0.54], [-0.57, 0.54], [0.57, 0.54]]) g.add(P.box(kit, 0.04, 2.2, 0.04, mute.m.metal, 7.25 + dx, 1.1, z + dz, 0)); }
    [[-7.4, -5.0, 1.3], [3.9, -4.9, 1.1], [-2.9, 5.0, 1.0], [-7.4, 0.2, 1.2]].forEach(([x, z, h], i) => g.add(P.at(P.plant(kit, { h, seed: i + 51 }), x, 0, z, i)));

    // ── 우리 방 ──
    const room = new THREE.Group(); g.add(room);
    const carpet = new THREE.Mesh(new THREE.BoxGeometry(ROOM.x1 - ROOM.x0, 0.014, ROOM.z1 - ROOM.z0), kit.m.zone); // 우리 칸 — 공용 바닥보다 한 단계 짙은 콘크리트 carpet.position.set((ROOM.x0 + ROOM.x1) / 2, 0.014, (ROOM.z0 + ROOM.z1) / 2); carpet.receiveShadow = true; room.add(carpet);
    glassSeg(kit, room, ROOM.x0, ROOM.z0, ROOM.x1, ROOM.z0, true);
    glassSeg(kit, room, ROOM.x0, ROOM.z0, ROOM.x0, ROOM.z1, true);
    glassSeg(kit, room, ROOM.x0, ROOM.z1, ROOM.x1, ROOM.z1);
    glassSeg(kit, room, ROOM.x1, ROOM.z0, ROOM.x1, DOOR.z0);
    glassSeg(kit, room, ROOM.x1, DOOR.z1, ROOM.x1, ROOM.z1);
    room.add(P.box(kit, 0.06, 0.06, DOOR.z1 - DOOR.z0, kit.m.frame, ROOM.x1, 2.62, (DOOR.z0 + DOOR.z1) / 2, 0)); // 문 위 틀
    // 문패 — 회사 이름(코어가 그린다)
    refs.logo = liveTex(1024, 512);
    const plaque = plane(refs.logo.t, 0.9, 0.45, { ui: false }); plaque.position.set(ROOM.x1 + 0.04, 1.75, DOOR.z1 + 0.6); plaque.rotation.y = Math.PI / 2; room.add(plaque);

    // 대표 자리 — 나무 책상 + 결재함(결정 대기) + 자리 표지
    const boss = new THREE.Group(); boss.position.set(-1.2, 0, 2.6); room.add(boss);
    boss.add(P.box(kit, 1.5, 0.05, 0.75, kit.m.woodDark, 0, 0.745, 0, 0.01), P.box(kit, 1.4, 0.55, 0.04, kit.m.woodDark, 0, 0.43, 0.33, 0.01));
    for (const s of [-1, 1]) boss.add(P.box(kit, 0.05, 0.72, 0.68, kit.m.woodDark, s * 0.71, 0.36, 0, 0.005));
    const bch = lightChair(kit, kit.m.black); bch.position.set(0, 0, -0.62); boss.add(bch);
    const tray = new THREE.Group(); tray.position.set(-0.35, 0.77, -0.05); boss.add(tray);
    tray.add(P.box(kit, 0.4, 0.05, 0.3, kit.m.decide, 0, 0.025, 0, 0.01)); // 결재함 — 인주색 한 점
    refs.papers = new THREE.Group(); tray.add(refs.papers);
    refs.badge = liveTex(128, 128); const badge = uiSprite(refs.badge.t); badge.scale.setScalar(0.32); badge.position.set(0.1, 0.36, 0); tray.add(badge);
    refs.ceoName = '대표 자리';
    refs.ceoSign = liveTex(1024, 384); const cs = plane(refs.ceoSign.t, 0.72, 0.27); cs.position.set(0.3, 0.92, 0.33); cs.rotation.x = -0.25; boss.add(cs);
    tag(tray, 'decisions'); tag(cs, 'decisions'); pickables.push(tray, cs);

    // 회차 보드 — 방 뒤 유리벽에 건 작은 화이트보드
    refs.board = liveTex(1024, 560);
    const wb = new THREE.Group(); wb.add(P.box(kit, 1.68, 0.96, 0.04, kit.m.frame, 0, 0, 0, 0.008));
    const wbs = plane(refs.board.t, 1.6, 0.875, { roughness: 0.45 }); wbs.position.z = 0.025; wb.add(wbs);
    wb.position.set(0.5, 1.55, ROOM.z0 + 0.06); room.add(wb); tag(wb, 'work/week'); pickables.push(wb);

    // AI 연결 — 벽 선반 위 작은 공유기/NAS(불빛)
    const net = new THREE.Group(); net.position.set(-1.45, 0, ROOM.z0 + 0.2); room.add(net);
    net.add(P.box(kit, 0.9, 0.04, 0.3, kit.m.wood, 0, 1.05, 0, 0.005));
    net.add(P.box(kit, 0.34, 0.09, 0.24, kit.m.device, -0.15, 1.115, 0, 0.01), P.box(kit, 0.18, 0.22, 0.2, kit.m.chair2, 0.24, 1.18, 0, 0.01));
    refs.led = new THREE.MeshStandardMaterial({ color: m3('off'), roughness: 0.6 });
    for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.015, 0.01), refs.led); l.position.set(-0.27 + i * 0.07, 1.13, 0.125); net.add(l); }
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.01), refs.led); l.position.set(0.24, 1.12 + i * 0.05, 0.105); net.add(l); }
    refs.serverName = 'AI 연결';
    refs.serverSign = liveTex(1024, 384); const ss = plane(refs.serverSign.t, 0.72, 0.27); ss.position.set(0, 1.55, -0.12); net.add(ss);
    tag(net, 'settings/power'); pickables.push(net);

    // 책장(회사 지식) + 위에 트로피(마일스톤)
    const shelf = new THREE.Group(); shelf.position.set(2.55, 0, ROOM.z0 + 0.22); room.add(shelf);
    shelf.add(P.box(kit, 1.4, 1.15, 0.03, kit.m.shelf, 0, 0.575, -0.16, 0), P.box(kit, 0.04, 1.15, 0.34, kit.m.shelf, -0.68, 0.575, 0, 0), P.box(kit, 0.04, 1.15, 0.34, kit.m.shelf, 0.68, 0.575, 0, 0));
    for (const y of [0.04, 0.58, 1.13]) shelf.add(P.box(kit, 1.36, 0.03, 0.32, kit.m.shelf, 0, y, 0, 0));
    refs.books = new THREE.Group(); shelf.add(refs.books);
    refs.trophies = new THREE.Group(); shelf.add(refs.trophies);
    refs.libName = '책장';
    refs.libSign = liveTex(1024, 384); const lsn = plane(refs.libSign.t, 0.72, 0.27); lsn.position.set(-0.3, 1.72, -0.12); shelf.add(lsn);
    tag(shelf, 'company/library'); pickables.push(shelf);

    // 임시 자리 표지 — 방 밖 공용 핫데스크
    const ovS = liveTex(1280, 384); ovS.draw(drawPlate('임시 자리', '자리가 모자라요 — 레벨이 오르면 정리돼요', 'muted'));
    const ov = new THREE.Group(); ov.position.set(4.6, 0, 3.4); ov.rotation.y = 0.62; g.add(ov);
    ov.add(P.cyl(kit, 0.02, 0.02, 1.2, 'metal', 0, 0.6, -0.01, 8), P.cyl(kit, 0.18, 0.18, 0.02, 'metal', 0, 0.01, 0, 20));
    const ovp = plane(ovS.t, 1.4, 0.42); ovp.position.set(0, 1.4, 0.01); ov.add(facing(ovp));
    const ovFloor = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.012, 2.0), kit.m.zone); ovFloor.position.set(5.85, 0.013, 1.75); g.add(ovFloor);

    // 책상 자리 — 방 안 2개(먼저 채움) + 방 밖 임시 자리 2개
    const mk = (team, x, z) => { const s = new THREE.Group(); s.position.set(x, 0, z); g.add(s); return { team, g: s, yaw: 0, emp: null, floor: 0 }; };
    const slots = [mk(TEAMS[0], 0.55, 2.6), mk(TEAMS[0], 2.3, 2.6), mk(TEAMS[1], 5.05, 2.2), mk(TEAMS[1], 6.75, 2.2)];
    return { floors: [g], slots };
  },
  /** 회사 지식 책 — 책장 2칸 × 10권 */
  bookAt: (i) => (i < 20 ? [-0.6 + (i % 10) * 0.13, 0.25 + Math.floor(i / 10) * 0.54, 0.02] : null),
  /** 트로피 — 책장 위 오른쪽(최대 3개) */
  trophyAt: (i) => (i < 3 ? [0.15 + i * 0.22, 1.145, 0.02] : null),
};
