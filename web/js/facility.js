// 기능 시설 업그레이드 — 시설 레벨이 오르면 그 화면에 편의 기능이 열린다(핵심 기능은 그대로)
import { act, api, html } from './lib.js';
import { ic, resIc } from './icons.js';

export const facLevel = (state, key) => state.space?.fac?.[key]?.level ?? 1;
export const hasFac = (state, key, level = 2) => facLevel(state, key) >= level;

/** 시설 업그레이드 버튼 + 비용 · 조건 (화면 안 잠금 안내와 3D 시설 카드가 같이 쓴다) */
export function Upgrade({ state, f }) {
  const res = state.space?.res ?? {}, bal = state.space?.balance ?? {}, n = f?.next;
  if (!n) return null;
  const unmet = n.reqs.find((r) => !r.met);
  return html`<div class="fac-up">
    <div class="cost">${Object.entries(n.cost).map(([k, v]) => html`<span class=${(bal[k] ?? 0) >= v ? '' : 'short'}>${resIc(k)} ${res[k]?.label} <b>${v}</b><small>/ ${bal[k] ?? 0}</small></span>`)}</div>
    <button class="btn sm pri" disabled=${!n.ready} title=${unmet?.label ?? (n.affordable ? '' : '자원이 모자라요')}
      onClick=${() => act(() => api('POST', '/api/space/facility', { key: f.key }), `${f.label} 레벨 ${n.level} — 기능이 열렸어요`)}>${n.ready ? `레벨 ${n.level}로 올리기` : unmet ? unmet.label : '자원이 모자라요'}</button>
  </div>`;
}

/** 아직 잠긴 편의 기능 안내 — 여기서 바로 업그레이드할 수 있다 */
export function FacLock({ state, fkey, level = 2 }) {
  const f = state.space?.fac?.[fkey];
  if (!f || f.level >= level) return null;
  return html`<div class="fac-lock"><span class="lk">${ic('lock', 18)}</span><div><b>${f.label} 레벨 ${level}에서 열려요</b><small>${f.next?.unlock}</small></div>
    <span class="sp"></span><${Upgrade} state=${state} f=${f} /></div>`;
}

/** 텍스트를 파일로 내려받기 */
export function download(filename, text, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
