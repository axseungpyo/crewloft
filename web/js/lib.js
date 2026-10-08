// 공통: Preact·htm, API, 실시간 갱신 신호, 라우터, 알림, 형식 도우미
import { h, render } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import htm from 'htm';

export const html = htm.bind(h);

/** 상태 낱말 여섯 개(brand.md §4 원칙 4) — 같은 상태를 화면마다 다르게 부르지 않는다. 색 · 아이콘은 base.css 같은 묶음 */
export const ST6 = { todo: '시작 전', working: '일하는 중', decide: '대표 확인', done: '끝', pause: '멈춤', issue: '문제' };
const ST_GROUP = {
  waiting: 'todo', idle: 'todo', skipped: 'todo', pending: 'todo',
  working: 'working', reviewing: 'working', active: 'working', running: 'working', handoff_pending: 'working',
  me: 'decide', open: 'decide', awaiting_user: 'decide', verify: 'decide', asked: 'decide',
  done: 'done', ok: 'done', succeeded: 'done',
  quota_wait: 'pause', quota: 'pause', asleep: 'pause', cancelled: 'pause', stale: 'pause',
  reconnect: 'issue', failed: 'issue', error: 'issue', issue: 'issue', unknown: 'issue', blocked: 'issue',
};
/** 일의 상태(업무 · 블록 · 직원 활동 · 실행 기록) → 여섯 낱말. 모르는 값이면 받은 낱말 그대로 */
export const stWord = (status, fallback) => ST6[ST_GROUP[status]] ?? fallback ?? status;
/** 화면에 쓰는 AI 이름 — 가짜 AI(서버 이름 '가짜 AI (로컬 확인용)')는 '견본 AI'(brand.md §4 원칙 2). ai는 state.ai 또는 ai.options 한 칸 */
export const aiName = (ai) => (ai?.id === 'fake' ? '견본 AI' : ai?.label ?? '');
/** 소스 코드 — AGPL-3.0(결정 77). 저장소 이름은 서비스 이름이 정해지면 바뀐다 */
export const SOURCE_URL = 'https://github.com/axseungpyo/crewloft';
export { render, useState, useEffect, useRef, useMemo, useCallback };

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(method, path, body) {
  const write = method !== 'GET';
  const res = await fetch(path, {
    method,
    headers: write ? { 'content-type': 'application/json' } : {},
    body: write ? JSON.stringify(body ?? {}) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) bus.emit('auth');
    throw new ApiError(data.error || `요청 실패 (${res.status})`, res.status);
  }
  return data;
}

/** 아주 작은 이벤트 버스 */
export const bus = {
  map: new Map(),
  on(type, fn) { (this.map.get(type) ?? this.map.set(type, new Set()).get(type)).add(fn); return () => this.map.get(type)?.delete(fn); },
  emit(type, payload) { for (const fn of this.map.get(type) ?? []) fn(payload); },
};

// ── 실시간: 서버 이벤트가 오면 version이 오르고, useApi가 다시 읽는다 ──
let version = 0;
export const live = { on: false, lastOk: null, lastEvent: null };
export function connectLive() {
  const es = new EventSource('/api/stream');
  es.onopen = () => { live.on = true; live.lastOk = new Date(); version++; bus.emit('version'); bus.emit('live'); };
  es.onmessage = (m) => {
    live.lastOk = new Date();
    try { live.lastEvent = JSON.parse(m.data); } catch { live.lastEvent = null; }
    version++;
    bus.emit('event', live.lastEvent);
    bus.emit('version');
  };
  es.onerror = () => { live.on = false; bus.emit('live'); };
  return es;
}
export function refresh() { version++; bus.emit('version'); }

export function useVersion() {
  const [v, setV] = useState(version);
  useEffect(() => bus.on('version', () => setV(version)), []);
  return v;
}
export function useLive() {
  const [, set] = useState(0);
  useEffect(() => bus.on('live', () => set((n) => n + 1)), []);
  return live;
}

/** GET 요청 + 실시간 갱신(짧게 모아서 다시 읽음) */
export function useApi(path) {
  const v = useVersion();
  const [st, setSt] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    if (!path) return undefined;
    let alive = true;
    const t = setTimeout(() => {
      api('GET', path)
        .then((data) => alive && setSt({ data, error: null, loading: false }))
        .catch((error) => alive && setSt((s) => ({ ...s, error, loading: false })));
    }, st.data ? 120 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [path, v]);
  return st;
}

/** 버스의 특정 이벤트 종류를 받는다(모션 연출용) */
export function useEvents(fn, deps = []) {
  useEffect(() => bus.on('event', (e) => e && fn(e)), deps);
}

// ── 라우터(해시) ──
export function useRoute() {
  const get = () => (location.hash.replace(/^#\/?/, '') || 'office').split('/').map(decodeURIComponent);
  const [parts, set] = useState(get);
  useEffect(() => {
    const on = () => set(get());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parts;
}
export const go = (path) => { location.hash = `#/${path}`; };

// ── 알림 ──
export function toast(text, err = false) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.classList.toggle('err', !!err);
  t.classList.add('on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('on'), err ? 4200 : 2400);
}
/** 요청 실행 + 결과 알림 */
export async function act(fn, okText) {
  try {
    const r = await fn();
    if (okText) toast(okText);
    refresh();
    return r;
  } catch (e) {
    toast(e.message, true);
    return undefined;
  }
}

// ── 형식 ──
export const pad = (n) => String(n).padStart(2, '0');
export const hhmm = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const dayLabel = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}(${'일월화수목금토'[d.getDay()]})`; };
export const when = (iso) => (iso ? `${dayLabel(iso)} ${hhmm(iso)}` : '');
export const usd = (n) => `$${(n ?? 0).toFixed(2)}`;
/** 초 → '12분' · '1시간 5분' · '1분 미만' (대표가 들인 시간, 결정 72) */
export const mins = (s) => { const m = Math.round((s ?? 0) / 60); if (!s) return '0분'; if (m < 1) return '1분 미만'; return m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`; };
export function ago(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}
export function josa(word, a, b) {
  const c = word.charCodeAt(word.length - 1);
  return word + (c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 > 0 ? a : b);
}

// ── 마크다운: 이스케이프한 뒤 최소 변환(안전) ──
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function inline(s) {
  return s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}
/** 체크리스트 항목 '- [ ] …' · '- [x] …'(업무 블록 결과물, 결정 73) */
const checkbox = (t) => t.replace(/^\[ \]\s*/, '<i class="md-ck" aria-label="할 일"></i>').replace(/^\[[xX]\]\s*/, '<i class="md-ck on" aria-label="한 일"></i>');
/** 마크다운을 문단 단위 블록 목록으로(문단 코멘트용 번호 포함). 표는 통째로 한 블록 */
export function mdBlocks(src) {
  const blocks = [];
  let list = null;
  let table = null;
  const flush = () => {
    if (list) { blocks.push({ type: 'ul', html: `<ul>${list.join('')}</ul>` }); list = null; }
    if (table) {
      const [head = [], ...rows] = table;
      blocks.push({ type: 'table', html: `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>` });
      table = null;
    }
  };
  for (const line of esc(src).split('\n')) {
    let m;
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (list) { const t = table; table = null; flush(); table = t; }
      if (!/^\s*\|[\s:|-]+\|\s*$/.test(line)) (table ??= []).push(line.trim().slice(1, -1).split('|').map((c) => c.trim()));
      continue;
    }
    if (table) flush();
    if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) { flush(); const n = Math.min(6, m[1].length + 2); blocks.push({ type: 'h', html: `<h${n}>${inline(m[2])}</h${n}>` }); }
    else if ((m = /^\s*(?:[-*•]|\d+\.)\s+(.*)$/.exec(line))) { (list ??= []).push(`<li>${inline(checkbox(m[1]))}</li>`); }
    else if ((m = /^&gt;\s?(.*)$/.exec(line))) { flush(); blocks.push({ type: 'q', html: `<blockquote>${inline(m[1])}</blockquote>` }); }
    else if (!line.trim()) flush();
    else { flush(); blocks.push({ type: 'p', html: `<p>${inline(line)}</p>` }); }
  }
  flush();
  return blocks;
}
export function Markdown({ src, class: cls = '' }) {
  return html`<div class=${`md ${cls}`} dangerouslySetInnerHTML=${{ __html: mdBlocks(src).map((b) => b.html).join('') }}></div>`;
}

// ── 화면이 함께 쓰는 이름표(P2 계약 5 · /api/meta) — 처음 한 번 읽고, 못 읽으면 아래 기본값으로 ──
export const meta = {
  roles: { manager: { label: '매니저', kin: null }, researcher: { label: '리서처', kin: null }, writer: { label: '작가', kin: null }, designer: { label: '디자이너', kin: null }, marketer: { label: '마케터', kin: 'writer' }, editor: { label: '편집자', kin: 'writer' }, producer: { label: '영상 PD', kin: 'designer' }, seo: { label: 'SEO', kin: 'researcher' } },
  kinds: { research: { label: '조사', block: 'content_ops' }, plan: { label: '기획', block: 'content_ops' }, blog_draft: { label: '블로그', block: 'content_ops' }, newsletter: { label: '뉴스레터', block: 'content_ops' }, sns_draft: { label: 'SNS', block: 'content_ops' }, image_brief: { label: '이미지', block: 'content_ops' }, review: { label: '검수', block: 'content_ops' } },
  blocks: [],
  decisionKinds: { artifact_confirm: '결과물 확인', publish_confirm: '게시 확인', reconnect: '다시 연결' },
  platforms: { blog: '블로그', threads: 'Threads', linkedin: 'LinkedIn' },
  statuses: {},
  stages: { idea: '아이디어', prep: '준비 중', launch: '막 출시', operate: '운영 중' },
  shapes: { doc: '문서', table: '표', checklist: '체크리스트', post: '게시물' },
  docStatuses: { confirmed: '확정', waiting: '확인 대기', revising: '고치는 중', draft: '확인 없음' },
  todoSources: { plan: '실행 계획', checklist: '체크리스트' },
};
export const loadMeta = () => fetch('/api/meta').then((r) => (r.ok ? r.json() : null)).then((m) => { if (m) Object.assign(meta, m); }).catch(() => {});
/** 직무 이름 = 이름 + 설명(crewloft-brand.md §5-1) — 좁은 자리는 이름만(roleLabel), 카드 · 채용 · 마우스 올림은 '이름 : 설명'(roleFull).
    서버가 설명(meta.roles[r].desc)을 주면 서버 값을 쓰고, 그 전에는 아래 표를 쓴다(그때 서버 이름은 'SEO 담당'처럼 설명이 섞여 있어 이름도 아래 표로) */
const ROLE_NAME = { manager: '매니저', researcher: '리서처', writer: '작가', designer: '디자이너', marketer: '마케터', editor: '편집자', producer: '영상 PD', seo: 'SEO' };
const ROLE_DESC = { manager: '계획 · 조율 담당', researcher: '조사 담당', writer: '글 담당', designer: '이미지 담당', marketer: '홍보 담당', editor: '교정 담당', producer: '영상 담당', seo: '검색 담당' };
export const roleLabel = (r) => (meta.roles[r]?.desc ? meta.roles[r].label : ROLE_NAME[r] ?? meta.roles[r]?.label ?? r);
export const roleDesc = (r) => meta.roles[r]?.desc ?? ROLE_DESC[r] ?? '';
export const roleFull = (r) => (roleDesc(r) ? `${roleLabel(r)} : ${roleDesc(r)}` : roleLabel(r));
/** 업무 종류 이름 — 업무 블록(`블록.단계`)은 단계 이름 */
export const kindLabel = (k) => meta.kinds[k]?.label ?? (k?.includes('.') ? '이번 주 일' : k);
export const platformLabel = (p) => meta.platforms[p] ?? p;
