import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startCycle } from '../src/engine/cycle.ts';
import { decide } from '../src/engine/decisions.ts';
import { hire } from '../src/engine/hiring.ts';
import { resources } from '../src/engine/space.ts';
import { makeApp, setupManager, until } from './helpers.ts';

test('직무 추가 · 여러 명 — SEO → 기획, 작가 둘이 나눠 쓰고, 편집자 교정본이 게시 확인에 오르고, 영상 PD · 마케터 결과물이 검수로 간다', async () => {
  const { app, done } = makeApp();
  try {
    await setupManager(app);
    const { repo } = app;
    for (const [role, name] of [['researcher', '준'], ['writer', '하나'], ['writer', '태오'], ['designer', '레오'], ['editor', '은재'], ['producer', '시우'], ['marketer', '지아'], ['seo', '도하']] as const) hire(repo, { role, name });
    assert.throws(() => hire(repo, { role: 'manager', name: '도윤' }), /매니저는 한 명/);
    assert.throws(() => hire(repo, { role: 'writer', name: '하나' }), /같은 이름/);
    assert.equal(repo.listEmployees().length, 9);

    const cycle = startCycle(repo, 'manual');
    const tasks = repo.listTasks(cycle.id);
    const by = (step: string) => tasks.find((t) => t.step === step)!;
    const name = (id: string) => repo.getEmployee(id)!.name;
    assert.deepEqual(tasks.map((t) => t.step), ['research', 'seo', 'plan', 'blog', 'newsletter', 'sns', 'edit', 'image', 'video', 'promo', 'review']);
    assert.ok(by('plan').dependsOn.includes(by('seo').id), '기획은 SEO 키워드를 받아요');
    const writers = new Set(['blog', 'newsletter', 'sns'].map((s) => name(by(s).assigneeId)));
    assert.deepEqual([...writers].sort(), ['태오', '하나'], '작가 둘이 나눠 맡아요');
    assert.equal(by('edit').itemId, by('blog').itemId, '교정본은 같은 블로그 항목의 새 버전');
    assert.ok(by('image').dependsOn.includes(by('edit').id), '썸네일은 교정본을 보고 기획해요');

    app.start();
    await until(() => repo.openDecisions().some((d) => d.kind === 'publish_confirm' && d.payload.platform === 'blog'), 20000, '게시 확인');
    const blog = repo.openDecisions().find((d) => d.kind === 'publish_confirm' && d.payload.platform === 'blog')!;
    const art = repo.getArtifact(blog.artifactId!)!;
    assert.equal(repo.getTask(art.taskId)!.kind, 'edit', '게시 확인은 편집자 교정본으로');
    assert.equal(art.version, 2);
    assert.match(art.body, /교정본/);
    const review = repo.listArtifacts(cycle.id).find((a) => a.kind === 'review')!;
    assert.ok(['숏폼', '배포 계획', '검색 키워드'].every((w) => repo.listArtifacts(cycle.id).some((a) => a.title.includes(w))), '새 직무 결과물');
    assert.ok(review, '검수');

    // 교정본에 수정 요청 → 원래 작가에게(배운 것도 작가에게)
    decide(repo, app.learning, blog.id, { action: 'reject', comment: '도입을 더 짧게', scope: 'always' });
    const rev = repo.listTasks(cycle.id).find((t) => t.feedback === '도입을 더 짧게')!;
    assert.equal(rev.kind, 'blog_draft');
    assert.equal(rev.assigneeId, by('blog').assigneeId, '수정은 블로그를 쓴 작가에게');

    // 새 직무도 실적 자원을 번다
    const bal = resources(repo).earned;
    assert.ok(bal.keyword > 0 && bal.polish > 0 && bal.scene > 0 && bal.promo > 0, JSON.stringify(bal));
  } finally {
    done();
  }
});

test('같은 직무를 또 뽑을 때는 새 후보 샘플을 받는다', async () => {
  const { app, done } = makeApp();
  try {
    await setupManager(app);
    const s1 = app.onboarding.startSamples('writer');
    await until(() => app.requests.get(s1.id)?.status === 'done', 5000, '샘플');
    assert.ok((app.onboarding.state().samples as Record<string, unknown>).writer, '고르기 전에는 보여요');
    app.onboarding.hireFromCandidate({ role: 'writer', archetype: 'warm', name: '하나' });
    assert.equal((app.onboarding.state().samples as Record<string, unknown>).writer, null, '뽑고 나면 새 후보를 받아요');
    const s2 = app.onboarding.startSamples('writer');
    await until(() => app.requests.get(s2.id)?.status === 'done', 5000, '두 번째 샘플');
    assert.ok((app.onboarding.state().samples as Record<string, unknown>).writer);
  } finally {
    done();
  }
});
