// Incognito Mode - Private Browsing
// No history, bookmarks, or cookies saved after closing

// Elements
const tabsContainer = document.getElementById('tabs-container');
const newTabBtn = document.getElementById('new-tab-btn');
const webviewContainer = document.getElementById('webview-container');
const addressBar = document.getElementById('address-bar');
const suggestionsDropdown = document.getElementById('suggestions-dropdown');
const menuBtn = document.getElementById('menu-btn');
const menuDropdown = document.getElementById('menu-dropdown');
const backBtn = document.getElementById('back-btn');
const forwardBtn = document.getElementById('forward-btn');
const reloadBtn = document.getElementById('reload-btn');
const adBlockBtn = document.getElementById('adblock-btn');
const adBlockCount = document.getElementById('adblock-count');

// Tab Management
let tabs = [];
let activeTabId = null;
let tabIdCounter = 0;
let adBlockEnabled = true;
let totalAdsBlocked = 0;

// Autocomplete state
let suggestionDebounceTimer = null;
let selectedSuggestionIndex = -1;
let currentSuggestions = [];

// Autocomplete helper functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getSuggestionIcon(suggestion) {
    if (suggestion.favicon && suggestion.favicon.startsWith('http')) {
        return `<img src="${escapeHtml(suggestion.favicon)}" class="suggestion-icon" onerror="this.style.display='none'">`;
    }
    
    if (suggestion.type === 'bookmark') {
        return `<div class="suggestion-icon bookmark">★</div>`;
    } else if (suggestion.type === 'history') {
        return `<div class="suggestion-icon history">◷</div>`;
    } else {
        return `<div class="suggestion-icon search">🔍</div>`;
    }
}

function renderSuggestions(suggestions) {
    if (!suggestions || suggestions.length === 0) {
        hideSuggestions();
        return;
    }
    
    currentSuggestions = suggestions;
    selectedSuggestionIndex = -1;
    
    const html = suggestions.map((s, idx) => `
        <div class="suggestion-item" data-index="${idx}" data-url="${escapeHtml(s.url)}">
            ${getSuggestionIcon(s)}
            <div class="suggestion-content">
                <div class="suggestion-title">${escapeHtml(s.title || s.url)}</div>
                <div class="suggestion-url">${escapeHtml(s.url)}</div>
            </div>
            <div class="suggestion-type ${s.type}">${s.type}</div>
        </div>
    `).join('');
    
    suggestionsDropdown.innerHTML = html;
    suggestionsDropdown.classList.remove('hidden');
    
    // Add click handlers
    suggestionsDropdown.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
            const url = item.dataset.url;
            addressBar.value = url;
            hideSuggestions();
            const webview = getActiveWebview();
            if (webview) {
                webview.src = url;
            }
        });
    });
}

function navigateSuggestions(direction) {
    if (currentSuggestions.length === 0) return;
    
    const items = suggestionsDropdown.querySelectorAll('.suggestion-item');
    
    // Remove previous selection
    if (selectedSuggestionIndex >= 0) {
        items[selectedSuggestionIndex]?.classList.remove('selected');
    }
    
    // Update index
    if (direction === 'down') {
        selectedSuggestionIndex = (selectedSuggestionIndex + 1) % currentSuggestions.length;
    } else {
        selectedSuggestionIndex = selectedSuggestionIndex <= 0 ? currentSuggestions.length - 1 : selectedSuggestionIndex - 1;
    }
    
    // Add new selection
    items[selectedSuggestionIndex]?.classList.add('selected');
    items[selectedSuggestionIndex]?.scrollIntoView({ block: 'nearest' });
    
    // Update address bar with selected URL
    addressBar.value = currentSuggestions[selectedSuggestionIndex].url;
}

function hideSuggestions() {
    suggestionsDropdown.classList.add('hidden');
    suggestionsDropdown.innerHTML = '';
    currentSuggestions = [];
    selectedSuggestionIndex = -1;
}

async function fetchSuggestions(query) {
    if (!query || query.length < 2) {
        hideSuggestions();
        return;
    }
    
    try {
        const suggestions = await window.electronAPI.searchSuggestions(query);
        renderSuggestions(suggestions);
    } catch (err) {
        console.error('Error fetching suggestions:', err);
    }
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
            case 'find':
                showFindBar();
                break;
            case 'escape':
                hideFindBar();
                break;
        }
    });
}

function createTab(url = 'https://www.google.com') {
    const tabId = ++tabIdCounter;
    
    // Create tab element
    const tabEl = document.createElement('div');
    tabEl.className = 'tab';
    tabEl.dataset.tabId = tabId;
    tabEl.innerHTML = `
        <img class="tab-favicon" src="" alt="">
        <span class="tab-title">New Tab</span>
        <div class="tab-loading hidden"></div>
        <button class="tab-close" title="Close Tab (Ctrl+W)">×</button>
    `;
    
    // Create webview with incognito partition (non-persistent)
    const webview = document.createElement('webview');
    webview.id = `webview-${tabId}`;
    webview.src = url;
    webview.setAttribute('autosize', 'on');
    webview.setAttribute('partition', 'incognito'); // Non-persistent session
    
    // Store tab data
    tabs.push({ id: tabId, tabEl, webview, title: 'New Tab' });
    
    // Add to DOM
    tabsContainer.appendChild(tabEl);
    webviewContainer.appendChild(webview);
    
    // Set up webview events
    setupWebviewEvents(tabId, webview);
    
    // Switch to new tab
    switchToTab(tabId);
    
    return tabId;
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
    
    // If this was the active tab, switch to another
    if (activeTabId === tabId) {
        if (tabs.length > 0) {
            // Switch to the tab that's now at this index, or the last tab
            const newIndex = Math.min(tabIndex, tabs.length - 1);
            switchToTab(tabs[newIndex].id);
        } else {
            // No tabs left, close the window
            if (window.electronAPI) {
                window.electronAPI.closeWindow();
            }
        }
    }
}

function switchToTab(tabId) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    
    // Update active state
    tabs.forEach(t => {
        t.tabEl.classList.remove('active');
        t.webview.classList.remove('active');
    });
    
    tab.tabEl.classList.add('active');
    tab.webview.classList.add('active');
    activeTabId = tabId;
    
    // Update address bar
    let currentUrl = '';
    try {
        currentUrl = tab.webview.getURL();
        if (currentUrl) addressBar.value = currentUrl;
    } catch (e) {
        // Webview not ready yet
    }
    
    // Update nav buttons and HTTPS indicator
    updateNavButtons();
    updateHttpsIndicator(currentUrl);
}

function getActiveWebview() {
    const tab = tabs.find(t => t.id === activeTabId);
    return tab ? tab.webview : null;
}

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
    
    // Close HTTPS tooltip when clicking outside
    document.addEventListener('click', (e) => {
        if (httpsTooltip && !httpsIndicator.contains(e.target)) {
            httpsTooltip.remove();
            httpsTooltip = null;
        }
    });
}

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
    }
}

function setupWebviewEvents(tabId, webview) {
    const tab = tabs.find(t => t.id === tabId);
    
    webview.addEventListener('dom-ready', () => {
        if (activeTabId === tabId) {
            addressBar.value = webview.getURL();
            updateNavButtons();
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
            `).catch(() => {});
        }
    });
    
    // NO history recording in incognito mode
    
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
    
    // Find in page events
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
    
    // Context menu
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

// Tab click handlers
tabsContainer.addEventListener('click', (e) => {
    const tabEl = e.target.closest('.tab');
    if (!tabEl) return;
    
    const tabId = parseInt(tabEl.dataset.tabId);
    
    if (e.target.classList.contains('tab-close')) {
        closeTab(tabId);
    } else {
        switchToTab(tabId);
    }
});

// Middle-click to close tab
tabsContainer.addEventListener('auxclick', (e) => {
    if (e.button === 1) {
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

// Address bar
addressBar.addEventListener('keydown', (e) => {
    // Handle arrow navigation in suggestions
    if (e.key === 'ArrowDown') {
        if (!suggestionsDropdown.classList.contains('hidden')) {
            e.preventDefault();
            navigateSuggestions('down');
            return;
        }
    } else if (e.key === 'ArrowUp') {
        if (!suggestionsDropdown.classList.contains('hidden')) {
            e.preventDefault();
            navigateSuggestions('up');
            return;
        }
    } else if (e.key === 'Escape') {
        if (!suggestionsDropdown.classList.contains('hidden')) {
            e.preventDefault();
            hideSuggestions();
            return;
        }
    } else if (e.key === 'Enter') {
        e.preventDefault();
        hideSuggestions();
        let url = addressBar.value.trim();
        
        if (!url) return;
        
        // Check if it's a URL or search query
        if (!url.includes('.') || url.includes(' ')) {
            url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
        } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        
        const webview = getActiveWebview();
        if (webview) {
            webview.src = url;
        }
    }
});

// Address bar input for autocomplete suggestions
addressBar.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    
    // Clear previous debounce timer
    if (suggestionDebounceTimer) {
        clearTimeout(suggestionDebounceTimer);
    }
    
    // Debounce the search
    suggestionDebounceTimer = setTimeout(() => {
        fetchSuggestions(query);
    }, 150);
});

addressBar.addEventListener('focus', () => {
    addressBar.select();
});

// Hide suggestions when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('#address-bar-container')) {
        hideSuggestions();
    }
});

// Menu
menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuDropdown.classList.toggle('hidden');
});

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

menuDropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.menu-item');
    if (!item) return;
    
    const action = item.dataset.action;
    const webview = getActiveWebview();
    
    switch (action) {
        case 'new-tab':
            createTab();
            break;
        case 'zoom-in':
            if (webview) webview.setZoomLevel(webview.getZoomLevel() + 0.5);
            break;
        case 'zoom-out':
            if (webview) webview.setZoomLevel(webview.getZoomLevel() - 0.5);
            break;
        case 'zoom-reset':
            if (webview) webview.setZoomLevel(0);
            break;
        case 'devtools':
            if (webview) webview.openDevTools();
            break;
    }
    
    menuDropdown.classList.add('hidden');
});

// Window controls
document.getElementById('minimize-btn').addEventListener('click', () => {
    if (window.electronAPI) window.electronAPI.minimizeWindow();
});

document.getElementById('maximize-btn').addEventListener('click', () => {
    if (window.electronAPI) window.electronAPI.maximizeWindow();
});

// Snap layout options
document.querySelectorAll('.snap-option').forEach(option => {
    option.addEventListener('click', (e) => {
        e.stopPropagation();
        const snapPosition = option.dataset.snap;
        if (window.electronAPI) window.electronAPI.snapWindow(snapPosition);
    });
});

document.getElementById('close-btn').addEventListener('click', () => {
    if (window.electronAPI) window.electronAPI.closeWindow();
});

// Find in Page
const findBar = document.getElementById('find-bar');
const findInput = document.getElementById('find-input');
const findResults = document.getElementById('find-results');
const findPrevBtn = document.getElementById('find-prev-btn');
const findNextBtn = document.getElementById('find-next-btn');
const findCloseBtn = document.getElementById('find-close-btn');

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
    
    if (findDebounceTimer) {
        clearTimeout(findDebounceTimer);
        findDebounceTimer = null;
    }
    
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

function debouncedFind() {
    if (findDebounceTimer) {
        clearTimeout(findDebounceTimer);
    }
    findDebounceTimer = setTimeout(() => {
        findInPage(true, true);
    }, 150);
}

findInput.addEventListener('input', debouncedFind);

findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
            findInPage(false);
        } else {
            findInPage(true);
        }
    } else if (e.key === 'Escape') {
        hideFindBar();
    }
});

findNextBtn.addEventListener('click', () => findInPage(true));
findPrevBtn.addEventListener('click', () => findInPage(false));
findCloseBtn.addEventListener('click', hideFindBar);

// Context menu actions
if (window.electronAPI?.onContextMenuAction) {
    window.electronAPI.onContextMenuAction((data) => {
        const webview = getActiveWebview();
        if (!webview) return;
        
        switch (data.action) {
            case 'open-link-new-tab':
                createTab(data.url);
                break;
            case 'open-image-new-tab':
                createTab(data.url);
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

// Ad Blocker
async function initAdBlock() {
    if (window.electronAPI && window.electronAPI.getAdBlockStatus) {
        const status = await window.electronAPI.getAdBlockStatus();
        adBlockEnabled = status.enabled;
        totalAdsBlocked = status.totalBlocked;
        updateAdBlockUI();
    }
}

const adBlockDropdown = document.getElementById('adblock-dropdown');
const adBlockToggle = document.getElementById('adblock-toggle');
const adBlockTotalBlocked = document.getElementById('adblock-total-blocked');
const adBlockPageBlocked = document.getElementById('adblock-page-blocked');
const adBlockHeader = document.querySelector('.adblock-header');
let sessionBlocked = 0;

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

// Initialize ad blocker status
initAdBlock();

// Create initial tab
createTab();
