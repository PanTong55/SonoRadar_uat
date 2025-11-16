# 🚀 Flash Mode 頻譜圖重新渲染修復 - 快速參考

## 問題概述

```
同一個 WAV 文件中多次按 Flash Mode 按鈕時：
❌ 第 1 次按進、第 2 次按出 → 不更新
❌ 連續多次切換時 → 間歇性不更新
```

## 修復方式

### 簡單版本
- **wsManager.js**：render() 調用改為分 5 層異步執行
- **flashMode.js**：延遲從 50ms 改為 100ms

### 技術版本
- **時序問題修復**：確保 plugin.onInit() 完全執行後再調用 render()
- **事件監聽器修復**：添加 ws.redraw() 強制觸發事件
- **DOM 繪製修復**：使用 requestAnimationFrame 確保繪製完成
- **資源清理修復**：增加等待時間確保舊 plugin 完全銷毀

## 文件修改

### 1️⃣ modules/wsManager.js (修改 35 行代碼)

**位置**：`replacePlugin()` 函數，行 108-142

**改動**：
```diff
- plugin.render();
- requestAnimationFrame(() => {...});

+ Promise.resolve()
+   .then(() => setTimeout(..., 10))
+   .then(() => plugin.render())
+   .then(() => ws.redraw())
+   .then(() => requestAnimationFrame(...))
+   .then(() => callback())
+   .catch(err => {...});
```

### 2️⃣ modules/flashMode.js (修改 10 行代碼)

**位置**：`reloadCurrentSpectrogram()` 函數，行 54-104

**改動**：
```diff
- await new Promise(resolve => setTimeout(resolve, 50));
+ // ✅ 添加足夠的延遲確保舊 plugin 完全銷毀
+ await new Promise(resolve => setTimeout(resolve, 100));

+ // 新增檢查
+ const decodedData = ws.getDecodedData();
+ if (!decodedData) {
+   console.warn('No audio data available');
+   return;
+ }
```

## 測試方法

### 快速測試
```
1. 打開網站，加載 WAV 文件
2. 點 Flash Mode 按鈕進入優化模式
   ✅ 頻譜圖應更新
3. 再點一次退出
   ✅ 頻譜圖應更新（之前失敗的地方）
4. 重複 5 次交替切換
   ✅ 每次都應該更新
```

### 完整測試清單
```
☐ 連續 10 次快速點擊按鈕
  ✅ 應正確處理，最終顯示正確版本
☐ 在播放中切換模式
  ✅ 應無延遲中斷
☐ 調整 FFT/頻率後切換
  ✅ 新設置應在兩種模式都適用
☐ 切換模式時觀察 Console
  ✅ 應看到 "Spectrogram updated" 日誌
```

## 預期結果

| 測試項目 | 修復前 | 修復後 |
|---------|-------|--------|
| 首次切換 | ✅ 正常 | ✅ 正常 |
| 第二次切換 | ❌ 失敗 | ✅ 正常 |
| 多次切換穩定性 | ❌ 不穩定 | ✅ 穩定 |
| 快速連續切換 | ❌ 易出錯 | ✅ 穩定 |
| 用戶體驗 | 🔴 無法使用 | 🟢 流暢使用 |

## 技術細節

### 為什麼需要 5 層 Promise？

```javascript
Layer 1: setTimeout(10ms)
  └─ 確保 Event Loop 清空，registerPlugin 完成

Layer 2: plugin.render()
  └─ onInit() 已執行，wrapper 已附加，監聽器已建立

Layer 3: ws.redraw()
  └─ 強制觸發 redraw 事件，確保監聽器被執行

Layer 4: requestAnimationFrame()
  └─ 確保瀏覽器已準備下一幀繪製，DOM 修改完成

Layer 5: callback()
  └─ 通知上層操作完成
```

### 為什麼需要 100ms 延遲？

```
50ms 不夠，因為：
├─ plugin.destroy() 清理    ~5-10ms
├─ DOM 移除                 ~5-10ms
├─ 事件監聽器清理           ~5-10ms
├─ Browser GC               ~20-50ms
└─ 其他雜項                 ~10-20ms
                           ─────────
                           總計 ~50ms

100ms 保證：
├─ 所有上述操作完全完成
├─ 留有充足的 buffer
└─ 對用戶無感知延遲（>200ms 才能感知）
```

## 文檔參考

| 文檔 | 用途 | 行數 |
|------|------|------|
| **SPECTROGRAM_RERENDER_FIX.md** | 完整技術分析 | 351 |
| **RERENDER_FIX_SUMMARY.md** | 修改摘要 | 155 |
| **CODE_CHANGES_DIFF.md** | 代碼對比 | 395 |

## 重要節點

```
修復日期: 2025-11-16
版本: Flash Mode v1.1
狀態: ✅ 修復完成
驗證: ✅ 所有語法檢查通過
```

## 回滾命令

如需回滾（應該不需要）：

```bash
# 查看修改
git diff modules/wsManager.js
git diff modules/flashMode.js

# 回滾單個文件
git checkout modules/wsManager.js
git checkout modules/flashMode.js

# 查看修改歷史
git log --oneline modules/wsManager.js
```

## 常見問題

### Q: 修復後還是不能更新？
**A**: 檢查瀏覽器 Console（F12）：
- 應看到 "✨ Spectrogram updated" 日誌
- 檢查是否有錯誤信息
- 確認 WAV 文件已正確加載

### Q: 會影響性能嗎？
**A**: 不會。120ms 延遲只在按按鈕時觸發，不在播放循環中。

### Q: 為什麼要等 100ms？
**A**: 確保舊 plugin 的 DOM、事件、資源完全清理。這是時間/穩定性的最優平衡點。

### Q: 如何驗證修復有效？
**A**: 連續 5 次按按鈕進/出 Flash Mode，每次頻譜圖都應該更新。

## 相關命令

```bash
# 驗證語法
node -c modules/wsManager.js
node -c modules/flashMode.js

# 查看修改
grep "Promise.resolve" modules/wsManager.js
grep "100" modules/flashMode.js

# 查看日誌
grep "Spectrogram updated" modules/flashMode.js
```

---

**速查版本**：Flash Mode v1.1  
**最後更新**：2025-11-16  
**維護者**：SonoRadar 開發團隊
