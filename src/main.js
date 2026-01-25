const { app, BrowserWindow, ipcMain, Menu, globalShortcut, session, shell, clipboard, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const AdBlocker = require('./adblock');

let mainWindow = null;

// Ad Blocker
const adBlocker = new AdBlocker();

// Download Manager
const downloads = new Map(); // Active downloads
const downloadsHistoryPath = path.join(app.getPath('userData'), 'downloads.json');

function loadDownloadsHistory() {
    try {
        if (fs.existsSync(downloadsHistoryPath)) {
            const data = fs.readFileSync(downloadsHistoryPath, 'utf-8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Error loading downloads history:', err);
    }
    return [];
}

function saveDownloadsHistory(history) {
    try {
        fs.writeFileSync(downloadsHistoryPath, JSON.stringify(history, null, 2));
    } catch (err) {
        console.error('Error saving downloads history:', err);
    }
}

function addDownloadToHistory(download) {
    const history = loadDownloadsHistory();
    // Check if already exists and update it
    const existingIndex = history.findIndex(d => d.id === download.id);
    if (existingIndex >= 0) {
        history[existingIndex] = download;
    } else {
        history.unshift(download);
    }
    // Keep only last 100 downloads
    if (history.length > 100) {
        history.length = 100;
    }
    saveDownloadsHistory(history);
    return history;
}

function clearDownloadsHistory() {
    saveDownloadsHistory([]);
    return [];
}

function deleteDownloadFromHistory(id) {
    const history = loadDownloadsHistory();
    const filtered = history.filter(d => d.id !== id);
    saveDownloadsHistory(filtered);
    return filtered;
}

function setupDownloadHandling() {
    const ses = session.fromPartition('persist:aegis');

    ses.on('will-download', (event, item, webContents) => {
        const id = Date.now();
        const filename = item.getFilename();
        const savePath = path.join(app.getPath('downloads'), filename);

        item.setSavePath(savePath);

        const downloadInfo = {
            id,
            filename,
            url: item.getURL(),
            savePath,
            totalBytes: item.getTotalBytes(),
            receivedBytes: 0,
            state: 'progressing',
            startTime: new Date().toISOString(),
            item // Store reference to control download
        };

        downloads.set(id, downloadInfo);

        // Notify renderer about new download
        mainWindow?.webContents.send('download-started', {
            id,
            filename,
            url: downloadInfo.url,
            totalBytes: downloadInfo.totalBytes,
            savePath
        });

        item.on('updated', (event, state) => {
            const info = downloads.get(id);
            if (info) {
                info.receivedBytes = item.getReceivedBytes();
                info.state = state;
                info.isPaused = item.isPaused();

                mainWindow?.webContents.send('download-progress', {
                    id,
                    receivedBytes: info.receivedBytes,
                    totalBytes: info.totalBytes,
                    state,
                    isPaused: info.isPaused
                });
            }
        });

        item.once('done', (event, state) => {
            const info = downloads.get(id);
            if (info) {
                info.state = state;
                info.receivedBytes = item.getReceivedBytes();
                info.endTime = new Date().toISOString();
                delete info.item; // Remove item reference before saving

                // Save to history
                addDownloadToHistory({
                    id: info.id,
                    filename: info.filename,
                    url: info.url,
                    savePath: info.savePath,
                    totalBytes: info.totalBytes,
                    receivedBytes: info.receivedBytes,
                    state: info.state,
                    startTime: info.startTime,
                    endTime: info.endTime
                });

                mainWindow?.webContents.send('download-complete', {
                    id,
                    state,
                    savePath: info.savePath
                });

                downloads.delete(id);
            }
        });
    });
}

// Ad Blocking Setup
function setupAdBlocking() {
    // Setup for normal browsing session
    const normalSession = session.fromPartition('persist:aegis');
    setupAdBlockForSession(normalSession);

    // Setup for incognito session
    const incognitoSession = session.fromPartition('incognito');
    setupAdBlockForSession(incognitoSession);
}

function setupAdBlockForSession(ses) {
    ses.webRequest.onBeforeRequest((details, callback) => {
        if (adBlocker.shouldBlock(details.url, details.resourceType)) {
            adBlocker.recordBlocked(details.webContentsId);
            // Notify all windows about blocked request
            BrowserWindow.getAllWindows().forEach(win => {
                if (!win.isDestroyed()) {
                    win.webContents.send('ad-blocked', {
                        url: details.url,
                        webContentsId: details.webContentsId,
                        count: adBlocker.getTotalBlocked()
                    });
                }
            });
            callback({ cancel: true });
        } else {
            callback({ cancel: false });
        }
    });

    // Modify request headers to bypass Sec-Fetch and Referer restrictions on some sites
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
        const requestHeaders = { ...details.requestHeaders };

        // For images, stylesheets, fonts, media - spoof headers to bypass hotlink protection
        if (details.resourceType === 'image' || details.resourceType === 'stylesheet' ||
            details.resourceType === 'font' || details.resourceType === 'media') {

            // Extract the origin from the URL being requested
            try {
                const url = new URL(details.url);
                const origin = url.origin;

                // Spoof Referer to match the request's own origin (bypass hotlink protection)
                requestHeaders['Referer'] = origin + '/';
                requestHeaders['Origin'] = origin;

                // Set Sec-Fetch headers to appear as same-origin
                requestHeaders['Sec-Fetch-Site'] = 'same-origin';
                requestHeaders['Sec-Fetch-Mode'] = 'no-cors';
                requestHeaders['Sec-Fetch-Dest'] = details.resourceType;
            } catch (e) {
                // If URL parsing fails, just continue with original headers
            }
        }

        callback({ requestHeaders });
    });

    // Remove restrictive Cross-Origin-Resource-Policy headers to allow image loading
    ses.webRequest.onHeadersReceived((details, callback) => {
        const responseHeaders = { ...details.responseHeaders };

        // Remove CORP headers that block cross-origin resources
        delete responseHeaders['cross-origin-resource-policy'];
        delete responseHeaders['Cross-Origin-Resource-Policy'];

        // Remove COEP headers that might block resources
        delete responseHeaders['cross-origin-embedder-policy'];
        delete responseHeaders['Cross-Origin-Embedder-Policy'];

        callback({ responseHeaders });
    });
}

// History Manager
const historyFilePath = path.join(app.getPath('userData'), 'history.json');

function loadHistory() {
    try {
        if (fs.existsSync(historyFilePath)) {
            const data = fs.readFileSync(historyFilePath, 'utf-8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Error loading history:', err);
    }
    return [];
}

function saveHistory(history) {
    try {
        fs.writeFileSync(historyFilePath, JSON.stringify(history, null, 2));
    } catch (err) {
        console.error('Error saving history:', err);
    }
}

function addHistoryEntry(entry) {
    const history = loadHistory();
    // Add to beginning of array
    history.unshift({
        id: Date.now(),
        url: entry.url,
        title: entry.title || entry.url,
        favicon: entry.favicon || '',
        visitedAt: new Date().toISOString()
    });
    // Keep only last 1000 entries
    if (history.length > 1000) {
        history.length = 1000;
    }
    saveHistory(history);
    return history;
}

function clearHistory() {
    saveHistory([]);
    return [];
}

function deleteHistoryEntry(id) {
    const history = loadHistory();
    const filtered = history.filter(entry => entry.id !== id);
    saveHistory(filtered);
    return filtered;
}

// Bookmark Manager
const bookmarksFilePath = path.join(app.getPath('userData'), 'bookmarks.json');

function loadBookmarks() {
    try {
        if (fs.existsSync(bookmarksFilePath)) {
            const data = fs.readFileSync(bookmarksFilePath, 'utf-8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Error loading bookmarks:', err);
    }
    return [];
}

function saveBookmarks(bookmarks) {
    try {
        fs.writeFileSync(bookmarksFilePath, JSON.stringify(bookmarks, null, 2));
    } catch (err) {
        console.error('Error saving bookmarks:', err);
    }
}

function addBookmark(entry) {
    const bookmarks = loadBookmarks();
    // Check if already bookmarked
    if (bookmarks.some(b => b.url === entry.url)) {
        return { success: false, message: 'Already bookmarked' };
    }
    bookmarks.unshift({
        id: Date.now(),
        url: entry.url,
        title: entry.title || entry.url,
        favicon: entry.favicon || '',
        createdAt: new Date().toISOString()
    });
    saveBookmarks(bookmarks);
    return { success: true, bookmarks };
}

function removeBookmark(url) {
    const bookmarks = loadBookmarks();
    const filtered = bookmarks.filter(b => b.url !== url);
    saveBookmarks(filtered);
    return filtered;
}

function isBookmarked(url) {
    const bookmarks = loadBookmarks();
    return bookmarks.some(b => b.url === url);
}

function deleteBookmark(id) {
    const bookmarks = loadBookmarks();
    const filtered = bookmarks.filter(b => b.id !== id);
    saveBookmarks(filtered);
    return filtered;
}

// Settings Manager
const settingsFilePath = path.join(app.getPath('userData'), 'settings.json');
let settingsWindow = null;

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
    downloadPath: app.getPath('downloads'),
    askDownloadLocation: false,
    downloadNotifications: true,
    autoOpenDownloads: true,

    // Search
    defaultSearchEngine: 'google',
    searchSuggestions: true,
    historySuggestions: true,
    bookmarkSuggestions: true
};



function loadSettings() {
    try {
        if (fs.existsSync(settingsFilePath)) {
            const data = fs.readFileSync(settingsFilePath, 'utf-8');
            const saved = JSON.parse(data);
            return { ...defaultSettings, ...saved };
        }
    } catch (err) {
        console.error('Error loading settings:', err);
    }
    return { ...defaultSettings };
}

function saveSettings(settings) {
    try {
        fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2));

        // Notify all windows about settings change
        BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed()) {
                win.webContents.send('settings-updated', settings);
            }
        });

        return { success: true };
    } catch (err) {
        console.error('Error saving settings:', err);
        return { success: false, error: err.message };
    }
}

function openSettingsWindow() {
    if (settingsWindow) {
        settingsWindow.focus();
        return;
    }

    settingsWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        title: 'Settings - Aegis Browser',
        parent: mainWindow,
        modal: false,
        frame: false,
        backgroundColor: '#1a1a2e',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'Aegis Browser',
        frame: false,
        backgroundColor: '#1a1a1a',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webviewTag: true  // Enable webview tag
        }
    });

    // Keep title as "Aegis Browser"
    mainWindow.on('page-title-updated', (event) => {
        event.preventDefault();
    });

    // Remove the menu bar
    Menu.setApplicationMenu(null);

    // Load the browser UI
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    // Open DevTools in dev mode
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Register global shortcuts when window is focused
    mainWindow.on('focus', () => {
        registerShortcuts();
    });

    mainWindow.on('blur', () => {
        globalShortcut.unregisterAll();
    });
}

// Incognito windows tracking
const incognitoWindows = new Set();

function createIncognitoWindow() {
    const incognitoWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'Aegis Browser - Incognito',
        frame: false,
        backgroundColor: '#1a1a1a',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webviewTag: true
        }
    });

    incognitoWindows.add(incognitoWindow);

    // Keep title as "Aegis Browser - Incognito"
    incognitoWindow.on('page-title-updated', (event) => {
        event.preventDefault();
    });

    // Remove menu bar
    Menu.setApplicationMenu(null);

    // Load the incognito UI
    incognitoWindow.loadFile(path.join(__dirname, 'renderer', 'incognito.html'));

    // Open DevTools in dev mode
    if (process.argv.includes('--dev')) {
        incognitoWindow.webContents.openDevTools();
    }

    incognitoWindow.on('closed', () => {
        incognitoWindows.delete(incognitoWindow);

        // Clear the incognito session data when window closes
        const ses = session.fromPartition('incognito');
        ses.clearStorageData();
        ses.clearCache();
    });

    // Register shortcuts for incognito window
    incognitoWindow.on('focus', () => {
        registerIncognitoShortcuts(incognitoWindow);
    });

    incognitoWindow.on('blur', () => {
        globalShortcut.unregisterAll();
    });

    return incognitoWindow;
}

function registerIncognitoShortcuts(win) {
    globalShortcut.unregisterAll();

    globalShortcut.register('CommandOrControl+T', () => {
        win?.webContents.send('shortcut', 'new-tab');
    });

    globalShortcut.register('CommandOrControl+W', () => {
        win?.webContents.send('shortcut', 'close-tab');
    });

    globalShortcut.register('CommandOrControl+L', () => {
        win?.webContents.send('shortcut', 'focus-address-bar');
    });

    globalShortcut.register('CommandOrControl+R', () => {
        win?.webContents.send('shortcut', 'reload');
    });

    globalShortcut.register('F5', () => {
        win?.webContents.send('shortcut', 'reload');
    });

    globalShortcut.register('CommandOrControl+Shift+R', () => {
        win?.webContents.send('shortcut', 'hard-reload');
    });

    globalShortcut.register('Alt+Left', () => {
        win?.webContents.send('shortcut', 'back');
    });

    globalShortcut.register('Alt+Right', () => {
        win?.webContents.send('shortcut', 'forward');
    });

    globalShortcut.register('F12', () => {
        win?.webContents.send('shortcut', 'devtools');
    });

    globalShortcut.register('CommandOrControl+F', () => {
        win?.webContents.send('shortcut', 'find');
    });

    globalShortcut.register('Escape', () => {
        win?.webContents.send('shortcut', 'escape');
    });

    // Open another incognito window
    globalShortcut.register('CommandOrControl+Shift+N', () => {
        createIncognitoWindow();
    });
}

function registerShortcuts() {
    // Unregister first to avoid duplicates
    globalShortcut.unregisterAll();

    // New tab
    globalShortcut.register('CommandOrControl+T', () => {
        mainWindow?.webContents.send('shortcut', 'new-tab');
    });

    // Close tab
    globalShortcut.register('CommandOrControl+W', () => {
        mainWindow?.webContents.send('shortcut', 'close-tab');
    });

    // Focus address bar
    globalShortcut.register('CommandOrControl+L', () => {
        mainWindow?.webContents.send('shortcut', 'focus-address-bar');
    });

    // Reload
    globalShortcut.register('CommandOrControl+R', () => {
        mainWindow?.webContents.send('shortcut', 'reload');
    });

    globalShortcut.register('F5', () => {
        mainWindow?.webContents.send('shortcut', 'reload');
    });

    // Hard reload
    globalShortcut.register('CommandOrControl+Shift+R', () => {
        mainWindow?.webContents.send('shortcut', 'hard-reload');
    });

    // Back
    globalShortcut.register('Alt+Left', () => {
        mainWindow?.webContents.send('shortcut', 'back');
    });

    // Forward
    globalShortcut.register('Alt+Right', () => {
        mainWindow?.webContents.send('shortcut', 'forward');
    });

    // DevTools for webview
    globalShortcut.register('F12', () => {
        mainWindow?.webContents.send('shortcut', 'devtools');
    });

    // History
    globalShortcut.register('CommandOrControl+H', () => {
        mainWindow?.webContents.send('shortcut', 'history');
    });

    // Bookmarks panel
    globalShortcut.register('CommandOrControl+Shift+B', () => {
        mainWindow?.webContents.send('shortcut', 'bookmarks');
    });

    // Add/remove bookmark
    globalShortcut.register('CommandOrControl+D', () => {
        mainWindow?.webContents.send('shortcut', 'bookmark-page');
    });

    // Downloads panel
    globalShortcut.register('CommandOrControl+J', () => {
        mainWindow?.webContents.send('shortcut', 'downloads');
    });

    // Find in page
    globalShortcut.register('CommandOrControl+F', () => {
        mainWindow?.webContents.send('shortcut', 'find');
    });

    // Escape key (for closing find bar, etc.)
    globalShortcut.register('Escape', () => {
        mainWindow?.webContents.send('shortcut', 'escape');
    });

    // New incognito window
    globalShortcut.register('CommandOrControl+Shift+N', () => {
        createIncognitoWindow();
    });
}

// App lifecycle
app.whenReady().then(() => {
    // Set user agent at app level to avoid Electron detection
    // This is the ONLY place to set UA - don't intercept requests
    app.userAgentFallback = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

    // Setup ad blocking before creating window
    setupAdBlocking();
    setupDownloadHandling();

    createWindow();
});

app.on('window-all-closed', () => {
    globalShortcut.unregisterAll();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Window control handlers - use event sender to support all windows
ipcMain.on('window-minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
});

ipcMain.on('window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win?.isMaximized()) {
        win.unmaximize();
    } else {
        win?.maximize();
    }
});

ipcMain.on('window-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
});

// Window snap handler for snap layouts
ipcMain.on('window-snap', (event, position) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    const { screen } = require('electron');
    const display = screen.getDisplayMatching(win.getBounds());
    const { workArea } = display;

    // Unmaximize first if maximized
    if (win.isMaximized()) {
        win.unmaximize();
    }

    switch (position) {
        case 'left':
            win.setBounds({
                x: workArea.x,
                y: workArea.y,
                width: Math.floor(workArea.width / 2),
                height: workArea.height
            });
            break;
        case 'right':
            win.setBounds({
                x: workArea.x + Math.floor(workArea.width / 2),
                y: workArea.y,
                width: Math.floor(workArea.width / 2),
                height: workArea.height
            });
            break;
        case 'top-left':
            win.setBounds({
                x: workArea.x,
                y: workArea.y,
                width: Math.floor(workArea.width / 2),
                height: Math.floor(workArea.height / 2)
            });
            break;
        case 'top-right':
            win.setBounds({
                x: workArea.x + Math.floor(workArea.width / 2),
                y: workArea.y,
                width: Math.floor(workArea.width / 2),
                height: Math.floor(workArea.height / 2)
            });
            break;
        case 'bottom-left':
            win.setBounds({
                x: workArea.x,
                y: workArea.y + Math.floor(workArea.height / 2),
                width: Math.floor(workArea.width / 2),
                height: Math.floor(workArea.height / 2)
            });
            break;
        case 'bottom-right':
            win.setBounds({
                x: workArea.x + Math.floor(workArea.width / 2),
                y: workArea.y + Math.floor(workArea.height / 2),
                width: Math.floor(workArea.width / 2),
                height: Math.floor(workArea.height / 2)
            });
            break;
        case 'maximize':
            win.maximize();
            break;
    }
});

// Window resize handler for frameless window
ipcMain.on('window-start-resize', (event, direction) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isMaximized() && !win.isFullScreen()) {
        // Send direction to renderer for custom resize handling
        win.webContents.send('start-resize', direction);
    }
});

// Get window bounds for resize calculation
ipcMain.handle('get-window-bounds', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? win.getBounds() : null;
});

// Set window bounds during resize
ipcMain.on('set-window-bounds', (event, bounds) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isMaximized() && !win.isFullScreen()) {
        win.setBounds(bounds);
    }
});

// Create new window with URL (for tab drag-out)
ipcMain.handle('create-window-with-url', (event, { url, title, x, y }) => {
    const newWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        x: x !== undefined ? x : undefined,
        y: y !== undefined ? y : undefined,
        title: 'Aegis Browser',
        frame: false,
        backgroundColor: '#1a1a1a',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webviewTag: true
        }
    });

    // Keep title as "Aegis Browser"
    newWindow.on('page-title-updated', (evt) => {
        evt.preventDefault();
    });

    // Remove menu bar
    Menu.setApplicationMenu(null);

    // Load the browser UI with the URL passed as query parameter
    const indexPath = path.join(__dirname, 'renderer', 'index.html');
    newWindow.loadFile(indexPath, { query: { initialUrl: url, initialTitle: title || '' } });

    // Open DevTools in dev mode
    if (process.argv.includes('--dev')) {
        newWindow.webContents.openDevTools();
    }

    // Register shortcuts for this window
    newWindow.on('focus', () => {
        registerShortcuts();
    });

    newWindow.on('blur', () => {
        globalShortcut.unregisterAll();
    });

    return { success: true, windowId: newWindow.id };
});

// Get current window ID (for tab transfer between windows)
ipcMain.handle('get-window-id', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? win.id : null;
});

// Add tab to a specific window (for rejoining tabs)
ipcMain.handle('add-tab-to-window', (event, { targetWindowId, url, title }) => {
    const targetWindow = BrowserWindow.fromId(targetWindowId);
    if (targetWindow && !targetWindow.isDestroyed()) {
        // Send message to target window to add a new tab
        targetWindow.webContents.send('add-tab', { url, title });
        return { success: true };
    }
    return { success: false, error: 'Window not found' };
});

// Get all browser window IDs (for finding drop targets)
ipcMain.handle('get-all-window-ids', (event) => {
    const currentWin = BrowserWindow.fromWebContents(event.sender);
    const currentId = currentWin ? currentWin.id : null;

    // Return all window IDs except the current one, with their bounds
    return BrowserWindow.getAllWindows()
        .filter(win => !win.isDestroyed() && win.id !== currentId)
        .map(win => ({
            id: win.id,
            bounds: win.getBounds()
        }));
});

// History handlers
ipcMain.handle('history-add', (event, entry) => {
    return addHistoryEntry(entry);
});

ipcMain.handle('history-get', () => {
    return loadHistory();
});

ipcMain.handle('history-clear', () => {
    return clearHistory();
});

ipcMain.handle('history-delete', (event, id) => {
    return deleteHistoryEntry(id);
});

// Search suggestions - combines history and bookmarks
ipcMain.handle('search-suggestions', (event, query) => {
    if (!query || query.length < 1) {
        return [];
    }

    const queryLower = query.toLowerCase();
    const suggestions = [];
    const seen = new Set();

    // Search bookmarks first (higher priority)
    const bookmarks = loadBookmarks();
    for (const bookmark of bookmarks) {
        const url = bookmark.url?.toLowerCase() || '';
        const title = bookmark.title?.toLowerCase() || '';

        if (url.includes(queryLower) || title.includes(queryLower)) {
            if (!seen.has(bookmark.url)) {
                seen.add(bookmark.url);
                suggestions.push({
                    type: 'bookmark',
                    url: bookmark.url,
                    title: bookmark.title || bookmark.url,
                    favicon: bookmark.favicon || ''
                });
            }
        }
    }

    // Search history
    const history = loadHistory();
    for (const entry of history) {
        const url = entry.url?.toLowerCase() || '';
        const title = entry.title?.toLowerCase() || '';

        if (url.includes(queryLower) || title.includes(queryLower)) {
            if (!seen.has(entry.url)) {
                seen.add(entry.url);
                suggestions.push({
                    type: 'history',
                    url: entry.url,
                    title: entry.title || entry.url,
                    favicon: entry.favicon || ''
                });
            }
        }
    }

    // Add a search suggestion at the end
    suggestions.push({
        type: 'search',
        query: query,
        title: `Search for "${query}"`,
        url: ''
    });

    // Limit to 8 suggestions
    return suggestions.slice(0, 8);
});

// Bookmark handlers
ipcMain.handle('bookmark-add', (event, entry) => {
    return addBookmark(entry);
});

ipcMain.handle('bookmark-get', () => {
    return loadBookmarks();
});

ipcMain.handle('bookmark-remove', (event, url) => {
    return removeBookmark(url);
});

ipcMain.handle('bookmark-check', (event, url) => {
    return isBookmarked(url);
});

ipcMain.handle('bookmark-delete', (event, id) => {
    return deleteBookmark(id);
});

// Download handlers
ipcMain.handle('downloads-get', () => {
    return loadDownloadsHistory();
});

ipcMain.handle('downloads-get-active', () => {
    const active = [];
    downloads.forEach((info, id) => {
        active.push({
            id: info.id,
            filename: info.filename,
            url: info.url,
            savePath: info.savePath,
            totalBytes: info.totalBytes,
            receivedBytes: info.receivedBytes,
            state: info.state
        });
    });
    return active;
});

ipcMain.handle('downloads-clear', () => {
    return clearDownloadsHistory();
});

ipcMain.handle('downloads-delete', (event, id) => {
    return deleteDownloadFromHistory(id);
});

ipcMain.on('download-pause', (event, id) => {
    const info = downloads.get(id);
    if (info && info.item) {
        info.item.pause();
    }
});

ipcMain.on('download-resume', (event, id) => {
    const info = downloads.get(id);
    if (info && info.item) {
        info.item.resume();
    }
});

ipcMain.on('download-cancel', (event, id) => {
    const info = downloads.get(id);
    if (info && info.item) {
        info.item.cancel();
    }
});

ipcMain.on('download-open-file', (event, savePath) => {
    shell.openPath(savePath);
});

ipcMain.on('download-show-in-folder', (event, savePath) => {
    shell.showItemInFolder(savePath);
});

// Context Menu handler
ipcMain.on('show-context-menu', (event, params) => {
    const menuItems = [];

    // Link actions
    if (params.linkURL) {
        menuItems.push({
            label: 'Open Link in New Tab',
            click: () => mainWindow?.webContents.send('context-menu-action', { action: 'open-link-new-tab', url: params.linkURL })
        });
        menuItems.push({
            label: 'Copy Link Address',
            click: () => clipboard.writeText(params.linkURL)
        });
        menuItems.push({ type: 'separator' });
    }

    // Image actions
    if (params.mediaType === 'image' && params.srcURL) {
        menuItems.push({
            label: 'Open Image in New Tab',
            click: () => mainWindow?.webContents.send('context-menu-action', { action: 'open-image-new-tab', url: params.srcURL })
        });
        menuItems.push({
            label: 'Save Image As...',
            click: () => mainWindow?.webContents.send('context-menu-action', { action: 'save-image', url: params.srcURL })
        });
        menuItems.push({
            label: 'Copy Image Address',
            click: () => clipboard.writeText(params.srcURL)
        });
        menuItems.push({ type: 'separator' });
    }

    // Text selection actions
    if (params.selectionText) {
        menuItems.push({
            label: 'Copy',
            accelerator: 'CmdOrCtrl+C',
            click: () => mainWindow?.webContents.send('context-menu-action', { action: 'copy' })
        });
        menuItems.push({
            label: `Search Google for "${params.selectionText.substring(0, 30)}${params.selectionText.length > 30 ? '...' : ''}"`,
            click: () => mainWindow?.webContents.send('context-menu-action', { action: 'search-selection', text: params.selectionText })
        });
        menuItems.push({ type: 'separator' });
    }

    // Editable field actions
    if (params.isEditable) {
        if (!params.selectionText) {
            menuItems.push({
                label: 'Cut',
                accelerator: 'CmdOrCtrl+X',
                enabled: !!params.selectionText,
                click: () => mainWindow?.webContents.send('context-menu-action', { action: 'cut' })
            });
            menuItems.push({
                label: 'Copy',
                accelerator: 'CmdOrCtrl+C',
                enabled: !!params.selectionText,
                click: () => mainWindow?.webContents.send('context-menu-action', { action: 'copy' })
            });
        }
        menuItems.push({
            label: 'Paste',
            accelerator: 'CmdOrCtrl+V',
            click: () => mainWindow?.webContents.send('context-menu-action', { action: 'paste' })
        });
        menuItems.push({
            label: 'Select All',
            accelerator: 'CmdOrCtrl+A',
            click: () => mainWindow?.webContents.send('context-menu-action', { action: 'select-all' })
        });
        menuItems.push({ type: 'separator' });
    }

    // Page actions (always show)
    menuItems.push({
        label: 'Back',
        enabled: params.canGoBack,
        click: () => mainWindow?.webContents.send('context-menu-action', { action: 'back' })
    });
    menuItems.push({
        label: 'Forward',
        enabled: params.canGoForward,
        click: () => mainWindow?.webContents.send('context-menu-action', { action: 'forward' })
    });
    menuItems.push({
        label: 'Reload',
        accelerator: 'CmdOrCtrl+R',
        click: () => mainWindow?.webContents.send('context-menu-action', { action: 'reload' })
    });
    menuItems.push({ type: 'separator' });
    menuItems.push({
        label: 'View Page Source',
        click: () => mainWindow?.webContents.send('context-menu-action', { action: 'view-source', url: params.pageURL })
    });
    menuItems.push({
        label: 'Inspect Element',
        click: () => mainWindow?.webContents.send('context-menu-action', { action: 'inspect', x: params.x, y: params.y })
    });

    const menu = Menu.buildFromTemplate(menuItems);
    menu.popup({ window: mainWindow });
});

// Open incognito window from menu
ipcMain.on('open-incognito', () => {
    createIncognitoWindow();
});
// Ad Blocker handlers
ipcMain.handle('adblock-get-status', () => {
    return {
        enabled: adBlocker.isEnabled(),
        totalBlocked: adBlocker.getTotalBlocked()
    };
});

ipcMain.handle('adblock-toggle', () => {
    const newState = adBlocker.toggle();
    return {
        enabled: newState,
        totalBlocked: adBlocker.getTotalBlocked()
    };
});

ipcMain.handle('adblock-get-stats', () => {
    return adBlocker.getStats();
});

ipcMain.on('adblock-reset-tab-count', (event, tabId) => {
    adBlocker.resetTabCount(tabId);
});

// Clear Browsing Data
ipcMain.handle('clear-browsing-data', async (event, options) => {
    try {
        const { timeRange, history, cookies, cache, storage } = options;
        const ses = session.fromPartition('persist:aegis');

        // Calculate the time threshold based on time range
        let sinceTime = 0;
        const now = Date.now();
        switch (timeRange) {
            case 'hour':
                sinceTime = now - (60 * 60 * 1000);
                break;
            case 'day':
                sinceTime = now - (24 * 60 * 60 * 1000);
                break;
            case 'week':
                sinceTime = now - (7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                sinceTime = now - (28 * 24 * 60 * 60 * 1000);
                break;
            case 'all':
            default:
                sinceTime = 0;
                break;
        }

        // Clear cache
        if (cache) {
            try {
                await ses.clearCache();
                console.log('Cache cleared successfully');
            } catch (e) {
                console.error('Failed to clear cache:', e);
            }
        }

        // Clear cookies
        if (cookies) {
            try {
                // Clear all cookies from the session
                const allCookies = await ses.cookies.get({});
                for (const cookie of allCookies) {
                    const url = `${cookie.secure ? 'https' : 'http'}://${cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain}${cookie.path}`;
                    try {
                        await ses.cookies.remove(url, cookie.name);
                    } catch (cookieErr) {
                        // Some cookies may fail to delete, continue with others
                    }
                }
                console.log(`Cookies cleared successfully (${allCookies.length} cookies)`);
            } catch (e) {
                console.error('Failed to clear cookies:', e);
            }
        }

        // Clear local storage and other storage
        if (storage) {
            try {
                await ses.clearStorageData({
                    storages: ['localstorage', 'indexdb', 'websql', 'serviceworkers', 'cachestorage', 'shadercache', 'filesystem']
                });
                console.log('Local storage cleared successfully');
            } catch (e) {
                console.error('Failed to clear storage:', e);
            }
        }

        // Clear history (from our own history store)
        if (history) {
            try {
                if (timeRange === 'all') {
                    // Clear all history using the existing function
                    clearHistory();
                } else {
                    // Clear history entries newer than sinceTime
                    const allHistory = loadHistory();
                    const filteredHistory = allHistory.filter(entry => {
                        const entryTime = new Date(entry.visitedAt).getTime();
                        return entryTime < sinceTime;
                    });
                    saveHistory(filteredHistory);
                }
                console.log('History cleared');
            } catch (e) {
                console.error('Failed to clear history:', e);
            }
        }

        console.log('Browsing data cleared successfully');
        return { success: true };
    } catch (error) {
        console.error('Failed to clear browsing data:', error);
        return { success: false, error: error.message };
    }
});

// Settings IPC handlers
ipcMain.on('open-settings', () => {
    openSettingsWindow();
});

ipcMain.on('close-settings', () => {
    if (settingsWindow) {
        settingsWindow.close();
    }
});

ipcMain.handle('settings-load', () => {
    return loadSettings();
});

ipcMain.handle('settings-save', (event, settings) => {
    return saveSettings(settings);
});

ipcMain.handle('select-download-path', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(settingsWindow || mainWindow, {
        properties: ['openDirectory'],
        title: 'Select Download Folder'
    });

    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

ipcMain.on('open-clear-data-dialog', () => {
    // Send message to main window to show clear data modal
    if (mainWindow) {
        mainWindow.webContents.send('shortcut', 'show-clear-data');
    }
});