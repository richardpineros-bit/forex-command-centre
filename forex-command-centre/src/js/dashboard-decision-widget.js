// ============================================
// DASHBOARD DECISION WIDGET v1.0.0
// Your Decision Today - News Day Prep
// ============================================

(function() {
    'use strict';

    const STORAGE_KEY = 'ftcc_decision_today';

    window.DashboardDecisionWidget = {
        init: init,
        updateDecisionDisplay: updateDecisionDisplay,
        setDecision: setDecision
    };

    function init() {
        console.log('DashboardDecisionWidget v1.0.0 initialised');
        updateDecisionDisplay();
        return true;
    }

    function updateDecisionDisplay() {
        const container = document.getElementById('dashboard-decision-container');
        if (!container) return;

        const decision = localStorage.getItem(STORAGE_KEY);

        const options = [
            { value: 'trade-normal', label: 'Trade Normally', icon: '✓', colour: '#28a745', bgColour: '#d4edda' },
            { value: 'reduce-size', label: 'Reduce Size (1%)', icon: '⚡', colour: '#ffc107', bgColour: '#fff3cd' },
            { value: 'skip-pairs', label: 'Skip Affected Pairs', icon: '⏸', colour: '#17a2b8', bgColour: '#d1ecf1' },
            { value: 'stand-down', label: 'Stand Down', icon: '🛑', colour: '#dc3545', bgColour: '#f8d7da' }
        ];

        let html = `
            <div style="
                padding: 12px;
                background-color: #f8f9fa;
                border-radius: 4px;
                border: 1px solid #e0e0e0;
            ">
                <div style="font-size: 0.75rem; color: #666; text-transform: uppercase; margin-bottom: 12px; font-weight: 600;">
                    Your Decision Today
                </div>
        `;

        if (decision) {
            const opt = options.find(o => o.value === decision);
            if (opt) {
                html += `
                    <div style="
                        padding: 12px;
                        background-color: ${opt.bgColour};
                        border-left: 4px solid ${opt.colour};
                        border-radius: 4px;
                        margin-bottom: 12px;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    ">
                        <span style="font-size: 1.1rem;">${opt.icon}</span>
                        <div>
                            <div style="font-weight: 600; color: ${opt.colour};">${opt.label}</div>
                            <div style="font-size: 0.8rem; color: #555; margin-top: 2px;">Set today at ${new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                    </div>
                `;
            }
        } else {
            html += `
                <div style="font-size: 0.85rem; color: #999; margin-bottom: 12px;">
                    No decision set for today. Choose one:
                </div>
            `;
        }

        html += `<div style="display: flex; flex-wrap: wrap; gap: 8px;">`;

        for (let opt of options) {
            const isSelected = decision === opt.value;
            html += `
                <button onclick="DashboardDecisionWidget.setDecision('${opt.value}'); DashboardDecisionWidget.updateDecisionDisplay();" style="
                    padding: 8px 12px;
                    border: ${isSelected ? '2px solid ' + opt.colour : '1px solid #ddd'};
                    background-color: ${isSelected ? opt.bgColour : 'white'};
                    color: ${isSelected ? opt.colour : '#333'};
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 0.8rem;
                    font-weight: ${isSelected ? '600' : '500'};
                    transition: all 0.2s;
                " onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform='translateY(0)'">
                    ${opt.icon} ${opt.label}
                </button>
            `;
        }

        html += `</div></div>`;
        container.innerHTML = html;
    }

    function setDecision(value) {
        localStorage.setItem(STORAGE_KEY, value);
        console.log('DashboardDecisionWidget: Decision set to', value);
    }

    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => { init(); }, 1000);
    });

})();
