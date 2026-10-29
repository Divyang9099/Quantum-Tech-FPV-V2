// Booking wizard widget. Mounts into any element; all classes are prefixed qtb- so it can live inside WordPress/Elementor.
window.QTBooking = (function () {
  const state = { step: 1, type: '', city: '', date: '', pilot: null, slot: null, lists: null, avail: null, result: null, errors: {} };
  let root;
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  function stepsBar() {
    const names = ['Project & city', 'Date', 'Pilot & slot', 'Your details'];
    return `<div class="qtb-steps">${names.map((n, i) => `<div class="qtb-step ${state.step === i + 1 ? 'on' : state.step > i + 1 ? 'done' : ''}"><i>${state.step > i + 1 ? '✓' : i + 1}</i>${n}</div>`).join('')}</div>`;
  }
  const opts = (items, key) => `<div class="qtb-opts">${items.map((x) => `<button type="button" class="qtb-opt ${state[key] === x.name ? 'sel' : ''}" data-k="${key}" data-v="${esc(x.name)}">${esc(x.name)}</button>`).join('')}</div>`;
  const nav = (back, next, nextLabel = 'Continue', ok = true) =>
    `<div class="qtb-nav">${back ? '<button type="button" class="btn btn-outline" data-act="back">← Back</button>' : '<span></span>'}<button type="button" class="btn btn-primary" data-act="${next}" ${ok ? '' : 'disabled'}>${nextLabel}</button></div>`;

  function render() {
    if (!state.lists) { root.innerHTML = '<div class="panel panel-pad"><div class="skel"></div><div class="skel"></div></div>'; return; }
    let body = '';
    if (state.step === 1) {
      body = `<h3 style="margin-top:0">What is the project?</h3>${opts(state.lists.projectTypes, 'type')}
        <h3>Which city?</h3>${opts(state.lists.cities, 'city')}${nav(false, 'to2', 'Continue', state.type && state.city)}`;
    } else if (state.step === 2) {
      body = `<h3 style="margin-top:0">When do you need the pilot?</h3><div class="field" style="max-width:280px"><input type="date" id="qtb-date" min="${todayStr()}" value="${state.date}"></div>
        <p style="color:var(--muted);font-size:14px">Slots are shown live. Pick any day from today onwards.</p>${nav(true, 'to3', 'Show available slots', !!state.date)}`;
    } else if (state.step === 3) {
      body = `<h3 style="margin-top:0">Pick a free slot · ${fmt(state.date)}</h3>
        <div class="qtb-legend"><span><i></i>Free</span><span><i style="background:#F1F5F9;border-color:#E2E8F0"></i>Booked</span><span><i style="background:var(--primary);border-color:var(--primary)"></i>Your pick</span><span class="chip" style="padding:2px 10px"><span class="dot"></span>Live</span></div>
        ${state.error ? `<div class="alert warn">${esc(state.error)}</div>` : ''}
        <div id="qtb-grid">${gridHtml()}</div>${nav(true, 'to4', 'Continue', !!state.slot)}`;
    } else if (state.step === 4) {
      const f = state.form || {}; const e = state.errors;
      const fld = (id, label, type = 'text', ph = '') => `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" placeholder="${ph}" value="${esc(f[id] || '')}">${e[id] ? `<div class="err">${esc(e[id])}</div>` : ''}</div>`;
      const slot = state.avail.slots.find((s) => s.id === state.slot.slotId);
      body = `<div class="summary"><b>${esc(state.type)}</b> in ${esc(state.city)} · ${fmt(state.date)} · ${esc(slot?.name || '')} · Pilot <b class="mono">${esc(state.pilot.code)}</b> (${esc(state.pilot.level)})</div>
        ${state.error ? `<div class="alert bad">${esc(state.error)}</div>` : ''}
        <div class="row2">${fld('name', 'Your name')}${fld('company', 'Company (optional)')}</div>
        <div class="row2">${fld('phone', 'Mobile number', 'tel', '98765 43210')}${fld('email', 'Email', 'email', 'you@company.com')}</div>
        <div class="field"><label for="notes">Notes (optional)</label><textarea id="notes" rows="3" placeholder="Site details, deliverables, anything we should know">${esc(f.notes || '')}</textarea></div>
        ${nav(true, 'submit', state.busy ? 'Booking…' : 'Confirm booking', !state.busy)}`;
    } else {
      const r = state.result;
      const link = `${new URL('track.html', location.href).href}?id=${r.bookingId}&t=${r.token}`;
      root.innerHTML = `<div class="panel panel-pad confirm"><div class="tick">✓</div><h2 style="margin:0">Booking confirmed</h2>
        <p style="color:var(--muted)">We have sent the details to ${esc(state.form.email)}.</p>
        <div class="idbox"><span>Booking ID</span><b class="mono">${r.bookingId}</b><button class="btn btn-outline" data-act="copy" style="padding:6px 12px">Copy</button></div>
        <p style="color:var(--muted);font-size:14px;margin:0 0 6px">Tracking code: <b class="mono">${r.token}</b></p>
        <div class="summary" style="text-align:left;max-width:520px;margin:18px auto"><b>${esc(state.type)}</b> · ${esc(state.city)}<br>${fmt(state.date)} · Pilot <b class="mono">${esc(state.pilot.code)}</b></div>
        <a class="btn btn-primary" href="${link}">Track this booking</a> &nbsp; <button class="btn btn-outline" data-act="again">Book another</button></div>`;
      return;
    }
    root.innerHTML = `<div class="panel panel-pad">${stepsBar()}${body}</div>`;
  }

  function gridHtml() {
    if (state.loading) return '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
    const a = state.avail;
    if (!a || !a.pilots.length) return '<div class="alert warn">No pilots are available on this date. Please try another day.</div>';
    return `<table class="qtb-grid"><thead><tr><th>Pilot</th>${a.slots.map((s) => `<th>${esc(s.name.split(' (')[0])}<br><span style="text-transform:none;letter-spacing:0">${s.startTime}–${s.endTime}</span></th>`).join('')}</tr></thead><tbody>
      ${a.pilots.map((p) => `<tr><td class="qtb-pilot"><b>${esc(p.code)}</b>${p.name ? ' ' + esc(p.name) : ''}<small>${esc(p.level)} · ${esc(p.baseCity)}</small></td>${p.slots.map((s) => {
        const sel = state.slot && state.slot.pilotId === p.id && state.slot.slotId === s.slotId;
        return `<td class="qtb-cell"><button type="button" class="qtb-slot ${s.status === 'booked' ? 'booked' : ''} ${sel ? 'sel' : ''}" data-p="${p.id}" data-s="${s.slotId}" ${s.status === 'booked' ? 'disabled' : ''}>${s.status === 'booked' ? 'Booked' : sel ? '✓ Selected' : 'Free'}</button></td>`;
      }).join('')}</tr>`).join('')}</tbody></table>`;
  }

  async function loadAvail(keepSel) {
    state.loading = !state.avail;
    try {
      state.avail = await api.availability(state.date, state.city);
      // If someone else just took the slot we selected, say so.
      if (keepSel && state.slot) {
        const p = state.avail.pilots.find((x) => x.id === state.slot.pilotId);
        const s = p && p.slots.find((x) => x.slotId === state.slot.slotId);
        if (!s || s.status === 'booked') { state.slot = null; state.pilot = null; state.error = 'The slot you picked was just taken. Please choose another.'; }
      }
    } catch (e) { state.error = e.message; }
    state.loading = false;
    if (state.step === 3) { const g = $('#qtb-grid'); if (g) { g.innerHTML = gridHtml(); } else render(); }
  }

  function validate() {
    const g = (id) => (($('#' + id) || {}).value || '').trim();
    state.form = { name: g('name'), company: g('company'), phone: g('phone'), email: g('email'), notes: g('notes') };
    const e = {};
    if (state.form.name.length < 2) e.name = 'Please enter your name.';
    if (!/^(\+91[\s-]?)?[6-9]\d{9}$/.test(state.form.phone.replace(/\s/g, ''))) e.phone = 'Enter a valid 10-digit mobile number.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(state.form.email)) e.email = 'Enter a valid email address.';
    state.errors = e;
    return !Object.keys(e).length;
  }

  async function onClick(ev) {
    const t = ev.target.closest('button'); if (!t) return;
    state.error = '';
    if (t.dataset.k) { state[t.dataset.k] = t.dataset.v; return render(); }
    if (t.classList.contains('qtb-slot')) {
      state.slot = { pilotId: t.dataset.p, slotId: t.dataset.s };
      state.pilot = state.avail.pilots.find((p) => p.id === t.dataset.p);
      $('#qtb-grid').innerHTML = gridHtml(); root.querySelector('[data-act="to4"]').disabled = false; return;
    }
    const act = t.dataset.act; if (!act) return;
    if (act === 'back') { state.step--; return render(); }
    if (act === 'to2') { state.step = 2; return render(); }
    if (act === 'to3') { state.step = 3; state.avail = null; state.slot = null; render(); return loadAvail(); }
    if (act === 'to4') { state.step = 4; return render(); }
    if (act === 'copy') { navigator.clipboard?.writeText(state.result.bookingId); return toast('Booking ID copied'); }
    if (act === 'again') { Object.assign(state, { step: 1, date: '', slot: null, pilot: null, result: null, form: null, avail: null }); return render(); }
    if (act === 'submit') {
      if (!validate()) return render();
      state.busy = true; render();
      try {
        state.result = await api.book({ pilotId: state.slot.pilotId, slotId: state.slot.slotId, date: state.date, projectType: state.type, location: state.city, ...state.form });
        state.step = 5;
      } catch (e) {
        if (e.code === 'SLOT_TAKEN' || e.code === 'PILOT_UNAVAILABLE') {
          // Friendly recovery: keep the typed details, go back to the grid, refresh it.
          state.step = 3; state.slot = null; state.error = e.message; state.avail = null; state.busy = false; render(); await loadAvail();
          const g = root.querySelectorAll('.qtb-slot.booked'); g.forEach((b) => b.classList.add('shake')); return;
        }
        state.error = e.message;
        if (e.details) state.errors = Object.fromEntries(Object.entries(e.details).map(([k, v]) => [k, v[0]]));
      }
      state.busy = false; render();
    }
  }

  async function mount(sel) {
    root = $(sel);
    const q = new URLSearchParams(location.search);
    root.addEventListener('click', onClick);
    root.addEventListener('change', (e) => { if (e.target.id === 'qtb-date') { state.date = e.target.value; render(); } });
    render();
    try { const d = await api.pilots(); state.lists = d; if (q.get('type')) state.type = q.get('type'); }
    catch (e) { root.innerHTML = `<div class="alert bad">${esc(e.message)}</div>`; return; }
    render();
    // Live: when anything changes for our date, refresh the grid in place.
    live({ 'booking.created': (d) => { if (state.step === 3 && d.date === state.date) loadAvail(true); }, 'booking.cancelled': (d) => { if (state.step === 3 && d.date === state.date) loadAvail(true); }, 'availability.changed': (d) => { if (state.step === 3 && d.date === state.date) loadAvail(true); } }, { poll: () => state.step === 3 && loadAvail(true) });
  }
  return { mount };
})();
