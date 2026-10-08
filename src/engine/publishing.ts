import { createHash } from 'node:crypto';
import { CHANNEL_LABEL } from '../core/roles.ts';
import type { Artifact, Channel, Cycle, Decision, ExternalAction } from '../core/types.ts';
import { DomainError, type Repo } from '../store/repo.ts';

/** 게시 시간표 — day: 회차 기준 주의 1=월 … 7=일(MVP 기본값, mvp-dev-plan §3) */
export interface Slot { day: number; time: string }
export type Timetable = Record<Channel, Slot[]>;
export const DEFAULT_TIMETABLE: Timetable = {
  blog: [{ day: 2, time: '09:00' }],
  threads: [{ day: 1, time: '12:00' }, { day: 3, time: '12:00' }, { day: 5, time: '12:00' }],
  linkedin: [{ day: 2, time: '08:30' }, { day: 4, time: '08:30' }, { day: 6, time: '08:30' }],
};

export type ApprovalMode = 'per_post' | 'weekly';
export interface ApprovalPolicy { mode: ApprovalMode; autoPlatforms: Channel[] }
export const DEFAULT_POLICY: ApprovalPolicy = { mode: 'per_post', autoPlatforms: [] };

export function timetable(repo: Repo): Timetable {
  return { ...DEFAULT_TIMETABLE, ...(repo.getSetting<Partial<Timetable>>('publish.timetable') ?? {}) };
}
export function approvalPolicy(repo: Repo): ApprovalPolicy {
  return { ...DEFAULT_POLICY, ...(repo.getSetting<Partial<ApprovalPolicy>>('approval.policy') ?? {}) };
}
/** 실제 게시 여부. 기본은 드라이런(연결을 마치고 대표가 켜야 실제로 게시) */
export function liveMode(repo: Repo): boolean {
  return repo.getSetting<boolean>('publish.live') === true;
}

/** 블로그 채널의 실제 대상(ghost·wordpress) — 설정값, 없으면 연결된 것 */
export function blogTarget(repo: Repo): string | null {
  const chosen = repo.getSetting<string>('publish.blogTarget');
  if (chosen === 'ghost' || chosen === 'wordpress') return chosen;
  const connected = repo.many<{ app: string }>("SELECT app FROM connections WHERE app IN ('ghost', 'wordpress') AND status = 'connected' ORDER BY app");
  return connected[0]?.app ?? null;
}
export function targetFor(repo: Repo, platform: Channel): string | null {
  return platform === 'blog' ? blogTarget(repo) : platform;
}

function weekStartOf(cycle: Cycle): Date {
  if (cycle.weekStart) return new Date(cycle.weekStart);
  const d = new Date(cycle.startedAt);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** 시간표 칸의 시각. 이미 지났으면(30분 여유) 다음 날 같은 시각으로 미룬다. */
export function proposeTime(repo: Repo, cycle: Cycle, platform: Channel, index: number, now = new Date()): string {
  const slots = timetable(repo)[platform];
  const slot = slots[Math.min(index, slots.length - 1)] ?? { day: 1, time: '09:00' };
  const [h, m] = slot.time.split(':').map(Number);
  const d = weekStartOf(cycle);
  d.setDate(d.getDate() + slot.day - 1 + Math.max(0, index - (slots.length - 1)));
  d.setHours(h ?? 9, m ?? 0, 0, 0);
  const min = now.getTime() + 30 * 60_000;
  if (d.getTime() < min) {
    // 이 주의 칸이 지났으면 오늘(또는 내일)부터 같은 시각으로, 같은 플랫폼 게시물은 하루씩 띄운다
    d.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
    if (d.getTime() < min) d.setDate(d.getDate() + 1);
    d.setDate(d.getDate() + index);
  }
  // 같은 플랫폼 게시물은 순서대로, 겹치지 않게(앞 게시물보다 늦게)
  if (index > 0) {
    const prev = new Date(proposeTime(repo, cycle, platform, index - 1, now));
    while (d.getTime() <= prev.getTime()) d.setDate(d.getDate() + 1);
  }
  return d.toISOString();
}

const APP_NAME: Record<string, string> = { ghost: 'Ghost', wordpress: 'WordPress', threads: 'Threads', linkedin: 'LinkedIn' };

/** 게시 경고 종류 — 화면은 문장이 아니라 이 값으로 꼬리표를 고른다(warningKeys, 문장과 같은 순서) */
export type PublishWarningKey = 'no_connection' | 'no_thumbnail' | 'public_url' | 'dry_run';

/** 게시 전 경고 — 승인 버튼 문구가 결과를 말하도록(결정 46). 문장(warnings)과 종류 값(warningKeys)을 같은 순서로 */
export function publishWarnings(repo: Repo, artifact: Artifact, platform: Channel): { warnings: string[]; warningKeys: PublishWarningKey[] } {
  const w: Array<[PublishWarningKey, string]> = [];
  const target = targetFor(repo, platform);
  const conn = target ? repo.one<{ status: string }>('SELECT status FROM connections WHERE app = ?', target) : undefined;
  if (!target) w.push(['no_connection', '설정에서 블로그(Ghost · WordPress)를 연결해 주세요 — 아직 올릴 곳이 없어요']);
  else if (conn?.status !== 'connected') w.push(['no_connection', `${APP_NAME[target] ?? target} 연결이 아직 없어요 — 승인해도 연결 전까지 게시되지 않아요`]);
  if (platform === 'blog' && !(artifact.meta.mediaIds ?? []).length) w.push(['no_thumbnail', '썸네일 없이 게시돼요']);
  if (platform === 'threads' && (artifact.meta.mediaIds ?? []).length) w.push(['public_url', 'Threads 이미지는 공개 주소가 있어야 올라가요(직접 띄운 서버에서만)']);
  if (!liveMode(repo)) w.push(['dry_run', '지금은 연습 게시예요 — 실제로 올리지 않고 기록만 남겨요']);
  return { warnings: w.map(([, text]) => text), warningKeys: w.map(([key]) => key) };
}

/**
 * 게시 확인 요청을 연다. 결재 규칙의 '사전 허용' 플랫폼은 연습 게시(드라이런)일 때만 바로 승인한다(대표가 켠 경우만).
 * 실제 게시가 켜져 있으면 사전 허용이어도 결정함에서 원문을 확인한 뒤 승인해야 한다 — 밖으로 나가는 일은 영구 허용하지 않는다(결정 80).
 */
export function openPublishDecision(repo: Repo, artifact: Artifact, reviewArtifactId: string | null, index: number, approveFn: (d: Decision) => void, keepTime?: string): Decision | null {
  const platform = artifact.meta.platform;
  if (!platform) return null;
  const cycle = repo.getCycle(artifact.cycleId);
  if (!cycle) return null;
  const project = repo.getProject();
  if (project && !project.brief.channels.includes(platform)) return null;
  // 수정본은 원래 시각을 지키되, 이미 지났으면 시간표에서 다시 고른다
  const scheduledAt = keepTime && Date.parse(keepTime) > Date.now() + 30 * 60_000 ? keepTime : proposeTime(repo, cycle, platform, index);
  const d = repo.openDecision({
    kind: 'publish_confirm', cycleId: artifact.cycleId, itemId: artifact.itemId, artifactId: artifact.id, reviewArtifactId,
    title: `${artifact.title} v${artifact.version} → ${CHANNEL_LABEL[platform]}`,
    payload: { platform, target: targetFor(repo, platform), scheduledAt, index, ...publishWarnings(repo, artifact, platform) },
  });
  if (!liveMode(repo) && approvalPolicy(repo).autoPlatforms.includes(platform)) {
    // 연습 게시로만 자동 승인했다는 표시 — 보내기 전에 실제 게시가 켜지면 보내지 않고 다시 묻는다(blockIfChanged)
    const payload = { ...d.payload, autoDryRun: true };
    repo.updateDecisionPayload(d.id, payload);
    approveFn({ ...d, payload });
  }
  return d;
}

/** 검수가 끝나면 게시할 결과물(블로그·SNS 게시물)마다 확인 요청을 연다. */
export function openForCycle(repo: Repo, cycleId: string, reviewArtifactId: string | null, approveFn: (d: Decision) => void): number {
  const latest = new Map<string, Artifact>();
  for (const a of repo.listArtifacts(cycleId)) if (a.meta.platform) latest.set(a.itemId, a);
  const perPlatform: Record<string, number> = {};
  let n = 0;
  for (const a of latest.values()) {
    const p = a.meta.platform!;
    const index = perPlatform[p] ?? 0;
    perPlatform[p] = index + 1;
    if (openPublishDecision(repo, a, reviewArtifactId, index, approveFn)) n++;
  }
  return n;
}

/** 실제로 보낼 대상(블로그면 연결된 ghost · wordpress, 없으면 'blog') */
export function sendTarget(repo: Repo, platform: Channel): string {
  return targetFor(repo, platform) ?? (platform === 'blog' ? 'blog' : platform);
}

/**
 * 승인한 내용의 지문(결정 80) — 나갈 본문 · 제목 · 받는 곳 · 시각 · 이미지.
 * 승인하는 순간 남기고, 실행기는 보내기 직전 다시 계산해 다르면 보내지 않는다.
 */
export function contentHash(input: { title: string; body: string; target: string; scheduledAt: string | null; mediaIds: string[] }): string {
  return createHash('sha256').update(JSON.stringify([input.title, input.body, input.target, input.scheduledAt, input.mediaIds])).digest('hex');
}

/** 지금 상태로 계산한 게시 지문 — 승인 때와 보내기 직전에 같은 방법으로 */
export function publishHash(repo: Repo, d: Decision, artifact: Artifact): string {
  const platform = d.payload.platform as Channel;
  return contentHash({
    title: artifact.title, body: artifact.body, target: sendTarget(repo, platform),
    scheduledAt: typeof d.payload.scheduledAt === 'string' ? d.payload.scheduledAt : null, mediaIds: artifact.meta.mediaIds ?? [],
  });
}

/** 다시 승인할 수 있는 끝난 기록 — 시각 변경으로 취소했거나, 승인 뒤 내용이 바뀌어 보내지 않은 것 */
const REDO: ReadonlySet<ExternalAction['status']> = new Set(['cancelled', 'blocked']);

/**
 * 승인 → 예약된 게시 기록. 같은 버전·같은 대상은 한 번만(중복 방지 키).
 * 그 버전 · 대상의 기록이 모두 취소 · 막힘이면(시각 변경 · 내용 변경 뒤 다시 승인) 이 결정 이름을 붙인 새 키로 새로 예약한다.
 * 살아 있는 기록(예약 · 보내는 중 · 게시됨 · 실패 등)이 있으면 그것을 돌려주고 새로 만들지 않는다 — 두 번 나가지 않게.
 */
export function scheduleApproved(repo: Repo, d: Decision, scheduledAtOverride?: string): ExternalAction | null {
  if (!d.artifactId) return null;
  const platform = d.payload.platform as Channel;
  const target = sendTarget(repo, platform);
  const artifact = repo.getArtifact(d.artifactId);
  const base = `${d.artifactId}:${target}`;
  const prior = repo.actionsForArtifact(d.artifactId).filter((a) => a.kind === 'publish' && (a.idempotencyKey === base || a.idempotencyKey.startsWith(`${base}:`)));
  const alive = prior.find((a) => !REDO.has(a.status));
  if (alive) return alive;
  const { action, created } = repo.createAction({
    kind: 'publish', decisionId: d.id, cycleId: d.cycleId, app: platform, target, artifactId: d.artifactId,
    key: prior.length ? `${base}:${d.id}` : base, scheduledAt: scheduledAtOverride ?? (d.payload.scheduledAt as string) ?? new Date().toISOString(),
    payload: {
      platform, mediaIds: artifact?.meta.mediaIds ?? [], ...(typeof d.payload.approvedHash === 'string' ? { approvedHash: d.payload.approvedHash } : {}),
      ...(d.payload.autoDryRun === true ? { autoDryRun: true } : {}),
    }, status: 'scheduled',
  });
  if (!created) return action;
  repo.emit('action_recorded', `${CHANNEL_LABEL[platform]} 게시 예약 — ${new Date(action.scheduledAt ?? '').toLocaleString('ko-KR')}`, {
    subjectId: action.id, data: { cycleId: d.cycleId, status: 'scheduled', app: platform, kind: 'publish' },
  });
  return action;
}

/** 승인 후 시각을 바꾸면 예약을 취소하고 다시 확인받는다(승인 후 실질 변경 시 재확인, 결정 31). */
export function reschedule(repo: Repo, actionId: string, newTime: string): Decision {
  const a = repo.getAction(actionId);
  if (!a || a.kind !== 'publish') throw new DomainError(404, '게시 기록을 찾을 수 없어요');
  if (a.status !== 'scheduled') throw new DomainError(409, '예약된 게시만 시각을 바꿀 수 있어요');
  if (Number.isNaN(Date.parse(newTime))) throw new DomainError(400, '시각이 올바르지 않아요');
  const old = a.decisionId ? repo.getDecision(a.decisionId) : null;
  const artifact = repo.getArtifact(a.artifactId);
  if (!old || !artifact) throw new DomainError(404, '원래 확인 요청을 찾을 수 없어요');
  return repo.tx(() => {
    repo.setActionStatus(a.id, 'cancelled', '시각 변경 — 다시 확인 필요');
    const platform = old.payload.platform as Channel;
    return repo.openDecision({
      kind: 'publish_confirm', cycleId: old.cycleId, itemId: old.itemId, artifactId: old.artifactId, reviewArtifactId: old.reviewArtifactId,
      title: `${artifact.title} v${artifact.version} → ${CHANNEL_LABEL[platform]} (시각 변경)`,
      payload: { ...freshPayload(old.payload), scheduledAt: new Date(newTime).toISOString(), changed: true, ...publishWarnings(repo, artifact, platform) },
    });
  });
}

/** 다시 묻는 결정의 payload — 지난 승인의 미리보기 · 지문은 이어받지 않는다 */
export function freshPayload(p: Record<string, unknown>): Record<string, unknown> {
  const { previewedAt: _p, approvedHash: _h, autoDryRun: _a, ...rest } = p;
  return rest;
}

/**
 * 보내기 직전 확인 — 승인 뒤 내용이 바뀌었으면 보내지 않고('blocked') 같은 항목으로 새 확인을 연다(결정 80).
 * 연습 게시로만 자동 승인한 것이 그 사이 실제 게시가 켜졌을 때도 같은 길로 대표에게 다시 묻는다.
 * 지문이 없는 옛 기록 · 결정 없는 저장은 그대로 보낸다. 그대로 보내도 되면 null
 */
export function blockIfChanged(repo: Repo, a: ExternalAction, artifact: Artifact): Decision | null {
  if (a.kind !== 'publish' || !a.decisionId) return null;
  const goingLive = a.payload.autoDryRun === true && liveMode(repo);
  if (!goingLive && typeof a.payload.approvedHash !== 'string') return null;
  const d = repo.getDecision(a.decisionId);
  if (!d) return null;
  if (!goingLive && publishHash(repo, d, artifact) === a.payload.approvedHash) return null;
  const latest = (d.itemId ? repo.latestArtifact(d.itemId) : null) ?? artifact;
  const platform = d.payload.platform as Channel;
  const why = goingLive ? '연습 게시로만 자동 승인했는데 실제 게시가 켜졌어요' : '승인 뒤 내용이 바뀌었어요';
  return repo.tx(() => {
    repo.setActionStatus(a.id, 'blocked', `${why} — 보내지 않았어요. 결정함에서 원문을 확인해 주세요`);
    return repo.openDecision({
      kind: 'publish_confirm', cycleId: d.cycleId, itemId: d.itemId, artifactId: latest.id, reviewArtifactId: d.reviewArtifactId,
      title: `${latest.title} v${latest.version} → ${CHANNEL_LABEL[platform]} (${why})`,
      payload: { ...freshPayload(d.payload), changed: true, blockedActionId: a.id, ...publishWarnings(repo, latest, platform) },
    });
  });
}
