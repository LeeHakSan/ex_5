# 인수인계 문서 (AI A → AI B)

> 이 문서 + 이 저장소만 보고 대화 없이 작업을 이어받을 수 있어야 합니다.
> 이전 대화 전문은 제공되지 않습니다. 모르는 게 있으면 이 문서와 코드만으로 판단하세요.

## 1. 목표
`ex_5` 저장소(USD 기준 환율 정보판, T04 앱 기반)에 **통화 선택 기능**을 추가하는 작업입니다.
사용자가 KRW/EUR/JPY/GBP 중 하나를 고르면, **현재값뿐 아니라 "날짜별 기록"과 "어제 대비 변화"도
그 통화 기준으로 정확히 동작해야 합니다.** 아직 "날짜별 기록/어제 대비 변화"는 KRW만 지원합니다 —
이 부분을 완성하는 것이 당신(AI B)의 목표입니다.

## 2. 현재 상태
- **기능(코드) 확정 버전**: `c4d0329` — 아래 "통과 검사" 8/10 결과는 이 커밋 기준입니다.
  이후 커밋(`92191d3`, 이 문서 갱신 커밋 등)은 문서/문구만 바꾼 것이라 기능은 동일합니다.
- 문서를 쓰는 시점과 커밋하는 시점이 다르기 때문에, 이 문서에 적힌 해시가 실제 `git log -1`
  결과와 **한두 커밋 정도 차이 날 수 있습니다** — 정상입니다. 진짜로 확인해야 할 것은
  "`c4d0329` 이후로 `index.html`/`app.js`/`styles.css`/`data/`/`scripts/`가 바뀌었는가"입니다.
  바뀌지 않았다면 이 문서 내용을 그대로 신뢰해도 됩니다. 바뀌었다면(예: 다른 사람이 먼저 손을
  댔다면) 이 문서가 낡은 것이니 `git log`와 `git diff c4d0329 HEAD`로 실제 차이부터 확인하세요.
- `index.html`, `app.js`, `styles.css`에 `#currency-select`(KRW/EUR/JPY/GBP) 드롭다운이 추가되어
  있고, 현재값 카드(값·단위·출처·두 시각·상태)는 4개 통화 모두에서 정상 동작합니다.
- `?fault=` 장애 재현(timeout/auth/ratelimit/offline/format)도 선택한 통화별로 독립적으로 동작합니다
  (`localStorage` 캐시 키가 통화별로 분리되어 있음: `t04-last-good-rate-<통화코드>`).
- **미완성 부분**: `data/history.json`에는 기존 T04 시절 KRW 기록 3건(`2026-08-24/25/26`)만 있고,
  각 레코드에 `currency` 필드가 없습니다(`app.js`는 필드가 없으면 KRW로 취급). EUR/JPY/GBP를
  선택하면 "날짜별 기록"과 "어제 대비 변화"에는 항상 "기록 없음"이 뜹니다(TESTS.md의 T-07, T-08 FAIL
  상태 — 의도된 것입니다, 버그 아닙니다).
- `scripts/fetch-daily.mjs`(일별 자동 수집 스크립트)와 `.github/workflows/daily-fetch.yml`은
  아직 KRW 하나만 수집하도록 되어 있습니다 — 여러 통화를 수집하도록 확장이 필요합니다.
- 개발용 부가 기능: URL에 `?currency=EUR`처럼 붙이면 초기 통화를 딥링크할 수 있습니다
  (요구사항에는 없는 자동 검증 편의 기능, `app.js` 맨 아래 주석 참고).

## 3. 실행 명령
```bash
# 저장소 루트(ex_5)에서
node scripts/serve.mjs   # 이 파일은 아직 없습니다 — 아래 "다음 행동" 참고, 임시로는:
# 또는 즉석 정적 서버 예시(Node 18+):
node -e "
const http=require('http'),fs=require('fs'),path=require('path');
http.createServer(async(req,res)=>{
  let p=req.url.split('?')[0]; if(p==='/')p='/index.html';
  try{const d=await fs.promises.readFile(path.join(process.cwd(),p));
    const ext=path.extname(p);
    res.writeHead(200,{'Content-Type':{'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json'}[ext]||'text/plain'});
    res.end(d);
  }catch{res.writeHead(404);res.end('not found');}
}).listen(8766,()=>console.log('http://localhost:8766'));
"
```
그다음 브라우저로 `http://localhost:8766/` 접속. Node 18+ (전역 `fetch` 필요), 별도 npm 설치 불필요
(외부 패키지 의존성 없음).

## 4. 통과 검사
`TESTS.md`의 **고정 검사 10개**(시작 전 확정, 절대 삭제·완화·기대값 변경 금지)를 그대로 재실행하세요.
AI A 종료 시점 결과는 `WORKLOG.md`에 있습니다: **8/10 PASS** (T-07, T-08만 FAIL).
당신의 목표는 **10/10 PASS**를 만드는 것입니다.

## 5. 남은 문제
1. `data/history.json`의 기존 레코드에 `currency: "KRW"` 필드를 채워 넣거나, 필드 없음 = KRW라는
   지금의 하위 호환 규칙을 유지하면서 새 통화 기록을 추가할 방법을 정하세요 (둘 다 가능, 택 1).
2. `scripts/fetch-daily.mjs`를 확장해서 KRW뿐 아니라 EUR/JPY/GBP도 하루 1회 수집·중복 방지
   저장하도록 만드세요 (기존 dedupe-by-date 로직 참고, 통화별로 별도 dedupe 키가 필요합니다:
   예) 날짜+통화 조합).
3. `.github/workflows/daily-fetch.yml`이 확장된 스크립트를 그대로 실행하는지 확인하세요.
4. `app.js`의 `loadHistory()`/`renderCompare()`는 이미 `currentCurrency`로 필터링하도록
   되어 있으니, 데이터만 채워지면 T-07/T-08이 자연스럽게 통과할 가능성이 높습니다 — 먼저
   코드를 고치기 전에 실제로 그런지부터 확인하세요.
5. **실제 날짜 기록이 자연 발생해야** T-07/T-08을 완전히 통과시킬 수 있습니다(T04에서 배운
   교훈과 동일 — 하루 만에 몰아서 만들 수 없습니다). 최소 1건이라도 실제로 수집되게 만든 뒤,
   "기록 없음"이 아니라 "1건 있음/2건 이상 있으면 비교" 상태까지는 확인 가능합니다.

## 6. 다음 행동
1. `git log --oneline`과 `git diff c4d0329 HEAD -- index.html app.js styles.css data scripts`로
   기능 코드가 `c4d0329` 이후 안 바뀌었는지 확인 (위 "현재 상태" 참고).
2. `TESTS.md`의 10개 검사를 위 실행 명령으로 먼저 재현해서 정말 8/10인지 확인 (신뢰하지 말고 검증).
3. "남은 문제" 1~3번 순서로 구현.
4. 다시 10개 검사 전부 재실행, 결과를 `WORKLOG.md`의 "AI B 완료" 섹션에 기록.
5. 작업 종료 시점의 소스 버전(커밋 해시)을 `WORKLOG.md`에 기록.

## 7. 금지 범위 (건드리지 말 것)
- `TESTS.md`의 10개 검사 항목(ID·입력·기대값)을 삭제·완화·변경하지 마세요 (T05-C18~C20).
- 기존 KRW 날짜별 기록 3건(`2026-08-24/25/26`)의 값을 임의로 수정하거나 삭제하지 마세요
  (실제로 수집된 값입니다 — 조작 금지).
- 비밀키/토큰을 코드나 워크플로에 추가하지 마세요 (이 프로젝트 전체의 원칙 — Frankfurter API는
  키가 필요 없습니다. 다른 통화도 같은 API로 전부 커버되므로 새 API/키가 필요하지 않습니다).
- `?currency=` 딥링크 기능은 검증 편의용으로 남겨도 되고 지워도 되지만, 지우려면 TESTS.md의
  검사들을 실제 UI 클릭으로 재검증할 방법을 대신 마련하세요.
