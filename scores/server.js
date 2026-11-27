import http from 'node:http';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {validStage} from './score-limits.mjs';

const order = 'points DESC, milliseconds ASC, id ASC';
const origin = 'https://dont-hit-game.onrender.com';

// Keep legacy payloads compatible; explicitly reject non-standard/assisted runs.
// This is a routing safeguard, not cryptographic proof of play.
function standardRun(run) {
  return run && typeof run === 'object' && !Array.isArray(run) &&
    Object.keys(run).every(k => ['id','initials','stages','mode','assisted'].includes(k)) &&
    (!Object.hasOwn(run,'mode') || run.mode === 'standard') &&
    (!Object.hasOwn(run,'assisted') || run.assisted === false) &&
    Array.isArray(run.stages) && run.stages.every(s =>
      s && typeof s === 'object' && !Array.isArray(s) &&
      Object.keys(s).length === 3 &&
      Object.keys(s).every(k => ['stage','score','ms'].includes(k)));
}

export async function createBoard(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS campaign_scores (
    id uuid PRIMARY KEY, initials varchar(3) NOT NULL,
    points integer NOT NULL, milliseconds integer NOT NULL)`);
  await db.query(`CREATE INDEX IF NOT EXISTS campaign_ranking ON campaign_scores (${order})`);

  return http.createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store',
        'Access-Control-Allow-Origin':origin, 'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers':'Content-Type'});
      res.end(JSON.stringify(body));
    };
    try {
      if (req.url !== '/scores') return reply(404, {});
      if (req.method === 'OPTIONS') return reply(204, {});
      if (req.method === 'GET') {
        const result = await db.query(`SELECT initials, points, milliseconds FROM campaign_scores ORDER BY ${order} LIMIT 25`);
        return reply(200, result.rows);
      }
      if (req.method !== 'POST') return reply(405, {});
      if (!req.headers['content-type']?.startsWith('application/json')) return reply(415, {});
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 2048) return reply(413, {});
      }
      let run;
      try { run = JSON.parse(body); } catch { return reply(400, {}); }
      if (!standardRun(run) || typeof run.initials !== 'string' || !/^[A-Z0-9]{1,3}$/.test(run.initials) ||
          typeof run.id !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(run.id) ||
          !Array.isArray(run.stages) || run.stages.length !== 4) return reply(400, {});
      const valid = run.stages.every(validStage);
      if (!valid) return reply(400, {});
      const points = run.stages.reduce((total, s) => total + s.score, 0);
      const ms = run.stages.reduce((total, s) => total + s.ms, 0);
      await db.query('INSERT INTO campaign_scores VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING',
        [run.id, run.initials, points, ms]);
      const result = await db.query(`SELECT position, points, milliseconds, initials FROM
        (SELECT *, row_number() OVER (ORDER BY ${order})::integer AS position FROM campaign_scores) ranked
        WHERE id=$1`, [run.id]);
      const entry = result.rows[0];
      if (entry.points !== points || entry.milliseconds !== ms || entry.initials !== run.initials) return reply(409, {});
      reply(200, {position:entry.position});
    } catch {
      reply(503, {error:'Leaderboard temporarily unavailable'});
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = new pg.Pool({connectionString:process.env.DATABASE_URL});
  const server = await createBoard(db);
  server.listen(Number(process.env.PORT || 3000), '0.0.0.0');
}
