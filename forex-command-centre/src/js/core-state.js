// core-state.js - FCC Phase 3 extraction
// App constants, utilities, storage, settings

// CHUNK 1: CORE STATE & UTILITIES
// ============================================

// Application State
const APP_VERSION = '2.7.0';
const STORAGE_KEYS = {
    trades: 'ftcc_trades',
    scans: 'ftcc_scans',
    settings: 'ftcc_settings',
    theme: 'ftcc_theme',
    goals: 'ftcc_goals',
    lastBackup: 'ftcc_last_backup',
    noTrades: 'ftcc_no_trades'
};

// Default Settings
const DEFAULT_SETTINGS = {
    accountBalance: 2000,
    peakBalance: 2000,
    defaultRisk: 1.5,
    currency: 'AUD',
    autoSave: true,
    backupReminder: 7 // days
};

// Core Pairs & Rotation Pairs
const CORE_PAIRS = ['AUDUSD', 'USDJPY', 'EURUSD'];
const ROTATION_PAIRS = ['GBPUSD', 'EURJPY', 'GBPJPY', 'AUDJPY', 'NZDJPY', 'NZDUSD', 'USDCAD', 'USDCHF', 'EURGBP'];
const ALL_PAIRS = [...CORE_PAIRS, ...ROTATION_PAIRS];

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatCurrency(amount, currency = 'AUD') {
    return new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2
    }).format(amount);
}

function formatNumber(num, decimals = 2) {
    return Number(num).toFixed(decimals);
}

function formatDate(date, format = 'short') {
    const d = new Date(date);
    if (format === 'short') {
        return d.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: '2-digit' });
    }
    return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(date) {
    const d = new Date(date);
    return d.toLocaleDateString('en-AU', { 
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
    });
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function getWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getWeekRange(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: monday, end: sunday };
}

function isThisWeek(date) {
    const { start, end } = getWeekRange();
    const d = new Date(date);
    return d >= start && d <= end;
}

// ============================================
// LOCAL STORAGE FUNCTIONS
// ============================================

function saveToStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        return true;
    } catch (e) {
        console.error('Storage save error:', e);
        showToast('Storage error - data may not be saved', 'error');
        return false;
    }
}

function loadFromStorage(key, defaultValue = null) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : defaultValue;
    } catch (e) {
        console.error('Storage load error:', e);
        return defaultValue;
    }
}

function getStorageSize() {
    let total = 0;
    for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
            total += localStorage[key].length * 2; // UTF-16 = 2 bytes per char
        }
    }
    return (total / 1024).toFixed(2) + ' KB';
}

// ============================================
// SETTINGS MANAGEMENT
// ============================================

function loadSettings() {
    const saved = loadFromStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
    const settings = { ...DEFAULT_SETTINGS, ...saved };
    
    // Apply to UI
    const balanceInput = document.getElementById('settings-balance');
    const peakInput = document.getElementById('settings-peak');
    const riskSelect = document.getElementById('settings-risk');
    const currencySelect = document.getElementById('settings-currency');
    
    if (balanceInput) balanceInput.value = settings.accountBalance;
    if (peakInput) peakInput.value = settings.peakBalance;
    if (riskSelect) riskSelect.value = settings.defaultRisk;
    if (currencySelect) currencySelect.value = settings.currency;
    
    return settings;
}

function saveSettings() {
    const settings = {
        accountBalance: parseFloat(document.getElementById('settings-balance')?.value) || 2000,
        peakBalance: parseFloat(document.getElementById('settings-peak')?.value) || 2000,
        defaultRisk: parseFloat(document.getElementById('settings-risk')?.value) || 1.5,
        currency: document.getElementById('settings-currency')?.value || 'AUD',
        autoSave: true,
        backupReminder: 7
    };
    
    saveToStorage(STORAGE_KEYS.settings, settings);
    showToast('Settings saved successfully', 'success');
    
    // Update dashboard
    updateDashboard();
    updateSystemInfo();
}

function getSettings() {
    return loadFromStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
}

// ============================================
