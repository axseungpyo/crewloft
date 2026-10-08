import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DomainError, type Repo, newId, now } from '../store/repo.ts';

/**
 * 계정(결정 74) — 공개 서비스 기준의 회원가입 · 로그인. AUTH_MODE=accounts 일 때만 쓴다(로컬 모드는 지금처럼 계정 없이).
 * 이메일 · 비밀번호(scrypt) + 구글(지금은 임시 계정 선택 화면). 세션은 쿠키(HttpOnly · SameSite=Lax).
 * 계정별 사무실 분리는 다음 단계(H2) — 그 전까지는 한 서버에 계정 하나만 만들 수 있다.
 */
const COOKIE = 'ao_sid';
const DAYS = 30;
const MAX_FAILS = 5, LOCK_MS = 10 * 60_000;
const RESET_MIN = 30, VERIFY_HOURS = 48;

export interface Account { id: string; email: string; name: string | null; emailVerified: boolean; google: boolean; hasPassword: boolean; createdAt: string }
interface Row { id: string; email: string; name: string | null; password_hash: string | null; google_sub: string | null; email_verified: number; created_at: string }
const toAccount = (r: Row): Account => ({ id: r.id, email: r.email, name: r.name, emailVerified: !!r.email_verified, google: !!r.google_sub, hasPassword: !!r.password_hash, createdAt: r.created_at });

const cookieOf = (req: IncomingMessage): string | null => {
  for (const part of (req.headers.cookie ?? '').split(';')) { const [k, ...v] = part.trim().split('='); if (k === COOKIE) return decodeURIComponent(v.join('=')); }
  return null;
};
const sha = (t: string) => createHash('sha256').update(t).digest('base64url');
const normEmail = (e: unknown): string => {
  const s = String(e ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || s.length > 200) throw new DomainError(400, '이메일 주소를 확인해 주세요');
  return s;
};
const checkPassword = (p: unknown): string => {
  const s = String(p ?? '');
  if (s.length < 8) throw new DomainError(400, '비밀번호는 8자 이상으로 정해 주세요');
  if (s.length > 200) throw new DomainError(400, '비밀번호가 너무 길어요');
  return s;
};
const hashPassword = (pw: string): string => { const salt = randomBytes(16); return `${salt.toString('base64')}:${scryptSync(pw, salt, 32).toString('base64')}`; };
const samePassword = (pw: string, stored: string | null): boolean => {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash ?? '', 'base64'), got = scryptSync(pw, Buffer.from(salt ?? '', 'base64'), 32);
  return expected.length === got.length && timingSafeEqual(expected, got);
};

export class Accounts {
  #repo: Repo;
  #fails = new Map<string, { n: number; until: number }>();
  /** 메일 대신 남기는 링크(메일 발송 서비스가 정해지기 전 · 개발용) */
  outbox: Array<{ to: string; kind: string; link: string; at: string }> = [];

  constructor(repo: Repo) { this.#repo = repo; }

  #one(sql: string, ...a: string[]): Row | undefined { return this.#repo.one<Row>(sql, ...a) ?? undefined; }
  count(): number { return this.#repo.one<{ n: number }>('SELECT COUNT(*) AS n FROM accounts')?.n ?? 0; }

  /** 임시: 한 서버에 계정 하나(계정별 사무실 분리 전) */
  #roomForNew(): void {
    if (this.count() >= 1) throw new DomainError(409, '지금은 한 서버에 계정 하나만 만들 수 있어요 — 계정마다 사무실을 따로 두는 기능을 준비하고 있어요');
  }

  signup(body: { email?: unknown; password?: unknown; agree?: unknown }, res: ServerResponse, secure: boolean): Account {
    if (body.agree !== true) throw new DomainError(400, '이용약관과 개인정보 처리방침에 동의해 주세요');
    const email = normEmail(body.email), pw = checkPassword(body.password);
    const ex = this.#one('SELECT * FROM accounts WHERE email = ?', email);
    if (ex) throw new DomainError(409, ex.google_sub && !ex.password_hash ? '이 이메일은 Google로 가입했어요 — Google로 로그인해 주세요' : '이미 가입된 이메일이에요 — 로그인할까요?');
    this.#roomForNew();
    const id = newId('ac');
    this.#repo.exec('INSERT INTO accounts (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)', id, email, hashPassword(pw), now());
    this.#mail(id, email, 'verify');
    this.#session(id, res, secure);
    return this.get(id)!;
  }

  login(body: { email?: unknown; password?: unknown }, ip: string, res: ServerResponse, secure: boolean): Account {
    const email = normEmail(body.email), key = `${email}|${ip}`;
    const f = this.#fails.get(key);
    if (f && f.until > Date.now()) throw new DomainError(429, '로그인 시도가 많아요 — 10분 뒤에 다시 해 주세요');
    const row = this.#one('SELECT * FROM accounts WHERE email = ?', email);
    if (!row || !samePassword(String(body.password ?? ''), row.password_hash)) {
      const n = (f && f.until <= Date.now() && f.n >= MAX_FAILS ? 0 : f?.n ?? 0) + 1;
      this.#fails.set(key, { n, until: n >= MAX_FAILS ? Date.now() + LOCK_MS : 0 });
      throw new DomainError(401, row?.google_sub && !row.password_hash ? '이 이메일은 Google로 가입했어요 — Google로 로그인해 주세요' : '이메일 또는 비밀번호가 맞지 않아요');
    }
    this.#fails.delete(key);
    this.#session(row.id, res, secure);
    return toAccount(row);
  }

  /** 구글 — 지금은 임시 계정 선택 화면(개발용). 실제 OpenID Connect는 클라이언트 ID가 생기면(H3) */
  googleMock(body: { email?: unknown; name?: unknown }, res: ServerResponse, secure: boolean): Account {
    const email = normEmail(body.email), name = String(body.name ?? '').trim().slice(0, 40) || email.split('@')[0]!;
    let row = this.#one('SELECT * FROM accounts WHERE email = ?', email);
    if (row) this.#repo.exec('UPDATE accounts SET google_sub = COALESCE(google_sub, ?), email_verified = 1, name = COALESCE(name, ?) WHERE id = ?', `mock:${email}`, name, row.id);
    else {
      this.#roomForNew();
      const id = newId('ac');
      this.#repo.exec('INSERT INTO accounts (id, email, name, google_sub, email_verified, created_at) VALUES (?, ?, ?, ?, 1, ?)', id, email, name, `mock:${email}`, now());
      row = this.#one('SELECT * FROM accounts WHERE id = ?', id);
    }
    this.#session(row!.id, res, secure);
    return this.get(row!.id)!;
  }

  forgot(body: { email?: unknown }): { ok: true } {
    const email = normEmail(body.email);
    const row = this.#one('SELECT * FROM accounts WHERE email = ?', email);
    if (row) this.#mail(row.id, email, 'reset'); // 가입 여부는 알려 주지 않는다
    return { ok: true };
  }

  reset(body: { token?: unknown; password?: unknown }): { ok: true } {
    const t = this.#use(String(body.token ?? ''), 'reset');
    const pw = checkPassword(body.password);
    this.#repo.tx(() => {
      this.#repo.exec('UPDATE accounts SET password_hash = ? WHERE id = ?', hashPassword(pw), t.account_id);
      this.#repo.exec('DELETE FROM sessions WHERE account_id = ?', t.account_id); // 다른 기기 로그인은 모두 끊는다
    });
    return { ok: true };
  }

  verify(body: { token?: unknown }): { ok: true } {
    const t = this.#use(String(body.token ?? ''), 'verify');
    this.#repo.exec('UPDATE accounts SET email_verified = 1 WHERE id = ?', t.account_id);
    return { ok: true };
  }

  me(req: IncomingMessage): Account | null {
    const sid = cookieOf(req);
    if (!sid) return null;
    const s = this.#repo.one<{ account_id: string | null; expires_at: string }>('SELECT account_id, expires_at FROM sessions WHERE id = ?', sid);
    if (!s?.account_id || s.expires_at <= now()) return null;
    return this.get(s.account_id);
  }
  get(id: string): Account | null { const r = this.#one('SELECT * FROM accounts WHERE id = ?', id); return r ? toAccount(r) : null; }

  logout(req: IncomingMessage, res: ServerResponse, everywhere = false): void {
    const sid = cookieOf(req), me = this.me(req);
    if (everywhere && me) this.#repo.exec('DELETE FROM sessions WHERE account_id = ?', me.id);
    else if (sid) this.#repo.exec('DELETE FROM sessions WHERE id = ?', sid);
    res.setHeader('set-cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  }

  #session(accountId: string, res: ServerResponse, secure: boolean): void {
    const id = randomBytes(24).toString('base64url');
    this.#repo.exec('INSERT INTO sessions (id, created_at, expires_at, account_id) VALUES (?, ?, ?, ?)', id, now(), new Date(Date.now() + DAYS * 86_400_000).toISOString(), accountId);
    res.setHeader('set-cookie', `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DAYS * 86400}${secure ? '; Secure' : ''}`);
  }

  #mail(accountId: string, to: string, kind: 'verify' | 'reset'): void {
    const token = randomBytes(24).toString('base64url');
    const ms = kind === 'reset' ? RESET_MIN * 60_000 : VERIFY_HOURS * 3_600_000;
    this.#repo.exec('INSERT INTO auth_tokens (hash, account_id, kind, expires_at) VALUES (?, ?, ?, ?)', sha(token), accountId, kind, new Date(Date.now() + ms).toISOString());
    const link = `/${kind}?token=${token}`;
    this.outbox.push({ to, kind, link, at: now() });
    if (this.outbox.length > 20) this.outbox.shift();
    console.log(`[메일 대신] ${to} — ${kind === 'reset' ? '비밀번호 재설정' : '이메일 확인'}: ${link}`);
  }

  #use(token: string, kind: string): { account_id: string } {
    const t = this.#repo.one<{ hash: string; account_id: string; expires_at: string; used_at: string | null }>('SELECT * FROM auth_tokens WHERE hash = ? AND kind = ?', sha(token), kind);
    if (!t || t.used_at || t.expires_at <= now()) throw new DomainError(400, '링크가 만료됐거나 이미 썼어요 — 다시 요청해 주세요');
    this.#repo.exec('UPDATE auth_tokens SET used_at = ? WHERE hash = ?', now(), t.hash);
    return t;
  }
}
