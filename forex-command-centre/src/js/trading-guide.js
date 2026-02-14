/**
 * UTCC Trading Reference Guide
 * Forex Command Centre v2.6.0
 * Guide v2.0.0
 * 
 * Comprehensive trading reference combining:
 * - Daily Rules & Gold Nuggets
 * - UTCC System Overview (Institutional Audit v1.4.0)
 * - Permission Log Definitions
 * - Context Assessment Flow
 * - Playbook Map & Definitions
 * - Validation Criteria
 * - Non-Negotiables & Override Protocol
 * - Session & Exit Rules
 * - Worked Examples
 */

(function() {
    'use strict';
    
    const TradingGuide = {
        
        // Current section for navigation
        currentSection: 'overview',
        
        // Section definitions
        sections: [
            { id: 'overview', name: 'Overview', icon: '&#x1F3AF;' },
            { id: 'definitions', name: 'Definitions', icon: '&#x1F4CB;' },
            { id: 'context', name: 'Context Flow', icon: '&#x23F1;' },
            { id: 'alerts', name: 'Alerts', icon: '&#x1F514;' },
            { id: 'workflow', name: 'Daily Workflow', icon: '&#x1F501;' },
            { id: 'playbooks', name: 'Playbooks', icon: '&#x1F4D6;' },
            { id: 'validation', name: 'Validation', icon: '&#x2705;' },
            { id: 'zones', name: 'Entry Zones', icon: '&#x1F3AF;' },
            { id: 'exits', name: 'Exits', icon: '&#x1F6AA;' },
            { id: 'rules', name: 'Rules', icon: '&#x1F6D1;' },
            { id: 'examples', name: 'Examples', icon: '&#x1F4A1;' },
            { id: 'glossary', name: 'Glossary', icon: '&#x1F4D6;' }
        ],
        
        /**
         * Show the guide modal
         */
        show: function(section) {
            section = section || 'overview';
            this.currentSection = section;
            
            // Remove existing if any
            var existing = document.getElementById('trading-guide-modal-overlay');
            if (existing) existing.remove();
            
            var navHTML = '';
            for (var i = 0; i < this.sections.length; i++) {
                var s = this.sections[i];
                navHTML += '<button class="guide-nav-btn ' + (s.id === section ? 'active' : '') + '" ' +
                    'onclick="TradingGuide.showSection(\'' + s.id + '\')">' +
                    '<span>' + s.icon + '</span>' +
                    '<span>' + s.name + '</span>' +
                '</button>';
            }
            
            var modalHTML = '<div class="modal-overlay active" id="trading-guide-modal-overlay">' +
                '<div class="modal trading-guide-modal" id="trading-guide-modal">' +
                    '<div class="modal-header">' +
                        '<h3 class="modal-title">&#x1F4D6; UTCC Trading Reference (v2.5)</h3>' +
                        '<button class="modal-close" onclick="TradingGuide.close()">&times;</button>' +
                    '</div>' +
                    '<div class="guide-layout">' +
                        '<nav class="guide-nav">' + navHTML + '</nav>' +
                        '<div class="guide-content" id="guide-content">' +
                            this.getContent(section) +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';
            
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            
            // Close on overlay click
            document.getElementById('trading-guide-modal-overlay').addEventListener('click', function(e) {
                if (e.target.id === 'trading-guide-modal-overlay') {
                    TradingGuide.close();
                }
            });
        },
        
        /**
         * Show specific section
         */
        showSection: function(sectionId) {
            this.currentSection = sectionId;
            
            // Update nav
            var btns = document.querySelectorAll('.guide-nav-btn');
            for (var i = 0; i < btns.length; i++) {
                btns[i].classList.remove('active');
            }
            var activeBtn = document.querySelector('.guide-nav-btn[onclick*="' + sectionId + '"]');
            if (activeBtn) activeBtn.classList.add('active');
            
            // Update content
            var content = document.getElementById('guide-content');
            if (content) {
                content.innerHTML = this.getContent(sectionId);
                content.scrollTop = 0;
            }
        },
        
        /**
         * Close modal
         */
        close: function() {
            var modal = document.getElementById('trading-guide-modal-overlay');
            if (modal) {
                modal.classList.remove('active');
                setTimeout(function() { modal.remove(); }, 200);
            }
        },
        
        /**
         * Get content for section
         */
        getContent: function(sectionId) {
            var contentMap = {
                'overview': this.getOverviewContent(),
                'definitions': this.getDefinitionsContent(),
                'context': this.getContextContent(),
                'alerts': this.getAlertsContent(),
                'workflow': this.getWorkflowContent(),
                'playbooks': this.getPlaybooksContent(),
                'validation': this.getValidationContent(),
                'zones': this.getZonesContent(),
                'exits': this.getExitsContent(),
                'rules': this.getRulesContent(),
                'examples': this.getExamplesContent(),
                'glossary': this.getGlossaryContent()
            };
            return contentMap[sectionId] || '<p>Section not found</p>';
        },
        
        // ============================================
        // SECTION: OVERVIEW
        // ============================================
        getOverviewContent: function() {
            return '<div class="guide-section">' +
                '<div class="guide-hero">' +
                    '<h2>&#x1F3AF; The Prime Directive</h2>' +
                    '<p class="guide-highlight">UTCC grants permission to hunt; price action triggers execution.</p>' +
                    '<p>Your job is not to "catch moves". It is to only execute when <strong>permission + location + trigger</strong> all align.</p>' +
                '</div>' +

                '<h3>What is UTCC?</h3>' +
                '<p><strong>Unified Trading Command Center</strong> &mdash; A systematic permission system that replaces gut feelings with objective criteria. It is a filter, not a signal generator.</p>' +

                '<div class="guide-box guide-box-info">' +
                    '<strong>The Core Principle</strong>' +
                    '<p>UTCC grants permission to hunt; price action earns the entry. If the system says GO but the setup looks bad, you do not trade. The system assumes the trader will eventually act irrationally; the system stops them.</p>' +
                '</div>' +

                '<h3>The 5-Minute Version</h3>' +
                '<div class="guide-flow">' +
                    '<div class="flow-step">' +
                        '<span class="flow-num">1</span>' +
                        '<strong>Alert Fires</strong>' +
                        '<span>UTCC says "permission granted"</span>' +
                    '</div>' +
                    '<div class="flow-arrow">&#x2192;</div>' +
                    '<div class="flow-step">' +
                        '<span class="flow-num">2</span>' +
                        '<strong>Wait 1+ Candle</strong>' +
                        '<span>Never trade the alert candle</span>' +
                    '</div>' +
                    '<div class="flow-arrow">&#x2192;</div>' +
                    '<div class="flow-step">' +
                        '<span class="flow-num">3</span>' +
                        '<strong>Name Playbook</strong>' +
                        '<span>If you cannot name it, pass</span>' +
                    '</div>' +
                    '<div class="flow-arrow">&#x2192;</div>' +
                    '<div class="flow-step">' +
                        '<span class="flow-num">4</span>' +
                        '<strong>Validate</strong>' +
                        '<span>Run the checklist</span>' +
                    '</div>' +
                    '<div class="flow-arrow">&#x2192;</div>' +
                    '<div class="flow-step">' +
                        '<span class="flow-num">5</span>' +
                        '<strong>Execute or Pass</strong>' +
                        '<span>No middle ground</span>' +
                    '</div>' +
                '</div>' +

                '<h3>Your Trading Sessions (AEST)</h3>' +
                '<div class="guide-grid-2">' +
                    '<div class="guide-box guide-box-pass">' +
                        '<strong>&#x2705; Tradeable (Execute)</strong>' +
                        '<ul>' +
                            '<li><strong>Tokyo:</strong> 9:00 AM &ndash; 5:00 PM</li>' +
                            '<li><strong>London:</strong> 5:00 PM &ndash; 10:00 PM</li>' +
                        '</ul>' +
                        '<p class="guide-small">Your availability: 8am&ndash;10pm AEST</p>' +
                    '</div>' +
                    '<div class="guide-box guide-box-warn">' +
                        '<strong>&#x26A0; Prep Only (No Entries)</strong>' +
                        '<ul>' +
                            '<li>Off-Hours</li>' +
                            '<li>New York</li>' +
                            '<li>London+NY Overlap</li>' +
                        '</ul>' +
                        '<p class="guide-small">Watch, prepare, but do not execute</p>' +
                    '</div>' +
                '</div>' +

                '<div class="guide-nugget">' +
                    '&#x1F4A1; <strong>Gold Nugget:</strong> If you have not decided your session before it starts, you are trading your emotions.' +
                '</div>' +
            '</div>';
        },

        // ============================================
        // SECTION: DEFINITIONS (NEW)
        // ============================================
        getDefinitionsContent: function() {
            return '<div class="guide-section">' +
                '<h2>&#x1F4CB; Definitions at a Glance</h2>' +
                '<p>These are the five fields in your Permission Log. If you cannot fill them confidently, you are automatically BLOCKED.</p>' +

                '<div class="guide-box guide-box-info">' +
                    '<strong>&#x1F6D1; Minimum Context Record</strong>' +
                    '<p>These five fields are the minimum context record you need before you are allowed to scan for trades. If you cannot fill them confidently, you are automatically BLOCKED.</p>' +
                '</div>' +

                // --- Market Regime ---
                '<h3>Market Regime</h3>' +
                '<p>Determines which playbooks are available. Lock once per session. No mid-session regime switching; if conditions change materially, stand down and re-assess next session.</p>' +
                '<table class="guide-table">' +
                    '<thead><tr><th>Regime</th><th>What It Means</th><th>Playbooks Allowed</th></tr></thead>' +
                    '<tbody>' +
                        '<tr><td><span class="state-badge state-expansion">EXPANSION</span></td>' +
                            '<td>Trend; clean directional movement. EMAs fanning, momentum sustained.</td>' +
                            '<td>Continuation, Deep Pullback</td></tr>' +
                        '<tr><td><span class="state-badge state-balanced">BALANCED</span></td>' +
                            '<td>Range; mean reversion dominates. Clear boundaries, rotating price.</td>' +
                            '<td>Range Fade at extremes only; reduced size</td></tr>' +
                        '<tr><td><span class="state-badge state-contraction">CONTRACTION</span></td>' +
                            '<td>Squeeze/compression; breakout risk. Volatility tightening.</td>' +
                            '<td>Breakout plan ONLY after confirmation; otherwise wait</td></tr>' +
                        '<tr><td><span class="state-badge state-transition">TRANSITION</span></td>' +
                            '<td>Regime unclear/flip risk. Conflicting signals.</td>' +
                            '<td><strong>NO TRADE &mdash; observation only</strong></td></tr>' +
                    '</tbody>' +
                '</table>' +

                // --- Structure Quality ---
                '<h3>Structure Quality</h3>' +
                '<p>Grades the quality of swing structure on your execution timeframe.</p>' +
                '<table class="guide-table">' +
                    '<thead><tr><th>Grade</th><th>What It Means</th><th>Action</th></tr></thead>' +
                    '<tbody>' +
                        '<tr><td><strong style="color:var(--color-pass)">Clean</strong></td>' +
                            '<td>Clear swings; obvious invalidation level; textbook structure.</td>' +
                            '<td>Full size permitted</td></tr>' +
                        '<tr><td><strong style="color:var(--color-warning)">Minor Overlap</strong></td>' +
                            '<td>Tradeable but structure has some noise; invalidation less clear.</td>' +
                            '<td>Reduced size; stricter filters</td></tr>' +
                        '<tr><td><strong style="color:var(--color-fail)">Damaged</strong></td>' +
                            '<td>Chop; no clean swing structure; wicks everywhere.</td>' +
                            '<td><strong>Stand down &mdash; no trade</strong></td></tr>' +
                    '</tbody>' +
                '</table>' +

                // --- Volatility Context ---
                '<h3>Volatility Context</h3>' +
                '<p>Current volatility state from the ATR Dashboard. Affects sizing and expectations.</p>' +
                '<table class="guide-table">' +
                    '<thead><tr><th>State</th><th>What It Means</th><th>Impact</th></tr></thead>' +
                    '<tbody>' +
                        '<tr><td><strong style="color:var(--color-pass)">Trend</strong></td>' +
                            '<td>Steady, consistent volatility. Supportive of continuation plays.</td>' +
                            '<td>Ideal conditions; normal sizing</td></tr>' +
                        '<tr><td><strong style="color:var(--color-fail)">Explode</strong></td>' +
                            '<td>News/impulse spike. Market repricing; spreads widen.</td>' +
                            '<td>Wait for re-price to settle; wider stops if trading</td></tr>' +
                        '<tr><td><strong style="color:var(--color-warning)">Quiet</strong></td>' +
                            '<td>Dead; compressed volatility. Spread/slippage risk; fewer setups.</td>' +
                            '<td>Tighter targets; expect less follow-through</td></tr>' +
                        '<tr><td><strong style="color:var(--text-muted)">Mixed</strong></td>' +
                            '<td>Unstable; conflicting vol signals. Often the worst environment.</td>' +
                            '<td><strong>Avoid &mdash; unreliable conditions</strong></td></tr>' +
                    '</tbody>' +
                '</table>' +

                // --- Session Window ---
                '<h3>Session Window</h3>' +
                '<p>Liquidity and continuation quality of the current session.</p>' +
                '<table class="guide-table">' +
                    '<thead><tr><th>Window</th><th>What It Means</th><th>Action</th></tr></thead>' +
                    '<tbody>' +
                        '<tr><td><strong style="color:var(--color-pass)">Prime</strong></td>' +
                            '<td>Best liquidity and continuation probability. Peak session hours.</td>' +
                            '<td>Full execution permitted</td></tr>' +
                        '<tr><td><strong style="color:var(--color-warning)">Acceptable</strong></td>' +
                            '<td>Tradeable but with reduced liquidity; late session or early overlap.</td>' +
                            '<td>Stricter filters; reduced size</td></tr>' +
                        '<tr><td><strong style="color:var(--color-fail)">Dead / Off-Hours</strong></td>' +
                            '<td>No meaningful liquidity. Spread risk. Choppy price action.</td>' +
                            '<td><strong>Observation only &mdash; no execution</strong></td></tr>' +
                    '</tbody>' +
                '</table>' +

                // --- Permission State ---
                '<h3>Permission State</h3>' +
                '<p>The output of your context assessment. This is what the system resolves to.</p>' +
                '<table class="guide-table">' +
                    '<thead><tr><th>State</th><th>Emoji</th><th>What It Means</th><th>What You Do</th></tr></thead>' +
                    '<tbody>' +
                        '<tr><td><strong style="color:var(--color-pass)">ARMED</strong></td>' +
                            '<td>&#x1F7E2;</td>' +
                            '<td>Allowed to execute if setup appears. Full permission.</td>' +
                            '<td>Scan for playbook entries</td></tr>' +
                        '<tr><td><strong style="color:var(--color-warning)">CANDIDATE</strong></td>' +
                            '<td>&#x1F7E1;</td>' +
                            '<td>Prep only; one or more conditions not yet met.</td>' +
                            '<td>Watch; wait for upgrade to ARMED</td></tr>' +
                        '<tr><td><strong style="color:var(--color-fail)">BLOCKED</strong></td>' +
                            '<td>&#x1F534;</td>' +
                            '<td>No trade. Hard-block condition present.</td>' +
                            '<td>Map levels and observe only</td></tr>' +
                    '</tbody>' +
                '</table>' +

                '<div class="guide-box guide-box-fail">' +
                    '<strong>&#x1F6D1; CRITICAL Badge</strong>' +
                    '<p>CRITICAL = at least one hard-block condition is present (e.g. Transition regime, Damaged structure, Off-hours session, Drawdown stop). When CRITICAL is present, you are in observation-only mode. No exceptions.</p>' +
                '</div>' +

                '<div class="guide-nugget">' +
                    '&#x1F4A1; <strong>Gold Nugget:</strong> These definitions do not change day to day. If you find yourself re-interpreting them mid-session, that is your emotions talking &mdash; not the system.' +
                '</div>' +
            '</div>';
        },

        // ============================================
        // SECTION: CONTEXT FLOW (NEW)
        // ============================================
        getContextContent: function() {
            return '<div class="guide-section">' +
                '<h2>&#x23F1; 60-Second Context Assessment</h2>' +
                '<p>Run this flow before every session. It takes 60 seconds and produces your Permission State.</p>' +

                '<div class="workflow-step">' +
                    '<div class="step-marker">1</div>' +
                    '<div class="step-body">' +
                        '<h4>Pick Session</h4>' +
                        '<p>Tokyo or London. Decide <strong>before</strong> the session opens. No switching once committed.</p>' +
                    '</div>' +
                '</div>' +

                '<div class="workflow-step">' +
                    '<div class="step-marker">2</div>' +
                    '<div class="step-body">' +
                        '<h4>Mark Regime</h4>' +
                        '<p>One choice: Expansion, Balanced, Contraction, or Transition. Lock it. No mid-session switching; if conditions change materially, stand down and re-assess next session.</p>' +
                    '</div>' +
                '</div>' +

                '<div class="workflow-step">' +
                    '<div class="step-marker">3</div>' +
                    '<div class="step-body">' +
                        '<h4>Grade Structure</h4>' +
                        '<p>Clean, Minor Overlap, or Damaged. Look at the execution timeframe swings.</p>' +
                    '</div>' +
                '</div>' +

                '<div class="workflow-step">' +
                    '<div class="step-marker">4</div>' +
                    '<div class="step-body">' +
                        '<h4>Volatility Bucket</h4>' +
                        '<p>Trend, Quiet, Explode, or Mixed. Read from ATR Dashboard.</p>' +
                    '</div>' +
                '</div>' +

                '<div class="workflow-step">' +
                    '<div class="step-marker">5</div>' +
                    '<div class="step-body">' +
                        '<h4>Session Window</h4>' +
                        '<p>Prime, Acceptable, or Dead. Based on current time and liquidity.</p>' +
                    '</div>' +
                '</div>' +

                '<div class="workflow-step">' +
                    '<div class="step-marker">6</div>' +
                    '<div class="step-body">' +
                        '<h4>Permission Outcome</h4>' +
                        '<p>The five inputs above resolve to: <strong>ARMED</strong>, <strong>CANDIDATE</strong>, or <strong>BLOCKED</strong>.</p>' +
                    '</div>' +
                '</div>' +

                '<div class="workflow-step">' +
                    '<div class="step-marker">7</div>' +
                    '<div class="step-body">' +
                        '<h4>Only Then &mdash; Scan for Playbook</h4>' +
                        '<p>If ARMED: scan for entries matching the locked regime. If CANDIDATE: watch only. If BLOCKED: levels and observation only.</p>' +
                    '</div>' +
                '</div>' +

                '<div class="guide-box guide-box-fail">' +
                    '<strong>&#x1F6D1; Hard Rule</strong>' +
                    '<p>If you cannot confidently fill all five fields, you are automatically BLOCKED. Do not rationalise partial fills. The system is binary: context complete = permission possible; context incomplete = no trade.</p>' +
                '</div>' +

                '<div class="guide-nugget">' +
                    '&#x1F4A1; <strong>Gold Nugget:</strong> This 60-second drill replaces 30 minutes of staring at charts and "feeling" the market. Context first, always.' +
                '</div>' +
            '</div>';
        },
        
        // ============================================
        // SECTION: ALERTS (Updated for Institutional)
        // ============================================
        getAlertsContent: function() {
            return '<div class="guide-section">' +
                '<h2>&#x1F514; Alert Types (4-Emoji Standard)</h2>' +
                '<p>UTCC fires 4 types of alerts. Each has ONE meaning. No interpretation needed.</p>' +

                '<div class="alert-card alert-armed">' +
                    '<div class="alert-header">' +
                        '<span class="alert-icon">&#x1F7E2;</span>' +
                        '<span class="alert-name">ARMED</span>' +
                    '</div>' +
                    '<div class="alert-body">' +
                        '<p><strong>What it means:</strong> "Permission granted. You may run the trade process."</p>' +
                        '<p><strong>What you do:</strong> Open Command Centre and start the checklist.</p>' +
                        '<p><strong>Contains:</strong> Pair, Primary Reason (R-series), Risk State (K-series), Score, Permission (FULL), Max Risk.</p>' +
                        '<p><strong>Think of it as:</strong> The starting gun for your validation process &mdash; not an entry signal.</p>' +
                    '</div>' +
                '</div>' +

                '<div class="alert-card alert-candidate">' +
                    '<div class="alert-header">' +
                        '<span class="alert-icon">&#x1F7E1;</span>' +
                        '<span class="alert-name">CANDIDATE</span>' +
                    '</div>' +
                    '<div class="alert-body">' +
                        '<p><strong>What it means:</strong> "Heads-up. Conditions forming but not complete."</p>' +
                        '<p><strong>What you do:</strong> Add to Watchlist. Do NOT trade from this alert. Wait for upgrade.</p>' +
                        '<p><strong>Contains:</strong> Pair, Primary Reason, Score, Permission (CONDITIONAL), Max Risk (reduced).</p>' +
                        '<p><strong>Think of it as:</strong> A spotlight on a potential setup, not a green light.</p>' +
                    '</div>' +
                '</div>' +

                '<div class="alert-card alert-disarmed">' +
                    '<div class="alert-header">' +
                        '<span class="alert-icon">&#x1F534;</span>' +
                        '<span class="alert-name">BLOCKED</span>' +
                    '</div>' +
                    '<div class="alert-body">' +
                        '<p><strong>What it means:</strong> "Context denied. Stop hunting this pair."</p>' +
                        '<p><strong>What you do:</strong> Remove from watchlist. No "one more look".</p>' +
                        '<p><strong>Contains:</strong> Pair, Primary Reason for block, Permission (STAND_DOWN).</p>' +
                        '<p><strong>Think of it as:</strong> The idea is dead. Move on completely.</p>' +
                    '</div>' +
                '</div>' +

                '<div class="alert-card alert-reset">' +
                    '<div class="alert-header">' +
                        '<span class="alert-icon">&#x26AA;</span>' +
                        '<span class="alert-name">INFO (Session Reset)</span>' +
                    '</div>' +
                    '<div class="alert-body">' +
                        '<p><strong>What it means:</strong> "New session. Re-evaluate from scratch."</p>' +
                        '<p><strong>What you do:</strong> Wipe all bias. Re-rank your watchlist. Build Session Board.</p>' +
                        '<p><strong>Think of it as:</strong> The "start of the game" &mdash; not just a notification.</p>' +
                    '</div>' +
                '</div>' +

                '<div class="guide-box guide-box-fail">' +
                    '<strong>&#x1F6D1; Critical Rule</strong>' +
                    '<p><strong>Never trade on CANDIDATE.</strong> CANDIDATE is a spotlight, not permission. Wait for ARMED before doing anything.</p>' +
                '</div>' +

                '<h3>Alert Anatomy</h3>' +
                '<div class="guide-box">' +
                    '<p>Every alert contains a scan line and a body:</p>' +
                    '<p><strong>Scan line:</strong> <code>[emoji] TYPE | PAIR | PRIMARY_REASON | RISK_STATE | U-SCORE</code></p>' +
                    '<p><strong>Body:</strong> Primary reason, Contributing factors, Permission level, Execution limits (Max Risk, Max Trades).</p>' +
                    '<p class="guide-small">Primary reason is always R-series (regime) or K-series (risk state). The authority hierarchy is: Regime &gt; Risk &gt; UTCC score.</p>' +
                '</div>' +

                '<div class="guide-nugget">' +
                    '&#x1F4A1; <strong>Gold Nugget:</strong> ARMED means "start process", not "press buy". The alert gives permission to look &mdash; price must earn the entry.' +
                '</div>' +
            '</div>';
        },
        
        // ============================================
        // SECTION: WORKFLOW
        // ============================================
        getWorkflowContent: function() {
            return '<div class="guide-section">' +
                '<h2>&#x1F501; The Daily Loop</h2>' +
                '<p>This is your routine. Memorise it.</p>' +

                '<div class="workflow-step">' +
                    '<div class="step-marker">1</div>' +
                    '<div class="step-body">' +
                        '<h4>Pre-Session (2&ndash;5 minutes)</h4>' +
                        '<p><strong>Goal:</strong> Start clean. No emotional carry-over.</p>' +
                        '<ul>' +
                            '<li>Check alerts since last session</li>' +
                            '<li>Any BLOCKED &#x2192; delete those ideas</li>' +
                            '<li>Any CANDIDATE during Off-Hours &#x2192; mark "prep-only"</li>' +
                            '<li>Any ARMED during Off-Hours &#x2192; note it, wait for tradeable session</li>' +
                            '<li><strong>Decide which session you will trade today</strong></li>' +
                        '</ul>' +
                    '</div>' +
                '</div>' +

                '<div class="workflow-step">' +
                    '<div class="step-marker">2</div>' +
                    '<div class="step-body">' +
                        '<h4>SESSION RESET Arrives</h4>' +
                        '<p>This is your hard reset trigger. Do immediately:</p>' +
                        '<ol>' +
                            '<li>Open Command Centre</li>' +
                            '<li>Create your Session Board</li>' +
                            '<li>Lock in: Session / Max Trades / Playbooks</li>' +
                        '</ol>' +
                        '<div class="guide-nugget">' +
                            '&#x1F4A1; Session Reset is the "start of the game" &mdash; not a notification.' +
                        '</div>' +
                    '</div>' +
                '</div>' +

                '<div class="workflow-step">' +
                    '<div class="step-marker">3</div>' +
                    '<div class="step-body">' +
                        '<h4>When CANDIDATE Hits</h4>' +
                        '<p><strong>If tradeable session (Tokyo/London):</strong> 1-minute triage</p>' +
                        '<ul>' +
                            '<li>Open chart</li>' +
                            '<li>Identify: Playbook, zone (HOT/OPTIMAL), S/R</li>' +
                            '<li>If clean &#x2192; mark "Candidate, waiting for ARMED"</li>' +
                            '<li>If messy &#x2192; ignore. No explanation needed.</li>' +
                        '</ul>' +
                        '<p><strong>If prep-only session:</strong> 30-second triage</p>' +
                        '<ul>' +
                            '<li>Mark "prep-only, check next session"</li>' +
                            '<li>Do nothing else</li>' +
                        '</ul>' +
                    '</div>' +
                '</div>' +

                '<div class="workflow-step">' +
                    '<div class="step-marker">4</div>' +
                    '<div class="step-body">' +
                        '<h4>When ARMED Hits</h4>' +
                        '<p>If tradeable session, run the Command Centre checklist:</p>' +
                        '<div class="guide-grid-2">' +
                            '<div class="guide-box">' +
                                '<strong>A) Permission</strong>' +
                                '<ul>' +
                                    '<li>ARMED with FULL permission</li>' +
                                    '<li>Not in prep-only session</li>' +
                                '</ul>' +
                            '</div>' +
                            '<div class="guide-box">' +
                                '<strong>B) Location</strong>' +
                                '<ul>' +
                                    '<li>Price in HOT/OPTIMAL zone</li>' +
                                    '<li>Not directly into S/R</li>' +
                                    '<li>EMA structure supports playbook</li>' +
                                '</ul>' +
                            '</div>' +
                            '<div class="guide-box">' +
                                '<strong>C) Trigger</strong>' +
                                '<ul>' +
                                    '<li>ONE trigger per playbook</li>' +
                                    '<li>No freestyle entries</li>' +
                                '</ul>' +
                            '</div>' +
                            '<div class="guide-box">' +
                                '<strong>D) Risk</strong>' +
                                '<ul>' +
                                    '<li>Invalidation level makes sense</li>' +
                                    '<li>R:R meets minimum (1.5:1)</li>' +
                                    '<li>Position size within max risk</li>' +
                                '</ul>' +
                            '</div>' +
                        '</div>' +
                        '<p class="guide-highlight">Only when A+B+C+D are ALL checked: place the trade.</p>' +
                    '</div>' +
                '</div>' +

                '<div class="workflow-step">' +
                    '<div class="step-marker">5</div>' +
                    '<div class="step-body">' +
                        '<h4>After Entry</h4>' +
                        '<p>Your job: protect capital + reduce decisions.</p>' +
                        '<ul>' +
                            '<li>If BLOCKED prints &#x2192; do not add; consider reduce/exit</li>' +
                            '<li>If MTF degradation &#x2192; tighten; do not hope</li>' +
                        '</ul>' +
                        '<div class="guide-nugget">' +
                            '&#x1F4A1; A professional exits because the reason changed &mdash; not because they "feel" it.' +
                        '</div>' +
                    '</div>' +
                '</div>' +

                '<div class="workflow-step">' +
                    '<div class="step-marker">6</div>' +
                    '<div class="step-body">' +
                        '<h4>End-of-Session Wrap (3 minutes)</h4>' +
                        '<ul>' +
                            '<li>Screenshot or note alerts acted on / ignored and why</li>' +
                            '<li>One improvement to make tomorrow</li>' +
                            '<li>Update journal: Playbook, entry type, location grade, outcome</li>' +
                            '<li>Complete post-session review gate if flagged behaviour occurred</li>' +
                        '</ul>' +
                        '<div class="guide-nugget">' +
                            '&#x1F4A1; Your edge compounds through journalling &mdash; not through more indicators.' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';
        },
        
        // ============================================
        // SECTION: PLAYBOOKS (Updated with Playbook Map)
        // ============================================
        getPlaybooksContent: function() {
            return '<div class="guide-section">' +
                '<h2>&#x1F4D6; Playbooks</h2>' +

                '<div class="guide-box guide-box-info">' +
                    '<strong>The Golden Rule</strong>' +
                    '<p>If you cannot name your playbook BEFORE seeing the UTCC alert, you do not trade. The playbook comes from your market read, NOT from the alert. UTCC grants permission to hunt; price action triggers execution.</p>' +
                '</div>' +

                // --- Playbook Map ---
                '<h3>&#x1F5FA; Playbook Map: Context &#x2192; Permitted Playbooks</h3>' +
                '<p>This is the institutional link: your regime determines what you are allowed to hunt.</p>' +
                '<table class="guide-table">' +
                    '<thead>' +
                        '<tr><th>Regime</th><th>Permitted Playbooks</th><th>Sizing</th><th>Notes</th></tr>' +
                    '</thead>' +
                    '<tbody>' +
                        '<tr>' +
                            '<td><span class="state-badge state-expansion">EXPANSION</span></td>' +
                            '<td>Continuation; Deep Pullback</td>' +
                            '<td>Full (1.0R)</td>' +
                            '<td>Best conditions. Trade with trend.</td>' +
                        '</tr>' +
                        '<tr>' +
                            '<td><span class="state-badge state-balanced">BALANCED</span></td>' +
                            '<td>Mean reversion; Range extremes only</td>' +
                            '<td>Reduced (0.5&ndash;0.75R)</td>' +
                            '<td>Only at defined boundaries. Tighter filters.</td>' +
                        '</tr>' +
                        '<tr>' +
                            '<td><span class="state-badge state-contraction">CONTRACTION</span></td>' +
                            '<td>Breakout plan only after confirmation</td>' +
                            '<td>Reduced (0.25&ndash;0.5R)</td>' +
                            '<td>Wait for breakout + retest. Otherwise wait.</td>' +
                        '</tr>' +
                        '<tr style="background:rgba(239,68,68,0.1)">' +
                            '<td><span class="state-badge state-transition">TRANSITION</span></td>' +
                            '<td><strong>NO TRADE</strong></td>' +
                            '<td>0R</td>' +
                            '<td>Mark levels only. Zero execution.</td>' +
                        '</tr>' +
                    '</tbody>' +
                '</table>' +

                '<h3>Your Primary Playbooks</h3>' +

                '<div class="playbook-card">' +
                    '<div class="playbook-header playbook-continuation">' +
                        '<h4>Continuation</h4>' +
                        '<span class="playbook-tag">Trend Following</span>' +
                    '</div>' +
                    '<div class="playbook-body">' +
                        '<p><strong>When to use:</strong> Clear trend in place, EMAs stacked, price pulling back to the ribbon.</p>' +
                        '<p><strong>The setup:</strong></p>' +
                        '<ol>' +
                            '<li>Trend established (EMAs fanning)</li>' +
                            '<li>Pullback into EMA ribbon</li>' +
                            '<li>Clear rejection/acceptance candle</li>' +
                            '<li>Enter on break of that candle</li>' +
                        '</ol>' +
                        '<p><strong>Stop:</strong> Beyond the pullback low/high</p>' +
                        '<p><strong>Target:</strong> Previous swing high/low, then trail</p>' +
                    '</div>' +
                '</div>' +

                '<div class="playbook-card">' +
                    '<div class="playbook-header playbook-pullback">' +
                        '<h4>Deep Pullback</h4>' +
                        '<span class="playbook-tag">Mean Reversion</span>' +
                    '</div>' +
                    '<div class="playbook-body">' +
                        '<p><strong>When to use:</strong> Trend exists but price has pulled back significantly (to slow EMA or key level).</p>' +
                        '<p><strong>The setup:</strong></p>' +
                        '<ol>' +
                            '<li>Price at mid/slow EMA or key swing level</li>' +
                            '<li>Wait for reclaim of faster EMA</li>' +
                            '<li>Confirmation close above/below</li>' +
                            '<li>Enter on continuation</li>' +
                        '</ol>' +
                        '<p><strong>Stop:</strong> Beyond the deep pullback level</p>' +
                        '<p><strong>Target:</strong> Recent swing, then manage</p>' +
                    '</div>' +
                '</div>' +

                '<div class="playbook-card">' +
                    '<div class="playbook-header playbook-observation">' +
                        '<h4>Observation Only</h4>' +
                        '<span class="playbook-tag">No Trading</span>' +
                    '</div>' +
                    '<div class="playbook-body">' +
                        '<p><strong>When to use:</strong> Market is unclear, transitioning, or you are in reduced risk mode.</p>' +
                        '<ul>' +
                            '<li>Watch and prepare</li>' +
                            '<li>Mark levels for next session</li>' +
                            '<li>NO entries allowed</li>' +
                        '</ul>' +
                        '<p><strong>This is a valid decision.</strong> Sitting out unclear conditions is professional behaviour.</p>' +
                    '</div>' +
                '</div>' +

                '<div class="guide-nugget">' +
                    '&#x1F4A1; <strong>Gold Nugget:</strong> The playbook comes from YOUR market read, not from the alert. If you cannot name it before looking, you do not trade it.' +
                '</div>' +
            '</div>';
        },
        
        // ============================================
        // SECTION: VALIDATION
        // ============================================
        getValidationContent: function() {
            return '<div class="guide-section">' +
                '<h2>&#x2705; Validation Criteria</h2>' +
                '<p>4 HARD checks must ALL pass. 1 SOFT check affects sizing.</p>' +

                '<div class="validation-card validation-hard">' +
                    '<div class="validation-marker">H1</div>' +
                    '<div class="validation-body">' +
                        '<h4>UTCC 4H Criteria Met</h4>' +
                        '<p>Wait for <strong>&#x1F7E2; ARMED</strong> state with FULL permission.</p>' +
                        '<p class="guide-small">4H gives DIRECTION &mdash; only trade when system confirms trend.</p>' +
                    '</div>' +
                '</div>' +

                '<div class="validation-card validation-hard">' +
                    '<div class="validation-marker">H2</div>' +
                    '<div class="validation-body">' +
                        '<h4>1H EMAs Stacked</h4>' +
                        '<p>EMAs must be stacked in same direction as 4H signal.</p>' +
                        '<ul>' +
                            '<li><strong>Bullish:</strong> Fast &gt; Mid &gt; Slow</li>' +
                            '<li><strong>Bearish:</strong> Slow &gt; Mid &gt; Fast</li>' +
                        '</ul>' +
                        '<p class="guide-small">1H gives TIMING &mdash; lower TF must confirm higher TF bias.</p>' +
                    '</div>' +
                '</div>' +

                '<div class="validation-card validation-hard">' +
                    '<div class="validation-marker">H3</div>' +
                    '<div class="validation-body">' +
                        '<h4>Price Accepted/Rejected at EMA</h4>' +
                        '<p>Do not ask "Is price near the EMA?" Ask "Is price being ACCEPTED or REJECTED?"</p>' +
                        '<ul>' +
                            '<li><strong class="text-pass">Acceptance:</strong> Price closes inside ribbon, rides it &#x2192; TRADE</li>' +
                            '<li><strong class="text-info">Rejection:</strong> Sharp displacement away &#x2192; TRADE</li>' +
                            '<li><strong class="text-fail">Touch only:</strong> No reaction &#x2192; NO TRADE</li>' +
                        '</ul>' +
                    '</div>' +
                '</div>' +

                '<div class="validation-card validation-hard">' +
                    '<div class="validation-marker">H4</div>' +
                    '<div class="validation-body">' +
                        '<h4>48h Cooldown Clear</h4>' +
                        '<p>No losing trade on this pair in the last 48 hours.</p>' +
                        '<p class="guide-small">Prevents revenge trading. Lost on a pair? Move to a different one.</p>' +
                    '</div>' +
                '</div>' +

                '<div class="validation-card validation-soft">' +
                    '<div class="validation-marker">S</div>' +
                    '<div class="validation-body">' +
                        '<h4>1H RSI Favourable (SOFT)</h4>' +
                        '<p>RSI affects POSITION SIZE, not entry permission.</p>' +
                        '<table class="guide-table">' +
                            '<thead>' +
                                '<tr><th>Direction</th><th>Ideal (Full Size)</th><th>Acceptable (50&ndash;75%)</th><th>Avoid</th></tr>' +
                            '</thead>' +
                            '<tbody>' +
                                '<tr><td>LONG</td><td>RSI &lt; 30</td><td>RSI 30&ndash;50</td><td>RSI &gt; 70</td></tr>' +
                                '<tr><td>SHORT</td><td>RSI &gt; 70</td><td>RSI 50&ndash;70</td><td>RSI &lt; 30</td></tr>' +
                            '</tbody>' +
                        '</table>' +
                    '</div>' +
                '</div>' +

                '<div class="guide-box guide-box-fail">' +
                    '<strong>&#x1F6D1; 3 out of 4 is NOT "close enough"</strong>' +
                    '<p>All 4 HARD criteria must pass. The SOFT criterion affects sizing only. Quality over quantity &mdash; always.</p>' +
                '</div>' +

                '<h3>Execution Criteria (After Entry Permission)</h3>' +
                '<div class="guide-grid-2">' +
                    '<div class="guide-box">' +
                        '<strong>Wait 1+ Candle</strong>' +
                        '<p>Never trade the candle that fired the alert. This single rule eliminates FOMO.</p>' +
                    '</div>' +
                    '<div class="guide-box">' +
                        '<strong>Playbook Named</strong>' +
                        '<p>You must be able to say the playbook name out loud before entering.</p>' +
                    '</div>' +
                    '<div class="guide-box">' +
                        '<strong>Price Failed Opposite</strong>' +
                        '<p>Price must have attempted and failed the opposite direction. This confirms rejection.</p>' +
                    '</div>' +
                    '<div class="guide-box">' +
                        '<strong>R:R Valid</strong>' +
                        '<p>Minimum 1.5:1 risk-reward. If it does not work from current price, pass.</p>' +
                    '</div>' +
                '</div>' +
            '</div>';
        },
        
        // ============================================
        // SECTION: ENTRY ZONES
        // ============================================
        getZonesContent: function() {
            return '<div class="guide-section">' +
                '<h2>&#x1F3AF; Entry Zones</h2>' +
                '<p>Where price is relative to the EMA ribbon determines entry quality.</p>' +

                '<div class="zone-card zone-hot">' +
                    '<div class="zone-header">' +
                        '<span class="zone-badge">HOT</span>' +
                        '<span class="zone-distance">Within 0.3 ATR of EMA</span>' +
                    '</div>' +
                    '<div class="zone-body">' +
                        '<p><strong>Best entry location.</strong> Price is right at the ribbon &mdash; optimal risk:reward.</p>' +
                        '<p>Action: <strong>Full position allowed</strong></p>' +
                    '</div>' +
                '</div>' +

                '<div class="zone-card zone-optimal">' +
                    '<div class="zone-header">' +
                        '<span class="zone-badge">OPTIMAL</span>' +
                        '<span class="zone-distance">Within 0.5 ATR of EMA</span>' +
                    '</div>' +
                    '<div class="zone-body">' +
                        '<p><strong>Good entry location.</strong> Slightly extended but still acceptable.</p>' +
                        '<p>Action: <strong>Normal position</strong></p>' +
                    '</div>' +
                '</div>' +

                '<div class="zone-card zone-acceptable">' +
                    '<div class="zone-header">' +
                        '<span class="zone-badge">ACCEPTABLE</span>' +
                        '<span class="zone-distance">Within 1.0 ATR of EMA</span>' +
                    '</div>' +
                    '<div class="zone-body">' +
                        '<p><strong>Marginal location.</strong> Consider reduced size or waiting for pullback.</p>' +
                        '<p>Action: <strong>Reduced position (50&ndash;75%)</strong></p>' +
                    '</div>' +
                '</div>' +

                '<div class="zone-card zone-extended">' +
                    '<div class="zone-header">' +
                        '<span class="zone-badge">EXTENDED</span>' +
                        '<span class="zone-distance">Beyond 1.0 ATR from EMA</span>' +
                    '</div>' +
                    '<div class="zone-body">' +
                        '<p><strong>Poor location.</strong> Too far from value &mdash; likely to pull back first.</p>' +
                        '<p>Action: <strong>DO NOT ENTER &mdash; wait for pullback</strong></p>' +
                    '</div>' +
                '</div>' +

                '<div class="guide-box guide-box-warn">' +
                    '<strong>&#x26A0; Location Matters More Than Score</strong>' +
                    '<p>A score of 90 in an EXTENDED zone is worse than a score of 80 in a HOT zone. Never buy into resistance. Never short into support. Location trumps everything.</p>' +
                '</div>' +

                '<h3>Support/Resistance Rules</h3>' +
                '<ul>' +
                    '<li><strong>Buy AT support</strong> &mdash; not into it</li>' +
                    '<li><strong>Sell AT resistance</strong> &mdash; not into it</li>' +
                    '<li><strong>If price is mid-range</strong> &mdash; wait for level test</li>' +
                    '<li><strong>Set stops beyond zones</strong> &mdash; give room to breathe</li>' +
                    '<li><strong>Set targets at opposing zones</strong> &mdash; realistic exits</li>' +
                '</ul>' +
            '</div>';
        },
        
        // ============================================
        // SECTION: EXITS
        // ============================================
        getExitsContent: function() {
            return '<div class="guide-section">' +
                '<h2>&#x1F6AA; Exit Management</h2>' +

                '<h3>Take Profit Strategy</h3>' +
                '<div class="guide-box">' +
                    '<ul>' +
                        '<li><strong>TP1 at 1R:</strong> Close 50%, move stop to breakeven</li>' +
                        '<li><strong>TP2 at 2R:</strong> Or next structure level</li>' +
                        '<li><strong>Trail stop</strong> if momentum continues</li>' +
                        '<li><strong>Never move TP closer</strong> &mdash; let winners run</li>' +
                    '</ul>' +
                '</div>' +

                '<h3>Stop Loss Rules</h3>' +
                '<div class="guide-box">' +
                    '<ul>' +
                        '<li>Set at <strong>INVALIDATION</strong> &mdash; where your thesis is wrong</li>' +
                        '<li>NOT arbitrary ATR multiples</li>' +
                        '<li><strong>Never move stop further from entry</strong></li>' +
                        '<li>Accept -1R as cost of business</li>' +
                    '</ul>' +
                '</div>' +

                '<h3>Execution Discipline (Every Trade Needs)</h3>' +
                '<div class="guide-grid-2">' +
                    '<div class="guide-box">' +
                        '<strong>Timeout Rule</strong>' +
                        '<p>If setup does not trigger within defined window, cancel. No waiting forever.</p>' +
                    '</div>' +
                    '<div class="guide-box">' +
                        '<strong>Structural Invalidation</strong>' +
                        '<p>If structure breaks before entry, the setup is dead. Do not re-enter.</p>' +
                    '</div>' +
                    '<div class="guide-box">' +
                        '<strong>Max Attempts Rule</strong>' +
                        '<p>Maximum 2 entries per setup. Prevents micro-revenge on the same idea.</p>' +
                    '</div>' +
                    '<div class="guide-box">' +
                        '<strong>Log Non-Trades</strong>' +
                        '<p>Timeouts, blocks, and passes must be logged. Missed discipline must be visible.</p>' +
                    '</div>' +
                '</div>' +

                '<h3>When to Close Early</h3>' +
                '<div class="guide-grid-2">' +
                    '<div class="guide-box">' +
                        '<strong>Close if:</strong>' +
                        '<ul>' +
                            '<li>Opposite UTCC signal appears</li>' +
                            '<li>High-impact news approaching</li>' +
                            '<li>Major S/R reached before TP</li>' +
                            '<li>Correlation issue develops</li>' +
                        '</ul>' +
                    '</div>' +
                    '<div class="guide-box">' +
                        '<strong>Time Stops:</strong>' +
                        '<ul>' +
                            '<li>4H trades: Max hold 3&ndash;5 days</li>' +
                            '<li>1H trades: Max hold 24&ndash;48 hours</li>' +
                            '<li>Close if going nowhere</li>' +
                            '<li>Weekend close unless strong trend</li>' +
                        '</ul>' +
                    '</div>' +
                '</div>' +

                '<h3>Drawdown Protocol</h3>' +
                '<table class="guide-table">' +
                    '<thead>' +
                        '<tr><th>Drawdown</th><th>Status</th><th>Action</th></tr>' +
                    '</thead>' +
                    '<tbody>' +
                        '<tr>' +
                            '<td><span class="dd-normal">0% to -3%</span></td>' +
                            '<td>NORMAL</td>' +
                            '<td>1.5&ndash;2% risk per trade</td>' +
                        '</tr>' +
                        '<tr>' +
                            '<td><span class="dd-caution">-3% to -5%</span></td>' +
                            '<td>RISK CAP</td>' +
                            '<td>1% risk; risk reductions compound (0.75 &times; multiplier)</td>' +
                        '</tr>' +
                        '<tr>' +
                            '<td><span class="dd-stop">-5% to -10%</span></td>' +
                            '<td>STAND DOWN</td>' +
                            '<td>0.5% risk; 24h mandatory pause; review last 5 trades</td>' +
                        '</tr>' +
                        '<tr>' +
                            '<td><span class="dd-emergency">-10%+</span></td>' +
                            '<td>EMERGENCY</td>' +
                            '<td>Stop trading; full system review; mandatory review gate before resuming</td>' +
                        '</tr>' +
                    '</tbody>' +
                '</table>' +
                '<p class="guide-small">Risk reductions compound, not replace. Example: 0.75 &times; 0.5 = 0.375. Risk is monotonic intraday &mdash; no recovery until day reset.</p>' +

                '<div class="guide-nugget">' +
                    '&#x1F4A1; <strong>Gold Nugget:</strong> A professional exits because the reason changed &mdash; not because they "feel" it.' +
                '</div>' +
            '</div>';
        },
        
        // ============================================
        // SECTION: RULES (Updated with Non-Negotiables + Override)
        // ============================================
        getRulesContent: function() {
            return '<div class="guide-section">' +
                '<h2>&#x1F6D1; Non-Negotiable Rules</h2>' +

                // --- Non-Negotiables Box ---
                '<div class="guide-box guide-box-fail" style="border:2px solid var(--color-fail);padding:var(--spacing-lg)">' +
                    '<h3 style="margin-top:0;color:var(--color-fail)">&#x26D4; ABSOLUTE NON-NEGOTIABLES</h3>' +
                    '<p style="font-size:0.95rem"><strong>These rules never bend. No context makes them optional.</strong></p>' +
                    '<ol style="font-size:0.9rem">' +
                        '<li><strong>TRANSITION regime = NO TRADE.</strong> Zero execution, no exceptions.</li>' +
                        '<li><strong>DAMAGED structure = NO TRADE.</strong> If you cannot identify clean invalidation, stand down.</li>' +
                        '<li><strong>DEAD / Off-Hours session = NO TRADE.</strong> Observation only.</li>' +
                        '<li><strong>After drawdown threshold = RISK CAP or STOP.</strong> -3% = risk cap. -5% = stand down. -10% = emergency review.</li>' +
                        '<li><strong>MIXED volatility = AVOID.</strong> Unreliable conditions; the worst environment.</li>' +
                        '<li><strong>Cannot fill all 5 context fields = BLOCKED.</strong> Incomplete context = no permission.</li>' +
                    '</ol>' +
                '</div>' +

                '<div class="rules-list rules-dont">' +
                    '<h3>&#x274C; NEVER Do These</h3>' +
                    '<ol>' +
                        '<li><strong>No trade on CANDIDATE</strong> &mdash; Wait for ARMED</li>' +
                        '<li><strong>No same-candle entry</strong> &mdash; Wait 1+ candle after alert</li>' +
                        '<li><strong>No unnamed playbook</strong> &mdash; Name it or pass</li>' +
                        '<li><strong>No trade in TRANSITION</strong> &mdash; Unclear = no trade</li>' +
                        '<li><strong>No revenge trading</strong> &mdash; 48h cooldown on losing pairs</li>' +
                        '<li><strong>No moving stop away</strong> &mdash; Only to breakeven or tighter</li>' +
                        '<li><strong>No exceeding max risk</strong> &mdash; Respect the permission level</li>' +
                        '<li><strong>No trading Off-Hours</strong> &mdash; Prep only</li>' +
                        '<li><strong>No mid-session regime switching</strong> &mdash; Stand down and re-assess next session</li>' +
                    '</ol>' +
                '</div>' +

                '<div class="rules-list rules-do">' +
                    '<h3>&#x2705; ALWAYS Do These</h3>' +
                    '<ol>' +
                        '<li><strong>Lock regime at session start</strong> &mdash; one choice, no changes</li>' +
                        '<li><strong>Build Session Board on SESSION RESET</strong></li>' +
                        '<li><strong>Wait for all 4 HARD criteria</strong></li>' +
                        '<li><strong>Use invalidation-based stops</strong></li>' +
                        '<li><strong>Log every trade immediately</strong></li>' +
                        '<li><strong>Log non-trades</strong> &mdash; timeouts, blocks, passes</li>' +
                        '<li><strong>Follow drawdown protocol</strong></li>' +
                        '<li><strong>Complete post-session review gate</strong></li>' +
                    '</ol>' +
                '</div>' +

                // --- Override Protocol ---
                '<h3>&#x1F527; Override Protocol</h3>' +
                '<p>Institutional traders can override, but it is structured. This stops you rationalising.</p>' +
                '<div class="guide-box guide-box-warn" style="border:2px solid var(--color-warning);padding:var(--spacing-lg)">' +
                    '<ol style="font-size:0.9rem">' +
                        '<li><strong>Maximum 1 override per session.</strong> If you have already used it, you are done.</li>' +
                        '<li><strong>Size capped at 0.5R.</strong> Overrides never get full size.</li>' +
                        '<li><strong>Must write:</strong> "What is the model missing?" before entering. If you cannot articulate it, the override is not valid.</li>' +
                        '<li><strong>Tag the trade: "OVERRIDE"</strong> in journal. This makes it visible in reviews.</li>' +
                        '<li><strong>Track override P&amp;L separately.</strong> If overrides are net negative over 20 trades, remove the protocol.</li>' +
                    '</ol>' +
                '</div>' +

                '<h3>&#x1F914; "If I am Confused, Do This"</h3>' +
                '<div class="confusion-flow">' +
                    '<div class="confusion-step">' +
                        '<span class="q">Ask:</span> "Do I have permission?"' +
                        '<span class="a">If not ARMED &#x2192; <strong>STOP</strong></span>' +
                    '</div>' +
                    '<div class="confusion-step">' +
                        '<span class="q">Ask:</span> "Am I in a tradeable session?"' +
                        '<span class="a">If not &#x2192; <strong>PREP ONLY</strong></span>' +
                    '</div>' +
                    '<div class="confusion-step">' +
                        '<span class="q">Ask:</span> "Is location clean?"' +
                        '<span class="a">If not &#x2192; <strong>NO TRADE</strong></span>' +
                    '</div>' +
                    '<div class="confusion-step">' +
                        '<span class="q">Ask:</span> "Can I name my playbook?"' +
                        '<span class="a">If not &#x2192; <strong>NO TRADE</strong></span>' +
                    '</div>' +
                '</div>' +
                '<p class="guide-highlight">That sequence stops 95% of mistakes.</p>' +

                '<h3>Expected Volume</h3>' +
                '<div class="guide-box">' +
                    '<p>Across your pairs each day:</p>' +
                    '<ul>' +
                        '<li><strong>CANDIDATE alerts:</strong> ~2&ndash;5 per day</li>' +
                        '<li><strong>ARMED alerts:</strong> ~1&ndash;3 per day</li>' +
                        '<li><strong>Trades taken:</strong> 0&ndash;2 per session</li>' +
                    '</ul>' +
                    '<p class="guide-small">That is an institutional rhythm: fewer decisions, higher quality, repeatable process.</p>' +
                '</div>' +
            '</div>';
        },

        // ============================================
        // SECTION: EXAMPLES (NEW)
        // ============================================
        getExamplesContent: function() {
            return '<div class="guide-section">' +
                '<h2>&#x1F4A1; Worked Examples</h2>' +
                '<p>Three scenarios showing how context resolves to permission. This is what makes the system usable.</p>' +

                // --- Example A ---
                '<div class="guide-box guide-box-pass" style="border-left:4px solid var(--color-pass);margin-bottom:var(--spacing-lg)">' +
                    '<h3 style="margin-top:0">&#x1F7E2; Example A: Full Permission</h3>' +
                    '<table class="guide-table" style="margin-bottom:var(--spacing-sm)">' +
                        '<tbody>' +
                            '<tr><td><strong>Regime</strong></td><td>Expansion</td></tr>' +
                            '<tr><td><strong>Structure</strong></td><td>Clean</td></tr>' +
                            '<tr><td><strong>Volatility</strong></td><td>Trend</td></tr>' +
                            '<tr><td><strong>Session</strong></td><td>Prime (London)</td></tr>' +
                            '<tr><td><strong>Permission</strong></td><td style="color:var(--color-pass)"><strong>ARMED &mdash; FULL</strong></td></tr>' +
                        '</tbody>' +
                    '</table>' +
                    '<p><strong>Allowed:</strong> Continuation pullback playbook; full size (1.0R).</p>' +
                    '<p><strong>What you do:</strong> Scan for continuation entries at EMA ribbon. Run full checklist. Execute if A+B+C+D pass.</p>' +
                '</div>' +

                // --- Example B ---
                '<div class="guide-box guide-box-warn" style="border-left:4px solid var(--color-warning);margin-bottom:var(--spacing-lg)">' +
                    '<h3 style="margin-top:0">&#x1F7E1; Example B: Conditional / Watch</h3>' +
                    '<table class="guide-table" style="margin-bottom:var(--spacing-sm)">' +
                        '<tbody>' +
                            '<tr><td><strong>Regime</strong></td><td>Balanced</td></tr>' +
                            '<tr><td><strong>Structure</strong></td><td>Minor Overlap</td></tr>' +
                            '<tr><td><strong>Volatility</strong></td><td>Quiet</td></tr>' +
                            '<tr><td><strong>Session</strong></td><td>Acceptable (late Tokyo)</td></tr>' +
                            '<tr><td><strong>Permission</strong></td><td style="color:var(--color-warning)"><strong>CANDIDATE &mdash; CONDITIONAL</strong></td></tr>' +
                        '</tbody>' +
                    '</table>' +
                    '<p><strong>Allowed:</strong> Range extreme fade only; reduced size (0.25&ndash;0.5R); tighter filters.</p>' +
                    '<p><strong>What you do:</strong> Mark levels. Watch for upgrade to ARMED if structure cleans up. Do NOT execute from CANDIDATE state.</p>' +
                '</div>' +

                // --- Example C ---
                '<div class="guide-box guide-box-fail" style="border-left:4px solid var(--color-fail);margin-bottom:var(--spacing-lg)">' +
                    '<h3 style="margin-top:0">&#x1F534; Example C: Blocked</h3>' +
                    '<table class="guide-table" style="margin-bottom:var(--spacing-sm)">' +
                        '<tbody>' +
                            '<tr><td><strong>Regime</strong></td><td>Transition</td></tr>' +
                            '<tr><td><strong>Structure</strong></td><td>Damaged</td></tr>' +
                            '<tr><td><strong>Volatility</strong></td><td>Mixed</td></tr>' +
                            '<tr><td><strong>Session</strong></td><td>Any</td></tr>' +
                            '<tr><td><strong>Permission</strong></td><td style="color:var(--color-fail)"><strong>BLOCKED &mdash; STAND_DOWN</strong></td></tr>' +
                        '</tbody>' +
                    '</table>' +
                    '<p><strong>Allowed:</strong> Mark levels only. Zero execution. No "one more look".</p>' +
                    '<p><strong>What you do:</strong> Log observation. Prepare for next session. Accept that not trading IS the professional decision.</p>' +
                '</div>' +

                '<div class="guide-box guide-box-info">' +
                    '<strong>The Pattern</strong>' +
                    '<p>Notice how the context fields drive everything. You never start with "I think EURUSD will go up." You start with "What does the context allow?" The playbook is a <em>consequence</em> of context, not a prediction.</p>' +
                '</div>' +

                '<div class="guide-nugget">' +
                    '&#x1F4A1; <strong>Gold Nugget:</strong> If you find yourself trying to make a scenario fit Example A when it is really Example B or C, that is your emotions overriding the system. The system wins.' +
                '</div>' +
            '</div>';
        },
        
        // ============================================
        // SECTION: GLOSSARY (Updated)
        // ============================================
        getGlossaryContent: function() {
            return '<div class="guide-section">' +
                '<h2>&#x1F4D6; Glossary</h2>' +

                '<div class="glossary-section">' +
                    '<h3>System Terms</h3>' +
                    '<dl class="glossary">' +
                        '<dt>UTCC</dt>' +
                        '<dd><strong>Unified Trading Command Center</strong> &mdash; A systematic permission system. Grants permission to hunt; price action triggers execution.</dd>' +

                        '<dt>Armed</dt>' +
                        '<dd>State where UTCC criteria are met and you have <em>permission</em> to look for an entry. Not a signal to enter. Shown as &#x1F7E2; green circle.</dd>' +

                        '<dt>Blocked</dt>' +
                        '<dd>State where context has been denied. Remove from watchlist immediately. Replaces the old "Disarmed" terminology. Shown as &#x1F534; red circle.</dd>' +

                        '<dt>Candidate</dt>' +
                        '<dd>Early alert that conditions are forming. Watch only &mdash; no action until Armed. Shown as &#x1F7E1; yellow circle.</dd>' +

                        '<dt>Session Reset (INFO)</dt>' +
                        '<dd>Alert that a new trading session has begun. Triggers Session Board creation. Shown as &#x26AA; white circle.</dd>' +

                        '<dt>Session Board</dt>' +
                        '<dd>Pre-session commitment that locks your session choice, max trades, and allowed playbooks before you see any setups.</dd>' +

                        '<dt>Playbook</dt>' +
                        '<dd>Named trade setup with specific entry criteria. You must be able to name it before looking at the chart.</dd>' +

                        '<dt>Regime</dt>' +
                        '<dd>Market state assessment (Expansion/Balanced/Contraction/Transition) that determines which playbooks are available. Locked once per session.</dd>' +

                        '<dt>Permission Log</dt>' +
                        '<dd>The five-field context record (Regime, Structure, Volatility, Session, Permission) that must be completed before scanning for trades.</dd>' +

                        '<dt>Priority Resolver</dt>' +
                        '<dd>Authority hierarchy for alert reasons: Regime &gt; Risk State &gt; UTCC Score. Primary reason is always R-series or K-series.</dd>' +

                        '<dt>Risk Governor</dt>' +
                        '<dd>Manual or automatic control that sets risk mode: NORMAL, REDUCED, or LOCKED. Affects max risk per trade.</dd>' +
                    '</dl>' +
                '</div>' +

                '<div class="glossary-section">' +
                    '<h3>Entry Terms</h3>' +
                    '<dl class="glossary">' +
                        '<dt>Entry Zone</dt>' +
                        '<dd>Distance from EMA ribbon. HOT (best), OPTIMAL (good), ACCEPTABLE (marginal), EXTENDED (avoid).</dd>' +

                        '<dt>ATR</dt>' +
                        '<dd><strong>Average True Range</strong> &mdash; Measure of volatility. Used to define entry zones and stop distances.</dd>' +

                        '<dt>EMA Ribbon</dt>' +
                        '<dd>The 9/21/50 EMA combination. Price should be accepted or rejected by this ribbon, not just touching it.</dd>' +

                        '<dt>Acceptance</dt>' +
                        '<dd>Price closes inside the EMA ribbon and rides it. Indicates trend continuation.</dd>' +

                        '<dt>Rejection</dt>' +
                        '<dd>Sharp displacement away from the EMA ribbon. Indicates bounce or reversal.</dd>' +

                        '<dt>MTF Alignment</dt>' +
                        '<dd><strong>Multi-Timeframe Alignment</strong> &mdash; When 1H, 4H, and Daily all show the same directional bias (3/3).</dd>' +

                        '<dt>Invalidation</dt>' +
                        '<dd>The price level where your trade thesis is wrong. This is where you place your stop &mdash; not an arbitrary distance.</dd>' +
                    '</dl>' +
                '</div>' +

                '<div class="glossary-section">' +
                    '<h3>Risk Terms</h3>' +
                    '<dl class="glossary">' +
                        '<dt>R (R-Multiple)</dt>' +
                        '<dd>Risk unit. 1R = your risk on a trade. Win 2R = you made twice what you risked.</dd>' +

                        '<dt>R:R (Risk:Reward)</dt>' +
                        '<dd>Ratio of potential loss to potential gain. Minimum 1.5:1 required.</dd>' +

                        '<dt>Drawdown</dt>' +
                        '<dd>Percentage decline from peak account balance. Triggers risk reduction at -3%, -5%, -10%.</dd>' +

                        '<dt>48h Cooldown</dt>' +
                        '<dd>After a losing trade, you cannot trade that same pair for 48 hours. Prevents revenge trading.</dd>' +

                        '<dt>Circuit Breaker</dt>' +
                        '<dd>Automated risk controls that reduce position size, disable playbooks, or lock you out based on losses. Risk reductions compound (multiply), not replace.</dd>' +

                        '<dt>Pair Cooling</dt>' +
                        '<dd>Session-based cooldown on a specific pair after repeated losses. Separate from 48h revenge cooldown.</dd>' +
                    '</dl>' +
                '</div>' +

                '<div class="glossary-section">' +
                    '<h3>Market States</h3>' +
                    '<dl class="glossary">' +
                        '<dt>Expansion</dt>' +
                        '<dd>Clear trend, EMAs fanning apart, momentum strong. Best for Continuation playbook.</dd>' +

                        '<dt>Balanced</dt>' +
                        '<dd>Defined range with clear boundaries. Price rotating between support and resistance.</dd>' +

                        '<dt>Contraction</dt>' +
                        '<dd>Volatility squeezing, range tightening. Breakout may be coming.</dd>' +

                        '<dt>Transition</dt>' +
                        '<dd>Unclear state, conflicting signals. <strong>NO TRADING permitted.</strong></dd>' +
                    '</dl>' +
                '</div>' +

                '<div class="glossary-section">' +
                    '<h3>Volatility States</h3>' +
                    '<dl class="glossary">' +
                        '<dt>TREND</dt>' +
                        '<dd>Consistent, manageable volatility. Ideal trading conditions.</dd>' +

                        '<dt>EXPLODE</dt>' +
                        '<dd>Volatility spike. Caution &mdash; wider stops needed, wait for re-price.</dd>' +

                        '<dt>QUIET</dt>' +
                        '<dd>Compressed volatility. Spread/slippage risk. Fewer setups.</dd>' +

                        '<dt>MIXED</dt>' +
                        '<dd>Conflicting volatility signals. Avoid trading &mdash; often the worst environment.</dd>' +
                    '</dl>' +
                '</div>' +
            '</div>';
        }
    };
    
    // Export to window
    window.TradingGuide = TradingGuide;
    
    // Backwards compatibility
    window.GoldNuggetGuide = {
        show: function() { TradingGuide.show('overview'); },
        close: function() { TradingGuide.close(); }
    };
    
})();
