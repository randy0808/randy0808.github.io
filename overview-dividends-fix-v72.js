(function () {
  const MONTHLY_SYMBOLS = new Set(["O", "SGOV"]);
  const DIVIDEND_SOURCE_NOTE = "美股已預扣 30% 股息稅；台股未扣二代健保、匯費；資料每日更新一次。";
  let dividendPayerScrollTop = 0;

  function getDividendPayersScroller() {
    return document.querySelector("#entryQuickStats .dividend-payers");
  }

  function getCurrentDividendScrollTop() {
    const scroller = getDividendPayersScroller();
    if (!scroller) return dividendPayerScrollTop;
    const currentTop = scroller.scrollTop;
    if (currentTop > 0 || dividendPayerScrollTop === 0) return currentTop;
    return dividendPayerScrollTop;
  }

  function bindDividendPayerScrollMemory() {
    const scroller = getDividendPayersScroller();
    if (!scroller || scroller.__wealthtrackDividendScrollV72) return;
    scroller.__wealthtrackDividendScrollV72 = true;
    scroller.addEventListener("scroll", () => {
      dividendPayerScrollTop = scroller.scrollTop;
    }, { passive: true });
  }

  function restoreDividendPayerScroll(scrollTop = dividendPayerScrollTop) {
    const scroller = getDividendPayersScroller();
    if (!scroller) return;
    const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const nextTop = Math.min(Math.max(0, Number(scrollTop) || 0), maxScroll);
    scroller.scrollTop = nextTop;
    dividendPayerScrollTop = nextTop;
  }

  function restoreDividendPayerScrollSoon(scrollTop = dividendPayerScrollTop) {
    restoreDividendPayerScroll(scrollTop);
    requestAnimationFrame(() => restoreDividendPayerScroll(scrollTop));
    setTimeout(() => restoreDividendPayerScroll(scrollTop), 0);
    setTimeout(() => restoreDividendPayerScroll(scrollTop), 80);
    setTimeout(() => restoreDividendPayerScroll(scrollTop), 200);
  }

  function normalizeSymbolForDividend(position) {
    const raw = getYahooSymbol(position.marketSymbol || position.symbol, position.kind);
    return String(raw || position.symbol || "").replace("-", ".").toUpperCase();
  }

  function isMonthlyDividendPosition(position) {
    return position?.kind === "us-stock" && MONTHLY_SYMBOLS.has(normalizeSymbolForDividend(position));
  }

  function getNormalizedMonthAmounts(row) {
    const profile = row.profile || {};
    let monthAmounts = profile.monthAmounts && typeof profile.monthAmounts === "object" ? { ...profile.monthAmounts } : {};

    if (!isMonthlyDividendPosition(row.position)) return monthAmounts;

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

  function calculateDividendSummaryV72(rows) {
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
      const monthAmounts = getNormalizedMonthAmounts(row);
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

  function renderEntryQuickStatsV72(scrollTopBeforeRender = getCurrentDividendScrollTop()) {
    const target = document.getElementById("entryQuickStats");
    if (!target) return;

    const dividendRows = getDividendRows();
    if (!dividendRows.length) return;

    const summary = calculateDividendSummaryV72(dividendRows);
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
      .slice(0, 24)
      .map((payer) => {
        const dividendShare = summary.annualTotal > 0 ? (payer.annualValue / summary.annualTotal) * 100 : NaN;
        return `
          <div class="dividend-payer-row">
            <span class="dividend-payer-identity">
              <strong>${escapeHtml(payer.symbol)}</strong>
              <small>${escapeHtml(formatPayoutMonths(payer.months))}</small>
            </span>
            <strong class="${sensitiveClass(payer.annualValue)}">${formatWholeSensitiveCurrency(payer.annualValue)}</strong>
            <small>${Number.isFinite(payer.yieldPercent) && payer.yieldPercent > 0 ? payer.yieldPercent.toFixed(2) : "--"}%</small>
            <span class="dividend-payer-share">${Number.isFinite(dividendShare) ? dividendShare.toFixed(1) : "--"}%</span>
          </div>
        `;
      })
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
            <span>主要配息來源 <small>${DIVIDEND_SOURCE_NOTE}</small></span>
            <span>年領股息</span>
            <span>殖利率</span>
            <span>佔股息</span>
          </div>
          ${topPayers || `<small>暫無股息資料</small>`}
        </div>
      </div>
    `;

    bindDividendPayerScrollMemory();
    restoreDividendPayerScrollSoon(scrollTopBeforeRender);
  }

  try {
    const originalRender = render;
    if (!originalRender.__dividendV72) {
      render = function renderWithDividendV72() {
        const scrollTopBeforeRender = getCurrentDividendScrollTop();
        originalRender();
        renderEntryQuickStatsV72(scrollTopBeforeRender);
      };
      render.__dividendV72 = true;
    }
  } catch (error) {
    console.warn("Dividend panel render hook failed", error);
  }

  bindDividendPayerScrollMemory();
  renderEntryQuickStatsV72();
})();
