(function () {
  const PATCH_KEY = "wealthtrack.dividendSort.v75";
  if (window[PATCH_KEY]) return;
  window[PATCH_KEY] = true;

  const MONTHLY_SYMBOLS_V75 = new Set(["O", "SGOV"]);
  const DIVIDEND_SOURCE_NOTE_V75 = "美股以 Payable Date 配發月估算並預扣 30% 股息稅；複委託實際入帳可能晚 1-3 個工作天；台股未扣二代健保、匯費。";
  const DIVIDEND_SORT_STORAGE_KEY = "wealthtrack.dividendSortMode";
  const DIVIDEND_SORT_DEFAULTS = {
    source: "asc",
    annualValue: "desc",
    yieldPercent: "desc",
    dividendShare: "desc"
  };
  let dividendPayerScrollTopV75 = 0;

  function ensureDividendSortStyles() {
    if (document.querySelector('link[href="overview-dividends-sort-v75.css"]')) return;
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "overview-dividends-sort-v75.css";
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
      dividendPayerScrollTopV75 = scroller.scrollTop;
    }, { passive: true });
  }

  function restoreDividendPayerScrollV75(scrollTop = dividendPayerScrollTopV75) {
    const scroller = getDividendPayersScrollerV75();
    if (!scroller) return;
    const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const nextTop = Math.min(Math.max(0, Number(scrollTop) || 0), maxScroll);
    scroller.scrollTop = nextTop;
    dividendPayerScrollTopV75 = nextTop;
  }

  function restoreDividendPayerScrollSoonV75(scrollTop = dividendPayerScrollTopV75) {
    restoreDividendPayerScrollV75(scrollTop);
    requestAnimationFrame(() => restoreDividendPayerScrollV75(scrollTop));
    setTimeout(() => restoreDividendPayerScrollV75(scrollTop), 0);
    setTimeout(() => restoreDividendPayerScrollV75(scrollTop), 80);
    setTimeout(() => restoreDividendPayerScrollV75(scrollTop), 220);
    setTimeout(() => restoreDividendPayerScrollV75(scrollTop), 360);
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
    renderEntryQuickStatsV75(0);
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

  function normalizeSymbolForDividendV75(position) {
    const raw = getYahooSymbol(position.marketSymbol || position.symbol, position.kind);
    return String(raw || position.symbol || "").replace("-", ".").toUpperCase();
  }

  function isMonthlyDividendPositionV75(position) {
    return position?.kind === "us-stock" && MONTHLY_SYMBOLS_V75.has(normalizeSymbolForDividendV75(position));
  }

  function getNormalizedMonthAmountsV75(row) {
    const profile = row.profile || {};
    const monthAmounts = profile.monthAmounts && typeof profile.monthAmounts === "object" ? { ...profile.monthAmounts } : {};

    if (!isMonthlyDividendPositionV75(row.position)) return monthAmounts;

    const observedAmounts = Object.values(monthAmounts)
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > 0);
    const annualPerShare = Number(profile.annualPerShare);
    const monthlyFallback = observedAmounts.length
      ? observedAmounts.reduce((sum, value) => sum + value, 0) / observedAmounts.length
      : Number.isFinite(annualPerShare) && annualPerShare > 0
        ? annualPerShare / 12
        : 0;

    if (monthlyFallback <= 0) return monthAmounts;

    for (let index = 0; index < 12; index += 1) {
      const existingAmount = Number(monthAmounts[index]);
      if (!Number.isFinite(existingAmount) || existingAmount <= 0) {
        monthAmounts[index] = monthlyFallback;
      }
    }

    return monthAmounts;
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

    return {
      monthTotals,
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

  function renderEntryQuickStatsV75(scrollTopBeforeRender = getCurrentDividendScrollTopV75()) {
    ensureDividendSortStyles();
    const target = document.getElementById("entryQuickStats");
    if (!target) return;

    const dividendRows = getDividendRows();
    if (!dividendRows.length) return;

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
        return `
          <div class="dividend-month-card ${value > 0 ? "has-dividend" : ""}">
            <span>${MONTH_LABELS[index]}</span>
            <strong class="${sensitiveClass(value)}">${value > 0 ? formatWholeSensitiveCurrency(value) : "--"}</strong>
            <span class="dividend-month-bar"><span style="width:${ratio.toFixed(1)}%"></span></span>
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
    bindDividendPayerScrollMemoryV75();
    restoreDividendPayerScrollSoonV75(scrollTopBeforeRender);
  }

  try {
    const previousRender = render;
    if (!previousRender.__dividendSortV75) {
      render = function renderWithDividendSortV75() {
        const scrollTopBeforeRender = getCurrentDividendScrollTopV75();
        previousRender();
        renderEntryQuickStatsV75(scrollTopBeforeRender);
      };
      render.__dividendSortV75 = true;
    }
  } catch (error) {
    console.warn("Dividend sort render hook failed", error);
  }

  ensureDividendSortStyles();
  bindDividendPayerScrollMemoryV75();
  renderEntryQuickStatsV75();
})();
