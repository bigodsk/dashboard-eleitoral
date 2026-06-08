const Filters = (() => {
  const state = {
    ano: 2024,
    partidos: [],
    ze: null,
    cargo: 'deputado_estadual',
    anoComparacao: 2018,
  };

  const listeners = {};

  function on(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
  }

  function emit(event, data) {
    (listeners[event] || []).forEach(fn => fn(data));
  }

  function set(key, value) {
    state[key] = value;
    emit('change', { key, value, state: { ...state } });
    emit(`change:${key}`, value);
  }

  function get(key) {
    return key ? state[key] : { ...state };
  }

  function buildAnoSelect(containerId, anos, defaultAno) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    anos.forEach(ano => {
      const opt = document.createElement('option');
      opt.value = ano;
      opt.textContent = ano;
      if (ano === defaultAno) opt.selected = true;
      el.appendChild(opt);
    });
    el.addEventListener('change', () => set('ano', parseInt(el.value)));
  }

  function buildPartidoChips(containerId, partidos, campo) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const allChip = `<button class="chip active" data-partido="todos">Campo Total</button>`;
    const chips = [allChip, ...campo.map(p =>
      `<button class="chip" data-partido="${p}">${p}</button>`
    )].join('');
    el.innerHTML = chips;

    el.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        el.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const partido = btn.dataset.partido;
        set('partidos', partido === 'todos' ? [] : [partido]);
      });
    });
  }

  return { on, set, get, buildAnoSelect, buildPartidoChips };
})();
