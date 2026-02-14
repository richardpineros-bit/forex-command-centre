/**
 * Gold Nugget Guide Module
 * Forex Command Centre v2.1.0
 * 
 * Displays the UTCC Daily Rules & Gold Nugget Guide as a read-only reference modal.
 */

(function() {
    'use strict';
    
    const GoldNuggetGuide = {
        
        /**
         * Show the guide modal
         */
        show: function() {
            // Remove existing if any
            const existing = document.getElementById('gold-nugget-modal-overlay');
            if (existing) existing.remove();
            
            const modalHTML = `
                <div class="modal-overlay active" id="gold-nugget-modal-overlay">
                    <div class="modal gold-nugget-modal" id="gold-nugget-modal">
                        <div class="modal-header">
                            <h3 class="modal-title">&#x1F4D6; Daily Rules &#x2022; Gold Nugget Guide</h3>
                            <button class="modal-close" onclick="GoldNuggetGuide.close()">&times;</button>
                        </div>
                        <div class="modal-body gold-nugget-content">
                            ${this.getGuideContent()}
                        </div>
                    </div>
                </div>
            `;
            
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            
            // Setup close handlers
            document.getElementById('gold-nugget-modal-overlay').addEventListener('click', (e) => {
                if (e.target.id === 'gold-nugget-modal-overlay') {
                    this.close();
                }
            });
        },
        
        /**
         * Close the modal
         */
        close: function() {
            const modal = document.getElementById('gold-nugget-modal-overlay');
            if (modal) {
                modal.classList.remove('active');
                setTimeout(() => modal.remove(), 200);
            }
        },
        
        /**
         * Get the guide content (HTML)
         */
        getGuideContent: function() {
            return `
                <div class="gng-section gng-prime">
                    <h4>&#x1F3AF; The Prime Directive</h4>
                    <p class="gng-highlight">UTCC never tells you to trade; it tells you when you're allowed to look.</p>
                    <p>Your job is not to "catch moves"; it's to only execute when permission + location + trigger align.</p>
                </div>
                
                <div class="gng-section">
                    <h4>&#x23F0; Your Operating Hours</h4>
                    <div class="gng-grid">
                        <div class="gng-card gng-pass">
                            <strong>Tradeable (Execute)</strong>
                            <ul>
                                <li>Tokyo</li>
                                <li>London</li>
                            </ul>
                        </div>
                        <div class="gng-card gng-warn">
                            <strong>Prep Only (No Entries)</strong>
                            <ul>
                                <li>Off-Hours</li>
                                <li>NY</li>
                                <li>LON+NY</li>
                            </ul>
                        </div>
                    </div>
                    <p class="gng-nugget">&#x1F4A1; Brain-dead rule: Tokyo/London = execute; everything else = prepare.</p>
                </div>
                
                <div class="gng-section">
                    <h4>&#x1F514; Alert Meanings (No Interpretation Needed)</h4>
                    
                    <div class="gng-alert-box gng-candidate">
                        <div class="gng-alert-header">
                            <span class="gng-alert-icon">&#x1F440;</span>
                            <span class="gng-alert-name">CONTEXT CANDIDATE (&#x2191;/&#x2193;)</span>
                        </div>
                        <div class="gng-alert-meaning"><strong>Meaning:</strong> "Heads-up; this could become tradeable. Watch it."</div>
                        <div class="gng-alert-action"><strong>Action:</strong> Put it on the watchlist; do NOT trade from this alert.</div>
                    </div>
                    
                    <div class="gng-alert-box gng-armed">
                        <div class="gng-alert-header">
                            <span class="gng-alert-icon">&#x2705;</span>
                            <span class="gng-alert-name">CONTEXT ARMED (&#x2191;/&#x2193;)</span>
                        </div>
                        <div class="gng-alert-meaning"><strong>Meaning:</strong> "Permission granted; you may run the trade process."</div>
                        <div class="gng-alert-action"><strong>Action:</strong> Open Command Centre and start the checklist.</div>
                    </div>
                    
                    <div class="gng-alert-box gng-disarmed">
                        <div class="gng-alert-header">
                            <span class="gng-alert-icon">&#x26D4;</span>
                            <span class="gng-alert-name">CONTEXT DISARMED</span>
                        </div>
                        <div class="gng-alert-meaning"><strong>Meaning:</strong> "Bias cancelled; stop hunting this."</div>
                        <div class="gng-alert-action"><strong>Action:</strong> Remove from watchlist; no 'one more look'.</div>
                    </div>
                    
                    <div class="gng-alert-box gng-reset">
                        <div class="gng-alert-header">
                            <span class="gng-alert-icon">&#x1F504;</span>
                            <span class="gng-alert-name">SESSION RESET</span>
                        </div>
                        <div class="gng-alert-meaning"><strong>Meaning:</strong> "New session logic; re-evaluate from scratch."</div>
                        <div class="gng-alert-action"><strong>Action:</strong> Wipe bias; re-rank your watchlist.</div>
                    </div>
                </div>
                
                <div class="gng-section">
                    <h4>&#x1F501; The Daily Loop</h4>
                    
                    <div class="gng-step">
                        <div class="gng-step-num">1</div>
                        <div class="gng-step-content">
                            <strong>Morning / Pre-session (2-5 minutes)</strong>
                            <p>Goal: Start clean; no emotional carry-over.</p>
                            <ul>
                                <li>DISARMED &#x2192; delete those ideas</li>
                                <li>CANDIDATE during Off-Hours &#x2192; mark "prep-only"</li>
                                <li>ARMED during Off-Hours &#x2192; mark "permission noted; wait for tradeable session"</li>
                                <li>Decide what session you will trade today</li>
                            </ul>
                            <p class="gng-nugget">&#x1F4A1; If you haven't decided your session; you're trading your emotions.</p>
                        </div>
                    </div>
                    
                    <div class="gng-step">
                        <div class="gng-step-num">2</div>
                        <div class="gng-step-content">
                            <strong>SESSION RESET Arrives</strong>
                            <p>This is your hard reset trigger. Do immediately:</p>
                            <ol>
                                <li>Open Command Centre and create Session Board</li>
                                <li>Write: Today I trade: Tokyo / London</li>
                                <li>Write: Max trades: 1-2 per session</li>
                                <li>Write: Allowed playbooks: Continuation / Deep Pullback</li>
                            </ol>
                            <p class="gng-nugget">&#x1F4A1; Session Reset is the "start of the game"; not a notification.</p>
                        </div>
                    </div>
                    
                    <div class="gng-step">
                        <div class="gng-step-num">3</div>
                        <div class="gng-step-content">
                            <strong>When a CANDIDATE Alert Hits</strong>
                            <p><em>If Tokyo or London (tradeable):</em> 1-minute triage</p>
                            <ul>
                                <li>Open chart</li>
                                <li>Identify direction, playbook, zone (HOT/OPTIMAL), S/R</li>
                                <li>If clean &#x2192; mark "Candidate; waiting for ARMED"</li>
                                <li>If messy &#x2192; ignore. No explanation needed.</li>
                            </ul>
                            <p><em>If Off-Hours / NY / LON+NY (prep-only):</em> 30-second triage</p>
                            <ul>
                                <li>Mark "prep-only; check next tradeable session"</li>
                                <li>Do nothing else.</li>
                            </ul>
                            <p class="gng-nugget">&#x1F4A1; Candidate is a spotlight; not a green light.</p>
                        </div>
                    </div>
                    
                    <div class="gng-step">
                        <div class="gng-step-num">4</div>
                        <div class="gng-step-content">
                            <strong>When an ARMED Alert Hits</strong>
                            <p>If Tokyo or London: Run the Command Centre checklist (non-negotiable)</p>
                            <div class="gng-checklist">
                                <div class="gng-check-group">
                                    <span class="gng-check-label">A) Permission</span>
                                    <ul>
                                        <li>&#x2610; ARMED matches direction</li>
                                        <li>&#x2610; Not in prep-only session</li>
                                    </ul>
                                </div>
                                <div class="gng-check-group">
                                    <span class="gng-check-label">B) Location</span>
                                    <ul>
                                        <li>&#x2610; Price in HOT/OPTIMAL zone</li>
                                        <li>&#x2610; Not directly into S/R</li>
                                        <li>&#x2610; EMA structure supports playbook</li>
                                    </ul>
                                </div>
                                <div class="gng-check-group">
                                    <span class="gng-check-label">C) Trigger</span>
                                    <ul>
                                        <li>&#x2610; ONE trigger per playbook (no freestyle)</li>
                                        <li>Continuation: pullback + rejection + break</li>
                                        <li>Deep Pullback: reclaim + confirmation + break</li>
                                    </ul>
                                </div>
                                <div class="gng-check-group">
                                    <span class="gng-check-label">D) Risk</span>
                                    <ul>
                                        <li>&#x2610; Invalidation level makes sense</li>
                                        <li>&#x2610; R:R meets minimum (1.5:1)</li>
                                        <li>&#x2610; Position size matches status</li>
                                    </ul>
                                </div>
                            </div>
                            <p class="gng-highlight">Only when A+B+C+D are all checked: place the trade.</p>
                            <p class="gng-nugget">&#x1F4A1; ARMED means "start process"; not "press buy".</p>
                        </div>
                    </div>
                    
                    <div class="gng-step">
                        <div class="gng-step-num">5</div>
                        <div class="gng-step-content">
                            <strong>After Entry (Management)</strong>
                            <p>Your job is protect capital + reduce decisions.</p>
                            <ul>
                                <li>If DISARMED prints &#x2192; do not add; consider reduce/exit</li>
                                <li>If MTF degradation &#x2192; tighten; don't hope</li>
                            </ul>
                            <p class="gng-nugget">&#x1F4A1; A professional exits because the reason changed; not because they "feel" it.</p>
                        </div>
                    </div>
                    
                    <div class="gng-step">
                        <div class="gng-step-num">6</div>
                        <div class="gng-step-content">
                            <strong>End-of-Session Wrap (3 minutes)</strong>
                            <ul>
                                <li>Screenshot or note alerts acted on / ignored and why</li>
                                <li>One improvement</li>
                                <li>Update journal: Playbook, entry type, location grade, outcome</li>
                            </ul>
                            <p class="gng-nugget">&#x1F4A1; Your edge compounds through journalling; not through more indicators.</p>
                        </div>
                    </div>
                </div>
                
                <div class="gng-section gng-rules">
                    <h4>&#x1F6D1; 4 Non-Negotiable Rules</h4>
                    <ol class="gng-non-neg">
                        <li>No trade on CANDIDATE.</li>
                        <li>ARMED starts the process; does not force execution.</li>
                        <li>Off-Hours = prep-only.</li>
                        <li>DISARMED cancels bias; stop hunting.</li>
                    </ol>
                </div>
                
                <div class="gng-section gng-confused">
                    <h4>&#x1F914; "If I'm Confused; Do This"</h4>
                    <div class="gng-decision-tree">
                        <div class="gng-decision">
                            <span class="gng-q">Ask:</span> "Do I have permission?"
                            <span class="gng-a">If not ARMED &#x2192; STOP</span>
                        </div>
                        <div class="gng-decision">
                            <span class="gng-q">Ask:</span> "Am I in a tradeable session?"
                            <span class="gng-a">If not &#x2192; PREP ONLY</span>
                        </div>
                        <div class="gng-decision">
                            <span class="gng-q">Ask:</span> "Is location clean?"
                            <span class="gng-a">If not &#x2192; NO TRADE</span>
                        </div>
                        <div class="gng-decision">
                            <span class="gng-q">Ask:</span> "Do I have my one trigger?"
                            <span class="gng-a">If not &#x2192; NO TRADE</span>
                        </div>
                    </div>
                    <p class="gng-highlight">That sequence stops 95% of mistakes.</p>
                </div>
                
                <div class="gng-section">
                    <h4>&#x1F4CA; Recommended Alert Volume</h4>
                    <p>Across your 3 pairs:</p>
                    <ul>
                        <li><strong>CANDIDATE:</strong> ~2-5 per day</li>
                        <li><strong>ARMED:</strong> ~1-3 per day</li>
                        <li><strong>Trades taken:</strong> usually 0-2 per session, not "every alert"</li>
                    </ul>
                    <p class="gng-nugget">&#x1F4A1; That is an institutional rhythm; fewer decisions; higher quality; repeatable process.</p>
                </div>
            `;
        }
    };
    
    // Export to window
    window.GoldNuggetGuide = GoldNuggetGuide;
    
})();
