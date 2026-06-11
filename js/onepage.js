const OnePage = (() => {

  // ── Estado dos filtros ──────────────────────────────────────
  const _DEFAULT_A = { year: '2022', nr: '50110' };
  const _DEFAULT_B = { year: '2024', nr: '50019' };

  const _st = {
    yearA: _DEFAULT_A.year,
    candA: null,
    yearB: _DEFAULT_B.year,
    candB: null,
  };

  let _map = null;
  let _mapCityGroup    = null;
  let _mapZonaGroup    = null;
  let _mapRegioesGroup = null;
  let _mapApgGroup     = null;
  let _mapUtbGroup     = null;
  let _mapSehabGroup   = null;
  let _mapGroup        = null;
  let _mapGroupB       = null;
  let _allCands = {};

  const _layers = {
    candA:      true,
    candB:      true,
    modeUrna:   true,
    zePolygons: true,
    regioes:    false,
    apg:        false,
    utb:        false,
    sehab:      false,
  };

  // ── render ─────────────────────────────────────────────────
  async function render(container) {
    container.innerHTML = `
      <div id="op-filter-bar" class="op-filter-bar">
        <div class="filter-loading">Carregando candidatos…</div>
      </div>

      <div class="op-section-title" id="op-section-title">Análise Eleitoral</div>

      <div class="metrics-grid metrics-grid--center" id="op-metrics" style="margin-bottom:24px">
        <div class="metric-card"><div class="spinner" style="margin:8px auto"></div></div>
        <div class="metric-card"></div><div class="metric-card"></div><div class="metric-card"></div>
      </div>

      <div class="op-map-layout" style="margin-bottom:24px">
        <div class="content-card" style="overflow:hidden" id="op-map-card">
          <div class="content-card-header">
            <span class="content-card-title" id="op-map-title">Distribuição de Votos</span>
            <button class="map-expand-btn" id="op-map-expand" title="Ampliar mapa">&#x2922;</button>
          </div>
          <div class="map-controls" id="op-map-controls">
            <div class="map-ctrl-group">
              <span class="map-ctrl-lbl">Candidatos</span>
              <button class="map-ctrl-btn map-ctrl-on" id="ctrl-cand-a" title="Mostrar/ocultar Candidato A">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#7C3AED;border:1px solid #4C1D95;flex-shrink:0"></span>Cand A
              </button>
              <button class="map-ctrl-btn map-ctrl-on" id="ctrl-cand-b" title="Mostrar/ocultar Candidato B">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#D97706;border:1px solid #92400E;flex-shrink:0"></span>Cand B
              </button>
            </div>
            <div class="map-ctrl-divider"></div>
            <div class="map-ctrl-group">
              <span class="map-ctrl-lbl">Detalhe</span>
              <button class="map-ctrl-btn map-ctrl-on" id="ctrl-mode-urna" title="Pontos por local de votação">Por urna</button>
              <button class="map-ctrl-btn" id="ctrl-mode-ze" title="Círculos por Zona Eleitoral">Por ZE</button>
            </div>
            <div class="map-ctrl-divider"></div>
            <div class="map-ctrl-group">
              <span class="map-ctrl-lbl">Limites</span>
              <button class="map-ctrl-btn map-ctrl-on" id="ctrl-zonas" title="Zonas Eleitorais — 7 ZEs de Campinas. Polígonos aproximados por hull convexo dos locais de votação. Fonte: TSE">Zonas</button>
              <button class="map-ctrl-btn" id="ctrl-regioes" title="Administrações Regionais — 19 ARs oficiais de Campinas (AR-01 a AR-15 + distritos). Fonte: Prefeitura de Campinas / SEPLAMA">Regiões</button>
              <button class="map-ctrl-btn" id="ctrl-apg" title="Áreas de Planejamento e Gestão — 17 APGs com histórico de população (1970–2022). Coloridas por população no Censo 2022. Fonte: Prefeitura de Campinas / Plano Diretor 2018">APGs</button>
              <button class="map-ctrl-btn" id="ctrl-utb" title="Unidades Territoriais Básicas — 93 UTBs urbanas com histórico de população (1970–2022). Coloridas por população no Censo 2022. Fonte: Prefeitura de Campinas / Plano Diretor 2018">UTBs</button>
            </div>
            <div class="map-ctrl-divider"></div>
            <div class="map-ctrl-group">
              <span class="map-ctrl-lbl">Social</span>
              <button class="map-ctrl-btn" id="ctrl-sehab" title="Núcleos Urbanos de Interesse Social — 556 núcleos habitacionais de baixa renda mapeados pela SEHAB. Indica territórios de vulnerabilidade social. Fonte: Prefeitura de Campinas / SEHAB">Núcleos</button>
            </div>
          </div>
          <div class="map-container-report" id="op-map-container">
            <div id="op-map"></div>
            <div class="map-legend" id="op-map-legend" style="display:none"></div>
          </div>
        </div>

        <div class="content-card">
          <div class="content-card-header">
            <span class="content-card-title">Votos por Zona</span>
          </div>
          <div class="content-card-body" id="op-prioridade" style="padding:0">
            <div class="loading-overlay"><div class="spinner"></div></div>
          </div>
        </div>
      </div>

      <div class="content-card" style="margin-bottom:24px">
        <div class="content-card-header">
          <span class="content-card-title">Votos por Zona Eleitoral</span>
          <span style="font-size:11px;color:var(--texto-secundario)" id="op-chart-sub"></span>
        </div>
        <div class="content-card-body">
          <div class="chart-container-tall"><canvas id="op-chart-zonas"></canvas></div>
        </div>
      </div>

      <div class="op-section-title" style="margin-top:8px;margin-bottom:16px">Dados Eleitorais Gerais de Campinas</div>

      <div class="three-col" style="margin-bottom:24px">
        <div class="content-card">
          <div class="content-card-header"><span class="content-card-title">Sexo dos Eleitores</span></div>
          <div class="content-card-body"><div class="chart-container"><canvas id="op-chart-sexo"></canvas></div></div>
        </div>
        <div class="content-card">
          <div class="content-card-header"><span class="content-card-title">% Jovens 16–34 por Zona</span></div>
          <div class="content-card-body"><div class="chart-container"><canvas id="op-chart-jovens"></canvas></div></div>
        </div>
        <div class="content-card">
          <div class="content-card-header"><span class="content-card-title">Escolaridade — Campinas</span></div>
          <div class="content-card-body"><div class="chart-container"><canvas id="op-chart-esc"></canvas></div></div>
        </div>
      </div>

      <div class="op-section-title" style="margin-top:8px;margin-bottom:16px">Análise do Eleitorado</div>

      <div class="two-col" style="margin-bottom:24px">
        <div class="content-card">
          <div class="content-card-header"><span class="content-card-title">Faixa Etária do Eleitorado — Campinas 2024</span></div>
          <div class="content-card-body"><div class="chart-container-tall"><canvas id="an-faixas"></canvas></div></div>
        </div>
        <div class="content-card">
          <div class="content-card-header"><span class="content-card-title">Escolaridade por Zona Eleitoral (2024)</span></div>
          <div class="content-card-body"><div class="chart-container-tall"><canvas id="an-esc-ze"></canvas></div></div>
        </div>
      </div>

      <div class="two-col" style="margin-bottom:24px">
        <div class="content-card">
          <div class="content-card-header"><span class="content-card-title">% Campo Progressista por ZE — 2018 · 2022 · 2024</span></div>
          <div class="content-card-body"><div class="chart-container"><canvas id="an-campo-ze"></canvas></div></div>
        </div>
        <div class="content-card">
          <div class="content-card-header"><span class="content-card-title">Abstenção por Zona Eleitoral — 2018 · 2022 · 2024</span></div>
          <div class="content-card-body"><div class="chart-container"><canvas id="an-abst-ze"></canvas></div></div>
        </div>
      </div>

      <div class="two-col" style="margin-bottom:24px">
        <div class="content-card">
          <div class="content-card-header"><span class="content-card-title">Partidos do Campo — Votos 2018 · 2022 · 2024</span></div>
          <div class="content-card-body"><div class="chart-container"><canvas id="an-campo-partidos"></canvas></div></div>
        </div>
        <div class="content-card">
          <div class="content-card-header">
            <span class="content-card-title">Escolaridade Superior × % Campo por ZE</span>
          </div>
          <div class="content-card-body"><div class="chart-container"><canvas id="an-corr"></canvas></div></div>
        </div>
      </div>
    `;

    await _loadAllCands();

    // Deriva defaults a partir dos dados reais
    const dA = (_allCands[_DEFAULT_A.year] || []).find(c => String(c.nr_candidato) === _DEFAULT_A.nr);
    const dB = (_allCands[_DEFAULT_B.year] || []).find(c => String(c.nr_candidato) === _DEFAULT_B.nr);
    _st.candA = dA ? _toCand(dA) : (_allCands[_st.yearA]?.[0] ? _toCand(_allCands[_st.yearA][0]) : null);
    _st.candB = dB ? _toCand(dB) : null;

    _buildFilterBar();
    _initTooltip();
    _updateLabels();

    await Promise.all([
      _renderMetrics(),
      _renderZonaTable(),
      _renderZonasChart(),
      _renderPerfil(),
      _renderAnalises(),
    ]);

    _renderMapa();
  }

  // ── Combobox com busca ─────────────────────────────────────
  function _searchSelect(wrapperId, list, selectedNr, includeNone, onSelect) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return () => {};

    let currentNr = String(selectedNr || '');
    let isOpen = false;

    const input    = wrapper.querySelector('.ss-input');
    const dropdown = wrapper.querySelector('.ss-dropdown');

    function findCand(nr) {
      return (list || []).find(c => String(c.nr_candidato) === String(nr)) || null;
    }

    function label(c) {
      return c ? `${c.nm_candidato} (${c.sg_partido})` : '— sem comparação —';
    }

    function renderList(filter) {
      const f = (filter || '').toLowerCase().trim();
      let items = list || [];
      if (f) items = items.filter(c =>
        c.nm_candidato.toLowerCase().includes(f) ||
        (c.sg_partido || '').toLowerCase().includes(f)
      );

      const noneHtml = includeNone
        ? `<div class="ss-item${!currentNr ? ' ss-selected' : ''}" data-nr="">— sem comparação —</div>`
        : '';

      dropdown.innerHTML = noneHtml + (items.length
        ? items.map(c =>
            `<div class="ss-item${String(c.nr_candidato) === currentNr ? ' ss-selected' : ''}" data-nr="${c.nr_candidato}">${c.nm_candidato} <span class="ss-partido">(${c.sg_partido})</span></div>`
          ).join('')
        : '<div class="ss-empty">Nenhum resultado</div>');
    }

    function open() {
      if (isOpen) return;
      isOpen = true;
      dropdown.classList.add('ss-open');
      renderList('');
      const sel = dropdown.querySelector('.ss-selected');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      dropdown.classList.remove('ss-open');
      input.value = label(findCand(currentNr));
    }

    function select(nr) {
      currentNr = nr || '';
      close();
      onSelect(currentNr);
    }

    // Seed input with current selection
    input.value = label(findCand(currentNr));

    input.addEventListener('focus', () => { input.select(); open(); });
    input.addEventListener('input', () => { if (!isOpen) open(); renderList(input.value); });

    dropdown.addEventListener('mousedown', e => {
      const item = e.target.closest('.ss-item');
      if (!item) return;
      e.preventDefault();
      select(item.dataset.nr);
    });

    document.addEventListener('click', e => {
      if (!wrapper.contains(e.target)) close();
    }, true);

    // Return update function for when the list changes (year switch)
    return function update(newList, newNr) {
      list = newList;
      currentNr = String(newNr || '');
      input.value = label(findCand(currentNr));
      if (isOpen) renderList('');
    };
  }

  // ── Candidatos ─────────────────────────────────────────────
  async function _loadAllCands() {
    const [c22, c24] = await Promise.all([
      Utils.loadCSV('data/resultados/candidatos_campinas_2022.csv').catch(() => []),
      Utils.loadCSV('data/resultados/candidatos_campinas_2024.csv').catch(() => []),
    ]);
    _allCands['2022'] = c22.sort((a, b) => (Number(b.total_votos)||0) - (Number(a.total_votos)||0));
    _allCands['2024'] = c24.sort((a, b) => (Number(b.total_votos)||0) - (Number(a.total_votos)||0));
  }

  // ── Barra de filtros ────────────────────────────────────────
  let _updateCandA = () => {};
  let _updateCandB = () => {};

  function _buildFilterBar() {
    const bar = document.getElementById('op-filter-bar');
    if (!bar) return;

    bar.innerHTML = `
      <div class="filter-group">
        <span class="filter-label">Candidato A — Foco</span>
        <div class="filter-row">
          <select class="filter-select filter-select--year" id="f-year-a">
            <option value="2022" selected>2022 · Dep. Estadual</option>
            <option value="2024">2024 · Vereador</option>
          </select>
          <div class="ss-wrapper" id="ss-cand-a">
            <input type="text" class="filter-select filter-select--cand ss-input" placeholder="Buscar candidato…" autocomplete="off" spellcheck="false">
            <div class="ss-dropdown"></div>
          </div>
        </div>
      </div>
      <div class="filter-sep">vs</div>
      <div class="filter-group">
        <span class="filter-label">Candidato B — Comparação</span>
        <div class="filter-row">
          <select class="filter-select filter-select--year" id="f-year-b">
            <option value="2022">2022 · Dep. Estadual</option>
            <option value="2024" selected>2024 · Vereador</option>
          </select>
          <div class="ss-wrapper" id="ss-cand-b">
            <input type="text" class="filter-select filter-select--cand ss-input" placeholder="Buscar candidato…" autocomplete="off" spellcheck="false">
            <div class="ss-dropdown"></div>
          </div>
        </div>
      </div>
    `;

    _updateCandA = _searchSelect('ss-cand-a', _allCands[_st.yearA], _st.candA?.nr, false, nr => {
      const c = (_allCands[_st.yearA] || []).find(x => String(x.nr_candidato) === nr);
      _st.candA = c ? _toCand(c) : null;
      _onChange();
    });

    _updateCandB = _searchSelect('ss-cand-b', _allCands[_st.yearB], _st.candB?.nr, true, nr => {
      if (!nr) { _st.candB = null; _onChange(); return; }
      const c = (_allCands[_st.yearB] || []).find(x => String(x.nr_candidato) === nr);
      _st.candB = c ? _toCand(c) : null;
      _onChange();
    });

    document.getElementById('f-year-a').addEventListener('change', e => {
      _st.yearA = e.target.value;
      const first = (_allCands[_st.yearA] || [])[0];
      _st.candA = first ? _toCand(first) : null;
      _updateCandA(_allCands[_st.yearA], _st.candA?.nr);
      _onChange();
    });

    document.getElementById('f-year-b').addEventListener('change', e => {
      _st.yearB = e.target.value;
      const first = (_allCands[_st.yearB] || [])[0];
      _st.candB = first ? _toCand(first) : null;
      _updateCandB(_allCands[_st.yearB], _st.candB?.nr);
      _onChange();
    });
  }

  function _toCand(c) {
    return { nr: String(c.nr_candidato), nm: c.nm_candidato, partido: c.sg_partido, cargo: c.ds_cargo };
  }

  async function _onChange() {
    _updateLabels();
    await Promise.all([_renderMetrics(), _renderZonaTable(), _renderZonasChart()]);
    _renderMapaUpdate();
  }

  function _updateLabels() {
    const a = _st.candA;
    const b = _st.candB;

    const t = document.getElementById('op-section-title');
    if (t) t.textContent = a
      ? `${a.nm} · ${a.cargo} · ${_st.yearA}${b ? `  —  comparado com ${b.nm} (${_st.yearB})` : ''}`
      : 'Análise Eleitoral';

    const mt = document.getElementById('op-map-title');
    if (mt) mt.textContent = `Distribuição de Votos — ${a?.nm || '—'} (${_st.yearA})`;

    const cs = document.getElementById('op-chart-sub');
    if (cs) cs.textContent = b
      ? `${a?.nm || '—'} ${_st.yearA}  ×  ${b.nm} ${_st.yearB}`
      : (a ? `${a.nm} · ${_st.yearA}` : '');
  }

  // ── Métricas ─────────────────────────────────────────────
  async function _renderMetrics() {
    const el = document.getElementById('op-metrics');
    if (!el) return;
    el.innerHTML = `<div class="metric-card" style="grid-column:1/-1"><div class="spinner" style="margin:4px auto"></div></div>`;
    try {
      const a = _st.candA;
      const b = _st.candB;

      const [res, nomA, nomB] = await Promise.all([
        Utils.loadCSV(`data/resultados/resultados_ze_${_st.yearA}.csv`).catch(() => []),
        a ? Utils.loadCSV(`data/resultados/votos_nominais_ze_${_st.yearA}.csv`).catch(() => []) : Promise.resolve([]),
        b ? Utils.loadCSV(`data/resultados/votos_nominais_ze_${_st.yearB}.csv`).catch(() => []) : Promise.resolve([]),
      ]);

      const totalEleit = res.reduce((s, d) => s + (Number(d.eleitores_aptos)||0), 0);
      const totalVotos = res.reduce((s, d) => s + (Number(d.votos_total)||0), 0);
      const campo = res.reduce((s, d) => s + (Number(d.votos_campo)||0), 0);
      const campoPct = totalVotos ? (campo / totalVotos * 100).toFixed(1) : '—';

      const votosA = a ? nomA
        .filter(d => String(d.nr_candidato).trim() === a.nr)
        .reduce((s, d) => s + (Number(d.votos)||0), 0) : 0;

      const votosB = b ? nomB
        .filter(d => String(d.nr_candidato).trim() === b.nr)
        .reduce((s, d) => s + (Number(d.votos)||0), 0) : 0;

      const zonasA = a ? nomA
        .filter(d => String(d.nr_candidato).trim() === a.nr && Number(d.votos) > 0).length : 0;

      el.innerHTML = `
        <div class="metric-card">
          <div class="metric-label">Eleitores Aptos ${_st.yearA}</div>
          <div class="metric-value">${Utils.fmt(totalEleit)}</div>
          <div class="metric-label" style="margin-top:4px">Campinas · SP</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Campo Progressista</div>
          <div class="metric-value">${campoPct}%</div>
          <div class="metric-label" style="margin-top:4px">votos nominais ${_st.yearA}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Votos — ${a?.nm || '—'}</div>
          <div class="metric-value">${Utils.fmt(votosA)}</div>
          <div class="metric-label" style="margin-top:4px">${a?.partido || ''} · nº ${a?.nr || '—'} · ${_st.yearA}</div>
        </div>
        <div class="metric-card">
          ${b ? `
            <div class="metric-label">Votos — ${b.nm}</div>
            <div class="metric-value">${Utils.fmt(votosB)}</div>
            <div class="metric-label" style="margin-top:4px">${b.partido} · nº ${b.nr} · ${_st.yearB}</div>
          ` : `
            <div class="metric-label">Zonas Ativas</div>
            <div class="metric-value">${zonasA || '—'}</div>
            <div class="metric-label" style="margin-top:4px">zonas com votos em ${_st.yearA}</div>
          `}
        </div>
      `;
    } catch {
      el.innerHTML = `<div class="metric-card" style="grid-column:1/-1"><div class="metric-label" style="color:#dc2626">Erro ao carregar métricas</div></div>`;
    }
  }

  // ── Tooltip ────────────────────────────────────────────────
  function _initTooltip() {
    if (document.getElementById('op-tip')) return;
    const tip = document.createElement('div');
    tip.id = 'op-tip';
    tip.className = 'op-tooltip-float';
    document.body.appendChild(tip);

    document.addEventListener('mouseover', e => {
      const icon = e.target.closest('.info-icon[data-tooltip]');
      if (!icon) return;
      tip.innerHTML = icon.dataset.tooltip;
      tip.style.display = 'block';
      const r = icon.getBoundingClientRect();
      let top  = r.bottom + window.scrollY + 8;
      let left = r.left  + window.scrollX;
      if (left + 268 > window.innerWidth - 16) left = window.innerWidth - 268 - 16;
      tip.style.top  = top + 'px';
      tip.style.left = left + 'px';
    });
    document.addEventListener('mouseout', e => {
      if (e.target.closest('.info-icon')) tip.style.display = 'none';
    });
    document.addEventListener('scroll', () => { tip.style.display = 'none'; }, true);
  }

  // ── Tabela de votos por zona ────────────────────────────────
  async function _renderZonaTable() {
    const el = document.getElementById('op-prioridade');
    if (!el) return;
    el.innerHTML = `<div class="loading-overlay" style="height:80px"><div class="spinner"></div></div>`;

    const TIP_CAMPO = `Soma dos votos nominais de <b>PSOL, PT, REDE, PCdoB, UP e PSTU</b> dividida pelo total de votos nominais da zona eleitoral.`;

    try {
      const a = _st.candA;
      const b = _st.candB;

      const [nomA, nomB, res] = await Promise.all([
        a ? Utils.loadCSV(`data/resultados/votos_nominais_ze_${_st.yearA}.csv`).catch(() => []) : Promise.resolve([]),
        b ? Utils.loadCSV(`data/resultados/votos_nominais_ze_${_st.yearB}.csv`).catch(() => []) : Promise.resolve([]),
        Utils.loadCSV(`data/resultados/resultados_ze_${_st.yearA}.csv`).catch(() => []),
      ]);

      const votosA = {};
      if (a) nomA.filter(d => String(d.nr_candidato).trim() === a.nr)
                 .forEach(d => { votosA[String(d.zona).padStart(4,'0')] = Number(d.votos)||0; });

      const votosB = {};
      if (b) nomB.filter(d => String(d.nr_candidato).trim() === b.nr)
                 .forEach(d => { votosB[String(d.zona).padStart(4,'0')] = Number(d.votos)||0; });

      const campoPct = {};
      res.forEach(d => { campoPct[String(d.zona).padStart(4,'0')] = Number(d.campo_pct)||0; });

      const zonas = [...new Set([
        ...Object.keys(votosA), ...Object.keys(votosB), ...Object.keys(campoPct)
      ])].sort((x, y) => (votosA[y]||0) - (votosA[x]||0));

      const hdrA = a ? _shortName(a.nm) : 'Cand. A';
      const hdrB = b ? _shortName(b.nm) : '';

      el.style.overflowY = 'auto';
      el.style.maxHeight = '340px';

      el.innerHTML = `
        <table class="data-table op-priority-table">
          <thead>
            <tr>
              <th style="white-space:nowrap">Zona</th>
              <th style="white-space:nowrap;text-align:right">${hdrA}</th>
              ${b ? `<th style="white-space:nowrap;text-align:right">${hdrB}</th>` : ''}
              <th style="white-space:nowrap;text-align:right">
                Campo %
                <span class="info-icon" data-tooltip="${TIP_CAMPO.replace(/"/g,'&quot;')}">i</span>
              </th>
            </tr>
          </thead>
          <tbody>
            ${zonas.map(z => `
              <tr>
                <td style="white-space:nowrap"><strong>ZE ${z}</strong></td>
                <td style="white-space:nowrap;text-align:right;font-weight:600;color:var(--psol-roxo)">${Utils.fmt(votosA[z]||0)}</td>
                ${b ? `<td style="white-space:nowrap;text-align:right;color:#B45309;font-weight:600">${Utils.fmt(votosB[z]||0)}</td>` : ''}
                <td style="white-space:nowrap;text-align:right">${(campoPct[z]||0).toFixed(1)}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch {
      el.innerHTML = `<div style="padding:16px;color:var(--texto-secundario);font-size:13px">Dados não encontrados</div>`;
    }
  }

  function _shortName(nm) {
    const p = nm.trim().split(' ');
    return p.length > 1 ? p[0] + ' ' + p[p.length - 1] : p[0];
  }

  // ── Gráfico de votos por zona ───────────────────────────────
  async function _renderZonasChart() {
    const ctx = document.getElementById('op-chart-zonas');
    if (!ctx) return;
    try {
      const a = _st.candA;
      const b = _st.candB;

      const [nomA, nomB] = await Promise.all([
        a ? Utils.loadCSV(`data/resultados/votos_nominais_ze_${_st.yearA}.csv`).catch(() => []) : Promise.resolve([]),
        b ? Utils.loadCSV(`data/resultados/votos_nominais_ze_${_st.yearB}.csv`).catch(() => []) : Promise.resolve([]),
      ]);

      const mapA = {}, mapB = {};
      if (a) nomA.filter(d => String(d.nr_candidato).trim() === a.nr)
                 .forEach(d => { mapA[String(d.zona).padStart(4,'0')] = Number(d.votos)||0; });
      if (b) nomB.filter(d => String(d.nr_candidato).trim() === b.nr)
                 .forEach(d => { mapB[String(d.zona).padStart(4,'0')] = Number(d.votos)||0; });

      const zonas = [...new Set([...Object.keys(mapA), ...Object.keys(mapB)])].sort();
      const labels = zonas.map(z => `ZE ${z}`);

      const datasets = [
        ...(a ? [{ label: `${a.nm} (${_st.yearA})`, data: zonas.map(z => mapA[z]||0), color: '#7C3AED' }] : []),
        ...(b ? [{ label: `${b.nm} (${_st.yearB})`, data: zonas.map(z => mapB[z]||0), color: '#D97706' }] : []),
      ];

      if (datasets.length) Charts.barGrouped(ctx, labels, datasets);
    } catch {
      if (ctx.parentElement) ctx.parentElement.innerHTML = `<div class="loading-overlay" style="height:200px">Dados não encontrados</div>`;
    }
  }

  // ── Perfil demográfico (estático) ────────────────────────────
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
      sorted.map(d => Number(d.pct_jovens_16_34)||0),
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
    const totalEleit = ze.reduce((s, d) => s + (Number(d.total_eleitores)||0), 0);
    const values = escCols.map(col => {
      const w = ze.reduce((s, d) => s + (Number(d[col])||0) * (Number(d.total_eleitores)||0), 0);
      return totalEleit ? Number((w / totalEleit).toFixed(1)) : 0;
    });
    const labels = escCols.map(c =>
      c.replace('esc_','').replace(/_/g,' ').replace('ensino ','')
       .replace('fundamental','fund.').replace('medio','médio').slice(0,20)
    );
    const paired = labels.map((l, i) => [l, values[i]]).sort((a, b) => b[1] - a[1]);
    Charts.horizontalBar(ctx, paired.map(p => p[0]), paired.map(p => p[1]), '#7C3AED');
  }

  // ── Análise do Eleitorado (6 gráficos) ─────────────────────
  async function _renderAnalises() {
    try {
      const [faixas, escZe, campoZe, abstZe, partidos, corr] = await Promise.all([
        Utils.loadCSV('data/resultados/faixas_etarias_2024.csv').catch(() => []),
        Utils.loadCSV('data/resultados/escolaridade_ze.csv').catch(() => []),
        Utils.loadCSV('data/resultados/campo_pct_ze_historico.csv').catch(() => []),
        Utils.loadCSV('data/resultados/abstencao_ze_historico.csv').catch(() => []),
        Utils.loadCSV('data/resultados/campo_partidos_historico.csv').catch(() => []),
        Utils.loadCSV('data/resultados/correlacao_esc_campo.csv').catch(() => []),
      ]);
      _anFaixas(faixas);
      _anEscZe(escZe);
      _anCampoZe(campoZe);
      _anAbstZe(abstZe);
      _anPartidos(partidos);
      _anCorr(corr);
    } catch { /* sem dados */ }
  }

  function _anFaixas(data) {
    const ctx = document.getElementById('an-faixas');
    if (!ctx || !data.length) return;
    const rows = data.filter(d => d.faixa && !String(d.faixa).includes('nválid'));
    Charts.horizontalBar(
      ctx,
      rows.map(d => d.faixa),
      rows.map(d => Number(d.eleitores) || 0),
      '#7C3AED',
      { fmt: v => Utils.fmt(v), chartOptions: { plugins: { legend: { display: false } } } }
    );
  }

  function _anEscZe(data) {
    const ctx = document.getElementById('an-esc-ze');
    if (!ctx || !data.length) return;
    const cols   = Object.keys(data[0]).filter(k => k !== 'zona');
    const labels = data.map(d => `ZE ${String(d.zona).padStart(4,'0')}`);
    const palette = ['#991B1B','#DC2626','#D97706','#F59E0B','#FACC15','#3B82F6','#7C3AED','#4C1D95'];
    Charts.barStacked(ctx, labels, cols.map((col, i) => ({
      label: col,
      data: data.map(d => Number(d[col]) || 0),
      color: palette[i % palette.length],
    })), { pct: true, max: 100 });
  }

  function _anCampoZe(data) {
    const ctx = document.getElementById('an-campo-ze');
    if (!ctx || !data.length) return;
    const zonas  = [...new Set(data.map(d => String(d.zona)))].sort((a,b) => Number(a)-Number(b));
    const labels = zonas.map(z => `ZE ${String(z).padStart(4,'0')}`);
    const anos   = ['2018','2020','2022','2024'];
    const colors = ['#94A3B8','#34D399','#7C3AED','#FACC15'];
    Charts.barGrouped(ctx, labels, anos.map((ano, i) => ({
      label: ano,
      data: zonas.map(z => { const r = data.find(d => String(d.zona)===z && String(d.ano)===ano); return r ? Number(r.campo_pct) : 0; }),
      color: colors[i],
    })), { pct: true });
  }

  function _anAbstZe(data) {
    const ctx = document.getElementById('an-abst-ze');
    if (!ctx || !data.length) return;
    const zonas  = [...new Set(data.map(d => String(d.zona)))].sort((a,b) => Number(a)-Number(b));
    const labels = zonas.map(z => `ZE ${String(z).padStart(4,'0')}`);
    const anos   = ['2018','2020','2022','2024'];
    const colors = ['#94A3B8','#34D399','#7C3AED','#FACC15'];
    Charts.barGrouped(ctx, labels, anos.map((ano, i) => ({
      label: ano,
      data: zonas.map(z => { const r = data.find(d => String(d.zona)===z && String(d.ano)===ano); return r ? Number(r.abstencao_pct) : 0; }),
      color: colors[i],
    })), { pct: true });
  }

  function _anPartidos(data) {
    const ctx = document.getElementById('an-campo-partidos');
    if (!ctx || !data.length) return;
    const MAIN   = ['PT','PSOL','PSB','PC DO B','PDT','SOLIDARIEDADE'];
    const rows   = data.filter(d => MAIN.includes(d.partido));
    const labels = MAIN.filter(p => rows.some(r => r.partido === p));
    const anos   = ['2018','2020','2022','2024'];
    const colors = ['#94A3B8','#34D399','#7C3AED','#FACC15'];
    Charts.barGrouped(ctx, labels, anos.map((ano, i) => ({
      label: ano,
      data: labels.map(p => { const r = rows.find(d => d.partido===p && String(d.ano)===ano); return r ? Number(r.votos) : 0; }),
      color: colors[i],
    })));
  }

  function _anCorr(data) {
    const ctx = document.getElementById('an-corr');
    if (!ctx || !data.length) return;
    Charts.scatter(ctx, [{
      label: 'ZE',
      data: data.map(d => ({
        x: Number(d['Superior Completo']) || 0,
        y: Number(d['Campo Pct'])         || 0,
        zona: String(d.zona).padStart(4,'0'),
      })),
      backgroundColor: '#7C3AED',
      pointRadius: 9,
      pointHoverRadius: 11,
    }], {
      pct: true,
      xLabel: '% Superior Completo',
      yLabel: '% Campo',
      tooltipFn: r => `ZE ${r.zona} — ${r.y.toFixed(1)}% campo · ${r.x.toFixed(1)}% superior`,
    });
  }

  // ── Mapa — inicialização ────────────────────────────────────
  async function _renderMapa() {
    const mapEl = document.getElementById('op-map');
    if (!mapEl || _map) return;

    _map = L.map('op-map', { zoomControl: true }).setView([-22.9064, -47.0616], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(_map);

    // Ordem das camadas (de baixo para cima)
    _mapCityGroup    = L.layerGroup().addTo(_map);
    _mapSehabGroup   = L.layerGroup();
    _mapApgGroup     = L.layerGroup();
    _mapUtbGroup     = L.layerGroup();
    _mapRegioesGroup = L.layerGroup();
    _mapZonaGroup    = L.layerGroup().addTo(_map);
    _mapGroup        = L.layerGroup().addTo(_map);
    _mapGroupB       = L.layerGroup().addTo(_map);

    setTimeout(() => _map.invalidateSize(), 150);

    // Botão ampliar
    document.getElementById('op-map-expand')?.addEventListener('click', () => {
      const mc = document.getElementById('op-map-container');
      const expanded = mc.classList.toggle('map-expanded');
      document.getElementById('op-map-expand').innerHTML = expanded ? '&#x2715;' : '&#x2922;';
      document.getElementById('op-map-expand').title = expanded ? 'Reduzir mapa' : 'Ampliar mapa';
      setTimeout(() => _map.invalidateSize(), 320);
      if (expanded) mc.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    // Controles de camada
    _buildMapControls();

    // Camadas estáticas
    await Promise.all([_addCityBoundary(), _addZoneBoundaries()]);
    await _renderMapaUpdate();
  }

  // ── Controles de camada ─────────────────────────────────────
  function _buildMapControls() {
    // Toggle candidatos (show/hide layer group sem re-render)
    document.getElementById('ctrl-cand-a')?.addEventListener('click', () => {
      _layers.candA = !_layers.candA;
      document.getElementById('ctrl-cand-a').classList.toggle('map-ctrl-on', _layers.candA);
      _layers.candA ? _mapGroup.addTo(_map) : _map.removeLayer(_mapGroup);
    });

    document.getElementById('ctrl-cand-b')?.addEventListener('click', () => {
      _layers.candB = !_layers.candB;
      document.getElementById('ctrl-cand-b').classList.toggle('map-ctrl-on', _layers.candB);
      _layers.candB ? _mapGroupB.addTo(_map) : _map.removeLayer(_mapGroupB);
    });

    // Toggle modo urna/ZE (precisa re-renderizar)
    document.getElementById('ctrl-mode-urna')?.addEventListener('click', () => {
      if (_layers.modeUrna) return;
      _layers.modeUrna = true;
      document.getElementById('ctrl-mode-urna').classList.add('map-ctrl-on');
      document.getElementById('ctrl-mode-ze').classList.remove('map-ctrl-on');
      _renderMapaUpdate();
    });

    document.getElementById('ctrl-mode-ze')?.addEventListener('click', () => {
      if (!_layers.modeUrna) return;
      _layers.modeUrna = false;
      document.getElementById('ctrl-mode-ze').classList.add('map-ctrl-on');
      document.getElementById('ctrl-mode-urna').classList.remove('map-ctrl-on');
      _renderMapaUpdate();
    });

    // Camadas territoriais — comportamento de rádio (só uma ativa por vez)
    const _terrConfig = [
      { id: 'ctrl-zonas',   key: 'zePolygons', group: () => _mapZonaGroup,    loader: null       },
      { id: 'ctrl-regioes', key: 'regioes',    group: () => _mapRegioesGroup, loader: _addRegioes },
      { id: 'ctrl-apg',     key: 'apg',        group: () => _mapApgGroup,     loader: _addApg    },
      { id: 'ctrl-utb',     key: 'utb',        group: () => _mapUtbGroup,     loader: _addUtb    },
    ];

    const _deactivateTerr = () => {
      _terrConfig.forEach(cfg => {
        _layers[cfg.key] = false;
        document.getElementById(cfg.id)?.classList.remove('map-ctrl-on');
        if (_map.hasLayer(cfg.group())) _map.removeLayer(cfg.group());
      });
    };

    _terrConfig.forEach(cfg => {
      document.getElementById(cfg.id)?.addEventListener('click', async () => {
        const wasOn = _layers[cfg.key];
        _deactivateTerr();
        if (!wasOn) {
          _layers[cfg.key] = true;
          document.getElementById(cfg.id).classList.add('map-ctrl-on');
          const grp = cfg.group();
          if (cfg.loader && grp.getLayers().length === 0) await cfg.loader();
          grp.addTo(_map);
        }
      });
    });

    // Núcleos SEHAB — toggle independente (combina com qualquer camada territorial)
    document.getElementById('ctrl-sehab')?.addEventListener('click', async () => {
      _layers.sehab = !_layers.sehab;
      document.getElementById('ctrl-sehab').classList.toggle('map-ctrl-on', _layers.sehab);
      if (_layers.sehab) {
        if (_mapSehabGroup.getLayers().length === 0) await _addSehab();
        _mapSehabGroup.addTo(_map);
      } else {
        _map.removeLayer(_mapSehabGroup);
      }
    });
  }

  // ── Contorno do município ───────────────────────────────────
  async function _addCityBoundary() {
    try {
      const r = await fetch('data/geo/campinas_municipio.geojson');
      if (!r.ok) return;
      const gj = await r.json();
      L.geoJSON(gj, {
        style: { color: '#7C3AED', weight: 2.5, dashArray: '8 5', fillOpacity: 0, opacity: 0.65 },
      }).addTo(_mapCityGroup);
    } catch { /* sem contorno */ }
  }

  // ── Zonas eleitorais (hull convexo + hover) ─────────────────
  async function _addZoneBoundaries() {
    try {
      const r = await fetch('data/geo/locais_votos_2022.geojson');
      if (!r.ok) return;
      const gj = await r.json();

      const byZone = {};
      gj.features.forEach(f => {
        const z = String(f.properties.nr_zona).padStart(4, '0');
        const [lng, lat] = f.geometry.coordinates;
        if (!byZone[z]) byZone[z] = [];
        byZone[z].push([lng, lat]);
      });

      const style = { color: '#7C3AED', weight: 1.2, dashArray: '5 4', fillColor: '#EDE9FE', fillOpacity: 0.06, opacity: 0.4, interactive: false };

      Object.entries(byZone).forEach(([zona, pts]) => {
        const hull = _convexHull(pts);
        if (hull.length < 3) return;
        L.polygon(hull.map(([lng, lat]) => [lat, lng]), style).addTo(_mapZonaGroup);
      });
    } catch { /* sem zonas */ }
  }

  // ── Regiões administrativas (lazy + hover) ─────────────────
  async function _addRegioes() {
    try {
      const r = await fetch('data/geo/campinas_regioes.geojson');
      if (!r.ok) return;
      const gj = await r.json();

      const styleNormal = { color: '#059669', weight: 1.5, dashArray: '6 3', fillColor: '#D1FAE5', fillOpacity: 0.12, opacity: 0.6 };
      const styleHover  = { color: '#047857', weight: 2.5, dashArray: null,   fillColor: '#6EE7B7', fillOpacity: 0.30, opacity: 0.9 };

      L.geoJSON(gj, {
        style: styleNormal,
        onEachFeature: (feature, layer) => {
          const p = feature.properties || {};
          const label = p.DESCRICAO && p.REGIAO ? `${p.DESCRICAO} · ${p.REGIAO}` : (p.DESCRICAO || p.name || '');
          if (label) layer.bindTooltip(label, { sticky: true, className: 'map-tooltip' });
          layer.on('mouseover', () => layer.setStyle(styleHover));
          layer.on('mouseout',  () => layer.setStyle(styleNormal));
        },
      }).addTo(_mapRegioesGroup);
    } catch { /* sem regioes */ }
  }

  // ── Escala de cor por população ────────────────────────────
  function _popColor(value, min, max, h, s) {
    const t = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
    const l = Math.round(88 - t * 52);
    return `hsl(${h},${s}%,${l}%)`;
  }

  // ── APGs com choropleth de população ───────────────────────
  async function _addApg() {
    try {
      const r = await fetch('data/geo/campinas_pop_apg.geojson');
      if (!r.ok) return;
      const gj = await r.json();
      const pops = gj.features.map(f => f.properties.POP_2022 || 0);
      const [mn, mx] = [Math.min(...pops), Math.max(...pops)];

      L.geoJSON(gj, {
        style: f => {
          const fill = _popColor(f.properties.POP_2022 || 0, mn, mx, 210, 65);
          return { color: '#1D4ED8', weight: 1.5, dashArray: '6 3', fillColor: fill, fillOpacity: 0.45, opacity: 0.8 };
        },
        onEachFeature: (feature, layer) => {
          const p = feature.properties;
          const pop = p.POP_2022 ? Utils.fmt(p.POP_2022) : '—';
          const var_ = p.VAR_PERC_P ? `+${Number(p.VAR_PERC_P).toFixed(0)}% desde 1970` : '';
          const label = `<strong>${p.APG || p.NOME_COMPL}</strong><br>Pop. 2022: ${pop}${var_ ? '<br>' + var_ : ''}`;
          layer.bindTooltip(label, { sticky: true, className: 'map-tooltip' });
          const orig = { color: '#1D4ED8', weight: 1.5, dashArray: '6 3', fillColor: _popColor(p.POP_2022||0, mn, mx, 210, 65), fillOpacity: 0.45, opacity: 0.8 };
          const hover = { ...orig, weight: 2.5, dashArray: null, fillOpacity: 0.65, opacity: 1 };
          layer.on('mouseover', () => layer.setStyle(hover));
          layer.on('mouseout',  () => layer.setStyle(orig));
        },
      }).addTo(_mapApgGroup);
    } catch { /* sem APG */ }
  }

  // ── UTBs com choropleth de população ───────────────────────
  async function _addUtb() {
    try {
      const r = await fetch('data/geo/campinas_pop_utb.geojson');
      if (!r.ok) return;
      const gj = await r.json();
      const pops = gj.features.map(f => f.properties.POP_2022 || 0).filter(v => v > 0);
      const [mn, mx] = [Math.min(...pops), Math.max(...pops)];

      L.geoJSON(gj, {
        style: f => {
          const fill = _popColor(f.properties.POP_2022 || 0, mn, mx, 160, 55);
          return { color: '#065F46', weight: 1, dashArray: '4 3', fillColor: fill, fillOpacity: 0.40, opacity: 0.7 };
        },
        onEachFeature: (feature, layer) => {
          const p = feature.properties;
          const pop = p.POP_2022 ? Utils.fmt(p.POP_2022) : '—';
          layer.bindTooltip(`<strong>${p.UTB_SIGLA}</strong><br>Pop. 2022: ${pop}`, { sticky: true, className: 'map-tooltip' });
          const orig = { color: '#065F46', weight: 1, dashArray: '4 3', fillColor: _popColor(p.POP_2022||0, mn, mx, 160, 55), fillOpacity: 0.40, opacity: 0.7 };
          const hover = { ...orig, weight: 2, dashArray: null, fillOpacity: 0.60, opacity: 1 };
          layer.on('mouseover', () => layer.setStyle(hover));
          layer.on('mouseout',  () => layer.setStyle(orig));
        },
      }).addTo(_mapUtbGroup);
    } catch { /* sem UTB */ }
  }

  // ── Núcleos Urbanos SEHAB ───────────────────────────────────
  async function _addSehab() {
    try {
      const r = await fetch('data/geo/campinas_nucleos_sehab.geojson');
      if (!r.ok) return;
      const gj = await r.json();
      const styleN = { color: '#B45309', weight: 1, dashArray: null, fillColor: '#FDE68A', fillOpacity: 0.55, opacity: 0.8 };
      const styleH = { color: '#92400E', weight: 2, fillColor: '#FCD34D', fillOpacity: 0.75, opacity: 1 };
      L.geoJSON(gj, {
        style: styleN,
        onEachFeature: (feature, layer) => {
          const nome = feature.properties?.NOME_AREA || '';
          if (nome) layer.bindTooltip(nome, { sticky: true, className: 'map-tooltip' });
          layer.on('mouseover', () => layer.setStyle(styleH));
          layer.on('mouseout',  () => layer.setStyle(styleN));
        },
      }).addTo(_mapSehabGroup);
    } catch { /* sem SEHAB */ }
  }

  // ── Hull convexo (Andrew's monotone chain) ──────────────────
  function _convexHull(pts) {
    if (pts.length < 3) return pts;
    const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
    const lower = [];
    for (const pt of p) {
      while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], pt) <= 0) lower.pop();
      lower.push(pt);
    }
    const upper = [];
    for (let i = p.length-1; i >= 0; i--) {
      const pt = p[i];
      while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], pt) <= 0) upper.pop();
      upper.push(pt);
    }
    lower.pop(); upper.pop();
    return [...lower, ...upper];
  }

  // ── Atualiza candidatos no mapa ─────────────────────────────
  async function _renderMapaUpdate() {
    if (!_map) return;
    _mapGroup.clearLayers();
    _mapGroupB.clearLayers();

    const a = _st.candA;
    const b = _st.candB;

    const boundsA = a ? await _renderMapCand(a, _st.yearA, _mapGroup,  '#7C3AED', '#4C1D95', '#FACC15', _layers.modeUrna) : [];
    const boundsB = b ? await _renderMapCand(b, _st.yearB, _mapGroupB, '#D97706', '#92400E', '#FCD34D', false)             : [];

    const allBounds = [...boundsA, ...boundsB];
    if (allBounds.length) _map.fitBounds(L.latLngBounds(allBounds), { padding: [36, 36] });

    _updateMapLegend(a, b);
  }

  // ── Renderiza um candidato no mapa ──────────────────────────
  async function _renderMapCand(cand, year, group, fillColor, borderColor, heatColor, showHeat) {
    const bounds = [];
    const isEdiane = cand.nr === '50110' && year === '2022';
    const isThamy  = cand.nr === '50019' && year === '2024';
    const useUrnaData = _layers.modeUrna && (isEdiane || isThamy);

    if (useUrnaData) {
      const gjFile = isEdiane ? 'data/geo/locais_votos_2022.geojson' : 'data/geo/locais_votos_2024.geojson';
      const vField  = isEdiane ? 'votos_ediane' : 'votos_thamy';
      try {
        const r = await fetch(gjFile);
        if (!r.ok) return bounds;
        const gj = await r.json();
        const pts = gj.features.filter(f => (f.properties[vField]||0) >= 1);
        if (!pts.length) return bounds;
        const maxV = Math.max(...pts.map(f => f.properties[vField]||0), 1);

        if (showHeat) {
          L.heatLayer(pts.map(f => {
            const [lng, lat] = f.geometry.coordinates;
            return [lat, lng, (f.properties[vField]||0) / maxV];
          }), {
            radius: 35, blur: 25, minOpacity: 0.25, max: 1.0,
            gradient: { 0.2: '#6D28D9', 0.5: '#8B5CF6', 0.8: '#C4B5FD', 1.0: heatColor },
          }).addTo(group);
        }

        pts.forEach(f => {
          const [lng, lat] = f.geometry.coordinates;
          const v = f.properties[vField];
          const rd = Math.max(3, Math.round(3 + (v / maxV) * 9));
          L.circleMarker([lat, lng], {
            radius: rd, fillColor: fillColor, color: borderColor, weight: 1, fillOpacity: 0.85,
          }).bindTooltip(
            `<strong>${v} votos</strong><br>ZE ${String(f.properties.nr_zona).padStart(4,'0')} · Local ${f.properties.nr_local}`,
            { direction: 'top' }
          ).addTo(group);
          bounds.push([lat, lng]);
        });
      } catch { /* sem dados */ }

    } else {
      // Círculos por zona eleitoral (centroide)
      try {
        const gjYear = year === '2024' ? '2024' : '2022';
        const [gjResp, nomCSV] = await Promise.all([
          fetch(`data/geo/locais_votos_${gjYear}.geojson`),
          Utils.loadCSV(`data/resultados/votos_nominais_ze_${year}.csv`).catch(() => []),
        ]);
        if (!gjResp.ok) return bounds;
        const gj = await gjResp.json();

        const acc = {};
        gj.features.forEach(f => {
          const z = String(f.properties.nr_zona).padStart(4,'0');
          const [lng, lat] = f.geometry.coordinates;
          if (!acc[z]) acc[z] = { lat: 0, lng: 0, n: 0 };
          acc[z].lat += lat; acc[z].lng += lng; acc[z].n++;
        });
        const centroids = {};
        Object.entries(acc).forEach(([z, c]) => { centroids[z] = [c.lat/c.n, c.lng/c.n]; });

        const zv = {};
        nomCSV.filter(d => String(d.nr_candidato).trim() === cand.nr)
              .forEach(d => { zv[String(d.zona).padStart(4,'0')] = Number(d.votos)||0; });

        const maxV = Math.max(...Object.values(zv), 1);
        Object.entries(centroids).forEach(([z, [lat, lng]]) => {
          const v = zv[z] || 0;
          if (!v) return;
          const rd = Math.max(8, Math.round(8 + (v / maxV) * 22));
          L.circleMarker([lat, lng], {
            radius: rd, fillColor: fillColor, color: borderColor, weight: 1.5, fillOpacity: 0.65,
          }).bindTooltip(`<strong>${Utils.fmt(v)} votos</strong><br>ZE ${z}`, { direction: 'top' })
            .addTo(group);
          bounds.push([lat, lng]);
        });
      } catch { /* sem dados */ }
    }
    return bounds;
  }

  // ── Legenda do mapa ─────────────────────────────────────────
  function _updateMapLegend(a, b) {
    const el = document.getElementById('op-map-legend');
    if (!el) return;
    if (!a && !b) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.innerHTML = [
      a ? `<div class="map-legend-item"><span class="map-legend-dot" style="background:#7C3AED;border-color:#4C1D95"></span>${a.nm}</div>` : '',
      b ? `<div class="map-legend-item"><span class="map-legend-dot" style="background:#D97706;border-color:#92400E"></span>${b.nm}</div>` : '',
    ].join('');
  }

  return { render };
})();
