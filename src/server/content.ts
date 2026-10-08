import type { App } from '../app.ts';
import type { Cycle } from '../core/types.ts';
import { cycleDetail } from './views.ts';

/** S5 콘텐츠 — 회차 띠·지표·회차 상세. 내 개입은 지어낸 시간이 아니라 실제 처리 건수로 보여준다. */
export function contentView(app: App, cycleId: string | null) {
  const { repo } = app;
  const cycles = repo.listCycles(8).reverse();
  const cycle: Cycle | null = (cycleId && cycleId !== 'current' ? repo.getCycle(cycleId) : null) ?? repo.runningCycles().at(-1) ?? repo.latestCycle();
  const band = cycles.map((c) => {
    const decisions = repo.listDecisions(c.id).filter((d) => d.kind === 'publish_confirm');
    const handled = decisions.filter((d) => d.status !== 'open').length;
    const comments = repo.one<{ n: number }>('SELECT COUNT(*) AS n FROM comments WHERE decision_id IN (SELECT id FROM decisions WHERE cycle_id = ?)', c.id)?.n ?? 0;
    const tasks = repo.listTasks(c.id);
    return {
      id: c.id, label: c.label, status: c.status, startedAt: c.startedAt,
      artifacts: repo.listArtifacts(c.id).length, tasksDone: tasks.filter((t) => t.status === 'done').length, tasks: tasks.length,
      involvement: { handled, comments }, open: decisions.length - handled,
    };
  });
  const weekly = app.scheduler.weekly();
  let metrics = null;
  if (cycle) {
    const actions = repo.listActions(cycle.id);
    const decisions = repo.listDecisions(cycle.id).filter((d) => d.kind === 'publish_confirm');
    const settled = decisions.filter((d) => d.status === 'approved' || d.status === 'rejected');
    const adopted = settled.filter((d) => d.status === 'approved' && (d.artifactId ? (repo.getArtifact(d.artifactId)?.version ?? 1) === 1 : false)).length;
    metrics = {
      mine: { confirm: decisions.filter((d) => d.status === 'open').length, unknown: actions.filter((a) => a.status === 'unknown').length, failed: actions.filter((a) => a.status === 'failed').length },
      done: { published: actions.filter((a) => a.kind === 'publish' && a.status === 'succeeded').length, dryRun: actions.filter((a) => a.status === 'dry_run').length, saved: actions.filter((a) => a.kind === 'save' && a.status === 'succeeded').length },
      involvement: band.find((b) => b.id === cycle.id)?.involvement ?? { handled: 0, comments: 0 },
      adoption: { rate: settled.length ? Math.round((adopted / settled.length) * 100) : null, adopted, total: settled.length },
    };
  }
  return {
    band, metrics, detail: cycle ? cycleDetail(app, cycle) : null,
    next: { weekly: weekly ? true : false, nextRunAt: app.scheduler.nextRunAt() },
  };
}
