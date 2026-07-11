"use strict";

const STORAGE_KEY = "wealthtrack.v1";
const FALLBACK_USD_TWD = 31.2;
const GITHUB_API_BASE = "https://api.github.com";

const KIND_LABELS = {
  crypto: "加密貨幣",
  "us-stock": "美股",
  "tw-stock": "台股",
  manual: "手動資產"
};

const RANGE_CONFIG = {
  month: { label: "1 個月", yahooRange: "1mo", yahooInterval: "1d", days: 30 },
  year: { label: "1 年", yahooRange: "1y", yahooInterval: "1d", days: 365 },
  fiveYear: { label: "5 年", yahooRange: "5y", yahooInterval: "1wk", days: 365 * 5 },
  tenYear: { label: "10 年", yahooRange: "10y", yahooInterval: "1mo", days: 365 * 10 },
  max: { label: "起始至今", yahooRange: "max", yahooInterval: "1mo", days: "max" }
};

const OKX_CRYPTO_QUOTES = {
  "okx:pi-usdt": { instId: "PI-USDT", symbol: "PI", name: "Pi Network" }
};

const dom = {
  badge: document.querySelector("#detailBadge"),
  name: document.querySelector("#detailName"),
  meta: document.querySelector("#detailMeta"),
  refreshButton: document.querySelector("#detailRefreshButton"),
  price: document.querySelector("#detailPrice"),
  priceChange: document.querySelector("#detailPriceChange"),
  marketValue: document.querySelector("#detailMarketValue"),
  allocation: document.querySelector("#detailAllocation"),
  profit: document.querySelector("#detailProfit"),
  profitPercent: document.querySelector("#detailProfitPercent"),
  dividendYield: document.querySelector("#detailDividendYield"),
  dividendSource: document.querySelector("#detailDividendSource"),
  priceRangeLabel: document.querySelector("#priceRangeLabel"),
  priceChartStatus: document.querySelector("#priceChartStatus"),
  priceChart: document.querySelector("#priceChart"),
  rangeButtons: document.querySelectorAll("[data-price-range]"),
  dividendStatus: document.querySelector("#dividendStatus"),
  dividendTableBody: document.querySelector("#dividendTableBody"),
  fundamentalStatus: document.querySelector("#fundamentalStatus"),
  fundamentalTableBody: document.querySelector("#fundamentalTableBody")
};

const params = new URLSearchParams(window.location.search);
let currentRange = params.get("range") || "year";
let pricePoints = [];
let priceHoverIndex = null;

const state = loadState();
const position = findPosition();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      positions: Array.isArray(saved.positions) ? saved.positions : [],
      quotes: saved.quotes && typeof saved.quotes === "object" ? saved.quotes : {},
      baseCurrency: saved.baseCurrency || "TWD",
      fx: saved.fx || { rates: { USD: 1, TWD: FALLBACK_USD_TWD } },
      dividends: saved.dividends || { profiles: {} },
      ui: saved.ui || { theme: "dark" }
    };
  } catch (error) {
    return {
      positions: [],
      quotes: {},
      baseCurrency: "TWD",
      fx: { rates: { USD: 1, TWD: FALLBACK_USD_TWD } },
      dividends: { profiles: {} },
      ui: { theme: "dark" }
    };
  }
}

function findPosition() {
  const id = params.get("id");
  const symbol = String(params.get("symbol") || "").toUpperCase();
  const kind = params.get("kind");
  return state.positions.find((item) => item.id === id)
    || state.positions.find((item) => String(item.symbol || "").toUpperCase() === symbol && (!kind || item.kind === kind))
    || null;
}

function init() {
  document.documentElement.dataset.theme = state.ui.theme === "light" ? "light" : "dark";
  if (!position) {
    renderMissingPosition();
    return;
  }
  renderHeader();
  renderSummary();
  bindEvents();
  refreshDetail();
}

function bindEvents() {
  dom.refreshButton?.addEventListener("click", refreshDetail);
  dom.rangeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      currentRange = button.dataset.priceRange || "year";
      priceHoverIndex = null;
      loadPriceChart();
    });
  });
  dom.priceChart?.addEventListener("mousemove", (event) => updatePriceHover(event.clientX));
  dom.priceChart?.addEventListener("mouseleave", clearPriceHover);
  dom.priceChart?.addEventListener("touchmove", (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    event.preventDefault();
    updatePriceHover(touch.clientX);
  }, { passive: false });
  dom.priceChart?.addEventListener("touchend", clearPriceHover);
  dom.priceChart?.addEventListener("touchcancel", clearPriceHover);
  window.addEventListener("resize", () => drawPriceChart(pricePoints));
}

function renderMissingPosition() {
  dom.name.textContent = "找不到資產";
  dom.meta.textContent = "請從主表點選持倉重新開啟。";
  dom.priceChartStatus.textContent = "無資料";
  dom.dividendStatus.textContent = "無資料";
  dom.fundamentalStatus.textContent = "無資料";
  dom.dividendTableBody.innerHTML = emptyRow("找不到這筆持倉");
  dom.fundamentalTableBody.innerHTML = emptyRow("找不到這筆持倉", 6);
}

function renderHeader() {
  const badge = String(position.symbol || "").replace(/\..+$/, "").slice(0, 3).toUpperCase();
  dom.badge.textContent = badge || "--";
  dom.name.textContent = position.name || position.symbol;
  dom.meta.textContent = `${position.symbol} · ${KIND_LABELS[position.kind] || position.kind}`;
  document.title = `${position.symbol} 分析`;
}

function renderSummary() {
  const metrics = calculatePosition(position);
  const quotePrice = Number(metrics.quote?.price);
  const priceCurrency = metrics.quoteCurrency || unitDisplayCurrency(position, "USD");
  const displayPrice = convertUnitForDisplay(quotePrice, priceCurrency, position);
  const totalValue = calculatePortfolioValue();
  const allocation = Number.isFinite(metrics.currentValue) && totalValue > 0 ? (metrics.currentValue / totalValue) * 100 : NaN;

  dom.price.textContent = Number.isFinite(displayPrice.value) ? formatCurrency(displayPrice.value, displayPrice.currency) : "--";
  dom.priceChange.textContent = Number.isFinite(Number(metrics.quote?.changePercent))
    ? formatPercent(Number(metrics.quote.changePercent))
    : (metrics.quote?.source || "等待報價");
  dom.priceChange.className = valueClass(Number(metrics.quote?.changePercent));
  dom.marketValue.textContent = formatCurrency(metrics.currentValue, state.baseCurrency);
  dom.marketValue.className = valueClass(metrics.currentValue);
  dom.allocation.textContent = Number.isFinite(allocation) ? `佔總資產 ${allocation.toFixed(1)}%` : "--";
  dom.profit.textContent = formatCurrency(metrics.profit, state.baseCurrency);
  dom.profit.className = valueClass(metrics.profit);
  dom.profitPercent.textContent = formatPercent(metrics.profitPercent);
  dom.profitPercent.className = valueClass(metrics.profitPercent);
}

async function refreshDetail() {
  if (!position) return;
  dom.refreshButton.disabled = true;
  dom.refreshButton.textContent = "讀取中";
  try {
    await Promise.allSettled([loadPriceChart(), loadDividendData(), loadFundamentals()]);
  } finally {
    dom.refreshButton.disabled = false;
    dom.refreshButton.textContent = "重新整理";
  }
}

async function loadPriceChart() {
  dom.rangeButtons.forEach((button) => {
    const active = button.dataset.priceRange === currentRange;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  dom.priceRangeLabel.textContent = RANGE_CONFIG[currentRange]?.label || "1 年";
  dom.priceChartStatus.textContent = "讀取中";
  try {
    priceHoverIndex = null;
    pricePoints = await fetchPriceHistory(position, currentRange);
    drawPriceChart(pricePoints);
    dom.priceChartStatus.textContent = pricePoints.length ? `${pricePoints.length} 筆` : "無價格資料";
  } catch (error) {
    pricePoints = [];
    drawPriceChart([]);
    dom.priceChartStatus.textContent = "價格讀取失敗";
  }
}

async function loadDividendData() {
  if (position.kind !== "us-stock" && position.kind !== "tw-stock") {
    dom.dividendStatus.textContent = "不適用";
    dom.dividendTableBody.innerHTML = emptyRow("加密貨幣沒有股息資料");
    dom.dividendYield.textContent = "--";
    dom.dividendSource.textContent = "不適用";
    return;
  }
  dom.dividendStatus.textContent = "讀取中";
  try {
    const data = await fetchDividendHistory(position);
    if (!data.events.length) {
      const cached = getCachedDividendProfile(position);
      if (cached) {
        renderCachedDividendProfile(cached);
        return;
      }
    }
    const quote = calculatePosition(position).quote;
    const price = Number(quote?.price);
    const trailing = trailingTwelveMonthDividend(data.events);
    const yieldPercent = Number.isFinite(price) && price > 0 && trailing > 0 ? (trailing / price) * 100 : NaN;
    dom.dividendYield.textContent = Number.isFinite(yieldPercent) ? `${yieldPercent.toFixed(2)}%` : "--";
    dom.dividendSource.textContent = data.source;
    renderDividendTable(data.annual, data.currency);
    dom.dividendStatus.textContent = data.events.length ? `${data.events.length} 筆` : "無配息紀錄";
  } catch (error) {
    const cached = getCachedDividendProfile(position);
    if (cached) {
      renderCachedDividendProfile(cached);
    } else {
      dom.dividendStatus.textContent = "讀取失敗";
      dom.dividendTableBody.innerHTML = emptyRow("股息資料暫時無法取得");
      dom.dividendYield.textContent = "--";
      dom.dividendSource.textContent = "Yahoo";
    }
  }
}

async function loadFundamentals() {
  if (position.kind !== "us-stock") {
    dom.fundamentalStatus.textContent = "不適用";
    dom.fundamentalTableBody.innerHTML = emptyRow("這類資產沒有 EPS、ROE、FCF 等公司財報欄位", 6);
    return;
  }
  dom.fundamentalStatus.textContent = "讀取中";
  try {
    const results = await Promise.allSettled([
      fetchSecFundamentals(position),
      fetchYahooFundamentals(position)
    ]);
    const candidates = [
      { source: "SEC companyfacts", rows: results[0].status === "fulfilled" ? results[0].value : [] },
      { source: "Yahoo fundamentals", rows: results[1].status === "fulfilled" ? results[1].value : [] }
    ].filter((candidate) => candidate.rows.length);
    const secRows = candidates.find((candidate) => candidate.source === "SEC companyfacts")?.rows || [];
    const yahooRows = candidates.find((candidate) => candidate.source === "Yahoo fundamentals")?.rows || [];
    const rows = mergeFundamentalRows(secRows, yahooRows);
    const source = secRows.length && yahooRows.length
      ? "SEC + Yahoo 補值"
      : secRows.length
        ? "SEC companyfacts"
        : yahooRows.length
          ? "Yahoo fundamentals"
          : "資料不足";
    renderFundamentalTable(rows);
    dom.fundamentalStatus.textContent = rows.length ? source : "資料不足";
  } catch (error) {
    dom.fundamentalStatus.textContent = "讀取失敗";
    dom.fundamentalTableBody.innerHTML = emptyRow("財報資料暫時無法取得", 6);
  }
}

function mergeFundamentalRows(primaryRows, secondaryRows) {
  const byYear = new Map();
  [...secondaryRows, ...primaryRows].forEach((row) => {
    const year = Number(row.year);
    if (!Number.isFinite(year)) return;
    const existing = byYear.get(year) || { year };
    byYear.set(year, {
      year,
      eps: firstFinite(row.eps, existing.eps),
      roe: firstFinite(row.roe, existing.roe),
      fcf: firstFinite(row.fcf, existing.fcf),
      netMargin: firstFinite(row.netMargin, existing.netMargin),
      interestCoverage: firstFinite(row.interestCoverage, existing.interestCoverage)
    });
  });
  return [...byYear.values()].sort((a, b) => b.year - a.year).slice(0, 10);
}

function firstFinite(...values) {
  return values.find((value) => Number.isFinite(Number(value)));
}

async function fetchPriceHistory(target, rangeKey) {
  if (target.kind === "crypto") return fetchCryptoHistory(target, rangeKey);
  if (target.kind === "us-stock" || target.kind === "tw-stock") {
    try {
      const yahooPoints = await fetchYahooPriceHistory(target, rangeKey);
      if (yahooPoints.length) return yahooPoints;
      throw new Error("Yahoo history returned no points");
    } catch (error) {
      if (target.kind === "us-stock") {
        const fallbackPoints = await fetchStooqPriceHistory(target, rangeKey);
        if (fallbackPoints.length) return fallbackPoints;
      }
      throw error;
    }
  }
  return [];
}

async function fetchYahooPriceHistory(target, rangeKey) {
  const config = RANGE_CONFIG[rangeKey] || RANGE_CONFIG.year;
  const yahooSymbol = getYahooSymbol(target.marketSymbol || target.symbol, target.kind);
  let lastError = null;
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${config.yahooRange}&interval=${config.yahooInterval}`;
      const data = await fetchJson(url, { fallbackProxy: true, timeoutMs: 14_000 });
      const error = data?.chart?.error;
      if (error) throw new Error(error.description || "Yahoo history error");
      const result = data?.chart?.result?.[0];
      const timestamps = result?.timestamp || [];
      const closes = result?.indicators?.quote?.[0]?.close || [];
      const points = timestamps.map((timestamp, index) => ({
        date: new Date(timestamp * 1000),
        value: Number(closes[index])
      })).filter((point) => Number.isFinite(point.value));
      if (points.length) return points;
      lastError = new Error("Yahoo history returned no points");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Yahoo history unavailable");
}

async function fetchStooqPriceHistory(target, rangeKey) {
  const symbol = getPlainMarketSymbol(target.marketSymbol || target.symbol, target.kind).toLowerCase().replace(/\./g, "-");
  const config = RANGE_CONFIG[rangeKey] || RANGE_CONFIG.year;
  const end = new Date();
  const start = config.days === "max"
    ? new Date(1980, 0, 1)
    : new Date(Date.now() - Number(config.days || 365) * 24 * 60 * 60 * 1000);
  const d1 = formatStooqDate(start);
  const d2 = formatStooqDate(end);
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(`${symbol}.us`)}&d1=${d1}&d2=${d2}&i=d`;
  const csv = await fetchTextWithFallback(url, { timeoutMs: 12_000 });
  if (!/^date,/i.test(csv.trim())) throw new Error("Stooq did not return CSV data");
  const points = csv.trim().split(/\r?\n/).slice(1).map((line) => {
    const [date, , , , close] = line.split(",");
    return { date: new Date(`${date}T00:00:00`), value: Number(close) };
  }).filter((point) => Number.isFinite(point.value));
  if (!points.length) throw new Error("Stooq returned no points");
  return points;
}

async function fetchCryptoHistory(target, rangeKey) {
  const marketSymbol = String(target.marketSymbol || target.symbol || "").toLowerCase();
  const okx = OKX_CRYPTO_QUOTES[marketSymbol];
  if (okx) return fetchOkxHistory(okx.instId);
  const config = RANGE_CONFIG[rangeKey] || RANGE_CONFIG.year;
  const days = config.days === "max" ? "max" : String(config.days);
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(marketSymbol)}/market_chart?vs_currency=usd&days=${days}`;
  const data = await fetchJson(url, { fallbackProxy: true, timeoutMs: 14_000 });
  return (data?.prices || []).map(([timestamp, price]) => ({
    date: new Date(Number(timestamp)),
    value: Number(price)
  })).filter((point) => Number.isFinite(point.value));
}

async function fetchOkxHistory(instId) {
  const url = `https://www.okx.com/api/v5/market/history-candles?instId=${encodeURIComponent(instId)}&bar=1D&limit=300`;
  const data = await fetchJson(url, { fallbackProxy: true, timeoutMs: 12_000 });
  return (data?.data || []).map((row) => ({
    date: new Date(Number(row[0])),
    value: Number(row[4])
  })).filter((point) => Number.isFinite(point.value)).sort((a, b) => a.date - b.date);
}

async function fetchDividendHistory(target) {
  const yahooSymbol = getYahooSymbol(target.marketSymbol || target.symbol, target.kind);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=10y&interval=1mo&events=div`;
  const data = await fetchJson(url, { fallbackProxy: true, timeoutMs: 14_000 });
  const result = data?.chart?.result?.[0];
  const currency = result?.meta?.currency || (target.kind === "tw-stock" ? "TWD" : "USD");
  const events = Object.values(result?.events?.dividends || {}).map((event) => ({
    date: new Date(Number(event.date) * 1000),
    amount: Number(event.amount)
  })).filter((event) => Number.isFinite(event.amount)).sort((a, b) => b.date - a.date);
  const annual = new Map();
  events.forEach((event) => {
    const year = event.date.getFullYear();
    annual.set(year, (annual.get(year) || 0) + event.amount);
  });
  return { events, annual, currency, source: "Yahoo 股息事件" };
}

async function fetchSecFundamentals(target) {
  const cik = await findCik(target.marketSymbol || target.symbol);
  if (!cik) return [];
  const padded = String(cik).padStart(10, "0");
  const facts = await fetchJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${padded}.json`, { fallbackProxy: true, timeoutMs: 16_000 });
  const gaap = facts?.facts?.["us-gaap"] || {};
  const eps = annualConcept(gaap, ["EarningsPerShareDiluted"], (unit) => unit.toLowerCase().includes("shares"));
  const revenue = annualConcept(gaap, [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet",
    "SalesRevenueServicesNet"
  ], (unit) => unit === "USD");
  const netIncome = annualConcept(gaap, [
    "NetIncomeLoss",
    "ProfitLoss",
    "NetIncomeLossAvailableToCommonStockholdersBasic",
    "NetIncomeLossAttributableToParent"
  ], (unit) => unit === "USD");
  const equity = annualConcept(gaap, ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], (unit) => unit === "USD");
  const operatingCashFlow = annualConcept(gaap, [
    "NetCashProvidedByUsedInOperatingActivities",
    "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"
  ], (unit) => unit === "USD");
  const capex = annualConcept(gaap, ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"], (unit) => unit === "USD");
  const operatingIncome = annualConcept(gaap, ["OperatingIncomeLoss"], (unit) => unit === "USD");
  const interestExpense = annualConcept(gaap, ["InterestExpenseNonoperating", "InterestExpenseNonOperating", "InterestExpense", "InterestAndDebtExpense"], (unit) => unit === "USD");
  const years = [...new Set([
    ...eps.keys(),
    ...revenue.keys(),
    ...netIncome.keys(),
    ...equity.keys(),
    ...operatingCashFlow.keys(),
    ...capex.keys(),
    ...operatingIncome.keys(),
    ...interestExpense.keys()
  ])].sort((a, b) => b - a).slice(0, 10);

  return years.map((year) => {
    const ni = netIncome.get(year);
    const rev = revenue.get(year);
    const eq = equity.get(year);
    const prevEq = equity.get(year - 1);
    const ocf = operatingCashFlow.get(year);
    const capexValue = capex.get(year);
    const op = operatingIncome.get(year);
    const interest = Math.abs(Number(interestExpense.get(year)));
    const averageEquity = Number.isFinite(eq) && Number.isFinite(prevEq) ? (eq + prevEq) / 2 : eq;
    return {
      year,
      eps: eps.get(year),
      roe: Number.isFinite(ni) && Number.isFinite(averageEquity) && averageEquity !== 0 ? (ni / averageEquity) * 100 : NaN,
      fcf: Number.isFinite(ocf) && Number.isFinite(capexValue) ? ocf - Math.abs(capexValue) : NaN,
      netMargin: Number.isFinite(ni) && Number.isFinite(rev) && rev !== 0 ? (ni / rev) * 100 : NaN,
      interestCoverage: Number.isFinite(op) && Number.isFinite(interest) && interest > 0 ? op / interest : NaN
    };
  });
}

async function fetchYahooFundamentals(target) {
  const symbol = getYahooSymbol(target.marketSymbol || target.symbol, target.kind);
  const end = Math.floor(Date.now() / 1000) + 86400;
  const start = Math.floor(Date.UTC(new Date().getFullYear() - 11, 0, 1) / 1000);
  const types = [
    "annualDilutedEPS",
    "annualFreeCashFlow",
    "annualTotalRevenue",
    "annualNetIncome",
    "annualStockholdersEquity",
    "annualOperatingIncome",
    "annualInterestExpense",
    "annualEBIT",
    "annualPretaxIncome"
  ];
  let lastError = null;
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const url = `https://${host}/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?symbol=${encodeURIComponent(symbol)}&type=${types.join(",")}&period1=${start}&period2=${end}`;
      const data = await fetchJson(url, { fallbackProxy: true, timeoutMs: 14_000 });
      const rows = parseYahooFundamentalRows(data);
      if (rows.length) return rows;
      lastError = new Error("Yahoo fundamentals returned no rows");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Yahoo fundamentals unavailable");
}

function parseYahooFundamentalRows(data) {
  const series = {};
  (data?.timeseries?.result || []).forEach((entry) => {
    const type = entry?.meta?.type?.[0];
    if (!type || !Array.isArray(entry[type])) return;
    entry[type].forEach((point) => {
      const year = Number(String(point.asOfDate || "").slice(0, 4));
      const value = Number(point?.reportedValue?.raw);
      if (!Number.isFinite(year) || !Number.isFinite(value)) return;
      if (!series[year]) series[year] = { year };
      if (type === "annualDilutedEPS") series[year].eps = value;
      if (type === "annualFreeCashFlow") series[year].fcf = value;
      if (type === "annualTotalRevenue") series[year].revenue = value;
      if (type === "annualNetIncome") series[year].netIncome = value;
      if (type === "annualStockholdersEquity") series[year].equity = value;
      if (type === "annualOperatingIncome") series[year].operatingIncome = value;
      if (type === "annualInterestExpense") series[year].interestExpense = value;
      if (type === "annualEBIT") series[year].ebit = value;
    });
  });
  return Object.values(series).sort((a, b) => b.year - a.year).slice(0, 10).map((row) => {
    const prevEquity = series[row.year - 1]?.equity;
    const averageEquity = Number.isFinite(row.equity) && Number.isFinite(prevEquity)
      ? (row.equity + prevEquity) / 2
      : row.equity;
    const interest = Math.abs(Number(row.interestExpense));
    return {
      year: row.year,
      eps: row.eps,
      roe: Number.isFinite(row.netIncome) && Number.isFinite(averageEquity) && averageEquity !== 0 ? (row.netIncome / averageEquity) * 100 : NaN,
      fcf: row.fcf,
      netMargin: Number.isFinite(row.netIncome) && Number.isFinite(row.revenue) && row.revenue !== 0 ? (row.netIncome / row.revenue) * 100 : NaN,
      interestCoverage: Number.isFinite(row.operatingIncome) && Number.isFinite(interest) && interest > 0 ? row.operatingIncome / interest : NaN
    };
  });
}

async function findCik(symbol) {
  const wanted = normalizeSecTicker(symbol);
  const data = await fetchJson("https://www.sec.gov/files/company_tickers.json", { fallbackProxy: true, timeoutMs: 14_000 });
  return Object.values(data || {}).find((row) => normalizeSecTicker(row.ticker) === wanted)?.cik_str || null;
}

function annualConcept(gaap, conceptNames, unitMatches) {
  const byYear = new Map();
  conceptNames.forEach((conceptName, conceptIndex) => {
    const units = gaap?.[conceptName]?.units;
    if (!units) return;
    Object.entries(units).forEach(([unit, facts]) => {
      if (!unitMatches(unit)) return;
      facts.forEach((fact) => {
        const year = annualFactYear(fact);
        if (!Number.isFinite(year)) return;
        if (fact.fp && fact.fp !== "FY") return;
        if (!String(fact.form || "").startsWith("10-K")) return;
        const value = Number(fact.val);
        if (!Number.isFinite(value)) return;
        const candidate = {
          value,
          filed: String(fact.filed || ""),
          conceptIndex,
          hasAnnualFrame: /^CY\d{4}$/.test(String(fact.frame || "")),
          durationDays: factDurationDays(fact)
        };
        const existing = byYear.get(year);
        if (!existing || shouldUseAnnualFact(candidate, existing)) {
          byYear.set(year, candidate);
        }
      });
    });
  });
  return new Map([...byYear.entries()].map(([year, fact]) => [year, fact.value]));
}

function annualFactYear(fact) {
  const frame = String(fact.frame || "");
  const annualFrame = frame.match(/^CY(\d{4})$/);
  if (annualFrame) return Number(annualFrame[1]);
  const durationDays = factDurationDays(fact);
  if (/^CY\d{4}Q\d/i.test(frame) && durationDays > 0) return NaN;
  if (durationDays && durationDays < 300) return NaN;
  const endYear = Number(String(fact.end || "").slice(0, 4));
  if (Number.isFinite(endYear)) return endYear;
  return Number(fact.fy);
}

function factDurationDays(fact) {
  if (!fact.start || !fact.end) return 0;
  const start = new Date(`${fact.start}T00:00:00Z`).getTime();
  const end = new Date(`${fact.end}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / 86400000) + 1;
}

function shouldUseAnnualFact(candidate, existing) {
  if (candidate.conceptIndex !== existing.conceptIndex) {
    return candidate.conceptIndex < existing.conceptIndex;
  }
  if (candidate.filed !== existing.filed) {
    return candidate.filed > existing.filed;
  }
  if (candidate.hasAnnualFrame !== existing.hasAnnualFrame) {
    return candidate.hasAnnualFrame;
  }
  return candidate.durationDays > existing.durationDays;
}

function renderDividendTable(annual, currency) {
  const years = [...annual.keys()].sort((a, b) => b - a).slice(0, 10);
  if (!years.length) {
    dom.dividendTableBody.innerHTML = emptyRow("近 10 年沒有配息紀錄");
    return;
  }
  dom.dividendTableBody.innerHTML = years.map((year) => {
    const perShare = annual.get(year);
    const holding = perShare * Number(position.quantity || 0);
    const holdingValue = convertCurrency(holding, currency, state.baseCurrency);
    return `
      <tr>
        <td>${year}</td>
        <td>${formatCurrency(perShare, currency)}</td>
        <td>${formatCurrency(holdingValue, state.baseCurrency)}</td>
      </tr>
    `;
  }).join("");
}

function renderCachedDividendProfile(profile) {
  const currency = profile.currency || (position.kind === "tw-stock" ? "TWD" : "USD");
  const annualPerShare = Number(profile.annualPerShare);
  const annualHolding = annualPerShare * Number(position.quantity || 0);
  const holdingValue = convertCurrency(annualHolding, currency, state.baseCurrency);
  dom.dividendYield.textContent = Number.isFinite(Number(profile.yieldPercent)) ? `${Number(profile.yieldPercent).toFixed(2)}%` : "--";
  dom.dividendSource.textContent = profile.source ? `${profile.source} 快取` : "快取估算";
  dom.dividendStatus.textContent = "使用快取估算";
  dom.dividendTableBody.innerHTML = `
    <tr>
      <td>${new Date().getFullYear()}E</td>
      <td>${formatCurrency(annualPerShare, currency)}</td>
      <td>${formatCurrency(holdingValue, state.baseCurrency)}</td>
    </tr>
  `;
}

function renderFundamentalTable(rows) {
  if (!rows.length) {
    dom.fundamentalTableBody.innerHTML = emptyRow("沒有足夠的 SEC 年度資料", 6);
    return;
  }
  dom.fundamentalTableBody.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.year}</td>
      <td>${formatNumber(row.eps, 2)}</td>
      <td>${formatPlainPercent(row.roe)}</td>
      <td>${formatCompactCurrency(row.fcf, "USD")}</td>
      <td>${formatPlainPercent(row.netMargin)}</td>
      <td>${formatRatio(row.interestCoverage)}</td>
    </tr>
  `).join("");
}

function updatePriceHover(clientX) {
  if (!pricePoints.length || !dom.priceChart) return;
  const rect = dom.priceChart.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.max(240, Math.floor(rect.height));
  const chart = priceChartLayout(width, height);
  const localX = Math.max(chart.left, Math.min(chart.right, clientX - rect.left));
  const ratio = (localX - chart.left) / Math.max(chart.right - chart.left, 1);
  priceHoverIndex = Math.max(0, Math.min(pricePoints.length - 1, Math.round(ratio * (pricePoints.length - 1))));
  drawPriceChart(pricePoints);
}

function clearPriceHover() {
  if (priceHoverIndex === null) return;
  priceHoverIndex = null;
  drawPriceChart(pricePoints);
}

function priceChartLayout(width, height) {
  return { left: 68, right: width - 22, top: 24, bottom: height - 44 };
}

function drawPriceChart(points) {
  const canvas = dom.priceChart;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.max(240, Math.floor(rect.height));
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const styles = getComputedStyle(document.documentElement);
  const text = styles.getPropertyValue("--text").trim() || "#e8ece8";
  const muted = styles.getPropertyValue("--muted").trim() || "#a8b0a8";
  const line = styles.getPropertyValue("--line").trim() || "#303734";
  const primary = styles.getPropertyValue("--primary").trim() || "#0b7a75";
  ctx.clearRect(0, 0, width, height);

  const chart = priceChartLayout(width, height);
  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = chart.top + (i / 3) * (chart.bottom - chart.top);
    ctx.beginPath();
    ctx.moveTo(chart.left, y);
    ctx.lineTo(chart.right, y);
    ctx.stroke();
  }

  if (!points.length) {
    ctx.fillStyle = muted;
    ctx.font = "700 16px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("暫無價格資料", width / 2, height / 2);
    return;
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.08, max * 0.02, 1);
  const yMin = min - pad;
  const yMax = max + pad;
  const xFor = (index) => chart.left + (index / Math.max(points.length - 1, 1)) * (chart.right - chart.left);
  const yFor = (value) => chart.bottom - ((value - yMin) / Math.max(yMax - yMin, 1)) * (chart.bottom - chart.top);

  ctx.fillStyle = muted;
  ctx.font = "700 12px system-ui";
  ctx.textAlign = "right";
  [yMax, (yMax + yMin) / 2, yMin].forEach((value, index) => {
    const y = index === 0 ? chart.top + 4 : index === 1 ? (chart.top + chart.bottom) / 2 + 4 : chart.bottom;
    ctx.fillText(formatCompactCurrency(value, unitDisplayCurrency(position, "USD")), chart.left - 8, y);
  });

  const gradient = ctx.createLinearGradient(0, chart.top, 0, chart.bottom);
  gradient.addColorStop(0, "rgba(92, 255, 211, 0.28)");
  gradient.addColorStop(1, "rgba(92, 255, 211, 0)");
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = xFor(index);
    const y = yFor(point.value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(xFor(points.length - 1), chart.bottom);
  ctx.lineTo(xFor(0), chart.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  points.forEach((point, index) => {
    const x = xFor(index);
    const y = yFor(point.value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = primary;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  ctx.fillStyle = text;
  ctx.font = "800 12px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(formatDate(points[0].date), chart.left, height - 16);
  ctx.textAlign = "right";
  ctx.fillText(formatDate(points[points.length - 1].date), chart.right, height - 16);

  if (priceHoverIndex === null) return;
  const hoverIndex = Math.max(0, Math.min(points.length - 1, priceHoverIndex));
  const hover = points[hoverIndex];
  if (!hover) return;
  const hoverX = xFor(hoverIndex);
  const hoverY = yFor(hover.value);
  ctx.save();
  ctx.strokeStyle = primary;
  ctx.globalAlpha = 0.46;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.moveTo(hoverX, chart.top);
  ctx.lineTo(hoverX, chart.bottom);
  ctx.moveTo(chart.left, hoverY);
  ctx.lineTo(chart.right, hoverY);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  ctx.fillStyle = primary;
  ctx.strokeStyle = text;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(hoverX, hoverY, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const currency = unitDisplayCurrency(position, "USD");
  const title = formatDate(hover.date);
  const valueText = formatCurrency(hover.value, currency);
  ctx.font = "800 13px system-ui";
  const titleWidth = ctx.measureText(title).width;
  ctx.font = "900 16px system-ui";
  const valueWidth = ctx.measureText(valueText).width;
  const boxWidth = Math.max(128, Math.ceil(Math.max(titleWidth, valueWidth) + 24));
  const boxHeight = 58;
  const boxX = Math.min(Math.max(hoverX + 12, chart.left), chart.right - boxWidth);
  const preferredBoxY = hoverY > chart.top + boxHeight + 14 ? hoverY - boxHeight - 12 : hoverY + 14;
  const boxY = Math.min(Math.max(preferredBoxY, chart.top), chart.bottom - boxHeight);
  ctx.fillStyle = styles.getPropertyValue("--panel").trim() || "#171d1a";
  ctx.strokeStyle = primary;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(boxX, boxY, boxWidth, boxHeight);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillStyle = muted;
  ctx.font = "800 13px system-ui";
  ctx.fillText(title, boxX + 12, boxY + 20);
  ctx.fillStyle = text;
  ctx.font = "900 16px system-ui";
  ctx.fillText(valueText, boxX + 12, boxY + 43);
  ctx.restore();
}

function calculatePortfolioValue() {
  return state.positions.reduce((sum, item) => {
    const value = calculatePosition(item).currentValue;
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

function calculatePosition(item) {
  const quote = getQuote(item);
  const quoteCurrency = quote?.currency || item.manualCurrency || state.baseCurrency;
  const price = Number(quote?.price);
  const currentValue = Number.isFinite(price)
    ? convertCurrency(price * Number(item.quantity || 0), quoteCurrency, state.baseCurrency)
    : NaN;
  const costCurrency = positionCostCurrency(item, quoteCurrency);
  const costValue = convertCurrency(Number(item.averageCost || 0) * Number(item.quantity || 0), costCurrency, state.baseCurrency);
  const profit = Number.isFinite(currentValue) ? currentValue - costValue : NaN;
  const profitPercent = Number.isFinite(profit) && costValue > 0 ? (profit / costValue) * 100 : NaN;
  return { quote, quoteCurrency, currentValue, costValue, profit, profitPercent };
}

function getQuote(item) {
  if (item.kind === "manual") {
    return {
      price: Number(item.manualPrice),
      currency: item.manualCurrency || state.baseCurrency,
      source: "手動"
    };
  }
  return state.quotes[quoteKey(item)];
}

function quoteKey(item) {
  if (item.kind === "crypto") return `crypto:${item.marketSymbol}`;
  if (item.kind === "manual") return `manual:${item.id}`;
  return `stock:${item.marketSymbol}`;
}

function positionCostCurrency(item, quoteCurrency) {
  if (item.costCurrency && item.costCurrency !== "QUOTE") return item.costCurrency;
  return unitDisplayCurrency(item, quoteCurrency);
}

function getCachedDividendProfile(item) {
  return state.dividends?.profiles?.[dividendKey(item)] || null;
}

function dividendKey(item) {
  return `dividend:${item.kind}:${getYahooSymbol(item.marketSymbol || item.symbol, item.kind).toUpperCase()}`;
}

function unitDisplayCurrency(item, fallbackCurrency) {
  if (item.kind === "tw-stock") return "TWD";
  if (item.kind === "us-stock" || item.kind === "crypto") return "USD";
  return fallbackCurrency || state.baseCurrency;
}

function convertUnitForDisplay(value, sourceCurrency, item) {
  const currency = unitDisplayCurrency(item, sourceCurrency);
  return { value: convertCurrency(value, sourceCurrency, currency), currency };
}

function convertCurrency(value, fromCurrency, toCurrency) {
  const number = Number(value);
  if (!Number.isFinite(number)) return NaN;
  const from = fromCurrency || state.baseCurrency;
  const to = toCurrency || state.baseCurrency;
  if (from === to) return number;
  const rates = state.fx?.rates || { USD: 1, TWD: FALLBACK_USD_TWD };
  const usdValue = from === "USD" ? number : number / Number(rates[from] || FALLBACK_USD_TWD);
  return to === "USD" ? usdValue : usdValue * Number(rates[to] || FALLBACK_USD_TWD);
}

function getYahooSymbol(symbol, kind) {
  const raw = getPlainMarketSymbol(symbol, kind);
  if (kind === "tw-stock") {
    const clean = raw.replace(/\.(TW|TWO)$/i, "");
    return raw.endsWith(".TWO") ? `${clean}.TWO` : `${clean}.TW`;
  }
  return raw.replace(".B", "-B").replace(/\./g, "-");
}

function getPlainMarketSymbol(symbol, kind = "us-stock") {
  const raw = String(symbol || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!raw) return "";
  const parts = raw.split(":").filter(Boolean);
  if (parts.length === 2) {
    const [left, right] = parts;
    if (isMarketExchange(left)) return right;
    if (isMarketExchange(right)) return left;
  }
  if (kind === "tw-stock") return raw.replace(/^(TPE|TWO):/i, "");
  return raw.replace(/^(NASDAQ|NYSE|NYSEARCA|NYSEAMERICAN|AMEX):/i, "");
}

function isMarketExchange(value) {
  return ["NASDAQ", "NYSE", "NYSEARCA", "NYSEAMERICAN", "AMEX", "TPE", "TWO"].includes(String(value || "").toUpperCase());
}

function normalizeSecTicker(symbol) {
  return getPlainMarketSymbol(symbol, "us-stock").replace(/\.(TW|TWO)$/i, "").replace(".B", "-B").replace(/\./g, "-");
}

function normalizeYahooPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return NaN;
  return Math.abs(number) <= 5 ? number * 100 : number;
}

function trailingTwelveMonthDividend(events) {
  const cutoff = Date.now() - 366 * 24 * 60 * 60 * 1000;
  return events.filter((event) => event.date.getTime() >= cutoff).reduce((sum, event) => sum + event.amount, 0);
}

async function fetchJson(url, options = {}) {
  const { fallbackProxy = false, timeoutMs = 12_000 } = options;
  try {
    return await fetchJsonDirect(url, timeoutMs);
  } catch (error) {
    if (!fallbackProxy) throw error;
    try {
      const text = await fetchText(`https://r.jina.ai/http://${url}`, { timeoutMs });
      return parseJsonFromText(text);
    } catch (readerError) {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      return fetchJsonDirect(proxyUrl, timeoutMs);
    }
  }
}

async function fetchJsonDirect(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, options = {}) {
  const { timeoutMs = 12_000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextWithFallback(url, options = {}) {
  const { timeoutMs = 12_000 } = options;
  try {
    return await fetchText(url, { timeoutMs });
  } catch (error) {
    try {
      return await fetchText(`https://r.jina.ai/http://${url}`, { timeoutMs });
    } catch (readerError) {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      return fetchText(proxyUrl, { timeoutMs });
    }
  }
}

function parseJsonFromText(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("Missing JSON payload");
  return JSON.parse(text.slice(start, end + 1));
}

function formatCurrency(value, currency = state.baseCurrency) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  const prefix = currency === "USD" ? "US$" : currency === "TWD" ? "NT$" : `${currency} `;
  const maximumFractionDigits = Math.abs(number) >= 100 ? 0 : 2;
  return `${prefix}${number.toLocaleString("en-US", { maximumFractionDigits })}`;
}

function formatCompactCurrency(value, currency = "USD") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  const abs = Math.abs(number);
  if (currency === "TWD" && abs >= 10_000) return `NT$${(number / 10_000).toFixed(abs >= 100_000 ? 0 : 1)}萬`;
  if (abs >= 1_000_000_000) return `${currency === "USD" ? "US$" : "NT$"}${(number / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${currency === "USD" ? "US$" : "NT$"}${(number / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${currency === "USD" ? "US$" : "NT$"}${(number / 1_000).toFixed(1)}K`;
  return formatCurrency(number, currency);
}

function formatNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return number.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return `${number >= 0 ? "+" : ""}${number.toFixed(2)}%`;
}

function formatPlainPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return `${number.toFixed(2)}%`;
}

function formatRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return `${number.toFixed(1)}x`;
}

function formatDate(date) {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function formatStooqDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function valueClass(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return "";
  return number > 0 ? "positive" : "negative";
}

function emptyRow(message, colspan = 3) {
  return `<tr><td class="detail-empty" colspan="${colspan}">${message}</td></tr>`;
}

init();
