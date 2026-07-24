"use strict";

(() => {
  const serviceWorker = navigator.serviceWorker;
  const originalRegister = serviceWorker?.register?.bind(serviceWorker);

  if (originalRegister) {
    serviceWorker.register = (url, options) => {
      const nextUrl = String(url || "").replace("service-worker-v47.js", "service-worker-v111.js");
      return originalRegister(nextUrl, options);
    };
  }

  function ensureDashboardTabs() {
    const main = document.querySelector("main");
    const summaryGrid = document.querySelector(".summary-grid");
    const workspaceGrid = document.querySelector(".workspace-grid");
    const holdingsPanel = document.querySelector(".holdings-panel");
    const assetEntryPanel = document.querySelector(".asset-entry-panel");
    if (!main || !summaryGrid || !workspaceGrid || !holdingsPanel || document.querySelector(".dashboard-tabs")) return;

    const tabs = document.createElement("section");
    tabs.className = "dashboard-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "首頁分頁");
    tabs.innerHTML = `
      <button class="dashboard-tab is-active" type="button" role="tab" aria-selected="true" aria-controls="overviewTabPanel" id="overviewTab" data-dashboard-tab="overview">總覽</button>
      <button class="dashboard-tab" type="button" role="tab" aria-selected="false" aria-controls="holdingsTabPanel" id="holdingsTab" data-dashboard-tab="holdings">持倉</button>
      <button class="dashboard-tab" type="button" role="tab" aria-selected="false" aria-controls="watchlistTabPanel" id="watchlistTab" data-dashboard-tab="watchlist">觀察清單</button>
    `;

    const overviewPanel = document.createElement("section");
    overviewPanel.className = "dashboard-tab-panel is-active";
    overviewPanel.id = "overviewTabPanel";
    overviewPanel.setAttribute("role", "tabpanel");
    overviewPanel.setAttribute("aria-labelledby", "overviewTab");

    const holdingsTabPanel = document.createElement("section");
    holdingsTabPanel.className = "dashboard-tab-panel";
    holdingsTabPanel.id = "holdingsTabPanel";
    holdingsTabPanel.setAttribute("role", "tabpanel");
    holdingsTabPanel.setAttribute("aria-labelledby", "holdingsTab");
    holdingsTabPanel.hidden = true;

    const watchlistTabPanel = document.createElement("section");
    watchlistTabPanel.className = "dashboard-tab-panel";
    watchlistTabPanel.id = "watchlistTabPanel";
    watchlistTabPanel.setAttribute("role", "tabpanel");
    watchlistTabPanel.setAttribute("aria-labelledby", "watchlistTab");
    watchlistTabPanel.hidden = true;

    const watchlistPanel = document.createElement("section");
    watchlistPanel.className = "panel watchlist-panel";
    watchlistPanel.innerHTML = `
      <div class="panel-heading">
        <div>
          <h2>觀察清單</h2>
          <p>股息股、成長股、資產股符合條件時會集中在這裡。</p>
        </div>
      </div>
    `;
    watchlistTabPanel.append(watchlistPanel);

    const holdingsEntryWrap = document.createElement("div");
    holdingsEntryWrap.className = "holdings-entry-wrap";
    if (assetEntryPanel) {
      assetEntryPanel.closest(".workspace-column")?.classList.add("workspace-column-dividend-only");
      holdingsEntryWrap.append(assetEntryPanel);
    }

    main.insertBefore(tabs, summaryGrid);
    main.insertBefore(overviewPanel, summaryGrid);
    overviewPanel.append(summaryGrid, workspaceGrid);
    main.insertBefore(holdingsTabPanel, overviewPanel.nextSibling);
    if (assetEntryPanel) {
      holdingsTabPanel.append(holdingsEntryWrap);
    }
    holdingsTabPanel.append(holdingsPanel);
    main.insertBefore(watchlistTabPanel, holdingsTabPanel.nextSibling);

    const buttons = [...tabs.querySelectorAll("[data-dashboard-tab]")];
    const panels = { overview: overviewPanel, holdings: holdingsTabPanel, watchlist: watchlistTabPanel };

    const setActiveTab = (nextTab) => {
      const activeTab = panels[nextTab] ? nextTab : "overview";
      buttons.forEach((button) => {
        const isActive = button.dataset.dashboardTab === activeTab;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", String(isActive));
      });
      Object.entries(panels).forEach(([name, panel]) => {
        const isActive = name === activeTab;
        panel.classList.toggle("is-active", isActive);
        panel.hidden = !isActive;
      });
      try {
        localStorage.setItem("wealthtrack.dashboardTab", activeTab);
      } catch (error) {
        console.warn("Dashboard tab preference was not saved", error);
      }
      window.dispatchEvent(new Event("resize"));
    };

    buttons.forEach((button) => {
      button.addEventListener("click", () => setActiveTab(button.dataset.dashboardTab));
    });

    const queryTab = new URLSearchParams(window.location.search).get("tab");
    let storedTab = "";
    try {
      storedTab = localStorage.getItem("wealthtrack.dashboardTab") || "";
    } catch (error) {
      storedTab = "";
    }
    setActiveTab(panels[queryTab] ? queryTab : storedTab || "overview");
  }

  let dividendHeightObserver = null;
  let dividendHeightFrame = 0;

  function syncOverviewDividendHeight() {
    const grid = document.querySelector("#overviewTabPanel .workspace-grid") || document.querySelector(".workspace-grid");
    const overviewPanel = document.querySelector("#overviewTabPanel");
    const leftColumn = grid?.querySelector(".workspace-column-main");
    const rightColumn = [...(grid?.children || [])].find((element) => element !== leftColumn && element.classList?.contains("workspace-column"));

    if (!grid || !leftColumn || !rightColumn || (overviewPanel && overviewPanel.hidden)) return;

    if (!window.matchMedia("(min-width: 1101px)").matches) {
      leftColumn.style.removeProperty("--overview-right-column-height");
      return;
    }

    const rightHeight = Math.ceil(rightColumn.getBoundingClientRect().height);
    if (rightHeight > 0) {
      leftColumn.style.setProperty("--overview-right-column-height", `${rightHeight}px`);
    }
  }

  function scheduleOverviewDividendHeightSync() {
    if (dividendHeightFrame) return;
    dividendHeightFrame = requestAnimationFrame(() => {
      dividendHeightFrame = 0;
      syncOverviewDividendHeight();
    });
  }

  function ensureOverviewDividendHeightSync() {
    if (dividendHeightObserver) {
      scheduleOverviewDividendHeightSync();
      return;
    }

    const grid = document.querySelector("#overviewTabPanel .workspace-grid") || document.querySelector(".workspace-grid");
    const leftColumn = grid?.querySelector(".workspace-column-main");
    const rightColumn = [...(grid?.children || [])].find((element) => element !== leftColumn && element.classList?.contains("workspace-column"));

    if ("ResizeObserver" in window) {
      dividendHeightObserver = new ResizeObserver(scheduleOverviewDividendHeightSync);
      if (rightColumn) dividendHeightObserver.observe(rightColumn);
    } else {
      dividendHeightObserver = { observe() {} };
    }

    window.addEventListener("resize", scheduleOverviewDividendHeightSync, { passive: true });
    scheduleOverviewDividendHeightSync();
  }

  function ensureV58Layout() {
    const workspaceColumn = document.querySelector(".workspace-grid .workspace-column");
    workspaceColumn?.classList.add("workspace-column-main");

    if (!document.querySelector('link[href="layout-fix-v57.css"]')) {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = "layout-fix-v57.css";
      document.head.appendChild(stylesheet);
    }

    if (!document.querySelector('link[href^="dashboard-tabs-v58.css"]')) {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = "dashboard-tabs-v58.css?v=108";
      document.head.appendChild(stylesheet);
    }

    if (!document.querySelector('link[href^="overview-dividends-v69.css"]')) {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = "overview-dividends-v69.css?v=110";
      document.head.appendChild(stylesheet);
    }

    if (!document.querySelector('link[href="holdings-sticky-v65.css"]')) {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = "holdings-sticky-v65.css";
      document.head.appendChild(stylesheet);
    }

    document.querySelectorAll(".portfolio-digest-panel").forEach((panel) => panel.remove());

    ensureDashboardTabs();
    ensureOverviewDividendHeightSync();
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  ensureV58Layout();
  loadScript("app-v47.js?v=111")
    .then(() => loadScript("growth-history-v73.js?v=111"))
    .then(() => loadScript("growth-chart-hover-v74.js?v=111"))
    .then(() => loadScript("overview-dividends-sort-v75.js?v=111"))
    .then(() => loadScript("holdings-sticky-v65.js?v=111"))
    .catch((error) => console.warn("WealthTrack v58 patch failed", error));
})();
