import test from 'node:test';
import assert from 'node:assert/strict';
import {stageScoreBounds, validStage} from './score-limits.mjs';

test('reject impossible scores and malformed stages', () => {
  for (let stage=0; stage<4; stage++) {
    for (const ms of [29999, 30000, 46000, 62600]) {
      const {min,max} = stageScoreBounds(stage, ms);
      assert.equal(validStage({stage,ms,score:min}, stage), true);
      assert.equal(validStage({stage,ms,score:max}, stage), true);
      for (const score of [500, min-1, max+1, 50000, NaN, '1500'])
        assert.equal(validStage({stage,ms,score}, stage), false);
    }
  }
  for (const value of [null, {}, {stage:0,ms:29998,score:1200}, {stage:0,ms:62601,score:1200}, {stage:1,ms:30000,score:1200}])
    assert.equal(validStage(value, 0), false);
});

test('envelope includes simulated legal extreme scoring paths', () => {
  for (let stage=0; stage<4; stage++) {
    for (const dt of [.001, .0167, .04]) {
      for (const throttle of [.48, .7, 1]) {
        for (const multiplier of [1,5]) {
          let t=0, progress=0, points=0, spawn=0;
          while (progress<30) {
            t+=dt; progress+=dt*throttle;
            if (progress>=30) break;
            points+=dt*(9+t*.2)*(1+stage*.25)*multiplier;
            if (multiplier===5) {
              spawn-=dt;
              if(spawn<=0){points+=75;spawn=.38;}
            }
          }
          if (multiplier===5) points+=225;
          assert.equal(validStage({stage,ms:Math.round(t*1000),score:500+Math.floor(points)},stage),true);
        }
      }
    }
  }
});
