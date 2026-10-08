import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide } from '../src/engine/decisions.ts';
import { officeGrowth } from '../src/engine/office-growth.ts';
import { makeApp, setupManager, until } from './helpers.ts';

test('성장형 오피스: 자리가 차고 회차를 마치면 매니저가 레벨 업을 제안하고, 승인하면 다음 레벨로 간다', async () => {
  const { app, done } = makeApp();
  try {
    await setupManager(app);
    let g = officeGrowth(app);
    assert.equal(g.stage, 0);
    assert.equal(g.capacity, 2);
    assert.equal(g.next?.stage, 1);
    assert.equal(g.next?.ready, false);

    // 두 번째 직원 — 자리는 찼지만 회차를 아직 마치지 않았다
    app.onboarding.hireFromCandidate({ role: 'researcher', archetype: 'careful', name: '준' });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(app.repo.openDecisions().filter((d) => d.kind === 'office_move').length, 0, '조건을 다 채우기 전엔 제안하지 않아요');

    // 회차 하나를 마친다(실제 기록)
    const c = app.repo.createCycle('테스트 회차', 'manual');
    app.repo.finishCycle(c.id, 'done', '테스트 회차를 마쳤어요');
    await until(() => app.repo.openDecisions().some((d) => d.kind === 'office_move'), 2000, '레벨 업 제안');
    const move = app.repo.openDecisions().find((d) => d.kind === 'office_move')!;
    assert.equal(move.payload.to, 1);
    assert.equal(move.payload.by, '미나');
    g = officeGrowth(app);
    assert.equal(g.next?.ready, true);
    assert.equal(g.pendingDecisionId, move.id);

    // 거절하면 다음 회차를 마칠 때까지 다시 제안하지 않는다
    decide(app.repo, app.learning, move.id, { action: 'reject' });
    app.onboarding.hireFromCandidate({ role: 'writer', archetype: 'warm', name: '하나' });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(app.repo.openDecisions().filter((d) => d.kind === 'office_move').length, 0, '거절 뒤 바로 다시 제안하지 않아요');
    assert.equal(officeGrowth(app).overflow, 1, '정원을 넘은 직원은 임시 자리에 앉아요');

    const c2 = app.repo.createCycle('다음 회차', 'manual');
    app.repo.finishCycle(c2.id, 'done', '다음 회차를 마쳤어요');
    await until(() => app.repo.openDecisions().some((d) => d.kind === 'office_move'), 2000, '다시 레벨 업 제안');
    const again = app.repo.openDecisions().find((d) => d.kind === 'office_move')!;
    decide(app.repo, app.learning, again.id, { action: 'approve' });
    assert.equal(app.repo.getOffice()?.stage, 1);
    assert.ok(app.repo.events(0, 500).some((e) => e.type === 'office_moved'), '연대기에 레벨 업이 남아요');
    g = officeGrowth(app);
    assert.equal(g.name, '작은 사무실');
    assert.equal(g.overflow, 0);
    assert.equal(g.next?.ready, false, '다음 단계(한 층)는 아직이에요');
  } finally {
    done();
  }
});

test('성장 일반화(P2 결정 4) — 게시 없는 사업은 레벨 4 조건이 확정한 결과물, 마일스톤은 첫 실행 계획 확정 · 확정한 결과물 30', async () => {
  const { app, done } = makeApp();
  try {
    await setupManager(app);
    const { confirmDraft, saveDraft } = await import('../src/engine/blueprint.ts');
    const { levelConditions } = await import('../src/engine/office-growth.ts');
    const { milestones } = await import('../src/engine/growth.ts');
    const { openArtifactConfirm } = await import('../src/engine/decisions.ts');
    const keys = () => milestones(app).map((m) => m.key);

    // 설계도 없음(지금까지) — 게시 조건 · 게시 마일스톤 그대로
    assert.ok('published' in levelConditions(app.repo, 4));
    assert.ok(keys().includes('first_post') && !keys().includes('first_plan'));

    const bp = saveDraft(app.repo, {
      summary: '작은 카페', stage: 'prep', stageWhy: '', customer: '직장인', goals: [{ text: '가격 확정', check: '가격표' }],
      blocks: [{ id: 'pricing', why: '' }, { id: 'prep_checklist', why: '' }], hiring: [], split: { owner: [], team: [] }, assumptions: [], ideas: [],
    }, 'owner');
    confirmDraft(app.repo, bp.id);
    const conds = levelConditions(app.repo, 4);
    assert.ok(!('published' in conds) && conds.confirmed === 30, '실제 게시 30 → 확정한 결과물 30');
    assert.deepEqual(levelConditions(app.repo, 2), { employees: 4, cyclesDone: 4, approved: 10 }, '다른 레벨은 그대로');
    assert.ok(keys().includes('first_plan') && keys().includes('confirmed_30'));
    assert.ok(!keys().includes('first_post') && !keys().includes('posts_30'), '게시 마일스톤은 콘텐츠 운영이 있을 때만');

    // 실행 계획을 확정하면 '첫 실행 계획 확정' · 확정한 결과물이 올라간다 — 레벨 4 조건의 진행도 실제 기록
    const manager = app.repo.employeeByRole('manager')!;
    const c = app.repo.createCycle('킥오프', 'manual', null, ['kickoff']);
    const t = app.repo.createTask({ cycleId: c.id, step: 'kickoff.plan', kind: 'kickoff.plan', title: '계획', assigneeId: manager.id, dependsOn: [], itemId: `${c.id}:kickoff.plan` });
    const a = app.repo.saveArtifact(t, { title: '이번 달 실행 계획', body: '## 계획', sources: [], meta: { shape: 'doc', weeks: [{ week: 1, goal: 'g', blocks: ['pricing'] }], ownerTasks: ['매장 보기'] } });
    decide(app.repo, app.learning, openArtifactConfirm(app.repo, a)!.id, { action: 'approve' });
    const first = milestones(app).find((m) => m.key === 'first_plan')!;
    assert.equal(first.achieved, true);
    assert.ok(first.at);
    assert.equal(milestones(app).find((m) => m.key === 'confirmed_30')!.progress, 1);
    app.repo.setOfficeStage(3);
    const lv4 = officeGrowth(app).next!.conditions;
    assert.deepEqual(lv4.find((x) => x.key === 'confirmed'), { key: 'confirmed', label: '확정한 결과물', progress: 1, goal: 30, met: false });

    // 설계도에 콘텐츠 운영이 있으면 게시 마일스톤도
    const bp2 = saveDraft(app.repo, { ...bp.data, blocks: [...bp.data.blocks, { id: 'content_ops', why: '' }] }, 'owner');
    confirmDraft(app.repo, bp2.id);
    assert.ok('published' in levelConditions(app.repo, 4));
    assert.ok(keys().includes('first_post') && keys().includes('first_plan'));
  } finally {
    done();
  }
});

test('옛 사무실(합성 설계도)은 성장 조건 · 마일스톤이 지금까지 그대로', async () => {
  const { app, done } = makeApp();
  try {
    await setupManager(app);
    app.repo.setSetting('onboarding.briefDone', true);
    const { ensureLegacyBlueprint } = await import('../src/engine/blueprint.ts');
    const { levelConditions } = await import('../src/engine/office-growth.ts');
    const { milestones } = await import('../src/engine/growth.ts');
    ensureLegacyBlueprint(app.repo);
    assert.ok('published' in levelConditions(app.repo, 4));
    const keys = milestones(app).map((m) => m.key);
    assert.ok(keys.includes('posts_30') && !keys.includes('first_plan'));
  } finally {
    done();
  }
});
