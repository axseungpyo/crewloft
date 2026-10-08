import type { App } from '../app.ts';
import { CHANNEL_LABEL, ROLE_DESC, ROLE_LABEL } from '../core/roles.ts';
import type { Channel, OfficeEvent } from '../core/types.ts';
import { say } from '../core/voice.ts';
import { weekStart } from './runner.ts';
import { timeSummary } from './owner-time.ts';

const REPLAY_TYPES = new Set(['handoff_accepted', 'artifact_saved', 'decision_opened', 'decision_resolved', 'message', 'task_status', 'action_recorded', 'rule_changed', 'cycle_started', 'cycle_finished', 'employee_hired']);

/**
 * 복귀 요약(결정 51) — 매니저의 아침 보고. 순서 고정: ① 결정해 주실 것 → ② 새로 끝난 것 → ③ 지켜볼 것 → ④ 그 밖에.
 * 모든 내용은 실제 기록에서만 만든다. 리플레이도 실제 이벤트와 실제 시각만 쓴다.
 */
export function returnSummary(app: App) {
  const { repo, learning } = app;
  const seen = repo.getSetting<{ seq: number; at: string }>('owner.lastSeen');
  const lastSeq = repo.lastSeq();
  const since = seen?.seq ?? 0;
  const events = repo.events(since, 2000);
  const manager = repo.employeeByRole('manager');
  const talk = (haeyo: string, hamnida: string, banmal: string): string => (manager ? say(manager, { haeyo, hamnida, banmal }) : haeyo);
  const sinceIso = seen?.at ?? '1970-01-01';

  const open = repo.openDecisions();
  const decide = open.map((d) => {
    const art = d.artifactId ? repo.getArtifact(d.artifactId) : null;
    return { id: d.id, kind: d.kind, title: art?.title ?? d.title, platform: d.payload.platform ? CHANNEL_LABEL[d.payload.platform as Channel] : null, changed: d.payload.changed === true || (art?.version ?? 1) > 1, isNew: d.createdAt > sinceIso, at: d.payload.scheduledAt ?? null };
  });
  const changed = decide.filter((d) => d.changed).length;

  const newArtifacts = repo.many<{ id: string; title: string; kind: string; version: number; created_at: string; assignee_id: string }>(
    'SELECT a.id, a.title, a.kind, a.version, a.created_at, t.assignee_id FROM artifacts a JOIN tasks t ON t.id = a.task_id WHERE a.created_at > ? ORDER BY a.created_at', sinceIso,
  ).map((a) => ({ id: a.id, title: a.title, kind: a.kind, version: a.version, at: a.created_at, by: repo.getEmployee(a.assignee_id)?.name ?? '' }));
  const published = repo.many<{ id: string; app: string; status: string; result_url: string | null; artifact_id: string; updated_at: string }>(
    "SELECT id, app, status, result_url, artifact_id, updated_at FROM external_actions WHERE kind = 'publish' AND status IN ('succeeded', 'dry_run') AND updated_at > ?", sinceIso,
  ).map((a) => ({ id: a.id, platform: CHANNEL_LABEL[a.app as Channel] ?? a.app, live: a.status === 'succeeded', url: a.result_url, title: repo.getArtifact(a.artifact_id)?.title ?? '' }));

  const watch: Array<{ text: string; link: string }> = [];
  for (const a of repo.actionsByStatus(['unknown'])) watch.push({ text: `${repo.getArtifact(a.artifactId)?.title ?? ''} — ${a.target ?? a.app}에 올라갔는지 확인해 주세요`, link: '#/content/ledger' });
  for (const a of repo.actionsByStatus(['failed'])) watch.push({ text: `${repo.getArtifact(a.artifactId)?.title ?? ''} — ${a.target ?? a.app}에 올리다 문제가 생겼어요`, link: '#/content/ledger' });
  for (const t of repo.tasksByStatus(['failed', 'reconnect'])) watch.push({ text: `${t.title} — ${t.waitReason ?? '멈춤'}`, link: '#/content/board' });
  for (const c of app.connections.list()) {
    if (c.expiresAt && Date.parse(c.expiresAt) - Date.now() < 7 * 86_400_000) watch.push({ text: `${app.integrations.label(c.app)} 연결이 곧 만료돼요(${c.expiresAt.slice(5, 10)})`, link: '#/settings/keys' });
  }

  const resumed = events.filter((e) => e.type === 'task_status' && e.data.from === 'quota_wait' && e.data.to === 'waiting').length;
  const learned = events.filter((e) => e.type === 'rule_changed' && /배웠어요/.test(e.data.text)).map((e) => e.data.text);
  const estimated = learning.rules(null, ['estimated']).length;
  const ai = app.getAi();
  const usage = repo.usageSince(weekStart(new Date()).toISOString());

  const replay = events.filter((e) => REPLAY_TYPES.has(e.type) && !(e.type === 'task_status' && !['done', 'failed', 'quota_wait', 'reconnect'].includes(String(e.data.to)))).slice(-80).map(slim);

  return {
    lastSeen: seen?.at ?? null, now: new Date().toISOString(), lastSeq, newEvents: events.length,
    manager: manager ? { name: manager.name, look: manager.look, role: ROLE_LABEL[manager.role], roleDesc: ROLE_DESC[manager.role], roleKey: manager.role, rank: manager.rank } : null,
    sections: {
      decide: { items: decide, line: decide.length ? talk(`결정해 주실 게 ${decide.length}건 있어요.${changed ? ` 그중 ${changed}건은 바뀌어서 다시 확인이 필요해요.` : ''}`, `결정해 주실 사항이 ${decide.length}건입니다.${changed ? ` ${changed}건은 변경되어 재확인이 필요합니다.` : ''}`, `결정할 거 ${decide.length}건 있어.${changed ? ` ${changed}건은 바뀌어서 다시 봐줘.` : ''}`) : talk('지금 결정하실 건 없어요.', '지금 결정하실 사항은 없습니다.', '지금 결정할 건 없어.') },
      done: { artifacts: newArtifacts, published, line: newArtifacts.length || published.length ? talk(`없는 동안 결과물 ${newArtifacts.length}개가 나왔고${published.length ? `, ${published.length}건이 게시(연습 게시 포함)됐어요` : ''}.`, `부재 중 결과물 ${newArtifacts.length}개가 완성되었고${published.length ? `, ${published.length}건이 게시(연습 게시 포함)되었습니다` : ''}.`, `없는 동안 결과물 ${newArtifacts.length}개 나왔어${published.length ? `, 게시 ${published.length}건(연습 게시 포함)` : ''}.`) : talk('새로 끝난 건 아직 없어요.', '새로 완료된 사항은 없습니다.', '새로 끝난 건 아직 없어.') },
      watch: { items: watch, line: watch.length ? talk(`지켜볼 게 ${watch.length}건 있어요.`, `확인이 필요한 사항이 ${watch.length}건입니다.`, `지켜볼 거 ${watch.length}건 있어.`) : talk('걱정할 건 없어요.', '특이사항은 없습니다.', '걱정할 건 없어.') },
      other: {
        resumed, learned, estimated,
        usage: { runs: usage.runs, costUsd: usage.costUsd, note: ai.quota().note, resetsAt: ai.quota().resetsAt },
        line: talk(`그 밖에: 한도로 멈췄다 다시 시작한 업무 ${resumed}건, 새로 배운 것 ${learned.length}개.`, `그 밖에: 한도로 중단 후 재개된 업무 ${resumed}건, 새로 배운 것 ${learned.length}개입니다.`, `그 밖에: 한도로 멈췄다 재개한 거 ${resumed}건, 새로 배운 거 ${learned.length}개.`),
      },
    },
    replay,
    time: (({ week, lastWeek }) => ({ week, lastWeek }))(timeSummary(repo)),
  };
}

function slim(e: OfficeEvent) {
  const kind = e.type === 'handoff_accepted' ? 'handoff' : e.type === 'artifact_saved' || e.type === 'action_recorded' || e.type === 'cycle_finished' ? 'result' : e.type.startsWith('decision') ? 'decision' : e.type === 'message' ? 'dm' : 'system';
  return { seq: e.seq, at: e.at, type: e.type, kind, actorId: e.actorId, text: e.data.text, fromId: e.data.fromId ?? null, toId: e.data.toId ?? null };
}

export function markSeen(app: App): void {
  app.repo.setSetting('owner.lastSeen', { seq: app.repo.lastSeq(), at: new Date().toISOString() });
}
