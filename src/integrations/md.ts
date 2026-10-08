// 마크다운 → HTML / Notion 블록. 결과물은 제목·목록·인용·문단·굵게·링크 정도만 쓰므로 그 범위만 다룬다.

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const inlineHtml = (s: string): string => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');

export function mdToHtml(md: string): string {
  const out: string[] = [];
  let list: string[] | null = null;
  const flush = (): void => { if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; } };
  for (const line of md.split('\n')) {
    let m: RegExpExecArray | null;
    if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) { flush(); const n = Math.min(6, m[1]!.length + 1); out.push(`<h${n}>${inlineHtml(m[2]!)}</h${n}>`); }
    else if ((m = /^\s*(?:[-*•]|\d+\.)\s+(.*)$/.exec(line))) { (list ??= []).push(`<li>${inlineHtml(m[1]!)}</li>`); }
    else if ((m = /^>\s?(.*)$/.exec(line))) { flush(); out.push(`<blockquote>${inlineHtml(m[1]!)}</blockquote>`); }
    else if (!line.trim()) flush();
    else { flush(); out.push(`<p>${inlineHtml(line)}</p>`); }
  }
  flush();
  return out.join('\n');
}

/** 링크·굵게를 살린 Notion rich_text (텍스트 조각은 2000자 제한) */
function richText(s: string): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const push = (content: string, extra: Record<string, unknown> = {}): void => {
    for (let i = 0; i < content.length; i += 1900) parts.push({ type: 'text', text: { content: content.slice(i, i + 1900), ...(extra.link ? { link: extra.link } : {}) }, ...(extra.bold ? { annotations: { bold: true } } : {}) });
  };
  while ((m = re.exec(s))) {
    if (m.index > last) push(s.slice(last, m.index));
    if (m[1]) push(m[1], { bold: true });
    else push(m[2]!, { link: { url: m[3] } });
    last = m.index + m[0].length;
  }
  if (last < s.length) push(s.slice(last));
  return parts.length ? parts : [{ type: 'text', text: { content: '' } }];
}

export function mdToNotionBlocks(md: string): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [];
  const block = (type: string, text: string): Record<string, unknown> => ({ object: 'block', type, [type]: { rich_text: richText(text) } });
  for (const line of md.split('\n')) {
    let m: RegExpExecArray | null;
    if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) blocks.push(block(m[1]!.length <= 1 ? 'heading_1' : m[1]!.length === 2 ? 'heading_2' : 'heading_3', m[2]!));
    else if ((m = /^\s*(?:[-*•])\s+(.*)$/.exec(line))) blocks.push(block('bulleted_list_item', m[1]!));
    else if ((m = /^\s*\d+\.\s+(.*)$/.exec(line))) blocks.push(block('numbered_list_item', m[1]!));
    else if ((m = /^>\s?(.*)$/.exec(line))) blocks.push(block('quote', m[1]!));
    else if (line.trim()) blocks.push(block('paragraph', line));
  }
  return blocks.slice(0, 100);
}

/** LinkedIn 'little text' 형식 — 특수문자를 이스케이프하지 않으면 게시가 거부되거나 잘린다 */
export function littleText(s: string): string {
  return s.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`);
}

/** 마크다운 기호를 걷어낸 평문(SNS용) */
export function plain(md: string): string {
  return md.split('\n').map((l) => l.replace(/^#{1,4}\s+/, '').replace(/^\s*[-*•]\s+/, '• ').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 $2')).join('\n').trim();
}
