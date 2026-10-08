import path from 'node:path';
import type { ClaudeCliOptions } from './ai/claude-cli.ts';
import type { FakeOptions } from './ai/fake.ts';

export type ProviderId = 'fake' | 'claude-cli';

export interface Config {
  host: string;
  port: number;
  dataDir: string;
  webDir: string;
  /** 처음 켤 때의 AI 연결. 화면의 설정에서 바꾼 값이 있으면 그것을 쓴다 */
  aiProvider: ProviderId;
  tickMs: number;
  handoffAcceptMs: number;
  maxAttempts: number;
  weeklyBudgetUsd: number | null;
  allowReset: boolean;
  allowedHosts: string[];
  /** local = 계정 없이 한 사람이(지금 · R0) · accounts = 홈 → 회원가입 · 로그인 → /app (결정 74) */
  authMode: 'local' | 'accounts';
  /** 구글 로그인 — 클라이언트 ID가 없으면 임시 계정 선택 화면(개발용)으로 흐름만 확인 */
  google: { clientId: string | null; mock: boolean };
  fake: FakeOptions;
  claude: ClaudeCliOptions;
}

const int = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? Math.trunc(n) : fallback;
};
const num = (v: string | undefined): number | null => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : null;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = path.resolve(env.DATA_DIR ?? 'data');
  const host = env.HOST ?? '127.0.0.1';
  return {
    host,
    port: int(env.PORT, 4317),
    dataDir,
    webDir: path.resolve(import.meta.dirname, '..', 'web'),
    aiProvider: env.AI_PROVIDER === 'claude-cli' ? 'claude-cli' : 'fake',
    tickMs: int(env.TICK_MS, 500),
    handoffAcceptMs: int(env.HANDOFF_ACCEPT_MS, 1500),
    maxAttempts: int(env.MAX_ATTEMPTS, 3),
    weeklyBudgetUsd: num(env.WEEKLY_BUDGET_USD),
    allowReset: env.NODE_ENV !== 'production',
    allowedHosts: ['localhost', '127.0.0.1', '[::1]', host, ...(env.ALLOWED_HOSTS ?? '').split(',')].map((h) => h.trim().toLowerCase()).filter(Boolean),
    authMode: env.AUTH_MODE === 'accounts' ? 'accounts' : 'local',
    google: { clientId: env.GOOGLE_CLIENT_ID || null, mock: !env.GOOGLE_CLIENT_ID && env.NODE_ENV !== 'production' },
    fake: {
      speedMs: int(env.FAKE_SPEED_MS, 2500),
      quotaUnits: int(env.FAKE_QUOTA_UNITS, 100),
      resetMinutes: int(env.FAKE_RESET_MIN, 10),
      failRate: num(env.FAKE_FAIL_RATE) ?? 0,
      concurrency: int(env.FAKE_CONCURRENCY, 2),
      costPerUnitUsd: num(env.FAKE_COST_PER_UNIT_USD) ?? 0.01,
      ask: env.FAKE_ASK === 'sender' || env.FAKE_ASK === 'owner' ? env.FAKE_ASK : null,
    },
    claude: {
      bin: env.CLAUDE_BIN ?? 'claude',
      model: env.CLAUDE_MODEL || null,
      maxBudgetPerRunUsd: num(env.CLAUDE_MAX_BUDGET_PER_RUN_USD) ?? 1,
      timeoutMs: int(env.CLAUDE_TIMEOUT_MS, 10 * 60_000),
      workDir: path.join(dataDir, 'claude-workspace'),
      concurrency: int(env.CLAUDE_CONCURRENCY, 1),
    },
  };
}
