// modules/wsManager.js

import WaveSurfer from './wavesurfer.esm.js';
import SpectrogramDefault from './spectrogram.esm.js';
import SpectrogramOptimized from './spectrogram-optimized.esm.js';

let ws = null;
let plugin = null;
let currentColorMap = null;
let currentFftSize = 1024;
let currentWindowType = 'hann';
let currentSpectrogram = SpectrogramOptimized; // 默認使用優化版本

export function initWavesurfer({
  container,
  url,
  sampleRate = 256000,
}) {
  ws = WaveSurfer.create({
    container,
    height: 0,
    interact: false,
    cursorWidth: 0,
    url,
    sampleRate,
  });

  return ws;
}

export function setSpectrogramModule(useOptimized = false) {
  currentSpectrogram = useOptimized ? SpectrogramOptimized : SpectrogramDefault;
}

export function createSpectrogramPlugin({
  colorMap,
  height = 800,
  frequencyMin = 10,
  frequencyMax = 128,
  fftSamples = 1024,
  noverlap = null,
  windowFunc = 'hann',
}) {
  const baseOptions = {
    labels: false,
    height,
    fftSamples,
    frequencyMin: frequencyMin * 1000,
    frequencyMax: frequencyMax * 1000,
    scale: 'linear',
    windowFunc,
    colorMap,
  };

  if (noverlap !== null) {
    baseOptions.noverlap = noverlap;
  }

  return currentSpectrogram.create(baseOptions);
}

export function replacePlugin(
  colorMap,
  height = 800,
  frequencyMin = 10,
  frequencyMax = 128,
  overlapPercent = null,
  onRendered = null,  // ✅ 傳入 callback
  fftSamples = currentFftSize,
  windowFunc = currentWindowType
) {
  if (!ws) throw new Error('Wavesurfer not initialized.');
  const container = document.getElementById("spectrogram-only");

  // ✅ 改進：完全清理舊 plugin 和 canvas
  const oldCanvas = container.querySelector("canvas");
  if (oldCanvas) {
    oldCanvas.remove();
  }

  if (plugin?.destroy) {
    plugin.destroy();
    plugin = null;  // ✅ 確保 plugin 引用被清空
  }

  // ✅ 強制重新設置 container 寬度為預設值（避免殘留的大尺寸）
  container.style.width = '100%';

  currentColorMap = colorMap;

  currentFftSize = fftSamples;
  currentWindowType = windowFunc;
  const noverlap = overlapPercent !== null
    ? Math.floor(fftSamples * (overlapPercent / 100))
    : null;

  plugin = createSpectrogramPlugin({
    colorMap,
    height,
    frequencyMin,
    frequencyMax,
    fftSamples,
    noverlap,
    windowFunc,
  });

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
}

export function getWavesurfer() {
  return ws;
}

export function getPlugin() {
  return plugin;
}

export function getCurrentColorMap() {
  return currentColorMap;
}

export function getCurrentFftSize() {
  return currentFftSize;
}

export function getCurrentWindowType() {
  return currentWindowType;
}

export function initScrollSync({
  scrollSourceId,
  scrollTargetId,
}) {
  const source = document.getElementById(scrollSourceId);
  const target = document.getElementById(scrollTargetId);

  if (!source || !target) {
    console.warn(`[scrollSync] One or both elements not found.`);
    return;
  }

  source.addEventListener('scroll', () => {
    target.scrollLeft = source.scrollLeft;
  });
}
