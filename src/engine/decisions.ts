import { stepOfKind } from '../blocks/catalog.ts';
import { stepOfItem } from '../core/roles.ts';
import type { Artifact, Decision } from '../core/types.ts';
import { iga, say } from '../core/voice.ts';
import type { LearningStore } from '../store/learning.ts';
import { DomainError, type Repo } from '../store/repo.ts';
import { resolveMove } from './office-growth.ts';
import { answerAsk } from './asks.ts';
import { decideBudget } from './budget.ts';
import { publishHash, scheduleApproved } from './publishing.ts';
import { riskOf } from '../core/risk.ts';
import type { DecisionRisk } from '../core/types.ts';
import { createTodosFrom } from './todos.ts';

export interface DecideInput {
  action: 'approve' | 'reject' | 'dismiss';
  comment?: string | null;
  /** 수정 요청의 적용 범위 — 이번만 / 앞으로도(결정 47) */
  scope?: 'once' | 'always';
  /** 승인 전에 바꾼 게시 시각 */
  scheduledAt?: string;
}

/**
 * 결정 처리. 게시 확인은 확인 요청 뒤 내용이 바뀌었으면 승인하지 않고 다시 확인받는다.
 * 수정 요청은 문단 코멘트를 모아 원래 담당자에게 같은 결과물의 수정 업무로 보낸다.
 */
export function decide(repo: Repo, learning: LearningStore, id: string, input: DecideInput): Decision {
  const d = repo.getDecision(id);
  if (!d) throw new DomainError(404, '결정 요청을 찾을 수 없어요');
  if (d.status !== 'open') throw new DomainError(409, '이미 처리된 결정이에요');
  // 밖으로 등급은 실제 나갈 원문 · 받는 곳 · 링크 미리보기를 연 뒤에만 승인된다(결정 80)
  if (input.action === 'approve' && decisionRisk(d) === 'external' && typeof d.payload.previewedAt !== 'string') throw new DomainError(409, '원문을 먼저 확인해 주세요');
  if (d.kind === 'publish_confirm') return decidePublish(repo, learning, d, input);
  if (d.kind === 'owner_question') {
    // 답하기 = 승인 + 답 글. 답하지 않으면 지금 자료로 이어가게 한다
    const answer = input.comment?.trim() ?? '';
    if (input.action === 'approve' && !answer) throw new DomainError(400, '답을 적어 주세요');
    repo.tx(() => {
      repo.resolveDecision(d.id, input.action === 'approve' ? 'approved' : 'rejected', answer || null);
      answerAsk(repo, String(d.payload.taskId ?? ''), answer || '대표님이 이번에는 답하지 않았어요 — 지금 자료로 판단해 진행해 주세요.', 'owner');
    });
    return repo.getDecision(id)!;
  }
  if (d.kind === 'budget_continue') {
    decideBudget(repo, d, input.action === 'approve', input.comment ?? null);
    return repo.getDecision(id)!;
  }
  if (d.kind === 'artifact_confirm') return decideArtifact(repo, learning, d, input);
  if (d.kind === 'office_move') {
    resolveMove(repo, d.id, input.action === 'approve', input.comment ?? null);
    return repo.getDecision(id)!;
  }
  // 재연결: 대표가 연결을 마쳤다고 확인하면 그 앱의 실패한 기록을 같은 승인 버전으로 다시 시도한다(연결 ≠ 게시 승인)
  if (d.kind === 'reconnect' && input.action === 'approve') {
    const app = String(d.payload.app ?? '');
    repo.tx(() => {
      repo.resolveDecision(d.id, 'approved', input.comment ?? '연결 확인');
      for (const a of repo.actionsByStatus(['failed']).filter((x) => (x.target ?? x.app) === app)) {
        repo.setActionStatus(a.id, 'scheduled', '다시 연결해서 승인한 그대로 다시 올려요', { scheduledAt: new Date().toISOString() });
      }
    });
    return repo.getDecision(id)!;
  }
  // 그 밖의 결정은 확인 처리만 한다. 종류별 처리는 각 모듈이 맡는다.
  repo.resolveDecision(d.id, input.action === 'approve' ? 'approved' : 'rejected', input.comment ?? null);
  return repo.getDecision(id)!;
}

/** 결정 등급 — 열 때 남긴 값, 없으면(옛 결정) 종류로 계산 */
export function decisionRisk(d: Decision): DecisionRisk {
  const r = d.payload.risk;
  return r === 'internal' || r === 'direction' || r === 'external' ? r : riskOf(d.kind, d.payload);
}

/** 밖으로 등급 — 원문 미리보기를 열었다고 기록한다 */
export function markPreviewed(repo: Repo, id: string): { previewedAt: string } {
  const d = repo.getDecision(id);
  if (!d) throw new DomainError(404, '결정 요청을 찾을 수 없어요');
  if (d.status !== 'open') throw new DomainError(409, '이미 처리된 결정이에요');
  const previewedAt = new Date().toISOString();
  repo.updateDecisionPayload(d.id, { ...d.payload, previewedAt });
  return { previewedAt };
}

/** 승인 함수 — 결재 규칙의 사전 허용에서도 같은 경로를 쓴다. 승인하는 순간 나갈 내용의 지문을 고정한다(결정 80) */
export function approvePublish(repo: Repo, d: Decision, scheduledAt?: string, comment: string | null = null): void {
  repo.tx(() => {
    if (scheduledAt && Number.isNaN(Date.parse(scheduledAt))) throw new DomainError(400, '시각이 올바르지 않아요');
    const at = scheduledAt ? new Date(scheduledAt).toISOString() : undefined;
    const artifact = d.artifactId ? repo.getArtifact(d.artifactId) : null;
    const payload: Record<string, unknown> = { ...d.payload, ...(at ? { scheduledAt: at } : {}) };
    if (artifact) payload.approvedHash = publishHash(repo, { ...d, payload }, artifact);
    repo.updateDecisionPayload(d.id, payload);
    repo.resolveDecision(d.id, 'approved', comment);
    scheduleApproved(repo, { ...d, payload }, at);
  });
}

function decidePublish(repo: Repo, learning: LearningStore, d: Decision, input: DecideInput): Decision {
  const latest = d.itemId ? repo.latestArtifact(d.itemId) : null;
  if (!latest || latest.id !== d.artifactId) {
    repo.resolveDecision(d.id, 'stale', '확인 요청 뒤 내용이 바뀌었어요');
    throw new DomainError(409, '새 버전으로 다시 확인해 주세요 — 확인 요청 뒤 내용이 바뀌었어요');
  }
  if (input.action === 'approve') {
    approvePublish(repo, d, input.scheduledAt, input.comment ?? null);
    return repo.getDecision(d.id)!;
  }
  if (input.action === 'dismiss') {
    repo.resolveDecision(d.id, 'rejected', input.comment?.trim() || '이번에는 게시하지 않아요');
    return repo.getDecision(d.id)!;
  }

  return requestRevision(repo, learning, d, input);
}

/**
 * 결과물 확인(결정 73) — 문서 · 표 · 체크리스트를 대표가 확정 / 수정 요청 / 보류한다.
 * 확정한 실행 계획(킥오프 · 월 계획)이 다음 회차들의 기준이 된다.
 */
function decideArtifact(repo: Repo, learning: LearningStore, d: Decision, input: DecideInput): Decision {
  const latest = d.itemId ? repo.latestArtifact(d.itemId) : null;
  if (!latest || latest.id !== d.artifactId) {
    repo.resolveDecision(d.id, 'stale', '확인 요청 뒤 내용이 바뀌었어요');
    throw new DomainError(409, '새 버전으로 다시 확인해 주세요 — 확인 요청 뒤 내용이 바뀌었어요');
  }
  if (input.action === 'reject') return requestRevision(repo, learning, d, input);
  repo.tx(() => {
    if (input.action === 'dismiss') {
      // 보류 — 이 결과물을 받는 뒤 업무는 아직 시작 전이면 기다린다(결정 80)
      repo.updateDecisionPayload(d.id, { ...d.payload, held: true });
      repo.resolveDecision(d.id, 'rejected', input.comment?.trim() || '보류 — 이번에는 쓰지 않아요');
      return;
    }
    repo.resolveDecision(d.id, 'approved', input.comment ?? null);
    // 실행 계획의 대표 할 일 · 체크리스트의 [대표] 항목 → 내 할 일(P2 결정 3)
    createTodosFrom(repo, latest);
    const def = stepOfKind(latest.kind);
    if (def?.step.plan) {
      const weeks = (latest.meta.weeks as Array<{ week: number }> | undefined) ?? [];
      repo.emit('plan_confirmed', `실행 계획 확정 — ${weeks.length}주 계획`, { subjectId: latest.id, data: { artifactId: latest.id, weeks: weeks.length } });
      const manager = repo.employeeByRole('manager');
      if (manager) {
        repo.message(manager.id, null, say(manager, {
          haeyo: `계획 확정해 주셔서 고마워요. 다음 주부터 1주차 계획대로 일할게요. 대표님 할 일은 '내 할 일'에 넣어 뒀어요.`,
          hamnida: `계획을 확정해 주셔서 감사합니다. 다음 주부터 1주차 계획대로 진행하겠습니다. 대표님 할 일은 '내 할 일'에 정리해 두었습니다.`,
          banmal: `계획 확정 고마워! 다음 주부터 1주차 계획대로 갈게. 대표 할 일은 '내 할 일'에 넣어 뒀어.`,
        }), { cycleId: d.cycleId });
      }
    }
  });
  return repo.getDecision(d.id)!;
}

/** 블록 결과물이 나오면 대표 확인을 연다(단계에 confirm: 'owner'가 있을 때) */
export function openArtifactConfirm(repo: Repo, artifact: Artifact): Decision | null {
  const def = stepOfKind(artifact.kind);
  if (def?.step.confirm !== 'owner') return null;
  return repo.openDecision({
    kind: 'artifact_confirm', cycleId: artifact.cycleId, itemId: artifact.itemId, artifactId: artifact.id, title: artifact.title,
    payload: { kind: artifact.kind, block: def.block.id, blockName: def.block.name, plan: def.step.plan === true, sensitive: def.block.sensitive === true, reason: def.block.purpose },
  });
}

/** 수정 요청: 문단 코멘트 + 전체 코멘트를 하나의 요청으로 모아 원래 담당자에게 같은 결과물의 수정 업무로 보낸다(게시 확인 · 결과물 확인 공용) */
function requestRevision(repo: Repo, learning: LearningStore, d: Decision, input: DecideInput): Decision {
  const comments = learning.comments(d.id).filter((c) => !c.sent_at);
  const overall = input.comment?.trim() ?? '';
  if (!overall && !comments.length) throw new DomainError(400, '무엇을 고칠지 적어 주세요');
  const lines = [
    ...(overall ? [overall] : []),
    ...comments.map((c) => `문단 ${Number(c.anchor) + 1}${c.quote ? ` (“${c.quote.slice(0, 60)}”)` : ''}: ${c.text}`),
  ];
  const text = lines.join('\n');
  const scope = input.scope === 'always' ? 'always' : 'once';
  const art = repo.getArtifact(d.artifactId!);
  const made = art ? repo.getTask(art.taskId) : null;
  // 편집자 교정본에 대한 수정 요청은 원래 글쓴이(작가)에게 간다 — 배운 것도 작가에게 쌓인다
  const source = made?.kind === 'edit' ? (repo.listTasks(made.cycleId).find((t) => t.itemId === made.itemId && t.kind === 'blog_draft') ?? made) : made;
  if (!art || !source) throw new DomainError(500, '원래 결과물을 찾을 수 없어요');
  const author = repo.getEmployee(source.assigneeId);

  repo.tx(() => {
    repo.resolveDecision(d.id, 'rejected', text, scope);
    learning.markCommentsSent(d.id);
    const fb = learning.addFeedback({ employeeId: source.assigneeId, artifactId: art.id, kind: 'revision', text, scope });
    repo.emit('feedback_recorded', `${author?.name ?? '직원'}에게 수정 요청(${scope === 'always' ? '앞으로도' : '이번만'})`, {
      actorId: source.assigneeId, subjectId: fb.id, data: { artifactId: art.id, scope },
    });
    // 앞으로도 → 확정 규칙(배운 것), 이번만 → 규칙으로 저장하지 않는 기록(결정 49 '이번만' 카드)
    const ruleText = overall || comments.map((c) => c.text).join(' / ');
    const rule = learning.addRule({ employeeId: source.assigneeId, text: ruleText, status: scope === 'always' ? 'confirmed' : 'once', source: { kind: 'revision', feedbackIds: [fb.id], artifactId: art.id, decisionId: d.id } });
    repo.emit('rule_changed', scope === 'always' ? `${iga(author?.name ?? '직원')} 배웠어요: ${ruleText}` : `${author?.name ?? '직원'}: 이번만 반영 — ${ruleText}`, {
      actorId: source.assigneeId, subjectId: rule.id, data: { status: rule.status },
    });
    if (author) {
      repo.message(author.id, null, say(author, {
        haeyo: scope === 'always' ? '알겠어요. 이번 것도 고치고, 앞으로도 그렇게 할게요.' : '알겠어요. 이번 것만 고칠게요.',
        hamnida: scope === 'always' ? '알겠습니다. 이번 결과물을 고치고 앞으로도 반영하겠습니다.' : '알겠습니다. 이번 결과물만 고치겠습니다.',
        banmal: scope === 'always' ? '알겠어. 이번 것도 고치고 앞으로도 그렇게 할게.' : '알겠어. 이번 것만 고칠게.',
      }), { cycleId: d.cycleId });
    }
    const siblings = repo.listTasks(art.cycleId).filter((t) => t.itemId === d.itemId);
    const original = repo.listTasks(art.cycleId).find((t) => t.id === source.id) ?? source;
    const cycle = repo.getCycle(art.cycleId);
    if (cycle && cycle.status !== 'running') repo.reopenCycle(cycle.id);
    repo.createTask({
      cycleId: art.cycleId, step: `${stepOfItem(d.itemId!)}-r${siblings.length + 1}`, kind: source.kind,
      title: `${art.title.slice(0, 40)} 수정`, assigneeId: source.assigneeId, dependsOn: [], itemId: d.itemId!, feedback: text,
      meta: {
        ...(art.meta.platform && source.kind === 'sns_draft' ? { platform: art.meta.platform } : {}),
        ...(typeof source.meta.block === 'string' ? { block: source.meta.block, weekGoal: source.meta.weekGoal ?? null } : {}),
        revisionOf: original.id, decisionId: d.id,
      },
    });
  });
  return repo.getDecision(d.id)!;
}
