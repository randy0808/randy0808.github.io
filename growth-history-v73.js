"use strict";

(() => {
  const PATCH_KEY = "wealthtrack.growthHistory.v73";
  const LAST_POINT_KEY = "wealthtrack.growthHistory.lastPoint.v73";
  const FORCED_CHANGE_TWD = 1;
  const FORCED_CHANGE_RATIO = 0.000001;

  if (window[PATCH_KEY]) return;
  window[PATCH_KEY] = true;
  let isRecordingCurrentHistoryV73 = false;
  let isRecordingPortfolioChangeV73 = false;
  let isSubmittingPortfolioFormV73 = false;

  function normalizeHistoryPoint(point) {
    const date = typeof point?.date === "string" ? point.date : "";
    const valueTwd = Number(point?.valueTwd);
    const timestamp = historyTimestampFor(point, date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < HISTORY_START_DATE) return null;
    if (!Number.isFinite(valueTwd) || valueTwd < 0) return null;
    if (!Number.isFinite(timestamp)) return null;
    return {
      date,
      valueTwd,
      timestamp,
      live: Boolean(point?.live)
    };
  }

  function shouldKeepSameMoment(previous, point) {
    if (!previous) return true;
    if (previous.date !== point.date) return true;
    const { amount, ratio } = historyChangeAmount(previous, point.valueTwd);
    if (amount >= FORCED_CHANGE_TWD && ratio >= FORCED_CHANGE_RATIO) return true;
    return Math.abs(point.timestamp - previous.timestamp) >= HISTORY_MIN_POINT_GAP_MS;
  }

  function mergeHistoryPoints(...groups) {
    const normalized = [];
    groups.flat().forEach((point) => {
      const next = normalizeHistoryPoint(point);
      if (next) normalized.push(next);
    });
    normalized.sort((a, b) => (a.timestamp - b.timestamp) || a.date.localeCompare(b.date));

    const deduped = [];
    normalized.forEach((point) => {
      const previous = deduped[deduped.length - 1];
      if (!shouldKeepSameMoment(previous, point)) {
        deduped[deduped.length - 1] = point;
        return;
      }
      deduped.push(point);
    });
    return deduped.slice(-HISTORY_MAX_POINTS);
  }

  normalizeHistoryPoints = function normalizeHistoryPointsV73(points) {
    if (!Array.isArray(points)) return [];
    return mergeHistoryPoints(points);
  };

  shouldKeepHistoryPoint = function shouldKeepHistoryPointV73(previous, point) {
    return shouldKeepSameMoment(previous, point);
  };

  shouldRecordHistoryPoint = function shouldRecordHistoryPointV73(previous, valueTwd, options = {}) {
    if (!previous) return true;
    const date = taipeiDateKey();
    if (previous.date !== date) return true;
    const { amount, ratio } = historyChangeAmount(previous, valueTwd);
    if (options.force) return amount >= FORCED_CHANGE_TWD && ratio >= FORCED_CHANGE_RATIO;
    if (Date.now() - previous.timestamp < HISTORY_MIN_POINT_GAP_MS) return false;
    return amount >= HISTORY_AUTO_CHANGE_TWD && ratio >= HISTORY_AUTO_CHANGE_RATIO;
  };

  recordAssetHistory = function recordAssetHistoryV73(totals, options = {}) {
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
      rememberCurrentPoint(valueTwd, now, date);
      return false;
    }

    points.push({ date, valueTwd, timestamp: now });
    state.history.points = normalizeHistoryPoints(points);
    rememberCurrentPoint(valueTwd, now, date);
    return true;
  };

  currentHistoryPoint = function currentHistoryPointV73(totals = calculatePortfolio()) {
    if (!Number.isFinite(totals.value) || totals.value <= 0) return null;
    const valueTwd = convertCurrency(totals.value, state.baseCurrency, "TWD");
    if (!Number.isFinite(valueTwd) || valueTwd <= 0) return null;
    const date = taipeiDateKey();
    if (date < HISTORY_START_DATE) return null;
    return { date, valueTwd, timestamp: Date.now(), live: true };
  };

  recordCurrentAssetHistory = function recordCurrentAssetHistoryV73(options = {}) {
    if (isRecordingCurrentHistoryV73) return false;
    isRecordingCurrentHistoryV73 = true;
    try {
      return recordAssetHistory(calculatePortfolio(), options);
    } finally {
      isRecordingCurrentHistoryV73 = false;
    }
  };

  getGrowthPoints = function getGrowthPointsV73(totals) {
    const points = normalizeHistoryPoints(state.history.points);
    const live = currentHistoryPoint(totals);
    if (live) {
      const previous = points[points.length - 1];
      if (!previous || shouldRecordHistoryPoint(previous, live.valueTwd, { force: true })) {
        points.push(live);
      } else if (previous) {
        points[points.length - 1] = { ...previous, valueTwd: live.valueTwd, timestamp: live.timestamp, live: true };
      }
    }
    const startDate = historyRangeStart(state.history.range);
    return normalizeHistoryPoints(points)
      .filter((point) => point.date >= startDate)
      .sort((a, b) => (a.timestamp - b.timestamp) || a.date.localeCompare(b.date));
  };

  formatHistoryPointLabel = function formatHistoryPointLabelV73(point, includeTime = false) {
    const date = (point?.date || "").replaceAll("-", "/");
    if (!includeTime || !Number.isFinite(point?.timestamp)) return date;
    const time = new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(new Date(point.timestamp));
    return `${date} ${time}`;
  };

  function rememberCurrentPoint(valueTwd, timestamp = Date.now(), date = taipeiDateKey(timestamp)) {
    try {
      localStorage.setItem(LAST_POINT_KEY, JSON.stringify({ date, valueTwd, timestamp }));
    } catch (error) {
      console.warn("Unable to remember growth history point", error);
    }
  }

  function restoreRememberedPoint() {
    try {
      const stored = JSON.parse(localStorage.getItem(LAST_POINT_KEY) || "null");
      if (!stored) return false;
      const remembered = normalizeHistoryPoint(stored);
      if (!remembered) return false;
      state.history.points = normalizeHistoryPoints([...state.history.points, remembered]);
      return true;
    } catch (error) {
      console.warn("Unable to restore remembered growth history point", error);
      return false;
    }
  }

  function saveIfHistoryChanged(beforeLength) {
    const afterLength = normalizeHistoryPoints(state.history.points).length;
    if (afterLength !== beforeLength) saveState({ sync: false });
  }

  function recordBeforePortfolioChange() {
    if (isRecordingPortfolioChangeV73) return;
    isRecordingPortfolioChangeV73 = true;
    try {
    const beforeLength = normalizeHistoryPoints(state.history.points).length;
    recordCurrentAssetHistory({ force: true, reason: "before-change" });
    saveIfHistoryChanged(beforeLength);
    } finally {
      isRecordingPortfolioChangeV73 = false;
    }
  }

  function recordAfterPortfolioChange() {
    if (isRecordingPortfolioChangeV73) return;
    isRecordingPortfolioChangeV73 = true;
    try {
    const beforeLength = normalizeHistoryPoints(state.history.points).length;
    recordCurrentAssetHistory({ force: true, reason: "after-change" });
    saveIfHistoryChanged(beforeLength);
    drawGrowthChart(calculatePortfolio());
    } finally {
      isRecordingPortfolioChangeV73 = false;
    }
  }

  if (dom?.form && typeof handleSubmit === "function" && !dom.form.dataset.growthHistoryV73) {
    const originalHandleSubmit = handleSubmit;
    dom.form.removeEventListener("submit", originalHandleSubmit);
    handleSubmit = function handleSubmitWithHistoryV73(event) {
      if (isSubmittingPortfolioFormV73) {
        return originalHandleSubmit.call(this, event);
      }
      isSubmittingPortfolioFormV73 = true;
      try {
        recordBeforePortfolioChange();
        return originalHandleSubmit.call(this, event);
      } finally {
        isSubmittingPortfolioFormV73 = false;
      }
    };
    dom.form.addEventListener("submit", handleSubmit);
    dom.form.dataset.growthHistoryV73 = "1";
  }

  if (typeof deletePosition === "function" && !deletePosition.__growthHistoryV73) {
    const originalDeletePosition = deletePosition;
    deletePosition = function deletePositionWithHistoryV73(id) {
      recordBeforePortfolioChange();
      return originalDeletePosition.call(this, id);
    };
    deletePosition.__growthHistoryV73 = true;
  }

  if (typeof applyCloudPayload === "function" && !applyCloudPayload.__growthHistoryV73) {
    const originalApplyCloudPayload = applyCloudPayload;
    applyCloudPayload = function applyCloudPayloadWithHistoryV73(payload) {
      recordBeforePortfolioChange();
      const localHistory = normalizeHistoryPoints(state.history.points);
      const remoteHistory = normalizeHistoryPoints(payload?.history?.points);
      const result = originalApplyCloudPayload.call(this, payload);
      state.history.points = normalizeHistoryPoints([...localHistory, ...remoteHistory, ...state.history.points]);
      recordAfterPortfolioChange();
      saveState({ sync: false });
      return result;
    };
    applyCloudPayload.__growthHistoryV73 = true;
  }

  restoreRememberedPoint();
  recordAfterPortfolioChange();
})();
