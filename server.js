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

// ✅ ENDPOINTS
app.get('/api/matches', async (req, res) => {
  await fetchLiveMatches();
  res.json({ matches: MATCHES, predictions: PREDICTIONS, stats: getStats() });
});

app.get('/api/tomorrow', async (req, res) => {
  await fetchNextDayMatches(1);
  res.json({ matches: MATCHES, stats: getStats() });
});

app.get('/api/future', async (req, res) => {
  await fetchNextDayMatches(7);
  res.json({ matches: MATCHES, stats: getStats() });
});

app.get('/api/refresh', async (req, res) => {
  await fetchLiveMatches();
  res.json({ success: true, count: PREDICTIONS.length });
});

// ✅ LIVE + Today
async function fetchLiveMatches() {
  try {
    MATCHES.length = 0; PREDICTIONS.length = 0;
    
    // LIVE all
    const liveRes = await fetch('https://v3.football.api-sports.io/fixtures?live=all', {
      headers: { 'x-rapidapi-key': API_KEY, 'x-rapidapi-host': 'v3.football.api-sports.io' }
    });
    const liveData = await liveRes.json();
    processMatches(liveData.response || [], 'LIVE');
    
    // Today
    const today = new Date().toISOString().split('T')[0];
    const todayRes = await fetch(`https://v3.football.api-sports.io/fixtures?date=${today}`, {
      headers: { 'x-rapidapi-key': API_KEY, 'x-rapidapi-host': 'v3.football.api-sports.io' }
    });
    const todayData = await todayRes.json();
    processMatches(todayData.response || [], 'SCHEDULED');
    
    // Predictions
    MATCHES.forEach(m => { 
      const p = realPredict(m); 
      if(p) PREDICTIONS.push(p); 
    });
    
    console.log(`✅ LIVE: ${getStats().liveMatches} | Total: ${MATCHES.length}`);
  } catch(e) {
    console.error('Live API Error:', e.message);
  }
}

// ✅ FIXED: Find NEXT days WITH MATCHES (no empty dates)
async function fetchNextDayMatches(days = 7) {
  try {
    MATCHES.length = 0;
    const today = new Date();
    
    console.log(`🔍 Finding matches for next ${days} days...`);
    
    for (let i = 0; i < days * 2; i++) {  // Check double days to find matches
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() + i);
      const dateStr = checkDate.toISOString().split('T')[0];
      
      const res = await fetch(`https://v3.football.api-sports.io/fixtures?date=${dateStr}`, {
        headers: { 'x-rapidapi-key': API_KEY, 'x-rapidapi-host': 'v3.football.api-sports.io' }
      });
      
      const data = await res.json();
      
      if (data.response && data.response.length > 0) {
        console.log(`✅ ${dateStr}: ${data.response.length} matches FOUND!`);
        
        data.response.slice(0, 20).forEach(match => {  // Limit 20 per day
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
            status: fixture.status.short || 'SCHEDULED'
          });
        });
      }
    }
    
    // Sort by date
    MATCHES.sort((a,b) => new Date(a.date) - new Date(b.date));
    console.log(`✅ TOTAL: ${MATCHES.length} REAL matches loaded!`);
    
  } catch(e) {
    console.error('Future matches error:', e.message);
  }
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
    highConfidence: PREDICTIONS.filter(p => p.confidence >= 80)?.length || 0
  };
}

// START
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Football Predictor LIVE on port ${PORT}`);
  console.log(`✅ All tabs scan for REAL matches automatically`);
});

setInterval(fetchLiveMatches, 90000);
fetchLiveMatches();
