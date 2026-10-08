// P2 업무 블록 화면의 서버 쪽 — 문서함 · 내려받기 · 화면이 쓰는 표(/api/meta). 계약: docs/product/plans/p2-blocks-plan.md §2
import type { ServerResponse } from 'node:http';
import { RISK_LABEL } from '../core/risk.ts';
import { BLOCKS, STAGE_LABEL, blockById, blockSummary, isBlockKind, shapeOfKind, stepOfKind } from '../blocks/catalog.ts';
import { ALL_ROLES, CHANNEL_LABEL, ROLE_DESC, ROLE_KIN, ROLE_LABEL, WEEKLY_STEPS, roleTitle } from '../core/roles.ts';
import { FINISHED_STATUSES, STATUS_DETAIL, STATUS_LABEL } from '../core/task-state.ts';
import type { Artifact, ContentKind, DecisionKind, Role } from '../core/types.ts';
import { DomainError, type Repo } from '../store/repo.ts';

export type DocStatus = 'confirmed' | 'waiting' | 'revising' | 'draft';
export interface DocItem {
  itemId: string; artifactId: string; title: string; version: number; shape: string; status: DocStatus;
  author: string | null; cycleLabel: string | null; updatedAt: string; confirmedAt: string | null;
}

/** 결과물 모양 — 옛 결과물(모양 저장 전)은 업무 종류로 */
export const shapeOf = (a: Artifact): string => (typeof a.meta.shape === 'string' ? a.meta.shape : shapeOfKind(a.kind));

/** 문서함 항목 — 확정 · 확인 대기 · 고치는 중 · 확인 없는 블록(보류한 것 포함) */
export function docItem(repo: Repo, a: Artifact): DocItem {
  const decisions = repo.many<{ status: string; resolved_at: string | null }>(
    "SELECT status, resolved_at FROM decisions WHERE item_id = ? AND kind = 'artifact_confirm' ORDER BY created_at", a.itemId,
  );
  const revising = repo.many<{ status: string }>('SELECT status FROM tasks WHERE item_id = ? AND feedback IS NOT NULL', a.itemId)
    .some((t) => !FINISHED_STATUSES.has(t.status as never));
  const approved = decisions.filter((d) => d.status === 'approved').at(-1);
  const status: DocStatus = revising ? 'revising' : decisions.some((d) => d.status === 'open') ? 'waiting' : approved ? 'confirmed' : 'draft';
  const task = repo.getTask(a.taskId);
  return {
    itemId: a.itemId, artifactId: a.id, title: a.title, version: a.version, shape: shapeOf(a), status,
    author: task ? repo.getEmployee(task.assigneeId)?.name ?? null : null, cycleLabel: repo.getCycle(a.cycleId)?.label ?? null,
    updatedAt: a.createdAt, confirmedAt: status === 'confirmed' ? approved?.resolved_at ?? null : null,
  };
}

/** 업무 블록 결과물의 가장 새 버전들 — 콘텐츠 운영 결과물은 넣지 않는다(콘텐츠 화면에 있다) */
function latestBlockArtifacts(repo: Repo): Artifact[] {
  return repo.many<{ id: string }>(
    `SELECT a.id FROM artifacts a WHERE a.kind LIKE '%.%'
       AND a.version = (SELECT MAX(b.version) FROM artifacts b WHERE b.item_id = a.item_id) ORDER BY a.created_at DESC`,
  ).map((r) => repo.getArtifact(r.id)).filter((a): a is Artifact => a !== null && isBlockKind(a.kind));
}

/** GET /api/documents — 블록별 묶음(카탈로그 순서), 묶음 안은 새것부터 */
export function documentsView(repo: Repo): { groups: Array<{ block: string; blockName: string; items: DocItem[] }> } {
  const by = new Map<string, DocItem[]>();
  for (const a of latestBlockArtifacts(repo)) {
    const block = stepOfKind(a.kind)?.block.id ?? a.kind.split('.')[0]!;
    by.set(block, [...(by.get(block) ?? []), docItem(repo, a)]);
  }
  const order = BLOCKS.map((b) => b.id);
  return {
    groups: [...by.entries()]
      .sort(([x], [y]) => (order.indexOf(x) + 1 || 999) - (order.indexOf(y) + 1 || 999))
      .map(([block, items]) => ({ block, blockName: blockById(block)?.name ?? block, items })),
  };
}

/** GET /api/documents/:itemId — 문서 하나(가장 새 버전) · 버전들 · 확인 기록 */
export function documentDetail(repo: Repo, itemId: string) {
  const artifact = repo.latestArtifact(itemId);
  if (!artifact || !isBlockKind(artifact.kind)) throw new DomainError(404, '문서를 찾을 수 없어요');
  return {
    item: docItem(repo, artifact),
    artifact: { ...artifact, meta: { ...artifact.meta, shape: shapeOf(artifact) } },
    versions: repo.many<{ id: string; version: number; created_at: string }>('SELECT id, version, created_at FROM artifacts WHERE item_id = ? ORDER BY version', itemId)
      .map((v) => ({ id: v.id, version: v.version, createdAt: v.created_at })),
    decisions: repo.many<{ id: string; status: string; comment: string | null; scope: string | null }>(
      "SELECT id, status, comment, scope FROM decisions WHERE item_id = ? AND kind = 'artifact_confirm' ORDER BY created_at", itemId,
    ),
  };
}

/** 결과물 한 개 → 마크다운 파일 내용 */
export function artifactMarkdown(a: Artifact): string {
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const parts = [`# ${a.title}`, '', a.body.trim()];
  const expert = list(a.meta.expertCheck);
  if (expert.length) parts.push('', '## 전문가 확인 필요', ...expert.map((x) => `- ${x}`));
  if (a.sources.length) parts.push('', '## 출처', ...a.sources.map((x) => `- ${x}`));
  return `${parts.join('\n')}\n`;
}

/** GET /api/artifacts/:id/download — 문서 한 개 내려받기(.md)는 잠그지 않는다(P2 결정 7) */
export function sendArtifactDownload(repo: Repo, id: string, res: ServerResponse): undefined {
  const a = repo.getArtifact(id);
  if (!a) throw new DomainError(404, '결과물을 찾을 수 없어요');
  const name = `${a.title.replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 80) || '문서'} · v${a.version}.md`;
  res.writeHead(200, {
    'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store',
    'content-disposition': `attachment; filename="document-v${a.version}.md"; filename*=UTF-8''${encodeURIComponent(name)}`,
  });
  res.end(artifactMarkdown(a));
  return undefined;
}

/** 콘텐츠 운영 업무 종류 이름(화면 content.js · 회차 보드와 같은 말) */
const CONTENT_KIND_LABEL: Record<ContentKind, string> = {
  research: '조사', plan: '기획', blog_draft: '블로그', newsletter: '뉴스레터', sns_draft: 'SNS', image_brief: '이미지', review: '검수',
  seo_keywords: '검색 키워드', edit: '교정 · 교열', video_script: '숏폼 대본', promo_plan: '배포 계획', answer: '질문에 답하기',
};
export const DECISION_KIND_LABEL: Record<DecisionKind, string> = {
  artifact_confirm: '결과물 확인', publish_confirm: '게시 확인', reconnect: '다시 연결', rule_confirm: '배운 것 확인',
  knowledge_promote: '회사 지식 올리기', hire_proposal: '채용 제안', promotion: '승급', office_move: '사무실 레벨 올리기',
  owner_question: '직원의 질문', budget_continue: '한도 넘겨 계속하기',
};

/** GET /api/meta — 화면이 복사해 쓰던 표를 한 곳에서(계약 5) */
export function metaView() {
  const kinds: Record<string, { label: string; block: string | null }> = {};
  for (const s of WEEKLY_STEPS) kinds[s.kind] = { label: CONTENT_KIND_LABEL[s.kind as ContentKind] ?? s.title, block: 'content_ops' };
  for (const b of BLOCKS) for (const s of b.steps) kinds[`${b.id}.${s.step}`] = { label: s.title, block: b.id };
  return {
    roles: Object.fromEntries(ALL_ROLES.map((r) => [r, { label: ROLE_LABEL[r], desc: ROLE_DESC[r], title: roleTitle(r), kin: (ROLE_KIN[r] ?? null) as Role | null }])) as Record<Role, { label: string; desc: string; title: string; kin: Role | null }>,
    kinds,
    blocks: BLOCKS.map(blockSummary),
    decisionKinds: DECISION_KIND_LABEL,
    risks: RISK_LABEL,
    platforms: CHANNEL_LABEL,
    statuses: STATUS_LABEL,
    statusDetails: STATUS_DETAIL,
    stages: STAGE_LABEL,
    shapes: { doc: '문서', table: '표', checklist: '체크리스트', post: '게시물' },
    docStatuses: { confirmed: '확정', waiting: '확인 대기', revising: '고치는 중', draft: '확인 없음' } satisfies Record<DocStatus, string>,
    todoSources: { plan: '실행 계획', checklist: '체크리스트' },
  };
}
