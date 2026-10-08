// 실제 플랫폼 모양 미리보기(결정 45) — 블로그(Ghost·WordPress) / Threads / LinkedIn
// 문단을 누르면 코멘트를 단다(onPick). 게시물 본문은 마크다운 블록으로 나눠 번호를 붙인다.
import { Portrait } from './art.js';
import { html, mdBlocks } from './lib.js';
import { ic } from './icons.js';

function Blocks({ src, comments, onPick, active }) {
  const blocks = mdBlocks(src);
  return html`${blocks.map((b, i) => {
    const n = comments.filter((c) => Number(c.anchor) === i).length;
    return html`<div class=${`pblock${onPick ? ' pick' : ''}${active === i ? ' on' : ''}`} onClick=${onPick ? () => onPick(i, b.html.replace(/<[^>]+>/g, '').slice(0, 80), `문단 ${i + 1}`) : undefined}>
      <div class="md" dangerouslySetInnerHTML=${{ __html: b.html }}></div>${n > 0 && html`<span class="cmt-n">${ic('chat', 12)} ${n}</span>`}</div>`;
  })}`;
}

export function PlatformPreview({ platform, artifact, media, office, author, comments = [], onPick, active }) {
  if (!artifact) return null;
  const thumb = media?.find((m) => m.use === 'thumbnail') ?? media?.[0];
  if (platform === 'blog') {
    return html`<article class="pv pv-blog">
      ${thumb ? html`<img class="pv-thumb" src=${`/api/media/${thumb.id}`} alt="썸네일"/>` : html`<div class="pv-thumb empty">썸네일 없음</div>`}
      <h2 class="pv-title">${artifact.title}</h2>
      ${artifact.meta?.excerpt && html`<p class="pv-excerpt">${artifact.meta.excerpt}</p>`}
      <div class="pv-meta">${office} · ${author ?? ''}${(artifact.meta?.tags ?? []).map((t) => html`<span class="pv-tag">#${t}</span>`)}</div>
      <${Blocks} src=${artifact.body} comments=${comments} onPick=${onPick} active=${active} />
    </article>`;
  }
  const isThreads = platform === 'threads';
  return html`<article class=${`pv pv-${platform}`}>
    <div class="pv-head"><span class="pv-avatar">${(office ?? '?').slice(0, 1)}</span><div><b>${office}</b><small>${isThreads ? '@' + (office ?? '').replace(/\s/g, '').toLowerCase() : '1인 사업자 · 방금'}</small></div><span class="pv-logo">${isThreads ? '@' : 'in'}</span></div>
    <${Blocks} src=${artifact.body} comments=${comments} onPick=${onPick} active=${active} />
    ${thumb && html`<img class="pv-img" src=${`/api/media/${thumb.id}`} alt="첨부 이미지"/>`}
    <div class="pv-foot"><span class="pv-acts">${isThreads ? html`${ic('heart', 18)}${ic('chat', 18)}${ic('repeat', 18)}${ic('send', 18)}` : html`<span>${ic('thumb')} 좋아요</span><span>${ic('chat')} 댓글</span><span>${ic('share')} 공유</span>`}</span><span class="muted">${artifact.body.length}자${isThreads && artifact.body.length > 500 ? ' · 500자 초과' : ''}</span></div>
  </article>`;
}

/** 문서 결과물(업무 블록, 결정 73 · P2 결정 1) — 모양(meta.shape)에 맞춰 표 · 체크리스트 · 문서로 보여 준다.
 *  누르면 코멘트(onPick(번호, 인용, 이름표)) — 표는 칸, 체크리스트는 항목, 문서는 문단. 모양 정보가 없으면(P1) 문서 */
export function DocPreview({ artifact, author, comments = [], onPick, active }) {
  if (!artifact) return null;
  const shape = docShape(artifact);
  const count = (i) => comments.filter((c) => Number(c.anchor) === i).length;
  return html`<article class=${`pv pv-doc pv-${shape}`}>
    <h2 class="pv-title">${artifact.title}</h2>
    <div class="pv-meta">${author ?? ''} · v${artifact.version}${shape === 'table' ? ' · 표' : shape === 'checklist' ? ' · 체크리스트' : ''}</div>
    ${shape === 'table' ? html`<${SheetTable} table=${artifact.meta.table} count=${count} onPick=${onPick} active=${active} />`
      : shape === 'checklist' ? html`<${CheckItems} items=${artifact.meta.items} count=${count} onPick=${onPick} active=${active} />`
      : html`<${Blocks} src=${artifact.body} comments=${comments} onPick=${onPick} active=${active} />`}
  </article>`;
}

/** 화면에 그릴 모양 — 표 · 체크리스트 자료가 비어 있으면 마크다운 본문으로 */
export function docShape(artifact) {
  const m = artifact?.meta ?? {};
  if (m.shape === 'table' && m.table?.columns?.length && m.table.rows?.length) return 'table';
  if (m.shape === 'checklist' && m.items?.length) return 'checklist';
  return 'doc';
}

/** 표 — 칸을 누르면 그 줄에 코멘트(번호 = 줄) */
function SheetTable({ table, count, onPick, active }) {
  const { columns, rows } = table;
  return html`<div class="sheet"><table>
    <thead><tr>${columns.map((c) => html`<th>${c}</th>`)}</tr></thead>
    <tbody>${rows.map((r, i) => {
      const n = count(i);
      return html`<tr class=${`${onPick ? 'pick' : ''}${active === i ? ' on' : ''}`}>${columns.map((c, j) => html`<td
        onClick=${onPick ? () => onPick(i, `${c}: ${r[j] ?? ''}`.slice(0, 80), `${i + 1}번째 줄 · ${c}`) : undefined}>${r[j] ?? ''}${j === 0 && n > 0 ? html`<span class="cmt-n">${ic('chat', 12)} ${n}</span>` : ''}</td>`)}</tr>`;
    })}</tbody></table></div>
    ${columns.length > 3 && html`<p class="sheet-hint">옆으로 밀면 나머지 칸이 보여요</p>`}`;
}

/** 체크리스트 — 누가(대표 · 팀) · 기한 · 전문가 확인. 체크는 '내 할 일'에서(P2 결정 3) */
function CheckItems({ items, count, onPick, active }) {
  const ceo = items.filter((x) => x.owner === 'ceo').length;
  const expert = items.filter((x) => x.expert).length;
  return html`<div class="cklist">
    <p class="ck-sum"><span class="pill ck-ceo">대표</span> ${ceo}개 <span class="pill ck-team">팀</span> ${items.length - ceo}개${expert > 0 ? html` <span class="pill st-issue">전문가 확인</span> ${expert}개` : ''}</p>
    <ol>${items.map((x, i) => {
      const n = count(i);
      return html`<li class=${`ck-item${onPick ? ' pick' : ''}${active === i ? ' on' : ''}${x.owner === 'ceo' ? ' ceo' : ''}`}
        onClick=${onPick ? () => onPick(i, x.text.slice(0, 80), `${i + 1}번 항목`) : undefined}>
        <span class=${`pill ${x.owner === 'ceo' ? 'ck-ceo' : 'ck-team'}`}>${x.owner === 'ceo' ? '대표' : '팀'}</span>
        <span class="ck-text">${x.text}${x.expert ? html` <span class="pill st-issue">전문가 확인</span>` : ''}</span>
        ${x.due && html`<span class="ck-due">기한 ${x.due}</span>`}
        ${n > 0 && html`<span class="cmt-n">${ic('chat', 12)} ${n}</span>`}</li>`;
    })}</ol></div>`;
}

export function AuthorChip({ name, look }) {
  return html`<span class="author">${look && html`<${Portrait} look=${look} size=${22} />`}${name}</span>`;
}
