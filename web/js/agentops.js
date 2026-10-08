// AI 팀 운영 안전장치 화면 부품(결정 80 · 1순위 과제 계약 §2) — 결정 등급, 인계 메모, 작업 기록, 사용 한도
import { act, api, html, stWord, toast, useApi, useEffect, useState, usd, when } from './lib.js';
import { ic } from './icons.js';

/** 결정 등급 세 가지 — 색만이 아니라 모양(○ ◆ ▲)과 글자로도 구분한다 */
export const RISK = {
  external: { label: '밖으로', mark: '▲', hint: '사무실 밖으로 나가요 — 게시 · 발송 · 외부 저장', how: '실제 나갈 원문 · 받는 곳 · 링크를 확인한 뒤에만 승인할 수 있어요.' },
  direction: { label: '방향', mark: '◆', hint: '팀이 일하는 방향이 바뀌어요 — 실행 계획 · 설계도 · 예산', how: '하나씩 읽고 정해요.' },
  internal: { label: '사무실 안', mark: '○', hint: '우리끼리 쓰는 결과물이에요', how: '주마다 묶어 한 번에 확정할 수 있어요.' },
};
export const RISK_ORDER = ['external', 'direction', 'internal'];
/** 등급 — 서버가 준 값(payload.risk)이 먼저, 없으면 서버 규칙(src/core/risk.ts)과 같게 종류로 */
export function riskOf(d) {
  const r = d?.payload?.risk;
  if (RISK[r]) return r;
  if (d?.kind === 'publish_confirm') return 'external';
  if (d?.kind === 'artifact_confirm') return d.payload?.plan === true ? 'direction' : 'internal';
  return ['rule_confirm', 'knowledge_promote'].includes(d?.kind) ? 'internal' : 'direction';
}

export function RiskBadge({ risk, big = false }) {
  const r = RISK[risk] ?? RISK.internal;
  return html`<span class=${`risk rk-${risk}${big ? ' big' : ''}`} title=${r.hint}><i aria-hidden="true">${r.mark}</i>${r.label}</span>`;
}

/** 결정 종류 이름(목록 · 사무실 카드) — 새 종류 둘을 더한다 */
export const KIND_EXTRA = { owner_question: '질문', budget_continue: '계속할까요' };

/** 확신 — 점 세 개 모양 + 글자 */
const CONF = { high: ['높음', '●●●'], mid: ['보통', '●●○'], low: ['낮음', '●○○'] };

/** 인계 메모(계약 1) — 만든 직원이 다음 사람에게 남긴 생각. 정한 것 · 가정 · 모르는 것 · 꼭 지킬 것 · 확신 */
export function HandoffMemo({ h, who, title = '앞 직원 메모', open = true }) {
  if (!h) return null;
  const [cl, dots] = CONF[h.confidence] ?? CONF.mid;
  const list = (label, xs, cls = '') => (xs?.length ? html`<div class=${`hm-sec ${cls}`}><h4>${label}</h4><ul>${xs.map((x) => html`<li>${x}</li>`)}</ul></div>` : null);
  return html`<details class="card hmemo" open=${open}>
    <summary><h3>${ic('note')} ${title}${who ? html` <span class="muted">· ${who}</span>` : ''}</h3><span class=${`conf cf-${h.confidence}`} title="만든 직원이 스스로 매긴 확신"><i aria-hidden="true">${dots}</i>확신 ${cl}</span></summary>
    ${h.purpose && html`<p class="hm-purpose">${h.purpose}</p>`}
    ${h.decisions?.length > 0 && html`<div class="hm-sec"><h4>정한 것과 이유</h4><ul>${h.decisions.map((x) => html`<li><b>${x.what}</b>${x.why ? html`<small> — ${x.why}</small>` : ''}</li>`)}</ul></div>`}
    ${list('꼭 지킬 것', h.mustKeep, 'keep')}
    ${list('아직 가정인 것', h.assumptions)}
    ${list('아직 모르는 것', h.openQuestions, 'unknown')}
    ${h.sources?.length > 0 && html`<p class="note">출처 ${h.sources.length}개</p>`}
  </details>`;
}

/** 웹에서 읽어 온 자료가 들어간 결과물(계약 4) */
export function ExternalNote({ artifact }) {
  if (!artifact?.meta?.external) return null;
  return html`<div class="card col ext-note"><h3>${ic('globe')} 외부 자료가 들어 있어요</h3><p class="note">웹에서 읽어 온 글이 섞여 있어요. 직원은 그 글을 지시로 따르지 않고 자료로만 써요. 사실인지 한 번 더 봐 주세요.</p></div>`;
}

// ── 작업 기록(계약 5) ──
const RUN_ST = { ok: stWord('done'), error: stWord('error'), cancelled: stWord('cancelled'), asleep: stWord('asleep') }; // 끝 · 문제 · 멈춤 · 멈춤
const RUN_CLS = { ok: 'done', error: 'failed', cancelled: 'cancelled', asleep: 'asleep' };
const secs = (a, b) => { const s = Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 1000)); return Number.isFinite(s) ? (s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`) : ''; };
const num = (n) => (n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)}천` : String(n));

/** 업무 하나의 AI 실행 기록 — 한 번 실행 = 한 줄, 펼치면 넣은 기억 · 관련 결정 · 밖으로 나간 일 */
export function RunLog({ taskId, names = {} }) {
  const { data: rows, error } = useApi(taskId ? `/api/runs?taskId=${encodeURIComponent(taskId)}&limit=20` : null);
  if (!taskId) return null;
  if (error) return html`<div class="col runlog"><h3>기록</h3><p class="note">작업 기록을 아직 읽을 수 없어요.</p></div>`;
  if (!rows) return html`<div class="col runlog"><h3>기록</h3><p class="muted">불러오는 중…</p></div>`;
  const cost = rows.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  return html`<div class="col runlog"><h3>기록 <span class="muted">AI 실행 ${rows.length}번${rows.length ? ` · ${usd(cost)}${rows.some((r) => r.costEstimated) ? '(추정 포함)' : ''}` : ''}</span></h3>
    ${!rows.length && html`<p class="note">아직 이 업무로 AI를 부른 적이 없어요.</p>`}
    ${rows.map((r) => {
      const mem = r.memory ?? { rules: [], knowledge: [], inputs: [] };
      const nMem = mem.rules.length + mem.knowledge.length + mem.inputs.length;
      return html`<details class="run">
        <summary><span class=${`pill st-${RUN_CLS[r.status] ?? r.status}`}><i class="dot"></i>${RUN_ST[r.status] ?? r.status}</span>
          <b>${names[r.employeeId] ?? '직원'}</b><span class="muted">${when(r.startedAt)}${r.endedAt ? ` · ${secs(r.startedAt, r.endedAt)}` : ''}</span><span class="sp"></span>
          <span class="run-n" title="읽은 양 → 쓴 양(토큰)">${num(r.inputTokens)} → ${num(r.outputTokens)}</span><b class="run-c">${usd(r.costUsd)}${r.costEstimated ? html`<small>추정</small>` : ''}</b></summary>
        <dl class="run-d">
          <dt>AI 연결</dt><dd>${r.provider} · ${r.model}</dd>
          ${r.errorType && html`<dt>실패 종류</dt><dd>${r.errorType}</dd>`}
          <dt>넣은 기억</dt><dd>${nMem ? html`${mem.rules.length > 0 && html`<span class="mtag">배운 것 ${mem.rules.length}</span>`}${mem.knowledge.length > 0 && html`<span class="mtag">회사 지식 ${mem.knowledge.length}</span>`}${mem.inputs.length > 0 && html`<span class="mtag">받은 결과물 ${mem.inputs.length}</span>`}` : '없음'}</dd>
          ${r.decisionIds?.length > 0 && html`<dt>관련 결정</dt><dd>${r.decisionIds.map((id) => html`<a href=${`#/decisions/${id}`}>결정 보기</a> `)}</dd>`}
          ${r.externalEffects?.length > 0 && html`<dt>밖으로 나간 일</dt><dd>${r.externalEffects.join(' · ')}</dd>`}
          <dt>기록 지문</dt><dd><code title="앞 줄 지문을 이어 붙여 고친 흔적이 드러나요">${String(r.hash ?? '').slice(0, 10)}</code></dd>
        </dl></details>`;
    })}</div>`;
}

// ── 사용 한도(계약 6) ──
const SCOPE = { task: '업무 하나', employee: '직원 한 명 · 한 주', office: '사무실 전체 · 한 주' };
export const scopeLabel = (s) => SCOPE[s] ?? s;
/** 막대 — 한도 대비 사용. 넘으면 글자로도 알린다 */
export function Meter({ used, cap }) {
  const pct = cap ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const over = cap != null && used >= cap;
  return html`<span class=${`meter${over ? ' over' : pct >= 80 ? ' near' : ''}`} role="img" aria-label=${cap == null ? `${usd(used)} 사용 · 한도 없음` : `${usd(cap)} 중 ${usd(used)} 사용${over ? ' · 한도에 닿음' : ''}`}><i style=${`width:${cap == null ? 0 : pct}%`}></i></span>`;
}

/** 설정 › AI 연결 · 사용 한도 — 세 겹 한도 · 이번 주 사용 · 직원별 · 이번 주만 늘린 것 */
export function BudgetCard({ employees }) {
  const b = useApi('/api/budget').data;
  const [form, setForm] = useState(null);
  useEffect(() => { if (b && !form) setForm(Object.fromEntries(Object.entries(b.caps).map(([k, v]) => [k, v == null ? '' : String(v)]))); }, [b]);
  if (!b || !form) return html`<div class="card budget"><h3>사용 한도</h3><p class="muted">불러오는 중…</p></div>`;
  const name = Object.fromEntries((employees ?? []).map((e) => [e.id, e.name]));
  const caps = b.caps;
  const save = () => {
    const next = {};
    for (const k of ['taskUsd', 'employeeWeekUsd', 'officeWeekUsd']) { const v = String(form[k] ?? '').trim(); next[k] = v === '' ? null : Math.max(0, Number(v)); }
    if (Object.values(next).some((v) => v !== null && !Number.isFinite(v))) { toast('한도는 숫자로 적어 주세요(예: 0.5)', true); return; }
    act(() => api('PUT', '/api/budget', { caps: next }), '사용 한도를 바꿨어요');
  };
  const field = (k, label, help) => html`<label class="f bcap"><span>${label}</span><span class="bin"><i>$</i><input class="in" inputmode="decimal" value=${form[k]} placeholder="한도 없음" onInput=${(e) => setForm({ ...form, [k]: e.target.value })}/></span><small class="muted">${help}</small></label>`;
  const raises = b.raisesThisWeek ?? [];
  const rows = [...b.used.byEmployee].sort((x, y) => y.usd - x.usd);
  return html`<div class="card budget stack">
    <div class="row"><h3>사용 한도</h3><span class="muted">세 겹 · 이번 주</span></div>
    <div class="b-office"><div class="row"><b>사무실 전체 이번 주</b><span class="sp"></span><b class="b-num">${usd(b.used.officeWeekUsd)}</b><span class="muted">/ ${caps.officeWeekUsd == null ? '한도 없음' : usd(caps.officeWeekUsd)}</span></div>
      <${Meter} used=${b.used.officeWeekUsd} cap=${caps.officeWeekUsd} /></div>
    ${rows.length > 0 && html`<div class="b-emps"><h4>직원별 이번 주</h4>${rows.map((r) => html`<div class="b-emp"><span>${name[r.employeeId] ?? '직원'}</span><${Meter} used=${r.usd} cap=${caps.employeeWeekUsd} /><b>${usd(r.usd)}${caps.employeeWeekUsd != null && r.usd >= caps.employeeWeekUsd ? html`<small class="over-t">한도 닿음</small>` : ''}</b></div>`)}</div>`}
    ${raises.length > 0 && html`<div class="b-raise"><b>이번 주만 늘린 것</b>${raises.map((r) => html`<span class="pill st-me">${scopeLabel(r.scope)} +${usd(r.usd)}</span>`)}<small class="muted">다음 주에는 원래 한도로 돌아가요.</small></div>`}
    <div class="b-caps">${field('taskUsd', '업무 하나', '업무 한 건이 쓸 수 있는 만큼')}${field('employeeWeekUsd', '직원 한 명 · 한 주', '한 직원이 한 주에')}${field('officeWeekUsd', '사무실 전체 · 한 주', '모든 직원을 합쳐 한 주에')}</div>
    <div class="row"><p class="note">한도에 닿으면 그 업무는 <b>잠듦</b>이 되고 확인할 것에 '계속할까요?'가 와요. 비우면 한도가 없어요. 구독으로 쓰는 AI는 실제 청구가 아니라 종량제로 환산한 추정이에요.</p><span class="sp"></span><button class="btn pri sm" onClick=${save}>저장</button></div>
  </div>`;
}

/** 작업 기록 사슬 검사(계약 5) — 고친 흔적이 있으면 어디서 끊겼는지 */
export function RunsVerify() {
  const [r, setR] = useState(null);
  const check = () => api('GET', '/api/runs/verify').then(setR).catch((e) => setR({ error: e.message }));
  return html`<div class="row verify"><button class="btn sm" onClick=${check}>작업 기록 이어짐 확인</button>
    ${r && (r.error ? html`<span class="note">${r.error}</span>` : r.ok ? html`<span class="pill st-done">${r.count}줄 모두 이어져 있어요</span>` : html`<span class="pill st-issue">기록이 고쳐진 흔적 — ${r.brokenAt}부터</span>`)}</div>`;
}
