// 확인할 것(결정 87 · 결정 80) — 대표 몫 목록(질문 → 확인 → 밖으로) + 아래 시트. 사무실 말풍선도 같은 시트(DecisionSheet)를 연다.
// 카드 상자 없이 선 · 여백 목록. 등급 세 가지(밖으로 · 방향 · 사무실 안)는 줄 앞 표시 + 낱말로만, 밖으로 나가는 글은 ① 원문 확인 → ② 승인
import { Markdown, act, api, go, html, josa, meta, platformLabel, roleFull, usd, useApi, useEffect, useState, when } from '../lib.js';
import { DocPreview, PlatformPreview, docShape } from '../preview.js';
import { Todos } from './todos.js';
import { Portrait } from '../art.js';
import { ExternalNote, HandoffMemo, KIND_EXTRA, Meter, RISK, riskOf, scopeLabel } from '../agentops.js';
import { hasFac } from '../facility.js';
import { BottomSheet, Sec, Was } from '../sheet.js';
import { ic } from '../icons.js';

/** 게시 기록 상태 — 영어 값을 그대로 보이지 않게(문서 · 캘린더와 같은 낱말) */
const PUB_ST = { scheduled: '예약됨', succeeded: '게시됨', dry_run: '연습 게시', unknown: '확인 필요', failed: '실패', running: '게시하는 중', cancelled: '취소', pending: '대기', blocked: '멈춤 · 승인 뒤 바뀜' };
const APP = { ghost: 'Ghost', wordpress: 'WordPress', threads: 'Threads', linkedin: 'LinkedIn', blog: '블로그' };
/** 게시 경고 종류 — 서버가 종류 값(payload.warningKeys)을 주면 그걸 쓰고, 아니면 문장 속 낱말로 고른다(옛 낱말 · 새 낱말 함께) */
const WARN_TAG = { dry_run: '연습 게시', no_connection: '연결 전', no_thumbnail: '썸네일 없음', public_url: '이미지 주소' };
const warnKind = (w, key) => key ?? (/드라이런|연습 게시/.test(w) ? 'dry_run' : /썸네일/.test(w) ? 'no_thumbnail' : /공개 주소/.test(w) ? 'public_url' : /연결/.test(w) ? 'no_connection' : 'other');
const warnKinds = (p) => (p.warnings ?? []).map((w, i) => warnKind(w, p.warningKeys?.[i]));
const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const clip = (s, n) => { const t = String(s ?? '').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** 묶어서 한 번에 확정할 수 있는 결정 — 사무실 안 등급의 확인만(질문 · 계속할까요 · 재연결은 하나씩) */
const batchable = (d) => riskOf(d) === 'internal' && !['owner_question', 'budget_continue', 'reconnect', 'office_move'].includes(d.kind);
const kindName = (d) => KIND_EXTRA[d.kind] ?? meta.decisionKinds[d.kind] ?? '확인';
const previewedAt = (d) => d.payload?.previewedAt ?? d.previewedAt ?? null;

// ── 대표 차례 세 가지(결정 87) — 질문 → 확인 → 밖으로. 목록 순서 · 말풍선 순서가 같다 ──
export const TURN = { ask: { label: '질문', icon: 'question' }, check: { label: '확인', icon: 'decisions' }, out: { label: '밖으로 나가는 글', icon: 'send' } };
export const TURN_ORDER = ['ask', 'check', 'out'];
export const turnOf = (d) => (d.kind === 'owner_question' || d.kind === 'budget_continue' ? 'ask' : riskOf(d) === 'external' ? 'out' : 'check');
export const byTurn = (list) => TURN_ORDER.flatMap((t) => list.filter((d) => turnOf(d) === t));

/** 이 결정을 들고 있는 직원 — 묻는 직원(payload.from) · 한도에 닿은 직원 · 만든 직원(이름), 없으면 매니저.
    서버가 결정에 직원 id를 주지 않아(authorName만) 이름으로 찾는다 — tech-dev에 authorId를 요청함 */
export function ownerOf(d, employees) {
  const p = d.payload ?? {};
  const byId = (id) => (id ? employees.find((e) => e.id === id) : null);
  return byId(p.from) ?? byId(p.employeeId) ?? (d.authorName ? employees.find((e) => e.name === d.authorName) : null) ?? employees.find((e) => e.role === 'manager') ?? null;
}

/** 머리 위 인주색 말풍선 글 — 그 직원의 첫 차례 + 남은 수 */
export function bubbleText(list) {
  const d = list[0], t = turnOf(d);
  const head = t === 'ask' ? (d.kind === 'budget_continue' ? '질문 · 계속할까요?' : '질문 · 물어볼 게 있어요') : `${t === 'out' ? '밖으로' : '확인'} · ${clip(d.artifact?.title ?? d.title, 14)}`;
  return list.length > 1 ? `${head} 외 ${list.length - 1}` : head;
}

/** 등급 — 줄 앞 표시(○ ◆ ▲) + 낱말. 색 바탕 없이 */
export const RiskWord = ({ d }) => { const r = riskOf(d); return html`<span class=${`rk-w rk-${r}`} title=${RISK[r].hint}><i aria-hidden="true">${RISK[r].mark}</i>${RISK[r].label}</span>`; };

/** 승인한 내용 고정(계약 4) — 승인 순간의 지문 */
const Fixed = ({ d }) => (d.payload?.approvedHash ? html`<p class="bs-why">${ic('stamp', 14)} 승인한 내용 고정 · 지문 <code>${d.payload.approvedHash.slice(0, 10)}</code> — 보내기 직전에 다시 맞춰 보고, 다르면 보내지 않고 다시 물어요.</p>` : null);

/** 처리한 뒤 한 줄 */
function Resolved({ d, approved = '확정했어요' }) {
  const word = { approved, rejected: d.comment?.startsWith('보류') || d.comment?.includes('게시하지 않') ? d.comment : '고칠 점을 보냈어요 — 같은 담당자가 새 버전을 써요', stale: '새 버전으로 바뀌었어요 — 새 버전을 다시 확인해요' }[d.status] ?? d.status;
  return html`<${Sec}><${Was}>${word}${d.scope === 'always' ? ' · 앞으로도 지킬 규칙으로 저장' : ''}</${Was}>${d.comment && !String(word).includes(d.comment) && html`<p class="bs-why">${d.comment}</p>`}${d.status === 'approved' && html`<${Fixed} d=${d} />`}</${Sec}>`;
}

/** 시트 첫 줄 — 무엇인지(인주색) + 등급 낱말 */
const Eyebrow = ({ d, extra }) => html`<p class="bs-eye"><span class="mine">${ic(TURN[turnOf(d)].icon, 14)}${d.kind === 'budget_continue' ? '계속할까요' : turnOf(d) === 'check' ? kindName(d) : TURN[turnOf(d)].label}${extra ? ` · ${extra}` : ''}</span>${turnOf(d) !== 'out' && html`<${RiskWord} d=${d} />`}</p>`;

/** 고쳐 주세요 — 고칠 내용 + 이번만 / 앞으로도(접어 둠) */
function FixBox({ id, pending, unit = '문단', onCancel }) {
  const [text, setText] = useState('');
  const [scope, setScope] = useState('once');
  const send = () => act(() => api('POST', `/api/decisions/${id}`, { action: 'reject', comment: text.trim(), scope }), scope === 'always' ? '고칠 점을 보냈어요 — 앞으로도 지킬 규칙으로 저장' : '고칠 점을 보냈어요');
  return html`<div class="bs-fix">
    <textarea class="in line" rows="2" value=${text} onInput=${(e) => setText(e.target.value)} placeholder=${pending ? `${unit} 코멘트 ${pending}개와 함께 보낼 말(선택)` : '무엇을 고칠까요? 예: 가격을 4,500원으로'}></textarea>
    <details class="bs-fold"><summary>${scope === 'always' ? '앞으로도 지킬 규칙으로 저장' : '이번만 고쳐요'}<small>바꾸기</small></summary>
      <label class="bs-opt"><input type="radio" name=${`sc-${id}`} checked=${scope === 'once'} onChange=${() => setScope('once')} />이번만 — 이 결과물만 고쳐요</label>
      <label class="bs-opt"><input type="radio" name=${`sc-${id}`} checked=${scope === 'always'} onChange=${() => setScope('always')} />앞으로도 — 담당 직원의 배운 것으로 저장돼요</label></details>
    <div class="bs-acts"><button class="btn pri" disabled=${!text.trim() && !pending} onClick=${send}>보내기</button><button class="btn quiet" onClick=${onCancel}>취소</button></div>
  </div>`;
}

/** 문단(칸 · 항목) 코멘트 */
function CommentBox({ id, pick, unit, onDone }) {
  const [text, setText] = useState('');
  const add = async () => { if (!text.trim()) return; await act(() => api('POST', `/api/decisions/${id}/comments`, { anchor: pick.i, quote: pick.quote, text })); onDone(); };
  return html`<div class="bs-fix"><p class="bs-why">${pick.label ?? `${unit} ${pick.i + 1}`}에 코멘트 · “${pick.quote}”</p>
    <textarea class="in line" rows="2" value=${text} onInput=${(e) => setText(e.target.value)} placeholder=${`이 ${unit}에서 고칠 점`}></textarea>
    <div class="bs-acts"><button class="btn pri sm" onClick=${add}>코멘트 달기</button><button class="btn quiet sm" onClick=${onDone}>취소</button></div></div>`;
}

/** ① 원문 확인 → ② 승인(계약 3) — 단계 표시 + 받는 곳 · 링크 */
function Steps({ seen }) {
  return html`<div class="bs-steps"><b class=${seen ? 'done' : 'on'}>${seen ? ic('check', 14) : '1'} 원문 확인</b><i></i><b class=${seen ? 'on' : ''}>2 승인</b></div>`;
}
function GateLines({ a, to, seen }) {
  const links = [...new Set(String(a?.body ?? '').match(/https?:\/\/[^\s)>\]"']+/g) ?? [])];
  return html`<ul class="bs-gate">
    <li><b>받는 곳</b><span>${to}</span></li>
    <li><b>링크 ${links.length}개</b><span>${links.length ? links.slice(0, 5).map((l) => html`<a class="src" href=${l} target="_blank" rel="noopener noreferrer">${l}</a>`) : '글 안에 링크가 없어요'}</span></li>
    <li><b>원문</b><span>${seen ? `${when(seen)}에 확인했어요 — 이제 승인할 수 있어요` : `위 글이 실제로 나갈 모습이에요${a ? ` (v${a.version})` : ''}. ${RISK.external.how}`}</span></li></ul>`;
}

/** 결재함 Lv2(결정 80) — 밖으로 나갈 것을 차례로. 한꺼번에 승인은 없다 */
function ExtQueue({ state, queue, id, onNav }) {
  if (queue.length < 2) return null;
  // 결재함 Lv1 — 잠금 상자 대신 한 줄(올리기는 3D 결재함 시설에서)
  if (!hasFac(state, 'decisions')) return html`<p class="bs-queue"><b>밖으로 남은 ${queue.length}건</b><span>하나씩 원문 확인 → 승인해요. 결재함 레벨 2면 승인 뒤 다음 것으로 바로 넘어가요.</span></p>`;
  const i = queue.indexOf(id);
  return html`<p class="bs-queue"><b>밖으로 남은 ${queue.length}건 중 ${i + 1}번째</b><span>원문 확인 → 승인하면 다음 것으로 넘어가요</span>
    <span class="sp"></span><button class="btn sm quiet" disabled=${i <= 0} onClick=${() => onNav(queue[i - 1])}>‹ 앞</button><button class="btn sm quiet" disabled=${i < 0 || i >= queue.length - 1} onClick=${() => onNav(queue[i + 1])}>다음 ›</button></p>`;
}
const afterExt = (state, queue, id, onNav) => (r) => {
  const rest = queue.filter((x) => x !== id);
  if (r && hasFac(state, 'decisions') && rest.length) onNav(rest[Math.min(Math.max(queue.indexOf(id), 0), rest.length - 1)]);
  return r;
};

/** 접힌 줄 — 만든 사람 · 적용된 배운 것 · 출처 · 검수 메모 · 게시 기록 */
function More({ d, sources = true }) {
  const rows = [d.chain.length && '만든 사람', d.rules.length && '적용된 배운 것', sources && d.evidence.sources.length && '출처', d.review && '검수 메모', d.actions?.length && '게시 기록'].filter(Boolean);
  if (!rows.length) return null;
  return html`<details class="bs-fold"><summary>${rows.join(' · ')}</summary><div class="bs-more">
    ${d.chain.length > 0 && html`<h4>만든 사람</h4>${d.chain.map((c) => html`<p>${c.name} <span class="muted">${c.role}</span> — ${c.title} v${c.version}</p>`)}`}
    ${d.rules.length > 0 && html`<h4>적용된 배운 것</h4>${d.rules.map((r) => html`<p>· ${r.text}</p>`)}`}
    ${sources && d.evidence.sources.length > 0 && html`<h4>출처</h4>${d.evidence.sources.slice(0, 6).map((s) => html`<a class="src" href=${s} target="_blank" rel="noopener noreferrer">${s}</a>`)}`}
    ${d.review && html`<h4>검수 메모${d.review.issues.length ? ` · ${d.review.issues.length}건` : ''}</h4>${d.review.issues.map((x) => html`<p>${x.severity === 'warn' ? ic('alert', 14) : '·'} ${x.item}: ${x.text}</p>`)}<${Markdown} src=${d.review.body} />`}
    ${d.actions?.length > 0 && html`<h4>게시 기록</h4>${d.actions.map((x) => html`<p><span class=${`pill bare st-${x.status}`}>${PUB_ST[x.status] ?? x.status}</span> ${x.label} ${when(x.scheduledAt)} ${x.note ?? ''}</p>`)}`}
  </div></details>`;
}

/** 질문(계약 2) — 직원이 짐작하지 않고 대표에게 묻는다. 답하기 = 승인 + 답 글 */
function QuestionBody({ d, id, state }) {
  const [ans, setAns] = useState('');
  const p = d.payload ?? {};
  const from = state.employees.find((e) => e.id === p.from);
  if (d.status !== 'open') return html`<${Sec}><${Was}>답했어요${d.comment ? ` — ${d.comment}` : ''}</${Was}></${Sec}>`;
  return html`<${Sec}>
    <${Eyebrow} d=${d} />
    <h3 class="bs-q">${p.question ?? d.title}</h3>
    <p class="bs-why">${from && html`<${Portrait} look=${from.look} size=${22} role=${from.role} rank=${from.rank} />`}${from ? `${josa(from.name, '이', '가')} 짐작하지 않고 대표님께 물어요` : '짐작하지 않고 대표님께 물어요'}. 답하면 바로 이어서 해요 — 업무 하나에 되묻기는 두 번까지예요.</p>
    ${d.title && !d.title.includes(p.question ?? '') && html`<p class="bs-why">업무: ${d.title}</p>`}
    <textarea class="in line" rows="2" value=${ans} onInput=${(e) => setAns(e.target.value)} placeholder="예: 가격은 4,500원으로 잡아 주세요"></textarea>
    <div class="bs-acts"><button class="btn decide" disabled=${!ans.trim()} onClick=${() => act(() => api('POST', `/api/decisions/${id}`, { action: 'approve', comment: ans.trim() }), '답을 보냈어요 — 이어서 해요')}>답하기</button></div>
  </${Sec}>`;
}

/** 계속할까요(계약 6) — 한도에 닿아 잠든 업무. 늘리는 건 이번 주만 */
function BudgetBody({ d, id }) {
  const p = d.payload ?? {};
  if (d.status !== 'open') return html`<${Sec}><${Was}>${d.status === 'approved' ? `이번 주만 +${usd(p.raiseUsd)} 늘렸어요` : '그대로 두기로 했어요'}</${Was}></${Sec}>`;
  return html`<${Sec}>
    <${Eyebrow} d=${d} />
    <h3 class="bs-q">${{ task: '업무 한 건', employee: '직원 한 명의 이번 주', office: '사무실 전체의 이번 주' }[p.scope] ?? '사용'} 한도에 닿아 쉬고 있어요. +${usd(p.raiseUsd)} 더 쓰고 계속할까요?</h3>
    <p class="bs-why">${d.title}</p>
    <div class="bs-meter"><b>${usd(p.used)}</b><span class="muted">/ 한도 ${usd(p.cap)} · ${scopeLabel(p.scope)}</span><${Meter} used=${p.used} cap=${p.cap} /></div>
    <p class="bs-why">${ic('hourglass', 14)} <b>이번 주만</b> 늘어요 — 다음 주에는 원래 한도(${usd(p.cap)})로 돌아가요. 그대로 두면 이번 주 일이 끝날 때 취소로 정리돼요. 한도 자체는 <a href="#/settings/power">설정 › AI 연결 · 사용 한도</a>에서 바꿔요.</p>
    <div class="bs-acts"><button class="btn decide" onClick=${() => act(() => api('POST', `/api/decisions/${id}`, { action: 'approve' }), `이번 주만 ${usd(p.raiseUsd)} 늘렸어요 — 다시 대기로`)}>+${usd(p.raiseUsd)} · 이번 주만 계속</button>
      <button class="btn" onClick=${() => act(() => api('POST', `/api/decisions/${id}`, { action: 'reject' }), '그대로 쉬게 둬요')}>그대로 두기</button></div>
  </${Sec}>`;
}

/** 사무실 레벨 올리기 제안 */
function MoveBody({ d, id }) {
  const p = d.payload, cap = p.roomCap ?? {};
  if (d.status !== 'open') return html`<${Sec}><${Was}>${d.status === 'approved' ? '레벨을 올렸어요' : '이번에는 그대로 있기로 했어요'}</${Was}></${Sec}>`;
  return html`<${Sec}>
    <${Eyebrow} d=${d} extra=${p.by ?? ''} />
    <h3 class="bs-q">사무실 레벨 ${p.from} → 레벨 ${p.to}</h3>
    <p class="bs-why">지금 레벨 ${p.from} ${p.fromName}의 자리가 모자라요(직원 ${p.headcount}명).${p.hasSpace ? ` 레벨이 오르면 정원이 ${p.capacity}명, 지을 수 있는 방이 ${cap.from ?? '?'}개에서 ${cap.to ?? '?'}개로 늘어요.` : ` 레벨이 오르면 ${p.toName}(${p.place})로 넓어지고 정원이 ${p.capacity}명이 돼요.`}</p>
    <ul class="bs-gate">${(p.conditions ?? []).map((c) => html`<li><b>${c.met ? ic('check', 14) : '·'} ${c.label}</b><span>${c.progress}/${c.goal}</span></li>`)}</ul>
    <p class="bs-why">모두 실제 기록이에요. 레벨은 내려가지 않고, 지금 미루면 다음 주 일을 마친 뒤에 다시 제안해요.</p>
    <div class="bs-acts"><button class="btn decide" onClick=${() => act(() => api('POST', `/api/decisions/${id}`, { action: 'approve' }), `사무실이 레벨 ${p.to}로 올랐어요`)}>레벨 올리기</button>
      <button class="btn" onClick=${() => act(() => api('POST', `/api/decisions/${id}`, { action: 'reject' }), '지금 레벨에 그대로 있어요')}>지금은 그대로</button></div>
  </${Sec}>`;
}

/** 그 밖의 확인(재연결 · 배운 것 확정 등) */
function OtherBody({ d, id }) {
  if (d.status !== 'open') return html`<${Resolved} d=${d} approved="확인했어요" />`;
  return html`<${Sec}>
    <${Eyebrow} d=${d} extra=${d.kind === 'reconnect' ? '재연결 필요' : ''} />
    <h3 class="bs-q">${d.title}</h3>
    ${d.payload.reason && html`<p class="bs-why">${d.payload.reason}</p>`}
    ${d.kind === 'reconnect' && html`<p class="bs-why">영향받는 예약 · 실패 ${d.payload.affected ?? 0}건. 연결을 마쳐도 게시 승인으로 보지 않아요 — 실패했던 게시는 같은 승인 버전으로 다시 시도해요.</p>`}
    <div class="bs-acts"><button class="btn decide" onClick=${() => act(() => api('POST', `/api/decisions/${id}`, { action: 'approve' }), '확인했어요')}>${d.kind === 'reconnect' ? '연결했어요 · 다시 시도' : '확인'}</button>
      ${d.kind === 'reconnect' && html`<a class="btn" href="#/settings/keys">설정에서 연결하기</a>`}</div>
  </${Sec}>`;
}

/** 결과물 확인(결정 73) — 읽고 확정 / 고쳐 주세요(이번만 · 앞으로도) / 보류. 밖으로 등급이면 ① 원문 확인 → ② 확정 */
function ConfirmBody({ d, id, state, queue, onNav }) {
  const [pick, setPick] = useState(null);
  const [fixing, setFixing] = useState(false);
  const [seenAt, setSeenAt] = useState(null);
  const open = d.status === 'open';
  const a = d.artifactFull, p = d.payload;
  const external = riskOf(d) === 'external', seen = seenAt ?? previewedAt(d);
  const markSeen = () => act(() => api('POST', `/api/decisions/${id}/preview`), '원문을 확인했어요 — 이제 승인할 수 있어요').then((r) => r && setSeenAt(r.previewedAt ?? new Date().toISOString()));
  const handoff = a?.meta?.handoff;
  const pending = d.comments.filter((c) => !c.sent_at).length;
  const expert = a?.meta?.expertCheck ?? [];
  const assumptions = a?.meta?.assumptions ?? [];
  const shape = docShape(a);
  const unit = { table: '칸', checklist: '항목', doc: '문단' }[shape];
  return html`
    ${!open && html`<${Resolved} d=${d} approved=${p.plan ? '계획을 확정했어요 — 다음 주부터 이대로 일해요' : '확정했어요'} />`}
    <${Sec}>
      ${external && open && html`<${ExtQueue} state=${state} queue=${queue} id=${id} onNav=${onNav} />`}
      <${Eyebrow} d=${d} extra=${p.blockName && p.blockName !== a?.title ? p.blockName : ''} />
      ${external && open && html`<${Steps} seen=${seen} />`}
      ${p.reason && html`<p class="bs-why">${p.reason}</p>`}
      ${p.plan && open && html`<p class="bs-why"><b>확정하면</b> 다음 주부터 이 계획의 1주차 일로 일해요.</p>`}
      ${shape === 'checklist' && open && html`<p class="bs-why"><b>확정하면</b> 대표 항목이 확인할 것 › 내 할 일에 들어가요.</p>`}
      ${expert.length > 0 && html`<p class="bs-warn">${ic('alert', 14)} 전문가 확인 필요 — ${expert.join(' · ')} <small>AI가 지어내지 않도록 내용 대신 확인할 곳만 적었어요.</small></p>`}
      <${DocPreview} artifact=${a} author=${d.authorName} comments=${d.comments} active=${pick?.i} onPick=${open ? (i, quote, label) => setPick({ i, quote, label }) : null} />
      ${open && !pick && html`<p class="bs-hint">${unit}을 누르면 그 자리에 코멘트를 달 수 있어요.</p>`}
      ${open && pick && html`<${CommentBox} id=${id} pick=${pick} unit=${unit} onDone=${() => setPick(null)} />`}
      ${external && html`<${GateLines} a=${a} to=${p.target ?? '외부 저장'} seen=${seen} />`}
      <${ExternalNote} artifact=${a} />
      ${open && (fixing ? html`<${FixBox} id=${id} pending=${pending} unit=${unit} onCancel=${() => setFixing(false)} />`
        : html`<div class="bs-acts main">
          ${external && !seen ? html`<button class="btn decide" onClick=${markSeen} title="원문 · 받는 곳 · 링크를 확인했다고 기록해요">원문 그대로 확인했어요</button>`
            : html`<button class="btn decide" onClick=${() => act(() => api('POST', `/api/decisions/${id}`, { action: 'approve' }), p.plan ? '계획을 확정했어요 — 다음 주부터 이대로 일해요' : '확정했어요').then(external ? afterExt(state, queue, id, onNav) : (r) => r)}>${p.plan ? '이 계획으로 확정' : external ? '승인 · 확정' : '확정'}</button>`}
          <button class="btn" onClick=${() => setFixing(true)}>고쳐 주세요${pending ? ` · 코멘트 ${pending}` : ''}</button>
          <button class="btn quiet" onClick=${() => act(() => api('POST', `/api/decisions/${id}`, { action: 'dismiss', comment: '보류 — 이번에는 쓰지 않아요' }), '보류했어요')}>보류</button></div>`)}
      <${HandoffMemo} h=${handoff} who=${d.authorName} title="인계 메모" open=${false} />
      ${!handoff && assumptions.length > 0 && html`<details class="bs-fold"><summary>아직 가정인 것 ${assumptions.length}</summary><div class="bs-more">${assumptions.map((x) => html`<p>· ${x}</p>`)}</div></details>`}
      <${More} d=${d} />
    </${Sec}>`;
}

/** 게시 확인(밖으로) — ① 원문 확인 → ② 승인(연습 게시가 기본). 문단 코멘트 · 시각 · 경고 */
function PublishBody({ d, id, state, queue, onNav }) {
  const [pick, setPick] = useState(null);
  const [fixing, setFixing] = useState(false);
  const [time, setTime] = useState('');
  const [seenAt, setSeenAt] = useState(null);
  const open = d.status === 'open';
  const a = d.artifactFull, platform = d.payload.platform, warnings = d.payload.warnings ?? [];
  const pending = d.comments.filter((c) => !c.sent_at).length;
  // 버튼 문구가 실제 결과를 말한다 — 연습 게시면 기록만 남는다
  const kinds = warnKinds(d.payload);
  const dry = kinds.includes('dry_run');
  const approveLabel = dry ? '승인 — 연습 게시(기록만)' : kinds.includes('no_thumbnail') ? '썸네일 없이 승인' : kinds.includes('no_connection') ? '승인(연결 후 게시)' : '승인';
  const scheduledAt = time ? new Date(time).toISOString() : d.payload.scheduledAt;
  const seen = seenAt ?? previewedAt(d);
  const markSeen = () => act(() => api('POST', `/api/decisions/${id}/preview`), '원문을 확인했어요 — 이제 승인할 수 있어요').then((r) => r && setSeenAt(r.previewedAt ?? new Date().toISOString()));
  // 받는 곳 — 플랫폼과 대상 앱이 같으면(Threads → Threads) 한 번만 쓴다
  const where = platformLabel(platform), app = APP[d.payload.target] ?? d.payload.target ?? '대상 미연결';
  const to = app === where ? where : `${where} → ${app}`;
  return html`
    ${!open && html`<${Resolved} d=${d} approved=${dry ? '승인했어요 — 연습 게시로 기록만 남아요(실제로 나가지 않음)' : '승인했어요 — 예약됐어요'} />`}
    <${Sec}>
      ${open && html`<${ExtQueue} state=${state} queue=${queue} id=${id} onNav=${onNav} />`}
      <${Eyebrow} d=${d} extra=${to} />
      ${open && html`<${Steps} seen=${seen} />`}
      ${d.payload.changed && html`<p class="bs-warn">${ic('alert', 14)} 승인한 뒤 내용이 바뀌었어요 — 다시 확인해 주세요</p>`}
      <${PlatformPreview} platform=${platform} artifact=${a} media=${d.media} office=${state.office?.name} author=${d.authorName} comments=${d.comments} active=${pick?.i}
        onPick=${open ? (i, quote) => setPick({ i, quote }) : null} />
      ${open && pick && html`<${CommentBox} id=${id} pick=${pick} unit="문단" onDone=${() => setPick(null)} />`}
      <${GateLines} a=${a} to=${to} seen=${seen} />
      <label class="bs-time"><b>게시 시각</b><input class="in line" type="datetime-local" disabled=${!open} value=${time || toLocalInput(d.payload.scheduledAt)} onInput=${(e) => setTime(e.target.value)}/><small>승인 뒤 내용 · 대상 · 시각이 바뀌면 다시 확인받아요.</small></label>
      ${warnings.map((w) => html`<p class="bs-warn">${ic('alert', 14)} ${w}</p>`)}
      <${ExternalNote} artifact=${a} />
      ${open && (fixing ? html`<${FixBox} id=${id} pending=${pending} onCancel=${() => setFixing(false)} />`
        : html`<div class="bs-acts main">
          ${!seen ? html`<button class="btn decide" onClick=${markSeen} title="원문 · 받는 곳 · 링크를 확인했다고 기록해요">원문 그대로 확인했어요</button>`
            : html`<button class="btn decide" onClick=${() => act(() => api('POST', `/api/decisions/${id}`, { action: 'approve', scheduledAt }), dry ? '승인했어요 — 연습 게시로 기록만 남아요' : '승인했어요 — 예약됐어요').then(afterExt(state, queue, id, onNav))}>${approveLabel}</button>`}
          <button class="btn" onClick=${() => setFixing(true)}>고쳐 주세요${pending ? ` · 코멘트 ${pending}` : ''}</button>
          <button class="btn quiet" onClick=${() => act(() => api('POST', `/api/decisions/${id}`, { action: 'dismiss', comment: '이번에는 게시하지 않음' }), '이번에는 게시하지 않아요')}>게시 안 함</button></div>`)}
      <${HandoffMemo} h=${a?.meta?.handoff} who=${d.authorName} title="인계 메모" open=${false} />
      <${More} d=${d} />
    </${Sec}>`;
}

/** 결정 하나 — 종류에 맞는 몸통. queue = 남은 밖으로 결정 id(결재함 Lv2), onNav = 다른 결정으로 */
export function DecisionBody({ id, state, queue = [], onNav = () => {} }) {
  const d = useApi(`/api/decisions/${id}`).data;
  if (!d || d.id !== id) return html`<${Sec}><p class="muted">불러오는 중…</p></${Sec}>`;
  if (d.kind === 'office_move') return html`<${MoveBody} d=${d} id=${id} />`;
  if (d.kind === 'artifact_confirm') return html`<${ConfirmBody} d=${d} id=${id} state=${state} queue=${queue} onNav=${onNav} />`;
  if (d.kind === 'owner_question') return html`<${QuestionBody} d=${d} id=${id} state=${state} />`;
  if (d.kind === 'budget_continue') return html`<${BudgetBody} d=${d} id=${id} />`;
  if (d.kind === 'publish_confirm') return html`<${PublishBody} d=${d} id=${id} state=${state} queue=${queue} onNav=${onNav} />`;
  return html`<${OtherBody} d=${d} id=${id} />`;
}

/** 대표 몫 시트 — 머리는 그 일을 든 직원, 몸통은 결정 하나, 아래에 '다음' 한 줄. 사무실 말풍선 · 확인할 것 줄이 같이 쓴다 */
export function DecisionSheet({ id, state, list = [], onPick, onClose, scrim = false, onPerson }) {
  const all = useApi('/api/decisions').data;
  const cur = all?.open.find((x) => x.id === id) ?? all?.recent.find((x) => x.id === id);
  const who = cur ? ownerOf(cur, state.employees) : null;
  const queue = (all?.open ?? []).filter((x) => riskOf(x) === 'external').map((x) => x.id);
  const next = list.find((x) => x.id !== id);
  return html`<${BottomSheet} title=${who?.name ?? '대표님 확인'} sub=${who ? roleFull(who.role) : ''} onClose=${onClose} scrim=${scrim} cls="dec">
    <${DecisionBody} key=${id} id=${id} state=${state} queue=${queue} onNav=${onPick} />
    ${next ? html`<button class="bs-next" onClick=${() => onPick(next.id)}><span>다음</span><b>${TURN[turnOf(next)].label} · ${next.artifact?.title ?? next.payload?.question ?? next.title}</b>${ic('share', 14)}</button>`
      : all && !all.open.some((x) => x.id !== id) && html`<p class="bs-next end">대표님이 볼 것은 이게 마지막이에요.</p>`}
    ${who && onPerson && html`<button class="bs-link" onClick=${() => onPerson(who.id)}>${josa(who.name, '에게', '에게')} 말 걸기 · 지금 하는 일 보기</button>`}
  </${BottomSheet}>`;
}

/** 확인할 것 줄 하나 — 등급 표시 · 제목 · 누가 · 짧은 설명 */
function Row({ d, state }) {
  const p = d.payload ?? {}, who = ownerOf(d, state.employees);
  const sub = d.kind === 'budget_continue' ? `${usd(p.used)} / ${usd(p.cap)} · +${usd(p.raiseUsd)} 이번 주만`
    : p.platform ? `${platformLabel(p.platform)} · ${when(p.scheduledAt)}` : p.blockName ?? '';
  const warn = [...new Set(warnKinds(p).map((k) => WARN_TAG[k] ?? '확인'))];
  const ext = riskOf(d) === 'external';
  const extra = [sub, p.changed && '변경됨', (d.artifact?.version ?? 1) > 1 && d.kind === 'artifact_confirm' && `수정본 v${d.artifact.version}`, ext && (previewedAt(d) ? '원문 확인함' : '원문 확인 전'), ...warn].filter(Boolean);
  return html`<li><a class="ln-row" href=${`#/decisions/${d.id}`}>
    <${RiskWord} d=${d} />
    <span class="ln-t"><b>${d.kind === 'owner_question' ? p.question ?? d.title : d.artifact?.title ?? d.title}</b><small>${[who?.name, kindName(d), ...extra].filter(Boolean).join(' · ')}</small></span>
    <span class="ln-go" aria-hidden="true">${ic('share', 16)}</span></a></li>`;
}

/** 확인할 것(결정 87) — 질문 → 확인 → 밖으로, 그 아래 내 할 일 · 최근 처리. 줄을 누르면 아래 시트 */
export function Decisions({ state, id }) {
  const data = useApi('/api/decisions').data;
  const todosAt = id === 'todos';
  if (todosAt) id = null;
  useEffect(() => { if (todosAt) setTimeout(() => document.getElementById('todos')?.scrollIntoView({ block: 'start' }), 200); }, [todosAt, !!data]);
  const open = byTurn(data?.open ?? []);
  const n = (t) => open.filter((d) => turnOf(d) === t).length;
  const counts = TURN_ORDER.filter((t) => n(t)).map((t) => `${TURN[t].label} ${n(t)}`).join(' · ');
  return html`<div class="page flat inbox">
    <div class="pg-title"><h1>확인할 것</h1>
      <p>${!data ? '불러오는 중…' : open.length ? html`대표님 차례가 <b class="mine">${open.length}개</b>예요 — ${counts}.${n('out') ? ' 밖으로 나가는 글은 원문을 보고 하나씩 승인해요.' : ''}` : '지금은 볼 것이 없어요. 팀이 이어서 일하는 중이에요.'}</p></div>
    ${TURN_ORDER.map((t) => {
      const items = open.filter((d) => turnOf(d) === t);
      if (!items.length) return null;
      // 사무실 안 확인은 주마다 한 번에 확정(결정 80) — 밖으로 · 방향은 들어가지 않는다
      const cycles = t === 'check' ? [...items.filter(batchable).reduce((m, d) => m.set(d.cycleLabel ?? '이번 주 일 밖', [...(m.get(d.cycleLabel ?? '이번 주 일 밖') ?? []), d]), new Map())].filter(([, ds]) => ds.length > 1) : [];
      return html`<section class="ln-sec"><h2 class="ln-h">${ic(TURN[t].icon, 16)}${TURN[t].label}<span class="n">${items.length}</span><span class="sp"></span>
        ${cycles.map(([label, ds]) => html`<button class="btn sm" title="사무실 안 확인만 한 번에 확정해요. 밖으로 · 방향 결정은 들어가지 않아요." onClick=${() => act(() => api('POST', '/api/decisions/batch', { action: 'approve', ids: ds.map((d) => d.id) }), `${label} 사무실 안 ${ds.length}건을 확정했어요`)}>${label} 사무실 안 ${ds.length}개 한 번에 확정</button>`)}</h2>
        ${t === 'out' && html`<p class="ln-hint">${RISK.external.hint}. 원문 확인 → 승인 두 단계예요.</p>`}
        <ul class="ln-list">${items.map((d) => html`<${Row} d=${d} state=${state} />`)}</ul></section>`;
    })}
    <section class="ln-sec" id="todos"><h2 class="ln-h">${ic('check', 16)}내 할 일<span class="n">${state.counts.todos || ''}</span></h2><${Todos} /></section>
    ${(data?.recent ?? []).length > 0 && html`<details class="ln-sec ln-fold"><summary><h2 class="ln-h">최근 처리<span class="n">${data.recent.length}</span></h2></summary>
      <ul class="ln-list">${data.recent.map((d) => html`<li><a class="ln-row" href=${`#/decisions/${d.id}`}><${RiskWord} d=${d} /><span class="ln-t"><b>${d.artifact?.title ?? d.title}</b>
        <small>${{ approved: d.kind === 'owner_question' ? '답함' : '승인', rejected: '고쳐 달라고 함', stale: '새 버전으로 바뀜' }[d.status] ?? d.status}${d.comment ? ` · ${d.comment}` : ''}</small></span></a></li>`)}</ul></details>`}
    ${id && html`<${DecisionSheet} id=${id} state=${state} list=${open} scrim onPick=${(x) => go(`decisions/${x}`)} onClose=${() => go('decisions')} />`}
  </div>`;
}
