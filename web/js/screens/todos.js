// 내 할 일(P2 결정 3 · 계약 3 · 결정 87: 확인할 것 화면 아래) — 확정한 실행 계획의 대표 몫 · 체크리스트 [대표] 항목. 체크는 대표가, 다음 주간 회고가 진행을 읽는다
import { act, api, html, meta, useApi, useState, when } from '../lib.js';
import { DocDrawer } from './work.js';
import { ic } from '../icons.js';

const dueLabel = (due) => {
  if (!due) return null;
  if (!/^\d{4}-\d{2}-\d{2}/.test(due)) return due; // '2주차' 같은 글은 그대로
  const d = new Date(due);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  return { text: `${d.getMonth() + 1}/${d.getDate()}까지`, late: days < 0, soon: days >= 0 && days <= 2 };
};

function Item({ t, onDoc, src = false }) {
  const done = t.status === 'done';
  const due = dueLabel(t.due);
  const toggle = () => act(() => api('POST', `/api/todos/${t.id}`, { done: !done }), done ? '다시 열었어요' : '했어요');
  return html`<li class=${`todo${done ? ' done' : ''}`}>
    <label class="todo-ck"><input type="checkbox" checked=${done} onChange=${toggle} aria-label=${done ? '다시 열기' : '했어요'} /><span class="box" aria-hidden="true">${ic('check', 12)}</span></label>
    <div class="todo-b"><p>${t.text}</p>
      <small>${due && html`<span class=${`pill${typeof due === 'object' && due.late && !done ? ' st-issue' : typeof due === 'object' && due.soon && !done ? ' st-me' : ''}`}>${typeof due === 'object' ? due.text : due}</span>`}
        ${src && html`<button class="todo-src" onClick=${() => onDoc(t.artifactId)} title="출처 문서 열기">${meta.todoSources[t.source] ?? t.source} · ${t.artifactTitle}</button>`}
        ${done && t.doneAt && html`<span class="muted">${when(t.doneAt)}에 함</span>`}</small></div></li>`;
}

export function Todos() {
  const d = useApi('/api/todos').data;
  const [doc, setDoc] = useState(null);
  if (!d) return html`<p class="muted">불러오는 중…</p>`;
  // 출처(어느 계획 · 체크리스트)별로 묶는다 — 같은 문서의 할 일은 한곳에. 상자 없이 선 · 여백(결정 87)
  const groups = [...d.open.reduce((m, t) => m.set(t.artifactId, [...(m.get(t.artifactId) ?? []), t]), new Map()).values()];
  return html`<div class="todos flat">
    ${!d.open.length && html`<p class="ln-empty">${d.done.length ? '다 했어요. 새 계획이나 체크리스트를 확정하면 대표 몫이 또 들어와요.' : '아직 내 할 일이 없어요. 실행 계획이나 체크리스트를 확정하면 대표가 할 일이 여기 들어와요.'}</p>`}
    ${groups.map((g) => html`<div class="todo-g"><p class="todo-src-h"><span>${meta.todoSources[g[0].source] ?? g[0].source}</span><button class="todo-doc" onClick=${() => setDoc(g[0].artifactId)} title="출처 문서 열기">${g[0].artifactTitle} ${ic('share', 12)}</button></p>
      <ul>${g.map((t) => html`<${Item} t=${t} onDoc=${setDoc} />`)}</ul></div>`)}
    ${d.done.length > 0 && html`<details class="todo-g done bs-fold"><summary>끝낸 일 ${d.done.length}</summary>
      <ul>${d.done.map((t) => html`<${Item} t=${t} onDoc=${setDoc} src />`)}</ul></details>`}
    ${doc && html`<${DocDrawer} artifactId=${doc} onClose=${() => setDoc(null)} />`}
  </div>`;
}
