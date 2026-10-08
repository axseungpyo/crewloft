import type { AIProvider } from '../ai/provider.ts';
import { AuthRequiredError, BudgetExceededError, QuotaExceededError, TransientError } from '../ai/provider.ts';
import { type RunInput, type TaskOutput, buildTaskRequest, parseAskBack, parseTaskOutput, usesWeb } from '../ai/tasks.ts';
import { ACTIVE_STATUSES, FINISHED_STATUSES } from '../core/task-state.ts';
import type { Artifact, ArtifactMeta, Cycle, Decision, Run, Task, Usage } from '../core/types.ts';
import { clip, hhmm, iga, say } from '../core/voice.ts';
import type { LearningStore } from '../store/learning.ts';
import { type Repo, now } from '../store/repo.ts';
import { recordRun } from '../store/runs.ts';
import { answerAsk, openAsk, routeAsk } from './asks.ts';
import { type BudgetCaps, budgetLeft, checkBudget, sleepTask } from './budget.ts';
import { isBlockKind, stepOfKind } from '../blocks/catalog.ts';
import { blueprintLines, confirmedBlueprint, currentPlan } from './blueprint.ts';
import { openArtifactConfirm } from './decisions.ts';
import { todoProgress } from './todos.ts';
import type { AIGate } from './gate.ts';
import { openForCycle, openPublishDecision } from './publishing.ts';

export interface RunnerOptions {
  tickMs: number;
  /** 인계를 받는 직원이 자료를 확인(수락)하기까지 걸리는 시간 */
  handoffAcceptMs: number;
  /** 일시 오류 재시도 횟수 */
  maxAttempts: number;
  /** 사용 한도 세 겹의 기본값(결정 80) — 설정(budget.caps)이 있으면 그것을 쓴다 */
  budget: BudgetCaps;
}

/** 한 번 실행의 기록 맥락 — 작업 기록(runs) 한 줄이 된다 */
interface RunCtx {
  base: Pick<Run, 'taskId' | 'requestId' | 'employeeId' | 'provider' | 'model' | 'startedAt' | 'costEstimated'>;
  memory: Run['memory'];
  /** 웹에서 읽는 도구를 쓴 요청 — 결과물을 외부 자료로 표시 */
  web: boolean;
  /** 되묻기를 받을 넘겨준 직원 — 받은 자료 중 다른 직원이 만든 가장 최근 것 */
  sender: { employeeId: string; artifactId: string } | null;
}

export interface RunnerHooks {
  /** 결과물이 저장된 뒤(저장 연동·이미지 생성) */
  onArtifact?: (a: Artifact) => void;
  /** 결재 규칙의 사전 허용 승인 */
  approve: (d: Decision) => void;
}

export { weekStart } from './budget.ts';

const firstLine = (text: string): string => clip(text.split('\n').find((l) => l.trim()) ?? text, 28);

/**
 * 업무 실행기. 일정 간격으로 진행 중인 회차들을 보고 다음 행동을 한다.
 * 1) 한도 대기 재개 2) 인계 수락 3) 시작 가능한 업무 실행 4) 회차 작업 완료 표시
 * 모든 변화는 저장소 이벤트로 남고, 화면·모션은 그 이벤트만 따른다.
 */
export class Runner {
  #repo: Repo;
  #learning: LearningStore;
  #providerFor: (employeeId: string) => AIProvider;
  #gate: AIGate;
  #opts: RunnerOptions;
  #hooks: RunnerHooks;
  #inflight = new Map<string, AbortController>();
  #timer: NodeJS.Timeout | null = null;
  #ticking = false;
  #stopping = false;
  #pausedUntil: string | null = null;
  #authBlocked: string | null = null;
  #lastTickAt: string | null = null;

  constructor(repo: Repo, learning: LearningStore, providerFor: (employeeId: string) => AIProvider, gate: AIGate, opts: RunnerOptions, hooks: RunnerHooks) {
    this.#repo = repo;
    this.#learning = learning;
    this.#providerFor = providerFor;
    this.#gate = gate;
    this.#opts = opts;
    this.#hooks = hooks;
  }

  get state(): { inflight: number; pausedUntil: string | null; authBlocked: string | null; lastTickAt: string | null } {
    return { inflight: this.#inflight.size, pausedUntil: this.#pausedUntil, authBlocked: this.#authBlocked, lastTickAt: this.#lastTickAt };
  }

  start(): void {
    this.#stopping = false;
    for (const t of this.#repo.tasksByStatus(['working', 'reviewing'])) {
      this.#repo.setTaskStatus(t.id, 'waiting', { reason: '서버가 다시 켜져 처음부터 다시 해요' });
    }
    this.#timer = setInterval(() => this.tick(), this.#opts.tickMs);
    this.tick();
  }

  /** 서버를 멈출 때: 실행 중 업무를 중단하고 다시 켜면 처음부터 하도록 되돌린다. */
  stop(): void {
    this.#stopping = true;
    if (this.#timer) clearInterval(this.#timer);
    for (const [taskId, ac] of this.#inflight) {
      ac.abort(new Error('서버 종료'));
      const t = this.#repo.getTask(taskId);
      if (t && ACTIVE_STATUSES.has(t.status)) this.#repo.setTaskStatus(taskId, 'waiting', { reason: '서버를 멈춰 중단했어요 — 다시 켜면 처음부터 해요' });
    }
    this.#inflight.clear();
  }

  abort(taskIds: string[]): void {
    for (const id of taskIds) this.#inflight.get(id)?.abort(new Error('취소됨'));
  }
  abortAll(): void {
    this.abort([...this.#inflight.keys()]);
  }
  /** AI 연결 전환·사용자 재시도 시 막힘을 풀고 다시 확인한다 */
  clearBlocks(): void {
    this.#pausedUntil = null;
    this.#authBlocked = null;
  }

  tick(): void {
    if (this.#ticking || this.#stopping) return;
    this.#ticking = true;
    try {
      const now = new Date();
      if (this.#pausedUntil && this.#pausedUntil <= now.toISOString()) this.#pausedUntil = null;
      for (const cycle of this.#repo.runningCycles()) this.#stepCycle(cycle, now);
    } catch (err) {
      console.error('[runner]', err);
    } finally {
      this.#ticking = false;
      this.#lastTickAt = new Date().toISOString();
    }
  }

  #name(id: string): string {
    return this.#repo.getEmployee(id)?.name ?? '알 수 없음';
  }

  #stepCycle(cycle: Cycle, now: Date): void {
    const repo = this.#repo;
    const nowIso = now.toISOString();
    for (const t of repo.listTasks(cycle.id)) {
      if (t.status === 'quota_wait' && t.resumeAt && t.resumeAt <= nowIso) repo.setTaskStatus(t.id, 'waiting', { reason: null });
    }
    for (const h of repo.handoffsByStatus(cycle.id, 'proposed')) {
      if (now.getTime() - Date.parse(h.createdAt) >= this.#opts.handoffAcceptMs) repo.acceptHandoff(h.id);
    }
    for (const t of repo.listTasks(cycle.id)) {
      if (t.status !== 'handoff_pending') continue;
      const hs = repo.handoffsTo(t.id);
      if (hs.length > 0 && hs.every((h) => h.status === 'accepted')) repo.setTaskStatus(t.id, 'waiting', { reason: null });
    }

    const tasks = repo.listTasks(cycle.id);
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const busy = new Set(repo.tasksByStatus(['working', 'reviewing']).map((t) => t.assigneeId));
    // 멈춰 둔 업무 — 대표가 '계속'을 거절해 잠든 것, 보류된 앞 결과물을 기다리는 것. 나머지가 다 끝나면 회차 끝에 취소로 정리한다
    const parked = new Set<string>();
    for (const t of tasks) {
      const did = (t.meta.sleep as { decisionId?: string } | undefined)?.decisionId;
      if (t.status === 'asleep' && did && repo.getDecision(did)?.status !== 'open') parked.add(t.id);
    }
    for (const t of tasks) {
      if (t.status !== 'waiting') continue;
      if (t.resumeAt && t.resumeAt > nowIso) continue;
      const deps = t.dependsOn.map((id) => byId.get(id)).filter((d): d is Task => d !== undefined);
      const unfinished = deps.find((d) => d.status !== 'done' && d.status !== 'cancelled');
      if (unfinished) {
        if (parked.has(unfinished.id)) parked.add(t.id);
        repo.noteTask(t.id, `${iga(this.#name(unfinished.assigneeId))} ${unfinished.title} 끝내기를 기다리는 중`);
        continue;
      }
      // 앞 결과물이 수정 요청 · 보류되면 아직 시작 전인 뒤 업무는 기다린다(결정 80)
      const hold = deps.map((d) => this.#holdOf(d, tasks)).find((h) => h !== null);
      if (hold) {
        if (hold.parked) parked.add(t.id);
        repo.noteTask(t.id, hold.reason);
        continue;
      }
      const needHandoff = deps.filter((d) => d.status === 'done' && d.assigneeId !== t.assigneeId && !repo.getHandoff(d.id, t.id));
      if (needHandoff.length) {
        repo.tx(() => {
          for (const d of needHandoff) repo.proposeHandoff(d, t);
          repo.setTaskStatus(t.id, 'handoff_pending', { reason: `${iga(this.#name(t.assigneeId))} 자료를 확인하면 시작` });
        });
        continue;
      }
      if (repo.getSetting<boolean>('runner.paused') === true) { repo.noteTask(t.id, '대표님이 전체를 잠시 멈췄어요'); continue; }
      if (this.#authBlocked) { repo.noteTask(t.id, `AI 연결을 다시 해 주세요 — ${this.#authBlocked}`); continue; }
      if (this.#pausedUntil) { repo.noteTask(t.id, `AI 한도에 닿아 쉬어요 — ${hhmm(this.#pausedUntil)}에 이어서 해요`); continue; }
      if (busy.has(t.assigneeId)) { repo.noteTask(t.id, `${iga(this.#name(t.assigneeId))} 다른 업무를 하는 중`); continue; }
      // 사용 한도 세 겹(결정 80) — 닿으면 잠듦 + "계속할까요?" 카드
      const hit = checkBudget(repo, t, this.#opts.budget, now);
      if (hit) {
        const d = sleepTask(repo, t, hit, this.#opts.budget, now);
        const provider = this.#providerFor(t.assigneeId);
        recordRun(repo, {
          taskId: t.id, requestId: null, employeeId: t.assigneeId, provider: provider.id, model: provider.model ?? provider.id, startedAt: nowIso, endedAt: nowIso,
          status: 'asleep', errorType: `budget_${hit.scope}`, costEstimated: true, decisionIds: [d.id],
        });
        if (d.status !== 'open') parked.add(t.id);
        continue;
      }
      const release = this.#gate.tryAcquire();
      if (!release) { repo.noteTask(t.id, 'AI 차례를 기다리는 중'); continue; }
      if (this.#start(t, release)) busy.add(t.assigneeId);
    }
    this.#maybeFinish(cycle, parked);
  }

  /** 앞 업무(dep)의 결과물이 고치는 중이거나 보류됐는지. parked: 회차 끝까지 풀리지 않는 기다림(보류) */
  #holdOf(dep: Task, tasks: Task[]): { reason: string; parked: boolean } | null {
    if (dep.status !== 'done') return null;
    // 수정 업무(대표의 수정 요청이 담긴 같은 항목의 새 업무) — 편집자 교정처럼 같은 항목을 이어 쓰는 정상 단계는 빼고
    const fixing = tasks.find((x) => x.itemId === dep.itemId && x.id !== dep.id && x.feedback !== null && !FINISHED_STATUSES.has(x.status));
    if (fixing) return { reason: `${iga(this.#name(fixing.assigneeId))} 앞 결과물(${dep.title})을 고치는 중이라 기다려요`, parked: false };
    const last = this.#repo.one<{ status: string; payload: string; artifact_id: string | null }>(
      "SELECT status, payload, artifact_id FROM decisions WHERE item_id = ? AND kind = 'artifact_confirm' ORDER BY created_at DESC, rowid DESC LIMIT 1", dep.itemId,
    );
    if (last?.status === 'rejected' && (JSON.parse(last.payload) as { held?: boolean }).held === true && last.artifact_id === this.#repo.latestArtifact(dep.itemId)?.id) {
      return { reason: `앞 결과물(${dep.title})이 보류돼 기다려요 — 이번 주에는 쓰지 않아요`, parked: true };
    }
    return null;
  }

  #inputsFor(t: Task): RunInput['inputs'] {
    const repo = this.#repo;
    const withAuthor = (a: Artifact): RunInput['inputs'][number] => ({ artifact: a, author: repo.getEmployee(repo.getTask(a.taskId)?.assigneeId ?? '') });
    if (t.feedback) {
      const prev = repo.latestArtifact(t.itemId);
      return prev ? [withAuthor(prev)] : [];
    }
    // 같은 결과물(예: 블로그와 그 교정본)은 최신 버전 하나만 받는다. 이전 회차 결과물(실행 계획 · 앞 블록)도 받는다
    const seen = new Set<string>();
    const earlier = Array.isArray(t.meta.inputs) ? (t.meta.inputs as string[]).map((id) => repo.getArtifact(id)) : [];
    return [
      ...earlier.map((a) => (a ? repo.latestArtifact(a.itemId) : null)),
      ...t.dependsOn.map((id) => repo.getTask(id)).map((d) => (d && d.status === 'done' ? repo.latestArtifact(d.itemId) : null)),
    ]
      .filter((a): a is Artifact => a !== null && !seen.has(a.id) && !!seen.add(a.id))
      .map(withAuthor);
  }

  #start(t: Task, release: () => void): boolean {
    const repo = this.#repo;
    const employee = repo.getEmployee(t.assigneeId);
    const office = repo.getOffice();
    const project = repo.getProject();
    if (!employee || !office || !project) { release(); return false; }
    const rules = this.#learning.rules(employee.id, ['confirmed']);
    const knowledge = this.#learning.knowledge(['active']);
    const team = repo.listEmployees();
    // 확정한 사업 설계도(결정 73)가 직원 프롬프트의 프로젝트 줄이 된다 — 옛 사무실(합성 설계도)은 지금까지의 브리프 그대로
    const bp = confirmedBlueprint(repo);
    const own = bp && bp.source !== 'legacy' ? bp.data : null;
    const input: RunInput = {
      office, brief: project.brief, employee, teammates: team, task: t, inputs: this.#inputsFor(t),
      rules: rules.map((r) => r.text), knowledge: knowledge.map((k) => ({ title: k.title, body: k.body })),
      ...(own ? { business: blueprintLines(own, currentPlan(repo)), blocks: own.blocks.map((b) => b.id) } : {}),
      hiredRoles: [...new Set(team.map((e) => e.role))],
    };
    // 주간 회고 · 다음 달 계획은 대표 할 일 진행을 읽는다 — 지난 회고 뒤에 끝낸 것과 남은 것
    const def = stepOfKind(t.kind);
    if (def && (def.block.id === 'weekly_retro' || def.step.plan) && repo.one('SELECT 1 FROM owner_todos LIMIT 1')) {
      const since = repo.one<{ at: string | null }>("SELECT MAX(created_at) AS at FROM artifacts WHERE kind = 'weekly_retro.retro' AND item_id != ?", t.itemId)?.at ?? null;
      input.todos = todoProgress(repo, since);
    }
    repo.setTaskStatus(t.id, t.kind === 'review' ? 'reviewing' : 'working', { reason: null, countAttempt: true });
    const ac = new AbortController();
    this.#inflight.set(t.id, ac);
    const provider = this.#providerFor(employee.id);
    const req = buildTaskRequest(input);
    // 실행 도중에도 사용 한도를 지키도록 남은 돈을 실어 보낸다(결정 80) — 넘으면 AI가 도중에 멈추고 업무는 잠든다
    const left = budgetLeft(repo, t, this.#opts.budget);
    if (left) req.maxBudgetUsd = left.left;
    const others = input.inputs.filter((x) => x.author && x.author.id !== employee.id).sort((a, b) => a.artifact.createdAt.localeCompare(b.artifact.createdAt));
    const sender = others.at(-1);
    const ctx: RunCtx = {
      base: { taskId: t.id, requestId: null, employeeId: employee.id, provider: provider.id, model: provider.model ?? provider.id, startedAt: now(), costEstimated: true },
      memory: { rules: rules.map((r) => r.id), knowledge: knowledge.map((k) => k.id), inputs: input.inputs.map((x) => x.artifact.id) },
      web: usesWeb(req),
      sender: sender?.author ? { employeeId: sender.author.id, artifactId: sender.artifact.id } : null,
    };
    let spent: Usage | null = null;
    provider.complete(req, ac.signal)
      .then((res) => {
        spent = res.usage;
        // 되묻기 — 받으면 결과물은 쓰지 않고 답을 기다린다(상한을 넘으면 응답 그대로 끝낸다)
        const ask = t.kind === 'answer' ? null : parseAskBack(res.data);
        const to = ask ? routeAsk(repo.getTask(t.id) ?? t, ask.to, ctx.sender?.employeeId ?? null) : null;
        if (ask && to) return { ask: { to, question: ask.question }, out: null, usage: res.usage };
        return { ask: null, out: parseTaskOutput(t.kind, res.data, t.title), usage: res.usage };
      })
      .then(
        ({ ask, out, usage }) => (ask ? this.#onAsk(t.id, ask, usage, ctx) : this.#onSuccess(t.id, out!, usage, ctx)),
        (err: unknown) => this.#onError(t.id, err, ctx, spent),
      )
      .catch((err: unknown) => console.error('[runner] 결과 처리 실패', err))
      .finally(() => {
        release();
        this.#inflight.delete(t.id);
      });
    return true;
  }

  /** 작업 기록 한 줄 — 비용 · 토큰은 사용량(usage)과 같은 값 */
  #record(ctx: RunCtx, status: Run['status'], usage: Usage | null, extra: { errorType?: string | null; decisionIds?: string[]; externalEffects?: string[] } = {}): void {
    recordRun(this.#repo, {
      ...ctx.base, status, errorType: extra.errorType ?? null, memory: ctx.memory, decisionIds: extra.decisionIds ?? [], externalEffects: extra.externalEffects ?? [],
      inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens, costUsd: usage?.costUsd, costEstimated: usage?.estimated ?? true,
    });
  }

  #onAsk(taskId: string, ask: { to: 'sender' | 'owner'; question: string }, usage: Usage, ctx: RunCtx): void {
    if (this.#stopping) return;
    const repo = this.#repo;
    const t = repo.getTask(taskId);
    if (!t || !ACTIVE_STATUSES.has(t.status)) return;
    repo.tx(() => {
      repo.recordUsage({ taskId: t.id, employeeId: t.assigneeId, provider: ctx.base.provider, usage });
      const decisionId = openAsk(repo, t, ask.to, ask.question, ctx.sender);
      this.#record(ctx, 'ok', usage, { decisionIds: decisionId ? [decisionId] : [] });
    });
  }

  #onSuccess(taskId: string, out: TaskOutput, usage: Usage, ctx: RunCtx): void {
    if (this.#stopping) return;
    const repo = this.#repo;
    const t = repo.getTask(taskId);
    if (!t || !ACTIVE_STATUSES.has(t.status)) return;
    const ruleIds = ctx.memory.rules;
    if (t.kind === 'answer') {
      // 되묻기에 답하기 — 결과물 없이 답만 넘긴다
      repo.tx(() => {
        repo.recordUsage({ taskId: t.id, employeeId: t.assigneeId, provider: ctx.base.provider, usage });
        repo.setTaskStatus(t.id, 'done', { reason: null });
        answerAsk(repo, String(t.meta.answerFor ?? ''), out.body.trim(), t.assigneeId);
        this.#record(ctx, 'ok', usage);
      });
      return;
    }
    const saved: Artifact[] = [];
    repo.tx(() => {
      const meta: ArtifactMeta = { ...out.meta, appliedRules: ruleIds, ...(ctx.web ? { external: true } : {}) };
      if (t.kind === 'blog_draft') meta.platform = 'blog';
      if (t.kind === 'edit') {
        // 편집자의 교정본 = 같은 블로그 항목의 새 버전(게시 확인은 이 버전으로). 썸네일 등은 이어받는다
        const prev = repo.latestArtifact(t.itemId);
        Object.assign(meta, { ...(prev?.meta ?? {}), ...out.meta, excerpt: out.meta.excerpt || prev?.meta.excerpt, tags: out.meta.tags?.length ? out.meta.tags : prev?.meta.tags, appliedRules: ruleIds, platform: 'blog', editedBy: t.assigneeId });
      }
      const single = typeof t.meta.platform === 'string' ? (t.meta.platform as 'threads' | 'linkedin') : null;
      let main: Artifact;
      if (t.kind === 'sns_draft' && single) {
        // 게시물 하나의 수정본 — 같은 항목의 새 버전
        const post = out.posts.find((p) => p.platform === single) ?? out.posts[0];
        const text = post?.text ?? out.body;
        main = repo.saveArtifact(t, { title: `${single === 'threads' ? 'Threads' : 'LinkedIn'} · ${firstLine(text)}`, body: text, sources: out.sources, meta: { ...meta, platform: single } });
        saved.push(main);
      } else {
        main = repo.saveArtifact(t, { title: out.title, body: out.body, sources: out.sources, meta });
        saved.push(main);
        if (t.kind === 'sns_draft') {
          const count: Record<string, number> = {};
          for (const p of out.posts) {
            const n = (count[p.platform] = (count[p.platform] ?? 0) + 1);
            saved.push(repo.saveArtifact(t, {
              itemId: `${t.cycleId}:sns-${p.platform}-${n}`, title: `${p.platform === 'threads' ? 'Threads' : 'LinkedIn'} ${n} · ${firstLine(p.text)}`,
              body: p.text, sources: [], meta: { platform: p.platform, appliedRules: ruleIds, ...(out.meta.handoff ? { handoff: out.meta.handoff } : {}) },
            }));
          }
        }
      }
      this.#learning.markApplied(ruleIds);
      this.#learning.markKnowledgeUsed(ctx.memory.knowledge);
      repo.recordUsage({ taskId: t.id, employeeId: t.assigneeId, provider: ctx.base.provider, usage });
      repo.setTaskStatus(t.id, 'done', { reason: null });
      if (out.note) repo.message(t.assigneeId, null, out.note, { cycleId: t.cycleId, taskId: t.id, artifactId: main.id });
      if (isBlockKind(t.kind)) {
        // 블록 결과물 — 대표 확인이 필요한 단계면 바로 결과물 확인을 연다(수정본도 같은 길)
        openArtifactConfirm(repo, main);
      } else if (t.kind === 'review') {
        openForCycle(repo, t.cycleId, main.id, this.#hooks.approve);
      } else if (t.feedback && main.meta.platform) {
        // 수정본은 바로 다시 확인받는다(같은 시간표 칸)
        const prev = typeof t.meta.decisionId === 'string' ? repo.getDecision(t.meta.decisionId) : null;
        openPublishDecision(repo, main, prev?.reviewArtifactId ?? null, Number(prev?.payload.index ?? 0), this.#hooks.approve, prev?.payload.scheduledAt as string | undefined);
      }
    });
    for (const a of saved) {
      try {
        this.#hooks.onArtifact?.(a);
      } catch (err) {
        console.error('[runner] 결과물 후속 처리 실패', err);
      }
    }
    // 이 실행이 연 결정 · 밖으로 나간 일(사전 허용 게시 · 외부 저장)을 기록에 묶는다
    const ids = saved.map((a) => a.id);
    const marks = ids.map(() => '?').join(', ');
    const decisionIds = repo.many<{ id: string }>(`SELECT id FROM decisions WHERE artifact_id IN (${marks}) ORDER BY created_at`, ...ids).map((r) => r.id);
    const externalEffects = repo.many<{ id: string }>(`SELECT id FROM external_actions WHERE artifact_id IN (${marks}) ORDER BY created_at`, ...ids).map((r) => r.id);
    this.#record(ctx, 'ok', usage, { decisionIds, externalEffects });
  }

  #onError(taskId: string, err: unknown, ctx: RunCtx, spent: Usage | null): void {
    if (this.#stopping) return;
    const repo = this.#repo;
    const t = repo.getTask(taskId);
    const usage = spent ?? (err instanceof BudgetExceededError ? err.usage : null);
    // 응답은 왔지만 쓰지 못한 실행(형식 오류 등)도 비용은 들었다 — 사용량 · 작업 기록에 남긴다
    if (usage && t) repo.recordUsage({ taskId, employeeId: t.assigneeId, provider: ctx.base.provider, usage });
    if (!t || !ACTIVE_STATUSES.has(t.status)) {
      this.#record(ctx, 'cancelled', usage, { errorType: 'cancelled' });
      return;
    }
    // 실행 도중 사용 한도에 닿아 멈췄다 — 실패가 아니라 잠듦 + "계속할까요?" 카드(시작 전에 닿은 것과 같은 길)
    const hit = err instanceof BudgetExceededError ? checkBudget(repo, t, this.#opts.budget) : null;
    if (hit) {
      const d = sleepTask(repo, t, hit, this.#opts.budget);
      this.#record(ctx, 'asleep', usage, { errorType: `budget_${hit.scope}`, decisionIds: [d.id] });
      return;
    }
    this.#record(ctx, 'error', usage, { errorType: err instanceof Error ? err.name : 'Error' });
    if (err instanceof QuotaExceededError) {
      const resumeAt = err.resetsAt ?? new Date(Date.now() + 60 * 60_000).toISOString();
      const estimated = err.estimated || !err.resetsAt;
      this.#pausedUntil = resumeAt;
      repo.setTaskStatus(t.id, 'quota_wait', { reason: `${err.message} — ${hhmm(resumeAt)}에 이어서 해요${estimated ? '(추정)' : ''}`, resumeAt });
    } else if (err instanceof AuthRequiredError) {
      this.#authBlocked = err.message;
      repo.setTaskStatus(t.id, 'reconnect', { reason: err.message });
    } else if (err instanceof TransientError && t.attempts < this.#opts.maxAttempts) {
      const resumeAt = new Date(Date.now() + 15_000 * t.attempts).toISOString();
      repo.setTaskStatus(t.id, 'waiting', { reason: `${err.message} — 다시 해 볼게요(${this.#opts.maxAttempts}번 중 ${t.attempts}번째)`, resumeAt });
    } else {
      repo.tx(() => {
        repo.setTaskStatus(t.id, 'failed', { reason: clip(err instanceof Error ? err.message : String(err), 200) });
        // 답하기가 실패하면 묻던 업무는 지금 자료로 이어간다(끝없이 기다리지 않게)
        if (t.kind === 'answer') answerAsk(repo, String(t.meta.answerFor ?? ''), `${this.#name(t.assigneeId)}에게 답을 받지 못했어요 — 지금 자료로 판단해 진행해 주세요.`, t.assigneeId);
      });
    }
  }

  /** 업무가 모두 끝나면 회차 '작업 완료'. 게시 확인·예약 게시는 회차가 끝나도 이어진다. */
  #maybeFinish(cycle: Cycle, parked: Set<string> = new Set()): void {
    const repo = this.#repo;
    let tasks = repo.listTasks(cycle.id);
    if (!tasks.length) return;
    const rest = tasks.filter((t) => !FINISHED_STATUSES.has(t.status));
    if (rest.length && !rest.every((t) => parked.has(t.id))) return;
    if (rest.length) {
      // 나머지가 다 끝났고 멈춰 둔 업무만 남았다 — 취소로 정리하고 회차를 마친다
      repo.tx(() => {
        for (const t of rest) repo.setTaskStatus(t.id, 'cancelled', { reason: t.status === 'asleep' ? '사용 한도로 잠든 채 이번 주 일이 끝나 취소했어요' : '앞 결과물이 보류돼 이번 주에는 하지 않았어요' });
      });
      tasks = repo.listTasks(cycle.id);
    }
    const artifacts = repo.listArtifacts(cycle.id).length;
    const waiting = repo.openDecisionCount(cycle.id);
    const reopened = cycle.endedAt !== null;
    const manager = repo.employeeByRole('manager');
    repo.tx(() => {
      repo.finishCycle(cycle.id, 'done', reopened ? `${cycle.label} 일 — 고친 결과물을 다 만들었어요` : waiting ? `결정함에서 ${waiting}건을 확인해 주세요 — ${cycle.label} 일이 끝났어요(결과물 ${artifacts}개)` : `${cycle.label} 일이 끝났어요 — 결과물 ${artifacts}개`, { artifacts, waiting, reopened });
      if (manager && !reopened) {
        repo.message(manager.id, null, say(manager, {
          haeyo: `${cycle.label} 작업을 마쳤어요. 결과물 ${artifacts}개${waiting ? `, 확인해 주실 것 ${waiting}건이 결정함에 있어요` : ''}.`,
          hamnida: `${cycle.label} 작업을 마쳤습니다. 결과물 ${artifacts}개${waiting ? `, 확인 요청 ${waiting}건이 결정함에 있습니다` : ''}.`,
          banmal: `${cycle.label} 작업 끝! 결과물 ${artifacts}개${waiting ? `, 확인할 거 ${waiting}건 결정함에 있어` : ''}.`,
        }), { cycleId: cycle.id });
      }
    });
  }
}
