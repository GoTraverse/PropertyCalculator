/**
 * market-rate.js
 * Loads the live RBA cash rate and ABS state median prices for tool calculators.
 * Exposes window.MarketRate for use by calculator pages.
 *
 * Usage:
 *   <script src="../market-rate.js" defer></script>
 *   Then in calculator JS:
 *     MarketRate.onReady(function(data) {
 *       document.getElementById('rate').value = data.suggestedRate;
 *     });
 */
(function (w) {
  'use strict';

  // Typical lender margin above cash rate for a standard variable home loan
  var LENDER_MARGIN = 2.15; // % above RBA cash rate

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
  };

  function load() {
    fetch('/.netlify/functions/market-data?action=cashRate')
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.ok || res.rate == null) throw new Error('no rate');

        var cashRate      = parseFloat(res.rate);
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
