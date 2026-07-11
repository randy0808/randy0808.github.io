"use strict";

(() => {
  const serviceWorker = navigator.serviceWorker;
  const originalRegister = serviceWorker?.register?.bind(serviceWorker);

  if (originalRegister) {
    serviceWorker.register = (url, options) => {
      const nextUrl = String(url || "").replace("service-worker-v47.js", "service-worker-v49.js");
      return originalRegister(nextUrl, options);
    };
  }

  const script = document.createElement("script");
  script.src = "app-v47.js?v=49";
  script.defer = true;
  document.head.appendChild(script);
})();
