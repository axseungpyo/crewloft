// 무대 — 렌더러·카메라·후처리·라벨·카메라 이동. 컨셉은 build(stage) 안에서 장면만 채운다.
// 카메라는 원근 없는 아이소메트릭(직교). 크기는 '세로로 보이는 길이 h(m)'로 다룬다 — 줌 = h, 시점 = { target, h, az }.
// 조작: 끌기 = 이동(바닥을 따라), 휠 = 커서 쪽으로 확대·축소, 오른쪽 끌기 · Q/E · rotate() = 회전(놓으면 대각선 4방향에 맞춤).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const vec = (a) => (a?.isVector3 ? a.clone() : new THREE.Vector3(...a));
/** 예전 원근 카메라(시야 32°) 기준 — { pos, target } 시점을 같은 크기의 h 로 바꿀 때 쓴다 */
const FOV_REF = 32 * (Math.PI / 180);
const CAM_D = 320; // 직교 카메라는 거리와 크기가 무관 — 장면 밖에 멀리 둔다
const QUARTER = Math.PI / 2, DIAG = Math.PI / 4;
/** 대각선 4방향(45° · 135° · 225° · 315°) 중 가까운 쪽 */
export const snapAz = (az) => DIAG + Math.round((az - DIAG) / QUARTER) * QUARTER;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** 떠 있는 숫자 · 레벨 표가 쓰는 레이어 — 본 장면 · 그림자 보정(AO) · 톤 매핑을 거친 화면 위에 따로 그린다(build.js uiSprite) */
export const UI_LAYER = 1;
/** UI_LAYER 물체 목록 — 덧그릴 때 장면 전체를 다시 훑지 않고 이것만 그린다(build.js uiSprite가 넣고, 재질을 버리면 빠진다) */
export const uiObjects = new Set();

export function createStage(host, { thumb = false, overlay = null } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: thumb, powerPreference: 'high-performance' });
  renderer.setPixelRatio(thumb ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // 화면 세로 = 1 / zoom (m). 가로는 화면 비율을 따른다
  const camera = new THREE.OrthographicCamera(-0.8, 0.8, 0.5, -0.5, 1, CAM_D * 3);
  camera.zoom = 1 / 20;
  const controls = thumb ? null : new OrbitControls(camera, renderer.domElement);
  if (controls) {
    Object.assign(controls, { enableDamping: true, dampingFactor: 0.09, enablePan: true, screenSpacePanning: false, zoomToCursor: true, rotateSpeed: 0.6, zoomSpeed: 1.1, minZoom: 1 / 320, maxZoom: 1 / 3.5 });
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  }

  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass());

  const pmrem = new THREE.PMREMGenerator(renderer);
  const updaters = [], resizers = [], labels = [], faces = [], before = [], v = new THREE.Vector3(), target = new THREE.Vector3(), q = new THREE.Quaternion();
  const off = new THREE.Vector3(), sph = new THREE.Spherical();
  let raf = 0, last = 0, fly = null, alive = true, W = 4, H = 4, io = null, onScreen = true, lastInput = performance.now();
  let az = DIAG, bounds = null, polarFor = () => 0.96;
  const poke = () => { lastInput = performance.now(); };
  const t0 = performance.now();
  const ro = thumb ? null : new ResizeObserver(() => stage.resize());

  const tgt = () => controls?.target ?? target;
  const curAz = () => { off.copy(camera.position).sub(tgt()); return Math.atan2(off.x, off.z); };
  /** 시점(target · h · az)대로 카메라를 놓는다 — 고도는 h 에 따라(가까울수록 낮게, 멀수록 지도처럼) */
  function pose(tg, h, a) {
    sph.set(CAM_D, polarFor(h), a); off.setFromSpherical(sph);
    tgt().copy(tg); camera.position.copy(tg).add(off); camera.zoom = 1 / h; camera.updateProjectionMatrix(); camera.lookAt(tg);
    if (controls) controls.minPolarAngle = controls.maxPolarAngle = sph.phi;
  }
  /** { target, h, az } 또는 예전 { pos, target } → { target, h, az } */
  function norm(view) {
    const tg = vec(view.target);
    if (view.h) return { target: tg, h: view.h, az: view.az ?? snapAz(curAz()) };
    const d = vec(view.pos).distanceTo(tg);
    return { target: tg, h: 2 * d * Math.tan(FOV_REF / 2), az: view.az ?? snapAz(curAz()) };
  }
  if (controls) {
    controls.addEventListener('start', () => { fly = null; });
    // 회전을 놓으면 가까운 대각선으로 부드럽게 맞춘다(이동 · 줌만 했으면 그대로)
    controls.addEventListener('end', () => { const a = curAz(), s = snapAz(a); if (Math.abs(wrap(a - s)) > 0.01) { stage.setView({ target: tgt().clone(), h: 1 / camera.zoom, az: s }, 0.45); } });
  }
  const key = (ev) => {
    if (thumb || stage.editing || ev.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (ev.key === 'q' || ev.key === 'Q') stage.rotate(-1);
    if (ev.key === 'e' || ev.key === 'E') stage.rotate(1);
  };

  /** UI_LAYER 물체만 화면에 덧그린다 — 2D 배지와 같은 색(톤 매핑 없이), AO에 눌리지 않게. 이 장면에 붙어 있고 보이는 것만, 하나씩 */
  function drawUi() {
    let ac = null;
    for (const o of uiObjects) {
      let r = o, vis = o.visible; for (; vis && r.parent; r = r.parent) vis = r.parent.visible;
      if (!vis || r !== scene) continue;
      if (ac === null) { ac = renderer.autoClear; renderer.autoClear = false; renderer.setRenderTarget(null); camera.layers.set(UI_LAYER); }
      renderer.render(o, camera); // 부모의 월드 행렬은 본 장면을 그릴 때 이미 맞춰져 있다
    }
    if (ac !== null) { camera.layers.set(0); renderer.autoClear = ac; }
  }

  const stage = {
    THREE, renderer, scene, camera, controls, composer, host, overlay, thumb, views: {},
    get width() { return W; },
    get height() { return H; },
    /** 세로로 보이는 길이(m) — 줌 단계(책상 · 방 · 건물 · 동네 · 도시)를 가르는 값 */
    get viewH() { return 1 / camera.zoom; },
    get azimuth() { return curAz(); },
    get flying() { return !!fly; },
    /** 마지막 입력 뒤 지난 시간(ms) — 자동 연출이 '손을 뗐는지' 볼 때 */
    idleMs() { return performance.now() - lastInput; },
    /** 기본 반사광 — 외부 HDR 없이 방 하나를 구워 쓴다 */
    roomEnv(intensity = 1, blur = 0.04) {
      const env = pmrem.fromScene(new RoomEnvironment(), blur).texture;
      scene.environment = env; scene.environmentIntensity = intensity; return env;
    },
    envFromScene(s, blur = 0.02, intensity = 1) { const env = pmrem.fromScene(s, blur).texture; scene.environment = env; scene.environmentIntensity = intensity; return env; },
    addPass(pass) { composer.insertPass(pass, composer.passes.length - 1); return pass; },
    onUpdate(fn) { updaters.push(fn); },
    onResize(fn) { resizers.push(fn); },
    /** 본 화면을 그리기 직전에 — 미니 화면처럼 같은 렌더러로 따로 그릴 때 */
    beforeRender(fn) { before.push(fn); },
    /** 3D 물체에 붙어 다니는 HTML 라벨 */
    label(obj, html, cls = '', offset = 0) {
      if (!overlay || thumb) return null;
      const el = document.createElement('div');
      el.className = `lbl ${cls}`; el.innerHTML = html; overlay.appendChild(el);
      const L = { obj, el, offset, hidden: false }; labels.push(L); return L;
    },
    /** 카메라를 늘 바라보는 판 — 캐릭터 이름표처럼 어느 각도에서 봐도 앞면이 똑바로 보인다(부모가 돌아가 있어도) */
    faceCamera(obj) { faces.push(obj); },
    /** 고도 규칙 · 이동 범위 · 줌 범위 */
    setRig({ polar, center, radius, hMin, hMax } = {}) {
      if (polar) polarFor = polar;
      if (center) bounds = { c: vec(center), r: radius ?? 100 };
      if (controls && hMin) controls.maxZoom = 1 / hMin;
      if (controls && hMax) controls.minZoom = 1 / hMax;
    },
    getView() { return { target: tgt().clone(), h: 1 / camera.zoom, az: curAz() }; },
    setView(view, dur = 0) {
      const to = norm(view);
      if (!dur) { fly = null; pose(to.target, to.h, to.az); controls?.update(); return; }
      fly = { from: stage.getView(), to, t: 0, dur };
    },
    /** 90°씩 돌리기(↺ −1 · ↻ +1) */
    rotate(dir = 1) { const v0 = fly?.to ?? stage.getView(); stage.setView({ target: v0.target.clone(), h: v0.h, az: snapAz(v0.az) + dir * QUARTER }, 0.6); },
    flyTo(name, dur = 1.4) { const view = stage.views[name]; if (view) stage.setView(typeof view === 'function' ? view() : view, dur); },
    resize(w, h) {
      W = Math.max(2, Math.round(w ?? host.clientWidth)); H = Math.max(2, Math.round(h ?? host.clientHeight));
      renderer.setSize(W, H); composer.setSize(W, H);
      const a = W / H; Object.assign(camera, { left: -a / 2, right: a / 2, top: 0.5, bottom: -0.5 }); camera.updateProjectionMatrix();
      for (const f of resizers) f(W, H);
    },
    frame(t, dt) {
      if (controls && !fly) controls.minPolarAngle = controls.maxPolarAngle = polarFor(1 / camera.zoom);
      if (controls) controls.update(); else camera.lookAt(target);
      if (fly) {
        fly.t += dt;
        const k = ease(Math.min(1, fly.t / fly.dur)), f = fly.from, to = fly.to;
        pose(v.lerpVectors(f.target, to.target, k), Math.exp(Math.log(f.h) + (Math.log(to.h) - Math.log(f.h)) * k), f.az + wrap(to.az - f.az) * k);
        if (k >= 1) fly = null;
      }
      if (bounds) { // 도시 밖으로 나가지 않게
        const T = tgt(); v.set(T.x - bounds.c.x, 0, T.z - bounds.c.z);
        if (v.length() > bounds.r) { const d = v.clone().setLength(v.length() - bounds.r); T.sub(d); camera.position.sub(d); }
      }
      for (const f of updaters) f(t, dt);
      for (const o of faces) if (o.parent) { o.parent.getWorldQuaternion(q); o.quaternion.copy(q.invert().multiply(camera.quaternion)); }
      for (const f of before) f(t, dt);
      composer.render(dt);
      drawUi();
      for (const L of labels) {
        let shown = !L.hidden; for (let o = L.obj; shown && o; o = o.parent) if (!o.visible) { shown = false; break; } // 숨긴 층의 이름표는 감춘다
        if (shown) { L.obj.getWorldPosition(v); v.y += L.offset; v.project(camera); }
        const vis = shown && v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15;
        L.el.style.display = vis ? '' : 'none';
        if (vis) L.el.style.transform = `translate(${(((v.x + 1) / 2) * W).toFixed(1)}px, ${(((1 - v.y) / 2) * H).toFixed(1)}px)`;
      }
    },
    /** 그리기 루프 — 30fps 상한, 20초 동안 입력이 없으면 12fps(자동 연출 중엔 30fps), 화면 밖·숨은 탭이면 멈춘다(CPU 절약) */
    start() {
      ro?.observe(host); stage.resize();
      io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }); io.observe(host);
      for (const ev of ['pointermove', 'pointerdown', 'wheel', 'keydown']) addEventListener(ev, poke, { passive: true });
      addEventListener('keydown', key);
      const tick = (now) => {
        if (!alive) return;
        raf = requestAnimationFrame(tick);
        if (!onScreen || document.hidden) return;
        const cap = now - lastInput > 20000 && !fly && !stage.busy ? 12 : 30;
        if (last && now - last < 1000 / cap - 2) return;
        const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 30; last = now;
        stage.frame((now - t0) / 1000, dt);
      };
      raf = requestAnimationFrame(tick);
    },
    /** 썸네일 — 정해진 시각 한 장 */
    snapshot(t = 3.2, w = 960, h = 540) { stage.resize(w, h); stage.frame(t, 1 / 60); return renderer.domElement.toDataURL('image/jpeg', 0.88); },
    dispose() {
      alive = false; cancelAnimationFrame(raf); ro?.disconnect(); io?.disconnect(); controls?.dispose();
      for (const ev of ['pointermove', 'pointerdown', 'wheel', 'keydown']) removeEventListener(ev, poke);
      removeEventListener('keydown', key);
      scene.traverse((o) => {
        o.geometry?.dispose();
        for (const m of [o.material].flat()) { if (!m) continue; for (const k in m) if (m[k]?.isTexture) m[k].dispose(); m.dispose(); }
      });
      scene.environment?.dispose(); if (scene.background?.isTexture) scene.background.dispose();
      for (const p of composer.passes) p.dispose?.();
      composer.dispose(); pmrem.dispose(); renderer.dispose(); renderer.forceContextLoss();
      renderer.domElement.remove(); for (const L of labels) L.el.remove();
    },
  };
  pose(target, 20, az);
  return stage;
}
