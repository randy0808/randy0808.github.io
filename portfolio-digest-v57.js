"use strict";

(() => {
  const digest = document.querySelector("#portfolioDigest");
  if (!digest) return;

  function safeText(value) {
    if (typeof escapeHtml === "function") return escapeHtml(value);
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function plainPercent(value, digits = 1) {
    if (!Number.isFinite(value)) return "--";
    return `${value.toFixed(digits)}%`;
  }

  function compactCurrency(value) {
    if (typeof formatCompactCurrency === "function") return formatCompactCurrency(value);
    if (!Number.isFinite(value)) return "--";
    return new Intl.NumberFormat("zh-TW", {
      style: "currency",
      currency: state?.baseCurrency || "TWD",
      notation: "compact",
      maximumFractionDigits: 1
    }).format(value);
  }

  function wholeCurrency(value) {
    if (typeof formatWholeSensitiveCurrency === "function") return formatWholeSensitiveCurrency(value);
    if (!Number.isFinite(value)) return "--";
    return new Intl.NumberFormat("zh-TW", {
      style: "currency",
      currency: state?.baseCurrency || "TWD",
      maximumFractionDigits: 0
    }).format(Math.round(value));
  }

  function signedPercent(value) {
    if (typeof formatPercent === "function") return formatPercent(value);
    if (!Number.isFinite(value)) return "--";
    return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
  }

  function valueClassName(value) {
    if (typeof valueClass === "function") return valueClass(value);
    if (!Number.isFinite(value) || value === 0) return "";
    return value > 0 ? "profit-positive" : "profit-negative";
  }

  function makeCard(label, main, sub, className = "") {
    return `
      <div class="digest-card">
        <span>${safeText(label)}</span>
        <strong class="${className}">${main}</strong>
        <small>${sub}</small>
      </div>
    `;
  }

  function renderDigest() {
    if (typeof state === "undefined" || typeof calculatePortfolio !== "function" || typeof calculatePosition !== "function") return;
    const totals = calculatePortfolio();
    const rows = state.positions.map((position) => {
      const metrics = calculatePosition(position);
      const allocationPercent = totals.value > 0 && Number.isFinite(metrics.currentValue)
        ? (metrics.currentValue / totals.value) * 100
        : NaN;
      return { position, metrics, allocationPercent };
    });

    if (!rows.length) {
      digest.innerHTML = `
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
    const dividendRows = typeof getDividendRows === "function" ? getDividendRows() : [];
    const dividendSummary = typeof calculateDividendSummary === "function"
      ? calculateDividendSummary(dividendRows)
      : { readyCount: 0, missingCount: dividendRows.length };
    const dividendStatus = dividendRows.length ? `${dividendSummary.readyCount}/${dividendRows.length}` : "--";
    const dividendNote = dividendRows.length
      ? (dividendSummary.missingCount ? `${dividendSummary.missingCount} 檔待補` : "資料完整")
      : "沒有股票部位";
    const quoteNote = missingQuotes.length
      ? missingQuotes.slice(0, 4).map((row) => row.position.symbol).join("、")
      : "全部可計價";
    const updateText = state.lastSync && typeof formatTime === "function" ? `更新 ${formatTime(state.lastSync)}` : "尚未更新";

    digest.innerHTML = `
      <div class="digest-head">
        <h3>投組整理</h3>
        <span>${safeText(updateText)}</span>
      </div>
      <div class="digest-card-grid">
        ${makeCard(
          "最大部位",
          largest ? safeText(largest.position.symbol) : "--",
          largest ? `${plainPercent(largest.allocationPercent)} · ${compactCurrency(largest.metrics.currentValue)}` : "--"
        )}
        ${makeCard(
          "壓力最大",
          pressure ? safeText(pressure.position.symbol) : "--",
          pressure ? `${signedPercent(pressure.metrics.profitPercent)} · ${wholeCurrency(pressure.metrics.profit)}` : "--",
          pressure ? valueClassName(pressure.metrics.profitPercent) : ""
        )}
        ${makeCard("股息資料", safeText(dividendStatus), safeText(dividendNote))}
      </div>
      <div class="digest-row-grid">
        <div class="digest-row">
          <span>報價待補</span>
          <strong>${safeText(quoteNote)}</strong>
        </div>
        <div class="digest-row">
          <span>表現最好</span>
          <strong class="${best ? valueClassName(best.metrics.profitPercent) : ""}">${best ? `${safeText(best.position.symbol)} ${signedPercent(best.metrics.profitPercent)}` : "--"}</strong>
        </div>
      </div>
    `;
  }

  renderDigest();
  window.setInterval(renderDigest, 1500);
})();
