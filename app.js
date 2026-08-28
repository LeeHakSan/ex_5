const API_URL = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW";
const TIMEZONE = "Asia/Seoul";
const LAST_GOOD_KEY = "t04-last-good-rate";
const TIMEOUT_MS = 8000;

const els = {
  value: document.getElementById("value"),
  unit: document.getElementById("unit"),
  sourceLink: document.getElementById("source-link"),
  fetchedAt: document.getElementById("fetched-at"),
  statusBadge: document.getElementById("status-badge"),
  sourceDate: document.getElementById("source-date"),
  retryBtn: document.getElementById("retry-btn"),
  historyBody: document.getElementById("history-body"),
  compareResult: document.getElementById("compare-result"),
};

function formatKST(isoString) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).format(new Date(isoString));
}

function readLastGood() {
  try {
    const raw = localStorage.getItem(LAST_GOOD_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLastGood(data) {
  try {
    localStorage.setItem(LAST_GOOD_KEY, JSON.stringify(data));
  } catch {
    // localStorage unavailable — page still works, just no cross-reload cache
  }
}

class FetchFault extends Error {
  constructor(type, message) {
    super(message);
    this.type = type;
  }
}

// 장애 5종을 결정적으로 재현하기 위한 시뮬레이션 계층.
// 실제 API에는 인증/요금제가 없어 auth·ratelimit은 모의로만 재현 가능하다.
async function fetchRate(faultMode) {
  if (faultMode === "auth") {
    throw new FetchFault("auth", "인증 실패 (401 모의) — API 키/토큰이 거부되었습니다.");
  }
  if (faultMode === "ratelimit") {
    throw new FetchFault("ratelimit", "호출 제한 (429 모의) — 요청이 너무 잦습니다.");
  }
  if (faultMode === "offline") {
    throw new FetchFault("offline", "오프라인 (모의) — 네트워크에 연결할 수 없습니다.");
  }
  if (faultMode === "timeout") {
    // 실제 응답 속도에 상관없이 시간 초과를 결정적으로 재현한다 (다른 모의 상태와 동일한 방식).
    await new Promise((r) => setTimeout(r, 300));
    throw new FetchFault("timeout", "시간 초과 (모의) — 응답이 지정 시간 안에 오지 않았습니다.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(API_URL, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new FetchFault("timeout", "시간 초과 — 응답이 지정 시간 안에 오지 않았습니다.");
    }
    if (!navigator.onLine) {
      throw new FetchFault("offline", "오프라인 — 네트워크 연결이 없습니다.");
    }
    throw new FetchFault("offline", "네트워크 오류 — 요청을 보낼 수 없습니다.");
  }
  clearTimeout(timer);

  if (res.status === 401 || res.status === 403) {
    throw new FetchFault("auth", `인증 실패 (${res.status})`);
  }
  if (res.status === 429) {
    throw new FetchFault("ratelimit", "호출 제한 (429)");
  }
  if (!res.ok) {
    throw new FetchFault("format", `예상치 못한 응답 (HTTP ${res.status})`);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new FetchFault("format", "응답 형식이 예상과 다릅니다 (JSON 파싱 실패).");
  }

  const rate = data && data.rates && data.rates.KRW;
  if (typeof rate !== "number" || faultMode === "format") {
    throw new FetchFault("format", "응답 형식이 예상과 다릅니다 (KRW 항목 없음, 모의 포함).");
  }

  return {
    value: rate,
    unit: "KRW / 1 USD",
    source: API_URL,
    sourceDate: data.date, // 출처(ECB) 자체가 매긴 환율 기준일 — 우리가 기록한 조회 시각과는 다른 시각
    fetchedAtISO: new Date().toISOString(),
  };
}

function setBadge(kind, text) {
  els.statusBadge.textContent = text;
  els.statusBadge.className = "badge " + kind;
}

function renderGood(data) {
  els.value.textContent = data.value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
  els.unit.textContent = data.unit;
  els.sourceLink.href = data.source;
  els.sourceLink.textContent = data.source;
  els.sourceDate.textContent = data.sourceDate || "-";
  els.fetchedAt.textContent = formatKST(data.fetchedAtISO) + " (KST)";
  setBadge("ok", "정상");
}

function renderStale(lastGood, faultMessage) {
  if (lastGood) {
    els.value.textContent = lastGood.value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
    els.unit.textContent = lastGood.unit;
    els.sourceLink.href = lastGood.source;
    els.sourceLink.textContent = lastGood.source;
    els.sourceDate.textContent = lastGood.sourceDate || "-";
    els.fetchedAt.textContent = formatKST(lastGood.fetchedAtISO) + " (KST, 마지막 정상 조회)";
    setBadge("stale", `오래된 데이터 — ${faultMessage}`);
  } else {
    els.value.textContent = "값 없음";
    els.unit.textContent = "";
    els.sourceLink.href = API_URL;
    els.sourceLink.textContent = API_URL;
    els.sourceDate.textContent = "-";
    els.fetchedAt.textContent = "-";
    setBadge("error", faultMessage);
  }
}

async function load(bypassFault = false) {
  const params = new URLSearchParams(location.search);
  const faultMode = bypassFault ? null : params.get("fault");

  setBadge("stale", "불러오는 중…");
  try {
    const data = await fetchRate(faultMode);
    writeLastGood(data);
    renderGood(data);
  } catch (err) {
    const lastGood = readLastGood();
    renderStale(lastGood, err.message || "알 수 없는 오류");
  }
}

// 재시도는 URL의 ?fault= 모의 상태를 무시하고 실제 호출을 다시 시도한다.
// (모의 장애 화면을 계속 보려면 링크로 재진입, 복구를 보려면 "다시 시도"를 누른다.)
els.retryBtn.addEventListener("click", () => load(true));

async function loadHistory() {
  let history = [];
  try {
    const res = await fetch("data/history.json", { cache: "no-store" });
    history = await res.json();
  } catch {
    els.historyBody.innerHTML = "<tr><td colspan='4'>기록을 불러오지 못했습니다.</td></tr>";
    els.compareResult.textContent = "기록을 불러오지 못해 비교할 수 없습니다.";
    return;
  }

  history.sort((a, b) => (a.date < b.date ? 1 : -1)); // 최신 날짜 먼저

  if (history.length === 0) {
    els.historyBody.innerHTML = "<tr><td colspan='5'>아직 저장된 날짜별 기록이 없습니다.</td></tr>";
  } else {
    els.historyBody.innerHTML = history
      .map(
        (h) =>
          `<tr><td>${h.date}</td><td>${h.rate.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}</td><td>${h.unit}</td><td>${h.sourceDate || "-"}</td><td>${formatKST(h.fetchedAtUtc)} (KST)</td></tr>`
      )
      .join("");
  }

  renderCompare(history);
}

function renderCompare(historyDesc) {
  if (historyDesc.length < 2) {
    els.compareResult.textContent = "비교할 이전 기록이 아직 없습니다 (날짜별 기록 2건 이상 필요).";
    return;
  }
  const [latest, previous] = historyDesc;
  if (latest.unit !== previous.unit) {
    els.compareResult.textContent = "단위가 달라 비교값을 표시하지 않습니다.";
    return;
  }
  const diff = latest.rate - previous.rate;
  const direction = diff > 0 ? "상승 ▲" : diff < 0 ? "하락 ▼" : "변동 없음 -";
  const cls = diff > 0 ? "delta-up" : diff < 0 ? "delta-down" : "";
  els.compareResult.innerHTML =
    `${previous.date} (${previous.rate.toLocaleString("ko-KR")}) → ${latest.date} (${latest.rate.toLocaleString("ko-KR")})<br>` +
    `<span class="${cls}">차이: ${diff >= 0 ? "+" : ""}${diff.toFixed(2)} ${latest.unit} (${direction})</span>`;
}

load(false);
loadHistory();
