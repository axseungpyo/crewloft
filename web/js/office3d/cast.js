// 전령 4종(3D) — 미나·부엉이(아테나 투구) · 준·여우(아르테미스 초승달) · 하나·문어(칼리오페 월계관) · 레오·카멜레온(이리스 무지개)
// 규격: docs/product/specs/characters.md "직무 상징 초안" · "시안 캐스트". API 는 character3d/species/lobster.js 와 같다.
//   { root, bob, top, R, height, deskGap, species, animate(t, mode, p) } — mode: idle | type | read | walk(p.carry, p.phase) | give | raise
import * as THREE from 'three';
import { vinyl, satin, mesh, grp, sphere, surface, stick, eye, acc, blink, sm, wing } from './kit.js';

const PI = Math.PI;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const DESK_TOP = 0.6; // character3d/scene.js 일하는 장면의 책상 윗면(0.4 × 1.5)

/* ───────────────────────── 직급 금속 · 공통 부품 ───────────────────────── */

const METAL = {
  new: { color: '#B5733F', metalness: 0.6, roughness: 0.34 }, // 청동
  mid: { color: '#CDD2DA', metalness: 0.72, roughness: 0.22 }, // 은
  lead: { color: '#F2B23C', metalness: 0.5, roughness: 0.26 }, // 금
  head: { color: '#F6BC42', metalness: 0.55, roughness: 0.2 }, // 금 + 장식
};
export const RANKS = ['new', 'mid', 'lead', 'head'];
export const metal = (rank = 'lead', o = {}) => { const M = METAL[rank] ?? METAL.lead; return new THREE.MeshPhysicalMaterial({ color: M.color, metalness: M.metalness, roughness: M.roughness, clearcoat: 0.6, clearcoatRoughness: 0.18, ...o }); };
const shade = (hex, k) => `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;
function gem(r, color = '#2E6FE0') {
  const m = mesh(new THREE.OctahedronGeometry(r, 0), new THREE.MeshPhysicalMaterial({ color, roughness: 0.05, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, emissive: color, emissiveIntensity: 0.18 }));
  m.scale.set(0.8, 1.15, 0.6); return m;
}
function extrude(shape, depth, bev, mat, seg = 24) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 6, curveSegments: seg });
  geo.translate(0, 0, -depth / 2); geo.computeVertexNormals();
  return mesh(geo, mat);
}
/** 깃털 한 장(끝이 둥글게 휜 잎 모양 판) — +x 방향으로 뻗는다 */
function featherMesh(len, wid, depth, mat) {
  const s = new THREE.Shape();
  s.moveTo(0, -wid * 0.5);
  s.bezierCurveTo(len * 0.45, -wid * 0.62, len * 0.86, -wid * 0.25, len, wid * 0.2);
  s.bezierCurveTo(len * 0.82, wid * 0.62, len * 0.36, wid * 0.62, 0, wid * 0.5);
  s.lineTo(0, -wid * 0.5);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.7, bevelSize: wid * 0.16, bevelSegments: 4, curveSegments: 20 });
  g.translate(0, 0, -depth / 2);
  return mesh(g, mat);
}
/** 잎 한 장(아몬드 모양) — 밑동이 원점, +y 로 뻗는다. 여러 장이 같은 형태를 쓴다 */
function leafGeometry(len, wid) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.quadraticCurveTo(wid, len * 0.42, 0, len); s.quadraticCurveTo(-wid, len * 0.42, 0, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: len * 0.04, bevelEnabled: true, bevelThickness: len * 0.035, bevelSize: wid * 0.18, bevelSegments: 3, curveSegments: 12 });
  geo.translate(0, 0, -len * 0.02); geo.computeVertexNormals();
  return geo;
}
/** y 축을 dir 로, z 축을 face 쪽으로 돌리는 회전 */
function basisQuat(dir, face) {
  const y = dir.clone().normalize(), z = face.clone().addScaledVector(y, -face.dot(y)).normalize(), x = V().crossVectors(y, z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** 곡선을 따라 굵기가 바뀌는 관 — 평행 이동 프레임(비틀림 없음). colorFn(u) 를 주면 정점 색 */
function tubeGeo(curve, rFn, { seg = 64, rad = 16, colorFn = null } = {}) {
  const n = (seg + 1) * (rad + 1), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const col = colorFn ? new Float32Array(n * 3) : null;
  const P = V(), T = V(), Tp = V(), N = V(), B = V(), q = new THREE.Quaternion();
  curve.updateArcLengths?.();
  for (let j = 0; j <= seg; j++) {
    const u = j / seg;
    curve.getPointAt(u, P); curve.getTangentAt(u, T);
    if (j === 0) { const ref = Math.abs(T.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0); N.crossVectors(T, ref).normalize(); }
    else { q.setFromUnitVectors(Tp, T); N.applyQuaternion(q).normalize(); }
    B.crossVectors(T, N).normalize(); Tp.copy(T);
    const r = rFn(u), c = col ? colorFn(u) : null;
    for (let i = 0; i <= rad; i++) {
      const v = (i / rad) * PI * 2, s = Math.sin(v), cc = -Math.cos(v);
      const nx = cc * N.x + s * B.x, ny = cc * N.y + s * B.y, nz = cc * N.z + s * B.z, k = j * (rad + 1) + i;
      pos[k * 3] = P.x + nx * r; pos[k * 3 + 1] = P.y + ny * r; pos[k * 3 + 2] = P.z + nz * r;
      nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz; uv[k * 2] = u; uv[k * 2 + 1] = i / rad;
      if (c) { col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; }
    }
  }
  const idx = [];
  for (let j = 1; j <= seg; j++) for (let i = 1; i <= rad; i++) { const a = (rad + 1) * (j - 1) + (i - 1), b = (rad + 1) * j + (i - 1), c = (rad + 1) * j + i, d = (rad + 1) * (j - 1) + i; idx.push(a, b, d, b, c, d); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}
function taperTube(points, rFn, mat, o = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (Array.isArray(p) ? V(...p) : p)), false, 'centripetal');
  const g = new THREE.Group();
  g.add(mesh(tubeGeo(curve, rFn, o), mat));
  for (const [u, m] of [[0, mat], [1, o.endMat ?? mat]]) { const c = mesh(new THREE.SphereGeometry(1, 20, 14), m); c.position.copy(curve.getPoint(u)); c.scale.setScalar(rFn(u) * 1.01); g.add(c); }
  return g;
}

/**
 * 굵기가 줄어드는 촉수 — 조절점 5개(p[0..4])를 바꾸고 update() 하면 정점을 다시 짠다(character3d/species/sea.js 와 같은 방식).
 * tipColor 를 주면 끝으로 갈수록 그 색으로 물든다.
 */
class Tentacle {
  constructor(mat, { r0 = 0.07, r1 = 0.02, seg = 40, rad = 12, body = null, tipColor = null } = {}) {
    Object.assign(this, { r0, r1, seg, rad });
    this.p = [V(), V(0, 0.1), V(0, 0.2), V(0, 0.3), V(0, 0.4)];
    this.curve = new THREE.CatmullRomCurve3(this.p, false, 'centripetal');
    const n = (seg + 1) * (rad + 1), geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    if (tipColor) {
      const a = new THREE.Color(body), b = new THREE.Color(tipColor), c = new THREE.Color(), col = new Float32Array(n * 3);
      for (let j = 0; j <= seg; j++) { c.copy(a).lerp(b, sm(Math.min(1, Math.max(0, (j / seg - 0.42) / 0.45)))); for (let i = 0; i <= rad; i++) col.set([c.r, c.g, c.b], (j * (rad + 1) + i) * 3); }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    const idx = [];
    for (let j = 1; j <= seg; j++) for (let i = 1; i <= rad; i++) { const a = (rad + 1) * (j - 1) + (i - 1), b = (rad + 1) * j + (i - 1), c = (rad + 1) * j + i, d = (rad + 1) * (j - 1) + i; idx.push(a, b, d, b, c, d); }
    geo.setIndex(idx);
    this.mesh = mesh(geo, mat); this.mesh.frustumCulled = false;
    this.cap = mesh(new THREE.SphereGeometry(1, 16, 12), tipColor ? vinyl(tipColor) : mat);
    this.group = new THREE.Group(); this.group.add(this.mesh, this.cap);
    this.tip = V(); this.dir = V(0, 1, 0);
    this._P = V(); this._T = V(); this._Tp = V(); this._N = V(); this._B = V(); this._q = new THREE.Quaternion();
  }
  radius(u) { return this.r0 + (this.r1 - this.r0) * Math.pow(u, 0.85); }
  update() {
    const { seg, rad, curve, _P: P, _T: T, _Tp: Tp, _N: N, _B: B, _q: q } = this;
    curve.updateArcLengths();
    const g = this.mesh.geometry, pos = g.attributes.position.array, nor = g.attributes.normal.array;
    for (let j = 0; j <= seg; j++) {
      const u = j / seg;
      curve.getPointAt(u, P); curve.getTangentAt(u, T);
      if (j === 0) { const ref = Math.abs(T.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0); N.crossVectors(T, ref).normalize(); }
      else { q.setFromUnitVectors(Tp, T); N.applyQuaternion(q).normalize(); }
      B.crossVectors(T, N).normalize(); Tp.copy(T);
      const r = this.radius(u);
      for (let i = 0; i <= rad; i++) {
        const v = (i / rad) * PI * 2, s = Math.sin(v), c = -Math.cos(v), k = (j * (rad + 1) + i) * 3;
        const nx = c * N.x + s * B.x, ny = c * N.y + s * B.y, nz = c * N.z + s * B.z;
        pos[k] = P.x + nx * r; pos[k + 1] = P.y + ny * r; pos[k + 2] = P.z + nz * r; nor[k] = nx; nor[k + 1] = ny; nor[k + 2] = nz;
      }
    }
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true; g.computeBoundingSphere();
    this.tip.copy(P); this.dir.copy(T);
    this.cap.position.copy(P); this.cap.scale.setScalar(this.radius(1) * 1.02);
  }
}
/** 바닥에 닿았다가 끝이 말려 올라가는 다리. trail 이 크면 끝이 뒤로 끌린다(미끄러지듯 이동할 때) */
function floorArm(A, base, ang, { reach, r, curl, w = 0, trail = 0, lift = 0 }) {
  const dx = Math.sin(ang), dz = Math.cos(ang), sx = dz, sz = -dx;
  A.p[0].copy(base);
  A.p[1].set(base.x + dx * reach * 0.32, base.y * 0.55 + r + lift * 0.5, base.z + dz * reach * 0.32 - trail * 0.15);
  A.p[2].set(dx * reach * 0.68 + sx * w * 0.03, r * 0.9 + lift, dz * reach * 0.68 + sz * w * 0.03 - trail * 0.38);
  A.p[3].set(dx * reach * 0.98 + sx * w * 0.07, r * 0.9 + curl * 0.22 + lift, dz * reach * 0.98 + sz * w * 0.07 - trail * 0.62);
  A.p[4].set(dx * reach * 0.9 + sx * w * 0.12, r + curl * (0.85 + 0.15 * w) + lift, dz * reach * 0.9 + sz * w * 0.12 - trail * 0.78);
}
/** 몸통 밑에서 나와 목표점(손)까지 S자로 뻗는 팔 */
function reachArm(A, base, out, target, { sag = 0.12, bulge = 0.18 } = {}) {
  const [dx, dz] = out;
  A.p[0].copy(base);
  A.p[1].set(base.x + dx * bulge, base.y - sag, base.z + dz * bulge);
  const m = V().lerpVectors(A.p[1], target, 0.5);
  A.p[2].set(m.x + dx * bulge * 0.6, m.y - sag * 0.4, m.z + dz * bulge * 0.4);
  A.p[3].lerpVectors(A.p[2], target, 0.62).add(V(0, sag * 0.15, 0));
  A.p[4].copy(target);
}

/** 깃펜 — 가운데 깃대 + 양쪽 깃털(끝으로 갈수록 살짝 회색) + 금 펜촉. 원점이 펜촉 바로 위, +y 로 뻗는다 */
function quill(L) {
  const g = new THREE.Group(), vane = satin('#F7F3EA'), vane2 = satin('#E6E1D6');
  const half = (side) => { const s = new THREE.Shape(); s.moveTo(0, 0); s.bezierCurveTo(side * L * 0.11, L * 0.25, side * L * 0.12, L * 0.62, side * L * 0.02, L * 0.98); s.lineTo(0, L * 0.98); s.lineTo(0, 0); return s; };
  for (const side of [-1, 1]) { const v = extrude(half(side), L * 0.01, L * 0.008, side > 0 ? vane : vane2, 16); v.position.set(0, L * 0.12, 0); v.rotation.y = side * 0.32; g.add(v); }
  const rachis = mesh(new THREE.CylinderGeometry(L * 0.01, L * 0.016, L * 1.08, 8), satin('#D9CDB4')); rachis.position.y = L * 0.6; g.add(rachis);
  const nib = mesh(new THREE.ConeGeometry(L * 0.03, L * 0.14, 12), metal('lead')); nib.rotation.x = PI; nib.position.y = -L * 0.0; g.add(nib);
  const ferrule = mesh(new THREE.CylinderGeometry(L * 0.026, L * 0.03, L * 0.06, 12), metal('lead')); ferrule.position.y = L * 0.09; g.add(ferrule);
  return g;
}

/* ───────────────────────── 직무 상징 8종 ─────────────────────────
 * 머리(반지름 R, 배율 S 의 타원체) 중심을 원점으로 만든다 — 쓰는 쪽 bob 에 그대로 붙이면 맞는다.
 * 직급(rank): new 청동 · mid 은 · lead 금 · head 금 + 보석/장식
 */
export const EMBLEMS = [
  ['athena', '아테나 투구', '기획·전략'], ['artemis', '아르테미스 초승달', '조사'], ['calliope', '칼리오페 월계관', '글'], ['iris', '이리스 무지개', '디자인'],
  ['hermes', '헤르메스 날개 헬멧', '게시·전달'], ['themis', '테미스 저울', '검수·품질'], ['chronos', '크로노스 모래시계', '일정'], ['triton', '트리톤 소라 나팔', '홍보'],
];
export const WEARABLE = new Set(['athena', 'artemis', 'calliope', 'iris', 'hermes']);

export function emblem3d(key, R, rank = 'lead', o = {}) {
  const S = o.S ?? [1, 1, 1];
  const fn = { athena, artemis, calliope, iris, hermes, themis, chronos, triton }[key];
  if (!fn) throw new Error(`unknown emblem: ${key}`);
  const g = fn(R, rank, S, o);
  g.userData.emblem = key; g.userData.rank = rank;
  return g;
}

/** 아테나 — 둥근 투구 + 볼 가리개 + 이마에서 뒤통수까지 이어지는 붉은 볏 */
function athena(R, rank, S) {
  const g = new THREE.Group(), m = metal(rank), m2 = metal(rank, { color: shade(METAL[rank].color, 0.78) });
  const th = PI * 0.34, rr = R * 1.05;
  const dome = mesh(new THREE.SphereGeometry(rr, 64, 28, 0, PI * 2, 0, th), m); dome.scale.set(...S); g.add(dome);
  const re = rr * Math.sin(th), ye = rr * Math.cos(th);
  const brow = mesh(new THREE.TorusGeometry(re, R * 0.068, 14, 88), m2); brow.rotation.x = PI / 2; brow.scale.set(S[0], S[2], 0.82); brow.position.y = ye * S[1]; g.add(brow);
  for (const s of [-1, 1]) { // 볼 가리개 — 옆으로 내려오는 곡면 판 + 아래 둥근 테
    const phi0 = s > 0 ? PI - 0.4 : -0.4, tl = 0.34;
    const cheek = mesh(new THREE.SphereGeometry(rr * 1.004, 24, 12, phi0, 0.8, th - 0.02, tl), m); cheek.material = m.clone(); cheek.material.side = THREE.DoubleSide; cheek.scale.set(...S); g.add(cheek);
    const a = th + tl, pts = Array.from({ length: 13 }, (_, i) => { const ph = phi0 + (i / 12) * 0.8; return V(-rr * Math.cos(ph) * Math.sin(a) * S[0], rr * Math.cos(a) * S[1], rr * Math.sin(ph) * Math.sin(a) * S[2]); });
    g.add(taperTube(pts, () => R * 0.032, m2, { seg: 32, rad: 8 }));
  }
  const tall = { new: 1.3, mid: 1.38, lead: 1.48, head: 1.6 }[rank] ?? 1.48;
  const a0 = 0.6, a1 = PI - 0.1, N = 30;
  const crest = new THREE.Shape(), arc = (r, a) => [-r * Math.cos(a), r * Math.sin(a)]; // x = -z(뒤쪽 +), y = y
  crest.moveTo(...arc(rr * 0.9, a0));
  for (let i = 0; i <= N; i++) { const k = i / N, a = a0 + (a1 - a0) * k; crest.lineTo(...arc(rr * (0.92 + (tall - 0.92) * Math.pow(Math.sin(PI * Math.min(1, k * 1.08)), 0.55)), a)); }
  for (let i = N; i >= 0; i--) { const a = a0 + (a1 - a0) * (i / N); crest.lineTo(...arc(rr * 0.9, a)); }
  const plume = extrude(crest, R * 0.1, R * 0.055, vinyl('#ffffff', { vertexColors: true, roughness: 0.62, clearcoat: 0.1 }), 4);
  { // 볏 — 뿌리는 짙게, 끝으로 갈수록 밝게 + 말갈기 같은 결
    const pa = plume.geometry.attributes.position, cA = new THREE.Color('#A92A1A'), cB = new THREE.Color('#E8553A'), c = new THREE.Color(), arr = new Float32Array(pa.count * 3);
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), r = Math.hypot(x, y) / rr, k = sm(Math.min(1, Math.max(0, (r - 0.9) / (tall - 0.9)))); const a2 = Math.atan2(y, -x), streak = 0.92 + 0.08 * Math.sin(a2 * 46); c.copy(cA).lerp(cB, k).multiplyScalar(streak); arr.set([c.r, c.g, c.b], i * 3); }
    plume.geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  plume.rotation.y = PI / 2; plume.scale.set(S[2], S[1], 1); g.add(plume);
  for (const s of [-1, 1]) { // 볏 받침 — 양옆 금속 띠
    const pts = Array.from({ length: 21 }, (_, i) => { const a = a0 + (a1 - a0) * (i / 20); return V(s * R * 0.085, rr * 0.985 * Math.sin(a) * S[1], rr * 0.985 * Math.cos(a) * S[2]); });
    g.add(taperTube(pts, () => R * 0.03, m2, { seg: 40, rad: 8 }));
  }
  if (rank === 'head') { const gm = gem(R * 0.085, '#2E6FE0'); gm.position.set(0, ye * S[1] + R * 0.03, re * S[2] + R * 0.07); g.add(gm); }
  return g;
}

/** 초승달(뿔이 위) — 바깥 원 반지름 r1 에서 off 만큼 올린 안쪽 원 r2 를 뺀 모양 */
function crescentShape(r1, r2, off) {
  const y = (r1 * r1 - r2 * r2 + off * off) / (2 * off), x = Math.sqrt(Math.max(1e-6, r1 * r1 - y * y));
  const aO = Math.atan2(y, x), aI = Math.atan2(y - off, x);
  const s = new THREE.Shape();
  s.moveTo(x, y);
  s.absarc(0, 0, r1, aO, PI - aO, true);
  s.absarc(0, off, r2, PI - aI, aI, false);
  return s;
}
/** 작은 활 — 원점이 손잡이, 활대는 +x 로 휜다 */
function bowMesh(L, m) {
  const g = new THREE.Group(), A = PI * 0.4;
  const limb = mesh(new THREE.TorusGeometry(L * 0.5, L * 0.032, 10, 40, A * 2), m); limb.rotation.z = -A; limb.position.x = -L * 0.5; g.add(limb);
  const tipY = Math.sin(A) * L * 0.5, tipX = Math.cos(A) * L * 0.5 - L * 0.5;
  for (const s of [-1, 1]) { const t = mesh(new THREE.SphereGeometry(L * 0.05, 12, 10), m); t.position.set(tipX, s * tipY, 0); g.add(t); }
  const str = mesh(new THREE.CylinderGeometry(L * 0.007, L * 0.007, tipY * 2, 6), vinyl('#F4F1EA'), false); str.position.x = tipX; g.add(str);
  const grip = mesh(new THREE.CylinderGeometry(L * 0.05, L * 0.05, L * 0.16, 12), vinyl('#3B2A22')); g.add(grip);
  return g;
}
/** 아르테미스 — 이마의 은빛 띠 + 위로 선 초승달 (+ 등에 멘 작은 활) */
function artemis(R, rank, S, o) {
  const g = new THREE.Group(), m = metal(rank), yb = 0.5, ry = Math.sqrt(1 - yb * yb) * 1.02;
  const band = mesh(new THREE.TorusGeometry(R * ry, R * 0.034, 12, 88), m); band.rotation.x = PI / 2; band.scale.set(S[0], S[2], 1); band.position.y = R * yb * S[1]; g.add(band);
  const moon = extrude(crescentShape(R * 0.26, R * 0.215, R * 0.1), R * 0.05, R * 0.026, m, 40);
  moon.position.set(0, R * yb * S[1] + R * 0.17, R * ry * S[2] + R * 0.015); moon.rotation.x = -0.22; g.add(moon);
  const clasp = sphere(R * 0.05, m, [1, 1, 0.6], 16, 12); clasp.position.set(0, R * yb * S[1], R * ry * S[2] + R * 0.02); g.add(clasp);
  if (rank === 'head') { const gm = gem(R * 0.05, '#8EC9FF'); gm.position.copy(moon.position).add(V(0, -R * 0.07, R * 0.05)); g.add(gm); }
  if (o.bow !== false) { const bow = bowMesh(R * 0.75, m); bow.position.set(R * 0.06, -R * 0.05, -R * S[2] * 1.03); bow.rotation.set(0, PI, -0.7); g.add(bow); g.userData.bow = bow; }
  return g;
}

/** 칼리오페 — 월계관. 신입·주임은 초록 잎, 팀장부터 금빛 잎. 열매는 직급 금속 */
function calliope(R, rank, S) {
  const g = new THREE.Group(), golden = rank === 'lead' || rank === 'head';
  const leafA = golden ? metal(rank) : vinyl(rank === 'mid' ? '#88A862' : '#7FA35B', { roughness: 0.45 });
  const leafB = golden ? metal(rank, { color: shade(METAL[rank].color, 0.84) }) : vinyl(rank === 'mid' ? '#6C8B4C' : '#658946', { roughness: 0.45 });
  const berry = metal(rank === 'head' ? 'lead' : rank), yb = 0.55, ry = Math.sqrt(1 - yb * yb) * 1.04;
  const at = (a, lift = 0) => V(Math.sin(a) * R * ry * S[0], R * yb * S[1] + lift, Math.cos(a) * R * ry * S[2]);
  const geo = leafGeometry(R * 0.21, R * 0.075), N = 12;
  for (const side of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      const a = side * (0.24 + (i / (N - 1)) * (PI - 0.34));
      const out = V(Math.sin(a), 0, Math.cos(a)), fwd = V(Math.cos(a) * S[0], 0, -Math.sin(a) * S[2]).multiplyScalar(-side).normalize();
      for (const row of [-1, 1]) {
        const leaf = mesh(geo, row > 0 ? leafA : leafB);
        leaf.position.copy(at(a + side * 0.04 * row, row * R * 0.012));
        leaf.quaternion.copy(basisQuat(fwd.clone().multiplyScalar(0.8).add(V(0, row * 0.62, 0)).add(out.clone().multiplyScalar(0.15)), out));
        g.add(leaf);
      }
      if (i % 3 === 1) { const b = mesh(new THREE.SphereGeometry(R * 0.036, 12, 10), berry); b.position.copy(at(a)).addScaledVector(out, R * 0.06); g.add(b); }
    }
  }
  g.add(taperTube(Array.from({ length: 33 }, (_, i) => at(0.24 + (i / 32) * (2 * PI - 0.48))), () => R * 0.018, leafB, { seg: 96, rad: 6 }));
  const knot = sphere(R * 0.06, berry, [1.3, 0.9, 0.8], 16, 12); knot.position.copy(at(PI)).add(V(0, 0, -R * 0.03)); g.add(knot);
  if (rank === 'head') { const gm = gem(R * 0.06, '#C3423F'); gm.position.copy(at(0)).add(V(0, R * 0.04, R * 0.05)); g.add(gm); }
  return g;
}

/** 이리스 — 머리 뒤에 뜬 일곱 띠 무지개 + 직급 금속 테와 양 끝 받침 */
function iris(R, rank) {
  const g = new THREE.Group();
  const cols = ['#E8513B', '#F28C2A', '#F6C945', '#5DBB63', '#35B5D6', '#4A6CD6', '#8B5ACF'];
  const r0 = R * 0.98, w = R * 0.07;
  cols.forEach((c, i) => {
    const band = mesh(new THREE.TorusGeometry(r0 - i * w, w * 0.56, 12, 80, PI), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.38 }), false);
    band.position.z = -i * 0.004 * R; band.scale.z = 0.55; g.add(band);
  });
  const m = metal(rank);
  g.add(mesh(new THREE.TorusGeometry(r0 + w * 0.6, R * 0.02, 8, 80, PI), m));
  for (const s of [-1, 1]) { const cap = sphere(R * 0.13, m, [1.1, 0.62, 0.8], 24, 16); cap.position.set(s * (r0 - w * 3), -R * 0.01, 0); g.add(cap); }
  if (rank === 'head') { const gm = gem(R * 0.08, '#FFFFFF'); gm.position.set(0, r0 + w * 0.6, R * 0.03); g.add(gm); }
  return g;
}

/** 헤르메스 — 날개 달린 둥근 헬멧(보내주신 랍스터 시안의 그 헬멧) */
function hermes(R, rank, S) {
  const g = new THREE.Group(), m = metal(rank), m2 = metal(rank, { color: shade(METAL[rank].color, 0.8) });
  const th = PI * 0.33, rr = R * 1.045;
  const dome = mesh(new THREE.SphereGeometry(rr, 64, 28, 0, PI * 2, 0, th), m); dome.scale.set(...S); g.add(dome);
  const re = rr * Math.sin(th), ye = rr * Math.cos(th);
  const band = mesh(new THREE.TorusGeometry(re, R * 0.075, 16, 80), m2); band.rotation.x = PI / 2; band.scale.set(S[0], S[2], 0.8); band.position.y = ye * S[1]; g.add(band);
  const ws = { new: 0.62, mid: 0.7, lead: 0.78, head: 0.95 }[rank] * R;
  for (const s of [-1, 1]) { const wg = wing(ws, s, m); wg.position.set(s * re * S[0] * 0.9, ye * S[1] + R * 0.16, -R * 0.06); g.add(wg); }
  if (rank === 'head') { const gm = gem(R * 0.08, '#2E6FE0'); gm.position.set(0, ye * S[1] + R * 0.02, re * S[2] + R * 0.07); g.add(gm); }
  return g;
}

/** 테미스 — 저울(받침 · 기둥 · 가로대 · 두 접시). 바닥이 원점 */
function themis(R, rank) {
  const g = new THREE.Group(), m = metal(rank), m2 = metal(rank, { color: shade(METAL[rank].color, 0.8) }), H = R * 1.45;
  const base = mesh(new THREE.CylinderGeometry(R * 0.26, R * 0.32, R * 0.09, 40), m2); base.position.y = R * 0.045; g.add(base);
  const post = mesh(new THREE.CylinderGeometry(R * 0.03, R * 0.04, H, 16), m); post.position.y = H / 2; g.add(post);
  const fin = mesh(new THREE.SphereGeometry(R * 0.07, 20, 14), m); fin.position.y = H + R * 0.05; g.add(fin);
  const beam = mesh(new THREE.CylinderGeometry(R * 0.022, R * 0.022, R * 1.25, 12), m); beam.rotation.z = PI / 2; beam.position.y = H * 0.9; g.add(beam);
  const panM = m.clone(); panM.side = THREE.DoubleSide;
  for (const s of [-1, 1]) {
    const x = s * R * 0.6, top = H * 0.9, py = top - R * 0.6;
    for (let k = 0; k < 3; k++) { const a = (k / 3) * PI * 2, bx = x + Math.cos(a) * R * 0.17, bz = Math.sin(a) * R * 0.17; const len = Math.hypot(bx - x, top - py, bz); const ch = mesh(new THREE.CylinderGeometry(R * 0.006, R * 0.006, len, 5), m2, false); ch.position.set((x + bx) / 2, (top + py) / 2, bz / 2); ch.lookAt(bx, py, bz); ch.rotateX(PI / 2); g.add(ch); }
    const pan = mesh(new THREE.SphereGeometry(R * 0.22, 32, 12, 0, PI * 2, PI * 0.62, PI * 0.38), panM); pan.position.set(x, py + R * 0.17, 0); g.add(pan);
    const hk = mesh(new THREE.SphereGeometry(R * 0.03, 10, 8), m); hk.position.set(x, top, 0); g.add(hk);
  }
  if (rank === 'head') { const gm = gem(R * 0.08, '#2E6FE0'); gm.position.set(0, H + R * 0.18, 0); g.add(gm); }
  return g;
}

/** 크로노스 — 모래시계(유리 + 모래 + 금속 틀). 바닥이 원점 */
function chronos(R, rank) {
  const g = new THREE.Group(), m = metal(rank), h = R * 0.62;
  const prof = [[0.001, -h], [0.3, -h * 0.97], [0.39, -h * 0.66], [0.31, -h * 0.3], [0.07, -0.03 * R], [0.07, 0.03 * R], [0.31, h * 0.3], [0.39, h * 0.66], [0.3, h * 0.97], [0.001, h]];
  const glass = mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * (r > 0.01 ? R : 1), y)), 48), new THREE.MeshPhysicalMaterial({ color: '#EAF6FF', roughness: 0.04, transmission: 0.9, thickness: R * 0.15, ior: 1.45, transparent: true, opacity: 0.55 }), false);
  const sand = new THREE.MeshPhysicalMaterial({ color: '#E8AE48', roughness: 0.7 });
  const top = mesh(new THREE.ConeGeometry(R * 0.27, h * 0.42, 32), sand); top.rotation.x = PI; top.position.y = h * 0.36;
  const pile = mesh(new THREE.ConeGeometry(R * 0.33, h * 0.36, 32), sand); pile.position.y = -h * 0.75;
  const stream = mesh(new THREE.CylinderGeometry(R * 0.012, R * 0.012, h * 0.6, 6), sand, false); stream.position.y = -h * 0.3;
  const fr = new THREE.Group(); fr.add(glass, top, pile, stream);
  for (const s of [-1, 1]) { const d = mesh(new THREE.CylinderGeometry(R * 0.46, R * 0.46, R * 0.09, 40), m); d.position.y = s * (h + R * 0.045); fr.add(d); }
  for (let k = 0; k < 3; k++) { const a = (k / 3) * PI * 2 + 0.5, p = mesh(new THREE.CylinderGeometry(R * 0.032, R * 0.032, h * 2, 12), m); p.position.set(Math.cos(a) * R * 0.4, 0, Math.sin(a) * R * 0.4); fr.add(p); }
  if (rank === 'head') { const gm = gem(R * 0.07, '#C3423F'); gm.position.y = h + R * 0.16; fr.add(gm); }
  fr.position.y = h + R * 0.09; g.add(fr);
  return g;
}

/** 트리톤 — 소라 나팔(나선 껍데기 + 넓은 입구 + 직급 금속 취구). 바닥이 원점 */
function triton(R, rank) {
  const g = new THREE.Group(), m = metal(rank);
  const shell = vinyl('#F1DCC6', { roughness: 0.35 }), lip = vinyl('#E9A79A', { roughness: 0.3 });
  const body = new THREE.Group(); g.add(body);
  const pts = [], n = 40;
  for (let i = 0; i <= n; i++) { const k = i / n, a = k * PI * 4.2, r = R * (0.05 + 0.33 * k * k); pts.push(V(-R * 0.75 + k * R * 1.15, R * 0.05 + Math.sin(a) * r * 0.55, Math.cos(a) * r * 0.55)); }
  body.add(taperTube(pts, (u) => R * (0.035 + 0.34 * Math.pow(u, 1.6)), shell, { seg: 160, rad: 18 }));
  for (let i = 18; i < n - 4; i += 4) { const sp = mesh(new THREE.ConeGeometry(R * 0.045, R * 0.14, 10), shell); const q = pts[i], up = V(0, Math.sin(i * 0.33 * PI * 4.2 / 4.2), Math.cos(i * 0.33)); sp.position.copy(q).add(V(0, R * 0.12 + i * R * 0.004, 0)); body.add(sp); }
  const bell = mesh(new THREE.TorusGeometry(R * 0.33, R * 0.06, 14, 40), lip); bell.position.copy(pts[n]).add(V(R * 0.02, 0, 0)); bell.rotation.y = PI / 2; body.add(bell);
  const mouth = mesh(new THREE.CylinderGeometry(R * 0.05, R * 0.07, R * 0.16, 16), m); mouth.rotation.z = PI / 2; mouth.position.copy(pts[0]).add(V(-R * 0.08, 0, 0)); body.add(mouth);
  const ring = mesh(new THREE.TorusGeometry(R * 0.075, R * 0.022, 8, 24), m); ring.rotation.y = PI / 2; ring.position.copy(pts[6]); body.add(ring);
  if (rank === 'head') { const gm = gem(R * 0.07, '#2E6FE0'); gm.position.copy(pts[Math.round(n * 0.6)]).add(V(0, R * 0.25, 0)); body.add(gm); }
  body.scale.setScalar(1.45); body.position.y = R * 0.6; body.rotation.set(0.2, -0.5, 0.18);
  return g;
}

/* ───────────────────────── 두 팔·두 다리 공통 포즈 ───────────────────────── */

/**
 * 어깨에서 아래로 늘어진 팔(또는 날개) 둘. rotation.x 음수 = 앞으로, rotation.z = s·각도 = 바깥으로 들기.
 * 서류: read 는 몸 앞(bob), carry·give 는 오른손(-x)에 붙인 docHand 를 쓴다.
 */
function bipedPose(c, tt, mode, p) {
  const { bob, Y0, R, arms, legs, doc, docHand, docZ = R * 1.05, docY = -R * 0.2, roll = 0.08, readArm = -1.2 } = c;
  const [Ra, La] = arms; // Ra = 오른쪽(-x)
  const set = (a, x, z, y = 0) => a.sh.rotation.set(x, y, a.s * z);
  for (const a of arms) { a.base ??= a.sh.position.clone(); a.sh.position.copy(a.base); }
  doc.visible = false; docHand.visible = false;
  for (const L of legs) { L.g.rotation.set(0, 0, 0); L.g.position.y = L.y; }
  switch (mode) {
    case 'type': {
      bob.rotation.x = 0.08;
      for (const a of arms) set(a, -0.95 + Math.max(0, Math.sin(tt * 10 + (a.s > 0 ? 0 : PI))) * 0.14, -0.1);
      break;
    }
    case 'read': {
      bob.rotation.x = 0.13;
      for (const a of arms) set(a, readArm, -0.42);
      doc.visible = true; doc.position.set(0, docY, docZ); doc.rotation.set(-0.5 + Math.sin(tt * 0.6) * 0.04, 0, 0);
      break;
    }
    case 'walk': {
      const ph = p.phase ?? tt * 7, s = Math.sin(ph);
      bob.position.y = Y0 + Math.abs(Math.cos(ph)) * R * 0.05; bob.rotation.z = s * roll; bob.rotation.x = 0.05;
      legs[0].g.rotation.x = s * 0.55; legs[1].g.rotation.x = -s * 0.55;
      legs[0].g.position.y = legs[0].y + Math.max(0, s) * R * 0.05; legs[1].g.position.y = legs[1].y + Math.max(0, -s) * R * 0.05;
      set(La, s * 0.3, 0.12);
      if (p.carry) { set(Ra, -1.1, -0.28); docHand.visible = true; } else set(Ra, -s * 0.3, 0.12);
      break;
    }
    case 'give': {
      bob.rotation.x = 0.1;
      set(Ra, -1.45, -0.12); set(La, 0.05, 0.1); docHand.visible = true;
      break;
    }
    case 'raise': {
      const cyc = (tt % 5) / 5, env = cyc < 0.55 ? sm(Math.min(1, cyc * 7)) * sm(Math.min(1, (0.55 - cyc) * 7)) : 0;
      bob.rotation.z = -0.05; bob.rotation.x = -0.03;
      Ra.sh.position.y += c.raiseLift ?? R * 0.2; Ra.sh.position.x += Ra.s * R * 0.06;
      set(Ra, Math.sin(tt * 8) * 0.22 * env, c.raiseZ ?? 2.75); set(La, 0, 0.1);
      break;
    }
    default: for (const a of arms) set(a, Math.sin(tt * 1.3 + a.s) * 0.05, 0.08 + Math.sin(tt * 1.6 + a.s) * 0.03);
  }
}
function breathe(c, tt) {
  const br = Math.sin(tt * 1.9);
  c.bob.position.set(0, c.Y0 + br * c.R * 0.012, 0); c.bob.rotation.set(0, 0, 0); c.bob.scale.set(1 - br * 0.008, 1 + br * 0.012, 1 - br * 0.008);
}
/** 오른손에 붙여 들고 다니는 서류 */
function handDoc(R, hand) { const d = acc.doc(R); d.visible = false; d.position.set(0, -R * 0.34, R * 0.05); d.rotation.set(PI / 2 - 0.15, 0, 0); hand.add(d); return d; }

/* ───────────────────────── 미나 · 부엉이 (매니저 · 아테나) ───────────────────────── */
export function owl(o = {}) {
  const R = o.R ?? 0.5, S = [1, 1.16, 0.94], LEG = 0.15, rank = o.rank ?? 'lead';
  const col = { body: '#4E5D7A', wing: '#3D4962', belly: '#7F8DA8', face: '#F1E7D3', beak: '#E0A12E', ...o.colors };
  const mBody = vinyl(col.body), mWing = vinyl(col.wing), mBelly = vinyl(col.belly), mFace = vinyl(col.face, { roughness: 0.5, clearcoat: 0.2 }), mBeak = vinyl(col.beak, { roughness: 0.32 });
  const Y0 = LEG + R * S[1] * 0.98;
  const root = new THREE.Group(), bob = grp(root, 0, Y0, 0);
  bob.add(sphere(R, mBody, S, 72, 56));

  // 배 — 옅은 타원 + V자 깃털 무늬
  const belly = sphere(R * 0.6, mBelly, [1, 1.12, 0.5], 48, 32); stick(belly, surface(R, S, [0, -0.38, 0.93]), -R * 0.27); bob.add(belly);
  for (const [x, y] of [[-0.21, -0.2], [0, -0.23], [0.21, -0.2], [-0.11, -0.45], [0.11, -0.45]]) {
    const ch = new THREE.Group(); stick(ch, surface(R, S, [x, y, 0.95]), R * 0.02);
    for (const s of [-1, 1]) { const c = mesh(new THREE.CapsuleGeometry(R * 0.02, R * 0.07, 4, 8), mWing); c.position.x = s * R * 0.032; c.rotation.z = -s * 0.85; ch.add(c); }
    bob.add(ch);
  }
  // 얼굴 — 눈을 감싼 크림색 원 두 개 + 아래 원 하나(하트 모양 얼굴판) + 작은 호박색 부리
  const eyes = [-1, 1].map((s) => {
    const at = surface(R, S, [s * 0.34, 0.3, 0.89]);
    const disc = sphere(R * 0.29, mFace, [1, 1, 0.32], 48, 28); stick(disc, at, -R * 0.065); bob.add(disc);
    const e = eye(R * 0.19); stick(e, at, R * 0.03); bob.add(e);
    return { e, at };
  });
  const chin = sphere(R * 0.18, mFace, [1, 1, 0.32], 32, 20); stick(chin, surface(R, S, [0, 0.1, 0.99]), -R * 0.04); bob.add(chin);
  const beak = mesh(new THREE.ConeGeometry(R * 0.075, R * 0.17, 20), mBeak);
  { const at = surface(R, S, [0, 0.17, 0.98]); beak.position.copy(at.p).addScaledVector(at.n, R * 0.055); beak.rotation.x = PI * 0.8; } bob.add(beak);

  // 날개 — 어깨에서 늘어진 깃털 장갑
  const arms = [-1, 1].map((s) => {
    const sh = grp(bob, s * R * 0.9, R * 0.02, -R * 0.02), w = grp(sh);
    const body = sphere(R * 0.5, mWing, [0.36, 1, 0.62], 40, 28); body.position.set(s * R * 0.05, -R * 0.4, 0); body.rotation.z = s * 0.12; w.add(body);
    for (let i = 0; i < 3; i++) { const f = sphere(R * 0.11, mWing, [0.8, 1.4, 0.7], 20, 14); f.position.set(s * R * (0.05 + i * 0.03), -R * (0.82 + (i === 1 ? 0.05 : 0)), R * (0.13 - i * 0.13)); w.add(f); }
    const hand = grp(sh, s * R * 0.06, -R * 0.8, R * 0.05);
    return { s, sh, hand };
  });
  // 발 — 호박색 세 갈래
  const legs = [-1, 1].map((s) => {
    const g = grp(root, s * R * 0.3, 0, R * 0.1);
    for (const a of [-0.5, 0, 0.5]) { const t = mesh(new THREE.CapsuleGeometry(R * 0.05, R * 0.13, 6, 10), mBeak); t.rotation.order = 'YXZ'; t.rotation.set(PI / 2, a, 0); t.position.set(Math.sin(a) * R * 0.09, R * 0.05, Math.cos(a) * R * 0.09); g.add(t); }
    const leg = mesh(new THREE.CapsuleGeometry(R * 0.075, LEG * 0.8, 6, 10), mBeak); leg.position.set(0, LEG * 0.55, -R * 0.04); g.add(leg);
    return { g, y: 0 };
  });
  // 꼬리깃 — 뒤로 짧게
  for (const a of [-0.35, 0, 0.35]) { const f = featherMesh(R * 0.42, R * 0.2, R * 0.05, mWing); f.rotation.set(0, PI / 2 + a, -0.55); f.position.set(Math.sin(a) * R * 0.15, -R * 0.62, -R * 0.75); bob.add(f); }

  bob.add(emblem3d('athena', R, rank, { S }));
  const doc = acc.doc(R); doc.visible = false; bob.add(doc);
  const docHand = handDoc(R, arms[0].hand);
  const top = grp(bob, 0, R * S[1] + R * 0.62, 0);
  const c = { bob, Y0, R, arms, legs, doc, docHand, docZ: R * 1.12, docY: -R * 0.12, readArm: -1.42, raiseLift: R * 0.12, raiseZ: 2.6 };
  const seed = (o.seed ?? 0) * 1.7;
  return {
    root, bob, top, R, height: Y0 + R * S[1] + R * 0.62, deskGap: R * S[2] + 0.03, species: '부엉이',
    animate(t, mode = 'idle', p = {}) {
      const tt = t + seed; breathe(c, tt);
      for (const e of eyes) e.e.scale.y = blink(tt, o.seed ?? 0);
      bipedPose(c, tt, mode, p);
      if (mode === 'idle') bob.rotation.y = sm(Math.max(0, Math.sin(tt * 0.5) * 1.6 - 0.6)) * 0.3 * Math.sign(Math.sin(tt * 0.23)); // 가끔 고개(몸)를 돌린다
    },
  };
}

/* ───────────────────────── 준 · 여우 (리서처 · 아르테미스) ───────────────────────── */
export function fox(o = {}) {
  const R = o.R ?? 0.46, S = [1, 1.0, 0.92], LEG = 0.36, rank = o.rank ?? 'mid';
  const col = { body: '#E8742F', cream: '#F6E6CF', dark: '#3B2A22', ...o.colors };
  const mBody = vinyl(col.body), mCream = vinyl(col.cream, { roughness: 0.48 }), mDark = vinyl(col.dark, { roughness: 0.45 });
  const Y0 = LEG + R * S[1] * 0.96;
  const root = new THREE.Group(), bob = grp(root, 0, Y0, 0);
  bob.add(sphere(R, mBody, S, 72, 56));
  // 가슴 · 볼 · 주둥이(크림) + 검은 코
  const chest = sphere(R * 0.58, mCream, [1, 1.1, 0.5], 44, 30); stick(chest, surface(R, S, [0, -0.5, 0.86]), -R * 0.26); bob.add(chest);
  for (const s of [-1, 1]) { const ck = sphere(R * 0.24, mCream, [1.15, 0.8, 0.55], 32, 20); stick(ck, surface(R, S, [s * 0.46, 0.0, 0.88]), -R * 0.08); bob.add(ck); }
  const mAt = surface(R, S, [0, 0.04, 1]);
  const muzzle = sphere(R * 0.28, mCream, [1.15, 0.78, 0.95], 40, 28); muzzle.position.copy(mAt.p).addScaledVector(mAt.n, R * 0.02); bob.add(muzzle);
  const nose = sphere(R * 0.07, mDark, [1.3, 0.85, 1], 20, 14); nose.position.copy(muzzle.position).add(V(0, R * 0.08, R * 0.26)); bob.add(nose);
  const eyes = [-1, 1].map((s) => { const at = surface(R, S, [s * 0.33, 0.38, 0.86]); const e = eye(R * 0.16); stick(e, at, 0.001); bob.add(e); return { e, at }; });
  // 큰 귀 — 둥근 삼각형 + 크림 안쪽 + 짙은 귀 끝
  const earShape = (k) => { const s = new THREE.Shape(), w = R * 0.24 * k, h = R * 0.6 * k; s.moveTo(-w, 0); s.quadraticCurveTo(-w * 0.75, h * 0.62, -w * 0.08, h * 0.97); s.quadraticCurveTo(0, h * 1.03, w * 0.08, h * 0.97); s.quadraticCurveTo(w * 0.75, h * 0.62, w, 0); s.quadraticCurveTo(0, -h * 0.1, -w, 0); return s; };
  const tipShape = () => { const s = new THREE.Shape(), w = R * 0.115, h0 = R * 0.36, h = R * 0.6; s.moveTo(-w, h0); s.quadraticCurveTo(-w * 0.6, h * 0.82, -R * 0.02, h * 0.97); s.quadraticCurveTo(0, h * 1.03, R * 0.02, h * 0.97); s.quadraticCurveTo(w * 0.6, h * 0.82, w, h0); s.quadraticCurveTo(0, h0 - R * 0.04, -w, h0); return s; };
  const ears = [-1, 1].map((s) => {
    const at = surface(R, S, [s * 0.5, 0.86, 0.02]), g = grp(bob);
    g.position.copy(at.p).add(V(0, -R * 0.06, 0)); g.rotation.set(-0.1, 0, -s * 0.32);
    g.add(extrude(earShape(1), R * 0.07, R * 0.04, mBody, 20));
    const inner = extrude(earShape(0.62), R * 0.03, R * 0.02, mCream, 16); inner.position.set(0, R * 0.05, R * 0.06); g.add(inner);
    const tip = extrude(tipShape(), R * 0.08, R * 0.045, mDark, 16); tip.position.z = R * 0.004; g.add(tip);
    return g;
  });
  // 팔 · 짙은 앞발
  const arms = [-1, 1].map((s) => {
    const sh = grp(bob, s * R * 0.84, -R * 0.14, R * 0.06);
    const up = mesh(new THREE.CapsuleGeometry(R * 0.1, R * 0.3, 6, 14), mBody); up.position.y = -R * 0.22; sh.add(up);
    const hand = grp(sh, 0, -R * 0.48, 0);
    hand.add(sphere(R * 0.125, mDark, [1, 1.05, 0.95], 20, 14));
    return { s, sh, hand };
  });
  // 다리 — 짙은 갈색 양말 + 발
  const legs = [-1, 1].map((s) => {
    const g = grp(root, s * R * 0.32, LEG, 0);
    const lg = mesh(new THREE.CapsuleGeometry(R * 0.12, LEG - R * 0.2, 6, 14), mDark); lg.position.y = -LEG / 2 + R * 0.04; g.add(lg);
    const ft = sphere(R * 0.14, mDark, [1, 0.6, 1.35], 20, 14); ft.position.set(0, -LEG + R * 0.08, R * 0.08); g.add(ft);
    return { g, y: LEG };
  });
  // 꼬리 — 크고 풍성하게, 끝은 흰색
  const tailCol = (u) => new THREE.Color(col.body).lerp(new THREE.Color(col.cream), sm(Math.min(1, Math.max(0, (u - 0.72) / 0.2))));
  const tailPts = [[0, -R * 0.42, -R * 0.62], [R * 0.3, -R * 0.62, -R * 1.02], [R * 0.85, -R * 0.36, -R * 1.12], [R * 1.12, R * 0.12, -R * 0.84], [R * 1.02, R * 0.52, -R * 0.52]];
  const tail = taperTube(tailPts, (u) => R * (0.12 + 0.3 * Math.pow(Math.sin(PI * Math.min(1, u * 0.96)), 0.7)), vinyl('#ffffff', { vertexColors: true }), { seg: 80, rad: 20, colorFn: tailCol, endMat: mCream });
  const tailG = grp(bob, 0, 0, 0); tailG.add(tail);
  bob.add(emblem3d('artemis', R, rank, { S }));
  const doc = acc.doc(R); doc.visible = false; bob.add(doc);
  const docHand = handDoc(R, arms[0].hand);
  const top = grp(bob, 0, R * S[1] + R * 0.62, 0);
  const c = { bob, Y0, R, arms, legs, doc, docHand, docZ: R * 1.12 };
  const seed = (o.seed ?? 0) * 1.7;
  return {
    root, bob, top, R, height: Y0 + R * S[1] + R * 0.6, deskGap: R * S[2] + R * 0.22, species: '여우',
    animate(t, mode = 'idle', p = {}) {
      const tt = t + seed; breathe(c, tt);
      for (const e of eyes) e.e.scale.y = blink(tt, o.seed ?? 0);
      bipedPose(c, tt, mode, p);
      tailG.rotation.set(0, Math.sin(tt * (mode === 'walk' ? 6 : 1.3)) * (mode === 'walk' ? 0.16 : 0.1), 0);
      ears.forEach((e, i) => { e.rotation.x = -0.1 + Math.sin(tt * 1.1 + i * 2) * 0.04; });
    },
  };
}

/* ───────────────────────── 하나 · 문어 (작가 · 칼리오페) ───────────────────────── */
export function octopusWriter(o = {}) {
  const R = o.R ?? 0.5, S = [1, 1.06, 0.97], rank = o.rank ?? 'new';
  const col = { body: '#5B4BC4', spot: '#8E80E8', ink: '#24204F', ...o.colors };
  const mBody = vinyl(col.body), mArm = vinyl('#ffffff', { vertexColors: true }), mSpot = vinyl(col.spot, { roughness: 0.45 });
  const SK = 0.56, Y0 = SK + R * S[1] * 0.78;
  const root = new THREE.Group(), bob = grp(root, 0, Y0, 0);
  bob.add(sphere(R, mBody, S, 72, 52));
  for (const [x, y, z, r] of [[0.62, 0.32, 0.45, 0.085], [0.28, 0.82, 0.32, 0.07], [-0.66, 0.28, 0.42, 0.08], [-0.3, 0.8, 0.4, 0.06], [0.8, 0.05, -0.25, 0.07], [-0.78, 0.08, -0.32, 0.075], [0.1, 0.86, -0.3, 0.065], [0.45, 0.35, -0.72, 0.08], [-0.42, 0.32, -0.75, 0.07], [0.0, 0.42, -0.9, 0.06]]) {
    const sp = sphere(R * r, mSpot, [1, 1, 0.3], 20, 14); stick(sp, surface(R, S, [x, y, z]), -R * r * 0.12); bob.add(sp);
  }
  const eyes = [-1, 1].map((s) => { const at = surface(R, S, [s * 0.35, 0.02, 0.94]); const e = eye(R * 0.165); stick(e, at, 0.001); bob.add(e); return { e, at }; });
  bob.add(emblem3d('calliope', R, rank, { S }));
  const top = grp(bob, 0, R * S[1] + R * 0.34, 0);

  // 다리 8개 — 0 = 앞왼쪽(+x) … 7 = 앞오른쪽(-x). 끝은 잉크빛
  const armsG = grp(root);
  const ANG = Array.from({ length: 8 }, (_, k) => ((k + 0.5) / 8) * PI * 2);
  const arms = ANG.map(() => { const a = new Tentacle(mArm, { r0: R * 0.15, r1: R * 0.035, body: col.body, tipColor: col.ink }); armsG.add(a.group); return a; });
  const pen = quill(R * 0.75), doc = acc.doc(R);
  const drop = mesh(new THREE.SphereGeometry(R * 0.04, 14, 10), vinyl(col.ink, { roughness: 0.12, clearcoat: 1 }), false);
  root.add(pen, doc, drop);
  const seed = (o.seed ?? 0) * 1.7, gap = R * S[2] + 0.02;
  const base = (k, y) => V(Math.sin(ANG[k]) * R * 0.48, y, Math.cos(ANG[k]) * R * 0.48);
  const holdPen = (A, write = false, tt = 0) => {
    pen.visible = true; pen.position.copy(A.tip).add(V(0, R * 0.02, 0));
    const dir = write ? V(0.25 + Math.sin(tt * 7) * 0.12, 1, -0.35 + Math.cos(tt * 7) * 0.1) : A.dir.clone().lerp(V(0, 1, 0), 0.5);
    pen.quaternion.copy(basisQuat(dir, V(0, 0, 1)));
  };

  return {
    root, bob, top, R, height: Y0 + R * S[1] + R * 0.3, deskGap: gap, species: '문어',
    animate(t, mode = 'idle', p = {}) {
      const tt = t + seed, br = Math.sin(tt * 1.8);
      bob.position.set(0, Y0 + br * R * 0.018, 0); bob.rotation.set(0, 0, Math.sin(tt * 0.9) * 0.025); bob.scale.set(1 - br * 0.01, 1 + br * 0.015, 1 - br * 0.01);
      for (const e of eyes) e.e.scale.y = blink(tt, o.seed ?? 0);
      doc.visible = false; drop.visible = false; pen.visible = false;
      const by = bob.position.y - R * S[1] * 0.55, glide = mode === 'walk';
      if (glide) { bob.position.y += R * 0.12 + Math.sin(p.phase ?? tt * 4) * R * 0.03; bob.rotation.x = 0.12; }
      if (mode === 'give') bob.rotation.x = 0.08;
      const hold = new Set();
      const hand = (k, target, opt) => { hold.add(k); reachArm(arms[k], base(k, by), [Math.sin(ANG[k]), Math.cos(ANG[k])], target, opt); arms[k].update(); };
      const wv = (k) => Math.sin(tt * 2 + k * 0.9);
      switch (mode) {
        case 'type': { // 왼쪽 다리로 자판, 오른쪽 다리로 깃펜 메모
          const tz = gap + 0.25;
          hand(0, V(R * 0.8, DESK_TOP + 0.04 + Math.max(0, Math.sin(tt * 10)) * 0.07, tz), { sag: 0.08 });
          hand(1, V(R * 0.45, DESK_TOP + 0.04 + Math.max(0, Math.sin(tt * 10 + PI)) * 0.07, tz + 0.05), { sag: 0.08 });
          hand(7, V(-R * 0.85 + Math.sin(tt * 7) * R * 0.06, DESK_TOP + R * 0.42, tz + Math.cos(tt * 7) * R * 0.04), { sag: 0.06 }); holdPen(arms[7], true, tt);
          const u = (tt % 2.6) / 2.6;
          if (u < 0.5) { drop.visible = true; const k = u / 0.5; drop.position.copy(pen.position).add(V(0, -R * 0.12 - k * k * R * 0.35, 0)); drop.scale.setScalar(1 - k * 0.6); }
          break;
        }
        case 'read': {
          const dy = Y0 - R * 0.5, dz = R * 1.15;
          hand(0, V(R * 0.3, dy - R * 0.28, dz)); hand(7, V(-R * 0.3, dy - R * 0.28, dz));
          hand(1, V(R * 1.05, Y0 + R * 0.05, R * 0.4)); holdPen(arms[1]);
          doc.visible = true; doc.position.set(0, dy, dz); doc.rotation.set(-0.55 + Math.sin(tt * 0.6) * 0.04, 0, 0);
          break;
        }
        case 'walk': {
          if (p.carry) { hand(0, V(R * 0.45, Y0 - R * 0.35, R * 1.25)); doc.visible = true; doc.position.copy(arms[0].tip).add(V(-R * 0.12, R * 0.1, R * 0.05)); doc.rotation.set(-0.35, -0.25, -0.1); }
          hand(7, V(-R * 0.95, Y0 - R * 0.1 + Math.sin(tt * 3) * R * 0.05, R * 0.55)); holdPen(arms[7]);
          break;
        }
        case 'give': {
          hand(0, V(R * 0.35, Y0 - R * 0.2, R * 1.95), { sag: 0.05, bulge: 0.12 });
          doc.visible = true; doc.position.copy(arms[0].tip).add(V(0, R * 0.12, R * 0.08)); doc.rotation.set(-1.05, -0.15, 0);
          hand(7, V(-R * 0.95, Y0 - R * 0.25, R * 0.55)); holdPen(arms[7]);
          break;
        }
        case 'raise': {
          const cyc = (tt % 5) / 5, env = cyc < 0.55 ? sm(Math.min(1, cyc * 7)) * sm(Math.min(1, (0.55 - cyc) * 7)) : 0;
          hand(7, V(-R * 1.05 + Math.sin(tt * 8) * R * 0.18 * env, Y0 + R * 1.25, R * 0.3), { sag: -0.05 }); holdPen(arms[7]);
          break;
        }
        default: {
          hand(7, V(-R * 1.0 + wv(2) * R * 0.05, Y0 + R * 0.1 + wv(3) * R * 0.05, R * 0.55)); holdPen(arms[7]);
          hand(0, V(R * 0.95 + wv(0) * R * 0.04, Y0 - R * 0.35 + wv(1) * R * 0.05, R * 0.6));
        }
      }
      arms.forEach((A, k) => { if (!hold.has(k)) { floorArm(A, base(k, by), ANG[k], { reach: R * 1.55, r: R * 0.06, curl: R * 0.4, w: wv(k), trail: glide ? R * 1.1 : 0, lift: glide ? R * 0.18 : 0 }); A.update(); } });
    },
  };
}

/* ───────────────────────── 레오 · 카멜레온 (디자이너 · 이리스) ───────────────────────── */

/** 카멜레온 피부 — 초록 바탕 위로 청록 → 자홍 → 호박 띠가 비스듬히 흘러간다 */
function chameleonSkin() {
  const m = vinyl('#ffffff', { roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.22 });
  const u = { uTime: { value: 0 }, uOrigin: { value: new THREE.Vector3() } };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = u.uTime; sh.uniforms.uOrigin = u.uOrigin;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSkinP;\nuniform vec3 uOrigin;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkinP = (modelMatrix * vec4(position, 1.0)).xyz - uOrigin;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vSkinP; uniform float uTime;
vec3 chamSkin(vec3 p) {
  vec3 green = vec3(0.035, 0.32, 0.1), deep = vec3(0.012, 0.16, 0.055);
  vec3 teal = vec3(0.016, 0.45, 0.38), magenta = vec3(0.64, 0.07, 0.33), amber = vec3(0.87, 0.36, 0.045);
  float w = dot(p, normalize(vec3(0.35, 1.0, 0.2))) * 30.0 - uTime * 1.6;
  float band = smoothstep(0.7, 0.95, 0.5 + 0.5 * sin(w + sin(p.x * 9.0 + p.z * 7.0) * 0.6));
  float idx = mod(floor(w / 6.2831853 + 0.5) + floor(uTime * 0.2), 3.0);
  vec3 bc = idx < 0.5 ? teal : (idx < 1.5 ? magenta : amber);
  float spots = smoothstep(0.86, 0.97, 0.5 + 0.5 * sin(p.x * 43.0 + sin(p.y * 31.0) * 2.0) * sin(p.y * 37.0 + p.z * 29.0));
  vec3 c = mix(green, deep, 0.35 * (0.5 + 0.5 * sin(p.y * 6.0 + p.x * 3.0)));
  c = mix(c, bc, band * 0.78);
  return c + spots * vec3(0.06, 0.12, 0.05);
}`).replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = chamSkin(vSkinP);');
  };
  m.customProgramCacheKey = () => 'messenger-chameleon-skin-v2';
  return { m, u };
}

export function chameleon(o = {}) {
  const R = o.R ?? 0.48, S = [0.92, 1.05, 0.9], LEG = 0.34, rank = o.rank ?? 'mid';
  const { m: skin, u } = chameleonSkin();
  const Y0 = LEG + R * S[1] * 0.97;
  const root = new THREE.Group(), bob = grp(root, 0, Y0, 0);
  bob.add(sphere(R, skin, S, 80, 60));
  // 머리 볏(casque) — 이마에서 뒤로 솟은 둥근 판
  const cq = new THREE.Shape(), P = (x, y) => [x * R, y * R]; // x = -z(뒤쪽 +), y = y
  cq.moveTo(...P(-0.42, 0.88)); cq.quadraticCurveTo(...P(-0.12, 1.1), ...P(0.3, 1.13)); cq.quadraticCurveTo(...P(0.56, 1.1), ...P(0.68, 0.8)); cq.quadraticCurveTo(...P(0.2, 0.86), ...P(-0.42, 0.88));
  const casque = extrude(cq, R * 0.08, R * 0.05, skin, 24); casque.rotation.y = PI / 2; casque.scale.set(S[2], S[1], 1); casque.position.y = -R * 0.02; bob.add(casque);
  // 주둥이 — 입선 없이 살짝 튀어나온 코끝
  const snout = sphere(R * 0.24, skin, [0.92, 0.7, 1], 40, 28); { const at = surface(R, S, [0, 0.05, 1]); snout.position.copy(at.p).addScaledVector(at.n, -R * 0.05); } bob.add(snout);
  // 포탑 눈 — 양옆에서 앞쪽으로 튀어나온 원뿔 + 끝의 점 눈. 두 눈이 따로 돈다
  const turrets = [-1, 1].map((s) => {
    const at = surface(R, S, [s * 0.6, 0.4, 0.7]), tg = grp(bob);
    tg.position.copy(at.p).addScaledVector(at.n, -R * 0.05);
    const base = new THREE.Quaternion().setFromUnitVectors(UP, at.n.clone().lerp(V(0, 0, 1), 0.55).normalize()); tg.quaternion.copy(base);
    const sock = mesh(new THREE.CylinderGeometry(R * 0.16, R * 0.23, R * 0.3, 32), skin); sock.position.y = R * 0.13; tg.add(sock);
    const cap = sphere(R * 0.16, skin, [1, 0.42, 1], 28, 14); cap.position.y = R * 0.28; tg.add(cap);
    const e = eye(R * 0.14); e.position.y = R * 0.352; e.rotation.x = -PI / 2; tg.add(e);
    return { tg, base, e, s };
  });
  // 팔 · 두 갈래 손
  const arms = [-1, 1].map((s) => {
    const sh = grp(bob, s * R * 0.82, -R * 0.14, R * 0.08);
    const up = mesh(new THREE.CapsuleGeometry(R * 0.085, R * 0.3, 6, 14), skin); up.position.y = -R * 0.21; sh.add(up);
    const hand = grp(sh, 0, -R * 0.46, 0);
    for (const k of [-1, 1]) { const f = sphere(R * 0.075, skin, [0.8, 1.3, 0.85], 16, 12); f.position.set(k * R * 0.05, -R * 0.03, k * R * 0.02); f.rotation.z = k * 0.35; hand.add(f); }
    return { s, sh, hand };
  });
  const br = acc.brush(R * 0.72); br.position.set(0, -R * 0.02, R * 0.07); br.rotation.set(0.75, 0, 0.25); arms[0].hand.add(br);
  // 다리 — 두 갈래 발
  const legs = [-1, 1].map((s) => {
    const g = grp(root, s * R * 0.3, LEG, 0);
    const lg = mesh(new THREE.CapsuleGeometry(R * 0.1, LEG - R * 0.18, 6, 14), skin); lg.position.y = -LEG / 2 + R * 0.04; g.add(lg);
    for (const k of [-1, 1]) { const f = sphere(R * 0.09, skin, [0.8, 0.55, 1.3], 16, 12); f.position.set(k * R * 0.06, -LEG + R * 0.05, R * 0.07); f.rotation.y = k * 0.3; g.add(f); }
    return { g, y: LEG };
  });
  // 말린 꼬리 — 등 아래에서 나와 옆으로 비껴 나선으로 감긴다
  const tailPts = [], beta = 1.0, A = [0.62 * R, -0.5 * R], rho0 = 0.36 * R, C = [A[0] + rho0, A[1]];
  tailPts.push(V(Math.sin(beta) * R * 0.35, -R * 0.42, -Math.cos(beta) * R * 0.35));
  for (let i = 0; i <= 30; i++) { const th = PI + (i / 30) * PI * 2.7, rho = rho0 * Math.exp(-0.33 * (th - PI)); const uu = C[0] + rho * Math.cos(th), vv = C[1] + rho * Math.sin(th); tailPts.push(V(Math.sin(beta) * uu, vv, -Math.cos(beta) * uu)); }
  const tail = taperTube(tailPts, (t) => R * (0.13 * (1 - t) + 0.035), skin, { seg: 140, rad: 14 }); bob.add(tail);
  // 이리스 무지개 — 머리 뒤에 떠 있다
  const rb = emblem3d('iris', R * 0.98, rank); rb.position.set(0, R * 0.4, -R * 0.42); bob.add(rb);
  const doc = acc.doc(R); doc.visible = false; bob.add(doc);
  const docHand = handDoc(R, arms[0].hand);
  const top = grp(bob, 0, R * 1.42, 0);
  const c = { bob, Y0, R, arms, legs, doc, docHand, docZ: R * 1.05 };
  const seed = (o.seed ?? 0) * 1.7, q = new THREE.Quaternion(), E = new THREE.Euler();
  return {
    root, bob, top, R, height: Y0 + R * 1.42, deskGap: R * S[2] + 0.05, species: '카멜레온',
    animate(t, mode = 'idle', p = {}) {
      const tt = t + seed; breathe(c, tt);
      u.uTime.value = tt * (mode === 'raise' ? 1.8 : 1); bob.getWorldPosition(u.uOrigin.value);
      bipedPose(c, tt, mode, p);
      for (const T of turrets) {
        const look = mode === 'type' || mode === 'read' ? [0.35, 0] : [Math.sin(tt * 0.8 + T.s * 1.7) * 0.32, Math.cos(tt * 0.55 * T.s + 1) * 0.3];
        E.set(look[0], 0, look[1]); T.tg.quaternion.copy(T.base).multiply(q.setFromEuler(E));
        T.e.scale.y = blink(tt + (T.s > 0 ? 0.3 : 0), o.seed ?? 0);
      }
      rb.position.y = R * 0.4 + Math.sin(tt * 1.3) * R * 0.03; rb.rotation.z = Math.sin(tt * 0.7) * 0.05;
      tail.rotation.y = Math.sin(tt * 0.9) * 0.06;
    },
  };
}

/* ───────────────────────── 시안 캐스트 ───────────────────────── */
const tagged = (c, species) => Object.assign(c, { species });
export const CAST3D = {
  mina: (o) => tagged(owl({ rank: 'lead', seed: 1, ...o }), '부엉이'),
  jun: (o) => tagged(fox({ rank: 'mid', seed: 2, ...o }), '여우'),
  hana: (o) => tagged(octopusWriter({ rank: 'new', seed: 3, ...o }), '문어'),
  leo: (o) => tagged(chameleon({ rank: 'mid', seed: 4, ...o }), '카멜레온'),
};
