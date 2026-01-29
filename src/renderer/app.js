// Elements
const tabsContainer = document.getElementById('tabs-container');
const newTabBtn = document.getElementById('new-tab-btn');
const webviewContainer = document.getElementById('webview-container');
const addressBar = document.getElementById('address-bar');
const menuBtn = document.getElementById('menu-btn');
const menuDropdown = document.getElementById('menu-dropdown');
const backBtn = document.getElementById('back-btn');
const forwardBtn = document.getElementById('forward-btn');
const reloadBtn = document.getElementById('reload-btn');
const bookmarkBtn = document.getElementById('bookmark-btn');
const adBlockBtn = document.getElementById('adblock-btn');
const adBlockCount = document.getElementById('adblock-count');

// Tab Management
let tabs = [];
let activeTabId = null;
let tabIdCounter = 0;
let adBlockEnabled = true;
let totalAdsBlocked = 0;

// Settings Management
let currentSettings = {};

// Load settings on startup
async function loadAppSettings() {
    if (window.electronAPI && window.electronAPI.loadSettings) {
        try {
            const settings = await window.electronAPI.loadSettings();
            if (settings) {
                currentSettings = settings;
                applySettings(settings);
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    }
}

// Listen for settings updates
if (window.electronAPI && window.electronAPI.onSettingsUpdated) {
    window.electronAPI.onSettingsUpdated((settings) => {
        currentSettings = settings;
        applySettings(settings);
    });
}

function applySettings(settings) {
    // Apply Theme to browser UI
    if (settings.theme) {
        document.documentElement.dataset.theme = settings.theme;

        // Force color scheme on all webviews
        const colorScheme = settings.theme === 'light' ? 'light' : 'dark';
        tabs.forEach(tab => {
            if (tab.webview) {
                try {
                    tab.webview.insertCSS(`:root { color-scheme: ${colorScheme}; }`);
                } catch (e) {
                    // Webview might not be ready
                }
            }
        });
    }

    // Apply Accent Color
    if (settings.accentColor) {
        document.documentElement.style.setProperty('--accent', settings.accentColor);
        // Calculate hover color (slightly darker)
        document.documentElement.style.setProperty('--accent-hover', settings.accentColor + 'dd');
    }

    // Apply Compact Mode
    if (settings.compactMode !== undefined) {
        document.body.classList.toggle('compact-mode', settings.compactMode);
    }

    // Apply Font Size to webviews
    if (settings.fontSize) {
        const fontSizes = {
            'small': '14px',
            'medium': '16px',
            'large': '18px',
            'x-large': '20px'
        };
        const size = fontSizes[settings.fontSize] || '16px';
        tabs.forEach(tab => {
            if (tab.webview) {
                try {
                    tab.webview.insertCSS(`html { font-size: ${size} !important; }`);
                } catch (e) {
                    // Webview might not be ready
                }
            }
        });
    }

    // Apply Default Zoom to webviews
    if (settings.defaultZoom) {
        const zoom = parseFloat(settings.defaultZoom) || 1;
        tabs.forEach(tab => {
            if (tab.webview) {
                try {
                    tab.webview.setZoomFactor(zoom);
                } catch (e) {
                    // Webview might not be ready
                }
            }
        });
    }

    // Apply Bookmarks Bar visibility
    const bookmarksBar = document.getElementById('bookmarks-bar');
    if (bookmarksBar) {
        bookmarksBar.style.display = settings.showBookmarksBar ? 'flex' : 'none';
    }
}

// Initialize
loadAppSettings();

// Listen for tabs transferred from other windows
if (window.electronAPI && window.electronAPI.onAddTab) {
    window.electronAPI.onAddTab((data) => {
        // Create a new tab with the transferred URL
        createTab(data.url, data.title || 'New Tab');
    });
}

// Listen for keyboard shortcuts from main process
if (window.electronAPI && window.electronAPI.onShortcut) {
    window.electronAPI.onShortcut((action) => {
        switch (action) {
            case 'new-tab':
                createTab();
                break;
            case 'close-tab':
                if (activeTabId) closeTab(activeTabId);
                break;
            case 'focus-address-bar':
                addressBar.focus();
                addressBar.select();
                break;
            case 'reload':
                const wv = getActiveWebview();
                if (wv) wv.reload();
                break;
            case 'hard-reload':
                const wvHard = getActiveWebview();
                if (wvHard) wvHard.reloadIgnoringCache();
                break;
            case 'back':
                const wvBack = getActiveWebview();
                if (wvBack && wvBack.canGoBack()) wvBack.goBack();
                break;
            case 'forward':
                const wvFwd = getActiveWebview();
                if (wvFwd && wvFwd.canGoForward()) wvFwd.goForward();
                break;
            case 'devtools':
                const wvDev = getActiveWebview();
                if (wvDev) wvDev.openDevTools();
                break;
            case 'history':
                showHistoryPanel();
                break;
            case 'bookmarks':
                showBookmarksPanel();
                break;
            case 'bookmark-page':
                toggleBookmark();
                break;
            case 'downloads':
                showDownloadsPanel();
                break;
            case 'find':
                showFindBar();
                break;
            case 'escape':
                hideFindBar();
                break;
            case 'show-clear-data':
                showClearDataModal();
                break;
        }
    });
}

function createTab(url, title = 'New Tab') {
    // Use local homepage for new tabs, or configured URL if set
    if (!url) {
        // Check if user has a custom newtab URL set, otherwise use our homepage
        const customUrl = currentSettings.newtabUrl;
        if (customUrl && customUrl !== '' && customUrl !== 'aegis://newtab' && !customUrl.includes('google.com')) {
            url = customUrl;
        } else {
            // Use local newtab.html - get directory of current page
            const currentHref = window.location.href;
            const lastSlash = currentHref.lastIndexOf('/');
            const basePath = currentHref.substring(0, lastSlash + 1);
            url = basePath + 'newtab.html';
        }
    }
    const tabId = ++tabIdCounter;

    // Create tab element
    const tabEl = document.createElement('div');
    tabEl.className = 'tab';
    tabEl.dataset.tabId = tabId;
    tabEl.draggable = true; // Make tab draggable
    tabEl.innerHTML = `
        <img class="tab-favicon" src="" alt="">
        <span class="tab-title">${title}</span>
        <div class="tab-loading hidden"></div>
        <button class="tab-close" title="Close Tab (Ctrl+W)">×</button>
    `;

    // Create webview - uses app-level user agent automatically
    const webview = document.createElement('webview');
    webview.id = `webview-${tabId}`;
    webview.src = url;
    webview.setAttribute('autosize', 'on');
    webview.setAttribute('partition', 'persist:aegis'); // Persistent session for cookies
    webview.setAttribute('allowpopups', ''); // Allow popups
    webview.setAttribute('webpreferences', 'contextIsolation=yes, allowRunningInsecureContent=yes');

    // Store tab data
    tabs.push({ id: tabId, tabEl, webview, title: title });

    // Add to DOM
    tabsContainer.appendChild(tabEl);
    webviewContainer.appendChild(webview);

    // Set up webview events
    setupWebviewEvents(tabId, webview);

    // Set up tab drag events
    setupTabDrag(tabId, tabEl);

    // Switch to new tab
    switchToTab(tabId);

    return tabId;
}

function switchToTab(tabId) {
    // Deactivate all tabs
    tabs.forEach(tab => {
        tab.tabEl.classList.remove('active');
        tab.webview.classList.remove('active');
    });

    // Activate selected tab
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
        tab.tabEl.classList.add('active');
        tab.webview.classList.add('active');
        activeTabId = tabId;

        // Update address bar
        let currentUrl = '';
        try {
            currentUrl = tab.webview.getURL() || '';
            addressBar.value = currentUrl;
        } catch (e) {
            currentUrl = tab.webview.src || '';
            addressBar.value = currentUrl;
        }

        updateNavButtons();
        updateBookmarkButton();
        updateHttpsIndicator(currentUrl);
    }
}

function closeTab(tabId) {
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;

    const tab = tabs[tabIndex];

    // Remove from DOM
    tab.tabEl.remove();
    tab.webview.remove();

    // Remove from array
    tabs.splice(tabIndex, 1);

    // If closing active tab, switch to another
    if (activeTabId === tabId && tabs.length > 0) {
        const newIndex = Math.min(tabIndex, tabs.length - 1);
        switchToTab(tabs[newIndex].id);
    }

    // If no tabs left, create a new one
    if (tabs.length === 0) {
        createTab();
    }
}

function getActiveWebview() {
    const tab = tabs.find(t => t.id === activeTabId);
    return tab ? tab.webview : null;
}

// ========================
// Tab Drag & Drop
// ========================
let draggedTab = null;
let draggedTabId = null;
let dragStartX = 0;
let dragStartY = 0;
let lastDragX = 0;
let lastDragY = 0;
let isDraggingOutside = false;

// Track mouse position during drag (dragend often has 0,0 coordinates when outside window)
document.addEventListener('dragover', (e) => {
    if (draggedTab) {
        lastDragX = e.screenX;
        lastDragY = e.screenY;
    }
});

// Detect when drag leaves the document (going outside window)
document.addEventListener('dragleave', (e) => {
    if (draggedTab) {
        // Check if leaving the document entirely
        if (e.clientX <= 0 || e.clientX >= window.innerWidth ||
            e.clientY <= 0 || e.clientY >= window.innerHeight) {
            isDraggingOutside = true;
        }
    }
});

function setupTabDrag(tabId, tabEl) {
    tabEl.addEventListener('dragstart', (e) => {
        // Don't drag if clicking close button
        if (e.target.classList.contains('tab-close')) {
            e.preventDefault();
            return;
        }

        draggedTab = tabEl;
        draggedTabId = tabId;
        dragStartX = e.screenX;
        dragStartY = e.screenY;
        lastDragX = e.screenX;
        lastDragY = e.screenY;
        isDraggingOutside = false;

        // Set drag data
        const tab = tabs.find(t => t.id === tabId);
        const url = tab?.webview?.getURL?.() || tab?.webview?.src || '';
        const title = tab?.title || 'New Tab';

        e.dataTransfer.setData('text/plain', url);
        e.dataTransfer.setData('application/x-tab-id', String(tabId));
        e.dataTransfer.effectAllowed = 'move';

        // Add dragging class for visual feedback
        setTimeout(() => {
            tabEl.classList.add('dragging');
        }, 0);
    });

    tabEl.addEventListener('dragend', async (e) => {
        tabEl.classList.remove('dragging');

        // Use last known position if dragend reports 0,0 (common when dropping outside)
        const dropX = e.screenX !== 0 ? e.screenX : lastDragX;
        const dropY = e.screenY !== 0 ? e.screenY : lastDragY;

        // Check if dragged outside the window
        const windowBounds = await window.electronAPI?.getWindowBounds?.();



        if (windowBounds && draggedTabId) {
            const isOutsideX = dropX < windowBounds.x || dropX > windowBounds.x + windowBounds.width;
            const isOutsideY = dropY < windowBounds.y || dropY > windowBounds.y + windowBounds.height;



            // Check if outside using either position calculation or the dragleave flag
            const isOutside = isOutsideX || isOutsideY || isDraggingOutside;

            if (isOutside) {
                // Get tab data before closing
                const tab = tabs.find(t => t.id === draggedTabId);
                if (tab) {
                    const url = tab.webview?.getURL?.() || tab.webview?.src || 'https://www.google.com';
                    const title = tab.title || 'New Tab';

                    // Check if dropping on another Aegis window
                    let targetWindow = null;
                    if (window.electronAPI?.getAllWindowIds) {
                        const otherWindows = await window.electronAPI.getAllWindowIds();

                        // Find if drop position is within another window's bounds
                        for (const win of otherWindows) {
                            const b = win.bounds;
                            if (dropX >= b.x && dropX <= b.x + b.width &&
                                dropY >= b.y && dropY <= b.y + b.height) {
                                targetWindow = win;
                                break;
                            }
                        }
                    }

                    if (targetWindow && window.electronAPI?.addTabToWindow) {
                        // Transfer tab to existing window
                        const result = await window.electronAPI.addTabToWindow({
                            targetWindowId: targetWindow.id,
                            url: url,
                            title: title
                        });

                        if (result?.success) {
                            if (tabs.length === 1) {
                                // This is the last tab, close the window
                                window.electronAPI?.closeWindow();
                            } else {
                                // Close the tab in current window
                                closeTab(draggedTabId);
                            }
                        }
                    } else if (tabs.length > 1 && window.electronAPI?.createWindowWithUrl) {
                        // Only create new window if more than 1 tab (don't lose last tab)
                        await window.electronAPI.createWindowWithUrl({
                            url: url,
                            title: title,
                            x: dropX - 100,
                            y: dropY - 50
                        });

                        // Close the tab in current window
                        closeTab(draggedTabId);
                    }
                }
            }
        }

        // Reset drag state
        draggedTab = null;
        draggedTabId = null;
        isDraggingOutside = false;
        lastDragX = 0;
        lastDragY = 0;

        // Remove all drag indicators
        document.querySelectorAll('.tab').forEach(t => {
            t.classList.remove('drag-over', 'drag-over-left', 'drag-over-right');
        });
    });

    // Handle drag over for reordering tabs within the window
    tabEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        if (!draggedTab || draggedTab === tabEl) return;

        const rect = tabEl.getBoundingClientRect();
        const midpoint = rect.left + rect.width / 2;

        // Remove previous indicators
        tabEl.classList.remove('drag-over-left', 'drag-over-right');

        // Show indicator based on position
        if (e.clientX < midpoint) {
            tabEl.classList.add('drag-over-left');
        } else {
            tabEl.classList.add('drag-over-right');
        }
    });

    tabEl.addEventListener('dragleave', (e) => {
        tabEl.classList.remove('drag-over-left', 'drag-over-right');
    });

    tabEl.addEventListener('drop', (e) => {
        e.preventDefault();

        if (!draggedTab || draggedTab === tabEl) return;

        const rect = tabEl.getBoundingClientRect();
        const midpoint = rect.left + rect.width / 2;
        const insertBefore = e.clientX < midpoint;

        // Reorder tabs in DOM
        if (insertBefore) {
            tabsContainer.insertBefore(draggedTab, tabEl);
        } else {
            tabsContainer.insertBefore(draggedTab, tabEl.nextSibling);
        }

        // Reorder tabs in array
        const draggedIndex = tabs.findIndex(t => t.id === draggedTabId);
        const targetIndex = tabs.findIndex(t => t.id === parseInt(tabEl.dataset.tabId));

        if (draggedIndex !== -1 && targetIndex !== -1) {
            const [draggedTabData] = tabs.splice(draggedIndex, 1);
            const newIndex = insertBefore ? targetIndex : targetIndex + 1;
            tabs.splice(newIndex > draggedIndex ? newIndex - 1 : newIndex, 0, draggedTabData);
        }

        // Remove indicators
        tabEl.classList.remove('drag-over-left', 'drag-over-right');
    });
}

// Allow dropping on the tabs container for edge cases
tabsContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
});

tabsContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    // Drop is handled by individual tab handlers
});

function setupWebviewEvents(tabId, webview) {
    const tab = tabs.find(t => t.id === tabId);

    webview.addEventListener('dom-ready', () => {
        if (activeTabId === tabId) {
            addressBar.value = webview.getURL();
            updateNavButtons();
        }

        // Apply color scheme based on theme setting
        const colorScheme = currentSettings.theme === 'light' ? 'light' : 'dark';
        try {
            webview.insertCSS(`:root { color-scheme: ${colorScheme}; } @media (prefers-color-scheme: ${colorScheme === 'light' ? 'dark' : 'light'}) { :root { color-scheme: ${colorScheme} !important; } }`);
        } catch (e) {
            // Webview might not be ready
        }

        // Apply Font Size
        if (currentSettings.fontSize) {
            const fontSizes = {
                'small': '14px',
                'medium': '16px',
                'large': '18px',
                'x-large': '20px'
            };
            const size = fontSizes[currentSettings.fontSize] || '16px';
            try {
                webview.insertCSS(`html { font-size: ${size} !important; }`);
            } catch (e) { }
        }

        // Apply Default Zoom
        if (currentSettings.defaultZoom) {
            const zoom = parseFloat(currentSettings.defaultZoom) || 1;
            try {
                webview.setZoomFactor(zoom);
            } catch (e) { }
        }

        // Inject ad-blocking CSS to hide Flash/banner elements
        if (adBlockEnabled) {
            webview.insertCSS(`
                /* Hide Flash/SWF content */
                object[type="application/x-shockwave-flash"],
                object[data*=".swf"],
                embed[type="application/x-shockwave-flash"],
                embed[src*=".swf"],
                object[classid*="D27CDB6E-AE6D-11cf-96B8-444553540000"],
                [data-ad], [data-ad-slot], [data-ad-client],
                .flash-banner, .flash-ad, .swf-container,
                object[width="728"][height="90"],
                object[width="300"][height="250"],
                object[width="160"][height="600"],
                object[width="320"][height="50"],
                embed[width="728"][height="90"],
                embed[width="300"][height="250"],
                embed[width="160"][height="600"],
                embed[width="320"][height="50"],
                /* Common ad container classes */
                .ad-banner, .adbanner, .ad_banner,
                .flash_ad, .flashad, .flash-ad,
                .banner-ad, .bannerad, .banner_ad,
                div[id*="flash"][id*="ad"],
                div[class*="flash"][class*="ad"],
                /* Standard IAB ad sizes */
                iframe[width="728"][height="90"],
                iframe[width="300"][height="250"],
                iframe[width="160"][height="600"],
                iframe[width="320"][height="50"],
                iframe[width="970"][height="250"],
                iframe[width="300"][height="600"],
                iframe[width="336"][height="280"],
                /* Cosmetic filters - common ad element selectors */
                .adsbygoogle, .adsbox, .ad-slot, .ad-container, .ad-wrapper,
                .advertisement, .advertising, .advert, .ads-container,
                .google-ad, .google-ads, .googleAd, .GoogleAd,
                #google_ads_frame, #aswift_0, #aswift_1, #aswift_2,
                div[id^="google_ads"], div[id^="div-gpt-ad"],
                ins.adsbygoogle, .adsbygoogle-noablate,
                /* Amazon ads */
                .amzn-native-ad, .a-ad, #nav-subnav-desktop-ads,
                div[data-ad-id], div[data-ad-slot], div[data-ad-client],
                .amazon-adsystem, #ad-slot, #ad_slot,
                /* Social widgets (tracking) */
                .fb-like, .fb-share-button, .fb-comments, .fb-page,
                .twitter-share-button, .twitter-tweet, .twitter-timeline,
                .linkedin-share, .IN-widget,
                .pinterest-button, .pinterest-widget,
                iframe[src*="platform.twitter.com"],
                iframe[src*="facebook.com/plugins"],
                iframe[src*="platform.linkedin.com"],
                iframe[src*="assets.pinterest.com"],
                /* StumbleUpon/Mix */
                .stumbleupon-badge, .su-badge, .mix-share,
                /* Ad placeholders and labels */
                .ad-label, .ad-notice, .adnotice, .sponsored-label,
                [aria-label*="advertisement"], [aria-label*="Advertisement"],
                [data-google-query-id], [data-ad-manager-id],
                /* Taboola/Outbrain */
                .taboola, #taboola-below-article, .OUTBRAIN,
                div[id^="taboola-"], div[data-widget-type="taboola"],
                div[class*="outbrain"], div[data-widget-type="outbrain"],
                /* Generic ad patterns */
                aside[id*="ad"], aside[class*="ad"],
                section[id*="ad"], section[class*="ad"],
                div[id*="advert"], div[class*="advert"],
                div[id*="sponsor"], div[class*="sponsor"],
                /* YouTube-specific ad blocking */
                #player-ads,
                .ytp-ad-module,
                .ytp-ad-overlay-container,
                .ytp-ad-text,
                .ytp-ad-overlay,
                .ad-showing,
                .ad-interrupting,
                .video-ads,
                .ytp-ad-text-overlay,
                .ytp-ad-skip-button-container,
                .ytp-ad-overlay-close-button,
                .ytp-ad-skip-button,
                .ytp-ad-overlay-close-container,
                .ytp-ad-overlay-image,
                .ytp-ad-overlay-ad-info-button-container,
                .ytp-ad-overlay-ad-info-button,
                div[id*="ad-"],
                div[class*="ad-"],
                div[id*="advertisement"],
                div[class*="advertisement"] {
                    display: none !important;
                    visibility: hidden !important;
                    opacity: 0 !important;
                    height: 0 !important;
                    width: 0 !important;
                    overflow: hidden !important;
                }
            `).catch(() => { });
        }
    });

    // Record history when page finishes loading
    webview.addEventListener('did-finish-load', () => {
        const url = webview.getURL();
        const title = webview.getTitle() || url;
        // Don't record empty or special URLs
        if (url && !url.startsWith('about:') && !url.startsWith('chrome:')) {
            const favicon = tab?.favicon || '';
            if (window.electronAPI && window.electronAPI.addHistory) {
                window.electronAPI.addHistory({ url, title, favicon });
            }
        }
    });

    webview.addEventListener('did-start-loading', () => {
        if (tab) {
            tab.tabEl.querySelector('.tab-loading').classList.remove('hidden');
        }
    });

    webview.addEventListener('did-stop-loading', () => {
        if (tab) {
            tab.tabEl.querySelector('.tab-loading').classList.add('hidden');
        }
    });

    webview.addEventListener('did-navigate', (event) => {
        if (activeTabId === tabId) {
            addressBar.value = event.url;
            updateNavButtons();
            updateBookmarkButton();
            updateHttpsIndicator(event.url);
        }
    });

    webview.addEventListener('did-navigate-in-page', (event) => {
        if (activeTabId === tabId) {
            addressBar.value = event.url;
            updateNavButtons();
            updateHttpsIndicator(event.url);
        }
    });

    webview.addEventListener('page-title-updated', (event) => {
        if (tab) {
            tab.title = event.title;
            tab.tabEl.querySelector('.tab-title').textContent = event.title;
        }
    });

    webview.addEventListener('page-favicon-updated', (event) => {
        if (tab && event.favicons && event.favicons.length > 0) {
            tab.favicon = event.favicons[0]; // Store favicon URL
            const favicon = tab.tabEl.querySelector('.tab-favicon');
            favicon.src = event.favicons[0];
            favicon.classList.remove('hidden');
        }
    });

    webview.addEventListener('did-fail-load', (event) => {
        if (event.errorCode !== -3) {
            console.error('Failed to load:', event.errorDescription);
        }
        if (tab) {
            tab.tabEl.querySelector('.tab-loading').classList.add('hidden');
        }
    });

    // Setup find-in-page events
    webview.addEventListener('found-in-page', (e) => {
        const { activeMatchOrdinal, matches } = e.result;
        const findResults = document.getElementById('find-results');

        if (matches > 0) {
            findResults.textContent = `${activeMatchOrdinal}/${matches}`;
            findResults.classList.remove('no-results');
        } else {
            findResults.textContent = '0/0';
            findResults.classList.add('no-results');
        }
    });

    // Context menu - right-click handling
    webview.addEventListener('context-menu', (e) => {
        e.preventDefault();

        const params = {
            x: e.params.x,
            y: e.params.y,
            linkURL: e.params.linkURL || '',
            srcURL: e.params.srcURL || '',
            mediaType: e.params.mediaType || '',
            selectionText: e.params.selectionText || '',
            isEditable: e.params.isEditable || false,
            pageURL: webview.getURL(),
            canGoBack: webview.canGoBack(),
            canGoForward: webview.canGoForward()
        };

        if (window.electronAPI?.showContextMenu) {
            window.electronAPI.showContextMenu(params);
        }
    });
}

// Tab click handlers (including middle-click to close)
tabsContainer.addEventListener('click', (e) => {
    const tabEl = e.target.closest('.tab');
    if (!tabEl) return;

    const tabId = parseInt(tabEl.dataset.tabId);

    // Check if close button was clicked
    if (e.target.classList.contains('tab-close')) {
        closeTab(tabId);
    } else {
        switchToTab(tabId);
    }
});

// Middle-click to close tab
tabsContainer.addEventListener('auxclick', (e) => {
    if (e.button === 1) { // Middle mouse button
        const tabEl = e.target.closest('.tab');
        if (tabEl) {
            e.preventDefault();
            const tabId = parseInt(tabEl.dataset.tabId);
            closeTab(tabId);
        }
    }
});

// New tab button
newTabBtn.addEventListener('click', () => {
    createTab();
});

// Navigation buttons
backBtn.addEventListener('click', () => {
    const webview = getActiveWebview();
    if (webview && webview.canGoBack()) {
        webview.goBack();
    }
});

forwardBtn.addEventListener('click', () => {
    const webview = getActiveWebview();
    if (webview && webview.canGoForward()) {
        webview.goForward();
    }
});

reloadBtn.addEventListener('click', () => {
    const webview = getActiveWebview();
    if (webview) {
        webview.reload();
    }
});

// HTTPS Indicator elements
const httpsIndicator = document.getElementById('https-indicator');
const httpsLockIcon = document.getElementById('https-lock-icon');
const httpsUnlockIcon = document.getElementById('https-unlock-icon');
const httpsInfoIcon = document.getElementById('https-info-icon');
let httpsTooltip = null;

// Update HTTPS indicator based on URL
function updateHttpsIndicator(url) {
    if (!httpsIndicator) return;

    try {
        const urlObj = new URL(url);
        const protocol = urlObj.protocol;

        // Reset all icons
        httpsLockIcon.classList.add('hidden');
        httpsUnlockIcon.classList.add('hidden');
        httpsInfoIcon.classList.add('hidden');

        if (protocol === 'https:') {
            // Secure connection
            httpsIndicator.classList.remove('insecure', 'neutral');
            httpsIndicator.classList.add('secure');
            httpsLockIcon.classList.remove('hidden');
            httpsIndicator.title = 'Connection is secure';
        } else if (protocol === 'http:') {
            // Insecure connection
            httpsIndicator.classList.remove('secure', 'neutral');
            httpsIndicator.classList.add('insecure');
            httpsUnlockIcon.classList.remove('hidden');
            httpsIndicator.title = 'Connection is not secure';
        } else {
            // Other protocols (file://, chrome://, etc.)
            httpsIndicator.classList.remove('secure', 'insecure');
            httpsIndicator.classList.add('neutral');
            httpsInfoIcon.classList.remove('hidden');
            httpsIndicator.title = 'System page';
        }
    } catch (e) {
        // Invalid URL or empty
        httpsIndicator.classList.remove('secure', 'insecure');
        httpsIndicator.classList.add('neutral');
        httpsLockIcon.classList.add('hidden');
        httpsUnlockIcon.classList.add('hidden');
        httpsInfoIcon.classList.remove('hidden');
        httpsIndicator.title = 'Enter a URL';
    }
}

// Show HTTPS tooltip on click
if (httpsIndicator) {
    httpsIndicator.addEventListener('click', (e) => {
        e.stopPropagation();

        // Remove existing tooltip
        if (httpsTooltip) {
            httpsTooltip.remove();
            httpsTooltip = null;
            return;
        }

        const url = addressBar.value;
        let headerClass = 'neutral';
        let headerText = 'System Page';
        let contentText = 'This is a local or system page.';

        try {
            const urlObj = new URL(url);
            const protocol = urlObj.protocol;
            const hostname = urlObj.hostname;

            if (protocol === 'https:') {
                headerClass = 'secure';
                headerText = 'Connection is secure';
                contentText = `Your information (like passwords or credit card numbers) is private when sent to this site.`;
            } else if (protocol === 'http:') {
                headerClass = 'insecure';
                headerText = 'Connection is not secure';
                contentText = `You should not enter any sensitive information on this site (like passwords or credit cards) because it could be stolen by attackers.`;
            }
        } catch (e) {
            // Keep defaults
        }

        // Create tooltip
        httpsTooltip = document.createElement('div');
        httpsTooltip.className = 'https-tooltip';
        httpsTooltip.innerHTML = `
            <div class="https-tooltip-header ${headerClass}">
                ${headerClass === 'secure' ?
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>' :
                headerClass === 'insecure' ?
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z"/></svg>' :
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>'
            }
                ${headerText}
            </div>
            <div class="https-tooltip-content">${contentText}</div>
            <div class="https-tooltip-url">${url || 'No URL'}</div>
        `;

        httpsIndicator.style.position = 'relative';
        httpsIndicator.appendChild(httpsTooltip);
    });
}

// Close HTTPS tooltip when clicking outside
document.addEventListener('click', (e) => {
    if (httpsTooltip && !httpsIndicator.contains(e.target)) {
        httpsTooltip.remove();
        httpsTooltip = null;
    }
});

// Update navigation button states
function updateNavButtons() {
    const webview = getActiveWebview();
    if (webview) {
        try {
            backBtn.disabled = !webview.canGoBack();
            forwardBtn.disabled = !webview.canGoForward();
        } catch (e) {
            backBtn.disabled = true;
            forwardBtn.disabled = true;
        }
    } else {
        backBtn.disabled = true;
        forwardBtn.disabled = true;
    }
}

// Menu toggle
menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuDropdown.classList.toggle('hidden');
});

// Close menu when clicking outside
document.addEventListener('click', () => {
    menuDropdown.classList.add('hidden');
});

// Close menu with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menuDropdown.classList.contains('hidden')) {
        menuDropdown.classList.add('hidden');
        e.stopPropagation();
    }
});

// Menu actions
menuDropdown.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    if (!action) return;

    menuDropdown.classList.add('hidden');

    switch (action) {
        case 'new-tab':
            createTab();
            break;
        case 'new-incognito':
            if (window.electronAPI?.openIncognito) {
                window.electronAPI.openIncognito();
            }
            break;
        case 'bookmarks':
            showBookmarksPanel();
            break;
        case 'history':
            showHistoryPanel();
            break;
        case 'downloads':
            showDownloadsPanel();
            break;
        case 'clear-data':
            showClearDataModal();
            break;
        case 'settings':
            if (window.electronAPI?.openSettings) {
                window.electronAPI.openSettings();
            }
            break;
        case 'zoom-in':
            const wvIn = getActiveWebview();
            if (wvIn) wvIn.setZoomLevel(wvIn.getZoomLevel() + 0.5);
            break;
        case 'zoom-out':
            const wvOut = getActiveWebview();
            if (wvOut) wvOut.setZoomLevel(wvOut.getZoomLevel() - 0.5);
            break;
        case 'zoom-reset':
            const wvReset = getActiveWebview();
            if (wvReset) wvReset.setZoomLevel(0);
            break;
        case 'devtools':
            const wvDev = getActiveWebview();
            if (wvDev) wvDev.openDevTools();
            break;
        case 'about':
            alert('Aegis Browser v1.0.0');
            break;
    }
});

// Navigate to URL
function navigateTo(input) {
    let url = input.trim();
    if (!url) return;

    // Add https:// if no protocol specified
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        // Check if it looks like a URL (has a dot and no spaces)
        if (url.includes('.') && !url.includes(' ')) {
            url = 'https://' + url;
        } else {
            // Treat as search query - use configured search engine
            const searchEngines = {
                google: 'https://www.google.com/search?q=',
                bing: 'https://www.bing.com/search?q=',
                duckduckgo: 'https://duckduckgo.com/?q=',
                brave: 'https://search.brave.com/search?q=',
                startpage: 'https://www.startpage.com/do/search?q=',
                ecosia: 'https://www.ecosia.org/search?q='
            };
            const engine = currentSettings.defaultSearchEngine || 'google';
            const searchUrl = searchEngines[engine] || searchEngines.google;
            url = searchUrl + encodeURIComponent(url);
        }
    }

    const webview = getActiveWebview();
    if (webview) {
        webview.loadURL(url);
    }
}

// Address bar: navigate on Enter key
addressBar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        // Check if there's a selected suggestion
        const selected = document.querySelector('.suggestion-item.selected');
        if (selected) {
            const url = selected.dataset.url;
            const type = selected.dataset.type;
            if (type === 'search') {
                navigateTo(selected.dataset.query);
            } else {
                navigateTo(url);
            }
        } else {
            navigateTo(addressBar.value);
        }
        hideSuggestions();
        addressBar.blur(); // Remove focus after navigation
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateSuggestions(1);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateSuggestions(-1);
    } else if (e.key === 'Escape') {
        hideSuggestions();
    }
});

// Select all text when address bar is focused
addressBar.addEventListener('focus', () => {
    addressBar.select();
    // Show suggestions if there's text
    if (addressBar.value.length > 0) {
        fetchSuggestions(addressBar.value);
    }
});

// =========================
// Address Bar Autocomplete
// =========================
const suggestionsDropdown = document.getElementById('suggestions-dropdown');
let suggestionItems = [];
let selectedIndex = -1;
let suggestionTimeout = null;

// Debounced input handler for suggestions
addressBar.addEventListener('input', (e) => {
    const query = e.target.value;

    // Clear previous timeout
    if (suggestionTimeout) {
        clearTimeout(suggestionTimeout);
    }

    if (query.length < 1) {
        hideSuggestions();
        return;
    }

    // Debounce: wait 150ms before fetching suggestions
    suggestionTimeout = setTimeout(() => {
        fetchSuggestions(query);
    }, 150);
});

async function fetchSuggestions(query) {
    if (!window.electronAPI?.searchSuggestions) return;

    try {
        const suggestions = await window.electronAPI.searchSuggestions(query);
        renderSuggestions(suggestions);
    } catch (e) {
        console.error('Failed to fetch suggestions:', e);
    }
}

function renderSuggestions(suggestions) {
    if (!suggestionsDropdown) return;

    if (!suggestions || suggestions.length === 0) {
        hideSuggestions();
        return;
    }

    suggestionItems = suggestions;
    selectedIndex = -1;

    suggestionsDropdown.innerHTML = suggestions.map((suggestion, index) => {
        const iconHtml = getSuggestionIcon(suggestion);
        const urlDisplay = suggestion.url ? `<div class="suggestion-url">${escapeHtml(suggestion.url)}</div>` : '';
        const typeLabel = suggestion.type === 'bookmark' ? 'Bookmark' :
            suggestion.type === 'history' ? 'History' : 'Search';

        return `
            <div class="suggestion-item" 
                 data-index="${index}" 
                 data-url="${escapeHtml(suggestion.url || '')}"
                 data-type="${suggestion.type}"
                 data-query="${escapeHtml(suggestion.query || '')}">
                <div class="suggestion-icon ${suggestion.type}">
                    ${iconHtml}
                </div>
                <div class="suggestion-content">
                    <div class="suggestion-title">${escapeHtml(suggestion.title)}</div>
                    ${urlDisplay}
                </div>
                <span class="suggestion-type">${typeLabel}</span>
            </div>
        `;
    }).join('');

    suggestionsDropdown.classList.remove('hidden');

    // Add click handlers
    suggestionsDropdown.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            const type = item.dataset.type;
            if (type === 'search') {
                navigateTo(item.dataset.query);
            } else {
                navigateTo(item.dataset.url);
            }
            hideSuggestions();
            addressBar.blur();
        });

        item.addEventListener('mouseenter', () => {
            // Remove selected from all items
            suggestionsDropdown.querySelectorAll('.suggestion-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            selectedIndex = parseInt(item.dataset.index);
        });
    });
}

function getSuggestionIcon(suggestion) {
    if (suggestion.favicon) {
        return `<img src="${escapeHtml(suggestion.favicon)}" onerror="this.style.display='none'">`;
    }

    if (suggestion.type === 'bookmark') {
        return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>`;
    } else if (suggestion.type === 'history') {
        return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>`;
    } else {
        return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function navigateSuggestions(direction) {
    if (suggestionItems.length === 0) return;

    // Remove current selection
    const items = suggestionsDropdown.querySelectorAll('.suggestion-item');
    if (items[selectedIndex]) {
        items[selectedIndex].classList.remove('selected');
    }

    // Update index
    selectedIndex += direction;
    if (selectedIndex < 0) selectedIndex = suggestionItems.length - 1;
    if (selectedIndex >= suggestionItems.length) selectedIndex = 0;

    // Add selection to new item
    if (items[selectedIndex]) {
        items[selectedIndex].classList.add('selected');
        items[selectedIndex].scrollIntoView({ block: 'nearest' });

        // Update address bar with selected item's URL
        const suggestion = suggestionItems[selectedIndex];
        if (suggestion.type === 'search') {
            addressBar.value = suggestion.query;
        } else {
            addressBar.value = suggestion.url;
        }
    }
}

function hideSuggestions() {
    if (suggestionsDropdown) {
        suggestionsDropdown.classList.add('hidden');
        suggestionsDropdown.innerHTML = '';
    }
    suggestionItems = [];
    selectedIndex = -1;
}

// Hide suggestions when clicking outside
document.addEventListener('click', (e) => {
    if (!addressBar.contains(e.target) && !suggestionsDropdown?.contains(e.target)) {
        hideSuggestions();
    }
});

// Ad Blocker
const adBlockDropdown = document.getElementById('adblock-dropdown');
const adBlockToggle = document.getElementById('adblock-toggle');
const adBlockSiteToggle = document.getElementById('adblock-site-toggle');
const adBlockTotalBlocked = document.getElementById('adblock-total-blocked');
const adBlockPageBlocked = document.getElementById('adblock-page-blocked');
const adBlockHeader = document.querySelector('.adblock-header');
let sessionBlocked = 0;

async function initAdBlock() {
    if (window.electronAPI && window.electronAPI.getAdBlockStatus) {
        const status = await window.electronAPI.getAdBlockStatus();
        adBlockEnabled = status.enabled;
        totalAdsBlocked = status.totalBlocked;
        updateAdBlockUI();
    }
}

function updateAdBlockUI() {
    // Update button appearance
    if (adBlockEnabled) {
        adBlockBtn.classList.add('adblock-enabled');
        adBlockBtn.classList.remove('adblock-disabled');
        adBlockHeader?.classList.remove('disabled');
    } else {
        adBlockBtn.classList.remove('adblock-enabled');
        adBlockBtn.classList.add('adblock-disabled');
        adBlockHeader?.classList.add('disabled');
    }

    // Update badge
    if (totalAdsBlocked > 0 && adBlockEnabled) {
        adBlockCount.textContent = totalAdsBlocked > 99 ? '99+' : totalAdsBlocked;
        adBlockCount.classList.remove('hidden');
    } else {
        adBlockCount.classList.add('hidden');
    }

    // Update toggle switch
    if (adBlockToggle) {
        adBlockToggle.checked = adBlockEnabled;
    }

    // Update stats
    if (adBlockTotalBlocked) {
        adBlockTotalBlocked.textContent = totalAdsBlocked.toLocaleString();
    }
    if (adBlockPageBlocked) {
        adBlockPageBlocked.textContent = sessionBlocked.toLocaleString();
    }
}

// Toggle dropdown on button click
adBlockBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    adBlockDropdown.classList.toggle('hidden');
    // Close other dropdowns
    menuDropdown.classList.add('hidden');
});

// Handle main toggle switch
if (adBlockToggle) {
    adBlockToggle.addEventListener('change', async () => {
        if (window.electronAPI && window.electronAPI.toggleAdBlock) {
            const status = await window.electronAPI.toggleAdBlock();
            adBlockEnabled = status.enabled;
            totalAdsBlocked = status.totalBlocked;
            updateAdBlockUI();
        }
    });
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!adBlockDropdown.contains(e.target) && !adBlockBtn.contains(e.target)) {
        adBlockDropdown.classList.add('hidden');
    }
});

// Close on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        adBlockDropdown.classList.add('hidden');
    }
});

// Listen for blocked ads
if (window.electronAPI && window.electronAPI.onAdBlocked) {
    window.electronAPI.onAdBlocked((data) => {
        totalAdsBlocked = data.count;
        sessionBlocked++;
        updateAdBlockUI();
    });
}

// Listen for shortcuts from main process (e.g. context menu)
if (window.electronAPI && window.electronAPI.onShortcut) {
    window.electronAPI.onShortcut((action) => {
        const webview = getActiveWebview();

        switch (action) {
            case 'new-tab':
                createTab();
                break;
            case 'close-tab':
                if (activeTabId) closeTab(activeTabId);
                break;
            case 'back':
                if (webview && webview.canGoBack()) webview.goBack();
                break;
            case 'forward':
                if (webview && webview.canGoForward()) webview.goForward();
                break;
            case 'reload':
                if (webview) webview.reload();
                break;
            case 'devtools':
                if (webview) webview.openDevTools();
                break;
        }
    });
}

// Initialize ad blocker status
initAdBlock();

// Note: Initial tab creation is handled by initializeBrowser() at end of file
// This allows for URL query parameters when creating new windows from dragged tabs

// Window controls
document.getElementById('minimize-btn').addEventListener('click', () => {
    window.electronAPI.minimizeWindow();
});

document.getElementById('maximize-btn').addEventListener('click', () => {
    window.electronAPI.maximizeWindow();
});

// Snap layout options
document.querySelectorAll('.snap-option').forEach(option => {
    option.addEventListener('click', (e) => {
        e.stopPropagation();
        const snapPosition = option.dataset.snap;
        window.electronAPI.snapWindow(snapPosition);
    });
});

document.getElementById('close-btn').addEventListener('click', () => {
    window.electronAPI.closeWindow();
});

// Keyboard shortcuts handler function
function handleKeyboardShortcut(e) {
    // e can be a KeyboardEvent or webview input event
    const ctrl = e.ctrlKey || e.control;
    const shift = e.shiftKey || e.shift;
    const alt = e.altKey || e.alt;
    const key = e.key;

    // Ctrl+T - New tab
    if (ctrl && key.toLowerCase() === 't') {
        createTab();
        return true;
    }

    // Ctrl+W - Close current tab
    if (ctrl && key.toLowerCase() === 'w') {
        if (activeTabId) {
            closeTab(activeTabId);
        }
        return true;
    }

    // Ctrl+L - Focus address bar
    if (ctrl && key.toLowerCase() === 'l') {
        addressBar.focus();
        addressBar.select();
        return true;
    }

    // Ctrl+R or F5 - Reload
    if ((ctrl && key.toLowerCase() === 'r') || key === 'F5') {
        const webview = getActiveWebview();
        if (webview) webview.reload();
        return true;
    }

    // Ctrl+Shift+R - Hard reload
    if (ctrl && shift && key.toLowerCase() === 'r') {
        const webview = getActiveWebview();
        if (webview) webview.reloadIgnoringCache();
        return true;
    }

    // Escape - Stop loading or blur address bar
    if (key === 'Escape') {
        if (document.activeElement === addressBar) {
            addressBar.blur();
        } else {
            const webview = getActiveWebview();
            if (webview) webview.stop();
        }
        return true;
    }

    // Alt+Left - Back
    if (alt && key === 'ArrowLeft') {
        const webview = getActiveWebview();
        if (webview && webview.canGoBack()) webview.goBack();
        return true;
    }

    // Alt+Right - Forward
    if (alt && key === 'ArrowRight') {
        const webview = getActiveWebview();
        if (webview && webview.canGoForward()) webview.goForward();
        return true;
    }

    // Ctrl+Tab - Next tab
    if (ctrl && key === 'Tab' && !shift) {
        const currentIndex = tabs.findIndex(t => t.id === activeTabId);
        const nextIndex = (currentIndex + 1) % tabs.length;
        switchToTab(tabs[nextIndex].id);
        return true;
    }

    // Ctrl+Shift+Tab - Previous tab
    if (ctrl && shift && key === 'Tab') {
        const currentIndex = tabs.findIndex(t => t.id === activeTabId);
        const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        switchToTab(tabs[prevIndex].id);
        return true;
    }

    // Ctrl+1-9 - Switch to tab by number
    if (ctrl && key >= '1' && key <= '9') {
        const index = parseInt(key) - 1;
        if (index < tabs.length) {
            switchToTab(tabs[index].id);
        }
        return true;
    }

    return false;
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (handleKeyboardShortcut(e)) {
        e.preventDefault();
    }
});

// ==================== HISTORY PANEL ====================

const historyPanel = document.getElementById('history-panel');
const historyList = document.getElementById('history-list');
const historySearch = document.getElementById('history-search');
const clearHistoryBtn = document.getElementById('clear-history-btn');
const closeHistoryBtn = document.getElementById('close-history-btn');

function formatHistoryDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const entryDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (entryDate.getTime() === today.getTime()) {
        return 'Today';
    } else if (entryDate.getTime() === yesterday.getTime()) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    }
}

function formatTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function groupHistoryByDate(history) {
    const groups = {};
    history.forEach(entry => {
        const dateKey = formatHistoryDate(entry.visitedAt);
        if (!groups[dateKey]) {
            groups[dateKey] = [];
        }
        groups[dateKey].push(entry);
    });
    return groups;
}

async function renderHistory(searchQuery = '') {
    if (!window.electronAPI || !window.electronAPI.getHistory) return;

    let history = await window.electronAPI.getHistory();

    // Filter by search query
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        history = history.filter(entry =>
            entry.title.toLowerCase().includes(query) ||
            entry.url.toLowerCase().includes(query)
        );
    }

    historyList.innerHTML = '';

    if (history.length === 0) {
        historyList.innerHTML = '<div class="history-empty">No history found</div>';
        return;
    }

    const groups = groupHistoryByDate(history);

    for (const [date, entries] of Object.entries(groups)) {
        const groupEl = document.createElement('div');
        groupEl.className = 'history-date-group';

        const headerEl = document.createElement('div');
        headerEl.className = 'history-date-header';
        headerEl.textContent = date;
        groupEl.appendChild(headerEl);

        entries.forEach(entry => {
            const entryEl = document.createElement('div');
            entryEl.className = 'history-entry';
            entryEl.dataset.id = entry.id;
            entryEl.dataset.url = entry.url;
            entryEl.innerHTML = `
                <img class="history-favicon" src="${entry.favicon || ''}" alt="" onerror="this.style.display='none'">
                <div class="history-info">
                    <div class="history-title">${escapeHtml(entry.title)}</div>
                    <div class="history-url">${escapeHtml(entry.url)}</div>
                </div>
                <span class="history-time">${formatTime(entry.visitedAt)}</span>
                <button class="history-delete" title="Delete">✕</button>
            `;
            groupEl.appendChild(entryEl);
        });

        historyList.appendChild(groupEl);
    }
}

function showHistoryPanel() {
    historyPanel.classList.remove('hidden');
    renderHistory();
    historySearch.focus();
}

function hideHistoryPanel() {
    historyPanel.classList.add('hidden');
    historySearch.value = '';
}

// History panel event listeners
closeHistoryBtn.addEventListener('click', hideHistoryPanel);

clearHistoryBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all browsing history?')) {
        await window.electronAPI.clearHistory();
        renderHistory();
    }
});

historySearch.addEventListener('input', (e) => {
    renderHistory(e.target.value);
});

historyList.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.history-delete');
    const entryEl = e.target.closest('.history-entry');

    if (deleteBtn && entryEl) {
        e.stopPropagation();
        const id = parseInt(entryEl.dataset.id);
        await window.electronAPI.deleteHistoryEntry(id);
        renderHistory(historySearch.value);
    } else if (entryEl) {
        const url = entryEl.dataset.url;
        createTab(url);
        hideHistoryPanel();
    }
});

// Close history panel with Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !historyPanel.classList.contains('hidden')) {
        hideHistoryPanel();
    }
    if (e.key === 'Escape' && !bookmarksPanel.classList.contains('hidden')) {
        hideBookmarksPanel();
    }
});

// ==================== BOOKMARKS PANEL ====================

const bookmarksPanel = document.getElementById('bookmarks-panel');
const bookmarksList = document.getElementById('bookmarks-list');
const bookmarksSearch = document.getElementById('bookmarks-search');
const closeBookmarksBtn = document.getElementById('close-bookmarks-btn');

async function updateBookmarkButton() {
    if (!window.electronAPI || !window.electronAPI.isBookmarked) return;

    const webview = getActiveWebview();
    if (!webview) {
        bookmarkBtn.classList.remove('bookmarked');
        return;
    }

    try {
        const url = webview.getURL();
        const isBookmarked = await window.electronAPI.isBookmarked(url);
        if (isBookmarked) {
            bookmarkBtn.classList.add('bookmarked');
            bookmarkBtn.title = 'Remove bookmark (Ctrl+D)';
            // Update SVG to filled star
            bookmarkBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
                </svg>
            `;
        } else {
            bookmarkBtn.classList.remove('bookmarked');
            bookmarkBtn.title = 'Bookmark this page (Ctrl+D)';
            // Update SVG to outline star
            bookmarkBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z"/>
                </svg>
            `;
        }
    } catch (e) {
        bookmarkBtn.classList.remove('bookmarked');
    }
}

async function toggleBookmark() {
    if (!window.electronAPI) return;

    const webview = getActiveWebview();
    if (!webview) return;

    try {
        const url = webview.getURL();
        const title = webview.getTitle() || url;
        const tab = tabs.find(t => t.id === activeTabId);
        const favicon = tab?.favicon || '';

        const isBookmarked = await window.electronAPI.isBookmarked(url);

        if (isBookmarked) {
            await window.electronAPI.removeBookmark(url);
        } else {
            await window.electronAPI.addBookmark({ url, title, favicon });
        }

        updateBookmarkButton();
    } catch (e) {
        console.error('Error toggling bookmark:', e);
    }
}

async function renderBookmarks(searchQuery = '') {
    if (!window.electronAPI || !window.electronAPI.getBookmarks) return;

    let bookmarks = await window.electronAPI.getBookmarks();

    // Filter by search query
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        bookmarks = bookmarks.filter(entry =>
            entry.title.toLowerCase().includes(query) ||
            entry.url.toLowerCase().includes(query)
        );
    }

    bookmarksList.innerHTML = '';

    if (bookmarks.length === 0) {
        bookmarksList.innerHTML = '<div class="bookmarks-empty">No bookmarks found</div>';
        return;
    }

    bookmarks.forEach(entry => {
        const entryEl = document.createElement('div');
        entryEl.className = 'bookmark-entry';
        entryEl.dataset.id = entry.id;
        entryEl.dataset.url = entry.url;
        entryEl.innerHTML = `
            <img class="bookmark-favicon" src="${entry.favicon || ''}" alt="" onerror="this.style.display='none'">
            <div class="bookmark-info">
                <div class="bookmark-title">${escapeHtml(entry.title)}</div>
                <div class="bookmark-url">${escapeHtml(entry.url)}</div>
            </div>
            <button class="bookmark-delete" title="Delete">✕</button>
        `;
        bookmarksList.appendChild(entryEl);
    });
}

function showBookmarksPanel() {
    hideHistoryPanel(); // Close history if open
    bookmarksPanel.classList.remove('hidden');
    renderBookmarks();
    bookmarksSearch.focus();
}

function hideBookmarksPanel() {
    bookmarksPanel.classList.add('hidden');
    bookmarksSearch.value = '';
}

// Bookmark button click handler
bookmarkBtn.addEventListener('click', toggleBookmark);

// Bookmarks panel event listeners
closeBookmarksBtn.addEventListener('click', hideBookmarksPanel);

bookmarksSearch.addEventListener('input', (e) => {
    renderBookmarks(e.target.value);
});

bookmarksList.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.bookmark-delete');
    const entryEl = e.target.closest('.bookmark-entry');

    if (deleteBtn && entryEl) {
        e.stopPropagation();
        const id = parseInt(entryEl.dataset.id);
        await window.electronAPI.deleteBookmark(id);
        renderBookmarks(bookmarksSearch.value);
        updateBookmarkButton(); // Update button state if current page was deleted
    } else if (entryEl) {
        const url = entryEl.dataset.url;
        createTab(url);
        hideBookmarksPanel();
    }
});

// ==================== DOWNLOADS PANEL ====================

const downloadsPanel = document.getElementById('downloads-panel');
const downloadsList = document.getElementById('downloads-list');
const clearDownloadsBtn = document.getElementById('clear-downloads-btn');
const closeDownloadsBtn = document.getElementById('close-downloads-btn');

// Track active downloads for live updates
const activeDownloads = new Map();

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
        pdf: '📄',
        doc: '📝', docx: '📝',
        xls: '📊', xlsx: '📊',
        ppt: '📽️', pptx: '📽️',
        zip: '📦', rar: '📦', '7z': '📦',
        mp3: '🎵', wav: '🎵', flac: '🎵',
        mp4: '🎬', mkv: '🎬', avi: '🎬', mov: '🎬',
        jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️',
        exe: '⚙️', msi: '⚙️',
        js: '📜', ts: '📜', py: '📜', java: '📜',
        html: '🌐', css: '🎨'
    };
    return icons[ext] || '📁';
}

function createDownloadEntryHtml(download, isActive = false) {
    const progress = download.totalBytes > 0
        ? Math.round((download.receivedBytes / download.totalBytes) * 100)
        : 0;
    const stateClass = download.state === 'completed' ? 'completed' :
        (download.state === 'cancelled' || download.state === 'interrupted') ? download.state : '';

    let statusText = '';
    if (download.state === 'progressing') {
        statusText = `${formatBytes(download.receivedBytes)} / ${formatBytes(download.totalBytes)} (${progress}%)`;
    } else if (download.state === 'completed') {
        statusText = `${formatBytes(download.totalBytes)} - Complete`;
    } else if (download.state === 'cancelled') {
        statusText = 'Cancelled';
    } else if (download.state === 'interrupted') {
        statusText = 'Failed';
    } else {
        statusText = download.state || 'Unknown';
    }

    let actionsHtml = '';
    if (isActive && (download.state === 'progressing' || download.state === 'interrupted')) {
        if (download.isPaused) {
            actionsHtml = `
                <button class="download-action-btn resume" data-action="resume" title="Resume">▶</button>
                <button class="download-action-btn cancel" data-action="cancel" title="Cancel">✕</button>
            `;
        } else {
            actionsHtml = `
                <button class="download-action-btn pause" data-action="pause" title="Pause">⏸</button>
                <button class="download-action-btn cancel" data-action="cancel" title="Cancel">✕</button>
            `;
        }
    } else if (download.state === 'completed') {
        actionsHtml = `
            <button class="download-action-btn" data-action="open" title="Open file">📂</button>
            <button class="download-action-btn" data-action="folder" title="Show in folder">📁</button>
            <button class="download-action-btn cancel" data-action="delete" title="Remove">✕</button>
        `;
    } else {
        actionsHtml = `
            <button class="download-action-btn cancel" data-action="delete" title="Remove">✕</button>
        `;
    }

    return `
        <div class="download-entry ${stateClass}" data-id="${download.id}" data-path="${download.savePath || ''}">
            <div class="download-header">
                <div class="download-icon">${getFileIcon(download.filename)}</div>
                <div class="download-info">
                    <div class="download-filename" title="${escapeHtml(download.filename)}">${escapeHtml(download.filename)}</div>
                    <div class="download-status ${stateClass}">${statusText}</div>
                </div>
                <div class="download-actions">
                    ${actionsHtml}
                </div>
            </div>
            ${isActive && download.state === 'progressing' ? `
                <div class="download-progress-container">
                    <div class="download-progress-bar" style="width: ${progress}%"></div>
                </div>
            ` : ''}
        </div>
    `;
}

async function renderDownloads() {
    if (!window.electronAPI) return;

    // Get both active and history
    const [active, history] = await Promise.all([
        window.electronAPI.getActiveDownloads(),
        window.electronAPI.getDownloads()
    ]);

    downloadsList.innerHTML = '';

    // Update active downloads map
    activeDownloads.clear();
    active.forEach(d => activeDownloads.set(d.id, d));

    if (active.length === 0 && history.length === 0) {
        downloadsList.innerHTML = '<div class="downloads-empty">No downloads</div>';
        return;
    }

    // Render active downloads first
    active.forEach(download => {
        downloadsList.insertAdjacentHTML('beforeend', createDownloadEntryHtml(download, true));
    });

    // Add separator if there are both active and history
    if (active.length > 0 && history.length > 0) {
        downloadsList.insertAdjacentHTML('beforeend', '<div style="height: 1px; background: #404040; margin: 12px 0;"></div>');
    }

    // Render history (completed downloads)
    history.forEach(download => {
        downloadsList.insertAdjacentHTML('beforeend', createDownloadEntryHtml(download, false));
    });
}

function updateDownloadProgress(data) {
    const entry = downloadsList.querySelector(`.download-entry[data-id="${data.id}"]`);
    if (entry) {
        const progress = data.totalBytes > 0
            ? Math.round((data.receivedBytes / data.totalBytes) * 100)
            : 0;

        const statusEl = entry.querySelector('.download-status');
        if (statusEl) {
            if (data.isPaused) {
                statusEl.textContent = `${formatBytes(data.receivedBytes)} / ${formatBytes(data.totalBytes)} - Paused`;
            } else {
                statusEl.textContent = `${formatBytes(data.receivedBytes)} / ${formatBytes(data.totalBytes)} (${progress}%)`;
            }
        }

        const progressBar = entry.querySelector('.download-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }

        // Update action buttons based on pause state
        const actionsEl = entry.querySelector('.download-actions');
        if (actionsEl) {
            if (data.isPaused) {
                actionsEl.innerHTML = `
                    <button class="download-action-btn resume" data-action="resume" title="Resume">▶</button>
                    <button class="download-action-btn cancel" data-action="cancel" title="Cancel">✕</button>
                `;
            } else {
                actionsEl.innerHTML = `
                    <button class="download-action-btn pause" data-action="pause" title="Pause">⏸</button>
                    <button class="download-action-btn cancel" data-action="cancel" title="Cancel">✕</button>
                `;
            }
        }
    }
}

function showDownloadsPanel() {
    hideHistoryPanel();
    hideBookmarksPanel();
    downloadsPanel.classList.remove('hidden');
    renderDownloads();
}

function hideDownloadsPanel() {
    downloadsPanel.classList.add('hidden');
}

// Downloads panel event listeners
closeDownloadsBtn.addEventListener('click', hideDownloadsPanel);

clearDownloadsBtn.addEventListener('click', async () => {
    await window.electronAPI.clearDownloads();
    renderDownloads();
});

downloadsList.addEventListener('click', async (e) => {
    const btn = e.target.closest('.download-action-btn');
    const entryEl = e.target.closest('.download-entry');

    if (!btn || !entryEl) return;

    const action = btn.dataset.action;
    const id = parseInt(entryEl.dataset.id);
    const savePath = entryEl.dataset.path;

    switch (action) {
        case 'pause':
            window.electronAPI.pauseDownload(id);
            break;
        case 'resume':
            window.electronAPI.resumeDownload(id);
            break;
        case 'cancel':
            window.electronAPI.cancelDownload(id);
            break;
        case 'open':
            window.electronAPI.openDownloadedFile(savePath);
            break;
        case 'folder':
            window.electronAPI.showInFolder(savePath);
            break;
        case 'delete':
            await window.electronAPI.deleteDownload(id);
            renderDownloads();
            break;
    }
});

// Listen for download events from main process
if (window.electronAPI) {
    window.electronAPI.onDownloadStarted((data) => {
        activeDownloads.set(data.id, data);
        // Show downloads panel and refresh
        if (downloadsPanel.classList.contains('hidden')) {
            showDownloadsPanel();
        } else {
            renderDownloads();
        }
    });

    window.electronAPI.onDownloadProgress((data) => {
        const download = activeDownloads.get(data.id);
        if (download) {
            download.receivedBytes = data.receivedBytes;
            download.state = data.state;
            download.isPaused = data.isPaused;
        }
        updateDownloadProgress(data);
    });

    window.electronAPI.onDownloadComplete((data) => {
        activeDownloads.delete(data.id);
        renderDownloads();
    });
}

// Close downloads panel with Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !downloadsPanel.classList.contains('hidden')) {
        hideDownloadsPanel();
    }
});

// ============================================
// Find in Page
// ============================================
const findBar = document.getElementById('find-bar');
const findInput = document.getElementById('find-input');
const findResults = document.getElementById('find-results');
const findPrevBtn = document.getElementById('find-prev-btn');
const findNextBtn = document.getElementById('find-next-btn');
const findCloseBtn = document.getElementById('find-close-btn');

let findRequestId = 0;
let currentFindText = '';
let findDebounceTimer = null;

function showFindBar() {
    findBar.classList.remove('hidden');
    findInput.focus();
    findInput.select();
}

function hideFindBar() {
    if (findBar.classList.contains('hidden')) return;

    findBar.classList.add('hidden');
    findInput.value = '';
    findResults.textContent = '0/0';
    findResults.classList.remove('no-results');
    currentFindText = '';

    // Clear any pending search
    if (findDebounceTimer) {
        clearTimeout(findDebounceTimer);
        findDebounceTimer = null;
    }

    // Stop finding and clear highlights
    const webview = getActiveWebview();
    if (webview) {
        webview.stopFindInPage('clearSelection');
    }
}

function findInPage(forward = true, isNewSearch = false) {
    const text = findInput.value.trim();
    const webview = getActiveWebview();

    if (!text || !webview) {
        findResults.textContent = '0/0';
        findResults.classList.remove('no-results');
        currentFindText = '';
        return;
    }

    // If text changed or new search, start fresh
    const textChanged = text !== currentFindText;
    if (textChanged) {
        currentFindText = text;
        isNewSearch = true;
    }

    webview.findInPage(text, {
        forward: forward,
        findNext: !isNewSearch
    });
}

// Debounced search function
function debouncedFind() {
    if (findDebounceTimer) {
        clearTimeout(findDebounceTimer);
    }
    findDebounceTimer = setTimeout(() => {
        findInPage(true, true);
    }, 150); // 150ms delay for smooth typing
}

// Find input events - debounced search on typing
findInput.addEventListener('input', debouncedFind);

findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
            findInPage(false); // Previous
        } else {
            findInPage(true); // Next
        }
    } else if (e.key === 'Escape') {
        hideFindBar();
    }
});

// Find buttons
findNextBtn.addEventListener('click', () => findInPage(true));
findPrevBtn.addEventListener('click', () => findInPage(false));
findCloseBtn.addEventListener('click', hideFindBar);

// ============================================
// Context Menu Actions
// ============================================
if (window.electronAPI?.onContextMenuAction) {
    window.electronAPI.onContextMenuAction((data) => {
        const webview = getActiveWebview();
        if (!webview) return;

        switch (data.action) {
            case 'open-link-new-tab':
                createTab(data.url);
                break;
            case 'copy-link':
            case 'copy-image-url':
                navigator.clipboard.writeText(data.url);
                break;
            case 'open-image-new-tab':
                createTab(data.url);
                break;
            case 'save-image':
                // Trigger download by navigating
                const a = document.createElement('a');
                a.href = data.url;
                a.download = '';
                a.click();
                break;
            case 'copy':
                webview.copy();
                break;
            case 'cut':
                webview.cut();
                break;
            case 'paste':
                webview.paste();
                break;
            case 'select-all':
                webview.selectAll();
                break;
            case 'search-selection':
                const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(data.text)}`;
                createTab(searchUrl);
                break;
            case 'back':
                if (webview.canGoBack()) webview.goBack();
                break;
            case 'forward':
                if (webview.canGoForward()) webview.goForward();
                break;
            case 'reload':
                webview.reload();
                break;
            case 'view-source':
                createTab(`view-source:${data.url}`);
                break;
            case 'inspect':
                webview.inspectElement(data.x, data.y);
                break;
        }
    });
}

// ============================================
// Window Resize Handling
// ============================================
let resizeDirection = null;
let resizeStartBounds = null;
let resizeStartPos = null;
const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;

// Add mousedown listeners to resize handles
document.querySelectorAll('.resize-handle').forEach(handle => {
    handle.addEventListener('mousedown', async (e) => {
        e.preventDefault();
        resizeDirection = handle.dataset.direction;
        resizeStartPos = { x: e.screenX, y: e.screenY };
        resizeStartBounds = await window.electronAPI?.getWindowBounds();

        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
        document.body.style.cursor = getComputedStyle(handle).cursor;
    });
});

function handleResize(e) {
    if (!resizeDirection || !resizeStartBounds || !resizeStartPos) return;

    const deltaX = e.screenX - resizeStartPos.x;
    const deltaY = e.screenY - resizeStartPos.y;

    let { x, y, width, height } = resizeStartBounds;

    // Calculate new bounds based on direction
    if (resizeDirection.includes('e')) {
        width = Math.max(MIN_WIDTH, resizeStartBounds.width + deltaX);
    }
    if (resizeDirection.includes('w')) {
        const newWidth = Math.max(MIN_WIDTH, resizeStartBounds.width - deltaX);
        x = resizeStartBounds.x + (resizeStartBounds.width - newWidth);
        width = newWidth;
    }
    if (resizeDirection.includes('s')) {
        height = Math.max(MIN_HEIGHT, resizeStartBounds.height + deltaY);
    }
    if (resizeDirection.includes('n')) {
        const newHeight = Math.max(MIN_HEIGHT, resizeStartBounds.height - deltaY);
        y = resizeStartBounds.y + (resizeStartBounds.height - newHeight);
        height = newHeight;
    }

    window.electronAPI?.setWindowBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) });
}

function stopResize() {
    resizeDirection = null;
    resizeStartBounds = null;
    resizeStartPos = null;
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
    document.body.style.cursor = '';
}

// =====================
// Clear Browsing Data
// =====================
const clearDataModal = document.getElementById('clear-data-modal');
const clearDataClose = document.getElementById('clear-data-close');
const clearDataCancel = document.getElementById('clear-data-cancel');
const clearDataConfirm = document.getElementById('clear-data-confirm');
const clearDataOverlay = clearDataModal?.querySelector('.modal-overlay');

function showClearDataModal() {
    if (clearDataModal) {
        clearDataModal.classList.remove('hidden');
    }
}

function hideClearDataModal() {
    if (clearDataModal) {
        clearDataModal.classList.add('hidden');
    }
}

// Close modal on X button, Cancel, or overlay click
clearDataClose?.addEventListener('click', hideClearDataModal);
clearDataCancel?.addEventListener('click', hideClearDataModal);
clearDataOverlay?.addEventListener('click', hideClearDataModal);

// Close with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && clearDataModal && !clearDataModal.classList.contains('hidden')) {
        hideClearDataModal();
    }
});

// Handle clear data confirmation
clearDataConfirm?.addEventListener('click', async () => {
    const timeRange = document.getElementById('clear-data-time')?.value || 'all';
    const clearHistory = document.getElementById('clear-history')?.checked || false;
    const clearCookies = document.getElementById('clear-cookies')?.checked || false;
    const clearCache = document.getElementById('clear-cache')?.checked || false;
    const clearStorage = document.getElementById('clear-storage')?.checked || false;

    // Disable button and show loading state
    clearDataConfirm.disabled = true;
    clearDataConfirm.textContent = 'Clearing...';

    try {
        const result = await window.electronAPI?.clearBrowsingData({
            timeRange,
            history: clearHistory,
            cookies: clearCookies,
            cache: clearCache,
            storage: clearStorage
        });

        if (result?.success) {
            // Show success feedback
            clearDataConfirm.textContent = 'Cleared!';
            clearDataConfirm.style.background = '#4caf50';

            setTimeout(() => {
                hideClearDataModal();
                // Reset button
                clearDataConfirm.disabled = false;
                clearDataConfirm.textContent = 'Clear Data';
                clearDataConfirm.style.background = '';
            }, 1000);
        } else {
            throw new Error('Failed to clear data');
        }
    } catch (error) {
        console.error('Failed to clear browsing data:', error);
        clearDataConfirm.textContent = 'Error';
        clearDataConfirm.style.background = '#f44336';

        setTimeout(() => {
            clearDataConfirm.disabled = false;
            clearDataConfirm.textContent = 'Clear Data';
            clearDataConfirm.style.background = '';
        }, 2000);
    }
});

// ============================================
// Initialization - Create first tab
// ============================================
(function initializeBrowser() {
    // Check for URL query parameters (used when creating new window from dragged tab)
    const urlParams = new URLSearchParams(window.location.search);
    const initialUrl = urlParams.get('initialUrl');
    const initialTitle = urlParams.get('initialTitle');

    if (initialUrl) {
        // Create tab with the specified URL from dragged tab
        createTab(initialUrl, initialTitle || 'New Tab');
    } else {
        // Create default tab
        createTab();
    }
})();

