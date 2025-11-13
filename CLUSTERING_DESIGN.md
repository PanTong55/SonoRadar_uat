# 動態 Marker 聚類系統 - 設計文檔

## 概述

本系統實現了一個高效、可擴展的 Marker 動態聚類渲染方案，專門針對 Survey Point 在 Leaflet 地圖上的渲染優化。系統使用 **Web Worker** 執行 CPU 密集的聚類計算，並通過 **QuadTree** 空間索引加速查詢。

---

## 架構設計

```
┌─────────────────────────────────────────────────────────┐
│                  主線程（Main Thread）                  │
│  ┌─────────────────────────────────────────────────────┐│
│  │         MarkerClusteringManager                      ││
│  │  • 管理 Worker 通信                                 ││
│  │  • 監聽地圖事件（zoom/move）                        ││
│  │  • 渲染 Cluster Markers & Individual Markers        ││
│  │  • 處理 Pinned Markers                             ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
                          ↕ (postMessage)
┌─────────────────────────────────────────────────────────┐
│               Worker 線程（Worker Thread）              │
│  ┌─────────────────────────────────────────────────────┐│
│  │        ClusterEngine + QuadTree                      ││
│  │  • 構建/查詢空間索引                                 ││
│  │  • 根據 zoom 計算聚類半徑                            ││
│  │  • 執行聚類計算                                     ││
│  │  • 返回 clusters 和 visiblePoints                   ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

---

## 核心演算法

### 1. QuadTree 空間索引

**用途**：快速查詢指定地理邊界內的所有點

**複雜度**：
- 插入：O(log n)
- 查詢：O(log n + k)（其中 k 為結果數量）

**Pseudocode**：

```
class QuadTree:
  function insert(point):
    if point not in bounds:
      return false
    
    if children == null and points.length < maxPoints:
      points.push(point)
      return true
    
    if children == null and depth < maxDepth:
      subdivide()
    
    if children != null:
      for each child:
        if child.insert(point):
          return true
    else:
      points.push(point)
    
    return true
  
  function subdivide():
    create 4 child quadrants
    redistribute existing points to children
  
  function query(bounds):
    result = []
    if not intersects(bounds):
      return result
    
    for point in points:
      if pointInBounds(point, bounds):
        result.push(point)
    
    for child in children:
      result.push(...child.query(bounds))
    
    return result
```

### 2. 聚類計算引擎

**核心策略**：

```
function computeClusters(zoom, mapBounds):
  radiusLatitude = getClusterRadiusForZoom(zoom)
  radiusLongitude = radiusLatitude / cos(centerLat)
  
  clusters = []
  clustered = Set()
  visiblePoints = []
  
  // 查詢地圖邊界內的所有點
  pointsInBounds = quadTree.query(mapBounds)
  
  // 第一遍：形成聚類
  for each point in pointsInBounds:
    if point.id in clustered:
      continue
    
    // 找尋該點周邊的所有鄰近點
    nearby = pointsInBounds.filter(p =>
      p.id not in clustered &&
      |p.lat - point.lat| <= radiusLatitude &&
      |p.lng - point.lng| <= radiusLongitude
    )
    
    if nearby.length > 1:
      // 形成聚類
      center = computeCenter(nearby)
      clusters.push({
        id: generateClusterId(),
        lat: center.lat,
        lng: center.lng,
        count: nearby.length,
        points: nearby
      })
      
      for each p in nearby:
        clustered.add(p.id)
    else:
      clustered.add(point.id)
  
  // 第二遍：收集未聚類的點
  for each point in pointsInBounds:
    if point.id not in clustered:
      visiblePoints.push(point)
  
  return { clusters, visiblePoints }
```

### 3. 動態聚類半徑調整

根據 zoom level 動態調整聚類範圍：

| Zoom Level | 聚類半徑(Lat) | 說明 |
|-----------|-------------|------|
| < 8       | 0.5°        | 最低縮放，最大聚類 |
| 8-9       | 0.2°        | 寬視角 |
| 10-11     | 0.1°        | 中視角 |
| 12-14     | 0.05°       | 較窄視角 |
| 15-17     | 0.01°       | 窄視角 |
| ≥ 18      | 0          | 不聚類 |

### 4. 流程控制與節流

```
事件：map.zoomend / map.moveend
  ↓
scheduleComputation() [節流 200ms]
  ↓
computeClusters()
  ↓
Worker 計算（非阻塞）
  ↓
handleWorkerMessage()
  ↓
renderClusters()
  ↓
更新 DOM（Cluster Markers + Individual Markers）
```

---

## API 設計

### MarkerClusteringManager

```javascript
// 初始化
const manager = new MarkerClusteringManager(map, {
  maxVisibleMarkers: 500,        // 單次渲染的 marker 上限
  enableAnimation: true,         // 是否啟用動畫
  animationDuration: 300         // 動畫時長 (ms)
});

// 設置 survey points 數據
manager.setSurveyPoints([
  { id: 'p1', lat: 22.3, lng: 114.1, location: 'Area A' },
  { id: 'p2', lat: 22.31, lng: 114.12, location: 'Area B' },
  // ...
]);

// 監聽數據變化（如檔案列表更新）
manager.updateData(newPointsArray);

// 銷毀（清理資源）
manager.destroy();
```

### Cluster Marker 事件

```javascript
// 聚類 marker 點擊 → 縮放至該區域
clusterMarker.on('click', () => {
  map.fitBounds(clusterBbox, { padding: 50, duration: 500 });
});

// 滑鼠懸停 → 放大
clusterMarker.on('mouseover', () => {
  clusterMarker.style.transform = 'scale(1.2)';
});
```

### Individual Marker 事件

```javascript
// 點擊 marker → Pin/Unpin
marker.on('click', () => {
  toggleMarkerPin(marker, pointData);
});

// Pin 狀態：顯示 persistent popup（不自動平移）
marker.openPopup({ autoPan: false });
```

---

## 效能指標

### 目標指標

- **Marker 數量**：支援 1000+ Survey Points
- **幀率**：維持 60 FPS（在 zoom/pan 時）
- **聚類計算時間**：< 100ms（使用 Worker）
- **首次渲染延遲**：< 500ms

### 優化策略

1. **Web Worker**：計算不阻塞主線程
2. **QuadTree 索引**：O(log n) 查詢複雜度
3. **節流**：zoom/move 事件節流 200ms
4. **Marker 池**：重用 DOM 元素（未來優化）
5. **Canvas 渲染**：未來改進（取代 divIcon）

---

## 實現細節

### 聚類流程圖

```
┌──────────────────┐
│  fetchSurveyData │
└────────┬─────────┘
         ↓
┌──────────────────────────┐
│  initClusteringManager   │
│  + init Worker           │
└────────┬─────────────────┘
         ↓
┌──────────────────────────┐
│  setSurveyPoints         │
│  → format & send to      │
│    Worker(INIT)          │
└────────┬─────────────────┘
         ↓
    ┌────────────────────────────┐
    │ 監聽: zoom/moveend 事件    │
    └────────┬───────────────────┘
             ↓
    ┌────────────────────────────┐
    │ scheduleComputation()      │
    │ [節流 200ms]               │
    └────────┬───────────────────┘
             ↓
    ┌────────────────────────────┐
    │ 發送 COMPUTE_CLUSTERS      │
    │ 到 Worker                  │
    └────────┬───────────────────┘
             ↓
    ┌────────────────────────────┐
    │ Worker QuadTree Query +    │
    │ 聚類計算                   │
    │ [非阻塞]                   │
    └────────┬───────────────────┘
             ↓
    ┌────────────────────────────┐
    │ 回傳 CLUSTERS_COMPUTED     │
    │ + 結果                     │
    └────────┬───────────────────┘
             ↓
    ┌────────────────────────────┐
    │ renderClusters()           │
    │ • 清除舊 markers           │
    │ • 添加 cluster markers     │
    │ • 添加 visible markers     │
    │ • 更新 Map 顯示            │
    └────────────────────────────┘
```

---

## 使用場景

### 場景 1：初始加載（低 zoom）
- 顯示 20-30 個聚類 markers
- 無個別 markers
- 使用者縮放時逐步解聚

### 場景 2：中等縮放
- 顯示 5-10 個聚類 + 50-100 個個別 markers

### 場景 3：高度縮放（zoom >= 18）
- 不進行聚類
- 直接顯示所有可見的 markers
- 當 markers > maxVisibleMarkers 時，仍然受限制（待優化）

---

## 未來優化方向

1. **虛擬化渲染**：Canvas 層疊，只渲染視口內的 markers
2. **Marker 池**：重用 Leaflet marker 物件，減少 DOM 創建
3. **分層聚類**：多層次聚類，適應更大的數據集
4. **動畫過渡**：聚類/解聚時的平滑動畫
5. **Cache 策略**：緩存不同 zoom level 的聚類結果
6. **自適應半徑**：根據點密度自動調整聚類半徑

---

## 測試建議

```javascript
// 效能測試
const startTime = performance.now();
manager.computeClusters(zoom, bounds);
const elapsed = performance.now() - startTime;
console.log(`Clustering took ${elapsed}ms`);

// 監視 FPS
let lastTime = performance.now();
function checkFPS() {
  const now = performance.now();
  const fps = 1000 / (now - lastTime);
  console.log(`FPS: ${fps.toFixed(1)}`);
  lastTime = now;
  requestAnimationFrame(checkFPS);
}
```

---

## 已知限制與解決方案

| 限制 | 原因 | 解決方案 |
|------|------|--------|
| maxVisibleMarkers 上限 | DOM 渲染瓶頸 | 使用 Canvas + WebGL 層 |
| 高度聚類時精度損失 | 聚類距離過大 | 提高 zoom 下的聚類精度 |
| Worker 初始化延遲 | Worker 加載時間 | 預熱 Worker，緩存聚類結果 |

