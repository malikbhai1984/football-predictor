

export function extractStatistics(apiMatch) {
  const stats = apiMatch.statistics || [];
  const res = { shots_on_goal: 0, shots_inside_box: 0, corners: 0, red_cards: 0 };

  stats.forEach(t => {
    (t.statistics || []).forEach(s => {
      const type = String(s.type || '').toLowerCase();
      const val = parseInt(s.value || 0) || 0;

      if (type.includes('shot on')) res.shots_on_goal += val;
      if (type.includes('inside')) res.shots_inside_box += val;
      if (type.includes('corner')) res.corners += val;
      if (type.includes('red')) res.red_cards += val;
    });
  });

  return {
    shots_on_goal: res.shots_on_goal,
    shots_inside_box: res.shots_inside_box || Math.round(res.shots_on_goal * 1.2),
    corners: res.corners,
    red_cards: res.red_cards
  };
}

export function getLeagueFactor(league) {
  const f = {
    'Premier League': 4,
    'Bundesliga': 6,
    'Serie A': 1,
    'Ligue 1': 2,
    'La Liga': 3
  };
  return f[league] || 0;
}

export function realPredict(match) {
  const LIVE = ['1H','2H','HT','ET','LIVE'];
  if (!LIVE.includes(match.status)) return null;

  const hs = match.home_score;
  const as = match.away_score;
  const tg = hs + as;
  const min = Math.min(90, match.minute || 0);

  const s = match.statistics;
  const sog = s.shots_on_goal;
  const sib = s.shots_inside_box;
  const cor = s.corners;
  const red = s.red_cards;

  const raw = (sog * 6) + (cor * 2.5) + (sib * 4);
  const intensity = min < 20 ? Math.min(40, Math.sqrt(raw) * 4) : Math.min(100, Math.sqrt(raw) * 6 - (red ? 10 : 0));

  const xg = (sog * 0.12) + (sib * 0.18);
  const lf = getLeagueFactor(match.league_name);
  const draw = min > 80 && hs === as ? 6 : 0;

  let o05 = tg ? 90 - Math.max(0, min - 60) * 1.5 : 85 - min * 0.3 + intensity * 0.1;
  let o15 = tg >= 2 ? 88 - Math.max(0, min - 60) * 1.8 : 75 - min * 0.4 + intensity * 0.08;

  o05 = Math.max(5, Math.min(92, o05));
  o15 = Math.max(5, Math.min(92, o15));

  return {
    match_id: match.match_id,
    home_team: match.home_team,
    away_team: match.away_team,
    score: `${hs}-${as}`,
    minute: min,
    status: match.status,
    league: match.league,
    intensity: Math.round(intensity),
    xg_proxy: +xg.toFixed(2),
    league_factor: lf,
    draw_pressure: draw,

    over_05: o05,
    over_15: o15,
    over_25: calcOver25(tg, min, intensity, lf, draw),
    over_35: clamp(45 + tg * 3 - min * 0.5 + xg * 20),
    over_45: clamp(30 + tg * 2.5 - min * 0.6),
    over_55: clamp(20 + tg * 2 - min * 0.7),

    btts: hs && as ? 85 : tg ? Math.min(78, 58 + intensity * 0.15) : 35,
    next_goal: min > 85 ? Math.min(82, 60 + intensity * 0.25) : Math.min(92, 70 + (90 - min) * 0.3),
    confidence: calcConfidence(tg, min, intensity, lf, draw)
  };
}

function calcOver25(tg, min, int, lf, dr) {
  let p = 50 + int * 0.15 + lf + dr;
  if (tg >= 3) return 92;
  if (tg === 2) p += 25;
  if (tg === 1) p += 10;
  if (min > 75) p += 20;
  return Math.max(5, Math.min(92, p));
}

function calcConfidence(tg, min, int, lf, dr) {
  let c = 60 + Math.abs(lf * 0.5) + dr * 0.5;
  if (tg >= 2) c += 15;
  c += min * 0.25 + int * 0.1;
  return Math.max(55, Math.min(85, c));
}

function clamp(v) {
  return Math.max(5, Math.min(92, v));
}

export function getFlag(c) {
  const f = { England:'🏴', Spain:'🇪🇸', Italy:'🇮🇹', Germany:'🇩🇪', France:'🇫🇷' };
  return f[c] || '⚽';
}

export function formatPKT(utc) {
  const d = new Date(new Date(utc).getTime() + 5 * 3600000);
  return d.toLocaleTimeString('pk-PK', { hour:'2-digit', minute:'2-digit', hour12:false });
}
