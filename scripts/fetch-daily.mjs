// 하루 1회, 기준 시간대(Asia/Seoul) 날짜로 환율 스냅샷 1건을 data/history.json에 추가한다.
// 같은 날짜가 이미 있으면 아무것도 하지 않는다 (중복 방지).
import { readFile, writeFile } from "node:fs/promises";

const API_URL = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW";
const TIMEZONE = "Asia/Seoul";
const HISTORY_PATH = new URL("../data/history.json", import.meta.url);

function todayInTimezone(tz) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); // YYYY-MM-DD
}

async function main() {
  const res = await fetch(API_URL);
  if (!res.ok) {
    throw new Error(`API 호출 실패: HTTP ${res.status}`);
  }
  const data = await res.json();
  const rate = data?.rates?.KRW;
  if (typeof rate !== "number") {
    throw new Error("응답에 KRW 항목이 없습니다.");
  }

  const raw = await readFile(HISTORY_PATH, "utf-8").catch(() => "[]");
  const history = JSON.parse(raw);

  const date = todayInTimezone(TIMEZONE);
  if (history.some((h) => h.date === date)) {
    console.log(`[skip] ${date} 기록이 이미 있습니다.`);
    return;
  }

  history.push({
    date,
    rate,
    unit: "KRW / 1 USD",
    source: API_URL,
    sourceDate: data.date, // 출처(ECB)가 매긴 환율 기준일 — 우리 조회 시각과 별개
    fetchedAtUtc: new Date().toISOString(),
    timezone: TIMEZONE,
  });
  history.sort((a, b) => (a.date < b.date ? -1 : 1));

  await writeFile(HISTORY_PATH, JSON.stringify(history, null, 2) + "\n", "utf-8");
  console.log(`[added] ${date} = ${rate}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
