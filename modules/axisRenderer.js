// modules/axisRenderer.js

// 優化：使用 DocumentFragment 和批量 DOM 操作
export function drawTimeAxis({
  containerWidth,
  duration,
  zoomLevel,
  axisElement,
  labelElement,
  timeExpansion = false,
}) {
  const pxPerSec = zoomLevel;
  const totalWidth = duration * pxPerSec;

  let step = 1000;
  if (pxPerSec >= 800) step = 100;
  else if (pxPerSec >= 500) step = 200;
  else if (pxPerSec >= 300) step = 500;

  // 優化：使用 StringBuilder 模式
  const htmlParts = [];
  const baseLabelStr = step >= 1000 ? 's' : 'ms';
  
  for (let t = 0; t < duration * 1000; t += step) {
    const left = (t / 1000) * pxPerSec;

    htmlParts.push(`<div class="time-major-tick" style="left:${left}px"></div>`);

    const midLeft = left + (step / 1000 / 2) * pxPerSec;
    if (midLeft <= totalWidth) {
      htmlParts.push(`<div class="time-minor-tick" style="left:${midLeft}px"></div>`);
    }

    const baseLabel = step >= 1000 ? (t / 1000) : t;
    const displayLabel = timeExpansion ? (baseLabel / 10) : baseLabel;
    const extraClass = Number(displayLabel) === 0 ? ' zero-label' : '';
    htmlParts.push(`<span class="time-axis-label${extraClass}" style="left:${left}px">${displayLabel}</span>`);
  }

  // 一次性設置 innerHTML
  axisElement.innerHTML = htmlParts.join('');
  axisElement.style.width = `${totalWidth}px`;
  labelElement.textContent = step >= 1000 ? 'Time (s)' : 'Time (ms)';
}

export function drawFrequencyGrid({
  gridCanvas,
  labelContainer,
  containerElement,
  spectrogramHeight = 800,
  maxFrequency = 128,
  offsetKHz = 0,
  timeExpansion = false,
}) {
  const width = containerElement.scrollWidth;
  gridCanvas.width = width;
  gridCanvas.height = spectrogramHeight;
  gridCanvas.style.width = width + 'px';
  gridCanvas.style.height = spectrogramHeight + 'px';

  const ctx = gridCanvas.getContext('2d');
  ctx.clearRect(0, 0, width, spectrogramHeight);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.lineWidth = 0.4;

  const range = maxFrequency;
  const majorStep = timeExpansion ? 1 : 10;
  const minorStep = timeExpansion ? 0.5 : 5;

  // 優化：繪製所有主刻度線
  for (let f = 0; f <= range; f += majorStep) {
    const y = (1 - f / range) * spectrogramHeight;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // 優化：使用 DocumentFragment 批量操作 DOM
  const fragment = document.createDocumentFragment();

  for (let f = 0; f <= range; f += majorStep) {
    const y = Math.round((1 - f / range) * spectrogramHeight);

    // 主刻度線
    const tick = document.createElement('div');
    tick.className = 'freq-major-tick';
    tick.style.top = `${y}px`;
    fragment.appendChild(tick);

    // 文字標籤
    const label = document.createElement('div');
    label.className = 'freq-label-static freq-axis-label';
    label.style.top = `${y - 1}px`;
    const freqValue = f + offsetKHz;
    const displayValue = timeExpansion ? (freqValue * 10) : freqValue;
    label.textContent = Number(displayValue.toFixed(1)).toString();
    fragment.appendChild(label);
  }

  // 優化：次刻度線也使用 fragment
  for (let f = 0; f <= range; f += minorStep) {
    if (Math.abs((f / majorStep) - Math.round(f / majorStep)) < 1e-6) continue;

    const y = Math.round((1 - f / range) * spectrogramHeight);

    const minorTick = document.createElement('div');
    minorTick.className = 'freq-minor-tick';
    minorTick.style.top = `${y}px`;
    fragment.appendChild(minorTick);
  }

  // 一次性添加到 DOM
  labelContainer.innerHTML = '';
  labelContainer.appendChild(fragment);
}
