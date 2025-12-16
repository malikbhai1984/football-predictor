


import express from 'express';
import fetch from 'node-fetch';
import { CONFIG, MATCHES, PREDICTIONS } from './config.js';
import { realPredict, extractStatistics, getLeagueFactor, getFlag, formatPKT } from './core.js';

const app = express();
app.use(express.static('.'));
app.use(express.json());

const API_KEY = '62207494b8a241db93aee4c14b7c1266';

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});

// ✅ ENDPOINT 1: Today + LIVE Matches
app.get('/api/matches', async (req, res) => {
  try {
    await fetchLiveMatches();
    res.json({ 
      matches: MATCHES, 
      predictions: PREDICTIONS, 
      stats: getStats() 
    });
  } catch(e) {
    console.error('Matches API Error:', e.message);
    res.json({ matches: [], predictions: [], stats: { totalMatches: 0, liveMatches: 0, predictions: 0, highConfidence: 0 } });
  }
});

// ✅ ENDPOINT 2: Tomorrow Matches
app.get('/api/tomorrow', async (req, res) => {
  try {
    await fetchTomorrowMatches();
    res.json({ 
      matches: MATCHES, 
      stats: getStats() 
    });
  } catch(e) {
    console.error('Tomorrow API Error:', e.message);
    res.json({ matches: [], stats: { totalMatches: 0 } });
  }
});

// ✅ ENDPOINT 3: Next 5 Days Matches
app.get('/api/future', async (req, res) => {
  try {
    await fetchFutureMatches();
    res.json({ 
      matches: MATCHES, 
      stats: getStats() 
    });
  } catch(e) {
    console.error('Future API Error:', e.message);
    res.json({ matches: [], stats: { totalMatches: 0 } });
  }
});

// ✅ ENDPOINT 4: Manual Refresh
app.get('/api/refresh', async (req, res) => {
  try {
    await fetchLiveMatches();
    res.json({ 
      success: true, 
      count: PREDICTIONS.length,
      stats: getStats()
    });
  } catch(e) {
    console.error('Refresh API Error:', e.message);
    res.json({ success: false });
  }
});

// ✅ FUNCTION 1: LIVE + Today Matches
async function fetchLiveMatches() {
  try {
    MATCHES.length = 0;
    PREDICTIONS.length = 0;
    
    const today = new Date().toISOString().split('T')[0];
    
    // LIVE Matches
    console.log('🔴 Fetching LIVE matches...');
    const liveResponse = await fetch('https://v3.football.api-sports.io/fixtures?live=all', {
      headers: { 
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': 'v3.football.api-sports.io' 
      }
    });
    const liveData = await liveResponse.json();
    processMatches(liveData.response || [], 'LIVE');
    
    // Today Matches
    console.log('📅 Fetching today matches...');
    const todayResponse = await fetch(`https://v3.football.api-sports.io/fixtures?date=${today}`, {
      headers: { 
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': 'v3.football.api-sports.io' 
      }
    });
    const todayData = await todayResponse.json();
    processMatches(todayData.response || [], 'SCHEDULED');
    
    // Generate Predictions
    MATCHES.forEach(match => {
      const pred = realPredict(match);
      if (pred) PREDICTIONS.push(pred);
    });
    
    const stats = getStats();
    console.log(`✅ LIVE: ${stats.liveMatches} | Predictions: ${PREDICTIONS.length} | Total: ${stats.totalMatches}`);
  } catch (error) {
    console.error('fetchLiveMatches Error:', error.message);
  }
}

// ✅ FUNCTION 2: Tomorrow Matches
async function fetchTomorrowMatches() {
  try {
    MATCHES.length = 0;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    
    console.log(`📅 Fetching tomorrow (${dateStr}) matches...`);
    const response = await fetch(`https://v3.football.api-sports.io/fixtures?date=${dateStr}`, {
      headers: { 
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': 'v3.football.api-sports.io' 
      }
    });
    const data = await response.json();
    processMatches(data.response || [], 'SCHEDULED');
    
    console.log(`✅ Tomorrow: ${MATCHES.length} matches loaded`);
  } catch (error) {
    console.error('fetchTomorrowMatches Error:', error.message);
  }
}

// ✅ FUNCTION 3: Next 5 Days Matches
async function fetchFutureMatches() {
  try {
    MATCHES.length = 0;
    const today = new Date();
    
    console.log('📅 Fetching next 5 days matches...');
    
    for (let i = 1; i <= 5; i++) {
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + i);
      const dateStr = futureDate.toISOString().split('T')[0];
      
      console.log(`📆 Day ${i}: ${dateStr}`);
      
      try {
        const response = await fetch(`https://v3.football.api-sports.io/fixtures?date=${dateStr}`, {
          headers: { 
            'x-rapidapi-key': API_KEY,
            'x-rapidapi-host': 'v3.football.api-sports.io' 
          }
        });
        const data = await response.json();
        
        data.response.forEach(match => {
          const fixture = match.fixture;
          const teams = match.teams;
          const league = match.league;
          
          if (MATCHES.some(m => m.match_id === fixture.id)) return;
          
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
      } catch(e) {
        console.log(`❌ Future date ${dateStr} failed:`, e.message);
      }
    }
    
    console.log(`✅ Next 5 days: ${MATCHES.length} matches loaded`);
  } catch (error) {
    console.error('fetchFutureMatches Error:', error.message);
  }
}

// ✅ FUNCTION 4: Process API Matches
function processMatches(apiMatches, defaultStatus) {
  apiMatches.forEach(match => {
    const fixture = match.fixture;
    
    // Skip duplicates
    if (MATCHES.some(m => m.match_id === fixture.id)) return;
    
    const teams = match.teams;
    const league = match.league;
    const cleanLeagueName = league.name.replace(/[^A-Za-z ]/g, '').trim();
    
    MATCHES.push({
      match_id: fixture.id,
      league: `${getFlag(league.country)} ${league.name}`,
      league_name: cleanLeagueName,
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

// ✅ FUNCTION 5: Get Stats
function getStats() {
  const liveCount = MATCHES.filter(m => ['1H','2H','HT','ET','LIVE'].includes(m.status)).length;
  const highConf = PREDICTIONS.filter(p => p.confidence >= 80).length;
  
  return {
    totalMatches: MATCHES.length,
    liveMatches: liveCount,
    predictions: PREDICTIONS.length,
    highConfidence: highConf
  };
}

// ✅ START SERVER
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 LIVE Football Predictor on port ${PORT}`);
  console.log(`✅ All tabs working: Today | Tomorrow | Next 5 Days | LIVE`);
  console.log(`✅ Auto-refresh every 90 seconds`);
});

// ✅ AUTO-REFRESH
setInterval(fetchLiveMatches, 90000);
fetchLiveMatches();

console.log('⚽ Server fully loaded & ready!');
