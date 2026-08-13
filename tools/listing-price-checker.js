/* ═══ LISTING PRICE CHECKER ═══
 *
 * Compares an asking price against real government-recorded suburb medians
 * loaded from /tools/market-medians.json (generated centrally):
 *
 *   VIC — house + unit SALE medians (Valuer-General Victoria, 2025 prelim.)
 *         + 12-month price change (2024 -> 2025)
 *   SA  — median weekly rents (CBS, Jan-Mar 2026, + 12-month change) and
 *         metro Adelaide house sale medians (Valuer-General SA, Q1 2026;
 *         price change only where >=10 sales in both quarters)
 *   QLD — median weekly RENTS only (RTA, Mar 2026 quarter, + 12-month
 *         change). No free suburb sale prices exist for QLD — the tool
 *         says so and runs a yield check.
 *   TAS — median weekly RENTS (Dept of Justice bond lodgements, 12-month
 *         window, n>=10 per suburb). No free suburb sale prices.
 *   NSW/WA/ACT/NT — not in the file yet; honest empty state.
 *
 * Entry fields: r (rent $/wk), rc (rent 12m change %), h/u (house/unit
 * sale median $), hc/uc (12m change %).
 *
 * Every figure rendered carries its period + source + licence from the
 * file's `sources` block. No numbers are invented for uncovered states.
 */

var _MEDIANS = null;        // parsed market-medians.json
var _MEDIANS_FAILED = false;
var _hasCalced = false;     // live-recalc only after the first explicit calc
var _lookupCache = {};      // per-state map of normalised name -> file key

var STATE_NAMES = {
  NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland',
  SA: 'South Australia', WA: 'Western Australia', TAS: 'Tasmania',
  ACT: 'the Australian Capital Territory', NT: 'the Northern Territory'
};

// Static coverage summaries for the hint under the state select (precise
// periods are always shown next to each figure from the file's sources).
var STATE_COVERAGE = {
  VIC: 'Live VIC data: house + unit sale medians with 12-month change (Valuer-General Victoria, preliminary). No rent medians yet.',
  QLD: 'Live QLD data: median weekly rents with 12-month change (RTA). Queensland publishes no free suburb sale prices — the check uses rental fundamentals.',
  SA:  'Live SA data: median weekly rents with 12-month change (CBS) + metro Adelaide house sale medians (Valuer-General).',
  TAS: 'Live TAS data: suburb median weekly rents (12 months of bond lodgements, Dept of Justice). No free suburb sale prices — the check uses rental fundamentals.'
};

/* ── Helpers ─────────────────────────────────────────────────────────── */

// Match the data file's key convention: UPPERCASE, non-alphanumerics
// stripped to spaces, collapsed to single spaces.
function normName(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\s+|\s+$/g, '');
}

function titleCase(s) {
  return String(s || '').toLowerCase().replace(/(^|\s)[a-z]/g, function (c) {
    return c.toUpperCase();
  });
}

function stateCode() {
  return (document.getElementById('state').value || '').toUpperCase();
}

function stateEntries(code) {
  return (_MEDIANS && _MEDIANS.states && _MEDIANS.states[code]) || null;
}

function findSuburb(code, name) {
  var entries = stateEntries(code);
  if (!entries || !name) return null;
  var map = _lookupCache[code];
  if (!map) {
    map = {};
    for (var k in entries) {
      if (Object.prototype.hasOwnProperty.call(entries, k)) map[normName(k)] = k;
    }
    _lookupCache[code] = map;
  }
  var key = map[normName(name)];
  return key ? { key: key, entry: entries[key] } : null;
}

// "as at {period}, {source} ({licence})" caption from the file's sources
// block — every figure we render is stamped with this. The HTML variant links
// the source name to the dataset page (references, verifiable in one click).
function srcCaption(srcKey) {
  var s = _MEDIANS && _MEDIANS.sources && _MEDIANS.sources[srcKey];
  if (!s) return '';
  var t = 'as at ' + s.period + ', ' + s.source + ' (' + (s.licence || 'CC BY 4.0') + ')';
  if (s.note) t += ' — ' + s.note;
  return t;
}

function srcCaptionHtml(srcKey) {
  var s = _MEDIANS && _MEDIANS.sources && _MEDIANS.sources[srcKey];
  if (!s) return '';
  var name = s.url
    ? '<a href="' + escHtml(s.url) + '" target="_blank" rel="noopener">' + escHtml(s.source) + '</a>'
    : escHtml(s.source);
  var t = 'as at ' + escHtml(s.period) + ', ' + name + ' (' + escHtml(s.licence || 'CC BY 4.0') + ')';
  if (s.note) t += ' — ' + escHtml(s.note);
  return t;
}

// Trend caption, e.g. "Mar 2025 → Mar 2026", from the file's trend_periods.
function trendPeriod(srcKey) {
  var tp = _MEDIANS && _MEDIANS.trend_periods && _MEDIANS.trend_periods[srcKey];
  return tp || '12 months';
}

function fmtPct(n, dp) {
  return n.toFixed(typeof dp === 'number' ? dp : 1) + '%';
}

function signedFmt(n) {
  return (n >= 0 ? '+' : '−') + fmt(Math.abs(n));
}

function signedPct(n, dp) {
  return (n >= 0 ? '+' : '−') + fmtPct(Math.abs(n), dp);
}

function bannerHtml(kind, tag, text) {
  return '<div class="mort-callout' + (kind === 'gold' ? ' mort-callout-gold' : '') + '">' +
    '<span class="mort-callout-tag">' + escHtml(tag) + '</span>' +
    '<span class="mort-callout-text">' + escHtml(text) + '</span>' +
    '</div>';
}

function rowHtml(label, value, cls) {
  return '<div class="tool-cost-row' + (cls ? ' ' + cls : '') + '">' +
    '<span class="tool-cost-row-label">' + escHtml(label) + '</span>' +
    '<span class="tool-cost-row-value">' + escHtml(value) + '</span>' +
    '</div>';
}

function breakdownHtml(title, rows) {
  return '<div class="tool-cost-breakdown">' +
    '<div class="tool-cost-breakdown-title">' + escHtml(title) + '</div>' +
    rows.join('') +
    '</div>';
}

/* ── Data load + datalist ────────────────────────────────────────────── */

function loadMedians() {
  fetch('/tools/market-medians.json?v=2026Q2b')
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      _MEDIANS = data || null;
      _lookupCache = {};
      populateDatalist();
      updateCoverageHint();
    })
    .catch(function () {
      _MEDIANS_FAILED = true;
      updateCoverageHint();
    });
}

function populateDatalist() {
  var dl = document.getElementById('suburb-list');
  if (!dl) return;
  while (dl.firstChild) dl.removeChild(dl.firstChild);
  var entries = stateEntries(stateCode());
  if (!entries) return;
  var names = [];
  for (var k in entries) {
    if (Object.prototype.hasOwnProperty.call(entries, k)) names.push(k);
  }
  names.sort();
  for (var i = 0; i < names.length; i++) {
    var opt = document.createElement('option');
    opt.value = titleCase(names[i]); // matched case-insensitively on lookup
    dl.appendChild(opt);
  }
}

function updateCoverageHint() {
  var hint = document.getElementById('coverage-hint');
  if (!hint) return;
  var code = stateCode();
  if (_MEDIANS_FAILED) {
    hint.textContent = 'Live market data could not be loaded right now — the general checks below still apply.';
  } else if (STATE_COVERAGE[code]) {
    hint.textContent = STATE_COVERAGE[code];
  } else {
    hint.textContent = 'No free, republishable government price or rent dataset for ' +
      (STATE_NAMES[code] || code) + ' yet — you’ll still get the generic checks.';
  }
}

/* ── The check itself ────────────────────────────────────────────────── */

function calculate() {
  var _msg = document.getElementById('calc-msg');
  function showErr(t) { if (_msg) { _msg.textContent = t; _msg.hidden = false; } }
  if (_msg) _msg.hidden = true;

  var code = stateCode();
  var suburbRaw = (document.getElementById('suburb').value || '').replace(/^\s+|\s+$/g, '');
  var ptype = document.getElementById('ptype').value; // 'house' | 'unit'
  var ptypeLabel = ptype === 'house' ? 'house' : 'unit';
  var price = parseVal('price');
  var userRent = parseVal('rent');

  if (!price || price <= 0) { showErr('Please enter the asking price.'); return; }
  if (_MEDIANS === null && !_MEDIANS_FAILED) {
    showErr('Market data is still loading — try again in a moment.');
    return;
  }

  var covered = !!stateEntries(code);
  var found = (covered && suburbRaw) ? findSuburb(code, suburbRaw) : null;
  var entry = found ? found.entry : null;
  var displaySuburb = found ? titleCase(found.key) : suburbRaw;

  // Which sale median applies to the chosen property type (h=house, u=unit)?
  var median = null;
  if (entry) {
    if (ptype === 'house' && typeof entry.h === 'number') median = entry.h;
    if (ptype === 'unit' && typeof entry.u === 'number') median = entry.u;
  }
  var priceSrcKey = code === 'VIC' ? 'VIC_price' : (code === 'SA' ? 'SA_price' : null);
  var rentSrcKey = code === 'QLD' ? 'QLD_rent' : (code === 'SA' ? 'SA_rent' : (code === 'TAS' ? 'TAS_rent' : null));

  var verdictHtml = '';
  var priceBlock = '';
  var yieldBlock = '';
  var sources = [];
  var mode = 'none';
  var deltaPct = null;
  var impliedYield = null;

  /* ── PRICE MODE — a sale median exists for this suburb + type ── */
  if (median) {
    mode = 'price';
    var delta = price - median;
    deltaPct = delta / median * 100;

    var band, kind;
    if (deltaPct > 12) {
      band = 'Well above the suburb median'; kind = 'gold';
    } else if (deltaPct > 5) {
      band = 'Somewhat above the suburb median'; kind = 'gold';
    } else if (deltaPct >= -5) {
      band = 'In line with the suburb median'; kind = 'green';
    } else if (deltaPct >= -12) {
      band = 'Below the suburb median'; kind = 'green';
    } else {
      band = 'Well below the suburb median — in auction states this can signal underquoting; check comparable sold prices'; kind = 'gold';
    }
    verdictHtml = bannerHtml(kind, 'Verdict',
      band + ' (' + signedPct(deltaPct) + ' vs the ' + displaySuburb + ' ' + ptypeLabel + ' median).');

    var priceRows = [
      rowHtml('Asking price', fmt(price)),
      rowHtml(titleCase(ptypeLabel) + ' median — ' + displaySuburb, fmt(median)),
      rowHtml('Difference', signedFmt(delta) + ' (' + signedPct(deltaPct) + ')', 'total')
    ];
    // 12-month movement of the same median (hc = house, uc = unit), so the
    // verdict carries direction as well as level.
    var moveKey = ptype === 'house' ? 'hc' : 'uc';
    if (entry && typeof entry[moveKey] === 'number') {
      priceRows.push(rowHtml('Suburb ' + ptypeLabel + ' median, 12-month change', signedPct(entry[moveKey])));
    }
    priceBlock = breakdownHtml('Asking price vs suburb median', priceRows);
    if (priceSrcKey) {
      sources.push('Suburb median: ' + fmt(median) + ' — ' + srcCaptionHtml(priceSrcKey) + '.');
      if (entry && typeof entry[moveKey] === 'number') {
        sources.push('12-month change: ' + trendPeriod(priceSrcKey) + '.');
      }
    }
  } else if (entry && (code === 'QLD' || code === 'TAS')) {
    // Suburb found, but these states publish no free sale medians at all.
    verdictHtml = bannerHtml('gold', code === 'QLD' ? 'Queensland note' : 'Tasmania note',
      code === 'QLD'
        ? 'Queensland doesn’t publish free suburb sale prices; this check uses rental fundamentals instead.'
        : 'Tasmania publishes no free suburb sale prices; this check uses rental fundamentals from 12 months of bond lodgements instead.');
  } else if (entry) {
    // Suburb found but no sale median for this property type (e.g. SA units,
    // or a VIC suburb with no recorded unit median).
    verdictHtml = bannerHtml('gold', 'No ' + ptypeLabel + ' median',
      'The dataset has no ' + ptypeLabel + ' sale median for ' + displaySuburb +
      ((typeof entry.r === 'number' || userRent > 0) ? ' — running the rental-fundamentals check instead.' : '. Try the other property type, or add an advertised rent for a yield check.'));
  } else if (covered && suburbRaw) {
    verdictHtml = bannerHtml('gold', 'Suburb not found',
      '“' + displaySuburb + '” isn’t in the ' + code +
      ' dataset — check the spelling or pick a suggestion from the suburb field. No numbers are invented for missing suburbs.');
  } else if (covered) {
    // Covered state, no suburb entered.
    if (!(userRent > 0)) {
      showErr('Enter a suburb to compare against the ' + code + ' medians, or add an advertised rent for a yield-only check.');
      return;
    }
    verdictHtml = bannerHtml('gold', 'No suburb selected',
      'Running a yield-only check from the rent you entered.');
  } else {
    verdictHtml = bannerHtml('gold', 'No free public data for this state yet',
      'There’s no free, republishable government sale-price or rent dataset for ' +
      (STATE_NAMES[code] || code) + ' yet, so this listing can’t be scored against a median. The sanity checks below still apply.');
  }

  /* ── YIELD MODE — advertised rent, or suburb median rent where known ── */
  var suburbRent = (entry && typeof entry.r === 'number') ? entry.r : 0;
  var weeklyRent = userRent > 0 ? userRent : suburbRent;
  var rentIsUser = userRent > 0;
  var refYield = null;

  if (weeklyRent > 0) {
    if (mode === 'none') mode = 'yield';
    var annualRent = weeklyRent * 52;
    impliedYield = annualRent / price * 100;

    var yieldRows = [
      rowHtml('Weekly rent used', fmt(weeklyRent) + '/wk (' + (rentIsUser ? 'advertised rent you entered' : 'suburb median rent') + ')'),
      rowHtml('Annualised rent (× 52)', fmt(annualRent)),
      rowHtml('Implied gross yield at asking price', fmtPct(impliedYield, 2) + ' (indicative)', 'subtotal')
    ];
    // If the user entered their own rent and the suburb median is known,
    // surface the median beside it — this is exactly the "verify it against
    // the suburb median" step the verdict would otherwise leave to the user.
    var rentDev = null;
    if (rentIsUser && suburbRent > 0) {
      rentDev = (userRent - suburbRent) / suburbRent * 100;
      yieldRows.splice(1, 0, rowHtml('Suburb median rent (for comparison)', fmt(suburbRent) + '/wk'));
    }
    // Suburb rent momentum — direction matters as much as level.
    var rentTrend = (entry && typeof entry.rc === 'number') ? entry.rc : null;
    if (rentTrend !== null) {
      yieldRows.push(rowHtml('Suburb rent, 12-month change', signedPct(rentTrend)));
    }

    var yieldVerdict = '';
    if (suburbRent > 0 && entry && typeof entry.h === 'number' && entry.h > 0) {
      // Suburb has both a median rent and a house sale median — compute the
      // suburb's own reference yield and compare against it.
      refYield = suburbRent * 52 / entry.h * 100;
      yieldRows.push(rowHtml('Suburb reference yield (median rent vs house median)', fmtPct(refYield, 2)));
      var diff = impliedYield - refYield;
      if (diff <= -0.5) {
        yieldVerdict = 'The implied gross yield is below the suburb’s reference yield — the asking price looks high relative to local rental fundamentals (indicative).';
      } else if (diff < 0.5) {
        yieldVerdict = 'The implied gross yield is in line with the suburb’s reference yield — the price and local rents are telling the same story (indicative).';
      } else {
        yieldVerdict = 'The implied gross yield is above the suburb’s reference yield — the asking price looks modest relative to local rents (indicative).';
      }
    } else {
      // No local price reference — compare with honest typical bands, and say
      // WHERE in the band the price lands rather than a mushy "within band".
      var bandLow = ptype === 'house' ? 2.5 : 4.0;
      var bandHigh = ptype === 'house' ? 4.5 : 6.0;
      var bandLabel = ptype === 'house' ? 'houses, indicative 2.5–4.5% gross' : 'units, indicative 4–6% gross';
      yieldRows.push(rowHtml('Typical indicative band', bandLabel));
      if (impliedYield < bandLow) {
        yieldVerdict = 'The implied gross yield is below the typical band — at this asking price the property earns unusually little rent for its cost. That reads as a HIGH asking price relative to rental fundamentals (indicative), unless strong capital growth justifies it.';
      } else if (impliedYield <= bandHigh) {
        var midBand = (bandLow + bandHigh) / 2;
        yieldVerdict = impliedYield < midBand
          ? 'The implied gross yield sits in the LOWER half of the typical band — the asking price is on the expensive side relative to the rent, without being an outlier (indicative).'
          : 'The implied gross yield sits in the UPPER half of the typical band — the asking price looks reasonable against the rent this suburb actually earns (indicative).';
      } else {
        yieldVerdict = 'The implied gross yield is above the typical band — the price looks modest relative to the rent (or the advertised rent is optimistic; verify it against the suburb median).';
      }
    }
    // If the advertised rent is well off the suburb median, do the
    // verification for the reader instead of telling them to do it.
    if (rentDev !== null && Math.abs(rentDev) >= 10) {
      yieldVerdict += ' Note: the advertised rent is ' + Math.abs(rentDev).toFixed(0) + '% ' +
        (rentDev > 0 ? 'above' : 'below') + ' the suburb median rent (' + fmt(suburbRent) + '/wk), so the implied yield reads ' +
        (rentDev > 0 ? 'optimistic — re-run the check with the median to see the conservative case.' : 'conservative — there may be rental upside.');
    } else if (rentDev !== null) {
      yieldVerdict += ' The advertised rent is in line with the suburb median (' + fmt(suburbRent) + '/wk), which grounds this yield read.';
    }
    // Append rent momentum so the read carries direction, not just level.
    if (rentTrend !== null && rentSrcKey) {
      yieldVerdict += ' Suburb median rent moved ' + signedPct(rentTrend) + ' over ' + trendPeriod(rentSrcKey) + '.';
    }

    yieldBlock = breakdownHtml('Rental fundamentals check (indicative)', yieldRows) +
      bannerHtml((refYield !== null && (impliedYield - refYield) <= -0.5) || (refYield === null && impliedYield < (ptype === 'house' ? 2.5 : 4.0)) ? 'gold' : 'green',
        'Yield read', yieldVerdict);

    // Stamp the sources of every suburb figure used above (linked to the
    // dataset page so every number is verifiable in one click). Any RTA/CBS
    // figure on screen — median row, comparison row or trend — gets stamped,
    // including when the user supplied their own rent (the trend still
    // renders, so the caption must too).
    if (suburbRent > 0 && rentSrcKey) {
      sources.push('Suburb median rent: ' + fmt(suburbRent) + '/wk — ' + srcCaptionHtml(rentSrcKey) + '.');
    } else if (rentTrend !== null && rentSrcKey) {
      sources.push('Suburb rent trend — ' + srcCaptionHtml(rentSrcKey) + '.');
    }
    if (refYield !== null && priceSrcKey && !median) {
      sources.push('Suburb house median (yield reference): ' + fmt(entry.h) + ' — ' + srcCaptionHtml(priceSrcKey) + '.');
    }
  }

  /* ── Render ── */
  document.getElementById('r-verdict').innerHTML = verdictHtml;
  document.getElementById('r-price-block').innerHTML = priceBlock;
  document.getElementById('r-yield-block').innerHTML = yieldBlock;

  if (sources.length && _MEDIANS && _MEDIANS.updated) {
    sources.push('Dataset updated ' + _MEDIANS.updated + '.');
  }
  var srcEl = document.getElementById('r-source');
  if (srcEl) {
    // sources[] entries are pre-escaped HTML (figures + linked captions built
    // via srcCaptionHtml — all text passes through escHtml there).
    srcEl.innerHTML = sources.join(' ');
    srcEl.style.display = sources.length ? '' : 'none';
  }

  document.getElementById('result').style.display = '';
  var cta = document.getElementById('cta');
  if (cta) cta.style.display = '';
  _hasCalced = true;

  if (window.trackCalculatorResult) trackCalculatorResult('listing-price', {
    state: code,
    mode: mode,
    suburbFound: !!entry,
    askingPrice: price,
    deltaPct: deltaPct === null ? '' : deltaPct.toFixed(1),
    impliedYield: impliedYield === null ? '' : impliedYield.toFixed(2)
  });
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  slug: 'listing-price',
  stateSelectId: 'state',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Model the full purchase',
    description: 'The free First Home Journey compares government schemes for your numbers, builds a budget with every upfront cost, and tracks your contract deadlines.',
    buttonText: 'Start your first-home journey — free \u2192',
    buttonHref: '/journey'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFDB\uFE0F', title: 'Official Data Sources',
        links: [
          { text: 'Valuer-General Victoria — property sales statistics', href: 'https://www.land.vic.gov.au/valuations/resources-and-reports/property-sales-statistics' },
          { text: 'Valuer-General SA — metro median house sales (data.sa.gov.au)', href: 'https://data.sa.gov.au/data/dataset/metro-median-house-sales' },
          { text: 'RTA Queensland — median rents', href: 'https://www.rta.qld.gov.au/median-rents' },
          { text: 'CBS South Australia — private rental data', href: 'https://www.cbs.sa.gov.au/' }
        ]
      },
      {
        icon: '\uD83D\uDCCA', title: 'Open Data Portals',
        links: [
          { text: 'data.vic.gov.au', href: 'https://www.data.vic.gov.au/' },
          { text: 'data.sa.gov.au', href: 'https://data.sa.gov.au/' },
          { text: 'data.qld.gov.au', href: 'https://www.data.qld.gov.au/' }
        ]
      },
      {
        icon: '\uD83D\uDCB0', title: 'Buying Guidance',
        links: [
          { text: 'Moneysmart: Buying a house', href: 'https://moneysmart.gov.au/buying-a-house' },
          { text: 'Moneysmart: Property investment', href: 'https://moneysmart.gov.au/property-investment' },
          { text: 'Consumer Affairs Victoria: Underquoting', href: 'https://www.consumer.vic.gov.au/housing/buying-and-selling-property/buying-property/underquoting' }
        ]
      }
    ],
    disclaimer: 'Medians are general market indicators, not valuations. Data is republished under CC BY 4.0 from the credited agencies and carries its stated period — confirm current figures with the source before relying on them.'
  },
  share: {
    url: 'https://equitysight.app/tools/listing-price-checker',
    text: 'Just checked an asking price against the suburb’s real government-recorded median!'
  },
  related: [
    { href: '/tools/stamp-duty-calculator', icon: '\uD83C\uDFDB\uFE0F', label: 'Stamp Duty' },
    { href: '/tools/cost-of-purchase-calculator', icon: '\uD83D\uDCB5', label: 'Cost of Purchase' },
    { href: '/tools/borrowing-power-calculator', icon: '\uD83C\uDFE6', label: 'Borrowing Power' },
    { href: '/tools/rental-yield-calculator', icon: '\uD83D\uDCCA', label: 'Rental Yield' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/stamp-duty-calculator', text: 'Stamp Duty' },
    { href: '/tools/rental-yield-calculator', text: 'Rental Yield' },
    { href: '/tools/', text: 'All Calculators' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
    {
      label: 'Point Cook VIC — house asking $830,000',
      inputs: [
        { k: 'State', v: 'Victoria' },
        { k: 'Suburb', v: 'Point Cook' },
        { k: 'Property type', v: 'House' },
        { k: 'Asking price', v: '$830,000' }
      ],
      outputs: [
        { k: 'Suburb house median (2025 prelim., VGV)', v: '$787,500' },
        { k: 'Difference', v: '+$42,500 (+5.4%)' },
        { k: 'Verdict', v: 'Somewhat above the suburb median' }
      ]
    },
    {
      label: 'Glenelg SA — house asking $1,850,000',
      inputs: [
        { k: 'State', v: 'South Australia' },
        { k: 'Suburb', v: 'Glenelg' },
        { k: 'Property type', v: 'House' },
        { k: 'Asking price', v: '$1,850,000' }
      ],
      outputs: [
        { k: 'Metro house median (Q1 2026, VG SA)', v: '$1,949,000' },
        { k: 'Difference', v: '−$99,000 (−5.1%)' },
        { k: 'Verdict', v: 'Below the suburb median' },
        { k: 'Implied yield at median rent $598/wk', v: '~1.7% (indicative)' }
      ]
    },
    {
      label: 'New Farm QLD — house asking $1,300,000',
      inputs: [
        { k: 'State', v: 'Queensland' },
        { k: 'Suburb', v: 'New Farm' },
        { k: 'Property type', v: 'House' },
        { k: 'Asking price', v: '$1,300,000' }
      ],
      outputs: [
        { k: 'Median weekly rent (Mar 2026, RTA)', v: '$700/wk' },
        { k: 'Implied gross yield', v: '~2.8% (indicative)' },
        { k: 'Note', v: 'QLD has no free sale medians — rent check only' }
      ]
    }
  ],
  faq: [
    { q: 'Is a suburb median the same as a property valuation?',
      a: 'No. A median is the middle sale price or rent in a suburb over a period — it says nothing about a specific property’s bedrooms, land size, condition, street or aspect. Use it as a sanity check on an asking price, then look at comparable recent sold prices and, where it matters, get a professional valuation.' },
    { q: 'Where does the listing price checker’s data come from?',
      a: 'Sale medians are published by Valuer-General Victoria (2025, preliminary) and the Valuer-General of South Australia (metro Adelaide, Q1 2026). Rent medians come from the Residential Tenancies Authority Queensland (March quarter 2026), Consumer and Business Services South Australia (Jan–Mar 2026), and 12 months of Tasmanian Department of Justice rental-bond lodgements aggregated per suburb. All are open government datasets republished under the CC BY 4.0 licence, and every figure on screen links back to its dataset.' },
    { q: 'Why are there no NSW or Queensland sale prices?',
      a: 'The NSW Valuer-General’s bulk sales data is licensed on non-commercial, no-derivatives terms, so it can’t lawfully be republished here. Queensland doesn’t publish a free suburb-level sales dataset at all — suburb sale medians there are sold by commercial data providers. For those states the checker uses rental fundamentals (QLD) or general guidance instead of inventing numbers.' },
    { q: 'How current are the suburb medians?',
      a: 'Every figure shown carries its own period: VIC sale medians are preliminary 2025 full-year figures, SA metro house medians are Q1 2026, QLD rents are the March 2026 quarter, SA rents are Jan–Mar 2026 and TAS rents cover the 12 months to April 2026. Where the same dataset publishes the prior period we also show the 12-month change, so you can see direction as well as level. Government medians typically lag the live market by a quarter or more, so treat them as a baseline rather than today’s price.' },
    { q: 'What is underquoting and how does this tool help?',
      a: 'Underquoting is advertising a price guide below the seller’s or agent’s genuine expectation, most common in auction markets like Melbourne and Sydney. If an advertised guide sits well below the suburb median (more than about 12%), that can be a signal — check recent comparable sold prices, and in Victoria the agent’s Statement of Information, before setting your budget.' },
    { q: 'What is a good gross rental yield?',
      a: 'As a broad indicative range, metro Australian houses commonly show gross yields of roughly 2.5–4.5% and units roughly 4–6%. A very low implied yield can mean the asking price is high relative to what the property earns in rent. Gross yield ignores costs — use our rental yield calculator for the net picture.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '\uD83C\uDFDB\uFE0F', href: '/tools/stamp-duty-calculator', label: 'Stamp Duty Calculator' },
    { group: 'Other Tools', icon: '\uD83D\uDCB5', href: '/tools/cost-of-purchase-calculator', label: 'Cost of Purchase Calculator' },
    { group: 'Other Tools', icon: '\uD83D\uDCCA', href: '/tools/rental-yield-calculator', label: 'Rental Yield Calculator' },
    { group: 'Other Tools', icon: '\uD83C\uDFE6', href: '/tools/borrowing-power-calculator', label: 'Borrowing Power Calculator' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/vic/point-cook/', label: 'Point Cook VIC' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/qld/south-brisbane/', label: 'South Brisbane QLD' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/invest/vic/', label: 'Victoria Suburb Guide' }
  ]
});

/* ═══ WIRING ═══ */
window.addEventListener('DOMContentLoaded', function () {
  if (window.trackCalculatorStart) trackCalculatorStart('listing-price');
  loadMedians();
  updateCoverageHint(); // static hint straight away; refreshed when data lands

  var stateEl = document.getElementById('state');
  if (stateEl) stateEl.addEventListener('change', function () {
    populateDatalist();
    updateCoverageHint();
    if (_hasCalced) calculate();
  });

  ['price', 'rent'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', function () {
      fmtInput(this);
      if (_hasCalced) calculate();
    });
  });

  var suburbEl = document.getElementById('suburb');
  if (suburbEl) suburbEl.addEventListener('change', function () {
    if (_hasCalced) calculate();
  });

  var ptypeEl = document.getElementById('ptype');
  if (ptypeEl) ptypeEl.addEventListener('change', function () {
    if (_hasCalced) calculate();
  });

  var calcBtn = document.getElementById('calc-btn');
  if (calcBtn) calcBtn.addEventListener('click', function () {
    if (window.trackPageEvent) trackPageEvent('calculator_button_click', { calculator: 'listing-price' });
    calculate();
  });
});
