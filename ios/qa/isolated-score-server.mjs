// Runs only on a GitHub-hosted simulator runner; never uses production Postgres.
import assert from 'node:assert/strict';
import {createBoard} from './score-backend/scores/server.js';

const rows = new Map();
let failFirstRank = true;
const db = {
  async query(sql, params = []) {
    if (/^CREATE /i.test(sql)) return {rows:[]};
    if (sql.startsWith('INSERT INTO campaign_scores')) {
      const [id, initials, points, milliseconds] = params;
      assert.equal(id, '00000000-0000-4000-8000-000000000001');
      assert.equal(initials, 'QA');
      assert.equal(points, 6000);
      assert.equal(milliseconds, 120000);
      const row = {id,initials,points,milliseconds};
      if (rows.has(id)) {
        assert.deepEqual(rows.get(id), row);
        console.log('RETRY QA identical');
      } else {
        rows.set(id,row);
        console.log('INSERT QA first');
      }
      return {rows:[]};
    }
    if (sql.startsWith('SELECT position')) {
      if (failFirstRank) {
        failFirstRank = false;
        throw new Error('Intentional QA transient failure after insert');
      }
      return {rows:[{...rows.get(params[0]),position:1}]};
    }
    if (sql.startsWith('SELECT initials')) {
      return {rows:[...rows.values()].map(({initials,points,milliseconds}) => ({initials,points,milliseconds}))};
    }
    throw new Error('Unexpected QA query');
  }
};
const server = await createBoard(db);
server.listen(18081,'127.0.0.1',() => console.log('Isolated score service ready'));
