/**
 * Professional-grade Bat Call Detection and Parameter Measurement Module
 * Aligned with Avisoft, SonoBat, Kaleidoscope, and BatSound standards
 * 
 * Reference: 
 * - Avisoft-SASLab Pro: https://www.avisoft.com/
 * - SonoBat: https://www.sonobat.com/
 * - Kaleidoscope Pro: https://www.wildlifeacoustics.com/
 * - BatSound: https://www.batvoice.org/
 */

import { getApplyWindowFunction, getGoertzelEnergyFunction } from './powerSpectrum.js';

/**
 * Bat Call Detection Configuration (Professional Standards)
 * 
 * 2025 Anti-Rebounce Upgrade:
 * - Backward scanning for -24dB contour cutoff
 * - Maximum frequency drop detection (10 kHz threshold)
 * - 10 ms protection window after peak energy
 */
export const DEFAULT_DETECTION_CONFIG = {
  // Energy threshold (dB below maximum within frequency range)
  // Typical: -18 dB (Avisoft), -24 dB (SonoBat, more conservative)
  callThreshold_dB: -24,
  
  // Start/End frequency threshold (dB below peak for finding edges)
  // Changed from -18 to -24 for more conservative edge detection
  startEndThreshold_dB: -24,
  
  // Characteristic frequency is defined as lowest or average frequency 
  // in the last 10-20% of the call duration
  characteristicFreq_percentEnd: 20,  // Last 20% duration
  
  // Minimum call duration to be considered valid (ms)
  minCallDuration_ms: 1,
  
  // Maximum gap to bridge between segments (ms) - for noise robustness
  maxGapBridge_ms: 0,
  
  // Frequency resolution for fine measurements (Hz)
  freqResolution_Hz: 1,
  
  // Window function for STFT
  windowType: 'hann',
  
  // FFT size for high resolution
  fftSize: 1024,
  
  // Time resolution (STFT hop size as percentage of FFT size)
  hopPercent: 25,  // 75% overlap = 25% hop
  
  // Advanced: Call type detection
  // 'auto': automatic detection (CF if bandwidth < 5kHz, FM otherwise)
  // 'cf': constant frequency (for Molossid, Rhinolophid, Hipposiderid)
  // 'fm': frequency modulated (for Phyllostomid, Vespertilionid)
  callType: 'auto',
  
  // For CF-FM calls: minimum power requirement in characteristic freq region (dB)
  cfRegionThreshold_dB: -30,
  
  // ============================================================
  // 2025 ANTI-REBOUNCE (Anti-Echo/Reflection) PARAMETERS
  // ============================================================
  // These parameters protect against reverberations in tunnels, forests, buildings
  
  // Trick 1: Backward scanning for end frequency detection
  // When enabled, scan from end towards start to find -24dB cutoff (prevents rebounce tail)
  enableBackwardEndFreqScan: true,
  
  // Trick 2: Maximum Frequency Drop Rule (kHz)
  // Once frequency drops by this amount below peak, lock and don't accept further increases
  // Typical: 10 kHz (standard in Avisoft, SonoBat, Kaleidoscope)
  maxFrequencyDropThreshold_kHz: 10,
  
  // Trick 3: Protection window after peak energy (ms)
  // Only accept call content within this duration after peak energy frame
  // Typical: 10 ms (at 384kHz ≈ 75-80 frames, at 256kHz ≈ 50-54 frames)
  protectionWindowAfterPeak_ms: 10,
};

/**
 * Call type classification helper
 */
export class CallTypeClassifier {
  static classify(call) {
    if (!call.bandwidth_kHz || call.bandwidth_kHz < 5) {
      return 'CF';  // Constant Frequency
    }
    if (call.bandwidth_kHz > 20) {
      return 'FM';  // Frequency Modulated
    }
    return 'CF-FM';  // Mixed
  }
  
  /**
   * Check if call matches CF bat characteristics
   * CF bats: typically 10-100 kHz, low bandwidth (< 5 kHz)
   */
  static isCFBat(call) {
    return call.bandwidth_kHz < 5 && call.peakFreq_kHz > 10;
  }
  
  /**
   * Check if call matches FM bat characteristics
   * FM bats: typically 20-150 kHz, high bandwidth (> 10 kHz)
   */
  static isFMBat(call) {
    return call.bandwidth_kHz > 10 && call.startFreq_kHz > call.endFreq_kHz;  // Downward FM
  }
}

/**
 * Represents a single detected bat call with all parameters
 */
export class BatCall {
  constructor() {
    this.startTime_s = null;        // Call start time (seconds)
    this.endTime_s = null;          // Call end time (seconds)
    this.duration_ms = null;        // Total duration (milliseconds)
    
    this.peakFreq_kHz = null;       // Peak frequency (kHz) - absolute max power
    this.startFreq_kHz = null;      // Start frequency (kHz) - from first frame above -24dB threshold
    this.endFreq_kHz = null;        // End frequency (kHz) - from last frame above -24dB threshold
    this.characteristicFreq_kHz = null;  // Characteristic freq (lowest in last 20%)
    this.kneeFreq_kHz = null;       // Knee frequency (kHz) - CF-FM transition point
    this.kneeTime_ms = null;        // Knee time (ms) - time at CF-FM transition
    this.bandwidth_kHz = null;      // Bandwidth = startFreq - endFreq
    
    this.Flow = null;               // Low frequency boundary (Hz) - from detection range
    this.Fhigh = null;              // High frequency boundary (kHz) - from detection range
    
    this.peakPower_dB = null;       // Peak power in dB
    this.startPower_dB = null;      // Power at start frequency
    this.endPower_dB = null;        // Power at end frequency
    
    this.callType = 'FM';           // 'CF', 'FM', or 'CF-FM' (Constant/Frequency Modulated)
    
    // Internal: time-frequency spectrogram (for visualization/analysis)
    this.spectrogram = null;        // 2D array: [timeFrames][frequencyBins]
    this.timeFrames = null;         // Time points for each frame
    this.freqBins = null;           // Frequency bins in Hz
  }
  
  /**
   * Calculate duration in milliseconds from time boundaries
   */
  calculateDuration() {
    if (this.startTime_s !== null && this.endTime_s !== null) {
      this.duration_ms = (this.endTime_s - this.startTime_s) * 1000;
    }
  }
  
  /**
   * Calculate bandwidth as difference between start and end frequencies
   */
  calculateBandwidth() {
    if (this.startFreq_kHz !== null && this.endFreq_kHz !== null) {
      this.bandwidth_kHz = this.startFreq_kHz - this.endFreq_kHz;
    }
  }
  
  /**
   * Validate call parameters according to professional standards
   * Returns: { valid: boolean, reason: string }
   */
  validate() {
    if (this.duration_ms === null) this.calculateDuration();
    
    const checks = {
      hasDuration: this.duration_ms > 0,
      hasFreqs: this.peakFreq_kHz !== null && this.startFreq_kHz !== null && this.endFreq_kHz !== null,
      reasonableDuration: this.duration_ms >= DEFAULT_DETECTION_CONFIG.minCallDuration_ms,
      frequencyOrder: this.endFreq_kHz <= this.peakFreq_kHz && this.peakFreq_kHz <= this.startFreq_kHz,
    };
    
    const allValid = Object.values(checks).every(v => v);
    let reason = '';
    if (!checks.hasDuration) reason = 'Missing duration';
    else if (!checks.hasFreqs) reason = 'Missing frequency parameters';
    else if (!checks.reasonableDuration) reason = `Duration ${this.duration_ms}ms < min ${DEFAULT_DETECTION_CONFIG.minCallDuration_ms}ms`;
    else if (!checks.frequencyOrder) reason = 'Invalid frequency order';
    
    return { valid: allValid, reason };
  }
  
  /**
   * Convert to professional analysis format (similar to Avisoft export)
   */
  toAnalysisRecord() {
    return {
      'Start Time [s]': this.startTime_s?.toFixed(4) || '-',
      'End Time [s]': this.endTime_s?.toFixed(4) || '-',
      'Duration [ms]': this.duration_ms?.toFixed(2) || '-',
      'Peak Freq [kHz]': this.peakFreq_kHz?.toFixed(2) || '-',
      'Start Freq [kHz]': this.startFreq_kHz?.toFixed(2) || '-',
      'End Freq [kHz]': this.endFreq_kHz?.toFixed(2) || '-',
      'Knee Freq [kHz]': this.kneeFreq_kHz?.toFixed(2) || '-',
      'Characteristic Freq [kHz]': this.characteristicFreq_kHz?.toFixed(2) || '-',
      'Bandwidth [kHz]': this.bandwidth_kHz?.toFixed(2) || '-',
      'Peak Power [dB]': this.peakPower_dB?.toFixed(1) || '-',
      'Knee Time [ms]': this.kneeTime_ms?.toFixed(2) || '-',
    };
  }
}

/**
 * Main Bat Call Detector Class
 */
export class BatCallDetector {
  constructor(config = {}) {
    this.config = { ...DEFAULT_DETECTION_CONFIG, ...config };
    this.applyWindow = getApplyWindowFunction();
    this.goertzelEnergy = getGoertzelEnergyFunction();
  }
  
  /**
   * Detect all bat calls in audio selection
   * Returns: array of BatCall objects
   */
  async detectCalls(audioData, sampleRate, flowKHz, fhighKHz) {
    if (!audioData || audioData.length === 0) return [];
    
    // Generate high-resolution STFT spectrogram
    const spectrogram = this.generateSpectrogram(audioData, sampleRate, flowKHz, fhighKHz);
    if (!spectrogram) return [];
    
    const { powerMatrix, timeFrames, freqBins, freqResolution } = spectrogram;
    
    // Phase 1: Detect call boundaries using energy threshold
    const callSegments = this.detectCallSegments(powerMatrix, timeFrames, freqBins, flowKHz, fhighKHz);
    
    if (callSegments.length === 0) return [];
    
    // Phase 2: Measure precise parameters for each detected call
    const calls = callSegments.map(segment => {
      const call = new BatCall();
      call.startTime_s = timeFrames[segment.startFrame];
      call.endTime_s = timeFrames[Math.min(segment.endFrame + 1, timeFrames.length - 1)];
      call.spectrogram = powerMatrix.slice(segment.startFrame, segment.endFrame + 1);
      call.timeFrames = timeFrames.slice(segment.startFrame, segment.endFrame + 2);
      call.freqBins = freqBins;
      
      call.calculateDuration();
      
      // 驗證: 過濾不符合最小時長要求的 call
      if (call.duration_ms < this.config.minCallDuration_ms) {
        return null;  // 標記為無效，之後過濾掉
      }
      
      // Measure frequency parameters from spectrogram
      // This will calculate startFreq, endFreq, peakFreq, etc.
      this.measureFrequencyParameters(call, flowKHz, fhighKHz, freqBins, freqResolution);
      
      // COMMERCIAL STANDARD: Set Flow and Fhigh based on actual call frequency range
      // Frequency terminology (must be distinguished):
      // ============================================================
      // START.FREQ (startFreq_kHz): 
      //   = Frequency value at the 1st frame of call signal
      //   = Highest frequency in the entire call (for downward FM)
      //   = Derived from first frame above -24dB threshold
      // 
      // END.FREQ (endFreq_kHz):
      //   = Frequency value at the last frame of call signal
      //   = Lowest frequency in the entire call (for downward FM)
      //   = Derived from last frame above -24dB threshold
      // 
      // HIGH.FREQ (Fhigh):
      //   = Highest frequency present during entire call
      //   = Maximum frequency value across all call frames
      //   = For downward FM: same as startFreq_kHz
      //   = Unit: kHz
      // 
      // LOW.FREQ (Flow):
      //   = Lowest frequency present during entire call
      //   = Minimum frequency value across all call frames
      //   = For downward FM: same as endFreq_kHz
      //   = Unit: Hz
      // ============================================================
      // Avisoft, SonoBat, Kaleidoscope, BatSound all use this approach
      call.Flow = call.endFreq_kHz * 1000;   // Lowest freq in call (Hz)
      call.Fhigh = call.startFreq_kHz;       // Highest freq in call (kHz)
      
      // Classify call type (CF, FM, or CF-FM)
      call.callType = CallTypeClassifier.classify(call);
      
      return call;
    }).filter(call => call !== null);  // 移除不符合條件的 call
    
    return calls;
  }
  
  /**
   * Generate high-resolution STFT spectrogram
   * Returns: { powerMatrix, timeFrames, freqBins, freqResolution }
   */
  generateSpectrogram(audioData, sampleRate, flowKHz, fhighKHz) {
    const { fftSize, hopPercent, windowType } = this.config;
    const hopSize = Math.floor(fftSize * (hopPercent / 100));
    
    if (hopSize < 1 || fftSize > audioData.length) {
      console.warn('FFT size too large for audio data');
      return null;
    }
    
    const freqResolution = sampleRate / fftSize;
    const minBin = Math.max(0, Math.floor(flowKHz * 1000 / freqResolution));
    const maxBin = Math.min(
      Math.floor(fftSize / 2),
      Math.floor(fhighKHz * 1000 / freqResolution)
    );
    
    const numFrames = Math.floor((audioData.length - fftSize) / hopSize) + 1;
    const numBins = maxBin - minBin + 1;
    
    const powerMatrix = new Array(numFrames);
    const timeFrames = new Array(numFrames);
    const freqBins = new Float32Array(numBins);
    
    // Prepare frequency bins array (in Hz)
    for (let i = 0; i < numBins; i++) {
      freqBins[i] = (minBin + i) * freqResolution;
    }
    
    // Apply Goertzel to each frame
    for (let frameIdx = 0; frameIdx < numFrames; frameIdx++) {
      const frameStart = frameIdx * hopSize;
      const frameEnd = frameStart + fftSize;
      const frameData = audioData.slice(frameStart, frameEnd);
      
      // Apply window
      const windowed = this.applyWindow(frameData, windowType);
      
      // Remove DC offset
      let dcOffset = 0;
      for (let i = 0; i < windowed.length; i++) dcOffset += windowed[i];
      dcOffset /= windowed.length;
      
      const dcRemoved = new Float32Array(windowed.length);
      for (let i = 0; i < windowed.length; i++) {
        dcRemoved[i] = windowed[i] - dcOffset;
      }
      
      // Calculate power for each frequency bin
      const framePower = new Float32Array(numBins);
      for (let i = 0; i < numBins; i++) {
        const freqHz = freqBins[i];
        const energy = this.goertzelEnergy(dcRemoved, freqHz, sampleRate);
        const rms = Math.sqrt(energy);
        const psd = (rms * rms) / fftSize;
        framePower[i] = 10 * Math.log10(Math.max(psd, 1e-16));
      }
      
      powerMatrix[frameIdx] = framePower;
      timeFrames[frameIdx] = (frameStart + fftSize / 2) / sampleRate;  // Center of frame
    }
    
    return { powerMatrix, timeFrames, freqBins, freqResolution };
  }
  
  /**
   * Phase 1: Detect call segments using energy threshold
   * Returns: array of { startFrame, endFrame }
   */
  detectCallSegments(powerMatrix, timeFrames, freqBins, flowKHz, fhighKHz) {
    const { callThreshold_dB } = this.config;
    
    // Find global maximum power across entire spectrogram for threshold reference
    let globalMaxPower = -Infinity;
    for (let frameIdx = 0; frameIdx < powerMatrix.length; frameIdx++) {
      const framePower = powerMatrix[frameIdx];
      for (let binIdx = 0; binIdx < framePower.length; binIdx++) {
        globalMaxPower = Math.max(globalMaxPower, framePower[binIdx]);
      }
    }
    
    // Threshold = global max + relative dB (typically -24 dB)
    const threshold_dB = globalMaxPower + callThreshold_dB;
    
    // Detect active frames (frames with any bin above threshold)
    const activeFrames = new Array(powerMatrix.length);
    for (let frameIdx = 0; frameIdx < powerMatrix.length; frameIdx++) {
      const framePower = powerMatrix[frameIdx];
      let isActive = false;
      for (let binIdx = 0; binIdx < framePower.length; binIdx++) {
        if (framePower[binIdx] > threshold_dB) {
          isActive = true;
          break;
        }
      }
      activeFrames[frameIdx] = isActive;
    }
    
    // Segment continuous active frames into call segments
    const segments = [];
    let segmentStart = null;
    
    for (let frameIdx = 0; frameIdx < activeFrames.length; frameIdx++) {
      if (activeFrames[frameIdx]) {
        if (segmentStart === null) {
          segmentStart = frameIdx;
        }
      } else {
        if (segmentStart !== null) {
          segments.push({
            startFrame: segmentStart,
            endFrame: frameIdx - 1
          });
          segmentStart = null;
        }
      }
    }
    
    // Catch final segment if call extends to end
    if (segmentStart !== null) {
      segments.push({
        startFrame: segmentStart,
        endFrame: activeFrames.length - 1
      });
    }
    
    return segments;
  }
  
  /**
   * Savitzky-Golay Smoothing Filter
   * 
   * Used for smoothing frequency contours before 2nd derivative calculation
   * Parameters: window size = 5, polynomial order = 2
   * This is the standard used by Avisoft for stable knee detection
   * 
   * Algorithm: Fits a polynomial to each data point's neighborhood
   * Advantages: Preserves peaks/edges better than moving average
   */
  savitzkyGolay(data, windowSize = 5, polyOrder = 2) {
    if (data.length < windowSize) return data; // Cannot smooth
    
    const halfWindow = Math.floor(windowSize / 2);
    const smoothed = new Array(data.length);
    
    // Pre-calculate SG coefficients for window=5, polynomial=2
    // These are standard coefficients from numerical analysis literature
    const sgCoeffs = [-3, 12, 17, 12, -3]; // Normalized for window=5, polyorder=2
    const sgSum = 35; // Sum of coefficients for normalization
    
    // Apply filter
    for (let i = 0; i < data.length; i++) {
      let sum = 0;
      let count = 0;
      
      // Apply within available window
      for (let j = -halfWindow; j <= halfWindow; j++) {
        const idx = i + j;
        if (idx >= 0 && idx < data.length) {
          const coeffIdx = j + halfWindow;
          sum += data[idx] * sgCoeffs[coeffIdx];
          count += sgCoeffs[coeffIdx];
        }
      }
      
      smoothed[i] = sum / sgSum;
    }
    
    return smoothed;
  }

  /**
   * Find optimal Start/End Threshold by testing range and detecting anomalies
   * 
   * Algorithm:
   * 1. Test threshold values from -24 dB down to -50 dB (step: 1 dB)
   * 2. For each threshold, measure Start Frequency
   * 3. Track frequency differences between consecutive thresholds
   * 4. Find the threshold BEFORE the first major frequency jump (anomaly)
   * 5. Return that threshold as the optimal value
   * 
   * Rationale:
   * - Normal noise floor gradually extends range → smooth frequency changes (1-3 kHz)
   * - Rebounce/overestimation causes sudden jumps → large frequency diff (>5 kHz)
   * - Optimal threshold is just before the jump occurs (avoiding overestimation)
   * 
   * @param {Array} spectrogram - 2D array [timeFrame][freqBin]
   * @param {Array} freqBins - Frequency bin centers (Hz)
   * @param {number} flowKHz - Lower frequency bound (kHz)
   * @param {number} fhighKHz - Upper frequency bound (kHz)
   * @returns {number} Optimal threshold (dB) in range [-50, -24]
   */
  findOptimalStartEndThreshold(spectrogram, freqBins, flowKHz, fhighKHz) {
    if (spectrogram.length === 0) return -24;

    const firstFramePower = spectrogram[0];
    const flowHz = flowKHz * 1000;
    const fhighHz = fhighKHz * 1000;
    
    // 測試閾值範圍：-24 到 -50 dB
    const thresholdRange = [];
    for (let threshold = -24; threshold >= -50; threshold--) {
      thresholdRange.push(threshold);
    }
    
    // 為每個閾值測量 Start Frequency
    const measurements = [];
    
    for (const threshold of thresholdRange) {
      let startFreq_Hz = fhighHz;  // 默認值為上邊界
      
      // 從高到低掃描頻率 bin
      for (let binIdx = firstFramePower.length - 1; binIdx >= 0; binIdx--) {
        if (firstFramePower[binIdx] > threshold) {
          startFreq_Hz = freqBins[binIdx];
          
          // 嘗試線性插值以獲得更高精度
          if (binIdx < firstFramePower.length - 1) {
            const thisPower = firstFramePower[binIdx];
            const nextPower = firstFramePower[binIdx + 1];
            
            if (nextPower < threshold && thisPower > threshold) {
              const powerRatio = (thisPower - threshold) / (thisPower - nextPower);
              const freqDiff = freqBins[binIdx + 1] - freqBins[binIdx];
              startFreq_Hz = freqBins[binIdx] + powerRatio * freqDiff;
            }
          }
          break;
        }
      }
      
      measurements.push({
        threshold: threshold,
        startFreq_Hz: startFreq_Hz,
        startFreq_kHz: startFreq_Hz / 1000
      });
    }
    
    // 找出第一個導致 Start Freq 大幅變化的臨界點
    let optimalThreshold = -24;  // 默認使用最寬鬆的設定
    
    // 從第二個測量開始，比較與前一個測量的差異
    for (let i = 1; i < measurements.length; i++) {
      const prevFreq_kHz = measurements[i - 1].startFreq_kHz;
      const currFreq_kHz = measurements[i].startFreq_kHz;
      const freqDifference = Math.abs(currFreq_kHz - prevFreq_kHz);
      
      // 如果頻率差異超過 3 kHz，說明進入可疑區域
      // 異常通常表現為 >= 5-10 kHz 的跳躍
      if (freqDifference > 3000) {
        // 選擇異常前的閾值（這是最後一個"正常"測量）
        optimalThreshold = measurements[i - 1].threshold;
        break;
      }
    }
    
    // 確保返回值在有效範圍內
    return Math.max(Math.min(optimalThreshold, -24), -50);
  }

  /**
   * Phase 2: Measure precise
   * Based on Avisoft SASLab Pro, SonoBat, Kaleidoscope Pro, and BatSound standards
   * 
   * Reference implementations:
   * - Avisoft: Threshold-based peak detection with interpolation
   * - SonoBat: Duration-weighted frequency averaging
   * - Kaleidoscope: Multi-frame analysis with robustness checks
   * - BatSound: Peak prominence and edge detection
   * 
   * Updates call.peakFreq, startFreq, endFreq, characteristicFreq, bandwidth, duration
   */
  measureFrequencyParameters(call, flowKHz, fhighKHz, freqBins, freqResolution) {
    let { startEndThreshold_dB, characteristicFreq_percentEnd } = this.config;
    const spectrogram = call.spectrogram;  // [timeFrame][freqBin]
    const timeFrames = call.timeFrames;    // Time points for each frame
    
    if (spectrogram.length === 0) return;
    
    // ============================================================
    // AUTO MODE: If startEndThreshold_dB_isAuto is enabled,
    // automatically find optimal threshold before proceeding
    // ============================================================
    if (this.config.startEndThreshold_dB_isAuto === true) {
      startEndThreshold_dB = this.findOptimalStartEndThreshold(
        spectrogram,
        freqBins,
        flowKHz,
        fhighKHz
      );
    }
    
    // ============================================================
    // STEP 1: Find peak frequency (highest power across entire call)
    // 
    // Professional Standard: Use FFT + Parabolic Interpolation
    // (aligned with Avisoft, SonoBat, Kaleidoscope, BatSound)
    // 
    // Method:
    // 1. Find peak bin in spectrogram
    // 2. If peak is not at edge, apply parabolic interpolation
    // 3. This provides sub-bin precision (~0.1 Hz accuracy)
    // ============================================================
    let peakFreq_Hz = null;
    let peakPower_dB = -Infinity;
    let peakFrameIdx = 0;
    let peakBinIdx = 0;
    
    // Phase 1: Find global peak bin
    for (let frameIdx = 0; frameIdx < spectrogram.length; frameIdx++) {
      const framePower = spectrogram[frameIdx];
      for (let binIdx = 0; binIdx < framePower.length; binIdx++) {
        if (framePower[binIdx] > peakPower_dB) {
          peakPower_dB = framePower[binIdx];
          peakBinIdx = binIdx;
          peakFrameIdx = frameIdx;
        }
      }
    }
    
    // Phase 2: Apply parabolic interpolation for sub-bin precision
    // If peak is not at edges, interpolate between neighboring bins
    peakFreq_Hz = freqBins[peakBinIdx];
    
    if (peakBinIdx > 0 && peakBinIdx < spectrogram[peakFrameIdx].length - 1) {
      const framePower = spectrogram[peakFrameIdx];
      const db0 = framePower[peakBinIdx - 1];
      const db1 = framePower[peakBinIdx];
      const db2 = framePower[peakBinIdx + 1];
      
      // Parabolic vertex formula: y = a*x^2 + b*x + c
      // Peak position correction using 2nd derivative
      const a = (db2 - 2 * db1 + db0) / 2;
      if (Math.abs(a) > 1e-10) {
        // bin correction = (f(x-1) - f(x+1)) / (4*a)
        const binCorrection = (db0 - db2) / (4 * a);
        const refinedBin = peakBinIdx + binCorrection;
        const binWidth = freqBins[1] - freqBins[0]; // Frequency distance between bins
        peakFreq_Hz = freqBins[peakBinIdx] + binCorrection * binWidth;
      }
    }
    
    call.peakFreq_kHz = peakFreq_Hz / 1000;
    call.peakPower_dB = peakPower_dB;
    
    // ============================================================
    // ============================================================
    // STEP 1.5: 重新計算時間邊界 (基於新的 startEndThreshold_dB)
    // 
    // 2025 ANTI-REBOUNCE UPGRADE:
    // - Backward scanning for clean end frequency detection
    // - Maximum frequency drop rule to lock end frame
    // - 10ms protection window after peak energy
    // ============================================================
    const { 
      enableBackwardEndFreqScan,
      maxFrequencyDropThreshold_kHz,
      protectionWindowAfterPeak_ms
    } = this.config;
    
    const startThreshold_dB = peakPower_dB + startEndThreshold_dB;  // Typically -24dB
    
    // 找到第一個幀，其中有信號超過閾值
    let newStartFrameIdx = 0;
    for (let frameIdx = 0; frameIdx < spectrogram.length; frameIdx++) {
      const framePower = spectrogram[frameIdx];
      let frameHasSignal = false;
      for (let binIdx = 0; binIdx < framePower.length; binIdx++) {
        if (framePower[binIdx] > startThreshold_dB) {
          frameHasSignal = true;
          break;
        }
      }
      if (frameHasSignal) {
        newStartFrameIdx = frameIdx;
        break;
      }
    }
    
    // TRICK 1 & 3: Find end frame with anti-rebounce protection
    // 
    // Standard method: Backward scan from end to find -24dB cutoff
    // + Maximum frequency drop detection (Trick 2)
    // + Protection window limit (Trick 3)
    // ============================================================
    let newEndFrameIdx = spectrogram.length - 1;
    
    // Calculate frame limit for Trick 3 (10ms protection window)
    const protectionFrameLimit = Math.round(
      (protectionWindowAfterPeak_ms / 1000) / (timeFrames[1] - timeFrames[0])
    );
    const maxFrameIdxAllowed = Math.min(
      peakFrameIdx + protectionFrameLimit,
      spectrogram.length - 1
    );
    
    // ANTI-REBOUNCE: Backward scan from end to find clean cutoff
    // This is TRICK 1: Find from end backwards, stop at first frame below -24dB
    if (enableBackwardEndFreqScan) {
      let lastValidEndFrame = peakFrameIdx; // Start from peak at minimum
      let freqDropDetected = false;
      let maxFrequencySeenSoFar = 0;
      
      // Scan backward from end, but respect the 10ms protection window
      const scanStartFrame = Math.min(maxFrameIdxAllowed, spectrogram.length - 1);
      
      for (let frameIdx = scanStartFrame; frameIdx >= peakFrameIdx; frameIdx--) {
        const framePower = spectrogram[frameIdx];
        let frameHasSignal = false;
        let framePeakFreq = 0;
        
        // Find peak frequency in this frame
        let frameMaxPower = -Infinity;
        for (let binIdx = 0; binIdx < framePower.length; binIdx++) {
          if (framePower[binIdx] > frameMaxPower) {
            frameMaxPower = framePower[binIdx];
            framePeakFreq = freqBins[binIdx] / 1000; // Convert to kHz
          }
        }
        
        // Check if frame has signal above threshold
        if (frameMaxPower > startThreshold_dB) {
          frameHasSignal = true;
          
          // TRICK 2: Maximum Frequency Drop Rule
          // If frequency drops too much, lock it and don't accept further increases
          if (frameIdx < spectrogram.length - 1) {
            const nextFramePower = spectrogram[frameIdx + 1];
            let nextFramePeakFreq = 0;
            let nextFrameMaxPower = -Infinity;
            for (let binIdx = 0; binIdx < nextFramePower.length; binIdx++) {
              if (nextFramePower[binIdx] > nextFrameMaxPower) {
                nextFrameMaxPower = nextFramePower[binIdx];
                nextFramePeakFreq = freqBins[binIdx] / 1000;
              }
            }
            
            const frequencyDrop = nextFramePeakFreq - framePeakFreq;
            if (frequencyDrop > maxFrequencyDropThreshold_kHz && !freqDropDetected) {
              // Large frequency drop detected - this is likely where call ends
              freqDropDetected = true;
              lastValidEndFrame = frameIdx + 1; // Lock at this point
              break; // Stop scanning
            }
          }
          
          // Track maximum frequency for drop detection
          maxFrequencySeenSoFar = Math.max(maxFrequencySeenSoFar, framePeakFreq);
          lastValidEndFrame = frameIdx;
        } else if (frameHasSignal === false && lastValidEndFrame > peakFrameIdx) {
          // Found first frame below threshold (TRICK 1: backward cutoff)
          break;
        }
      }
      
      newEndFrameIdx = lastValidEndFrame;
    } else {
      // Original forward scanning method (without anti-rebounce)
      for (let frameIdx = spectrogram.length - 1; frameIdx >= 0; frameIdx--) {
        const framePower = spectrogram[frameIdx];
        let frameHasSignal = false;
        for (let binIdx = 0; binIdx < framePower.length; binIdx++) {
          if (framePower[binIdx] > startThreshold_dB) {
            frameHasSignal = true;
            break;
          }
        }
        if (frameHasSignal) {
          newEndFrameIdx = frameIdx;
          break;
        }
      }
    }
    
    // 確保 end frame 不超過保護窗限制
    newEndFrameIdx = Math.min(newEndFrameIdx, maxFrameIdxAllowed);
    
    // 更新時間邊界
    if (newStartFrameIdx < timeFrames.length) {
      call.startTime_s = timeFrames[newStartFrameIdx];
    }
    if (newEndFrameIdx < timeFrames.length - 1) {
      call.endTime_s = timeFrames[Math.min(newEndFrameIdx + 1, timeFrames.length - 1)];
    }
    
    // 重新計算 Duration（基於更新後的時間邊界）
    call.calculateDuration();
    
    // ============================================================
    // STEP 2: Find start frequency from first frame
    // Professional standard: threshold at -24dB below global peak
    // This is the highest frequency in the call (from first frame)
    // Search from HIGH to LOW frequency (reverse bin order)
    // ============================================================
    const firstFramePower = spectrogram[0];
    let startFreq_Hz = fhighKHz * 1000;  // Default to upper bound
    
    // Search from high to low frequency (reverse order)
    for (let binIdx = firstFramePower.length - 1; binIdx >= 0; binIdx--) {
      if (firstFramePower[binIdx] > startThreshold_dB) {
        // Found first bin above threshold
        startFreq_Hz = freqBins[binIdx];
        
        // Attempt linear interpolation for sub-bin precision
        if (binIdx < firstFramePower.length - 1) {
          const thisPower = firstFramePower[binIdx];
          const nextPower = firstFramePower[binIdx + 1];
          
          if (nextPower < startThreshold_dB && thisPower > startThreshold_dB) {
            // Interpolate between this bin and next
            const powerRatio = (thisPower - startThreshold_dB) / (thisPower - nextPower);
            const freqDiff = freqBins[binIdx + 1] - freqBins[binIdx];
            startFreq_Hz = freqBins[binIdx] + powerRatio * freqDiff;
          }
        }
        break;
      }
    }
    call.startFreq_kHz = startFreq_Hz / 1000;
    
    // STEP 2.5: Record the time point of start frequency (first frame with signal)
    // This is used as the reference point for knee time calculation
    const startFreqTime_s = timeFrames[0];  // Time of first frame with start frequency
    
    // ============================================================
    // STEP 3: Find end frequency from last frame
    // Professional standard: threshold at -24dB below global peak
    // This is the lowest frequency in the call (from last frame)
    // Search from LOW to HIGH frequency (normal bin order)
    // ============================================================
    const lastFramePower = spectrogram[spectrogram.length - 1];
    let endFreq_Hz = flowKHz * 1000;  // Default to lower bound
    
    // Search from low to high frequency
    for (let binIdx = 0; binIdx < lastFramePower.length; binIdx++) {
      if (lastFramePower[binIdx] > startThreshold_dB) {
        endFreq_Hz = freqBins[binIdx];
        
        // Attempt linear interpolation for sub-bin precision
        if (binIdx > 0) {
          const thisPower = lastFramePower[binIdx];
          const prevPower = lastFramePower[binIdx - 1];
          
          if (prevPower < startThreshold_dB && thisPower > startThreshold_dB) {
            // Interpolate between prev bin and this bin
            const powerRatio = (thisPower - startThreshold_dB) / (thisPower - prevPower);
            const freqDiff = freqBins[binIdx] - freqBins[binIdx - 1];
            endFreq_Hz = freqBins[binIdx] - powerRatio * freqDiff;
          }
        }
        break;
      }
    }
    call.endFreq_kHz = endFreq_Hz / 1000;
    
    // ============================================================
    // STEP 4: Calculate characteristic frequency (CF-FM distinction)
    // 
    // CRITICAL FIX: Characteristic frequency should be calculated from
    // the END portion of the call (last 10-20%), not just the lowest freq.
    // 
    // For CF-FM bats (Molossidae, Rhinolophidae, Hipposideridae):
    // - CF phase has constant frequency (used for Doppler compensation)
    // - FM phase has downward sweep
    // - Characteristic frequency = CF phase frequency (from end portion)
    // 
    // For pure FM bats (Vespertilionidae):
    // - Entire call is FM sweep
    // - Characteristic frequency ≈ End frequency (lowest)
    // 
    // Method: Extract CENTER frequency from last 10-20% portion
    // ============================================================
    const lastPercentStart = Math.floor(spectrogram.length * (1 - characteristicFreq_percentEnd / 100));
    let characteristicFreq_Hz = peakFreq_Hz;
    
    if (lastPercentStart < spectrogram.length) {
      // Method 1: Find weighted average frequency in last portion
      // This handles CF-FM calls better than just finding the minimum
      let totalPower = 0;
      let weightedFreq = 0;
      
      for (let frameIdx = Math.max(0, lastPercentStart); frameIdx < spectrogram.length; frameIdx++) {
        const framePower = spectrogram[frameIdx];
        
        // Find frame maximum for normalization
        let frameMax = -Infinity;
        for (let binIdx = 0; binIdx < framePower.length; binIdx++) {
          frameMax = Math.max(frameMax, framePower[binIdx]);
        }
        
        // Use -6dB threshold (half power) to define "significant" region
        const significantThreshold = frameMax - 6;
        
        for (let binIdx = 0; binIdx < framePower.length; binIdx++) {
          const power = framePower[binIdx];
          if (power > significantThreshold) {
            // Weight by power in dB scale
            const linearPower = Math.pow(10, power / 10);
            totalPower += linearPower;
            weightedFreq += linearPower * freqBins[binIdx];
          }
        }
      }
      
      // Calculate weighted average frequency
      if (totalPower > 0) {
        characteristicFreq_Hz = weightedFreq / totalPower;
      } else {
        // Fallback: find lowest frequency in end portion
        for (let frameIdx = Math.max(0, lastPercentStart); frameIdx < spectrogram.length; frameIdx++) {
          const framePower = spectrogram[frameIdx];
          for (let binIdx = 0; binIdx < framePower.length; binIdx++) {
            if (framePower[binIdx] > -Infinity) {
              characteristicFreq_Hz = freqBins[binIdx];
              break;
            }
          }
        }
      }
    }
    
    call.characteristicFreq_kHz = characteristicFreq_Hz / 1000;
    
    // ============================================================
    // STEP 5: Validate frequency relationships (Avisoft standard)
    // Ensure: endFreq ≤ charFreq ≤ peakFreq ≤ startFreq
    // This maintains biological validity for FM and CF-FM calls
    // ============================================================
    // Clamp characteristic frequency between end and peak
    const endFreqKHz = endFreq_Hz / 1000;
    const charFreqKHz = characteristicFreq_Hz / 1000;
    const peakFreqKHz = peakFreq_Hz / 1000;
    const startFreqKHz = startFreq_Hz / 1000;
    
    if (charFreqKHz < endFreqKHz) {
      // Char freq should not be below end freq
      call.characteristicFreq_kHz = endFreqKHz;
    } else if (charFreqKHz > peakFreqKHz) {
      // Char freq should not exceed peak freq
      call.characteristicFreq_kHz = peakFreqKHz;
    }
    
    // Calculate bandwidth
    call.calculateBandwidth();
    
    // ============================================================
    // ============================================================
    // STEP 6: Calculate Knee Frequency and Knee Time
    // 
    // 2025 PROFESSIONAL STANDARD: Maximum 2nd Derivative + -15 dB Fallback
    // Used by: Avisoft official manual, SonoBat whitepaper, Kaleidoscope tech docs
    // 
    // Algorithm:
    // 1. Extract frequency contour (peak frequency trajectory)
    // 2. Smooth with Savitzky-Golay filter (window=5)
    // 3. Calculate 2nd derivative (acceleration of frequency change)
    // 4. Find minimum 2nd derivative point (CF→FM transition)
    // 5. If noise too high: fallback to -15 dB below peak method
    // ============================================================
    
    // STEP 6.1: Extract peak frequency trajectory for each frame
    // (More stable than weighted average for noisy signals)
    const frameFrequencies = [];
    
    for (let frameIdx = 0; frameIdx < spectrogram.length; frameIdx++) {
      const framePower = spectrogram[frameIdx];
      
      // Find peak frequency (highest power bin) in this frame
      let peakIdx = 0;
      let maxPower = -Infinity;
      
      for (let binIdx = 0; binIdx < framePower.length; binIdx++) {
        if (framePower[binIdx] > maxPower) {
          maxPower = framePower[binIdx];
          peakIdx = binIdx;
        }
      }
      
      // Store peak frequency in Hz
      frameFrequencies.push(freqBins[peakIdx]);
    }
    
    // STEP 6.2: Apply Savitzky-Goyal smoothing filter (window=5, polynomial=2)
    // This is what Avisoft uses for stable knee detection
    const smoothedFrequencies = this.savitzkyGolay(frameFrequencies, 5, 2);
    
    // STEP 6.3: Calculate 1st derivative (frequency change rate)
    // Note: firstDerivatives[i] represents derivative at frame i+1 position
    const firstDerivatives = [];
    const firstDerivIndices = [];  // Track corresponding frame indices
    
    for (let i = 0; i < smoothedFrequencies.length - 1; i++) {
      const freqChange = smoothedFrequencies[i + 1] - smoothedFrequencies[i];
      const timeDelta = (i + 1 < timeFrames.length) ? 
        (timeFrames[i + 1] - timeFrames[i]) : 0.001; // Prevent division by zero
      
      firstDerivatives.push(freqChange / timeDelta);
      firstDerivIndices.push(i + 1);  // This derivative is at frame i+1
    }
    
    // STEP 6.4: Calculate 2nd derivative (acceleration of frequency change)
    // Note: secondDerivatives[i] represents 2nd derivative at frame i+2 position
    const secondDerivatives = [];
    const secondDerivIndices = [];  // Track corresponding frame indices
    
    for (let i = 0; i < firstDerivatives.length - 1; i++) {
      const derivChange = firstDerivatives[i + 1] - firstDerivatives[i];
      const timeDelta = (i + 2 < timeFrames.length) ? 
        (timeFrames[i + 2] - timeFrames[i + 1]) : 0.001;
      
      secondDerivatives.push(derivChange / timeDelta);
      secondDerivIndices.push(i + 2);  // This 2nd derivative is at frame i+2
    }
    
    // STEP 6.5: Find knee point - minimum 2nd derivative (most negative)
    // This represents the point where frequency deceleration is maximum
    // i.e., CF segment (stable) → FM segment (rapid change)
    let kneeIdx = -1;
    let minSecondDeriv = 0; // Looking for negative values
    
    for (let i = 0; i < secondDerivatives.length; i++) {
      if (secondDerivatives[i] < minSecondDeriv) {
        minSecondDeriv = secondDerivatives[i];
        kneeIdx = secondDerivIndices[i];  // Use mapped frame index
      }
    }
    
    // STEP 6.6: Quality check - verify knee is significant
    // Calculation of signal-to-noise ratio (SNR) of the 2nd derivative
    const derivMean = secondDerivatives.reduce((a, b) => a + b, 0) / secondDerivatives.length;
    const derivStdDev = Math.sqrt(
      secondDerivatives.reduce((sum, val) => sum + Math.pow(val - derivMean, 2), 0) / secondDerivatives.length
    );
    
    const isNoisySignal = Math.abs(minSecondDeriv) < derivStdDev * 0.5; // SNR threshold
    
    // STEP 6.7: If second derivative method fails, use -15 dB fallback
    if (kneeIdx < 0 || isNoisySignal) {
      // FALLBACK: Find first point from end that is -15 dB below peak
      const fallbackThreshold = peakPower_dB - 15; // Professional standard: -15 dB
      
      kneeIdx = -1;
      // Search from end backwards (CF segment is usually at the end)
      for (let i = spectrogram.length - 1; i >= 0; i--) {
        const framePower = spectrogram[i];
        let frameMax = -Infinity;
        
        for (let binIdx = 0; binIdx < framePower.length; binIdx++) {
          frameMax = Math.max(frameMax, framePower[binIdx]);
        }
        
        if (frameMax > fallbackThreshold) {
          kneeIdx = i;  // Direct frame index from spectrogram
          break;
        }
      }
    }
    
    // STEP 6.8: Set knee frequency and knee time from detected knee point
    // 
    // CORRECTION (User requirement):
    // Knee Time = Knee frequency 的時間 - Start frequency 的時間
    // i.e., the time offset from when Start Frequency is detected to when Knee occurs
    //
    // startFreqTime_s = time of first frame (STEP 2.5)
    // timeFrames[kneeIdx] = time when knee is detected
    // kneeTime_ms = (timeFrames[kneeIdx] - startFreqTime_s) * 1000
    if (kneeIdx >= 0 && kneeIdx < frameFrequencies.length) {
      // Use original (non-smoothed) frequency at knee point for accuracy
      call.kneeFreq_kHz = frameFrequencies[kneeIdx] / 1000;
      
      // Knee time = time from start frequency to knee point
      if (kneeIdx >= 0 && kneeIdx < timeFrames.length) {
        call.kneeTime_ms = (timeFrames[kneeIdx] - startFreqTime_s) * 1000;
      } else {
        call.kneeTime_ms = 0;
      }
    } else {
      // Ultimate fallback: use peak frequency
      call.kneeFreq_kHz = peakFreq_Hz / 1000;
      if (peakFrameIdx >= 0 && peakFrameIdx < timeFrames.length) {
        call.kneeTime_ms = (timeFrames[peakFrameIdx] - startFreqTime_s) * 1000;
      } else {
        call.kneeTime_ms = 0;
      }
    }
    
    // ============================================================
    // AUTO-DETECT CF-FM TYPE AND DISABLE ANTI-REBOUNCE IF NEEDED
    // 
    // If High-Freq (peakFreq) and Peak Freq differ by < 1 kHz, 
    // it's likely a CF-FM call that exceeds the 10ms protection window.
    // Automatically disable anti-rebounce to avoid truncating long CF phases.
    // ============================================================
    
    // High-Freq in this context is the peak frequency
    const peakFreq_kHz = peakFreq_Hz / 1000;
    const startFreq_kHz = startFreq_Hz / 1000;
    
    // Calculate difference between peak and start frequency
    const freqDifference = Math.abs(peakFreq_kHz - startFreq_kHz);
    
    // ============================================================
    // Save actual used threshold value (after Auto mode calculation)
    // This allows UI to reflect the real value being used
    // ============================================================
    if (this.config.startEndThreshold_dB_isAuto === true) {
      this.config.startEndThreshold_dB = startEndThreshold_dB;
    }
    
    if (freqDifference < 1.0) {
      // CF-FM type call detected: peak and start frequencies very close
      // This means the call has a significant CF phase followed by FM sweep
      // The call duration likely exceeds the 10ms protection window
      // Auto-disable anti-rebounce to prevent false truncation
      this.config.enableBackwardEndFreqScan = false;
    } else {
      // Pure FM call: restore the anti-rebounce setting from original config
      // Re-read from parent config to get user's intended setting
      this.config.enableBackwardEndFreqScan = this.config.enableBackwardEndFreqScan !== false;
    }
  }
  
  /**
   * Measure call parameters for a selected frequency range
   * Used by Power Spectrum popup for real-time parameter calculation
   */
  async measureSelectionParameters(audioData, sampleRate, startTime_s, endTime_s, flowKHz, fhighKHz) {
    const startSample = Math.floor(startTime_s * sampleRate);
    const endSample = Math.floor(endTime_s * sampleRate);
    
    const selectionAudio = audioData.slice(startSample, endSample);
    if (selectionAudio.length === 0) return null;
    
    // For a selected region, we treat it as one call
    const calls = await this.detectCalls(selectionAudio, sampleRate, flowKHz, fhighKHz);
    
    if (calls.length === 0) {
      // If no call detected, still provide peak frequency
      return this.measureDirectSelection(selectionAudio, sampleRate, flowKHz, fhighKHz);
    }
    
    // Return the most significant call in the selection
    let maxCall = calls[0];
    for (const call of calls) {
      if ((call.endTime_s - call.startTime_s) > (maxCall.endTime_s - maxCall.startTime_s)) {
        maxCall = call;
      }
    }
    
    // Adjust times to be relative to original audio
    maxCall.startTime_s += startTime_s;
    maxCall.endTime_s += startTime_s;
    
    return maxCall;
  }
  
  /**
   * Direct measurement for user-selected region (no detection, just measurement)
   * Used when user explicitly selects an area
   * 
   * Commercial standard (Avisoft, SonoBat, Kaleidoscope, BatSound):
   * Flow = lowest detectable frequency in selection (Hz)
   * Fhigh = highest detectable frequency in selection (kHz)
   */
  measureDirectSelection(audioData, sampleRate, flowKHz, fhighKHz) {
    const { fftSize, windowType, startEndThreshold_dB } = this.config;
    
    // Apply window
    const windowed = this.applyWindow(audioData, windowType);
    
    // Remove DC
    let dcOffset = 0;
    for (let i = 0; i < windowed.length; i++) dcOffset += windowed[i];
    dcOffset /= windowed.length;
    
    const dcRemoved = new Float32Array(windowed.length);
    for (let i = 0; i < windowed.length; i++) {
      dcRemoved[i] = windowed[i] - dcOffset;
    }
    
    const freqResolution = sampleRate / fftSize;
    const minBin = Math.max(0, Math.floor(flowKHz * 1000 / freqResolution));
    const maxBin = Math.min(
      Math.floor(fftSize / 2),
      Math.floor(fhighKHz * 1000 / freqResolution)
    );
    
    // Measure peak frequency and find frequency range
    let peakFreq_Hz = null;
    let peakPower_dB = -Infinity;
    let lowestFreq_Hz = null;
    let highestFreq_Hz = null;
    
    // First pass: find peak
    for (let binIdx = minBin; binIdx <= maxBin; binIdx++) {
      const freqHz = binIdx * freqResolution;
      const energy = this.goertzelEnergy(dcRemoved, freqHz, sampleRate);
      const rms = Math.sqrt(energy);
      const psd = (rms * rms) / fftSize;
      const powerDb = 10 * Math.log10(Math.max(psd, 1e-16));
      
      if (powerDb > peakPower_dB) {
        peakPower_dB = powerDb;
        peakFreq_Hz = freqHz;
      }
    }
    
    // Second pass: find frequency range based on -24dB threshold from peak
    // (Commercial standard from Avisoft, SonoBat)
    if (peakPower_dB > -Infinity) {
      const threshold_dB = peakPower_dB + startEndThreshold_dB; // Typically -24dB
      
      // Find lowest frequency above threshold
      for (let binIdx = minBin; binIdx <= maxBin; binIdx++) {
        const freqHz = binIdx * freqResolution;
        const energy = this.goertzelEnergy(dcRemoved, freqHz, sampleRate);
        const rms = Math.sqrt(energy);
        const psd = (rms * rms) / fftSize;
        const powerDb = 10 * Math.log10(Math.max(psd, 1e-16));
        
        if (powerDb > threshold_dB) {
          lowestFreq_Hz = freqHz;
          break;
        }
      }
      
      // Find highest frequency above threshold
      for (let binIdx = maxBin; binIdx >= minBin; binIdx--) {
        const freqHz = binIdx * freqResolution;
        const energy = this.goertzelEnergy(dcRemoved, freqHz, sampleRate);
        const rms = Math.sqrt(energy);
        const psd = (rms * rms) / fftSize;
        const powerDb = 10 * Math.log10(Math.max(psd, 1e-16));
        
        if (powerDb > threshold_dB) {
          highestFreq_Hz = freqHz;
          break;
        }
      }
    }
    
    const call = new BatCall();
    call.peakFreq_kHz = peakFreq_Hz ? peakFreq_Hz / 1000 : null;
    call.peakPower_dB = peakPower_dB;
    
    // Set Flow and Fhigh based on detected frequency range
    // (Commercial standard from Avisoft, SonoBat, Kaleidoscope, BatSound)
    // Flow = Lowest frequency in the selection (Hz)
    // Fhigh = Highest frequency in the selection (kHz)
    // Note: For direct user selection, may not have complete frequency sweep
    call.Flow = lowestFreq_Hz ? lowestFreq_Hz : (flowKHz * 1000);     // Hz
    call.Fhigh = highestFreq_Hz ? (highestFreq_Hz / 1000) : fhighKHz; // kHz
    
    return call;
  }
}

/**
 * Export default detector instance with standard configuration
 */
export const defaultDetector = new BatCallDetector();
