// 사업 설계도(결정 73) — 매니저가 쓰고 대표가 확인 · 수정한다. 버전마다 한 줄, 확정은 하나.
import { FormatError } from '../ai/provider.ts';
import { BIZ_STAGES, STAGE_DEFAULT_BLOCKS, WORK_BLOCK_IDS, blockById, blockRoles, stepOfKind } from '../blocks/catalog.ts';
import { ROLE_LABEL, STAFF_ROLES } from '../core/roles.ts';
import type { Artifact, BizStage, Blueprint, BlueprintData, Decision, Role } from '../core/types.ts';
import { type Repo, newId, now } from '../store/repo.ts';

interface Row { id: string; version: number; status: string; data: string; source: string; request_id: string | null; created_at: string; confirmed_at: string | null }
const toBlueprint = (r: Row): Blueprint => ({
  id: r.id, version: r.version, status: r.status as Blueprint['status'], data: JSON.parse(r.data) as BlueprintData,
  source: r.source as Blueprint['source'], requestId: r.request_id, createdAt: r.created_at, confirmedAt: r.confirmed_at,
});

const str = (v: unknown, max = 400): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strs = (v: unknown, n: number, max = 200): string[] => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);
const objs = (v: unknown): Array<Record<string, unknown>> => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []);

/**
 * AI가 쓴 설계도를 받아 고친다(공간 설계도와 같은 방식). 카탈로그에 없는 블록은 '새 블록 제안'으로,
 * 목표는 3개까지, 채용 순서는 고른 블록이 필요로 하는 직무만(없으면 더하고, 일이 없는 직무는 뺀다). 요약 · 목표가 없으면 지어내지 않고 실패.
 */
export function normalizeBlueprint(raw: Record<string, unknown>): BlueprintData {
  const summary = str(raw.summary, 600);
  if (!summary) throw new FormatError('설계도에 사업 요약이 없어요');
  const stage: BizStage = BIZ_STAGES.includes(raw.stage as BizStage) ? (raw.stage as BizStage) : 'idea';
  const goals = objs(raw.goals).map((g) => ({ text: str(g.text, 160), check: str(g.check, 160) })).filter((g) => g.text).slice(0, 3);
  if (!goals.length) throw new FormatError('설계도에 이번 달 목표가 없어요');
  const ideas = strs(raw.ideas, 5);
  const blocks: BlueprintData['blocks'] = [];
  for (const b of objs(raw.blocks)) {
    const id = str(b.id, 40);
    if (!WORK_BLOCK_IDS.includes(id)) {
      if (id) ideas.push(`${id}${str(b.why) ? ` — ${str(b.why)}` : ''}`);
      continue;
    }
    if (blocks.some((x) => x.id === id)) continue;
    blocks.push({ id, why: str(b.why, 200), ...(b.config && typeof b.config === 'object' ? { config: b.config as Record<string, unknown> } : {}) });
  }
  if (!blocks.length) for (const id of STAGE_DEFAULT_BLOCKS[stage]) blocks.push({ id, why: `${blockById(id)!.name} — 지금 단계의 기본 블록` });
  const hiring: BlueprintData['hiring'] = [];
  for (const h of objs(raw.hiring)) {
    const role = h.role as Role;
    if (!STAFF_ROLES.includes(role) || hiring.some((x) => x.role === role)) continue;
    hiring.push({ role, why: str(h.why, 200), when: str(h.when, 40) || '필요할 때' });
  }
  // 채용 순서는 고른 블록이 실제로 필요로 하는 직무만 — 일이 없는 직원을 뽑지 않게
  const needed = new Set(blocks.flatMap((b) => blockRoles(blockById(b.id)!)));
  for (let i = hiring.length - 1; i >= 0; i--) if (!needed.has(hiring[i]!.role)) hiring.splice(i, 1);
  for (const b of blocks) {
    for (const role of blockRoles(blockById(b.id)!)) {
      if (role === 'manager' || hiring.some((x) => x.role === role)) continue;
      hiring.push({ role, why: `${blockById(b.id)!.name}을 맡아요`, when: '필요할 때' });
    }
  }
  const split = (raw.split && typeof raw.split === 'object' ? raw.split : {}) as Record<string, unknown>;
  return {
    summary, stage, stageWhy: str(raw.stageWhy, 300), customer: str(raw.customer, 300) || '아직 정하지 않음 (가정)',
    goals, blocks: blocks.slice(0, 6), hiring: hiring.slice(0, 6),
    split: { owner: strs(split.owner, 8), team: strs(split.team, 8) },
    assumptions: strs(raw.assumptions, 8), ideas: [...new Set(ideas)].slice(0, 5),
  };
}

export function listBlueprints(repo: Repo): Blueprint[] {
  return repo.many<Row>('SELECT * FROM blueprints ORDER BY version DESC').map(toBlueprint);
}
export function confirmedBlueprint(repo: Repo): Blueprint | null {
  const r = repo.one<Row>("SELECT * FROM blueprints WHERE status = 'confirmed' ORDER BY version DESC LIMIT 1");
  return r ? toBlueprint(r) : null;
}
/** 확정 전의 가장 새 초안 */
export function draftBlueprint(repo: Repo): Blueprint | null {
  const r = repo.one<Row>("SELECT * FROM blueprints WHERE status = 'draft' ORDER BY version DESC LIMIT 1");
  return r ? toBlueprint(r) : null;
}

/** 새 초안 — 앞선 초안은 '대체됨'. 확정본은 그대로 둔다 */
export function saveDraft(repo: Repo, data: BlueprintData, source: Blueprint['source'], requestId: string | null = null): Blueprint {
  return repo.tx(() => {
    const version = (repo.one<{ v: number | null }>('SELECT MAX(version) AS v FROM blueprints')?.v ?? 0) + 1;
    repo.exec("UPDATE blueprints SET status = 'superseded' WHERE status = 'draft'");
    const id = newId('bp');
    repo.exec('INSERT INTO blueprints (id, version, status, data, source, request_id, created_at, confirmed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, version, 'draft', JSON.stringify(data), source, requestId, now(), null);
    repo.emit('blueprint_saved', `사업 설계도 v${version} ${source === 'owner' ? '— 대표가 고침' : '초안'}`, { subjectId: id, data: { version, source } });
    return toBlueprint(repo.one<Row>('SELECT * FROM blueprints WHERE id = ?', id)!);
  });
}

/** 초안 확정 — 이전 확정본은 '대체됨'. 확정본은 직원 프롬프트 · 채용 순서 · 회차 조립의 기준이 된다 */
export function confirmDraft(repo: Repo, id: string): Blueprint {
  return repo.tx(() => {
    repo.exec("UPDATE blueprints SET status = 'superseded' WHERE status = 'confirmed'");
    repo.exec("UPDATE blueprints SET status = 'confirmed', confirmed_at = ? WHERE id = ?", now(), id);
    const bp = toBlueprint(repo.one<Row>('SELECT * FROM blueprints WHERE id = ?', id)!);
    repo.setSetting('hiring.roadmap', bp.data.hiring);
    repo.emit('blueprint_confirmed', `사업 설계도 v${bp.version} 확정 — 블록 ${bp.data.blocks.length}개`, { subjectId: id, data: { version: bp.version, blocks: bp.data.blocks.map((b) => b.id) } });
    return bp;
  });
}

/**
 * 결정 73 이전의 사무실(콘텐츠 기획 회의를 마친 곳) — 설계도 v1을 '콘텐츠 운영' 블록 하나로 합성해 그대로 돌게 한다.
 * 이 설계도는 킥오프 없이 지금까지처럼 콘텐츠 운영 회차를 연다.
 */
export function ensureLegacyBlueprint(repo: Repo): void {
  if (repo.one('SELECT 1 FROM blueprints LIMIT 1')) return;
  const office = repo.getOffice();
  const project = repo.getProject();
  if (!office || !project || repo.getSetting<boolean>('onboarding.briefDone') !== true) return;
  const b = project.brief;
  const roadmap = repo.getSetting<BlueprintData['hiring']>('hiring.roadmap') ?? [];
  const data: BlueprintData = {
    summary: office.description.slice(0, 600), stage: 'operate', stageWhy: '이미 매주 콘텐츠를 운영하는 사무실이에요', customer: b.audience || '아직 정하지 않음 (가정)',
    goals: [{ text: b.goal || '주간 콘텐츠 운영', check: '매주 게시 확인' }],
    blocks: [{ id: 'content_ops', why: '지금까지의 주간 콘텐츠 운영', config: { channels: b.channels, cadence: b.cadence } }],
    hiring: roadmap.filter((h) => STAFF_ROLES.includes(h.role)),
    split: { owner: ['게시 전 확인 · 결정'], team: ['조사 · 기획 · 글 · 이미지 · 검수'] }, assumptions: b.assumptions ?? [], ideas: [],
  };
  repo.exec('INSERT INTO blueprints (id, version, status, data, source, request_id, created_at, confirmed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', newId('bp'), 1, 'confirmed', JSON.stringify(data), 'legacy', null, now(), now());
}

export interface PlanWeek { week: number; goal: string; blocks: string[] }
export interface CurrentPlan { artifact: Artifact; decision: Decision; weeks: PlanWeek[]; ownerTasks: string[]; confirmedAt: string }

/** 이번 달 계획 = 대표가 확인(승인)한 가장 최근의 킥오프 · 월 계획 결과물 */
export function currentPlan(repo: Repo): CurrentPlan | null {
  const rows = repo.many<{ id: string }>(
    `SELECT d.id FROM decisions d JOIN artifacts a ON a.id = d.artifact_id
     WHERE d.kind = 'artifact_confirm' AND d.status = 'approved' AND (a.kind = 'kickoff.plan' OR a.kind = 'monthly_plan.plan')
     ORDER BY d.resolved_at DESC LIMIT 1`,
  );
  const decision = rows[0] ? repo.getDecision(rows[0].id) : null;
  const artifact = decision?.artifactId ? repo.getArtifact(decision.artifactId) : null;
  if (!decision || !artifact) return null;
  return { artifact, decision, weeks: (artifact.meta.weeks as PlanWeek[] | undefined) ?? [], ownerTasks: (artifact.meta.ownerTasks as string[] | undefined) ?? [], confirmedAt: decision.resolvedAt ?? decision.createdAt };
}

/** 확인을 기다리는 계획(킥오프 · 월 계획) — 있으면 새 회차를 열지 않는다 */
export function pendingPlanDecision(repo: Repo): Decision | null {
  return repo.openDecisions().find((d) => d.kind === 'artifact_confirm' && !!stepOfKind(String(d.payload.kind ?? ''))?.step.plan) ?? null;
}

/** 직원 프롬프트에 넣는 설계도 요약 */
export function blueprintLines(bp: BlueprintData, plan: CurrentPlan | null): string[] {
  const lines = [
    `사업 설계도: ${bp.summary}`,
    `지금 단계: ${({ idea: '아이디어', prep: '준비 중', launch: '막 출시', operate: '운영 중' } as const)[bp.stage]}${bp.stageWhy ? ` — ${bp.stageWhy}` : ''}. 고객: ${bp.customer}.`,
    `이번 달 목표: ${bp.goals.map((g) => g.text).join(' / ')}.`,
    `대표가 직접 하는 일: ${bp.split.owner.join(', ') || '확인 · 결정'}. AI 팀이 하는 일: ${bp.split.team.join(', ') || '조사 · 계획 · 준비'}.`,
  ];
  if (bp.assumptions.length) lines.push(`아직 검증 전인 가정: ${bp.assumptions.join(' / ')}.`);
  if (plan?.ownerTasks.length) lines.push(`이번 달 대표 할 일: ${plan.ownerTasks.join(' / ')}.`);
  return lines;
}

/** 설계도의 블록을 직무 이름과 함께 — 화면 · 채용 안내 */
export function hiringNote(bp: BlueprintData, hired: Set<Role>): string[] {
  return bp.hiring.filter((h) => !hired.has(h.role)).map((h) => `${ROLE_LABEL[h.role]}(${h.when})`);
}
