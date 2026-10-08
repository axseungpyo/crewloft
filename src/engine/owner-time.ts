import type { Repo } from '../store/repo.ts';
import { DomainError } from '../store/repo.ts';
import { weekStart } from './runner.ts';

/**
 * 대표가 들인 시간(결정 72) — 핵심 지표 ①(맡겨두면 알아서 돌아감)과 ③(애착)을 실제로 잰다.
 * 화면이 보이고 최근에 움직임(마우스 · 키 · 스크롤)이 있을 때만 화면이 초를 보내고, 서버는 영역 · 날짜 · 회차별로 더한다.
 * 일하는 시간(결정 · 확인 · 지시 · 관리)은 줄어들수록 좋고, 사무실에 머문 시간은 애착으로 본다. 이 컴퓨터에만 저장된다.
 */
export type TimeKind = 'work' | 'stay' | 'setup';
export const TIME_AREAS: Record<string, { label: string; kind: TimeKind }> = {
  decide: { label: '결정함', kind: 'work' },
  review: { label: '콘텐츠 확인', kind: 'work' },
  direct: { label: '직원과 대화 · 지시', kind: 'work' },
  manage: { label: '회사 관리(채용 · 지식)', kind: 'work' },
  office: { label: '사무실 둘러보기 · 짓기', kind: 'stay' },
  setup: { label: '설정 · 처음 준비', kind: 'setup' },
};
export const KIND_LABEL: Record<TimeKind, string> = { work: '일한 시간', stay: '사무실에 머문 시간', setup: '준비 시간' };
/** 한 번에 받는 최대 초 — 화면은 30초마다 보낸다(숨길 때 한 번 더) */
const MAX_PER_CALL = 300;

const localDay = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 그 시각의 회차 — 진행 중이면 그것, 아니면 마지막 회차(회차 사이 시간은 직전 회차 몫) */
function cycleAt(repo: Repo): string {
  return repo.runningCycles().at(-1)?.id ?? repo.latestCycle()?.id ?? '';
}

export function recordTime(repo: Repo, spans: unknown, at = new Date()): { saved: number } {
  if (!spans || typeof spans !== 'object') throw new DomainError(400, '시간 기록 형식이 올바르지 않아요');
  const day = localDay(at), cycle = cycleAt(repo);
  let saved = 0;
  repo.tx(() => {
    for (const [area, raw] of Object.entries(spans as Record<string, unknown>)) {
      if (!TIME_AREAS[area]) continue;
      const sec = Math.round(Math.max(0, Math.min(MAX_PER_CALL, Number(raw) || 0)));
      if (!sec) continue;
      repo.exec('INSERT INTO owner_time (day, area, cycle_id, seconds) VALUES (?, ?, ?, ?) ON CONFLICT(day, area, cycle_id) DO UPDATE SET seconds = seconds + excluded.seconds', day, area, cycle, sec);
      saved += sec;
    }
  });
  return { saved };
}

type Totals = Record<TimeKind, number> & { byArea: Record<string, number> };
function totals(rows: Array<{ area: string; s: number }>): Totals {
  const t: Totals = { work: 0, stay: 0, setup: 0, byArea: {} };
  for (const r of rows) { const a = TIME_AREAS[r.area]; if (!a) continue; t[a.kind] += r.s; t.byArea[r.area] = (t.byArea[r.area] ?? 0) + r.s; }
  return t;
}

/** 성적표 — 이번 회차 · 최근 회차들 · 이번 주와 지난주 */
export function timeSummary(repo: Repo, now = new Date()) {
  const cycles = repo.many<{ id: string; label: string; status: string }>('SELECT id, label, status FROM cycles ORDER BY started_at DESC LIMIT 6').reverse();
  const perCycle = cycles.map((c) => ({ id: c.id, label: c.label, status: c.status, ...totals(repo.many<{ area: string; s: number }>('SELECT area, SUM(seconds) AS s FROM owner_time WHERE cycle_id = ? GROUP BY area', c.id)) }));
  const ws = weekStart(now), lws = new Date(ws); lws.setDate(lws.getDate() - 7);
  const range = (a: Date, b: Date) => totals(repo.many<{ area: string; s: number }>('SELECT area, SUM(seconds) AS s FROM owner_time WHERE day >= ? AND day < ? GROUP BY area', localDay(a), localDay(b)));
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const current = cycleAt(repo);
  return {
    areas: TIME_AREAS, kinds: KIND_LABEL,
    current: perCycle.find((c) => c.id === current) ?? null,
    previous: perCycle.filter((c) => c.id !== current).at(-1) ?? null,
    cycles: perCycle,
    week: range(ws, tomorrow), lastWeek: range(lws, ws),
    all: totals(repo.many<{ area: string; s: number }>('SELECT area, SUM(seconds) AS s FROM owner_time GROUP BY area')),
    rule: '화면이 보이고 1분 30초 안에 마우스 · 키 · 스크롤 움직임이 있을 때만 재요. 이 컴퓨터에만 저장되고, 무엇을 봤는지는 저장하지 않아요.',
  };
}
