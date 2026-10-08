import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import type { App } from '../src/app.ts';
import type { ChecklistItem, Todo } from '../src/core/types.ts';
import { startCycle } from '../src/engine/cycle.ts';
import { decide } from '../src/engine/decisions.ts';
import { createTodosFrom, listTodos, setTodoDone } from '../src/engine/todos.ts';
import { createHttpServer } from '../src/server/http.ts';
import { coreRoutes } from '../src/server/routes.ts';
import { workRoutes } from '../src/server/routes-work.ts';
import { flowBlocksView, shellState } from '../src/server/views.ts';
import { documentDetail, documentsView } from '../src/server/work.ts';
import { makeApp, setupManager, until } from './helpers.ts';

/** 카페 사업 — 설계도 확정까지(매니저만) */
async function cafe(app: App): Promise<void> {
  app.onboarding.seenIntro();
  app.repo.createOffice('골목커피', '동네 직장인을 위한 작은 카페를 열려고 해요. 메뉴와 가격, 오픈 준비를 혼자 하기 벅차요.');
  app.onboarding.confirmPower();
  const req = app.onboarding.startInterview();
  await until(() => app.requests.get(req.id)?.status === 'done', 8000, '면접');
  app.onboarding.hireFromCandidate({ role: 'manager', archetype: 'careful', name: '미나' });
  const bpReq = app.onboarding.submitSetup({ stage: '준비하고 있어요', customer: '근처 직장인', goal: '메뉴 · 가격 확정' });
  await until(() => app.requests.get(bpReq.id)?.status === 'done', 8000, '설계도');
  app.onboarding.confirmBlueprint({ blocks: ['pricing', 'prep_checklist', 'market_research'] });
  app.onboarding.finish();
  app.start();
}

const openConfirm = (app: App, kind: string) => app.repo.openDecisions().find((d) => d.kind === 'artifact_confirm' && d.payload.kind === kind);

test('블록 회차 — 이번 주 블록 띠 · 문서함 상태 · 계획 확정 → 내 할 일 → 체크 → 주간 회고 입력에 반영', async () => {
  const { app, done } = makeApp();
  try {
    await cafe(app);
    const c1 = startCycle(app.repo, 'manual');
    let fb = flowBlocksView(app, app.repo.getCycle(c1.id))!;
    assert.deepEqual(fb.map((b) => b.id), ['kickoff']);
    assert.deepEqual(Object.keys(fb[0]!).sort(), ['confirm', 'detail', 'done', 'id', 'name', 'state', 'tasks', 'who']);
    assert.deepEqual(fb[0]!.who, ['미나']);

    await until(() => !!openConfirm(app, 'kickoff.plan'), 10000, '계획 확인');
    fb = flowBlocksView(app, app.repo.getCycle(c1.id))!;
    assert.equal(fb[0]!.state, 'me');
    assert.equal(fb[0]!.confirm, 1);
    let docs = documentsView(app.repo);
    assert.deepEqual(docs.groups.map((g) => g.block), ['kickoff']);
    assert.equal(docs.groups[0]!.items[0]!.status, 'waiting');
    assert.equal(docs.groups[0]!.items[0]!.shape, 'doc');

    // 확정 → 실행 계획의 대표 할 일이 '내 할 일'로
    const d1 = openConfirm(app, 'kickoff.plan')!;
    const plan = app.repo.getArtifact(d1.artifactId!)!;
    decide(app.repo, app.learning, d1.id, { action: 'approve' });
    const ownerTasks = plan.meta.ownerTasks as string[];
    let todos = listTodos(app.repo);
    assert.deepEqual(todos.open.map((t) => t.text), ownerTasks);
    assert.ok(todos.open.every((t) => t.source === 'plan' && t.artifactId === plan.id && t.artifactTitle === plan.title && t.status === 'open'));
    assert.equal((await shellState(app)).counts.todos, ownerTasks.length);
    const item = documentsView(app.repo).groups[0]!.items[0]!;
    assert.equal(item.status, 'confirmed');
    assert.ok(item.confirmedAt);
    // 같은 결과물을 다시 확정해도 같은 글은 건너뛴다
    assert.equal(createTodosFrom(app.repo, plan).length, 0);

    // 대표가 하나 체크 → 다음 회고가 읽는다
    const checked = setTodoDone(app.repo, todos.open[0]!.id, true);
    assert.equal(checked.status, 'done');
    assert.ok(checked.doneAt);
    todos = listTodos(app.repo);
    assert.equal(todos.done.length, 1);
    assert.equal(todos.open.length, ownerTasks.length - 1);

    await until(() => app.repo.getCycle(c1.id)?.status === 'done', 5000, '회차 끝');
    const c2 = startCycle(app.repo, 'manual');
    fb = flowBlocksView(app, app.repo.getCycle(c2.id))!;
    assert.deepEqual(fb.map((b) => b.id), app.repo.getCycle(c2.id)!.blocks);
    assert.equal(fb.at(-1)!.id, 'weekly_retro');
    const research = fb.find((b) => b.id === 'market_research');
    if (research) {
      assert.equal(research.state, 'skipped', '리서처가 없으면 건너뜀');
      assert.match(research.detail, /채용 후/);
      assert.equal(research.tasks, 0);
    }

    const retro = app.repo.listTasks(c2.id).find((t) => t.kind === 'weekly_retro.retro')!;
    await until(() => app.repo.getTask(retro.id)?.status === 'done', 15000, '회고');
    const retroDoc = app.repo.latestArtifact(retro.itemId)!;
    assert.match(retroDoc.body, /## 대표 할 일/);
    assert.match(retroDoc.body, new RegExp(`끝낸 것 1개: ${ownerTasks[0]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));

    // 체크리스트 확정 → [대표] 항목만 할 일로(기한 포함)
    await until(() => !!openConfirm(app, 'prep_checklist.list'), 10000, '체크리스트 확인');
    const dc = openConfirm(app, 'prep_checklist.list')!;
    const list = app.repo.getArtifact(dc.artifactId!)!;
    assert.equal(list.meta.shape, 'checklist');
    decide(app.repo, app.learning, dc.id, { action: 'approve' });
    const ceo = (list.meta.items as ChecklistItem[]).filter((x) => x.owner === 'ceo');
    const fromList = listTodos(app.repo).open.filter((t) => t.source === 'checklist');
    assert.deepEqual(fromList.map((t) => t.text), ceo.map((x) => x.text));
    assert.equal(fromList[0]!.due, ceo[0]!.due);

    // 가격 — 수정 요청하면 '고치는 중', 수정본이 나오면 다시 '확인 대기'
    await until(() => !!openConfirm(app, 'pricing.calc'), 10000, '가격 확인');
    const dp = openConfirm(app, 'pricing.calc')!;
    assert.equal(app.repo.getArtifact(dp.artifactId!)!.meta.shape, 'table');
    decide(app.repo, app.learning, dp.id, { action: 'reject', comment: '원가에 컵 홀더도 넣어 주세요' });
    const pricingItem = () => documentsView(app.repo).groups.find((g) => g.block === 'pricing')!.items[0]!;
    assert.equal(pricingItem().status, 'revising');
    await until(() => pricingItem().status === 'waiting', 10000, '수정본 확인');
    const detail = documentDetail(app.repo, dp.itemId!);
    assert.equal(detail.item.version, 2);
    assert.deepEqual(detail.versions.map((v) => v.version), [1, 2]);
    assert.deepEqual(detail.decisions.map((d) => d.status), ['rejected', 'open']);
    assert.equal(detail.artifact.meta.shape, 'table');

    // 문서함: 블록별 묶음(카탈로그 순서), 회고는 확인 없는 블록
    docs = documentsView(app.repo);
    const order = docs.groups.map((g) => g.block);
    assert.deepEqual(order, ['kickoff', 'weekly_retro', 'pricing', 'prep_checklist'].filter((b) => order.includes(b)));
    assert.equal(docs.groups.find((g) => g.block === 'weekly_retro')!.items[0]!.status, 'draft');
    assert.ok(docs.groups.every((g) => g.items.every((i) => i.author === '미나' && i.cycleLabel)));
  } finally {
    done();
  }
});

test('콘텐츠 회차 · 옛 사무실 — 블록 띠는 null(화면은 7단계 flow), 문서함에 콘텐츠 결과물은 없음', async () => {
  const { app, done } = makeApp();
  try {
    await setupManager(app);
    app.repo.setSetting('onboarding.briefDone', true);
    const c = startCycle(app.repo, 'manual');
    assert.deepEqual(c.blocks, ['content_ops']);
    assert.equal(flowBlocksView(app, c), null);
    const state = await shellState(app);
    assert.equal(state.flowBlocks, null);
    assert.equal(state.counts.todos, 0);
    assert.equal(state.flow.length, 7);
    app.start();
    await until(() => app.repo.listArtifacts(c.id).length > 0, 10000, '콘텐츠 결과물');
    assert.deepEqual(documentsView(app.repo).groups, []);
    assert.equal(app.repo.listArtifacts(c.id)[0]!.meta.shape, 'post');
    // 블록과 콘텐츠 운영이 같이 있는 회차 — 콘텐츠 업무는 한 칸으로
    const mixed = app.repo.createCycle('섞인 회차', 'manual', null, ['pricing', 'content_ops']);
    assert.deepEqual(flowBlocksView(app, mixed)!.map((b) => [b.id, b.state]), [['pricing', 'waiting'], ['content_ops', 'waiting']]);
  } finally {
    done();
  }
});

test('HTTP 계약 — /api/meta · /api/documents · 내려받기 · /api/todos', async () => {
  const { app, done } = makeApp();
  const server = createHttpServer({ routes: [...coreRoutes(app), ...workRoutes(app)], staticDir: '.', allowedHosts: new Set(['127.0.0.1']), onStream: () => {}, vendor: {}, media: () => null, authorize: () => true });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const get = async (p: string) => (await fetch(base + p)).json() as Promise<Record<string, unknown>>;
    const meta = await get('/api/meta') as Record<string, Record<string, unknown>>;
    assert.deepEqual(meta.roles!.editor, { label: '편집자', desc: '교정 담당', title: '편집자 : 교정 담당', kin: 'writer' });
    assert.deepEqual(meta.roles!.manager, { label: '매니저', desc: '계획 · 조율 담당', title: '매니저 : 계획 · 조율 담당', kin: null });
    assert.deepEqual(meta.roles!.seo, { label: 'SEO', desc: '검색 담당', title: 'SEO : 검색 담당', kin: 'researcher' });
    assert.deepEqual(meta.kinds!.blog_draft, { label: '블로그', block: 'content_ops' });
    assert.deepEqual(meta.kinds!['pricing.calc'], { label: '가격 · 원가 계산', block: 'pricing' });
    assert.equal(meta.decisionKinds!.artifact_confirm, '결과물 확인');
    assert.equal(meta.platforms!.threads, 'Threads');
    assert.equal(meta.statuses!.quota_wait, '멈춤', '상태 낱말 여섯 개');
    assert.equal(meta.statusDetails!.quota_wait, '한도 풀리길 기다리는 중');
    assert.equal(meta.stages!.prep, '준비 중');
    assert.ok((meta.blocks as unknown as Array<{ id: string; shape: string }>).some((b) => b.id === 'prep_checklist' && b.shape === 'checklist'));

    await cafe(app);
    startCycle(app.repo, 'manual');
    await until(() => !!openConfirm(app, 'kickoff.plan'), 10000, '계획 확인');
    const d = openConfirm(app, 'kickoff.plan')!;
    decide(app.repo, app.learning, d.id, { action: 'approve' });

    const docs = await get('/api/documents') as { groups: Array<{ block: string; blockName: string; items: Array<Record<string, unknown>> }> };
    assert.equal(docs.groups[0]!.blockName, '사업 진단 · 이번 달 실행 계획');
    assert.deepEqual(Object.keys(docs.groups[0]!.items[0]!).sort(), ['artifactId', 'author', 'confirmedAt', 'cycleLabel', 'itemId', 'shape', 'status', 'title', 'updatedAt', 'version']);
    const one = await get(`/api/documents/${encodeURIComponent(d.itemId!)}`);
    assert.deepEqual(Object.keys(one).sort(), ['artifact', 'decisions', 'item', 'versions']);
    assert.equal((await fetch(`${base}/api/documents/nope`)).status, 404);

    const dl = await fetch(`${base}/api/artifacts/${d.artifactId}/download`);
    assert.equal(dl.status, 200);
    assert.match(dl.headers.get('content-type')!, /^text\/markdown/);
    assert.match(dl.headers.get('content-disposition')!, /^attachment;.*filename\*=UTF-8''.*v1\.md$/);
    assert.match(decodeURIComponent(dl.headers.get('content-disposition')!.split("UTF-8''")[1]!), /사업 진단 · 이번 달 실행 계획 · v1\.md/);
    assert.match(await dl.text(), /^# 사업 진단/);

    const todos = await get('/api/todos') as { open: Todo[]; done: Todo[] };
    assert.ok(todos.open.length >= 1);
    assert.deepEqual(Object.keys(todos.open[0]!).sort(), ['artifactId', 'artifactTitle', 'createdAt', 'doneAt', 'due', 'id', 'source', 'status', 'text']);
    const post = (p: string, body: unknown) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const r = await post(`/api/todos/${todos.open[0]!.id}`, { done: true });
    assert.equal(((await r.json()) as Todo).status, 'done');
    assert.equal((await post(`/api/todos/${todos.open[0]!.id}`, {})).status, 400);
    assert.equal((await post('/api/todos/td_nope', { done: true })).status, 404);
    const state = await get('/api/state') as { counts: { todos: number }; flowBlocks: unknown };
    assert.equal(state.counts.todos, todos.open.length - 1);
    assert.ok(Array.isArray(state.flowBlocks));
  } finally {
    server.close();
    done();
  }
});
