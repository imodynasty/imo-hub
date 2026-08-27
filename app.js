/* IMO DYNASTY V3.3.80 — Immediate Ticker Motion */
const CONFIG={currentLeagueId:"1341763186407276544",leagueIds:["1341763186407276544","1212553673821929472","1138349648558624768"],api:"https://api.sleeper.app/v1",statsApi:"https://api.sleeper.com/stats/nba/player",bulkStatsApi:"https://api.sleeper.com/stats/nba",roundsToCheck:60,bookmakerMargin:1.08,h2hHouseMargin:1.05,oddsBaseline:.25,oddsExponent:2,maxDisplayedOdds:51,voteEndpoint:"",votingOpens:"2027-02-23T00:00:00+08:00",votingCloses:"2027-03-01T00:00:00+08:00",awardsAnnounced:"2027-03-01T12:00:00+08:00"};

// Completed-draft column ownership is the source of truth for converting a
// traded historical pick into the player it became. Sleeper's drafter/current
// owner fields are deliberately ignored for these overrides.
const CANONICAL_DRAFT_COLUMNS={
  "2026":{
    "thehouseofpatience":1,
    "marajuana":2,
    "chetanyahu":3,
    "flintlovesmesexy":4,
    "sengooning":5,
    "muzandmuzptyltd":6,
    "melbournelongnecks":7,
    "thanos":8
  }
};
function normaliseTeamKey(name){return String(name||"").toLowerCase().replace(/[^a-z0-9]/g,"")}
function canonicalDraftSlot(season,teamName){return CANONICAL_DRAFT_COLUMNS[String(season)]?.[normaliseTeamKey(teamName)]??null}

const state={jsonRequestCache:new Map(),globalSearchIndex:null,league:null,currentUsers:[],currentRosters:[],managers:new Map(),trades:[],selectedWindow:"14",players:{},bundles:[],modelBundle:null,playerAverages:{},previousPowerRanks:{},heatmapExpanded:false,draftPickMap:{},previousPlayerAverages:{},votePlayers:[],activeWindow:"14",biggestTradesExpanded:false,profileAverageSeason:"2025",exactSeasonAverages:{},gameLogAverages:{},gameLogMeta:{},seasonTotalAverages:{},seasonTotalMeta:{},gameLogs:{},playerInterest:[],profileHTMLCache:new Map(),profilePrewarmQueued:false,profileBuilds:new Map(),statsRequestCache:new Map(),seasonTotalsLoading:false,draftSelections:[],allDraftSelections:[],oddsMovement:null,sportState:null,h2hRefreshTimer:null,h2hRefreshBusy:false,fullPlayerDirectoryLoaded:false,fullPlayerDirectoryPromise:null,gameLogFeaturesPromise:null,lazyHomepageModules:new Map(),lazyHomepageObserver:null,historyReady:false,profilePriorityReady:false,profilePriorityPromise:null,olderHistoryPromise:null,snapshotApplied:false,marketReady:false,verifiedMarketHTML:null,verifiedMarketSavedAt:0,renderGeneration:0,renderQueue:new Set(),renderQueueScheduled:false,renderStats:{flushes:0,modules:0},computedCache:{seasonAverages:new Map(),managerTrades:new Map(),tradeSide:new Map(),completedMatchups:new Map(),tendencyLeague:null,managerGrades:null}};
const $=id=>document.getElementById(id),WL={"14":"14 days","28":"28 days","season":"2026 season","all":"All time"};
try{for(let i=sessionStorage.length-1;i>=0;i--){const key=sessionStorage.key(i);if(key&&key.startsWith('imo-profile-'))sessionStorage.removeItem(key)}}catch(_){ }
function resetComputedCaches(){state.computedCache.seasonAverages.clear();state.computedCache.managerTrades.clear();state.computedCache.tradeSide.clear();state.computedCache.completedMatchups.clear();state.computedCache.tendencyLeague=null;state.computedCache.managerGrades=null;state.profileHTMLCache.clear()}
function resetModelCaches(){state.computedCache.seasonAverages.clear();state.computedCache.managerGrades=null;state.profileHTMLCache.clear()}
async function getJSON(url,optional=false){
  const key=String(url);
  if(state.jsonRequestCache.has(key))return state.jsonRequestCache.get(key);
  const request=(async()=>{try{const r=await fetch(key,{cache:"default"});if(!r.ok)throw new Error(r.status);return await r.json()}catch(e){state.jsonRequestCache.delete(key);if(optional)return null;throw e}})();
  state.jsonRequestCache.set(key,request);
  return request;
}
async function statsJSON(url){if(state.statsRequestCache.has(url))return state.statsRequestCache.get(url);const request=getJSON(url,true).finally(()=>{});state.statsRequestCache.set(url,request);return request}

// IndexedDB keeps the last complete league snapshot on-device. Repeat visits can
// paint real manager, player and trade data immediately while Sleeper refreshes
// quietly in the background. Failure is intentionally silent.
const HUB_CACHE_DB='imo-dynasty-cache-v1',HUB_CACHE_STORE='snapshots',HUB_CACHE_KEY='hub-v3361',VERIFIED_MARKET_CACHE_KEY='imoVerifiedPowerMarketV1';
function openHubCache(){return new Promise(resolve=>{if(!('indexedDB' in window)){resolve(null);return}let request;try{request=indexedDB.open(HUB_CACHE_DB,1)}catch(_){resolve(null);return}request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(HUB_CACHE_STORE))db.createObjectStore(HUB_CACHE_STORE)};request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null)})}
async function hubCacheRead(){const db=await openHubCache();if(!db)return null;return new Promise(resolve=>{try{const tx=db.transaction(HUB_CACHE_STORE,'readonly'),req=tx.objectStore(HUB_CACHE_STORE).get(HUB_CACHE_KEY);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>resolve(null);tx.oncomplete=()=>db.close()}catch(_){db.close();resolve(null)}})}
async function hubCacheWrite(snapshot){const db=await openHubCache();if(!db)return;return new Promise(resolve=>{try{const tx=db.transaction(HUB_CACHE_STORE,'readwrite');tx.objectStore(HUB_CACHE_STORE).put(snapshot,HUB_CACHE_KEY);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();resolve()}}catch(_){db.close();resolve()}})}
function hubSnapshot(){return{savedAt:Date.now(),players:state.players,bundles:state.bundles,sportState:state.sportState,seasonTotalAverages:state.seasonTotalAverages,seasonTotalMeta:state.seasonTotalMeta}}
function scheduleHubCacheWrite(){const snapshot=hubSnapshot(),write=()=>hubCacheWrite(snapshot).catch(()=>{});if('requestIdleCallback' in window)requestIdleCallback(write,{timeout:10000});else setTimeout(write,2500)}
function rebuildStateFromBundles(){
  const cur=state.bundles.find(x=>String(x?.league?.league_id)===String(CONFIG.currentLeagueId))||state.bundles[0];
  if(!cur)return false;
  state.league=cur.league;state.currentUsers=cur.users||[];state.currentRosters=cur.rosters||[];
  state.draftPickMap=Object.assign({},...state.bundles.map(b=>b?.draftPickMap||{}));
  state.draftSelections=state.bundles.flatMap(b=>b?.draftSelections||[]);
  state.allDraftSelections=state.bundles.flatMap(b=>b?.allDraftSelections||[]);
  buildManagers();
  const unique=new Map();
  state.bundles.flatMap(x=>safeArray(x?.trades)).filter(Boolean).forEach(raw=>{const t={...raw,adds:safeObject(raw?.adds),drops:safeObject(raw?.drops),draft_picks:safeArray(raw?.draft_picks),manager_ids:safeArray(raw?.manager_ids),roster_ids:safeArray(raw?.roster_ids),roster_owner_map:safeObject(raw?.roster_owner_map),manager_name_map:safeObject(raw?.manager_name_map)};unique.set(t.transaction_id||`${t.league_id||'league'}-${t.created||0}`,t)});
  state.trades=[...unique.values()].sort((a,b)=>(Number(b?.created)||0)-(Number(a?.created)||0));
  resetComputedCaches();prepareModels();state.globalSearchIndex=null;
  state.marketReady=verifiedMarketInputsReady();
  if(state.marketReady)prepareOddsMovement();
  return true
}
function applyHubSnapshot(snapshot){
  if(!snapshot||!Array.isArray(snapshot.bundles)||!snapshot.bundles.length)return false;
  state.players=snapshot.players||{};state.bundles=snapshot.bundles;state.sportState=snapshot.sportState||null;
  state.seasonTotalAverages=snapshot.seasonTotalAverages||{};state.seasonTotalMeta=snapshot.seasonTotalMeta||{};
  state.historyReady=true;state.profilePriorityReady=true;state.profilePriorityPromise=Promise.resolve(true);
  if(!rebuildStateFromBundles())return false;
  state.snapshotApplied=true;document.documentElement.classList.add('imo-interactive');instantManagerShell();requestAnimationFrame(()=>renderAll());return true
}
async function limitedMap(items,limit,fn){const out=new Array(items.length);let n=0;async function run(){while(n<items.length){const i=n++;try{out[i]=await fn(items[i])}catch{out[i]=null}}}await Promise.all(Array.from({length:limit},run));return out}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}
function fmt(ts,short=false){return ts?new Intl.DateTimeFormat("en-AU",short?{day:"numeric",month:"short"}:{day:"numeric",month:"short",year:"numeric"}).format(new Date(ts)):"Unknown"}
function sleeperAvatarUrl(value){const avatar=String(value||'').trim();if(!avatar)return null;return /^https?:\/\//i.test(avatar)?avatar:`https://sleepercdn.com/avatars/${avatar}`}
function buildManagers(){const users=Object.fromEntries(state.currentUsers.map(x=>[String(x.user_id),x]));state.managers.clear();state.currentRosters.forEach(r=>{const u=users[String(r.owner_id)]||{},name=u.metadata?.team_name||u.display_name||`Team ${r.roster_id}`,profileAvatar=u.avatar||u.metadata?.avatar||u.metadata?.team_avatar,avatar=sleeperAvatarUrl(profileAvatar);state.managers.set(String(r.owner_id),{id:String(r.owner_id),name,roster:r,avatar,initials:name.split(/\s+/).slice(0,2).map(z=>z[0]).join("").toUpperCase()})})}
function managerName(id,t=null){return state.managers.get(String(id))?.name||t?.manager_name_map?.[String(id)]||"Former manager"}
function safeObject(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
function safeArray(value){return Array.isArray(value)?value:[]}
function normaliseTrade(raw){
  const t=safeObject(raw),adds=safeObject(t.adds),drops=safeObject(t.drops),draftPicks=safeArray(t.draft_picks),rosterIds=safeArray(t.roster_ids),ownerMap=safeObject(t.roster_owner_map),nameMap=safeObject(t.manager_name_map);
  const inferredRosterIds=[...rosterIds,Object.values(adds),Object.values(drops),...draftPicks.flatMap(p=>[p?.owner_id,p?.previous_owner_id])].filter(v=>v!=null).map(String);
  const explicitManagers=safeArray(t.manager_ids).filter(v=>v!=null).map(String);
  const inferredManagers=inferredRosterIds.map(rid=>ownerMap[rid]).filter(v=>v!=null).map(String);
  return {...t,adds,drops,draft_picks:draftPicks,roster_ids:rosterIds,roster_owner_map:ownerMap,manager_name_map:nameMap,manager_ids:[...new Set([...explicitManagers,...inferredManagers])]};
}
function mids(raw){const t=normaliseTrade(raw);return [...new Set(safeArray(t.manager_ids).map(String))].filter(id=>state.managers.has(id)||Object.prototype.hasOwnProperty.call(t.manager_name_map,id))}
function tradesFor(w){if(w==="season")return currentSeasonTrades();return w==="all"?state.trades:state.trades.filter(t=>(t.created||0)>=Date.now()-Number(w)*864e5)}
function currentSeasonTrades(){const current=state.bundles.find(b=>String(b.league.league_id)===CONFIG.currentLeagueId);return current?.trades||[]}
function activeTradesFor(w){if(w==="season")return currentSeasonTrades();return w==="all"?state.trades:state.trades.filter(t=>(t.created||0)>=Date.now()-Number(w)*864e5)}
function activeCounts(w){const c=Object.fromEntries([...state.managers.keys()].map(id=>[id,0]));activeTradesFor(w).forEach(t=>mids(t).forEach(id=>c[id]++));return c}
function activeRanked(w){const c=activeCounts(w);return [...state.managers.values()].map(m=>({...m,count:c[m.id]||0})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name))}
function activeWindowLabel(w){return WL[w]||w}
function counts(w){const c=Object.fromEntries([...state.managers.keys()].map(id=>[id,0]));tradesFor(w).forEach(t=>mids(t).forEach(id=>c[id]++));return c}
function ranked(w){const c=counts(w);return [...state.managers.values()].map(m=>({...m,count:c[m.id]||0})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name))}
function meaningfulWeeks(bundle){const rows=safeArray(bundle?.matchups);return [...new Set(rows.filter(x=>Number(x?.points)>0).map(x=>Number(x?.week)).filter(Number.isFinite))].sort((a,b)=>a-b)}
function selectModelBundle(){const current=state.bundles.find(b=>String(b.league.league_id)===CONFIG.currentLeagueId);if(current&&meaningfulWeeks(current).length>=2)return current;return state.bundles.filter(b=>meaningfulWeeks(b).length).sort((a,b)=>Number(b.league.season)-Number(a.league.season))[0]||current||state.bundles[0]}
function matchupRows(bundle,throughWeek=Infinity){return safeArray(bundle?.matchups).filter(x=>Number(x?.week)<=throughWeek&&Number.isFinite(Number(x?.points)))}
function outcomesForBundle(bundle,throughWeek=Infinity){const rows=matchupRows(bundle,throughWeek),byWeek={};rows.forEach(x=>(byWeek[x.week]??=[]).push(x));const out={};Object.values(byWeek).forEach(weekRows=>{const groups={};weekRows.forEach(x=>{if(x.matchup_id!=null)(groups[x.matchup_id]??=[]).push(x)});Object.values(groups).forEach(g=>{if(g.length<2)return;const scores=g.map(x=>Number(x.points));if(scores.some(x=>!Number.isFinite(x))||scores.every(x=>x===0))return;const max=Math.max(...scores),ties=scores.filter(x=>x===max).length;g.forEach((x,i)=>{const owner=bundle.ownerByRoster[String(x.roster_id)];if(!owner)return;(out[owner]??=[]).push({week:x.week,points:scores[i],result:scores[i]===max?(ties>1?.5:1):0})})})});return out}
function minMax(value,values,higher=true){const nums=values.filter(Number.isFinite);if(!nums.length)return .5;const min=Math.min(...nums),max=Math.max(...nums);if(max===min)return .5;const n=(value-min)/(max-min);return higher?n:1-n}
function bundleOwnerKeyForManager(bundle,managerId){
  const id=String(managerId),rosterId=state.managers.get(id)?.roster?.roster_id,owner=rosterId!=null?bundle?.ownerByRoster?.[String(rosterId)]:null;
  return String(owner??id)
}
function standingsTable(bundle,throughWeek=Infinity){
  const outcomes=outcomesForBundle(bundle,throughWeek);
  return [...state.managers.values()].map(m=>{
    const sourceId=bundleOwnerKeyForManager(bundle,m.id),games=outcomes[sourceId]||outcomes[m.id]||[],wins=games.reduce((s,g)=>s+g.result,0),pts=games.reduce((s,g)=>s+g.points,0);
    return {...m,sourceId,wins,games:games.length,pts}
  }).sort((a,b)=>b.wins-a.wins||b.pts-a.pts||a.name.localeCompare(b.name)).map((x,i)=>({...x,standingRank:i+1}))
}
function modelRows(bundle,throughWeek=Infinity,mode="power"){
  // In-season Power Rankings (independent from Championship Odds):
  // 25% last-five scoring average, 25% current team value,
  // 25% current ladder position, 25% last-three scoring average.
  if(mode==="odds")return liveChampionshipScoreRows(bundle,throughWeek);
  const standings=standingsTable(bundle,throughWeek),outcomes=outcomesForBundle(bundle,throughWeek),teamCount=Math.max(standings.length,1),rosterRows=currentRosterProjectionProfiles(bundle),rosterBy=Object.fromEntries(rosterRows.map(x=>[String(x.id),x]));
  const raw=standings.map(team=>{
    const games=outcomes[team.sourceId]||outcomes[team.id]||[],last3=games.slice(-3),last5=games.slice(-5),avg3=last3.length?last3.reduce((s,g)=>s+g.points,0)/last3.length:0,avg5=last5.length?last5.reduce((s,g)=>s+g.points,0)/last5.length:0,ladder=teamCount===1?1:1-(team.standingRank-1)/(teamCount-1),streak=winningStreak(games),teamValue=Number(rosterBy[String(team.id)]?.rosterStrength??.5);
    return {...team,avg3,avg5,ladder,streak,teamValue,recentGames:last3.length,lastFiveGames:last5.length}
  });
  const avg5s=raw.map(x=>x.avg5),avg3s=raw.map(x=>x.avg3);
  return raw.map(x=>{
    const last5Score=minMax(x.avg5,avg5s,true),last3Score=minMax(x.avg3,avg3s,true),score=last5Score*.25+x.teamValue*.25+x.ladder*.25+last3Score*.25;
    return {...x,form:last3Score,recentScoring:last5Score,last3Score,last5Score,score,powerModel:'in-season'}
  }).sort((a,b)=>b.score-a.score||b.avg5-a.avg5||a.name.localeCompare(b.name)).map((x,i)=>({...x,rank:i+1}))
}
function winningStreak(games){let n=0;for(let i=games.length-1;i>=0;i--){if(games[i].result===1)n++;else break}return n}
function calculatedPlayerAverages(bundle,throughWeek=Infinity){const sums={},games={};matchupRows(bundle,throughWeek).forEach(row=>Object.entries(row.players_points||{}).forEach(([id,v])=>{const pts=Number(v);if(!Number.isFinite(pts)||pts<=0)return;sums[id]=(sums[id]||0)+pts;games[id]=(games[id]||0)+1}));return Object.fromEntries(Object.keys(sums).map(id=>[id,games[id]?sums[id]/games[id]:0]))}
function exactAverageMap(season){return state.exactSeasonAverages?.[String(season)]||{}}
function seasonTotalAverageMap(season){return state.seasonTotalAverages?.[String(season)]||{}}
function gameLogAverageMap(season){return state.gameLogAverages?.[String(season)]||{}}
function buildPlayerAverages(bundle,throughWeek=Infinity){
  const season=String(bundle?.league?.season||"");
  const calculated=calculatedPlayerAverages(bundle,throughWeek);
  const exact=exactAverageMap(season);
  const totals=seasonTotalAverageMap(season);
  return {...calculated,...exact,...totals};
}
function prepareModels(){state.modelBundle=selectModelBundle();const weeks=meaningfulWeeks(state.modelBundle),last=weeks.at(-1)||Infinity,prior=weeks.length>1?weeks.at(-2):last;state.previousPowerRanks=Object.fromEntries(modelRows(state.modelBundle,prior,"power").map(x=>[x.id,x.rank]));state.playerAverages=buildPlayerAverages(state.modelBundle,last)}
function playerName(id){const p=state.players[id]||{};return p.full_name||[p.first_name,p.last_name].filter(Boolean).join(" ")||`Player ${id}`}
function refreshResolvedPlayerNames(){
  // Lightweight DOM repair for content that was rendered before Sleeper's full
  // player directory arrived. This avoids rebuilding expensive Hub modules just
  // to replace temporary "Player 2289" labels.
  document.querySelectorAll('[data-player-id]').forEach(el=>{
    const id=String(el.dataset.playerId||'');if(!id)return;const name=playerName(id);
    if(name&&!/^Player \d+$/.test(name)){const current=String(el.textContent||'').trim();if(!current||/^Player \d+$/.test(current))el.textContent=name}
  });
  document.querySelectorAll('[data-unresolved-player-id]').forEach(el=>{
    const id=String(el.dataset.unresolvedPlayerId||'');if(!id)return;const name=playerName(id);if(name&&!/^Player \d+$/.test(name))el.textContent=name
  })
}
function playerLink(id,name=playerName(id),className=""){return `<button type="button" class="player-history-link ${className}" data-player-id="${esc(String(id))}">${esc(name)}</button>`}
function pickOriginalOwner(p,t){const owner=t.roster_owner_map?.[String(p.roster_id)];return owner?managerName(owner,t):null}
function roundWord(n){return ({1:"First",2:"Second",3:"Third",4:"Fourth",5:"Fifth"})[Number(n)]||`Round ${n}`}
function draftedPlayerForPick(p){
  const season=String(p.season),round=String(p.round);
  // A traded pick belongs to its original roster slot. Current/previous owner
  // IDs must never be used here, otherwise a manager who used a traded 1.02
  // can make that player appear as their own 1.08 selection.
  const originalSlot=p.roster_id??p.original_roster_id;
  if(originalSlot==null)return null;
  return state.draftPickMap[`${season}|${String(originalSlot)}|${round}`]||null
}
function fixedPickValue(round){
  round=Number(round);
  return round===1?17.5:round===2?2.5:round===3?2:round===4?1:round===5?.5:0
}
function bundleForSeason(season){return state.bundles.find(b=>String(b.league?.season)===String(season))||null}
function bundleForTrade(t){return state.bundles.find(b=>String(b.league?.league_id)===String(t.league_id))||bundleForSeason(String(t.season_label||"").match(/\d{4}/)?.[0])||null}
function latestKnownAverage(playerId){for(const bundle of [...state.bundles].sort((a,b)=>Number(b.league?.season)-Number(a.league?.season))){const weeks=meaningfulWeeks(bundle);if(!weeks.length)continue;const avg=Number(buildPlayerAverages(bundle,weeks.at(-1))[playerId]||0);if(avg>0)return avg}return Number(state.playerAverages[playerId]||0)}
function playerSeasonAverage(playerId,season){const bundle=bundleForSeason(season);if(!bundle)return 0;const weeks=meaningfulWeeks(bundle);return weeks.length?Number(buildPlayerAverages(bundle,weeks.at(-1))[playerId]||0):0}
function tradeSeasonAverage(playerId,t){const bundle=bundleForTrade(t);if(bundle){const weeks=meaningfulWeeks(bundle);if(weeks.length){const avg=Number(buildPlayerAverages(bundle,weeks.at(-1))[playerId]||0);if(avg>0)return avg}}return latestKnownAverage(playerId)}
function playerAgeAt(playerId,timestamp){const p=state.players[playerId]||{},at=new Date(Number(timestamp)||Date.now()),raw=p.birth_date||p.birthdate||p.dob;if(raw){const born=new Date(raw);if(!Number.isNaN(born.getTime())){let age=at.getFullYear()-born.getFullYear();if(at.getMonth()<born.getMonth()||(at.getMonth()===born.getMonth()&&at.getDate()<born.getDate()))age--;return Math.max(18,age)}}const currentAge=Number(p.age);if(Number.isFinite(currentAge))return Math.max(18,currentAge-(new Date().getFullYear()-at.getFullYear()));return 28}
function ageMultiplier(age){if(age<=19)return 1.18;if(age===20)return 1.20;if(age===21)return 1.22;if(age===22)return 1.23;if(age===23)return 1.24;if(age===24||age===25)return 1.25;if(age===26)return 1.24;if(age===27)return 1.22;if(age===28)return 1.18;if(age===29)return 1.12;if(age===30)return 1.05;if(age===31)return .98;if(age===32)return .92;if(age===33)return .88;if(age===34)return .84;if(age===35)return .80;return .76}
function eliteMultiplier(avg){if(avg>=40)return 1.40;if(avg>=35)return 1.28;if(avg>=30)return 1.18;if(avg>=25)return 1.10;if(avg>=20)return 1.05;if(avg>=10)return 1.02;return 1}
function playerDynastyValue(playerId,average,timestamp){const avg=Number(average)||0;return avg>0?avg*ageMultiplier(playerAgeAt(playerId,timestamp))*eliteMultiplier(avg):0}
function topTenSeasonAverageIds(t){
  // Use the trade season when actual games exist. During a preseason or when a
  // historical bundle is incomplete, fall back to the latest loaded season
  // with meaningful player averages so elite-player premiums never disappear.
  const candidates=[];
  const tradeBundle=bundleForTrade(t);
  if(tradeBundle)candidates.push(tradeBundle);
  [...state.bundles]
    .sort((a,b)=>Number(b.league?.season)-Number(a.league?.season))
    .forEach(bundle=>{if(!candidates.includes(bundle))candidates.push(bundle)});
  for(const bundle of candidates){
    const weeks=meaningfulWeeks(bundle);
    if(!weeks.length)continue;
    const averages=buildPlayerAverages(bundle,weeks.at(-1));
    const ranked=Object.entries(averages)
      .filter(([,avg])=>Number(avg)>0)
      .sort((a,b)=>Number(b[1])-Number(a[1]));
    if(ranked.length>=10)return new Set(ranked.slice(0,10).map(([id])=>String(id)));
  }
  const fallback=Object.entries(state.playerAverages||{})
    .filter(([,avg])=>Number(avg)>0)
    .sort((a,b)=>Number(b[1])-Number(a[1]))
    .slice(0,10)
    .map(([id])=>String(id));
  return new Set(fallback)
}
function tradePlayerValue(playerId,average,t){
  const base=playerDynastyValue(playerId,average,t.created);
  return topTenSeasonAverageIds(t).has(String(playerId))?base*1.20:base
}
function tradeAssets(raw){
  const t=normaliseTrade(raw),by={};mids(t).forEach(id=>by[id]=[]);
  Object.entries(t.adds).forEach(([pid,rid])=>{try{const mid=t.roster_owner_map?.[String(rid)];if(!mid||!by[mid])return;const average=tradeSeasonAverage(pid,t);by[mid].push({type:"player",id:pid,name:playerName(pid),value:tradePlayerValue(pid,average,t),average,topTenBonus:topTenSeasonAverageIds(t).has(String(pid))})}catch(error){console.warn('Skipped malformed traded player',pid,error)}});
  t.draft_picks.forEach(p=>{try{if(!p||typeof p!=='object')return;const mid=t.roster_owner_map?.[String(p.owner_id)];if(!mid||!by[mid])return;const round=Number(p.round)||0,season=p.season||"Future",original=pickOriginalOwner(p,t),drafted=draftedPlayerForPick(p),pickLabel=`${season} ${roundWord(round)} Round Pick${original?` ${original}`:""}`;const value=fixedPickValue(round),average=0;by[mid].push({type:"pick",id:drafted||null,pickKey:pickAssetKey(p),pick:{...p,_trade:t},round,name:drafted?`${playerName(drafted)} (${pickLabel})`:`${season} Round ${round||'—'} Pick`,owner:drafted?null:original,value,average})}catch(error){console.warn('Skipped malformed traded pick',p,error)}});
  return by
}
function tradeValue(t){return Object.values(tradeAssets(t)).flat().reduce((sum,asset)=>sum+(Number(asset.value)||0),0)}

function tradeOutgoingAssets(raw){
  const t=normaliseTrade(raw),by={};mids(t).forEach(id=>by[id]=[]);
  Object.entries(t.drops||{}).forEach(([pid,rid])=>{try{const mid=t.roster_owner_map?.[String(rid)];if(!mid||!by[mid])return;const average=tradeSeasonAverage(pid,t);by[mid].push({type:"player",id:pid,name:playerName(pid),value:tradePlayerValue(pid,average,t),average,age:playerAgeAt(pid,t.created),topTenBonus:topTenSeasonAverageIds(t).has(String(pid))})}catch(error){console.warn('Skipped malformed outgoing player',pid,error)}});
  safeArray(t.draft_picks).forEach(p=>{try{if(!p||typeof p!=='object')return;const mid=t.roster_owner_map?.[String(p.previous_owner_id)];if(!mid||!by[mid])return;const round=Number(p.round)||1,season=p.season||"Future",drafted=draftedPlayerForPick(p),value=fixedPickValue(round),average=0;by[mid].push({type:"pick",id:drafted||null,round,name:drafted?playerName(drafted):`${season} Round ${round} Pick`,value,average,age:drafted?playerAgeAt(drafted,t.created):20})}catch(error){console.warn('Skipped malformed outgoing pick',p,error)}});
  return by
}
function tradeSideMetrics(t,managerId){
  const id=String(managerId),tradeKey=String(t.transaction_id||`${t.league_id||''}-${t.created||''}`),cacheKey=`${tradeKey}|${id}`;
  if(state.computedCache.tradeSide.has(cacheKey))return state.computedCache.tradeSide.get(cacheKey);
  const received=tradeAssets(t)[id]||[],outgoing=tradeOutgoingAssets(t)[id]||[];
  let sent=outgoing;
  if(!sent.length&&mids(t).length===2){const other=mids(t).find(x=>String(x)!==id);sent=tradeAssets(t)[other]||[]}
  const rawReceivedValue=received.reduce((sum,a)=>sum+(Number(a.value)||0),0),rawSentValue=sent.reduce((sum,a)=>sum+(Number(a.value)||0),0);

  // Package depth is intentionally worth less than headline quality. Every side is
  // scored with the same diminishing-return curve so collecting extra B/C assets
  // cannot automatically overpower a single elite dynasty player.
  const packageWeights=[1.00,0.85,0.70,0.55];
  // First-round picks have their own diminishing-return curve when multiple
  // firsts are bundled on the same side. This is applied only inside trade
  // grading; the normal IMO pick values shown elsewhere remain unchanged.
  // Highest-value first keeps full value, then 85%, 75%, 65%, and 60% for 5+.
  const firstRoundWeights=[1.00,0.85,0.75,0.65];
  const weightedPackageValue=assets=>{
    const firsts=[...assets]
      .filter(a=>a.type==='pick'&&Number(a.round||a.pick?.round||0)===1)
      .sort((a,b)=>(Number(b.value)||0)-(Number(a.value)||0));
    const firstRank=new Map(firsts.map((asset,index)=>[asset,index]));
    const effective=[...assets].map(asset=>{
      const value=Number(asset.value)||0;
      const rank=firstRank.get(asset);
      const firstMultiplier=rank===undefined?1:(firstRoundWeights[rank]??0.60);
      return {asset,effectiveValue:value*firstMultiplier};
    });
    return effective
      .sort((a,b)=>b.effectiveValue-a.effectiveValue)
      .reduce((sum,row,index)=>sum+row.effectiveValue*(packageWeights[index]??0.40),0);
  };
  const weightedReceivedValue=weightedPackageValue(received);
  const weightedSentValue=weightedPackageValue(sent);

  const allPlayers=Object.values(tradeAssets(t)).flat().filter(a=>a.type==='player').sort((a,b)=>(Number(b.value)||0)-(Number(a.value)||0));
  const bestPlayer=allPlayers[0]||null,nextBest=allPlayers[1]||null;
  const bestReceived=Boolean(bestPlayer&&received.some(a=>a.type==='player'&&String(a.id)===String(bestPlayer.id)));
  const bestRatio=bestPlayer&&nextBest&&Number(nextBest.value)>0?Number(bestPlayer.value)/Number(nextBest.value):bestPlayer?Infinity:1;
  // The grade floor is determined strictly by relative player value. Do not
  // require an arbitrary minimum value, as missing/partial historical feeds can
  // otherwise disable the protection for an obvious superstar acquisition.
  const clearCentrepiece=Boolean(bestReceived&&bestRatio>=1.15);
  // A proven high-value player is still a meaningful centrepiece in a three-team
  // deal even when another star is close enough to prevent the 1.15 ratio test.
  const bestReceivedPlayer=received.filter(a=>a.type==='player').sort((a,b)=>Number(b.value||0)-Number(a.value||0))[0]||null;
  const meaningfulCentrepiece=Boolean(bestReceivedPlayer&&(Number(bestReceivedPlayer.value||0)>=22||Number(bestReceivedPlayer.average||0)>=24));

  // Strong best-player premium. The manager landing the clear headline player
  // receives an extra 12–25% of that player's value depending on how far ahead
  // they are of the next-best player. A top-10 tagged player gets at least 20%.
  let starPremiumRate=0;
  if(bestReceived&&bestPlayer){
    if(bestRatio>=1.35)starPremiumRate=0.25;
    else if(bestRatio>=1.20)starPremiumRate=0.20;
    else if(bestRatio>=1.10)starPremiumRate=0.12;
    if(bestPlayer.topTenBonus)starPremiumRate=Math.max(starPremiumRate,0.20);
  }
  const starBonus=bestReceived&&bestPlayer?Number(bestPlayer.value||0)*starPremiumRate:0;

  // Diminishing returns already create the consolidation effect, so do not stack
  // the old asset-count bonus on top and double-reward the same behaviour.
  const assetReduction=Math.max(0,sent.length-received.length);
  const consolidationRate=0;
  const consolidationBonus=0;
  const contextualBonus=starBonus;
  const adjustedReceivedValue=weightedReceivedValue+contextualBonus;
  const average=(adjustedReceivedValue+weightedSentValue)/2;
  const edge=average>0?(adjustedReceivedValue-weightedSentValue)/average*100:0;
  const net=adjustedReceivedValue-weightedSentValue;

  const result={id,received,sent,receivedValue:rawReceivedValue,sentValue:rawSentValue,weightedReceivedValue,weightedSentValue,adjustedReceivedValue,edge,net,bestReceived,bestPlayer,bestReceivedPlayer,clearCentrepiece,meaningfulCentrepiece,bestRatio,starPremiumRate,starBonus,consolidationRate,consolidationBonus,contextualBonus,assetReduction};
  state.computedCache.tradeSide.set(cacheKey,result);
  return result
}
function packageGradePoints(edge,net){
  // V3.3.83: normal dynasty trades should generally live in the C-to-A+ range.
  // D territory is now reserved for clearly lopsided outcomes rather than ordinary
  // preference/fit disagreements. F/Fleece remain governed separately below.
  let points=edge>=45?10:edge>=32?9:edge>=20?8:edge>=9?7:edge>=2?6:edge>=-14?5:edge>=-30?4:3;
  // Small-value trades cannot produce sensational grades solely from percentage swings.
  if(points>=9&&net<12)points=net>=8?8:net>=4?7:6;
  if(points===8&&net<7)points=net>=4?7:net>=2?6:5;
  if(points===7&&net<3)points=6;
  // A harsh percentage gap on a relatively small absolute loss should still be D+
  // rather than a full D. Full D now needs both a sizeable relative and real-value loss.
  if(points===3&&net>-22)points=4;
  return points
}
function gradeFromPoints(points,m){
  // A+ is reserved for genuinely meaningful wins, not tiny percentage steals.
  // A low-value player acquired for a late pick can still grade very well, but
  // needs a substantial absolute gain or a truly premium centrepiece to reach A+.
  const totalDealValue=m.receivedValue+m.sentValue;
  const premiumCentrepiece=Boolean(m.clearCentrepiece&&Number(m.bestPlayer?.value||0)>=25);
  const meaningfulAPlus=points>=10&&m.net>=10&&totalDealValue>=20&&(
    (m.edge>=40&&m.net>=18)||
    (premiumCentrepiece&&m.edge>=24&&m.net>=12)
  );
  if(meaningfulAPlus)return'A+';
  if(points>=9)return'A';
  if(points>=8)return'B+';
  if(points>=7)return'B';
  if(points>=6)return'C+';
  if(points>=5)return'C';
  if(points>=4)return'D+';
  if(points>=3)return'D';
  // F and Fleece Alert are reserved for unmistakable robberies. Ordinary bad
  // trades now bottom out at D so the labels retain real meaning.
  const trueFleece=!m.meaningfulCentrepiece&&totalDealValue>=35&&m.edge<=-70&&m.net<=-40;
  const trueFail=!m.meaningfulCentrepiece&&totalDealValue>=25&&m.edge<=-58&&m.net<=-30;
  if(trueFleece)return'FLEECE ALERT 🚨';
  if(trueFail)return'F';
  return'D';
}
function stableIndex(key,length){let h=2166136261;for(const c of String(key)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return Math.abs(h>>>0)%Math.max(1,length)}
const TRADE_COMMENTS={
  'A+':['A premium result, combining a standout return with excellent deal structure.','Exceptional business — this side secured the headline asset and protected its overall position.','A rare top-tier outcome that delivers both quality and value.','Outstanding work, landing the centrepiece without losing control of the deal.'],
  'A':['A strong result that meaningfully improves this roster.','Excellent business, with the return comfortably justifying the cost.','A high-quality move built around a clear advantage.','They leave the table in a notably stronger position.'],
  'B+':['A strong return that gives this side a clear advantage.','Smart business, with the better overall package coming back.','A tidy win that strengthens the roster without a major overpay.','They came away comfortably ahead while addressing a genuine need.','A quality deal that leaves this franchise in the stronger position.','Good negotiating — the return outweighs what was sent out.'],
  'B':['A useful win, with a little more coming back than went out.','Solid work — the trade improves this roster without creating a major weakness.','A positive result that quietly moves the team in the right direction.','Good business, with the incoming package earning a meaningful edge.','A sensible move that delivers more upside than risk.'],
  'C+':['Almost even, but this side earns the slightest advantage.','A balanced exchange with a small edge in their favour.','Little separates the packages, though this return just shades it.','A fair trade that leans narrowly toward this side.'],
  'C':['A balanced exchange with very little separating the two sides.','Fair business — each side can make a credible case for the deal.','A needs-based move with no obvious loser.','Close enough to call even, with the outcome likely decided over time.'],
  'D+':['A small overpay, though the move remains easy enough to justify.','They gave up a little extra, but the roster fit softens the damage.','Slightly expensive, without becoming a serious mistake.','The price was a touch high, though the return still has a clear purpose.'],
  'D':['A noticeable overpay, but not one that cannot be justified.','The outgoing package carries more weight, placing pressure on the return.','They paid above the going rate and will need the incoming assets to deliver.','A clear disadvantage on the exchange, though the logic remains understandable.'],
  'F':['A major overpay, with a sizeable gap between cost and return.','This one is difficult to defend — too much went out the door.','A significant value loss that places enormous pressure on the incoming assets.','They surrendered the stronger package by a considerable margin.'],
  'FLEECE ALERT 🚨':['FLEECE ALERT 🚨 Trade authorities have been notified after a landslide result.','FLEECE ALERT 🚨 A brutal gap makes this one almost impossible to defend.','FLEECE ALERT 🚨 One side walked away with the keys, the car and the registration.','FLEECE ALERT 🚨 This was less a negotiation and more a daylight robbery.']
};
function tradeGrade(t,managerId){
  const m=tradeSideMetrics(t,managerId),base=packageGradePoints(m.edge,m.net);
  let final=base,grade=gradeFromPoints(final,m);
  const isConsolidation=m.assetReduction>0;
  const gradeRank={'FLEECE ALERT 🚨':0,'F':1,'D':2,'D+':3,'C':4,'C+':5,'B':6,'B+':7,'A':8,'A+':9};
  // Apply the superstar protections LAST, after every raw-value and contextual
  // calculation. This guarantees the displayed grade can never bypass them.
  if(m.bestReceived&&m.bestRatio>=1.30&&isConsolidation&&(gradeRank[grade]??0)<gradeRank.B)grade='B';
  else if(m.bestReceived&&m.bestRatio>=1.15&&(gradeRank[grade]??0)<gradeRank.C)grade='C';
  const comments=TRADE_COMMENTS[grade]||TRADE_COMMENTS.C;
  return{...m,base,final,grade,comment:comments[stableIndex(`${t.transaction_id||t.created}|${managerId}|${grade}`,comments.length)]}
}
function tradeGrades(t){return mids(t).map(id=>tradeGrade(t,id))}
function winWinTrade(t){const grades=tradeGrades(t),rank={'A+':10,'A':9,'B+':8,'B':7,'C+':6,'C':5,'D+':4,'D':3,'F':2,'FLEECE ALERT 🚨':0};return grades.length>=2&&grades.every(g=>(rank[g.grade]||0)>=7)}
function gradeClass(grade){return grade.startsWith('A')?'grade-a':grade.startsWith('B')?'grade-b':grade.startsWith('C')?'grade-c':grade.startsWith('D')?'grade-d':'grade-f'}
function tradeEditorialHTML(t,compact=false){const grades=tradeGrades(t),winwin=winWinTrade(t);return `<div class="trade-editorial ${compact?'compact':''}">${winwin?'<div class="win-win-label">🤝 WIN-WIN TRADE</div>':''}${grades.map(g=>{const badge=compact&&g.grade==='FLEECE ALERT 🚨'?'FLEECE':g.grade;const comment=compact&&g.grade==='FLEECE ALERT 🚨'?g.comment.replace(/^FLEECE ALERT 🚨\s*/,''):g.comment;return `<div class="trade-grade-row"><span class="trade-grade-team">${esc(managerName(g.id,t))}</span><span class="trade-grade-badge ${gradeClass(g.grade)}">${esc(badge)}</span><span class="trade-grade-comment">${esc(comment)}</span></div>`}).join('')}</div>`}
function tradeSummary(t){const assets=Object.values(tradeAssets(t)).flat().filter(a=>a.type==='player').map(a=>a.name);const core=assets.slice(0,3).join(' / ')||'Draft-pick trade';return core}
function tradeAssetLinkHTML(asset,className=''){
  if(asset?.type==='player'&&asset.id)return playerLink(asset.id,asset.name,className);
  if(asset?.type==='pick'&&asset.pickKey)return pickHistoryLink(asset.pickKey,asset.name,`pick-history-link ${className}`.trim());
  return esc(asset?.name||'Unknown asset')
}
function rawRenderableTradeAssets(raw){
  const t=normaliseTrade(raw),by={},participantIds=[...new Set([...safeArray(t.manager_ids).map(String),...safeArray(t.roster_ids).map(rid=>t.roster_owner_map?.[String(rid)]).filter(Boolean).map(String)])];
  participantIds.forEach(id=>by[id]=[]);
  const ensureSide=id=>{const key=String(id||'unknown');if(!by[key])by[key]=[];return by[key]};
  Object.entries(t.adds||{}).forEach(([pid,rid])=>{const mid=t.roster_owner_map?.[String(rid)]||`roster-${rid}`;ensureSide(mid).push({type:'player',id:String(pid),name:playerName(pid),value:0,average:0})});
  safeArray(t.draft_picks).forEach(p=>{if(!p||typeof p!=='object')return;const mid=t.roster_owner_map?.[String(p.owner_id)]||`roster-${p.owner_id??'unknown'}`,round=Number(p.round)||1,season=String(p.season||'Future'),original=pickOriginalOwner(p,t);let key='';try{key=pickAssetKey(p)}catch(_){key=`${season}|${String(p.roster_id??p.original_roster_id??'')}|${round}`};ensureSide(mid).push({type:'pick',pickKey:key,pick:{...p,_trade:t},name:`${season} Round ${round} Pick`,owner:original||null,value:0,average:0})});
  return by
}
function renderableTradeAssets(raw){
  try{const assets=tradeAssets(raw);if(assets&&typeof assets==='object'&&Object.keys(assets).length)return assets}catch(error){console.warn('Using raw trade asset fallback',raw?.transaction_id||raw?.created,error)}
  return rawRenderableTradeAssets(raw)
}
function tradeSummaryLinksHTML(raw){
  try{const assets=Object.values(renderableTradeAssets(raw)).flat().sort((a,b)=>Number(b?.value||0)-Number(a?.value||0)).slice(0,3);return assets.length?assets.map(a=>tradeAssetLinkHTML(a,'trade-summary-asset-link')).join('<span class="trade-summary-separator"> / </span>'):'View transaction'}catch(error){console.warn('Trade summary unavailable',raw?.transaction_id||raw?.created,error);return 'View transaction'}
}
function tradeDetailsHTML(raw){
  const t=normaliseTrade(raw);let sides={};try{sides=renderableTradeAssets(t)}catch(error){console.warn('Trade detail assets unavailable',t.transaction_id||t.created,error);sides={}}
  const entries=Object.entries(sides||{});
  if(!entries.length)return '<div class="block-empty">No transaction assets were returned by Sleeper.</div>';
  return entries.map(([id,assets])=>{const label=String(id).startsWith('roster-')?`Roster ${String(id).replace('roster-','')}`:managerName(id,t);const rows=safeArray(assets);return `<div class="trade-detail-side"><strong>${esc(label)} receives</strong>${rows.length?rows.map(a=>`<div>${tradeAssetLinkHTML(a,'trade-detail-asset-link')}${a?.owner?` <small>(${esc(a.owner)}'s pick)</small>`:''}</div>`).join(''):'<div>No listed assets</div>'}</div>`}).join('')
}
function safeTradeEditorialHTML(raw,compact=false){try{return tradeEditorialHTML(normaliseTrade(raw),compact)}catch(error){console.warn('Trade grading unavailable',raw?.transaction_id||raw?.created,error);return '<div class="trade-editorial compact"><div class="trade-grade-row"><span class="trade-grade-comment">Trade grades are temporarily unavailable; full transaction details are shown above.</span></div></div>'}}

function spotlightSeasonHasPlayedGames(logs){
  return Object.values(logs||{}).some(playerLogs=>safeArray(playerLogs).some(game=>gameWasPlayed(game)));
}
function playerSpotlightContext(){
  const currentCandidates=[String(tradeTargetAverageContext().season||''),String(currentLeagueBundle()?.league?.season||''),String(state.modelBundle?.league?.season||'')].filter((value,index,array)=>value&&array.indexOf(value)===index&&value!=='2025');
  for(const season of currentCandidates){
    const averages=seasonAverageMap(season),meta=state.seasonTotalMeta?.[season]||{};
    const playedCount=Object.values(meta).filter(row=>Number(row?.gamesPlayed||0)>0).length;
    const usable=Object.values(averages).filter(value=>Number(value)>0).length;
    if(usable>=20&&playedCount>=10)return{season,averages,isFallback:false};
  }
  return{season:'2025',averages:seasonAverageMap('2025'),isFallback:true};
}
function dailyPlayerSpotlight(){
  const context=playerSpotlightContext();
  const pool=Object.entries(context.averages||{}).filter(([,avg])=>Number(avg)>0).sort((a,b)=>Number(b[1])-Number(a[1])||String(a[0]).localeCompare(String(b[0]))).slice(0,100);
  if(!pool.length)return null;
  const bucket=Math.floor(Date.now()/864e5),key='imoPlayerSpotlightV4',stored=readStoredJSON(key);
  let selected=stored?.bucket===bucket&&String(stored.season)===String(context.season)?pool.find(([id])=>String(id)===String(stored.playerId)):null;
  if(!selected){
    const index=stableIndex(`spotlight-top100|${context.season}|${bucket}|${pool.map(([id])=>id).join('|')}`,pool.length);
    selected=pool[index]||pool[0];
    try{localStorage.setItem(key,JSON.stringify({bucket,season:context.season,playerId:selected[0],savedAt:Date.now()}))}catch(_){ }
  }
  const [id,average]=selected;
  return{id:String(id),name:playerName(id),season:context.season,seasonAverage:Number(average)||0,avatar:`https://sleepercdn.com/content/nba/players/${id}.jpg`};
}
let playerSpotlightHydrationPromise=null;
async function ensurePlayerSpotlightData(){
  if(playerSpotlightHydrationPromise)return playerSpotlightHydrationPromise;
  playerSpotlightHydrationPromise=(async()=>{
    const context=playerSpotlightContext();
    if(Object.values(context.averages||{}).filter(v=>Number(v)>0).length>=20)return;
    const season='2025',scoring=seasonBundleForStats(season)?.league?.scoring_settings||state.modelBundle?.league?.scoring_settings||{};
    state.seasonTotalAverages[season]??={};state.seasonTotalMeta[season]??={};
    const seedIds=[...new Set(relevantPlayerIds().map(String))].slice(0,220);
    const direct=await limitedMap(seedIds,8,async id=>{try{const result=await loadPlayerSeasonAverage(id,season,scoring);return result?{id,result}:null}catch(error){console.warn('Spotlight season average unavailable',id,season,error);return null}});
    direct.filter(Boolean).forEach(({id,result})=>{
      state.seasonTotalAverages[season][id]=Number(result.average||0);
      state.seasonTotalMeta[season][id]={gamesPlayed:Number(result.gamesPlayed||0),totalFantasyPoints:Number(result.totalFantasyPoints||0),average:Number(result.average||0),totalMinutes:Number(result.totalMinutes||0),averageMinutes:Number(result.averageMinutes||0),source:result.source||'spotlight-direct-season'};
    });
    state.computedCache.seasonAverages.delete(String(season));
  })().finally(()=>{playerSpotlightHydrationPromise=null});
  return playerSpotlightHydrationPromise;
}
function renderPlayerSpotlight(){
  const target=$('playerSpotlight');if(!target)return;
  const player=dailyPlayerSpotlight();
  if(!player){
    target.innerHTML='<div class="player-spotlight-empty"><strong>Finding today’s player…</strong><small>Loading 2025 Sleeper season averages.</small></div>';
    ensurePlayerSpotlightData().then(()=>{const resolved=dailyPlayerSpotlight();if(resolved)renderPlayerSpotlight();else target.innerHTML='<div class="player-spotlight-empty"><strong>Player Spotlight</strong><small>Season averages could not be loaded. Refresh to retry.</small></div>'}).catch(error=>{console.warn('Player Spotlight hydration failed',error);target.innerHTML='<div class="player-spotlight-empty"><strong>Player Spotlight</strong><small>Season averages could not be loaded. Refresh to retry.</small></div>'});
    return;
  }
  target.innerHTML=`<button type="button" class="player-spotlight-avatar player-history-link" data-player-id="${esc(player.id)}" aria-label="Open ${esc(player.name)} player profile"><img src="${esc(player.avatar)}" alt="" loading="lazy" onerror="this.style.display='none'"></button><div class="player-spotlight-copy"><small>Daily top-100 player</small>${playerLink(player.id,player.name,'player-spotlight-name')}<span>${esc(player.season)} season average · refreshes every 24 hours</span></div><div class="player-spotlight-average"><strong>${player.seasonAverage.toFixed(2)}</strong><small>FPTS/G</small></div>`;
}
function renderSummary(){
  const latest=state.trades[0];
  renderPlayerSpotlight();
  if(latest){
    const sides=Object.entries(tradeAssets(latest)).slice(0,2),headline=sides.map(([mid,assets])=>{const biggest=[...assets].sort((a,b)=>Number(b.value||0)-Number(a.value||0))[0];return biggest?tradeAssetLinkHTML(biggest,'summary-player-link'):esc(managerName(mid,latest))}).join('<span class="latest-trade-for"> for </span>');
    $("latestTradeShort").innerHTML=headline||esc(tradeSummary(latest));$("latestTradeDate").textContent=`${mids(latest).map(id=>managerName(id,latest)).join(" ↔ ")} · ${fmt(latest.created)}`;
  }else{$("latestTradeShort").textContent='—';$("latestTradeDate").textContent='No trade'}
}
function renderLeaderboard(){const r=activeRanked(state.activeWindow),max=Math.max(...r.map(x=>x.count),1);$("leaderboard").classList.remove("loading");$("leaderboard").innerHTML=r.map((x,i)=>`<div class="leader-row manager-row-hover"><span class="rank">${i+1}</span><button class="team-name manager-profile-link" type="button" data-manager-id="${esc(x.id)}">${esc(x.name)}</button><div class="bar-track"><div class="bar-fill" style="width:${x.count/max*100}%"></div></div><span class="trade-count">${x.count}</span></div>`).join("")}
function leagueLuckRatings(bundle=state.modelBundle,throughWeek=Infinity){
  const ratings=Object.fromEntries([...state.managers.keys()].map(id=>[String(id),0]));
  if(!bundle)return ratings;
  const rows=matchupRows(bundle,throughWeek),byWeek={};
  rows.forEach(row=>(byWeek[row.week]??=[]).push(row));
  Object.values(byWeek).forEach(weekRows=>{
    const groups={};
    weekRows.forEach(row=>{if(row.matchup_id!=null)(groups[row.matchup_id]??=[]).push(row)});
    const completed=[];
    Object.values(groups).forEach(group=>{
      if(group.length<2)return;
      const a=group[0],b=group[1],aPts=Number(a.points),bPts=Number(b.points);
      if(!Number.isFinite(aPts)||!Number.isFinite(bPts)||(aPts===0&&bPts===0))return;
      const aId=String(bundle.ownerByRoster?.[String(a.roster_id)]||''),bId=String(bundle.ownerByRoster?.[String(b.roster_id)]||'');
      if(!aId||!bId||aId===bId)return;
      completed.push({id:aId,points:aPts,opp:bId});
      completed.push({id:bId,points:bPts,opp:aId});
      if(aPts>bPts){ratings[aId]=(ratings[aId]||0)+1}else if(bPts>aPts){ratings[bId]=(ratings[bId]||0)+1}else{ratings[aId]=(ratings[aId]||0)+.5;ratings[bId]=(ratings[bId]||0)+.5}
    });
    const n=completed.length;
    if(n<2)return;
    completed.forEach(team=>{
      const others=completed.filter(x=>x.id!==team.id),lower=others.filter(x=>team.points>x.points).length,equal=others.filter(x=>team.points===x.points).length;
      const expected=(lower+equal*.5)/Math.max(1,others.length);
      ratings[team.id]=(ratings[team.id]||0)-expected;
    });
  });
  const total=Object.values(ratings).reduce((sum,v)=>sum+v,0);
  if(Math.abs(total)>.000001){
    const active=Object.keys(ratings).filter(id=>Number.isFinite(ratings[id]));
    const adjustment=active.length?total/active.length:0;
    active.forEach(id=>ratings[id]-=adjustment);
  }
  return ratings;
}
function managerLuckRating(managerId,bundle=state.modelBundle,throughWeek=Infinity){return Number(leagueLuckRatings(bundle,throughWeek)[String(managerId)]||0)}
function recentThreePointAverage(managerId,bundle=state.modelBundle,throughWeek=Infinity){const games=(outcomesForBundle(bundle,throughWeek)[String(managerId)]||[]).slice(-3);return games.length?games.reduce((s,g)=>s+g.points,0)/games.length:0}
function activeTrendBundle(){const current=state.bundles.find(b=>String(b.league?.league_id)===CONFIG.currentLeagueId);if(current&&meaningfulWeeks(current).length)return current;return state.bundles.filter(b=>meaningfulWeeks(b).length).sort((a,b)=>Number(b.league?.season)-Number(a.league?.season))[0]||state.modelBundle}
function previousCompletedBundle(bundle){
  const season=Number(bundle?.league?.season||0);
  return state.bundles.filter(b=>Number(b.league?.season||0)<season&&meaningfulWeeks(b).length).sort((a,b)=>Number(b.league?.season||0)-Number(a.league?.season||0))[0]||null
}
function rookieProjectionValue(playerId){
  const id=String(playerId),selection=[...safeArray(state.allDraftSelections)].filter(x=>x?.isRookieDraft&&String(x.playerId)===id).sort((a,b)=>Number(b.season||0)-Number(a.season||0)||Number(b.created||0)-Number(a.created||0))[0];
  if(!selection)return 0;
  const overall=Number(selection.overallPick||selection.pickNo||0),round=Number(selection.round||0);
  if(overall>=1&&overall<=16)return Math.max(5,27.5-(overall-1)*1.5);
  return fixedPickValue(round)
}
function projectedPlayerAverage(playerId,primarySeason,fallbackSeason){
  const id=String(playerId),primary=Number(playerSeasonAverage(id,String(primarySeason))||seasonAverageMap(String(primarySeason))?.[id]||0);
  if(primary>0)return primary;
  const fallback=Number(playerSeasonAverage(id,String(fallbackSeason))||seasonAverageMap(String(fallbackSeason))?.[id]||0);
  if(fallback>0)return fallback;
  const latest=Number(latestKnownAverage(id)||0);
  return latest>0?latest:rookieProjectionValue(id)
}
function rosterProjectionRaw(roster,primarySeason,fallbackSeason){
  const values=safeArray(roster?.players).map(String).map(pid=>projectedPlayerAverage(pid,primarySeason,fallbackSeason)).filter(v=>Number.isFinite(v)&&v>0).sort((a,b)=>b-a),top10=values.slice(0,10),top3=values.slice(0,3);
  return {top10:top10.reduce((a,b)=>a+b,0),top3:top3.reduce((a,b)=>a+b,0),playerCount:values.length}
}
function rosterAssetValueRaw(roster,primarySeason,fallbackSeason){
  return safeArray(roster?.players).map(String).reduce((sum,pid)=>{
    const average=projectedPlayerAverage(pid,primarySeason,fallbackSeason),value=average>0?playerDynastyValue(pid,average,Date.now()):rookieProjectionValue(pid);
    return sum+(Number(value)||0)
  },0)
}
function currentRosterProjectionProfiles(bundle){
  const season=String(bundle?.league?.season||'2026'),prior=previousCompletedBundle(bundle),fallback=String(prior?.league?.season||Number(season)-1),isCurrent=String(bundle?.league?.league_id||'')===String(CONFIG.currentLeagueId),rows=[...state.managers.values()].map(m=>{
    const rosterId=String(m.roster?.roster_id??''),historicalRoster=safeArray(bundle?.rosters).find(r=>String(r.roster_id)===rosterId),roster=isCurrent?(m.roster||historicalRoster||{}):(historicalRoster||m.roster||{}),raw=rosterProjectionRaw(roster,season,fallback);
    return {...m,...raw,assetValue:rosterAssetValueRaw(roster,season,fallback)}
  }),top10Values=rows.map(x=>x.top10),top3Values=rows.map(x=>x.top3);
  return rows.map(x=>({...x,rosterStrength:minMax(x.top10,top10Values,true),starPower:minMax(x.top3,top3Values,true),rosterStarScore:minMax(x.top10,top10Values,true)*.80+minMax(x.top3,top3Values,true)*.20}))
}
function priorSeasonFormRows(bundle){
  const prior=previousCompletedBundle(bundle);if(!prior)return [];
  const outcomes=outcomesForBundle(prior),standings=standingsTable(prior),teamCount=Math.max(1,standings.length),raw=standings.map(team=>{
    const games=outcomes[team.sourceId]||outcomes[team.id]||[],last5=games.slice(-5),last3=games.slice(-3),wins=last5.reduce((s,g)=>s+g.result,0),avg5=last5.length?last5.reduce((s,g)=>s+g.points,0)/last5.length:0,avg3=last3.length?last3.reduce((s,g)=>s+g.points,0)/last3.length:0,winRate=last5.length?wins/last5.length:.5,ladder=teamCount===1?1:1-(team.standingRank-1)/(teamCount-1);
    return {...team,last5Wins:wins,last5Games:last5.length,last3Games:last3.length,last5Average:avg5,last3Average:avg3,winRate,ladder}
  }),avg5s=raw.map(x=>x.last5Average),avg3s=raw.map(x=>x.last3Average);
  return raw.map(x=>({...x,last5Score:minMax(x.last5Average,avg5s,true),last3Score:minMax(x.last3Average,avg3s,true),projectionSeason:String(prior.league?.season||'')}))
}
function offseasonMomentumRows(bundle){
  const prior=previousCompletedBundle(bundle),currentSeason=String(bundle?.league?.season||'2026'),priorSeason=String(prior?.league?.season||Number(currentSeason)-1),raw=[...state.managers.values()].map(m=>{
    const currentRoster=m.roster||{},rosterId=String(currentRoster.roster_id??''),priorRoster=safeArray(prior?.rosters).find(r=>String(r.roster_id)===rosterId),currentValue=rosterAssetValueRaw(currentRoster,currentSeason,priorSeason),priorValue=priorRoster?rosterAssetValueRaw(priorRoster,priorSeason,priorSeason):currentValue,delta=priorValue>0?(currentValue-priorValue)/priorValue:0;
    return {...m,currentValue,priorValue,delta}
  }),deltas=raw.map(x=>x.delta);
  return raw.map(x=>({...x,momentum:minMax(x.delta,deltas,true)}))
}
function preseasonProjectionRows(bundle){
  // Offseason Power Rankings: 30% prior last-five scoring average,
  // 50% current team value, 10% prior ladder, 10% prior last-three scoring average.
  const rosterRows=currentRosterProjectionProfiles(bundle),formRows=priorSeasonFormRows(bundle),rosterBy=Object.fromEntries(rosterRows.map(x=>[String(x.id),x])),formBy=Object.fromEntries(formRows.map(x=>[String(x.id),x]));
  return [...state.managers.values()].map(team=>{
    const roster=rosterBy[String(team.id)],prior=formBy[String(team.id)],teamValue=Number(roster?.rosterStrength??.5),last5Score=Number(prior?.last5Score??.5),last3Score=Number(prior?.last3Score??.5),ladder=Number(prior?.ladder??.5),score=last5Score*.30+teamValue*.50+ladder*.10+last3Score*.10;
    return {...team,wins:0,games:0,pts:0,form:last3Score,avg3:prior?.last3Average??0,avg5:prior?.last5Average??0,ladder,streak:0,score,projection:true,powerModel:'offseason',projectionSeason:String(prior?.projectionSeason||previousCompletedBundle(bundle)?.league?.season||''),priorStandingRank:prior?.standingRank||null,priorLast5Wins:prior?.last5Wins??0,priorLast5Games:prior?.last5Games??0,priorLast3Games:prior?.last3Games??0,teamValue,last5Score,last3Score,rosterStrength:teamValue,standingRank:prior?.standingRank||0}
  }).sort((a,b)=>b.score-a.score||b.teamValue-a.teamValue||a.name.localeCompare(b.name)).map((x,i)=>({...x,rank:i+1,standingRank:x.priorStandingRank||i+1}))
}
function seasonQualityRows(bundle,throughWeek=Infinity){
  const standings=standingsTable(bundle,throughWeek),outcomes=outcomesForBundle(bundle,throughWeek),byWeek={};
  standings.forEach(team=>{
    const games=outcomes[team.sourceId]||outcomes[team.id]||[];
    games.forEach(game=>{(byWeek[String(game.week)]??=[]).push({id:String(team.id),points:Number(game.points)||0})})
  });
  const allPlay={};standings.forEach(team=>allPlay[String(team.id)]={earned:0,possible:0});
  Object.values(byWeek).forEach(rows=>rows.forEach(row=>{
    const others=rows.filter(x=>x.id!==row.id);if(!others.length)return;
    const lower=others.filter(x=>row.points>x.points).length,equal=others.filter(x=>row.points===x.points).length;
    allPlay[row.id].earned+=(lower+equal*.5)/others.length;allPlay[row.id].possible+=1
  }));
  const totals=standings.map(x=>Number(x.pts)||0);
  return standings.map(team=>{
    const rec=allPlay[String(team.id)]||{earned:0,possible:0},allPlayRate=rec.possible?rec.earned/rec.possible:.5,totalPointsNorm=minMax(Number(team.pts)||0,totals,true),quality=totalPointsNorm*.50+allPlayRate*.50;
    return {...team,allPlayRate,totalPointsNorm,quality}
  })
}
function preseasonOddsScoreRows(bundle){
  // Offseason Championship Odds: 40% prior last-five scoring average,
  // 40% current team value, 10% prior ladder, 10% prior last-three scoring average.
  const rosterRows=currentRosterProjectionProfiles(bundle),formRows=priorSeasonFormRows(bundle),rosterBy=Object.fromEntries(rosterRows.map(x=>[String(x.id),x])),formBy=Object.fromEntries(formRows.map(x=>[String(x.id),x]));
  return [...state.managers.values()].map(team=>{
    const roster=rosterBy[String(team.id)],prior=formBy[String(team.id)],teamValue=Number(roster?.rosterStrength??.5),last5Score=Number(prior?.last5Score??.5),last3Score=Number(prior?.last3Score??.5),ladder=Number(prior?.ladder??.5),score=last5Score*.40+teamValue*.40+ladder*.10+last3Score*.10;
    return {...team,score,teamValue,last5Score,last3Score,ladder,standingRank:prior?.standingRank||0,avg5:prior?.last5Average??0,avg3:prior?.last3Average??0,form:last3Score,streak:0,oddsModel:'offseason',projectionSeason:String(prior?.projectionSeason||previousCompletedBundle(bundle)?.league?.season||'')}
  }).sort((a,b)=>b.score-a.score||b.teamValue-a.teamValue||a.name.localeCompare(b.name)).map((x,i)=>({...x,rank:i+1}))
}
function liveChampionshipScoreRows(bundle,throughWeek=Infinity){
  // In-season Championship Odds: 40% last-five scoring average,
  // 30% current team value, 20% current ladder, 10% last-three scoring average.
  const standings=standingsTable(bundle,throughWeek),outcomes=outcomesForBundle(bundle,throughWeek),rosterRows=currentRosterProjectionProfiles(bundle),teamCount=Math.max(1,standings.length),rosterBy=Object.fromEntries(rosterRows.map(x=>[String(x.id),x]));
  const raw=standings.map(team=>{
    const games=outcomes[team.sourceId]||outcomes[team.id]||[],last5=games.slice(-5),last3=games.slice(-3),avg5=last5.length?last5.reduce((s,g)=>s+g.points,0)/last5.length:0,avg3=last3.length?last3.reduce((s,g)=>s+g.points,0)/last3.length:0,ladder=teamCount===1?1:1-(team.standingRank-1)/(teamCount-1),teamValue=Number(rosterBy[String(team.id)]?.rosterStrength??.5);
    return {...team,gamesList:games,avg5,avg3,ladder,teamValue}
  }),avg5s=raw.map(x=>x.avg5),avg3s=raw.map(x=>x.avg3);
  return raw.map(team=>{
    const last5Score=minMax(team.avg5,avg5s,true),last3Score=minMax(team.avg3,avg3s,true),score=last5Score*.40+team.teamValue*.30+team.ladder*.20+last3Score*.10;
    return {...team,score,last5Score,last3Score,form:last3Score,streak:winningStreak(team.gamesList),oddsModel:'in-season'}
  }).sort((a,b)=>b.score-a.score||b.avg5-a.avg5||a.name.localeCompare(b.name)).map((x,i)=>({...x,rank:i+1}))
}
function currentSeasonLuckContext(){
  const current=currentLeagueBundle(),weeks=meaningfulWeeks(current),through=weeks.at(-1)||Infinity;
  return {bundle:current,weeks,through,ratings:weeks.length?leagueLuckRatings(current,through):{}};
}
function powerRowsForDisplay(){
  const current=currentLeagueBundle(),weeks=meaningfulWeeks(current),through=weeks.at(-1)||Infinity;
  return {bundle:current,weeks,through,rows:weeks.length?modelRows(current,through,"power"):preseasonProjectionRows(current),isOffseason:weeks.length===0};
}
function priceRowsForBundle(bundle,through){
  const isCurrent=String(bundle.league?.league_id)===CONFIG.currentLeagueId,weeks=meaningfulWeeks(bundle),weekCount=weeks.filter(w=>through===Infinity||w<=through).length;
  let rows;
  if(isCurrent&&weekCount===0)rows=preseasonOddsScoreRows(bundle);
  else if(isCurrent&&weekCount<4){
    const live=liveChampionshipScoreRows(bundle,through),pre=Object.fromEntries(preseasonOddsScoreRows(bundle).map(x=>[String(x.id),x])),preseasonWeight=({1:.30,2:.20,3:.10}[weekCount]||0);
    rows=live.map(x=>({...x,score:x.score*(1-preseasonWeight)+(pre[String(x.id)]?.score??.5)*preseasonWeight,preseasonWeight,liveWeight:1-preseasonWeight,oddsModel:'blended'})).sort((a,b)=>b.score-a.score||b.seasonQuality-a.seasonQuality||a.name.localeCompare(b.name)).map((x,i)=>({...x,rank:i+1}))
  }else rows=liveChampionshipScoreRows(bundle,through);
  const strengths=rows.map(x=>Math.pow(CONFIG.oddsBaseline+(1-CONFIG.oddsBaseline)*Math.max(0,Math.min(1,x.score)),CONFIG.oddsExponent)),sum=strengths.reduce((a,b)=>a+b,0)||1;
  return rows.map((x,i)=>{const fair=strengths[i]/sum,market=Math.min(.99,fair*CONFIG.bookmakerMargin),odds=roundFive(Math.min(CONFIG.maxDisplayedOdds,Math.max(1.01,1/market)));return {...x,odds,probability:fair,eliminated:false}})
}
function championshipOddsLabel(row){return row?.eliminated?'0%':row?.odds!=null?`$${Number(row.odds).toFixed(2)}`:'—'}
function managerPowerTrend(managerId){const bundle=activeTrendBundle(),weeks=meaningfulWeeks(bundle),outcomes=outcomesForBundle(bundle);return weeks.map(week=>{const row=modelRows(bundle,week,"power").find(x=>String(x.id)===String(managerId)),odds=priceRowsForBundle(bundle,week).find(x=>String(x.id)===String(managerId)),games=(outcomes[String(managerId)]||[]).filter(g=>g.week<=week),weekGame=games.find(g=>g.week===week),wins=games.reduce((sum,g)=>sum+g.result,0);return row?{week,rank:row.rank,odds:odds?.odds??null,oddsLabel:odds?championshipOddsLabel(odds):'Unavailable',wins,games:games.length,score:weekGame?.points??null,season:String(bundle.league?.season||'')}:null}).filter(Boolean)}
function powerTrendHTML(managerId){const rows=managerPowerTrend(managerId);if(!rows.length)return '<div class="profile-empty">Power-ranking history will appear once the season begins.</div>';const width=760,height=210,padX=42,padY=24,maxRank=Math.max(state.managers.size,...rows.map(x=>x.rank)),x=i=>rows.length===1?width/2:padX+i*(width-padX*2)/(rows.length-1),y=rank=>padY+(rank-1)*(height-padY*2)/Math.max(1,maxRank-1),points=rows.map((r,i)=>`${x(i).toFixed(1)},${y(r.rank).toFixed(1)}`).join(' '),dots=rows.map((r,i)=>`<circle class="spark-point" tabindex="0" cx="${x(i)}" cy="${y(r.rank)}" r="6" data-week="${r.week}" data-rank="${r.rank}" data-record="${r.wins}-${r.games-r.wins}" data-score="${r.score==null?'Unavailable':Number(r.score).toFixed(1)}" data-odds="${r.oddsLabel||'Unavailable'}"></circle>`).join(''),labels=rows.map((r,i)=>`<text x="${x(i)}" y="${height-5}" text-anchor="middle">W${r.week}</text>`).join(''),last=rows.at(-1),currentBundle=state.bundles.find(b=>String(b.league?.league_id)===CONFIG.currentLeagueId),isCurrent=currentBundle&&String(currentBundle.league?.season)===last.season&&meaningfulWeeks(currentBundle).length>0,endLabel=isCurrent?'Current':'Finished',movement=rows[0].rank-last.rank;return `<div class="profile-sparkline-wrap" data-season="${esc(last.season)}"><div class="sparkline-season-label">${esc(last.season)} POWER RANKING JOURNEY</div><div class="sparkline-chart"><svg class="profile-sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="Week-on-week power ranking"><line x1="${padX}" y1="${padY}" x2="${padX}" y2="${height-padY}"/><line x1="${padX}" y1="${height-padY}" x2="${width-padX}" y2="${height-padY}"/><text x="8" y="${padY+5}">#1</text><text x="8" y="${height-padY+5}">#${maxRank}</text><polyline points="${points}"/>${dots}${labels}</svg><div class="sparkline-tooltip" aria-hidden="true"></div></div><div class="profile-sparkline-summary"><span>Started: #${rows[0].rank}</span><strong>${movement>0?'▲ '+movement:movement<0?'▼ '+Math.abs(movement):'—'} </strong><span>${endLabel}: #${last.rank}</span></div></div>`}
function bindSparklineTooltips(root=document){root.querySelectorAll('.sparkline-chart').forEach(chart=>{const tip=chart.querySelector('.sparkline-tooltip');chart.querySelectorAll('.spark-point').forEach(point=>{const show=()=>{tip.innerHTML=`<strong>Week ${esc(point.dataset.week)}</strong><span>Power Rank <b>#${esc(point.dataset.rank)}</b></span><span>Record <b>${esc(point.dataset.record)}</b></span><span>Weekly Score <b>${esc(point.dataset.score)}</b></span><span>Championship Odds <b>${esc(point.dataset.odds)}</b></span>`;const svg=chart.querySelector('svg'),box=svg.getBoundingClientRect(),cx=Number(point.getAttribute('cx'))/760*box.width,cy=Number(point.getAttribute('cy'))/210*box.height;tip.style.left=`${Math.max(8,Math.min(box.width-170,cx-75))}px`;tip.style.top=`${Math.max(8,cy-128)}px`;tip.classList.add('show');tip.setAttribute('aria-hidden','false')},hide=()=>{tip.classList.remove('show');tip.setAttribute('aria-hidden','true')};point.addEventListener('mouseenter',show);point.addEventListener('focus',show);point.addEventListener('mouseleave',hide);point.addEventListener('blur',hide);point.addEventListener('click',e=>{e.stopPropagation();show()})});chart.addEventListener('click',e=>{if(!e.target.classList.contains('spark-point'))tip.classList.remove('show')})})}
function latestCurrentLeagueTrade(){return state.trades.find(t=>String(t.league_id)===String(CONFIG.currentLeagueId))||state.trades[0]||null}
function oddsSnapshotRows(){const weeks=meaningfulWeeks(state.modelBundle),through=weeks.at(-1)||Infinity;return priceRows(through)}
function readStoredJSON(key){try{return JSON.parse(localStorage.getItem(key)||"null")}catch{return null}}
function prepareOddsMovement(){
  if(!verifiedMarketInputsReady())return;
  const rows=oddsSnapshotRows(),currentOdds=Object.fromEntries(rows.map(row=>[String(row.id),Number(row.odds)])),existing=readStoredJSON("imoOddsMovementV4")||{changes:{}},previous=readStoredJSON("imoOddsSnapshotV4"),changes={...(existing?.changes||{})};
  const weeks=meaningfulWeeks(state.modelBundle),priorWeek=weeks.length>1?weeks.at(-2):null,priorWeekOdds=priorWeek==null?{}:Object.fromEntries(priceRows(priorWeek).map(row=>[String(row.id),Number(row.odds)]));
  Object.entries(currentOdds).forEach(([id,current])=>{
    const previousRaw=previous?.odds?.[id],snapshotOdds=Number(previousRaw&&typeof previousRaw==='object'?previousRaw.odds:previousRaw),stored=changes[id],storedNew=Number(stored?.newOdds),weekOdds=Number(priorWeekOdds[id]);
    if(Number.isFinite(snapshotOdds)&&Math.abs(current-snapshotOdds)>=.001)changes[id]={oldOdds:snapshotOdds,newOdds:current,changedAt:Date.now()};
    else if(Number.isFinite(storedNew)&&Math.abs(current-storedNew)>=.001)changes[id]={oldOdds:storedNew,newOdds:current,changedAt:Date.now()};
    else if(!(Number.isFinite(Number(stored?.oldOdds))&&Number.isFinite(storedNew)&&Math.abs(storedNew-Number(stored.oldOdds))>=.001)){
      if(Number.isFinite(weekOdds)&&Math.abs(current-weekOdds)>=.001)changes[id]={oldOdds:weekOdds,newOdds:current,changedAt:Date.now(),source:'previous-week'};
      else changes[id]={oldOdds:null,newOdds:current,opening:true,changedAt:Number(stored?.changedAt)||Date.now()};
    }
  });
  state.oddsMovement={changes};
  try{localStorage.setItem("imoOddsMovementV4",JSON.stringify(state.oddsMovement));localStorage.setItem("imoOddsSnapshotV4",JSON.stringify({savedAt:Date.now(),odds:currentOdds}))}catch(_){ }
}
function renderPower(){
  if(!state.marketReady&&!verifiedMarketInputsReady()){renderVerifiedMarketFallback();return}
  state.marketReady=true;
  const display=powerRowsForDisplay(),p=display.rows,through=display.through,isOffseason=display.isOffseason;
  const priced=priceRows(through),oddsById=Object.fromEntries(priced.map(x=>[String(x.id),x]));
  const weeks=display.weeks,prior=weeks.length>1?weeks.at(-2):through,oldOdds=Object.fromEntries(priceRows(prior).map(x=>[String(x.id),x]));
  const n=Math.max(p.length-1,1),favouriteId=String([...priced].filter(x=>!x.eliminated).sort((a,b)=>a.odds-b.odds)[0]?.id||"");
  const bottomFour=p.slice(-4),smokeyPool=bottomFour.filter(x=>String(x.id)!==favouriteId),smokeyId=String([...smokeyPool].sort((a,b)=>((Number(b.avg3)||0)-(Number(b.avg5)||0))-((Number(a.avg3)||0)-(Number(a.avg5)||0))||recentThreePointAverage(b.id,display.bundle,through)-recentThreePointAverage(a.id,display.bundle,through))[0]?.id||"");
  const luckContext=currentSeasonLuckContext();
  $("powerRankings").classList.remove("loading");
  $("powerRankings").innerHTML=p.map((x,i)=>{
    const oldRank=state.previousPowerRanks[x.id]??x.rank,diff=oldRank-x.rank,arrow=diff>0?`<span class="movement up">▲ ${diff}</span>`:diff<0?`<span class="movement down">▼ ${Math.abs(diff)}</span>`:`<span class="movement flat">—</span>`;
    const hue=140-(140*i/n),m=state.managers.get(String(x.id)),avatar=m?.avatar?`<img src="${esc(m.avatar)}" alt="" loading="lazy">`:`<span>${esc(m?.initials||x.name.slice(0,2).toUpperCase())}</span>`,o=oddsById[String(x.id)]||x;
    const priceMove=state.oddsMovement?.changes?.[String(x.id)],prev=Number(priceMove?.oldOdds),current=Number(priceMove?.newOdds??o.odds),hasMovement=Number.isFinite(prev)&&Number.isFinite(current)&&Math.abs(current-prev)>=.001,delta=hasMovement?current-prev:0,oddsClass=delta<0?'up':delta>0?'down':'flat',moveText=hasMovement?`$${prev.toFixed(2)} → $${current.toFixed(2)}`:`Opening price $${Number(o.odds).toFixed(2)}`;
    const ladderMove=(oldOdds[String(x.id)]?.standingRank||o.standingRank)-o.standingRank;
    const ladderText=isOffseason?(x.priorStandingRank?`Finished ${ordinal(x.priorStandingRank)} in ${x.projectionSeason}`:'Offseason roster projection'):ladderMove>0?`Moved up to ${ordinal(o.standingRank)} on ladder`:ladderMove<0?`Dropped to ${ordinal(o.standingRank)} on ladder`:`Currently ${ordinal(o.standingRank)} on ladder`;
    const finalGames=Number(x.priorLast5Games||5),finalWins=Number(x.priorLast5Wins||0),winLabel=Number.isInteger(finalWins)?String(finalWins):finalWins.toFixed(1);
    const streak=isOffseason?`Won ${winLabel} of final ${finalGames} in ${x.projectionSeason||'last season'}`:o.streak>=1?`Won last ${o.streak}`:`Form: ${Math.round(o.form*3)} wins from last 3`;
    const scoringText=isOffseason?`Averaged ${Number(x.avg5||0).toFixed(1)} over final ${finalGames}`:`Averaging ${Number(o.avg5||0).toFixed(1)} over last five games`;
    const luck=Number(luckContext.ratings?.[String(x.id)]||0),luckText=luckContext.weeks.length?`${luck>=0?'+':''}${luck.toFixed(1)} wins vs expected`:`${String(luckContext.bundle?.league?.season||'Current')} season not started`;
    const tag=String(x.id)===favouriteId?'<span class="market-tag favourite-tag">Favourite</span>':String(x.id)===smokeyId?'<span class="market-tag smokey-tag">Smokey</span>':'';
    return `<details class="power-odds-row ${x.rank===1?'featured-number-one':''}" style="--rank-colour:hsl(${hue} 85% 52%)"><summary><b class="power-rank-number">${x.rank}</b><span class="power-avatar">${avatar}</span><span class="power-copy"><button class="power-name manager-profile-link" type="button" data-manager-id="${esc(x.id)}">${esc(x.name)}</button><small>View manager profile</small></span><span class="power-market-stack"><span class="power-odds-price">${championshipOddsLabel(o)}</span>${tag}</span>${arrow}<span class="power-chevron">⌄</span></summary><div class="power-detail"><div>${isOffseason?'🗓️':'✅'} ${streak}</div><div>${isOffseason?'📊':'🔥'} ${scoringText}</div><div>${isOffseason?'🏁':ladderMove<0?'⬇':'⬆'} ${ladderText}</div><div class="odds-move ${oddsClass}">${moveText}</div><div class="luck-rating ${luckContext.weeks.length?(luck>0.5?'lucky':luck<-0.5?'unlucky':'neutral'):'neutral'}">🍀 Luck rating: ${luckText}</div></div></details>`;
  }).join("");
  markPowerMarketState("live");
  persistVerifiedMarketHTML();
}
function roundFive(x){return Math.round(x*20)/20}
function priceRows(through){const current=state.bundles.find(b=>String(b.league?.league_id)===CONFIG.currentLeagueId);return priceRowsForBundle(current||state.modelBundle,through)}
function renderOdds(){}
function ordinal(n){const s=['th','st','nd','rd'],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0])}
function featuredTradeOfWeek(){
  const currentLeagueTrades=state.trades.filter(t=>String(t.league_id)===String(CONFIG.currentLeagueId));
  return currentLeagueTrades.find(t=>tradeValue(t)>=25)||state.trades.find(t=>tradeValue(t)>=25)||null;
}
function sameTrade(a,b){
  if(!a||!b)return false;
  const aId=String(a.transaction_id||''),bId=String(b.transaction_id||'');
  if(aId&&bId)return aId===bId;
  return Number(a.created||0)===Number(b.created||0)&&String(a.league_id||'')===String(b.league_id||'');
}
function renderTradeWeek(){
  const t=featuredTradeOfWeek(),target=$("tradeOfWeek");if(!target)return;
  if(!t){target.classList.remove("loading");target.innerHTML='<div class="block-empty">No featured trade is available yet.</div>';return}
  const featuredGrades=Object.fromEntries(tradeGrades(t).map(g=>[String(g.id),g])),sides=Object.entries(tradeAssets(t)).slice(0,3),sideCount=Math.max(1,sides.length);
  const cards=sides.map(([mid,assets])=>{const g=featuredGrades[String(mid)];return `<div class="trade-side-v2">${g?`<span class="featured-trade-grade ${gradeClass(g.grade)}">${esc(g.grade)}</span>`:''}<strong>${esc(managerName(mid,t))} receives</strong>${assets.length?assets.map(a=>`<div class="asset-row"><span>${tradeAssetLinkHTML(a,'featured-trade-asset-link')}${a.owner?`<small class="asset-owner">Originally ${esc(a.owner)}'s pick</small>`:''}</span></div>`).join(""):'<div class="asset-row"><span>No listed assets</span></div>'}</div>`}).join('');
  target.classList.remove("loading");target.innerHTML=`<div class="trade-feature-v2 trade-feature-${sideCount}-team"><div class="trade-feature-sides">${cards}</div>${tradeEditorialHTML(t)}<div class="trade-foot-v2"><span>Featured trade</span><strong>${fmt(t.created)}</strong></div></div>`
}
function allPartnerPairs(){const teams=[...state.managers.values()],mat={};state.trades.forEach(t=>{const ids=mids(t);for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const k=[ids[i],ids[j]].sort().join('|');mat[k]=(mat[k]||0)+1}});const pairs=[];for(let i=0;i<teams.length;i++)for(let j=i+1;j<teams.length;j++){const a=teams[i],b=teams[j],count=mat[[a.id,b.id].sort().join('|')]||0;if(count)pairs.push({a,b,count})}return pairs.sort((a,b)=>b.count-a.count||a.a.name.localeCompare(b.a.name))}
function mostRecentPartnerTrade(a,b){return state.trades.find(t=>{const ids=mids(t);return ids.includes(String(a))&&ids.includes(String(b))})||null}
function renderHeatmap(){
  const target=$("tradeHeatmap");
  if(!target)return;
  const pairs=allPartnerPairs().slice(0,5);
  target.classList.remove("loading");
  if(!pairs.length){target.innerHTML='<div class="block-empty">No trade partnerships found.</div>';return}
  target.innerHTML=`<div class="partner-list-compact">${pairs.map((p,i)=>`<div class="partner-row-compact"><span class="partner-rank">${i+1}</span><span class="partner-team-pair"><button type="button" class="compact-manager-link manager-profile-link" data-manager-id="${esc(p.a.id)}">${esc(p.a.name)}</button><span class="partner-arrow">↔</span><button type="button" class="compact-manager-link manager-profile-link" data-manager-id="${esc(p.b.id)}">${esc(p.b.name)}</button></span><strong class="partner-count-compact">${p.count} ${p.count===1?'trade':'trades'}</strong></div>`).join("")}</div>`;
}
function renderBlock(){const moved={};state.trades.forEach(t=>Object.keys(t.adds||{}).forEach(id=>moved[id]=(moved[id]||0)+1));const rows=Object.entries(moved).sort((a,b)=>b[1]-a[1]).slice(0,5);$("tradeBlock").classList.remove("loading");$("tradeBlock").innerHTML=rows.length?rows.map(([id,n],i)=>`<div class="rank-item"><b>${i+1}</b><div><strong>${playerLink(id,playerName(id))}</strong><div class="meta">Most traded player of all time</div></div><span class="power-score">${n}x</span></div>`).join(""):'<div class="block-empty">No player movement yet.</div>'}

function allLeagueTransactions(){
  const unique=new Map();
  state.bundles.forEach(bundle=>(bundle.transactions||[]).forEach(t=>{
    const key=`${bundle.league?.league_id||t.league_id||'league'}|${t.transaction_id||`${t.created||0}-${t.week||0}-${t.type||'move'}`}`;
    if(!unique.has(key))unique.set(key,{...t,league_id:t.league_id||bundle.league?.league_id,season_label:t.season_label||`${bundle.league?.season||''} season`});
  }));
  return [...unique.values()]
}
function renderWaivedBlock(){
  const target=$("waiverBlock");if(!target)return;
  const counts={};
  allLeagueTransactions().filter(t=>['waiver','free_agent'].includes(String(t.type||''))&&(!t.status||t.status==='complete')).forEach(t=>{
    Object.keys(t.drops||{}).forEach(id=>{if(id&&id!=='0')counts[String(id)]=(counts[String(id)]||0)+1});
  });
  const rows=Object.entries(counts).sort((a,b)=>b[1]-a[1]||playerName(a[0]).localeCompare(playerName(b[0]))).slice(0,5);
  target.classList.remove("loading");
  target.innerHTML=rows.length?rows.map(([id,n],i)=>`<div class="rank-item waiver-rank-item"><b>${i+1}</b><div><strong>${playerLink(id,playerName(id))}</strong><div class="meta">${n===1?'Waived once':`Waived ${n} times`} across loaded league history</div></div><span class="power-score">${n}x</span></div>`).join(""):'<div class="block-empty">No completed waiver drops found.</div>'
}
function currentLeagueBundle(){return state.bundles.find(b=>String(b.league?.league_id)===CONFIG.currentLeagueId)||state.bundles[0]||null}
function groupedMatchupsForWeek(bundle,week){
  const groups={};
  (bundle?.matchups||[]).filter(row=>Number(row.week)===Number(week)&&row.matchup_id!=null).forEach(row=>(groups[String(row.matchup_id)]??=[]).push(row));
  return Object.values(groups).filter(group=>group.length>=2).map(group=>group.slice(0,2))
}
function resolveHeadToHeadWeek(bundle){
  if(!bundle)return 1;
  const leagueSeason=String(bundle.league?.season||''),sportSeason=String(state.sportState?.season||''),sportWeek=Number(state.sportState?.week),leagueWeek=Number(bundle.league?.settings?.leg||bundle.league?.settings?.week);
  if(sportSeason===leagueSeason&&Number.isFinite(sportWeek)&&sportWeek>0)return sportWeek;
  if(Number.isFinite(leagueWeek)&&leagueWeek>0)return leagueWeek;
  const allWeeks=[...new Set((bundle.matchups||[]).filter(x=>x.matchup_id!=null).map(x=>Number(x.week)).filter(Number.isFinite))].sort((a,b)=>a-b);
  const completed=meaningfulWeeks(bundle),lastCompleted=completed.at(-1)||0;
  return allWeeks.find(w=>w>lastCompleted)||lastCompleted||allWeeks[0]||1
}
function managerWeeklyScores(bundle,managerId,beforeWeek=Infinity){
  const id=String(managerId),rows=[];
  (bundle?.matchups||[]).forEach(row=>{
    if(Number(row.week)>=Number(beforeWeek))return;
    if(String(bundle.ownerByRoster?.[String(row.roster_id)]||'')!==id)return;
    const points=Number(row.points);if(Number.isFinite(points)&&points>0)rows.push({week:Number(row.week),points});
  });
  return rows.sort((a,b)=>a.week-b.week)
}
function meanNumber(values){const nums=values.map(Number).filter(Number.isFinite);return nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:0}
function managerPreGameProjection(managerId,bundle,week){
  let rows=managerWeeklyScores(bundle,managerId,week);
  if(!rows.length&&state.modelBundle&&state.modelBundle!==bundle)rows=managerWeeklyScores(state.modelBundle,managerId,Infinity);
  const scores=rows.map(x=>x.points),weeklyProjection=meanNumber(scores.slice(-5))||meanNumber(scores)||220,last3=meanNumber(scores.slice(-3))||weeklyProjection;
  return Math.max(1,.80*weeklyProjection+.20*last3)
}
function gameWeekProgress(){
  const now=new Date(),day=now.getDay(),daysSinceTuesday=(day-2+7)%7,fraction=(daysSinceTuesday+(now.getHours()+now.getMinutes()/60)/24)/7;
  return Math.max(.03,Math.min(.97,fraction))
}
function liveWeightedProjection(current,pregame){
  const progress=gameWeekProgress(),expectedSoFar=Math.max(1,pregame*progress),pace=Math.max(.65,Math.min(1.45,current/expectedSoFar||1)),remaining=pregame*(1-progress)*pace;
  return Math.max(current,current+remaining)
}
function roundOdds05(value){if(!Number.isFinite(value)||value<=0)return 2;return Math.max(1.05,Math.min(51,Math.round(value/.05)*.05))}
function matchupOdds(a,b){
  const total=Math.max(.001,a+b),baseA=Math.max(.001,Math.min(.999,a/total)),baseB=1-baseA;
  // Add 15% market separation, then apply a 5% two-way house margin.
  const weightA=Math.pow(baseA,1.15),weightB=Math.pow(baseB,1.15),pa=weightA/(weightA+weightB),pb=1-pa,marketPa=Math.min(.999,pa*CONFIG.h2hHouseMargin),marketPb=Math.min(.999,pb*CONFIG.h2hHouseMargin);
  return{a:roundOdds05(1/Math.max(.001,marketPa)),b:roundOdds05(1/Math.max(.001,marketPb)),pa,pb,marketPa,marketPb}
}
function managerFormBadges(managerId,bundle,beforeWeek){
  let games=(outcomesForBundle(bundle,Number(beforeWeek)-1)[String(managerId)]||[]);
  if(!games.length&&state.modelBundle&&state.modelBundle!==bundle)games=(outcomesForBundle(state.modelBundle)[String(managerId)]||[]);
  return games.slice(-3).map(g=>g.result===1?'W':g.result===0?'L':'D')
}
function rivalryRecord(managerA,managerB){
  const a=String(managerA),b=String(managerB),record={a:0,b:0,d:0};
  state.bundles.forEach(bundle=>{
    const groups={};(bundle.matchups||[]).filter(row=>Number(row.points)>0&&row.matchup_id!=null).forEach(row=>{const key=`${row.week}|${row.matchup_id}`;(groups[key]??=[]).push(row)});
    Object.values(groups).forEach(group=>{
      const rowA=group.find(row=>String(bundle.ownerByRoster?.[String(row.roster_id)]||'')===a),rowB=group.find(row=>String(bundle.ownerByRoster?.[String(row.roster_id)]||'')===b);
      if(!rowA||!rowB)return;const pa=Number(rowA.points),pb=Number(rowB.points);if(!Number.isFinite(pa)||!Number.isFinite(pb)||(pa===0&&pb===0))return;
      if(pa>pb)record.a++;else if(pb>pa)record.b++;else record.d++;
    });
  });
  return record
}
function rivalryLabel(managerA,managerB){
  const r=rivalryRecord(managerA,managerB),nameA=managerName(managerA),nameB=managerName(managerB);
  if(r.a===r.b)return `Series tied ${r.a}–${r.b}${r.d?` · ${r.d} draw${r.d===1?'':'s'}`:''}`;
  const leader=r.a>r.b?nameA:nameB,wins=Math.max(r.a,r.b),losses=Math.min(r.a,r.b);
  return `${leader} leads ${wins}–${losses} all-time${r.d?` · ${r.d} draw${r.d===1?'':'s'}`:''}`
}
function h2hPlayerLastFiveAverage(playerId,bundle){
  const id=String(playerId),scores=[];
  (bundle?.matchups||[]).forEach(row=>{const value=Number(row?.players_points?.[id]);if(Number.isFinite(value)&&value>0)scores.push({week:Number(row.week)||0,value})});
  scores.sort((a,b)=>a.week-b.week);const last=scores.slice(-5).map(x=>x.value);
  if(last.length)return last.reduce((a,b)=>a+b,0)/last.length;
  const season=String(bundle?.league?.season||h2hAverageSeason()),seasonAvg=Number(seasonAverageMap(season)?.[id]||0);
  if(seasonAvg>0)return seasonAvg;
  return Number(seasonAverageMap(h2hAverageSeason())?.[id]||latestKnownAverage(id)||0)
}
function keyMatchupPlayer(managerId,row){
  const bundle=currentLeagueBundle(),rosterIds=(state.managers.get(String(managerId))?.roster?.players||[]).map(String);
  const ranked=rosterIds.map(id=>({id,name:playerName(id),recentAvg:h2hPlayerLastFiveAverage(id,bundle)})).filter(x=>x.recentAvg>0).sort((a,b)=>b.recentAvg-a.recentAvg);
  const fallback=managerRosterPlayers(managerId,String(bundle?.league?.season||'2026'))[0]||managerRosterPlayers(managerId,'2025')[0]||null;
  const chosen=ranked[0]||fallback;if(!chosen)return null;
  const id=String(chosen.id),recentAvg=Number(chosen.recentAvg??chosen.avg??0),live=Number(row?.players_points?.[id]||0),player=state.players[id]||{},positions=[...(player.fantasy_positions||[]),player.position].filter(Boolean).map(String);
  return{id,name:chosen.name||playerName(id),recentAvg,live,position:positions[0]||chosen.position||'',positions,avatar:`https://sleepercdn.com/content/nba/players/${id}.jpg`}
}
function h2hManagerAvatar(managerId){
  const manager=state.managers.get(String(managerId));return manager?.avatar?`<img src="${esc(manager.avatar)}" alt="" loading="lazy">`:`<span>${esc(manager?.initials||'—')}</span>`
}
function h2hFormHTML(form){return `<span class="h2h-form-badges">${form.length?form.map(x=>`<i class="${x==='W'?'win':x==='L'?'loss':'draw'}">${x}</i>`).join(''):'<small>No form</small>'}</span>`}
function h2hKeyPlayerHTML(player,isLive){
  if(!player)return '<div class="h2h-key-player empty">No player form available</div>';
  return `<div class="h2h-key-player"><span class="h2h-key-avatar"><img src="${esc(player.avatar)}" alt="" loading="lazy" onerror="this.style.display='none'"></span><div>${playerLink(player.id,player.name,'h2h-key-player-link')}<small>${player.recentAvg?`${player.recentAvg.toFixed(1)} avg · last 5`:'Current roster leader'}</small></div>${isLive?`<strong>${player.live.toFixed(1)}<small>LIVE</small></strong>`:''}</div>`
}
function h2hAverageSeason(){
  const current=currentLeagueBundle(),currentSeason=String(current?.league?.season||'2026');
  if(current&&meaningfulWeeks(current).length&&Object.values(seasonAverageMap(currentSeason)).some(v=>Number(v)>0))return currentSeason;
  const completed=[...state.bundles].filter(b=>meaningfulWeeks(b).length).sort((a,b)=>Number(b.league?.season)-Number(a.league?.season))[0];
  return String(completed?.league?.season||'2025')
}
function sleeperListsPlayerOut(playerId){
  const player=state.players[String(playerId)]||{},values=[player.injury_status,player.status,player.injuryStatus].map(v=>String(v||'').trim().toLowerCase());
  return values.some(v=>v==='out')
}
function h2hOutPlayers(managerId){
  const season=h2hAverageSeason();
  return managerRosterPlayers(managerId,season).filter(x=>Number(x.avg)>0).slice(0,5).filter(x=>sleeperListsPlayerOut(x.id)).map(x=>({id:String(x.id),name:x.name,avg:Number(x.avg)||0}))
}
function h2hNarrative(data){
  const {idA,idB,keyA,keyB,odds,injuriesA,injuriesB,formA,formB}=data,nameA=managerName(idA),nameB=managerName(idB),gap=Math.abs(odds.a-odds.b),aFav=odds.a<=odds.b,fav=aFav?nameA:nameB,dog=aFav?nameB:nameA,favOdds=aFav?odds.a:odds.b;
  const isCentre=p=>Array.isArray(p?.positions)&&p.positions.some(pos=>/^(c|center)$/i.test(String(pos).trim()));
  const bothBigs=isCentre(keyA)&&isCentre(keyB),bothGuards=[keyA,keyB].every(p=>Array.isArray(p?.positions)&&p.positions.some(pos=>/^(pg|sg|g|guard)$/i.test(String(pos).trim())));
  const tag=bothBigs?'Battle of the Bigs':bothGuards?'Guard Showdown':'Top Performers';
  let first;
  if(bothBigs&&keyA&&keyB)first=`${tag}: ${keyA.name} and ${keyB.name} headline a matchup built around true centre play.`;
  else if(gap<=.20)first=`${tag}: ${nameA} and ${nameB} enter the week with almost nothing separating their markets.`;
  else if(keyA&&keyB)first=`${tag}: ${fav} opens as the $${favOdds.toFixed(2)} favourite, with ${keyA.name} and ${keyB.name} shaping the key individual battle.`;
  else first=`${fav} enters as the favourite, but ${dog} remains close enough to turn this into a live underdog opportunity.`;
  const injuryRows=[...injuriesA.map(p=>`${p.name} (${nameA})`),...injuriesB.map(p=>`${p.name} (${nameB})`)];
  let second='';
  if(injuryRows.length)second=`The market also has to account for ${injuryRows.join(' and ')}, who ${injuryRows.length===1?'is':'are'} currently listed OUT.`;
  else if(formA.length&&formB.length){const aWins=formA.filter(x=>x==='W').length,bWins=formB.filter(x=>x==='W').length;if(aWins!==bWins)second=`Recent form leans toward ${aWins>bWins?nameA:nameB}, adding pressure to ${aWins>bWins?nameB:nameA} before the week begins.`}
  if(!second)second=`The all-time series currently reads: ${rivalryLabel(idA,idB)}.`;
  return `${first} ${second}`
}
function h2hMatchupDetailsHTML(data,mode,includeRecentForm=true){
  const {idA,idB,keyA,keyB,formA,formB,injuriesA,injuriesB,line,favouriteA}=data;
  return `<div class="h2h-preview"><span>MATCHUP PREVIEW</span><p>${esc(h2hNarrative(data))}</p></div>
    <div class="h2h-detail-grid">
      <div class="h2h-line"><span>Market line</span><strong>${esc(managerName(favouriteA?idA:idB))} −${line.toFixed(1)} <small>·</small> ${esc(managerName(favouriteA?idB:idA))} +${line.toFixed(1)}</strong></div>
      <div class="h2h-rivalry"><span>Rivalry record</span><strong>${esc(rivalryLabel(idA,idB))}</strong></div>
    </div>
    <div class="h2h-key-heading"><span>MAIN EVENT</span><small>Top last-five performer</small></div>
    <div class="h2h-main-event"><div class="h2h-main-event-player">${h2hKeyPlayerHTML(keyA,mode==='live')}</div><span class="h2h-main-event-vs">VS</span><div class="h2h-main-event-player right">${h2hKeyPlayerHTML(keyB,mode==='live')}</div></div>
    ${includeRecentForm?`<div class="h2h-expanded-form"><span>Recent form</span><div>${esc(managerName(idA))}${h2hFormHTML(formA)}</div><div>${esc(managerName(idB))}${h2hFormHTML(formB)}</div></div>`:''}`
}
function buildHeadToHeadMatchup(group,bundle,week,mode){
  const rowA=group[0],rowB=group[1],idA=String(bundle.ownerByRoster?.[String(rowA.roster_id)]||''),idB=String(bundle.ownerByRoster?.[String(rowB.roster_id)]||'');
  const currentA=Number(rowA.points)||0,currentB=Number(rowB.points)||0,preA=managerPreGameProjection(idA,bundle,week),preB=managerPreGameProjection(idB,bundle,week),finishA=mode==='live'?liveWeightedProjection(currentA,preA):preA,finishB=mode==='live'?liveWeightedProjection(currentB,preB):preB,odds=matchupOdds(finishA,finishB),difference=Math.abs(finishA-finishB),line=Math.floor(difference)+.5,favouriteA=finishA>=finishB;
  return{rowA,rowB,idA,idB,finishA,finishB,odds,line,favouriteA,keyA:keyMatchupPlayer(idA,rowA),keyB:keyMatchupPlayer(idB,rowB),formA:managerFormBadges(idA,bundle,week),formB:managerFormBadges(idB,bundle,week),injuriesA:h2hOutPlayers(idA),injuriesB:h2hOutPlayers(idB)}
}
function h2hFeaturedTeamHTML(managerId,odds,form,side){
  return `<div class="h2h-featured-team ${side}"><span class="h2h-featured-avatar">${h2hManagerAvatar(managerId)}</span><button type="button" class="manager-profile-link" data-manager-id="${esc(managerId)}">${esc(managerName(managerId))}</button><strong>$${odds.toFixed(2)}</strong>${h2hFormHTML(form)}</div>`
}
function h2hCompactTeamHTML(managerId,odds,form){
  return `<div class="h2h-compact-team"><span class="h2h-compact-avatar">${h2hManagerAvatar(managerId)}</span><strong>${esc(managerName(managerId))}</strong><em>$${odds.toFixed(2)}</em>${h2hFormHTML(form)}</div>`
}
function renderHeadToHead(){
  const target=$("headToHead");if(!target)return;
  const bundle=currentLeagueBundle();if(!bundle){target.classList.remove('loading');target.innerHTML='<div class="block-empty">Current league data unavailable.</div>';return}
  const week=resolveHeadToHeadWeek(bundle),groups=groupedMatchupsForWeek(bundle,week);
  if(!groups.length){target.classList.remove('loading');target.innerHTML=`<div class="h2h-empty"><strong>Week ${week} matchups are not available yet.</strong><small>The board will populate automatically when Sleeper publishes the gameweek.</small></div>`;return}
  const anyScore=groups.some(group=>group.some(row=>Number(row.points)>0)),mode=anyScore?'live':'upcoming';
  const status=$("headToHeadStatus");if(status){status.textContent=mode==='live'?`Week ${week} · Live`:`Week ${week} · Upcoming`;status.classList.toggle('live',mode==='live')}
  const matchups=groups.map(group=>buildHeadToHeadMatchup(group,bundle,week,mode)).sort((a,b)=>Math.abs(a.odds.a-a.odds.b)-Math.abs(b.odds.a-b.odds.b));
  const featured=matchups[0],others=matchups.slice(1);
  target.classList.remove('loading');
  target.innerHTML=`<article class="h2h-featured-card ${mode}">
      <div class="h2h-card-kicker"><span>${mode==='live'?'<i></i> LIVE MARKET':'MATCHUP OF THE WEEK'}</span><small>Week ${week}</small></div>
      <div class="h2h-featured-market">${h2hFeaturedTeamHTML(featured.idA,featured.odds.a,featured.formA,'left')}<div class="h2h-market-centre"><span>VS</span></div>${h2hFeaturedTeamHTML(featured.idB,featured.odds.b,featured.formB,'right')}</div>
      ${h2hMatchupDetailsHTML(featured,mode)}
    </article>
    ${others.length?`<div class="h2h-other-heading"><span>OTHER MATCHUPS</span><small>Tap a row to expand</small></div><div class="h2h-compact-list">${others.map((data,index)=>`<details class="h2h-compact-matchup ${mode}"><summary><div class="h2h-compact-pair">${h2hCompactTeamHTML(data.idA,data.odds.a,data.formA)}${h2hCompactTeamHTML(data.idB,data.odds.b,data.formB)}</div><span class="h2h-expand-mark">+</span></summary><div class="h2h-compact-details">${h2hMatchupDetailsHTML(data,mode,false)}</div></details>`).join('')}</div>`:''}
    <p class="h2h-method-note">Odds are the primary market view, include a 5% house margin, use a 15% probability separation for clearer favourites and underdogs, and use the latest matchup data loaded for the current session.</p>`
}
async function refreshHeadToHeadData(){
  if(state.h2hRefreshBusy||document.hidden)return;state.h2hRefreshBusy=true;
  try{
    const bundle=currentLeagueBundle();if(!bundle)return;
    const [league,sportState]=await Promise.all([getJSON(`${CONFIG.api}/league/${CONFIG.currentLeagueId}`,true),getJSON(`${CONFIG.api}/state/nba`,true)]);
    if(league){bundle.league=league;state.league=league}if(sportState)state.sportState=sportState;
    const week=resolveHeadToHeadWeek(bundle),rows=await getJSON(`${CONFIG.api}/league/${CONFIG.currentLeagueId}/matchups/${week}`,true);
    if(Array.isArray(rows)){bundle.matchups=(bundle.matchups||[]).filter(x=>Number(x.week)!==Number(week));bundle.matchups.push(...rows.map(x=>({...x,week})))}
    renderHeadToHead()
  }catch(error){console.warn('Head to head live refresh unavailable:',error)}
  finally{state.h2hRefreshBusy=false}
}
function setupHeadToHeadRefresh(){
  // V3.3.73: H2H no longer polls in the background. The current loaded matchup
  // data is rendered on demand, avoiding recurring network + render work.
  if(state.h2hRefreshTimer){clearInterval(state.h2hRefreshTimer);state.h2hRefreshTimer=null}
}

function gameDateValue(row){const raw=row?.date||row?.game_date||row?.gameDate||row?.start_time||row?.startTime||row?.timestamp;const d=raw?new Date(raw):null;return d&&!Number.isNaN(d.getTime())?d:null}
function fallbackSeasonFormRows(){
  const bundle=state.bundles.find(b=>String(b.league?.season)==="2025")||state.modelBundle;
  if(!bundle)return [];
  const playerScores={};
  matchupRows(bundle).forEach(row=>Object.entries(row.players_points||{}).forEach(([id,value])=>{
    const pts=Number(value);if(!Number.isFinite(pts)||pts<=0)return;
    (playerScores[id]??=[]).push({week:Number(row.week)||0,pts});
  }));
  return Object.entries(playerScores).map(([id,scores])=>{
    scores.sort((a,b)=>a.week-b.week);if(scores.length<5)return null;
    const all=scores.map(x=>x.pts),recent=all.slice(-5),priorAvg=all.reduce((a,b)=>a+b,0)/all.length,recentAvg=recent.reduce((a,b)=>a+b,0)/recent.length;
    return{id,name:playerName(id),priorAvg,recentAvg,change:recentAvg-priorAvg,sourceSeason:"2025",games:all.length};
  }).filter(Boolean)
}
function allGameLogFormRows(){
  const preferred=["2026","2025",String(state.modelBundle?.league?.season||"")].filter((v,i,a)=>v&&a.indexOf(v)===i);
  for(const season of preferred){
    const logs=state.gameLogs?.[season]||{},rows=[];
    Object.entries(logs).forEach(([id,games])=>{
      const played=(games||[]).map(row=>({row,date:gameDateValue(row),fpts:rawFantasyPoints(row,state.modelBundle?.league?.scoring_settings||{})})).filter(x=>x.date&&gameWasPlayed(x.row)&&Number.isFinite(x.fpts)).sort((a,b)=>a.date-b.date);
      if(played.length<5)return;
      const all=played.map(x=>x.fpts),recent=all.slice(-5),priorAvg=all.reduce((a,b)=>a+b,0)/all.length,recentAvg=recent.reduce((a,b)=>a+b,0)/recent.length;
      rows.push({id,name:playerName(id),priorAvg,recentAvg,change:recentAvg-priorAvg,sourceSeason:season,games:all.length});
    });
    if(rows.length)return rows;
  }
  return fallbackSeasonFormRows()
}
function recentPlayerForm(){const rows=allGameLogFormRows();return{poor:rows.filter(x=>x.priorAvg>=20&&x.recentAvg>0&&x.change<0).sort((a,b)=>a.change-b.change).slice(0,5),good:rows.filter(x=>x.priorAvg>=15&&x.recentAvg>0&&x.change>0).sort((a,b)=>b.change-a.change).slice(0,5)}}
function renderFormList(targetId,rows,positive){const target=$(targetId);target.classList.remove("loading");target.innerHTML=rows.length?rows.map((x,i)=>`<div class="rank-item form-player-row ${positive?'good-form-row':'poor-form-row'}"><b>${i+1}</b><div>${playerLink(x.id,x.name,"form-player-link")}<div class="meta">${x.priorAvg.toFixed(1)} season avg → ${x.recentAvg.toFixed(1)} last 5 games</div></div><span class="form-change ${positive?'positive':'negative'}">${x.change>0?'+':''}${x.change.toFixed(1)}</span></div>`).join(""):`<div class="block-empty">Individual regular-season game logs are still loading.</div>`}
function renderPlayerForm(){const form=recentPlayerForm();renderFormList("poorForm",form.poor,false);renderFormList("goodForm",form.good,true)}
function managerTradeCounts(trades){const c={};trades.forEach(t=>mids(t).forEach(id=>c[id]=(c[id]||0)+1));return c}
function topEntry(obj){return Object.entries(obj).sort((a,b)=>b[1]-a[1])[0]}
function highestTeamScore(bundles){let best=null;bundles.forEach(b=>b.matchups.forEach(m=>{const owner=b.ownerByRoster[String(m.roster_id)],pts=Number(m.points);if(owner&&Number.isFinite(pts)&&(!best||pts>best.pts))best={owner,pts,week:m.week,season:b.league.season}}));return best}
function highestPlayerScore(bundles){let best=null;bundles.forEach(b=>b.matchups.forEach(m=>Object.entries(m.players_points||{}).forEach(([id,v])=>{const pts=Number(v);if(Number.isFinite(pts)&&(!best||pts>best.pts))best={id,pts,week:m.week,season:b.league.season}})));return best}
function longestTradeDroughtSince(startTs=new Date("2025-10-01T00:00:00Z").getTime()){
  const now=Date.now();
  let best=null;
  for(const m of state.managers.values()){
    const dates=state.trades
      .filter(t=>Number(t.created)>=startTs&&mids(t).map(String).includes(String(m.id)))
      .map(t=>Number(t.created))
      .filter(Number.isFinite)
      .sort((a,b)=>a-b);
    const points=[startTs,...dates,now];
    for(let i=1;i<points.length;i++){
      const from=points[i-1],to=points[i],days=Math.max(0,Math.floor((to-from)/864e5));
      if(!best||days>best.days)best={m,days,from,to,ended:to<now};
    }
  }
  return best;
}
function renderRecords(){const current=state.bundles.find(b=>String(b.league.league_id)===CONFIG.currentLeagueId)||state.modelBundle,allCounts=managerTradeCounts(state.trades),seasonCounts=managerTradeCounts(current.trades),allTop=topEntry(allCounts),seasonTop=topEntry(seasonCounts),drought=longestTradeDroughtSince();const perDay={};state.trades.forEach(t=>mids(t).forEach(id=>{const key=`${id}|${new Date(t.created).toDateString()}`;perDay[key]=(perDay[key]||0)+1}));const dayTop=topEntry(perDay),[dayOwner,dayDate]=(dayTop?.[0]||'|').split('|'),teamEver=highestTeamScore(state.bundles),teamSeason=highestTeamScore([current]),playerEver=highestPlayerScore(state.bundles),playerSeason=highestPlayerScore([current]);const droughtRange=drought?`${drought.days} days · ${new Date(drought.from).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})} to ${drought.ended?new Date(drought.to).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}):'now'}`:'No data';const cards=[['MOST TRADES (ALL TIME)',allTop?managerName(allTop[0]):'—',allTop?`${allTop[1]} trades`:'No data','record-green'],['MOST TRADES THIS SEASON',seasonTop?managerName(seasonTop[0]):'—',seasonTop?`${seasonTop[1]} trades`:'No trades','record-green'],['LONGEST TRADE DROUGHT',drought?.m.name||'—',droughtRange,'record-grey'],['MOST TRADES IN A DAY',dayOwner?managerName(dayOwner):'—',dayTop?`${dayTop[1]} trades · ${dayDate}`:'No data','record-orange'],['HIGHEST WEEKLY TEAM SCORE EVER',teamEver?managerName(teamEver.owner):'—',teamEver?`${teamEver.pts.toFixed(1)} pts · Week ${teamEver.week}, ${teamEver.season}`:'No data','record-blue'],['HIGHEST WEEKLY TEAM SCORE THIS SEASON',teamSeason?managerName(teamSeason.owner):'—',teamSeason?`${teamSeason.pts.toFixed(1)} pts · Week ${teamSeason.week}`:'Season not started','record-blue'],['HIGHEST PLAYER SCORE EVER',playerEver?playerName(playerEver.id):'—',playerEver?`${playerEver.pts.toFixed(1)} pts · Week ${playerEver.week}, ${playerEver.season}`:'No data','record-gold'],['HIGHEST PLAYER SCORE THIS SEASON',playerSeason?playerName(playerSeason.id):'—',playerSeason?`${playerSeason.pts.toFixed(1)} pts · Week ${playerSeason.week}`:'Season not started','record-gold']];$("leagueRecords").classList.remove("loading");$("leagueRecords").innerHTML=cards.map(x=>`<div class="record ${x[3]}"><span>${esc(x[0])}</span><strong>${esc(x[1])}</strong><small>${esc(x[2])}</small></div>`).join("")}

function safeTradeValue(t){try{const value=Number(tradeValue(t));return Number.isFinite(value)?value:0}catch(error){console.warn("Could not calculate trade value",t?.transaction_id||t?.created,error);return 0}}
function tradeFallbackHTML(raw,label='Trade details'){
  const t=normaliseTrade(raw),names=mids(t).map(id=>managerName(id,t)).filter(Boolean),date=fmt(t.created);
  return `<details><summary><div class="trade-date">${esc(date)} · ${esc(t.season_label||'')}</div><div class="trade-teams">${esc(names.join(' ↔ ')||label)}</div><div class="trade-meta">View transaction</div></summary><div class="trade-detail-body">${tradeDetailsHTML(t)}</div></details>`
}
function recentTradeCardHTML(raw){
  const t=normaliseTrade(raw),names=mids(t).map(id=>managerName(id,t)).filter(Boolean),summary=tradeSummaryLinksHTML(t),details=tradeDetailsHTML(t),editorial=safeTradeEditorialHTML(t,true);
  return `<details class="recent-trade-row"><summary><div class="recent-trade-primary"><div class="trade-teams">${names.map(esc).join(' ↔ ')||'League trade'}</div><div class="trade-date">${fmt(t.created)} · ${esc(t.season_label||'')}</div></div><div class="trade-meta">${summary}</div><span class="recent-trade-toggle"><span class="recent-trade-open-label">View trade</span><span class="recent-trade-close-label">Close trade</span></span></summary><div class="trade-detail-body">${details}${editorial}</div></details>`
}
function renderRecent(){
  const root=$("recentTrades");if(!root)return;
  try{
    const featured=featuredTradeOfWeek(),trades=safeArray(state.trades).filter(Boolean).filter(t=>!sameTrade(t,featured)).slice(0,4);
    root.innerHTML=trades.length?trades.map(raw=>{try{return recentTradeCardHTML(raw)}catch(error){console.warn('Recent trade card recovered',raw?.transaction_id||raw?.created,error);return tradeFallbackHTML(raw)}}).join(''):'<div class="block-empty">No additional recent trades are available yet.</div>';
    root.querySelectorAll('details').forEach(details=>details.addEventListener('toggle',()=>{if(!details.open)return;root.querySelectorAll('details[open]').forEach(other=>{if(other!==details)other.open=false})}));
  }
  catch(error){console.error('Recent Trades render failed',error);root.innerHTML='<div class="block-empty">Trade history could not be fully loaded. Please try again shortly.</div>'}
  finally{root.classList.remove('loading')}
}
function renderBiggestTrades(){
  const root=$("biggestTrades"),toggle=$("biggestTradesToggle");if(!root)return;
  try{const limit=state.biggestTradesExpanded?10:5,rows=safeArray(state.trades).filter(Boolean).map(raw=>({t:normaliseTrade(raw),value:safeTradeValue(raw)})).sort((a,b)=>b.value-a.value||(Number(b.t?.created)||0)-(Number(a.t?.created)||0)).slice(0,limit);root.innerHTML=rows.length?rows.map((row,i)=>{let details='';try{details=tradeDetailsHTML(row.t)}catch(error){console.warn('Ranked trade details recovered',row.t?.transaction_id||row.t?.created,error);details='<div class="block-empty">This trade has partial data, but available transaction information is still shown.</div>'}const names=mids(row.t).map(id=>managerName(id,row.t)).filter(Boolean);return `<details class="big-trade-card"><summary><span class="big-trade-rank">${i+1}</span><div><strong>${names.map(esc).join(' ↔ ')||'League trade'}</strong><small>${fmt(row.t.created)} · ${esc(row.t.season_label||'')}</small></div><span class="big-trade-chevron">View trade</span></summary><div class="trade-detail-body">${details}</div></details>`}).join(''):'<div class="block-empty">No completed trades available.</div>';if(toggle)toggle.textContent=state.biggestTradesExpanded?'Show top 5':'Show top 10'}
  catch(error){console.error('Biggest Trades render failed',error);root.innerHTML='<div class="block-empty">Biggest trade rankings are temporarily unavailable.</div>'}
  finally{root.classList.remove('loading')}
}
function currentVoteAverageMap(){const current=state.bundles.find(b=>String(b.league.league_id)===CONFIG.currentLeagueId);if(current&&meaningfulWeeks(current).length)return buildPlayerAverages(current,meaningfulWeeks(current).at(-1));return state.playerAverages}
function previousSeasonAverageMap(){const sorted=state.bundles.filter(b=>meaningfulWeeks(b).length).sort((a,b)=>Number(b.league.season)-Number(a.league.season));const previous=sorted.find(b=>b!==state.modelBundle)||sorted[1];return previous?buildPlayerAverages(previous,meaningfulWeeks(previous).at(-1)):{} }

function eligibleRookie(id){
  const p=state.players[id]||{},season=String(state.league?.season||"2026");
  return Number(p.years_exp)===0||
    String(p.rookie_year||p.first_season||"")===season||
    String(p.status||"").toLowerCase()==="rookie"
}
function votingOpen(){const now=Date.now();return now>=new Date(CONFIG.votingOpens).getTime()&&now<new Date(CONFIG.votingCloses).getTime()}
function votingPhase(){const now=Date.now(),opens=new Date(CONFIG.votingOpens).getTime(),closes=new Date(CONFIG.votingCloses).getTime(),announce=new Date(CONFIG.awardsAnnounced).getTime();return now<opens?'pre':now<closes?'open':now<announce?'closed':'announced'}
function votingCountdownText(){const phase=votingPhase(),target=phase==='pre'?new Date(CONFIG.votingOpens).getTime():phase==='open'?new Date(CONFIG.votingCloses).getTime():phase==='closed'?new Date(CONFIG.awardsAnnounced).getTime():0;if(phase==='announced')return 'Winners announced 1 March';const remaining=Math.max(0,target-Date.now()),days=Math.floor(remaining/864e5),hours=Math.floor((remaining%864e5)/36e5),minutes=Math.floor((remaining%36e5)/6e4),seconds=Math.floor((remaining%6e4)/1000);const lead=phase==='pre'?'Voting opens':phase==='open'?'Voting closes':'Winners announced';return `${lead} in ${days}d ${hours}h ${minutes}m ${seconds}s`}
function categoryKey(category){return `imoVoteSubmitted:${category}:2027`}
function categorySubmitted(category){return Boolean(localStorage.getItem(categoryKey(category)))}
function lockCategory(category,message){
  const card=document.querySelector(`.vote-category[data-category="${category}"]`);
  const overlay=$(`${category}Lock`);
  if(!card||!overlay)return;
  card.classList.add("vote-locked");
  overlay.innerHTML=`<div><strong>🔒 ${esc(message)}</strong></div>`;
  card.querySelectorAll("input,select,button").forEach(el=>el.disabled=true)
}
function unlockCategory(category){
  const card=document.querySelector(`.vote-category[data-category="${category}"]`);
  const overlay=$(`${category}Lock`);
  if(!card||!overlay)return;
  card.classList.remove("vote-locked");
  overlay.innerHTML="";
  card.querySelectorAll("input,select,button").forEach(el=>el.disabled=false)
}
function applyVotingLocks(){
  const open=votingOpen(),phase=votingPhase(),countdown=votingCountdownText();
  $("votingCountdown").textContent=countdown;
  ["allNba","rookie","mip"].forEach(category=>{
    const status=$(category==="allNba"?"allNbaStatus":category==="rookie"?"rookieStatus":"mipStatus");
    if(categorySubmitted(category)){
      lockCategory(category,"Vote submitted");
      if(status)status.textContent="Your vote has been locked on this device."
    }else if(!open){
      const message=phase==='pre'?'Voting opens 23 February':phase==='closed'?'Voting closed — winners announced 1 March':'Winners announced 1 March';
      lockCategory(category,message);
      if(status)status.textContent=countdown
    }else{
      unlockCategory(category);
      if(status)status.textContent="Voting closes 28 February. One submission allowed on this device."
    }
  })
}
function storeVote(category,payload){
  if(!votingOpen())return false;
  if(categorySubmitted(category))return false;
  localStorage.setItem(categoryKey(category),JSON.stringify({...payload,submittedAt:new Date().toISOString()}));
  applyVotingLocks();
  return true
}
function renderVoting(){
  const avgs=currentVoteAverageMap(),prev=previousSeasonAverageMap();
  state.previousPlayerAverages=prev;
  const allPlayers=Object.entries(avgs)
    .filter(([,v])=>Number(v)>0)
    .map(([id,avg])=>({id,avg:Number(avg),name:playerName(id)}))
    .sort((a,b)=>b.avg-a.avg||a.name.localeCompare(b.name));
  const top=allPlayers.slice(0,50);
  state.votePlayers=top;
  const chosen=new Set();

  $("allNbaChoices").classList.remove("loading");
  const draw=(query="")=>{
    $("allNbaChoices").innerHTML=top
      .filter(x=>x.name.toLowerCase().includes(query.toLowerCase()))
      .map(x=>`<label class="vote-option"><input type="checkbox" value="${x.id}" ${chosen.has(x.id)?"checked":""}><span>${esc(x.name)}</span><small>${x.avg.toFixed(1)}</small></label>`)
      .join("")
  };
  draw();
  $("allNbaCount").textContent=chosen.size;
  $("allNbaSearch").oninput=e=>draw(e.target.value);
  $("allNbaChoices").onchange=e=>{
    if(!e.target.matches("input"))return;
    if(e.target.checked&&chosen.size>=10){e.target.checked=false;return}
    e.target.checked?chosen.add(e.target.value):chosen.delete(e.target.value);
    $("allNbaCount").textContent=chosen.size
  };

  const rookies=allPlayers.filter(x=>eligibleRookie(x.id));
  $("rookieVote").innerHTML='<option value="">Select a rookie…</option>'+
    rookies.map(x=>`<option value="${x.id}">${esc(x.name)} — ${x.avg.toFixed(1)}</option>`).join("");

  const mip=allPlayers
    .filter(x=>Number(prev[x.id])>0)
    .map(x=>({...x,improvement:x.avg-Number(prev[x.id])}))
    .sort((a,b)=>b.improvement-a.improvement||b.avg-a.avg);
  $("mipVote").innerHTML='<option value="">Select a player…</option>'+
    mip.map(x=>`<option value="${x.id}">${esc(x.name)} — ${x.improvement>=0?"+":""}${x.improvement.toFixed(1)} PPG</option>`).join("");

  $("submitAllNba").onclick=()=>{
    if(chosen.size===0||chosen.size>10){$("allNbaStatus").textContent="Select between 1 and 10 players.";return}
    if(storeVote("allNba",{players:[...chosen],fanWeight:.35,averageWeight:.65,normalisationPool:"top50"}))$("allNbaStatus").textContent="All-NBA vote submitted."
  };
  $("submitRookie").onclick=()=>{
    const player=$("rookieVote").value;
    if(!player){$("rookieStatus").textContent="Select one rookie.";return}
    if(storeVote("rookie",{player,fanWeight:.35,averageWeight:.65}))$("rookieStatus").textContent="ROTY vote submitted."
  };
  $("submitMip").onclick=()=>{
    const player=$("mipVote").value;
    if(!player){$("mipStatus").textContent="Select one player.";return}
    if(storeVote("mip",{player,fanWeight:.50,improvementWeight:.50,baselineSeason:"2025",currentSeason:"2026"}))$("mipStatus").textContent="MIP vote submitted."
  };

  applyVotingLocks();
  clearInterval(window.__imoVotingTimer);
  window.__imoVotingTimer=setInterval(applyVotingLocks,1000)
}

function managerTrades(managerId){
  const id=String(managerId);
  if(state.computedCache.managerTrades.has(id))return state.computedCache.managerTrades.get(id);
  const rows=state.trades.filter(t=>mids(t).includes(id));
  state.computedCache.managerTrades.set(id,rows);
  return rows
}
function seasonAverageMap(season){
  const key=String(season);
  if(state.computedCache.seasonAverages.has(key))return state.computedCache.seasonAverages.get(key);
  const totals=seasonTotalAverageMap(key),exact=exactAverageMap(key),bundle=bundleForSeason(key);
  let result;
  if(!bundle)result={...exact,...totals};
  else{const weeks=meaningfulWeeks(bundle);result=weeks.length?buildPlayerAverages(bundle,weeks.at(-1)):{...exact,...totals}}
  state.computedCache.seasonAverages.set(key,result);
  return result;
}
function managerRosterPlayers(managerId,season=state.profileAverageSeason){
  const manager=state.managers.get(String(managerId)),ids=[...(manager?.roster?.players||[])],avgMap=seasonAverageMap(season);
  const leagueRank=Object.fromEntries(Object.entries(avgMap).filter(([,v])=>Number(v)>0).sort((a,b)=>Number(b[1])-Number(a[1])||String(a[0]).localeCompare(String(b[0]))).map(([pid],i)=>[String(pid),i+1]));
  return ids.map(id=>{const p=state.players[id]||{},avg=Number(avgMap[id]||0);return{id:String(id),name:playerName(id),avg,avgRank:leagueRank[String(id)]||null,position:p.position||p.fantasy_positions?.[0]||"—",age:Number(p.age)||null,avatar:`https://sleepercdn.com/content/nba/players/${id}.jpg`}}).sort((a,b)=>b.avg-a.avg||a.name.localeCompare(b.name))
}
function currentPlayerAge(playerId){
  const p=state.players[String(playerId)]||{},direct=Number(p.age);
  if(Number.isFinite(direct)&&direct>0)return direct;
  const raw=p.birth_date||p.birthdate||p.dob;
  if(!raw)return null;
  const born=new Date(raw);if(Number.isNaN(born.getTime()))return null;
  const now=new Date();let age=now.getFullYear()-born.getFullYear();
  if(now.getMonth()<born.getMonth()||(now.getMonth()===born.getMonth()&&now.getDate()<born.getDate()))age--;
  return age>0?age:null
}
function playerPositionProfile(playerId){
  const p=state.players[String(playerId)]||{},raw=[p.position,...safeArray(p.fantasy_positions),...safeArray(p.positions)].filter(Boolean).map(x=>String(x).trim().toUpperCase()),positions=[...new Set(raw)],groups=new Set();
  positions.forEach(pos=>{if(pos==='C'||pos==='CENTER'||pos.includes('CENTER'))groups.add('C');if(pos==='PG'||pos==='SG'||pos==='G'||pos==='GUARD'||pos.includes('GUARD'))groups.add('G');if(pos==='SF'||pos==='PF'||pos==='F'||pos==='FORWARD'||pos.includes('FORWARD'))groups.add('F')});
  return{positions,label:positions.join('/')||'—',groups:[...groups]}
}
function tradeTargetAverageContext(){
  const preferred=[],current=currentBundle();if(current)preferred.push(current);
  [...state.bundles].sort((a,b)=>Number(b?.league?.season||0)-Number(a?.league?.season||0)).forEach(bundle=>{if(bundle&&!preferred.includes(bundle))preferred.push(bundle)});
  let season=String(current?.league?.season||state.modelBundle?.league?.season||'2026'),averages={};
  for(const bundle of preferred){const candidateSeason=String(bundle?.league?.season||'');if(!candidateSeason)continue;const map=seasonAverageMap(candidateSeason);if(Object.values(map).some(v=>Number(v)>0)){season=candidateSeason;averages=map;break}}
  if(!Object.keys(averages).length)averages=seasonAverageMap(season);
  const ranked=Object.entries(averages).filter(([,avg])=>Number(avg)>0).sort((a,b)=>Number(b[1])-Number(a[1])||String(a[0]).localeCompare(String(b[0]))),ranks=Object.fromEntries(ranked.map(([id],index)=>[String(id),index+1]));
  return{season,averages,ranks}
}
function recentFirstRoundDraftMap(){
  const rows=safeArray(state.draftSelections).filter(row=>row&&row.isRookieDraft===true&&Number(row.round)===1&&row.playerId),seasons=[...new Set(rows.map(row=>String(row.season||'')).filter(Boolean))].sort((a,b)=>Number(b)-Number(a)).slice(0,2),allowed=new Set(seasons),out=new Map();
  rows.filter(row=>allowed.has(String(row.season||''))).sort((a,b)=>Number(b.season)-Number(a.season)||Number(a.overallPick||a.pickNo||999)-Number(b.overallPick||b.pickNo||999)).forEach(row=>{const id=String(row.playerId);if(!out.has(id))out.set(id,row)});
  return out
}
function managerPositionalNeed(managerId,context){
  const labels={G:'Guard',F:'Forward',C:'Center'},short={G:'G',F:'F',C:'C'},metrics={G:{key:'G',depth:0,values:[]},F:{key:'F',depth:0,values:[]},C:{key:'C',depth:0,values:[]}},ids=currentRosterIds(managerId);
  ids.forEach(pid=>{const avg=Number(context.averages[String(pid)]||0),profile=playerPositionProfile(pid);profile.groups.forEach(group=>{if(!metrics[group])return;metrics[group].depth++;if(avg>0)metrics[group].values.push(avg)})});
  const rows=Object.values(metrics).map(row=>{const top=[...row.values].sort((a,b)=>b-a).slice(0,3),production=top.reduce((sum,value)=>sum+value,0),score=production+Math.min(row.depth,6)*2;return{...row,production,score,label:labels[row.key],short:short[row.key]}}).sort((a,b)=>a.score-b.score||a.depth-b.depth),weakest=rows[0],next=rows[1];
  if(!weakest)return null;
  const clearlyThin=weakest.depth<=2,clearlyWeaker=next&&weakest.score<next.score*.76;
  return clearlyThin||clearlyWeaker?weakest:null
}
function deterministicTargetSeed(value){
  let hash=2166136261;
  for(const char of String(value||'')){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619)}
  return hash>>>0
}
function seededTargetOrder(rows,managerId){
  const seed=deterministicTargetSeed(managerId);
  return [...rows].sort((a,b)=>{
    const aKey=deterministicTargetSeed(`${seed}|${a.id}|${a.ownerId}`),bKey=deterministicTargetSeed(`${seed}|${b.id}|${b.ownerId}`);
    return aKey-bKey||b.score-a.score||a.name.localeCompare(b.name)
  })
}
function managerTradePower(managerId,context){
  const ids=currentRosterIds(managerId),assets=ids.map(playerId=>{
    const avg=Number(context.averages[String(playerId)]||latestKnownAverage(playerId)||0),rank=Number(context.ranks[String(playerId)]||0),value=playerDynastyValue(String(playerId),avg,Date.now());
    return{playerId:String(playerId),avg,rank:rank||null,value}
  }).filter(asset=>asset.value>0).sort((a,b)=>b.value-a.value||a.rank-b.rank),best=assets[0]||{value:0,rank:null,avg:0},picks=managerFuturePickCounts(managerId),eliteDraftCapital=picks.firsts>=2;
  return{bestAsset:best,maxTargetValue:best.value>0?best.value*1.25:Infinity,futureFirsts:picks.firsts,eliteDraftCapital}
}
function getPotentialTradeTargets(managerId,gmProfile=null){
  const id=String(managerId),context=tradeTargetAverageContext(),recentFirsts=recentFirstRoundDraftMap(),need=managerPositionalNeed(id,context),gm=gmProfile||managerGMProfile(id),primary=String(gm?.primary?.name||''),youthArchetypes=new Set(['The Rebuilder','Prospect Hunter','Draft Capital King']),winNowArchetypes=new Set(['The Contender','The Veteran Chaser','The Talent Collector']),youthRow=safeArray(gm?.rows).find(row=>row?.key==='youth'),winNowRow=safeArray(gm?.rows).find(row=>row?.key==='winNow'),youthRank=Number(youthRow?.rank||99),winNowRank=Number(winNowRow?.rank||99),isAscendingCore=youthRank<=3&&winNowRank<=6,mode=isAscendingCore?'ascending':youthArchetypes.has(primary)?'youth':winNowArchetypes.has(primary)?'win-now':'balanced',weeks=meaningfulWeeks(state.modelBundle),through=weeks.at(-1)||Infinity,powerRows=state.modelBundle?modelRows(state.modelBundle,through,'power'):[],powerBy=Object.fromEntries(powerRows.map(row=>[String(row.id),row])),leagueMidpoint=Math.ceil(Math.max(1,state.managers.size)/2),tradePower=managerTradePower(id,context),candidates=[];
  safeArray(state.currentRosters).forEach(roster=>{const ownerId=String(roster?.owner_id||'');if(!ownerId||ownerId===id||!state.managers.has(ownerId))return;const owner=state.managers.get(ownerId);safeArray(roster?.players).forEach(rawId=>{const playerId=String(rawId),avg=Number(context.averages[playerId]||0),rank=Number(context.ranks[playerId]||0),firstRound=recentFirsts.get(playerId)||null;if(!(rank>0&&rank<=120)&&!firstRound)return;const age=currentPlayerAge(playerId),position=playerPositionProfile(playerId),fillsNeed=Boolean(need&&position.groups.includes(need.key)),tradeValue=playerDynastyValue(playerId,avg||latestKnownAverage(playerId)||0,Date.now());
    // Realism ceiling: managers without multiple future firsts cannot target an asset
    // worth more than 125% of their best current player. This removes implausible
    // Jokic/Luka/SGA-style recommendations for teams without comparable trade power.
    if(!tradePower.eliteDraftCapital&&Number.isFinite(tradePower.maxTargetValue)&&tradeValue>tradePower.maxTargetValue)return;
    let score=0,badge='Positional Upgrade',badgeType='value';
    if(rank>0)score+=(121-rank)*.72+Math.min(avg,45)*1.1;if(firstRound)score+=32;
    const valueRatio=tradePower.bestAsset.value>0?tradeValue/tradePower.bestAsset.value:1;
    if(valueRatio>=.72&&valueRatio<=1.25){score+=26;badge='Positional Upgrade';badgeType='value'}
    else if(valueRatio<.72)score+=10;
    if(fillsNeed){score+=48;badge=`Positional Need: ${need.short}`;badgeType='need'}
    if(mode==='youth'){if(age!=null&&age<=23)score+=58;else if(age!=null&&age<=25)score+=24;if(firstRound)score+=34;if(!fillsNeed&&(age!=null&&age<=23||firstRound)){badge='Youth Target';badgeType='youth'}}
    else if(mode==='ascending'){if(age!=null&&age>=22&&age<=26)score+=52;else if(age!=null&&age<=28)score+=24;if(rank>0&&rank<=75)score+=38;else if(rank>0&&rank<=110)score+=18;if(firstRound)score+=22;if(!fillsNeed){badge=firstRound||age!=null&&age<=24?'Ascending Core':'Timeline Fit';badgeType='ascending'}}
    else if(mode==='win-now'){if(rank>0&&rank<=50)score+=58;else if(rank>0&&rank<=100)score+=25;if(age!=null&&age>=27)score+=28;if(!fillsNeed&&age!=null&&age>=27&&rank>0&&rank<=100){badge='Win-Now Veteran';badgeType='veteran'}}
    else{if(rank>0&&rank<=60)score+=36;if(age!=null&&age>=22&&age<=27)score+=13;if(Number(powerBy[ownerId]?.rank||0)>leagueMidpoint)score+=18;if(!fillsNeed&&firstRound){badge='Upside Asset';badgeType='youth'}}
    candidates.push({id:playerId,name:playerName(playerId),age,avg,rank:rank||null,season:context.season,position:position.label,ownerId,ownerName:owner.name,avatar:`https://sleepercdn.com/content/nba/players/${playerId}.jpg`,badge,badgeType,score,firstRound,tradeValue,valueRatio})
  })});
  const rankedPool=candidates.sort((a,b)=>b.score-a.score||(a.rank||999)-(b.rank||999)||a.name.localeCompare(b.name)).slice(0,10),diverse=seededTargetOrder(rankedPool,id),selected=[],usedOwners=new Set();
  // Prefer recommendations from different opposing rosters where the candidate pool allows it.
  diverse.forEach(candidate=>{if(selected.length>=3)return;if(!usedOwners.has(candidate.ownerId)){selected.push(candidate);usedOwners.add(candidate.ownerId)}});
  diverse.forEach(candidate=>{if(selected.length>=3||selected.some(row=>row.id===candidate.id))return;selected.push(candidate)});
  // Graceful fallback keeps the same quality floor and realism ceiling; it only relaxes
  // archetype/positional weighting by taking the next best qualifying candidates.
  if(selected.length<3)candidates.sort((a,b)=>(a.rank||999)-(b.rank||999)||b.score-a.score).forEach(candidate=>{if(selected.length<3&&!selected.some(row=>row.id===candidate.id))selected.push(candidate)});
  return selected.slice(0,3)
}
function potentialTradeTargetsHTML(managerId,gmProfile=null){
  const targets=getPotentialTradeTargets(managerId,gmProfile),cards=targets.map(target=>{const efficiency=playerFptsPer36(target.id,target.season,target.avg),initials=target.name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase(),playerButton=playerLink(target.id,target.name,'potential-target-player-link'),ownerButton=`<button type="button" class="manager-profile-link potential-target-owner-link" data-manager-id="${esc(target.ownerId)}">${esc(target.ownerName)}</button>`;return `<article class="potential-target-card"><div class="potential-target-card-top"><button type="button" class="potential-target-avatar player-history-link" data-player-id="${esc(target.id)}" aria-label="Open ${esc(target.name)} player history"><img src="${esc(target.avatar)}" alt="${esc(target.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span>${esc(initials)}</span></button><span class="potential-target-reason"><small>Why this target?</small><span class="potential-target-badge ${esc(target.badgeType)}">${esc(target.badge)}</span></span></div><div class="potential-target-identity"><h4>${playerButton}</h4><p>${target.age?`Age ${target.age}`:'Age —'} · ${esc(target.position)}</p></div><div class="potential-target-average"><span>${esc(target.season)} season average</span><strong>${target.avg>0?target.avg.toFixed(2):'—'}</strong><div class="potential-target-efficiency"><span><b>${efficiency.mpg>0?efficiency.mpg.toFixed(1):'—'}</b> MPG</span><span><b>${fpts36Display(efficiency)}</b> FPTS/36</span></div>${efficiency.monster?'<em class="per-minute-monster">PER-MINUTE MONSTER</em>':''}<small>${target.rank?`#${target.rank} by average`:target.firstRound?`${esc(String(target.firstRound.season))} first-round selection`:'Qualified target'}</small></div><div class="potential-target-owner"><span>Current team</span><strong>${ownerButton}</strong></div></article>`}).join('');
  return `<section class="manager-profile-card potential-trade-targets-card"><div class="manager-profile-card-heading"><div><span class="eyebrow">FRONT OFFICE SHORTLIST</span><h3>Potential Trade Targets</h3><p>Three context-aware candidates based on this manager's archetype, roster needs and current league value.</p></div><span class="period-pill">Dynamic recommendations</span></div><div class="potential-target-grid">${cards||'<div class="profile-empty">No eligible opposing-roster targets currently meet the quality threshold.</div>'}</div></section>`
}

function rookieScoutTag(prospect){
  const position=String(prospect?.position||'').toUpperCase();
  if(position.includes('PG')&&position.includes('SG'))return 'Combo Creator';
  if(position.includes('PG'))return 'Floor General';
  if(position.includes('SG')&&position.includes('SF'))return 'Two-Way Wing';
  if(position.includes('SG'))return 'Scoring Guard';
  if(position.includes('SF')&&position.includes('PF'))return 'Versatile Forward';
  if(position.includes('SF'))return 'Impact Wing';
  if(position.includes('PF'))return 'Modern Forward';
  if(position.includes('C'))return 'Rim Protector';
  return 'High-Upside Prospect';
}
function parseMockPickNumber(pickNumber,teamCount=8){
  const raw=String(pickNumber||'').trim(),match=raw.match(/^(\d+)\.(\d+)$/);
  if(!match)return null;
  const round=Number(match[1]),slot=Number(match[2]);
  if(!Number.isFinite(round)||!Number.isFinite(slot)||round<1||slot<1||slot>teamCount)return null;
  return{round,slot,overall:(round-1)*teamCount+slot};
}
function getMockTargetsForPick(pickNumber,mockDraftData){
  const rows=safeArray(mockDraftData).filter(row=>row&&Number(row.overall)>0).sort((a,b)=>Number(a.overall)-Number(b.overall));
  if(!rows.length)return[];
  const teamCount=Math.max(1,rows.filter(row=>Number(row.round)===1).length||8),parsed=parseMockPickNumber(pickNumber,teamCount);
  if(!parsed)return[];
  const max=rows.length,start=Math.max(1,Math.min(parsed.overall-1,max-2)),wanted=new Set([start,start+1,start+2]);
  return rows.filter(row=>wanted.has(Number(row.overall))).slice(0,3);
}
function manager2027MockPicks(managerId){
  const slots=projected2027DraftSlots(),slotByRoster=new Map(slots.map(row=>[String(row.originalRosterId),Number(row.slot)])),teamCount=Math.max(1,slots.length||8);
  return managerCurrentDraftPicks(managerId).filter(pick=>String(pick.season)==='2027'&&Number(pick.round)>=1&&Number(pick.round)<=3).map(pick=>{
    const parts=String(pick.key||'').split('|'),originalRosterId=String(parts[1]||''),slot=slotByRoster.get(originalRosterId);
    if(!slot)return null;
    const round=Number(pick.round),overall=(round-1)*teamCount+slot,pickNumber=`${round}.${String(slot).padStart(2,'0')}`;
    return{...pick,originalRosterId,slot,overall,pickNumber};
  }).filter(Boolean).sort((a,b)=>a.overall-b.overall||a.originalName.localeCompare(b.originalName));
}
function rookieDraftTargetCardHTML(row){
  const prospect=row?.prospect||{},name=String(prospect.name||'TBD'),initials=name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase(),overall=Number(row?.overall)||0;
  return `<article class="rookie-target-card"><button type="button" class="rookie-target-open" data-open-rookie-mock-target="${overall}" aria-label="Open ${esc(name)} in the 2027 Mock Draft"><div class="rookie-target-headshot" aria-hidden="true"><span>${esc(initials||'—')}</span></div><div class="rookie-target-copy"><span class="rookie-target-slot">Projected #${overall||'—'} overall</span><h4>${esc(name)}</h4><p>${esc(prospect.position||'—')} · ${esc(prospect.team||'—')}</p><span class="rookie-target-scout">${esc(rookieScoutTag(prospect))}</span></div></button></article>`;
}
function rookieDraftTargetsHTML(managerId){
  const picks=manager2027MockPicks(managerId);
  if(!picks.length)return `<section class="manager-profile-card rookie-draft-targets-card"><div class="manager-profile-card-heading"><div><span class="eyebrow">2027 DRAFT BOARD</span><h3>Rookie Draft Targets</h3><p>Prospects projected around each 2027 pick currently controlled by this front office.</p></div></div><div class="profile-empty">No 2027 Round 1–3 draft capital currently owned.</div></section>`;
  const board=mockDraftRows(),active=picks[0].pickNumber,pills=picks.map((pick,index)=>`<button type="button" class="rookie-pick-pill${index===0?' active':''}" data-rookie-target-pick="${esc(pick.pickNumber)}" aria-pressed="${index===0?'true':'false'}">${esc(pick.pickNumber)}</button>`).join(''),panels=picks.map((pick,index)=>{const targets=getMockTargetsForPick(pick.pickNumber,board);return `<div class="rookie-target-panel${index===0?' active':''}" data-rookie-target-panel="${esc(pick.pickNumber)}"${index===0?'':' hidden'}><div class="rookie-target-grid">${targets.map(rookieDraftTargetCardHTML).join('')||'<div class="profile-empty">Mock targets are not yet available for this slot.</div>'}</div></div>`}).join('');
  return `<section class="manager-profile-card rookie-draft-targets-card" data-rookie-targets><div class="manager-profile-card-heading"><div><span class="eyebrow">2027 DRAFT BOARD</span><h3>Rookie Draft Targets</h3><p>Select an owned pick to see the three prospects projected immediately around that slot.</p></div><span class="period-pill">Weekly mock board</span></div><div class="rookie-pick-selector" role="tablist" aria-label="Owned 2027 draft picks">${pills}</div>${panels}</section>`;
}

function managerFormData(managerId){
  const weeks=meaningfulWeeks(state.modelBundle),through=weeks.at(-1)||Infinity;
  const outcomes=outcomesForBundle(state.modelBundle,through)[String(managerId)]||[];
  const recent=outcomes.slice(-5);
  const wins=outcomes.reduce((sum,g)=>sum+g.result,0);
  const avg5=recent.length?recent.reduce((sum,g)=>sum+g.points,0)/recent.length:0;
  return{outcomes,recent,wins,games:outcomes.length,avg5,streak:winningStreak(outcomes)}
}
function managerTradeSummaryHTML(t,managerId){
  try{const partnerIds=mids(t).filter(id=>id!==String(managerId)),partnerNames=partnerIds.map(id=>managerName(id,t)).join(', ')||'League trade';return `<details class="profile-trade-card"><summary><div><strong>Trade with ${esc(partnerNames)}</strong><small>${fmt(t?.created)} · ${esc(t?.season_label||'')}</small></div><span>View</span></summary><div class="trade-detail-body">${tradeDetailsHTML(t)}</div></details>`}catch(error){console.warn('Manager trade card recovered',t?.transaction_id||t?.created,error);return tradeFallbackHTML(t,'League trade')}
}
function championManagerIds(){
  const ids=new Set();
  state.bundles.forEach(bundle=>{const bracket=bundle.winnersBracket||[];if(!bracket.length)return;const maxRound=Math.max(...bracket.map(x=>Number(x.r)||0)),final=bracket.find(x=>Number(x.r)===maxRound&&x.w!=null)||bracket.filter(x=>Number(x.r)===maxRound&&x.w!=null)[0];if(final){const owner=bundle.ownerByRoster?.[String(final.w)];if(owner)ids.add(String(owner))}});
  return ids
}
function upcomingFirstCount(managerId){
  // Use the same canonical current-ownership list shown in the manager profile.
  // This prevents original picks that have already been traded away from being
  // counted as if the original manager still owns them.
  return managerCurrentDraftPicks(managerId).filter(p=>Number(p.round)===1).length
}
function managerBlockbusterTradeCount(managerId,avgMap){
  const id=String(managerId),averages=avgMap||{};
  return currentSeasonTrades().reduce((count,raw)=>{
    try{
      const t=normaliseTrade(raw);
      if(!mids(t).includes(id))return count;
      const adds=t.adds||{},drops=t.drops||{},owners=t.roster_owner_map||{};
      const qualifies=Object.entries(adds).some(([pid,rid])=>String(owners[String(rid)]||'')===id&&Number(averages[String(pid)]||0)>26)
        ||Object.entries(drops).some(([pid,rid])=>{
          if(String(owners[String(rid)]||'')!==id||Number(averages[String(pid)]||0)<=26)return false;
          const destinationRoster=adds[String(pid)];
          if(destinationRoster==null)return false;
          const destinationManager=String(owners[String(destinationRoster)]||'');
          return destinationManager&&destinationManager!==id
        });
      return count+(qualifies?1:0)
    }catch(_){return count}
  },0)
}
function managerBadges(managerId){
  const id=String(managerId),badges=[],trades=managerTrades(id),cutoff=Date.now()-28*864e5,recent28=trades.filter(t=>(t.created||0)>=cutoff).length;
  if(recent28>=5)badges.push({icon:"⚡",name:"The Day Trader",copy:`Completed ${recent28} trades in the last 28 days.`});
  const firsts=upcomingFirstCount(id);if(firsts>=4)badges.push({icon:"🧰",name:"Draft Capital Hoarder",copy:`Currently controls ${firsts} upcoming first-round picks.`});if(firsts===0)badges.push({icon:"🎯",name:"Win-Now",copy:"Has no future first-round picks and is fully committed to winning now."});
  const seasonTrades=currentSeasonTrades().filter(t=>mids(t).includes(id)),partners=new Set(seasonTrades.flatMap(t=>mids(t).filter(x=>x!==id)));if(state.managers.size>1&&partners.size>=state.managers.size-1)badges.push({icon:"🤝",name:"The Negotiator",copy:"Has traded with every other GM this season."});if(championManagerIds().has(id))badges.push({icon:"🏆",name:"Champion",copy:"Has won an IMO Dynasty Cup championship."});
  const weeks=meaningfulWeeks(state.modelBundle),through=weeks.at(-1)||Infinity,odds=priceRows(through);if(odds.length&&odds.at(-1)?.id===id)badges.push({icon:"🥞",name:"Pancakes",copy:"Currently owns the longest championship odds."});
  const currentSeason=String(state.bundles.find(b=>String(b.league?.league_id)===CONFIG.currentLeagueId)?.league?.season||state.modelBundle?.league?.season||"2026"),avgMap=seasonAverageMap(currentSeason),topPlayer=Object.entries(avgMap).sort((a,b)=>b[1]-a[1])[0]?.[0],manager=state.managers.get(id),roster=(manager?.roster?.players||[]).map(String);if(topPlayer&&roster.includes(String(topPlayer)))badges.push({icon:"👑",name:"MVP",copy:`Currently owns ${playerName(topPlayer)}, the league's highest-average player.`});
  const infinityPlayers=roster.filter(pid=>Number(avgMap[pid]||0)>28);if(infinityPlayers.length>=5)badges.push({icon:"💎",name:"Infinity Stones",copy:`Owns ${infinityPlayers.length} players averaging more than 28.00 this season.`});
  const blockbusterTrades=managerBlockbusterTradeCount(id,avgMap);if(blockbusterTrades>=6)badges.push({icon:"🧨",name:"Blockbuster Merchant",copy:`Involved in ${blockbusterTrades} blockbuster trades this season.`});
  const currentForm=managerFormData(id),lastThree=currentForm.outcomes.slice(-3);if(lastThree.length===3&&lastThree.every(g=>g.result===0))badges.push({icon:"🏖️",name:"Cancun",copy:"Has lost three games in a row."});
  const young=roster.filter(pid=>Number(state.players[pid]?.age)<21).length,old=roster.filter(pid=>Number(state.players[pid]?.age)>30).length;if(young>10)badges.push({icon:"🐶",name:"Young Pups",copy:`Owns ${young} players under the age of 21.`});if(old>=8)badges.push({icon:"🐕",name:"Old Dogs",copy:`Owns ${old} players over the age of 30.`});return badges
}
function managerAverageAge(id){const ages=managerRosterPlayers(id,"2025").map(x=>x.age).filter(Number.isFinite);return ages.length?ages.reduce((a,b)=>a+b,0)/ages.length:0}
function fileSafeName(v){return String(v||'manager').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'manager'}
function managerShareCardData(managerId){
  const id=String(managerId),manager=state.managers.get(id);if(!manager)return null;
  const bundle=currentBundle(),season=String(bundle?.league?.season||'2026'),weeks=meaningfulWeeks(state.modelBundle),through=weeks.at(-1)||Infinity,power=modelRows(state.modelBundle,through,'power').find(x=>String(x.id)===id)||null,odds=priceRows(through).find(x=>String(x.id)===id)||null,form=managerFormData(id),gm=managerGMProfile(id),avgAge=managerAverageAge(id);
  let roster=managerRosterPlayers(id,season);if(!roster.some(p=>Number(p.avg)>0))roster=managerRosterPlayers(id,'2025');
  const corePlayers=roster.slice(0,3).map(player=>({name:player?.name||'—',avatar:player?.avatar||null,avg:Number(player?.avg||0)})),recentForm=form.recent.slice(-5).map(game=>Number(game?.result)===1?'W':Number(game?.result)===.5?'D':'L'),draftPicks=managerCurrentDraftPicks(id),futureFirsts=draftPicks.filter(pick=>Number(pick.round)===1).length,trophies=trophyCabinetData(id).slice(0,3);
  return{id,name:manager.name,avatar:manager.avatar,initials:manager.initials||manager.name.split(/\s+/).slice(0,2).map(z=>z[0]).join('').toUpperCase(),powerRank:power?.rank||null,ladderRank:power?.standingRank||null,record:form.games?`${form.wins}-${form.games-form.wins}`:'—',averageAge:Number.isFinite(avgAge)&&avgAge>0?avgAge.toFixed(1):'—',archetype:gm?.primary?.name||'—',championshipOdds:odds?championshipOddsLabel(odds):'—',recentForm,draftCapital:{total:draftPicks.length,firsts:futureFirsts,label:futureFirsts?`${futureFirsts} future 1st${futureFirsts===1?'':'s'} · ${draftPicks.length} picks total`:`${draftPicks.length} picks total`},trophies,corePlayers}
}
function blobToDataURL(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)})}
async function imageFromDataURL(dataUrl){return await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=dataUrl})}
async function loadImageAsset(url){
  if(!url)return null;
  const attempts=[url,`https://images.weserv.nl/?url=${encodeURIComponent(url)}&output=png`];
  for(const src of attempts){try{const res=await fetch(src,{mode:'cors',cache:'force-cache'});if(!res.ok)throw new Error(res.status);const blob=await res.blob();return await imageFromDataURL(await blobToDataURL(blob))}catch{}}
  return null
}
function roundedRectPath(ctx,x,y,w,h,r){const rr=Math.max(0,Math.min(r,Math.min(w,h)/2));ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath()}
function fillRoundedRect(ctx,x,y,w,h,r,fill,stroke=null,lineWidth=1){ctx.save();roundedRectPath(ctx,x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.lineWidth=lineWidth;ctx.strokeStyle=stroke;ctx.stroke()}ctx.restore()}
function fitFontSize(ctx,text,maxWidth,start,min=24,weight='800',family='Inter,Arial,sans-serif'){let size=start;for(;size>min;size-=2){ctx.font=`${weight} ${size}px ${family}`;if(ctx.measureText(String(text)).width<=maxWidth)break}return size}
function drawCoverImage(ctx,img,x,y,w,h,r=0){ctx.save();if(r){roundedRectPath(ctx,x,y,w,h,r);ctx.clip()}const scale=Math.max(w/img.width,h/img.height),dw=img.width*scale,dh=img.height*scale;ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);ctx.restore()}
function drawAvatarFallback(ctx,x,y,size,initials){const grad=ctx.createLinearGradient(x,y,x+size,y+size);grad.addColorStop(0,'#b7791f');grad.addColorStop(.5,'#f6c453');grad.addColorStop(1,'#6b3f0d');fillRoundedRect(ctx,x,y,size,size,30,grad);ctx.fillStyle='#fff8df';ctx.font=`900 ${Math.round(size*.34)}px Inter,Arial,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(initials||'IM',x+size/2,y+size/2+3);ctx.textAlign='left';ctx.textBaseline='alphabetic'}
function drawChromeBorder(ctx){
  const outer=ctx.createLinearGradient(26,20,1054,1330);outer.addColorStop(0,'#f9e2a7');outer.addColorStop(.16,'#8a5a13');outer.addColorStop(.34,'#fff3bd');outer.addColorStop(.55,'#9a681e');outer.addColorStop(.76,'#f4ce72');outer.addColorStop(1,'#5a3507');
  fillRoundedRect(ctx,22,22,1036,1306,48,'#05070d',outer,16);fillRoundedRect(ctx,46,46,988,1258,38,'rgba(3,7,18,.94)','rgba(255,224,145,.48)',3);fillRoundedRect(ctx,58,58,964,1234,30,null,'rgba(255,255,255,.12)',2)
}
async function buildManagerShareCardCanvas(data){
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const ctx=canvas.getContext('2d');
  const bg=ctx.createLinearGradient(0,0,1080,1350);bg.addColorStop(0,'#111827');bg.addColorStop(.46,'#030712');bg.addColorStop(1,'#15100a');ctx.fillStyle=bg;ctx.fillRect(0,0,1080,1350);
  const amber=ctx.createRadialGradient(990,160,0,990,160,520);amber.addColorStop(0,'rgba(245,158,11,.25)');amber.addColorStop(1,'rgba(245,158,11,0)');ctx.fillStyle=amber;ctx.fillRect(0,0,1080,1350);
  const silver=ctx.createRadialGradient(40,1120,0,40,1120,510);silver.addColorStop(0,'rgba(148,163,184,.16)');silver.addColorStop(1,'rgba(148,163,184,0)');ctx.fillStyle=silver;ctx.fillRect(0,0,1080,1350);drawChromeBorder(ctx);
  ctx.save();ctx.globalAlpha=.52;const sheen=ctx.createLinearGradient(0,0,1080,900);sheen.addColorStop(0,'rgba(255,255,255,.14)');sheen.addColorStop(.28,'rgba(255,255,255,.025)');sheen.addColorStop(.6,'rgba(255,255,255,0)');ctx.fillStyle=sheen;ctx.beginPath();ctx.moveTo(56,58);ctx.lineTo(640,58);ctx.lineTo(1018,600);ctx.lineTo(1018,810);ctx.lineTo(760,560);ctx.lineTo(56,250);ctx.closePath();ctx.fill();ctx.restore();
  ctx.fillStyle='#f8d98d';ctx.font='900 22px Inter,Arial,sans-serif';ctx.fillText('IMO DYNASTY',82,102);ctx.fillStyle='rgba(241,245,249,.65)';ctx.font='800 14px Inter,Arial,sans-serif';ctx.fillText('OFFICIAL MANAGER REFRACTOR',82,128);
  fillRoundedRect(ctx,824,78,170,56,18,'rgba(245,158,11,.14)','rgba(251,191,36,.55)',2);ctx.fillStyle='#fde68a';ctx.font='1000 18px Inter,Arial,sans-serif';ctx.textAlign='center';ctx.fillText('1 OF 1',909,113);ctx.textAlign='left';
  const managerAvatar=await loadImageAsset(data.avatar),coreImages=await Promise.all(data.corePlayers.map(player=>loadImageAsset(player.avatar)));
  const avatarX=82,avatarY=166,avatarSize=190;if(managerAvatar)drawCoverImage(ctx,managerAvatar,avatarX,avatarY,avatarSize,avatarSize,34);else drawAvatarFallback(ctx,avatarX,avatarY,avatarSize,data.initials);fillRoundedRect(ctx,avatarX,avatarY,avatarSize,avatarSize,34,null,'rgba(251,191,36,.72)',4);
  const nameX=304,nameY=214,nameSize=fitFontSize(ctx,data.name,680,72,36,'1000');ctx.fillStyle='#fffdf6';ctx.font=`1000 ${nameSize}px Inter,Arial,sans-serif`;ctx.fillText(data.name,nameX,nameY);ctx.fillStyle='rgba(226,232,240,.67)';ctx.font='700 20px Inter,Arial,sans-serif';ctx.fillText('FRANCHISE MANAGER CARD',nameX,nameY+34);
  function headerPill(x,y,w,label,value){fillRoundedRect(ctx,x,y,w,56,18,'rgba(15,23,42,.82)','rgba(245,190,77,.34)',2);ctx.fillStyle='#f5c451';ctx.font='900 12px Inter,Arial,sans-serif';ctx.fillText(label,x+16,y+22);ctx.fillStyle='#fff8e7';const size=fitFontSize(ctx,value,w-32,19,13,'900');ctx.font=`900 ${size}px Inter,Arial,sans-serif`;ctx.fillText(value,x+16,y+45)}
  headerPill(nameX,278,360,'ARCHETYPE',data.archetype);headerPill(nameX+376,278,260,'TITLE ODDS',data.championshipOdds);
  const trophyY=382;ctx.fillStyle='#f5c451';ctx.font='900 13px Inter,Arial,sans-serif';ctx.fillText('TROPHY CABINET',82,trophyY);if(data.trophies.length){data.trophies.slice(0,3).forEach((trophy,index)=>{const x=82+index*304;fillRoundedRect(ctx,x,trophyY+16,286,72,18,'rgba(15,23,42,.72)','rgba(245,190,77,.22)',2);ctx.font='30px Arial';ctx.fillText(trophy.icon,x+16,trophyY+61);ctx.fillStyle='#fff8e7';ctx.font='900 13px Inter,Arial,sans-serif';ctx.fillText(String(trophy.name).toUpperCase(),x+60,trophyY+43);ctx.fillStyle='rgba(226,232,240,.65)';ctx.font='700 12px Inter,Arial,sans-serif';ctx.fillText(`${trophy.value} · ${trophy.detail}`.slice(0,34),x+60,trophyY+64)})}else{fillRoundedRect(ctx,82,trophyY+16,916,72,18,'rgba(15,23,42,.55)','rgba(148,163,184,.14)',2);ctx.fillStyle='rgba(226,232,240,.56)';ctx.font='800 16px Inter,Arial,sans-serif';ctx.fillText('BUILDING THE TROPHY CABINET',106,trophyY+60)}
  const margin=82,gap=18,colW=(916-gap)/2,cardH=118,row1=500,row2=636,row3=772;
  function statCard(x,y,label,value,accent,valueSize=44){const grad=ctx.createLinearGradient(x,y,x+colW,y+cardH);grad.addColorStop(0,'rgba(30,41,59,.88)');grad.addColorStop(1,'rgba(8,12,22,.92)');fillRoundedRect(ctx,x,y,colW,cardH,22,grad,'rgba(245,190,77,.18)',2);ctx.fillStyle=accent;ctx.font='900 13px Inter,Arial,sans-serif';ctx.fillText(label.toUpperCase(),x+22,y+30);const size=fitFontSize(ctx,value,colW-44,valueSize,22,'1000');ctx.fillStyle='#fffdf6';ctx.font=`1000 ${size}px Inter,Arial,sans-serif`;ctx.fillText(String(value),x+22,y+82)}
  statCard(margin,row1,'Power Rank',data.powerRank?`#${data.powerRank}`:'—','#f5c451',54);statCard(margin+colW+gap,row1,'Ladder Position',data.ladderRank?`#${data.ladderRank}`:'—','#93c5fd',54);statCard(margin,row2,'Record',data.record,'#6ee7b7',52);statCard(margin+colW+gap,row2,'Average Age',data.averageAge,'#c4b5fd',48);statCard(margin,row3,'Recent Form',data.recentForm.length?data.recentForm.join('  '):'—','#fb7185',38);statCard(margin+colW+gap,row3,'Draft Capital',data.draftCapital.label,'#fbbf24',30);
  const coreY=930;fillRoundedRect(ctx,82,coreY,916,260,28,'rgba(8,12,22,.88)','rgba(245,190,77,.30)',3);ctx.fillStyle='#f5c451';ctx.font='1000 15px Inter,Arial,sans-serif';ctx.fillText('THE BIG THREE',106,coreY+36);const coreGap=14,coreW=(868-coreGap*2)/3;data.corePlayers.forEach((player,index)=>{const x=106+index*(coreW+coreGap),img=coreImages[index],head=110,hx=x+(coreW-head)/2,hy=coreY+54;if(img)drawCoverImage(ctx,img,hx,hy,head,head,28);else drawAvatarFallback(ctx,hx,hy,head,String(player.name).split(/\s+/).map(part=>part[0]).slice(0,2).join(''));fillRoundedRect(ctx,hx,hy,head,head,28,null,'rgba(251,191,36,.5)',3);ctx.fillStyle='#fffdf6';ctx.textAlign='center';const playerSize=fitFontSize(ctx,player.name,coreW-18,22,14,'900');ctx.font=`900 ${playerSize}px Inter,Arial,sans-serif`;ctx.fillText(player.name,x+coreW/2,coreY+190);ctx.fillStyle='#f5c451';ctx.font='900 18px Inter,Arial,sans-serif';ctx.fillText(player.avg>0?`${player.avg.toFixed(1)} FP/g`:'— FP/g',x+coreW/2,coreY+222);ctx.textAlign='left'});
  fillRoundedRect(ctx,82,1216,916,72,22,'rgba(245,158,11,.08)','rgba(251,191,36,.42)',2);ctx.fillStyle='#fde68a';ctx.font='1000 16px Inter,Arial,sans-serif';ctx.fillText('OFFICIAL IMO DYNASTY CERTIFIED',108,1259);ctx.textAlign='right';ctx.fillStyle='rgba(226,232,240,.62)';ctx.font='800 13px Inter,Arial,sans-serif';ctx.fillText('GOLD REFRACTOR · 1080 × 1350',972,1259);ctx.textAlign='left';
  return canvas
}
async function downloadManagerShareCard(managerId,button){
  const data=managerShareCardData(managerId);if(!data)return;
  const buttons=document.querySelectorAll(`[data-download-manager-share-card="${CSS.escape(String(managerId))}"]`),reset=()=>buttons.forEach(btn=>{btn.disabled=false;btn.classList.remove('is-loading','is-success','is-error');btn.textContent='↓'});
  buttons.forEach(btn=>{btn.disabled=true;btn.classList.remove('is-success','is-error');btn.classList.add('is-loading');btn.textContent='…'});
  try{const canvas=await buildManagerShareCardCanvas(data);const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG export failed')),'image/png'));const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`imo-dynasty-${fileSafeName(data.name)}-share-card.png`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);buttons.forEach(btn=>{btn.disabled=false;btn.classList.remove('is-loading','is-error');btn.classList.add('is-success');btn.textContent='✓'});setTimeout(()=>reset(),1600)}catch(error){console.error('Failed to download manager share card',error);buttons.forEach(btn=>{btn.disabled=false;btn.classList.remove('is-loading','is-success');btn.classList.add('is-error');btn.textContent='!'});setTimeout(()=>reset(),1800)}}
function favouriteTradePartners(id){const all=managerTrades(id),counts={};all.forEach(t=>mids(t).filter(x=>x!==String(id)).forEach(x=>counts[x]=(counts[x]||0)+1));return Object.entries(counts).map(([partner,count])=>({partner,count,percent:all.length?count/all.length*100:0})).sort((a,b)=>b.count-a.count).slice(0,7)}
function teamFormPlayers(id){const rosterIds=new Set((state.managers.get(String(id))?.roster?.players||[]).map(String)),rows=allGameLogFormRows().filter(x=>rosterIds.has(String(x.id)));return{poor:rows.filter(x=>x.change<0).sort((a,b)=>a.change-b.change).slice(0,3),good:rows.filter(x=>x.change>0).sort((a,b)=>b.change-a.change).slice(0,3)}}
function teamHighestScore(id,bundles){let best=null;bundles.forEach(b=>b.matchups.forEach(m=>{if(String(b.ownerByRoster?.[String(m.roster_id)])!==String(id))return;const pts=Number(m.points);if(Number.isFinite(pts)&&(!best||pts>best.pts))best={pts,week:m.week,season:b.league.season}}));return best}
function managerRecentMatchups(id){const bundle=state.modelBundle,rows=matchupRows(bundle),byWeek={};rows.forEach(x=>(byWeek[x.week]??=[]).push(x));const results=[];Object.entries(byWeek).forEach(([week,weekRows])=>{const groups={};weekRows.forEach(x=>{if(x.matchup_id!=null)(groups[x.matchup_id]??=[]).push(x)});Object.values(groups).forEach(g=>{const mine=g.find(x=>String(bundle.ownerByRoster?.[String(x.roster_id)])===String(id)),opp=g.find(x=>x!==mine);if(!mine||!opp)return;const myPts=Number(mine.points),oppPts=Number(opp.points);if(!Number.isFinite(myPts)||!Number.isFinite(oppPts)||(myPts===0&&oppPts===0))return;const oppId=bundle.ownerByRoster?.[String(opp.roster_id)],result=myPts===oppPts?"D":myPts>oppPts?"W":"L";results.push({week:Number(week),result,myPts,oppPts,oppId})})});return results.sort((a,b)=>a.week-b.week).slice(-5)}
function managerHeadToHead(id){
  const records={};
  state.bundles.forEach(bundle=>{const byWeek={};matchupRows(bundle).forEach(row=>(byWeek[row.week]??=[]).push(row));Object.values(byWeek).forEach(weekRows=>{const groups={};weekRows.forEach(row=>{if(row.matchup_id!=null)(groups[row.matchup_id]??=[]).push(row)});Object.values(groups).forEach(group=>{const mine=group.find(row=>String(bundle.ownerByRoster?.[String(row.roster_id)])===String(id)),opp=group.find(row=>row!==mine);if(!mine||!opp)return;const oppId=String(bundle.ownerByRoster?.[String(opp.roster_id)]||"");if(!oppId||oppId===String(id)||!state.managers.has(oppId))return;const minePts=Number(mine.points),oppPts=Number(opp.points);if(!Number.isFinite(minePts)||!Number.isFinite(oppPts)||(minePts===0&&oppPts===0))return;const rec=records[oppId]??={oppId,wins:0,losses:0,draws:0,games:0};rec.games++;if(minePts>oppPts)rec.wins++;else if(minePts<oppPts)rec.losses++;else rec.draws++})})});
  return Object.values(records).sort((a,b)=>b.games-a.games||managerName(a.oppId).localeCompare(managerName(b.oppId)))
}
function completedMatchupsForBundle(bundle){const cacheKey=String(bundle?.league?.league_id||bundle?.league?.season||'unknown');if(state.computedCache.completedMatchups.has(cacheKey))return state.computedCache.completedMatchups.get(cacheKey);const byWeek={};matchupRows(bundle).forEach(row=>(byWeek[row.week]??=[]).push(row));const games=[];Object.entries(byWeek).forEach(([week,rows])=>{const groups={};rows.forEach(row=>{if(row.matchup_id!=null)(groups[row.matchup_id]??=[]).push(row)});Object.values(groups).forEach(group=>{if(group.length<2)return;const a=group[0],b=group[1],aPts=Number(a.points),bPts=Number(b.points);if(!Number.isFinite(aPts)||!Number.isFinite(bPts)||(aPts===0&&bPts===0))return;const aId=String(bundle.ownerByRoster?.[String(a.roster_id)]||''),bId=String(bundle.ownerByRoster?.[String(b.roster_id)]||'');if(!aId||!bId||aId===bId)return;games.push({season:String(bundle.league?.season||''),week:Number(week),aId,bId,aPts,bPts})})});state.computedCache.completedMatchups.set(cacheKey,games);return games}
function managerBiggestResult(id){let win=null,loss=null;state.bundles.forEach(bundle=>completedMatchupsForBundle(bundle).forEach(g=>{let mine,opp,oppId;if(g.aId===String(id)){mine=g.aPts;opp=g.bPts;oppId=g.bId}else if(g.bId===String(id)){mine=g.bPts;opp=g.aPts;oppId=g.aId}else return;if(!state.managers.has(oppId))return;const margin=mine-opp,item={margin:Math.abs(margin),oppId,week:g.week,season:g.season,myPts:mine,oppPts:opp};if(margin>0&&(!win||item.margin>win.margin))win=item;if(margin<0&&(!loss||item.margin>loss.margin))loss=item}));return{win,loss}}
function finalResult(bundle){const bracket=bundle.winnersBracket||[];if(!bracket.length)return null;const maxRound=Math.max(...bracket.map(x=>Number(x.r)||0)),finals=bracket.filter(x=>Number(x.r)===maxRound&&x.w!=null&&x.l!=null);const final=finals[0];if(!final)return null;return{winner:String(bundle.ownerByRoster?.[String(final.w)]||''),runnerUp:String(bundle.ownerByRoster?.[String(final.l)]||'')}}
function regularSeasonWinnerIds(bundle){const start=Number(bundle.league?.settings?.playoff_week_start)||Infinity,through=Number.isFinite(start)?start-1:Infinity,table=standingsTable(bundle,through);if(!table.length)return[];const best=table[0];return table.filter(x=>x.wins===best.wins&&x.pts===best.pts).map(x=>String(x.id))}
function trophyCabinetData(managerId){const id=String(managerId),t=[];const champs=[],runners=[],regular=[],tradeKings=[];state.bundles.forEach(bundle=>{const season=String(bundle.league?.season||''),final=finalResult(bundle);if(final?.winner===id)champs.push(season);if(final?.runnerUp===id)runners.push(season);if(meaningfulWeeks(bundle).length&&regularSeasonWinnerIds(bundle).includes(id))regular.push(season);const counts={};bundle.trades.forEach(tr=>mids(tr).forEach(mid=>counts[mid]=(counts[mid]||0)+1));const max=Math.max(0,...Object.values(counts));if(max>0&&(counts[id]||0)===max)tradeKings.push(season)});if(champs.length)t.push({icon:'🏆',name:'Championships',value:String(champs.length),detail:champs.sort().join(' · ')});if(regular.length)t.push({icon:'🥇',name:'Regular Season Titles',value:String(regular.length),detail:regular.sort().join(' · ')});if(runners.length)t.push({icon:'🎖️',name:'Runner-Up',value:String(runners.length),detail:runners.sort().join(' · ')});if(tradeKings.length)t.push({icon:'🤝',name:'Trade King',value:String(tradeKings.length),detail:tradeKings.sort().join(' · ')});
  const allGames=state.bundles.flatMap(completedMatchupsForBundle);let leagueStreak=0,streakOwners=[];for(const m of state.managers.values()){let best=0;state.bundles.forEach(bundle=>{let run=0;completedMatchupsForBundle(bundle).filter(g=>g.aId===m.id||g.bId===m.id).sort((a,b)=>a.week-b.week).forEach(g=>{const won=(g.aId===m.id?g.aPts>g.bPts:g.bPts>g.aPts);run=won?run+1:0;best=Math.max(best,run)})});if(best>leagueStreak){leagueStreak=best;streakOwners=[m.id]}else if(best===leagueStreak&&best>0)streakOwners.push(m.id)}if(streakOwners.includes(id))t.push({icon:'🔥',name:'Longest Win Streak',value:`${leagueStreak} straight wins`,detail:'League record'});
  const scores=[];allGames.forEach(g=>{scores.push({id:g.aId,pts:g.aPts,week:g.week,season:g.season});scores.push({id:g.bId,pts:g.bPts,week:g.week,season:g.season})});const high=Math.max(0,...scores.map(x=>x.pts));const highMine=scores.find(x=>x.id===id&&x.pts===high);if(highMine)t.push({icon:'💯',name:'Highest Weekly Score',value:`${high.toFixed(1)} points`,detail:`Week ${highMine.week} · ${highMine.season}`});
  const margins=[];allGames.forEach(g=>{if(g.aPts>g.bPts)margins.push({id:g.aId,opp:g.bId,margin:g.aPts-g.bPts,week:g.week,season:g.season});else if(g.bPts>g.aPts)margins.push({id:g.bId,opp:g.aId,margin:g.bPts-g.aPts,week:g.week,season:g.season})});const maxMargin=Math.max(0,...margins.map(x=>x.margin));const marginMine=margins.find(x=>x.id===id&&Math.abs(x.margin-maxMargin)<.0001);if(marginMine)t.push({icon:'💥',name:'Largest Margin of Victory',value:`+${maxMargin.toFixed(1)} points`,detail:`vs ${managerName(marginMine.opp)} · Week ${marginMine.week} · ${marginMine.season}`});return t}
function trophyCabinetHTML(id){const trophies=trophyCabinetData(id);return trophies.length?`<div class="trophy-grid">${trophies.map(x=>`<div class="trophy-card"><span class="trophy-icon">${x.icon}</span><div><strong>${esc(x.name)}</strong><b>${esc(x.value)}</b><small>${esc(x.detail)}</small></div></div>`).join('')}</div>`:'<div class="profile-empty">No permanent trophies earned yet.</div>'}
function allNBAEligible(id){const season=state.profileAverageSeason==="2026"?"2026":"2025",avg=seasonAverageMap(season),top50=new Set(Object.entries(avg).filter(([,v])=>Number(v)>0).sort((a,b)=>b[1]-a[1]).slice(0,50).map(([pid])=>String(pid)));return managerRosterPlayers(id,season).filter(p=>top50.has(String(p.id)))}
function badgeIconsHTML(badges){return badges.map(b=>`<details class="profile-badge-pop"><summary title="${esc(b.name)}">${b.icon}</summary><div><strong>${esc(b.name)}</strong><small>${esc(b.copy)}</small></div></details>`).join("")}
function playerFormMini(rows,positive){return rows.length?rows.map(x=>`<div class="profile-form-player">${playerLink(x.id,x.name)}<span class="form-change ${positive?'positive':'negative'}">${x.change>0?'+':''}${x.change.toFixed(1)} <i aria-hidden="true">${positive?'↑':'↓'}</i></span><small>${x.priorAvg.toFixed(1)} → ${x.recentAvg.toFixed(1)}</small></div>`).join(""):'<div class="profile-empty">No qualifying players.</div>'}

function currentRosterIds(managerId){return (state.managers.get(String(managerId))?.roster?.players||[]).map(String)}
function currentBundle(){return state.bundles.find(b=>String(b.league?.league_id)===CONFIG.currentLeagueId)||state.bundles[0]||null}
function managerFuturePickCounts(managerId){
  const picks=managerCurrentDraftPicks(managerId),firsts=picks.filter(p=>Number(p.round)===1).length,seconds=picks.filter(p=>Number(p.round)===2).length;
  return{firsts,seconds,totalValue:firsts*17.5+seconds*2.5}
}
function managerCurrentDraftPicks(managerId){
  const bundle=currentBundle();if(!bundle)return[];
  const currentSeason=Number(bundle.league?.season)||2026,moved=safeArray(bundle.tradedPicks).filter(p=>p&&typeof p==='object'),maxMovedSeason=Math.max(currentSeason+3,...moved.map(p=>Number(p?.season)||0)),seasons=[];
  for(let season=currentSeason+1;season<=maxMovedSeason;season++)seasons.push(season);
  const maxMovedRound=Math.max(0,...moved.map(p=>Number(p.round)||0)),rounds=Math.max(4,Number(bundle.league?.settings?.draft_rounds)||0,maxMovedRound),out=[];
  // Sleeper identifies a pick by season + round + its original roster slot.
  // Build one canonical current-owner lookup and let the latest duplicate entry
  // win if the API ever returns the same pick more than once.
  const currentOwnerByPick=new Map();
  moved.forEach(p=>{if(!p||typeof p!=='object')return;const originalRosterId=String(p.roster_id??p.original_roster_id??'');if(!originalRosterId)return;currentOwnerByPick.set(`${String(p.season)}|${Number(p.round)}|${originalRosterId}`,String(p.owner_id??originalRosterId))});
  seasons.forEach(season=>(bundle.rosters||[]).forEach(originalRoster=>{for(let round=1;round<=rounds;round++){
    const originalRosterId=String(originalRoster.roster_id),pickKey=`${String(season)}|${round}|${originalRosterId}`,ownerRoster=currentOwnerByPick.get(pickKey)||originalRosterId,ownerUser=String(bundle.ownerByRoster?.[ownerRoster]||'');
    if(ownerUser!==String(managerId))continue;
    const originalUser=String(bundle.ownerByRoster?.[originalRosterId]||''),originalName=managerName(originalUser),pick={season:String(season),round,roster_id:originalRosterId,original_roster_id:originalRosterId,owner_id:ownerRoster},key=pickAssetKey(pick),label=`${season} Round ${round} Pick (${originalName}'s pick)`;
    out.push({season,round,key,label,originalName});
  }}));
  return out.sort((a,b)=>a.round-b.round||a.season-b.season||a.originalName.localeCompare(b.originalName))
}
function managerDraftPicksHTML(managerId){
  const picks=managerCurrentDraftPicks(managerId),firsts=picks.filter(p=>p.round===1),later=picks.filter(p=>p.round!==1),rows=list=>list.map(p=>`<div class="manager-future-pick-row"><span class="manager-future-pick-icon">◆</span>${pickHistoryLink(p.key,p.label,'pick-history-link manager-future-pick-link')}</div>`).join('');
  return `<section class="manager-profile-card profile-draft-picks-card"><div class="manager-profile-card-heading"><div><span class="eyebrow">DRAFT CAPITAL</span><h3>Current Draft Picks</h3></div><span class="period-pill">${picks.length} assets</span></div><div class="manager-future-picks-primary">${rows(firsts)||'<div class="profile-empty">No future first-round picks currently held.</div>'}</div>${later.length?`<details class="manager-future-picks-more"><summary>Show ${later.length} later-round pick${later.length===1?'':'s'}</summary><div class="manager-future-picks-list">${rows(later)}</div></details>`:''}</section>`
}
function managerWaiverMoves(managerId){
  const bundle=currentBundle();if(!bundle)return 0;const rosterId=String(state.managers.get(String(managerId))?.roster?.roster_id||'');
  return (bundle.transactions||[]).filter(t=>['waiver','free_agent'].includes(t.type)&&(!t.status||t.status==='complete')).filter(t=>{
    if((t.roster_ids||[]).map(String).includes(rosterId))return true;
    return Object.values(t.adds||{}).map(String).includes(rosterId)||Object.values(t.drops||{}).map(String).includes(rosterId)
  }).length
}
function managerPlayerValue(managerId){
  const ids=currentRosterIds(managerId),season=String(currentBundle()?.league?.season||'2026'),avg=seasonAverageMap(season),fallback=seasonAverageMap('2025');
  return ids.reduce((sum,pid)=>{const a=Number(avg[pid]||fallback[pid]||latestKnownAverage(pid)||0);return sum+playerDynastyValue(pid,a,Date.now())},0)
}
function managerStarCount(managerId){
  const ids=currentRosterIds(managerId),season=String(currentBundle()?.league?.season||'2026'),avg=seasonAverageMap(season),fallback=seasonAverageMap('2025');
  return ids.filter(pid=>Number(avg[pid]||fallback[pid]||latestKnownAverage(pid)||0)>=28).length
}
function managerTradeRiskRaw(managerId){
  const trades=managerTrades(managerId);if(!trades.length)return 0;let score=0;
  trades.forEach(t=>{const received=tradeAssets(t)[String(managerId)]||[],sent=tradeOutgoingAssets(t)[String(managerId)]||[],assets=received.length+sent.length,total=[...received,...sent].reduce((a,x)=>a+(Number(x.value)||0),0),firsts=[...received,...sent].filter(x=>x.type==='pick'&&/Round 1|First/i.test(x.name)).length,stars=[...received,...sent].filter(x=>x.type==='player'&&Number(x.value)>=35).length;score+=Math.min(4,assets/2)+Math.min(5,total/45)+firsts*1.5+stars*1.2});
  return score/trades.length*Math.log2(trades.length+1)
}
function managerTradeEfficiencyRaw(managerId){
  const trades=managerTrades(managerId);if(!trades.length)return 50;const vals=trades.map(t=>{const m=tradeSideMetrics(t,managerId);return 50+Math.max(-40,Math.min(40,m.edge*160))});return vals.reduce((a,b)=>a+b,0)/vals.length
}
function leagueScale(rawById,invert=false){
  const vals=Object.values(rawById).filter(Number.isFinite),min=Math.min(...vals),max=Math.max(...vals);const out={};Object.entries(rawById).forEach(([id,v])=>{let n=max===min?.5:(v-min)/(max-min);if(invert)n=1-n;out[id]=Math.round(25+n*74)});return out
}
function calibratedLeagueScale(rawById,low=44,high=91){
  const entries=Object.entries(rawById).filter(([,v])=>Number.isFinite(v)).sort((a,b)=>a[1]-b[1]),out={};
  if(!entries.length)return out;
  if(entries.length===1){out[entries[0][0]]=68;return out}
  entries.forEach(([id],i)=>{const percentile=i/(entries.length-1),curved=.5+(percentile-.5)*.86;out[id]=Math.round(low+Math.max(0,Math.min(1,curved))*(high-low))});
  return out
}
function managerTendencyLeague(){
  if(state.computedCache.tendencyLeague)return state.computedCache.tendencyLeague;
  const ids=[...state.managers.keys()],bundle=currentBundle(),weeks=meaningfulWeeks(bundle||{matchups:[]}),through=weeks.at(-1)||Infinity,powerRows=bundle?modelRows(bundle,through,'power'):[],oddsRows=bundle?priceRows(through):[],powerBy=Object.fromEntries(powerRows.map(x=>[String(x.id),x])),oddsBy=Object.fromEntries(oddsRows.map(x=>[String(x.id),x]));
  const raw={trade:{},youth:{},winNow:{},draft:{},waiver:{},risk:{},asset:{},star:{}};
  ids.forEach(id=>{const roster=managerRosterPlayers(id,'2025'),ages=roster.map(x=>x.age).filter(Number.isFinite),avgAge=ages.length?ages.reduce((a,b)=>a+b,0)/ages.length:27,under25=ages.length?ages.filter(x=>x<25).length/ages.length:0,picks=managerFuturePickCounts(id),p=powerBy[id],o=oddsBy[id],playerValue=managerPlayerValue(id),stars=managerStarCount(id),career=managerTrades(id).length,season=currentSeasonTrades().filter(t=>mids(t).includes(id)).length;
    raw.trade[id]=season*3+career*.45;
    raw.youth[id]=(31-avgAge)*8+under25*45+picks.firsts*2;
    raw.winNow[id]=(p?Math.max(0,state.managers.size-p.standingRank+1)*7:0)+(p?.avg5||0)/8+(o&&!o.eliminated?Math.max(0,55-o.odds):0)+Math.max(0,avgAge-26)*5-picks.firsts*1.5;
    raw.draft[id]=picks.totalValue;
    raw.waiver[id]=managerWaiverMoves(id);
    raw.risk[id]=managerTradeRiskRaw(id);
    raw.asset[id]=managerTradeEfficiencyRaw(id)*.65+playerValue*.35;
    raw.star[id]=stars*18+playerValue*.18;
  });
  const ratings={trade:leagueScale(raw.trade),youth:leagueScale(raw.youth),winNow:leagueScale(raw.winNow),draft:leagueScale(raw.draft),waiver:leagueScale(raw.waiver),risk:leagueScale(raw.risk),asset:leagueScale(raw.asset),star:leagueScale(raw.star)};
  const result={ratings,raw,week:weeks.at(-1)||0};state.computedCache.tendencyLeague=result;return result
}
function rankForRating(metric,id,league){const rows=[...state.managers.keys()].sort((a,b)=>league.ratings[metric][b]-league.ratings[metric][a]||managerName(a).localeCompare(managerName(b)));return rows.indexOf(String(id))+1}
function archetypeCandidates(r,picks,avgAge){return[
  {name:'The Rebuilder',icon:'🏗️',score:r.draft*.40+r.youth*.35+(100-r.winNow)*.25},
  {name:'The Wheel & Dealer',icon:'🤝',score:r.trade*.60+r.risk*.25+r.waiver*.15},
  {name:'The Veteran Chaser',icon:'🦖',score:(100-r.youth)*.45+r.winNow*.35+Math.max(0,avgAge-26)*8},
  {name:'The Contender',icon:'🏆',score:r.winNow*.55+r.star*.30+r.asset*.15},
  {name:'The Talent Collector',icon:'🎯',score:r.star*.55+r.asset*.30+r.risk*.15},
  {name:'Draft Capital King',icon:'💎',score:r.draft*.70+r.youth*.20+(picks.firsts>=5?15:0)},
  {name:'Diamond Hands',icon:'🛡️',score:(100-r.trade)*.65+(100-r.waiver)*.25+r.asset*.10},
  {name:'Prospect Hunter',icon:'🌱',score:r.youth*.70+r.draft*.20+(100-r.winNow)*.10},
  {name:'The Gambler',icon:'🎲',score:r.risk*.65+r.trade*.20+r.waiver*.15}
].sort((a,b)=>b.score-a.score)}
function managerScoutReport(name,r,primary,secondary){
  const strongest=Object.entries(r).sort((a,b)=>b[1]-a[1]).map(([k])=>k),weakest=[...strongest].reverse(),lead=strongest[0],support=strongest[1];
  const identity={
    'The Rebuilder':`${name} is operating with a long horizon, prioritising young assets and future flexibility over short-term results.`,
    'The Wheel & Dealer':`${name} remains one of the league's most active front offices, continually testing the market and reshaping the roster through trades.`,
    'The Veteran Chaser':`${name} has built around proven production, favouring established veterans who can contribute immediately.`,
    'The Contender':`${name} has assembled a roster designed to compete now, with high-end production and a clear focus on the championship window.`,
    'The Talent Collector':`${name} has concentrated premium talent at the top of the roster, building around players capable of deciding matchups.`,
    'Draft Capital King':`${name} has quietly become one of the league's premier asset accumulators, maintaining exceptional flexibility through elite draft capital.`,
    'Diamond Hands':`${name} runs a patient front office, preferring roster continuity and calculated moves over constant turnover.`,
    'Prospect Hunter':`${name} has committed to a youth-led build, consistently targeting players whose best fantasy seasons may still be ahead of them.`,
    'The Gambler':`${name} embraces volatility more than most, showing a willingness to make aggressive moves in pursuit of a major payoff.`
  }[primary.name]||`${name} presents as a balanced front office with a clearly defined roster-building identity.`;
  const detail={
    trade:'Trade activity remains central to the strategy, with the roster rarely standing still for long.',
    youth:'The roster construction is deliberately youthful, preserving both upside and long-term control.',
    winNow:'Recent decisions point firmly toward immediate competitiveness rather than patient development.',
    draft:'Draft capital provides the organisation with leverage, optionality and multiple paths forward.',
    waiver:'Consistent waiver activity gives the roster a steady stream of low-cost opportunities.',
    risk:'The front office is comfortable accepting variance when the potential return is significant.',
    asset:'Asset management has been a strength, with value generally preserved across roster moves.',
    star:'The roster carries genuine star power and is built to lean on elite fantasy production.'
  };
  const transition=r.winNow>=70&&r.draft>=70?'Despite retaining long-term flexibility, the current build is beginning to signal a transition toward contention.':r.winNow>=75?'The next challenge is converting that win-now profile into sustained results across the season.':r.youth>=75||r.draft>=75?'The key question is when that long-term value will be converted into established weekly production.':r.trade<=35?'Future improvement may depend on becoming more willing to use the trade market when opportunities emerge.':`The secondary ${secondary.name.toLowerCase()} profile adds another layer to an otherwise well-defined approach.`;
  return`${identity} ${detail[lead]} ${support!==lead?detail[support]:''} ${transition}`.replace(/\s+/g,' ').trim()
}
function managerTraits(r,picks,avgAge){const traits=[];if(r.trade>=75)traits.push('Loves trading');if(r.trade<=35)traits.push('Patient with the roster');if(r.youth>=75)traits.push('Invests heavily in youth');if(r.winNow>=75)traits.push('Aggressive win-now build');if(r.draft>=75)traits.push(`Controls premium draft capital`);if(picks.firsts>=5)traits.push(`Holds ${picks.firsts} future firsts`);if(r.waiver>=75)traits.push('Works the waiver wire');if(r.waiver<=35)traits.push('Rarely churns the roster');if(r.risk>=75)traits.push('Comfortable with blockbuster risk');if(r.asset>=75)traits.push('Strong asset manager');if(r.star>=75)traits.push('Collects elite talent');if(avgAge>=29)traits.push('Prefers proven veterans');return traits.slice(0,5)}
function managerWeaknesses(managerId,r,picks,avgAge){
  const id=String(managerId),seasonTrades=currentSeasonTrades().filter(t=>mids(t).includes(id)),careerTrades=managerTrades(id),roster=managerRosterPlayers(id,'2025');
  const seasonCounts=[...state.managers.keys()].map(mid=>currentSeasonTrades().filter(t=>mids(t).includes(String(mid))).length),seasonAvg=seasonCounts.reduce((a,b)=>a+b,0)/Math.max(1,seasonCounts.length),seasonCount=seasonTrades.length;
  const waiverCounts=[...state.managers.keys()].map(mid=>managerWaiverMoves(mid)),waiverAvg=waiverCounts.reduce((a,b)=>a+b,0)/Math.max(1,waiverCounts.length),waivers=managerWaiverMoves(id);
  const top8=roster.slice(0,8).map(x=>String(x.id)),top8Moved=top8.filter(pid=>careerTrades.some(t=>Object.prototype.hasOwnProperty.call(t.drops||{},pid))).length,leagueTop8MoveRates=[...state.managers.keys()].map(mid=>{const rr=managerRosterPlayers(mid,'2025').slice(0,8).map(x=>String(x.id)),tt=managerTrades(mid);return rr.length?rr.filter(pid=>tt.some(t=>Object.prototype.hasOwnProperty.call(t.drops||{},pid))).length/rr.length:0}),leagueTop8Avg=leagueTop8MoveRates.reduce((a,b)=>a+b,0)/Math.max(1,leagueTop8MoveRates.length),top8MoveRate=top8.length?top8Moved/top8.length:0;
  const values=roster.map(x=>Number(x.avg)||0).filter(x=>x>0),top3=values.slice(0,3).reduce((a,b)=>a+b,0),total=values.reduce((a,b)=>a+b,0),starShare=total?top3/total:0,midDepth=values.slice(5,12),midDepthAvg=midDepth.length?midDepth.reduce((a,b)=>a+b,0)/midDepth.length:0;
  const allMidDepth=[...state.managers.keys()].map(mid=>{const vals=managerRosterPlayers(mid,'2025').map(x=>Number(x.avg)||0).filter(x=>x>0).slice(5,12);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0}),leagueMidDepth=allMidDepth.reduce((a,b)=>a+b,0)/Math.max(1,allMidDepth.length);
  const weeks=meaningfulWeeks(state.modelBundle),through=weeks.at(-1)||Infinity,power=modelRows(state.modelBundle,through,'power').find(x=>String(x.id)===id),standingGap=power?Number(power.standingRank)-Number(power.rank):0;
  const current=currentBundle(),currentWeeks=current?meaningfulWeeks(current):[],averageSeason=currentWeeks.length?String(current.league?.season||'2026'):String([...state.bundles].filter(b=>meaningfulWeeks(b).length).sort((a,b)=>Number(b.league?.season)-Number(a.league?.season))[0]?.league?.season||'2025'),leagueAverages=seasonAverageMap(averageSeason),top12Ids=new Set(Object.entries(leagueAverages).filter(([,avg])=>Number(avg)>0).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,12).map(([pid])=>String(pid))),currentRosterIds=new Set((state.managers.get(id)?.roster?.players||[]).map(String)),ownsTop12=[...top12Ids].some(pid=>currentRosterIds.has(pid));
  const candidates=[];
  const add=(score,label)=>{if(Number.isFinite(score)&&score>0)candidates.push({score,label})};
  const trulyInactive=seasonAvg>=1&&r.trade<35&&seasonCount<=Math.max(0,Math.floor(seasonAvg*.25));
  add(trulyInactive?82+Math.min(12,(seasonAvg-seasonCount)*5):0,'Needs to trade more');
  add(top8.length&&top8MoveRate+0.08<leagueTop8Avg?62+(leagueTop8Avg-top8MoveRate)*70:0,'Values own assets too much');
  add(seasonAvg>0&&seasonCount>seasonAvg*1.75?58+Math.min(35,(seasonCount/seasonAvg-1.75)*25):0,'Too quick to reshuffle');
  add(r.waiver<55?55+(55-r.waiver)*.7+(waiverAvg>waivers?10:0):0,'Leaves value on the waiver wire');
  add(picks.firsts<2&&avgAge>24?82+Math.min(12,(avgAge-24)*3):0,'Short on future flexibility');
  add(avgAge>=29&&picks.firsts<=2?82+(avgAge-29)*5:avgAge>=28.5?68+(avgAge-28.5)*6:0,'Too veteran-heavy');
  add(avgAge<=24.5&&r.winNow<55?76+(55-r.winNow)*.35:0,'Youth has not converted yet');
  add(avgAge>25.5&&avgAge<28.5&&r.winNow<58&&r.draft<58?72+(58-Math.max(r.winNow,r.draft))*.35:0,'Caught between timelines');
  add(starShare>=.48?64+(starShare-.48)*120:0,'Too reliant on star power');
  add(!ownsTop12?82+Math.max(0,55-r.star)*.35:0,'Roster lacks a clear centrepiece');
  add(leagueMidDepth>0&&midDepthAvg<leagueMidDepth*.88?68+(1-midDepthAvg/leagueMidDepth)*90:0,'Middle of the roster lacks depth');
  add(standingGap>=2?72+standingGap*6:0,'Results lag behind the roster');
  add(standingGap<=-2?68+Math.abs(standingGap)*5:0,'Overperforming fragile foundations');
  add(r.risk>=82?70+(r.risk-82)*.8:0,'Too comfortable with blockbuster risk');
  add(r.asset<48?66+(48-r.asset)*.55:0,'Asset value leaks through trades');
  add(r.winNow<45&&r.draft<55?70+(45-r.winNow)*.45:0,'Limited margin for error');
  const fallback=[
    {score:63+(100-r.waiver)*.16,label:'Leaves value on the waiver wire'},
    {score:60+(100-r.asset)*.13,label:'Asset value leaks through trades'},
    {score:59+(100-r.winNow)*.12,label:'Needs more reliable production'},
    {score:58+Math.abs(60-r.youth)*.10,label:'Roster timeline needs more clarity'},
    {score:57+(100-r.risk)*.08,label:'Could be more decisive in the market'},
    {score:56+(100-r.star)*.08,label:'Needs another dependable difference-maker'}
  ];
  const ranked=[...candidates,...fallback].sort((a,b)=>b.score-a.score);
  const unique=[];for(const item of ranked){if(!unique.some(x=>x.label===item.label))unique.push(item);if(unique.length>=5)break}
  const fifth=unique[4]?.score||0,fourth=unique[3]?.score||0,count=fifth>=76?5:fourth>=70?4:3;
  return unique.slice(0,Math.max(3,Math.min(5,count))).map(x=>x.label)
}
function managerGMProfile(managerId){
  const id=String(managerId),league=managerTendencyLeague(),keys=['trade','youth','winNow','draft','waiver','risk','asset','star'],labels={trade:'Trade Activity',youth:'Youth Focus',winNow:'Win-Now Focus',draft:'Draft Capital',waiver:'Waiver Activity',risk:'Risk Appetite',asset:'Asset Management',star:'Star Power'},icons={trade:'🤝',youth:'🌱',winNow:'🏆',draft:'📈',waiver:'⚡',risk:'🎲',asset:'💼',star:'🧲'},r=Object.fromEntries(keys.map(k=>[k,league.ratings[k][id]||25])),picks=managerFuturePickCounts(id),avgAge=managerAverageAge(id),types=archetypeCandidates(r,picks,avgAge),primary=types[0],secondary=types[1],overall=Math.round(r.trade*.12+r.youth*.12+r.winNow*.16+r.draft*.11+r.waiver*.08+r.risk*.10+r.asset*.17+r.star*.14),traits=managerTraits(r,picks,avgAge),report=managerScoutReport(managerName(id),r,primary,secondary);
  const rows=keys.map(k=>({key:k,label:labels[k],icon:icons[k],rating:r[k],rank:rankForRating(k,id,league)})),weaknesses=managerWeaknesses(id,r,picks,avgAge);return{...league,r,rows,picks,avgAge,primary,secondary,overall,traits,weaknesses,report}
}
function gmProfileHTML(gm){const updated=gm.week?`Updated weekly · Through Week ${gm.week}`:'Pre-season profile · Recalculates weekly once games begin',weaknesses=Array.isArray(gm.weaknesses)&&gm.weaknesses.length?gm.weaknesses:['Needs to trade more','Leaves value on the waiver wire','Needs more reliable production'];return `<section class="manager-profile-card gm-profile-card"><div class="gm-profile-top"><div><span class="eyebrow">GM PROFILE</span><div class="gm-archetype-line"><span class="gm-archetype-icon">${gm.primary.icon}</span><div><h3>${esc(gm.primary.name)}</h3><p>Secondary: ${gm.secondary.icon} ${esc(gm.secondary.name)}</p></div></div></div><div class="gm-updated-note">${esc(updated)}</div></div><div class="gm-tendency-grid">${gm.rows.map(x=>`<div class="gm-tendency"><div class="gm-tendency-head"><span>${x.icon} ${esc(x.label)}</span><strong>${x.rating} <small>#${x.rank}</small></strong></div><div class="gm-rating-track"><i style="width:${x.rating}%"></i></div></div>`).join('')}</div><div class="gm-profile-bottom"><div class="gm-profile-character"><div class="gm-traits"><span class="eyebrow">TENDENCIES</span>${gm.traits.map(x=>`<span class="gm-trait">✓ ${esc(x)}</span>`).join('')||'<span class="profile-muted">Profile will sharpen as more league activity is recorded.</span>'}</div><div class="gm-traits gm-weaknesses"><span class="eyebrow">WEAKNESSES</span>${weaknesses.slice(0,5).map(x=>`<span class="gm-trait gm-weakness">✕ ${esc(x)}</span>`).join('')}</div></div><div class="gm-scout-report"><span class="eyebrow">SCOUT\'S REPORT</span><p>“${esc(gm.report)}”</p></div></div></section>`}


function draftGamesPlayed(playerId,season){
  return Number(state.seasonTotalMeta?.[String(season)]?.[String(playerId)]?.gamesPlayed||state.gameLogMeta?.[String(season)]?.[String(playerId)]?.gamesPlayed||0)
}
function latestDraftAverage(playerId){
  const seasons=[...new Set(state.bundles.map(b=>String(b.league?.season||'')))].filter(Boolean).sort((a,b)=>Number(b)-Number(a));
  for(const season of seasons){
    const avg=Number(seasonAverageMap(season)?.[String(playerId)]||0);
    if(avg>0)return avg
  }
  return Number(latestKnownAverage(String(playerId))||0)
}
function currentDraftValue(playerId){
  const avg=latestDraftAverage(playerId);
  return avg>0?playerDynastyValue(String(playerId),avg,Date.now()):0
}
function eligibleDraftClassRows(){
  const bySeason={};
  (state.draftSelections||[]).forEach(p=>{const season=String(p?.season||'');if((season==='2025'||season==='2026')&&p?.isRookieDraft===true&&p?.playerId&&p?.pickedBy)(bySeason[season]??=[]).push(p)});
  const rows=[];
  Object.entries(bySeason).forEach(([season,picks])=>{
    // A class remains completely excluded until at least one player from that
    // class has appeared in three NBA games.
    if(!picks.some(p=>draftGamesPlayed(p.playerId,season)>=3))return;
    const ranked=picks.map(p=>({...p,currentAverage:latestDraftAverage(p.playerId),currentValue:currentDraftValue(p.playerId)})).sort((a,b)=>b.currentValue-a.currentValue||b.currentAverage-a.currentAverage||a.overallPick-b.overallPick||a.playerId.localeCompare(b.playerId));
    ranked.forEach((p,index)=>rows.push({...p,redraftRank:index+1,draftScore:Number(p.overallPick)-(index+1)}))
  });
  return rows
}
function managerDraftResume(managerId){
  const id=String(managerId),picks=eligibleDraftClassRows().filter(p=>String(p.pickedBy)===id);
  const steals=picks.filter(p=>Number(p.draftScore)>0).sort((a,b)=>b.draftScore-a.draftScore||a.overallPick-b.overallPick);
  const busts=picks.filter(p=>Number(p.draftScore)<0).sort((a,b)=>a.draftScore-b.draftScore||a.overallPick-b.overallPick);
  const totalScore=picks.reduce((sum,p)=>sum+Number(p.draftScore||0),0),averageScore=picks.length?totalScore/picks.length:0;
  const hitRate=picks.length?picks.filter(p=>Number(p.draftScore)>0).length/picks.length:0,missRate=picks.length?picks.filter(p=>Number(p.draftScore)<0).length/picks.length:0;
  return{managerId:id,picks,count:picks.length,totalScore,averageScore,hitRate,missRate,biggestSteal:steals[0]||null,biggestBust:busts[0]||null}
}
function managerTradeRecordScore(managerId){
  const id=String(managerId),trades=managerTrades(id);let score=0,wins=0,losses=0,ties=0;
  trades.forEach(t=>{const results=mids(t).map(mid=>({id:String(mid),net:Number(tradeSideMetrics(t,mid).net||0)}));if(results.length<2)return;const mine=results.find(x=>x.id===id);if(!mine)return;const max=Math.max(...results.map(x=>x.net)),min=Math.min(...results.map(x=>x.net));if(max-min<2){ties++;return}if(mine.net===max){score++;wins++}else if(mine.net===min){score--;losses++}else ties++});
  return{score,wins,losses,ties,total:trades.length}
}
function managerTradingRaw(managerId){return managerTradeRecordScore(managerId).score}
function managerTradeLetterGrade(score){const n=Number(score)||0;if(n>=15)return'A+';if(n>=10)return'A';if(n>=6)return'B+';if(n>=2)return'C+';if(n>=-1)return'C';if(n>=-5)return'D';if(n>=-10)return'D-';return'F'}
function managerDepthRaw(managerId){
  const season=String(currentBundle()?.league?.season||'2026'),current=seasonAverageMap(season),fallback=seasonAverageMap('2025');
  const values=currentRosterIds(managerId).map(pid=>{const avg=Number(current[pid]||fallback[pid]||latestKnownAverage(pid)||0);return playerDynastyValue(pid,avg,Date.now())}).filter(v=>v>0).sort((a,b)=>b-a);
  if(!values.length)return 0;
  const top12=values.slice(0,12),bench=top12.slice(4),benchAverage=bench.length?bench.reduce((a,b)=>a+b,0)/bench.length:0;
  const productive=values.filter(v=>v>=18).length,elite=values.filter(v=>v>=35).length;
  return benchAverage*1.8+productive*4+Math.min(elite,4)*2
}
function managerLetterGrade(rating){
  const n=Number(rating)||0;
  if(n>=94)return'A+';if(n>=88)return'A';if(n>=82)return'A-';if(n>=76)return'B+';if(n>=70)return'B';if(n>=64)return'B-';if(n>=58)return'C+';if(n>=52)return'C';if(n>=46)return'C-';if(n>=38)return'D';return'F'
}
function managerGradesLeague(){
  if(state.computedCache.managerGrades)return state.computedCache.managerGrades;
  const ids=[...state.managers.keys()],tendency=managerTendencyLeague(),raw={trading:{},drafting:{},development:{},building:{}},draftResumes={},depthRaw={};
  ids.forEach(id=>{
    const r=tendency.ratings,resume=managerDraftResume(id);draftResumes[id]=resume;
    raw.trading[id]=managerTradingRaw(id);
    const sampleConfidence=Math.min(1,Math.sqrt(resume.count/4));
    raw.drafting[id]=(resume.averageScore*2.2+(resume.hitRate-resume.missRate)*5)*(.55+.45*sampleConfidence);
    raw.development[id]=(r.youth[id]||25)*.55+(r.waiver[id]||25)*.25+(r.asset[id]||25)*.20;
    depthRaw[id]=managerDepthRaw(id);
    raw.building[id]=(r.asset[id]||25)*.28+(r.star[id]||25)*.18+(r.winNow[id]||25)*.20+(r.draft[id]||25)*.08
  });
  const depthRatings=leagueScale(depthRaw),ratings={trading:{...raw.trading},drafting:calibratedLeagueScale(raw.drafting,45,91),development:leagueScale(raw.development),building:{}},grades={};
  ids.forEach(id=>{ratings.building[id]=Math.round((leagueScale(raw.building)[id]||25)*.62+(depthRatings[id]||25)*.38)});
  ids.forEach(id=>grades[id]={trading:managerTradeLetterGrade(ratings.trading[id]),drafting:managerLetterGrade(ratings.drafting[id]),development:managerLetterGrade(ratings.development[id]),building:managerLetterGrade(ratings.building[id])});
  return state.computedCache.managerGrades={raw,ratings,grades,draftResumes}
}
function rookiePickLabel(pick){const teams=Math.max(1,Number(pick?.teamCount)||8),overall=Math.max(1,Number(pick?.overallPick)||1),round=Math.floor((overall-1)/teams)+1,slot=((overall-1)%teams)+1;return`${round}.${String(slot).padStart(2,'0')}`}
function managerGradePlayerHTML(label,item){
  if(!item)return`<div class="manager-draft-highlight empty"><span>${esc(label)}</span><small>—</small></div>`;
  const id=String(item.playerId||item.id||''),name=playerName(id),avatar=`https://sleepercdn.com/content/nba/players/${id}.jpg`;
  return`<div class="manager-draft-highlight"><span>${esc(label)}</span><div><span class="manager-grade-player-avatar"><img src="${esc(avatar)}" alt="" loading="lazy" onerror="this.style.display='none'"></span>${playerLink(id,name,'manager-grade-player-name')}</div></div>`
}
function frontOfficeTradeKey(raw){return String(raw?.transaction_id||raw?.created||'')}
function managerGradePackageHTML(label,item){
  if(!item)return`<div class="manager-draft-highlight manager-trade-package-highlight empty"><span>${esc(label)}</span><small>—</small></div>`;
  const names=(item.assetNames||[]).slice(0,5),extra=Math.max(0,(item.assetNames||[]).length-names.length),lead=String(item.leadPlayerId||''),avatar=lead?`https://sleepercdn.com/content/nba/players/${lead}.jpg`:'',key=frontOfficeTradeKey(item.transaction);
  return`<div class="manager-draft-highlight manager-trade-package-highlight"><span>${esc(label)}</span><button type="button" class="manager-package-summary manager-package-open" data-front-office-trade="${esc(key)}" aria-label="View ${esc(label)} trade package">${lead?`<span class="manager-grade-player-avatar"><img src="${esc(avatar)}" alt="" loading="lazy" onerror="this.style.display='none'"></span>`:''}<span class="manager-package-names">${names.map(name=>`<small>${esc(name)}</small>`).join('')}${extra?`<small>+${extra} more</small>`:''}</span></button></div>`
}
function openFrontOfficeTrade(key){
  const trade=state.trades.find(raw=>frontOfficeTradeKey(raw)===String(key));if(!trade)return;
  const modal=$("globalSearchModal"),target=$("globalSearchResults"),title=$("globalSearchTitle");if(!modal||!target)return;
  if(title)title.textContent='Front Office Trade Package';
  target.innerHTML=`<div class="global-search-trade-view"><span class="global-search-type type-trade">Trade package</span><h3>${esc(mids(trade).map(id=>managerName(id,trade)).join(' ↔ '))}</h3><p>${esc(fmt(trade.created))} · ${esc(trade.season_label||transactionSeason(trade)+' season')}</p><div class="trade-detail-body">${tradeDetailsHTML(trade)}</div></div>`;
  modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.classList.add('global-search-open');
}
function transactionSeason(raw){
  const t=raw||{},bundle=bundleForTrade(t)||state.bundles.find(b=>String(b.league?.league_id||'')===String(t.league_id||''));
  if(bundle?.league?.season)return String(bundle.league.season);
  const labelled=String(t.season_label||'').match(/20\d{2}/)?.[0];
  if(labelled)return labelled;
  const date=new Date(Number(t.created)||Date.now()),year=date.getFullYear();
  return String(date.getMonth()<7?year-1:year)
}
function averageAtAcquisition(playerId,raw){
  const id=String(playerId),t=raw||{},season=transactionSeason(t),cutoff=Number(t.created)||Date.now(),scoring=bundleForSeason(season)?.league?.scoring_settings||state.modelBundle?.league?.scoring_settings||{},rows=safeArray(state.gameLogs?.[season]?.[id]);
  const played=rows.map(row=>({date:gameDateValue(row),fpts:rawFantasyPoints(row,scoring),row})).filter(x=>x.date&&x.date.getTime()<=cutoff&&gameWasPlayed(x.row)&&Number.isFinite(x.fpts));
  if(played.length>=3)return played.reduce((sum,x)=>sum+x.fpts,0)/played.length;
  const snapshot=Number(t.player_averages?.[id]??t.metadata?.player_averages?.[id]??t.settings?.player_averages?.[id]);
  if(Number.isFinite(snapshot)&&snapshot>0)return snapshot;
  return Number(tradeSeasonAverage(id,t)||playerSeasonAverage(id,season)||latestKnownAverage(id)||0)
}
function playerPerformanceBeforeTrade(playerId,raw){
  const id=String(playerId),t=raw||{},season=String(transactionSeason(t)),cutoff=Number(t.created)||Date.now(),scoring=bundleForSeason(season)?.league?.scoring_settings||state.modelBundle?.league?.scoring_settings||{},rows=safeArray(state.gameLogs?.[season]?.[id]);
  const played=rows.map(row=>({date:gameDateValue(row),fpts:rawFantasyPoints(row,scoring),row})).filter(x=>x.date&&x.date.getTime()<=cutoff&&gameWasPlayed(x.row)&&Number.isFinite(x.fpts));
  if(played.length){return{average:played.reduce((sum,x)=>sum+x.fpts,0)/played.length,gamesPlayed:played.length,season,source:'pre-trade-games'}}
  const year=Number(season);
  if(Number.isFinite(year)){
    for(let prior=year-1;prior>=year-3;prior--){
      const avg=Number(seasonAverageMap(String(prior))?.[id]||playerSeasonAverage(id,String(prior))||0);
      if(avg>0){
        const games=Number(state.gameLogMeta?.[String(prior)]?.[id]?.gamesPlayed||state.seasonTotalMeta?.[String(prior)]?.[id]?.gamesPlayed||1);
        return{average:avg,gamesPlayed:Math.max(1,games),season:String(prior),source:'previous-season'}
      }
    }
  }
  return{average:0,gamesPlayed:0,season,source:'no-prior-games'}
}
function currentPlayerIMOValue(playerId){
  const id=String(playerId),current=playerCurrentAverage(id),avg=Number(current.avg||latestKnownAverage(id)||0);
  return{average:avg,value:avg>0?playerDynastyValue(id,avg,Date.now()):0,season:current.season}
}
function transactionManagerForRoster(raw,rosterId){
  const t=raw||{},rid=String(rosterId??''),direct=t.roster_owner_map?.[rid];
  if(direct!=null)return String(direct);
  const bundle=state.bundles.find(b=>String(b.league?.league_id||'')===String(t.league_id||''))||bundleForSeason(transactionSeason(t));
  return bundle?.ownerByRoster?.[rid]!=null?String(bundle.ownerByRoster[rid]):''
}
function managerTradeAcquisitions(managerId){
  const id=String(managerId),events=[];
  managerTrades(id).forEach(raw=>{
    const t=normaliseTrade(raw),created=Number(t.created)||0,season=transactionSeason(t);
    Object.entries(t.adds||{}).forEach(([playerId,rosterId])=>{
      const recipient=String(t.roster_owner_map?.[String(rosterId)]||transactionManagerForRoster(t,rosterId));
      if(recipient!==id||!playerId||playerId==='0')return;
      const prior=playerPerformanceBeforeTrade(playerId,t),acquisitionAverage=Number(prior.average||0),acquisitionValue=acquisitionAverage>0?playerDynastyValue(String(playerId),acquisitionAverage,created):0,current=currentPlayerIMOValue(playerId);
      events.push({method:'trade',playerId:String(playerId),created,season,acquisitionAverage,acquisitionGamesPlayed:Number(prior.gamesPlayed||0),hadPlayedBeforeTrade:Number(prior.gamesPlayed||0)>0,acquisitionValue,currentAverage:current.average,currentValue:current.value,valueChange:current.value-acquisitionValue,ageAtAcquisition:playerAgeAt(String(playerId),created),transaction:t})
    })
  });
  return events
}
function managerWaiverAcquisitions(managerId){
  const id=String(managerId),events=[];
  allLeagueTransactions().filter(t=>['waiver','free_agent'].includes(String(t.type||''))&&(!t.status||t.status==='complete')).forEach(t=>{
    const created=Number(t.created)||0,season=transactionSeason(t);
    Object.entries(t.adds||{}).forEach(([playerId,rosterId])=>{
      if(transactionManagerForRoster(t,rosterId)!==id||!playerId||playerId==='0')return;
      const acquisitionAverage=averageAtAcquisition(playerId,t),acquisitionValue=acquisitionAverage>0?playerDynastyValue(String(playerId),acquisitionAverage,created):0,current=currentPlayerIMOValue(playerId);
      events.push({method:String(t.type||'waiver'),playerId:String(playerId),created,season,acquisitionAverage,acquisitionValue,currentAverage:current.average,currentValue:current.value,valueChange:current.value-acquisitionValue,ageAtAcquisition:playerAgeAt(String(playerId),created),transaction:t})
    })
  });
  return events
}
function currentAssetValue(asset){
  if(!asset)return 0;
  if(asset.type==='player'&&asset.id)return currentPlayerIMOValue(String(asset.id)).value;
  if(asset.type==='pick'){
    if(asset.id){const current=currentPlayerIMOValue(String(asset.id));if(current.value>0)return current.value}
    return Number(asset.value)||0
  }
  return Number(asset.value)||0
}
function compactTradeAssetName(asset){
  if(!asset)return'Unknown asset';
  if(asset.type==='player'&&asset.id)return playerName(String(asset.id));
  if(asset.type==='pick'){
    if(asset.id)return playerName(String(asset.id));
    return String(asset.name||'Draft pick').replace(/\s*\([^)]*pick[^)]*\)\s*$/i,'').trim()||'Draft pick'
  }
  return String(asset.name||'Unknown asset')
}
function managerTradePackages(managerId){
  const id=String(managerId),now=Date.now(),rows=[];
  managerTrades(id).forEach(raw=>{
    const t=normaliseTrade(raw),created=Number(t.created)||0;
    const received=tradeAssets(t)[id]||[];
    let sent=tradeOutgoingAssets(t)[id]||[];
    if(!sent.length&&mids(t).length===2){const other=mids(t).find(x=>String(x)!==id);sent=tradeAssets(t)[other]||[]}
    const receivedCurrent=received.reduce((sum,a)=>sum+currentAssetValue(a),0);
    const sentCurrent=sent.reduce((sum,a)=>sum+currentAssetValue(a),0);
    const receivedAtTrade=received.reduce((sum,a)=>sum+(Number(a.value)||0),0);
    const sentAtTrade=sent.reduce((sum,a)=>sum+(Number(a.value)||0),0);
    const currentNet=receivedCurrent-sentCurrent;
    const valueSwing=(receivedCurrent-receivedAtTrade)-(sentCurrent-sentAtTrade);
    const receivedPlayerAverages=received.filter(a=>a.type==='player'&&a.id).map(a=>currentPlayerIMOValue(String(a.id)).average).filter(Number.isFinite);
    const seasonRanking=Object.values(seasonAverageMap(playerCurrentAverage(String(received.find(a=>a.type==='player'&&a.id)?.id||'')).season)||{}).map(Number).filter(v=>v>0).sort((a,b)=>b-a);
    const top20Cutoff=seasonRanking.length>=20?seasonRanking[19]:Infinity;
    const hasTop20Player=receivedPlayerAverages.some(avg=>avg>=top20Cutoff);
    rows.push({method:'trade-package',created,ageDays:(now-created)/864e5,transaction:t,received,sent,receivedCurrent,sentCurrent,receivedAtTrade,sentAtTrade,currentNet,valueSwing,hasTop20Player,
      assetNames:received.map(compactTradeAssetName).filter(Boolean),
      leadPlayerId:String(received.find(a=>a.type==='player'&&a.id)?.id||received.find(a=>a.id)?.id||'')
    })
  });
  return rows
}
function playerDepartureAfter(managerId,playerId,created){
  const id=String(managerId),pid=String(playerId),events=[];
  allLeagueTransactions().forEach(raw=>{
    const t=normaliseTrade(raw),ts=Number(t.created)||0;if(ts<=created)return;
    const rid=t.drops?.[pid];if(rid==null)return;
    if(transactionManagerForRoster(t,rid)===id)events.push(t)
  });
  return events.sort((a,b)=>(Number(a.created)||0)-(Number(b.created)||0))[0]||null
}
function valueAtTransactionDate(playerId,transaction){
  const avg=averageAtAcquisition(String(playerId),transaction);
  return avg>0?playerDynastyValue(String(playerId),avg,Number(transaction.created)||Date.now()):0
}
function discoveryOwnershipResult(managerId,event){
  const departure=playerDepartureAfter(managerId,event.playerId,event.created);
  const endValue=departure?valueAtTransactionDate(event.playerId,departure):event.currentValue;
  const endAverage=departure?averageAtAcquisition(event.playerId,departure):event.currentAverage;
  return{...event,departure,endValue,endAverage,capturedValueChange:endValue-event.acquisitionValue,stillOwned:!departure}
}
function managerTradeSales(managerId){
  const id=String(managerId),events=[];
  managerTrades(id).forEach(raw=>{
    const t=normaliseTrade(raw),created=Number(t.created)||0,season=transactionSeason(t);
    Object.entries(t.drops||{}).forEach(([playerId,rosterId])=>{
      const seller=String(t.roster_owner_map?.[String(rosterId)]||transactionManagerForRoster(t,rosterId));
      if(seller!==id||!playerId||playerId==='0')return;
      const prior=playerPerformanceBeforeTrade(playerId,t),saleAverage=Number(prior.average||0),saleValue=saleAverage>0?playerDynastyValue(String(playerId),saleAverage,created):0,current=currentPlayerIMOValue(playerId);
      events.push({method:'trade-sale',playerId:String(playerId),created,season,saleAverage,saleGamesPlayed:Number(prior.gamesPlayed||0),hadPlayedBeforeTrade:Number(prior.gamesPlayed||0)>0,saleValue,currentAverage:current.average,currentValue:current.value,valueChangeAfterSale:current.value-saleValue,ageAtSale:playerAgeAt(String(playerId),created),transaction:t})
    })
  });
  return events
}
function managerAllRookiePicks(managerId){
  const id=String(managerId),seen=new Set();
  return (state.draftSelections||[])
    .filter(p=>p?.isRookieDraft===true&&p?.playerId&&String(p?.pickedBy)===id)
    .filter(p=>{const key=`${p.draftId||p.season}|${p.playerId}|${p.overallPick}`;if(seen.has(key))return false;seen.add(key);return true})
    .sort((a,b)=>Number(b.season||0)-Number(a.season||0)||Number(a.overallPick||999)-Number(b.overallPick||999));
}
function managerPicksMadeHTML(managerId){
  const total=managerAllRookiePicks(managerId).length;
  return`<div class="manager-draft-highlight manager-picks-made"><span>Picks Made</span><button type="button" class="manager-picks-total" data-open-manager-picks="${esc(String(managerId))}" aria-label="View all ${total} rookie draft picks">${total}</button></div>`
}
function managerGradesHTML(managerId){
  const league=managerGradesLeague(),id=String(managerId),grades=league.grades[id]||{},items=[['Trading',grades.trading],['Drafting',grades.drafting],['Player Development',grades.development],['Team Building',grades.building]];
  return`<section class="manager-grades-row manager-grades-row-lite" aria-label="Manager grades"><div class="manager-grades-title"><span class="eyebrow">MANAGER GRADES</span></div><div class="manager-grade-items">${items.map(([label,grade])=>`<div class="manager-grade-item"><span>${esc(label)}</span><strong class="manager-grade-badge ${gradeClass(grade||'F')}">${esc(grade||'—')}</strong></div>`).join('')}</div></section>`
}

function managerTradeLedgerSeasons(){
  const current=String(currentLeagueBundle()?.league?.season||state.modelBundle?.league?.season||'2026');
  const seasons=[current,...safeArray(state.bundles).map(b=>String(b?.league?.season||'')).filter(Boolean)]
    .filter((value,index,array)=>array.indexOf(value)===index)
    .sort((a,b)=>Number(b)-Number(a));
  return seasons.length?seasons:[current]
}
function managerTradeLedgerSeasonLabel(season){
  const year=Number(season);return Number.isFinite(year)?`${year}/${String(year+1).slice(-2)}`:String(season||'Season')
}
function tradeLedgerRoundLabel(round){
  const n=Number(round)||1,mod100=n%100,mod10=n%10;
  const suffix=mod100>=11&&mod100<=13?'th':mod10===1?'st':mod10===2?'nd':mod10===3?'rd':'th';
  return `${n}${suffix}`
}
function managerNetTradeLedger(managerId,season){
  const id=String(managerId),targetSeason=String(season),net=new Map(),tradeAcquiredAt=new Map();
  const adjust=(key,delta,asset)=>{const current=net.get(key)||{delta:0,asset};current.delta+=delta;if(asset)current.asset=asset;net.set(key,current)};
  safeArray(state.trades).forEach(raw=>{
    if(!raw||transactionSeason(raw)!==targetSeason||String(raw.type||'trade')!=='trade'||(raw.status&&raw.status!=='complete'))return;
    const t=normaliseTrade(raw),created=Number(t.created||t.created_at||t.timestamp||0);
    Object.entries(t.adds||{}).forEach(([playerId,rosterId])=>{if(transactionManagerForRoster(t,rosterId)!==id||!playerId||playerId==='0')return;const pid=String(playerId);adjust(`player|${pid}`,1,{type:'player',id:pid});tradeAcquiredAt.set(pid,Math.max(Number(tradeAcquiredAt.get(pid)||0),created))});
    Object.entries(t.drops||{}).forEach(([playerId,rosterId])=>{
      const pid=String(playerId||'');
      if(transactionManagerForRoster(t,rosterId)!==id||!pid||pid==='0')return;
      // Sleeper can include roster cuts inside a trade transaction. Only count
      // a player as TRADED OUT when that exact player is also added to another
      // roster in the same transaction. A drop with no recipient is a release,
      // not a trade exit, and must stay out of the net trade ledger.
      const recipientRoster=t.adds?.[pid];
      if(recipientRoster==null||String(recipientRoster)===String(rosterId))return;
      adjust(`player|${pid}`,-1,{type:'player',id:pid})
    });
    safeArray(t.draft_picks).forEach(p=>{
      if(!p||typeof p!=='object')return;
      const key=pickAssetKey(p),incoming=transactionManagerForRoster(t,p.owner_id)===id,outgoing=transactionManagerForRoster(t,p.previous_owner_id)===id;
      const asset={type:'pick',key,pick:{...p,_trade:t},season:String(p.season||'Future'),round:Number(p.round)||1,originalOwner:pickOriginalOwner(p,t)||pickOriginalOwnerNameByKey(key)};
      if(incoming)adjust(`pick|${key}`,1,asset);
      if(outgoing)adjust(`pick|${key}`,-1,asset)
    })
  });
  // A player acquired by trade should not remain in the net ledger if that
  // manager subsequently released them during the same season. Waiver-type
  // transactions are included because Sleeper can record a drop made while
  // submitting a waiver claim as a waiver transaction rather than free_agent.
  const releasedAfterTrade=new Set();
  allLeagueTransactions().forEach(raw=>{
    if(!raw||transactionSeason(raw)!==targetSeason||!['free_agent','waiver'].includes(String(raw.type||''))||(raw.status&&raw.status!=='complete'))return;
    const created=Number(raw.created||raw.created_at||raw.timestamp||0);
    Object.entries(raw.drops||{}).forEach(([playerId,rosterId])=>{
      const pid=String(playerId||''),acquired=Number(tradeAcquiredAt.get(pid)||0);
      if(!pid||pid==='0'||!acquired||transactionManagerForRoster(raw,rosterId)!==id)return;
      if(!created||created>=acquired)releasedAfterTrade.add(pid)
    })
  });
  const decorate=entry=>{
    const asset=entry.asset||{};
    if(asset.type==='player'){
      const current=playerCurrentAverage(asset.id),avg=Number(current?.avg||latestKnownAverage(asset.id)||0),age=playerAgeAt(asset.id,Date.now());
      return{...asset,name:playerName(asset.id),avg,age,avatar:`https://sleepercdn.com/content/nba/players/${asset.id}.jpg`}
    }
    return{...asset,name:`${asset.season} ${asset.originalOwner||'Original Team'} ${tradeLedgerRoundLabel(asset.round)}`}
  };
  const incoming=[],outgoing=[];
  net.forEach(entry=>{if(entry.delta>0){if(entry.asset?.type==='player'&&releasedAfterTrade.has(String(entry.asset.id)))return;incoming.push(decorate(entry))}else if(entry.delta<0)outgoing.push(decorate(entry))});
  const sortAssets=(a,b)=>a.type===b.type?(a.type==='player'?(Number(b.avg)||0)-(Number(a.avg)||0)||String(a.name).localeCompare(String(b.name)):(Number(a.season)||9999)-(Number(b.season)||9999)||(Number(a.round)||9)-(Number(b.round)||9)||String(a.name).localeCompare(String(b.name))):(a.type==='player'?-1:1);
  incoming.sort(sortAssets);outgoing.sort(sortAssets);
  return{incoming,outgoing}
}
function managerTradeLedgerAssetHTML(asset){
  if(asset.type==='player'){
    const initials=String(asset.name||'').split(/\s+/).map(x=>x[0]).filter(Boolean).slice(0,2).join('');
    return `<div class="manager-ledger-asset manager-ledger-player"><span class="manager-ledger-avatar"><img src="${esc(asset.avatar)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span>${esc(initials)}</span></span><div class="manager-ledger-copy">${playerLink(asset.id,asset.name,'manager-ledger-player-link')}<small>${asset.avg>0?`${asset.avg.toFixed(2)} FPTS/G · `:''}Age ${esc(String(asset.age||'—'))}</small></div></div>`
  }
  return `<div class="manager-ledger-asset manager-ledger-pick"><span class="manager-ledger-pick-icon">◆</span><div class="manager-ledger-copy"><strong>${esc(asset.name)}</strong><small>Draft pick</small></div></div>`
}
function managerTradeLedgerToggleLabel(hiddenCount,expanded){
  return expanded?'Show top 3':`Show ${hiddenCount} more`
}
function managerTradeLedgerInnerHTML(managerId,season){
  const ledger=managerNetTradeLedger(managerId,season),visibleCount=3,column=(title,rows,type)=>{
    if(!rows.length)return `<div class="manager-ledger-column ${type}"><div class="manager-ledger-column-head"><span>${esc(title)}</span><strong>0</strong></div><div class="manager-ledger-assets"><div class="manager-ledger-empty">No net trade movement</div></div></div>`;
    const hiddenCount=Math.max(0,rows.length-visibleCount);
    const items=rows.map((asset,index)=>{
      const classes=['manager-ledger-item-wrap'];
      if(index>=visibleCount)classes.push('is-extra');
      return `<div class="${classes.join(' ')}">${managerTradeLedgerAssetHTML(asset)}</div>`
    }).join('');
    const toggle=hiddenCount?`<button type="button" class="manager-ledger-toggle" data-manager-ledger-toggle aria-expanded="false">${esc(managerTradeLedgerToggleLabel(hiddenCount,false))}</button>`:'';
    return `<div class="manager-ledger-column ${type}"><div class="manager-ledger-column-head"><span>${esc(title)}</span><strong>${rows.length}</strong></div><div class="manager-ledger-assets">${items}</div>${toggle}</div>`
  };
  return `<div class="manager-ledger-columns">${column('TRADED IN',ledger.incoming,'in')}${column('TRADED OUT',ledger.outgoing,'out')}</div>`
}
function managerTradeLedgerHTML(managerId,selectedSeason=null){
  const seasons=managerTradeLedgerSeasons(),season=String(selectedSeason||seasons[0]||'2026'),options=seasons.map(value=>`<option value="${esc(value)}"${String(value)===season?' selected':''}>${esc(managerTradeLedgerSeasonLabel(value))}</option>`).join('');
  return `<section class="manager-profile-card manager-trade-ledger-card" data-manager-trade-ledger="${esc(String(managerId))}"><div class="manager-profile-card-heading manager-ledger-heading"><div><span class="eyebrow">SEASON MOVEMENT</span><h3>Net Trade Ledger</h3><p>Net assets added and moved out through trades only.</p></div><label class="manager-ledger-season"><span>Season</span><select data-manager-ledger-season data-manager-id="${esc(String(managerId))}">${options}</select></label></div><div data-manager-ledger-body>${managerTradeLedgerInnerHTML(managerId,season)}</div></section>`
}
function managerPicksMadeModalHTML(managerId){
  const picks=managerAllRookiePicks(managerId);
  const rows=picks.map(p=>`<div class="manager-picks-row"><span class="manager-picks-pick">${esc(String(p.season||'—'))} ${esc(rookiePickLabel(p))}</span><span class="manager-picks-player">${playerLink(String(p.playerId),playerName(String(p.playerId)),'manager-picks-player-link')}</span></div>`).join('');
  return`<div class="manager-picks-heading"><span class="eyebrow">ROOKIE DRAFT HISTORY</span><h2>${esc(managerName(managerId))} Picks Made</h2><p>${picks.length} total rookie draft pick${picks.length===1?'':'s'}.</p></div><div class="manager-picks-list">${rows||'<div class="profile-empty">No rookie draft selections found.</div>'}</div>`
}
function openManagerPicksMade(managerId){const modal=$("managerPicksMadeModal"),content=$("managerPicksMadeContent");if(!modal||!content)return;content.innerHTML=managerPicksMadeModalHTML(String(managerId));modal.classList.add("open");modal.setAttribute("aria-hidden","false");modal.dataset.managerId=String(managerId);document.body.classList.add("manager-picks-open")}
function closeManagerPicksMade(){const modal=$("managerPicksMadeModal");if(!modal)return;modal.classList.remove("open");modal.setAttribute("aria-hidden","true");document.body.classList.remove("manager-picks-open")}
function ensureManagerGradeStyles(){
  if(document.getElementById('managerGradeStyles'))return;
  const style=document.createElement('style');style.id='managerGradeStyles';style.textContent=`
  .manager-grades-row{margin:14px 0 16px;padding:12px 14px;display:grid;grid-template-columns:1fr;gap:12px;align-items:stretch;border:1px solid rgba(148,163,184,.18);border-radius:14px;background:rgba(15,23,42,.34)}
  .manager-grades-title{white-space:nowrap}.manager-grade-items{display:grid;grid-template-columns:repeat(4,minmax(86px,1fr));gap:8px}.manager-grade-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 9px;border-radius:10px;background:rgba(255,255,255,.035)}
  .manager-grade-item>span{font-size:11px;line-height:1.2;color:var(--muted,#94a3b8)}.manager-grade-badge{display:grid;place-items:center;min-width:34px;height:28px;padding:0 7px;border-radius:8px;font-size:14px;line-height:1;font-weight:900}
  .manager-grade-badge.grade-a{color:#052e16;background:#4ade80}.manager-grade-badge.grade-b{color:#172554;background:#60a5fa}.manager-grade-badge.grade-c{color:#422006;background:#facc15}.manager-grade-badge.grade-d{color:#431407;background:#fb923c}.manager-grade-badge.grade-f{color:#450a0a;background:#f87171}
  .manager-draft-highlights{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-auto-rows:minmax(58px,auto);gap:8px;width:100%;height:auto!important;max-height:none!important;overflow:visible!important}.manager-draft-highlight{display:block!important;visibility:visible!important;opacity:1!important;min-width:0;min-height:58px;height:auto!important;max-height:none!important;overflow:visible!important;padding:6px 9px;border-left:1px solid rgba(148,163,184,.18)}.manager-draft-highlight>span{display:block;margin-bottom:4px;font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#94a3b8)}.manager-package-open{width:100%;padding:0;border:0;background:none;color:inherit;text-align:left;cursor:pointer}.manager-package-open:hover .manager-package-names small{text-decoration:underline;color:#fff}.manager-draft-highlight>div{display:flex;align-items:center;gap:8px;min-width:0}.manager-grade-player-avatar{width:26px;height:26px;border-radius:50%;overflow:hidden;background:rgba(148,163,184,.15);flex:0 0 auto}.manager-grade-player-avatar img{width:100%;height:100%;object-fit:cover}.manager-grade-player-name{padding:0;border:0;background:none;color:inherit;font:inherit;font-size:11px;font-weight:800;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.manager-grade-pick-label{margin-left:auto;padding:3px 5px;border:1px solid rgba(148,163,184,.18);border-radius:6px;color:var(--muted,#94a3b8);font-size:9px;font-weight:900;letter-spacing:.04em;white-space:nowrap}.manager-draft-highlight.empty small{font-size:16px}
  @media(max-width:900px){.manager-grades-title{display:none}.manager-draft-highlights{grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-auto-rows:minmax(64px,auto)}.manager-draft-highlight{border-left:0;border-top:1px solid rgba(148,163,184,.18);padding-top:9px}}
  @media(max-width:620px){.manager-grades-row{padding:10px;gap:10px;height:auto!important;max-height:none!important;overflow:visible!important}.manager-grade-items{grid-template-columns:repeat(2,1fr)}.manager-grade-item{padding:8px}.manager-draft-highlights{grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-auto-flow:row!important;height:auto!important;max-height:none!important;overflow:visible!important}.manager-grade-player-name{font-size:10px}}
  .manager-picks-made{display:flex!important;visibility:visible!important;opacity:1!important;flex-direction:column;justify-content:center}.manager-picks-total{width:max-content;padding:0;border:0;background:none;color:#fff;font:inherit;font-size:28px;font-weight:1000;line-height:1;cursor:pointer;text-decoration:underline;text-decoration-color:rgba(143,115,255,.7);text-underline-offset:5px}.manager-picks-total:hover{color:#c9bbff}
  .manager-profile-hero-actions,.manager-profile-mobile-actions{display:flex;flex-wrap:nowrap;gap:7px;align-items:center}.manager-profile-mobile-actions{display:none}.manager-profile-utility-btn,.manager-share-card-btn{appearance:none;width:36px!important;height:36px!important;min-width:36px!important;min-height:36px!important;padding:0!important;border-radius:10px!important;font:700 17px/1 system-ui,sans-serif!important;letter-spacing:0!important;text-transform:none!important;cursor:pointer;white-space:nowrap;display:inline-flex!important;align-items:center;justify-content:center;gap:0!important;position:relative;z-index:3}.manager-profile-utility-btn{border:1px solid rgba(143,115,255,.38)!important;background:rgba(143,115,255,.08)!important;color:#e8e1ff!important}.manager-profile-utility-btn:hover,.manager-profile-utility-btn:focus-visible{background:rgba(143,115,255,.16)!important;border-color:rgba(143,115,255,.68)!important;outline:none}.manager-share-card-btn{border:1px solid rgba(52,211,153,.38)!important;background:rgba(16,185,129,.08)!important;color:#d1fae5!important}.manager-share-card-btn:hover,.manager-share-card-btn:focus-visible{background:rgba(16,185,129,.16)!important;border-color:rgba(52,211,153,.68)!important;outline:none}.manager-share-card-btn.is-loading{opacity:.72;pointer-events:none}.manager-share-card-btn.is-success{background:rgba(34,197,94,.18)!important;border-color:rgba(74,222,128,.72)!important;color:#dcfce7!important}.manager-share-card-btn.is-error{background:rgba(239,68,68,.16)!important;border-color:rgba(248,113,113,.72)!important;color:#fee2e2!important}
  @media(max-width:680px){.manager-profile-hero-actions{display:none!important}.manager-profile-mobile-actions{display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;gap:8px!important;margin-top:12px!important;width:max-content!important}.manager-profile-mobile-actions .manager-profile-utility-btn,.manager-profile-mobile-actions .manager-share-card-btn{display:inline-flex!important;width:36px!important;height:36px!important;min-width:36px!important;min-height:36px!important;margin:0!important;padding:0!important}.manager-share-card-btn-mobile{display:inline-flex!important}.manager-share-card-btn-desktop{display:none!important}}
  .manager-trade-ledger-card{grid-column:1/-1}.manager-ledger-heading{align-items:flex-start}.manager-ledger-heading p{margin:4px 0 0;color:var(--muted,#94a3b8);font-size:11px}.manager-ledger-season{display:flex;align-items:center;gap:7px}.manager-ledger-season>span{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#94a3b8)}.manager-ledger-season select{appearance:none;border:1px solid rgba(148,163,184,.22);border-radius:9px;background:rgba(15,23,42,.72);color:#fff;padding:7px 28px 7px 9px;font:800 11px/1.2 system-ui,sans-serif;cursor:pointer}.manager-ledger-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.manager-ledger-column{min-width:0;border:1px solid rgba(148,163,184,.14);border-radius:12px;background:rgba(255,255,255,.025);overflow:hidden}.manager-ledger-column.in{border-top-color:rgba(74,222,128,.5)}.manager-ledger-column.out{border-top-color:rgba(248,113,113,.5)}.manager-ledger-column-head{display:flex;justify-content:space-between;align-items:center;padding:9px 10px;border-bottom:1px solid rgba(148,163,184,.12)}.manager-ledger-column-head span{font-size:10px;font-weight:900;letter-spacing:.09em}.manager-ledger-column.in .manager-ledger-column-head span{color:#86efac}.manager-ledger-column.out .manager-ledger-column-head span{color:#fca5a5}.manager-ledger-column-head strong{display:grid;place-items:center;min-width:22px;height:22px;border-radius:7px;background:rgba(148,163,184,.12);font-size:10px}.manager-ledger-assets{display:grid}.manager-ledger-item-wrap.is-extra{display:none}.manager-ledger-column.expanded .manager-ledger-item-wrap.is-extra{display:block}.manager-ledger-asset{display:flex;align-items:center;gap:9px;min-width:0;padding:9px 10px;border-bottom:1px solid rgba(148,163,184,.09)}.manager-ledger-column:not(.expanded) .manager-ledger-item-wrap:nth-last-child(2) .manager-ledger-asset,.manager-ledger-column:not(.expanded) .manager-ledger-item-wrap:last-child .manager-ledger-asset{border-bottom:0}.manager-ledger-column.expanded .manager-ledger-item-wrap:last-child .manager-ledger-asset{border-bottom:0}.manager-ledger-avatar{position:relative;display:grid;place-items:center;width:30px;height:30px;border-radius:50%;overflow:hidden;background:rgba(148,163,184,.12);flex:0 0 auto}.manager-ledger-avatar img{width:100%;height:100%;object-fit:cover}.manager-ledger-avatar>span{display:none;place-items:center;width:100%;height:100%;font-size:9px;font-weight:900}.manager-ledger-copy{min-width:0;display:flex;flex-direction:column;gap:2px}.manager-ledger-copy .manager-ledger-player-link,.manager-ledger-copy strong{padding:0;border:0;background:none;color:#fff;font:800 11px/1.25 system-ui,sans-serif;text-align:left;white-space:normal}.manager-ledger-copy small{color:var(--muted,#94a3b8);font-size:9px}.manager-ledger-pick-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:rgba(143,115,255,.1);color:#a78bfa;font-size:12px;flex:0 0 auto}.manager-ledger-empty{padding:14px 10px;color:var(--muted,#94a3b8);font-size:10px}.manager-ledger-player-link{cursor:pointer}.manager-ledger-player-link:hover{text-decoration:underline}.manager-ledger-toggle{display:block;width:calc(100% - 20px);margin:0 10px 10px;padding:8px 10px;border:1px solid rgba(148,163,184,.18);border-radius:10px;background:rgba(15,23,42,.56);color:var(--muted,#94a3b8);font:800 10px/1.2 system-ui,sans-serif;letter-spacing:.05em;text-transform:uppercase;cursor:pointer}.manager-ledger-toggle:hover,.manager-ledger-toggle:focus-visible{color:#fff;border-color:rgba(143,115,255,.42);outline:none}.manager-ledger-season select:focus-visible{outline:2px solid rgba(143,115,255,.75);outline-offset:2px}
  @media(max-width:680px){.manager-ledger-heading{gap:10px}.manager-ledger-season{width:100%;justify-content:space-between}.manager-ledger-season select{min-width:110px}.manager-ledger-columns{grid-template-columns:1fr}.manager-ledger-asset{padding:10px}.manager-ledger-avatar,.manager-ledger-pick-icon{width:34px;height:34px}.manager-ledger-copy .manager-ledger-player-link,.manager-ledger-copy strong{font-size:12px}.manager-ledger-copy small{font-size:10px}}
  `;document.head.appendChild(style)
}

function managerPowerMovement(managerId){
  const weeks=meaningfulWeeks(state.modelBundle);if(weeks.length<2)return{move:0,previous:null};
  const currentWeek=weeks.at(-1),previousWeek=weeks.at(-2),current=modelRows(state.modelBundle,currentWeek,'power').find(x=>String(x.id)===String(managerId)),previous=modelRows(state.modelBundle,previousWeek,'power').find(x=>String(x.id)===String(managerId));
  return{move:current&&previous?Number(previous.rank)-Number(current.rank):0,previous:previous?.rank||null}
}
function managerAvatarHTML(managerId,className='result-opponent-avatar'){
  const manager=state.managers.get(String(managerId));if(!manager)return'';
  return manager.avatar?`<span class="${className}"><img src="${esc(manager.avatar)}" alt="" loading="lazy"></span>`:`<span class="${className} fallback">${esc(manager.initials||manager.name.slice(0,2).toUpperCase())}</span>`
}
function managerSwitcherHTML(managerId){
  const currentId=String(managerId),current=state.managers.get(currentId),options=[...state.managers.values()].sort((a,b)=>a.name.localeCompare(b.name));
  const nativeOptions=options.map(m=>`<option value="${esc(m.id)}" ${m.id===currentId?'selected':''}>${esc(m.name)}</option>`).join('');
  return `<div class="manager-switcher" data-manager-switcher>
    <button type="button" class="manager-switcher-trigger" data-manager-switcher-trigger aria-expanded="false"><span>${esc(current?.name||'Manager')}</span><i>⌄</i></button>
    <label class="manager-switcher-native-label">Switch manager<select class="manager-switcher-native" data-mobile-manager-select aria-label="Switch manager">${nativeOptions}</select></label>
    <div class="manager-switcher-menu" hidden>${options.map(m=>{const avatar=m.avatar?`<img src="${esc(m.avatar)}" alt="" loading="lazy">`:`<span>${esc(m.initials||m.name.slice(0,2).toUpperCase())}</span>`;return `<button type="button" class="manager-switcher-option ${m.id===currentId?'active':''}" data-switch-manager="${esc(m.id)}">${avatar}<b>${esc(m.name)}</b>${m.id===currentId?'<small>Current</small>':''}</button>`}).join('')}</div>
  </div>`
}
const ARCHETYPE_GUIDE=[
  {icon:'🏗️',name:'The Rebuilder',description:'Operating with a long horizon, this front office prioritizes young talent, developmental upside, and future roster flexibility over short-term wins.'},
  {icon:'🤝',name:'The Wheel & Dealer',description:'One of the most active front offices in the league. Always testing the market, floating offers, and continually reshaping the roster through trades.'},
  {icon:'🦖',name:'The Veteran Chaser',description:'Built around proven, immediate production. Prefers established veterans with proven track records who can contribute win-now points right away.'},
  {icon:'🏆',name:'The Contender',description:'Assembled explicitly to win a championship right now. Boasts high-end production across the roster with a clear focus on maximizing their title window.'},
  {icon:'🎯',name:'The Talent Collector',description:'Concentrates top-tier, elite talent at the very top of the roster. Built around superstar players capable of deciding weekly matchups single-handedly.'},
  {icon:'💎',name:'Draft Capital King',description:'A premier asset accumulator who holds a stockpile of future draft picks, maintaining ultimate leverage and long-term optionality.'},
  {icon:'🛡️',name:'Diamond Hands',description:'Runs a patient, steady front office. Values roster continuity, chemistry, and calculated long-term moves over constant turnover and roster churn.'},
  {icon:'🌱',name:'Prospect Hunter',description:'Committed to a youth-led build. Consistently targets young players and emerging prospects whose best fantasy years are still ahead of them.'},
  {icon:'🎲',name:'The Gambler',description:'Embraces volatility and variance. Comfortable taking on high-risk, high-reward moves and blockbuster trades in pursuit of a massive payoff.'}
];
function openArchetypeGuide(currentArchetype='',secondaryArchetype=''){
  const modal=$("archetypeGuideModal");if(!modal)return;
  const list=$("archetypeGuideList");
  const current=String(currentArchetype||'').trim().toLowerCase(),secondary=String(secondaryArchetype||'').trim().toLowerCase();
  if(list){
    list.innerHTML=ARCHETYPE_GUIDE.map(x=>{const key=x.name.toLowerCase(),active=current&&key===current,isSecondary=!active&&secondary&&key===secondary,label=active?'<small>Current profile</small>':isSecondary?'<small class="secondary-label">Secondary profile</small>':'';return `<article class="archetype-guide-item${active?' current':isSecondary?' secondary':''}"${active?' aria-current="true"':''}><span>${x.icon}</span><div><h3>${esc(x.name)}${label}</h3><p>${esc(x.description)}</p></div></article>`}).join('');
  }
  modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');
  requestAnimationFrame(()=>$("archetypeGuideClose")?.focus({preventScroll:true}));
}
function closeArchetypeGuide(){const modal=$("archetypeGuideModal");if(!modal)return;modal.classList.remove('open');modal.setAttribute('aria-hidden','true');if(!document.querySelector('.manager-profile-modal.open,.player-history-modal.open,.manager-directory-modal.open,.headlines-modal.open'))document.body.classList.remove('modal-open')}

function managerProfileTabFromHash(){const match=location.hash.match(/[?&]tab=(overview|roster|front-office|history)/i);return match?match[1].toLowerCase():'overview'}
function managerProfileDraftHistoryHTML(managerId){
  const picks=managerAllRookiePicks(managerId);
  const rows=picks.map(p=>`<div class="manager-picks-row"><span class="manager-picks-pick">${esc(String(p.season||'—'))} ${esc(rookiePickLabel(p))}</span><span class="manager-picks-player">${playerLink(String(p.playerId),playerName(String(p.playerId)),'manager-picks-player-link')}</span></div>`).join('');
  return `<section class="manager-profile-card"><div class="manager-profile-card-heading"><div><span class="eyebrow">DRAFT HISTORY</span><h3>Rookie Selections</h3></div><span class="period-pill">${picks.length} picks</span></div><div class="manager-picks-list">${rows||'<div class="profile-empty">No rookie draft selections found.</div>'}</div></section>`
}
function managerArchetypeSummaryHTML(gm){return `<section class="manager-profile-card gm-archetype-summary"><div class="manager-profile-card-heading"><div><span class="eyebrow">MANAGER ARCHETYPE</span><h3>${gm.primary.icon} ${esc(gm.primary.name)}</h3></div><span class="period-pill">Secondary: ${gm.secondary.icon} ${esc(gm.secondary.name)}</span></div><div class="gm-scout-report"><span class="eyebrow">SCOUT'S REPORT</span><p>“${esc(gm.report)}”</p></div></section>`}
function managerProfileHeaderHTML(managerId){
  const id=String(managerId),manager=state.managers.get(id);if(!manager)return '';
  const gm=managerGMProfile(id),badges=managerBadges(id),managerAvatar=manager.avatar?`<img src="${esc(manager.avatar)}" alt="${esc(manager.name)} team avatar">`:esc(manager.initials||manager.name.slice(0,2).toUpperCase());
  return `<div class="manager-profile-top-tools" aria-label="Manager profile tools"><button type="button" class="manager-profile-top-tool" data-open-archetype-guide data-current-archetype="${esc(gm.primary.name)}" data-secondary-archetype="${esc(gm.secondary.name)}">Archetypes</button><button type="button" class="manager-profile-top-tool manager-share-card-btn" data-download-manager-share-card="${esc(id)}" aria-label="Download manager snapshot PNG" title="Download manager snapshot">↓</button></div><header class="manager-profile-hero"><div class="manager-profile-avatar">${managerAvatar}</div><div class="manager-profile-hero-copy"><div class="manager-profile-kicker"><span class="eyebrow">TEAM PROFILE</span></div><div class="profile-name-line">${managerSwitcherHTML(id)}<div class="profile-badge-icons">${badgeIconsHTML(badges)}</div></div><p>Current franchise overview and league history</p></div></header><nav class="manager-profile-tabs" aria-label="Manager profile sections"><button type="button" class="manager-profile-tab active" data-manager-tab="overview">Overview</button><button type="button" class="manager-profile-tab" data-manager-tab="roster">Roster</button><button type="button" class="manager-profile-tab" data-manager-tab="front-office">Front Office</button><button type="button" class="manager-profile-tab" data-manager-tab="history">History</button></nav>`
}
function managerProfileOverviewPanelHTML(managerId){
  const id=String(managerId),manager=state.managers.get(id);if(!manager)return '<section class="manager-profile-tab-panel active" data-manager-tab-panel="overview"><div class="profile-empty">Manager profile unavailable.</div></section>';
  const weeks=meaningfulWeeks(state.modelBundle),through=weeks.at(-1)||Infinity,power=modelRows(state.modelBundle,through,"power").find(x=>x.id===id),odds=priceRows(through).find(x=>x.id===id),form=managerFormData(id),trades=managerTrades(id),avgAge=managerAverageAge(id),matchups=managerRecentMatchups(id),gm=managerGMProfile(id),powerMovement=managerPowerMovement(id);
  const formPills=matchups.map(g=>`<details class="profile-form-result"><summary class="profile-form-pill ${g.result==="W"?"win":g.result==="D"?"draw":"loss"}">${g.result}</summary><div>${esc(manager.name)} <b>${g.result}</b> ${g.myPts.toFixed(2)} v ${esc(managerName(g.oppId))} ${g.oppPts.toFixed(2)}<small>Week ${g.week}</small></div></details>`).join("")||'<span class="profile-muted">No completed games</span>';
  const statGrid=`<div class="manager-profile-stat-grid"><div><span>Power rank</span><strong class="power-rank-with-move">${power?`#${power.rank}`:"—"}${power&&powerMovement.move?` <em class="rank-move ${powerMovement.move>0?'up':'down'}">${powerMovement.move>0?'↑':'↓'}${Math.abs(powerMovement.move)}</em>`:""}</strong></div><div><span>Ladder</span><strong>${power?`#${power.standingRank}`:"—"}</strong></div><div><span>Record</span><strong>${form.games?`${form.wins}-${form.games-form.wins}`:"—"}</strong></div><div><span>Championship odds</span><strong>${odds?championshipOddsLabel(odds):"—"}</strong></div><div><span>Team average age</span><strong>${avgAge?avgAge.toFixed(1):"—"}</strong></div><div><span>Career trades</span><strong>${trades.length}</strong></div></div>`;
  return `<section class="manager-profile-tab-panel active" data-manager-tab-panel="overview">${statGrid}<div class="manager-profile-grid">${gmProfileHTML(gm)}<section class="manager-profile-card profile-form-guide-card"><div class="manager-profile-card-heading"><div><span class="eyebrow">FORM GUIDE</span><h3>Last Five</h3></div></div><div class="profile-form-strip interactive">${formPills}</div></section><section class="manager-profile-card profile-power-trend-card"><div class="manager-profile-card-heading"><div><span class="eyebrow">SEASON JOURNEY</span><h3>Power Ranking Trend</h3></div><span class="period-pill">Week by week</span></div>${powerTrendHTML(id)}</section></div></section>`
}
function managerProfileRosterPanelHTML(managerId){
  const id=String(managerId),roster=managerRosterPlayers(id,state.profileAverageSeason),teamForm=teamFormPlayers(id),eligible=allNBAEligible(id),perMinuteMonsters=managerPerMinuteMonstersHTML(id,state.profileAverageSeason);
  const rosterRow=(p,i)=>`<div class="profile-roster-row"><span class="profile-roster-rank">${i+1}</span><span class="player-avatar-wrap"><img src="${esc(p.avatar)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span class="player-avatar-fallback">${esc(p.name.split(/\s+/).map(x=>x[0]).slice(0,2).join(""))}</span></span><div>${playerLink(p.id,p.name,"profile-player-name")}<small>${esc(p.position)}${p.age?` · Age ${p.age}`:""}</small></div><b class="profile-player-average">${p.avg.toFixed(2)}${p.avgRank?` <small>#${p.avgRank}</small>`:""}</b></div>`;
  const topRoster=roster.slice(0,10).map(rosterRow).join(""),remainingRoster=roster.slice(10).map((p,i)=>rosterRow(p,i+10)).join("");
  const rosterRows=topRoster+(remainingRoster?`<details class="profile-roster-more"><summary><span class="profile-roster-expand-label">Show remaining ${roster.length-10} players</span><span class="profile-roster-collapse-label">Show top 10</span></summary><div class="profile-roster-list">${remainingRoster}</div></details>`:'')||'<div class="profile-empty">No current roster data.</div>';
  const eligibleRows=eligible.map(p=>`<div class="eligible-player">${playerLink(p.id,p.name)}<span>${p.avg.toFixed(2)}</span></div>`).join("")||'<div class="profile-empty">No current top-50 players.</div>';
  return `<section class="manager-profile-tab-panel" data-manager-tab-panel="roster"><div class="manager-profile-grid"><section class="manager-profile-card profile-roster-card"><div class="manager-profile-card-heading"><div><span class="eyebrow">CURRENT TEAM</span><h3>Roster</h3></div><div class="roster-season-toggle"><button type="button" class="${state.profileAverageSeason==="2025"?"active":""}" data-profile-season="2025">2025 averages</button><button type="button" class="${state.profileAverageSeason==="2026"?"active":""}" data-profile-season="2026">2026 season averages</button></div></div><div class="profile-roster-list">${rosterRows}</div></section>${managerDraftPicksHTML(id)}<section class="manager-profile-card"><div class="manager-profile-card-heading"><div><span class="eyebrow">LAST FIVE WATCH</span><h3>Poor Form</h3></div></div>${playerFormMini(teamForm.poor,false)}</section><section class="manager-profile-card"><div class="manager-profile-card-heading"><div><span class="eyebrow">LAST FIVE WATCH</span><h3>Good Form</h3></div></div>${playerFormMini(teamForm.good,true)}</section>${perMinuteMonsters}<section class="manager-profile-card"><div class="manager-profile-card-heading"><div><span class="eyebrow">ALL-NBA BALLOT</span><h3>Eligible Players</h3></div><span class="period-pill">Top 50 average</span></div><div class="eligible-player-list">${eligibleRows}</div></section></div></section>`
}
function managerProfileFrontOfficePanelHTML(managerId){
  const id=String(managerId),trades=managerTrades(id),recent=trades.slice(0,5),partners=favouriteTradePartners(id),gm=managerGMProfile(id),managerGrades=managerGradesHTML(id),tradeLedger=managerTradeLedgerHTML(id),potentialTradeTargets=potentialTradeTargetsHTML(id,gm),rookieDraftTargets=rookieDraftTargetsHTML(id);
  const partnerRows=partners.map((p,i)=>`<div class="profile-partner-row"><b>${i+1}</b><button class="manager-profile-link" type="button" data-manager-id="${esc(p.partner)}">${esc(managerName(p.partner))}</button><span>${p.count} trades · ${p.percent.toFixed(0)}%</span></div>`).join("")||'<div class="profile-empty">No trade partners yet.</div>';
  return `<section class="manager-profile-tab-panel" data-manager-tab-panel="front-office"><div class="manager-profile-grid">${managerGrades}${tradeLedger}<section class="manager-profile-card"><div class="manager-profile-card-heading"><div><span class="eyebrow">TRADE DNA</span><h3>Favourite Trade Partners</h3></div><span class="period-pill">Top 7</span></div><div class="profile-partner-list">${partnerRows}</div></section><section class="manager-profile-card"><div class="manager-profile-card-heading"><div><span class="eyebrow">TRANSACTIONS LOG</span><h3>Recent Trades</h3></div></div><div class="profile-trades-list">${recent.map(t=>managerTradeSummaryHTML(t,id)).join("")||'<div class="profile-empty">No trades found.</div>'}</div></section>${potentialTradeTargets}${rookieDraftTargets}</div></section>`
}
function managerProfileHistoryPanelHTML(managerId){
  const id=String(managerId),trades=managerTrades(id),biggest=[...trades].map(t=>({t,value:tradeValue(t)})).sort((a,b)=>b.value-a.value||(b.t.created||0)-(a.t.created||0)).slice(0,5),allTimeHigh=teamHighestScore(id,state.bundles),seasonBundle=state.bundles.find(b=>String(b.league.league_id)===CONFIG.currentLeagueId),seasonHigh=teamHighestScore(id,seasonBundle?[seasonBundle]:[]),headToHead=managerHeadToHead(id),biggestResult=managerBiggestResult(id);
  const h2hRows=headToHead.map(r=>{const recordClass=r.wins>r.losses?"winning":r.wins<r.losses?"losing":"even",drawText=r.draws?` <span>(${r.draws} ${r.draws===1?"draw":"draws"})</span>`:"";return `<div class="profile-h2h-row ${recordClass}"><button class="manager-profile-link" type="button" data-manager-id="${esc(r.oppId)}">vs ${esc(managerName(r.oppId))}</button><strong>${r.wins}-${r.losses}${drawText}</strong><small>${r.games} games · includes finals</small></div>`}).join("")||'<div class="profile-empty">No completed head-to-head matchups.</div>';
  return `<section class="manager-profile-tab-panel" data-manager-tab-panel="history"><div class="manager-profile-grid"><section class="manager-profile-card"><div class="manager-profile-card-heading"><div><span class="eyebrow">HEAD TO HEAD</span><h3>All-Time Records</h3></div></div><div class="profile-h2h-list">${h2hRows}</div></section><section class="manager-profile-card profile-biggest-results"><div class="compact-result-card win"><span>BIGGEST WIN</span><strong>${biggestResult.win?`+${biggestResult.win.margin.toFixed(1)}`:'—'}</strong><div class="result-opponent">${biggestResult.win?managerAvatarHTML(biggestResult.win.oppId):''}<small>${biggestResult.win?`vs ${esc(managerName(biggestResult.win.oppId))}<br>Week ${biggestResult.win.week} · ${biggestResult.win.season}`:'No completed win'}</small></div></div><div class="compact-result-card loss"><span>BIGGEST LOSS</span><strong>${biggestResult.loss?`−${biggestResult.loss.margin.toFixed(1)}`:'—'}</strong><div class="result-opponent">${biggestResult.loss?managerAvatarHTML(biggestResult.loss.oppId):''}<small>${biggestResult.loss?`vs ${esc(managerName(biggestResult.loss.oppId))}<br>Week ${biggestResult.loss.week} · ${biggestResult.loss.season}`:'No completed loss'}</small></div></div></section><section class="manager-profile-card score-records"><div class="manager-profile-card-heading"><div><span class="eyebrow">SCORING RECORDS</span><h3>Franchise Highs</h3></div></div><div class="profile-record-row"><span>Highest ever team score</span><strong>${allTimeHigh?allTimeHigh.pts.toFixed(2):"—"}</strong><small>${allTimeHigh?`Week ${allTimeHigh.week}, ${allTimeHigh.season}`:"No completed matchup"}</small></div><div class="profile-record-row"><span>Highest 2026 season score</span><strong>${seasonHigh?seasonHigh.pts.toFixed(2):"—"}</strong><small>${seasonHigh?`Week ${seasonHigh.week}`:"Season not started"}</small></div></section><section class="manager-profile-card"><div class="manager-profile-card-heading"><div><span class="eyebrow">FRANCHISE HISTORY</span><h3>Biggest Ever Trades</h3></div><span class="period-pill">Top 5</span></div><div class="profile-trades-list">${biggest.map((row,i)=>`<div class="profile-big-trade"><span class="profile-big-rank">${i+1}</span>${managerTradeSummaryHTML(row.t,id)}</div>`).join("")||'<div class="profile-empty">No trades found.</div>'}</div></section>${managerProfileDraftHistoryHTML(id)}<section class="manager-profile-card profile-trophy-card"><div class="manager-profile-card-heading"><div><span class="eyebrow">CAREER HONOURS</span><h3>Trophy Cabinet</h3></div><span class="period-pill">Permanent achievements</span></div>${trophyCabinetHTML(id)}</section></div></section>`
}
function managerProfileTabPanelHTML(managerId,tab){
  const section=String(tab||'overview');
  if(section==='roster')return managerProfileRosterPanelHTML(managerId);
  if(section==='front-office')return managerProfileFrontOfficePanelHTML(managerId);
  if(section==='history')return managerProfileHistoryPanelHTML(managerId);
  return managerProfileOverviewPanelHTML(managerId)
}
function managerProfileHTML(managerId,sections=['overview']){
  const id=String(managerId),manager=state.managers.get(id);if(!manager)return `<div class="profile-empty">Manager profile unavailable.</div>`;
  const list=(Array.isArray(sections)?sections:[sections]).filter(Boolean),panels=list.map(section=>managerProfileTabPanelHTML(id,section)).join('');
  return `${managerProfileHeaderHTML(id)}<div class="manager-profile-tab-panels">${panels}</div>`
}

function playerTrades(playerId){const id=String(playerId);return state.trades.filter(t=>Object.prototype.hasOwnProperty.call(t.adds||{},id)||Object.prototype.hasOwnProperty.call(t.drops||{},id))}
function playerInterestRows(){const now=Date.now();let rows=[];try{rows=JSON.parse(localStorage.getItem("imoPlayerInterest")||"[]")}catch{}rows=(Array.isArray(rows)?rows:[]).filter(x=>x&&Number(x.expires)>now);state.playerInterest=rows;try{localStorage.setItem("imoPlayerInterest",JSON.stringify(rows))}catch{}return rows}
function isPlayerStarred(playerId){return playerInterestRows().some(x=>String(x.playerId)===String(playerId))}
function togglePlayerInterest(playerId){const id=String(playerId),rows=playerInterestRows(),existing=rows.find(x=>String(x.playerId)===id);let next;if(existing)next=rows.filter(x=>String(x.playerId)!==id);else next=[...rows,{playerId:id,created:Date.now(),expires:Date.now()+48*3600*1000,template:Math.floor(Math.random()*3),managerId:[...state.managers.keys()][Math.floor(Math.random()*Math.max(1,state.managers.size))]||null}];state.playerInterest=next;try{localStorage.setItem("imoPlayerInterest",JSON.stringify(next))}catch{}const modal=$("playerHistoryModal");if(modal?.classList.contains("open"))openPlayerHistory(id);renderTicker()}
function playerCurrentAverage(playerId){
  const id=String(playerId),current=state.bundles.find(b=>String(b.league?.league_id)===CONFIG.currentLeagueId),currentSeason=String(current?.league?.season||'2026'),seasons=[currentSeason,...state.bundles.map(b=>String(b?.league?.season||'')).filter(Boolean).sort((a,b)=>Number(b)-Number(a)),'2025'].filter((value,index,array)=>array.indexOf(value)===index);
  for(const season of seasons){
    const weeks=String(current?.league?.season||'')===season&&current?meaningfulWeeks(current):[],avg=Number((state.gameLogAverages?.[season]?.[id]??state.seasonTotalAverages?.[season]?.[id]??(weeks.length?buildPlayerAverages(current,weeks.at(-1))[id]:0))||0),games=Number(state.gameLogMeta?.[season]?.[id]?.gamesPlayed||state.seasonTotalMeta?.[season]?.[id]?.gamesPlayed||0);
    if(avg>0&&games>0)return {season,avg,games,fallback:season!==currentSeason};
  }
  return {season:currentSeason,avg:0,games:0,fallback:false};
}
function playerFptsPer36(playerId,season=null,averageOverride=null){
  const id=String(playerId),resolvedSeason=String(season||playerCurrentAverage(id).season),meta=state.seasonTotalMeta?.[resolvedSeason]?.[id]||state.gameLogMeta?.[resolvedSeason]?.[id]||{},average=Number(averageOverride??state.seasonTotalAverages?.[resolvedSeason]?.[id]??state.gameLogAverages?.[resolvedSeason]?.[id]??0),games=Number(meta.gamesPlayed||0);
  let totalMinutes=Number(meta.totalMinutes||0),mpg=Number(meta.averageMinutes||0);
  if(!(totalMinutes>0)){const rows=safeArray(state.gameLogs?.[resolvedSeason]?.[id]);totalMinutes=rows.reduce((sum,row)=>sum+Math.max(0,statNumber(row,['min','mins','minutes','minutes_played','mp'])),0);if(!games&&rows.length)meta.gamesPlayed=rows.filter(gameWasPlayed).length}
  const resolvedGames=Number(meta.gamesPlayed||games||0);if(!(mpg>0)&&resolvedGames>0&&totalMinutes>0)mpg=totalMinutes/resolvedGames;
  if(!(mpg>0)||!Number.isFinite(average))return{season:resolvedSeason,average,mpg:0,totalMinutes,value:0,eligible:false,monster:false};
  const value=(average/mpg)*36,eligible=mpg>=12||totalMinutes>=100;
  return{season:resolvedSeason,average,mpg,totalMinutes,value:Number.isFinite(value)?value:0,eligible,monster:eligible&&value-average>9};
}
function fpts36Display(metric){return metric?.eligible?metric.value.toFixed(2):'—'}

function playerSeasonRank(playerId,season){
  const id=String(playerId),map=seasonAverageMap(String(season||''));
  const ranked=Object.entries(map).filter(([,avg])=>Number(avg)>0).sort((a,b)=>Number(b[1])-Number(a[1])||String(a[0]).localeCompare(String(b[0])));
  const index=ranked.findIndex(([pid])=>String(pid)===id);
  return index>=0?index+1:null;
}
function currentPlayerAgeDecimal(playerId){
  const p=state.players[String(playerId)]||{},raw=p.birth_date||p.birthdate||p.dob;
  if(raw){const born=new Date(raw),now=new Date();if(!Number.isNaN(born.getTime()))return Math.max(0,(now-born)/(365.2425*24*3600*1000));}
  const direct=Number(p.age);return Number.isFinite(direct)&&direct>0?direct:null;
}
function recentEliteProspectPick(playerId){
  const id=String(playerId),rows=safeArray(state.draftSelections).filter(row=>row&&row.isRookieDraft===true&&row.playerId&&row.season);
  const seasons=[...new Set(rows.map(row=>String(row.season)))].sort((a,b)=>Number(b)-Number(a)).slice(0,2),allowed=new Set(seasons);
  return rows.some(row=>allowed.has(String(row.season))&&String(row.playerId)===id&&Number(row.round)===1&&[1,2].includes(Number(row.overallPick||row.pickNo)));
}
function playerProfileTags(playerId,seasonAvg,efficiency){
  const id=String(playerId),tags=[];
  if(efficiency?.monster)tags.push({className:'per-minute-monster',label:'PER-MINUTE MONSTER'});
  if(seasonAvg?.avg>0&&playerSeasonRank(id,seasonAvg.season)<=12)tags.push({className:'franchise-cornerstone',label:'FRANCHISE CORNERSTONE'});
  const age=currentPlayerAgeDecimal(id),eliteByAge=age!=null&&age<21&&Number(seasonAvg?.avg||0)>21.5;
  if(recentEliteProspectPick(id)||eliteByAge)tags.push({className:'elite-prospect',label:'ELITE PROSPECT'});
  return tags;
}
function playerProfileTagsHTML(playerId,seasonAvg,efficiency){
  const tags=playerProfileTags(playerId,seasonAvg,efficiency);return tags.length?`<div class="player-profile-tags">${tags.map(tag=>`<em class="player-profile-tag ${tag.className}">${tag.label}</em>`).join('')}</div>`:'';
}

function managerPerMinuteMonstersHTML(managerId,season=state.profileAverageSeason){
  const requestedSeason=String(season||state.profileAverageSeason||'2026');
  const rankedForSeason=seasonKey=>managerRosterPlayers(String(managerId),seasonKey).map(player=>({player,metric:playerFptsPer36(player.id,seasonKey,player.avg)})).filter(row=>row.metric.eligible).sort((a,b)=>b.metric.value-a.metric.value||b.player.avg-a.player.avg).slice(0,6);
  let displaySeason=requestedSeason,players=rankedForSeason(requestedSeason);
  // During the offseason or before current-season minutes become available,
  // retain a useful section by falling back to the completed 2025 season.
  if(!players.length&&requestedSeason!=='2025'){
    const fallback=rankedForSeason('2025');
    if(fallback.length){players=fallback;displaySeason='2025'}
  }
  const rowHTML=(row,index)=>`<div class="profile-per36-row"><span class="profile-per36-rank">${index+1}</span><span class="profile-per36-player">${playerLink(row.player.id,row.player.name,'profile-player-name')}<small>${esc(row.player.position||'Player')} · ${row.metric.mpg.toFixed(1)} MPG</small></span><strong>${row.metric.value.toFixed(2)}<small>FPTS/36</small></strong></div>`;
  const seasonPill=displaySeason==='2025'&&requestedSeason!=='2025'?'2025 fallback':'Top FPTS/36';
  if(!players.length)return `<section class="manager-profile-card profile-per36-card"><div class="manager-profile-card-heading"><div><span class="eyebrow">EFFICIENCY WATCH</span><h3>Per-Minute Monsters</h3></div><span class="period-pill">${seasonPill}</span></div><div class="profile-empty">No players currently meet the minutes threshold.</div></section>`;
  const top=players.slice(0,3).map(rowHTML).join(''),more=players.slice(3).map((row,index)=>rowHTML(row,index+3)).join('');
  return `<section class="manager-profile-card profile-per36-card"><div class="manager-profile-card-heading"><div><span class="eyebrow">EFFICIENCY WATCH</span><h3>Per-Minute Monsters</h3></div><span class="period-pill">${seasonPill}</span></div><div class="profile-per36-list">${top}</div>${more?`<details class="profile-per36-more"><summary><span class="profile-per36-expand-label">Show top 6</span><span class="profile-per36-collapse-label">Show top 3</span></summary><div class="profile-per36-list">${more}</div></details>`:''}</section>`;
}

function playerDraftOrigin(playerId){
  const rows=(state.allDraftSelections||[]).filter(x=>String(x.playerId)===String(playerId)).sort((a,b)=>Number(a.created||0)-Number(b.created||0)||Number(a.season)-Number(b.season));
  const row=rows[0];if(!row)return null;
  const slot=Number(row.draftSlot)||(((Number(row.pickNo)||1)-1)%Math.max(1,Number(row.teamCount)||8))+1;
  const pick=`${Number(row.round)}.${String(slot).padStart(2,'0')}`;
  return {...row,pick,label:row.isRookieDraft?`${row.season} ${pick} rookie draft`:`${pick} startup draft`};
}
function returnTreeManagers(playerId){
  const id=String(playerId),seen=new Map();
  state.trades.forEach(t=>{const roster=(t.drops||{})[id];if(roster==null)return;const mid=t.roster_owner_map?.[String(roster)];if(!mid)return;const key=String(mid),old=seen.get(key);if(!old||Number(t.created)>Number(old.trade.created))seen.set(key,{id:key,name:managerName(key,t),trade:t})});
  return [...seen.values()].sort((a,b)=>Number(b.trade.created)-Number(a.trade.created));
}
function pickAssetKey(p){return `${String(p.season||'Future')}|${String(p.roster_id??p.original_roster_id??'')}|${String(Number(p.round)||1)}`}
function pickAssetLabel(p){const original=pickOriginalOwner(p,p._trade||null);return `${String(p.season||'Future')} Round ${Number(p.round)||1} Pick${original?` (${original}'s pick)`:''}`}
function pickHistoryLink(key,label,className='pick-history-link'){return `<button type="button" class="${className}" data-pick-history-key="${esc(String(key))}">${esc(label)}</button>`}
function pickOriginalOwnerNameByKey(key){const [season,rosterId,round]=String(key).split('|');for(const bundle of safeArray(state.bundles)){const owner=bundle?.ownerByRoster?.[String(rosterId)];if(owner)return managerName(owner)}for(const trade of safeArray(state.trades)){const pick=safeArray(trade?.draft_picks).find(p=>p&&typeof p==='object'&&pickAssetKey(p)===String(key));if(pick){const owner=trade?.roster_owner_map?.[String(pick.roster_id??pick.original_roster_id)];if(owner)return managerName(owner,trade)}}return `Original roster ${rosterId}`}
function pickHistoryData(key){const [season,rosterId,round]=String(key).split('|'),rows=[];safeArray(state.trades).filter(Boolean).sort((a,b)=>Number(a?.created)-Number(b?.created)).forEach(trade=>{safeArray(trade?.draft_picks).forEach(p=>{if(!p||typeof p!=='object'||pickAssetKey(p)!==String(key))return;const fromId=trade?.roster_owner_map?.[String(p.previous_owner_id)],toId=trade?.roster_owner_map?.[String(p.owner_id)];rows.push({trade,fromId:String(fromId||''),toId:String(toId||''),from:fromId?managerName(fromId,trade):'Unknown manager',to:toId?managerName(toId,trade):'Unknown manager'})})});const drafted=state.draftPickMap?.[String(key)]||null,origin=drafted?playerDraftOrigin(drafted):null;let currentOwner=rows.at(-1)?.to||pickOriginalOwnerNameByKey(key);return{key:String(key),season,round:Number(round)||1,originalOwner:pickOriginalOwnerNameByKey(key),currentOwner,rows,drafted,origin}}
function pickHistoryHTML(key){const data=pickHistoryData(key),title=`${data.season} Round ${data.round} Pick (${data.originalOwner}'s pick)`,outcome=data.drafted?`<section class="pick-history-outcome"><span>EVENTUAL DRAFT OUTCOME</span><strong>${playerLink(data.drafted,playerName(data.drafted),'pick-history-player')}</strong><small>${esc(data.origin?.label||`${data.season} rookie draft`)}</small></section>`:`<section class="pick-history-status"><span>CURRENT STATUS</span><strong>${esc(data.currentOwner)}</strong><small>Future draft capital · not yet converted into a player</small></section>`,timeline=data.rows.length?data.rows.map((row,i)=>`<article class="pick-history-event"><span class="pick-history-index">${i+1}</span><div><small>${esc(fmt(row.trade.created))} · ${esc(row.trade.season_label||'')}</small><strong>${esc(row.from)} → ${esc(row.to)}</strong><p>${esc(row.from)} traded this pick to ${esc(row.to)}.</p><details><summary>View complete trade</summary><div class="trade-detail-body">${tradeDetailsHTML(row.trade)}</div></details></div></article>`).join(''):'<div class="profile-empty">This pick has not been traded in the loaded league history.</div>';return `<header class="pick-history-header"><span class="eyebrow">DRAFT PICK TRANSACTION FILE</span><h2 id="pickHistoryTitle">${esc(title)}</h2><p>Tracks every recorded transfer before the pick is eventually used.</p></header><div class="pick-history-summary"><div><span>Original owner</span><strong>${esc(data.originalOwner)}</strong></div><div><span>Current owner</span><strong>${esc(data.currentOwner)}</strong></div><div><span>Transfers</span><strong>${data.rows.length}</strong></div></div>${outcome}<section class="pick-history-timeline">${timeline}</section>`}
function openPickHistory(key){const modal=$("pickHistoryModal"),content=$("pickHistoryContent");if(!modal||!content)return;content.innerHTML=pickHistoryHTML(key);modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.classList.add('pick-history-open')}
function closePickHistory(){const modal=$("pickHistoryModal");if(!modal)return;modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.classList.remove('pick-history-open')}
function returnAssetsForManager(t,managerId){
  const id=String(managerId),out=[];
  Object.entries(t.adds||{}).forEach(([pid,rid])=>{if(String(t.roster_owner_map?.[String(rid)]||'')===id)out.push({type:'player',id:String(pid),name:playerName(pid),after:Number(t.created)||0})});
  safeArray(t?.draft_picks).forEach(p=>{if(!p||typeof p!=='object'||String(t?.roster_owner_map?.[String(p.owner_id)]||'')!==id)return;const copy={...p,_trade:t};out.push({type:'pick',id:pickAssetKey(p),pick:p,name:pickAssetLabel(copy),after:Number(t?.created)||0})});
  return out;
}
function sentAssetsForManager(t,managerId){
  const id=String(managerId),out=[];
  Object.entries(t.drops||{}).forEach(([pid,rid])=>{if(String(t.roster_owner_map?.[String(rid)]||'')===id)out.push({type:'player',id:String(pid),name:playerName(pid),after:Number(t.created)||0})});
  safeArray(t?.draft_picks).forEach(p=>{if(!p||typeof p!=='object'||String(t?.roster_owner_map?.[String(p.previous_owner_id)]||'')!==id)return;const copy={...p,_trade:t};out.push({type:'pick',id:pickAssetKey(p),pick:p,name:pickAssetLabel(copy),after:Number(t?.created)||0})});
  return out;
}
function laterAssetTrade(asset,managerId){
  const id=String(managerId),after=Number(asset.after)||0;
  return [...state.trades].sort((a,b)=>Number(a.created)-Number(b.created)).find(t=>{
    if(Number(t.created)<=after)return false;
    if(asset.type==='player'){
      const rid=(t.drops||{})[String(asset.id)];return rid!=null&&String(t.roster_owner_map?.[String(rid)]||'')===id;
    }
    return safeArray(t?.draft_picks).some(p=>p&&typeof p==='object'&&pickAssetKey(p)===String(asset.id)&&String(t?.roster_owner_map?.[String(p.previous_owner_id)]||'')===id);
  })||null;
}
function currentPlayerOwnerName(playerId){
  const bundle=state.bundles.find(b=>String(b.league?.league_id)===CONFIG.currentLeagueId)||state.bundles[0];
  const roster=(bundle?.rosters||[]).find(r=>(r.players||[]).map(String).includes(String(playerId))||(r.reserve||[]).map(String).includes(String(playerId))||(r.taxi||[]).map(String).includes(String(playerId)));
  const mid=roster?bundle?.ownerByRoster?.[String(roster.roster_id)]:null;return mid?managerName(mid):'Not currently rostered';
}
function returnChainAssetName(asset){return asset?.type==='player'?playerName(asset.id):String(asset?.name||'Draft pick')}
function returnChainAssetToken(asset){return `${String(asset?.type||'')}|${String(asset?.id||'')}|${Number(asset?.after)||0}`}
function returnChainAssetMatches(a,b){return Boolean(a&&b&&String(a.type)===String(b.type)&&String(a.id)===String(b.id))}
function returnChainPickConversion(asset){
  if(asset?.type!=='pick')return null;
  const drafted=state.draftPickMap?.[String(asset.id)]||null;if(!drafted)return null;
  const origin=playerDraftOrigin(drafted),player={type:'player',id:String(drafted),name:playerName(drafted),after:Number(origin?.created)||Number(asset.after)||0};
  return{player,origin,label:origin?.label||'completed rookie draft pick'};
}
function returnChainNext(asset,managerId){
  const direct=laterAssetTrade(asset,managerId);if(direct)return{asset,trade:direct,conversion:null};
  const conversion=returnChainPickConversion(asset);if(!conversion)return null;
  const next=laterAssetTrade(conversion.player,managerId);return next?{asset:conversion.player,trade:next,conversion,sourceAsset:asset}:null;
}
function returnChainAssetIcon(asset){
  return asset.type==='player'?`<span class="return-chain-avatar"><img src="https://sleepercdn.com/content/nba/players/${esc(asset.id)}.jpg" alt="" loading="lazy" onerror="this.style.display='none'"></span>`:'<span class="return-chain-pick-icon">◆</span>';
}
function returnChainAssetTitle(asset,className='return-chain-player'){
  return asset.type==='player'?playerLink(asset.id,returnChainAssetName(asset),className):pickHistoryLink(asset.id,returnChainAssetName(asset),'pick-history-link return-chain-pick-link');
}
function returnChainPackageAssetHTML(asset,followed){
  const active=returnChainAssetMatches(asset,followed),conversion=returnChainPickConversion(asset);
  const outcome=conversion?`<div class="return-chain-inline-outcome"><span>BECAME</span><strong>${playerLink(conversion.player.id,returnChainAssetName(conversion.player),'return-chain-player')}</strong><small>${esc(conversion.label)}</small></div>`:'';
  return `<div class="return-chain-package-asset ${asset.type} ${active?'followed':''}">${returnChainAssetIcon(asset)}<div class="return-chain-package-copy"><strong>${returnChainAssetTitle(asset)}</strong><small>${asset.type==='player'?'Player':'Draft capital'}</small>${outcome}</div>${active?'<span class="return-chain-followed-badge">FOLLOWED ASSET</span>':''}</div>`;
}
function playerAcquisitionTrade(playerId,managerId,beforeCreated){
  const id=String(playerId),mid=String(managerId),before=Number(beforeCreated)||Infinity;
  return [...state.trades].filter(t=>{
    if(Number(t.created)>=before)return false;
    const rid=(t.adds||{})[id];
    return rid!=null&&String(t.roster_owner_map?.[String(rid)]||'')===mid;
  }).sort((a,b)=>Number(b.created)-Number(a.created))[0]||null;
}
function returnChainAcquisitionHTML(session,origin){
  const mid=String(session.managerId),manager=managerName(mid,session.rootTrade),root={type:'player',id:String(session.rootPlayerId),name:playerName(session.rootPlayerId)},draftedBy=origin?.pickedBy?String(origin.pickedBy):'',draftedByName=draftedBy?managerName(draftedBy):'',draftedByManager=draftedBy&&draftedBy===mid,acquisition=playerAcquisitionTrade(session.rootPlayerId,mid,session.rootTrade?.created);
  let originLine='Acquired before the loaded draft history';
  if(origin){
    originLine=draftedByManager?`Drafted by ${esc(manager)} at ${esc(origin.label)}`:`Originally drafted by ${esc(draftedByName||'another manager')} at ${esc(origin.label)}`;
  }
  if(draftedByManager&&!acquisition){
    return `<div class="return-tree-origin"><span>STARTING ASSET</span><strong>${playerLink(session.rootPlayerId,playerName(session.rootPlayerId),'return-chain-player')}</strong><small>${originLine}</small></div>`;
  }
  if(!acquisition){
    return `<div class="return-tree-origin"><span>STARTING ASSET</span><strong>${playerLink(session.rootPlayerId,playerName(session.rootPlayerId),'return-chain-player')}</strong><small>${originLine}</small><em>How ${esc(manager)} acquired this player is not available in the loaded trade history.</em></div>`;
  }
  const sent=sentAssetsForManager(acquisition,mid),received=returnAssetsForManager(acquisition,mid),tradeManagerIds=[...new Set((acquisition.manager_ids||[]).map(String))],others=tradeManagerIds.filter(x=>x!==mid).map(x=>managerName(x,acquisition));
  return `<div class="return-tree-origin"><span>STARTING ASSET</span><strong>${playerLink(session.rootPlayerId,playerName(session.rootPlayerId),'return-chain-player')}</strong><small>Acquired by ${esc(manager)} via trade on ${esc(fmt(acquisition.created))}</small>${origin?`<em>${originLine}</em>`:''}</div>
  <section class="return-chain-acquisition"><div class="return-chain-acquisition-head"><span>HOW ${esc(manager.toUpperCase())} ACQUIRED ${esc(playerName(session.rootPlayerId).toUpperCase())}</span><h3>${esc(fmt(acquisition.created))} trade with ${esc(others.join(' and ')||'another manager')}</h3></div><div class="return-chain-package-grid"><section class="return-chain-side sent"><div class="return-chain-side-heading"><span>PACKAGE SENT</span><h4>${esc(manager)} sent</h4><small>${sent.length} asset${sent.length===1?'':'s'}</small></div><div class="return-chain-side-assets">${sent.length?sent.map(a=>returnChainPackageAssetHTML(a,null)).join(''):'<div class="profile-empty">No outgoing assets resolved.</div>'}</div></section><section class="return-chain-side received"><div class="return-chain-side-heading"><span>PACKAGE RECEIVED</span><h4>${esc(manager)} received</h4><small>${received.length} asset${received.length===1?'':'s'}</small></div><div class="return-chain-side-assets">${received.length?received.map(a=>returnChainPackageAssetHTML(a,root)).join(''):'<div class="profile-empty">No incoming assets resolved.</div>'}</div></section></div><details class="return-chain-full-trade"><summary>View complete acquisition trade</summary><div class="trade-detail-body">${tradeDetailsHTML(acquisition)}</div></details></section>`;
}
function returnChainReceivedAssetHTML(asset,index,managerId){
  const next=returnChainNext(asset,managerId),conversion=returnChainPickConversion(asset);
  let status='';
  if(next){
    if(next.conversion)status=`<div class="return-chain-conversion"><span>BECAME</span><strong>${playerLink(next.asset.id,returnChainAssetName(next.asset),'return-chain-player')}</strong><small>${esc(next.conversion.label)} · later included in another trade package</small></div>`;
    else if(asset.type==='pick'&&conversion)status=`<div class="return-chain-conversion"><span>EVENTUAL DRAFT OUTCOME</span><strong>${playerLink(conversion.player.id,returnChainAssetName(conversion.player),'return-chain-player')}</strong><small>${esc(conversion.label)} · this pick changed hands before the draft</small></div><div class="return-chain-status">${esc(managerName(managerId,next.trade))} later included this pick in another trade package on ${esc(fmt(next.trade.created))}.</div>`;
    else status=`<div class="return-chain-status">Later included in another trade package on ${esc(fmt(next.trade.created))}.</div>`;
  }else if(conversion){
    status=`<div class="return-chain-conversion"><span>BECAME</span><strong>${playerLink(conversion.player.id,returnChainAssetName(conversion.player),'return-chain-player')}</strong><small>${esc(conversion.label)} · Current status: ${esc(currentPlayerOwnerName(conversion.player.id))}</small></div>`;
  }else if(asset.type==='player')status=`<div class="return-chain-status">Current status: ${esc(currentPlayerOwnerName(asset.id))}</div>`;
  else status='<div class="return-chain-status">Awaiting draft or still held as future draft capital.</div>';
  const followLabel=next?(next.conversion?`Follow ${returnChainAssetName(next.asset)}`:asset.type==='player'?`Follow ${returnChainAssetName(asset)}`:'Follow this pick'):'';
  return `<article class="return-chain-received-card"><div class="return-chain-package-asset ${asset.type}">${returnChainAssetIcon(asset)}<div><strong>${returnChainAssetTitle(asset)}</strong><small>${asset.type==='player'?'Player':'Draft capital'}</small></div></div>${status}${next?`<button type="button" class="return-chain-follow-btn" data-follow-return-chain="${index}">${esc(followLabel)} <span>→</span></button>`:''}</article>`;
}
function returnChainTradeKey(t){return String(t?.transaction_id||`${t?.league_id||''}|${t?.created||''}`)}
let returnChainSession=null;
function returnChainBreadcrumbHTML(session){
  return `<nav class="return-chain-breadcrumbs" aria-label="Trade return chain">${session.steps.map((step,index)=>{const label=returnChainAssetName(step.asset);return `${index?'<span>›</span>':''}${index===session.steps.length-1?`<b>${esc(label)}</b>`:`<button type="button" data-return-chain-step="${index}">${esc(label)}</button>`}`}).join('')}</nav>`;
}
function returnChainHTML(){
  const session=returnChainSession;if(!session)return '<div class="profile-empty">Trade return chain unavailable.</div>';
  const step=session.steps.at(-1),trade=step.trade,mid=session.managerId,manager=managerName(mid,trade),sent=sentAssetsForManager(trade,mid),received=returnAssetsForManager(trade,mid),origin=playerDraftOrigin(session.rootPlayerId),tradeManagerIds=[...new Set((trade.manager_ids||[]).map(String))],otherManagers=tradeManagerIds.filter(x=>String(x)!==String(mid)).map(x=>managerName(x,trade)),teamCount=Math.max(2,tradeManagerIds.length),assetName=returnChainAssetName(step.asset);
  session.currentReceived=received;
  const conversionNotice=step.conversion?`<div class="return-chain-step-conversion"><span>PICK CONVERSION</span><strong>${esc(returnChainAssetName(step.sourceAsset))} became ${playerLink(step.asset.id,assetName,'return-chain-player')}</strong><small>${esc(step.conversion.label)}</small></div>`:'';
  return `<header class="return-tree-header"><span class="eyebrow">TRADE RETURN CHAIN</span><h2 id="tradeReturnTreeTitle">${esc(manager)} — ${esc(playerName(session.rootPlayerId))}</h2><p>Shows the full trade package at each step. Follow one returned asset at a time to see what happened next.</p></header>
  ${returnChainBreadcrumbHTML(session)}
  ${returnChainAcquisitionHTML(session,origin)}
  ${conversionNotice}
  <section class="return-chain-transaction">
    <div class="return-chain-transaction-head"><div><span>${esc(fmt(trade.created))}</span><h3>${esc(assetName)} was included in a ${teamCount}-team trade package</h3><p>${esc(manager)} traded with ${esc(otherManagers.join(' and ')||'another manager')}.</p></div>${session.steps.length>1?'<button type="button" class="return-chain-back" data-return-chain-back>← Previous step</button>':''}</div>
    <div class="return-chain-package-grid">
      <section class="return-chain-side sent"><div class="return-chain-side-heading"><span>PACKAGE SENT</span><h4>${esc(manager)} sent</h4><small>${sent.length} asset${sent.length===1?'':'s'}</small></div><div class="return-chain-side-assets">${sent.length?sent.map(a=>returnChainPackageAssetHTML(a,step.asset)).join(''):'<div class="profile-empty">No outgoing assets resolved.</div>'}</div></section>
      <section class="return-chain-side received"><div class="return-chain-side-heading"><span>RETURN RECEIVED</span><h4>${esc(manager)} received</h4><small>${received.length} asset${received.length===1?'':'s'}</small></div><div class="return-chain-received-list">${received.length?received.map((a,i)=>returnChainReceivedAssetHTML(a,i,mid)).join(''):'<div class="profile-empty">No incoming assets resolved.</div>'}</div></section>
    </div>
    <details class="return-chain-full-trade"><summary>View complete ${teamCount}-team trade</summary><div class="trade-detail-body">${tradeDetailsHTML(trade)}</div></details>
  </section>`;
}
function renderTradeReturnChain(){const html=returnChainHTML(),content=$("tradeReturnTreeContent");if(content)content.innerHTML=html;return html}
function openTradeReturnTree(playerId,managerId){
  const id=String(playerId),mid=String(managerId),managerRow=returnTreeManagers(id).find(x=>String(x.id)===mid),trade=managerRow?.trade,modal=$("tradeReturnTreeModal");if(!modal||!trade)return;
  returnChainSession={rootPlayerId:id,managerId:mid,rootTrade:trade,currentReceived:[],steps:[{asset:{type:'player',id,name:playerName(id),after:Number(trade.created)||0},trade,conversion:null,sourceAsset:null}]};
  renderTradeReturnChain();modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.classList.add('trade-return-tree-open');
}
function followTradeReturnChainAsset(index){
  const session=returnChainSession,asset=session?.currentReceived?.[Number(index)];if(!session||!asset||session.steps.length>=8)return;
  const next=returnChainNext(asset,session.managerId);if(!next)return;
  const token=`${returnChainAssetToken(next.asset)}|${returnChainTradeKey(next.trade)}`;
  if(session.steps.some(step=>`${returnChainAssetToken(step.asset)}|${returnChainTradeKey(step.trade)}`===token))return;
  session.steps.push({asset:next.asset,trade:next.trade,conversion:next.conversion||null,sourceAsset:next.sourceAsset||asset});renderTradeReturnChain();$("tradeReturnTreeModal")?.querySelector?.(".trade-return-tree-sheet")?.scrollTo?.({top:0,behavior:'smooth'});
}
function goToReturnChainStep(index){if(!returnChainSession)return;const n=Math.max(0,Math.min(Number(index)||0,returnChainSession.steps.length-1));returnChainSession.steps=returnChainSession.steps.slice(0,n+1);renderTradeReturnChain();$("tradeReturnTreeModal")?.querySelector?.(".trade-return-tree-sheet")?.scrollTo?.({top:0,behavior:'smooth'})}
function closeTradeReturnTree(){const modal=$("tradeReturnTreeModal");if(!modal)return;modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.classList.remove('trade-return-tree-open');returnChainSession=null}
function playerHistoryHTML(playerId){const id=String(playerId),name=playerName(id),trades=playerTrades(id),avatar=`https://sleepercdn.com/content/nba/players/${id}.jpg`,seasonAvg=playerCurrentAverage(id),efficiency=playerFptsPer36(id,seasonAvg.season,seasonAvg.avg),profileTags=playerProfileTagsHTML(id,seasonAvg,efficiency),starred=isPlayerStarred(id),treeManagers=returnTreeManagers(id),treeControl=treeManagers.length?`<div class="return-tree-launch"><div><span class="eyebrow">TRADE RETURN CHAIN</span><strong>Follow a former owner's return one asset at a time</strong></div>${treeManagers.length>1?`<select data-return-tree-manager aria-label="Choose manager return chain">${treeManagers.map(x=>`<option value="${esc(x.id)}">${esc(x.name)} · traded ${fmt(x.trade.created,true)}</option>`).join('')}</select>`:`<input type="hidden" data-return-tree-manager value="${esc(treeManagers[0].id)}">`}<button type="button" data-open-return-tree="${esc(id)}">View Trade Return Chain</button></div>`:'';return `<div class="player-history-hero"><span class="player-history-avatar"><img src="${esc(avatar)}" alt="" onerror="this.style.display='none'"></span><div class="player-history-main"><span class="eyebrow">PLAYER TRANSACTION FILE</span><div class="player-title-row"><h2 id="playerHistoryTitle">${esc(name)}</h2><div class="player-interest-control"><button type="button" class="player-star-btn ${starred?'active':''}" data-star-player="${esc(id)}" aria-pressed="${starred}" title="${starred?'Remove trade interest':'Signal trade interest'}">${starred?'★':'☆'}</button><small>Think this player is getting traded? Tap the star</small></div></div><p>${trades.length} all-time trade${trades.length===1?'':'s'} recorded across loaded IMO Dynasty seasons.</p></div><div class="player-current-average player-efficiency-stats"><div><span>FPTS/G</span><strong>${seasonAvg.avg>0?seasonAvg.avg.toFixed(2):'—'}</strong></div><div class="player-efficiency-secondary"><span>MPG</span><strong>${efficiency.mpg>0?efficiency.mpg.toFixed(1):'—'}</strong></div><div class="player-efficiency-secondary"><span>FPTS/36</span><strong>${fpts36Display(efficiency)}</strong></div><small>${seasonAvg.games?`${seasonAvg.games} games · ${esc(seasonAvg.season)}`:'Season not started'}</small>${profileTags}</div></div>${treeControl}<div class="player-history-timeline">${trades.length?trades.map((t,i)=>`<details class="player-history-trade" ${i===0?'open':''}><summary><span class="player-history-index">${trades.length-i}</span><span><strong>${mids(t).map(mid=>esc(managerName(mid,t))).join(' ↔ ')}</strong><small>${fmt(t.created)} · ${esc(t.season_label||'')}</small></span><span class="player-history-view">View trade</span></summary><div class="trade-detail-body">${tradeDetailsHTML(t)}</div></details>`).join(''):'<div class="profile-empty">No trades involving this player were found in the loaded league history.</div>'}</div>`}
async function openPlayerHistory(playerId){
  const modal=$("playerHistoryModal"),content=$("playerHistoryContent");if(!modal||!content)return;
  const id=String(playerId);modal.classList.add("open");modal.setAttribute("aria-hidden","false");modal.dataset.playerId=id;document.body.classList.add("player-history-open");
  content.innerHTML='<div class="manager-profile-loading"><strong>Loading player season metrics…</strong><small>Resolving current-season data and the 2025 fallback.</small></div>';
  const currentSeason=String(state.bundles.find(b=>String(b.league?.league_id)===CONFIG.currentLeagueId)?.league?.season||'2026');
  try{await ensurePlayerEfficiencyData([id],currentSeason)}catch(error){console.warn('Player efficiency hydration failed:',error)}
  if(modal.dataset.playerId===id)content.innerHTML=playerHistoryHTML(id);
}
function closePlayerHistory(){const modal=$("playerHistoryModal");if(!modal)return;modal.classList.remove("open");modal.setAttribute("aria-hidden","true");document.body.classList.remove("player-history-open")}

function managerDirectoryHTML(){
  const weeks=meaningfulWeeks(state.modelBundle),through=weeks.at(-1)||Infinity,powerById=Object.fromEntries(modelRows(state.modelBundle,through,"power").map(x=>[String(x.id),x]));
  return [...state.managers.values()].sort((a,b)=>(powerById[a.id]?.rank||99)-(powerById[b.id]?.rank||99)||a.name.localeCompare(b.name)).map(m=>{
    const avatar=m.avatar?`<img src="${esc(m.avatar)}" alt="" loading="lazy">`:`<span>${esc(m.initials)}</span>`,rank=powerById[m.id]?.rank;
    return `<button class="manager-directory-item manager-profile-link" type="button" data-manager-id="${esc(m.id)}"><span class="manager-directory-rank">${rank?`#${rank}`:"—"}</span><span class="manager-directory-avatar">${avatar}</span><span class="manager-directory-copy"><strong>${esc(m.name)}</strong><small>Open manager profile</small></span><span class="manager-directory-arrow">→</span></button>`
  }).join("")||'<div class="profile-empty">No managers available.</div>'
}
function openManagerDirectory(){const modal=$("managerDirectoryModal"),list=$("managerDirectoryList");if(!modal||!list)return;list.innerHTML=managerDirectoryHTML();modal.classList.add("open");modal.setAttribute("aria-hidden","false");document.body.classList.add("manager-directory-open");requestAnimationFrame(()=>{observeManagerProfileLinks();$('managerDirectoryClose')?.focus()})}
function closeManagerDirectory(){const modal=$("managerDirectoryModal");if(!modal)return;modal.classList.remove("open");modal.setAttribute("aria-hidden","true");document.body.classList.remove("manager-directory-open")}

function managerProfileCacheKey(managerId){return `${String(managerId)}|${String(state.profileAverageSeason||"")}`}
function managerProfileCoreFingerprint(managerId){
  const id=String(managerId||''),manager=state.managers.get(id),roster=safeArray(manager?.roster?.players).map(String).sort().join(','),picks=safeArray(manager?.roster?.draft_picks||[]).map(String).sort().join(',');
  return `${CONFIG.currentLeagueId}|${id}|${roster}|${picks}`
}
function managerProfileSessionKey(key){return `imo-profile-v3377-session|${key}`}
function managerProfilePersistentKey(key){return `imo-profile-v3377-persistent|${key}`}
function managerProfileTabPersistentKey(managerId,tab){return `imo-profile-tab-v3377|${String(managerId)}|${String(state.profileAverageSeason||'')}|${String(tab)}`}
function readManagerProfileTabCache(managerId,tab){
  try{
    const raw=localStorage.getItem(managerProfileTabPersistentKey(managerId,tab));if(!raw)return null;
    const entry=JSON.parse(raw),expected=managerProfileCoreFingerprint(managerId);
    if(!entry?.html||entry.fingerprint!==expected)return null;
    return entry.html
  }catch(_){return null}
}
function writeManagerProfileTabCache(managerId,tab,html){
  if(!html)return;
  try{localStorage.setItem(managerProfileTabPersistentKey(managerId,tab),JSON.stringify({html,savedAt:Date.now(),fingerprint:managerProfileCoreFingerprint(managerId)}))}catch(_){ }
}
function cacheManagerProfileTabsFromHTML(managerId,html){
  if(!html||!('DOMParser' in window))return;
  try{const doc=new DOMParser().parseFromString(`<div id=\"root\">${html}</div>`,'text/html');doc.querySelectorAll('[data-manager-tab-panel]').forEach(panel=>writeManagerProfileTabCache(managerId,panel.dataset.managerTabPanel,panel.outerHTML))}catch(_){ }
}
function mountCachedManagerProfileTab(managerId,tab){
  const modal=$('managerProfileModal'),content=$('managerProfileContent'),cached=readManagerProfileTabCache(managerId,tab);if(!modal||!content||!cached)return false;
  let panels=content.querySelector('.manager-profile-tab-panels');
  if(!panels){panels=document.createElement('div');panels.className='manager-profile-tab-panels';const loose=content.querySelector('[data-manager-tab-panel=\"overview\"]');if(loose)panels.appendChild(loose);content.appendChild(panels)}
  if(!panels.querySelector(`[data-manager-tab-panel=\"${tab}\"]`))panels.insertAdjacentHTML('beforeend',cached);
  bindSparklineTooltips(content);setManagerProfileTab(tab,true);return true
}
function parseManagerProfileCache(raw){
  if(!raw)return null;
  try{const parsed=JSON.parse(raw);if(parsed&&typeof parsed.html==='string')return parsed}catch(_){ }
  // Backward compatibility with older caches that stored raw HTML.
  if(String(raw).trim().startsWith('<'))return{html:String(raw),savedAt:0,fingerprint:''};
  return null
}
function readManagerProfileCachedHTML(key,managerId=null){
  if(state.profileHTMLCache.has(key))return state.profileHTMLCache.get(key);
  const expected=managerId!=null?managerProfileCoreFingerprint(managerId):'';
  for(const storage of [sessionStorage,localStorage]){
    try{
      const storageKey=storage===sessionStorage?managerProfileSessionKey(key):managerProfilePersistentKey(key),entry=parseManagerProfileCache(storage.getItem(storageKey));
      if(!entry?.html)continue;
      // If the current roster has changed, do not reuse an old profile. Otherwise
      // allow the last known profile to paint immediately, even before history has loaded.
      if(expected&&entry.fingerprint&&entry.fingerprint!==expected)continue;
      state.profileHTMLCache.set(key,entry.html);
      if(storage===localStorage){try{sessionStorage.setItem(managerProfileSessionKey(key),JSON.stringify(entry))}catch(_){ }}
      return entry.html
    }catch(_){ }
  }
  return null;
}
function writeManagerProfileCachedHTML(key,managerId,html){
  if(!html)return;
  state.profileHTMLCache.set(key,html);
  const entry=JSON.stringify({html,savedAt:Date.now(),fingerprint:managerProfileCoreFingerprint(managerId)});
  try{sessionStorage.setItem(managerProfileSessionKey(key),entry)}catch(_){ }
  try{localStorage.setItem(managerProfilePersistentKey(key),entry)}catch(_){ }
}
function clearManagerProfileCachedHTML(managerId){
  const key=managerProfileCacheKey(managerId);state.profileHTMLCache.delete(key);
  try{sessionStorage.removeItem(managerProfileSessionKey(key))}catch(_){ }
  try{localStorage.removeItem(managerProfilePersistentKey(key))}catch(_){ }
}
function cachedManagerProfileHTML(managerId){
  const key=managerProfileCacheKey(managerId),cached=readManagerProfileCachedHTML(key,managerId);
  if(cached)return cached;
  const html=managerProfileHTML(managerId,['overview']);
  writeManagerProfileCachedHTML(key,managerId,html);cacheManagerProfileTabsFromHTML(managerId,html);
  return html;
}
const managerProfilePrewarmQueue=[];
const managerProfilePrewarmIds=new Set();
let managerProfilePrewarmBusy=false;
let managerProfileObserver=null;
function drainManagerProfilePrewarmQueue(){}
function queueManagerProfilePrewarm(){}
function observeManagerProfileLinks(){}


function managerProfileFastHTML(managerId){
  const id=String(managerId),manager=state.managers.get(id);
  if(!manager)return '<div class="profile-empty">Manager profile unavailable.</div>';
  const avatar=manager.avatar?`<img src="${esc(manager.avatar)}" alt="${esc(manager.name)} team avatar" loading="eager">`:esc(manager.initials||manager.name.slice(0,2).toUpperCase());
  const rosterIds=safeArray(manager?.roster?.players).map(String).slice(0,8);
  const rosterRows=rosterIds.map((pid,i)=>{const player=state.players?.[pid]||{},name=playerName(pid),pic=`https://sleepercdn.com/content/nba/players/${pid}.jpg`,avg=Number(playerCurrentAverage(pid)?.avg||0);return `<div class="profile-roster-row"><span class="profile-roster-rank">${i+1}</span><span class="player-avatar-wrap"><img src="${esc(pic)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span class="player-avatar-fallback">${esc(name.split(/\s+/).map(x=>x[0]).slice(0,2).join(''))}</span></span><div>${playerLink(pid,name,'profile-player-name')}<small>${esc(player.position||'NBA')}</small></div><b class="profile-player-average">${avg>0?avg.toFixed(2):'—'}</b></div>`}).join('');
  return `<header class="manager-profile-hero"><div class="manager-profile-avatar">${avatar}</div><div class="manager-profile-hero-copy"><span class="eyebrow">TEAM PROFILE</span><h2>${esc(manager.name)}</h2><p>Manager sections are loading in the background.</p></div></header><nav class="manager-profile-tabs manager-profile-tabs-fast" aria-label="Manager profile sections"><button type="button" class="manager-profile-tab active" data-manager-tab="overview">Overview</button><button type="button" class="manager-profile-tab" data-manager-tab="roster">Roster</button><button type="button" class="manager-profile-tab" data-manager-tab="front-office">Front Office</button><button type="button" class="manager-profile-tab" data-manager-tab="history">History</button></nav><div class="manager-profile-tab-panels"><section class="manager-profile-tab-panel active" data-manager-tab-panel="overview"><div class="manager-profile-grid manager-profile-fast-grid"><section class="manager-profile-card profile-roster-card"><div class="manager-profile-card-heading"><div><span class="eyebrow">CURRENT TEAM</span><h3>Roster preview</h3></div><span class="period-pill">${safeArray(manager?.roster?.players).length} players</span></div><div class="profile-roster-list">${rosterRows||'<div class="profile-empty">No roster data available.</div>'}</div></section></div></section></div>`;
}
function hydrateManagerProfileSection(managerId,tab){
  const id=String(managerId||''),section=String(tab||'overview'),season=String(state.profileAverageSeason||'2026'),key=managerProfileCacheKey(id),rosterIds=safeArray(state.managers.get(id)?.roster?.players).map(String);
  const jobs=[];
  if(section==='roster'){jobs.push(ensurePlayerEfficiencyData(rosterIds,season));jobs.push(ensureManagerRosterGameLogs(id))}
  if(!jobs.length)return;
  const hydrationKey=`hydrate|${id}|${season}|${section}`;
  if(state.profileBuilds.has(hydrationKey))return;
  const hydration=Promise.allSettled(jobs).then(()=>{state.computedCache.managerGrades=null;clearManagerProfileCachedHTML(id);const modal=$('managerProfileModal'),content=$('managerProfileContent');if(modal?.dataset.managerId===id&&modal.classList.contains('open')&&modal.dataset.activeTab===section){const active=section;content.innerHTML=cachedManagerProfileHTML(id);bindSparklineTooltips(content);setManagerProfileTab(active,false)}}).finally(()=>state.profileBuilds.delete(hydrationKey));
  state.profileBuilds.set(hydrationKey,hydration);
}

function buildManagerProfileTab(managerId,tab){
  const id=String(managerId||''),section=String(tab||'overview'),cacheKey=`tab-build|${id}|${section}|${String(state.profileAverageSeason||'')}`;
  if(!id)return Promise.resolve('');
  const cached=readManagerProfileTabCache(id,section);if(cached)return Promise.resolve(cached);
  if(state.profileBuilds.has(cacheKey))return state.profileBuilds.get(cacheKey);
  const priority=state.profilePriorityPromise||Promise.resolve();
  const historyNeed=section==='history'?ensureOlderHistoryLoaded():Promise.resolve();
  const rosterNeed=section==='roster'?Promise.allSettled([ensurePlayerEfficiencyData(safeArray(state.managers.get(id)?.roster?.players).map(String),String(state.profileAverageSeason||'2026')),ensureManagerRosterGameLogs(id)]):Promise.resolve();
  const build=Promise.allSettled([priority,historyNeed,rosterNeed]).then(()=>new Promise((resolve,reject)=>requestAnimationFrame(()=>setTimeout(()=>{try{const html=managerProfileTabPanelHTML(id,section);writeManagerProfileTabCache(id,section,html);resolve(html)}catch(error){reject(error)}},0)))).finally(()=>state.profileBuilds.delete(cacheKey));
  state.profileBuilds.set(cacheKey,build);return build
}
async function preloadManagerProfileSectionsSequential(managerId){
  const id=String(managerId||'');if(!id)return false;
  const queue=['front-office','roster'];
  for(const section of queue){
    if(readManagerProfileTabCache(id,section))continue;
    await yieldToBrowser();
    try{await buildManagerProfileTab(id,section)}catch(error){console.warn(`Deferred ${section} profile preload failed:`,error)}
  }
  return true
}
function ensureManagerFullProfileForTab(managerId,tab){
  const id=String(managerId||''),section=String(tab||'overview'),modal=$('managerProfileModal'),content=$('managerProfileContent');
  if(!id||!modal||!content)return Promise.resolve(false);
  if(section==='overview'){setManagerProfileTab('overview',true);return Promise.resolve(true)}
  if(content.querySelector(`[data-manager-tab-panel="${section}"]`)){setManagerProfileTab(section,true);return Promise.resolve(true)}
  if(mountCachedManagerProfileTab(id,section))return Promise.resolve(true);
  let notice=content.querySelector('.manager-profile-on-demand-loading');
  if(!notice){notice=document.createElement('div');notice.className='manager-profile-on-demand-loading';content.appendChild(notice)}
  notice.innerHTML=`<strong>Loading ${section==='front-office'?'Front Office':section.charAt(0).toUpperCase()+section.slice(1)}…</strong><small>${section==='history'?'Loading full league history only now.':'Preparing this manager section.'}</small>`;
  return buildManagerProfileTab(id,section).then(panelHtml=>{
    if(modal.dataset.managerId!==id)return false;
    content.querySelector('.manager-profile-on-demand-loading')?.remove();
    let panels=content.querySelector('.manager-profile-tab-panels');if(!panels){panels=document.createElement('div');panels.className='manager-profile-tab-panels';content.appendChild(panels)}
    if(!panels.querySelector(`[data-manager-tab-panel="${section}"]`))panels.insertAdjacentHTML('beforeend',panelHtml);
    bindSparklineTooltips(content);setManagerProfileTab(section,true);return true
  }).catch(error=>{console.error('Manager tab build failed:',error);content.querySelector('.manager-profile-on-demand-loading')?.remove();return false})
}

function closeManagerSwitchers(except=null){document.querySelectorAll('[data-manager-switcher].open').forEach(sw=>{if(sw===except)return;sw.classList.remove('open');const trigger=sw.querySelector('[data-manager-switcher-trigger]');const menu=sw.querySelector('.manager-switcher-menu');if(trigger)trigger.setAttribute('aria-expanded','false');if(menu)menu.hidden=true})}
function openMobileProfileInfo(title,html){
  let sheet=document.getElementById('mobileProfileInfoSheet');
  if(!sheet){sheet=document.createElement('div');sheet.id='mobileProfileInfoSheet';sheet.className='mobile-profile-info-sheet';sheet.innerHTML='<button type="button" class="mobile-profile-info-backdrop" data-close-mobile-profile-info aria-label="Close"></button><div class="mobile-profile-info-card" role="dialog" aria-modal="true"><button type="button" class="mobile-profile-info-close" data-close-mobile-profile-info aria-label="Close">×</button><strong class="mobile-profile-info-title"></strong><div class="mobile-profile-info-body"></div></div>';document.body.appendChild(sheet)}
  sheet.querySelector('.mobile-profile-info-title').textContent=title||'Details';sheet.querySelector('.mobile-profile-info-body').innerHTML=html||'';sheet.classList.add('open');document.body.classList.add('mobile-profile-info-open')
}
function closeMobileProfileInfo(){const sheet=document.getElementById('mobileProfileInfoSheet');if(sheet)sheet.classList.remove('open');document.body.classList.remove('mobile-profile-info-open')}
function setManagerProfileTab(tab,updateUrl=true){
  const valid=['overview','roster','front-office','history'],next=valid.includes(String(tab))?String(tab):'overview',modal=$('managerProfileModal');if(!modal)return;
  modal.dataset.activeTab=next;
  modal.querySelectorAll('[data-manager-tab]').forEach(btn=>{const active=btn.dataset.managerTab===next;btn.classList.toggle('active',active);btn.setAttribute('aria-selected',String(active))});
  modal.querySelectorAll('[data-manager-tab-panel]').forEach(panel=>{const active=panel.dataset.managerTabPanel===next;panel.classList.toggle('active',active);panel.hidden=!active});
  if(updateUrl&&modal.dataset.managerId){const id=encodeURIComponent(modal.dataset.managerId),hash=`#manager=${id}&tab=${encodeURIComponent(next)}`;history.replaceState({managerProfile:modal.dataset.managerId,tab:next},'',hash)}
}
function initialiseManagerProfileTab(){setManagerProfileTab(managerProfileTabFromHash()||$('managerProfileModal')?.dataset.activeTab||'overview',false)}
async function openManagerProfile(managerId,pushState=true){
  const modal=$("managerProfileModal"),content=$("managerProfileContent");if(!modal||!content)return;
  const id=String(managerId);modal.classList.add("open");modal.setAttribute("aria-hidden","false");document.body.classList.add("manager-profile-open");modal.dataset.managerId=id;modal.dataset.activeTab='overview';
  const key=managerProfileCacheKey(id),stored=readManagerProfileCachedHTML(key,id);
  if(stored){content.innerHTML=stored}else{const html=managerProfileHTML(id,['overview']);content.innerHTML=html;writeManagerProfileCachedHTML(key,id,html);cacheManagerProfileTabsFromHTML(id,html)}
  bindSparklineTooltips(content);setManagerProfileTab('overview',false);
  // V3.3.77: manager work is intentionally serial, not concurrent. Front Office
  // prepares after the visible Overview; Roster prepares after Front Office.
  // History/H2H is never calculated until the user explicitly opens History.
  requestAnimationFrame(()=>setTimeout(()=>preloadManagerProfileSectionsSequential(id),0));
  const requestedTab=!pushState?(managerProfileTabFromHash()||'overview'):'overview';
  if(requestedTab!=='overview')requestAnimationFrame(()=>ensureManagerFullProfileForTab(id,requestedTab));
  if(pushState)history.pushState({managerProfile:id,tab:'overview'},'',`#manager=${encodeURIComponent(id)}&tab=overview`);
  requestAnimationFrame(()=>$('managerProfileClose')?.focus())
}

function upgradeOpenManagerProfile(){const modal=$('managerProfileModal');if(!modal?.classList.contains('open')||!modal.dataset.pendingFullProfile||!modal.dataset.managerId)return;delete modal.dataset.pendingFullProfile;if(modal.dataset.cachedProfileShown){delete modal.dataset.cachedProfileShown;return}/* Core shell remains intentionally lightweight until a deeper tab is requested. */}
function closeManagerProfile(updateHistory=true){
  const modal=$("managerProfileModal");
  if(!modal)return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden","true");
  document.body.classList.remove("manager-profile-open");
  if(updateHistory&&location.hash.startsWith("#manager="))history.pushState({},"",location.pathname+location.search);
}
function openManagerFromHash(){
  const match=location.hash.match(/^#manager=([^&]+)/);
  if(match&&state.managers.size)openManagerProfile(decodeURIComponent(match[1]),false);
  else closeManagerProfile(false);
}


function currentRosterOwner(playerId){for(const roster of state.currentRosters||[]){if((roster.players||[]).map(String).includes(String(playerId)))return String(roster.owner_id)}return null}
function isCurrentlyRostered(playerId){return Boolean(currentRosterOwner(String(playerId)))}
function tickerRankingOrRecord(){
  const bundle=state.modelBundle;if(!bundle)return null;const weeks=meaningfulWeeks(bundle);if(weeks.length<2)return null;const last=weeks.at(-1),prior=weeks.at(-2),now=modelRows(bundle,last,'power'),before=Object.fromEntries(modelRows(bundle,prior,'power').map(x=>[String(x.id),x.rank])),moves=now.map(x=>({...x,move:(before[String(x.id)]||x.rank)-x.rank})).sort((a,b)=>Math.abs(b.move)-Math.abs(a.move)),top=moves[0];if(top&&Math.abs(top.move)>=2)return `${top.name} jumps ${Math.abs(top.move)} spot${Math.abs(top.move)===1?'':'s'} to #${top.rank} in the Power Rankings`;const currentRows=safeArray(bundle.matchups).filter(x=>Number(x?.week)===Number(last)),best=currentRows.filter(x=>Number(x?.points)>0).sort((a,b)=>Number(b.points)-Number(a.points))[0],all=highestTeamScore(safeArray(state.bundles));if(best&&all&&Number(best.points)>=all.pts)return `New league record: ${managerName(bundle.ownerByRoster?.[String(best.roster_id)])} posts ${Number(best.points).toFixed(1)} points`;return null
}
function tickerPlayerRumours(){
  const templates=[x=>`SHAMS: Unnamed sources indicate growing trade chatter surrounding ${playerName(x.playerId)}.`,x=>`SOURCES: Rival GMs believe ${x.managerId?managerName(x.managerId):'a mystery team'} is exploring trade packages involving ${playerName(x.playerId)}.`,x=>`REPORTS: ${playerName(x.playerId)} has featured heavily in recent trade inquiries.`];let rows=[];try{rows=playerInterestRows()}catch(_){rows=[]}return safeArray(rows).slice(-3).reverse().map(x=>(templates[Number(x?.template)%templates.length]||templates[0])(x))
}
function shortTradeHeadline(raw){try{const t=normaliseTrade(raw),names=mids(t).map(id=>managerName(id,t));return names.length?`${names.join(' and ')} complete a deal involving ${tradeSummary(t)}`:null}catch(_){return null}}
function stripTickerEmoji(text){try{return String(text||'').replace(/[\p{Extended_Pictographic}\uFE0F]/gu,'').replace(/\s{2,}/g,' ').trim()}catch(_){return String(text||'').trim()}}
function tickerTopPerformer(){
  const rostered=new Set((state.currentRosters||[]).flatMap(r=>(r.players||[]).map(String))),seasons=["2026","2025",String(state.modelBundle?.league?.season||"")].filter((v,i,a)=>v&&a.indexOf(v)===i);
  for(const season of seasons){const candidates=[];Object.entries(state.gameLogs?.[season]||{}).forEach(([id,rows])=>{if(!rostered.has(String(id)))return;(rows||[]).forEach(row=>{const date=gameDateValue(row),fpts=rawFantasyPoints(row,state.modelBundle?.league?.scoring_settings||{});if(date&&gameWasPlayed(row)&&Number.isFinite(fpts))candidates.push({id,date,fpts})})});if(!candidates.length)continue;const latest=Math.max(...candidates.map(x=>x.date)),day=candidates.filter(x=>Math.abs(x.date-latest)<43200000).sort((a,b)=>b.fpts-a.fpts)[0];if(day){const owner=currentRosterOwner(day.id);return `🔥 ${playerName(day.id)}: ${day.fpts.toFixed(1)} FPTS${owner?` for ${managerName(owner)}`:''}`}}
  const bundle=state.modelBundle,weeks=meaningfulWeeks(bundle);if(!bundle||!weeks.length)return null;const week=weeks.at(-1),rows=safeArray(bundle.matchups).filter(x=>Number(x?.week)===Number(week)),best=[];rows.forEach(row=>Object.entries(row.players_points||{}).forEach(([id,v])=>{if(rostered.has(String(id))&&Number(v)>0)best.push({id,fpts:Number(v)})}));best.sort((a,b)=>b.fpts-a.fpts);return best[0]?`🔥 Latest leader: ${playerName(best[0].id)} ${best[0].fpts.toFixed(1)} FPTS`:null
}
function tickerMatchup(){const bundle=state.bundles.find(b=>String(b.league?.league_id)===CONFIG.currentLeagueId)||state.modelBundle;if(!bundle)return null;const played=meaningfulWeeks(bundle),nextWeek=(played.at(-1)||0)+1,rows=bundle.matchups.filter(x=>x.week===nextWeek&&x.matchup_id!=null),groups={};rows.forEach(x=>(groups[x.matchup_id]??=[]).push(x));const standings=Object.fromEntries(standingsTable(bundle).map(x=>[x.id,x.standingRank]));const options=Object.values(groups).filter(g=>g.length>=2).map(g=>{const ids=g.map(x=>bundle.ownerByRoster[String(x.roster_id)]).filter(Boolean);return{ids,score:ids.reduce((sum,id)=>sum+(standings[id]||99),0)}}).filter(x=>x.ids.length>=2).sort((a,b)=>a.score-b.score);const pick=options[0];return pick?`Matchup of the Week: #${standings[pick.ids[0]]||'—'} ${managerName(pick.ids[0])} vs #${standings[pick.ids[1]]||'—'} ${managerName(pick.ids[1])}`:null}
function tickerStreak(){if(!state.modelBundle)return null;const outcomes=outcomesForBundle(state.modelBundle),rows=[];Object.entries(outcomes).forEach(([id,games])=>{let type=null,count=0;for(let i=games.length-1;i>=0;i--){const next=games[i].result===1?'W':games[i].result===0?'L':'T';if(next==='T')break;if(type===null)type=next;if(next!==type)break;count++}if(count>=2)rows.push({id,type,count})});rows.sort((a,b)=>b.count-a.count);const x=rows[0];return x?`${x.type==='W'?'Hot streak':'Cold streak'}: ${managerName(x.id)} ${x.type==='W'?'has won':'has lost'} ${x.count} straight`:null}
function tickerDrought(){const best=longestTradeDroughtSince();return best?`${best.m.name} recorded the longest trade drought since October 2025 at ${best.days} days`:null}

function startTickerMotion(root){
  const track=root?.querySelector('.ticker-track'),group=track?.querySelector('.ticker-group');
  if(!track||!group)return;

  // Cancel any prior ticker motion before restarting after a re-render.
  try{track._imoTickerAnimation?.cancel?.()}catch(_){}
  if(track._imoTickerRaf){cancelAnimationFrame(track._imoTickerRaf);track._imoTickerRaf=0}

  const begin=()=>{
    const distance=Math.max(1,Math.round(group.scrollWidth||group.getBoundingClientRect().width||1));
    const speed=54; // px/sec — deliberately visible but still readable.
    const durationMs=Math.max(12000,(distance/speed)*1000);

    // Primary path: Web Animations API. This avoids browser-specific CSS calc()
    // parsing issues and guarantees the track begins translating immediately.
    if(typeof track.animate==='function'){
      try{
        track.style.animation='none';
        track.style.transform='translate3d(0,0,0)';
        const animation=track.animate(
          [
            {transform:'translate3d(0px,0,0)'},
            {transform:`translate3d(-${distance}px,0,0)`}
          ],
          {duration:durationMs,iterations:Infinity,easing:'linear'}
        );
        animation.currentTime=Math.min(400,durationMs*0.03);
        animation.play();
        track._imoTickerAnimation=animation;
        return;
      }catch(error){console.warn('Ticker WAAPI fallback engaged',error)}
    }

    // Fallback for older browsers: direct requestAnimationFrame translation.
    const started=performance.now()-350;
    const tick=now=>{
      if(!track.isConnected)return;
      const elapsed=(now-started)/1000;
      const x=-((elapsed*speed)%distance);
      track.style.transform=`translate3d(${x}px,0,0)`;
      track._imoTickerRaf=requestAnimationFrame(tick);
    };
    track._imoTickerRaf=requestAnimationFrame(tick);
  };

  // Run once immediately, then once more after layout so the measured loop
  // width is correct even during the first paint.
  begin();
  requestAnimationFrame(()=>{
    if(track._imoTickerAnimation){
      const oldAnimation=track._imoTickerAnimation;
      try{oldAnimation.cancel()}catch(_){}
    }
    if(track._imoTickerRaf){cancelAnimationFrame(track._imoTickerRaf);track._imoTickerRaf=0}
    begin();
  });
}
function renderTicker(){
  const root=$("leagueTicker");if(!root)return;
  root.hidden=false;
  try{
    const stories=[],add=value=>{if(Array.isArray(value))stories.push(...value.filter(Boolean));else if(value)stories.push(value)};
    try{add(tickerPlayerRumours())}catch(error){console.warn("Ticker rumours unavailable",error)}
    safeArray(state.trades).filter(Boolean).slice(0,2).forEach(raw=>{try{add(shortTradeHeadline(normaliseTrade(raw)))}catch(error){console.warn('Ticker skipped malformed trade',error)}});
    for(const builder of [tickerMatchup,tickerStreak,tickerRankingOrRecord,tickerDrought]){try{add(builder())}catch(error){console.warn("Ticker story unavailable",error)}}
    add("IMO Awards voting opens 23 February · closes 28 February");
    const unique=[...new Set(stories.map(text=>{try{return stripTickerEmoji(text)}catch{return String(text||"")}}).filter(Boolean))].slice(0,10);
    if(!unique.length)unique.push("IMO Dynasty · Live League HQ");
    const group=unique.map((text,i)=>`<span class="ticker-item">${esc(text)}</span>${i<unique.length-1?'<span class="ticker-dot">•</span>':''}`).join('');
    root.innerHTML=`<span class="ticker-live">LIVE</span><div class="ticker-window"><div class="ticker-track"><div class="ticker-group">${group}</div><div class="ticker-group" aria-hidden="true">${group}</div></div></div>`;
    // Start immediately and size the loop to the actual duplicated headline width.
    // This avoids a visually stagnant ticker on wide screens and does not wait on extra data.
    startTickerMotion(root)
  }catch(error){console.error('Ticker render failed',error);root.innerHTML='<span class="ticker-live">LIVE</span><div class="ticker-window"><div class="ticker-track"><div class="ticker-group"><span class="ticker-item">IMO Dynasty · Live League HQ</span></div><div class="ticker-group" aria-hidden="true"><span class="ticker-item">IMO Dynasty · Live League HQ</span></div></div></div>';startTickerMotion(root)}
}
async function loadTickerGameLogs(){const season=String(tradeTargetAverageContext().season||state.modelBundle?.league?.season||'2025'),ids=[...new Set((state.currentRosters||[]).flatMap(r=>(r.players||[]).map(String)))],scoring=seasonBundleForStats(season)?.league?.scoring_settings||state.modelBundle?.league?.scoring_settings||{};if(!ids.length)return;const rows=await limitedMap(ids,6,async id=>{const result=await loadPlayerGameLogAverage(id,season,scoring);return result?{id,...result}:null});state.gameLogs[season]??={};rows.filter(Boolean).forEach(row=>state.gameLogs[season][row.id]=row.rows||[]);renderForChange('gameLogs')}


function insiderEventKey(){
  const latestTrade=state.trades[0];
  const current=state.bundles.find(b=>String(b.league?.league_id)===CONFIG.currentLeagueId)||state.modelBundle;
  const latestWeek=meaningfulWeeks(current).at(-1)||0;
  return `${latestTrade?.transaction_id||latestTrade?.created||'no-trade'}|${latestWeek}`;
}
function insiderPlayerImage(id){return id?`https://sleepercdn.com/content/nba/players/${id}.jpg`:null}
function marketSnapshot(){
  const current=state.bundles.find(b=>String(b.league?.league_id)===CONFIG.currentLeagueId)||state.modelBundle;
  const week=meaningfulWeeks(current).at(-1)||Infinity;
  return{savedAt:Date.now(),latestTradeId:String(state.trades[0]?.transaction_id||state.trades[0]?.created||'none'),power:Object.fromEntries(modelRows(state.modelBundle,week,'power').map(x=>[String(x.id),{rank:x.rank}])),odds:Object.fromEntries(priceRows(week).map(x=>[String(x.id),{odds:x.odds,eliminated:x.eliminated}]))};
}
function marketReactionStory(trade,powerRows,oddsRows){
  if(!trade)return null;
  const ids=mids(trade),powerBy=Object.fromEntries(powerRows.map(x=>[String(x.id),x])),oddsBy=Object.fromEntries(oddsRows.map(x=>[String(x.id),x])),grades=Object.fromEntries(tradeGrades(trade).map(x=>[String(x.id),x]));
  let previous=null;try{previous=JSON.parse(localStorage.getItem('imoMarketSnapshotV1')||'null')}catch{}
  const tradeId=String(trade.transaction_id||trade.created||'none'),canCompare=previous&&String(previous.latestTradeId)!==tradeId;
  const players=Object.values(tradeAssets(trade)).flat().filter(a=>a.type==='player').sort((a,b)=>Number(b.value||0)-Number(a.value||0)),hero=players[0];
  const lines=ids.map(id=>{
    const nowP=powerBy[String(id)],nowO=oddsBy[String(id)],grade=grades[String(id)]?.grade||'—',metrics=tradeSideMetrics(trade,id),oldP=canCompare?previous.power?.[String(id)]?.rank:null,oldO=canCompare?previous.odds?.[String(id)]?.odds:null;
    const rankText=oldP&&nowP?`Power Ranking ${oldP===nowP.rank?`holds at #${nowP.rank}`:`moves from #${oldP} to #${nowP.rank}`}`:nowP?`currently sits #${nowP.rank} in the Power Rankings`:'has no current ranking';
    const oddsText=Number.isFinite(oldO)&&Number.isFinite(nowO?.odds)?`title price ${oldO===nowO.odds?`holds at $${Number(nowO.odds).toFixed(2)}`:`moves from $${Number(oldO).toFixed(2)} to $${Number(nowO.odds).toFixed(2)}`}`:nowO?`is priced at ${championshipOddsLabel(nowO)}`:'has no active title price';
    const valueText=metrics.net>1?`a modelled value gain of ${metrics.net.toFixed(1)}`:metrics.net<-1?`a modelled value deficit of ${Math.abs(metrics.net).toFixed(1)}`:'a near-even modelled value return';
    return `${managerName(id,trade)} ${rankText}, ${oddsText}, and earns a ${grade} grade with ${valueText}.`;
  });
  const strongest=ids.map(id=>({id,net:tradeSideMetrics(trade,id).net})).sort((a,b)=>b.net-a.net)[0];
  return{kicker:'MARKET REACTION',headline:`${hero?.name||'The latest trade'} sends the IMO market into overdrive`,image:hero?insiderPlayerImage(hero.id):state.managers.get(ids[0])?.avatar||null,body:`The deal is official, and the model has already repriced the fallout. ${lines.join(' ')} ${strongest?`The early market verdict leans toward ${managerName(strongest.id,trade)}, but the next completed gameweek will decide whether the model was sharp or merely loud.`:'The league now waits for the first real results.'}`};
}
function currentTopPlayer(){const avg=seasonAverageMap(String(state.modelBundle?.league?.season||'2026'));const rostered=new Set((state.currentRosters||[]).flatMap(r=>(r.players||[]).map(String)));const row=Object.entries(avg).filter(([id,v])=>rostered.has(String(id))&&Number(v)>0).sort((a,b)=>Number(b[1])-Number(a[1]))[0];return row?{id:String(row[0]),name:playerName(row[0]),avg:Number(row[1])}:null}
function buildInsiderEdition(){
  const eventKey=insiderEventKey(),storageKey='imoInsiderEditionV313';
  try{const cached=JSON.parse(localStorage.getItem(storageKey)||'null');if(cached?.eventKey===eventKey)return cached}catch{}
  const current=state.bundles.find(b=>String(b.league?.league_id)===CONFIG.currentLeagueId)||state.modelBundle;
  const weeks=meaningfulWeeks(current),lastWeek=weeks.at(-1)||0,power=modelRows(state.modelBundle,weeks.at(-1)||Infinity,'power'),oddsRows=priceRows(lastWeek||Infinity),leader=power[0],latest=state.trades[0],topPlayer=currentTopPlayer(),streakText=tickerStreak(),rankingText=tickerRankingOrRecord();
  const streakRows=[];
  Object.entries(outcomesForBundle(current)).forEach(([id,games])=>{let type=null,count=0;for(let i=games.length-1;i>=0;i--){const next=games[i].result===1?'W':games[i].result===0?'L':'T';if(next==='T')break;if(type===null)type=next;if(next!==type)break;count++}if(type==='W'&&count>=3)streakRows.push({id:String(id),count})});
  streakRows.sort((a,b)=>b.count-a.count);const hotTeam=streakRows[0],hotOdds=hotTeam?priceRows(lastWeek||Infinity).find(x=>String(x.id)===hotTeam.id):null;
  const stories=[],eventSeed=[...eventKey].reduce((sum,ch)=>sum+ch.charCodeAt(0),0);
  const washedCandidates=allGameLogFormRows().filter(x=>Number(x.priorAvg)>23&&Number(x.recentAvg)>0&&Number(x.recentAvg)<18).sort((a,b)=>a.recentAvg-b.recentAvg),washed=washedCandidates[0];
  if(latest){const playerAssets=Object.values(tradeAssets(latest)).flat().filter(a=>a.type==='player');const hero=playerAssets.sort((a,b)=>Number(b.value||0)-Number(a.value||0))[0];const teams=mids(latest).map(id=>managerName(id,latest));stories.push({kicker:'BLOCKBUSTER',headline:`${hero?.name||'The latest deal'} just changed the temperature of the league`,image:hero?insiderPlayerImage(hero.id):state.managers.get(mids(latest)[0])?.avatar||null,body:`${teams.join(' and ')} have forced every rival GM to reassess the market after completing the newest deal on the board. ${hero?.name?`${hero.name} is the name that sells the headline, but this is not a move that can be judged on reputation alone.`:'The move carries immediate consequences for roster construction and the next wave of negotiations.'} The early grades may call it balanced, but balanced trades do not always produce balanced outcomes. One side will eventually look brave; the other may look like it blinked first.`});}
  if(washed&&stories.length<3&&eventSeed%3!==0){const owner=currentRosterOwner(washed.id);stories.push({kicker:'THE BIG QUESTION',headline:`Is ${washed.name} washed — or is the panic getting ridiculous?`,image:insiderPlayerImage(washed.id),body:`The box score is starting to look uncomfortable. ${washed.name} owns a season average of ${washed.priorAvg.toFixed(1)} fantasy points, yet has managed only ${washed.recentAvg.toFixed(1)} across the last five games. For a player with an established fantasy profile, that is not a harmless dip — it is the kind of slide that invites trade offers, buy-low messages and some truly disrespectful group-chat takes. ${owner?`${managerName(owner)} now has a decision to make: trust the résumé, or move before concern turns into consensus.`:'The league is watching closely.'} Calling him finished may be premature. Pretending nothing is wrong would be worse.`});}
  if(hotTeam&&stories.length<3){const hotName=managerName(hotTeam.id),oddsLabel=hotOdds&&!hotOdds.eliminated?championshipOddsLabel(hotOdds):'long odds',stake=[25000,50000,75000][Math.min(2,Math.max(0,hotTeam.count-3))];stories.push({kicker:'MARKET BUZZ',headline:`A punter has reportedly dropped $${stake.toLocaleString()} on ${hotName} at ${oddsLabel}`,image:state.managers.get(hotTeam.id)?.avatar||null,body:`Someone has decided the hot streak is more than a cute story. After ${hotName} ripped off ${hotTeam.count} consecutive wins, league chatter claims a bold punter has taken a five-figure position on the franchise to win it all. It is reckless, dramatic and exactly the sort of wager that becomes legendary if the run continues. Rival GMs can laugh at the ticket now, but another statement win would turn today's price into the kind of number everyone claims they almost backed.`});}
  if(leader&&stories.length<3){const move=(state.previousPowerRanks[leader.id]||leader.rank)-leader.rank;stories.push({kicker:'POWER SURGE',headline:`${leader.name} ${move>0?'storms to':'refuses to surrender'} the No. 1 spot`,image:state.managers.get(String(leader.id))?.avatar||null,body:`${leader.name} owns the strongest all-round profile in IMO Dynasty right now, and the rest of the league is running out of excuses. ${move>0?`A jump of ${move} place${move===1?'':'s'} has turned momentum into a statement.`:'Holding the top spot is now less of a surprise and more of a warning.'} Results, form and title outlook all point in the same direction. The only real question is whether this is a temporary peak — or the beginning of a gap nobody else can close.`});}
  if(topPlayer&&stories.length<3){const owner=currentRosterOwner(topPlayer.id);stories.push({kicker:'AWARD WATCH',headline:`The MVP race may already belong to ${topPlayer.name}`,image:insiderPlayerImage(topPlayer.id),body:`At ${topPlayer.avg.toFixed(1)} fantasy points per game, ${topPlayer.name} is not merely leading the early conversation — he is threatening to make it boring. ${owner?`${managerName(owner)} has built a weekly advantage around that production, and every opponent now enters the matchup knowing the margin for error is almost nonexistent.`:'The numbers have pushed him to the centre of the awards race.'} There is plenty of season left, but anyone waiting for the pace to collapse may be waiting a very long time.`});}
  while(stories.length<3){stories.push({kicker:'LEAGUE WATCH',headline:rankingText||streakText||'The next gameweek could reshape the league',image:null,body:`With Week ${lastWeek+1} approaching, the margins between contenders are beginning to matter. Power-ranking movement, changing roster identities and the next trade call could all alter the league's direction before the next edition. Front offices are watching the market closely, and one decisive move may be enough to turn quiet momentum into the week's defining story.`})}
  const coming=[];if(topPlayer)coming.push(`${topPlayer.name}'s MVP case under the microscope`);if(latest)coming.push('Trade market reaction and potential follow-up deals');coming.push(lastWeek?`Week ${lastWeek+1} matchup pressure builds`:'Opening-week power picture takes shape');coming.push('Awards watch and emerging breakout candidates');
  let issue=1;try{const prev=JSON.parse(localStorage.getItem(storageKey)||'null');issue=(prev?.issue||0)+1}catch{}
  const edition={eventKey,issue,date:new Date().toISOString(),stories:stories.slice(0,3),coming:coming.slice(0,3)};try{localStorage.setItem(storageKey,JSON.stringify(edition));localStorage.setItem('imoMarketSnapshotV1',JSON.stringify(marketSnapshot()))}catch{}return edition;
}
function renderHeadlines(){const root=$('headlinesContent');if(!root)return;const ed=buildInsiderEdition();root.innerHTML=`<header class="insider-header"><div><span class="insider-brand"><img src="assets/imo-insider.svg" alt=""><span><b>IMO INSIDER</b><small>DAILY LEAGUE EDITION</small></span></span><h2 id="headlinesTitle">News</h2><p>${fmt(new Date(ed.date).getTime())} · Issue #${String(ed.issue).padStart(3,'0')}</p></div><span class="insider-live">LATEST EDITION</span></header><div class="insider-stories">${ed.stories.map((story,i)=>`<article class="insider-story">${story.image?`<div class="insider-image"><img src="${esc(story.image)}" alt="" loading="lazy" onerror="this.parentElement.remove()"></div>`:''}<div class="insider-copy"><span>${esc(story.kicker)}</span><h3>${esc(story.headline)}</h3><p>${esc(story.body)}</p></div></article>`).join('')}</div><aside class="coming-tomorrow"><span>COMING TOMORROW</span><ul>${ed.coming.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></aside>`}
function openHeadlines(){renderHeadlines();const modal=$('headlinesModal');modal?.classList.add('open');modal?.setAttribute('aria-hidden','false');document.body.classList.add('headlines-open')}
function closeHeadlines(){const modal=$('headlinesModal');modal?.classList.remove('open');modal?.setAttribute('aria-hidden','true');document.body.classList.remove('headlines-open')}


const MOCK_DRAFT_2027_PROSPECTS=[
  {rank:1,name:"Tyran Stokes",position:"SF",team:"Kansas",height:"6'7\"",weight:"230 lbs",age:"19.7 yrs"},
  {rank:2,name:"Caleb Holt",position:"SG",team:"Arizona",height:"6'5\"",weight:"200 lbs",age:"19.6 yrs"},
  {rank:3,name:"Jordan Smith Jr.",position:"SG/PG",team:"Arkansas",height:"6'2\"",weight:"200 lbs",age:"19.8 yrs"},
  {rank:4,name:"Cameron Williams",position:"PF",team:"Duke",height:"6'11\"",weight:"200 lbs",age:"19.7 yrs"},
  {rank:5,name:"Anthony Thompson",position:"SF",team:"Ohio State",height:"6'9\"",weight:"215 lbs",age:"18.9 yrs"},
  {rank:6,name:"Bruce Branch III",position:"SF",team:"BYU",height:"6'7\"",weight:"190 lbs",age:"18.7 yrs"},
  {rank:7,name:"Braylon Mullins",position:"SG",team:"UConn",height:"6'6\"",weight:"196 lbs",age:"21.2 yrs"},
  {rank:8,name:"Stefan Joksimović",position:"PG/SG",team:"Baskonia",height:"6'7\"",weight:"205 lbs",age:"18.6 yrs"},
  {rank:9,name:"Baba Oladotun",position:"SF/PF",team:"Maryland",height:"6'10\"",weight:"195 lbs",age:"18.5 yrs"},
  {rank:10,name:"Brandon McCoy Jr.",position:"PG/SG",team:"Michigan",height:"6'5\"",weight:"190 lbs",age:"19.6 yrs"},
  {rank:11,name:"Sayon Keita",position:"C",team:"North Carolina",height:"7'0\"",weight:"215 lbs",age:"19.3 yrs"},
  {rank:12,name:"Dylan Mingo",position:"PG",team:"Baylor",height:"6'5\"",weight:"185 lbs",age:"18.7 yrs"},
  {rank:13,name:"Amari Allen",position:"SF",team:"Alabama",height:"6'6.5\"",weight:"205 lbs",age:"21.4 yrs"},
  {rank:14,name:"Hugo Yimga-Moukouri",position:"SF",team:"Nanterre 92",height:"6'9\"",weight:"218 lbs",age:"18.9 yrs"},
  {rank:15,name:"Thomas Haugh",position:"PF",team:"Florida",height:"6'9\"",weight:"215 lbs",age:"23.9 yrs"},
  {rank:16,name:"Patrick Ngongba II",position:"C",team:"Duke",height:"6'11\"",weight:"250 lbs",age:"21.3 yrs"},
  {rank:17,name:"Ivan Kharchenkov",position:"SF",team:"Arizona",height:"6'7\"",weight:"230 lbs",age:"20.7 yrs"},
  {rank:18,name:"Tounde Yessoufou",position:"SG/SF",team:"St. John's",height:"6'5.5\"",weight:"220 lbs",age:"21.1 yrs"},
  {rank:19,name:"Miikka Muurinen",position:"PF",team:"Arkansas",height:"6'11\"",weight:"200 lbs",age:"20.3 yrs"},
  {rank:20,name:"Luigi Suigo",position:"C",team:"Villanova",height:"7'4\"",weight:"289 lbs",age:"20.4 yrs"},
  {rank:21,name:"JJ Andrews",position:"SF",team:"Arkansas",height:"6'6\"",weight:"220 lbs",age:"19.3 yrs"},
  {rank:22,name:"Motiejus Krivas",position:"C",team:"Arizona",height:"7'2\"",weight:"260 lbs",age:"22.6 yrs"},
  {rank:23,name:"Christian Collins",position:"SF/PF",team:"USC",height:"6'9\"",weight:"200 lbs",age:"19.8 yrs"},
  {rank:24,name:"Davis Fogle",position:"SG",team:"Gonzaga",height:"6'7\"",weight:"200 lbs",age:"21.0 yrs"},
  {rank:25,name:"Billy Richmond III",position:"SG/SF",team:"Arkansas",height:"6'7\"",weight:"195 lbs",age:"21.2 yrs"},
  {rank:26,name:"Jason Crowe Jr.",position:"PG",team:"Missouri",height:"6'3\"",weight:"170 lbs",age:"18.9 yrs"},
  {rank:27,name:"Milan Momcilovic",position:"SF/PF",team:"Kentucky",height:"6'9.25\"",weight:"218 lbs",age:"22.7 yrs"},
  {rank:28,name:"Alijah Arenas",position:"SG",team:"USC",height:"6'6\"",weight:"197 lbs",age:"20.3 yrs"},
  {rank:29,name:"Malachi Moreno",position:"C",team:"Kentucky",height:"7'0.5\"",weight:"243 lbs",age:"20.7 yrs"},
  {rank:30,name:"David Mirkovic",position:"PF",team:"Illinois",height:"6'9\"",weight:"250 lbs",age:"21.5 yrs"}
];
function mockDraftWeekKey(date=new Date()){
  const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));
  const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);
  const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return `${d.getUTCFullYear()}-${Math.ceil((((d-yearStart)/86400000)+1)/7)}`;
}
function seededNumber(seed){let h=2166136261;for(const ch of String(seed)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return ()=>{h+=0x6D2B79F5;let t=h;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function weeklyMockProspects(){
  const week=mockDraftWeekKey(),rand=seededNumber(`imo-2027-${week}`);
  const topTwenty=MOCK_DRAFT_2027_PROSPECTS.slice(0,20);

  // Keep the leading board credible while allowing controlled weekly movement.
  // Only non-overlapping adjacent pairs can swap, so every top-20 prospect
  // moves by no more than one position in either direction during a week.
  const candidatePairs=[];
  for(let i=0;i<topTwenty.length-1;i++)candidatePairs.push(i);
  for(let i=candidatePairs.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[candidatePairs[i],candidatePairs[j]]=[candidatePairs[j],candidatePairs[i]]}
  const used=new Set(),swapCount=3+Math.floor(rand()*3);
  let completed=0;
  for(const i of candidatePairs){
    if(completed>=swapCount)break;
    if(used.has(i)||used.has(i+1))continue;
    [topTwenty[i],topTwenty[i+1]]=[topTwenty[i+1],topTwenty[i]];
    used.add(i);used.add(i+1);completed++;
  }

  // Picks 21-24 continue to rotate from the wider 21-30 prospect pool.
  const pool=MOCK_DRAFT_2027_PROSPECTS.slice(20),shuffled=[...pool];
  for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]]}
  return [...topTwenty,...shuffled.slice(0,4)];
}
function currentLeagueBundle(){return state.bundles.find(b=>String(b.league?.league_id)===String(CONFIG.currentLeagueId))||state.modelBundle||state.bundles[0]}
function projected2027DraftSlots(){
  const bundle=currentLeagueBundle();if(!bundle)return[];
  const weeks=meaningfulWeeks(bundle),through=weeks.at(-1)||Infinity;
  const worstToBest=[...priceRowsForBundle(bundle,through)].sort((a,b)=>Number(b.odds)-Number(a.odds)||Number(a.rank)-Number(b.rank));
  return worstToBest.map((row,index)=>{const manager=state.managers.get(String(row.id)),rosterId=String(manager?.roster?.roster_id||'');return{slot:index+1,originalRosterId:rosterId,originalManagerId:String(row.id)}}).filter(x=>x.originalRosterId);
}
function ownerManagerFor2027Pick(originalRosterId,round){
  const bundle=currentLeagueBundle(),traded=(bundle?.tradedPicks||[]).find(p=>String(p.season)==='2027'&&Number(p.round)===Number(round)&&String(p.roster_id??p.original_roster_id)===String(originalRosterId));
  const ownerRosterId=String(traded?.owner_id??originalRosterId),managerId=String(bundle?.ownerByRoster?.[ownerRosterId]||'');
  return state.managers.get(managerId)||[...state.managers.values()].find(m=>String(m.roster?.roster_id)===ownerRosterId)||null;
}
function mockDraftRows(){
  const slots=projected2027DraftSlots(),prospects=weeklyMockProspects(),rows=[];
  for(let round=1;round<=3;round++)for(const slot of slots){const overall=(round-1)*8+slot.slot,prospect=prospects[overall-1],owner=ownerManagerFor2027Pick(slot.originalRosterId,round);rows.push({round,slot:slot.slot,pick:`${round}.${String(slot.slot).padStart(2,'0')}`,overall,prospect,owner})}
  return rows;
}
function renderMockDraft(){
  const root=$("mockDraftContent");if(!root)return;const rows=mockDraftRows(),updated=new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'long',year:'numeric'}).format(new Date());
  root.innerHTML=`<header class="mock-draft-header"><div><span class="eyebrow">IMO DYNASTY DRAFT ROOM</span><h2 id="mockDraftTitle">2027 Rookie Mock Draft</h2><p>Projected order uses reverse championship odds and live Sleeper pick ownership.</p></div><div class="mock-draft-update"><span>Weekly board</span><strong>${esc(updated)}</strong></div></header><div class="mock-draft-round-nav"><button type="button" data-mock-round="1" class="active">Round 1</button><button type="button" data-mock-round="2">Round 2</button><button type="button" data-mock-round="3">Round 3</button></div><div class="mock-draft-board">${rows.map(row=>{const p=row.prospect,m=row.owner,avatar=m?.avatar?`<img src="${esc(m.avatar)}" alt="" loading="lazy">`:`<span>${esc(m?.initials||'—')}</span>`;return `<details class="mock-pick-card" data-mock-round-card="${row.round}" data-mock-overall="${row.overall}"><summary><div class="mock-pick-number">${row.pick}</div><div class="mock-owner">${avatar}<b>${esc(m?.name||'Unassigned')}</b></div><div class="mock-player-compact"><strong>${esc(p?.name||'TBD')}</strong><span>${esc(p?.position||'')}</span></div><span class="mock-expand-indicator" aria-hidden="true">+</span></summary><div class="mock-player-details"><div><span>School / Team</span><strong>${esc(p?.team||'—')}</strong></div><div><span>Height</span><strong>${esc(p?.height||'—')}</strong></div><div><span>Weight</span><strong>${esc(p?.weight||'—')}</strong></div><div><span>Age</span><strong>${esc(p?.age||'—')}</strong></div></div></details>`}).join('')}</div>`;
}
function openMockDraft(){renderMockDraft();const modal=$("mockDraftModal");modal?.classList.add('open');modal?.setAttribute('aria-hidden','false');document.body.classList.add('mock-draft-open')}
function openMockDraftToOverall(overall){
  openMockDraft();
  const targetOverall=Number(overall)||0,teamCount=Math.max(1,projected2027DraftSlots().length||8),round=Math.max(1,Math.ceil(targetOverall/teamCount));
  document.querySelectorAll('[data-mock-round]').forEach(button=>button.classList.toggle('active',Number(button.dataset.mockRound)===round));
  document.querySelectorAll('[data-mock-round-card]').forEach(card=>card.classList.toggle('round-focus',Number(card.dataset.mockRoundCard)===round));
  requestAnimationFrame(()=>{const card=document.querySelector(`[data-mock-overall="${targetOverall}"]`);if(!card)return;card.open=true;card.classList.add('rookie-target-highlight');card.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>card.classList.remove('rookie-target-highlight'),2600)});
}
function closeMockDraft(){const modal=$("mockDraftModal");modal?.classList.remove('open');modal?.setAttribute('aria-hidden','true');document.body.classList.remove('mock-draft-open')}

function safeRender(name,fn){try{fn()}catch(error){console.error(`Failed to render ${name}:`,error)}}
function yieldToBrowser(){return new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)))}
function powerMarketPill(){return $("powerRankings")?.closest(".panel")?.querySelector(".period-pill")||null}
function markPowerMarketState(mode){
  const target=$("powerRankings"),pill=powerMarketPill();if(!target)return;
  target.dataset.marketState=mode;
  target.classList.toggle("verified-market-preview",mode==="preview");
  if(pill)pill.textContent=mode==="live"?"Live estimate":mode==="preview"?"Last verified":"Verifying model";
}
function loadVerifiedMarketHTML(){
  if(state.verifiedMarketHTML)return state.verifiedMarketHTML;
  try{
    const cached=JSON.parse(localStorage.getItem(VERIFIED_MARKET_CACHE_KEY)||"null");
    if(cached?.html&&Date.now()-Number(cached.savedAt||0)<14*864e5){state.verifiedMarketHTML=String(cached.html);state.verifiedMarketSavedAt=Number(cached.savedAt)||0}
  }catch(_){ }
  return state.verifiedMarketHTML||""
}
function persistVerifiedMarketHTML(){
  const target=$("powerRankings");if(!target||!state.marketReady||!target.innerHTML)return;
  state.verifiedMarketHTML=target.innerHTML;state.verifiedMarketSavedAt=Date.now();
  try{localStorage.setItem(VERIFIED_MARKET_CACHE_KEY,JSON.stringify({savedAt:state.verifiedMarketSavedAt,html:state.verifiedMarketHTML}))}catch(_){ }
}
function verifiedMarketInputsReady(){
  if(!state.historyReady)return false;
  const current=currentLeagueBundle();if(!current)return false;
  const prior=previousCompletedBundle(current);if(!prior)return false;
  const priorSeason=String(prior?.league?.season||"");
  const exactCount=Object.keys(state.seasonTotalAverages?.[priorSeason]||{}).length;
  if(exactCount<20)return false;
  const rostered=safeArray(state.currentRosters).flatMap(r=>safeArray(r?.players)).map(String).filter(Boolean);
  if(!rostered.length)return false;
  const known=rostered.reduce((sum,id)=>sum+(state.players?.[id]?1:0),0);
  return known/rostered.length>=.9
}
function renderVerifiedMarketFallback(){
  const target=$("powerRankings");if(!target)return false;
  if(target.dataset.marketState==="live")return true;
  const cached=loadVerifiedMarketHTML();
  if(cached){target.classList.remove("loading");target.innerHTML=cached;markPowerMarketState("preview");return true}
  instantManagerShell();return false
}
function instantManagerShell(){
  const target=$("powerRankings");if(!target)return;
  if(loadVerifiedMarketHTML()){target.classList.remove("loading");target.innerHTML=state.verifiedMarketHTML;markPowerMarketState("preview");return}
  if(!state.managers.size){target.classList.add("loading");target.textContent="Verifying rankings and championship odds…";markPowerMarketState("loading");return}
  target.classList.remove("loading");markPowerMarketState("loading");
  target.innerHTML=`<div class="instant-manager-shell"><div class="instant-manager-note"><strong>Rankings are being verified.</strong><span>Profiles remain available while the complete odds model loads.</span></div>${[...state.managers.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(m=>{const avatar=m.avatar?`<img src="${esc(m.avatar)}" alt="" loading="lazy">`:`<span>${esc(m.initials||"GM")}</span>`;return `<button type="button" class="instant-manager-link manager-profile-link" data-manager-id="${esc(m.id)}"><span class="power-avatar">${avatar}</span><strong>${esc(m.name)}</strong><small>Open profile</small></button>`}).join("")}</div>`;
}
function lazyHomepageDefinitions(){return[
  ['leaderboard','leaderboard',renderLeaderboard],['tradeHeatmap','trade partners',renderHeatmap],['goodForm','player form',renderPlayerForm],['leagueRecords','league records',renderRecords],['tradeBlock','most traded players',renderBlock],['waiverBlock','most waived players',renderWaivedBlock],['biggestTrades','biggest trades',renderBiggestTrades],['allNbaChoices','voting',renderVoting]
]}
function setupLazyHomepageModules(){
  if(!('IntersectionObserver' in window)){lazyHomepageDefinitions().forEach(([id,name,fn])=>{const prior=state.lazyHomepageModules.get(id);state.lazyHomepageModules.set(id,{name,fn,rendered:true,node:$(id)});if(!prior?.rendered){if(name==='player form')ensureGameLogFeatures().then(()=>safeRender(name,fn));else safeRender(name,fn)}});return}
  if(!state.lazyHomepageObserver)state.lazyHomepageObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(!entry.isIntersecting)return;const key=entry.target.dataset.lazyHomepageKey,record=state.lazyHomepageModules.get(key);if(!record)return;record.rendered=true;if(record.name==='player form'){ensureGameLogFeatures().then(()=>safeRender(record.name,record.fn))}else safeRender(record.name,record.fn);state.lazyHomepageObserver.unobserve(entry.target)}),{rootMargin:'650px 0px'});
  lazyHomepageDefinitions().forEach(([id,name,fn])=>{const node=$(id),panel=node?.closest('.panel,article,section,details')||node;if(!node||!panel)return;const key=id;state.lazyHomepageModules.set(key,{name,fn,rendered:state.lazyHomepageModules.get(key)?.rendered||false,node:panel});panel.dataset.lazyHomepageKey=key;if(!state.lazyHomepageModules.get(key).rendered)state.lazyHomepageObserver.observe(panel)});
}
function rerenderVisibleLazyModules(){state.lazyHomepageModules.forEach(record=>{if(record.rendered)scheduleHubRender(record.name)})}

// V3.3.73: module-level render scheduler. Data refreshes mark only the modules
// whose inputs changed instead of rebuilding the whole homepage. Multiple data
// updates arriving in the same frame are deduplicated into one render pass.
const HUB_RENDERERS={
  'power rankings':renderPower,
  'trade of the week':renderTradeWeek,
  'recent trades':renderRecent,
  'head to head':renderHeadToHead,
  'ticker':renderTicker,
  'leaderboard':renderLeaderboard,
  'trade partners':renderHeatmap,
  'player form':renderPlayerForm,
  'league records':renderRecords,
  'most traded players':renderBlock,
  'most waived players':renderWaivedBlock,
  'biggest trades':renderBiggestTrades,
  'voting':renderVoting
};
const HUB_CHANGESETS={
  core:['power rankings','trade of the week','recent trades','head to head','ticker','leaderboard','trade partners','league records','most traded players','most waived players','biggest trades','voting'],
  current:['power rankings','trade of the week','recent trades','head to head','ticker','leaderboard','trade partners','league records','most traded players','most waived players','biggest trades','voting'],
  history:['power rankings','trade of the week','recent trades','head to head','ticker','leaderboard','trade partners','league records','most traded players','most waived players','biggest trades'],
  market:['power rankings','trade of the week','biggest trades'],
  trades:['trade of the week','recent trades','ticker','leaderboard','trade partners','league records','most traded players','biggest trades'],
  gameLogs:['player form']
};
function hubModuleIsVisible(name){
  const isLazy=lazyHomepageDefinitions().some(([,lazyName])=>lazyName===name);
  if(!isLazy)return true;
  const lazy=[...state.lazyHomepageModules.values()].find(record=>record.name===name);
  return Boolean(lazy?.rendered);
}
function flushHubRenderQueue(){
  state.renderQueueScheduled=false;
  if(!state.renderQueue.size)return;
  const names=[...state.renderQueue];state.renderQueue.clear();state.renderStats.flushes++;
  let index=0;
  const runFrame=()=>{
    const started=performance.now();
    while(index<names.length&&performance.now()-started<7){
      const name=names[index++],fn=HUB_RENDERERS[name];
      if(fn&&hubModuleIsVisible(name)){safeRender(name,fn);state.renderStats.modules++}
    }
    if(index<names.length)requestAnimationFrame(runFrame);
    else setupLazyHomepageModules();
  };
  requestAnimationFrame(runFrame);
}
function scheduleHubRender(...names){
  names.flat().filter(Boolean).forEach(name=>state.renderQueue.add(name));
  if(state.renderQueueScheduled)return;state.renderQueueScheduled=true;
  queueMicrotask(flushHubRenderQueue);
}
function renderForChange(change){ensureManagerGradeStyles();scheduleHubRender(HUB_CHANGESETS[change]||[])}
function renderAll(){ensureManagerGradeStyles();scheduleHubRender(HUB_CHANGESETS.core)}


function relevantPlayerIds(){
  const ids=new Set();
  state.bundles.forEach(bundle=>{
    (bundle.rosters||[]).forEach(r=>(r.players||[]).forEach(id=>ids.add(String(id))));
    (bundle.trades||[]).forEach(t=>{
      Object.keys(t.adds||{}).forEach(id=>ids.add(String(id)));
      Object.keys(t.drops||{}).forEach(id=>ids.add(String(id)));
    });
    Object.values(bundle.draftPickMap||{}).forEach(id=>ids.add(String(id)));
    (bundle.draftSelections||[]).forEach(p=>{if(p?.playerId)ids.add(String(p.playerId))});
  });
  return [...ids].filter(id=>id&&id!=="0");
}
function gameLogRows(payload){
  if(Array.isArray(payload))return payload;
  for(const key of ["data","games","stats","items","rows"]){
    if(Array.isArray(payload?.[key]))return payload[key];
  }
  if(payload&&typeof payload==="object"){
    const values=Object.values(payload);
    if(values.length&&values.every(v=>v&&typeof v==="object"))return values;
  }
  return [];
}
function parsedStatNumber(value){
  if(typeof value==='string'&&value.includes(':')){
    const parts=value.trim().split(':').map(Number);
    if(parts.length===2&&parts.every(Number.isFinite))return parts[0]+(parts[1]/60);
  }
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function statSources(row){
  return [row,row?.stats,row?.stat,row?.player_stats,row?.game_stats].filter(source=>source&&typeof source==='object');
}
function numericValue(row,keys){
  for(const source of statSources(row)){
    for(const key of keys){
      const n=parsedStatNumber(source?.[key]);
      if(n!==null)return n;
    }
  }
  return null;
}
function gameWasPlayed(row){
  const minutes=numericValue(row,["min","mins","minutes","minutes_played","mp","sp"]);
  if(minutes!==null)return minutes>0;
  const status=String(row?.status||row?.game_status||"").toLowerCase();
  return !(status.includes("dnp")||status.includes("inactive")||status.includes("did not play"));
}
function rawFantasyPoints(row,scoring){
  // Sleeper is the single source of truth for FPTS. The stats service returns
  // Sleeper's own fantasy-points result on each game row; use it unchanged so
  // averages match the Sleeper app rather than re-scoring box-score fields here.
  const direct=numericValue(row,["fantasy_points","fantasy_pts","fpts","fp","pts_fantasy"]);
  if(direct!==null)return direct;

  // Defensive fallback only for an incomplete API row. This is deliberately
  // secondary and is never allowed to override a Sleeper-provided FPTS value.
  let total=0,matched=false;
  Object.entries(scoring||{}).forEach(([key,multiplier])=>{
    if(key.startsWith("bonus_"))return;
    const stat=numericValue(row,[key]);
    const mult=Number(multiplier);
    if(stat!==null&&Number.isFinite(mult)){total+=stat*mult;matched=true}
  });
  const pts=numericValue(row,["pts","points"]);
  const reb=numericValue(row,["reb","rebounds"]);
  const ast=numericValue(row,["ast","assists"]);
  const stl=numericValue(row,["stl","steals"]);
  const blk=numericValue(row,["blk","blocks"]);
  const doubles=[pts,reb,ast,stl,blk].filter(v=>v!==null&&v>=10).length;
  if(Number(scoring?.bonus_double_double)&&doubles>=2)total+=Number(scoring.bonus_double_double);
  if(Number(scoring?.bonus_triple_double)&&doubles>=3)total+=Number(scoring.bonus_triple_double);
  return matched?total:null;
}
async function loadPlayerGameLogAverage(playerId,season,scoring){
  const url=`${CONFIG.statsApi}/${encodeURIComponent(playerId)}?season_type=regular&season=${encodeURIComponent(season)}&grouping=game`;
  const payload=await statsJSON(url);
  const rows=gameLogRows(payload);
  let points=0,games=0,totalMinutes=0;
  rows.forEach(row=>{
    if(!gameWasPlayed(row))return;
    const fpts=rawFantasyPoints(row,scoring);
    if(!Number.isFinite(fpts))return;
    const minutes=Math.max(0,sleeperBasketballMinutes(row,1).totalMinutes);
    points+=fpts;
    totalMinutes+=minutes;
    games+=1;
  });
  return games?{average:points/games,points,games,totalMinutes,averageMinutes:totalMinutes/games,rows}:null;
}
async function loadGameLogAverages(){
  const playerIds=relevantPlayerIds();
  const bySeason={},meta={},logsBySeason={};
  for(const bundle of state.bundles){
    const season=String(bundle.league.season);
    bySeason[season]={};
    meta[season]={};
    logsBySeason[season]={};
    const scoring=bundle.league.scoring_settings||{};
    const rows=await limitedMap(playerIds,8,async id=>{
      const result=await loadPlayerGameLogAverage(id,season,scoring);
      return result?{id,...result}:null;
    });
    rows.filter(Boolean).forEach(row=>{
      bySeason[season][row.id]=row.average;
      meta[season][row.id]={gamesPlayed:row.games,totalFantasyPoints:row.points,average:row.average};
      logsBySeason[season][row.id]=row.rows||[];
    });
  }
  state.gameLogAverages=bySeason;
  state.gameLogMeta=meta;
  state.gameLogs=logsBySeason;
}


function parseMinutesValue(value){
  if(value===null||value===undefined||value==='')return 0;
  if(typeof value==='number')return Number.isFinite(value)?value:0;
  const text=String(value).trim();
  const clock=text.match(/^(\d{1,3}):(\d{1,2})$/);
  if(clock)return Number(clock[1])+(Number(clock[2])/60);
  const parsed=Number(text.replace(/[^0-9.\-]/g,''));
  return Number.isFinite(parsed)?parsed:0;
}
function statNumber(stats,keys){
  if(!stats||typeof stats!=='object')return 0;
  for(const key of keys){
    const direct=stats[key];
    const parsed=parseMinutesValue(direct);
    if(parsed>0)return parsed;
    if(stats.stats&&typeof stats.stats==='object'){
      const nested=parseMinutesValue(stats.stats[key]);
      if(nested>0)return nested;
    }
  }
  const value=numericValue(stats,keys);
  return value===null?0:value;
}
function sleeperBasketballMinutes(stats,gamesPlayed=0){
  const games=Math.max(0,Number(gamesPlayed||0));
  const rawMinutes=statNumber(stats,['min','mins','minutes','minutes_played','mp','total_minutes','average_minutes','avg_minutes','minutes_per_game']);
  if(rawMinutes>0){
    const minutesArePerGame=rawMinutes<=60;
    const totalMinutes=minutesArePerGame&&games>0?rawMinutes*games:rawMinutes;
    const averageMinutes=minutesArePerGame?rawMinutes:(games>0?totalMinutes/games:0);
    return {totalMinutes,averageMinutes,source:'sleeper-minutes'};
  }
  // Sleeper NBA aggregate and game responses expose playing time as `sp`
  // (seconds played). Convert seconds to minutes before deriving MPG.
  const secondsPlayed=statNumber(stats,['sp','seconds_played','seconds']);
  if(secondsPlayed>0){
    const totalMinutes=secondsPlayed/60;
    const averageMinutes=games>0?totalMinutes/games:totalMinutes;
    return {totalMinutes,averageMinutes,source:'sleeper-sp'};
  }
  return {totalMinutes:0,averageMinutes:0,source:'sleeper-no-minutes'};
}
function seasonStatsObject(payload){
  if(!payload)return null;
  if(payload.stats&&typeof payload.stats==="object")return payload.stats;
  if(Array.isArray(payload)){
    const row=payload.find(x=>x?.stats&&typeof x.stats==="object")||payload[0];
    return row?.stats||row||null;
  }
  return typeof payload==="object"?payload:null;
}
function scoreSeasonStats(stats,scoring){
  let total=0,matched=0;
  const aliases={
    pts:["pts"],reb:["reb"],ast:["ast"],stl:["stl"],blk:["blk"],to:["to","turnovers"],
    fgm:["fgm"],fga:["fga"],fgmi:["fgmi"],ftm:["ftm"],fta:["fta"],ftmi:["ftmi"],
    tpm:["tpm"],tpa:["tpa"],tpmi:["tpmi"],oreb:["oreb"],dreb:["dreb"],
    pf:["pf"],tf:["tf"],ff:["ff"],dd:["dd"],td:["td"],
    bonus_double_double:["bonus_double_double","dd"],
    bonus_triple_double:["bonus_triple_double","td"],
    bonus_pt_15p:["bonus_pt_15p"],bonus_pt_20p:["bonus_pt_20p"],bonus_pt_25p:["bonus_pt_25p"],
    bonus_pt_30p:["bonus_pt_30p"],bonus_pt_35p:["bonus_pt_35p"],bonus_pt_40p:["bonus_pt_40p"],
    bonus_pt_45p:["bonus_pt_45p"],bonus_pt_50p:["bonus_pt_50p"],
    bonus_ast_10p:["bonus_ast_10p"],bonus_ast_15p:["bonus_ast_15p"],bonus_ast_20p:["bonus_ast_20p"],
    bonus_reb_10p:["bonus_reb_10p"],bonus_reb_15p:["bonus_reb_15p"],bonus_reb_20p:["bonus_reb_20p"],
    bonus_stl_5p:["bonus_stl_5p"],bonus_blk_5p:["bonus_blk_5p"],
    bonus_3pm_5p:["bonus_3pm_5p"],bonus_3pm_10p:["bonus_3pm_10p"],
    plus_minus:["plus_minus"],pts_reb_ast:["pts_reb_ast"],reb_ast:["reb_ast"],blk_stl:["blk_stl"]
  };
  Object.entries(scoring||{}).forEach(([key,multiplier])=>{
    const mult=Number(multiplier);
    if(!Number.isFinite(mult)||mult===0)return;
    const keys=aliases[key]||[key];
    let found=false,value=0;
    for(const statKey of keys){
      const n=Number(stats?.[statKey]);
      if(Number.isFinite(n)){value=n;found=true;break}
    }
    if(!found)return;
    total+=value*mult;
    matched+=1;
  });
  return matched?total:null;
}
async function loadPlayerSeasonAverage(playerId,season,scoring){
  // Prefer Sleeper's aggregate season response, but only treat it as complete
  // for FPTS/36 when it also contains usable minutes. Otherwise resolve the
  // same season from game logs so profiles never remain blank in the offseason.
  const url=`${CONFIG.statsApi}/${encodeURIComponent(playerId)}?season_type=regular&season=${encodeURIComponent(season)}`;
  const payload=await statsJSON(url);
  const stats=seasonStatsObject(payload);
  const gamesPlayed=Number(stats?.gp);
  const totalFantasyPoints=scoreSeasonStats(stats,scoring);
  const minuteData=sleeperBasketballMinutes(stats,gamesPlayed);
  const totalMinutes=minuteData.totalMinutes;
  const averageMinutes=minuteData.averageMinutes;
  if(Number.isFinite(gamesPlayed)&&gamesPlayed>0&&Number.isFinite(totalFantasyPoints)&&averageMinutes>0){
    return {average:totalFantasyPoints/gamesPlayed,totalFantasyPoints,gamesPlayed,totalMinutes,averageMinutes,source:"league-season-stats"};
  }
  const fallback=await loadPlayerGameLogAverage(playerId,season,scoring);
  if(fallback)return {average:fallback.average,totalFantasyPoints:fallback.points,gamesPlayed:fallback.games,totalMinutes:fallback.totalMinutes,averageMinutes:fallback.averageMinutes,rows:fallback.rows,source:"game-log-fallback"};
  // Preserve an aggregate FPTS result even if minutes are unavailable. It can
  // still populate FPTS/G while FPTS/36 remains safely ineligible.
  if(Number.isFinite(gamesPlayed)&&gamesPlayed>0&&Number.isFinite(totalFantasyPoints))return {average:totalFantasyPoints/gamesPlayed,totalFantasyPoints,gamesPlayed,totalMinutes:0,averageMinutes:0,source:"league-season-stats-no-minutes"};
  return null;
}
function seasonBundleForStats(season){return state.bundles.find(bundle=>String(bundle?.league?.season||'')===String(season))||null}
function hasUsableEfficiencyMetric(playerId,season){const metric=playerFptsPer36(String(playerId),String(season));return metric.average>0&&metric.mpg>0}
async function hydratePlayerSeasonMetrics(playerIds,season){
  const seasonKey=String(season),bundle=seasonBundleForStats(seasonKey),scoring=bundle?.league?.scoring_settings||{},ids=[...new Set(safeArray(playerIds).map(String).filter(Boolean))];
  state.seasonTotalAverages[seasonKey]??={};state.seasonTotalMeta[seasonKey]??={};state.gameLogs[seasonKey]??={};
  const missing=ids.filter(id=>!hasUsableEfficiencyMetric(id,seasonKey));
  if(!missing.length)return;
  const results=await limitedMap(missing,6,async id=>{const result=await loadPlayerSeasonAverage(id,seasonKey,scoring);return result?{id,result}:null});
  results.filter(Boolean).forEach(({id,result})=>{
    state.seasonTotalAverages[seasonKey][id]=Number(result.average||0);
    state.seasonTotalMeta[seasonKey][id]={gamesPlayed:Number(result.gamesPlayed||0),totalFantasyPoints:Number(result.totalFantasyPoints||0),average:Number(result.average||0),totalMinutes:Number(result.totalMinutes||0),averageMinutes:Number(result.averageMinutes||0),source:result.source||'player-season-hydration'};
    if(Array.isArray(result.rows))state.gameLogs[seasonKey][id]=result.rows;
  });
  state.computedCache.seasonAverages.delete(seasonKey);
}
async function ensurePlayerEfficiencyData(playerIds,requestedSeason='2026'){
  const requested=String(requestedSeason||'2026'),ids=[...new Set(safeArray(playerIds).map(String).filter(Boolean))];
  await hydratePlayerSeasonMetrics(ids,requested);
  const unresolved=ids.filter(id=>!hasUsableEfficiencyMetric(id,requested));
  if(requested!=='2025'&&unresolved.length)await hydratePlayerSeasonMetrics(unresolved,'2025');
}
async function loadBulkSeasonPayload(season){
  const positions=['PG','SG','SF','PF','C','G','F'];
  const query=new URLSearchParams({season_type:'regular',order_by:'pts_std'});
  positions.forEach(position=>query.append('position[]',position));
  const url=`${CONFIG.bulkStatsApi}/${encodeURIComponent(season)}?${query.toString()}`;
  return await statsJSON(url);
}
function bulkSeasonRows(payload){
  if(Array.isArray(payload))return payload;
  if(Array.isArray(payload?.data))return payload.data;
  if(Array.isArray(payload?.players))return payload.players;
  if(Array.isArray(payload?.stats))return payload.stats;
  if(payload&&typeof payload==='object'){
    return Object.entries(payload).map(([key,value])=>{
      if(value&&typeof value==='object')return {...value,player_id:value.player_id??value.playerId??key};
      return null;
    }).filter(Boolean);
  }
  return [];
}
function bulkRowPlayerId(row){
  return String(row?.player_id??row?.playerId??row?.id??row?.metadata?.player_id??'');
}
function bulkRowStats(row){
  if(row?.stats&&typeof row.stats==='object')return row.stats;
  if(row?.stat&&typeof row.stat==='object')return row.stat;
  return row||{};
}
async function loadSeasonTotalAverages(requestedSeasons=null){
  const rostered=new Set(relevantPlayerIds().map(String));
  const requested=requestedSeasons==null?null:new Set(safeArray(requestedSeasons).map(String));
  const bySeason={...(state.seasonTotalAverages||{})},meta={...(state.seasonTotalMeta||{})};
  const bundles=state.bundles.filter(bundle=>!requested||requested.has(String(bundle?.league?.season||"")));
  const seasonJobs=bundles.map(async bundle=>{
    const season=String(bundle.league.season),scoring=bundle.league.scoring_settings||{};
    const payload=await loadBulkSeasonPayload(season);
    const rows=bulkSeasonRows(payload);
    const averages={},seasonMeta={};
    for(const row of rows){
      const id=bulkRowPlayerId(row);
      if(!id||!rostered.has(id))continue;
      const stats=bulkRowStats(row),gamesPlayed=Number(stats?.gp),totalFantasyPoints=scoreSeasonStats(stats,scoring);
      if(!Number.isFinite(gamesPlayed)||gamesPlayed<=0||!Number.isFinite(totalFantasyPoints))continue;
      const average=totalFantasyPoints/gamesPlayed;
      averages[id]=average;
      // Sleeper bulk basketball data may expose minutes either as a per-game
      // average (normally <= 60) or as a season total. Normalise both shapes so
      // FPTS/36 eligibility is not incorrectly rejected for every player.
      const minuteData=sleeperBasketballMinutes(stats,gamesPlayed);
      const averageMinutes=minuteData.averageMinutes;
      const totalMinutes=minuteData.totalMinutes;
      seasonMeta[id]={gamesPlayed,totalFantasyPoints,average,totalMinutes,averageMinutes,source:`sleeper-bulk-season+${minuteData.source}`};
    }
    console.info(`[IMO Dynasty] ${season} bulk averages loaded: ${Object.keys(averages).length}`);
    if(season==='2025'){
      const kp=seasonMeta['2009'];
      console.info('[IMO Dynasty] Kevin Porter Jr 2025:',kp||'not found in bulk response');
    }
    return {season,averages,seasonMeta,rowCount:rows.length};
  });
  const results=await Promise.all(seasonJobs);
  results.forEach(({season,averages,seasonMeta})=>{bySeason[season]=averages;meta[season]=seasonMeta});
  state.seasonTotalAverages=bySeason;
  state.seasonTotalMeta=meta;
  return results;
}

async function loadCoreSeason(id){
  const [league,users,rosters]=await Promise.all([
    getJSON(`${CONFIG.api}/league/${id}`,true),
    getJSON(`${CONFIG.api}/league/${id}/users`,true),
    getJSON(`${CONFIG.api}/league/${id}/rosters`,true)
  ]);
  if(!league||!users||!rosters)return null;
  const userById=Object.fromEntries(users.map(u=>[String(u.user_id),u]));
  const ownerByRoster={},managerNameMap={};
  rosters.forEach(r=>{if(r.owner_id!=null){ownerByRoster[String(r.roster_id)]=String(r.owner_id);const u=userById[String(r.owner_id)]||{};managerNameMap[String(r.owner_id)]=u.metadata?.team_name||u.display_name||`Team ${r.roster_id}`}});
  return {league,users,rosters,trades:[],matchups:[],draftPickMap:{},draftSelections:[],allDraftSelections:[],ownerByRoster,managerNameMap,tradedPicks:[],winnersBracket:[]};
}

async function loadSeason(id){
  const [league,users,rosters,drafts,tradedPicks,winnersBracket]=await Promise.all([
    getJSON(`${CONFIG.api}/league/${id}`,true),getJSON(`${CONFIG.api}/league/${id}/users`,true),
    getJSON(`${CONFIG.api}/league/${id}/rosters`,true),getJSON(`${CONFIG.api}/league/${id}/drafts`,true),
    getJSON(`${CONFIG.api}/league/${id}/traded_picks`,true),getJSON(`${CONFIG.api}/league/${id}/winners_bracket`,true)
  ]);
  if(!league||!users||!rosters)return null;

  // Resolve each roster to its franchise name before building the draft map.
  // For seasons with a verified board, the manager column determines the
  // original pick slot regardless of who ultimately made the selection.
  const earlyUserById=Object.fromEntries(users.map(u=>[String(u.user_id),u]));
  const rosterNameById={};
  rosters.forEach(r=>{
    const u=earlyUserById[String(r.owner_id)]||{};
    rosterNameById[String(r.roster_id)]=u.metadata?.team_name||u.display_name||`Team ${r.roster_id}`;
  });

  const draftResults=await Promise.all((drafts||[]).map(async draft=>({
    draft,picks:(await getJSON(`${CONFIG.api}/draft/${draft.draft_id}/picks`,true))||[]
  })));
  // Preserve every completed draft selection for player-origin labels and
  // return-tree lineage. Rookie-only grading continues to use draftSelections.
  const allDraftSelections=[];
  draftResults.forEach(({draft,picks})=>{
    const draftName=String(draft?.metadata?.name||draft?.name||'').toLowerCase();
    const configuredRounds=Number(draft?.settings?.rounds)||0;
    const observedRounds=Math.max(0,...picks.map(p=>Number(p.round)||0));
    const isRookieDraft=draftName.includes('rookie')||((configuredRounds||observedRounds)>0&&(configuredRounds||observedRounds)<=5);
    const season=String(draft?.season||league.season);
    const teamCount=Number(draft?.settings?.teams)||Number(league?.total_rosters)||rosters.length||8;
    picks.forEach(p=>{
      if(p.player_id==null||p.round==null)return;
      const round=Number(p.round),pickNo=Number(p.pick_no);
      const overallPick=Number.isFinite(pickNo)&&pickNo>0?pickNo:(round-1)*teamCount+Number(p.draft_slot||0);
      const slot=Number.isFinite(pickNo)&&pickNo>0?((pickNo-1)%teamCount)+1:Number(p.draft_slot||0);
      allDraftSelections.push({
        season,draftId:String(draft?.draft_id||''),playerId:String(p.player_id),pickedBy:p.picked_by!=null?String(p.picked_by):'',
        overallPick,pickNo:Number.isFinite(pickNo)&&pickNo>0?pickNo:overallPick,round,draftSlot:slot||null,teamCount,
        isRookieDraft,draftKind:isRookieDraft?'rookie':'startup',created:Number(draft?.created||draft?.start_time||0)
      });
    });
  });
  // Prefer true rookie drafts (short drafts or explicitly named rookie drafts).
  // This prevents a startup/supplemental draft in the same league from
  // overwriting the rookie-slot attribution.
  const rookieDrafts=draftResults.filter(({draft,picks})=>{
    const name=String(draft?.metadata?.name||draft?.name||'').toLowerCase();
    const configuredRounds=Number(draft?.settings?.rounds)||0;
    const observedRounds=Math.max(0,...picks.map(p=>Number(p.round)||0));
    return name.includes('rookie')||((configuredRounds||observedRounds)>0&&(configuredRounds||observedRounds)<=5);
  });
  const relevantDrafts=rookieDrafts.length?rookieDrafts:draftResults;
  const draftPickMap={},draftSelections=[];
  relevantDrafts.forEach(({draft,picks})=>{
    const draftName=String(draft?.metadata?.name||draft?.name||'').toLowerCase();
    const configuredRounds=Number(draft?.settings?.rounds)||0;
    const observedRounds=Math.max(0,...picks.map(p=>Number(p.round)||0));
    const isRookieDraft=draftName.includes('rookie')||((configuredRounds||observedRounds)>0&&(configuredRounds||observedRounds)<=5);
    const season=String(draft?.season||league.season);
    const teamCount=Number(draft?.settings?.teams)||Number(league?.total_rosters)||rosters.length||8;
    const draftType=String(draft?.type||draft?.settings?.type||'linear').toLowerCase();
    // Sleeper draft payloads are not consistent across seasons. Newer drafts
    // may expose slot_to_roster_id, while older drafts (including 2025) often
    // expose draft_order as user_id -> slot. Build one canonical slot ->
    // ORIGINAL roster_id map so historical traded picks resolve to the player
    // selected with that exact franchise pick.
    const slotToRoster={...(draft?.slot_to_roster_id||draft?.metadata?.slot_to_roster_id||{})};
    const rosterByOwner=Object.fromEntries(rosters.filter(r=>r.owner_id!=null).map(r=>[String(r.owner_id),String(r.roster_id)]));
    Object.entries(draft?.draft_order||draft?.metadata?.draft_order||{}).forEach(([userId,slot])=>{
      const rosterId=rosterByOwner[String(userId)];
      if(rosterId!=null&&slot!=null)slotToRoster[String(slot)]=String(rosterId);
    });
    picks.forEach(p=>{
      if(p.player_id==null||p.round==null)return;
      const round=Number(p.round);
      const pickNo=Number(p.pick_no);
      const overallPick=Number.isFinite(pickNo)&&pickNo>0?pickNo:(round-1)*teamCount+Number(p.draft_slot||0);
      // Draft grading permanently credits the Sleeper user who actually made
      // the selection. Never infer this from roster ownership, pick origin or
      // the player's current team.
      if(p.picked_by!=null&&Number.isFinite(overallPick)&&overallPick>0){
        draftSelections.push({
          season,
          draftId:String(draft?.draft_id||''),
          playerId:String(p.player_id),
          pickedBy:String(p.picked_by),
          overallPick,
          pickNo:Number.isFinite(pickNo)&&pickNo>0?pickNo:overallPick,
          round,
          draftSlot:Number(p.draft_slot)||null,
          teamCount,
          isRookieDraft
        });
      }
      let originalSlot=null;

      // Work out the slot at which the selection was made. The pick payload's
      // draft_slot can describe the drafter after trades, so pick_no is the
      // safest source for the actual position in the round.
      if(Number.isFinite(pickNo)&&pickNo>0&&teamCount>0){
        const positionInRound=((pickNo-1)%teamCount)+1;
        originalSlot=(draftType==='snake'&&round%2===0)
          ? teamCount-positionInRound+1
          : positionInRound;
      }else if(p.draft_slot!=null){
        originalSlot=Number(p.draft_slot);
      }

      if(!Number.isFinite(originalSlot)||originalSlot<1)return;

      // Historical trade assets identify a pick by its ORIGINAL roster_id,
      // not by the numerical draft slot. Convert the final slot back to the
      // franchise whose pick created that slot before storing the player.
      // This keeps traded selections correct everywhere the shared trade
      // formatter is used (Trade Centre, manager Recent Trades and Biggest
      // Ever Trades).
      let originalRosterId=null;

      // Verified completed-draft board: the column is the original franchise
      // pick. Find the roster whose team name owns this column. This is what
      // makes, for example, Chetanyahu R1 -> 1.03 -> AJ Dybantsa and Thanos
      // R1 -> 1.08 -> Mikel Brown, even when another team made the selection.
      if(CANONICAL_DRAFT_COLUMNS[season]){
        originalRosterId=Object.keys(rosterNameById).find(rid=>
          Number(canonicalDraftSlot(season,rosterNameById[rid]))===Number(originalSlot)
        )||null;
      }

      // Generic fallback for other completed rookie drafts, including 2025.
      if(originalRosterId==null){
        originalRosterId=slotToRoster[String(originalSlot)]??slotToRoster[originalSlot]??null;
      }

      if(originalRosterId!=null){
        draftPickMap[`${season}|${String(originalRosterId)}|${String(round)}`]=String(p.player_id);
      }else{
        // Final fallback for older payloads that expose only a numerical slot.
        draftPickMap[`${season}|${String(originalSlot)}|${String(round)}`]=String(p.player_id);
      }
    });
  });

  const ownerByRoster={},userById=Object.fromEntries(users.map(u=>[String(u.user_id),u])),managerNameMap={};
  rosters.forEach(r=>{if(r.owner_id!=null){ownerByRoster[String(r.roster_id)]=String(r.owner_id);const u=userById[String(r.owner_id)]||{};managerNameMap[String(r.owner_id)]=u.metadata?.team_name||u.display_name||`Team ${r.roster_id}`}});
  const playoffStart=Number(league?.settings?.playoff_week_start)||19;
  const currentSeason=String(id)===String(CONFIG.currentLeagueId),liveWeek=Math.max(0,Number(state.sportState?.week)||0),sportSeason=String(state.sportState?.season||''),leagueSeason=String(league?.season||''),currentSeasonStarted=currentSeason&&sportSeason===leagueSeason;
  // Current offseason data normally lives in weeks 1-2. Historical seasons are
  // still complete, but use a restrained request pool instead of 60 simultaneous
  // mobile connections across three leagues.
  const seasonWeekCap=currentSeason?(currentSeasonStarted?Math.min(CONFIG.roundsToCheck,Math.max(2,Math.min(playoffStart+4,liveWeek+2))):2):Math.min(CONFIG.roundsToCheck,Math.max(22,playoffStart+4));
  const rounds=Array.from({length:seasonWeekCap},(_,i)=>i+1),weeks=await limitedMap(rounds,currentSeason?4:5,async wk=>{
    const [tx,match]=await Promise.all([getJSON(`${CONFIG.api}/league/${id}/transactions/${wk}`,true),getJSON(`${CONFIG.api}/league/${id}/matchups/${wk}`,true)]);
    const completedTransactions=(tx||[]).filter(t=>!t.status||t.status==='complete');
    const trades=completedTransactions.filter(t=>t.type==='trade').map(t=>{
      const participantRosters=new Set((t.roster_ids||[]).map(String));
      if(!participantRosters.size){Object.values(t.adds||{}).forEach(x=>participantRosters.add(String(x)));Object.values(t.drops||{}).forEach(x=>participantRosters.add(String(x)));safeArray(t?.draft_picks).forEach(p=>{if(!p||typeof p!=='object')return;if(p.owner_id!=null)participantRosters.add(String(p.owner_id));if(p.previous_owner_id!=null)participantRosters.add(String(p.previous_owner_id))})}
      return {...t,manager_ids:[...participantRosters].map(r=>ownerByRoster[r]).filter(Boolean),roster_owner_map:ownerByRoster,manager_name_map:managerNameMap,season_label:`${league.season} season`,league_id:id}
    });
    return{trades,transactions:completedTransactions.map(t=>({...t,week:wk,league_id:id,season_label:`${league.season} season`,roster_owner_map:ownerByRoster,manager_name_map:managerNameMap})),matchups:(match||[]).map(x=>({...x,week:wk}))}
  });
  return{league,users,rosters,ownerByRoster,draftPickMap,draftSelections,allDraftSelections,tradedPicks:tradedPicks||[],winnersBracket:winnersBracket||[],trades:weeks.flatMap(x=>x?.trades||[]),transactions:weeks.flatMap(x=>x?.transactions||[]),matchups:weeks.flatMap(x=>x?.matchups||[])}
}

function normalizeGlobalSearch(value){return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
function globalSearchScore(haystack,query){
  const h=normalizeGlobalSearch(haystack),q=normalizeGlobalSearch(query);if(!q||!h)return 0;if(h===q)return 120;if(h.startsWith(q))return 100;if(h.includes(q))return 75;
  const tokens=q.split(/\s+/).filter(Boolean);if(!tokens.length)return 0;let score=0;for(const token of tokens){if(!h.includes(token))return 0;score+=h.startsWith(token)?18:10}return score
}
function globalTradeKey(trade){return String(trade?.transaction_id||`${trade?.league_id||'league'}-${trade?.created||0}`)}
function globalTradeLabel(trade){try{const managers=mids(trade).map(id=>managerName(id,trade)),assets=renderableTradeAssets(trade),names=Object.values(assets||{}).flat().slice(0,5).map(x=>x?.name).filter(Boolean);return `${managers.join(' ↔ ')||'League trade'}${names.length?` · ${names.join(', ')}`:''}`}catch(_){return 'League trade'}}
function buildGlobalSearchIndex(){
  if(state.globalSearchIndex)return state.globalSearchIndex;
  const items=[];
  Object.keys(state.players||{}).forEach(id=>{const name=playerName(id);if(!name||/^Player \d+$/.test(name))return;const p=state.players[id]||{},current=playerCurrentAverage(id),identity=[p.team,p.position].filter(Boolean).join(' · ')||'Player profile',stats=current.avg>0?` · ${current.avg.toFixed(2)} FPTS/G`:'';items.push({type:'Player',title:name,subtitle:`${identity}${stats}`,search:`${name} ${p.team||''} ${p.position||''} ${current.avg.toFixed(2)} FPTS`,action:'player',id:String(id)})});
  [...state.managers.values()].forEach(m=>items.push({type:'Manager',title:m.name,subtitle:'Manager profile',search:`${m.name} ${m.displayName||''} manager team`,action:'manager',id:String(m.id)}));
  const seenPicks=new Set();
  for(const manager of state.managers.values())for(const pick of managerCurrentDraftPicks(manager.id)){if(seenPicks.has(pick.key))continue;seenPicks.add(pick.key);items.push({type:'Future Pick',title:pick.label,subtitle:`Currently held by ${manager.name}`,search:`${pick.season} ${pick.originalName} ${manager.name} round ${pick.round} first second third fourth future pick`,action:'pick',id:pick.key})}
  Object.entries(state.draftPickMap||{}).forEach(([key,playerId])=>{if(!playerId)return;const data=pickHistoryData(key),player=playerName(String(playerId));items.push({type:'Completed Pick',title:`${data.season} Round ${data.round} Pick (${data.originalOwner}'s pick)`,subtitle:`Selected ${player}`,search:`${data.season} ${data.originalOwner} ${data.currentOwner} round ${data.round} completed rookie pick ${player}`,action:'pick',id:key})});
  state.trades.forEach(trade=>{const label=globalTradeLabel(trade),date=fmt(trade.created);items.push({type:'Trade',title:label,subtitle:`${date} · ${trade.season_label||'League trade'}`,search:`${label} ${date} ${trade.season_label||''}`,action:'trade',id:globalTradeKey(trade)})});
  state.globalSearchIndex=items;
  return items
}
function globalSearchResults(query){const q=normalizeGlobalSearch(query);if(!q)return[];return buildGlobalSearchIndex().map(item=>({...item,score:globalSearchScore(item.search,q)+(normalizeGlobalSearch(item.title).startsWith(q)?25:0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title)).slice(0,24)}
function globalSearchResultHTML(item){const icon={Player:'◉',Manager:'◆','Future Pick':'◇','Completed Pick':'✓',Trade:'⇄'}[item.type]||'•';return `<button type="button" class="global-search-result" data-global-search-action="${esc(item.action)}" data-global-search-id="${esc(item.id)}"><span class="global-search-result-icon">${icon}</span><span class="global-search-result-copy"><strong>${esc(item.title)}</strong><small>${esc(item.subtitle)}</small></span><em class="global-search-type type-${esc(item.type.toLowerCase().replace(/\s+/g,'-'))}">${esc(item.type)}</em></button>`}
function renderGlobalSearchResults(query){const target=$("globalSearchResults");if(!target)return;const results=globalSearchResults(query);target.innerHTML=query.trim()?(results.length?results.map(globalSearchResultHTML).join(''):'<div class="global-search-empty"><strong>No exact entity found.</strong><small>Try a player surname, manager name, year, or pick owner.</small></div>'):'<div class="global-search-empty"><strong>Search the entire IMO Hub.</strong><small>Players, managers, future picks, completed rookie picks and trades.</small></div>'}
async function ensureFullPlayerDirectory(){
  if(state.fullPlayerDirectoryLoaded&&Object.keys(state.players||{}).length)return state.players;
  if(state.fullPlayerDirectoryPromise)return state.fullPlayerDirectoryPromise;
  state.fullPlayerDirectoryPromise=getJSON(`${CONFIG.api}/players/nba`,true).then(players=>{
    if(players&&typeof players==='object'){
      state.players={...state.players,...players};state.fullPlayerDirectoryLoaded=true;state.globalSearchIndex=null;
      scheduleHubCacheWrite();
      refreshResolvedPlayerNames();
      // Refresh only the small modules where a player name can be plain text;
      // avoid a full Hub rerender when the directory resolves.
      safeRender('ticker player names',renderTicker);
      const modal=$('managerProfileModal');if(modal?.classList.contains('open')&&modal.dataset.managerId)clearManagerProfileCachedHTML(modal.dataset.managerId);
    }
    return state.players;
  }).finally(()=>{state.fullPlayerDirectoryPromise=null});
  return state.fullPlayerDirectoryPromise
}
function ensureGameLogFeatures(){
  if(state.gameLogFeaturesPromise)return state.gameLogFeaturesPromise;
  const season=String(tradeTargetAverageContext().season||state.modelBundle?.league?.season||'2025');
  if(Object.keys(state.gameLogs?.[season]||{}).length){renderForChange('gameLogs');return Promise.resolve()}
  state.gameLogFeaturesPromise=loadTickerGameLogs().catch(error=>console.warn('Deferred game-log features unavailable:',error)).finally(()=>{state.gameLogFeaturesPromise=null});
  return state.gameLogFeaturesPromise
}
async function ensureManagerRosterGameLogs(managerId){
  const id=String(managerId||''),season=String(tradeTargetAverageContext().season||state.modelBundle?.league?.season||'2025'),rosterIds=safeArray(state.managers.get(id)?.roster?.players).map(String),scoring=seasonBundleForStats(season)?.league?.scoring_settings||state.modelBundle?.league?.scoring_settings||{};
  if(!rosterIds.length)return;
  state.gameLogs[season]??={};
  const missing=rosterIds.filter(pid=>!Array.isArray(state.gameLogs[season]?.[pid])||!state.gameLogs[season][pid].length);
  if(!missing.length)return;
  const rows=await limitedMap(missing,5,async pid=>{const result=await loadPlayerGameLogAverage(pid,season,scoring);return result?{id:pid,...result}:null});
  rows.filter(Boolean).forEach(row=>state.gameLogs[season][row.id]=row.rows||[]);
}
async function openGlobalSearch(){const modal=$("globalSearchModal"),input=$("globalSearchInput");if(!modal)return;modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.classList.add('global-search-open');const target=$("globalSearchResults");if(target&&!state.fullPlayerDirectoryLoaded)target.innerHTML='<div class="global-search-empty"><strong>Loading player directory…</strong><small>League data remains available while the full search index loads.</small></div>';requestAnimationFrame(()=>input?.focus({preventScroll:true}));await ensureFullPlayerDirectory();renderGlobalSearchResults(input?.value||'')}
function closeGlobalSearch(){const modal=$("globalSearchModal");if(!modal)return;modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.classList.remove('global-search-open')}
function openGlobalTradeResult(key){const trade=state.trades.find(t=>globalTradeKey(t)===String(key)),target=$("globalSearchResults");if(!trade||!target)return;target.innerHTML=`<div class="global-search-trade-view"><button type="button" class="global-search-back" data-global-search-back>← Back to results</button><span class="global-search-type type-trade">Trade</span><h3>${esc(globalTradeLabel(trade))}</h3><p>${esc(fmt(trade.created))} · ${esc(trade.season_label||'League trade')}</p><div class="trade-detail-body">${tradeDetailsHTML(trade)}</div></div>`}
function launchGlobalSearchEntity(action,id){if(action==='trade'){openGlobalTradeResult(id);return}closeGlobalSearch();if(action==='player')openPlayerHistory(id);else if(action==='manager')openManagerProfile(id);else if(action==='pick')openPickHistory(id)}

function priorityHistoricalLeagueIds(){return CONFIG.leagueIds.filter(id=>String(id)!==String(CONFIG.currentLeagueId)).slice(0,1)}
function olderHistoricalLeagueIds(){return CONFIG.leagueIds.filter(id=>String(id)!==String(CONFIG.currentLeagueId)).slice(1)}
function ensureOlderHistoryLoaded(){
  if(state.historyReady)return Promise.resolve(true);
  if(state.olderHistoryPromise)return state.olderHistoryPromise;
  const olderIds=olderHistoricalLeagueIds();if(!olderIds.length){state.historyReady=true;return Promise.resolve(true)}
  state.olderHistoryPromise=(async()=>{const additions=[];for(const leagueId of olderIds){const existing=state.bundles.find(b=>String(b?.league?.league_id)===String(leagueId));if(existing&&state.snapshotApplied){additions.push(existing);continue}const bundle=await loadSeason(leagueId);if(bundle)additions.push(bundle);await yieldToBrowser()}const byId=new Map(state.bundles.map(b=>[String(b?.league?.league_id),b]));additions.forEach(b=>byId.set(String(b?.league?.league_id),b));state.bundles=[...byId.values()].sort((a,b)=>Number(b?.league?.season||0)-Number(a?.league?.season||0));state.historyReady=true;rebuildStateFromBundles();renderForChange('history');scheduleHubCacheWrite();return true})().finally(()=>{state.olderHistoryPromise=null});
  return state.olderHistoryPromise
}
function scheduleOlderHistoryLoad(){if(state.historyReady)return;const run=()=>ensureOlderHistoryLoaded().catch(error=>console.warn('Deferred older history unavailable:',error));if('requestIdleCallback' in window)requestIdleCallback(run,{timeout:18000});else setTimeout(run,10000)}
async function load(){
  const status=$('statusText');if(status)status.textContent='Connecting…';safeRender('ticker bootstrap',renderTicker);safeRender('verified market bootstrap',renderVerifiedMarketFallback);
  const snapshotPromise=hubCacheRead().catch(()=>null);
  const corePromise=loadCoreSeason(CONFIG.currentLeagueId);
  try{
    // Cached data is the fastest path on repeat visits and never blocks a fresh
    // core connection for more than the IndexedDB lookup itself.
    const cached=await Promise.race([snapshotPromise,new Promise(resolve=>setTimeout(()=>resolve(null),180))]);
    if(cached&&Date.now()-Number(cached.savedAt||0)<7*864e5){
      applyHubSnapshot(cached);
      if(status)status.textContent='Instant cache · refreshing Sleeper…';
      await yieldToBrowser();
    }

    const core=await corePromise;if(!core)throw new Error('No Sleeper league data could be loaded');
    if(!state.snapshotApplied){
      state.bundles=[core];state.league=core.league;state.currentUsers=core.users||[];state.currentRosters=core.rosters||[];state.trades=[];buildManagers();
      instantManagerShell();document.documentElement.classList.add('imo-interactive');
      if(status)status.textContent='Interactive · loading live league data…';
      await yieldToBrowser();
    }

    // Player directory and sport state no longer gate the first clickable paint.
    const sportStatePromise=getJSON(`${CONFIG.api}/state/nba`,true);
    const sportState=await sportStatePromise;if(sportState)state.sportState=sportState;

    // Refresh current season first. Historical leagues are deliberately loaded
    // one at a time so mobile connections and the main thread are not flooded.
    // V3.3.73: the full NBA player directory is no longer part of the startup
    // critical path. Cached player metadata is reused; the full directory loads
    // when Search is opened (or later during idle time on a first visit).
    const freshBundles=[],currentPromise=loadSeason(CONFIG.currentLeagueId);
    const current=await currentPromise;
    if(current)freshBundles.push(current);else freshBundles.push(core);
    state.bundles=[...freshBundles,...state.bundles.filter(b=>String(b?.league?.league_id)!==String(CONFIG.currentLeagueId))];
    rebuildStateFromBundles();renderForChange('current');document.documentElement.classList.add('imo-interactive');
    if(status)status.textContent='Live · loading history in the background…';
    await yieldToBrowser();

    // Manager profiles are the first historical priority: current season is already
    // ready, then load the immediately previous season before any older archive.
    const priorityIds=priorityHistoricalLeagueIds();
    state.profilePriorityPromise=(async()=>{for(const leagueId of priorityIds){const bundle=await loadSeason(leagueId);if(bundle)freshBundles.push(bundle);await yieldToBrowser()}state.bundles=freshBundles.length?freshBundles:[current||core];state.profilePriorityReady=true;rebuildStateFromBundles();renderForChange('history');upgradeOpenManagerProfile();scheduleHubCacheWrite();return true})();
    await state.profilePriorityPromise;
    if(status)status.textContent=`Live · current + previous season ready · verifying markets`;
    // Anything older than the previous season is deliberately lowest priority.
    // It hydrates during idle time, or immediately only if a History tab requests it.
    if(olderHistoricalLeagueIds().length)state.historyReady=false;else state.historyReady=true;
    scheduleOlderHistoryLoad();

    // Power Rankings and Championship Odds are never calculated from partial
    // startup data. Exact season totals start immediately after league history
    // is available; the rest of the site remains fully interactive meanwhile.
    const hydrateTotals=async()=>{
      try{
        if(!verifiedMarketInputsReady()){
          const currentBundle=currentLeagueBundle(),priorBundle=previousCompletedBundle(currentBundle),priorSeason=String(priorBundle?.league?.season||"");
          await loadSeasonTotalAverages(priorSeason?[priorSeason]:null);
        }
        resetModelCaches();prepareModels();state.globalSearchIndex=null;state.marketReady=verifiedMarketInputsReady();
        if(state.marketReady){prepareOddsMovement();renderForChange('market')}
        else safeRender('market fallback',renderVerifiedMarketFallback);
        scheduleHubCacheWrite();
        const averageCount=Object.values(state.seasonTotalMeta||{}).reduce((sum,season)=>sum+Object.keys(season||{}).length,0);
        if(status)status.textContent=state.marketReady?`Live · verified rankings · ${averageCount} exact averages`:`Live · market verification unavailable`;
        const remainingSeasons=state.bundles.map(b=>String(b?.league?.season||"")).filter(season=>season&&!Object.keys(state.seasonTotalAverages?.[season]||{}).length);
        if(remainingSeasons.length){
          const finishTotals=()=>loadSeasonTotalAverages(remainingSeasons).then(()=>{resetModelCaches();prepareModels();state.globalSearchIndex=null;scheduleHubCacheWrite()}).catch(error=>console.warn('Deferred season totals unavailable:',error));
          if('requestIdleCallback' in window)requestIdleCallback(finishTotals,{timeout:12000});else setTimeout(finishTotals,7000);
        }
      }catch(error){console.warn('Exact Sleeper season averages unavailable:',error);safeRender('market fallback',renderVerifiedMarketFallback)}
    };
    hydrateTotals();
    // Game-log dependent features are hydrated only when their relevant section
    // enters view or a manager Roster tab is opened. The ticker no longer causes
    // a league-wide player game-log sweep during startup.
    if(!state.fullPlayerDirectoryLoaded){
      // Names are core presentation data, but the large directory must never
      // block interaction. Begin it shortly after the critical league/profile
      // path is ready, then patch unresolved labels in-place when it arrives.
      const resolvePlayerNames=()=>ensureFullPlayerDirectory().catch(()=>{});
      if('requestIdleCallback' in window)requestIdleCallback(resolvePlayerNames,{timeout:3500});else setTimeout(resolvePlayerNames,1800);
    }
  }catch(e){
    console.error('IMO DYNASTY load failed:',e);if(status)status.textContent=state.snapshotApplied?'Cached data · refresh unavailable':'Could not load Sleeper data';
    if(!state.snapshotApplied){safeRender('recent trades fallback',renderRecent);safeRender('biggest trades fallback',renderBiggestTrades);safeRender('ticker fallback',renderTicker)}
  }
}
document.querySelectorAll('.active-window-btn').forEach(b=>b.addEventListener('click',()=>{state.activeWindow=b.dataset.activeWindow;document.querySelectorAll('.active-window-btn').forEach(x=>x.classList.toggle('active',x===b));renderLeaderboard()}));$("biggestTradesToggle")?.addEventListener('click',()=>{state.biggestTradesExpanded=!state.biggestTradesExpanded;renderBiggestTrades()});
let lastManagerPointerAction=0;
function closeMobileManagerSwitcher(){
  const sheet=document.getElementById('mobileManagerSwitcherSheet');
  if(sheet)sheet.remove();
  document.body.classList.remove('mobile-manager-switcher-open');
  document.querySelectorAll('[data-manager-switcher-trigger][aria-expanded="true"]').forEach(btn=>btn.setAttribute('aria-expanded','false'));
}
function openMobileManagerSwitcher(trigger){
  closeMobileManagerSwitcher();
  const currentId=String($("managerProfileModal")?.dataset.managerId||'');
  const options=[...state.managers.values()].sort((a,b)=>a.name.localeCompare(b.name));
  const sheet=document.createElement('div');
  sheet.id='mobileManagerSwitcherSheet';
  sheet.className='mobile-manager-switcher-sheet open';
  sheet.innerHTML=`<button type="button" class="mobile-manager-switcher-backdrop" data-close-mobile-manager-switcher aria-label="Close manager switcher"></button><section class="mobile-manager-switcher-card" role="dialog" aria-modal="true" aria-label="Switch manager"><div class="mobile-manager-switcher-head"><div><span class="eyebrow">TEAM PROFILES</span><h3>Switch Manager</h3></div><button type="button" class="mobile-manager-switcher-close" data-close-mobile-manager-switcher aria-label="Close">×</button></div><div class="mobile-manager-switcher-list">${options.map(m=>{const avatar=m.avatar?`<img src="${esc(m.avatar)}" alt="" loading="lazy">`:`<span>${esc(m.initials||m.name.slice(0,2).toUpperCase())}</span>`;return `<button type="button" class="mobile-manager-switcher-option ${m.id===currentId?'active':''}" data-mobile-switch-manager="${esc(m.id)}">${avatar}<b>${esc(m.name)}</b>${m.id===currentId?'<small>Current</small>':''}</button>`}).join('')}</div></section>`;
  document.body.appendChild(sheet);
  document.body.classList.add('mobile-manager-switcher-open');
  trigger.setAttribute('aria-expanded','true');
  requestAnimationFrame(()=>sheet.querySelector('.mobile-manager-switcher-option:not(.active)')?.focus({preventScroll:true}));
}
function toggleManagerSwitcher(trigger){
  if(window.matchMedia('(max-width: 620px)').matches){
    openMobileManagerSwitcher(trigger);
    return;
  }
  const sw=trigger?.closest('[data-manager-switcher]'),menu=sw?.querySelector('.manager-switcher-menu');
  if(!sw||!menu)return;
  const opening=!sw.classList.contains('open');
  closeManagerSwitchers(sw);
  sw.classList.toggle('open',opening);
  menu.hidden=!opening;
  trigger.setAttribute('aria-expanded',String(opening));
}

let lastArchetypePointerAction=0;
// Use one pointer-up path on touch devices so a single tap always opens the profile or switcher.
document.addEventListener("pointerup",e=>{
  if(e.pointerType==='mouse'&&e.button!==0)return;
  const archetypeButton=e.target.closest?.('[data-open-archetype-guide]');
  if(archetypeButton){e.preventDefault();e.stopPropagation();lastArchetypePointerAction=Date.now();openArchetypeGuide(archetypeButton.dataset.currentArchetype||'',archetypeButton.dataset.secondaryArchetype||'');return}
  const switchTrigger=e.target.closest?.('[data-manager-switcher-trigger]');
  if(switchTrigger){e.preventDefault();e.stopPropagation();lastManagerPointerAction=Date.now();toggleManagerSwitcher(switchTrigger);return}
  const switchOption=e.target.closest?.('[data-switch-manager]');
  if(switchOption){e.preventDefault();e.stopPropagation();lastManagerPointerAction=Date.now();closeManagerSwitchers();openManagerProfile(switchOption.dataset.switchManager);return}
  const link=e.target.closest?.('.manager-profile-link');
  if(link){e.preventDefault();e.stopPropagation();lastManagerPointerAction=Date.now();closeManagerDirectory();openManagerProfile(link.dataset.managerId);return}
});

document.addEventListener("click",e=>{
  const hubNav=e.target.closest?.(".hub-nav-menu");
  if(hubNav&&!e.target.closest(".hub-nav-trigger")){setTimeout(()=>{hubNav.open=false},0)}
  if(e.target.closest("#globalSearchBtn")){openGlobalSearch();return}
  if(e.target.closest("[data-close-global-search]")||e.target.closest("#globalSearchClose")){closeGlobalSearch();return}
  if(e.target.closest("[data-global-search-back]")){renderGlobalSearchResults($("globalSearchInput")?.value||"");return}
  const globalResult=e.target.closest("[data-global-search-action]");if(globalResult){launchGlobalSearchEntity(globalResult.dataset.globalSearchAction,globalResult.dataset.globalSearchId);return}

  if(e.target.closest('[data-close-mobile-manager-switcher]')){e.preventDefault();closeMobileManagerSwitcher();return}
  const mobileSwitchOption=e.target.closest('[data-mobile-switch-manager]');
  if(mobileSwitchOption){e.preventDefault();e.stopPropagation();const managerId=mobileSwitchOption.dataset.mobileSwitchManager;closeMobileManagerSwitcher();openManagerProfile(managerId);return}
  if(e.target.closest('[data-close-mobile-profile-info]')){closeMobileProfileInfo();return}
  const switchTrigger=e.target.closest('[data-manager-switcher-trigger]');if(switchTrigger){if(Date.now()-lastManagerPointerAction<700)return;toggleManagerSwitcher(switchTrigger);return}
  const switchOption=e.target.closest('[data-switch-manager]');if(switchOption){if(Date.now()-lastManagerPointerAction<700)return;closeManagerSwitchers();openManagerProfile(switchOption.dataset.switchManager);return}
  if(window.matchMedia('(max-width: 620px)').matches){const badgeSummary=e.target.closest('.profile-badge-pop > summary');if(badgeSummary){e.preventDefault();const details=badgeSummary.parentElement,body=details?.querySelector(':scope > div');openMobileProfileInfo(body?.querySelector('strong')?.textContent||'Badge',body?.innerHTML||'');details.open=false;return}const formSummary=e.target.closest('.profile-form-result > summary');if(formSummary){e.preventDefault();const details=formSummary.parentElement,body=details?.querySelector(':scope > div');openMobileProfileInfo('Match result',body?.innerHTML||'');details.open=false;return}}
  const archetypeButton=e.target.closest('[data-open-archetype-guide]');if(archetypeButton){e.preventDefault();if(Date.now()-lastArchetypePointerAction<700)return;openArchetypeGuide(archetypeButton.dataset.currentArchetype||'',archetypeButton.dataset.secondaryArchetype||'');return}
  if(e.target.closest('[data-close-archetype-guide]')||e.target.closest('#archetypeGuideClose')){closeArchetypeGuide();return}
  const managerPicksBtn=e.target.closest("[data-open-manager-picks]");if(managerPicksBtn){openManagerPicksMade(managerPicksBtn.dataset.openManagerPicks);return}
  const shareCardBtn=e.target.closest("[data-download-manager-share-card]");if(shareCardBtn){downloadManagerShareCard(shareCardBtn.dataset.downloadManagerShareCard,shareCardBtn);return}
  if(e.target.closest("[data-close-manager-picks]")||e.target.closest("#managerPicksMadeClose")){closeManagerPicksMade();return}
  const rookiePickBtn=e.target.closest("[data-rookie-target-pick]");if(rookiePickBtn){const root=rookiePickBtn.closest("[data-rookie-targets]"),pick=rookiePickBtn.dataset.rookieTargetPick;if(root){root.querySelectorAll("[data-rookie-target-pick]").forEach(button=>{const active=button===rookiePickBtn;button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active))});root.querySelectorAll("[data-rookie-target-panel]").forEach(panel=>{const active=panel.dataset.rookieTargetPanel===pick;panel.classList.toggle("active",active);panel.hidden=!active})}return}
  const rookieMockTarget=e.target.closest("[data-open-rookie-mock-target]");if(rookieMockTarget){openMockDraftToOverall(rookieMockTarget.dataset.openRookieMockTarget);return}
  if(e.target.closest("#mockDraftBtn")){openMockDraft();return}
  if(e.target.closest("[data-close-mock-draft]")||e.target.closest("#mockDraftClose")){closeMockDraft();return}
  const mockRoundBtn=e.target.closest("[data-mock-round]");if(mockRoundBtn){const round=mockRoundBtn.dataset.mockRound;document.querySelectorAll("[data-mock-round]").forEach(b=>b.classList.toggle("active",b===mockRoundBtn));document.querySelectorAll("[data-mock-round-card]").forEach(card=>card.classList.toggle("round-focus",card.dataset.mockRoundCard===round));document.querySelector(`[data-mock-round-card="${round}"]`)?.scrollIntoView({behavior:"smooth",block:"start"});return}
  if(e.target.closest("#headlinesBtn")){openHeadlines();return}
  if(e.target.closest("[data-close-headlines]")||e.target.closest("#headlinesClose")){closeHeadlines();return}
  const starEl=e.target.closest("[data-star-player]");if(starEl){togglePlayerInterest(starEl.dataset.starPlayer);return}
  const returnTreeBtn=e.target.closest("[data-open-return-tree]");if(returnTreeBtn){const launch=returnTreeBtn.closest(".return-tree-launch"),managerId=launch?.querySelector("[data-return-tree-manager]")?.value;if(managerId)openTradeReturnTree(returnTreeBtn.dataset.openReturnTree,managerId);return}
  const followReturnChain=e.target.closest("[data-follow-return-chain]");if(followReturnChain){followTradeReturnChainAsset(followReturnChain.dataset.followReturnChain);return}
  const returnChainStep=e.target.closest("[data-return-chain-step]");if(returnChainStep){goToReturnChainStep(returnChainStep.dataset.returnChainStep);return}
  if(e.target.closest("[data-return-chain-back]")){goToReturnChainStep((returnChainSession?.steps.length||1)-2);return}
  if(e.target.closest("[data-close-return-tree]")||e.target.closest("#tradeReturnTreeClose")){closeTradeReturnTree();return}
  const frontOfficeTrade=e.target.closest("[data-front-office-trade]");if(frontOfficeTrade){openFrontOfficeTrade(frontOfficeTrade.dataset.frontOfficeTrade);return}
  const pickLinkEl=e.target.closest("[data-pick-history-key]");if(pickLinkEl){openPickHistory(pickLinkEl.dataset.pickHistoryKey);return}
  if(e.target.closest("[data-close-pick-history]")||e.target.closest("#pickHistoryClose")){closePickHistory();return}
  const playerLinkEl=e.target.closest(".player-history-link");if(playerLinkEl){if(playerLinkEl.closest("#managerPicksMadeModal"))closeManagerPicksMade();if(playerLinkEl.closest("#tradeReturnTreeModal"))closeTradeReturnTree();openPlayerHistory(playerLinkEl.dataset.playerId);return}
  if(e.target.closest("[data-close-player-history]")||e.target.closest("#playerHistoryClose")){closePlayerHistory();return}
  if(e.target.closest("#managerDirectoryBtn")){openManagerDirectory();return}
  if(e.target.closest("[data-close-manager-directory]")||e.target.closest("#managerDirectoryClose")){closeManagerDirectory();return}
  const ledgerToggle=e.target.closest('[data-manager-ledger-toggle]');if(ledgerToggle){const column=ledgerToggle.closest('.manager-ledger-column'),extras=column?Array.from(column.querySelectorAll('.manager-ledger-item-wrap.is-extra')):[];if(column&&extras.length){const expanded=column.classList.toggle('expanded');ledgerToggle.setAttribute('aria-expanded',expanded?'true':'false');ledgerToggle.textContent=managerTradeLedgerToggleLabel(extras.length,expanded)}return}
  const managerTabBtn=e.target.closest('[data-manager-tab]');if(managerTabBtn){const tab=managerTabBtn.dataset.managerTab,id=$('managerProfileModal')?.dataset.managerId;if(id&&tab!=='overview'&&!$('managerProfileContent')?.querySelector(`[data-manager-tab-panel="${tab}"]`)){ensureManagerFullProfileForTab(id,tab);return}setManagerProfileTab(tab,true);return}
  const seasonBtn=e.target.closest("[data-profile-season]");if(seasonBtn){state.profileAverageSeason=seasonBtn.dataset.profileSeason;const id=$("managerProfileModal")?.dataset.managerId,content=$("managerProfileContent");if(id&&content){const panels=content.querySelector('.manager-profile-tab-panels'),oldPanel=panels?.querySelector('[data-manager-tab-panel="roster"]');if(oldPanel)oldPanel.remove();const notice=document.createElement('div');notice.className='manager-profile-on-demand-loading';notice.innerHTML='<strong>Loading roster metrics…</strong><small>Resolving the selected season.</small>';content.appendChild(notice);buildManagerProfileTab(id,'roster').then(panelHtml=>{if($("managerProfileModal")?.dataset.managerId!==String(id))return;notice.remove();const targetPanels=content.querySelector('.manager-profile-tab-panels');if(targetPanels&&!targetPanels.querySelector('[data-manager-tab-panel="roster"]'))targetPanels.insertAdjacentHTML('beforeend',panelHtml);bindSparklineTooltips(content);setManagerProfileTab('roster',false)}).catch(error=>{notice.remove();console.warn('Season metric hydration failed:',error)})}return}
  const link=e.target.closest(".manager-profile-link");if(link){if(Date.now()-lastManagerPointerAction<700)return;closeManagerDirectory();openManagerProfile(link.dataset.managerId);return}
  if(e.target.closest("[data-close-manager-profile]")||e.target.closest("#managerProfileClose"))closeManagerProfile()
});
let globalSearchDebounce=null;document.addEventListener("input",e=>{if(e.target?.id!=="globalSearchInput")return;clearTimeout(globalSearchDebounce);const value=e.target.value;globalSearchDebounce=setTimeout(()=>renderGlobalSearchResults(value),90)});
document.addEventListener("toggle",e=>{const detail=e.target;if(!(detail instanceof HTMLDetailsElement)||!detail.open)return;if(detail.matches(".profile-badge-pop")){detail.closest(".profile-badge-icons")?.querySelectorAll(".profile-badge-pop[open]").forEach(x=>{if(x!==detail)x.open=false})}if(detail.matches(".profile-form-result")){detail.closest(".profile-form-strip")?.querySelectorAll(".profile-form-result[open]").forEach(x=>{if(x!==detail)x.open=false})}if(detail.matches(".player-history-trade")){detail.closest(".player-history-timeline")?.querySelectorAll(".player-history-trade[open]").forEach(x=>{if(x!==detail)x.open=false})}},true);
document.addEventListener('change',e=>{
  const ledgerSelect=e.target.closest?.('[data-manager-ledger-season]');
  if(ledgerSelect){const managerId=ledgerSelect.dataset.managerId||ledgerSelect.closest('[data-manager-trade-ledger]')?.dataset.managerTradeLedger,body=ledgerSelect.closest('[data-manager-trade-ledger]')?.querySelector('[data-manager-ledger-body]');if(managerId&&body)body.innerHTML=managerTradeLedgerInnerHTML(managerId,ledgerSelect.value);return}
  const select=e.target.closest?.('[data-mobile-manager-select]');
  if(!select)return;
  const managerId=select.value;
  if(!managerId)return;
  closeManagerSwitchers();
  closeMobileManagerSwitcher();
  openManagerProfile(managerId);
});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('[data-manager-switcher]')&&!e.target.closest('#mobileManagerSwitcherSheet'))closeManagerSwitchers()},{passive:true});
document.addEventListener("pointerover",e=>{if(!matchMedia("(pointer:fine)").matches)return;const link=e.target.closest?.(".manager-profile-link");if(link)queueManagerProfilePrewarm(link.dataset.managerId)},{passive:true});
document.addEventListener("focusin",e=>{const link=e.target.closest?.(".manager-profile-link");if(link)queueManagerProfilePrewarm(link.dataset.managerId)});
document.addEventListener("keydown",e=>{if((e.metaKey||e.ctrlKey)&&String(e.key).toLowerCase()==="k"){e.preventDefault();openGlobalSearch();return}if(e.key!=="Escape")return;if($("globalSearchModal")?.classList.contains("open"))closeGlobalSearch();else if($("pickHistoryModal")?.classList.contains("open"))closePickHistory();else if($("tradeReturnTreeModal")?.classList.contains("open"))closeTradeReturnTree();else if($("managerPicksMadeModal")?.classList.contains("open"))closeManagerPicksMade();else if($("mockDraftModal")?.classList.contains("open"))closeMockDraft();else if($("archetypeGuideModal")?.classList.contains("open"))closeArchetypeGuide();else if(document.getElementById('mobileManagerSwitcherSheet'))closeMobileManagerSwitcher();else if(document.getElementById('mobileProfileInfoSheet')?.classList.contains('open'))closeMobileProfileInfo();else if(document.querySelector('[data-manager-switcher].open'))closeManagerSwitchers();else if($("headlinesModal")?.classList.contains("open"))closeHeadlines();else if($("playerHistoryModal")?.classList.contains("open"))closePlayerHistory();else if($("managerProfileModal")?.classList.contains("open"))closeManagerProfile();else if($("managerDirectoryModal")?.classList.contains("open"))closeManagerDirectory()});
window.addEventListener("popstate",openManagerFromHash);
load().then?.(()=>openManagerFromHash());
