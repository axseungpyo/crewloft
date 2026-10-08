// 작은 3D 사무실 보기 — 온보딩·채용처럼 HUD 없이 지금 사무실과 후보를 보여 줄 때 쓴다(성장형 오피스, 결정 66)
import { html, useEffect, useRef, useState } from './lib.js';

/** people: [{ id, name, role, rank, status, statusLabel, mode, ghost }] */
export function MiniOffice({ state, people, onFail }) {
  const host = useRef(null), over = useRef(null), h = useRef(null);
  const stage = state.office?.stage ?? 0;
  const view = () => ({
    company: state.office?.name ?? '', cycleLabel: state.cycle?.label ?? null, flow: state.flow ?? [], decisions: state.counts?.decisions ?? 0,
    books: 0, trophies: 0, aiOn: state.ai?.status?.state === 'ready', aiLabel: state.ai?.label ?? '', selectedId: null, employees: people,
  });
  useEffect(() => {
    let alive = true;
    if (!window.WebGL2RenderingContext) { onFail?.(); return undefined; }
    Promise.all([import('./office3d/office.js'), import('./office3d/layouts/index.js')])
      .then(async ([{ createOffice }, { loadLayout }]) => createOffice(host.current, over.current, { layout: await loadLayout(stage) }))
      .then((o) => { if (!alive) { o.dispose(); return; } h.current = o; o.update(view()); o.home(people.filter((p) => !p.ghost)); o.frameDesks(); })
      .catch((e) => { console.error('3D 사무실을 열지 못했어요', e); if (alive) onFail?.(); });
    return () => { alive = false; h.current?.dispose(); h.current = null; };
  }, [stage]);
  const key = people.map((p) => p.id).join();
  useEffect(() => { h.current?.update(view()); });
  useEffect(() => { h.current?.frameDesks(); }, [key]);
  return html`<div class="mini3d"><div class="o3-canvas" ref=${host}></div><div class="o3-tags" ref=${over}></div></div>`;
}
