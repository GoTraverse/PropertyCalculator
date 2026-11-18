/**
 * rules.js — the one copy of the purchase rules (shared browser + Node module).
 *
 * Loads as window.Rules in a page and as require('../shared/rules') in Node
 * (tests and Netlify functions). No DOM, no storage, no network, nothing
 * recorded. Every table is frozen.
 *
 * Code was MOVED here, not rewritten, from the sources below as they stood on
 * 18 November 2026 (tag review-base-b). tests/rules-test.js holds golden rows
 * generated from those sources (tests/fixtures/rules-golden.json), so a page
 * that switches to this file can prove no figure moved.
 *
 *   Stamp duty: general rates, NSW whole-dollar bracket bases, VIC/ACT
 *     flat-of-total bands, NT formula, TAS $50 base, QLD home concession, QLD
 *     first home band table, NSW s 78A, WA $16.15 per $100, VIC s 57JA,
 *     foreign surcharges, QLD first home vacant land
 *       <- tools/stamp-duty-calculator.js (FY2026-27, checked 5-6 Jul 2026;
 *          NSW, WA and NT corrected 18 Nov 2026)
 *   New home duty relief (QLD and SA only, not NT), FHOG, scheme price caps,
 *   Help to Buy income caps and shares, FHSS caps, QLD foreign buyer rule
 *       <- tools/first-home-buyer-grants-calculator.js,
 *          tools/cost-of-purchase-calculator.js (QLD foreign buyers)
 *   Title office registration fees
 *       <- tools/stamp-duty-calculator.js (checked 6 Jul 2026)
 *   Income tax and Medicare levy, HELP repayments, living-cost floor,
 *   income type factors, maximum loan from a monthly budget
 *       <- tools/borrowing-power-calculator.js (FY2026-27, checked 5 Jul 2026)
 *   LMI tiers on the LVR rounded to 4 places, LMI added to the loan,
 *   conveyancing $1,800, legal and registration rounded to $50, the shape
 *   of the borrowing test, the money parser
 *       <- journey.js (the tested copy of the above)
 *   Monthly repayment, the month-by-month schedule with extra repayments,
 *   an offset and an interest-only period, the true fortnightly schedule
 *       <- tools/mortgage-repayment-calculator.js
 *
 * Differences between the old copies, settled here (each is pinned in
 * tests/rules-test.js):
 *
 *   1. LMI rounding. The grants calculator rounds LMI to whole dollars; the
 *      Journey does not. lmi(), fds().lmiAvoided and purchase() return the
 *      unrounded figure (the Journey's rule); a page that shows whole dollars
 *      rounds it itself, which gives the grants calculator's figure exactly.
 *   2. Help to Buy and single parents. The Journey gives a single applicant
 *      with dependants the joint income cap ($165,000); the grants calculator
 *      has no dependants input. h2b() takes dependants and uses the
 *      Journey's rule, which is also what the grants calculator's own
 *      constant says ("joint applicants or single parents"). With no
 *      dependants the two agree.
 *   3. The 5% Deposit Scheme and deposits other than 5%. Today the Journey
 *      models the scheme only at exactly 5%. The guarantee covers a deposit
 *      from 5% up to 20% of the property value (Housing Australia, as quoted
 *      by participating lenders and comparison sites in November 2026:
 *      "between 5% and 20% of the value of an eligible property saved as a
 *      deposit"; housingaustralia.gov.au could not be reached from the build
 *      session, so this is to be rechecked there before any page shows it:
 *      META.schemes.fds.depositRangeChecked stays false until then).
 *      To close it: read the range on the Housing Australia page in
 *      META.schemes.fds.url, set depositRangeChecked to true and
 *      depositRangeSource to that page and the date it was read, change
 *      FDS if the range differs, and change the matching pin in
 *      tests/rules-test.js (section 11, item 3). This must happen before
 *      phase 5, the first phase in which a page shows the scheme at a
 *      deposit other than 5%. fds().text and purchase().schemeNote say
 *      nothing about the range.
 *      purchase() waives LMI for an eligible first home buyer with scheme
 *      'fds' and a deposit from 5% to under 20%. Below 5% the scheme does
 *      not apply (schemeIssue 'deposit'); at 20% or more there is no LMI to
 *      waive, so it is not applied either ('depositHigh'). The 2% Family
 *      Home Guarantee for single parents is not modelled.
 *      Help to Buy takes the full 30% or 40% share. When the deposit plus
 *      that share is the whole price or more, purchase() does not apply the
 *      scheme ('depositHigh'), so the loan is never negative.
 *   4. First home concessions and investors. Today the all-states duty page,
 *      the 8 state pages, deposit, cost of purchase and auction budget give
 *      a first home buyer the concession even when Investor is chosen.
 *      duty() applies first home and QLD home concession rates only when
 *      occupancy is 'home' (p-search-calc-5). The pages move in phase 6.
 *   5. QLD foreign buyers. From 1 Aug 2026 the QLD home and first home
 *      concessions need Australian citizenship, permanent residency or
 *      specified foreign retiree status. Cost of purchase applies this; the
 *      all-states and QLD duty pages add the surcharge on top of the
 *      concession. duty() follows cost of purchase: a QLD foreign buyer pays
 *      the general rate plus the surcharge. Other states' citizenship rules
 *      for first home concessions are not modelled (as today).
 *   6. Repayment and maximum loan formulas. The Journey writes the annuity as
 *      P r / (1 - (1 + r)^-n); the calculators as P r (1 + r)^n / ((1 + r)^n - 1).
 *      repay() and maxLoanFromRepayment() use the calculators' form (their
 *      documented source). The two agree to well under a cent.
 *   7. A missing first home answer. duty() counts a first home buyer only
 *      when firstHome is true; a missing answer pays the rate for someone
 *      who has owned a home, as on the duty pages. fhog(), fds() and
 *      h2b() called on their own count anything but false as a first home
 *      buyer: the grants calculator's default, since it is a page for first
 *      home buyers. purchase() and depositFromSavings() read only true as a
 *      first home buyer, and purchase() passes that one reading to duty,
 *      both schemes and the FHOG. A purchase() with no answer (plan 2.1
 *      keeps a field absent until the visitor gives it) gets no first home
 *      duty concession, no scheme (schemeIssue 'firstHomeUnknown') and no
 *      FHOG, with firstHome null and a firstHomeNote saying why.
 *
 * Scheme sentences live here with the rules: fhog().text, fds().text and
 * h2b().text (eligibility, or why not), purchase().schemeNote (what the
 * chosen scheme did, or why I haven't applied it) and
 * purchase().firstHomeNote. They were moved from the grants calculator and
 * journey.js h2bIssue(), cut to the site's voice rules, and are pinned in
 * tests/rules-test.js.
 *
 * Owner decision still open: DEFAULT_RATE (plan section 10, item 1). It is
 * 6.00 here because that keeps the Journey's figures as they are; the
 * calculators and the old /app wizard use 6.25. No page reads it yet.
 *
 * Annual FY sweep: edit this file, then run bin/check.sh.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Rules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      Object.keys(o).forEach(function (k) { deepFreeze(o[k]); });
    }
    return o;
  }
  function stateKey(s) { return String(s == null ? '' : s).toLowerCase(); }
  function m$(v) { return '$' + Math.round(v).toLocaleString('en-AU'); }

  var STATE_CODES = ['nsw', 'vic', 'qld', 'sa', 'wa', 'tas', 'act', 'nt'];

  // ═══ STAMP DUTY ═══════════════════════════════════════════════════════
  // Moved from tools/stamp-duty-calculator.js. Each state is a list of tiers
  // [from, rate], evaluated cumulatively: tier i taxes the portion of the
  // dutiable value between tiers[i].from and tiers[i+1].from at
  // tiers[i].rate. VIC ($960k-$2M), ACT (>$1.455M) and NT use flat-of-total
  // or quadratic bands that the tier model can't express: see calcDuty().
  // Rates: each state revenue office, FY2026-27, as at 5 Jul 2026 (NSW
  // brackets CPI-indexed 1 Jul 2026; WA first home thresholds raised 7 May
  // 2026; TAS established-home first home exemption expired 30 Jun 2026; ACT
  // Home Buyer Concession Scheme uncapped from 1 Jul 2026).
  var stateData = {
    nsw: {
      name: 'New South Wales', dutyName: 'Transfer duty', foreignRate: 0.09,
      fhbFull: 800000, fhbPartial: 1000000, fhbExemption: Infinity,
      // Brackets CPI-indexed 1 Jul 2026 (FY2026-27; premium threshold $3,870,000).
      tiers: [
        { from: 0,       rate: 0.0125 },
        { from: 18000,   rate: 0.015  },
        { from: 38000,   rate: 0.0175 },
        { from: 103000,  rate: 0.035  },
        { from: 387000,  rate: 0.045  },
        { from: 1290000, rate: 0.055  },
        { from: 3870000, rate: 0.07   }
      ]
    },
    vic: {
      name: 'Victoria', dutyName: 'Land transfer duty', foreignRate: 0.08,
      fhbFull: 600000, fhbPartial: 750000, fhbExemption: Infinity,
      tiers: [
        { from: 0,       rate: 0.014 },
        { from: 25000,   rate: 0.024 },
        { from: 130000,  rate: 0.06  }
      ]
    },
    qld: {
      name: 'Queensland', dutyName: 'Transfer duty', foreignRate: 0.08,
      fhbFull: 700000, fhbPartial: 800000, fhbExemption: Infinity,
      // First home vacant land: NO duty at any value (contracts from 1 May 2025).
      tiers: [
        { from: 0,        rate: 0      },
        { from: 5000,     rate: 0.015  },
        { from: 75000,    rate: 0.035  },
        { from: 540000,   rate: 0.045  },
        { from: 1000000,  rate: 0.0575 }
      ]
    },
    sa: {
      name: 'South Australia', dutyName: 'Stamp duty', foreignRate: 0.07,
      // SA first-home relief is for NEW homes / vacant land only (no value taper),
      // so no automatic value-based FHB exemption is applied here.
      fhbFull: 0, fhbPartial: 0, fhbExemption: Infinity,
      tiers: [
        { from: 0,       rate: 0.01   },
        { from: 12000,   rate: 0.02   },
        { from: 30000,   rate: 0.03   },
        { from: 50000,   rate: 0.035  },
        { from: 100000,  rate: 0.04   },
        { from: 200000,  rate: 0.0425 },
        { from: 250000,  rate: 0.0475 },
        { from: 300000,  rate: 0.05   },
        { from: 500000,  rate: 0.055  }
      ]
    },
    wa: {
      name: 'Western Australia', dutyName: 'Transfer duty', foreignRate: 0.07,
      // FHB thresholds raised for agreements from 7 May 2026. RevenueWA has
      // assessed at the new rates since July 2026. Between $600,000 and
      // $800,000 the duty is $16.15 per $100 over $600,000 (applyFhbConcession).
      fhbFull: 600000, fhbPartial: 800000, fhbExemption: Infinity,
      tiers: [
        { from: 0,       rate: 0.019  },
        { from: 120000,  rate: 0.0285 },
        { from: 150000,  rate: 0.038  },
        { from: 360000,  rate: 0.0475 },
        { from: 725000,  rate: 0.0515 }
      ]
    },
    tas: {
      name: 'Tasmania', dutyName: 'Property transfer duty', foreignRate: 0.08,
      // FHB established-home exemption EXPIRED 30 Jun 2026 (SRO: "not available for
      // transactions settling after 30 June 2026"), so no FHB duty relief in TAS now.
      fhbFull: 0, fhbPartial: 0, fhbExemption: Infinity,
      tiers: [
        { from: 0,       rate: 0      },
        { from: 3000,    rate: 0.0175 },
        { from: 25000,   rate: 0.0225 },
        { from: 75000,   rate: 0.035  },
        { from: 200000,  rate: 0.04   },
        { from: 375000,  rate: 0.0425 },
        { from: 725000,  rate: 0.045  }
      ]
    },
    act: {
      name: 'Australian Capital Territory', dutyName: 'Conveyance duty', foreignRate: 0,
      // HBCS from 1 Jul 2026: NO income test, NO property value limit. Eligible
      // buyers (no property owned in prior 5 yrs) pay $0 duty at any price.
      fhbFull: Infinity, fhbPartial: Infinity, fhbExemption: Infinity,
      tiers: [
        { from: 0,       rate: 0.0028 },
        { from: 260000,  rate: 0.022  },
        { from: 300000,  rate: 0.034  },
        { from: 500000,  rate: 0.0432 },
        { from: 750000,  rate: 0.059  },
        { from: 1000000, rate: 0.064  }
      ]
    },
    nt: {
      name: 'Northern Territory', dutyName: 'Stamp duty', foreignRate: 0,
      // NT has no value-based FHB duty concession (relief is new-build exemption / grants).
      // Duty is a quadratic under $525k and a flat % of total above: see calcDuty().
      fhbFull: 0, fhbPartial: 0, fhbExemption: Infinity,
      tiers: []
    }
  };

  // Cumulative tiered duty at the general rate. The state code may be in
  // any case ('QLD' or 'qld'), as in every function this file exports.
  function calcDuty(state, v) {
    state = stateKey(state);
    var data = stateData[state];
    if (!data || v <= 0) return 0;
    // NT: quadratic under $525k, flat % of TOTAL value above (not marginal).
    if (state === 'nt') {
      if (v < 525000) { var Vk = v / 1000; return 0.06571441 * Vk * Vk + 15 * Vk; }
      if (v <= 3000000) return v * 0.0495;
      if (v <= 5000000) return v * 0.0575;
      return v * 0.0595;
    }
    // Standard cumulative-marginal tiers.
    var tiers = data.tiers;
    var duty = 0;
    for (var i = 0; i < tiers.length; i++) {
      var from = tiers[i].from;
      if (v <= from) break;
      var nextFrom = (i + 1 < tiers.length) ? tiers[i + 1].from : Infinity;
      duty += (Math.min(v, nextFrom) - from) * tiers[i].rate;
      // Revenue NSW states each bracket's base in whole dollars ($1,662 at
      // $103,000 where the rates add up to $1,662.50; then $11,602, $52,237
      // and $194,137), so the running total is floored at each bracket NSW
      // passes.
      if (state === 'nsw' && v > nextFrom) duty = Math.floor(duty);
    }
    // Bands that are a flat % of the TOTAL value (not marginal on the excess):
    if (state === 'vic') {
      if (v > 960000 && v <= 2000000) duty = v * 0.055;
      else if (v > 2000000) duty = 110000 + (v - 2000000) * 0.065;
    } else if (state === 'act' && v > 1455000) {
      duty = v * 0.0454;
    } else if (state === 'tas') {
      // $50 minimum is also the base at $3,000 that carries up through every band.
      duty = (v <= 3000) ? 50 : duty + 50;
    }
    return duty;
  }

  // QLD home-concession duty (owner-occupier rate, QRO schedule): 1% to $350k;
  // $3,500 + 3.5% to $540k; $10,150 + 4.5% to $1M; $30,850 + 5.75% above.
  function qldHomeDuty(v) {
    if (v <= 350000) return v * 0.01;
    if (v <= 540000) return 3500 + (v - 350000) * 0.035;
    if (v <= 1000000) return 10150 + (v - 540000) * 0.045;
    return 30850 + (v - 1000000) * 0.0575;
  }

  // QLD first home concession amount: QRO's exact $10,000-band table
  // (contracts on/after 9 Jun 2024; unchanged FY2026-27, checked 5 Jul 2026):
  // $17,350 at <=$709,999.99 stepping down $1,735 per band to nil at
  // $800,000+. Deducted from the HOME-concession duty, not the general rate.
  // QRO worked example: $730,000 -> $18,700 - $12,145 = $6,555.
  function qldFhbConcessionAmt(v) {
    if (v < 710000) return 17350;
    if (v >= 800000) return 0;
    return 17350 - Math.floor((v - 700000) / 10000) * 1735;
  }

  // First home buyer duty on an established home, from the general duty.
  function applyFhbConcession(state, val, baseDuty) {
    state = stateKey(state);
    var data = stateData[state];
    if (!data) return { duty: baseDuty, note: '' };
    if (state === 'qld') {
      // QRO method: band-table concession off HOME-concession duty. An FHB is
      // an owner-occupier, so above $800k the home-concession rate still
      // applies rather than reverting to the general rate.
      var qduty = Math.max(0, qldHomeDuty(val) - qldFhbConcessionAmt(val));
      var qnote = val <= 700000 ? 'First home buyer exemption applied.'
        : (val < 800000 ? 'QLD first home concession (QRO $10,000-band table) applied.'
          : 'QLD home concession applied (over the $800,000 first-home cap).');
      return { duty: qduty, note: qnote };
    }
    if (val <= data.fhbFull) {
      var ex = Math.min(data.fhbExemption || Infinity, baseDuty);
      return { duty: Math.max(0, baseDuty - ex), note: 'First home buyer exemption applied.' };
    }
    if (val <= data.fhbPartial && data.fhbPartial > data.fhbFull) {
      var slide = (data.fhbPartial - val) / (data.fhbPartial - data.fhbFull);
      if (state === 'nsw') {
        // NSW (Duties Act 1997 s 78A, as stated by secondary sources and fitted
        // to Revenue NSW's FHBAS table): general duty at the price, less
        // (1,000,000 - price) / 200,000 of the general duty on $800,000. It
        // rises in a straight line from nil at $800,000 to the general duty on
        // $1,000,000. $900,000 gives $19,593.50, the figure in Revenue NSW's
        // table, because calcDuty() uses its whole-dollar bracket bases.
        return { duty: Math.max(0, baseDuty - slide * calcDuty('nsw', data.fhbFull)), note: 'First home buyer partial concession applied.' };
      }
      if (state === 'wa') {
        // WA first home owner rate for a home, agreements from 7 May 2026
        // (RevenueWA): $16.15 for every $100, or part of $100, over $600,000,
        // up to $800,000. Worked in cents to avoid floating-point drift.
        return { duty: Math.round(Math.ceil((val - data.fhbFull) / 100) * 1615) / 100, note: 'First home buyer partial concession applied.' };
      }
      // VIC (s 57JA): general duty scaled in a straight line, from nil at
      // $600,000 to the full general duty at $750,000. SRO: $24,713 at $700,000.
      return { duty: Math.max(0, baseDuty * (1 - slide)), note: 'First home buyer partial concession applied.' };
    }
    return { duty: baseDuty, note: '' };
  }

  // A first home buyer's NEW home pays no duty, with no value cap, in QLD
  // (contracts from 1 May 2025) and SA (new and off-the-plan, contracts from
  // 6 Jun 2024). Not the NT: its house and land package exemption is open to
  // any home buyer, so it is not a first home concession (18 Nov 2026 fact
  // check), and a calculator can't tell a package from other new builds.
  var NEW_HOME_DUTY_FREE = { qld: true, sa: true };

  // Duty for one buyer. Inputs:
  //   state      code, any case
  //   price      dutiable value
  //   firstHome  true for a first home buyer
  //   occupancy  'home' (live in it, the default) or 'invest'
  //   build      'established' (default), 'new', 'offplan' (= new), 'unsure'
  //   land       true for vacant land
  //   foreign    true for a foreign buyer (adds the state surcharge)
  // Returns { duty, concession, note, basis, general, ownerRate,
  //   firstHomeSaving, surcharge, total }. duty excludes the surcharge;
  //   total = duty + surcharge. concession = general - duty.
  //   ownerRate = what an owner-occupier who is not a first home buyer pays
  //   (QLD home concession rate, else the general rate): the baseline the
  //   grants calculator measures the first home saving against.
  function duty(o) {
    o = o || {};
    var st = stateKey(o.state);
    var v = Number(o.price) || 0;
    var data = stateData[st];
    var out = { duty: 0, concession: 0, note: '', basis: 'none', general: 0, ownerRate: 0, firstHomeSaving: 0, surcharge: 0, total: 0 };
    if (!data || !(v > 0)) return out;
    var home = o.occupancy !== 'invest';
    var land = !!o.land;
    var isNew = o.build === 'new' || o.build === 'offplan';
    var foreign = !!o.foreign;
    var base = calcDuty(st, v);
    var ownerRate = (home && !land && st === 'qld') ? qldHomeDuty(v) : base;
    var d = base, note = '', basis = 'general';
    if (foreign && st === 'qld') {
      // From 1 Aug 2026 the QLD home and first home concessions need
      // citizenship, permanent residency or specified foreign retiree status.
      ownerRate = base;
      if (o.firstHome || home) {
        note = 'From 1 August 2026 the Queensland home concessions need Australian citizenship, permanent residency or specified foreign retiree status, so this uses the general rate.';
        basis = 'qldForeign';
      }
    } else if (o.firstHome && home) {
      if (land) {
        if (st === 'qld') {
          // QLD first home vacant land concession: NO duty at any land value
          // for agreements from 1 May 2025 (QRO). Other states' land rules for
          // first home buyers are not modelled: they get the general rate.
          d = 0; basis = 'qldFhbLand';
          note = 'First home vacant land concession: no duty at any value (contracts from 1 May 2025).';
        } else {
          basis = 'landNotModelled';
          note = 'First home buyer relief for vacant land has different rules that this calculator doesn’t model, so standard duty is shown.';
        }
      } else if (isNew && NEW_HOME_DUTY_FREE[st]) {
        d = 0; basis = 'newHome';
        note = st === 'qld'
          ? 'First home buyers pay no duty on a new home in Queensland, at any price (contracts from 1 May 2025).'
          : 'First home buyers pay no duty on a new or off-the-plan home in South Australia, at any price (contracts from 6 June 2024).';
      } else {
        var r = applyFhbConcession(st, v, base);
        d = r.duty; note = r.note;
        basis = st === 'qld' ? (v <= 700000 ? 'fhbFull' : v < 800000 ? 'qldFhbBand' : 'qldHomeOverCap')
          : (v <= data.fhbFull ? 'fhbFull' : (v <= data.fhbPartial && data.fhbPartial > data.fhbFull ? 'fhbPartial' : 'general'));
      }
    } else if (home && !land && st === 'qld') {
      // QLD owner-occupier who is not a first home buyer: home-concession
      // rate (QRO schedule), at most $7,175 below the general rate. No other
      // state has an owner/investor split.
      d = qldHomeDuty(v); basis = 'qldHome';
      note = 'QLD home concession applied (owner-occupier).';
    } else if (o.firstHome && !home) {
      basis = 'investorNoFhb';
      note = 'First home concessions are for a home you will live in, so an investment pays the general rate.';
    }
    out.duty = d;
    out.general = base;
    out.ownerRate = ownerRate;
    out.concession = base - d;
    out.firstHomeSaving = (o.firstHome && home) ? ownerRate - d : 0;
    out.note = note;
    out.basis = basis;
    out.surcharge = foreign ? v * (data.foreignRate || 0) : 0;
    out.total = d + out.surcharge;
    return out;
  }

  // ═══ REGISTRATION FEES ════════════════════════════════════════════════
  // Moved from tools/stamp-duty-calculator.js. Mortgage + transfer
  // registration. Flat fees checked FY2026-27 (6 Jul 2026) against each
  // registry's schedule. The qld/vic/sa/wa rows are not used: their transfer
  // fees scale with the price and are worked out in regFeesTotal().
  var REG_FEES = {
    nsw: { mortgage: 183, transfer: 183 },  // NSW LRS $182.73 incl GST each
    vic: { mortgage: 129, transfer: 124 },  // superseded by regFeesTotal()
    qld: { mortgage: 248, transfer: 250 },  // superseded by regFeesTotal()
    sa:  { mortgage: 204, transfer: 230 },  // superseded by regFeesTotal()
    wa:  { mortgage: 225, transfer: 200 },  // superseded by regFeesTotal()
    tas: { mortgage: 168, transfer: 257 },  // NRE Tas $167.58 / $256.76
    act: { mortgage: 184, transfer: 496 },  // DI2026-104 items 15 / 9
    nt:  { mortgage: 181, transfer: 181 }   // NT LTO flat per dealing
  };
  // Registries whose TRANSFER fee is value-scaled (electronic-lodgement fees
  // where the channels differ).
  var SCALED_REG = { qld: 'Titles Qld', vic: 'Land Use Victoria', sa: 'Land Services SA', wa: 'Landgate' };

  function regFeesTotal(state, val) {
    state = stateKey(state);
    if (state === 'qld') {
      // Titles Qld: transfer $248.04 + $46.56 per $10k (or part) over $180k; mortgage $248.04.
      return Math.round(248.04 + 248.04 + (val > 180000 ? Math.ceil((val - 180000) / 10000) * 46.56 : 0));
    }
    if (state === 'vic') {
      // Land Use Victoria (electronic): transfer $104.30 + $2.34 per whole
      // $1,000 of price, rounded UP to the next dollar, capped at $3,614;
      // mortgage $129.20.
      var vt = Math.min(3614, Math.ceil(104.30 + Math.floor(val / 1000) * 2.34));
      return Math.round(129.20 + vt);
    }
    if (state === 'sa') {
      // Land Services SA (ad valorem, NO cap, the highest in the country):
      // <=$5k $204; <=$20k $228; <=$40k $251; then $353 + $105 per $10k (or
      // part) above $50,000. Mortgage $204. ($750k => transfer $7,703.)
      var st = val <= 5000 ? 204 : val <= 20000 ? 228 : val <= 40000 ? 251
        : 353 + 105 * Math.ceil(Math.max(0, val - 50000) / 10000);
      return Math.round(204 + st);
    }
    if (state === 'wa') {
      // Landgate: <=$85k $225.10; <=$120k $235.10; <=$200k $255.10; then
      // + $20 per whole-or-part $100k above $200,000. Mortgage $225.10.
      var wt = val <= 85000 ? 225.10 : val <= 120000 ? 235.10 : val <= 200000 ? 255.10
        : 255.10 + 20 * Math.ceil((val - 200000) / 100000);
      return Math.round(225.10 + wt);
    }
    var reg = REG_FEES[state] || { mortgage: 200, transfer: 200 };
    return reg.mortgage + reg.transfer;
  }
  function regFees(state, price) { return regFeesTotal(stateKey(state), Number(price) || 0); }

  // ═══ OTHER UPFRONT COSTS ══════════════════════════════════════════════
  // Conveyancing: my estimate, with no official source; the range shown is
  // $1,300 to $2,200. Building and pest: $500 in the deposit and cost of
  // purchase totals, shown elsewhere as a range. Loan fees: a range only.
  var CONVEYANCING = 1800;
  var CONVEYANCING_RANGE = [1300, 2200];
  var INSPECTION = 500;
  var INSPECTION_RANGE = [400, 700];
  var LOAN_FEE_RANGE = [0, 600];
  // Legal and registration costs carried in every Journey cash figure:
  // registration plus conveyancing, rounded to the nearest $50.
  function legalAndRegistration(state, price) {
    return Math.round((regFees(state, price) + CONVEYANCING) / 50) * 50;
  }

  // ═══ LMI ══════════════════════════════════════════════════════════════
  // My own rough rates by LVR band, with no published rate table behind
  // them. Real LMI varies by lender, insurer and borrower. The ratio is
  // rounded to 4 places first: 0.9 * price / price can come out as
  // 0.9000000000000001 and land in the next tier.
  var LMI_TIERS = [
    { maxLvr: 0.80, rate: 0,      label: 'No LMI (LVR ≤ 80%)' },
    { maxLvr: 0.85, rate: 0.0080, label: '~0.8% of loan' },
    { maxLvr: 0.90, rate: 0.0190, label: '~1.9% of loan' },
    { maxLvr: 0.95, rate: 0.0340, label: '~3.4% of loan' },
    { maxLvr: Infinity, rate: 0.0430, label: '~4.3% of loan (>95% LVR)' }
  ];
  function lmiRate(lvr) { lvr = Math.round(lvr * 10000) / 10000; return lvr <= 0.80 ? 0 : lvr <= 0.85 ? 0.008 : lvr <= 0.90 ? 0.019 : lvr <= 0.95 ? 0.034 : 0.043; }
  function lmiTier(lvr) {
    lvr = Math.round(lvr * 10000) / 10000;
    for (var i = 0; i < LMI_TIERS.length; i++) if (lvr <= LMI_TIERS[i].maxLvr) return LMI_TIERS[i];
    return LMI_TIERS[LMI_TIERS.length - 1];
  }
  // LMI with no scheme, on a loan of price less the deposit. Not rounded.
  // Returns { lvr, loanBase, rate, lmi, loan } where loan = loanBase + lmi
  // (LMI is added to the loan).
  function lmi(price, depositPct) {
    var p = Number(price) || 0;
    var f = (Number(depositPct) || 0) / 100;
    var loanBase = p * (1 - f);
    var rate = lmiRate(1 - f);
    var amount = loanBase * rate;
    return { lvr: 1 - f, loanBase: loanBase, rate: rate, lmi: amount, loan: loanBase + amount };
  }

  // ═══ GRANTS AND SCHEMES ═══════════════════════════════════════════════
  // Moved from tools/first-home-buyer-grants-calculator.js (scheme settings
  // as at July 2026; QLD and TAS grants legislated, checked 18 Nov 2026).
  //   fhog        { amount, propertyCap (0 = none), capStrict (price must be
  //                 under the cap), newBuildOnly, note }
  //   fdsCap      5% Deposit Scheme price cap [capital city or regional
  //               centre, rest of the state]
  //   h2bCap      Help to Buy price cap, same shape
  //   fhbNote     one-line summary of the state's first home duty rules
  var SCHEMES = {
    nsw: {
      fhbNote: 'Full exemption up to $800k, sliding concession to $1m. Applies to new and established homes.',
      fhog: { amount: 10000, propertyCap: 600000, capStrict: false, newBuildOnly: true, note: 'New homes only, purchase ≤$600k (or land and build ≤$750k)' },
      fdsCap: [1500000, 800000], h2bCap: [1300000, 800000],
      revenueOffice: 'Revenue NSW', revenueUrl: 'https://www.revenue.nsw.gov.au/grants-schemes/first-home-buyer'
    },
    vic: {
      fhbNote: 'Full exemption up to $600k, sliding concession to $750k. Applies to new and established homes.',
      fhog: { amount: 10000, propertyCap: 750000, capStrict: false, newBuildOnly: true, note: 'New homes only, ≤$750k' },
      fdsCap: [950000, 650000], h2bCap: [950000, 650000],
      revenueOffice: 'State Revenue Office Victoria', revenueUrl: 'https://www.sro.vic.gov.au/first-home-owner-grant'
    },
    qld: {
      fhbNote: 'Established homes: full exemption to $700k, then a phased concession to $800k (QRO deducts a fixed amount per $10,000 band from the home-concession duty). New homes: duty nil with no value cap (contracts from 1 May 2025). From 1 Aug 2026 buyers must be Australian citizens, permanent residents or specified foreign retirees.',
      // $30k FHOG continues for eligible contracts from 1 Jul 2026: Act No. 16
      // of 2026, assent 29 Jun 2026. capStrict: QLD's cap is "less than
      // $750,000" (exclusive), unlike the "not exceeding" caps elsewhere.
      fhog: { amount: 30000, propertyCap: 750000, capStrict: true, newBuildOnly: true, note: 'New homes only, valued under $750,000 including land. $30,000 for contracts signed from 1 July 2026 (legislated June 2026).' },
      // Gold Coast + Sunshine Coast count as regional centres = capital cap.
      fdsCap: [1000000, 700000], h2bCap: [1000000, 700000],
      revenueOffice: 'Queensland Revenue Office', revenueUrl: 'https://qro.qld.gov.au/grants/first-home-owner-grant/'
    },
    sa: {
      fhbNote: 'Full relief on new homes, off-the-plan and vacant land only, with no value cap (contracts from 6 Jun 2024). No relief for established homes.',
      // FHOG has NO property value cap for contracts on/after 6 Jun 2024.
      fhog: { amount: 15000, propertyCap: 0, capStrict: false, newBuildOnly: true, note: 'New homes only, no property value cap (contracts on/after 6 Jun 2024)' },
      fdsCap: [900000, 500000], h2bCap: [900000, 500000],
      revenueOffice: 'RevenueSA', revenueUrl: 'https://www.revenuesa.sa.gov.au/grants-and-concessions/first-home-owners'
    },
    wa: {
      fhbNote: 'No duty up to $600,000, then a reduced rate up to $800,000, for agreements signed from 7 May 2026. Vacant land: no duty to $450,000, reduced to $550,000.',
      // FHOG cap $800k south of the 26th parallel (transactions from 7 May
      // 2026, was $750k); $1m north. The southern cap is applied.
      fhog: { amount: 10000, propertyCap: 800000, capStrict: false, newBuildOnly: true, note: 'New homes only. Cap $800k south of the 26th parallel ($1m north), transactions from 7 May 2026.' },
      fdsCap: [850000, 600000], h2bCap: [850000, 600000],
      revenueOffice: 'RevenueWA', revenueUrl: 'https://www.wa.gov.au/organisation/department-of-treasury-and-finance/first-home-owner-grant'
    },
    tas: {
      fhbNote: 'Tasmania’s established-home first home duty exemption ended 30 Jun 2026, so first home buyers now pay full duty.',
      // $20k for transactions commencing 1 Jul 2026 to 30 Jun 2027 (First Home
      // Owner Grant Amendment Act 2026, No. 9 of 2026, assent 10 Jul 2026).
      // Re-check before 1 Jul 2027.
      fhog: { amount: 20000, propertyCap: 0, capStrict: false, newBuildOnly: true, note: '$20,000 for transactions that start between 1 July 2026 and 30 June 2027. New homes only.' },
      fdsCap: [700000, 550000], h2bCap: [700000, 550000],
      revenueOffice: 'State Revenue Office Tasmania', revenueUrl: 'https://www.sro.tas.gov.au/about-us/grants'
    },
    act: {
      fhbNote: 'Home Buyer Concession Scheme from 1 Jul 2026: no duty for eligible buyers, with no income test and no property value limit. You must have owned no property in the previous 5 years and live in the home for 12 months.',
      fhog: { amount: 0, propertyCap: 0, capStrict: false, newBuildOnly: false, note: 'The ACT has no FHOG. The Home Buyer Concession Scheme (no duty) takes its place.' },
      fdsCap: [1000000, 1000000], h2bCap: [1000000, 1000000],
      revenueOffice: 'ACT Revenue Office', revenueUrl: 'https://www.revenue.act.gov.au/home-buyer-assistance'
    },
    nt: {
      fhbNote: 'The NT has no first home buyer duty concession, so this shows full duty. A new detached house bought with its land from a building contractor in a single transaction pays no duty if the contract is signed by 30 June 2027, whether or not it is your first home. Units, townhouses, duplexes and off-the-plan apartments pay full duty.',
      // HomeGrown Territory grant $50k: NEW homes only, contracts
      // 1 Oct 2024 to 30 Sep 2027, no price cap, no income test.
      fhog: { amount: 50000, propertyCap: 0, capStrict: false, newBuildOnly: true, note: '$50,000 HomeGrown Territory grant for new homes only. Contracts 1 Oct 2024 to 30 Sep 2027, no price cap, no income test. The established-home stream ended 30 Sep 2025.' },
      // 5% Deposit Scheme NT split effective 1 Jul 2026: $750k Darwin / $600k rest.
      fdsCap: [750000, 600000], h2bCap: [600000, 600000],
      revenueOffice: 'Territory Revenue Office', revenueUrl: 'https://nt.gov.au/property/home-owner-assistance'
    }
  };

  // 5% Deposit Scheme: NO income caps since 1 Oct 2025, unlimited places,
  // no waitlist. A deposit from 5% up to 20% (difference 3 in the header).
  var FDS = { minDepositPct: 5, maxDepositPct: 20 };
  // Help to Buy, from 1 Jul 2026: income caps $103,000 single and $165,000
  // joint or single parent; government share up to 40% new, 30%
  // established; 2% minimum deposit.
  var H2B = { incomeCap: { single: 103000, couple: 165000 }, equity: { 'new': 0.40, established: 0.30 }, minDepositPct: 2 };
  // First Home Super Saver: $15,000 a year of voluntary contributions, $50,000
  // in total, per person.
  var FHSS = { maxContribAnnual: 15000, maxTotal: 50000 };

  function isNewBuild(build) { return build === 'new' || build === 'offplan'; }
  // area 'capital' (capital city or major regional centre) takes the first
  // cap; anything else ('regional', the grants calculator's 'other', or
  // nothing) takes the rest-of-state cap, as both old copies did.
  function schemeCap(kind, state, area) {
    var s = SCHEMES[stateKey(state)];
    var caps = s ? (kind === 'h2b' ? s.h2bCap : s.fdsCap) : [0, 0];
    return area === 'capital' ? caps[0] : caps[1];
  }

  // firstHome as fhog(), fds() and h2b() read it when called on their own:
  // anything but false is a first home buyer. That is the grants
  // calculator's default (a page for first home buyers, with no question
  // about it). purchase() reads it strictly: only true is a first home buyer
  // and a missing answer is 'unknown' (header, item 7).
  function fhAnswer(v, missing) { return v === true ? 'yes' : v === false ? 'no' : missing; }

  // First Home Owner Grant. { amount, eligible, reason, text, note }.
  // reason: null | 'notFirstHome' | 'invest' | 'firstHomeUnknown' |
  // 'newOnly' | 'overCap' | 'none'. text is the grants calculator's
  // sentence. Not a first home buyer, or not living in it: no grant (every
  // state's FHOG needs both).
  function fhog(o) { o = o || {}; return fhogFor(o, fhAnswer(o.firstHome, 'yes')); }
  function fhogFor(o, fh) {
    var s = SCHEMES[stateKey(o.state)];
    var price = Number(o.price) || 0;
    if (!s) return { amount: 0, eligible: false, reason: 'none', text: '', note: '' };
    var g = s.fhog, isNew = isNewBuild(o.build);
    if (fh === 'no') return { amount: 0, eligible: false, reason: 'notFirstHome', text: 'Not eligible. The FHOG is only for first home buyers.', note: g.note };
    if (o.occupancy === 'invest') return { amount: 0, eligible: false, reason: 'invest', text: 'Not eligible. The FHOG is only for a home you will live in.', note: g.note };
    if (fh === 'unknown') return { amount: 0, eligible: false, reason: 'firstHomeUnknown', text: 'I don’t know yet whether this is your first home, so I haven’t counted the FHOG.', note: g.note };
    if (g.amount > 0) {
      var underCap = g.propertyCap === 0 || (g.capStrict ? price < g.propertyCap : price <= g.propertyCap);
      if ((!g.newBuildOnly || isNew) && underCap) return { amount: g.amount, eligible: true, reason: null, text: g.note, note: g.note };
      if (g.newBuildOnly && !isNew) return { amount: 0, eligible: false, reason: 'newOnly', text: 'Not eligible. The FHOG is only for new homes.', note: g.note };
      if (g.propertyCap && !underCap) return { amount: 0, eligible: false, reason: 'overCap', text: 'Not eligible. The price ' + (g.capStrict ? 'is not under' : 'is over') + ' the ' + m$(g.propertyCap) + ' FHOG cap.', note: g.note };
      return { amount: 0, eligible: false, reason: 'none', text: g.note, note: g.note };
    }
    return { amount: 0, eligible: false, reason: 'none', text: g.note || 'No FHOG in this state', note: g.note };
  }

  // 5% Deposit Scheme. { eligible, priceOk, cap, issue, lmiAvoided,
  //   minDepositPct, maxDepositPct, text }.
  // issue: null | 'invest' | 'notFirstHome' | 'firstHomeUnknown' | 'price'.
  // occupancy 'invest' gives 'invest'; with no occupancy it is a home, as
  // before. lmiAvoided is the LMI on a 5% deposit (95% LVR), not rounded; 0
  // when not eligible. text is the eligibility sentence, or why it doesn't
  // fit ('' for an unknown state). It says nothing about the deposit range,
  // which is not yet checked at Housing Australia (header, item 3).
  function fds(o) { o = o || {}; return fdsFor(o, fhAnswer(o.firstHome, 'yes')); }
  function fdsFor(o, fh) {
    var price = Number(o.price) || 0;
    var cap = schemeCap('fds', o.state, o.area);
    var priceOk = price <= cap;
    var issue = o.occupancy === 'invest' ? 'invest' : fh === 'no' ? 'notFirstHome'
      : fh === 'unknown' ? 'firstHomeUnknown' : (!priceOk ? 'price' : null);
    var eligible = issue === null;
    return {
      eligible: eligible, priceOk: priceOk, cap: cap,
      issue: issue,
      lmiAvoided: eligible ? lmi(price, FDS.minDepositPct).lmi : 0,
      minDepositPct: FDS.minDepositPct, maxDepositPct: FDS.maxDepositPct,
      text: SCHEMES[stateKey(o.state)] ? fdsText(issue, cap) : ''
    };
  }
  function fdsText(issue, cap) {
    switch (issue) {
      case null: return 'The price is within the ' + m$(cap) + ' cap for this area, so the 5% Deposit Scheme fits. Its guarantee replaces LMI, and there’s no income cap (since 1 October 2025). Only lenders on Housing Australia’s panel offer it.';
      case 'invest': return 'The 5% Deposit Scheme is only for a home you will live in.';
      case 'notFirstHome': return 'The 5% Deposit Scheme is for people who have never owned property in Australia, or haven’t owned any in the last 10 years.';
      case 'firstHomeUnknown': return 'I don’t know yet whether this is your first home, so I can’t tell whether the 5% Deposit Scheme fits.';
      case 'price': return 'The price is over the ' + m$(cap) + ' cap for this area, so the 5% Deposit Scheme doesn’t fit.';
    }
    return '';
  }

  // Help to Buy. { eligible, priceOk, incomeOk, incomeKnown, cap,
  //   incomeCap, capFor, equityShare, share, issue, minDepositPct, text }.
  //   capFor: 'couple' | 'singleParent' | 'single'. An unknown income (null
  //   or missing) is not counted against the cap. share = price x
  //   equityShare, not rounded. issue: null | 'invest' | 'notFirstHome' |
  //   'firstHomeUnknown' | 'price' | 'income' (price is reported before
  //   income, as the Journey does). occupancy 'invest' gives 'invest'; with
  //   no occupancy it is a home, as before. text is the eligibility
  //   sentence, or why it doesn't fit ('' for an unknown state).
  function h2b(o) { o = o || {}; return h2bFor(o, fhAnswer(o.firstHome, 'yes')); }
  function h2bFor(o, fh) {
    var price = Number(o.price) || 0;
    var cap = schemeCap('h2b', o.state, o.area);
    var deps = Number(o.dependants) || 0;
    var capFor = o.buyers === 'couple' ? 'couple' : (deps > 0 ? 'singleParent' : 'single');
    var incomeCap = capFor === 'single' ? H2B.incomeCap.single : H2B.incomeCap.couple;
    var hasIncome = o.income != null && o.income !== '' && isFinite(Number(o.income));
    var incomeOk = !hasIncome || Number(o.income) <= incomeCap;
    var priceOk = price <= cap;
    var equityShare = isNewBuild(o.build) ? H2B.equity['new'] : H2B.equity.established;
    var issue = o.occupancy === 'invest' ? 'invest' : fh === 'no' ? 'notFirstHome'
      : fh === 'unknown' ? 'firstHomeUnknown' : (!priceOk ? 'price' : (!incomeOk ? 'income' : null));
    var r = {
      eligible: issue === null, priceOk: priceOk, incomeOk: incomeOk, incomeKnown: hasIncome,
      cap: cap, incomeCap: incomeCap, capFor: capFor,
      equityShare: equityShare, share: price * equityShare,
      issue: issue,
      minDepositPct: H2B.minDepositPct
    };
    r.text = SCHEMES[stateKey(o.state)] ? h2bText(r, o.build) : '';
    return r;
  }
  // Who an income cap is for, as the Journey names them.
  var H2B_CAP_FOR = { couple: 'joint applicants', singleParent: 'single parents, the same as for joint applicants', single: 'single applicants without dependants' };
  function h2bShareWords(r, build) {
    var pct = Math.round(r.equityShare * 100) + '%';
    return isNewBuild(build) ? 'up to ' + pct + ' of a new home'
      : build === 'established' ? 'up to ' + pct + ' of an established home'
        : 'up to ' + pct + ', as I’ve assumed an established home';
  }
  function h2bText(r, build) {
    var who = H2B_CAP_FOR[r.capFor];
    switch (r.issue) {
      case null:
        return 'The price is within the ' + m$(r.cap) + ' Help to Buy cap for this area' +
          (r.incomeKnown
            ? ' and the household income is within the ' + m$(r.incomeCap) + ' cap for ' + who + ', so Help to Buy fits.'
            : '. I haven’t checked the income caps (' + m$(H2B.incomeCap.single) + ' single, ' + m$(H2B.incomeCap.couple) + ' joint or single parent) because I don’t have your household income.') +
          ' You need a 2% deposit, and the government takes a share of ' + h2bShareWords(r, build) +
          '. It takes its proportional share of any gain when you sell or refinance.';
      case 'invest': return 'Help to Buy is only for a home you will live in.';
      case 'notFirstHome': return 'I only work out Help to Buy for first home buyers.';
      case 'firstHomeUnknown': return 'I don’t know yet whether this is your first home, so I can’t tell whether Help to Buy fits.';
      case 'price': return 'The price is over the ' + m$(r.cap) + ' Help to Buy cap for this area.';
      case 'income': return 'The household income is over the ' + m$(r.incomeCap) + ' Help to Buy cap for ' + who + ' (caps from 1 July 2026).';
    }
    return '';
  }

  // ═══ TAX AND BORROWING ════════════════════════════════════════════════
  // Moved from tools/borrowing-power-calculator.js (FY2026-27, checked
  // 5 Jul 2026).

  // ATO resident individual tax (FY 2026-27) plus the Medicare levy.
  function approxTax(gross) {
    // FY 2026-27 brackets (second rate cut 16% -> 15% from 1 Jul 2026).
    var tax = 0;
    if (gross <= 18200) tax = 0;
    else if (gross <= 45000) tax = (gross - 18200) * 0.15;
    else if (gross <= 135000) tax = 4020 + (gross - 45000) * 0.30;
    else if (gross <= 190000) tax = 31020 + (gross - 135000) * 0.37;
    else tax = 51370 + (gross - 190000) * 0.45;
    // Medicare levy: 0% below $28,011; sliding 10% of excess in $28,011-$35,013;
    // flat 2% above $35,013 (singles). FY 2025-26 thresholds (latest published;
    // 2026-27 legislated retrospectively each year).
    if (gross > 35013) tax += gross * 0.02;
    else if (gross > 28011) tax += (gross - 28011) * 0.10;
    return tax;
  }

  // HELP repayment, marginal system from 1 Jul 2025 (FY 2026-27 schedule):
  //   repayment income <= $69,528: nil
  //   $69,529-$129,717: 15c per $1 over $69,528
  //   $129,718-$186,050: $9,028 + 17c per $1 over $129,717
  //   $186,051+: 10% of TOTAL repayment income (ATO Example 3). The two
  //     formulas meet at $186,050, so the repayment does not jump.
  // Gross income stands in for repayment income.
  function hecsAnnual(gross) {
    if (gross <= 69528) return 0;
    if (gross <= 129717) return (gross - 69528) * 0.15;
    if (gross <= 186050) return 9028 + (gross - 129717) * 0.17;
    return gross * 0.10;
  }

  // Living-cost floor: my own rough stand-in for the Household Expenditure
  // Measure (the real table is licensed data I do not have). Household gross
  // income a year, adults, dependants -> $ a month.
  function hemMonthly(annualHouseholdGrossIncome, adults, dependants) {
    var I = annualHouseholdGrossIncome;
    var perAdult;
    if (I < 50000) perAdult = 1750;
    else if (I < 80000) perAdult = 1950;
    else if (I < 120000) perAdult = 2150;
    else if (I < 180000) perAdult = 2400;
    else if (I < 250000) perAdult = 2700;
    else if (I < 350000) perAdult = 3050;
    else perAdult = 3400;
    // Second adult adds ~70% of base (economies of scale)
    var adultsCost = adults <= 1 ? perAdult : perAdult + (adults - 1) * Math.round(perAdult * 0.70);
    var depCost;
    if (I < 80000) depCost = 700;
    else if (I < 180000) depCost = 800;
    else if (I < 350000) depCost = 880;
    else depCost = 950;
    return adultsCost + dependants * depCost;
  }

  // Share of after-tax income a lender counts, by income type (my
  // assumptions about common lender policy). 'self' is the Journey's and
  // "your details" name for self-employed.
  function incomeTypeFactor(type) {
    switch (type) {
      case 'casual':       return 0.80;
      case 'self':         return 0.80;
      case 'self-employed':return 0.80; // 2-yr average usually, conservative
      case 'rental':       return 0.75;
      case 'paygVariable': return 0.90;
      case 'payg':         return 1.00;
      default:             return 1.00;
    }
  }

  // Largest loan a monthly budget repays at a rate (% a year) over years.
  function maxLoanFromRepayment(monthlyBudget, annualRatePct, years) {
    if (monthlyBudget <= 0) return 0;
    var r = annualRatePct / 100 / 12;
    var n = years * 12;
    if (r === 0) return monthlyBudget * n;
    return monthlyBudget * (Math.pow(1 + r, n) - 1) / (r * Math.pow(1 + r, n));
  }

  var ASSESS_BUFFER = 3;      // percentage points over the loan rate
  var CARD_RATE = 0.03;       // of the total card limit, each month

  // The lender test (Journey step 3 and the borrowing power calculator):
  // after-tax income, counted by income type, less the higher of declared
  // living costs and the living-cost floor, 3% of card limits a month, HELP
  // repayments and other debt repayments; what is left repays a loan tested
  // at the rate plus 3%.
  //   incomes       [$ a year per applicant]; or income + buyers, split
  //                 equally (split: true in the result)
  //   types         [type per applicant] (or employment: one type for all)
  //   hecs          [bool per applicant]
  //   dependants, cardLimits ($ total), debtsMonthly, livingMonthly
  //   rate (% a year), termYears
  // Returns null when there is no income to test. Otherwise every line, in
  // $ a month: net, hem, living (the higher of declared and hem), card,
  // hecs, debts, available (net less all of those, can be negative), left
  // (available, at least 0), plus assessRate, maxLoan and lines[].
  function borrow(o) {
    o = o || {};
    var incomes, split = false;
    if (Array.isArray(o.incomes) && o.incomes.length) {
      incomes = o.incomes.map(function (x) { return Number(x) || 0; });
    } else {
      var total = Number(o.income) || 0;
      var adultsS = o.buyers === 'couple' ? 2 : 1;
      var each = total / adultsS;
      incomes = [];
      for (var k = 0; k < adultsS; k++) incomes.push(each);
      split = adultsS > 1;
    }
    var gross = 0;
    for (var g = 0; g < incomes.length; g++) gross += incomes[g];
    if (!(gross > 0)) return null;
    var adults = o.adults || incomes.length;
    var types = Array.isArray(o.types) ? o.types : [];
    var hecs = Array.isArray(o.hecs) ? o.hecs : [];
    var netAnnual = 0, hecsMo = 0;
    for (var i = 0; i < incomes.length; i++) {
      var inc = incomes[i];
      var type = types[i] || o.employment || 'payg';
      netAnnual += inc > 0 ? (inc - approxTax(inc)) * incomeTypeFactor(type) : 0;
      if (hecs[i]) hecsMo += hecsAnnual(inc) / 12;
    }
    var net = netAnnual / 12;
    var deps = Number(o.dependants) || 0;
    var hem = hemMonthly(gross, adults, deps);
    var declared = Number(o.livingMonthly) || 0;
    var living = Math.max(declared, hem);
    var card = (Number(o.cardLimits) || 0) * CARD_RATE;
    var debts = Number(o.debtsMonthly) || 0;
    var available = net - living - card - hecsMo - debts;
    var left = Math.max(0, available);
    var rate = o.rate != null && o.rate !== '' && isFinite(Number(o.rate)) ? Number(o.rate) : DEFAULT_RATE;
    var termYears = Number(o.termYears) || DEFAULT_TERM_YEARS;
    var assessRate = rate + ASSESS_BUFFER;
    var maxLoan = maxLoanFromRepayment(left, assessRate, termYears);
    return {
      adults: adults, incomes: incomes, split: split, gross: gross,
      netAnnual: netAnnual, net: net, hem: hem, declaredLiving: declared, living: living,
      livingIsFloor: living === hem && declared < hem,
      card: card, hecs: hecsMo, debts: debts, available: available, left: left,
      rate: rate, assessRate: assessRate, termYears: termYears, maxLoan: maxLoan,
      lines: [
        { key: 'net', amount: net, source: 'tax' },
        { key: 'living', amount: -living, source: 'hem' },
        { key: 'card', amount: -card, source: 'borrowing' },
        { key: 'hecs', amount: -hecsMo, source: 'hecs' },
        { key: 'debts', amount: -debts, source: null },
        { key: 'left', amount: left, source: 'borrowing' }
      ]
    };
  }

  // ═══ REPAYMENTS ═══════════════════════════════════════════════════════
  // Moved from tools/mortgage-repayment-calculator.js. Rates are % a year.
  var DEFAULT_RATE = 6.0;          // owner decision pending (header)
  var DEFAULT_TERM_YEARS = 30;

  // Monthly principal and interest.
  function repay(loan, rate, termYears) {
    var P = Number(loan) || 0, years = Number(termYears) || 0;
    if (P <= 0 || years <= 0) return 0;
    var r = (Number(rate) || 0) / 100 / 12;
    var n = years * 12;
    if (r === 0) return P / n;
    return P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
  }
  function repayInterestOnly(loan, rate) { return (Number(loan) || 0) * ((Number(rate) || 0) / 100) / 12; }

  // Walks the loan month by month, with optional extra repayments, an
  // offset balance and an interest-only period. Returns { monthsToPayoff,
  // totalInterest, schedule[{ year, openBal, interest, principal, closeBal }],
  // paidOffEarly, postIoPayment }. The offset cuts the balance interest is
  // charged on; the scheduled repayment stays the same, so more of each
  // payment goes to principal. When the interest-only period ends the loan
  // reverts to principal and interest over the REMAINING term.
  function simulateAmortisation(p) {
    var principal = p.principal, annualRate = p.annualRate, years = p.years;
    var repayMonthly = p.repayMonthly, extraMonthly = p.extraMonthly, offsetBalance = p.offsetBalance, ioYears = p.ioYears;
    var r = annualRate / 12;
    var totalMonths = years * 12;
    var ioMonths = Math.max(0, Math.min(years, ioYears || 0)) * 12;
    var balance = principal;
    var cumInterest = 0;
    var postIoPayment = null;
    var schedule = [];
    var yearOpenBal = balance;
    var yearInterest = 0;
    var yearPrincipal = 0;
    for (var m = 1; m <= totalMonths * 1.2 && balance > 0.01; m++) {
      var effectiveBalance = Math.max(0, balance - Math.max(0, offsetBalance || 0));
      var interest = effectiveBalance * r;
      var payment = repayMonthly + (extraMonthly || 0);
      var principalPaid;
      if (m <= ioMonths) {
        // Interest-only period: the required payment is interest only. Any
        // extra repayment still comes off the principal.
        principalPaid = Math.min(balance, extraMonthly || 0);
        payment = interest + principalPaid;
      } else {
        if (ioMonths > 0 && postIoPayment === null) {
          var remMonths = Math.max(1, totalMonths - ioMonths);
          postIoPayment = r > 0
            ? (balance * r) / (1 - Math.pow(1 + r, -remMonths))
            : balance / remMonths;
        }
        if (postIoPayment !== null) payment = postIoPayment + (extraMonthly || 0);
        principalPaid = payment - interest;
        if (principalPaid > balance) {
          principalPaid = balance;
          payment = interest + principalPaid;
        }
      }
      balance -= principalPaid;
      cumInterest += interest;
      yearInterest += interest;
      yearPrincipal += principalPaid;
      if (m % 12 === 0 || balance <= 0.01) {
        schedule.push({
          year: Math.ceil(m / 12),
          openBal: Math.round(yearOpenBal),
          interest: Math.round(yearInterest),
          principal: Math.round(yearPrincipal),
          closeBal: Math.round(Math.max(0, balance))
        });
        yearOpenBal = balance;
        yearInterest = 0;
        yearPrincipal = 0;
      }
      if (balance <= 0.01) {
        return { monthsToPayoff: m, totalInterest: cumInterest, schedule: schedule, paidOffEarly: m < totalMonths, postIoPayment: postIoPayment };
      }
    }
    return { monthsToPayoff: totalMonths, totalInterest: cumInterest, schedule: schedule, paidOffEarly: false, postIoPayment: postIoPayment };
  }

  // True fortnightly: half the monthly repayment every 14 days, 26 a year
  // (13 monthly repayments' worth), interest charged each fortnight.
  function simulateFortnightly(p) {
    var principal = p.principal, annualRate = p.annualRate, years = p.years, monthlyPI = p.monthlyPI;
    var fortnightlyRate = annualRate / 26;
    var fortnightlyPayment = monthlyPI / 2;
    var maxFortnights = years * 26 * 1.05;
    var balance = principal;
    var cumInterest = 0;
    var fortnights = 0;
    while (balance > 0.01 && fortnights < maxFortnights) {
      var interest = balance * fortnightlyRate;
      var principalPaid = fortnightlyPayment - interest;
      if (principalPaid <= 0) {
        // The payment doesn't cover the interest: it never pays off.
        return { fortnights: maxFortnights, totalInterest: cumInterest, willPayOff: false };
      }
      if (principalPaid > balance) principalPaid = balance;
      balance -= principalPaid;
      cumInterest += interest;
      fortnights++;
    }
    return { fortnights: fortnights, totalInterest: cumInterest, willPayOff: true };
  }

  // schedule(loan, rate, termYears, { fortnightly, extra, offset, ioYears })
  // Monthly (default): simulateAmortisation's result plus `monthly`, the
  // scheduled principal and interest repayment. Fortnightly: { fortnights,
  // totalInterest, willPayOff, payment } where payment is half the monthly.
  function schedule(loan, rate, termYears, opts) {
    opts = opts || {};
    var P = Number(loan) || 0, years = Number(termYears) || 0;
    var annualRate = (Number(rate) || 0) / 100;
    var monthly = repay(P, rate, years);
    if (opts.fortnightly) {
      var f = simulateFortnightly({ principal: P, annualRate: annualRate, years: years, monthlyPI: monthly });
      f.payment = monthly / 2;
      return f;
    }
    var s = simulateAmortisation({
      principal: P, annualRate: annualRate, years: years, repayMonthly: monthly,
      extraMonthly: Number(opts.extra) || 0, offsetBalance: Number(opts.offset) || 0, ioYears: Number(opts.ioYears) || 0
    });
    s.monthly = monthly;
    return s;
  }

  // purchase().schemeNote: what the chosen scheme did, or why I haven't
  // applied it. r is that scheme's fds() or h2b() result.
  function schemeNote(scheme, applied, issue, r, share) {
    if (scheme === 'none') return '';
    var fdsName = scheme === 'fds';
    if (applied) {
      return fdsName ? 'The 5% Deposit Scheme’s guarantee replaces LMI, so there’s none on this loan.'
        : 'The government’s ' + Math.round(r.equityShare * 100) + '% share, ' + m$(share) + ', comes off the loan, and there’s no LMI.';
    }
    var name = fdsName ? 'the 5% Deposit Scheme' : 'Help to Buy';
    switch (issue) {
      case 'invest': return (fdsName ? 'The 5% Deposit Scheme' : 'Help to Buy') + ' is only for a home you will live in, so I haven’t applied it.';
      case 'notFirstHome': return fdsName
        ? 'The 5% Deposit Scheme is for people who have never owned property in Australia, or haven’t owned any in the last 10 years, so I haven’t applied it.'
        : 'I only work out Help to Buy for first home buyers, so I haven’t applied it.';
      case 'firstHomeUnknown': return 'I don’t know yet whether this is your first home, so I haven’t applied ' + name + '.';
      case 'price': return 'The price is over the ' + m$(r.cap) + (fdsName ? ' cap' : ' Help to Buy cap') + ' for this area, so I haven’t applied ' + (fdsName ? name : 'it') + '.';
      case 'income': return 'The household income is over the ' + m$(r.incomeCap) + ' Help to Buy cap for ' + H2B_CAP_FOR[r.capFor] + ', so I haven’t applied it.';
      case 'deposit': return (fdsName ? 'The 5% Deposit Scheme needs a deposit of at least ' + FDS.minDepositPct + '%' : 'Help to Buy needs a deposit of at least ' + H2B.minDepositPct + '%') + ', so I haven’t applied it.';
      case 'depositHigh': return fdsName
        ? 'With a deposit of ' + FDS.maxDepositPct + '% or more there’s no LMI for the 5% Deposit Scheme to replace, so I haven’t applied it.'
        : 'With this deposit, the government’s ' + Math.round(r.equityShare * 100) + '% share would leave nothing to borrow, so I haven’t applied Help to Buy.';
    }
    return '';
  }

  // ═══ ONE PURCHASE ═════════════════════════════════════════════════════
  // Journey step 3's figures for one property (journey.js budgetLmi,
  // budgetLoan, otherCosts and the cash-needed sum), for any deposit and
  // scheme:
  //   state, area, price, firstHome, occupancy, build, land, foreign
  //   depositPct    deposit as a % of the price
  //   scheme        'none' | 'fds' | 'h2b'
  //   buyers, income, dependants   for the Help to Buy income cap
  //   extras        $ total, or [{ amount }], added to cash needed
  // Cash needed = deposit + duty (+ any foreign surcharge) + legal and
  // registration (rounded to $50) + extras. LMI is added to the loan. A page
  // that offers paying LMI in cash adds `lmi` to cash needed itself.
  // firstHome: only true is a first home buyer. Missing (or anything other
  // than true or false) is a question not answered yet: no first home duty
  // concession, no scheme and no FHOG, firstHome null in the result and a
  // firstHomeNote saying so (header, item 7).
  // A scheme that doesn't fit is not applied: schemeApplied false and
  // schemeIssue says why: 'invest', 'notFirstHome', 'firstHomeUnknown',
  // 'price', 'income', 'deposit' (under the scheme's minimum: 5% or 2%) or
  // 'depositHigh' (20% or more for the 5% Deposit Scheme; for Help to Buy, a
  // deposit that with the government's full share covers the whole price).
  // schemeNote is one sentence for the chosen scheme: what it did, or why I
  // haven't applied it ('' with no scheme). fds.text and h2b.text are each
  // scheme's eligibility sentence for this buyer, whichever is chosen.
  function purchase(o) {
    o = o || {};
    var st = stateKey(o.state);
    var price = Number(o.price) || 0;
    var depositPct = Number(o.depositPct) || 0;
    var f = depositPct / 100;
    var scheme = o.scheme === 'fds' || o.scheme === 'h2b' ? o.scheme : 'none';
    var home = o.occupancy !== 'invest';
    // One reading of firstHome for duty, both schemes and the FHOG.
    var fh = fhAnswer(o.firstHome, 'unknown');
    var d = duty({ state: st, price: price, firstHome: fh === 'yes', occupancy: o.occupancy, build: o.build, land: o.land, foreign: o.foreign });
    var registration = regFees(st, price);
    var legalReg = legalAndRegistration(st, price);
    var fdsR = fdsFor({ state: st, area: o.area, price: price, occupancy: o.occupancy }, fh);
    var h2bR = h2bFor({ state: st, area: o.area, price: price, income: o.income, buyers: o.buyers, dependants: o.dependants, build: o.build, occupancy: o.occupancy }, fh);
    var fhogR = fhogFor({ state: st, price: price, build: o.build, occupancy: o.occupancy }, fh);
    var extras = 0;
    if (Array.isArray(o.extras)) o.extras.forEach(function (x) { extras += Number(x && x.amount != null ? x.amount : x) || 0; });
    else extras = Number(o.extras) || 0;

    var schemeApplied = false, schemeIssue = null;
    if (scheme !== 'none') {
      var sr = scheme === 'fds' ? fdsR : h2bR;
      var minDep = scheme === 'fds' ? FDS.minDepositPct : H2B.minDepositPct;
      // sr.issue reports an investment first, then first home, price and
      // income.
      if (!sr.eligible) schemeIssue = sr.issue;
      else if (depositPct < minDep - 1e-9) schemeIssue = 'deposit';
      // The 5% Deposit Scheme covers a deposit under 20%; at 20% or more
      // there is no LMI for it to waive (header, item 3).
      else if (scheme === 'fds' && depositPct >= FDS.maxDepositPct - 1e-9) schemeIssue = 'depositHigh';
      // Help to Buy: a deposit that, with the government's full share,
      // covers the whole price would leave a loan of $0 or less. The scheme
      // is not applied, rather than showing a negative loan or making up a
      // smaller share.
      else if (scheme === 'h2b' && f + h2bR.equityShare >= 1 - 1e-9) schemeIssue = 'depositHigh';
      else schemeApplied = true;
    }
    var deposit = price * f;
    var lmiAmt = 0, lmiR = 0, loanBase, h2bShare = 0;
    if (schemeApplied && scheme === 'h2b') {
      // The government's share comes off the loan; no LMI.
      h2bShare = price * h2bR.equityShare;
      loanBase = price * (1 - f - h2bR.equityShare);
    } else {
      loanBase = price * (1 - f);
      if (!(f >= 0.20) && !(schemeApplied && scheme === 'fds')) {
        var L = lmi(price, depositPct);
        lmiAmt = L.lmi; lmiR = L.rate;
      }
    }
    var loan = loanBase + lmiAmt;
    var costs = d.total + legalReg;
    var cashNeeded = deposit + costs + extras;
    return {
      state: st, price: price, depositPct: depositPct, deposit: deposit, scheme: scheme,
      firstHome: fh === 'yes' ? true : fh === 'no' ? false : null,
      firstHomeNote: fh === 'unknown' && home ? 'I don’t know yet whether this is your first home, so I’ve left out the first home duty concessions, the FHOG and the schemes.' : '',
      schemeApplied: schemeApplied, schemeIssue: schemeIssue,
      schemeNote: schemeNote(scheme, schemeApplied, schemeIssue, scheme === 'fds' ? fdsR : h2bR, h2bShare),
      duty: d.duty, dutyNote: d.note, dutyBasis: d.basis, surcharge: d.surcharge,
      registration: registration, conveyancing: CONVEYANCING, legalAndRegistration: legalReg,
      costs: costs, extras: extras, lvr: price > 0 ? loanBase / price : 0,
      lmi: lmiAmt, lmiRate: lmiR, loanBase: loanBase, loan: loan, h2bShare: h2bShare,
      cashNeeded: cashNeeded,
      fds: fdsR, h2b: h2bR, fhog: fhogR
    };
  }

  // The deposit that uses all the savings: savings less duty, registration
  // and conveyancing (the Journey's rounded figure), at least 0 and no more
  // than the price. No 20% cap; LMI goes on the loan. Same inputs as duty()
  // plus saved, and firstHome read as purchase() reads it (only true is a
  // first home buyer), so the costs match purchase() for the same inputs.
  // { deposit, depositPct, costs, short } where short is how far the
  // savings fall below the costs alone.
  function depositFromSavings(o) {
    o = o || {};
    var price = Number(o.price) || 0;
    var saved = Number(o.saved) || 0;
    var d = duty({ state: o.state, price: price, firstHome: o.firstHome === true, occupancy: o.occupancy, build: o.build, land: o.land, foreign: o.foreign });
    var costs = d.total + legalAndRegistration(o.state, price);
    var dep = Math.min(price, Math.max(0, saved - costs));
    return { deposit: dep, depositPct: price > 0 ? dep / price * 100 : 0, costs: costs, short: Math.max(0, costs - saved) };
  }

  // ═══ MONEY INPUT ══════════════════════════════════════════════════════
  // journey.js parseNum(): accepts "650,000", "$650000", "650k" and "1.2m".
  // parseMoney() returns the same value for anything it accepts, and refuses
  // a blank, letters, a range, a negative or more than one decimal point:
  //   { value: n } or { value: null, error, message }
  //   error: 'blank' | 'negative' | 'range' | 'letters' | 'invalid'
  function parseNumLoose(s) {
    var str = String(s == null ? '' : s).trim().toLowerCase();
    var mult = /[0-9.]\s*m\b/.test(str) ? 1000000 : /[0-9.]\s*k\b/.test(str) ? 1000 : 1;
    var n = parseFloat(str.replace(/[^0-9.]/g, ''));
    return isFinite(n) ? n * mult : 0;
  }
  var MONEY_MESSAGES = {
    blank: 'Enter an amount, for example 650,000.',
    negative: 'Enter an amount of $0 or more.',
    range: 'Enter one amount, for example 650,000.',
    letters: 'Use numbers only, for example 650,000 or 650k.',
    invalid: 'Check the amount, for example 650,000.'
  };
  function moneyError(code) { return { value: null, error: code, message: MONEY_MESSAGES[code] }; }
  function parseMoney(text) {
    var str = String(text == null ? '' : text).trim().toLowerCase();
    if (!str) return moneyError('blank');
    if (/^[-−(]/.test(str) || /^\$\s*[-−]/.test(str)) return moneyError('negative');
    if (/[0-9]\s*[km]?\s*(?:[-–—]|to\b)\s*\$?\s*[0-9.]/.test(str)) return moneyError('range');
    var body = str.replace(/^\$\s*/, '').replace(/^aud\s*/, '').replace(/\s*aud$/, '');
    var m = /^([0-9][0-9,\s]*(?:\.[0-9]*)?|\.[0-9]+)\s*([km])?$/.exec(body);
    if (!m) return moneyError(/[a-z]/.test(body) ? 'letters' : 'invalid');
    var digits = m[1].replace(/[,\s]/g, '');
    if (!/[0-9]/.test(digits)) return moneyError('invalid');
    var value = parseNumLoose(str);
    if (!isFinite(value)) return moneyError('invalid');
    return { value: value };
  }

  // ═══ SOURCES ══════════════════════════════════════════════════════════
  // Everything a caption needs: the financial year, when each part was
  // checked and where it comes from.
  var META = {
    fy: '2026-27',
    duty: {
      schedule: 'FY2026-27',
      checked: '5 July 2026',
      changed: '18 November 2026 (NSW first home duty from $800,000 to $1,000,000 under Duties Act 1997 s 78A; the WA first home owner rate; NT new homes)',
      sources: {
        nsw: { name: 'Revenue NSW', url: 'https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty' },
        vic: { name: 'State Revenue Office Victoria', url: 'https://www.sro.vic.gov.au/land-transfer-duty' },
        qld: { name: 'Queensland Revenue Office', url: 'https://qro.qld.gov.au/duties/transfer-duty/' },
        sa: { name: 'RevenueSA', url: 'https://www.revenuesa.sa.gov.au/stampduty' },
        wa: { name: 'RevenueWA', url: 'https://www.wa.gov.au/organisation/department-of-treasury-and-finance/transfer-duty' },
        tas: { name: 'State Revenue Office Tasmania', url: 'https://www.sro.tas.gov.au/property-transfer-duties' },
        act: { name: 'ACT Revenue Office', url: 'https://www.revenue.act.gov.au/duties/conveyance-duty' },
        nt: { name: 'Territory Revenue Office', url: 'https://nt.gov.au/property/buying-and-selling-a-home/settle-the-sale/stamp-duty-buying-or-selling-a-home' }
      }
    },
    registration: {
      schedule: 'FY2026-27',
      checked: '6 July 2026',
      sources: {
        nsw: 'NSW Land Registry Services', vic: 'Land Use Victoria', qld: 'Titles Queensland',
        sa: 'Land Services SA', wa: 'Landgate', tas: 'Land Titles Office, NRE Tasmania',
        act: 'ACT Land Titles (Determination DI2026-104)', nt: 'NT Land Titles Office'
      }
    },
    conveyancing: { amount: CONVEYANCING, range: CONVEYANCING_RANGE, basis: 'My estimate of a typical quote, with no official source.' },
    lmi: { basis: 'My own rough rates by LVR band, with no published rate table behind them. Ask your lender for the premium.' },
    schemes: {
      checked: 'July 2026',
      changed: '18 November 2026 (QLD and TAS grants confirmed in legislation)',
      // depositRangeChecked: false until someone reads the range on
      // housingaustralia.gov.au itself (header, item 3).
      fds: { name: '5% Deposit Scheme', url: 'https://www.housingaustralia.gov.au/first-home-guarantee',
        depositRange: 'A deposit from 5% up to 20% of the property value.',
        depositRangeSource: 'Housing Australia, as quoted by participating lenders, November 2026',
        depositRangeChecked: false },
      h2b: { name: 'Help to Buy', url: 'https://www.housingaustralia.gov.au/help-to-buy' },
      fhss: { name: 'First Home Super Saver scheme', url: 'https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/early-access-to-super/first-home-super-saver-scheme' },
      firsthomebuyers: 'https://www.firsthomebuyers.gov.au/'
    },
    tax: { fy: '2026-27', checked: '5 July 2026', source: 'https://www.ato.gov.au/rates/individual-income-tax-rates/', medicare: 'Medicare levy thresholds are the FY2025-26 figures, the latest published.' },
    hecs: { fy: '2026-27', checked: '5 July 2026', source: 'https://www.ato.gov.au/individuals/study-and-training-support-loans/' },
    hem: { basis: 'My own rough stand-in for the Household Expenditure Measure, not the licensed table.', source: 'https://melbourneinstitute.unimelb.edu.au/research/hem' },
    borrowing: { buffer: ASSESS_BUFFER, cardRate: CARD_RATE, source: 'https://www.apra.gov.au/sites/default/files/apg_223.pdf' },
    // decided: false until the owner picks the one default rate (plan
    // section 10, item 1). asAt is the month a caption prints with it.
    defaultRate: { value: DEFAULT_RATE, decided: false, asAt: null }
  };

  deepFreeze(stateData);
  deepFreeze(REG_FEES);
  deepFreeze(SCALED_REG);
  deepFreeze(LMI_TIERS);
  deepFreeze(SCHEMES);
  deepFreeze(FDS);
  deepFreeze(H2B);
  deepFreeze(FHSS);
  deepFreeze(META);
  deepFreeze(MONEY_MESSAGES);
  deepFreeze(CONVEYANCING_RANGE);
  deepFreeze(INSPECTION_RANGE);
  deepFreeze(LOAN_FEE_RANGE);

  return Object.freeze({
    VERSION: 1,
    STATES: Object.freeze(STATE_CODES.slice()),
    STATE_DATA: stateData,
    SCHEMES: SCHEMES,
    REG_FEES: REG_FEES,
    SCALED_REG: SCALED_REG,
    LMI_TIERS: LMI_TIERS,
    FDS: FDS,
    H2B: H2B,
    FHSS: FHSS,
    NEW_HOME_DUTY_FREE: deepFreeze(NEW_HOME_DUTY_FREE),
    CONVEYANCING: CONVEYANCING,
    CONVEYANCING_RANGE: CONVEYANCING_RANGE,
    INSPECTION: INSPECTION,
    INSPECTION_RANGE: INSPECTION_RANGE,
    LOAN_FEE_RANGE: LOAN_FEE_RANGE,
    ASSESS_BUFFER: ASSESS_BUFFER,
    CARD_RATE: CARD_RATE,
    DEFAULT_RATE: DEFAULT_RATE,
    DEFAULT_TERM_YEARS: DEFAULT_TERM_YEARS,
    MONEY_MESSAGES: MONEY_MESSAGES,
    META: META,
    // duty
    duty: duty,
    calcDuty: calcDuty,
    qldHomeDuty: qldHomeDuty,
    qldFhbConcessionAmt: qldFhbConcessionAmt,
    applyFhbConcession: applyFhbConcession,
    // costs
    regFees: regFees,
    regFeesTotal: regFeesTotal,
    legalAndRegistration: legalAndRegistration,
    lmi: lmi,
    lmiRate: lmiRate,
    lmiTier: lmiTier,
    // grants and schemes
    fhog: fhog,
    fds: fds,
    h2b: h2b,
    schemeCap: schemeCap,
    // tax and borrowing
    approxTax: approxTax,
    hecsAnnual: hecsAnnual,
    hemMonthly: hemMonthly,
    incomeTypeFactor: incomeTypeFactor,
    maxLoanFromRepayment: maxLoanFromRepayment,
    borrow: borrow,
    // repayments
    repay: repay,
    repayInterestOnly: repayInterestOnly,
    schedule: schedule,
    simulateAmortisation: simulateAmortisation,
    simulateFortnightly: simulateFortnightly,
    // one purchase
    purchase: purchase,
    depositFromSavings: depositFromSavings,
    // input
    parseMoney: parseMoney,
    parseNumLoose: parseNumLoose
  });
});
