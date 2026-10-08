import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ClaudeCliProvider } from '../src/ai/claude-cli.ts';
import type { CompleteRequest } from '../src/ai/provider.ts';
import type { App } from '../src/app.ts';
import type { Task } from '../src/core/types.ts';
import { startCycle } from '../src/engine/cycle.ts';
import { decide, markPreviewed } from '../src/engine/decisions.ts';
import { hire } from '../src/engine/hiring.ts';
import { flowBlocksView, shellState } from '../src/server/views.ts';
import { listRuns } from '../src/store/runs.ts';
import { makeApp, setupManager, until } from './helpers.ts';

// 1순위 과제 후속(결정 80) — 도크 · 블록 띠의 되묻는 중 · 잠듦, 사전 허용은 연습 게시일 때만, 실행 도중 사용 한도, 자동 저장 기록

// 혹시 저장이 실행돼도 밖으로 나가지 않게 — 닫힌 로컬 주소
process.env.AO_API_BASE_NOTION = 'http://127.0.0.1:9';

async function twoStep(app: App): Promise<void> {
  await setupManager(app);
  hire(app.repo, { role: 'researcher', name: '준' });
}

const taskOf = (app: App, cycleId: string, kind: string): Task => app.repo.listTasks(cycleId).find((t) => t.kind === kind)!;

/** 업무를 작업 중으로 돌려 놓는다(허용된 전환 순서대로) */
function work(app: App, t: Task): void {
  const now = app.repo.getTask(t.id)!.status;
  if (now !== 'waiting' && now !== 'working') app.repo.setTaskStatus(t.id, 'waiting', { reason: null });
  if (now !== 'working') app.repo.setTaskStatus(t.id, 'working', { reason: null });
}
function ask(app: App, t: Task, question: string): void {
  work(app, t);
  app.repo.updateTaskMeta(t.id, { ask: { to: 'owner', question, askedAt: new Date().toISOString(), count: 1 } });
  app.repo.setTaskStatus(t.id, 'asked', { reason: '대표에게 물어보는 중' });
}
function sleep(app: App, t: Task, scope: 'task' | 'employee' | 'office'): void {
  work(app, t);
  app.repo.updateTaskMeta(t.id, { sleep: { scope, decisionId: 'x', used: 1, cap: 1, at: new Date().toISOString() } });
  app.repo.setTaskStatus(t.id, 'asleep', { reason: '한도' });
}

test('도크 7단계 — 되묻는 중 · 잠듦 상태와 설명, 문제가 있으면 문제가 먼저', async () => {
  const { app, done } = makeApp();
  try {
    await twoStep(app);
    const cycle = startCycle(app.repo, 'manual');
    const research = taskOf(app, cycle.id, 'research');
    const plan = taskOf(app, cycle.id, 'plan');
    ask(app, research, '받은 자료의 (가정) 표시 문장은 그대로 써도 될까요? 근거를 확인하고 싶어요.');
    sleep(app, plan, 'employee');
    let flow = (await shellState(app)).flow;
    const r = flow.find((s) => s.key === 'research')!;
    assert.equal(r.state, 'asked');
    assert.match(r.detail, /^되묻는 중 — 받은 자료의 \(가정\)/);
    const p = flow.find((s) => s.key === 'plan')!;
    assert.equal(p.state, 'asleep');
    assert.equal(p.detail, '한도에 닿아 쉬는 중 — 직원 주간 한도');

    // 잠듦은 되묻는 중보다 앞, 문제(실패)는 잠듦보다 앞
    sleep(app, research, 'office');
    flow = (await shellState(app)).flow;
    assert.deepEqual([flow.find((s) => s.key === 'research')!.state, flow.find((s) => s.key === 'research')!.detail], ['asleep', '한도에 닿아 쉬는 중 — 사무실 주간 한도']);
    work(app, research);
    app.repo.setTaskStatus(research.id, 'failed', { reason: '실패' });
    flow = (await shellState(app)).flow;
    assert.equal(flow.find((s) => s.key === 'research')!.state, 'issue');
  } finally {
    done();
  }
});

test('이번 주 블록 띠 — 되묻는 중 · 잠듦 상태와 설명', async () => {
  const { app, done } = makeApp();
  try {
    await setupManager(app);
    const bpReq = app.onboarding.submitSetup({ stage: '준비하고 있어요', customer: '근처 직장인', goal: '메뉴 · 가격 확정' });
    await until(() => app.requests.get(bpReq.id)?.status === 'done', 8000, '설계도');
    app.onboarding.confirmBlueprint({ blocks: ['pricing', 'prep_checklist', 'market_research'] });
    app.onboarding.finish();
    const cycle = startCycle(app.repo, 'manual');
    const kickoff = app.repo.listTasks(cycle.id)[0]!;

    ask(app, kickoff, '첫 달 목표 매출을 정해 두셨나요?');
    let fb = flowBlocksView(app, app.repo.getCycle(cycle.id))!;
    assert.equal(fb[0]!.state, 'asked');
    assert.equal(fb[0]!.detail, '되묻는 중 — 첫 달 목표 매출을 정해 두셨나요?');
    assert.equal((await shellState(app)).flowBlocks![0]!.state, 'asked');

    sleep(app, kickoff, 'task');
    fb = flowBlocksView(app, app.repo.getCycle(cycle.id))!;
    assert.deepEqual([fb[0]!.state, fb[0]!.detail], ['asleep', '한도에 닿아 쉬는 중 — 업무 한도']);
  } finally {
    done();
  }
});

/** 블로그까지 가는 콘텐츠 회차 — 사전 허용(블로그) */
async function blogTeam(app: App): Promise<void> {
  await setupManager(app);
  for (const [role, name] of [['researcher', '준'], ['writer', '하나']] as const) hire(app.repo, { role, name });
  app.repo.setSetting('approval.policy', { mode: 'per_post', autoPlatforms: ['blog'] });
}

test('사전 허용 ① — 연습 게시일 때만 자동 승인, 그 사이 실제 게시가 켜지면 보내지 않고 다시 묻는다', async () => {
  const { app, done } = makeApp();
  try {
    await blogTeam(app);
    app.runner.start();
    const cycle = startCycle(app.repo, 'manual');
    const blogDecision = () => app.repo.listDecisions(cycle.id).find((d) => d.kind === 'publish_confirm' && d.payload.platform === 'blog');
    await until(() => !!blogDecision(), 15000, '블로그 확인 요청');
    const d = blogDecision()!;
    assert.equal(d.status, 'approved', '연습 게시 — 사전 허용은 바로 승인');
    assert.equal(d.payload.autoDryRun, true);
    const action = () => app.repo.listActions(cycle.id).find((a) => a.decisionId === d.id)!;
    assert.equal(action().status, 'scheduled');
    assert.equal(action().payload.autoDryRun, true);

    // 보내기 전에 대표가 실제 게시를 켰다 → 보내지 않고(blocked) 결정함에 원문 확인을 다시 연다
    app.repo.setSetting('publish.live', true);
    app.repo.exec('UPDATE external_actions SET scheduled_at = ? WHERE id = ?', new Date(Date.now() - 1000).toISOString(), action().id);
    app.executor.tick();
    await until(() => action().status === 'blocked', 5000, '보내지 않음');
    const again = app.repo.openDecisions().find((x) => x.kind === 'publish_confirm' && x.payload.blockedActionId === action().id)!;
    assert.ok(again, '다시 확인 요청');
    assert.equal(again.payload.autoDryRun, undefined, '자동 승인 표시는 이어받지 않는다');
    assert.throws(() => decide(app.repo, app.learning, again.id, { action: 'approve' }), /원문을 먼저 확인/);
  } finally {
    done();
  }
});

test('사전 허용 ① — 실제 게시가 켜져 있으면 사전 허용이어도 원문 확인 → 승인을 거친다', async () => {
  const { app, done } = makeApp();
  try {
    await blogTeam(app);
    app.repo.setSetting('publish.live', true);
    app.runner.start();
    const cycle = startCycle(app.repo, 'manual');
    const blogDecision = () => app.repo.listDecisions(cycle.id).find((d) => d.kind === 'publish_confirm' && d.payload.platform === 'blog');
    await until(() => !!blogDecision(), 15000, '블로그 확인 요청');
    const d = blogDecision()!;
    assert.equal(d.status, 'open', '자동 승인하지 않는다');
    assert.equal(d.payload.autoDryRun, undefined);
    assert.equal(app.repo.listActions(cycle.id).filter((a) => a.kind === 'publish').length, 0);
    assert.throws(() => decide(app.repo, app.learning, d.id, { action: 'approve' }), /원문을 먼저 확인/);
    markPreviewed(app.repo, d.id);
    assert.equal(decide(app.repo, app.learning, d.id, { action: 'approve' }).status, 'approved');
  } finally {
    done();
  }
});

test('실행 도중 사용 한도 — 남은 돈을 요청에 싣고, 넘으면 도중에 멈춰 잠듦(쓴 만큼은 기록)', async () => {
  const { app, done } = makeApp();
  try {
    await twoStep(app);
    // 조사 1회 추정 비용 $0.03 > 업무 한도 $0.025 — 시작 전엔 0이라 시작하지만 도중에 멈춘다
    app.repo.setSetting('budget.caps', { taskUsd: 0.025, employeeWeekUsd: null, officeWeekUsd: null });
    const seen: CompleteRequest[] = [];
    const fake = app.providers.fake;
    const orig = fake.complete.bind(fake);
    fake.complete = (req, signal) => { seen.push(req); return orig(req, signal); };
    app.runner.start();
    const cycle = startCycle(app.repo, 'manual');
    await until(() => taskOf(app, cycle.id, 'research').status === 'asleep', 10000, '잠듦');
    const research = taskOf(app, cycle.id, 'research');
    assert.equal(seen.find((r) => r.purpose === 'task:research')!.maxBudgetUsd, 0.025);
    assert.equal(app.repo.usageForTask(research.id), 0.025, '멈추기 전까지 쓴 만큼');
    const card = app.repo.openDecisions().find((d) => d.kind === 'budget_continue')!;
    assert.deepEqual([card.payload.taskId, card.payload.scope], [research.id, 'task']);
    const run = listRuns(app.repo, { taskId: research.id }).find((r) => r.status === 'asleep')!;
    assert.deepEqual([run.errorType, run.costUsd, run.decisionIds], ['budget_task', 0.025, [card.id]]);
    assert.equal((await shellState(app)).flow.find((s) => s.key === 'research')!.detail, '한도에 닿아 쉬는 중 — 업무 한도');

    // 계속 승인 → 늘어난 한도로 이어서 끝낸다
    decide(app.repo, app.learning, card.id, { action: 'approve' });
    await until(() => app.repo.getCycle(cycle.id)?.status === 'done', 10000, '재개 후 완료');
    assert.equal(taskOf(app, cycle.id, 'research').status, 'done');
  } finally {
    done();
  }
});

test('구독 CLI — 1회 상한과 남은 돈 중 작은 쪽을 --max-budget-usd로', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ao-cli-'));
  try {
    const cli = new ClaudeCliProvider({ bin: 'claude', model: null, maxBudgetPerRunUsd: 1, timeoutMs: 1000, workDir: dir, concurrency: 1 });
    const req: CompleteRequest = { purpose: 'task:research', system: 's', prompt: 'p', schema: {} };
    const budget = (r: CompleteRequest) => { const a = cli.args(r); return a[a.indexOf('--max-budget-usd') + 1]; };
    assert.equal(budget(req), '1');
    assert.equal(budget({ ...req, maxBudgetUsd: 0.25 }), '0.25');
    assert.equal(budget({ ...req, maxBudgetUsd: 3 }), '1');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('④ 대표 저장소 자동 저장(Notion)은 결정 없이 그대로, 작업 기록의 밖으로 나간 일에 남는다', async () => {
  const { app, done } = makeApp();
  try {
    await twoStep(app);
    app.connections.upsert('notion', { status: 'connected', label: '테스트', config: { parentId: 'p' }, secret: { token: 's' } });
    app.runner.start();
    const cycle = startCycle(app.repo, 'manual');
    await until(() => app.repo.getCycle(cycle.id)?.status === 'done', 10000, '회차 완료');
    const research = taskOf(app, cycle.id, 'research');
    const saves = app.repo.listActions(cycle.id).filter((a) => a.kind === 'save' && a.app === 'notion');
    assert.ok(saves.length > 0);
    assert.ok(saves.every((a) => a.decisionId === null), '결정 없이');
    const run = listRuns(app.repo, { taskId: research.id }).find((r) => r.status === 'ok')!;
    const mine = saves.filter((a) => app.repo.getArtifact(a.artifactId)?.taskId === research.id).map((a) => a.id);
    assert.ok(mine.length > 0 && mine.every((id) => run.externalEffects.includes(id)), '작업 기록에 저장이 남는다');
  } finally {
    done();
  }
});
