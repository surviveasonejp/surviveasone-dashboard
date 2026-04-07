// ─── Survive as One — Service Worker ─────────────────
// 戦略: App Shell キャッシュ + API ネットワーク優先
// 目的: 電源喪失前にインストール → オフラインで FOOD/FAMILY/PREPARE 等を閲覧可能

const CACHE_NAME = "sao-v5";

// App Shell: オフラインで必要な静的リソース
const APP_SHELL = [
  "/",
  "/food-collapse",
  "/family",
  "/prepare",
  "/countdown",
  "/collapse-map",
  "/last-tanker",
  "/dashboard",
  "/about",
  "/for/parents",
  "/for/dialysis",
  "/for/elderly",
];

// 重要API: オフラインでも閲覧可能にするためプリキャッシュ
const CRITICAL_APIS = [
  "/api/countdowns?scenario=realistic",
  "/api/collapse?scenario=realistic",
  "/api/tankers",
  "/api/simulation?scenario=realistic&days=365",
];

// install: App Shell + 重要APIをプリキャッシュ
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // App Shellを先にキャッシュ（必須）
      return cache.addAll(APP_SHELL).then(() => {
        // APIはベストエフォート（失敗してもinstallは成功させる）
        return Promise.allSettled(
          CRITICAL_APIS.map((url) =>
            fetch(url).then((res) => res.ok ? cache.put(url, res) : undefined)
          )
        );
      });
    })
  );
  self.skipWaiting();
});

// activate: 古いキャッシュを削除
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// fetch: リクエスト種別に応じた戦略
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 同一オリジンのみ処理
  if (url.origin !== self.location.origin) return;

  // API リクエスト: ネットワーク優先 → キャッシュフォールバック
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 静的アセット (.js, .css, 画像): キャッシュ優先
  if (
    url.pathname.startsWith("/assets/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".json") ||
    url.pathname.endsWith(".ico")
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // ナビゲーション (HTML ページ): ネットワーク優先 → キャッシュ → オフラインページ
  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request));
    return;
  }

  // その他: ネットワーク優先
  event.respondWith(networkFirst(request));
});

// ─── 戦略関数 ───────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok && request.method === "GET") {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    if (request.method !== "GET") {
      return new Response('{"error":"offline"}', {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    const cached = await caches.match(request);
    return cached || new Response('{"error":"offline"}', {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function navigationHandler(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // オフライン: SPA なので "/" のキャッシュを返す（クライアントルーティングに委ねる）
    const cached = await caches.match("/");
    return cached || new Response(
      "<html><body style='background:#0f1419;color:#fff;font-family:sans-serif;padding:2rem;'>" +
      "<h1 style='color:#ef4444;'>Survive as One</h1>" +
      "<p>オフラインです。事前にページを開いてキャッシュしてください。</p></body></html>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}
