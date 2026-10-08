import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportCycle, facilityLevels, facilityState, upgradeFacility, usageLog } from '../src/engine/facilities.ts';
import { resources } from '../src/engine/space.ts';
import { makeApp, setupManager } from './helpers.ts';

test('기능 시설 업그레이드 — 레벨 · 자원 조건, 올리면 편의 기능이 열리고 자원이 줄어요', async () => {
  const { app, done } = makeApp();
  try {
    await setupManager(app);
    const { repo } = app;
    assert.equal(facilityLevels(repo).board, 1);
    assert.throws(() => exportCycle(repo, 'x'), /진행 보드 레벨 2에서 열려요/, '잠긴 기능은 서버도 막아요');
    assert.throws(() => usageLog(repo), /AI 연결 장비 레벨 2/);
    assert.throws(() => upgradeFacility(repo, 'board'), /사무실 레벨 1 이상/, '0레벨에선 못 올려요');
    repo.setOfficeStage(1);
    assert.throws(() => upgradeFacility(repo, 'board'), /자원이 모자라요/);
    assert.throws(() => upgradeFacility(repo, 'nope'), /모르는 시설/);

    // 실적 — 매니저 업무 6건(신뢰 60)
    const mgr = repo.employeeByRole('manager')!;
    const c = repo.createCycle('테스트', 'manual');
    for (let i = 0; i < 6; i++) repo.exec("INSERT INTO tasks (id, cycle_id, step, kind, title, assignee_id, status, depends_on, item_id, created_at, updated_at) VALUES (?, ?, 'plan', 'plan', '기획', ?, 'done', '[]', ?, datetime('now'), datetime('now'))", `tk_f${i}`, c.id, mgr.id, `it_f${i}`);
    assert.equal(facilityState(repo).decisions.next?.ready, true);
    upgradeFacility(repo, 'decisions');
    assert.equal(facilityLevels(repo).decisions, 2);
    assert.equal(resources(repo).balance.trust, 10, '신뢰 50을 썼어요');
    assert.equal(facilityState(repo).decisions.next, null, '지금은 Lv2가 끝');
    assert.deepEqual(facilityState(repo).decisions.unlocked, ['밖으로 나갈 것을 한 화면에서 차례로 원문 확인하고 승인']);
    assert.throws(() => upgradeFacility(repo, 'decisions'), /가장 높은 레벨/);
    assert.ok(repo.events(0, 500).some((e) => e.type === 'space_built' && String(e.data.text).includes('결재함 레벨 2')), '연대기');

    // 결재함 Lv2 — 주간 묶음을 안 켜도 골라서 승인 API가 열린다
    const { moreRoutes } = await import('../src/server/routes-more.ts');
    const batch = moreRoutes(app).find((r) => r.path === '/api/decisions/batch')!;
    assert.deepEqual(batch.handler({ params: {}, body: { action: 'approve', ids: [] }, query: new URLSearchParams() } as never), { approved: 0, failed: [] });

    // 회차 보드 Lv2 — 결과물 내려받기(최신 버전만)
    repo.setSetting('space.facilities', { ...facilityLevels(repo), board: 2 });
    const task = repo.listTasks(c.id)[0]!;
    repo.saveArtifact(task, { title: '주간 기획', body: '첫 버전', sources: [] });
    repo.saveArtifact(task, { title: '주간 기획', body: '고친 버전', sources: ['https://example.com/a'] });
    const md = exportCycle(repo, c.id);
    assert.match(md.filename, /\.md$/);
    assert.match(md.text, /고친 버전/);
    assert.doesNotMatch(md.text, /첫 버전/, '항목마다 최신 버전만');
    assert.match(md.text, /https:\/\/example\.com\/a/, '출처도 함께');
  } finally {
    done();
  }
});
