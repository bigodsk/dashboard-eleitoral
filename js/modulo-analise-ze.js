const ModuloAnaliseZE = (() => {
  const DISCLAIMER = `Os dados de perfil demográfico são por zona eleitoral, não por eleitor individual. Use como indicador territorial.`;

  async function render(container, config) {
    const anos = config.anos_disponiveis;
    const anoDefault = anos[anos.length - 1];

    container.innerHTML = `
      <div class="page-header">
        <div class="page-title">Análise por Zona Eleitoral</div>
        <div class="page-subtitle">Vale investir nessa zona? O que a caracteriza?</div>
      </div>
      <div class="page-body">
        <div class="filters-bar">
          <div class="filter-group">
            <label class="filter-label">Zona Eleitoral</label>
            <select class="filter-select" id="ze-select" style="min-width:160px">
              <option>Carregando...</option>
            </select>
          </div>
        </div>

        <div class="ze-layout" style="margin-bottom:20px">
          <div>
            <div class="content-card">
              <div class="content-card-header">
                <span class="content-card-title">Seções Eleitorais</span>
              </div>
              <div style="padding:0">
                <div class="map-container" id="map-ze"></div>
              </div>
            </div>
          </div>
          <div class="ze-panel" id="ze-info-panel">
            <div class="loading-overlay"><div class="spinner"></div></div>
          </div>
        </div>

        <div class="two-col" style="margin-bottom:20px">
          <div class="content-card">
            <div class="content-card-header">
              <span class="content-card-title">Histórico — % Campo Progressista</span>
            </div>
            <div class="content-card-body">
              <div class="chart-container">
                <canvas id="chart-ze-historico"></canvas>
              </div>
            </div>
          </div>
          <div class="content-card">
            <div class="content-card-header">
              <span class="content-card-title">Perfil do Eleitorado</span>
            </div>
            <div class="content-card-body">
              <div class="chart-container">
                <canvas id="chart-ze-perfil"></canvas>
              </div>
            </div>
          </div>
        </div>

        <div class="disclaimer">
          <span class="disclaimer-icon">⚠</span>
          <span>${DISCLAIMER}</span>
        </div>
      </div>
    `;

    const [scores, dadosAno] = await Promise.all([
      Utils.loadCSV('data/resultados/scores_ze.csv').catch(() => []),
      Utils.loadCSV(`data/resultados/resultados_ze_${anoDefault}.csv`).catch(() => []),
    ]);

    const zonas = dadosAno.length > 0
      ? [...new Set(dadosAno.map(d => String(d.zona).padStart(4,'0')))].sort()
      : [];

    const select = document.getElementById('ze-select');
    select.innerHTML = zonas.map(z => `<option value="${z}">Zona ${z}</option>`).join('');

    const MapInst = MapModule.createMap('map-ze');

    async function loadZona(zona) {
      await renderInfo(zona, dadosAno, scores);
      await renderHistorico(zona, config.anos_disponiveis);
      await renderPerfilZE(zona);
      await renderMapaZE(MapInst, zona, config.anos_disponiveis[config.anos_disponiveis.length - 1]);
    }

    if (zonas.length > 0) {
      await loadZona(zonas[0]);
      select.addEventListener('change', () => loadZona(select.value));
    } else {
      document.getElementById('ze-info-panel').innerHTML = `<div style="color:var(--texto-secundario);font-size:13px">Dados não disponíveis. Execute o ETL.</div>`;
    }
  }

  async function renderInfo(zona, dadosAno, scores) {
    const panel = document.getElementById('ze-info-panel');
    const d = dadosAno.find(x => String(x.zona).padStart(4,'0') === zona);
    const sc = scores.find(x => String(x.zona).padStart(4,'0') === zona);

    if (!d) {
      panel.innerHTML = `<div class="ze-panel-title">Zona ${zona}</div><div class="ze-panel-sub">Dados não disponíveis</div>`;
      return;
    }

    const cls = sc?.classificacao || 'Prospectar';
    const just = sc?.justificativa || '—';

    panel.innerHTML = `
      <div class="ze-panel-title">Zona Eleitoral ${zona}</div>
      <div class="ze-panel-sub">Campinas · SP</div>
      ${Utils.badgeHTML(cls)}
      <div class="ze-stats" style="margin-top:14px">
        <div class="ze-stat">
          <div class="ze-stat-label">Eleitores</div>
          <div class="ze-stat-value">${Utils.fmt(d.eleitores_aptos)}</div>
        </div>
        <div class="ze-stat">
          <div class="ze-stat-label">% Campo</div>
          <div class="ze-stat-value">${Utils.fmtPct(d.campo_pct)}</div>
        </div>
        <div class="ze-stat">
          <div class="ze-stat-label">Abstenção</div>
          <div class="ze-stat-value">${Utils.fmtPct(d.abstencao_pct)}</div>
        </div>
        <div class="ze-stat">
          <div class="ze-stat-label">Score</div>
          <div class="ze-stat-value">${sc ? sc.score : '—'}</div>
        </div>
      </div>
      <div class="ze-justificativa">${just}</div>
    `;
  }

  async function renderHistorico(zona, anos) {
    const ctx = document.getElementById('chart-ze-historico');
    if (!ctx) return;

    const pontos = [];
    const pontosMedia = [];

    for (const ano of anos) {
      try {
        const dados = await Utils.loadCSV(`data/resultados/resultados_ze_${ano}.csv`);
        const d = dados.find(x => String(x.zona).padStart(4,'0') === zona);
        const mediaTotal = dados.length > 0
          ? dados.reduce((s,x) => s + (x.campo_pct||0), 0) / dados.length
          : null;
        pontos.push(d ? (d.campo_pct || 0) : null);
        pontosMedia.push(mediaTotal ? Number(mediaTotal.toFixed(1)) : null);
      } catch { pontos.push(null); pontosMedia.push(null); }
    }

    Charts.lineSerie(ctx, anos.map(String), [
      { label: `Zona ${zona}`, data: pontos, color: '#7C3AED' },
      { label: 'Média Campinas', data: pontosMedia, color: '#FACC15', borderDash: [4, 4] },
    ], { pct: true });
  }

  async function renderPerfilZE(zona) {
    const ctx = document.getElementById('chart-ze-perfil');
    if (!ctx) return;

    try {
      const perfil = await Utils.loadCSV('data/perfil/perfil_ze.csv');
      const d = perfil.find(x => String(x.zona).padStart(4,'0') === zona);

      if (!d) {
        ctx.parentElement.innerHTML = `<div class="loading-overlay" style="height:200px">Perfil não disponível. Execute o ETL.</div>`;
        return;
      }

      const labels = [];
      const values = [];
      Object.entries(d).forEach(([k, v]) => {
        if (k.startsWith('pct_') && !k.includes('jovens')) {
          labels.push(k.replace('pct_', '').replace(/_/g, ' '));
          values.push(Number(v) || 0);
        }
      });

      Charts.horizontalBar(ctx, labels, values, '#A78BFA');
    } catch {
      ctx.parentElement.innerHTML = `<div class="loading-overlay" style="height:200px">Perfil não disponível. Execute o ETL.</div>`;
    }
  }

  async function renderMapaZE(map, zona, ano) {
    try {
      const secoes = await Utils.loadJSON('data/geo/secoes_geo.geojson');
      const dados = await Utils.loadCSV(`data/resultados/resultados_secoes_${ano}.csv`).catch(() => []);
      const dadosMap = {};
      dados.forEach(d => {
        const k = `${String(d.zona).padStart(4,'0')}_${String(d.secao).padStart(4,'0')}`;
        dadosMap[k] = d;
      });

      const filtrado = {
        type: 'FeatureCollection',
        features: secoes.features.filter(f =>
          String(f.properties.NR_ZONA || '').padStart(4,'0') === zona
        ),
      };

      if (filtrado.features.length === 0) return;

      MapModule.renderPoints(map, filtrado, (feature, layer) => {
        const z = String(feature.properties.NR_ZONA || '').padStart(4,'0');
        const s = String(feature.properties.NR_SECAO || '').padStart(4,'0');
        const d = dadosMap[`${z}_${s}`];
        const tooltip = d
          ? `<strong>Seção ${s}</strong><br>${Utils.fmtPct(d.campo_pct)} campo`
          : `Seção ${s}`;
        layer.bindTooltip(tooltip);
      });

      const bounds = L.geoJSON(filtrado).getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
    } catch {}
  }

  return { render };
})();
