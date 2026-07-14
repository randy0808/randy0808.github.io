"use strict";

(() => {
  const PATCH_KEY = "wealthtrack.growthChartHover.v74";
  if (window[PATCH_KEY]) return;
  window[PATCH_KEY] = true;

  const hover = {
    active: false,
    x: 0,
    y: 0,
    frame: 0
  };

  function scheduleGrowthDraw() {
    if (hover.frame) return;
    hover.frame = requestAnimationFrame(() => {
      hover.frame = 0;
      drawGrowthChart(calculatePortfolio());
    });
  }

  function bindGrowthHover(canvas) {
    if (!canvas || canvas.dataset.growthHoverV74) return;
    canvas.dataset.growthHoverV74 = "1";
    canvas.style.cursor = "crosshair";
    canvas.style.touchAction = "pan-y";

    const update = (event) => {
      const rect = canvas.getBoundingClientRect();
      hover.active = true;
      hover.x = event.clientX - rect.left;
      hover.y = event.clientY - rect.top;
      scheduleGrowthDraw();
    };

    const clear = () => {
      if (!hover.active) return;
      hover.active = false;
      scheduleGrowthDraw();
    };

    canvas.addEventListener("pointerdown", update);
    canvas.addEventListener("pointermove", update);
    canvas.addEventListener("pointerleave", clear);
    canvas.addEventListener("pointercancel", clear);
  }

  function drawRoundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function selectedGrowthPoint(coords, hoverX, yFor) {
    if (!coords.length) return null;
    if (coords.length === 1) {
      return {
        ...coords[0],
        date: taipeiDateKey(coords[0].point.timestamp),
        timestamp: coords[0].point.timestamp
      };
    }

    const ordered = [...coords].sort((a, b) => a.x - b.x);
    if (hoverX <= ordered[0].x) {
      return {
        ...ordered[0],
        date: taipeiDateKey(ordered[0].point.timestamp),
        timestamp: ordered[0].point.timestamp
      };
    }
    const last = ordered[ordered.length - 1];
    if (hoverX >= last.x) {
      return {
        ...last,
        date: taipeiDateKey(last.point.timestamp),
        timestamp: last.point.timestamp
      };
    }

    for (let index = 1; index < ordered.length; index += 1) {
      const left = ordered[index - 1];
      const right = ordered[index];
      if (hoverX < left.x || hoverX > right.x) continue;

      const span = Math.max(right.x - left.x, 1);
      const progress = clamp((hoverX - left.x) / span, 0, 1);
      const value = left.value + (right.value - left.value) * progress;
      const timestamp = left.point.timestamp + (right.point.timestamp - left.point.timestamp) * progress;
      return {
        point: {
          date: taipeiDateKey(timestamp),
          timestamp
        },
        value,
        x: hoverX,
        y: yFor(value),
        date: taipeiDateKey(timestamp),
        timestamp
      };
    }

    return {
      ...last,
      date: taipeiDateKey(last.point.timestamp),
      timestamp: last.point.timestamp
    };
  }

  function drawGrowthTooltip(ctx, selected, chart, width, height, colors) {
    if (!selected) return;

    const valueText = formatSensitiveCurrency(selected.value);
    const timeText = formatHistoryPointLabel({
      date: selected.date || taipeiDateKey(selected.timestamp),
      timestamp: selected.timestamp
    }, true);

    ctx.save();
    ctx.strokeStyle = colors.primary;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(selected.x, chart.top);
    ctx.lineTo(selected.x, chart.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.24)";
    ctx.beginPath();
    ctx.moveTo(chart.left, selected.y);
    ctx.lineTo(chart.right, selected.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(selected.x, selected.y, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = colors.text;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = colors.primary;
    ctx.stroke();

    ctx.font = "800 15px system-ui, sans-serif";
    const valueWidth = ctx.measureText(valueText).width;
    ctx.font = "700 11px system-ui, sans-serif";
    const timeWidth = ctx.measureText(timeText).width;
    const boxWidth = Math.max(valueWidth, timeWidth) + 28;
    const boxHeight = 54;
    let boxX = selected.x + 14;
    let boxY = selected.y - boxHeight - 12;
    if (boxX + boxWidth > width - 8) boxX = selected.x - boxWidth - 14;
    if (boxX < 8) boxX = 8;
    if (boxY < chart.top + 4) boxY = selected.y + 14;
    if (boxY + boxHeight > height - 8) boxY = height - boxHeight - 8;

    ctx.shadowColor = "rgba(0, 0, 0, 0.34)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
    drawRoundRect(ctx, boxX, boxY, boxWidth, boxHeight, 8);
    ctx.fillStyle = colors.surface;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.border;
    ctx.stroke();

    ctx.fillStyle = colors.primary;
    ctx.font = "800 15px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(valueText, boxX + 14, boxY + 22);

    ctx.fillStyle = colors.muted;
    ctx.font = "700 11px system-ui, sans-serif";
    ctx.fillText(timeText, boxX + 14, boxY + 41);
    ctx.restore();
  }

  drawGrowthChart = function drawGrowthChartWithHoverV74(totals = calculatePortfolio()) {
    if (!dom.assetGrowthChart) return;
    const canvas = dom.assetGrowthChart;
    bindGrowthHover(canvas);

    const ctx = canvas.getContext("2d");
    const styles = getComputedStyle(document.documentElement);
    const text = styles.getPropertyValue("--text").trim() || "#f4f1e8";
    const muted = styles.getPropertyValue("--muted").trim() || "#b9b2a8";
    const line = styles.getPropertyValue("--line").trim() || "rgba(255, 255, 255, 0.18)";
    const primary = styles.getPropertyValue("--primary").trim() || "#0f8f88";
    const danger = styles.getPropertyValue("--danger").trim() || "#ef5d60";
    const surface = styles.getPropertyValue("--surface").trim() || "#111715";
    const border = styles.getPropertyValue("--border").trim() || "rgba(255, 255, 255, 0.22)";
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
      ctx.fillText("暫無歷史資料", width / 2, height / 2);
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
      if (sameTime) {
        return points.length === 1
          ? (chart.left + chart.right) / 2
          : chart.left + (index / (points.length - 1)) * (chart.right - chart.left);
      }
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

    if (hover.active) {
      const hoverX = clamp(hover.x, chart.left, chart.right);
      const selected = selectedGrowthPoint(coords, hoverX, yFor);
      drawGrowthTooltip(ctx, selected, chart, width, height, { text, muted, primary, danger, surface, border });
    }
  };

  bindGrowthHover(dom.assetGrowthChart);
  drawGrowthChart(calculatePortfolio());
})();
