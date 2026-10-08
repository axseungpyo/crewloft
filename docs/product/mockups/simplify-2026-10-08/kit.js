// 화면 단순화 견본(2026-10-08) 공용 — 고정 장면 데이터 · 아이콘 · 진짜 3D 사무실 불러오기.
// 서버 · 가짜 AI 연결 없음. 워크트리 루트를 서버 뿌리로 띄워야 /web · /node_modules 경로가 맞는다.
import { iconSvg } from '/web/js/icons.js';

export const ic = (n, s = 18) => iconSvg(n, s);
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** 장면 하나 — 골목커피 · 10월 2주차 */
export const SCENE = {
  company: '골목커피',
  week: '10월 2주차',
  people: {
    mina: { id: 'mina', name: '미나', role: 'manager', roleFull: '매니저 : 계획 · 조율 담당', rank: '매니저(팀장)' },
    leo: { id: 'leo', name: '레오', role: 'researcher', roleFull: '리서처 : 조사 담당', rank: '사원' },
    hana: { id: 'hana', name: '하나', role: 'writer', roleFull: '작가 : 글 담당', rank: '사원' },
  },
  /** 미나의 되묻기(결정 80 ②) */
  ask: {
    who: 'mina',
    text: '받은 자료의 (가정) 표시 문장을 그대로 써도 될까요?',
    why: '원가표 수수료 줄이 대표님이 주신 자료의 "(가정) 배달앱 수수료 12.5%"를 그대로 옮긴 거예요.',
    options: [{ key: 'keep', label: '그대로 써 주세요', reply: '네, (가정) 표시를 남긴 채로 쓸게요.' }, { key: 'drop', label: '가정은 빼 주세요', reply: '알겠어요. 수수료 줄은 "확인 필요"로 바꿔 둘게요.' }],
  },
  /** 미나가 만든 메뉴 원가표 — 재료 · 포장 · 수수료 3줄 */
  cost: {
    who: 'mina',
    title: '메뉴 원가표',
    cols: ['아메리카노 4,500원', '카페라테 5,000원'],
    rows: [
      { k: '재료', d: '원두 18g · 우유 · 시럽', v: ['720원', '1,240원'] },
      { k: '포장', d: '컵 · 뚜껑 · 홀더', v: ['230원', '230원'] },
      { k: '수수료', d: '배달앱 12.5% (가정)', v: ['563원', '625원'], assumed: true },
    ],
    sum: { k: '원가 합계', v: ['1,513원', '2,095원'], rate: ['34%', '42%'] },
  },
  /** 밖으로 나갈 글 — 원문 확인 → 승인 두 단계(결정 80 ③) */
  post: {
    who: 'hana',
    title: '가게 소개 문구',
    where: '네이버 플레이스 소개란',
    text: '골목 끝, 아침 7시에 문을 여는 작은 커피집이에요. 매일 아침 직접 볶은 원두로 아메리카노를 내리고, 출근길 단골에게는 이름을 불러 드려요.',
  },
  /** 레오 — 상권 조사 중 */
  research: { who: 'leo', title: '상권 조사', now: '반경 500m 카페 12곳 가격 · 영업시간을 모으는 중', eta: '오늘 저녁' },
  docs: [
    { title: '메뉴 원가표', who: '미나', state: 'me', word: '대표 확인' },
    { title: '상권 조사 메모', who: '레오', state: 'working', word: '일하는 중' },
    { title: '가게 소개 문구', who: '하나', state: 'me', word: '대표 확인' },
    { title: '이번 달 실행 계획', who: '미나', state: 'done', word: '끝' },
  ],
};

/** 상태 낱말 여섯 개 → base.css의 알약 클래스 */
export const ST_CLASS = { todo: 'st-waiting', working: 'st-working', me: 'st-me', done: 'st-done', pause: 'st-paused', issue: 'st-failed' };
export const pill = (st, word) => `<span class="pill ${ST_CLASS[st]}">${esc(word)}</span>`;

/** 원가표 — 선만 쓰는 표 */
export function costTable(c = SCENE.cost) {
  return `<table class="sx-table"><thead><tr><th></th>${c.cols.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>
    ${c.rows.map((r) => `<tr class="${r.assumed ? 'assumed' : ''}"><th><b>${esc(r.k)}</b><small>${esc(r.d)}</small></th>${r.v.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}
  </tbody><tfoot><tr><th><b>${esc(c.sum.k)}</b><small>판매가 대비</small></th>${c.sum.v.map((v, i) => `<td>${esc(v)}<small>${esc(c.sum.rate[i])}</small></td>`).join('')}</tr></tfoot></table>`;
}

/** 진짜 3D 사무실(web/js/office3d)을 그대로 불러 온다. 실패하면 null — 부르는 쪽이 스크린샷 배경으로 바꾼다 */
export async function mountOffice(host, overlay, { stage = 1, city = true, onPick } = {}) {
  if (!window.WebGL2RenderingContext) return null;
  try {
    const [{ createOffice }, { loadLayout }] = await Promise.all([import('/web/js/office3d/office.js'), import('/web/js/office3d/layouts/index.js')]);
    const h = await createOffice(host, overlay, { layout: await loadLayout(stage), onPick, city });
    return h;
  } catch (e) {
    console.error('3D 사무실을 열지 못했어요', e);
    return null;
  }
}

/** 3D에 넘길 화면 값 — people: [{ id, status, statusLabel, mode, flag, bubble, task }] */
export function officeView(people, { decisions = 0, selectedId = null } = {}) {
  return {
    company: SCENE.company, officeLevel: '레벨 1', cycleLabel: SCENE.week,
    flow: [{ key: 'cost', label: '원가표', state: 'me', who: ['미나'] }, { key: 'res', label: '상권 조사', state: 'working', who: ['레오'] }, { key: 'post', label: '소개 문구', state: 'me', who: ['하나'] }],
    decisions, books: 1, trophies: 0, aiOn: true, aiLabel: '견본 AI', selectedId,
    employees: people.map((p) => ({ ...SCENE.people[p.id], ...p })),
  };
}

/** 견본 공통 — ?theme=dark|light */
export function applyTheme() {
  const t = new URLSearchParams(location.search).get('theme');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
}
