const Charts = (() => {
  const DEFAULTS = {
    font: 'Inter, -apple-system, sans-serif',
    colors: {
      roxo: '#7C3AED',
      roxoMedio: '#A78BFA',
      roxoClaro: '#EDE9FE',
      amarelo: '#FACC15',
      verde: '#16A34A',
      azul: '#2563EB',
      cinza: '#94A3B8',
    },
    gridColor: 'rgba(229,224,245,0.6)',
    textColor: '#6B7280',
  };

  Chart.defaults.font.family = DEFAULTS.font;
  Chart.defaults.font.size = 11;
  Chart.defaults.color = DEFAULTS.textColor;

  const _instances = {};

  function destroy(id) {
    if (_instances[id]) {
      _instances[id].destroy();
      delete _instances[id];
    }
  }

  function lineSerie(ctx, labels, datasets, options = {}) {
    destroy(ctx.id || ctx.canvas?.id);
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: datasets.map((d, i) => ({
          borderColor: d.color || Object.values(DEFAULTS.colors)[i],
          backgroundColor: 'transparent',
          pointBackgroundColor: d.color || Object.values(DEFAULTS.colors)[i],
          borderWidth: 2,
          pointRadius: 4,
          tension: 0.3,
          ...d,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, padding: 16 } },
          tooltip: { mode: 'index', intersect: false },
        },
        scales: {
          x: { grid: { color: DEFAULTS.gridColor }, ticks: { font: { size: 11 } } },
          y: {
            grid: { color: DEFAULTS.gridColor },
            ticks: {
              font: { size: 11 },
              callback: v => options.pct ? v + '%' : v,
            },
          },
        },
        ...options.chartOptions,
      },
    });
    if (ctx.id) _instances[ctx.id] = chart;
    return chart;
  }

  function barGrouped(ctx, labels, datasets, options = {}) {
    destroy(ctx.id || ctx.canvas?.id);
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: datasets.map((d, i) => ({
          backgroundColor: d.color || Object.values(DEFAULTS.colors)[i],
          borderRadius: 4,
          ...d,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, padding: 16 } },
          tooltip: { mode: 'index', intersect: false },
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            grid: { color: DEFAULTS.gridColor },
            ticks: { callback: v => options.pct ? v + '%' : v },
          },
        },
        ...options.chartOptions,
      },
    });
    if (ctx.id) _instances[ctx.id] = chart;
    return chart;
  }

  function barStacked(ctx, labels, datasets, options = {}) {
    destroy(ctx.id || ctx.canvas?.id);
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: datasets.map((d, i) => ({
          backgroundColor: d.color || Object.values(DEFAULTS.colors)[i],
          ...d,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, padding: 16 } },
          tooltip: { mode: 'index', intersect: false },
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: {
            stacked: true,
            grid: { color: DEFAULTS.gridColor },
            ticks: { callback: v => options.pct ? v + '%' : v },
          },
        },
        ...options.chartOptions,
      },
    });
    if (ctx.id) _instances[ctx.id] = chart;
    return chart;
  }

  function doughnut(ctx, labels, data, colors) {
    destroy(ctx.id || ctx.canvas?.id);
    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors || Object.values(DEFAULTS.colors), borderWidth: 0, hoverOffset: 4 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${ctx.formattedValue}%`,
            },
          },
        },
        cutout: '65%',
      },
    });
    if (ctx.id) _instances[ctx.id] = chart;
    return chart;
  }

  function horizontalBar(ctx, labels, data, color, options = {}) {
    destroy(ctx.id || ctx.canvas?.id);
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ data, backgroundColor: color || DEFAULTS.colors.roxo, borderRadius: 4 }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => options.fmt ? ` ${options.fmt(c.raw)}` : ` ${c.raw}%` } } },
        scales: {
          x: { grid: { color: DEFAULTS.gridColor }, ticks: { callback: v => options.fmt ? options.fmt(v) : v + '%' } },
          y: { grid: { display: false }, ticks: { font: { size: 10 } } },
        },
        ...options.chartOptions,
      },
    });
    if (ctx.id) _instances[ctx.id] = chart;
    return chart;
  }

  function scatter(ctx, datasets, options = {}) {
    destroy(ctx.id || ctx.canvas?.id);
    const chart = new Chart(ctx, {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: datasets.length > 1 },
          tooltip: { callbacks: { label: c => options.tooltipFn ? options.tooltipFn(c.raw) : `(${c.raw.x}, ${c.raw.y})` } },
        },
        scales: {
          x: { grid: { color: DEFAULTS.gridColor }, title: { display: !!options.xLabel, text: options.xLabel || '' }, ticks: { callback: v => options.pct ? v + '%' : v } },
          y: { grid: { color: DEFAULTS.gridColor }, title: { display: !!options.yLabel, text: options.yLabel || '' }, ticks: { callback: v => options.pct ? v + '%' : v } },
        },
        ...options.chartOptions,
      },
    });
    if (ctx.id) _instances[ctx.id] = chart;
    return chart;
  }

  return { lineSerie, barGrouped, barStacked, doughnut, horizontalBar, scatter, destroy };
})();
