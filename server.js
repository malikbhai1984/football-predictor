


import express from 'express';
import fetch from 'node-fetch';
import { CONFIG, MATCHES, PREDICTIONS } from './config.js';
import { realPredict, extractStatistics, getLeagueFactor, getFlag, formatPKT } from './core.js';

const app = express();
app.use(express.static('.'));
app.use(express.json());

const API_KEY = '62207494b8a241db93aee4c14b7c1266';

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});

// ✅ ALL 4 ENDPOINTS
app.get('/api/matches', async (req, res) => {
  try {
    await fetchLiveMatches();
    res.json({ 
      matches: MATCHES, 
      predictions: PREDICTIONS, 
      stats: getStats() 
    });
  } catch(e) {
    res.json({ matches: [], predictions: [], stats: { totalMatches: 0 } });
  }
});

app.get('/api/tomorrow', async (req, res) => {
  try {
    await fetchTomorrowMatches();
    res.json({ matches: MATCHES, stats: getStats() });
  } catch(e) {
    res.json({ matches: [], stats: { totalMatches: 0 } });
  }
});

app.get('/api/future', async (req, res) => {
  try {
    await fetchFutureMatches();
    res.json({ matches: MATCHES, stats: getStats() });
  } catch(e) {
    res.json({ matches: [], stats: { totalMatches: 0 } });
  }
});

app.get('/api/refresh', async (req, res) => {
  try {
    await fetchLiveMatches();
    res.json({ success: true, count: PREDICTIONS.length });
  } catch(e) {
    res.json({ success: false });
  }
});

// ✅ FIXED: LIVE + Today Matches
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
    
    console.log(`✅ LIVE: ${getStats().liveMatches} | Predictions: ${PREDICTIONS.length}`);
  } catch (error) {
    console.error('fetchLiveMatches Error:', error.message);
  }
}

// ✅ FIXED: Tomorrow Matches (TOP LEAGUES)
async function fetchTomorrowMatches() {
  try {
    MATCHES.length = 0;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    
    const leagueIds = '39,140,78,135,61'; // EPL,LaLiga,Bundesliga,SerieA,Ligue1
    const url = `https://v3.football.api-sports.io/fixtures?date=${dateStr}&league=${leagueIds}&timezone=Asia/Karachi`;
    
    console.log(`📅 Fetching tomorrow (${dateStr})...`);
    const response = await fetch(url, {
      headers: { 
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': 'v3.football.api-sports.io' 
      }
    });
    
    const data = await response.json();
    console.log(`Tomorrow API: ${data.response?.length || 0} matches`);
    
    processMatches(data.response || [], 'SCHEDULED');
    console.log(`✅ Tomorrow: ${MATCHES.length} matches loaded`);
  } catch (error) {
    console.error('fetchTomorrowMatches Error:', error.message);
  }
}

// ✅ FIXED: Next 5 Days (TOP LEAGUES ONLY)
async function fetchFutureMatches() {
  try {
    MATCHES.length = 0;
    const today = new Date();
    const leagueIds = '39,140,78,135,61'; // EPL,LaLiga,Bundesliga,SerieA,Ligue1
    
    console.log('📅 Fetching next 5 days matches (Top Leagues)...');
    
    for (let i = 1; i <= 5; i++) {
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + i);
      const dateStr = futureDate.toISOString().split('T')[0];
      
      console.log(`📆 Day ${i}: ${dateStr}`);
      
      const url = `https://v3.football.api-sports.io/fixtures?date=${dateStr}&league=${leagueIds}&timezone=Asia/Karachi`;
      
      try {
        const response = await fetch(url, {
          headers: { 
            'x-rapidapi-key': API_KEY,
            'x-rapidapi-host': 'v3.football.api-sports.io' 
          }
        });
        
        const data = await response.json();
        console.log(`API ${dateStr}: ${data.response?.length || 0} matches`);
        
        if (!data.response || data.response.length === 0) {
          console.log(`⚠️ No matches on ${dateStr}`);
          continue;
        }
        
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
        
        console.log(`✅ ${dateStr}: ${data.response.length} matches added`);
        
      } catch(e) {
        console.log(`❌ ${dateStr} failed:`, e.message);
      }
    }
    
    console.log(`✅ TOTAL Next 5 days: ${MATCHES.length} matches loaded`);
  } catch (error) {
    console.error('fetchFutureMatches Error:', error.message);
  }
}

function processMatches(apiMatches, defaultStatus) {
  apiMatches.forEach(match => {
    const fixture = match.fixture;
    
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

function getStats() {
  return {
    totalMatches: MATCHES.length,
    liveMatches: MATCHES.filter(m => ['1H','2H','HT','ET','LIVE'].includes(m.status)).length,
    predictions: PREDICTIONS.length,
    highConfidence: PREDICTIONS.filter(p => p.confidence >= 80).length
  };
}

// START SERVER
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 LIVE Football Predictor on port ${PORT}`);
  console.log(`✅ All 4 tabs: Today | Tomorrow | Next 5 Days | LIVE`);
});

setInterval(fetchLiveMatches, 90000);
fetchLiveMatches();
