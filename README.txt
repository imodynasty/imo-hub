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
