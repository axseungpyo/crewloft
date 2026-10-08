import { ClaudeCliProvider } from './ai/claude-cli.ts';
import { FakeProvider } from './ai/fake.ts';
import type { AIProvider } from './ai/provider.ts';
import type { Config, ProviderId } from './config.ts';
import type { Artifact, Decision, OfficeEvent } from './core/types.ts';
import { AIRequests } from './engine/ai-requests.ts';
import { startCycle } from './engine/cycle.ts';
import { approvePublish } from './engine/decisions.ts';
import { Executor, type MediaFile } from './engine/executor.ts';
import { AIGate } from './engine/gate.ts';
import { ensureLegacyBlueprint } from './engine/blueprint.ts';
import { Onboarding } from './engine/onboarding.ts';
import { maybeProposeMove } from './engine/office-growth.ts';
import { Runner } from './engine/runner.ts';
import { type BudgetCaps, DEFAULT_CAPS } from './engine/budget.ts';
import { riskOf } from './core/risk.ts';
import { Scheduler } from './engine/scheduler.ts';
import { Integrations } from './integrations/index.ts';
import { ConnectionStore, Secrets } from './store/connections.ts';
import { openDb } from './store/db.ts';
import { LearningStore } from './store/learning.ts';
import { DomainError, Repo } from './store/repo.ts';
import { Auth } from './server/auth.ts';
import { Accounts } from './server/accounts.ts';

/** 앱 전체 서비스 묶음 — main과 테스트가 같은 방식으로 만든다 */
export interface App {
  cfg: Config;
  repo: Repo;
  learning: LearningStore;
  connections: ConnectionStore;
  providers: Record<ProviderId, AIProvider>;
  gate: AIGate;
  requests: AIRequests;
  onboarding: Onboarding;
  runner: Runner;
  executor: Executor;
  scheduler: Scheduler;
  integrations: Integrations;
  auth: Auth;
  /** 계정(결정 74) — AUTH_MODE=accounts 일 때 */
  accounts: Accounts;
  currentAiId(): ProviderId;
  getAi(): AIProvider;
  setAi(id: ProviderId): void;
  providerFor(employeeId: string): AIProvider;
  /** 사용 한도 세 겹의 기본값(결정 80) — WEEKLY_BUDGET_USD가 있으면 사무실 주간 한도의 기본값 */
  budgetDefaults: BudgetCaps;
  startedAt: string;
  start(): void;
  stop(): void;
}

export function createApp(cfg: Config): App {
  const repo = new Repo(openDb(cfg.dataDir));
  // 결정 73 이전의 사무실은 '콘텐츠 운영' 설계도로 그대로 돈다
  ensureLegacyBlueprint(repo);
  const learning = new LearningStore(repo);
  const connections = new ConnectionStore(repo, new Secrets(cfg.dataDir, process.env.AO_SECRET_KEY));
  const providers: Record<ProviderId, AIProvider> = {
    fake: new FakeProvider(cfg.fake),
    'claude-cli': new ClaudeCliProvider(cfg.claude),
  };
  const currentAiId = (): ProviderId => {
    const saved = repo.getSetting<ProviderId>('ai.provider');
    return saved && saved in providers ? saved : cfg.aiProvider;
  };
  const getAi = (): AIProvider => providers[currentAiId()];
  const providerFor = (employeeId: string): AIProvider => {
    const own = repo.getEmployee(employeeId)?.aiProvider as ProviderId | null | undefined;
    return own && own in providers ? providers[own] : getAi();
  };
  const gate = new AIGate(() => getAi().concurrency);
  const requests = new AIRequests(repo, getAi, gate);
  const onboarding = new Onboarding(repo, requests);
  const integrations = new Integrations(repo, connections, cfg);

  /** 재연결 결정 요청 — 연결별로 열린 요청이 없을 때만 연다 */
  const needReconnect = (target: string, reason: string): void => {
    const itemId = `reconnect:${target}`;
    if (repo.openDecisions().some((d) => d.itemId === itemId)) return;
    const affected = repo.actionsByStatus(['scheduled', 'failed']).filter((a) => (a.target ?? a.app) === target).length;
    repo.openDecision({ kind: 'reconnect', cycleId: null, itemId, title: `${integrations.label(target)} 연결을 다시 해 주세요`, payload: { app: target, reason, affected } });
    integrations.notify('reconnect', `설정에서 ${integrations.label(target)} 연결을 다시 해 주세요 — ${reason}`, `/#/decisions`);
  };

  const approve = (d: Decision): void => approvePublish(repo, d, undefined, '결재 규칙: 사전 허용');

  const budgetDefaults: BudgetCaps = { ...DEFAULT_CAPS, ...(cfg.weeklyBudgetUsd !== null ? { officeWeekUsd: cfg.weeklyBudgetUsd } : {}) };
  const runner = new Runner(repo, learning, providerFor, gate, {
    tickMs: cfg.tickMs, handoffAcceptMs: cfg.handoffAcceptMs, maxAttempts: cfg.maxAttempts, budget: budgetDefaults,
  }, {
    approve,
    onArtifact: (a: Artifact) => integrations.onArtifact(a),
  });

  const media = (artifact: Artifact): MediaFile[] => integrations.mediaFor(artifact);
  const executor = new Executor(repo, {
    adapter: (target) => integrations.adapter(target),
    connected: (target) => connections.connected(target),
    media,
    needReconnect,
    notify: (kind, text, link) => integrations.notify(kind, text, link),
  });

  const scheduler: Scheduler = new Scheduler(repo, {
    start_cycle: () => {
      try {
        startCycle(repo, 'schedule');
      } catch (err) {
        if (!(err instanceof DomainError)) throw err;
        repo.emit('system', `예약한 이번 주 일을 건너뛰었어요 — ${err.message}`);
      } finally {
        scheduler.ensureNextWeekly();
      }
    },
  }, 1000);

  /** 업무 알림 문구 — 대표님이 할 일을 먼저, 까닭은 뒤에(crewloft-brand §3-1) */
  const taskNotice = (e: OfficeEvent): string => {
    const t = e.subjectId ? repo.getTask(e.subjectId) : null;
    if (!t) return e.data.text;
    const what = `${repo.getEmployee(t.assigneeId)?.name ?? '직원'}의 “${t.title}” 업무`;
    const why = typeof e.data.reason === 'string' && e.data.reason ? ` — ${e.data.reason}` : '';
    if (e.data.to === 'failed') return `다시 시도할지 봐 주세요 — ${what}에 문제가 생겼어요${why}`;
    if (e.data.to === 'reconnect') return `AI 연결을 다시 해 주세요 — ${what}를 멈췄어요${why}`;
    return `${what}는 한도가 풀리면 이어서 해요${why}`;
  };

  // 결정 요청·실패 알림(우편함 정책은 integrations.notify가 판단). 결정은 밖으로 등급만 하나씩, 나머지는 회차 요약으로(결정 80)
  repo.onEvent((e) => {
    if (e.type === 'decision_opened' && (e.data.risk ?? riskOf(e.data.kind as never)) === 'external') integrations.notify('decision', e.data.text, `/#/decisions/${e.subjectId}`);
    if (e.type === 'task_status' && (e.data.to === 'failed' || e.data.to === 'reconnect' || e.data.to === 'quota_wait')) integrations.notify('task', taskNotice(e), '/#/office');
    if (e.type === 'cycle_finished') integrations.notify('cycle', e.data.text, '/#/content');
    // 성장형 오피스(결정 66) — 회차를 마치거나 채용하면 레벨 업 조건을 확인한다
    if (e.type === 'cycle_finished' || e.type === 'employee_hired') maybeProposeMove(repo);
  });

  return {
    cfg, repo, learning, connections, providers, gate, requests, onboarding, runner, executor, scheduler, integrations, auth: new Auth(repo), accounts: new Accounts(repo),
    currentAiId, getAi, providerFor, budgetDefaults,
    setAi: (id) => {
      if (id === currentAiId()) return;
      repo.setSetting('ai.provider', id);
      runner.clearBlocks();
      repo.emit('ai_switched', `AI 연결을 ‘${providers[id].label}’(으)로 바꿨어요`, { data: { provider: id } });
    },
    startedAt: new Date().toISOString(),
    start: () => {
      requests.recover();
      if (repo.getOffice()) maybeProposeMove(repo); // 시작할 때도 레벨 업 조건을 한 번 확인한다
      runner.start();
      executor.start(1000);
      scheduler.start();
    },
    stop: () => {
      runner.stop();
      executor.stop();
      scheduler.stop();
      requests.abortAll();
      integrations.stop();
      repo.db.close();
    },
  };
}
