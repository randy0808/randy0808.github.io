"use strict";

const CACHE_NAME = "wealthtrack-v93";
const APP_SHELL = [
  "./",
  "./index.html",
  "./asset-detail.html",
  "./styles-v56.css?v=93",
  "./layout-fix-v57.css",
  "./dashboard-tabs-v58.css",
  "./overview-dividends-v69.css",
  "./overview-dividends-sort-v75.css?v=93",
  "./holdings-sticky-v65.css",
  "./growth-history-v73.js?v=93",
  "./growth-chart-hover-v74.js?v=93",
  "./overview-dividends-sort-v75.js?v=93",
  "./holdings-sticky-v65.js?v=93",
  "./app-v58.js?v=93",
  "./app-v47.js?v=93",
  "./asset-detail-v53.js?v=90",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
