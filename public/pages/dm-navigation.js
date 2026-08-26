(function () {
  'use strict';
  var routes = {
    home: 'home.html',
    'command-center': 'command-center.html',
    general: 'general.html',
    'hospital-events': 'hospital-events.html',
    'administrative-issues': 'administrative-issues.html',
    'patient-flow': 'patient-flow.html',
    operations: 'operations.html',
    experience: 'experience.html',
    summary: 'summary.html'
  };
  var legacyRoutes = {
    dashboard: 'command-center',
    events: 'hospital-events',
    admin: 'administrative-issues',
    flow: 'patient-flow',
    ops: 'operations'
  };
  var routeFromFile = Object.keys(routes).find(function (key) {
    return location.pathname.toLowerCase().endsWith('/' + routes[key].toLowerCase()) || location.pathname.toLowerCase().endsWith(routes[key].toLowerCase());
  });
  function go(routeKey) {
    var target = routes[routeKey];
    if (!target) { console.warn('[DMNavigation] Unknown route:', routeKey); return; }
    window.location.href = target;
  }
  function wire() {
    document.body.classList.add('dm-int-page');
    window.DMNavigation = { go: go, routes: Object.freeze(routes) };
    var integratedRail = document.querySelector('.dm-integrated-rail');
    if (integratedRail && integratedRail.previousSibling && integratedRail.previousSibling.nodeType === 3) {
      integratedRail.previousSibling.textContent = integratedRail.previousSibling.textContent.replace(/^\+/, '');
    }
    document.querySelectorAll('[data-go]').forEach(function (el) {
      var key = el.getAttribute('data-go');
      var normalized = legacyRoutes[key] || key;
      if (routes[normalized]) {
        el.setAttribute('data-dm-route', normalized);
      }
    });
    document.querySelectorAll('.readiness-item').forEach(function (row) {
      var text = row.textContent;
      var key = text.indexOf('General') >= 0 ? 'general' : text.indexOf('Hospital Events') >= 0 ? 'hospital-events' : text.indexOf('Administrative Issues') >= 0 ? 'administrative-issues' : text.indexOf('Patient Flow') >= 0 ? 'patient-flow' : text.indexOf('Operations') >= 0 ? 'operations' : text.indexOf('Experience') >= 0 ? 'experience' : null;
      if (key) row.setAttribute('data-dm-route', key);
    });
    document.querySelectorAll('[data-dm-route]').forEach(function (el) {
      var key = el.getAttribute('data-dm-route');
      if (!routes[key]) return;
      if (key === routeFromFile) { el.classList.add('active'); el.setAttribute('aria-current', 'page'); }
      if (!el.hasAttribute('tabindex') && !/^(A|BUTTON)$/.test(el.tagName)) el.setAttribute('tabindex', '0');
      el.addEventListener('click', function (event) { event.preventDefault(); go(key); });
      el.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); go(key); } });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
}());

