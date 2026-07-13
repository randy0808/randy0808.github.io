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
      const source = [...document.querySelectorAll(".holdings-panel thead [data-sort-field]")]
        .find((item) => item.dataset.sortField === button.dataset.sortField);
      source?.click();
    });

    cloneHost.addEventListener("wheel", (event) => {
      if (!activeWrap || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      activeWrap.scrollLeft += event.deltaX;
      requestUpdate();
    }, { passive: false });
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
    if (cloneTable.dataset.headHtml !== nextHtml) {
      cloneTable.innerHTML = nextHtml;
      cloneTable.dataset.headHtml = nextHtml;
    }
  }

  function syncColumnWidths(sourceHead, sourceTable) {
    const sourceCells = [...sourceHead.querySelectorAll("th")];
    const cloneCells = [...cloneTable.querySelectorAll("th")];
    const tableWidth = Math.ceil(Math.max(sourceTable.scrollWidth, sourceTable.offsetWidth, sourceTable.getBoundingClientRect().width, 980));

    cloneHost.style.setProperty("--holdings-table-width", `${tableWidth}px`);
    cloneTable.style.width = `${tableWidth}px`;
    cloneTable.style.minWidth = `${tableWidth}px`;

    cloneCells.forEach((cell, index) => {
      const sourceCell = sourceCells[index];
      if (!sourceCell) return;
      const width = Math.ceil(sourceCell.getBoundingClientRect().width || sourceCell.offsetWidth || 0);
      if (width <= 0) return;
      cell.style.width = `${width}px`;
      cell.style.minWidth = `${width}px`;
      cell.style.maxWidth = `${width}px`;
    });
  }

  function currentHiddenX(wrap, table) {
    const wrapRect = wrap.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    const byWrapScroll = Number(wrap.scrollLeft) || 0;
    const byGeometry = Math.max(0, Math.round(wrapRect.left - tableRect.left));
    const byWindow = Math.max(0, Math.round(window.scrollX || document.documentElement.scrollLeft || document.body.scrollLeft || 0));
    return Math.max(byWrapScroll, byGeometry, byWindow);
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
    syncColumnWidths(head, table);
    activeWrap = wrap;
    activeTable = table;

    const wrapRect = wrap.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    const headRect = head.getBoundingClientRect();
    const headHeight = Math.max(headRect.height, 44);
    const shouldShow = headRect.top <= STICKY_TOP && tableRect.bottom > STICKY_TOP + headHeight;

    cloneHost.classList.toggle("is-visible", shouldShow);
    if (!shouldShow) return;

    const left = Math.max(wrapRect.left, 0);
    cloneHost.style.left = `${left}px`;
    cloneHost.style.top = `${STICKY_TOP}px`;
    cloneHost.style.width = `${Math.min(wrapRect.width, window.innerWidth - left)}px`;
    cloneHost.style.height = `${headHeight}px`;
    cloneHost.style.setProperty("--holdings-scroll-x", `${currentHiddenX(wrap, table)}px`);
  }

  function requestUpdate() {
    if (rafId) return;
    rafId = window.requestAnimationFrame(updateStickyHeader);
  }

  function bindWrapScroll() {
    const current = getHoldingsTable();
    const wrap = current?.wrap;
    if (!wrap || wrap.dataset.stickyHeaderV65Bound === "true") return;
    wrap.dataset.stickyHeaderV65Bound = "true";
    wrap.addEventListener("scroll", requestUpdate, { passive: true });
  }

  function boot() {
    ensureClone();
    bindWrapScroll();
    requestUpdate();

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    window.addEventListener("orientationchange", requestUpdate);
    document.addEventListener("scroll", requestUpdate, true);
    document.addEventListener("touchmove", requestUpdate, { passive: true });
    document.addEventListener("pointermove", requestUpdate, { passive: true });
    window.visualViewport?.addEventListener("scroll", requestUpdate, { passive: true });
    window.visualViewport?.addEventListener("resize", requestUpdate);

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
