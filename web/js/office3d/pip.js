// 다른 방 미니 화면(CCTV) — 지금 보고 있지 않은 방을 작은 실시간 화면으로 띄운다. 누르면 그 방으로 간다.
// 같은 렌더러로 본 화면을 그리기 직전에 화면 귀퉁이에 한 칸씩 그려 2D 캔버스로 옮긴다(돌아가며 한 번에 하나 · 초당 몇 번).
import * as THREE from 'three';

const TW = 184, TH = 112, EVERY = 0.16, MAX = 3;

/**
 * places: [{ id, name, x0, x1, z0, z1, floor }] — 방(설계도) 또는 팀 구역. floors: 층 묶음(다른 층 방도 비추게 잠깐 켠다)
 * busy(place) → 그 방에서 일하는 사람 수. onPick(place) → 그 방으로.
 */
export function createPip(stage, { host, places, floors, busy, onPick, focusOf }) {
  const { renderer, scene } = stage;
  const wrap = document.createElement('div'); wrap.className = 'o3-pip'; host.appendChild(wrap);
  const tiles = new Map(); // place.id → { el, cv, ctx, cam, place }
  let on = true, shown = [], turn = 0, acc = 0, pickT = -9;

  function tileFor(p) {
    let t = tiles.get(p.id); if (t) return t;
    const el = document.createElement('button'); el.className = 'o3-pip-tile'; el.type = 'button'; el.title = `${p.name} — 눌러서 이 방으로`;
    const cv = document.createElement('canvas'); el.append(cv);
    const cap = document.createElement('span'); cap.className = 'cap'; el.append(cap);
    el.addEventListener('click', () => onPick?.(p));
    const y = floors[p.floor ?? 0]?.position.y ?? 0, cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2, span = Math.max(p.x1 - p.x0, p.z1 - p.z0);
    const cam = new THREE.PerspectiveCamera(Math.min(70, 46 + span * 1.6), TW / TH, 0.1, 120);
    cam.position.set(p.x1 - 0.35, y + 2.75, p.z1 - 0.35); cam.lookAt(cx - (p.x1 - p.x0) * 0.08, y + 0.5, cz - (p.z1 - p.z0) * 0.08); // 앞 오른쪽 천장 모서리에서 내려다본다
    t = { el, cv, ctx: cv.getContext('2d'), cam, place: p, cap, drawn: false }; tiles.set(p.id, t); return t;
  }

  /** 보여 줄 방 고르기 — 지금 보는 방은 빼고, 일하는 사람이 많은 방부터 */
  function choose() {
    const f = focusOf?.();
    const list = places.filter((p) => !f || !(f.x >= p.x0 && f.x <= p.x1 && f.z >= p.z0 && f.z <= p.z1 && (f.floor == null || f.floor === (p.floor ?? 0))))
      .map((p) => ({ p, n: busy(p) })).sort((a, b) => b.n - a.n || a.p.name.localeCompare(b.p.name)).slice(0, MAX);
    const ids = list.map((x) => x.p.id).join();
    if (ids !== shown.map((t) => t.place.id).join()) { shown = list.map((x) => tileFor(x.p)); wrap.replaceChildren(...shown.map((t) => t.el)); }
    for (const { p, n } of list) { const t = tiles.get(p.id); t.cap.innerHTML = `<i class="rec"></i><b>${esc(p.name)}</b>${n ? `<em>${n}명 일하는 중</em>` : '<em>조용함</em>'}`; }
  }

  const vp = new THREE.Vector4();
  stage.beforeRender((t, dt) => {
    if (!on || places.length < 2) { wrap.hidden = true; return; }
    wrap.hidden = false;
    if (t - pickT > 2) { pickT = t; choose(); }
    acc += dt; if (acc < EVERY || !shown.length) return; acc = 0;
    const tile = shown[turn++ % shown.length];
    const dpr = renderer.getPixelRatio(), w = TW, h = TH, H = renderer.domElement.height;
    const vis = floors.map((g) => g.visible), fl = floors[tile.place.floor ?? 0];
    if (fl) fl.visible = true;
    renderer.getViewport(vp);
    const auto = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(null); renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h); renderer.setScissorTest(true);
    renderer.render(scene, tile.cam);
    if (tile.cv.width !== w * dpr) { tile.cv.width = w * dpr; tile.cv.height = h * dpr; }
    tile.ctx.drawImage(renderer.domElement, 0, H - h * dpr, w * dpr, h * dpr, 0, 0, tile.cv.width, tile.cv.height);
    renderer.setScissorTest(false); renderer.setViewport(vp); renderer.shadowMap.autoUpdate = auto;
    floors.forEach((g, i) => { g.visible = vis[i]; });
  });

  return {
    get on() { return on; },
    set(v) { on = !!v; wrap.hidden = !on; if (on) pickT = -9; },
    dispose() { wrap.remove(); },
  };
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
