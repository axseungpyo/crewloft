import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { App } from '../src/app.ts';
import { sleepTask } from '../src/engine/budget.ts';
import { startCycle } from '../src/engine/cycle.ts';
import { decide, markPreviewed } from '../src/engine/decisions.ts';
import { hire } from '../src/engine/hiring.ts';
import { reschedule, scheduleApproved } from '../src/engine/publishing.ts';
import { makeApp, setupManager, until } from './helpers.ts';

// 1순위 과제 확인(qa/e2e-2026-10-08-p0)에서 나온 서버 버그 — 시각 변경 · 내용 변경 뒤 다시 승인하면 새로 예약된다, 같은 승인은 한 번만

/** 블로그 게시 확인이 열릴 때까지 — 실행기는 멈춰 두고 손으로 돌린다 */
async function toPublish(app: App): Promise<string> {
  await setupManager(app);
  for (const [role, name] of [['researcher', '준'], ['writer', '하나']] as const) hire(app.repo, { role, name });
  app.runner.start();
  const cycle = startCycle(app.repo, 'manual');
  await until(() => app.repo.openDecisions().some((d) => d.kind === 'publish_confirm' && d.payload.platform === 'blog'), 15000, '게시 확인');
  return cycle.id;
}
const blogDecision = (app: App) => app.repo.openDecisions().find((d) => d.kind === 'publish_confirm' && d.payload.platform === 'blog')!;
const approve = (app: App, id: string) => {
  markPreviewed(app.repo, id);
  return decide(app.repo, app.learning, id, { action: 'approve' });
};

test('시각을 바꾼 뒤 다시 승인하면 옛 예약은 취소로 남고 새 예약이 생긴다 — 지문도 새 시각 기준', async () => {
  const { app, done } = makeApp();
  try {
    const cycleId = await toPublish(app);
    const first = approve(app, blogDecision(app).id);
    const old = app.repo.listActions(cycleId).find((a) => a.decisionId === first.id)!;
    assert.equal(old.status, 'scheduled');

    const later = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const again = reschedule(app.repo, old.id, later);
    assert.equal(app.repo.getAction(old.id)!.status, 'cancelled');
    const second = approve(app, again.id);
    assert.equal(second.status, 'approved');

    const fresh = app.repo.listActions(cycleId).find((a) => a.decisionId === second.id);
    assert.ok(fresh, '다시 승인하면 새 예약이 생긴다');
    assert.notEqual(fresh.id, old.id);
    assert.equal(fresh.status, 'scheduled');
    assert.equal(fresh.scheduledAt, later);
    assert.equal(fresh.payload.approvedHash, second.payload.approvedHash, '새 예약은 새 승인의 지문을 가진다');
    assert.notEqual(fresh.payload.approvedHash, old.payload.approvedHash, '시각이 바뀌었으니 지문도 다르다');
    assert.equal(app.repo.getAction(old.id)!.status, 'cancelled', '옛 예약은 취소로 남는다');

    // 같은 결정으로 다시 예약해도 새로 생기지 않는다(같은 승인은 한 번만)
    assert.equal(scheduleApproved(app.repo, app.repo.getDecision(second.id)!)!.id, fresh.id);
    assert.throws(() => decide(app.repo, app.learning, second.id, { action: 'approve' }), /이미 처리된 결정/);
    assert.equal(app.repo.actionsForArtifact(old.artifactId).filter((a) => a.kind === 'publish').length, 2);

    // 시각이 되면 새 예약만 나간다(연습 게시)
    app.repo.exec('UPDATE external_actions SET scheduled_at = ? WHERE id = ?', new Date(Date.now() - 1000).toISOString(), fresh.id);
    app.executor.tick();
    await until(() => app.repo.getAction(fresh.id)?.status === 'dry_run', 5000, '새 예약 게시');
    assert.equal(app.repo.getAction(old.id)!.status, 'cancelled');
  } finally {
    done();
  }
});

test('살아 있는 예약이 있으면 같은 버전 · 같은 대상을 다른 결정으로 승인해도 두 번 예약하지 않는다', async () => {
  const { app, done } = makeApp();
  try {
    const cycleId = await toPublish(app);
    const d = blogDecision(app);
    const first = approve(app, d.id);
    const action = app.repo.listActions(cycleId).find((a) => a.decisionId === first.id)!;
    const events = app.repo.many<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE type = 'action_recorded'")[0]!.n;
    // 같은 결과물로 다른 결정이 승인된 경우를 흉내 낸다
    const other = scheduleApproved(app.repo, { ...first, id: 'dc_other' });
    assert.equal(other!.id, action.id, '이미 예약된 기록을 돌려준다');
    assert.equal(app.repo.actionsForArtifact(action.artifactId).filter((a) => a.kind === 'publish').length, 1);
    assert.equal(app.repo.many<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE type = 'action_recorded'")[0]!.n, events, '새 예약이 없으면 예약 알림도 없다');
  } finally {
    done();
  }
});

test('승인 뒤 내용이 바뀌어 보내지 않은(blocked) 게시도 원문 확인 → 다시 승인하면 새 지문으로 새로 예약된다', async () => {
  const { app, done } = makeApp();
  try {
    const cycleId = await toPublish(app);
    const first = approve(app, blogDecision(app).id);
    const old = app.repo.listActions(cycleId).find((a) => a.decisionId === first.id)!;
    app.repo.exec('UPDATE artifacts SET body = body || ? WHERE id = ?', '\n\n고친 문장', old.artifactId);
    app.repo.exec('UPDATE external_actions SET scheduled_at = ? WHERE id = ?', new Date(Date.now() - 1000).toISOString(), old.id);
    app.executor.tick();
    await until(() => app.repo.getAction(old.id)?.status === 'blocked', 5000, '보내지 않음');

    const again = app.repo.openDecisions().find((x) => x.kind === 'publish_confirm' && x.payload.blockedActionId === old.id)!;
    const second = approve(app, again.id);
    const fresh = app.repo.listActions(cycleId).find((a) => a.decisionId === second.id);
    assert.ok(fresh, '다시 승인하면 새 예약');
    assert.notEqual(fresh.id, old.id);
    assert.equal(fresh.payload.approvedHash, second.payload.approvedHash);
    assert.notEqual(fresh.payload.approvedHash, old.payload.approvedHash, '고친 본문 기준의 지문');

    app.repo.exec('UPDATE external_actions SET scheduled_at = ? WHERE id = ?', new Date(Date.now() - 1000).toISOString(), fresh.id);
    app.executor.tick();
    await until(() => app.repo.getAction(fresh.id)?.status === 'dry_run', 5000, '고친 본문으로 게시');
    assert.equal(app.repo.getAction(old.id)!.status, 'blocked');
  } finally {
    done();
  }
});

test("'계속할지 정해 주세요' 카드 — 할 일이 먼저, 금액은 소수 둘째 자리까지($0.10)", async () => {
  const { app, done } = makeApp();
  try {
    await setupManager(app);
    const cycle = startCycle(app.repo, 'manual');
    const mgr = app.repo.employeeByRole('manager')!;
    const t = app.repo.createTask({ cycleId: cycle.id, step: 'plan', kind: 'plan', title: '주간 기획', assigneeId: mgr.id, dependsOn: [], itemId: `${cycle.id}:plan-x` });
    app.repo.exec("UPDATE tasks SET status = 'working' WHERE id = ?", t.id);
    const card = sleepTask(app.repo, app.repo.getTask(t.id)!, { scope: 'task', used: 0.05, cap: 0.05 }, { taskUsd: 0.05, employeeWeekUsd: null, officeWeekUsd: null });
    assert.match(card.title, /^계속할지 정해 주세요 — /, '할 일이 먼저');
    assert.match(card.title, /사용 한도 \$0\.05에 닿았어요/);
    assert.match(card.title, /\$0\.10 더 쓰면 이어서 해요\(이번 주만\)/);
  } finally {
    done();
  }
});
