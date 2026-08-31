/* ═══════════════════════════════════════════════════════════════════════════
   BizVision - Charts.js
   Phase 14: Chart rendering using Chart.js library
   
   Chart.js is a popular JavaScript charting library.
   Link: https://www.chartjs.org/
   
   This file handles creating, updating, and destroying charts.
   ═══════════════════════════════════════════════════════════════════════════ */

// Global object to store chart instances
// Needed because Chart.js requires destroying old charts before recreating
const charts = {};

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

/* ═══════════════════════════════════════════════════════════════════════════
   EXPORT FUNCTIONS
   ═══════════════════════════════════════════════════════════════════════════ */

window.Charts = {
  renderRevenueChart,
  renderDistributionChart,
  renderCategoryChart,
  renderForecastChart,
  renderPieChart,
  updateChart,
  clearAllCharts,
  showChartLoading,
  hideChartLoading
};

console.log('✅ Charts.js loaded successfully');
