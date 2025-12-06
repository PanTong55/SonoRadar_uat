/* tslint:disable */
/* eslint-disable */

export class SpectrogramEngine {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * 獲取 FFT 大小
   */
  get_fft_size(): number;
  /**
   * 獲取頻率箱數
   */
  get_freq_bins(): number;
  /**
   * 獲取最後計算的全局最大幅度值
   * 
   * 此值在最後一次 compute_spectrogram_u8 調用時計算。
   * 用於與閾值進行比較以進行峰值檢測。
   * 
   * # Returns
   * 線性幅度值（未轉換為 dB）
   */
  get_global_max(): number;
  /**
   * 獲取濾波器數量
   */
  get_num_filters(): number;
  /**
   * 載入濾波器組矩陣
   * 
   * # Arguments
   * * `flat_weights` - 扁平化的濾波器組權重矩陣 (Float32Array)
   * * `num_filters` - 濾波器數量
   * 
   * 矩陣順序: 行優先 (row-major)
   * 每行長度: fft_size / 2 + 1
   */
  load_filter_bank(flat_weights: Float32Array, num_filters: number): void;
  /**
   * 清除濾波器組 (禁用濾波)
   */
  clear_filter_bank(): void;
  /**
   * 獲取窗函數值（用於調試/驗證）
   */
  get_window_values(): Float32Array;
  /**
   * 計算 FFT 頻譜（返回幅度值，不進行 dB 轉換）
   *
   * # Arguments
   * * `audio_data` - 音頻數據 (Float32Array)
   * * `noverlap` - 重疊樣本數
   *
   * # Returns
   * 平面的 Float32Array（頻率箱 * 時間步），包含幅度值
   */
  compute_spectrogram(audio_data: Float32Array, noverlap: number): Float32Array;
  /**
   * 獲取每個時間幀的峰值幅度值
   * 
   * 基於在最後一次 compute_spectrogram_u8 調用中計算的線性幅度值。
   * 返回每個時間幀中峰值 bin 的幅度值（線性，未轉換為 dB）。
   * 
   * # Returns
   * Float32Array，其中每個元素是對應時間幀的峰值幅度值
   * 如果該幀沒有有效的峰值，返回 0.0
   */
  get_peak_magnitudes(threshold_ratio: number): Float32Array;
  /**
   * 計算頻譜圖並轉換為 u8 量化值 (0-255)
   * 
   * # Arguments
   * * `audio_data` - 音頻數據 (Float32Array)
   * * `noverlap` - 重疊樣本數
   * * `gain_db` - 增益 dB 值（用於縮放）
   * * `range_db` - 動態範圍 dB 值
   *
   * # Returns
   * 扁平化的 Uint8Array (filter_nums * num_frames 或 freq_bins * num_frames)
   * 包含映射到 0-255 範圍的頻譜數據
   */
  compute_spectrogram_u8(audio_data: Float32Array, noverlap: number, gain_db: number, range_db: number): Uint8Array;
  /**
   * 創建新的 SpectrogramEngine 實例
   * 
   * # Arguments
   * * `fft_size` - FFT 大小（必須是 2 的冪）
   * * `window_func` - 窗函數名稱 (hann, hamming, bartlett, blackman, etc.)
   * * `alpha` - 某些窗函數的 alpha 參數（可選）
   */
  constructor(fft_size: number, window_func: string, alpha?: number | null);
  /**
   * 獲取峰值檢測結果 (頻率 bin 索引)
   * 
   * 基於在最後一次 compute_spectrogram_u8 調用中計算的線性幅度值。
   * 返回每個時間幀中超過閾值的峰值頻率 bin 索引。
   * 
   * # Arguments
   * * `threshold_ratio` - 相對於全局最大值的閾值比率 (0.0-1.0, 典型值: 0.4)
   * 
   * # Returns
   * Uint16Array，每個元素對應一個時間幀：
   * - 如果超過閾值: 峰值所在的頻率 bin 索引 (0 到 fft_size/2-1)
   * - 如果未超過閾值: u16::MAX (0xFFFF，表示無效)
   */
  get_peaks(threshold_ratio: number): Uint16Array;
}

/**
 * 計算波形峰值用於可視化
 * 
 * 該函數對音頻通道進行下采樣，將其縮放為指定數量的峰值點。
 * 每個峰值點代表相應範圍內樣本的最大絕對值。
 * 
 * # Arguments
 * * `channel_data` - 音頻通道數據 (原始 float32 樣本)
 * * `num_peaks` - 所需的峰值點數量（目標寬度）
 * 
 * # Returns
 * 包含 num_peaks 個絕對最大值的 Vec<f32>
 * 
 * # Performance
 * 使用迭代器進行優化，避免不必要的數組複製。
 * 對於長音頻文件，此函數比 JavaScript 實現快 5-10 倍。
 */
export function compute_wave_peaks(channel_data: Float32Array, num_peaks: number): Float32Array;

/**
 * 找到整個音頻緩衝區的全局最大值（用於標準化）
 * 
 * # Arguments
 * * `channel_data` - 音頻通道數據
 * 
 * # Returns
 * 整個通道的最大絕對值
 */
export function find_global_max(channel_data: Float32Array): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_spectrogramengine_free: (a: number, b: number) => void;
  readonly compute_wave_peaks: (a: number, b: number, c: number) => [number, number];
  readonly find_global_max: (a: number, b: number) => number;
  readonly spectrogramengine_clear_filter_bank: (a: number) => void;
  readonly spectrogramengine_compute_spectrogram: (a: number, b: number, c: number, d: number) => [number, number];
  readonly spectrogramengine_compute_spectrogram_u8: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
  readonly spectrogramengine_get_fft_size: (a: number) => number;
  readonly spectrogramengine_get_freq_bins: (a: number) => number;
  readonly spectrogramengine_get_global_max: (a: number) => number;
  readonly spectrogramengine_get_num_filters: (a: number) => number;
  readonly spectrogramengine_get_peak_magnitudes: (a: number, b: number) => [number, number];
  readonly spectrogramengine_get_peaks: (a: number, b: number) => [number, number];
  readonly spectrogramengine_get_window_values: (a: number) => [number, number];
  readonly spectrogramengine_load_filter_bank: (a: number, b: number, c: number, d: number) => void;
  readonly spectrogramengine_new: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
