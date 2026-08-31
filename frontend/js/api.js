/* ═══════════════════════════════════════════════════════════════════════════
   BizVision - API.js
   Phase 14: Backend API calls using fetch() and async/await
   
   This file handles all communication with the FastAPI backend.
   It's the "bridge" between the frontend UI and backend data/logic.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ───────────────────────────────────────────────────────────────────────────
   FETCH() AND ASYNC/AWAIT EXPLAINED:
   
   FETCH: Browser function that sends HTTP requests to servers
   - Syntax: fetch(url, options)
   - Returns a Promise (a value that will resolve later)
   - Used to GET data, POST data, etc.
   
   ASYNC/AWAIT: Modern way to handle Promises (JavaScript async operations)
   - async function → The function can use "await"
   - await → Pauses execution until Promise resolves
   - Makes async code look like synchronous code
   
   EXAMPLE:
   // Without async/await (harder to read):
   fetch('/api/data')
     .then(response => response.json())
     .then(data => console.log(data))
     .catch(error => console.error(error));
   
   // With async/await (cleaner):
   async function getData() {
     try {
       const response = await fetch('/api/data');
       const data = await response.json();
       console.log(data);
     } catch (error) {
       console.error(error);
     }
   }
   
   KEY CONCEPTS:
   1. Promise: Object representing a future value (pending → resolved/rejected)
   2. async: Makes function return a Promise
   3. await: Pauses execution until Promise settles
   4. try/catch: Error handling for async operations
   ─────────────────────────────────────────────────────────────────────────── */

// API BASE URL — All requests go to this endpoint
const API_BASE_URL = 'http://127.0.0.1:8000/api';

/* ═══════════════════════════════════════════════════════════════════════════
   1. UPLOAD API — Send file to backend for processing
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Upload a CSV or Excel file to the backend
 * 
 * FLOW:
 * 1. Create FormData object (for file upload)
 * 2. fetch() sends file to /api/upload endpoint
 * 3. Backend processes file (cleans, stores in DB)
 * 4. Returns table_name and preview of data
 * 
 * @param {File} file - The file object from input[type="file"]
 * @param {Function} onProgress - Callback for progress updates
 * @returns {Promise} - Resolves with upload response
 */
async function uploadDataset(file, onProgress = null) {
  // Create FormData object — required for file uploads
  // FormData is like a container for form data (files, fields)
  const formData = new FormData();
  formData.append('file', file); // Add file to form data

  try {
    // Validate file size (max 100MB)
    const MAX_SIZE = 100 * 1024 * 1024; // 100MB in bytes
    if (file.size > MAX_SIZE) {
      throw new Error(`File size exceeds 100MB limit. Your file: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
    }

    console.log(`📤 Uploading file: ${file.name}`);

    // FETCH REQUEST EXPLAINED:
    // fetch(url, {options})
    // method: 'POST' → Tell server we're sending data
    // body: formData → The data being sent
    
    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      body: formData
      // Note: No 'Content-Type' header needed! FormData handles it.
    });

    // Check if response is OK (status 200-299)
    // If not OK, throw error so we catch it below
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || `Upload failed with status ${response.status}`);
    }

    // Convert response to JSON
    // response.json() is also async, so we await it
    const data = await response.json();

    console.log('✅ Upload successful:', data);

    // Store table name globally so we can fetch its data later
    window.currentTableName = data.table_name;

    return data; // Return to caller (upload.html) for UI updates
  } catch (error) {
    console.error('❌ Upload error:', error);
    throw error; // Re-throw so caller can handle it
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. KPI API — Fetch Key Performance Indicators from uploaded dataset
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Fetch KPIs (Key Performance Indicators) from uploaded dataset
 * 
 * KPIs include: Total Revenue, Growth Rate, Transaction Count, etc.
 * 
 * @param {string} tableName - Name of uploaded dataset table
 * @returns {Promise} - Resolves with KPI data object
 */
async function fetchKPIs(tableName) {
  try {
    console.log(`📊 Fetching KPIs for table: ${tableName}`);

    const response = await fetch(`${API_BASE_URL}/kpi/${tableName}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch KPIs: ${response.status}`);
    }

    const kpiData = await response.json();
    console.log('✅ KPIs loaded:', kpiData);

    return kpiData;
  } catch (error) {
    console.error('❌ KPI fetch error:', error);
    // Return default KPIs if fetch fails
    return {
      total_revenue: 0,
      growth_rate: 0,
      transaction_count: 0,
      forecast_accuracy: 0
    };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. DATA API — Fetch raw data from uploaded dataset for table display
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Fetch paginated data from uploaded dataset
 * 
 * PAGINATION EXPLAINED:
 * - Skip: Number of rows to skip (for "page 1", skip=0)
 * - Limit: Max rows to return (e.g., limit=10 = show 10 rows per page)
 * - Example: skip=0, limit=10 → rows 0-9 (page 1)
 *           skip=10, limit=10 → rows 10-19 (page 2)
 * 
 * @param {string} tableName - Name of uploaded dataset table
 * @param {number} skip - Rows to skip (for pagination)
 * @param {number} limit - Max rows to return
 * @returns {Promise} - Resolves with data array and total count
 */
async function fetchTableData(tableName, skip = 0, limit = 10) {
  try {
    console.log(`📋 Fetching data from ${tableName} (skip=${skip}, limit=${limit})`);

    // QUERY PARAMETERS:
    // URL structure: /endpoint?param1=value1&param2=value2
    // These are query string parameters
    const url = `${API_BASE_URL}/data/${tableName}?skip=${skip}&limit=${limit}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.status}`);
    }

    const tableData = await response.json();
    console.log(`✅ Loaded ${tableData.data.length} rows`);

    return tableData; // Contains: { data: [...], total: 1000 }
  } catch (error) {
    console.error('❌ Table data fetch error:', error);
    return { data: [], total: 0 };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. FORECAST API — Get predictions for future dates
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Fetch forecast predictions from ML model
 * 
 * ASYNC/AWAIT IN DEPTH:
 * The backend trains a model on historical data and predicts future values.
 * This can take time, so we await the response.
 * 
 * @param {string} tableName - Name of uploaded dataset table
 * @param {number} days - How many days to forecast (1-180)
 * @returns {Promise} - Resolves with forecast data
 */
async function fetchForecast(tableName, days = 30) {
  try {
    console.log(`🔮 Generating forecast for ${days} days...`);

    const response = await fetch(
      `${API_BASE_URL}/forecast/${tableName}?days=${days}`
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || `Forecast failed: ${response.status}`);
    }

    const forecastData = await response.json();
    console.log('✅ Forecast generated:', forecastData);

    return forecastData;
  } catch (error) {
    console.error('❌ Forecast error:', error);
    throw error;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. ANALYTICS API — Get data for charts (trends, distributions, etc.)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Fetch analytics data for chart rendering
 * 
 * Returns different data types based on analysis_type:
 * - 'trend' → Time series data for line charts
 * - 'distribution' → Data for histograms
 * - 'category' → Categorical breakdown (pie/bar charts)
 * 
 * @param {string} tableName - Name of uploaded dataset table
 * @param {string} analysisType - Type of analysis ('trend', 'distribution', 'category')
 * @param {string} column - Column name to analyze
 * @returns {Promise} - Resolves with analytics data
 */
async function fetchAnalytics(tableName, analysisType = 'trend', column = null) {
  try {
    console.log(`📈 Fetching analytics: ${analysisType} for ${column}`);

    const url = new URL(`${API_BASE_URL}/analytics/${tableName}`);
    url.searchParams.append('type', analysisType);
    if (column) url.searchParams.append('column', column);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch analytics: ${response.status}`);
    }

    const analyticsData = await response.json();
    console.log('✅ Analytics loaded:', analyticsData);

    return analyticsData;
  } catch (error) {
    console.error('❌ Analytics fetch error:', error);
    return { data: [] };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. INSIGHTS API — Get AI-generated insights about data
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Fetch AI-generated insights about the dataset
 * 
 * The backend analyzes patterns and generates actionable insights.
 * 
 * @param {string} tableName - Name of uploaded dataset table
 * @returns {Promise} - Resolves with insights array
 */
async function fetchInsights(tableName) {
  try {
    console.log(`💡 Fetching AI insights...`);

    const response = await fetch(`${API_BASE_URL}/insights/${tableName}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch insights: ${response.status}`);
    }

    const insightsData = await response.json();
    console.log('✅ Insights loaded:', insightsData);

    return insightsData;
  } catch (error) {
    console.error('❌ Insights fetch error:', error);
    return { insights: [], recommendations: [] };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   7. HELPER: Format error messages for user display
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Extract error message from API response or error object
 * 
 * @param {Error|Response} error - Error object or fetch response
 * @returns {string} - User-friendly error message
 */
function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  if (error.detail) {
    return error.detail;
  }
  return 'An unknown error occurred. Please try again.';
}

/* ═══════════════════════════════════════════════════════════════════════════
   8. HELPER: Format numbers for display (KPI cards, tables)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Format number with thousands separator and decimals
 * 
 * EXAMPLES:
 * formatNumber(1000) → "1,000"
 * formatNumber(1234.567, 2) → "1,234.57"
 * formatNumber(0.95) → "0.95"
 * 
 * @param {number} value - Number to format
 * @param {number} decimals - Decimal places (default 0)
 * @returns {string} - Formatted number string
 */
function formatNumber(value, decimals = 0) {
  if (value === null || value === undefined) return '—';
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

/**
 * Format currency (USD)
 * 
 * EXAMPLES:
 * formatCurrency(1000) → "$1,000.00"
 * formatCurrency(999.5) → "$999.50"
 * 
 * @param {number} value - Amount in dollars
 * @returns {string} - Formatted currency string
 */
function formatCurrency(value) {
  if (value === null || value === undefined) return '—';
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

/**
 * Format percentage
 * 
 * @param {number} value - Decimal value (0.95 = 95%)
 * @param {number} decimals - Decimal places to show
 * @returns {string} - Formatted percentage string
 */
function formatPercentage(value, decimals = 1) {
  if (value === null || value === undefined) return '—';
  
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

/**
 * Format date for display
 * 
 * @param {string|Date} date - Date string or Date object
 * @returns {string} - Formatted date (MM/DD/YYYY)
 */
function formatDate(date) {
  if (!date) return '—';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US').format(dateObj);
}

/* ═══════════════════════════════════════════════════════════════════════════
   9. EXPORT FUNCTIONS (so other files can use them)
   
   ES6 Modules: window object makes them globally available
   Alternative: export default { ... } at module level
   ═══════════════════════════════════════════════════════════════════════════ */

// Make functions available globally for use in other scripts
window.API = {
  uploadDataset,
  fetchKPIs,
  fetchTableData,
  fetchForecast,
  fetchAnalytics,
  fetchInsights,
  getErrorMessage,
  formatNumber,
  formatCurrency,
  formatPercentage,
  formatDate
};

console.log('✅ API.js loaded successfully');
