// 이용약관 · 개인정보 처리방침 — 자리만(정식 문안은 전문가 검토 뒤, 결정 74)
import { html } from '../lib.js';
import { BRAND, Footer, Header } from './common.js';

const Draft = () => html`<div class="draft">초안이에요 — 정식 문안은 전문가 검토 뒤에 바뀌어요. 서비스 이름(${BRAND})은 가칭이에요.</div>`;

export function Terms({ me }) {
  return html`<div class="site"><${Header} me=${me} /><article class="doc"><h1>이용약관</h1><${Draft} />
    <h2>1. 서비스</h2><p>${BRAND}는 대표님이 설명한 사업에 맞춰 AI 직원 팀이 조사 · 계획 · 준비 같은 일을 나눠 맡고, 대표님이 확인 · 결정하는 서비스예요.</p>
    <h2>2. 대표님의 확인</h2><p>게시 · 발송 · 결제처럼 밖으로 나가는 일은 대표님이 확인한 뒤에만 실행돼요. AI가 만든 결과물은 초안이며, 법 · 세무 · 인허가 등 전문 영역은 전문가 확인이 필요해요.</p>
    <h2>3. AI 사용</h2><p>AI는 대표님이 연결한 AI 계정(예: 대표님의 Claude 구독)으로 동작하고, 그 사용량은 해당 AI 제공사의 약관과 한도를 따라요.</p>
    <h2>4. 계정과 데이터</h2><p>계정과 사무실 데이터는 대표님 것이며 언제든 내보내거나 지울 수 있어요.</p>
    <h2>5. 변경</h2><p>약관이 바뀌면 적용 전에 알려 드려요.</p></article><${Footer} /></div>`;
}

export function Privacy({ me }) {
  return html`<div class="site"><${Header} me=${me} /><article class="doc"><h1>개인정보 처리방침</h1><${Draft} />
    <h2>모으는 것</h2><ul><li>계정: 이메일 · 이름(선택) · 비밀번호(복원할 수 없는 형태로만 저장)</li><li>Google로 가입하면 Google이 알려 주는 이메일 · 이름</li><li>사무실 데이터: 대표님이 입력한 사업 설명 · 결과물 · 기록</li><li>대표님이 들인 시간: 화면 영역별 초(무엇을 봤는지는 저장하지 않음)</li></ul>
    <h2>쓰는 곳</h2><p>로그인 · 서비스 제공 · 대표님 사무실 기록에만 써요. 광고에 쓰거나 팔지 않아요.</p>
    <h2>AI 제공사로 가는 것</h2><p>업무를 처리하려고 필요한 내용(사업 설명 · 업무 자료)을 대표님이 연결한 AI로 보내요.</p>
    <h2>보관과 삭제</h2><p>탈퇴하면 계정과 사무실 데이터를 지워요. 그 전에 내보내기로 받아 둘 수 있어요.</p></article><${Footer} /></div>`;
}
