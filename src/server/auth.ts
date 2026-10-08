import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DomainError, type Repo, now } from '../store/repo.ts';

const COOKIE = 'ao_sid';
const DAYS = 30;

function readCookie(req: IncomingMessage, name: string): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/**
 * 소유자 비밀번호(선택). 비밀번호를 정하면 화면·API에 로그인이 필요하다.
 * 외부에서 접속하는 VPS에서는 반드시 켠다(vps-deployment.md §4). 로컬(127.0.0.1)에서는 기본으로 꺼져 있다.
 */
export class Auth {
  #repo: Repo;

  constructor(repo: Repo) {
    this.#repo = repo;
  }

  enabled(): boolean {
    return !!this.#repo.getSetting<string>('auth.hash');
  }

  setPassword(password: string | null): void {
    if (password === null) {
      this.#repo.deleteSetting('auth.hash');
      this.#repo.exec('DELETE FROM sessions');
      this.#repo.emit('system', '소유자 비밀번호를 껐어요');
      return;
    }
    if (password.length < 8) throw new DomainError(400, '비밀번호는 8자 이상으로 정해 주세요');
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 32);
    this.#repo.setSetting('auth.hash', `${salt.toString('base64')}:${hash.toString('base64')}`);
    this.#repo.exec('DELETE FROM sessions');
    this.#repo.emit('system', '소유자 비밀번호를 정했어요');
  }

  #check(password: string): boolean {
    const stored = this.#repo.getSetting<string>('auth.hash');
    if (!stored) return false;
    const [salt, hash] = stored.split(':');
    const expected = Buffer.from(hash ?? '', 'base64');
    const got = scryptSync(password, Buffer.from(salt ?? '', 'base64'), 32);
    return expected.length === got.length && timingSafeEqual(expected, got);
  }

  login(password: string, res: ServerResponse, secure: boolean): void {
    if (!this.#check(password)) throw new DomainError(401, '비밀번호가 맞지 않아요');
    const id = randomBytes(24).toString('base64url');
    const expires = new Date(Date.now() + DAYS * 86_400_000).toISOString();
    this.#repo.exec('INSERT INTO sessions (id, created_at, expires_at) VALUES (?, ?, ?)', id, now(), expires);
    res.setHeader('set-cookie', `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DAYS * 86400}${secure ? '; Secure' : ''}`);
  }

  logout(req: IncomingMessage, res: ServerResponse): void {
    const sid = readCookie(req, COOKIE);
    if (sid) this.#repo.exec('DELETE FROM sessions WHERE id = ?', sid);
    res.setHeader('set-cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  }

  authorize(req: IncomingMessage, pathname: string): boolean {
    if (!this.enabled()) return true;
    // 로그인 화면을 띄우는 데 필요한 정적 파일·로그인 API·외부 콜백·상태 확인은 열어 둔다
    if (pathname === '/api/login' || pathname === '/api/auth' || pathname === '/healthz' || pathname.startsWith('/oauth/')) return true;
    if (!pathname.startsWith('/api/')) return true;
    const sid = readCookie(req, COOKIE);
    if (!sid) return false;
    const row = this.#repo.one<{ expires_at: string }>('SELECT expires_at FROM sessions WHERE id = ?', sid);
    return !!row && row.expires_at > now();
  }
}
