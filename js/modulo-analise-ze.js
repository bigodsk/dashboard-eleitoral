const ModuloAnaliseZE = (() => {

  let _mapInstance  = null;
  let _heatLayer    = null;
  let _markersLayer = null;
  let _locaisGeo    = null;
  let _candidatos   = null;
  let _anoAtual     = null;

  async function render(container, config) {
    const anos = config.anos_disponiveis;
    const anoDefault = anos[anos.length - 1];

    container.innerHTML = `
      <div class="page-header">
        <div class="page-title">Análise por Zona Eleitoral</div>
        <div class="page-subtitle">Mapa de calor dos votos por local de votação</div>
      </div>
      <div class="page-body">

        <div class="filters-bar" style="flex-wrap:wrap;gap:12px;align-items:flex-end">
          <div class="filter-group">
            <label class="filter-label">Eleição</label>
            <select class="filter-select" id="ze-ano"></select>
          </div>
          <div class="filter-group" style="flex:1;min-width:260px">
            <label class="filter-label">Candidato / Agrupamento</label>
            <select class="filter-select" id="ze-candidato" style="width:100%;max-width:420px"></select>
          </div>
          <div class="filter-group">
            <label class="filter-label">Modo</label>
            <div class="filter-chips" id="ze-modo">
              <button class="chip active" data-modo="calor">Calor</button>
              <button class="chip" data-modo="pontos">Pontos</button>
            </div>
          </div>
        </div>

        <div id="ze-resumo" style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap"></div>

        <div class="content-card" style="margin-bottom:16px">
          <div style="padding:0">
            <div id="map-analise-ze" style="height:520px;border-radius:var(--radius-lg);overflow:hidden"></div>
          </div>
        </div>

        <div class="content-card">
          <div class="content-card-header">
            <span class="content-card-title" id="ze-tabela-titulo">Top locais por votos</span>
          </div>
          <div class="content-card-body" style="padding:0">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <thead>
                <tr style="border-bottom:1px solid var(--borda);color:var(--texto-secundario)">
                  <th style="padding:8px 12px;text-align:left;font-weight:500">#</th>
                  <th style="padding:8px 12px;text-align:left;font-weight:500">Local / Zona</th>
                  <th style="padding:8px 12px;text-align:right;font-weight:500">Votos</th>
                  <th style="padding:8px 12px;text-align:right;font-weight:500">% do total</th>
                </tr>
              </thead>
              <tbody id="ze-tabela-body">
                <tr><td colspan="4" style="padding:24px;text-align:center;color:var(--texto-secundario)">
                  <div class="spinner" style="margin:0 auto 8px"></div>Carregando...
                </td></tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    `;

    _construirModoChips(config);
    await _carregarAno(anoDefault, config);

    document.getElementById('ze-ano').addEventListener('change', async e => {
      await _carregarAno(parseInt(e.target.value), config);
    });
  }

  async function _carregarAno(ano, config) {
    _anoAtual = ano;

    const anoSel = document.getElementById('ze-ano');
    if (anoSel && !anoSel.querySelector(`option[value="${ano}"]`)) {
      anoSel.innerHTML = '';
      (config.anos_disponiveis || [ano]).forEach(a => {
        const tipo = (config.anos_municipal || []).includes(a) ? 'Vereador' : 'Dep. Est.';
        const opt = document.createElement('option');
        opt.value = a;
        opt.textContent = `${a} — ${tipo}`;
        if (a === ano) opt.selected = true;
        anoSel.appendChild(opt);
      });
    } else if (anoSel) {
      anoSel.value = ano;
    }

    _locaisGeo = null;
    try {
      const r = await fetch(`data/geo/locais_votos_${ano}.geojson`);
      if (r.ok) _locaisGeo = await r.json();
    } catch (_) {}

    _candidatos = null;
    try { _candidatos = await Utils.loadCSV(`data/resultados/candidatos_local_${ano}.csv`); } catch (_) {}

    _popularCandidatos(ano, config);
    await _renderizar(ano, config);
  }

  function _popularCandidatos(ano, config) {
    const sel = document.getElementById('ze-candidato');
    if (!sel) return;
    sel.innerHTML = '';

    const refs  = config.candidatos_referencia?.[String(ano)] || {};
    const nomes = config.candidatos_nomes || {};

    const grpRef = document.createElement('optgroup');
    grpRef.label = 'Referências';
    _addOpt(grpRef, 'campo', 'Campo Progressista (todos os partidos)');
    Object.entries(refs).forEach(([nr, apelido]) => {
      _addOpt(grpRef, `ref:${nr}`, `★ ${nomes[apelido] || apelido}`);
    });
    sel.appendChild(grpRef);

    if (_candidatos && _candidatos.length > 0) {
      const totais = {}, nomesCand = {}, partidos = {};
      _candidatos.forEach(d => {
        const k = String(d.nr_candidato);
        totais[k] = (totais[k] || 0) + (Number(d.votos) || 0);
        nomesCand[k] = d.nm_candidato;
        partidos[k] = d.sg_partido || '';
      });

      const refNrs = new Set(Object.keys(refs));
      const sorted = Object.entries(totais)
        .filter(([nr]) => !refNrs.has(nr))
        .sort((a, b) => b[1] - a[1]);

      const grpAll = document.createElement('optgroup');
      grpAll.label = 'Todos os candidatos';
      sorted.forEach(([nr, total]) => {
        const pt = partidos[nr] ? ` (${partidos[nr]})` : '';
        _addOpt(grpAll, `cand:${nr}`, `${nomesCand[nr] || nr}${pt} — ${total.toLocaleString('pt-BR')} votos`);
      });
      sel.appendChild(grpAll);
    }

    if (sel._handler) sel.removeEventListener('change', sel._handler);
    sel._handler = async () => { await _renderizar(_anoAtual, config); };
    sel.addEventListener('change', sel._handler);
  }

  function _addOpt(parent, value, text) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = text;
    parent.appendChild(opt);
  }

  async function _renderizar(ano, config) {
    const sel   = document.getElementById('ze-candidato');
    const selM  = document.querySelector('#ze-modo .chip.active');
    const modo  = selM?.dataset.modo || 'calor';
    const valor = sel?.value || 'campo';

    if (!_locaisGeo) {
      _mostrarErroMapa(`Dados de ${ano} não encontrados.`);
      document.getElementById('ze-resumo').innerHTML = '';
      document.getElementById('ze-tabela-body').innerHTML =
        `<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--texto-secundario)">Sem dados</td></tr>`;
      return;
    }

    const refs  = config.candidatos_referencia?.[String(ano)] || {};
    const nomes = config.candidatos_nomes || {};
    let pontos = [], tituloLabel = '';

    if (valor === 'campo') {
      tituloLabel = 'Campo Progressista';
      _locaisGeo.features.forEach(f => {
        const p = f.properties;
        const v = Number(p.votos_campo) || 0;
        if (v > 0) pontos.push({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], votos: v, nr_local: p.nr_local, nr_zona: p.nr_zona });
      });

    } else if (valor.startsWith('ref:')) {
      const nr     = valor.slice(4);
      const apelido = refs[nr];
      tituloLabel  = nomes[apelido] || `Candidato ${nr}`;
      const key    = `votos_${apelido}`;
      _locaisGeo.features.forEach(f => {
        const p = f.properties;
        const v = Number(p[key]) || 0;
        if (v > 0) pontos.push({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], votos: v, nr_local: p.nr_local, nr_zona: p.nr_zona });
      });

    } else if (valor.startsWith('cand:') && _candidatos) {
      const nr    = valor.slice(5);
      const first = _candidatos.find(d => String(d.nr_candidato) === nr) || {};
      const pt    = first.sg_partido ? ` (${first.sg_partido})` : '';
      tituloLabel = `${first.nm_candidato || nr}${pt}`;

      const porLocal = {};
      _candidatos
        .filter(d => String(d.nr_candidato) === nr)
        .forEach(d => {
          const k = d.nr_local;
          if (!porLocal[k]) porLocal[k] = { votos: 0, lat: Number(d.lat), lng: Number(d.lng), nr_zona: d.nr_zona };
          porLocal[k].votos += Number(d.votos) || 0;
        });

      Object.entries(porLocal).forEach(([nr_local, info]) => {
        if (info.votos > 0 && info.lat && info.lng)
          pontos.push({ lat: info.lat, lng: info.lng, votos: info.votos, nr_local, nr_zona: info.nr_zona });
      });
    }

    _renderizarResumo(pontos, tituloLabel, ano);
    _renderizarMapa(pontos, modo, tituloLabel);
    _renderizarTabela(pontos, tituloLabel, ano);
  }

  function _renderizarResumo(pontos, label, ano) {
    const el = document.getElementById('ze-resumo');
    if (!el) return;
    const total  = pontos.reduce((s, p) => s + p.votos, 0);
    const top    = [...pontos].sort((a, b) => b.votos - a.votos)[0];
    const zonas  = new Set(pontos.map(p => p.nr_zona)).size;

    el.innerHTML = `
      <div class="metric-card" style="flex:1;min-width:140px">
        <div class="metric-label">${label}</div>
        <div class="metric-value" style="font-size:1.7rem">${Utils.fmt(total)}</div>
        <div class="metric-label" style="margin-top:4px">votos — ${ano}</div>
      </div>
      <div class="metric-card" style="flex:1;min-width:140px">
        <div class="metric-label">Locais com voto</div>
        <div class="metric-value" style="font-size:1.7rem">${pontos.length}</div>
        <div class="metric-label" style="margin-top:4px">locais de votação</div>
      </div>
      <div class="metric-card" style="flex:1;min-width:140px">
        <div class="metric-label">Zonas alcançadas</div>
        <div class="metric-value" style="font-size:1.7rem">${zonas}</div>
        <div class="metric-label" style="margin-top:4px">zonas eleitorais</div>
      </div>
      ${top ? `<div class="metric-card" style="flex:1;min-width:140px">
        <div class="metric-label">Melhor local</div>
        <div class="metric-value" style="font-size:1.4rem">${Utils.fmt(top.votos)}</div>
        <div class="metric-label" style="margin-top:4px">votos · Zona ${String(top.nr_zona||'').padStart(4,'0')}</div>
      </div>` : ''}
    `;
  }

  function _renderizarMapa(pontos, modo, label) {
    if (_mapInstance) { _mapInstance.remove(); _mapInstance = null; _heatLayer = null; _markersLayer = null; }

    const map = L.map('map-analise-ze', {
      center: [-22.9064, -47.0616], zoom: 12,
      zoomControl: true, attributionControl: false,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
    _mapInstance = map;
    setTimeout(() => map.invalidateSize(), 80);

    if (pontos.length === 0) {
      const c = L.control({ position: 'topright' });
      c.onAdd = () => { const d = L.DomUtil.create('div'); d.style.cssText = 'background:rgba(28,27,46,.9);padding:10px 14px;border-radius:8px;color:#A78BFA;font-size:12px'; d.textContent = 'Sem votos para esta seleção.'; return d; };
      c.addTo(map);
      return;
    }

    const maxV = Math.max(...pontos.map(p => p.votos));

    if (modo === 'calor') {
      _heatLayer = L.heatLayer(
        pontos.map(p => [p.lat, p.lng, p.votos / maxV]),
        { radius: 28, blur: 22, maxZoom: 16, gradient: { 0.1: '#4C1D95', 0.4: '#7C3AED', 0.7: '#A78BFA', 1.0: '#FACC15' } }
      ).addTo(map);
    } else {
      const features = pontos.map(p => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: p,
      }));
      _markersLayer = L.geoJSON({ type: 'FeatureCollection', features }, {
        pointToLayer(feat, latlng) {
          const r = 4 + Math.round((feat.properties.votos / maxV) * 14);
          const t = feat.properties.votos / maxV;
          return L.circleMarker(latlng, { radius: r, fillColor: t > 0.6 ? '#FACC15' : t > 0.3 ? '#A78BFA' : '#7C3AED', fillOpacity: 0.85, color: '#fff', weight: 1 });
        },
        onEachFeature(feat, layer) {
          layer.bindTooltip(`Zona ${String(feat.properties.nr_zona||'').padStart(4,'0')}<br><strong>${Utils.fmt(feat.properties.votos)}</strong> votos`, { sticky: true });
        },
      }).addTo(map);
    }

    // Legenda
    const leg = L.control({ position: 'bottomright' });
    leg.onAdd = () => {
      const d = L.DomUtil.create('div');
      d.style.cssText = 'background:rgba(28,27,46,.9);padding:10px 14px;border-radius:8px;font-size:11px;color:#fff;min-width:140px';
      d.innerHTML = `<div style="font-weight:600;margin-bottom:6px;font-size:10px;text-transform:uppercase;letter-spacing:.06em">${label}</div>`
        + `<div style="height:10px;background:linear-gradient(to right,#4C1D95,#7C3AED,#A78BFA,#FACC15);border-radius:4px;margin-bottom:4px"></div>`
        + `<div style="display:flex;justify-content:space-between;font-size:10px;color:#A78BFA"><span>0</span><span>${Utils.fmt(maxV)}</span></div>`;
      return d;
    };
    leg.addTo(map);
  }

  function _mostrarErroMapa(msg) {
    const el = document.getElementById('map-analise-ze');
    if (el) el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#A78BFA;font-size:13px;background:#1C1B2E">${msg}</div>`;
  }

  function _renderizarTabela(pontos, label, ano) {
    const tbody = document.getElementById('ze-tabela-body');
    const tit   = document.getElementById('ze-tabela-titulo');
    if (!tbody) return;
    if (tit) tit.textContent = `Top locais — ${label} (${ano})`;

    const total  = pontos.reduce((s, p) => s + p.votos, 0);
    const sorted = [...pontos].sort((a, b) => b.votos - a.votos).slice(0, 15);

    if (sorted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--texto-secundario)">Sem dados</td></tr>`;
      return;
    }

    tbody.innerHTML = sorted.map((p, i) => `
      <tr style="border-bottom:1px solid var(--borda)">
        <td style="padding:8px 12px;color:var(--texto-secundario)">${i + 1}</td>
        <td style="padding:8px 12px">
          <span style="font-weight:500">Local ${p.nr_local || '—'}</span>
          <span style="color:var(--texto-secundario);font-size:11px;margin-left:6px">Zona ${String(p.nr_zona||'').padStart(4,'0')}</span>
        </td>
        <td style="padding:8px 12px;text-align:right;font-weight:600;color:var(--psol-roxo)">${Utils.fmt(p.votos)}</td>
        <td style="padding:8px 12px;text-align:right;color:var(--texto-secundario)">${total > 0 ? Utils.fmtPct(p.votos / total * 100) : '—'}</td>
      </tr>
    `).join('');
  }

  function _construirModoChips(config) {
    const container = document.getElementById('ze-modo');
    if (!container) return;
    container.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', async () => {
        container.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        await _renderizar(_anoAtual, config);
      });
    });
  }

  return { render };
})();
