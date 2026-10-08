// 주간 발행 캘린더(결정 45·50) — 한 주 × 플랫폼 레인. 게시 완료·예약·확인 대기·확인 필요·실패를 함께 표시.
import { hhmm, html, platformLabel, useApi, useState } from '../lib.js';

const LANES = ['blog', 'threads', 'linkedin'];
const LABEL = { open: '확인 대기', scheduled: '예약', succeeded: '게시됨', dry_run: '연습 게시', unknown: '확인 필요', failed: '실패', running: '실행 중', cancelled: '취소' };

export function Calendar({ onPick, onAction }) {
  const [offset, setOffset] = useState(0);
  const d = useApi(`/api/calendar?offset=${offset}`).data;
  if (!d) return html`<p class="muted">불러오는 중…</p>`;
  const days = Array.from({ length: 7 }, (_, i) => { const x = new Date(d.weekStart); x.setDate(x.getDate() + i); return x; });
  const key = (x) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const today = key(new Date());
  const entryClick = (e) => (e.kind === 'confirm' ? onPick?.(e.id) : onAction ? onAction(e) : e.decisionId && onPick?.(e.decisionId));
  return html`<div class="cal">
    <div class="row"><button class="btn sm" onClick=${() => setOffset(offset - 1)}>‹ 지난주</button><b>${days[0].getMonth() + 1}/${days[0].getDate()} – ${days[6].getMonth() + 1}/${days[6].getDate()}</b>
      <button class="btn sm" onClick=${() => setOffset(offset + 1)}>다음 주 ›</button>${offset !== 0 && html`<button class="btn sm quiet" onClick=${() => setOffset(0)}>이번 주</button>`}
      <span class="sp"></span>${Object.entries(LABEL).slice(0, 6).map(([k, l]) => html`<span class=${`pill st-${k}`}>${l}</span>`)}</div>
    ${(d.carry ?? []).length > 0 && html`<div class="carry"><b>지난주에서 넘어온 것</b>${d.carry.map((e) => html`<button class=${`cal-e st-${e.status}`} onClick=${() => entryClick(e)}>${LABEL[e.status]} · ${e.title}</button>`)}</div>`}
    <div class="cal-grid">
      <div class="cal-h"></div>${days.map((x) => html`<div class=${`cal-h${key(x) === today ? ' today' : ''}`}>${'월화수목금토일'[(x.getDay() + 6) % 7]} ${x.getMonth() + 1}/${x.getDate()}</div>`)}
      ${LANES.map((lane) => html`<div class="cal-lane">${platformLabel(lane)}</div>${days.map((x) => {
        const items = d.entries.filter((e) => e.platform === lane && key(new Date(e.at)) === key(x));
        return html`<div class=${`cal-cell${key(x) === today ? ' today' : ''}`}>${items.map((e) => html`<button class=${`cal-e st-${e.status}`} onClick=${() => entryClick(e)} title=${e.note ?? ''}>
          <span class="t">${hhmm(e.at)}</span><span class="n">${e.title}</span><span class="s">${LABEL[e.status] ?? e.status}</span></button>`)}</div>`;
      })}`)}
    </div>
    <p class="note">반응 지표(조회수 등)는 모으지 않아요. 연습 게시는 실제로 올리지 않은 기록이에요.</p>
  </div>`;
}
