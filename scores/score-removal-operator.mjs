// Draft owner-operated moderation helper; no HTTP routes, no automatic actions.
// Caller must supply an authenticated, authorized PostgreSQL connection and
// independently verified case. Do not pass an untrusted public report directly.
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
function tuple(v) {
  if (!v || typeof v.initials !== 'string' || !/^[A-Z0-9]{1,3}$/.test(v.initials) ||
      !Number.isSafeInteger(v.points) || v.points < 0 || v.points > 2147483647 ||
      !Number.isSafeInteger(v.milliseconds) || v.milliseconds <= 0 || v.milliseconds > 2147483647)
    throw new Error('Invalid exact score tuple');
  return [v.initials,v.points,v.milliseconds];
}
export async function findCandidates(db, value) {
  const params = tuple(value);
  // UUID stays private to operator. A public tuple is NOT proof of ownership.
  const q = await db.query('SELECT id, initials, points, milliseconds FROM campaign_scores WHERE initials=$1 AND points=$2 AND milliseconds=$3 ORDER BY id LIMIT 2',params);
  return {status:q.rows.length===0?'not-found':q.rows.length===1?'unique':'ambiguous',rows:q.rows};
}
export async function removeReviewedScore(client, value, approval) {
  const params = tuple(value);
  if (typeof value.id !== 'string' || !uuid.test(value.id)) throw new Error('Exact reviewed UUID required');
  if (!approval || approval.confirmation !== 'REMOVE_ONE_REVIEWED_SCORE' ||
      typeof approval.caseRef !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(approval.caseRef) ||
      approval.reviewedByAuthorizedOperator !== true ||
      !['verified-player-request','moderation-policy'].includes(approval.basis))
    throw new Error('Independently reviewed case required');
  // This function is not an authentication layer: the caller must be an
  // authorized operator using a dedicated connection, never an HTTP client.
  await client.query('BEGIN');
  try {
    const result = await client.query('DELETE FROM campaign_scores WHERE id=$1 AND initials=$2 AND points=$3 AND milliseconds=$4 RETURNING id',[value.id,...params]);
    if (result.rowCount !== 1) {
      await client.query('ROLLBACK');
      return {status:'not-removed',caseRef:approval.caseRef};
    }
    await client.query('COMMIT');
    return {status:'removed',caseRef:approval.caseRef};
  } catch(e) {
    try { await client.query('ROLLBACK'); } catch {}
    // Operator must re-check after connection/commit ambiguity. No blind retry.
    throw new Error('Removal outcome not confirmed; independently re-check before retry');
  }
}
