import { CHANNEL_LABEL } from '../core/roles.ts';
import type { Artifact, Channel, ExternalAction } from '../core/types.ts';
import { clip } from '../core/voice.ts';
import { AmbiguousError, ConnectionAuthError } from '../integrations/errors.ts';
import type { Repo } from '../store/repo.ts';
import { blockIfChanged, liveMode } from './publishing.ts';

export interface MediaFile { id: string; use: string; file: string; mime: string; publicUrl: string | null }

/** 외부 앱 실행기 — 게시(블로그·SNS)나 저장(Notion·Docs) 하나를 실제로 수행한다 */
export interface ActionAdapter {
  run(action: ExternalAction, artifact: Artifact, media: MediaFile[]): Promise<{ url?: string | null; externalId?: string | null; note?: string }>;
}

export interface ExecutorDeps {
  adapter: (target: string) => ActionAdapter | null;
  /** 연결 상태: 연결이 없거나 만료면 실행하지 않는다 */
  connected: (target: string) => boolean;
  media: (artifact: Artifact) => MediaFile[];
  /** 재연결이 필요할 때 결정함에 알린다(연결별 한 번) */
  needReconnect: (target: string, reason: string) => void;
  /** 알림(Slack 등) */
  notify?: (kind: string, text: string, link?: string) => void;
}

const LABEL: Record<string, string> = { ghost: 'Ghost', wordpress: 'WordPress', threads: 'Threads', linkedin: 'LinkedIn', notion: 'Notion', gdocs: 'Google Docs', blog: '블로그' };

/**
 * 예약 시각이 된 게시·저장을 하나씩 실행한다.
 * - 게시는 드라이런이 기본(대표가 실제 게시를 켜야 실행).
 * - 결과가 불명확하면 '확인 필요'로 두고 다시 실행하지 않는다(PRD §12-4).
 * - 연결이 없거나 만료면 실패로 두고 재연결을 요청한다. 연결 후 같은 승인 버전으로 다시 시도할 수 있다.
 */
export class Executor {
  #repo: Repo;
  #deps: ExecutorDeps;
  #timer: NodeJS.Timeout | null = null;
  #running = new Set<string>();

  constructor(repo: Repo, deps: ExecutorDeps) {
    this.#repo = repo;
    this.#deps = deps;
  }

  start(tickMs: number): void {
    // 실행 도중 꺼졌던 기록은 결과를 알 수 없다 → 확인 필요(다시 실행하지 않음)
    for (const a of this.#repo.actionsByStatus(['running'])) {
      this.#repo.setActionStatus(a.id, 'unknown', '올라갔는지 확인해 주세요 — 올리는 도중 서버가 꺼졌어요');
    }
    this.#timer = setInterval(() => this.tick(), tickMs);
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
  }

  tick(): void {
    const nowIso = new Date().toISOString();
    for (let i = 0; i < 5; i++) {
      const a = this.#repo.claimDueAction(nowIso);
      if (!a) return;
      this.#running.add(a.id);
      void this.#run(a).finally(() => this.#running.delete(a.id));
    }
  }

  async #run(a: ExternalAction): Promise<void> {
    const repo = this.#repo;
    const artifact = repo.getArtifact(a.artifactId);
    const label = LABEL[a.target ?? a.app] ?? a.target ?? a.app;
    if (!artifact) {
      repo.setActionStatus(a.id, 'failed', '결과물을 찾을 수 없어요');
      return;
    }
    // 승인한 내용 고정(결정 80) — 보내기 직전 지문을 다시 계산해 다르면 보내지 않고 대표에게 다시 묻는다(드라이런도 같은 확인)
    if (blockIfChanged(repo, a, artifact)) {
      this.#deps.notify?.('decision', `결정함에서 다시 확인해 주세요 — 승인 뒤 내용이 바뀌어 ${label}에 보내지 않았어요: ${artifact.title}`, '/#/decisions');
      return;
    }
    if (a.kind === 'publish' && !liveMode(repo)) {
      repo.setActionStatus(a.id, 'dry_run', `${label} — 연습 게시라 실제로 올리지 않았어요(설정 › 결재 규칙에서 실제 게시를 켤 수 있어요)`);
      return;
    }
    const target = a.target ?? a.app;
    const adapter = this.#deps.adapter(target);
    if (!adapter || !this.#deps.connected(target)) {
      repo.setActionStatus(a.id, 'failed', `설정에서 ${label} 연결을 해 주세요 — 연결하면 승인한 그대로 다시 올려요`);
      this.#deps.needReconnect(target, `${label} 연결이 필요해요`);
      return;
    }
    try {
      const res = await adapter.run(a, artifact, this.#deps.media(artifact));
      const done = a.kind === 'publish' ? `${label}에 게시했어요` : `${label}에 저장했어요`;
      repo.setActionStatus(a.id, 'succeeded', res.note ?? done, { resultUrl: res.url ?? null, externalId: res.externalId ?? null });
      if (a.kind === 'publish') this.#deps.notify?.('published', `${CHANNEL_LABEL[a.app as Channel] ?? label}에 올렸어요: ${artifact.title}`, res.url ?? undefined);
    } catch (err) {
      const msg = clip(err instanceof Error ? err.message : String(err), 200);
      if (err instanceof AmbiguousError) {
        repo.setActionStatus(a.id, 'unknown', `${label}에 올라갔는지 확인해 주세요 — 결과를 받지 못했어요(${msg}). 두 번 올라가지 않게 다시 보내지 않아요`);
        this.#deps.notify?.('unknown', `${label}에 올라갔는지 확인해 주세요: ${artifact.title}`);
      } else if (err instanceof ConnectionAuthError) {
        repo.setActionStatus(a.id, 'failed', `${label} 연결을 다시 해 주세요 — ${msg}`);
        this.#deps.needReconnect(target, msg);
      } else {
        repo.setActionStatus(a.id, 'failed', `${label}에 문제가 생겼어요 — ${msg}`);
        this.#deps.notify?.('failed', `다시 시도할지 봐 주세요 — ${label} ${a.kind === 'publish' ? '게시' : '저장'}에 문제가 생겼어요: ${artifact.title}`);
      }
    }
  }

  /** 실패한 기록을 같은 승인 버전으로 다시 시도(재연결 뒤) */
  retry(actionId: string): void {
    const a = this.#repo.getAction(actionId);
    if (!a || a.status !== 'failed') throw Object.assign(new Error('문제가 생긴 기록만 다시 시도할 수 있어요'), { status: 409 });
    this.#repo.setActionStatus(a.id, 'scheduled', '다시 시도 예약', { scheduledAt: new Date().toISOString() });
  }

  /** '확인 필요'를 사람이 외부에서 확인하고 정리한다(자동 재게시 없음) */
  resolveUnknown(actionId: string, outcome: 'published' | 'not_published', url: string | null): void {
    const a = this.#repo.getAction(actionId);
    if (!a || a.status !== 'unknown') throw Object.assign(new Error('대표님 확인을 기다리는 기록만 정리할 수 있어요'), { status: 409 });
    if (outcome === 'published') this.#repo.setActionStatus(a.id, 'succeeded', '대표님이 올라간 것을 확인했어요', { resultUrl: url });
    else this.#repo.setActionStatus(a.id, 'failed', '대표님 확인: 올라가지 않았어요 — 다시 시도할 수 있어요');
  }

  /** 예약 취소(다시 검토) */
  cancel(actionId: string): void {
    const a = this.#repo.getAction(actionId);
    if (!a || (a.status !== 'scheduled' && a.status !== 'pending')) throw Object.assign(new Error('예약된 기록만 취소할 수 있어요'), { status: 409 });
    this.#repo.setActionStatus(a.id, 'cancelled', '예약을 취소했어요');
  }
}
