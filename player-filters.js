/* IMO player discovery: optional filters, shared search and profile links. */
let playerFilterRun=0,playerFilterRows=[],playerFilterPage=1;
function pfBound(value){return String(value??'').trim()===''?null:Number(value)}
function pfRange(value,min,max){return min===null&&max===null||Number.isFinite(value)&&(min===null||value>=min)&&(max===null||value<=max)}
function pfMatches(row,f,recent=true){
  const pos=row.positions||[],group=f.position;
  if(group&&!pos.some(p=>p===group||group==='F'&&['SF','PF','F'].includes(p)||group==='G'&&['PG','SG','G'].includes(p)||group==='C'&&p==='C'))return false;
  if(!pfRange(row.seasonAvg,f.seasonMin,f.seasonMax)||!pfRange(row.age,f.ageMin,f.ageMax))return false;
  if(recent&&(!pfRange(row.recentAvg,f.recentMin,f.recentMax)||!pfRange(row.change,f.changeMin,f.changeMax)))return false;
  if(recent&&f.chemistry&&(f.chemMin!==null||f.chemMax!==null)&&(!(row.starts>=3)||!pfRange(row.chemistry,f.chemMin,f.chemMax)))return false;
  return true
}
function pfRead(){
  const form=document.getElementById('playerFilterForm'),data=new FormData(form),out={position:data.get('position'),window:Number(data.get('window')||10),chemistry:data.has('chemistry'),view:data.get('view')||'all'};
  for(const key of ['seasonMin','seasonMax','recentMin','recentMax','changeMin','changeMax','ageMin','ageMax','chemMin','chemMax'])out[key]=pfBound(data.get(key));
  for(const [min,max] of [['seasonMin','seasonMax'],['recentMin','recentMax'],['changeMin','changeMax'],['ageMin','ageMax'],['chemMin','chemMax']])if((out.chemistry||min!=='chemMin')&&out[min]!==null&&out[max]!==null&&out[min]>out[max])throw Error('A minimum cannot be higher than its maximum.');
  return out
}
function pfRender(){
  const target=document.getElementById('playerFilterResults'),sort=document.getElementById('pfSort').value,rows=playerFilterRows.slice().sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):(Number.isFinite(b[sort])?b[sort]:-Infinity)-(Number.isFinite(a[sort])?a[sort]:-Infinity)||a.name.localeCompare(b.name)),page=rows.slice(0,playerFilterPage*20),num=v=>Number.isFinite(v)?v.toFixed(2):'—';
  document.getElementById('pfCount').textContent=`${rows.length} player${rows.length===1?'':'s'} found`;
  target.innerHTML=page.length?page.map(r=>`<button class="pf-player" type="button" data-global-search-action="player" data-global-search-id="${esc(r.id)}"><span class="pf-identity"><strong>${esc(r.name)}</strong><small>${esc(r.positions.join(' / '))} · ${r.age??'—'} years</small></span><span class="pf-metrics"><span><small>SEASON</small><b>${num(r.seasonAvg)}</b></span><span><small>LAST ${r.recentGames||r.window}</small><b>${num(r.recentAvg)}</b></span><span><small>CHANGE</small><b class="${r.change>0?'pf-positive':''}">${Number.isFinite(r.change)&&r.change>0?'+':''}${num(r.change)}</b></span>${r.showChemistry?`<span><small>CHEMISTRY</small><b>${r.starts>=3?num(r.chemistry)+'%':r.managerId?'New Connection':'—'}</b></span>`:''}</span></button>`).join(''):'<div class="global-search-empty"><strong>No players match.</strong><small>Try widening a range or clearing a filter. Missing statistics do not count as zero.</small></div>';
  document.getElementById('pfMore').hidden=page.length>=rows.length;
}
async function pfSearch(event){
  event?.preventDefault();const status=document.getElementById('pfStatus'),button=document.getElementById('pfSubmit');let f;
  try{f=pfRead()}catch(e){status.textContent=e.message;return}
  const run=++playerFilterRun;button.disabled=true;document.getElementById('pfCancel').hidden=false;status.textContent='Loading current-season players…';document.getElementById('pfOutput').hidden=true;
  try{
    await ensureFullPlayerDirectory();const season=currentSeasonKey(),bundle=currentLeagueBundle();if(!bundle)throw Error('League data is still connecting. Try again shortly.');
    const scoring=bundle.league.scoring_settings||{},payload=await loadBulkSeasonPayload(season),averages=new Map();
    bulkSeasonRows(payload).forEach(row=>{const id=bulkRowPlayerId(row),stats=bulkRowStats(row),gp=Number(stats.gp),total=scoreSeasonStats(stats,scoring);if(id&&gp>0&&Number.isFinite(total))averages.set(id,total/gp)});
    if(payload===null||payload===undefined)throw Error('Current-season statistics are unavailable.');
    const owners=new Map();state.managers.forEach(m=>safeArray(m.roster?.players).forEach(id=>owners.set(String(id),String(m.id))));
    let rows=Object.entries(state.players).filter(([id,p])=>averages.has(id)||owners.has(id)||p.active===true&&p.team).map(([id,p])=>({id,name:playerName(id),positions:[...new Set([p.position,...safeArray(p.fantasy_positions)].filter(Boolean).map(x=>String(x).toUpperCase()))],age:currentPlayerAge(id)||null,seasonAvg:averages.has(id)?averages.get(id):null,recentAvg:null,recentGames:0,window:f.window,change:null,chemistry:null,starts:0,managerId:owners.get(id)||null,showChemistry:f.chemistry})).filter(row=>pfMatches(row,f,false));
    if(run!==playerFilterRun)return;
    let done=0,unavailable=0;
    await limitedMap(rows,5,async row=>{
      if(run!==playerFilterRun)return;
      let logs=state.gameLogs?.[season]?.[row.id];
      if((!Array.isArray(logs)||!logs.length)&&averages.has(row.id)){let result=null;try{result=await loadPlayerGameLogAverage(row.id,season,scoring)}catch(_){}logs=result?.rows||[];state.gameLogs[season]??={};if(logs.length)state.gameLogs[season][row.id]=logs}
      const games=safeArray(logs).filter(gameWasPlayed).map(g=>({date:gameDateValue(g),score:rivalryLeagueFantasyPoints(g,scoring)})).filter(g=>g.date&&Number.isFinite(g.score)).sort((a,b)=>a.date-b.date),recent=games.slice(-f.window);
      if(recent.length){row.recentAvg=recent.reduce((sum,g)=>sum+g.score,0)/recent.length;row.recentGames=recent.length;if(Number.isFinite(row.seasonAvg))row.change=row.recentAvg-row.seasonAvg}else unavailable++;
      if(run===playerFilterRun)status.textContent=`Checking individual games · ${++done} / ${rows.length} players`;
    });
    if(run!==playerFilterRun)return;
    if(f.chemistry){
      status.textContent='Checking chemistry with current managers…';if(f.view==='all')await ensureOlderHistoryLoaded();
      const managers=[...new Set(rows.filter(r=>pfMatches(r,{...f,chemistry:false})).map(r=>r.managerId).filter(Boolean))];
      await limitedMap(managers,2,async id=>{if(run!==playerFilterRun)return;try{await ensureManagerChemistryGameLogs(id,f.view)}catch(_){}const chemistry=new Map(managerTeamChemistryRows(id,f.view).map(r=>[String(r.id),r]));rows.filter(r=>r.managerId===id).forEach(r=>{const record=chemistry.get(r.id);if(record){r.chemistry=record.chemistry;r.starts=record.starts}})});
    }
    if(run!==playerFilterRun)return;
    playerFilterRows=rows.filter(row=>pfMatches(row,f));playerFilterPage=1;document.getElementById('pfOutput').hidden=false;pfRender();
    status.textContent=`${seasonLabel(season)} · IMO scoring · Individual NBA games${unavailable?' · '+unavailable+' players have unavailable game logs':''}. Chemistry uses current managers only; numeric chemistry filters require 3 starts.`;
  }catch(error){if(run===playerFilterRun)status.textContent='Could not finish: '+error.message+' Try Show me players again.'}
  finally{if(run===playerFilterRun){button.disabled=false;document.getElementById('pfCancel').hidden=true}}
}
function setupPlayerFilters(){
  const results=document.getElementById('globalSearchResults');if(!results)return;
  const field=(label,min,max,limits='')=>`<fieldset><legend>${label}</legend><div class="pf-pair"><label>Min<input name="${min}" type="number" step="0.01" inputmode="decimal" placeholder="Any" ${limits}></label><label>Max<input name="${max}" type="number" step="0.01" inputmode="decimal" placeholder="Any" ${limits}></label></div></fieldset>`;
  const wrapper=document.createElement('div');wrapper.className='player-filters';wrapper.innerHTML=`<details id="playerFilters"><summary>Player filters <span aria-hidden="true">＋</span></summary><form id="playerFilterForm"><p>Combine any filters. Leave a field blank for no restriction. Bounds include the entered value.</p><div class="pf-grid"><label>Position<select name="position"><option value="">Any position</option>${['G','F','C','PG','SG','SF','PF'].map(p=>`<option>${p}</option>`).join('')}</select></label><label>Recent games<select name="window">${[3,5,10,20].map(n=>`<option value="${n}" ${n===10?'selected':''}>Last ${n} games</option>`).join('')}</select></label>${field('Season FPTS/G','seasonMin','seasonMax')}${field('Recent FPTS/G','recentMin','recentMax')}${field('Improvement vs season','changeMin','changeMax')}${field('Age','ageMin','ageMax','min="0" max="60"')}</div><label class="pf-check"><input id="pfChemistry" name="chemistry" type="checkbox"> Chemistry with current manager</label><div id="pfChemFields" hidden><label>Timeframe<select name="view"><option value="all">All-time</option><option value="season">This season</option></select></label>${field('Chemistry %','chemMin','chemMax','min="0" max="100"')}</div><div class="pf-actions"><button id="pfSubmit" type="submit">Show me players</button><button id="pfReset" type="reset">Clear filters</button><button id="pfCancel" type="button" hidden>Cancel</button></div><p id="pfStatus" role="status" aria-live="polite"></p></form><div id="pfOutput" hidden><div class="pf-result-heading"><strong id="pfCount"></strong><label>Sort<select id="pfSort"><option value="seasonAvg">Season average</option><option value="recentAvg">Recent average</option><option value="change">Improvement</option><option value="chemistry">Chemistry</option><option value="age">Age</option><option value="name">Name</option></select></label></div><div id="playerFilterResults"></div><button id="pfMore" type="button">Show more players</button></div></details>`;
  results.before(wrapper);
  document.getElementById('playerFilterForm').addEventListener('submit',pfSearch);
  document.getElementById('globalSearchInput').addEventListener('input',()=>{document.getElementById('playerFilters').open=false});
  document.getElementById('pfChemistry').addEventListener('change',e=>{document.getElementById('pfChemFields').hidden=!e.target.checked});
  document.getElementById('pfSort').addEventListener('change',()=>{playerFilterPage=1;pfRender()});
  document.getElementById('pfMore').addEventListener('click',()=>{playerFilterPage++;pfRender()});
  const cancel=()=>{playerFilterRun++;document.getElementById('pfSubmit').disabled=false;document.getElementById('pfCancel').hidden=true;document.getElementById('pfStatus').textContent='Search cancelled.'};
  document.getElementById('pfCancel').addEventListener('click',cancel);
  document.getElementById('playerFilterForm').addEventListener('reset',()=>{cancel();playerFilterRows=[];document.getElementById('pfOutput').hidden=true;document.getElementById('pfChemFields').hidden=true;document.getElementById('pfStatus').textContent=''});
  document.getElementById('playerFilters').addEventListener('toggle',e=>{results.hidden=e.target.open;if(!e.target.open){cancel();document.getElementById('pfStatus').textContent=''}});
}
setupPlayerFilters();
