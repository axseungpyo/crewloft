import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import type { OfficeEvent } from './core/types.ts';
import { createHttpServer } from './server/http.ts';
import { coreRoutes } from './server/routes.ts';
import { moreRoutes } from './server/routes-more.ts';
import { workRoutes } from './server/routes-work.ts';
import { accountRoutes } from './server/routes-account.ts';
import { connectionRoutes } from './server/routes-connections.ts';

const cfg = loadConfig();
const app = createApp(cfg);
const root = path.resolve(import.meta.dirname, '..');
const nm = (p: string): string => path.join(root, 'node_modules', p);

function stream(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' });
  res.write('retry: 2000\n\n');
  const send = (e: OfficeEvent): void => {
    res.write(`id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`);
  };
  const lastId = Number(req.headers['last-event-id'] ?? 0);
  if (lastId > 0) for (const e of app.repo.events(lastId, 500)) send(e);
  const off = app.repo.onEvent(send);
  const ping = setInterval(() => res.write(`: ping ${Date.now()}\n\n`), 15_000);
  req.on('close', () => {
    off();
    clearInterval(ping);
  });
}

/** 공개 화면(로그인 전) — 홈 · 회원가입 · 로그인 · 비밀번호 · 약관 · 임시 구글 로그인 */
const SITE_PAGES = new Set(['/home', '/login', '/signup', '/forgot', '/reset', '/verify', '/terms', '/privacy', '/auth/google']);
/** 계정 모드의 API 관문 — 계정 API · 상태 확인 · 외부 콜백 말고는 로그인한 계정만 */
function accountGate(req: IncomingMessage, pathname: string): boolean {
  if (!pathname.startsWith('/api/') || pathname.startsWith('/api/account/') || pathname === '/healthz' || pathname.startsWith('/oauth/')) return true;
  return !!app.accounts.me(req);
}

const server = createHttpServer({
  routes: [...coreRoutes(app), ...moreRoutes(app), ...workRoutes(app), ...connectionRoutes(app), ...accountRoutes(app)],
  staticDir: cfg.webDir,
  allowedHosts: new Set(cfg.allowedHosts),
  onStream: stream,
  vendor: {
    '/vendor/preact.mjs': nm('preact/dist/preact.mjs'),
    '/vendor/hooks.mjs': nm('preact/hooks/dist/hooks.mjs'),
    '/vendor/htm.mjs': nm('htm/dist/htm.module.js'),
  },
  vendorDirs: { '/vendor/three/': nm('three') },
  media: (token) => {
    const m = app.repo.one<{ file: string; mime: string }>('SELECT file, mime FROM media WHERE public_token = ?', token);
    return m ? { file: path.join(cfg.dataDir, 'media', path.basename(m.file)), mime: m.mime } : null;
  },
  authorize: (req, pathname) => (cfg.authMode === 'accounts' ? accountGate(req, pathname) : app.auth.authorize(req, pathname)),
  page: (req, pathname) => {
    // 계정 모드: 홈 → 회원가입 · 로그인 → /app. 로컬 모드: '/'는 곧바로 사무실, 홈 · 로그인 화면은 미리보기로(결정 74)
    const signedIn = cfg.authMode === 'accounts' && !!app.accounts.me(req);
    if (pathname === '/app') return cfg.authMode === 'accounts' && !signedIn ? { redirect: '/login?next=/app' } : { file: 'index.html' };
    if (pathname === '/') return cfg.authMode === 'accounts' ? (signedIn ? { redirect: '/app' } : { file: 'site.html' }) : { file: 'index.html' };
    if ((pathname === '/login' || pathname === '/signup') && signedIn) return { redirect: '/app' };
    return SITE_PAGES.has(pathname) ? { file: 'site.html' } : null;
  },
  fallbackPage: 'site.html',
});

server.listen(cfg.port, cfg.host, () => {
  console.log(`Agent Office — http://${cfg.host === '0.0.0.0' ? 'localhost' : cfg.host}:${cfg.port}`);
  console.log(`  데이터: ${cfg.dataDir}`);
  console.log(`  AI 연결: ${app.getAi().label}`);
  app.start();
});

let closing = false;
function shutdown(): void {
  if (closing) return;
  closing = true;
  server.closeAllConnections();
  server.close();
  app.stop();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
