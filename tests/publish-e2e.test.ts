import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { startCycle } from '../src/engine/cycle.ts';
import { decide, markPreviewed } from '../src/engine/decisions.ts';
import { hire } from '../src/engine/hiring.ts';
import { REGISTRY } from '../src/integrations/index.ts';
import { makeApp, setupManager, until } from './helpers.ts';

test('실제 게시 켜기 → 승인 → 예약 시각 → Ghost 게시(로컬 스텁) · 결과 불명확은 확인 필요', async () => {
  let fail = false;
  const posts: unknown[] = [];
  const stub = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.url?.startsWith('/ghost/api/admin/site/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ site: { title: '스텁 블로그' } })); }
      if (req.url?.startsWith('/ghost/api/admin/posts/')) {
        posts.push(JSON.parse(body));
        if (fail) { res.writeHead(504); return res.end('gateway timeout'); }
        res.writeHead(201, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ posts: [{ id: 'p1', url: 'https://stub.blog/p1' }] }));
      }
      res.writeHead(404);
      res.end();
    });
  });
  await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
  const { app, done } = makeApp();
  try {
    await setupManager(app);
    for (const [role, name] of [['researcher', '준'], ['writer', '하나']] as const) hire(app.repo, { role, name });
    const key = `${'a'.repeat(24)}:${'0f'.repeat(32)}`;
    const v = await REGISTRY.find((d) => d.app === 'ghost')!.verify!({ url }, { key });
    app.connections.upsert('ghost', { status: 'connected', label: v.label, config: { url }, secret: { key } });
    app.repo.setSetting('publish.live', true);
    app.start();
    startCycle(app.repo, 'manual');
    await until(() => app.repo.openDecisions().some((d) => d.payload.platform === 'blog'), 15000, '블로그 확인 요청');
    const blog = app.repo.openDecisions().find((d) => d.payload.platform === 'blog')!;
    assert.equal(blog.payload.target, 'ghost');
    markPreviewed(app.repo, blog.id);
    decide(app.repo, app.learning, blog.id, { action: 'approve', scheduledAt: new Date(Date.now() - 1000).toISOString() });
    app.executor.tick();
    const action = () => app.repo.listActions(blog.cycleId!).find((a) => a.decisionId === blog.id)!;
    await until(() => action().status === 'succeeded', 5000, 'Ghost 게시');
    assert.equal(action().resultUrl, 'https://stub.blog/p1');
    assert.equal(posts.length, 1);

    // 결과 불명확(504) → 확인 필요, 다시 게시하지 않음
    fail = true;
    const posts2 = app.repo.openDecisions().filter((d) => d.payload.platform !== 'blog');
    assert.ok(posts2.length > 0);
    app.repo.setSetting('publish.blogTarget', 'ghost');
    const again = app.repo.listActions(blog.cycleId!).length;
    assert.ok(again >= 1);
    app.repo.exec("UPDATE external_actions SET status = 'scheduled', scheduled_at = ? WHERE id = ?", new Date(Date.now() - 1000).toISOString(), action().id);
    app.executor.tick();
    await until(() => action().status === 'unknown', 5000, '확인 필요');
    const before = posts.length;
    app.executor.tick();
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(posts.length, before, '확인 필요는 자동으로 다시 게시하지 않음');
  } finally {
    done();
    stub.close();
  }
});
