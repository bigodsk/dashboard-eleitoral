const App = (() => {
  async function init() {
    const container = document.getElementById('report-main');

    try {
      await OnePage.render(container);
    } catch (err) {
      console.error('OnePage.render falhou:', err);
      container.innerHTML = `
        <div class="loading-overlay" style="height:calc(100vh - 56px);color:#dc2626;flex-direction:column;gap:8px">
          <div style="font-size:16px;font-weight:600">Erro ao renderizar página</div>
          <div style="font-size:13px;color:#6B7280">${err.message}</div>
        </div>`;
    }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
