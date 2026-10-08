// 캔버스로 그리는 텍스처 — 외부 이미지 없이 마루·화면·글자·그라데이션을 만든다
import * as THREE from 'three';

export const rng = (seed = 1) => { let s = (seed >>> 0) || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };

export function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

export function tex(c, { srgb = true, repeat = null, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

export function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }

/** 캔버스에 한글을 그리기 전에 글꼴(필요한 글자 조각)을 받아 둔다 */
export async function fonts(list, sample = '가나다라마바사 ABC 0123') {
  const all = Promise.all(list.map((f) => document.fonts.load(f, sample).catch(() => null)));
  await Promise.race([all, new Promise((r) => setTimeout(r, 3000))]);
}

/** 판재 마루 — 줄마다 길이가 다른 판, 결, 이음선 */
export function planks({ base = '#C8A47A', vary = 0.07, rows = 8, grain = 0.14, seam = 'rgba(40,25,10,.35)', w = 1024, h = 1024, seed = 7 } = {}) {
  const r = rng(seed), C = new THREE.Color();
  return canvas(w, h, (g) => {
    const ph = h / rows;
    for (let i = 0; i < rows; i++) {
      let x = -r() * w * 0.6;
      while (x < w) {
        const len = w * (0.3 + r() * 0.45);
        C.set(base).offsetHSL((r() - 0.5) * 0.012, (r() - 0.5) * vary * 0.6, (r() - 0.5) * vary);
        g.fillStyle = `#${C.getHexString()}`; g.fillRect(x, i * ph, len, ph);
        for (let k = 0; k < 7; k++) {
          g.strokeStyle = `rgba(70,45,20,${grain * (0.3 + r() * 0.7)})`; g.lineWidth = 0.6 + r() * 1.2;
          const yy = i * ph + r() * ph, amp = ph * (0.03 + r() * 0.05), fr = 0.6 + r() * 1.5;
          g.beginPath();
          for (let s = 0; s <= 24; s++) { const xx = x + (len * s) / 24, y2 = yy + Math.sin(s * 0.35 * fr + k) * amp; if (s) g.lineTo(xx, y2); else g.moveTo(xx, y2); }
          g.stroke();
        }
        g.fillStyle = seam; g.fillRect(Math.round(x + len) - 1, i * ph, 2, ph);
        x += len;
      }
      g.fillStyle = seam; g.fillRect(0, Math.round(i * ph), w, 2);
    }
  });
}

/** 잔 얼룩·입자 — 회벽·콘크리트·펠트 */
export function speckle({ base = '#EEE', dots = 9000, alpha = 0.05, dark = '#000', light = '#FFF', size = 512, seed = 11, blot = 0 } = {}) {
  const r = rng(seed);
  return canvas(size, size, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, size, size);
    for (let i = 0; i < blot; i++) { const x = r() * size, y = r() * size, rad = 30 + r() * 90; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(0,0,0,${alpha * 0.6})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    for (let i = 0; i < dots; i++) { g.fillStyle = r() < 0.5 ? dark : light; g.globalAlpha = alpha * r(); g.fillRect(r() * size, r() * size, 1 + r() * 1.5, 1 + r() * 1.5); }
    g.globalAlpha = 1;
  });
}

/** 대리석 — 흰 바탕에 흐린 결 */
export function marble({ base = '#F2F0EC', vein = 'rgba(120,118,112,.35)', size = 1024, seed = 4 } = {}) {
  const r = rng(seed);
  return canvas(size, size, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, size, size);
    g.filter = 'blur(1.4px)';
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = vein; g.lineWidth = 0.6 + r() * 2.4; g.globalAlpha = 0.25 + r() * 0.6;
      let x = r() * size, y = 0; g.beginPath(); g.moveTo(x, y);
      while (y < size) { x += (r() - 0.45) * 60; y += 20 + r() * 50; g.lineTo(x, y); }
      g.stroke();
    }
    g.filter = 'none'; g.globalAlpha = 1;
  });
}

export function gradient(stops, { w = 8, h = 512, angle = 'v' } = {}) {
  return canvas(angle === 'v' ? w : h, angle === 'v' ? h : w, (g, cw, ch) => {
    const gr = angle === 'v' ? g.createLinearGradient(0, 0, 0, ch) : g.createLinearGradient(0, 0, cw, 0);
    for (const [p, c] of stops) gr.addColorStop(p, c);
    g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
  });
}

export function radial(stops, { size = 1024, cx = 0.5, cy = 0.45, r = 0.75 } = {}) {
  return canvas(size, size, (g) => {
    const gr = g.createRadialGradient(size * cx, size * cy, 0, size * cx, size * cy, size * r);
    for (const [p, c] of stops) gr.addColorStop(p, c);
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
  });
}

/** 글자 한 줄 → 캔버스 (폭은 글자 길이에 맞춤) */
export function textCanvas(text, { font = '600 56px "Pretendard Variable"', color = '#111', bg = null, pad = 28, h = 110, r = 0, border = null, minW = 0, lw = 4 } = {}) {
  const m = document.createElement('canvas').getContext('2d');
  m.font = font;
  const w = Math.max(minW, Math.ceil(m.measureText(text).width) + pad * 2);
  return canvas(w, h, (g) => {
    if (bg) { g.fillStyle = bg; rrect(g, 0, 0, w, h, r); g.fill(); }
    if (border) { g.strokeStyle = border; g.lineWidth = lw; rrect(g, lw / 2, lw / 2, w - lw, h - lw, r); g.stroke(); }
    g.font = font; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + h * 0.04);
  });
}

/** 모니터 화면 — 사이드바 + 본문 줄 + 썸네일 칸 */
export function screenCanvas({ bg = '#F4F4F2', side = '#E6E6E1', ink = '#8E8E88', accent = '#2F6F5E', swatches = [ink, side, accent, bg, ink], seed = 1, kind = 'doc' } = {}) {
  const r = rng(seed);
  return canvas(512, 320, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = side; g.fillRect(0, 0, 92, h);
    for (let i = 0; i < 7; i++) { g.globalAlpha = i === 1 ? 0.95 : 0.35; g.fillStyle = i === 1 ? accent : ink; g.fillRect(16, 24 + i * 28, 58, 9); }
    g.globalAlpha = 0.75; g.fillStyle = ink; g.fillRect(118, 26, 210, 16);
    if (kind === 'design') {
      g.globalAlpha = 0.9; g.fillStyle = accent; g.fillRect(118, 60, 250, 170);
      g.globalAlpha = 0.6; g.fillStyle = bg; g.beginPath(); g.arc(243, 145, 46, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 5; i++) { g.globalAlpha = 0.8; g.fillStyle = swatches[i % swatches.length]; g.fillRect(392, 60 + i * 34, 90, 24); }
    } else {
      g.globalAlpha = 0.28; g.fillStyle = ink;
      for (let i = 0; i < 10; i++) g.fillRect(118, 64 + i * 22, 180 + r() * 190, 7);
      g.globalAlpha = 0.85; g.fillStyle = accent; g.fillRect(118 + 250 + r() * 20, 64, 2, 16);
    }
    g.globalAlpha = 1;
  });
}
