import type { App } from '../app.ts';
import { DomainError } from '../store/repo.ts';
import type { Route } from './http.ts';

/** 계정(결정 74) — 회원가입 · 로그인 · 구글(임시) · 비밀번호 찾기 · 이메일 확인. AUTH_MODE=accounts 에서만 동작한다 */
export function accountRoutes(app: App): Route[] {
  const { accounts, cfg } = app;
  const on = () => { if (cfg.authMode !== 'accounts') throw new DomainError(409, '로컬 모드에서는 계정 없이 바로 써요'); };
  const secure = (req: { headers: Record<string, unknown> }) => (req.headers['x-forwarded-proto'] ?? '') === 'https';
  const ip = (req: { socket?: { remoteAddress?: string } }) => req.socket?.remoteAddress ?? '';
  return [
    {
      method: 'GET', path: '/api/account/me',
      handler: ({ req }) => ({
        mode: cfg.authMode, account: cfg.authMode === 'accounts' ? accounts.me(req) : null,
        google: { real: !!cfg.google.clientId, mock: cfg.google.mock }, canSignup: accounts.count() === 0,
      }),
    },
    { method: 'POST', path: '/api/account/signup', handler: ({ body, req, res }) => { on(); return accounts.signup(body, res, secure(req)); } },
    { method: 'POST', path: '/api/account/login', handler: ({ body, req, res }) => { on(); return accounts.login(body, ip(req), res, secure(req)); } },
    { method: 'POST', path: '/api/account/logout', handler: ({ body, req, res }) => { accounts.logout(req, res, body.everywhere === true); return { ok: true }; } },
    { method: 'POST', path: '/api/account/forgot', handler: ({ body }) => { on(); return accounts.forgot(body); } },
    { method: 'POST', path: '/api/account/reset', handler: ({ body }) => { on(); return accounts.reset(body); } },
    { method: 'POST', path: '/api/account/verify', handler: ({ body }) => { on(); return accounts.verify(body); } },
    {
      // 구글 로그인 — 지금은 임시 계정 선택 화면(개발용). 실제 OpenID Connect는 GOOGLE_CLIENT_ID가 생기면(H3)
      method: 'POST', path: '/api/account/google-mock',
      handler: ({ body, req, res }) => { on(); if (!cfg.google.mock) throw new DomainError(404, '임시 Google 로그인은 꺼져 있어요'); return accounts.googleMock(body, res, secure(req)); },
    },
    {
      // 메일 발송 서비스가 정해지기 전 — 개발 환경에서만 '보낸 메일'을 화면에 보여 준다
      method: 'GET', path: '/api/account/outbox',
      handler: () => { if (process.env.NODE_ENV === 'production') throw new DomainError(404, '없는 경로예요'); return accounts.outbox.slice(-5).reverse(); },
    },
  ];
}
