// 자동 연출 카메라 — 켜 두면, 손을 뗀 지 몇 초 뒤부터 카메라가 스스로 일어나는 일을 따라간다(실제 이벤트만).
// 인계로 걷는 직원을 따라가고, 결과물 · 메시지를 낸 직원을 가까이, 결정이 생기면 결재 자리로. 조용하면 방 → 책상 → 건물 → 동네를 천천히 돈다.
// 화면을 만지는 순간 멈추고(수동), 다시 가만히 두면 이어 간다.
import * as THREE from 'three';

const IDLE_MS = 9000, SHOT = 7.5, FLY = 2.6;
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches; // 움직임 줄이기 — 장면만 바꾸고 천천히 도는 움직임은 뺀다

/** ctx: { stage, people, places, zoomTo, center, decisionsAt, floorOf, showFloor } */
export function createDirector(ctx) {
  const { stage } = ctx;
  let on = false, active = false, shot = null, step = 0;
  const queue = [], listeners = new Set(), v = new THREE.Vector3();
  const notify = () => { for (const fn of listeners) fn({ on, active }); };

  const person = (id) => { const p = ctx.people.get(id); return p && !p.ghost ? p : null; };
  const posOf = (p) => p.c.root.getWorldPosition(v).clone();
  /** 다음 장면 — 이벤트가 먼저, 없으면 조용한 순환 */
  function next() {
    while (queue.length) {
      const ev = queue.shift();
      if (ev.kind === 'walk') { const p = person(ev.id); if (p?.walk) return { follow: p, h: 9, dur: 12, label: `${p.e.name} · 인계하러 가는 중` }; }
      if (ev.kind === 'person') { const p = person(ev.id); if (p) return { target: posOf(p).add(new THREE.Vector3(0, 0.7, 0)), h: 6, dur: SHOT, floor: p.slot.floor, label: `${p.e.name} · ${ev.why}` }; }
      if (ev.kind === 'decision') { const at = ctx.decisionsAt?.(); if (at) return { target: at, h: 9, dur: SHOT, floor: ctx.floorOf?.(at), label: '결정이 생겼어요 — 결재 자리' }; }
    }
    const busy = [...ctx.people.values()].filter((p) => !p.ghost && p.mode !== 'idle');
    const plan = ['room', 'desk', 'building', 'room', 'block'];
    for (let i = 0; i < plan.length; i++) {
      const kind = plan[step++ % plan.length];
      if (kind === 'desk') { const p = (busy.length ? busy : [...ctx.people.values()].filter((q) => !q.ghost))[step % Math.max(1, busy.length || ctx.people.size)]; if (p) return { target: posOf(p).add(new THREE.Vector3(0, 0.7, 0)), h: 5.5, dur: SHOT, floor: p.slot.floor, label: `${p.e.name} · ${p.e.statusLabel ?? '자리'}` }; continue; }
      if (kind === 'room') {
        const pl = ctx.places.length ? ctx.places[step % ctx.places.length] : null;
        if (pl) return { target: new THREE.Vector3((pl.x0 + pl.x1) / 2, ctx.floorY?.(pl.floor) ?? 0, (pl.z0 + pl.z1) / 2), h: Math.max(pl.x1 - pl.x0, pl.z1 - pl.z0) * 1.25 + 3, dur: SHOT, floor: pl.floor, drift: 0.05, label: pl.name };
        continue;
      }
      if (kind === 'building') return { level: 'building', dur: SHOT + 2, drift: 0.09, label: '우리 건물' };
      if (kind === 'block') return { level: 'block', dur: SHOT + 2, drift: 0.05, pan: 1.6, label: '동네' };
    }
    return { level: 'room', dur: SHOT };
  }
  function start(s, t) {
    shot = { ...s, t0: t };
    if (s.floor != null) ctx.showFloor?.(s.floor);
    if (s.level) ctx.zoomTo(s.level, FLY);
    else if (s.follow) stage.setView({ target: posOf(s.follow), h: s.h }, 1.6);
    else stage.setView({ target: s.target, h: s.h }, FLY);
    notify();
  }
  function update(t, dt) {
    const want = on && stage.idleMs() > IDLE_MS && !stage.editing;
    if (want !== active) {
      active = want; stage.busy = active;
      if (!active) { shot = null; const g = stage.getView(); stage.setView({ target: g.target, h: g.h }, 0.5); } // 손대면 멈추고 대각선에 맞춘다
      notify();
    }
    if (!active) return;
    if (!shot || t - shot.t0 > shot.dur || (shot.follow && !shot.follow.walk && t - shot.t0 > 2)) { start(next(), t); return; }
    if (stage.flying) return;
    const g = stage.getView();
    if (shot.follow) { const p = posOf(shot.follow); g.target.lerp(p, Math.min(1, dt * 2.5)); stage.setView({ target: g.target, h: g.h, az: g.az }, 0); }
    else if ((shot.drift || shot.pan) && !calm()) {
      if (shot.pan) g.target.add(new THREE.Vector3(Math.cos(t * 0.1), 0, Math.sin(t * 0.1)).multiplyScalar(shot.pan * dt));
      stage.setView({ target: g.target, h: g.h, az: g.az + (shot.drift ?? 0) * dt }, 0);
    }
  }
  stage.onUpdate(update);
  return {
    get on() { return on; }, get active() { return active; }, get label() { return shot?.label ?? ''; },
    set(v2) { on = !!v2; if (!on && active) { active = false; stage.busy = false; shot = null; } notify(); },
    /** 실제 이벤트 → 장면 후보 */
    note(ev) {
      if (!on) return;
      const d = ev.data ?? {};
      if (ev.type === 'handoff_accepted' && d.fromId) queue.unshift({ kind: 'walk', id: d.fromId });
      else if (ev.type === 'artifact_saved' && ev.actorId) queue.push({ kind: 'person', id: ev.actorId, why: '결과물을 냈어요' });
      else if (ev.type === 'message' && ev.actorId) queue.push({ kind: 'person', id: ev.actorId, why: '말하는 중' });
      else if (ev.type === 'decision_opened') queue.push({ kind: 'decision' });
      if (queue.length > 6) queue.splice(0, queue.length - 6);
      if (active && shot && !shot.follow && queue[0]?.kind === 'walk') shot.t0 = -1e9; // 걷기는 바로
    },
    onChange(fn) { listeners.add(fn); fn({ on, active }); return () => listeners.delete(fn); },
  };
}
