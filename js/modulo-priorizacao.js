const ModuloPriorizacao = (() => {
  let _dadosBase = [];
  let _pesos = { eleitores: 30, crescimento: 30, abstencao: 20, jovens: 20 };

  async function render(container, config) {
    container.innerHTML = `
      <div class="page-header">
        <div class="page-title">Priorização Estratégica</div>
        <div class="page-subtitle">Onde devo focar energia?</div>
      </div>
      <div class="page-body">

        <div class="two-col" style="margin-bottom:20px;align-items:start">
          <div>
            <div class="content-card" style="margin-bottom:20px">
              <div class="content-card-header">
                <span class="content-card-title">Zonas por Score</span>
                <div class="filter-chips" id="pri-filtro-cls">
                  <button class="chip active" data-cls="todos">Todas</button>
                  <button class="chip" data-cls="Consolidar">Consolidar</button>
                  <button class="chip" data-cls="Crescer">Crescer</button>
                  <button class="chip" data-cls="Prospectar">Prospectar</button>
                </div>
              </div>
              <div style="overflow-x:auto">
                <table class="data-table" id="pri-tabela">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Zona</th>
                      <th>Score</th>
                      <th>Classificação</th>
                      <th>% Campo</th>
                      <th>Eleitores</th>
                      <th>Abstenção</th>
                    </tr>
                  </thead>
                  <tbody id="pri-tabela-body">
                    <tr><td colspan="7" class="loading-overlay"><div class="spinner"></div></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div>
            <div class="sliders-panel" style="margin-bottom:20px">
              <div style="font-size:13px;font-weight:500;margin-bottom:16px">Ajustar Pesos do Score</div>
              <div id="sliders-container"></div>
              <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--borda);display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:11px;color:var(--texto-secundario)">Soma dos pesos</span>
                <span id="pesos-soma" style="font-weight:600;font-size:13px">100%</span>
              </div>
            </div>

            <div class="content-card">
              <div class="content-card-header">
                <span class="content-card-title">Distribuição de Classificações</span>
              </div>
              <div class="content-card-body">
                <div class="chart-container">
                  <canvas id="chart-pri-doughnut"></canvas>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="content-card" style="margin-bottom:20px">
          <div class="content-card-header">
            <span class="content-card-title">Mapa — Score por Zona</span>
          </div>
          <div style="padding:0">
            <div class="map-container" id="map-priorizacao"></div>
          </div>
        </div>

        <div class="disclaimer" style="margin-bottom:0">
          <span class="disclaimer-icon">⚠</span>
          <span>
            <strong>Fórmula do score:</strong>
            Eleitores potenciais (${_pesos.eleitores}%) + Crescimento do campo (${_pesos.crescimento}%) + Taxa de abstenção (${_pesos.abstencao}%) + % Jovens 16–34 (${_pesos.jovens}%).
            Todos os componentes normalizados de 0 a 100 antes da aplicação dos pesos.
          </span>
        </div>
      </div>
    `;

    renderSliders();

    try {
      _dadosBase = await Utils.loadCSV('data/resultados/scores_ze.csv');
    } catch {
      _dadosBase = [];
    }

    renderTabela('todos');
    renderDoughnut();
    renderMapaPri();

    document.getElementById('pri-filtro-cls').addEventListener('click', e => {
      const btn = e.target.closest('[data-cls]');
      if (!btn) return;
      document.querySelectorAll('#pri-filtro-cls .chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTabela(btn.dataset.cls);
    });
  }

  function renderSliders() {
    const items = [
      { key: 'eleitores',   label: 'Eleitores potenciais' },
      { key: 'crescimento', label: 'Crescimento do campo' },
      { key: 'abstencao',   label: 'Taxa de abstenção' },
      { key: 'jovens',      label: '% Jovens 16–34' },
    ];

    const el = document.getElementById('sliders-container');
    el.innerHTML = items.map(({ key, label }) => `
      <div class="slider-row">
        <div class="slider-row-header">
          <span class="slider-name">${label}</span>
          <span class="slider-value" id="sv-${key}">${_pesos[key]}%</span>
        </div>
        <input type="range" min="0" max="100" value="${_pesos[key]}" id="sl-${key}">
      </div>
    `).join('');

    items.forEach(({ key }) => {
      document.getElementById(`sl-${key}`).addEventListener('input', function () {
        _pesos[key] = parseInt(this.value);
        document.getElementById(`sv-${key}`).textContent = `${_pesos[key]}%`;
        const soma = Object.values(_pesos).reduce((a, b) => a + b, 0);
        const somaEl = document.getElementById('pesos-soma');
        somaEl.textContent = soma + '%';
        somaEl.style.color = soma === 100 ? 'var(--psol-roxo)' : '#dc2626';
        recalcularScores();
      });
    });
  }

  function normalize(arr) {
    const mn = Math.min(...arr), mx = Math.max(...arr);
    if (mx === mn) return arr.map(() => 50);
    return arr.map(v => (v - mn) / (mx - mn) * 100);
  }

  function recalcularScores() {
    if (!_dadosBase.length) return;
    const soma = Object.values(_pesos).reduce((a, b) => a + b, 0);
    if (soma === 0) return;

    const nEleit = normalize(_dadosBase.map(d => d.eleitores_aptos || 0));
    const nCresc = normalize(_dadosBase.map(d => d.crescimento || 0));
    const nAbst = normalize(_dadosBase.map(d => d.abstencao_pct || 0));
    const nJov = normalize(_dadosBase.map(d => d.pct_jovens || 20));

    _dadosBase = _dadosBase.map((d, i) => {
      const score = (
        nEleit[i] * (_pesos.eleitores / soma) +
        nCresc[i] * (_pesos.crescimento / soma) +
        nAbst[i] * (_pesos.abstencao / soma) +
        nJov[i] * (_pesos.jovens / soma)
      );
      const s = Math.round(score * 10) / 10;
      const cls = s >= 75 ? 'Consolidar' : s >= 55 ? 'Crescer' : 'Prospectar';
      return { ...d, score: s, classificacao: cls };
    });

    _dadosBase.sort((a, b) => b.score - a.score);
    renderTabela(document.querySelector('#pri-filtro-cls .chip.active')?.dataset.cls || 'todos');
    renderDoughnut();
  }

  function renderTabela(filtro) {
    const tbody = document.getElementById('pri-tabela-body');
    if (!tbody) return;

    if (!_dadosBase.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--texto-secundario)">Dados não disponíveis. Execute o ETL.</td></tr>`;
      return;
    }

    const dados = filtro === 'todos' ? _dadosBase : _dadosBase.filter(d => d.classificacao === filtro);

    tbody.innerHTML = dados.map((d, i) => `
      <tr>
        <td style="color:var(--texto-secundario)">${i + 1}</td>
        <td><strong>Zona ${String(d.zona).padStart(4,'0')}</strong></td>
        <td>
          <div class="score-bar-cell">
            <div class="score-bar"><div class="score-bar-fill" style="width:${d.score}%"></div></div>
            <strong>${d.score}</strong>
          </div>
        </td>
        <td>${Utils.badgeHTML(d.classificacao)}</td>
        <td>${Utils.fmtPct(d.campo_pct_ultimo || d.campo_pct)}</td>
        <td>${Utils.fmt(d.eleitores_aptos)}</td>
        <td>${Utils.fmtPct(d.abstencao_pct)}</td>
      </tr>
    `).join('');
  }

  function renderDoughnut() {
    const ctx = document.getElementById('chart-pri-doughnut');
    if (!ctx || !_dadosBase.length) return;

    const counts = { Consolidar: 0, Crescer: 0, Prospectar: 0 };
    _dadosBase.forEach(d => { counts[d.classificacao] = (counts[d.classificacao] || 0) + 1; });

    Charts.doughnut(ctx,
      ['Consolidar', 'Crescer', 'Prospectar'],
      [counts.Consolidar, counts.Crescer, counts.Prospectar],
      ['#14532D', '#1D4ED8', '#92400E']
    );
  }

  function renderMapaPri() {
    const map = MapModule.createMap('map-priorizacao');

    fetch('data/geo/zonas_campinas.geojson')
      .then(r => r.ok ? r.json() : null)
      .then(geojson => {
        if (!geojson || !_dadosBase.length) return;
        MapModule.renderChoropleth(map, geojson, _dadosBase, 'score', 'score', (feature, layer) => {
          const zona = String(feature.properties.zona || '').padStart(4, '0');
          const d = _dadosBase.find(x => String(x.zona).padStart(4,'0') === zona);
          if (d) {
            layer.bindTooltip(`<strong>Zona ${zona}</strong><br>Score: ${d.score}<br>${d.classificacao}`);
          }
        });
        MapModule.renderLegend(map, MapModule.getLegendScore(), 'Classificação');
      })
      .catch(() => {});
  }

  return { render };
})();
