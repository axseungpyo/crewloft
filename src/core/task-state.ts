import type { TaskStatus } from './types.ts';

// 허용된 상태 전이. 여기에 없는 전이는 저장소가 거부한다.
const NEXT: Record<TaskStatus, readonly TaskStatus[]> = {
  waiting: ['handoff_pending', 'working', 'reviewing', 'quota_wait', 'asleep', 'cancelled'],
  handoff_pending: ['waiting', 'cancelled'],
  // working/reviewing → waiting: 서버 재시작·일시 오류 후 다시 시작. → asleep: 실행 도중 사용 한도에 닿아 멈춤(결정 80)
  working: ['done', 'failed', 'quota_wait', 'reconnect', 'waiting', 'asked', 'asleep', 'cancelled'],
  reviewing: ['done', 'failed', 'quota_wait', 'reconnect', 'waiting', 'asked', 'asleep', 'cancelled'],
  awaiting_user: ['waiting', 'done', 'cancelled'],
  quota_wait: ['waiting', 'cancelled'],
  reconnect: ['waiting', 'cancelled'],
  verify: ['done', 'failed'],
  // 되묻기 · 잠듦은 답 · 대표 승인이 오면 다시 대기로(결정 80)
  asked: ['waiting', 'cancelled'],
  asleep: ['waiting', 'cancelled'],
  done: [],
  failed: ['waiting', 'cancelled'],
  cancelled: [],
};

export const ACTIVE_STATUSES: ReadonlySet<TaskStatus> = new Set(['working', 'reviewing']);
export const FINISHED_STATUSES: ReadonlySet<TaskStatus> = new Set(['done', 'cancelled']);
/** 사용자가 '다시 시도'로 대기열에 되돌릴 수 있는 상태 */
export const RETRYABLE_STATUSES: ReadonlySet<TaskStatus> = new Set(['failed', 'quota_wait', 'reconnect']);

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return NEXT[from].includes(to);
}

/** 상태 낱말 여섯 개(brand.md §4 원칙 4) — 화면 lib.js `ST6`과 같은 말. 같은 상태를 다르게 부르지 않는다 */
export type StatusWord = '시작 전' | '일하는 중' | '대표 확인' | '끝' | '멈춤' | '문제';

/** 업무 상태 → 여섯 낱말(화면 lib.js `ST_GROUP`과 같은 묶음). 알약 · 이름표 · 블록 줄에 쓴다 */
export const STATUS_LABEL: Record<TaskStatus, StatusWord> = {
  waiting: '시작 전',
  handoff_pending: '일하는 중',
  working: '일하는 중',
  reviewing: '일하는 중',
  awaiting_user: '대표 확인',
  quota_wait: '멈춤',
  reconnect: '문제',
  verify: '대표 확인',
  asked: '대표 확인',
  asleep: '멈춤',
  done: '끝',
  failed: '문제',
  cancelled: '멈춤',
};

/** 자세한 낱말 — 알약에 마우스를 올리면 보이는 말 · 작업 기록 · 오류 문장에 쓴다 */
export const STATUS_DETAIL: Record<TaskStatus, string> = {
  waiting: '차례 기다리는 중',
  handoff_pending: '인계 확인 기다리는 중',
  working: '일하는 중',
  reviewing: '검토하는 중',
  awaiting_user: '대표님 답 기다리는 중',
  quota_wait: '한도 풀리길 기다리는 중',
  reconnect: '다시 연결 필요',
  verify: '대표님 확인 필요',
  asked: '되묻는 중',
  asleep: '한도에 닿아 쉬는 중',
  done: '끝',
  failed: '문제가 생김',
  cancelled: '취소됨',
};
