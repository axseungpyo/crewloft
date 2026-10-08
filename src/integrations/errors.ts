/** 요청을 보냈지만 결과를 알 수 없음(시간 초과·연결 끊김·5xx) → '확인 필요', 자동 재게시 금지 */
export class AmbiguousError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmbiguousError';
  }
}

/** 인증 만료·권한 없음 → '재연결 필요' */
export class ConnectionAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectionAuthError';
  }
}

/** 보내기 전에 실패했거나 요청이 거부됨(4xx) → '실패', 같은 승인 버전으로 다시 시도 가능 */
export class RequestError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
  }
}
