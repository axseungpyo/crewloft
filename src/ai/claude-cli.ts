import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { clip } from '../core/voice.ts';
import type { AIProvider, CompleteRequest, CompleteResult, ConnectionStatus, QuotaView } from './provider.ts';
import { AuthRequiredError, BudgetExceededError, FormatError, QuotaExceededError, TransientError } from './provider.ts';

export interface ClaudeCliOptions {
  /** claude 실행 파일 경로 */
  bin: string;
  /** 모델 별칭 또는 전체 이름. null이면 Claude Code 기본값(구독 플랜에 따름) */
  model: string | null;
  /** 한 번 실행의 비용 상한(--max-budget-usd). 구독에서는 API 환산 추정치 기준 */
  maxBudgetPerRunUsd: number;
  timeoutMs: number;
  /** 직원 실행용 빈 작업 폴더. 저장소 파일에 접근하지 않게 분리한다 */
  workDir: string;
  concurrency: number;
}

interface ProcResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

const OUTPUT_CAP = 4 * 1024 * 1024;

function runProcess(bin: string, args: string[], stdin: string, opts: { cwd: string; timeoutMs: number; signal: AbortSignal }): Promise<ProcResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: opts.cwd, env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d: string) => { if (stdout.length < OUTPUT_CAP) stdout += d; });
    child.stderr.on('data', (d: string) => { if (stderr.length < OUTPUT_CAP) stderr += d; });
    const kill = (): void => {
      child.kill('SIGTERM');
      setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 5000).unref();
    };
    const timer = setTimeout(() => { timedOut = true; kill(); }, opts.timeoutMs);
    const onAbort = (): void => kill();
    opts.signal.addEventListener('abort', onAbort, { once: true });
    const done = (): void => {
      settled = true;
      clearTimeout(timer);
      opts.signal.removeEventListener('abort', onAbort);
    };
    child.on('error', (err) => { if (!settled) { done(); reject(err); } });
    child.on('close', (code) => { if (!settled) { done(); resolve({ code, stdout, stderr, timedOut }); } });
    child.stdin.on('error', () => { /* 프로세스가 먼저 끝나면 EPIPE — close에서 처리 */ });
    child.stdin.end(stdin);
  });
}

/**
 * 구독 로그인을 쓰도록 API 키 환경변수는 자식 프로세스에 넘기지 않는다.
 * (있으면 Claude Code가 API 과금으로 실행한다.) 값은 읽지 않는다.
 */
function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}

const LIMIT_RE = /usage limit|limit reached|hit your limit|rate.?limit|too many requests|\b429\b/i;
const AUTH_RE = /\/login|not logged in|please log ?in|invalid api key|authentication|oauth token|unauthori[sz]ed|\b401\b/i;
const TRANSIENT_RE = /overloaded|\b529\b|\b50[0-9]\b|timed? ?out|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|network error/i;

/** 한도 메시지에서 재설정 시각을 읽는다. 시각이 없으면 null(호출하는 쪽이 추정값을 쓴다). */
export function parseReset(text: string, now = new Date()): { at: string | null; estimated: boolean } {
  const epoch = /\|(\d{10})\b/.exec(text);
  if (epoch) return { at: new Date(Number(epoch[1]) * 1000).toISOString(), estimated: false };
  const clock = /resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(text);
  if (clock) {
    let h = Number(clock[1]);
    const m = Number(clock[2] ?? 0);
    const ap = clock[3]?.toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    // CLI가 알려준 시각을 이 컴퓨터 시간대로 해석한다 → 추정으로 표시
    return { at: d.toISOString(), estimated: true };
  }
  return { at: null, estimated: true };
}

export function classifyError(text: string): Error | null {
  if (LIMIT_RE.test(text)) {
    const r = parseReset(text);
    return new QuotaExceededError('Claude 구독 한도에 닿았어요', r.at, r.estimated);
  }
  if (AUTH_RE.test(text)) return new AuthRequiredError('터미널에서 claude를 실행해 /login 해 주세요 — Claude 로그인이 필요해요');
  if (TRANSIENT_RE.test(text)) return new TransientError(`일시 오류: ${clip(text, 120)}`);
  return null;
}

function parseJsonLoose(text: string): unknown {
  const t = text.trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch { /* 아래에서 다른 형태를 시도 */ }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch { /* 계속 */ }
  }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch { /* 계속 */ }
  }
  return null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Claude 구독 — 사용자 PC의 공식 Claude Code CLI를 헤드리스(-p)로 부른다(결정 61).
 * 로그인은 CLI에서 사용자가 직접 하고, 이 앱은 자격증명을 읽거나 저장하지 않는다.
 * 직원 실행은 사용자 CLAUDE.md·훅·MCP·플러그인을 끈 격리 모드로 돌린다.
 */
export class ClaudeCliProvider implements AIProvider {
  readonly id = 'claude-cli';
  readonly label = 'Claude 구독 (Claude Code)';
  readonly policy =
    '내 컴퓨터에서 혼자 쓰는 기준(내 컴퓨터의 공식 Claude Code에 내가 로그인). 화면 없이 늘 켜 두는 서버 운영은 Anthropic 답을 받을 때까지 확인 대기, 여러 사람에게 파는 서비스(R2)에는 쓰지 않아요. 한도를 넘긴 뒤 더 쓰는 요금은 Claude 계정 설정을 따라요.';
  readonly concurrency: number;
  #opts: ClaudeCliOptions;
  #status: ConnectionStatus | null = null;
  #limitUntil: string | null = null;

  get model(): string {
    return this.#opts.model ?? 'claude-code-default';
  }

  constructor(opts: ClaudeCliOptions) {
    this.#opts = opts;
    this.concurrency = opts.concurrency;
    mkdirSync(opts.workDir, { recursive: true });
  }

  args(req: CompleteRequest): string[] {
    const tools = req.tools ?? [];
    const args = [
      '-p',
      '--output-format', 'json',
      '--json-schema', JSON.stringify(req.schema),
      '--system-prompt', req.system,
      '--tools', tools.join(','),
      '--permission-mode', 'dontAsk',
      '--permission-prompts', 'none',
      '--safe-mode',
      '--strict-mcp-config',
      '--no-session-persistence',
      '--max-budget-usd', String(this.#budgetFor(req)),
    ];
    if (tools.length) args.push('--allowedTools', tools.join(','));
    if (this.#opts.model) args.push('--model', this.#opts.model);
    return args;
  }

  /** 이번 실행의 상한 — 설정한 1회 상한과 사용 한도에서 남은 돈 중 작은 쪽(실행 도중에도 한도를 지킨다) */
  #budgetFor(req: CompleteRequest): number {
    const left = req.maxBudgetUsd;
    if (left === undefined || !Number.isFinite(left)) return this.#opts.maxBudgetPerRunUsd;
    return Math.min(this.#opts.maxBudgetPerRunUsd, Math.max(0.0001, Math.round(left * 1e4) / 1e4));
  }

  async complete(req: CompleteRequest, signal: AbortSignal): Promise<CompleteResult> {
    let res: ProcResult;
    try {
      res = await runProcess(this.#opts.bin, this.args(req), req.prompt, { cwd: this.#opts.workDir, timeoutMs: this.#opts.timeoutMs, signal });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new AuthRequiredError(`Claude Code를 설치하거나 CLAUDE_BIN을 지정해 주세요 — claude 명령을 찾지 못했어요(${this.#opts.bin})`);
      throw err;
    }
    if (signal.aborted) throw signal.reason ?? new Error('중단됨');
    if (res.timedOut) throw new TransientError(`${Math.round(this.#opts.timeoutMs / 60000)}분 안에 끝나지 않았어요`);
    try {
      return this.#parse(res, this.#budgetFor(req));
    } catch (err) {
      if (err instanceof QuotaExceededError) this.#limitUntil = err.resetsAt;
      if (err instanceof AuthRequiredError) this.#status = null;
      throw err;
    }
  }

  #parse(res: ProcResult, budgetUsd: number = this.#opts.maxBudgetPerRunUsd): CompleteResult {
    const out = res.stdout.trim();
    let j = parseJsonLoose(out) as Record<string, unknown> | null;
    if (!j || typeof j !== 'object') {
      const lastLine = out.split('\n').filter(Boolean).pop() ?? '';
      j = parseJsonLoose(lastLine) as Record<string, unknown> | null;
    }
    if (!j || typeof j !== 'object') {
      const text = `${res.stderr}\n${res.stdout}`;
      throw classifyError(text) ?? new Error(`Claude CLI 응답을 읽지 못했어요(종료 코드 ${res.code}): ${clip(res.stderr || res.stdout, 160)}`);
    }
    const subtype = typeof j.subtype === 'string' ? j.subtype : '';
    const resultText = typeof j.result === 'string' ? j.result : '';
    const u = (j.usage && typeof j.usage === 'object' ? j.usage : {}) as Record<string, unknown>;
    const inputTokens = [u.input_tokens, u.cache_creation_input_tokens, u.cache_read_input_tokens].map(num).reduce<number | null>((a, b) => (b === null ? a : (a ?? 0) + b), null);
    const usage = { costUsd: num(j.total_cost_usd), inputTokens, outputTokens: num(u.output_tokens), estimated: true };
    if (j.is_error === true || (subtype !== '' && subtype !== 'success')) {
      if (subtype === 'error_max_budget_usd') {
        // 도중에 멈춰도 쓴 만큼은 사용량에 남긴다 — 사용 한도에 닿아서였으면 실행기가 업무를 잠재운다
        throw new BudgetExceededError(`상한을 확인하고 다시 시도해 주세요 — 한 번 실행 비용 상한 $${budgetUsd}(실제 요금으로 친 값)을 넘어 도중에 멈췄어요`, usage);
      }
      const text = `${resultText}\n${res.stderr}`;
      throw classifyError(text) ?? new Error(`Claude 실행 실패(${subtype || 'error'}): ${clip(resultText || res.stderr, 160)}`);
    }
    const data = j.structured_output ?? parseJsonLoose(resultText);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new FormatError(`정해진 형식의 응답이 아니에요: ${clip(resultText, 120)}`);
    return { data: data as Record<string, unknown>, usage };
  }

  async status(force = false): Promise<ConnectionStatus> {
    if (!force && this.#status && Date.now() - Date.parse(this.#status.checkedAt) < 60_000) return this.#status;
    const checkedAt = new Date().toISOString();
    const opts = { cwd: this.#opts.workDir, timeoutMs: 15_000, signal: AbortSignal.timeout(20_000) };
    try {
      const v = await runProcess(this.#opts.bin, ['--version'], '', opts);
      if (v.code !== 0) {
        this.#status = { state: 'unavailable', detail: `claude --version 실패: ${clip(v.stderr || v.stdout, 100)}`, checkedAt };
        return this.#status;
      }
      const version = v.stdout.trim().split(/\s+/)[0] ?? '';
      const a = await runProcess(this.#opts.bin, ['auth', 'status', '--json'], '', opts);
      const info = parseJsonLoose(a.stdout) as Record<string, unknown> | null;
      const loggedIn = detectLoggedIn(info, a);
      // 계정 이메일 등은 화면·기록에 남기지 않는다. 플랜 이름만 보여준다.
      const plan = info ? [info.subscriptionType, info.plan, info.accountType].find((x): x is string => typeof x === 'string') : undefined;
      if (loggedIn === true) this.#status = { state: 'ready', detail: `로그인됨 · Claude Code ${version}${plan ? ` · ${plan}` : ''}`, checkedAt };
      else if (loggedIn === false) this.#status = { state: 'needs_login', detail: '터미널에서 claude를 실행해 /login 해 주세요 — 로그인이 필요해요', checkedAt };
      else this.#status = { state: 'unknown', detail: `Claude Code ${version} · 로그인 상태를 읽지 못했어요(첫 실행에서 확인돼요)`, checkedAt };
    } catch (err) {
      const missing = (err as NodeJS.ErrnoException).code === 'ENOENT';
      this.#status = {
        state: 'unavailable',
        detail: missing ? `Claude Code를 설치하거나 CLAUDE_BIN을 지정해 주세요 — claude 명령을 찾지 못했어요(${this.#opts.bin})` : `상태 확인 실패: ${clip(String(err), 100)}`,
        checkedAt,
      };
    }
    return this.#status;
  }

  quota(): QuotaView {
    const limited = this.#limitUntil !== null && Date.parse(this.#limitUntil) > Date.now();
    return {
      usedPct: null,
      resetsAt: limited ? this.#limitUntil : null,
      note: limited ? '구독 한도에 닿았어요 — 한도가 풀리면 저절로 이어서 해요' : '구독 한도 %는 Claude Code가 알려주지 않아요. 한도에 닿으면 그 업무만 쉬어요.',
    };
  }
}

function detectLoggedIn(info: Record<string, unknown> | null, res: ProcResult): boolean | null {
  if (info) {
    for (const key of ['loggedIn', 'isLoggedIn', 'logged_in', 'authenticated']) {
      if (typeof info[key] === 'boolean') return info[key] as boolean;
    }
    const method = typeof info.authMethod === 'string' ? info.authMethod.toLowerCase() : '';
    if ((method && method !== 'none') || typeof info.subscriptionType === 'string') return true;
  }
  if (res.code !== 0 && /not logged in|log ?in|\/login/i.test(`${res.stdout}\n${res.stderr}`)) return false;
  return null;
}
