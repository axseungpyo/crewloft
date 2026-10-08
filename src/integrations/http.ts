import { AmbiguousError, ConnectionAuthError, RequestError } from './errors.ts';

/** 외부 API 기본 주소 — 테스트에서는 로컬 스텁으로 바꾼다(AO_API_BASE_<NAME>) */
export function base(name: string, fallback: string): string {
  return process.env[`AO_API_BASE_${name.toUpperCase()}`] ?? fallback;
}

export interface CallOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** true면 요청이 '외부 결과를 만드는' 호출이다 — 보낸 뒤 불명확하면 확인 필요로 둔다 */
  mutating?: boolean;
  timeoutMs?: number;
  raw?: boolean;
}

/**
 * 외부 호출 + 오류 분류.
 * - 401/403 → 재연결 필요
 * - 보내기 전 실패(DNS 등) → 실패(다시 시도 가능)
 * - 결과를 만드는 호출에서 시간 초과·연결 끊김·5xx → 확인 필요(이미 만들어졌을 수 있어 자동 재시도 금지)
 */
export async function call<T = Record<string, unknown>>(url: string, o: CallOptions = {}): Promise<{ data: T; headers: Headers; status: number }> {
  const ctl = AbortSignal.timeout(o.timeoutMs ?? 30_000);
  const isForm = o.body instanceof FormData || o.body instanceof Uint8Array || typeof o.body === 'string' || o.body instanceof Blob;
  let res: Response;
  try {
    res = await fetch(url, {
      method: o.method ?? (o.body === undefined ? 'GET' : 'POST'),
      headers: { ...(o.body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}), ...o.headers },
      body: o.body === undefined ? undefined : isForm ? (o.body as BodyInit) : JSON.stringify(o.body),
      signal: ctl,
    });
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    const sent = /timeout|abort|socket|reset|closed/i.test(msg);
    if (o.mutating && sent) throw new AmbiguousError(`응답을 받지 못했어요(${msg})`);
    throw new RequestError(`요청을 보내지 못했어요(${msg})`);
  }
  const text = await res.text().catch(() => '');
  let data: unknown = text;
  if (!o.raw) {
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { text };
    }
  }
  if (res.ok) return { data: data as T, headers: res.headers, status: res.status };
  const detail = typeof data === 'object' && data !== null ? JSON.stringify(data).slice(0, 240) : String(text).slice(0, 240);
  if (res.status === 401 || res.status === 403) throw new ConnectionAuthError(`인증이 거절됐어요(${res.status}) — 설정에서 다시 연결해 주세요 ${detail}`);
  if (res.status >= 500 && o.mutating) throw new AmbiguousError(`상대 서버에 문제가 있어요(${res.status}) — 처리됐는지 알 수 없어요 ${detail}`);
  throw new RequestError(`요청이 거절됐어요(${res.status}) ${detail}`, res.status);
}
