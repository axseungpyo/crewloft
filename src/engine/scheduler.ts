import { DomainError, type Job, type Repo } from '../store/repo.ts';

/** weekday: 1=월 … 7=일 */
export interface WeeklySpec {
  weekday: number;
  hour: number;
  minute: number;
}

const WEEKDAY = ['', '월', '화', '수', '목', '금', '토', '일'];

export function describeWeekly(s: WeeklySpec): string {
  return `매주 ${WEEKDAY[s.weekday]}요일 ${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`;
}

export function nextWeeklyRun(from: Date, s: WeeklySpec): Date {
  const d = new Date(from);
  d.setHours(s.hour, s.minute, 0, 0);
  const today = ((from.getDay() + 6) % 7) + 1;
  d.setDate(d.getDate() + ((s.weekday - today + 7) % 7));
  if (d <= from) d.setDate(d.getDate() + 7);
  return d;
}

export function parseWeekly(raw: unknown): WeeklySpec {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const int = (v: unknown, min: number, max: number): number => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw new DomainError(400, '예약 시각이 올바르지 않아요');
    return v;
  };
  return { weekday: int(o.weekday, 1, 7), hour: int(o.hour, 0, 23), minute: int(o.minute ?? 0, 0, 59) };
}

const SETTING = 'schedule.weekly';

/**
 * 예약 실행기. 작업은 저장소의 jobs 표에 있고, 실행 시각이 된 작업을 원자적으로 하나씩 가져온다.
 * 서버가 꺼져 있던 동안 놓친 예약은 다시 켜질 때 한 번만 실행한다(다음 예약은 그 시점 기준으로 하나만 잡는다).
 */
export class Scheduler {
  #repo: Repo;
  #handlers: Record<string, (job: Job) => void>;
  #tickMs: number;
  #timer: NodeJS.Timeout | null = null;

  constructor(repo: Repo, handlers: Record<string, (job: Job) => void>, tickMs: number) {
    this.#repo = repo;
    this.#handlers = handlers;
    this.#tickMs = tickMs;
  }

  start(): void {
    this.#repo.resetRunningJobs();
    this.ensureNextWeekly();
    this.#timer = setInterval(() => this.tick(), this.#tickMs);
    this.tick();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
  }

  tick(): void {
    const nowIso = new Date().toISOString();
    for (let i = 0; i < 10; i++) {
      const job = this.#repo.claimDueJob(nowIso);
      if (!job) return;
      try {
        const handler = this.#handlers[job.kind];
        if (!handler) throw new Error(`알 수 없는 예약 작업: ${job.kind}`);
        handler(job);
        this.#repo.finishJob(job.id, 'done');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.#repo.finishJob(job.id, 'failed', msg);
        this.#repo.emit('system', `예약 작업 실패: ${msg}`, { data: { jobId: job.id } });
      }
    }
  }

  weekly(): WeeklySpec | null {
    return this.#repo.getSetting<WeeklySpec>(SETTING);
  }

  nextRunAt(): string | null {
    return this.#repo.nextJob('start_cycle')?.runAt ?? null;
  }

  setWeekly(spec: WeeklySpec | null): { weekly: WeeklySpec | null; nextRunAt: string | null } {
    this.#repo.tx(() => {
      this.#repo.cancelPendingJobs('start_cycle');
      if (spec) {
        this.#repo.setSetting(SETTING, spec);
        this.ensureNextWeekly();
        this.#repo.emit('schedule_changed', `매주 일 시작 예약: ${describeWeekly(spec)}`, { data: { ...spec } });
      } else {
        this.#repo.deleteSetting(SETTING);
        this.#repo.emit('schedule_changed', '매주 일 시작 예약을 껐어요');
      }
    });
    return { weekly: this.weekly(), nextRunAt: this.nextRunAt() };
  }

  /** 예약이 켜져 있는데 다음 작업이 없으면 하나 잡는다(중복 방지 키로 같은 시각은 한 번만). */
  ensureNextWeekly(): void {
    const spec = this.weekly();
    if (!spec || this.#repo.nextJob('start_cycle')) return;
    const at = nextWeeklyRun(new Date(), spec).toISOString();
    this.#repo.scheduleJob('start_cycle', at, { ...spec }, `weekly:${at}`);
  }
}
