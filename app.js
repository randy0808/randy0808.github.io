"use strict";

const STORE = "wealthtrack.v1";
const REFRESH_MS = 300000;
const STOCK_QUOTE_CONCURRENCY = 1;
const STOCK_QUOTE_DELAY_MS = 1800;
const FALLBACK_TWD = 31.2;
const CRYPTO = {
  btc: ["bitcoin", "BTC", "Bitcoin"],
  bitcoin: ["bitcoin", "BTC", "Bitcoin"],
  eth: ["ethereum", "ETH", "Ethereum"],
  ethereum: ["ethereum", "ETH", "Ethereum"],
  sol: ["solana", "SOL", "Solana"],
  bnb: ["binancecoin", "BNB", "BNB"],
  xrp: ["ripple", "XRP", "XRP"],
  ada: ["cardano", "ADA", "Cardano"],
  doge: ["dogecoin", "DOGE", "Dogecoin"],
  usdt: ["tether", "USDT", "Tether"],
  usdc: ["usd-coin", "USDC", "USD Coin"],
  link: ["chainlink", "LINK", "Chainlink"],
  ltc: ["litecoin", "LTC", "Litecoin"]
};
const KIND = { crypto: "加密貨幣", "us-stock": "美股", "tw-stock": "台股", manual: "手動資產" };
const ALLOCATION_LIMIT = 20;
const COLORS = ["#0b7a75", "#2f6fed", "#b7791f", "#7b61ff", "#d95f43", "#4d908e", "#9a6b3f", "#2563eb", "#16a34a", "#dc2626", "#9333ea", "#0891b2", "#ca8a04", "#be123c", "#0f766e", "#7c3aed", "#15803d", "#ea580c", "#0284c7", "#a16207", "#64748b"];
const GF_BASE = "https://r.jina.ai/http://https://www.google.com/finance/quote/";
const GF_US = ["NASDAQ", "NYSE", "NYSEARCA", "NYSEAMERICAN"];
const GF_HINTS = { AAPL: "NASDAQ", AMD: "NASDAQ", AMZN: "NASDAQ", COST: "NASDAQ", GOOGL: "NASDAQ", GOOG: "NASDAQ", META: "NASDAQ", MSFT: "NASDAQ", NFLX: "NASDAQ", NVDA: "NASDAQ", QQQ: "NASDAQ", TQQQ: "NASDAQ", TSLA: "NASDAQ", VOO: "NYSEARCA", SPY: "NYSEARCA", IVV: "NYSEARCA", DIA: "NYSEARCA", IWM: "NYSEARCA", AWR: "NYSE", BA: "NYSE", BAC: "NYSE", BABA: "NYSE", BEN: "NYSE", BRK: "NYSE", CCL: "NYSE", DIS: "NYSE", EL: "NYSE", JPM: "NYSE", KO: "NYSE", NKE: "NYSE", TSM: "NYSE", UNH: "NYSE", V: "NYSE", WMT: "NYSE" };
const $ = (id) => document.getElementById(id);
const el = {
  sync: $("syncStatus"), total: $("totalValue"), cost: $("totalCost"), profit: $("totalProfit"),
  profitPct: $("totalProfitPercent"), count: $("positionCount"), baseHint: $("baseCurrencyHint"),
  quoteHealth: $("quoteHealth"), fxStatus: $("fxStatus"), refresh: $("refreshButton"),
  form: $("assetForm"), formTitle: $("formTitle"), editingId: $("editingId"), kind: $("assetKind"),
  symbol: $("assetSymbol"), name: $("assetName"), qty: $("assetQuantity"), avg: $("assetAverageCost"),
  costCurrency: $("costCurrency"), manualPrice: $("manualPrice"), manualCurrency: $("manualCurrency"),
  submit: $("submitAssetButton"), cancel: $("cancelEditButton"), export: $("exportButton"),
  import: $("importButton"), importFile: $("importFile"), allocTotal: $("allocationTotal"),
  canvas: $("allocationChart"), legend: $("allocationLegend"), rows: $("positionsBody"),
  empty: $("emptyState"), status: $("statusMessage"), search: $("positionSearch"), sort: $("positionSort"),
  baseButtons: document.querySelectorAll("[data-base-currency]")
};
const state = load();

function load() {
  const fresh = { positions: [], baseCurrency: "TWD", sortMode: "value-desc", quotes: {}, fx: { USD: 1, TWD: FALLBACK_TWD }, fxAt: null, refreshing: false, lastSync: null, errors: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || "{}");
    if (Array.isArray(saved.positions)) fresh.positions = saved.positions;
    if (saved.baseCurrency === "USD" || saved.baseCurrency === "TWD") fresh.baseCurrency = saved.baseCurrency;
    if (typeof saved.sortMode === "string") fresh.sortMode = saved.sortMode;
    if (saved.quotes && typeof saved.quotes === "object") {
      fresh.quotes = Object.fromEntries(Object.entries(saved.quotes).filter(([, q]) => q && Number.isFinite(Number(q.price)) && typeof q.currency === "string"));
    }
    if (saved.fx?.rates?.TWD) fresh.fx = { USD: 1, TWD: Number(saved.fx.rates.TWD) };
  } catch (error) {
    console.warn("load failed", error);
  }
  return fresh;
}

function save() {
  localStorage.setItem(STORE, JSON.stringify({
    positions: state.positions,
    baseCurrency: state.baseCurrency,
    sortMode: state.sortMode,
    quotes: state.quotes,
    fx: { rates: state.fx }
  }));
}

function uid() {
  return globalThis.crypto?.randomUUID?.() || `asset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cryptoMeta(symbol) {
  const key = String(symbol).trim().toLowerCase();
  const found = CRYPTO[key];
  if (found) return { id: found[0], symbol: found[1], name: found[2] };
  return { id: key, symbol: key.toUpperCase(), name: key.replace(/-/g, " ") || "Crypto" };
}

function twSymbol(value) {
  const raw = String(value).trim().toUpperCase().replace(/\s+/g, "");
  return /^\d{4,6}$/.test(raw) ? `${raw}.TW` : raw;
}

function normalize(input, id = uid(), createdAt = new Date().toISOString()) {
  const kind = ["crypto", "us-stock", "tw-stock", "manual"].includes(input.kind) ? input.kind : "manual";
  const raw = String(input.symbol || "").trim();
  const quantity = Number(input.quantity);
  const averageCost = Number(input.averageCost);
  const costCurrency = ["QUOTE", "TWD", "USD"].includes(input.costCurrency) ? input.costCurrency : "QUOTE";
  const manualCurrency = input.manualCurrency === "USD" ? "USD" : "TWD";
  if (!raw) throw new Error("請輸入資產代號");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("請輸入大於 0 的數量");
  if (!Number.isFinite(averageCost) || averageCost < 0) throw new Error("請輸入有效的平均成本");
  if (kind === "crypto") {
    const m = cryptoMeta(raw);
    return { id, kind, symbol: m.symbol, marketSymbol: m.id, name: input.name || m.name, quantity, averageCost, costCurrency, manualPrice: null, manualCurrency, createdAt };
  }
  if (kind === "tw-stock" || kind === "us-stock") {
    const marketSymbol = kind === "tw-stock" ? twSymbol(raw) : raw.toUpperCase().replace(/\s+/g, "");
    return { id, kind, symbol: marketSymbol, marketSymbol, name: input.name || marketSymbol, quantity, averageCost, costCurrency, manualPrice: null, manualCurrency, createdAt };
  }
  const manualPrice = Number(input.manualPrice);
  return { id, kind: "manual", symbol: raw, marketSymbol: raw, name: input.name || raw, quantity, averageCost, costCurrency: costCurrency === "QUOTE" ? manualCurrency : costCurrency, manualPrice: Number.isFinite(manualPrice) ? manualPrice : averageCost, manualCurrency, createdAt };
}

function keyOf(p) {
  if (p.kind === "crypto") return `crypto:${p.marketSymbol}`;
  if (p.kind === "manual") return `manual:${p.id}`;
  return `stock:${p.marketSymbol}`;
}

function stockKindForSymbol(symbol) {
  const raw = String(symbol || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!raw || CRYPTO[raw.toLowerCase()]) return null;
  if (/^\d{4,6}(\.(TW|TWO))?$/.test(raw)) return "tw-stock";
  if (GF_HINTS[raw.replace(".B", "")] || /^[A-Z.]{1,5}$/.test(raw)) return "us-stock";
  return null;
}

function quoteOf(p) {
  if (p.kind === "manual") return { price: Number(p.manualPrice), currency: p.manualCurrency, source: "手動", changePercent: null };
  return state.quotes[keyOf(p)];
}

function convert(amount, from, to) {
  from = (from || to).toUpperCase();
  to = (to || state.baseCurrency).toUpperCase();
  if (!Number.isFinite(amount)) return NaN;
  if (from === to) return amount;
  if (!state.fx[from] || !state.fx[to]) return NaN;
  return amount / state.fx[from] * state.fx[to];
}

function currency(value, cur = state.baseCurrency, compact = false) {
  if (!Number.isFinite(value)) return "--";
  const text = new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: cur,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : (cur === "TWD" && Math.abs(value) >= 100 ? 0 : 2)
  }).format(value);
  if (cur === "TWD") return text.includes("NT$") ? text : text.replace("$", "NT$");
  if (cur === "USD") return text.includes("US$") ? text : text.replace("$", "US$");
  return text;
}

function number(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 6 }).format(value) : "--";
}

function percent(value) {
  return Number.isFinite(value) ? `${value > 0 ? "+" : ""}${value.toFixed(2)}%` : "--";
}

function valueClass(value) {
  if (!Number.isFinite(value) || value === 0) return "";
  return value > 0 ? "profit-positive" : "profit-negative";
}

function metrics(p) {
  const q = quoteOf(p);
  const qcur = q?.currency || p.manualCurrency || state.baseCurrency;
  const price = Number(q?.price);
  const value = Number.isFinite(price) ? convert(price * p.quantity, qcur, state.baseCurrency) : NaN;
  const ccur = p.costCurrency === "QUOTE" ? qcur : p.costCurrency;
  const cost = convert(Number(p.averageCost) * p.quantity, ccur, state.baseCurrency);
  const profit = Number.isFinite(value) && Number.isFinite(cost) ? value - cost : NaN;
  return { q, qcur, ccur, value, cost, profit, profitPct: cost > 0 ? profit / cost * 100 : NaN };
}

function portfolio() {
  return state.positions.reduce((t, p) => {
    const m = metrics(p);
    if (Number.isFinite(m.value)) { t.value += m.value; t.quoted += 1; }
    if (Number.isFinite(m.cost)) t.cost += m.cost;
    return t;
  }, { value: 0, cost: 0, quoted: 0 });
}

function render() {
  const t = portfolio();
  const profit = t.value - t.cost;
  el.total.textContent = currency(t.value);
  el.total.className = valueClass(t.value);
  el.cost.textContent = currency(t.cost);
  el.cost.className = valueClass(t.cost);
  el.profit.textContent = currency(profit);
  el.profit.className = valueClass(profit);
  el.profitPct.textContent = percent(t.cost > 0 ? profit / t.cost * 100 : NaN);
  el.profitPct.className = valueClass(t.cost > 0 ? profit / t.cost * 100 : NaN);
  el.count.textContent = `${state.positions.length} 筆資產`;
  el.baseHint.textContent = `以 ${state.baseCurrency} 顯示`;
  el.quoteHealth.textContent = `${t.quoted}/${state.positions.length}`;
  el.fxStatus.textContent = state.fxAt ? `匯率 ${time(state.fxAt)}` : "使用備用匯率";
  el.allocTotal.textContent = currency(t.value);
  el.allocTotal.className = valueClass(t.value);
  el.sync.textContent = state.refreshing ? "正在同步市場價格..." : state.lastSync ? `最近更新 ${time(state.lastSync)}` : "尚未同步市場價格";
  el.status.textContent = !state.positions.length ? "新增資產後會開始追蹤市值與損益。" : state.errors.length ? `${state.errors.length} 個報價暫時無法更新${t.quoted ? "，已保留可用的上次報價" : ""}：${state.errors.slice(0, 3).join("、")}` : `已取得 ${t.quoted} 筆報價，自動刷新間隔 ${Math.round(REFRESH_MS / 60000)} 分鐘。`;
  el.sort.value = state.sortMode;
  el.baseButtons.forEach((b) => b.classList.toggle("is-active", b.dataset.baseCurrency === state.baseCurrency));
  renderRows();
  drawChart();
}

function renderRows() {
  const query = el.search.value.trim().toLowerCase();
  const rows = sortRows(state.positions
    .map((p) => ({ p, m: metrics(p) }))
    .filter(({ p }) => !query || `${p.symbol} ${p.name} ${KIND[p.kind]}`.toLowerCase().includes(query)));
  el.rows.innerHTML = "";
  el.empty.classList.toggle("is-hidden", state.positions.length > 0);
  rows.forEach(({ p, m }) => {
    const qPrice = Number(m.q?.price);
    const ch = Number(m.q?.changePercent);
    const qPriceClass = valueClass(qPrice);
    const chClass = valueClass(ch);
    const qtyClass = valueClass(p.quantity);
    const avgClass = valueClass(p.averageCost);
    const costClass = valueClass(m.cost);
    const valueCellClass = valueClass(m.value);
    const profitClass = valueClass(m.profit);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><div class="asset-cell"><span class="asset-badge">${esc(p.symbol.replace(/\..+$/, "").slice(0, 3))}</span><span class="asset-title"><strong>${esc(p.name)}</strong><small>${esc(p.symbol)} · ${esc(KIND[p.kind])}</small></span></div></td><td class="${qtyClass}">${number(p.quantity)}</td><td class="${avgClass}">${currency(p.averageCost, m.ccur)}<div class="sub-value ${costClass}">${currency(m.cost)}</div></td><td class="${qPriceClass}">${Number.isFinite(qPrice) ? currency(qPrice, m.qcur) : "--"}<div class="sub-value ${chClass}">${Number.isFinite(ch) ? percent(ch) : esc(m.q?.source || "等待報價")}</div></td><td class="${valueCellClass}">${currency(m.value)}</td><td class="${profitClass}">${currency(m.profit)}<div>${percent(m.profitPct)}</div></td><td><div class="row-actions"><button class="row-button" data-action="edit" data-id="${esc(p.id)}" type="button">編輯</button><button class="row-button danger" data-action="delete" data-id="${esc(p.id)}" type="button">刪除</button></div></td>`;
    el.rows.appendChild(tr);
  });
}

function sortRows(rows) {
  const mode = state.sortMode || "value-desc";
  const [field, direction = "desc"] = mode.split("-");
  const dir = direction === "asc" ? 1 : -1;
  return rows.sort((a, b) => {
    if (field === "asset") {
      const left = `${a.p.symbol} ${a.p.name}`.trim();
      const right = `${b.p.symbol} ${b.p.name}`.trim();
      return left.localeCompare(right, "en", { numeric: true, sensitivity: "base" }) * dir;
    }
    const av = sortValue(a, field);
    const bv = sortValue(b, field);
    const aOk = Number.isFinite(av);
    const bOk = Number.isFinite(bv);
    if (!aOk && !bOk) return a.p.symbol.localeCompare(b.p.symbol, "en", { numeric: true, sensitivity: "base" });
    if (!aOk) return 1;
    if (!bOk) return -1;
    return direction === "asc" ? av - bv : bv - av;
  });
}

function sortValue(row, field) {
  if (field === "quantity") return Number(row.p.quantity);
  if (field === "profit") return Number(row.m.profit);
  if (field === "profitPercent") return Number(row.m.profitPct);
  return Number(row.m.value);
}

function drawChart() {
  const canvas = el.canvas;
  const ctx = canvas.getContext("2d");
  const size = 260, dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr; canvas.height = size * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const items = state.positions.map((p) => ({ p, v: metrics(p).value })).filter((x) => Number.isFinite(x.v) && x.v > 0).sort((a, b) => b.v - a.v);
  const total = items.reduce((s, x) => s + x.v, 0);
  const chartItems = allocationItems(items);
  const cx = size / 2, cy = size / 2, r = 92;
  if (!total) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.lineWidth = 26; ctx.strokeStyle = "#dfe7df"; ctx.stroke();
    ctx.fillStyle = "#647067"; ctx.font = "700 16px system-ui"; ctx.textAlign = "center"; ctx.fillText("No Data", cx, cy + 5);
    el.legend.innerHTML = "<small>尚無可繪製的市值資料</small>";
    return;
  }
  let start = -Math.PI / 2;
  chartItems.forEach((item, i) => {
    const angle = item.v / total * Math.PI * 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, start, start + angle); ctx.lineWidth = 26; ctx.lineCap = "round"; ctx.strokeStyle = COLORS[i % COLORS.length]; ctx.stroke();
    start += angle;
  });
  ctx.fillStyle = "#19211e"; ctx.font = "800 20px system-ui"; ctx.textAlign = "center"; ctx.fillText(currency(total, state.baseCurrency, true), cx, cy - 3);
  ctx.fillStyle = "#647067"; ctx.font = "700 12px system-ui"; ctx.fillText(state.baseCurrency, cx, cy + 19);
  el.legend.innerHTML = chartItems.map((x, i) => `<div class="legend-row"><span class="legend-dot" style="background:${COLORS[i % COLORS.length]}"></span><strong>${esc(x.label)}</strong><small class="legend-values"><span class="legend-market-value">${currency(x.v)}</span><span class="legend-percent">${(x.v / total * 100).toFixed(1)}%</span></small></div>`).join("");
}

function allocationItems(items) {
  const top = items.slice(0, ALLOCATION_LIMIT).map((x) => ({ label: x.p.symbol, v: x.v }));
  const other = items.slice(ALLOCATION_LIMIT).reduce((sum, x) => sum + x.v, 0);
  if (other > 0) top.push({ label: "其他", v: other });
  return top;
}

async function refreshPrices() {
  if (state.refreshing) return;
  state.refreshing = true; state.errors = []; el.refresh.disabled = true; render();
  try {
    await fetchFx();
    const next = { ...state.quotes };
    state.quotes = next;
    const cryptoIds = [...new Set(state.positions.filter((p) => p.kind === "crypto").map((p) => p.marketSymbol))];
    const stocks = [...state.positions.filter((p) => p.kind === "us-stock" || p.kind === "tw-stock").reduce((map, p) => {
      const symbol = p.marketSymbol || p.symbol;
      if (symbol) map.set(symbol, p.kind);
      return map;
    }, new Map())];
    if (cryptoIds.length) {
      const missingCrypto = [];
      try {
        const data = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIds.join(",")}&vs_currencies=usd,twd&include_24hr_change=true&include_last_updated_at=true`, true);
        cryptoIds.forEach((id) => {
          const x = data[id], base = state.baseCurrency.toLowerCase();
          if (!x) return missingCrypto.push(id);
          next[`crypto:${id}`] = { price: Number(x[base] ?? x.usd), currency: x[base] ? state.baseCurrency : "USD", changePercent: Number(x[`${base}_24h_change`] ?? x.usd_24h_change), source: "CoinGecko" };
          render();
        });
      } catch (error) { missingCrypto.push(...cryptoIds); console.warn(error); }
      await mapLimit(missingCrypto, 3, async (id) => {
        const key = `crypto:${id}`;
        const kind = stockKindForSymbol(id);
        if (!kind) {
          if (!next[key]) state.errors.push(id);
          return;
        }
        try {
          next[key] = await stockQuote(id.toUpperCase(), kind);
          render();
        } catch (error) {
          if (!next[key]) state.errors.push(id);
          console.warn(`Stock fallback failed for ${id}`, error);
        }
      });
    }
    await mapLimit(prioritizeMissing(stocks, next), STOCK_QUOTE_CONCURRENCY, async ([symbol, kind], index) => {
      const key = `stock:${symbol}`;
      if (index > 0) await sleep(STOCK_QUOTE_DELAY_MS);
      try { next[key] = await retry(() => stockQuote(symbol, kind), 2, STOCK_QUOTE_DELAY_MS); render(); } catch (error) { if (!next[key]) state.errors.push(symbol); console.warn(error); render(); }
    });
    state.quotes = next; state.lastSync = Date.now(); save();
  } finally {
    state.refreshing = false; el.refresh.disabled = false; render();
  }
}

async function mapLimit(items, limit, task) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const taskIndex = index++;
      await task(items[taskIndex], taskIndex);
    }
  });
  await Promise.all(workers);
}

function prioritizeMissing(items, quotes) {
  return shuffle(items).sort(([a], [b]) => Number(Boolean(quotes[`stock:${a}`])) - Number(Boolean(quotes[`stock:${b}`])));
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

async function retry(task, attempts = 2, delay = 1000) {
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await task(); } catch (error) { last = error; if (attempt < attempts - 1) await sleep(delay * (attempt + 1)); }
  }
  throw last;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchFx() {
  try {
    const data = await getJson("https://open.er-api.com/v6/latest/USD");
    if (!data?.rates?.TWD) throw new Error("missing TWD");
    state.fx = { USD: 1, TWD: Number(data.rates.TWD) };
    state.fxAt = Date.now();
  } catch (error) {
    state.errors.push("匯率");
    state.fx = state.fx?.TWD ? state.fx : { USD: 1, TWD: FALLBACK_TWD };
  }
}

async function stockQuote(symbol, kind) {
  if (kind === "tw-stock") {
    try { return await twse(symbol); } catch (error) { console.warn(`TWSE quote failed for ${symbol}`, error); }
  }
  try {
    return await yahoo(symbol, kind);
  } catch (error) {
    console.warn(`Yahoo quote failed for ${symbol}`, error);
  }
  return googleFinance(symbol, kind);
}

async function googleFinance(symbol, kind) {
  let last = null;
  for (const target of gfTargets(symbol, kind)) {
    try {
      const path = `${encodeURIComponent(target.symbol)}:${encodeURIComponent(target.exchange)}`;
      const markdown = await getText(`${GF_BASE}${path}`, 14000);
      return parseGoogle(markdown, target.symbol, target.exchange, kind);
    } catch (error) {
      last = error;
    }
  }
  throw last || new Error("Google Finance quote not found");
}

function gfTargets(symbol, kind) {
  const raw = String(symbol || "").trim().toUpperCase().replace(/\s+/g, "");
  const parsed = parseGfSymbol(raw);
  if (parsed) return [parsed];
  const clean = raw.replace(/\.(TW|TWO)$/i, "");
  if (kind === "tw-stock") return (raw.endsWith(".TWO") ? ["TWO", "TPE"] : ["TPE", "TWO"]).map((exchange) => ({ symbol: clean, exchange }));
  const hint = GF_HINTS[clean.replace(".B", "")] || GF_HINTS[clean];
  const exchanges = hint ? [hint, ...GF_US.filter((exchange) => exchange !== hint)] : GF_US;
  return exchanges.map((exchange) => ({ symbol: clean, exchange }));
}

function parseGfSymbol(value) {
  const parts = String(value || "").split(":").filter(Boolean);
  if (parts.length !== 2) return null;
  const [first, second] = parts;
  if (isGfExchange(first)) return { symbol: second, exchange: first };
  if (isGfExchange(second)) return { symbol: first, exchange: second };
  return null;
}

function isGfExchange(value) {
  return ["NASDAQ", "NYSE", "NYSEARCA", "NYSEAMERICAN", "TPE", "TWO"].includes(value);
}

function parseGoogle(markdown, symbol, exchange, kind) {
  const marker = `${symbol}:${exchange}`;
  const lines = markdown.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const exact = lines.findIndex((line) => line === marker);
  const markerLine = exact !== -1 ? exact : lines.findIndex((line) => line.includes(marker));
  if (markerLine === -1) throw new Error(`missing ${marker}`);
  const priceLine = lines.findIndex((line, index) => index > markerLine && money(line) !== null);
  if (priceLine === -1) throw new Error(`missing price for ${marker}`);
  const pctLine = lines.slice(priceLine + 1, priceLine + 10).find((line) => /[+-]?\d+(?:\.\d+)?%/.test(line));
  const pct = pctLine?.match(/([+-]?\d+(?:\.\d+)?)%/);
  const currencyLine = lines.find((line) => /\b(USD|TWD)\b/.test(line));
  return {
    price: money(lines[priceLine]),
    currency: currencyLine?.match(/\b(USD|TWD)\b/)?.[1] || (kind === "tw-stock" ? "TWD" : "USD"),
    changePercent: pct ? Number(pct[1]) : null,
    source: `Google Finance ${exchange}`
  };
}

function money(value) {
  const match = String(value || "").match(/^(?:US\$|NT\$|\$)?\s*([0-9][0-9,]*(?:\.\d+)?)$/);
  if (!match) return null;
  const price = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(price) ? price : null;
}

async function twse(symbol) {
  const clean = String(symbol || "").trim().toUpperCase().replace(/\.(TW|TWO)$/i, "");
  const exchange = String(symbol || "").toUpperCase().endsWith(".TWO") ? "otc" : "tse";
  const data = await getJson(`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${exchange}_${clean}.tw&json=1&delay=0`, true, 5000);
  const item = data?.msgArray?.[0];
  if (!item) throw new Error("no TWSE quote");
  const price = firstNumber(item.z, item.pz, item.y);
  const prev = firstNumber(item.y);
  if (!Number.isFinite(price)) throw new Error("no TWSE price");
  return { price, currency: "TWD", changePercent: prev > 0 ? (price - prev) / prev * 100 : null, source: "TWSE" };
}

function firstNumber(...values) {
  for (const value of values) {
    const n = Number(String(value ?? "").replaceAll(",", ""));
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

function yahooSymbol(symbol, kind) {
  const raw = String(symbol || "").trim().toUpperCase().replace(/\s+/g, "");
  if (kind === "tw-stock") {
    const clean = raw.replace(/\.(TW|TWO)$/i, "");
    return raw.endsWith(".TWO") ? `${clean}.TWO` : `${clean}.TW`;
  }
  return raw.replace(".B", "-B").replace(/\./g, "-");
}

async function yahoo(symbol, kind) {
  const ySymbol = yahooSymbol(symbol, kind);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?range=1d&interval=1m`;
  const data = await getJson(url, true, 5000);
  const error = data?.chart?.error;
  if (error) throw new Error(error.description || "Yahoo Finance error");
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error("no quote");
  const price = Number(meta.regularMarketPrice ?? meta.previousClose ?? meta.chartPreviousClose);
  if (!Number.isFinite(price)) throw new Error("no price");
  const prev = Number(meta.chartPreviousClose ?? meta.previousClose);
  return { price, currency: meta.currency || (ySymbol.endsWith(".TW") || ySymbol.endsWith(".TWO") ? "TWD" : "USD"), changePercent: prev > 0 ? (price - prev) / prev * 100 : null, source: "Yahoo Finance" };
}

async function getText(url, timeout = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url, proxy = false, timeout = 12000) {
  try {
    return await getJsonDirect(url, timeout);
  } catch (error) {
    if (!proxy) throw error;
    try {
      return jsonFromText(await getText(`https://r.jina.ai/http://${url}`, timeout));
    } catch (readerError) {
      return getJsonDirect(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, timeout);
    }
  }
}

function jsonFromText(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("no JSON payload");
  return JSON.parse(text.slice(start, end + 1));
}

async function getJsonDirect(url, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

function submit(event) {
  event.preventDefault();
  try {
    const old = state.positions.find((p) => p.id === el.editingId.value);
    const p = normalize({ kind: el.kind.value, symbol: el.symbol.value, name: el.name.value, quantity: el.qty.value, averageCost: el.avg.value, costCurrency: el.costCurrency.value, manualPrice: el.manualPrice.value, manualCurrency: el.manualCurrency.value }, old?.id, old?.createdAt);
    state.positions = old ? state.positions.map((x) => x.id === old.id ? p : x) : state.positions.concat(p);
    save(); resetForm(); render(); refreshPrices();
  } catch (error) { alert(error.message || "無法儲存資產"); }
}

function edit(id) {
  const p = state.positions.find((x) => x.id === id);
  if (!p) return;
  el.editingId.value = p.id; el.kind.value = p.kind; el.symbol.value = p.kind === "crypto" ? p.symbol : p.marketSymbol; el.name.value = p.name;
  el.qty.value = p.quantity; el.avg.value = p.averageCost; el.costCurrency.value = p.costCurrency; el.manualPrice.value = p.manualPrice ?? ""; el.manualCurrency.value = p.manualCurrency || "TWD";
  el.formTitle.textContent = "編輯資產"; el.submit.textContent = "更新資產"; el.cancel.classList.remove("is-hidden"); updateKind(); el.symbol.focus();
}

function remove(id) {
  const p = state.positions.find((x) => x.id === id);
  if (!p || !confirm(`刪除 ${p.name}？`)) return;
  state.positions = state.positions.filter((x) => x.id !== id);
  save(); render();
}

function resetForm() {
  el.form.reset(); el.editingId.value = ""; el.kind.value = "crypto"; el.costCurrency.value = "QUOTE";
  el.formTitle.textContent = "新增資產"; el.submit.textContent = "新增資產"; el.cancel.classList.add("is-hidden"); updateKind();
}

function updateKind() {
  const manual = el.kind.value === "manual";
  el.form.classList.toggle("manual-mode", manual);
  el.manualPrice.required = manual;
  el.symbol.placeholder = el.kind.value === "tw-stock" ? "2330 或 0050.TW" : el.kind.value === "us-stock" ? "AAPL, TSLA, NVDA" : manual ? "現金、基金、房產" : "BTC, ETH, bitcoin";
}

function exportData() {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), app: "wealthtrack", version: 1, baseCurrency: state.baseCurrency, positions: state.positions }, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `wealthtrack-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href);
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      state.positions = (data.positions || []).map((p) => normalize(p, p.id, p.createdAt));
      if (data.baseCurrency === "USD" || data.baseCurrency === "TWD") state.baseCurrency = data.baseCurrency;
      save(); resetForm(); render(); refreshPrices();
    } catch (error) { alert("匯入失敗"); }
  };
  reader.readAsText(file);
}

function time(value) {
  return new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function esc(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

el.form.addEventListener("submit", submit);
el.kind.addEventListener("change", updateKind);
el.refresh.addEventListener("click", refreshPrices);
el.cancel.addEventListener("click", resetForm);
el.export.addEventListener("click", exportData);
el.import.addEventListener("click", () => el.importFile.click());
el.importFile.addEventListener("change", () => importData(el.importFile.files[0]));
el.search.addEventListener("input", renderRows);
el.sort.addEventListener("change", () => { state.sortMode = el.sort.value; save(); renderRows(); });
el.baseButtons.forEach((b) => b.addEventListener("click", () => { state.baseCurrency = b.dataset.baseCurrency; save(); render(); refreshPrices(); }));
el.rows.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "edit") edit(button.dataset.id);
  if (button.dataset.action === "delete") remove(button.dataset.id);
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.positions.length && (!state.lastSync || Date.now() - state.lastSync > REFRESH_MS)) refreshPrices();
});
window.addEventListener("resize", drawChart);
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./service-worker.js?v=11").catch(console.warn);
updateKind();
render();
if (state.positions.length) refreshPrices();
setInterval(() => { if (state.positions.length && document.visibilityState === "visible") refreshPrices(); }, REFRESH_MS);
