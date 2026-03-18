/**
 * suburb-insights.js
 * Loads live Domain API market data for suburb insight pages.
 * Reads suburb/state from data attributes on #suburb-live-section.
 * Injects: median sale price, number of sales, median rent, yield, annual growth.
 */
(function () {
  'use strict';

  function fmt(n) {
    if (n == null) return '—';
    return '$' + Math.round(n).toLocaleString('en-AU');
  }
  function fmtK(n) {
    if (n == null) return '—';
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(2).replace(/\.?0+$/, '') + 'm';
    if (n >= 1000) return '$' + Math.round(n / 1000) + 'k';
    return '$' + n;
  }
  function fmtPct(n) {
    if (n == null) return '—';
    return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
  }

  function calcYield(annualRent, price) {
    if (!annualRent || !price || price === 0) return null;
    return ((annualRent / price) * 100).toFixed(2);
  }

  function badge(colour, text) {
    return '<span class="suburb-live-badge suburb-live-badge--' + colour + '">' + text + '</span>';
  }

  function renderStat(label, value, sub) {
    return '<div class="suburb-stat">'
      + '<div class="suburb-stat-label">' + label + '</div>'
      + '<div class="suburb-stat-value">' + value + '</div>'
      + (sub ? '<div class="suburb-stat-sub">' + sub + '</div>' : '')
      + '</div>';
  }

  function renderError(msg) {
    var sec = document.getElementById('suburb-live-section');
    if (sec) sec.style.display = 'none'; // hide if no data
  }

  function renderData(data, suburb, state) {
    var sec = document.getElementById('suburb-live-section');
    if (!sec) return;

    var grid = document.getElementById('suburb-live-grid');
    if (!grid) return;

    var html = '';

    // Median sale price
    html += renderStat(
      'Median Sale Price',
      fmtK(data.medianSalePrice),
      'Houses · ' + (data.periodLabel || 'last 12 months')
    );

    // Number sold
    html += renderStat(
      'Sales (12 months)',
      data.numberSold ? data.numberSold.toLocaleString('en-AU') : '—',
      ''
    );

    // Median weekly rent
    if (data.medianWeeklyRent) {
      html += renderStat(
        'Median Weekly Rent',
        fmt(data.medianWeeklyRent) + '/wk',
        'Houses'
      );

      // Gross yield
      var yld = calcYield(data.medianWeeklyRent * 52, data.medianSalePrice);
      if (yld) {
        html += renderStat(
          'Gross Rental Yield',
          yld + '%',
          'Estimated · houses'
        );
      }
    }

    // Annual growth
    if (data.annualGrowth != null) {
      var growthColour = data.annualGrowth >= 0 ? 'green' : 'red';
      html += renderStat(
        'Annual Price Growth',
        '<span class="suburb-stat-value--' + growthColour + '">' + fmtPct(data.annualGrowth) + '</span>',
        data.periodLabel || ''
      );
    }

    grid.innerHTML = html;

    // Source note
    var note = document.getElementById('suburb-live-note');
    if (note) {
      note.innerHTML = 'Source: Domain.com.au · Data for 4-bedroom houses · '
        + (data.periodLabel || 'last 12 months')
        + (data.cached ? ' · <span title="Refreshed every 30 days">cached</span>' : ' · live');
    }

    sec.style.display = '';
  }

  function init() {
    var sec = document.getElementById('suburb-live-section');
    if (!sec) return;

    var suburb = sec.getAttribute('data-suburb');
    var state  = sec.getAttribute('data-state');
    if (!suburb || !state) { sec.style.display = 'none'; return; }

    // Show loading skeletons
    var grid = document.getElementById('suburb-live-grid');
    if (grid) {
      grid.innerHTML = '<div class="suburb-stat loading"><div class="suburb-stat-label">Loading…</div><div class="suburb-stat-value suburb-skel"></div></div>'
        + '<div class="suburb-stat loading"><div class="suburb-stat-label"> </div><div class="suburb-stat-value suburb-skel"></div></div>'
        + '<div class="suburb-stat loading"><div class="suburb-stat-label"> </div><div class="suburb-stat-value suburb-skel"></div></div>'
        + '<div class="suburb-stat loading"><div class="suburb-stat-label"> </div><div class="suburb-stat-value suburb-skel"></div></div>';
    }

    fetch('/.netlify/functions/market-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'suburbInsights', suburb: suburb, state: state }),
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.ok && res.found) {
          renderData(res, suburb, state);
        } else {
          renderError('No data');
        }
      })
      .catch(function () { renderError('Fetch failed'); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
