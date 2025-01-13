const CACHE_NAME = 'ocr-app-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/icon-192.png',
  '/manifest.json'
];

// 安裝 Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()) // 確保新的 service worker 立即激活
  );
});

// 啟動 Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      // 清理舊的快取
      caches.keys().then(keys => {
        return Promise.all(
          keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        );
      }),
      // 接管所有客戶端
      self.clients.claim()
    ])
  );
});

// 處理請求
self.addEventListener('fetch', event => {
  // 跳過非 GET 請求和非本站請求
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 如果在快取中找到響應，則返回快取的響應
        if (response) {
          // 同時更新快取（後台更新）
          fetch(event.request)
            .then(newResponse => {
              if (newResponse && newResponse.status === 200) {
                caches.open(CACHE_NAME)
                  .then(cache => cache.put(event.request, newResponse));
              }
            })
            .catch(() => {/* 忽略更新錯誤 */});
          return response;
        }

        // 否則發送網路請求
        return fetch(event.request)
          .then(response => {
            // 檢查是否收到有效的響應
            if (!response || response.status !== 200) {
              return response;
            }

            // 將響應複製並存儲在快取中
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            return response;
          })
          .catch(error => {
            // 如果離線且資源未快取，返回離線頁面
            if (event.request.mode === 'navigate') {
              return caches.match('/offline.html');
            }
            throw error;
          });
      })
  );
});