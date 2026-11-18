/**
 * BizVision - Reports Page Controller
 * Handles dataset selection, filters, KPIs, responsive Chart.js visualisations,
 * interactive drill-downs, auto-insights, data table sorting/pagination/toggles,
 * export (PDF, Excel, CSV), email dispatch with 30s spam protection, scheduling,
 * and saved custom reports.
 */

(function () {
    'use strict';

    // Application state
    const state = {
        datasets: [],
        selectedDataset: '',
        reportType: 'sales',     // 'sales', 'profit', 'customer', 'product', 'regional'
        datePreset: 'all',       // '7d', '30d', '90d', 'custom', 'all'
        startDate: '',
        endDate: '',
        compare: 'mom',          // 'mom', 'yoy', 'none'
        analyticsData: null,
        drilldown: {
            active: false,
            dimension: '',
            value: '',
            path: [],            // Array of { dimension, value }
            data: null
        },
        table: {
            search: '',
            sortColumn: '',
            sortDirection: 'asc',
            page: 1,
            pageSize: 10,
            allColumns: [],
            visibleColumns: []
        },
        charts: {
            trend: null,
            category: null,
            region: null
        },
        spamSeconds: 0,
        spamTimerId: null
    };

    // DOM Utilities
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TOAST NOTIFICATIONS
    // ─────────────────────────────────────────────────────────────────────────
    function showToast(message, type = 'info') {
        const container = $('#toast-container') || createToastContainer();
        const toast = document.createElement('div');
        toast.className = `report-toast report-toast-${type}`;
        
        let icon = 'ℹ️';
        if (type === 'success') icon = '✅';
        else if (type === 'error') icon = '❌';
        else if (type === 'warning') icon = '⚠️';

        toast.innerHTML = `
            <span class="report-toast-icon">${icon}</span>
            <div class="report-toast-message">${escapeHtml(message)}</div>
            <button class="report-toast-close" aria-label="Close">&times;</button>
        `;

        container.appendChild(toast);
        
        // Auto remove
        const timer = setTimeout(() => {
            removeToast(toast);
        }, 4500);

        toast.querySelector('.report-toast-close').addEventListener('click', () => {
            clearTimeout(timer);
            removeToast(toast);
        });
    }

    function removeToast(toast) {
        toast.classList.add('report-toast-fade');
        setTimeout(() => toast.remove(), 300);
    }

    function createToastContainer() {
        const c = document.createElement('div');
        c.id = 'toast-container';
        c.className = 'report-toast-container';
        document.body.appendChild(c);
        return c;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INITIALIZATION
    // ─────────────────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', async () => {
        initEventListeners();
        checkTheme();
        window.addEventListener('themeChanged', () => updateChartTheme());

        // Apply saved global table rows per page setting
        const savedPageSize = parseInt(localStorage.getItem('bizvision_rows_per_page'), 10);
        if (savedPageSize && [10, 25, 50].includes(savedPageSize)) {
            state.table.pageSize = savedPageSize;
            const pageSizeSel = $('#table-page-size-select');
            if (pageSizeSel) pageSizeSel.value = String(savedPageSize);
        }

        // Apply report branding watermark
        applyReportBrandingWatermark();

        // Check for share link or saved report param
        const urlParams = new URLSearchParams(window.location.search);
        const shareToken = urlParams.get('share');
        const datasetParam = urlParams.get('dataset');

        await loadDatasetsList();

        if (shareToken) {
            await loadSharedReport(shareToken);
        } else if (datasetParam && state.datasets.includes(datasetParam)) {
            selectDataset(datasetParam);
        } else {
            const savedDs = sessionStorage.getItem('currentTableName');
            if (savedDs && state.datasets.includes(savedDs)) {
                selectDataset(savedDs);
            } else if (state.datasets.length > 0) {
                // Keep empty state initially as requested in Section 1:
                // "Until a dataset is selected, show an empty state: 'Select a dataset to generate a report.'"
                showEmptyState(true);
            } else {
                showEmptyState(true, 'No datasets uploaded yet. Upload a dataset to generate reports.');
            }
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // DATASET LOADING & SELECTION
    // ─────────────────────────────────────────────────────────────────────────
    async function loadDatasetsList() {
        try {
            const tables = await window.API.fetchTables();
            state.datasets = tables || [];
            const selectEl = $('#report-dataset-select');
            if (!selectEl) return;

            selectEl.innerHTML = '<option value="">-- Select a Dataset --</option>';
            state.datasets.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t;
                opt.textContent = t;
                selectEl.appendChild(opt);
            });
        } catch (err) {
            console.error('Error fetching datasets:', err);
            showToast('Failed to load dataset list', 'error');
        }
    }

    function selectDataset(datasetName) {
        if (!datasetName) {
            state.selectedDataset = '';
            sessionStorage.removeItem('currentTableName');
            showEmptyState(true);
            return;
        }

        state.selectedDataset = datasetName;
        sessionStorage.setItem('currentTableName', datasetName);
        const selectEl = $('#report-dataset-select');
        if (selectEl) selectEl.value = datasetName;

        showEmptyState(false);
        loadReportData();
    }

    function showEmptyState(show, customMessage = null) {
        const emptyEl = $('#report-empty-state');
        const contentEl = $('#report-content-container');
        const emptyMsgEl = $('#report-empty-message');

        if (show) {
            if (emptyEl) emptyEl.style.display = 'block';
            if (contentEl) contentEl.style.display = 'none';
            if (emptyMsgEl && customMessage) emptyMsgEl.textContent = customMessage;
        } else {
            if (emptyEl) emptyEl.style.display = 'none';
            if (contentEl) contentEl.style.display = 'block';
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LOAD REPORT DATA FROM BACKEND
    // ─────────────────────────────────────────────────────────────────────────
    async function loadReportData() {
        if (!state.selectedDataset) return;

        setLoadingState(true);
        try {
            const params = {
                report_type: state.reportType,
                date_preset: state.datePreset,
                start_date: state.startDate,
                end_date: state.endDate,
                compare: state.compare
            };

            const data = await window.API.fetchReportAnalytics(state.selectedDataset, params);
            state.analyticsData = data;

            // Update UI elements
            updateHeaderMetadata(data);
            renderKPICards(data.kpis);
            renderAutoInsights(data.auto_insights);
            renderCharts(data.charts);
            initDataTable(data.table_data);

            // If drilldown was active, reset it on new dataset/filter load
            resetDrilldown();

        } catch (err) {
            console.error('Failed to load report analytics:', err);
            showToast(window.API.getErrorMessage(err), 'error');
        } finally {
            setLoadingState(false);
        }
    }

    function setLoadingState(isLoading) {
        const loader = $('#report-loading-skeleton');
        const main = $('#report-data-display');
        if (loader && main) {
            loader.style.display = isLoading ? 'grid' : 'none';
            main.style.display = isLoading ? 'none' : 'block';
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UI RENDERING: HEADER & METADATA
    // ─────────────────────────────────────────────────────────────────────────
    function updateHeaderMetadata(data) {
        const dsNameEl = $('#active-dataset-name');
        const lastUpdatedEl = $('#report-last-updated');
        const reportBadgeEl = $('#active-report-badge');
        const recordCountEl = $('#report-filtered-count');

        if (dsNameEl) dsNameEl.textContent = data.dataset_id;
        if (lastUpdatedEl) lastUpdatedEl.textContent = data.last_updated;
        if (reportBadgeEl) {
            const titles = {
                sales: 'Sales Performance Report',
                profit: 'Profit & Margin Analysis',
                customer: 'Customer & Account Report',
                product: 'Product & Inventory Velocity',
                regional: 'Regional Geographic Distribution'
            };
            reportBadgeEl.textContent = titles[state.reportType] || 'Standard Analytics Report';
        }
        if (recordCountEl) {
            recordCountEl.textContent = `${data.filtered_records.toLocaleString()} rows (${data.total_records.toLocaleString()} total)`;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UI RENDERING: 5 KPI SUMMARY CARDS
    // ─────────────────────────────────────────────────────────────────────────
    function renderKPICards(kpis) {
        const kpiGrid = $('#report-kpi-grid');
        if (!kpiGrid || !kpis) return;

        const cardsConfig = [
            { key: 'total_sales', label: 'Total Sales', icon: '💵' },
            { key: 'total_profit', label: 'Total Profit', icon: '📈' },
            { key: 'profit_margin', label: 'Profit Margin %', icon: '💎' },
            { key: 'total_orders', label: 'Total Orders', icon: '📦' },
            { key: 'average_order_value', label: 'Average Order Value', icon: '🛒' }
        ];

        kpiGrid.innerHTML = cardsConfig.map(cfg => {
            const kpi = kpis[cfg.key] || { value: '—', growth_pct: '0%', is_positive: true, period_label: 'vs benchmark' };
            const isPos = kpi.is_positive;
            const arrow = isPos ? '↑' : '↓';
            const colorClass = isPos ? 'growth-positive' : 'growth-negative';

            return `
                <div class="report-kpi-card" tabindex="0">
                    <div class="report-kpi-header">
                        <span class="report-kpi-icon">${cfg.icon}</span>
                        <span class="report-kpi-title">${escapeHtml(cfg.label)}</span>
                    </div>
                    <div class="report-kpi-value">${escapeHtml(kpi.value)}</div>
                    <div class="report-kpi-footer">
                        <span class="report-kpi-growth ${colorClass}">
                            <span class="growth-arrow">${arrow}</span> ${escapeHtml(kpi.growth_pct)}
                        </span>
                        <span class="report-kpi-benchmark">${escapeHtml(kpi.period_label || 'vs prev period')}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UI RENDERING: AUTO INSIGHTS (Rule-based 3-5 items)
    // ─────────────────────────────────────────────────────────────────────────
    function renderAutoInsights(insights) {
        const container = $('#auto-insights-list');
        if (!container) return;

        if (!insights || insights.length === 0) {
            container.innerHTML = '<div class="report-empty-item">No specific anomalies or patterns detected for this filter.</div>';
            return;
        }

        container.innerHTML = insights.map(item => {
            return `
                <div class="insight-badge-card insight-${item.type}">
                    <div class="insight-badge-icon">${item.icon}</div>
                    <div class="insight-badge-content">
                        <div class="insight-badge-title">${escapeHtml(item.title)}</div>
                        <div class="insight-badge-text">${item.text}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UI RENDERING: CHARTS (Chart.js)
    // ─────────────────────────────────────────────────────────────────────────
    function isDarkMode() {
        return document.documentElement.getAttribute('data-theme') === 'dark' || 
               document.body.classList.contains('dark-mode');
    }

    function updateChartTheme() {
        if (!state.analyticsData) return;
        renderCharts(state.analyticsData.charts);
    }

    function renderCharts(chartsData) {
        if (!chartsData) return;

        const dark = isDarkMode();
        const textColor = dark ? '#94a3b8' : '#475569';
        const gridColor = dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';

        // 1. Trend Line Chart (Time-series)
        renderTrendChart(chartsData.trend, textColor, gridColor);

        // 2. Category Bar Chart
        renderCategoryChart(chartsData.category, textColor, gridColor);

        // 3. Region Donut Chart
        renderRegionChart(chartsData.region, textColor);

        // 4. Top 10 Products Table
        renderTopProductsTable(chartsData.top_products);
    }

    function renderTrendChart(trendData, textColor, gridColor) {
        const canvas = $('#chart-trend-line');
        if (!canvas) return;

        if (state.charts.trend) {
            state.charts.trend.destroy();
        }

        const ctx = canvas.getContext('2d');
        const salesGradient = ctx.createLinearGradient(0, 0, 0, 260);
        salesGradient.addColorStop(0, 'rgba(79, 70, 229, 0.35)');
        salesGradient.addColorStop(1, 'rgba(79, 70, 229, 0.0)');

        const profitGradient = ctx.createLinearGradient(0, 0, 0, 260);
        profitGradient.addColorStop(0, 'rgba(20, 184, 166, 0.35)');
        profitGradient.addColorStop(1, 'rgba(20, 184, 166, 0.0)');

        state.charts.trend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: trendData.labels,
                datasets: [
                    {
                        label: 'Total Sales ($)',
                        data: trendData.sales,
                        borderColor: '#6366f1',
                        backgroundColor: salesGradient,
                        borderWidth: 2.5,
                        tension: 0.35,
                        fill: true,
                        pointRadius: 3,
                        pointHoverRadius: 6
                    },
                    {
                        label: 'Gross Profit ($)',
                        data: trendData.profit,
                        borderColor: '#14b8a6',
                        backgroundColor: profitGradient,
                        borderWidth: 2,
                        tension: 0.35,
                        fill: true,
                        pointRadius: 3,
                        pointHoverRadius: 6
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
                        position: 'top',
                        labels: { color: textColor, boxWidth: 12, usePointStyle: true }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: $${Number(ctx.raw).toLocaleString(undefined, {minimumFractionDigits: 2})}`
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: textColor, maxTicksLimit: 12 },
                        grid: { color: gridColor }
                    },
                    y: {
                        ticks: {
                            color: textColor,
                            callback: (v) => `$${Number(v).toLocaleString()}`
                        },
                        grid: { color: gridColor }
                    }
                }
            }
        });
    }

    function renderCategoryChart(categoryData, textColor, gridColor) {
        const canvas = $('#chart-category-bar');
        if (!canvas) return;

        if (state.charts.category) {
            state.charts.category.destroy();
        }

        const ctx = canvas.getContext('2d');
        state.charts.category = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: categoryData.labels,
                datasets: [
                    {
                        label: 'Sales ($)',
                        data: categoryData.sales,
                        backgroundColor: '#4f46e5',
                        borderRadius: 6
                    },
                    {
                        label: 'Profit ($)',
                        data: categoryData.profit,
                        backgroundColor: '#14b8a6',
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (evt, activeEls) => {
                    if (activeEls.length > 0) {
                        const idx = activeEls[0].index;
                        const catName = categoryData.labels[idx];
                        openDrilldown('category', catName);
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: textColor, boxWidth: 12 }
                    },
                    tooltip: {
                        callbacks: {
                            afterLabel: () => '👉 Click to drill-down into sub-categories'
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: textColor, maxRotation: 35 },
                        grid: { color: gridColor }
                    },
                    y: {
                        ticks: {
                            color: textColor,
                            callback: (v) => `$${Number(v).toLocaleString()}`
                        },
                        grid: { color: gridColor }
                    }
                }
            }
        });
    }

    function renderRegionChart(regionData, textColor) {
        const canvas = $('#chart-region-pie');
        if (!canvas) return;

        if (state.charts.region) {
            state.charts.region.destroy();
        }

        const colors = [
            '#4f46e5', '#14b8a6', '#0ea5e9', '#f59e0b', 
            '#ec4899', '#8b5cf6', '#10b981', '#f97316'
        ];

        const ctx = canvas.getContext('2d');
        state.charts.region = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: regionData.labels,
                datasets: [{
                    data: regionData.values,
                    backgroundColor: colors.slice(0, regionData.labels.length),
                    borderWidth: 2,
                    borderColor: isDarkMode() ? '#1e293b' : '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                onClick: (evt, activeEls) => {
                    if (activeEls.length > 0) {
                        const idx = activeEls[0].index;
                        const regionName = regionData.labels[idx];
                        openDrilldown('region', regionName);
                    }
                },
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: textColor, boxWidth: 12, usePointStyle: true }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${ctx.label}: $${Number(ctx.raw).toLocaleString()} (${((ctx.raw / (ctx.dataset.data.reduce((a, b) => a + b, 0) || 1)) * 100).toFixed(1)}%)`,
                            afterLabel: () => '👉 Click to drill-down into States & Cities'
                        }
                    }
                }
            }
        });
    }

    function renderTopProductsTable(products) {
        const tbody = $('#top-products-tbody');
        if (!tbody) return;

        if (!products || products.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--color-neutral-600);">No products found</td></tr>';
            return;
        }

        tbody.innerHTML = products.map((p, idx) => {
            const isProfitPos = p.profit >= 0;
            return `
                <tr>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="rank-badge">${idx + 1}</span>
                            <span title="${escapeHtml(p.product_name)}" class="table-truncate-text">${escapeHtml(p.product_name)}</span>
                        </div>
                    </td>
                    <td class="num-cell">$${p.sales.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    <td class="num-cell" style="color: ${isProfitPos ? 'var(--color-teal)' : 'var(--color-red)'};">
                        $${p.profit.toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </td>
                    <td class="num-cell">${p.quantity.toLocaleString()}</td>
                </tr>
            `;
        }).join('');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DRILL-DOWN PANEL & BREADCRUMBS (Section 6)
    // ─────────────────────────────────────────────────────────────────────────
    async function openDrilldown(dimension, value) {
        state.drilldown.active = true;
        state.drilldown.dimension = dimension;
        state.drilldown.value = value;
        state.drilldown.path = [{ dimension, value }];

        await fetchAndRenderDrilldown();
    }

    async function pushDrilldownStep(dimension, value) {
        state.drilldown.path.push({ dimension, value });
        state.drilldown.dimension = dimension;
        state.drilldown.value = value;
        await fetchAndRenderDrilldown();
    }

    async function navigateDrilldownBreadcrumb(index) {
        if (index === -1) {
            resetDrilldown();
            return;
        }
        state.drilldown.path = state.drilldown.path.slice(0, index + 1);
        const lastStep = state.drilldown.path[state.drilldown.path.length - 1];
        state.drilldown.dimension = lastStep.dimension;
        state.drilldown.value = lastStep.value;
        await fetchAndRenderDrilldown();
    }

    async function fetchAndRenderDrilldown() {
        const modal = $('#drilldown-modal');
        const content = $('#drilldown-modal-content');
        if (!modal || !content) return;

        modal.style.display = 'flex';
        content.innerHTML = '<div class="report-loading-spinner">Loading drill-down breakdown...</div>';

        try {
            const payload = {
                dimension: state.drilldown.dimension,
                value: state.drilldown.value,
                path: state.drilldown.path.slice(0, -1)
            };

            const res = await window.API.fetchDrilldown(state.selectedDataset, payload);
            state.drilldown.data = res;

            renderDrilldownView(res);
        } catch (err) {
            content.innerHTML = `<div class="report-error-box">${escapeHtml(window.API.getErrorMessage(err))}</div>`;
        }
    }

    function renderDrilldownView(data) {
        const content = $('#drilldown-modal-content');
        if (!content) return;

        // Build breadcrumb trail
        let breadcrumbHtml = `<span class="breadcrumb-item" onclick="window.ReportsCtrl.navDrill(-1)">All Data</span>`;
        state.drilldown.path.forEach((step, idx) => {
            const isLast = idx === state.drilldown.path.length - 1;
            breadcrumbHtml += `
                <span class="breadcrumb-separator">›</span>
                <span class="breadcrumb-item ${isLast ? 'breadcrumb-active' : ''}" 
                      ${!isLast ? `onclick="window.ReportsCtrl.navDrill(${idx})"` : ''}>
                    ${escapeHtml(step.value)}
                </span>
            `;
        });

        content.innerHTML = `
            <div class="drilldown-header-bar">
                <div>
                    <h3 style="margin: 0; font-size: 18px; color: var(--color-indigo);">Drill-down Analysis</h3>
                    <div class="drilldown-breadcrumbs">${breadcrumbHtml}</div>
                </div>
                <div class="drilldown-summary-stats">
                    <div class="drilldown-stat">
                        <span class="label">Total Sales:</span>
                        <strong>$${data.total_sales.toLocaleString(undefined, {minimumFractionDigits: 2})}</strong>
                    </div>
                    <div class="drilldown-stat">
                        <span class="label">Total Profit:</span>
                        <strong style="color: ${data.total_profit >= 0 ? 'var(--color-teal)' : 'var(--color-red)'};">
                            $${data.total_profit.toLocaleString(undefined, {minimumFractionDigits: 2})}
                        </strong>
                    </div>
                    <div class="drilldown-stat">
                        <span class="label">Records:</span>
                        <strong>${data.record_count.toLocaleString()}</strong>
                    </div>
                </div>
            </div>

            <div class="drilldown-table-wrapper" style="margin-top: 15px;">
                <table class="report-data-table">
                    <thead>
                        <tr>
                            <th>${escapeHtml(data.next_dimension || 'Sub-category')}</th>
                            <th class="num-cell">Sales ($)</th>
                            <th class="num-cell">Profit ($)</th>
                            <th style="width: 120px; text-align: center;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.breakdown.length === 0 ? '<tr><td colspan="4" style="text-align:center;">No sub-level breakdown records found</td></tr>' : 
                          data.breakdown.map(b => `
                            <tr>
                                <td style="font-weight: 500;">${escapeHtml(b.label)}</td>
                                <td class="num-cell">$${b.sales.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                <td class="num-cell" style="color: ${b.profit >= 0 ? 'var(--color-teal)' : 'var(--color-red)'};">
                                    $${b.profit.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                </td>
                                <td style="text-align: center;">
                                    ${b.can_drill ? `
                                        <button class="btn-drill-deep" onclick="window.ReportsCtrl.drillDeep('${escapeHtml(data.next_dimension)}', '${escapeHtml(b.label)}')">
                                            Drill Deeper 🔍
                                        </button>
                                    ` : '<span style="color: var(--color-neutral-600); font-size: 12px;">Final Level</span>'}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function resetDrilldown() {
        state.drilldown.active = false;
        state.drilldown.dimension = '';
        state.drilldown.value = '';
        state.drilldown.path = [];
        state.drilldown.data = null;
        const modal = $('#drilldown-modal');
        if (modal) modal.style.display = 'none';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DATA TABLE: SORTING, SEARCHING, PAGINATION, COLUMN TOGGLES (Section 8)
    // ─────────────────────────────────────────────────────────────────────────
    function initDataTable(tableData) {
        if (!tableData) return;

        state.table.allColumns = tableData.columns || [];
        // Default visible columns: up to first 7 columns
        if (state.table.visibleColumns.length === 0) {
            state.table.visibleColumns = state.table.allColumns.slice(0, 7);
        }
        state.table.page = 1;

        populateColumnToggleDropdown();
        renderDataTable();
    }

    function populateColumnToggleDropdown() {
        const container = $('#column-toggle-options');
        if (!container) return;

        container.innerHTML = state.table.allColumns.map(col => {
            const isChecked = state.table.visibleColumns.includes(col);
            return `
                <label class="col-toggle-label">
                    <input type="checkbox" value="${escapeHtml(col)}" ${isChecked ? 'checked' : ''} onchange="window.ReportsCtrl.toggleCol(this)">
                    <span>${escapeHtml(col)}</span>
                </label>
            `;
        }).join('');
    }

    function toggleColumnVisibility(checkbox) {
        const col = checkbox.value;
        if (checkbox.checked) {
            if (!state.table.visibleColumns.includes(col)) {
                state.table.visibleColumns.push(col);
            }
        } else {
            // Keep at least one column
            if (state.table.visibleColumns.length > 1) {
                state.table.visibleColumns = state.table.visibleColumns.filter(c => c !== col);
            } else {
                checkbox.checked = true;
                showToast('At least one column must be visible', 'warning');
                return;
            }
        }
        renderDataTable();
    }

    function renderDataTable() {
        const thead = $('#report-table-head');
        const tbody = $('#report-table-body');
        const pageInfo = $('#table-pagination-info');
        if (!thead || !tbody || !state.analyticsData) return;

        const rawRows = state.analyticsData.table_data.rows || [];
        
        // 1. Filter by search text
        let filtered = rawRows;
        if (state.table.search.trim()) {
            const query = state.table.search.trim().toLowerCase();
            filtered = rawRows.filter(row => {
                return Object.values(row).some(v => String(v ?? '').toLowerCase().includes(query));
            });
        }

        // 2. Sort
        if (state.table.sortColumn) {
            const col = state.table.sortColumn;
            const asc = state.table.sortDirection === 'asc';
            filtered.sort((a, b) => {
                const valA = a[col] ?? '';
                const valB = b[col] ?? '';
                if (typeof valA === 'number' && typeof valB === 'number') {
                    return asc ? valA - valB : valB - valA;
                }
                return asc ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
            });
        }

        // 3. Paginate
        const total = filtered.length;
        const totalPages = Math.ceil(total / state.table.pageSize) || 1;
        state.table.page = Math.max(1, Math.min(state.table.page, totalPages));

        const startIdx = (state.table.page - 1) * state.table.pageSize;
        const pageRows = filtered.slice(startIdx, startIdx + state.table.pageSize);

        // Render Head
        thead.innerHTML = `
            <tr>
                ${state.table.visibleColumns.map(col => {
                    let sortIndicator = '↕';
                    if (state.table.sortColumn === col) {
                        sortIndicator = state.table.sortDirection === 'asc' ? '↑' : '↓';
                    }
                    return `
                        <th class="sortable-th" onclick="window.ReportsCtrl.sortTable('${escapeHtml(col)}')">
                            <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px;">
                                <span>${escapeHtml(col)}</span>
                                <span class="sort-icon">${sortIndicator}</span>
                            </div>
                        </th>
                    `;
                }).join('')}
            </tr>
        `;

        // Render Body
        if (pageRows.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="${state.table.visibleColumns.length}" style="text-align: center; padding: 25px; color: var(--color-neutral-600);">
                        No records match the current filter or search criteria.
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = pageRows.map(row => {
                return `
                    <tr>
                        ${state.table.visibleColumns.map(col => {
                            const val = row[col];
                            const isNum = typeof val === 'number';
                            return `<td class="${isNum ? 'num-cell' : ''}">${escapeHtml(val)}</td>`;
                        }).join('')}
                    </tr>
                `;
            }).join('');
        }

        // Update Pagination controls
        if (pageInfo) {
            const startDisplay = total === 0 ? 0 : startIdx + 1;
            const endDisplay = Math.min(startIdx + state.table.pageSize, total);
            pageInfo.textContent = `Showing ${startDisplay} to ${endDisplay} of ${total} entries`;
        }

        const prevBtn = $('#btn-table-prev');
        const nextBtn = $('#btn-table-next');
        const currPageSpan = $('#table-current-page');
        if (prevBtn) prevBtn.disabled = state.table.page <= 1;
        if (nextBtn) nextBtn.disabled = state.table.page >= totalPages;
        if (currPageSpan) currPageSpan.textContent = `Page ${state.table.page} of ${totalPages}`;
    }

    function handleSort(column) {
        if (state.table.sortColumn === column) {
            state.table.sortDirection = state.table.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            state.table.sortColumn = column;
            state.table.sortDirection = 'asc';
        }
        renderDataTable();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EXPORT: PDF, EXCEL, CSV (Section 9)
    // ─────────────────────────────────────────────────────────────────────────
    async function handleExport(format) {
        if (!state.selectedDataset) {
            showToast('Please select a dataset before exporting', 'warning');
            return;
        }

        showToast(`Preparing ${format.toUpperCase()} export...`, 'info');

        try {
            // First attempt client-side generation for speed & fidelity
            if (format.toUpperCase() === 'PDF' && window.jspdf) {
                exportClientPDF();
                showToast('PDF downloaded successfully!', 'success');
                return;
            } else if (format.toUpperCase() === 'EXCEL' && window.XLSX) {
                exportClientExcel();
                showToast('Excel report downloaded successfully!', 'success');
                return;
            } else if (format.toUpperCase() === 'CSV') {
                exportClientCSV();
                showToast('CSV report downloaded successfully!', 'success');
                return;
            }

            // Fallback to server-side endpoint
            await window.API.exportReportFile(state.selectedDataset, format, {
                report_type: state.reportType,
                date_preset: state.datePreset,
                start_date: state.startDate,
                end_date: state.endDate
            });
            showToast(`${format.toUpperCase()} report downloaded successfully!`, 'success');

        } catch (err) {
            console.error('Export error:', err);
            showToast(`Export failed: ${window.API.getErrorMessage(err)}`, 'error');
        }
    }

    function exportClientCSV() {
        const rows = state.analyticsData ? state.analyticsData.table_data.rows : [];
        if (!rows || rows.length === 0) return;

        const headers = state.table.visibleColumns.length > 0 ? state.table.visibleColumns : Object.keys(rows[0]);
        const csvRows = [headers.join(',')];

        rows.forEach(r => {
            const values = headers.map(h => {
                const val = r[h] ?? '';
                const escaped = String(val).replace(/"/g, '""');
                return `"${escaped}"`;
            });
            csvRows.push(values.join(','));
        });

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        downloadBlob(blob, `BizVision_${state.reportType}_report_${state.selectedDataset}.csv`);
    }

    function exportClientExcel() {
        if (!window.XLSX || !state.analyticsData) return;
        const rows = state.analyticsData.table_data.rows || [];
        const wb = window.XLSX.utils.book_new();

        // 1. Summary Sheet
        const kpis = state.analyticsData.kpis || {};
        const summaryData = [
            ['BizVision Analytics Executive Report'],
            ['Dataset', state.selectedDataset],
            ['Report Type', state.reportType.toUpperCase()],
            ['Generated At', new Date().toLocaleString()],
            [],
            ['Key Metrics', 'Value', 'Growth %'],
            ['Total Sales', kpis.total_sales?.value || '$0', kpis.total_sales?.growth_pct || '0%'],
            ['Total Profit', kpis.total_profit?.value || '$0', kpis.total_profit?.growth_pct || '0%'],
            ['Profit Margin', kpis.profit_margin?.value || '0%', kpis.profit_margin?.growth_pct || '0%'],
            ['Total Orders', kpis.total_orders?.value || '0', kpis.total_orders?.growth_pct || '0%'],
            ['Average Order Value', kpis.average_order_value?.value || '$0', kpis.average_order_value?.growth_pct || '0%']
        ];
        const wsSummary = window.XLSX.utils.aoa_to_sheet(summaryData);
        window.XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

        // 2. Data Sheet
        const wsData = window.XLSX.utils.json_to_sheet(rows);
        window.XLSX.utils.book_append_sheet(wb, wsData, 'Data Records');

        window.XLSX.writeFile(wb, `BizVision_${state.reportType}_report_${state.selectedDataset}.xlsx`);
    }

    function exportClientPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

        // Apply Report Branding Watermark if configured
        const brandingStr = localStorage.getItem('bizvision_branding');
        if (brandingStr) {
            try {
                const b = JSON.parse(brandingStr);
                if (b && b.image) {
                    const alpha = (b.opacity || 10) / 100;
                    if (doc.saveGraphicsState && doc.setGState) {
                        doc.saveGraphicsState();
                        doc.setGState(new doc.GState({ opacity: alpha }));
                        if (b.position === 'top-right') {
                            doc.addImage(b.image, 'PNG', 430, 75, 120, 60, undefined, 'FAST');
                        } else {
                            doc.addImage(b.image, 'PNG', 120, 250, 350, 350, undefined, 'FAST');
                        }
                        doc.restoreGraphicsState();
                    }
                }
            } catch (e) {
                console.warn('PDF branding watermark error:', e);
            }
        }

        // Header Banner
        doc.setFillColor(79, 70, 229);
        doc.rect(0, 0, 595.28, 60, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.text('BizVision Analytics Report', 40, 38);

        // Metadata
        doc.setTextColor(51, 65, 85);
        doc.setFontSize(10);
        doc.text(`Dataset: ${state.selectedDataset}`, 40, 80);
        doc.text(`Report Type: ${state.reportType.toUpperCase()}`, 40, 95);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 380, 80);
        doc.text(`Date Range: ${state.datePreset.toUpperCase()}`, 380, 95);

        // Divider
        doc.setDrawColor(226, 232, 240);
        doc.line(40, 110, 555, 110);

        // KPIs Box
        const kpis = state.analyticsData ? state.analyticsData.kpis : {};
        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text('Executive KPI Summary', 40, 130);

        const kpiCols = [
            `Total Sales: ${kpis.total_sales?.value || '$0'}`,
            `Total Profit: ${kpis.total_profit?.value || '$0'}`,
            `Margin: ${kpis.profit_margin?.value || '0%'}`,
            `Orders: ${kpis.total_orders?.value || '0'}`
        ];
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        doc.text(kpiCols.join('   |   '), 40, 150);

        // Table
        if (doc.autoTable && state.analyticsData) {
            const rows = state.analyticsData.table_data.rows.slice(0, 45);
            const cols = state.table.visibleColumns.slice(0, 6);
            const tableRows = rows.map(r => cols.map(c => String(r[c] ?? '')));

            doc.autoTable({
                startY: 175,
                head: [cols],
                body: tableRows,
                styles: { fontSize: 8, cellPadding: 4 },
                headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255] }
            });
        }

        doc.save(`BizVision_${state.reportType}_report_${state.selectedDataset}.pdf`);
    }

    function applyReportBrandingWatermark() {
        const brandingStr = localStorage.getItem('bizvision_branding');
        if (!brandingStr) return;
        try {
            const b = JSON.parse(brandingStr);
            if (b && b.image) {
                let watermark = document.getElementById('report-branding-watermark');
                if (!watermark) {
                    watermark = document.createElement('div');
                    watermark.id = 'report-branding-watermark';
                    watermark.className = 'print-branding-watermark';
                    document.body.prepend(watermark);
                }
                watermark.style.backgroundImage = `url("${b.image}")`;
                watermark.style.opacity = (b.opacity || 10) / 100;
                if (b.position === 'top-right') {
                    watermark.style.backgroundPosition = 'top 30px right 30px';
                    watermark.style.backgroundSize = '140px auto';
                    watermark.style.backgroundRepeat = 'no-repeat';
                } else if (b.position === 'tiled') {
                    watermark.style.backgroundPosition = 'center';
                    watermark.style.backgroundSize = '200px auto';
                    watermark.style.backgroundRepeat = 'repeat';
                } else {
                    watermark.style.backgroundPosition = 'center center';
                    watermark.style.backgroundSize = b.size === 'fill' ? 'cover' : 'contain';
                    watermark.style.backgroundRepeat = 'no-repeat';
                }

                // Also apply subtle background to active report content
                const activeRepCard = document.querySelector('#report-active-content');
                if (activeRepCard) {
                    activeRepCard.style.backgroundImage = `url("${b.image}")`;
                    activeRepCard.style.backgroundRepeat = b.position === 'tiled' ? 'repeat' : 'no-repeat';
                    activeRepCard.style.backgroundPosition = b.position === 'top-right' ? 'top 20px right 20px' : 'center';
                    activeRepCard.style.backgroundSize = b.position === 'top-right' ? '140px auto' : (b.size === 'fill' ? 'cover' : 'contain');
                }
            }
        } catch (e) {
            console.warn('Branding load error:', e);
        }
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EMAIL MODAL & ANTI-SPAM TIMER (Section 2 & 11)
    // ─────────────────────────────────────────────────────────────────────────
    async function updateEmailModalSenderState() {
        const connectedView = $('#email-sender-connected-view');
        const unconnectedView = $('#email-sender-unconnected-view');
        const senderEmailEl = $('#email-sender-email');
        if (!connectedView || !unconnectedView) return;

        try {
            const status = await window.API.fetchGmailStatus();
            if (status.connected && status.google_email) {
                state.connectedGmail = status.google_email;
                if (senderEmailEl) senderEmailEl.textContent = status.google_email;
                connectedView.style.display = 'flex';
                unconnectedView.style.display = 'none';
            } else {
                state.connectedGmail = null;
                connectedView.style.display = 'none';
                unconnectedView.style.display = 'flex';
            }
        } catch (err) {
            state.connectedGmail = null;
            connectedView.style.display = 'none';
            unconnectedView.style.display = 'flex';
        }
    }

    function openEmailModal() {
        if (!state.selectedDataset) {
            showToast('Please select a dataset first', 'warning');
            return;
        }

        const modal = $('#email-modal');
        if (!modal) return;

        // Auto pre-fill default subject
        const subjInput = $('#email-subject');
        if (subjInput) {
            subjInput.value = `BizVision ${state.reportType.toUpperCase()} Report - ${state.selectedDataset}`;
        }

        // Reset check
        const selfCheck = $('#email-send-myself');
        if (selfCheck) selfCheck.checked = false;

        // Check & display personal Gmail status
        updateEmailModalSenderState();

        modal.style.display = 'flex';
    }

    function handleSendToMyselfToggle(checked) {
        const recipientInput = $('#email-recipient');
        if (!recipientInput) return;

        if (checked) {
            // Prioritize connected personal Gmail if available
            if (state.connectedGmail) {
                recipientInput.value = state.connectedGmail;
                return;
            }

            // Fallback to user account email from session
            const userStr = localStorage.getItem('user_info');
            let userEmail = 'user@bizvision.com';
            if (userStr) {
                try {
                    const u = JSON.parse(userStr);
                    if (u.email) userEmail = u.email;
                } catch (e) {}
            }
            recipientInput.value = userEmail;
        } else {
            recipientInput.value = '';
        }
    }

    async function submitEmailDispatch() {
        const recipientInput = $('#email-recipient');
        const formatSelect = $('#email-format-select');
        const subjectInput = $('#email-subject');
        const messageInput = $('#email-message');
        const sendBtn = $('#btn-submit-email');

        if (!recipientInput) return;
        const recipient = recipientInput.value.trim();

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(recipient)) {
            showToast('Please enter a valid recipient email address', 'error');
            recipientInput.focus();
            return;
        }

        if (state.spamSeconds > 0) {
            showToast(`Anti-spam: Please wait ${state.spamSeconds}s before sending another email`, 'warning');
            return;
        }

        // Loading state
        sendBtn.disabled = true;
        const origBtnText = sendBtn.innerHTML;
        sendBtn.innerHTML = '<span class="report-btn-spinner"></span> Sending Report...';

        try {
            const payload = {
                dataset_id: state.selectedDataset,
                recipient: recipient,
                report_type: state.reportType,
                date_range: state.datePreset,
                format: formatSelect ? formatSelect.value : 'PDF',
                subject: subjectInput ? subjectInput.value.trim() : '',
                message: messageInput ? messageInput.value.trim() : ''
            };

            const res = await window.API.dispatchReportEmail(payload);
            showToast(res.message || 'Report sent successfully', 'success');
            
            // Close modal
            $('#email-modal').style.display = 'none';

            // Start 30s Anti-Spam Countdown
            startAntiSpamCountdown(30);

        } catch (err) {
            console.error('Email send error:', err);
            showToast(window.API.getErrorMessage(err) || 'Failed to send, please try again', 'error');
        } finally {
            sendBtn.disabled = false;
            sendBtn.innerHTML = origBtnText;
        }
    }

    function startAntiSpamCountdown(seconds) {
        state.spamSeconds = seconds;
        updateAntiSpamButtons();

        if (state.spamTimerId) clearInterval(state.spamTimerId);

        state.spamTimerId = setInterval(() => {
            state.spamSeconds--;
            updateAntiSpamButtons();

            if (state.spamSeconds <= 0) {
                clearInterval(state.spamTimerId);
                state.spamTimerId = null;
                updateAntiSpamButtons();
            }
        }, 1000);
    }

    function updateAntiSpamButtons() {
        const topEmailBtn = $('#btn-open-email-modal');
        const modalSendBtn = $('#btn-submit-email');

        if (state.spamSeconds > 0) {
            if (topEmailBtn) {
                topEmailBtn.disabled = true;
                topEmailBtn.innerHTML = `✉️ Send Email (${state.spamSeconds}s)`;
                topEmailBtn.title = `Anti-spam: disabled for ${state.spamSeconds} seconds`;
            }
            if (modalSendBtn) {
                modalSendBtn.disabled = true;
                modalSendBtn.textContent = `Wait (${state.spamSeconds}s)`;
            }
        } else {
            if (topEmailBtn) {
                topEmailBtn.disabled = false;
                topEmailBtn.innerHTML = `✉️ Send Email`;
                topEmailBtn.title = 'Send report via email';
            }
            if (modalSendBtn) {
                modalSendBtn.disabled = false;
                modalSendBtn.textContent = 'Send Report Now';
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SCHEDULE MODAL & AUTOMATIONS (Section 11)
    // ─────────────────────────────────────────────────────────────────────────
    async function openScheduleModal() {
        if (!state.selectedDataset) {
            showToast('Please select a dataset first', 'warning');
            return;
        }

        const modal = $('#schedule-modal');
        if (!modal) return;
        modal.style.display = 'flex';

        await loadSchedulesList();
    }

    async function loadSchedulesList() {
        const tbody = $('#schedule-list-tbody');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Loading active schedules...</td></tr>';

        try {
            const res = await window.API.fetchReportSchedules();
            const list = res.schedules || [];

            if (list.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--color-neutral-600);">No automated schedules created yet. Add one below!</td></tr>';
                return;
            }

            tbody.innerHTML = list.map(item => {
                const isActive = item.status === 'Active';
                return `
                    <tr>
                        <td><strong>${escapeHtml(item.report_name)}</strong></td>
                        <td>${escapeHtml(item.recipient_email)}</td>
                        <td>${escapeHtml(item.frequency)} (${escapeHtml(item.start_day)})</td>
                        <td><span class="report-format-pill">${escapeHtml(item.format)}</span></td>
                        <td><span class="schedule-status-badge ${isActive ? 'status-active' : 'status-paused'}">${escapeHtml(item.status)}</span></td>
                        <td>
                            <div style="display: flex; gap: 6px;">
                                <button class="btn-table-action" onclick="window.ReportsCtrl.toggleScheduleStatus(${item.id}, '${isActive ? 'Paused' : 'Active'}')">
                                    ${isActive ? '⏸️ Pause' : '▶️ Resume'}
                                </button>
                                <button class="btn-table-action danger" onclick="window.ReportsCtrl.deleteSchedule(${item.id})">
                                    🗑️
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');

        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" style="color: var(--color-red);">Error: ${escapeHtml(window.API.getErrorMessage(err))}</td></tr>`;
        }
    }

    async function submitCreateSchedule(evt) {
        evt.preventDefault();
        const nameInput = $('#sched-name');
        const emailInput = $('#sched-email');
        const freqSelect = $('#sched-frequency');
        const dayInput = $('#sched-day');
        const formatSelect = $('#sched-format');

        if (!emailInput.value.trim() || !nameInput.value.trim()) {
            showToast('Please fill out all required schedule fields', 'warning');
            return;
        }

        try {
            const payload = {
                dataset_id: state.selectedDataset,
                report_name: nameInput.value.trim(),
                recipient_email: emailInput.value.trim(),
                frequency: freqSelect.value,
                start_day: dayInput.value.trim() || 'Monday',
                format: formatSelect.value,
                report_type: state.reportType
            };

            const res = await window.API.createReportSchedule(payload);
            showToast(res.message || 'Schedule created successfully!', 'success');
            
            nameInput.value = '';
            emailInput.value = '';
            await loadSchedulesList();

        } catch (err) {
            showToast(window.API.getErrorMessage(err), 'error');
        }
    }

    async function toggleScheduleStatus(id, newStatus) {
        try {
            await window.API.updateReportSchedule(id, newStatus);
            showToast(`Schedule status updated to ${newStatus}`, 'success');
            await loadSchedulesList();
        } catch (err) {
            showToast(window.API.getErrorMessage(err), 'error');
        }
    }

    async function deleteSchedule(id) {
        if (!confirm('Are you sure you want to delete this automated schedule?')) return;
        try {
            await window.API.deleteReportSchedule(id);
            showToast('Schedule deleted', 'info');
            await loadSchedulesList();
        } catch (err) {
            showToast(window.API.getErrorMessage(err), 'error');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EMAIL HISTORY & RESEND (Section 11)
    // ─────────────────────────────────────────────────────────────────────────
    async function openEmailHistoryModal() {
        const modal = $('#history-modal');
        if (!modal) return;
        modal.style.display = 'flex';
        await loadEmailHistoryList();
    }

    async function loadEmailHistoryList() {
        const tbody = $('#history-list-tbody');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Loading dispatch history...</td></tr>';

        try {
            const res = await window.API.fetchReportEmailHistory();
            const history = res.history || [];

            if (history.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--color-neutral-600);">No email reports logged yet.</td></tr>';
                return;
            }

            tbody.innerHTML = history.map(item => {
                const isSent = item.status === 'Sent';
                return `
                    <tr>
                        <td>${escapeHtml(item.sent_at)}</td>
                        <td><strong>${escapeHtml(item.report_name)}</strong></td>
                        <td>${escapeHtml(item.recipient_email)}</td>
                        <td><span class="report-format-pill">${escapeHtml(item.format)}</span></td>
                        <td>
                            <span class="schedule-status-badge ${isSent ? 'status-active' : 'status-failed'}">
                                ${escapeHtml(item.status)}
                            </span>
                        </td>
                        <td>
                            <button class="btn-table-action" onclick="window.ReportsCtrl.resendEmail(${item.id})">
                                🔄 Resend
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');

        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" style="color: var(--color-red);">Error: ${escapeHtml(window.API.getErrorMessage(err))}</td></tr>`;
        }
    }

    async function resendHistoryEmail(historyId) {
        showToast('Resending report email...', 'info');
        try {
            const res = await window.API.resendReportEmail(historyId);
            showToast(res.message || 'Report re-sent successfully', 'success');
            await loadEmailHistoryList();
        } catch (err) {
            showToast(`Resend failed: ${window.API.getErrorMessage(err)}`, 'error');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SAVE & SHARE CUSTOM REPORTS (Section 10)
    // ─────────────────────────────────────────────────────────────────────────
    function openSaveReportModal() {
        if (!state.selectedDataset) {
            showToast('Please select a dataset first', 'warning');
            return;
        }

        const modal = $('#save-report-modal');
        const nameInput = $('#save-report-name-input');
        if (!modal) return;

        if (nameInput) {
            nameInput.value = `${state.selectedDataset} ${state.reportType.toUpperCase()} (${new Date().toLocaleDateString()})`;
        }
        $('#save-report-link-box').style.display = 'none';
        modal.style.display = 'flex';
    }

    async function submitSaveCustomReport() {
        const nameInput = $('#save-report-name-input');
        if (!nameInput || !nameInput.value.trim()) {
            showToast('Please enter a name for your custom report', 'warning');
            return;
        }

        try {
            const payload = {
                report_name: nameInput.value.trim(),
                dataset_id: state.selectedDataset,
                report_type: state.reportType,
                date_range: state.datePreset,
                start_date: state.startDate,
                end_date: state.endDate,
                comparison: state.compare
            };

            const res = await window.API.saveCustomReport(payload);
            showToast('Custom report configuration saved!', 'success');

            // Show share link
            const linkBox = $('#save-report-link-box');
            const linkInput = $('#save-report-share-url');
            if (linkBox && linkInput) {
                const fullUrl = `${window.location.origin}/reports.html?share=${res.share_token}`;
                linkInput.value = fullUrl;
                linkBox.style.display = 'block';
            }

        } catch (err) {
            showToast(window.API.getErrorMessage(err), 'error');
        }
    }

    function copyShareLink() {
        const input = $('#save-report-share-url');
        if (!input) return;
        input.select();
        navigator.clipboard.writeText(input.value);
        showToast('Shareable link copied to clipboard!', 'success');
    }

    async function openSavedReportsModal() {
        const modal = $('#saved-reports-modal');
        if (!modal) return;
        modal.style.display = 'flex';
        await loadSavedReportsList();
    }

    async function loadSavedReportsList() {
        const tbody = $('#saved-reports-tbody');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Loading saved reports...</td></tr>';

        try {
            const res = await window.API.fetchSavedReports();
            const list = res.saved_reports || [];

            if (list.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--color-neutral-600);">No custom saved reports yet.</td></tr>';
                return;
            }

            tbody.innerHTML = list.map(item => {
                return `
                    <tr>
                        <td><strong>${escapeHtml(item.report_name)}</strong></td>
                        <td>${escapeHtml(item.dataset_id)}</td>
                        <td><span class="report-format-pill">${escapeHtml(item.report_type)}</span></td>
                        <td>${escapeHtml(item.date_range)} (${escapeHtml(item.comparison || 'MoM')})</td>
                        <td>${escapeHtml(item.created_at)}</td>
                        <td>
                            <div style="display: flex; gap: 6px;">
                                <button class="btn-table-action" onclick="window.ReportsCtrl.applySavedReport('${item.share_token}')">
                                    📂 Open
                                </button>
                                <button class="btn-table-action danger" onclick="window.ReportsCtrl.deleteSavedReport(${item.id})">
                                    🗑️
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');

        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" style="color: var(--color-red);">Error: ${escapeHtml(window.API.getErrorMessage(err))}</td></tr>`;
        }
    }

    async function loadSharedReport(token) {
        try {
            const res = await window.API.loadSavedReport(token);
            if (res && res.report) {
                const rep = res.report;
                state.reportType = rep.report_type;
                state.datePreset = rep.date_range;
                state.startDate = rep.start_date || '';
                state.endDate = rep.end_date || '';
                state.compare = rep.comparison || 'mom';

                // Sync filter UI inputs
                updateFilterUI();

                selectDataset(rep.dataset_id);
                showToast(`Loaded saved report: "${rep.report_name}"`, 'success');
            }
        } catch (err) {
            showToast(`Could not load shared report: ${window.API.getErrorMessage(err)}`, 'error');
        }
    }

    async function deleteSavedReport(id) {
        if (!confirm('Are you sure you want to delete this saved report?')) return;
        try {
            await window.API.deleteSavedReport(id);
            showToast('Saved report removed', 'info');
            await loadSavedReportsList();
        } catch (err) {
            showToast(window.API.getErrorMessage(err), 'error');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EVENT LISTENERS & FILTER WIRING
    // ─────────────────────────────────────────────────────────────────────────
    function initEventListeners() {
        // 1. Dataset selector change
        const dsSelect = $('#report-dataset-select');
        if (dsSelect) {
            dsSelect.addEventListener('change', (e) => {
                selectDataset(e.target.value);
                window.dispatchEvent(new CustomEvent('datasetChanged', { detail: { table: e.target.value } }));
            });
        }

        window.addEventListener('datasetChanged', (e) => {
            const table = e.detail && e.detail.table ? e.detail.table : null;
            if (table && table !== state.selectedDataset) {
                if (dsSelect) dsSelect.value = table;
                selectDataset(table);
            }
        });

        // Direct Cleaned Dataset Upload & Demo Loaders
        const uploadInput = $('#report-upload-input');
        if (uploadInput) {
            uploadInput.addEventListener('change', async () => {
                if (uploadInput.files && uploadInput.files[0]) {
                    const file = uploadInput.files[0];
                    showToast(`Uploading & cleaning "${file.name}" for report...`, 'info');
                    try {
                        const res = await window.API.uploadDataset(file);
                        showToast(`✓ Dataset "${file.name}" cleaned & ready! Generating report...`, 'success');
                        await loadDatasetsList();
                        if (res && res.table_name) {
                            selectDataset(res.table_name);
                        }
                    } catch (err) {
                        showToast(`Upload failed: ${err.message || 'Please check file format.'}`, 'error');
                    }
                }
            });
        }

        const demoBtn = $('#btn-load-demo-report');
        if (demoBtn) {
            demoBtn.style.display = 'none';
        }

        // 2. Report Type Selector
        const repTypeSelect = $('#report-type-select');
        if (repTypeSelect) {
            repTypeSelect.addEventListener('change', (e) => {
                state.reportType = e.target.value;
                loadReportData();
            });
        }

        // 3. Date Range Selector
        const dateRangeSelect = $('#report-daterange-select');
        const customDateBox = $('#custom-date-range-box');
        if (dateRangeSelect) {
            dateRangeSelect.addEventListener('change', (e) => {
                state.datePreset = e.target.value;
                if (customDateBox) {
                    customDateBox.style.display = state.datePreset === 'custom' ? 'flex' : 'none';
                }
                if (state.datePreset !== 'custom') {
                    loadReportData();
                }
            });
        }

        // Custom Date Pickers
        const startDateInput = $('#report-custom-start');
        const endDateInput = $('#report-custom-end');
        const applyCustomDateBtn = $('#btn-apply-custom-dates');
        if (applyCustomDateBtn) {
            applyCustomDateBtn.addEventListener('click', () => {
                state.startDate = startDateInput.value;
                state.endDate = endDateInput.value;
                if (!state.startDate || !state.endDate) {
                    showToast('Please specify both start and end dates', 'warning');
                    return;
                }
                loadReportData();
            });
        }

        // 4. Comparison selector (MoM / YoY / none)
        const compareSelect = $('#report-compare-select');
        if (compareSelect) {
            compareSelect.addEventListener('change', (e) => {
                state.compare = e.target.value;
                loadReportData();
            });
        }

        // 5. Reset Filters Button
        const resetFiltersBtn = $('#btn-reset-filters');
        if (resetFiltersBtn) {
            resetFiltersBtn.addEventListener('click', () => {
                state.reportType = 'sales';
                state.datePreset = 'all';
                state.startDate = '';
                state.endDate = '';
                state.compare = 'mom';
                updateFilterUI();
                loadReportData();
                showToast('Filters reset to default', 'info');
            });
        }

        // 6. Action Bar: Download Dropdown Toggle
        const downloadDropdownBtn = $('#btn-download-dropdown');
        const downloadMenu = $('#download-menu-dropdown');
        if (downloadDropdownBtn && downloadMenu) {
            downloadDropdownBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                downloadMenu.style.display = downloadMenu.style.display === 'block' ? 'none' : 'block';
            });
            document.addEventListener('click', () => {
                downloadMenu.style.display = 'none';
            });
        }

        // 7. Action Bar: Email Modal
        const openEmailBtn = $('#btn-open-email-modal');
        if (openEmailBtn) openEmailBtn.addEventListener('click', openEmailModal);

        const sendMyselfCheck = $('#email-send-myself');
        if (sendMyselfCheck) {
            sendMyselfCheck.addEventListener('change', (e) => {
                handleSendToMyselfToggle(e.target.checked);
            });
        }

        const submitEmailBtn = $('#btn-submit-email');
        if (submitEmailBtn) submitEmailBtn.addEventListener('click', submitEmailDispatch);

        // 8. Action Bar: Schedule Modal
        const openScheduleBtn = $('#btn-open-schedule-modal');
        if (openScheduleBtn) openScheduleBtn.addEventListener('click', openScheduleModal);

        const scheduleForm = $('#create-schedule-form');
        if (scheduleForm) scheduleForm.addEventListener('submit', submitCreateSchedule);

        // 9. Action Bar: Email History Modal
        const openHistoryBtn = $('#btn-open-history-modal');
        if (openHistoryBtn) openHistoryBtn.addEventListener('click', openEmailHistoryModal);

        // 10. Action Bar: Save Custom Report
        const openSaveBtn = $('#btn-open-save-modal');
        if (openSaveBtn) openSaveBtn.addEventListener('click', openSaveReportModal);

        const submitSaveBtn = $('#btn-submit-save-report');
        if (submitSaveBtn) submitSaveBtn.addEventListener('click', submitSaveCustomReport);

        const copyLinkBtn = $('#btn-copy-share-link');
        if (copyLinkBtn) copyLinkBtn.addEventListener('click', copyShareLink);

        const openSavedReportsBtn = $('#btn-open-saved-reports-modal');
        if (openSavedReportsBtn) openSavedReportsBtn.addEventListener('click', openSavedReportsModal);

        // 11. Modal Close Buttons
        $$('.report-modal-close, .btn-modal-cancel').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.report-modal').forEach(m => m.style.display = 'none');
            });
        });

        // 12. Table Search Input
        const tableSearchInput = $('#table-search-input');
        if (tableSearchInput) {
            tableSearchInput.addEventListener('input', (e) => {
                state.table.search = e.target.value;
                state.table.page = 1;
                renderDataTable();
            });
        }

        // 13. Page Size Selector
        const pageSizeSelect = $('#table-page-size-select');
        if (pageSizeSelect) {
            pageSizeSelect.addEventListener('change', (e) => {
                state.table.pageSize = parseInt(e.target.value, 10) || 10;
                state.table.page = 1;
                renderDataTable();
            });
        }

        // 14. Table Pagination Buttons
        const prevPageBtn = $('#btn-table-prev');
        const nextPageBtn = $('#btn-table-next');
        if (prevPageBtn) {
            prevPageBtn.addEventListener('click', () => {
                if (state.table.page > 1) {
                    state.table.page--;
                    renderDataTable();
                }
            });
        }
        if (nextPageBtn) {
            nextPageBtn.addEventListener('click', () => {
                state.table.page++;
                renderDataTable();
            });
        }

        // 15. Column Toggle Dropdown
        const colToggleBtn = $('#btn-col-toggle-dropdown');
        const colToggleMenu = $('#col-toggle-menu');
        if (colToggleBtn && colToggleMenu) {
            colToggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                colToggleMenu.style.display = colToggleMenu.style.display === 'block' ? 'none' : 'block';
            });
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#col-toggle-menu')) {
                    colToggleMenu.style.display = 'none';
                }
            });
        }
    }

    function updateFilterUI() {
        const repTypeSelect = $('#report-type-select');
        const dateRangeSelect = $('#report-daterange-select');
        const compareSelect = $('#report-compare-select');
        const customBox = $('#custom-date-range-box');

        if (repTypeSelect) repTypeSelect.value = state.reportType;
        if (dateRangeSelect) dateRangeSelect.value = state.datePreset;
        if (compareSelect) compareSelect.value = state.compare;
        if (customBox) {
            customBox.style.display = state.datePreset === 'custom' ? 'flex' : 'none';
        }
    }

    function checkTheme() {
        const currentTheme = localStorage.getItem('theme') || 'dark';
        if (currentTheme === 'dark') {
            document.body.classList.add('dark-mode');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EXPOSE CONTROLLER FUNCTIONS TO GLOBAL SCOPE
    // ─────────────────────────────────────────────────────────────────────────
    window.ReportsCtrl = {
        selectDataset,
        handleExport,
        sortTable: handleSort,
        toggleCol: toggleColumnVisibility,
        openDrill: openDrilldown,
        drillDeep: pushDrilldownStep,
        navDrill: navigateDrilldownBreadcrumb,
        closeDrill: resetDrilldown,
        openEmailModal,
        openScheduleModal,
        openSaveModal: openSaveReportModal,
        openSavedReportsModal,
        openHistoryModal: openEmailHistoryModal,
        copyShareLink,
        submitEmailDispatch,
        submitSaveCustomReport,
        closeAllModals: () => {
            document.querySelectorAll('.report-modal').forEach(m => m.style.display = 'none');
        },
        resendEmail: resendHistoryEmail,
        toggleScheduleStatus,
        deleteSchedule,
        applySavedReport: (token) => {
            const m = document.querySelector('#saved-reports-modal');
            if (m) m.style.display = 'none';
            loadSharedReport(token);
        },
        deleteSavedReport
    };

    console.log('✅ Reports controller loaded successfully with all 12 modules.');
})();
