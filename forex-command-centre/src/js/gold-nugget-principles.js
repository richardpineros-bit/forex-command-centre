// ============================================
// GOLD NUGGET PRINCIPLES v1.0.0
// Institutional Risk Framework + Mindset Shifts
// ============================================
// Complete reference for all trading principles embedded in FCC
// Used by: gold-nugget-reminder.js (random popup), gold-nugget-guide.js (reference tab)
// ============================================

window.GoldNuggetPrinciples = {
    
    // ============================================
    // CORE MINDSET SHIFTS (4 principles)
    // ============================================
    
    coreMindset: [
        {
            category: 'Core Mindset',
            principle: 'UTCC is a filter, not a signal generator',
            detail: 'If you can't name the playbook before seeing UTCC, you don't trade. UTCC validates, it doesn't initiate.',
            priority: 'CRITICAL'
        },
        {
            category: 'Core Mindset',
            principle: 'Protect capital from the trader, not assume rationality',
            detail: 'Build a system that stops you when you're likely to act irrationally. Assume you will act emotionally under stress.',
            priority: 'CRITICAL'
        },
        {
            category: 'Core Mindset',
            principle: 'Move from decision support → decision denial',
            detail: 'Hard vetoes, not soft warnings. RED verdict blocks trading. No override mechanism for kill-switches.',
            priority: 'CRITICAL'
        },
        {
            category: 'Core Mindset',
            principle: 'The system stops you; don't rely on willpower',
            detail: 'Discipline is a design problem, not a willpower issue. Build guardrails that make bad decisions impossible.',
            priority: 'CRITICAL'
        }
    ],

    // ============================================
    // RISK COMMITTEE AUDIT PRINCIPLES (4)
    // ============================================
    
    riskAudit: [
        {
            category: 'Risk Audit',
            principle: 'Policy before code',
            detail: 'Define states, triggers, consequences, and authority boundaries first. Code implements policy, not the other way around.',
            priority: 'CRITICAL'
        },
        {
            category: 'Risk Audit',
            principle: 'Risk controls must be independently inspectable',
            detail: 'Separate risk logic from trading logic (veto layer). You must be able to trace every decision without reading 50 functions.',
            priority: 'CRITICAL'
        },
        {
            category: 'Risk Audit',
            principle: 'Fail-closed always',
            detail: 'If regime/session/context data is missing or ambiguous → no trade. Ambiguity blocks, it doesn't allow.',
            priority: 'CRITICAL'
        },
        {
            category: 'Risk Audit',
            principle: 'Avoid ambiguous rules',
            detail: 'No conflicting thresholds. No silent spec drift. One rule set per threshold. If you can't state it in 10 words, it's not clear enough.',
            priority: 'HIGH'
        }
    ],

    // ============================================
    // KILL-SWITCH & LOCKOUT DESIGN (4)
    // ============================================
    
    killSwitches: [
        {
            category: 'Kill-Switches',
            principle: 'Prefer pre-emptive disqualifiers',
            detail: 'Disable playbooks after repeated failure. Don't wait for losses to mount. Prevent the problem, don't warn about it.',
            priority: 'HIGH'
        },
        {
            category: 'Kill-Switches',
            principle: 'Convert leakage from informational → regulatory',
            detail: 'Behaviour must have consequences. Logging alone is toothless. Missed discipline must be visible and must cost.',
            priority: 'HIGH'
        },
        {
            category: 'Kill-Switches',
            principle: 'Timed lockouts beat permanent lockouts',
            detail: 'Use proportionate discipline. 90-minute lockout for leakage. 48-hour cooling for pair losses. Not permanent session nukes.',
            priority: 'HIGH'
        },
        {
            category: 'Kill-Switches',
            principle: 'No override mechanism for kill-switches',
            detail: 'Overrides become escape hatches. RED verdict can't be bypassed. If you keep finding workarounds, the gate failed.',
            priority: 'CRITICAL'
        }
    ],

    // ============================================
    // BEHAVIOURAL CONTROLS (4)
    // ============================================
    
    behavioural: [
        {
            category: 'Behavioural',
            principle: 'Breakeven is neutral',
            detail: 'Breakeven should NOT reset loss streaks or failure counters. One losing trade at BE is still a loss streak. Treat it as such.',
            priority: 'HIGH'
        },
        {
            category: 'Behavioural',
            principle: 'Revenge behaviour must trigger action',
            detail: 'Block + risk reduction + mandatory review gate. Logging alone doesn't stop revenge. Action must have consequences.',
            priority: 'CRITICAL'
        },
        {
            category: 'Behavioural',
            principle: 'Add pair fixation controls',
            detail: '48-hour cooling for a pair after 2 consecutive losses. Pair cooling is separate from loss-streak cooling. Prevents laser focus on one pair.',
            priority: 'HIGH'
        },
        {
            category: 'Behavioural',
            principle: 'Mandatory post-session review gates',
            detail: 'Review required before trading resumes next day. Catches emotional carry-over. Breaks revenge cycles before they start.',
            priority: 'HIGH'
        }
    ],

    // ============================================
    // CAPITAL GOVERNORS & RISK MECHANICS (4)
    // ============================================
    
    capitalGov: [
        {
            category: 'Capital Governors',
            principle: 'Risk reductions should compound',
            detail: 'Risk from 1.5% → 1.125% (75%) → 0.5625% (50% of that) = 0.5625%. Preserves risk memory. Prevents gaming.',
            priority: 'HIGH'
        },
        {
            category: 'Capital Governors',
            principle: 'Keep risk monotonic intraday',
            detail: 'No "risk recovery" until day change. Once reduced, stays reduced for the day. Cumulative effect enforces discipline.',
            priority: 'HIGH'
        },
        {
            category: 'Capital Governors',
            principle: 'Tiered daily loss thresholds',
            detail: '-3% = risk cap (trading continues, reduced); -5% = 24h stand-down; -10% = 48h emergency. Levels don't recover intraday.',
            priority: 'HIGH'
        },
        {
            category: 'Capital Governors',
            principle: 'Time-of-day decay reduces fatigue errors',
            detail: 'After 6+ hours of trading, risk is reduced further. Fatigue = errors. Decay prevents late-session blown accounts.',
            priority: 'MEDIUM'
        }
    ],

    // ============================================
    // EXECUTION MODEL DISCIPLINE (3)
    // ============================================
    
    execution: [
        {
            category: 'Execution',
            principle: 'Every execution model needs timeout rules',
            detail: 'Pullback waiting too long? Timeout invalidates setup. Prevents holding losers "waiting for retest". Set hard limits.',
            priority: 'HIGH'
        },
        {
            category: 'Execution',
            principle: 'Structural invalidation definitions required',
            detail: 'If price breaks the invalidation level, the setup is WRONG. No "maybe it'll recover". Cut it. Move on.',
            priority: 'HIGH'
        },
        {
            category: 'Execution',
            principle: 'Track and log non-trades explicitly',
            detail: 'Missed discipline is invisible unless logged. Timeout/block/pass decisions must be auditable. Shows where you're weakest.',
            priority: 'HIGH'
        }
    ],

    // ============================================
    // INSTITUTIONAL-GRADE EVIDENCE (4)
    // ============================================
    
    institutional: [
        {
            category: 'Institutional-Grade',
            principle: 'Clear Decision Rights Map',
            detail: 'What trader can do vs what system can do. No ambiguous authority. System has final veto on all trades.',
            priority: 'HIGH'
        },
        {
            category: 'Institutional-Grade',
            principle: 'Event → Consequence Matrix',
            detail: 'No judgment calls mid-session. Loss streak = consequence. Revenge detected = consequence. All defined in advance.',
            priority: 'HIGH'
        },
        {
            category: 'Institutional-Grade',
            principle: 'Audit trail that reconstructs everything',
            detail: 'Every veto, trade, non-trade must be logged. You should never rely on memory. System is the source of truth.',
            priority: 'HIGH'
        },
        {
            category: 'Institutional-Grade',
            principle: 'UI must be emotionally unignorable',
            detail: 'Full-width lockout banners. RED stop signs. Reasons. Timers. The system must scream when something's wrong.',
            priority: 'HIGH'
        }
    ],

    // ============================================
    // IMPLEMENTATION GOLD NUGGETS (10)
    // ============================================
    
    implementation: [
        {
            category: 'Implementation',
            principle: 'Don't bury risk logic inside playbooks',
            detail: 'Keep dedicated circuit-breaker module with veto authority separate. Risk decisions shouldn't be scattered across 10 files.',
            priority: 'HIGH'
        },
        {
            category: 'Implementation',
            principle: 'Track leakage during lockout explicitly',
            detail: 'How many times did you try to trade during RED? Log it. Otherwise resume conditions are fake and unreliable.',
            priority: 'HIGH'
        },
        {
            category: 'Implementation',
            principle: 'Be careful with caps vs requested risk',
            detail: 'Risk cap applies to effective risk (after multipliers), not re-derived numbers. If you use 0.75 × requested 2%, cap at 1.5%, not 2%.',
            priority: 'MEDIUM'
        },
        {
            category: 'Implementation',
            principle: 'Trade like a professional business',
            detail: 'Clear plan, routines, standards. Consistency beats talent. Same checklist every day. Same risk rules every trade.',
            priority: 'CRITICAL'
        },
        {
            category: 'Implementation',
            principle: 'Discipline is the edge; follow rules exactly',
            detail: 'Especially when you don't feel like it. Especially when "this one time" seems different. Rules apply to all trades, all days.',
            priority: 'CRITICAL'
        },
        {
            category: 'Implementation',
            principle: 'Survival first; avoid game-ending risks',
            detail: 'Protect capital. Avoid anything that can "end the game" (excessive leverage, oversized single-trade risk). One blowup ends the career.',
            priority: 'CRITICAL'
        },
        {
            category: 'Implementation',
            principle: 'If you can't state your edge in one sentence, you don't have one',
            detail: '"My edge is UTCC + ProZones structure + news gates + circuit breaker discipline." Clear. If it takes 5 minutes to explain, it's not an edge yet.',
            priority: 'HIGH'
        },
        {
            category: 'Implementation',
            principle: 'Trade your personality',
            detail: 'Pick a style you can execute calmly and consistently. If day trading makes you anxious, don't day trade. Swing trade instead.',
            priority: 'HIGH'
        },
        {
            category: 'Implementation',
            principle: 'Process over prediction',
            detail: 'Your job is execution + risk control, not being "right". Follow the process. Results follow discipline, not prediction.',
            priority: 'CRITICAL'
        },
        {
            category: 'Implementation',
            principle: 'Journal everything; reviews turn experience into improvements',
            detail: 'Write down every trade. Why you entered. What happened. Why you exited. Patterns emerge after 50 trades. Improvements compound.',
            priority: 'HIGH'
        }
    ],

    // ============================================
    // TRADING EXECUTION GOLD NUGGETS (15)
    // ============================================
    
    tradingExecution: [
        {
            category: 'Trading Execution',
            principle: 'Keep it simple',
            detail: 'Complexity usually breaks under stress. Simple rules survive. UTCC + ProZones + news gate. Done.',
            priority: 'HIGH'
        },
        {
            category: 'Trading Execution',
            principle: 'Every trade needs a defined plan',
            detail: 'Entry, stop, target, invalidation level. All defined BEFORE you enter. No "I'll decide when I get there".',
            priority: 'CRITICAL'
        },
        {
            category: 'Trading Execution',
            principle: 'Entries matter; exits decide results',
            detail: 'Poor entry with good exit = small loss. Good entry with poor exit = medium loss. Exits are where careers are made or destroyed.',
            priority: 'CRITICAL'
        },
        {
            category: 'Trading Execution',
            principle: 'If price doesn't react as expected, you're wrong',
            detail: 'Accept it fast. Cut it immediately. Don't wait for "the retest". Wrong is wrong. Cut and move on.',
            priority: 'CRITICAL'
        },
        {
            category: 'Trading Execution',
            principle: 'Patience is a weapon',
            detail: 'Wait for your conditions. Even if it means fewer trades. Quality over quantity. 5 good trades beat 50 marginal ones.',
            priority: 'HIGH'
        },
        {
            category: 'Trading Execution',
            principle: 'Focus on asymmetric setups',
            detail: 'Low risk, high upside is where careers are made. 1.5:1+ R:R. Don't take 0.8:1 "high conviction" setups. They kill accounts.',
            priority: 'CRITICAL'
        },
        {
            category: 'Trading Execution',
            principle: 'Opportunity cost is real',
            detail: 'Capital should sit in the best idea, not the "okay" idea. If AUDUSD is better than EURUSD, trade AUDUSD. Don't split capital.',
            priority: 'HIGH'
        },
        {
            category: 'Trading Execution',
            principle: 'Don't outsource conviction',
            detail: 'Other people's opinions are not your risk. If you don't personally believe in the setup, don't trade it.',
            priority: 'HIGH'
        },
        {
            category: 'Trading Execution',
            principle: 'Watch reaction, not headlines',
            detail: 'Price response reveals truth. Big news + small move = no conviction. Small news + big move = real edge. Watch price, not news.',
            priority: 'HIGH'
        },
        {
            category: 'Trading Execution',
            principle: 'Adapt fast; flexibility beats ego',
            detail: 'Conditions change. Your system must be refined without breaking core rules. If a playbook stops working, switch playbooks.',
            priority: 'HIGH'
        },
        {
            category: 'Trading Execution',
            principle: 'Scale intelligently',
            detail: 'When you can scale up. Avoid all-in/all-out emotional decisions. Graduated scaling into winners. Sharp cuts on losers.',
            priority: 'MEDIUM'
        },
        {
            category: 'Trading Execution',
            principle: 'Confidence is earned through work',
            detail: 'Preparation creates calm execution. No shortcuts. If you haven't backtested your setup, don't trade it live.',
            priority: 'HIGH'
        },
        {
            category: 'Trading Execution',
            principle: 'Keep evolving; refine without breaking core rules',
            detail: 'Market changes. Your system must evolve. But don't abandon proven rules for shiny new ideas. Test before deploying.',
            priority: 'MEDIUM'
        },
        {
            category: 'Trading Execution',
            principle: 'Location matters more than score',
            detail: 'Never buy into resistance. Never short into support. Score 90 at resistance = PASS. Score 70 at support = TAKE. Location > score.',
            priority: 'CRITICAL'
        },
        {
            category: 'Trading Execution',
            principle: 'Quality over quantity',
            detail: '5-10 high-quality setups per week > 50 marginal setups. One blown account ends everything. Protect capital first, profits second.',
            priority: 'CRITICAL'
        }
    ],

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================

    getAllPrinciples: function() {
        return [
            ...this.coreMindset,
            ...this.riskAudit,
            ...this.killSwitches,
            ...this.behavioural,
            ...this.capitalGov,
            ...this.execution,
            ...this.institutional,
            ...this.implementation,
            ...this.tradingExecution
        ];
    },

    getRandomPrinciple: function() {
        const all = this.getAllPrinciples();
        return all[Math.floor(Math.random() * all.length)];
    },

    getPrinciplesByCategory: function(category) {
        return this.getAllPrinciples().filter(p => p.category === category);
    },

    getPrinciplesByCritical: function() {
        return this.getAllPrinciples().filter(p => p.priority === 'CRITICAL');
    },

    formatPrincipleForDisplay: function(principle) {
        return {
            title: principle.principle,
            detail: principle.detail,
            category: principle.category,
            priority: principle.priority,
            icon: principle.priority === 'CRITICAL' ? '⚠️' : principle.priority === 'HIGH' ? '⚡' : '💡'
        };
    }
};

console.log('Gold Nugget Principles loaded. Total principles:', window.GoldNuggetPrinciples.getAllPrinciples().length);
