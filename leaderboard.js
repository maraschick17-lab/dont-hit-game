(() => {
  const endpoint = 'https://dont-hit-scores.onrender.com/scores';
  const dialog = document.querySelector('#scoreboard');
  const status = dialog.querySelector('[role=status]');
  const form = dialog.querySelector('form');
  const list = dialog.querySelector('ol');
  const input = form.elements.initials;
  let pending;
  try { pending = JSON.parse(localStorage.getItem('dh_pending_campaign')); } catch {}
  function persist(run) {
    pending = run;
    try {
      if (run) localStorage.setItem('dh_pending_campaign', JSON.stringify(run));
      else localStorage.removeItem('dh_pending_campaign');
    } catch {}
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
    form.hidden = !pending;
    list.replaceChildren();
    status.textContent = message || 'Loading scores…';
    try {
      const response = await fetch(endpoint, {signal:AbortSignal.timeout(65000)});
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
    if (!pending) return;
    const run = pending;
    const submit = form.querySelector('button');
    submit.disabled = true;
    status.textContent = 'Posting score…';
    ++generation;
    try {
      const result = await fetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...run, initials:input.value.trim().toUpperCase()}), signal:AbortSignal.timeout(65000)});
      if (!result.ok) throw Error();
      const {position} = await result.json();
      if (pending?.id === run.id) persist(null);
      if (dialog.open) await show('Your global rank: #' + position);
    } catch {
      status.textContent = 'Score could not be posted. Your run is saved for another try.';
    } finally { submit.disabled = false; }
  };
  document.addEventListener('click', e => {
    if (e.target.closest('[data-scores]')) show();
  });
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
})();
