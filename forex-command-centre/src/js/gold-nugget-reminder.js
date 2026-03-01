// ============================================
// GOLD NUGGET REMINDER v1.0.0
// Daily Spaced Repetition Modal
// ============================================
// Shows random principle on dashboard load (30% chance, max once per day)
// Purpose: Embed institutional mindset through repetition
// ============================================

(function() {
    'use strict';

    const MODULE_VERSION = '1.0.0';
    const STORAGE_KEY = 'ftcc_nugget_reminder_shown_today';
    const SHOW_PROBABILITY = 0.30; // 30% chance on dashboard load

    window.GoldNuggetReminder = {
        init: init,
        showReminder: showReminder,
        showReminderNow: showReminderNow,
        skipReminder: skipReminder
    };

    function init() {
        console.log('GoldNuggetReminder v' + MODULE_VERSION + ' initialised');
        return true;
    }

    /**
     * Called on dashboard load - 30% chance to show
     */
    function showReminder() {
        // Check if already shown today
        const shownToday = localStorage.getItem(STORAGE_KEY);
        if (shownToday) {
            return; // Already shown, don't show again
        }

        // 30% probability check
        if (Math.random() > SHOW_PROBABILITY) {
            return; // Probability check failed, skip
        }

        // Show the reminder
        showReminderNow();
    }

    /**
     * Force show reminder immediately (for testing or manual trigger)
     */
    function showReminderNow() {
        if (!window.GoldNuggetPrinciples) {
            console.warn('GoldNuggetReminder: GoldNuggetPrinciples not loaded');
            return;
        }

        const principle = window.GoldNuggetPrinciples.getRandomPrinciple();
        const formatted = window.GoldNuggetPrinciples.formatPrincipleForDisplay(principle);

        // Build modal HTML
        const html = `
            <div id="gold-nugget-modal-overlay" style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            ">
                <div style="
                    background-color: white;
                    border-radius: 8px;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                    max-width: 600px;
                    width: 90%;
                    padding: 32px;
                    animation: slideIn 0.3s ease-out;
                ">
                    <div style="
                        display: flex;
                        align-items: flex-start;
                        gap: 16px;
                        margin-bottom: 20px;
                    ">
                        <span style="
                            font-size: 2rem;
                            flex-shrink: 0;
                        ">${formatted.icon}</span>
                        <div>
                            <div style="
                                font-size: 0.8rem;
                                color: #666;
                                text-transform: uppercase;
                                letter-spacing: 0.5px;
                                margin-bottom: 6px;
                            ">${formatted.category} · ${formatted.priority}</div>
                            <h2 style="
                                margin: 0 0 12px 0;
                                font-size: 1.3rem;
                                font-weight: 600;
                                color: #1a1a1a;
                            ">${formatted.title}</h2>
                        </div>
                    </div>

                    <div style="
                        background-color: #f8f9fa;
                        border-left: 4px solid #007bff;
                        padding: 16px;
                        border-radius: 4px;
                        margin-bottom: 24px;
                        line-height: 1.6;
                        color: #333;
                    ">${formatted.detail}</div>

                    <div style="
                        display: flex;
                        gap: 12px;
                        justify-content: flex-end;
                    ">
                        <button onclick="GoldNuggetReminder.skipReminder();" style="
                            padding: 10px 20px;
                            border: 1px solid #ddd;
                            background-color: white;
                            color: #333;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 0.9rem;
                            font-weight: 500;
                            transition: all 0.2s;
                        " onmouseover="this.style.backgroundColor='#f0f0f0'" onmouseout="this.style.backgroundColor='white'">
                            Dismiss
                        </button>
                        <button onclick="GoldNuggetReminder.showReminderNow();" style="
                            padding: 10px 20px;
                            border: none;
                            background-color: #007bff;
                            color: white;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 0.9rem;
                            font-weight: 500;
                            transition: all 0.2s;
                        " onmouseover="this.style.backgroundColor='#0056b3'" onmouseout="this.style.backgroundColor='#007bff'">
                            Another One
                        </button>
                        <button onclick="GoldNuggetReminder.closeModal();" style="
                            padding: 10px 20px;
                            border: none;
                            background-color: #28a745;
                            color: white;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 0.9rem;
                            font-weight: 500;
                            transition: all 0.2s;
                        " onmouseover="this.style.backgroundColor='#1e7e34'" onmouseout="this.style.backgroundColor='#28a745'">
                            Got It
                        </button>
                    </div>
                </div>
            </div>

            <style>
                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            </style>
        `;

        // Insert modal into DOM
        const container = document.createElement('div');
        container.id = 'gold-nugget-reminder-container';
        container.innerHTML = html;
        document.body.appendChild(container);

        // Mark as shown today
        const today = new Date().toDateString();
        localStorage.setItem(STORAGE_KEY, today);

        console.log('GoldNuggetReminder: Showed principle - ' + principle.principle);
    }

    /**
     * Close modal without marking as shown (allows replay)
     */
    window.GoldNuggetReminder.closeModal = function() {
        const overlay = document.getElementById('gold-nugget-modal-overlay');
        const container = document.getElementById('gold-nugget-reminder-container');
        
        if (overlay) overlay.style.animation = 'slideOut 0.3s ease-in';
        
        setTimeout(() => {
            if (container) container.remove();
        }, 300);
    };

    /**
     * Skip reminder (close without replaying)
     */
    function skipReminder() {
        window.GoldNuggetReminder.closeModal();
    }

    // Initialise on DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            init();
        }, 500);
    });

})();

// MODULE COMPLETE - Gold Nugget Reminder v1.0.0
