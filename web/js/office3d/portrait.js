// 직원 초상 3D — 사무실의 전령을 정면 상반신으로 한 장 찍는다. 직무·직급마다 한 번만 그리고 기억해 둔다
import * as THREE from 'three';
import { SPECIES, RANK } from './species.js';

let R = null;
const cache = new Map();

function rig() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(26, 1, 0.05, 30);
  scene.add(new THREE.HemisphereLight('#F4F7FF', '#8C8378', 1.4));
  const key = new THREE.DirectionalLight('#FFF1DC', 2.6); key.position.set(1.6, 2.4, 3); scene.add(key);
  const rim = new THREE.DirectionalLight('#DDE8FF', 1.2); rim.position.set(-2, 1.5, -2); scene.add(rim);
  return { renderer, scene, camera };
}

/** role · rank(직급 이름) · px(실제 픽셀) → PNG 주소 */
export function portraitURL(role, rank, px = 96) {
  const k = `${role}:${RANK[rank] ?? 'new'}:${px}`;
  if (cache.has(k)) return cache.get(k);
  R ??= rig();
  const { renderer, scene, camera } = R;
  renderer.setSize(px, px, false);
  const c = (SPECIES[role] ?? SPECIES.manager)({ rank: RANK[rank] ?? 'new' });
  c.animate?.(0.4, 'idle', {});
  scene.add(c.root); c.root.updateMatrixWorld(true);
  // 머리 쪽 2/3을 꽉 차게 — 정면에서 살짝 위
  const box = new THREE.Box3().setFromObject(c.root), size = box.getSize(new THREE.Vector3());
  const cy = box.max.y - size.y * 0.36, span = Math.max(size.x * 0.5, size.y * 0.42);
  const dist = span / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(dist * 0.18, cy + dist * 0.12, dist); camera.lookAt(0, cy, 0); camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(c.root);
  c.root.traverse((o) => { o.geometry?.dispose(); for (const m of [o.material].flat()) m?.dispose?.(); });
  cache.set(k, url);
  return url;
}
export const cachedPortrait = (role, rank, px) => cache.get(`${role}:${RANK[rank] ?? 'new'}:${px}`) ?? null;
