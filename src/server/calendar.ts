import type { App } from '../app.ts';
import { weekStart } from '../engine/runner.ts';

interface Entry { kind: 'confirm' | 'action'; id: string; decisionId: string | null; platform: string; at: string; title: string; status: string; note: string | null }

/** 주간 발행 캘린더 — 열린 게시 확인(제안 시각) + 게시 기록(예약·완료·드라이런·확인 필요·실패) */
export function calendar(app: App, offset: number) {
  const { repo } = app;
  const start = weekStart(new Date());
  start.setDate(start.getDate() + offset * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const inWeek = (iso: string | null | undefined): boolean => !!iso && iso >= start.toISOString() && iso < end.toISOString();
  const entries: Entry[] = [];
  for (const d of repo.openDecisions()) {
    if (d.kind !== 'publish_confirm') continue;
    const at = d.payload.scheduledAt as string | undefined;
    if (!inWeek(at)) continue;
    const art = d.artifactId ? repo.getArtifact(d.artifactId) : null;
    entries.push({ kind: 'confirm', id: d.id, decisionId: d.id, platform: String(d.payload.platform), at: at!, title: art?.title ?? d.title, status: 'open', note: null });
  }
  const actions = repo.many<{ id: string; decision_id: string | null; app: string; artifact_id: string; status: string; scheduled_at: string | null; updated_at: string; note: string | null }>(
    "SELECT id, decision_id, app, artifact_id, status, scheduled_at, updated_at, note FROM external_actions WHERE kind = 'publish'",
  );
  const carry: Entry[] = [];
  for (const a of actions) {
    const at = a.scheduled_at ?? a.updated_at;
    const art = repo.getArtifact(a.artifact_id);
    const e: Entry = { kind: 'action', id: a.id, decisionId: a.decision_id, platform: a.app, at, title: art?.title ?? '', status: a.status, note: a.note };
    if (inWeek(at)) entries.push(e);
    else if (offset === 0 && at < start.toISOString() && (a.status === 'failed' || a.status === 'unknown')) carry.push(e);
  }
  entries.sort((x, y) => x.at.localeCompare(y.at));
  return { weekStart: start.toISOString(), entries, carry };
}
