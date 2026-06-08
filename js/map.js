const MapModule = (() => {
  const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

  const CAMPINAS_CENTER = [-22.9064, -47.0616];
  const CAMPINAS_ZOOM = 12;

  const maps = {};

  function createMap(containerId, options = {}) {
    if (maps[containerId]) {
      maps[containerId].remove();
    }

    const map = L.map(containerId, {
      center: options.center || CAMPINAS_CENTER,
      zoom: options.zoom || CAMPINAS_ZOOM,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map);

    L.control.attribution({ prefix: false }).addTo(map);

    maps[containerId] = map;
    return map;
  }

  function getColor(pct, type = 'campo') {
    if (type === 'campo') {
      if (pct >= 25) return '#4C1D95';
      if (pct >= 18) return '#7C3AED';
      if (pct >= 12) return '#A78BFA';
      if (pct >= 7) return '#C4B5FD';
      return '#EDE9FE';
    }
    if (type === 'score') {
      if (pct >= 75) return '#14532D';
      if (pct >= 55) return '#1D4ED8';
      return '#92400E';
    }
    if (type === 'variacao') {
      if (pct > 5) return '#15803D';
      if (pct > 2) return '#4ADE80';
      if (pct > -2) return '#94A3B8';
      if (pct > -5) return '#F87171';
      return '#DC2626';
    }
    return '#7C3AED';
  }

  function renderChoropleth(map, geojson, data, valueKey, colorType, onEachFeature) {
    const dataMap = {};
    data.forEach(d => { dataMap[String(d.zona).padStart(4, '0')] = d; });

    const layer = L.geoJSON(geojson, {
      style(feature) {
        const zona = String(feature.properties.zona || feature.properties.NR_ZONA || '').padStart(4, '0');
        const d = dataMap[zona];
        const val = d ? d[valueKey] : null;
        return {
          fillColor: val != null ? getColor(val, colorType) : '#2D2D4E',
          fillOpacity: 0.75,
          color: '#ffffff',
          weight: 1,
          opacity: 0.4,
        };
      },
      onEachFeature: onEachFeature || null,
    });

    layer.addTo(map);
    return layer;
  }

  function renderPoints(map, points, onEachFeature) {
    const layer = L.geoJSON(points, {
      pointToLayer(feature, latlng) {
        const pct = feature.properties.campo_pct || 0;
        return L.circleMarker(latlng, {
          radius: 5,
          fillColor: getColor(pct, 'campo'),
          fillOpacity: 0.8,
          color: '#ffffff',
          weight: 1,
        });
      },
      onEachFeature: onEachFeature || null,
    });
    layer.addTo(map);
    return layer;
  }

  function renderLegend(map, items, title) {
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = () => {
      const div = L.DomUtil.create('div');
      div.style.cssText = 'background:rgba(28,27,46,0.9);padding:10px 14px;border-radius:8px;font-size:11px;color:#fff;line-height:1.8;min-width:120px;';
      div.innerHTML = `<div style="font-weight:600;margin-bottom:6px;font-size:11px;letter-spacing:.06em;text-transform:uppercase">${title}</div>`;
      items.forEach(({ color, label }) => {
        div.innerHTML += `<div style="display:flex;align-items:center;gap:6px"><span style="display:inline-block;width:12px;height:12px;background:${color};border-radius:2px;flex-shrink:0"></span>${label}</div>`;
      });
      return div;
    };
    legend.addTo(map);
    return legend;
  }

  function getLegendCampo() {
    return [
      { color: '#4C1D95', label: '≥ 25%' },
      { color: '#7C3AED', label: '18–25%' },
      { color: '#A78BFA', label: '12–18%' },
      { color: '#C4B5FD', label: '7–12%' },
      { color: '#EDE9FE', label: '< 7%' },
    ];
  }

  function getLegendScore() {
    return [
      { color: '#14532D', label: 'Consolidar (≥75)' },
      { color: '#1D4ED8', label: 'Crescer (55–74)' },
      { color: '#92400E', label: 'Prospectar (<55)' },
    ];
  }

  return { createMap, renderChoropleth, renderPoints, renderLegend, getLegendCampo, getLegendScore, getColor };
})();
