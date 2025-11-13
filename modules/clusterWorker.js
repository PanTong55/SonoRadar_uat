// Simple clustering Web Worker (grid-based) PoC
// Receives points and answers getClusters requests using pixel-grid clustering

let points = []; // [{id, lat, lon, props}]

function lonLatToPoint(lon, lat, zoom) {
  // Web Mercator projection to pixel coordinates at given zoom
  const TILE_SIZE = 256;
  const world = TILE_SIZE * Math.pow(2, zoom);
  const x = (lon + 180) / 360 * world;
  const sinLat = Math.sin(lat * Math.PI / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * world;
  return { x, y };
}

onmessage = function (e) {
  const msg = e.data || {};
  try {
    if (msg.type === 'init') {
      points = (msg.points || []).map(p => ({ id: p.id, lat: p.lat, lon: p.lon, props: p.props || {} }));
      postMessage({ type: 'ready' });
    } else if (msg.type === 'setPoints') {
      points = (msg.points || []).map(p => ({ id: p.id, lat: p.lat, lon: p.lon, props: p.props || {} }));
      postMessage({ type: 'ready' });
    } else if (msg.type === 'getClusters') {
      const { bbox, zoom, radiusPx = 60, limit = 500 } = msg;
      const [west, south, east, north] = bbox; // lon/lat
      // filter points in bbox (approx)
      const candidates = points.filter(p => p.lon >= west && p.lon <= east && p.lat >= south && p.lat <= north);
      const world = 256 * Math.pow(2, zoom);
      const cells = new Map();
      const pxToLon = null;
      // cluster by pixel grid
      candidates.forEach(p => {
        const pt = lonLatToPoint(p.lon, p.lat, zoom);
        const cx = Math.floor(pt.x / radiusPx);
        const cy = Math.floor(pt.y / radiusPx);
        const key = cx + '_' + cy;
        let arr = cells.get(key);
        if (!arr) { arr = []; cells.set(key, arr); }
        arr.push({ p, pt });
      });

      let clusters = [];
      cells.forEach((arr, key) => {
        if (arr.length === 1) {
          const single = arr[0];
          clusters.push({
            id: single.p.id,
            type: 'point',
            geometry: [single.p.lon, single.p.lat],
            properties: single.p.props || {}
          });
        } else {
          // aggregate
          let sumX = 0, sumY = 0;
          arr.forEach(it => { sumX += it.pt.x; sumY += it.pt.y; });
          const centerX = sumX / arr.length;
          const centerY = sumY / arr.length;
          // convert back to lon/lat approximation
          const worldSize = 256 * Math.pow(2, zoom);
          const lon = (centerX / worldSize) * 360 - 180;
          const n = Math.PI - 2 * Math.PI * (centerY / worldSize);
          const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
          clusters.push({
            id: key,
            type: 'cluster',
            geometry: [lon, lat],
            properties: { point_count: arr.length, ids: arr.map(a => a.p.id) }
          });
        }
      });

      // simple limiting: if too many visible points/clusters, increase effective radius by returning fewer clusters
      if (clusters.length > limit) {
        // increase radius and re-cluster by doubling radius until under limit or max 8x
        let factor = 2;
        let newClusters = clusters;
        while (newClusters.length > limit && factor <= 8) {
          const newCells = new Map();
          candidates.forEach(p => {
            const pt = lonLatToPoint(p.lon, p.lat, zoom);
            const cx = Math.floor(pt.x / (radiusPx * factor));
            const cy = Math.floor(pt.y / (radiusPx * factor));
            const key = cx + '_' + cy;
            let arr = newCells.get(key);
            if (!arr) { arr = []; newCells.set(key, arr); }
            arr.push({ p, pt });
          });
          newClusters = [];
          newCells.forEach((arr, key) => {
            if (arr.length === 1) {
              const single = arr[0];
              newClusters.push({ id: single.p.id, type: 'point', geometry: [single.p.lon, single.p.lat], properties: single.p.props || {} });
            } else {
              let sumX = 0, sumY = 0;
              arr.forEach(it => { sumX += it.pt.x; sumY += it.pt.y; });
              const centerX = sumX / arr.length;
              const centerY = sumY / arr.length;
              const worldSize = 256 * Math.pow(2, zoom);
              const lon = (centerX / worldSize) * 360 - 180;
              const n = Math.PI - 2 * Math.PI * (centerY / worldSize);
              const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
              newClusters.push({ id: key, type: 'cluster', geometry: [lon, lat], properties: { point_count: arr.length, ids: arr.map(a => a.p.id) } });
            }
          });
          clusters = newClusters;
          factor *= 2;
        }
      }

      postMessage({ type: 'clusters', zoom, clusters });
    }
  } catch (err) {
    postMessage({ type: 'error', message: String(err) });
  }
};
