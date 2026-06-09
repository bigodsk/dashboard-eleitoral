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
                <span class="content-card-title" id="vg-map-title">Zonas Eleitorais — % Campo Progressista</span>
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
            <span class="content-card-title" id="vg-chart-title">Distribuição por Zona Eleitoral</span>
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

    const partidosSel = Filters.get('partidos');
    const isCampoTotal = !partidosSel || partidosSel.length === 0;
    const partidoFoco = isCampoTotal ? null : partidosSel[0];
    const tipoEleicao = Filters.tipoEleicao(ano);

    // Base: resultados agregados por zona (eleitores, votos_total, campo_pct)
    let dadosBase;
    try {
      dadosBase = await Utils.loadCSV(`data/resultados/resultados_ze_${ano}.csv`);
    } catch (err) {
      metricsEl.innerHTML = `<div class="metric-card"><div class="metric-label" style="color:#dc2626">Arquivo não encontrado para ${ano}</div><div class="metric-value" style="font-size:13px;color:#6B7280">${err.message}</div></div>`;
      rankingEl.innerHTML = '';
      return;
    }

    if (!dadosBase || dadosBase.length === 0) {
      metricsEl.innerHTML = `<div class="metric-card"><div class="metric-label">Dados não disponíveis</div><div class="metric-value" style="font-size:14px">Execute o ETL para carregar dados de ${ano}</div></div>`;
      return;
    }

    // Filtragem por partido específico
    let dados = dadosBase;
    let labelFoco = 'Campo Progressista';

    if (partidoFoco) {
      let partidoData = null;
      try { partidoData = await Utils.loadCSV(`data/resultados/votos_partido_ze_${ano}.csv`); } catch (_) {}

      if (partidoData && partidoData.length > 0) {
        // votos_partido_ze: zona, partido, votos, ano
        const votosPorZona = {};
        partidoData
          .filter(d => String(d.partido).toUpperCase() === partidoFoco.toUpperCase())
          .forEach(d => {
            const z = String(d.zona).padStart(4, '0');
            votosPorZona[z] = (votosPorZona[z] || 0) + (d.votos || 0);
          });

        dados = dadosBase.map(base => {
          const z = String(base.zona).padStart(4, '0');
          const vp = votosPorZona[z] || 0;
          const pct = base.votos_total > 0 ? Math.round(vp / base.votos_total * 10000) / 100 : 0;
          return { ...base, votos_campo: vp, campo_pct: pct };
        });
        labelFoco = partidoFoco;
      }
    }

    // Métricas agregadas
    const totalEleitores = dadosBase.reduce((s, d) => s + (d.eleitores_aptos || 0), 0);
    const totalVotosFoco = dados.reduce((s, d) => s + (d.votos_campo || 0), 0);
    const totalVotos = dadosBase.reduce((s, d) => s + (d.votos_total || 0), 0);
    const focoPct = totalVotos > 0 ? (totalVotosFoco / totalVotos * 100) : 0;

    let scores = null;
    try { scores = await Utils.loadCSV('data/resultados/scores_ze.csv'); } catch (_) {}
    const zonasPrioritarias = scores
      ? scores.filter(s => s.classificacao === 'Crescer' || s.classificacao === 'Consolidar').length
      : '—';

    metricsEl.innerHTML = `
      <div class="metric-card">
        <div class="metric-label">Total de Eleitores</div>
        <div class="metric-value">${Utils.fmt(totalEleitores)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">${labelFoco}</div>
        <div class="metric-value">${Utils.fmtPct(focoPct)}</div>
        <div class="metric-label" style="margin-top:4px">${tipoEleicao ? `votos — ${tipoEleicao}` : 'dos votos nominais'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Abstenção Média</div>
        <div class="metric-value" style="font-size:${isCampoTotal ? '2rem' : '1.1rem'}">sem dado</div>
        <div class="metric-label" style="margin-top:4px">não disponível no TSE</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Zonas Prioritárias</div>
        <div class="metric-value">${typeof zonasPrioritarias === 'number' ? Utils.fmt(zonasPrioritarias) : zonasPrioritarias}</div>
        <div class="metric-label" style="margin-top:4px">Consolidar + Crescer</div>
      </div>
    `;

    // Atualiza títulos das seções conforme filtro ativo
    const mapTitle = document.getElementById('vg-map-title');
    const chartTitle = document.getElementById('vg-chart-title');
    if (mapTitle) mapTitle.textContent = `Zonas Eleitorais — % ${labelFoco}`;
    if (chartTitle) chartTitle.textContent = `Distribuição por Zona Eleitoral — ${labelFoco} ${ano}`;

    try { renderRanking(rankingEl, dados, scores, labelFoco); } catch (_) {}
    try { renderBarras(dados, labelFoco); } catch (_) {}
    try { renderMapa(dados, config); } catch (_) {}
  }

  function renderRanking(el, dados, scores, labelFoco) {
    const scoreMap = {};
    if (scores) scores.forEach(s => { scoreMap[String(s.zona).padStart(4,'0')] = s; });

    const sorted = [...dados]
      .map(d => ({ ...d, _sort: scoreMap[String(d.zona).padStart(4,'0')]?.score ?? d.campo_pct ?? 0 }))
      .sort((a, b) => b._sort - a._sort)
      .slice(0, 5);

    el.innerHTML = sorted.map((d, i) => {
      const cls = scoreMap[String(d.zona).padStart(4,'0')]?.classificacao || 'Prospectar';
      return `
        <li class="ranking-item">
          <div class="ranking-pos ${i < 3 ? 'top' : ''}">${i + 1}</div>
          <div class="ranking-info">
            <div class="ranking-zone">Zona ${String(d.zona).padStart(4,'0')}</div>
            <div class="ranking-meta">${Utils.fmtPct(d.campo_pct)} ${labelFoco} · ${Utils.fmt(d.eleitores_aptos)} eleitores</div>
          </div>
          ${Utils.badgeHTML(cls)}
        </li>
      `;
    }).join('');
  }

  function renderBarras(dados, labelFoco) {
    const ctx = document.getElementById('chart-ze-barras');
    if (!ctx) return;

    const sorted = [...dados].sort((a, b) => (b.campo_pct || 0) - (a.campo_pct || 0));
    const labels = sorted.map(d => `ZE ${String(d.zona).padStart(4,'0')}`);
    const values = sorted.map(d => +(d.campo_pct || 0).toFixed(2));

    Charts.barGrouped(ctx, labels, [{ label: `% ${labelFoco}`, data: values, color: '#7C3AED' }], { pct: true });
  }

  function renderMapa(dados, config) {
    const map = MapModule.createMap('map-visao-geral');
    // Força recalculo de tamanho após inserção no DOM (fix tiles brancos)
    setTimeout(() => map.invalidateSize(), 100);

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
          // Sem GeoJSON: plota pontos a partir do secoes_geo se disponível
          fetch('data/geo/secoes_geo.geojson')
            .then(r => r.ok ? r.json() : null)
            .then(pts => {
              if (pts) {
                MapModule.renderPoints(map, pts);
              }
              // Mensagem de aviso
              const ctrl = L.control({ position: 'topright' });
              ctrl.onAdd = () => {
                const div = L.DomUtil.create('div');
                div.style.cssText = 'background:rgba(28,27,46,0.85);padding:10px 14px;border-radius:8px;font-size:11px;color:#A78BFA;max-width:200px;line-height:1.5;';
                div.innerHTML = pts
                  ? 'Seções eleitorais plotadas. Para mapa coroplético por zona obtenha o shapefile das ZEs.'
                  : 'GeoJSON das zonas não disponível.';
                return div;
              };
              ctrl.addTo(map);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }

  return { render };
})();
