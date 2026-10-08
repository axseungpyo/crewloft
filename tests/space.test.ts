import assert from 'node:assert/strict';
import { test } from 'node:test';

// 도메인 맞춤 공간(결정 67) — 설계도 → 레이아웃 계산이 어떤 도메인에서도 깨지지 않는지(겹침·누락) 확인한다.
// 3D 그리기(build)는 브라우저에서만 하고, 여기서는 배치 계산만 본다.
type Room = { id: string; added?: boolean; x0: number; x1: number; z0: number; z1: number };
type Plan = { W: number; D: number; X0: number; X1: number; Z0: number; Z1: number; rooms: Room[]; nextLot: Room };
type Layout = { notes: string[]; spec: { rooms: Array<{ facilities: string[]; stations: Array<{ role: string | null }> }> }; teams: Array<{ role: string | null }>; capacity: number; plan: { W: number; D: number }; navPath: (f: number, a: { x: number; z: number }, b: { x: number; z: number }) => number[][] };
const gen = (await import('../web/js/office3d/space/generate.js' as string)) as {
  layoutFromSpec: (s: unknown) => Layout; normalize: (s: unknown) => { spec: Layout['spec']; notes: string[] }; FACILITIES: string[];
};
const samples = ['music', 'lab', 'content'];

for (const name of samples) {
  test(`공간 설계도 견본 '${name}' — 기능 자리 6종·직무 4종이 다 있고 레이아웃이 계산된다`, async () => {
    const spec = ((await import(`../web/js/office3d/space/samples/${name}.js` as string)) as { default: unknown }).default;
    const layout = gen.layoutFromSpec(spec);
    for (const f of gen.FACILITIES) assert.equal(layout.spec.rooms.filter((r) => r.facilities.includes(f)).length, 1, `${f} 자리는 정확히 한 곳`);
    for (const role of ['manager', 'researcher', 'writer', 'designer']) assert.ok(layout.teams.some((t) => t.role === role), `${role} 자리`);
    assert.ok(layout.capacity >= 4, '정원');
    const path = layout.navPath(0, { x: -layout.plan.W / 2 + 1, z: layout.plan.D / 2 - 1 }, { x: layout.plan.W / 2 - 1, z: -layout.plan.D / 2 + 1 });
    assert.ok(path.length >= 2, '길 찾기');
    assert.deepEqual(layout.notes.filter((n) => !n.startsWith('모르는 소품')), [], '견본은 고칠 것이 없어야 해요');
  });
}

test('엉성한 설계도도 고쳐서 짓는다 — 빠진 기능 자리는 첫 방으로, 범위 밖 값은 자른다', () => {
  const { spec, notes } = gen.normalize({ rooms: [{ id: 'a', size: 'xxl', stations: [{ role: 'hacker', count: 99 }], facilities: ['board', 'board', 'nope'] }, { id: 'b', facilities: ['board'] }] });
  assert.equal(spec.rooms.length, 2);
  for (const f of gen.FACILITIES) assert.equal(spec.rooms.filter((r) => r.facilities.includes(f)).length, 1, `${f} 한 곳`);
  assert.equal((spec.rooms[0]!.stations[0] as unknown as { count: number }).count, 6, '자리 수 상한');
  assert.equal(spec.rooms[0]!.stations[0]!.role, null, '모르는 직무는 빈자리');
  assert.ok(notes.some((n) => n.includes('decisions')), '고친 내용을 메모로 남겨요');
  const empty = gen.normalize({});
  assert.equal(empty.spec.rooms.length, 1, '방이 없으면 기본 작업실');
});

test('방들이 서로 겹치지 않고 바닥 안에 있다', async () => {
  const specs: unknown[] = [];
  for (const name of samples) specs.push(((await import(`../web/js/office3d/space/samples/${name}.js` as string)) as { default: unknown }).default);
  specs.push({ rooms: ['l', 's', 'm', 'm', 's', 'l', 's', 'm'].map((size, i) => ({ id: `r${i}`, size, stations: [{ role: 'writer', count: i % 4 + 1 }], props: ['sofa', 'plant'] })) });
  for (const spec of specs) {
    const { plan } = gen.layoutFromSpec(spec) as unknown as { plan: Plan };
    for (const r of plan.rooms) {
      assert.ok(r.x0 >= plan.X0 - 1e-6 && r.x1 <= plan.X1 + 1e-6 && r.z0 >= plan.Z0 - 1e-6 && r.z1 <= plan.Z1 + 1e-6, '바닥 안');
      for (const q of plan.rooms) if (q !== r) assert.ok(r.x1 <= q.x0 + 1e-6 || q.x1 <= r.x0 + 1e-6 || r.z1 <= q.z0 + 1e-6 || q.z1 <= r.z0 + 1e-6, '겹침 없음');
    }
  }
});

test('길 찾기는 막힌 곳을 돌아간다', async () => {
  const { NavGrid } = (await import('../web/js/office3d/space/nav.js' as string)) as { NavGrid: new (...a: number[]) => { rect: (...a: number[]) => void; path: (...a: number[]) => number[][] } };
  const g = new NavGrid(-5, -5, 5, 5);
  g.rect(-0.5, -4, 0.5, 4); // 가운데 벽(위아래 1m만 열림)
  const p = g.path(-3, 0, 3, 0);
  assert.ok(p.length > 2, '꺾어서 가요');
  for (const [x = 0, z = 0] of p.slice(1, -1)) assert.ok(!(x > -0.5 && x < 0.5 && z > -4 && z < 4), '벽을 지나지 않아요');
});

test('새 방(별관)은 오른쪽에 붙고, 있던 방은 한 치도 움직이지 않는다', async () => {
  const base = ((await import('../web/js/office3d/space/samples/content.js' as string)) as { default: { rooms: unknown[] } }).default;
  const before = (gen.layoutFromSpec(base) as unknown as { plan: Plan }).plan;
  const more = (n: number) => ({ ...base, rooms: [...base.rooms, ...Array.from({ length: n }, (_, i) => ({ id: `x${i}`, name: `새 방 ${i}`, size: ['s', 'm', 'l'][i % 3], added: true, stations: [{ role: null, station: 'desk', count: 2 }], props: ['plant', 'sofa'] }))] });
  for (const n of [1, 2, 3, 4]) {
    const after = (gen.layoutFromSpec(more(n)) as unknown as { plan: Plan }).plan;
    for (const r of before.rooms) assert.deepEqual(after.rooms.find((q) => q.id === r.id), { ...r, added: false }, `${r.id} 그대로 (${n}개 더함)`);
    assert.equal(after.X0, before.X0, '왼쪽 끝 그대로');
    const added = after.rooms.filter((r) => r.added);
    assert.equal(added.length, n);
    for (const r of added) {
      assert.ok(r.x0 >= before.X1 - 0.3 - 1e-6, '별관은 원래 건물 오른쪽');
      for (const q of after.rooms) if (q !== r) assert.ok(r.x1 <= q.x0 + 1e-6 || q.x1 <= r.x0 + 1e-6 || r.z1 <= q.z0 + 1e-6 || q.z1 <= r.z0 + 1e-6, '겹침 없음');
    }
    const L = after.nextLot;
    for (const q of after.rooms) assert.ok(L.x1 <= q.x0 + 1e-6 || q.x1 <= L.x0 + 1e-6 || L.z1 <= q.z0 + 1e-6 || q.z1 <= L.z0 + 1e-6, '다음 새 방 자리는 비어 있어요');
  }
});
