


import express from 'express';
import fetch from 'node-fetch';
import { MATCHES, PREDICTIONS } from './config.js';
import { realPredict, extractStatistics, getFlag, formatPKT } from './core.js';

const app = express();
app.use(express.static('.'));
app.use(express.json());

// API KEY
const API_KEY = '62207494b8a241db93aee4c14b7c1266';

// ================= API =================
app.get('/api/matches', async (req, res) => {
  await fetchLiveMatches();
  res.json({
    matches_by_date: groupMatchesByDate(MATCHES),
    predictions: PREDICTIONS,
    stats: getStats()
  });
});

app.get('/api/refresh', async (req, res) => {
  await fetchLiveMatches();
  res.json({ success: true, count: PREDICTIONS.length });
});

// ================= FETCH =================
async function fetchLiveMatches() {
  try {
    MATCHES.length = 0;
    PREDICTIONS.length = 0;

    const today = new Date();
    const dates = [];

    // Today + next 6 days
    for (let i = 0; i <= 6; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }

    // LIVE MATCHES
    const liveRes = await fetch('https://v3.football.api-sports.io/fixtures?live=all', {
      headers: {
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': 'v3.football.api-sports.io'
      }
    });
    const liveData = await liveRes.json();
    processMatches(liveData.response || [], 'LIVE');

    // SCHEDULED (TODAY + NEXT 6 DAYS)
    for (const date of dates) {
      const res = await fetch(
        `https://v3.football.api-sports.io/fixtures?date=${date}`,
        {
          headers: {
            'x-rapidapi-key': API_KEY,
            'x-rapidapi-host': 'v3.football.api-sports.io'
          }
        }
      );
      const data = await res.json();
      processMatches(data.response || [], 'SCHEDULED');
    }

    // PREDICTIONS (LIVE ONLY)
    MATCHES.forEach(m => {
      const p = realPredict(m);
      if (p) PREDICTIONS.push(p);
    });

    console.log(`LIVE: ${getStats().liveMatches} | Predictions: ${PREDICTIONS.length}`);
  } catch (e) {
    console.error('API ERROR:', e.message);
  }
}

// ================= PROCESS =================
function processMatches(apiMatches, defaultStatus) {
  apiMatches.forEach(m => {
    const f = m.fixture;
    if (MATCHES.some(x => x.match_id === f.id)) return;

    const league = m.league;
    const teams = m.teams;

    MATCHES.push({
      match_id: f.id,
      league: `${getFlag(league.country)} ${league.name}`,
      league_name: league.name.replace(/[^A-Za-z ]/g, '').trim(),
      home_team: teams.home.name,
      away_team: teams.away.name,
      status: f.status.short || defaultStatus,
      home_score: m.goals?.home ?? 0,
      away_score: m.goals?.away ?? 0,
      minute: f.status.elapsed || 0,
      time: formatPKT(f.date),
      time_date: f.date.split('T')[0],   // YYYY-MM-DD
      statistics: extractStatistics(m)
    });
  });
}

// ================= HELPERS =================
function groupMatchesByDate(matches) {
  return matches.reduce((acc, m) => {
    const d = m.time_date;
    if (!acc[d]) acc[d] = [];
    acc[d].push(m);
    return acc;
  }, {});
}

function getStats() {
  return {
    totalMatches: MATCHES.length,
    liveMatches: MATCHES.filter(m =>
      ['1H','2H','HT','ET','LIVE','P'].includes(m.status)
    ).length,
    predictions: PREDICTIONS.length,
    highConfidence: PREDICTIONS.filter(p => p.confidence >= 80).length
  };
}

// ================= RUN =================
setInterval(fetchLiveMatches, 90000);
fetchLiveMatches();

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`SERVER RUNNING : ${PORT}`);
});
