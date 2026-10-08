// 시간대 하늘 — 컴퓨터 시계에 맞춰 바깥 공기색(도시 가장자리가 녹아드는 색) · 별 · 해(밤엔 달) · 실내 조명 · 밤 정도가 함께 바뀐다.
// 05시 새벽 → 07 해 뜰 녘 → 10 아침 → 14 오후 → 17 늦은 오후 → 19 노을 → 20 땅거미 → 22 밤. 키 사이는 부드럽게 섞는다.
// 도시(city.js) · 건물 외벽(exterior.js)은 onApply 로 받아 창 불빛 · 가로등 · 밤 어둡기를 맞춘다.
// 점검용: ?hour=5 는 그 시각으로 고정, ?hour=demo 는 하루를 48초에 돌려 본다.
import * as THREE from 'three';
import { canvas, tex, rng } from './tex.js';

// sky: 하늘 [위, 가운데, 지평선](가운데 · 지평선을 섞어 공기색) · win: 창 불빛 [색, 켜진 비율, 진하기] · stars: 별 · night: 밤 정도(0 낮 … 1 밤)
// sun: 해(밤엔 달) [색, 세기, 고도°, 방위°(− 왼쪽 · + 오른쪽, 0 = 창 뒤 정면)] · fill: 실내 조명 · 보조광 [색, 세기] · hemi: [하늘색, 땅색, 세기]
const NIGHT = { sky: ['#0A1230', '#16234A', '#2B3A66'], win: ['#FFD27A', 0.42, 0.95], stars: 1,
  sun: ['#AFC4FF', 0.45, 38, 25], fill: ['#FFE3BD', 1.35], hemi: ['#FFE9CC', '#4A4250', 0.9], env: 0.38, exp: 0.95, night: 1 };
const KEYS = [
  { h: 0, ...NIGHT },
  { h: 4, ...NIGHT },
  { h: 5, sky: ['#27325E', '#6F6A9E', '#E9A98F'], win: ['#FFD9A0', 0.18, 0.8], stars: 0.35,
    sun: ['#FFB28C', 0.9, 4, -45], fill: ['#D8DCF5', 1.1], hemi: ['#C9CBEA', '#6B6070', 0.8], env: 0.48, exp: 0.97, night: 0.7 },
  { h: 6.8, sky: ['#4F7DC0', '#B7A3B8', '#FFAE6C'], win: ['#FFFFFF', 0.4, 0.3], stars: 0,
    sun: ['#FFC89A', 2.3, 12, -40], fill: ['#EEF1FF', 1.2], hemi: ['#E6ECFA', '#857A70', 0.82], env: 0.6, exp: 1.0, night: 0.12 },
  { h: 10, sky: ['#4A8ED8', '#9FC6E8', '#DCEAF2'], win: ['#FFFFFF', 0.45, 0.35], stars: 0,
    sun: ['#FFF1DE', 3.0, 30, -30], fill: ['#EEF3FF', 1.25], hemi: ['#F2F6FF', '#8C8378', 0.85], env: 0.65, exp: 1.0, night: 0 },
  { h: 14, sky: ['#3B7CCB', '#92BCE4', '#E6ECEA'], win: ['#FFFFFF', 0.45, 0.3], stars: 0,
    sun: ['#FFE6BE', 3.3, 42, 20], fill: ['#FFF7EA', 1.28], hemi: ['#F5F4EE', '#8C8378', 0.88], env: 0.68, exp: 1.0, night: 0 },
  { h: 17, sky: ['#4E82C2', '#D2B8A4', '#FFB46E'], win: ['#FFF2D8', 0.45, 0.4], stars: 0,
    sun: ['#FFC98A', 2.8, 18, 30], fill: ['#FFF1DE', 1.2], hemi: ['#FBEEDC', '#8C7C6C', 0.85], env: 0.62, exp: 1.0, night: 0.05 },
  { h: 18.8, sky: ['#3E4C86', '#C27A88', '#FFA866'], win: ['#FFD58A', 0.22, 0.85], stars: 0.05,
    sun: ['#FF9C62', 1.6, 4, 40], fill: ['#FFE4C6', 1.2], hemi: ['#F6D9C8', '#6E5C60', 0.85], env: 0.5, exp: 1.0, night: 0.45 },
  { h: 20.2, sky: ['#141E44', '#2E3C6E', '#7A6A9A'], win: ['#FFD27A', 0.36, 0.95], stars: 0.6,
    sun: ['#B8C4FF', 0.5, 30, 25], fill: ['#FFE3BD', 1.3], hemi: ['#FFE6C8', '#4C4454', 0.9], env: 0.4, exp: 0.96, night: 0.88 },
  { h: 22, ...NIGHT },
  { h: 24, ...NIGHT },
];

/** 시간대 이름 — 화면 글자 대비(밤엔 밝은 글자)에도 쓴다 */
export function periodOf(h) {
  if (h >= 4 && h < 7) return { key: 'dawn', label: '새벽', dark: h < 5.6 };
  if (h >= 7 && h < 12) return { key: 'morning', label: '아침', dark: false };
  if (h >= 12 && h < 17) return { key: 'afternoon', label: '오후', dark: false };
  if (h >= 17 && h < 20) return { key: 'evening', label: '저녁', dark: h >= 19.4 };
  return { key: 'night', label: '밤', dark: true };
}

const C = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
const N = (a, b, t) => a + (b - a) * t;
const hex = (c) => `#${c.getHexString()}`;

/** 그 시각의 하늘 — 앞뒤 키를 부드럽게 섞는다 */
function sample(h) {
  h = ((h % 24) + 24) % 24;
  let i = 0; while (KEYS[i + 1].h <= h && i < KEYS.length - 2) i++;
  const a = KEYS[i], b = KEYS[i + 1], x = (h - a.h) / (b.h - a.h), t = x * x * (3 - 2 * x);
  return {
    sky: a.sky.map((c, k) => C(c, b.sky[k], t)),
    win: [C(a.win[0], b.win[0], t), N(a.win[1], b.win[1], t), N(a.win[2], b.win[2], t)],
    stars: N(a.stars, b.stars, t),
    sun: [C(a.sun[0], b.sun[0], t), N(a.sun[1], b.sun[1], t), N(a.sun[2], b.sun[2], t), N(a.sun[3], b.sun[3], t)],
    fill: [C(a.fill[0], b.fill[0], t), N(a.fill[1], b.fill[1], t)],
    hemi: [C(a.hemi[0], b.hemi[0], t), C(a.hemi[1], b.hemi[1], t), N(a.hemi[2], b.hemi[2], t)],
    env: N(a.env, b.env, t), exp: N(a.exp, b.exp, t), night: N(a.night, b.night, t),
    get edge() { return this.sky[1].clone().lerp(this.sky[2], 0.55); }, // 도시 가장자리가 녹아드는 공기색 = 배경
  };
}

/** 배경 — 도시 밖 공기색 한 가지 + 밤이면 별(가장자리가 같은 색으로 녹아들게 바탕은 한 색) */
function drawBackground(g, w, h, s) {
  g.fillStyle = hex(s.edge); g.fillRect(0, 0, w, h);
  if (s.stars < 0.02) return;
  const r = rng(31); g.fillStyle = '#FFFFFF';
  for (let i = 0; i < 220; i++) { const x = r() * w, y = r() * h, z = r(); g.globalAlpha = s.stars * (0.2 + z * 0.6); g.fillRect(x, y, z > 0.88 ? 2 : 1, z > 0.88 ? 2 : 1); }
  g.globalAlpha = 1;
}

const parseHour = () => {
  const q = new URLSearchParams(location.search).get('hour');
  if (q === 'demo') return 'demo';
  const n = Number(q); return q !== null && q !== '' && Number.isFinite(n) ? ((n % 24) + 24) % 24 : null;
};
const clockHour = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; };

/**
 * 시간대 하늘을 무대에 건다. 배경을 만들고, 받은 빛(sun · fill · hemi)을 시각에 맞춘다.
 * light: 레이아웃의 해 설정(dist · half · color). 해는 aim() 으로 카메라가 보는 곳을 따라간다(그림자가 도시 어디서나 맞게).
 * 반환: { hour, period, state, set(h), aim(center, h), onChange(fn), onApply(fn), dispose() }
 */
export function createSky(stage, { light, sun, fill, hemi }) {
  const { scene, renderer, THREE: T } = stage;
  const bgC = canvas(1024, 640, () => {}), bg = tex(bgC);
  scene.background = bg;
  const tgt = new T.Vector3(...(light.target ?? [0, 0, 0])), dir = new T.Vector3(0, 1, 0), D2R = Math.PI / 180;
  const tint = light.color ? new T.Color(light.color) : null; // 설계도의 공간 분위기(따뜻한 · 차가운 빛)는 시간대 위에 살짝 얹는다
  const fixed = parseHour(), listeners = new Set(), appliers = new Set();
  let drawn = null, hour = 0, period = null, timer = 0, state = null, half = light.half ?? 14;

  function place() {
    sun.position.copy(tgt).addScaledVector(dir, light.dist); sun.target.position.copy(tgt);
    const c = sun.shadow.camera;
    if (c.right !== half) { Object.assign(c, { left: -half, right: half, top: half, bottom: -half, near: 1, far: light.dist * 2 + half * 2 }); c.updateProjectionMatrix(); }
  }
  function set(h) {
    hour = ((h % 24) + 24) % 24;
    const s = state = sample(hour);
    const [sc, si, el, az] = s.sun;
    dir.set(Math.sin(az * D2R) * Math.cos(el * D2R), Math.sin(el * D2R), -Math.cos(az * D2R) * Math.cos(el * D2R));
    sun.color.copy(sc); sun.intensity = si; place();
    fill.color.copy(s.fill[0]); fill.intensity = s.fill[1];
    if (tint) { sun.color.lerp(tint, 0.3); fill.color.lerp(tint, 0.25); }
    hemi.color.copy(s.hemi[0]); hemi.groundColor.copy(s.hemi[1]); hemi.intensity = s.hemi[2];
    scene.environmentIntensity = s.env; renderer.toneMappingExposure = s.exp;
    // 배경은 2분(데모는 10분) 단위로만 다시 그린다 — 빛은 매번 바꿔도 싸다
    const step = fixed === 'demo' ? 1 / 6 : 1 / 30, q = Math.round(hour / step);
    if (q !== drawn) { drawn = q; drawBackground(bgC.getContext('2d'), bgC.width, bgC.height, s); bg.needsUpdate = true; }
    for (const fn of appliers) fn(s);
    const p = periodOf(hour);
    if (p.key !== period?.key || p.dark !== period?.dark) { period = p; for (const fn of listeners) fn(p); }
  }

  if (fixed === 'demo') { const h0 = clockHour(); stage.onUpdate((t) => set(h0 + t * 0.5)); }
  else if (fixed !== null) set(fixed);
  else { set(clockHour()); timer = setInterval(() => set(clockHour()), 30000); }
  return {
    get hour() { return hour; }, get period() { return period; }, get state() { return state; },
    set,
    /** 해가 비추는 곳 · 그림자 범위 — 카메라가 보는 곳(center)과 보이는 크기(h)를 따라간다 */
    aim(center, h) { tgt.set(center.x, center.y ?? 0, center.z); half = Math.round(Math.min(110, Math.max(light.half ?? 14, h * 0.85))); place(); },
    onChange(fn) { listeners.add(fn); if (period) fn(period); return () => listeners.delete(fn); },
    onApply(fn) { appliers.add(fn); if (state) fn(state); return () => appliers.delete(fn); },
    dispose() { clearInterval(timer); listeners.clear(); appliers.clear(); },
  };
}
