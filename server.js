

// server.js - API KEY + V3 STRUCTURE FIXED + MULTI-DAY SUPPORT
import express from 'express';
import fetch from 'node-fetch';
import { CONFIG, MATCHES, PREDICTIONS } from './config.js';
import { realPredict, extractStatistics, getFlag, formatPKT } from './core.js';

const app = express();
app.use(express.static('.'));
app.use(express.json());

// ✅ YOUR API KEY - DIRECTLY HERE (SECURE for localhost)
// NOTE: Make sure this key is functional.
const API_KEY = '62207494b8a241db93aee4c14b7c1266';  

// 📅 HELPER FUNCTION TO GET NEXT DATES (YYYY-MM-DD format)
function getDates(days) {
  const dates = [];
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    dates.push(date.toISOString().split('T')[0]);
  }
  return dates;
}

// API ENDPOINTS
app.get('/api/matches', async (req, res) => {
  await fetchLiveMatches();
  res.json({ 
    matches: MATCHES, 
    predictions: PREDICTIONS, 
    stats: getStats() 
  });
});

app.get('/api/refresh', async (req, res) => {
  await fetchLiveMatches();
  res.json({ success: true, count: PREDICTIONS.length });
});

async function fetchLiveMatches() {
  try {
    MATCHES.length = 0;
    PREDICTIONS.length = 0;
    
    const datesToFetch = getDates(6); // Today + Next 5 days = 6 days
    
    // 1. LIVE MATCHES (always first)
    const liveResponse = await fetch('https://v3.football.api-sports.io/fixtures?live=all', {
      headers: { 
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': 'v3.football.api-sports.io' 
      }
    });
    const liveData = await liveResponse.json();
    processMatches(liveData.response || [], 'LIVE');
    
    // 2. SCHEDULED MATCHES (Today + Next 5 days)
    console.log(`Fetching schedule for ${datesToFetch.length} days...`);
    for (const date of datesToFetch) {
      const dateResponse = await fetch(`https://v3.football.api-sports.io/fixtures?date=${date}`, {
        headers: { 
          'x-rapidapi-key': API_KEY,
          'x-rapidapi-host': 'v3.football.api-sports.io' 
        }
      });
      const dateData = await dateResponse.json();
      processMatches(dateData.response || [], 'SCHEDULED');
    }

    // GENERATE PREDICTIONS
    MATCHES.forEach(match => {
      const pred = realPredict(match);
      if (pred) PREDICTIONS.push(pred);
    });
    
    console.log(`✅ LIVE: ${getStats().liveMatches} | Predictions: ${PREDICTIONS.length} | Total Matches: ${MATCHES.length}`);
  } catch (error) {
    console.error('API Error:', error.message);
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
      // formatPKT now includes YYYY-MM-DD for filtering
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

setInterval(fetchLiveMatches, 90000);
fetchLiveMatches();

app.listen(8080, () => {
  console.log('\n🚀 LIVE FOOTBALL PREDICTOR v2.0 - MULTI-DAY SUPPORT');
  console.log('🚀 http://localhost:8080');
  console.log('========================================\n');
});
