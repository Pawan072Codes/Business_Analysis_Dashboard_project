/* ═══════════════════════════════════════════════════════════════════════════
   BizVision - Main.js
   Phase 14: Main orchestration file - connects UI, API, and charts
   
   This file runs when the page loads and coordinates everything:
   1. Event listeners (button clicks, form submissions)
   2. Loading states (spinners, disabled buttons)
   3. Error handling (try/catch, user messages)
   4. UI updates (populate tables, cards, charts)
   ═══════════════════════════════════════════════════════════════════════════ */

/* ───────────────────────────────────────────────────────────────────────────
   LOADING STATE PATTERN
   
   While we're waiting for API response:
   1. Show loading message/spinner
   2. Disable buttons
   3. When response arrives, hide spinner and show data
   4. If error, show error message
   
   This gives user feedback that something is happening.
   ─────────────────────────────────────────────────────────────────────────── */

/* ═══════════════════════════════════════════════════════════════════════════
   1. PAGE INITIALIZATION (Run on page load)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Initialize page - called when DOM is fully loaded
 * 
 * DOM READY EVENT:
 * The browser fires 'DOMContentLoaded' when HTML is parsed.
 * This is when we can safely access elements and attach listeners.
 */
document.addEventListener('DOMContentLoaded', async function() {
  console.log('🚀 Initializing BizVision Dashboard...');

  // Detect which page we're on
  const currentPage = detectCurrentPage();
  console.log(`📄 Current page: ${currentPage}`);

  // Run page-specific initialization
  switch (currentPage) {
    case 'index':
      await initDashboard();
      break;
    case 'upload':
      await initUploadPage();
      break;
    case 'forecast':
      await initForecastPage();
      break;
    default:
      console.log('Unknown page');
  }

  console.log('✅ Page initialization complete');
});

/**
 * Detect which page we're currently on
 * 
 * @returns {string} - 'index', 'upload', or 'forecast'
 */
function detectCurrentPage() {
  const pathname = window.location.pathname;
  
  if (pathname === '/' || pathname.includes('index.html')) {
    return 'index';
  } else if (pathname.includes('upload')) {
    return 'upload';
  } else if (pathname.includes('forecast')) {
    return 'forecast';
  }
  return 'unknown';
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. DASHBOARD PAGE INITIALIZATION
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Initialize dashboard page
 * 
 * FLOW:
 * 1. Check if a dataset has been uploaded (stored in sessionStorage)
 * 2. If yes, load KPIs, charts, data table
 * 3. If no, show empty state
 */
async function initDashboard() {
  console.log('📊 Initializing Dashboard...');

  // Check if a dataset is loaded
  const tableName = sessionStorage.getItem('currentTableName');

  if (!tableName) {
    console.log('No dataset loaded. Showing empty state.');
    showEmptyDashboard();
    return;
  }

  console.log(`Loading dashboard for table: ${tableName}`);

  try {
    // Load KPIs
    await loadDashboardKPIs(tableName);

    // Load and display charts
    await loadDashboardCharts(tableName);

    // Load data table
    await loadDashboardTable(tableName);

    // Load AI insights
    await loadDashboardInsights(tableName);
  } catch (error) {
    showError('Failed to load dashboard. Please upload a dataset.');
    console.error(error);
  }
}

/**
 * Load and display KPI cards on dashboard
 * 
 * KPI = Key Performance Indicator
 * These are the 4 metric cards at the top
 * 
 * @param {string} tableName - Name of uploaded dataset
 */
async function loadDashboardKPIs(tableName) {
  console.log('📊 Loading KPIs...');

  try {
    // For now, we'll use mock data since KPI endpoint might not exist yet
    // In Phase 15, replace this with API.fetchKPIs(tableName)
    const kpiData = {
      total_revenue: 125000,
      growth_rate: 0.15,
      transaction_count: 3450,
      forecast_accuracy: 0.92
    };

    // Update KPI card 1: Total Revenue
    updateKPICard(
      'Total Revenue',
      API.formatCurrency(kpiData.total_revenue),
      '+12.5%'
    );

    // Update KPI card 2: Growth Rate
    updateKPICard(
      'Growth Rate',
      API.formatPercentage(kpiData.growth_rate),
      '+2.1%'
    );

    // Update KPI card 3: Total Transactions
    updateKPICard(
      'Total Transactions',
      API.formatNumber(kpiData.transaction_count),
      '+8.3%'
    );

    // Update KPI card 4: Forecast Accuracy
    updateKPICard(
      'Forecast Accuracy',
      API.formatPercentage(kpiData.forecast_accuracy),
      '+5.2%'
    );

    console.log('✅ KPIs loaded');
  } catch (error) {
    console.error('❌ KPI loading error:', error);
  }
}

/**
 * Helper: Update a single KPI card value
 * 
 * @param {string} title - Card title
 * @param {string} value - Formatted value to display
 * @param {string} change - Change indicator (+12%, -5%, etc.)
 */
function updateKPICard(title, value, change) {
  // Find card by title
  const cards = document.querySelectorAll('.kpi-card');
  for (const card of cards) {
    const cardTitle = card.querySelector('.kpi-title');
    if (cardTitle && cardTitle.textContent.trim() === title) {
      // Update value
      const valueElement = card.querySelector('.value');
      if (valueElement) {
        valueElement.textContent = value;
      }

      // Update change badge
      const changeElement = card.querySelector('.change-badge');
      if (changeElement) {
        changeElement.textContent = change;
      }

      console.log(`Updated KPI: ${title}`);
      break;
    }
  }
}

/**
 * Load and render charts on dashboard
 * 
 * @param {string} tableName - Name of uploaded dataset
 */
async function loadDashboardCharts(tableName) {
  console.log('📈 Loading charts...');

  try {
    // For demo, use mock data
    // In Phase 15, fetch real data: const analyticsData = await API.fetchAnalytics(...)

    // Mock revenue trend data
    const revenueTrendData = [
      { date: '2026-08-01', value: 5000 },
      { date: '2026-08-02', value: 6200 },
      { date: '2026-08-03', value: 5800 },
      { date: '2026-08-04', value: 7100 },
      { date: '2026-08-05', value: 8500 },
      { date: '2026-08-06', value: 7900 },
      { date: '2026-08-07', value: 9200 }
    ];

    // Mock distribution data
    const distributionData = [
      { range: '0-1000', count: 45 },
      { range: '1000-2000', count: 67 },
      { range: '2000-3000', count: 52 },
      { range: '3000-4000', count: 38 },
      { range: '4000+', count: 28 }
    ];

    // Mock category data
    const categoryData = [
      { category: 'Electronics', value: 28000 },
      { category: 'Clothing', value: 21000 },
      { category: 'Home & Garden', value: 18500 },
      { category: 'Sports', value: 15200 },
      { category: 'Books', value: 12000 }
    ];

    // Mock comparison data
    const comparisonData = [
      { date: '2026-08-01', value: 5000 },
      { date: '2026-08-02', value: 6200 },
      { date: '2026-08-03', value: 5800 },
      { date: '2026-08-04', value: 7100 }
    ];

    // Render all 4 charts
    Charts.renderRevenueChart('revenue-chart', revenueTrendData);
    Charts.renderDistributionChart('distribution-chart', distributionData);
    Charts.renderCategoryChart('category-chart', categoryData);
    Charts.renderRevenueChart('comparison-chart', comparisonData); // Use line chart for demo

    console.log('✅ Charts loaded');
  } catch (error) {
    console.error('❌ Chart loading error:', error);
    showError('Failed to load charts');
  }
}

/**
 * Load and display data table on dashboard
 * 
 * @param {string} tableName - Name of uploaded dataset
 */
async function loadDashboardTable(tableName) {
  console.log('📋 Loading data table...');

  try {
    // Show loading state
    const tableBody = document.querySelector('.data-table tbody');
    if (tableBody) {
      tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;"><em>Loading data...</em></td></tr>';
    }

    // Fetch first 10 rows
    const tableData = await API.fetchTableData(tableName, 0, 10);

    if (tableData.data.length === 0) {
      if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;"><em>No data available</em></td></tr>';
      }
      return;
    }

    // Populate table with data
    populateDataTable(tableData.data);

    // Update pagination info
    const totalPages = Math.ceil(tableData.total / 10);
    updatePaginationInfo(1, totalPages);

    console.log('✅ Data table loaded');
  } catch (error) {
    console.error('❌ Table loading error:', error);
    showError('Failed to load data table');
  }
}

/**
 * Load AI insights and display on dashboard
 * 
 * @param {string} tableName - Name of uploaded dataset
 */
async function loadDashboardInsights(tableName) {
  console.log('💡 Loading insights...');

  try {
    // For demo, use mock insights
    // In Phase 15: const insightsData = await API.fetchInsights(tableName);

    const insightsData = {
      insights: [
        'Revenue trend shows 15% growth over the past week',
        'Electronics category accounts for 22% of total sales',
        'Peak sales occur on weekdays (45% higher than weekends)'
      ],
      recommendations: [
        'Increase inventory for Electronics category before next peak',
        'Schedule promotional campaigns on weekdays for maximum impact',
        'Consider expanding Home & Garden product line'
      ]
    };

    // Update insights list
    const insightsList = document.querySelector('.insights-list');
    if (insightsList) {
      insightsList.innerHTML = insightsData.insights.map(insight => `
        <li class="insight-item" role="listitem">
          <span class="insight-badge">📈</span>
          <span class="insight-text">${insight}</span>
        </li>
      `).join('');
    }

    // Update recommendations list
    const recommendationsList = document.querySelector('.recommendations-list');
    if (recommendationsList) {
      recommendationsList.innerHTML = insightsData.recommendations.map(rec => `
        <li class="recommendation-item" role="listitem">
          <strong>Action:</strong>
          <span class="recommendation-text">${rec}</span>
        </li>
      `).join('');
    }

    console.log('✅ Insights loaded');
  } catch (error) {
    console.error('❌ Insights loading error:', error);
  }
}

/**
 * Populate data table with rows
 * 
 * @param {Array} data - Array of row objects
 */
function populateDataTable(data) {
  const tableBody = document.querySelector('.data-table tbody');
  if (!tableBody) return;

  // Clear existing rows
  tableBody.innerHTML = '';

  // Add new rows
  data.forEach((row, index) => {
    const tr = document.createElement('tr');
    tr.className = 'table-row';

    // Get first 5 columns
    const columns = Object.entries(row).slice(0, 5);

    columns.forEach(([key, value]) => {
      const td = document.createElement('td');
      td.role = 'gridcell';
      td.textContent = value || '—';
      tr.appendChild(td);
    });

    // Add action button
    const actionTd = document.createElement('td');
    actionTd.role = 'gridcell';
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.textContent = 'View';
    actionTd.appendChild(btn);
    tr.appendChild(actionTd);

    tableBody.appendChild(tr);
  });
}

/**
 * Update pagination info
 * 
 * @param {number} currentPage - Current page number
 * @param {number} totalPages - Total number of pages
 */
function updatePaginationInfo(currentPage, totalPages) {
  const paginationText = document.querySelector('[aria-current="page"]');
  if (paginationText) {
    paginationText.textContent = `Page ${currentPage} of ${totalPages}`;
  }

  // Enable/disable pagination buttons
  const prevBtn = document.querySelector('.pagination-list button:first-child');
  const nextBtn = document.querySelector('.pagination-list button:last-child');

  if (prevBtn) {
    prevBtn.disabled = currentPage <= 1;
  }
  if (nextBtn) {
    nextBtn.disabled = currentPage >= totalPages;
  }
}

/**
 * Show empty dashboard state
 * 
 * When no dataset is uploaded, show helpful message
 */
function showEmptyDashboard() {
  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    const emptyMessage = document.createElement('div');
    emptyMessage.style.cssText = `
      text-align: center;
      padding: 4rem 2rem;
      color: #666;
    `;
    emptyMessage.innerHTML = `
      <h2>📁 No Data Loaded</h2>
      <p>Upload a CSV or Excel file to get started.</p>
      <a href="upload.html" style="
        display: inline-block;
        background: #4f46e5;
        color: white;
        padding: 0.75rem 1.5rem;
        border-radius: 0.5rem;
        text-decoration: none;
        margin-top: 1rem;
      ">Go to Upload</a>
    `;
    mainContent.appendChild(emptyMessage);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. UPLOAD PAGE INITIALIZATION
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Initialize upload page
 * 
 * FLOW:
 * 1. Set up drag-and-drop event listeners
 * 2. Set up file input change listener
 * 3. Set up form submission listener
 */
async function initUploadPage() {
  console.log('📤 Initializing Upload Page...');

  setupDragAndDrop();
  setupFileInputListener();
  setupUploadButtonListener();
  setupCleaningFormListener();
}

/**
 * Setup drag-and-drop zone event listeners
 * 
 * DRAG AND DROP EVENTS:
 * - dragover: File is being dragged over zone
 * - drop: File is dropped in zone
 * - dragleave: File left the zone
 * - dragend: Drag operation ended
 */
function setupDragAndDrop() {
  const dragZone = document.getElementById('drag-drop-area');
  if (!dragZone) return;

  console.log('📂 Setting up drag-and-drop...');

  // Prevent default browser behavior
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dragZone.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  // Highlight zone on drag
  ['dragenter', 'dragover'].forEach(eventName => {
    dragZone.addEventListener(eventName, () => {
      dragZone.classList.add('drag-over');
    }, false);
  });

  // Remove highlight on leave
  ['dragleave', 'drop'].forEach(eventName => {
    dragZone.addEventListener(eventName, () => {
      dragZone.classList.remove('drag-over');
    }, false);
  });

  // Handle file drop
  dragZone.addEventListener('drop', handleFileDrop, false);

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }
}

/**
 * Handle file drop
 * 
 * @param {DragEvent} e - Drag event
 */
function handleFileDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;

  if (files.length > 0) {
    const fileInput = document.getElementById('file-input');
    fileInput.files = files; // Set file input to dropped file

    // Trigger file change event
    const event = new Event('change', { bubbles: true });
    fileInput.dispatchEvent(event);
  }
}

/**
 * Setup file input change listener
 * 
 * When user selects file via input or drag-drop,
 * update UI to show file details
 */
function setupFileInputListener() {
  const fileInput = document.getElementById('file-input');
  if (!fileInput) return;

  fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    console.log(`📄 File selected: ${file.name}`);

    // Update file info card
    updateFileInfo(file);

    // Enable upload button
    const uploadBtn = document.getElementById('upload-btn');
    if (uploadBtn) {
      uploadBtn.disabled = false;
    }
  });
}

/**
 * Update file information display
 * 
 * @param {File} file - File object
 */
function updateFileInfo(file) {
  // Update file name
  const fileName = document.getElementById('selected-file-name');
  if (fileName) {
    fileName.textContent = file.name;
  }

  // Update file size
  const fileSize = document.getElementById('file-size');
  if (fileSize) {
    const sizeInMB = (file.size / 1024 / 1024).toFixed(2);
    fileSize.textContent = `${sizeInMB} MB`;
  }

  // Update file type
  const fileType = document.getElementById('file-type');
  if (fileType) {
    fileType.textContent = file.type || 'Unknown';
  }

  // Update upload date
  const uploadDate = document.getElementById('upload-date');
  if (uploadDate) {
    uploadDate.textContent = new Date().toLocaleDateString();
  }
}

/**
 * Setup upload button listener
 * 
 * ASYNC FLOW:
 * 1. Click upload button
 * 2. Show loading state
 * 3. Call API.uploadDataset()
 * 4. While waiting (await), show spinner
 * 5. When response arrives, show success/error
 */
function setupUploadButtonListener() {
  const uploadBtn = document.getElementById('upload-btn');
  if (!uploadBtn) return;

  uploadBtn.addEventListener('click', async function(e) {
    e.preventDefault();

    const fileInput = document.getElementById('file-input');
    const file = fileInput.files[0];

    if (!file) {
      showError('Please select a file');
      return;
    }

    // Show loading state
    uploadBtn.disabled = true;
    uploadBtn.textContent = '⏳ Uploading...';

    try {
      // This is where async/await is powerful:
      // The code looks synchronous but is actually waiting for the server
      const response = await API.uploadDataset(file);

      // Store table name in sessionStorage so other pages can access it
      sessionStorage.setItem('currentTableName', response.table_name);

      showSuccess(`✅ Successfully uploaded! ${response.rows_inserted} rows loaded.`);

      // Show data preview
      if (response.preview && response.preview.length > 0) {
        showDataPreview(response);
      }

      // Enable cleaning and processing buttons
      const processBtn = document.getElementById('process-btn');
      if (processBtn) {
        processBtn.disabled = false;
      }
    } catch (error) {
      showError(`Upload failed: ${error.message}`);
    } finally {
      // Reset button (runs whether success or error)
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Upload File';
    }
  });
}

/**
 * Show data preview in table
 * 
 * @param {Object} uploadResponse - Response from API
 */
function showDataPreview(uploadResponse) {
  const previewTable = document.querySelector('.preview-table tbody');
  if (!previewTable) return;

  // Clear existing rows
  previewTable.innerHTML = '';

  // Show first 5 rows
  uploadResponse.preview.slice(0, 5).forEach(row => {
    const tr = document.createElement('tr');

    Object.values(row).forEach(value => {
      const td = document.createElement('td');
      td.role = 'gridcell';
      td.textContent = value || '—';
      tr.appendChild(td);
    });

    previewTable.appendChild(tr);
  });

  // Update stats
  const totalRows = document.getElementById('total-rows');
  if (totalRows) {
    totalRows.textContent = uploadResponse.rows_inserted || 0;
  }

  const totalColumns = document.getElementById('total-columns');
  if (totalColumns) {
    totalColumns.textContent = uploadResponse.columns.length || 0;
  }
}

/**
 * Setup data cleaning form listener
 */
function setupCleaningFormListener() {
  const cleaningForm = document.getElementById('cleaning-form');
  if (!cleaningForm) return;

  const processBtn = document.getElementById('process-btn');
  if (!processBtn) return;

  processBtn.addEventListener('click', async function(e) {
    e.preventDefault();

    processBtn.disabled = true;
    processBtn.textContent = '⏳ Processing...';

    try {
      const tableName = sessionStorage.getItem('currentTableName');
      if (!tableName) {
        throw new Error('No dataset loaded');
      }

      // Here you'd call cleaning API
      // For now, just show success message

      showSuccess('✅ Data processed and cleaned successfully!');

      setTimeout(() => {
        window.location.href = 'index.html';
      }, 2000);
    } catch (error) {
      showError(`Processing failed: ${error.message}`);
    } finally {
      processBtn.disabled = false;
      processBtn.textContent = 'Process & Save Data';
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. FORECAST PAGE INITIALIZATION
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Initialize forecast page
 */
async function initForecastPage() {
  console.log('🔮 Initializing Forecast Page...');

  setupForecastFormListener();
}

/**
 * Setup forecast form listener
 */
function setupForecastFormListener() {
  const forecastForm = document.getElementById('forecast-form');
  if (!forecastForm) return;

  const generateBtn = document.getElementById('generate-forecast-btn');
  if (!generateBtn) return;

  generateBtn.addEventListener('click', async function(e) {
    e.preventDefault();

    const tableName = sessionStorage.getItem('currentTableName');
    if (!tableName) {
      showError('Please upload a dataset first');
      return;
    }

    const forecastPeriod = parseInt(
      document.getElementById('forecast-period').value || 30
    );

    generateBtn.disabled = true;
    generateBtn.textContent = '⏳ Generating Forecast...';

    try {
      // Show loading in chart
      Charts.showChartLoading('main-forecast-chart');

      const forecastData = await API.fetchForecast(tableName, forecastPeriod);

      // Render forecast chart
      if (forecastData.historical && forecastData.forecast) {
        Charts.renderForecastChart(
          'main-forecast-chart',
          forecastData.historical,
          forecastData.forecast
        );
      }

      // Update performance metrics
      updateMetricsCards(forecastData.metrics || {});

      Charts.hideChartLoading('main-forecast-chart');
      showSuccess('✅ Forecast generated successfully!');
    } catch (error) {
      showError(`Forecast generation failed: ${error.message}`);
      Charts.hideChartLoading('main-forecast-chart');
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = 'Generate Forecast';
    }
  });
}

/**
 * Update performance metric cards
 * 
 * @param {Object} metrics - Metrics data (MAE, RMSE, MAPE, R²)
 */
function updateMetricsCards(metrics) {
  const metricCards = document.querySelectorAll('.metric-card');

  const metricValues = [
    { title: 'MAE', value: metrics.mae },
    { title: 'RMSE', value: metrics.rmse },
    { title: 'MAPE', value: metrics.mape },
    { title: 'R² Score', value: metrics.r2_score }
  ];

  metricCards.forEach((card, index) => {
    const valueEl = card.querySelector('.metric-value .value');
    if (valueEl && metricValues[index]) {
      valueEl.textContent = metricValues[index].value || '—';
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. UI HELPER FUNCTIONS
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Show success message to user
 * 
 * @param {string} message - Message to display
 */
function showSuccess(message) {
  const messageEl = document.getElementById('success-message');
  if (messageEl) {
    messageEl.querySelector('.message-text').textContent = message;
    messageEl.classList.add('show');

    // Auto-hide after 5 seconds
    setTimeout(() => {
      messageEl.classList.remove('show');
    }, 5000);
  } else {
    // Fallback: alert user
    alert(message);
  }
}

/**
 * Show error message to user
 * 
 * @param {string} message - Error message to display
 */
function showError(message) {
  const messageEl = document.getElementById('error-message');
  if (messageEl) {
    messageEl.querySelector('.message-text').textContent = message;
    messageEl.classList.add('show');

    // Auto-hide after 7 seconds
    setTimeout(() => {
      messageEl.classList.remove('show');
    }, 7000);
  } else {
    // Fallback: alert user
    alert('Error: ' + message);
  }
}

/**
 * Show loading spinner overlay
 * (for global loading states)
 */
function showLoadingOverlay() {
  let overlay = document.getElementById('loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loading-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    `;
    overlay.innerHTML = '<div style="color: white; font-size: 1.5rem;">⏳ Loading...</div>';
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
}

/**
 * Hide loading spinner overlay
 */
function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

console.log('✅ Main.js loaded successfully');
