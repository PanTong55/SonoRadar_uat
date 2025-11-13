// ClusterController - main thread controller for clustering PoC
// Uses modules/clusterWorker.js as a Web Worker. Provides simple API:
// init(points), setPoints(points), query(bbox, zoom)

export function ClusterController(map, opts = {}) {
  const options = Object.assign({ radiusPx: 60, maxVisible: 500, debounceMs: 120 }, opts);
  let worker = null;
  let ready = false;
  let lastRequestId = 0;
  let onClusters = options.onClusters || function () {};

  function initWorker() {
    if (worker) worker.terminate();
    worker = new Worker(new URL('./clusterWorker.js', import.meta.url));
    worker.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.type === 'ready') {
        ready = true;
      } else if (msg.type === 'clusters') {
        onClusters(msg.clusters || [], msg.zoom);
      } else if (msg.type === 'error') {
        console.error('cluster worker error:', msg.message);
      }
    };
  }

  initWorker();

  function init(points) {
    if (!worker) initWorker();
    worker.postMessage({ type: 'setPoints', points });
  }

  function setPoints(points) {
    if (!worker) initWorker();
    worker.postMessage({ type: 'setPoints', points });
  }

  // Debounced query
  let queryTimer = null;
  function query(bbox, zoom) {
    if (!worker) initWorker();
    lastRequestId++;
    const reqId = lastRequestId;
    if (queryTimer) clearTimeout(queryTimer);
    queryTimer = setTimeout(() => {
      queryTimer = null;
      const msg = { type: 'getClusters', bbox, zoom, radiusPx: options.radiusPx, limit: options.maxVisible };
      try { worker.postMessage(msg); } catch (e) {}
    }, options.debounceMs);
  }

  function destroy() {
    if (worker) {
      worker.terminate();
      worker = null;
      ready = false;
    }
  }

  return { init, setPoints, query, destroy, setOnClusters(cb) { onClusters = cb; } };
}
