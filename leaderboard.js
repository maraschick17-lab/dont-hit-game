(() => {
  const endpoint = 'https://dont-hit-scores.onrender.com/scores';
  const dialog = document.querySelector('#scoreboard');
  const status = dialog.querySelector('[role=status]');
  const form = dialog.querySelector('form');
  const list = dialog.querySelector('ol');
  const input = form.elements.initials;
  const submit = form.querySelector('button');
  const notice = document.createElement('small');
  notice.textContent = 'Initials are public. Use a nickname, not your real name.';
  form.append(notice);
  const pendingNotice = document.createElement('p');
  pendingNotice.setAttribute('aria-live', 'polite');
  const discard = document.createElement('button');
  discard.type = 'button';
  discard.className = 'alt';
  const cancelDiscard = document.createElement('button');
  cancelDiscard.type = 'button';
  cancelDiscard.className = 'alt';
  cancelDiscard.textContent = 'KEEP SAVED FINISH';
  form.append(pendingNotice, discard, cancelDiscard);
  let posting = false;
  let pending;
  // The current save key and wire payload remain unchanged. A newer finish is
  // held only for this session until the player resolves the older attempt.
  let newerFinish = null;
  let confirmingDiscard = false;
  const nativePending = window.rushNativePending;
  try { pending = JSON.parse(nativePending ? nativePending.get() : localStorage.getItem('dh_pending_campaign')); } catch {}
  function persist(run) {
    pending = run;
    try {
      if (nativePending) nativePending.set(run ? JSON.stringify(run) : null);
      else if (run) localStorage.setItem('dh_pending_campaign', JSON.stringify(run));
      else localStorage.removeItem('dh_pending_campaign');
    } catch {}
  }
  function syncForm() {
    form.hidden = !pending;
    input.readOnly = !!pending?.initials || posting;
    if (pending?.initials) input.value = pending.initials;
    submit.disabled = posting || confirmingDiscard;
    discard.disabled = posting;
    discard.textContent = confirmingDiscard
      ? (newerFinish ? 'CONFIRM REPLACE SAVED FINISH' : 'CONFIRM DISCARD SAVED FINISH')
      : (newerFinish ? 'USE NEWER FINISH INSTEAD' : 'DISCARD SAVED FINISH');
    cancelDiscard.hidden = !confirmingDiscard;
    pendingNotice.textContent = confirmingDiscard
      ? 'This removes the saved retry on this device only. It does not remove a score already accepted by the server.'
      : newerFinish
        ? 'An earlier attempted finish is saved for retry. Your newer finish is available until you leave or reload the game; choose which to post.'
        : pending?.initials ? 'Your attempted finish is saved with the original initials for safe retry.' : '';
  }
  function resolvePending() {
    const replacement = newerFinish;
    newerFinish = null;
    confirmingDiscard = false;
    input.value = '';
    persist(replacement);
    syncForm();
  }
  discard.onclick = () => {
    if (!pending || posting) return;
    if (!confirmingDiscard) {
      confirmingDiscard = true;
      syncForm();
      return;
    }
    resolvePending();
    // No request is made. A previously accepted score remains on the board.
    ++generation;
    status.textContent = pending ? 'Newer finish selected. Post only if you choose.' : 'Saved retry discarded on this device.';
  };
  cancelDiscard.onclick = () => {
    confirmingDiscard = false;
    syncForm();
  };
  async function request(options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 65000);
    try {
      return await fetch(endpoint, {...options, signal:controller.signal});
    } finally { clearTimeout(timer); }
  }
  window.rememberCampaign = stages => {
    if (stages.length !== 4 || !stages.every((stage, index) => stage.stage === index)) return;
    const finish = {id:crypto.randomUUID(), stages:stages.map(s => ({
      stage:s.stage, score:s.score, ms:Math.round(s.seconds * 1000)
    }))};
    if (pending?.initials || posting) {
      // Never silently replace an ambiguous earlier POST with a new UUID.
      newerFinish = finish;
    } else {
      input.value = '';
      persist(finish);
    }
    confirmingDiscard = false;
    syncForm();
  };
  let generation = 0;
  async function show(message = '') {
    const token = ++generation;
    if (!dialog.open) dialog.showModal();
    syncForm();
    list.replaceChildren();
    status.textContent = message || 'Loading scores…';
    try {
      const response = await request();
      if (!response.ok) throw Error();
      const rows = await response.json();
      if (token !== generation) return;
      status.textContent = message || (rows.length ? 'Top campaign finishes' : 'First place is open.');
      for (const row of rows) {
        const item = document.createElement('li');
        item.textContent = row.initials + ' · ' + row.points.toLocaleString() + ' pts · ' + (row.milliseconds / 1000).toFixed(1) + ' s';
        list.append(item);
      }
    } catch {
      if (token === generation) status.textContent = (message ? message + ' ' : '') + 'Scores unavailable. Try again shortly.';
    }
  }
  form.onsubmit = async event => {
    event.preventDefault();
    if (!pending || posting || confirmingDiscard) return;
    const initials = pending.initials || input.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,3}$/.test(initials)) { status.textContent = 'Enter 1–3 letters or digits.'; return; }
    // Keep an identical payload after a timeout, including across reloads.
    const run = {...pending, initials};
    persist(run);
    posting = true;
    syncForm();
    status.textContent = 'Posting score…';
    ++generation;
    try {
      const result = await request({method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify(run)});
      if (result.status === 400 || result.status === 409) {
        status.textContent = 'This finish was rejected. Discard the saved finish or choose your newer finish if available.';
        return;
      }
      if (!result.ok) throw Error();
      const {position} = await result.json();
      if (!Number.isInteger(position) || position < 1) throw Error();
      if (pending?.id === run.id) resolvePending();
      if (dialog.open) await show('Your global rank: #' + position + (pending ? '. Your newer finish is ready to post if you choose.' : ''));
    } catch {
      status.textContent = 'Score could not be posted. Your run is saved for another try.';
    } finally { posting = false; syncForm(); }
  };
  document.addEventListener('click', e => {
    if (e.target.closest('[data-scores]')) show();
  });
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { confirmingDiscard = false; syncForm(); });
  syncForm();
})();
