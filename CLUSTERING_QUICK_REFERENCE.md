# 🎯 動態 Marker 聚類系統 - 快速參考

## 核心概念（30秒快速了解）

```
問題：Survey Points 過多導致地圖卡頓
解決：動態聚類 + Web Worker 計算

低 zoom（全景）
  ↓ 多個 markers → 自動聚類
  ↓ 顯示：6-8 個聚類 markers（紫色圓形，顯示數量）
  ↓ 效果：流暢，60 FPS

高 zoom（細節）
  ↓ 聚類逐步解聚
  ↓ 顯示：個別 markers（黑色位置點）
  ↓ 效果：精確定位，完全無聚類
```

---

## 使用場景

| 場景 | Zoom | 顯示內容 | 用戶操作 |
|------|------|---------|---------|
| 全港總覽 | 10-12 | 8-12 個聚類 | 點擊聚類 → 自動縮放 |
| 區域查看 | 14-15 | 2-5 個聚類 + 20-50 個 markers | 繼續縮放 |
| 詳細檢視 | 17-18 | 所有個別 markers | 點擊查看詳情 |

---

## 檔案對應表

| 需求 | 檔案 | 功能 |
|------|------|------|
| 理解設計 | `CLUSTERING_DESIGN.md` | 完整演算法與架構 |
| 快速啟動 | `CLUSTERING_INTEGRATION_GUIDE.md` | 配置與故障排除 |
| 概念快速查詢 | 本文件 | 30秒概覽 |
| 核心演算法 | `modules/markerClusterer.js` | QuadTree + 聚類邏輯 |
| 後台計算 | `modules/clusterWorker.js` | Web Worker |
| 主線程協調 | `modules/markerClusteringManager.js` | Leaflet 整合 |
| 樣式 | `style.css` | 聚類 marker 外觀 |

---

## 關鍵數字

```
聚類半徑：
  Zoom < 8:      0.5°   (最大聚類)
  Zoom 8-17:     漸變
  Zoom >= 18:    0      (無聚類)

性能：
  聚類計算:      ~80ms  (Worker，非阻塞)
  首次加載:      ~150ms
  幀率:          50-60 FPS (縮放/拖曳)
  
限制：
  Max Markers:   500 (DOM 限制)
  支援 Survey Points: 1000+
```

---

## 一分鐘測試

```javascript
// 1. 打開瀏覽器控制台
// 2. 執行以下命令確認系統初始化

// 檢查是否初始化
console.log('ClusterManager 狀態：', clusterManager ? '✅ 已初始化' : '❌ 未初始化');

// 檢查 Worker 狀態
console.log('Worker 就緒：', clusterManager?.isWorkerReady ? '✅ 是' : '❌ 否');

// 檢查當前聚類數
console.log('當前聚類數：', clusterManager?.currentClusters.length);
console.log('當前 Markers 數：', clusterManager?.currentVisibleMarkers.length);

// 手動觸發重新計算
clusterManager?.computeClusters();
```

---

## 常見問題速查

| Q | A |
|---|---|
| 為什麼 markers 不是全部顯示？ | 設計如此！低 zoom 時自動聚類以保證效能 |
| 我想改聚類範圍怎麼辦？ | 編輯 `markerClusterer.js` 中的 `getClusterRadiusForZoom()` |
| markers 更新了但不顯示？ | 呼叫 `clusterManager.updateData(newPoints)` |
| 怎麼禁用動畫？ | `enableAnimation: false` 選項 |
| 支援多少個 markers？ | 目前 ~500（DOM），Canvas 優化後可達 5000+ |

---

## 配置速查

### 激進聚類（更早聚類）
```javascript
// markerClusterer.js - getClusterRadiusForZoom()
if (zoom >= 15) return 0.02;  // 從 0.01 改為 0.02
if (zoom >= 12) return 0.08;  // 從 0.05 改為 0.08
```

### 保守聚類（更晚聚類）
```javascript
// markerClusterer.js - getClusterRadiusForZoom()
if (zoom >= 15) return 0.005; // 從 0.01 改為 0.005
if (zoom >= 12) return 0.02;  // 從 0.05 改為 0.02
```

### 增加 Marker 上限
```javascript
// markerClusteringManager.js - constructor
maxVisibleMarkers: 1000,  // 從 500 改為 1000
```

### 加快更新
```javascript
// markerClusteringManager.js - constructor
zoomThrottleDelay: 100,   // 從 200 改為 100
```

---

## 關鍵檢查點

```
✓ 地圖初始化完成？
  └─ 看 console: "[ClusterManager] Initialized"

✓ Survey Points 已加載？
  └─ 看 console: "[ClusterManager] Received X survey points"

✓ Worker 就緒？
  └─ 看 console: "[ClusterManager] Worker initialized"

✓ 聚類計算在執行？
  └─ 縮放地圖時看 console: "[ClusterManager] Computed: Y clusters..."

✓ 效能正常？
  └─ 打開 DevTools → Performance，拖曳地圖，FPS 應在 50+ 以上
```

---

## 架構速覽

```
User 操作（縮放/拖曳）
    ↓
mapPopup.js
    ↓
MarkerClusteringManager
    ├─ 監聽地圖事件 (zoomend/moveend)
    ├─ 節流計算請求 (200ms)
    └─ 發送至 Worker
         ↓
    clusterWorker.js
    ├─ 接收 zoom + bounds
    ├─ QuadTree 查詢
    ├─ 聚類計算
    └─ 回傳結果
         ↓
MarkerClusteringManager
    ├─ 渲染 Cluster Markers（紫色圓形）
    ├─ 渲染 Individual Markers（黑色點）
    └─ 更新地圖顯示
         ↓
地圖更新 ✅
```

---

## 性能監控

### 即時 FPS 查看
```javascript
// DevTools 中執行
let fps = 0, lastTime = performance.now();
function checkFPS() {
  const now = performance.now();
  fps = Math.round(1000 / (now - lastTime));
  console.log(`FPS: ${fps}`);
  lastTime = now;
  requestAnimationFrame(checkFPS);
}
checkFPS();
```

### 聚類計算耗時
```javascript
// DevTools 中執行
performance.mark('cluster-start');
clusterManager.computeClusters();
setTimeout(() => {
  performance.mark('cluster-end');
  performance.measure('clustering', 'cluster-start', 'cluster-end');
  const measure = performance.getEntriesByName('clustering')[0];
  console.log(`聚類耗時: ${measure.duration.toFixed(2)}ms`);
}, 100);
```

---

## 除錯技巧

### 查看當前狀態
```javascript
console.log({
  clusters: clusterManager.currentClusters.length,
  markers: clusterManager.currentVisibleMarkers.length,
  workerReady: clusterManager.isWorkerReady,
  computationInFlight: clusterManager.computationInFlight,
});
```

### 強制重新計算
```javascript
clusterManager.scheduleComputation();
```

### 清除並重載
```javascript
clusterManager.destroy();
clusterManager = new MarkerClusteringManager(map, { /* options */ });
clusterManager.setSurveyPoints(points);
```

---

## 已知限制

| 限制 | 原因 | 解決方案 |
|------|------|--------|
| Max ~500 markers | DOM 瓶頸 | 使用 Canvas 層（未來版本） |
| Worker 初始化延遲 | 模組載入 | 預熱 Worker 或緩存結果 |
| 低 zoom 精度損失 | 聚類半徑大 | 接受損失或減小半徑 |

---

## 快速排查流程

```
症狀：markers 不顯示
  → 檢查 console 是否有錯誤
  → 確認 setSurveyPoints() 已呼叫
  → 檢查 Worker 狀態
  → 手動呼叫 computeClusters()

症狀：縮放卡頓
  → 檢查 FPS（應在 50+）
  → 減少 maxVisibleMarkers
  → 禁用動畫
  → 增加 zoomThrottleDelay

症狀：聚類不解聚
  → 檢查 getClusterRadiusForZoom() 配置
  → 確認 zoom level 正確
  → 手動測試不同 zoom 值
```

---

## 下一步

1. **即刻使用**：系統已自動整合，無需額外操作
2. **性能優化**：根據實測調整 `maxVisibleMarkers` 和聚類半徑
3. **自定義樣式**：修改 `style.css` 中的聚類 marker 顏色
4. **未來擴展**：參考 `CLUSTERING_DESIGN.md` 中的"未來優化方向"

---

**🎉 系統已上線，可投入使用！**

