// A 계열 2D 그림(결정 14·15) — 가는 외곽선·평면 채색·살짝 셀 음영, 성인 치비(약 3등신).
// 최종 일러스트 자산 전까지 쓰는 코드 그림이며, 모든 모션은 실제 이벤트에서만 나온다.
import { html, useEffect, useState } from './lib.js';

const LINE = '#2B302D';
const LW = 1.15;
const f = (n) => Math.round(n * 10) / 10;
const P = (fill, w = LW) => `fill="${fill}" stroke="${LINE}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  return `#${((1 << 24) | (c(n >> 16) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).slice(1)}`;
};

// 키 74px 기준, 머리 = 1/3
const H = 74, R = H / 6, LEG = (H - R * 2) * 0.44, TORSO = H - R * 2 - LEG, TW = R * 1.45, AW = TW * 0.28, AL = TORSO * 0.82;

function hairBack(L) {
  const p = P(L.hairColor);
  if (L.hair === 'long') return `<path d="M${-R * 1.08} ${-R * 0.3} Q${-R * 1.2} ${R * 1.5} ${-R * 0.6} ${R * 1.75} L${R * 0.6} ${R * 1.75} Q${R * 1.2} ${R * 1.5} ${R * 1.08} ${-R * 0.3} Z" ${p}/>`;
  if (L.hair === 'bob') return `<path d="M${-R * 1.1} ${-R * 0.2} Q${-R * 1.18} ${R * 0.95} ${-R * 0.7} ${R * 0.98} L${R * 0.7} ${R * 0.98} Q${R * 1.18} ${R * 0.95} ${R * 1.1} ${-R * 0.2} Z" ${p}/>`;
  if (L.hair === 'pony') return `<ellipse cx="${R * 1.05}" cy="${R * 0.35}" rx="${R * 0.34}" ry="${R * 0.8}" transform="rotate(-18 ${R * 1.05} ${R * 0.35})" ${p}/>`;
  if (L.hair === 'bun') return `<circle cx="0" cy="${-R * 1.12}" r="${R * 0.46}" ${p}/>`;
  return '';
}
function hairFront(L) {
  const p = P(L.hairColor);
  if (L.hair === 'curly') {
    let s = '';
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * (1.05 + i * 0.1125);
      s += `<circle cx="${f(Math.cos(a) * R * 0.92)}" cy="${f(Math.sin(a) * R * 0.92 - R * 0.05)}" r="${f(R * 0.36)}" ${p}/>`;
    }
    return s;
  }
  const fringe = L.hair === 'bob' ? `L${R * 1.02} ${-R * 0.05} L${-R * 1.02} ${-R * 0.05}` : `C${R * 0.65} ${-R * 0.62} ${-R * 0.05} ${-R * 0.7} ${-R * 1.02} ${-R * 0.02}`;
  return `<path d="M${-R * 1.02} ${-R * 0.02} C${-R * 1.08} ${-R * 1.42} ${R * 1.08} ${-R * 1.42} ${R * 1.02} ${-R * 0.02} ${fringe} Z" ${p}/>`;
}
function face(L, mood) {
  const ey = R * 0.14, ex = R * 0.38;
  let s = '';
  for (const sx of [-1, 1]) {
    const x = sx * ex;
    if (mood === 'rest' || mood === 'happy') s += `<path d="M${x - R * 0.13} ${ey} Q${x} ${ey + (mood === 'happy' ? -R * 0.12 : R * 0.1)} ${x + R * 0.13} ${ey}" fill="none" stroke="${LINE}" stroke-width="1.1" stroke-linecap="round"/>`;
    else s += `<circle cx="${x}" cy="${ey}" r="${f(R * 0.1)}" fill="${LINE}"/>`;
    const by = ey - R * 0.3, tilt = mood === 'warn' ? R * 0.08 * -sx : 0;
    s += `<path d="M${x - R * 0.14} ${by + tilt} L${x + R * 0.14} ${by - tilt}" stroke="${shade(L.hairColor, -0.2)}" stroke-width="1" stroke-linecap="round"/>`;
  }
  const my = R * 0.45;
  if (mood === 'happy') s += `<path d="M${-R * 0.16} ${my - R * 0.04} Q0 ${my + R * 0.22} ${R * 0.16} ${my - R * 0.04} Z" fill="#B4544A"/>`;
  else if (mood === 'warn') s += `<path d="M${-R * 0.13} ${my + R * 0.03} Q${-R * 0.05} ${my - R * 0.04} 0 ${my + R * 0.02} T${R * 0.13} ${my}" fill="none" stroke="${LINE}" stroke-width="1" stroke-linecap="round"/>`;
  else if (mood === 'rest') s += `<circle cx="0" cy="${my + R * 0.02}" r="${R * 0.06}" fill="${LINE}"/>`;
  else s += `<path d="M${-R * 0.13} ${my} Q0 ${my + R * 0.12} ${R * 0.13} ${my}" fill="none" stroke="${LINE}" stroke-width="1" stroke-linecap="round"/>`;
  return s;
}
function acc(L) {
  const ey = R * 0.14, ex = R * 0.38;
  if (L.acc === 'glasses') return [-1, 1].map((sx) => `<circle cx="${sx * ex}" cy="${ey}" r="${R * 0.22}" fill="rgba(255,255,255,.25)" stroke="${LINE}" stroke-width="1"/>`).join('') + `<path d="M${-ex + R * 0.22} ${ey} L${ex - R * 0.22} ${ey}" stroke="${LINE}"/>`;
  if (L.acc === 'phones') return `<path d="M${-R * 1.02} ${-R * 0.1} C${-R * 1.1} ${-R * 1.45} ${R * 1.1} ${-R * 1.45} ${R * 1.02} ${-R * 0.1}" fill="none" stroke="#3A423E" stroke-width="${f(R * 0.16)}" stroke-linecap="round"/>` + [-1, 1].map((sx) => `<rect x="${sx * R * 1.02 - R * 0.2}" y="${-R * 0.3}" width="${R * 0.4}" height="${R * 0.55}" rx="${R * 0.15}" ${P('#3A423E')}/>`).join('');
  if (L.acc === 'earring') return [-1, 1].map((sx) => `<circle cx="${sx * R * 0.98}" cy="${R * 0.42}" r="${f(R * 0.1)}" fill="#E0B44A" stroke="${LINE}" stroke-width=".6"/>`).join('');
  return '';
}
function arm(L, x, y, ang) {
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${ang})"><rect x="${f(-AW / 2)}" y="0" width="${f(AW)}" height="${f(AL)}" rx="${f(AW / 2)}" ${P(L.outfit)}/><circle cy="${f(AL)}" r="${f(AW * 0.55)}" ${P(L.skin)}/></g>`;
}

const POSES = {
  stand: { la: 8, ra: -8 }, sit: { la: 8, ra: -8 }, walk: { la: 22, ra: -22, legs: 1 },
  type: { la: -38, ra: 38 }, read: { la: -42, ra: 42, prop: 'paper' }, draw: { la: -40, ra: 40, prop: 'tablet' },
  carry: { la: -42, ra: 42, prop: 'paper', legs: 1 }, raise: { la: 8, ra: -165, bubble: '?' },
  rest: { la: 6, ra: -6, mood: 'rest', tilt: 10, bubble: 'z' }, warn: { la: 14, ra: -14, mood: 'warn', bubble: '!' },
  wait: { la: 8, ra: -8, bubble: '…' }, happy: { la: 150, ra: -150, mood: 'happy' },
};

/** 캐릭터 SVG 문자열. 원점 = 발(앉으면 엉덩이). */
export function charSVG(L, pose = 'stand', o = {}) {
  const p = POSES[pose] ?? POSES.stand;
  const seated = !!o.seated;
  const yHip = seated ? 0 : -LEG, yShoulder = yHip - TORSO, yHead = yShoulder - R * 0.9;
  let legs = '';
  if (!seated) {
    for (const sx of [-1, 1]) {
      const lw = TW * 0.34, ang = p.legs ? sx * -14 : 0;
      legs += `<g transform="translate(${f(sx * TW * 0.22)} ${f(yHip - 1)}) rotate(${ang})"><rect x="${f(-lw / 2)}" width="${f(lw)}" height="${f(LEG)}" rx="${f(lw * 0.4)}" ${P('#2F3A36')}/><ellipse cx="${sx * 1.5}" cy="${f(LEG)}" rx="${f(lw * 0.7)}" ry="${f(lw * 0.38)}" ${P('#3A2E2A')}/></g>`;
    }
  }
  const torso = `<rect x="${f(-TW / 2)}" y="${f(yShoulder)}" width="${f(TW)}" height="${f(TORSO + 2)}" rx="${f(TW * 0.34)}" ${P(L.outfit)}/>`
    + `<path d="M${f(TW * 0.12)} ${f(yShoulder + 3)} h${f(TW * 0.3)} v${f(TORSO - 4)} h${f(-TW * 0.3)} Z" fill="#000" opacity=".1"/>`
    + `<path d="M${f(-TW * 0.18)} ${f(yShoulder)} L0 ${f(yShoulder + TW * 0.3)} L${f(TW * 0.18)} ${f(yShoulder)}" fill="#F7F3EA" stroke="${LINE}" stroke-width=".9" stroke-linejoin="round"/>`;
  const neck = `<rect x="${f(-R * 0.22)}" y="${f(yHead + R * 0.75)}" width="${f(R * 0.44)}" height="${f(yShoulder - yHead - R * 0.75 + 2)}" fill="${L.skin}"/>`;
  const head = `<g transform="translate(0 ${f(yHead)}) rotate(${p.tilt ?? 0})">${hairBack(L)}${[-1, 1].map((sx) => `<circle cx="${f(sx * R * 0.97)}" cy="${f(R * 0.12)}" r="${f(R * 0.2)}" ${P(L.skin)}/>`).join('')}<circle r="${f(R)}" ${P(L.skin)}/>${face(L, p.mood)}${hairFront(L)}${acc(L)}</g>`;
  const sxL = -(TW / 2 - AW * 0.3), sxR = TW / 2 - AW * 0.3, sy = yShoulder + 2.5;
  const arms = arm(L, sxL, sy, p.la) + arm(L, sxR, sy, p.ra);
  let prop = '';
  if (p.prop === 'paper') prop = `<g transform="translate(0 ${f(yShoulder + TORSO * 0.42)}) rotate(-6)"><rect x="${f(-TW * 0.42)}" y="${f(-TW * 0.5)}" width="${f(TW * 0.84)}" height="${f(TW)}" rx="1.5" ${P('#FFFDF6', 0.9)}/><path d="M${f(-TW * 0.25)} ${f(-TW * 0.2)} h${f(TW * 0.5)} M${f(-TW * 0.25)} 0 h${f(TW * 0.5)} M${f(-TW * 0.25)} ${f(TW * 0.2)} h${f(TW * 0.32)}" stroke="#9AA09C"/></g>`;
  if (p.prop === 'tablet') prop = `<g transform="translate(0 ${f(yShoulder + TORSO * 0.45)})"><rect x="${f(-TW * 0.48)}" y="${f(-TW * 0.36)}" width="${f(TW * 0.96)}" height="${f(TW * 0.7)}" rx="2" ${P('#3A423E')}/><rect x="${f(-TW * 0.4)}" y="${f(-TW * 0.28)}" width="${f(TW * 0.8)}" height="${f(TW * 0.54)}" fill="#BFD3C6"/></g>`;
  const front = pose === 'raise' || pose === 'happy';
  const shadow = seated ? '' : `<ellipse rx="${f(TW * 0.85)}" ry="${f(TW * 0.25)}" fill="rgba(40,40,30,.16)"/>`;
  const bb = o.bubble === undefined ? p.bubble : o.bubble;
  const bubble = bb ? `<g transform="translate(${f(R * 1.1)} ${f(yHead - R * 1.6)})"><circle r="8" fill="#fff" stroke="${bb === '!' ? '#C4553A' : bb === '?' ? '#C9A23C' : '#7E8B95'}" stroke-width="1.4"/><text y="3.6" text-anchor="middle" font-size="10" font-weight="700" fill="${bb === '!' ? '#C4553A' : bb === '?' ? '#C9A23C' : '#7E8B95'}" font-family="Pretendard Variable, Pretendard, sans-serif">${bb}</text></g>` : '';
  const flip = o.flip ? ' scale(-1 1)' : '';
  return `<g transform="translate(${f(o.x ?? 0)} ${f(o.y ?? 0)}) scale(${o.scale ?? 1})"><g transform="scale(1 1)${flip}">${shadow}${legs}${torso}${neck}${front ? arms : ''}${head}${front ? '' : arms}${prop}</g>${bubble}</g>`;
}

/** 초상(상반신) — 카드·목록·말풍선 옆 */
/**
 * 초상 — role(직무)을 주면 사무실의 3D 전령을 찍은 그림(WebGL이 있을 때), 아니면 2D 사람 그림.
 * 3D는 처음 한 번 그릴 때까지 2D를 보여 주고 바꾼다.
 */
export function Portrait({ look, size = 40, pose = 'stand', ring, role, rank }) {
  const px = Math.round(size * Math.min(2, window.devicePixelRatio || 1));
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!role || !window.WebGL2RenderingContext) return undefined;
    let alive = true;
    import('./office3d/portrait.js').then((m) => {
      const hit = m.cachedPortrait(role, rank, px);
      if (hit) { setSrc(hit); return; }
      setTimeout(() => { if (!alive) return; try { setSrc(m.portraitURL(role, rank, px)); } catch (e) { console.warn('3D 초상을 못 그렸어요', e); } }, 0);
    }).catch(() => {});
    return () => { alive = false; };
  }, [role, rank, px]);
  if (src) return html`<img class="portrait p3d" src=${src} width=${size} height=${size} alt="" style=${ring ? `box-shadow:0 0 0 2px ${ring}` : ''} />`;
  const yHead = -LEG - TORSO - R * 0.9;
  const vb = `${f(-R * 1.7)} ${f(yHead - R * 1.55)} ${f(R * 3.4)} ${f(R * 3.4)}`;
  return html`<svg class="portrait" width=${size} height=${size} viewBox=${vb} style=${ring ? `box-shadow:0 0 0 2px ${ring}` : ''} aria-hidden="true"><g dangerouslySetInnerHTML=${{ __html: charSVG(look, pose) }}></g></svg>`;
}

/** 전신 그림 — 채용 다듬기 미리보기 */
export function Figure({ look, pose = 'stand', width = 180, height = 200 }) {
  return html`<svg width=${width} height=${height} viewBox="-32 -88 64 96" aria-hidden="true"><g dangerouslySetInnerHTML=${{ __html: charSVG(look, pose) }}></g></svg>`;
}
