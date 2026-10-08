import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build, place, resources, saveSpec, spaceState, type SpaceSpec } from '../src/engine/space.ts';
import { makeApp, setupManager, until } from './helpers.ts';

const spec = ((await import('../web/js/office3d/space/samples/content.js' as string)) as { default: SpaceSpec }).default;

test('공간 짓기 — 조건·자원을 확인하고, 지으면 자원이 줄고, 실적이 생기면 다시 쌓인다', async () => {
  const { app, done } = makeApp();
  try {
    await setupManager(app);
    saveSpec(app.repo, spec);
    let s = spaceState(app.repo);
    assert.ok(s.built?.rooms.includes('chief'), '매니저 방은 지어진 채로 시작해요');
    assert.ok(!s.built?.rooms.includes('podcast'), '필요 없는 방은 빈 부지예요');
    const podcast = s.plots.find((p) => p.id === 'room:podcast');
    assert.ok(podcast, '빈 부지가 보여요');
    // 자원이 0이면 지을 수 없다
    assert.equal(resources(app.repo).balance.trust, 0);
    const deskPlot = s.plots.find((p) => p.kind === 'station' || p.kind === 'decor')!;
    assert.throws(() => build(app.repo, deskPlot.id, 'plant'), /자원이 모자라요|조건/);

    // 실제로 끝낸 일 → 자원(매니저 업무 = 신뢰)
    const mgr = app.repo.employeeByRole('manager')!;
    const c = app.repo.createCycle('테스트', 'manual');
    for (let i = 0; i < 5; i++) app.repo.exec("INSERT INTO tasks (id, cycle_id, step, kind, title, assignee_id, status, depends_on, item_id, created_at, updated_at) VALUES (?, ?, 'plan', 'plan', '기획', ?, 'done', '[]', ?, datetime('now'), datetime('now'))", `tk_test${i}`, c.id, mgr.id, `it_test${i}`);
    assert.equal(resources(app.repo).balance.trust, 50);

    s = spaceState(app.repo);
    const decor = s.plots.find((p) => p.id === 'decor:chief')!;
    assert.throws(() => build(app.repo, decor.id, 'plant'), /자원이 모자라요/, '디자인 자원은 아직 0');
    const room = s.plots.find((p) => p.id === 'room:podcast')!;
    assert.equal(room.reqs[0]!.met, s.built!.rooms.length < 3, '0단계는 방 3개까지');
    // 매니저 자리 하나 더 — 신뢰 20(직무 없는 자리) 또는 신뢰 10 + 직무 20
    const before = resources(app.repo).balance.trust;
    const deco = spaceState(app.repo).plots.find((p) => p.kind === 'station' && p.cost.trust && Object.keys(p.cost).length === 1);
    if (deco) { build(app.repo, deco.id); assert.equal(resources(app.repo).balance.trust, before - deco.cost.trust!, '지으면 자원이 줄어요'); }
    place(app.repo, 'st:chief:0:0', { x: 1.25, z: -2.5, rot: Math.PI / 2 });
    assert.deepEqual(spaceState(app.repo).placements['st:chief:0:0'], { x: 1.25, z: -2.5, rot: 1.571 });
    assert.throws(() => place(app.repo, 'bad id!', { x: 0, z: 0, rot: 0 }), /올바르지/);
    place(app.repo, 'st:chief:0:0', null);
    assert.equal(spaceState(app.repo).placements['st:chief:0:0'], undefined, '제자리로');
  } finally {
    done();
  }
});

test('새 방 요청 — 매니저가 설계하는 동안 공사 중(비용은 잡아 둠), 끝나면 설계도에 방이 붙고 지어진 채로 생긴다', async () => {
  const { app, done } = makeApp();
  try {
    await setupManager(app);
    saveSpec(app.repo, spec);
    const { moreRoutes } = await import('../src/server/routes-more.ts');
    const route = moreRoutes(app).find((r) => r.path === '/api/space/rooms')!;
    const call = (need: string) => route.handler({ params: {}, body: { need }, query: new URLSearchParams() } as never) as ReturnType<typeof spaceState>;
    assert.throws(() => call('녹음실'), /사무실 레벨 1 이상/, '0레벨은 방 3개까지(기능 자리 방 3개로 이미 참)');
    app.repo.setOfficeStage(2);
    assert.throws(() => call('녹음실'), /자원이 모자라요/, '신뢰가 모자라요');

    const mgr = app.repo.employeeByRole('manager')!;
    const c = app.repo.createCycle('테스트', 'manual');
    for (let i = 0; i < 7; i++) app.repo.exec("INSERT INTO tasks (id, cycle_id, step, kind, title, assignee_id, status, depends_on, item_id, created_at, updated_at) VALUES (?, ?, 'plan', 'plan', '기획', ?, 'done', '[]', ?, datetime('now'), datetime('now'))", `tk_n${i}`, c.id, mgr.id, `it_n${i}`);
    assert.equal(resources(app.repo).balance.trust, 70);
    assert.throws(() => call('a'), /2–80자/);

    const before = spaceState(app.repo).built!.rooms.length;
    const s = call('팟캐스트 녹음실이 필요해요');
    assert.equal(s.works.at(-1)?.status, 'designing', '공사 중');
    assert.equal(s.resources.balance.trust, 10, '비용은 공사 동안 잡아 둬요');
    assert.equal(s.resources.spent.trust, 0, '아직 쓰지는 않았어요');
    assert.ok(!s.plots.some((p) => p.id === 'new:room'), '공사 중엔 다른 새 방을 요청할 수 없어요');
    assert.throws(() => call('회의실'), /짓고 있는 방/);

    await until(() => spaceState(app.repo).works.at(-1)?.status === 'done', 3000, '완공');
    const after = spaceState(app.repo);
    const room = after.spec!.rooms.at(-1)! as unknown as { id: string; name: string; added: boolean; facilities: string[] };
    assert.equal(room.name, '녹음 부스');
    assert.equal(room.added, true, '건물 옆에 붙여 짓는 방');
    assert.deepEqual(room.facilities, [], '기능 자리는 새 방에 넣지 않아요');
    assert.notEqual(room.id, 'podcast', '있던 방 id와 겹치지 않아요');
    assert.equal(after.built!.rooms.length, before + 1, '지어진 채로 생겨요');
    assert.equal(after.resources.spent.trust, 60, '완공 때 비용을 써요');
    assert.equal(after.resources.reserved.trust, 0);
    assert.ok((after.spec!.recipes as Record<string, unknown>).acoustic_panel, '새 레시피는 설계도에 저장돼요');
    assert.ok(app.repo.events(0, 500).some((e) => e.type === 'space_built' && String(e.data.text).includes('완공')), '연대기');

    // 설계가 실패하면(중단 · 서버 재시작 등) 비용은 묶이지 않는다
    for (let i = 7; i < 13; i++) app.repo.exec("INSERT INTO tasks (id, cycle_id, step, kind, title, assignee_id, status, depends_on, item_id, created_at, updated_at) VALUES (?, ?, 'plan', 'plan', '기획', ?, 'done', '[]', ?, datetime('now'), datetime('now'))", `tk_n${i}`, c.id, mgr.id, `it_n${i}`);
    const bal = resources(app.repo).balance.trust;
    call('회의실이 필요해');
    assert.equal(resources(app.repo).balance.trust, bal - 60);
    app.requests.abortAll();
    await until(() => spaceState(app.repo).works.at(-1)?.status === 'failed', 3000, '설계 중단');
    const w = spaceState(app.repo).works.at(-1)!;
    assert.equal(w.status, 'failed');
    assert.equal(resources(app.repo).balance.trust, bal, '실패하면 잡아 둔 자원이 풀려요');
  } finally {
    done();
  }
});
