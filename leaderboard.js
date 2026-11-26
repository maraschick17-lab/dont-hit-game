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
  let posting = false;
  let pending;
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
    submit.disabled = posting;
  }
  async function request(options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 65000);
    try {
      return await fetch(endpoint, {...options, signal:controller.signal});
    } finally { clearTimeout(timer); }
  }
  window.rememberCampaign = stages => {
    if (stages.length !== 4 || !stages.every((stage, index) => stage.stage === index)) return;
    persist({id:crypto.randomUUID(), stages:stages.map(s => ({
      stage:s.stage, score:s.score, ms:Math.round(s.seconds * 1000)
    }))});
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
    if (!pending || posting) return;
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
        status.textContent = 'This finish was rejected. Complete a new campaign to post another score.';
        return;
      }
      if (!result.ok) throw Error();
      const {position} = await result.json();
      if (!Number.isInteger(position) || position < 1) throw Error();
      if (pending?.id === run.id) persist(null);
      if (dialog.open) await show('Your global rank: #' + position);
    } catch {
      status.textContent = 'Score could not be posted. Your run is saved for another try.';
    } finally { posting = false; syncForm(); }
  };
  document.addEventListener('click', e => {
    if (e.target.closest('[data-scores]')) show();
  });
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
})();
