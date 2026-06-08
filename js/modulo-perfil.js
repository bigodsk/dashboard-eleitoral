const ModuloPerfil = (() => {
  const DISCLAIMER = `Os cruzamentos entre resultado eleitoral e perfil demográfico são correlações por território (zona/seção eleitoral), não vínculos individuais. O TSE não divulga para quem cada eleitor votou. Use como orientação estratégica.`;

  async function render(container, config) {
    container.innerHTML = `
      <div class="page-header">
        <div class="page-title">Perfil do Eleitor-Alvo</div>
        <div class="page-subtitle">Quem já vota no campo? Com quem devo falar?</div>
      </div>
      <div class="page-body">

        <div class="metrics-grid" id="perfil-metrics">
          <div class="metric-card"><div class="spinner" style="margin:12px auto"></div></div>
        </div>

        <div class="three-col" style="margin-bottom:20px">
          <div class="content-card">
            <div class="content-card-header">
              <span class="content-card-title">Distribuição por Sexo</span>
            </div>
            <div class="content-card-body">
              <div class="chart-container">
                <canvas id="chart-perfil-sexo"></canvas>
              </div>
            </div>
          </div>
          <div class="content-card">
            <div class="content-card-header">
              <span class="content-card-title">Faixas Etárias</span>
            </div>
            <div class="content-card-body">
              <div class="chart-container">
                <canvas id="chart-perfil-idade"></canvas>
              </div>
            </div>
          </div>
          <div class="content-card">
            <div class="content-card-header">
              <span class="content-card-title">Grau de Escolaridade</span>
            </div>
            <div class="content-card-body">
              <div class="chart-container">
                <canvas id="chart-perfil-esc"></canvas>
              </div>
            </div>
          </div>
        </div>

        <div class="content-card" style="margin-bottom:20px">
          <div class="content-card-header">
            <span class="content-card-title">% de Jovens (16–34 anos) por Zona Eleitoral</span>
          </div>
          <div class="content-card-body">
            <div class="chart-container-tall">
              <canvas id="chart-perfil-jovens-ze"></canvas>
            </div>
          </div>
        </div>

        <div class="disclaimer">
          <span class="disclaimer-icon">⚠</span>
          <span>${DISCLAIMER}</span>
        </div>
      </div>
    `;

    try {
      const [geral, ze] = await Promise.all([
        Utils.loadCSV('data/perfil/perfil_campinas_geral.csv').catch(() => []),
        Utils.loadCSV('data/perfil/perfil_ze.csv').catch(() => []),
      ]);

      if (!geral.length && !ze.length) {
        document.getElementById('perfil-metrics').innerHTML = `
          <div class="metric-card" style="grid-column:1/-1">
            <div class="metric-label">Dados não disponíveis</div>
            <div class="metric-value" style="font-size:14px;color:var(--texto-secundario)">Execute os scripts ETL 04_cruzar_perfil_ze.py para carregar os dados de perfil.</div>
          </div>`;
        return;
      }

      renderMetrics(geral[0] || {});
      renderSexo(geral[0] || {});
      renderIdade(ze);
      renderEscolaridade(geral[0] || {});
      renderJovensZE(ze);

    } catch (err) {
      document.getElementById('perfil-metrics').innerHTML = `<div class="metric-card"><div class="metric-label" style="color:#dc2626">Erro ao carregar dados de perfil</div></div>`;
    }
  }

  function renderMetrics(geral) {
    const el = document.getElementById('perfil-metrics');
    const total = geral.total_eleitores || 0;
    const jovens = geral.pct_jovens_16_34 || 0;

    let femPct = 0, mascPct = 0;
    Object.entries(geral).forEach(([k, v]) => {
      const lk = k.toLowerCase();
      if (lk.includes('feminino') || lk.includes('fem')) femPct = Number(v) || 0;
      if (lk.includes('masculino') || lk.includes('masc')) mascPct = Number(v) || 0;
    });

    el.innerHTML = `
      <div class="metric-card">
        <div class="metric-label">Total de Eleitores</div>
        <div class="metric-value">${Utils.fmt(total)}</div>
        <div class="metric-label" style="margin-top:4px">Campinas · SP</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Eleitoras</div>
        <div class="metric-value">${Utils.fmtPct(femPct)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Eleitores</div>
        <div class="metric-value">${Utils.fmtPct(mascPct)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Jovens 16–34</div>
        <div class="metric-value">${Utils.fmtPct(jovens)}</div>
      </div>
    `;
  }

  function renderSexo(geral) {
    const ctx = document.getElementById('chart-perfil-sexo');
    if (!ctx) return;

    const labels = [], values = [];
    Object.entries(geral).forEach(([k, v]) => {
      if (k.startsWith('pct_') && !k.includes('jovens') && !k.includes('abstenc')) {
        const lbl = k.replace('pct_', '').replace(/_/g, ' ');
        labels.push(lbl.charAt(0).toUpperCase() + lbl.slice(1));
        values.push(Number(v) || 0);
      }
    });

    if (!labels.length) {
      ctx.parentElement.innerHTML = `<div class="loading-overlay" style="height:200px">Dados de sexo não disponíveis</div>`;
      return;
    }

    Charts.doughnut(ctx, labels, values, ['#7C3AED', '#A78BFA', '#EDE9FE']);
  }

  function renderIdade(ze) {
    const ctx = document.getElementById('chart-perfil-idade');
    if (!ctx || !ze.length) return;

    const faixasCols = Object.keys(ze[0] || {}).filter(k => k.startsWith('faixa_'));

    if (!faixasCols.length) {
      ctx.parentElement.innerHTML = `<div class="loading-overlay" style="height:200px">Dados de faixa etária não disponíveis</div>`;
      return;
    }

    const labels = faixasCols.map(c => c.replace('faixa_pct_', '').replace(/_/g, ' '));
    const medias = faixasCols.map(col => {
      const vals = ze.map(d => Number(d[col]) || 0).filter(v => v > 0);
      return vals.length ? vals.reduce((a,b) => a+b, 0) / vals.length : 0;
    });

    Charts.horizontalBar(ctx, labels, medias.map(v => Math.round(v * 10) / 10), '#A78BFA');
  }

  function renderEscolaridade(geral) {
    const ctx = document.getElementById('chart-perfil-esc');
    if (!ctx) return;

    const cols = Object.keys(geral).filter(k => k.startsWith('esc_'));

    if (!cols.length) {
      ctx.parentElement.innerHTML = `<div class="loading-overlay" style="height:200px">Dados de escolaridade não disponíveis</div>`;
      return;
    }

    const labels = cols.map(c => c.replace('esc_', '').replace(/_/g, ' ').slice(0, 22));
    const values = cols.map(c => Number(geral[c]) || 0);

    Charts.horizontalBar(ctx, labels, values, '#7C3AED');
  }

  function renderJovensZE(ze) {
    const ctx = document.getElementById('chart-perfil-jovens-ze');
    if (!ctx || !ze.length) return;

    const colJovens = Object.keys(ze[0]).find(k => k.includes('jovens'));
    if (!colJovens) return;

    const sorted = [...ze].sort((a, b) => (Number(b[colJovens])||0) - (Number(a[colJovens])||0));
    const labels = sorted.map(d => `ZE ${String(d.zona).padStart(4,'0')}`);
    const values = sorted.map(d => Number(d[colJovens]) || 0);

    Charts.barGrouped(ctx, labels, [{ label: '% Jovens', data: values, color: '#FACC15' }], { pct: true });
  }

  return { render };
})();
