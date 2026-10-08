import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type App, createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';

/** 임시 데이터 폴더 + 빠른 가짜 AI로 앱을 만든다(외부 호출 없음) */
export function makeApp(env: Record<string, string> = {}): { app: App; done: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'ao-test-'));
  const cfg = loadConfig({ DATA_DIR: dir, FAKE_SPEED_MS: '15', HANDOFF_ACCEPT_MS: '5', TICK_MS: '15', ...env } as NodeJS.ProcessEnv);
  const app = createApp(cfg);
  return {
    app,
    done: () => {
      app.stop();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export async function until(cond: () => boolean, ms = 8000, label = '조건'): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`${label} 시간 초과`);
    await new Promise((r) => setTimeout(r, 15));
  }
}

/** 사무실을 열고 매니저까지 채용한다 */
export async function setupManager(app: App): Promise<void> {
  app.repo.createOffice('툴로그', '1인 창업자들이 쓰는 생산성 도구를 리뷰하는 브랜드');
  app.onboarding.confirmPower();
  const req = app.onboarding.startInterview();
  await until(() => app.requests.get(req.id)?.status === 'done', 8000, '면접');
  app.onboarding.hireFromCandidate({ role: 'manager', archetype: 'careful', name: '미나' });
}
