/**
 * BizVision Authentication, Session Management, Header Controls & Theme Toggle
 */

// Apply saved theme immediately before page render to prevent flicker
(function applyInitialTheme() {
    const savedTheme = localStorage.getItem("theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);
})();

// Immediate auth guard to prevent protected pages from firing unauthenticated API requests
(function guardProtectedRoutes() {
    const path = window.location.pathname;
    const isAuthPage = path.endsWith("login.html") || path.endsWith("signup.html") || path.endsWith("/login") || path.endsWith("/signup") || path.endsWith("/auth") || path === "/";
    const token = localStorage.getItem("session_token");
    if (!token && !isAuthPage) {
        window.location.href = "login.html";
    }
})();

// Helper to get stored auth token
function getAuthToken() {
    return localStorage.getItem("session_token");
}

// Helper to get stored user details
function getStoredUser() {
    const userStr = localStorage.getItem("user_info");
    try {
        return userStr ? JSON.parse(userStr) : null;
    } catch (e) {
        return null;
    }
}

// Theme Toggle Manager
let isThemeToggleInitialized = false;

function initThemeToggle() {
    const savedTheme = localStorage.getItem("theme") || "dark";
    setTheme(savedTheme);

    if (!isThemeToggleInitialized) {
        isThemeToggleInitialized = true;
        document.addEventListener("click", (e) => {
            const toggleBtn = e.target.closest("#floating-theme-toggle, .floating-theme-toggle, #header-theme-toggle-btn, .header-theme-toggle-btn, #theme-toggle-menu-btn, .theme-toggle-menu-btn");
            if (toggleBtn) {
                e.preventDefault();
                e.stopPropagation();
                toggleTheme();
            }
        });
    }
}

function toggleTheme() {
    const currentAttr = document.documentElement.getAttribute("data-theme");
    const hasDarkClass = document.body ? document.body.classList.contains("dark-mode") : false;
    const currentTheme = currentAttr === "dark" || hasDarkClass ? "dark" : "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
}

function setTheme(theme) {
    const targetTheme = theme === "dark" ? "dark" : "light";

    document.documentElement.setAttribute("data-theme", targetTheme);

    if (document.body) {
        if (targetTheme === "dark") {
            document.body.classList.add("dark-mode");
            document.body.classList.remove("light-mode");
        } else {
            document.body.classList.remove("dark-mode");
            document.body.classList.add("light-mode");
        }
    }
    localStorage.setItem("theme", targetTheme);

    // Update floating theme toggle buttons UI
    document.querySelectorAll("#floating-theme-toggle, .floating-theme-toggle").forEach(btn => {
        btn.innerHTML = targetTheme === "dark" 
            ? `<span>☀️</span> <span>Light Mode</span>` 
            : `<span>🌙</span> <span>Dark Mode</span>`;
        btn.setAttribute("aria-label", targetTheme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode");
        btn.setAttribute("title", targetTheme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode");
    });

    // Update header quick action theme toggle buttons UI
    document.querySelectorAll("#header-theme-toggle-btn, .header-theme-toggle-btn").forEach(btn => {
        btn.innerHTML = targetTheme === "dark" ? `<span>☀️</span>` : `<span>🌙</span>`;
        btn.setAttribute("aria-label", targetTheme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode");
        btn.setAttribute("title", targetTheme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode");
    });

    // Update profile dropdown menu theme toggle buttons UI
    document.querySelectorAll("#theme-toggle-menu-btn, .theme-toggle-menu-btn").forEach(btn => {
        btn.innerHTML = targetTheme === "dark" ? `☀️ Switch to Light Mode` : `🌙 Switch to Dark Mode`;
    });

    // Update settings checkboxes if present
    const darkCheckboxes = document.querySelectorAll("#dark-theme-toggle, #dark-mode-toggle, input[name='dark_mode']");
    darkCheckboxes.forEach(cb => {
        cb.checked = targetTheme === "dark";
    });

    // Broadcast themeChanged event
    window.dispatchEvent(new CustomEvent("themeChanged", { detail: { theme: targetTheme } }));
}
window.setTheme = setTheme;
window.toggleTheme = toggleTheme;

// Check session on page load
function checkAuthSession() {
    const path = window.location.pathname;
    const isAuthPage = path.endsWith("login.html") || path.endsWith("signup.html") || path.endsWith("/login") || path.endsWith("/signup") || path.endsWith("/auth") || path === "/";
    const token = getAuthToken();

    if (!token && !isAuthPage) {
        window.location.href = "login.html";
        return;
    }

    if (token && isAuthPage) {
        window.location.href = "index.html";
        return;
    }

    if (!isAuthPage) {
        initHeaderControls();
        highlightActiveNavLink();
        checkDatasetAccessAndRestrictNavigation();
    }
}

// Feature Access Restriction Manager (Inactive - all features open with direct upload and demo data)
const RESTRICTED_FEATURE_PAGES = [];

function showDatasetRestrictedModal(message = 'Please upload a dataset first to access this feature.', forceRedirect = false) {
    let existing = document.getElementById('dataset-restriction-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'dataset-restriction-modal';
    modal.innerHTML = `
        <div style="position: fixed; inset: 0; background: rgba(11, 15, 25, 0.82); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; z-index: 999999; padding: 20px;">
            <div style="background: linear-gradient(135deg, #1e293b, #0f172a); border: 1px solid rgba(129, 140, 248, 0.45); border-radius: 16px; padding: 32px 28px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 25px 60px rgba(0,0,0,0.7), 0 0 35px rgba(99,102,241,0.3); position: relative;">
                <div style="width: 68px; height: 68px; border-radius: 50%; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(129, 140, 248, 0.35); display: flex; align-items: center; justify-content: center; font-size: 32px; margin: 0 auto 16px;">
                    🔒
                </div>
                <h3 style="color: #f8fafc; font-size: 1.25rem; font-weight: 700; margin: 0 0 10px;">Upload Dataset Required</h3>
                <p style="color: #cbd5e1; font-size: 14.5px; line-height: 1.5; margin: 0 0 24px;">
                    ${message}
                </p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <a href="upload.html" id="modal-upload-btn" style="background: linear-gradient(135deg, #6366f1, #4f46e5); color: #ffffff; padding: 11px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 4px 15px rgba(79, 70, 229, 0.4); cursor: pointer;">
                        <span>📁</span> Upload Data Now
                    </a>
                    ${forceRedirect ? '' : `
                    <button type="button" id="close-restriction-modal-btn" style="background: rgba(51, 65, 85, 0.6); color: #94a3b8; border: 1px solid rgba(255,255,255,0.1); padding: 11px 20px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer;">
                        Dismiss
                    </button>
                    `}
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('#close-restriction-modal-btn');
    if (closeBtn) {
        closeBtn.onclick = () => modal.remove();
    }
}
window.showDatasetRestrictedModal = showDatasetRestrictedModal;

async function checkDatasetAccessAndRestrictNavigation() {
    const token = getAuthToken();
    if (!token) return;

    const currentPath = window.location.pathname.split("/").pop() || "index.html";

    // 1. Check local user state (active table or user dataset catalog)
    let hasDatasets = false;
    const user = getStoredUser();
    const userCatalogKey = user && user.id ? `bizvision_dataset_catalog_${user.id}` : null;
    let localDatasetsCount = 0;
    if (userCatalogKey) {
        try {
            const stored = JSON.parse(localStorage.getItem(userCatalogKey) || '[]');
            localDatasetsCount = Array.isArray(stored) ? stored.length : 0;
        } catch (e) {}
    }

    const currentTable = sessionStorage.getItem('currentTableName') || window.currentTableName;
    if (localDatasetsCount > 0 || (currentTable && String(currentTable).trim() !== '')) {
        hasDatasets = true;
    }

    // 2. Cross-check with backend API
    try {
        const apiBase = (window.API_BASE_URL || ((window.location.protocol === 'file:' || (window.location.port && window.location.port !== '8000')) ? 'http://127.0.0.1:8000/api' : '/api'));
        const res = await fetch(`${apiBase}/tables`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 401) {
            localStorage.removeItem("session_token");
            localStorage.removeItem("user_info");
            window.location.href = "login.html?expired=1";
            return;
        }
        if (res.ok) {
            const data = await res.json();
            const backendHasTables = Array.isArray(data.tables) && data.tables.length > 0;
            if (backendHasTables) {
                hasDatasets = true;
            } else if (localDatasetsCount === 0 && (!currentTable || String(currentTable).trim() === '')) {
                hasDatasets = false;
            }
        }
    } catch (e) {
        console.warn("Could not check dataset access via backend API, falling back to local state:", e);
    }

    // If on a restricted page without datasets, show popup and redirect
    if (!hasDatasets && RESTRICTED_FEATURE_PAGES.includes(currentPath)) {
        showDatasetRestrictedModal("Please upload a dataset first to access this feature.", true);
        setTimeout(() => {
            window.location.href = "upload.html";
        }, 2200);
        return;
    }

    // Update navigation links in sidebar
    const navLinks = document.querySelectorAll(".sidebar-nav a");
    navLinks.forEach(link => {
        const href = (link.getAttribute("href") || "").split("/").pop();
        if (RESTRICTED_FEATURE_PAGES.includes(href)) {
            if (!hasDatasets) {
                link.classList.add("nav-feature-locked");
                link.style.opacity = "0.55";
                link.style.cursor = "not-allowed";
                link.setAttribute("title", "Please upload a dataset first to access this feature.");
                
                // Add lock icon if not already added
                if (!link.querySelector(".nav-lock-indicator")) {
                    const lockBadge = document.createElement("span");
                    lockBadge.className = "nav-lock-indicator";
                    lockBadge.style.cssText = "margin-left: auto; font-size: 12px; opacity: 0.8;";
                    lockBadge.textContent = "🔒";
                    link.appendChild(lockBadge);
                }

                // Intercept clicks
                link.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    showDatasetRestrictedModal("Please upload a dataset first to access this feature.", false);
                };
            } else {
                link.classList.remove("nav-feature-locked");
                link.style.opacity = "";
                link.style.cursor = "";
                link.removeAttribute("title");
                const lockBadge = link.querySelector(".nav-lock-indicator");
                if (lockBadge) lockBadge.remove();
                link.onclick = null;
            }
        }
    });
}
window.checkDatasetAccessAndRestrictNavigation = checkDatasetAccessAndRestrictNavigation;
window.addEventListener("datasetChanged", () => checkDatasetAccessAndRestrictNavigation());
window.addEventListener("datasetUploaded", () => checkDatasetAccessAndRestrictNavigation());
window.addEventListener("storage", () => checkDatasetAccessAndRestrictNavigation());

// Automatically highlight active navigation link in sidebar
function highlightActiveNavLink() {
    const currentPath = window.location.pathname.split("/").pop() || "index.html";
    const navLinks = document.querySelectorAll(".sidebar-nav a");
    navLinks.forEach(link => {
        const href = link.getAttribute("href");
        if (href === currentPath || (currentPath === "" && href === "index.html")) {
            link.classList.add("active");
        } else {
            link.classList.remove("active");
        }
    });
}

// Header Controls (Mobile Menu, Dataset Selector, Profile, Notifications, Search)
function initHeaderControls() {
    const user = getStoredUser() || { username: "pawan", email: "pawan@bizvision.com" };

    // 1. Mobile Hamburger Toggle
    initMobileMenuToggle();

    // 2. Header Dataset Selector
    initHeaderDatasetSelector();

    // 3. Update Profile Elements
    const nameText = document.getElementById("header-username-text");
    const menuName = document.getElementById("menu-user-name");
    const menuEmail = document.getElementById("menu-user-email");
    const avatarInitial = document.getElementById("avatar-initial");
    const avatarImg = document.getElementById("avatar-img");

    if (nameText) nameText.textContent = user.username || "User";
    if (menuName) menuName.textContent = user.username || "User";
    if (menuEmail) menuEmail.textContent = user.email || "user@bizvision.com";

    const savedAvatar = localStorage.getItem("user_avatar") || user.avatar;
    if (savedAvatar && avatarImg) {
        avatarImg.src = savedAvatar;
        avatarImg.style.display = "inline-flex";
        if (avatarInitial) avatarInitial.style.display = "none";
    } else if (avatarInitial) {
        avatarInitial.textContent = (user.username || "P")[0].toUpperCase();
        if (avatarImg) avatarImg.style.display = "none";
    }

    // Profile Dropdown Toggle
    const profileBtn = document.getElementById("profile-btn");
    const profileMenu = document.getElementById("profile-dropdown-menu");
    if (profileBtn && profileMenu) {
        profileBtn.onclick = (e) => {
            e.stopPropagation();
            const isOpen = profileMenu.style.display === "block";
            closeAllDropdowns();
            profileMenu.style.display = isOpen ? "none" : "block";
        };
    }

    // 4. Notifications Center with persistent LocalStorage
    initNotificationCenter();

    // 5. Logout Action
    const logoutBtn = document.getElementById("logout-menu-btn");
    if (logoutBtn) {
        logoutBtn.onclick = () => logoutUser();
    }

    // 6. Primary Global Active Dataset Search Bar
    initDatasetGlobalSearch();

    // Close dropdowns on outside click
    document.addEventListener("click", () => closeAllDropdowns());
}

// Global Active Dataset Search Manager
function initDatasetGlobalSearch() {
    const searchInput = document.getElementById("dataset-search-input");
    const searchDropdown = document.getElementById("dataset-search-dropdown");
    const clearBtn = document.getElementById("dataset-search-clear-btn");
    if (!searchInput || !searchDropdown) return;

    let debounceTimer = null;
    let selectedIndex = -1;
    let currentSearchResults = [];

    // Update input placeholder to show current active dataset
    const updatePlaceholder = () => {
        const activeTable = sessionStorage.getItem("currentTableName");
        if (activeTable) {
            searchInput.setAttribute("placeholder", `Search anything in ${activeTable}... (Press '/' or Ctrl+K)`);
        } else {
            searchInput.setAttribute("placeholder", "Search dataset or select dataset... (Press '/' or Ctrl+K)");
        }
    };
    updatePlaceholder();

    // Keyboard shortcut: Ctrl+K or Cmd+K or /
    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
        } else if (e.key === "/" && document.activeElement !== searchInput && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
            e.preventDefault();
            searchInput.focus();
        }
    });

    if (clearBtn) {
        clearBtn.onclick = (e) => {
            e.stopPropagation();
            searchInput.value = "";
            clearBtn.style.display = "none";
            renderDatasetPickerState(searchDropdown);
            selectedIndex = -1;
            currentSearchResults = [];
        };
    }

    const handleSearchInput = () => {
        const query = searchInput.value.trim();
        if (clearBtn) clearBtn.style.display = query ? "block" : "none";

        if (!query) {
            renderDatasetPickerState(searchDropdown);
            selectedIndex = -1;
            currentSearchResults = [];
            return;
        }

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            let activeTable = sessionStorage.getItem("currentTableName");
            
            // Auto-select first available table if none set
            if (!activeTable && window.API && window.API.fetchTables) {
                try {
                    const tables = await window.API.fetchTables();
                    if (tables && tables.length > 0) {
                        activeTable = tables[0];
                        sessionStorage.setItem("currentTableName", activeTable);
                        updatePlaceholder();
                    }
                } catch (e) {
                    console.warn("Could not fetch default table for search:", e);
                }
            }

            if (!activeTable) {
                renderNoDatasetState(searchDropdown);
                return;
            }

            try {
                const searchRes = await window.API.searchDataset(activeTable, query, 8);
                currentSearchResults = searchRes.results || [];
                renderSearchResults(searchDropdown, query, activeTable, searchRes.total_matches, currentSearchResults);
            } catch (err) {
                console.error("Dataset search failed:", err);
                renderSearchErrorState(searchDropdown, activeTable);
            }
        }, 250);
    };

    searchInput.addEventListener("input", handleSearchInput);

    // Show dataset picker on focus if input is empty
    searchInput.addEventListener("focus", () => {
        if (!searchInput.value.trim()) {
            renderDatasetPickerState(searchDropdown);
        } else if (currentSearchResults.length > 0) {
            searchDropdown.style.display = "block";
        }
    });

    // Prevent search dropdown closing when clicking inside it
    searchDropdown.addEventListener("click", (e) => {
        e.stopPropagation();
    });

    // Keyboard Arrow navigation & Enter
    searchInput.addEventListener("keydown", (e) => {
        const items = searchDropdown.querySelectorAll(".dataset-search-item, .dataset-picker-item");
        if (searchDropdown.style.display === "none") return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (items.length > 0) {
                selectedIndex = (selectedIndex + 1) % items.length;
                updateItemSelection(items);
            }
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (items.length > 0) {
                selectedIndex = (selectedIndex - 1 + items.length) % items.length;
                updateItemSelection(items);
            }
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (selectedIndex >= 0 && items[selectedIndex]) {
                items[selectedIndex].click();
            } else if (currentSearchResults.length > 0) {
                showRecordModal(currentSearchResults[0], searchInput.value.trim());
            }
        } else if (e.key === "Escape") {
            searchDropdown.style.display = "none";
            searchInput.blur();
        }
    });

    function updateItemSelection(items) {
        items.forEach((item, idx) => {
            if (idx === selectedIndex) {
                item.classList.add("selected");
                item.scrollIntoView({ block: "nearest" });
            } else {
                item.classList.remove("selected");
            }
        });
    }

    // Clear & update search when Active Dataset changes
    window.addEventListener("datasetChanged", (e) => {
        updatePlaceholder();
        if (searchInput) searchInput.value = "";
        if (clearBtn) clearBtn.style.display = "none";
        if (searchDropdown) searchDropdown.style.display = "none";
        currentSearchResults = [];
    });
}

// Render Dataset Selection Menu inside Search Dropdown
async function renderDatasetPickerState(container) {
    let tables = [];
    try {
        if (window.API && window.API.fetchTables) {
            tables = await window.API.fetchTables();
        }
    } catch (e) {
        console.warn("Could not fetch dataset tables:", e);
    }

    const activeTable = sessionStorage.getItem("currentTableName");

    if (!tables || tables.length === 0) {
        container.innerHTML = `
            <div style="padding: 18px; text-align: center; color: #94a3b8; font-size: 13px;">
                <div style="font-size: 20px; margin-bottom: 6px;">📁</div>
                <div style="font-weight: 600; color: inherit;">No datasets uploaded yet</div>
                <div style="font-size: 11.5px; opacity: 0.8; margin-top: 4px;">
                    <a href="upload.html" style="color: #4f46e5; text-decoration: underline;">Click here to upload CSV dataset</a>
                </div>
            </div>`;
        container.style.display = "block";
        return;
    }

    let html = `
        <div class="search-dropdown-header" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: rgba(79,70,229,0.05); border-bottom: 1px solid rgba(226,232,240,0.8);">
            <strong style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #4f46e5;">Select Active Dataset</strong>
            <span style="font-size: 11px; opacity: 0.7;">${tables.length} available</span>
        </div>
        <div style="max-height: 260px; overflow-y: auto;">`;

    tables.forEach((t) => {
        const isActive = t === activeTable;
        html += `
            <div class="dataset-picker-item" data-table="${escapeHtml(t)}" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; cursor: pointer; border-bottom: 1px solid #f1f5f9; transition: background 0.15s ease;">
                <div style="display: flex; align-items: center; gap: 10px; flex: 1; overflow: hidden;">
                    <span style="font-size: 16px;">📊</span>
                    <span style="font-weight: ${isActive ? '700' : '500'}; font-size: 13px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(t)}</span>
                </div>
                ${isActive 
                    ? `<span style="background: #dcfce7; color: #166534; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px;">✓ Active</span>`
                    : `<button class="select-ds-btn" style="background: #e0e7ff; color: #4338ca; border: none; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 6px; cursor: pointer;">Select</button>`
                }
            </div>`;
    });

    html += `</div>
        <div style="padding: 8px 14px; font-size: 11px; color: #64748b; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
            Type in search bar to search across columns of active dataset
        </div>`;

    container.innerHTML = html;
    container.style.display = "block";

    // Attach click events to dataset items
    container.querySelectorAll(".dataset-picker-item").forEach((el) => {
        el.onclick = (e) => {
            e.stopPropagation();
            const selectedTable = el.getAttribute("data-table");
            if (!selectedTable) return;

            // Set as active dataset
            sessionStorage.setItem("currentTableName", selectedTable);

            // Sync all header/page select dropdowns
            document.querySelectorAll("#dataset-select, #header-dataset-select").forEach(selectEl => {
                selectEl.value = selectedTable;
            });

            // Dispatch datasetChanged event
            window.dispatchEvent(new CustomEvent("datasetChanged", { detail: { table: selectedTable } }));

            // Trigger reload/refresh if on page with dashboard data loader
            if (typeof window.loadDashboardData === "function") {
                window.loadDashboardData();
            } else if (window.location.pathname.endsWith("index.html") || window.location.pathname === "/") {
                window.location.reload();
            }

            container.style.display = "none";
        };
    });
}

function renderNoDatasetState(container) {
    container.innerHTML = `
        <div style="padding: 16px; text-align: center; color: #94a3b8; font-size: 13px;">
            ⚠️ No active dataset selected. Please upload or select a dataset first.
        </div>`;
    container.style.display = "block";
}

function renderSearchErrorState(container, activeTable) {
    container.innerHTML = `
        <div style="padding: 16px; text-align: center; color: #64748b; font-size: 13px;">
            <div style="color: #ef4444; font-weight: 600; margin-bottom: 6px;">❌ Could not search active dataset "${escapeHtml(activeTable || '')}"</div>
            <div style="font-size: 12px; margin-bottom: 10px;">Please check if the backend server is active or try selecting another dataset.</div>
            <button onclick="renderDatasetPickerState(document.getElementById('dataset-search-dropdown'))" style="background: #4f46e5; color: white; border: none; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 12px; cursor: pointer;">
                🔄 Select / Switch Dataset
            </button>
        </div>`;
    container.style.display = "block";
}

function renderSearchResults(container, query, tableName, totalMatches, results) {
    if (!results || results.length === 0) {
        container.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #64748b;">
                <div style="font-weight: 600; font-size: 14px; color: inherit; margin-bottom: 4px;">No matching records found</div>
                <div style="font-size: 12px; opacity: 0.8;">Try searching by customer, product, category, date, ID, etc.</div>
            </div>`;
    } else {
        const queryClean = escapeHtml(query);
        let html = `<div class="search-dropdown-header">Search Results (${totalMatches})</div>`;

        results.forEach((item, i) => {
            const valStr = escapeHtml(item.value);
            const colStr = escapeHtml(item.column);
            const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            const highlightedVal = valStr.replace(regex, `<span class="search-val-highlight">$1</span>`);

            html += `
                <div class="dataset-search-item" data-index="${i}">
                    <span style="font-size: 16px;">🔎</span>
                    <div style="flex: 1; overflow: hidden; text-overflow: ellipsis;">
                        <div style="font-weight: 600; font-size: 13.5px;">${highlightedVal}</div>
                        <div style="font-size: 11.5px; opacity: 0.75; margin-top: 2px;">${colStr} • Row ${item.row_index}</div>
                    </div>
                </div>`;
        });

        if (totalMatches > results.length) {
            html += `<div class="search-dropdown-footer" id="view-all-results-btn">View all results (${totalMatches})</div>`;
        }

        container.innerHTML = html;

        // Attach click handlers to items
        container.querySelectorAll(".dataset-search-item").forEach((el) => {
            el.onclick = (e) => {
                e.stopPropagation();
                const idx = parseInt(el.getAttribute("data-index"));
                showRecordModal(results[idx], query);
                container.style.display = "none";
            };
        });

        const viewAllBtn = container.querySelector("#view-all-results-btn");
        if (viewAllBtn) {
            viewAllBtn.onclick = (e) => {
                e.stopPropagation();
                showRecordModal(results[0], query, totalMatches);
                container.style.display = "none";
            };
        }
    }

    container.style.display = "block";
}

// Record Detail Modal View
function showRecordModal(resultItem, query, totalMatches = 1) {
    if (!resultItem || !resultItem.record) return;

    let backdrop = document.getElementById("dataset-record-modal-backdrop");
    if (!backdrop) {
        backdrop = document.createElement("div");
        backdrop.id = "dataset-record-modal-backdrop";
        backdrop.className = "dataset-record-modal-backdrop";
        document.body.appendChild(backdrop);
    }

    const activeTable = sessionStorage.getItem("currentTableName") || "Active Dataset";
    const record = resultItem.record;
    const queryRegex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');

    let gridHtml = "";
    Object.entries(record).forEach(([key, val]) => {
        const strVal = val === null || val === undefined ? '—' : String(val);
        const escapedKey = escapeHtml(key);
        const escapedVal = escapeHtml(strVal);
        const formattedVal = escapedVal.replace(queryRegex, `<span class="search-val-highlight">$1</span>`);

        gridHtml += `
            <div class="record-field-card">
                <div class="record-field-label">${escapedKey}</div>
                <div class="record-field-value">${formattedVal}</div>
            </div>`;
    });

    backdrop.innerHTML = `
        <div class="dataset-record-modal">
            <div class="record-modal-header">
                <div>
                    <h3 style="margin: 0; font-size: 16px; font-weight: 700;">Record Details (Row ${resultItem.row_index})</h3>
                    <div style="font-size: 12px; opacity: 0.75; margin-top: 2px;">Dataset: ${escapeHtml(activeTable)} ${totalMatches > 1 ? `• Match 1 of ${totalMatches}` : ''}</div>
                </div>
                <button type="button" id="close-record-modal-btn" style="background: none; border: none; font-size: 20px; cursor: pointer; color: inherit; padding: 4px 8px; line-height: 1;">✕</button>
            </div>
            <div class="record-modal-body">
                <div class="record-modal-grid">
                    ${gridHtml}
                </div>
            </div>
        </div>`;

    backdrop.classList.add("show");

    const closeBtn = document.getElementById("close-record-modal-btn");
    if (closeBtn) {
        closeBtn.onclick = () => backdrop.classList.remove("show");
    }

    backdrop.onclick = (e) => {
        if (e.target === backdrop) {
            backdrop.classList.remove("show");
        }
    };
}

function initMobileMenuToggle() {
    const mobileBtn = document.getElementById("mobile-menu-btn");
    const sidebar = document.querySelector(".sidebar-nav");
    if (!sidebar) return;

    // Create backdrop overlay if not present
    let overlay = document.getElementById("mobile-sidebar-overlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "mobile-sidebar-overlay";
        overlay.className = "mobile-sidebar-overlay";
        document.body.appendChild(overlay);
    }

    const toggleSidebar = (show) => {
        const isOpening = show !== undefined ? show : !sidebar.classList.contains("open");
        if (isOpening) {
            sidebar.classList.add("open");
            overlay.classList.add("show");
        } else {
            sidebar.classList.remove("open");
            overlay.classList.remove("show");
        }
    };

    if (mobileBtn) {
        mobileBtn.onclick = (e) => {
            e.stopPropagation();
            toggleSidebar();
        };
    }

    overlay.onclick = () => toggleSidebar(false);
}

// Active Dataset Selector in Header
async function initHeaderDatasetSelector() {
    const headerSelect = document.getElementById("header-dataset-select");
    if (!headerSelect) return;

    let datasets = [];
    try {
        if (window.API && typeof window.API.fetchUserDatasets === "function") {
            datasets = await window.API.fetchUserDatasets();
        } else if (window.API && typeof window.API.fetchTables === "function") {
            const tables = await window.API.fetchTables();
            datasets = (tables || []).map(t => ({ dataset_id: t, filename: t }));
        }
    } catch (e) {
        console.warn("Could not fetch datasets for header selector:", e);
    }

    let currentTable = sessionStorage.getItem("currentTableName") || localStorage.getItem("currentTableName");

    if (Array.isArray(datasets) && datasets.length > 0) {
        const datasetIds = datasets.map(d => d.dataset_id || d);
        if (!currentTable || !datasetIds.includes(currentTable)) {
            currentTable = datasetIds[0];
            sessionStorage.setItem("currentTableName", currentTable);
            localStorage.setItem("currentTableName", currentTable);
            window.currentTableName = currentTable;
        }
        headerSelect.innerHTML = datasets.map(d => {
            const id = d.dataset_id || d;
            const name = d.filename || d.original_filename || id;
            const rows = d.row_count ? ` (${Number(d.row_count).toLocaleString()} rows)` : '';
            return `<option value="${id}" ${id === currentTable ? "selected" : ""}>${name}${rows}</option>`;
        }).join("");
    } else {
        currentTable = "";
        sessionStorage.removeItem("currentTableName");
        localStorage.removeItem("currentTableName");
        window.currentTableName = "";
        headerSelect.innerHTML = `<option value="">No dataset available</option>`;
    }

    headerSelect.onchange = (e) => {
        const newTable = e.target.value;
        sessionStorage.setItem("currentTableName", newTable);
        localStorage.setItem("currentTableName", newTable);
        localStorage.setItem("active_dataset_id", newTable);
        window.currentTableName = newTable;
        
        // Also update any page-level dataset select element if present
        const pageDropdowns = document.querySelectorAll("#dataset-select, #fc-dataset-select, #dm-dataset-select");
        pageDropdowns.forEach(selectEl => {
            selectEl.value = newTable;
        });

        // Trigger custom event so page controllers (main.js, forecast, compare) can refresh data reactively
        window.dispatchEvent(new CustomEvent("datasetChanged", { detail: { table: newTable, tableName: newTable } }));

        // Refresh dashboard or forecast if function available
        if (typeof window.loadDashboardData === "function") {
            window.loadDashboardData();
        }
    };
}

// Dynamic Notifications Center
function initNotificationCenter() {
    const notifBtn = document.getElementById("notif-btn");
    const notifMenu = document.getElementById("notif-dropdown-menu");
    const notifBadge = document.getElementById("notif-badge-count");
    const clearNotifBtn = document.getElementById("clear-notif-btn");
    const container = document.getElementById("notif-items-container");

    if (!notifBtn || !notifMenu) return;

    // Default notifications
    const defaultNotifs = [
        { id: 1, icon: "📊", title: "Dataset Auto-Cleaned", desc: "Imputation & schema check passed", page: "upload.html", read: false },
        { id: 2, icon: "🔮", title: "Forecast Model Ready", desc: "ARIMA model trained with 95% confidence", page: "forecast.html", read: false },
        { id: 3, icon: "📄", title: "Report Generated", desc: "Executive summary CSV export complete", page: "reports.html", read: false }
    ];

    let storedNotifs = localStorage.getItem("bizvision_notifications");
    let notifications = storedNotifs ? JSON.parse(storedNotifs) : defaultNotifs;

    function renderNotifications() {
        const unreadCount = notifications.filter(n => !n.read).length;

        if (notifBadge) {
            if (unreadCount > 0) {
                notifBadge.textContent = unreadCount;
                notifBadge.style.display = "flex";
            } else {
                notifBadge.style.display = "none";
            }
        }

        if (container) {
            if (notifications.length === 0) {
                container.innerHTML = `<div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 13px;">No unread notifications</div>`;
            } else {
                container.innerHTML = notifications.map(n => `
                    <div class="search-result-item notif-item ${n.read ? 'read' : ''}" data-id="${n.id}" data-page="${n.page}" style="cursor: pointer; position: relative;">
                        <span style="font-size: 18px;">${n.icon}</span>
                        <div style="flex: 1;">
                            <div style="font-weight: 600; font-size: 13px; color: ${n.read ? '#64748b' : 'inherit'};">${n.title}</div>
                            <div style="font-size: 11px; opacity: 0.75;">${n.desc}</div>
                        </div>
                        ${!n.read ? '<span style="width: 7px; height: 7px; border-radius: 50%; background: #6366f1; display: inline-block; flex-shrink: 0;"></span>' : ''}
                    </div>
                `).join("");

                // Click event on notification item
                container.querySelectorAll(".notif-item").forEach(item => {
                    item.onclick = (e) => {
                        e.stopPropagation();
                        const id = parseInt(item.getAttribute("data-id"));
                        const targetPage = item.getAttribute("data-page");

                        // Mark item as read
                        notifications = notifications.map(n => n.id === id ? { ...n, read: true } : n);
                        localStorage.setItem("bizvision_notifications", JSON.stringify(notifications));
                        renderNotifications();

                        if (targetPage && !window.location.pathname.endsWith(targetPage)) {
                            window.location.href = targetPage;
                        }
                    };
                });
            }
        }
    }

    renderNotifications();

    notifBtn.onclick = (e) => {
        e.stopPropagation();
        const isOpen = notifMenu.style.display === "block";
        closeAllDropdowns();
        notifMenu.style.display = isOpen ? "none" : "block";
    };

    if (clearNotifBtn) {
        clearNotifBtn.onclick = (e) => {
            e.stopPropagation();
            notifications = notifications.map(n => ({ ...n, read: true }));
            localStorage.setItem("bizvision_notifications", JSON.stringify(notifications));
            renderNotifications();
        };
    }
}

function closeAllDropdowns() {
    const pMenu = document.getElementById("profile-dropdown-menu");
    const nMenu = document.getElementById("notif-dropdown-menu");
    const sMenu = document.getElementById("search-dropdown");
    if (pMenu) pMenu.style.display = "none";
    if (nMenu) nMenu.style.display = "none";
    if (sMenu) sMenu.style.display = "none";
}

// Live Search with Keyboard Navigation
async function initHeaderSearch() {
    const searchInput = document.getElementById("header-search-input");
    const searchDropdown = document.getElementById("search-dropdown");
    const shortcutBadge = document.querySelector(".search-shortcut");
    const clearBtn = document.getElementById("search-clear-btn");
    if (!searchInput || !searchDropdown) return;

    const pages = [
        { name: "Dashboard Overview", url: "index.html", icon: "📊", desc: "Main KPI metrics & revenue summary" },
        { name: "Upload Dataset", url: "upload.html", icon: "📁", desc: "Import CSV dataset & auto-clean" },
        { name: "Forecasting & ML Models", url: "forecast.html", icon: "🔮", desc: "ARIMA & ML sales prediction" },
        { name: "Compare Datasets", url: "compare.html", icon: "⚖️", desc: "Side-by-side metric comparison" },
        { name: "AI Insights & Assistant", url: "insights.html", icon: "💡", desc: "Automated business intelligence & Q&A" },
        { name: "Report Center", url: "reports.html", icon: "📄", desc: "Generate & export PDF/CSV reports" },
        { name: "My Profile", url: "profile.html", icon: "👤", desc: "Manage profile, avatar & credentials" },
        { name: "Settings & Preferences", url: "settings.html", icon: "⚙️", desc: "System, theme & alert settings" }
    ];

    let userTables = [];
    try {
        if (window.API && window.API.fetchTables) {
            userTables = await window.API.fetchTables();
        }
    } catch (e) {}

    let selectedIndex = -1;

    // Keyboard shortcut Ctrl+K or /
    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "k") {
            e.preventDefault();
            searchInput.focus();
        } else if (e.key === "/" && document.activeElement !== searchInput && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
            e.preventDefault();
            searchInput.focus();
        }
    });

    if (clearBtn) {
        clearBtn.onclick = (e) => {
            e.stopPropagation();
            searchInput.value = "";
            clearBtn.style.display = "none";
            if (shortcutBadge) shortcutBadge.style.display = "inline-block";
            searchDropdown.style.display = "none";
            selectedIndex = -1;
        };
    }

    const performSearch = () => {
        const query = searchInput.value.trim().toLowerCase();

        if (clearBtn) clearBtn.style.display = query ? "block" : "none";
        if (shortcutBadge) shortcutBadge.style.display = query ? "none" : "inline-block";

        if (!query) {
            searchDropdown.style.display = "none";
            selectedIndex = -1;
            return;
        }

        const matchedPages = pages.filter(p => p.name.toLowerCase().includes(query) || p.desc.toLowerCase().includes(query));
        const matchedTables = userTables.filter(t => t.toLowerCase().includes(query));

        if (matchedPages.length === 0 && matchedTables.length === 0) {
            searchDropdown.innerHTML = `<div style="padding: 16px; text-align: center; color: #94a3b8; font-size: 13px;">No matching results for "<strong>${escapeHtml(query)}</strong>"</div>`;
        } else {
            let html = "";
            matchedPages.forEach((p, i) => {
                html += `
                    <a href="${p.url}" class="search-result-item" data-index="${i}">
                        <span style="font-size: 18px;">${p.icon}</span>
                        <div>
                            <div style="font-weight: 600;">${p.name}</div>
                            <div style="font-size: 11px; opacity: 0.7;">${p.desc}</div>
                        </div>
                    </a>`;
            });
            matchedTables.forEach((t, i) => {
                const idx = matchedPages.length + i;
                html += `
                    <a href="index.html" class="search-result-item" data-index="${idx}" onclick="sessionStorage.setItem('currentTableName', '${t}')">
                        <span style="font-size: 18px;">📁</span>
                        <div>
                            <div style="font-weight: 600;">${t}</div>
                            <div style="font-size: 11px; opacity: 0.7;">Uploaded Dataset (Click to open)</div>
                        </div>
                    </a>`;
            });
            searchDropdown.innerHTML = html;
        }

        searchDropdown.style.display = "block";
        selectedIndex = -1;
    };

    searchInput.addEventListener("input", performSearch);

    searchInput.addEventListener("focus", () => {
        if (searchInput.value.trim()) {
            performSearch();
        }
    });

    // Keyboard navigation (Up/Down/Enter/Escape)
    searchInput.addEventListener("keydown", (e) => {
        const items = searchDropdown.querySelectorAll(".search-result-item");
        if (!items.length || searchDropdown.style.display === "none") return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % items.length;
            updateSelection(items);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            selectedIndex = (selectedIndex - 1 + items.length) % items.length;
            updateSelection(items);
        } else if (e.key === "Enter" && selectedIndex >= 0) {
            e.preventDefault();
            items[selectedIndex].click();
        } else if (e.key === "Escape") {
            searchDropdown.style.display = "none";
            searchInput.blur();
        }
    });

    function updateSelection(items) {
        items.forEach((item, index) => {
            if (index === selectedIndex) {
                item.classList.add("selected");
                item.scrollIntoView({ block: "nearest" });
            } else {
                item.classList.remove("selected");
            }
        });
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
    }
}

// Perform logout
async function logoutUser() {
    const token = getAuthToken();
    try {
        if (token) {
            const apiBase = (window.API_BASE_URL || ((window.location.protocol === 'file:' || (window.location.port && window.location.port !== '8000')) ? 'http://127.0.0.1:8000/api' : '/api'));
            await fetch(`${apiBase}/logout`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` }
            });
        }
    } catch (e) {
        console.warn("Logout API call warning:", e);
    } finally {
        const theme = localStorage.getItem("theme") || "dark";
        localStorage.clear();
        localStorage.setItem("theme", theme);
        sessionStorage.clear();
        window.currentTableName = null;
        window.location.href = "login.html";
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Global Project Settings Synchronizer across all pages
// ─────────────────────────────────────────────────────────────────────────
function applyGlobalProjectSettings() {
    // 1. Language & i18n
    const lang = localStorage.getItem('bizvision_language') || 'en';
    const dicts = {
        en: {
            dashboard: 'Dashboard', upload: 'Upload Data',
            forecast: 'Forecasting', compare: 'Compare Dataset', insights: 'AI Insight',
            reports: 'Report', profile: 'My Profile', settings: 'Settings'
        },
        hi: {
            dashboard: 'डैशबोर्ड', upload: 'डेटा अपलोड',
            forecast: 'पूर्वानुमान', compare: 'डेटासेट तुलना', insights: 'एआई अंतर्दृष्टि',
            reports: 'रिपोर्ट', profile: 'मेरी प्रोफ़ाइल', settings: 'सेटिंग्स'
        },
        es: {
            dashboard: 'Panel de Control', upload: 'Subir Datos',
            forecast: 'Pronósticos', compare: 'Comparar Datos', insights: 'Perspectivas IA',
            reports: 'Informe', profile: 'Mi Perfil', settings: 'Ajustes'
        },
        fr: {
            dashboard: 'Tableau de bord', upload: 'Téléverser',
            forecast: 'Prévisions', compare: 'Comparer Données', insights: 'Aperçus IA',
            reports: 'Rapport', profile: 'Mon Profil', settings: 'Paramètres'
        },
        de: {
            dashboard: 'Übersicht', upload: 'Daten hochladen',
            forecast: 'Prognosen', compare: 'Datensätze vergleichen', insights: 'KI-Erkenntnisse',
            reports: 'Bericht', profile: 'Mein Profil', settings: 'Einstellungen'
        }
    };
    const currentDict = dicts[lang] || dicts.en;
    document.querySelectorAll('.sidebar-nav a').forEach(a => {
        const href = a.getAttribute('href') || '';
        const labelEl = a.querySelector('.nav-label');
        if (!labelEl) return;
        if (href.includes('index.html')) labelEl.textContent = currentDict.dashboard;
        else if (href.includes('upload.html')) labelEl.textContent = currentDict.upload;
        else if (href.includes('forecast.html')) labelEl.textContent = currentDict.forecast;
        else if (href.includes('compare.html')) labelEl.textContent = currentDict.compare;
        else if (href.includes('insights.html')) labelEl.textContent = currentDict.insights;
        else if (href.includes('reports.html')) labelEl.textContent = currentDict.reports;
        else if (href.includes('profile.html')) labelEl.textContent = currentDict.profile;
        else if (href.includes('settings.html')) labelEl.textContent = currentDict.settings;
    });

    // 2. Default Rows Per Page
    const rowsPerPage = localStorage.getItem('bizvision_rows_per_page');
    if (rowsPerPage) {
        document.querySelectorAll('#preview-page-size, #preview-size-select, .table-select-page-size').forEach(sel => {
            if ([...sel.options].some(o => o.value === String(rowsPerPage))) {
                sel.value = String(rowsPerPage);
            }
        });
    }

    // 3. Report Branding Watermark (applied globally to reports and exports)
    const brandingStr = localStorage.getItem('bizvision_branding');
    if (brandingStr) {
        try {
            const branding = JSON.parse(brandingStr);
            if (branding && branding.image) {
                const reportWrappers = document.querySelectorAll('.report-preview-sheet, .report-content-container, #report-preview-canvas, #branding-report-preview-canvas');
                reportWrappers.forEach(el => {
                    el.style.backgroundImage = `url("${branding.image}")`;
                    el.style.backgroundRepeat = branding.position === 'tiled' ? 'repeat' : 'no-repeat';
                    el.style.backgroundPosition = branding.position === 'top-right' ? 'top 15px right 15px' : 'center center';
                    el.style.backgroundSize = branding.size === 'fill' ? 'cover' : (branding.position === 'top-right' ? '120px auto' : 'contain');
                });
            }
        } catch (e) {}
    }
}
window.applyGlobalProjectSettings = applyGlobalProjectSettings;

// Run check, theme, and global settings on DOM ready
document.addEventListener("DOMContentLoaded", () => {
    checkAuthSession();
    initThemeToggle();
    applyGlobalProjectSettings();
});

