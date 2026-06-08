const Utils = (() => {
  const CONFIG_URL = 'data/config.json';
  let _config = null;

  async function loadConfig() {
    if (_config) return _config;
    const r = await fetch(CONFIG_URL);
    _config = await r.json();
    return _config;
  }

  async function loadCSV(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Erro ao carregar ${url}: ${r.status}`);
    const text = await r.text();
    return parseCSV(text);
  }

  function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map(line => {
      const vals = splitCSVLine(line);
      const obj = {};
      headers.forEach((h, i) => {
        const v = (vals[i] || '').trim().replace(/^"|"$/g, '');
        obj[h] = isNaN(v) || v === '' ? v : Number(v);
      });
      return obj;
    });
  }

  function splitCSVLine(line) {
    const result = [];
    let cur = '';
    let inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { result.push(cur); cur = ''; }
      else { cur += ch; }
    }
    result.push(cur);
    return result;
  }

  async function loadJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Erro ao carregar ${url}: ${r.status}`);
    return r.json();
  }

  function fmt(n, decimals = 0) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function fmtPct(n, decimals = 1) {
    if (n == null || isNaN(n)) return '—';
    return fmt(n, decimals) + '%';
  }

  function badgeHTML(classificacao) {
    const map = { 'Consolidar': 'consolidar', 'Crescer': 'crescer', 'Prospectar': 'prospectar' };
    const cls = map[classificacao] || 'prospectar';
    return `<span class="badge badge-${cls}">${classificacao}</span>`;
  }

  function loading(el) {
    el.innerHTML = `<div class="loading-overlay"><div class="spinner"></div>Carregando...</div>`;
  }

  function error(el, msg) {
    el.innerHTML = `<div class="loading-overlay" style="color:#dc2626">Erro: ${msg}</div>`;
  }

  return { loadConfig, loadCSV, loadJSON, fmt, fmtPct, badgeHTML, loading, error };
})();
