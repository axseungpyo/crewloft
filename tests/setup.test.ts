import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WORK_BLOCK_IDS } from '../src/blocks/catalog.ts';
import { confirmedBlueprint, currentPlan, normalizeBlueprint } from '../src/engine/blueprint.ts';
import { planCycle, startCycle } from '../src/engine/cycle.ts';
import { decide } from '../src/engine/decisions.ts';
import { makeApp, until } from './helpers.ts';

/** 카페 사업으로 매니저까지 */
async function cafeManager(app: ReturnType<typeof makeApp>['app']): Promise<void> {
  app.onboarding.seenIntro();
  app.repo.createOffice('골목커피', '동네 직장인을 위한 작은 카페를 열려고 해요. 메뉴와 가격, 오픈 준비를 혼자 하기 벅차요.');
  app.onboarding.confirmPower();
  const req = app.onboarding.startInterview();
  await until(() => app.requests.get(req.id)?.status === 'done', 8000, '면접');
  app.onboarding.hireFromCandidate({ role: 'manager', archetype: 'careful', name: '미나' });
}

test('사업 인터뷰 → 설계도 초안 → 고쳐 확정 → 첫 주는 킥오프(매니저 혼자) → 계획 확정 → 1주차 블록', async () => {
  const { app, done } = makeApp();
  try {
    await cafeManager(app);
    assert.equal(app.onboarding.stage(), 'setup');
    const q = app.onboarding.startSetup();
    await until(() => app.requests.get(q.id)?.status === 'done', 8000, '인터뷰 준비');
    const { list } = app.onboarding.questions();
    assert.deepEqual(list.slice(0, 6).map((x) => x.key), ['stage', 'customer', 'blocker', 'goal', 'assets', 'keep'], '뼈대 질문은 고정');
    assert.ok(list.some((x) => x.key === 'x1'), '이 사업에만 필요한 질문(상권)');
    assert.throws(() => app.onboarding.submitSetup({}), /하나는 알려/);

    const bpReq = app.onboarding.submitSetup({ stage: '준비하고 있어요', customer: '근처 직장인', goal: '메뉴 · 가격 확정', blocker: '가격을 못 정했어요', x1: '후보가 2–3곳' });
    await until(() => app.requests.get(bpReq.id)?.status === 'done', 8000, '설계도');
    assert.equal(app.onboarding.stage(), 'blueprint');
    const draft = app.onboarding.state().draft as { data: { blocks: Array<{ id: string }>; stage: string; customer: string; hiring: Array<{ role: string }> } };
    assert.equal(draft.data.stage, 'prep');
    assert.equal(draft.data.customer, '근처 직장인', '대표의 답이 설계도에');
    assert.ok(!draft.data.blocks.some((b) => b.id === 'content_ops'), '카페는 블로그 · SNS가 기본이 아님');

    // 글로 고쳐 달라기 → 새 초안
    const rev = app.onboarding.reviseBlueprint('첫 고객 확보 계획도 넣어 주세요');
    await until(() => app.requests.get(rev.id)?.status === 'done', 8000, '고치기');
    const revised = app.onboarding.state().draft as { version: number; data: { blocks: Array<{ id: string }> } };
    assert.ok(revised.data.blocks.some((b) => b.id === 'first_customers'));

    // 화면에서 블록 하나 빼고 목표를 고쳐 확정 → 대표가 고친 버전으로 확정
    const blocks = revised.data.blocks.map((b) => b.id).filter((id) => id !== 'landing_copy');
    const bp = app.onboarding.confirmBlueprint({ blocks, goals: [{ text: '메뉴 6개 가격 확정', check: '가격표' }] });
    assert.deepEqual(bp.blocks.map((b) => b.id), blocks);
    assert.equal(confirmedBlueprint(app.repo)?.source, 'owner');
    assert.equal(app.onboarding.stage(), 'first');
    assert.equal(app.repo.getProject()!.brief.goal, '메뉴 6개 가격 확정', '직원 프롬프트의 기준(브리프)도 설계도를 따름');
    assert.ok((app.repo.getSetting<Array<{ role: string }>>('hiring.roadmap') ?? []).some((h) => h.role === 'marketer'), '고른 블록이 필요로 하는 직무가 채용 순서에');

    // 첫 주 = 킥오프(사업 진단 + 이번 달 실행 계획) — 매니저 혼자
    app.onboarding.finish();
    app.start();
    const c1 = startCycle(app.repo, 'manual');
    assert.deepEqual(c1.blocks, ['kickoff']);
    const tasks = app.repo.listTasks(c1.id);
    assert.deepEqual(tasks.map((t) => t.kind), ['kickoff.plan']);
    await until(() => app.repo.openDecisions().some((d) => d.kind === 'artifact_confirm'), 10000, '결과물 확인');
    const d1 = app.repo.openDecisions().find((d) => d.kind === 'artifact_confirm')!;
    const plan = app.repo.getArtifact(d1.artifactId!)!;
    assert.ok((plan.meta.weeks as unknown[]).length >= 1, '주차별 계획');
    assert.ok((plan.meta.ownerTasks as string[]).length >= 1, '대표 할 일');
    assert.throws(() => startCycle(app.repo, 'manual'), /끝나면 새로 시작|먼저 확인/, '회차가 아직 돌거나(마무리 중) 계획 확인을 기다린다');
    await until(() => app.repo.getCycle(c1.id)?.status === 'done', 5000, '회차 끝');
    assert.throws(() => startCycle(app.repo, 'manual'), /먼저 확인/, '계획을 확인하기 전엔 다음 회차를 열지 않음');

    decide(app.repo, app.learning, d1.id, { action: 'approve' });
    assert.ok(currentPlan(app.repo), '확정한 계획이 이번 달 계획');
    const next = planCycle(app.repo);
    assert.equal(next.week, 1);
    assert.equal(next.blocks.at(-1), 'weekly_retro');
    for (const id of next.blocks.slice(0, -1)) assert.ok(WORK_BLOCK_IDS.includes(id));

    // 1주차 — 리서처가 없으면 조사 블록은 '채용 후 가능', 매니저 블록 + 회고는 돈다
    const c2 = startCycle(app.repo, 'manual');
    const kinds = app.repo.listTasks(c2.id).map((t) => t.kind);
    assert.ok(kinds.includes('weekly_retro.retro'));
    const skipped = app.repo.eventsFor(c2.id, 'task_skipped').map((e) => String(e.data.reason));
    if (next.blocks.includes('market_research')) assert.ok(skipped.some((r) => r.includes('리서처 채용 후')));
    const retro = app.repo.listTasks(c2.id).find((t) => t.kind === 'weekly_retro.retro')!;
    assert.ok((retro.meta.inputs as string[]).includes(plan.id), '회고는 이번 달 계획을 받는다');
    await until(() => app.repo.getTask(retro.id)?.status === 'done', 15000, '회고');
  } finally {
    done();
  }
});

test('결과물 확인 — 수정 요청(앞으로도) → 배운 것 → 수정본으로 다시 확인, 보류', async () => {
  const { app, done } = makeApp();
  try {
    await cafeManager(app);
    const bpReq = app.onboarding.submitSetup({ stage: '준비하고 있어요', customer: '근처 직장인', goal: '메뉴 · 가격 확정' });
    await until(() => app.requests.get(bpReq.id)?.status === 'done', 8000, '설계도');
    app.onboarding.confirmBlueprint({});
    app.onboarding.finish();
    app.start();
    startCycle(app.repo, 'manual');
    await until(() => app.repo.openDecisions().some((d) => d.kind === 'artifact_confirm'), 10000, '결과물 확인');
    const d1 = app.repo.openDecisions().find((d) => d.kind === 'artifact_confirm')!;
    assert.equal(d1.payload.plan, true);

    app.learning.addComment({ decisionId: d1.id, artifactId: d1.artifactId!, anchor: '1', quote: '단계', text: '단계 진단을 더 짧게' });
    decide(app.repo, app.learning, d1.id, { action: 'reject', comment: '대표 할 일은 세 개만', scope: 'always' });
    const manager = app.repo.employeeByRole('manager')!;
    assert.equal(app.learning.rules(manager.id, ['confirmed']).length, 1, '앞으로도 → 매니저의 배운 것');
    await until(() => app.repo.openDecisions().some((d) => d.kind === 'artifact_confirm' && d.itemId === d1.itemId), 10000, '수정본 확인');
    const d2 = app.repo.openDecisions().find((d) => d.itemId === d1.itemId)!;
    const v2 = app.repo.getArtifact(d2.artifactId!)!;
    assert.equal(v2.version, 2);
    assert.match(v2.body, /수정 요청 반영/);
    assert.ok(v2.meta.weeks, '수정본도 주차별 계획');

    // 보류 — 계획이 없으니 다음 회차는 다시 킥오프
    decide(app.repo, app.learning, d2.id, { action: 'dismiss' });
    assert.equal(app.repo.getDecision(d2.id)?.status, 'rejected');
    assert.equal(currentPlan(app.repo), null);
  } finally {
    done();
  }
});

test('설계도 보정 — 카탈로그 밖 블록은 제안으로, 목표 3개까지, 없는 직무는 빼고 필요한 직무는 더함', () => {
  const bp = normalizeBlueprint({
    summary: '요약', stage: 'weird', goals: [{ text: 'a', check: '' }, { text: 'b', check: '' }, { text: 'c', check: '' }, { text: 'd', check: '' }],
    blocks: [{ id: 'market_research', why: '조사' }, { id: 'tiktok_dance', why: '춤' }, { id: 'market_research', why: '중복' }],
    hiring: [{ role: 'ceo', why: '', when: '' }, { role: 'manager', why: '', when: '' }],
  });
  assert.equal(bp.stage, 'idea');
  assert.equal(bp.goals.length, 3);
  assert.deepEqual(bp.blocks.map((b) => b.id), ['market_research']);
  assert.ok(bp.ideas[0]!.startsWith('tiktok_dance'));
  assert.deepEqual(bp.hiring.map((h) => h.role), ['researcher'], '조사 블록의 담당');
  assert.throws(() => normalizeBlueprint({ summary: '', goals: [] }), /요약/);
  assert.throws(() => normalizeBlueprint({ summary: 's', goals: [] }), /목표/);
  const fallback = normalizeBlueprint({ summary: 's', stage: 'prep', goals: [{ text: 'g' }], blocks: [] });
  assert.ok(fallback.blocks.length >= 2, '블록이 없으면 단계 기본 블록');
});

test('옛 사무실(결정 73 이전) — 콘텐츠 운영 설계도를 합성하고 그대로 콘텐츠 회차', async () => {
  const { app, done } = makeApp();
  try {
    app.repo.createOffice('툴로그', '생산성 도구 리뷰 브랜드');
    app.repo.setSetting('onboarding.power', true);
    app.repo.setSetting('onboarding.briefDone', true);
    app.repo.setSetting('onboarding.done', true);
    const { ensureLegacyBlueprint } = await import('../src/engine/blueprint.ts');
    ensureLegacyBlueprint(app.repo);
    const bp = confirmedBlueprint(app.repo)!;
    assert.equal(bp.source, 'legacy');
    assert.deepEqual(bp.data.blocks.map((b) => b.id), ['content_ops']);
    ensureLegacyBlueprint(app.repo);
    assert.equal(app.repo.many('SELECT 1 FROM blueprints').length, 1, '한 번만');
    assert.deepEqual(planCycle(app.repo).blocks, ['content_ops'], '킥오프 없이 지금까지처럼');
  } finally {
    done();
  }
});
