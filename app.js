"use strict";

const STORAGE_KEY = "wealthtrack.v1";
const FALLBACK_USD_TWD = 31.2;
const REFRESH_MS = 60_000;
const AUTO_SYNC_DEBOUNCE_MS = 2_500;
const STOCK_QUOTE_CONCURRENCY = 1;
const STOCK_QUOTE_DELAY_MS = 1_800;
const GITHUB_API_BASE = "https://api.github.com";
const SYNC_FILE_NAME = "wealthtrack-sync.json";
const SYNC_GIST_DESCRIPTION = "WealthTrack private sync";

const CRYPTO_ALIASES = {
  btc: { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  bitcoin: { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  eth: { id: "ethereum", symbol: "ETH", name: "Ethereum" },
  ethereum: { id: "ethereum", symbol: "ETH", name: "Ethereum" },
  sol: { id: "solana", symbol: "SOL", name: "Solana" },
  solana: { id: "solana", symbol: "SOL", name: "Solana" },
  bnb: { id: "binancecoin", symbol: "BNB", name: "BNB" },
  xrp: { id: "ripple", symbol: "XRP", name: "XRP" },
  ada: { id: "cardano", symbol: "ADA", name: "Cardano" },
  doge: { id: "dogecoin", symbol: "DOGE", name: "Dogecoin" },
  usdt: { id: "tether", symbol: "USDT", name: "Tether" },
  usdc: { id: "usd-coin", symbol: "USDC", name: "USD Coin" },
  pi: { id: "okx:PI-USDT", symbol: "PI", name: "Pi Network" },
  "pi network": { id: "okx:PI-USDT", symbol: "PI", name: "Pi Network" },
  pinetwork: { id: "okx:PI-USDT", symbol: "PI", name: "Pi Network" },
  "okx:pi-usdt": { id: "okx:PI-USDT", symbol: "PI", name: "Pi Network" },
  avax: { id: "avalanche-2", symbol: "AVAX", name: "Avalanche" },
  dot: { id: "polkadot", symbol: "DOT", name: "Polkadot" },
  link: { id: "chainlink", symbol: "LINK", name: "Chainlink" },
  ltc: { id: "litecoin", symbol: "LTC", name: "Litecoin" },
  bch: { id: "bitcoin-cash", symbol: "BCH", name: "Bitcoin Cash" }
};

const OKX_CRYPTO_QUOTES = {
  "okx:pi-usdt": { instId: "PI-USDT", symbol: "PI", name: "Pi Network" }
};

const KIND_LABELS = {
  crypto: "加密貨幣",
  "us-stock": "美股",
  "tw-stock": "台股",
  manual: "手動資產"
};

const ALLOCATION_LIMIT = 20;
const CHART_COLORS = [
  "#0b7a75", "#2f6fed", "#b7791f", "#7b61ff", "#d95f43",
  "#4d908e", "#9a6b3f", "#2563eb", "#16a34a", "#dc2626",
  "#9333ea", "#0891b2", "#ca8a04", "#be123c", "#0f766e",
  "#7c3aed", "#15803d", "#ea580c", "#0284c7", "#a16207",
  "#64748b"
];
const GOOGLE_FINANCE_READER_BASE = "https://r.jina.ai/http://https://www.google.com/finance/quote/";
const DEFAULT_GOOGLE_US_EXCHANGES = ["NASDAQ", "NYSE", "NYSEARCA", "NYSEAMERICAN"];
const GOOGLE_FINANCE_EXCHANGE_HINTS = {
  AAPL: "NASDAQ",
  AMD: "NASDAQ",
  AMZN: "NASDAQ",
  COST: "NASDAQ",
  GOOGL: "NASDAQ",
  GOOG: "NASDAQ",
  META: "NASDAQ",
  MSFT: "NASDAQ",
  NFLX: "NASDAQ",
  NVDA: "NASDAQ",
  QQQ: "NASDAQ",
  TQQQ: "NASDAQ",
  TSLA: "NASDAQ",
  VOO: "NYSEARCA",
  SPY: "NYSEARCA",
  IVV: "NYSEARCA",
  DIA: "NYSEARCA",
  IWM: "NYSEARCA",
  AWR: "NYSE",
  BA: "NYSE",
  BAC: "NYSE",
  BABA: "NYSE",
  BEN: "NYSE",
  BRK: "NYSE",
  CCL: "NYSE",
  DIS: "NYSE",
  EL: "NYSE",
  JPM: "NYSE",
  KO: "NYSE",
  NKE: "NYSE",
  TSM: "NYSE",
  UNH: "NYSE",
  V: "NYSE",
  WMT: "NYSE"
};

const state = {
  positions: [],
  baseCurrency: "TWD",
  quotes: {},
  fx: {
    rates: { USD: 1, TWD: FALLBACK_USD_TWD },
    asOf: null,
    source: "fallback"
  },
  sortMode: "value-desc",
  isRefreshing: false,
  lastSync: null,
  quoteErrors: [],
  allocationHoverKey: null,
  allocationPinnedKey: null,
  cloud: {
    token: "",
    gistId: "",
    autoSync: false,
    lastPulledAt: null,
    lastPushedAt: null,
    lastRemoteUpdatedAt: null,
    lastHash: "",
    status: "",
    busy: false
  }
};

let autoSyncTimer = null;

const SORT_DEFAULT_DIRECTIONS = {
  asset: "asc",
  quantity: "desc",
  averageCost: "desc",
  price: "desc",
  value: "desc",
  profit: "desc",
  profitPercent: "desc"
};

const dom = {
  syncStatus: document.querySelector("#syncStatus"),
  totalValue: document.querySelector("#totalValue"),
  totalCost: document.querySelector("#totalCost"),
  totalProfit: document.querySelector("#totalProfit"),
  totalProfitPercent: document.querySelector("#totalProfitPercent"),
  positionCount: document.querySelector("#positionCount"),
  baseCurrencyHint: document.querySelector("#baseCurrencyHint"),
  quoteHealth: document.querySelector("#quoteHealth"),
  fxStatus: document.querySelector("#fxStatus"),
  refreshButton: document.querySelector("#refreshButton"),
  menuButton: document.querySelector("#menuButton"),
  closeMenuButton: document.querySelector("#closeMenuButton"),
  appMenu: document.querySelector("#appMenu"),
  menuBackdrop: document.querySelector("#menuBackdrop"),
  menuMainPanel: document.querySelector("#menuMainPanel"),
  tokenSettingsButton: document.querySelector("#tokenSettingsButton"),
  tokenSettingsPanel: document.querySelector("#tokenSettingsPanel"),
  backToMenuButton: document.querySelector("#backToMenuButton"),
  baseButtons: document.querySelectorAll("[data-base-currency]"),
  form: document.querySelector("#assetForm"),
  formTitle: document.querySelector("#formTitle"),
  editingId: document.querySelector("#editingId"),
  assetKind: document.querySelector("#assetKind"),
  assetSymbol: document.querySelector("#assetSymbol"),
  assetName: document.querySelector("#assetName"),
  assetQuantity: document.querySelector("#assetQuantity"),
  assetAverageCost: document.querySelector("#assetAverageCost"),
  costCurrency: document.querySelector("#costCurrency"),
  manualPrice: document.querySelector("#manualPrice"),
  manualCurrency: document.querySelector("#manualCurrency"),
  submitAssetButton: document.querySelector("#submitAssetButton"),
  cancelEditButton: document.querySelector("#cancelEditButton"),
  exportButton: document.querySelector("#exportButton"),
  importButton: document.querySelector("#importButton"),
  importFile: document.querySelector("#importFile"),
  syncToken: document.querySelector("#syncToken"),
  syncGistId: document.querySelector("#syncGistId"),
  syncAuto: document.querySelector("#syncAuto"),
  syncSaveButton: document.querySelector("#syncSaveButton"),
  cloudUploadButton: document.querySelector("#cloudUploadButton"),
  cloudDownloadButton: document.querySelector("#cloudDownloadButton"),
  syncClearTokenButton: document.querySelector("#syncClearTokenButton"),
  cloudSyncStatus: document.querySelector("#cloudSyncStatus"),
  syncTokenState: document.querySelector("#syncTokenState"),
  tokenSettingsSummary: document.querySelector("#tokenSettingsSummary"),
  allocationTotal: document.querySelector("#allocationTotal"),
  allocationChart: document.querySelector("#allocationChart"),
  allocationInsights: document.querySelector("#allocationInsights"),
  allocationLegend: document.querySelector("#allocationLegend"),
  positionsBody: document.querySelector("#positionsBody"),
  emptyState: document.querySelector("#emptyState"),
  statusMessage: document.querySelector("#statusMessage"),
  positionSearch: document.querySelector("#positionSearch"),
  sortButtons: document.querySelectorAll("[data-sort-field]")
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (Array.isArray(saved.positions)) {
      state.positions = saved.positions.map(normalizeImportedPosition).filter(Boolean);
    }
    if (saved.baseCurrency === "USD" || saved.baseCurrency === "TWD") {
      state.baseCurrency = saved.baseCurrency;
    }
    if (typeof saved.sortMode === "string") {
      state.sortMode = saved.sortMode;
    }
    if (saved.quotes && typeof saved.quotes === "object") {
      state.quotes = Object.fromEntries(
        Object.entries(saved.quotes).filter(([, quote]) =>
          quote && Number.isFinite(Number(quote.price)) && typeof quote.currency === "string"
        )
      );
    }
    if (saved.fx?.rates?.USD && saved.fx?.rates?.TWD) {
      state.fx = saved.fx;
    }
    if (saved.cloud && typeof saved.cloud === "object") {
      state.cloud = {
        ...state.cloud,
        token: typeof saved.cloud.token === "string" ? saved.cloud.token : "",
        gistId: typeof saved.cloud.gistId === "string" ? saved.cloud.gistId : "",
        autoSync: Boolean(saved.cloud.autoSync),
        lastPulledAt: saved.cloud.lastPulledAt || null,
        lastPushedAt: saved.cloud.lastPushedAt || null,
        lastRemoteUpdatedAt: saved.cloud.lastRemoteUpdatedAt || null,
        lastHash: typeof saved.cloud.lastHash === "string" ? saved.cloud.lastHash : ""
      };
    }
  } catch (error) {
    console.warn("Unable to load saved portfolio", error);
  }
}

function saveState(options = {}) {
  const { sync = true } = options;
  const payload = {
    positions: state.positions,
    baseCurrency: state.baseCurrency,
    sortMode: state.sortMode,
    quotes: state.quotes,
    fx: state.fx,
    cloud: {
      token: state.cloud.token,
      gistId: state.cloud.gistId,
      autoSync: state.cloud.autoSync,
      lastPulledAt: state.cloud.lastPulledAt,
      lastPushedAt: state.cloud.lastPushedAt,
      lastRemoteUpdatedAt: state.cloud.lastRemoteUpdatedAt,
      lastHash: state.cloud.lastHash
    }
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  if (sync) scheduleAutoSync();
}

function uid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `asset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeImportedPosition(position) {
  if (!position || typeof position !== "object") return null;
  const quantity = Number(position.quantity);
  const averageCost = Number(position.averageCost);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (!Number.isFinite(averageCost) || averageCost < 0) return null;

  const draft = {
    id: position.id || uid(),
    kind: position.kind || "manual",
    symbol: position.symbol || position.marketSymbol || position.name || "Asset",
    name: position.name || "",
    quantity,
    averageCost,
    costCurrency: position.costCurrency || "QUOTE",
    manualPrice: position.manualPrice,
    manualCurrency: position.manualCurrency || "TWD",
    createdAt: position.createdAt || new Date().toISOString()
  };
  return normalizeDraft(draft, draft.id, draft.createdAt);
}

function normalizeDraft(draft, existingId = uid(), createdAt = new Date().toISOString()) {
  const kind = ["crypto", "us-stock", "tw-stock", "manual"].includes(draft.kind) ? draft.kind : "manual";
  const rawSymbol = String(draft.symbol || "").trim();
  const quantity = Number(draft.quantity);
  const averageCost = Number(draft.averageCost);
  const costCurrency = ["QUOTE", "TWD", "USD"].includes(draft.costCurrency) ? draft.costCurrency : "QUOTE";
  const manualCurrency = draft.manualCurrency === "USD" ? "USD" : "TWD";
  const manualPrice = Number(draft.manualPrice);

  if (!rawSymbol) throw new Error("請輸入資產代號");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("請輸入大於 0 的數量");
  if (!Number.isFinite(averageCost) || averageCost < 0) throw new Error("請輸入有效的平均成本");

  if (kind === "crypto") {
    const meta = getCryptoMeta(rawSymbol);
    return {
      id: existingId,
      kind,
      symbol: meta.symbol,
      marketSymbol: meta.id,
      name: String(draft.name || meta.name).trim() || meta.name,
      quantity,
      averageCost,
      costCurrency,
      manualPrice: null,
      manualCurrency,
      createdAt
    };
  }

  if (kind === "tw-stock") {
    const marketSymbol = normalizeTaiwanSymbol(rawSymbol);
    return {
      id: existingId,
      kind,
      symbol: marketSymbol,
      marketSymbol,
      name: String(draft.name || marketSymbol).trim() || marketSymbol,
      quantity,
      averageCost,
      costCurrency,
      manualPrice: null,
      manualCurrency,
      createdAt
    };
  }

  if (kind === "us-stock") {
    const marketSymbol = rawSymbol.toUpperCase().replace(/\s+/g, "");
    return {
      id: existingId,
      kind,
      symbol: marketSymbol,
      marketSymbol,
      name: String(draft.name || marketSymbol).trim() || marketSymbol,
      quantity,
      averageCost,
      costCurrency,
      manualPrice: null,
      manualCurrency,
      createdAt
    };
  }

  const manualName = String(draft.name || rawSymbol).trim() || rawSymbol;
  return {
    id: existingId,
    kind: "manual",
    symbol: rawSymbol,
    marketSymbol: rawSymbol,
    name: manualName,
    quantity,
    averageCost,
    costCurrency: costCurrency === "QUOTE" ? manualCurrency : costCurrency,
    manualPrice: Number.isFinite(manualPrice) && manualPrice >= 0 ? manualPrice : averageCost,
    manualCurrency,
    createdAt
  };
}

function getCryptoMeta(value) {
  const key = String(value || "").trim().toLowerCase();
  if (CRYPTO_ALIASES[key]) return CRYPTO_ALIASES[key];
  const title = key.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return {
    id: key,
    symbol: key.toUpperCase(),
    name: title || "Crypto"
  };
}

function normalizeTaiwanSymbol(value) {
  const raw = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  if (/^\d{4,6}$/.test(raw)) return `${raw}.TW`;
  return raw;
}

function quoteKey(position) {
  if (position.kind === "crypto") return `crypto:${position.marketSymbol}`;
  if (position.kind === "manual") return `manual:${position.id}`;
  return `stock:${position.marketSymbol}`;
}

function stockKindForSymbol(symbol) {
  const raw = String(symbol || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!raw || CRYPTO_MAP[raw.toLowerCase()]) return null;
  if (/^\d{4,6}(\.(TW|TWO))?$/.test(raw)) return "tw-stock";
  if (GOOGLE_FINANCE_EXCHANGE_HINTS[raw.replace(".B", "")] || /^[A-Z.]{1,5}$/.test(raw)) return "us-stock";
  return null;
}

function getQuote(position) {
  if (position.kind === "manual") {
    return {
      price: Number(position.manualPrice),
      currency: position.manualCurrency || state.baseCurrency,
      changePercent: null,
      source: "手動",
      asOf: Date.now()
    };
  }
  return state.quotes[quoteKey(position)];
}

function formatCurrency(value, currency = state.baseCurrency) {
  if (!Number.isFinite(value)) return "--";
  const abs = Math.abs(value);
  const fractionDigits = currency === "TWD" && abs >= 100 ? 0 : abs >= 1000 ? 2 : 4;
  const formatted = new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    maximumFractionDigits: fractionDigits
  }).format(value);
  return normalizeCurrencyLabel(formatted, currency);
}

function formatCompactCurrency(value, currency = state.baseCurrency) {
  if (!Number.isFinite(value)) return "--";
  const formatted = new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
  return normalizeCurrencyLabel(formatted, currency);
}

function normalizeCurrencyLabel(formatted, currency) {
  if (currency === "TWD") return formatted.includes("NT$") ? formatted : formatted.replace("$", "NT$");
  if (currency === "USD") return formatted.includes("US$") ? formatted : formatted.replace("$", "US$");
  return formatted;
}

function formatNumber(value, maximumFractionDigits = 6) {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits }).format(value);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function valueClass(value) {
  if (!Number.isFinite(value) || value === 0) return "";
  return value > 0 ? "profit-positive" : "profit-negative";
}

function convertCurrency(amount, fromCurrency, toCurrency) {
  const from = (fromCurrency || toCurrency || state.baseCurrency).toUpperCase();
  const to = (toCurrency || state.baseCurrency).toUpperCase();
  if (!Number.isFinite(amount)) return NaN;
  if (from === to) return amount;
  const fromRate = state.fx.rates[from];
  const toRate = state.fx.rates[to];
  if (!fromRate || !toRate) return NaN;
  return (amount / fromRate) * toRate;
}

function calculatePosition(position) {
  const quote = getQuote(position);
  const quoteCurrency = quote?.currency || position.manualCurrency || state.baseCurrency;
  const price = Number(quote?.price);
  const currentValue = Number.isFinite(price)
    ? convertCurrency(price * position.quantity, quoteCurrency, state.baseCurrency)
    : NaN;

  const costCurrency = position.costCurrency === "QUOTE" ? quoteCurrency : position.costCurrency;
  const costValue = convertCurrency(position.averageCost * position.quantity, costCurrency, state.baseCurrency);
  const profit = Number.isFinite(currentValue) && Number.isFinite(costValue) ? currentValue - costValue : NaN;
  const profitPercent = Number.isFinite(profit) && costValue > 0 ? (profit / costValue) * 100 : NaN;

  return {
    quote,
    quoteCurrency,
    currentValue,
    costValue,
    profit,
    profitPercent
  };
}

function calculatePortfolio() {
  return state.positions.reduce(
    (totals, position) => {
      const metrics = calculatePosition(position);
      if (Number.isFinite(metrics.currentValue)) totals.value += metrics.currentValue;
      if (Number.isFinite(metrics.costValue)) totals.cost += metrics.costValue;
      if (Number.isFinite(metrics.currentValue)) totals.quoted += 1;
      return totals;
    },
    { value: 0, cost: 0, quoted: 0 }
  );
}

function render() {
  const totals = calculatePortfolio();
  const profit = totals.value - totals.cost;
  const profitPercent = totals.cost > 0 ? (profit / totals.cost) * 100 : NaN;

  dom.totalValue.textContent = formatCurrency(totals.value);
  dom.totalValue.className = valueClass(totals.value);
  dom.totalCost.textContent = formatCurrency(totals.cost);
  dom.totalCost.className = valueClass(totals.cost);
  dom.totalProfit.textContent = formatCurrency(profit);
  dom.totalProfit.className = valueClass(profit);
  dom.totalProfitPercent.textContent = formatPercent(profitPercent);
  dom.totalProfitPercent.className = valueClass(profitPercent);
  dom.positionCount.textContent = `${state.positions.length} 筆資產`;
  dom.baseCurrencyHint.textContent = `以 ${state.baseCurrency} 顯示`;
  dom.allocationTotal.textContent = formatCurrency(totals.value);
  dom.allocationTotal.className = valueClass(totals.value);
  dom.quoteHealth.textContent = `${totals.quoted}/${state.positions.length}`;

  const fxLabel = state.fx.asOf ? `匯率 ${formatTime(state.fx.asOf)}` : "使用備用匯率";
  dom.fxStatus.textContent = fxLabel;

  if (state.isRefreshing) {
    dom.syncStatus.textContent = "正在同步市場價格...";
  } else if (state.lastSync) {
    dom.syncStatus.textContent = `最近更新 ${formatTime(state.lastSync)}`;
  } else {
    dom.syncStatus.textContent = "尚未同步市場價格";
  }

  renderStatus(totals);
  renderRows();
  updateSortButtons();
  drawAllocationChart();
  updateCurrencyButtons();
  renderCloudSync();
}

function renderStatus(totals) {
  if (!state.positions.length) {
    dom.statusMessage.textContent = "新增資產後會開始追蹤市值與損益。";
    return;
  }

  if (state.quoteErrors.length) {
    const cacheNote = totals.quoted ? "，已保留可用的上次報價" : "";
    dom.statusMessage.textContent = `${state.quoteErrors.length} 個報價暫時無法更新${cacheNote}：${state.quoteErrors.slice(0, 3).join("、")}`;
    return;
  }

  dom.statusMessage.textContent = `已取得 ${totals.quoted} 筆報價，自動刷新間隔 ${Math.round(REFRESH_MS / 60_000)} 分鐘。`;
}

function renderRows() {
  const query = dom.positionSearch.value.trim().toLowerCase();
  const rows = sortRows(state.positions
    .map((position) => ({ position, metrics: calculatePosition(position) }))
    .filter(({ position }) => {
      if (!query) return true;
      return `${position.symbol} ${position.name} ${KIND_LABELS[position.kind]}`.toLowerCase().includes(query);
    }));

  dom.positionsBody.innerHTML = "";
  dom.emptyState.classList.toggle("is-hidden", state.positions.length > 0);

  for (const { position, metrics } of rows) {
    const tr = document.createElement("tr");
    const quote = metrics.quote;
    const quoteCurrency = metrics.quoteCurrency;
    const quotePrice = Number(quote?.price);
    const costCurrency = position.costCurrency === "QUOTE" ? quoteCurrency : position.costCurrency;
    const badgeText = position.symbol.replace(/\..+$/, "").slice(0, 3).toUpperCase();
    const change = Number(quote?.changePercent);
    const quotePriceClass = valueClass(quotePrice);
    const changeClass = valueClass(change);
    const quantityClass = valueClass(position.quantity);
    const averageCostClass = valueClass(position.averageCost);
    const costValueClass = valueClass(metrics.costValue);
    const currentValueClass = valueClass(metrics.currentValue);
    const profitClass = valueClass(metrics.profit);

    tr.innerHTML = `
      <td>
        <div class="asset-cell">
          <span class="asset-badge">${escapeHtml(badgeText)}</span>
          <span class="asset-title">
            <strong>${escapeHtml(position.name)}</strong>
            <small>${escapeHtml(position.symbol)} · ${escapeHtml(KIND_LABELS[position.kind])}</small>
          </span>
        </div>
      </td>
      <td class="${quantityClass}">${formatNumber(position.quantity)}</td>
      <td class="${averageCostClass}">
        ${formatCurrency(position.averageCost, costCurrency)}
        <div class="sub-value ${costValueClass}">${formatCurrency(metrics.costValue)}</div>
      </td>
      <td class="${quotePriceClass}">
        ${Number.isFinite(quotePrice) ? formatCurrency(quotePrice, quoteCurrency) : "--"}
        <div class="sub-value ${changeClass}">
          ${Number.isFinite(change) ? formatPercent(change) : escapeHtml(quote?.source || "等待報價")}
        </div>
      </td>
      <td class="${currentValueClass}">${formatCurrency(metrics.currentValue)}</td>
      <td class="${profitClass}">
        ${formatCurrency(metrics.profit)}
        <div>${formatPercent(metrics.profitPercent)}</div>
      </td>
      <td>
        <div class="row-actions">
          <button class="row-button" type="button" data-action="edit" data-id="${escapeHtml(position.id)}">編輯</button>
          <button class="row-button danger" type="button" data-action="delete" data-id="${escapeHtml(position.id)}">刪除</button>
        </div>
      </td>
    `;
    dom.positionsBody.appendChild(tr);
  }
}

function sortRows(rows) {
  const mode = state.sortMode || "value-desc";
  const [field, direction = "desc"] = mode.split("-");
  const dir = direction === "asc" ? 1 : -1;

  return rows.sort((a, b) => {
    if (field === "asset") {
      const left = `${a.position.symbol} ${a.position.name}`.trim();
      const right = `${b.position.symbol} ${b.position.name}`.trim();
      return left.localeCompare(right, "en", { numeric: true, sensitivity: "base" }) * dir;
    }

    const av = sortValue(a, field);
    const bv = sortValue(b, field);
    const aOk = Number.isFinite(av);
    const bOk = Number.isFinite(bv);
    if (!aOk && !bOk) {
      return a.position.symbol.localeCompare(b.position.symbol, "en", { numeric: true, sensitivity: "base" });
    }
    if (!aOk) return 1;
    if (!bOk) return -1;
    return direction === "asc" ? av - bv : bv - av;
  });
}

function sortValue(row, field) {
  if (field === "quantity") return Number(row.position.quantity);
  if (field === "averageCost") {
    const costCurrency = row.position.costCurrency === "QUOTE" ? row.metrics.quoteCurrency : row.position.costCurrency;
    return convertCurrency(Number(row.position.averageCost), costCurrency, state.baseCurrency);
  }
  if (field === "price") {
    const quotePrice = Number(row.metrics.quote?.price);
    return convertCurrency(quotePrice, row.metrics.quoteCurrency, state.baseCurrency);
  }
  if (field === "profit") return Number(row.metrics.profit);
  if (field === "profitPercent") return Number(row.metrics.profitPercent);
  return Number(row.metrics.currentValue);
}

function parseSortMode() {
  const [field = "value", rawDirection] = String(state.sortMode || "").split("-");
  return {
    field,
    direction: rawDirection === "asc" ? "asc" : "desc"
  };
}

function setSortField(field) {
  const current = parseSortMode();
  const defaultDirection = SORT_DEFAULT_DIRECTIONS[field] || "desc";
  const direction = current.field === field ? (current.direction === "asc" ? "desc" : "asc") : defaultDirection;
  state.sortMode = `${field}-${direction}`;
  saveState();
  renderRows();
  updateSortButtons();
}

function updateSortButtons() {
  const { field, direction } = parseSortMode();
  dom.sortButtons.forEach((button) => {
    const isActive = button.dataset.sortField === field;
    const label = button.textContent.trim().replace(/[↕↑↓]/g, "");
    button.classList.toggle("is-active", isActive);
    button.dataset.sortDirection = isActive ? direction : "";
    button.setAttribute("aria-label", `${label}排序，${isActive ? (direction === "asc" ? "目前低到高" : "目前高到低") : "未排序"}`);
  });
}

function drawAllocationChart(updateLegend = true) {
  const canvas = dom.allocationChart;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssSize = 260;
  canvas.width = cssSize * dpr;
  canvas.height = cssSize * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssSize, cssSize);

  const items = state.positions
    .map((position) => ({ position, value: calculatePosition(position).currentValue }))
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = items.reduce((sum, item) => sum + item.value, 0);
  const chartItems = getAllocationItems(items);
  const cx = cssSize / 2;
  const cy = cssSize / 2;
  const radius = 92;
  const width = 26;

  if (!total) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.lineWidth = width;
    ctx.strokeStyle = "#dfe7df";
    ctx.stroke();
    ctx.fillStyle = "#647067";
    ctx.font = "700 16px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No Data", cx, cy + 5);
    renderAllocationInsights([], 0);
    if (updateLegend) dom.allocationLegend.innerHTML = `<small>尚無可繪製的市值資料</small>`;
    return;
  }

  const activeKey = getActiveAllocationKey(chartItems);
  let start = -Math.PI / 2;
  const segments = chartItems.map((item, index) => {
    const angle = (item.value / total) * Math.PI * 2;
    const segment = { item, index, start, end: start + angle };
    start += angle;
    return segment;
  });

  const drawSegment = (segment, isActive) => {
    ctx.beginPath();
    ctx.save();
    ctx.globalAlpha = activeKey && !isActive ? 0.44 : 1;
    ctx.arc(cx, cy, isActive ? radius + 9 : radius, segment.start, segment.end);
    ctx.lineWidth = isActive ? width + 9 : width;
    ctx.lineCap = "round";
    ctx.strokeStyle = CHART_COLORS[segment.index % CHART_COLORS.length];
    if (isActive) {
      ctx.shadowColor = "rgba(11, 122, 117, 0.34)";
      ctx.shadowBlur = 12;
    }
    ctx.stroke();
    ctx.restore();
  };

  segments.filter((segment) => segment.item.key !== activeKey).forEach((segment) => drawSegment(segment, false));
  const activeSegment = segments.find((segment) => segment.item.key === activeKey);
  if (activeSegment) drawSegment(activeSegment, true);

  ctx.fillStyle = "#19211e";
  ctx.font = "800 20px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(formatCompactCurrency(total), cx, cy - 3);
  ctx.fillStyle = "#647067";
  ctx.font = "700 12px system-ui, sans-serif";
  ctx.fillText(state.baseCurrency, cx, cy + 19);

  renderAllocationInsights(items, total);

  if (updateLegend) {
    dom.allocationLegend.innerHTML = chartItems
      .map((item, index) => {
        const pct = (item.value / total) * 100;
        const color = CHART_COLORS[index % CHART_COLORS.length];
        const isActive = item.key === activeKey;
        const isPinned = item.key === state.allocationPinnedKey;
        return `
          <div class="legend-row${isActive ? " is-active" : ""}" data-allocation-key="${escapeHtml(item.key)}" role="button" tabindex="0" aria-pressed="${isPinned}">
            <span class="legend-dot" style="background:${color}"></span>
            <strong>${escapeHtml(item.label)}</strong>
            <span class="legend-market-value">${formatCurrency(item.value)}</span>
            <span class="legend-percent">${pct.toFixed(1)}%</span>
          </div>
        `;
      })
      .join("");
  } else {
    updateAllocationLegendActive(activeKey);
  }
}

function getActiveAllocationKey(items) {
  const key = state.allocationHoverKey || state.allocationPinnedKey;
  return key && items.some((item) => item.key === key) ? key : null;
}

function setAllocationHoverKey(key) {
  if (state.allocationHoverKey === key) return;
  state.allocationHoverKey = key;
  drawAllocationChart(false);
}

function toggleAllocationPinnedKey(key) {
  state.allocationPinnedKey = state.allocationPinnedKey === key ? null : key;
  drawAllocationChart(false);
}

function updateAllocationLegendActive(activeKey) {
  dom.allocationLegend.querySelectorAll(".legend-row[data-allocation-key]").forEach((row) => {
    const isActive = row.dataset.allocationKey === activeKey;
    const isPinned = row.dataset.allocationKey === state.allocationPinnedKey;
    row.classList.toggle("is-active", isActive);
    row.setAttribute("aria-pressed", String(isPinned));
  });
}

function renderAllocationInsights(items, total) {
  if (!dom.allocationInsights) return;
  if (!total) {
    dom.allocationInsights.innerHTML = `
      <div class="insight-row">
        <span class="insight-label">配置洞察</span>
        <span class="insight-value">--</span>
      </div>
    `;
    return;
  }

  const largest = items[0];
  const largestPercent = (largest.value / total) * 100;
  const topThreeValue = items.slice(0, 3).reduce((sum, item) => sum + item.value, 0);
  const topThreePercent = (topThreeValue / total) * 100;
  const kindTotals = items.reduce((totals, item) => {
    const label = KIND_LABELS[item.position.kind] || "其他";
    totals.set(label, (totals.get(label) || 0) + item.value);
    return totals;
  }, new Map());
  const kindRows = [...kindTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, value], index) => {
      const pct = (value / total) * 100;
      const color = CHART_COLORS[(index + 3) % CHART_COLORS.length];
      return `
        <div class="mix-bar">
          <span class="mix-bar-label">${escapeHtml(label)}</span>
          <span class="mix-bar-track"><span class="mix-bar-fill" style="width:${pct.toFixed(1)}%;background:${color}"></span></span>
          <span class="mix-bar-percent">${pct.toFixed(1)}%</span>
        </div>
      `;
    })
    .join("");

  dom.allocationInsights.innerHTML = `
    <div class="insight-row">
      <span class="insight-label">最大部位 ${escapeHtml(largest.position.symbol)}</span>
      <span class="insight-value">${largestPercent.toFixed(1)}%</span>
    </div>
    <div class="insight-row">
      <span class="insight-label">前三大集中</span>
      <span class="insight-value">${topThreePercent.toFixed(1)}%</span>
    </div>
    <div class="insight-row">
      <span class="insight-label">可計價部位</span>
      <span class="insight-value">${items.length}/${state.positions.length}</span>
    </div>
    <div class="insight-row">
      <span class="insight-label">${escapeHtml(largest.position.symbol)} 市值</span>
      <span class="insight-value">${formatCompactCurrency(largest.value)}</span>
    </div>
    <div class="mix-bars">
      ${kindRows}
    </div>
  `;
}

function getAllocationItems(items) {
  const topItems = items.slice(0, ALLOCATION_LIMIT).map((item) => ({
    key: `position:${item.position.id || item.position.symbol}`,
    label: item.position.symbol,
    value: item.value
  }));
  const otherValue = items.slice(ALLOCATION_LIMIT).reduce((sum, item) => sum + item.value, 0);
  if (otherValue > 0) {
    topItems.push({ key: "other", label: "其他", value: otherValue });
  }
  return topItems;
}

function updateCurrencyButtons() {
  dom.baseButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.baseCurrency === state.baseCurrency);
  });
}

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function refreshPrices() {
  if (state.isRefreshing) return;
  state.isRefreshing = true;
  state.quoteErrors = [];
  dom.refreshButton.disabled = true;
  render();

  try {
    await fetchFxRates();
    await fetchMarketQuotes();
    state.lastSync = Date.now();
    saveState();
  } finally {
    state.isRefreshing = false;
    dom.refreshButton.disabled = false;
    render();
  }
}

async function fetchFxRates() {
  try {
    const data = await fetchJson("https://open.er-api.com/v6/latest/USD", { fallbackProxy: false });
    if (!data?.rates?.TWD) throw new Error("Missing TWD rate");
    state.fx = {
      rates: {
        USD: 1,
        TWD: Number(data.rates.TWD)
      },
      asOf: Date.now(),
      source: "open.er-api.com"
    };
  } catch (error) {
    state.quoteErrors.push("匯率");
    if (!state.fx.rates?.TWD) {
      state.fx = {
        rates: { USD: 1, TWD: FALLBACK_USD_TWD },
        asOf: null,
        source: "fallback"
      };
    }
    console.warn("FX update failed", error);
  }
}

async function fetchMarketQuotes() {
  const nextQuotes = { ...state.quotes };
  state.quotes = nextQuotes;
  const cryptoIds = [...new Set(state.positions.filter((p) => p.kind === "crypto").map((p) => p.marketSymbol))];
  const stockPositions = state.positions.filter((p) => p.kind === "us-stock" || p.kind === "tw-stock");
  const stockTargets = [
    ...stockPositions.reduce((targets, position) => {
      const symbol = position.marketSymbol || position.symbol;
      if (symbol) targets.set(symbol, position.kind);
      return targets;
    }, new Map())
  ];

  if (cryptoIds.length) {
    try {
      const cryptoQuotes = await fetchCryptoQuotes(cryptoIds);
      Object.assign(nextQuotes, cryptoQuotes);
      render();
    } catch (error) {
      console.warn("Crypto quote update failed", error);
    }
    const missingCryptoIds = cryptoIds.filter((id) => !nextQuotes[`crypto:${id}`]);
    await mapWithConcurrency(missingCryptoIds, 3, async (id) => {
      const key = `crypto:${id}`;
      const kind = stockKindForSymbol(id);
      if (!kind) {
        if (!nextQuotes[key]) state.quoteErrors.push(id);
        return;
      }
      try {
        nextQuotes[key] = await fetchStockQuote(id.toUpperCase(), kind);
        render();
      } catch (error) {
        if (!nextQuotes[key]) state.quoteErrors.push(id);
        console.warn(`Stock fallback failed for ${id}`, error);
        render();
      }
    });
  }

  if (stockTargets.length) {
    const orderedTargets = prioritizeMissingQuotes(stockTargets, nextQuotes);
    await mapWithConcurrency(orderedTargets, STOCK_QUOTE_CONCURRENCY, async ([symbol, kind], index) => {
      const key = `stock:${symbol}`;
      if (index > 0) await sleep(STOCK_QUOTE_DELAY_MS);
      try {
        nextQuotes[key] = await withRetry(() => fetchStockQuote(symbol, kind), 2, STOCK_QUOTE_DELAY_MS);
      } catch (error) {
        if (!nextQuotes[key]) state.quoteErrors.push(symbol);
        console.warn(`Stock quote failed for ${symbol}`, error);
      }
      render();
    });
  }

  state.quotes = nextQuotes;
}

async function mapWithConcurrency(items, limit, task) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await task(item, index - 1);
    }
  });
  await Promise.all(workers);
}

function prioritizeMissingQuotes(targets, quotes) {
  return shuffleCopy(targets).sort(([left], [right]) => {
    const leftCached = Boolean(quotes[`stock:${left}`]);
    const rightCached = Boolean(quotes[`stock:${right}`]);
    return Number(leftCached) - Number(rightCached);
  });
}

function shuffleCopy(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

async function withRetry(task, attempts = 2, delayMs = 1_000) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await sleep(delayMs * (attempt + 1));
    }
  }
  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCryptoQuotes(ids) {
  const quotes = {};
  const coinGeckoIds = ids.filter((id) => !getOkxCryptoConfig(id));
  const okxIds = ids.filter((id) => getOkxCryptoConfig(id));

  if (coinGeckoIds.length) {
    try {
      const url = new URL("https://api.coingecko.com/api/v3/simple/price");
      url.searchParams.set("ids", coinGeckoIds.join(","));
      url.searchParams.set("vs_currencies", "usd,twd");
      url.searchParams.set("include_24hr_change", "true");
      url.searchParams.set("include_last_updated_at", "true");
      const data = await fetchJson(url.toString(), { fallbackProxy: true });

      coinGeckoIds.forEach((id) => {
        const item = data[id];
        if (!item) {
          return;
        }
        const base = state.baseCurrency.toLowerCase();
        const price = Number(item[base] ?? item.usd);
        const currency = item[base] ? state.baseCurrency : "USD";
        quotes[`crypto:${id}`] = {
          price,
          currency,
          changePercent: Number(item[`${base}_24h_change`] ?? item.usd_24h_change),
          source: "CoinGecko",
          asOf: item.last_updated_at ? item.last_updated_at * 1000 : Date.now()
        };
      });
    } catch (error) {
      console.warn("CoinGecko quote update failed", error);
    }
  }

  await Promise.all(
    okxIds.map(async (id) => {
      try {
        quotes[`crypto:${id}`] = await fetchOkxCryptoQuote(id);
      } catch (error) {
        console.warn(`OKX quote failed for ${id}`, error);
      }
    })
  );

  return quotes;
}

function getOkxCryptoConfig(id) {
  return OKX_CRYPTO_QUOTES[String(id || "").trim().toLowerCase()] || null;
}

async function fetchOkxCryptoQuote(id) {
  const config = getOkxCryptoConfig(id);
  if (!config) throw new Error("Unknown OKX crypto");
  const url = `https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(config.instId)}`;
  const data = await fetchJson(url, { fallbackProxy: true, timeoutMs: 8_000 });
  const ticker = data?.data?.[0];
  const price = Number(ticker?.last);
  if (data?.code !== "0" || !Number.isFinite(price)) throw new Error("OKX ticker missing price");
  const open24h = Number(ticker.open24h);
  return {
    price,
    currency: "USD",
    changePercent: open24h > 0 ? ((price - open24h) / open24h) * 100 : null,
    source: `OKX ${config.instId}`,
    asOf: Number(ticker.ts) || Date.now()
  };
}

async function fetchStockQuote(symbol, kind) {
  if (kind === "tw-stock") {
    try {
      return await fetchTwseQuote(symbol);
    } catch (twseError) {
      console.warn(`TWSE quote failed for ${symbol}`, twseError);
    }
  }

  try {
    return await fetchYahooQuote(symbol, kind);
  } catch (yahooError) {
    console.warn(`Yahoo quote failed for ${symbol}`, yahooError);
  }

  return fetchGoogleFinanceQuote(symbol, kind);
}

async function fetchGoogleFinanceQuote(symbol, kind) {
  const targets = getGoogleFinanceTargets(symbol, kind);
  let lastError = null;

  for (const target of targets) {
    try {
      const quotePath = `${encodeURIComponent(target.symbol)}:${encodeURIComponent(target.exchange)}`;
      const markdown = await fetchText(`${GOOGLE_FINANCE_READER_BASE}${quotePath}`, { timeoutMs: 14_000 });
      return parseGoogleFinanceQuote(markdown, target.symbol, target.exchange, kind);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Google Finance quote not found");
}

function getGoogleFinanceTargets(symbol, kind) {
  const raw = String(symbol || "").trim().toUpperCase().replace(/\s+/g, "");
  const parsed = parseGoogleFinanceSymbol(raw);
  if (parsed) return [parsed];

  const clean = raw.replace(/\.(TW|TWO)$/i, "");
  if (kind === "tw-stock") {
    const exchanges = raw.endsWith(".TWO") ? ["TWO", "TPE"] : ["TPE", "TWO"];
    return exchanges.map((exchange) => ({ symbol: clean, exchange }));
  }

  const hintedExchange = GOOGLE_FINANCE_EXCHANGE_HINTS[clean.replace(".B", "")] || GOOGLE_FINANCE_EXCHANGE_HINTS[clean];
  const exchanges = hintedExchange
    ? [hintedExchange, ...DEFAULT_GOOGLE_US_EXCHANGES.filter((exchange) => exchange !== hintedExchange)]
    : DEFAULT_GOOGLE_US_EXCHANGES;
  return exchanges.map((exchange) => ({ symbol: clean, exchange }));
}

function parseGoogleFinanceSymbol(value) {
  const parts = String(value || "").split(":").filter(Boolean);
  if (parts.length !== 2) return null;

  const [first, second] = parts;
  if (isGoogleExchange(first)) return { symbol: second, exchange: first };
  if (isGoogleExchange(second)) return { symbol: first, exchange: second };
  return null;
}

function isGoogleExchange(value) {
  return ["NASDAQ", "NYSE", "NYSEARCA", "NYSEAMERICAN", "TPE", "TWO"].includes(value);
}

function parseGoogleFinanceQuote(markdown, symbol, exchange, kind) {
  const marker = `${symbol}:${exchange}`;
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const exactMarkerLine = lines.findIndex((line) => line === marker);
  const markerLine = exactMarkerLine !== -1
    ? exactMarkerLine
    : lines.findIndex((line) => line.includes(marker));
  if (markerLine === -1) throw new Error(`Missing ${marker}`);

  const priceLine = lines.findIndex((line, index) => index > markerLine && parseMoneyValue(line) !== null);
  if (priceLine === -1) throw new Error(`Missing price for ${marker}`);

  const price = parseMoneyValue(lines[priceLine]);
  const percentLine = lines.slice(priceLine + 1, priceLine + 10).find((line) => /[+-]?\d+(?:\.\d+)?%/.test(line));
  const percentMatch = percentLine?.match(/([+-]?\d+(?:\.\d+)?)%/);
  const currencyLine = lines.find((line) => /\b(USD|TWD)\b/.test(line));
  const currency = currencyLine?.match(/\b(USD|TWD)\b/)?.[1] || (kind === "tw-stock" ? "TWD" : "USD");

  return {
    price,
    currency,
    changePercent: percentMatch ? Number(percentMatch[1]) : null,
    source: `Google Finance ${exchange}`,
    asOf: Date.now()
  };
}

function parseMoneyValue(value) {
  const match = String(value || "").match(/^(?:US\$|NT\$|\$)?\s*([0-9][0-9,]*(?:\.\d+)?)$/);
  if (!match) return null;
  const price = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(price) ? price : null;
}

async function fetchTwseQuote(symbol) {
  const clean = String(symbol || "").trim().toUpperCase().replace(/\.(TW|TWO)$/i, "");
  const exchange = String(symbol || "").toUpperCase().endsWith(".TWO") ? "otc" : "tse";
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${exchange}_${clean}.tw&json=1&delay=0`;
  const data = await fetchJson(url, { fallbackProxy: true, timeoutMs: 5_000 });
  const item = data?.msgArray?.[0];
  if (!item) throw new Error("Missing TWSE quote");

  const price = firstFiniteNumber(item.z, item.pz, item.y);
  const previousClose = firstFiniteNumber(item.y);
  if (!Number.isFinite(price)) throw new Error("Missing TWSE price");

  return {
    price,
    currency: "TWD",
    changePercent: Number.isFinite(previousClose) && previousClose > 0
      ? ((price - previousClose) / previousClose) * 100
      : null,
    source: "TWSE",
    asOf: Number(item.tlong) || Date.now()
  };
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const number = Number(String(value ?? "").replaceAll(",", ""));
    if (Number.isFinite(number)) return number;
  }
  return NaN;
}

function getYahooSymbol(symbol, kind) {
  const raw = String(symbol || "").trim().toUpperCase().replace(/\s+/g, "");
  if (kind === "tw-stock") {
    const clean = raw.replace(/\.(TW|TWO)$/i, "");
    return raw.endsWith(".TWO") ? `${clean}.TWO` : `${clean}.TW`;
  }
  return raw.replace(".B", "-B").replace(/\./g, "-");
}

async function fetchYahooQuote(symbol, kind) {
  const yahooSymbol = getYahooSymbol(symbol, kind);
  const encoded = encodeURIComponent(yahooSymbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=1d&interval=1m`;
  const data = await fetchJson(url, { fallbackProxy: true, timeoutMs: 5_000 });
  const error = data?.chart?.error;
  if (error) throw new Error(error.description || "Yahoo Finance error");

  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta) throw new Error("Missing quote metadata");

  const price = Number(meta.regularMarketPrice ?? meta.previousClose ?? meta.chartPreviousClose);
  if (!Number.isFinite(price)) throw new Error("Missing market price");

  const previousClose = Number(meta.chartPreviousClose ?? meta.previousClose);
  const changePercent = Number.isFinite(previousClose) && previousClose > 0
    ? ((price - previousClose) / previousClose) * 100
    : null;

  return {
    price,
    currency: meta.currency || (yahooSymbol.endsWith(".TW") || yahooSymbol.endsWith(".TWO") ? "TWD" : "USD"),
    changePercent,
    source: "Yahoo Finance",
    asOf: meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now()
  };
}

async function fetchText(url, options = {}) {
  const { timeoutMs = 12_000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, options = {}) {
  const { fallbackProxy = false, timeoutMs = 12_000 } = options;
  try {
    return await fetchJsonDirect(url, timeoutMs);
  } catch (error) {
    if (!fallbackProxy) throw error;
    try {
      return parseJsonFromText(await fetchText(`https://r.jina.ai/http://${url}`, { timeoutMs }));
    } catch (readerError) {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      return fetchJsonDirect(proxyUrl, timeoutMs);
    }
  }
}

function parseJsonFromText(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("Missing JSON payload");
  return JSON.parse(text.slice(start, end + 1));
}

async function fetchJsonDirect(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function handleSubmit(event) {
  event.preventDefault();
  try {
    const editingId = dom.editingId.value;
    const existing = state.positions.find((position) => position.id === editingId);
    const position = normalizeDraft(
      {
        kind: dom.assetKind.value,
        symbol: dom.assetSymbol.value,
        name: dom.assetName.value,
        quantity: dom.assetQuantity.value,
        averageCost: dom.assetAverageCost.value,
        costCurrency: dom.costCurrency.value,
        manualPrice: dom.manualPrice.value,
        manualCurrency: dom.manualCurrency.value
      },
      editingId || uid(),
      existing?.createdAt || new Date().toISOString()
    );

    if (editingId) {
      state.positions = state.positions.map((item) => (item.id === editingId ? position : item));
    } else {
      state.positions.push(position);
    }

    saveState();
    resetForm();
    render();
    refreshPrices();
  } catch (error) {
    window.alert(error.message || "無法儲存資產");
  }
}

function editPosition(id) {
  const position = state.positions.find((item) => item.id === id);
  if (!position) return;
  dom.editingId.value = position.id;
  dom.assetKind.value = position.kind;
  dom.assetSymbol.value = position.kind === "crypto" ? position.symbol : position.marketSymbol || position.symbol;
  dom.assetName.value = position.name;
  dom.assetQuantity.value = position.quantity;
  dom.assetAverageCost.value = position.averageCost;
  dom.costCurrency.value = position.costCurrency;
  dom.manualPrice.value = position.manualPrice ?? "";
  dom.manualCurrency.value = position.manualCurrency || "TWD";
  dom.formTitle.textContent = "編輯資產";
  dom.submitAssetButton.textContent = "更新資產";
  dom.cancelEditButton.classList.remove("is-hidden");
  updateKindMode();
  dom.assetSymbol.focus();
}

function deletePosition(id) {
  const position = state.positions.find((item) => item.id === id);
  if (!position) return;
  if (!window.confirm(`刪除 ${position.name}？`)) return;
  state.positions = state.positions.filter((item) => item.id !== id);
  delete state.quotes[quoteKey(position)];
  saveState();
  render();
}

function resetForm() {
  dom.form.reset();
  dom.editingId.value = "";
  dom.assetKind.value = "us-stock";
  dom.costCurrency.value = "QUOTE";
  dom.formTitle.textContent = "新增資產";
  dom.submitAssetButton.textContent = "新增資產";
  dom.cancelEditButton.classList.add("is-hidden");
  updateKindMode();
}

function updateKindMode() {
  const kind = dom.assetKind.value;
  dom.form.classList.toggle("manual-mode", kind === "manual");
  dom.manualPrice.required = kind === "manual";
  if (kind === "crypto") {
    dom.assetSymbol.placeholder = "BTC, ETH, bitcoin";
    if (!dom.editingId.value) dom.costCurrency.value = "QUOTE";
  }
  if (kind === "us-stock") {
    dom.assetSymbol.placeholder = "AAPL, TSLA, NVDA";
    if (!dom.editingId.value) dom.costCurrency.value = "QUOTE";
  }
  if (kind === "tw-stock") {
    dom.assetSymbol.placeholder = "2330 或 0050.TW";
    if (!dom.editingId.value) dom.costCurrency.value = "QUOTE";
  }
  if (kind === "manual") {
    dom.assetSymbol.placeholder = "現金、基金、房產";
    if (!dom.editingId.value) {
      dom.costCurrency.value = "TWD";
      dom.manualCurrency.value = "TWD";
    }
  }
}

function exportPortfolio() {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "wealthtrack",
    version: 1,
    baseCurrency: state.baseCurrency,
    positions: state.positions
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `wealthtrack-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importPortfolio(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result || "{}"));
      const positions = Array.isArray(payload.positions) ? payload.positions : [];
      if (!positions.length) throw new Error("檔案裡沒有資產資料");
      state.positions = positions.map(normalizeImportedPosition).filter(Boolean);
      if (payload.baseCurrency === "USD" || payload.baseCurrency === "TWD") {
        state.baseCurrency = payload.baseCurrency;
      }
      saveState();
      resetForm();
      render();
      refreshPrices();
    } catch (error) {
      window.alert(error.message || "匯入失敗");
    } finally {
      dom.importFile.value = "";
    }
  };
  reader.readAsText(file);
}

function getCloudSettingsFromForm() {
  const token = dom.syncToken.value.trim();
  if (token) state.cloud.token = token;
  state.cloud.gistId = dom.syncGistId.value.trim();
  state.cloud.autoSync = dom.syncAuto.checked;
}

function portfolioSyncData() {
  return {
    baseCurrency: state.baseCurrency,
    sortMode: state.sortMode,
    positions: state.positions
  };
}

function portfolioSyncHash() {
  return JSON.stringify(portfolioSyncData());
}

function buildCloudPayload() {
  return {
    app: "wealthtrack",
    version: 2,
    updatedAt: new Date().toISOString(),
    ...portfolioSyncData()
  };
}

function setCloudStatus(message, busy = false) {
  state.cloud.status = message;
  state.cloud.busy = busy;
  renderCloudSync();
}

function cloudStatusText() {
  if (state.cloud.status) return state.cloud.status;
  if (!state.cloud.token) return "尚未設定";
  if (state.cloud.lastPushedAt) return `已上傳 ${formatTime(state.cloud.lastPushedAt)}`;
  if (state.cloud.lastPulledAt) return `已下載 ${formatTime(state.cloud.lastPulledAt)}`;
  if (state.cloud.gistId) return "已連線";
  return "尚未建立同步檔";
}

function renderCloudSync() {
  if (!dom.syncToken) return;
  if (document.activeElement !== dom.syncToken) {
    dom.syncToken.value = "";
    dom.syncToken.placeholder = state.cloud.token ? "已設定，可貼新 token 更新" : "需要 gist 權限";
  }
  if (document.activeElement !== dom.syncGistId) dom.syncGistId.value = state.cloud.gistId || "";
  dom.syncAuto.checked = Boolean(state.cloud.autoSync);
  dom.cloudSyncStatus.textContent = state.cloud.busy ? "雲端同步中..." : cloudStatusText();
  const tokenStatus = state.cloud.token ? "Token 已設定" : "Token 尚未設定";
  dom.syncTokenState.textContent = tokenStatus;
  dom.tokenSettingsSummary.textContent = `${tokenStatus}${state.cloud.autoSync ? "，自動同步開啟" : ""}`;

  const hasToken = Boolean(state.cloud.token || dom.syncToken.value.trim());
  dom.cloudUploadButton.disabled = state.cloud.busy || !hasToken;
  dom.cloudDownloadButton.disabled = state.cloud.busy || !hasToken;
  dom.syncSaveButton.disabled = state.cloud.busy;
  dom.syncClearTokenButton.disabled = state.cloud.busy || !state.cloud.token;
}

function scheduleAutoSync() {
  if (!state.cloud.autoSync || !state.cloud.token || state.cloud.busy) return;
  const hash = portfolioSyncHash();
  if (hash === state.cloud.lastHash) return;
  clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(() => {
    uploadCloudSync({ silent: true }).catch((error) => {
      console.warn("Auto sync failed", error);
      setCloudStatus("自動同步失敗");
    });
  }, AUTO_SYNC_DEBOUNCE_MS);
}

async function githubRequest(path, options = {}) {
  const token = state.cloud.token || dom.syncToken.value.trim();
  if (!token) throw new Error("請先輸入 GitHub token");
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || `GitHub HTTP ${response.status}`);
  return data;
}

async function findCloudGist() {
  if (state.cloud.gistId) {
    return githubRequest(`/gists/${encodeURIComponent(state.cloud.gistId)}`);
  }

  for (let page = 1; page <= 3; page += 1) {
    const gists = await githubRequest(`/gists?per_page=100&page=${page}`);
    const found = Array.isArray(gists)
      ? gists.find((gist) => gist.files && Object.prototype.hasOwnProperty.call(gist.files, SYNC_FILE_NAME))
      : null;
    if (found) {
      state.cloud.gistId = found.id;
      return githubRequest(`/gists/${encodeURIComponent(found.id)}`);
    }
    if (!Array.isArray(gists) || gists.length < 100) break;
  }

  return null;
}

async function ensureCloudGist() {
  const existing = await findCloudGist();
  if (existing) return existing;
  const payload = buildCloudPayload();
  return githubRequest("/gists", {
    method: "POST",
    body: {
      description: SYNC_GIST_DESCRIPTION,
      public: false,
      files: {
        [SYNC_FILE_NAME]: {
          content: JSON.stringify(payload, null, 2)
        }
      }
    }
  });
}

async function readCloudPayload(gist) {
  const file = gist?.files?.[SYNC_FILE_NAME];
  if (!file) throw new Error("找不到同步檔");
  let content = file.content;
  if (!content && file.raw_url) {
    const response = await fetch(file.raw_url, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${state.cloud.token}` }
    });
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
    content = await response.text();
  }
  const payload = JSON.parse(content || "{}");
  if (payload.app !== "wealthtrack" || !Array.isArray(payload.positions)) {
    throw new Error("雲端同步檔格式不正確");
  }
  return payload;
}

function applyCloudPayload(payload) {
  state.positions = payload.positions.map(normalizeImportedPosition).filter(Boolean);
  if (payload.baseCurrency === "USD" || payload.baseCurrency === "TWD") {
    state.baseCurrency = payload.baseCurrency;
  }
  if (typeof payload.sortMode === "string") {
    state.sortMode = payload.sortMode;
  }
  state.cloud.lastPulledAt = Date.now();
  state.cloud.lastRemoteUpdatedAt = payload.updatedAt || null;
  state.cloud.lastHash = portfolioSyncHash();
  saveState({ sync: false });
  resetForm();
  render();
  refreshPrices();
}

async function uploadCloudSync(options = {}) {
  const { silent = false } = options;
  getCloudSettingsFromForm();
  setCloudStatus("雲端同步中...", true);
  try {
    const gist = await ensureCloudGist();
    state.cloud.gistId = gist.id;
    const payload = buildCloudPayload();
    await githubRequest(`/gists/${encodeURIComponent(gist.id)}`, {
      method: "PATCH",
      body: {
        description: SYNC_GIST_DESCRIPTION,
        files: {
          [SYNC_FILE_NAME]: {
            content: JSON.stringify(payload, null, 2)
          }
        }
      }
    });
    state.cloud.lastPushedAt = Date.now();
    state.cloud.lastRemoteUpdatedAt = payload.updatedAt;
    state.cloud.lastHash = portfolioSyncHash();
    state.cloud.status = silent ? "已自動上傳" : "已上傳雲端";
    saveState({ sync: false });
    renderCloudSync();
  } catch (error) {
    state.cloud.status = "上傳失敗";
    renderCloudSync();
    if (!silent) window.alert(error.message || "上傳雲端失敗");
    throw error;
  } finally {
    state.cloud.busy = false;
    renderCloudSync();
  }
}

async function downloadCloudSync(options = {}) {
  const { silent = false, overwrite = true } = options;
  getCloudSettingsFromForm();
  setCloudStatus("雲端同步中...", true);
  try {
    const gist = await findCloudGist();
    if (!gist) throw new Error("找不到同步檔，請先在有資料的裝置按上傳雲端");
    state.cloud.gistId = gist.id;
    const payload = await readCloudPayload(gist);
    const remoteTime = payload.updatedAt ? Date.parse(payload.updatedAt) : 0;
    const lastRemoteTime = state.cloud.lastRemoteUpdatedAt ? Date.parse(state.cloud.lastRemoteUpdatedAt) : 0;
    const localChanged = Boolean(state.positions.length) && state.cloud.lastHash && portfolioSyncHash() !== state.cloud.lastHash;

    if (!overwrite && state.positions.length && !state.cloud.lastHash) {
      state.cloud.status = "請手動選擇上傳或下載";
      saveState({ sync: false });
      renderCloudSync();
      return;
    }
    if (!overwrite && localChanged && remoteTime > lastRemoteTime) {
      state.cloud.status = "雲端與本機都有變更";
      saveState({ sync: false });
      renderCloudSync();
      return;
    }
    if (!overwrite && remoteTime <= lastRemoteTime && state.positions.length) {
      state.cloud.status = "已是最新";
      saveState({ sync: false });
      renderCloudSync();
      return;
    }

    applyCloudPayload(payload);
    state.cloud.status = silent ? "已自動下載" : "已下載雲端";
    saveState({ sync: false });
    renderCloudSync();
  } catch (error) {
    state.cloud.status = "下載失敗";
    renderCloudSync();
    if (!silent) window.alert(error.message || "下載雲端失敗");
    throw error;
  } finally {
    state.cloud.busy = false;
    renderCloudSync();
  }
}

async function saveCloudSettings() {
  getCloudSettingsFromForm();
  dom.syncToken.value = "";
  state.cloud.status = state.cloud.token ? "同步設定已儲存" : "尚未設定";
  saveState({ sync: false });
  renderCloudSync();
  if (state.cloud.autoSync && state.cloud.token) {
    downloadCloudSync({ silent: true, overwrite: false }).catch((error) => {
      console.warn("Initial cloud sync failed", error);
    });
  }
}

function showMenuPanel(panel) {
  const showTokenSettings = panel === "token";
  dom.menuMainPanel.classList.toggle("is-hidden", showTokenSettings);
  dom.tokenSettingsPanel.classList.toggle("is-hidden", !showTokenSettings);
}

function openTokenSettings() {
  showMenuPanel("token");
  renderCloudSync();
}

function openMenu() {
  dom.appMenu.classList.remove("is-hidden");
  dom.menuBackdrop.classList.remove("is-hidden");
  dom.menuButton.setAttribute("aria-expanded", "true");
  showMenuPanel("main");
  renderCloudSync();
}

function closeMenu() {
  dom.appMenu.classList.add("is-hidden");
  dom.menuBackdrop.classList.add("is-hidden");
  dom.menuButton.setAttribute("aria-expanded", "false");
  showMenuPanel("main");
}

function clearCloudToken() {
  if (!state.cloud.token) return;
  if (!window.confirm("清除這台裝置儲存的 GitHub Token？")) return;
  state.cloud.token = "";
  state.cloud.autoSync = false;
  state.cloud.status = "Token 已清除";
  dom.syncToken.value = "";
  saveState({ sync: false });
  renderCloudSync();
}

function bindEvents() {
  dom.form.addEventListener("submit", handleSubmit);
  dom.assetKind.addEventListener("change", updateKindMode);
  dom.refreshButton.addEventListener("click", refreshPrices);
  dom.menuButton.addEventListener("click", openMenu);
  dom.closeMenuButton.addEventListener("click", closeMenu);
  dom.menuBackdrop.addEventListener("click", closeMenu);
  dom.tokenSettingsButton.addEventListener("click", openTokenSettings);
  dom.backToMenuButton.addEventListener("click", () => showMenuPanel("main"));
  dom.cancelEditButton.addEventListener("click", resetForm);
  dom.exportButton.addEventListener("click", exportPortfolio);
  dom.importButton.addEventListener("click", () => dom.importFile.click());
  dom.importFile.addEventListener("change", () => importPortfolio(dom.importFile.files[0]));
  dom.syncSaveButton.addEventListener("click", saveCloudSettings);
  dom.cloudUploadButton.addEventListener("click", () => uploadCloudSync());
  dom.cloudDownloadButton.addEventListener("click", () => downloadCloudSync());
  dom.syncClearTokenButton.addEventListener("click", clearCloudToken);
  dom.syncAuto.addEventListener("change", saveCloudSettings);
  dom.syncToken.addEventListener("input", renderCloudSync);
  dom.syncGistId.addEventListener("input", renderCloudSync);
  dom.positionSearch.addEventListener("input", renderRows);
  dom.sortButtons.forEach((button) => {
    button.addEventListener("click", () => setSortField(button.dataset.sortField));
  });

  dom.baseButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.baseCurrency = button.dataset.baseCurrency;
      saveState();
      render();
      refreshPrices();
    });
  });

  dom.positionsBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.dataset.id;
    if (button.dataset.action === "edit") editPosition(id);
    if (button.dataset.action === "delete") deletePosition(id);
  });

  dom.allocationLegend.addEventListener("pointerover", (event) => {
    const row = event.target.closest(".legend-row[data-allocation-key]");
    if (!row) return;
    setAllocationHoverKey(row.dataset.allocationKey);
  });

  dom.allocationLegend.addEventListener("pointerleave", () => {
    setAllocationHoverKey(null);
  });

  dom.allocationLegend.addEventListener("click", (event) => {
    const row = event.target.closest(".legend-row[data-allocation-key]");
    if (!row) return;
    toggleAllocationPinnedKey(row.dataset.allocationKey);
  });

  dom.allocationLegend.addEventListener("focusin", (event) => {
    const row = event.target.closest(".legend-row[data-allocation-key]");
    if (!row) return;
    setAllocationHoverKey(row.dataset.allocationKey);
  });

  dom.allocationLegend.addEventListener("focusout", () => {
    setAllocationHoverKey(null);
  });

  dom.allocationLegend.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest(".legend-row[data-allocation-key]");
    if (!row) return;
    event.preventDefault();
    toggleAllocationPinnedKey(row.dataset.allocationKey);
  });

  document.addEventListener("visibilitychange", () => {
    const stale = !state.lastSync || Date.now() - state.lastSync > REFRESH_MS;
    if (document.visibilityState === "visible" && stale && state.positions.length) refreshPrices();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dom.appMenu.classList.contains("is-hidden")) closeMenu();
  });

  window.addEventListener("resize", drawAllocationChart);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol === "file:") return;
  navigator.serviceWorker.register("./service-worker.js?v=22").catch((error) => {
    console.warn("Service worker registration failed", error);
  });
}

loadState();
bindEvents();
updateKindMode();
render();
registerServiceWorker();

if (state.cloud.autoSync && state.cloud.token) {
  downloadCloudSync({ silent: true, overwrite: false }).catch((error) => {
    console.warn("Startup cloud sync failed", error);
  });
}

if (state.positions.length) {
  refreshPrices();
}

setInterval(() => {
  if (state.positions.length && document.visibilityState === "visible") refreshPrices();
}, REFRESH_MS);
