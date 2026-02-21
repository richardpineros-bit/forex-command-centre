// tooltip-positioning.js - Extracted from index.html Phase 2
// Position fixed tooltips near the trigger element
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('mouseover', (e) => {
        const tooltip = e.target.closest('.regime-tooltip');
        if (!tooltip) return;
        
        const content = tooltip.querySelector('.regime-tooltip-content');
        if (!content) return;
        
        const rect = tooltip.getBoundingClientRect();
        const contentWidth = 300;
        const contentHeight = content.offsetHeight || 150;
        
        // Position above the trigger, centered
        let left = rect.left + (rect.width / 2) - (contentWidth / 2);
        let top = rect.top - contentHeight - 10;
        
        // Keep within viewport
        if (left < 10) left = 10;
        if (left + contentWidth > window.innerWidth - 10) {
            left = window.innerWidth - contentWidth - 10;
        }
        if (top < 10) {
            // Show below if no room above
            top = rect.bottom + 10;
        }
        
        content.style.left = left + 'px';
        content.style.top = top + 'px';
    });
});
