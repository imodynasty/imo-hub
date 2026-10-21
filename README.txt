V4.0.30 — MOBILE HEAD TO HEAD LAYOUT
- Replaced the conflicting mobile team grid with independent vertical stacks for avatar, full name, current score, odds, projection and form.
- Removed inherited projection offsets that pushed badges into the opposing team and avatars into odds.
- Full team names wrap on phones rather than truncating to a few letters.
- Stack market-line and rivalry labels above their values; compact matchup rows and key-player names wrap safely.
- Applies at widths up to 700px; desktop layout and all scoring/odds calculations are unchanged.

V4.0.29 — SIMPLIFIED FILTERS AND CROSS-SEASON RECENT GAMES
- Removed Improvement vs Season, including result column and sort option.
- All empty lower/upper bounds are unrestricted. A lone max age 31 means <=31; a lone min FPTS 20 means >=20.
- Added an IMO season selector for Season FPTS/G, defaulting to the current season.
- If the current season has no averages or scored weeks yet, an explicitly labelled previous-season preseason baseline is used. Choosing a historical season uses that season's own averages.
- Recent windows always mean latest individual NBA games through the current season, filling from earlier IMO seasons as needed and scoring each game with its season's IMO rules.
- Removed the chemistry checkbox and timeframe selector. Chemistry % is now a normal optional range, always all-time with the current manager.
- No ownership/minimum-games filters. Missing data is not zero. F includes SF/PF. Short available windows show the real game count.
- Compact field groups embed season/recent selectors beside their ranges; three result metrics replace four.

V4.0.28 — RESTORE HEAD TO HEAD FALLBACK PRICES
- Fixed missing markets caused by ambiguous pregame zero-point starter placeholders.
- Prefer reconciled scored points plus remaining-starter projections; otherwise keep a clearly labelled estimated market from starter projections, season averages or recent team form.
- Same-week last-good player projections survive transient feed failures; old-week projections never carry into a new week.
- Removed the Updated timestamp and Refresh / Retry toolbar.
- All prior player-filter and record-card updates retained.

V4.0.27 — SEARCH PLAYER FILTERS
- Added a collapsible Player Filters panel inside existing Search; normal entity search is unchanged.
- Optional position, season average, recent 3/5/10/20-game average, improvement and age ranges; all blank bounds are unrestricted and entered bounds are inclusive.
- Optional current-manager chemistry with All-time / This season scope. Numeric chemistry ranges require three starts; no ownership or games-played filters.
- Current-season per-game averages use IMO scoring and individual played NBA game logs, not weekly selected scores or preseason fallback.
- Short recent windows show their actual games count; unknown data stays blank and cannot satisfy numeric criteria.
- Mobile card results open existing player profiles, with sorting, 20-at-a-time pagination, progress and cancellation.

V4.0.26 — WINNING MARGIN AND SELECTED PLAYER RECORDS
- Replaced Most Trades in a Day with Biggest Winning Margin using completed selected-game team scores.
- Preserved existing unfiltered public player-score records (all time and current season).
- Added Highest Selected Player Score Ever and This Season, with the manager who selected the score.
- Selected records require an exact starter game ID and recalculate the game using that season's league scoring.
- Missing historical logs are checked in the background when League Records enters view; partial verification is labelled explicitly, never treated as an exhaustive record.
- Expanded to ten cards with responsive layouts. Refresh / Retry reattempts selected record verification.

V4.0.25 — TEAM SCORE RECORD SOURCE CORRECTION
- Historical team-score records now prefer the same selected-game matchup archive used by Rivalries, rather than raw public weekly totals.
- Tommy's 2024 Week 20 archive score is 316.50, not the raw public 373.0.
- Team records exclude active weeks, zero placeholders and bye rows. Team score labels use two decimal places.
- Player record zero placeholders are excluded. Individual historical player records still require a separate selected-game source audit.
- Most Trades in a Day remains pending the user's replacement choice.

V4.0.24 — REMAINING-STARTER ODDS AND RELIABILITY
- Projected finish = published team total + projected fantasy points for remaining starters, using league scoring and season-average fallback.
- Bench scores never count as completed starters. Starter scores must reconcile with the team total.
- Ambiguous zero-point placeholders, missing projections and mismatched totals pause odds instead of inventing certainty. Live team scores stay visible.
- Added a per-team scored-starters and projected-remaining breakdown when verified.
- 15-second JSON request timeouts; 12-second projection request timeouts; Refresh / Retry control and last successful live update time.
- Re-fetch current rosters every minute and current-season metrics every five minutes while visible.
- On gameweek rollover, reload the current season so newly completed results enter ranking models without a page reload.
- Re-render markets after deferred statistics arrive. Profile cache checks include score/metric changes and expire after 60 seconds.
- Open profiles refresh from fresh data; matchup ordering and expanded rows remain stable during polling.
- Generic render failures for core sections show an actionable retry message.
- Validated using simulated payloads and JavaScript checks; a real in-season Sleeper feed and visual browser interaction remain to be verified.

V4.0.23 — LIVE SCOREBOARD AND CROSS-SEASON FORM
- Head to Head now appears above Trade of the Week.
- Live weekly team scores are prominent on the featured and collapsed matchup cards; odds and available projections remain separate.
- Last-five and last-three scoring averages carry completed gameweeks across season boundaries by franchise roster ID.
- After 2026/27 Week 1: last five = one current-season week plus four prior-season weeks; last three = one plus two.
- Active-week scores remain excluded from ranking/odds/Pooperbowl results; current roster strength remains responsive.
- Existing early-season championship odds preseason blend is retained.

V4.0.22 — COMPLETED-WEEK RANKINGS WITH LIVE ROSTER STRENGTH
- Power Rankings, championship odds, Pooperbowl Watch and ranking trend weeks exclude the active fantasy week.
- A week enters these models when Sleeper advances its NBA week; a complete league includes all scored weeks.
- If the current season/week cannot be verified, current-season results are withheld rather than treating an unfinished week as final.
- Current roster changes and current-season player averages still affect team-strength inputs midweek; Head to Head stays live.
- Current-season standings and result-based form now use completed gameweeks rather than provisional leaders.
- New cache keys discard previously rendered partial-week ranking markets.

V4.0.21 — HEAD TO HEAD REPAIR
- Renamed the Head to Head rivalry helper to avoid overwriting the Rivalries report helper.
- Started the existing 60-second Head to Head refresh timer at startup.
- Live league, sport state and weekly matchup requests now bypass in-memory and HTTP caches.
- Updated asset version URLs and footer to 4.0.21.

V4.0.20 — 2026/27 SEASON ROLLOVER
- Manager Profile > Roster now defaults to the configured live season and shows the three most recent seasons as 2026/27, 2025/26 and 2024/25.
- Player profiles now prioritise current-season FPTS/G, MPG and FPTS/36 as soon as NBA game data is available, with an automatic previous-season fallback during preseason.
- Team Chemistry, MIP, player form, ticker, player spotlight, manager insights and per-minute metrics now resolve season labels and fallbacks dynamically instead of relying on hard-coded 2025/26 values.
- Refreshed the Hub snapshot cache key so visitors receive newly loaded season data rather than an old saved view.
- The existing configured Sleeper current league remains the source for live rosters, standings, trades, H2H, rankings, records and the live 19–0 player pool.

V4.0.19 — 19–0 HISTORY REFINEMENT
- Renamed the compact panel to “YOUR 19–0 HISTORY”, removed its reset control, and simplified the challenge introduction.

V4.0.18 — 19–0 LOCAL HALL OF FAME
- Added a compact browser-local Hall panel to the challenge screen: completed runs, best record, highest FPTS/G and best starting five. Resetting runs retains personal bests.

V4.0.17 — 19–0 LIVE SEASON CHASE
- The active IMO season now joins the player-season pool as it unfolds. New 2026/27 player-seasons appear automatically on a fresh challenge run once they reach 10 NBA games and exceed 17.50 FPTS/G under current IMO scoring.

V4.0.16 — 19–0 ELIGIBILITY + LOWER-END SCALE UPDATE
- Expanded the pool to all player-seasons above 17.50 FPTS/G, while retaining the 10-game minimum and fully random draws.
- Updated the lower end: 19.00–19.99 = 7–12; 18.50–18.99 = 6–13; under 18.50 = 1–18.

V4.0.15 — 19–0 LOWER-END SCALE UPDATE
- Updated the lower end: 19.00–19.99 = 7–12; under 19.00 = 1–18.

V4.0.14 — 19–0 TOP-END SCALE UPDATE
- Updated the top end: 31.50+ = 19–0 and 29.00–31.49 = 18–1.

V4.0.13 — 19–0 TOP-END SCALE + FULL POOL AUDIT
- Updated the top end: 31.00+ = 19–0 and 29.00–30.99 = 18–1.
- Confirmed each completed season uses the full Sleeper bulk-stat response (1,841 rows in the 2025 audit) before applying the 10-game / 18 FPTS/G qualification. Draws remain fully random on every restart.

V4.0.12 — 19–0 USER-CALIBRATED WIN SCALE
- Updated records to the agreed scale: 32.00+ = 19–0; 29.00–31.99 = 18–1; 28.00–28.99 = 17–2; then descending through 19.50–19.99 = 7–12; under 19.50 = 1–18.

V4.0.11 — 19–0 RESULT SHARING + RECORD CALIBRATION
- The result action now opens the native device share sheet with the generated PNG attached. Messenger appears as a destination when installed and supported by the device; Download PNG remains available alongside it.
- Recalibrated the win curve: the submitted 144.97 FPTS five / 28.99 FPTS per player returns 17–2 and TITLE FAVOURITE.

V4.0.10 — 19–0 POSITION-SAFE DRAWS
- Player choices now filter against every remaining open roster slot. A final open C slot can only receive C-eligible players, eliminating dead-end selections.
- Added a small Restart control at the bottom of the challenge, plus a matching Restart button after the result reveal.
- Final screen and PNG now list the five players in locked roster order: G, F, C, UTIL, UTIL.

V4.0.9 — 19–0 RESULT REVEAL POLISH
- Final reveal now uses image-led player rows matching the PNG share card, including assigned slot, season, team, eligibility and individual FPTS/G.
- Draft-card initials now disappear whenever a real Sleeper headshot loads; a dark IMO fallback remains only when it does not.
- Removed technical eligibility and canvas-dimension copy from the public reveal/export.

V4.0.8 — 19–0 CHALLENGE
- Added a new League menu destination: 19–0 Challenge.
- Draft five player-seasons from 24/25 and 25/26 using Sleeper / IMO scoring only.
- Eligible pool requires 10+ NBA games and 18+ FPTS/G; future completed seasons are added automatically.
- Every draw offers three players, with no rerolls. Player-seasons that were not chosen cannot return; drafting a player removes every other season of that player.
- Assign each draft pick to a permanent G / F / C / UTIL / UTIL Starting Five slot.
- FPTS/G remains hidden until the five-player reveal, which produces a record, title tier and 1080 × 1350 PNG share card.
- Progress is stored locally on the device, so a challenge can be resumed after closing the Hub.

V3.5.3 — TEAM CHEMISTRY ALL-TIME FIX
- All-Time chemistry now rebuilds from loaded historical seasons.
- Historical selected-game scoring falls back to Sleeper starters_points when players_points is unavailable.
- More robust historical NBA game-week date mapping.
- 2026 This Season remains empty until completed lineup selections exist.

IMO Dynasty V3.3.68

Reverted to the V3.3.63 speed baseline. The only functional addition is persistent local manager-profile HTML caching across browser sessions. Power Rankings, Championship Odds, ticker and existing performance behaviour remain on the V3.3.63 baseline.

IMO DYNASTY V3.3.62 — VERIFIED MARKETS + LITE RENDERING

Power Rankings and Championship Odds:
- Power Rankings and Championship Odds no longer calculate from incomplete startup data.
- Repeat visits show the last fully verified rankings and odds while live data refreshes.
- A first visit shows a neutral manager shortcut panel rather than incorrect temporary ranks or prices.
- Odds movement snapshots are written only after all required ranking inputs are available.
- The previous temporary odds-movement cache has been reset so incomplete startup prices cannot create false movement.
- Only the prior season's exact averages are loaded first because that is all the offseason market model requires.
- Other season totals continue later while the browser is idle.

Performance:
- All decorative animations and transitions are disabled in lite mode.
- Noise, backdrop blur, pulsing indicators, ranking glows and other GPU-heavy effects are removed.
- Large modal sheets no longer use persistent will-change layers.
- Manager profiles and the rest of the homepage remain interactive while the verified market model loads.
- The V3.3.61 staged history loading, lazy lower-page rendering, IndexedDB snapshot and three-team trade layout remain in place.

Deployment:
Upload all files and folders at the root of this ZIP to the existing GitHub Pages repository.


V3.3.67: Added Manager Profile > Front Office net seasonal trade ledger with season selector. Trades only; round-trip assets cancel out; players show current FPTS/G and age; picks show original-team asset labels.

V3.3.68: Net Trade Ledger now removes a player from TRADED IN when that manager releases the player to free agency/waivers later in the same season they acquired them by trade.

V3.3.75: manager profiles prioritised; current + previous season load before older archive; persistent per-tab manager cache.

V3.3.76: all manager profile sections begin loading immediately on profile open; persistent per-tab cache retained; older archive remains lower priority.

V3.3.77: Manager Profile performance priority update.
- Removed Draft Star and Best Waiver Find from Front Office entirely.
- Overview renders independently without building Roster, Front Office or History.
- Front Office preloads after Overview, then Roster preloads after Front Office.
- History and deep H2H analytics are built only when the History tab is explicitly opened.
- Front Office no longer hydrates acquisition game logs for removed highlight features.
- Persistent per-tab manager caching retained with a new cache version.

V3.5.2 — TEAM CHEMISTRY
- Replaced Manager Profile > Roster > All-NBA Eligible Players with Team Chemistry.
- Ranks only players who are still on the current roster and have been started by that manager in the selected timeframe.
- Chemistry % = total selected-game FPTS captured / total best-available weekly FPTS.
- Statuses: IN SYNC (90%+), GOOD CHEMISTRY (75-<90%), OUT OF SYNC (60-<75%), CULTURE PROBLEM (<60%); fewer than 3 starts = NEW CONNECTION.
- Shows Chemistry %, starts and Perfect Picks; FPTS Left is intentionally not displayed.
- Includes This Season / All-Time toggle. All-Time is lazy-loaded to avoid slowing normal profile opens.


V3.5.9 — TEAM CHEMISTRY SLEEPER WEEKLY GAME LOG FIX
- Team Chemistry historical NBA game hydration now uses Sleeper grouping=week.
- Flattens the individual NBA game rows nested inside each Sleeper fantasy-week bucket.
- Preserves the fantasy week on each game row for exact selected-vs-best weekly comparisons.
- Removes the ESPN fallback introduced in V3.5.7; Chemistry is Sleeper-only again.
- Corrects the diagnostic label: the Week 5 35.50 score probe is no longer incorrectly labelled as Luka.
- Manager mapping remains based on stable Sleeper user_id / owner_id.
- All-Time still includes only players on the manager's current roster and aggregates captured/best totals across historical ownership starts.


V3.5.10 — TEAM CHEMISTRY STARTER FILTER FIX
- Chemistry starts now come only from Sleeper matchup `starters`.
- `players_points` is used only to retrieve the selected score for an actual starter.
- Bench/rostered players can no longer be counted as Chemistry starts.
- Historical diagnostic starter counts now use the same strict starter rule.


V3.5.11 — CHEMISTRY OWNERSHIP + OVERVIEW
- Chemistry starts are now credited only when the player was owned by that exact manager/team in that fantasy week.
- Historical ownership is reconstructed by reversing Sleeper transactions from the season-final roster, preventing recently acquired players from inheriting pre-acquisition starts.
- Current-roster eligibility remains in place for the displayed Chemistry leaderboard.
- All-Time is now the default Team Chemistry view.
- Secondary Chemistry toggle is labelled 2026.
- Added the team's aggregate All-Time Chemistry % to Manager Profile > Overview beside Team Average Age.
- Chemistry remains 100% Sleeper-sourced.


V3.5.12 — ROSTER + CHEMISTRY UI
- Removed All-Time Chemistry from Overview.
- Team Chemistry now sits directly beneath Roster in the Roster tab.
- Roster shows top 5 by default with expandable remainder.
- Chemistry shows top 5 by default with expandable remainder.
- Chemistry thresholds: 90+ In Sync; 80-<90 Good Chemistry; 75-<80 Mixed Bag; 65-<75 Out of Sync; under 65 Culture Problem; fewer than 3 starts New Connection.
- All-Time remains the default Chemistry view, with 2026 secondary.


V3.5.13 — IMO RIVALRIES
- Added compact two-manager Rivalries selector to the League menu.
- All-time series record, H2H FPTS, last five, margins, streak and playoff record.
- Sleeper-only Rivalry MVP: total FPTS, average per matchup and best weekly score.
- H2H-only Team Chemistry using actual historical starters.
- Deterministic generated rivalry facts from Sleeper matchup history.
- 0–100 Rivalry Score based on meetings, series balance, margins, close games and playoffs.
- Expandable archive of every completed meeting.


V3.5.16 — RIVALRY SCORE REBALANCE
- Meetings: 20 pts, max at 4 meetings.
- Series balance: 10 pts.
- Average scoring margin: 25 pts, declining linearly to zero at 50 FPTS.
- Close games under 10 FPTS: 10 pts, proportional to share of meetings.
- Playoff history: 5 pts per playoff meeting, max 20.
- Recent Heat: 15 pts based on balance across the last four decided H2H meetings.
- Grand Final bonus: +10 if the managers have ever met in an IMO Grand Final.
- Final Rivalry Score remains capped at 100.


V3.5.16 — RIVALRIES COPY CLEANUP
- Removed public-facing “MIN 2 MATCHUPS” explanatory copy from Rivalry MVP.
- Removed “tap a result” prompt from Last 5 while retaining clickable result buttons.
- Removed public Rivalry Score formula breakdown.
- Rivalry calculations and functionality are unchanged.


V3.5.17 — RIVALRY SCORE UPDATE
- Series Balance: 20 points; even series = 20, declining linearly to 0 at a 5+ win gap.
- Scoring Margin: 40 points; 0 average margin = 40, declining linearly to 0 at 50+ FPTS.
- Close Games: 10 points proportional to meetings decided by fewer than 10 FPTS.
- Playoff History: 5 points per playoff meeting, max 10.
- Recent Heat: 20 points based on competitiveness of the last four H2H meetings.
- Grand Final: +10 bonus if the managers have ever met in an IMO Grand Final.
- Final Rivalry Score remains capped at 100.
- Removed the prior Meetings component from the score.


V3.5.18 — RIVALRY MVP PLAYER IMAGE
- Rivalry MVP now always reserves a prominent player portrait beside the MVP label.
- Uses the Sleeper NBA player portrait with eager loading for reliable on-page and PNG-export rendering.
- Adds an initials portrait fallback if the Sleeper image is unavailable.


V3.5.20 — RIVALRIES RESPONSIVE POLISH
- Rivalry download control is now icon-only.
- Refined desktop and mobile spacing/alignment across Rivalries.
- Added narrow-screen safeguards for manager names, stat cards, MVP metrics and meeting rows.

V3.5.20 — RIVALRY FACTS UPGRADE
- Rivalry Facts now rank a larger pool of data-driven notes by significance and show a maximum of five.
- Facts identify the relevant manager/team wherever applicable.
- Close-game facts now use a <20 FPTS threshold; low-close-rate rivalries instead surface 20+ FPTS decisions with a different emoji.
- Added season sweeps, Grand Final winner context, playoff leader, recent dominance, series state, scoring records, Chemistry edge, and qualifying Rivalry MVP notes.


V3.5.21 — RIVALRIES EXPORT + INTERACTION POLISH
- Rivalry Score close-game component now uses meetings decided by fewer than 20 FPTS.
- Rivalry MVP uses the same Sleeper player portrait source as player profiles.
- Rivalry manager avatars eager-load before PNG capture to improve export reliability.
- Mobile export uses the native share sheet when file sharing is supported, allowing Save Image / Photos workflows; desktop keeps direct PNG download.
- Last-5 W/L buttons and modal close button are precisely centered.
- Manager names under All-Time Series now open their Manager Profiles.

V3.5.23 — Rivalries portrait export fix: Rivalries now uses the same direct Sleeper manager/player images as the rest of the Hub on-screen, removes crossOrigin attributes that could block live portraits, and temporarily uses a CORS-safe image proxy only during html2canvas PNG capture so portraits are embedded in exports.

V3.5.26: Rivalry manager/player portrait rendering fixes across desktop/mobile and updated Rivalry Score weights (30 balance, 50 margin, 10 close games <20, 10 playoffs, 20 recent heat, +10 Grand Final; capped 100).

V3.5.26: Rivalries now follows Sleeper previous_league_id renewal history, builds one strict two-roster canonical matchup ledger, and reuses the exact ledger rows/scores for every rivalry-derived stat. Cache key bumped to discard stale historical bundles.


V3.5.27: Rivalry historical identity fix. Historical matchup scores remain Sleeper's stored final points, while roster_id is now treated as the franchise lineage across renewed leagues. This prevents a manager replacement/current owner mapping from reassigning old games to the wrong rivalry. Manager Profile H2H and franchise scoring highs now reuse the same lineage logic.

V3.5.28: Rivalry historical franchise identity correction. Historical roster_id values are no longer assumed to represent the same franchise across renewed Sleeper leagues. Each historical matchup row now resolves through that season's stored team identity, maps exact franchise names to the current IMO franchise, and supports explicit franchise rename continuity (PritchPlease -> Mara Juana). Sleeper's stored matchup points remain untouched. The Hub cache key was bumped so older mis-attributed history cannot persist after deployment. Grand Final mapping now uses the same historical franchise resolver.
