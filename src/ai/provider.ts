import type { Usage } from '../core/types.ts';

/**
 * AI에 한 번 묻는 요청. 업무 실행(task:*), 채용 대화(hire:*), 직원 답장(dm:*)이 모두 이 형태를 쓴다.
 * 응답은 schema(JSON Schema)에 맞는 객체여야 한다.
 */
export interface CompleteRequest {
  purpose: string;
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  /** 허용 도구. 조사 업무만 웹 검색·읽기를 쓰고 나머지는 없다 */
  tools?: string[];
  /** 이번 실행에 쓸 수 있는 남은 돈(USD, API 환산 추정) — 사용 한도 세 겹 중 가장 적게 남은 겹. 실행 도중 넘으면 멈춘다(결정 80) */
  maxBudgetUsd?: number;
  /** 가짜 AI가 견본을 만들 때 참고하는 맥락(실제 AI에는 보내지 않음) */
  context?: Record<string, unknown>;
}

export interface CompleteResult {
  data: Record<string, unknown>;
  usage: Usage;
}

export interface ConnectionStatus {
  state: 'ready' | 'needs_login' | 'unavailable' | 'unknown';
  detail: string;
  checkedAt: string;
}

/** 한도 표시. 제공자가 알려주지 않는 값은 null로 두고 지어내지 않는다. */
export interface QuotaView {
  usedPct: number | null;
  resetsAt: string | null;
  note: string;
}

export interface AIProvider {
  readonly id: string;
  readonly label: string;
  /** 작업 기록에 남기는 모델 이름(결정 80) — 정하지 않았으면 제공자 기본 */
  readonly model?: string;
  /** 동시에 실행할 요청 수 */
  readonly concurrency: number;
  /** 실행 장소·단계별 이용 조건(로컬/VPS/SaaS) */
  readonly policy: string | null;
  complete(req: CompleteRequest, signal: AbortSignal): Promise<CompleteResult>;
  status(force?: boolean): Promise<ConnectionStatus>;
  quota(): QuotaView;
}

/** 구독·실행 한도 도달 → 업무는 '한도 대기', 자동 전환·추가 과금 없음 */
export class QuotaExceededError extends Error {
  readonly resetsAt: string | null;
  readonly estimated: boolean;
  constructor(message: string, resetsAt: string | null, estimated: boolean) {
    super(message);
    this.name = 'QuotaExceededError';
    this.resetsAt = resetsAt;
    this.estimated = estimated;
  }
}

/** 로그인 만료·미로그인 → 업무는 '재연결 필요' */
export class AuthRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

/** 일시 오류(과부하·네트워크·시간 초과) → 몇 번 다시 시도 */
export class TransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientError';
  }
}

/**
 * 한 번 실행 비용 상한을 넘어 도중에 멈춤. 사용 한도(세 겹)에 닿아서였으면 업무는 잠듦, 아니면 실패로 두고 사용자가 상한을 보고 다시 시도.
 * usage: 멈추기 전까지 쓴 만큼(알 수 있으면)
 */
export class BudgetExceededError extends Error {
  readonly usage: Usage | null;
  constructor(message: string, usage: Usage | null = null) {
    super(message);
    this.name = 'BudgetExceededError';
    this.usage = usage;
  }
}

/** 응답이 정해진 형식이 아님 → 지어내지 않고 실패로 둔다 */
export class FormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormatError';
  }
}
