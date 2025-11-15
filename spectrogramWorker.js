let canvas, ctx, sampleRate = 44100;
// 優化：預先分配重複使用的陣列和計算參數
let cachedWindow = null;
let cachedFftSize = 0;
const magBuffer = new Float32Array(2048); // 最大 FFT size 的一半

self.onmessage = (e) => {
  const { type } = e.data;
  if (type === 'init') {
    canvas = e.data.canvas;
    sampleRate = e.data.sampleRate || sampleRate;
    ctx = canvas.getContext('2d');
  } else if (type === 'render') {
    if (!ctx) return;
    renderSpectrogram(e.data.buffer, e.data.sampleRate || sampleRate, e.data.fftSize || 1024, e.data.overlap || 0);
  }
};

function renderSpectrogram(signal, sr, fftSize, overlapPct) {
  const hop = Math.max(1, Math.floor(fftSize * (1 - overlapPct / 100)));
  const width = Math.max(1, Math.ceil((signal.length - fftSize) / hop));
  const height = fftSize / 2;
  canvas.width = width;
  canvas.height = height;
  const img = ctx.createImageData(width, height);
  const imgData = img.data;
  
  // 優化：重用 window 函數
  const window = (cachedFftSize === fftSize && cachedWindow) 
    ? cachedWindow 
    : (cachedWindow = hannWindow(cachedFftSize = fftSize));
  
  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);
  
  // 優化：快取常數計算
  const invLog10 = 1 / Math.log(10);
  const logScale = 5;
  
  for (let x = 0, i = 0; i + fftSize <= signal.length; i += hop, x++) {
    // 優化：使用 for 循環避免 slice 開銷
    for (let j = 0; j < fftSize; j++) {
      real[j] = signal[i + j] * window[j];
      imag[j] = 0;
    }
    fft(real, imag);
    
    // 優化：批量計算幅度和顏色
    for (let y = 0; y < height; y++) {
      const re = real[y];
      const im = imag[y];
      const magSq = re * re + im * im;
      let val = 0.5 * Math.log(magSq + 1e-24) * invLog10; // 使用 log(mag²)/2 = log(mag)
      val = Math.max(0, Math.min(1, val / logScale));
      const col = Math.floor(val * 255);
      const idx = (height - 1 - y) * width + x;
      imgData[idx * 4] = col;
      imgData[idx * 4 + 1] = col;
      imgData[idx * 4 + 2] = col;
      imgData[idx * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  self.postMessage({ type: 'rendered' });
}

function hannWindow(N) {
  const win = new Float32Array(N);
  const factor = 2 * Math.PI / (N - 1);
  for (let i = 0; i < N; i++) {
    win[i] = 0.5 * (1 - Math.cos(factor * i));
  }
  return win;
}

// 優化的 FFT：預計算 twiddle 因子
function fft(real, imag) {
  const n = real.length;
  bitReverse(real, imag, n);
  
  const half_pi = Math.PI;
  let blockSize = 2;
  
  while (blockSize <= n) {
    const halfBlock = blockSize / 2;
    const stepAngle = -2 * half_pi / blockSize;
    
    for (let start = 0; start < n; start += blockSize) {
      let angle = 0;
      for (let j = 0; j < halfBlock; j++) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        
        for (let k = start + j; k < start + n; k += blockSize) {
          const idx = k + halfBlock;
          if (idx >= n) break;
          
          const tr = c * real[idx] - s * imag[idx];
          const ti = s * real[idx] + c * imag[idx];
          
          real[idx] = real[k] - tr;
          imag[idx] = imag[k] - ti;
          real[k] += tr;
          imag[k] += ti;
        }
        angle += stepAngle;
      }
    }
    blockSize *= 2;
  }
}

// 位反轉操作，優化版本
function bitReverse(real, imag, n) {
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      const rt = real[i];
      const it = imag[i];
      real[i] = real[j];
      imag[i] = imag[j];
      real[j] = rt;
      imag[j] = it;
    }
    let k = n >> 1;
    while (j >= k) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }
}