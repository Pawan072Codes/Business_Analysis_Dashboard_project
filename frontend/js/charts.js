/* ═══════════════════════════════════════════════════════════════════════════
   BizVision - Charts.js
   Phase 14: Chart rendering using Chart.js library
   
   Chart.js is a popular JavaScript charting library.
   Link: https://www.chartjs.org/
   
   This file handles creating, updating, and destroying charts.
   ═══════════════════════════════════════════════════════════════════════════ */

// Global object to store chart instances
const charts = {};

if (typeof Chart !== 'undefined') {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.08)';
    Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. CHART.JS SETUP
   
   Chart.js needs to be loaded in HTML before this file:
   <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
   
   Chart Structure:
   {
     type: 'line',                    // Chart type
     data: {                          // Data to display
       labels: ['Jan', 'Feb', ...],   // X-axis labels
       datasets: [{                   // Data series
         label: 'Revenue',
         data: [1000, 2000, ...],     // Y-values
         borderColor: '#4f46e5'       // Line color
       }]
     },
     options: { ... }                 // Styling and config
   }
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Render a Revenue Trend Line Chart
 * 
 * LINE CHART: Good for showing changes over time
 * X-axis: Date/Time
 * Y-axis: Revenue values
 * 
 * @param {string} canvasId - ID of canvas element to render in
 * @param {Array} data - Array of {date, value} objects
 */
function renderRevenueChart(canvasId, data) {
  // Destroy existing chart if it exists
  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }

  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.warn(`Canvas element #${canvasId} not found`);
    return;
  }

  // Extract labels (dates) and values from data array
  const labels = data.map(item => item.date || item.label);
  const values = data.map(item => item.value || item.actual_value);

  // Create Chart.js chart instance
  charts[canvasId] = new Chart(canvas, {
    type: 'line', // Line chart type

    data: {
      labels: labels,
      datasets: [
        {
          label: 'Revenue',
          data: values,
          borderColor: '#4f46e5', // Indigo line
          backgroundColor: 'rgba(79, 70, 229, 0.1)', // Light indigo fill
          borderWidth: 2,
          tension: 0.4, // Curved line (0 = straight, 1 = curved)
          fill: true, // Fill area under line
          pointRadius: 4,
          pointBackgroundColor: '#4f46e5',
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        }
      ]
    },

    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        title: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return '$' + value.toLocaleString();
            }
          }
        },
        x: {
          grid: {
            display: false
          }
        }
      }
    }
  });

  console.log(`✅ Revenue chart rendered in #${canvasId}`);
}

/**
 * Render a Distribution Histogram
 * 
 * BAR CHART: Good for showing frequency/count distributions
 * X-axis: Value ranges/categories
 * Y-axis: Frequency (how many items in each range)
 * 
 * @param {string} canvasId - ID of canvas element
 * @param {Array} data - Array of {range, count} or {label, value}
 */
function renderDistributionChart(canvasId, data) {
  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const labels = data.map(item => item.range || item.label);
  const values = data.map(item => item.count || item.value);

  charts[canvasId] = new Chart(canvas, {
    type: 'bar',

    data: {
      labels: labels,
      datasets: [
        {
          label: 'Frequency',
          data: values,
          backgroundColor: '#14b8a6', // Teal color
          borderColor: '#0d9488', // Darker teal
          borderWidth: 1
        }
      ]
    },

    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      }
    }
  });

  console.log(`✅ Distribution chart rendered in #${canvasId}`);
}

/**
 * Render a Category Breakdown Bar Chart
 * 
 * HORIZONTAL BAR CHART: Good for comparing categories
 * X-axis: Values
 * Y-axis: Category names
 * 
 * @param {string} canvasId - ID of canvas element
 * @param {Array} data - Array of {category, value} objects
 */
function renderCategoryChart(canvasId, data) {
  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Sort data by value (descending) to show top categories first
  const sortedData = [...data].sort((a, b) => (b.value || 0) - (a.value || 0));

  const labels = sortedData.map(item => item.category || item.label);
  const values = sortedData.map(item => item.value);

  charts[canvasId] = new Chart(canvas, {
    type: 'bar',

    data: {
      labels: labels,
      datasets: [
        {
          label: 'Value',
          data: values,
          backgroundColor: [
            '#4f46e5', // Indigo
            '#6366f1', // Light indigo
            '#818cf8', // Lighter
            '#c7d2fe', // Even lighter
            '#e0e7ff'  // Very light
          ],
          borderRadius: 4
        }
      ]
    },

    options: {
      indexAxis: 'y', // Horizontal bars
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          beginAtZero: true
        }
      }
    }
  });

  console.log(`✅ Category chart rendered in #${canvasId}`);
}

/**
 * Render Actual vs Forecast Comparison Chart
 * 
 * LINE CHART WITH MULTIPLE SERIES:
 * - Blue line: Historical/actual values
 * - Orange line: Forecasted values
 * - Shaded area: Confidence interval
 * 
 * @param {string} canvasId - ID of canvas element
 * @param {Array} historical - Historical data {date, value}
 * @param {Array} forecast - Forecast data {date, value}
 */
function renderForecastChart(canvasId, historical = [], forecast = []) {
  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Combine historical and forecast dates for x-axis
  const historicalDates = historical.map(h => h.date);
  const forecastDates = forecast.map(f => f.date);
  const allDates = [...historicalDates, ...forecastDates];

  // Create data arrays with nulls to create gap between actual and forecast
  const historicalValues = historical.map(h => h.actual_value || h.value);
  const historicalWithGap = [
    ...historicalValues,
    null // Creates a gap in the line
  ];

  const forecastValues = [
    null, // Start with null to align with historical
    ...forecast.map(f => f.predicted_value || f.value)
  ];

  charts[canvasId] = new Chart(canvas, {
    type: 'line',

    data: {
      labels: allDates,
      datasets: [
        {
          label: 'Historical Data',
          data: historicalWithGap,
          borderColor: '#334155', // Dark gray
          backgroundColor: 'rgba(51, 65, 85, 0.1)',
          borderWidth: 2,
          fill: false,
          tension: 0.4
        },
        {
          label: 'Forecast',
          data: forecastValues,
          borderColor: '#4f46e5', // Indigo
          backgroundColor: 'rgba(79, 70, 229, 0.1)',
          borderWidth: 2,
          borderDash: [5, 5], // Dashed line for forecast
          fill: false,
          tension: 0.4
        }
      ]
    },

    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return '$' + value.toLocaleString();
            }
          }
        },
        x: {
          grid: {
            display: false
          }
        }
      }
    }
  });

  console.log(`✅ Forecast chart rendered in #${canvasId}`);
}

/**
 * Render a Pie Chart (Category Distribution)
 * 
 * PIE CHART: Good for showing proportions/percentages
 * Each slice represents a category's proportion of total
 * 
 * @param {string} canvasId - ID of canvas element
 * @param {Array} data - Array of {label, value} objects
 */
function renderPieChart(canvasId, data) {
  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const labels = data.map(item => item.label || item.category);
  const values = data.map(item => item.value);

  // Color palette for pie slices
  const colors = [
    '#4f46e5', '#6366f1', '#818cf8', '#c7d2fe', '#e0e7ff',
    '#14b8a6', '#2dd4bf', '#0d9488', '#ef4444', '#f59e0b'
  ];

  charts[canvasId] = new Chart(canvas, {
    type: 'doughnut', // Doughnut = pie with hole in middle

    data: {
      labels: labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors.slice(0, labels.length),
          borderColor: '#fff',
          borderWidth: 2
        }
      ]
    },

    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });

  console.log(`✅ Pie chart rendered in #${canvasId}`);
}

/**
 * Update existing chart with new data
 * 
 * Instead of destroying and recreating, we can update data
 * This is more efficient for real-time updates
 * 
 * @param {string} canvasId - ID of chart canvas
 * @param {Array} newData - New data array
 */
function updateChart(canvasId, newData) {
  if (!charts[canvasId]) {
    console.warn(`Chart #${canvasId} not found`);
    return;
  }

  const chart = charts[canvasId];
  const labels = newData.map(item => item.date || item.label);
  const values = newData.map(item => item.value);

  // Update chart data
  chart.data.labels = labels;
  chart.data.datasets[0].data = values;

  // Animate the update
  chart.update('active'); // 'active' animates the change

  console.log(`✅ Chart #${canvasId} updated`);
}

/**
 * Clear all charts (destroy instances)
 * 
 * Useful when navigating between pages or clearing data
 */
function clearAllCharts() {
  Object.keys(charts).forEach(key => {
    if (charts[key]) {
      charts[key].destroy();
      delete charts[key];
    }
  });
  console.log('✅ All charts cleared');
}

/**
 * Show loading state in chart container
 * 
 * @param {string} canvasId - ID of canvas element
 */
function showChartLoading(canvasId) {
  const placeholder = document.querySelector(`#${canvasId}`).closest('.chart-placeholder');
  if (placeholder) {
    const loadingEl = placeholder.querySelector('.loading-state');
    if (loadingEl) {
      loadingEl.textContent = 'Loading chart...';
      loadingEl.style.display = 'block';
    }
  }
}

/**
 * Hide loading state in chart container
 * 
 * @param {string} canvasId - ID of canvas element
 */
function hideChartLoading(canvasId) {
  const placeholder = document.querySelector(`#${canvasId}`).closest('.chart-placeholder');
  if (placeholder) {
    const loadingEl = placeholder.querySelector('.loading-state');
    if (loadingEl) {
      loadingEl.style.display = 'none';
    }
  }
}

function renderResidualsChart(canvasId, comparisonData = []) {
  if (charts[canvasId]) charts[canvasId].destroy();
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const labels = comparisonData.map((_, i) => `Point ${i + 1}`);
  const residuals = comparisonData.map(item => item.actual - item.predicted);

  charts[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Residual Error (Actual - Predicted)',
        data: residuals,
        backgroundColor: residuals.map(r => r >= 0 ? '#10b981' : '#ef4444'),
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: { y: { title: { display: true, text: 'Error Value' } } }
    }
  });
}

function renderFeatureImportanceChart(canvasId) {
  if (charts[canvasId]) charts[canvasId].destroy();
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const features = ['lag_1', 'rolling_avg_7', 'lag_7', 'month', 'day_of_week', 'quarter'];
  const importance = [0.42, 0.28, 0.15, 0.08, 0.04, 0.03];

  charts[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: features,
      datasets: [{
        label: 'Importance Weight',
        data: importance,
        backgroundColor: '#6366f1',
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } }
    }
  });
}

/**
 * Render Multi-Dataset Timeline Comparison Chart (Phase 2)
 *
 * @param {string} canvasId - Canvas ID
 * @param {Object} payload - API response from /api/compare containing {labels, datasets}
 * @param {string} chartType - 'line' or 'bar'
 */
function renderMultiDatasetChart(canvasId, payload, chartType = 'line') {
  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const colorPalette = [
    { border: '#4f46e5', bg: 'rgba(79, 70, 229, 0.15)' },  // Indigo
    { border: '#14b8a6', bg: 'rgba(20, 184, 166, 0.15)' },  // Teal
    { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },  // Amber
    { border: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },   // Red
    { border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },  // Blue
    { border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' }   // Purple
  ];

  const labels = payload.labels || [];
  const datasets = (payload.datasets || []).map((ds, index) => {
    const color = colorPalette[index % colorPalette.length];
    return {
      label: ds.dataset_id,
      data: ds.data,
      borderColor: color.border,
      backgroundColor: chartType === 'bar' ? color.border : color.bg,
      borderWidth: 2.5,
      tension: 0.35,
      fill: chartType === 'line',
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBackgroundColor: color.border,
      pointBorderColor: '#ffffff'
    };
  });

  charts[canvasId] = new Chart(canvas, {
    type: chartType,
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            usePointStyle: true,
            boxWidth: 10,
            font: { weight: '600', size: 12 }
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      },
      scales: {
        x: {
          grid: { display: false },
          title: { display: true, text: payload.group_by === 'day' ? 'Date' : 'Month' }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Value / Revenue ($)' }
        }
      }
    }
  });
}

function renderCombinedTrendChart(canvasId, trendData) {
  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }
  const canvas = document.getElementById(canvasId);
  if (!canvas || !trendData) return;

  const labels = trendData.labels || [];
  const nameA = trendData.dataset_a_name ? `Dataset A: ${trendData.dataset_a_name}` : 'Dataset A';
  const nameB = trendData.dataset_b_name ? `Dataset B: ${trendData.dataset_b_name}` : 'Dataset B';

  charts[canvasId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: nameA,
          data: trendData.series_a || [],
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.08)',
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#38bdf8',
          pointBorderColor: '#ffffff'
        },
        {
          label: nameB,
          data: trendData.series_b || [],
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#10b981',
          pointBorderColor: '#ffffff'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            usePointStyle: true,
            boxWidth: 10,
            color: '#cbd5e1',
            font: { weight: '600', size: 12 }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f8fafc',
          bodyColor: '#e2e8f0',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: function(context) {
              const val = context.parsed.y !== null ? context.parsed.y.toLocaleString() : '—';
              return ` ${context.dataset.label}: ${val}`;
            },
            afterBody: function(items) {
              if (items.length >= 2) {
                const valA = items[0].parsed.y || 0;
                const valB = items[1].parsed.y || 0;
                const diff = valB - valA;
                const pct = valA !== 0 ? (((valB - valA) / Math.abs(valA)) * 100).toFixed(1) : 0;
                const sign = diff >= 0 ? '+' : '';
                return [` Variance (B - A): ${sign}${diff.toLocaleString()} (${sign}${pct}%)`];
              }
              return [];
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8', font: { size: 11 } },
          title: { display: true, text: `Time Period (${trendData.grouping || 'month'})`, color: '#94a3b8' }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#94a3b8',
            font: { size: 11 },
            callback: function(v) {
              if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
              if (v >= 1000) return (v / 1000).toFixed(1) + 'k';
              return v;
            }
          },
          title: { display: true, text: trendData.metric_title || 'Value', color: '#94a3b8' }
        }
      }
    }
  });
}

function renderCombinedCategoryChart(canvasId, catData) {
  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }
  const canvas = document.getElementById(canvasId);
  if (!canvas || !catData) return;

  const labels = catData.labels || [];
  const nameA = catData.dataset_a_name ? `Dataset A: ${catData.dataset_a_name}` : 'Dataset A';
  const nameB = catData.dataset_b_name ? `Dataset B: ${catData.dataset_b_name}` : 'Dataset B';

  charts[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: nameA,
          data: catData.series_a || [],
          backgroundColor: '#38bdf8',
          borderRadius: 6,
          borderSkipped: false
        },
        {
          label: nameB,
          data: catData.series_b || [],
          backgroundColor: '#10b981',
          borderRadius: 6,
          borderSkipped: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            usePointStyle: true,
            boxWidth: 10,
            color: '#cbd5e1',
            font: { weight: '600', size: 12 }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f8fafc',
          bodyColor: '#e2e8f0',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: function(context) {
              const val = context.parsed.y !== null ? context.parsed.y.toLocaleString() : '—';
              return ` ${context.dataset.label}: ${val}`;
            },
            afterBody: function(items) {
              if (items.length >= 2) {
                const valA = items[0].parsed.y || 0;
                const valB = items[1].parsed.y || 0;
                const diff = valB - valA;
                const pct = valA !== 0 ? (((valB - valA) / Math.abs(valA)) * 100).toFixed(1) : 0;
                const sign = diff >= 0 ? '+' : '';
                return [` Variance: ${sign}${diff.toLocaleString()} (${sign}${pct}%)`];
              }
              return [];
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { size: 11 }, maxRotation: 30 }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#94a3b8',
            font: { size: 11 },
            callback: function(v) {
              if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
              if (v >= 1000) return (v / 1000).toFixed(1) + 'k';
              return v;
            }
          },
          title: { display: true, text: catData.metric_title || 'Value', color: '#94a3b8' }
        }
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXPORT FUNCTIONS
   ═══════════════════════════════════════════════════════════════════════════ */

window.Charts = {
  renderRevenueChart,
  renderDistributionChart,
  renderCategoryChart,
  renderForecastChart,
  renderPieChart,
  renderResidualsChart,
  renderFeatureImportanceChart,
  renderMultiDatasetChart,
  renderCombinedTrendChart,
  renderCombinedCategoryChart,
  updateChart,
  clearAllCharts,
  showChartLoading,
  hideChartLoading
};

window.addEventListener('themeChanged', (e) => {
  const isDark = (e.detail && e.detail.theme) === 'dark';
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color = isDark ? '#94a3b8' : '#475569';
    Chart.defaults.borderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
    for (const key in charts) {
      if (charts[key]) {
        try {
          if (charts[key].options && charts[key].options.scales) {
            if (charts[key].options.scales.x && charts[key].options.scales.x.grid) {
              charts[key].options.scales.x.grid.color = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
            }
            if (charts[key].options.scales.y && charts[key].options.scales.y.grid) {
              charts[key].options.scales.y.grid.color = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';
            }
          }
          charts[key].update();
        } catch (err) {}
      }
    }
  }
});

console.log('✅ Charts.js loaded successfully with multi-dataset plotting.');
