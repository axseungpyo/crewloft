import assert from 'node:assert/strict';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import type { Artifact, ExternalAction } from '../src/core/types.ts';
import { AmbiguousError, ConnectionAuthError } from '../src/integrations/errors.ts';
import { type AdapterContext, REGISTRY } from '../src/integrations/index.ts';
import { littleText, mdToHtml, mdToNotionBlocks } from '../src/integrations/md.ts';

// 외부 API를 흉내 내는 로컬 스텁 — 실제 외부 호출 없음
const seen: Array<{ method: string; url: string; headers: IncomingMessage['headers']; body: string }> = [];
let mode: 'ok' | 'fail502' | 'auth401' = 'ok';
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
    const json = (code: number, data: unknown, headers: Record<string, string> = {}): void => { res.writeHead(code, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(data)); };
    const u = req.url ?? '';
    if (mode === 'auth401') return json(401, { message: 'expired' });
    if (u.startsWith('/ghost/api/admin/site/')) return json(200, { site: { title: '테스트 블로그' } });
    if (u.startsWith('/ghost/api/admin/posts/')) return mode === 'fail502' ? json(502, { e: 'bad gateway' }) : json(201, { posts: [{ id: 'g1', url: 'https://blog.test/p/1' }] });
    if (u.startsWith('/wp-json/wp/v2/users/me')) return json(200, { name: '대표' });
    if (u.startsWith('/wp-json/wp/v2/posts')) return json(201, { id: 77, link: 'https://wp.test/?p=77' });
    if (u.startsWith('/threads/me')) return json(200, { id: 'u1', username: 'toollog' });
    if (u.startsWith('/threads/u1/threads_publish')) return mode === 'fail502' ? json(502, {}) : json(200, { id: 'm1' });
    if (u.startsWith('/threads/u1/threads')) return json(200, { id: 'c1' });
    if (u.startsWith('/threads/m1')) return json(200, { permalink: 'https://threads.test/m1' });
    if (u.startsWith('/linkedin/v2/userinfo')) return json(200, { sub: 'abc', name: '대표' });
    if (u.startsWith('/linkedin/rest/posts')) { res.writeHead(201, { 'x-restli-id': 'urn:li:share:9' }); return res.end(); }
    if (u.startsWith('/notion/users/me')) return json(200, { bot: { workspace_name: '내 워크스페이스' } });
    if (u.startsWith('/notion/pages/')) return json(200, { id: 'p0' });
    if (u.startsWith('/notion/pages')) return json(200, { id: 'p1', url: 'https://notion.test/p1' });
    if (u.startsWith('/slack')) { res.writeHead(200); return res.end('ok'); }
    json(404, { error: 'not found' });
  });
});
let baseUrl = '';
before(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.AO_API_BASE_THREADS = `${baseUrl}/threads`;
  process.env.AO_API_BASE_LINKEDIN = `${baseUrl}/linkedin`;
  process.env.AO_API_BASE_NOTION = `${baseUrl}/notion`;
  process.env.AO_API_BASE_SLACK = `${baseUrl}/slack`;
});
after(() => server.close());

const art = (over: Partial<Artifact> = {}): Artifact => ({ id: 'a1', cycleId: 'c', taskId: 't', itemId: 'i', kind: 'blog_draft', version: 1, title: '자동화 3가지', body: '## 소제목\n본문 **굵게** (가정)\n- 하나', sources: [], meta: { excerpt: '요약', tags: ['자동화'] }, createdAt: '', ...over });
const action = { id: 'x', kind: 'publish' } as ExternalAction;
const ctx = (config: Record<string, string>, secret: Record<string, string>): AdapterContext => ({ config: () => config, secret: () => secret, readFile: async () => Buffer.from(''), saveSecret: () => {}, saveConfig: () => {} });
const def = (app: string) => REGISTRY.find((d) => d.app === app)!;

test('마크다운 변환: HTML·Notion 블록·LinkedIn little text', () => {
  assert.match(mdToHtml('## 제목\n- 항목\n본문 **굵게**'), /<h3>제목<\/h3>[\s\S]*<li>항목<\/li>[\s\S]*<strong>굵게<\/strong>/);
  const blocks = mdToNotionBlocks('# 큰 제목\n- 목록\n> 인용\n문단');
  assert.deepEqual(blocks.map((b) => b.type), ['heading_1', 'bulleted_list_item', 'quote', 'paragraph']);
  assert.equal(littleText('(가정) #태그 @사람'), '\\(가정\\) \\#태그 \\@사람');
});

test('Ghost: JWT 서명·게시, 5xx는 확인 필요(재게시 금지)', async () => {
  mode = 'ok';
  const secret = { key: `${'a'.repeat(24)}:${'0f'.repeat(32)}` };
  const v = await def('ghost').verify!({ url: baseUrl }, secret);
  assert.equal(v.label, '테스트 블로그');
  const auth = String(seen.at(-1)!.headers.authorization);
  assert.match(auth, /^Ghost [\w-]+\.[\w-]+\.[\w-]+$/);
  const r = await def('ghost').adapter!(ctx({ url: baseUrl }, secret)).run(action, art(), []);
  assert.equal(r.url, 'https://blog.test/p/1');
  const sent = JSON.parse(seen.at(-1)!.body);
  assert.equal(sent.posts[0].status, 'published');
  assert.match(sent.posts[0].html, /<h3>소제목<\/h3>/);
  mode = 'fail502';
  await assert.rejects(def('ghost').adapter!(ctx({ url: baseUrl }, secret)).run(action, art(), []), AmbiguousError);
  mode = 'ok';
});

test('WordPress·Threads·LinkedIn·Notion·Slack 요청 형식', async () => {
  mode = 'ok';
  const wp = await def('wordpress').adapter!(ctx({ url: baseUrl, username: 'me' }, { password: 'p w' })).run(action, art(), []);
  assert.equal(wp.url, 'https://wp.test/?p=77');
  assert.match(String(seen.at(-1)!.headers.authorization), /^Basic /);

  const tv = await def('threads').verify!({}, { token: 't' });
  assert.equal(tv.config?.userId, 'u1');
  const th = await def('threads').adapter!(ctx({ userId: 'u1' }, { token: 't' })).run(action, art({ body: '짧은 글 **굵게**', kind: 'sns_draft' }), []);
  assert.equal(th.url, 'https://threads.test/m1');
  await assert.rejects(def('threads').adapter!(ctx({ userId: 'u1' }, { token: 't' })).run(action, art({ body: 'x'.repeat(501) }), []), /500자/);

  const lv = await def('linkedin').verify!({ version: '202608' }, { token: 't' });
  assert.equal(lv.config?.personUrn, 'urn:li:person:abc');
  const li = await def('linkedin').adapter!(ctx({ personUrn: 'urn:li:person:abc', version: '202608' }, { token: 't' })).run(action, art({ body: '인사이트 (가정)' }), []);
  assert.equal(li.externalId, 'urn:li:share:9');
  const liReq = seen.at(-1)!;
  assert.equal(liReq.headers['linkedin-version'], '202608');
  assert.equal(JSON.parse(liReq.body).commentary, '인사이트 \\(가정\\)');

  const nv = await def('notion').verify!({ parent: 'https://www.notion.so/Page-0123456789abcdef0123456789abcdef' }, { token: 's' });
  assert.equal(nv.config?.parentId, '0123456789abcdef0123456789abcdef');
  const np = await def('notion').adapter!(ctx({ parentId: nv.config!.parentId! }, { token: 's' })).run(action, art(), []);
  assert.equal(np.url, 'https://notion.test/p1');

  await def('slack').send!(ctx({}, { webhook: 'x' }), '테스트');
  assert.equal(JSON.parse(seen.at(-1)!.body).text, '테스트');
});

test('인증 만료(401)는 재연결 필요로 분류', async () => {
  mode = 'auth401';
  await assert.rejects(def('wordpress').adapter!(ctx({ url: baseUrl, username: 'me' }, { password: 'p' })).run(action, art(), []), ConnectionAuthError);
  mode = 'ok';
});
