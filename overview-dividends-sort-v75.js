(function () {
  const PATCH_KEY = "wealthtrack.dividendSort.v89";
  if (window[PATCH_KEY]) return;
  window[PATCH_KEY] = true;
  let renderingDividendSortV75 = false;

  const MONTHLY_SYMBOLS_V75 = new Set(["O", "SGOV", "ANGL"]);
  const KNOWN_DIVIDEND_SCHEDULES_V75 = {
    "0056.TW": [0, 3, 6, 9],
    "00878.TW": [1, 4, 7, 10],
    "00713.TW": [2, 5, 8, 11],
    "0050.TW": [0, 6],
    AAPL: [1, 4, 7, 10],
    ASML: [4, 10],
    AWR: [2, 5, 8, 11],
    BAC: [2, 5, 8, 11],
    BEN: [0, 3, 6, 9],
    CCL: [1, 4, 7, 10],
    COST: [1, 4, 7, 10],
    DIS: [0, 6],
    EL: [2, 5, 8, 11],
    GIS: [1, 4, 7, 10],
    GOOGL: [2, 5, 8, 11],
    HRL: [1, 4, 7, 10],
    JPM: [0, 3, 6, 9],
    JNJ: [2, 5, 8, 11],
    KHC: [2, 5, 8, 11],
    KO: [3, 6, 9, 11],
    MA: [1, 4, 7, 10],
    MCD: [2, 5, 8, 11],
    META: [2, 5, 8, 11],
    MMM: [2, 5, 8, 11],
    MSFT: [2, 5, 8, 11],
    NVDA: [2, 5, 8, 11],
    PEP: [0, 2, 5, 8],
    PG: [1, 4, 7, 10],
    SBUX: [1, 4, 7, 10],
    T: [1, 4, 7, 10],
    TSM: [0, 3, 6, 9],
    V: [2, 5, 8, 11],
    VOO: [2, 5, 8, 11],
    VXUS: [2, 5, 8, 11],
    WFC: [2, 5, 8, 11],
    WMT: [0, 3, 5, 8],
    WTRG: [2, 5, 8, 11],
    XOM: [2, 5, 8, 11],
    YORW: [0, 3, 6, 9]
  };
  const QUARTERLY_DIVIDEND_SCHEDULES_V75 = [
    [0, 3, 6, 9],
    [1, 4, 7, 10],
    [2, 5, 8, 11]
  ];
  const DIVIDEND_SOURCE_NOTE_V75 = "美股以 Payable Date 配發月估算並預扣 30% 股息稅；複委託實際入帳可能晚 1-3 個工作天；台股未扣二代健保、匯費。";
  const DIVIDEND_SORT_STORAGE_KEY = "wealthtrack.dividendSortMode";
  const DIVIDEND_SORT_DEFAULTS = {
    source: "asc",
    annualValue: "desc",
    yieldPercent: "desc",
    dividendShare: "desc"
  };
  const DIVIDEND_SCROLL_IDLE_MS = 1400;
  let dividendPayerScrollTopV75 = 0;
  let dividendPayerIsRestoringV75 = false;
  let dividendPayerUserScrollUntilV75 = 0;
  let pendingDividendRenderTimerV75 = 0;
  let patchedNativeEntryQuickStatsV75 = false;
  let activeMonthTooltipCardV75 = null;
  let pinnedMonthTooltipCardV75 = null;
  let monthTooltipHideTimerV75 = 0;
  let monthTooltipRepositionFrameV75 = 0;

  function ensureDividendSortStyles() {
    const existing = document.querySelector('link[href^="overview-dividends-sort-v75.css"]');
    if (existing) {
      if (!String(existing.getAttribute("href") || "").includes("v=89")) {
        existing.href = "overview-dividends-sort-v75.css?v=89";
      }
      return;
    }
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "overview-dividends-sort-v75.css?v=89";
    document.head.appendChild(stylesheet);
  }

  function getDividendPayersScrollerV75() {
    return document.querySelector("#entryQuickStats .dividend-payers");
  }

  function getCurrentDividendScrollTopV75() {
    const scroller = getDividendPayersScrollerV75();
    if (!scroller) return dividendPayerScrollTopV75;
    const currentTop = scroller.scrollTop;
    if (currentTop > 0 || dividendPayerScrollTopV75 === 0) return currentTop;
    return dividendPayerScrollTopV75;
  }

  function bindDividendPayerScrollMemoryV75() {
    const scroller = getDividendPayersScrollerV75();
    if (!scroller || scroller.__wealthtrackDividendScrollV75) return;
    scroller.__wealthtrackDividendScrollV75 = true;
    scroller.addEventListener("scroll", () => {
      if (dividendPayerIsRestoringV75) return;
      dividendPayerScrollTopV75 = scroller.scrollTop;
      dividendPayerUserScrollUntilV75 = Date.now() + DIVIDEND_SCROLL_IDLE_MS;
    }, { passive: true });
    ["wheel", "touchmove", "pointerdown"].forEach((eventName) => {
      scroller.addEventListener(eventName, () => {
        dividendPayerUserScrollUntilV75 = Date.now() + DIVIDEND_SCROLL_IDLE_MS;
      }, { passive: true });
    });
  }

  function restoreDividendPayerScrollV75(scrollTop = dividendPayerScrollTopV75) {
    const scroller = getDividendPayersScrollerV75();
    if (!scroller) return;
    const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const nextTop = Math.min(Math.max(0, Number(scrollTop) || 0), maxScroll);
    if (Math.abs(scroller.scrollTop - nextTop) < 1) return;
    dividendPayerIsRestoringV75 = true;
    scroller.scrollTop = nextTop;
    dividendPayerScrollTopV75 = nextTop;
    requestAnimationFrame(() => {
      dividendPayerIsRestoringV75 = false;
    });
  }

  function restoreDividendPayerScrollSoonV75(scrollTop = dividendPayerScrollTopV75) {
    requestAnimationFrame(() => restoreDividendPayerScrollV75(scrollTop));
  }

  function dividendPayerIsUserScrollingV75() {
    const scroller = getDividendPayersScrollerV75();
    return Boolean(scroller && Date.now() < dividendPayerUserScrollUntilV75);
  }

  function scheduleDeferredDividendRenderV75(scrollTop = dividendPayerScrollTopV75) {
    clearTimeout(pendingDividendRenderTimerV75);
    pendingDividendRenderTimerV75 = setTimeout(() => {
      pendingDividendRenderTimerV75 = 0;
      renderEntryQuickStatsV75(scrollTop, { force: true });
    }, DIVIDEND_SCROLL_IDLE_MS + 120);
  }

  function readDividendSortModeV75() {
    try {
      return localStorage.getItem(DIVIDEND_SORT_STORAGE_KEY) || "annualValue-desc";
    } catch (error) {
      return "annualValue-desc";
    }
  }

  function writeDividendSortModeV75(mode) {
    try {
      localStorage.setItem(DIVIDEND_SORT_STORAGE_KEY, mode);
    } catch (error) {
      console.warn("Dividend sort preference was not saved", error);
    }
  }

  function parseDividendSortModeV75() {
    const [field = "annualValue", rawDirection = "desc"] = String(readDividendSortModeV75()).split("-");
    const safeField = Object.prototype.hasOwnProperty.call(DIVIDEND_SORT_DEFAULTS, field) ? field : "annualValue";
    return {
      field: safeField,
      direction: rawDirection === "asc" ? "asc" : "desc"
    };
  }

  function setDividendSortFieldV75(field) {
    if (!Object.prototype.hasOwnProperty.call(DIVIDEND_SORT_DEFAULTS, field)) return;
    const current = parseDividendSortModeV75();
    const defaultDirection = DIVIDEND_SORT_DEFAULTS[field] || "desc";
    const direction = current.field === field ? (current.direction === "asc" ? "desc" : "asc") : defaultDirection;
    writeDividendSortModeV75(`${field}-${direction}`);
    renderEntryQuickStatsV75(0, { force: true });
  }

  function updateDividendSortButtonsV75(target) {
    const { field, direction } = parseDividendSortModeV75();
    target.querySelectorAll("[data-dividend-sort-field]").forEach((button) => {
      const isActive = button.dataset.dividendSortField === field;
      const label = button.dataset.sortLabel || button.textContent.trim().replace(/[↕↑↓]/g, "");
      button.classList.toggle("is-active", isActive);
      button.dataset.sortDirection = isActive ? direction : "";
      button.setAttribute("aria-label", `${label}排序，${isActive ? (direction === "asc" ? "目前低到高" : "目前高到低") : "未排序"}`);
    });
  }

  function bindDividendSortButtonsV75(target) {
    target.querySelectorAll("[data-dividend-sort-field]").forEach((button) => {
      button.addEventListener("click", () => setDividendSortFieldV75(button.dataset.dividendSortField));
    });
    updateDividendSortButtonsV75(target);
  }

  function getFloatingMonthTooltipV75() {
    let tooltip = document.querySelector(".dividend-month-floating-tooltip");
    if (tooltip) return tooltip;

    tooltip = document.createElement("div");
    tooltip.className = "dividend-month-floating-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.addEventListener("click", (event) => event.stopPropagation());
    tooltip.addEventListener("mouseenter", () => clearTimeout(monthTooltipHideTimerV75));
    tooltip.addEventListener("mouseleave", () => {
      if (!pinnedMonthTooltipCardV75) hideFloatingMonthTooltipV75();
    });
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function markMonthTooltipCardV75(card, isOpen) {
    if (!card) return;
    card.classList.toggle("is-pinned", Boolean(isOpen && pinnedMonthTooltipCardV75 === card));
    card.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  function positionFloatingMonthTooltipV75(card) {
    const tooltip = document.querySelector(".dividend-month-floating-tooltip");
    if (!card || !tooltip || !tooltip.classList.contains("is-visible")) return;

    tooltip.style.visibility = "hidden";
    tooltip.style.left = "0px";
    tooltip.style.top = "0px";
    const viewportPad = 12;
    const cardRect = card.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const width = Math.min(Math.max(360, cardRect.width * 1.55), window.innerWidth - viewportPad * 2, 640);
    tooltip.style.width = `${Math.max(280, width)}px`;

    const measured = tooltip.getBoundingClientRect();
    let left = cardRect.left;
    if (left + measured.width > window.innerWidth - viewportPad) {
      left = window.innerWidth - measured.width - viewportPad;
    }
    left = Math.max(viewportPad, left);

    let top = cardRect.top - measured.height - 12;
    if (top < viewportPad) top = cardRect.bottom + 12;
    if (top + measured.height > window.innerHeight - viewportPad) {
      top = Math.max(viewportPad, window.innerHeight - measured.height - viewportPad);
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.visibility = "visible";
  }

  function scheduleMonthTooltipPositionV75() {
    if (!activeMonthTooltipCardV75) return;
    cancelAnimationFrame(monthTooltipRepositionFrameV75);
    monthTooltipRepositionFrameV75 = requestAnimationFrame(() => {
      monthTooltipRepositionFrameV75 = 0;
      positionFloatingMonthTooltipV75(activeMonthTooltipCardV75);
    });
  }

  function showFloatingMonthTooltipV75(card, options = {}) {
    if (!card) return;
    clearTimeout(monthTooltipHideTimerV75);
    const source = card.querySelector(".dividend-month-tooltip");
    if (!source) return;

    const tooltip = getFloatingMonthTooltipV75();
    tooltip.innerHTML = source.innerHTML;
    tooltip.dataset.monthIndex = card.dataset.monthIndex || "";
    tooltip.classList.add("is-visible");

    if (activeMonthTooltipCardV75 && activeMonthTooltipCardV75 !== card && activeMonthTooltipCardV75 !== pinnedMonthTooltipCardV75) {
      markMonthTooltipCardV75(activeMonthTooltipCardV75, false);
    }
    activeMonthTooltipCardV75 = card;

    if (options.pin) {
      if (pinnedMonthTooltipCardV75 && pinnedMonthTooltipCardV75 !== card) {
        markMonthTooltipCardV75(pinnedMonthTooltipCardV75, false);
      }
      pinnedMonthTooltipCardV75 = card;
    }

    markMonthTooltipCardV75(card, true);
    positionFloatingMonthTooltipV75(card);
  }

  function hideFloatingMonthTooltipV75(options = {}) {
    if (pinnedMonthTooltipCardV75 && !options.force) return;
    clearTimeout(monthTooltipHideTimerV75);
    cancelAnimationFrame(monthTooltipRepositionFrameV75);
    monthTooltipRepositionFrameV75 = 0;

    const tooltip = document.querySelector(".dividend-month-floating-tooltip");
    if (tooltip) {
      tooltip.classList.remove("is-visible");
      tooltip.removeAttribute("data-month-index");
    }

    if (activeMonthTooltipCardV75) markMonthTooltipCardV75(activeMonthTooltipCardV75, false);
    if (pinnedMonthTooltipCardV75) markMonthTooltipCardV75(pinnedMonthTooltipCardV75, false);
    activeMonthTooltipCardV75 = null;
    pinnedMonthTooltipCardV75 = null;
  }

  function scheduleHideFloatingMonthTooltipV75(card) {
    if (pinnedMonthTooltipCardV75) return;
    clearTimeout(monthTooltipHideTimerV75);
    monthTooltipHideTimerV75 = setTimeout(() => {
      if (activeMonthTooltipCardV75 === card) hideFloatingMonthTooltipV75({ force: true });
    }, 160);
  }

  function clearPinnedMonthTooltipsV75(root = document) {
    root.querySelectorAll(".dividend-month-card.is-pinned").forEach((card) => {
      card.classList.remove("is-pinned");
      card.setAttribute("aria-expanded", "false");
    });
    hideFloatingMonthTooltipV75({ force: true });
  }

  function bindDividendMonthTooltipsV75(target) {
    if (!document.__wealthtrackDividendMonthDismissV75) {
      document.__wealthtrackDividendMonthDismissV75 = true;
      document.addEventListener("click", (event) => {
        if (event.target.closest("#entryQuickStats .dividend-month-card")) return;
        if (event.target.closest(".dividend-month-floating-tooltip")) return;
        clearPinnedMonthTooltipsV75();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") clearPinnedMonthTooltipsV75();
      });
      window.addEventListener("resize", scheduleMonthTooltipPositionV75, { passive: true });
      window.addEventListener("scroll", scheduleMonthTooltipPositionV75, { passive: true, capture: true });
    }

    target.querySelectorAll(".dividend-month-card").forEach((card) => {
      if (card.__wealthtrackDividendMonthTooltipV75) return;
      card.__wealthtrackDividendMonthTooltipV75 = true;
      card.setAttribute("aria-expanded", "false");
      card.addEventListener("mouseenter", () => {
        if (!pinnedMonthTooltipCardV75) showFloatingMonthTooltipV75(card);
      });
      card.addEventListener("mouseleave", () => scheduleHideFloatingMonthTooltipV75(card));
      card.addEventListener("focusin", () => {
        if (!pinnedMonthTooltipCardV75) showFloatingMonthTooltipV75(card);
      });
      card.addEventListener("focusout", () => scheduleHideFloatingMonthTooltipV75(card));
      card.addEventListener("click", (event) => {
        if (event.target.closest(".dividend-month-tooltip")) return;
        event.stopPropagation();
        const shouldPin = pinnedMonthTooltipCardV75 !== card;
        clearPinnedMonthTooltipsV75(target);
        if (shouldPin) {
          showFloatingMonthTooltipV75(card, { pin: true });
          try {
            card.focus({ preventScroll: true });
          } catch (error) {
            card.focus();
          }
        } else {
          hideFloatingMonthTooltipV75({ force: true });
        }
      });
      card.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          clearPinnedMonthTooltipsV75(target);
          return;
        }
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        card.click();
      });
    });
  }

  function normalizeSymbolForDividendV75(position) {
    const raw = getYahooSymbol(position.marketSymbol || position.symbol, position.kind);
    return String(raw || position.symbol || "").replace("-", ".").toUpperCase();
  }

  function isMonthlyDividendPositionV75(position) {
    return position?.kind === "us-stock" && MONTHLY_SYMBOLS_V75.has(normalizeSymbolForDividendV75(position));
  }

  function sanitizeMonthAmountsV75(rawMonthAmounts) {
    const result = {};
    if (!rawMonthAmounts || typeof rawMonthAmounts !== "object") return result;

    const entries = Object.entries(rawMonthAmounts);
    const numericKeys = entries
      .map(([key]) => Number(key))
      .filter((key) => Number.isFinite(key));
    const looksOneBased = numericKeys.includes(12) && !numericKeys.includes(0);

    for (const [key, rawValue] of entries) {
      const numericKey = Number(key);
      const index = looksOneBased ? numericKey - 1 : numericKey;
      const monthIndex = Math.trunc(index);
      const amount = Number(rawValue);
      if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) continue;
      if (!Number.isFinite(amount) || amount <= 0) continue;
      result[monthIndex] = (Number(result[monthIndex]) || 0) + amount;
    }

    return result;
  }

  function getKnownDividendScheduleV75(position) {
    const symbol = normalizeSymbolForDividendV75(position);
    if (isMonthlyDividendPositionV75(position)) {
      return Array.from({ length: 12 }, (_, index) => index);
    }
    return KNOWN_DIVIDEND_SCHEDULES_V75[symbol] || null;
  }

  function hasDividendEvidenceV75(monthAmounts, profile) {
    const annualPerShare = Number(profile?.annualPerShare);
    const lastDividendPerShare = Number(profile?.lastDividendPerShare);
    const yieldPercent = Number(profile?.yieldPercent);
    return Object.keys(monthAmounts || {}).length > 0
      || (Number.isFinite(annualPerShare) && annualPerShare > 0)
      || (Number.isFinite(lastDividendPerShare) && lastDividendPerShare > 0)
      || (Number.isFinite(yieldPercent) && yieldPercent > 0);
  }

  function inferQuarterlyDividendScheduleV75(monthAmounts, profile) {
    const monthKeys = Object.keys(monthAmounts)
      .map(Number)
      .filter((index) => Number.isInteger(index) && index >= 0 && index <= 11);
    const profileMonths = Array.isArray(profile?.months)
      ? profile.months
          .map(Number)
          .filter((index) => Number.isInteger(index) && index >= 0 && index <= 11)
      : [];
    const observedMonths = Array.from(new Set([...monthKeys, ...profileMonths])).sort((a, b) => a - b);
    const frequency = Number(profile?.frequency);

    if (Number.isFinite(frequency) && frequency >= 10) {
      return Array.from({ length: 12 }, (_, index) => index);
    }

    if (!observedMonths.length) return null;
    const observedSet = new Set(observedMonths);
    let bestSchedule = null;
    let bestScore = 0;

    for (const schedule of QUARTERLY_DIVIDEND_SCHEDULES_V75) {
      const score = schedule.filter((monthIndex) => observedSet.has(monthIndex)).length;
      if (score > bestScore) {
        bestScore = score;
        bestSchedule = schedule;
      }
    }

    if (Number.isFinite(frequency) && frequency >= 4 && bestScore >= 1) return bestSchedule;
    if (observedMonths.length >= 2 && bestScore >= 2) return bestSchedule;
    if (observedMonths.length === 1 && bestScore >= 1 && hasDividendEvidenceV75(monthAmounts, profile)) return bestSchedule;
    return null;
  }

  function getFallbackMonthAmountV75(monthAmounts, profile, scheduleLength) {
    const observedAmounts = Object.values(monthAmounts)
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > 0);
    if (observedAmounts.length) {
      return observedAmounts.reduce((sum, value) => sum + value, 0) / observedAmounts.length;
    }

    const annualPerShare = Number(profile?.annualPerShare);
    if (Number.isFinite(annualPerShare) && annualPerShare > 0 && scheduleLength > 0) {
      return annualPerShare / scheduleLength;
    }

    const lastDividendPerShare = Number(profile?.lastDividendPerShare);
    return Number.isFinite(lastDividendPerShare) && lastDividendPerShare > 0 ? lastDividendPerShare : 0;
  }

  function buildScheduledMonthAmountsV75(monthAmounts, schedule, fallbackAmount, options = {}) {
    const result = options.keepExisting ? { ...monthAmounts } : {};
    for (const monthIndex of schedule || []) {
      const existingAmount = Number(monthAmounts[monthIndex]);
      result[monthIndex] = Number.isFinite(existingAmount) && existingAmount > 0
        ? existingAmount
        : fallbackAmount;
    }
    return result;
  }

  function getNormalizedMonthAmountsV75(row) {
    const profile = row.profile || {};
    const monthAmounts = sanitizeMonthAmountsV75(profile.monthAmounts);
    const knownSchedule = getKnownDividendScheduleV75(row.position);

    if (knownSchedule) {
      const fallbackAmount = getFallbackMonthAmountV75(monthAmounts, profile, knownSchedule.length);
      if (fallbackAmount <= 0) return monthAmounts;
      return buildScheduledMonthAmountsV75(monthAmounts, knownSchedule, fallbackAmount);
    }

    const inferredSchedule = inferQuarterlyDividendScheduleV75(monthAmounts, profile);
    if (!inferredSchedule) return monthAmounts;

    const fallbackAmount = getFallbackMonthAmountV75(monthAmounts, profile, inferredSchedule.length);
    if (fallbackAmount <= 0) return monthAmounts;
    return buildScheduledMonthAmountsV75(monthAmounts, inferredSchedule, fallbackAmount, { keepExisting: true });
  }

  function compareDividendPayersV75(a, b) {
    const { field, direction } = parseDividendSortModeV75();
    const dir = direction === "asc" ? 1 : -1;

    if (field === "source") {
      return `${a.symbol}`.localeCompare(`${b.symbol}`, "zh-Hant-u-kn-true") * dir;
    }

    const av = Number(a[field]);
    const bv = Number(b[field]);
    const aOk = Number.isFinite(av);
    const bOk = Number.isFinite(bv);
    if (aOk && bOk && av !== bv) return (av - bv) * dir;
    if (aOk !== bOk) return aOk ? -1 : 1;
    return `${a.symbol}`.localeCompare(`${b.symbol}`, "zh-Hant-u-kn-true");
  }

  function calculateDividendSummaryV75(rows) {
    const monthTotals = Array(12).fill(0);
    const monthPayers = Array.from({ length: 12 }, () => []);
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
      const monthAmounts = getNormalizedMonthAmountsV75(row);
      let annualValue = 0;

      for (const [monthIndex, amountPerShare] of Object.entries(monthAmounts)) {
        const index = Number(monthIndex);
        const amount = Number(amountPerShare) * Number(row.position.quantity) * taxFactor;
        if (!Number.isInteger(index) || index < 0 || index > 11 || !Number.isFinite(amount)) continue;
        const converted = convertCurrency(amount, currency, state.baseCurrency);
        if (!Number.isFinite(converted)) continue;
        monthTotals[index] += converted;
        monthPayers[index].push({
          symbol: row.position.symbol,
          value: converted,
          yieldPercent: Number(profile.yieldPercent) * taxFactor
        });
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
          dividendShare: 0,
          months: Object.keys(monthAmounts)
            .map(Number)
            .filter((index) => Number.isInteger(index) && index >= 0 && index <= 11)
            .sort((a, b) => a - b)
        });
      }
    }

    const annualTotal = monthTotals.reduce((sum, value) => sum + value, 0);
    payers.forEach((payer) => {
      payer.dividendShare = annualTotal > 0 ? (payer.annualValue / annualTotal) * 100 : NaN;
    });
    monthPayers.forEach((items) => items.sort((a, b) => b.value - a.value || `${a.symbol}`.localeCompare(`${b.symbol}`, "zh-Hant-u-kn-true")));

    return {
      monthTotals,
      monthPayers,
      annualTotal,
      monthAverage: annualTotal / 12,
      readyCount,
      missingCount,
      payers: payers.sort(compareDividendPayersV75)
    };
  }

  function formatPayoutMonthsV75(months) {
    if (!Array.isArray(months) || !months.length) return "尚無配息月份";
    if (months.length >= 12) return "每月";
    return months.map((monthIndex) => MONTH_LABELS[monthIndex]).join("、");
  }

  function renderMonthTooltipV75(monthIndex, payers, totalValue) {
    const safePayers = Array.isArray(payers) ? payers : [];
    const rows = safePayers
      .map((payer) => `
        <div class="dividend-month-tooltip-row">
          <span>${escapeHtml(payer.symbol)}</span>
          <strong class="${sensitiveClass(payer.value)}">${formatWholeSensitiveCurrency(payer.value)}</strong>
        </div>
      `)
      .join("");

    return `
      <div class="dividend-month-tooltip" role="tooltip">
        <div class="dividend-month-tooltip-title">
          <span>${MONTH_LABELS[monthIndex]}配息</span>
          <strong class="${sensitiveClass(totalValue)}">${totalValue > 0 ? formatWholeSensitiveCurrency(totalValue) : "--"}</strong>
        </div>
        <small class="dividend-month-tooltip-hint">點月份固定，再點一次收起</small>
        ${rows ? `<div class="dividend-month-tooltip-list">${rows}</div>` : `<small>這個月暫無配息標的</small>`}
      </div>
    `;
  }

  function renderEntryQuickStatsV75(scrollTopBeforeRender = getCurrentDividendScrollTopV75(), options = {}) {
    ensureDividendSortStyles();
    const target = document.getElementById("entryQuickStats");
    if (!target) return;

    const dividendRows = getDividendRows();
    if (!dividendRows.length) return;

    if (!options.force && dividendPayerIsUserScrollingV75()) {
      scheduleDeferredDividendRenderV75(scrollTopBeforeRender);
      restoreDividendPayerScrollSoonV75(scrollTopBeforeRender);
      return;
    }

    const summary = calculateDividendSummaryV75(dividendRows);
    const maxMonth = Math.max(...summary.monthTotals, 0);
    const sourceStatus = state.dividends.isRefreshing
      ? "正在更新"
      : state.dividends.lastSync
        ? `更新 ${formatTime(state.dividends.lastSync)}`
        : "等待更新";
    const monthCards = summary.monthTotals
      .map((value, index) => {
        const ratio = maxMonth > 0 ? (value / maxMonth) * 100 : 0;
        const payers = summary.monthPayers?.[index] || [];
        return `
          <div class="dividend-month-card ${value > 0 ? "has-dividend" : ""}" data-month-index="${index}" tabindex="0" role="button" aria-label="${MONTH_LABELS[index]}配息 ${value > 0 ? formatWholeSensitiveCurrency(value) : "無"}">
            <span>${MONTH_LABELS[index]}</span>
            <strong class="${sensitiveClass(value)}">${value > 0 ? formatWholeSensitiveCurrency(value) : "--"}</strong>
            <span class="dividend-month-bar"><span style="width:${ratio.toFixed(1)}%"></span></span>
            ${renderMonthTooltipV75(index, payers, value)}
          </div>
        `;
      })
      .join("");

    const payerRows = summary.payers
      .slice(0, 60)
      .map((payer) => `
        <div class="dividend-payer-row">
          <span class="dividend-payer-identity">
            <strong>${escapeHtml(payer.symbol)}</strong>
            <small>${escapeHtml(formatPayoutMonthsV75(payer.months))}</small>
          </span>
          <strong class="${sensitiveClass(payer.annualValue)}">${formatWholeSensitiveCurrency(payer.annualValue)}</strong>
          <small>${Number.isFinite(payer.yieldPercent) && payer.yieldPercent > 0 ? payer.yieldPercent.toFixed(2) : "--"}%</small>
          <span class="dividend-payer-share">${Number.isFinite(payer.dividendShare) ? payer.dividendShare.toFixed(1) : "--"}%</span>
        </div>
      `)
      .join("");

    target.innerHTML = `
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
            <button class="sort-header dividend-sort-header dividend-source-sort" type="button" data-dividend-sort-field="source" data-sort-label="主要配息來源">
              <span>主要配息來源</span>
              <small>${DIVIDEND_SOURCE_NOTE_V75}</small>
              <span class="sort-indicator" aria-hidden="true"></span>
            </button>
            <button class="sort-header dividend-sort-header dividend-value-sort" type="button" data-dividend-sort-field="annualValue" data-sort-label="年領股息">
              年領股息<span class="sort-indicator" aria-hidden="true"></span>
            </button>
            <button class="sort-header dividend-sort-header dividend-value-sort" type="button" data-dividend-sort-field="yieldPercent" data-sort-label="殖利率">
              殖利率<span class="sort-indicator" aria-hidden="true"></span>
            </button>
            <button class="sort-header dividend-sort-header dividend-value-sort" type="button" data-dividend-sort-field="dividendShare" data-sort-label="佔股息">
              佔股息<span class="sort-indicator" aria-hidden="true"></span>
            </button>
          </div>
          ${payerRows || `<small>暫無股息資料</small>`}
        </div>
      </div>
    `;

    bindDividendSortButtonsV75(target);
    bindDividendMonthTooltipsV75(target);
    bindDividendPayerScrollMemoryV75();
    restoreDividendPayerScrollSoonV75(scrollTopBeforeRender);
  }

  try {
    if (typeof renderEntryQuickStats === "function" && !renderEntryQuickStats.__dividendSortV75) {
      renderEntryQuickStats = function renderEntryQuickStatsWithDividendSortV75() {
        renderEntryQuickStatsV75(getCurrentDividendScrollTopV75());
      };
      renderEntryQuickStats.__dividendSortV75 = true;
      patchedNativeEntryQuickStatsV75 = true;
    }
  } catch (error) {
    console.warn("Dividend entry stats hook failed", error);
  }

  try {
    const previousRender = render;
    const baseRender = previousRender.__dividendSortPreviousV75 || previousRender;
    if (!previousRender.__dividendSortV75) {
      render = function renderWithDividendSortV75() {
        if (renderingDividendSortV75) return;
        renderingDividendSortV75 = true;
        try {
        const scrollTopBeforeRender = getCurrentDividendScrollTopV75();
        baseRender();
        if (patchedNativeEntryQuickStatsV75) {
          bindDividendPayerScrollMemoryV75();
          restoreDividendPayerScrollSoonV75(scrollTopBeforeRender);
        } else {
          renderEntryQuickStatsV75(scrollTopBeforeRender);
        }
        } finally {
          renderingDividendSortV75 = false;
        }
      };
      render.__dividendSortV75 = true;
      render.__dividendSortPreviousV75 = baseRender;
    }
  } catch (error) {
    console.warn("Dividend sort render hook failed", error);
  }

  ensureDividendSortStyles();
  bindDividendPayerScrollMemoryV75();
  renderEntryQuickStatsV75();
})();
