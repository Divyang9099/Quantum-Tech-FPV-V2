// Shared header + footer (same on every page). Menu follows quantumtechfpv.com plus the new services.
(function () {
  const R = QT.REAL_SITE;
  const page = location.pathname.split('/').pop() || 'index.html';
  const link = (href, label, ext) =>
    `<a href="${href}" ${ext ? 'target="_blank" rel="noopener"' : ''} class="${!ext && page === href ? 'active' : ''}">${label}</a>`;

  document.title = (document.title ? document.title + ' · ' : '') + 'Quantum Tech FPV';
  document.head.insertAdjacentHTML('beforeend', '<meta name="robots" content="noindex,nofollow"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">');

  $('#site-header').outerHTML = `
  <div class="topbar"><div class="container"><span>📍 Fatima Nagar, Pune</span><span><a href="tel:+919960515892">+91 99605 15892</a> &nbsp;·&nbsp; <a href="mailto:Business@quantumtechfpv.com">Business@quantumtechfpv.com</a></span></div></div>
  <header class="site"><div class="container">
    <a class="logo" href="index.html"><img src="assets/img/logo.png" alt="Quantum Tech FPV"></a>
    <button class="menu-btn" aria-label="Menu" onclick="document.querySelector('nav.main').classList.toggle('open')">☰</button>
    <nav class="main">
      ${link('index.html', 'Home')}
      ${link(R + '/portfolio/', 'Portfolio', 1)}
      ${link(R + '/defence-applications/', 'Defence', 1)}
      ${link(R + '/store/', 'Store', 1)}
      ${link('index.html#training', 'Training')}
      ${link('track.html', 'Track booking')}
      ${link('request.html', 'Contact')}
      <a class="btn btn-primary" href="book.html" style="margin-left:8px;color:#fff">Book a pilot</a>
    </nav>
  </div></header>`;

  $('#site-footer').outerHTML = `
  <footer class="site"><div class="container">
    <div class="cols">
      <div><img src="assets/img/logo.png" alt="" style="height:38px;margin-bottom:14px"><p>Fiber-optic precision. Made in India.<br>Certified FPV pilots, drone platforms and pilot training from Pune.</p></div>
      <div><h4>Contact</h4><span>Store No: 17 &amp; 18, A-Wing, KPCT Mall,<br>Fatimanagar, Pune (Head Office)</span>
        <a href="tel:+919960515892">+91 99605 15892</a><a href="mailto:Business@quantumtechfpv.com">Business@quantumtechfpv.com</a></div>
      <div><h4>Quick links</h4><a href="book.html">Book a pilot</a><a href="track.html">Track a booking</a><a href="request.html">Custom request</a><a href="${R}" target="_blank" rel="noopener">quantumtechfpv.com</a></div>
    </div>
    <div class="legal"><span>© QUANTUMTECH FPV LLP · GST 27AABFQ3848B1ZF</span><span class="demo-tag">Demo preview</span></div>
  </div></footer>`;
})();
