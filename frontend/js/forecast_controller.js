/**
 * BizVision — Predictive Forecasting & Machine Learning Analytics Controller
 * 7-Layer Architecture: Control Bar, Top KPI Cards, Model Performance Benchmarks,
 * Interactive Chart with 95% Confidence Band, Slicers, Seasonality & Driver Analysis,
 * Paginated Table, and CSV/XLSX Export, Print & Email Workflows.
 * Strictly dynamic, user-isolated, authenticated backend-driven state.
 */

(function () {
    'use strict';

    // ──────────────────────────────────────────────────────────────────────────
    // 1. STATE
    // ──────────────────────────────────────────────────────────────────────────
    const state = {
        activeDataset: sessionStorage.getItem('currentTableName') || localStorage.getItem('active_dataset_id') || '',
        targetMetric: '',
        dateColumn: '',
        horizonDays: 30,
        granularity: 'daily',
        selectedModel: 'auto',
        activeModelName: 'Auto Best Model',
        availableDatasets: [],
        historicalData: [],
        forecastData: [],
        fullCombinedData: [],
        filteredTableData: [],
        drivers: [],
        seasonality: {},
        metrics: {
            mae: 0,
            rmse: 0,
            r2: 0,
            accuracy: 0,
            projectedTotal: 0,
            expectedGrowth: 0,
            peakVal: 0,
            peakDate: ''
        },
        chartInstance: null,
        timelineSliceRange: 90,
        pageSize: parseInt(localStorage.getItem('bizvision_rows_per_page'), 10) || 10,
        currentPage: 1,
        tableSearchQuery: '',
        sortField: 'date',
        sortAscending: false
    };

    // ──────────────────────────────────────────────────────────────────────────
    // 2. INITIALIZATION
    // ──────────────────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', async () => {
        initControls();
        initSlicers();
        initTableControls();
        initExportAndDelivery();

        // Listen for global dataset change from navbar
        window.addEventListener('datasetChanged', async (e) => {
            const newTable = e.detail && e.detail.table ? e.detail.table : null;
            if (newTable && newTable !== state.activeDataset) {
                state.activeDataset = newTable;
                const datasetSelect = document.getElementById('fc-dataset-select');
                if (datasetSelect) datasetSelect.value = newTable;
                updateMetricAndDateDropdowns();
                updateAttributesStrip();
                await executeForecast();
            }
        });

        await loadAvailableDatasets();
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 3. CONTROLS SETUP & EVENT HANDLERS
    // ──────────────────────────────────────────────────────────────────────────
    function initControls() {
        const datasetSelect = document.getElementById('fc-dataset-select');
        const metricSelect = document.getElementById('fc-target-metric');
        const dateSelect = document.getElementById('fc-date-col');
        const horizonSelect = document.getElementById('fc-horizon-select');
        const modelSelect = document.getElementById('fc-model-select');
        const runBtn = document.getElementById('run-forecast-btn');

        if (datasetSelect) {
            datasetSelect.addEventListener('change', async (e) => {
                state.activeDataset = e.target.value;
                sessionStorage.setItem('currentTableName', state.activeDataset);
                localStorage.setItem('active_dataset_id', state.activeDataset);
                window.currentTableName = state.activeDataset;
                window.dispatchEvent(new CustomEvent('datasetChanged', { detail: { table: state.activeDataset } }));
                updateMetricAndDateDropdowns();
                updateAttributesStrip();
                await executeForecast();
            });
        }

        if (metricSelect) {
            metricSelect.addEventListener('change', (e) => {
                state.targetMetric = e.target.value;
                updateAttributesStrip();
            });
        }

        if (dateSelect) {
            dateSelect.addEventListener('change', (e) => {
                state.dateColumn = e.target.value;
                updateAttributesStrip();
            });
        }

        if (horizonSelect) {
            horizonSelect.addEventListener('change', (e) => {
                state.horizonDays = parseInt(e.target.value, 10) || 30;
                updateAttributesStrip();
            });
        }

        if (modelSelect) {
            modelSelect.addEventListener('change', (e) => {
                state.selectedModel = e.target.value;
                updateAttributesStrip();
            });
        }

        const granularityGroup = document.getElementById('fc-granularity-group');
        if (granularityGroup) {
            granularityGroup.querySelectorAll('.fc-granularity-pill').forEach(btn => {
                btn.addEventListener('click', () => {
                    granularityGroup.querySelectorAll('.fc-granularity-pill').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    state.granularity = btn.getAttribute('data-granularity');
                    showToast(`Granularity switched to ${state.granularity.toUpperCase()}`, 'info', 1800);
                    updateAttributesStrip();
                    executeForecast();
                });
            });
        }

        if (runBtn) {
            runBtn.addEventListener('click', async () => {
                runBtn.disabled = true;
                runBtn.innerHTML = `<span>⏳</span> Training Model & Forecasting...`;
                updateAttributesStrip();
                await executeForecast();
                runBtn.disabled = false;
                runBtn.innerHTML = `<span>🔮</span> Generate Forecast`;
            });
        }
    }

    async function loadAvailableDatasets() {
        const datasetSelect = document.getElementById('fc-dataset-select');
        const emptyState = document.getElementById('forecast-empty-state');
        const forecastContent = document.getElementById('forecast-content');

        let datasets = [];
        try {
            if (window.API && typeof window.API.fetchUserDatasets === 'function') {
                datasets = await window.API.fetchUserDatasets();
            }
        } catch (e) {
            console.warn('Could not load user datasets:', e);
        }

        if (!Array.isArray(datasets) || datasets.length === 0) {
            // ZERO DATASETS: Show clean empty state, hide forecast content
            if (emptyState) emptyState.style.display = 'block';
            if (forecastContent) forecastContent.style.display = 'none';
            state.availableDatasets = [];
            state.activeDataset = '';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        if (forecastContent) forecastContent.style.display = 'block';

        state.availableDatasets = datasets;

        const currentTbl = sessionStorage.getItem('currentTableName') || localStorage.getItem('active_dataset_id');
        if (currentTbl && datasets.some(d => d.dataset_id === currentTbl)) {
            state.activeDataset = currentTbl;
        } else {
            state.activeDataset = datasets[0].dataset_id;
            sessionStorage.setItem('currentTableName', state.activeDataset);
            localStorage.setItem('active_dataset_id', state.activeDataset);
            window.currentTableName = state.activeDataset;
        }

        if (datasetSelect) {
            datasetSelect.innerHTML = datasets.map(d => `
                <option value="${escapeHtml(d.dataset_id)}" ${d.dataset_id === state.activeDataset ? 'selected' : ''}>
                    📄 ${escapeHtml(d.filename || d.dataset_id)}
                </option>
            `).join('');
        }

        updateMetricAndDateDropdowns();
        updateAttributesStrip();
        await executeForecast();
    }

    function updateMetricAndDateDropdowns() {
        const metricSelect = document.getElementById('fc-target-metric');
        const dateSelect = document.getElementById('fc-date-col');
        if (!metricSelect || !dateSelect) return;

        const activeMeta = state.availableDatasets.find(d => d.dataset_id === state.activeDataset);
        const cols = (activeMeta && Array.isArray(activeMeta.columns) ? activeMeta.columns : []).filter(c => !c.endsWith('_is_outlier'));

        if (cols.length === 0) {
            metricSelect.innerHTML = '<option value="">No columns found</option>';
            dateSelect.innerHTML = '<option value="">No date columns</option>';
            return;
        }

        // Infer date columns
        const dateCols = cols.filter(c => /date|time|year|month|day|period|created|order|closing|signup|admitted|timestamp/i.test(c));
        const finalDateCols = dateCols.length > 0 ? dateCols : cols;

        // Infer numerical metric columns
        const numCols = cols.filter(c => /sales|profit|revenue|spend|budget|amount|cost|charges|price|score|age|gpa|hours|units|qty|quantity|balance|count/i.test(c) || !/id$|uuid$|name$|title$|status$/i.test(c));
        const finalNumCols = numCols.length > 0 ? numCols : cols;

        metricSelect.innerHTML = finalNumCols.map(m => `
            <option value="${escapeHtml(m)}" ${m === state.targetMetric ? 'selected' : ''}>
                ${escapeHtml(m.replace(/_/g, ' ').toUpperCase())} (${getMetricUnit(m)})
            </option>
        `).join('');
        state.targetMetric = metricSelect.value || finalNumCols[0];

        dateSelect.innerHTML = finalDateCols.map(d => `
            <option value="${escapeHtml(d)}" ${d === state.dateColumn ? 'selected' : ''}>
                ${escapeHtml(d)} (Date)
            </option>
        `).join('');
        state.dateColumn = dateSelect.value || finalDateCols[0];
    }

    function updateAttributesStrip() {
        const activeMeta = state.availableDatasets.find(d => d.dataset_id === state.activeDataset);
        const displayName = activeMeta ? (activeMeta.filename || activeMeta.dataset_id) : state.activeDataset;

        const elDataset = document.getElementById('attr-dataset-name');
        const elDate = document.getElementById('attr-date-col');
        const elHorizon = document.getElementById('attr-horizon');
        const elGranularity = document.getElementById('attr-granularity');
        const elAlgorithm = document.getElementById('attr-algorithm');

        if (elDataset) elDataset.textContent = displayName || '—';
        if (elDate) elDate.textContent = state.dateColumn || '—';
        if (elHorizon) elHorizon.textContent = `${state.horizonDays} Days`;
        if (elGranularity) elGranularity.textContent = state.granularity ? state.granularity.charAt(0).toUpperCase() + state.granularity.slice(1) : 'Daily';
        if (elAlgorithm) elAlgorithm.textContent = getModelLabel(state.selectedModel);
    }

    function getMetricUnit(colName) {
        if (!colName) return 'Units';
        if (/price|sales|revenue|profit|budget|spend|cost|charges|amount|fee/i.test(colName)) return '$';
        if (/pct|rate|score|ratio|percent/i.test(colName)) return '%';
        return 'Units';
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. FORECAST EXECUTION ENGINE
    // ──────────────────────────────────────────────────────────────────────────
    async function executeForecast() {
        if (!state.activeDataset) return;

        showToast('Initiating predictive model inference...', 'info', 1800);

        try {
            if (window.API && typeof window.API.trainForecast === 'function') {
                const trainRes = await window.API.trainForecast(state.activeDataset, state.selectedModel, state.targetMetric, state.dateColumn);
                if (trainRes && trainRes.metrics) {
                    state.activeModelName = trainRes.chosen_model || getModelLabel(state.selectedModel);
                    state.metrics.mae = round2(trainRes.metrics.mae || 0);
                    state.metrics.rmse = round2(trainRes.metrics.rmse || 0);
                    state.metrics.r2 = round3(trainRes.metrics.r2_score || 0);
                    state.metrics.accuracy = round1(trainRes.metrics.accuracy_pct || (state.metrics.r2 * 100));
                    state.drivers = trainRes.drivers || [];
                }
            }

            if (window.API && typeof window.API.fetchForecast === 'function') {
                const fcRes = await window.API.fetchForecast(state.activeDataset, state.horizonDays, state.targetMetric, state.dateColumn);
                if (fcRes && fcRes.forecast) {
                    state.historicalData = fcRes.historical || [];
                    state.forecastData = fcRes.forecast || [];
                    state.seasonality = fcRes.dow_seasonality || {};
                }
            }
        } catch (e) {
            console.error('Forecast request failed:', e);
            showToast(`⚠️ Forecasting: ${e.message || 'Error occurred while training or forecasting.'}`, 'error', 4000);
            return;
        }

        // Build combined data array
        buildCombinedDataset();

        // Render all UI components
        renderKPICards();
        renderPerformanceBadges();
        renderForecastChart();
        renderDecompositionAndDrivers();
        renderForecastTable();

        showToast(`✓ Forecast generated for ${state.horizonDays} days using ${state.activeModelName}`, 'success', 3200);
    }

    function buildCombinedDataset() {
        const combined = [];
        state.historicalData.forEach(h => {
            combined.push({
                date: h.date,
                type: 'Historical',
                actual: h.actual_value,
                predicted: null,
                lower: null,
                upper: null,
                spread: null
            });
        });

        state.forecastData.forEach(f => {
            combined.push({
                date: f.date,
                type: 'Projected',
                actual: null,
                predicted: f.predicted_value,
                lower: f.lower_bound,
                upper: f.upper_bound,
                spread: round2((f.upper_bound || 0) - (f.lower_bound || 0))
            });
        });

        state.fullCombinedData = combined;
        filterAndSortTable();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 5. RENDER KPI SUMMARY CARDS
    // ──────────────────────────────────────────────────────────────────────────
    function renderKPICards() {
        const unit = getMetricUnit(state.targetMetric);
        const prefix = unit === '$' ? '$' : '';
        const suffix = unit === '%' ? '%' : '';

        // 1. Projected Total
        const totalProjected = state.forecastData.reduce((sum, item) => sum + (item.predicted_value || 0), 0);
        state.metrics.projectedTotal = totalProjected;
        const projEl = document.getElementById('kpi-projected-total');
        if (projEl) {
            projEl.textContent = `${prefix}${formatNumberLocale(round2(totalProjected))}${suffix}`;
        }

        // 2. Expected Growth %
        const histRecent = state.historicalData.slice(-state.horizonDays);
        const histTotal = histRecent.reduce((sum, item) => sum + (item.actual_value || 0), 0) || 1;
        const growthPct = round1(((totalProjected - histTotal) / histTotal) * 100);
        state.metrics.expectedGrowth = growthPct;

        const growthValEl = document.getElementById('kpi-expected-growth');
        const growthBadgeEl = document.getElementById('kpi-growth-badge');
        if (growthValEl && growthBadgeEl) {
            const sign = growthPct >= 0 ? '+' : '';
            growthValEl.textContent = `${sign}${growthPct}%`;
            growthBadgeEl.className = growthPct >= 0 ? 'badge-trend-up' : 'badge-trend-down';
            growthBadgeEl.textContent = `${growthPct >= 0 ? '▲' : '▼'} ${sign}${growthPct}% vs Past Period`;
        }

        // 3. Peak Prediction
        let peak = { value: -Infinity, date: '' };
        state.forecastData.forEach(f => {
            if ((f.predicted_value || 0) > peak.value) {
                peak.value = f.predicted_value;
                peak.date = f.date;
            }
        });
        state.metrics.peakVal = peak.value === -Infinity ? 0 : peak.value;
        state.metrics.peakDate = peak.date;

        const peakValEl = document.getElementById('kpi-peak-val');
        const peakDateEl = document.getElementById('kpi-peak-date');
        if (peakValEl) peakValEl.textContent = `${prefix}${formatNumberLocale(round2(state.metrics.peakVal))}${suffix}`;
        if (peakDateEl) peakDateEl.textContent = peak.date || '—';

        // 4. Active Model & Confidence
        const modelEl = document.getElementById('kpi-active-model');
        const confBadge = document.getElementById('kpi-confidence-badge');
        if (modelEl) modelEl.textContent = state.activeModelName;
        if (confBadge) confBadge.textContent = `✓ 95% Confidence Interval (${state.metrics.accuracy}% Acc)`;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 6. RENDER MODEL PERFORMANCE BADGES
    // ──────────────────────────────────────────────────────────────────────────
    function renderPerformanceBadges() {
        const nameEl = document.getElementById('badge-model-name');
        const maeEl = document.getElementById('badge-mae');
        const rmseEl = document.getElementById('badge-rmse');
        const r2El = document.getElementById('badge-r2');
        const summaryEl = document.getElementById('perf-model-summary');

        if (nameEl) nameEl.textContent = state.activeModelName;
        if (maeEl) maeEl.textContent = state.metrics.mae.toLocaleString();
        if (rmseEl) rmseEl.textContent = state.metrics.rmse.toLocaleString();
        if (r2El) r2El.textContent = `${state.metrics.r2} (${state.metrics.accuracy}% Benchmark)`;
        if (summaryEl) {
            summaryEl.textContent = `Validated against ${state.historicalData.length} records with automated 95% confidence variance`;
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 7. CHART RENDERING WITH 95% CONFIDENCE BAND & TOOLTIPS
    // ──────────────────────────────────────────────────────────────────────────
    function renderForecastChart() {
        const canvas = document.getElementById('main-forecast-chart');
        if (!canvas) return;

        const totalPoints = state.historicalData.length + state.forecastData.length;
        const visibleCount = state.timelineSliceRange === 'all' ? totalPoints : Math.min(totalPoints, parseInt(state.timelineSliceRange, 10));
        
        const slicedHistorical = state.historicalData.slice(-Math.min(visibleCount, state.historicalData.length));
        const slicedForecast = state.forecastData.slice(0, Math.max(0, visibleCount - slicedHistorical.length + 30));

        const labels = [
            ...slicedHistorical.map(h => h.date),
            ...slicedForecast.map(f => f.date)
        ];

        const histSeries = [
            ...slicedHistorical.map(h => h.actual_value),
            ...slicedForecast.map(() => null)
        ];

        const bridgeVal = slicedHistorical.length > 0 ? slicedHistorical[slicedHistorical.length - 1].actual_value : null;
        const forecastSeries = [
            ...slicedHistorical.slice(0, -1).map(() => null),
            bridgeVal,
            ...slicedForecast.map(f => f.predicted_value)
        ];

        const upperSeries = [
            ...slicedHistorical.slice(0, -1).map(() => null),
            bridgeVal,
            ...slicedForecast.map(f => f.upper_bound)
        ];

        const lowerSeries = [
            ...slicedHistorical.slice(0, -1).map(() => null),
            bridgeVal,
            ...slicedForecast.map(f => f.lower_bound)
        ];

        if (state.chartInstance) {
            state.chartInstance.destroy();
        }

        const ctx = canvas.getContext('2d');
        const unit = getMetricUnit(state.targetMetric);
        const prefix = unit === '$' ? '$' : '';

        state.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Upper 95% Bound',
                        data: upperSeries,
                        borderColor: 'rgba(56, 189, 248, 0.4)',
                        borderWidth: 1,
                        borderDash: [3, 3],
                        pointRadius: 0,
                        fill: false,
                        tension: 0.3
                    },
                    {
                        label: 'Lower 95% Bound',
                        data: lowerSeries,
                        borderColor: 'rgba(56, 189, 248, 0.4)',
                        borderWidth: 1,
                        borderDash: [3, 3],
                        pointRadius: 0,
                        fill: '-1',
                        backgroundColor: 'rgba(56, 189, 248, 0.12)',
                        tension: 0.3
                    },
                    {
                        label: 'Historical Actuals',
                        data: histSeries,
                        borderColor: '#38bdf8',
                        backgroundColor: 'rgba(56, 189, 248, 0.08)',
                        borderWidth: 2.5,
                        pointRadius: 2,
                        pointHoverRadius: 5,
                        pointBackgroundColor: '#38bdf8',
                        fill: false,
                        tension: 0.25
                    },
                    {
                        label: 'Projected Forecast',
                        data: forecastSeries,
                        borderColor: '#a855f7',
                        borderDash: [6, 4],
                        borderWidth: 3,
                        pointRadius: 3,
                        pointHoverRadius: 6,
                        pointBackgroundColor: '#c084fc',
                        fill: false,
                        tension: 0.25
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
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#f8fafc',
                        bodyColor: '#cbd5e1',
                        borderColor: '#334155',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        boxPadding: 6,
                        callbacks: {
                            label: function (context) {
                                const val = context.parsed.y;
                                if (val === null || val === undefined) return null;
                                return ` ${context.dataset.label}: ${prefix}${Number(val).toLocaleString()}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(30, 41, 59, 0.6)' },
                        ticks: { color: '#94a3b8', font: { size: 11 }, maxTicksLimit: 12 }
                    },
                    y: {
                        grid: { color: 'rgba(30, 41, 59, 0.6)' },
                        ticks: {
                            color: '#94a3b8',
                            font: { size: 11 },
                            callback: function (val) {
                                return prefix + Number(val).toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    }

    function initSlicers() {
        const slider = document.getElementById('timeline-slider');
        const sliderLabel = document.getElementById('timeline-slider-label');
        const presetBtns = document.querySelectorAll('.fc-preset-btn');

        if (slider) {
            slider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value, 10);
                const days = Math.max(14, Math.round((val / 100) * 365));
                state.timelineSliceRange = days;
                if (sliderLabel) sliderLabel.textContent = `Latest ${days} Days`;
                presetBtns.forEach(b => b.classList.remove('active'));
                renderForecastChart();
            });
        }

        presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                presetBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const range = btn.getAttribute('data-range');
                state.timelineSliceRange = range;
                if (sliderLabel) {
                    sliderLabel.textContent = range === 'all' ? 'All Timeline' : `Latest ${range} Days`;
                }
                if (slider && range !== 'all') {
                    slider.value = Math.min(100, Math.round((parseInt(range, 10) / 365) * 100));
                }
                renderForecastChart();
            });
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 8. DECOMPOSITION & DRIVER ANALYSIS
    // ──────────────────────────────────────────────────────────────────────────
    function renderDecompositionAndDrivers() {
        const dowContainer = document.getElementById('dow-bars-container');
        if (dowContainer) {
            const dowData = state.seasonality && Object.keys(state.seasonality).length > 0 ? state.seasonality : {};
            const keys = Object.keys(dowData);
            if (keys.length > 0) {
                const maxVal = Math.max(...Object.values(dowData)) || 1;
                dowContainer.innerHTML = Object.entries(dowData).map(([day, val]) => {
                    const pct = Math.round((val / maxVal) * 100);
                    const isPeak = val === maxVal;
                    return `
                        <div class="dow-bar-row">
                            <span class="dow-bar-label">${day}</span>
                            <div class="dow-bar-track">
                                <div class="dow-bar-fill ${isPeak ? 'peak' : ''}" style="width: ${pct}%;"></div>
                            </div>
                            <span class="dow-bar-val">${Number(val).toLocaleString(undefined, { maximumFractionDigits: 1 })} avg</span>
                        </div>
                    `;
                }).join('');
            } else {
                dowContainer.innerHTML = '<div style="color: #64748b; font-size: 13px; padding: 12px 0;">Seasonality analyzed once multi-week records are trained.</div>';
            }
        }

        const driverContainer = document.getElementById('drivers-container');
        if (driverContainer) {
            const drivers = state.drivers && state.drivers.length > 0 ? state.drivers : [];
            if (drivers.length > 0) {
                driverContainer.innerHTML = drivers.map((d, idx) => `
                    <div class="driver-card-item">
                        <div class="driver-info">
                            <span class="driver-rank">#${idx + 1}</span>
                            <span class="driver-name">${escapeHtml(d.feature)}</span>
                        </div>
                        <span class="driver-weight">${d.weight}% impact</span>
                    </div>
                `).join('');
            } else {
                driverContainer.innerHTML = '<div style="color: #64748b; font-size: 13px; padding: 12px 0;">Feature weights derived directly from trained model tree/coefficients.</div>';
            }
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 9. FORECAST DATA TABLE WITH SORTING & PAGINATION
    // ──────────────────────────────────────────────────────────────────────────
    function initTableControls() {
        const rowLimitSelect = document.getElementById('table-row-limit');
        const searchInput = document.getElementById('fc-table-search');
        const prevBtn = document.getElementById('fc-prev-btn');
        const nextBtn = document.getElementById('fc-next-btn');

        if (rowLimitSelect) {
            rowLimitSelect.addEventListener('change', (e) => {
                state.pageSize = parseInt(e.target.value, 10) || 10;
                state.currentPage = 1;
                renderForecastTable();
            });
        }

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                state.tableSearchQuery = e.target.value.trim().toLowerCase();
                state.currentPage = 1;
                filterAndSortTable();
                renderForecastTable();
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (state.currentPage > 1) {
                    state.currentPage--;
                    renderForecastTable();
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const totalPages = Math.ceil(state.filteredTableData.length / state.pageSize) || 1;
                if (state.currentPage < totalPages) {
                    state.currentPage++;
                    renderForecastTable();
                }
            });
        }

        const tableHeaders = document.querySelectorAll('#fc-data-table th[data-sort]');
        tableHeaders.forEach(th => {
            th.addEventListener('click', () => {
                const field = th.getAttribute('data-sort');
                if (state.sortField === field) {
                    state.sortAscending = !state.sortAscending;
                } else {
                    state.sortField = field;
                    state.sortAscending = true;
                }
                filterAndSortTable();
                renderForecastTable();
            });
        });
    }

    function filterAndSortTable() {
        let list = [...state.fullCombinedData];

        if (state.tableSearchQuery) {
            const q = state.tableSearchQuery;
            list = list.filter(item => 
                item.date.includes(q) ||
                item.type.toLowerCase().includes(q) ||
                (item.actual !== null && String(item.actual).includes(q)) ||
                (item.predicted !== null && String(item.predicted).includes(q))
            );
        }

        list.sort((a, b) => {
            let valA = a[state.sortField];
            let valB = b[state.sortField];

            if (valA === null || valA === undefined) valA = '';
            if (valB === null || valB === undefined) valB = '';

            if (typeof valA === 'number' && typeof valB === 'number') {
                return state.sortAscending ? valA - valB : valB - valA;
            }
            return state.sortAscending ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
        });

        state.filteredTableData = list;
    }

    function renderForecastTable() {
        const tbody = document.getElementById('fc-table-tbody');
        const badge = document.getElementById('fc-table-row-count-badge');
        const infoEl = document.getElementById('fc-pagination-info');
        const pageEl = document.getElementById('fc-page-num');
        const prevBtn = document.getElementById('fc-prev-btn');
        const nextBtn = document.getElementById('fc-next-btn');

        if (!tbody) return;

        const totalItems = state.filteredTableData.length;
        const totalPages = Math.ceil(totalItems / state.pageSize) || 1;
        if (state.currentPage > totalPages) state.currentPage = totalPages;

        const startIdx = (state.currentPage - 1) * state.pageSize;
        const endIdx = Math.min(startIdx + state.pageSize, totalItems);
        const pageItems = state.filteredTableData.slice(startIdx, endIdx);

        if (badge) badge.textContent = `Total ${totalItems.toLocaleString()} Rows`;
        if (infoEl) infoEl.textContent = totalItems === 0 ? 'No records match search query' : `Showing ${startIdx + 1} to ${endIdx} of ${totalItems.toLocaleString()} rows`;
        if (pageEl) pageEl.textContent = `Page ${state.currentPage} of ${totalPages}`;

        if (prevBtn) prevBtn.disabled = state.currentPage <= 1;
        if (nextBtn) nextBtn.disabled = state.currentPage >= totalPages;

        const unit = getMetricUnit(state.targetMetric);
        const prefix = unit === '$' ? '$' : '';

        if (pageItems.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: #64748b;">No matching forecast records found.</td></tr>`;
            return;
        }

        tbody.innerHTML = pageItems.map(row => {
            const isFc = row.type === 'Projected';
            return `
                <tr>
                    <td style="font-weight: 600; color: #f8fafc;">${row.date}</td>
                    <td>
                        <span class="${isFc ? 'tag-forecasted' : 'tag-historical'}">
                            ${isFc ? '🔮 Projected' : '📜 Historical'}
                        </span>
                    </td>
                    <td style="color: ${row.actual !== null ? '#38bdf8' : '#64748b'};">
                        ${row.actual !== null ? `${prefix}${formatNumberLocale(row.actual)}` : '—'}
                    </td>
                    <td style="font-weight: 700; color: ${row.predicted !== null ? '#c084fc' : '#64748b'};">
                        ${row.predicted !== null ? `${prefix}${formatNumberLocale(row.predicted)}` : '—'}
                    </td>
                    <td style="color: ${row.lower !== null ? '#94a3b8' : '#64748b'};">
                        ${row.lower !== null ? `${prefix}${formatNumberLocale(row.lower)}` : '—'}
                    </td>
                    <td style="color: ${row.upper !== null ? '#94a3b8' : '#64748b'};">
                        ${row.upper !== null ? `${prefix}${formatNumberLocale(row.upper)}` : '—'}
                    </td>
                    <td style="color: ${row.spread !== null ? '#2dd4bf' : '#64748b'}; font-weight: 600;">
                        ${row.spread !== null ? `± ${prefix}${formatNumberLocale(round2(row.spread / 2))}` : '—'}
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 10. EXPORT, PRINT & EMAIL WORKFLOWS
    // ──────────────────────────────────────────────────────────────────────────
    function initExportAndDelivery() {
        const exportCsvBtn = document.getElementById('export-csv-btn');
        const exportXlsxBtn = document.getElementById('export-xlsx-btn');
        const printBtn = document.getElementById('print-page-btn');
        const openEmailBtn = document.getElementById('open-email-modal-btn');
        const emailModal = document.getElementById('email-modal');
        const emailCloseBtn = document.getElementById('email-modal-close-btn');
        const emailCancelBtn = document.getElementById('email-cancel-btn');
        const emailSubmitBtn = document.getElementById('email-submit-btn');

        if (exportCsvBtn) {
            exportCsvBtn.addEventListener('click', () => exportDataFile('csv'));
        }

        if (exportXlsxBtn) {
            exportXlsxBtn.addEventListener('click', () => exportDataFile('xlsx'));
        }

        if (printBtn) {
            printBtn.addEventListener('click', () => {
                showToast('Preparing print layout...', 'info', 1400);
                setTimeout(() => window.print(), 400);
            });
        }

        const closeModal = () => emailModal && emailModal.classList.remove('open');
        const openModal = () => emailModal && emailModal.classList.add('open');

        if (openEmailBtn) openEmailBtn.addEventListener('click', openModal);
        if (emailCloseBtn) emailCloseBtn.addEventListener('click', closeModal);
        if (emailCancelBtn) emailCancelBtn.addEventListener('click', closeModal);

        if (emailModal) {
            emailModal.addEventListener('click', (e) => {
                if (e.target === emailModal) closeModal();
            });
        }

        if (emailSubmitBtn) {
            emailSubmitBtn.addEventListener('click', async () => {
                const recipient = (document.getElementById('email-recipient')?.value || '').trim();
                const subject = (document.getElementById('email-subject')?.value || '').trim();
                const notes = (document.getElementById('email-notes')?.value || '').trim();
                const fmt = document.getElementById('email-format-select')?.value || 'csv';

                if (!recipient || !recipient.includes('@')) {
                    showToast('Please enter a valid recipient email address', 'warning');
                    return;
                }

                closeModal();
                showToast(`Sending forecast report to ${recipient}...`, 'info', 3000);

                try {
                    if (window.API && typeof window.API.sendForecastEmail === 'function') {
                        await window.API.sendForecastEmail(state.activeDataset, {
                            recipient_email: recipient,
                            subject: subject,
                            notes: notes,
                            format: fmt,
                            forecast_days: state.horizonDays,
                            model_name: state.activeModelName
                        });
                    }
                    showToast(`✓ Forecast report dispatched successfully to ${recipient}!`, 'success', 4500);
                } catch (e) {
                    showToast(`⚠️ Could not send email: ${e.message || 'Check server configuration'}`, 'error', 4500);
                }
            });
        }
    }

    function exportDataFile(format) {
        const rows = state.fullCombinedData;
        if (!rows || rows.length === 0) {
            showToast('No forecast data available to export.', 'warning');
            return;
        }

        const headers = ['Date', 'Record_Type', 'Actual_Value', 'Forecasted_Value', 'Lower_Bound_95', 'Upper_Bound_95', 'Uncertainty_Spread'];
        const csvRows = [headers.join(',')];

        rows.forEach(r => {
            const line = [
                r.date,
                r.type,
                r.actual !== null ? r.actual : '',
                r.predicted !== null ? r.predicted : '',
                r.lower !== null ? r.lower : '',
                r.upper !== null ? r.upper : '',
                r.spread !== null ? r.spread : ''
            ];
            csvRows.push(line.join(','));
        });

        const csvContent = '\uFEFF' + csvRows.join('\r\n');
        const mime = format === 'xlsx' ? 'application/vnd.ms-excel' : 'text/csv;charset=utf-8;';
        const blob = new Blob([csvContent], { type: mime });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const filename = `forecast_${state.activeDataset.replace(/[\.\s]/g, '_')}_${state.horizonDays}d.${format}`;

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showToast(`✓ Downloaded ${filename} successfully!`, 'success', 3500);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 11. HELPER UTILITIES
    // ──────────────────────────────────────────────────────────────────────────
    function getModelLabel(key) {
        switch (key) {
            case 'random_forest': return 'Random Forest Regressor';
            case 'linear_regression': return 'Linear Regression';
            case 'decision_tree': return 'Decision Tree Regressor';
            case 'arima': return 'ARIMA / Exponential Trend';
            case 'ridge': return 'Ridge Regression (L2)';
            default: return 'Auto Best Model';
        }
    }

    function formatNumberLocale(val) {
        if (val === null || val === undefined || isNaN(val)) return '0.00';
        return Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function round1(v) { return Math.round(v * 10) / 10; }
    function round2(v) { return Math.round(v * 100) / 100; }
    function round3(v) { return Math.round(v * 1000) / 1000; }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function showToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast-item toast-${type}`;
        const icons = { success: '✓', info: 'ℹ', warning: '⚠️', error: '✕' };
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || '•'}</span>
            <span class="toast-msg">${escapeHtml(message)}</span>
        `;

        container.appendChild(toast);
        setTimeout(() => toast.classList.add('visible'), 10);
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    window.ForecastController = {
        executeForecast,
        exportDataFile,
        state
    };
})();
