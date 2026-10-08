import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeApp } from './helpers.ts';

/** 응답 흉내 — 쿠키만 받는다 */
const resLike = () => { const h: Record<string, string> = {}; return { setHeader: (k: string, v: string) => { h[k] = v; }, h } as unknown as import('node:http').ServerResponse & { h: Record<string, string> }; };
const reqWith = (res: { h: Record<string, string> }) => ({ headers: { cookie: (res.h['set-cookie'] ?? '').split(';')[0] } }) as unknown as import('node:http').IncomingMessage;

test('계정(결정 74) — 가입 · 로그인 · 잘못된 비밀번호 · 시도 제한 · 재설정 · 이메일 확인 · 임시 구글 · 한 서버 한 계정', () => {
  const { app, done } = makeApp({ AUTH_MODE: 'accounts' });
  try {
    const a = app.accounts;
    assert.throws(() => a.signup({ email: 'x@y.com', password: '12345678' }, resLike(), false), /동의/);
    assert.throws(() => a.signup({ email: 'bad', password: '12345678', agree: true }, resLike(), false), /이메일/);
    assert.throws(() => a.signup({ email: 'a@b.com', password: 'short', agree: true }, resLike(), false), /8자/);
    const r1 = resLike();
    const acc = a.signup({ email: 'Owner@Test.com', password: 'password123', agree: true }, r1, false);
    assert.equal(acc.email, 'owner@test.com', '이메일은 소문자로');
    assert.equal(acc.emailVerified, false);
    assert.equal(a.me(reqWith(r1))?.id, acc.id, '가입하면 바로 로그인');
    assert.match(r1.h['set-cookie']!, /HttpOnly; SameSite=Lax/);
    assert.throws(() => a.signup({ email: 'owner@test.com', password: 'password123', agree: true }, resLike(), false), /이미 가입된/);
    assert.throws(() => a.signup({ email: 'second@test.com', password: 'password123', agree: true }, resLike(), false), /계정 하나/);

    // 이메일 확인 링크
    const verify = a.outbox.find((m) => m.kind === 'verify')!;
    a.verify({ token: new URL(verify.link, 'http://x').searchParams.get('token') });
    assert.equal(a.get(acc.id)?.emailVerified, true);
    assert.throws(() => a.verify({ token: new URL(verify.link, 'http://x').searchParams.get('token') }), /이미 썼어요/, '링크는 한 번만');

    // 로그인 · 실패 · 잠금
    assert.throws(() => a.login({ email: 'owner@test.com', password: 'wrong-pass' }, '1.1.1.1', resLike(), false), /이메일 또는 비밀번호/);
    for (let i = 0; i < 4; i++) assert.throws(() => a.login({ email: 'owner@test.com', password: 'wrong-pass' }, '2.2.2.2', resLike(), false));
    assert.throws(() => a.login({ email: 'owner@test.com', password: 'wrong-pass' }, '2.2.2.2', resLike(), false), /이메일 또는 비밀번호/);
    assert.throws(() => a.login({ email: 'owner@test.com', password: 'password123' }, '2.2.2.2', resLike(), false), /시도가 많아요/, '5번 틀리면 잠깐 막아요');
    const r2 = resLike();
    a.login({ email: 'owner@test.com', password: 'password123' }, '3.3.3.3', r2, false);
    assert.equal(a.me(reqWith(r2))?.id, acc.id);

    // 비밀번호 재설정 — 가입 여부를 알려 주지 않고, 바꾸면 다른 기기 로그인은 끊는다
    assert.deepEqual(a.forgot({ email: 'nobody@test.com' }), { ok: true });
    a.forgot({ email: 'owner@test.com' });
    const reset = a.outbox.filter((m) => m.kind === 'reset').at(-1)!;
    a.reset({ token: new URL(reset.link, 'http://x').searchParams.get('token'), password: 'new-password-1' });
    assert.equal(a.me(reqWith(r2)), null, '다른 기기 로그인 끊김');
    assert.throws(() => a.login({ email: 'owner@test.com', password: 'password123' }, '4.4.4.4', resLike(), false), /맞지 않아요/);
    a.login({ email: 'owner@test.com', password: 'new-password-1' }, '4.4.4.4', resLike(), false);

    // 임시 구글 — 같은 이메일이면 연결, 새 이메일은 한 서버 한 계정이라 막힘
    const r3 = resLike();
    const g = a.googleMock({ email: 'owner@test.com', name: '대표' }, r3, false);
    assert.equal(g.id, acc.id); assert.equal(g.google, true);
    assert.throws(() => a.googleMock({ email: 'other@gmail.com' }, resLike(), false), /계정 하나/);
    a.logout(reqWith(r3), resLike());
    assert.equal(a.me(reqWith(r3)), null, '로그아웃');
  } finally {
    done();
  }
});
