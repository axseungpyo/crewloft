import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AppId, Connection } from '../core/types.ts';
import { APP_LABEL } from '../integrations/index.ts';
import { type Repo, now } from './repo.ts';

/** 앱 연결 상태 낱말(작업 기록 한 줄) — 영어 상태 값을 그대로 보이지 않는다 */
const CONN_WORD: Record<Connection['status'], string> = { connected: '연결됨', needs_reauth: '다시 연결 필요', error: '문제가 생김', disconnected: '연결 끊김' };
const appName = (app: string): string => APP_LABEL[app] ?? app;

/**
 * 연결 토큰 암호화(AES-256-GCM). 키는 AO_SECRET_KEY(base64 32바이트) 또는 data/secret.key(권한 600).
 * 키 파일이 없어지면 저장된 토큰을 풀 수 없으므로 다시 연결해야 한다.
 */
export class Secrets {
  #key: Buffer;

  constructor(dataDir: string, envKey?: string) {
    if (envKey) {
      const k = Buffer.from(envKey, 'base64');
      if (k.length !== 32) throw new Error('AO_SECRET_KEY는 base64로 인코딩한 32바이트여야 해요');
      this.#key = k;
      return;
    }
    const file = path.join(dataDir, 'secret.key');
    if (!existsSync(file)) {
      writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600 });
    }
    chmodSync(file, 0o600);
    this.#key = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
  }

  seal(value: unknown): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.#key, iv);
    const enc = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
  }

  open<T>(sealed: string): T {
    const buf = Buffer.from(sealed, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.#key, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8')) as T;
  }
}

interface Row { app: string; status: string; label: string | null; config: string; secret: string | null; expires_at: string | null; checked_at: string | null; last_error: string | null; created_at: string; updated_at: string }

const toConn = (r: Row): Connection => ({
  app: r.app as AppId, status: r.status as Connection['status'], label: r.label, config: JSON.parse(r.config) as Record<string, unknown>,
  hasSecret: !!r.secret, expiresAt: r.expires_at, checkedAt: r.checked_at, lastError: r.last_error, updatedAt: r.updated_at,
});

/** 연결된 앱. 화면에는 비밀값을 절대 돌려주지 않는다(hasSecret만). */
export class ConnectionStore {
  #repo: Repo;
  #secrets: Secrets;

  constructor(repo: Repo, secrets: Secrets) {
    this.#repo = repo;
    this.#secrets = secrets;
  }

  list(): Connection[] {
    return this.#repo.many<Row>('SELECT * FROM connections ORDER BY app').map(toConn);
  }

  get(app: string): Connection | null {
    const r = this.#repo.one<Row>('SELECT * FROM connections WHERE app = ?', app);
    return r ? toConn(r) : null;
  }

  connected(app: string): boolean {
    return this.get(app)?.status === 'connected';
  }

  /** 서버 안에서만 쓰는 비밀값(토큰·키) */
  secret<T = Record<string, unknown>>(app: string): T | null {
    const r = this.#repo.one<Row>('SELECT secret FROM connections WHERE app = ?', app);
    if (!r?.secret) return null;
    try {
      return this.#secrets.open<T>(r.secret);
    } catch {
      return null;
    }
  }

  upsert(app: AppId, input: { status: Connection['status']; label?: string | null; config?: Record<string, unknown>; secret?: unknown; expiresAt?: string | null; lastError?: string | null }): Connection {
    const cur = this.#repo.one<Row>('SELECT * FROM connections WHERE app = ?', app);
    const sealed = input.secret === undefined ? cur?.secret ?? null : input.secret === null ? null : this.#secrets.seal(input.secret);
    const config = JSON.stringify(input.config ?? (cur ? JSON.parse(cur.config) : {}));
    if (cur) {
      this.#repo.exec(
        'UPDATE connections SET status = ?, label = ?, config = ?, secret = ?, expires_at = ?, checked_at = ?, last_error = ?, updated_at = ? WHERE app = ?',
        input.status, input.label === undefined ? cur.label : input.label, config, sealed, input.expiresAt === undefined ? cur.expires_at : input.expiresAt,
        now(), input.lastError ?? null, now(), app,
      );
    } else {
      this.#repo.exec(
        'INSERT INTO connections (app, status, label, config, secret, expires_at, checked_at, last_error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        app, input.status, input.label ?? null, config, sealed, input.expiresAt ?? null, now(), input.lastError ?? null, now(), now(),
      );
    }
    this.#repo.emit('connection_changed', `${appName(app)} 연결 — ${CONN_WORD[input.status]}`, { subjectId: app, data: { app, status: input.status } });
    return this.get(app)!;
  }

  setStatus(app: string, status: Connection['status'], lastError: string | null = null): void {
    if (!this.get(app)) return;
    this.#repo.exec('UPDATE connections SET status = ?, last_error = ?, checked_at = ?, updated_at = ? WHERE app = ?', status, lastError, now(), now(), app);
    this.#repo.emit('connection_changed', `${appName(app)} 연결 — ${CONN_WORD[status]}${lastError ? ` (${lastError})` : ''}`, { subjectId: app, data: { app, status } });
  }

  /** 연결 해제 — 비밀값을 지운다. 이미 만든 외부 문서·게시물은 지우지 않는다. */
  remove(app: string): void {
    this.#repo.exec('DELETE FROM connections WHERE app = ?', app);
    this.#repo.emit('connection_changed', `${appName(app)} 연결을 끊었어요(이미 보낸 결과물은 그대로)`, { subjectId: app, data: { app, status: 'disconnected' } });
  }
}
