/**
 * Reference Tab Module
 * Forex Command Centre v3.7.0
 * 
 * Renders the entire Reference tab content:
 * - Asset Class Trading Guides (Metals, Energy, Indices, Bonds, Crypto)
 * - Candle Patterns (5 single/multi-bar patterns)
 * - Chart Patterns (20 multi-candle structure patterns)
 * 
 * Extracted from index.html to reduce monolith size.
 */

(function() {
    'use strict';

    const ReferenceTab = {

        /**
         * Initialise - inject content into container
         */
        init: function() {
            var container = document.getElementById('reference-tab-content');
            if (!container) return;
            container.innerHTML = this.getAssetClassGuides() + this.getPatternReference();
        },

        // =====================================================
        // ASSET CLASS TRADING GUIDES
        // =====================================================
        getAssetClassGuides: function() {
            return '<div class="card mb-lg">' +
                '<div class="card-header">' +
                    '<h2 class="card-title">&#x1F4CA; Asset Class Trading Guides</h2>' +
                '</div>' +
                '<div class="accordion">' +
                    this.getMetalsGuide() +
                    this.getEnergyGuide() +
                    this.getIndicesGuide() +
                    this.getBondsGuide() +
                    this.getCryptoGuide() +
                '</div>' +
            '</div>';
        },

        getMetalsGuide: function() {
            return '<div class="accordion-item">' +
                '<button class="accordion-header" onclick="toggleAccordion(this)">' +
                    '<span>&#x1F947; Metals (XAUUSD, XAGUSD, XPTUSD, XCUUSD)</span>' +
                    '<span class="accordion-icon">&#x25BC;</span>' +
                '</button>' +
                '<div class="accordion-content">' +
                    '<div class="mb-md">' +
                        '<h4>What Moves Metals</h4>' +
                        '<ul style="margin-left: 20px; color: var(--text-secondary); font-size: 0.85rem; line-height: 1.8;">' +
                            '<li><strong>USD strength/weakness:</strong> Inverse correlation (USD up = metals down)</li>' +
                            '<li><strong>Real interest rates:</strong> Higher real rates = bearish gold (opportunity cost)</li>' +
                            '<li><strong>Risk sentiment:</strong> Gold/silver as safe havens during fear</li>' +
                            '<li><strong>Inflation expectations:</strong> Hedge against currency debasement</li>' +
                            '<li><strong>Central bank buying:</strong> Structural demand from China, Russia, etc.</li>' +
                        '</ul>' +
                    '</div>' +
                    '<div class="mb-md">' +
                        '<h4>Best Trading Sessions (AEST)</h4>' +
                        '<div class="table-wrapper">' +
                            '<table class="table" style="font-size: 0.85rem;">' +
                                '<thead><tr><th>Session</th><th>AEST</th><th>Quality</th></tr></thead>' +
                                '<tbody>' +
                                    '<tr><td>London Open</td><td>5:00 PM - 7:00 PM</td><td style="color: var(--color-warning);">High volatility, trend starts</td></tr>' +
                                    '<tr><td>London/NY Overlap</td><td>11:00 PM - 2:00 AM</td><td style="color: var(--color-pass);">Best liquidity, strongest moves</td></tr>' +
                                    '<tr><td>NY Session</td><td>11:00 PM - 7:00 AM</td><td style="color: var(--color-info);">USD data releases</td></tr>' +
                                    '<tr><td>Asian Session</td><td>9:00 AM - 5:00 PM</td><td style="color: var(--text-muted);">Lower volatility, consolidation</td></tr>' +
                                '</tbody>' +
                            '</table>' +
                        '</div>' +
                    '</div>' +
                    '<div class="mb-md">' +
                        '<h4>Correlations</h4>' +
                        '<ul style="margin-left: 20px; color: var(--text-secondary); font-size: 0.85rem; line-height: 1.8;">' +
                            '<li><strong>XAUUSD vs DXY:</strong> Strong inverse (-0.8 typical)</li>' +
                            '<li><strong>XAUUSD vs US10Y:</strong> Inverse (yields up = gold down)</li>' +
                            '<li><strong>XAGUSD vs XAUUSD:</strong> High positive (silver follows gold, 2-3x more volatile)</li>' +
                            '<li><strong>XCUUSD:</strong> Industrial metal - follows risk sentiment, China demand</li>' +
                        '</ul>' +
                    '</div>' +
                    '<div class="mb-md">' +
                        '<h4>Risk Considerations</h4>' +
                        '<ul style="margin-left: 20px; color: var(--text-secondary); font-size: 0.85rem; line-height: 1.8;">' +
                            '<li>Gold can gap significantly on geopolitical events</li>' +
                            '<li>Silver is 2-3x more volatile than gold (wider stops needed)</li>' +
                            '<li>Platinum/Copper are industrial - follow economic cycle</li>' +
                            '<li>FOMC and NFP create large moves in gold</li>' +
                        '</ul>' +
                    '</div>' +
                    '<div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px;">' +
                        '<h5 style="margin-bottom: 8px;">UTCC Calibration</h5>' +
                        '<div class="table-wrapper">' +
                            '<table class="table" style="font-size: 0.8rem;">' +
                                '<thead><tr><th>Metal</th><th>ATR Filter</th><th>ADX Threshold</th><th>Entry HOT</th></tr></thead>' +
                                '<tbody>' +
                                    '<tr><td>Gold</td><td>70%</td><td>18</td><td>0.3 ATR</td></tr>' +
                                    '<tr><td>Silver</td><td>60%</td><td>16</td><td>0.4 ATR</td></tr>' +
                                    '<tr><td>Platinum</td><td>55%</td><td>15</td><td>0.5 ATR</td></tr>' +
                                    '<tr><td>Copper</td><td>50%</td><td>14</td><td>0.5 ATR</td></tr>' +
                                '</tbody>' +
                            '</table>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';
        },

        getEnergyGuide: function() {
            return '<div class="accordion-item">' +
                '<button class="accordion-header" onclick="toggleAccordion(this)">' +
                    '<span>&#x1F6E2; Energy (WTICOUSD, BCOUSD, NATGASUSD)</span>' +
                    '<span class="accordion-icon">&#x25BC;</span>' +
                '</button>' +
                '<div class="accordion-content">' +
                    '<div class="mb-md">' +
                        '<h4>What Moves Energy</h4>' +
                        '<ul style="margin-left: 20px; color: var(--text-secondary); font-size: 0.85rem; line-height: 1.8;">' +
                            '<li><strong>Supply/demand balance:</strong> OPEC+ decisions, US shale production</li>' +
                            '<li><strong>Inventory data:</strong> EIA weekly report (Wednesday)</li>' +
                            '<li><strong>Geopolitics:</strong> Middle East tensions, Russia sanctions</li>' +
                            '<li><strong>USD strength:</strong> Oil priced in USD globally</li>' +
                            '<li><strong>Economic growth:</strong> Demand proxy for global activity</li>' +
                            '<li><strong>Weather:</strong> NatGas especially (heating/cooling demand)</li>' +
                        '</ul>' +
                    '</div>' +
                    '<div class="mb-md">' +
                        '<h4>Best Trading Sessions (AEST)</h4>' +
                        '<div class="table-wrapper">' +
                            '<table class="table" style="font-size: 0.85rem;">' +
                                '<thead><tr><th>Session</th><th>AEST</th><th>Quality</th></tr></thead>' +
                                '<tbody>' +
                                    '<tr><td>NYMEX Open</td><td>11:30 PM</td><td style="color: var(--color-warning);">Initial volatility</td></tr>' +
                                    '<tr><td>EIA Report</td><td>Wed ~12:30 AM</td><td style="color: var(--color-fail);">HIGH IMPACT - 4h buffer</td></tr>' +
                                    '<tr><td>NYMEX Core</td><td>11:30 PM - 5:00 AM</td><td style="color: var(--color-pass);">Best liquidity</td></tr>' +
                                '</tbody>' +
                            '</table>' +
                        '</div>' +
                    '</div>' +
                    '<div class="mb-md" style="background: rgba(239, 68, 68, 0.1); padding: 12px; border-radius: 8px; border-left: 3px solid var(--color-fail);">' +
                        '<h4 style="color: var(--color-fail); margin-bottom: 8px;">WARNING: Key Events - NO ENTRY ZONES</h4>' +
                        '<ul style="margin-left: 20px; color: var(--text-secondary); font-size: 0.85rem; line-height: 1.8;">' +
                            '<li><strong>EIA Crude Inventory:</strong> Wednesday ~12:30 AM AEST (4h buffer mandatory)</li>' +
                            '<li><strong>API Report:</strong> Tuesday evening (preview, less impact)</li>' +
                            '<li><strong>OPEC+ Meetings:</strong> Check calendar - massive impact</li>' +
                            '<li><strong>Baker Hughes Rig Count:</strong> Friday evening</li>' +
                        '</ul>' +
                    '</div>' +
                    '<div class="mb-md">' +
                        '<h4>Correlations</h4>' +
                        '<ul style="margin-left: 20px; color: var(--text-secondary); font-size: 0.85rem; line-height: 1.8;">' +
                            '<li><strong>WTI vs Brent:</strong> Very high positive (~0.95) - trade one, not both</li>' +
                            '<li><strong>Oil vs AUD/CAD:</strong> Commodity currencies follow oil</li>' +
                            '<li><strong>NatGas:</strong> More independent - weather driven</li>' +
                        '</ul>' +
                    '</div>' +
                    '<div class="mb-md">' +
                        '<h4>Risk Considerations</h4>' +
                        '<ul style="margin-left: 20px; color: var(--text-secondary); font-size: 0.85rem; line-height: 1.8;">' +
                            '<li>Monday gaps common (weekend geopolitics)</li>' +
                            '<li>EIA day = avoid new entries 4h before</li>' +
                            '<li>NatGas is extremely volatile - reduce position size to 1% max</li>' +
                            '<li>Brent typically trades at premium to WTI</li>' +
                        '</ul>' +
                    '</div>' +
                    '<div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px;">' +
                        '<h5 style="margin-bottom: 8px;">UTCC Calibration</h5>' +
                        '<div class="table-wrapper">' +
                            '<table class="table" style="font-size: 0.8rem;">' +
                                '<thead><tr><th>Energy</th><th>ATR Filter</th><th>ADX Threshold</th><th>Entry HOT</th></tr></thead>' +
                                '<tbody>' +
                                    '<tr><td>WTI/Brent</td><td>55%</td><td>17</td><td>0.5 ATR</td></tr>' +
                                    '<tr><td>NatGas</td><td>40%</td><td>14</td><td>0.8 ATR</td></tr>' +
                                '</tbody>' +
                            '</table>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';
        },

        getIndicesGuide: function() {
            return '<div class="accordion-item">' +
                '<button class="accordion-header" onclick="toggleAccordion(this)">' +
                    '<span>&#x1F4C8; Indices (13 Instruments)</span>' +
                    '<span class="accordion-icon">&#x25BC;</span>' +
                '</button>' +
                '<div class="accordion-content">' +
                    '<div class="mb-md">' +
                        '<h4>Your Tradeable Indices</h4>' +
                        '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; font-size: 0.85rem;">' +
                            '<div><strong>US:</strong> US30USD, SPX500USD, NAS100USD, US2000USD</div>' +
                            '<div><strong>Europe:</strong> DE30EUR, UK100GBP, FR40EUR, EU50EUR</div>' +
                            '<div><strong>Asia/Pacific:</strong> JP225USD, JP225YJPY, HK33HKD, CN50USD, AU200AUD</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="mb-md">' +
                        '<h4>What Moves Indices</h4>' +
                        '<ul style="margin-left: 20px; color: var(--text-secondary); font-size: 0.85rem; line-height: 1.8;">' +
                            '<li><strong>Central bank policy:</strong> Fed, ECB, BOJ, BOE decisions</li>' +
                            '<li><strong>Earnings season:</strong> Quarterly corporate results</li>' +
                            '<li><strong>Economic data:</strong> GDP, employment, PMI</li>' +
                            '<li><strong>Risk sentiment:</strong> Risk-on = indices up</li>' +
                            '<li><strong>Bond yields:</strong> Rising yields can pressure equities</li>' +
                        '</ul>' +
                    '</div>' +
                    '<div class="mb-md">' +
                        '<h4>Best Trading Sessions (AEST)</h4>' +
                        '<div class="table-wrapper">' +
                            '<table class="table" style="font-size: 0.85rem;">' +
                                '<thead><tr><th>Index Group</th><th>Best Session</th><th>AEST</th></tr></thead>' +
                                '<tbody>' +
                                    '<tr><td>US (US30, SPX500, NAS100)</td><td>NY Session</td><td>11:30 PM - 6:00 AM</td></tr>' +
                                    '<tr><td>European (DE30, UK100, FR40)</td><td>London</td><td>5:00 PM - 1:30 AM</td></tr>' +
                                    '<tr><td>Asian (JP225, HK33, CN50)</td><td>Tokyo/HK</td><td>10:00 AM - 4:00 PM</td></tr>' +
                                    '<tr><td>AU200</td><td>ASX Session</td><td>10:00 AM - 4:00 PM</td></tr>' +
                                '</tbody>' +
                            '</table>' +
                        '</div>' +
                    '</div>' +
                    '<div class="mb-md">' +
                        '<h4>Index Characteristics</h4>' +
                        '<div class="table-wrapper">' +
                            '<table class="table" style="font-size: 0.8rem;">' +
                                '<thead><tr><th>Index</th><th>Volatility</th><th>Character</th></tr></thead>' +
                                '<tbody>' +
                                    '<tr><td>US30 (Dow)</td><td style="color: var(--color-warning);">Medium</td><td>30 blue chips, price-weighted</td></tr>' +
                                    '<tr><td>SPX500</td><td style="color: var(--color-warning);">Medium</td><td>Broad market, most watched</td></tr>' +
                                    '<tr><td>NAS100</td><td style="color: var(--color-fail);">High</td><td>Tech-heavy, volatile</td></tr>' +
                                    '<tr><td>US2000</td><td style="color: var(--color-fail);">High</td><td>Small caps, risk proxy</td></tr>' +
                                    '<tr><td>DE30 (DAX)</td><td style="color: var(--color-fail);">High</td><td>Export-heavy, volatile</td></tr>' +
                                    '<tr><td>UK100 (FTSE)</td><td style="color: var(--color-warning);">Medium</td><td>Commodity/financial heavy</td></tr>' +
                                    '<tr><td>JP225</td><td style="color: var(--color-warning);">Medium</td><td>BOJ sensitive, yen inverse</td></tr>' +
                                    '<tr><td>HK33/CN50</td><td style="color: var(--color-fail);">High</td><td>China policy sensitive</td></tr>' +
                                    '<tr><td>AU200</td><td style="color: var(--color-warning);">Medium</td><td>Mining/banks heavy</td></tr>' +
                                '</tbody>' +
                            '</table>' +
                        '</div>' +
                    '</div>' +
                    '<div class="mb-md">' +
                        '<h4>Correlations</h4>' +
                        '<ul style="margin-left: 20px; color: var(--text-secondary); font-size: 0.85rem; line-height: 1.8;">' +
                            '<li><strong>US indices:</strong> High correlation (0.85+) - don\'t overexpose</li>' +
                            '<li><strong>SPX500 vs NAS100:</strong> NAS leads in risk-on, lags in risk-off</li>' +
                            '<li><strong>DAX vs SPX500:</strong> Follows US but European hours</li>' +
                            '<li><strong>AU200 vs China:</strong> Mining exposure link</li>' +
                        '</ul>' +
                    '</div>' +
                    '<div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px;">' +
                        '<h5 style="margin-bottom: 8px;">Risk Note</h5>' +
                        '<p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0;">US indices gap on major earnings (AAPL, MSFT, NVDA). FOMC creates large moves across ALL indices. Avoid holding unhedged through these events.</p>' +
                    '</div>' +
                '</div>' +
            '</div>';
        },

        getBondsGuide: function() {
            return '<div class="accordion-item">' +
                '<button class="accordion-header" onclick="toggleAccordion(this)">' +
                    '<span>&#x1F4B5; Bonds (6 Instruments)</span>' +
                    '<span class="accordion-icon">&#x25BC;</span>' +
                '</button>' +
                '<div class="accordion-content">' +
                    '<div class="mb-md" style="background: rgba(59, 130, 246, 0.1); padding: 12px; border-radius: 8px; border-left: 3px solid var(--color-info);">' +
                        '<h4 style="color: var(--color-info); margin-bottom: 8px;">&#x1F4A1; Understanding Bond Pricing</h4>' +
                        '<ul style="margin-left: 20px; color: var(--text-secondary); font-size: 0.85rem; line-height: 1.8;">' +
                            '<li><strong>Price UP = Yield DOWN</strong> (inverse relationship)</li>' +
                            '<li>Long bond position = betting yields will fall</li>' +
                            '<li>Short bond position = betting yields will rise</li>' +
                        '</ul>' +
                    '</div>' +
                    '<div class="mb-md">' +
                        '<h4>Your Bond Instruments</h4>' +
                        '<div class="table-wrapper">' +
                            '<table class="table" style="font-size: 0.85rem;">' +
                                '<thead><tr><th>Symbol</th><th>Bond</th><th>Duration</th><th>Sensitivity</th></tr></thead>' +
                                '<tbody>' +
                                    '<tr><td>USB02YUSD</td><td>US 2-Year</td><td>Short</td><td>Fed policy, front-end</td></tr>' +
                                    '<tr><td>USB05YUSD</td><td>US 5-Year</td><td>Medium</td><td>Balanced</td></tr>' +
                                    '<tr><td>USB10YUSD</td><td>US 10-Year</td><td>Long</td><td>Benchmark, most watched</td></tr>' +
                                    '<tr><td>USB30YUSD</td><td>US 30-Year</td><td>Very Long</td><td>Most volatile</td></tr>' +
                                    '<tr><td>UK10YBGBP</td><td>UK 10-Year Gilt</td><td>Long</td><td>BOE policy</td></tr>' +
                                    '<tr><td>DE10YBEUR</td><td>German 10-Year Bund</td><td>Long</td><td>ECB policy</td></tr>' +
                                '</tbody>' +
                            '</table>' +
                        '</div>' +
                    '</div>' +
                    '<div class="mb-md">' +
                        '<h4>What Moves Bonds</h4>' +
                        '<ul style="margin-left: 20px; color: var(--text-secondary); font-size: 0.85rem; line-height: 1.8;">' +
                            '<li><strong>Interest rate expectations:</strong> Fed/ECB/BOE policy outlook</li>' +
                            '<li><strong>Inflation data:</strong> CPI, PCE releases - massive impact</li>' +
                            '<li><strong>Risk sentiment:</strong> Flight to safety = bonds up (yields down)</li>' +
                            '<li><strong>Supply (auctions):</strong> Treasury/Gilt/Bund auction results</li>' +
                            '<li><strong>Central bank guidance:</strong> Forward guidance shifts</li>' +
                        '</ul>' +
                    '</div>' +
                    '<div class="mb-md" style="background: rgba(239, 68, 68, 0.1); padding: 12px; border-radius: 8px; border-left: 3px solid var(--color-fail);">' +
                        '<h4 style="color: var(--color-fail); margin-bottom: 8px;">WARNING: High Impact Events</h4>' +
                        '<div class="table-wrapper">' +
                            '<table class="table" style="font-size: 0.85rem;">' +
                                '<thead><tr><th>Event</th><th>AEST</th><th>Impact</th></tr></thead>' +
                                '<tbody>' +
                                    '<tr><td>US CPI/NFP</td><td>10:30 PM</td><td style="color: var(--color-fail);">Massive moves - 4h buffer</td></tr>' +
                                    '<tr><td>FOMC Decision</td><td>6:00 AM</td><td style="color: var(--color-fail);">Trend setter - avoid</td></tr>' +
                                    '<tr><td>Treasury Auctions</td><td>Varies</td><td style="color: var(--color-warning);">Supply impact</td></tr>' +
                                '</tbody>' +
                            '</table>' +
                        '</div>' +
                    '</div>' +
                    '<div class="mb-md">' +
                        '<h4>Key Relationships</h4>' +
                        '<ul style="margin-left: 20px; color: var(--text-secondary); font-size: 0.85rem; line-height: 1.8;">' +
                            '<li><strong>2Y vs 10Y spread:</strong> Yield curve (inversion = recession signal)</li>' +
                            '<li><strong>US10Y vs Gold:</strong> Inverse (yields up = gold down)</li>' +
                            '<li><strong>US10Y vs USD:</strong> Generally positive</li>' +
                            '<li><strong>Bund vs Treasury:</strong> Spread trades on policy divergence</li>' +
                        '</ul>' +
                    '</div>' +
                    '<div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px;">' +
                        '<h5 style="margin-bottom: 8px;">UTCC Calibration</h5>' +
                        '<div class="table-wrapper">' +
                            '<table class="table" style="font-size: 0.8rem;">' +
                                '<thead><tr><th>Duration</th><th>ATR Filter</th><th>Character</th></tr></thead>' +
                                '<tbody>' +
                                    '<tr><td>Short (2Y)</td><td>45%</td><td>Fed sensitive, less volatile</td></tr>' +
                                    '<tr><td>Medium (5Y)</td><td>50%</td><td>Balanced</td></tr>' +
                                    '<tr><td>Long (10Y+)</td><td>55%</td><td>More volatile, trend following</td></tr>' +
                                '</tbody>' +
                            '</table>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';
        },

        getCryptoGuide: function() {
            return '<div class="accordion-item">' +
                '<button class="accordion-header" onclick="toggleAccordion(this)">' +
                    '<span>&#x20BF; Crypto (BTCUSD, ETHUSD, BCHUSD, LTCUSD, MBTCUSD)</span>' +
                    '<span class="accordion-icon">&#x25BC;</span>' +
                '</button>' +
                '<div class="accordion-content">' +
                    '<div class="mb-md">' +
                        '<h4>What Moves Crypto</h4>' +
                        '<ul style="margin-left: 20px; color: var(--text-secondary); font-size: 0.85rem; line-height: 1.8;">' +
                            '<li><strong>Bitcoin dominance:</strong> BTC leads, alts follow</li>' +
                            '<li><strong>Risk sentiment:</strong> Correlates with tech/growth stocks</li>' +
                            '<li><strong>Regulatory news:</strong> SEC, government actions</li>' +
                            '<li><strong>Institutional flows:</strong> ETF inflows/outflows</li>' +
                            '<li><strong>Halving cycles:</strong> ~4 year BTC supply reduction</li>' +
                            '<li><strong>Exchange events:</strong> Hacks, delistings, liquidity issues</li>' +
                        '</ul>' +
                    '</div>' +
                    '<div class="mb-md">' +
                        '<h4>Trading Sessions (24/7 Market)</h4>' +
                        '<div class="table-wrapper">' +
                            '<table class="table" style="font-size: 0.85rem;">' +
                                '<thead><tr><th>Period</th><th>AEST</th><th>Quality</th></tr></thead>' +
                                '<tbody>' +
                                    '<tr><td>US Session</td><td>11:00 PM - 7:00 AM</td><td style="color: var(--color-pass);">Highest volume, best setups</td></tr>' +
                                    '<tr><td>European</td><td>5:00 PM - 1:00 AM</td><td style="color: var(--color-info);">Good liquidity</td></tr>' +
                                    '<tr><td>Asian</td><td>9:00 AM - 5:00 PM</td><td style="color: var(--text-muted);">Often consolidation</td></tr>' +
                                    '<tr><td>Weekend</td><td>All day</td><td style="color: var(--color-warning);">Reduced liquidity, wider spreads</td></tr>' +
                                '</tbody>' +
                            '</table>' +
                        '</div>' +
                    '</div>' +
                    '<div class="mb-md">' +
                        '<h4>Instrument Notes</h4>' +
                        '<div class="table-wrapper">' +
                            '<table class="table" style="font-size: 0.85rem;">' +
                                '<thead><tr><th>Symbol</th><th>What It Is</th><th>Notes</th></tr></thead>' +
                                '<tbody>' +
                                    '<tr><td>BTCUSD</td><td>Bitcoin</td><td>Market leader - primary trading instrument</td></tr>' +
                                    '<tr><td>MBTCUSD</td><td>Micro Bitcoin</td><td>Smaller position sizing option</td></tr>' +
                                    '<tr><td>ETHUSD</td><td>Ethereum</td><td>Tech/DeFi proxy, more volatile than BTC</td></tr>' +
                                    '<tr><td>LTCUSD</td><td>Litecoin</td><td>"Silver to BTC\'s gold"</td></tr>' +
                                    '<tr><td>BCHUSD</td><td>Bitcoin Cash</td><td>BTC fork, follows BTC</td></tr>' +
                                '</tbody>' +
                            '</table>' +
                        '</div>' +
                    '</div>' +
                    '<div class="mb-md">' +
                        '<h4>Correlations</h4>' +
                        '<ul style="margin-left: 20px; color: var(--text-secondary); font-size: 0.85rem; line-height: 1.8;">' +
                            '<li><strong>BTC vs ETH:</strong> High (0.8+) but ETH more volatile</li>' +
                            '<li><strong>BTC vs NAS100:</strong> Moderate positive (risk asset)</li>' +
                            '<li><strong>Altcoins vs BTC:</strong> Follow with leverage (both ways)</li>' +
                            '<li><strong>Crypto vs USD:</strong> Generally inverse</li>' +
                        '</ul>' +
                    '</div>' +
                    '<div class="mb-md" style="background: rgba(239, 68, 68, 0.1); padding: 12px; border-radius: 8px; border-left: 3px solid var(--color-fail);">' +
                        '<h4 style="color: var(--color-fail); margin-bottom: 8px;">WARNING: Risk Considerations</h4>' +
                        '<ul style="margin-left: 20px; color: var(--text-secondary); font-size: 0.85rem; line-height: 1.8;">' +
                            '<li>24/7 market = no daily close, can\'t "sleep easy"</li>' +
                            '<li>Weekend liquidity drops - gaps possible Monday</li>' +
                            '<li>News-driven moves can be extreme (50%+ in days)</li>' +
                            '<li>No circuit breakers - can move indefinitely</li>' +
                            '<li>Regulatory headlines create instant volatility</li>' +
                            '<li><strong>Position size: 1% max recommended</strong></li>' +
                        '</ul>' +
                    '</div>' +
                    '<div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px;">' +
                        '<h5 style="margin-bottom: 8px;">UTCC Calibration</h5>' +
                        '<div class="table-wrapper">' +
                            '<table class="table" style="font-size: 0.8rem;">' +
                                '<thead><tr><th>Crypto</th><th>ATR Filter</th><th>ADX Threshold</th><th>Entry HOT</th></tr></thead>' +
                                '<tbody>' +
                                    '<tr><td>BTC/BCH/LTC</td><td>40%</td><td>14</td><td>0.8 ATR</td></tr>' +
                                    '<tr><td>ETH</td><td>35%</td><td>13</td><td>1.0 ATR</td></tr>' +
                                '</tbody>' +
                            '</table>' +
                        '</div>' +
                        '<div style="margin-top: 8px; font-size: 0.8rem; color: var(--text-muted);">' +
                            '<strong>Crypto Rules:</strong> US Session only for best setups. Reduce size on weekends. BTC is the benchmark. No scheduled news - sentiment driven.' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';
        },

        // =====================================================
        // PATTERN REFERENCE
        // =====================================================
        getPatternReference: function() {
            return '<div class="card mb-lg">' +
                '<div class="card-header">' +
                    '<h2 class="card-title">&#x1F4D0; Chart &#x26; Candle Pattern Reference</h2>' +
                '</div>' +
                '<div class="accordion">' +
                    this.getCandlePatterns() +
                    this.getReversalPatterns() +
                    this.getContinuationPatterns() +
                '</div>' +
            '</div>';
        },

        // =====================================================
        // CANDLE PATTERNS (existing 5 - unchanged)
        // =====================================================
        getCandlePatterns: function() {
            return '<div class="accordion-item">' +
                '<button class="accordion-header" onclick="toggleAccordion(this)">' +
                    '<span>&#x1F56F; Candle Patterns (Single &#x26; Multi-Bar)</span>' +
                    '<span class="accordion-icon">&#x25BC;</span>' +
                '</button>' +
                '<div class="accordion-content">' +
                    '<div class="pattern-grid">' +
                        this.patternCard('Bullish Engulfing', 'reversal',
                            '<svg width="120" height="100" viewBox="0 0 120 100">' +
                                '<line x1="35" y1="15" x2="35" y2="85" stroke="var(--color-fail)" stroke-width="2"/>' +
                                '<rect x="25" y="30" width="20" height="40" fill="var(--color-fail)" rx="2"/>' +
                                '<line x1="85" y1="10" x2="85" y2="90" stroke="var(--color-pass)" stroke-width="2"/>' +
                                '<rect x="70" y="20" width="30" height="55" fill="var(--color-pass)" rx="2"/>' +
                                '<text x="60" y="98" font-size="9" fill="var(--text-muted)" text-anchor="middle">Body engulfs prior</text>' +
                            '</svg>',
                            'A large bullish candle completely engulfs the body of the prior bearish candle. Shows aggressive buying overwhelming sellers.',
                            'Valid trigger on 4H when at EMA support or key S/R zone. UTCC must be ARMED LONG. Strongest after 2-3 bearish candles (capitulation).',
                            'Entry: Close of engulfing candle or pullback to 50% of engulfing body|Stop: Below low of engulfing candle + buffer|Target: Next resistance zone or 1.5-2x risk',
                            'Into resistance. During K-SPIKE. Small body (not dominant). Mid-range with no structure nearby.'
                        ) +
                        this.patternCard('Bearish Engulfing', 'reversal',
                            '<svg width="120" height="100" viewBox="0 0 120 100">' +
                                '<line x1="35" y1="15" x2="35" y2="85" stroke="var(--color-pass)" stroke-width="2"/>' +
                                '<rect x="25" y="30" width="20" height="40" fill="var(--color-pass)" rx="2"/>' +
                                '<line x1="85" y1="10" x2="85" y2="90" stroke="var(--color-fail)" stroke-width="2"/>' +
                                '<rect x="70" y="25" width="30" height="50" fill="var(--color-fail)" rx="2"/>' +
                                '<text x="60" y="98" font-size="9" fill="var(--text-muted)" text-anchor="middle">Body engulfs prior</text>' +
                            '</svg>',
                            'A large bearish candle completely engulfs the body of the prior bullish candle. Shows aggressive selling overwhelming buyers.',
                            'Valid trigger on 4H at EMA resistance or key S/R zone. UTCC must be ARMED SHORT. Strongest after 2-3 bullish candles into resistance.',
                            'Entry: Close of engulfing candle or pullback to 50% of engulfing body|Stop: Above high of engulfing candle + buffer|Target: Next support zone or 1.5-2x risk',
                            'Into support. During K-SPIKE. Small body relative to recent range. No prior bullish context to reverse.'
                        ) +
                        this.patternCard('Hammer / Pinbar (Bullish)', 'reversal',
                            '<svg width="120" height="100" viewBox="0 0 120 100">' +
                                '<line x1="60" y1="20" x2="60" y2="90" stroke="var(--color-pass)" stroke-width="2"/>' +
                                '<rect x="50" y="20" width="20" height="15" fill="var(--color-pass)" rx="2"/>' +
                                '<line x1="40" y1="35" x2="80" y2="35" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<text x="90" y="38" font-size="8" fill="var(--text-muted)">body</text>' +
                                '<line x1="40" y1="55" x2="80" y2="55" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<text x="90" y="58" font-size="8" fill="var(--text-muted)">wick</text>' +
                                '<text x="60" y="98" font-size="9" fill="var(--text-muted)" text-anchor="middle">Long lower wick</text>' +
                            '</svg>',
                            'Small body at top of range with long lower wick (2x+ body size). Price went down, got rejected, and closed near the high. Sellers tried and failed.',
                            'Primary trigger pattern at EMA support zones. Wick must pierce into support and close back above. Best when UTCC is ARMED LONG and 1H EMAs are stacked bullish.',
                            'Entry: Break above pinbar high on next candle|Stop: Below wick low + buffer|Target: Next resistance or 2:1 R:R',
                            'Wick too short (less than 2x body). Into resistance. During R-COMPRESSION with no catalyst. Upper wick longer than lower wick.'
                        ) +
                        this.patternCard('Shooting Star / Pinbar (Bearish)', 'reversal',
                            '<svg width="120" height="100" viewBox="0 0 120 100">' +
                                '<line x1="60" y1="10" x2="60" y2="80" stroke="var(--color-fail)" stroke-width="2"/>' +
                                '<rect x="50" y="65" width="20" height="15" fill="var(--color-fail)" rx="2"/>' +
                                '<text x="60" y="98" font-size="9" fill="var(--text-muted)" text-anchor="middle">Long upper wick</text>' +
                            '</svg>',
                            'Small body at bottom of range with long upper wick. Price went up, got rejected, and closed near the low. Buyers tried and failed.',
                            'Primary trigger at EMA resistance. Wick must pierce into resistance and close back below. Best when UTCC is ARMED SHORT and 1H EMAs stacked bearish.',
                            'Entry: Break below shooting star low on next candle|Stop: Above wick high + buffer|Target: Next support or 2:1 R:R',
                            'Into support. Wick too short. During strong expansion trend (could be normal pullback). Lower wick longer than upper.'
                        ) +
                        this.patternCard('Inside Bar', 'neutral',
                            '<svg width="120" height="100" viewBox="0 0 120 100">' +
                                '<line x1="35" y1="10" x2="35" y2="90" stroke="var(--color-info)" stroke-width="2"/>' +
                                '<rect x="23" y="20" width="24" height="55" fill="var(--color-info)" opacity="0.7" rx="2"/>' +
                                '<line x1="80" y1="25" x2="80" y2="80" stroke="var(--color-warning)" stroke-width="2"/>' +
                                '<rect x="70" y="35" width="20" height="30" fill="var(--color-warning)" opacity="0.7" rx="2"/>' +
                                '<line x1="15" y1="20" x2="100" y2="20" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<line x1="15" y1="75" x2="100" y2="75" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<text x="60" y="98" font-size="9" fill="var(--text-muted)" text-anchor="middle">Range within range</text>' +
                            '</svg>',
                            'A candle whose entire range (high to low) fits within the prior candle\'s range. True compression - market is coiling before the next move.',
                            'Marks potential breakout zones. Direction determined by UTCC bias and trend context. Multiple consecutive inside bars = stronger compression. Trade the breakout, not the inside bar itself.',
                            'Entry: Break above mother bar high (long) or below low (short)|Stop: Opposite side of mother bar|Target: ATR-based (1-1.5x daily ATR from breakout)',
                            'Mid-range with no trend context. During dead zone sessions. If mother bar is too small (doji inside a doji = noise).'
                        ) +
                    '</div>' +
                '</div>' +
            '</div>';
        },

        // =====================================================
        // CHART PATTERNS - REVERSAL (10 patterns)
        // =====================================================
        getReversalPatterns: function() {
            return '<div class="accordion-item">' +
                '<button class="accordion-header" onclick="toggleAccordion(this)">' +
                    '<span>&#x1F504; Reversal Patterns (Multi-Candle Structure)</span>' +
                    '<span class="accordion-icon">&#x25BC;</span>' +
                '</button>' +
                '<div class="accordion-content">' +
                    '<div class="pattern-grid">' +
                        // --- BEARISH REVERSALS ---
                        this.patternCard('Bearish Double Top', 'reversal',
                            '<svg width="180" height="100" viewBox="0 0 180 100">' +
                                '<polyline points="10,80 30,60 50,25 70,55 90,25 110,55 130,70 160,85" fill="none" stroke="var(--color-fail)" stroke-width="2.5"/>' +
                                '<line x1="50" y1="25" x2="90" y2="25" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<line x1="20" y1="55" x2="140" y2="55" stroke="var(--color-warning)" stroke-width="1" stroke-dasharray="4"/>' +
                                '<text x="150" y="52" font-size="8" fill="var(--color-warning)">neckline</text>' +
                            '</svg>',
                            'Price hits resistance twice at roughly the same level and fails both times. The neckline (support between the two peaks) is the trigger line.',
                            'Confluence signal when UTCC shows weakening momentum at resistance. Second peak should show lower RSI (bearish divergence). Best on 4H+ timeframes.',
                            'Entry: Break and close below neckline|Stop: Above the higher of the two peaks + buffer|Target: Neckline to peak distance projected downward',
                            'In a strong uptrend (likely just a pullback, not a reversal). Peaks too close together (less than 10 bars apart). No volume/momentum divergence.'
                        ) +
                        this.patternCard('Bearish Head &#x26; Shoulders', 'reversal',
                            '<svg width="180" height="100" viewBox="0 0 180 100">' +
                                '<polyline points="10,70 25,55 40,40 55,55 70,50 85,15 100,50 115,55 130,40 145,55 165,75" fill="none" stroke="var(--color-fail)" stroke-width="2.5"/>' +
                                '<line x1="30" y1="55" x2="150" y2="55" stroke="var(--color-warning)" stroke-width="1.5" stroke-dasharray="4"/>' +
                                '<text x="90" y="96" font-size="8" fill="var(--text-muted)" text-anchor="middle">L shoulder - Head - R shoulder</text>' +
                            '</svg>',
                            'Three peaks: left shoulder, higher head, right shoulder. The neckline connects the lows between them. Classic institutional reversal pattern.',
                            'High-probability short when right shoulder forms below EMA resistance and UTCC momentum is declining. RSI should show progressive divergence across all three peaks.',
                            'Entry: Break below neckline with volume/momentum|Stop: Above right shoulder + buffer|Target: Head to neckline distance projected from break',
                            'Right shoulder higher than left (pattern failing). Neckline sloping steeply upward. Pattern took too long to form (100+ candles).'
                        ) +
                        this.patternCard('Bearish Rising Wedge', 'reversal',
                            '<svg width="180" height="100" viewBox="0 0 180 100">' +
                                '<line x1="10" y1="80" x2="150" y2="20" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<line x1="10" y1="60" x2="150" y2="28" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<polyline points="15,70 35,55 50,65 70,42 85,52 105,32 120,40 140,25" fill="none" stroke="var(--color-fail)" stroke-width="2"/>' +
                                '<polyline points="140,25 155,45 170,80" fill="none" stroke="var(--color-fail)" stroke-width="2" stroke-dasharray="5"/>' +
                                '<text x="90" y="96" font-size="8" fill="var(--text-muted)" text-anchor="middle">Converging up = bearish</text>' +
                            '</svg>',
                            'Both highs and lows rising, but converging. Momentum is exhausting as buyers weaken with each push higher. Breakout is typically to the downside.',
                            'Rising wedge at resistance with declining UTCC score = strong short setup. RSI divergence (lower highs while price makes higher highs) adds conviction.',
                            'Entry: Break below lower trendline|Stop: Above last swing high inside wedge|Target: Height of wedge at widest point from breakout',
                            'In same direction as a strong trend (could just be trend). Fewer than 3 touches per boundary. Wedge too narrow to trade with adequate R:R.'
                        ) +
                        this.patternCard('Bearish Expanding Triangle', 'reversal',
                            '<svg width="180" height="100" viewBox="0 0 180 100">' +
                                '<line x1="30" y1="40" x2="160" y2="10" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<line x1="30" y1="60" x2="160" y2="90" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<polyline points="35,50 55,42 65,58 85,35 100,65 120,25 140,75 155,20" fill="none" stroke="var(--color-fail)" stroke-width="2"/>' +
                                '<polyline points="155,20 165,55 175,85" fill="none" stroke="var(--color-fail)" stroke-width="2" stroke-dasharray="5"/>' +
                                '<text x="90" y="96" font-size="8" fill="var(--text-muted)" text-anchor="middle">Diverging boundaries = instability</text>' +
                            '</svg>',
                            'Boundaries widen over time with higher highs and lower lows. Indicates increasing instability and indecision. Often resolves with a sharp directional move.',
                            'Bearish bias when final swing fails to make a new high. UTCC weakening on each push up confirms exhaustion. Best traded on the final failed high.',
                            'Entry: Break below lower expanding boundary after failed high|Stop: Above last high + buffer|Target: Width of triangle at widest point',
                            'Messy or unclear boundaries. During strong trending markets (less reliable). Fewer than 3 swings to define the pattern.'
                        ) +
                        this.patternCard('Bearish Triple Top', 'reversal',
                            '<svg width="180" height="100" viewBox="0 0 180 100">' +
                                '<polyline points="10,75 25,55 40,25 55,55 70,25 85,55 105,25 120,55 140,70 165,85" fill="none" stroke="var(--color-fail)" stroke-width="2.5"/>' +
                                '<line x1="40" y1="25" x2="105" y2="25" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<line x1="20" y1="55" x2="145" y2="55" stroke="var(--color-warning)" stroke-width="1" stroke-dasharray="4"/>' +
                                '<text x="155" y="52" font-size="8" fill="var(--color-warning)">neckline</text>' +
                            '</svg>',
                            'Price tests resistance three times and fails each time. Stronger reversal signal than double top as it shows persistent supply. Neckline is the trigger.',
                            'Triple rejection at a level confirms strong resistance. UTCC should show weakening momentum on each test. Third failure with divergence is a high-probability short.',
                            'Entry: Break and close below neckline|Stop: Above highest peak + buffer|Target: Neckline to peak distance projected down',
                            'Strong uptrend where the level might eventually break. Peaks at widely different levels (not a true triple). No divergence on RSI across the three peaks.'
                        ) +
                        // --- BULLISH REVERSALS ---
                        this.patternCard('Bullish Double Bottom', 'reversal',
                            '<svg width="180" height="100" viewBox="0 0 180 100">' +
                                '<polyline points="10,20 30,40 50,75 70,45 90,75 110,45 130,30 160,15" fill="none" stroke="var(--color-pass)" stroke-width="2.5"/>' +
                                '<line x1="50" y1="75" x2="90" y2="75" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<line x1="20" y1="45" x2="140" y2="45" stroke="var(--color-warning)" stroke-width="1" stroke-dasharray="4"/>' +
                                '<text x="150" y="48" font-size="8" fill="var(--color-warning)">neckline</text>' +
                            '</svg>',
                            'Price hits support twice at roughly the same level and bounces both times. Neckline (resistance between the two troughs) is the trigger.',
                            'Confluence signal when UTCC shows building momentum at support. Second trough should show higher RSI (bullish divergence). Best on 4H+.',
                            'Entry: Break and close above neckline|Stop: Below the lower of the two troughs + buffer|Target: Trough to neckline distance projected upward',
                            'In a strong downtrend. Troughs too close together. No RSI divergence at second bottom.'
                        ) +
                        this.patternCard('Bullish Inverted Head &#x26; Shoulders', 'reversal',
                            '<svg width="180" height="100" viewBox="0 0 180 100">' +
                                '<polyline points="10,30 25,45 40,60 55,45 70,50 85,85 100,50 115,45 130,60 145,45 165,25" fill="none" stroke="var(--color-pass)" stroke-width="2.5"/>' +
                                '<line x1="30" y1="45" x2="150" y2="45" stroke="var(--color-warning)" stroke-width="1.5" stroke-dasharray="4"/>' +
                                '<text x="90" y="96" font-size="8" fill="var(--text-muted)" text-anchor="middle">L shoulder - Head - R shoulder</text>' +
                            '</svg>',
                            'Mirror of H&#x26;S: three troughs with the head as the lowest point. Neckline connects the highs between them. Classic bottoming pattern.',
                            'High-probability long when right shoulder forms above EMA support and UTCC momentum is building. RSI should show progressive bullish divergence.',
                            'Entry: Break above neckline with volume/momentum|Stop: Below right shoulder + buffer|Target: Head to neckline distance projected from break',
                            'Right shoulder lower than left. Neckline sloping steeply downward. Pattern forming in a strong downtrend with no sign of slowing.'
                        ) +
                        this.patternCard('Bullish Falling Wedge', 'reversal',
                            '<svg width="180" height="100" viewBox="0 0 180 100">' +
                                '<line x1="10" y1="20" x2="150" y2="75" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<line x1="10" y1="40" x2="150" y2="68" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<polyline points="15,30 35,45 50,35 70,55 85,48 105,65 120,58 140,72" fill="none" stroke="var(--color-pass)" stroke-width="2"/>' +
                                '<polyline points="140,72 155,50 170,20" fill="none" stroke="var(--color-pass)" stroke-width="2" stroke-dasharray="5"/>' +
                                '<text x="90" y="96" font-size="8" fill="var(--text-muted)" text-anchor="middle">Converging down = bullish</text>' +
                            '</svg>',
                            'Both highs and lows falling, but converging. Selling pressure is being absorbed. Breakout is typically to the upside as buyers accumulate.',
                            'Falling wedge at support with UTCC score building = strong long setup. Bullish divergence on RSI across the lows adds conviction.',
                            'Entry: Break above upper trendline|Stop: Below last swing low inside wedge|Target: Height of wedge at widest point from breakout',
                            'Wedge in same direction as strong trend. Fewer than 3 touches per boundary. Pattern too narrow for adequate R:R.'
                        ) +
                        this.patternCard('Bullish Expanding Triangle', 'reversal',
                            '<svg width="180" height="100" viewBox="0 0 180 100">' +
                                '<line x1="30" y1="60" x2="160" y2="90" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<line x1="30" y1="40" x2="160" y2="10" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<polyline points="35,50 55,58 65,42 85,65 100,35 120,75 140,28 155,80" fill="none" stroke="var(--color-pass)" stroke-width="2"/>' +
                                '<polyline points="155,80 165,45 175,15" fill="none" stroke="var(--color-pass)" stroke-width="2" stroke-dasharray="5"/>' +
                                '<text x="90" y="96" font-size="8" fill="var(--text-muted)" text-anchor="middle">Diverging boundaries = bullish break</text>' +
                            '</svg>',
                            'Boundaries widen with lower lows and higher highs. Bullish bias when the final swing fails to make a new low, showing demand stepping in.',
                            'Bullish when last low holds above prior low. UTCC building momentum on each bounce confirms accumulation. Best traded on the final higher low.',
                            'Entry: Break above upper expanding boundary after higher low|Stop: Below last low + buffer|Target: Width of triangle at widest point',
                            'Messy or unclear boundaries. During strong trending markets. Fewer than 3 swings. Final low makes a new extreme (pattern still forming).'
                        ) +
                        this.patternCard('Bullish Triple Bottom', 'reversal',
                            '<svg width="180" height="100" viewBox="0 0 180 100">' +
                                '<polyline points="10,25 25,45 40,75 55,45 70,75 85,45 105,75 120,45 140,30 165,15" fill="none" stroke="var(--color-pass)" stroke-width="2.5"/>' +
                                '<line x1="40" y1="75" x2="105" y2="75" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<line x1="20" y1="45" x2="145" y2="45" stroke="var(--color-warning)" stroke-width="1" stroke-dasharray="4"/>' +
                                '<text x="155" y="48" font-size="8" fill="var(--color-warning)">neckline</text>' +
                            '</svg>',
                            'Price tests support three times and holds each time. Stronger reversal signal than double bottom as it shows persistent demand at that level.',
                            'Triple bounce from a level confirms strong support. UTCC should show building momentum on each test. Third hold with divergence is a high-probability long.',
                            'Entry: Break and close above neckline|Stop: Below lowest trough + buffer|Target: Trough to neckline distance projected up',
                            'Strong downtrend where support might eventually break. Troughs at widely different levels. No bullish RSI divergence across the three troughs.'
                        ) +
                    '</div>' +
                '</div>' +
            '</div>';
        },

        // =====================================================
        // CHART PATTERNS - CONTINUATION (10 patterns)
        // =====================================================
        getContinuationPatterns: function() {
            return '<div class="accordion-item">' +
                '<button class="accordion-header" onclick="toggleAccordion(this)">' +
                    '<span>&#x1F4C8; Continuation Patterns (Multi-Candle Structure)</span>' +
                    '<span class="accordion-icon">&#x25BC;</span>' +
                '</button>' +
                '<div class="accordion-content">' +
                    '<div class="pattern-grid">' +
                        // --- BULLISH CONTINUATION ---
                        this.patternCard('Bullish Flag', 'continuation',
                            '<svg width="180" height="100" viewBox="0 0 180 100">' +
                                '<polyline points="10,85 40,30" fill="none" stroke="var(--color-pass)" stroke-width="3"/>' +
                                '<polyline points="40,30 55,40 65,35 80,45 90,38 105,48" fill="none" stroke="var(--color-warning)" stroke-width="2"/>' +
                                '<line x1="40" y1="30" x2="105" y2="42" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<line x1="40" y1="30" x2="105" y2="50" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<polyline points="105,48 125,25 160,10" fill="none" stroke="var(--color-pass)" stroke-width="2.5" stroke-dasharray="6"/>' +
                                '<text x="90" y="96" font-size="9" fill="var(--text-muted)" text-anchor="middle">Pole + flag + breakout</text>' +
                            '</svg>',
                            'Sharp move up (pole) followed by a shallow, downward-sloping consolidation (flag). The market is resting before continuing the trend.',
                            'Primary continuation playbook pattern. UTCC should remain ARMED during the flag. K-COMPRESSED during flag = ideal. ATR contracting during flag, expanding on break = textbook.',
                            'Entry: Break above upper flag boundary with momentum|Stop: Below flag low|Target: Pole length projected from breakout point',
                            'Flag retraces more than 50% of pole (not a flag, it\'s a reversal). Flag lasts longer than pole (momentum exhausted). No volume contraction during flag.'
                        ) +
                        this.patternCard('Bullish Pennant', 'continuation',
                            '<svg width="180" height="100" viewBox="0 0 180 100">' +
                                '<polyline points="10,85 40,25" fill="none" stroke="var(--color-pass)" stroke-width="3"/>' +
                                '<line x1="40" y1="25" x2="110" y2="42" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<line x1="40" y1="50" x2="110" y2="42" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<polyline points="45,30 55,45 65,32 78,43 88,36 100,41" fill="none" stroke="var(--color-warning)" stroke-width="2"/>' +
                                '<polyline points="100,41 125,22 155,10" fill="none" stroke="var(--color-pass)" stroke-width="2.5" stroke-dasharray="6"/>' +
                                '<text x="90" y="96" font-size="9" fill="var(--text-muted)" text-anchor="middle">Pole + pennant + breakout</text>' +
                            '</svg>',
                            'Sharp move up (pole) followed by converging trendlines forming a small symmetrical triangle (pennant). Tighter compression than a flag.',
                            'UTCC should hold ARMED through the pennant. Volatility compression during pennant (K-COMPRESSED) followed by expansion on breakout is ideal setup.',
                            'Entry: Break above upper pennant boundary|Stop: Below pennant low|Target: Pole length projected from breakout',
                            'Pennant retraces more than 38% of pole. Pennant lasts longer than pole. Breakout lacks momentum (false break risk high).'
                        ) +
                        this.patternCard('Bullish Falling Wedge (Continuation)', 'continuation',
                            '<svg width="180" height="100" viewBox="0 0 180 100">' +
                                '<polyline points="10,20 30,15" fill="none" stroke="var(--color-pass)" stroke-width="3"/>' +
                                '<line x1="30" y1="25" x2="120" y2="70" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<line x1="30" y1="15" x2="120" y2="55" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<polyline points="35,20 50,35 60,28 75,45 85,40 100,55 110,50 120,62" fill="none" stroke="var(--color-warning)" stroke-width="2"/>' +
                                '<polyline points="120,62 140,40 160,15" fill="none" stroke="var(--color-pass)" stroke-width="2.5" stroke-dasharray="6"/>' +
                                '<text x="90" y="96" font-size="9" fill="var(--text-muted)" text-anchor="middle">Pullback wedge in uptrend</text>' +
                            '</svg>',
                            'Within an uptrend, price pulls back in a falling wedge pattern. Unlike the reversal version, this forms as a correction within the existing trend direction.',
                            'UTCC maintains bullish bias on higher timeframes during the wedge. 4H still ARMED while 1H may weaken. ATR compression during wedge = building energy.',
                            'Entry: Break above upper wedge boundary|Stop: Below last swing low in wedge|Target: Wedge height projected from breakout + prior trend extension',
                            'Wedge breaks below key support (trend reversal, not continuation). UTCC flips bearish on 4H during the wedge. Too deep a pullback (more than 61.8% retrace).'
                        ) +
                        this.patternCard('Descending Triangle (Bearish)', 'continuation',
                            '<svg width="180" height="100" viewBox="0 0 180 100">' +
                                '<line x1="15" y1="75" x2="155" y2="75" stroke="var(--color-fail)" stroke-width="1.5" stroke-dasharray="4"/>' +
                                '<line x1="15" y1="20" x2="155" y2="65" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<polyline points="20,25 35,72 55,40 70,72 90,52 110,72 130,60 145,72" fill="none" stroke="var(--color-fail)" stroke-width="2"/>' +
                                '<polyline points="145,72 155,78 170,90" fill="none" stroke="var(--color-fail)" stroke-width="2" stroke-dasharray="5"/>' +
                                '<text x="90" y="96" font-size="8" fill="var(--text-muted)" text-anchor="middle">Flat support + lower highs</text>' +
                            '</svg>',
                            'Flat support with descending highs. Each rally is weaker, showing sellers gaining control. Typically breaks down through the flat support.',
                            'Bearish continuation when forming in a downtrend. UTCC scores declining on each bounce. Flat support tested repeatedly = weakening (eventual break).',
                            'Entry: Break and close below flat support|Stop: Above last lower high|Target: Triangle height projected from breakout',
                            'In an uptrend (could be accumulation, not distribution). Support level holding strongly with increasing volume on bounces. Fewer than 2 touches on each boundary.'
                        ) +
                        this.patternCard('Symmetrical Expanding Triangle (Bullish)', 'continuation',
                            '<svg width="180" height="100" viewBox="0 0 180 100">' +
                                '<line x1="30" y1="45" x2="150" y2="10" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<line x1="30" y1="55" x2="150" y2="90" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<polyline points="35,50 50,47 60,53 75,40 90,60 105,32 120,68 135,25" fill="none" stroke="var(--color-pass)" stroke-width="2"/>' +
                                '<polyline points="135,25 150,15 165,10" fill="none" stroke="var(--color-pass)" stroke-width="2" stroke-dasharray="5"/>' +
                                '<text x="90" y="96" font-size="8" fill="var(--text-muted)" text-anchor="middle">Expanding range + bullish break</text>' +
                            '</svg>',
                            'Range expands symmetrically with higher highs and lower lows. In a bullish context, the final swing breaks upward to continue the prior trend.',
                            'Bullish when prior trend was up and price breaks above the upper boundary. UTCC should confirm momentum on the breakout candle. Wider stops needed due to expanded range.',
                            'Entry: Break above upper boundary after a higher low|Stop: Below the last swing low|Target: Maximum width of triangle projected from break',
                            'No clear prior trend. Final swing makes a new low instead of higher low. Choppy price action without clean swings (noise, not pattern).'
                        ) +
                        // --- BEARISH CONTINUATION ---
                        this.patternCard('Bearish Flag', 'continuation',
                            '<svg width="180" height="100" viewBox="0 0 180 100">' +
                                '<polyline points="10,15 40,70" fill="none" stroke="var(--color-fail)" stroke-width="3"/>' +
                                '<polyline points="40,70 55,60 65,65 80,55 90,62 105,52" fill="none" stroke="var(--color-warning)" stroke-width="2"/>' +
                                '<line x1="40" y1="70" x2="105" y2="58" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<line x1="40" y1="70" x2="105" y2="50" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<polyline points="105,52 125,75 160,90" fill="none" stroke="var(--color-fail)" stroke-width="2.5" stroke-dasharray="6"/>' +
                                '<text x="90" y="96" font-size="9" fill="var(--text-muted)" text-anchor="middle">Drop + flag + breakdown</text>' +
                            '</svg>',
                            'Sharp move down (pole) followed by a shallow, upward-sloping consolidation (flag). Sellers are resting before continuing the downtrend.',
                            'Mirror of bull flag. UTCC should remain ARMED SHORT during the flag. K-COMPRESSED during flag followed by expansion on breakdown = textbook continuation.',
                            'Entry: Break below lower flag boundary with momentum|Stop: Above flag high|Target: Pole length projected from breakdown point',
                            'Flag retraces more than 50% of pole. Flag lasts longer than pole. Breakout upward through flag (reversal, not continuation).'
                        ) +
                        this.patternCard('Bearish Pennant', 'continuation',
                            '<svg width="180" height="100" viewBox="0 0 180 100">' +
                                '<polyline points="10,15 40,75" fill="none" stroke="var(--color-fail)" stroke-width="3"/>' +
                                '<line x1="40" y1="75" x2="110" y2="58" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<line x1="40" y1="50" x2="110" y2="58" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<polyline points="45,70 55,55 65,68 78,57 88,64 100,59" fill="none" stroke="var(--color-warning)" stroke-width="2"/>' +
                                '<polyline points="100,59 125,78 155,90" fill="none" stroke="var(--color-fail)" stroke-width="2.5" stroke-dasharray="6"/>' +
                                '<text x="90" y="96" font-size="9" fill="var(--text-muted)" text-anchor="middle">Drop + pennant + breakdown</text>' +
                            '</svg>',
                            'Sharp move down (pole) followed by converging trendlines forming a small symmetrical triangle (pennant). Mirror of bullish pennant.',
                            'UTCC should hold ARMED SHORT through the pennant. Volatility compression during pennant followed by expansion on breakdown confirms continuation.',
                            'Entry: Break below lower pennant boundary|Stop: Above pennant high|Target: Pole length projected from breakdown',
                            'Pennant retraces more than 38% of pole. Pennant lasts longer than pole. Breakout upward (false continuation - reversal forming).'
                        ) +
                        this.patternCard('Bearish Rising Wedge (Continuation)', 'continuation',
                            '<svg width="180" height="100" viewBox="0 0 180 100">' +
                                '<polyline points="10,80 30,85" fill="none" stroke="var(--color-fail)" stroke-width="3"/>' +
                                '<line x1="30" y1="75" x2="120" y2="30" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<line x1="30" y1="85" x2="120" y2="45" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<polyline points="35,80 50,65 60,72 75,55 85,60 100,45 110,50 120,38" fill="none" stroke="var(--color-warning)" stroke-width="2"/>' +
                                '<polyline points="120,38 140,60 160,85" fill="none" stroke="var(--color-fail)" stroke-width="2.5" stroke-dasharray="6"/>' +
                                '<text x="90" y="96" font-size="9" fill="var(--text-muted)" text-anchor="middle">Pullback wedge in downtrend</text>' +
                            '</svg>',
                            'Within a downtrend, price pulls back in a rising wedge pattern. This is a corrective rally that exhausts before the downtrend resumes.',
                            'UTCC maintains bearish bias on higher timeframes during the wedge. 4H still ARMED SHORT while 1H may temporarily turn bullish during the correction.',
                            'Entry: Break below lower wedge boundary|Stop: Above last swing high in wedge|Target: Wedge height projected from breakdown + prior trend extension',
                            'Wedge breaks above key resistance (trend reversal). UTCC flips bullish on 4H during the wedge. Pullback too deep (more than 61.8% retrace of prior leg).'
                        ) +
                        this.patternCard('Ascending Triangle (Bullish)', 'continuation',
                            '<svg width="180" height="100" viewBox="0 0 180 100">' +
                                '<line x1="15" y1="25" x2="155" y2="25" stroke="var(--color-pass)" stroke-width="1.5" stroke-dasharray="4"/>' +
                                '<line x1="15" y1="80" x2="155" y2="35" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<polyline points="20,75 35,28 55,60 70,28 90,48 110,28 130,40 145,28" fill="none" stroke="var(--color-pass)" stroke-width="2"/>' +
                                '<polyline points="145,28 155,22 170,10" fill="none" stroke="var(--color-pass)" stroke-width="2" stroke-dasharray="5"/>' +
                                '<text x="90" y="96" font-size="8" fill="var(--text-muted)" text-anchor="middle">Flat resistance + higher lows</text>' +
                            '</svg>',
                            'Flat resistance with ascending lows. Each dip is shallower, showing buyers gaining control. Typically breaks up through the flat resistance.',
                            'Bullish continuation when forming in an uptrend. UTCC scores increasing on each dip. Flat resistance tested repeatedly = weakening (eventual break).',
                            'Entry: Break and close above flat resistance|Stop: Below last higher low|Target: Triangle height projected from breakout',
                            'In a downtrend (could be distribution, not accumulation). Resistance holding with strong rejection candles. Fewer than 2 touches on each boundary.'
                        ) +
                        this.patternCard('Symmetrical Expanding Triangle (Bearish)', 'continuation',
                            '<svg width="180" height="100" viewBox="0 0 180 100">' +
                                '<line x1="30" y1="45" x2="150" y2="10" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<line x1="30" y1="55" x2="150" y2="90" stroke="var(--text-muted)" stroke-width="1" stroke-dasharray="3"/>' +
                                '<polyline points="35,50 50,53 60,47 75,60 90,40 105,68 120,32 135,75" fill="none" stroke="var(--color-fail)" stroke-width="2"/>' +
                                '<polyline points="135,75 150,85 165,90" fill="none" stroke="var(--color-fail)" stroke-width="2" stroke-dasharray="5"/>' +
                                '<text x="90" y="96" font-size="8" fill="var(--text-muted)" text-anchor="middle">Expanding range + bearish break</text>' +
                            '</svg>',
                            'Range expands symmetrically with higher highs and lower lows. In a bearish context, the final swing breaks downward to continue the prior downtrend.',
                            'Bearish when prior trend was down and price breaks below the lower boundary. UTCC should confirm bearish momentum on the breakdown candle.',
                            'Entry: Break below lower boundary after a lower high|Stop: Above the last swing high|Target: Maximum width of triangle projected from break',
                            'No clear prior trend. Final swing makes a new high instead of lower high. Choppy action without clean swings (noise, not pattern).'
                        ) +
                    '</div>' +
                '</div>' +
            '</div>';
        },

        // =====================================================
        // HELPER: Build a pattern card
        // =====================================================
        patternCard: function(name, type, svgHTML, whatItIs, utccUsage, entryStopTarget, whenToIgnore) {
            var typeLabel = type;
            if (type === 'neutral') typeLabel = 'Compression';

            var estLines = entryStopTarget.split('|');
            var estHTML = '';
            for (var i = 0; i < estLines.length; i++) {
                estHTML += '<li>' + estLines[i] + '</li>';
            }

            return '<div class="pattern-card">' +
                '<div class="pattern-card-header">' +
                    '<span class="pattern-card-name">' + name + '</span>' +
                    '<span class="pattern-card-type ' + type + '">' + typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1) + '</span>' +
                '</div>' +
                '<div class="pattern-diagram">' + svgHTML + '</div>' +
                '<div class="pattern-card-body">' +
                    '<h4>What It Is</h4>' +
                    '<p>' + whatItIs + '</p>' +
                    '<h4>UTCC Usage</h4>' +
                    '<p>' + utccUsage + '</p>' +
                    '<h4>Entry / Stop / Target</h4>' +
                    '<ul>' + estHTML + '</ul>' +
                    '<div class="pattern-ignore">' +
                        '<div class="pattern-ignore-title">When to Ignore</div>' +
                        '<p>' + whenToIgnore + '</p>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }
    };

    // Expose globally and auto-init on DOM ready
    window.ReferenceTab = ReferenceTab;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { ReferenceTab.init(); });
    } else {
        ReferenceTab.init();
    }

})();
