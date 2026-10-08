// 가구·소품 — kit(재질 묶음 + 모서리 둥글기 + 분할 수)만 바꾸면 컨셉마다 다른 사무실이 된다
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng } from './tex.js';

const PI = Math.PI;
const mat = (kit, m) => (typeof m === 'string' ? kit.m[m] ?? kit.m.white : m);

export function mk(geo, material, cast = true) { const m = new THREE.Mesh(geo, material); m.castShadow = cast; m.receiveShadow = true; return m; }

/** 가운데 기준 상자. r>0 이면 둥근 모서리 */
export function box(kit, w, h, d, m, x = 0, y = 0, z = 0, r = kit.r ?? 0) {
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const geo = rr > 0.0008 ? new RoundedBoxGeometry(w, h, d, kit.flat ? 1 : 3, rr) : new THREE.BoxGeometry(w, h, d);
  const me = mk(geo, mat(kit, m)); me.position.set(x, y, z); return me;
}
export function cyl(kit, rt, rb, h, m, x = 0, y = 0, z = 0, seg = kit.seg ?? 24) {
  const me = mk(new THREE.CylinderGeometry(rt, rb, h, kit.flat ? Math.min(seg, 7) : seg), mat(kit, m)); me.position.set(x, y, z); return me;
}
export function sph(kit, r, m, x = 0, y = 0, z = 0, seg = kit.seg ?? 24) {
  const s = kit.flat ? 1 : seg;
  const geo = kit.flat ? new THREE.IcosahedronGeometry(r, 1) : new THREE.SphereGeometry(r, s, Math.round(s * 0.7));
  const me = mk(geo, mat(kit, m)); me.position.set(x, y, z); return me;
}
const G = (...kids) => { const g = new THREE.Group(); kids.flat().forEach((k) => k && g.add(k)); return g; };
const at = (o, x, y, z, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; return o; };

/** 바닥 + 뒷벽(창 구멍) + 왼벽. 단면 모형은 opts.cut 으로 벽 윗면을 드러낸다 */
export function room(kit, o = {}) {
  const { x0 = -5, x1 = 5, z0 = -4, z1 = 4, h = 2.9, t = 0.14, floorT = 0.1, win = { x0: 0.5, x1: 4.3, y0: 0.75, y1: 2.45 } } = o;
  const g = new THREE.Group();
  const W = x1 - x0, Dp = z1 - z0;
  const floor = box(kit, W + t, floorT, Dp + t, 'floor', (x0 + x1) / 2 - t / 2, -floorT / 2, (z0 + z1) / 2 - t / 2, 0);
  floor.castShadow = false; g.add(floor);
  const bz = z0 - t / 2;
  const piece = (ax, bx, ay, by) => { if (bx - ax > 1e-3 && by - ay > 1e-3) g.add(box(kit, bx - ax, by - ay, t, 'wall', (ax + bx) / 2, (ay + by) / 2, bz, 0)); };
  if (win) { piece(x0 - t, win.x0, 0, h); piece(win.x1, x1, 0, h); piece(win.x0, win.x1, 0, win.y0); piece(win.x0, win.x1, win.y1, h); }
  else piece(x0 - t, x1, 0, h);
  g.add(box(kit, t, h, Dp, kit.m.wall2 ? 'wall2' : 'wall', x0 - t / 2, h / 2, (z0 + z1) / 2, 0));
  if (kit.m.cut) { // 잘린 벽 윗면(폼보드 단면)
    g.add(box(kit, W + t, 0.012, t, 'cut', (x0 + x1) / 2 - t / 2, h + 0.006, bz, 0));
    g.add(box(kit, t, 0.012, Dp, 'cut', x0 - t / 2, h + 0.006, (z0 + z1) / 2, 0));
  }
  if (kit.m.trim) {
    g.add(box(kit, W, 0.09, 0.016, 'trim', (x0 + x1) / 2, 0.045, z0 + 0.008, 0));
    g.add(box(kit, 0.016, 0.09, Dp, 'trim', x0 + 0.008, 0.045, (z0 + z1) / 2, 0));
  }
  if (win) g.add(windowFrame(kit, win, z0, t, o.mullions ?? 3));
  return g;
}

export function windowFrame(kit, win, z0, t, mullions = 3) {
  const g = new THREE.Group();
  const fw = kit.frameW ?? 0.05, fd = t + 0.03, W = win.x1 - win.x0, H = win.y1 - win.y0, cx = (win.x0 + win.x1) / 2, cy = (win.y0 + win.y1) / 2, z = z0 - t / 2;
  const F = kit.m.frame ? 'frame' : 'trim';
  g.add(box(kit, W + fw * 2, fw, fd, F, cx, win.y0 - fw / 2, z, 0), box(kit, W + fw * 2, fw, fd, F, cx, win.y1 + fw / 2, z, 0));
  g.add(box(kit, fw, H, fd, F, win.x0 - fw / 2, cy, z, 0), box(kit, fw, H, fd, F, win.x1 + fw / 2, cy, z, 0));
  for (let i = 1; i < mullions; i++) g.add(box(kit, fw * 0.6, H, fd * 0.6, F, win.x0 + (W * i) / mullions, cy, z, 0));
  if (kit.transom !== false) g.add(box(kit, W, fw * 0.6, fd * 0.6, F, cx, win.y0 + H * 0.68, z, 0));
  if (kit.m.sill) g.add(box(kit, W + 0.1, 0.03, 0.22, 'sill', cx, win.y0 - 0.015, z0 + 0.08, 0.005));
  if (kit.m.glass) { const gl = mk(new THREE.PlaneGeometry(W, H), kit.m.glass, false); gl.position.set(cx, cy, z); g.add(gl); }
  return g;
}

/** 하늘·바깥 풍경 판 — 창 너머 */
export function backdrop(material, { cx = 2.4, cy = 1.6, z = -6.5, w = 9, h = 5.5 } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material); m.position.set(cx, cy, z); return m;
}

export function desk(kit, { w = 1.5, d = 0.75, h = 0.72, legs = kit.deskLegs ?? 'panel', cabinet = true } = {}) {
  const g = new THREE.Group(), T = 0.035;
  g.add(box(kit, w, T, d, 'deskTop' in kit.m ? 'deskTop' : 'wood', 0, h - T / 2, 0, Math.min(kit.r ?? 0, 0.012)));
  if (legs === 'metal') {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(kit, 0.016, 0.016, h - T, 'metal', sx * (w / 2 - 0.06), (h - T) / 2, sz * (d / 2 - 0.06), 10));
    g.add(box(kit, w - 0.12, 0.05, 0.02, 'metal', 0, h - T - 0.04, d / 2 - 0.06, 0));
  } else {
    for (const sx of [-1, 1]) g.add(box(kit, 0.035, h - T, d - 0.04, 'deskLeg' in kit.m ? 'deskLeg' : 'wood', sx * (w / 2 - 0.03), (h - T) / 2, 0, Math.min(kit.r ?? 0, 0.008)));
    g.add(box(kit, w - 0.1, 0.3, 0.018, 'deskLeg' in kit.m ? 'deskLeg' : 'wood', 0, h - T - 0.17, d / 2 - 0.06, 0));
  }
  if (cabinet) {
    const cx = w / 2 - 0.3;
    g.add(box(kit, 0.4, 0.56, d - 0.12, 'cabinet' in kit.m ? 'cabinet' : 'white', cx, 0.3, 0.02, Math.min(kit.r ?? 0, 0.01)));
    for (let i = 0; i < 3; i++) g.add(box(kit, 0.12, 0.012, 0.012, 'metal', cx, 0.2 + i * 0.18, -d / 2 + 0.055, 0));
  }
  return g;
}

export function monitor(kit, screenMat, { w = 0.58, h = 0.35 } = {}) {
  const g = new THREE.Group(), y0 = 0.12;
  g.add(box(kit, w, h, 0.024, 'device' in kit.m ? 'device' : 'black', 0, y0 + h / 2, 0, Math.min(kit.r ?? 0, 0.008)));
  const s = mk(new THREE.PlaneGeometry(w - 0.024, h - 0.024), screenMat, false); s.position.set(0, y0 + h / 2, 0.0125); g.add(s);
  g.add(box(kit, 0.04, y0 + 0.04, 0.02, 'device' in kit.m ? 'device' : 'black', 0, (y0 + 0.04) / 2, -0.03, 0));
  g.add(box(kit, 0.2, 0.012, 0.15, 'device' in kit.m ? 'device' : 'black', 0, 0.006, -0.02, 0.004));
  return g;
}

export function laptop(kit, screenMat, open = 1.85) {
  const g = new THREE.Group();
  g.add(box(kit, 0.32, 0.014, 0.22, 'deviceLight' in kit.m ? 'deviceLight' : 'metal', 0, 0.007, 0, 0.004));
  const hinge = new THREE.Group(); hinge.position.set(0, 0.014, 0.11); hinge.rotation.x = open - PI / 2; g.add(hinge);
  hinge.add(box(kit, 0.32, 0.215, 0.007, 'deviceLight' in kit.m ? 'deviceLight' : 'metal', 0, 0.1075, 0, 0.003));
  const s = mk(new THREE.PlaneGeometry(0.3, 0.19), screenMat, false); s.position.set(0, 0.11, -0.0045); s.rotation.y = PI; hinge.add(s);
  return g;
}

export function keyboard(kit) { return G(box(kit, 0.4, 0.016, 0.13, 'deviceLight' in kit.m ? 'deviceLight' : 'white', 0, 0.008, 0, 0.004), box(kit, 0.06, 0.02, 0.1, 'deviceLight' in kit.m ? 'deviceLight' : 'white', 0.3, 0.01, 0.02, 0.01)); }

export function chair(kit, { seat = 0.46, m = 'chair', back = true, arms = false } = {}) {
  const g = new THREE.Group(), c = kit.m[m] ? m : 'fabric';
  g.add(box(kit, 0.48, 0.07, 0.46, c, 0, seat - 0.035, -0.03, 0.03));
  if (back) { const b = box(kit, 0.46, 0.5, 0.06, c, 0, seat + 0.32, -0.28, 0.03); b.rotation.x = -0.1; g.add(b); g.add(box(kit, 0.05, 0.3, 0.03, 'metal', 0, seat + 0.08, -0.3, 0)); }
  if (arms) for (const s of [-1, 1]) g.add(box(kit, 0.05, 0.03, 0.3, 'metal', s * 0.27, seat + 0.2, -0.05, 0.01), box(kit, 0.03, 0.2, 0.03, 'metal', s * 0.27, seat + 0.1, -0.05, 0));
  g.add(cyl(kit, 0.024, 0.024, seat - 0.13, 'metal', 0, 0.065 + (seat - 0.13) / 2, -0.03, 10));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * PI * 2, arm = box(kit, 0.3, 0.028, 0.04, 'metal', 0, 0.06, 0, 0.008); arm.position.set(Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15 - 0.03); arm.rotation.y = -a; g.add(arm);
    g.add(sph(kit, 0.024, 'black', Math.cos(a) * 0.29, 0.024, Math.sin(a) * 0.29 - 0.03, 10));
  }
  return g;
}

export function sideChair(kit, m = 'chair2') {
  const c = kit.m[m] ? m : 'fabric';
  const g = G(box(kit, 0.44, 0.05, 0.44, c, 0, 0.45, 0, 0.02), box(kit, 0.44, 0.34, 0.04, c, 0, 0.68, -0.2, 0.015));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(kit, 0.014, 0.012, 0.43, kit.m.legs ? 'legs' : 'woodDark', sx * 0.18, 0.215, sz * 0.18, 8));
  return g;
}

export function roundTable(kit, { r = 0.62, h = 0.74, top = 'tableTop' } = {}) {
  const t = kit.m[top] ? top : 'wood';
  return G(cyl(kit, r, r, 0.035, t, 0, h - 0.0175, 0, 48), cyl(kit, 0.04, 0.05, h - 0.035, 'metal', 0, (h - 0.035) / 2, 0, 16), cyl(kit, 0.3, 0.32, 0.03, 'metal', 0, 0.015, 0, 32));
}

export function sofa(kit, { w = 1.95, d = 0.88, m = 'sofa' } = {}) {
  const c = kit.m[m] ? m : 'fabric', g = new THREE.Group(), L = 0.08;
  g.add(box(kit, w, 0.22, d, c, 0, L + 0.11, 0, 0.04));
  for (const s of [-1, 1]) g.add(box(kit, w / 2 - 0.2, 0.14, d - 0.26, c, s * (w / 4 - 0.02), L + 0.29, 0.1, 0.06));
  g.add(box(kit, w - 0.06, 0.46, 0.22, c, 0, L + 0.45, -d / 2 + 0.11, 0.07));
  for (const s of [-1, 1]) g.add(box(kit, 0.18, 0.38, d, c, s * (w / 2 - 0.09), L + 0.3, 0, 0.07));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(kit, 0.05, L, 0.05, kit.m.legs ? 'legs' : 'woodDark', sx * (w / 2 - 0.1), L / 2, sz * (d / 2 - 0.1), 0.005));
  if (kit.m.pillow) for (const s of [-1, 1]) { const p = box(kit, 0.42, 0.38, 0.12, 'pillow', s * 0.55, L + 0.52, -d / 2 + 0.3, 0.05); p.rotation.set(-0.25, s * 0.18, s * 0.08); g.add(p); }
  return g;
}

/** 화분 — kind: leafy(넓은 잎) | tall(산세베리아) | round(동글) | lowpoly(각진 덩어리) | model(모형 나무) */
export function plant(kit, { h = 1.15, kind = kit.plant ?? 'leafy', seed = 3, pot = 'pot' } = {}) {
  const r = rng(seed), g = new THREE.Group();
  const potH = 0.34, potR = 0.17;
  g.add(cyl(kit, potR, potR * 0.78, potH, kit.m[pot] ? pot : 'white', 0, potH / 2, 0, 28));
  g.add(cyl(kit, potR * 0.92, potR * 0.92, 0.02, kit.m.soil ? 'soil' : 'woodDark', 0, potH - 0.02, 0, 20));
  const leaf = kit.m.leaf, leaf2 = kit.m.leaf2 ?? leaf;
  if (kind === 'tall') {
    for (let i = 0; i < 9; i++) {
      const l = mk(new THREE.ConeGeometry(0.045, 0.55 + r() * 0.45, kit.flat ? 4 : 8), i % 2 ? leaf : leaf2);
      l.scale.z = 0.3; const a = r() * PI * 2, d = r() * 0.08; l.position.set(Math.cos(a) * d, potH + 0.3 + r() * 0.15, Math.sin(a) * d); l.rotation.set((r() - 0.5) * 0.3, a, (r() - 0.5) * 0.3); g.add(l);
    }
  } else if (kind === 'round' || kind === 'model' || kind === 'lowpoly') {
    if (kind === 'model') g.add(cyl(kit, 0.012, 0.016, h * 0.45, 'woodDark', 0, potH + h * 0.22, 0, 8));
    const n = kind === 'model' ? 1 : 4;
    for (let i = 0; i < n; i++) {
      const rad = kind === 'model' ? h * 0.32 : 0.16 + r() * 0.08;
      const geo = kind === 'lowpoly' ? new THREE.IcosahedronGeometry(rad, 0) : kind === 'model' ? new THREE.IcosahedronGeometry(rad, 3) : new THREE.SphereGeometry(rad, 16, 12);
      if (kind === 'model') { const p = geo.attributes.position; for (let k = 0; k < p.count; k++) { const s = 1 + (r() - 0.5) * 0.16; p.setXYZ(k, p.getX(k) * s, p.getY(k) * s, p.getZ(k) * s); } geo.computeVertexNormals(); }
      const l = mk(geo, i % 2 ? leaf2 : leaf);
      if (kind === 'model') l.position.set(0, potH + h * 0.62, 0);
      else { const a = i * 2.1; l.position.set(Math.cos(a) * 0.1 * (i ? 1 : 0), potH + 0.2 + i * 0.13 + r() * 0.05, Math.sin(a) * 0.1 * (i ? 1 : 0)); }
      g.add(l);
    }
  } else {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = i * 2.4 + r() * 0.4, y = potH + 0.15 + (i / n) * (h - potH - 0.2), rad = 0.12 + (1 - i / n) * 0.12;
      const stem = cyl(kit, 0.006, 0.008, Math.hypot(rad, y - potH), kit.m.stem ? 'stem' : 'woodDark', 0, 0, 0, 5);
      stem.position.set(Math.cos(a) * rad / 2, (y + potH) / 2, Math.sin(a) * rad / 2); stem.lookAt(Math.cos(a) * rad, y, Math.sin(a) * rad); stem.rotateX(PI / 2); g.add(stem);
      const l = mk(new THREE.SphereGeometry(0.11 + r() * 0.04, kit.flat ? 5 : 12, kit.flat ? 3 : 8), i % 3 ? leaf : leaf2);
      l.scale.set(1, 0.16, 0.55); l.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad); l.rotation.set(0, -a, -0.5 - r() * 0.4); g.add(l);
    }
  }
  return g;
}

/** 책장 — 책은 인스턴스로 한 번에 그린다 */
export function shelf(kit, { w = 1.6, h = 2.0, d = 0.34, rows = 5, seed = 9 } = {}) {
  const r = rng(seed), g = new THREE.Group(), T = 0.025, S = kit.m.shelf ? 'shelf' : 'wood';
  g.add(box(kit, T, h, d, S, -w / 2 + T / 2, h / 2, 0, 0), box(kit, T, h, d, S, w / 2 - T / 2, h / 2, 0, 0), box(kit, w, T, d, S, 0, h - T / 2, 0, 0), box(kit, w - 2 * T, 0.008, d, S, 0, 0.004, 0, 0));
  g.add(box(kit, w, h, 0.01, S, 0, h / 2, -d / 2 + 0.005, 0));
  const books = [], cols = kit.books ?? ['#8C5A3C', '#3F5E54', '#C9A86A', '#5B6B7A', '#A4473B', '#D8CFC0', '#2E3A46'];
  for (let i = 0; i < rows; i++) {
    const y = 0.06 + (i * (h - 0.1)) / rows;
    if (i) g.add(box(kit, w - 2 * T, T, d - 0.01, S, 0, y - T / 2, 0.005, 0));
    let x = -w / 2 + T + 0.02;
    while (x < w / 2 - T - 0.06) {
      if (r() < 0.08) { x += 0.12 + r() * 0.15; continue; }
      const bw = 0.025 + r() * 0.03, bh = 0.18 + r() * 0.12, bd = d * (0.6 + r() * 0.25);
      books.push({ x: x + bw / 2, y: y + bh / 2, z: 0.0, w: bw, h: bh, d: bd, c: cols[Math.floor(r() * cols.length)], lean: r() < 0.06 ? 0.25 : 0 });
      x += bw + 0.003;
    }
  }
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), kit.m.book ?? new THREE.MeshStandardMaterial({ roughness: 0.7 }), books.length);
  const o = new THREE.Object3D(), C = new THREE.Color();
  books.forEach((b, i) => { o.position.set(b.x, b.y, b.z); o.rotation.set(0, 0, b.lean); o.scale.set(b.w, b.h, b.d); o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, C.set(b.c)); });
  im.castShadow = true; im.receiveShadow = true; g.add(im);
  return g;
}

export function board(kit, map, { w = 1.9, h = 1.05 } = {}) {
  const g = new THREE.Group();
  g.add(box(kit, w + 0.05, h + 0.05, 0.03, kit.m.frame ? 'frame' : 'metal', 0, 0, 0, 0.006));
  const s = mk(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map, roughness: 0.55 }), false); s.position.z = 0.016; g.add(s);
  return g;
}

export function rug(kit, { w = 2.6, d = 2.2, m = 'rug', round = false } = {}) {
  const geo = round ? new THREE.CylinderGeometry(w / 2, w / 2, 0.012, 64) : new THREE.BoxGeometry(w, 0.012, d);
  const me = mk(geo, mat(kit, m), false); me.position.y = 0.006; return me;
}

export function mug(kit, m = 'mug') {
  const c = kit.m[m] ? m : 'white';
  const g = G(cyl(kit, 0.04, 0.036, 0.095, c, 0, 0.0475, 0, 18));
  const hd = mk(new THREE.TorusGeometry(0.024, 0.007, 6, 12), mat(kit, c)); hd.position.set(0.045, 0.05, 0); g.add(hd);
  return g;
}

export function papers(kit, n = 4, seed = 2) {
  const r = rng(seed), g = new THREE.Group();
  for (let i = 0; i < n; i++) { const p = box(kit, 0.21, 0.004, 0.29, 'paper', (r() - 0.5) * 0.04, 0.002 + i * 0.004, (r() - 0.5) * 0.04, 0); p.rotation.y = (r() - 0.5) * 0.4; g.add(p); }
  return g;
}

export function bookStack(kit, seed = 5) {
  const r = rng(seed), g = new THREE.Group(), cols = kit.books ?? ['#8C5A3C', '#3F5E54', '#C9A86A'];
  let y = 0;
  for (let i = 0; i < 3; i++) { const hh = 0.035 + r() * 0.02, b = box(kit, 0.24 - i * 0.02, hh, 0.17, new THREE.MeshStandardMaterial({ color: cols[i % cols.length], roughness: 0.75 }), 0, y + hh / 2, 0, 0.003); b.rotation.y = (r() - 0.5) * 0.3; g.add(b); y += hh; }
  return g;
}

export function lamp(kit, { kind = 'floor', m = 'metal', shade = 'shade' } = {}) {
  const s = kit.m[shade] ? shade : 'white';
  if (kind === 'desk') {
    const g = G(cyl(kit, 0.07, 0.08, 0.02, m, 0, 0.01, 0, 20), cyl(kit, 0.008, 0.008, 0.36, m, 0, 0.19, 0, 8));
    const hd = cyl(kit, 0.04, 0.09, 0.1, s, 0.06, 0.38, 0, 20); hd.rotation.z = 0.6; g.add(hd);
    return g;
  }
  if (kind === 'pendant') {
    const g = G(cyl(kit, 0.004, 0.004, 1.0, 'black', 0, 0.5, 0, 6));
    const hd = mk(new THREE.SphereGeometry(0.22, 32, 16, 0, PI * 2, 0, PI / 2), mat(kit, s)); g.add(hd); // 위가 막힌 돔 — 아래로 빛이 나간다
    return g;
  }
  return G(cyl(kit, 0.16, 0.18, 0.025, m, 0, 0.0125, 0, 24), cyl(kit, 0.012, 0.012, 1.45, m, 0, 0.74, 0, 8), cyl(kit, 0.17, 0.22, 0.26, s, 0, 1.52, 0, 28));
}

export function frameArt(kit, map, { w = 0.6, h = 0.8, m = 'frame' } = {}) {
  const g = G(box(kit, w + 0.04, h + 0.04, 0.03, kit.m[m] ? m : 'black', 0, 0, 0, 0.004));
  const s = mk(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map, roughness: 0.8 }), false); s.position.z = 0.016; g.add(s);
  return g;
}

/** 트로피 — 실제 마일스톤일 때만 놓는다 */
export function trophy(kit, m = 'brass', s = 1) {
  const pts = [[0.001, 0], [0.05, 0], [0.05, 0.02], [0.016, 0.03], [0.012, 0.08], [0.02, 0.1], [0.055, 0.12], [0.06, 0.2], [0.001, 0.2]].map(([x, y]) => new THREE.Vector2(x * s, y * s));
  const cup = mk(new THREE.LatheGeometry(pts, kit.flat ? 7 : 28), mat(kit, kit.m[m] ? m : 'metal'));
  return G(cup);
}

export { G, at };
