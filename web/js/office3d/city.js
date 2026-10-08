// 도시 블록 — 우리 부지를 가운데 두고 사방으로 도로 · 이웃 건물 · 공원 · 나무 · 가로등 · 차를 짓는다(씨앗이 같으면 늘 같은 동네).
// 가까운 건물은 낮고 멀수록 높다 — 어느 방향에서 봐도 우리 건물을 가리지 않게. 가장자리는 시간대 공기색으로 녹아든다.
// 밤에는 바깥이 어두워지고 창 · 가로등 · 전조등이 켜진다(sky.onApply → setTime).
import * as THREE from 'three';
import { m3, neutral } from './palette.js';
import { rng } from './tex.js';
import { box as pbox } from './props.js';

const ROAD = 9, BLOCK = 30, WALK = 2.4, CURB = 0.15;
export const CITY_R = 240; // 도시 반지름 — 이 밖은 공기색
const FADE0 = 135, FADE1 = 228;

/** 도시 재질 — 가장자리 녹아들기 · 밤 어둡기 · (건물) 창 무늬와 창 불빛 · (등) 밤에만 빛남 */
function cityMat(U, color, { roughness = 0.8, windows = false, darken = 0.74, glow = null, metal = 0 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: metal });
  m.customProgramCacheKey = () => `city:${windows}:${darken}:${!!glow}`;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { uDarken: { value: darken }, uGlow: { value: new THREE.Color(glow ?? '#000000') } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vCityW; varying vec3 vCityN;${windows ? '\nattribute float aKind; attribute float aSeed; varying float vKind; varying float vSeed;' : ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 cw = vec4(transformed, 1.0); vec3 cn = objectNormal;
        #ifdef USE_INSTANCING
          cw = instanceMatrix * cw; cn = mat3(instanceMatrix) * cn;
        #endif
        vCityW = (modelMatrix * cw).xyz; vCityN = normalize(mat3(modelMatrix) * cn);${windows ? '\nvKind = aKind; vSeed = aSeed;' : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vCityW; varying vec3 vCityN;${windows ? '\nvarying float vKind; varying float vSeed;' : ''}
        uniform float uNight; uniform float uDarken; uniform vec3 uEdge; uniform vec2 uCenter; uniform float uGround; uniform vec3 uWin; uniform vec3 uGlow;
        float cityHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float cWin = 0.0, cLit = 0.0;
        ${windows ? `{
          vec3 n = normalize(vCityN);
          float side = step(abs(n.y), 0.5), v = vCityW.y - uGround, u = dot(vCityW.xz, vec2(-n.z, n.x));
          float cw = vKind < 0.5 ? 2.6 : (vKind < 1.5 ? 2.0 : 1.6), fh = vKind < 0.5 ? 3.4 : 3.0;
          vec2 cell = floor(vec2(u / cw, v / fh)), f = fract(vec2(u / cw, v / fh));
          float wx = vKind < 0.5 ? 0.08 : 0.22, wy = vKind < 0.5 ? 0.2 : 0.32;
          cWin = side * step(wx, f.x) * step(f.x, 1.0 - wx) * step(wy, f.y) * step(f.y, 0.86) * step(1.0, v);
          cLit = cWin * step(cityHash(cell + vec2(vSeed * 17.0, n.x * 3.0 + n.z * 7.0)), 0.42);
          vec3 glass = vKind < 0.5 ? vec3(0.16, 0.24, 0.32) : vec3(0.12, 0.13, 0.15);
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(glass, vec3(0.02, 0.025, 0.035), uNight), cWin * 0.9);
          diffuseColor.rgb *= mix(1.0, 0.8, step(0.5, n.y)); // 옥상은 조금 어둡게
        }` : ''}
        diffuseColor.rgb *= mix(1.0, 1.0 - uDarken, uNight); // 밤 — 바깥은 어둡게(실내 조명은 사무실만 비춘다)`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += cLit * uWin * uNight * 2.2 + uGlow * uNight;`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uEdge, smoothstep(${FADE0.toFixed(1)}, ${FADE1.toFixed(1)}, length(vCityW.xz - uCenter)));`);
  };
  return m;
}

/** 도로 축 — 우리 블록 [a0, a1] 양옆으로 도로 · 블록을 반지름까지 늘어놓는다 */
function axis(a0, a1, c) {
  const roads = [a0 - ROAD / 2, a1 + ROAD / 2], blocks = [[a0, a1, true]];
  for (let p = a1 + ROAD; p - c < CITY_R; p += BLOCK + ROAD) { blocks.push([p, p + BLOCK]); roads.push(p + BLOCK + ROAD / 2); }
  for (let p = a0 - ROAD; c - p < CITY_R; p -= BLOCK + ROAD) { blocks.push([p - BLOCK, p]); roads.push(p - BLOCK - ROAD / 2); }
  return { roads, blocks };
}

function instanced(geo, mat, n, { cast = true, receive = true } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); m.count = 0; m.castShadow = cast; m.receiveShadow = receive; m.frustumCulled = false; return m;
}
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), SC = new THREE.Vector3(), PO = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), COL = new THREE.Color();
function put(im, x, y, z, sx, sy, sz, rot = 0, color = null) {
  if (im.count >= im.instanceMatrix.count) return -1; // 자리를 넘치면 버린다
  const i = im.count++; Q.setFromAxisAngle(UP, rot); M4.compose(PO.set(x, y, z), Q, SC.set(sx, sy, sz)); im.setMatrixAt(i, M4);
  if (color) im.setColorAt(i, COL.set(color)); return i;
}

/**
 * lot: 우리 부지 { x0, x1, z0, z1 } (건물 + 여유 · 별관 자리), ground: 보도 윗면 높이.
 * 반환: { group, center, radius, setTime(s), update(t, dt), dispose() }
 */
export function createCity(stage, { lot, ground = -0.32, seed = 7, kit, logo = null }) {
  const r = rng(seed), g = new THREE.Group(); g.name = 'city';
  const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
  const U = { uNight: { value: 0 }, uEdge: { value: new THREE.Color('#DCE4EA') }, uCenter: { value: new THREE.Vector2(cx, cz) }, uGround: { value: ground }, uWin: { value: new THREE.Color('#FFD08A') } };
  const asphaltY = ground - CURB;
  const mat = {
    asphalt: cityMat(U, '#5C6168', { roughness: 0.95, darken: 0.72 }),
    walk: cityMat(U, '#D4D3CE', { roughness: 0.9 }),
    plaza: cityMat(U, '#E2DED6', { roughness: 0.85 }),
    grass: cityMat(U, '#86A872', { roughness: 1 }),
    paint: cityMat(U, '#F2F0EA', { roughness: 0.7, darken: 0.6 }),
    bldg: cityMat(U, '#FFFFFF', { roughness: 0.75, windows: true }),
    roofbox: cityMat(U, '#B9BDC1', { roughness: 0.7 }),
    trunk: cityMat(U, '#6B5440', { roughness: 0.9 }),
    leaf: cityMat(U, '#FFFFFF', { roughness: 0.85 }),
    pole: cityMat(U, '#3A3F46', { roughness: 0.5, metal: 0.4 }),
    lamp: cityMat(U, '#E8E4D8', { roughness: 0.4, darken: 0.2, glow: '#FFD9A0' }),
    car: cityMat(U, '#FFFFFF', { roughness: 0.4, metal: 0.2, darken: 0.5 }),
    glass: cityMat(U, '#2A3440', { roughness: 0.2, darken: 0.3 }),
    head: cityMat(U, '#F4F1E6', { roughness: 0.3, darken: 0.1, glow: '#FFF1C8' }),
  };
  const X = axis(lot.x0 - WALK, lot.x1 + WALK, cx), Z = axis(lot.z0 - WALK, lot.z1 + WALK, cz);
  const inR = (x, z, pad = 0) => Math.hypot(x - cx, z - cz) < CITY_R - pad;

  // 땅(아스팔트) — 블록 사이가 그대로 도로가 된다
  const base = new THREE.Mesh(new THREE.PlaneGeometry(CITY_R * 2.6, CITY_R * 2.6), mat.asphalt); base.rotation.x = -Math.PI / 2; base.position.set(cx, asphaltY, cz); base.receiveShadow = true; g.add(base);

  // 블록 판(보도) · 공원 · 주차장 · 건물
  const blocks = [];
  for (const [x0, x1, hx] of X.blocks) for (const [z0, z1, hz] of Z.blocks) {
    const bx = (x0 + x1) / 2, bz = (z0 + z1) / 2; if (!inR(bx, bz, -20)) continue;
    blocks.push({ x0, x1, z0, z1, home: hx && hz });
  }
  const plates = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0), mat.walk, blocks.length, { cast: false });
  const lawns = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0), mat.grass, blocks.length * 2, { cast: false });
  const bGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const maxB = blocks.length * 5;
  bGeo.setAttribute('aKind', new THREE.InstancedBufferAttribute(new Float32Array(maxB), 1));
  bGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(maxB), 1));
  const bldg = instanced(bGeo, mat.bldg, maxB), roofs = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mat.roofbox, maxB * 2);
  const trunks = instanced(new THREE.CylinderGeometry(0.12, 0.16, 1, 6).translate(0, 0.5, 0), mat.trunk, 3200);
  const crowns = instanced(new THREE.IcosahedronGeometry(1, 0), mat.leaf, 3200);
  const parked = [];
  // 이웃 건물 — 밝기 차이만 남기고 채도를 누른다(벽돌 주황이 인주색 · 결재함과 겹쳐 읽히지 않게, brand.md §3-4 원칙 2)
  const PAL = Object.fromEntries(Object.entries({ 0: ['#C9D3DC', '#B3C2CF', '#A8B6C2', '#D4DADF', '#9FB0BF'], 1: ['#E2D8C8', '#D9CBB5', '#E8E0D2', '#CDBFA8', '#D6D0C6'], 2: ['#B88A72', '#A9806B', '#C49A80', '#9C7B68'] }).map(([k, v]) => [k, v.map((c) => neutral(c, 0.07))]));
  /** 우리 부지 바깥 가장자리까지의 거리 — 이만큼 멀어야 이만큼 높아도 우리 건물을 안 가린다 */
  const lotGap = (x, z) => Math.hypot(Math.max(lot.x0 - x, 0, x - lot.x1), Math.max(lot.z0 - z, 0, z - lot.z1));
  const near = []; // 우리 건물 가까운 나무 — 방 보기에선 숨긴다(카메라 앞을 가리지 않게)
  const tree = (x, z, s = 1) => {
    if (!inR(x, z, 8)) return;
    const h = (1.6 + r() * 0.8) * s, cr = (1.3 + r() * 0.6) * s;
    const a = put(trunks, x, ground, z, s, h, s), b = put(crowns, x, ground + h + cr * 0.55, z, cr, cr * 1.15, cr, r() * 6, ['#5E8C55', '#6F9A5C', '#4F7D4E', '#7DA463'][(r() * 4) | 0]);
    if (a >= 0 && b >= 0 && lotGap(x, z) < 14) near.push({ a, b, ma: new THREE.Matrix4(), mb: new THREE.Matrix4() });
  };

  for (const b of blocks) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0, bx = (b.x0 + b.x1) / 2, bz = (b.z0 + b.z1) / 2;
    if (!b.home) put(plates, bx, ground, bz, w, CURB + 0.02, d);
    // 보도 나무 — 블록 둘레
    if (inR(bx, bz, 40)) for (const [ax, az, len, horiz] of [[b.x0 + 1.2, b.z0 + 1.2, w, 1], [b.x0 + 1.2, b.z1 - 1.2, w, 1], [b.x0 + 1.2, b.z0 + 1.2, d, 0], [b.x1 - 1.2, b.z0 + 1.2, d, 0]]) {
      for (let s = 4; s < len - 3; s += 9 + r() * 3) tree(horiz ? ax + s : ax, horiz ? az : az + s, 0.85);
    }
    if (b.home) continue; // 우리 부지는 따로 꾸민다
    const kind = r(), ix0 = b.x0 + WALK, ix1 = b.x1 - WALK, iz0 = b.z0 + WALK, iz1 = b.z1 - WALK;
    if (kind < 0.13) { // 공원
      put(lawns, bx, ground + 0.03, bz, ix1 - ix0, 0.05, iz1 - iz0);
      for (let i = 0; i < 9; i++) tree(ix0 + 2 + r() * (ix1 - ix0 - 4), iz0 + 2 + r() * (iz1 - iz0 - 4), 1 + r() * 0.4);
      continue;
    }
    if (kind < 0.2) { for (let i = 0; i < 10; i++) if (r() < 0.75) parked.push([ix0 + 3 + (i % 5) * 4.6, iz0 + 5 + Math.floor(i / 5) * 12, 0]); continue; } // 주차장
    // 건물 터 — 2×2 · 1×2 · 통째
    const split = r(), cells = split < 0.5 ? [[0, 0, 0.5, 0.5], [0.5, 0, 1, 0.5], [0, 0.5, 0.5, 1], [0.5, 0.5, 1, 1]] : split < 0.8 ? [[0, 0, 1, 0.5], [0, 0.5, 1, 1]] : [[0, 0, 1, 1]];
    for (const [u0, v0, u1, v1] of cells) {
      if (r() < 0.08) continue;
      const px0 = ix0 + (ix1 - ix0) * u0, px1 = ix0 + (ix1 - ix0) * u1, pz0 = iz0 + (iz1 - iz0) * v0, pz1 = iz0 + (iz1 - iz0) * v1;
      const inset = 0.8 + r() * 1.6, fw = px1 - px0 - inset * 2, fd = pz1 - pz0 - inset * 2;
      if (fw < 4 || fd < 4) continue;
      const x = (px0 + px1) / 2, z = (pz0 + pz1) / 2, dist = Math.hypot(x - cx, z - cz);
      if (!inR(x, z, 6)) continue;
      const gap = lotGap(x, z) - Math.max(fw, fd) / 2;
      const want = dist < 70 ? 7 + r() * 12 : dist < 130 ? 12 + r() * 26 : 18 + r() * 48;
      const k = dist > 90 && r() < 0.55 ? 0 : r() < 0.6 ? 1 : 2; // 0 유리 사무동 · 1 주거 · 2 벽돌
      const fl = k === 0 ? 3.4 : 3.0, hgt = Math.max(fl + 1, Math.round(Math.min(want, Math.max(4.5, gap * 0.62)) / fl) * fl + 0.6);
      const i = put(bldg, x, ground, z, fw, hgt, fd, 0, PAL[k][(r() * PAL[k].length) | 0]);
      if (i >= 0) { bGeo.attributes.aKind.array[i] = k; bGeo.attributes.aSeed.array[i] = r() * 100; }
      if (r() < 0.6) put(roofs, x + (r() - 0.5) * fw * 0.4, ground + hgt, z + (r() - 0.5) * fd * 0.4, 1.6 + r() * 2.4, 0.9 + r() * 1.4, 1.4 + r() * 2.2);
      if (hgt > 20 && r() < 0.5) put(roofs, x, ground + hgt, z, fw * 0.55, 2.6, fd * 0.55, 0, null);
    }
  }
  bGeo.attributes.aKind.needsUpdate = bGeo.attributes.aSeed.needsUpdate = true;

  // 차선 · 횡단보도
  const paint = instanced(new THREE.BoxGeometry(1, 1, 1), mat.paint, 3200, { cast: false });
  for (const rx of X.roads) for (let z = cz - CITY_R; z < cz + CITY_R; z += 7) if (inR(rx, z, 30) && !Z.roads.some((q) => Math.abs(q - z) < ROAD / 2 + 1)) put(paint, rx, asphaltY + 0.01, z, 0.18, 0.02, 3);
  for (const rz of Z.roads) for (let x = cx - CITY_R; x < cx + CITY_R; x += 7) if (inR(x, rz, 30) && !X.roads.some((q) => Math.abs(q - x) < ROAD / 2 + 1)) put(paint, x, asphaltY + 0.01, rz, 3, 0.02, 0.18);
  for (const rx of X.roads.slice(0, 2)) for (const rz of Z.roads.slice(0, 2)) for (let i = -3; i <= 3; i++) { // 우리 블록 네 모서리 횡단보도
    put(paint, rx + i * 1.1, asphaltY + 0.01, rz + (rz > cz ? -1 : 1) * (ROAD / 2 + 1.6), 0.6, 0.02, 2.6);
    put(paint, rx + (rx > cx ? -1 : 1) * (ROAD / 2 + 1.6), asphaltY + 0.01, rz + i * 1.1, 2.6, 0.02, 0.6);
  }

  // 가로등 — 도로 가장자리
  const poles = instanced(new THREE.CylinderGeometry(0.07, 0.09, 1, 6).translate(0, 0.5, 0), mat.pole, 900, { receive: false });
  const heads = instanced(new THREE.BoxGeometry(1, 1, 1), mat.lamp, 900, { cast: false });
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,214,150,0.9)'); gr.addColorStop(1, 'rgba(255,214,150,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const glows = instanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), glowMat, 900, { cast: false, receive: false });
  const lampAt = (x, z) => { if (!inR(x, z, 70)) return; put(poles, x, ground, z, 1, 4.6, 1); put(heads, x, ground + 4.6, z, 0.5, 0.16, 0.5); put(glows, x, ground + 0.05, z, 7, 1, 7); };
  for (const rx of X.roads) for (let z = cz - CITY_R; z < cz + CITY_R; z += 16) if (!Z.roads.some((q) => Math.abs(q - z) < ROAD)) lampAt(rx + ROAD / 2 + 0.6, z);
  for (const rz of Z.roads) for (let x = cx - CITY_R + 8; x < cx + CITY_R; x += 16) if (!X.roads.some((q) => Math.abs(q - x) < ROAD)) lampAt(x, rz - ROAD / 2 - 0.6);

  // 우리 부지 — 광장 · 잔디 띠 · 나무 · 벤치 · 간판 기둥
  put(plates, cx, ground, cz, lot.x1 - lot.x0 + WALK * 2, CURB + 0.02, lot.z1 - lot.z0 + WALK * 2);
  for (let i = 0; i < plates.count; i++) plates.setColorAt(i, COL.set(i === plates.count - 1 ? '#E4E0D8' : '#D4D3CE'));
  for (const [x0, z0, x1, z1] of [[lot.x0, lot.z0, lot.x1, lot.z0 + 2.2], [lot.x0, lot.z1 - 2.2, lot.x1, lot.z1], [lot.x0, lot.z0, lot.x0 + 2.2, lot.z1]]) put(lawns, (x0 + x1) / 2, ground + 0.03, (z0 + z1) / 2, x1 - x0, 0.05, z1 - z0);
  for (let x = lot.x0 + 2; x < lot.x1 - 1; x += 6.5) { tree(x, lot.z0 + 1.1, 1.05); tree(x + 3, lot.z1 - 1.1, 1.05); }
  for (let z = lot.z0 + 5; z < lot.z1 - 4; z += 6.5) tree(lot.x0 + 1.1, z, 1.05);
  for (let i = 0; i < 3; i++) g.add(pbox(kit, 1.8, 0.45, 0.5, kit.m.wood, lot.x1 - 3 - i * 3.2, ground + 0.22, lot.z1 - 3.1, 0.02));
  if (logo) {
    const sign = new THREE.Group(); sign.position.set(lot.x0 + 3.2, ground, lot.z1 - 3.2); sign.rotation.y = Math.PI / 4; g.add(sign);
    sign.add(pbox(kit, 1.5, 3.2, 0.5, kit.m.frame, 0, 1.6, 0, 0.02));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.65), new THREE.MeshStandardMaterial({ map: logo, roughness: 0.5, emissive: '#ffffff', emissiveMap: logo, emissiveIntensity: 0.6 }));
    face.position.set(0, 2.4, 0.26); sign.add(face);
  }

  // 차 — 도로를 따라 천천히(움직임 줄이기면 서 있다). 주차장 차는 그대로
  const cars = [], CAR = ['light', 'dark', 'mid', 'light-2', 'dark-2', 'mid-2', 'light'].map(m3); // 차는 무채색 — 무대의 색은 마스코트 · 결재함 · 레벨 표에만(brand.md §3-4 원칙 2)
  for (let i = 0; i < 34; i++) {
    const alongX = r() < 0.5, roads = alongX ? Z.roads : X.roads, road = roads[(r() * Math.min(roads.length, 8)) | 0], dir = r() < 0.5 ? 1 : -1;
    cars.push({ alongX, road, dir, lane: dir * 2.1, p: (r() - 0.5) * 2 * CITY_R * 0.6, v: 5 + r() * 4, color: CAR[(r() * CAR.length) | 0] });
  }
  for (const [x, z, rot] of parked) cars.push({ parked: true, x, z, rot, color: CAR[(r() * CAR.length) | 0] });
  const body = instanced(new THREE.BoxGeometry(1.8, 0.7, 4.1).translate(0, 0.55, 0), mat.car, cars.length), cabin = instanced(new THREE.BoxGeometry(1.5, 0.55, 2.1).translate(0, 1.15, -0.2), mat.glass, cars.length), lights = instanced(new THREE.BoxGeometry(1.4, 0.16, 0.08).translate(0, 0.62, 2.07), mat.head, cars.length, { cast: false });
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function placeCars(dt) {
    body.count = cabin.count = lights.count = 0;
    const span = CITY_R * 0.62;
    for (const c of cars) {
      let x, z, rot;
      if (c.parked) ({ x, z, rot } = c);
      else {
        if (!calm) c.p += c.v * c.dir * dt;
        if (c.p > span) c.p -= span * 2; if (c.p < -span) c.p += span * 2;
        x = c.alongX ? cx + c.p : c.road + c.lane; z = c.alongX ? c.road - c.lane : cz + c.p;
        rot = c.alongX ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
      }
      put(body, x, asphaltY, z, 1, 1, 1, rot, c.color); put(cabin, x, asphaltY, z, 1, 1, 1, rot); put(lights, x, asphaltY, z, 1, 1, 1, rot);
    }
    for (const m of [body, cabin, lights]) m.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
  }
  placeCars(0);

  for (const m of [plates, lawns, bldg, roofs, trunks, crowns, paint, poles, heads, glows, body, cabin, lights]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; g.add(m); }
  stage.scene.add(g);

  for (const n of near) { trunks.getMatrixAt(n.a, n.ma); crowns.getMatrixAt(n.b, n.mb); }
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  let nearHidden = false;
  return {
    group: g, center: new THREE.Vector3(cx, 0, cz), radius: CITY_R,
    /** 방 보기 — 건물 가까운 나무를 숨긴다 */
    hideNear(v) {
      if (v === nearHidden) return; nearHidden = v;
      for (const n of near) { trunks.setMatrixAt(n.a, v ? ZERO : n.ma); crowns.setMatrixAt(n.b, v ? ZERO : n.mb); }
      trunks.instanceMatrix.needsUpdate = crowns.instanceMatrix.needsUpdate = true;
    },
    /** 시간대 — 밤 정도 · 공기색 · 창 불빛 색 */
    setTime(s) { U.uNight.value = s.night; U.uEdge.value.copy(s.edge); U.uWin.value.copy(s.win[0]).lerp(new THREE.Color('#FFD08A'), 0.5); glowMat.opacity = Math.max(0, s.night - 0.15) * 0.95; },
    update(t, dt) { if (!calm) placeCars(dt); },
    dispose() { glowTex.dispose(); },
  };
}
