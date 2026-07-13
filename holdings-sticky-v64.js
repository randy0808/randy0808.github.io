(function () {
  const STICKY_TOP = 0;
  let cloneHost = null;
  let cloneTable = null;
  let activeWrap = null;
  let activeTable = null;
  let rafId = 0;

  function ensureClone() {
    if (cloneHost && cloneTable) return;

    cloneHost = document.createElement("div");
    cloneHost.className = "holdings-sticky-clone";
    cloneHost.setAttribute("aria-hidden", "true");
    cloneTable = document.createElement("table");
    cloneHost.appendChild(cloneTable);
    document.body.appendChild(cloneHost);
    document.body.classList.add("has-holdings-sticky-clone");

    cloneHost.addEventListener("click", (event) => {
      const button = event.target.closest("[data-sort-field]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const source = document.querySelector(`.holdings-panel thead [data-sort-field="${CSS.escape(button.dataset.sortField)}"]`);
      source?.click();
    });
  }

  function getHoldingsTable() {
    const panel = document.querySelector("#holdingsTabPanel:not([hidden]) .holdings-panel, .holdings-panel");
    const wrap = panel?.querySelector(".table-wrap");
    const table = wrap?.querySelector("table");
    const head = table?.querySelector("thead");
    if (!panel || panel.closest("[hidden]") || !wrap || !table || !head) return null;
    return { panel, wrap, table, head };
  }

  function syncCloneHead(head) {
    if (!cloneTable) return;
    const nextHtml = head.outerHTML;
    if (cloneTable.dataset.headHtml === nextHtml) return;
    cloneTable.innerHTML = nextHtml;
    cloneTable.dataset.headHtml = nextHtml;
  }

  function updateStickyHeader() {
    rafId = 0;
    const current = getHoldingsTable();
    if (!current) {
      cloneHost?.classList.remove("is-visible");
      activeWrap = null;
      activeTable = null;
      return;
    }

    ensureClone();
    const { wrap, table, head } = current;
    syncCloneHead(head);
    activeWrap = wrap;
    activeTable = table;

    const wrapRect = wrap.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    const headRect = head.getBoundingClientRect();
    const headHeight = Math.max(headRect.height, 44);
    const shouldShow = headRect.top <= STICKY_TOP && tableRect.bottom > STICKY_TOP + headHeight;

    cloneHost.classList.toggle("is-visible", shouldShow);
    if (!shouldShow) return;

    cloneHost.style.left = `${Math.max(wrapRect.left, 0)}px`;
    cloneHost.style.top = `${STICKY_TOP}px`;
    cloneHost.style.width = `${Math.min(wrapRect.width, window.innerWidth - Math.max(wrapRect.left, 0))}px`;
    cloneHost.style.height = `${headHeight}px`;
    cloneHost.style.setProperty("--holdings-scroll-x", `${wrap.scrollLeft}px`);
    cloneTable.style.width = `${Math.max(tableRect.width, wrap.scrollWidth)}px`;
  }

  function requestUpdate() {
    if (rafId) return;
    rafId = window.requestAnimationFrame(updateStickyHeader);
  }

  function bindWrapScroll() {
    const current = getHoldingsTable();
    const wrap = current?.wrap;
    if (!wrap || wrap.dataset.stickyHeaderBound === "true") return;
    wrap.dataset.stickyHeaderBound = "true";
    wrap.addEventListener("scroll", requestUpdate, { passive: true });
  }

  function boot() {
    ensureClone();
    bindWrapScroll();
    requestUpdate();

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    document.addEventListener("click", () => {
      window.setTimeout(() => {
        bindWrapScroll();
        requestUpdate();
      }, 0);
    });

    const observer = new MutationObserver(() => {
      bindWrapScroll();
      requestUpdate();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "class", "data-sort-direction"] });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
