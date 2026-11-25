// Conservative envelopes for v4.11, not proof of a genuine play-through.
// Keep synchronized with index.html's loop, spawn and finishStage functions.
export function stageScoreBounds(stage, ms) {
  const t = ms / 1000;
  const factor = 1 + stage * .25;
  // The terminal frame (at most 40 ms) awards no running points.
  const scored = Math.max(0, t - .041);
  const min = 500 + Math.floor((9 * scored + .1 * scored ** 2) * factor) - 1;
  // Running score can be multiplied by five. Right-endpoint integration
  // over frames of <=40 ms can exceed the integral by at most .008*t.
  const running = 5 * (9 * (t + .001) + .1 * (t + .001) ** 2 + .008 * (t + .001)) * factor;
  // Three initial cans, then at most one object per .38 s. A can is worth
  // <=75 points and a close call <=12; neither object can score twice.
  const objects = 4 + Math.floor((t + .001) / .38);
  const max = 500 + Math.ceil(running + 75 * objects) + 1;
  return {min, max};
}

export function validStage(s, i) {
  if (s?.stage !== i || !Number.isInteger(s.score) ||
      !Number.isInteger(s.ms) || s.ms < 29999 || s.ms > 62600) return false;
  const {min, max} = stageScoreBounds(i, s.ms);
  return s.score >= min && s.score <= max;
}
