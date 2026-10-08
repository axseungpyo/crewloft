import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Artifact } from '../core/types.ts';
import { newId, now, type Repo } from '../store/repo.ts';
import type { AppDef } from './index.ts';
import { base, call } from './http.ts';

const OPENAI = (): string => base('openai', 'https://api.openai.com/v1');

/** 이미지 생성(OpenAI 이미지 API 키 — 종량제, 선택). 검증 순서는 Codex → Gemini → API 키(결정 35)이며 MVP는 API 키만 붙였다 */
export const openaiImage: AppDef = {
  app: 'openai_image',
  group: 'image',
  how: 'platform.openai.com에서 API 키를 만들어 붙여 넣어요(쓴 만큼 과금 — 키에 사용 한도를 걸어 두세요). 연결하면 디자이너의 이미지 기획안으로 썸네일·정사각 이미지를 만들어요.',
  fields: [
    { key: 'apiKey', label: 'API 키', secret: true, placeholder: 'sk-…' },
    { key: 'model', label: '모델', placeholder: 'gpt-image-1' },
  ],
  verify: async (config, secret) => {
    const model = config.model || 'gpt-image-1';
    await call(`${OPENAI()}/models/${encodeURIComponent(model)}`, { headers: { Authorization: `Bearer ${secret.apiKey}` } });
    return { label: `${model} · API 키(종량제)` };
  },
};

const SIZES: Record<string, string> = { thumbnail: '1536x1024', square: '1024x1024' };

/** 이미지 기획안의 프롬프트로 이미지를 만들고 미디어로 저장한다. 공개 토큰은 게시용(공개 주소가 있을 때만 쓰임) */
export async function generateImages(repo: Repo, dataDir: string, apiKey: string, model: string, brief: Artifact): Promise<Array<{ id: string; use: string }>> {
  const prompts = brief.meta.prompts ?? [];
  const dir = path.join(dataDir, 'media');
  mkdirSync(dir, { recursive: true });
  const made: Array<{ id: string; use: string }> = [];
  for (const p of prompts) {
    const { data } = await call<{ data?: Array<{ b64_json?: string }> }>(`${OPENAI()}/images/generations`, {
      headers: { Authorization: `Bearer ${apiKey}` }, body: { model, prompt: p.prompt, size: SIZES[p.use] ?? '1024x1024', n: 1 }, timeoutMs: 120_000,
    });
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) continue;
    const id = newId('md');
    const file = `${id}.png`;
    writeFileSync(path.join(dir, file), Buffer.from(b64, 'base64'));
    repo.exec('INSERT INTO media (id, artifact_id, use, file, mime, public_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, brief.id, p.use, file, 'image/png', randomBytes(16).toString('hex'), now());
    made.push({ id, use: p.use });
  }
  return made;
}
