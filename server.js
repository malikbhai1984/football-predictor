

import express from 'express';
import fetch from 'node-fetch';
import { CONFIG, MATCHES, PREDICTIONS } from './config.js';
import { realPredict, extractStatistics, getLeagueFactor, getFlag, formatPKT } from './core.js';

const app = express();
app.use(express.static('.'));
app.use(express.json());

const API_KEY = '62207494b8a241db93aee4c14b7c1266';

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

// ALL ENDPOINTS
app.get('/api/matches', async (req, res) => {
  try {
    await fetchLiveMatches();
    res.json({ matches: MATCHES, predictions: PREDICTIONS, stats: getStats() });
  } catch(e) { res.json({ matches: [], predictions: [], stats: { totalMatches: 0 } }); }
});

app.get('/api/tomorrow', async (req, res) => {
  try {
    await fetchTomorrowMatches();
    res.json({ matches: MATCHES, stats: getStats() });
  } catch(e) { res.json({ matches: [], stats: { totalMatches: 0 } }); }
});

app.get('/api/future', async (req, res) => {
  try {
    await fetchFutureMatches();
    res.json({ matches: MATCHES, stats: getStats() });
  } catch(e) { res.json({ matches: [], stats: { totalMatches: 0 } }); }
});

app.get('/api/refresh', async (req, res) => {
  try {
    await fetchLiveMatches();
    res.json({ success: true, count: PREDICTIONS.length });
  } catch(e) { res.json({ success: false }); }
});

// ✅ FIXED: LIVE + Today (ALL MATCHES)
async function fetchLiveMatches() {
  try {
    MATCHES.length = 0; PREDICTIONS.length = 0;
    const today = new Date().toISOString().split('T')[0];
    
    // LIVE
    console.log('🔴 LIVE matches...');
    const liveRes = await fetch('https://v3.football.api-sports.io/fixtures?live=all', {
      headers: { 'x-rapidapi-key': API_KEY, 'x-rapidapi-host': 'v3.football.api-sports.io' }
    });
    const liveData = await liveRes.json();
    processMatches(liveData.response || [], 'LIVE');
    
    // Today
    console.log('📅 Today matches...');
    const todayRes = await fetch(`https://v3.football.api-sports.io/fixtures?date=${today}`, {
      headers: { 'x-rapidapi-key': API_KEY, 'x-rapidapi-host': 'v3.football.api-sports.io' }
    });
    const todayData = await todayRes.json();
    processMatches(todayData.response || [], 'SCHEDULED');
    
    MATCHES.forEach(m => { const p = realPredict(m); if(p) PREDICTIONS.push(p); });
    console.log(`✅ LIVE: ${getStats().liveMatches} | Total: ${MATCHES.length}`);
  } catch(e) { console.error('LIVE Error:', e.message); }
}

// ✅ FIXED: Tomorrow (ALL LEAGUES - NO FILTER)
async function fetchTomorrowMatches() {
  try {
    MATCHES.length = 0;
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    
    // ❌ REMOVED league filter - ALL leagues worldwide
    const url = `https://v3.football.api-sports.io/fixtures?date=${dateStr}`;
    
    console.log(`📅 Tomorrow (${dateStr}) - ALL LEAGUES`);
    const res = await fetch(url, {
      headers: { 'x-rapidapi-key': API_KEY, 'x-rapidapi-host': 'v3.football.api-sports.io' }
    });
    const data = await res.json();
    
    console.log(`Tomorrow: ${data.response?.length || 0} matches found`);
    processMatches(data.response || [], 'SCHEDULED');
    console.log(`✅ Tomorrow loaded: ${MATCHES.length} matches`);
  } catch(e) { console.error('Tomorrow Error:', e.message); }
}

// ✅ FIXED: Next 5 Days (ALL LEAGUES WORLDWIDE)
async function fetchFutureMatches() {
  try {
    MATCHES.length = 0;
    const today = new Date();
    
    console.log('📅 Next 5 days - ALL LEAGUES WORLDWIDE');
    
    for (let i = 1; i <= 7; i++) {  // Extended to 7 days
      const futureDate = new Date(today); 
      futureDate.setDate(today.getDate() + i);
      const dateStr = futureDate.toISOString().split('T')[0];
      
      console.log(`📆 Day ${i}: ${dateStr}`);
      
      // ✅ NO LEAGUE FILTER - All world leagues + cups
      const url = `https://v3.football.api-sports.io/fixtures?date=${dateStr}`;
      
      const res = await fetch(url, {
        headers: { 'x-rapidapi-key': API_KEY, 'x-rapidapi-host': 'v3.football.api-sports.io' }
      });
      const data = await res.json();
      
      console.log(`${dateStr}: ${data.response?.length || 0} matches`);
      
      if (data.response && data.response.length > 0) {
        data.response.forEach(match => {
          const fixture = match.fixture;
          if (MATCHES.some(m => m.match_id === fixture.id)) return;
          
          const teams = match.teams;
          const league = match.league;
          
          MATCHES.push({
            match_id: fixture.id,
            league: `${getFlag(league.country)} ${league.name}`,
            league_name: league.name.replace(/[^A-Za-z ]/g, '').trim(),
            home_team: teams.home.name,
            away_team: teams.away.name,
            date: dateStr,
            time: formatPKT(fixture.date),
            status: 'SCHEDULED'
          });
        });
        console.log(`✅ ${dateStr}: +${data.response.length} matches`);
      }
    }
    
    // Sort by date
    MATCHES.sort((a,b) => new Date(a.date) - new Date(b.date));
    console.log(`✅ TOTAL 7 days: ${MATCHES.length} matches loaded`);
  } catch(e) { console.error('Future Error:', e.message); }
}

function processMatches(apiMatches, defaultStatus) {
  apiMatches.forEach(match => {
    const fixture = match.fixture;
    if (MATCHES.some(m => m.match_id === fixture.id)) return;
    
    const teams = match.teams;
    const league = match.league;
    
    MATCHES.push({
      match_id: fixture.id,
      league: `${getFlag(league.country)} ${league.name}`,
      league_name: league.name.replace(/[^A-Za-z ]/g, '').trim(),
      home_team: teams.home.name,
      away_team: teams.away.name,
      status: fixture.status.short || defaultStatus,
      home_score: match.goals?.home ?? null,
      away_score: match.goals?.away ?? null,
      minute: fixture.status.elapsed || 0,
      time: formatPKT(fixture.date),
      statistics: extractStatistics(match)
    });
  });
}

function getStats() {
  return {
    totalMatches: MATCHES.length,
    liveMatches: MATCHES.filter(m => ['1H','2H','HT','ET','LIVE'].includes(m.status)).length,
    predictions: PREDICTIONS.length,
    highConfidence: PREDICTIONS.filter(p => p.confidence >= 80).length
  };
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Football Predictor v2.0 on port ${PORT}`);
  console.log(`✅ ALL tabs working - 100+ matches loading...`);
});

setInterval(fetchLiveMatches, 90000);
fetchLiveMatches();
