const ModuloEvolucao = (() => {
  async function render(container, config) {
    container.innerHTML = `
      <div class="page-header">
        <div class="page-title">Comparativo 2022 × 2024</div>
        <div class="page-subtitle">Dep. Estadual (2022) vs Vereadora (2024) — desempenho por Zona Eleitoral</div>
      </div>
      <div class="page-body">

        <div class="disclaimer" style="margin-bottom:20px">
          <span class="disclaimer-icon">⚠</span>
          <span>2022 = Deputada Estadual (eleição estadual); 2024 = Vereadora (eleição municipal). São cargos diferentes — a queda no % do campo reflete a dinâmica própria de cada disputa, não necessariamente perda de base.</span>
        </div>

        <div class="content-card" style="margin-bottom:20px">
          <div class="content-card-header">
            <span class="content-card-title">% Campo Progressista por Zona — 2022 Dep.Est. vs 2024 Vereador</span>
          </div>
          <div class="content-card-body">
            <div class="chart-container-tall">
              <canvas id="chart-ev-campo-ze"></canvas>
            </div>
          </div>
        </div>

        <div class="two-col" style="margin-bottom:20px">
          <div class="content-card">
            <div class="content-card-header">
              <span class="content-card-title">Ediane Maria — Votos por Zona (2022)</span>
            </div>
            <div class="content-card-body">
              <div class="chart-container">
                <canvas id="chart-ev-ediane"></canvas>
              </div>
            </div>
          </div>
          <div class="content-card">
            <div class="content-card-header">
              <span class="content-card-title">Thamy do Mandela — Votos por Zona (2024)</span>
            </div>
            <div class="content-card-body">
              <div class="chart-container">
                <canvas id="chart-ev-thamy"></canvas>
              </div>
            </div>
          </div>
        </div>

        <div class="two-col" style="margin-bottom:20px">
          <div class="content-card">
            <div class="content-card-header">
              <span class="content-card-title">Top Zonas — Ediane 2022</span>
            </div>
            <div class="content-card-body" id="ev-rank-ediane">
              <div class="loading-overlay"><div class="spinner"></div></div>
            </div>
          </div>
          <div class="content-card">
            <div class="content-card-header">
              <span class="content-card-title">Top Zonas — Thamy 2024</span>
            </div>
            <div class="content-card-body" id="ev-rank-thamy">
              <div class="loading-overlay"><div class="spinner"></div></div>
            </div>
          </div>
        </div>

        <div class="disclaimer">
          <span class="disclaimer-icon">⚠</span>
          <span>Os cruzamentos são correlações territoriais por zona eleitoral. O TSE não divulga para quem cada eleitor votou.</span>
        </div>
      </div>
    `;

    await Promise.all([
      renderCampoZE(),
      renderCandidatas(),
    ]);
  }

  async function renderCampoZE() {
    const ctx = document.getElementById('chart-ev-campo-ze');
    if (!ctx) return;
    try {
      const [d22, d24] = await Promise.all([
        Utils.loadCSV('data/resultados/resultados_ze_2022.csv'),
        Utils.loadCSV('data/resultados/resultados_ze_2024.csv'),
      ]);

      const zonas22 = d22.map(d => `ZE ${String(d.zona).padStart(4,'0')}`);
      const zonas24 = d24.map(d => `ZE ${String(d.zona).padStart(4,'0')}`);
      const allZonas = [...new Set([...zonas22, ...zonas24])].sort();

      const map22 = {}, map24 = {};
      d22.forEach(d => { map22[`ZE ${String(d.zona).padStart(4,'0')}`] = Number(d.campo_pct) || 0; });
      d24.forEach(d => { map24[`ZE ${String(d.zona).padStart(4,'0')}`] = Number(d.campo_pct) || 0; });

      Charts.barGrouped(ctx, allZonas, [
        { label: '% Campo 2022 (Dep.Est.)', data: allZonas.map(z => map22[z] || 0), color: '#7C3AED' },
        { label: '% Campo 2024 (Vereador)', data: allZonas.map(z => map24[z] || 0), color: '#A78BFA' },
      ], { pct: true });
    } catch {
      if (ctx.parentElement) ctx.parentElement.innerHTML = `<div class="loading-overlay" style="height:200px">Dados de resultados não encontrados</div>`;
    }
  }

  async function renderCandidatas() {
    const CAND_50110 = '50110';
    const CAND_50019 = '50019';

    try {
      const [nom22, nom24] = await Promise.all([
        Utils.loadCSV('data/resultados/votos_nominais_ze_2022.csv'),
        Utils.loadCSV('data/resultados/votos_nominais_ze_2024.csv'),
      ]);

      // Ediane 2022
      const ediane = nom22
        .filter(d => String(d.nr_candidato) === CAND_50110)
        .sort((a, b) => (Number(a.zona) || 0) - (Number(b.zona) || 0));

      const labelsE = ediane.map(d => `ZE ${String(d.zona).padStart(4,'0')}`);
      const votosE  = ediane.map(d => Number(d.votos) || 0);
      const ctxE = document.getElementById('chart-ev-ediane');
      if (ctxE && ediane.length) {
        Charts.barGrouped(ctxE, labelsE,
          [{ label: 'Votos Ediane', data: votosE, color: '#7C3AED' }]);
      } else if (ctxE) {
        ctxE.parentElement.innerHTML = `<div class="loading-overlay" style="height:180px">Sem dados de Ediane em 2022</div>`;
      }

      // Thamy 2024
      const thamy = nom24
        .filter(d => String(d.nr_candidato) === CAND_50019)
        .sort((a, b) => (Number(a.zona) || 0) - (Number(b.zona) || 0));

      const labelsT = thamy.map(d => `ZE ${String(d.zona).padStart(4,'0')}`);
      const votosT  = thamy.map(d => Number(d.votos) || 0);
      const ctxT = document.getElementById('chart-ev-thamy');
      if (ctxT && thamy.length) {
        Charts.barGrouped(ctxT, labelsT,
          [{ label: 'Votos Thamy', data: votosT, color: '#FACC15' }]);
      } else if (ctxT) {
        ctxT.parentElement.innerHTML = `<div class="loading-overlay" style="height:180px">Sem dados de Thamy em 2024</div>`;
      }

      // Rankings
      renderRanking('ev-rank-ediane', ediane, votosE, labelsE, 2022, '#7C3AED');
      renderRanking('ev-rank-thamy', thamy, votosT, labelsT, 2024, '#FACC15');

    } catch (err) {
      ['ev-rank-ediane', 'ev-rank-thamy'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<div style="color:var(--texto-secundario);font-size:13px;padding:8px">Dados não encontrados</div>`;
      });
    }
  }

  function renderRanking(elId, dados, votos, labels, ano, color) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (!dados.length) {
      el.innerHTML = `<div style="color:var(--texto-secundario);font-size:13px;padding:8px">Sem dados em ${ano}</div>`;
      return;
    }

    const sorted = dados
      .map((d, i) => ({ label: labels[i], votos: votos[i] }))
      .sort((a, b) => b.votos - a.votos)
      .slice(0, 5);

    const total = votos.reduce((a, b) => a + b, 0);

    el.innerHTML = `
      <div style="font-size:12px;color:var(--texto-secundario);margin-bottom:8px">Total: ${Utils.fmt(total)} votos em ${dados.length} zonas</div>
      ${sorted.map(d => `
        <div class="ranking-item">
          <div class="ranking-info">
            <div class="ranking-zone">${d.label}</div>
          </div>
          <span style="font-weight:600;color:${color}">${Utils.fmt(d.votos)}</span>
        </div>
      `).join('')}
    `;
  }

  return { render };
})();
