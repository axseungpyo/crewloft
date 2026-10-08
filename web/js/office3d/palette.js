// 3D 재질 팔레트 하나(결정 81 · brand.md §3-4, 브랜드 B 4단계) — 앱 · 홈 · 온보딩 3D가 모두 이 한 벌을 쓴다.
// 색은 web/css/base.css의 --m3-* 토큰에서 읽는다(3D 코드는 색 상수를 갖지 않는다). 테마와 상관없이 한 벌이고, 밤 · 낮은 조명(sky.js)이 바꾼다.
// 규칙: 무광 기본(거칠기 높게 · 금속감 거의 없음), 광택은 마스코트(kit.js vinyl)만. 채도는 두 곳 — 결재함 = 인주색, 레벨 표 · 트로피 = 황동.
// 나머지는 무채색 + 식물 초록 하나. 설계도(AI)가 준 색은 채도를 눌러 받는다(밝기만 살린다).
// 떠 있는 표지(이름표 · 시설 표지 · 회차 보드 화면)는 2D 부품처럼 그린다 — ui()로 지금 화면 테마의 토큰을 읽고, 테마가 바뀌면 다시 그린다.
import * as THREE from 'three';
import { tex, speckle } from './tex.js';

const root = () => (typeof document === 'undefined' ? null : document.documentElement);
const read = (name) => { const r = root(); return r ? getComputedStyle(r).getPropertyValue(name).trim() : ''; };
let warned = false;
/** 3D 재질 색(--m3-*) — 토큰이 없으면(스타일시트를 못 받음) 중간 회색으로 */
export function m3(name) {
  const v = read(`--m3-${name}`);
  if (!v && !warned) { warned = true; console.warn(`3D 재질 토큰 --m3-${name}이 없어요 — base.css를 확인해 주세요`); }
  return v || '#9AA1A9';
}
/** 화면(2D) 토큰 — 지금 테마(밝게 · 어둡게) 값. 떠 있는 표지를 2D 부품 모양으로 그릴 때 */
export const ui = (name) => read(`--${name}`) || '#808080';

/** 설계도 색 → 채도를 눌러 받는다(밝기 · 색조는 살짝 남김). 인주색 · 황동은 시설 한 점씩에만 쓰므로 여기서 만들지 않는다 */
const C = new THREE.Color(), HSL = {};
export function neutral(hex, maxS = 0.08) {
  if (!/^#[0-9a-f]{6}$/i.test(hex ?? '')) return null;
  C.set(hex).getHSL(HSL);
  return `#${C.setHSL(HSL.h, Math.min(HSL.s, maxS), HSL.l).getHexString()}`;
}

// ── 테마가 바뀌면 표지를 다시 그린다 ──
const themeFns = new Set();
let watching = false;
function watch() {
  if (watching || !root()) return; watching = true;
  const fire = () => requestAnimationFrame(() => { for (const fn of [...themeFns]) fn(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', fire);
  new MutationObserver(fire).observe(root(), { attributes: true, attributeFilter: ['data-theme'] });
}
/** 화면 테마(밝게 · 어둡게)가 바뀔 때 — 해제 함수를 돌려준다 */
export function onTheme(fn) { watch(); themeFns.add(fn); return () => themeFns.delete(fn); }

/** 무광 재질 — 건물 · 가구 · 소품 기본 */
export const matte = (color, roughness = 0.88, o = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...o });

/**
 * 팔레트 재질 한 벌(이름 → 재질). makeKit()이 kit.m 으로 쓴다 — 같은 이름은 같은 재질 하나를 나눠 쓴다(재질 수가 줄어 무거워지지 않게).
 * 이름은 예전 kit.m 이름을 그대로 둔다(props.js · layouts 가 이름으로 부른다). 나무 · 금속 이름도 남기되 색은 무채색 팔레트.
 */
export function paletteMaterials() {
  const floorMap = tex(speckle({ base: m3('floor'), dots: 14000, alpha: 0.05, blot: 10, seed: 5 }), { repeat: [4, 4] });
  const dark = matte(m3('dark'), 0.8), dark2 = matte(m3('dark-2'), 0.86), darker = matte(m3('darker'), 0.7);
  const light = matte(m3('light'), 0.8), light2 = matte(m3('light-2'), 0.84), mid = matte(m3('mid'), 0.78), mid2 = matte(m3('mid-2'), 0.62, { metalness: 0.15 });
  return {
    // 껍데기 — 흰 벽 · 밝은 콘크리트
    floor: matte('#ffffff', 0.92, { map: floorMap }), wall: matte(m3('wall'), 0.92), wall2: matte(m3('wall-2'), 0.92),
    zone: matte(m3('zone'), 0.94), slab: matte(m3('slab'), 0.9), column: matte(m3('column'), 0.88), trim: matte(m3('column'), 0.88),
    frame: dark, glass: new THREE.MeshStandardMaterial({ color: m3('glass'), transparent: true, opacity: 0.12, roughness: 0.1, depthWrite: false }),
    partition: new THREE.MeshStandardMaterial({ color: m3('glass'), transparent: true, opacity: 0.2, roughness: 0.2, depthWrite: false }),
    frost: new THREE.MeshStandardMaterial({ color: m3('wall'), transparent: true, opacity: 0.55, roughness: 0.7, depthWrite: false }),
    // 가구 — 밝은 상판 + 짙은 회색 몸체
    deskTop: light, tableTop: light, white: light, paper: light, mug: light, pot: light2, cabinet: light2, deviceLight: light2,
    wood: light2, woodDark: dark2, shelf: dark, metal: mid2, legs: dark, black: dark, device: darker, screenOff: darker,
    chair: dark, chair2: dark2, sofa: dark2, pillow: mid, rug: matte(m3('zone'), 0.95), soil: darker, box: mid,
    // 식물 초록 하나
    leaf: matte(m3('plant'), 0.7), leaf2: matte(m3('plant-2'), 0.7), stem: matte(m3('plant-2'), 0.8),
    // 채도 두 곳 — 결재함(인주색) · 레벨 표 · 트로피(황동). 결재함은 밤에도 먼저 보이게 살짝 스스로 빛난다
    decide: matte(m3('decide'), 0.62, { emissive: m3('decide'), emissiveIntensity: 0.22 }),
    brass: new THREE.MeshStandardMaterial({ color: m3('brass'), roughness: 0.45, metalness: 0.6 }),
    glow: new THREE.MeshStandardMaterial({ color: m3('glow'), emissive: m3('glow'), emissiveIntensity: 1.6 }),
  };
}
/** 책 · 바인더처럼 줄지어 놓이는 물건 — 무채색 다섯 단계 */
export const bookShades = () => ['light', 'light-2', 'mid', 'mid-2', 'dark-2'].map(m3);
