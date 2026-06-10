const OnePage = (() => {

  // ── Estado dos filtros ──────────────────────────────────────
  const _st = {
    yearA: '2022',
    candA: { nr: '50110', nm: 'Ediane Maria', partido: 'PSOL', cargo: 'Deputado Estadual' },
    yearB: '2024',
    candB: { nr: '50019', nm: 'Thamy do Mandela', partido: 'PSOL', cargo: 'Vereador' },
  };

  let _map = null;
  let _mapGroup = null;
  let _allCands = {};

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
        <div class="content-card" style="overflow:hidden">
          <div class="content-card-header">
            <span class="content-card-title" id="op-map-title">Distribuição de Votos</span>
            <span style="font-size:11px;color:var(--texto-secundario)">intensidade = votos no local de votação</span>
          </div>
          <div class="map-container-report"><div id="op-map"></div></div>
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
    `;

    await _loadAllCands();
    _buildFilterBar();
    _initTooltip();
    _updateLabels();

    await Promise.all([
      _renderMetrics(),
      _renderZonaTable(),
      _renderZonasChart(),
      _renderPerfil(),
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

    _updateCandA = _searchSelect('ss-cand-a', _allCands['2022'], '50110', false, nr => {
      const c = (_allCands[_st.yearA] || []).find(x => String(x.nr_candidato) === nr);
      _st.candA = c ? _toCand(c) : null;
      _onChange();
    });

    _updateCandB = _searchSelect('ss-cand-b', _allCands['2024'], '50019', true, nr => {
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

  // ── Mapa ────────────────────────────────────────────────────
  async function _renderMapa() {
    const mapEl = document.getElementById('op-map');
    if (!mapEl || _map) return;

    _map = L.map('op-map', { zoomControl: true }).setView([-22.9064, -47.0616], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(_map);
    _mapGroup = L.layerGroup().addTo(_map);
    setTimeout(() => _map.invalidateSize(), 150);

    await _renderMapaUpdate();
  }

  async function _renderMapaUpdate() {
    if (!_map || !_mapGroup) return;
    _mapGroup.clearLayers();

    const a = _st.candA;
    if (!a) return;

    const isEdiane = a.nr === '50110' && _st.yearA === '2022';
    const isThamy  = a.nr === '50019' && _st.yearA === '2024';

    if (isEdiane || isThamy) {
      // Per-location heatmap para candidatas com GeoJSON pré-computado
      const gjFile = isEdiane ? 'data/geo/locais_votos_2022.geojson' : 'data/geo/locais_votos_2024.geojson';
      const vField  = isEdiane ? 'votos_ediane' : 'votos_thamy';
      try {
        const r = await fetch(gjFile);
        if (!r.ok) return;
        const gj = await r.json();
        const pts = gj.features.filter(f => (f.properties[vField]||0) >= 1);
        if (!pts.length) return;
        const maxV = Math.max(...pts.map(f => f.properties[vField]), 1);

        L.heatLayer(pts.map(f => {
          const [lng, lat] = f.geometry.coordinates;
          return [lat, lng, f.properties[vField] / maxV];
        }), { radius: 30, blur: 20, minOpacity: 0.3, max: 1.0,
              gradient: { 0.2: '#6D28D9', 0.5: '#8B5CF6', 0.8: '#C4B5FD', 1.0: '#FACC15' } })
          .addTo(_mapGroup);

        pts.forEach(f => {
          const [lng, lat] = f.geometry.coordinates;
          const v = f.properties[vField];
          const rd = Math.max(4, Math.round(3 + (v / maxV) * 8));
          L.circleMarker([lat, lng], {
            radius: rd, fillColor: '#FACC15', color: '#4C1D95', weight: 1, fillOpacity: 0.85,
          }).bindTooltip(`<strong>${v} votos</strong><br>ZE ${f.properties.nr_zona} · Local ${f.properties.nr_local}`, { direction: 'top' })
            .addTo(_mapGroup);
        });

        _map.fitBounds(L.latLngBounds(pts.map(f => {
          const [lng, lat] = f.geometry.coordinates; return [lat, lng];
        })), { padding: [32, 32] });
      } catch { /* sem mapa */ }

    } else {
      // Círculos por zona (centroide calculado a partir do GeoJSON)
      try {
        const gjYear = _st.yearA === '2024' ? '2024' : '2022';
        const [gjResp, nomCSV] = await Promise.all([
          fetch(`data/geo/locais_votos_${gjYear}.geojson`),
          Utils.loadCSV(`data/resultados/votos_nominais_ze_${_st.yearA}.csv`).catch(() => []),
        ]);
        if (!gjResp.ok) return;
        const gj = await gjResp.json();

        // Calcula centroide de cada zona
        const acc = {};
        gj.features.forEach(f => {
          const z = String(f.properties.nr_zona).padStart(4,'0');
          const [lng, lat] = f.geometry.coordinates;
          if (!acc[z]) acc[z] = { lat: 0, lng: 0, n: 0 };
          acc[z].lat += lat; acc[z].lng += lng; acc[z].n++;
        });
        const centroids = {};
        Object.entries(acc).forEach(([z, c]) => { centroids[z] = [c.lat / c.n, c.lng / c.n]; });

        // Votos do candidato por zona
        const zv = {};
        nomCSV.filter(d => String(d.nr_candidato).trim() === a.nr)
              .forEach(d => { zv[String(d.zona).padStart(4,'0')] = Number(d.votos)||0; });

        const maxV = Math.max(...Object.values(zv), 1);
        const bounds = [];

        Object.entries(centroids).forEach(([z, [lat, lng]]) => {
          const v = zv[z] || 0;
          if (!v) return;
          const rd = Math.max(8, Math.round(8 + (v / maxV) * 24));
          L.circleMarker([lat, lng], {
            radius: rd, fillColor: '#7C3AED', color: '#4C1D95', weight: 1.5, fillOpacity: 0.65,
          }).bindTooltip(`<strong>${Utils.fmt(v)} votos</strong><br>ZE ${z}`, { direction: 'top' })
            .addTo(_mapGroup);
          bounds.push([lat, lng]);
        });

        if (bounds.length) _map.fitBounds(L.latLngBounds(bounds), { padding: [48, 48] });
      } catch { /* sem mapa */ }
    }
  }

  return { render };
})();
