"use strict";

(() => {
  let rememberedTop = 0;

  function getPayerList() {
    return document.querySelector("#entryQuickStats .dividend-payers");
  }

  function rememberScroll() {
    const list = getPayerList();
    if (!list) return rememberedTop;
    rememberedTop = list.scrollTop;
    return rememberedTop;
  }

  function restoreScroll(top = rememberedTop) {
    const list = getPayerList();
    if (!list) return;
    const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
    const nextTop = Math.min(Math.max(0, Number(top) || 0), maxScroll);
    list.scrollTop = nextTop;
  }

  function restoreScrollSoon(top = rememberedTop) {
    restoreScroll(top);
    requestAnimationFrame(() => restoreScroll(top));
    setTimeout(() => restoreScroll(top), 0);
    setTimeout(() => restoreScroll(top), 80);
  }

  function bindScrollMemory() {
    const list = getPayerList();
    if (!list || list.__wealthtrackDividendScrollV71) return;
    list.__wealthtrackDividendScrollV71 = true;
    list.addEventListener("scroll", () => {
      rememberedTop = list.scrollTop;
    }, { passive: true });
  }

  function patchRender() {
    if (typeof render !== "function" || render.__dividendScrollV71) return;
    const baseRender = render;

    render = function renderWithDividendScrollV71(...args) {
      const topBeforeRender = rememberScroll();
      const result = baseRender.apply(this, args);
      bindScrollMemory();
      restoreScrollSoon(topBeforeRender);
      return result;
    };

    render.__dividendScrollV71 = true;
  }

  function boot() {
    bindScrollMemory();
    patchRender();

    const target = document.getElementById("entryQuickStats");
    if (!target || target.__wealthtrackDividendObserverV71) return;
    target.__wealthtrackDividendObserverV71 = true;

    const observer = new MutationObserver(() => {
      bindScrollMemory();
      restoreScrollSoon(rememberedTop);
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  boot();
  requestAnimationFrame(boot);
  setTimeout(boot, 250);
})();
