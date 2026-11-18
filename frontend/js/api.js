/* ═══════════════════════════════════════════════════════════════════════════
   BizVision - API.js
   Backend API calls using fetch() with Authorization Session Header
   ═══════════════════════════════════════════════════════════════════════════ */

const API_BASE_URL = (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '8000'))
    ? 'http://127.0.0.1:8000/api'
    : '/api';
window.API_BASE_URL = API_BASE_URL;

// Helper to execute authenticated fetch requests
async function authFetch(url, options = {}) {
    const token = localStorage.getItem('session_token');
    const isAuthPage = window.location.pathname.endsWith("login.html") || window.location.pathname.endsWith("signup.html");

    // Avoid firing doomed API calls when not authenticated
    if (!token) {
        if (!isAuthPage) {
            window.location.href = 'login.html';
        }
        throw new Error('No authentication session token available.');
    }

    if (!options.headers) {
        options.headers = {};
    }
    options.headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(url, options);

    if (response.status === 401) {
        localStorage.removeItem('session_token');
        localStorage.removeItem('user_info');
        if (!isAuthPage) {
            window.location.href = 'login.html?expired=1';
        }
        throw new Error('Session expired. Please log in.');
    }

    if (response.status === 403) {
        console.warn('Access denied (403) for resource:', url);
        if (sessionStorage.getItem('currentTableName')) {
            sessionStorage.removeItem('currentTableName');
        }
    }

    return response;
}

// 1. Upload Dataset
async function uploadDataset(file) {
    const formData = new FormData();
    formData.append('file', file);

    const MAX_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        throw new Error(`File size exceeds 100MB limit. Your file: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
    }

    const response = await authFetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        let errMsg = `Upload failed with status ${response.status}`;
        try {
            const rawText = await response.text();
            try {
                const errorData = JSON.parse(rawText);
                if (typeof errorData.detail === 'string') {
                    errMsg = errorData.detail;
                } else if (Array.isArray(errorData.detail)) {
                    errMsg = errorData.detail.map(d => d.msg || (typeof d === 'string' ? d : JSON.stringify(d))).join(', ');
                }
            } catch {
                if (rawText && rawText.trim()) {
                    errMsg = rawText.trim();
                }
            }
        } catch (_) {}
        throw new Error(errMsg);
    }

    const data = await response.json();
    window.currentTableName = data.table_name;
    return data;
}

// 1b. Import from Kaggle URL or Dataset Slug
async function importKaggleDataset(urlOrSlug) {
    const response = await authFetch(`${API_BASE_URL}/upload/kaggle`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url_or_slug: urlOrSlug })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Kaggle import failed with status ${response.status}`);
    }

    const data = await response.json();
    window.currentTableName = data.table_name;
    return data;
}

// 1c. Delete Dataset
async function deleteDataset(tableName) {
    const response = await authFetch(`${API_BASE_URL}/datasets/${encodeURIComponent(tableName)}`, {
        method: 'DELETE'
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Delete dataset failed with status ${response.status}`);
    }
    return await response.json();
}

// 2. Fetch User Datasets / Tables
async function fetchTables() {
    try {
        const response = await authFetch(`${API_BASE_URL}/tables`);
        if (!response.ok) throw new Error('Failed to fetch tables');
        const data = await response.json();
        return data.tables || [];
    } catch (error) {
        console.error('❌ Fetch tables error:', error);
        return [];
    }
}

// 2b. Fetch User Datasets with Metadata (User-specific Isolation)
async function fetchUserDatasets() {
    try {
        const response = await authFetch(`${API_BASE_URL}/tables`);
        if (!response.ok) throw new Error('Failed to fetch datasets');
        const data = await response.json();
        return data.datasets || [];
    } catch (error) {
        console.error('❌ Fetch user datasets error:', error);
        return [];
    }
}

// 3. Fetch KPIs
async function fetchKPIs(tableName) {
    try {
        const response = await authFetch(`${API_BASE_URL}/kpi/${tableName}`);
        if (!response.ok) throw new Error(`Failed to fetch KPIs: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('❌ KPI fetch error:', error);
        return {
            total_revenue: 0,
            growth_rate: 0,
            transaction_count: 0,
            forecast_accuracy: 0
        };
    }
}

// 4. Fetch Table Data
async function fetchTableData(tableName, skip = 0, limit = 10) {
    try {
        const url = `${API_BASE_URL}/data/${tableName}?skip=${skip}&limit=${limit}`;
        const response = await authFetch(url);
        if (!response.ok) throw new Error(`Failed to fetch data: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('❌ Table data fetch error:', error);
        return { data: [], total: 0 };
    }
}

// 4b. Search Active Dataset Across All Columns
async function searchDataset(tableName, query, limit = 8) {
    if (!tableName || !query || !query.trim()) {
        return { dataset_id: tableName, query: query || '', total_matches: 0, results: [] };
    }
    try {
        const url = `${API_BASE_URL}/data/${encodeURIComponent(tableName)}/search?q=${encodeURIComponent(query.trim())}&limit=${limit}`;
        const response = await authFetch(url);
        if (!response.ok) throw new Error(`Search failed: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('❌ Dataset search error:', error);
        return { dataset_id: tableName, query, total_matches: 0, results: [] };
    }
}


// 5. Forecast & Model Training
async function fetchForecast(tableName, days = 30, targetCol = null, dateCol = null) {
    let url = `${API_BASE_URL}/forecast/${encodeURIComponent(tableName)}?days=${days}`;
    if (targetCol) url += `&target_col=${encodeURIComponent(targetCol)}`;
    if (dateCol) url += `&date_col=${encodeURIComponent(dateCol)}`;
    const response = await authFetch(url);
    if (!response.ok) {
        let errMsg = `Forecast failed with status ${response.status}`;
        try {
            const rawText = await response.text();
            try {
                const errorData = JSON.parse(rawText);
                if (typeof errorData.detail === 'string') errMsg = errorData.detail;
            } catch {
                if (rawText && rawText.trim()) errMsg = rawText.trim();
            }
        } catch (_) {}
        throw new Error(errMsg);
    }
    return await response.json();
}

async function trainForecast(tableName, modelType = 'auto', targetCol = null, dateCol = null) {
    let url = `${API_BASE_URL}/train/${encodeURIComponent(tableName)}?model_type=${encodeURIComponent(modelType)}`;
    if (targetCol) url += `&target_col=${encodeURIComponent(targetCol)}`;
    if (dateCol) url += `&date_col=${encodeURIComponent(dateCol)}`;
    const response = await authFetch(url, { method: 'POST' });
    if (!response.ok) {
        let errMsg = 'Could not train a forecast model.';
        try {
            const rawText = await response.text();
            try {
                const error = JSON.parse(rawText);
                if (typeof error.detail === 'string') errMsg = error.detail;
            } catch {
                if (rawText && rawText.trim()) errMsg = rawText.trim();
            }
        } catch (_) {}
        throw new Error(errMsg);
    }
    return await response.json();
}

async function sendForecastEmail(tableName, payload) {
    const response = await authFetch(`${API_BASE_URL}/forecast/${encodeURIComponent(tableName)}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to send forecast email');
    }
    return await response.json();
}


// 6. Analytics & Insights
async function fetchAnalytics(tableName) {
    try {
        const response = await authFetch(`${API_BASE_URL}/analytics/${tableName}`);
        if (!response.ok) throw new Error(`Failed to fetch analytics: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('❌ Analytics fetch error:', error);
        return { data: [] };
    }
}

async function fetchInsights(tableName, regenerate = false) {
    try {
        const url = `${API_BASE_URL}/insights/${encodeURIComponent(tableName)}${regenerate ? '?regenerate=true' : ''}`;
        const response = await authFetch(url);
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || `Failed to fetch insights: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('❌ Insights fetch error:', error);
        throw error;
    }
}

async function downloadInsightsReport(tableName) {
    const url = `${API_BASE_URL}/insights/${encodeURIComponent(tableName)}/download`;
    const response = await authFetch(url);
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to download insights report');
    }
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `ai_insights_${tableName}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);
}

async function sendInsightsEmail(tableName) {
    const url = `${API_BASE_URL}/insights/${encodeURIComponent(tableName)}/email`;
    const response = await authFetch(url, { method: 'POST' });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to send insights email');
    }
    return await response.json();
}

async function fetchComparison(datasetList, groupBy = 'month') {
    try {
        const datasetsParam = Array.isArray(datasetList) ? datasetList.join(',') : datasetList;
        const response = await authFetch(`${API_BASE_URL}/compare?datasets=${encodeURIComponent(datasetsParam)}&group_by=${groupBy}`);
        if (!response.ok) throw new Error(`Comparison request failed: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('❌ Multi-dataset comparison fetch error:', error);
        return { labels: [], datasets: [] };
    }
}

async function fetchCleanedDatasets() {
    try {
        const response = await authFetch(`${API_BASE_URL}/compare/datasets`);
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to fetch cleaned datasets');
        }
        return await response.json();
    } catch (error) {
        console.error('❌ Fetch cleaned datasets error:', error);
        throw error;
    }
}

async function fetchCompareColumns(datasetA, datasetB) {
    try {
        const url = `${API_BASE_URL}/compare/columns?dataset_a=${encodeURIComponent(datasetA)}&dataset_b=${encodeURIComponent(datasetB)}`;
        const response = await authFetch(url);
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to inspect dataset columns');
        }
        return await response.json();
    } catch (error) {
        console.error('❌ Fetch compare columns error:', error);
        throw error;
    }
}

async function runDatasetComparison(payload) {
    try {
        const response = await authFetch(`${API_BASE_URL}/compare/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Comparison calculation failed');
        }
        return await response.json();
    } catch (error) {
        console.error('❌ Run dataset comparison error:', error);
        throw error;
    }
}

async function exportComparisonCSV(payload) {
    try {
        const response = await authFetch(`${API_BASE_URL}/compare/export`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to export comparison report');
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `comparison_${payload.dataset_a}_vs_${payload.dataset_b}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('❌ Export comparison error:', error);
        throw error;
    }
}

async function fetchDatasetRecords(datasetId, skip = 0, limit = 100, search = '') {
    try {
        const query = search ? `&search=${encodeURIComponent(search)}` : '';
        const url = `${API_BASE_URL}/compare/records/${encodeURIComponent(datasetId)}?skip=${skip}&limit=${limit}${query}`;
        const response = await authFetch(url);
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to fetch dataset records');
        }
        return await response.json();
    } catch (error) {
        console.error('❌ Fetch dataset records error:', error);
        throw error;
    }
}

async function updateDatasetCell(datasetId, rowIndex, column, newValue) {
    try {
        const url = `${API_BASE_URL}/compare/records/${encodeURIComponent(datasetId)}/update`;
        const response = await authFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ row_index: rowIndex, column: column, new_value: newValue })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to update cell');
        }
        return await response.json();
    } catch (error) {
        console.error('❌ Update dataset cell error:', error);
        throw error;
    }
}

async function downloadDatasetFile(datasetId, filename = '') {
    try {
        const url = `${API_BASE_URL}/compare/records/${encodeURIComponent(datasetId)}/download`;
        const response = await authFetch(url);
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to download dataset');
        }
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename || `${datasetId}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
        console.error('❌ Download dataset file error:', error);
        throw error;
    }
}

// 7. Download & Email Reports (PART C)
async function downloadReport(tableName) {
    const response = await authFetch(`${API_BASE_URL}/download/${tableName}`);
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to download report');
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_${tableName}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
}

async function sendReportEmail(tableName) {
    const response = await authFetch(`${API_BASE_URL}/send-report/${tableName}`, { method: 'POST' });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to send report email');
    }
    return await response.json();
}

// 7b. Comprehensive Reports APIs
async function fetchReportAnalytics(tableName, params = {}) {
    const q = new URLSearchParams();
    if (params.report_type) q.append('report_type', params.report_type);
    if (params.date_preset) q.append('date_preset', params.date_preset);
    if (params.start_date) q.append('start_date', params.start_date);
    if (params.end_date) q.append('end_date', params.end_date);
    if (params.compare) q.append('compare', params.compare);

    const url = `${API_BASE_URL}/reports/analytics/${encodeURIComponent(tableName)}?${q.toString()}`;
    const response = await authFetch(url);
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `Failed to fetch report analytics: ${response.status}`);
    }
    return await response.json();
}

async function fetchDrilldown(tableName, payload) {
    const url = `${API_BASE_URL}/reports/drilldown/${encodeURIComponent(tableName)}`;
    const response = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to fetch drill-down data');
    }
    return await response.json();
}

async function exportReportFile(tableName, format = 'CSV', params = {}) {
    const q = new URLSearchParams({ format });
    if (params.report_type) q.append('report_type', params.report_type);
    if (params.date_preset) q.append('date_preset', params.date_preset);
    if (params.start_date) q.append('start_date', params.start_date);
    if (params.end_date) q.append('end_date', params.end_date);

    const url = `${API_BASE_URL}/reports/export/${encodeURIComponent(tableName)}?${q.toString()}`;
    const response = await authFetch(url);
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `Export failed: ${response.status}`);
    }
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    const ext = format.toLowerCase() === 'excel' ? 'xlsx' : format.toLowerCase();
    a.download = `BizVision_${params.report_type || 'sales'}_report.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);
}

async function dispatchReportEmail(payload) {
    const url = `${API_BASE_URL}/reports/send-email`;
    const response = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to send report email');
    }
    return await response.json();
}

async function fetchReportEmailHistory() {
    const url = `${API_BASE_URL}/reports/email-history`;
    const response = await authFetch(url);
    if (!response.ok) throw new Error('Failed to fetch email history');
    return await response.json();
}

async function resendReportEmail(historyId) {
    const url = `${API_BASE_URL}/reports/email-history/resend/${historyId}`;
    const response = await authFetch(url, { method: 'POST' });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to resend report');
    }
    return await response.json();
}

async function fetchReportSchedules() {
    const url = `${API_BASE_URL}/reports/schedules`;
    const response = await authFetch(url);
    if (!response.ok) throw new Error('Failed to fetch schedules');
    return await response.json();
}

async function createReportSchedule(payload) {
    const url = `${API_BASE_URL}/reports/schedules`;
    const response = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to create schedule');
    }
    return await response.json();
}

async function updateReportSchedule(scheduleId, status) {
    const url = `${API_BASE_URL}/reports/schedules/${scheduleId}?status=${encodeURIComponent(status)}`;
    const response = await authFetch(url, { method: 'PUT' });
    if (!response.ok) throw new Error('Failed to update schedule');
    return await response.json();
}

async function deleteReportSchedule(scheduleId) {
    const url = `${API_BASE_URL}/reports/schedules/${scheduleId}`;
    const response = await authFetch(url, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete schedule');
    return await response.json();
}

async function fetchSavedReports() {
    const url = `${API_BASE_URL}/reports/saved`;
    const response = await authFetch(url);
    if (!response.ok) throw new Error('Failed to fetch saved reports');
    return await response.json();
}

async function saveCustomReport(payload) {
    const url = `${API_BASE_URL}/reports/saved`;
    const response = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to save custom report');
    }
    return await response.json();
}

async function loadSavedReport(tokenOrId) {
    const url = `${API_BASE_URL}/reports/saved/${encodeURIComponent(tokenOrId)}`;
    const response = await authFetch(url);
    if (!response.ok) throw new Error('Failed to load saved report');
    return await response.json();
}

async function deleteSavedReport(reportId) {
    const url = `${API_BASE_URL}/reports/saved/${reportId}`;
    const response = await authFetch(url, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete saved report');
    return await response.json();
}

// 7c. User Settings & Storage APIs
async function fetchSettings() {
    const url = `${API_BASE_URL}/settings`;
    const response = await authFetch(url);
    if (!response.ok) throw new Error('Failed to load user settings');
    return await response.json();
}

async function saveSettings(payload) {
    const url = `${API_BASE_URL}/settings`;
    const response = await authFetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to save settings');
    }
    return await response.json();
}

async function uploadBrandingImage(file) {
    const formData = new FormData();
    formData.append('file', file);
    const url = `${API_BASE_URL}/settings/branding/upload`;
    const response = await authFetch(url, {
        method: 'POST',
        body: formData
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to upload branding image');
    }
    return await response.json();
}

async function removeBrandingImage() {
    const url = `${API_BASE_URL}/settings/branding`;
    const response = await authFetch(url, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to remove branding image');
    return await response.json();
}

async function fetchStorageStats() {
    const url = `${API_BASE_URL}/settings/storage`;
    const response = await authFetch(url);
    if (!response.ok) throw new Error('Failed to load storage statistics');
    return await response.json();
}

async function deleteStorageFile(datasetId) {
    const url = `${API_BASE_URL}/settings/storage/file/${encodeURIComponent(datasetId)}`;
    const response = await authFetch(url, { method: 'DELETE' });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to delete file');
    }
    return await response.json();
}

async function clearStorageCache() {
    const url = `${API_BASE_URL}/settings/storage/clear-cache`;
    const response = await authFetch(url, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to clear cache');
    return await response.json();
}

// 7d. Personal Gmail Integration APIs (Multi-User SaaS)
async function fetchGmailStatus() {
    const url = `${API_BASE_URL}/gmail/status`;
    const response = await authFetch(url);
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to fetch Gmail status');
    }
    return await response.json();
}

async function getGmailConnectUrl() {
    const url = `${API_BASE_URL}/gmail/connect`;
    const response = await authFetch(url);
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to initiate Gmail connection');
    }
    return await response.json();
}

async function disconnectGmail() {
    const url = `${API_BASE_URL}/gmail/disconnect`;
    const response = await authFetch(url, { method: 'POST' });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to disconnect Gmail account');
    }
    return await response.json();
}

async function sendGmailTestEmail(recipient = null) {
    const url = `${API_BASE_URL}/gmail/test-email`;
    const response = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipient ? { recipient } : {})
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to send verification test email');
    }
    return await response.json();
}

// Formatting Helpers
function formatNumber(value, decimals = 0) {
    if (value === null || value === undefined) return '—';
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(value);
}

function formatCurrency(value) {
    if (value === null || value === undefined) return '—';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

function formatPercentage(value, decimals = 1) {
    if (value === null || value === undefined) return '—';
    return new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(value);
}

function formatDate(date) {
    if (!date) return '—';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('en-US').format(dateObj);
}

function getErrorMessage(error) {
    if (error instanceof Error) return error.message;
    if (error.detail) return error.detail;
    return 'An unknown error occurred. Please try again.';
}

// 8. AI Chat Assistant
async function sendChatMessage(datasetId, message) {
    try {
        const response = await authFetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataset_id: datasetId, query: message })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || `Chat request failed: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('❌ AI Chat error:', error);
        throw error;
    }
}

// Global Export
window.API = {
    uploadDataset,
    importKaggleDataset,
    deleteDataset,
    fetchTables,
    fetchUserDatasets,
    fetchCleanedDatasets,
    fetchCompareColumns,
    runDatasetComparison,
    exportComparisonCSV,
    fetchDatasetRecords,
    updateDatasetCell,
    downloadDatasetFile,
    fetchKPIs,
    fetchTableData,
    searchDataset,
    fetchForecast,
    trainForecast,
    fetchAnalytics,
    fetchInsights,
    downloadInsightsReport,
    sendInsightsEmail,
    fetchComparison,
    sendChatMessage,
    downloadReport,
    sendReportEmail,
    sendForecastEmail,
    fetchReportAnalytics,
    fetchDrilldown,
    exportReportFile,
    dispatchReportEmail,
    fetchReportEmailHistory,
    resendReportEmail,
    fetchReportSchedules,
    createReportSchedule,
    updateReportSchedule,
    deleteReportSchedule,
    fetchSavedReports,
    saveCustomReport,
    loadSavedReport,
    deleteSavedReport,
    fetchSettings,
    saveSettings,
    uploadBrandingImage,
    removeBrandingImage,
    fetchStorageStats,
    deleteStorageFile,
    clearStorageCache,
    fetchGmailStatus,
    getGmailConnectUrl,
    disconnectGmail,
    sendGmailTestEmail,
    getErrorMessage,
    formatNumber,
    formatCurrency,
    formatPercentage,
    formatDate
};

console.log('✅ API.js loaded successfully with auth, report, AI Chat & multi-dataset comparison capabilities.');
