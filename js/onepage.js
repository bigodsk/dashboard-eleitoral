const OnePage = (() => {
  async function render(container, config) {
    container.innerHTML = `
      <div class="op-section-title">Resumo da campanha · Eleições 2022</div>

      <div class="metrics-grid" id="op-metrics" style="margin-bottom:24px">
        <div class="metric-card"><div class="spinner" style="margin:8px auto"></div></div>
        <div class="metric-card"></div>
        <div class="metric-card"></div>
        <div class="metric-card"></div>
      </div>

      <div class="op-map-layout" style="margin-bottom:24px">
        <div class="content-card" style="overflow:hidden">
          <div class="content-card-header">
            <span class="content-card-title">Mapa de Calor — Votos Ediane Maria (2022)</span>
            <span style="font-size:11px;color:var(--texto-secundario)">intensidade = votos no local de votação</span>
          </div>
          <div class="map-container-report">
            <div id="op-map"></div>
          </div>
        </div>

        <div class="content-card">
          <div class="content-card-header">
            <span class="content-card-title">Zonas Prioritárias</span>
          </div>
          <div class="content-card-body" id="op-prioridade" style="padding:0">
            <div class="loading-overlay"><div class="spinner"></div></div>
          </div>
        </div>
      </div>

      <div class="content-card" style="margin-bottom:24px">
        <div class="content-card-header">
          <span class="content-card-title">Votos por Zona Eleitoral</span>
          <span style="font-size:11px;color:var(--texto-secundario)">Ediane 2022 (Dep.Est.) × Thamy 2024 (Vereadora)</span>
        </div>
        <div class="content-card-body">
          <div class="chart-container-tall">
            <canvas id="op-chart-zonas"></canvas>
          </div>
        </div>
      </div>

      <div class="three-col" style="margin-bottom:24px">
        <div class="content-card">
          <div class="content-card-header">
            <span class="content-card-title">Sexo dos Eleitores</span>
          </div>
          <div class="content-card-body">
            <div class="chart-container"><canvas id="op-chart-sexo"></canvas></div>
          </div>
        </div>
        <div class="content-card">
          <div class="content-card-header">
            <span class="content-card-title">% Jovens 16–34 por Zona</span>
          </div>
          <div class="content-card-body">
            <div class="chart-container"><canvas id="op-chart-jovens"></canvas></div>
          </div>
        </div>
        <div class="content-card">
          <div class="content-card-header">
            <span class="content-card-title">Escolaridade — Campinas</span>
          </div>
          <div class="content-card-body">
            <div class="chart-container"><canvas id="op-chart-esc"></canvas></div>
          </div>
        </div>
      </div>

      <div class="disclaimer">
        <span class="disclaimer-icon">⚠</span>
        <span>Análise por território (zona/seção eleitoral). Correlações geográficas — o TSE não divulga para quem cada eleitor votou. Use como orientação estratégica.</span>
      </div>
    `;

    await Promise.all([
      _renderMetrics(config),
      _renderPrioridade(),
      _renderZonasChart(),
      _renderPerfil(),
    ]);

    _renderMapa();
  }

  // ── Métricas ─────────────────────────────────────────────
  async function _renderMetrics(config) {
    const el = document.getElementById('op-metrics');
    if (!el) return;
    try {
      const [res22, nom22, scores, perfil] = await Promise.all([
        Utils.loadCSV('data/resultados/resultados_ze_2022.csv').catch(() => []),
        Utils.loadCSV('data/resultados/votos_nominais_ze_2022.csv').catch(() => []),
        Utils.loadCSV('data/resultados/scores_ze.csv').catch(() => []),
        Utils.loadCSV('data/perfil/perfil_campinas_geral.csv').catch(() => []),
      ]);

      const totalEleit = res22.reduce((s, d) => s + (Number(d.eleitores_aptos) || 0), 0);
      const totalVotos = res22.reduce((s, d) => s + (Number(d.votos_total) || 0), 0);
      const campoCampo = res22.reduce((s, d) => s + (Number(d.votos_campo) || 0), 0);
      const campoPct   = totalVotos ? (campoCampo / totalVotos * 100).toFixed(1) : '—';

      const votosEdiane = nom22
        .filter(d => String(d.nr_candidato).trim() === '50110')
        .reduce((s, d) => s + (Number(d.votos) || 0), 0);

      const zonasPrior = scores
        .filter(s => s.classificacao === 'Crescer' || s.classificacao === 'Consolidar').length;

      el.innerHTML = `
        <div class="metric-card">
          <div class="metric-label">Eleitores Aptos 2022</div>
          <div class="metric-value">${Utils.fmt(totalEleit)}</div>
          <div class="metric-label" style="margin-top:4px">Campinas · SP</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Campo Progressista</div>
          <div class="metric-value">${campoPct}%</div>
          <div class="metric-label" style="margin-top:4px">dos votos nominais · Dep.Est. 2022</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Votos — Ediane Maria</div>
          <div class="metric-value">${Utils.fmt(votosEdiane)}</div>
          <div class="metric-label" style="margin-top:4px">PSOL · nº 50110 · 2022</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Zonas Prioritárias</div>
          <div class="metric-value">${zonasPrior || '—'}</div>
          <div class="metric-label" style="margin-top:4px">Consolidar + Crescer</div>
        </div>
      `;
    } catch {
      el.innerHTML = `<div class="metric-card" style="grid-column:1/-1"><div class="metric-label" style="color:#dc2626">Erro ao carregar métricas</div></div>`;
    }
  }

  // ── Zonas Prioritárias ────────────────────────────────────
  async function _renderPrioridade() {
    const el = document.getElementById('op-prioridade');
    if (!el) return;
    try {
      const [scores, res22] = await Promise.all([
        Utils.loadCSV('data/resultados/scores_ze.csv'),
        Utils.loadCSV('data/resultados/resultados_ze_2022.csv').catch(() => []),
      ]);

      const resMap = {};
      res22.forEach(d => { resMap[String(d.zona).padStart(4,'0')] = d; });

      const sorted = [...scores].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));

      const badgeClass = cl => ({
        'Consolidar': 'badge-consolidar',
        'Crescer':    'badge-crescer',
        'Prospectar': 'badge-prospectar',
      }[cl] || 'badge-prospectar');

      el.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Zona</th>
              <th>Classificação</th>
              <th style="text-align:right">Score</th>
              <th style="text-align:right">Campo %</th>
              <th style="text-align:right">Jovens %</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map(s => {
              const zona = String(s.zona).padStart(4,'0');
              const r = resMap[zona] || {};
              const eleit = Number(r.eleitores_aptos) || 0;
              const pct   = Number(r.campo_pct) || 0;
              const score = Number(s.score) || 0;
              const jovens = Number(s.pct_jovens) || 0;
              return `
                <tr>
                  <td><strong>ZE ${zona}</strong></td>
                  <td><span class="badge ${badgeClass(s.classificacao)}">${s.classificacao}</span></td>
                  <td style="text-align:right;font-weight:600;color:var(--psol-roxo)">${score.toFixed(0)}</td>
                  <td style="text-align:right">${pct.toFixed(1)}%</td>
                  <td style="text-align:right;color:var(--texto-secundario)">${jovens.toFixed(0)}%</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    } catch {
      el.innerHTML = `<div style="padding:16px;color:var(--texto-secundario);font-size:13px">Dados de priorização não encontrados</div>`;
    }
  }

  // ── Votos por zona — comparativo ─────────────────────────
  async function _renderZonasChart() {
    const ctx = document.getElementById('op-chart-zonas');
    if (!ctx) return;
    try {
      const [nom22, nom24] = await Promise.all([
        Utils.loadCSV('data/resultados/votos_nominais_ze_2022.csv'),
        Utils.loadCSV('data/resultados/votos_nominais_ze_2024.csv'),
      ]);

      const ediane = {};
      nom22.filter(d => String(d.nr_candidato).trim() === '50110')
           .forEach(d => { ediane[String(d.zona).padStart(4,'0')] = Number(d.votos) || 0; });

      const thamy = {};
      nom24.filter(d => String(d.nr_candidato).trim() === '50019')
           .forEach(d => { thamy[String(d.zona).padStart(4,'0')] = Number(d.votos) || 0; });

      const zonas = [...new Set([...Object.keys(ediane), ...Object.keys(thamy)])].sort();
      const labels = zonas.map(z => `ZE ${z}`);

      Charts.barGrouped(ctx, labels, [
        { label: 'Ediane Maria 2022', data: zonas.map(z => ediane[z] || 0), color: '#7C3AED' },
        { label: 'Thamy do Mandela 2024', data: zonas.map(z => thamy[z] || 0), color: '#FACC15' },
      ]);
    } catch {
      if (ctx.parentElement) ctx.parentElement.innerHTML = `<div class="loading-overlay" style="height:200px">Dados não encontrados</div>`;
    }
  }

  // ── Perfil demográfico ────────────────────────────────────
  async function _renderPerfil() {
    try {
      const [geral, ze] = await Promise.all([
        Utils.loadCSV('data/perfil/perfil_campinas_geral.csv').catch(() => []),
        Utils.loadCSV('data/perfil/perfil_ze.csv').catch(() => []),
      ]);

      _renderSexo(geral[0] || {});
      _renderJovens(ze);
      _renderEsc(ze);
    } catch { /* silently skip */ }
  }

  function _renderSexo(geral) {
    const ctx = document.getElementById('op-chart-sexo');
    if (!ctx) return;
    const fem  = Number(geral.pct_feminino)  || 0;
    const masc = Number(geral.pct_masculino) || 0;
    if (!fem && !masc) {
      ctx.parentElement.innerHTML = `<div class="loading-overlay" style="height:200px">Sem dados</div>`;
      return;
    }
    Charts.doughnut(ctx, ['Feminino', 'Masculino'], [fem, masc], ['#A78BFA', '#7C3AED']);
  }

  function _renderJovens(ze) {
    const ctx = document.getElementById('op-chart-jovens');
    if (!ctx || !ze.length) return;
    const sorted = [...ze].sort((a, b) => (Number(b.pct_jovens_16_34)||0) - (Number(a.pct_jovens_16_34)||0));
    Charts.horizontalBar(
      ctx,
      sorted.map(d => `ZE ${String(d.zona).padStart(4,'0')}`),
      sorted.map(d => Number(d.pct_jovens_16_34) || 0),
      '#FACC15'
    );
  }

  function _renderEsc(ze) {
    const ctx = document.getElementById('op-chart-esc');
    if (!ctx || !ze.length) return;

    const escCols = Object.keys(ze[0]).filter(k => k.startsWith('esc_'));
    if (!escCols.length) {
      ctx.parentElement.innerHTML = `<div class="loading-overlay" style="height:200px">Sem dados de escolaridade</div>`;
      return;
    }

    const totalEleit = ze.reduce((s, d) => s + (Number(d.total_eleitores) || 0), 0);
    const values = escCols.map(col => {
      const w = ze.reduce((s, d) => s + (Number(d[col]) || 0) * (Number(d.total_eleitores) || 0), 0);
      return totalEleit ? Number((w / totalEleit).toFixed(1)) : 0;
    });

    const labels = escCols.map(c =>
      c.replace('esc_', '')
       .replace(/_/g, ' ')
       .replace('ensino ', '')
       .replace('fundamental', 'fund.')
       .replace('medio', 'médio')
       .slice(0, 20)
    );

    const paired = labels.map((l, i) => [l, values[i]])
      .sort((a, b) => b[1] - a[1]);

    Charts.horizontalBar(ctx, paired.map(p => p[0]), paired.map(p => p[1]), '#7C3AED');
  }

  // ── Mapa de calor ────────────────────────────────────────
  async function _renderMapa() {
    const mapEl = document.getElementById('op-map');
    if (!mapEl) return;

    const map = L.map('op-map', { zoomControl: true }).setView([-22.9064, -47.0616], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    setTimeout(() => map.invalidateSize(), 150);

    try {
      const r = await fetch('data/geo/locais_votos_2022.geojson');
      if (!r.ok) return;
      const gj = await r.json();

      const maxVotos = Math.max(...gj.features.map(f => f.properties.votos_ediane || 0), 1);

      const pontos = gj.features
        .filter(f => (f.properties.votos_ediane || 0) > 0)
        .map(f => {
          const [lng, lat] = f.geometry.coordinates;
          const intensity = (f.properties.votos_ediane || 0) / maxVotos;
          return [lat, lng, intensity];
        });

      L.heatLayer(pontos, {
        radius: 35,
        blur: 22,
        minOpacity: 0.35,
        max: 1.0,
        gradient: { 0.2: '#6D28D9', 0.5: '#8B5CF6', 0.8: '#C4B5FD', 1.0: '#FACC15' },
      }).addTo(map);

      // Círculos clicáveis nos 10 maiores locais
      const top10 = [...gj.features]
        .sort((a, b) => (b.properties.votos_ediane || 0) - (a.properties.votos_ediane || 0))
        .slice(0, 10);

      top10.forEach(f => {
        const [lng, lat] = f.geometry.coordinates;
        const v = f.properties.votos_ediane || 0;
        L.circleMarker([lat, lng], {
          radius: 6,
          fillColor: '#FACC15',
          color: '#fff',
          weight: 1.5,
          fillOpacity: 0.9,
        }).bindTooltip(`<strong>${v} votos</strong><br>ZE ${f.properties.nr_zona}`, { direction: 'top' })
          .addTo(map);
      });

    } catch { /* sem mapa */ }
  }

  return { render };
})();
