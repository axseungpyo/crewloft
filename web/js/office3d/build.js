// 3D 사무실 공용 재료 — 텍스처·재질·가구 조각·책상 자리. 모든 성장 단계(layouts/*)가 함께 쓴다.
// 시설은 단계마다 모습만 다르고 뜻은 같다: 회차 보드 · 결재함(결정 대기) · AI 연결 표시 · 회사 지식 책장 · 마일스톤 트로피
// 재질 · 색은 팔레트 하나(palette.js — base.css --m3-* 토큰)에서, 떠 있는 표지는 2D 부품 모양(면 · 선 · 모서리 · 글꼴, 지금 테마)으로 그린다(브랜드 B 4단계)
import * as THREE from 'three';
import * as P from './props.js';
import { tex, screenCanvas, fonts } from './tex.js';
import { m3, ui, neutral, matte, onTheme, paletteMaterials, bookShades } from './palette.js';
import { UI_LAYER, uiObjects } from './stage.js';

/** 무광 재질 — 레이아웃에 남은 색 값도 팔레트 규칙으로 받는다(채도를 누르고 · 거칠기 0.7 이상 · 금속감 0.15 이하). 인주색 · 황동은 kit.m.decide · kit.m.brass로 */
export const S = (color, roughness = 0.8, o = {}) => matte(neutral(color) ?? color, Math.max(roughness, 0.7), { ...o, metalness: Math.min(o.metalness ?? 0, 0.15) });
export const FONT = 'Pretendard Variable'; // 2D와 같은 글꼴(결정 81) — web/index.html에서 불러온다
/** 회차 보드 칸 색 — 2D 상태 색과 같은 토큰(시작 전 · 일하는 중 · 대표 확인 · 끝 · 멈춤 · 문제). 되묻는 중은 대표 몫이라 인주색 */
const FLOW_TONE = { done: 'ok', active: 'info', me: 'decide', issue: 'bad', quota: 'pause', asked: 'decide', asleep: 'pause' };

// ── 텍스처 ──────────────────────────────────────────
/** 다시 그릴 수 있는 캔버스 텍스처. 마지막 그림을 기억해 두었다가 화면 테마가 바뀌면 다시 그린다(표지가 2D 토큰을 따라가게) */
export function liveTex(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  let last = null;
  const paint = () => { if (!last) return; const g = c.getContext('2d'); g.clearRect(0, 0, w, h); last(g, w, h); t.needsUpdate = true; };
  const off = onTheme(paint); t.addEventListener('dispose', off);
  return { t, draw(fn) { last = fn; paint(); } };
}

// ── 2D 부품 모양(브랜드 B) — 카드 · 알약 · 배지. k = 캔버스 px ÷ 화면 px(표지 글자가 2D 카드 제목 16px에 맞게) ──
/** 카드 — 면(--surface) · 선(--line-2) · 모서리 12 */
export function card(g, w, h, { k = 7, bg = ui('surface'), line = ui('line-2'), r = 12, dash = null } = {}) {
  const lw = Math.max(2, Math.round(k * 1.2));
  g.beginPath(); g.roundRect(lw / 2, lw / 2, w - lw, h - lw, Math.min(r * k, (h - lw) / 2));
  g.fillStyle = bg; g.fill();
  if (line) { g.strokeStyle = line; g.lineWidth = lw; if (dash) g.setLineDash(dash.map((d) => d * k)); g.stroke(); g.setLineDash([]); }
}
const TONE = {
  plain: () => ({ bg: ui('surface'), line: ui('line-2'), ink: ui('ink'), sub: ui('ink-2') }),
  muted: () => ({ bg: ui('surface-2'), line: ui('line'), ink: ui('ink-2'), sub: ui('ink-3') }),
  accent: () => ({ bg: ui('accent'), line: null, ink: ui('on-accent'), sub: ui('on-accent') }), // 여럿 중 지금 보는 것(층 표지)
  decide: () => ({ bg: ui('surface'), line: ui('decide-line'), ink: ui('ink'), sub: ui('decide-text') }), // 대표 몫이 있을 때만
  ok: () => ({ bg: ui('surface'), line: ui('line-2'), ink: ui('ink'), sub: ui('ok-text') }),
  bad: () => ({ bg: ui('surface'), line: ui('bad-line'), ink: ui('ink'), sub: ui('bad-text') }),
};
/** 시설 · 자리 표지 — 2D 카드. tone: plain(기본) · muted · accent · decide · ok · bad */
export const drawPlate = (text, sub, tone = 'plain') => (g, w, h) => {
  const T = (TONE[tone] ?? TONE.plain)(), k = h / 52;
  card(g, w, h, { k, bg: T.bg, line: T.line });
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = T.ink; g.font = `800 ${Math.round(h * 0.3)}px "${FONT}"`; g.fillText(text, w / 2, sub ? h * 0.4 : h * 0.52);
  if (sub) { g.fillStyle = T.sub; g.font = `600 ${Math.round(h * 0.155)}px "${FONT}"`; g.fillText(sub, w / 2, h * 0.75); }
};
export const drawTeam = (t, count) => (g, w, h) => {
  card(g, w, h, { k: h / 56 });
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillStyle = ui('ink'); g.font = `800 92px "${FONT}"`; g.fillText(t.name, 64, 102);
  g.fillStyle = count ? ui('info-text') : ui('ink-2'); g.font = `600 50px "${FONT}"`; g.fillText(count ? `${count}명 일하는 중` : '아직 없는 팀 · 채용하면 열려요', 66, 190);
};
/** 회차 보드(시설 이름은 비유 그대로, B2 ①) — 콘텐츠 회차는 7단계, 블록 회차는 이번 주 일 띠(P2 결정 6, 항목에 block: true).
 * 진행 낱말은 2D 사무실 제목 아래와 같다: '할 일 3개 중 0개 끝' · '7단계 중 2단계 끝' */
export const drawBoard = (label, flow) => (g, w, h) => {
  const blocks = flow[0]?.block === true, done = flow.filter((f) => f.state === 'done').length;
  g.fillStyle = ui('surface'); g.fillRect(0, 0, w, h);
  g.textBaseline = 'alphabetic';
  g.fillStyle = ui('ink'); g.font = `800 50px "${FONT}"`; g.fillText(label ?? '아직 이번 주 일이 없어요', 44, 86);
  g.fillStyle = ui('ink-2'); g.font = `600 32px "${FONT}"`; g.textAlign = 'right';
  g.fillText(blocks ? `할 일 ${flow.length}개 중 ${done}개 끝` : `${flow.length || 7}단계 중 ${done}단계 끝`, w - 44, 84); g.textAlign = 'left';
  const n = Math.max(flow.length, 1), col = Math.min(blocks ? 236 : 136, (w - 88) / n), bw = col - 16;
  const fit = (text, max, size, weight) => { let s = size; do { g.font = `${weight} ${s}px "${FONT}"`; s -= 2; } while (g.measureText(text).width > max && s > 16); };
  flow.forEach((f, i) => {
    const x = 44 + i * col, y = 150, tone = FLOW_TONE[f.state];
    g.beginPath(); g.roundRect(x, y, bw, 150, 16);
    if (tone) { g.fillStyle = ui(tone); g.fill(); } else { g.fillStyle = ui('surface-2'); g.fill(); g.strokeStyle = ui('line-2'); g.lineWidth = 3; g.stroke(); }
    g.fillStyle = tone ? (tone === 'decide' ? ui('on-decide') : ui('on-strong')) : ui('ink-2'); g.textAlign = 'center';
    fit(f.label, bw - 16, 30, 700); g.fillText(f.label, x + bw / 2, y + 62);
    const who = (f.who ?? []).join('·') || '—'; fit(who, bw - 16, 24, 500); g.fillText(who, x + bw / 2, y + 102);
    if (f.state === 'asked' || f.state === 'asleep') { g.font = `800 22px "${FONT}"`; g.fillText(f.state === 'asked' ? '? 되묻는 중' : 'z 잠듦', x + bw / 2, y + 134); } // 색만이 아니라 글자로도
    else if (blocks && f.confirm > 0) { g.font = `700 22px "${FONT}"`; g.fillText(`확인 ${f.confirm}건`, x + bw / 2, y + 134); }
    else if (blocks && f.tasks > 0) { g.font = `500 22px "${FONT}"`; g.fillText(`${f.done}/${f.tasks}`, x + bw / 2, y + 134); } // 좁은 칸이라 분수(brand.md §4 숫자 규칙의 예외)
    g.textAlign = 'left';
  });
  g.fillStyle = ui('ink-3'); g.font = `500 26px "${FONT}"`; g.fillText(blocks ? '이번 주 일 — 실제 진행과 같이 움직여요' : '회차 보드 — 실제 진행과 같이 움직여요', 44, 380);
};
/** 결재함 위 숫자 — 2D 결정함 배지와 같은 인주색 */
export const drawBadge = (n) => (g) => { if (!n) return; g.fillStyle = ui('decide'); g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill(); g.fillStyle = ui('on-decide'); g.font = `800 72px "${FONT}"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(Math.min(n, 99)), 64, 70); };
/** 입구 · 옥상 회사 간판 — 벽에 칠한 것이라 화면 테마가 아니라 재질 팔레트를 따른다 */
export const drawLogo = (name) => (g, w, h) => {
  g.fillStyle = m3('wall-2'); g.fillRect(0, 0, w, h);
  g.fillStyle = m3('dark'); g.beginPath(); g.roundRect(w / 2 - 70, 90, 140, 140, 32); g.fill();
  g.fillStyle = m3('light'); g.font = `800 92px "${FONT}"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText((name || '?')[0], w / 2, 164);
  g.fillStyle = m3('dark'); g.font = `700 ${name.length > 8 ? 70 : 96}px "${FONT}"`; g.fillText(name || '내 회사', w / 2, 330);
  g.fillStyle = m3('mid-2'); g.font = `500 34px "${FONT}"`; g.fillText('본사', w / 2, 410);
};
export function makeKit() {
  return { r: 0.008, seg: 28, frameW: 0.07, books: bookShades(), m: paletteMaterials() };
}
/** 그림 판 — 기본은 2D 부품처럼 그린 표지 · 보드 화면이라 빛 · 반사를 받지 않는 재질(MeshBasic)로 그림 그대로 보인다.
 * 벽에 칠한 간판처럼 재질인 그림은 { ui: false } */
export const plane = (map, w, h, { ui = true, ...o } = {}) => {
  const geo = new THREE.PlaneGeometry(w, h);
  if (!ui) return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, roughness: 0.5, ...o }));
  const { roughness, metalness, ...rest } = o;
  const m = new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, ...rest }); m.color.setScalar(UI_GLOW); return new THREE.Mesh(geo, m); // alphaTest — 카드 둥근 모서리 밖은 비운다
};
export const lightChair = (kit, seat) => { const g = new THREE.Group(); g.add(P.box(kit, 0.5, 0.08, 0.48, seat, 0, 0.47, 0, 0.03), P.box(kit, 0.48, 0.52, 0.07, seat, 0, 0.8, -0.24, 0.03), P.cyl(kit, 0.03, 0.03, 0.4, 'metal', 0, 0.24, 0, 8), P.cyl(kit, 0.3, 0.3, 0.035, 'black', 0, 0.03, 0, 20)); return g; };
export const tag = (o, go) => { o.traverse((x) => { x.userData.go = go; }); return o; };
/** 사무실 바깥 벽 묶음 — 카메라 쪽이면 낮아진다(exterior.cutawayWalls). n: 바깥 방향 [nx, nz]. 묶음은 바닥 높이 0 기준으로 눌린다 */
export const cutaway = (parent, n, ...objs) => { const w = new THREE.Group(); w.userData.cutaway = n; if (objs.length) w.add(...objs); parent.add(w); return w; };
/** 떠 있는 카드 · 표지 — 무대가 매 장면 카메라 쪽으로 돌려 세운다(stage.faceCamera).
 * 표지는 plane()이 만든 빛을 받지 않는 재질이라 밤 조명 · 실내 불빛에 물들지 않는다(브랜드 B 4단계).
 * 화면 전체 톤 매핑(ACES, OutputPass)을 지나면 어두워지므로 UI_GLOW 배로 밝힌다 — 흰 면이 흰 카드로 읽히는 값 */
export const UI_GLOW = 1.5;
export const facing = (o) => { o.userData.faceCamera = true; return o; };
/** 떠 있는 숫자 · 레벨 표(스프라이트) — 늘 맨 위에 보이는 표지라 UI_LAYER 로 화면 위에 덧그린다(stage.drawUi). 2D 배지와 같은 색 그대로 */
export const uiSprite = (map, o = {}) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, depthWrite: false, toneMapped: false, fog: false, ...o }));
  s.layers.set(UI_LAYER); uiObjects.add(s); s.material.addEventListener('dispose', () => uiObjects.delete(s));
  return s;
};

export function glassWalls(kit, g, segs) {
  for (const [x0, z0, x1, z1] of segs) {
    const L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(z1 - z0, x1 - x0), w = new THREE.Group(), n = Math.max(1, Math.round(L / 1.25));
    w.add(P.box(kit, L, 2.75, 0.025, kit.m.partition, L / 2, 1.375, 0, 0), P.box(kit, L, 0.26, 0.03, kit.m.frost, L / 2, 1.2, 0, 0), P.box(kit, L, 0.05, 0.06, kit.m.frame, L / 2, 2.77, 0, 0));
    for (let i = 0; i <= n; i++) w.add(P.box(kit, 0.05, 2.75, 0.06, kit.m.frame, (L * i) / n, 1.375, 0, 0));
    w.position.set(x0, 0, z0); w.rotation.y = -a; g.add(w);
  }
}


/** 켜진 모니터 화면 — 무채색 화면 그림(팀 색 없음). 디자이너는 시안 칸 */
export function screenMat(e) {
  const map = tex(screenCanvas({ bg: m3('light'), side: m3('light-2'), ink: m3('mid-2'), accent: m3('dark'), swatches: bookShades(), seed: (e?.id.length ?? 1) + 3, kind: e?.role === 'designer' ? 'design' : 'doc' }));
  return new THREE.MeshStandardMaterial({ map, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.85, roughness: 0.6 });
}

/** 책상 한 자리 — 일하는 자리는 모니터가 켜지고 의자가 옆으로 빠진다. 빈자리는 모니터가 꺼져 있다 */
export function furnishSlot(kit, s, e) {
  if (s.furnish) return s.furnish(kit, s, e); // 설계도로 지은 자리(콘솔·실험대 등)
  s.g.clear();
  const g = s.g, occupied = !!e;
  const scr = occupied ? screenMat(e) : kit.m.screenOff;
  const mons = s.monitors ?? 2;
  for (let i = 0; i < mons; i++) { const sx = mons === 1 ? 0 : i ? 1 : -1; const mon = P.monitor(kit, scr, { w: 0.52, h: 0.31 }); mon.position.set(sx * 0.29, 0.72, 0.16); mon.rotation.y = Math.PI + sx * 0.18; g.add(mon); }
  g.add(P.box(kit, 0.42, 0.016, 0.13, kit.m.deviceLight, 0, 0.728, -0.12, 0.004));
  const ch = lightChair(kit, kit.m.chair);
  if (occupied) { ch.position.set(0.78, 0, -0.95); ch.rotation.y = -0.7; const mg = P.mug(kit); mg.position.set(-0.6, 0.72, -0.1); g.add(mg); } else ch.position.set(0, 0, -0.6);
  g.add(ch);
}

/** 부서 책상 섬(앞줄 3 + 뒷줄 3) — 앞줄 가운데부터 채운다(앞줄은 대표 쪽을 본다) */
export function teamSlots(team, parent, { cols = [0, -1.55, 1.55], rows = 2 } = {}) {
  const out = [];
  for (let row = 0; row < rows; row++) for (const dx of cols) {
    const g = new THREE.Group(); g.position.set(team.cx + dx, 0, team.cz + row * 0.75); g.rotation.y = row ? Math.PI : 0; parent.add(g);
    out.push({ team, g, yaw: g.rotation.y, emp: null });
  }
  return out;
}

/** 그림자 전용 천장 — 해가 창으로만 들어오게. AO 계산 때는 숨긴다(casters) */
export function ceilingCaster(w, d, y) {
  const c = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })); c.position.y = y; c.castShadow = true; return c;
}
