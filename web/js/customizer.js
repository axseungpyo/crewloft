// 직원 다듬기(결정 55) — 외형·이름 / 말투 / 성향 / 보고 스타일. 바꾸는 즉시 "이렇게 말해요"가 바뀐다.
import { Figure } from './art.js';
import { html, useState } from './lib.js';

export const HAIRS = [['short', '짧은 머리'], ['long', '긴 머리'], ['bun', '올림머리'], ['curly', '곱슬'], ['pony', '묶음'], ['bob', '단발']];
export const HAIR_COLORS = ['#2B1D17', '#3A2A22', '#6B4A2F', '#A0704A', '#1E1E1E', '#8A8F94'];
export const SKINS = ['#F2D3B8', '#E5BE9C', '#C9946B'];
export const OUTFITS = ['#476A58', '#3E6A8A', '#C9785B', '#7A5A78', '#E9DCC6', '#A8772A'];
export const ACCS = [['none', '없음'], ['glasses', '안경'], ['phones', '헤드폰'], ['earring', '귀걸이']];
const TRAITS = [['bold', '신중', '과감'], ['speed', '꼼꼼', '빠름'], ['data', '직관', '데이터'], ['propose', '질문 먼저', '제안 먼저']];

export function defaultStyle(traits) {
  return { tone: { form: 'haeyo', emoji: false }, traits: { bold: 50, speed: 50, data: 50, propose: 50, ...(traits ?? {}) }, report: { detail: 'summary', freq: 'decide', ask: 'mid' } };
}

/** 말투 예시 — 설정이 실제로 어떻게 들리는지(결과물 문체는 브랜드 톤을 따름) */
export function speak(st) {
  const f = st.tone.form;
  const end = (a, b, c) => (f === 'haeyo' ? a : f === 'hamnida' ? b : c);
  let s = f === 'banmal' ? '' : '대표님, ';
  s += st.traits.data >= 60 ? end('지난주 숫자를 보면 ', '지난주 수치를 보면 ', '지난주 숫자 보니까 ') : end('느낌상 ', '직관적으로 보면 ', '내 느낌엔 ');
  s += st.traits.bold >= 60 ? end('이번 주는 새 형식을 하나 과감하게 해봐요.', '이번 주는 새 형식을 과감하게 시도하겠습니다.', '이번 주는 새 형식 하나 과감하게 해보자.') : end('이번 주는 검증된 주제부터 차근차근 가요.', '이번 주는 검증된 주제부터 진행하겠습니다.', '이번 주는 검증된 주제부터 차근차근 가자.');
  if (st.report.detail === 'detail') s += ` ${end('근거는 지난주 채택률이고, 다음은 주제 3개 확정이에요.', '근거는 지난주 채택률이며, 다음 단계는 주제 3개 확정입니다.', '근거는 지난주 채택률이고, 다음은 주제 3개 확정이야.')}`;
  s += ` ${st.traits.propose >= 55 ? end('제가 초안부터 만들어 둘게요.', '제가 초안부터 준비하겠습니다.', '내가 초안부터 만들어 둘게.') : end('어떤 쪽이 좋으세요?', '어느 쪽이 좋으십니까?', '어느 쪽이 좋아?')}`;
  return st.tone.emoji ? `${s} 🙂` : s;
}

const Opt = ({ on, onClick, children }) => html`<button type="button" class=${`chip-opt${on ? ' on' : ''}`} onClick=${onClick}>${children}</button>`;
const Swatch = ({ color, on, onClick }) => html`<button type="button" class=${`swatch${on ? ' on' : ''}`} style=${`background:${color}`} onClick=${onClick} aria-label=${color}></button>`;

/** value: { name, look, style } · onChange(next) */
export function Customizer({ value, onChange, subtitle }) {
  const [tab, setTab] = useState('look');
  const { name, look, style } = value;
  const setLook = (k, v) => onChange({ ...value, look: { ...look, [k]: v } });
  const setStyle = (path, v) => {
    const next = structuredClone(style);
    const [a, b] = path.split('.');
    next[a][b] = v;
    onChange({ ...value, style: next });
  };
  return html`<div class="cust">
    <div class="cust-prev">
      <div class="fig"><${Figure} look=${look} /></div>
      <div class="cust-name">${name || '이름'}</div>
      ${subtitle && html`<div class="muted">${subtitle}</div>`}
      <div class="say"><small>${name || '직원'}의 말투 예시</small>${speak(style)}</div>
    </div>
    <div class="cust-ctl">
      <div class="tabs">${[['look', '외형·이름'], ['tone', '말투'], ['traits', '성향'], ['report', '보고 스타일']].map(([k, l]) => html`<button type="button" class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}>${l}</button>`)}</div>
      ${tab === 'look' && html`<div class="stack">
        <label class="f">이름<input class="in" maxlength="12" value=${name} onInput=${(e) => onChange({ ...value, name: e.target.value })}/></label>
        <div><h3>머리 모양</h3><div class="row">${HAIRS.map(([k, l]) => html`<${Opt} on=${look.hair === k} onClick=${() => setLook('hair', k)}>${l}<//>`)}</div></div>
        <div><h3>머리 색</h3><div class="row">${HAIR_COLORS.map((c) => html`<${Swatch} color=${c} on=${look.hairColor === c} onClick=${() => setLook('hairColor', c)} />`)}</div></div>
        <div><h3>피부</h3><div class="row">${SKINS.map((c) => html`<${Swatch} color=${c} on=${look.skin === c} onClick=${() => setLook('skin', c)} />`)}</div></div>
        <div><h3>옷 색</h3><div class="row">${OUTFITS.map((c) => html`<${Swatch} color=${c} on=${look.outfit === c} onClick=${() => setLook('outfit', c)} />`)}</div></div>
        <div><h3>소품</h3><div class="row">${ACCS.map(([k, l]) => html`<${Opt} on=${look.acc === k} onClick=${() => setLook('acc', k)}>${l}<//>`)}</div></div>
      </div>`}
      ${tab === 'tone' && html`<div class="stack">
        <div><h3>나에게 말할 때</h3><div class="row">${[['haeyo', '해요체'], ['hamnida', '합니다체'], ['banmal', '편한 반말']].map(([k, l]) => html`<${Opt} on=${style.tone.form === k} onClick=${() => setStyle('tone.form', k)}>${l}<//>`)}</div></div>
        <div><h3>이모지</h3><div class="row"><${Opt} on=${!style.tone.emoji} onClick=${() => setStyle('tone.emoji', false)}>안 써요<//><${Opt} on=${style.tone.emoji} onClick=${() => setStyle('tone.emoji', true)}>가끔 써요<//></div></div>
        <p class="note">결과물(블로그·SNS) 문체는 직원 말투가 아니라 회사의 브랜드 톤을 따라요.</p>
      </div>`}
      ${tab === 'traits' && html`<div class="stack">
        ${TRAITS.map(([k, a, b]) => html`<div class="slider"><span>${a}</span><input type="range" min="0" max="100" step="5" value=${style.traits[k]} onInput=${(e) => setStyle(`traits.${k}`, Number(e.target.value))}/><span>${b}</span></div>`)}
        <p class="honest">성향은 <b>일하는 방식 설정</b>이에요 — 실력 수치가 아니에요. 숙련도와 능력치는 실제로 일한 기록으로만 자라요.</p>
      </div>`}
      ${tab === 'report' && html`<div class="stack">
        <div><h3>보고 길이</h3><div class="row"><${Opt} on=${style.report.detail === 'summary'} onClick=${() => setStyle('report.detail', 'summary')}>한 줄 요약<//><${Opt} on=${style.report.detail === 'detail'} onClick=${() => setStyle('report.detail', 'detail')}>근거·다음 단계까지<//></div></div>
        <div><h3>보고 빈도</h3><div class="row">${[['decide', '결정이 필요할 때만'], ['daily', '하루 1번'], ['cycle', '한 주 끝에']].map(([k, l]) => html`<${Opt} on=${style.report.freq === k} onClick=${() => setStyle('report.freq', k)}>${l}<//>`)}</div></div>
        <div><h3>확인 질문</h3><div class="row">${[['low', '적게 — 알아서'], ['mid', '보통'], ['high', '자주 — 확인하며']].map(([k, l]) => html`<${Opt} on=${style.report.ask === k} onClick=${() => setStyle('report.ask', k)}>${l}<//>`)}</div></div>
        <p class="note">확인 질문을 적게 해도 외부 게시·발송·결제·추가 고용은 항상 대표 확인을 받아요.</p>
      </div>`}
    </div>
  </div>`;
}
