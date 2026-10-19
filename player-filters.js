/* IMO search filters. Empty bounds are unrestricted; recent games cross seasons. */
let playerFilterRun=0,playerFilterRows=[],playerFilterPage=1;
function pfBound(value){return String(value??'').trim()===''?null:Number(value)}
function pfRange(value,min,max){return min==null&&max==null||Number.isFinite(value)&&(min==null||value>=min)&&(max==null||value<=max)}
function pfMatches(row,f,recent=true){
  const group=f.position,pos=row.positions||[];
  if(group&&!pos.some(p=>p===group||group==='F'&&['SF','PF','F'].includes(p)||group==='G'&&['PG','SG','G'].includes(p)))return false;
  if(!pfRange(row.seasonAvg,f.seasonMin,f.seasonMax)||!pfRange(row.age,f.ageMin,f.ageMax))return false;
  if(recent&&!pfRange(row.recentAvg,f.recentMin,f.recentMax))return false;
  if(recent&&(f.chemMin!=null||f.chemMax!=null)&&(!(row.starts>=3)||!pfRange(row.chemistry,f.chemMin,f.chemMax)))return false;
  return true
}
function pfSeasonKeys(){return [...new Set([currentSeasonKey(),...historicalSeasonKeys(),...profileSeasonKeys()])].filter(Boolean).sort((a,b)=>Number(b)-Number(a))}
function pfPopulateSeasons(){
  const select=document.getElementById('pfSeason');if(!select)return;
  const chosen=select.value||currentSeasonKey(),keys=pfSeasonKeys();
  select.innerHTML=keys.map(key=>`<option value="${esc(key)}" ${key===chosen?'selected':''}>${esc(seasonLabel(key))}${key===currentSeasonKey()?' · current':''}</option>`).join('');
  if(!keys.includes(chosen))select.value=currentSeasonKey();
}
function pfRead(){
  const data=new FormData(document.getElementById('playerFilterForm')),out={position:data.get('position')||'',season:String(data.get('season')||currentSeasonKey()),window:Number(data.get('window')||10)};
  for(const key of ['seasonMin','seasonMax','recentMin','recentMax','ageMin','ageMax','chemMin','chemMax'])out[key]=pfBound(data.get(key));
  for(const [min,max] of [['seasonMin','seasonMax'],['recentMin','recentMax'],['ageMin','ageMax'],['chemMin','chemMax']])if(out[min]!=null&&out[max]!=null&&out[min]>out[max])throw Error('A minimum cannot be higher than its maximum.');
  return out
}
function pfRender(){
  const target=document.getElementById('playerFilterResults'),sort=document.getElementById('pfSort').value,rows=playerFilterRows.slice().sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):(Number.isFinite(b[sort])?b[sort]:-Infinity)-(Number.isFinite(a[sort])?a[sort]:-Infinity)||a.name.localeCompare(b.name)),page=rows.slice(0,playerFilterPage*20),num=v=>Number.isFinite(v)?v.toFixed(2):'—';
  document.getElementById('pfCount').textContent=`${rows.length} player${rows.length===1?'':'s'} found`;
  target.innerHTML=page.length?page.map(r=>`<button class="pf-player" type="button" data-global-search-action="player" data-global-search-id="${esc(r.id)}"><span class="pf-identity"><strong>${esc(r.name)}</strong><small>${esc(r.positions.join(' / '))} · ${r.age??'—'} years</small></span><span class="pf-metrics"><span><small>${esc(seasonLabel(r.averageSeason))}</small><b>${num(r.seasonAvg)}</b></span><span><small>${r.recentGames?'LAST '+r.recentGames+' GAMES':'RECENT'}</small><b>${num(r.recentAvg)}</b></span><span><small>CHEMISTRY</small><b>${r.starts>=3?num(r.chemistry)+'%':r.managerId?'New Connection':'—'}</b></span></span></button>`).join(''):'<div class="global-search-empty"><strong>No players match.</strong><small>Try widening a range. Missing statistics stay blank, not zero.</small></div>';
  document.getElementById('pfMore').hidden=page.length>=rows.length;
}
function pfRecentScores(playerId,seasons,window){
  const seen=new Set(),all=[];
  seasons.forEach(({season,scoring})=>safeArray(state.gameLogs?.[season]?.[playerId]).forEach(game=>{
    if(!gameWasPlayed(game))return;
    const date=chemistryGameDateValue(game),score=rivalryLeagueFantasyPoints(game,scoring),key=rivalryGameId(game)||date?.toISOString();
    if(!date||date.getTime()>Date.now()||!Number.isFinite(score)||!key||seen.has(key))return;
    seen.add(key);all.push({date,score,season});
  }));
  return all.sort((a,b)=>b.date-a.date).slice(0,window)
}
async function pfLoadRecent(row,seasons,window,run){
  for(let index=0;index<seasons.length;index++){
    const info=seasons[index];
    if(run!==playerFilterRun)return;
    let logs=state.gameLogs?.[info.season]?.[row.id];
    if(!safeArray(logs).length&&!info.empty){
      try{const result=await loadPlayerGameLogAverage(row.id,info.season,info.scoring);logs=result?.rows||[];state.gameLogs[info.season]??={};if(logs.length)state.gameLogs[info.season][row.id]=logs}catch(_){ }
    }
    if(pfRecentScores(row.id,seasons.slice(0,index+1),window).length>=window)break;
  }
  const recent=pfRecentScores(row.id,seasons,window);
  row.recentGames=recent.length;row.recentAvg=recent.length?recent.reduce((sum,g)=>sum+g.score,0)/recent.length:null;
  row.recentSeasons=[...new Set(recent.map(g=>g.season))];
}
async function pfSearch(event){
  event?.preventDefault();const status=document.getElementById('pfStatus'),button=document.getElementById('pfSubmit');let f;
  try{f=pfRead()}catch(e){status.textContent=e.message;return}
  const run=++playerFilterRun;button.disabled=true;document.getElementById('pfCancel').hidden=false;status.textContent='Loading season data…';document.getElementById('pfOutput').hidden=true;
  try{
    await Promise.all([ensureFullPlayerDirectory(),ensureOlderHistoryLoaded()]);if(run!==playerFilterRun)return;
    const current=currentSeasonKey(),bundle=currentLeagueBundle();if(!bundle)throw Error('League data is still connecting. Try again shortly.');
    const keys=pfSeasonKeys().filter(season=>Number(season)<=Number(current)),seasonData=new Map();
    await limitedMap(keys,2,async season=>{
      const seasonBundle=bundleForSeason(season),scoring=seasonBundle?.league?.scoring_settings||bundle.league.scoring_settings||{},payload=await loadBulkSeasonPayload(season),averages=new Map();
      bulkSeasonRows(payload).forEach(raw=>{const id=bulkRowPlayerId(raw),stats=bulkRowStats(raw),games=Number(stats.gp),total=scoreSeasonStats(stats,scoring);if(id&&games>0&&Number.isFinite(total))averages.set(id,total/games)});
      const stored=seasonAverageMap(season);Object.entries(stored||{}).forEach(([id,avg])=>{if(!averages.has(id)&&Number.isFinite(Number(avg))&&Number(avg)>0)averages.set(id,Number(avg))});
      seasonData.set(season,{season,scoring,averages,empty:payload!=null&&!averages.size,unavailable:payload==null&&!averages.size});
    });
    if(run!==playerFilterRun)return;
    let averageSeason=f.season,info=seasonData.get(averageSeason),fallback=false;
    // A labelled preseason baseline, never a silent replacement once games start.
    if(averageSeason===current&&!info?.averages.size&&!meaningfulWeeks(bundle).length){const prior=keys.find(season=>Number(season)<Number(current)&&seasonData.get(season)?.averages.size);if(prior){averageSeason=prior;info=seasonData.get(prior);fallback=true}}
    if(!info)throw Error('Selected IMO season is unavailable.');
    const recentSeasons=keys.map(key=>seasonData.get(key)).filter(Boolean),owners=new Map();state.managers.forEach(m=>safeArray(m.roster?.players).forEach(id=>owners.set(String(id),String(m.id))));
    let rows=Object.entries(state.players).filter(([id,p])=>info.averages.has(id)||owners.has(id)||p.active===true&&p.team).map(([id,p])=>({id,name:playerName(id),positions:[...new Set([p.position,...safeArray(p.fantasy_positions)].filter(Boolean).map(x=>String(x).toUpperCase()))],age:currentPlayerAge(id)||null,seasonAvg:info.averages.has(id)?info.averages.get(id):null,averageSeason,recentAvg:null,recentGames:0,window:f.window,chemistry:null,starts:0,managerId:owners.get(id)||null})).filter(row=>pfMatches(row,f,false));
    let done=0,unavailable=0;
    await limitedMap(rows,5,async row=>{if(run!==playerFilterRun)return;await pfLoadRecent(row,recentSeasons,f.window,run);if(!row.recentGames)unavailable++;if(run===playerFilterRun)status.textContent=`Checking recent games · ${++done} / ${rows.length}`});
    if(run!==playerFilterRun)return;
    const candidates=rows.filter(row=>pfRange(row.recentAvg,f.recentMin,f.recentMax)),managers=[...new Set(candidates.map(row=>row.managerId).filter(Boolean))];
    status.textContent='Checking current-manager chemistry…';
    await limitedMap(managers,2,async id=>{if(run!==playerFilterRun)return;try{await ensureManagerChemistryGameLogs(id,'all')}catch(_){}const chemistry=new Map(managerTeamChemistryRows(id,'all').map(r=>[String(r.id),r]));candidates.filter(row=>row.managerId===id).forEach(row=>{const record=chemistry.get(row.id);if(record){row.chemistry=record.chemistry;row.starts=record.starts}})});
    if(run!==playerFilterRun)return;
    playerFilterRows=rows.filter(row=>pfMatches(row,f));playerFilterPage=1;document.getElementById('pfOutput').hidden=false;pfRender();
    const note=fallback?`${seasonLabel(current)} has no averages yet; using ${seasonLabel(averageSeason)} as the preseason baseline. `:`Season average: ${seasonLabel(averageSeason)}. `;
    status.textContent=note+'Recent games span IMO seasons. Chemistry is all-time with the current manager.'+(unavailable?` ${unavailable} players have unavailable recent logs.`:'')+(info.unavailable?' Selected-season data is incomplete.':'');
  }catch(error){if(run===playerFilterRun)status.textContent='Could not finish: '+error.message+' Try again.'}
  finally{if(run===playerFilterRun){button.disabled=false;document.getElementById('pfCancel').hidden=true}}
}
function setupPlayerFilters(){
  const results=document.getElementById('globalSearchResults');if(!results)return;
  const range=(min,max,limits='')=>`<div class="pf-pair"><label>Min<input name="${min}" type="number" step="0.01" inputmode="decimal" placeholder="No minimum" ${limits}></label><label>Max<input name="${max}" type="number" step="0.01" inputmode="decimal" placeholder="No maximum" ${limits}></label></div>`;
  const wrapper=document.createElement('div');wrapper.className='player-filters';wrapper.innerHTML=`<details id="playerFilters"><summary>Player filters <span aria-hidden="true">＋</span></summary><form id="playerFilterForm"><p>Leave any bound blank for no limit.</p><div class="pf-grid"><label>Position<select name="position"><option value="">Any position</option>${['G','F','C','PG','SG','SF','PF'].map(p=>`<option>${p}</option>`).join('')}</select></label><fieldset><legend>Age</legend>${range('ageMin','ageMax','min="0" max="60"')}</fieldset><fieldset><legend>Season FPTS/G</legend><label class="pf-select-label"><span class="pf-sr-only">Season for average</span><select id="pfSeason" name="season"></select></label>${range('seasonMin','seasonMax')}</fieldset><fieldset><legend>Recent FPTS/G</legend><label class="pf-select-label"><span class="pf-sr-only">Recent game window</span><select name="window">${[3,5,10,20].map(n=>`<option value="${n}" ${n===10?'selected':''}>Last ${n} games</option>`).join('')}</select></label>${range('recentMin','recentMax')}</fieldset><fieldset class="pf-chemistry"><legend>Chemistry %</legend><small>Current manager · all-time</small>${range('chemMin','chemMax','min="0" max="100"')}</fieldset></div><div class="pf-actions"><button id="pfSubmit" type="submit">Show me players</button><button id="pfReset" type="reset">Clear</button><button id="pfCancel" type="button" hidden>Cancel</button></div><p id="pfStatus" role="status" aria-live="polite"></p></form><div id="pfOutput" hidden><div class="pf-result-heading"><strong id="pfCount"></strong><label>Sort<select id="pfSort"><option value="seasonAvg">Season average</option><option value="recentAvg">Recent average</option><option value="chemistry">Chemistry</option><option value="age">Age</option><option value="name">Name</option></select></label></div><div id="playerFilterResults"></div><button id="pfMore" type="button">Show more</button></div></details>`;
  results.before(wrapper);pfPopulateSeasons();
  document.getElementById('playerFilterForm').addEventListener('submit',pfSearch);
  document.getElementById('globalSearchInput').addEventListener('input',()=>{document.getElementById('playerFilters').open=false});
  document.getElementById('pfSort').addEventListener('change',()=>{playerFilterPage=1;pfRender()});
  document.getElementById('pfMore').addEventListener('click',()=>{playerFilterPage++;pfRender()});
  const cancel=()=>{playerFilterRun++;document.getElementById('pfSubmit').disabled=false;document.getElementById('pfCancel').hidden=true;document.getElementById('pfStatus').textContent='Search cancelled.'};
  document.getElementById('pfCancel').addEventListener('click',cancel);
  document.getElementById('playerFilterForm').addEventListener('reset',()=>{cancel();playerFilterRows=[];document.getElementById('pfOutput').hidden=true;document.getElementById('pfStatus').textContent='';setTimeout(()=>{document.getElementById('pfSeason').value=currentSeasonKey()},0)});
  document.getElementById('playerFilters').addEventListener('toggle',e=>{results.hidden=e.target.open;if(e.target.open){pfPopulateSeasons();ensureOlderHistoryLoaded().then(pfPopulateSeasons).catch(()=>{})}else{cancel();document.getElementById('pfStatus').textContent=''}});
}
setupPlayerFilters();
