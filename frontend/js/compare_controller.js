/**
 * BizVision — Dataset Compare Controller
 * Handles dual-dataset selection validation, manual column mapping,
 * side-by-side single overlaid charts (no blank space), dynamic metric line chart,
 * side-by-side scrollable data tables with row selection, inline editing, and CSV downloads.
 */

(function () {
    'use strict';

    const state = {
        datasets: [],
        selectedA: '',
        selectedB: '',
        commonSchema: null,
        selectedMetrics: [],
        manualMetricA: '',
        manualMetricB: '',
        selectedCategory: '',
        selectedDate: '',
        dateGrouping: 'month', // 'day', 'month', 'year'
        activeTrendMetric: '',
        comparisonResult: null,
        isComparing: false,
        // Records data for side-by-side tables
        recordsA: [],
        recordsB: [],
        filteredA: [],
        filteredB: [],
        selectedRowsA: new Set(),
        selectedRowsB: new Set(),
        editModeA: false,
        editModeB: false
    };

    let el = {};

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        cacheDom();
        bindEvents();
        await loadDatasets();
    }

    function cacheDom() {
        el = {
            selectA: document.getElementById('dataset-a-select'),
            selectB: document.getElementById('dataset-b-select'),
            compareBtn: document.getElementById('compare-btn'),
            validationAlert: document.getElementById('validation-alert'),
            validationMsg: document.getElementById('validation-msg'),
            columnPanel: document.getElementById('column-selection-panel'),
            manualMetricASelect: document.getElementById('manual-metric-a-select'),
            manualMetricBSelect: document.getElementById('manual-metric-b-select'),
            categorySelect: document.getElementById('compare-category-select'),
            dateSelect: document.getElementById('compare-date-select'),
            columnMetricsList: document.getElementById('column-metrics-list'),
            selectAllMetricsBtn: document.getElementById('select-all-metrics-btn'),
            clearAllMetricsBtn: document.getElementById('clear-all-metrics-btn'),
            dateFilterBtns: document.querySelectorAll('.date-filter-btn'),
            loadingSection: document.getElementById('compare-loading-section'),
            loadingText: document.getElementById('compare-loading-text'),
            emptyState: document.getElementById('compare-empty-state'),
            errorState: document.getElementById('compare-error-state'),
            errorMsg: document.getElementById('compare-error-msg'),
            resultsSection: document.getElementById('compare-results-section'),
            summaryBanner: document.getElementById('summary-banner-content'),
            topIncreaseVal: document.getElementById('top-increase-val'),
            topIncreaseSub: document.getElementById('top-increase-sub'),
            topDecreaseVal: document.getElementById('top-decrease-val'),
            topDecreaseSub: document.getElementById('top-decrease-sub'),
            mostStableVal: document.getElementById('most-stable-val'),
            mostStableSub: document.getElementById('most-stable-sub'),
            kpiGrid: document.getElementById('kpi-comparison-grid'),
            trendChartSelect: document.getElementById('trend-metric-column-select'),
            badgeANameTrend: document.getElementById('badge-a-name-trend'),
            badgeBNameTrend: document.getElementById('badge-b-name-trend'),
            badgeANameCat: document.getElementById('badge-a-name-cat'),
            badgeBNameCat: document.getElementById('badge-b-name-cat'),
            comparisonTableBody: document.getElementById('comparison-table-body'),
            thDatasetAName: document.getElementById('th-dataset-a-name'),
            thDatasetBName: document.getElementById('th-dataset-b-name'),
            exportComparisonBtn: document.getElementById('export-comparison-btn'),
            // Side-by-side Table A elements
            cardTableTitleA: document.getElementById('card-table-title-a'),
            cardTableCountA: document.getElementById('card-table-count-a'),
            searchTableA: document.getElementById('search-table-a'),
            editModeBtnA: document.getElementById('edit-mode-btn-a'),
            editModeTextA: document.getElementById('edit-mode-text-a'),
            downloadDatasetABtn: document.getElementById('download-dataset-a-btn'),
            recordTheadA: document.getElementById('record-thead-a'),
            recordTbodyA: document.getElementById('record-tbody-a'),
            selectAllRowsA: document.getElementById('select-all-rows-a'),
            selectedRowsCountA: document.getElementById('selected-rows-count-a'),
            // Side-by-side Table B elements
            cardTableTitleB: document.getElementById('card-table-title-b'),
            cardTableCountB: document.getElementById('card-table-count-b'),
            searchTableB: document.getElementById('search-table-b'),
            editModeBtnB: document.getElementById('edit-mode-btn-b'),
            editModeTextB: document.getElementById('edit-mode-text-b'),
            downloadDatasetBBtn: document.getElementById('download-dataset-b-btn'),
            recordTheadB: document.getElementById('record-thead-b'),
            recordTbodyB: document.getElementById('record-tbody-b'),
            selectAllRowsB: document.getElementById('select-all-rows-b'),
            selectedRowsCountB: document.getElementById('selected-rows-count-b')
        };
    }

    function bindEvents() {
        if (el.selectA) el.selectA.addEventListener('change', onDatasetChange);
        if (el.selectB) el.selectB.addEventListener('change', onDatasetChange);
        if (el.compareBtn) el.compareBtn.addEventListener('click', onCompareClick);
        if (el.exportComparisonBtn) el.exportComparisonBtn.addEventListener('click', onExportComparisonClick);

        if (el.manualMetricASelect) {
            el.manualMetricASelect.addEventListener('change', (e) => {
                state.manualMetricA = e.target.value;
                if (state.comparisonResult) executeComparison();
            });
        }

        if (el.manualMetricBSelect) {
            el.manualMetricBSelect.addEventListener('change', (e) => {
                state.manualMetricB = e.target.value;
                if (state.comparisonResult) executeComparison();
            });
        }

        if (el.categorySelect) {
            el.categorySelect.addEventListener('change', (e) => {
                state.selectedCategory = e.target.value;
                if (state.comparisonResult) executeComparison();
            });
        }

        if (el.dateSelect) {
            el.dateSelect.addEventListener('change', (e) => {
                state.selectedDate = e.target.value;
                if (state.comparisonResult) executeComparison();
            });
        }

        if (el.trendChartSelect) {
            el.trendChartSelect.addEventListener('change', (e) => {
                state.activeTrendMetric = e.target.value;
                executeComparison();
            });
        }

        if (el.selectAllMetricsBtn) {
            el.selectAllMetricsBtn.addEventListener('click', () => {
                document.querySelectorAll('.metric-checkbox').forEach(cb => cb.checked = true);
                updateSelectedMetricsFromCheckboxes();
            });
        }

        if (el.clearAllMetricsBtn) {
            el.clearAllMetricsBtn.addEventListener('click', () => {
                const cbs = document.querySelectorAll('.metric-checkbox');
                cbs.forEach((cb, idx) => {
                    cb.checked = (idx === 0);
                });
                updateSelectedMetricsFromCheckboxes();
            });
        }

        if (el.dateFilterBtns) {
            el.dateFilterBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const grouping = btn.getAttribute('data-grouping');
                    if (!grouping || grouping === state.dateGrouping) return;

                    el.dateFilterBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    state.dateGrouping = grouping;

                    if (state.comparisonResult) {
                        executeComparison();
                    }
                });
            });
        }

        // Side-by-side Table A Event Listeners
        if (el.searchTableA) {
            el.searchTableA.addEventListener('input', (e) => {
                filterTableRows('A', e.target.value);
            });
        }
        if (el.editModeBtnA) {
            el.editModeBtnA.addEventListener('click', () => {
                state.editModeA = !state.editModeA;
                el.editModeBtnA.classList.toggle('active-mode', state.editModeA);
                el.editModeTextA.textContent = state.editModeA ? 'Done' : 'Edit';
                renderTableBody('A');
            });
        }
        if (el.downloadDatasetABtn) {
            el.downloadDatasetABtn.addEventListener('click', () => {
                if (state.selectedA) {
                    const ds = state.datasets.find(d => d.dataset_id === state.selectedA);
                    window.API.downloadDatasetFile(state.selectedA, ds ? ds.filename : 'dataset_a.csv');
                }
            });
        }
        if (el.selectAllRowsA) {
            el.selectAllRowsA.addEventListener('change', (e) => {
                toggleSelectAllRows('A', e.target.checked);
            });
        }

        // Side-by-side Table B Event Listeners
        if (el.searchTableB) {
            el.searchTableB.addEventListener('input', (e) => {
                filterTableRows('B', e.target.value);
            });
        }
        if (el.editModeBtnB) {
            el.editModeBtnB.addEventListener('click', () => {
                state.editModeB = !state.editModeB;
                el.editModeBtnB.classList.toggle('active-mode', state.editModeB);
                el.editModeTextB.textContent = state.editModeB ? 'Done' : 'Edit';
                renderTableBody('B');
            });
        }
        if (el.downloadDatasetBBtn) {
            el.downloadDatasetBBtn.addEventListener('click', () => {
                if (state.selectedB) {
                    const ds = state.datasets.find(d => d.dataset_id === state.selectedB);
                    window.API.downloadDatasetFile(state.selectedB, ds ? ds.filename : 'dataset_b.csv');
                }
            });
        }
        if (el.selectAllRowsB) {
            el.selectAllRowsB.addEventListener('change', (e) => {
                toggleSelectAllRows('B', e.target.checked);
            });
        }
        // Direct Upload & Demo Loaders
        const uploadInput = document.getElementById('compare-upload-input');
        if (uploadInput) {
            uploadInput.addEventListener('change', async () => {
                if (uploadInput.files && uploadInput.files[0]) {
                    const file = uploadInput.files[0];
                    showValidationWarning(`⏳ Uploading & cleaning "${file.name}" for comparison...`);
                    try {
                        const res = await window.API.uploadDataset(file);
                        showValidationWarning(`✓ Dataset "${file.name}" cleaned & ready for comparison!`);
                        await loadDatasets();
                        if (res && res.table_name) {
                            if (!el.selectA.value) {
                                el.selectA.value = res.table_name;
                                state.selectedA = res.table_name;
                            } else {
                                el.selectB.value = res.table_name;
                                state.selectedB = res.table_name;
                            }
                            await onDatasetChange();
                            executeComparison();
                        }
                    } catch (err) {
                        showValidationWarning(`Upload failed: ${err.message || 'Please check file format.'}`);
                    }
                }
            });
        }

        const demoBtn = document.getElementById('btn-load-demo-compare');
        if (demoBtn) {
            demoBtn.style.display = 'none';
        }
    }

    async function loadDatasets() {
        try {
            el.selectA.innerHTML = '<option value="">Loading cleaned datasets...</option>';
            el.selectB.innerHTML = '<option value="">Loading cleaned datasets...</option>';

            const res = await window.API.fetchCleanedDatasets();
            const datasets = res.datasets || [];
            state.datasets = datasets;

            if (datasets.length === 0) {
                el.selectA.innerHTML = '<option value="">Upload or select a cleaned dataset</option>';
                el.selectB.innerHTML = '<option value="">Upload or select a cleaned dataset</option>';
                showValidationWarning('No cleaned datasets found in your account yet. Click <strong>"Upload Cleaned Dataset Now"</strong> above to upload and compare any spreadsheet!');
                setCompareBtnActive(false);
                return;
            }

            el.selectA.innerHTML = '<option value="">— Select Dataset A —</option>';
            // Dataset B always defaults to empty option (never auto-selected to same dataset!)
            el.selectB.innerHTML = '<option value="">— Select Dataset B —</option>';

            datasets.forEach((d) => {
                const label = `✓ ${d.filename} (${d.row_count.toLocaleString()} rows)`;

                const optA = document.createElement('option');
                optA.value = d.dataset_id;
                optA.textContent = label;
                optA.dataset.filename = d.filename;
                el.selectA.appendChild(optA);

                const optB = document.createElement('option');
                optB.value = d.dataset_id;
                optB.textContent = label;
                optB.dataset.filename = d.filename;
                el.selectB.appendChild(optB);
            });

            // If the user only has 1 dataset uploaded:
            if (datasets.length === 1) {
                el.selectA.value = datasets[0].dataset_id;
                state.selectedA = datasets[0].dataset_id;
                el.selectB.value = datasets[0].dataset_id;
                state.selectedB = datasets[0].dataset_id;
                showValidationWarning(`Single dataset active: <strong>${datasets[0].filename}</strong>. You can compare columns within this dataset or check 100% baseline match.`);
                setCompareBtnActive(true);
                await onDatasetChange();
                return;
            }

            // If user has 2 or more datasets, pre-select Dataset A to the first, leave B for explicit user selection
            el.selectA.value = datasets[0].dataset_id;
            state.selectedA = datasets[0].dataset_id;
            el.selectB.value = datasets.length > 1 ? datasets[1].dataset_id : datasets[0].dataset_id;
            state.selectedB = el.selectB.value;
            setCompareBtnActive(true);
            await onDatasetChange();

        } catch (err) {
            console.error('Failed to load datasets:', err);
            showValidationWarning('Failed to connect to backend database. Please ensure backend is running.');
            setCompareBtnActive(false);
        }
    }

    async function onDatasetChange() {
        state.selectedA = el.selectA.value;
        state.selectedB = el.selectB.value || el.selectA.value;

        hideValidationWarning();
        hideError();

        // 1. Validation Before Compare: A dataset must be selected
        if (!state.selectedA) {
            setCompareBtnActive(false);
            if (el.columnPanel) el.columnPanel.style.display = 'none';
            showEmptyState();
            return;
        }

        // Inform user if identical comparison is being made
        if (state.selectedA === state.selectedB) {
            showValidationWarning('✨ <strong>100% Match Mode / Column Comparison:</strong> Comparing dataset against itself or matching columns within this dataset.');
        }

        const dsObjA = state.datasets.find(d => d.dataset_id === state.selectedA);
        const dsObjB = state.datasets.find(d => d.dataset_id === state.selectedB) || dsObjA;

        if (!dsObjA) {
            setCompareBtnActive(false);
            return;
        }

        // Fetch common & individual column schemas
        try {
            const schema = await window.API.fetchCompareColumns(state.selectedA, state.selectedB);
            state.commonSchema = schema;

            if (!schema.has_common_metrics) {
                showError('These datasets don’t share a common metric to compare. Please choose datasets with overlapping numeric columns (e.g. Sales, Revenue, Units).');
                setCompareBtnActive(false);
                if (el.columnPanel) el.columnPanel.style.display = 'none';
                return;
            }

            renderColumnSelectionPanel(schema);
            setCompareBtnActive(true);
        } catch (err) {
            console.error('Column detection failed:', err);
            showError('Could not analyze dataset schemas. ' + (err.message || ''));
            setCompareBtnActive(false);
        }
    }

    function renderColumnSelectionPanel(schema) {
        if (!el.columnPanel) return;
        el.columnPanel.style.display = 'block';

        const dsA = schema.dataset_a || {};
        const dsB = schema.dataset_b || {};

        // 1. Populate Manual Metric A Dropdown
        if (el.manualMetricASelect) {
            el.manualMetricASelect.innerHTML = '';
            const metricsA = dsA.metric_columns || schema.common_metrics || [];
            metricsA.forEach((m, idx) => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m.replace(/_/g, ' ').toUpperCase();
                if (idx === 0) opt.selected = true;
                el.manualMetricASelect.appendChild(opt);
            });
            state.manualMetricA = metricsA[0] || '';
        }

        // 2. Populate Manual Metric B Dropdown
        if (el.manualMetricBSelect) {
            el.manualMetricBSelect.innerHTML = '';
            const metricsB = dsB.metric_columns || schema.common_metrics || [];
            metricsB.forEach((m, idx) => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m.replace(/_/g, ' ').toUpperCase();
                if (idx === 0) opt.selected = true;
                el.manualMetricBSelect.appendChild(opt);
            });
            state.manualMetricB = metricsB[0] || '';
        }

        // 3. Populate Category Dropdown
        if (el.categorySelect) {
            el.categorySelect.innerHTML = '<option value="">None / Auto</option>';
            const cats = schema.common_categories || [];
            cats.forEach((cat, idx) => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat.replace(/_/g, ' ').toUpperCase();
                if (idx === 0) opt.selected = true;
                el.categorySelect.appendChild(opt);
            });
            state.selectedCategory = cats[0] || '';
        }

        // 4. Populate Date Dropdown
        if (el.dateSelect) {
            el.dateSelect.innerHTML = '<option value="">None / Auto</option>';
            const dates = schema.common_dates || [];
            dates.forEach((dCol, idx) => {
                const opt = document.createElement('option');
                opt.value = dCol;
                opt.textContent = dCol.replace(/_/g, ' ').toUpperCase();
                if (idx === 0) opt.selected = true;
                el.dateSelect.appendChild(opt);
            });
            state.selectedDate = dates[0] || '';
        }

        // 5. Render Metric Checkboxes
        el.columnMetricsList.innerHTML = '';
        state.selectedMetrics = [];

        (schema.common_metrics || []).forEach(metric => {
            const labelText = metric.replace(/_/g, ' ').toUpperCase();
            const wrapper = document.createElement('label');
            wrapper.className = 'col-checkbox-label';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'metric-checkbox';
            checkbox.value = metric;
            checkbox.checked = true;
            state.selectedMetrics.push(metric);

            checkbox.addEventListener('change', () => {
                updateSelectedMetricsFromCheckboxes();
            });

            const spanText = document.createElement('span');
            spanText.textContent = labelText;

            const badge = document.createElement('span');
            badge.className = 'col-role-badge role-metric';
            badge.textContent = 'METRIC';

            wrapper.appendChild(checkbox);
            wrapper.appendChild(spanText);
            wrapper.appendChild(badge);
            el.columnMetricsList.appendChild(wrapper);
        });
    }

    function updateSelectedMetricsFromCheckboxes() {
        const checked = [];
        document.querySelectorAll('.metric-checkbox:checked').forEach(cb => {
            checked.push(cb.value);
        });

        if (checked.length === 0) {
            const first = document.querySelector('.metric-checkbox');
            if (first) {
                first.checked = true;
                checked.push(first.value);
            }
        }

        state.selectedMetrics = checked;
        if (state.comparisonResult) {
            executeComparison();
        }
    }

    function setCompareBtnActive(active) {
        if (!el.compareBtn) return;
        if (active) {
            el.compareBtn.removeAttribute('disabled');
            el.compareBtn.classList.remove('btn-disabled');
            el.compareBtn.classList.add('btn-active-glow');
        } else {
            el.compareBtn.setAttribute('disabled', 'true');
            el.compareBtn.classList.add('btn-disabled');
            el.compareBtn.classList.remove('btn-active-glow');
        }
    }

    async function onCompareClick() {
        if (!state.selectedA || !state.selectedB) return;
        await executeComparison();
    }

    async function executeComparison() {
        if (state.isComparing) return;
        state.isComparing = true;

        hideEmptyState();
        hideError();
        hideResults();
        showLoading(true);

        const payload = {
            dataset_a: state.selectedA,
            dataset_b: state.selectedB,
            selected_metrics: state.selectedMetrics,
            metric_a: state.manualMetricA || null,
            metric_b: state.manualMetricB || null,
            trend_metric: state.activeTrendMetric || null,
            category_column: state.selectedCategory || null,
            date_column: state.selectedDate || null,
            date_grouping: state.dateGrouping
        };

        try {
            updateLoadingText('Matching columns...');
            await sleep(300);

            updateLoadingText('Calculating...');
            const result = await window.API.runDatasetComparison(payload);

            if (!result.success) {
                showError(result.message || 'Comparison calculation could not be completed.');
                showLoading(false);
                state.isComparing = false;
                return;
            }

            updateLoadingText('Ready');
            await sleep(200);

            state.comparisonResult = result;
            renderComparisonResults(result);

            // Also load side-by-side dataset records
            await loadSideBySideRecords();

            showLoading(false);
            showResults();
        } catch (err) {
            console.error('Comparison error:', err);
            showLoading(false);
            showError(err.message || 'An error occurred during comparison calculation.');
        } finally {
            state.isComparing = false;
        }
    }

    function renderComparisonResults(data) {
        const fnameA = data.dataset_a.filename;
        const fnameB = data.dataset_b.filename;

        // 1. Plain-English Summary & 100% Match Display
        if (el.summaryBanner) {
            if (data.is_identical) {
                el.summaryBanner.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                        <span style="background: #10b981; color: #fff; font-size: 13px; font-weight: 800; padding: 4px 14px; border-radius: 20px; box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);">✓ 100% MATCH</span>
                        <strong style="color: #10b981; font-size: 15px;">Identical Datasets Verified (0.0% Variance)</strong>
                    </div>
                    <div>${data.plain_summary || 'Both datasets are 100% identical with 0.0% variance across all records and metrics.'}</div>
                `;
            } else {
                el.summaryBanner.innerHTML = data.plain_summary || '';
            }
        }

        // 2. Biggest Changes Highlights
        const bc = data.biggest_changes || {};
        renderHighlightCard(el.topIncreaseVal, el.topIncreaseSub, bc.top_increase, 'increase');
        renderHighlightCard(el.topDecreaseVal, el.topDecreaseSub, bc.top_decrease, 'decrease');
        renderHighlightCard(el.mostStableVal, el.mostStableSub, bc.most_stable, 'neutral');

        // 3. Dynamic KPI Comparison Cards
        renderKpiCards(data.kpi_cards, fnameA, fnameB);

        // Update Legend Badges
        if (el.badgeANameTrend) el.badgeANameTrend.textContent = fnameA;
        if (el.badgeBNameTrend) el.badgeBNameTrend.textContent = fnameB;
        if (el.badgeANameCat) el.badgeANameCat.textContent = fnameA;
        if (el.badgeBNameCat) el.badgeBNameCat.textContent = fnameB;

        // 4. Populate Trend Chart Metric Dropdown
        if (el.trendChartSelect && data.trend_chart_data && data.trend_chart_data.available_metrics) {
            const avail = data.trend_chart_data.available_metrics;
            const currentSelected = data.trend_chart_data.metric_column;
            el.trendChartSelect.innerHTML = '';
            avail.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m.replace(/_/g, ' ').toUpperCase();
                if (m === currentSelected) opt.selected = true;
                el.trendChartSelect.appendChild(opt);
            });
        }

        // 5. Render BOTH Charts Side-by-Side (NO BLANK SPACE!)
        // Left: Category / Region Growth Breakdown
        if (data.category_chart_data) {
            window.Charts.renderCombinedCategoryChart('compare-category-chart', data.category_chart_data);
        } else {
            // Fallback category chart comparing records
            const fallbackCatData = {
                labels: ['Total Volume'],
                series_a: [data.dataset_a.row_count],
                series_b: [data.dataset_b.row_count],
                dataset_a_name: fnameA,
                dataset_b_name: fnameB,
                metric_title: 'Record Count'
            };
            window.Charts.renderCombinedCategoryChart('compare-category-chart', fallbackCatData);
        }

        // Right: Metric Comparison & Trend Line (ALWAYS VISIBLE!)
        if (data.trend_chart_data) {
            window.Charts.renderCombinedTrendChart('compare-trend-chart', data.trend_chart_data);
        }

        // 6. Comparison Summary Matrix Table
        renderComparisonTable(data.comparison_table, fnameA, fnameB);
    }

    function renderHighlightCard(valEl, subEl, item, type) {
        if (!valEl || !subEl) return;
        if (!item) {
            valEl.textContent = 'None';
            subEl.textContent = 'No variance detected';
            return;
        }

        const pct = item.pct_change;
        const sign = pct >= 0 ? '+' : '';
        valEl.textContent = `${sign}${pct.toFixed(1)}%`;

        if (type === 'increase') {
            valEl.style.color = '#10b981';
        } else if (type === 'decrease') {
            valEl.style.color = '#ef4444';
        } else {
            valEl.style.color = '#38bdf8';
        }

        subEl.textContent = item.name || '';
    }

    function renderKpiCards(cards, nameA, nameB) {
        if (!el.kpiGrid) return;
        el.kpiGrid.innerHTML = '';

        (cards || []).forEach(c => {
            const isPos = c.pct_change > 0;
            const isNeg = c.pct_change < 0;
            const colorClass = isPos ? 'text-increase' : (isNeg ? 'text-decrease' : 'text-neutral');
            const sign = isPos ? '+' : '';

            const fmtValA = c.unit_type === 'currency' ? window.API.formatCurrency(c.val_a) : window.API.formatNumber(c.val_a);
            const fmtValB = c.unit_type === 'currency' ? window.API.formatCurrency(c.val_b) : window.API.formatNumber(c.val_b);
            const fmtDiff = c.unit_type === 'currency' ? window.API.formatCurrency(c.diff) : window.API.formatNumber(c.diff);

            const card = document.createElement('div');
            card.className = 'kpi-compare-card';
            card.innerHTML = `
                <div class="kpi-compare-header">
                    <span class="kpi-compare-title">${c.title}</span>
                    <span class="kpi-change-pill ${colorClass}">${sign}${c.pct_change.toFixed(1)}%</span>
                </div>
                <div class="kpi-compare-body">
                    <div class="kpi-side-item ds-a-side">
                        <span class="kpi-side-label">${nameA}</span>
                        <span class="kpi-side-value">${fmtValA}</span>
                    </div>
                    <div class="kpi-side-divider">VS</div>
                    <div class="kpi-side-item ds-b-side">
                        <span class="kpi-side-label">${nameB}</span>
                        <span class="kpi-side-value">${fmtValB}</span>
                    </div>
                </div>
                <div class="kpi-compare-footer">
                    <span>Difference: <strong class="${colorClass}">${sign}${fmtDiff}</strong></span>
                    <span class="kpi-status-sub">${c.status_label}</span>
                </div>
            `;
            el.kpiGrid.appendChild(card);
        });
    }

    function renderComparisonTable(rows, nameA, nameB) {
        if (!el.comparisonTableBody) return;
        el.comparisonTableBody.innerHTML = '';

        if (el.thDatasetAName) el.thDatasetAName.textContent = `Dataset A: ${nameA}`;
        if (el.thDatasetBName) el.thDatasetBName.textContent = `Dataset B: ${nameB}`;

        (rows || []).forEach(r => {
            const isPos = r.pct_change > 0;
            const isNeg = r.pct_change < 0;
            const statusClass = isPos ? 'status-pill-increase' : (isNeg ? 'status-pill-decrease' : 'status-pill-neutral');
            const sign = isPos ? '+' : '';

            const fmtA = r.unit_type === 'currency' ? window.API.formatCurrency(r.val_a) : window.API.formatNumber(r.val_a);
            const fmtB = r.unit_type === 'currency' ? window.API.formatCurrency(r.val_b) : window.API.formatNumber(r.val_b);
            const fmtDiff = r.unit_type === 'currency' ? window.API.formatCurrency(r.diff) : window.API.formatNumber(r.diff);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="col-metric-name">
                    <strong>${r.metric}</strong>
                    <span class="table-cat-sub">${r.category}</span>
                </td>
                <td class="col-val-a">${fmtA}</td>
                <td class="col-val-b">${fmtB}</td>
                <td class="col-diff ${isPos ? 'text-increase' : (isNeg ? 'text-decrease' : '')}">${sign}${fmtDiff}</td>
                <td class="col-pct ${isPos ? 'text-increase' : (isNeg ? 'text-decrease' : '')}"><strong>${sign}${r.pct_change.toFixed(1)}%</strong></td>
                <td>
                    <span class="status-pill ${statusClass}">
                        ${isPos ? '▲ Outperforming' : (isNeg ? '▼ Lagging' : '● Equal')}
                    </span>
                </td>
            `;
            el.comparisonTableBody.appendChild(tr);
        });
    }

    // ── SIDE-BY-SIDE DATASET RECORD INSPECTION & EDITING ──
    async function loadSideBySideRecords() {
        if (!state.selectedA || !state.selectedB) return;

        try {
            const [resA, resB] = await Promise.all([
                window.API.fetchDatasetRecords(state.selectedA, 0, 100),
                window.API.fetchDatasetRecords(state.selectedB, 0, 100)
            ]);

            state.recordsA = resA.records || [];
            state.columnsA = resA.columns || [];
            state.filteredA = [...state.recordsA];
            state.selectedRowsA.clear();

            state.recordsB = resB.records || [];
            state.columnsB = resB.columns || [];
            state.filteredB = [...state.recordsB];
            state.selectedRowsB.clear();

            // Update card headers
            if (el.cardTableTitleA) el.cardTableTitleA.textContent = resA.filename || state.selectedA;
            if (el.cardTableCountA) el.cardTableCountA.textContent = `(${resA.total_rows.toLocaleString()} rows)`;

            if (el.cardTableTitleB) el.cardTableTitleB.textContent = resB.filename || state.selectedB;
            if (el.cardTableCountB) el.cardTableCountB.textContent = `(${resB.total_rows.toLocaleString()} rows)`;

            renderTableHeader('A');
            renderTableBody('A');

            renderTableHeader('B');
            renderTableBody('B');
        } catch (err) {
            console.error('Failed to load side-by-side records:', err);
        }
    }

    function renderTableHeader(tableKey) {
        const thead = tableKey === 'A' ? el.recordTheadA : el.recordTheadB;
        const columns = tableKey === 'A' ? state.columnsA : state.columnsB;
        if (!thead || !columns) return;

        const selectAllId = tableKey === 'A' ? 'select-all-rows-a' : 'select-all-rows-b';

        let html = `<tr>
            <th style="width: 36px; text-align: center;"><input type="checkbox" id="${selectAllId}"></th>
            <th style="width: 44px; text-align: center;">#</th>`;

        columns.forEach(col => {
            html += `<th>${col.replace(/_/g, ' ').toUpperCase()}</th>`;
        });

        html += `</tr>`;
        thead.innerHTML = html;

        // Rebind select all checkbox
        const newSelectAll = document.getElementById(selectAllId);
        if (newSelectAll) {
            newSelectAll.addEventListener('change', (e) => {
                toggleSelectAllRows(tableKey, e.target.checked);
            });
        }
    }

    function renderTableBody(tableKey) {
        const tbody = tableKey === 'A' ? el.recordTbodyA : el.recordTbodyB;
        const columns = tableKey === 'A' ? state.columnsA : state.columnsB;
        const records = tableKey === 'A' ? state.filteredA : state.filteredB;
        const selectedSet = tableKey === 'A' ? state.selectedRowsA : state.selectedRowsB;
        const isEditMode = tableKey === 'A' ? state.editModeA : state.editModeB;
        const selectedRowClass = tableKey === 'A' ? 'row-selected' : 'row-selected-b';

        if (!tbody || !columns) return;

        if (records.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${columns.length + 2}" style="text-align:center; padding: 24px; color:#64748b;">No records match your filter.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        records.forEach((row, rowIdx) => {
            const tr = document.createElement('tr');
            const rowId = row._row_id !== undefined ? row._row_id : rowIdx;
            const isSelected = selectedSet.has(rowId);

            if (isSelected) {
                tr.classList.add(selectedRowClass);
            }

            // Checkbox td
            const tdCheck = document.createElement('td');
            tdCheck.style.textAlign = 'center';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = isSelected;
            cb.addEventListener('change', () => {
                if (cb.checked) {
                    selectedSet.add(rowId);
                    tr.classList.add(selectedRowClass);
                } else {
                    selectedSet.delete(rowId);
                    tr.classList.remove(selectedRowClass);
                }
                updateSelectedCountBadge(tableKey);
            });
            tdCheck.appendChild(cb);
            tr.appendChild(tdCheck);

            // Row index td
            const tdIdx = document.createElement('td');
            tdIdx.style.textAlign = 'center';
            tdIdx.style.color = '#64748b';
            tdIdx.textContent = (rowIdx + 1).toString();
            tr.appendChild(tdIdx);

            // Data tds
            columns.forEach(col => {
                const td = document.createElement('td');
                const val = row[col] !== undefined && row[col] !== null ? row[col] : '';
                td.textContent = val.toString();
                td.title = `${col}: ${val}`;

                if (isEditMode) {
                    td.classList.add('cell-editable');
                    td.title = `Click to edit ${col}`;
                    td.addEventListener('click', (e) => {
                        e.stopPropagation();
                        startCellEditing(tableKey, rowId, col, td);
                    });
                }

                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

        updateSelectedCountBadge(tableKey);
    }

    function startCellEditing(tableKey, rowId, column, cellElement) {
        if (cellElement.classList.contains('cell-editing')) return;

        const currentVal = cellElement.textContent;
        cellElement.classList.add('cell-editing');
        cellElement.innerHTML = '';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentVal;
        cellElement.appendChild(input);
        input.focus();
        input.select();

        async function saveEdit() {
            const newVal = input.value.trim();
            cellElement.classList.remove('cell-editing');
            cellElement.textContent = newVal;

            // Update in-memory record
            const targetRecords = tableKey === 'A' ? state.recordsA : state.recordsB;
            const targetRow = targetRecords.find(r => r._row_id === rowId);
            if (targetRow) {
                targetRow[column] = newVal;
            }

            // Persist to backend database
            const dsId = tableKey === 'A' ? state.selectedA : state.selectedB;
            try {
                await window.API.updateDatasetCell(dsId, rowId, column, newVal);
            } catch (err) {
                console.error('Failed to persist edit:', err);
                cellElement.style.border = '1px solid #ef4444';
            }
        }

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                saveEdit();
            } else if (e.key === 'Escape') {
                cellElement.classList.remove('cell-editing');
                cellElement.textContent = currentVal;
            }
        });

        input.addEventListener('blur', saveEdit);
    }

    function toggleSelectAllRows(tableKey, checked) {
        const records = tableKey === 'A' ? state.filteredA : state.filteredB;
        const selectedSet = tableKey === 'A' ? state.selectedRowsA : state.selectedRowsB;

        selectedSet.clear();
        if (checked) {
            records.forEach(r => {
                const rId = r._row_id !== undefined ? r._row_id : 0;
                selectedSet.add(rId);
            });
        }
        renderTableBody(tableKey);
    }

    function filterTableRows(tableKey, query) {
        const q = (query || '').toLowerCase().trim();
        const records = tableKey === 'A' ? state.recordsA : state.recordsB;
        const columns = tableKey === 'A' ? state.columnsA : state.columnsB;

        if (!q) {
            if (tableKey === 'A') state.filteredA = [...records];
            else state.filteredB = [...records];
        } else {
            const filtered = records.filter(row => {
                return columns.some(col => {
                    const val = row[col];
                    return val !== undefined && val !== null && String(val).toLowerCase().includes(q);
                });
            });
            if (tableKey === 'A') state.filteredA = filtered;
            else state.filteredB = filtered;
        }

        renderTableBody(tableKey);
    }

    function updateSelectedCountBadge(tableKey) {
        const selectedSet = tableKey === 'A' ? state.selectedRowsA : state.selectedRowsB;
        const badge = tableKey === 'A' ? el.selectedRowsCountA : el.selectedRowsCountB;
        if (badge) {
            badge.textContent = `${selectedSet.size} row${selectedSet.size === 1 ? '' : 's'} selected`;
        }
    }

    async function onExportComparisonClick() {
        if (!state.selectedA || !state.selectedB) return;
        try {
            el.exportComparisonBtn.textContent = '⏳ Exporting...';
            el.exportComparisonBtn.setAttribute('disabled', 'true');

            const payload = {
                dataset_a: state.selectedA,
                dataset_b: state.selectedB,
                selected_metrics: state.selectedMetrics,
                metric_a: state.manualMetricA || null,
                metric_b: state.manualMetricB || null,
                trend_metric: state.activeTrendMetric || null,
                category_column: state.selectedCategory || null,
                date_column: state.selectedDate || null,
                date_grouping: state.dateGrouping
            };

            await window.API.exportComparisonCSV(payload);
        } catch (err) {
            console.error('Export error:', err);
            alert('Could not export comparison CSV: ' + err.message);
        } finally {
            el.exportComparisonBtn.textContent = '📥 Download Comparison Report CSV';
            el.exportComparisonBtn.removeAttribute('disabled');
        }
    }

    // UI Helper States
    function showLoading(show) {
        if (el.loadingSection) el.loadingSection.style.display = show ? 'block' : 'none';
    }

    function updateLoadingText(text) {
        if (el.loadingText) el.loadingText.textContent = text;
    }

    function showEmptyState() {
        if (el.emptyState) el.emptyState.style.display = 'block';
        hideResults();
        hideError();
    }

    function hideEmptyState() {
        if (el.emptyState) el.emptyState.style.display = 'none';
    }

    function showError(msg) {
        if (el.errorState) el.errorState.style.display = 'block';
        if (el.errorMsg) el.errorMsg.textContent = msg;
        hideResults();
        hideEmptyState();
    }

    function hideError() {
        if (el.errorState) el.errorState.style.display = 'none';
    }

    function showResults() {
        if (el.resultsSection) el.resultsSection.style.display = 'block';
    }

    function hideResults() {
        if (el.resultsSection) el.resultsSection.style.display = 'none';
    }

    function showValidationWarning(msg) {
        if (el.validationAlert) el.validationAlert.style.display = 'block';
        if (el.validationMsg) el.validationMsg.innerHTML = msg;
    }

    function hideValidationWarning() {
        if (el.validationAlert) el.validationAlert.style.display = 'none';
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

})();
