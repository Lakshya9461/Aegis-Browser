// Settings Page JavaScript
// Handles all settings interactions and persistence

// Default settings
const defaultSettings = {
    // General
    startupBehavior: 'homepage',
    homepageUrl: 'https://www.google.com',
    newtabUrl: 'https://www.google.com',
    confirmCloseTabs: true,
    openLinksNewTab: true,
    tabSuspensionTimeout: 30,

    // Appearance
    theme: 'dark',
    accentColor: '#4a9eff',
    showBookmarksBar: false,
    compactMode: false,
    fontSize: 'medium',
    defaultZoom: '1',

    // Privacy
    adblockEnabled: true,
    blockTrackers: true,
    antiFingerprinting: true,
    fingerprintLevel: 'standard',
    doNotTrack: true,
    blockThirdPartyCookies: true,
    clearOnExit: false,

    // Downloads
    downloadPath: '',
    askDownloadLocation: false,
    downloadNotifications: true,
    autoOpenDownloads: true,

    // Search
    defaultSearchEngine: 'google',
    searchSuggestions: true,
    historySuggestions: true,
    bookmarkSuggestions: true
};

let currentSettings = { ...defaultSettings };

// Elements
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.settings-section');
const closeBtn = document.getElementById('close-settings');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// Initialize settings page
async function initSettings() {
    await loadSettings();
    populateSettings();
    setupEventListeners();
    loadVersionInfo();
}

// Load settings from storage
async function loadSettings() {
    try {
        const saved = await window.electronAPI.loadSettings();
        if (saved) {
            currentSettings = { ...defaultSettings, ...saved };
        }
    } catch (err) {
        console.error('Failed to load settings:', err);
    }
}

// Save settings to storage
async function saveSettings() {
    try {
        await window.electronAPI.saveSettings(currentSettings);
        showToast('Settings saved', 'success');
    } catch (err) {
        console.error('Failed to save settings:', err);
        showToast('Failed to save settings', 'error');
    }
}

// Populate UI with current settings
function populateSettings() {
    // General
    document.getElementById('startup-behavior').value = currentSettings.startupBehavior;
    document.getElementById('homepage-url').value = currentSettings.homepageUrl;
    document.getElementById('newtab-url').value = currentSettings.newtabUrl;
    document.getElementById('confirm-close-tabs').checked = currentSettings.confirmCloseTabs;
    document.getElementById('open-links-new-tab').checked = currentSettings.openLinksNewTab;
    document.getElementById('tab-suspension-timeout').value = currentSettings.tabSuspensionTimeout;

    // Appearance
    document.getElementById('theme').value = currentSettings.theme;
    document.getElementById('accent-color').value = currentSettings.accentColor;
    document.getElementById('show-bookmarks-bar').checked = currentSettings.showBookmarksBar;
    document.getElementById('compact-mode').checked = currentSettings.compactMode;
    document.getElementById('font-size').value = currentSettings.fontSize;
    document.getElementById('default-zoom').value = currentSettings.defaultZoom;

    // Privacy
    document.getElementById('adblock-enabled').checked = currentSettings.adblockEnabled;
    document.getElementById('block-trackers').checked = currentSettings.blockTrackers;
    document.getElementById('anti-fingerprinting').checked = currentSettings.antiFingerprinting;
    document.getElementById('fingerprint-level').value = currentSettings.fingerprintLevel;
    document.getElementById('do-not-track').checked = currentSettings.doNotTrack;
    document.getElementById('block-third-party-cookies').checked = currentSettings.blockThirdPartyCookies;
    document.getElementById('clear-on-exit').checked = currentSettings.clearOnExit;

    // Downloads
    document.getElementById('download-path').value = currentSettings.downloadPath;
    document.getElementById('ask-download-location').checked = currentSettings.askDownloadLocation;
    document.getElementById('download-notifications').checked = currentSettings.downloadNotifications;
    document.getElementById('auto-open-downloads').checked = currentSettings.autoOpenDownloads;

    // Search
    document.getElementById('default-search-engine').value = currentSettings.defaultSearchEngine;
    document.getElementById('search-suggestions').checked = currentSettings.searchSuggestions;
    document.getElementById('history-suggestions').checked = currentSettings.historySuggestions;
    document.getElementById('bookmark-suggestions').checked = currentSettings.bookmarkSuggestions;
}

// Setup all event listeners
function setupEventListeners() {
    // Navigation
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;
            switchSection(section);
        });
    });

    // Close button (sidebar)
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            window.electronAPI.closeSettings();
        });
    }

    // Window controls
    const minBtn = document.getElementById('minimize-btn');
    if (minBtn) {
        minBtn.addEventListener('click', () => {
            window.electronAPI.minimizeWindow();
        });
    }

    const winCloseBtn = document.getElementById('close-btn');
    if (winCloseBtn) {
        winCloseBtn.addEventListener('click', () => {
            window.electronAPI.closeSettings();
        });
    }

    // General settings
    document.getElementById('startup-behavior').addEventListener('change', (e) => {
        currentSettings.startupBehavior = e.target.value;
        saveSettings();
    });

    document.getElementById('homepage-url').addEventListener('change', (e) => {
        currentSettings.homepageUrl = e.target.value;
        saveSettings();
    });

    document.getElementById('newtab-url').addEventListener('change', (e) => {
        currentSettings.newtabUrl = e.target.value;
        saveSettings();
    });

    document.getElementById('confirm-close-tabs').addEventListener('change', (e) => {
        currentSettings.confirmCloseTabs = e.target.checked;
        saveSettings();
    });

    document.getElementById('open-links-new-tab').addEventListener('change', (e) => {
        currentSettings.openLinksNewTab = e.target.checked;
        saveSettings();
    });

    document.getElementById('tab-suspension-timeout').addEventListener('change', (e) => {
        currentSettings.tabSuspensionTimeout = parseInt(e.target.value) || 0;
        saveSettings();
    });

    // Appearance settings
    document.getElementById('theme').addEventListener('change', (e) => {
        currentSettings.theme = e.target.value;
        saveSettings();
        applyTheme(e.target.value);
    });

    document.getElementById('accent-color').addEventListener('change', (e) => {
        currentSettings.accentColor = e.target.value;
        saveSettings();
        applyAccentColor(e.target.value);
    });

    document.getElementById('show-bookmarks-bar').addEventListener('change', (e) => {
        currentSettings.showBookmarksBar = e.target.checked;
        saveSettings();
    });

    document.getElementById('compact-mode').addEventListener('change', (e) => {
        currentSettings.compactMode = e.target.checked;
        saveSettings();
    });

    document.getElementById('font-size').addEventListener('change', (e) => {
        currentSettings.fontSize = e.target.value;
        saveSettings();
    });

    document.getElementById('default-zoom').addEventListener('change', (e) => {
        currentSettings.defaultZoom = e.target.value;
        saveSettings();
    });

    // Privacy settings
    document.getElementById('adblock-enabled').addEventListener('change', (e) => {
        currentSettings.adblockEnabled = e.target.checked;
        saveSettings();
    });

    document.getElementById('block-trackers').addEventListener('change', (e) => {
        currentSettings.blockTrackers = e.target.checked;
        saveSettings();
    });

    document.getElementById('anti-fingerprinting').addEventListener('change', (e) => {
        currentSettings.antiFingerprinting = e.target.checked;
        saveSettings();
    });

    document.getElementById('fingerprint-level').addEventListener('change', (e) => {
        currentSettings.fingerprintLevel = e.target.value;
        saveSettings();
    });

    document.getElementById('do-not-track').addEventListener('change', (e) => {
        currentSettings.doNotTrack = e.target.checked;
        saveSettings();
    });

    document.getElementById('block-third-party-cookies').addEventListener('change', (e) => {
        currentSettings.blockThirdPartyCookies = e.target.checked;
        saveSettings();
    });

    document.getElementById('clear-on-exit').addEventListener('change', (e) => {
        currentSettings.clearOnExit = e.target.checked;
        saveSettings();
    });

    document.getElementById('clear-data-btn').addEventListener('click', () => {
        window.electronAPI.openClearDataDialog();
    });

    // Downloads settings
    document.getElementById('browse-download-path').addEventListener('click', async () => {
        const path = await window.electronAPI.selectDownloadPath();
        if (path) {
            document.getElementById('download-path').value = path;
            currentSettings.downloadPath = path;
            saveSettings();
        }
    });

    document.getElementById('ask-download-location').addEventListener('change', (e) => {
        currentSettings.askDownloadLocation = e.target.checked;
        saveSettings();
    });

    document.getElementById('download-notifications').addEventListener('change', (e) => {
        currentSettings.downloadNotifications = e.target.checked;
        saveSettings();
    });

    document.getElementById('auto-open-downloads').addEventListener('change', (e) => {
        currentSettings.autoOpenDownloads = e.target.checked;
        saveSettings();
    });

    // Search settings
    document.getElementById('default-search-engine').addEventListener('change', (e) => {
        currentSettings.defaultSearchEngine = e.target.value;
        saveSettings();
    });

    document.getElementById('search-suggestions').addEventListener('change', (e) => {
        currentSettings.searchSuggestions = e.target.checked;
        saveSettings();
    });

    document.getElementById('history-suggestions').addEventListener('change', (e) => {
        currentSettings.historySuggestions = e.target.checked;
        saveSettings();
    });

    document.getElementById('bookmark-suggestions').addEventListener('change', (e) => {
        currentSettings.bookmarkSuggestions = e.target.checked;
        saveSettings();
    });

    // About section actions
    document.getElementById('check-updates').addEventListener('click', () => {
        showToast('You are running the latest version!', 'success');
    });

    document.getElementById('reset-settings').addEventListener('click', async () => {
        if (confirm('Are you sure you want to reset all settings to default? This cannot be undone.')) {
            currentSettings = { ...defaultSettings };
            await saveSettings();
            populateSettings();
            showToast('Settings reset to default', 'success');
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            window.electronAPI.closeSettings();
        }
    });
}

// Switch active section
function switchSection(sectionId) {
    // Update nav items
    navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.section === sectionId);
    });

    // Update sections
    sections.forEach(section => {
        section.classList.toggle('active', section.id === `section-${sectionId}`);
    });
}

// Load version info
function loadVersionInfo() {
    if (window.electronAPI && window.electronAPI.getVersions) {
        const versions = window.electronAPI.getVersions();
        document.getElementById('electron-version').textContent = versions.electron || 'N/A';
        document.getElementById('chromium-version').textContent = versions.chrome || 'N/A';
        document.getElementById('node-version').textContent = versions.node || 'N/A';
    } else {
        document.getElementById('electron-version').textContent = process.versions?.electron || 'N/A';
        document.getElementById('chromium-version').textContent = process.versions?.chrome || 'N/A';
        document.getElementById('node-version').textContent = process.versions?.node || 'N/A';
    }
}

// Apply theme
function applyTheme(theme) {
    // Theme will be applied browser-wide through settings
    document.documentElement.dataset.theme = theme;
}

// Apply accent color
function applyAccentColor(color) {
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--toggle-active', color);
}

// Show toast notification
function showToast(message, type = 'info') {
    toastMessage.textContent = message;
    toast.className = `toast ${type}`;

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initSettings);
