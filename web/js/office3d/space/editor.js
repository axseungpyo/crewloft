// 배치 모드 — 물건을 끌어서 옮기고(0.25m 칸에 맞춤) R로 돌린다. 방 밖·다른 물건과 겹침·문 앞은 놓을 수 없다(빨강).
import * as THREE from 'three';

const SNAP = 0.25, UP = new THREE.Vector3(0, 1, 0);
/** 꾹 누르면 배치 모드 — 이 시간(ms)만큼 누르고 있으면 그 물건을 들어 올린다 */
export const LONG_PRESS_MS = 800;
/** 원은 이만큼(ms) 누르고 있을 때부터 보인다 — 그냥 클릭엔 안 보이게 */
const RING_DELAY = 220;

/** 물건이 바닥에서 차지하는 축 정렬 사각형(놓을 자리 기준) */
export function rectOf(m, x = m.obj.position.x, z = m.obj.position.z, rot = m.obj.rotation.y) {
  const { w, d, cx = 0, cz = 0 } = m.fp;
  let ax = Infinity, az = Infinity, bx = -Infinity, bz = -Infinity;
  for (const [px, pz] of [[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx + w / 2, cz + d / 2], [cx - w / 2, cz + d / 2]]) {
    const v = new THREE.Vector3(px, 0, pz).applyAxisAngle(UP, rot);
    ax = Math.min(ax, v.x + x); bx = Math.max(bx, v.x + x); az = Math.min(az, v.z + z); bz = Math.max(bz, v.z + z);
  }
  return { ax, az, bx, bz };
}
const hit = (a, b, m = 0.04) => a.ax < b.bx - m && b.ax < a.bx - m && a.az < b.bz - m && b.az < a.bz - m;

/** 이 자리에 놓을 수 있는가 — 방 안 · 문 앞 비움 · 다른 물건과 안 겹침 */
export function canPlace(m, all, x, z, rot) {
  const r = rectOf(m, x, z, rot), room = m.room;
  if (r.ax < room.x0 + 0.12 || r.bx > room.x1 - 0.12 || r.az < room.z0 + 0.12 || r.bz > room.z1 - 0.12) return false;
  if (room.door && hit(r, room.door, 0)) return false;
  for (const o of all) if (o !== m && o.room === room && hit(r, rectOf(o))) return false;
  return true;
}

export function attachEditor(stage, movables, { onPlace, onSelect, onChange, onEditStart, ring } = {}) {
  const el = stage.renderer.domElement, cam = stage.camera, ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const plane = new THREE.Plane(UP, 0), hitP = new THREE.Vector3();
  const layer = new THREE.Group(); layer.visible = false; stage.scene.add(layer);
  const lineMat = (c, o) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: o, depthTest: false });
  const outlines = new Map();
  for (const m of movables) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.LineLoop(geo, lineMat('#FFFFFF', 0.55)); line.renderOrder = 10; layer.add(line); outlines.set(m, line);
  }
  const draw = (m, color, opacity) => {
    const r = rectOf(m), line = outlines.get(m), y = (m.obj.parent?.getWorldPosition(new THREE.Vector3()).y ?? 0) + 0.03;
    const p = line.geometry.attributes.position;
    [[r.ax, r.az], [r.bx, r.az], [r.bx, r.bz], [r.ax, r.bz]].forEach(([x, z], i) => p.setXYZ(i, x, y, z));
    p.needsUpdate = true; line.material.color.set(color); line.material.opacity = opacity;
  };
  const refresh = () => { for (const m of movables) draw(m, m === sel ? (bad ? '#E5484D' : '#2E9E6A') : '#3E6A8A', m === sel ? 1 : 0.55); };

  let on = false, sel = null, drag = null, bad = false;
  /** 누른 물건. skipPeople 이면 직원(캐릭터)을 누른 건 물건으로 치지 않는다 — 직원은 눌러서 카드를 여는 대상 */
  const pick = (ev, skipPeople = false) => {
    const r = el.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    const h = ray.intersectObjects(movables.map((m) => m.obj), true)[0];
    if (!h) return null;
    if (skipPeople) for (let o = h.object; o; o = o.parent) if (o.userData.empId) return null;
    for (let o = h.object; o; o = o.parent) { const m = movables.find((x) => x.obj === o); if (m) return m; }
    return null;
  };
  const floorAt = (ev) => {
    const r = el.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam); return ray.ray.intersectPlane(plane, hitP) ? hitP.clone() : null;
  };
  const select = (m) => { sel = m; bad = false; refresh(); onSelect?.(m ? { id: m.id, label: m.label } : null); };

  const startDrag = (m, ev) => {
    const p = floorAt(ev); if (!p) return;
    drag = { m, sx: m.obj.position.x, sz: m.obj.position.z, ox: p.x - m.obj.position.x, oz: p.z - m.obj.position.z };
    if (stage.controls) stage.controls.enabled = false;
    el.setPointerCapture?.(ev.pointerId);
  };
  // ── 꾹 누르기: 배치 모드가 아닐 때 물건을 0.8초 누르고 있으면 배치 모드로 들어가며 그 물건을 바로 끈다 ──
  // 직원(캐릭터)을 누르면 꾹 누르기를 하지 않는다(카드만). 원은 잠깐(RING_DELAY) 누르고 있을 때부터 보여 짧은 클릭에 번쩍이지 않게 한다
  let hold = null;
  const cancelHold = () => { if (!hold) return; clearTimeout(hold.timer); clearTimeout(hold.show); ring?.hide(); hold = null; };
  function down(ev) {
    if (ev.button !== 0) return;
    if (!on) {
      const m = pick(ev, true); if (!m) return;
      const at = { clientX: ev.clientX, clientY: ev.clientY, pointerId: ev.pointerId };
      const show = setTimeout(() => ring?.show(at.clientX, at.clientY, LONG_PRESS_MS - RING_DELAY), RING_DELAY);
      hold = { m, x: ev.clientX, y: ev.clientY, at, show, timer: setTimeout(() => {
        const h = hold; hold = null; clearTimeout(h.show); ring?.hide();
        on = true; stage.editing = true; layer.visible = true; // 화면이 상태를 바꾸기 전에 바로 끌 수 있게
        select(h.m); startDrag(h.m, h.at); onEditStart?.();
      }, LONG_PRESS_MS) };
      return;
    }
    const m = pick(ev); if (!m) { select(null); return; }
    ev.stopImmediatePropagation(); ev.preventDefault();
    select(m); startDrag(m, ev);
  }
  function move(ev) {
    if (hold) { if (Math.hypot(ev.clientX - hold.x, ev.clientY - hold.y) > 8) cancelHold(); else hold.at = { clientX: ev.clientX, clientY: ev.clientY, pointerId: ev.pointerId }; return; }
    if (!on) return;
    if (!drag) { el.style.cursor = pick(ev) ? 'grab' : ''; return; }
    const p = floorAt(ev); if (!p) return;
    const m = drag.m, x = Math.round((p.x - drag.ox) / SNAP) * SNAP, z = Math.round((p.z - drag.oz) / SNAP) * SNAP;
    m.obj.position.x = x; m.obj.position.z = z; el.style.cursor = 'grabbing';
    bad = !canPlace(m, movables, x, z, m.obj.rotation.y); refresh();
  }
  function up() {
    cancelHold();
    if (!drag) return;
    const m = drag.m;
    if (bad) { m.obj.position.x = drag.sx; m.obj.position.z = drag.sz; bad = false; }
    else if (m.obj.position.x !== drag.sx || m.obj.position.z !== drag.sz) { onPlace?.(m.id, { x: m.obj.position.x, z: m.obj.position.z, rot: m.obj.rotation.y }); onChange?.(); }
    drag = null; refresh();
    if (stage.controls) stage.controls.enabled = true;
    el.style.cursor = '';
  }
  function rotate() {
    if (!sel) return false;
    const m = sel, next = (m.obj.rotation.y + Math.PI / 2) % (Math.PI * 2);
    if (!canPlace(m, movables, m.obj.position.x, m.obj.position.z, next)) { bad = true; refresh(); setTimeout(() => { bad = false; refresh(); }, 500); return false; }
    m.obj.rotation.y = next; refresh(); onPlace?.(m.id, { x: m.obj.position.x, z: m.obj.position.z, rot: next }); onChange?.(); return true;
  }
  function reset() {
    if (!sel) return;
    const m = sel, [x, z, rot] = m.home;
    if (!canPlace(m, movables, x, z, rot)) { bad = true; refresh(); setTimeout(() => { bad = false; refresh(); }, 500); return; }
    m.obj.position.x = x; m.obj.position.z = z; m.obj.rotation.y = rot; refresh(); onPlace?.(m.id, null); onChange?.();
  }
  const key = (ev) => { if (!on) return; if (ev.key === 'r' || ev.key === 'R') rotate(); };
  el.addEventListener('pointerdown', down, true);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  addEventListener('keydown', key);
  return {
    get on() { return on; },
    setEnabled(v) { if (v === on && !(v && !layer.visible)) return; on = v; stage.editing = v; layer.visible = v; if (!v) { select(null); drag = null; if (stage.controls) stage.controls.enabled = true; } else refresh(); },
    rotate, reset,
    dispose() { cancelHold(); el.removeEventListener('pointerdown', down, true); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); removeEventListener('keydown', key); layer.removeFromParent(); },
  };
}
