import type { AIProvider, CompleteRequest } from '../ai/provider.ts';
import { AuthRequiredError, QuotaExceededError } from '../ai/provider.ts';
import type { AIRequest } from '../core/types.ts';
import { clip, hhmm } from '../core/voice.ts';
import { type Repo, newId, now } from '../store/repo.ts';
import { recordRun } from '../store/runs.ts';
import type { AIGate } from './gate.ts';

const PURPOSE: Record<string, string> = {
  'hire:interview': '매니저 후보 면접 준비', 'setup:questions': '사업 인터뷰 준비', 'setup:blueprint': '사업 설계도 작성', 'setup:revise': '사업 설계도 고치기', 'hire:samples': '후보 샘플', 'dm:reply': '직원 답장', 'space:design': '공간 설계', 'space:room': '새 방 설계',
};
export const label = (p: string): string => PURPOSE[p] ?? p;

interface Row { id: string; purpose: string; status: string; input: string; output: string | null; error: string | null; provider: string | null; cost_usd: number | null; created_at: string; finished_at: string | null }
const toReq = (r: Row): AIRequest => ({
  id: r.id, purpose: r.purpose, status: r.status as AIRequest['status'], input: JSON.parse(r.input) as Record<string, unknown>,
  output: r.output ? (JSON.parse(r.output) as unknown) : null, error: r.error, provider: r.provider, costUsd: r.cost_usd,
  createdAt: r.created_at, finishedAt: r.finished_at,
});

/**
 * 사람이 화면에서 기다리는 AI 요청(면접 후보, 기획 회의, 후보 샘플, 직원 답장).
 * 바로 id를 돌려주고 뒤에서 실행한다. 끝나면 이벤트로 알리고 화면이 결과를 다시 읽는다.
 */
export class AIRequests {
  #repo: Repo;
  #ai: () => AIProvider;
  #gate: AIGate;
  #inflight = new Map<string, AbortController>();

  constructor(repo: Repo, ai: () => AIProvider, gate: AIGate) {
    this.#repo = repo;
    this.#ai = ai;
    this.#gate = gate;
  }

  get(id: string): AIRequest | null {
    const r = this.#repo.one<Row>('SELECT * FROM ai_requests WHERE id = ?', id);
    return r ? toReq(r) : null;
  }

  latest(purpose: string, key?: string): AIRequest | null {
    const rows = this.#repo.many<Row>('SELECT * FROM ai_requests WHERE purpose = ? ORDER BY created_at DESC LIMIT 20', purpose);
    const hit = rows.map(toReq).find((r) => key === undefined || r.input.key === key);
    return hit ?? null;
  }

  /** 요청 시작. onDone은 성공한 결과로 후속 저장을 할 때 쓴다(같은 트랜잭션이 아님). */
  start(purpose: string, input: Record<string, unknown>, build: () => CompleteRequest, onDone?: (data: Record<string, unknown>) => void): AIRequest {
    const id = newId('ai');
    const provider = this.#ai();
    this.#repo.exec('INSERT INTO ai_requests (id, purpose, status, input, provider, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, purpose, 'running', JSON.stringify(input), provider.id, now());
    this.#repo.emit('ai_request', `${label(purpose)} 시작`, { subjectId: id, data: { purpose, status: 'running' } });
    const ac = new AbortController();
    this.#inflight.set(id, ac);
    void this.#run(id, purpose, provider, build, ac, onDone);
    return this.get(id)!;
  }

  async #run(id: string, purpose: string, provider: AIProvider, build: () => CompleteRequest, ac: AbortController, onDone?: (data: Record<string, unknown>) => void): Promise<void> {
    const release = await this.#gate.acquire();
    // 작업 기록(결정 80) — 화면 요청도 AI 실행 한 번마다 한 줄
    const run = { taskId: null, requestId: id, employeeId: '', provider: provider.id, model: provider.model ?? provider.id, startedAt: now() };
    try {
      const res = await provider.complete(build(), ac.signal);
      this.#repo.tx(() => {
        this.#repo.exec("UPDATE ai_requests SET status = 'done', output = ?, cost_usd = ?, finished_at = ? WHERE id = ?", JSON.stringify(res.data), res.usage.costUsd, now(), id);
        this.#repo.recordUsage({ taskId: id, employeeId: '', provider: provider.id, usage: res.usage });
        recordRun(this.#repo, { ...run, status: 'ok', errorType: null, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, costUsd: res.usage.costUsd, costEstimated: res.usage.estimated });
        onDone?.(res.data);
        this.#repo.emit('ai_request', `${label(purpose)} 끝`, { subjectId: id, data: { purpose, status: 'done' } });
      });
    } catch (err) {
      let msg = err instanceof Error ? err.message : String(err);
      if (err instanceof QuotaExceededError) msg = `${msg}${err.resetsAt ? ` — ${hhmm(err.resetsAt)} 이후 다시 시도` : ''}`;
      if (err instanceof AuthRequiredError) msg = `AI 연결 필요 — ${msg}`;
      this.#repo.exec("UPDATE ai_requests SET status = 'failed', error = ?, finished_at = ? WHERE id = ?", clip(msg, 300), now(), id);
      recordRun(this.#repo, { ...run, status: ac.signal.aborted ? 'cancelled' : 'error', errorType: err instanceof Error ? err.name : 'Error', costEstimated: true });
      this.#repo.emit('ai_request', `${label(purpose)}에 문제가 생겼어요 — ${clip(msg, 80)}`, { subjectId: id, data: { purpose, status: 'failed' } });
    } finally {
      release();
      this.#inflight.delete(id);
    }
  }

  abortAll(): void {
    for (const ac of this.#inflight.values()) ac.abort(new Error('중단됨'));
  }

  /** 서버가 다시 켜질 때 끝나지 않은 요청은 실패로 닫는다(사용자가 다시 요청) */
  recover(): void {
    this.#repo.exec("UPDATE ai_requests SET status = 'failed', error = '서버가 다시 켜져 중단됐어요 — 다시 요청해 주세요', finished_at = ? WHERE status = 'running'", now());
  }
}
