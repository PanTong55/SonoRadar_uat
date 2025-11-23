/**
 * Bat Call Export Utilities
 * 
 * Provides export functionality for Power Spectrum analysis results
 * Compatible with: Avisoft, SonoBat, Kaleidoscope, BatSound
 */

/**
 * Export analysis results to various formats
 */
export class ExportManager {
  /**
   * Export to CSV (Avisoft-compatible)
   */
  static exportToCSV(batCall, selection, index = 1) {
    if (!batCall) return null;
    
    const row = [
      index,
      selection.startTime?.toFixed(4) || '-',
      selection.endTime?.toFixed(4) || '-',
      (selection.endTime - selection.startTime)?.toFixed(4) || '-',
      batCall.startFreq_kHz?.toFixed(2) || '-',
      batCall.endFreq_kHz?.toFixed(2) || '-',
      batCall.endFreq_kHz?.toFixed(2) || '-',
      batCall.startFreq_kHz?.toFixed(2) || '-',
      batCall.peakFreq_kHz?.toFixed(2) || '-',
      batCall.bandwidth_kHz?.toFixed(2) || '-',
      batCall.characteristicFreq_kHz?.toFixed(2) || '-',
      batCall.callType || '-',
      batCall.peakPower_dB?.toFixed(1) || '-',
    ];
    
    return row.join(',');
  }
  
  /**
   * Export to clipboard as formatted table
   */
  static copyToClipboard(batCall, selection) {
    if (!batCall) return false;
    
    const text = `
蝙蝠叫声参数 - Bat Call Parameters
═══════════════════════════════════════════

基本信息 / Basic Info:
  呼叫类型 (Call Type): ${batCall.callType || '-'}
  呼叫时间 (Time): ${selection.startTime?.toFixed(4) || '-'} - ${selection.endTime?.toFixed(4) || '-'} s
  呼叫长度 (Duration): ${batCall.duration_ms?.toFixed(2) || '-'} ms

频率参数 (Frequency Parameters) [kHz]:
  峰值频率 (Peak Frequency): ${batCall.peakFreq_kHz?.toFixed(2) || '-'}
  起始频率 (Start Frequency): ${batCall.startFreq_kHz?.toFixed(2) || '-'}
  终止频率 (End Frequency): ${batCall.endFreq_kHz?.toFixed(2) || '-'}
  特征频率 (Characteristic Freq): ${batCall.characteristicFreq_kHz?.toFixed(2) || '-'}
  带宽 (Bandwidth): ${batCall.bandwidth_kHz?.toFixed(2) || '-'}

功率信息 (Power):
  峰值功率 (Peak Power): ${batCall.peakPower_dB?.toFixed(1) || '-'} dB
═══════════════════════════════════════════
    `.trim();
    
    try {
      navigator.clipboard.writeText(text).then(() => {
        console.log('✓ Parameters copied to clipboard');
        return true;
      }).catch(err => {
        console.error('Failed to copy to clipboard:', err);
        return false;
      });
    } catch (err) {
      console.error('Clipboard not available:', err);
      return false;
    }
  }
  
  /**
   * Download as JSON file
   */
  static downloadJSON(batCall, selection, fileName = 'bat_call.json') {
    if (!batCall) return;
    
    const data = {
      metadata: {
        exportTime: new Date().toISOString(),
        software: 'Professional Bat Call Detector v1.0',
      },
      selection,
      call: batCall.toAnalysisRecord?.() || batCall,
    };
    
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
  
  /**
   * Download as CSV file
   */
  static downloadCSV(batCall, selection, fileName = 'bat_call.csv') {
    if (!batCall) return;
    
    const headers = [
      'Selection #',
      'Selection Start (s)',
      'Selection End (s)',
      'Duration (s)',
      'Start Frequency (kHz)',
      'End Frequency (kHz)',
      'Low Frequency (kHz)',
      'High Frequency (kHz)',
      'Peak Frequency (kHz)',
      'Bandwidth (kHz)',
      'Characteristic Frequency (kHz)',
      'Call Type',
      'Peak Power (dB)',
    ].join(',');
    
    const row = ExportManager.exportToCSV(batCall, selection, 1);
    const csv = headers + '\n' + row;
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
  
  /**
   * Display in console table format (for debugging/inspection)
   */
  static logToConsole(batCall, selection) {
    if (!batCall) return;
    
    const data = {
      'Call Type': batCall.callType,
      'Peak Frequency (kHz)': batCall.peakFreq_kHz?.toFixed(2),
      'Start Frequency (kHz)': batCall.startFreq_kHz?.toFixed(2),
      'End Frequency (kHz)': batCall.endFreq_kHz?.toFixed(2),
      'Characteristic Freq (kHz)': batCall.characteristicFreq_kHz?.toFixed(2),
      'Bandwidth (kHz)': batCall.bandwidth_kHz?.toFixed(2),
      'Duration (ms)': batCall.duration_ms?.toFixed(2),
      'Peak Power (dB)': batCall.peakPower_dB?.toFixed(1),
      'Start Time (s)': selection.startTime?.toFixed(4),
      'End Time (s)': selection.endTime?.toFixed(4),
    };
    
    console.group('🦇 Bat Call Analysis Results');
    console.table(data);
    console.groupEnd();
  }
}

/**
 * Batch export utility for multiple calls
 */
export class BatchExporter {
  /**
   * Export multiple calls to CSV
   */
  static exportMultipleToCSV(calls, selections) {
    if (!calls || calls.length === 0) return null;
    
    const headers = [
      'Selection #',
      'Selection Start (s)',
      'Selection End (s)',
      'Duration (s)',
      'Start Frequency (kHz)',
      'End Frequency (kHz)',
      'Low Frequency (kHz)',
      'High Frequency (kHz)',
      'Peak Frequency (kHz)',
      'Bandwidth (kHz)',
      'Characteristic Frequency (kHz)',
      'Call Type',
      'Peak Power (dB)',
    ].join(',');
    
    let csv = headers + '\n';
    
    calls.forEach((call, idx) => {
      const selection = selections?.[idx] || {};
      const row = ExportManager.exportToCSV(call, selection, idx + 1);
      csv += row + '\n';
    });
    
    return csv;
  }
  
  /**
   * Download batch CSV
   */
  static downloadBatchCSV(calls, selections, fileName = 'bat_calls_batch.csv') {
    const csv = BatchExporter.exportMultipleToCSV(calls, selections);
    if (!csv) return;
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
  
  /**
   * Export to multiple formats at once (zip archive would require additional library)
   */
  static async exportToMultipleFormats(batCall, selection, baseName = 'bat_call') {
    // JSON
    ExportManager.downloadJSON(batCall, selection, `${baseName}.json`);
    
    // CSV (with small delay to prevent blocking)
    await new Promise(resolve => setTimeout(resolve, 500));
    ExportManager.downloadCSV(batCall, selection, `${baseName}.csv`);
    
    return true;
  }
}

/**
 * Comparison utility for validating against reference standards
 */
export class ReferenceComparison {
  /**
   * Standard reference values for common bat species
   * Source: Regional field guides and acoustic literature
   */
  static REFERENCE_VALUES = {
    // European bats
    'Rhinolophus_ferrumequinum': {
      name: 'Greater Horseshoe Bat',
      peakFreq_kHz: { min: 78, max: 84, typical: 82 },
      bandwidth_kHz: { min: 0.5, max: 2, typical: 1.2 },
      callType: 'CF',
      duration_ms: { min: 5, max: 100, typical: 50 },
    },
    'Rhinolophus_hipposideros': {
      name: 'Lesser Horseshoe Bat',
      peakFreq_kHz: { min: 40, max: 44, typical: 42 },
      bandwidth_kHz: { min: 0.3, max: 1.5, typical: 0.8 },
      callType: 'CF',
      duration_ms: { min: 3, max: 80, typical: 40 },
    },
    'Myotis_daubentonii': {
      name: 'Daubenton\'s Bat',
      peakFreq_kHz: { min: 48, max: 52, typical: 50 },
      bandwidth_kHz: { min: 30, max: 40, typical: 35 },
      callType: 'FM',
      duration_ms: { min: 2, max: 10, typical: 5 },
    },
    'Tadarida_brasiliensis': {
      name: 'Brazilian Free-tailed Bat',
      peakFreq_kHz: { min: 21, max: 26, typical: 23 },
      bandwidth_kHz: { min: 2, max: 6, typical: 4 },
      callType: 'CF-FM',
      duration_ms: { min: 5, max: 50, typical: 20 },
    },
  };
  
  /**
   * Compare detected call with reference
   */
  static compareWithReference(batCall, referenceKey) {
    const reference = ReferenceComparison.REFERENCE_VALUES[referenceKey];
    if (!reference) return null;
    
    const comparison = {
      speciesName: reference.name,
      parameters: {},
    };
    
    // Frequency comparison
    if (batCall.peakFreq_kHz) {
      const freqRef = reference.peakFreq_kHz;
      const freqError = batCall.peakFreq_kHz - freqRef.typical;
      comparison.parameters.peakFreq = {
        detected: batCall.peakFreq_kHz.toFixed(2),
        reference: freqRef.typical,
        error: freqError.toFixed(2),
        withinRange: batCall.peakFreq_kHz >= freqRef.min && batCall.peakFreq_kHz <= freqRef.max,
      };
    }
    
    // Bandwidth comparison
    if (batCall.bandwidth_kHz) {
      const bwRef = reference.bandwidth_kHz;
      comparison.parameters.bandwidth = {
        detected: batCall.bandwidth_kHz.toFixed(2),
        reference: bwRef.typical,
        withinRange: batCall.bandwidth_kHz >= bwRef.min && batCall.bandwidth_kHz <= bwRef.max,
      };
    }
    
    // Duration comparison
    if (batCall.duration_ms) {
      const durRef = reference.duration_ms;
      comparison.parameters.duration = {
        detected: batCall.duration_ms.toFixed(2),
        reference: durRef.typical,
        withinRange: batCall.duration_ms >= durRef.min && batCall.duration_ms <= durRef.max,
      };
    }
    
    // Call type comparison
    comparison.parameters.callType = {
      detected: batCall.callType,
      reference: reference.callType,
      match: batCall.callType === reference.callType,
    };
    
    return comparison;
  }
  
  /**
   * Generate confidence score for species identification
   */
  static getIdentificationConfidence(batCall) {
    const scores = {};
    
    for (const [key, reference] of Object.entries(ReferenceComparison.REFERENCE_VALUES)) {
      let score = 0;
      let maxScore = 0;
      
      // Frequency scoring
      if (batCall.peakFreq_kHz) {
        maxScore += 40;
        const freqRange = reference.peakFreq_kHz;
        if (batCall.peakFreq_kHz >= freqRange.min && batCall.peakFreq_kHz <= freqRange.max) {
          const distance = Math.abs(batCall.peakFreq_kHz - freqRange.typical);
          score += Math.max(0, 40 - distance * 5);
        }
      }
      
      // Bandwidth scoring
      if (batCall.bandwidth_kHz) {
        maxScore += 30;
        const bwRange = reference.bandwidth_kHz;
        if (batCall.bandwidth_kHz >= bwRange.min && batCall.bandwidth_kHz <= bwRange.max) {
          score += 30;
        }
      }
      
      // Call type scoring
      if (batCall.callType) {
        maxScore += 30;
        if (batCall.callType === reference.callType) {
          score += 30;
        }
      }
      
      if (maxScore > 0) {
        scores[key] = {
          species: reference.name,
          confidence: ((score / maxScore) * 100).toFixed(1),
        };
      }
    }
    
    // Sort by confidence
    return Object.entries(scores)
      .sort(([, a], [, b]) => parseFloat(b.confidence) - parseFloat(a.confidence))
      .slice(0, 3)  // Top 3
      .map(([key, data]) => data);
  }
}

export { ExportManager, BatchExporter, ReferenceComparison };
