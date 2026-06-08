const ModuloVisaoGeral = (() => {
  const DISCLAIMER = `Os cruzamentos entre resultado eleitoral e perfil demográfico são correlações por território (zona/seção eleitoral), não vínculos individuais. O TSE não divulga para quem cada eleitor votou. Use como orientação estratégica.`;

  async function render(container, config) {
    const anos = config.anos_disponiveis;
    const anoDefault = anos[anos.length - 1];

    container.innerHTML = `
      <div class="page-header">
        <div class="page-title">Visão Geral</div>
        <div class="page-subtitle">Como está o campo progressista em Campinas?</div>
      </div>
      <div class="page-body">
        <div class="filters-bar">
          <div class="filter-group">
            <label class="filter-label">Eleição</label>
            <select class="filter-select" id="vg-ano"></select>
          </div>
          <div class="filter-group">
            <label class="filter-label">Partido</label>
            <div class="filter-chips" id="vg-chips"></div>
          </div>
        </div>

        <div class="metrics-grid" id="vg-metrics">
          <div class="metric-card"><div class="spinner" style="margin:12px auto"></div></div>
        </div>

        <div class="two-col" style="margin-bottom:20px">
          <div>
            <div class="content-card">
              <div class="content-card-header">
                <span class="content-card-title">Zonas Eleitorais — % Campo Progressista</span>
              </div>
              <div style="padding:0">
                <div class="map-container" id="map-visao-geral"></div>
              </div>
            </div>
          </div>
          <div>
            <div class="content-card">
              <div class="content-card-header">
                <span class="content-card-title">Top 5 Zonas Prioritárias</span>
              </div>
              <div class="content-card-body">
                <ul class="ranking-list" id="vg-ranking">
                  <div class="loading-overlay"><div class="spinner"></div></div>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div class="content-card" style="margin-bottom:20px">
          <div class="content-card-header">
            <span class="content-card-title">Distribuição por Zona Eleitoral</span>
          </div>
          <div class="content-card-body">
            <div class="chart-container">
              <canvas id="chart-ze-barras"></canvas>
            </div>
          </div>
        </div>

        <div class="disclaimer">
          <span class="disclaimer-icon">⚠</span>
          <span>${DISCLAIMER}</span>
        </div>
      </div>
    `;

    Filters.buildAnoSelect('vg-ano', anos, anoDefault);
    Filters.buildPartidoChips('vg-chips', config.campo_progressista, config.campo_progressista);

    await loadData(anoDefault, config);

    Filters.on('change:ano', ano => loadData(ano, config));
    Filters.on('change:partidos', () => loadData(Filters.get('ano'), config));
  }

  async function loadData(ano, config) {
    const metricsEl = document.getElementById('vg-metrics');
    const rankingEl = document.getElementById('vg-ranking');

    try {
      const dados = await Utils.loadCSV(`data/resultados/resultados_ze_${ano}.csv`);

      if (!dados || dados.length === 0) {
        metricsEl.innerHTML = `<div class="metric-card"><div class="metric-label">Dados não disponíveis</div><div class="metric-value" style="font-size:14px">Execute o ETL para carregar os dados de ${ano}</div></div>`;
        return;
      }

      const totalEleitores = dados.reduce((s, d) => s + (d.eleitores_aptos || 0), 0);
      const totalVotosCampo = dados.reduce((s, d) => s + (d.votos_campo || 0), 0);
      const totalVotos = dados.reduce((s, d) => s + (d.votos_total || 0), 0);
      const campoPct = totalVotos > 0 ? (totalVotosCampo / totalVotos * 100) : 0;
      const abstencaoMedia = dados.reduce((s, d) => s + (d.abstencao_pct || 0), 0) / dados.length;

      let scores = null;
      try { scores = await Utils.loadCSV('data/resultados/scores_ze.csv'); } catch {}
      const zonasPrioritarias = scores ? scores.filter(s => s.classificacao === 'Crescer' || s.classificacao === 'Consolidar').length : '—';

      metricsEl.innerHTML = `
        <div class="metric-card">
          <div class="metric-label">Total de Eleitores</div>
          <div class="metric-value">${Utils.fmt(totalEleitores)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Campo Progressista</div>
          <div class="metric-value">${Utils.fmtPct(campoPct)}</div>
          <div class="metric-label" style="margin-top:4px">dos votos nominais</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Abstenção Média</div>
          <div class="metric-value">${Utils.fmtPct(abstencaoMedia)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Zonas Prioritárias</div>
          <div class="metric-value">${typeof zonasPrioritarias === 'number' ? Utils.fmt(zonasPrioritarias) : zonasPrioritarias}</div>
          <div class="metric-label" style="margin-top:4px">Consolidar + Crescer</div>
        </div>
      `;

      renderRanking(rankingEl, dados, scores);
      renderBarras(dados);
      renderMapa(dados, config);

    } catch (err) {
      metricsEl.innerHTML = `<div class="metric-card"><div class="metric-label" style="color:#dc2626">Dados não encontrados para ${ano}</div><div class="metric-value" style="font-size:13px;color:#6B7280">Execute o pipeline ETL primeiro.</div></div>`;
      rankingEl.innerHTML = '';
    }
  }

  function renderRanking(el, dados, scores) {
    const scoreMap = {};
    if (scores) scores.forEach(s => { scoreMap[String(s.zona).padStart(4,'0')] = s; });

    const sorted = [...dados]
      .map(d => ({ ...d, score: scoreMap[String(d.zona).padStart(4,'0')]?.score ?? d.campo_pct ?? 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    el.innerHTML = sorted.map((d, i) => {
      const cls = scoreMap[String(d.zona).padStart(4,'0')]?.classificacao || 'Prospectar';
      return `
        <li class="ranking-item">
          <div class="ranking-pos ${i < 3 ? 'top' : ''}">${i + 1}</div>
          <div class="ranking-info">
            <div class="ranking-zone">Zona ${String(d.zona).padStart(4,'0')}</div>
            <div class="ranking-meta">${Utils.fmtPct(d.campo_pct)} campo · ${Utils.fmt(d.eleitores_aptos)} eleitores</div>
          </div>
          ${Utils.badgeHTML(cls)}
        </li>
      `;
    }).join('');
  }

  function renderBarras(dados) {
    const ctx = document.getElementById('chart-ze-barras');
    if (!ctx) return;

    const sorted = [...dados].sort((a, b) => (b.campo_pct || 0) - (a.campo_pct || 0));
    const labels = sorted.map(d => `ZE ${String(d.zona).padStart(4,'0')}`);
    const values = sorted.map(d => d.campo_pct || 0);

    Charts.barGrouped(ctx, labels, [{ label: '% Campo', data: values, color: '#7C3AED' }], { pct: true });
  }

  function renderMapa(dados, config) {
    const map = MapModule.createMap('map-visao-geral');

    // Tenta carregar GeoJSON das ZEs; se não existir, plota círculos por centroide
    fetch('data/geo/zonas_campinas.geojson')
      .then(r => r.ok ? r.json() : null)
      .then(geojson => {
        if (geojson) {
          MapModule.renderChoropleth(map, geojson, dados, 'campo_pct', 'campo', (feature, layer) => {
            const zona = String(feature.properties.zona || '').padStart(4, '0');
            const d = dados.find(x => String(x.zona).padStart(4,'0') === zona);
            if (d) {
              layer.bindTooltip(`<strong>Zona ${zona}</strong><br>${Utils.fmtPct(d.campo_pct)} campo<br>${Utils.fmt(d.eleitores_aptos)} eleitores`);
            }
          });
          MapModule.renderLegend(map, MapModule.getLegendCampo(), '% Campo');
        } else {
          const noDataMsg = L.control({ position: 'topright' });
          noDataMsg.onAdd = () => {
            const div = L.DomUtil.create('div');
            div.style.cssText = 'background:rgba(28,27,46,0.85);padding:10px 14px;border-radius:8px;font-size:11px;color:#A78BFA;max-width:180px;line-height:1.5;';
            div.innerHTML = 'GeoJSON das ZEs não encontrado.<br>Execute o ETL completo para habilitar o mapa coroplético.';
            return div;
          };
          noDataMsg.addTo(map);
        }
      })
      .catch(() => {});
  }

  return { render };
})();
