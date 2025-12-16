


import express from 'express';
import fetch from 'node-fetch';
import { CONFIG, MATCHES, PREDICTIONS } from './config.js';
import { realPredict, extractStatistics, getFlag, formatPKT, groupMatchesByDate } from './core.js';

const app=express();
app.use(express.static('.'));
app.use(express.json());

const API_KEY=CONFIG.apiKey;

app.get('/api/matches', async (req,res)=>{
  await fetchMatchesNext6Days();
  res.json({
    matches_by_date: groupMatchesByDate(MATCHES),
    predictions: PREDICTIONS,
    stats: { totalMatches: MATCHES.length, liveMatches:PREDICTIONS.length, highConfidence:PREDICTIONS.filter(p=>p.confidence>=80).length }
  });
});

async function fetchMatchesNext6Days(){
  try{
    MATCHES.length=0;
    PREDICTIONS.length=0;

    const today=new Date();
    for(let i=0;i<6;i++){
      const date=new Date(today);
      date.setDate(today.getDate()+i);
      const strDate=date.toISOString().split('T')[0];

      const response=await fetch(`https://v3.football.api-sports.io/fixtures?date=${strDate}`,{
        headers:{'x-rapidapi-key':API_KEY,'x-rapidapi-host':'v3.football.api-sports.io'}
      });
      const data=await response.json();
      data.response.forEach(match=>{
        if(MATCHES.some(m=>m.match_id===match.fixture.id)) return;
        const teams=match.teams;
        const league=match.league;
        const cleanLeagueName=league.name.replace(/[^A-Za-z ]/g,'').trim();

        MATCHES.push({
          match_id:match.fixture.id,
          league:`${getFlag(league.country)} ${league.name}`,
          league_name:cleanLeagueName,
          home_team:teams.home.name,
          away_team:teams.away.name,
          status:match.fixture.status.short||'NS',
          home_score:match.goals?.home??null,
          away_score:match.goals?.away??null,
          minute:match.fixture.status.elapsed||0,
          time:formatPKT(match.fixture.date),
          statistics: extractStatistics(match)
        });

        // LIVE prediction
        const pred=realPredict(MATCHES[MATCHES.length-1]);
        if(pred) PREDICTIONS.push(pred);
      });
    }
  }catch(err){
    console.error('API Error:',err.message);
  }
}

const PORT=process.env.PORT||8080;
app.listen(PORT,'0.0.0.0',()=>console.log(`🚀 Server running on port ${PORT}`));
