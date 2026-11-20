/* 3D feel: perspective tilt + glare on cards/panels, parallax scene depth. CSSOM only (strict CSP). */
(function () {
  'use strict';
  var reduce = false, fine = true;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; fine = matchMedia('(hover: hover)').matches; } catch (e) {}
  if (reduce || !fine || (matchMedia && matchMedia('(pointer: coarse)').matches)) return;
  var SEL = '.cardtile, .fcard, .card, .section, .stat, .pathcard';
  var cur = null, raf = 0, ev = null;
  function apply() {
    raf = 0; if (!cur || !ev) return;
    var r = cur.getBoundingClientRect(); if (!r.width) return;
    var x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
    var big = r.width > 420, k = big ? 3 : 12;
    cur.style.transform = 'perspective(900px) rotateX(' + ((.5 - y) * k).toFixed(2) + 'deg) rotateY(' + ((x - .5) * k).toFixed(2) + 'deg) translateZ(' + (big ? 0 : 8) + 'px)';
    cur.style.setProperty('--gx', (x * 100).toFixed(0) + '%'); cur.style.setProperty('--gy', (y * 100).toFixed(0) + '%');
  }
  function reset(el) { if (!el) return; el.style.transform = ''; el.classList.remove('tilting'); }
  if (fine) {
    document.addEventListener('pointermove', function (e) {
      var t = e.target && e.target.closest ? e.target.closest(SEL) : null;
      if (t !== cur) { reset(cur); cur = t; if (cur) cur.classList.add('tilting'); }
      ev = e; if (cur && !raf) raf = requestAnimationFrame(apply);
    }, { passive: true });
    document.addEventListener('pointerleave', function () { reset(cur); cur = null; }, true);
  }
  // parallax depth for layered scenes (data-depth on children of .scene3d)
  document.addEventListener('pointermove', function (e) {
    var s = document.querySelector('.scene3d'); if (!s) return;
    var mx = e.clientX / innerWidth - .5, my = e.clientY / innerHeight - .5;
    s.style.setProperty('--rx', (my * -6).toFixed(2) + 'deg'); s.style.setProperty('--ry', (mx * 8).toFixed(2) + 'deg');
  }, { passive: true });
  // scroll-in: panels rise out of the page
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in3d'); io.unobserve(e.target); } }); }, { threshold: .05 });
    var seen = new WeakSet();
    function scan() { document.querySelectorAll('.card, .section, .cardtile, .fcard').forEach(function (n) { if (!seen.has(n)) { seen.add(n); n.classList.add('rise3d'); io.observe(n); } }); }
    new MutationObserver(function () { scan(); }).observe(document.body, { childList: true, subtree: true }); scan();
  }
})();
