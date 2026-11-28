import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {findCandidates,removeReviewedScore} from './score-removal-operator.mjs';
const a={id:'00000000-0000-4000-8000-000000000001',initials:'QA',points:123,milliseconds:456};
const b={...a,id:'00000000-0000-4000-8000-000000000002'};
const approval={caseRef:'fixture_case_1',confirmation:'REMOVE_ONE_REVIEWED_SCORE',reviewedByAuthorizedOperator:true,basis:'verified-player-request'};
test('invalid input and missing review never contact database',async()=>{
 const db={query(){throw new Error('must not query')}};
 await assert.rejects(findCandidates(db,{...a,points:'123'}),/Invalid exact/);
 await assert.rejects(removeReviewedScore(db,a,{}),/reviewed case/);
 await assert.rejects(removeReviewedScore(db,{...a,id:'bad'},approval),/UUID/);
});
test('disposable postgres: ambiguous tuples, exact deletion, stale match and idempotent absence',async()=>{
 // Hard-coded isolated CI fixture; deliberately never consult DATABASE_URL.
 const c=new pg.Client({host:'127.0.0.1',port:54329,user:'rto_fixture',password:'disposable_fixture_only',database:'rto_fixture'});
 await c.connect();
 try {
   await c.query('CREATE TEMP TABLE campaign_scores (id uuid PRIMARY KEY, initials varchar(3) NOT NULL, points integer NOT NULL, milliseconds integer NOT NULL)');
   for(const v of [a,b]) await c.query('INSERT INTO campaign_scores VALUES($1,$2,$3,$4)',[v.id,v.initials,v.points,v.milliseconds]);
   assert.equal((await findCandidates(c,a)).status,'ambiguous');
   assert.equal((await removeReviewedScore(c,{...a,points:124},approval)).status,'not-removed');
   assert.equal((await findCandidates(c,a)).rows.length,2);
   assert.equal((await removeReviewedScore(c,a,approval)).status,'removed');
   assert.equal((await findCandidates(c,a)).status,'unique');
   assert.equal((await findCandidates(c,a)).rows[0].id,b.id);
   assert.equal((await removeReviewedScore(c,a,approval)).status,'not-removed');
   assert.equal((await findCandidates(c,{...a,points:999})).status,'not-found');
   // Force failure within transaction; rollback must preserve unrelated rows.
   await c.query('ALTER TABLE campaign_scores ADD CONSTRAINT positive_points CHECK (points>0)');
   await c.query("CREATE FUNCTION pg_temp.block_remove() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$");
   await c.query('CREATE TRIGGER block_remove BEFORE DELETE ON campaign_scores FOR EACH ROW EXECUTE FUNCTION pg_temp.block_remove()');
   await assert.rejects(removeReviewedScore(c,b,approval),/not confirmed/);
   assert.equal((await findCandidates(c,b)).rows[0].id,b.id);
 } finally {await c.end();}
});
