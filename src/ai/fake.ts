import { fakeData } from './fake-data.ts';
import type { AIProvider, CompleteRequest, CompleteResult, ConnectionStatus, QuotaView } from './provider.ts';
import { BudgetExceededError, QuotaExceededError, TransientError } from './provider.ts';

export interface FakeOptions {
  /** 요청 하나에 걸리는 평균 시간(ms) */
  speedMs: number;
  /** 한도 창 하나의 단위 수. 요청마다 COST만큼 쓴다 */
  quotaUnits: number;
  /** 한도 창 길이(분) */
  resetMinutes: number;
  /** 일시 오류 확률(0–1). 재시도 흐름 확인용 */
  failRate: number;
  concurrency: number;
  /** 추정 비용(USD) — 한도 단위 하나당. 가짜 AI도 비용을 내서 사용 한도 흐름을 시험한다(결정 80) */
  costPerUnitUsd?: number;
  /** 되묻기 견본 — 'sender' · 'owner'면 회차마다 자료를 받은 첫 업무가 한 번 묻는다(기본은 끔) */
  ask?: 'sender' | 'owner' | null;
}

const COST: Record<string, number> = {
  'task:research': 3, 'task:plan': 2, 'task:blog_draft': 6, 'task:newsletter': 3, 'task:sns_draft': 4,
  'task:image_brief': 2, 'task:review': 2, 'task:seo_keywords': 2, 'task:edit': 4, 'task:video_script': 3, 'task:promo_plan': 2, 'task:answer': 1, 'hire:interview': 3, 'setup:questions': 1, 'setup:blueprint': 3, 'setup:revise': 2, 'hire:samples': 1, 'dm:reply': 1, 'space:design': 3, 'space:room': 2,
};

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

/**
 * 가짜 AI — 자격증명 없이 로컬에서 흐름(인계·한도 대기·재시도·확인)을 확인하기 위한 것.
 * 형식은 실제와 같고 내용은 견본이며, 화면과 기록에 '가짜 AI'로 표시한다.
 */
export class FakeProvider implements AIProvider {
  readonly id = 'fake';
  readonly label = '견본 AI';
  readonly policy = '실제 AI를 부르지 않아요. 결과물은 견본 문장이에요.';
  readonly model = 'fake-sample';
  readonly concurrency: number;
  #opts: FakeOptions;
  #windowStart = 0;
  #used = 0;
  #askedCycles = new Set<string>();

  constructor(opts: FakeOptions) {
    this.#opts = opts;
    this.concurrency = opts.concurrency;
  }

  #resetsAt(): number {
    return this.#windowStart + this.#opts.resetMinutes * 60_000;
  }

  async complete(req: CompleteRequest, signal: AbortSignal): Promise<CompleteResult> {
    const nowMs = Date.now();
    if (!this.#windowStart || nowMs >= this.#resetsAt()) {
      this.#windowStart = nowMs;
      this.#used = 0;
    }
    const cost = COST[req.purpose] ?? (req.purpose.startsWith('task:') ? 3 : 1);
    if (this.#used + cost > this.#opts.quotaUnits) {
      throw new QuotaExceededError('견본 AI 한도에 닿았어요', new Date(this.#resetsAt()).toISOString(), false);
    }
    await sleep(Math.round(this.#opts.speedMs * (0.6 + Math.random() * 0.8) * (cost / 3)), signal);
    if (Math.random() < this.#opts.failRate) throw new TransientError('견본 AI가 잠깐 멈췄어요(연습용 오류)');
    this.#used += cost;
    // 실행 도중 사용 한도 — 이번 실행 추정 비용이 남은 돈을 넘으면 거기까지 쓰고 멈춘다(구독 CLI의 --max-budget-usd와 같은 자리)
    const estimate = Math.round(cost * (this.#opts.costPerUnitUsd ?? 0.01) * 1e6) / 1e6;
    if (req.maxBudgetUsd !== undefined && estimate > req.maxBudgetUsd) {
      const spent = Math.round(req.maxBudgetUsd * 1e6) / 1e6;
      throw new BudgetExceededError(`견본 AI 실행 상한($${spent})을 넘어 도중에 멈췄어요`, { costUsd: spent, inputTokens: Math.ceil((req.system.length + req.prompt.length) / 2), outputTokens: 0, estimated: true });
    }
    const data = fakeData(req.purpose, req.context);
    const c = req.context ?? {};
    const cycleId = typeof c.cycleId === 'string' ? c.cycleId : '';
    if (this.#opts.ask && req.purpose !== 'task:answer' && cycleId && c.hasInputs === true && c.askCount === 0 && !this.#askedCycles.has(cycleId)) {
      this.#askedCycles.add(cycleId);
      data.askBack = { to: this.#opts.ask, question: '받은 자료의 (가정) 표시 문장은 그대로 써도 될까요? 근거를 확인하고 싶어요. (견본)' };
    }
    // 추정 비용 · 토큰 — 실제 청구가 아니에요(API 환산 추정과 같은 자리)
    const inputTokens = Math.ceil((req.system.length + req.prompt.length) / 2);
    const outputTokens = Math.ceil(JSON.stringify(data).length / 2);
    return { data, usage: { costUsd: estimate, inputTokens, outputTokens, estimated: true } };
  }

  async status(): Promise<ConnectionStatus> {
    return { state: 'ready', detail: '자격증명 없이 동작해요', checkedAt: new Date().toISOString() };
  }

  quota(): QuotaView {
    const active = this.#windowStart > 0 && Date.now() < this.#resetsAt();
    return {
      usedPct: active ? Math.round((this.#used / this.#opts.quotaUnits) * 100) : 0,
      resetsAt: active ? new Date(this.#resetsAt()).toISOString() : null,
      note: `가짜 한도 — ${this.#opts.resetMinutes}분마다 재설정(실제 한도 아님)`,
    };
  }

  /** 개발용 초기화 시 한도 창도 비운다 */
  reset(): void {
    this.#windowStart = 0;
    this.#used = 0;
    this.#askedCycles.clear();
  }
}
