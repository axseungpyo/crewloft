// 공간 부품 — 엔진이 가진 기본 부품 + AI가 쓴 소품 레시피(기본 도형 조합)를 3D로 만든다(결정 67, '필요의 방').
import * as THREE from 'three';
import * as P from '../props.js';
import { S, liveTex, plane, lightChair, tag, facing, screenMat, uiSprite } from '../build.js';
import { m3, neutral } from '../palette.js';

const D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, Number.isFinite(v) ? v : a));
const HEX = /^#[0-9a-fA-F]{6}$/;

/** 레시피 재질 이름 → 팔레트 재질(브랜드 B 4단계). AI가 준 색은 채도를 눌러 밝기만 받는다 — 같은 이름 · 색은 재질 하나를 나눠 쓴다 */
function recipeMat(kit, part) {
  const c = HEX.test(part.c ?? '') ? neutral(part.c) : null;
  const key = `${part.m}:${c}`, cache = (kit.rc ??= new Map());
  if (cache.has(key)) return cache.get(key);
  let m;
  switch (part.m) {
    case 'metal': m = c ? S(c, 0.62, { metalness: 0.15 }) : kit.m.metal; break;
    case 'black': m = c ? S(c, 0.8) : kit.m.black; break;
    case 'glass': m = kit.m.partition; break;
    case 'fabric': m = c ? S(c, 0.95) : kit.m.sofa; break;
    case 'wood': m = c ? S(c, 0.84) : kit.m.wood; break;
    case 'screen': m = new THREE.MeshStandardMaterial({ color: m3('darker'), emissive: c ?? m3('mid-2'), emissiveIntensity: 0.6, roughness: 0.6 }); break;
    case 'glow': m = kit.m.glow; break; // 불빛은 색 없이 따뜻한 빛 하나
    case 'gold': m = kit.m.brass; break; // 황동 — 성장(트로피 · 레벨)
    case 'paper': m = kit.m.paper; break;
    default: m = c ? S(c, 0.84) : kit.m.white;
  }
  cache.set(key, m); return m;
}

/**
 * AI 소품 레시피 → 3D. 범위를 벗어난 부품은 잘라 내고, 너무 크면 버린다(설계도 검사와 같은 한계).
 * part: { s: 'box'|'cyl'|'sph'|'cone'|'torus', d: 크기, p: [x,y,z] (바닥이 y 0), r?: [deg x,y,z], m?: 재질, c?: '#hex', led?: true }
 */
export function buildRecipe(kit, recipe, ledMat = null) {
  const g = new THREE.Group();
  for (const part of (recipe?.parts ?? []).slice(0, 60)) {
    const d = (part.d ?? []).map((x) => clamp(x, 0.004, 3));
    const p = (part.p ?? [0, 0, 0]).map((x, i) => clamp(x, i === 1 ? -0.2 : -2.5, i === 1 ? 3 : 2.5));
    let geo;
    if (part.s === 'box') geo = new THREE.BoxGeometry(d[0] ?? 0.1, d[1] ?? 0.1, d[2] ?? 0.1);
    else if (part.s === 'cyl') geo = new THREE.CylinderGeometry(d[0] ?? 0.05, d[2] ?? d[0] ?? 0.05, d[1] ?? 0.1, 20);
    else if (part.s === 'cone') geo = new THREE.ConeGeometry(d[0] ?? 0.05, d[1] ?? 0.1, 20);
    else if (part.s === 'sph') geo = new THREE.SphereGeometry(d[0] ?? 0.05, 20, 14);
    else if (part.s === 'torus') geo = new THREE.TorusGeometry(d[0] ?? 0.1, Math.min(d[1] ?? 0.02, (d[0] ?? 0.1) * 0.9), 10, 28);
    else continue;
    const mat = part.led && ledMat ? ledMat : recipeMat(kit, part);
    const m = new THREE.Mesh(geo, mat); m.castShadow = part.m !== 'glass'; m.receiveShadow = true;
    m.position.set(p[0], p[1], p[2]);
    if (part.r) m.rotation.set((part.r[0] ?? 0) * D2R, (part.r[1] ?? 0) * D2R, (part.r[2] ?? 0) * D2R);
    g.add(m);
  }
  return g;
}

/** 엔진 기본 부품 — 어느 도메인에서나 쓰는 것들 */
const BUILTIN = {
  sofa: (kit) => P.sofa(kit, { w: 2.0 }),
  plant: (kit, i = 0) => P.plant(kit, { h: 1.1 + (i % 3) * 0.15, seed: 51 + i }),
  meeting_table: (kit) => { const g = P.roundTable(kit, { r: 0.6 }); for (const a of [0.3, 2.4, 4.4]) { const c = lightChair(kit, kit.m.chair2); c.position.set(Math.sin(a) * 0.95, 0, Math.cos(a) * 0.95); c.rotation.y = a + Math.PI; g.add(c); } return g; },
  long_table: (kit) => { const g = new THREE.Group(); g.add(P.box(kit, 2.6, 0.05, 1.0, kit.m.tableTop, 0, 0.74, 0, 0.02)); for (const s of [-1, 1]) g.add(P.box(kit, 0.08, 0.72, 0.7, kit.m.metal, s * 1.1, 0.36, 0, 0.01)); for (let i = 0; i < 6; i++) { const c = lightChair(kit, kit.m.chair2); c.position.set(-0.85 + (i % 3) * 0.85, 0, i < 3 ? -0.85 : 0.85); c.rotation.y = i < 3 ? 0 : Math.PI; g.add(c); } return g; },
  coffee_bar: (kit) => { const g = new THREE.Group(); g.add(P.box(kit, 1.8, 0.95, 0.6, kit.m.white, 0, 0.475, 0, 0.02), P.box(kit, 1.9, 0.05, 0.66, kit.m.wood, 0, 0.97, 0, 0.01), P.box(kit, 0.32, 0.4, 0.3, kit.m.device, -0.5, 1.2, -0.05, 0.03)); return g; },
  lamp: (kit) => P.lamp(kit),
  lockers: (kit) => { const g = new THREE.Group(); for (let i = 0; i < 4; i++) g.add(P.box(kit, 0.45, 1.8, 0.5, i % 2 ? kit.m.cabinet : kit.m.box, -0.7 + i * 0.47, 0.9, 0, 0.01)); return g; },
  printer: (kit) => { const g = new THREE.Group(); g.add(P.box(kit, 0.75, 0.95, 0.6, kit.m.white, 0, 0.475, 0, 0.02), P.box(kit, 0.62, 0.05, 0.4, kit.m.black, 0, 0.97, 0.05, 0.01)); return g; },
  bookshelf: (kit) => P.shelf(kit, { w: 1.4, h: 1.8, seed: 7 }),
  armchair: (kit) => { const g = new THREE.Group(); g.add(P.box(kit, 0.8, 0.4, 0.8, kit.m.sofa, 0, 0.25, 0, 0.06), P.box(kit, 0.8, 0.5, 0.18, kit.m.sofa, 0, 0.6, -0.31, 0.06)); return g; },
};
export const BUILTIN_NAMES = Object.keys(BUILTIN);

/** 이름으로 소품 만들기 — 설계도의 레시피가 먼저, 없으면 엔진 기본 부품 */
export function makeProp(kit, name, recipes, i = 0, ledMat = null) {
  if (recipes?.[name]) return buildRecipe(kit, recipes[name], ledMat);
  if (BUILTIN[name]) return BUILTIN[name](kit, i);
  return null;
}

/** 바닥에 놓인 물체의 가로·깊이(자리 잡기용) */
export function footprint(obj) {
  const b = new THREE.Box3().setFromObject(obj);
  if (b.isEmpty()) return { w: 0.6, d: 0.6, h: 0.6 };
  return { w: Math.max(0.3, b.max.x - b.min.x), d: Math.max(0.3, b.max.z - b.min.z), h: b.max.y - b.min.y, cx: (b.max.x + b.min.x) / 2, cz: (b.max.z + b.min.z) / 2 };
}

// ── 작업 자리(직무별) ─────────────────────────────────
const STATION_W = { desk: 1.5, console: 1.9, lab_bench: 1.8, workbench: 1.8, drafting: 1.4 };
export const stationWidth = (kind) => STATION_W[kind] ?? 1.5;

/** 자리 꾸미기 — 사람은 자리의 로컬 −z 쪽에 앉아 +z 를 본다. 빈자리는 화면이 꺼져 있다 */
export function stationFurnisher(kind, extras = [], recipes = {}) {
  return (kit, s, e) => {
    s.g.clear();
    const g = s.g, on = !!e;
    const scr = on ? screenMat(e) : kit.m.screenOff;
    let topY = 0.74;
    if (kind === 'console') {
      g.add(P.box(kit, 1.9, 0.7, 0.8, kit.m.device, 0, 0.35, 0, 0.02));
      const deck = P.box(kit, 1.86, 0.06, 0.78, kit.m.chair2, 0, 0.76, 0, 0.01); deck.rotation.x = 0.18; g.add(deck);
      for (let i = 0; i < 16; i++) g.add(P.box(kit, 0.04, 0.03, 0.18, i % 4 === 0 ? kit.m.white : kit.m.metal, -0.8 + i * 0.106, 0.8, 0.12 - Math.floor(i / 8) * 0.0, 0.004));
      for (const sx of [-0.7, 0.7]) { const m = P.monitor(kit, scr, { w: 0.5, h: 0.3 }); m.position.set(sx * 0.6, 0.78, 0.3); m.rotation.y = Math.PI; g.add(m); }
      topY = 0.8;
    } else if (kind === 'lab_bench') {
      g.add(P.box(kit, 1.8, 0.86, 0.75, kit.m.white, 0, 0.43, 0, 0.02), P.box(kit, 1.84, 0.04, 0.79, kit.m.black, 0, 0.88, 0, 0.005));
      g.add(P.box(kit, 1.8, 0.12, 0.03, kit.m.white, 0, 0.96, 0.37, 0.01)); // 낮은 턱 — 사람·도구가 가리지 않게
      for (let i = 0; i < 4; i++) g.add(P.cyl(kit, 0.028, 0.028, 0.12, [kit.m.white, kit.m.box, kit.m.cabinet, kit.m.metal][i], -0.82 + i * 0.07, 0.96, 0.3, 12));
      const m = P.monitor(kit, scr, { w: 0.4, h: 0.26 }); m.position.set(0.6, 0.9, 0.2); m.rotation.y = Math.PI; g.add(m);
      topY = 0.9;
    } else if (kind === 'workbench') {
      g.add(P.box(kit, 1.8, 0.08, 0.8, kit.m.wood, 0, 0.86, 0, 0.01));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(P.box(kit, 0.08, 0.82, 0.08, kit.m.woodDark, sx * 0.82, 0.41, sz * 0.32, 0));
      g.add(P.box(kit, 1.7, 0.04, 0.7, kit.m.woodDark, 0, 0.2, 0, 0));
      const m = P.laptop(kit, scr); m.position.set(0.45, 0.9, 0.0); m.rotation.y = Math.PI; g.add(m);
      topY = 0.9;
    } else if (kind === 'drafting') {
      const top = P.box(kit, 1.4, 0.04, 0.8, kit.m.white, 0, 0.92, 0, 0.01); top.rotation.x = -0.32; g.add(top);
      for (const sx of [-1, 1]) g.add(P.box(kit, 0.05, 0.86, 0.6, kit.m.metal, sx * 0.62, 0.43, 0, 0.01));
      const tb = P.box(kit, 0.42, 0.012, 0.3, kit.m.device, -0.3, 0.95, 0.02, 0.004); tb.rotation.x = -0.32; g.add(tb);
      topY = 0.95;
    } else {
      g.add(P.desk(kit, { w: 1.5, d: 0.75, h: 0.72, legs: 'metal', cabinet: false }));
      for (const sx of [-1, 1]) { const m = P.monitor(kit, scr, { w: 0.52, h: 0.31 }); m.position.set(sx * 0.29, 0.72, 0.16); m.rotation.y = Math.PI + sx * 0.18; g.add(m); }
      g.add(P.box(kit, 0.42, 0.016, 0.13, kit.m.deviceLight, 0, 0.728, -0.12, 0.004));
    }
    // 자리 위 소품(레시피) — 현미경·미디 건반 같은 직무 도구
    extras.slice(0, 2).forEach((name, i) => {
      const p = makeProp(kit, name, recipes, i); if (!p) return;
      p.position.set(i ? 0.55 : -0.45, topY, kind === 'lab_bench' ? 0.05 : -0.02); p.rotation.y = Math.PI; g.add(p);
    });
    const ch = lightChair(kit, kit.m.chair);
    if (kind === 'lab_bench') ch.scale.set(1, 1.18, 1);
    if (on) { ch.position.set(stationWidth(kind) / 2 + 0.05, 0, -0.95); ch.rotation.y = -0.7; } else ch.position.set(0, 0, -0.62);
    g.add(ch);
  };
}

// ── 기능 자리(뜻은 고정, 모습은 도메인) ──────────────────
/** 회차 보드 */
export function boardForm(kit, form, refs) {
  refs.board = liveTex(1024, 560);
  const g = new THREE.Group(), dark = form === 'dark_board';
  const frame = dark ? kit.m.device : kit.m.frame;
  const b = new THREE.Group(); b.position.y = 1.45; g.add(b);
  b.add(P.box(kit, 2.1, 1.2, 0.05, frame, 0, 0, 0, 0.01));
  const sc = plane(refs.board.t, 2.0, 1.1, { roughness: 0.45 }); sc.position.z = 0.03; b.add(sc);
  if (dark) { for (let i = 0; i < 4; i++) b.add(P.box(kit, 0.06, 0.06, 0.04, [kit.m.white, kit.m.box, kit.m.metal, kit.m.cabinet][i], -0.9 + i * 0.12, 0.66, 0.02, 0.01)); }
  if (form === 'easel_board') { for (const sx of [-1, 1]) { const l = P.box(kit, 0.05, 2.3, 0.05, kit.m.wood, sx * 0.85, 1.1, -0.15, 0); l.rotation.x = 0.08; g.add(l); } }
  else for (const sx of [-1, 1]) g.add(P.box(kit, 0.05, 2.1, 0.05, kit.m.metal, sx * 1.02, 1.05, -0.06, 0), P.box(kit, 0.5, 0.04, 0.08, kit.m.metal, sx * 1.02, 0.02, -0.06, 0));
  return tag(g, 'work/week');
}

/** AI 연결(전력) — 불빛은 refs.led 재질 하나로 켜고 끈다 */
export function powerForm(kit, form, label, refs, recipes) {
  refs.led = new THREE.MeshStandardMaterial({ color: m3('off'), roughness: 0.6 });
  refs.serverName = label || 'AI 연결';
  const g = new THREE.Group(), led = refs.led;
  const lights = (grp, n, x, y0, z, dy = 0.2) => { for (let i = 0; i < n; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.01), led); l.position.set(x, y0 + i * dy, z); grp.add(l); } };
  if (recipes?.[form]) g.add(buildRecipe(kit, recipes[form], led));
  else if (form === 'amp_rack') {
    for (let i = 0; i < 4; i++) { g.add(P.box(kit, 0.9, 0.36, 0.5, i % 2 ? kit.m.black : kit.m.device, 0, 0.2 + i * 0.38, 0, 0.02)); for (let k = 0; k < 4; k++) { const kn = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 12), kit.m.metal); kn.rotation.x = Math.PI / 2; kn.position.set(-0.3 + k * 0.15, 0.2 + i * 0.38, 0.26); g.add(kn); } const l = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), led); l.position.set(0.36, 0.2 + i * 0.38, 0.26); g.add(l); }
  } else if (form === 'compute_tower') {
    for (const sx of [-0.3, 0.3]) { g.add(P.box(kit, 0.5, 1.9, 0.8, kit.m.device, sx, 0.95, 0, 0.02)); lights(g, 8, sx + 0.15, 0.3, 0.405); }
  } else if (form === 'router') {
    g.add(P.box(kit, 0.9, 0.75, 0.45, kit.m.wood, 0, 0.375, 0, 0.02), P.box(kit, 0.4, 0.08, 0.26, kit.m.black, -0.1, 0.8, 0, 0.02), P.box(kit, 0.18, 0.3, 0.22, kit.m.device, 0.25, 0.9, 0, 0.02));
    lights(g, 4, -0.2, 0.86, 0.135, 0); for (let i = 0; i < 4; i++) g.children.at(-1 - i).position.x = -0.25 + i * 0.07;
  } else {
    g.add(P.box(kit, 0.9, 1.9, 0.9, kit.m.chair2, 0, 0.95, 0, 0.01)); lights(g, 8, 0.25, 0.3, 0.455);
  }
  refs.serverSign = liveTex(1024, 384);
  const sg = plane(refs.serverSign.t, 1.1, 0.41); sg.position.set(0, 2.3, 0.1); g.add(facing(sg));
  return tag(g, 'settings/power');
}

/** 회사 지식 — 선반 + 쌓이는 물건(책·레코드·바인더·시료 서랍) */
export function knowledgeForm(kit, form, label, refs) {
  refs.libName = label || '책장';
  const g = new THREE.Group(), SH = 1.9, W = 1.6, SM = form === 'record_shelf' ? kit.m.wood : kit.m.shelf;
  g.add(P.box(kit, W, SH, 0.03, SM, 0, SH / 2, -0.17, 0), P.box(kit, 0.04, SH, 0.36, SM, -W / 2 + 0.02, SH / 2, 0, 0), P.box(kit, 0.04, SH, 0.36, SM, W / 2 - 0.02, SH / 2, 0, 0), P.box(kit, W, 0.04, 0.36, SM, 0, SH - 0.02, 0, 0));
  for (let r = 0; r < 4; r++) g.add(P.box(kit, W - 0.06, 0.03, 0.34, SM, 0, 0.1 + r * 0.45, 0, 0));
  refs.books = new THREE.Group(); g.add(refs.books);
  refs.libSign = liveTex(1024, 384);
  const sg = plane(refs.libSign.t, 1.1, 0.41); sg.position.set(0, SH + 0.32, 0.05); g.add(facing(sg));
  const per = form === 'record_shelf' ? 22 : form === 'sample_drawers' ? 6 : 10;
  const item = { record_shelf: [0.02, 0.32, 0.31], binder_cabinet: [0.09, 0.32, 0.28], sample_drawers: [0.22, 0.12, 0.28] }[form] ?? [0.075, 0.36, 0.27];
  refs.bookItem = item;
  return { group: tag(g, 'company/library'), bookAt: (i) => { if (i >= per * 4) return null; const row = Math.floor(i / per), j = i % per; const step = (W - 0.16) / per; return [-W / 2 + 0.1 + j * step + item[0] / 2, 0.12 + row * 0.45 + item[1] / 2, 0.02]; } };
}

/** 마일스톤 — 트로피·골드 레코드·명판 */
export function milestoneForm(kit, form, refs) {
  const g = new THREE.Group();
  g.add(P.box(kit, 1.5, 0.9, 0.45, kit.m.white, 0, 0.45, 0, 0.02));
  if (form !== 'trophy') g.add(P.box(kit, 1.5, 1.2, 0.04, kit.m.black, 0, 1.55, -0.2, 0.01));
  refs.trophies = new THREE.Group(); g.add(refs.trophies);
  const at = (i) => (i < 4 ? (form === 'trophy' ? [-0.54 + i * 0.36, 0.9, 0] : [-0.5 + (i % 2) * 1.0 - 0.0, 1.85 - Math.floor(i / 2) * 0.55, -0.16]) : null);
  const make = (k) => {
    if (form === 'gold_record') { const r = new THREE.Group(); r.add(P.box(k, 0.46, 0.46, 0.03, k.m.device, 0, 0, 0, 0.005)); const d = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.012, 32), k.m.brass); d.rotation.x = Math.PI / 2; d.position.z = 0.02; r.add(d); return r; }
    if (form === 'plaque') { const r = new THREE.Group(); r.add(P.box(k, 0.42, 0.5, 0.03, k.m.woodDark, 0, 0, 0, 0.005), P.box(k, 0.3, 0.2, 0.01, k.m.brass, 0, 0.06, 0.02, 0.003)); return r; }
    return P.trophy(k, 'brass', 1.6);
  };
  return { group: tag(g, 'company/library'), trophyAt: at, trophyMake: make };
}

/** 결정 대기(결재함) — 대표 자리의 모습은 도메인 */
export function decisionsForm(kit, form, label, refs) {
  refs.ceoName = label || '대표 자리';
  const g = new THREE.Group();
  if (form === 'console') {
    g.add(P.box(kit, 2.2, 0.72, 0.85, kit.m.device, 0, 0.36, 0, 0.02));
    const deck = P.box(kit, 2.16, 0.06, 0.82, kit.m.chair2, 0, 0.76, 0, 0.01); deck.rotation.x = 0.16; g.add(deck);
    for (let i = 0; i < 20; i++) g.add(P.box(kit, 0.04, 0.03, 0.2, kit.m.metal, -0.95 + i * 0.1, 0.8, 0.1, 0.004));
  } else if (form === 'podium') {
    g.add(P.box(kit, 1.6, 0.9, 0.7, kit.m.wood, 0, 0.45, 0, 0.03), P.box(kit, 1.7, 0.05, 0.8, kit.m.woodDark, 0, 0.92, 0, 0.01));
  } else {
    g.add(P.box(kit, 2.2, 0.06, 0.95, kit.m.woodDark, 0, 0.75, 0, 0.02), P.box(kit, 2.0, 0.68, 0.06, kit.m.woodDark, 0, 0.36, 0.42, 0.01));
    for (const s of [-1, 1]) g.add(P.box(kit, 0.08, 0.72, 0.85, kit.m.woodDark, s * 1.04, 0.36, 0, 0.01));
  }
  const boss = lightChair(kit, kit.m.black); boss.position.set(0, 0, -0.85); boss.scale.setScalar(1.12); g.add(boss);
  const tray = new THREE.Group(); tray.position.set(-0.6, form === 'podium' ? 0.95 : 0.8, 0.05); g.add(tray);
  tray.add(P.box(kit, 0.42, 0.06, 0.32, kit.m.decide, 0, 0.03, 0, 0.01)); // 결재함 — 무대에서 인주색은 이 한 점(대표 몫)
  refs.papers = new THREE.Group(); tray.add(refs.papers);
  refs.badge = liveTex(128, 128);
  const badge = uiSprite(refs.badge.t); badge.scale.setScalar(0.36); badge.position.set(0.1, 0.42, 0); tray.add(badge);
  refs.ceoSign = liveTex(1024, 384);
  const sg = plane(refs.ceoSign.t, 1.0, 0.37); sg.position.set(0.4, 1.35, 0.1); g.add(facing(sg));
  return tag(g, 'decisions');
}
