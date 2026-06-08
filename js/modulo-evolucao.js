const ModuloEvolucao = (() => {
  async function render(container, config) {
    const anos = config.anos_disponiveis;

    container.innerHTML = `
      <div class="page-header">
        <div class="page-title">Evolução Temporal</div>
        <div class="page-subtitle">O campo está crescendo? Onde avançamos ou perdemos?</div>
      </div>
      <div class="page-body">

        <div class="filters-bar">
          <div class="filter-group">
            <label class="filter-label">Comparar</label>
            <select class="filter-select" id="ev-ano-ini" style="min-width:90px"></select>
          </div>
          <span style="padding-top:20px;color:var(--texto-secundario)">→</span>
          <div class="filter-group">
            <label class="filter-label">&nbsp;</label>
            <select class="filter-select" id="ev-ano-fim" style="min-width:90px"></select>
          </div>
        </div>

        <div class="content-card" style="margin-bottom:20px">
          <div class="content-card-header">
            <span class="content-card-title">% do Campo Progressista em Campinas — Série Histórica</span>
          </div>
          <div class="content-card-body">
            <div class="chart-container-tall">
              <canvas id="chart-ev-serie"></canvas>
            </div>
          </div>
        </div>

        <div class="two-col" style="margin-bottom:20px">
          <div class="content-card">
            <div class="content-card-header">
              <span class="content-card-title">Variação por Zona (Δ Campo %)</span>
            </div>
            <div class="content-card-body">
              <div class="chart-container-tall">
                <canvas id="chart-ev-variacao"></canvas>
              </div>
            </div>
          </div>
          <div>
            <div class="content-card" style="margin-bottom:20px">
              <div class="content-card-header">
                <span class="content-card-title">Maior Crescimento</span>
              </div>
              <div class="content-card-body" id="ev-top-crescimento">
                <div class="loading-overlay"><div class="spinner"></div></div>
              </div>
            </div>
            <div class="content-card">
              <div class="content-card-header">
                <span class="content-card-title">Maior Queda</span>
              </div>
              <div class="content-card-body" id="ev-top-queda">
                <div class="loading-overlay"><div class="spinner"></div></div>
              </div>
            </div>
          </div>
        </div>

        <div class="content-card" style="margin-bottom:20px">
          <div class="content-card-header">
            <span class="content-card-title">Mapa — Variação do Campo Progressista</span>
          </div>
          <div style="padding:0">
            <div class="map-container" id="map-evolucao"></div>
          </div>
        </div>

        <div class="disclaimer">
          <span class="disclaimer-icon">⚠</span>
          <span>Os cruzamentos entre resultado eleitoral e perfil demográfico são correlações territoriais, não vínculos individuais. Use como orientação estratégica.</span>
        </div>
      </div>
    `;

    const selectIni = document.getElementById('ev-ano-ini');
    const selectFim = document.getElementById('ev-ano-fim');

    anos.forEach((ano, i) => {
      const o1 = document.createElement('option');
      o1.value = ano; o1.textContent = ano;
      if (i === 0) o1.selected = true;
      selectIni.appendChild(o1);

      const o2 = document.createElement('option');
      o2.value = ano; o2.textContent = ano;
      if (i === anos.length - 1) o2.selected = true;
      selectFim.appendChild(o2);
    });

    const MapInst = MapModule.createMap('map-evolucao');

    await loadAll(anos[0], anos[anos.length - 1], anos, MapInst);

    const reload = () => {
      const ini = parseInt(selectIni.value);
      const fim = parseInt(selectFim.value);
      if (ini >= fim) return;
      loadAll(ini, fim, anos, MapInst);
    };

    selectIni.addEventListener('change', reload);
    selectFim.addEventListener('change', reload);
  }

  async function loadAll(anoIni, anoFim, todos, map) {
    await Promise.all([
      renderSerie(todos),
      renderVariacao(anoIni, anoFim, map),
    ]);
  }

  async function renderSerie(anos) {
    const ctx = document.getElementById('chart-ev-serie');
    if (!ctx) return;

    try {
      const serie = await Utils.loadCSV('data/resultados/serie_historica_campo.csv');
      if (!serie.length) throw new Error('vazio');

      Charts.lineSerie(ctx, serie.map(d => String(d.ano)), [
        { label: '% Campo Progressista', data: serie.map(d => d.campo_pct || 0), color: '#7C3AED' },
        { label: 'Abstenção %', data: serie.map(d => d.abstencao_pct || 0), color: '#FACC15', borderDash: [4,4] },
      ], { pct: true });
    } catch {
      const pontos = [], pontosAbst = [];
      for (const ano of anos) {
        try {
          const dados = await Utils.loadCSV(`data/resultados/resultados_ze_${ano}.csv`);
          const tVotos = dados.reduce((s,d) => s + (d.votos_total||0), 0);
          const tCampo = dados.reduce((s,d) => s + (d.votos_campo||0), 0);
          const tEleit = dados.reduce((s,d) => s + (d.eleitores_aptos||0), 0);
          const tAbst = dados.reduce((s,d) => s + (d.abstencoes||0), 0);
          pontos.push(tVotos ? Number((tCampo/tVotos*100).toFixed(1)) : null);
          pontosAbst.push(tEleit ? Number((tAbst/tEleit*100).toFixed(1)) : null);
        } catch { pontos.push(null); pontosAbst.push(null); }
      }

      Charts.lineSerie(ctx, anos.map(String), [
        { label: '% Campo Progressista', data: pontos, color: '#7C3AED' },
        { label: 'Abstenção %', data: pontosAbst, color: '#FACC15', borderDash: [4,4] },
      ], { pct: true });
    }
  }

  async function renderVariacao(anoIni, anoFim, map) {
    const crescEl = document.getElementById('ev-top-crescimento');
    const quedaEl = document.getElementById('ev-top-queda');

    try {
      const [ini, fim] = await Promise.all([
        Utils.loadCSV(`data/resultados/resultados_ze_${anoIni}.csv`),
        Utils.loadCSV(`data/resultados/resultados_ze_${anoFim}.csv`),
      ]);

      const mapaIni = {}, mapaFim = {};
      ini.forEach(d => { mapaIni[String(d.zona).padStart(4,'0')] = d; });
      fim.forEach(d => { mapaFim[String(d.zona).padStart(4,'0')] = d; });

      const zonas = [...new Set([...Object.keys(mapaIni), ...Object.keys(mapaFim)])];
      const variacoes = zonas.map(zona => ({
        zona,
        delta: ((mapaFim[zona]?.campo_pct || 0) - (mapaIni[zona]?.campo_pct || 0)),
        fim: mapaFim[zona]?.campo_pct || 0,
        ini: mapaIni[zona]?.campo_pct || 0,
      })).filter(d => mapaIni[d.zona] && mapaFim[d.zona]);

      variacoes.sort((a, b) => b.delta - a.delta);

      const ctx = document.getElementById('chart-ev-variacao');
      if (ctx) {
        Charts.barGrouped(ctx,
          variacoes.map(d => `ZE ${d.zona}`),
          [{
            label: `Δ Campo ${anoIni}→${anoFim}`,
            data: variacoes.map(d => Number(d.delta.toFixed(1))),
            color: variacoes.map(d => d.delta >= 0 ? '#16a34a' : '#dc2626'),
          }],
          { pct: true }
        );
      }

      const topCresc = variacoes.slice(0, 3);
      const topQueda = variacoes.slice(-3).reverse();

      crescEl.innerHTML = topCresc.map(d => `
        <div class="ranking-item">
          <div class="ranking-info">
            <div class="ranking-zone">Zona ${d.zona}</div>
            <div class="ranking-meta">${anoIni}: ${Utils.fmtPct(d.ini)} → ${anoFim}: ${Utils.fmtPct(d.fim)}</div>
          </div>
          <span style="font-weight:600;color:#16a34a">+${d.delta.toFixed(1)}pp</span>
        </div>
      `).join('');

      quedaEl.innerHTML = topQueda.map(d => `
        <div class="ranking-item">
          <div class="ranking-info">
            <div class="ranking-zone">Zona ${d.zona}</div>
            <div class="ranking-meta">${anoIni}: ${Utils.fmtPct(d.ini)} → ${anoFim}: ${Utils.fmtPct(d.fim)}</div>
          </div>
          <span style="font-weight:600;color:#dc2626">${d.delta.toFixed(1)}pp</span>
        </div>
      `).join('');

      // Mapa de variação
      fetch('data/geo/zonas_campinas.geojson')
        .then(r => r.ok ? r.json() : null)
        .then(geojson => {
          if (!geojson) return;
          const dadosMap = variacoes.map(v => ({ zona: v.zona, campo_pct: v.delta }));
          MapModule.renderChoropleth(map, geojson, dadosMap, 'campo_pct', 'variacao', (feature, layer) => {
            const zona = String(feature.properties.zona || '').padStart(4,'0');
            const d = variacoes.find(v => v.zona === zona);
            if (d) layer.bindTooltip(`<strong>Zona ${zona}</strong><br>Δ ${d.delta.toFixed(1)}pp`);
          });
          MapModule.renderLegend(map, [
            { color: '#15803D', label: '> +5pp' },
            { color: '#4ADE80', label: '+2 a +5pp' },
            { color: '#94A3B8', label: '-2 a +2pp' },
            { color: '#F87171', label: '-5 a -2pp' },
            { color: '#DC2626', label: '< -5pp' },
          ], 'Variação');
        })
        .catch(() => {});

    } catch {
      crescEl.innerHTML = `<div style="color:var(--texto-secundario);font-size:13px;padding:8px">Dados não disponíveis para ${anoIni}.</div>`;
      quedaEl.innerHTML = crescEl.innerHTML;
    }
  }

  return { render };
})();
