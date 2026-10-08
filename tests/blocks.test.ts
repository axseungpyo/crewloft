import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeData } from '../src/ai/fake-data.ts';
import { FormatError } from '../src/ai/provider.ts';
import { buildTaskRequest, parseTaskOutput } from '../src/ai/tasks.ts';
import { BLOCKS, shapeOfKind } from '../src/blocks/catalog.ts';
import type { ChecklistItem, Task } from '../src/core/types.ts';
import { makeApp, setupManager } from './helpers.ts';

const STEPS = BLOCKS.flatMap((b) => b.steps.map((s) => ({ kind: `${b.id}.${s.step}` as const, step: s })));

test('블록 단계별 결과물 모양 — 문제 · 가설 한 장 · 가격 = 표, 준비 체크리스트 = 체크리스트, 나머지 = 문서, 콘텐츠 운영 = 게시물', () => {
  assert.equal(shapeOfKind('problem_canvas.canvas'), 'table');
  assert.equal(shapeOfKind('pricing.calc'), 'table');
  assert.equal(shapeOfKind('prep_checklist.list'), 'checklist');
  for (const k of ['kickoff.plan', 'monthly_plan.plan', 'weekly_retro.retro', 'market_research.report', 'customer_interview.guide', 'landing_copy.copy', 'first_customers.plan']) assert.equal(shapeOfKind(k), 'doc', k);
  for (const k of ['research', 'blog_draft', 'sns_draft', 'review']) assert.equal(shapeOfKind(k), 'post', k);
});

test('블록마다 견본 → 응답 형식 → 파싱: 모양 · 표 · 체크리스트가 meta에, 본문 마크다운은 늘 채움', () => {
  const ctx = { description: '동네 직장인을 위한 작은 카페', office: '골목커피', blocks: ['pricing', 'prep_checklist'], hiredRoles: ['manager'] };
  for (const { kind, step } of STEPS) {
    const data = fakeData(`task:${kind}`, ctx);
    const out = parseTaskOutput(kind, data, step.title);
    const shape = shapeOfKind(kind);
    assert.equal(out.meta.shape, shape, kind);
    assert.ok(out.body.trim(), `${kind} 본문`);
    if (shape === 'table') {
      const t = out.meta.table!;
      assert.ok(t.columns.length >= 2 && t.rows.length >= 1, `${kind} 표`);
      for (const r of t.rows) assert.equal(r.length, t.columns.length, '줄 길이 = 칸 수');
    } else assert.equal(out.meta.table, undefined, kind);
    if (shape === 'checklist') {
      const items = out.meta.items as ChecklistItem[];
      assert.ok(items.some((x) => x.owner === 'ceo') && items.some((x) => x.owner === 'team'), '대표 몫 · 팀 몫');
      assert.ok(items.some((x) => x.expert), '전문가 확인 표시');
    } else assert.equal(out.meta.items, undefined, kind);
  }
});

test('응답 형식(스키마)에 모양별 구조가 필수로 들어간다', () => {
  const base = { office: { id: 'o', name: 'o', description: 'd', stage: 0, createdAt: '' }, brief: { goal: '', direction: '', audience: '', channels: [], cadence: '', principles: [] }, employee: { id: 'e', name: '미나', role: 'manager', style: { tone: { form: 'haeyo', emoji: false }, traits: { bold: 50, speed: 50, data: 50, propose: 50 }, report: { detail: 'summary', freq: 'decide', ask: 'mid' } } }, teammates: [], inputs: [], rules: [], knowledge: [] } as never;
  const req = (kind: string) => buildTaskRequest({ ...(base as object), task: { id: 't', kind, title: 'x', meta: {}, feedback: null } as unknown as Task } as never);
  const required = (kind: string) => (req(kind).schema as { required: string[] }).required;
  assert.ok(required('pricing.calc').includes('table'));
  assert.ok(required('problem_canvas.canvas').includes('table'));
  assert.ok(required('prep_checklist.list').includes('items'));
  assert.ok(!required('market_research.report').includes('table') && !required('market_research.report').includes('items'));
  assert.ok(required('kickoff.plan').includes('weeks'));
});

test('형식이 틀리면 지어내지 않고 실패 — 표 없음 · 칸 이름 없음 · 담당 없는 항목 · 빈 체크리스트', () => {
  const ok = { title: 't', body: '본문', note: '', sources: [], assumptions: [], expertCheck: [] };
  assert.throws(() => parseTaskOutput('pricing.calc', ok, 't'), FormatError);
  assert.throws(() => parseTaskOutput('pricing.calc', { ...ok, table: { columns: ['항목'], rows: [['a']] } }, 't'), /칸 이름/);
  assert.throws(() => parseTaskOutput('pricing.calc', { ...ok, table: { columns: ['a', 'b'], rows: [] } }, 't'), /내용이 없/);
  assert.throws(() => parseTaskOutput('prep_checklist.list', { ...ok, items: [] }, 't'), /항목이 없/);
  assert.throws(() => parseTaskOutput('prep_checklist.list', { ...ok, items: [{ text: '사업자 등록', owner: 'boss', due: '', expert: false }] }, 't'), /담당/);
  // 본문이 비면 구조로 마크다운을 채운다 — 짧은 줄은 칸 수만큼 빈칸으로
  const t = parseTaskOutput('pricing.calc', { ...ok, body: '', table: { columns: ['항목', '비용'], rows: [['재료'], ['컵', '대표 확인']] } }, 't');
  assert.deepEqual(t.meta.table!.rows[0], ['재료', '']);
  assert.match(t.body, /\| 항목 \| 비용 \|/);
  const c = parseTaskOutput('prep_checklist.list', { ...ok, body: ' ', items: [{ text: '영업 신고', owner: 'ceo', due: '2주차', expert: true }] }, 't');
  assert.match(c.body, /- \[ \] \[대표\] 영업 신고 — 2주차/);
  assert.deepEqual(c.meta.items, [{ text: '영업 신고', owner: 'ceo', due: '2주차', expert: true }]);
});

test('저장 — 모양 · 구조가 결과물 meta로 저장된다', async () => {
  const { app, done } = makeApp();
  try {
    await setupManager(app);
    const manager = app.repo.employeeByRole('manager')!;
    const cycle = app.repo.createCycle('저장 확인', 'manual', null, ['prep_checklist']);
    const task = app.repo.createTask({ cycleId: cycle.id, step: 'prep_checklist.list', kind: 'prep_checklist.list', title: '준비 체크리스트', assigneeId: manager.id, dependsOn: [], itemId: `${cycle.id}:prep_checklist.list` });
    const out = parseTaskOutput(task.kind, fakeData('task:prep_checklist.list', { description: '카페' }), task.title);
    const saved = app.repo.saveArtifact(task, { title: out.title, body: out.body, sources: out.sources, meta: out.meta });
    const back = app.repo.getArtifact(saved.id)!;
    assert.equal(back.meta.shape, 'checklist');
    assert.equal((back.meta.items as ChecklistItem[]).length, 5);
  } finally {
    done();
  }
});
