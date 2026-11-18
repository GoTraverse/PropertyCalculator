/**
 * market-rate.js
 * Loads the live RBA cash rate for tool calculators and turns it into a
 * suggested home loan rate. Exposes window.MarketRate.
 *
 * The suggested rate is NOT a quoted rate. It is the RBA cash rate plus
 * LENDER_MARGIN, and the margin is my own estimate. Any page that shows the
 * suggested rate must show MarketRate.rateNote() with it, so the visitor is
 * told where the figure comes from.
 *
 * Usage:
 *   <script src="../market-rate.js" defer></script>
 *   Then in calculator JS:
 *     MarketRate.onReady(function(data) {
 *       if (!data) return;                       // no live rate: keep the default
 *       var showing = ToolPage.applyLiveRate({ ..., rate: data.suggestedRate });
 *       hintEl.textContent = MarketRate.rateNote(showing);
 *     });
 */
(function (w) {
  'use strict';

  // My estimate of the margin a typical variable owner-occupier home loan
  // carries above the RBA cash rate, in percentage points. It is an
  // assumption with no published source, and no lender quotes it.
  var LENDER_MARGIN = 2.15;

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

  // '2026-11-18' -> '18 November 2026'. Anything else comes back unchanged.
  function plainDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m || !MONTHS[+m[2] - 1]) return iso || '';
    return (+m[3]) + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1];
  }

  var _ready = false;
  var _data  = null;
  var _cbs   = [];

  function notify() {
    _ready = true;
    _cbs.forEach(function (cb) { try { cb(_data); } catch (e) { } });
    _cbs = [];
  }

  w.MarketRate = {
    /**
     * Register a callback to run once market data is loaded.
     * If already loaded, runs immediately.
     */
    onReady: function (cb) {
      if (_ready) { try { cb(_data); } catch (e) { } }
      else _cbs.push(cb);
    },

    /** Synchronous getter — null until loaded. */
    get: function () { return _data; },

    /**
     * The note to show under a rate field this module has offered a rate for.
     * It says what the suggested rate is made of and that it is an estimate.
     * The wording lives here so the tools that use the suggestion cannot
     * drift apart. Returns '' when there is no live rate.
     *   prefilled = true when the field currently holds the suggested rate
     *   (what ToolPage.applyLiveRate returned).
     */
    rateNote: function (prefilled) {
      var d = _data;
      if (!d) return '';
      var cash = d.cashRate.toFixed(2) + '%';
      var sugg = d.suggestedRate.toFixed(2) + '%';
      var pts  = d.lenderMargin.toFixed(2);
      return (prefilled
          ? 'I’ve filled in ' + sugg + ': the RBA cash rate of ' + cash + ' plus ' + pts + ' percentage points.'
          : 'For comparison, the RBA cash rate of ' + cash + ' plus ' + pts + ' percentage points is ' + sugg + '.')
        + ' The ' + pts + ' points is my estimate of the margin on a typical variable owner-occupier loan.'
        + ' No lender has quoted this rate' + (prefilled ? ', so type your own if you have one.' : '.')
        + (d.rateDate ? ' Cash rate as at ' + plainDate(d.rateDate) + '.' : '');
    },
  };

  function load() {
    fetch('/.netlify/functions/market-data?action=cashRate')
      .then(function (r) { return r.json(); })
      .then(function (res) {
        // A 'fallback' source is the server's hardcoded last-resort rate — it can
        // be months stale, so never render it as live market context.
        if (!res.ok || res.rate == null || res.source === 'fallback') throw new Error('no live rate');

        var cashRate      = parseFloat(res.rate);
        if (!isFinite(cashRate)) throw new Error('no live rate');
        var suggestedRate = parseFloat((cashRate + LENDER_MARGIN).toFixed(2));

        _data = {
          cashRate:      cashRate,
          suggestedRate: suggestedRate,
          rateDate:      res.date || '',
          rateSource:    res.source || '',
          lenderMargin:  LENDER_MARGIN,
        };
        notify();
      })
      .catch(function () {
        // Graceful fallback — do not break the page if the function is unavailable
        _data = null;
        notify();
      });
  }

  load();
})(window);
