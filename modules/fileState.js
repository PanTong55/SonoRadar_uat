// modules/fileState.js

let fileList = [];
let currentIndex = -1;
let fileIcons = {}; // { index: { trash: bool, star: bool, question: bool } }
let fileNotes = {}; // { index: string }
let fileMetadata = {}; // { index: { date, time, latitude, longitude } }

export function setFileList(list, index = 0) {
  fileList = list;
  currentIndex = index;
  fileIcons = {};
  fileNotes = {};
  fileMetadata = {};
}

export function addFilesToList(list, index = 0) {
  if (!Array.isArray(list) || list.length === 0) return;
  const startIndex = fileList.length;
  fileList = fileList.concat(list);
  currentIndex = startIndex + index;
}

export function getFileList() {
  return fileList;
}

export function getCurrentIndex() {
  return currentIndex;
}

export function setCurrentIndex(index) {
  if (index >= 0 && index < fileList.length) {
    currentIndex = index;
  }
}

export function getCurrentFile() {
  if (currentIndex >= 0 && currentIndex < fileList.length) {
    return fileList[currentIndex];
  }
  return null;
}

export function toggleFileIcon(index, type) {
  if (!fileIcons[index]) {
    fileIcons[index] = { trash: false, star: false, question: false };
  }
  if (type in fileIcons[index]) {
    fileIcons[index][type] = !fileIcons[index][type];
    try {
      document.dispatchEvent(new CustomEvent('file-icon-toggled', {
        detail: { index, type, state: fileIcons[index][type] }
      }));
    } catch (err) {
      // ignore if document is undefined (e.g. non-browser environment)
    }
  }
}

export function getFileIconState(index) {
  return fileIcons[index] || { trash: false, star: false, question: false };
}

export function clearFileList() {
  fileList = [];
  currentIndex = -1;
  fileIcons = {};
  fileNotes = {};
  fileMetadata = {};
}

/**
 * 智能清理舊文件對象（當列表超過閾值時）
 * 釋放不再使用的元數據以減少 RAM 占用
 */
export function pruneOldFiles(maxFiles = 500) {
  if (fileList.length <= maxFiles) return;
  
  const toRemove = fileList.length - maxFiles;
  const startIdx = Math.floor(toRemove / 2); // 從中間開始移除
  
  for (let i = startIdx; i < startIdx + toRemove; i++) {
    if (fileIcons[i]) delete fileIcons[i];
    if (fileNotes[i]) delete fileNotes[i];
    if (fileMetadata[i]) delete fileMetadata[i];
  }
  
  // 重新索引
  const newList = fileList.slice();
  fileList = newList;
  
  const newIcons = {};
  const newNotes = {};
  const newMeta = {};
  
  Object.keys(fileIcons).forEach(k => {
    const idx = parseInt(k, 10);
    if (idx >= startIdx + toRemove) {
      newIcons[idx - toRemove] = fileIcons[k];
    }
  });
  
  Object.keys(fileNotes).forEach(k => {
    const idx = parseInt(k, 10);
    if (idx >= startIdx + toRemove) {
      newNotes[idx - toRemove] = fileNotes[k];
    }
  });
  
  Object.keys(fileMetadata).forEach(k => {
    const idx = parseInt(k, 10);
    if (idx >= startIdx + toRemove) {
      newMeta[idx - toRemove] = fileMetadata[k];
    }
  });
  
  fileIcons = newIcons;
  fileNotes = newNotes;
  fileMetadata = newMeta;
  
  if (currentIndex >= startIdx + toRemove) {
    currentIndex -= toRemove;
  }
}

export function setFileNote(index, note) {
  fileNotes[index] = note;
}

export function getFileNote(index) {
  return fileNotes[index] || '';
}

export function setFileMetadata(index, data) {
  fileMetadata[index] = data;
}

export function getFileMetadata(index) {
  return fileMetadata[index] || { date: '', time: '', latitude: '', longitude: '' };
}

// Return the number of files marked with the trash flag
export function getTrashFileCount() {
  return fileList.reduce((cnt, _f, idx) => {
    return (fileIcons[idx] && fileIcons[idx].trash) ? cnt + 1 : cnt;
  }, 0);
}

// Return an array of file names that are marked with the trash flag
export function getTrashFileNames() {
  return fileList.reduce((arr, file, idx) => {
    if (fileIcons[idx] && fileIcons[idx].trash) {
      arr.push(file.name);
    }
    return arr;
  }, []);
}

// Remove all files that are currently flagged as trash. Returns the number of
// removed files so that callers can decide how to update the UI.
export function clearTrashFiles() {
  if (fileList.length === 0) return 0;
  const prevFile = getCurrentFile();
  const newList = [];
  const newIcons = {};
  const newNotes = {};
  const newMetadata = {};

  fileList.forEach((file, idx) => {
    const icon = fileIcons[idx] || {};
    if (!icon.trash) {
      const newIndex = newList.length;
      newList.push(file);
      if (fileIcons[idx]) newIcons[newIndex] = { ...fileIcons[idx] };
      if (fileNotes[idx]) newNotes[newIndex] = fileNotes[idx];
      if (fileMetadata[idx]) newMetadata[newIndex] = fileMetadata[idx];
    }
  });

  const removed = fileList.length - newList.length;
  if (removed > 0) {
    fileList = newList;
    fileIcons = newIcons;
    fileNotes = newNotes;
    fileMetadata = newMetadata;
    if (prevFile) {
      currentIndex = newList.findIndex(f => f === prevFile);
    } else {
      currentIndex = -1;
    }
  }
  return removed;
}

// Remove files that match the given name from the current list. This also resets
// any stored icon or note state. The currentIndex will be set to -1 so that the
// caller can decide which file to load next.
export function removeFilesByName(name) {
  const filtered = fileList.filter(f => f.name !== name);
  if (filtered.length !== fileList.length) {
    fileList = filtered;
    currentIndex = -1;
    fileIcons = {};
    fileNotes = {};
    fileMetadata = {};
  }
}

// Time Expansion mode flag - when true, UI displays frequency values *10 and
// loading will allow longer files. Use the getters/setters below to control it.
let timeExpansionMode = false;

export function setTimeExpansionMode(state) {
  timeExpansionMode = !!state;
}

export function getTimeExpansionMode() {
  return !!timeExpansionMode;
}

export function toggleTimeExpansionMode() {
  timeExpansionMode = !timeExpansionMode;
  return timeExpansionMode;
}
