// 문서(결정 87, 견본 D 결) — 이번 주 일(같은 일은 한 줄로 한 번만) + 문서함 + 캘린더를 한 화면에 선 · 여백 목록으로.
// 숫자 카드 대신 문장 한 줄. 줄을 누르면 그 자리에서 펼치고, 결과물 · 업무 · 문서는 아래 시트로 연다. 대표 차례는 확인할 것과 같은 시트(DecisionSheet)
import { Markdown, act, api, html, kindLabel, meta, mins, stWord, useApi, useEffect, useState, when } from '../lib.js';
import { download, hasFac } from '../facility.js';
import { DocPreview } from '../preview.js';
import { Calendar } from './calendar.js';
import { DecisionSheet } from './decisions.js';
import { ExternalNote, HandoffMemo, RunLog } from '../agentops.js';
import { BottomSheet, Sec, StWord } from '../sheet.js';
import { ic } from '../icons.js';

const STAGES = [['research', '조사', ['research']], ['plan', '기획', ['plan']], ['write', '작성', ['blog_draft', 'newsletter', 'sns_draft']], ['image', '이미지', ['image_brief']], ['review', '검수', ['review']], ['confirm', '대표 확인', []], ['publish', '게시', []]];
const ACTION = { scheduled: '예약됨', succeeded: '게시됨', dry_run: '연습 게시', unknown: '확인 필요', failed: '실패', running: '실행 중', cancelled: '취소', pending: '대기', blocked: '멈춤 · 승인 뒤 바뀜' };
/** 블록 상태 → 여섯 낱말(waiting · skipped = 시작 전, quota · asleep = 멈춤, me · asked = 대표 확인) */
export const BLOCK_STATE = Object.fromEntries(['waiting', 'active', 'issue', 'quota', 'done', 'skipped', 'me', 'asked', 'asleep'].map((k) => [k, stWord(k)]));
/** 문서 상태 → 여섯 낱말(확인 대기 = 대표 확인 · 고치는 중 = 일하는 중 · 확정 / 확인 없음 = 끝) */
const DOC_ST = { waiting: 'me', revising: 'working', confirmed: 'done', draft: 'done' };
/** 업무 종류 → 블록(`블록.단계`가 아니면 콘텐츠 운영) */
const blockOf = (kind) => (kind?.includes('.') ? kind.split('.')[0] : 'content_ops');
/** 직원 id → 이름(작업 기록 줄에) */
const nameMap = (state) => Object.fromEntries((state?.employees ?? []).map((e) => [e.id, e.name]));

/** 결과물 상세 — 저장 · 게시 기록, 만든 과정, 인계 메모, 출처, 본문, 작업 기록 */
function Detail({ id, onClose, state }) {
  const a = useApi(`/api/artifacts/${id}`).data;
  if (!a) return html`<${BottomSheet} title="불러오는 중…" onClose=${onClose} scrim />`;
  const actions = a.actions ?? [];
  return html`<${BottomSheet} title=${a.title} sub=${`${kindLabel(a.kind)} · v${a.version}${a.authorName ? ` · ${a.authorName}` : ''}`} onClose=${onClose} scrim>
    <${Sec}>
      ${actions.filter((x) => x.status === 'unknown' || x.status === 'failed').map((x) => html`<p class="bs-warn">${ic('alert', 14)} ${x.note}</p>`)}
      <h4 class="bs-h4">저장 위치 · 게시 대상</h4>
      ${actions.length ? html`<ul class="bs-gate">${actions.map((x) => html`<li><b><${StWord} st=${x.status} word=${ACTION[x.status] ?? x.status} /></b>
        <span>${x.kind === 'save' ? '저장' : '게시'} · ${x.target ?? x.app}${x.scheduledAt ? ` · ${when(x.scheduledAt)}` : ''}
        ${x.resultUrl && html` <a href=${x.resultUrl} target="_blank" rel="noopener noreferrer">열기 ${ic('share', 12)}</a>`}
        ${x.status === 'unknown' && html`<span class="bs-acts"><button class="btn sm" onClick=${() => act(() => api('POST', `/api/actions/${x.id}/resolve`, { outcome: 'published', url: null }), '게시됨으로 표시했어요')}>외부에서 확인 · 게시됨</button>
          <button class="btn sm" onClick=${() => act(() => api('POST', `/api/actions/${x.id}/resolve`, { outcome: 'not_published' }), '게시 안 됨으로 표시했어요')}>게시 안 됨</button></span>`}
        ${x.status === 'failed' && html`<span class="bs-acts"><button class="btn sm" onClick=${() => act(() => api('POST', `/api/actions/${x.id}/retry`), '같은 승인 버전으로 다시 시도해요')}>같은 버전으로 다시 시도</button></span>`}
        ${x.status === 'scheduled' && html`<span class="bs-acts"><button class="btn sm" onClick=${() => act(() => api('POST', `/api/actions/${x.id}/review-again`), '예약을 취소하고 다시 검토해요')}>예약 취소 · 다시 검토</button></span>`}</span></li>`)}</ul>`
        : html`<p class="bs-why">아직 저장 · 게시 기록이 없어요. ${a.meta?.platform ? '검수 뒤 확인할 것에서 승인하면 예약돼요.' : '저장 연결(Notion · Docs)이 있으면 자동으로 저장돼요.'}</p>`}
      <${ExternalNote} artifact=${a} />
      <${HandoffMemo} h=${a.meta?.handoff} who=${a.authorName} title="인계 메모" open=${false} />
      <details class="bs-fold"><summary>만든 과정 · 버전 ${(a.versions ?? []).length}${a.sources?.length ? ` · 출처 ${a.sources.length}` : ''}</summary><div class="bs-more">
        ${(a.versions ?? []).map((v) => html`<p>v${v.version} · ${when(v.created_at)}${v.id === a.id ? ' (지금 보는 버전)' : ''}</p>`)}
        ${a.sources?.length > 0 && html`<h4>출처</h4>${a.sources.map((s) => html`<a class="src" href=${s} target="_blank" rel="noopener noreferrer">${s}</a>`)}`}</div></details>
    </${Sec}>
    <${Sec}><${Markdown} src=${a.body} /></${Sec}>
    <${Sec}><${RunLog} taskId=${a.taskId} names=${nameMap(state)} /></${Sec}>
  </${BottomSheet}>`;
}

/** 되묻는 중 · 잠듦은 이유를 글로 — 색만으로 알리지 않는다 */
const askLine = (t) => (t.status === 'asked' && t.meta?.ask?.question ? `${t.meta.ask.to === 'owner' ? '대표에게' : '앞 직원에게'}: ${t.meta.ask.question}` : t.status === 'asleep' ? '사용 한도에 닿았어요 — 확인할 것에서 계속할지 정해요' : null);

/** 업무 상세 — 결과물이 아직 없는 업무(되묻는 중 · 잠듦 · 대기)도 연다. 되묻기 · 작업 기록 */
function TaskDrawer({ t, state, onClose }) {
  const ask = t.meta?.ask;
  const to = ask?.to === 'owner' ? '대표' : state.employees.find((e) => e.id === ask?.toEmployeeId)?.name ?? '앞 직원';
  return html`<${BottomSheet} title=${t.title} sub=${`업무 · ${kindLabel(t.kind)} · ${t.assigneeName}`} onClose=${onClose} scrim>
    <${Sec}>
      <p class="bs-eye"><${StWord} st=${t.status} word=${stWord(t.status, t.statusLabel)} title=${t.statusDetail ?? t.statusLabel} />${t.waitReason && html`<span class="muted">${t.waitReason}</span>`}</p>
      ${ask && html`<h4 class="bs-h4">${ic('question', 14)} 되묻기 <span class="muted">${ask.count ?? 1}/2번째 · ${t.assigneeName} → ${to} · ${when(ask.askedAt)}</span></h4>
        <blockquote class="bs-quote">${ask.question}</blockquote>
        ${ask.answer ? html`<p class="bs-why"><b>답</b> ${ask.answer} <span class="muted">${when(ask.answeredAt)}</span></p>` : html`<p class="bs-why">답을 기다려요. ${ask.to === 'owner' ? html`<a href="#/decisions">확인할 것에서 답하기 →</a>` : `${to}에게 짧은 '답하기' 업무가 생겼어요.`}</p>`}`}
      ${t.status === 'asleep' && html`<p class="bs-warn">${ic('moon', 14)} 사용 한도에 닿아 쉬고 있어요. 계속 돌지 않아요 — <a href="#/decisions">확인할 것에서 '계속할까요?'</a>를 정해 주세요.</p>`}
    </${Sec}>
    <${Sec}><${RunLog} taskId=${t.id} names=${nameMap(state)} /></${Sec}>
  </${BottomSheet}>`;
}

/** 문서 상세 — 모양 그대로 보기 · 버전 · 확인 기록 · 내려받기. 내 할 일에서는 결과물 id로 연다 */
export function DocDrawer({ itemId, artifactId, onClose, onDecision }) {
  const viaArt = useApi(!itemId && artifactId ? `/api/artifacts/${artifactId}` : null).data;
  const id = itemId ?? viaArt?.itemId;
  const d = useApi(id ? `/api/documents/${encodeURIComponent(id)}` : null).data;
  if (!d) return html`<${BottomSheet} title="불러오는 중…" onClose=${onClose} scrim />`;
  const { item, artifact: a } = d;
  const openDec = d.decisions.find((x) => x.status === 'open');
  const expert = a.meta?.expertCheck ?? [];
  const DEC = { approved: '확정', rejected: '고쳐 달라고 함', stale: '새 버전으로 바뀜', open: '확인 대기' };
  return html`<${BottomSheet} title=${item.title} sub=${[meta.shapes[item.shape], `v${item.version}`, item.author, item.cycleLabel].filter(Boolean).join(' · ')} onClose=${onClose} scrim cls="doc-drawer">
    <${Sec}>
      <p class="bs-eye"><${StWord} st=${DOC_ST[item.status] ?? item.status} word=${stWord(DOC_ST[item.status] ?? item.status)} /><span class="muted">${meta.docStatuses[item.status] ?? ''}</span></p>
      <div class="bs-acts">${openDec && html`<button class="btn decide" onClick=${() => (onDecision ? onDecision(openDec.id) : (location.hash = `#/decisions/${openDec.id}`))}>확인하기</button>`}
        <a class="btn" href=${`/api/artifacts/${a.id}/download`} download>${ic('download', 14)} 내려받기(.md)</a></div>
      ${expert.length > 0 && html`<p class="bs-warn">${ic('alert', 14)} 전문가 확인 필요 — ${expert.join(' · ')}</p>`}
      <${HandoffMemo} h=${a.meta?.handoff} who=${item.author} title="인계 메모" open=${false} />
      <${DocPreview} artifact=${a} author=${item.author} />
      <details class="bs-fold"><summary>버전 ${d.versions.length}${d.decisions.length ? ` · 확인 기록 ${d.decisions.length}` : ''}</summary><div class="bs-more">
        ${d.versions.slice().reverse().map((v) => html`<p class="row">v${v.version} · ${when(v.createdAt)}${v.id === a.id ? ' (지금 보는 버전)' : ''}<span class="sp"></span><a href=${`/api/artifacts/${v.id}/download`} download>${ic('download', 14)} .md</a></p>`)}
        ${d.decisions.length > 0 && html`<h4>확인 기록</h4>${d.decisions.map((x) => html`<p>${DEC[x.status] ?? x.status}${x.comment ? ` — ${x.comment}` : ''}${x.scope === 'always' ? ' · 앞으로도' : ''}</p>`)}`}</div></details>
    </${Sec}>
  </${BottomSheet}>`;
}

/** 콘텐츠 운영이 설계도에 있나 — 설계도가 없는 옛 사무실은 콘텐츠 운영 */
export function useHasContent(state) {
  const bp = useApi('/api/blueprint').data;
  if (state.cycle?.blocks?.includes('content_ops')) return true;
  if (!bp) return null;
  return !bp.current || bp.current.data.blocks.some((b) => b.id === 'content_ops');
}

/** 이번 주 일 — 같은 일은 한 줄로 한 번만. 블록 회차면 블록, 콘텐츠 회차면 단계 */
function weekRows(detail) {
  const open = detail.decisions.filter((d) => d.status === 'open');
  if (detail.flowBlocks) {
    return detail.flowBlocks.map((b) => ({
      key: b.id, name: b.name, state: b.state, who: b.who, done: b.done, total: b.tasks, why: b.detail && !['me', 'done'].includes(b.state) ? b.detail : '',
      mine: open.filter((d) => (b.id === 'content_ops' ? d.kind === 'publish_confirm' : d.kind === 'artifact_confirm' && String(d.payload?.kind ?? '').startsWith(`${b.id}.`))),
      tasks: detail.tasks.filter((t) => blockOf(t.kind) === b.id), pubs: [],
    }));
  }
  return STAGES.map(([key, label, kinds]) => {
    const f = (detail.flow ?? []).find((x) => x.key === key) ?? {};
    const tasks = key === 'confirm' || key === 'publish' ? [] : detail.tasks.filter((t) => (t.stage ? t.stage === key : kinds.includes(t.kind)));
    return { key, name: label, state: f.state ?? 'waiting', who: f.who ?? [], done: tasks.filter((t) => t.status === 'done').length, total: tasks.length, why: (f.detail ?? '').split(' — ')[0],
      mine: key === 'confirm' ? open : [], tasks, pubs: key === 'publish' ? detail.actions.filter((a) => a.kind === 'publish') : [] };
  });
}

/** 숫자 카드 네 개 대신 문장 한 줄 */
function sentence({ data, detail, tc, tp, state }) {
  const m = data.metrics;
  if (!m || !detail) return '';
  const time = tc?.work ? `대표님이 들인 시간 ${mins(tc.work)}${tp?.work > 0 ? `(지난주 ${mins(tp.work)})` : ''}` : '';
  if (detail.flowBlocks) {
    const conf = detail.decisions.filter((d) => d.kind === 'artifact_confirm');
    const waiting = conf.filter((d) => d.status === 'open').length + m.mine.confirm;
    return [waiting ? `대표님 차례 ${waiting}개` : '대표님 차례는 없어요', `확정한 결과물 ${conf.filter((d) => d.status === 'approved').length}개`, time, state.counts.todos ? `내 할 일 ${state.counts.todos}개` : ''].filter(Boolean).join(' · ');
  }
  const mine = m.mine.confirm + m.mine.unknown + m.mine.failed;
  return [mine ? `대표님 차례 ${mine}개` : '대표님 차례는 없어요', `게시 · 저장 ${m.done.published + m.done.saved}개${m.done.dryRun ? `(연습 게시 ${m.done.dryRun})` : ''}`, time, m.adoption.rate !== null ? `수정 없이 승인 ${m.adoption.rate}%` : ''].filter(Boolean).join(' · ');
}

/** 이번 주 일 한 줄 — 누르면 그 자리에서 펼친다 */
function WeekRow({ r, i, open, onToggle, onDec, onOpen, onTask, detail }) {
  return html`<li class=${`ln-work${open ? ' open' : ''}`}>
    <button class="ln-row" onClick=${onToggle} aria-expanded=${open}>
      <span class="ln-no">${i + 1}</span>
      <span class="ln-t"><b>${r.name}</b><small>${[r.who.join(' · '), r.total ? `${r.done}/${r.total} 끝` : '', r.why].filter(Boolean).join(' · ')}</small></span>
      ${r.mine.length ? html`<span class="ln-turn">${ic('decisions', 14)}<span class="lb">대표님 차례</span> ${r.mine.length}</span>` : html`<${StWord} st=${r.state} word=${BLOCK_STATE[r.state] ?? stWord(r.state)} />`}
      <span class="ln-chev" aria-hidden="true">›</span></button>
    ${open && html`<ul class="ln-sub">
      ${r.mine.map((d) => html`<li><button class="ln-subrow mine" onClick=${() => onDec(d.id)}><span class="ln-turn">${ic('decisions', 14)}대표님 차례</span><b>${d.artifact?.title ?? d.title}</b><small>${d.authorName ?? ''}</small></button></li>`)}
      ${r.tasks.map((t) => {
        const art = detail.artifacts.find((a) => a.itemId === t.itemId && a.taskId === t.id)?.id;
        const why = askLine(t) ?? t.waitReason;
        return html`<li><button class="ln-subrow" onClick=${() => (art ? onOpen(art) : onTask(t))}><${StWord} st=${t.status} word=${stWord(t.status, t.statusLabel)} title=${t.statusDetail ?? t.statusLabel} /><b>${t.title}</b><small>${[t.assigneeName, kindLabel(t.kind), why].filter(Boolean).join(' · ')}</small></button></li>`;
      })}
      ${r.pubs.map((a) => html`<li><button class="ln-subrow" onClick=${() => onOpen(a.artifactId)}><${StWord} st=${a.status} word=${ACTION[a.status] ?? a.status} /><b>${a.artifactTitle}</b><small>${a.label}${a.scheduledAt ? ` · ${when(a.scheduledAt)}` : ''}</small></button></li>`)}
      ${!r.mine.length && !r.tasks.length && !r.pubs.length && html`<li class="ln-empty">${r.state === 'skipped' ? r.why || '이번 주에는 하지 않아요' : '아직 업무가 없어요'}</li>`}
    </ul>`}
  </li>`;
}

/** 문서함 — 확인 대기가 먼저, 상자 없이 한 줄씩 */
function DocList({ onDoc, onDec }) {
  const d = useApi('/api/documents').data;
  if (!d) return html`<p class="muted">불러오는 중…</p>`;
  const order = { waiting: 0, revising: 1, confirmed: 2, draft: 3 };
  const all = d.groups.flatMap((g) => g.items.map((x) => ({ ...x, blockName: g.blockName }))).sort((x, y) => (order[x.status] ?? 9) - (order[y.status] ?? 9));
  if (!all.length) return html`<p class="ln-empty">아직 문서가 없어요. 이번 주 일에서 결과물이 나오면 여기에 모여요. 확정한 문서는 언제든 .md로 내려받을 수 있어요.</p>`;
  const open = async (x) => {
    if (x.status === 'waiting') {
      const doc = await api('GET', `/api/documents/${encodeURIComponent(x.itemId)}`).catch(() => null);
      const dec = doc?.decisions.find((y) => y.status === 'open');
      if (dec) { onDec(dec.id); return; }
    }
    onDoc(x.itemId);
  };
  return html`<ul class="ln-list docs-l">${all.map((x) => html`<li class="ln-doc">
    <button class="ln-row" onClick=${() => open(x)}>
      <span class="ln-ic" aria-hidden="true">${ic({ table: 'table', checklist: 'checklist', post: 'pencil' }[x.shape] ?? 'text', 18)}</span>
      <span class="ln-t"><b>${x.title}</b><small>${[x.blockName, meta.shapes[x.shape], `v${x.version}`, x.author, x.cycleLabel, x.status === 'waiting' ? '' : when(x.confirmedAt ?? x.updatedAt)].filter(Boolean).join(' · ')}</small></span>
      ${x.status === 'waiting' ? html`<span class="ln-turn">${ic('decisions', 14)}<span class="lb">대표님 차례</span></span>` : html`<${StWord} st=${DOC_ST[x.status] ?? x.status} word=${stWord(DOC_ST[x.status] ?? x.status)} title=${meta.docStatuses[x.status] ?? ''} />`}</button>
    <a class="btn sm quiet ln-dl" href=${`/api/artifacts/${x.artifactId}/download`} download title="이 버전을 .md로 내려받기">${ic('download', 14)}<span>.md</span></a></li>`)}</ul>`;
}

/** 옛 주소 #/work/docs/:itemId · #/docs/:itemId 는 그 문서를 바로 연다 */
export function Work({ state, tab, sub }) {
  const [cycleId, setCycleId] = useState('current');
  const [art, setArt] = useState(null);
  const [task, setTask] = useState(null);
  const [doc, setDoc] = useState(sub ?? null);
  const [dec, setDec] = useState(null);
  const [opened, setOpened] = useState({});
  useEffect(() => { if (sub) setDoc(sub); }, [sub]);
  // 옛 탭 주소(#/work/docs · #/work/calendar)는 그 자리로 내려 준다
  useEffect(() => { if (tab === 'docs' || tab === 'calendar') setTimeout(() => document.getElementById(`sec-${tab}`)?.scrollIntoView({ block: 'start' }), 300); }, [tab]);
  const data = useApi(`/api/content?cycle=${cycleId}`).data;
  const time = useApi('/api/time/summary').data;
  const decs = useApi('/api/decisions').data;
  const hasContent = useHasContent(state);
  if (!data) return html`<div class="page flat docs-page"><p class="muted">불러오는 중…</p></div>`;
  const { band, detail } = data;
  // 내 개입 시간(결정 72) — 이 회차에 쓴 시간, 지난 회차와 비교
  const tc = time?.cycles.find((c) => c.id === detail?.cycle.id);
  const tp = tc ? time.cycles[time.cycles.indexOf(tc) - 1] : null;
  const rows = detail ? weekRows(detail) : [];
  const running = state.cycle?.status === 'running';
  return html`<div class="page flat docs-page">
    <div class="pg-title">
      <span class="wk">${band.length > 1 ? html`<select class="wk-sel" aria-label="다른 주 보기" value=${detail?.cycle.id ?? ''} onChange=${(e) => setCycleId(e.target.value)}>${band.map((b) => html`<option value=${b.id}>${b.label} · ${stWord(b.status)}</option>`)}</select>` : detail?.cycle.label ?? '이번 주 일이 아직 없어요'}</span>
      <h1>이번 주 일</h1>
      <p>${detail ? sentence({ data, detail, tc, tp, state }) : '이번 주 일을 시작하면 매니저가 일을 나눠 직원에게 맡겨요.'}</p>
      <p class="pg-note">${data.next.nextRunAt ? `다음 주 일 자동 시작 ${when(data.next.nextRunAt)} · 이 컴퓨터` : '매주 시작 예약이 없어요 — 설정 › 실행 환경에서 정해요'}${state.runner.paused ? ' · 지금 멈춤 — 새 업무를 시작하지 않아요' : ''}</p>
      <div class="pg-acts">
        ${!running && html`<button class="btn pri" onClick=${() => act(() => api('POST', '/api/cycles'), '이번 주 일을 시작했어요')}>${state.cycle ? '이번 주 일 다시 시작' : '이번 주 일 시작'}</button>`}
        <button class="btn quiet" onClick=${() => act(() => api('POST', '/api/pause', { paused: !state.runner.paused }), state.runner.paused ? '다시 시작해요' : '새 업무 시작을 멈췄어요')}>${state.runner.paused ? html`${ic('play', 14)} 다시 시작` : html`${ic('pause', 14)} 일시정지`}</button>
        ${detail && (hasFac(state, 'board')
          ? html`<button class="btn quiet" title="이 주의 결과물을 한 번에 내려받아요(진행 보드 레벨 2)" onClick=${() => act(async () => { const r = await api('GET', `/api/cycles/${detail.cycle.id}/export`); download(r.filename, r.text); }, '결과물을 내려받았어요')}>${ic('download', 14)} 결과물 한 번에(.md)</button>`
          : html`<span class="lock-note" title="3D 사무실의 진행 보드를 눌러 레벨을 올릴 수 있어요">${ic('lock', 14)} 결과물 한 번에 내려받기는 진행 보드 레벨 2에서 열려요</span>`)}
      </div>
    </div>
    ${detail && html`<section class="ln-sec"><h2 class="ln-h">할 일 ${rows.length}개</h2>
      <ol class="ln-list">${rows.map((r, i) => html`<${WeekRow} key=${r.key} r=${r} i=${i} detail=${detail} open=${!!opened[r.key]} onToggle=${() => setOpened({ ...opened, [r.key]: !opened[r.key] })} onDec=${setDec} onOpen=${setArt} onTask=${setTask} />`)}</ol></section>`}
    <section class="ln-sec" id="sec-docs"><h2 class="ln-h">문서함</h2><${DocList} onDoc=${setDoc} onDec=${setDec} /></section>
    ${hasContent && html`<section class="ln-sec" id="sec-calendar"><h2 class="ln-h">캘린더</h2>
      <${Calendar} onPick=${setDec} onAction=${(e) => (e.kind === 'confirm' ? setDec(e.id) : setArt(detail?.actions.find((x) => x.id === e.id)?.artifactId ?? null))} /></section>`}
    ${art && html`<${Detail} id=${art} state=${state} onClose=${() => setArt(null)} />`}
    ${task && html`<${TaskDrawer} t=${task} state=${state} onClose=${() => setTask(null)} />`}
    ${doc && html`<${DocDrawer} itemId=${doc} onDecision=${(x) => { setDoc(null); setDec(x); }} onClose=${() => { setDoc(null); if (sub) location.hash = '#/docs'; }} />`}
    ${dec && html`<${DecisionSheet} id=${dec} state=${state} list=${decs?.open ?? []} scrim onPick=${setDec} onClose=${() => setDec(null)} />`}
  </div>`;
}
