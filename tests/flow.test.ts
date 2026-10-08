import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startCycle } from '../src/engine/cycle.ts';
import { decide, markPreviewed } from '../src/engine/decisions.ts';
import { hire } from '../src/engine/hiring.ts';
import { makeApp, setupManager, until } from './helpers.ts';

test('채용 흐름: 서비스 소개 → 사업 소개 → 매니저 면접 → 사업 인터뷰 단계(결정 73)', async () => {
  const { app, done } = makeApp();
  try {
    assert.equal(app.onboarding.stage(), 'intro');
    app.onboarding.seenIntro();
    assert.equal(app.onboarding.stage(), 'describe');
    await setupManager(app);
    const manager = app.repo.employeeByRole('manager');
    assert.ok(manager?.profile.direction, '면접 진단이 프로필로 남아야 함');
    assert.equal(app.onboarding.stage(), 'setup', '매니저 다음은 사업 인터뷰');
    const samples = app.onboarding.startSamples('researcher');
    await until(() => app.requests.get(samples.id)?.status === 'done');
    app.onboarding.hireFromCandidate({ role: 'researcher', archetype: 'careful', name: '준' });
    app.onboarding.finish();
    assert.equal(app.onboarding.stage(), 'done');
  } finally {
    done();
  }
});

test('주간 회차: 인계 → 검수 → 게시물별 확인 → 수정 요청(앞으로도) → 배운 것 → 드라이런', async () => {
  const { app, done } = makeApp();
  try {
    await setupManager(app);
    for (const [role, name] of [['researcher', '준'], ['writer', '하나'], ['designer', '레오']] as const) hire(app.repo, { role, name });
    app.start();
    const cycle = startCycle(app.repo, 'manual');
    await until(() => app.repo.openDecisions().filter((d) => d.kind === 'publish_confirm').length === 7, 15000, '게시 확인 요청');

    // 인계는 받는 직원이 수락해야 완료
    const handoffs = app.repo.handoffsByStatus(cycle.id, 'accepted');
    assert.ok(handoffs.length >= 4, `수락된 인계 ${handoffs.length}`);

    const open = app.repo.openDecisions();
    const blog = open.find((d) => d.payload.platform === 'blog')!;
    const post = open.find((d) => d.payload.platform === 'linkedin')!;
    assert.ok(blog && post);
    assert.ok((blog.payload.warnings as string[]).some((w) => w.includes('연습 게시')));
    // 화면은 경고 종류를 문장이 아니라 종류 값으로 고른다 — 문장과 같은 순서 · 같은 개수
    const keys = blog.payload.warningKeys as string[];
    assert.equal(keys.length, (blog.payload.warnings as string[]).length);
    assert.equal(keys.at(-1), 'dry_run');
    assert.ok(keys.every((k) => ['no_connection', 'no_thumbnail', 'public_url', 'dry_run'].includes(k)));

    // 밖으로 등급 — 원문 미리보기 없이 승인하면 막힌다(결정 80)
    assert.throws(() => decide(app.repo, app.learning, blog.id, { action: 'approve' }), /원문을 먼저 확인/);
    markPreviewed(app.repo, blog.id);
    decide(app.repo, app.learning, blog.id, { action: 'approve' });
    const action = app.repo.listActions(cycle.id).find((a) => a.kind === 'publish' && a.decisionId === blog.id)!;
    assert.equal(action.status, 'scheduled');
    assert.throws(() => decide(app.repo, app.learning, blog.id, { action: 'approve' }), /이미 처리/);

    // 문단 코멘트 + 앞으로도 → 확정 규칙
    app.learning.addComment({ decisionId: post.id, artifactId: post.artifactId!, anchor: '0', quote: '혼자', text: '첫 문장을 더 짧게' });
    decide(app.repo, app.learning, post.id, { action: 'reject', comment: '이모지 없이 써 주세요', scope: 'always' });
    const writer = app.repo.employeeByRole('writer')!;
    const rules = app.learning.rules(writer.id, ['confirmed']);
    assert.equal(rules.length, 1);
    await until(() => app.repo.openDecisions().some((d) => d.itemId === post.itemId), 10000, '수정본 확인 요청');
    const v2 = app.repo.latestArtifact(post.itemId!)!;
    assert.equal(v2.version, 2);
    assert.deepEqual(v2.meta.appliedRules, [rules[0]!.id], '수정본에 배운 것이 적용됨');

    // 예약 시각이 되면 드라이런으로 기록(실제 게시 없음)
    app.repo.exec('UPDATE external_actions SET scheduled_at = ? WHERE id = ?', new Date(Date.now() - 1000).toISOString(), action.id);
    app.executor.tick();
    await until(() => app.repo.getAction(action.id)?.status === 'dry_run', 3000, '드라이런');
  } finally {
    done();
  }
});

test('게시 시간표: 이 주의 칸이 지났으면 같은 플랫폼 게시물을 하루씩 띄운다', async () => {
  const { proposeTime } = await import('../src/engine/publishing.ts');
  const { app, done } = makeApp();
  try {
    await setupManager(app);
    const cycle = startCycle(app.repo, 'manual', new Date('2026-10-02T03:00:00Z'));
    const now = new Date('2026-10-02T05:00:00Z');
    const times = [0, 1, 2].map((i) => proposeTime(app.repo, cycle, 'threads', i, now));
    assert.equal(new Set(times).size, 3, '서로 다른 시각');
    assert.ok(times.every((t) => Date.parse(t) > now.getTime()), '모두 미래');
    // 금요일 오전: 월·수 칸은 지났고 금 12:00 칸은 아직 — 그래도 순서대로·겹치지 않게
    const friMorning = new Date(2026, 9, 2, 10, 0);
    const fri = { ...cycle, startedAt: friMorning.toISOString(), weekStart: new Date(2026, 8, 28, 0, 0).toISOString() };
    const t2 = [0, 1, 2].map((i) => Date.parse(proposeTime(app.repo, fri, 'threads', i, friMorning)));
    assert.ok(t2[0]! < t2[1]! && t2[1]! < t2[2]!, `순서대로: ${t2.map((x) => new Date(x).toLocaleString()).join(' / ')}`);
  } finally {
    done();
  }
});
