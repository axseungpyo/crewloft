// 건물 외벽 · 지붕(지붕 열기) — 멀리서 보면 진짜 건물(유리 외벽 · 밤엔 창 불빛 · 옥상 설비 · 회사 간판),
// 다가가면 지붕이 들려 사라지고 카메라 쪽 벽이 낮아져 안이 보인다. 반대쪽 벽은 남아 방을 감싼다(어느 방향으로 돌려도 '무대 정면' 느낌이 없게).
// 사무실 안의 벽(layouts · generate 의 cutaway 묶음)도 같은 규칙으로 카메라 쪽만 낮춘다.
import * as THREE from 'three';
import { canvas, tex } from './tex.js';
import { m3 } from './palette.js';

const STUB = 0.32; // 낮춘 벽 높이(m) — 바닥에 테두리만 남는다

/** 유리 외벽 한 칸(한 층 × 3m) — 아래 띠는 흰 콘크리트, 위는 그래파이트 유리 · 짙은 창살(재질 팔레트). emissive 는 같은 그림의 창 부분만 */
function facadeCanvas(lit) {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = lit ? '#000000' : m3('wall-2'); g.fillRect(0, 0, w, h);
    const sp = h * 0.24;
    if (!lit) { const gr = g.createLinearGradient(0, 0, w, h - sp); gr.addColorStop(0, m3('dark-2')); gr.addColorStop(0.55, m3('mid-2')); gr.addColorStop(1, m3('dark-2')); g.fillStyle = gr; }
    else g.fillStyle = m3('glow');
    g.fillRect(0, 0, w, h - sp);
    g.fillStyle = lit ? '#000000' : m3('dark');
    for (const x of [0, w / 2]) g.fillRect(x, 0, 6, h - sp);
    g.fillRect(0, h - sp - 6, w, 6);
    if (lit) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(w / 2 + 6, 0, w / 2 - 6, h - sp - 6); } // 반쯤은 불이 꺼진 칸
  });
}

/**
 * rect: 건물 바닥 { x0, x1, z0, z1 }, base: 바닥 높이, height: 옥상 높이(바닥부터), floorH: 층 높이, logo: 간판 텍스처
 * 반환: { group, walls, update(k, cam, night, clipTop), pickables }
 */
export function createExterior(stage, { rect, base = 0, height, floorH = 3.4, logo = null }) {
  const g = new THREE.Group(); g.name = 'exterior';
  const { x0, x1, z0, z1 } = rect, W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, O = 0.2, H = height + 0.25;
  const floors = Math.max(1, Math.round(height / floorH));
  const map0 = tex(facadeCanvas(false)), emi0 = tex(facadeCanvas(true));
  const facadeMats = [], pickables = [];
  const inner = new THREE.MeshStandardMaterial({ color: m3('wall-2'), roughness: 0.92 });
  const capMat = new THREE.MeshStandardMaterial({ color: m3('column'), roughness: 0.88 });
  const walls = [[0, -1, W, cx, z0 - O], [0, 1, W, cx, z1 + O], [-1, 0, D, x0 - O, cz], [1, 0, D, x1 + O, cz]].map(([nx, nz, L, px, pz]) => {
    const wg = new THREE.Group(); wg.position.set(px, base, pz); wg.rotation.y = Math.atan2(nx, nz); g.add(wg);
    const map = map0.clone(), emi = emi0.clone();
    for (const t of [map, emi]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(1, Math.round(L / 3)), floors); t.needsUpdate = true; }
    const fm = new THREE.MeshStandardMaterial({ map, emissive: '#FFFFFF', emissiveMap: emi, emissiveIntensity: 0, roughness: 0.6, metalness: 0.1 }); facadeMats.push(fm);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(L + O * 2, H).translate(0, H / 2, 0), fm); outer.castShadow = true; outer.receiveShadow = true;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(L + O * 2, H).translate(0, H / 2, 0), inner); back.rotation.y = Math.PI; back.position.z = -0.06; back.receiveShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(L + O * 2 + 0.3, 0.22, 0.3).translate(0, H, -0.08), capMat); cap.castShadow = true;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.45, H, 0.45).translate(0, H / 2, -0.12), capMat); post.position.x = (L + O * 2) / 2; post.castShadow = true;
    wg.add(outer, back, cap, post);
    for (const o of [outer, cap, post]) { o.userData.building = true; pickables.push(o); }
    return { g: wg, n: [nx, nz], h: 1 };
  });
  // 입구 — 앞(z1) 벽에 캐노피 · 유리문
  const front = walls[1].g, door = new THREE.Group(); door.position.x = -W * 0.28; front.add(door);
  door.add(new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, 2.0).translate(0, 3.1, 1.0), capMat), new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.5, 0.08).translate(0, 1.25, 0.04), new THREE.MeshStandardMaterial({ color: m3('dark-2'), roughness: 0.5, metalness: 0.1 })));

  // 지붕 — 슬래브 · 난간 · 설비 · 간판(카메라를 본다). 들어 올리며 흐려지므로 재질은 따로 쓴다
  const roof = new THREE.Group(); roof.position.y = base + H; g.add(roof);
  const roofMats = [new THREE.MeshStandardMaterial({ color: m3('mid-2'), roughness: 0.92 }), new THREE.MeshStandardMaterial({ color: m3('slab'), roughness: 0.85 }), new THREE.MeshStandardMaterial({ color: m3('mid'), roughness: 0.7, metalness: 0.15 }), new THREE.MeshStandardMaterial({ color: m3('dark'), roughness: 0.75 })];
  const rb = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), roofMats[m]); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; o.userData.building = true; pickables.push(o); roof.add(o); return o; };
  rb(W + O * 2 + 0.4, 0.3, D + O * 2 + 0.4, 0, cx, 0.15, cz);
  for (const [w, d, x, z] of [[W + O * 2 + 0.4, 0.25, cx, z0 - O - 0.08], [W + O * 2 + 0.4, 0.25, cx, z1 + O + 0.08], [0.25, D + O * 2 + 0.4, x0 - O - 0.08, cz], [0.25, D + O * 2 + 0.4, x1 + O + 0.08, cz]]) rb(w, 0.7, d, 1, x, 0.65, z);
  rb(3.2, 1.6, 2.6, 1, x0 + W * 0.22, 1.1, z0 + D * 0.3); // 계단실
  for (let i = 0; i < Math.max(2, Math.round(W / 7)); i++) { const x = x0 + W * (0.45 + i * 0.16); if (x > x1 - 1.5) break; rb(1.8, 0.9, 1.4, 2, x, 0.75, z0 + D * 0.35); rb(1.0, 0.04, 1.0, 3, x, 1.22, z0 + D * 0.35); } // 실외기
  // 옥상에 칠한 회사 이름 — 위에서 내려다보는 건물 · 동네 단계에서 우리 건물을 알아보게
  const nameC = document.createElement('canvas'); nameC.width = 1024; nameC.height = 256;
  const nameT = new THREE.CanvasTexture(nameC); nameT.colorSpace = THREE.SRGBColorSpace; nameT.anisotropy = 8;
  const nm = new THREE.MeshStandardMaterial({ map: nameT, transparent: true, roughness: 0.9, depthWrite: false }); nm.userData.alpha = true; roofMats.push(nm);
  const nameW = Math.min(W * 0.62, 16), paint = new THREE.Mesh(new THREE.PlaneGeometry(nameW, nameW / 4), nm); paint.rotation.x = -Math.PI / 2; paint.position.set(cx + W * 0.08, 0.31, z0 + D * 0.68); paint.renderOrder = 2; roof.add(paint);
  const drawName = (name) => { const x = nameC.getContext('2d'); x.clearRect(0, 0, 1024, 256); x.fillStyle = 'rgba(255,255,255,0.92)'; x.font = `800 ${name.length > 6 ? 120 : 150}px "Pretendard Variable"`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name, 512, 132); x.fillRect(150, 226, 724, 10); nameT.needsUpdate = true; };
  let sign = null;
  if (logo) {
    const sm = new THREE.MeshStandardMaterial({ map: logo, emissive: '#FFFFFF', emissiveMap: logo, emissiveIntensity: 0.9, roughness: 0.5, transparent: true }); sm.userData.alpha = true; roofMats.push(sm);
    sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.1), sm); sign.position.set(x0 + Math.min(4, W * 0.25), 2.6, z1 - 1.2); roof.add(sign); stage.faceCamera(sign);
  }
  stage.scene.add(g);

  let k0 = -1, named = null;
  return {
    group: g, walls, pickables,
    /** 옥상에 칠한 회사 이름 */
    setName(name) { if (name && name !== named) { named = name; drawName(name); } },
    /** k: 0 = 지붕 열림(방) … 1 = 닫힘(건물). cam: 카메라 쪽 수평 방향 {x, z}. clipTop: 방 보기에서 반대쪽 벽 높이(여러 층이면 지금 층까지) */
    update(k, cam, night, clipTop = null) {
      for (const w of walls) {
        const near = w.n[0] * cam.x + w.n[1] * cam.z > 0.15;
        const roomH = near ? STUB / H : clipTop == null ? 1 : Math.min(1, Math.max(STUB, clipTop - base) / H);
        const want = roomH + (1 - roomH) * k;
        w.h += (want - w.h) * 0.3; w.g.scale.y = Math.max(0.001, w.h);
      }
      if (Math.abs(k - k0) > 1e-3) {
        k0 = k;
        const a = Math.min(1, k / 0.6);
        roof.visible = k > 0.02; roof.position.y = base + H + (1 - k) ** 2 * 9;
        for (const m of roofMats) { m.transparent = a < 0.999 || !!m.userData.alpha; m.opacity = a; m.depthWrite = a > 0.5 && !m.userData.alpha; }
      }
      for (const m of facadeMats) { m.emissiveIntensity = night * 1.8; m.color.setScalar(1 - night * 0.7); }
    },
  };
}

/**
 * 사무실 안의 바깥 벽(창벽 · 옆벽) — 카메라 쪽이면 낮춘다. 각 묶음의 userData.cutaway = [nx, nz](바깥 방향).
 * 벽에 붙은 얇은 물건(간판 · 화이트보드 · 문 · 모서리 기둥)은 벽이 낮아지면 함께 숨긴다 — 떠 있지 않게
 */
export function cutawayWalls(root) {
  const list = [], box = new THREE.Box3(), ob = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => { if (o.userData.cutaway) list.push({ g: o, n: o.userData.cutaway, h: 1, on: [] }); });
  for (const w of list) {
    box.setFromObject(w.g); if (box.isEmpty()) continue;
    const ax = w.n[0] ? 'x' : 'z', other = ax === 'x' ? 'z' : 'x', s = w.n[0] + w.n[1]; // 바깥이 − 쪽이면 s = −1
    const inner = s < 0 ? box.max[ax] : box.min[ax];
    for (const o of w.g.parent.children) {
      if (o === w.g || o.userData.cutaway) continue;
      ob.setFromObject(o); if (ob.isEmpty()) continue;
      const thin = ob.max[ax] - ob.min[ax] < 0.6, hug = s < 0 ? ob.max[ax] < inner + 0.4 && ob.min[ax] > box.min[ax] - 0.3 : ob.min[ax] > inner - 0.4 && ob.max[ax] < box.max[ax] + 0.3;
      if (thin && hug && ob.max[other] > box.min[other] - 0.3 && ob.min[other] < box.max[other] + 0.3) w.on.push(o);
    }
  }
  return {
    update(k, cam) {
      for (const w of list) {
        const near = w.n[0] * cam.x + w.n[1] * cam.z > 0.15, want = near ? 0.1 + 0.9 * k : 1;
        w.h += (want - w.h) * 0.3; w.g.scale.y = Math.max(0.02, w.h);
        for (const o of w.on) o.visible = w.h > 0.55;
      }
    },
  };
}
