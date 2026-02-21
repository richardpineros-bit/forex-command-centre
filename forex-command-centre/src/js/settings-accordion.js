// settings-accordion.js - FCC Phase 3 extraction
// Settings, export/import, accordion

// ============================================
// CHUNK 7: SETTINGS, EXPORT/IMPORT, AUTO-SAVE
// ============================================

function exportAllData() {
    const data = {
        version: APP_VERSION,
        exportDate: new Date().toISOString(),
        trades: loadFromStorage(STORAGE_KEYS.trades, []),
        scans: loadFromStorage(STORAGE_KEYS.scans, {}),
        settings: loadFromStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
        goals: loadFromStorage(STORAGE_KEYS.goals, {}),
        theme: loadFromStorage(STORAGE_KEYS.theme, 'dark')
    };
    
    const json = JSON.stringify(data, null, 2);
    const filename = `ftcc_backup_${new Date().toISOString().split('T')[0]}.json`;
    
    downloadFile(json, filename, 'application/json');
    
    // Update last backup date
    saveToStorage(STORAGE_KEYS.lastBackup, new Date().toISOString());
    updateSystemInfo();
    
    showToast('Data exported successfully', 'success');
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            // Validate data structure
            if (!data.version || !data.exportDate) {
                throw new Error('Invalid backup file format');
            }
            
            // Confirm import
            if (!confirm(`Import backup from ${formatDate(data.exportDate)}? This will replace all current data.`)) {
                return;
            }
            
            // Import data
            if (data.trades) saveToStorage(STORAGE_KEYS.trades, data.trades);
            if (data.scans) saveToStorage(STORAGE_KEYS.scans, data.scans);
            if (data.settings) saveToStorage(STORAGE_KEYS.settings, data.settings);
            if (data.goals) saveToStorage(STORAGE_KEYS.goals, data.goals);
            if (data.theme) {
                saveToStorage(STORAGE_KEYS.theme, data.theme);
                setTheme(data.theme);
            }
            
            // Refresh all views
            loadSettings();
            loadTrades();
            updateDashboard();
            updateSystemInfo();
            
            showToast(`Imported ${data.trades?.length || 0} trades successfully`, 'success');
            
        } catch (error) {
            console.error('Import error:', error);
            showToast('Import failed: ' + error.message, 'error');
        }
    };
    
    reader.readAsText(file);
    event.target.value = ''; // Reset file input
}


function clearAllData() {
    if (!confirm(' This will DELETE ALL DATA including trades, scans, and settings. Continue?')) return;
    
    const confirmText = prompt('Type "DELETE ALL" to confirm:');
    if (confirmText !== 'DELETE ALL') {
        showToast('Deletion cancelled', 'info');
        return;
    }
    
    // Clear all storage keys
    Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
    });
    
    // Reset to defaults
    saveToStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
    saveToStorage(STORAGE_KEYS.theme, 'dark');
    saveToStorage(STORAGE_KEYS.trades, []);
    saveToStorage(STORAGE_KEYS.scans, {});
    
    // Refresh
    setTheme('dark');
    loadSettings();
    loadTrades();
    updateDashboard();
    updateSystemInfo();
    
    showToast('All data cleared', 'info');
}

// ============================================
// ACCORDION FUNCTIONS (Reference Guide)
// ============================================

function toggleAccordion(header) {
    const item = header.parentElement;
    const content = header.nextElementSibling;
    const isOpen = item.classList.contains('open');
    
    // Close all others
    document.querySelectorAll('.accordion-item.open').forEach(i => {
        if (i !== item) {
            i.classList.remove('open');
            i.querySelector('.accordion-content').style.maxHeight = null;
        }
    });
    
    // Toggle current
    if (isOpen) {
        item.classList.remove('open');
        content.style.maxHeight = null;
    } else {
        item.classList.add('open');
        content.style.maxHeight = content.scrollHeight + 'px';
    }
}

// Add accordion styles
const accordionStyles = document.createElement('style');
accordionStyles.textContent = `
    .accordion-item {
        border: 1px solid var(--border-primary);
        border-radius: var(--radius-md);
        margin-bottom: var(--spacing-sm);
        overflow: hidden;
    }
    .accordion-header {
        padding: var(--spacing-md);
        background: var(--bg-tertiary);
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: 500;
        transition: background var(--transition-fast);
    }
    .accordion-header:hover {
        background: var(--bg-hover);
    }
    .accordion-header::after {
        content: '+';
        font-size: 1.2rem;
        transition: transform var(--transition-fast);
    }
    .accordion-item.open .accordion-header::after {
        content: '';
    }
    .accordion-content {
        max-height: 0;
        overflow: hidden;
        transition: max-height 0.3s ease;
        padding: 0 var(--spacing-md);
    }
    .accordion-item.open .accordion-content {
        padding: var(--spacing-md);
    }
    .accordion-content p {
        margin-bottom: var(--spacing-sm);
    }
    .accordion-content ul {
        margin: var(--spacing-sm) 0;
        padding-left: var(--spacing-lg);
    }
    .accordion-content li {
        margin-bottom: var(--spacing-xs);
    }
`;
document.head.appendChild(accordionStyles);

// CHUNK 7 COMPLETE - Settings, Export/Import, Auto-save
