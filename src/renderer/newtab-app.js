/**
 * Aegis Browser - New Tab Homepage
 * A customizable, widget-based productivity homepage
 */

// ========================================
// Configuration & State
// ========================================

const DEFAULT_CONFIG = {
    theme: 'dark',
    accentColor: '#4a9eff',
    background: {
        type: 'gradient',
        value: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a3a 50%, #0f1a2a 100%)'
    },
    clock: {
        format24h: false,
        showSeconds: false
    },
    searchEngine: 'google',
    widgets: {
        clock: true,
        search: true,
        quicklinks: true,
        todo: true,
        notes: true,
        focus: true
    }
};

const SEARCH_ENGINES = {
    google: 'https://www.google.com/search?q=',
    bing: 'https://www.bing.com/search?q=',
    duckduckgo: 'https://duckduckgo.com/?q=',
    brave: 'https://search.brave.com/search?q='
};

let config = { ...DEFAULT_CONFIG };
let todos = [];
let quickLinks = [];
let notes = '';
let focusTimer = {
    duration: 25 * 60, // 25 minutes in seconds
    remaining: 25 * 60,
    isRunning: false,
    interval: null,
    sessions: 0
};

// ========================================
// Storage Functions
// ========================================

function loadData() {
    try {
        // First, check for browser-level settings and sync theme/accent
        const browserSettings = localStorage.getItem('aegis-settings');
        if (browserSettings) {
            const bSettings = JSON.parse(browserSettings);
            // Sync theme and accent from browser settings
            if (bSettings.theme) {
                config.theme = bSettings.theme === 'system' ? 'auto' : bSettings.theme;
            }
            if (bSettings.accentColor) {
                config.accentColor = bSettings.accentColor;
            }
        }

        // Then load homepage-specific config (widgets, background, etc.)
        const savedConfig = localStorage.getItem('aegis-homepage-config');
        if (savedConfig) {
            const hpConfig = JSON.parse(savedConfig);
            // Merge but keep browser theme/accent as priority
            config = {
                ...DEFAULT_CONFIG,
                ...hpConfig,
                // Browser settings override homepage settings for theme consistency
                theme: config.theme,
                accentColor: config.accentColor
            };
        }

        const savedTodos = localStorage.getItem('aegis-homepage-todos');
        if (savedTodos) {
            todos = JSON.parse(savedTodos);
        }

        const savedLinks = localStorage.getItem('aegis-homepage-quicklinks');
        if (savedLinks) {
            quickLinks = JSON.parse(savedLinks);
        }

        const savedNotes = localStorage.getItem('aegis-homepage-notes');
        if (savedNotes) {
            notes = savedNotes;
        }

        const savedSessions = localStorage.getItem('aegis-homepage-focus-sessions');
        if (savedSessions) {
            const data = JSON.parse(savedSessions);
            // Reset sessions if it's a new day
            const today = new Date().toDateString();
            if (data.date === today) {
                focusTimer.sessions = data.count;
            }
        }
    } catch (e) {
        console.error('Error loading data:', e);
    }
}

function saveConfig() {
    localStorage.setItem('aegis-homepage-config', JSON.stringify(config));
}

function saveTodos() {
    localStorage.setItem('aegis-homepage-todos', JSON.stringify(todos));
}

function saveQuickLinks() {
    localStorage.setItem('aegis-homepage-quicklinks', JSON.stringify(quickLinks));
}

function saveNotes() {
    localStorage.setItem('aegis-homepage-notes', notes);
}

function saveFocusSessions() {
    localStorage.setItem('aegis-homepage-focus-sessions', JSON.stringify({
        date: new Date().toDateString(),
        count: focusTimer.sessions
    }));
}

// ========================================
// Theme & Appearance
// ========================================

function applyTheme() {
    const theme = config.theme === 'auto'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : config.theme;

    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.setProperty('--accent', config.accentColor);

    // Apply background based on theme if using default gradient
    if (config.background.type === 'gradient') {
        if (theme === 'light') {
            // Use light gradient
            const lightGradient = 'linear-gradient(135deg, #e8eaed 0%, #f5f7fa 50%, #e0e5ea 100%)';
            document.body.style.background = config.background.value.includes('#0f0f1a') ? lightGradient : config.background.value;
        } else {
            // Use dark gradient
            document.body.style.background = config.background.value || 'linear-gradient(135deg, #0f0f1a 0%, #1a1a3a 50%, #0f1a2a 100%)';
        }
    } else if (config.background.type === 'solid') {
        document.body.style.background = config.background.value || 'var(--bg-primary)';
    } else if (config.background.type === 'image') {
        document.body.style.background = `url(${config.background.value}) center/cover no-repeat fixed`;
        document.body.style.backgroundColor = 'var(--bg-primary)';
    }
}

function updateWidgetVisibility() {
    const widgets = ['clock', 'search', 'quicklinks', 'todo', 'notes', 'focus'];
    widgets.forEach(id => {
        const widget = document.getElementById(`${id}-widget`);
        const checkbox = document.getElementById(`widget-${id}`);
        if (widget && checkbox) {
            widget.style.display = config.widgets[id] ? '' : 'none';
            checkbox.checked = config.widgets[id];
        }
    });
}

// ========================================
// Greeting Widget
// ========================================

function updateGreeting() {
    const hour = new Date().getHours();
    let greeting;

    if (hour < 12) {
        greeting = 'Good morning';
    } else if (hour < 17) {
        greeting = 'Good afternoon';
    } else if (hour < 21) {
        greeting = 'Good evening';
    } else {
        greeting = 'Good night';
    }

    document.getElementById('greeting-text').textContent = greeting;
}

// ========================================
// Clock Widget
// ========================================

function updateClock() {
    const now = new Date();

    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');

    let timeStr;
    if (config.clock.format24h) {
        timeStr = `${hours.toString().padStart(2, '0')}:${minutes}`;
    } else {
        const period = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        timeStr = `${hours}:${minutes} ${period}`;
    }

    if (config.clock.showSeconds) {
        timeStr = timeStr.replace(':' + minutes, `:${minutes}:${seconds}`);
    }

    document.getElementById('clock-time').textContent = timeStr;

    const dateOptions = { weekday: 'long', month: 'long', day: 'numeric' };
    document.getElementById('clock-date').textContent = now.toLocaleDateString('en-US', dateOptions);
}

// ========================================
// Search Widget
// ========================================

function initSearch() {
    const input = document.getElementById('search-input');
    const select = document.getElementById('search-engine-select');

    select.value = config.searchEngine;

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
            const query = encodeURIComponent(input.value.trim());
            const url = SEARCH_ENGINES[config.searchEngine] + query;
            window.location.href = url;
        }
    });

    select.addEventListener('change', () => {
        config.searchEngine = select.value;
        saveConfig();
    });

    // Focus search on page load
    setTimeout(() => input.focus(), 100);
}

// ========================================
// Quick Links Widget
// ========================================

function renderQuickLinks() {
    const grid = document.getElementById('quicklinks-grid');
    grid.innerHTML = '';

    quickLinks.forEach((link, index) => {
        const el = document.createElement('a');
        el.className = 'quicklink';
        el.href = link.url;
        el.innerHTML = `
            <div class="quicklink-icon">
                <img src="https://www.google.com/s2/favicons?domain=${new URL(link.url).hostname}&sz=64" 
                     onerror="this.style.display='none'; this.parentNode.textContent='🔗'">
            </div>
            <span class="quicklink-title">${link.title}</span>
            <button class="quicklink-delete" data-index="${index}">×</button>
        `;
        grid.appendChild(el);
    });

    // Delete handlers
    grid.querySelectorAll('.quicklink-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            quickLinks.splice(index, 1);
            saveQuickLinks();
            renderQuickLinks();
        });
    });
}

function initQuickLinks() {
    const addBtn = document.getElementById('add-link-btn');
    const modal = document.getElementById('add-link-modal');
    const titleInput = document.getElementById('link-title');
    const urlInput = document.getElementById('link-url');
    const saveBtn = document.getElementById('link-save');
    const cancelBtn = document.getElementById('link-cancel');

    addBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
        titleInput.value = '';
        urlInput.value = '';
        titleInput.focus();
    });

    cancelBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    saveBtn.addEventListener('click', () => {
        const title = titleInput.value.trim();
        let url = urlInput.value.trim();

        if (title && url) {
            if (!url.startsWith('http')) {
                url = 'https://' + url;
            }
            quickLinks.push({ title, url });
            saveQuickLinks();
            renderQuickLinks();
            modal.classList.add('hidden');
        }
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });

    renderQuickLinks();
}

// ========================================
// Todo Widget
// ========================================

function renderTodos() {
    const list = document.getElementById('todo-list');
    const count = document.getElementById('task-count');

    list.innerHTML = '';
    const activeTodos = todos.filter(t => !t.completed);
    count.textContent = activeTodos.length;

    todos.forEach((todo, index) => {
        const li = document.createElement('li');
        li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
        li.innerHTML = `
            <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''} data-index="${index}">
            <span class="todo-text">${todo.text}</span>
            <span class="todo-priority-badge ${todo.priority}">${todo.priority}</span>
            <button class="todo-delete" data-index="${index}">🗑</button>
        `;
        list.appendChild(li);
    });

    // Event handlers
    list.querySelectorAll('.todo-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            const index = parseInt(cb.dataset.index);
            todos[index].completed = cb.checked;
            saveTodos();
            renderTodos();
        });
    });

    list.querySelectorAll('.todo-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            todos.splice(index, 1);
            saveTodos();
            renderTodos();
        });
    });
}

function initTodos() {
    const input = document.getElementById('todo-input');
    const priority = document.getElementById('todo-priority');

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
            todos.unshift({
                text: input.value.trim(),
                priority: priority.value,
                completed: false,
                createdAt: Date.now()
            });
            saveTodos();
            renderTodos();
            input.value = '';
        }
    });

    renderTodos();
}

// ========================================
// Notes Widget
// ========================================

function initNotes() {
    const textarea = document.getElementById('notes-textarea');
    const preview = document.getElementById('notes-preview');
    const previewBtn = document.getElementById('notes-preview-btn');
    let showPreview = false;

    textarea.value = notes;

    textarea.addEventListener('input', () => {
        notes = textarea.value;
        saveNotes();
        if (showPreview) {
            renderMarkdown();
        }
    });

    previewBtn.addEventListener('click', () => {
        showPreview = !showPreview;
        if (showPreview) {
            renderMarkdown();
            textarea.classList.add('hidden');
            preview.classList.remove('hidden');
        } else {
            textarea.classList.remove('hidden');
            preview.classList.add('hidden');
        }
    });

    function renderMarkdown() {
        // Simple markdown rendering
        let html = notes
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^# (.+)$/gm, '<h1>$1</h1>')
            .replace(/^- (.+)$/gm, '<li>$1</li>')
            .replace(/\n/g, '<br>');
        preview.innerHTML = html;
    }
}

// ========================================
// Focus Timer Widget
// ========================================

function updateFocusDisplay() {
    const minutes = Math.floor(focusTimer.remaining / 60);
    const seconds = focusTimer.remaining % 60;
    document.getElementById('focus-time').textContent =
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    document.getElementById('focus-sessions').textContent = focusTimer.sessions;
}

function initFocusTimer() {
    const startBtn = document.getElementById('focus-start');
    const resetBtn = document.getElementById('focus-reset');
    const label = document.getElementById('focus-label');

    startBtn.addEventListener('click', () => {
        if (focusTimer.isRunning) {
            // Pause
            clearInterval(focusTimer.interval);
            focusTimer.isRunning = false;
            startBtn.textContent = '▶ Resume';
        } else {
            // Start
            focusTimer.isRunning = true;
            startBtn.textContent = '⏸ Pause';
            focusTimer.interval = setInterval(() => {
                focusTimer.remaining--;
                updateFocusDisplay();

                if (focusTimer.remaining <= 0) {
                    clearInterval(focusTimer.interval);
                    focusTimer.isRunning = false;
                    focusTimer.sessions++;
                    saveFocusSessions();
                    focusTimer.remaining = 5 * 60; // 5 min break
                    label.textContent = 'Break Time!';
                    startBtn.textContent = '▶ Start Break';
                    updateFocusDisplay();

                    // Notification
                    if (Notification.permission === 'granted') {
                        new Notification('Focus session complete!', {
                            body: 'Take a 5 minute break.',
                            icon: '🎯'
                        });
                    }
                }
            }, 1000);
        }
    });

    resetBtn.addEventListener('click', () => {
        clearInterval(focusTimer.interval);
        focusTimer.isRunning = false;
        focusTimer.remaining = 25 * 60;
        label.textContent = 'Focus Session';
        startBtn.textContent = '▶ Start';
        updateFocusDisplay();
    });

    updateFocusDisplay();

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// ========================================
// Settings Panel
// ========================================

function initSettings() {
    const toggle = document.getElementById('settings-toggle');
    const panel = document.getElementById('settings-panel');
    const closeBtn = document.getElementById('settings-close');

    toggle.addEventListener('click', () => {
        panel.classList.remove('hidden');
        panel.classList.add('visible');
    });

    closeBtn.addEventListener('click', () => {
        panel.classList.remove('visible');
        panel.classList.add('hidden');
    });

    // Theme buttons
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            config.theme = btn.dataset.theme;
            saveConfig();
            applyTheme();
        });

        if (btn.dataset.theme === config.theme) {
            btn.classList.add('active');
        }
    });

    // Color buttons
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            config.accentColor = btn.dataset.color;
            saveConfig();
            applyTheme();
        });

        if (btn.dataset.color === config.accentColor) {
            btn.classList.add('active');
        }
    });

    // Background
    const bgType = document.getElementById('bg-type');
    const bgValue = document.getElementById('bg-value');
    const bgSolidOptions = document.getElementById('bg-solid-options');
    const bgColorPicker = document.getElementById('bg-color-picker');

    bgType.value = config.background.type;
    bgValue.value = config.background.value;

    // Show/hide options based on type
    function updateBgOptions() {
        if (bgType.value === 'solid') {
            bgSolidOptions.classList.remove('hidden');
            bgValue.classList.add('hidden');
            // Set color picker to current value if it's a valid hex color
            if (config.background.value && config.background.value.startsWith('#')) {
                bgColorPicker.value = config.background.value;
            }
        } else {
            bgSolidOptions.classList.add('hidden');
            bgValue.classList.remove('hidden');
        }
    }
    updateBgOptions();

    bgType.addEventListener('change', () => {
        config.background.type = bgType.value;
        // Reset value when switching types
        if (bgType.value === 'solid') {
            config.background.value = bgColorPicker.value;
        } else if (bgType.value === 'gradient') {
            config.background.value = 'linear-gradient(135deg, #0f0f1a 0%, #1a1a3a 50%, #0f1a2a 100%)';
            bgValue.value = config.background.value;
        } else {
            config.background.value = '';
            bgValue.value = '';
        }
        updateBgOptions();
        saveConfig();
        applyTheme();
    });

    bgValue.addEventListener('change', () => {
        config.background.value = bgValue.value;
        saveConfig();
        applyTheme();
    });

    // Color picker for solid background
    bgColorPicker.addEventListener('input', () => {
        config.background.value = bgColorPicker.value;
        saveConfig();
        applyTheme();
    });

    // Preset color buttons
    document.querySelectorAll('.bg-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const color = btn.dataset.color;
            bgColorPicker.value = color;
            config.background.value = color;
            saveConfig();
            applyTheme();
        });
    });

    // Clock settings
    const clock24h = document.getElementById('clock-24h');
    const clockSeconds = document.getElementById('clock-seconds');

    clock24h.checked = config.clock.format24h;
    clockSeconds.checked = config.clock.showSeconds;

    clock24h.addEventListener('change', () => {
        config.clock.format24h = clock24h.checked;
        saveConfig();
        updateClock();
    });

    clockSeconds.addEventListener('change', () => {
        config.clock.showSeconds = clockSeconds.checked;
        saveConfig();
        updateClock();
    });

    // Widget visibility
    ['clock', 'search', 'quicklinks', 'todo', 'notes', 'focus'].forEach(id => {
        const checkbox = document.getElementById(`widget-${id}`);
        checkbox.addEventListener('change', () => {
            config.widgets[id] = checkbox.checked;
            saveConfig();
            updateWidgetVisibility();
        });
    });

    // Export/Import
    document.getElementById('export-data').addEventListener('click', () => {
        const data = {
            config,
            todos,
            quickLinks,
            notes
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'aegis-homepage-backup.json';
        a.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById('import-data').addEventListener('click', () => {
        document.getElementById('import-file').click();
    });

    document.getElementById('import-file').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    if (data.config) config = { ...DEFAULT_CONFIG, ...data.config };
                    if (data.todos) todos = data.todos;
                    if (data.quickLinks) quickLinks = data.quickLinks;
                    if (data.notes) notes = data.notes;

                    saveConfig();
                    saveTodos();
                    saveQuickLinks();
                    saveNotes();

                    location.reload();
                } catch (err) {
                    alert('Invalid backup file');
                }
            };
            reader.readAsText(file);
        }
    });
}

// ========================================
// Initialization
// ========================================

function init() {
    loadData();
    applyTheme();
    updateWidgetVisibility();
    updateGreeting();
    updateClock();
    initSearch();
    initQuickLinks();
    initTodos();
    initNotes();
    initFocusTimer();
    initSettings();

    // Update clock every second
    setInterval(updateClock, 1000);

    // Update greeting every minute
    setInterval(updateGreeting, 60000);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Focus search with /
        if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            e.preventDefault();
            document.getElementById('search-input').focus();
        }
    });
}

// Run when DOM is ready
document.addEventListener('DOMContentLoaded', init);
