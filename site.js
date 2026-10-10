/* Shared behaviour for the Armillaria project sites.
   - sticky bar once the hero leaves the screen
   - reveal-on-scroll (.rv), draw-on-scroll diagrams (.draw), counting figures ([data-count])
   - the hero's live route diagram (canvas.live): scattered points, survey-style routes drawn between
     them in the accent, which settle into hairlines, so the network is always being built.
   Everything degrades to a static page without JS, and holds still under prefers-reduced-motion. */
(function () {
  var doc = document.documentElement;
  doc.classList.remove('no-js');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var css = getComputedStyle(doc);
  var HOT = (css.getPropertyValue('--hot') || '#EF4A26').trim();

  // Sticky bar
  var bar = document.querySelector('.bar');
  var hero = document.querySelector('.hero');
  if (bar && hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (e) { bar.classList.toggle('on', !e[0].isIntersecting); }, { threshold: 0, rootMargin: '-60px 0px 0px 0px' }).observe(hero);
    var links = [].slice.call(bar.querySelectorAll('nav a[href^="#"]'));
    var targets = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });
    var spy = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (en.isIntersecting) {
          links.forEach(function (a, i) { a.classList.toggle('cur', targets[i] === en.target); });
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    targets.forEach(function (t) { if (t) spy.observe(t); });
  }

  // Prepare route lengths for draw-on-scroll
  [].forEach.call(document.querySelectorAll('.draw .route'), function (p) {
    try { p.style.setProperty('--len', Math.ceil(p.getTotalLength()) + 1); } catch (e) {}
  });

  function onView(sel, fn, opts) {
    var els = document.querySelectorAll(sel);
    if (!('IntersectionObserver' in window) || reduce) { [].forEach.call(els, function (el) { fn(el, true); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { fn(en.target); io.unobserve(en.target); } });
    }, opts || { threshold: 0.18 });
    [].forEach.call(els, function (el) { io.observe(el); });
  }
  onView('.rv', function (el) { el.classList.add('in'); }, { threshold: 0.08 });
  onView('.draw', function (el) { el.classList.add('in'); }, { threshold: 0.25 });
  onView('[data-count]', function (el, still) {
    var to = parseFloat(el.getAttribute('data-count')), dec = (el.getAttribute('data-count').split('.')[1] || '').length;
    var fmt = function (v) { return v.toLocaleString('en-GB', { minimumFractionDigits: dec, maximumFractionDigits: dec }); };
    if (still) { el.textContent = fmt(to); return; }
    var t0 = null, dur = 1800;
    function step(t) { if (!t0) t0 = t; var k = Math.min(1, (t - t0) / dur); k = 1 - Math.pow(1 - k, 3); el.textContent = fmt(to * k); if (k < 1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }, { threshold: 0.4 });

  // Hero canvas
  var cv = document.querySelector('canvas.live');
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext('2d'), W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
  var pts = [], routes = [], latent = [], last = 0, running = true;
  var mode = cv.getAttribute('data-mode') || 'routes';
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function size() {
    var r = cv.getBoundingClientRect(); W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }
  function seed() {
    pts = []; routes = []; latent = [];
    var n = Math.round(W * H / 5200);
    for (var i = 0; i < n; i++) pts.push({ x: rnd(0, W), y: rnd(0, H), r: Math.random() < .12 ? 1.6 : .9, lit: 0 });
    var pre = reduce ? 9 : 6;
    for (var k = 0; k < pre; k++) { var rt = makeRoute(); settle(rt); }
    if (!reduce) pts.forEach(function (p) { p.lit = 0; });
  }
  function near(p, used) {
    var best = null, bd = 1e9;
    for (var i = 0; i < pts.length; i++) {
      var q = pts[i]; if (used.indexOf(q) > -1) continue;
      var dx = q.x - p.x, dy = q.y - p.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d > 60 && d < 190 && d < bd && dx > -40) { bd = d; best = q; }
    }
    return best;
  }
  function makeRoute() {
    // start in the right two-thirds, where text is lighter
    var start = null, tries = 0;
    while (!start && tries++ < 40) { var c = pts[Math.floor(Math.random() * pts.length)]; if (c.x > W * .35 || W < 820) start = c; }
    var path = [start], hops = 3 + Math.floor(Math.random() * 3);
    for (var h = 0; h < hops; h++) { var nx = near(path[path.length - 1], path); if (!nx) break; path.push(nx); }
    var len = 0; for (var j = 1; j < path.length; j++) len += Math.hypot(path[j].x - path[j - 1].x, path[j].y - path[j - 1].y);
    return { path: path, len: len, t: 0, age: 0 };
  }
  function settle(rt) { for (var j = 1; j < rt.path.length; j++) latent.push({ a: rt.path[j - 1], b: rt.path[j], life: 1 }); rt.path.forEach(function (p) { p.lit = 1; }); }
  function mask(x) { if (W < 820) return 1; var f = x / W; return f < .28 ? .25 : f < .5 ? .25 + (f - .28) / .22 * .75 : 1; }
  function draw(now) {
    if (!running) return;
    var dt = Math.min(64, now - (last || now)); last = now;
    ctx.clearRect(0, 0, W, H);
    // latent hairlines
    for (var i = latent.length - 1; i >= 0; i--) {
      var l = latent[i]; if (!reduce) l.life -= dt / 26000; if (l.life <= 0) { latent.splice(i, 1); continue; }
      ctx.strokeStyle = 'rgba(159,153,193,' + (0.32 * l.life * mask((l.a.x + l.b.x) / 2)) + ')'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke();
    }
    // points
    for (var k = 0; k < pts.length; k++) {
      var p = pts[k]; if (!reduce && p.lit > 0) p.lit = Math.max(0, p.lit - dt / 9000);
      ctx.fillStyle = p.lit > .05 ? HOT : 'rgba(201,197,218,' + (0.5 * mask(p.x)) + ')';
      ctx.globalAlpha = p.lit > .05 ? Math.min(1, .35 + p.lit) * mask(p.x) : 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.lit > .05 ? p.r + 1.2 : p.r, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
    }
    // active routes
    if (!reduce) {
      if (routes.length < 3 && Math.random() < dt / 900) routes.push(makeRoute());
      for (var r = routes.length - 1; r >= 0; r--) {
        var rt = routes[r];
        if (rt.t < 1) rt.t = Math.min(1, rt.t + dt / (rt.len * 9)); else { rt.age += dt; if (rt.age > 1400) { settle(rt); routes.splice(r, 1); continue; } }
        var target = rt.t * rt.len, acc = 0, a = rt.path[0], head = a;
        ctx.strokeStyle = HOT; ctx.lineWidth = 2; ctx.globalAlpha = mask(a.x) * (rt.age ? 1 - rt.age / 1400 * .6 : 1);
        ctx.beginPath(); ctx.moveTo(a.x, a.y);
        for (var s = 1; s < rt.path.length; s++) {
          var b = rt.path[s], seg = Math.hypot(b.x - a.x, b.y - a.y);
          if (acc + seg <= target) { ctx.lineTo(b.x, b.y); head = b; b.lit = Math.max(b.lit, 1); }
          else { var f = (target - acc) / seg; head = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; ctx.lineTo(head.x, head.y); break; }
          acc += seg; a = b;
        }
        ctx.stroke(); ctx.globalAlpha = 1;
        ctx.fillStyle = HOT; ctx.beginPath(); ctx.arc(head.x, head.y, 3, 0, 6.283); ctx.fill();
      }
    }
    if (!reduce) requestAnimationFrame(draw);
  }
  size(); requestAnimationFrame(draw);
  var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(size, 200); if (reduce) requestAnimationFrame(draw); });
  if ('IntersectionObserver' in window && !reduce) new IntersectionObserver(function (e) { var was = running; running = e[0].isIntersecting; if (running && !was) { last = 0; requestAnimationFrame(draw); } }).observe(cv);
})();

/* Dot fields: <svg class="dots" data-n="1800" data-cols="60" data-hi="0" data-dead="0">.
   Builds n square marks; on view they fill in sequence (hot), with optional highlighted (deep) and
   dead (hollow) marks at the end. Under reduced motion they render filled. */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NS = 'http://www.w3.org/2000/svg';
  [].forEach.call(document.querySelectorAll('svg.dots'), function (svg) {
    var n = +svg.getAttribute('data-n'), cols = +svg.getAttribute('data-cols') || 60;
    var hi = +svg.getAttribute('data-hi') || 0, dead = +svg.getAttribute('data-dead') || 0;
    var fill = svg.getAttribute('data-fill') || '#031838', hiFill = svg.getAttribute('data-hifill') || fill;
    var s = 10, g = 4, rows = Math.ceil(n / cols);
    svg.setAttribute('viewBox', '0 0 ' + (cols * (s + g) - g) + ' ' + (rows * (s + g) - g));
    var marks = [];
    for (var i = 0; i < n; i++) {
      var r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', (i % cols) * (s + g)); r.setAttribute('y', Math.floor(i / cols) * (s + g));
      r.setAttribute('width', s); r.setAttribute('height', s);
      var kind = i >= n - dead ? 'dead' : i < hi ? 'hi' : 'n';
      if (kind === 'dead') { r.setAttribute('fill', 'none'); r.setAttribute('stroke', fill); r.setAttribute('stroke-width', '1.2'); r.setAttribute('stroke-dasharray', '2 2'); }
      else r.setAttribute('fill', kind === 'hi' ? hiFill : fill);
      r.style.opacity = reduce ? 1 : 0.12;
      svg.appendChild(r); marks.push(r);
    }
    if (reduce || !('IntersectionObserver' in window)) { marks.forEach(function (m) { m.style.opacity = 1; }); return; }
    var io = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return; io.disconnect();
      var t0 = null, dur = Math.min(4200, 900 + n * 1.8);
      function step(t) { if (!t0) t0 = t; var k = Math.min(1, (t - t0) / dur), upto = Math.floor(k * n);
        for (var j = 0; j < upto; j++) marks[j].style.opacity = 1; if (k < 1) requestAnimationFrame(step); }
      requestAnimationFrame(step);
    }, { threshold: 0.3 });
    io.observe(svg);
  });
})();
