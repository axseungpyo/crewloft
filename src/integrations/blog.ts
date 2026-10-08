import { createHmac } from 'node:crypto';
import type { AppDef } from './index.ts';
import { call } from './http.ts';
import { mdToHtml } from './md.ts';
import { RequestError } from './errors.ts';

const trimUrl = (u: string): string => u.trim().replace(/\/+$/, '');
const b64url = (b: Buffer | string): string => Buffer.from(b).toString('base64url');

/** Ghost Admin API — 요청마다 키로 짧은 JWT를 서명한다(docs.ghost.org/admin-api) */
export function ghostToken(key: string): string {
  const [id, secret] = key.split(':');
  if (!id || !secret) throw new RequestError('Admin API 키는 "id:secret" 형식이에요');
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: id }));
  const body = b64url(JSON.stringify({ iat: now, exp: now + 300, aud: '/admin/' }));
  const sig = createHmac('sha256', Buffer.from(secret, 'hex')).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export const ghost: AppDef = {
  app: 'ghost',
  group: 'publish',
  how: 'Ghost 관리자 → 설정 → Integrations → 사용자 통합 추가 → Admin API 키를 복사해요. Ghost(Pro)는 Publisher 이상 플랜에서 쓸 수 있어요.',
  fields: [
    { key: 'url', label: '사이트 주소', placeholder: 'https://blog.example.com' },
    { key: 'key', label: 'Admin API 키', secret: true, placeholder: '24자id:64자secret' },
  ],
  verify: async (config, secret) => {
    const { data } = await call<{ site?: { title?: string } }>(`${trimUrl(config.url ?? '')}/ghost/api/admin/site/`, { headers: { Authorization: `Ghost ${ghostToken(secret.key ?? '')}`, 'Accept-Version': 'v5.0' } });
    return { label: data.site?.title ?? config.url ?? 'Ghost' };
  },
  adapter: (ctx) => ({
    run: async (_action, artifact, media) => {
      const url = trimUrl(ctx.config().url ?? '');
      const auth = { Authorization: `Ghost ${ghostToken(ctx.secret().key ?? '')}`, 'Accept-Version': 'v5.0' };
      let feature: string | null = null;
      const thumb = media.find((m) => m.use === 'thumbnail');
      if (thumb) {
        const form = new FormData();
        form.append('file', new Blob([new Uint8Array(await ctx.readFile(thumb.file))], { type: thumb.mime }), thumb.file);
        form.append('purpose', 'image');
        const up = await call<{ images?: Array<{ url: string }> }>(`${url}/ghost/api/admin/images/upload/`, { headers: auth, body: form });
        feature = up.data.images?.[0]?.url ?? null;
      }
      const post = {
        title: artifact.title, html: mdToHtml(artifact.body), status: 'published',
        ...(artifact.meta.excerpt ? { custom_excerpt: String(artifact.meta.excerpt).slice(0, 300) } : {}),
        ...(artifact.meta.tags?.length ? { tags: artifact.meta.tags.map((name) => ({ name })) } : {}),
        ...(feature ? { feature_image: feature } : {}),
      };
      const { data } = await call<{ posts?: Array<{ id: string; url: string }> }>(`${url}/ghost/api/admin/posts/?source=html`, { headers: auth, body: { posts: [post] }, mutating: true });
      const p = data.posts?.[0];
      return { url: p?.url ?? null, externalId: p?.id ?? null };
    },
  }),
};

export const wordpress: AppDef = {
  app: 'wordpress',
  group: 'publish',
  how: 'WordPress 관리자 → 사용자 → 프로필 → 애플리케이션 비밀번호에서 새 비밀번호를 만들어요(HTTPS 사이트만). 예약은 Agent Office가 게시 시각에 실행해요.',
  fields: [
    { key: 'url', label: '사이트 주소', placeholder: 'https://example.com' },
    { key: 'username', label: '사용자 이름' },
    { key: 'password', label: '애플리케이션 비밀번호', secret: true, placeholder: 'xxxx xxxx xxxx xxxx' },
  ],
  verify: async (config, secret) => {
    const auth = `Basic ${Buffer.from(`${config.username}:${secret.password}`).toString('base64')}`;
    const { data } = await call<{ name?: string }>(`${trimUrl(config.url ?? '')}/wp-json/wp/v2/users/me?context=edit`, { headers: { Authorization: auth } });
    return { label: `${data.name ?? config.username} @ ${trimUrl(config.url ?? '').replace(/^https?:\/\//, '')}` };
  },
  adapter: (ctx) => ({
    run: async (_action, artifact, media) => {
      const c = ctx.config();
      const url = trimUrl(c.url ?? '');
      const auth = `Basic ${Buffer.from(`${c.username}:${ctx.secret().password}`).toString('base64')}`;
      let featured: number | null = null;
      const thumb = media.find((m) => m.use === 'thumbnail');
      if (thumb) {
        const up = await call<{ id?: number }>(`${url}/wp-json/wp/v2/media`, {
          headers: { Authorization: auth, 'Content-Type': thumb.mime, 'Content-Disposition': `attachment; filename="${thumb.file}"` },
          body: new Uint8Array(await ctx.readFile(thumb.file)),
        });
        featured = up.data.id ?? null;
      }
      const { data } = await call<{ id?: number; link?: string }>(`${url}/wp-json/wp/v2/posts`, {
        headers: { Authorization: auth },
        body: { title: artifact.title, content: mdToHtml(artifact.body), status: 'publish', ...(artifact.meta.excerpt ? { excerpt: String(artifact.meta.excerpt) } : {}), ...(featured ? { featured_media: featured } : {}) },
        mutating: true,
      });
      return { url: data.link ?? null, externalId: data.id ? String(data.id) : null };
    },
  }),
};
