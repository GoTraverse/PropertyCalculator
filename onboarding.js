/**
 * onboarding.js — first-run guided setup wizard for /app.
 *
 * A blurred-backdrop popup that steps a new visitor through the essentials
 * (state, buyer situation, price, savings, income, loan), then applies the
 * answers to the calculator inputs and drops them onto the Costs tab with
 * real results already showing — so the app feels valuable on the first run.
 *
 * Self-contained: builds its own DOM, injects its own styles, and populates
 * the existing #inp-* fields by dispatching the same events the UI fires, so
 * the app's recalc runs exactly as if the user had typed the values.
 */
(function () {
  'use strict';
  var FLAG = 'propCalc_onboarded_v1';

  // Steps. Each step renders a heading + one or two fields.
  var STEPS = [
    { welcome: true,
      title: "Let's set up your scenario",
      sub: "A few quick questions and we'll show you the full picture — upfront costs, repayments and the 30-year outlook. You can change anything afterwards." },
    { key: 'state', title: 'Which state is the property in?',
      sub: 'This sets your stamp duty and any first-home schemes.',
      field: { type: 'select', id: 'inp-state', options: [
        ['nsw','New South Wales'],['vic','Victoria'],['qld','Queensland'],['sa','South Australia'],
        ['wa','Western Australia'],['tas','Tasmania'],['act','ACT'],['nt','Northern Territory'] ] } },
    { key: 'fhb', title: 'Are you a first home buyer?',
      sub: 'First home buyers often pay little or no stamp duty and can access shared-equity schemes.',
      field: { type: 'toggle', id: 'inp-fhb' } },
    { key: 'price', title: "What's the purchase price?",
      sub: "The price you're paying (or expect to pay) for the property.",
      field: { type: 'money', id: 'inp-price', placeholder: '650,000' } },
    { key: 'savings', title: 'How much have you saved?',
      sub: "Your deposit savings — we'll work out your loan size and LMI from this.",
      field: { type: 'money', id: 'inp-savings', placeholder: '80,000' } },
    { key: 'income', title: 'Your household income',
      sub: 'Combined before-tax income — used to sanity-check what you can comfortably service. (Optional.)',
      field: { type: 'money', id: 'inp-income', placeholder: '120,000' } },
    { key: 'loan', title: 'Your loan',
      sub: 'Sensible starting points — fine-tune them any time.',
      fields: [ { type: 'pct', id: 'inp-rate', label: 'Interest rate', placeholder: '6.25' },
                { type: 'num', id: 'inp-term', label: 'Loan term (years)', placeholder: '30' } ] } ];

  var answers = {}; // key -> value ('inp-fhb' stored as boolean)
  var idx = 0;

  // Funnel instrumentation. window.trackGuest (analytics.js) is a GA4 event with
  // no session gate, so it works for guests and signed-in first-runs alike.
  function track(ev, params){ try { if (typeof window.trackGuest === 'function') window.trackGuest(ev, params || {}); } catch (e) {} }
  function stepKey(){ return (STEPS[idx] && (STEPS[idx].key || 'welcome')) || 'welcome'; }

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  function fieldHtml(f){
    if (f.type === 'select') {
      return '<select class="ob-input" data-target="' + f.id + '">' +
        '<option value="">Select…</option>' +
        f.options.map(function(o){ return '<option value="' + o[0] + '">' + esc(o[1]) + '</option>'; }).join('') +
        '</select>';
    }
    if (f.type === 'toggle') {
      return '<div class="ob-toggle" data-target="' + f.id + '">' +
        '<button type="button" class="ob-choice" data-val="1">Yes</button>' +
        '<button type="button" class="ob-choice" data-val="0">No</button></div>';
    }
    var pre = f.type === 'money' ? '<span class="ob-affix">$</span>' : '';
    var suf = f.type === 'pct' ? '<span class="ob-affix ob-affix-r">%</span>' : '';
    var inputmode = 'decimal';
    return (f.label ? '<label class="ob-label">' + esc(f.label) + '</label>' : '') +
      '<div class="ob-inwrap">' + pre +
      '<input class="ob-input" type="text" inputmode="' + inputmode + '" data-target="' + f.id + '" placeholder="' + (f.placeholder || '') + '">' +
      suf + '</div>';
  }

  function render(){
    var s = STEPS[idx];
    var total = STEPS.length;
    var body;
    if (s.welcome) {
      body = '<div class="ob-logo">EquitySight</div>' +
        '<h2 class="ob-title">' + esc(s.title) + '</h2>' +
        '<p class="ob-sub">' + esc(s.sub) + '</p>';
    } else {
      var fields = s.fields || [s.field];
      body = '<h2 class="ob-title">' + esc(s.title) + '</h2>' +
        '<p class="ob-sub">' + esc(s.sub) + '</p>' +
        '<div class="ob-fields">' + fields.map(fieldHtml).join('') + '</div>';
    }
    var dots = STEPS.map(function(_, i){ return '<span class="ob-dot' + (i === idx ? ' on' : '') + '"></span>'; }).join('');
    var backBtn = idx > 0 ? '<button type="button" class="ob-btn ob-btn-ghost" id="ob-back">Back</button>' : '<span></span>';
    var nextLabel = s.welcome ? 'Get started' : (idx === total - 1 ? 'Show my results' : 'Next');
    var card = document.getElementById('ob-card');
    card.innerHTML = body +
      '<div class="ob-nav">' + backBtn +
        '<button type="button" class="ob-btn ob-btn-primary" id="ob-next">' + nextLabel + ' →</button></div>' +
      '<div class="ob-dots">' + dots + '</div>';

    // restore any previously entered value + focus
    if (!s.welcome) {
      var flds = s.fields || [s.field];
      flds.forEach(function(f){
        var el = card.querySelector('[data-target="' + f.id + '"]');
        if (!el) return;
        var a = answers[f.id];
        if (f.type === 'toggle') {
          card.querySelectorAll('.ob-choice').forEach(function(b){ b.classList.toggle('on', String(a === true ? 1 : (a === false ? 0 : -1)) === b.dataset.val); });
        } else if (a != null) { el.value = a; }
      });
      var first = card.querySelector('input, select'); if (first) setTimeout(function(){ try{ first.focus(); }catch(e){} }, 60);
    }
    wireStep();
  }

  function collectStep(){
    var s = STEPS[idx];
    if (s.welcome) return true;
    var flds = s.fields || [s.field];
    var card = document.getElementById('ob-card');
    flds.forEach(function(f){
      var el = card.querySelector('[data-target="' + f.id + '"]');
      if (!el) return;
      if (f.type === 'toggle') {
        var on = card.querySelector('.ob-choice.on');
        if (on) answers[f.id] = on.dataset.val === '1';
      } else {
        var raw = (el.value || '').replace(/[,\s$%]/g, '');
        if (raw !== '') answers[f.id] = raw;
      }
    });
    return true;
  }

  function wireStep(){
    var card = document.getElementById('ob-card');
    var next = document.getElementById('ob-next');
    var back = document.getElementById('ob-back');
    if (next) next.onclick = function(){ collectStep(); if (idx < STEPS.length - 1) { track('onboarding_step', { step: stepKey(), index: idx }); idx++; render(); } else { finish(); } };
    if (back) back.onclick = function(){ collectStep(); idx--; render(); };
    card.querySelectorAll('.ob-choice').forEach(function(b){
      b.onclick = function(){ card.querySelectorAll('.ob-choice').forEach(function(x){ x.classList.remove('on'); }); b.classList.add('on'); };
    });
    // Enter advances
    card.querySelectorAll('input').forEach(function(inp){
      inp.onkeydown = function(e){ if (e.key === 'Enter') { e.preventDefault(); if (next) next.click(); } };
    });
  }

  function setField(id, value, isCheckbox){
    var el = document.getElementById(id);
    if (!el) return;
    if (isCheckbox) { el.checked = !!value; el.dispatchEvent(new Event('change', { bubbles: true })); return; }
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function toNum(s){ return parseFloat(String(s || '').replace(/−/g, '-').replace(/[^0-9.\-]/g, '')) || 0; }

  // Set the deposit % so the user's savings are fully deployed as deposit
  // (leaving remaining cash ≈ 0). Mirrors the app's own "Max affordable"
  // affordability calc: deposit = savings − upfront costs. Upfront costs are
  // recovered from the invariant remaining = savings − deposit − costs, which
  // holds regardless of the current deposit %, so this needs no assumptions
  // about state, first-home status or scheme — the recalc already applied them.
  function deriveDeposit(done){
    var price = parseFloat((document.getElementById('inp-price') || {}).value) || 0;
    var savings = parseFloat((document.getElementById('inp-savings') || {}).value) || 0;
    if (price <= 0 || savings <= 0) { if (done) done(); return; }
    var tries = 0;
    (function poll(){
      // Wait for the debounced recalc to render our numbers before reading them:
      // cb-savings mirrors the savings input once recalc has run. Polling this
      // avoids reading stale placeholder text on a slow device (previously a
      // fixed 280ms guess).
      var shown = toNum((document.getElementById('cb-savings') || {}).textContent);
      if (Math.abs(shown - savings) < 1 || tries >= 15) {
        var depNow = toNum((document.getElementById('cr-deposit') || {}).textContent);
        var remNow = toNum((document.getElementById('cb-remaining') || {}).textContent);
        var costs = savings - depNow - remNow;               // stable upfront costs
        var pct = (savings - costs) / price * 100;
        pct = Math.floor(pct * 2) / 2;                        // floor to 0.5% → remaining stays ≥ 0
        pct = Math.max(2, Math.min(20, pct));                // app input bounds
        setField('inp-depp', String(pct));
        if (done) setTimeout(done, 140);                      // let the deposit change recalc
      } else { tries++; setTimeout(poll, 60); }
    })();
  }

  function gotoCosts(){
    var costs = document.querySelector('.tab[data-tab="costs"]');
    if (costs) { costs.click(); if (costs.scrollIntoView) costs.scrollIntoView({ block: 'nearest' }); }
  }

  function finish(){
    track('onboarding_completed', { fields: Object.keys(answers).length });
    // Apply collected answers to the calculator inputs.
    Object.keys(answers).forEach(function(id){
      if (id === 'inp-fhb') setField(id, answers[id], true);
      else setField(id, answers[id]);
    });
    // Sensible defaults if the user left the loan step blank.
    var rate = document.getElementById('inp-rate'); if (rate && !parseFloat(rate.value)) setField('inp-rate', '6.25');
    var term = document.getElementById('inp-term'); if (term && !parseFloat(term.value)) setField('inp-term', '30');
    try { localStorage.setItem(FLAG, '1'); } catch (e) {}
    close();
    // Once recalc has applied the numbers, size the deposit to their savings and
    // reveal the Costs tab so a coherent, personalised result is the payoff — then,
    // for a guest, surface the soft signup nudge at this high-intent value moment.
    deriveDeposit(function(){
      gotoCosts();
      setTimeout(function(){ try { if (typeof window.maybeShowGuestBanner === 'function') window.maybeShowGuestBanner(); } catch (e) {} }, 650);
    });
  }

  function close(){
    try {
      localStorage.setItem(FLAG, '1');
      // The legacy 2-button splash may have been scheduled by app.js before we
      // loaded; mark it seen and hide it so it never surfaces behind us.
      localStorage.setItem('propCalc_splash_seen', '1');
      var sp = document.getElementById('welcome-splash'); if (sp) sp.style.display = 'none';
    } catch (e) {}
    var ov = document.getElementById('ob-overlay');
    if (ov) { ov.classList.add('ob-hide'); setTimeout(function(){ if (ov.parentNode) ov.parentNode.removeChild(ov); }, 300); }
  }

  function skip(){
    track('onboarding_skipped', { step: stepKey(), index: idx });
    close();
  }

  function build(){
    var ov = document.createElement('div');
    ov.id = 'ob-overlay';
    ov.innerHTML = '<div class="ob-card" id="ob-card"></div>' +
      '<button type="button" class="ob-skip" id="ob-skip">Skip — I’ll fill it in myself</button>';
    document.body.appendChild(ov);
    document.getElementById('ob-skip').onclick = skip;
    track('onboarding_shown', {});
    render();
  }

  function shouldShow(){
    try {
      if (localStorage.getItem(FLAG)) return false;             // already onboarded
      if (localStorage.getItem('propCalc_splash_seen')) return false; // returning user
      var draft = localStorage.getItem('propCalc_draft_v1');
      if (draft && draft !== 'null' && draft.length > 4) return false; // work in progress
      var price = document.getElementById('inp-price');
      if (!price) return false;                       // only on the app page
      if (parseFloat(price.value) > 0) return false;  // a scenario is already loaded
      return true;
    } catch (e) { return false; }
  }

  function start(){
    if (!shouldShow()) return;
    // Remove the legacy welcome splash outright on first run. It renders at a
    // higher z-index than us and would otherwise sit on top of the wizard (or
    // ghost through our translucent backdrop). Removing the element makes
    // app.js's deferred showWelcomeSplash() a harmless no-op.
    try { var sp = document.getElementById('welcome-splash'); if (sp && sp.parentNode) sp.parentNode.removeChild(sp); } catch (e) {}
    setTimeout(build, 120);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
