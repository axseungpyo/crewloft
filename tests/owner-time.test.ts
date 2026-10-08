import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recordTime, timeSummary } from '../src/engine/owner-time.ts';
import { makeApp, setupManager } from './helpers.ts';

test('대표가 들인 시간 — 영역별로 더하고, 회차 · 이번 주로 묶고, 모르는 영역 · 과한 값은 막는다', async () => {
  const { app, done } = makeApp();
  try {
    await setupManager(app);
    const { repo } = app;
    recordTime(repo, { setup: 120 }); // 회차 전(처음 준비)
    const c1 = repo.createCycle('1주차', 'manual');
    recordTime(repo, { decide: 90, review: 30, office: 200, hacker: 999 });
    recordTime(repo, { decide: 10_000, direct: -5 }); // 한 번에 최대 300초, 음수는 0
    let t = timeSummary(repo);
    assert.equal(t.current?.id, c1.id);
    assert.equal(t.current?.byArea.decide, 390);
    assert.equal(t.current?.work, 420, '일한 시간 = 결정함 + 콘텐츠 확인 + 대화 + 관리');
    assert.equal(t.current?.stay, 200, '사무실에 머문 시간은 따로');
    assert.equal(t.week.setup, 120);
    assert.equal(t.week.work, 420);
    assert.equal(t.all.byArea.hacker, undefined, '모르는 영역은 버려요');
    assert.throws(() => recordTime(repo, null), /형식/);

    repo.finishCycle(c1.id, 'done', '끝');
    recordTime(repo, { review: 60 }); // 회차 사이 시간은 직전 회차 몫
    const c2 = repo.createCycle('2주차', 'manual');
    recordTime(repo, { decide: 60 });
    t = timeSummary(repo);
    assert.equal(t.cycles.find((c) => c.id === c1.id)?.work, 480);
    assert.equal(t.current?.id, c2.id);
    assert.equal(t.current?.work, 60);
    assert.equal(t.previous?.id, c1.id, '지난 회차와 비교');
    assert.match(t.rule, /움직임이 있을 때만/);
  } finally {
    done();
  }
});
