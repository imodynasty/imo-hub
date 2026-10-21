// IMO Dynasty selected-game feed. The Sleeper credential exists only in Cloudflare secrets.
const DEFAULT_LEAGUE='1341763186407276544';
const cors={ 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type' };
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}
function cleanLegs(legs){
  if(!Array.isArray(legs)||legs.length!==8)throw Error('Expected eight roster records; refusing incomplete overwrite');
  const ids=new Set();
  return legs.map(leg=>{
    const roster_id=Number(leg.roster_id),starters=Array.isArray(leg.starters)?leg.starters.map(String):[];
    if(!Number.isInteger(roster_id)||ids.has(roster_id)||starters.length!==10||!leg.starters_games||typeof leg.starters_games!=='object')throw Error('Incomplete Sleeper selections');
    ids.add(roster_id);
    const starters_games={};
    for(const pid of starters){const id=leg.starters_games[pid];if(id!=null&&/^\d{12,22}$/.test(String(id)))starters_games[pid]=String(id)}
    if(Object.keys(starters_games).length!==starters.length)throw Error(`Missing selected games for roster ${roster_id}`);
    return {roster_id,matchup_id:leg.matchup_id,starters,starters_games};
  });
}
async function update(env,week){
  if(!env.SLEEPER_AUTH_TOKEN)throw Error('SLEEPER_AUTH_TOKEN secret is missing');
  const leagueId=env.LEAGUE_ID||DEFAULT_LEAGUE;
  const query=`query IMOSelectedGames($league: Snowflake!, $round: Int!) { matchup_legs(league_id: $league, round: $round) { roster_id matchup_id starters starters_games } }`;
  // A literal-argument fallback is used because Sleeper's Snowflake variable handling is undocumented.
  const literal=`query { matchup_legs(league_id: "${leagueId}", round: ${week}) { roster_id matchup_id starters starters_games } }`;
  const response=await fetch('https://sleeper.com/graphql',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','Authorization':env.SLEEPER_AUTH_TOKEN},body:JSON.stringify({query:literal})});
  if(!response.ok)throw Error(`Sleeper HTTP ${response.status}`);
  const data=await response.json();
  if(data.errors?.length)throw Error(`Sleeper GraphQL: ${data.errors.map(e=>e.message).join('; ')}`);
  const rows=cleanLegs(data.data?.matchup_legs);
  const result={league_id:leagueId,week,rows,synced_at:new Date().toISOString()};
  await env.SELECTIONS.put(`${leagueId}:${week}`,JSON.stringify(result));
  await env.SELECTIONS.put(`${leagueId}:last_success`,JSON.stringify({week,synced_at:result.synced_at}));
  return result;
}
async function currentWeek(){
  const response=await fetch('https://api.sleeper.app/v1/state/nba');
  if(!response.ok)throw Error('Could not load Sleeper week');
  const state=await response.json();
  const week=Number(state.week||state.display_week);
  if(!Number.isInteger(week)||week<1||week>30)throw Error('Invalid current NBA week');
  return week;
}
export default {
  async scheduled(event,env,ctx){ctx.waitUntil((async()=>{
    try{await update(env,await currentWeek())}
    catch(e){console.error('IMO scheduled sync failed; previous data preserved:',e.message)}
  })())},
  async fetch(request,env){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    const url=new URL(request.url);
    if(url.pathname==='/health'){
      const data=await env.SELECTIONS.get(`${env.LEAGUE_ID||DEFAULT_LEAGUE}:last_success`,'json');
      return json({configured:Boolean(env.SLEEPER_AUTH_TOKEN),last_success:data||null});
    }
    if(url.pathname==='/selections'&&request.method==='GET'){
      const leagueId=url.searchParams.get('league_id')||DEFAULT_LEAGUE;
      const week=Number(url.searchParams.get('week'));
      if(leagueId!==(env.LEAGUE_ID||DEFAULT_LEAGUE)||!Number.isInteger(week)||week<1||week>30)return json({error:'Invalid league or week'},400);
      const value=await env.SELECTIONS.get(`${leagueId}:${week}`);
      return value?new Response(value,{headers:{...cors,'Content-Type':'application/json','Cache-Control':'public, max-age=30'}}):json({error:'No synced selections yet; check Worker logs and credentials'},503);
    }
    return json({error:'Not found'},404);
  }
};
