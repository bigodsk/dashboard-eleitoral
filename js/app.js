const App = (() => {
  const MODULES = [
    { id: 'visao-geral',   label: 'Visão Geral',         icon: '◉' },
    { id: 'analise-ze',    label: 'Análise por ZE',       icon: '◎' },
    { id: 'priorizacao',   label: 'Priorização',          icon: '▲' },
    { id: 'perfil',        label: 'Perfil do Eleitor',    icon: '◑' },
    { id: 'evolucao',      label: 'Evolução Temporal',    icon: '◇' },
  ];

  let currentModule = null;
  let config = null;

  async function init() {
    config = await Utils.loadConfig();
    renderNav();
    const hash = location.hash.replace('#', '') || 'visao-geral';
    navigateTo(hash);

    window.addEventListener('hashchange', () => {
      const id = location.hash.replace('#', '');
      if (id) navigateTo(id);
    });
  }

  function renderNav() {
    const nav = document.getElementById('sidebar-nav');
    if (!nav) return;

    MODULES.forEach(m => {
      const btn = document.createElement('button');
      btn.className = 'nav-item';
      btn.dataset.module = m.id;
      btn.innerHTML = `<span class="nav-icon">${m.icon}</span><span>${m.label}</span>`;
      btn.addEventListener('click', () => {
        location.hash = m.id;
      });
      nav.appendChild(btn);
    });
  }

  function navigateTo(moduleId) {
    const mod = MODULES.find(m => m.id === moduleId);
    if (!mod) { navigateTo('visao-geral'); return; }

    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.module === moduleId);
    });

    currentModule = moduleId;
    renderModule(moduleId);
  }

  function renderModule(id) {
    const main = document.getElementById('main-content');
    if (!main) return;

    main.innerHTML = `<div class="loading-overlay"><div class="spinner"></div>Carregando módulo...</div>`;

    const loaders = {
      'visao-geral': () => ModuloVisaoGeral.render(main, config),
      'analise-ze':  () => ModuloAnaliseZE.render(main, config),
      'priorizacao': () => ModuloPriorizacao.render(main, config),
      'perfil':      () => ModuloPerfil.render(main, config),
      'evolucao':    () => ModuloEvolucao.render(main, config),
    };

    const loader = loaders[id];
    if (loader) {
      loader().catch(err => {
        console.error(err);
        main.innerHTML = `<div class="loading-overlay" style="color:#dc2626">Erro ao carregar módulo: ${err.message}</div>`;
      });
    }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
