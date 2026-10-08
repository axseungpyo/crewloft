import { randomBytes } from 'node:crypto';
import type { App } from '../app.ts';
import type { AppId } from '../core/types.ts';
import { clip, eulreul } from '../core/voice.ts';
import { REGISTRY } from '../integrations/index.ts';
import { googleAuthUrl, googleExchange } from '../integrations/storage.ts';
import { DomainError } from '../store/repo.ts';
import type { Route } from './http.ts';

const redirectUri = (app: App): string => `${app.repo.getSetting<string>('app.publicBase') ?? `http://${app.cfg.host === '0.0.0.0' ? '127.0.0.1' : app.cfg.host}:${app.cfg.port}`}/oauth/callback/google`;

/** 설정 › 연결된 앱(S7 열쇠함). 비밀값은 저장만 하고 화면에 돌려주지 않는다. */
export function connectionRoutes(app: App): Route[] {
  const { repo, connections } = app;
  const def = (id: string) => {
    const d = REGISTRY.find((x) => x.app === id);
    if (!d) throw new DomainError(404, '알 수 없는 앱이에요');
    return d;
  };
  return [
    {
      method: 'GET', path: '/api/connections',
      handler: () => {
        const scheduled = repo.actionsByStatus(['scheduled', 'pending', 'failed']);
        return REGISTRY.map((d) => {
          const c = connections.get(d.app);
          return {
            app: d.app, label: app.integrations.label(d.app), group: d.group, how: d.how,
            fields: d.fields.map((f) => ({ ...f, value: f.secret ? '' : String(c?.config[f.key] ?? ''), saved: f.secret ? !!c?.hasSecret : undefined })),
            status: c?.status ?? 'disconnected', account: c?.label ?? null, expiresAt: c?.expiresAt ?? null, lastError: c?.lastError ?? null, checkedAt: c?.checkedAt ?? null,
            affected: scheduled.filter((a) => (a.target ?? a.app) === d.app).length,
            oauth: d.app === 'gdocs' ? { redirectUri: redirectUri(app) } : null,
          };
        });
      },
    },
    {
      method: 'POST', path: '/api/connections/:app',
      handler: async ({ params, body }) => {
        const d = def(params.app ?? '');
        const input = (body.config ?? {}) as Record<string, unknown>;
        const secretIn = (body.secret ?? {}) as Record<string, unknown>;
        const cur = connections.get(d.app);
        const config: Record<string, string> = { ...(cur?.config as Record<string, string> | undefined) };
        for (const f of d.fields.filter((x) => !x.secret)) if (typeof input[f.key] === 'string') config[f.key] = String(input[f.key]).trim();
        const secret: Record<string, string> = { ...(connections.secret<Record<string, string>>(d.app) ?? {}) };
        for (const f of d.fields.filter((x) => x.secret)) if (typeof secretIn[f.key] === 'string' && String(secretIn[f.key]).trim()) secret[f.key] = String(secretIn[f.key]).trim();
        for (const f of d.fields) if (!f.help && !(f.secret ? secret[f.key] : config[f.key]) && f.key !== 'model' && f.key !== 'version') throw new DomainError(400, `${eulreul(f.label)} 입력해 주세요`);
        if (d.app === 'gdocs') {
          // OAuth는 "Google로 연결"에서 마친다. 지금은 클라이언트 정보만 저장
          return connections.upsert('gdocs', { status: 'needs_reauth', label: 'Google 승인 대기', config, secret });
        }
        if (!d.verify) return connections.upsert(d.app, { status: 'connected', config, secret });
        try {
          const v = await d.verify(config, secret);
          return connections.upsert(d.app, { status: 'connected', label: v.label, config: { ...config, ...(v.config ?? {}) }, secret, expiresAt: v.expiresAt ?? null });
        } catch (err) {
          throw new DomainError(400, `연결을 확인하지 못했어요 — ${clip(err instanceof Error ? err.message : String(err), 200)}`);
        }
      },
    },
    { method: 'DELETE', path: '/api/connections/:app', handler: ({ params }) => { def(params.app ?? ''); connections.remove(params.app ?? ''); return { ok: true }; } },
    {
      method: 'POST', path: '/api/connections/:app/test',
      handler: async ({ params }) => {
        const d = def(params.app ?? '');
        if (d.app === 'slack') {
          if (!d.send) throw new DomainError(400, '알림 앱이 아니에요');
          await d.send({ config: () => ({}), secret: () => connections.secret<Record<string, string>>('slack') ?? {}, readFile: async () => Buffer.alloc(0), saveSecret: () => {}, saveConfig: () => {} }, 'Agent Office 시험 알림이에요 — 대표님이 결정할 것 · 다시 연결할 것 · 문제가 생긴 일을 여기로 알려 드려요.');
          return { ok: true, note: '시험 알림을 보냈어요' };
        }
        if (!d.verify) return { ok: true };
        const c = connections.get(d.app);
        try {
          await d.verify((c?.config ?? {}) as Record<string, string>, connections.secret<Record<string, string>>(d.app) ?? {});
          connections.setStatus(d.app, 'connected');
          return { ok: true, note: '연결이 살아 있어요' };
        } catch (err) {
          const msg = clip(err instanceof Error ? err.message : String(err), 200);
          connections.setStatus(d.app, /인증/.test(msg) ? 'needs_reauth' : 'error', msg);
          throw new DomainError(400, msg);
        }
      },
    },
    {
      method: 'GET', path: '/api/oauth/google/start',
      handler: () => {
        const c = connections.get('gdocs');
        const clientId = String(c?.config.clientId ?? '');
        if (!clientId) throw new DomainError(400, '먼저 OAuth 클라이언트 ID·보안 비밀을 저장해 주세요');
        const state = randomBytes(16).toString('hex');
        repo.setSetting('oauth.google.state', { state, at: Date.now() });
        return { url: googleAuthUrl(clientId, redirectUri(app), state) };
      },
    },
    {
      method: 'GET', path: '/oauth/callback/google',
      handler: async ({ query, res }) => {
        const page = (title: string, msg: string): void => {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end(`<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:sans-serif;padding:40px;background:#F5F4EE"><h2>${title}</h2><p>${msg}</p><p><a href="/#/settings/keys">설정으로 돌아가기</a></p></body>`);
        };
        const saved = repo.getSetting<{ state: string; at: number }>('oauth.google.state');
        if (!saved || saved.state !== query.get('state') || Date.now() - saved.at > 15 * 60_000) return page('연결하지 못했어요', '요청이 만료됐거나 올바르지 않아요. 설정에서 다시 시도해 주세요.');
        repo.deleteSetting('oauth.google.state');
        const code = query.get('code');
        if (!code) return page('연결하지 못했어요', `Google이 거절했어요: ${query.get('error') ?? '알 수 없음'}`);
        const c = connections.get('gdocs');
        const secret = connections.secret<Record<string, string>>('gdocs') ?? {};
        try {
          const t = await googleExchange(String(c?.config.clientId ?? ''), secret.clientSecret ?? '', code, redirectUri(app));
          connections.upsert('gdocs' as AppId, { status: 'connected', label: 'Google Docs · 이 앱이 만든 파일만', secret: { ...secret, accessToken: t.access_token, refreshToken: t.refresh_token ?? secret.refreshToken ?? '', expiry: String(Date.now() + t.expires_in * 1000) } });
          return page('Google Docs에 연결했어요', '이 창을 닫아도 돼요. 결과물은 Drive의 “Agent Office” 폴더에 저장돼요.');
        } catch (err) {
          return page('연결하지 못했어요', clip(err instanceof Error ? err.message : String(err), 200));
        }
      },
    },
  ];
}
