"use strict";

(() => {
  const serviceWorker = navigator.serviceWorker;
  const originalRegister = serviceWorker?.register?.bind(serviceWorker);

  if (originalRegister) {
    serviceWorker.register = (url, options) => {
      const nextUrl = String(url || "").replace("service-worker-v47.js", "service-worker-v57.js");
      return originalRegister(nextUrl, options);
    };
  }

  function ensureV57Layout() {
    const workspaceColumn = document.querySelector(".workspace-grid .workspace-column");
    workspaceColumn?.classList.add("workspace-column-main");

    if (!document.querySelector('link[href="layout-fix-v57.css"]')) {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = "layout-fix-v57.css";
      document.head.appendChild(stylesheet);
    }

    if (!document.querySelector("#portfolioDigest")) {
      const dividendPanel = document.querySelector(".dividend-panel");
      const section = document.createElement("section");
      section.className = "panel portfolio-digest-panel";
      section.innerHTML = '<div id="portfolioDigest" class="portfolio-digest" aria-label="投組整理"></div>';
      dividendPanel?.insertAdjacentElement("afterend", section);
    }
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

  ensureV57Layout();
  loadScript("app-v47.js?v=57")
    .then(() => loadScript("portfolio-digest-v57.js"))
    .catch((error) => console.warn("WealthTrack v57 patch failed", error));
})();
