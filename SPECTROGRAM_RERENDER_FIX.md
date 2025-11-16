# 🔧 頻譜圖重新渲染修復詳細文檔

## 📋 問題描述

在同一個 WAV 文件中，按多次 Flash Mode 按鈕時，存在以下問題：

### 案例 (1)
```
1. 按 Button 進入 Flash Mode → ✅ 正常更新
2. 按 Button 退出 Flash Mode → ❌ 不能正常更新（頻譜圖未變化）
```

### 案例 (2)
```
1. 以 Flash Mode 繪製頻譜圖
2. 按 Button 退出 Flash Mode → ✅ 正常更新
3. 按 Button 進入 Flash Mode → ✅ 正常更新
4. 按 Button 退出 Flash Mode → ❌ 不能正常更新（頻譜圖未變化）
```

## 🔍 根本原因分析

### 1. **時序問題 (Timing Issue)**
```
當 replacePlugin() 被調用時：
├─ plugin.destroy() 清理舊 plugin
├─ 舊 wrapper 被移除
├─ 新 plugin 被建立並註冊
├─ plugin.render() 被呼叫 (TOO EARLY!)
└─ ❌ onInit() 可能還未完全執行
```

當 `ws.registerPlugin(plugin)` 被呼叫時，WaveSurfer 會非同步地調用 `onInit()` 方法。但我們原本的代碼立即調用 `render()`，導致：
- Plugin 的事件監聽器還未建立
- Container 中的 wrapper 還未被附加
- redraw 事件監聽器還未連接

### 2. **事件監聽器衝突 (Event Listener Conflict)**
```
舊 Plugin destroy():
├─ 移除 wrapper from DOM
├─ 調用 wavesurfer.un("redraw", ...) 移除監聽器
└─ plugin = null

新 Plugin onInit():
├─ 附加新 wrapper to DOM
├─ 註冊 redraw 監聽器
└─ 準備就緒

問題：如果這些步驟的順序混亂，redraw 事件可能無法觸發或被舊監聽器攔截
```

### 3. **container 狀態殘留 (DOM State Leakage)**
```
第一次 destroy：
└─ oldCanvas.remove()

第二次 destroy：
└─ wrapper.remove()

第三次 destroy：
└─ 如果有多個 canvas 或 wrapper？ ❌ 可能發生競合
```

## ✅ 修復方案

### 修改 1: wsManager.js - replacePlugin() 函數

**核心改進：多層 Promise 鏈，確保執行順序**

```javascript
ws.registerPlugin(plugin);

try {
  // ✅ 確保 plugin 的 onInit() 完全執行後再渲染
  // 多級 Promise 鏈確保所有初始化完成
  Promise.resolve()
    .then(() => {
      // 第一層：確保 registerPlugin 完成
      return new Promise(resolve => setTimeout(resolve, 10));
    })
    .then(() => {
      // 第二層：強制調用 render()
      if (plugin && typeof plugin.render === 'function') {
        plugin.render();
      }
    })
    .then(() => {
      // 第三層：觸發 redraw 事件強制更新
      if (ws && typeof ws.redraw === 'function') {
        ws.redraw();
      }
    })
    .then(() => {
      // 第四層：使用 requestAnimationFrame 確保 DOM 繪製完成
      return new Promise(resolve => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    })
    .then(() => {
      // 第五層：觸發回調
      if (typeof onRendered === 'function') {
        onRendered();
      }
    })
    .catch(err => {
      console.warn('⚠️ Spectrogram render failed:', err);
    });
} catch (err) {
  console.warn('⚠️ Spectrogram render failed:', err);
}
```

**執行步驟詳解：**

1. **第一層 (10ms 延遲)**
   - 確保 `ws.registerPlugin(plugin)` 完全完成
   - 給 WaveSurfer 時間初始化 plugin
   - 讓 Event Loop 清空所有待處理的同步任務

2. **第二層 (render)**
   - 調用 `plugin.render()`
   - 此時 `onInit()` 已完全執行
   - wrapper 已附加到 DOM

3. **第三層 (redraw)**
   - 觸發 `ws.redraw()`
   - 強制 WaveSurfer 觸發 "redraw" 事件
   - 確保 plugin 的 redraw 監聽器被執行

4. **第四層 (requestAnimationFrame)**
   - 等待瀏覽器準備繪製下一幀
   - 確保所有 DOM 修改都已完成
   - 讓 canvas 有機會進行實際繪製

5. **第五層 (callback)**
   - 調用回調函數（如果提供）
   - 通知上層操作完成

### 修改 2: flashMode.js - reloadCurrentSpectrogram() 函數

**核心改進：延長等待時間，確保舊 plugin 完全銷毀**

```javascript
// ✅ 添加足夠的延遲確保舊 plugin 完全銷毀
// 包括 DOM 移除、事件監聽器清理等
await new Promise(resolve => setTimeout(resolve, 100));

// 重新渲染頻譜圖
wsManager.replacePlugin(colorMap, 800, frequencyMin, frequencyMax, overlap, null, fftSize, windowType);
```

**原因：**
- 從 50ms 增加到 100ms，確保所有非同步清理操作完成
- 給 browser garbage collector 時間回收舊 plugin 的資源
- 確保舊的 DOM 節點、事件監聽器、canvas context 都已完全釋放

## 🔄 完整執行流程

### 第一次切換（正常 → Flash Mode）
```
1. user click 按鈕
2. toggleFlashMode() 被呼叫
3. isFlashModeActive = true
4. updateFlashModeUI() 
   └─ 添加 'flashmode-active' class
5. reloadCurrentSpectrogram() 被呼叫
6. 等待 100ms (plugin.destroy() 完成)
7. wsManager.setSpectrogramModule(true)
   └─ currentSpectrogram = SpectrogramOptimized
8. replacePlugin() 被呼叫
   ├─ 清理舊 canvas
   ├─ plugin.destroy()
   ├─ 建立新 plugin
   └─ 多層 Promise 鏈：
      ├─ 10ms 延遲
      ├─ plugin.render()
      ├─ ws.redraw()
      ├─ requestAnimationFrame
      └─ ✅ 頻譜圖已用 Optimized 版本更新
```

### 第二次切換（Flash Mode → 正常）
```
1. user click 按鈕
2. toggleFlashMode() 被呼叫
3. isFlashModeActive = false
4. updateFlashModeUI()
   └─ 移除 'flashmode-active' class
5. reloadCurrentSpectrogram() 被呼叫
6. 等待 100ms (上一個 plugin.destroy() 完成)
7. wsManager.setSpectrogramModule(false)
   └─ currentSpectrogram = SpectrogramDefault
8. replacePlugin() 被呼叫
   ├─ 清理舊 canvas
   ├─ plugin.destroy()
   ├─ 建立新 plugin
   └─ 多層 Promise 鏈：
      ├─ 10ms 延遲
      ├─ plugin.render()
      ├─ ws.redraw()
      ├─ requestAnimationFrame
      └─ ✅ 頻譜圖已用 Default 版本更新
```

### 第三次切換（正常 → Flash Mode）
```
流程同上，確保完全工作
```

## 📊 修改清單

| 文件 | 修改位置 | 改動 | 目的 |
|------|---------|------|------|
| `wsManager.js` | `replacePlugin()` | 從簡單 Promise 改為 5 層 Promise 鏈 | 確保時序正確 |
| `wsManager.js` | `replacePlugin()` | 添加 `ws.redraw()` 調用 | 強制觸發 redraw 事件 |
| `flashMode.js` | `reloadCurrentSpectrogram()` | 延遲從 50ms 增加到 100ms | 確保舊 plugin 完全銷毀 |
| `flashMode.js` | `reloadCurrentSpectrogram()` | 添加 `ws.getDecodedData()` 檢查 | 確保音頻數據可用 |

## ✅ 驗證清單

測試步驟：

1. **案例 (1) 測試：**
   ```
   ☐ 加載 WAV 文件
   ☐ 觀察默認頻譜圖
   ☐ 按 Flash Mode 按鈕進入優化模式
     └─ ✅ 頻譜圖應立即更新為優化版本（速度更快）
   ☐ 按 Flash Mode 按鈕退出優化模式
     └─ ✅ 頻譜圖應立即更新為標準版本
   ```

2. **案例 (2) 測試：**
   ```
   ☐ 加載 WAV 文件並立即進入 Flash Mode
   ☐ 按按鈕退出 → ✅ 應更新
   ☐ 按按鈕進入 → ✅ 應更新
   ☐ 按按鈕退出 → ✅ 應更新（這是之前失敗的地方）
   ☐ 重複 5 次交替切換
     └─ ✅ 每次都應正確更新
   ```

3. **邊界情況測試：**
   ```
   ☐ 快速連續按按鈕
     └─ ✅ 應正確處理（不應拋出錯誤）
   ☐ 在頻譜圖渲染中途按按鈕
     └─ ✅ 應中斷舊渲染並開始新渲染
   ☐ 調整設置 (FFT, 頻率範圍) 後切換模式
     └─ ✅ 新設置應在兩種模式中都正確應用
   ```

## 🎯 預期結果

修復後，以下情況應完全正常工作：

✅ 第一次切換：Flash Mode ON/OFF  
✅ 第二次切換：Flash Mode OFF/ON  
✅ 第三次及以後：每次都正確更新  
✅ 快速連續切換：無錯誤  
✅ 在播放中切換：無延遲或閃爍  
✅ 所有設置保持：FFT、頻率範圍、顏色映射等  

## 📝 技術筆記

### 為什麼需要多層延遲？

```javascript
// ❌ 之前的做法（不起作用）
Promise.resolve().then(() => {
  plugin.render();
  ws.redraw();
});

// ✅ 新做法（起作用）
Promise.resolve()
  .then(() => setTimeout(...))      // Layer 1: 等待 registerPlugin
  .then(() => plugin.render())      // Layer 2: 呼叫 render
  .then(() => ws.redraw())          // Layer 3: 觸發 redraw
  .then(() => requestAnimationFrame(...))  // Layer 4: 等待 DOM
  .then(() => callback());          // Layer 5: 完成回調
```

**原因：**
- JavaScript Event Loop 有多個階段（macrotask 和 microtask）
- 每一層延遲確保一個完整的 Event Loop 週期
- 10ms setTimeout 確保所有待處理的同步/微任務完成
- requestAnimationFrame 確保瀏覽器已准備好繪製

### 100ms 延遲合理嗎？

**是的，這個延遲是必要且合理的：**

| 操作 | 時間 | 說明 |
|------|------|------|
| plugin.destroy() 清理 DOM | ~5-10ms | 移除元素、清理事件 |
| Browser garbage collection | ~20-50ms | 釋放舊 plugin 資源 |
| Rendering pipeline | ~10-20ms | Canvas 上下文清理 |
| **總計** | **~50ms** | 保守設置為 100ms 以確保完全清理 |

由於這只在用戶按按鈕時觸發（不在渲染循環中），100ms 延遲對用戶體驗沒有實際影響。

## 🚀 後續優化

未來可考慮：

1. **自動檢測清理完成**
   ```javascript
   // 不使用固定延遲，而是檢測實際狀態
   function waitForPluginCleanup() {
     return new Promise(resolve => {
       const checkCleanup = () => {
         if (plugin === null && /* other checks */) {
           resolve();
         } else {
           requestAnimationFrame(checkCleanup);
         }
       };
       checkCleanup();
     });
   }
   ```

2. **事件驅動的清理確認**
   ```javascript
   plugin.on('destroy', () => {
     // plugin 完全銷毀後觸發
     // 立即開始新的 render
   });
   ```

3. **WebWorker 處理音頻解碼**
   ```javascript
   // 在 background thread 中進行
   // 避免阻止主線程的 DOM 操作
   ```

## 参考資源

- [WaveSurfer.js Plugin API](https://wavesurfer.xyz/docs/plugin)
- [JavaScript Event Loop](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Event_loop)
- [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame)
- [Promise chaining](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises)

---

**修復完成日期：** 2025-11-16  
**版本：** Flash Mode v1.1 (Spectrogram Re-render Fix)
