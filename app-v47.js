"use strict";

const STORAGE_KEY = "wealthtrack.v1";
const FALLBACK_USD_TWD = 31.2;
const REFRESH_MS = 30_000;
const REFRESH_STUCK_MS = 90_000;
const REFRESH_CLICK_FEEDBACK_MS = 2_000;
const AUTO_SYNC_DEBOUNCE_MS = 2_500;
const STOCK_QUOTE_CONCURRENCY = 1;
const STOCK_QUOTE_DELAY_MS = 1_800;
const DIVIDEND_CACHE_MS = 24 * 60 * 60 * 1000;
const DIVIDEND_FETCH_DELAY_MS = 350;
const DIVIDEND_PROFILE_METHOD_VERSION = "payment-date-v76";
const US_DIVIDEND_TAX_RATE = 0.3;
const HISTORY_START_DATE = "2026-07-10";
const HISTORY_MAX_POINTS = 2_500;
const HISTORY_MIN_POINT_GAP_MS = 60_000;
const HISTORY_FORCED_CHANGE_TWD = 100;
const HISTORY_AUTO_CHANGE_TWD = 1_000;
const HISTORY_AUTO_CHANGE_RATIO = 0.005;
const HISTORY_RANGE_DAYS = {
  week: 7,
  month: 31,
  year: 366,
  fiveYear: 365 * 5
};
const GITHUB_API_BASE = "https://api.github.com";
const SYNC_FILE_NAME = "wealthtrack-sync.json";
const SYNC_GIST_DESCRIPTION = "WealthTrack private sync";
const DEVICE_SYNC_HASH_PREFIX = "#sync=";

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

const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
const MONTHLY_DIVIDEND_SYMBOLS = new Set(["O", "SGOV"]);

const CHART_COLORS = [
  "#0b7a75", "#2f6fed", "#b7791f", "#7b61ff", "#d95f43",
  "#4d908e", "#9a6b3f", "#2563eb", "#16a34a", "#dc2626",
  "#9333ea", "#0891b2", "#ca8a04", "#be123c", "#0f766e",
  "#7c3aed", "#15803d", "#ea580c", "#0284c7", "#a16207",
  "#64748b"
];
const ALLOCATION_CATEGORIES = [
  { kind: "crypto", label: "加密貨幣", color: "#6d28d9" },
  { kind: "us-stock", label: "美股", color: "#d9472b" },
  { kind: "tw-stock", label: "台股", color: "#4d908e" }
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
  refreshStartedAt: 0,
  refreshMode: "",
  lastSync: null,
  quoteErrors: [],
  allocationHoverKey: null,
  allocationPinnedKey: null,
  dividends: {
    profiles: {},
    lastSync: null,
    isRefreshing: false,
    errors: []
  },
  history: {
    points: [],
    range: "since"
  },
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
  },
  ui: {
    privacyMask: false,
    columnOrder: [],
    theme: "dark"
  }
};

let activeRefreshRunId = 0;
let refreshClickFeedbackUntil = 0;
let refreshClickFeedbackTimer = null;

let autoSyncTimer = null;

const SORT_DEFAULT_DIRECTIONS = {
  asset: "asc",
  currentDividendYield: "desc",
  allocationPercent: "desc",
  quantity: "desc",
  averageCost: "desc",
  price: "desc",
  value: "desc",
  profit: "desc",
  profitPercent: "desc"
};

const DEFAULT_COLUMN_ORDER = [
  "asset",
  "currentDividendYield",
  "allocationPercent",
  "quantity",
  "averageCost",
  "price",
  "value",
  "profit",
  "profitPercent"
];

const DATA_COLUMNS = [
  { id: "asset", label: "資產", sortField: "asset", align: "left" },
  { id: "currentDividendYield", label: "當前殖利率", sortField: "currentDividendYield", align: "right" },
  { id: "allocationPercent", label: "佔比", sortField: "allocationPercent", align: "right" },
  { id: "quantity", label: "數量", sortField: "quantity", align: "right" },
  { id: "averageCost", label: "平均成本", sortField: "averageCost", align: "right" },
  { id: "price", label: "現價", sortField: "price", align: "right" },
  { id: "value", label: "市值", sortField: "value", align: "right" },
  { id: "profit", label: "損益金額", sortField: "profit", align: "right" },
  { id: "profitPercent", label: "損益率", sortField: "profitPercent", align: "right" }
];

const DATA_COLUMN_MAP = Object.fromEntries(DATA_COLUMNS.map((column) => [column.id, column]));

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
  refreshButtonLabel: document.querySelector("[data-refresh-label]"),
  menuButton: document.querySelector("#menuButton"),
  closeMenuButton: document.querySelector("#closeMenuButton"),
  appMenu: document.querySelector("#appMenu"),
  menuBackdrop: document.querySelector("#menuBackdrop"),
  menuMainPanel: document.querySelector("#menuMainPanel"),
  tokenSettingsButton: document.querySelector("#tokenSettingsButton"),
  tokenSettingsPanel: document.querySelector("#tokenSettingsPanel"),
  backToMenuButton: document.querySelector("#backToMenuButton"),
  columnSettingsButton: document.querySelector("#columnSettingsButton"),
  columnSettingsPanel: document.querySelector("#columnSettingsPanel"),
  backToMenuFromColumnsButton: document.querySelector("#backToMenuFromColumnsButton"),
  columnSettingsSummary: document.querySelector("#columnSettingsSummary"),
  privacyMaskToggle: document.querySelector("#privacyMaskToggle"),
  privacyMaskState: document.querySelector("#privacyMaskState"),
  columnOrderList: document.querySelector("#columnOrderList"),
  resetColumnOrderButton: document.querySelector("#resetColumnOrderButton"),
  themeSettingsButton: document.querySelector("#themeSettingsButton"),
  themeSettingsPanel: document.querySelector("#themeSettingsPanel"),
  backToMenuFromThemeButton: document.querySelector("#backToMenuFromThemeButton"),
  themeSettingsSummary: document.querySelector("#themeSettingsSummary"),
  themeSettingsState: document.querySelector("#themeSettingsState"),
  themeOptions: document.querySelectorAll("[data-theme-option]"),
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
  exportControl: document.querySelector("#exportControl"),
  exportButton: document.querySelector("#exportButton"),
  exportMenu: document.querySelector("#exportMenu"),
  exportOptions: document.querySelectorAll("[data-export-format]"),
  syncToken: document.querySelector("#syncToken"),
  syncGistId: document.querySelector("#syncGistId"),
  syncAuto: document.querySelector("#syncAuto"),
  syncSaveButton: document.querySelector("#syncSaveButton"),
  cloudUploadButton: document.querySelector("#cloudUploadButton"),
  cloudDownloadButton: document.querySelector("#cloudDownloadButton"),
  copyDeviceSyncLinkButton: document.querySelector("#copyDeviceSyncLinkButton"),
  syncClearTokenButton: document.querySelector("#syncClearTokenButton"),
  cloudSyncStatus: document.querySelector("#cloudSyncStatus"),
  syncTokenState: document.querySelector("#syncTokenState"),
  tokenSettingsSummary: document.querySelector("#tokenSettingsSummary"),
  allocationTotal: document.querySelector("#allocationTotal"),
  entryQuickStats: document.querySelector("#entryQuickStats"),
  portfolioDigest: document.querySelector("#portfolioDigest"),
  allocationChart: document.querySelector("#allocationChart"),
  allocationInsights: document.querySelector("#allocationInsights"),
  allocationLegend: document.querySelector("#allocationLegend"),
  assetGrowthChart: document.querySelector("#assetGrowthChart"),
  growthTotal: document.querySelector("#growthTotal"),
  growthChange: document.querySelector("#growthChange"),
  growthPointCount: document.querySelector("#growthPointCount"),
  growthRangeLabel: document.querySelector("#growthRangeLabel"),
  growthRangeButtons: document.querySelectorAll("[data-growth-range]"),
  positionsHeadRow: document.querySelector("#positionsHeadRow"),
  positionsBody: document.querySelector("#positionsBody"),
  emptyState: document.querySelector("#emptyState"),
  statusMessage: document.querySelector("#statusMessage"),
  positionSearch: document.querySelector("#positionSearch"),
  sortButtons: document.querySelectorAll("[data-sort-field]")
};

function normalizeColumnOrder(order) {
  const incoming = Array.isArray(order) ? order : [];
  const known = new Set(DATA_COLUMNS.map((column) => column.id));
  const filtered = incoming.filter((id, index) => known.has(id) && incoming.indexOf(id) === index);
  if (filtered.includes("profit") && !filtered.includes("profitPercent")) {
    filtered.splice(filtered.indexOf("profit") + 1, 0, "profitPercent");
  }
  const missing = DEFAULT_COLUMN_ORDER.filter((id) => !filtered.includes(id));
  return [...filtered, ...missing];
}

function historyTimestampFor(point, date) {
  const timestamp = Number(point?.timestamp || point?.ts);
  if (Number.isFinite(timestamp) && timestamp > 0) return timestamp;
  const parsed = Date.parse(`${date}T00:00:00+08:00`);
  return Number.isFinite(parsed) ? parsed : Date.parse(date);
}

function historyChangeAmount(previous, valueTwd) {
  if (!previous || !Number.isFinite(valueTwd)) return { amount: Infinity, ratio: Infinity };
  const amount = Math.abs(valueTwd - previous.valueTwd);
  const baseline = Math.max(Math.abs(previous.valueTwd), Math.abs(valueTwd), 1);
  return { amount, ratio: amount / baseline };
}

function shouldKeepHistoryPoint(previous, point) {
  if (!previous) return true;
  if (previous.date !== point.date) return true;
  const { amount, ratio } = historyChangeAmount(previous, point.valueTwd);
  if (amount >= HISTORY_FORCED_CHANGE_TWD && ratio >= 0.0001) return true;
  return Math.abs(point.timestamp - previous.timestamp) >= HISTORY_MIN_POINT_GAP_MS;
}

function shouldRecordHistoryPoint(previous, valueTwd, options = {}) {
  if (!previous) return true;
  const date = taipeiDateKey();
  if (previous.date !== date) return true;
  const { amount, ratio } = historyChangeAmount(previous, valueTwd);
  if (options.force) return amount >= HISTORY_FORCED_CHANGE_TWD;
  if (Date.now() - previous.timestamp < HISTORY_MIN_POINT_GAP_MS) return false;
  return amount >= HISTORY_AUTO_CHANGE_TWD && ratio >= HISTORY_AUTO_CHANGE_RATIO;
}

function normalizeHistoryPoints(points) {
  if (!Array.isArray(points)) return [];
  const normalized = [];
  for (const point of points) {
    const date = typeof point?.date === "string" ? point.date : "";
    const valueTwd = Number(point?.valueTwd);
    const timestamp = historyTimestampFor(point, date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < HISTORY_START_DATE) continue;
    if (!Number.isFinite(valueTwd) || valueTwd < 0) continue;
    if (!Number.isFinite(timestamp)) continue;
    normalized.push({
      date,
      valueTwd,
      timestamp
    });
  }
  normalized.sort((a, b) => (a.timestamp - b.timestamp) || a.date.localeCompare(b.date));
  const deduped = [];
  for (const point of normalized) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.date === point.date) {
      const { amount } = historyChangeAmount(previous, point.valueTwd);
      if (amount < HISTORY_FORCED_CHANGE_TWD && Math.abs(point.timestamp - previous.timestamp) < HISTORY_MIN_POINT_GAP_MS) {
        deduped[deduped.length - 1] = point;
        continue;
      }
    }
    if (shouldKeepHistoryPoint(previous, point)) deduped.push(point);
  }
  return deduped.slice(-HISTORY_MAX_POINTS);
}

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
    if (saved.dividends && typeof saved.dividends === "object") {
      state.dividends.profiles = saved.dividends.profiles && typeof saved.dividends.profiles === "object"
        ? saved.dividends.profiles
        : {};
      state.dividends.lastSync = saved.dividends.lastSync || null;
    }
    if (saved.history && typeof saved.history === "object") {
      state.history.points = normalizeHistoryPoints(saved.history.points);
      state.history.range = Object.prototype.hasOwnProperty.call(HISTORY_RANGE_DAYS, saved.history.range) || saved.history.range === "since"
        ? saved.history.range
        : "since";
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
    if (saved.ui && typeof saved.ui === "object") {
      state.ui.privacyMask = Boolean(saved.ui.privacyMask);
      state.ui.columnOrder = normalizeColumnOrder(saved.ui.columnOrder);
      state.ui.theme = saved.ui.theme === "light" ? "light" : "dark";
    } else {
      state.ui.columnOrder = normalizeColumnOrder();
    }
  } catch (error) {
    console.warn("Unable to load saved portfolio", error);
  }
  state.ui.columnOrder = normalizeColumnOrder(state.ui.columnOrder);
}

function saveState(options = {}) {
  const { sync = true } = options;
  const payload = {
    positions: state.positions,
    baseCurrency: state.baseCurrency,
    sortMode: state.sortMode,
    quotes: state.quotes,
    fx: state.fx,
    dividends: {
      profiles: state.dividends.profiles,
      lastSync: state.dividends.lastSync
    },
    history: {
      points: normalizeHistoryPoints(state.history.points),
      range: state.history.range
    },
    cloud: {
      token: state.cloud.token,
      gistId: state.cloud.gistId,
      autoSync: state.cloud.autoSync,
      lastPulledAt: state.cloud.lastPulledAt,
      lastPushedAt: state.cloud.lastPushedAt,
      lastRemoteUpdatedAt: state.cloud.lastRemoteUpdatedAt,
      lastHash: state.cloud.lastHash
    },
    ui: {
      privacyMask: state.ui.privacyMask,
      columnOrder: normalizeColumnOrder(state.ui.columnOrder),
      theme: state.ui.theme
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

function privateCurrencyLabel(currency = state.baseCurrency) {
  if (currency === "USD") return "US$••••";
  if (currency === "TWD") return "NT$••••";
  return `${currency || ""}••••`.trim();
}

function formatSensitiveCurrency(value, currency = state.baseCurrency) {
  if (!Number.isFinite(value)) return "--";
  return state.ui.privacyMask ? privateCurrencyLabel(currency) : formatCurrency(value, currency);
}

function formatWholeSensitiveCurrency(value, currency = state.baseCurrency) {
  if (!Number.isFinite(value)) return "--";
  if (state.ui.privacyMask) return privateCurrencyLabel(currency);
  const formatted = new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(Math.round(value));
  return normalizeCurrencyLabel(formatted, currency);
}

function sensitiveClass(value) {
  return state.ui.privacyMask && Number.isFinite(value) ? "privacy-mask" : valueClass(value);
}

function formatCompactCurrency(value, currency = state.baseCurrency) {
  if (!Number.isFinite(value)) return "--";
  if (state.ui.privacyMask) return privateCurrencyLabel(currency);
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

function formatPlainPercent(value, maximumFractionDigits = 1) {
  if (!Number.isFinite(value)) return "--";
  return `${value.toFixed(maximumFractionDigits)}%`;
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

function unitDisplayCurrency(position, fallbackCurrency) {
  if (position.kind === "tw-stock") return "TWD";
  if (position.kind === "us-stock" || position.kind === "crypto") return "USD";
  return fallbackCurrency || state.baseCurrency;
}

function positionCostCurrency(position, quoteCurrency) {
  if (position.costCurrency && position.costCurrency !== "QUOTE") return position.costCurrency;
  return unitDisplayCurrency(position, quoteCurrency);
}

function convertUnitForDisplay(value, sourceCurrency, position) {
  const currency = unitDisplayCurrency(position, sourceCurrency);
  const convertedValue = convertCurrency(value, sourceCurrency, currency);
  return {
    value: Number.isFinite(convertedValue) ? convertedValue : value,
    currency: Number.isFinite(convertedValue) ? currency : sourceCurrency
  };
}

function latestDividendPerShare(profile) {
  const direct = Number(profile?.lastDividendPerShare);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const annualPerShare = Number(profile?.annualPerShare);
  const frequency = Number(profile?.frequency);
  if (Number.isFinite(annualPerShare) && annualPerShare > 0 && Number.isFinite(frequency) && frequency > 0) {
    return annualPerShare / frequency;
  }

  const monthAmounts = profile?.monthAmounts && typeof profile.monthAmounts === "object"
    ? Object.values(profile.monthAmounts).map(Number).filter((value) => Number.isFinite(value) && value > 0)
    : [];
  if (monthAmounts.length) {
    return monthAmounts.reduce((sum, value) => sum + value, 0) / monthAmounts.length;
  }

  return NaN;
}

function currentDividendYieldAtPrice(position, quotePrice, quoteCurrency) {
  if (position.kind !== "us-stock" && position.kind !== "tw-stock") return NaN;
  const profile = state.dividends.profiles[dividendKey(position)];
  if (!profile || profile.error) return NaN;

  const lastDividend = latestDividendPerShare(profile);
  const frequency = Number(profile.frequency);
  const annualPerShare = Number.isFinite(lastDividend) && lastDividend > 0 && Number.isFinite(frequency) && frequency > 0
    ? lastDividend * frequency
    : Number(profile.annualPerShare);
  const dividendCurrency = profile.currency || (position.kind === "tw-stock" ? "TWD" : "USD");
  const annualInQuoteCurrency = convertCurrency(annualPerShare, dividendCurrency, quoteCurrency || dividendCurrency);

  if (!Number.isFinite(annualInQuoteCurrency) || annualInQuoteCurrency <= 0) return NaN;
  if (!Number.isFinite(quotePrice) || quotePrice <= 0) return NaN;
  return (annualInQuoteCurrency / quotePrice) * 100;
}

function calculatePosition(position) {
  const quote = getQuote(position);
  const quoteCurrency = quote?.currency || position.manualCurrency || state.baseCurrency;
  const price = Number(quote?.price);
  const currentDividendYield = currentDividendYieldAtPrice(position, price, quoteCurrency);
  const currentValue = Number.isFinite(price)
    ? convertCurrency(price * position.quantity, quoteCurrency, state.baseCurrency)
    : NaN;

  const costCurrency = positionCostCurrency(position, quoteCurrency);
  const costValue = convertCurrency(position.averageCost * position.quantity, costCurrency, state.baseCurrency);
  const profit = Number.isFinite(currentValue) && Number.isFinite(costValue) ? currentValue - costValue : NaN;
  const profitPercent = Number.isFinite(profit) && costValue > 0 ? (profit / costValue) * 100 : NaN;

  return {
    quote,
    quoteCurrency,
    currentDividendYield,
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

function taipeiDateKey(timestamp = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(timestamp));
}

function recordAssetHistory(totals, options = {}) {
  if (!state.positions.length || !totals.quoted || !Number.isFinite(totals.value) || totals.value <= 0) return false;
  const valueTwd = convertCurrency(totals.value, state.baseCurrency, "TWD");
  if (!Number.isFinite(valueTwd) || valueTwd <= 0) return false;

  const now = Date.now();
  const date = taipeiDateKey(now);
  if (date < HISTORY_START_DATE) return false;
  const points = normalizeHistoryPoints(state.history.points);
  const previous = points[points.length - 1];
  if (!shouldRecordHistoryPoint(previous, valueTwd, options)) {
    state.history.points = points;
    return false;
  }

  points.push({ date, valueTwd, timestamp: now });
  state.history.points = normalizeHistoryPoints(points);
  return true;
}

function currentHistoryPoint(totals = calculatePortfolio()) {
  if (!Number.isFinite(totals.value) || totals.value <= 0) return null;
  const valueTwd = convertCurrency(totals.value, state.baseCurrency, "TWD");
  if (!Number.isFinite(valueTwd) || valueTwd <= 0) return null;
  const date = taipeiDateKey();
  if (date < HISTORY_START_DATE) return null;
  return { date, valueTwd, timestamp: Date.now(), live: true };
}

function recordCurrentAssetHistory(options = {}) {
  return recordAssetHistory(calculatePortfolio(), options);
}

function historyRangeStart(range) {
  if (range === "since") return HISTORY_START_DATE;
  const days = HISTORY_RANGE_DAYS[range] || HISTORY_RANGE_DAYS.month;
  const date = new Date();
  date.setDate(date.getDate() - days);
  return taipeiDateKey(date.getTime()) < HISTORY_START_DATE ? HISTORY_START_DATE : taipeiDateKey(date.getTime());
}

function historyRangeLabel(range) {
  if (range === "week") return "最近一週";
  if (range === "month") return "最近一個月";
  if (range === "year") return "最近一年";
  if (range === "fiveYear") return "最近五年";
  return "自 2026/7/10 起";
}

function getGrowthPoints(totals) {
  const points = normalizeHistoryPoints(state.history.points);
  const live = currentHistoryPoint(totals);
  if (live) {
    const previous = points[points.length - 1];
    if (!previous || shouldRecordHistoryPoint(previous, live.valueTwd, { force: true })) {
      points.push(live);
    } else {
      points[points.length - 1] = { ...previous, valueTwd: live.valueTwd, timestamp: live.timestamp, live: true };
    }
  }
  const startDate = historyRangeStart(state.history.range);
  return points
    .filter((point) => point.date >= startDate)
    .sort((a, b) => (a.timestamp - b.timestamp) || a.date.localeCompare(b.date));
}

function setGrowthRange(range) {
  if (range !== "since" && !Object.prototype.hasOwnProperty.call(HISTORY_RANGE_DAYS, range)) return;
  state.history.range = range;
  saveState();
  drawGrowthChart(calculatePortfolio());
}

function formatHistoryPointLabel(point, includeTime = false) {
  const date = (point?.date || "").replaceAll("-", "/");
  if (!includeTime || !Number.isFinite(point?.timestamp)) return date;
  const time = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(point.timestamp));
  return `${date} ${time}`;
}

function drawGrowthChart(totals = calculatePortfolio()) {
  if (!dom.assetGrowthChart) return;
  const canvas = dom.assetGrowthChart;
  const ctx = canvas.getContext("2d");
  const styles = getComputedStyle(document.documentElement);
  const text = styles.getPropertyValue("--text").trim();
  const muted = styles.getPropertyValue("--muted").trim();
  const line = styles.getPropertyValue("--line").trim();
  const primary = styles.getPropertyValue("--primary").trim();
  const danger = styles.getPropertyValue("--danger").trim();
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width || 680));
  const height = Math.max(210, Math.round(rect.height || 260));
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const points = getGrowthPoints(totals);
  const currentValue = points.length ? convertCurrency(points[points.length - 1].valueTwd, "TWD", state.baseCurrency) : NaN;
  if (dom.growthTotal) {
    dom.growthTotal.textContent = Number.isFinite(currentValue) ? formatSensitiveCurrency(currentValue) : "--";
    dom.growthTotal.className = sensitiveClass(currentValue);
  }
  if (dom.growthRangeLabel) dom.growthRangeLabel.textContent = historyRangeLabel(state.history.range);
  if (dom.growthPointCount) dom.growthPointCount.textContent = `${points.length} 筆`;
  dom.growthRangeButtons?.forEach((button) => {
    const active = button.dataset.growthRange === state.history.range;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  if (!points.length) {
    ctx.fillStyle = muted;
    ctx.font = "700 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("等待今日資產紀錄", width / 2, height / 2);
    if (dom.growthChange) dom.growthChange.textContent = "--";
    return;
  }

  const values = points.map((point) => convertCurrency(point.valueTwd, "TWD", state.baseCurrency)).filter(Number.isFinite);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const pad = Math.max((maxValue - minValue) * 0.12, maxValue * 0.02, 1);
  const yMin = Math.max(0, minValue - pad);
  const yMax = maxValue + pad;
  const chart = { left: 58, right: width - 20, top: 22, bottom: height - 42 };
  const timestamps = points.map((point) => Number(point.timestamp)).filter(Number.isFinite);
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const sameTime = points.length === 1 || !Number.isFinite(minTime) || !Number.isFinite(maxTime) || minTime === maxTime;
  const xForPoint = (point, index) => {
    if (sameTime) return points.length === 1
      ? (chart.left + chart.right) / 2
      : chart.left + (index / (points.length - 1)) * (chart.right - chart.left);
    return chart.left + ((point.timestamp - minTime) / (maxTime - minTime)) * (chart.right - chart.left);
  };
  const yFor = (value) => chart.bottom - ((value - yMin) / Math.max(yMax - yMin, 1)) * (chart.bottom - chart.top);

  ctx.strokeStyle = line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 4; i += 1) {
    const y = chart.top + (i / 3) * (chart.bottom - chart.top);
    ctx.moveTo(chart.left, y);
    ctx.lineTo(chart.right, y);
  }
  ctx.stroke();

  ctx.fillStyle = muted;
  ctx.font = "700 11px system-ui, sans-serif";
  ctx.textAlign = "right";
  [yMax, (yMax + yMin) / 2, yMin].forEach((value, index) => {
    const y = index === 0 ? chart.top + 4 : index === 1 ? (chart.top + chart.bottom) / 2 + 4 : chart.bottom;
    ctx.fillText(formatCompactCurrency(value), chart.left - 8, y);
  });

  const gradient = ctx.createLinearGradient(0, chart.top, 0, chart.bottom);
  gradient.addColorStop(0, "rgba(11, 122, 117, 0.28)");
  gradient.addColorStop(1, "rgba(11, 122, 117, 0)");

  const coords = points.map((point, index) => {
    const value = convertCurrency(point.valueTwd, "TWD", state.baseCurrency);
    return {
      point,
      value,
      x: xForPoint(point, index),
      y: yFor(value)
    };
  });

  if (coords.length > 1) {
    ctx.beginPath();
    ctx.moveTo(coords[0].x, chart.bottom);
    coords.forEach((coord) => ctx.lineTo(coord.x, coord.y));
    ctx.lineTo(coords[coords.length - 1].x, chart.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  ctx.beginPath();
  coords.forEach((coord, index) => {
    if (index === 0) ctx.moveTo(coord.x, coord.y);
    else ctx.lineTo(coord.x, coord.y);
  });
  if (coords.length === 1) {
    ctx.moveTo(coords[0].x - 28, coords[0].y);
    ctx.lineTo(coords[0].x + 28, coords[0].y);
  }
  ctx.strokeStyle = primary;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  coords.forEach((coord) => {
    ctx.beginPath();
    ctx.arc(coord.x, coord.y, coord.point.live ? 4.5 : 3.2, 0, Math.PI * 2);
    ctx.fillStyle = coord.point.live ? text : primary;
    ctx.fill();
  });

  const firstValue = convertCurrency(points[0].valueTwd, "TWD", state.baseCurrency);
  const lastValue = convertCurrency(points[points.length - 1].valueTwd, "TWD", state.baseCurrency);
  const change = lastValue - firstValue;
  const changePercent = firstValue > 0 ? (change / firstValue) * 100 : NaN;
  if (dom.growthChange) {
    dom.growthChange.textContent = `${formatSensitiveCurrency(change)} ${formatPercent(changePercent)}`;
    dom.growthChange.className = sensitiveClass(change) || valueClass(change);
  }

  ctx.fillStyle = muted;
  ctx.font = "700 11px system-ui, sans-serif";
  const includeTime = points.length > 1 && points[0].date === points[points.length - 1].date;
  ctx.textAlign = "left";
  ctx.fillText(formatHistoryPointLabel(points[0], includeTime), chart.left, height - 14);
  ctx.textAlign = "right";
  ctx.fillText(formatHistoryPointLabel(points[points.length - 1], includeTime), chart.right, height - 14);
}

function render() {
  const totals = calculatePortfolio();
  const profit = totals.value - totals.cost;
  const profitPercent = totals.cost > 0 ? (profit / totals.cost) * 100 : NaN;

  renderThemeSettings();
  document.body.classList.toggle("privacy-mode", state.ui.privacyMask);
  dom.totalValue.textContent = formatSensitiveCurrency(totals.value);
  dom.totalValue.className = sensitiveClass(totals.value);
  dom.totalCost.textContent = formatSensitiveCurrency(totals.cost);
  dom.totalCost.className = sensitiveClass(totals.cost);
  dom.totalProfit.textContent = formatSensitiveCurrency(profit);
  dom.totalProfit.className = sensitiveClass(profit);
  dom.totalProfitPercent.textContent = formatPercent(profitPercent);
  dom.totalProfitPercent.className = valueClass(profitPercent);
  dom.positionCount.textContent = `${state.positions.length} 筆資產`;
  dom.baseCurrencyHint.textContent = `以 ${state.baseCurrency} 顯示`;
  dom.allocationTotal.textContent = formatSensitiveCurrency(totals.value);
  dom.allocationTotal.className = sensitiveClass(totals.value);
  dom.quoteHealth.textContent = `${totals.quoted}/${state.positions.length}`;

  const fxLabel = state.fx.asOf ? `匯率 ${formatTime(state.fx.asOf)}` : "使用備用匯率";
  dom.fxStatus.textContent = fxLabel;

  if (state.isRefreshing) {
    dom.syncStatus.textContent = state.refreshMode === "manual" ? "正在重新同步市場價格..." : "正在同步市場價格...";
  } else if (state.lastSync) {
    dom.syncStatus.textContent = `最近更新 ${formatTime(state.lastSync)}`;
  } else {
    dom.syncStatus.textContent = "尚未同步市場價格";
  }

  renderStatus(totals);
  renderEntryQuickStats(totals);
  renderPortfolioDigest(totals);
  renderRows();
  updateSortButtons();
  drawAllocationChart();
  drawGrowthChart(totals);
  updateCurrencyButtons();
  renderCloudSync();
  renderColumnSettings();
  unlockRefreshButton();
}

function markRefreshClicked() {
  refreshClickFeedbackUntil = Date.now() + REFRESH_CLICK_FEEDBACK_MS;
  if (refreshClickFeedbackTimer) clearTimeout(refreshClickFeedbackTimer);
  refreshClickFeedbackTimer = setTimeout(() => {
    refreshClickFeedbackTimer = null;
    unlockRefreshButton();
  }, REFRESH_CLICK_FEEDBACK_MS + 50);
}

function refreshClickFeedbackActive() {
  return Date.now() < refreshClickFeedbackUntil;
}

function unlockRefreshButton() {
  if (!dom.refreshButton) return;
  clearStaleRefresh();
  const busy = state.isRefreshing || state.dividends.isRefreshing;
  const showClicked = busy || refreshClickFeedbackActive();
  dom.refreshButton.classList.toggle("is-loading", showClicked);
  dom.refreshButton.classList.toggle("is-clicked", showClicked);
  dom.refreshButton.setAttribute("aria-busy", String(showClicked));
  dom.refreshButton.disabled = false;
  dom.refreshButton.removeAttribute("disabled");
  if (dom.refreshButtonLabel) dom.refreshButtonLabel.textContent = showClicked ? "更新中" : "更新";
}

function refreshIsStale() {
  return Boolean(state.isRefreshing && state.refreshStartedAt && Date.now() - state.refreshStartedAt > REFRESH_STUCK_MS);
}

function clearStaleRefresh() {
  if (!refreshIsStale()) return false;
  activeRefreshRunId += 1;
  state.isRefreshing = false;
  state.refreshStartedAt = 0;
  state.refreshMode = "";
  return true;
}

function renderStatus(totals) {
  if (!state.positions.length) {
    dom.statusMessage.textContent = state.cloud.token
      ? "此裝置尚無資料，正在等待雲端同步。"
      : "此裝置尚未連結雲端，請用有資料的裝置建立新裝置同步連結。";
    return;
  }

  if (state.quoteErrors.length) {
    const cacheNote = totals.quoted ? "，已保留可用的上次報價" : "";
    dom.statusMessage.textContent = `${state.quoteErrors.length} 個報價暫時無法更新${cacheNote}：${state.quoteErrors.slice(0, 3).join("、")}`;
    return;
  }

  dom.statusMessage.textContent = `已取得 ${totals.quoted} 筆報價，自動刷新間隔 ${formatRefreshInterval(REFRESH_MS)}。`;
}

function formatRefreshInterval(ms) {
  if (ms < 60_000) return `${Math.round(ms / 1_000)} 秒`;
  return `${Math.round(ms / 60_000)} 分鐘`;
}

function renderEntryQuickStats(totals) {
  if (!dom.entryQuickStats) return;

  const dividendRows = getDividendRows();
  if (!dividendRows.length) {
    dom.entryQuickStats.innerHTML = `
      <div class="quick-stat-head">
        <h3>每月預估股息</h3>
        <span>等待股票資料</span>
      </div>
      <div class="quick-empty">這裡只統計股票與 ETF 的現金股息，加密貨幣和手動資產不列入。</div>
    `;
    return;
  }

  const summary = calculateDividendSummary(dividendRows);
  const maxMonth = Math.max(...summary.monthTotals, 0);
  const sourceStatus = state.dividends.isRefreshing
    ? "正在更新"
    : state.dividends.lastSync
      ? `更新 ${formatTime(state.dividends.lastSync)}`
      : "等待更新";
  const monthCards = summary.monthTotals
    .map((value, index) => {
      const ratio = maxMonth > 0 ? (value / maxMonth) * 100 : 0;
      return `
        <div class="dividend-month-card ${value > 0 ? "has-dividend" : ""}">
          <span>${MONTH_LABELS[index]}</span>
          <strong class="${sensitiveClass(value)}">${value > 0 ? formatWholeSensitiveCurrency(value) : "--"}</strong>
          <span class="dividend-month-bar"><span style="width:${ratio.toFixed(1)}%"></span></span>
        </div>
      `;
    })
    .join("");
  const formatPayoutMonths = (months) => {
    if (!Array.isArray(months) || !months.length) return "配息月份待補";
    if (months.length >= 12) return "每月";
    return months.map((monthIndex) => MONTH_LABELS[monthIndex]).join("、");
  };
  const topPayers = summary.payers
    .slice(0, 12)
    .map((payer) => `
      <div class="dividend-payer-row">
        <span class="dividend-payer-identity">
          <strong>${escapeHtml(payer.symbol)}</strong>
          <small>${escapeHtml(formatPayoutMonths(payer.months))}</small>
        </span>
        <strong class="${sensitiveClass(payer.annualValue)}">${formatWholeSensitiveCurrency(payer.annualValue)}</strong>
        <small>${Number.isFinite(payer.yieldPercent) && payer.yieldPercent > 0 ? payer.yieldPercent.toFixed(2) : "--"}%</small>
      </div>
    `)
    .join("");
  const missingCount = summary.missingCount;

  dom.entryQuickStats.innerHTML = `
    <div class="quick-stat-head">
      <h3>每月預估股息</h3>
      <span>${sourceStatus}</span>
    </div>
    <div class="dividend-summary-grid">
      <div>
        <span>年化股息</span>
        <strong class="${sensitiveClass(summary.annualTotal)}">${formatWholeSensitiveCurrency(summary.annualTotal)}</strong>
      </div>
      <div>
        <span>月平均</span>
        <strong class="${sensitiveClass(summary.monthAverage)}">${formatWholeSensitiveCurrency(summary.monthAverage)}</strong>
      </div>
      <div>
        <span>資料狀態</span>
        <strong>${summary.readyCount}/${dividendRows.length}</strong>
      </div>
    </div>
    <div class="dividend-month-grid">
      ${monthCards}
    </div>
    <div class="dividend-bottom-grid">
      <div class="dividend-payers">
        <div class="dividend-payer-header">
          <span>主要配息來源</span>
          <span>年領股息</span>
          <span>殖利率</span>
        </div>
        ${topPayers || `<small>暫無股息資料</small>`}
      </div>
      <div class="dividend-note">
        <strong>${missingCount ? `${missingCount} 檔缺資料` : "以最近配息推估"}</strong>
        <small>美股已預扣 30% 股息稅；台股未扣二代健保、匯費。資料每日更新一次。</small>
      </div>
    </div>
  `;
}

function renderPortfolioDigest(totals) {
  if (!dom.portfolioDigest) return;

  const rows = state.positions.map((position) => {
    const metrics = calculatePosition(position);
    const allocationPercent = totals.value > 0 && Number.isFinite(metrics.currentValue)
      ? (metrics.currentValue / totals.value) * 100
      : NaN;
    return { position, metrics, allocationPercent };
  });

  if (!rows.length) {
    dom.portfolioDigest.innerHTML = `
      <div class="digest-head">
        <h3>投組整理</h3>
        <span>等待資產</span>
      </div>
      <div class="quick-empty">新增資產後，這裡會整理報價狀態、股息資料和需要優先注意的部位。</div>
    `;
    return;
  }

  const pricedRows = rows
    .filter((row) => Number.isFinite(row.metrics.currentValue))
    .sort((a, b) => b.metrics.currentValue - a.metrics.currentValue);
  const profitRows = rows
    .filter((row) => Number.isFinite(row.metrics.profitPercent))
    .sort((a, b) => a.metrics.profitPercent - b.metrics.profitPercent);
  const largest = pricedRows[0];
  const pressure = profitRows[0];
  const best = profitRows.length ? profitRows[profitRows.length - 1] : null;
  const missingQuotes = rows.filter((row) => !Number.isFinite(row.metrics.currentValue));
  const dividendRows = getDividendRows();
  const dividendSummary = calculateDividendSummary(dividendRows);
  const dividendStatus = dividendRows.length ? `${dividendSummary.readyCount}/${dividendRows.length}` : "--";
  const dividendNote = dividendRows.length
    ? (dividendSummary.missingCount ? `${dividendSummary.missingCount} 檔待補` : "資料完整")
    : "沒有股票部位";
  const quoteNote = missingQuotes.length
    ? missingQuotes.slice(0, 4).map((row) => row.position.symbol).join("、")
    : "全部可計價";
  const makeCard = (label, main, sub, className = "") => `
    <div class="digest-card">
      <span>${escapeHtml(label)}</span>
      <strong class="${className}">${main}</strong>
      <small>${sub}</small>
    </div>
  `;

  dom.portfolioDigest.innerHTML = `
    <div class="digest-head">
      <h3>投組整理</h3>
      <span>${state.lastSync ? `更新 ${formatTime(state.lastSync)}` : "尚未更新"}</span>
    </div>
    <div class="digest-card-grid">
      ${makeCard(
        "最大部位",
        largest ? escapeHtml(largest.position.symbol) : "--",
        largest ? `${formatPlainPercent(largest.allocationPercent)} · ${formatCompactCurrency(largest.metrics.currentValue)}` : "--"
      )}
      ${makeCard(
        "壓力最大",
        pressure ? escapeHtml(pressure.position.symbol) : "--",
        pressure ? `${formatPercent(pressure.metrics.profitPercent)} · ${formatWholeSensitiveCurrency(pressure.metrics.profit)}` : "--",
        pressure ? valueClass(pressure.metrics.profitPercent) : ""
      )}
      ${makeCard("股息資料", dividendStatus, dividendNote)}
    </div>
    <div class="digest-row-grid">
      <div class="digest-row">
        <span>報價待補</span>
        <strong>${escapeHtml(quoteNote)}</strong>
      </div>
      <div class="digest-row">
        <span>表現最好</span>
        <strong class="${best ? valueClass(best.metrics.profitPercent) : ""}">${best ? `${escapeHtml(best.position.symbol)} ${formatPercent(best.metrics.profitPercent)}` : "--"}</strong>
      </div>
    </div>
  `;
}

function getDividendRows() {
  return state.positions
    .filter((position) => position.kind === "us-stock" || position.kind === "tw-stock")
    .map((position) => ({ position, metrics: calculatePosition(position), profile: state.dividends.profiles[dividendKey(position)] }));
}

function calculateDividendSummary(rows) {
  const monthTotals = Array(12).fill(0);
  const payers = [];
  let readyCount = 0;
  let missingCount = 0;

  for (const row of rows) {
    const profile = row.profile;
    if (!profile || profile.error) {
      missingCount += 1;
      continue;
    }

    readyCount += 1;
    const currency = profile.currency || row.metrics.quoteCurrency || (row.position.kind === "tw-stock" ? "TWD" : "USD");
    const taxFactor = row.position.kind === "us-stock" ? 1 - US_DIVIDEND_TAX_RATE : 1;
    let annualValue = 0;
    let monthAmounts = profile.monthAmounts && typeof profile.monthAmounts === "object" ? { ...profile.monthAmounts } : {};
    if (isKnownMonthlyDividend(row.position)) {
      const observedAmounts = Object.values(monthAmounts)
        .map(Number)
        .filter((value) => Number.isFinite(value) && value > 0);
      const annualPerShare = Number(profile.annualPerShare);
      const monthlyFallback = observedAmounts.length
        ? observedAmounts.reduce((sum, value) => sum + value, 0) / observedAmounts.length
        : Number.isFinite(annualPerShare) && annualPerShare > 0
          ? annualPerShare / 12
          : 0;
      if (monthlyFallback > 0) {
        monthAmounts = { ...monthAmounts };
        for (let index = 0; index < 12; index += 1) {
          const existingAmount = Number(monthAmounts[index]);
          if (!Number.isFinite(existingAmount) || existingAmount <= 0) {
            monthAmounts[index] = monthlyFallback;
          }
        }
      }
    }

    for (const [monthIndex, amountPerShare] of Object.entries(monthAmounts)) {
      const index = Number(monthIndex);
      const amount = Number(amountPerShare) * Number(row.position.quantity) * taxFactor;
      if (!Number.isInteger(index) || index < 0 || index > 11 || !Number.isFinite(amount)) continue;
      const converted = convertCurrency(amount, currency, state.baseCurrency);
      if (!Number.isFinite(converted)) continue;
      monthTotals[index] += converted;
      annualValue += converted;
    }

    if (!annualValue && Number.isFinite(Number(profile.annualPerShare)) && Number(profile.annualPerShare) > 0) {
      annualValue = convertCurrency(Number(profile.annualPerShare) * Number(row.position.quantity) * taxFactor, currency, state.baseCurrency);
    }

    if (Number.isFinite(annualValue) && annualValue > 0) {
      payers.push({
        symbol: row.position.symbol,
        annualValue,
        yieldPercent: Number(profile.yieldPercent) * taxFactor,
        months: Object.keys(monthAmounts)
          .map(Number)
          .filter((index) => Number.isInteger(index) && index >= 0 && index <= 11)
          .sort((a, b) => a - b)
      });
    }
  }

  const annualTotal = monthTotals.reduce((sum, value) => sum + value, 0);
  return {
    monthTotals,
    annualTotal,
    monthAverage: annualTotal / 12,
    readyCount,
    missingCount,
    payers: payers.sort((a, b) => b.annualValue - a.annualValue)
  };
}

function renderRows() {
  const query = dom.positionSearch.value.trim().toLowerCase();
  const totals = calculatePortfolio();
  const rows = sortRows(state.positions
    .map((position) => {
      const metrics = calculatePosition(position);
      const allocationPercent = Number.isFinite(metrics.currentValue) && totals.value > 0
        ? (metrics.currentValue / totals.value) * 100
        : NaN;
      return { position, metrics, allocationPercent };
    })
    .filter(({ position }) => {
      if (!query) return true;
      return `${position.symbol} ${position.name} ${KIND_LABELS[position.kind]}`.toLowerCase().includes(query);
    }));

  renderTableHeader();
  dom.positionsBody.innerHTML = "";
  dom.emptyState.classList.toggle("is-hidden", state.positions.length > 0);

  for (const { position, metrics } of rows) {
    const tr = document.createElement("tr");
    tr.className = "position-row";
    tr.dataset.positionId = position.id;
    tr.tabIndex = 0;
    tr.setAttribute("role", "button");
    tr.setAttribute("aria-label", `開啟 ${position.name || position.symbol} 分析頁`);
    const orderedCells = normalizeColumnOrder(state.ui.columnOrder)
      .map((columnId) => renderCell(columnId, position, metrics, rows))
      .join("");

    tr.innerHTML = `
      ${orderedCells}
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

function openPositionDetail(id) {
  const position = state.positions.find((item) => item.id === id);
  if (!position) return;
  const params = new URLSearchParams({
    id: position.id,
    symbol: position.symbol,
    kind: position.kind,
    v: "47"
  });
  window.open(`asset-detail.html?${params.toString()}`, "_blank", "noopener");
}

function renderTableHeader() {
  if (!dom.positionsHeadRow) return;
  const headers = normalizeColumnOrder(state.ui.columnOrder)
    .map((columnId) => {
      const column = DATA_COLUMN_MAP[columnId];
      if (!column) return "";
      const alignClass = column.align === "right" ? " align-right" : "";
      return `
        <th>
          <button class="sort-header${alignClass}" type="button" data-sort-field="${escapeHtml(column.sortField)}">
            ${escapeHtml(column.label)}<span class="sort-indicator" aria-hidden="true"></span>
          </button>
        </th>
      `;
    })
    .join("");
  dom.positionsHeadRow.innerHTML = `${headers}<th>操作</th>`;
}

function renderCell(columnId, position, metrics) {
  const quote = metrics.quote;
  const quoteCurrency = metrics.quoteCurrency;
  const quotePrice = Number(quote?.price);
  const costCurrency = positionCostCurrency(position, quoteCurrency);
  const averageCostDisplay = convertUnitForDisplay(Number(position.averageCost), costCurrency, position);
  const quotePriceDisplay = convertUnitForDisplay(quotePrice, quoteCurrency, position);
  const badgeText = position.symbol.replace(/\..+$/, "").slice(0, 3).toUpperCase();
  const change = Number(quote?.changePercent);
  const quotePriceClass = valueClass(quotePriceDisplay.value);
  const changeClass = valueClass(change);
  const quantityClass = valueClass(position.quantity);
  const averageCostClass = valueClass(averageCostDisplay.value);
  const costValueClass = sensitiveClass(metrics.costValue);
  const currentValueClass = sensitiveClass(metrics.currentValue);
  const profitAmountClass = sensitiveClass(metrics.profit);
  const profitPercentClass = valueClass(metrics.profitPercent);
  const totals = calculatePortfolio();
  const allocationPercent = Number.isFinite(metrics.currentValue) && totals.value > 0
    ? (metrics.currentValue / totals.value) * 100
    : NaN;

  if (columnId === "asset") {
    return `
      <td>
        <div class="asset-cell">
          <span class="asset-badge">${escapeHtml(badgeText)}</span>
          <span class="asset-title">
            <strong>${escapeHtml(position.name)}</strong>
            <small>${escapeHtml(position.symbol)} · ${escapeHtml(KIND_LABELS[position.kind])}</small>
          </span>
        </div>
      </td>
    `;
  }

  if (columnId === "currentDividendYield") {
    return `<td class="${valueClass(metrics.currentDividendYield)}">${Number.isFinite(metrics.currentDividendYield) ? `${metrics.currentDividendYield.toFixed(2)}%` : "--"}</td>`;
  }

  if (columnId === "allocationPercent") {
    return `<td class="${valueClass(allocationPercent)}">${Number.isFinite(allocationPercent) ? allocationPercent.toFixed(1) : "--"}%</td>`;
  }

  if (columnId === "quantity") {
    return `<td class="${quantityClass}">${formatNumber(position.quantity)}</td>`;
  }

  if (columnId === "averageCost") {
    return `
      <td class="${averageCostClass}">
        ${formatCurrency(averageCostDisplay.value, averageCostDisplay.currency)}
        <div class="sub-value ${costValueClass}">${formatSensitiveCurrency(metrics.costValue)}</div>
      </td>
    `;
  }

  if (columnId === "price") {
    return `
      <td class="${quotePriceClass}">
        ${Number.isFinite(quotePriceDisplay.value) ? formatCurrency(quotePriceDisplay.value, quotePriceDisplay.currency) : "--"}
        <div class="sub-value ${changeClass}">
          ${Number.isFinite(change) ? formatPercent(change) : escapeHtml(quote?.source || "等待報價")}
        </div>
      </td>
    `;
  }

  if (columnId === "value") {
    return `<td class="${currentValueClass}">${formatSensitiveCurrency(metrics.currentValue)}</td>`;
  }

  if (columnId === "profit") {
    return `<td class="${profitAmountClass}">${formatWholeSensitiveCurrency(metrics.profit)}</td>`;
  }

  if (columnId === "profitPercent") {
    return `<td class="${profitPercentClass}">${formatPercent(metrics.profitPercent)}</td>`;
  }

  return "<td>--</td>";
}

function renderRowsLegacy() {
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
    const costCurrency = positionCostCurrency(position, quoteCurrency);
    const averageCostDisplay = convertUnitForDisplay(Number(position.averageCost), costCurrency, position);
    const quotePriceDisplay = convertUnitForDisplay(quotePrice, quoteCurrency, position);
    const badgeText = position.symbol.replace(/\..+$/, "").slice(0, 3).toUpperCase();
    const change = Number(quote?.changePercent);
    const quotePriceClass = valueClass(quotePriceDisplay.value);
    const changeClass = valueClass(change);
    const quantityClass = valueClass(position.quantity);
    const averageCostClass = valueClass(averageCostDisplay.value);
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
        ${formatCurrency(averageCostDisplay.value, averageCostDisplay.currency)}
        <div class="sub-value ${costValueClass}">${formatCurrency(metrics.costValue)}</div>
      </td>
      <td class="${quotePriceClass}">
        ${Number.isFinite(quotePriceDisplay.value) ? formatCurrency(quotePriceDisplay.value, quotePriceDisplay.currency) : "--"}
        <div class="sub-value ${changeClass}">
          ${Number.isFinite(change) ? formatPercent(change) : escapeHtml(quote?.source || "等待報價")}
        </div>
      </td>
      <td class="${currentValueClass}">${formatCurrency(metrics.currentValue)}</td>
      <td class="${profitClass}">${formatWholeSensitiveCurrency(metrics.profit)}</td>
      <td class="${valueClass(metrics.profitPercent)}">${formatPercent(metrics.profitPercent)}</td>
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
  if (field === "currentDividendYield") return Number(row.metrics.currentDividendYield);
  if (field === "allocationPercent") return Number(row.allocationPercent);
  if (field === "averageCost") {
    const costCurrency = positionCostCurrency(row.position, row.metrics.quoteCurrency);
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
  document.querySelectorAll("[data-sort-field]").forEach((button) => {
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
  const themeStyles = getComputedStyle(document.documentElement);
  const themeText = themeStyles.getPropertyValue("--text").trim();
  const themeMuted = themeStyles.getPropertyValue("--muted").trim();
  const themeLine = themeStyles.getPropertyValue("--line").trim();
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
    ctx.strokeStyle = themeLine;
    ctx.stroke();
    ctx.fillStyle = themeMuted;
    ctx.font = "700 16px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No Data", cx, cy + 5);
    renderAllocationInsights([], 0);
    if (updateLegend && dom.allocationLegend) dom.allocationLegend.innerHTML = `<small>尚無可繪製的市值資料</small>`;
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
    ctx.strokeStyle = segment.item.color;
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

  ctx.fillStyle = themeText;
  ctx.font = "800 20px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(formatCompactCurrency(total), cx, cy - 3);
  ctx.fillStyle = themeMuted;
  ctx.font = "700 12px system-ui, sans-serif";
  ctx.fillText(state.baseCurrency, cx, cy + 19);

  renderAllocationInsights(items, total);

  if (updateLegend && dom.allocationLegend) {
    dom.allocationLegend.innerHTML = chartItems
      .map((item, index) => {
        const pct = (item.value / total) * 100;
        const color = item.color;
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
  if (!dom.allocationLegend) return;
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
    const kind = item.position.kind || "manual";
    totals.set(kind, (totals.get(kind) || 0) + item.value);
    return totals;
  }, new Map());
  const kindRows = ALLOCATION_CATEGORIES
    .map((category) => {
      const value = kindTotals.get(category.kind) || 0;
      const pct = (value / total) * 100;
      return `
        <div class="mix-bar">
          <span class="mix-bar-label">${escapeHtml(category.label)}</span>
          <span class="mix-bar-track"><span class="mix-bar-fill" style="width:${pct.toFixed(1)}%;background:${category.color}"></span></span>
          <span class="mix-bar-value">${formatCompactCurrency(value)}</span>
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
  return ALLOCATION_CATEGORIES
    .map((category) => ({
      key: `kind:${category.kind}`,
      label: category.label,
      color: category.color,
      value: items
        .filter((item) => item.position.kind === category.kind)
        .reduce((sum, item) => sum + item.value, 0)
    }))
    .filter((item) => item.value > 0);
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

async function refreshPrices(options = {}) {
  const force = Boolean(options.force);
  const manual = Boolean(options.manual);

  if (force && state.isRefreshing) {
    activeRefreshRunId += 1;
    state.isRefreshing = false;
    state.refreshStartedAt = 0;
  } else if (state.isRefreshing) {
    clearStaleRefresh();
  }
  if (state.isRefreshing) {
    unlockRefreshButton();
    return;
  }
  const runId = activeRefreshRunId + 1;
  activeRefreshRunId = runId;
  state.isRefreshing = true;
  state.refreshMode = manual ? "manual" : "auto";
  state.refreshStartedAt = Date.now();
  state.quoteErrors = [];
  render();

  try {
    await fetchFxRates();
    if (runId !== activeRefreshRunId) return;
    await fetchMarketQuotes(() => runId === activeRefreshRunId);
    if (runId !== activeRefreshRunId) return;
    state.lastSync = Date.now();
    recordAssetHistory(calculatePortfolio());
    saveState();
  } finally {
    if (runId === activeRefreshRunId) {
      state.isRefreshing = false;
      state.refreshStartedAt = 0;
      state.refreshMode = "";
      render();
    } else {
      unlockRefreshButton();
    }
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

async function fetchMarketQuotes(isActive = () => true) {
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
      if (!isActive()) return;
      Object.assign(nextQuotes, cryptoQuotes);
      render();
    } catch (error) {
      console.warn("Crypto quote update failed", error);
    }
    const missingCryptoIds = cryptoIds.filter((id) => !nextQuotes[`crypto:${id}`]);
    await mapWithConcurrency(missingCryptoIds, 3, async (id) => {
      if (!isActive()) return;
      const key = `crypto:${id}`;
      const kind = stockKindForSymbol(id);
      if (!kind) {
        if (!nextQuotes[key]) state.quoteErrors.push(id);
        return;
      }
      try {
        nextQuotes[key] = await fetchStockQuote(id.toUpperCase(), kind);
        if (isActive()) render();
      } catch (error) {
        if (!nextQuotes[key]) state.quoteErrors.push(id);
        console.warn(`Stock fallback failed for ${id}`, error);
        if (isActive()) render();
      }
    });
  }

  if (stockTargets.length) {
    const orderedTargets = prioritizeMissingQuotes(stockTargets, nextQuotes);
    await mapWithConcurrency(orderedTargets, STOCK_QUOTE_CONCURRENCY, async ([symbol, kind], index) => {
      if (!isActive()) return;
      const key = `stock:${symbol}`;
      if (index > 0) await sleep(STOCK_QUOTE_DELAY_MS);
      if (!isActive()) return;
      try {
        nextQuotes[key] = await withRetry(() => fetchStockQuote(symbol, kind), 2, STOCK_QUOTE_DELAY_MS);
      } catch (error) {
        if (!nextQuotes[key]) state.quoteErrors.push(symbol);
        console.warn(`Stock quote failed for ${symbol}`, error);
      }
      if (isActive()) render();
    });
  }

  if (isActive()) state.quotes = nextQuotes;
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

function dividendKey(position) {
  return `dividend:${position.kind}:${getYahooSymbol(position.marketSymbol || position.symbol, position.kind).toUpperCase()}`;
}

function dividendProfileIsFresh(profile) {
  if (!profile || profile.error) return false;
  if (profile.methodVersion !== DIVIDEND_PROFILE_METHOD_VERSION) return false;
  return profile?.asOf && Date.now() - Number(profile.asOf) < DIVIDEND_CACHE_MS;
}

function getDividendTargets({ force = false } = {}) {
  return state.positions.filter((position) => {
    if (position.kind !== "us-stock" && position.kind !== "tw-stock") return false;
    if (force) return true;
    return !dividendProfileIsFresh(state.dividends.profiles[dividendKey(position)]);
  });
}

async function refreshDividendProfiles(options = {}) {
  const targets = getDividendTargets(options);
  if (!targets.length || state.dividends.isRefreshing) return;

  state.dividends.isRefreshing = true;
  state.dividends.errors = [];
  renderEntryQuickStats(calculatePortfolio());

  try {
    for (const position of targets) {
      const key = dividendKey(position);
      try {
        state.dividends.profiles[key] = await fetchDividendProfile(position);
      } catch (error) {
        state.dividends.errors.push(position.symbol);
        state.dividends.profiles[key] = {
          symbol: position.symbol,
          currency: position.kind === "tw-stock" ? "TWD" : "USD",
          annualPerShare: 0,
          yieldPercent: 0,
          monthAmounts: {},
          source: "股息資料暫缺",
          methodVersion: DIVIDEND_PROFILE_METHOD_VERSION,
          asOf: Date.now(),
          error: true,
          errorMessage: error.message || "無法取得股息資料"
        };
      }
      saveState({ sync: false });
      renderEntryQuickStats(calculatePortfolio());
      await sleep(DIVIDEND_FETCH_DELAY_MS);
    }
    state.dividends.lastSync = Date.now();
  } finally {
    state.dividends.isRefreshing = false;
    saveState({ sync: false });
    render();
  }
}

function handleRefreshClick() {
  markRefreshClicked();
  unlockRefreshButton();
  dom.refreshButton?.classList.add("is-clicked", "is-loading");
  dom.refreshButton?.setAttribute("aria-busy", "true");
  if (dom.refreshButtonLabel) dom.refreshButtonLabel.textContent = "更新中";
  if (dom.syncStatus) dom.syncStatus.textContent = "已點擊更新，正在重新同步市場價格...";
  refreshPrices({ force: true, manual: true });
  refreshDividendProfiles();
}

window.wealthtrackManualRefresh = handleRefreshClick;

async function fetchDividendProfile(position) {
  if (position.kind === "us-stock") {
    try {
      const morningstarProfile = await fetchMorningstarDividendProfile(position);
      const hasPaymentMonths = Object.keys(morningstarProfile.monthAmounts || {}).length > 0;
      if (hasPaymentMonths && Number(morningstarProfile.annualPerShare) > 0) return morningstarProfile;
    } catch (morningstarError) {
      console.warn("Morningstar payable-date dividend lookup failed", position.symbol, morningstarError);
    }
  }

  try {
    return await fetchYahooDividendProfile(position);
  } catch (yahooError) {
    if (position.kind === "us-stock") {
      try {
        return await fetchMorningstarDividendProfile(position);
      } catch (morningstarError) {
        throw yahooError;
      }
    }
    throw yahooError;
  }
}

async function fetchYahooDividendProfile(position) {
  const yahooSymbol = getYahooSymbol(position.marketSymbol || position.symbol, position.kind);
  const encoded = encodeURIComponent(yahooSymbol);
  let data = null;
  let lastError = null;
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    const url = `https://${host}/v8/finance/chart/${encoded}?range=5y&interval=1mo&events=div`;
    try {
      data = await fetchJson(url, { fallbackProxy: true, timeoutMs: 14_000 });
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!data) throw lastError || new Error("Yahoo dividend error");
  const error = data?.chart?.error;
  if (error) throw new Error(error.description || "Yahoo dividend error");

  const result = data?.chart?.result?.[0];
  const meta = result?.meta || {};
  const events = Object.values(result?.events?.dividends || {})
    .map((event) => ({
      dateMs: estimateYahooDividendPaymentDate(Number(event.date) * 1000, position),
      amount: Number(event.amount)
    }))
    .filter((event) => Number.isFinite(event.dateMs) && Number.isFinite(event.amount) && event.amount > 0)
    .sort((a, b) => b.dateMs - a.dateMs);

  return buildDividendProfileFromEvents({
    position,
    events,
    currency: meta.currency || (position.kind === "tw-stock" ? "TWD" : "USD"),
    price: Number(meta.regularMarketPrice),
    source: position.kind === "us-stock" ? "Yahoo Finance 除息紀錄推估配發月" : "Yahoo Finance 股息紀錄"
  });
}

async function fetchMorningstarDividendProfile(position) {
  const target = getMorningstarDividendTarget(position);
  if (!target) throw new Error("Morningstar target not supported");
  const markdown = await fetchText(`https://r.jina.ai/http://https://www.morningstar.com/${target.path}`, { timeoutMs: 14_000 });
  if (/Page Not Found|Access Denied|Too Many Requests/i.test(markdown)) throw new Error("Morningstar unavailable");

  const events = parseMorningstarDividendEvents(markdown);
  const yieldMatch = markdown.match(/Dividend Yield \(TTM\)\s*\n+\s*([0-9]+(?:\.[0-9]+)?)%/i);
  const profile = buildDividendProfileFromEvents({
    position,
    events,
    currency: target.currency,
    price: Number(calculatePosition(position).quote?.price),
    source: "Morningstar Payable Date"
  });
  if (yieldMatch && Number.isFinite(Number(yieldMatch[1]))) profile.yieldPercent = Number(yieldMatch[1]);
  return profile;
}

function getMorningstarDividendTarget(position) {
  if (position.kind !== "us-stock") return null;
  const symbol = getYahooSymbol(position.marketSymbol || position.symbol, position.kind).replace("-", ".").toLowerCase();
  const exchange = GOOGLE_FINANCE_EXCHANGE_HINTS[symbol.toUpperCase().replace(".B", "")] || GOOGLE_FINANCE_EXCHANGE_HINTS[symbol.toUpperCase()];
  const market = exchange === "NASDAQ" ? "xnas" : "xnys";
  return { path: `stocks/${market}/${encodeURIComponent(symbol)}/dividends`, currency: "USD" };
}

function isKnownMonthlyDividend(position) {
  if (position.kind !== "us-stock") return false;
  const symbol = getYahooSymbol(position.marketSymbol || position.symbol, position.kind)
    .replace("-", ".")
    .toUpperCase();
  return MONTHLY_DIVIDEND_SYMBOLS.has(symbol);
}

function parseMorningstarDividendEvents(markdown) {
  const rows = [];
  const seen = new Set();
  const cleanDate = (value) => String(value || "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const cleanAmount = (value) => Number(String(value || "").replace(/[^0-9.]/g, ""));

  for (const line of String(markdown || "").split(/\n+/)) {
    if (!/Cash Dividend/i.test(line) || !line.includes("|")) continue;
    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    const typeIndex = cells.findIndex((cell) => /Cash Dividend/i.test(cell));
    if (typeIndex < 4) continue;

    const payDate = Date.parse(cleanDate(cells[typeIndex - 1]));
    const amount = cleanAmount(cells[typeIndex + 1]);
    if (Number.isFinite(payDate) && Number.isFinite(amount) && amount > 0) {
      const key = `${payDate}:${amount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ dateMs: payDate, amount });
    }
  }
  return rows.sort((a, b) => b.dateMs - a.dateMs);
}

function estimateYahooDividendPaymentDate(dateMs, position) {
  if (position.kind !== "us-stock" || !Number.isFinite(dateMs)) return dateMs;
  const symbol = getYahooSymbol(position.marketSymbol || position.symbol, position.kind)
    .replace("-", ".")
    .toUpperCase();
  const exDate = new Date(dateMs);
  const delayDays = MONTHLY_DIVIDEND_SYMBOLS.has(symbol) ? 5 : 15;
  const estimated = new Date(exDate);
  estimated.setDate(estimated.getDate() + delayDays);
  return estimated.getTime();
}

function buildDividendProfileFromEvents({ position, events, currency, price, source }) {
  const inferredFrequency = inferDividendFrequency(events, position);
  if (!events.length || inferredFrequency <= 0) {
    return {
      symbol: position.symbol,
      currency,
      annualPerShare: 0,
      lastDividendPerShare: 0,
      yieldPercent: 0,
      monthAmounts: {},
      months: [],
      frequency: 0,
      source,
      methodVersion: DIVIDEND_PROFILE_METHOD_VERSION,
      asOf: Date.now()
    };
  }

  const cycleEvents = events.slice(0, Math.min(inferredFrequency, events.length));
  const monthAmounts = {};
  for (const event of cycleEvents) {
    const monthIndex = new Date(event.dateMs).getMonth();
    monthAmounts[monthIndex] = (Number(monthAmounts[monthIndex]) || 0) + Number(event.amount);
  }

  if (inferredFrequency === 12 && events[0]) {
    const observedAmounts = Object.values(monthAmounts)
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > 0);
    const fallbackMonthlyAmount = observedAmounts.length
      ? observedAmounts.reduce((sum, value) => sum + value, 0) / observedAmounts.length
      : Number(events[0].amount);
    for (let index = 0; index < 12; index += 1) {
      if (!Number.isFinite(Number(monthAmounts[index])) || Number(monthAmounts[index]) <= 0) {
        monthAmounts[index] = fallbackMonthlyAmount;
      }
    }
  }

  const cycleTotal = Object.values(monthAmounts).reduce((sum, value) => sum + Number(value || 0), 0);
  const annualPerShare = cycleTotal > 0 ? cycleTotal : Number(events[0].amount) * inferredFrequency;
  const fallbackPrice = Number(calculatePosition(position).quote?.price);
  const quotePrice = Number.isFinite(price) && price > 0 ? price : fallbackPrice;
  const yieldPercent = Number.isFinite(quotePrice) && quotePrice > 0
    ? (annualPerShare / quotePrice) * 100
    : NaN;

  return {
    symbol: position.symbol,
    currency,
    annualPerShare,
    lastDividendPerShare: Number(events[0]?.amount) || 0,
    yieldPercent,
    monthAmounts,
    months: Object.keys(monthAmounts).map(Number).sort((a, b) => a - b),
    frequency: inferredFrequency,
    source,
    methodVersion: DIVIDEND_PROFILE_METHOD_VERSION,
    asOf: Date.now()
  };
}

function inferDividendFrequency(events, position) {
  if (isKnownMonthlyDividend(position)) return 12;
  if (!events.length) return 0;
  const recentCutoff = Date.now() - 395 * 24 * 60 * 60 * 1000;
  const recentCount = events.filter((event) => event.dateMs >= recentCutoff).length;
  if (recentCount >= 10) return 12;
  if (recentCount >= 4) return 4;
  if (recentCount >= 2) return 2;

  if (events.length >= 2) {
    const sorted = [...events].sort((a, b) => a.dateMs - b.dateMs).slice(-8);
    const gaps = sorted.slice(1).map((event, index) => (event.dateMs - sorted[index].dateMs) / (24 * 60 * 60 * 1000));
    const medianGap = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    if (medianGap <= 45) return 12;
    if (medianGap <= 115) return 4;
    if (medianGap <= 220) return 2;
  }

  if (position.kind === "us-stock" && /ETF|Fund/i.test(position.name || "")) return 4;
  return 1;
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

    recordCurrentAssetHistory({ force: true });
    saveState();
    resetForm();
    render();
    refreshPrices();
    refreshDividendProfiles();
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
  delete state.dividends.profiles[dividendKey(position)];
  recordCurrentAssetHistory({ force: true });
  saveState();
  render();
  refreshDividendProfiles();
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

function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportPortfolioJson() {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "wealthtrack",
    version: 3,
    baseCurrency: state.baseCurrency,
    sortMode: state.sortMode,
    ui: {
      privacyMask: state.ui.privacyMask,
      columnOrder: normalizeColumnOrder(state.ui.columnOrder),
      theme: state.ui.theme
    },
    positions: state.positions
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  downloadFile(blob, `wealthtrack-backup-${new Date().toISOString().slice(0, 10)}.json`);
}

function spreadsheetRows() {
  const headers = [
    "類型",
    "代號",
    "名稱",
    "當前殖利率",
    "數量",
    "平均成本",
    "成本幣別",
    "現價",
    "現價幣別",
    `市值 (${state.baseCurrency})`,
    `損益金額 (${state.baseCurrency})`,
    "損益率",
    "報價來源",
    "報價時間"
  ];

  const rows = state.positions.map((position) => {
    const metrics = calculatePosition(position);
    const quotePrice = Number(metrics.quote?.price);
    const costCurrency = positionCostCurrency(position, metrics.quoteCurrency);
    const averageCostDisplay = convertUnitForDisplay(Number(position.averageCost), costCurrency, position);
    const quotePriceDisplay = convertUnitForDisplay(quotePrice, metrics.quoteCurrency, position);
    return [
      KIND_LABELS[position.kind] || position.kind,
      position.symbol,
      position.name,
      Number.isFinite(metrics.currentDividendYield) ? `${metrics.currentDividendYield.toFixed(2)}%` : "",
      Number(position.quantity),
      averageCostDisplay.value,
      averageCostDisplay.currency,
      Number.isFinite(quotePriceDisplay.value) ? quotePriceDisplay.value : "",
      quotePriceDisplay.currency,
      Number.isFinite(metrics.currentValue) ? metrics.currentValue : "",
      Number.isFinite(metrics.profit) ? metrics.profit : "",
      Number.isFinite(metrics.profitPercent) ? `${metrics.profitPercent.toFixed(2)}%` : "",
      metrics.quote?.source || "",
      metrics.quote?.asOf ? new Date(metrics.quote.asOf).toLocaleString("zh-TW") : ""
    ];
  });

  return [headers, ...rows];
}

function spreadsheetTsv() {
  return spreadsheetRows()
    .map((row) => row.map((value) =>
      String(value ?? "").replace(/[\t\r\n]+/g, " ")
    ).join("\t"))
    .join("\n");
}

function fallbackCopyText(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();
  const copied = document.execCommand("copy");
  textArea.remove();
  return copied;
}

async function exportToGoogleSheets() {
  const text = spreadsheetTsv();
  let copied = fallbackCopyText(text);
  let clipboardPromise = null;
  if (!copied && navigator.clipboard?.writeText) {
    clipboardPromise = navigator.clipboard.writeText(text);
  }
  const sheetTab = window.open("https://sheets.new", "_blank", "noopener");
  if (clipboardPromise) {
    try {
      await clipboardPromise;
      copied = true;
    } catch (error) {
      copied = false;
    }
  }
  if (!sheetTab) window.open("https://docs.google.com/spreadsheets/", "_blank", "noopener");
  window.alert(copied
    ? "已開啟新的 Google 試算表並複製持倉資料，請在 A1 儲存格貼上。"
    : "已開啟 Google 試算表，但瀏覽器未允許複製。請改用 Excel 匯出。");
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function excelColumnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function uint16(value) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function uint32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function joinBytes(parts) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

function createZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  const timestamp = zipDateTime();
  let offset = 0;

  files.forEach(({ name, content }) => {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const checksum = crc32(data);
    const localHeader = joinBytes([
      uint32(0x04034b50),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(timestamp.time),
      uint16(timestamp.date),
      uint32(checksum),
      uint32(data.length),
      uint32(data.length),
      uint16(nameBytes.length),
      uint16(0),
      nameBytes
    ]);
    localParts.push(localHeader, data);

    centralParts.push(joinBytes([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(timestamp.time),
      uint16(timestamp.date),
      uint32(checksum),
      uint32(data.length),
      uint32(data.length),
      uint16(nameBytes.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(offset),
      nameBytes
    ]));
    offset += localHeader.length + data.length;
  });

  const centralDirectory = joinBytes(centralParts);
  const endRecord = joinBytes([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(files.length),
    uint16(files.length),
    uint32(centralDirectory.length),
    uint32(offset),
    uint16(0)
  ]);
  return new Blob([...localParts, centralDirectory, endRecord], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

function exportPortfolioXlsx() {
  const rows = spreadsheetRows();
  const rowXml = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = `${excelColumnName(columnIndex)}${rowIndex + 1}`;
      if (typeof value === "number" && Number.isFinite(value)) {
        return `<c r="${reference}"><v>${value}</v></c>`;
      }
      const style = rowIndex === 0 ? ' s="1"' : "";
      return `<c r="${reference}" t="inlineStr"${style}><is><t>${xmlEscape(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const lastCell = `${excelColumnName(rows[0].length - 1)}${rows.length}`;
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastCell}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols><col min="1" max="3" width="18" customWidth="1"/><col min="4" max="11" width="14" customWidth="1"/><col min="12" max="13" width="22" customWidth="1"/></cols>
  <sheetData>${rowXml}</sheetData>
  <autoFilter ref="A1:${lastCell}"/>
</worksheet>`;
  const files = [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="資產持倉" sheetId="1" r:id="rId1"/></sheets></workbook>`
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
    },
    {
      name: "xl/styles.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B7A75"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`
    },
    { name: "xl/worksheets/sheet1.xml", content: worksheet }
  ];
  downloadFile(createZip(files), `wealthtrack-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function setExportMenu(open) {
  dom.exportMenu.classList.toggle("is-hidden", !open);
  dom.exportButton.setAttribute("aria-expanded", String(open));
}

function handleExport(format) {
  setExportMenu(false);
  if (format === "xlsx") exportPortfolioXlsx();
  if (format === "sheets") exportToGoogleSheets();
  if (format === "json") exportPortfolioJson();
}

function getCloudSettingsFromForm() {
  const token = dom.syncToken.value.trim();
  if (token) state.cloud.token = token;
  state.cloud.gistId = dom.syncGistId.value.trim();
  state.cloud.autoSync = dom.syncAuto.checked;
}

function encodeDeviceSyncPayload(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeDeviceSyncPayload(encoded) {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = window.atob(normalized + padding);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function importDeviceSyncFromHash() {
  if (!window.location.hash.startsWith(DEVICE_SYNC_HASH_PREFIX)) return false;
  try {
    const payload = decodeDeviceSyncPayload(window.location.hash.slice(DEVICE_SYNC_HASH_PREFIX.length));
    if (!payload || typeof payload.token !== "string" || !payload.token.trim()) {
      throw new Error("同步連結缺少 Token");
    }
    state.cloud.token = payload.token.trim();
    state.cloud.gistId = typeof payload.gistId === "string" ? payload.gistId.trim() : "";
    state.cloud.autoSync = true;
    state.cloud.status = "已連結新裝置，正在下載資料";
    saveState({ sync: false });
    return true;
  } catch (error) {
    console.warn("Unable to import device sync link", error);
    state.cloud.status = "新裝置同步連結無效";
    return false;
  } finally {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }
}

function buildDeviceSyncLink() {
  if (!state.cloud.token) throw new Error("請先設定 GitHub Token");
  if (!state.cloud.gistId) throw new Error("尚未建立同步檔，請先上傳雲端");
  const encoded = encodeDeviceSyncPayload({
    token: state.cloud.token,
    gistId: state.cloud.gistId
  });
  return `${window.location.origin}${window.location.pathname}${DEVICE_SYNC_HASH_PREFIX}${encoded}`;
}

async function copyDeviceSyncLink() {
  getCloudSettingsFromForm();
  if (!state.cloud.token) {
    window.alert("請先輸入 GitHub Token 並儲存設定");
    return;
  }
  state.cloud.autoSync = true;
  dom.syncAuto.checked = true;
  try {
    if (state.positions.length) {
      await uploadCloudSync({ silent: true });
    } else {
      const gist = await findCloudGist();
      if (!gist) throw new Error("找不到雲端同步資料");
      state.cloud.gistId = gist.id;
    }
    const link = buildDeviceSyncLink();
    saveState({ sync: false });
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link);
      state.cloud.status = "新裝置同步連結已複製";
      window.alert("同步連結已複製。請傳到手機或 Mac 開啟一次，資料會自動下載。");
    } else {
      window.prompt("請複製這個同步連結，並在新裝置開啟一次：", link);
      state.cloud.status = "新裝置同步連結已建立";
    }
  } catch (error) {
    state.cloud.status = "建立同步連結失敗";
    window.alert(error.message || "建立同步連結失敗");
  }
  renderCloudSync();
}

function portfolioSyncData() {
  return {
    baseCurrency: state.baseCurrency,
    sortMode: state.sortMode,
    ui: {
      privacyMask: state.ui.privacyMask,
      columnOrder: normalizeColumnOrder(state.ui.columnOrder),
      theme: state.ui.theme
    },
    history: {
      points: normalizeHistoryPoints(state.history.points),
      range: state.history.range
    },
    positions: state.positions
  };
}

function portfolioSyncHash() {
  return JSON.stringify(portfolioSyncData());
}

function buildCloudPayload() {
  return {
    app: "wealthtrack",
    version: 3,
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
  dom.copyDeviceSyncLinkButton.disabled = state.cloud.busy || !hasToken;
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
  if (payload.ui && typeof payload.ui === "object") {
    state.ui.privacyMask = Boolean(payload.ui.privacyMask);
    state.ui.columnOrder = normalizeColumnOrder(payload.ui.columnOrder);
    state.ui.theme = payload.ui.theme === "light" ? "light" : "dark";
  }
  if (payload.history && typeof payload.history === "object") {
    state.history.points = normalizeHistoryPoints(payload.history.points);
    state.history.range = Object.prototype.hasOwnProperty.call(HISTORY_RANGE_DAYS, payload.history.range) || payload.history.range === "since"
      ? payload.history.range
      : state.history.range;
  }
  state.cloud.lastPulledAt = Date.now();
  state.cloud.lastRemoteUpdatedAt = payload.updatedAt || null;
  state.cloud.lastHash = portfolioSyncHash();
  saveState({ sync: false });
  resetForm();
  render();
  refreshPrices();
  refreshDividendProfiles();
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

function renderColumnSettings() {
  if (!dom.columnOrderList) return;
  const order = normalizeColumnOrder(state.ui.columnOrder);
  state.ui.columnOrder = order;
  const privacyLabel = state.ui.privacyMask ? "金額遮罩開啟" : "金額正常顯示";
  dom.privacyMaskToggle.checked = state.ui.privacyMask;
  dom.privacyMaskState.textContent = privacyLabel;
  dom.columnSettingsSummary.textContent = `${privacyLabel}，${order.length} 個欄位`;
  dom.columnOrderList.innerHTML = order
    .map((columnId, index) => {
      const column = DATA_COLUMN_MAP[columnId];
      if (!column) return "";
      return `
        <div class="column-order-row" draggable="true" data-column-id="${escapeHtml(column.id)}">
          <span class="drag-handle" aria-hidden="true">☰</span>
          <strong>${escapeHtml(column.label)}</strong>
          <div class="column-order-actions">
            <button class="icon-button column-move-button" type="button" data-column-move="up" data-column-id="${escapeHtml(column.id)}" aria-label="${escapeHtml(column.label)} 上移" ${index === 0 ? "disabled" : ""}>↑</button>
            <button class="icon-button column-move-button" type="button" data-column-move="down" data-column-id="${escapeHtml(column.id)}" aria-label="${escapeHtml(column.label)} 下移" ${index === order.length - 1 ? "disabled" : ""}>↓</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function setPrivacyMask(enabled) {
  state.ui.privacyMask = Boolean(enabled);
  saveState();
  render();
}

function moveColumn(columnId, direction) {
  const order = normalizeColumnOrder(state.ui.columnOrder);
  const index = order.indexOf(columnId);
  if (index === -1) return;
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= order.length) return;
  [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
  state.ui.columnOrder = order;
  saveState();
  render();
}

function resetColumnOrder() {
  state.ui.columnOrder = [...DEFAULT_COLUMN_ORDER];
  saveState();
  render();
}

function renderThemeSettings() {
  const theme = state.ui.theme === "light" ? "light" : "dark";
  const label = theme === "light" ? "淺色" : "深色";
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#0b7a75" : "#101713");
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute("content", theme === "light" ? "default" : "black-translucent");
  dom.themeSettingsSummary.textContent = label;
  dom.themeSettingsState.textContent = `目前使用${label}`;
  dom.themeOptions.forEach((button) => {
    const isActive = button.dataset.themeOption === theme;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-checked", String(isActive));
  });
}

function setTheme(theme) {
  state.ui.theme = theme === "light" ? "light" : "dark";
  saveState();
  render();
}

function reorderColumnBefore(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const order = normalizeColumnOrder(state.ui.columnOrder).filter((id) => id !== sourceId);
  const targetIndex = order.indexOf(targetId);
  if (targetIndex === -1) return;
  order.splice(targetIndex, 0, sourceId);
  state.ui.columnOrder = order;
  saveState();
  render();
}

function showMenuPanel(panel) {
  const showTokenSettings = panel === "token";
  const showColumnSettings = panel === "columns";
  const showThemeSettings = panel === "theme";
  dom.menuMainPanel.classList.toggle("is-hidden", showTokenSettings || showColumnSettings || showThemeSettings);
  dom.tokenSettingsPanel.classList.toggle("is-hidden", !showTokenSettings);
  dom.columnSettingsPanel.classList.toggle("is-hidden", !showColumnSettings);
  dom.themeSettingsPanel.classList.toggle("is-hidden", !showThemeSettings);
  if (showColumnSettings) renderColumnSettings();
  if (showThemeSettings) renderThemeSettings();
}

function openTokenSettings() {
  showMenuPanel("token");
  renderCloudSync();
}

function openColumnSettings() {
  showMenuPanel("columns");
  renderColumnSettings();
}

function openThemeSettings() {
  showMenuPanel("theme");
  renderThemeSettings();
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
  dom.refreshButton.addEventListener("click", handleRefreshClick);
  dom.menuButton.addEventListener("click", openMenu);
  dom.closeMenuButton.addEventListener("click", closeMenu);
  dom.menuBackdrop.addEventListener("click", closeMenu);
  dom.tokenSettingsButton.addEventListener("click", openTokenSettings);
  dom.backToMenuButton.addEventListener("click", () => showMenuPanel("main"));
  dom.columnSettingsButton.addEventListener("click", openColumnSettings);
  dom.backToMenuFromColumnsButton.addEventListener("click", () => showMenuPanel("main"));
  dom.themeSettingsButton.addEventListener("click", openThemeSettings);
  dom.backToMenuFromThemeButton.addEventListener("click", () => showMenuPanel("main"));
  dom.themeOptions.forEach((button) => {
    button.addEventListener("click", () => setTheme(button.dataset.themeOption));
  });
  dom.growthRangeButtons.forEach((button) => {
    button.addEventListener("click", () => setGrowthRange(button.dataset.growthRange));
  });
  dom.privacyMaskToggle.addEventListener("change", () => setPrivacyMask(dom.privacyMaskToggle.checked));
  dom.resetColumnOrderButton.addEventListener("click", resetColumnOrder);
  dom.columnOrderList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-column-move]");
    if (!button) return;
    moveColumn(button.dataset.columnId, button.dataset.columnMove);
  });
  dom.columnOrderList.addEventListener("dragstart", (event) => {
    const row = event.target.closest("[data-column-id]");
    if (!row) return;
    event.dataTransfer.setData("text/plain", row.dataset.columnId);
    event.dataTransfer.effectAllowed = "move";
  });
  dom.columnOrderList.addEventListener("dragover", (event) => {
    if (!event.target.closest("[data-column-id]")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });
  dom.columnOrderList.addEventListener("drop", (event) => {
    const row = event.target.closest("[data-column-id]");
    if (!row) return;
    event.preventDefault();
    reorderColumnBefore(event.dataTransfer.getData("text/plain"), row.dataset.columnId);
  });
  dom.cancelEditButton.addEventListener("click", resetForm);
  dom.exportButton.addEventListener("click", (event) => {
    event.stopPropagation();
    setExportMenu(dom.exportMenu.classList.contains("is-hidden"));
  });
  dom.exportOptions.forEach((button) => {
    button.addEventListener("click", () => handleExport(button.dataset.exportFormat));
  });
  dom.syncSaveButton.addEventListener("click", saveCloudSettings);
  dom.cloudUploadButton.addEventListener("click", () => uploadCloudSync());
  dom.cloudDownloadButton.addEventListener("click", () => downloadCloudSync());
  dom.copyDeviceSyncLinkButton.addEventListener("click", copyDeviceSyncLink);
  dom.syncClearTokenButton.addEventListener("click", clearCloudToken);
  dom.syncAuto.addEventListener("change", saveCloudSettings);
  dom.syncToken.addEventListener("input", renderCloudSync);
  dom.syncGistId.addEventListener("input", renderCloudSync);
  dom.positionSearch.addEventListener("input", renderRows);
  dom.positionsHeadRow.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sort-field]");
    if (!button) return;
    setSortField(button.dataset.sortField);
  });
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
    if (button) {
      const id = button.dataset.id;
      if (button.dataset.action === "edit") editPosition(id);
      if (button.dataset.action === "delete") deletePosition(id);
      return;
    }
    const row = event.target.closest(".position-row[data-position-id]");
    if (row) openPositionDetail(row.dataset.positionId);
  });

  dom.positionsBody.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest(".position-row[data-position-id]");
    if (!row) return;
    event.preventDefault();
    openPositionDetail(row.dataset.positionId);
  });

  if (dom.allocationLegend) {
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
  }

  document.addEventListener("visibilitychange", () => {
    const stale = !state.lastSync || Date.now() - state.lastSync > REFRESH_MS;
    if (document.visibilityState === "visible" && stale && state.positions.length) refreshPrices();
  });

  document.addEventListener("click", (event) => {
    if (!dom.exportControl.contains(event.target)) setExportMenu(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    setExportMenu(false);
    if (!dom.appMenu.classList.contains("is-hidden")) closeMenu();
  });

  window.addEventListener("resize", () => {
    drawAllocationChart();
    drawGrowthChart(calculatePortfolio());
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol === "file:") return;
  navigator.serviceWorker.register("./service-worker-v47.js", { scope: "./" }).catch((error) => {
    console.warn("Service worker registration failed", error);
  });
}

loadState();
const importedDeviceSync = importDeviceSyncFromHash();
bindEvents();
updateKindMode();
render();
registerServiceWorker();

unlockRefreshButton();
setInterval(unlockRefreshButton, 2_000);

if (importedDeviceSync || (state.cloud.autoSync && state.cloud.token)) {
  downloadCloudSync({ silent: !importedDeviceSync, overwrite: importedDeviceSync || !state.positions.length }).catch((error) => {
    console.warn("Startup cloud sync failed", error);
  });
}

if (state.positions.length) {
  refreshPrices();
  refreshDividendProfiles();
}

setInterval(() => {
  if (state.positions.length && document.visibilityState === "visible") refreshPrices();
}, REFRESH_MS);
