"use strict";

const CACHE_NAME = "wealthtrack-v112";
const APP_SHELL = [
  "./",
  "./index.html",
  "./asset-detail.html",
  "./styles-v56.css?v=104",
  "./layout-fix-v57.css",
  "./dashboard-tabs-v58.css?v=108",
  "./overview-dividends-v69.css?v=110",
  "./overview-dividends-sort-v75.css?v=112",
  "./holdings-sticky-v65.css",
  "./growth-history-v73.js?v=111",
  "./growth-chart-hover-v74.js?v=111",
  "./overview-dividends-sort-v75.js?v=112",
  "./holdings-sticky-v65.js?v=111",
  "./app-v58.js?v=112",
  "./app-v47.js?v=111",
  "./asset-detail-v53.js?v=107",
  "./manifest.webmanifest",
  "./icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => (key === CACHE_NAME ? null : caches.delete(key)))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
  );
});
