// 하루 1회, 기준 시간대(Asia/Seoul) 날짜로 환율 스냅샷을 통화별로 data/history.json에 추가한다.
// 같은 날짜+통화 조합이 이미 있으면 해당 통화는 건너뛴다 (중복 방지).
import { readFile, writeFile } from "node:fs/promises";

const CURRENCIES = ["KRW", "EUR", "JPY", "GBP"];
const TIMEZONE = "Asia/Seoul";
const HISTORY_PATH = new URL("../data/history.json", import.meta.url);

function apiUrlFor(currency) {
  return `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${currency}`;
}

function unitFor(currency) {
  return `${currency} / 1 USD`;
}

function todayInTimezone(tz) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); // YYYY-MM-DD
}

async function fetchCurrency(currency) {
  const apiUrl = apiUrlFor(currency);
  const res = await fetch(apiUrl);
  if (!res.ok) {
    throw new Error(`${currency}: API 호출 실패: HTTP ${res.status}`);
  }

  const data = await res.json();
  const rate = data?.rates?.[currency];
  if (typeof rate !== "number") {
    throw new Error(`${currency}: 응답에 ${currency} 항목이 없습니다.`);
  }

  return {
    rate,
    unit: unitFor(currency),
    source: apiUrl,
    sourceDate: data.date,
    fetchedAtUtc: new Date().toISOString(),
  };
}

async function main() {
  const raw = await readFile(HISTORY_PATH, "utf-8").catch(() => "[]");
  const history = JSON.parse(raw);
  if (!Array.isArray(history)) {
    throw new Error("data/history.json의 최상위 값은 배열이어야 합니다.");
  }

  const date = todayInTimezone(TIMEZONE);
  const pending = CURRENCIES.filter(
    (currency) => !history.some((h) => h.date === date && (h.currency || "KRW") === currency)
  );

  if (pending.length === 0) {
    console.log(`[skip] ${date} 모든 통화 기록이 이미 있습니다.`);
    return;
  }

  const errors = [];
  let added = 0;

  for (const currency of pending) {
    try {
      const snapshot = await fetchCurrency(currency);
      history.push({
        date,
        rate: snapshot.rate,
        unit: snapshot.unit,
        currency,
        source: snapshot.source,
        sourceDate: snapshot.sourceDate,
        fetchedAtUtc: snapshot.fetchedAtUtc,
        timezone: TIMEZONE,
      });
      added += 1;
      console.log(`[added] ${date} ${currency} = ${snapshot.rate}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(message);
      console.error(`[error] ${message}`);
    }
  }

  if (added > 0) {
    history.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      const aCurrency = a.currency || "KRW";
      const bCurrency = b.currency || "KRW";
      return aCurrency.localeCompare(bCurrency);
    });
    await writeFile(HISTORY_PATH, JSON.stringify(history, null, 2) + "\n", "utf-8");
  }

  if (errors.length > 0) {
    throw new Error(`${errors.length}개 통화 수집 실패`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
