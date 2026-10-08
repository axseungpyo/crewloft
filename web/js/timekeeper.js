// 대표가 들인 시간(결정 72) — 화면이 보이고 최근에 움직임이 있을 때만 영역별 초를 모아 30초마다 보낸다.
// 무엇을 봤는지는 보내지 않고, 영역 이름과 초만 보낸다. 이 컴퓨터의 서버에만 저장된다.
const IDLE_MS = 90_000, TICK_MS = 5_000, FLUSH_MS = 30_000;

/** 지금 화면 → 영역 */
function areaNow() {
  if (document.querySelector('.summary-layer')) return 'review'; // 복귀 요약 읽기
  if (document.querySelector('.ob')) return 'setup'; // 처음 준비(온보딩)
  const [menu = 'office', tab] = (location.hash.replace(/^#\/?/, '') || 'office').split('/');
  if (menu === 'decisions') return 'decide';
  if (document.querySelector('.bsheet.dec')) return 'decide'; // 사무실 · 문서에서 연 대표 몫 시트(결정 87)
  if (menu === 'docs' || menu === 'work' || menu === 'content') return 'review'; // 문서(옛 '일' · '콘텐츠')
  if (menu === 'company') return tab === 'employees' && location.hash.split('/').length > 3 ? 'direct' : 'manage';
  if (menu === 'settings') return 'setup';
  if (document.querySelector('.rp3')) return 'review'; // 3D 리플레이
  if (document.querySelector('.bsheet.emp')) return 'direct'; // 직원 시트(대화 · 지시)
  return 'office';
}

export function startTimekeeper() {
  let lastInput = Date.now(), lastTick = Date.now(), lastFlush = Date.now();
  let spans = {};
  const poke = () => { lastInput = Date.now(); };
  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart']) addEventListener(ev, poke, { passive: true, capture: true });
  const send = (beacon = false) => {
    if (!Object.keys(spans).length) return;
    const body = JSON.stringify({ spans }); spans = {}; lastFlush = Date.now();
    if (beacon && navigator.sendBeacon) navigator.sendBeacon('/api/time', new Blob([body], { type: 'application/json' }));
    else fetch('/api/time', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
  };
  setInterval(() => {
    const now = Date.now(), dt = Math.min(now - lastTick, TICK_MS * 2); lastTick = now;
    if (document.visibilityState === 'visible' && now - lastInput < IDLE_MS) {
      const a = areaNow(); spans[a] = (spans[a] ?? 0) + dt / 1000;
    }
    if (now - lastFlush >= FLUSH_MS) send();
  }, TICK_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') send(true); else { lastInput = Date.now(); lastTick = Date.now(); } });
  addEventListener('pagehide', () => send(true));
}
