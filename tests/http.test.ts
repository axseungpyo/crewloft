import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { type Ctx, createHttpServer } from '../src/server/http.ts';

test('고정 경로가 매개변수 경로보다 먼저 잡힌다 — /api/decisions/batch 는 /api/decisions/:id 가 아니다', async () => {
  const server = createHttpServer({
    routes: [
      { method: 'POST', path: '/api/decisions/:id', handler: ({ params }: Ctx) => ({ by: 'id', id: params.id }) },
      { method: 'POST', path: '/api/decisions/batch', handler: () => ({ by: 'batch' }) },
    ],
    staticDir: '.', allowedHosts: new Set(['127.0.0.1']), onStream: () => {}, vendor: {}, media: () => null, authorize: () => true,
  } as never);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  try {
    const port = (server.address() as AddressInfo).port;
    const post = async (p: string) => (await fetch(`http://127.0.0.1:${port}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', host: '127.0.0.1' }, body: '{}' })).json();
    assert.deepEqual(await post('/api/decisions/batch'), { by: 'batch' });
    assert.deepEqual(await post('/api/decisions/dc_1'), { by: 'id', id: 'dc_1' });
  } finally {
    server.close();
  }
});
