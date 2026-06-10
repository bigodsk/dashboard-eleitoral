const App = (() => {
  async function init() {
    const container = document.getElementById('report-main');

    let config;
    try {
      config = await Utils.loadConfig();
    } catch (err) {
      container.innerHTML = `
        <div class="loading-overlay" style="height:calc(100vh - 56px);color:#dc2626;flex-direction:column;gap:8px">
          <div style="font-size:18px">Erro ao carregar configuração</div>
          <div style="font-size:13px;color:#6B7280">${err.message}</div>
        </div>`;
      return;
    }

    await OnePage.render(container, config);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
