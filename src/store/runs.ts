import { createHash } from 'node:crypto';
import type { Run } from '../core/types.ts';
import { type Repo, newId, now } from './repo.ts';

// 작업 기록(결정 80) — AI 실행 한 번마다 한 줄. 줄마다 앞 줄의 지문을 이어 붙여(지문 사슬) 나중에 고친 줄이 드러난다.

interface RunRow {
  seq: number; id: string; task_id: string | null; request_id: string | null; employee_id: string; operation: string; provider: string; model: string;
  started_at: string; ended_at: string; status: string; error_type: string | null; input_tokens: number; output_tokens: number; cost_usd: number;
  cost_estimated: number; memory: string; decision_ids: string; external_effects: string; prev_hash: string; hash: string;
}

const toRun = (r: RunRow): Run => ({
  id: r.id, taskId: r.task_id, requestId: r.request_id, employeeId: r.employee_id, operation: 'invoke_agent', provider: r.provider, model: r.model,
  startedAt: r.started_at, endedAt: r.ended_at, status: r.status as Run['status'], errorType: r.error_type, inputTokens: r.input_tokens,
  outputTokens: r.output_tokens, costUsd: r.cost_usd, costEstimated: !!r.cost_estimated, memory: JSON.parse(r.memory) as Run['memory'],
  decisionIds: JSON.parse(r.decision_ids) as string[], externalEffects: JSON.parse(r.external_effects) as string[], prevHash: r.prev_hash, hash: r.hash,
});

/** 지문 = sha256(앞 줄 지문 + 이 줄 내용). 칸 순서를 고정해 같은 내용이면 늘 같은 값 */
export function runHash(r: Omit<Run, 'hash'>): string {
  const body = [
    r.id, r.taskId, r.requestId, r.employeeId, r.operation, r.provider, r.model, r.startedAt, r.endedAt, r.status, r.errorType,
    r.inputTokens, r.outputTokens, r.costUsd, r.costEstimated, r.memory.rules, r.memory.knowledge, r.memory.inputs, r.decisionIds, r.externalEffects,
  ];
  return createHash('sha256').update(r.prevHash).update(JSON.stringify(body)).digest('hex');
}

export type RunInput = Omit<Run, 'id' | 'operation' | 'prevHash' | 'hash' | 'endedAt' | 'memory' | 'decisionIds' | 'externalEffects' | 'inputTokens' | 'outputTokens' | 'costUsd'> & {
  endedAt?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: number | null;
  memory?: Partial<Run['memory']>;
  decisionIds?: string[];
  externalEffects?: string[];
};

/** 한 줄 남긴다. 앞 줄 지문을 읽고 쓰는 일을 한 트랜잭션에서 해 사슬이 갈라지지 않게 한다 */
export function recordRun(repo: Repo, input: RunInput): Run {
  return repo.tx(() => {
    const prevHash = repo.one<{ hash: string }>('SELECT hash FROM runs ORDER BY seq DESC LIMIT 1')?.hash ?? '';
    const base: Omit<Run, 'hash'> = {
      id: newId('rn'), taskId: input.taskId, requestId: input.requestId, employeeId: input.employeeId, operation: 'invoke_agent',
      provider: input.provider, model: input.model, startedAt: input.startedAt, endedAt: input.endedAt ?? now(), status: input.status,
      errorType: input.errorType, inputTokens: input.inputTokens ?? 0, outputTokens: input.outputTokens ?? 0,
      costUsd: Math.round((input.costUsd ?? 0) * 1e6) / 1e6, costEstimated: input.costEstimated,
      memory: { rules: input.memory?.rules ?? [], knowledge: input.memory?.knowledge ?? [], inputs: input.memory?.inputs ?? [] },
      decisionIds: input.decisionIds ?? [], externalEffects: input.externalEffects ?? [], prevHash,
    };
    const run: Run = { ...base, hash: runHash(base) };
    repo.exec(
      `INSERT INTO runs (id, task_id, request_id, employee_id, operation, provider, model, started_at, ended_at, status, error_type, input_tokens, output_tokens,
        cost_usd, cost_estimated, memory, decision_ids, external_effects, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      run.id, run.taskId, run.requestId, run.employeeId, run.operation, run.provider, run.model, run.startedAt, run.endedAt, run.status, run.errorType,
      run.inputTokens, run.outputTokens, run.costUsd, run.costEstimated ? 1 : 0, JSON.stringify(run.memory), JSON.stringify(run.decisionIds),
      JSON.stringify(run.externalEffects), run.prevHash, run.hash,
    );
    return run;
  });
}

/** 최근 기록부터. taskId를 주면 그 업무의 기록만 */
export function listRuns(repo: Repo, opts: { taskId?: string | null; limit?: number } = {}): Run[] {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const rows = opts.taskId
    ? repo.many<RunRow>('SELECT * FROM runs WHERE task_id = ? ORDER BY seq DESC LIMIT ?', opts.taskId, limit)
    : repo.many<RunRow>('SELECT * FROM runs ORDER BY seq DESC LIMIT ?', limit);
  return rows.map(toRun);
}

/** 사슬 검증 — 처음부터 다시 계산해 처음 어긋난 줄의 id를 돌려준다 */
export function verifyRuns(repo: Repo): { ok: boolean; brokenAt: string | null; count: number } {
  const runs = repo.many<RunRow>('SELECT * FROM runs ORDER BY seq').map(toRun);
  let prev = '';
  for (const r of runs) {
    const { hash, ...rest } = r;
    if (r.prevHash !== prev || runHash(rest) !== hash) return { ok: false, brokenAt: r.id, count: runs.length };
    prev = hash;
  }
  return { ok: true, brokenAt: null, count: runs.length };
}
