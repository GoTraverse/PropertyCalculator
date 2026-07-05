/* ═══ LAND TAX CALCULATOR — all 8 Australian jurisdictions ═══
 *
 * Annual land tax for property investors, with multi-property aggregation
 * and owner-type handling (individual / company / trust / foreign-absentee).
 *
 * Rate schedules extracted from the official state and territory revenue
 * offices on 5 July 2026 and adversarially verified — every bracket taken
 * verbatim, official worked examples recomputed:
 *   NSW  individual $1,655,000 → $9,380   (Revenue NSW example)
 *   QLD  absentee   $400,000   → $3,800   ($2,300 base + $1,500 surcharge)
 *   SA   general    $1,575,000 → $3,550   (per-$100-or-part rounding)
 *
 * Aggregation: every state aggregates all taxable land per owner EXCEPT the
 * ACT, which assesses each property separately (fixed charge + marginal on
 * the 5-yr-average AUV) with no threshold. The NT levies no land tax at all.
 * SA computes tax per "$100 or part of $100" — Math.ceil of the excess in
 * hundreds (see saHundreds()).
 */

/* ── Per-state metadata: office, source URL, assessment basis ── */
var LT_META = {
  nsw: {
    name: 'New South Wales', office: 'Revenue NSW',
    url: 'https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/land-tax/understanding-land-tax/thresholds-and-rates',
    basis: 'NSW 2026 land tax year schedule (holdings at midnight 31 December 2025; 3-year-averaged Valuer General land values)',
    assess: 'NSW assesses all taxable land you held at midnight 31 December 2025 for the 2026 tax year, aggregated across the state on 3-year-averaged land values.'
  },
  vic: {
    name: 'Victoria', office: 'State Revenue Office Victoria',
    url: 'https://www.sro.vic.gov.au/land-tax-current-rates',
    basis: 'VIC 2026 schedule (2024–2033 scale; holdings at midnight 31 December 2025; site values)',
    assess: 'Victoria assesses all taxable land held at midnight 31 December 2025 for the 2026 tax year, aggregated across the state on site values.'
  },
  qld: {
    name: 'Queensland', office: 'Queensland Revenue Office',
    url: 'https://qro.qld.gov.au/land-tax/calculate/',
    basis: 'QLD schedule (holdings at midnight 30 June; Valuer-General values)',
    assess: 'Queensland assesses the total taxable land you own at midnight 30 June each year, aggregated per owner.'
  },
  sa: {
    name: 'South Australia', office: 'RevenueSA',
    url: 'https://www.revenuesa.sa.gov.au/land-tax/rates-and-thresholds',
    basis: 'SA 2026-27 schedule (holdings at midnight 30 June 2026; site values; tax per $100 or part of $100)',
    assess: 'South Australia assesses land owned at midnight 30 June 2026 for 2026-27 on site values — aggregated, then apportioned between your properties. Tax is computed per $100 or part of $100 of the excess.'
  },
  wa: {
    name: 'Western Australia', office: 'RevenueWA (Department of Treasury and Finance)',
    url: 'https://www.wa.gov.au/organisation/department-of-treasury-and-finance/land-tax-assessment',
    basis: 'WA schedule (holdings at midnight 30 June; aggregated unimproved values)',
    assess: 'Western Australia assesses land owned at midnight 30 June on aggregated unimproved values. A single scale applies to every owner type.'
  },
  tas: {
    name: 'Tasmania', office: 'State Revenue Office Tasmania',
    url: 'https://www.sro.tas.gov.au/land-tax/rates-of-land-tax',
    basis: 'TAS schedule applying from 1 July 2025 (General Land owned at 1 July)',
    assess: 'Tasmania assesses General Land owned at 1 July each year (scale current from 1 July 2025). Principal residence land and primary production land are classified separately and not taxed.'
  },
  act: {
    name: 'Australian Capital Territory', office: 'ACT Revenue Office',
    url: 'https://www.revenue.act.gov.au/rates-and-property-charges/land-tax/how-land-tax-is-calculated',
    basis: 'ACT 2026-27 quarterly schedule (5-year-average AUV, assessed per property)',
    assess: 'The ACT assesses each property separately (no aggregation) on its 5-year-average unimproved value (AUV), only while the home is rented or not the owner’s principal residence, and bills in four quarterly instalments.'
  },
  nt: {
    name: 'Northern Territory', office: 'NT Government',
    url: 'https://nt.gov.au/property/land/buying-and-selling-land/land-taxes',
    basis: 'NT — no land tax levied',
    assess: ''
  }
};

/* ── Owner-type hints shown under the Owner type select ── */
var LT_OTYPE_HINTS = {
  nsw: {
    individual: 'General scale: tax-free to $1,075,000, then $100 + 1.6% of the excess; 2% above $6,571,000 (2026 tax year).',
    company: 'Companies pay the same general scale and $1,075,000 threshold as individuals in NSW.',
    trust: 'Special/discretionary trusts get NO threshold in NSW — 1.6% from the first dollar (2% above $6,571,000).',
    foreign: 'Ordinary scale PLUS a 5% surcharge on the entire land value — the surcharge has no threshold.'
  },
  vic: {
    individual: 'General scale (2024–2033): tax-free below $50,000; bands from a flat $500 up to 2.65% above $3,000,000.',
    company: 'Companies pay the same general scale as individuals in Victoria.',
    trust: 'Trusts pay a surcharge scale from just $25,000 — higher than the general scale until the two converge at $3,000,000.',
    foreign: 'Absentee owners pay the general scale PLUS a 4% surcharge on the whole value (applies from $50,000).'
  },
  qld: {
    individual: 'Resident individuals: tax-free below $600,000, then $500 + 1c per $1 (higher bands from $1,000,000).',
    company: 'Companies get the LOWER $350,000 threshold in QLD: $1,450 + 1.7c per $1 above it.',
    trust: 'Trustees use the company scale in QLD — tax-free only below $350,000.',
    foreign: 'Absentees use a modified company-style table PLUS a 3% surcharge on the value above $350,000.'
  },
  sa: {
    individual: 'General 2026-27 scale: tax-free to $936,000, then $0.50 per $100 (or part), rising to $2.40 per $100.',
    company: 'Companies pay the same general scale as individuals in SA.',
    trust: 'Trusts pay a higher scale from just $25,000 in SA.',
    foreign: 'South Australia has NO foreign owner land tax surcharge — the ordinary scale applies.'
  },
  wa: {
    individual: 'Single scale: tax-free to $300,000, flat $300 to $420,000, then marginal bands up to 2.67c per $1.',
    company: 'Same single scale — WA has no separate company or trust scale.',
    trust: 'Same single scale — WA has no trust surcharge.',
    foreign: 'Same single scale — WA has no foreign owner land tax surcharge.'
  },
  tas: {
    individual: 'General Land scale (from 1 Jul 2025): tax-free below $125,000, then $50 + 0.45%; 1.5% above $500,000.',
    company: 'Companies pay the same General Land scale in Tasmania.',
    trust: 'No separate trust scale in Tasmania — the general scale applies to trustees.',
    foreign: 'General scale PLUS the 2% FILTS surcharge (no threshold) on residential-capable land acquired by a foreign person on/after 1 Jul 2022.'
  },
  act: {
    individual: 'Per property (no aggregation): fixed $1,778 + marginal 0.54%–1.26% on the 5-yr-average AUV — only while rented or vacant.',
    company: 'Same fixed + marginal charge — ownership structure doesn’t change the ACT calculation.',
    trust: 'Same fixed + marginal charge — ownership structure doesn’t change the ACT calculation.',
    foreign: 'Fixed + marginal charge PLUS a 0.75% foreign owner surcharge on each property’s AUV.'
  },
  nt: {
    individual: 'The Northern Territory levies no land tax on any owner type.',
    company: 'The Northern Territory levies no land tax on any owner type.',
    trust: 'The Northern Territory levies no land tax on any owner type.',
    foreign: 'The Northern Territory levies no land tax on any owner type.'
  }
};

/* ── Value-basis hints shown above the property list ── */
var LT_VALUE_HINT_DEFAULT = 'Enter TAXABLE LAND VALUES — the unimproved/site value on your valuation notice, not the market price of the property. Don’t include your own home (exempt everywhere) or primary production land.';
var LT_VALUE_HINTS = {
  nsw: LT_VALUE_HINT_DEFAULT + ' NSW assesses on a 3-year average of Valuer General land values.',
  act: 'Enter each property’s 5-year-average AUV (Average Unimproved Value) from the rates assessment — not market price. ACT land tax applies ONLY to residential property that is rented or left vacant; an owner-occupied home is out of scope here.',
  nt: 'The Northern Territory levies no land tax — the result below simply confirms $0.'
};

/* ══════════════════════════════════════════════════════════════════════
   SCHEDULES — implemented exactly as published (verified 5 July 2026).
   Each returns { tax, threshold, band, mRate, mNote }:
     tax       dollars (unrounded)
     threshold text describing the tax-free threshold applied
     band      text naming the marginal band applied
     mRate     marginal rate on the next dollar (decimal), or null when the
               band is non-linear (SA per-$100) — then mNote describes it
     mNote     text override for the marginal-rate line (flat bands, SA)
   ══════════════════════════════════════════════════════════════════════ */

function ltR(tax, threshold, band, mRate, mNote) {
  return { tax: tax, threshold: threshold, band: band, mRate: mRate, mNote: mNote || null };
}

function schedNSW(V, otype) {
  if (otype === 'trust') {
    var tt = 'None — special/discretionary trusts have no NSW threshold';
    if (V <= 6571000) return ltR(0.016 * V, tt, 'Special trust: 1.6% of the entire land value', 0.016);
    return ltR(105136 + 0.02 * (V - 6571000), tt, 'Special trust above $6,571,000: $105,136 + 2% of the excess', 0.02);
  }
  var th = '$1,075,000 (general — individuals, companies & fixed trusts)';
  if (V <= 1075000) return ltR(0, th, 'At or below the general threshold — no land tax', 0, '0% until $1,075,000 (then $100 + 1.6% of the excess)');
  if (V <= 6571000) return ltR(100 + 0.016 * (V - 1075000), th, 'General: $100 + 1.6% of the value above $1,075,000', 0.016);
  return ltR(88036 + 0.02 * (V - 6571000), th, 'Premium: $88,036 + 2% of the value above $6,571,000', 0.02);
}

function schedVIC(V, otype) {
  if (otype === 'trust') {
    var tt = '$25,000 (VIC trust surcharge scale)';
    if (V < 25000) return ltR(0, tt, 'Below the trust threshold — no land tax', 0, '0% until $25,000');
    if (V < 50000) return ltR(82 + 0.00375 * (V - 25000), tt, '$25,000–<$50,000 (trust): $82 + 0.375% of the excess', 0.00375);
    if (V < 100000) return ltR(676 + 0.00375 * (V - 50000), tt, '$50,000–<$100,000 (trust): $676 + 0.375% of the excess', 0.00375);
    if (V < 250000) return ltR(1338 + 0.00375 * (V - 100000), tt, '$100,000–<$250,000 (trust): $1,338 + 0.375% of the excess', 0.00375);
    if (V < 600000) return ltR(1901 + 0.00675 * (V - 250000), tt, '$250,000–<$600,000 (trust): $1,901 + 0.675% of the excess', 0.00675);
    if (V < 1000000) return ltR(4263 + 0.00975 * (V - 600000), tt, '$600,000–<$1,000,000 (trust): $4,263 + 0.975% of the excess', 0.00975);
    if (V < 1800000) return ltR(8163 + 0.01275 * (V - 1000000), tt, '$1,000,000–<$1,800,000 (trust): $8,163 + 1.275% of the excess', 0.01275);
    if (V < 3000000) return ltR(18363 + 0.011072 * (V - 1800000), tt, '$1,800,000–<$3,000,000 (trust): $18,363 + 1.1072% of the excess', 0.011072);
    return ltR(31650 + 0.0265 * (V - 3000000), tt, '$3,000,000+ (trust converges with general): $31,650 + 2.65% of the excess', 0.0265);
  }
  var th = '$50,000 (general)';
  if (V < 50000) return ltR(0, th, 'Below $50,000 — no land tax', 0, '0% until $50,000');
  if (V < 100000) return ltR(500, th, '$50,000–<$100,000: flat $500', 0, 'Flat $500 across this band — $0 on the next dollar until $100,000');
  if (V < 300000) return ltR(975, th, '$100,000–<$300,000: flat $975', 0, 'Flat $975 across this band — $0 on the next dollar until $300,000');
  if (V < 600000) return ltR(1350 + 0.003 * (V - 300000), th, '$300,000–<$600,000: $1,350 + 0.3% of the excess', 0.003);
  if (V < 1000000) return ltR(2250 + 0.006 * (V - 600000), th, '$600,000–<$1,000,000: $2,250 + 0.6% of the excess', 0.006);
  if (V < 1800000) return ltR(4650 + 0.009 * (V - 1000000), th, '$1,000,000–<$1,800,000: $4,650 + 0.9% of the excess', 0.009);
  if (V < 3000000) return ltR(11850 + 0.0165 * (V - 1800000), th, '$1,800,000–<$3,000,000: $11,850 + 1.65% of the excess', 0.0165);
  return ltR(31650 + 0.0265 * (V - 3000000), th, '$3,000,000+: $31,650 + 2.65% of the excess', 0.0265);
}

function schedQLD(V, otype) {
  if (otype === 'individual') {
    var th = '$600,000 (resident individuals)';
    if (V < 600000) return ltR(0, th, 'Below $600,000 — no land tax', 0, '0% until $600,000');
    if (V < 1000000) return ltR(500 + 0.01 * (V - 600000), th, '$600,000–<$1,000,000: $500 + 1.0c per $1 of the excess', 0.01);
    if (V < 3000000) return ltR(4500 + 0.0165 * (V - 1000000), th, '$1,000,000–<$3,000,000: $4,500 + 1.65c per $1 of the excess', 0.0165);
    if (V < 5000000) return ltR(37500 + 0.0125 * (V - 3000000), th, '$3,000,000–<$5,000,000: $37,500 + 1.25c per $1 of the excess', 0.0125);
    if (V < 10000000) return ltR(62500 + 0.0175 * (V - 5000000), th, '$5,000,000–<$10,000,000: $62,500 + 1.75c per $1 of the excess', 0.0175);
    return ltR(150000 + 0.0225 * (V - 10000000), th, '$10,000,000+: $150,000 + 2.25c per $1 of the excess', 0.0225);
  }
  // Companies & trustees — absentees share the first three bands but have
  // different top bands (2.0c / 2.5c instead of 2.25c / 2.75c).
  var isAbs = (otype === 'foreign');
  var th2 = '$350,000 (' + (isAbs ? 'absentee/foreign schedule' : 'companies & trustees') + ')';
  if (V < 350000) return ltR(0, th2, 'Below $350,000 — no land tax', 0, '0% until $350,000');
  if (V < 2250000) return ltR(1450 + 0.017 * (V - 350000), th2, '$350,000–<$2,250,000: $1,450 + 1.7c per $1 of the excess', 0.017);
  if (V < 5000000) return ltR(33750 + 0.015 * (V - 2250000), th2, '$2,250,000–<$5,000,000: $33,750 + 1.5c per $1 of the excess', 0.015);
  if (isAbs) {
    if (V < 10000000) return ltR(75000 + 0.02 * (V - 5000000), th2, '$5,000,000–<$10,000,000 (absentee): $75,000 + 2.0c per $1 of the excess', 0.02);
    return ltR(175000 + 0.025 * (V - 10000000), th2, '$10,000,000+ (absentee): $175,000 + 2.5c per $1 of the excess', 0.025);
  }
  if (V < 10000000) return ltR(75000 + 0.0225 * (V - 5000000), th2, '$5,000,000–<$10,000,000: $75,000 + 2.25c per $1 of the excess', 0.0225);
  return ltR(187500 + 0.0275 * (V - 10000000), th2, '$10,000,000+: $187,500 + 2.75c per $1 of the excess', 0.0275);
}

// SA computes tax per "$100 or part of $100" — the excess over the band
// floor is rounded UP to whole hundreds before the per-$100 rate applies.
function saHundreds(excess) { return Math.ceil(excess / 100); }

function schedSA(V, otype) {
  if (otype === 'trust') {
    var tt = '$25,000 (SA trust scale, 2026-27)';
    if (V <= 25000) return ltR(0, tt, 'At or below $25,000 — no land tax', 0, '0% until $25,000');
    if (V <= 936000) return ltR(125 + 0.5 * saHundreds(V - 25000), tt, '$25,000–$936,000 (trust): $125 + $0.50 per $100 or part above $25,000', null, '$0.50 per $100 or part (≈ 0.5%)');
    if (V <= 1504000) return ltR(4680 + 1.0 * saHundreds(V - 936000), tt, '$936,000–$1,504,000 (trust): $4,680 + $1.00 per $100 or part above $936,000', null, '$1.00 per $100 or part (≈ 1.0%)');
    if (V <= 2188000) return ltR(10360 + 1.5 * saHundreds(V - 1504000), tt, '$1,504,000–$2,188,000 (trust): $10,360 + $1.50 per $100 or part above $1,504,000', null, '$1.50 per $100 or part (≈ 1.5%)');
    if (V <= 3504000) return ltR(20620 + 2.4 * saHundreds(V - 2188000), tt, '$2,188,000–$3,504,000 (trust): $20,620 + $2.40 per $100 or part above $2,188,000', null, '$2.40 per $100 or part (≈ 2.4%)');
    return ltR(52204 + 2.4 * saHundreds(V - 3504000), tt, 'Above $3,504,000 (trust): $52,204 + $2.40 per $100 or part above $3,504,000', null, '$2.40 per $100 or part (≈ 2.4%)');
  }
  var th = '$936,000 (general, 2026-27)';
  if (V <= 936000) return ltR(0, th, 'At or below $936,000 — no land tax', 0, '0% until $936,000');
  if (V <= 1504000) return ltR(0.5 * saHundreds(V - 936000), th, '$936,000–$1,504,000: $0.50 per $100 or part above $936,000', null, '$0.50 per $100 or part (≈ 0.5%)');
  if (V <= 2188000) return ltR(2840 + 1.0 * saHundreds(V - 1504000), th, '$1,504,000–$2,188,000: $2,840 + $1.00 per $100 or part above $1,504,000', null, '$1.00 per $100 or part (≈ 1.0%)');
  if (V <= 3504000) return ltR(9680 + 2.0 * saHundreds(V - 2188000), th, '$2,188,000–$3,504,000: $9,680 + $2.00 per $100 or part above $2,188,000', null, '$2.00 per $100 or part (≈ 2.0%)');
  return ltR(36000 + 2.4 * saHundreds(V - 3504000), th, 'Above $3,504,000: $36,000 + $2.40 per $100 or part above $3,504,000', null, '$2.40 per $100 or part (≈ 2.4%)');
}

function schedWA(V) {
  var th = '$300,000 (single scale for all owner types)';
  if (V <= 300000) return ltR(0, th, 'At or below $300,000 — no land tax', 0, '0% until $300,000');
  if (V <= 420000) return ltR(300, th, '$300,001–$420,000: flat $300', 0, 'Flat $300 across this band — $0 on the next dollar until $420,000');
  if (V <= 1000000) return ltR(300 + 0.0025 * (V - 420000), th, '$420,001–$1,000,000: $300 + 0.25c per $1 above $420,000', 0.0025);
  if (V <= 1800000) return ltR(1750 + 0.009 * (V - 1000000), th, '$1,000,001–$1,800,000: $1,750 + 0.9c per $1 above $1,000,000', 0.009);
  if (V <= 5000000) return ltR(8950 + 0.018 * (V - 1800000), th, '$1,800,001–$5,000,000: $8,950 + 1.8c per $1 above $1,800,000', 0.018);
  if (V <= 11000000) return ltR(66550 + 0.02 * (V - 5000000), th, '$5,000,001–$11,000,000: $66,550 + 2.0c per $1 above $5,000,000', 0.02);
  return ltR(186550 + 0.0267 * (V - 11000000), th, 'Above $11,000,000: $186,550 + 2.67c per $1 above $11,000,000', 0.0267);
}

function schedTAS(V) {
  var th = '$125,000 (General Land — same scale for all owner types)';
  if (V < 125000) return ltR(0, th, 'Below $125,000 — no land tax', 0, '0% until $125,000');
  if (V < 500000) return ltR(50 + 0.0045 * (V - 125000), th, '$125,000–<$500,000: $50 + 0.45% of the excess', 0.0045);
  return ltR(1737.5 + 0.015 * (V - 500000), th, '$500,000+: $1,737.50 + 1.5% of the excess', 0.015);
}

// ACT valuation charge — marginal on the property's 5-yr-average AUV.
// The $1,778 fixed charge (2026-27) is added per property by the caller.
function actValuation(a) {
  if (a <= 150000) return { tax: 0.0054 * a, band: 'AUV up to $150,000: 0.54%', rate: 0.0054 };
  if (a <= 275000) return { tax: 810 + 0.0064 * (a - 150000), band: 'AUV $150,000–$275,000: $810 + 0.64% of the excess', rate: 0.0064 };
  if (a <= 1000000) return { tax: 1610 + 0.0124 * (a - 275000), band: 'AUV $275,000–$1,000,000: $1,610 + 1.24% of the excess', rate: 0.0124 };
  if (a <= 2000000) return { tax: 10600 + 0.0125 * (a - 1000000), band: 'AUV $1,000,000–$2,000,000: $10,600 + 1.25% of the excess', rate: 0.0125 };
  return { tax: 23100 + 0.0126 * (a - 2000000), band: 'AUV above $2,000,000: $23,100 + 1.26% of the excess', rate: 0.0126 };
}

var ACT_FIXED_CHARGE = 1778; // 2026-27, per property

function ltSchedule(state, otype, V) {
  if (state === 'nsw') return schedNSW(V, otype);
  if (state === 'vic') return schedVIC(V, otype);
  if (state === 'qld') return schedQLD(V, otype);
  if (state === 'sa') return schedSA(V, otype);
  if (state === 'wa') return schedWA(V);
  if (state === 'tas') return schedTAS(V);
  return null;
}

/* ── Surcharges layered on top of the base schedule ──
 * Returns [{ label, amount, add }] where `add` is the extra marginal rate
 * the surcharge puts on the next dollar. */
function ltSurcharges(state, otype, V, mritOn) {
  var list = [];
  if (otype === 'foreign') {
    if (state === 'nsw') {
      list.push({ label: 'Foreign owner surcharge (5% of the full land value — NSW, no threshold)', amount: 0.05 * V, add: 0.05 });
    } else if (state === 'vic' && V >= 50000) {
      list.push({ label: 'Absentee owner surcharge (4% of the full land value — VIC)', amount: 0.04 * V, add: 0.04 });
    } else if (state === 'qld' && V >= 350000) {
      list.push({ label: 'Foreign owner surcharge (3% of the value above $350,000 — QLD)', amount: 0.03 * (V - 350000), add: 0.03 });
    } else if (state === 'tas') {
      list.push({ label: 'FILTS foreign surcharge (2% — TAS; residential-capable General Land acquired by a foreign person on/after 1 Jul 2022, no threshold)', amount: 0.02 * V, add: 0.02 });
    }
  }
  if (state === 'wa' && mritOn && V > 300000) {
    list.push({ label: 'Metropolitan Region Improvement Tax (0.14% of the value above $300,000 — Perth metro)', amount: 0.0014 * (V - 300000), add: 0.0014 });
  }
  return list;
}

/* ══════════════════════════════════════════════════════════════════════
   RENDER HELPERS
   ══════════════════════════════════════════════════════════════════════ */

function ltByIdEl(id) { return document.getElementById(id); }

function ltPctStr(r) {
  var p = Math.round(r * 10000) / 100; // decimal → % with 2dp max
  return p + '%';
}

function ltHeroHtml(valueText, labelText, noteText) {
  return '<div class="fhb-hero">' +
    '<div class="fhb-hero-label">' + escHtml(labelText) + '</div>' +
    '<div class="fhb-hero-value">' + escHtml(valueText) + '</div>' +
    (noteText ? '<div class="fhb-hero-note">' + escHtml(noteText) + '</div>' : '') +
    '</div>';
}

// label/value are HTML — caller escapes anything user-derived.
function ltRowHtml(labelHtml, valueHtml, cls) {
  return '<div class="tool-cost-row' + (cls ? ' ' + cls : '') + '">' +
    '<span class="tool-cost-row-label">' + labelHtml + '</span>' +
    '<span class="tool-cost-row-value">' + valueHtml + '</span></div>';
}

function ltCalloutHtml(kind, tag, text) {
  return '<div class="mort-callout' + (kind === 'gold' ? ' mort-callout-gold' : '') + '">' +
    '<span class="mort-callout-tag">' + escHtml(tag) + '</span>' +
    '<span class="mort-callout-text">' + escHtml(text) + '</span></div>';
}

function ltVerifiedHtml(state) {
  var o = LT_META[state];
  return escHtml(o.basis) + ' — verified against ' + escHtml(o.office) +
    ' as at 5 July 2026. <a href="' + escHtml(o.url) + '" target="_blank" rel="noopener">Official rates and thresholds</a>. ' +
    'General information only — not tax, legal or financial advice.';
}

function ltMarginalText(res, addRate) {
  if (res.mNote) {
    return res.mNote + (addRate > 0 ? ' · plus ' + ltPctStr(addRate) + ' surcharge on each extra dollar' : '');
  }
  if (addRate > 0) return ltPctStr(res.mRate) + ' schedule + ' + ltPctStr(addRate) + ' surcharge = ' + ltPctStr(res.mRate + addRate);
  return ltPctStr(res.mRate);
}

var LT_GOLD_CALLOUT_TEXT = 'Land value is the unimproved/site value on your valuation notice or assessment — typically WELL below market price. NSW uses a 3-year average; the ACT uses a 5-year average AUV.';

/* ══════════════════════════════════════════════════════════════════════
   DYNAMIC PROPERTY ROWS
   ══════════════════════════════════════════════════════════════════════ */

var _propSeq = 1;

function ltValueHintText() {
  var st = ltByIdEl('state') ? ltByIdEl('state').value : 'nsw';
  return (st === 'act')
    ? '(5-year-average AUV — not market price)'
    : '(unimproved/site land value — not market price)';
}

function ltAddPropRow() {
  _propSeq++;
  var lid = 'prop-label-' + _propSeq;
  var vid = 'prop-value-' + _propSeq;
  var wrap = document.createElement('div');
  wrap.className = 'fhb-section';
  wrap.setAttribute('data-prop-row', '');
  wrap.innerHTML =
    '<div class="tool-field">' +
      '<label class="tool-label" for="' + lid + '">Property label <span class="tool-label-hint">(optional)</span></label>' +
      '<input class="tool-input" type="text" id="' + lid + '" data-prop-label maxlength="60" placeholder="e.g. Unit in Parramatta">' +
    '</div>' +
    '<div class="tool-field">' +
      '<label class="tool-label" for="' + vid + '">Taxable land value <span class="tool-label-hint" data-value-hint>' + escHtml(ltValueHintText()) + '</span></label>' +
      '<input class="tool-input" type="text" inputmode="decimal" id="' + vid + '" data-prop-value placeholder="e.g. 450,000">' +
    '</div>' +
    '<button type="button" class="tool-btn-secondary" data-prop-remove>Remove this property</button>';
  ltByIdEl('prop-list').appendChild(wrap);
  ltUpdateRemoveButtons();
}

function ltUpdateRemoveButtons() {
  var rows = document.querySelectorAll('#prop-list [data-prop-row]');
  for (var i = 0; i < rows.length; i++) {
    var btn = rows[i].querySelector('[data-prop-remove]');
    if (btn) btn.style.display = (rows.length > 1) ? '' : 'none';
  }
}

function ltCollectProps() {
  var rows = document.querySelectorAll('#prop-list [data-prop-row]');
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var vEl = rows[i].querySelector('[data-prop-value]');
    var lEl = rows[i].querySelector('[data-prop-label]');
    var v = vEl ? (parseFloat((vEl.value || '0').replace(/,/g, '')) || 0) : 0;
    out.push({ label: lEl ? (lEl.value || '') : '', value: v });
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════
   STATE-DEPENDENT UI (owner hint, value hints, WA MRIT visibility)
   ══════════════════════════════════════════════════════════════════════ */

function updateStateUI() {
  var state = ltByIdEl('state').value;
  var otype = ltByIdEl('otype').value;

  // WA-only MRIT checkbox
  var mritWrap = ltByIdEl('mrit-wrap');
  if (mritWrap) {
    mritWrap.style.display = (state === 'wa') ? '' : 'none';
    if (state !== 'wa') {
      var mc = ltByIdEl('mrit');
      if (mc) mc.checked = false;
    }
  }

  // Owner-type treatment hint
  var oh = ltByIdEl('otype-hint');
  if (oh) oh.textContent = (LT_OTYPE_HINTS[state] && LT_OTYPE_HINTS[state][otype]) || '';

  // Section-level value basis hint (ACT relabels to AUV + scope note)
  var vb = ltByIdEl('value-basis-hint');
  if (vb) vb.textContent = LT_VALUE_HINTS[state] || LT_VALUE_HINT_DEFAULT;

  // Per-row value label hints
  var hints = document.querySelectorAll('[data-value-hint]');
  var txt = ltValueHintText();
  for (var i = 0; i < hints.length; i++) hints[i].textContent = txt;
}

/* ══════════════════════════════════════════════════════════════════════
   CALCULATE
   ══════════════════════════════════════════════════════════════════════ */

var _isInit = true;

function calculate() {
  var msg = ltByIdEl('calc-msg');
  function showErr(t) { if (msg) { msg.textContent = t; msg.hidden = false; } }
  if (msg) msg.hidden = true;

  var state = ltByIdEl('state').value;
  var otype = ltByIdEl('otype').value;
  var mritOn = !!(ltByIdEl('mrit') && ltByIdEl('mrit').checked);
  var props = ltCollectProps();

  var V = 0, count = 0;
  for (var i = 0; i < props.length; i++) {
    if (props[i].value > 0) { V += props[i].value; count++; }
  }

  var heroEl = ltByIdEl('lt-hero');
  var bdEl = ltByIdEl('lt-breakdown');
  var coEl = ltByIdEl('lt-callouts');
  var verEl = ltByIdEl('lt-verified');
  var resultEl = ltByIdEl('result');
  if (!heroEl || !bdEl || !coEl || !verEl || !resultEl) return;

  if (V <= 0 && state !== 'nt') {
    if (!_isInit) showErr('Enter at least one taxable land value.');
    return;
  }

  var grandTotal = 0;
  var callouts = '';

  if (state === 'nt') {
    /* ── NT: no land tax at all ── */
    heroEl.innerHTML = ltHeroHtml('$0', 'No land tax in the Northern Territory',
      'The NT is the only Australian jurisdiction that levies no land tax — on any owner type or land value.');
    bdEl.innerHTML = '';
    callouts += ltCalloutHtml('', 'Why $0',
      'The Northern Territory has no land tax on individuals, companies, trusts or foreign owners, and no equivalent annual land-value tax. Council rates and other holding costs still apply.');
    coEl.innerHTML = callouts;
    verEl.innerHTML = ltVerifiedHtml('nt');

  } else if (state === 'act') {
    /* ── ACT: per property, fixed charge + marginal on AUV, no aggregation ── */
    var rows = '';
    var propCount = 0;
    var lastVres = null;
    for (i = 0; i < props.length; i++) {
      var a = props[i].value;
      if (a <= 0) continue;
      propCount++;
      var name = props[i].label ? props[i].label : 'Property ' + propCount;
      var vres = actValuation(a);
      lastVres = vres;
      var fSur = (otype === 'foreign') ? 0.0075 * a : 0;
      var sub = ACT_FIXED_CHARGE + vres.tax + fSur;
      grandTotal += sub;
      rows += ltRowHtml(escHtml(name) + ' — AUV ' + fmt(a), fmt(sub), 'subtotal');
      rows += ltRowHtml('Fixed charge (2026-27, per property)', fmt(ACT_FIXED_CHARGE));
      rows += ltRowHtml('Valuation charge — ' + escHtml(vres.band), fmt(vres.tax));
      if (fSur > 0) rows += ltRowHtml('Foreign owner surcharge (0.75% of AUV — ACT)', fmt(fSur));
    }
    rows += ltRowHtml('TOTAL annual land tax (' + propCount + (propCount === 1 ? ' property' : ' properties') + ', computed per property — the ACT does not aggregate)', fmt(grandTotal), 'total');
    rows += ltRowHtml('Billed in four quarterly instalments of about', fmt(grandTotal / 4));
    rows += ltRowHtml('Effective rate on combined AUV', (grandTotal / V * 100).toFixed(2) + '%');
    if (propCount === 1 && lastVres) {
      var actAdd = (otype === 'foreign') ? 0.0075 : 0;
      rows += ltRowHtml('Marginal rate on the next dollar of AUV',
        escHtml(actAdd > 0
          ? ltPctStr(lastVres.rate) + ' schedule + ' + ltPctStr(actAdd) + ' surcharge = ' + ltPctStr(lastVres.rate + actAdd)
          : ltPctStr(lastVres.rate)));
    }
    heroEl.innerHTML = ltHeroHtml(fmt(grandTotal), 'Estimated annual land tax',
      'Assessed per property on 5-year-average AUV — billed in four quarterly instalments of about ' + fmt(grandTotal / 4) + '.');
    bdEl.innerHTML = '<div class="tool-cost-breakdown">' + rows + '</div>';
    callouts += ltCalloutHtml('gold', 'Land value ≠ market price', LT_GOLD_CALLOUT_TEXT);
    callouts += ltCalloutHtml('', 'Assessment basis', LT_META.act.assess);
    coEl.innerHTML = callouts;
    verEl.innerHTML = ltVerifiedHtml('act');

  } else {
    /* ── Aggregated states: NSW / VIC / QLD / SA / WA / TAS ── */
    var res = ltSchedule(state, otype, V);
    var surcharges = ltSurcharges(state, otype, V, mritOn);
    var surTotal = 0, addRate = 0;
    for (i = 0; i < surcharges.length; i++) {
      surTotal += surcharges[i].amount;
      addRate += surcharges[i].add;
    }
    grandTotal = res.tax + surTotal;

    var rows2 = '';
    rows2 += ltRowHtml('Aggregate taxable land value (' + count + (count === 1 ? ' property' : ' properties') + ')', fmt(V));
    rows2 += ltRowHtml('Tax-free threshold applied', escHtml(res.threshold));
    rows2 += ltRowHtml('Band applied', escHtml(res.band));
    rows2 += ltRowHtml('Base land tax (schedule)', fmt(res.tax), surcharges.length ? 'subtotal' : '');
    for (i = 0; i < surcharges.length; i++) {
      rows2 += ltRowHtml(escHtml(surcharges[i].label), fmt(surcharges[i].amount));
    }
    rows2 += ltRowHtml('TOTAL annual land tax', fmt(grandTotal), 'total');
    rows2 += ltRowHtml('Effective rate on land value', (grandTotal / V * 100).toFixed(2) + '%');
    rows2 += ltRowHtml('Marginal rate on the next dollar', escHtml(ltMarginalText(res, addRate)));
    bdEl.innerHTML = '<div class="tool-cost-breakdown">' + rows2 + '</div>';

    var heroNote;
    if (grandTotal === 0) {
      heroNote = '$0 — under the threshold. Your aggregate ' + fmt(V) + ' is within the tax-free threshold: ' + res.threshold + '.';
    } else {
      heroNote = LT_META[state].name + ' · ' + count + (count === 1 ? ' property' : ' properties') + ' · aggregated taxable value ' + fmt(V) + '.';
    }
    heroEl.innerHTML = ltHeroHtml(fmt(grandTotal), 'Estimated annual land tax', heroNote);

    callouts += ltCalloutHtml('gold', 'Land value ≠ market price', LT_GOLD_CALLOUT_TEXT);
    callouts += ltCalloutHtml('', 'Assessment basis', LT_META[state].assess +
      ' Your own home (principal place of residence) is exempt — don’t include it above.');
    if (state === 'sa' && otype === 'foreign') {
      callouts += ltCalloutHtml('', 'No SA surcharge', 'South Australia does not levy a foreign owner land tax surcharge — the ordinary scale applies.');
    }
    if (state === 'sa' && grandTotal > 0 && grandTotal < 20) {
      callouts += ltCalloutHtml('', 'De minimis', 'RevenueSA does not issue assessments under $20, so this liability would not be billed.');
    }
    if (state === 'wa' && otype === 'foreign') {
      callouts += ltCalloutHtml('', 'No WA surcharge', 'Western Australia has no foreign owner land tax surcharge — the single scale applies to everyone.');
    }
    if (state === 'wa' && otype === 'trust') {
      callouts += ltCalloutHtml('', 'No trust scale', 'Western Australia has no separate trust scale — trustees pay the same single scale.');
    }
    if (state === 'tas' && otype === 'trust') {
      callouts += ltCalloutHtml('', 'No trust scale', 'Tasmania has no separate trust scale — the general scale applies to trustees.');
    }
    coEl.innerHTML = callouts;
    verEl.innerHTML = ltVerifiedHtml(state);
  }

  resultEl.style.display = '';

  if (!_isInit) {
    var cta = ltByIdEl('cta');
    if (cta) cta.style.display = '';
    if (window.trackCalculatorResult) trackCalculatorResult('land-tax', {
      state: state,
      ownerType: otype,
      properties: count,
      aggregateValue: Math.round(V),
      annualLandTax: Math.round(grandTotal)
    });
  }
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  slug: 'land-tax',
  stateSelectId: 'state',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Model the full hold — rent, loan, land tax & 30-year equity',
    description: 'Land tax is one line of the annual picture. Stack it with rental income, repayments, and long-term growth — free in EquitySight.',
    buttonText: 'Try it free — no signup →',
    buttonHref: '/app'
  },
  resources: {
    groups: [
      {
        icon: '\uD83C\uDFDB\uFE0F', title: 'State & Territory Land Tax Rates',
        links: [
          { text: 'Revenue NSW — thresholds and rates', href: 'https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/land-tax/understanding-land-tax/thresholds-and-rates' },
          { text: 'SRO Victoria — current land tax rates', href: 'https://www.sro.vic.gov.au/land-tax-current-rates' },
          { text: 'Queensland Revenue Office — calculating land tax', href: 'https://qro.qld.gov.au/land-tax/calculate/' },
          { text: 'RevenueSA — rates and thresholds', href: 'https://www.revenuesa.sa.gov.au/land-tax/rates-and-thresholds' },
          { text: 'RevenueWA — land tax assessment', href: 'https://www.wa.gov.au/organisation/department-of-treasury-and-finance/land-tax-assessment' },
          { text: 'SRO Tasmania — rates of land tax', href: 'https://www.sro.tas.gov.au/land-tax/rates-of-land-tax' },
          { text: 'ACT Revenue Office — how land tax is calculated', href: 'https://www.revenue.act.gov.au/rates-and-property-charges/land-tax/how-land-tax-is-calculated' },
          { text: 'NT Government — land taxes', href: 'https://nt.gov.au/property/land/buying-and-selling-land/land-taxes' }
        ]
      },
      {
        icon: '\uD83D\uDCD6', title: 'Investor Tax Basics',
        links: [
          { text: 'ATO: Residential rental properties', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties' },
          { text: 'Moneysmart: Property investment', href: 'https://moneysmart.gov.au/property-investment' }
        ]
      }
    ],
    disclaimer: 'Rates verified against each state and territory revenue office as at 5 July 2026. Thresholds are indexed or amended most years — always confirm current figures with the relevant revenue office and a qualified adviser.'
  },
  share: {
    url: 'https://equitysight.app/tools/land-tax-calculator',
    text: 'Just worked out my annual land tax across every Australian state!'
  },
  related: [
    { href: '/tools/stamp-duty-calculator', icon: '\uD83C\uDFDB\uFE0F', label: 'Stamp Duty' },
    { href: '/tools/rental-yield-calculator', icon: '\uD83D\uDCCA', label: 'Rental Yield' },
    { href: '/tools/capital-gains-calculator', icon: '\uD83D\uDCB0', label: 'Capital Gains Tax' },
    { href: '/tools/listing-price-checker', icon: '\uD83D\uDCCD', label: 'Listing Price Checker' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/stamp-duty-calculator', text: 'Stamp Duty' },
    { href: '/tools/capital-gains-calculator', text: 'Capital Gains Tax' },
    { href: '/tools/rental-yield-calculator', text: 'Rental Yield' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: [
    {
      label: 'NSW — individual, land value $1,655,000 (official Revenue NSW example)',
      inputs: [
        { k: 'State', v: 'New South Wales' },
        { k: 'Owner type', v: 'Individual' },
        { k: 'Aggregate land value', v: '$1,655,000' }
      ],
      outputs: [
        { k: 'Annual land tax', v: '$9,380' },
        { k: 'Band', v: '$100 + 1.6% over $1,075,000' },
        { k: 'Effective rate', v: '0.57%' }
      ]
    },
    {
      label: 'QLD — foreign/absentee owner, land value $400,000 (official QRO example)',
      inputs: [
        { k: 'State', v: 'Queensland' },
        { k: 'Owner type', v: 'Foreign or absentee owner' },
        { k: 'Aggregate land value', v: '$400,000' }
      ],
      outputs: [
        { k: 'Base land tax', v: '$2,300' },
        { k: 'Foreign surcharge (3% over $350,000)', v: '$1,500' },
        { k: 'Total annual land tax', v: '$3,800' }
      ]
    },
    {
      label: 'SA — individual, land value $1,575,000 (official RevenueSA 2026-27 example)',
      inputs: [
        { k: 'State', v: 'South Australia' },
        { k: 'Owner type', v: 'Individual' },
        { k: 'Aggregate site value', v: '$1,575,000' }
      ],
      outputs: [
        { k: 'Annual land tax', v: '$3,550' },
        { k: 'Band', v: '$2,840 + $1.00 per $100 over $1,504,000' },
        { k: 'Effective rate', v: '0.23%' }
      ]
    }
  ],
  faq: [
    { q: 'Is land value the same as market value?',
      a: 'No. Land tax is assessed on the unimproved or site value of the land only — the value of the block without the house — as determined by your state’s Valuer-General. It is typically well below market price. NSW averages the last 3 years of land values and the ACT averages 5 years of unimproved values (AUV), which smooths out valuation spikes.' },
    { q: 'Which states have no land tax?',
      a: 'The Northern Territory levies no land tax at all. Everywhere else, your own home (principal place of residence) is exempt, so owner-occupiers effectively pay none — land tax is mainly a tax on investment property, commercial land and holiday homes. In the ACT, land tax only applies to residential property that is rented or left vacant.' },
    { q: 'How do trusts change land tax?',
      a: 'In NSW a special or discretionary trust gets no tax-free threshold — it pays 1.6% from the first dollar. Victoria and South Australia apply higher trust surcharge scales with much lower thresholds ($25,000 in both). In Queensland trustees share the lower $350,000 company threshold. WA, Tasmania and the ACT tax trusts on the same scale as individuals. Structure choice can change the annual bill by thousands.' },
    { q: 'What are the foreign owner land tax surcharges?',
      a: 'On top of standard land tax: NSW adds 5% of the entire land value (no threshold), VIC adds 4% (absentee owner surcharge), QLD adds 3% of the value above $350,000, TAS adds a 2% FILTS surcharge on residential-capable land acquired by a foreign person on or after 1 July 2022, and the ACT adds 0.75% of AUV. SA, WA and the NT have no foreign land tax surcharge.' },
    { q: 'When is land tax assessed?',
      a: 'NSW and VIC assess on the land you own at midnight 31 December for the following tax year. QLD, SA and WA assess at midnight 30 June. Tasmania assesses on land owned at 1 July. The ACT assesses and bills quarterly. Selling the day after the assessment date still leaves you liable for the full year in most states.' },
    { q: 'Can I reduce land tax legitimately?',
      a: 'Common approaches include spreading purchases across states so each stays under its own threshold, weighing ownership structure carefully before you buy, and claiming every exemption you are entitled to (principal place of residence, primary production). This is general information only, not tax advice — land tax planning has traps, so get advice from a qualified professional before acting.' }
  ],
  usefulLinks: [
    { group: 'Other Tools', icon: '\uD83C\uDFDB\uFE0F', href: '/tools/stamp-duty-calculator', label: 'Stamp Duty Calculator' },
    { group: 'Other Tools', icon: '\uD83D\uDCCA', href: '/tools/rental-yield-calculator', label: 'Rental Yield Calculator' },
    { group: 'Other Tools', icon: '\uD83D\uDCB0', href: '/tools/capital-gains-calculator', label: 'Capital Gains Tax Calculator' },
    { group: 'Other Tools', icon: '\uD83D\uDCCD', href: '/tools/listing-price-checker', label: 'Listing Price Checker' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/qld/redbank-plains/', label: 'Redbank Plains QLD' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/vic/point-cook/', label: 'Point Cook VIC' },
    { group: 'Popular Suburbs', icon: '\uD83D\uDCCD', href: '/suburb/nsw/parramatta/', label: 'Parramatta NSW' },
    { group: 'Guides', icon: '\uD83D\uDCD6', href: '/blog/', label: 'Property Investment Blog' }
  ]
});

/* ═══ EVENT WIRING ═══ */
window.addEventListener('DOMContentLoaded', function() {
  if (window.trackCalculatorStart) trackCalculatorStart('land-tax');

  updateStateUI();
  ltUpdateRemoveButtons();
  calculate();
  _isInit = false;

  var stateEl = ltByIdEl('state');
  var otypeEl = ltByIdEl('otype');
  var mritEl = ltByIdEl('mrit');
  var addBtn = ltByIdEl('add-prop');
  var calcBtn = ltByIdEl('lt-calc-btn');
  var propList = ltByIdEl('prop-list');

  if (stateEl) stateEl.addEventListener('change', function() { updateStateUI(); calculate(); });
  if (otypeEl) otypeEl.addEventListener('change', function() { updateStateUI(); calculate(); });
  if (mritEl) mritEl.addEventListener('change', calculate);

  if (addBtn) addBtn.addEventListener('click', function() {
    ltAddPropRow();
    calculate();
  });

  // Delegated listeners so dynamically-added property rows need no per-row
  // wiring (CSP-safe — no inline handlers anywhere).
  if (propList) {
    propList.addEventListener('input', function(e) {
      var t = e.target;
      if (!t || !t.hasAttribute) return;
      if (t.hasAttribute('data-prop-value')) { fmtInput(t); calculate(); }
      else if (t.hasAttribute('data-prop-label')) { calculate(); }
    });
    propList.addEventListener('click', function(e) {
      var btn = e.target;
      while (btn && btn !== propList && !(btn.hasAttribute && btn.hasAttribute('data-prop-remove'))) {
        btn = btn.parentNode;
      }
      if (!btn || btn === propList) return;
      var row = btn;
      while (row && row !== propList && !(row.hasAttribute && row.hasAttribute('data-prop-row'))) {
        row = row.parentNode;
      }
      if (row && row !== propList) {
        propList.removeChild(row);
        ltUpdateRemoveButtons();
        calculate();
      }
    });
  }

  if (calcBtn) calcBtn.addEventListener('click', function() {
    if (window.trackPageEvent) trackPageEvent('calculator_button_click', { 'calculator': 'land-tax' });
    calculate();
  });
});
