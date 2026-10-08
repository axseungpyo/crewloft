import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { personaPrompt } from '../src/ai/prompts.ts';
import { STATUS_DETAIL, STATUS_LABEL } from '../src/core/task-state.ts';
import { startCycle } from '../src/engine/cycle.ts';
import { FAC } from '../src/engine/facilities.ts';
import { milestones } from '../src/engine/growth.ts';
import { LEVEL_LABEL } from '../src/engine/office-growth.ts';
import { RES } from '../src/engine/space.ts';
import { makeApp, setupManager, until } from './helpers.ts';

// 브랜드 말투(crewloft-brand §3 · brand.md §4 원칙 4) — 서버가 만드는 낱말이 화면과 같은 말을 쓰는지

/** 화면 lib.js의 여섯 낱말 · 묶음 표를 그대로 읽는다(화면 파일은 Preact를 불러 와서 직접 import하지 않음) */
function screenWords(): { st6: Record<string, string>; group: Record<string, string> } {
  const src = readFileSync(new URL('../web/js/lib.js', import.meta.url), 'utf8');
  const obj = (name: string) => Function(`return (${src.match(new RegExp(`${name} = (\\{[\\s\\S]*?\\});`))![1]})`)() as Record<string, string>;
  return { st6: obj('ST6'), group: obj('ST_GROUP') };
}

test('상태 낱말 — 서버 STATUS_LABEL은 화면 stWord와 같은 여섯 낱말, 자세한 낱말은 따로', () => {
  const { st6, group } = screenWords();
  const six = new Set(Object.values(st6));
  assert.equal(six.size, 6);
  for (const [status, word] of Object.entries(STATUS_LABEL)) {
    assert.ok(six.has(word), `${status} → ${word}는 여섯 낱말 중 하나`);
    assert.equal(word, st6[group[status]!], `${status}는 화면과 같은 묶음`);
  }
  assert.deepEqual(Object.keys(STATUS_DETAIL).sort(), Object.keys(STATUS_LABEL).sort());
});

test('실적 자원 아이콘 — 이모지가 아니라 화면 icons.js의 이름(키)만', () => {
  const icons = readFileSync(new URL('../web/js/icons.js', import.meta.url), 'utf8');
  for (const [k, r] of Object.entries(RES)) {
    assert.match(r.icon, /^[a-z]+$/, `${k} 아이콘은 이름`);
    assert.ok(icons.includes(`  ${r.icon}: '`), `${r.icon} 모양이 icons.js에 있음`);
  }
});

test('직원 기본 지시문 — 대표님 · 할 일 먼저 · 숫자로 · 내부 개발 용어 없이 · 자기 직무 설명', async () => {
  const { app, done } = makeApp();
  try {
    await setupManager(app);
    const { repo } = app;
    const manager = repo.employeeByRole('manager')!;
    const p = personaPrompt({ office: repo.getOffice()!, brief: repo.getProject()!.brief, employee: manager, teammates: [manager] });
    assert.ok(p.includes('대표님이 최종 확인합니다'));
    assert.ok(!p.includes('대표(사용자)'));
    assert.match(p, /첫 문장에 대표님이 할 일이나 결과/);
    assert.match(p, /숫자로 말합니다/);
    assert.match(p, /내부 개발 용어는 쓰지 않습니다/);
    assert.match(p, /맡은 일: 매니저 : 계획 · 조율 담당/);
  } finally {
    done();
  }
});

test('서버가 만드는 이름 · 알림 — 내부 낱말(회차 · 가짜 AI) 없이 화면과 같은 말', async () => {
  const { app, done } = makeApp();
  try {
    assert.equal(app.providers.fake.label, '견본 AI', '화면 aiName()과 같은 이름');
    const names = [...Object.values(LEVEL_LABEL), ...Object.values(FAC).flatMap((f) => [f.label, ...Object.values(f.steps).map((s) => s.unlock)])];
    await setupManager(app);
    names.push(...milestones(app).flatMap((m) => [m.title, m.note]));
    app.start();
    const c = startCycle(app.repo, 'manual');
    await until(() => app.repo.getCycle(c.id)?.status === 'done', 10000, '회차 완료');
    names.push(...app.repo.events(0, 500).filter((e) => ['cycle_started', 'cycle_finished'].includes(e.type)).map((e) => e.data.text));
    for (const n of names) assert.doesNotMatch(n, /회차|가짜 AI|Lv/, n);
    assert.ok(names.some((n) => /일을 시작했어요/.test(n)) && names.some((n) => /일이 끝났어요/.test(n)), '시작 · 끝 알림');
  } finally {
    done();
  }
});
