

// server.js - NEXT 6 DAYS MATCHES + SAFE FETCH

import express from 'express';
import fetch from 'node-fetch';
import { CONFIG, MATCHES, PREDICTIONS } from './config.js';
import { realPredict, extractStatistics, getFlag, formatPKT } from './core.js';

const app = express();
app.use(express.static('.'));
app.use(express.json());

// ✅ YOUR API KEY
const API_KEY = 'YOUR_RAPIDAPI_KEY_HERE';  // ← Replace with your valid key

// API ENDPOINTS
app.get('/api/matches', async (req, res) => {
  await fetchMatchesNext6Days();
  res.json({ matches: MATCHES, predictions: PREDICTIONS });
});

app.get('/api/refresh', async (req, res) => {
  await fetchMatchesNext6Days();
  res.json({ success: true, count: PREDICTIONS.length });
});

// 🔹 Fetch next 6 days matches safely
async function fetchMatchesNext6Days() {
  try {
    MATCHES.length = 0;
    PREDICTIONS.length = 0;
    const today = new Date();

    for (let i = 0; i < 6; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const strDate = date.toISOString().split('T')[0];

      try {
        const response = await fetch(`https://v3.football.api-sports.io/fixtures?date=${strDate}`, {
          headers: {
            'x-rapidapi-key': API_KEY,
            'x-rapidapi-host': 'v3.football.api-sports.io'
          }
        });

        if (!response.ok) {
          console.error(`API fetch failed for ${strDate}:`, response.status, await response.text());
          continue;
        }

        const data = await response.json();
        console.log(`Fetched ${data.response.length} matches for ${strDate}`);

        processMatches(data.response || [], 'SCHEDULED');

      } catch (innerErr) {
        console.error('Inner fetch error:', innerErr);
      }
    }

    // Generate predictions for LIVE matches only
    MATCHES.forEach(match => {
      const pred = realPredict(match);
      if (pred) PREDICTIONS.push(pred);
    });

    console.log(`Total matches: ${MATCHES.length} | Predictions: ${PREDICTIONS.length}`);

  } catch (err) {
    console.error('Error fetching next 6 days matches:', err);
  }
}

// 🔹 Process API matches
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

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// 🔹 Auto-refresh every 90 seconds
setInterval(fetchMatchesNext6Days, 90000);
