import type { Repo } from '../store/repo.ts';
import { DomainError, newId, now } from '../store/repo.ts';
import { label as purposeLabel } from './ai-requests.ts';
import { resources, type ResKey } from './space.ts';

/**
 * 기능 시설 업그레이드 — 시설 레벨이 오르면 그 화면에 편의 기능이 열린다(핵심 기능은 그대로).
 * 비용은 직무별 실적 자원(결정 68), 조건은 사무실 레벨. 수치는 임시값이다.
 */
export type FacKey = 'board' | 'decisions' | 'power' | 'knowledge' | 'milestones';
type Cost = Partial<Record<ResKey, number>>;
interface Step { unlock: string; cost: Cost; office: number }
export const FAC: Record<FacKey, { label: string; screen: string; steps: Record<number, Step> }> = {
  board: { label: '진행 보드', screen: 'content/board', steps: { 2: { unlock: '한 주 결과물을 한 번에 내려받기(.md)', cost: { trust: 30, draft: 30 }, office: 1 } } },
  decisions: { label: '결재함', screen: 'decisions', steps: { 2: { unlock: '밖으로 나갈 것을 한 화면에서 차례로 원문 확인하고 승인', cost: { trust: 50 }, office: 1 } } },
  power: { label: 'AI 연결 장비', screen: 'settings/power', steps: { 2: { unlock: 'AI 사용 기록표 — 언제 · 누가 · 무엇에 썼는지', cost: { insight: 30, trust: 20 }, office: 1 } } },
  knowledge: { label: '지식 책장', screen: 'company/library', steps: { 2: { unlock: '회사 지식 내보내기(.md) · 오래 확인 안 한 지식 점검 목록', cost: { insight: 40 }, office: 1 } } },
  milestones: { label: '마일스톤 진열', screen: 'company/library', steps: { 2: { unlock: '달성한 기록을 카드 이미지로 저장', cost: { design: 30, trust: 10 }, office: 1 } } },
};
export const FAC_KEYS = Object.keys(FAC) as FacKey[];

export function facilityLevels(repo: Repo): Record<FacKey, number> {
  const saved = repo.getSetting<Partial<Record<FacKey, number>>>('space.facilities') ?? {};
  return Object.fromEntries(FAC_KEYS.map((k) => [k, saved[k] ?? 1])) as Record<FacKey, number>;
}

/** 이 편의 기능이 열렸나 — 서버 쪽 관문 */
export function requireFacility(repo: Repo, key: FacKey, level = 2): void {
  if (facilityLevels(repo)[key] < level) throw new DomainError(403, `${FAC[key].label} 레벨 ${level}에서 열려요 — ${FAC[key].steps[level]?.unlock ?? ''}`);
}

export function facilityState(repo: Repo) {
  const lv = facilityLevels(repo), bal = resources(repo).balance, stage = repo.getOffice()?.stage ?? 0;
  return Object.fromEntries(FAC_KEYS.map((k) => {
    const f = FAC[k], step = f.steps[lv[k] + 1];
    const unlocked = Object.entries(f.steps).filter(([n]) => Number(n) <= lv[k]).map(([, s]) => s.unlock);
    const next = step ? (() => {
      const reqs = [{ label: `사무실 레벨 ${step.office} 이상 (지금 ${stage})`, met: stage >= step.office }];
      const affordable = Object.entries(step.cost).every(([r, v]) => bal[r as ResKey] >= (v ?? 0));
      return { level: lv[k] + 1, unlock: step.unlock, cost: step.cost, reqs, affordable, ready: affordable && reqs.every((r) => r.met) };
    })() : null;
    return [k, { key: k, label: f.label, screen: f.screen, level: lv[k], max: Math.max(1, ...Object.keys(f.steps).map(Number)), unlocked, next }];
  })) as Record<FacKey, { key: FacKey; label: string; screen: string; level: number; max: number; unlocked: string[]; next: null | { level: number; unlock: string; cost: Cost; reqs: Array<{ label: string; met: boolean }>; affordable: boolean; ready: boolean } }>;
}

export function upgradeFacility(repo: Repo, key: string): void {
  if (!FAC_KEYS.includes(key as FacKey)) throw new DomainError(404, '모르는 시설이에요');
  const f = facilityState(repo)[key as FacKey];
  if (!f.next) throw new DomainError(409, '이미 가장 높은 레벨이에요');
  const unmet = f.next.reqs.find((r) => !r.met);
  if (unmet) throw new DomainError(409, `조건이 모자라요 — ${unmet.label}`);
  if (!f.next.affordable) throw new DomainError(409, '자원이 모자라요');
  const levels = { ...facilityLevels(repo), [key]: f.next.level };
  repo.tx(() => {
    repo.exec('INSERT INTO builds (id, kind, target, cost, created_at) VALUES (?, ?, ?, ?, ?)', newId('bd'), 'facility', `fac:${key}:${f.next!.level}`, JSON.stringify(f.next!.cost), now());
    repo.setSetting('space.facilities', levels);
    repo.setSetting('space.rev', (repo.getSetting<number>('space.rev') ?? 0) + 1);
    repo.emit('space_built', `${f.label} 레벨 ${f.next!.level} — ${f.next!.unlock} 기능이 열렸어요`, { data: { kind: 'facility', key, level: f.next!.level } });
  });
}

// ── 열리는 편의 기능 ─────────────────────────────────────
const slug = (t: string): string => t.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
const KIND_LABEL: Record<string, string> = { research: '조사', plan: '기획', blog_draft: '블로그', newsletter: '뉴스레터', sns_draft: 'SNS', image_brief: '이미지 기획', review: '검수' };

/** 회차 보드 Lv2 — 회차 결과물(항목마다 최신 버전)을 마크다운 하나로 */
export function exportCycle(repo: Repo, cycleId: string): { filename: string; text: string } {
  requireFacility(repo, 'board');
  const c = repo.getCycle(cycleId);
  if (!c) throw new DomainError(404, '그 주 일을 찾을 수 없어요');
  const latest = new Map<string, ReturnType<Repo['listArtifacts']>[number]>();
  for (const a of repo.listArtifacts(c.id)) if ((latest.get(a.itemId)?.version ?? 0) <= a.version) latest.set(a.itemId, a);
  const office = repo.getOffice();
  const parts = [`# ${office?.name ?? ''} — ${c.label} 결과물`, '', `내려받은 때: ${new Date().toLocaleString('ko-KR')} · 결과물 ${latest.size}개`, ''];
  for (const a of latest.values()) {
    parts.push(`## ${a.title} (${KIND_LABEL[a.kind] ?? a.kind}${a.meta.platform ? ` · ${a.meta.platform}` : ''} · v${a.version})`, '', a.body.trim(), '');
    if (a.sources.length) parts.push('출처:', ...a.sources.map((s) => `- ${s}`), '');
  }
  return { filename: `${slug(c.label)}-결과물.md`, text: parts.join('\n') };
}

/** AI 연결 Lv2 — 최근 AI 실행 기록(업무 · 화면 요청) */
export function usageLog(repo: Repo, limit = 60) {
  requireFacility(repo, 'power');
  return repo.many<{ at: string; provider: string; cost_usd: number | null; input_tokens: number | null; output_tokens: number | null; estimated: number; task: string | null; kind: string | null; who: string | null; purpose: string | null }>(
    `SELECT u.at, u.provider, u.cost_usd, u.input_tokens, u.output_tokens, u.estimated, t.title AS task, t.kind AS kind, e.name AS who, r.purpose AS purpose
     FROM usage u LEFT JOIN tasks t ON t.id = u.task_id LEFT JOIN employees e ON e.id = u.employee_id LEFT JOIN ai_requests r ON r.id = u.task_id
     ORDER BY u.at DESC LIMIT ?`, limit,
  ).map((u) => ({
    at: u.at, provider: u.provider, who: u.who, what: u.task ?? (u.purpose ? purposeLabel(u.purpose) : '—'), kind: u.kind ? (KIND_LABEL[u.kind] ?? u.kind) : u.purpose ? '화면 요청' : '—',
    tokens: u.input_tokens !== null || u.output_tokens !== null ? (u.input_tokens ?? 0) + (u.output_tokens ?? 0) : null, costUsd: u.cost_usd, estimated: !!u.estimated,
  }));
}

/** 지식 책장 Lv2 — 회사 지식(지금 쓰는 것)을 마크다운 하나로 */
export function exportKnowledge(repo: Repo, list: Array<{ category: string; title: string; body: string; scope: string; status: string }>): { filename: string; text: string } {
  requireFacility(repo, 'knowledge');
  const CAT: Record<string, string> = { principle: '원칙', method: '업무 방식', lesson: '검토된 교훈' };
  const office = repo.getOffice();
  const active = list.filter((k) => k.status === 'active');
  const parts = [`# ${office?.name ?? ''} 회사 지식`, '', `${new Date().toLocaleDateString('ko-KR')} 기준 · ${active.length}건`, ''];
  for (const [c, label] of Object.entries(CAT)) {
    const items = active.filter((k) => k.category === c);
    if (!items.length) continue;
    parts.push(`## ${label}`, '');
    for (const k of items) parts.push(`### ${k.title}`, '', k.body.trim(), ...(k.scope ? ['', `적용 범위: ${k.scope}`] : []), '');
  }
  return { filename: `${slug(office?.name ?? '회사')}-회사-지식.md`, text: parts.join('\n') };
}
