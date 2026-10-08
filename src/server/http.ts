import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
  body: Record<string, unknown>;
}

export interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  handler: (ctx: Ctx) => unknown;
}

const BODY_LIMIT = 1024 * 1024;
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > BODY_LIMIT) throw new HttpError(413, '요청이 너무 커요');
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    throw new HttpError(400, 'JSON 형식이 아니에요');
  }
}

function compile(p: string): { re: RegExp; keys: string[] } {
  const keys: string[] = [];
  const re = new RegExp(`^${p.replace(/:(\w+)/g, (_m, k: string) => { keys.push(k); return '([^/]+)'; })}$`);
  return { re, keys };
}

/**
 * 로컬 전용 서버의 최소 방어:
 * - Host 헤더가 허용 목록에 있어야 한다(DNS 리바인딩 방지)
 * - 변경 요청은 JSON이어야 하고, Origin이 있으면 같은 호스트여야 한다(다른 사이트의 요청 위조 방지)
 */
function guard(req: IncomingMessage, allowedHosts: ReadonlySet<string>): void {
  const host = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
  if (!allowedHosts.has(host)) throw new HttpError(403, '허용되지 않은 호스트예요');
  if (req.method === 'GET' || req.method === 'HEAD') return;
  // 외부 서비스가 부르는 콜백은 JSON이 아닐 수 있다
  if ((req.url ?? '').startsWith('/oauth/')) return;
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, '다른 출처의 요청은 받지 않아요');
  if (!(req.headers['content-type'] ?? '').includes('application/json')) throw new HttpError(415, 'JSON으로 보내 주세요');
}

export function createHttpServer(opts: {
  routes: Route[];
  staticDir: string;
  allowedHosts: ReadonlySet<string>;
  onStream: (req: IncomingMessage, res: ServerResponse) => void;
  /** URL 경로 → 파일(node_modules의 화면 라이브러리) */
  vendor: Record<string, string>;
  /** URL 접두어 → 폴더(three.js처럼 파일이 많은 라이브러리). .js 파일만 내준다 */
  vendorDirs?: Record<string, string>;
  /** 공개 미디어(게시용 이미지): 토큰 → 파일 */
  media: (token: string) => { file: string; mime: string } | null;
  /** 소유자 인증 — false면 401 */
  authorize: (req: IncomingMessage, pathname: string) => boolean;
  /** 화면 주소 → 보낼 HTML(또는 다른 주소로 보내기). 홈 · 로그인 · /app (결정 74) */
  page?: (req: IncomingMessage, pathname: string) => { file: string } | { redirect: string } | null;
  /** 없는 화면 주소일 때 보낼 HTML(그 안에서 404를 보여 준다) */
  fallbackPage?: string;
}): Server {
  // 고정 경로가 매개변수 경로보다 먼저 — /api/decisions/batch 가 /api/decisions/:id 에 잡히지 않게(순서는 그 밖엔 그대로)
  const routes = opts.routes.map((r, i) => ({ ...r, ...compile(r.path), i }))
    .sort((a, b) => a.keys.length - b.keys.length || a.i - b.i);
  const root = path.resolve(opts.staticDir);

  return createServer(async (req, res) => {
    try {
      guard(req, opts.allowedHosts);
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname.startsWith('/vendor/')) {
        let file = opts.vendor[url.pathname];
        if (!file) {
          const hit = Object.entries(opts.vendorDirs ?? {}).find(([pre]) => url.pathname.startsWith(pre));
          if (hit) {
            const base = path.resolve(hit[1]);
            const f = path.resolve(base, decodeURIComponent(url.pathname.slice(hit[0].length)));
            if (f.startsWith(base + path.sep) && f.endsWith('.js')) file = f;
          }
        }
        if (!file) throw new HttpError(404, '파일이 없어요');
        res.writeHead(200, { 'content-type': TYPES['.mjs']!, 'cache-control': 'public, max-age=3600' });
        return res.end(await readFile(file));
      }
      if (url.pathname.startsWith('/media/')) {
        const m = opts.media(url.pathname.slice(7));
        if (!m) throw new HttpError(404, '파일이 없어요');
        res.writeHead(200, { 'content-type': m.mime, 'cache-control': 'public, max-age=86400' });
        return res.end(await readFile(m.file));
      }
      if (!opts.authorize(req, url.pathname)) throw new HttpError(401, '로그인이 필요해요');
      if (url.pathname === '/api/stream' && req.method === 'GET') return opts.onStream(req, res);
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/oauth/') || url.pathname === '/healthz') {
        for (const r of routes) {
          if (r.method !== req.method) continue;
          const m = r.re.exec(url.pathname);
          if (!m) continue;
          const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1] ?? '')]));
          const body = req.method === 'GET' || url.pathname.startsWith('/oauth/') ? {} : await readJson(req);
          const out = await r.handler({ req, res, params, query: url.searchParams, body });
          if (res.headersSent || res.writableEnded) return;
          return sendJson(res, 200, out ?? { ok: true });
        }
        return sendJson(res, 404, { error: '없는 경로예요' });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, '허용되지 않은 요청이에요');
      const pg = opts.page?.(req, url.pathname) ?? null;
      if (pg && 'redirect' in pg) { res.writeHead(302, { location: pg.redirect }); return res.end(); }
      const rel = pg ? pg.file : url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      const file = path.resolve(root, rel);
      if (!file.startsWith(root + path.sep)) throw new HttpError(403, '허용되지 않은 경로예요');
      let data = await readFile(file).catch(() => null);
      let ext = path.extname(file);
      // 없는 화면 주소(확장자 없음) → 화면 셸이 404를 보여 준다
      if (!data && !path.extname(url.pathname) && opts.fallbackPage) { data = await readFile(path.resolve(root, opts.fallbackPage)).catch(() => null); ext = '.html'; if (data) { res.writeHead(404, { 'content-type': TYPES['.html'] ?? 'text/html; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(data); } }
      if (!data) throw new HttpError(404, '파일이 없어요');
      res.writeHead(200, { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(data);
    } catch (err) {
      const status = typeof (err as { status?: unknown }).status === 'number' ? (err as { status: number }).status : 500;
      if (status >= 500) console.error('[http]', err);
      if (!res.headersSent) sendJson(res, status, { error: err instanceof Error ? err.message : String(err) });
      else res.end();
    }
  });
}
