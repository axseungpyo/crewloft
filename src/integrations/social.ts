import type { AppDef } from './index.ts';
import { base, call } from './http.ts';
import { littleText, plain } from './md.ts';
import { AmbiguousError, RequestError } from './errors.ts';

const THREADS = (): string => base('threads', 'https://graph.threads.net/v1.0');
const LINKEDIN = (): string => base('linkedin', 'https://api.linkedin.com');

/** Threads — 컨테이너 생성 → 게시(2단계). 이미지는 공개 URL만 받는다(developers.facebook.com/docs/threads) */
export const threads: AppDef = {
  app: 'threads',
  group: 'publish',
  how: 'Meta for Developers에서 Threads 앱을 만들고 본인을 Threads Tester로 등록한 뒤, threads_basic·threads_content_publish 권한의 장기 액세스 토큰(60일)을 만들어 붙여 넣어요. API 예약이 없어 Agent Office가 게시 시각에 올려요.',
  fields: [{ key: 'token', label: '장기 액세스 토큰', secret: true }],
  verify: async (_config, secret) => {
    const { data } = await call<{ id?: string; username?: string }>(`${THREADS()}/me?fields=id,username&access_token=${encodeURIComponent(secret.token ?? '')}`);
    if (!data.id) throw new RequestError('Threads 사용자 정보를 읽지 못했어요');
    return { label: `@${data.username ?? data.id}`, config: { userId: data.id }, expiresAt: new Date(Date.now() + 60 * 86_400_000).toISOString() };
  },
  adapter: (ctx) => ({
    run: async (_action, artifact, media) => {
      const token = encodeURIComponent(ctx.secret().token ?? '');
      const userId = ctx.config().userId;
      const text = plain(artifact.body);
      if (text.length > 500) throw new RequestError(`Threads 글은 500자까지예요(지금 ${text.length}자)`);
      const img = media.find((m) => m.publicUrl);
      const params = new URLSearchParams({ media_type: img ? 'IMAGE' : 'TEXT', text, access_token: ctx.secret().token ?? '' });
      if (img) params.set('image_url', img.publicUrl!);
      const created = await call<{ id?: string }>(`${THREADS()}/${userId}/threads`, { method: 'POST', body: params.toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
      if (!created.data.id) throw new RequestError('컨테이너를 만들지 못했어요');
      // 게시 단계는 결과를 만드는 호출 — 응답이 불명확하면 확인 필요
      const pub = await call<{ id?: string }>(`${THREADS()}/${userId}/threads_publish?creation_id=${created.data.id}&access_token=${token}`, { method: 'POST', mutating: true });
      if (!pub.data.id) throw new AmbiguousError('게시 응답에 id가 없어요');
      let url: string | null = null;
      try {
        url = (await call<{ permalink?: string }>(`${THREADS()}/${pub.data.id}?fields=permalink&access_token=${token}`)).data.permalink ?? null;
      } catch { /* 주소는 못 읽어도 게시는 됐다 */ }
      return { url, externalId: pub.data.id, note: img || !media.length ? undefined : 'Threads에 게시했어요(이미지는 공개 주소가 없어 빼고 올렸어요)' };
    },
  }),
};

/** LinkedIn 개인 프로필 — Posts API(learn.microsoft.com/linkedin). 토큰은 60일, 갱신은 다시 인가 */
export const linkedin: AppDef = {
  app: 'linkedin',
  group: 'publish',
  how: 'LinkedIn Developers에서 앱을 만들고 “Share on LinkedIn”과 “Sign In with LinkedIn using OpenID Connect” 제품을 추가한 뒤, OAuth 토큰 도구로 openid·profile·w_member_social 권한 토큰을 만들어 붙여 넣어요. 60일마다 다시 만들어야 해요.',
  fields: [
    { key: 'token', label: '액세스 토큰', secret: true },
    { key: 'version', label: 'API 버전(YYYYMM)', placeholder: '202608', help: '활성 버전이어야 해요. 종료된 버전이면 오류 메시지에 표시돼요.' },
  ],
  verify: async (config, secret) => {
    const { data } = await call<{ sub?: string; name?: string }>(`${LINKEDIN()}/v2/userinfo`, { headers: { Authorization: `Bearer ${secret.token}` } });
    if (!data.sub) throw new RequestError('LinkedIn 사용자 정보를 읽지 못했어요');
    return { label: data.name ?? 'LinkedIn', config: { ...config, personUrn: `urn:li:person:${data.sub}` }, expiresAt: new Date(Date.now() + 60 * 86_400_000).toISOString() };
  },
  adapter: (ctx) => ({
    run: async (_action, artifact, media) => {
      const c = ctx.config();
      const headers = { Authorization: `Bearer ${ctx.secret().token}`, 'LinkedIn-Version': c.version || '202608', 'X-Restli-Protocol-Version': '2.0.0' };
      let imageUrn: string | null = null;
      const img = media[0];
      if (img) {
        const init = await call<{ value?: { uploadUrl?: string; image?: string } }>(`${LINKEDIN()}/rest/images?action=initializeUpload`, { headers, body: { initializeUploadRequest: { owner: c.personUrn } } });
        if (init.data.value?.uploadUrl && init.data.value.image) {
          await call(init.data.value.uploadUrl, { method: 'PUT', headers: { Authorization: headers.Authorization }, body: new Uint8Array(await ctx.readFile(img.file)), raw: true });
          imageUrn = init.data.value.image;
        }
      }
      const body = {
        author: c.personUrn, commentary: littleText(plain(artifact.body)), visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false,
        ...(imageUrn ? { content: { media: { id: imageUrn } } } : {}),
      };
      const res = await call(`${LINKEDIN()}/rest/posts`, { headers, body, mutating: true, raw: true });
      const urn = res.headers.get('x-restli-id');
      if (!urn) throw new AmbiguousError('게시 응답에 게시물 id가 없어요');
      return { url: `https://www.linkedin.com/feed/update/${urn}`, externalId: urn };
    },
  }),
};
