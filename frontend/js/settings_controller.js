/**
 * BizVision - Settings Page Controller
 * Manages Regional & i18n Language, Data Pipeline Settings,
 * Notification Master/Child Toggles, Report Branding (Background/Logo) with live preview,
 * Storage Usage with file deletion & cache clearing, and sticky Unsaved Changes bar.
 */

(function () {
    'use strict';

    // State management
    const state = {
        settings: {
            language: 'en',
            auto_clean: true,
            duplicate_handling: 'remove',
            default_rows_per_page: 10,
            email_alerts_master: true,
            alert_report_sent: true,
            alert_schedule_failed: true,
            alert_upload_complete: true,
            branding_image: '',
            branding_opacity: 10,
            branding_position: 'center',
            branding_size: 'fit'
        },
        initialSettings: null,
        storage: {
            used_bytes: 0,
            total_quota_bytes: 500 * 1024 * 1024,
            used_formatted: '0 MB',
            used_percentage: 0,
            files: []
        },
        isDirty: false,
        activeTab: 'regional',
        fileToDelete: null
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
    // I18N TRANSLATION DICTIONARY (Section 1)
    // ─────────────────────────────────────────────────────────────────────────
    const I18N_DICTIONARY = {
        en: {
            nav_dashboard: 'Dashboard',
            nav_upload: 'Upload Data',
            nav_forecast: 'Forecasting',
            nav_compare: 'Compare Dataset',
            nav_insights: 'AI Insight',
            nav_reports: 'Reports',
            nav_settings: 'Settings',
            nav_profile: 'My Profile',
            settings_title: 'System Settings & Preferences',
            settings_desc: 'Customize dashboard regional formatting, automated data pipeline, alerts, report branding watermark, and storage limits.',
            tab_regional: 'Regional & Language',
            tab_data: 'Data Settings',
            tab_notifications: 'Notifications',
            tab_email: 'Email Integration',
            tab_branding: 'Report Branding',
            tab_storage: 'Storage Usage',
            save_changes: 'Save Changes',
            reset_default: 'Reset to Default',
            unsaved_warning: 'Unsaved changes detected'
        },
        hi: {
            nav_dashboard: 'डैशबोर्ड',
            nav_upload: 'डेटा अपलोड',
            nav_forecast: 'पूर्वानुमान',
            nav_compare: 'डेटासेट तुलना',
            nav_insights: 'एआई अंतर्दृष्टि',
            nav_reports: 'रिपोर्ट्स',
            nav_settings: 'सेटिंग्स',
            nav_profile: 'मेरी प्रोफ़ाइल',
            settings_title: 'सिस्टम सेटिंग्स और प्राथमिकताएं',
            settings_desc: 'डैशबोर्ड भाषा, स्वचालित डेटा पाइपलाइन, अलर्ट, रिपोर्ट ब्रांडिंग और स्टोरेज सीमाओं को अनुकूलित करें।',
            tab_regional: 'क्षेत्रीय और भाषा',
            tab_data: 'डेटा सेटिंग्स',
            tab_notifications: 'सूचनाएं',
            tab_email: 'ईमेल एकीकरण',
            tab_branding: 'रिपोर्ट ब्रांडिंग',
            tab_storage: 'स्टोरेज उपयोग',
            save_changes: 'परिवर्तन सहेजें',
            reset_default: 'डिफ़ॉल्ट पर रीसेट करें',
            unsaved_warning: 'असुरक्षित परिवर्तन मिले'
        },
        es: {
            nav_dashboard: 'Panel de Control',
            nav_upload: 'Subir Datos',
            nav_forecast: 'Pronósticos',
            nav_compare: 'Comparar Datos',
            nav_insights: 'Perspectivas IA',
            nav_reports: 'Informes',
            nav_settings: 'Ajustes',
            nav_profile: 'Mi Perfil',
            settings_title: 'Ajustes del Sistema y Preferencias',
            settings_desc: 'Personalice el idioma, pipeline automatizado de datos, notificaciones, marca de agua en informes y almacenamiento.',
            tab_regional: 'Regional e Idioma',
            tab_data: 'Ajustes de Datos',
            tab_notifications: 'Notificaciones',
            tab_email: 'Integración de Correo',
            tab_branding: 'Marca del Informe',
            tab_storage: 'Uso de Almacenamiento',
            save_changes: 'Guardar Cambios',
            reset_default: 'Restablecer',
            unsaved_warning: 'Cambios no guardados detectados'
        },
        fr: {
            nav_dashboard: 'Tableau de bord',
            nav_upload: 'Téléverser',
            nav_forecast: 'Prévisions',
            nav_compare: 'Comparer',
            nav_insights: 'Aperçus IA',
            nav_reports: 'Rapports',
            nav_settings: 'Paramètres',
            nav_profile: 'Mon Profil',
            settings_title: 'Paramètres et Préférences du Système',
            settings_desc: 'Personnalisez la langue, le traitement automatisé des données, les alertes, le logo de rapport et le stockage.',
            tab_regional: 'Régional et Langue',
            tab_data: 'Paramètres des Données',
            tab_notifications: 'Notifications',
            tab_email: 'Intégration d\'Email',
            tab_branding: 'Image de Marque',
            tab_storage: 'Stockage',
            save_changes: 'Enregistrer les modifications',
            reset_default: 'Réinitialiser',
            unsaved_warning: 'Modifications non enregistrées'
        },
        de: {
            nav_dashboard: 'Übersicht',
            nav_upload: 'Daten hochladen',
            nav_forecast: 'Prognosen',
            nav_compare: 'Vergleichen',
            nav_insights: 'KI-Einblicke',
            nav_reports: 'Berichte',
            nav_settings: 'Einstellungen',
            nav_profile: 'Mein Profil',
            settings_title: 'Systemeinstellungen und Präferenzen',
            settings_desc: 'Passen Sie Sprache, automatische Datenbereinigung, Benachrichtigungen, Bericht-Wasserzeichen und Speicherlimits an.',
            tab_regional: 'Regional & Sprache',
            tab_data: 'Dateneinstellungen',
            tab_notifications: 'Benachrichtigungen',
            tab_email: 'E-Mail-Integration',
            tab_branding: 'Berichts-Branding',
            tab_storage: 'Speichernutzung',
            save_changes: 'Änderungen speichern',
            reset_default: 'Zurücksetzen',
            unsaved_warning: 'Nicht gespeicherte Änderungen'
        }
    };

    function applyLanguage(lang) {
        const dict = I18N_DICTIONARY[lang] || I18N_DICTIONARY.en;

        // Update Nav Menu Links
        const navMap = [
            { sel: 'a[href="index.html"] .nav-label', key: 'nav_dashboard' },
            { sel: 'a[href="upload.html"] .nav-label', key: 'nav_upload' },
            { sel: 'a[href="forecast.html"] .nav-label', key: 'nav_forecast' },
            { sel: 'a[href="compare.html"] .nav-label', key: 'nav_compare' },
            { sel: 'a[href="insights.html"] .nav-label', key: 'nav_insights' },
            { sel: 'a[href="reports.html"] .nav-label', key: 'nav_reports' },
            { sel: 'a[href="settings.html"] .nav-label', key: 'nav_settings' },
            { sel: 'a[href="profile.html"] .nav-label', key: 'nav_profile' }
        ];

        navMap.forEach(item => {
            const el = $(item.sel);
            if (el && dict[item.key]) {
                el.textContent = dict[item.key];
            }
        });

        // Update Page Header
        const pageTitle = $('.page-title');
        const pageDesc = $('.page-description');
        if (pageTitle && dict.settings_title) pageTitle.textContent = dict.settings_title;
        if (pageDesc && dict.settings_desc) pageDesc.textContent = dict.settings_desc;

        // Update Tab Labels
        const tabMap = [
            { sel: '#tab-btn-regional .tab-title', key: 'tab_regional' },
            { sel: '#tab-btn-data .tab-title', key: 'tab_data' },
            { sel: '#tab-btn-notifications .tab-title', key: 'tab_notifications' },
            { sel: '#tab-btn-email .tab-title', key: 'tab_email' },
            { sel: '#tab-btn-branding .tab-title', key: 'tab_branding' },
            { sel: '#tab-btn-storage .tab-title', key: 'tab_storage' }
        ];
        tabMap.forEach(item => {
            const el = $(item.sel);
            if (el && dict[item.key]) el.textContent = dict[item.key];
        });

        // Update Sticky bar buttons
        const saveBtn = $('#btn-save-settings');
        const resetBtn = $('#btn-reset-settings');
        const unsavedText = $('#unsaved-pill-text');
        if (saveBtn && dict.save_changes) {
            saveBtn.innerHTML = `💾 ${dict.save_changes}`;
        }
        if (resetBtn && dict.reset_default) {
            resetBtn.innerHTML = `↺ ${dict.reset_default}`;
        }
        if (unsavedText && dict.unsaved_warning) {
            unsavedText.textContent = dict.unsaved_warning;
        }

        // Store active language in localStorage for cross-page persistence
        localStorage.setItem('bizvision_language', lang);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TOAST NOTIFICATIONS
    // ─────────────────────────────────────────────────────────────────────────
    function showToast(message, type = 'info') {
        const container = $('#toast-container') || createToastContainer();
        const toast = document.createElement('div');
        toast.className = `settings-toast settings-toast-${type}`;

        let icon = 'ℹ️';
        if (type === 'success') icon = '✅';
        else if (type === 'error') icon = '❌';
        else if (type === 'warning') icon = '⚠️';

        toast.innerHTML = `
            <span class="settings-toast-icon">${icon}</span>
            <div class="settings-toast-message">${escapeHtml(message)}</div>
            <button class="settings-toast-close" aria-label="Close">&times;</button>
        `;

        container.appendChild(toast);

        const timer = setTimeout(() => {
            removeToast(toast);
        }, 4500);

        toast.querySelector('.settings-toast-close').addEventListener('click', () => {
            clearTimeout(timer);
            removeToast(toast);
        });
    }

    function removeToast(toast) {
        toast.classList.add('settings-toast-fade');
        setTimeout(() => toast.remove(), 300);
    }

    function createToastContainer() {
        const c = document.createElement('div');
        c.id = 'toast-container';
        c.className = 'settings-toast-container';
        document.body.appendChild(c);
        return c;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INITIALIZATION & TAB SWITCHING
    // ─────────────────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', async () => {
        initTabs();
        initEventListeners();
        initUnsavedWarning();
        await loadAllSettings();
        await loadStorageUsage();
        await loadGmailIntegrationStatus();
        checkUrlQueryParams();

        // Apply saved language from local store
        const savedLang = localStorage.getItem('bizvision_language') || state.settings.language || 'en';
        applyLanguage(savedLang);
    });

    function initTabs() {
        $$('.settings-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-tab');
                switchTab(target);
            });
        });
    }

    function switchTab(tabId) {
        state.activeTab = tabId;

        $$('.settings-tab-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
        });

        $$('.settings-tab-pane').forEach(pane => {
            pane.style.display = pane.id === `pane-${tabId}` ? 'block' : 'none';
        });

        // If storage tab opened, refresh storage metrics
        if (tabId === 'storage') {
            loadStorageUsage();
        }
        if (tabId === 'email') {
            loadGmailIntegrationStatus();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LOAD SETTINGS FROM BACKEND
    // ─────────────────────────────────────────────────────────────────────────
    async function loadAllSettings() {
        try {
            const res = await window.API.fetchSettings();
            if (res && res.settings) {
                state.settings = { ...res.settings };
                state.initialSettings = JSON.parse(JSON.stringify(res.settings));

                populateFormFromState();
                markClean();

                // Sync global local storage keys
                localStorage.setItem('bizvision_rows_per_page', state.settings.default_rows_per_page);
                localStorage.setItem('bizvision_auto_clean', state.settings.auto_clean);
                localStorage.setItem('bizvision_branding', JSON.stringify({
                    image: state.settings.branding_image,
                    opacity: state.settings.branding_opacity,
                    position: state.settings.branding_position,
                    size: state.settings.branding_size
                }));
            }
        } catch (err) {
            console.warn('Could not fetch backend settings, using local fallback:', err);
            // Fallback from localStorage
            populateFormFromState();
        }
    }

    function populateFormFromState() {
        const s = state.settings;

        // 1. Regional
        const langSelect = $('#setting-language');
        if (langSelect) langSelect.value = s.language || 'en';

        // 2. Data Settings
        const autoCleanToggle = $('#setting-auto-clean');
        if (autoCleanToggle) autoCleanToggle.checked = Boolean(s.auto_clean);

        const dupSelect = $('#setting-duplicate-handling');
        if (dupSelect) dupSelect.value = s.duplicate_handling || 'remove';

        const rowsSelect = $('#setting-rows-per-page');
        if (rowsSelect) rowsSelect.value = String(s.default_rows_per_page || 10);

        // 3. Notifications
        const masterToggle = $('#setting-email-alerts-master');
        if (masterToggle) {
            masterToggle.checked = Boolean(s.email_alerts_master);
            updateNotificationChildrenState(masterToggle.checked);
        }

        const repSentToggle = $('#setting-alert-report-sent');
        if (repSentToggle) repSentToggle.checked = Boolean(s.alert_report_sent);

        const schedFailToggle = $('#setting-alert-schedule-failed');
        if (schedFailToggle) schedFailToggle.checked = Boolean(s.alert_schedule_failed);

        const upCompToggle = $('#setting-alert-upload-complete');
        if (upCompToggle) upCompToggle.checked = Boolean(s.alert_upload_complete);

        // 4. Report Branding
        const opacitySlider = $('#setting-branding-opacity');
        const opacityVal = $('#branding-opacity-val');
        if (opacitySlider) {
            opacitySlider.value = s.branding_opacity || 10;
            if (opacityVal) opacityVal.textContent = `${s.branding_opacity || 10}%`;
        }

        const posSelect = $('#setting-branding-position');
        if (posSelect) posSelect.value = s.branding_position || 'center';

        const sizeSelect = $('#setting-branding-size');
        if (sizeSelect) sizeSelect.value = s.branding_size || 'fit';

        updateBrandingPreview();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REPORT BRANDING: DRAG-AND-DROP & LIVE PREVIEW (Section 4)
    // ─────────────────────────────────────────────────────────────────────────
    function initBrandingHandlers() {
        const dropZone = $('#branding-drop-zone');
        const fileInput = $('#branding-file-input');
        const replaceBtn = $('#btn-replace-branding');
        const removeBtn = $('#btn-remove-branding');

        if (!dropZone || !fileInput) return;

        // Click to browse
        dropZone.addEventListener('click', (e) => {
            if (e.target !== replaceBtn && e.target !== removeBtn) {
                fileInput.click();
            }
        });

        if (replaceBtn) {
            replaceBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                fileInput.click();
            });
        }

        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeBranding();
            });
        }

        // Drag and drop events
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                dropZone.classList.add('drop-zone-active');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                dropZone.classList.remove('drop-zone-active');
            });
        });

        dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                handleBrandingFile(files[0]);
            }
        });

        fileInput.addEventListener('change', () => {
            if (fileInput.files && fileInput.files.length > 0) {
                handleBrandingFile(fileInput.files[0]);
            }
        });

        // Controls change events
        const opacitySlider = $('#setting-branding-opacity');
        const posSelect = $('#setting-branding-position');
        const sizeSelect = $('#setting-branding-size');

        if (opacitySlider) {
            opacitySlider.addEventListener('input', (e) => {
                const val = e.target.value;
                $('#branding-opacity-val').textContent = `${val}%`;
                state.settings.branding_opacity = parseInt(val, 10);
                updateBrandingPreview();
                markDirty();
            });
        }

        if (posSelect) {
            posSelect.addEventListener('change', (e) => {
                state.settings.branding_position = e.target.value;
                updateBrandingPreview();
                markDirty();
            });
        }

        if (sizeSelect) {
            sizeSelect.addEventListener('change', (e) => {
                state.settings.branding_size = e.target.value;
                updateBrandingPreview();
                markDirty();
            });
        }
    }

    async function handleBrandingFile(file) {
        // Validate MIME type
        const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            showToast('Invalid file type. Please upload a PNG, JPG, or WEBP image.', 'error');
            return;
        }

        // Validate max 5MB
        const maxBytes = 5 * 1024 * 1024;
        if (file.size > maxBytes) {
            showToast(`File size exceeds 5 MB (${(file.size / 1024 / 1024).toFixed(2)} MB). Please choose a smaller image.`, 'error');
            return;
        }

        showToast('Uploading & processing branding image...', 'info');

        try {
            const res = await window.API.uploadBrandingImage(file);
            state.settings.branding_image = res.image_url;
            updateBrandingPreview();
            markDirty();
            showToast('Branding image uploaded! Preview updated below.', 'success');
        } catch (err) {
            showToast(window.API.getErrorMessage(err), 'error');
        }
    }

    async function removeBranding() {
        if (!confirm('Are you sure you want to remove the custom report branding image?')) return;
        try {
            await window.API.removeBrandingImage();
            state.settings.branding_image = '';
            updateBrandingPreview();
            markDirty();
            showToast('Report branding image removed', 'info');
        } catch (err) {
            showToast(window.API.getErrorMessage(err), 'error');
        }
    }

    function updateBrandingPreview() {
        const previewCanvas = $('#branding-report-preview-canvas');
        const emptyWatermark = $('#branding-preview-empty-note');
        const dropZoneEmpty = $('#branding-drop-zone-empty');
        const dropZoneFilled = $('#branding-drop-zone-filled');
        const thumbImg = $('#branding-thumb-img');

        if (!previewCanvas) return;

        const imgUrl = state.settings.branding_image;
        const opacity = (state.settings.branding_opacity || 10) / 100;
        const pos = state.settings.branding_position || 'center';
        const size = state.settings.branding_size || 'fit';

        if (imgUrl) {
            // Update drop zone preview
            if (dropZoneEmpty) dropZoneEmpty.style.display = 'none';
            if (dropZoneFilled) dropZoneFilled.style.display = 'flex';
            if (thumbImg) thumbImg.src = imgUrl;

            // Update sample report preview canvas background
            previewCanvas.style.backgroundImage = `url("${imgUrl}")`;
            previewCanvas.style.opacity = '1';

            // Background position & size
            if (pos === 'top-right') {
                previewCanvas.style.backgroundPosition = 'top 15px right 15px';
                previewCanvas.style.backgroundRepeat = 'no-repeat';
            } else if (pos === 'tiled') {
                previewCanvas.style.backgroundPosition = 'center';
                previewCanvas.style.backgroundRepeat = 'repeat';
            } else {
                previewCanvas.style.backgroundPosition = 'center center';
                previewCanvas.style.backgroundRepeat = 'no-repeat';
            }

            if (size === 'fill') {
                previewCanvas.style.backgroundSize = 'cover';
            } else {
                previewCanvas.style.backgroundSize = pos === 'top-right' ? '120px auto' : 'contain';
            }

            // Apply opacity layer over the background
            let overlay = $('#branding-watermark-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'branding-watermark-overlay';
                overlay.className = 'branding-watermark-overlay';
                previewCanvas.prepend(overlay);
            }
            overlay.style.backgroundColor = `rgba(255, 255, 255, ${1 - opacity})`;

            if (emptyWatermark) emptyWatermark.style.display = 'none';

        } else {
            if (dropZoneEmpty) dropZoneEmpty.style.display = 'block';
            if (dropZoneFilled) dropZoneFilled.style.display = 'none';
            if (thumbImg) thumbImg.src = '';

            previewCanvas.style.backgroundImage = 'none';
            const overlay = $('#branding-watermark-overlay');
            if (overlay) overlay.remove();

            if (emptyWatermark) emptyWatermark.style.display = 'block';
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // NOTIFICATIONS MASTER TOGGLE (Section 3)
    // ─────────────────────────────────────────────────────────────────────────
    function updateNotificationChildrenState(isMasterOn) {
        const childToggles = $$('.notification-child-toggle');
        const childContainer = $('#notification-children-container');

        childToggles.forEach(toggle => {
            toggle.disabled = !isMasterOn;
        });

        if (childContainer) {
            childContainer.style.opacity = isMasterOn ? '1' : '0.45';
            childContainer.style.pointerEvents = isMasterOn ? 'auto' : 'none';
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STORAGE USAGE & FILE MANAGEMENT (Section 5)
    // ─────────────────────────────────────────────────────────────────────────
    async function loadStorageUsage() {
        const skeleton = $('#storage-loading-skeleton');
        const display = $('#storage-content-display');
        if (skeleton && display) {
            skeleton.style.display = 'block';
            display.style.display = 'none';
        }

        try {
            const data = await window.API.fetchStorageStats();
            state.storage = data;

            // Render Progress Bar & Percentage
            renderStorageBar(data);

            // Render Files List Table
            renderStorageFilesTable(data.files || []);

        } catch (err) {
            console.error('Storage fetch error:', err);
            showToast('Could not load storage information', 'error');
        } finally {
            if (skeleton && display) {
                skeleton.style.display = 'none';
                display.style.display = 'block';
            }
        }
    }

    function renderStorageBar(data) {
        const barFill = $('#storage-progress-fill');
        const usedText = $('#storage-used-text');
        const pctBadge = $('#storage-pct-badge');

        const pct = data.used_percentage || 0;
        if (barFill) {
            barFill.style.width = `${pct}%`;
            if (pct >= 90) barFill.style.backgroundColor = 'var(--color-red)';
            else if (pct >= 70) barFill.style.backgroundColor = 'var(--color-amber)';
            else barFill.style.backgroundColor = 'var(--color-indigo)';
        }

        if (usedText) {
            usedText.textContent = `${data.used_formatted} / ${data.total_quota_formatted} (${pct}%) used`;
        }

        if (pctBadge) {
            pctBadge.textContent = `${pct}% Used`;
        }
    }

    function renderStorageFilesTable(files) {
        const tbody = $('#storage-files-tbody');
        const emptyState = $('#storage-empty-state');
        if (!tbody) return;

        if (!files || files.length === 0) {
            tbody.innerHTML = '';
            if (emptyState) emptyState.style.display = 'block';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        tbody.innerHTML = files.map(file => {
            return `
                <tr>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 16px;">📄</span>
                            <div>
                                <strong style="color: var(--color-neutral-900); font-size: 13.5px;">${escapeHtml(file.filename)}</strong>
                                <div style="font-size: 11.5px; color: var(--color-neutral-600);">${escapeHtml(file.dataset_id)}</div>
                            </div>
                        </div>
                    </td>
                    <td><span class="report-format-pill">${escapeHtml(file.type)}</span></td>
                    <td class="num-cell">${file.row_count.toLocaleString()}</td>
                    <td class="num-cell"><strong>${escapeHtml(file.size_formatted)}</strong></td>
                    <td>${escapeHtml(file.created_at)}</td>
                    <td style="text-align: right;">
                        <button class="btn-table-action danger" onclick="window.SettingsCtrl.promptDeleteFile('${escapeHtml(file.dataset_id)}', '${escapeHtml(file.filename)}')">
                            🗑️ Delete
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function filterStorageFiles(query) {
        const rows = $$('#storage-files-tbody tr');
        const q = (query || '').toLowerCase().trim();
        rows.forEach(r => {
            const text = r.textContent.toLowerCase();
            r.style.display = text.includes(q) ? '' : 'none';
        });
    }

    function promptDeleteFile(datasetId, filename) {
        state.fileToDelete = { datasetId, filename };
        const modal = $('#delete-file-modal');
        const nameSpan = $('#delete-file-modal-name');
        if (nameSpan) nameSpan.textContent = filename;
        if (modal) modal.style.display = 'flex';
    }

    async function confirmDeleteFile() {
        if (!state.fileToDelete) return;

        const { datasetId, filename } = state.fileToDelete;
        const confirmBtn = $('#btn-confirm-delete-file');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Deleting...';

        try {
            await window.API.deleteStorageFile(datasetId);
            showToast(`Dataset "${filename}" permanently deleted`, 'success');
            $('#delete-file-modal').style.display = 'none';
            state.fileToDelete = null;

            // If deleted dataset was active in session, clear it
            if (sessionStorage.getItem('currentTableName') === datasetId) {
                sessionStorage.removeItem('currentTableName');
            }

            await loadStorageUsage();
        } catch (err) {
            showToast(window.API.getErrorMessage(err), 'error');
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Yes, Delete Permanently';
        }
    }

    function promptClearCache() {
        const modal = $('#clear-cache-modal');
        if (modal) modal.style.display = 'flex';
    }

    async function confirmClearCache() {
        const btn = $('#btn-confirm-clear-cache');
        btn.disabled = true;
        btn.textContent = 'Clearing Cache...';

        try {
            const res = await window.API.clearStorageCache();
            showToast(res.message || 'Cache cleared successfully! 14.8 MB freed.', 'success');
            $('#clear-cache-modal').style.display = 'none';

            // Also clear client-side localStorage cache items
            sessionStorage.clear();

            await loadStorageUsage();
        } catch (err) {
            showToast(window.API.getErrorMessage(err), 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Clear Cache Now';
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SAVE SETTINGS & DIRTY TRACKING (Section 6)
    // ─────────────────────────────────────────────────────────────────────────
    function markDirty() {
        state.isDirty = true;
        const pill = $('#unsaved-changes-pill');
        const saveBar = $('#sticky-save-bar');
        if (pill) pill.style.display = 'inline-flex';
        if (saveBar) saveBar.classList.add('save-bar-active');
    }

    function markClean() {
        state.isDirty = false;
        const pill = $('#unsaved-changes-pill');
        const saveBar = $('#sticky-save-bar');
        if (pill) pill.style.display = 'none';
        if (saveBar) saveBar.classList.remove('save-bar-active');
    }

    async function saveAllSettings() {
        const saveBtn = $('#btn-save-settings');
        saveBtn.disabled = true;
        const origText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<span class="report-btn-spinner"></span> Saving...';

        try {
            // Read all form inputs into state
            const payload = {
                language: $('#setting-language')?.value || 'en',
                auto_clean: Boolean($('#setting-auto-clean')?.checked),
                duplicate_handling: $('#setting-duplicate-handling')?.value || 'remove',
                default_rows_per_page: parseInt($('#setting-rows-per-page')?.value || '10', 10),
                email_alerts_master: Boolean($('#setting-email-alerts-master')?.checked),
                alert_report_sent: Boolean($('#setting-alert-report-sent')?.checked),
                alert_schedule_failed: Boolean($('#setting-alert-schedule-failed')?.checked),
                alert_upload_complete: Boolean($('#setting-alert-upload-complete')?.checked),
                branding_image: state.settings.branding_image || '',
                branding_opacity: parseInt($('#setting-branding-opacity')?.value || '10', 10),
                branding_position: $('#setting-branding-position')?.value || 'center',
                branding_size: $('#setting-branding-size')?.value || 'fit'
            };

            await window.API.saveSettings(payload);

            state.settings = { ...payload };
            state.initialSettings = JSON.parse(JSON.stringify(payload));
            markClean();

            // Sync global configs for other pages
            localStorage.setItem('bizvision_rows_per_page', payload.default_rows_per_page);
            localStorage.setItem('bizvision_auto_clean', payload.auto_clean);
            localStorage.setItem('bizvision_branding', JSON.stringify({
                image: payload.branding_image,
                opacity: payload.branding_opacity,
                position: payload.branding_position,
                size: payload.branding_size
            }));

            // Apply selected language
            applyLanguage(payload.language);

            showToast('Settings saved successfully!', 'success');

        } catch (err) {
            console.error('Failed to save settings:', err);
            showToast(window.API.getErrorMessage(err) || 'Failed to save settings, please try again', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = origText;
        }
    }

    function resetToDefaults() {
        if (!confirm('Are you sure you want to reset all settings to system defaults?')) return;

        state.settings = {
            language: 'en',
            auto_clean: true,
            duplicate_handling: 'remove',
            default_rows_per_page: 10,
            email_alerts_master: true,
            alert_report_sent: true,
            alert_schedule_failed: true,
            alert_upload_complete: true,
            branding_image: '',
            branding_opacity: 10,
            branding_position: 'center',
            branding_size: 'fit'
        };

        populateFormFromState();
        markDirty();
        showToast('Settings reset to system defaults. Click "Save Changes" to apply.', 'info');
    }

    function initUnsavedWarning() {
        // Native window beforeunload warning
        window.addEventListener('beforeunload', (e) => {
            if (state.isDirty) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return e.returnValue;
            }
        });

        // Intercept internal links
        $$('a[href]').forEach(link => {
            link.addEventListener('click', (e) => {
                if (state.isDirty && !link.getAttribute('href').startsWith('#')) {
                    const confirmLeave = confirm('You have unsaved changes. Are you sure you want to leave without saving?');
                    if (!confirmLeave) {
                        e.preventDefault();
                    }
                }
            });
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PERSONAL GMAIL INTEGRATION CONTROLLER (Multi-User SaaS)
    // ─────────────────────────────────────────────────────────────────────────
    let gmailAuthWindow = null;

    async function loadGmailIntegrationStatus() {
        try {
            renderGmailGlobalBadge('checking');
            const res = await window.API.fetchGmailStatus();
            renderGmailState(res);
        } catch (err) {
            console.error('Failed to load Gmail status:', err);
            renderGmailState({
                configured: true,
                connected: false,
                status: 'error',
                last_error: window.API.getErrorMessage(err)
            });
        }
    }

    function renderGmailGlobalBadge(status) {
        const badgeEl = $('#gmail-global-status-badge');
        if (!badgeEl) return;
        if (status === 'connected') {
            badgeEl.innerHTML = '<span class="gmail-badge-pill gmail-badge-connected">● Connected</span>';
        } else if (status === 'expired') {
            badgeEl.innerHTML = '<span class="gmail-badge-pill gmail-badge-expired">⚠️ Auth Expired</span>';
        } else if (status === 'error') {
            badgeEl.innerHTML = '<span class="gmail-badge-pill gmail-badge-error">❌ Setup Needed</span>';
        } else if (status === 'connecting') {
            badgeEl.innerHTML = '<span class="gmail-badge-pill gmail-badge-not-connected">⏳ Connecting...</span>';
        } else {
            badgeEl.innerHTML = '<span class="gmail-badge-pill gmail-badge-not-connected">○ Not Connected</span>';
        }
    }

    function renderGmailState(data) {
        const notConnectedCard = $('#gmail-state-not-connected');
        const connectingCard = $('#gmail-state-connecting');
        const connectedCard = $('#gmail-state-connected');
        const expiredCard = $('#gmail-state-expired');
        const errorCard = $('#gmail-state-error');

        [notConnectedCard, connectingCard, connectedCard, expiredCard, errorCard].forEach(c => {
            if (c) c.style.display = 'none';
        });

        // 1. If server is not configured with Google client credentials
        if (data.configured === false) {
            if (errorCard) {
                errorCard.style.display = 'block';
                const titleEl = $('#gmail-error-title');
                const descEl = $('#gmail-error-desc');
                const guideEl = $('#gmail-error-guide');
                if (titleEl) titleEl.textContent = 'Google OAuth Client Not Configured';
                if (descEl) descEl.textContent = 'To allow workspace users to connect personal Gmail accounts, configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend .env.';
                if (guideEl) guideEl.style.display = 'block';
            }
            renderGmailGlobalBadge('error');
            return;
        }

        // 2. Active & Connected
        if (data.connected && data.google_email) {
            if (connectedCard) {
                connectedCard.style.display = 'block';
                const emailEl = $('#gmail-connected-email');
                const timeEl = $('#gmail-connected-time');
                const avatarEl = $('#gmail-connected-avatar');
                if (emailEl) emailEl.textContent = data.google_email;
                if (timeEl) timeEl.textContent = data.updated_at || 'Recently';
                if (avatarEl) avatarEl.textContent = data.google_email.charAt(0).toUpperCase();
            }
            renderGmailGlobalBadge('connected');
            return;
        }

        // 3. Expired or Revoked
        if (data.status === 'expired') {
            if (expiredCard) expiredCard.style.display = 'block';
            renderGmailGlobalBadge('expired');
            return;
        }

        // 4. Other Error
        if (data.status === 'error' && data.last_error) {
            if (errorCard) {
                errorCard.style.display = 'block';
                const titleEl = $('#gmail-error-title');
                const descEl = $('#gmail-error-desc');
                const guideEl = $('#gmail-error-guide');
                if (titleEl) titleEl.textContent = 'Gmail Connection Notice';
                if (descEl) descEl.textContent = data.last_error;
                if (guideEl) guideEl.style.display = 'none';
            }
            renderGmailGlobalBadge('error');
            return;
        }

        // 5. Default: Not Connected
        if (notConnectedCard) notConnectedCard.style.display = 'block';
        renderGmailGlobalBadge('not_connected');
    }

    async function initiateGmailOAuth() {
        try {
            renderGmailState({ configured: true, connected: false, status: 'connecting' });
            renderGmailGlobalBadge('connecting');
            const connectingCard = $('#gmail-state-connecting');
            if (connectingCard) connectingCard.style.display = 'block';

            const res = await window.API.getGmailConnectUrl();
            if (!res.authorization_url) {
                throw new Error('No authorization URL returned from server.');
            }

            // Open OAuth popup window
            const width = 600;
            const height = 700;
            const left = (window.screen.width / 2) - (width / 2);
            const top = (window.screen.height / 2) - (height / 2);

            gmailAuthWindow = window.open(
                res.authorization_url,
                'BizVisionGmailAuth',
                `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=yes,resizable=yes`
            );

            if (!gmailAuthWindow || gmailAuthWindow.closed || typeof gmailAuthWindow.closed === 'undefined') {
                showToast('Popup blocked by browser. Redirecting directly...', 'info');
                window.location.href = res.authorization_url;
                return;
            }

            const popupTimer = setInterval(() => {
                if (gmailAuthWindow && gmailAuthWindow.closed) {
                    clearInterval(popupTimer);
                    setTimeout(loadGmailIntegrationStatus, 600);
                }
            }, 1000);

        } catch (err) {
            console.error('OAuth initiation failed:', err);
            showToast(window.API.getErrorMessage(err), 'error');
            loadGmailIntegrationStatus();
        }
    }

    async function handleGmailDisconnect() {
        if (!confirm('Are you sure you want to disconnect your personal Gmail account? You will not be able to send reports directly from this email until reconnected.')) {
            return;
        }

        try {
            showToast('Disconnecting Gmail account...', 'info');
            const res = await window.API.disconnectGmail();
            showToast(res.message || 'Gmail disconnected successfully', 'success');
            await loadGmailIntegrationStatus();
        } catch (err) {
            console.error('Failed to disconnect Gmail:', err);
            showToast(window.API.getErrorMessage(err), 'error');
        }
    }

    async function handleSendGmailTestEmail() {
        const testBtn = $('#btn-send-test-email');
        if (!testBtn) return;
        const origText = testBtn.innerHTML;
        testBtn.disabled = true;
        testBtn.innerHTML = '⏳ Sending Verification Email...';

        try {
            const res = await window.API.sendGmailTestEmail();
            showToast(res.message || 'Verification test email sent successfully!', 'success');
        } catch (err) {
            console.error('Test email failed:', err);
            showToast(window.API.getErrorMessage(err), 'error');
        } finally {
            testBtn.disabled = false;
            testBtn.innerHTML = origText;
        }
    }

    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'GMAIL_CONNECTED') {
            showToast(`Gmail connected successfully (${event.data.email})!`, 'success');
            loadGmailIntegrationStatus();
        } else if (event.data && event.data.type === 'GMAIL_ERROR') {
            showToast(`Connection failed: ${event.data.error}`, 'error');
            loadGmailIntegrationStatus();
        }
    });

    function checkUrlQueryParams() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('gmail_connected') === '1') {
            const email = urlParams.get('email') || '';
            showToast(`Gmail account connected successfully${email ? ' (' + email + ')' : ''}!`, 'success');
            switchTab('email');
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (urlParams.get('gmail_error')) {
            showToast(`Gmail connection error: ${decodeURIComponent(urlParams.get('gmail_error'))}`, 'error');
            switchTab('email');
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (urlParams.get('tab') === 'email') {
            switchTab('email');
        }
    }

    function initEventListeners() {
        // Form field changes trigger markDirty
        const formSelectors = [
            '#setting-language',
            '#setting-auto-clean',
            '#setting-duplicate-handling',
            '#setting-rows-per-page',
            '#setting-email-alerts-master',
            '#setting-alert-report-sent',
            '#setting-alert-schedule-failed',
            '#setting-alert-upload-complete'
        ];

        formSelectors.forEach(sel => {
            const el = $(sel);
            if (el) {
                el.addEventListener('change', () => {
                    markDirty();
                });
            }
        });

        // Master notification toggle listener
        const masterToggle = $('#setting-email-alerts-master');
        if (masterToggle) {
            masterToggle.addEventListener('change', (e) => {
                updateNotificationChildrenState(e.target.checked);
            });
        }

        // Language preview on change
        const langSelect = $('#setting-language');
        if (langSelect) {
            langSelect.addEventListener('change', (e) => {
                applyLanguage(e.target.value);
            });
        }

        // Branding upload handlers
        initBrandingHandlers();

        // Save & Reset Buttons
        const saveBtn = $('#btn-save-settings');
        if (saveBtn) saveBtn.addEventListener('click', saveAllSettings);

        const resetBtn = $('#btn-reset-settings');
        if (resetBtn) resetBtn.addEventListener('click', resetToDefaults);

        // Storage Search Box
        const storageSearch = $('#storage-search-input');
        if (storageSearch) {
            storageSearch.addEventListener('input', (e) => {
                filterStorageFiles(e.target.value);
            });
        }

        // Modal triggers
        const clearCacheBtn = $('#btn-open-clear-cache-modal');
        if (clearCacheBtn) clearCacheBtn.addEventListener('click', promptClearCache);

        const confirmDeleteBtn = $('#btn-confirm-delete-file');
        if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', confirmDeleteFile);

        const confirmClearBtn = $('#btn-confirm-clear-cache');
        if (confirmClearBtn) confirmClearBtn.addEventListener('click', confirmClearCache);

        // Gmail Integration Event Listeners
        const connectGmailBtn = $('#btn-connect-gmail');
        if (connectGmailBtn) connectGmailBtn.addEventListener('click', initiateGmailOAuth);

        const reconnectGmailBtn = $('#btn-reconnect-gmail');
        if (reconnectGmailBtn) reconnectGmailBtn.addEventListener('click', initiateGmailOAuth);

        const reconnectExpiredBtn = $('#btn-reconnect-expired');
        if (reconnectExpiredBtn) reconnectExpiredBtn.addEventListener('click', initiateGmailOAuth);

        const disconnectGmailBtn = $('#btn-disconnect-gmail');
        if (disconnectGmailBtn) disconnectGmailBtn.addEventListener('click', handleGmailDisconnect);

        const disconnectExpiredBtn = $('#btn-disconnect-expired');
        if (disconnectExpiredBtn) disconnectExpiredBtn.addEventListener('click', handleGmailDisconnect);

        const sendTestEmailBtn = $('#btn-send-test-email');
        if (sendTestEmailBtn) sendTestEmailBtn.addEventListener('click', handleSendGmailTestEmail);

        const retryGmailStatusBtn = $('#btn-retry-gmail-status');
        if (retryGmailStatusBtn) retryGmailStatusBtn.addEventListener('click', loadGmailIntegrationStatus);

        const cancelConnectingBtn = $('#btn-cancel-connecting');
        if (cancelConnectingBtn) cancelConnectingBtn.addEventListener('click', loadGmailIntegrationStatus);

        // Modal Close buttons
        $$('.settings-modal-close, .btn-modal-cancel').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.settings-modal').forEach(m => m.style.display = 'none');
            });
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EXPOSE TO GLOBAL SCOPE
    // ─────────────────────────────────────────────────────────────────────────
    window.SettingsCtrl = {
        switchTab,
        saveAllSettings,
        resetToDefaults,
        promptDeleteFile,
        confirmDeleteFile,
        promptClearCache,
        confirmClearCache,
        initiateGmailOAuth,
        handleGmailDisconnect,
        loadGmailIntegrationStatus,
        closeModals: () => {
            $$('.settings-modal').forEach(m => m.style.display = 'none');
        }
    };

    console.log('✅ Settings controller loaded successfully with all modules.');
})();
