// modules/axisRenderer.js

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

  // step selection unchanged (ticks positions unchanged). We alter only how
  // numeric labels are displayed when timeExpansion is active (numbers shrink by 10x).
  let step = 1000;
  if (pxPerSec >= 800) step = 100;
  else if (pxPerSec >= 500) step = 200;
  else if (pxPerSec >= 300) step = 500;

  const html = [];
  for (let t = 0; t < duration * 1000; t += step) {
    const left = (t / 1000) * pxPerSec;

    // 主刻度線
    html.push(`
      <div class="time-major-tick" style="left:${left}px"></div>
    `);

    // 副刻度線 (在主刻度與下一個主刻度之間的中間位置)
    const midLeft = left + (step / 1000 / 2) * pxPerSec;
    if (midLeft <= totalWidth) {
      html.push(`
        <div class="time-minor-tick" style="left:${midLeft}px"></div>
      `);
    }

    // 置中數字 — 顯示值在 timeExpansion 時縮小 10 倍（數字顯示變為原來的 0.1x）
    const baseLabel = step >= 1000 ? (t / 1000) : t;
    const displayLabel = timeExpansion ? (baseLabel / 10) : baseLabel;
    const labelStr = (step >= 1000 && !timeExpansion) ? `${baseLabel}` : `${displayLabel}`;
    const isZero = Number(displayLabel) === 0;
    const extraClass = isZero ? ' zero-label' : '';
    html.push(`
      <span class="time-axis-label${extraClass}" style="left:${left}px">${labelStr}</span>
    `);
  }

  axisElement.innerHTML = html.join('');
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

  // Decide internal step sizes. When timeExpansion is active the displayed
  // frequency values are multiplied by 10, but we want the displayed major
  // ticks to be every 10 kHz and minor ticks every 5 kHz. Since display =
  // internal * 10, internal steps should be 1 kHz (major) and 0.5 kHz (minor).
  const range = maxFrequency;
  const majorStep = timeExpansion ? 1 : 10;
  const minorStep = timeExpansion ? 0.5 : 5;

  for (let f = 0; f <= range; f += majorStep) {
    const y = (1 - f / range) * spectrogramHeight;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  labelContainer.innerHTML = '';

  for (let f = 0; f <= range; f += majorStep) {
    const y = Math.round((1 - f / range) * spectrogramHeight);

    // 主刻度線
    const tick = document.createElement('div');
    tick.className = 'freq-major-tick';
    tick.style.top = `${y}px`;
    labelContainer.appendChild(tick);

    // 文字
    const label = document.createElement('div');
    label.className = 'freq-label-static freq-axis-label';
    label.style.top = `${y - 1}px`;
    const freqValue = f + offsetKHz;
    const displayValue = timeExpansion ? (freqValue * 10) : freqValue;
    label.textContent = Number(displayValue.toFixed(1)).toString();
    labelContainer.appendChild(label);
  }

  // 新增次刻度 (minor tick)
  for (let f = 0; f <= range; f += minorStep) {
    // skip positions that are effectively on major tick multiples (tolerance for floats)
    if (Math.abs((f / majorStep) - Math.round(f / majorStep)) < 1e-6) continue;

    const y = Math.round((1 - f / range) * spectrogramHeight);

    const minorTick = document.createElement('div');
    minorTick.className = 'freq-minor-tick';
    minorTick.style.top = `${y}px`;
    labelContainer.appendChild(minorTick);
  }
}
