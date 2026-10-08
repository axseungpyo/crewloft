import type { EmployeeStyle, ToneForm } from './types.ts';

// 조사 — 마지막 글자의 받침 유무로 고른다. 한글이 아니면 받침 없음으로 본다.
function hasBatchim(word: string): boolean {
  const code = word.charCodeAt(word.length - 1);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 > 0;
}

export const iga = (w: string): string => w + (hasBatchim(w) ? '이' : '가');
export const eunneun = (w: string): string => w + (hasBatchim(w) ? '은' : '는');
export const eulreul = (w: string): string => w + (hasBatchim(w) ? '을' : '를');
export const wagwa = (w: string): string => w + (hasBatchim(w) ? '과' : '와');

export type Lines = Record<ToneForm, string>;

/** 직원이 설정된 말투로 말한다(결정 55: 말투는 나에게 말할 때의 톤). */
export function say(who: { style: EmployeeStyle }, lines: Lines): string {
  const text = lines[who.style.tone.form];
  return who.style.tone.emoji ? `${text} 🙂` : text;
}

export function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
