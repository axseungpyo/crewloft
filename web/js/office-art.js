// 아이소메트릭 사무실 — 시설은 실제 상태와 연동한다(화이트보드=이번 회차, 우편함=결정 대기, 전력 패널=AI 연결,
// 책장=회사 지식, 트로피=실제 마일스톤). 채용할수록 책상이 채워진다(결정 54).
import { charSVG } from './art.js';

export const VB = { w: 960, h: 600 };
const CX = 480, CY = 335, RR = 235, WALL = 118, LINE = '#2B302D';
export const iso = (a, b, h = 0) => [CX + (a - b) * 0.866, CY + (a + b) * 0.5 - h];
const pts = (arr) => arr.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
const S = (fill) => `fill="${fill}" stroke="${LINE}" stroke-width="1.1" stroke-linejoin="round"`;

const THEMES = {
  sage: { wallL: '#E9E4D6', wallR: '#DCE5DE', floor: '#EFE3CC', floorLine: '#E2D2B4' },
  cream: { wallL: '#F1EBDD', wallR: '#EDE6D6', floor: '#F2E8D5', floorLine: '#E6D8BE' },
  clay: { wallL: '#EBDCD0', wallR: '#F0E2D6', floor: '#EDE0CB', floorLine: '#E0CEB0' },
};
const WOOD = { t: '#EAD6B3', l: '#D6BC92', r: '#C7AB80' };

/** 역할별 책상 자리(a, b) */
export const DESKS = { manager: [105, -150], researcher: [-125, -35], writer: [-15, 85], designer: [135, 55] };
const SEAT_BACK = 30;

function box(a, b, w, d, h, col, z = 0) {
  const A = w / 2, B = d / 2, p = (x, y, hh) => iso(a + x, b + y, z + hh);
  return `<polygon points="${pts([p(-A, B, h), p(A, B, h), p(A, B, 0), p(-A, B, 0)])}" ${S(col.l)}/>`
    + `<polygon points="${pts([p(A, -B, h), p(A, B, h), p(A, B, 0), p(A, -B, 0)])}" ${S(col.r)}/>`
    + `<polygon points="${pts([p(-A, -B, h), p(A, -B, h), p(A, B, h), p(-A, B, h)])}" ${S(col.t)}/>`;
}
const onRight = (a1, a2, h1, h2) => pts([iso(a1, -RR + 1, h1), iso(a2, -RR + 1, h1), iso(a2, -RR + 1, h2), iso(a1, -RR + 1, h2)]);
const onLeft = (b1, b2, h1, h2) => pts([iso(-RR + 1, b1, h1), iso(-RR + 1, b2, h1), iso(-RR + 1, b2, h2), iso(-RR + 1, b1, h2)]);
const textRight = (a, h, t, size = 11, fill = LINE, weight = 700) => { const [x, y] = iso(a, -RR + 1, h); return `<text transform="matrix(0.866 0.5 0 1 ${x.toFixed(1)} ${y.toFixed(1)})" font-size="${size}" font-weight="${weight}" fill="${fill}" font-family="Pretendard Variable, Pretendard, sans-serif">${t}</text>`; };
const textLeft = (b, h, t, size = 10, fill = LINE) => { const [x, y] = iso(-RR + 1, b, h); return `<text transform="matrix(0.866 -0.5 0 1 ${x.toFixed(1)} ${y.toFixed(1)})" font-size="${size}" font-weight="700" fill="${fill}" font-family="Pretendard Variable, Pretendard, sans-serif">${t}</text>`; };
const escT = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function room(s) {
  const th = THEMES[s.decor?.wall] ?? THEMES.sage;
  let out = `<polygon points="${pts([iso(-RR, -RR), iso(RR, -RR), iso(RR, RR), iso(-RR, RR)])}" ${S(th.floor)}/>`;
  for (let i = -RR + 30; i < RR; i += 30) {
    const [x1, y1] = iso(i, -RR), [x2, y2] = iso(i, RR);
    out += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${th.floorLine}" stroke-width="1"/>`;
  }
  out += `<polygon points="${pts([iso(-RR, RR), iso(-RR, -RR), iso(-RR, -RR, WALL), iso(-RR, RR, WALL)])}" ${S(th.wallL)}/>`;
  out += `<polygon points="${pts([iso(-RR, -RR), iso(RR, -RR), iso(RR, -RR, WALL), iso(-RR, -RR, WALL)])}" ${S(th.wallR)}/>`;
  if (s.decor?.rug !== false) out += `<polygon points="${pts([iso(-110, -175), iso(-10, -175), iso(-10, -95), iso(-110, -95)])}" fill="#C9D8CC" stroke="${LINE}" stroke-width=".8" opacity=".85"/>`;
  return out;
}

function wallItems(s) {
  let out = '';
  // 화이트보드 — 이번 회차 7단계 진행
  out += `<polygon points="${onRight(-215, -125, 38, 100)}" ${S('#FFFFFF')}/>`;
  out += textRight(-208, 90, escT(s.cycleLabel ?? '이번 주'), 9);
  (s.flow ?? []).forEach((st, i) => {
    const [x, y] = iso(-208 + i * 11.5, -RR + 1, 62);
    const c = st.state === 'done' ? '#476A58' : st.state === 'active' ? '#3E6A8A' : st.state === 'me' ? '#C9A23C' : st.state === 'issue' ? '#B8613E' : st.state === 'quota' ? '#7A5A78' : st.state === 'asked' ? '#B7791F' : st.state === 'asleep' ? '#3B3560' : '#D6D2C4';
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.6" fill="${c}" stroke="${LINE}" stroke-width=".6"/>`;
  });
  // 회사 간판
  out += `<polygon points="${onRight(-100, -10, 72, 98)}" ${S('#476A58')}/>` + textRight(-94, 80, escT(s.brand ?? ''), 10, '#F1EEE4');
  // 창문 — 매니저 자리 뒤. AI가 켜져 있으면 불이 들어온다
  out += `<polygon points="${onRight(35, 175, 38, 104)}" ${S(s.aiOn ? '#CFE3EC' : '#B8C2C6')}/>`;
  out += `<polygon points="${onRight(103, 107, 38, 104)}" fill="${LINE}" opacity=".5"/>`;
  // 책장(바닥) — 회사 지식 수만큼 책
  out += box(-RR + 16, -160, 30, 80, 96, { t: '#E4D2B2', l: '#CDB088', r: '#BE9F75' });
  const books = Math.min(s.books ?? 0, 18);
  const onA = (a, b1, b2, h1, h2) => pts([iso(a, b1, h1), iso(a, b2, h1), iso(a, b2, h2), iso(a, b1, h2)]);
  for (const h of [32, 62]) out += `<polygon points="${onA(-RR + 31.5, -199, -121, h, h + 2)}" fill="#BE9F75" stroke="${LINE}" stroke-width=".5"/>`;
  for (let i = 0; i < books; i++) {
    const shelf = Math.floor(i / 6), k = i % 6, b0 = -197 + k * 12.5, h0 = 6 + shelf * 30;
    out += `<polygon points="${onA(-RR + 31.5, b0, b0 + 9, h0, h0 + 22)}" fill="${['#476A58', '#C9785B', '#3E6A8A', '#C9A23C', '#7A5A78'][i % 5]}" stroke="${LINE}" stroke-width=".5"/>`;
  }
  // 트로피 선반 — 실제 마일스톤만
  out += `<polygon points="${onLeft(-90, -10, 60, 64)}" ${S('#D6BC92')}/>`;
  for (let i = 0; i < Math.min(s.trophies ?? 0, 5); i++) {
    const [x, y] = iso(-RR + 2, -82 + i * 15, 64);
    out += `<path d="M${(x - 4).toFixed(1)} ${(y - 12).toFixed(1)} h8 l-1.5 6 h-5 z M${(x - 1.5).toFixed(1)} ${(y - 6).toFixed(1)} h3 v4 h-3 z M${(x - 3).toFixed(1)} ${(y - 2).toFixed(1)} h6 v2 h-6 z" fill="#E0B44A" stroke="${LINE}" stroke-width=".6"/>`;
  }
  // 우편함 — 결정 대기면 깃발
  out += `<polygon points="${onLeft(40, 72, 42, 66)}" ${S('#C9785B')}/>` + textLeft(70, 50, '우편', 8, '#FFF');
  if (s.mail) {
    const [x, y] = iso(-RR + 2, 38, 66);
    out += `<path d="M${x.toFixed(1)} ${y.toFixed(1)} v-16 h10 l-3 4 l3 4 h-10" fill="#B8613E" stroke="${LINE}" stroke-width=".8"/>`;
  }
  // 전력 패널 — AI 연결
  out += `<polygon points="${onLeft(125, 160, 44, 84)}" ${S('#3A423E')}/>`;
  const [lx, ly] = iso(-RR + 2, 142, 70);
  out += `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="5" fill="${s.aiOn ? '#9BD3A8' : '#8A8F94'}" stroke="${LINE}" stroke-width=".8"/>`;
  out += textLeft(158, 50, s.aiOn ? 'AI ON' : 'AI OFF', 7, '#E9E6DC');
  return out;
}

/** 사무실 전체 SVG 문자열. 직원 원점 좌표는 anchors로 돌려준다(이름표·카드 위치). */
export function officeSVG(s) {
  const items = [];
  const anchors = {};
  // 회의 테이블·소파·화분
  items.push([-260, box(-60, -135, 46, 46, 22, { t: '#F1E9DA', l: '#DCCDB2', r: '#CFBE9F' })]);
  items.push([0, box(-175, 160, 70, 30, 18, { t: '#6E9478', l: '#476A58', r: '#3E5E4E' }) + box(-175, 177, 70, 6, 34, { t: '#6E9478', l: '#476A58', r: '#3E5E4E' })]);
  if (s.decor?.plants !== false) {
    for (const [a, b] of [[-200, -205], [205, -200], [200, 190]]) {
      const [x, y] = iso(a, b, 0);
      items.push([a + b, `<path d="M${x - 9} ${y} h18 l-2 -14 h-14 z" ${S('#C9785B')}/><path d="M${x} ${y - 14} C${x - 16} ${y - 30} ${x - 6} ${y - 44} ${x} ${y - 30} C${x + 6} ${y - 46} ${x + 16} ${y - 30} ${x} ${y - 14}" ${S('#6E9A72')}/>`]);
    }
  }
  // 책상 — 채용된 역할은 진짜 책상, 아직이면 점선 빈 자리
  for (const role of ['manager', 'researcher', 'writer', 'designer']) {
    const [a, b] = DESKS[role];
    const e = s.employees.find((x) => x.role === role);
    if (!e) {
      if (!s.showEmpty) continue;
      const g = pts([iso(a - 31, b - 17), iso(a + 31, b - 17), iso(a + 31, b + 17), iso(a - 31, b + 17)]);
      items.push([a + b, `<polygon points="${g}" fill="none" stroke="#9AA09C" stroke-width="1.2" stroke-dasharray="5 4"/>`]);
      continue;
    }
    const promoted = e.promoted;
    const w = promoted ? 74 : 62;
    const walking = s.walkers?.find((x) => x.id === e.id);
    // 의자 + 앉은 직원(책상 뒤, 대표 쪽을 봄)
    const [cx, cy] = iso(a, b - SEAT_BACK, 22);
    items.push([a + b - SEAT_BACK - 1, box(a, b - SEAT_BACK - 6, 22, 8, 40, { t: '#4A524E', l: '#3A423E', r: '#2F3632' })]);
    if (!walking) {
      items.push([a + b - SEAT_BACK, `<g data-emp="${e.id}" class="emp${s.selectedId === e.id ? ' sel' : ''}" style="cursor:pointer">${charSVG(e.look, e.pose, { x: cx, y: cy, seated: true, bubble: e.bubble })}</g>`]);
    }
    anchors[e.id] = walking ? { x: walking.x, y: walking.y - 92 } : { x: cx, y: cy - 70 };
    // 책상 + 모니터 뒷면 + 명패
    let desk = box(a, b, w, 34, 26, WOOD);
    const [mx, my] = iso(a, b - 8, 26);
    desk += `<rect x="${mx - 15}" y="${my - 22}" width="30" height="20" rx="2" ${S('#3A423E')}/>`;
    if (e.status === 'working' || e.status === 'reviewing') desk += `<rect x="${mx - 12}" y="${my - 19}" width="24" height="3" fill="#9BD3A8" opacity=".9"><animate attributeName="opacity" values=".9;.3;.9" dur="1.6s" repeatCount="indefinite"/></rect>`;
    const [nx, ny] = iso(a + 6, b + 17, 14);
    desk += `<rect x="${nx - 13}" y="${ny - 5}" width="26" height="9" rx="1.5" fill="${promoted ? '#E0B44A' : '#FBFAF6'}" stroke="${LINE}" stroke-width=".7"/><text x="${nx}" y="${ny + 2}" text-anchor="middle" font-size="6.5" font-weight="700" fill="${LINE}" font-family="Pretendard Variable, Pretendard, sans-serif">${escT(e.name)}</text>`;
    if (promoted) { const [px, py] = iso(a + 26, b - 10, 26); desk += `<path d="M${px - 4} ${py} h8 l-1 -7 h-6 z" ${S('#C9785B')}/><circle cx="${px}" cy="${py - 11}" r="5" ${S('#6E9A72')}/>`; }
    items.push([a + b, desk]);
  }
  // 걷는 직원(인계 전달 — 실제 수락 이벤트로만 재생)
  for (const w of s.walkers ?? []) {
    const e = s.employees.find((x) => x.id === w.id);
    if (e) items.push([w.depth ?? 0, `<g data-emp="${e.id}" class="emp">${charSVG(e.look, 'carry', { x: w.x, y: w.y, flip: w.flip })}</g>`]);
  }
  items.sort((p, q) => p[0] - q[0]);
  const svg = room(s) + wallItems(s) + items.map((x) => x[1]).join('');
  return { svg, anchors };
}

/** 의자 앞(서 있는 위치) 화면 좌표 — 인계 걷기 경로용 */
export function standPoint(role) {
  const [a, b] = DESKS[role] ?? [0, 0];
  const [x, y] = iso(a - 40, b + 30, 0);
  return { x, y, depth: a + b + 10 };
}
