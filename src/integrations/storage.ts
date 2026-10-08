import type { AppDef } from './index.ts';
import { base, call } from './http.ts';
import { mdToHtml, mdToNotionBlocks } from './md.ts';
import { ConnectionAuthError, RequestError } from './errors.ts';

const NOTION = (): string => base('notion', 'https://api.notion.com/v1');
const NOTION_VERSION = '2022-06-28';

const notionId = (v: string): string => {
  const m = /([0-9a-f]{32})(?:\?|$)/i.exec(v.replace(/-/g, '')) ?? /([0-9a-f]{32})/i.exec(v.replace(/-/g, ''));
  return m ? m[1]! : v.trim();
};

/** Notion — 내부 통합 토큰 + 공유한 페이지 아래에 결과물 페이지를 만든다(허용된 위치에만 저장) */
export const notion: AppDef = {
  app: 'notion',
  group: 'save',
  how: 'notion.so/my-integrations에서 내부 통합을 만들고 토큰을 복사해요. 결과물을 모을 Notion 페이지에서 “연결 추가”로 그 통합을 초대한 뒤 페이지 주소를 붙여 넣어요. 그 페이지 아래에만 저장해요.',
  fields: [
    { key: 'token', label: '내부 통합 토큰', secret: true, placeholder: 'secret_… 또는 ntn_…' },
    { key: 'parent', label: '저장할 페이지 주소', placeholder: 'https://www.notion.so/…' },
  ],
  verify: async (config, secret) => {
    const headers = { Authorization: `Bearer ${secret.token}`, 'Notion-Version': NOTION_VERSION };
    const me = await call<{ name?: string; bot?: { workspace_name?: string } }>(`${NOTION()}/users/me`, { headers });
    const pageId = notionId(config.parent ?? '');
    try {
      await call(`${NOTION()}/pages/${pageId}`, { headers });
    } catch (err) {
      throw new RequestError(`페이지에 접근할 수 없어요 — 그 페이지에 통합을 초대했는지 확인해 주세요 (${(err as Error).message})`);
    }
    return { label: `${me.data.bot?.workspace_name ?? me.data.name ?? 'Notion'} · 지정 페이지`, config: { parent: config.parent ?? '', parentId: pageId } };
  },
  adapter: (ctx) => ({
    run: async (_action, artifact) => {
      const headers = { Authorization: `Bearer ${ctx.secret().token}`, 'Notion-Version': NOTION_VERSION };
      const { data } = await call<{ id?: string; url?: string }>(`${NOTION()}/pages`, {
        headers, mutating: true,
        body: {
          parent: { page_id: ctx.config().parentId },
          properties: { title: { title: [{ type: 'text', text: { content: `${artifact.title} (v${artifact.version})`.slice(0, 200) } }] } },
          children: mdToNotionBlocks(artifact.body),
        },
      });
      return { url: data.url ?? null, externalId: data.id ?? null };
    },
  }),
};

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = (): string => base('google_token', 'https://oauth2.googleapis.com/token');
const DRIVE = (): string => base('drive', 'https://www.googleapis.com');
export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export function googleAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: GOOGLE_SCOPE, access_type: 'offline', prompt: 'consent', state });
  return `${GOOGLE_AUTH}?${q}`;
}

export async function googleExchange(clientId: string, clientSecret: string, code: string, redirectUri: string): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const body = new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' });
  const { data } = await call<{ access_token: string; refresh_token?: string; expires_in: number }>(GOOGLE_TOKEN(), { method: 'POST', body: body.toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  return data;
}

/** Google Docs — OAuth(최소 권한 drive.file). 앱이 만든 'Agent Office' 폴더에 문서로 저장한다 */
export const gdocs: AppDef = {
  app: 'gdocs',
  group: 'save',
  how: 'Google Cloud 콘솔에서 OAuth 클라이언트(웹 애플리케이션)를 만들고, 승인된 리디렉션 URI에 이 앱의 주소/oauth/callback/google을 넣어요. 클라이언트 ID·보안 비밀을 넣고 “Google로 연결”을 눌러요. 권한은 이 앱이 만든 파일만(drive.file).',
  fields: [
    { key: 'clientId', label: 'OAuth 클라이언트 ID' },
    { key: 'clientSecret', label: '클라이언트 보안 비밀', secret: true },
  ],
  adapter: (ctx) => {
    const token = async (): Promise<string> => {
      const s = ctx.secret();
      if (s.accessToken && Number(s.expiry ?? 0) > Date.now() + 60_000) return s.accessToken;
      if (!s.refreshToken) throw new ConnectionAuthError('Google 연결을 다시 해 주세요');
      const body = new URLSearchParams({ client_id: ctx.config().clientId ?? '', client_secret: s.clientSecret ?? '', refresh_token: s.refreshToken, grant_type: 'refresh_token' });
      const { data } = await call<{ access_token: string; expires_in: number }>(GOOGLE_TOKEN(), { method: 'POST', body: body.toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
      ctx.saveSecret({ ...s, accessToken: data.access_token, expiry: String(Date.now() + data.expires_in * 1000) });
      return data.access_token;
    };
    return {
      run: async (_action, artifact) => {
        const auth = { Authorization: `Bearer ${await token()}` };
        let folder = ctx.config().folderId;
        if (!folder) {
          const f = await call<{ id: string }>(`${DRIVE()}/drive/v3/files`, { headers: auth, body: { name: 'Agent Office', mimeType: 'application/vnd.google-apps.folder' } });
          folder = f.data.id;
          ctx.saveConfig({ ...ctx.config(), folderId: folder });
        }
        const boundary = `ao${Date.now()}`;
        const meta = JSON.stringify({ name: `${artifact.title} (v${artifact.version})`, mimeType: 'application/vnd.google-apps.document', parents: [folder] });
        const html = `<html><body>${mdToHtml(artifact.body)}</body></html>`;
        const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${html}\r\n--${boundary}--`;
        const { data } = await call<{ id?: string }>(`${DRIVE()}/upload/drive/v3/files?uploadType=multipart&fields=id`, {
          method: 'POST', headers: { ...auth, 'content-type': `multipart/related; boundary=${boundary}` }, body, mutating: true,
        });
        return { url: data.id ? `https://docs.google.com/document/d/${data.id}/edit` : null, externalId: data.id ?? null };
      },
    };
  },
};

/** Slack — 수신 웹훅으로 알림만 보낸다(승인은 앱 결정함, 결정 32) */
export const slack: AppDef = {
  app: 'slack',
  group: 'notify',
  how: 'Slack 앱 설정 → Incoming Webhooks를 켜고 알림 받을 채널의 웹훅 주소를 붙여 넣어요. 알림만 보내고, 승인은 앱의 결정함에서 해요.',
  fields: [{ key: 'webhook', label: '웹훅 주소', secret: true, placeholder: 'https://hooks.slack.com/services/…' }],
  verify: async (_config, secret) => {
    if (!/^https:\/\/hooks\.slack\.com\/services\/\S+$/.test(secret.webhook ?? '') && !process.env.AO_API_BASE_SLACK) throw new RequestError('웹훅 주소 형식이 아니에요');
    return { label: '알림 채널(웹훅)' };
  },
  send: async (ctx, text) => {
    const url = process.env.AO_API_BASE_SLACK ?? ctx.secret().webhook ?? '';
    await call(url, { body: { text }, raw: true });
  },
};
