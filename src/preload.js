const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,
    // Window controls
    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    maximizeWindow: () => ipcRenderer.send('window-maximize'),
    closeWindow: () => ipcRenderer.send('window-close'),
    snapWindow: (position) => ipcRenderer.send('window-snap', position),
    startResize: (direction) => ipcRenderer.send('window-start-resize', direction),
    getWindowBounds: () => ipcRenderer.invoke('get-window-bounds'),
    setWindowBounds: (bounds) => ipcRenderer.send('set-window-bounds', bounds),
    onStartResize: (callback) => ipcRenderer.on('start-resize', (event, direction) => callback(direction)),
    // Tab drag to new window
    createWindowWithUrl: (data) => ipcRenderer.invoke('create-window-with-url', data),
    // Tab transfer between windows
    getWindowId: () => ipcRenderer.invoke('get-window-id'),
    getAllWindowIds: () => ipcRenderer.invoke('get-all-window-ids'),
    addTabToWindow: (data) => ipcRenderer.invoke('add-tab-to-window', data),
    onAddTab: (callback) => ipcRenderer.on('add-tab', (event, data) => callback(data)),
    // Keyboard shortcuts
    onShortcut: (callback) => ipcRenderer.on('shortcut', (event, action) => callback(action)),
    // History
    addHistory: (entry) => ipcRenderer.invoke('history-add', entry),
    getHistory: () => ipcRenderer.invoke('history-get'),
    clearHistory: () => ipcRenderer.invoke('history-clear'),
    deleteHistoryEntry: (id) => ipcRenderer.invoke('history-delete', id),
    searchSuggestions: (query) => ipcRenderer.invoke('search-suggestions', query),
    // Bookmarks
    addBookmark: (entry) => ipcRenderer.invoke('bookmark-add', entry),
    getBookmarks: () => ipcRenderer.invoke('bookmark-get'),
    removeBookmark: (url) => ipcRenderer.invoke('bookmark-remove', url),
    isBookmarked: (url) => ipcRenderer.invoke('bookmark-check', url),
    deleteBookmark: (id) => ipcRenderer.invoke('bookmark-delete', id),
    // Downloads
    getDownloads: () => ipcRenderer.invoke('downloads-get'),
    getActiveDownloads: () => ipcRenderer.invoke('downloads-get-active'),
    clearDownloads: () => ipcRenderer.invoke('downloads-clear'),
    deleteDownload: (id) => ipcRenderer.invoke('downloads-delete', id),
    pauseDownload: (id) => ipcRenderer.send('download-pause', id),
    resumeDownload: (id) => ipcRenderer.send('download-resume', id),
    cancelDownload: (id) => ipcRenderer.send('download-cancel', id),
    openDownloadedFile: (savePath) => ipcRenderer.send('download-open-file', savePath),
    showInFolder: (savePath) => ipcRenderer.send('download-show-in-folder', savePath),
    onDownloadStarted: (callback) => ipcRenderer.on('download-started', (event, data) => callback(data)),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (event, data) => callback(data)),
    onDownloadComplete: (callback) => ipcRenderer.on('download-complete', (event, data) => callback(data)),
    // Context menu
    showContextMenu: (params) => ipcRenderer.send('show-context-menu', params),
    onContextMenuAction: (callback) => ipcRenderer.on('context-menu-action', (event, data) => callback(data)),
    // Incognito
    openIncognito: () => ipcRenderer.send('open-incognito'),
    // Ad Blocker
    getAdBlockStatus: () => ipcRenderer.invoke('adblock-get-status'),
    toggleAdBlock: () => ipcRenderer.invoke('adblock-toggle'),
    getAdBlockStats: () => ipcRenderer.invoke('adblock-get-stats'),
    resetAdBlockTabCount: (tabId) => ipcRenderer.send('adblock-reset-tab-count', tabId),
    onAdBlocked: (callback) => ipcRenderer.on('ad-blocked', (event, data) => callback(data)),
    // Clear Browsing Data
    clearBrowsingData: (options) => ipcRenderer.invoke('clear-browsing-data', options),
    // Settings
    openSettings: () => ipcRenderer.send('open-settings'),
    closeSettings: () => ipcRenderer.send('close-settings'),
    loadSettings: () => ipcRenderer.invoke('settings-load'),
    saveSettings: (settings) => ipcRenderer.invoke('settings-save', settings),
    onSettingsUpdated: (callback) => ipcRenderer.on('settings-updated', (event, settings) => callback(settings)),
    selectDownloadPath: () => ipcRenderer.invoke('select-download-path'),
    openClearDataDialog: () => ipcRenderer.send('open-clear-data-dialog'),
    getVersions: () => ({
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node
    })
});
