// 캐릭터 공통 재료 — 비닐 토이 재질, 점 눈(입 없음), 더듬이, 계급 헬멧(날개), 소품
import * as THREE from 'three';

export const EYE_CYAN = '#1BD5E0';
const PI = Math.PI;

export const vinyl = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, clearcoat: 0.4, clearcoatRoughness: 0.3, ...o });
export const satin = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, clearcoat: 0.15, ...o });
export const gold = (color = '#F2B23C', o = {}) => new THREE.MeshPhysicalMaterial({ color, metalness: 0.35, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2, ...o });

export function mesh(geo, mat, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; }
export function grp(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent?.add(g); return g; }
export const sphere = (r, mat, s = [1, 1, 1], ws = 40, hs = 28) => { const m = mesh(new THREE.SphereGeometry(r, ws, hs), mat); m.scale.set(...s); return m; };

/** 타원체(반지름 r, 배율 s) 위에서 dir 방향의 표면점과 법선 */
export function surface(r, s, dir) {
  const d = new THREE.Vector3(...dir).normalize();
  const t = 1 / Math.sqrt((d.x / (r * s[0])) ** 2 + (d.y / (r * s[1])) ** 2 + (d.z / (r * s[2])) ** 2);
  const p = d.clone().multiplyScalar(t);
  const n = new THREE.Vector3(p.x / (r * s[0]) ** 2, p.y / (r * s[1]) ** 2, p.z / (r * s[2]) ** 2).normalize();
  return { p, n };
}
/** 표면에 붙이기 — obj 의 +z 가 법선을 보게 */
export function stick(obj, at, lift = 0) { obj.position.copy(at.p).addScaledVector(at.n, lift); obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), at.n); return obj; }

/** 점 눈 — 검은 테 + 청록 홍채(살짝 발광). 깜빡임은 scale.y */
export function eye(size, { iris = EYE_CYAN, ring = '#141414', glow = 0.45 } = {}) {
  const g = new THREE.Group();
  const black = mesh(new THREE.CylinderGeometry(size, size, size * 0.16, 48), new THREE.MeshPhysicalMaterial({ color: ring, roughness: 0.22, clearcoat: 1 }), false);
  black.rotation.x = PI / 2; g.add(black);
  const cyan = mesh(new THREE.CylinderGeometry(size * 0.55, size * 0.55, size * 0.18, 40), new THREE.MeshStandardMaterial({ color: iris, emissive: iris, emissiveIntensity: glow, roughness: 0.25 }), false);
  cyan.rotation.x = PI / 2; cyan.position.z = size * 0.02; g.add(cyan);
  return g;
}

/** 더듬이 — 밑동을 원점으로 둔 곡선 튜브. 그룹을 돌리면 흔들린다 */
export function antenna(points, r, mat) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.Group();
  g.add(mesh(new THREE.TubeGeometry(curve, 48, r, 14, false), mat));
  const tip = mesh(new THREE.SphereGeometry(r * 1.05, 16, 12), mat); tip.position.copy(curve.getPoint(1)); g.add(tip);
  const base = mesh(new THREE.SphereGeometry(r * 1.2, 16, 12), mat); g.add(base);
  return g;
}

/** 깃털 한 장 — 둥근 끝이 위로 휘는 잎 모양 판 */
function feather(len, wid, depth, mat) {
  const s = new THREE.Shape();
  s.moveTo(0, -wid * 0.5);
  s.bezierCurveTo(len * 0.45, -wid * 0.62, len * 0.86, -wid * 0.25, len, wid * 0.2);
  s.bezierCurveTo(len * 0.82, wid * 0.62, len * 0.36, wid * 0.62, 0, wid * 0.5);
  s.lineTo(0, -wid * 0.5);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.7, bevelSize: wid * 0.16, bevelSegments: 4, curveSegments: 20 });
  g.translate(0, 0, -depth / 2);
  return mesh(g, mat);
}
export function wing(size, side, mat, n = 4) {
  const g = new THREE.Group(), inner = grp(g);
  for (let i = 0; i < n; i++) {
    const f = feather(size * (1 - i * 0.16), size * 0.27, size * 0.045, mat);
    f.position.set(-i * size * 0.04, -i * size * 0.15, -i * size * 0.02); f.rotation.z = -i * 0.16; inner.add(f);
  }
  inner.rotation.set(0, -0.45, 0.62);
  if (side < 0) g.scale.x = -1;
  return g;
}

/**
 * 계급 헬멧 — 몸통 윗부분을 덮는 돔 + 띠 + (날개)
 * rank: 'new' 없음 · 'mid' 은빛 돔 · 'lead' 금빛 날개 · 'head' 금빛 큰 날개 + 깃 장식
 */
export function helmet(R, S, rank = 'lead') {
  const g = new THREE.Group();
  if (!rank || rank === 'new') return g;
  const silver = rank === 'mid';
  const mDome = silver ? gold('#C9CED6', { metalness: 0.6 }) : gold('#F3B33D'), mBand = silver ? gold('#AEB4BE', { metalness: 0.6 }) : gold('#E29E2C');
  const th = PI * 0.33, rr = R * 1.045;
  const dome = mesh(new THREE.SphereGeometry(rr, 64, 28, 0, PI * 2, 0, th), mDome); dome.scale.set(...S); g.add(dome);
  const re = rr * Math.sin(th), ye = rr * Math.cos(th);
  const band = mesh(new THREE.TorusGeometry(re, R * 0.075, 16, 80), mBand); band.rotation.x = PI / 2; band.scale.set(S[0], S[2], 0.8); band.position.y = ye * S[1]; g.add(band);
  if (rank === 'lead' || rank === 'head') {
    const ws = rank === 'head' ? R * 0.95 : R * 0.78;
    for (const s of [-1, 1]) { const w = wing(ws, s, mDome); w.position.set(s * re * S[0] * 0.9, ye * S[1] + R * 0.16, -R * 0.06); g.add(w); }
  }
  if (rank === 'head') { const c = mesh(new THREE.SphereGeometry(R * 0.11, 20, 16), gold('#E25B3C', { metalness: 0.2 })); c.position.set(0, rr * S[1] + R * 0.02, R * 0.05); g.add(c); }
  return g;
}

/** 집게 — 보내주신 그림의 실루엣(큰 장갑 모양 + 아래로 벌어진 집게 틈)을 두툼하게 뽑아낸다. side +1 = 바깥이 +x */
export function pincer(R, mat, side) {
  const g = new THREE.Group();
  const ext = (shape, depth) => { const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: R * 0.11, bevelSize: R * 0.08, bevelSegments: 8, curveSegments: 28 }); geo.translate(0, 0, -depth / 2); geo.computeVertexNormals(); return geo; };
  const P = (x, y) => [x * R, y * R];
  const main = new THREE.Shape();
  main.moveTo(...P(-0.27, 0.04));
  main.bezierCurveTo(...P(-0.25, 0.44), ...P(0.3, 0.48), ...P(0.37, 0.02));
  main.bezierCurveTo(...P(0.43, -0.3), ...P(0.34, -0.6), ...P(0.15, -0.68));
  main.bezierCurveTo(...P(0.1, -0.54), ...P(0.09, -0.37), ...P(0.04, -0.26));
  main.bezierCurveTo(...P(-0.06, -0.2), ...P(-0.24, -0.2), ...P(-0.27, 0.04));
  g.add(mesh(ext(main, R * 0.24), mat));
  const finger = new THREE.Group(); finger.position.set(-0.03 * R, -0.22 * R, 0); g.add(finger);
  const fin = new THREE.Shape();
  fin.moveTo(...P(0.03, 0.0));
  fin.bezierCurveTo(...P(0.05, -0.13), ...P(0.02, -0.29), ...P(-0.04, -0.36));
  fin.bezierCurveTo(...P(-0.15, -0.31), ...P(-0.25, -0.13), ...P(-0.23, 0.13));
  fin.bezierCurveTo(...P(-0.15, 0.11), ...P(-0.04, 0.07), ...P(0.03, 0.0));
  finger.add(mesh(ext(fin, R * 0.2), mat));
  if (side < 0) g.scale.x = -1;
  return { g, finger };
}

/** 소품들 — 크기 단위는 몸 반지름 R */
export const acc = {
  glasses(R, eyes, color = '#1C1C1C') {
    const g = new THREE.Group(), m = vinyl(color, { roughness: 0.3 });
    const pts = eyes.map((e) => e.at.p.clone().addScaledVector(e.at.n, R * 0.05));
    for (const [i, e] of eyes.entries()) { const ring = mesh(new THREE.TorusGeometry(R * 0.23, R * 0.025, 10, 40), m); stick(ring, { p: pts[i], n: e.at.n }); g.add(ring); }
    const mid = pts[0].clone().add(pts[1]).multiplyScalar(0.5), len = pts[0].distanceTo(pts[1]) - R * 0.46;
    const br = mesh(new THREE.CylinderGeometry(R * 0.02, R * 0.02, Math.max(0.01, len), 8), m); br.rotation.z = PI / 2; br.position.copy(mid).add(new THREE.Vector3(0, R * 0.04, 0)); g.add(br);
    return g;
  },
  beret(R, color = '#2C3554', tilt = 0.32) {
    const g = new THREE.Group(), m = satin(color);
    const b = mesh(new THREE.SphereGeometry(R * 0.62, 40, 20), m); b.scale.set(1, 0.3, 0.95); g.add(b);
    const nub = mesh(new THREE.CylinderGeometry(R * 0.03, R * 0.05, R * 0.1, 10), m); nub.position.y = R * 0.2; g.add(nub);
    g.rotation.z = tilt; return g;
  },
  headphones(R, color = '#26282C', cup = '#F2F2EF') {
    const g = new THREE.Group(), m = vinyl(color), mc = vinyl(cup);
    const band = mesh(new THREE.TorusGeometry(R * 1.04, R * 0.055, 12, 48, PI), m); g.add(band);
    for (const s of [-1, 1]) { const c = mesh(new THREE.CylinderGeometry(R * 0.2, R * 0.2, R * 0.14, 28), m); c.rotation.z = PI / 2; c.position.set(s * R * 1.03, 0, 0); g.add(c); const p = mesh(new THREE.CylinderGeometry(R * 0.15, R * 0.15, R * 0.04, 24), mc); p.rotation.z = PI / 2; p.position.set(s * R * 1.11, 0, 0); g.add(p); }
    return g;
  },
  quill(L, color = '#F5F1E8', nib = '#2B2B2B') {
    const g = new THREE.Group();
    const f = feather(L, L * 0.22, L * 0.03, satin(color)); f.rotation.z = PI / 2; f.position.y = L * 0.12; g.add(f);
    const n = mesh(new THREE.ConeGeometry(L * 0.035, L * 0.16, 10), vinyl(nib)); n.rotation.x = PI; n.position.y = 0.04 * L; g.add(n);
    return g;
  },
  brush(L, tip = '#E8573B') {
    const g = new THREE.Group();
    const h = mesh(new THREE.CylinderGeometry(L * 0.035, L * 0.045, L, 12), vinyl('#2F2A26')); h.position.y = L / 2; g.add(h);
    const f = mesh(new THREE.CylinderGeometry(L * 0.05, L * 0.045, L * 0.12, 12), gold('#C9CED6')); f.position.y = L * 1.04; g.add(f);
    const t = mesh(new THREE.ConeGeometry(L * 0.05, L * 0.22, 12), vinyl(tip)); t.position.y = L * 1.2; g.add(t);
    return g;
  },
  doc(R, color = '#FBFAF6') {
    const g = new THREE.Group();
    const p = mesh(new THREE.BoxGeometry(R * 0.5, R * 0.66, R * 0.012), satin(color)); g.add(p);
    const lineM = new THREE.MeshBasicMaterial({ color: '#B9B4AA' });
    for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(R * (i === 0 ? 0.26 : 0.36), R * 0.022), lineM); l.position.set(-R * (i === 0 ? 0.06 : 0.01), R * (0.22 - i * 0.09), R * 0.0065); g.add(l); }
    return g;
  },
  magnifier(L, color = '#2F2A26') {
    const g = new THREE.Group();
    const ring = mesh(new THREE.TorusGeometry(L * 0.22, L * 0.035, 12, 36), gold('#C9A267')); ring.position.y = L * 0.75; g.add(ring);
    const glass = mesh(new THREE.CircleGeometry(L * 0.21, 32), new THREE.MeshPhysicalMaterial({ color: '#DFF4F7', transmission: 0.6, roughness: 0.05, transparent: true, opacity: 0.45 }), false); glass.position.y = L * 0.75; g.add(glass);
    const h = mesh(new THREE.CylinderGeometry(L * 0.04, L * 0.045, L * 0.5, 12), vinyl(color)); h.position.y = L * 0.27; g.add(h);
    return g;
  },
};

/** 공통 잔동작 */
export const blink = (t, seed = 0) => { const u = (t + seed * 1.37) % 4.2; return u < 0.12 ? Math.max(0.12, Math.abs(u - 0.06) / 0.06) : 1; };
export const sm = (x) => x * x * (3 - 2 * x);
