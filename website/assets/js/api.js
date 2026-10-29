// Thin client for the 5 public API calls (+ certificate verify). The website stores nothing.
(function () {
  const MSG = {
    SLOT_TAKEN: 'This slot was just taken. Please pick another.',
    PILOT_UNAVAILABLE: 'That pilot is no longer available on this date. Please pick another.',
    RATE_LIMIT: 'Too many requests. Please wait a minute and try again.',
    NOT_FOUND: 'We could not find a booking with those details.',
    PAST_DATE: 'Please pick today or a future date.',
  };

  async function call(path, opts = {}) {
    let res;
    try {
      res = await fetch(QT.API + path, {
        ...opts,
        headers: { 'x-api-key': QT.KEY, 'content-type': 'application/json' },
      });
    } catch {
      throw { code: 'NETWORK', message: 'We could not reach the booking service. Please check your connection.' };
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.success === false) {
      throw { code: body.code, message: MSG[body.code] || body.message || 'Something went wrong.', details: body.details };
    }
    return body.data;
  }

  window.api = {
    pilots: (q = '') => call('/public/pilots' + q),
    availability: (date, city) => call(`/public/availability?date=${date}${city ? '&city=' + encodeURIComponent(city) : ''}`),
    book: (data) => call('/public/bookings', { method: 'POST', body: JSON.stringify(data) }),
    track: (id, token) => call(`/public/bookings/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`),
    enquire: (data) => call('/public/enquiries', { method: 'POST', body: JSON.stringify(data) }),
    verify: (t) => call('/public/certificates/verify/' + encodeURIComponent(t)),
  };

  window.toast = (msg) => {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3500);
  };
  window.$ = (s, r = document) => r.querySelector(s);
  window.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
})();
