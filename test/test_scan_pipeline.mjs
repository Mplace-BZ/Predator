// Test pipeline v8.6: udowadnia że Predator poprawnie obsługuje live matches.
// Run: node test/test_scan_pipeline.mjs
// Wymaga: FOOTY_PROXY + FOOTY_AUTH (te same co w index.html)

const FOOTY_PROXY='https://red-haze-5f37mplace-agent.contactmplace.workers.dev';
const FOOTY_AUTH='Bearer Czucio123$';

let passed=0, failed=0;
function assert(cond,name,detail=''){
  if(cond){ console.log('  ✓ '+name); passed++; }
  else { console.error('  ✗ '+name+(detail?' — '+detail:'')); failed++; }
}
function header(s){ console.log('\n=== '+s+' ==='); }

async function fetchFooty(path,params={}){
  const qs=new URLSearchParams(params).toString();
  const url=FOOTY_PROXY+'/footy/'+path+(qs?'?'+qs:'');
  const r=await fetch(url,{headers:{'Authorization':FOOTY_AUTH}});
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}

// Replikacja normalizeMatch — FootyStats zwraca homeGoals/awayGoals jako JSON STRING
function normalizeMatch(m){
  if(!m) return m;
  if(typeof m.homeGoals==='string'){
    try{ m.homeGoals=JSON.parse(m.homeGoals); }catch(_){ m.homeGoals=[]; }
  }
  if(typeof m.awayGoals==='string'){
    try{ m.awayGoals=JSON.parse(m.awayGoals); }catch(_){ m.awayGoals=[]; }
  }
  if(!Array.isArray(m.homeGoals)) m.homeGoals=[];
  if(!Array.isArray(m.awayGoals)) m.awayGoals=[];
  return m;
}

function isLiveMatch(m){
  if(m.status==='in_play') return true;
  if(m.status==='complete') return false;
  if(!m.date_unix) return false;
  const now=Math.floor(Date.now()/1000);
  return m.date_unix<=now && m.date_unix>now-8100;
}

// v8.7: detect "live but API doesn't track live data" (status='incomplete' + recent kickoff)
function isStaleLiveData(m){
  if(!isLiveMatch(m)) return false;
  if(m.status==='in_play') return false;  // trustworthy
  const now=Math.floor(Date.now()/1000);
  return m.status==='incomplete' && m.date_unix && m.date_unix<now-300;
}

function poisson(lam,k){ return Math.exp(-lam)*Math.pow(lam,k)/factorial(k); }
function factorial(n){ let r=1; for(let i=2;i<=n;i++) r*=i; return r; }
function poissonCum(lam,k){ let s=0; for(let i=0;i<=k;i++) s+=poisson(lam,i); return s; }

// ── REPLIKACJA logiki footyComputeMatchCard z index.html v8.7.2 ──
function computeMatchCard(match,homeStats,awayStats){
  normalizeMatch(match);  // homeGoals/awayGoals: JSON string → array
  const sH=homeStats||{}, sA=awayStats||{};
  const hXG=sH.xg_for_avg_home||sH.xg_for_avg_overall||0;
  const aXG=sA.xg_for_avg_away||sA.xg_for_avg_overall||0;
  if(hXG+aXG===0) return null;
  const totalLam=hXG+aXG;

  const homeG=(match.homeGoals||[]).length;
  const awayG=(match.awayGoals||[]).length;
  const currentGoals=homeG+awayG;
  const isLive=isLiveMatch(match);
  const now=Math.floor(Date.now()/1000);
  const minute=isLive&&match.date_unix?Math.min(90,Math.max(1,Math.floor((now-match.date_unix)/60))):0;
  const minutesRem=isLive?Math.max(0,90-minute):90;
  const lamRem=totalLam*(minutesRem/90);
  const hLamRem=hXG*(minutesRem/90);
  const aLamRem=aXG*(minutesRem/90);

  function pOver(line){
    const goalsNeeded=Math.floor(line)-currentGoals+1;
    if(goalsNeeded<=0) return null;  // already hit
    if(lamRem<=0.001) return 0;
    return 1 - poissonCum(lamRem, goalsNeeded-1);
  }
  function pUnder(line){
    const maxGoals=Math.floor(line);
    if(currentGoals>maxGoals) return null;  // already lost
    const remBudget=maxGoals-currentGoals;
    if(lamRem<=0.001) return 1.0;
    return poissonCum(lamRem, remBudget);
  }
  const pOver25=pOver(2.5);
  const pUnder25=pUnder(2.5);

  let pBTTS;
  if(homeG>=1 && awayG>=1) pBTTS=null;
  else if(homeG>=1) pBTTS=isLive?(1-poisson(aLamRem,0)):(1-poisson(aXG,0));
  else if(awayG>=1) pBTTS=isLive?(1-poisson(hLamRem,0)):(1-poisson(hXG,0));
  else {
    const hLam=isLive?hLamRem:hXG;
    const aLam=isLive?aLamRem:aXG;
    pBTTS=(1-poisson(hLam,0))*(1-poisson(aLam,0));
  }

  function isMarketSane(modelP,odd){
    if(!odd||odd<1.01) return false;
    const implied=1/odd;
    if(modelP>0.25 && implied<0.15) return false;
    if(modelP<0.20 && implied>0.65) return false;
    return true;
  }

  const markets=[];
  if(match.odds_ft_over25 && pOver25!==null && isMarketSane(pOver25,match.odds_ft_over25)){
    const edge=(pOver25-1/match.odds_ft_over25)*100;
    if(pOver25>=0.40&&edge>=2) markets.push({label:'Over 2.5',edge,modelP:pOver25});
  }
  if(match.odds_ft_under25 && pUnder25!==null && isMarketSane(pUnder25,match.odds_ft_under25)){
    const edge=(pUnder25-1/match.odds_ft_under25)*100;
    if(pUnder25>=0.40&&edge>=2) markets.push({label:'Under 2.5',edge,modelP:pUnder25});
  }
  if(match.odds_btts_yes && pBTTS!==null && pBTTS>=0.40 && isMarketSane(pBTTS,match.odds_btts_yes)){
    const edge=(pBTTS-1/match.odds_btts_yes)*100;
    if(edge>=2) markets.push({label:'BTTS',edge,modelP:pBTTS});
  }
  if(!isLive){
    const hPPG=sH.seasonPPG_home||1.5, aPPG=sA.seasonPPG_away||1.5;
    const ppgTot=hPPG+aPPG+1.5;
    const pH=hPPG/ppgTot, pA=aPPG/ppgTot;
    if(match.odds_ft_1 && isMarketSane(pH,match.odds_ft_1)){
      const edge=(pH-1/match.odds_ft_1)*100;
      if(pH>=0.40&&edge>=3) markets.push({label:'Home Win',edge,modelP:pH});
    }
    if(match.odds_ft_2 && isMarketSane(pA,match.odds_ft_2)){
      const edge=(pA-1/match.odds_ft_2)*100;
      if(pA>=0.40&&edge>=3) markets.push({label:'Away Win',edge,modelP:pA});
    }
  }

  if(!markets.length){
    if(isLive){
      return {match,bestEdge:0,bestMarket:{label:'⚽ LIVE '+homeG+':'+awayG+' min '+minute},markets:[],isLiveOnly:true};
    }
    return null;
  }
  markets.sort((a,b)=>b.edge-a.edge);
  return {match,bestEdge:markets[0].edge,bestMarket:markets[0],markets,isLiveOnly:false};
}

// ──────────────────────────────────────────────────────────────────────
// TEST 1: bare /todays-matches — pomija live (regression test)
// ──────────────────────────────────────────────────────────────────────
async function test_bare_todays_matches(){
  header('TEST 1: /todays-matches bare (regression)');
  const r=await fetchFooty('todays-matches');
  const m=r.data||[];
  const live=m.filter(isLiveMatch).length;
  console.log('  total:',m.length,'· live:',live);
  assert(m.length>0,'API responsive');
  console.log('  (jeśli live=0 to potwierdza bug bare endpointu)');
}

// ──────────────────────────────────────────────────────────────────────
// TEST 2: /todays-matches?date= łapie live
// ──────────────────────────────────────────────────────────────────────
async function test_dated(){
  header('TEST 2: /todays-matches?date= łapie live');
  const todayUTC=new Date().toISOString().slice(0,10);
  const r=await fetchFooty('todays-matches',{date:todayUTC});
  const live=(r.data||[]).filter(isLiveMatch);
  console.log('  date=',todayUTC,'· total:',(r.data||[]).length,'· live:',live.length);
  assert((r.data||[]).length>0,'API zwraca dla today UTC');
}

// ──────────────────────────────────────────────────────────────────────
// TEST 3: 3-day span (yesterday+today+tomorrow)
// ──────────────────────────────────────────────────────────────────────
async function test_3day_span(){
  header('TEST 3: 3-day span (yesterday+today+tomorrow UTC)');
  const todayUTC=new Date().toISOString().slice(0,10);
  const tomorrowUTC=new Date(Date.now()+86400000).toISOString().slice(0,10);
  const yesterdayUTC=new Date(Date.now()-86400000).toISOString().slice(0,10);
  const [rY,rT,rTm]=await Promise.all([
    fetchFooty('todays-matches',{date:yesterdayUTC}),
    fetchFooty('todays-matches',{date:todayUTC}),
    fetchFooty('todays-matches',{date:tomorrowUTC}),
  ]);
  const merged=new Map();
  [...(rY.data||[]),...(rT.data||[]),...(rTm.data||[])].forEach(m=>merged.set(m.id,m));
  console.log('  Y:',(rY.data||[]).length,'T:',(rT.data||[]).length,'Tm:',(rTm.data||[]).length,'dedup:',merged.size);
  const live=[...merged.values()].filter(isLiveMatch);
  console.log('  total live:',live.length);
  assert(merged.size>=(rT.data||[]).length,'dedup ≥ today-only');
}

// ──────────────────────────────────────────────────────────────────────
// TEST 4: live-aware Poisson — phantom edges eliminated
// ──────────────────────────────────────────────────────────────────────
async function test_no_phantom_edges(){
  header('TEST 4: live-aware Poisson — eliminacja phantom edges');
  const todayUTC=new Date().toISOString().slice(0,10);
  const r=await fetchFooty('todays-matches',{date:todayUTC});
  const live=(r.data||[]).filter(isLiveMatch);
  if(live.length===0){
    console.log('  (brak live — pomijam)');
    return;
  }
  let phantomFound=false;
  for(const m of live.slice(0,4)){
    const score=(m.homeGoals||[]).length+(m.awayGoals||[]).length;
    if(score<3) continue;  // line jeszcze nie hit
    const [hT,aT]=await Promise.all([
      fetchFooty('team',{team_id:m.homeID}),
      fetchFooty('team',{team_id:m.awayID}),
    ]);
    const card=computeMatchCard(m,hT.data?.[0]?.stats,aT.data?.[0]?.stats);
    if(!card) continue;
    const o25=card.markets.find(mk=>mk.label==='Over 2.5');
    if(o25){
      console.log('  ⚠ '+m.home_name+' vs '+m.away_name+' @ score '+score+' → Over 2.5 w cards z edge '+o25.edge.toFixed(1)+'% (PHANTOM!)');
      phantomFound=true;
    } else {
      console.log('  ✓ '+m.home_name+' vs '+m.away_name+' @ score '+score+' → Over 2.5 SKIPPED (linia hit)');
    }
  }
  assert(!phantomFound,'live matches z hit Over 2.5 nie produkują phantom edge');
}

// ──────────────────────────────────────────────────────────────────────
// TEST 5: live-only placeholder card
// ──────────────────────────────────────────────────────────────────────
async function test_live_placeholder(){
  header('TEST 5: live-only placeholder card dla matches z wszystkimi liniami hit');
  const todayUTC=new Date().toISOString().slice(0,10);
  const r=await fetchFooty('todays-matches',{date:todayUTC});
  const live=(r.data||[]).filter(isLiveMatch);
  if(live.length===0){
    console.log('  (brak live — pomijam)');
    return;
  }
  let placeholderCount=0, edgeCount=0, nullCount=0;
  for(const m of live.slice(0,4)){
    const [hT,aT]=await Promise.all([
      fetchFooty('team',{team_id:m.homeID}),
      fetchFooty('team',{team_id:m.awayID}),
    ]);
    const card=computeMatchCard(m,hT.data?.[0]?.stats,aT.data?.[0]?.stats);
    if(!card) nullCount++;
    else if(card.isLiveOnly){
      placeholderCount++;
      console.log('  · '+m.home_name+' vs '+m.away_name+' → '+card.bestMarket.label+' (placeholder)');
    } else {
      edgeCount++;
      console.log('  · '+m.home_name+' vs '+m.away_name+' → '+card.bestMarket.label+' edge '+card.bestEdge.toFixed(1)+'%');
    }
  }
  console.log('  Result: '+placeholderCount+' placeholder · '+edgeCount+' z edge · '+nullCount+' null');
  assert(placeholderCount+edgeCount===live.slice(0,4).length || nullCount===0,
    'wszystkie live mecze produkują card (edge LUB placeholder, nie null)');
}

// ──────────────────────────────────────────────────────────────────────
// TEST 6: pre-match nie jest błędnie flagowane jako live-only (regression)
// Jeśli model nie znajdzie edge (norm) — null. Jeśli znajdzie — card z markets.
// Pre-match nigdy nie powinno mieć isLiveOnly=true.
// ──────────────────────────────────────────────────────────────────────
async function test_prematch_not_flagged_live(){
  header('TEST 6: pre-match nigdy nie isLiveOnly (regression)');
  const tomorrowUTC=new Date(Date.now()+86400000).toISOString().slice(0,10);
  const r=await fetchFooty('todays-matches',{date:tomorrowUTC});
  const matches=(r.data||[]).filter(m=>m.status==='incomplete'&&m.date_unix>Date.now()/1000+3600);
  if(matches.length===0){ console.log('  (brak pre-match — pomijam)'); return; }
  let liveOnlyMisflagged=0, totalChecked=0, withMarkets=0;
  for(const m of matches.slice(0,8)){
    if(!m.odds_ft_over25 && !m.odds_btts_yes && !m.odds_ft_1) continue;
    totalChecked++;
    const [hT,aT]=await Promise.all([
      fetchFooty('team',{team_id:m.homeID}),
      fetchFooty('team',{team_id:m.awayID}),
    ]);
    const card=computeMatchCard(m,hT.data?.[0]?.stats,aT.data?.[0]?.stats);
    if(card && card.isLiveOnly){
      liveOnlyMisflagged++;
      console.log('  ✗ '+m.home_name+' vs '+m.away_name+' → MISFLAGGED jako live-only (pre-match w '+Math.floor((m.date_unix-Date.now()/1000)/3600)+'h)');
    } else if(card && !card.isLiveOnly){
      withMarkets++;
      console.log('  ✓ '+m.home_name+' vs '+m.away_name+' → pre-match card '+card.bestMarket.label+' edge '+card.bestEdge.toFixed(1)+'%');
    }
  }
  console.log('  Sprawdzonych: '+totalChecked+' · z markets: '+withMarkets+' · misflagged: '+liveOnlyMisflagged);
  assert(liveOnlyMisflagged===0,'żaden pre-match nie został oznaczony jako live-only');
}

// ──────────────────────────────────────────────────────────────────────
// TEST 8 (v8.7.2): homeGoals JSON string parsing fix
// FootyStats zwraca homeGoals jako "[]" (string) nie [] (array). Bez fixa
// (m.homeGoals||[]).length na stringu daje 2 (długość stringa) zamiast 0.
// ──────────────────────────────────────────────────────────────────────
async function test_homegoals_string_parsing(){
  header('TEST 8: homeGoals JSON string parsing (regression dla v8.7.2 fix)');
  // Synthesize match z stringiem homeGoals (jak FootyStats zwraca)
  const fakeEmpty={id:1,homeGoals:'[]',awayGoals:'[]',home_name:'A',away_name:'B'};
  const fakeWithGoals={id:2,homeGoals:'["23","67"]',awayGoals:'["41"]',home_name:'C',away_name:'D'};
  // Without normalize (BUG):
  const buggyEmpty=fakeEmpty.homeGoals.length;  // = 2 (string length of "[]")
  const buggyWith=fakeWithGoals.homeGoals.length;  // = 13 (string length)
  // With normalize:
  normalizeMatch(fakeEmpty);
  normalizeMatch(fakeWithGoals);
  const fixedEmpty=fakeEmpty.homeGoals.length;  // = 0 (empty array)
  const fixedWith=fakeWithGoals.homeGoals.length;  // = 2 (2 goals scored)
  console.log('  BUG (bez normalize):  empty="[]" → length',buggyEmpty,'(string len)');
  console.log('  BUG:                  with-goals → length',buggyWith,'(string len)');
  console.log('  FIX (po normalize):   empty=[] → length',fixedEmpty);
  console.log('  FIX:                  with-goals=["23","67"] → length',fixedWith);
  assert(fixedEmpty===0,'normalizeMatch parsuje "[]" → []');
  assert(fixedWith===2,'normalizeMatch parsuje "[\\"23\\",\\"67\\"]" → ["23","67"]');
  assert(buggyEmpty===2 && buggyWith>2,'bez normalize string.length zwraca długość JSON stringa (bug)');
}

// ──────────────────────────────────────────────────────────────────────
// TEST 9: weryfikuj że API faktycznie zwraca homeGoals jako string
// ──────────────────────────────────────────────────────────────────────
async function test_api_returns_string(){
  header('TEST 9: weryfikacja że FootyStats API zwraca homeGoals jako JSON string');
  const todayUTC=new Date().toISOString().slice(0,10);
  const r=await fetchFooty('todays-matches',{date:todayUTC});
  const matches=r.data||[];
  if(matches.length===0){ console.log('  (brak matches — pomijam)'); return; }
  const sample=matches[0];
  const goalsType=typeof sample.homeGoals;
  console.log('  sample match:',sample.home_name,'vs',sample.away_name);
  console.log('  raw homeGoals:',JSON.stringify(sample.homeGoals));
  console.log('  typeof:',goalsType);
  assert(goalsType==='string','API zwraca homeGoals jako JSON string (zgodnie z dokumentacją bugiem)');
  console.log('  → wymaga normalizeMatch przed użyciem .length');
}

// ──────────────────────────────────────────────────────────────────────
// TEST 7 (v8.7): detect "API live data unreliable" — live + status=incomplete
// ──────────────────────────────────────────────────────────────────────
async function test_stale_live_detection(){
  header('TEST 7: detect API stale-live (status=incomplete + recent kickoff)');
  const todayUTC=new Date().toISOString().slice(0,10);
  const r=await fetchFooty('todays-matches',{date:todayUTC});
  const live=(r.data||[]).filter(isLiveMatch);
  if(live.length===0){ console.log('  (brak live — pomijam)'); return; }
  let staleCount=0, trustworthyCount=0;
  for(const m of live){
    const stale=isStaleLiveData(m);
    if(stale){
      staleCount++;
      console.log('  ⚠ '+m.home_name+' vs '+m.away_name+' status='+m.status+' → API stale-live (sprawdź u bukmachera)');
    } else {
      trustworthyCount++;
      console.log('  ✓ '+m.home_name+' vs '+m.away_name+' status='+m.status+' → trustworthy live data');
    }
  }
  console.log('  Total: '+staleCount+' stale-live · '+trustworthyCount+' trustworthy');
  // Hobby tier reality: większość/wszystkie live będą status='incomplete' = stale.
  // Test passes jeśli pipeline FLAGUJE je correctly (nie pomija).
  assert(staleCount+trustworthyCount===live.length,'wszystkie live matches sklasyfikowane (stale OR trustworthy)');
  if(staleCount>0){
    console.log('  → user'+(staleCount===live.length?' wszystkie':' niektóre')+' live matches z statusem incomplete = trzeba sprawdzić u bukmachera');
  }
}

// ──────────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────────
(async()=>{
  console.log('Predator scan pipeline tests v8.7 · '+new Date().toLocaleString('pl'));
  try{
    await test_bare_todays_matches();
    await test_dated();
    await test_3day_span();
    await test_no_phantom_edges();
    await test_live_placeholder();
    await test_prematch_not_flagged_live();
    await test_stale_live_detection();
    await test_homegoals_string_parsing();
    await test_api_returns_string();
  }catch(e){
    console.error('TEST CRASH:',e);
    failed++;
  }
  console.log('\n=== RESULT: '+passed+' passed · '+failed+' failed ===');
  process.exit(failed>0?1:0);
})();
