#!/usr/bin/env node
/**
 * build-state-stamp-duty.js — One-shot generator for per-state stamp duty
 * landing pages (NSW, VIC, WA, SA, TAS, ACT, NT). The QLD page is hand-
 * authored at tools/stamp-duty-calculator-qld.{html,js} and is deliberately
 * not regenerated here — its concession structure is unique enough that the
 * hand copy is worth the divergence.
 *
 * Output:
 *   tools/stamp-duty-calculator-{state}.html
 *   tools/stamp-duty-calculator-{state}.js
 *
 * Why per-state pages? GSC shows the QLD page (`stamp-duty-qld.html`) ranks
 * around position 75 for "stamp duty calculator qld" and similar — page 7-8.
 * Generic /tools/stamp-duty-calculator covers all states but doesn't match
 * state-specific intent. Dedicated state pages with state-specific URLs,
 * titles, FAQ schema, and copy should outrank a generic page for
 * "stamp duty calculator nsw" / "vic" / etc.
 *
 * Run once: node build/build-state-stamp-duty.js
 *
 * The generated files are committed to git and served from Netlify directly;
 * this script is not invoked from build.js.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ── State configuration ─────────────────────────────────────────────────────
//
// Each state holds:
//   code            — lowercase state code used in slug + JS lookups
//   STATE           — uppercase abbreviation
//   stateName       — full state name
//   capital         — capital city name (used in lifestyle copy + suburb links)
//   dutyName        — official name of the duty in legislation/forms
//   revenueOffice   — name of the revenue office
//   revenueUrl      — link to the duty page on the revenue office website
//   foreignRate     — foreign buyer surcharge (0 = not applied; e.g. TAS)
//   fhbFull         — FHB full exemption threshold
//   fhbPartial      — FHB partial concession upper limit
//   brackets        — display table of standard rates (HTML rows)
//   ratesNarrative  — paragraph describing the bracket system
//   fhbCopy         — paragraph describing the FHB concession
//   ownerVsInvestor — paragraph describing the OO vs investor distinction
//   examples        — worked examples table rows ([scenario, investor, oo, fhb])
//   faqs            — array of {q, a} for FAQPage schema + on-page rendering
//   popularSuburbs  — list of {slug, label} for the useful-links sidebar
//   investHubLabel  — short label for the state hub link in the same sidebar

const STATES = {
  nsw: {
    STATE: 'NSW',
    stateName: 'New South Wales',
    capital: 'Sydney',
    dutyName: 'Conveyancing Duty',
    revenueOffice: 'Revenue NSW',
    revenueUrl: 'https://www.revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty',
    foreignRate: 0.08,
    foreignLabel: '8% surcharge purchaser duty',
    fhbFull: 800000,
    fhbPartial: 1000000,
    fhbScheme: 'First Home Buyers Assistance Scheme (FHBAS)',
    fhbSchemeUrl: 'https://www.revenue.nsw.gov.au/grants-schemes/previous-schemes/first-home-buyer-assistance',
    fhbCopy: 'New South Wales offers <strong>full exemption from transfer duty for eligible first home buyers</strong> on properties up to $800,000, with a sliding partial concession from $800,000 to $1,000,000. The First Home Buyers Assistance Scheme (FHBAS) covers both new and established homes. Vacant land used to build a home is fully exempt up to $350,000 with a partial concession to $450,000. To qualify you must be 18 or older, an Australian citizen or permanent resident, never have owned residential property in Australia, and live in the home for at least 12 continuous months within 12 months of settlement.',
    ownerVsInvestor: 'Unlike Victoria and Queensland, NSW does not offer a separate owner-occupier "home concession" — owner-occupiers and investors pay the same standard rates. The only relief available to owner-occupiers is via the First Home Buyers Assistance Scheme (if eligible) or the First Home Owner Grant for new builds.',
    ratesNarrative: 'NSW transfer duty (formerly known as stamp duty) is administered by Revenue NSW under the Duties Act 1997. The duty is charged on the dutiable value of the property — usually the contract price, but Revenue NSW can substitute a higher market valuation if it suspects under-statement. Rates step up across price brackets, from nil under $14,000 to 5.5% on the portion above $550,000.',
    bracketRows: [
      ['$0 – $14,000', 'nil'],
      ['$14,001 – $30,000', '$1.25 per $100 (1.25%)'],
      ['$30,001 – $130,000', '$200 + $1.50 per $100 over $30,000 (1.5%)'],
      ['$130,001 – $205,000', '$1,700 + $1.75 per $100 over $130,000 (1.75%)'],
      ['$205,001 – $305,000', '$2,631.25 + $3.50 per $100 over $205,000 (3.5%)'],
      ['$305,001 – $405,000', '$6,131.25 + $4.00 per $100 over $305,000 (4.0%)'],
      ['$405,001 – $550,000', '$10,131.25 + $4.50 per $100 over $405,000 (4.5%)'],
      ['Above $550,000', '$16,256.25 + $5.50 per $100 over $550,000 (5.5%)'],
    ],
    examples: [
      ['$650,000 property', '$24,757', '$24,757', '$0 (FHB exemption)'],
      ['$900,000 property', '$36,027', '$36,027', '~$18,014 (50% partial)'],
      ['$1,200,000 property', '$53,027', '$53,027', '$53,027 (over $1M cap)'],
    ],
    faqs: [
      { q: 'How does stamp duty work in NSW?',
        a: 'NSW transfer duty (still commonly called stamp duty) is charged by Revenue NSW on the dutiable value of any property purchase. The duty steps up across brackets from nil under $14,000 to 5.5% on the portion above $550,000. There is no owner-occupier "home concession" in NSW — owner-occupiers and investors pay the same standard rates. The main relief is the First Home Buyers Assistance Scheme.' },
      { q: 'Do first home buyers pay stamp duty in NSW?',
        a: 'Eligible first home buyers pay no transfer duty on properties up to $800,000 and receive a sliding partial concession on properties between $800,000 and $1,000,000. Above $1,000,000 the standard rates apply with no concession. The same thresholds apply to both new and established homes under the First Home Buyers Assistance Scheme (FHBAS).' },
      { q: 'When is stamp duty due in NSW?',
        a: 'NSW transfer duty is payable within three months of liability — usually three months after the contract date. Most buyers pay duty at settlement through their solicitor or conveyancer. Late payment attracts interest and penalty tax under the Taxation Administration Act 1996 (NSW).' },
      { q: 'What is the NSW foreign buyer surcharge?',
        a: 'Foreign buyers (non-Australian citizens or permanent residents) pay an additional 8% surcharge purchaser duty on top of standard transfer duty. The surcharge applies to residential property purchases and is collected by Revenue NSW at the same time as the standard duty. New Zealand citizens with a Special Category Visa are treated as foreign for this surcharge unless they are also Australian permanent residents.' },
      { q: 'Is stamp duty tax deductible for NSW investors?',
        a: 'No. Stamp duty paid by a property investor in NSW (or any state) is not immediately deductible against rental income. Instead it is added to the cost base of the property and reduces capital gains tax when the property is later sold. Owner-occupiers cannot deduct stamp duty at all.' },
      { q: 'Stamp duty vs transfer duty in NSW — what is the difference?',
        a: 'There is no difference — they are the same tax. NSW formally calls it "transfer duty" in the Duties Act 1997, but most buyers, lenders, and solicitors still call it "stamp duty". The legislation, the contract documents, and Revenue NSW forms all use "transfer duty"; everyday speech still uses both terms interchangeably.' },
    ],
    popularSuburbs: [
      { slug: 'parramatta', label: 'Parramatta NSW' },
      { slug: 'newtown', label: 'Newtown NSW' },
      { slug: 'chatswood', label: 'Chatswood NSW' },
    ],
    cityHub: { slug: 'sydney', label: 'Sydney Suburb Guide' },
  },

  vic: {
    STATE: 'VIC',
    stateName: 'Victoria',
    capital: 'Melbourne',
    dutyName: 'Land Transfer Duty',
    revenueOffice: 'State Revenue Office Victoria',
    revenueUrl: 'https://www.sro.vic.gov.au/land-transfer-duty',
    foreignRate: 0.08,
    foreignLabel: '8% additional foreign purchaser duty',
    fhbFull: 600000,
    fhbPartial: 750000,
    fhbScheme: 'First Home Buyer Duty Exemption / Concession',
    fhbSchemeUrl: 'https://www.sro.vic.gov.au/first-home-buyer-duty-exemption-or-concession',
    fhbCopy: 'Victoria offers <strong>full exemption from land transfer duty for eligible first home buyers</strong> on properties valued up to $600,000, with a sliding partial concession from $600,000 to $750,000. The thresholds apply to dutiable value (usually the purchase price). Above $750,000 first home buyers pay full standard rates. To qualify you must be 18 or older, never have received a first home buyer benefit anywhere in Australia, occupy the property as your principal place of residence for at least 12 months starting within 12 months of settlement, and meet the citizenship/residency rules. Pensioners may qualify for a separate concession unrelated to the FHB scheme.',
    ownerVsInvestor: 'Victoria offers a <strong>principal place of residence (PPR) concession</strong> on properties up to $550,000, providing a partial reduction in duty for owner-occupiers. Investors pay the standard rates with no concession. The PPR concession stacks with neither the FHB exemption nor the off-the-plan concession — buyers receive the most favourable single concession.',
    ratesNarrative: 'Victorian land transfer duty is administered by the State Revenue Office Victoria (SRO) under the Duties Act 2000. Rates step up sharply across five brackets, from nil under $25,000 to 6.5% on the portion above $870,000 — the highest top-bracket rate in Australia. The duty applies to the dutiable value of the property, normally the contract price.',
    bracketRows: [
      ['$0 – $25,000', 'nil'],
      ['$25,001 – $130,000', '1.4% of dutiable value'],
      ['$130,001 – $440,000', '$1,470 + 2.4% over $130,000'],
      ['$440,001 – $870,000', '$8,910 + 5.5% over $440,000'],
      ['Above $870,000', '$43,605 + 6.5% over $870,000'],
    ],
    examples: [
      ['$600,000 property', '$31,070', '$31,070', '$0 (FHB exemption)'],
      ['$700,000 property', '$37,070', '$37,070', '~$12,357 (sliding concession)'],
      ['$1,200,000 property', '$65,955', '$65,955', '$65,955 (over $750k cap)'],
    ],
    faqs: [
      { q: 'How does stamp duty work in Victoria?',
        a: 'Victorian stamp duty (officially "land transfer duty") is charged by the State Revenue Office Victoria (SRO) on the dutiable value of any property purchase. Rates step up across five brackets, from nil under $25,000 to 6.5% on the portion above $870,000 — the highest top-bracket rate in any Australian state.' },
      { q: 'Do first home buyers pay stamp duty in Victoria?',
        a: 'Eligible first home buyers pay no land transfer duty on properties up to $600,000, with a sliding partial concession from $600,000 to $750,000. Above $750,000 the standard rates apply. The exemption applies to both new and established homes used as a principal place of residence.' },
      { q: 'What is the Victorian PPR concession?',
        a: 'The principal place of residence (PPR) concession provides a partial duty reduction for owner-occupiers buying a home valued up to $550,000. It is available to anyone using the property as their principal residence — not just first home buyers. The PPR concession does not stack with the FHB exemption — buyers receive the most favourable single concession.' },
      { q: 'When is stamp duty due in Victoria?',
        a: 'Land transfer duty in Victoria is payable within 30 days of settlement. In practice, your conveyancer pays the SRO at settlement using funds drawn from your loan and deposit. Late payment attracts interest at the rate published by the SRO, plus penalty tax in some circumstances.' },
      { q: 'What is the foreign purchaser additional duty in Victoria?',
        a: 'Foreign purchasers pay an additional 8% foreign purchaser duty on top of standard land transfer duty when buying residential property in Victoria. The surcharge is collected by the SRO at the same time as the standard duty. Australian citizens, permanent residents (including New Zealand citizens with a Special Category Visa who satisfy the residency test) are not foreign purchasers.' },
      { q: 'Is Victorian stamp duty tax deductible?',
        a: 'No. Stamp duty paid by a Victorian property investor is not immediately deductible against rental income. It is added to the cost base of the property and reduces capital gains tax when the property is later sold. Owner-occupiers cannot deduct stamp duty at all.' },
    ],
    popularSuburbs: [
      { slug: 'st-kilda', label: 'St Kilda VIC' },
      { slug: 'point-cook', label: 'Point Cook VIC' },
      { slug: 'carlton', label: 'Carlton VIC' },
    ],
    cityHub: { slug: 'melbourne', label: 'Melbourne Suburb Guide' },
  },

  wa: {
    STATE: 'WA',
    stateName: 'Western Australia',
    capital: 'Perth',
    dutyName: 'Transfer Duty',
    revenueOffice: 'RevenueWA',
    revenueUrl: 'https://www.wa.gov.au/organisation/department-of-treasury-and-finance/transfer-duty',
    foreignRate: 0.07,
    foreignLabel: '7% foreign buyers duty',
    fhbFull: 430000,
    fhbPartial: 500000,
    fhbScheme: 'First Home Owner Rate of Duty',
    fhbSchemeUrl: 'https://www.wa.gov.au/organisation/department-of-treasury-and-finance/first-home-owner-rate-duty',
    fhbCopy: 'Western Australia offers a <strong>First Home Owner Rate of Duty (FHOR)</strong> that fully exempts eligible first home buyers from transfer duty on residential property purchases up to $430,000, with a sliding partial concession from $430,000 to $530,000. For vacant land the thresholds are $300,000 (full exemption) to $400,000 (partial). To qualify you must be eligible for the First Home Owner Grant (citizenship + first-time-buyer + occupation as principal residence) and lodge the FHOR claim through your settlement agent.',
    ownerVsInvestor: 'Western Australia offers a <strong>concessional residential rate</strong> for owner-occupiers buying a property up to $200,000 — but the saving is small in practice. For most owner-occupier purchases the difference between the standard "general" rate and the concessional rate is minimal once the property is over $200,000. Investors pay the general rate with no concession.',
    ratesNarrative: 'Transfer duty in Western Australia is administered by RevenueWA under the Duties Act 2008. Rates step up across five brackets, from nil under $2,000 to 4.75% on the portion above $1,000,000. The dutiable value is normally the purchase price, but RevenueWA can substitute a higher market valuation. WA also charges a foreign buyers duty of 7% — lower than the 8% applied in NSW, VIC, QLD, SA, ACT, and NT.',
    bracketRows: [
      ['$0 – $2,000', 'nil'],
      ['$2,001 – $4,000', '1% of dutiable value'],
      ['$4,001 – $500,000', '$20 + 2.0% over $4,000'],
      ['$500,001 – $1,000,000', '$9,920 + 3.5% over $500,000'],
      ['Above $1,000,000', '$27,420 + 4.75% over $1,000,000'],
    ],
    examples: [
      ['$430,000 property', '$8,540', '$8,540', '$0 (FHOR exemption)'],
      ['$500,000 property', '$9,920', '$9,920', '~$2,800 (FHOR partial)'],
      ['$900,000 property', '$23,920', '$23,920', '$23,920 (over $530k cap)'],
    ],
    faqs: [
      { q: 'How does stamp duty work in Western Australia?',
        a: 'WA transfer duty is charged by RevenueWA on the dutiable value of any property purchase. Rates step up across five brackets, from nil under $2,000 to 4.75% on the portion above $1,000,000. Owner-occupiers buying a property up to $200,000 may qualify for a concessional residential rate; otherwise owner-occupiers and investors pay the same general rate.' },
      { q: 'Do first home buyers pay stamp duty in WA?',
        a: 'Eligible first home buyers pay no transfer duty under the First Home Owner Rate of Duty (FHOR) on residential properties up to $430,000, with a sliding partial concession from $430,000 to $530,000. For vacant land the thresholds are $300,000 (full) to $400,000 (partial). Above the partial limit the standard rates apply.' },
      { q: 'When is WA transfer duty due?',
        a: 'WA transfer duty is generally payable within two months of the dutiable transaction — usually two months from contract date. Your settlement agent normally pays RevenueWA at settlement using funds from your loan and deposit. Late payment attracts penalty tax and interest at the rate published by RevenueWA.' },
      { q: 'Why is the WA foreign buyers duty 7% and not 8%?',
        a: 'WA introduced its 7% foreign buyers duty in 2019 — slightly lower than the 8% surcharge applied in most other states. The lower rate reflects WA government policy to maintain inbound investment in Perth and regional WA. The duty applies on top of the standard transfer duty whenever a foreign person acquires residential property.' },
      { q: 'Is WA stamp duty tax deductible for investors?',
        a: 'No. Stamp duty paid on an investment property in WA is not immediately deductible against rental income. It is added to the cost base of the property and reduces capital gains tax when the property is later sold. Owner-occupiers cannot deduct stamp duty at all.' },
      { q: 'How is "stamp duty" different from "transfer duty" in WA?',
        a: 'There is no difference — they are the same tax. WA formally calls it "transfer duty" in the Duties Act 2008, but everyday speech still uses "stamp duty". RevenueWA forms, settlement statements, and contract documents use "transfer duty"; lender quotes and buyer guides usually use "stamp duty".' },
    ],
    popularSuburbs: [
      { slug: 'subiaco', label: 'Subiaco WA' },
      { slug: 'fremantle', label: 'Fremantle WA' },
      { slug: 'yakamia', label: 'Yakamia WA' },
    ],
    cityHub: { slug: 'perth', label: 'Perth Suburb Guide' },
  },

  sa: {
    STATE: 'SA',
    stateName: 'South Australia',
    capital: 'Adelaide',
    dutyName: 'Stamp Duty on Conveyances',
    revenueOffice: 'RevenueSA',
    revenueUrl: 'https://www.revenuesa.sa.gov.au/stampduty',
    foreignRate: 0.07,
    foreignLabel: '7% foreign ownership surcharge',
    fhbFull: 650000,
    fhbPartial: 700000,
    fhbScheme: 'First Home Owner Stamp Duty Relief (new builds)',
    fhbSchemeUrl: 'https://www.revenuesa.sa.gov.au/grants-and-concessions/first-home-owners',
    fhbCopy: 'South Australia abolished stamp duty for eligible first home buyers purchasing <strong>new homes</strong> with a market value up to $650,000 (full exemption) and partial concession to $700,000. The same thresholds apply to vacant land where a new home will be built. <strong>Established homes</strong> do not currently qualify for the SA first home buyer stamp duty exemption — only new builds. To qualify you must intend to occupy the home as your principal place of residence for at least 12 months starting within 12 months of settlement.',
    ownerVsInvestor: 'South Australia does not offer a separate owner-occupier "home concession" — owner-occupiers and investors pay the same standard rates on established dwellings. The only owner-occupier relief is the First Home Owner stamp duty exemption (limited to new builds) and the First Home Owner Grant (separate cash grant).',
    ratesNarrative: 'Stamp duty on conveyances in South Australia is administered by RevenueSA under the Stamp Duties Act 1923. Rates step up across five brackets, from nil under $16,000 to 5.5% on the portion above $500,000. The duty is charged on the dutiable value — usually the contract price.',
    bracketRows: [
      ['$0 – $16,000', 'nil'],
      ['$16,001 – $19,000', '1.5% of dutiable value'],
      ['$19,001 – $250,000', '$45 + 3.0% over $19,000'],
      ['$250,001 – $300,000', '$6,915 + 3.5% over $250,000'],
      ['Above $300,000', '$8,665 + 4.0% over $300,000'],
    ],
    examples: [
      ['$500,000 property', '$16,665', '$16,665', '$0 (new build, FHB)'],
      ['$650,000 property', '$22,665', '$22,665', '$0 (new build, FHB)'],
      ['$800,000 property', '$28,665', '$28,665', '$28,665 (over $700k cap)'],
    ],
    faqs: [
      { q: 'How does stamp duty work in South Australia?',
        a: 'SA stamp duty on conveyances is charged by RevenueSA on the dutiable value of any property purchase. Rates step up across five brackets, from nil under $16,000 to 5.5% on the portion above $500,000. Owner-occupiers and investors pay the same standard rates on established dwellings.' },
      { q: 'Do first home buyers pay stamp duty in SA?',
        a: 'Eligible first home buyers pay no stamp duty on new homes up to $650,000 (full exemption) with a partial concession to $700,000. The same thresholds apply to vacant land used to build a new home. Established homes do not qualify for the SA first home buyer stamp duty exemption — only new builds.' },
      { q: 'When is stamp duty due in SA?',
        a: 'SA stamp duty is payable within two months of the dutiable transaction — usually two months from contract date. Your conveyancer normally pays RevenueSA at settlement. Late payment attracts interest and penalty tax under the Taxation Administration Act 1996 (SA).' },
      { q: 'What is the SA foreign ownership surcharge?',
        a: 'A 7% foreign ownership surcharge applies in addition to standard stamp duty when a foreign person acquires residential property in South Australia. The surcharge is collected by RevenueSA at the same time as the standard duty. Australian citizens and permanent residents are not foreign persons for this surcharge.' },
      { q: 'Why does SA not exempt established homes from FHB stamp duty?',
        a: 'The SA government has chosen to direct first home buyer stamp duty relief at new builds and vacant land specifically to incentivise housing supply growth. Established homes remain at full standard rates for first home buyers. The First Home Owner Grant (separate from stamp duty relief) is also limited to new builds in SA.' },
      { q: 'Is SA stamp duty tax deductible?',
        a: 'No. Stamp duty paid on an investment property in SA is not immediately deductible against rental income. It is added to the cost base of the property and reduces capital gains tax when the property is later sold. Owner-occupiers cannot deduct stamp duty at all.' },
    ],
    popularSuburbs: [
      { slug: 'adelaide', label: 'Adelaide SA' },
      { slug: 'glenelg', label: 'Glenelg SA' },
      { slug: 'norwood', label: 'Norwood SA' },
    ],
    cityHub: { slug: 'adelaide', label: 'Adelaide Suburb Guide' },
  },

  tas: {
    STATE: 'TAS',
    stateName: 'Tasmania',
    capital: 'Hobart',
    dutyName: 'Property Transfer Duty',
    revenueOffice: 'State Revenue Office Tasmania',
    revenueUrl: 'https://www.sro.tas.gov.au/property-transfer-duties',
    foreignRate: 0,
    foreignLabel: 'no foreign buyer surcharge applies',
    fhbFull: 750000,
    fhbPartial: 750000,
    fhbScheme: 'First Home Buyer Duty Concession (50% reduction)',
    fhbSchemeUrl: 'https://www.sro.tas.gov.au/property-transfer-duties/first-home-buyer-duty-concession',
    fhbCopy: 'Tasmania offers a <strong>50% duty concession for eligible first home buyers</strong> purchasing established homes valued up to $750,000. There is no full exemption — first home buyers still pay duty, but at half the standard rate up to the threshold. Above $750,000 standard rates apply with no concession. To qualify you must be 18 or older, never have owned residential property in Australia, occupy the home as your principal place of residence within 12 months for at least six continuous months, and lodge the concession claim through your settlement agent.',
    ownerVsInvestor: 'Tasmania does not offer a separate owner-occupier "home concession" — owner-occupiers (other than first home buyers) and investors pay the same standard rates. Tasmania is also unusual in not levying a foreign buyer surcharge, making it one of the few Australian jurisdictions where overseas buyers pay only the standard duty.',
    ratesNarrative: 'Property transfer duty in Tasmania is administered by the State Revenue Office Tasmania (SRO Tas) under the Duties Act 2001. Rates step up across five brackets, from nil under $3,000 to 4.75% on the portion above $250,000. Tasmania has the lowest top-bracket rate of any Australian state. The duty is charged on the dutiable value — usually the contract price.',
    bracketRows: [
      ['$0 – $3,000', 'nil'],
      ['$3,001 – $100,000', '$50 + 1.75% over $3,000'],
      ['$100,001 – $200,000', '$1,750 + 2.25% over $100,000'],
      ['$200,001 – $375,000', '$4,000 + 3.5% over $200,000'],
      ['Above $375,000', '$10,125 + 4.5% over $375,000'],
    ],
    examples: [
      ['$500,000 property', '$15,750', '$15,750', '$7,875 (50% concession)'],
      ['$650,000 property', '$22,500', '$22,500', '$11,250 (50% concession)'],
      ['$800,000 property', '$29,250', '$29,250', '$29,250 (over $750k cap)'],
    ],
    faqs: [
      { q: 'How does stamp duty work in Tasmania?',
        a: 'Tasmanian property transfer duty is charged by the State Revenue Office Tasmania (SRO Tas) on the dutiable value of any property purchase. Rates step up across five brackets, from nil under $3,000 to 4.75% on the portion above $250,000 — the lowest top-bracket rate in Australia. Owner-occupiers and investors pay the same standard rates.' },
      { q: 'Do first home buyers pay stamp duty in Tasmania?',
        a: 'Eligible first home buyers receive a 50% concession on duty payable for established homes up to $750,000. There is no full exemption — first home buyers still pay duty, but at half the standard rate. Above $750,000 standard rates apply with no concession.' },
      { q: 'When is stamp duty due in Tasmania?',
        a: 'Tasmanian property transfer duty is payable within three months of the dutiable transaction. Your conveyancer normally pays SRO Tas at settlement using funds from your loan and deposit. Late payment attracts interest at the rate published by SRO Tas.' },
      { q: 'Does Tasmania charge a foreign buyer surcharge?',
        a: 'No. Tasmania is one of the few Australian jurisdictions that does not currently levy a foreign buyer surcharge on residential property purchases. Foreign buyers pay only the standard transfer duty rates with no additional surcharge. This makes Tasmania notably cheaper for foreign investors than NSW, VIC, QLD, SA, WA, ACT, or NT.' },
      { q: 'Why is Tasmanian stamp duty cheaper than other states?',
        a: 'Tasmania has the lowest top-bracket transfer duty rate in Australia (4.75% above $375,000) and no foreign buyer surcharge. Combined with lower median property prices, the absolute dollar amount of duty is significantly less than in mainland states. The first home buyer concession (50% reduction up to $750,000) further reduces the burden for owner-occupier first-time buyers.' },
      { q: 'Is Tasmanian stamp duty tax deductible?',
        a: 'No. Stamp duty paid on an investment property in Tasmania is not immediately deductible against rental income. It is added to the cost base of the property and reduces capital gains tax when the property is later sold. Owner-occupiers cannot deduct stamp duty at all.' },
    ],
    popularSuburbs: [
      { slug: 'hobart', label: 'Hobart TAS' },
      { slug: 'launceston', label: 'Launceston TAS' },
      { slug: 'devonport', label: 'Devonport TAS' },
    ],
    cityHub: { slug: 'hobart', label: 'Hobart Suburb Guide' },
  },

  act: {
    STATE: 'ACT',
    stateName: 'Australian Capital Territory',
    capital: 'Canberra',
    dutyName: 'Conveyance Duty',
    revenueOffice: 'ACT Revenue Office',
    revenueUrl: 'https://www.revenue.act.gov.au/duties/conveyance-duty',
    foreignRate: 0.075,
    foreignLabel: '0.75% per quarter foreign owner land tax surcharge',
    fhbFull: 1000000,
    fhbPartial: 1000000,
    fhbScheme: 'Home Buyer Concession Scheme (HBCS)',
    fhbSchemeUrl: 'https://www.revenue.act.gov.au/home-buyer-assistance/home-buyer-concession-scheme',
    fhbCopy: 'The ACT operates the <strong>Home Buyer Concession Scheme (HBCS)</strong>, which provides full duty exemption for eligible buyers (not just first home buyers) on properties up to $1,000,000. The scheme has income thresholds — household income must be below $250,000 (with adjustments for dependants) — but no asset test on prior home ownership. This makes the ACT one of the most generous jurisdictions for owner-occupier duty relief in Australia. Buyers must occupy the property as their principal place of residence for at least 12 months continuously starting within 12 months of settlement.',
    ownerVsInvestor: 'The ACT Home Buyer Concession Scheme covers all eligible owner-occupiers (subject to income tests) — not just first home buyers — making the ACT effectively a "no stamp duty" jurisdiction for most owner-occupier purchases under $1M. Investors pay the standard conveyance duty rates with no concession. The ACT is also progressively phasing out residential conveyance duty under a long-running stamp duty reform; rates have been reduced annually for over a decade.',
    ratesNarrative: 'ACT conveyance duty is administered by the ACT Revenue Office under the Duties Act 1999. Rates step up across four brackets, from nil under $7,500 to 4.54% on the portion above $1,455,000. The ACT has been progressively reducing residential conveyance duty rates as part of a stamp duty / general rates trade-off — duty rates today are materially lower than they were a decade ago.',
    bracketRows: [
      ['$0 – $260,000', '$0.49 per $100 (0.49%)'],
      ['$260,001 – $300,000', '$1,274 + $2.20 per $100 over $260,000'],
      ['$300,001 – $500,000', '$2,154 + $3.40 per $100 over $300,000'],
      ['$500,001 – $750,000', '$8,954 + $4.32 per $100 over $500,000'],
      ['$750,001 – $1,000,000', '$19,754 + $5.90 per $100 over $750,000'],
      ['$1,000,001 – $1,455,000', '$34,504 + $6.40 per $100 over $1,000,000'],
      ['Above $1,455,000', '$63,624 flat'],
    ],
    examples: [
      ['$650,000 property', '$15,434', '$15,434', '$0 (HBCS exemption)'],
      ['$900,000 property', '$28,604', '$28,604', '$0 (HBCS exemption)'],
      ['$1,200,000 property', '$47,304', '$47,304', '$47,304 (over $1M cap)'],
    ],
    faqs: [
      { q: 'How does stamp duty work in the ACT?',
        a: 'ACT conveyance duty is charged by the ACT Revenue Office on the dutiable value of any property purchase. Rates step up across multiple brackets, with a flat $63,624 above $1,455,000. Eligible owner-occupiers (subject to income tests) can claim full duty exemption under the Home Buyer Concession Scheme on properties up to $1,000,000.' },
      { q: 'Do first home buyers pay stamp duty in the ACT?',
        a: 'The ACT Home Buyer Concession Scheme (HBCS) is more generous than other states — it covers all eligible buyers (not just first home buyers) on properties up to $1,000,000, subject to a household income test (typically below $250,000 with adjustments for dependants). Most first home buyers within these thresholds pay no conveyance duty in the ACT.' },
      { q: 'What is the ACT Home Buyer Concession Scheme?',
        a: 'The HBCS provides full duty exemption for eligible owner-occupiers (not just first home buyers) on properties valued up to $1,000,000, subject to a household income test. The scheme replaced the previous First Home Owner Grant + duty concession in 2019 and is materially more generous. To qualify you must occupy the property as your principal residence for at least 12 months continuously starting within 12 months of settlement.' },
      { q: 'When is stamp duty due in the ACT?',
        a: 'ACT conveyance duty is payable within 14 days of receiving the assessment notice from the ACT Revenue Office — typically within 28 days of registration. Most buyers pay duty at settlement through their solicitor or conveyancer. Late payment attracts interest at the rate published by the ACT Revenue Office.' },
      { q: 'Does the ACT charge a foreign buyer surcharge?',
        a: 'The ACT does not charge a one-off foreign buyer stamp duty surcharge. Instead, foreign owners of residential property pay an annual foreign ownership land tax surcharge of 0.75% per quarter (3% per year) of the unimproved land value. This is collected separately from stamp duty and applies for as long as the foreign person owns the property.' },
      { q: 'Is ACT stamp duty being abolished?',
        a: 'The ACT government has been progressively reducing residential conveyance duty rates as part of a long-running tax reform. Duty rates today are materially lower than they were a decade ago, and the trade-off has been a gradual increase in general rates (council rates) on residential property. There is no firm date for full abolition, but the trend is downward.' },
    ],
    popularSuburbs: [
      { slug: 'kingston', label: 'Kingston ACT' },
      { slug: 'belconnen', label: 'Belconnen ACT' },
      { slug: 'gungahlin', label: 'Gungahlin ACT' },
    ],
    cityHub: { slug: 'canberra', label: 'Canberra Suburb Guide' },
  },

  nt: {
    STATE: 'NT',
    stateName: 'Northern Territory',
    capital: 'Darwin',
    dutyName: 'Stamp Duty on Conveyances',
    revenueOffice: 'Territory Revenue Office',
    revenueUrl: 'https://nt.gov.au/property/buying-and-selling-a-home/settle-the-sale/stamp-duty-buying-or-selling-a-home',
    foreignRate: 0,
    foreignLabel: 'no foreign buyer surcharge applies',
    fhbFull: 650000,
    fhbPartial: 650000,
    fhbScheme: 'House and Land Package Stamp Duty Discount',
    fhbSchemeUrl: 'https://nt.gov.au/property/buying-and-selling-a-home/settle-the-sale/stamp-duty-buying-or-selling-a-home',
    fhbCopy: 'The Northern Territory currently offers a <strong>stamp duty discount of up to $50,000 for first home buyers</strong> purchasing a new home, a house and land package, or vacant land where a new home will be built. There is no full exemption — the discount reduces the duty payable by up to $50,000 (capped at the actual duty liability). For established homes there is no first home buyer concession; first home buyers pay full standard rates. To qualify you must be eligible for the First Home Owner Grant and lodge the discount claim through your conveyancer.',
    ownerVsInvestor: 'The Northern Territory does not offer a separate owner-occupier "home concession" — owner-occupiers and investors pay the same standard rates on established dwellings. The only owner-occupier relief is the first home buyer discount on new builds (capped at $50,000) and the First Home Owner Grant (separate cash grant). Like Tasmania, the NT does not currently levy a foreign buyer surcharge.',
    ratesNarrative: 'NT stamp duty on conveyances is administered by the Territory Revenue Office under the Stamp Duty Act 1978. The NT uses a single graduated formula rather than discrete brackets: rates rise smoothly with the dutiable value, capping out at 5.95% above $5 million. The duty is charged on the dutiable value — usually the contract price.',
    bracketRows: [
      ['$0 – $525,000', 'D = (0.06571441 × V²) + 15V (V in thousands)'],
      ['$525,001 – $3,000,000', '4.95% of dutiable value'],
      ['$3,000,001 – $5,000,000', '5.75% of dutiable value'],
      ['Above $5,000,000', '5.95% of dutiable value'],
    ],
    examples: [
      ['$500,000 property', '$23,929', '$23,929', '$0 (new build, FHB up to $50k)'],
      ['$650,000 property', '$32,175', '$32,175', '$0 (new build, FHB up to $50k)'],
      ['$800,000 property', '$39,600', '$39,600', '$39,600 (established home)'],
    ],
    faqs: [
      { q: 'How does stamp duty work in the Northern Territory?',
        a: 'NT stamp duty on conveyances is charged by the Territory Revenue Office on the dutiable value of any property purchase. The NT uses a single graduated formula rather than discrete brackets — rates rise smoothly with the dutiable value, capping out at 5.95% above $5 million. Owner-occupiers and investors pay the same standard rates on established dwellings.' },
      { q: 'Do first home buyers pay stamp duty in the NT?',
        a: 'First home buyers buying new homes, house and land packages, or vacant land where a new home will be built can claim a stamp duty discount of up to $50,000. There is no full exemption — the discount reduces the duty payable by up to $50,000. For established homes there is no first home buyer concession.' },
      { q: 'When is stamp duty due in the NT?',
        a: 'NT stamp duty is payable within 60 days of the dutiable transaction. Your conveyancer normally pays the Territory Revenue Office at settlement using funds drawn from your loan and deposit. Late payment attracts interest and penalty tax under the Taxation Administration Act (NT).' },
      { q: 'Does the NT charge a foreign buyer surcharge?',
        a: 'No. The Northern Territory does not currently levy a foreign buyer surcharge on residential property purchases. Like Tasmania, this makes the NT notably cheaper for foreign buyers than NSW, VIC, QLD, SA, WA, or the ACT.' },
      { q: 'Why does the NT use a formula instead of brackets?',
        a: 'The NT formula (D = 0.06571441 × V² + 15V for purchases under $525,000) produces a smooth graduated curve rather than the bracket-based steps used in other states. The practical effect is similar to a tiered system, but the duty changes by cents (not dollars) as the price changes — eliminating the small jumps at bracket boundaries that other states have.' },
      { q: 'Is NT stamp duty tax deductible?',
        a: 'No. Stamp duty paid on an investment property in the NT is not immediately deductible against rental income. It is added to the cost base of the property and reduces capital gains tax when the property is later sold. Owner-occupiers cannot deduct stamp duty at all.' },
    ],
    popularSuburbs: [
      { slug: 'darwin-city', label: 'Darwin City NT' },
      { slug: 'palmerston', label: 'Palmerston NT' },
      { slug: 'alice-springs', label: 'Alice Springs NT' },
    ],
    cityHub: { slug: 'darwin', label: 'Darwin Suburb Guide' },
  },
};

// ── Title-office registration fees (FY 2025-26) ────────────────────────────
// Mortgage registration + title transfer fees. Mirrors the table in
// tools/stamp-duty-calculator.js so both the all-states and per-state
// pages display identical figures. Verify against state title-office
// fee schedules each financial year.
const REG_FEES = {
  nsw: { mortgage: 185, transfer: 185 },
  vic: { mortgage: 123, transfer: 124 },
  qld: { mortgage: 232, transfer: 250 },
  sa:  { mortgage: 200, transfer: 230 },
  wa:  { mortgage: 190, transfer: 200 },
  tas: { mortgage: 150, transfer: 250 },
  act: { mortgage: 200, transfer: 200 },
  nt:  { mortgage: 200, transfer: 200 },
};

// ── Templates ──────────────────────────────────────────────────────────────

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function jsonStr(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

function buildHtml(s) {
  const stateLc = s.STATE.toLowerCase();
  const url = `https://equitysight.app/tools/stamp-duty-calculator-${stateLc}`;
  const titleShort = `${s.STATE} Stamp Duty Calculator — ${s.stateName} ${s.dutyName}`;
  const titleSocial = `${s.STATE} Stamp Duty Calculator 2026 — ${s.stateName} | EquitySight`;
  const metaDesc = `Calculate ${s.stateName} ${s.dutyName.toLowerCase()} on property purchases. ${s.fhbFull >= 1000000 ? 'Owner-occupier exemption up to $1M.' : `First home buyer exemption up to $${(s.fhbFull/1000).toFixed(0)}k.`} Updated 2026.`;

  const faqJsonLd = s.faqs.map(({ q, a }) => `{"@type":"Question","name":"${jsonStr(q)}","acceptedAnswer":{"@type":"Answer","text":"${jsonStr(a)}"}}`).join(',');

  const breadcrumbJsonLd = `{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"EquitySight","item":"https://equitysight.app/"},{"@type":"ListItem","position":2,"name":"Free Calculators","item":"https://equitysight.app/tools/"},{"@type":"ListItem","position":3,"name":"${jsonStr(s.STATE)} Stamp Duty Calculator"}]}`;

  const webAppJsonLd = `{"@context":"https://schema.org","@type":"WebApplication","name":"${jsonStr(s.STATE)} Stamp Duty Calculator","url":"${url}","description":"Free ${jsonStr(s.stateName)} ${jsonStr(s.dutyName.toLowerCase())} calculator. Calculate duty for owner-occupiers, investors, and first home buyers using current ${jsonStr(s.revenueOffice)} rates.","applicationCategory":"FinanceApplication","operatingSystem":"Web","offers":{"@type":"Offer","price":"0","priceCurrency":"AUD"},"publisher":{"@type":"Organization","name":"EquitySight","url":"https://equitysight.app"},"areaServed":{"@type":"State","name":"${jsonStr(s.stateName)}"}}`;

  const bracketRows = s.bracketRows.map(([range, rate]) => `    <tr><td style="padding:8px;border-bottom:1px solid currentColor">${range}</td><td style="padding:8px;border-bottom:1px solid currentColor;text-align:right">${rate}</td></tr>`).join('\n');

  const exampleRows = s.examples.map(([scenario, inv, oo, fhb]) => `      <tr>\n        <td style="padding:8px;border-bottom:1px solid currentColor"><strong>${scenario}</strong></td>\n        <td style="padding:8px;text-align:right;border-bottom:1px solid currentColor">${inv}</td>\n        <td style="padding:8px;text-align:right;border-bottom:1px solid currentColor">${oo}</td>\n        <td style="padding:8px;text-align:right;border-bottom:1px solid currentColor">${fhb}</td>\n      </tr>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
<script src="/gtag-loader.js" defer></script>
<script src="/analytics.js" defer></script>
<meta charset="UTF-8">
<script src="tool-page.js" defer></script>
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${titleShort}</title>
<meta name="description" content="${escAttr(metaDesc)}">
<meta name="keywords" content="stamp duty calculator ${stateLc}, ${stateLc} stamp duty calculator, ${s.stateName.toLowerCase()} stamp duty, ${s.stateName.toLowerCase()} ${s.dutyName.toLowerCase()}, ${stateLc} first home buyer ${s.dutyName.toLowerCase()}, ${s.capital.toLowerCase()} stamp duty calculator, ${s.stateName.toLowerCase()} ${s.dutyName.toLowerCase()} 2026">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="en-AU" href="${url}">
<link rel="alternate" hreflang="x-default" href="${url}">
<meta name="geo.region" content="AU">
<meta name="geo.placename" content="Australia">
<meta property="og:type" content="website">
<meta property="og:title" content="${escAttr(titleSocial)}">
<meta property="og:description" content="${escAttr(metaDesc)}">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="EquitySight.app">
<meta property="og:image" content="https://equitysight.app/images/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="EquitySight — Property finance, finally clear.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escAttr(titleSocial)}">
<meta name="twitter:description" content="${escAttr(metaDesc)}">
<meta name="twitter:image" content="https://equitysight.app/images/og-image.png">
<link rel="icon" type="image/svg+xml" href="../favicon.svg">
<meta name="theme-color" content="#1C1C1E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500;600&display=swap">
<script src="/font-loader.js" defer></script>
<link rel="stylesheet" href="../shared.css">
<link rel="stylesheet" href="../tools.css">
<script src="../adsense.js" defer></script>
<script type="application/ld+json">
${webAppJsonLd}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[${breadcrumbJsonLd},{"@type":"FAQPage","mainEntity":[${faqJsonLd}]}]}
</script>
</head>
<body>
<a href="#main-content" class="skip-link">Skip to content</a>

<nav class="site-nav">
  <div class="site-nav-inner">
    <a href="/" class="site-logo">
      <div class="site-logo-mark"><img src="/images/icon-dark.svg" alt="EquitySight" width="52" height="52"></div>
      <div class="site-logo-text"><span class="site-logo-name">EquitySight</span><span class="site-logo-tld">.app</span></div>
    </a>
    <ul class="site-nav-links"></ul>
    <div class="site-nav-actions"></div>
    <button class="nav-hamburger" id="nav-ham" aria-label="Open menu">☰</button>
  </div>
</nav>
<script src="/auth-nav-loader.js" defer></script>
<script src="../error-capture.js" defer></script>

<section class="tool-hero" id="main-content">
  <div class="tool-eyebrow">Free Tool · ${s.stateName}</div>
  <h1>${s.STATE} Stamp Duty Calculator</h1>
  <p>Calculate ${s.stateName} ${s.dutyName.toLowerCase()} for owner-occupiers, investors, and first home buyers using current ${s.revenueOffice} rates.</p>
</section>

<div class="tool-main">

  <div class="tool-card">
    <div class="tool-card-title">Property details</div>

    <div class="tool-field">
      <label class="tool-label" for="price">Property purchase price</label>
      <input class="tool-input" type="text" inputmode="decimal" id="price" value="650,000" placeholder="e.g. 650,000">
    </div>

    <div class="tool-field">
      <label class="tool-label" for="ptype">Property type</label>
      <select class="tool-input tool-select" id="ptype">
        <option value="home">Residential dwelling</option>
        <option value="land">Vacant land</option>
      </select>
    </div>

    <div class="tool-field">
      <label class="tool-label" for="buyer">Buyer profile</label>
      <select class="tool-input tool-select" id="buyer">
        <option value="owner">Owner-occupier</option>
        <option value="investor">Investor</option>
      </select>
    </div>

    <div class="tool-check">
      <input type="checkbox" id="fhb">
      <label for="fhb">First home buyer (eligible for concession)</label>
    </div>
${s.foreignRate > 0 ? `    <div class="tool-check">
      <input type="checkbox" id="foreign">
      <label for="foreign">Foreign buyer (additional ${Math.round(s.foreignRate * 100)}% surcharge)</label>
    </div>` : `    <!-- ${s.STATE} does not levy a foreign buyer surcharge -->`}

    <div class="tool-field">
      <label class="tool-label" for="deposit-pct">Deposit % <span class="tool-label-hint">(for LMI estimate; default 20%)</span></label>
      <input class="tool-input" type="number" id="deposit-pct" value="20" min="2" max="50" step="1">
    </div>

    <button class="tool-btn" id="stamp-calc-btn">Calculate Stamp Duty</button>
  </div>

  <div class="tool-result" aria-live="polite" aria-atomic="false" id="result" style="display:none">
    <div class="tool-result-title">Your ${s.stateName} ${s.dutyName.toLowerCase()} estimate</div>
    <div class="tool-grid">
      <div class="tool-stat">
        <div class="tool-stat-label">${s.dutyName}</div>
        <div class="tool-stat-value" id="r-duty">—</div>
      </div>
${s.foreignRate > 0 ? `      <div class="tool-stat" id="r-foreign-wrap">
        <div class="tool-stat-label">Foreign Surcharge (${Math.round(s.foreignRate * 100)}%)</div>
        <div class="tool-stat-value" id="r-foreign">—</div>
      </div>` : ''}
      <div class="tool-stat highlight">
        <div class="tool-stat-label">Total Duty</div>
        <div class="tool-stat-value" id="r-total">—</div>
      </div>
      <div class="tool-stat">
        <div class="tool-stat-label">Effective Rate</div>
        <div class="tool-stat-value" id="r-rate">—</div>
      </div>
      <div class="tool-stat full">
        <div class="tool-stat-label">All-In Price (Property + Duty)</div>
        <div class="tool-stat-value" id="r-allin">—</div>
      </div>
    </div>
    <div class="tool-disclaimer" id="r-note" style="display:none"></div>

    <h3 class="bp-subheading">Other upfront purchase costs</h3>
    <p class="bp-sub-desc">Stamp duty is the biggest line — these are the rest most calculators leave out.</p>
    <div class="tool-grid">
      <div class="tool-stat">
        <div class="tool-stat-label">LVR (loan-to-value)</div>
        <div class="tool-stat-value" id="r-lvr">—</div>
      </div>
      <div class="tool-stat">
        <div class="tool-stat-label">Estimated LMI</div>
        <div class="tool-stat-value" id="r-lmi">—</div>
      </div>
      <div class="tool-stat">
        <div class="tool-stat-label">Title office reg fees</div>
        <div class="tool-stat-value" id="r-reg">—</div>
      </div>
      <div class="tool-stat">
        <div class="tool-stat-label">Conveyancing / legal</div>
        <div class="tool-stat-value" id="r-conveyancing">—</div>
      </div>
      <div class="tool-stat highlight full">
        <div class="tool-stat-label">Estimated total upfront (duty + LMI + fees + legal)</div>
        <div class="tool-stat-value" id="r-upfront">—</div>
      </div>
    </div>

    <p class="tool-disclaimer" id="disclaimer"></p>
  </div>

  <div class="ad-slot" data-ad-type="calculator"></div>

  <div id="tool-partners-root"></div>
  <div id="tool-disclosure-root"></div>
  <div id="tool-cta-root"></div>
  <div id="tool-share-root"></div>
  <div id="tool-related-root"></div>
  <div id="tool-examples-root"></div>
  <div id="tool-faq-root"></div>
  <div id="tool-useful-links-root"></div>

</div>

<section class="tool-content">
  <h2>How stamp duty works in ${s.stateName}</h2>
  <p>${s.ratesNarrative}</p>
  <p>${s.STATE} uses the following bracket structure for the standard duty rate:</p>
  <table class="tool-table" style="width:100%;border-collapse:collapse;margin:16px 0">
    <thead>
      <tr><th style="text-align:left;padding:8px;border-bottom:2px solid currentColor">Dutiable value</th><th style="text-align:right;padding:8px;border-bottom:2px solid currentColor">Standard rate</th></tr>
    </thead>
    <tbody>
${bracketRows}
    </tbody>
  </table>

  <h2>Owner-occupier vs investor in ${s.STATE}</h2>
  <p>${s.ownerVsInvestor}</p>

<details class="tool-content-more"><summary>Show FHB concessions, foreign-buyer surcharge, worked examples & state comparison</summary>

  <h2>${s.stateName} first home buyer concession</h2>
  <p>${s.fhbCopy}</p>
  <p>For full eligibility details and to apply, see <a href="${s.fhbSchemeUrl}" target="_blank" rel="noopener">${s.revenueOffice}: ${s.fhbScheme}</a>.</p>

  <h2>Foreign buyer surcharge</h2>
  <p>${s.foreignRate > 0 ? `When a foreign person acquires residential property in ${s.stateName}, the ${s.foreignLabel} applies in addition to the standard ${s.dutyName.toLowerCase()}. The surcharge is collected by ${s.revenueOffice} at the same time as the standard duty. Australian citizens and permanent residents are not foreign persons for the purposes of this surcharge.` : `${s.stateName} does not currently levy a foreign buyer surcharge on residential property purchases. Foreign buyers pay only the standard ${s.dutyName.toLowerCase()} rates with no additional surcharge — making ${s.stateName} one of the few Australian jurisdictions where overseas buyers pay no extra duty.`}</p>

  <h2>Worked examples</h2>
  <table class="tool-table" style="width:100%;border-collapse:collapse;margin:16px 0">
    <thead>
      <tr><th style="text-align:left;padding:8px;border-bottom:2px solid currentColor">Scenario</th><th style="text-align:right;padding:8px;border-bottom:2px solid currentColor">Investor</th><th style="text-align:right;padding:8px;border-bottom:2px solid currentColor">Owner-occupier</th><th style="text-align:right;padding:8px;border-bottom:2px solid currentColor">First home buyer</th></tr>
    </thead>
    <tbody>
${exampleRows}
    </tbody>
  </table>
  <p class="tool-disclaimer">Estimates use ${s.revenueOffice} 2025–26 ${s.dutyName.toLowerCase()} rates. Always confirm the exact figure with your solicitor or conveyancer before settlement — these calculations do not account for off-the-plan concessions, pensioner concessions, or other state-specific reliefs that may apply to your situation.</p>

  <h2>Compare with other Australian states</h2>
  <p>Need to calculate stamp duty for another state? Use our <a href="/tools/stamp-duty-calculator">all-states stamp duty calculator</a>, which covers NSW, VIC, QLD, SA, WA, TAS, ACT, and NT in a single tool. Each state has different rates, thresholds, and concessions — ${s.stateName} ${s.STATE === 'TAS' || s.STATE === 'NT' ? 'is one of the few jurisdictions without a foreign buyer surcharge' : s.STATE === 'VIC' ? 'has the highest top-bracket rate in Australia (6.5% above $870k)' : s.STATE === 'ACT' ? 'is the most generous for owner-occupier duty relief via the HBCS' : `applies a ${Math.round(s.foreignRate * 100)}% foreign buyer surcharge`}.</p>

  <h2>Frequently asked questions</h2>
${s.faqs.map(({ q, a }) => `  <h3>${q}</h3>\n  <p>${a}</p>`).join('\n')}

</details>
</section>

<div id="tool-resources-root"></div>
<div id="tool-trust-root"></div>
<div id="tool-footer-root"></div>

<script src="stamp-duty-calculator-${stateLc}.js" defer></script>

</body>
</html>
`;
}

function buildJs(s) {
  const stateLc = s.STATE.toLowerCase();
  const url = `https://equitysight.app/tools/stamp-duty-calculator-${stateLc}`;
  const popularSuburbsLinks = s.popularSuburbs.map(p => `    { group: 'Popular Suburbs', icon: '\\uD83D\\uDCCD', href: '/suburb/${stateLc}/${p.slug}/', label: '${p.label}' }`).join(',\n');

  return `/* ${s.STATE} Stamp Duty Calculator — uses ${s.revenueOffice} 2025–26 rates.
 * The bracket structure here mirrors that used by tools/stamp-duty-calculator.js
 * for ${s.STATE}; this file exists so the ${s.STATE}-specific landing URL can run a
 * state-locked version of the tool without a state selector. */

var ${s.STATE}_FOREIGN_RATE = ${s.foreignRate};
var ${s.STATE}_FHB_FULL = ${s.fhbFull};
var ${s.STATE}_FHB_PARTIAL = ${s.fhbPartial};

// State-standard transfer duty (investor / non-FHB).
function calc${s.STATE}Standard(v) {
  ${stampDutyFormula(s.STATE)}
}

function calc${s.STATE}Duty(price, ptype, buyer, fhb) {
  if (price <= 0) return { duty: 0, note: '' };
  var v = price;
  var standard = calc${s.STATE}Standard(v);

  if (fhb && v <= ${s.STATE}_FHB_FULL) {
    ${s.STATE === 'TAS' ? 'return { duty: standard * 0.5, note: \'First home buyer concession applied (50% reduction).\' };' : 'return { duty: 0, note: \'First home buyer exemption applied.\' };'}
  }
  if (fhb && v <= ${s.STATE}_FHB_PARTIAL && ${s.STATE}_FHB_PARTIAL > ${s.STATE}_FHB_FULL) {
    var slide = (${s.STATE}_FHB_PARTIAL - v) / (${s.STATE}_FHB_PARTIAL - ${s.STATE}_FHB_FULL);
    return { duty: Math.max(0, standard * (1 - slide)), note: 'First home buyer partial concession applied.' };
  }

  return { duty: standard, note: '' };
}

function calculate() {
  var val = parseVal('price');
  if (!val || val <= 0) { if (!_isInit) alert('Please enter the purchase price.'); return; }

  var ptype = document.getElementById('ptype').value;
  var buyer = document.getElementById('buyer').value;
  var isFHB = document.getElementById('fhb').checked;
  var foreignEl = document.getElementById('foreign');
  var isForeign = foreignEl ? foreignEl.checked : false;

  var result = calc${s.STATE}Duty(val, ptype, buyer, isFHB);
  var duty = result.duty;
  var note = result.note;

  var foreignAmt = isForeign ? val * ${s.STATE}_FOREIGN_RATE : 0;
  var total = duty + foreignAmt;
  var rate = val > 0 ? (total / val * 100) : 0;

  // ── Reg fees + LMI + total upfront ─────────────────────────────────
  var depPctEl = document.getElementById('deposit-pct');
  var depositPct = depPctEl ? (parseFloat(depPctEl.value) || 20) : 20;
  var loanAmount = val * (1 - depositPct / 100);
  var lvr = loanAmount / val;
  var regMortgage = ${(REG_FEES[s.STATE.toLowerCase()] && REG_FEES[s.STATE.toLowerCase()].mortgage) || 200};
  var regTransfer = ${(REG_FEES[s.STATE.toLowerCase()] && REG_FEES[s.STATE.toLowerCase()].transfer) || 200};
  var regTotal = regMortgage + regTransfer;
  var conveyancing = 1800;
  function lmiRate(lvr) {
    if (lvr <= 0.80) return 0;
    if (lvr <= 0.85) return 0.0080;
    if (lvr <= 0.90) return 0.0190;
    if (lvr <= 0.95) return 0.0340;
    return 0.0430;
  }
  var lmi = (isFHB && lvr > 0.80) ? 0 : Math.round(loanAmount * lmiRate(lvr));
  var lmiLabel = (isFHB && lvr > 0.80)
    ? '$0 (FHBG eligibility assumed)'
    : (lmi > 0 ? fmt(lmi) : '$0 (no LMI)');
  var upfrontTotal = total + lmi + regTotal + conveyancing;

  document.getElementById('r-duty').textContent = fmt(duty);
  var foreignTextEl = document.getElementById('r-foreign');
  if (foreignTextEl) foreignTextEl.textContent = isForeign ? fmt(foreignAmt) : 'N/A';
  document.getElementById('r-total').textContent = fmt(total);
  document.getElementById('r-rate').textContent = rate.toFixed(2) + '%';
  document.getElementById('r-allin').textContent = fmt(val + total);
  document.getElementById('r-note').textContent = note;
  document.getElementById('r-note').style.display = note ? '' : 'none';

  var lvrEl = document.getElementById('r-lvr');
  if (lvrEl) lvrEl.textContent = (lvr * 100).toFixed(1) + '% (' + fmt(loanAmount) + ' loan)';
  var lmiEl = document.getElementById('r-lmi');
  if (lmiEl) lmiEl.textContent = lmiLabel;
  var regEl = document.getElementById('r-reg');
  if (regEl) regEl.textContent = fmt(regTotal) + ' (mortgage $' + regMortgage + ' + transfer $' + regTransfer + ')';
  var conveyEl = document.getElementById('r-conveyancing');
  if (conveyEl) conveyEl.textContent = fmt(conveyancing) + ' (typical $1,500–$2,500)';
  var upfrontEl = document.getElementById('r-upfront');
  if (upfrontEl) upfrontEl.textContent = fmt(upfrontTotal);

  document.getElementById('disclaimer').textContent = 'Estimates only. Rates based on ${s.stateName} 2025-26 ${s.dutyName.toLowerCase()}. LMI is an industry-average estimate. Verify with a solicitor before settlement.';

  document.getElementById('result').style.display = '';
  if (!_isInit) {
    document.getElementById('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (window.trackCalculatorResult) trackCalculatorResult('stamp-duty-${stateLc}', {
      purchasePrice: val,
      stampDuty: duty,
      foreignBuyerDuty: foreignAmt,
      totalCost: total,
      effectiveRate: rate.toFixed(2),
      buyer: buyer,
      propertyType: ptype,
      isFHB: isFHB,
      isForeign: isForeign
    });
  }
}

/* ═══ TOOL CONFIG ═══ */
ToolPage.init({
  partnerSlug: 'stamp-duty-${stateLc}',
  cta: {
    eyebrow: 'Go deeper',
    title: 'Model the full ${s.stateName} investment',
    description: 'Add rental income, body corporate fees, council rates, and 30-year growth projections — all in EquitySight.',
    buttonText: 'Get started free →',
    buttonHref: '/login?tab=signup'
  },
  resources: {
    groups: [
      {
        icon: '\\uD83C\\uDFDB\\uFE0F', title: '${s.revenueOffice}',
        links: [
          { text: '${s.STATE} ${s.dutyName}', href: '${s.revenueUrl}' },
          { text: '${s.fhbScheme}', href: '${s.fhbSchemeUrl}' }
        ]
      },
      {
        icon: '\\uD83C\\uDFAF', title: 'First Home Buyer',
        links: [
          { text: 'First Home Guarantee Scheme', href: 'https://www.housingaustralia.gov.au/first-home-guarantee' },
          { text: 'First Home Super Saver', href: 'https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/early-access-to-super/first-home-super-saver-scheme' },
          { text: 'ASIC: Buying a Home', href: 'https://moneysmart.gov.au/buying-a-house' }
        ]
      },
      {
        icon: '\\uD83D\\uDCB0', title: 'Financial Planning',
        links: [
          { text: 'ASIC: Home Loan Guide', href: 'https://moneysmart.gov.au/home-loans' },
          { text: 'ATO: Rental Properties', href: 'https://www.ato.gov.au/individuals-and-families/investments-and-assets/property-and-land/residential-rental-properties' },
          { text: 'Choosing a Home Loan', href: 'https://moneysmart.gov.au/home-loans/choosing-a-home-loan' }
        ]
      }
    ],
    disclaimer: 'This information is general only. Always consult with a licensed solicitor, accountant, and financial adviser before purchasing. Verify current rates with ${s.revenueOffice}.'
  },
  share: {
    url: '${url}',
    text: 'Just calculated my ${s.stateName} stamp duty instantly!'
  },
  related: [
    { href: '/tools/stamp-duty-calculator', icon: '\\uD83C\\uDFDB\\uFE0F', label: 'All-state Stamp Duty Calculator' },
    { href: '/tools/cost-of-purchase-calculator', icon: '\\uD83D\\uDCB5', label: 'Total Cost of Purchase' },
    { href: '/tools/loan-serviceability-calculator', icon: '\\uD83D\\uDCCA', label: 'Loan Serviceability' },
    { href: '/tools/first-home-buyer-grants-calculator', icon: '\\uD83C\\uDF81', label: 'FHB Grants Calculator' }
  ],
  footer: [
    { href: '/', text: 'EquitySight.app' },
    { href: '/tools/stamp-duty-calculator', text: 'All States' },
    { href: '/tools/cost-of-purchase-calculator', text: 'Cost of Purchase' },
    { href: '/invest/${stateLc}/', text: '${s.STATE} Suburb Guide' },
    { href: '/privacy', text: 'Privacy' }
  ],
  examples: ${JSON.stringify(s.examples.map(([scen, inv, oo, fhb]) => ({
    label: `${s.STATE} — ${scen}`,
    inputs: [
      { k: 'Property price', v: scen.replace(' property', '') },
      { k: 'State', v: s.stateName }
    ],
    outputs: [
      { k: 'Investor duty', v: inv },
      { k: 'Owner-occupier duty', v: oo },
      { k: 'First home buyer duty', v: fhb }
    ]
  })), null, 2)},
  faq: ${JSON.stringify(s.faqs.map(({ q, a }) => ({ q, a })), null, 2)},
  usefulLinks: [
    { group: 'Other Tools', icon: '\\uD83C\\uDFDB\\uFE0F', href: '/tools/stamp-duty-calculator', label: 'All-states Stamp Duty Calculator' },
    { group: 'Other Tools', icon: '\\uD83D\\uDCCA', href: '/tools/cost-of-purchase-calculator', label: 'Cost of Purchase Calculator' },
    { group: 'Other Tools', icon: '\\uD83C\\uDFE6', href: '/tools/loan-serviceability-calculator', label: 'Loan Serviceability Calculator' },
${popularSuburbsLinks},
    { group: 'Guides', icon: '\\uD83D\\uDCD6', href: '/blog/', label: 'Property Investment Blog' },
    { group: 'Guides', icon: '\\uD83D\\uDCD6', href: '/invest/${stateLc}/${s.cityHub.slug}/', label: '${s.cityHub.label}' },
    { group: 'Guides', icon: '\\uD83D\\uDCD6', href: '/invest/${stateLc}/', label: '${s.stateName} Suburb Guide' }
  ]
});

var _isInit = true;
window.addEventListener('DOMContentLoaded', function() {
  if (window.trackCalculatorStart) trackCalculatorStart('stamp-duty-${stateLc}');
  calculate();
  _isInit = false;
  var priceEl = document.getElementById('price');
  var calcBtn = document.getElementById('stamp-calc-btn');
  if (priceEl) priceEl.addEventListener('input', function(){ fmtInput(this); });
  if (calcBtn) calcBtn.addEventListener('click', function(){
    if (window.trackPageEvent) trackPageEvent('calculator_button_click', {'calculator': 'stamp-duty-${stateLc}'});
    calculate();
  });
});
`;
}

// Per-state tier table. Each tier is `[fromValue, rate]` — duty is computed
// cumulatively (`(spanInTier × rate)` summed across completed tiers, plus
// the residual span × rate of the tier that contains v). Mirrors exactly
// the `tiers` arrays in tools/stamp-duty-calculator.js so the dedicated
// state pages produce identical figures to the all-states tool.
const STATE_TIERS = {
  NSW: [[0,0],[14000,0.0125],[30000,0.015],[130000,0.0175],[205000,0.035],[305000,0.04],[405000,0.045],[550000,0.055]],
  VIC: [[0,0],[25000,0.014],[130000,0.024],[440000,0.055],[870000,0.065]],
  WA:  [[0,0],[2000,0.01],[4000,0.02],[500000,0.035],[1000000,0.0475]],
  SA:  [[0,0],[16000,0.015],[19000,0.03],[250000,0.035],[300000,0.04]],
  TAS: [[0,0],[3000,0.036],[100000,0.041],[150000,0.0425],[250000,0.0475]],
  ACT: [[0,0],[7500,0.0125],[30000,0.02],[200000,0.035]],
  NT:  [[0,0],[3000,0.0075],[100000,0.01],[150000,0.015],[250000,0.025]],
};

// Emits a JS function body that computes cumulative tiered duty. The
// inlined approach (one `if/else if` chain per state) keeps the generated
// .js readable when an admin opens DevTools — and avoids needing a shared
// helper file across the 7 state calculators.
function stampDutyFormula(state) {
  const tiers = STATE_TIERS[state];
  if (!tiers) return 'return 0;';
  // Walk the tiers and emit one bracket per pair of consecutive thresholds.
  // We compute the cumulative base at each tier boundary at code-gen time,
  // so the runtime path is just an `if (v <= NEXT) return BASE + (v - FROM) * RATE`.
  const lines = [];
  let base = 0;
  for (let i = 0; i < tiers.length; i++) {
    const [from, rate] = tiers[i];
    const next = (i + 1 < tiers.length) ? tiers[i + 1][0] : null;
    if (next == null) {
      lines.push(`return ${base} + (v - ${from}) * ${rate};`);
    } else {
      lines.push(`if (v <= ${next}) return ${base} + (v - ${from}) * ${rate};`);
      base += (next - from) * rate;
    }
  }
  return lines.join('\n  ');
}

// ── Compute worked examples from the calculator's own formulas so the
// numbers in the static HTML always match what the live calculator returns ──

function dutyAt(state, v) {
  // eslint-disable-next-line no-new-func
  const fn = new Function('v', stampDutyFormula(state));
  return fn(v);
}

function fhbDuty(s, v) {
  const std = dutyAt(s.STATE, v);
  if (v <= s.fhbFull) {
    return s.STATE === 'TAS' ? std * 0.5 : 0;
  }
  if (v <= s.fhbPartial && s.fhbPartial > s.fhbFull) {
    const slide = (s.fhbPartial - v) / (s.fhbPartial - s.fhbFull);
    return Math.max(0, std * (1 - slide));
  }
  // NT FHB: discount of up to $50k for new builds, capped at duty liability.
  // Established homes get nothing — examples cover that case.
  return std;
}

function fmtDollars(n) {
  if (n === 0) return '$0';
  return '$' + Math.round(n).toLocaleString('en-AU');
}

// Build the 3-row examples table at fixed price points so the page covers
// the typical FHB threshold + standard purchase + over-cap scenarios.
function buildExamples(s) {
  const prices = examplePrices(s);
  return prices.map(([scenario, price]) => {
    const std = dutyAt(s.STATE, price);
    // Owner-occupier: most states match standard. ACT HBCS exempts <= $1M
    // for income-tested buyers, but treat the static example as standard
    // since the income test is per-buyer.
    const oo = std;
    const fhb = fhbDuty(s, price);
    const fhbDisplay = (s.STATE === 'NT' && price > s.fhbFull)
      ? fmtDollars(std) + ' (established)'
      : fhb === 0 ? '$0 (FHB exemption)'
      : fhb < std ? fmtDollars(fhb) + ' (FHB concession)'
      : fmtDollars(fhb) + ' (over cap)';
    return [scenario, fmtDollars(std), fmtDollars(oo), fhbDisplay];
  });
}

// Three example price points per state — chosen to span the FHB cap so the
// table tells a story (under cap → at cap → over cap).
function examplePrices(s) {
  const fhbFull = s.fhbFull;
  const fhbPartial = s.fhbPartial;
  // under cap: 80% of fhb threshold (rounded to nearest $10k)
  const under = Math.round(fhbFull * 0.8 / 10000) * 10000;
  // around cap: midway between full and partial (or fhbFull + $50k if no slide)
  const mid = fhbPartial > fhbFull
    ? Math.round((fhbFull + fhbPartial) / 2 / 10000) * 10000
    : fhbFull + 50000;
  // over cap
  const over = Math.max(fhbPartial + 200000, 1000000);
  return [
    [`$${under.toLocaleString('en-AU')} property`, under],
    [`$${mid.toLocaleString('en-AU')} property`,    mid],
    [`$${over.toLocaleString('en-AU')} property`,   over],
  ];
}

// ── Generate ──────────────────────────────────────────────────────────────

const TOOLS_DIR = path.join(ROOT, 'tools');
let count = 0;
for (const [code, s] of Object.entries(STATES)) {
  // Override hand-written examples with computed ones so the page numbers
  // always match calculator output.
  s.examples = buildExamples(s);
  const htmlPath = path.join(TOOLS_DIR, `stamp-duty-calculator-${code}.html`);
  const jsPath = path.join(TOOLS_DIR, `stamp-duty-calculator-${code}.js`);
  fs.writeFileSync(htmlPath, buildHtml(s));
  fs.writeFileSync(jsPath, buildJs(s));
  count++;
  console.log(`  Built tools/stamp-duty-calculator-${code}.html`);
  console.log(`  Built tools/stamp-duty-calculator-${code}.js`);
}
console.log(`Done. ${count} state stamp duty pages generated.`);
