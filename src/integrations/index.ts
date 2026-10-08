import path from 'node:path';
import type { Config } from '../config.ts';
import type { AppId, Artifact } from '../core/types.ts';
import type { ActionAdapter, MediaFile } from '../engine/executor.ts';
import type { ConnectionStore } from '../store/connections.ts';
import type { Repo } from '../store/repo.ts';
import { ghost, wordpress } from './blog.ts';
import { generateImages, openaiImage } from './image.ts';
import { linkedin, threads } from './social.ts';
import { gdocs, notion, slack } from './storage.ts';
import { clip } from '../core/voice.ts';

export const APP_LABEL: Record<string, string> = {
  notion: 'Notion', gdocs: 'Google Docs', slack: 'Slack', ghost: 'Ghost', wordpress: 'WordPress',
  threads: 'Threads', linkedin: 'LinkedIn', openai_image: '이미지 생성(OpenAI)', blog: '블로그',
};

/** 연결 하나의 정의 — 화면(S7 열쇠함)과 실행기가 같이 쓴다 */
export interface AppDef {
  app: AppId;
  group: 'save' | 'notify' | 'publish' | 'image';
  /** 입력받는 값. secret=true면 암호화 저장, 화면에 다시 보여주지 않는다 */
  fields: Array<{ key: string; label: string; secret?: boolean; placeholder?: string; help?: string }>;
  how: string;
  /** 입력값으로 연결을 확인하고 표시 이름을 돌려준다(실제 외부 호출) */
  verify?: (config: Record<string, string>, secret: Record<string, string>) => Promise<{ label: string; expiresAt?: string | null; config?: Record<string, string> }>;
  adapter?: (ctx: AdapterContext) => ActionAdapter;
  /** 알림 앱(Slack)의 메시지 보내기 */
  send?: (ctx: AdapterContext, text: string) => Promise<void>;
}

export interface AdapterContext {
  config: () => Record<string, string>;
  secret: () => Record<string, string>;
  readFile: (file: string) => Promise<Buffer>;
  /** 토큰이 갱신되면 저장한다 */
  saveSecret: (secret: Record<string, string>, expiresAt?: string | null) => void;
  saveConfig: (config: Record<string, string>) => void;
}

/** 연결 정의 등록소 — 저장 · 알림 · 게시 · 이미지 */
export const REGISTRY: AppDef[] = [notion, gdocs, slack, ghost, wordpress, threads, linkedin, openaiImage];

/**
 * 연동 허브 — 저장(자동, 허용된 위치)·게시 실행기·이미지 생성·알림을 한곳에서 다룬다.
 */
export class Integrations {
  #repo: Repo;
  #connections: ConnectionStore;
  #cfg: Config;
  #notifyQueue: Array<{ kind: string; text: string; link?: string }> = [];
  #notifyTimer: NodeJS.Timeout | null = null;

  constructor(repo: Repo, connections: ConnectionStore, cfg: Config) {
    this.#repo = repo;
    this.#connections = connections;
    this.#cfg = cfg;
  }

  label(app: string): string {
    return APP_LABEL[app] ?? app;
  }

  def(app: string): AppDef | undefined {
    return REGISTRY.find((d) => d.app === app);
  }

  #ctx(app: string): AdapterContext {
    return {
      config: () => (this.#connections.get(app)?.config ?? {}) as Record<string, string>,
      secret: () => this.#connections.secret<Record<string, string>>(app) ?? {},
      readFile: async (file) => (await import('node:fs/promises')).readFile(path.join(this.#cfg.dataDir, 'media', path.basename(file))),
      saveSecret: (secret, expiresAt) => {
        const cur = this.#connections.get(app);
        if (cur) this.#connections.upsert(app as AppId, { status: 'connected', secret, expiresAt: expiresAt ?? cur.expiresAt });
      },
      saveConfig: (config) => {
        const cur = this.#connections.get(app);
        if (cur) this.#connections.upsert(app as AppId, { status: cur.status, config });
      },
    };
  }

  adapter(target: string): ActionAdapter | null {
    const def = this.def(target);
    return def?.adapter ? def.adapter(this.#ctx(target)) : null;
  }

  mediaFor(artifact: Artifact): MediaFile[] {
    const ids = artifact.meta.mediaIds ?? [];
    if (!ids.length) return [];
    const base = this.#repo.getSetting<string>('media.publicBase');
    return ids.map((id) => this.#repo.one<{ id: string; use: string; file: string; mime: string; public_token: string | null }>('SELECT * FROM media WHERE id = ?', id))
      .filter((m): m is { id: string; use: string; file: string; mime: string; public_token: string | null } => !!m)
      .map((m) => ({ id: m.id, use: m.use, file: m.file, mime: m.mime, publicUrl: base && m.public_token ? `${base.replace(/\/$/, '')}/media/${m.public_token}` : null }));
  }

  /** 결과물 저장 후 — 저장 연결이 있으면 허용된 위치에 초안을 자동 저장(PRD §7 자율 실행), 이미지 기획이면 이미지 생성 */
  onArtifact(a: Artifact): void {
    if (a.kind === 'image_brief' && this.#connections.connected('openai_image')) void this.#makeImages(a);
    if (a.kind === 'review') return;
    for (const app of ['notion', 'gdocs'] as const) {
      if (!this.#connections.connected(app)) continue;
      this.#repo.createAction({
        kind: 'save', decisionId: null, cycleId: a.cycleId, app, target: app, artifactId: a.id, key: `${a.id}:${app}`,
        scheduledAt: new Date().toISOString(), status: 'pending',
      });
    }
  }

  /** 알림(우편함) — 같은 종류는 잠깐 모아 한 번에 보낸다. Slack 연결이 없으면 앱 안에만 남는다. */
  notify(kind: string, text: string, link?: string): void {
    if (!this.#connections.connected('slack')) return;
    const policy = this.#repo.getSetting<{ kinds?: string[]; batchSeconds?: number }>('notify.policy') ?? {};
    const kinds = policy.kinds ?? ['decision', 'reconnect', 'task', 'unknown', 'failed', 'cycle'];
    if (!kinds.includes(kind)) return;
    this.#notifyQueue.push({ kind, text, link });
    if (this.#notifyTimer) return;
    this.#notifyTimer = setTimeout(() => {
      this.#notifyTimer = null;
      const batch = this.#notifyQueue.splice(0);
      void this.#sendSlack(batch);
    }, (policy.batchSeconds ?? 20) * 1000);
  }

  async #sendSlack(batch: Array<{ kind: string; text: string; link?: string }>): Promise<void> {
    const def = this.def('slack');
    if (!def?.send || !batch.length) return;
    const base = this.#repo.getSetting<string>('app.publicBase') ?? `http://${this.#cfg.host}:${this.#cfg.port}`;
    const lines = batch.map((b) => `• ${b.text}${b.link ? ` <${base}${b.link}|열기>` : ''}`);
    try {
      await def.send(this.#ctx('slack'), lines.join('\n'));
    } catch (err) {
      this.#connections.setStatus('slack', 'error', err instanceof Error ? err.message : String(err));
    }
  }

  /** 이미지 생성 → 블로그 썸네일로 붙인다. 이미 확인 요청이 열려 있으면 새 버전으로 다시 확인받는다 */
  async #makeImages(brief: Artifact): Promise<void> {
    const repo = this.#repo;
    const secret = this.#connections.secret<Record<string, string>>('openai_image') ?? {};
    const model = String(this.#connections.get('openai_image')?.config.model || 'gpt-image-1');
    try {
      const made = await generateImages(repo, this.#cfg.dataDir, secret.apiKey ?? '', model, brief);
      if (!made.length) return;
      repo.emit('artifact_saved', `이미지 ${made.length}장을 만들었어요(${model})`, { subjectId: brief.id, data: { cycleId: brief.cycleId, media: made.map((m) => m.id) } });
      const thumb = made.find((m) => m.use === 'thumbnail');
      const blog = repo.latestArtifact(`${brief.cycleId}:blog`);
      if (!thumb || !blog) return;
      const mediaIds = [...(blog.meta.mediaIds ?? []), thumb.id];
      const open = repo.openDecisions().find((d) => d.itemId === blog.itemId);
      if (!open) {
        repo.exec('UPDATE artifacts SET meta = ? WHERE id = ?', JSON.stringify({ ...blog.meta, mediaIds }), blog.id);
        return;
      }
      const task = repo.getTask(blog.taskId);
      if (!task) return;
      repo.saveArtifact(task, { title: blog.title, body: blog.body, sources: blog.sources, meta: { ...blog.meta, mediaIds }, itemId: blog.itemId, kind: blog.kind });
      repo.emit('system', '썸네일이 붙어 블로그 새 버전으로 다시 확인이 필요해요');
    } catch (err) {
      this.#connections.setStatus('openai_image', 'error', clip(err instanceof Error ? err.message : String(err), 160));
    }
  }

  stop(): void {
    if (this.#notifyTimer) clearTimeout(this.#notifyTimer);
  }
}
