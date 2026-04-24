/**
 * app.js — EquitySight Calculator App Logic
 *
 * Loaded by app.html (authenticated users only — auth guard in app.html <head>).
 *
 * Key sections (search these strings to jump):
 *   "── HELPERS"          fmt(), v(), set(), syncRange() — utility functions
 *   "── DYNAMIC COST"     addCostItem(), renderDynCosts() — purchase/move-out costs
 *   "── RENO ITEMS"       addRenoItem(), renderRenoItems() — renovation budget
 *   "── MAIN RECALC"      recalc() — master calc, called on every input change
 *   "── PROPERTY DETAILS" setPropType(), handlePhotoDrop(), address autocomplete
 *   "── PROJECTION"       30-year chart, quarterly table, milestones
 *   "── SUBURB GROWTH"    lookupSuburbGrowth() — Netlify fn + localStorage cache
 *   "── EXPORT PDF"       exportPDF() — builds standalone print HTML in new window
 *   "── SCHEME SELECTOR"  government grant/scheme logic (config from admin)
 *   "── PROFILE WIDGET"   top-right profile button + floating account panel
 *   "── Custom Dialog"    appAlert(), appConfirm() — replaces browser alert/confirm
 *
 * Global state:
 *   scenarios[]      — loaded from /.netlify/functions/scenarios
 *   currentScenario  — active scenario object (null = new unsaved)
 *   renoItems[]      — renovation line items
 *   purchaseCosts[], moveOutCosts[] — dynamic cost line items
 *
 * Session: localStorage 'propCalc_session_v1' → { id, email, name, plan, token, role }
 * Draft:   localStorage 'propCalc_draft_v1'   → auto-saved current inputs
 */

// ── PWA: Prevent iOS back-swipe from leaving the app ──────────────────
  // PWA back-swipe trap — prevent iOS edge swipe from leaving the app
  (function(){
    if(!window.history || !window.history.pushState) return;
    // Push two entries so there's always a forward state to return to
    history.pushState({pwa:1}, '');
    history.pushState({pwa:2}, '');
    window.addEventListener('popstate', function(e){
      // Immediately push forward again — traps the back gesture
      history.pushState({pwa:2}, '');
    });
  })();

// ── PWA: Block pinch-zoom in iOS standalone mode ──────────────────────
  // Block pinch-zoom via gesture events; double-tap-to-zoom handled by
  // touch-action:manipulation in CSS (no JS touchend hack — that was
  // preventing synthesized click events from firing on buttons).
  (function(){
    if(window.navigator.standalone){
      document.addEventListener('gesturestart', function(e){ e.preventDefault(); }, {passive:false});
      document.addEventListener('gesturechange', function(e){ e.preventDefault(); }, {passive:false});
      document.addEventListener('gestureend', function(e){ e.preventDefault(); }, {passive:false});
    }
  })();

// ── Main App Logic ────────────────────────────────────────────────────
  const CIRC = 263.89; // 2*pi*42

  // ── HELPERS ──
  function escHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function safePhotoSrc(url){if(!url)return null;if(/^data:image\/(jpeg|png|gif|webp);base64,/.test(url))return url;try{var u=new URL(url);return u.protocol==='https:'?url:null;}catch(e){return null;}}
  // ── Feature usage tracking (fire-and-forget, no UI impact) ──
  var _trackQueue={};
  function trackUsage(evt){
    // Debounce: only send each event type once per 30 seconds
    if(_trackQueue[evt]&&Date.now()-_trackQueue[evt]<30000) return;
    _trackQueue[evt]=Date.now();
    try{
      var s=JSON.parse(localStorage.getItem('propCalc_session_v1')||'{}');
      if(!s.id) return;
      fetch('/.netlify/functions/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'track',event:evt})}).catch(function(){});
    }catch(e){}
  }

  function fmt(n){const a=Math.abs(n),s=n<0?'-':'';if(a>=1e6)return s+'$'+(a/1e6).toFixed(2)+'M';if(a>=1000)return s+'$'+Math.round(a).toLocaleString();return s+'$'+Math.round(a);}
  function fmtK(n){const a=Math.abs(n),s=n<0?'-':'';if(a>=1e6)return s+'$'+(a/1e6).toFixed(1)+'M';if(a>=1000)return s+'$'+Math.round(a/1000)+'k';return s+'$'+Math.round(a);}
  function pctS(n){return n.toFixed(1)+'%';}
  function v(id){return parseFloat(document.getElementById(id).value)||0;}
  function set(id,val){const el=document.getElementById(id);if(el)el.textContent=val;}
  function css(id,prop,val){const el=document.getElementById(id);if(el)el.style[prop]=val;}
  function attr(id,a,val){const el=document.getElementById(id);if(el)el.setAttribute(a,val);}

  function syncRange(key){const i=document.getElementById('inp-'+key),r=document.getElementById('rng-'+key);if(r)r.value=i.value;rl(key,parseFloat(i.value));}
  function syncInput(key){const i=document.getElementById('inp-'+key),r=document.getElementById('rng-'+key);if(i)i.value=r.value;rl(key,parseFloat(r.value));}
  function rl(key,val){
    const el=document.getElementById('lbl-'+key);if(!el)return;
    if(['price','savings','bank','conv','pest','r1','r2','r3','r4','r5','r6','rent','offset'].includes(key))el.textContent=fmt(val);
    else if(key==='term')el.textContent=val+' yrs';
    else if(key==='weeks')el.textContent=val;
    else el.textContent=val.toFixed(key==='cont'?0:1)+'%';
  }

  function calcMonthly(principal,annualRate,years){
    if(principal<=0||years<=0)return 0;
    if(annualRate===0)return principal/(years*12);
    const r=annualRate/100/12,n=years*12;
    return principal*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1);
  }

  // ── STAMP DUTY AUTO-CALC ──
  // Returns estimated stamp duty for all 8 Australian states (2026 thresholds)
  function calcStampDutyAmt(price, state, isFHB, isNew) {
    if (!price || !state) return 0;
    // brackets: [threshold, baseDuty, marginalRate] — iterate largest-first
    function bracket(v, tiers) {
      for (var i = tiers.length - 1; i >= 0; i--) {
        if (v > tiers[i][0]) return tiers[i][1] + (v - tiers[i][0]) * tiers[i][2];
      }
      return 0;
    }
    var duty = 0;
    if (state === 'nsw') {
      duty = bracket(price, [
        [0, 0, 0], [14000, 0, 0.0125], [30000, 200, 0.015],
        [130000, 1700, 0.0175], [205000, 2631.25, 0.035],
        [305000, 6131.25, 0.04], [405000, 10131.25, 0.045],
        [550000, 16256.25, 0.055]
      ]);
      if (isFHB) {
        if (price <= 800000) duty = 0;
        else if (price <= 1000000) duty *= (price - 800000) / 200000;
      }
    } else if (state === 'vic') {
      duty = bracket(price, [
        [0, 0, 0], [25000, 0, 0.014], [130000, 1470, 0.024],
        [440000, 8910, 0.055], [870000, 43605, 0.065]
      ]);
      if (isFHB) {
        if (price <= 600000) duty = 0;
        else if (price <= 750000) duty *= (price - 600000) / 150000;
      }
    } else if (state === 'qld') {
      // QLD First Home Concession schedule effective 9 May 2025 (QRO).
      // New home (any price) — no duty. Existing home — full concession to
      // $700k, linear phase-out to $800k, no concession at/above $800k.
      if (isFHB && isNew) {
        duty = 0;
      } else {
        duty = bracket(price, [
          [0, 0, 0], [5000, 0, 0.015], [75000, 1050, 0.035],
          [540000, 17325, 0.045], [1000000, 38025, 0.0575]
        ]);
        if (isFHB) {
          if (price <= 700000) duty = 0;
          else if (price < 800000) duty *= (price - 700000) / 100000;
          // price >= 800000: no FHB concession — full duty applies
        }
      }
    } else if (state === 'sa') {
      duty = bracket(price, [
        [0, 0, 0], [16000, 0, 0.015], [19000, 45, 0.03],
        [250000, 6915, 0.035], [300000, 8665, 0.04]
      ]);
      if (isFHB && isNew && price <= 650000) duty = 0;
    } else if (state === 'wa') {
      duty = bracket(price, [
        [0, 0, 0], [2000, 0, 0.01], [4000, 20, 0.02],
        [500000, 9920, 0.035], [1000000, 27420, 0.0475]
      ]);
      if (isFHB) {
        if (price <= 430000) duty = 0;
        else if (price <= 530000) duty *= (price - 430000) / 100000;
      }
    } else if (state === 'tas') {
      duty = bracket(price, [
        [0, 0, 0], [3000, 0, 0.036], [100000, 3492, 0.041],
        [150000, 5542, 0.0425], [250000, 9792, 0.0475]
      ]);
      if (isFHB && price <= 750000) duty *= 0.5; // 50% concession (to June 2026)
    } else if (state === 'act') {
      duty = bracket(price, [
        [0, 0, 0], [7500, 0, 0.0068], [100000, 640, 0.023],
        [200000, 2940, 0.031], [300000, 6040, 0.035],
        [500000, 13040, 0.0505], [750000, 25665, 0.066],
        [1000000, 42165, 0.0717]
      ]);
      if (isFHB && price <= 1020000) duty = 0;
    } else if (state === 'nt') {
      duty = bracket(price, [
        [0, 0, 0], [3000, 0, 0.0075], [100000, 727.5, 0.01],
        [150000, 1227.5, 0.015], [250000, 2727.5, 0.025]
      ]);
      if (isFHB && price <= 650000) duty = Math.max(0, duty * (price - 400000) / 250000);
    }
    return Math.max(0, Math.round(duty));
  }

  // ── LMI AUTO-CALC ──
  // Approximate LMI premium (Genworth/QBE schedule, residential purchase)
  function calcLMI(loanAmt, price) {
    if (!price || price <= 0 || !loanAmt) return 0;
    const lvr = loanAmt / price * 100;
    if (lvr <= 80) return 0;
    var rate = 0;
    if (lvr <= 85) rate = 0.0065;
    else if (lvr <= 90) rate = 0.0146;
    else if (lvr <= 95) rate = 0.0244;
    else rate = 0.030;
    return Math.round(loanAmt * rate);
  }

  // ── FHOG GRANT BY STATE ──
  // Returns {amount, note, urgent} for 2026 FHOG grants
  function getFHOGAmt(state, isFHB, isNew) {
    if (!isFHB || !state) return {amount: 0, note: '', urgent: false};
    var grants = {
      nsw: {amount: 10000, note: 'NSW FHOG for new homes', urgent: false},
      vic: {amount: 10000, note: 'VIC FHOG for new homes', urgent: false},
      qld: {amount: 30000, note: 'QLD FHOG — new homes only', urgent: true},
      sa:  {amount: 15000, note: 'SA FHOG for new homes', urgent: false},
      wa:  {amount: 10000, note: 'WA FHOG for new homes', urgent: false},
      tas: {amount: 20000, note: 'TAS FHOG for new homes', urgent: false},
      act: {amount: 0,     note: 'ACT has no FHOG (land tax alternative scheme applies)', urgent: false},
      nt:  {amount: 10000, note: 'NT FHOG + HomeGrown up to $60,000 total', urgent: false},
    };
    var g = grants[state];
    if (!g || g.amount === 0) return {amount: 0, note: g ? g.note : '', urgent: false};
    if (!isNew) return {amount: 0, note: 'FHOG only applies to new homes in this state', urgent: false};
    return g;
  }

  // ── GENUINE FORTNIGHTLY BENEFIT ──
  // Returns {yearsLess, interestSaved} from paying monthly/2 fortnightly vs monthly
  function calcFortnightlyBenefit(loanAmt, rate, term) {
    if (loanAmt <= 0 || rate <= 0 || term <= 0) return {yearsLess: 0, interestSaved: 0};
    const monthly = calcMonthly(loanAmt, rate, term);
    const fortPayment = monthly / 2;
    const fortRate = rate / 100 / 26;
    let bal = loanAmt, periods = 0, totalPaid = 0;
    const maxPeriods = term * 26 + 200;
    while (bal > 0.01 && periods < maxPeriods) {
      const interest = bal * fortRate;
      const principal = fortPayment - interest;
      if (principal <= 0) break;
      bal = Math.max(0, bal - principal);
      totalPaid += fortPayment;
      periods++;
    }
    const totalPaidMonthly = monthly * term * 12;
    const yearsLess = Math.max(0, term - periods / 26);
    const interestSaved = Math.max(0, totalPaidMonthly - totalPaid);
    return {yearsLess, interestSaved};
  }

  var _amortVisible = false;
  var _lastAmortParams = null;

  function toggleAmortTable(){
    _amortVisible = !_amortVisible;
    const wrap = document.getElementById('amort-table-wrap');
    const btn  = document.getElementById('amort-toggle-btn');
    if(wrap) wrap.style.display = _amortVisible ? 'block' : 'none';
    if(btn)  btn.textContent    = _amortVisible ? 'Hide Schedule' : 'Show Schedule';
    if(_amortVisible) buildAmortTable();
  }

  function buildAmortTable(){
    const tbl = document.getElementById('amort-table');
    if(!tbl || !_lastAmortParams) return;
    const {loanAmt, rate, term} = _lastAmortParams;
    const monthly = calcMonthly(loanAmt, rate, term);
    if(loanAmt <= 0 || monthly <= 0){
      tbl.innerHTML = '<tbody><tr><td colspan="5" style="text-align:center;color:var(--slate);padding:16px;font-size:12px;">Enter loan details to generate schedule.</td></tr></tbody>';
      return;
    }
    const r = rate / 100 / 12;
    const fmt$ = v => '$' + Math.round(v).toLocaleString('en-AU');
    let balance = loanAmt, rows = '';
    for(let yr = 1; yr <= term; yr++){
      const openBal = balance;
      let yPrin = 0, yInt = 0;
      for(let mo = 1; mo <= 12 && balance > 0.005; mo++){
        const intCharge  = balance * r;
        const prinCharge = Math.min(monthly - intCharge, balance);
        yInt  += intCharge;
        yPrin += prinCharge;
        balance = Math.max(0, balance - prinCharge);
      }
      rows += `<tr>
        <td>Yr ${yr}</td>
        <td class="amort-wide">${fmt$(openBal)}</td>
        <td style="color:var(--sage)">${fmt$(yPrin)}</td>
        <td style="color:var(--terracotta)">${fmt$(yInt)}</td>
        <td>${fmt$(balance)}</td>
      </tr>`;
    }
    tbl.innerHTML = `<thead><tr>
      <th style="text-align:left">Year</th>
      <th class="amort-wide">Opening Bal</th>
      <th>Principal</th>
      <th>Interest</th>
      <th>Balance</th>
    </tr></thead><tbody>${rows}</tbody>`;
  }

  // ── DYNAMIC COST ITEMS ──
  let dynCosts=[];
  let _addrResults=[];
  let dynId=0;

  // ── ALL PURCHASE COSTS ARE NOW DYNAMIC (item 14) ──
  // Seeded with defaults in initPage()
  // category: 'purchase' (default) | 'moveout'
  function addCostItem(category){
    const cat = category || 'purchase';
    const id='dyn-'+dynId++;
    dynCosts.push({id, name:'New Item', amount:0, category:cat});
    renderDynCosts();
    recalc();
    // Focus the name field of the newly added row
    setTimeout(function(){
      const listId = cat === 'moveout' ? 'cost-items-moveout' : 'cost-items-purchase';
      var rows = document.getElementById(listId)?.querySelectorAll('.dyn-cost-row');
      if(rows && rows.length > 0){
        var lastRow = rows[rows.length-1];
        var nameInput = lastRow.querySelector('input[type="text"]');
        if(nameInput){
          lastRow.scrollIntoView({behavior:'smooth', block:'nearest'});
          setTimeout(function(){ nameInput.focus(); nameInput.select(); }, 80);
        }
      }
    }, 60);
  }
  function addCostItemAndFocus(){ addCostItem('purchase'); }

  function removeCostItem(id){
    dynCosts=dynCosts.filter(c=>c.id!==id);
    renderDynCosts();
    recalc();
  }

  function _renderCostList(listId, costs){
    const list = document.getElementById(listId);
    if(!list) return;
    list.innerHTML = '';
    costs.forEach(cost=>{
      const row = document.createElement('div');
      row.className = 'dyn-cost-row';
      row.dataset.costid = cost.id;
      row.dataset.category = cost.category || 'purchase';
      row.innerHTML = `
        <input type="text" value="${escHtml(cost.name||'')}" placeholder="Item name" style="flex:1.4" data-field="name">
        <div class="iw" style="flex:1;position:relative;"><span class="ipfx">$</span><input type="number" value="${cost.amount||0}" min="0" max="500000" step="50" data-field="amount"></div>
        <button class="dyn-del" title="Remove" data-action="del-cost">−</button>
      `;
      list.appendChild(row);
    });
  }

  function renderDynCosts(){
    // Support old single-list id for backward compat
    _renderCostList('cost-items-purchase', dynCosts.filter(c=>c.category!=='moveout'));
    _renderCostList('cost-items-moveout',  dynCosts.filter(c=>c.category==='moveout'));
  }

  function updateDynCost(id,field,val){
    const c=dynCosts.find(x=>x.id===id);
    if(c){c[field]=val;if(field==='amount')recalc();}
  }

  function getExtraCosts(){
    return dynCosts.reduce((s,c)=>s+(parseFloat(c.amount)||0),0);
  }
  function getPurchaseCosts(){
    return dynCosts.filter(c=>c.category!=='moveout').reduce((s,c)=>s+(parseFloat(c.amount)||0),0);
  }
  function getMoveOutCosts(){
    return dynCosts.filter(c=>c.category==='moveout').reduce((s,c)=>s+(parseFloat(c.amount)||0),0);
  }

  // ── RENO ITEMS — dynamic custom items (item 13) ──
  let renoItems=[]; // [{id, emoji, name, amount, note}]
  let renoItemId=0;

  const RENO_EMOJIS=['🎨','🍳','🚿','🪵','💡','🌿','🪟','🚪','🧱','🛁','❄️','🔧','🏗','🏠','⚡','💧','🔨','🪴','✨','⚠️'];


  // ── Reno row event helpers (called from dynamic HTML) ──
  function _renoId(el){ return el.closest('[data-reno]').dataset.reno; }
  function _renoEmoji(el,v){ updateRenoItem(_renoId(el),'emoji',v); renderRenoItems(); }
  function _renoName(el,v){ updateRenoItem(_renoId(el),'name',v); }
  function _renoNote(el,v){ updateRenoItem(_renoId(el),'note',v); el.style.height='auto'; el.style.height=el.scrollHeight+'px'; }
  function _renoAmt(el,v){ var id=_renoId(el); updateRenoItem(id,'amount',parseFloat(v)||0); recalc(); updateRenoBar(id,parseFloat(v)||0); }
  function _renoNameKey(el,e){ if(e.key==='Enter'){e.preventDefault();var a=el.closest('[data-reno]').querySelector('input[type=number]');if(a){a.focus();a.select();}} }
  function _renoAmtKey(el,e){ if(e.key==='Enter'){e.preventDefault();addRenoItem();} }
  function _renoDel(el){ removeRenoItem(_renoId(el)); }

  function addRenoItem(name,amount,emoji,note){
    name  = name  || 'New Item';
    amount= amount|| 0;
    emoji = emoji || '🔨';
    note  = note  || '';
    const id='ri-'+renoItemId++;
    renoItems.push({id, emoji, name, amount, note});
    recalc();
    // Append just the new row — NO full DOM rebuild (preserves iOS keyboard)
    const list = document.getElementById('reno-items-list');
    if(list){
      const maxAmt = Math.max.apply(null, renoItems.map(function(r){ return parseFloat(r.amount)||0; }).concat([1]));
      const pct = maxAmt>0 ? Math.min((amount||0)/maxAmt*100,100) : 0;
      const emojiOpts = RENO_EMOJIS.map(function(e){
        return '<option value="'+e+'"'+(e===emoji?' selected':'')+'>'+e+'</option>';
      }).join('');
      const div = document.createElement('div');
      div.setAttribute('data-reno', id);
      div.style.cssText = 'border-bottom:1px solid rgba(28,28,30,0.07);padding-bottom:10px;margin-bottom:10px;';
      const safeName = escHtml(name||'');
      div.innerHTML = [
        '<div class="reno-row">',
          '<select style="width:38px;flex-shrink:0;background:none;border:none;font-size:16px;cursor:pointer;padding:0;" data-field="emoji">'+emojiOpts+'</select>',
          '<input type="text" value="'+safeName+'" placeholder="Item name" ',
            'style="flex:1;background:none;border:none;border-bottom:1px solid rgba(28,28,30,0.1);padding:3px 4px;font-size:13px;font-weight:500;color:var(--charcoal);outline:none;" ',
            'data-field="name">',
          '<div class="rbt" style="max-width:60px;"><div class="rbf" style="width:'+pct+'%"></div></div>',
          '<div style="display:flex;align-items:center;gap:2px;min-width:90px;">',
            '<span style="font-size:14px;color:var(--slate);">$</span>',
            '<input type="number" value="'+(amount||0)+'" min="0" max="2000000" step="100" id="reno-amt-'+id+'" ',
              'style="width:90px;background:none;border:none;border-bottom:1px solid rgba(28,28,30,0.1);padding:4px 2px;font-family:\"DM Mono\",monospace;font-size:16px;color:var(--charcoal);outline:none;text-align:right;font-weight:500;" ',
              'data-field="amount">',
          '</div>',
          '<button class="kd-del" title="Remove" style="flex-shrink:0;" data-action="del-reno">✕</button>',
        '</div>',
        '<div class="reno-note-wrap" style="padding-left:44px;">',
          '<textarea class="reno-note" placeholder="Notes, quotes, scope of work…" rows="1" ',
            'data-field="note">'+escHtml(note||'')+'</textarea>',
        '</div>'
      ].join('');
      list.appendChild(div);
      // Add focus/blur styles via JS (avoids quote issues in HTML string)
      var nameInp = div.querySelector('input[type="text"]');
      if(nameInp){
        nameInp.addEventListener('focus', function(){ this.style.borderColor='var(--sage)'; });
        nameInp.addEventListener('blur',  function(){ this.style.borderColor='rgba(28,28,30,0.1)'; });
      }
      var amtInp = div.querySelector('#reno-amt-'+id);
      if(amtInp){
        amtInp.addEventListener('focus', function(){ this.style.borderColor='var(--sage)'; });
        amtInp.addEventListener('blur',  function(){ this.style.borderColor='rgba(28,28,30,0.1)'; });
      }
      div.scrollIntoView({behavior:'smooth', block:'nearest'});
      // Focus the amount field after brief delay to allow scroll
      setTimeout(function(){
        var amtField = document.getElementById('reno-amt-'+id);
        if(amtField){ amtField.focus(); amtField.select(); }
      }, 100);
    } else {
      renderRenoItems();
    }
    // Update sidebar total
    var stEl = document.getElementById('lbl-reno-total');
    if(stEl){ var ct=v('inp-cont'); stEl.textContent=fmtK(getRenoTotal()*(1+ct/100)); }
  }

  function removeRenoItem(id){
    renoItems=renoItems.filter(r=>r.id!==id);
    renderRenoItems();
    recalc();
  }

  function updateRenoItem(id,field,val){
    const r=renoItems.find(x=>x.id===id);
    if(r){r[field]=val;if(field==='amount')recalc();}
  }

  function getRenoTotal(){
    return renoItems.reduce((s,r)=>s+(parseFloat(r.amount)||0),0);
  }

  function updateRenoBar(id, newAmount){
    // Update only the progress bar for one reno item without full DOM redraw
    var maxAmt = Math.max.apply(null, renoItems.map(function(r){ return parseFloat(r.amount)||0; }).concat([1]));
    renoItems.forEach(function(r){
      var el = document.querySelector('[data-reno="' + r.id + '"]');
      if(!el) return;
      var bar = el.querySelector('.rbf');
      if(bar){
        var pct = maxAmt > 0 ? Math.min((parseFloat(r.amount)||0)/maxAmt*100, 100) : 0;
        bar.style.width = pct + '%';
      }
    });
    // Update sidebar total
    var stEl = document.getElementById('lbl-reno-total');
    if(stEl){ var ct=v('inp-cont'); stEl.textContent=fmtK(getRenoTotal()*(1+ct/100)); }
  }

  function renderRenoItems(){
    const list=document.getElementById('reno-items-list');
    if(!list) return;
    const total = getRenoTotal();
    const maxAmt = Math.max(...renoItems.map(r=>parseFloat(r.amount)||0), 1);
    list.innerHTML = renoItems.map(r=>{
      const pct = maxAmt>0 ? Math.min((parseFloat(r.amount)||0)/maxAmt*100,100) : 0;
      const emojiOpts = RENO_EMOJIS.map(e=>`<option value="${e}" ${e===r.emoji?'selected':''}>${e}</option>`).join('');
      return `<div data-reno="${r.id}" style="border-bottom:1px solid rgba(28,28,30,0.07);padding-bottom:10px;margin-bottom:10px;">
        <div class="reno-row">
          <select style="width:38px;flex-shrink:0;background:none;border:none;font-size:16px;cursor:pointer;padding:0;" data-field="emoji">${emojiOpts}</select>
          <input type="text" value="${escHtml(r.name||'')}" placeholder="Item name" style="flex:1;background:none;border:none;border-bottom:1px solid rgba(28,28,30,0.1);padding:3px 4px;font-size:13px;font-weight:500;color:var(--charcoal);outline:none;" data-field="name">
          <div class="rbt" style="max-width:60px;"><div class="rbf" style="width:${pct}%"></div></div>
          <div style="display:flex;align-items:center;gap:2px;min-width:90px;">
            <span style="font-size:14px;color:var(--slate);">$</span><input type="number" value="${r.amount||0}" min="0" max="2000000" step="100" style="width:90px;background:none;border:none;border-bottom:1px solid rgba(28,28,30,0.1);padding:4px 2px;font-family:'DM Mono',monospace;font-size:16px;color:var(--charcoal);outline:none;text-align:right;font-weight:500;" data-field="amount">
          </div>
          <button class="kd-del" title="Remove" style="flex-shrink:0;" data-action="del-reno">✕</button>
        </div>
        <div class="reno-note-wrap" style="padding-left:44px;">
          <textarea class="reno-note" placeholder="Notes, quotes, scope of work…" rows="1" data-field="note">${escHtml(r.note||'')}</textarea>
        </div>
      </div>`;
    }).join('');
    // sidebar total
    const stEl=document.getElementById('lbl-reno-total');
    if(stEl){ const ct=v('inp-cont'); stEl.textContent=fmtK(total*(1+ct/100)); }
  }

  // ── MAIN RECALC ──
  const DRAFT_KEY = 'propCalc_draft_v1';
  let _draftTimer = null;
  function autosaveDraft(){
    if(_restoringDraft) return;
    clearTimeout(_draftTimer);
    _draftTimer = setTimeout(()=>{
      try{
        const state = collectCurrentState();
        lsSet(DRAFT_KEY, JSON.stringify({state, photo: propPhotoDataUrl||'', thumb: propThumbDataUrl||'', savedId: _lastSavedAddr||''}));
        // Only mark dirty if content has actually changed from last save.
        // This prevents "Unsaved" showing after loading a saved property
        // or after page load restoring a draft.
        const currentAddr = (state.values && state.values['pd-address']) || '';
        const savedAddr   = _lastSavedAddr || '';
        // If a saved address exists and it still matches, don't mark dirty
        if(savedAddr && currentAddr && savedAddr.toLowerCase().includes(currentAddr.toLowerCase().split(',')[0].trim().toLowerCase()) && !_forceDirty){
          // No change to the address that identifies this save - stay clean
        } else {
          _isDirty = true;
        }
        _forceDirty = false;
        updateUnsavedBadge();
      }catch(e){}
    }, 800);
  }
  function restoreDraft(){
    try{
      const raw = lsGet(DRAFT_KEY);
      if(!raw) return false;
      const draft = JSON.parse(raw);
      if(!draft || !draft.state) return false;
      _restoringDraft = true;
      // Restore photo — only if it fits (skip silently if corrupt)
      const _safePhoto = safePhotoSrc(draft.photo);
      if(_safePhoto){
        try{ propPhotoDataUrl = _safePhoto; propThumbDataUrl = draft.thumb||_safePhoto; }catch(pe){}
      }
      // Pass photo to applyScenarioState so it applies (or clears) consistently
      applyScenarioState(draft.state, _safePhoto || null);
      // Clamp any extreme values that may have been saved before limits were added
      const _draftClamps = [
        {id:'inp-price',  max:50000000},
        {id:'inp-savings',max:50000000},
        {id:'inp-rate',   max:20},
        {id:'inp-term',   max:50},
      ];
      _draftClamps.forEach(function(c){
        const el = document.getElementById(c.id);
        if(el && parseFloat(el.value) > c.max){ el.value = c.max; }
      });
      // Always land on property tab after restore
      const propTabBtn = document.querySelector('.tab[data-tab="property"]');
      if(propTabBtn) showTab('property', propTabBtn);
      // Restore saved address so unsaved badge doesn't fire
      if(draft.savedId) _lastSavedAddr = draft.savedId;
      _restoringDraft = false;
      _isDirty = false;
      return true;
    }catch(e){ console.warn('restoreDraft failed:', e); _restoringDraft = false; return false; }
  }
  var _dRecalcTimer;
  function dRecalc(){ clearTimeout(_dRecalcTimer); _dRecalcTimer = setTimeout(recalc, 180); }

  function recalc(){
    trackUsage('recalc');
    if(!_restoringDraft) _forceDirty = true;
    autosaveDraft();
    const price   = Math.max(0, Math.min(50000000, v('inp-price')));
    const savings = Math.max(0, Math.min(50000000, v('inp-savings')));
    // Clamp percentages to [0,100] so negative input can't produce a negative
    // deposit (which would push loanAmt above price) or a negative govt grant.
    const depPct  = Math.max(0, Math.min(100, v('inp-depp')));
    const govtPct = Math.max(0, Math.min(100, v('inp-govt')));
    const rate    = Math.max(0, Math.min(20, v('inp-rate')));
    const term    = Math.min(50, Math.max(1, v('inp-term')));
    const contPct = Math.max(0, Math.min(100, v('inp-cont')));
    const address = document.getElementById('inp-address').value||'your property';

    const deposit  = price*depPct/100;
    const govtAmt  = price*govtPct/100;
    const loanAmt  = Math.max(0,price-deposit-govtAmt);
    const extraCosts = getExtraCosts();
    const upfront  = deposit+extraCosts;
    const remaining = savings-upfront;

    // ─── state / buyer type inputs ───
    const stateEl = document.getElementById('inp-state');
    const state = stateEl ? stateEl.value : '';
    const isFHB = !!(document.getElementById('inp-fhb') && document.getElementById('inp-fhb').checked);
    const isNew = !!(document.getElementById('inp-new-prop') && document.getElementById('inp-new-prop').checked);

    // ─── LVR ───
    const lvr = price > 0 ? (loanAmt / price * 100) : 0;

    const monthly = calcMonthly(loanAmt,rate,term);
    const weekly  = monthly*12/52;
    const fortnightly = monthly/2; // genuine fortnightly: 26 × monthly/2 = 13 months/yr
    const totalPaid = monthly*term*12;
    const totalInterest = totalPaid-loanAmt;
    _lastAmortParams = {loanAmt, rate, term};
    if(_amortVisible) buildAmortTable();

    // Use dynamic reno items system (item 13)
    const renoBase=getRenoTotal();
    const contingency=renoBase*contPct/100;
    const renoTotal=renoBase+contingency;

    // overlap (may be disabled by item 12 rent toggle)
    const rentEnabled = document.getElementById('rent-sidebar-section')?.style.display !== 'none';
    const rent  = rentEnabled ? v('inp-rent') : 0;
    const weeks = rentEnabled ? v('inp-weeks') : 0;
    const overlapCost = (rent+weekly)*weeks;
    const cashAfterOverlap = remaining-overlapCost;

    // ─── sidebar labels ───
    ['price','savings','depp','govt','rate','term','cont','rent','weeks','offset'].forEach(k=>{
      const el=document.getElementById('inp-'+k);if(el)rl(k,parseFloat(el.value)||0);
    });
    // sidebar reno total
    const stEl2=document.getElementById('lbl-reno-total');
    if(stEl2) stEl2.textContent=fmtK(renoTotal);

    // ─── deposit affordability hint ───
    const depHint=document.getElementById('dep-hint');
    if(depHint){
      if(price>0 && savings>0){
        const maxAffordDep=Math.min(20,Math.max(0,(savings-extraCosts)/price*100));
        depHint.textContent='Max affordable: '+maxAffordDep.toFixed(1)+'%';
        depHint.style.display='block';
        depHint.style.color=depPct>maxAffordDep?'var(--risk-red)':'rgba(201,168,76,0.65)';
      } else { depHint.style.display='none'; }
    }

    // ─── scheme eligibility warning ───
    updateSchemeInfo();

    document.getElementById('page-title').textContent=address;

    // ─── TAB 1: COSTS ───
    set('t-price',fmtK(price));
    set('t-deposit',fmtK(deposit));
    set('t-govt',fmtK(govtAmt));
    const remEl=document.getElementById('t-remaining');if(remEl){remEl.textContent=fmtK(remaining);remEl.style.color=remaining<0?'var(--risk-red)':'';}

    set('cb-savings',fmt(savings));
    set('cb-out','−'+fmt(upfront));
    const cbR=document.getElementById('cb-remaining');
    if(cbR){cbR.textContent=fmt(remaining);cbR.style.color=remaining<0?'var(--risk-red)':'var(--sage-light)';}

    set('cr-deposit',fmt(deposit));

    // dynamic cost rows display — two groups: purchase and move-out
    const display=document.getElementById('cost-rows-display');
    if(display){
      let html='';
      const purchaseCosts = dynCosts.filter(c=>c.category!=='moveout');
      const moveoutCosts  = dynCosts.filter(c=>c.category==='moveout');
      purchaseCosts.forEach(c=>{
        html+=`<div class="cr"><span class="nm">${_escBanner(c.name||'Item')}</span><span class="am">${fmt(parseFloat(c.amount)||0)}</span></div>`;
      });
      if(moveoutCosts.length>0){
        html+=`<div class="cr" style="font-family:'DM Mono',monospace;font-size:10px;letter-spacing:1px;color:var(--terracotta-light);text-transform:uppercase;border-bottom:1px solid rgba(28,28,30,0.05);padding-top:8px;padding-bottom:2px;"><span class="nm">Move-Out Costs</span><span class="am"></span></div>`;
        moveoutCosts.forEach(c=>{
          html+=`<div class="cr"><span class="nm" style="color:var(--terracotta)">${_escBanner(c.name||'Item')}</span><span class="am">${fmt(parseFloat(c.amount)||0)}</span></div>`;
        });
      }
      display.innerHTML=html;
    }
    set('cr-total',fmt(upfront));

    const noteEl=document.getElementById('cost-note');
    if(noteEl){
      if(price===0||savings===0){noteEl.textContent='💡 Enter your purchase price and savings to see the full cost breakdown.';noteEl.style.cssText='margin-top:10px;padding:8px 10px;border-radius:3px;font-size:11px;line-height:1.6;background:rgba(201,168,76,0.08);color:var(--slate)';}
      else if(remaining<0){noteEl.textContent=`⚠️ Shortfall of ${fmt(Math.abs(remaining))} — increase savings or reduce costs.`;noteEl.style.cssText='margin-top:10px;padding:8px 10px;border-radius:3px;font-size:11px;line-height:1.6;background:rgba(196,90,90,0.1);color:var(--risk-red)';}
      else{
        const _stampMissing = price>0 && dynCosts.some(c=>c.category!=='moveout'&&/stamp/i.test(c.name)&&!(parseFloat(c.amount)>0));
        const _note = _stampMissing
          ? `💡 ${fmt(remaining)} after settlement. ⚠️ Stamp Duty is $0 — check your state's rate and update it above.`
          : `💡 ${fmt(remaining)} remaining after settlement — available for renovations or emergency buffer.`;
        noteEl.textContent=_note;noteEl.style.cssText='margin-top:10px;padding:8px 10px;border-radius:3px;font-size:11px;line-height:1.6;background:rgba(201,168,76,0.1);color:var(--slate)';
      }
    }

    // donut
    const tp=price,bP=tp>0?loanAmt/tp:0,gP=tp>0?govtAmt/tp:0,dP=tp>0?deposit/tp:0;
    const bD=bP*CIRC,gD=gP*CIRC,dD=dP*CIRC;
    attr('d-bank','stroke-dasharray',`${bD} ${CIRC}`);
    attr('d-govt','stroke-dasharray',`${gD} ${CIRC}`);attr('d-govt','stroke-dashoffset',`-${bD}`);
    attr('d-you','stroke-dasharray',`${dD} ${CIRC}`);attr('d-you','stroke-dashoffset',`-${bD+gD}`);
    set('d-centre',fmtK(price));
    set('leg-bank',fmtK(loanAmt));set('leg-govt',fmtK(govtAmt));set('leg-you',fmtK(deposit));
    set('bp-bank',pctS(bP*100));css('bf-bank','width',pctS(bP*100));
    set('bp-govt',pctS(gP*100));css('bf-govt','width',pctS(gP*100));
    set('bp-dep',pctS(dP*100));css('bf-dep','width',pctS(dP*100));
    // Hide government rows in funding structure when no scheme is active
    const _legGovtRow=document.getElementById('leg-govt')?.closest('.li');
    if(_legGovtRow)_legGovtRow.style.display=govtPct>0?'':'none';
    const _bpGovtRow=document.getElementById('bp-govt')?.closest('.bi');
    if(_bpGovtRow)_bpGovtRow.style.display=govtPct>0?'':'none';
    // Also hide the t-govt summary tile when no scheme
    const _tGovtEl=document.getElementById('t-govt');
    if(_tGovtEl)_tGovtEl.closest('.tile').style.display=govtPct>0?'':'none';

    // ─── LVR display ───
    const lvrEl = document.getElementById('lvr-val');
    const lvrBadge = document.getElementById('lvr-badge');
    if (lvrEl) {
      lvrEl.textContent = price > 0 ? lvr.toFixed(1) + '%' : '—';
      const lvrColor = lvr > 90 ? 'var(--risk-red)' : lvr > 80 ? 'var(--terracotta)' : 'var(--sage)';
      lvrEl.style.color = lvrColor;
    }
    if (lvrBadge) {
      if (price > 0) {
        const lvrMsg = lvr > 90 ? '⚠️ Very high LVR — LMI required, fewer lenders'
          : lvr > 80 ? '⚠️ LMI required — consider increasing deposit to 20%'
          : lvr > 70 ? '✓ Below 80% — no LMI required'
          : '✓ Strong equity position';
        const lvrBg = lvr > 90 ? 'rgba(196,90,90,0.12)' : lvr > 80 ? 'rgba(196,112,74,0.12)' : 'rgba(123,158,135,0.12)';
        const lvrBorder = lvr > 90 ? 'rgba(196,90,90,0.3)' : lvr > 80 ? 'rgba(196,112,74,0.3)' : 'rgba(123,158,135,0.3)';
        lvrBadge.textContent = lvrMsg;
        const lvrClr = lvr > 90 ? 'var(--risk-red)' : lvr > 80 ? 'var(--terracotta)' : 'var(--sage)';
        lvrBadge.style.cssText = `font-size:10px;padding:3px 8px;border-radius:3px;display:inline-block;background:${lvrBg};border:1px solid ${lvrBorder};color:${lvrClr};`;
        lvrBadge.style.display = '';
      } else { lvrBadge.style.display = 'none'; }
    }

    // ─── Smart estimates card (stamp duty, LMI, FHOG) ───
    const seCard = document.getElementById('smart-estimates-card');
    const seRows = document.getElementById('smart-estimates-rows');
    if (seCard && seRows) {
      const autoStampDuty = state ? calcStampDutyAmt(price, state, isFHB, isNew) : null;
      const autoLMI = price > 0 ? calcLMI(loanAmt, price) : 0;
      const fhog = getFHOGAmt(state, isFHB, isNew);
      const hasData = state || (price > 0 && lvr > 80);
      if (hasData && price > 0) {
        let html = '';
        // Stamp duty
        if (state) {
          const sdNote = isFHB ? ' (FHB rate applied)' : '';
          html += `<div class="cr"><span class="nm">Stamp Duty estimate${sdNote}</span><span class="am" style="color:var(--terracotta-light)">${fmt(autoStampDuty)}</span></div>`;
          if (!state) html += '';
        } else {
          html += `<div class="cr" style="opacity:0.5;"><span class="nm">Stamp Duty</span><span class="am" style="font-size:11px;font-style:italic;">Select state</span></div>`;
        }
        // LMI
        if (lvr > 80) {
          const lmiNote = lvr > 80 ? ` (LVR ${lvr.toFixed(1)}%)` : '';
          html += `<div class="cr"><span class="nm">LMI estimate${lmiNote}</span><span class="am" style="color:var(--risk-red)">${fmt(autoLMI)}</span></div>`;
          if (isFHB && depPct >= 5) {
            html += `<div style="font-size:10px;padding:4px 0 6px;color:rgba(123,158,135,0.9);line-height:1.5;">💡 First Home Guarantee (FHBG) may let you avoid LMI with 5% deposit — check <a href="https://www.housingaustralia.gov.au/first-home-guarantee" target="_blank" style="color:inherit;">Housing Australia</a>.</div>`;
          }
        }
        // FHOG
        if (fhog.amount > 0) {
          const urgentTag = fhog.urgent ? ' <span style="color:var(--terracotta);font-weight:700;">— expires June 2026!</span>' : '';
          html += `<div class="cr"><span class="nm">${fhog.note}${urgentTag}</span><span class="am" style="color:var(--sage)">+${fmt(fhog.amount)}</span></div>`;
        } else if (fhog.note && isFHB && state) {
          html += `<div style="font-size:10px;color:var(--slate);padding:2px 0 4px;line-height:1.5;">${fhog.note}</div>`;
        }
        // FHSS hint for FHBs
        if (isFHB && state) {
          html += `<div style="font-size:10px;padding:6px 0 2px;color:rgba(91,143,171,0.9);line-height:1.5;border-top:1px solid rgba(255,255,255,0.05);margin-top:6px;">🏦 <strong>First Home Super Saver (FHSS):</strong> You may be able to withdraw up to $50,000 from your super for a deposit — contributions are taxed at 15% instead of your marginal rate. <a href="https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/withdrawing-and-using-your-super/early-access-to-super/first-home-super-saver-scheme" target="_blank" rel="noopener" style="color:inherit;">Check ATO eligibility →</a></div>`;
        }
        // Stamp duty warning update
        if (state && autoStampDuty > 0) {
          const hasManualStamp = dynCosts.some(c => c.category !== 'moveout' && /stamp/i.test(c.name) && parseFloat(c.amount) > 0);
          if (!hasManualStamp) {
            html += `<div style="font-size:10px;color:rgba(201,168,76,0.7);padding-top:6px;line-height:1.5;">⚠️ Your stamp duty cost item is still $0. Add ${fmt(autoStampDuty)} to your purchase costs above.</div>`;
          }
        }
        seRows.innerHTML = html;
        seCard.style.display = '';
      } else {
        seCard.style.display = 'none';
      }
    }

    // sidebar alert
    const sa=document.getElementById('sidebar-alert');
    if(sa){
      if(price===0||savings===0)sa.innerHTML=`<div class="alert" style="background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.2);border-radius:3px;padding:8px 10px;font-size:11px;color:var(--slate);line-height:1.5;">Enter price &amp; savings to see your cash position.</div>`;
      else if(remaining<0)sa.innerHTML=`<div class="alert alert-warn">⚠️ Savings shortfall of ${fmt(Math.abs(remaining))}.</div>`;
      else if(cashAfterOverlap<5000&&weeks>0)sa.innerHTML=`<div class="alert alert-warn">⚠️ After overlap, only ${fmt(cashAfterOverlap)} left for reno.</div>`;
      else sa.innerHTML=`<div class="alert alert-ok">✓ Cash position viable. ${fmt(remaining)} after settlement.</div>`;
    }

    // ─── TAB 2: RENO ───
    const rpEl=document.getElementById('reno-pool-val');
    if(rpEl){rpEl.textContent=fmtK(remaining);rpEl.style.color=remaining<0?'var(--risk-red)':'var(--sage)';}
    const unspent = remaining - renoTotal;
    const ruEl=document.getElementById('reno-unspent-val');
    if(ruEl){ruEl.textContent=fmtK(unspent);ruEl.style.color=unspent<0?'var(--risk-red)':unspent<5000?'var(--terracotta)':'var(--reward-green)';}
    set('reno-planned',fmt(renoTotal));set('reno-pool-cap',fmt(remaining));set('reno-total',fmt(renoTotal));
    const rpct=remaining>0?Math.min(renoTotal/remaining*100,200):100;
    css('reno-spend-bar','width',Math.min(rpct,100)+'%');
    css('reno-spend-bar','background',rpct>100?'var(--risk-red)':'var(--sage)');
    set('reno-spend-pct',Math.round(rpct)+'%');
    const rpaEl=document.getElementById('reno-pool-alert');
    if(rpaEl){
      if(!renoEnabled){rpaEl.innerHTML='';}
      else if(remaining<0)rpaEl.innerHTML=`<div class="alert alert-warn">⚠️ No reno budget — savings don't cover upfront costs.</div>`;
      else if(renoTotal>remaining)rpaEl.innerHTML=`<div class="alert alert-warn">⚠️ Reno plan (${fmt(renoTotal)}) exceeds pool (${fmt(remaining)}). Trim items or increase savings.</div>`;
      else rpaEl.innerHTML=`<div class="alert alert-ok">✓ Fits budget — ${fmt(remaining-renoTotal)} to spare after reno.</div>`;
    }

    // ─── TAB 3: REPAYMENTS ───
    set('rp-monthly',fmt(monthly));
    set('rp-weekly',fmt(fortnightly)); // shows genuine fortnightly (monthly/2, 26× per year)
    set('rp-annual',fmt(monthly*12));
    set('rp-rate-lbl','@ '+rate+'%');set('rp-term-lbl','26\u00D7 per year');set('rp-loan-lbl',fmtK(loanAmt)+' loan');
    // Fortnightly benefit callout
    const ftEl = document.getElementById('rp-fortnightly-benefit');
    if (ftEl) {
      if (loanAmt > 0 && rate > 0) {
        const ftBenefit = calcFortnightlyBenefit(loanAmt, rate, term);
        const yrs = Math.floor(ftBenefit.yearsLess);
        const mos = Math.round((ftBenefit.yearsLess - yrs) * 12);
        const timeSaved = yrs > 0 ? (yrs + ' yr' + (yrs>1?'s':'') + (mos>0?' '+mos+' mo':'')) : (mos > 0 ? mos+' months' : '');
        if (ftBenefit.interestSaved > 500 && timeSaved) {
          ftEl.innerHTML = `<div style="margin-top:12px;padding:10px 12px;background:rgba(123,158,135,0.1);border:1px solid rgba(123,158,135,0.25);border-radius:4px;font-size:12px;line-height:1.6;">
            <strong style="color:var(--sage);">Fortnightly tip:</strong> Paying ${fmt(fortnightly)} every fortnight (26× per year) instead of monthly saves you <strong>${fmt(ftBenefit.interestSaved)}</strong> in interest and pays off your loan <strong>${timeSaved} sooner</strong>. Ask your lender to set up fortnightly direct debit.
          </div>`;
          ftEl.style.display='';
        } else { ftEl.style.display='none'; }
      } else { ftEl.style.display='none'; }
    }
    set('rp-interest',fmt(totalInterest));set('rp-total-paid',fmt(totalPaid));set('rp-loan-show',fmt(loanAmt));

    const stEl=document.getElementById('stress-table');
    if(stEl){
      const rates=[rate,rate+0.5,rate+1,rate+2,rate+3];
      let html=`<div style="font-family:'DM Mono',monospace;font-size:11px"><div style="display:grid;grid-template-columns:70px 1fr 1fr 1fr;gap:8px;margin-bottom:6px;color:var(--slate);font-size:10px;letter-spacing:1px;text-transform:uppercase;padding-bottom:5px;border-bottom:1px solid rgba(28,28,30,0.1)"><span>Rate</span><span>Monthly</span><span>Annual</span><span>Change</span></div>`;
      rates.forEach((r,i)=>{
        const m=calcMonthly(loanAmt,r,term),d=m-monthly,cur=i===0;
        html+=`<div style="display:grid;grid-template-columns:70px 1fr 1fr 1fr;gap:8px;padding:6px 0;border-top:1px solid rgba(28,28,30,0.06)${cur?';background:rgba(201,168,76,0.06);border-radius:2px':''}"><span style="color:${cur?'var(--gold)':'var(--slate)'}">${r.toFixed(1)}%${cur?' ←':''}</span><span>${fmt(m)}</span><span>${fmt(m*12)}</span><span style="color:${i===0?'var(--slate)':d>600?'var(--risk-red)':'var(--terracotta)'}">${i===0?'current':'+'+fmt(d)+'/mo'}</span></div>`;
      });
      stEl.innerHTML=html+'</div>';
    }

    // ─── TAB 3: SERVICEABILITY QUICK-CHECK ───
    const incomeEl = document.getElementById('inp-income');
    const svcCard = document.getElementById('svc-card');
    if (incomeEl && svcCard) {
      const grossIncome = parseFloat(incomeEl.value) || 0;
      if (grossIncome > 0) {
        // Australian bank serviceability: assessment rate = rate + 3%, max DSR ~30%, HEM floor
        const assessRate = rate + 3;
        const maxRepaymentMonth = grossIncome / 12 * 0.30; // 30% of gross monthly income
        // Reverse-engineer max loan from max payment at assessment rate
        const maxLoan = Math.round(maxRepaymentMonth * (Math.pow(1 + assessRate/100/12, term*12) - 1) / ((assessRate/100/12) * Math.pow(1 + assessRate/100/12, term*12)));
        const dti = loanAmt > 0 && grossIncome > 0 ? loanAmt / grossIncome : 0;
        const repayToIncome = grossIncome > 0 ? (monthly * 12 / grossIncome * 100) : 0;
        const gap = maxLoan - loanAmt;
        const feasible = loanAmt <= maxLoan;
        let svcHtml = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">`;
        svcHtml += `<div style="background:rgba(28,28,30,0.04);border-radius:4px;padding:10px 12px;">
          <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:1px;color:var(--slate);text-transform:uppercase;margin-bottom:4px;">Max Borrowing</div>
          <div style="font-family:'DM Mono',monospace;font-size:18px;color:var(--sky);">${fmtK(maxLoan)}</div>
          <div style="font-size:10px;color:var(--slate);margin-top:2px;">@ ${assessRate.toFixed(1)}% assessment rate</div>
        </div>`;
        svcHtml += `<div style="background:rgba(28,28,30,0.04);border-radius:4px;padding:10px 12px;">
          <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:1px;color:var(--slate);text-transform:uppercase;margin-bottom:4px;">Your Loan</div>
          <div style="font-family:'DM Mono',monospace;font-size:18px;color:${feasible?'var(--sage)':'var(--risk-red)'};">${fmtK(loanAmt)}</div>
          <div style="font-size:10px;color:var(--slate);margin-top:2px;">${feasible ? '✓ within capacity' : '⚠ exceeds capacity'}</div>
        </div>`;
        svcHtml += `</div>`;
        svcHtml += `<div style="display:flex;gap:18px;flex-wrap:wrap;font-family:'DM Mono',monospace;font-size:11px;margin-bottom:10px;">`;
        svcHtml += `<span>Repayment/Income: <strong style="color:${repayToIncome>35?'var(--risk-red)':repayToIncome>28?'var(--terracotta)':'var(--sage)'}">${repayToIncome.toFixed(1)}%</strong></span>`;
        svcHtml += `<span>Debt-to-Income: <strong style="color:${dti>6?'var(--risk-red)':dti>4.5?'var(--terracotta)':'var(--sage)'}">${dti.toFixed(1)}×</strong></span>`;
        if (!feasible) svcHtml += `<span style="color:var(--risk-red);">Shortfall: ${fmtK(Math.abs(gap))}</span>`;
        else svcHtml += `<span style="color:var(--sage);">Headroom: ${fmtK(gap)}</span>`;
        svcHtml += `</div>`;
        svcHtml += `<div style="font-size:10px;color:var(--slate);line-height:1.6;">APRA requires lenders to assess at rate + 3% buffer. Actual capacity varies by lender, expenses, and existing debts. <a href="/tools/loan-serviceability-calculator" target="_blank" style="color:var(--sky);">Run full serviceability check →</a></div>`;
        svcCard.innerHTML = svcHtml;
        svcCard.style.display = '';
      } else {
        svcCard.style.display = 'none';
      }
    }

    // ─── TAB 4: RENT OVERLAP ───
    const weeklyMort=weekly;
    const combinedWeekly=rent+weeklyMort;
    const totalOverlap=combinedWeekly*weeks;
    const cashAfter=remaining-totalOverlap;

    set('ov-weekly-total',fmt(combinedWeekly));
    set('ov-total-cost',fmt(totalOverlap));
    const ovR=document.getElementById('ov-remaining-after');
    if(ovR){ovR.textContent=fmt(cashAfter);ovR.style.color=cashAfter<0?'var(--risk-red)':'';}

    set('ov-rent-wk',fmt(rent));set('ov-mort-wk',fmt(weeklyMort));
    set('ov-rent-pct',combinedWeekly>0?Math.round(rent/combinedWeekly*100)+'%':'0%');
    set('ov-mort-pct',combinedWeekly>0?Math.round(weeklyMort/combinedWeekly*100)+'%':'0%');
    css('ov-rent-bar','width',combinedWeekly>0?(rent/combinedWeekly*100)+'%':'0%');
    css('ov-mort-bar','width',combinedWeekly>0?(weeklyMort/combinedWeekly*100)+'%':'0%');

    set('ov-s-rent',fmt(rent));set('ov-s-mort',fmt(weeklyMort));
    set('ov-s-combined',fmt(combinedWeekly));
    set('ov-s-weeks',weeks);set('ov-s-total',fmt(totalOverlap));
    set('ov-buf-start',fmt(remaining));
    set('ov-buf-overlap','−'+fmt(totalOverlap));
    const ovFinal=document.getElementById('ov-buf-final');
    // Match reno tab: cash after overlap AND reno budget spent
    const cashAfterReno = cashAfter - renoTotal;
    if(ovFinal){ovFinal.textContent=fmt(cashAfterReno);ovFinal.style.color=cashAfterReno<0?'var(--risk-red)':cashAfterReno<5000?'var(--terracotta)':'var(--reward-green)';}

    const advEl=document.getElementById('ov-advice');
    if(advEl){
      if(weeks===0)advEl.innerHTML=`<div class="alert alert-ok">✓ No overlap period — you move in straight after renovation. Maximum cash preserved.</div>`;
      else if(cashAfter<0)advEl.innerHTML=`<div class="alert alert-warn">⚠️ The overlap cost (${fmt(totalOverlap)}) exceeds your remaining cash. You'll need extra funds or to reduce the overlap period.</div>`;
      else if(cashAfterReno<5000)advEl.innerHTML=`<div class="alert alert-warn">⚠️ Tight — only ${fmt(cashAfterReno)} remaining after overlap &amp; reno. Consider reducing overlap weeks or reno scope.</div>`;
      else advEl.innerHTML=`<div class="alert alert-ok">✓ Manageable — ${fmt(cashAfterReno)} remaining after reno &amp; ${weeks}-week overlap.</div>`;
    }

    // calendar grid
    const calEl=document.getElementById('cal-grid');
    if(calEl&&weeks>=0){
      if(weeks===0){
        calEl.innerHTML=`<div style="text-align:center;padding:18px 12px;color:var(--slate);font-size:12px;line-height:1.6;background:rgba(90,158,123,0.07);border-radius:4px;border:1px solid rgba(90,158,123,0.15);">✓ No overlap — single housing cost from Day 1. Your mortgage starts and rent ends at settlement.</div>`;
      } else {
        const totalW=Math.max(8,weeks+4);
        let html=`<div style="display:grid;grid-template-columns:repeat(${Math.min(totalW,12)},1fr);gap:3px;margin-bottom:4px">`;
        for(let i=0;i<Math.min(totalW,12);i++){
          const cls=i<weeks?'cal-both':'cal-mortgage';
          html+=`<div class="cal-cell ${cls}" title="${i<weeks?'Rent + Mortgage':'Mortgage only'}">${i+1}</div>`;
        }
        html+='</div>';
        html+=`<div style="font-size:11px;color:var(--slate);margin-top:6px">`;
        html+=`<span style="display:inline-flex;align-items:center;gap:5px;margin-right:12px"><span style="width:10px;height:10px;border-radius:2px;background:var(--terracotta);display:inline-block"></span>Paying rent + mortgage</span>`;
        html+=`<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:var(--sky);display:inline-block"></span>Mortgage only</span>`;
        html+='</div>';
        calEl.innerHTML=html;
      }
    }

    // overlap scenarios
    const scEl=document.getElementById('overlap-scenarios');
    if(scEl){
      const scenWeeks=[0,2,4,6,8,12];
      let html=`<div style="font-family:'DM Mono',monospace;font-size:11px"><div style="display:grid;grid-template-columns:70px 1fr 1fr 1fr;gap:8px;margin-bottom:6px;color:var(--slate);font-size:10px;letter-spacing:1px;text-transform:uppercase;padding-bottom:5px;border-bottom:1px solid rgba(28,28,30,0.1)"><span>Weeks</span><span>Overlap Cost</span><span>Reno Budget Left</span><span>Status</span></div>`;
      scenWeeks.forEach(w=>{
        const cost=combinedWeekly*w;
        const left=remaining-cost;
        const isCur=w===weeks;
        const status=left<0?'⚠ Shortfall':left<8000?'⚡ Tight':'✓ OK';
        const sc=left<0?'var(--risk-red)':left<8000?'var(--terracotta)':'var(--reward-green)';
        html+=`<div style="display:grid;grid-template-columns:70px 1fr 1fr 1fr;gap:8px;padding:6px 0;border-top:1px solid rgba(28,28,30,0.06)${isCur?';background:rgba(201,168,76,0.06);border-radius:2px':''}">
          <span style="color:${isCur?'var(--gold)':'var(--slate)'}">${w}wk${isCur?' ←':''}</span>
          <span>${fmt(cost)}</span>
          <span style="color:${sc}">${fmt(left)}</span>
          <span style="color:${sc}">${status}</span>
        </div>`;
      });
      scEl.innerHTML=html+'</div>';
    }

    // ─── TAB 5: TIMELINE ───
    set('tl-address',address);
    // Settle date badge — show formatted date if entered, else generic timeframe
    const _settleDateEl=document.getElementById('inp-settle-date');
    const _settleBadge=document.getElementById('tl-settle-badge');
    if(_settleBadge&&_settleDateEl&&_settleDateEl.value){
      const _sd=new Date(_settleDateEl.value+'T00:00:00');
      const _today=new Date(); _today.setHours(0,0,0,0);
      const _daysUntil=Math.round((_sd-_today)/(86400000));
      const _sdFmt=_sd.toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
      _settleBadge.textContent=_daysUntil>0?`${_sdFmt} — ${_daysUntil}d away`:_daysUntil===0?`${_sdFmt} — Today!`:`${_sdFmt}`;
    } else if(_settleBadge){ _settleBadge.textContent='Week 4–12'; }
    const ob=document.getElementById('tl-overlap-badge');
    if(ob)ob.textContent=weeks>0?weeks+' wks':'';
    const od=document.getElementById('tl-overlap-desc');
    if(od)od.textContent=weeks>0?`You continue renting for ${weeks} weeks while renovations begin — paying ${fmt(combinedWeekly)}/wk (rent + mortgage) for a total of ${fmt(totalOverlap)}.`:'No overlap planned — you move in immediately after renovations.';
    const olDur=document.getElementById('tl-overlap-dur');
    if(olDur)olDur.textContent=weeks>0?`Weeks 1–${weeks} post-settlement`:'Immediate move-in';
    const olDurCal=document.getElementById('tl-overlap-dur-cal');
    if(olDurCal)olDurCal.textContent=weeks>0?`Weeks 1–${weeks} post-settlement`:'Immediate move-in';

    // ─── TAB 6: RISKS ───
    // Risk score — LVR-based (primary), then rate, cash buffer, overlap
    const lvrRisk   = lvr > 90 ? 25 : lvr > 85 ? 15 : lvr > 80 ? 8 : 0;
    const rateRisk  = rate > 7.5 ? 15 : rate > 6.5 ? 10 : rate > 6 ? 5 : 0;
    const bufferRisk= remaining < 5000 ? 25 : remaining < 15000 ? 10 : remaining < 30000 ? 5 : 0;
    const overlapRisk = weeks > 8 ? 10 : weeks > 4 ? 5 : 0;
    const govtBonus = govtPct > 20 ? -8 : govtPct > 10 ? -4 : 0;
    const riskScore = Math.min(90, Math.max(15, 20 + lvrRisk + rateRisk + bufferRisk + overlapRisk + govtBonus));
    const rewardScore=Math.min(95,Math.max(25,
      35+(govtPct>0?20:0)+(remaining>20000?15:remaining>10000?8:0)+(renoTotal>10000?10:5)+(price<650000?5:0)+(lvr<=80&&price>0?8:0)
    ));
    css('risk-meter','width',riskScore+'%');css('reward-meter','width',rewardScore+'%');
    const _riskMsg = riskScore<30 ? 'Low risk — strong LVR and healthy cash buffer.'
      : riskScore<50 ? (lvr<=80 ? 'Moderate risk — LVR is manageable, watch your cash buffer.' : 'Moderate risk — consider increasing deposit to get below 80% LVR.')
      : riskScore<70 ? 'Medium-high risk — LVR or cash buffer needs attention before proceeding.'
      : 'Higher risk — high LVR and/or thin buffer. Build more savings before buying.';
    set('risk-desc', _riskMsg);
    set('reward-desc',rewardScore>70?'High reward potential — strong equity position and capital growth exposure.':rewardScore>50?(govtPct>0?'Good reward potential — renovation and scheme create solid upside.':'Good reward potential — renovation can create solid equity uplift.'):'Modest reward potential — consider a higher reno budget or govt scheme.');
    const m2=calcMonthly(loanAmt,rate+3,term); // APRA serviceability buffer: +3%
    set('rr-rate-delta',fmt(m2-monthly));
    set('rr-dep-pct',pctS(depPct));set('rr-pool-val',fmtK(remaining));
    set('rr-overlap-cost',fmt(totalOverlap));set('rr-overlap-weeks',weeks);
    set('rr-dep-show',fmtK(deposit));set('rr-reno-show',fmtK(renoTotal));
    set('rr-price-show',fmtK(price));set('rr-govt-show',pctS(govtPct));
    set('rr-dep-ltg',fmtK(deposit));set('rr-price-ltg',fmtK(price));
    // Conditionally show/hide risk rows
    const rriOverlap = document.getElementById('rri-overlap');
    if(rriOverlap) rriOverlap.style.display = (weeks>0) ? '' : 'none';
    const rriEquity = document.getElementById('rri-equity');
    if(rriEquity) rriEquity.style.display = (lvr>80 && price>0) ? '' : 'none';
    const rriGovt = document.getElementById('rri-govt-reward');
    if(rriGovt) rriGovt.style.display = (govtPct>0) ? '' : 'none';
    // LMI: reward row (no LMI) when LVR ≤ 80%; risk row (LMI required) when LVR > 80%
    const rriLmi = document.getElementById('rri-lmi');
    if(rriLmi) rriLmi.style.display = (price>0 && lvr<=80) ? '' : 'none';
    const rriLmiRisk = document.getElementById('rri-lmi-risk');
    if(rriLmiRisk) {
      rriLmiRisk.style.display = (price>0 && lvr>80) ? '' : 'none';
      set('rr-lmi-est', fmt(calcLMI(loanAmt, price)));
    }

    // Track calculation completion - with free/pro usage context
    if(window.trackAppCalculationResult) {
      var userPlan = 'free';
      try { userPlan = JSON.parse(localStorage.getItem('propCalc_session_v1')||'{}').plan || 'free'; } catch(e) {}
      trackAppCalculationResult({
        propertyValue: price,
        loanAmount: loanAmt,
        yearsProjected: term,
        rentalIncome: rent > 0 ? rent : null,
        renovationCost: renoTotal > 0 ? renoTotal : null,
        userPlan: userPlan,
        hasScenariosCount: (_scenariosCache || []).length
      });
    }
  }

  function showTab(id,btn){
    trackUsage('tab_switch');
    // Track tab navigation
    if(window.trackTabNavigation) trackTabNavigation(id);

    document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(function(t){
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    document.getElementById(id).classList.add('active');
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    // Scroll content back to top when switching tabs
    var mainEl = document.querySelector('main');
    if(mainEl) mainEl.scrollTop = 0; else window.scrollTo(0,0);
    // Redraw projection when that tab becomes visible (container was hidden at load)
    if(id === 'projection' && isPro()){ setTimeout(drawProjection, 30); }
    // Smooth-scroll active tab to centre on mobile
    if(window.innerWidth <= 820){
      setTimeout(function(){
        btn.scrollIntoView({behavior:'smooth', block:'nearest', inline:'center'});
      }, 40);
    }
  }

  const PRESETS={
    base:        {price:650000,savings:40000,depp:2,  govt:28.7,rate:6.2,term:30,bank:800,conv:1600,pest:700,r1:3500,r2:5000,r3:4500,r4:4000,r5:2000,r6:2000,cont:15,rent:450,weeks:4},
    max:         {price:700000,savings:60000,depp:5,  govt:28.7,rate:6.2,term:30,bank:800,conv:1800,pest:700,r1:5000,r2:8000,r3:6000,r4:5000,r5:3000,r6:3000,cont:15,rent:450,weeks:4},
    conservative:{price:600000,savings:50000,depp:10, govt:28.7,rate:7.0,term:25,bank:800,conv:1600,pest:700,r1:2000,r2:3000,r3:2500,r4:2000,r5:1000,r6:1000,cont:20,rent:400,weeks:6},
    nodep:       {price:650000,savings:40000,depp:20, govt:0,   rate:6.5,term:30,bank:800,conv:1600,pest:700,r1:2000,r2:3000,r3:2000,r4:2000,r5:1000,r6:500, cont:10,rent:450,weeks:2},
  };

  function loadPreset(key){
    const p=PRESETS[key];
    Object.entries(p).forEach(([k,val])=>{
      const inp=document.getElementById('inp-'+k),rng=document.getElementById('rng-'+k);
      if(inp)inp.value=val;if(rng)rng.value=val;rl(k,val);
    });
    dynCosts=[];renderDynCosts();
    recalc();
  }

  function handlePhotoDrop(e){
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const file=e.dataTransfer.files[0];
    if(file&&file.type.startsWith('image/'))handlePropPhotoFile(file);
  }

  function handlePhotoFile(file){
    if(!file)return;
    handlePropPhotoFile(file);
  }

  // ── PROPERTY DETAILS ──
  let propPhotoDataUrl = '';
  let _lastSavedAddr = null;
  let _isDirty = false;
  let _forceDirty = false;
  let _restoringDraft = false; // suppresses autosaveDraft during restore
  let propThumbDataUrl = ''; // small thumbnail for library

  function handlePropPhotoDrop(e){
    e.preventDefault();
    e.currentTarget.classList.remove('pd-drag');
    const file = e.dataTransfer.files[0];
    if(file && file.type.startsWith('image/')) handlePropPhotoFile(file);
  }

  function handlePropPhotoFile(file){
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(e){
      const img = new Image();
      img.onload = function(){
        // Resize to max 900px wide for storage (reduces from ~3MB to ~80-150KB)
        const MAX = 900;
        const ratio = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        propPhotoDataUrl = c.toDataURL('image/jpeg', 0.82);
        // Also store a small thumbnail (200px) for the library grid
        const THUMB = 200;
        const tr = Math.min(1, THUMB / Math.max(img.width, img.height));
        const tw = Math.round(img.width * tr);
        const th = Math.round(img.height * tr);
        const tc = document.createElement('canvas');
        tc.width = tw; tc.height = th;
        tc.getContext('2d').drawImage(img, 0, 0, tw, th);
        propThumbDataUrl = tc.toDataURL('image/jpeg', 0.72);
        applyPropPhoto(propPhotoDataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function applyPropPhoto(src){
    // Ensure photo data variables are set (used by draft save and scenario save)
    if(src && !propPhotoDataUrl) propPhotoDataUrl = src;
    if(src && !propThumbDataUrl) propThumbDataUrl = src;
    // big preview in details tab
    const big = document.getElementById('pd-photo-big');
    const prompt = document.getElementById('pd-upload-prompt');
    const overlay = document.getElementById('pd-photo-overlay');
    if(big){ big.src = src; big.style.display = 'block'; }
    if(prompt) prompt.style.display = 'none';
    if(overlay) overlay.style.display = 'flex';
    // header thumbnail
    const hImg = document.getElementById('prop-img');
    const hZone = document.getElementById('upload-zone');
    if(hImg){ hImg.src = src; hImg.style.display = 'block'; }
    if(hZone) hZone.style.display = 'none';
    // preview thumb in details tab
    const prevPhoto = document.getElementById('pd-preview-photo');
    if(prevPhoto){ const s=safePhotoSrc(src); if(s) prevPhoto.innerHTML='<img src="'+s+'" style="width:100%;height:100%;object-fit:cover;">'; }
    updatePropertyDetails();
    triggerAutoSaveToLibrary();
  }

  function clearPropPhoto(){
    propPhotoDataUrl = '';
    propThumbDataUrl = '';
    const big = document.getElementById('pd-photo-big');
    const prompt = document.getElementById('pd-upload-prompt');
    const overlay = document.getElementById('pd-photo-overlay');
    if(big){ big.src=''; big.style.display='none'; }
    if(prompt) prompt.style.display = 'flex';
    if(overlay) overlay.style.display = 'none';
    const hImg = document.getElementById('prop-img');
    const hZone = document.getElementById('upload-zone');
    if(hImg){ hImg.src=''; hImg.style.display='none'; }
    if(hZone) hZone.style.display = 'flex';
    const prevPhoto = document.getElementById('pd-preview-photo');
    if(prevPhoto) prevPhoto.innerHTML = '📷';
    updatePropertyDetails();
  }

  // ── PHOTO URL PASTE ──
  function handlePhotoUrlInput(val){
    // Real-time preview while typing a URL (debounced via existing input handler)
  }

  // ── MAP IMAGE (item #10) ──
  async function loadMapImage(){
    const addr   = document.getElementById('pd-address')?.value?.trim() || '';
    const suburb = document.getElementById('pd-suburb')?.value?.trim()  || '';
    const state  = document.getElementById('pd-state')?.value?.trim()   || '';
    const query  = [addr, suburb, state, 'Australia'].filter(Boolean).join(', ');
    if(!addr){ showToast('⚠️ Enter a street address in the Property tab first'); return; }

    const btn = document.getElementById('map-img-btn');
    if(btn){ btn.disabled = true; btn.textContent = '⏳ Fetching map…'; }

    try {
      // 1. Geocode via address-suggest function (Domain API → Nominatim fallback)
      const geoRes = await fetch(
        `/.netlify/functions/address-suggest?mode=geocode&q=${encodeURIComponent(query)}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const geoData = await geoRes.json();
      if(!geoData.ok || !geoData.lat){ showToast('⚠️ Address not found on map. Try including suburb and state.'); return; }
      const { lat, lon } = geoData;

      // 2. Fetch static map via server-side proxy (avoids browser CORS restriction)
      const proxyRes = await fetch(`/.netlify/functions/mapproxy?lat=${lat}&lon=${lon}&zoom=15`);
      const proxyData = await proxyRes.json();
      if(!proxyData.ok) throw new Error(proxyData.error || 'Map proxy failed');

      // 3. Stitch tiles onto a canvas (new tile-based format) or load dataUrl directly (legacy)
      let imgSrc;
      if(proxyData.tiles){
        const { tiles, cols, rows, tileSize } = proxyData;
        const ts = tileSize || 256;
        const stitchCanvas = document.createElement('canvas');
        stitchCanvas.width = cols * ts; stitchCanvas.height = rows * ts;
        const sctx = stitchCanvas.getContext('2d');
        await Promise.all(tiles.map((dataUrl, i) => {
          if(!dataUrl) return Promise.resolve();
          const col = i % cols, row = Math.floor(i / cols);
          const tileImg = new Image();
          return new Promise(res => { tileImg.onload = () => { sctx.drawImage(tileImg, col * ts, row * ts); res(); }; tileImg.onerror = res; tileImg.src = dataUrl; });
        }));
        // Draw red location pin at the centre of the stitched image
        const cx = Math.round(cols * ts / 2), cy = Math.round(rows * ts / 2);
        const r = 10, stem = 16;
        sctx.beginPath();
        sctx.arc(cx, cy - stem, r, 0, Math.PI * 2);
        sctx.fillStyle = '#E03030';
        sctx.fill();
        sctx.strokeStyle = '#fff';
        sctx.lineWidth = 2;
        sctx.stroke();
        sctx.beginPath();
        sctx.moveTo(cx, cy - stem + r * 0.7);
        sctx.lineTo(cx, cy);
        sctx.strokeStyle = '#E03030';
        sctx.lineWidth = 3;
        sctx.stroke();
        // White dot in pin
        sctx.beginPath();
        sctx.arc(cx, cy - stem, 4, 0, Math.PI * 2);
        sctx.fillStyle = '#fff';
        sctx.fill();
        imgSrc = stitchCanvas.toDataURL('image/png');
      } else {
        imgSrc = proxyData.dataUrl;
      }

      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = imgSrc; });

      const MAX = 1200;
      const ratio = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width * ratio), h = Math.round(img.height * ratio);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      propPhotoDataUrl = c.toDataURL('image/jpeg', 0.82);

      const THUMB = 200;
      const tr = Math.min(1, THUMB / Math.max(img.width, img.height));
      const tc = document.createElement('canvas');
      tc.width = Math.round(img.width * tr); tc.height = Math.round(img.height * tr);
      tc.getContext('2d').drawImage(img, 0, 0, tc.width, tc.height);
      propThumbDataUrl = tc.toDataURL('image/jpeg', 0.72);

      applyPropPhoto(propPhotoDataUrl);
      showToast('🗺️ Map image loaded from OpenStreetMap');
    } catch(err) {
      // Fallback: set URL directly (no thumbnail, but still usable)
      const addr2   = document.getElementById('pd-address')?.value?.trim() || '';
      const suburb2 = document.getElementById('pd-suburb')?.value?.trim()  || '';
      const state2  = document.getElementById('pd-state')?.value?.trim()   || '';
      const q2 = [addr2, suburb2, state2, 'Australia'].filter(Boolean).join(', ');
      showToast('⚠️ Could not load map image (CORS or network issue). Try pasting a photo URL manually.');
    } finally {
      if(btn){ btn.disabled = false; btn.innerHTML = '🗺️ Get Map Image from Address'; }
    }
  }

  function applyPhotoUrl(){
    const urlEl = document.getElementById('pd-photo-url');
    const url   = urlEl?.value?.trim();
    if(!url){ showToast('⚠️ Paste an image URL first'); return; }
    const safe = safePhotoSrc(url);
    if(!safe){ showToast('⚠️ Only https:// image URLs are allowed'); return; }
    propPhotoDataUrl = safe;
    applyPropPhoto(safe);
    showToast('🖼️ Photo loaded from URL');
  }

  function stepStat(id, delta){
    const el = document.getElementById(id);
    if(!el) return;
    const val = (parseInt(el.value) || 0) + delta;
    el.value = Math.max(0, val);
    updatePropertyDetails();
  }

  function setPropType(btn, type){
    document.querySelectorAll('.prop-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('pd-type').value = type;
    updatePropertyDetails();
  }

  // ══════════════════════════════════════════════
  // ADDRESS AUTOCOMPLETE
  // Primary:  Domain Address Suggestions API (server-side, AU-optimised)
  // Fallback: Nominatim / OpenStreetMap
  // Both handled transparently by /.netlify/functions/address-suggest
  // ══════════════════════════════════════════════
  let _addrTimer = null;
  let _lastAddrQuery = '';

  async function addrAutocomplete(val){
    val = val.trim();
    if(val.length < 4){ hideAddrSuggestions(); return; }
    if(val === _lastAddrQuery) return;
    _lastAddrQuery = val;
    clearTimeout(_addrTimer);
    _addrTimer = setTimeout(async () => {
      try {
        const url = '/.netlify/functions/address-suggest?limit=6&q=' + encodeURIComponent(val);
        const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if(!r.ok) {
          var errorType = 'http_error';
          if(r.status === 429) errorType = 'rate_limit';
          else if(r.status >= 500) errorType = 'server_error';
          if(window.trackAPIError) trackAPIError('address_suggest', errorType, r.status);
          throw new Error('no response');
        }
        const j = await r.json();
        if(!j.ok || !j.results || !j.results.length){ hideAddrSuggestions(); return; }
        showAddrSuggestions(j.results);
      } catch(e) {
        if(e.name === 'TimeoutError' && window.trackAPIError) trackAPIError('address_suggest', 'timeout');
        hideAddrSuggestions();
      }
    }, 200);
  }

  function showAddrSuggestions(results){
    const box = document.getElementById('addr-suggestions');
    if(!box || !results.length){ hideAddrSuggestions(); return; }
    _addrResults = results;
    box.innerHTML = results.map((r,i) =>
      `<div class="addr-suggestion" data-idx="${i}">
        <strong>${escHtml(r.address)}</strong><br><span>${escHtml(r.suburb)}${r.postcode ? ', '+escHtml(r.postcode) : ''} ${escHtml(r.state)}</span>
      </div>`
    ).join('');
    box.style.display = 'block';
  }

  function hideAddrSuggestions(){
    const box = document.getElementById('addr-suggestions');
    if(box) box.style.display = 'none';
  }

  function selectAddress(r){
    const addrEl   = document.getElementById('pd-address');
    const suburbEl = document.getElementById('pd-suburb');
    const stateEl  = document.getElementById('pd-state');
    if(addrEl)   addrEl.value   = r.address || '';
    if(suburbEl) suburbEl.value = r.suburb  || '';
    if(stateEl && r.state)  stateEl.value = r.state;
    hideAddrSuggestions();
    updatePropertyDetails();
  }

  function updatePropertyDetails(){
    if(!_restoringDraft) _forceDirty = true;
    autosaveDraft();
    triggerAutoSaveToLibrary();
    const address = document.getElementById('pd-address').value;
    const suburb  = document.getElementById('pd-suburb').value;
    const state   = document.getElementById('pd-state').value;
    const bed     = parseInt(document.getElementById('pd-bed').value) || 0;
    const bath    = parseInt(document.getElementById('pd-bath').value) || 0;
    const car     = parseInt(document.getElementById('pd-car').value) || 0;
    const land    = document.getElementById('pd-land').value;
    const house   = document.getElementById('pd-house').value;
    const year    = document.getElementById('pd-year').value;
    const type    = document.getElementById('pd-type').value;
    const url     = document.getElementById('pd-url').value;

    const fullAddr = [address, suburb, state].filter(Boolean).join(', ') || 'New Property';

    // update header title
    const pageTitle = document.getElementById('page-title');
    if(pageTitle) pageTitle.textContent = fullAddr;

    // update header subtitle with stats or fallback
    const statParts = [
      type && type !== 'House' ? type : (address ? 'House' : null),
      bed  ? bed+' bed'  : null,
      bath ? bath+' bath': null,
      car  ? car+' car'  : null,
      land ? land+'m² land' : null
    ].filter(Boolean);
    const headerSubEl = document.getElementById('header-sub-text');
    if(headerSubEl) headerSubEl.textContent = statParts.length ? statParts.join('  ·  ') : (address ? 'Edit values on the left — everything updates live' : 'Add property details in the Property tab to get started');
    // Status badge in header
    const statusVal = document.getElementById('pd-status')?.value || 'browsing';
    const STATUS_BADGE_COLORS = {'browsing':'#5B8FAB','auction':'#C4704A','for-sale':'#C9A84C','offered':'#7B9E87','under-offer':'#E8A882','unconditional':'#5A9E7B','sold':'#C45A5A'};
    const STATUS_BADGE_LABELS = {'browsing':'👀 Browsing','auction':'🔨 Auction','for-sale':'🏷 For Sale','offered':'📝 Offer Sent','under-offer':'⏳ Under Offer','unconditional':'✅ Unconditional','sold':'🔴 Sold'};
    let statusBadge = document.getElementById('header-status-badge');
    if(!statusBadge){ statusBadge = document.createElement('div'); statusBadge.id='header-status-badge'; statusBadge.style.cssText='display:inline-block;padding:2px 10px;border-radius:10px;font-family:\u0027DM Mono\u0027,monospace;font-size:10px;letter-spacing:0.5px;font-weight:500;white-space:nowrap;width:auto;max-width:none;align-self:flex-start;margin-top:4px;'; const h1=document.getElementById('page-title'); if(h1&&h1.parentNode) h1.parentNode.insertBefore(statusBadge, h1.nextSibling); }
    statusBadge.textContent = STATUS_BADGE_LABELS[statusVal] || statusVal;
    statusBadge.style.background = (STATUS_BADGE_COLORS[statusVal]||'#888') + '33';
    statusBadge.style.color = STATUS_BADGE_COLORS[statusVal] || '#888';
    statusBadge.style.border = '1px solid ' + (STATUS_BADGE_COLORS[statusVal]||'#888') + '66';

    const photoCap = document.getElementById('photo-caption');
    if(photoCap) photoCap.textContent = fullAddr;

    // sync address to sidebar
    const sideAddr = document.getElementById('inp-address');
    if(sideAddr && sideAddr.value !== address) sideAddr.value = address;

    // listing URL link
    const urlLink = document.getElementById('pd-url-link');
    const urlAnchor = document.getElementById('pd-url-anchor');
    if(url && url.startsWith('http')){ urlLink.style.display='block'; urlAnchor.href=url; }
    else if(urlLink) urlLink.style.display='none';

    // photo label
    const photoLabel = document.getElementById('pd-photo-label');
    if(photoLabel) photoLabel.textContent = fullAddr;

    // live preview
    const prevTitle = document.getElementById('pd-preview-title');
    if(prevTitle) prevTitle.textContent = fullAddr;

    const statsEl = document.getElementById('pd-preview-stats');
    if(statsEl){
      const chips = [];
      if(type) chips.push(`🏠 ${escHtml(type)}`);
      if(bed)  chips.push(`🛏 ${bed} bed`);
      if(bath) chips.push(`🚿 ${bath} bath`);
      if(car)  chips.push(`🚗 ${car} car`);
      if(land) chips.push(`📐 ${escHtml(land)}m²`);
      if(house)chips.push(`🏗 ${escHtml(house)}m² house`);
      if(year) chips.push(`📅 Built ${escHtml(year)}`);
      statsEl.innerHTML = chips.map(c=>`<span class="pd-stat-chip">${c}</span>`).join('') || '<span style="font-size:11px;color:rgba(245,240,232,0.3);font-family:\u0027DM Mono\u0027,monospace;">Fill in details above to see preview</span>';
    }

    recalc();
  }

  // ══════════════════════════════════════════════
  // RENO NOTES — legacy placeholder (reno items now fully dynamic, item 13)
  // ══════════════════════════════════════════════
  const renoNotes = {}; // kept for backward compat during load
  function saveRenoNote(i, val){ renoNotes[i] = val; }

  // ══════════════════════════════════════════════
  // SHARED STORAGE — Netlify Functions + Blobs
  // All visitors to the site share the same data.
  // Falls back to localStorage when running locally.
  // ══════════════════════════════════════════════
  const STORAGE_KEY = 'propCalc_v5_index';
  const PHOTO_PFX   = 'propCalc_v5_ph_';
  let scenariosView = 'grid';
  let pendingLoadId = null;
  let _scenariosCache = null;

  function lsGet(k){ try{return localStorage.getItem(k);}catch(e){return null;} }
  function lsSet(k,v){ try{localStorage.setItem(k,v);}catch(e){} }
  function lsDel(k){ try{localStorage.removeItem(k);}catch(e){} }

  // Are we running on Netlify (not a local file)?
  const ON_NETLIFY = window.location.protocol !== 'file:';

  async function getAllScenarios(){
    if(ON_NETLIFY){
      try{
        const loggedIn = isLoggedIn();
        const uid2   = getUserId();
        const qs     = (!loggedIn && uid2) ? '?userId='+encodeURIComponent(uid2) : '';
        const r = await fetch('/.netlify/functions/scenarios'+qs);
        if(r.ok){
          const data = await r.json();
          // Mirror to localStorage — survives Netlify rebuilds as a fallback
          if(data.length) lsSet(STORAGE_KEY, JSON.stringify(data));
          return data;
        }
        console.error('[storage] GET failed:', r.status, await r.text());
      }catch(e){ console.error('[storage] GET exception:', e.message); }
    }
    // Fallback: localStorage (browser-side, survives all rebuilds)
    try{ return JSON.parse(lsGet(STORAGE_KEY)||'[]'); }catch(e){ return []; }
  }

  async function saveScenarioToBackend(record, photoSrc){
    if(ON_NETLIFY){
      try{
        // Send record first (fast — no photo payload). Photo uploads in background.
        const r = await fetch('/.netlify/functions/scenarios', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ action:'save', userId:getUserId(), id:record.id, fullAddr:record.fullAddr, state:record.state, hasPhoto:!!photoSrc, status:record.status||'browsing', thumb:record.thumb||'', exportCount:record.exportCount||0, savedAt:record.savedAt||new Date().toISOString() })
        });
        if(r.ok){
          // Mirror updated list to localStorage immediately (belt-and-suspenders)
          getAllScenarios().then(latest => { if(latest.length) lsSet(STORAGE_KEY, JSON.stringify(latest)); }).catch(()=>{});
          // Upload full photo in background — retry once on failure
          if(photoSrc && isLoggedIn()){
            var _photoId = record.id;
            var _photoPayload = { action:'photo', userId:getUserId(), id: _photoId, photo: photoSrc };
            var _photoHeaders = {'Content-Type':'application/json'};
            fetch('/.netlify/functions/scenarios', {
              method: 'POST', headers: _photoHeaders,
              body: JSON.stringify(_photoPayload)
            }).then(function(pr){
              if(!pr.ok){
                console.warn('[storage] photo upload failed ('+pr.status+'), retrying…');
                return fetch('/.netlify/functions/scenarios', {
                  method: 'POST', headers: _photoHeaders,
                  body: JSON.stringify(_photoPayload)
                });
              }
            }).then(function(pr2){
              if(pr2 && !pr2.ok) console.error('[storage] photo retry also failed:', pr2.status);
            }).catch(function(e){ console.error('[storage] photo upload error:', e.message); });
          }
          return true;
        }
        const txt = await r.text();
        console.error('[storage] POST failed:', r.status, txt);
      }catch(e){ console.error('[storage] POST exception:', e.message); }
    }
    if(photoSrc) lsSet(PHOTO_PFX+record.id, photoSrc);
    let arr=[]; try{ arr=JSON.parse(lsGet(STORAGE_KEY)||'[]'); }catch(e){}
    const i=arr.findIndex(s=>s.id===record.id);
    if(i>=0) arr[i]=record; else arr.unshift(record);
    lsSet(STORAGE_KEY, JSON.stringify(arr));
    return false;
  }

  async function deleteScenarioFromBackend(id){
    if(ON_NETLIFY){
      try{
        const loggedIn3 = isLoggedIn();
        const uid3 = getUserId();
        const deleteQs = '?id='+encodeURIComponent(id) + ((!loggedIn3 && uid3) ? '&userId='+encodeURIComponent(uid3) : '');
        await fetch('/.netlify/functions/scenarios'+deleteQs, {
          method:'DELETE'
        });
      }catch(e){}
    }
    lsDel(PHOTO_PFX+id);
    try{
      const arr=JSON.parse(lsGet(STORAGE_KEY)||'[]').filter(s=>s.id!==id);
      lsSet(STORAGE_KEY, JSON.stringify(arr));
    }catch(e){}
  }

  const _photoCache = {};
  async function getPhoto(id){
    if(_photoCache[id]) return _photoCache[id];
    if(ON_NETLIFY){
      try{
        if(!isLoggedIn()) { /* guest: use localStorage */ }
        else {
          const r = await fetch('/.netlify/functions/scenarios', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({action:'getPhoto', userId:getUserId(), id})
          });
          if(r.ok){ const d=await r.json(); if(d.photo){ _photoCache[id]=d.photo; return d.photo; } return null; }
        }
      }catch(e){}
    }
    const local = lsGet(PHOTO_PFX+id);
    if(local) _photoCache[id] = local;
    return local;
  }

  function showStorageStatus(){
    const el = document.getElementById('storage-status');
    if(!el) return;
    if(ON_NETLIFY){
      el.innerHTML = '<span style="color:var(--sage-light)">☁ shared</span>';
      el.title = 'Netlify shared storage — all visitors see the same properties';
    }
  }

  function collectCurrentState(){
    const fields = [
      'inp-price','inp-savings','inp-depp','inp-govt','inp-rate','inp-term',
      'inp-cont','inp-rent','inp-weeks','inp-settle-date','inp-offset',
      'pd-address','pd-suburb','pd-state','pd-bed','pd-bath','pd-car',
      'pd-land','pd-house','pd-year','pd-type','pd-url','pd-notes',
      'pd-status','pd-status-date','ag-agency','ag-name','ag-phone','ag-email',
      'scheme-select','inp-state'
    ];
    const values = {};
    fields.forEach(id => { const el=document.getElementById(id); if(el) values[id]=el.value||''; });
    // Checkboxes saved separately
    const fhbEl = document.getElementById('inp-fhb');
    const newPropEl = document.getElementById('inp-new-prop');
    if(fhbEl) values['inp-fhb-checked'] = fhbEl.checked ? '1' : '0';
    if(newPropEl) values['inp-new-prop-checked'] = newPropEl.checked ? '1' : '0';
    const activePropType = document.querySelector('.prop-type-btn.active');
    values['pd-type-label'] = activePropType ? activePropType.textContent.trim() : '🏠 House';
    values['renoEnabled'] = renoEnabled;
    values['rentEnabled'] = document.getElementById('rent-sidebar-section')?.style.display !== 'none';
    return {
      values,
      dynCostData: dynCosts.map(c=>({name:c.name,amount:c.amount,category:c.category||'purchase'})),
      renoItemData: renoItems.map(r=>({emoji:r.emoji,name:r.name,amount:r.amount,note:r.note})),
      keyDates: typeof keyDates !== 'undefined' ? [...keyDates] : [],
      commsLog:  typeof commsLog  !== 'undefined' ? [...commsLog]  : []
    };
  }

  // Auto-save to library after property detail changes (not calculator values)
  var _autoSaveLibTimer = null;
  function triggerAutoSaveToLibrary(){
    if(!_lastSavedAddr) return; // only auto-save scenarios already in library
    clearTimeout(_autoSaveLibTimer);
    _autoSaveLibTimer = setTimeout(function(){
      var addr = document.getElementById('pd-address')?.value?.trim();
      if(!addr) return; // need an address to save
      saveScenario(true); // quiet mode
    }, 4000);
  }

  async function saveScenario(quiet){
    trackUsage('save_scenario');
    // Track scenario save
    if(window.trackScenarioAction) trackScenarioAction('save', {});

    const state    = collectCurrentState();
    const addr     = state.values['pd-address'] || '';
    if(!addr.trim()){
      showToast('⚠️ Please enter a property address before saving');
      const addrEl = document.getElementById('pd-address');
      if(addrEl){ addrEl.focus(); addrEl.style.borderColor='var(--terracotta)'; setTimeout(()=>addrEl.style.borderColor='',2500); }
      showTab('property', document.querySelector('.tab'));
      return;
    }
    const suburb   = state.values['pd-suburb']  || '';
    const stateV   = state.values['pd-state']   || '';
    const fullAddr = [addr, suburb, stateV].filter(Boolean).join(', ') || 'Unnamed Property';
    // Plan gate: check scenario limit from config
    if(!isPro()){
      let freeLimit = 1; // default
      try {
        const cfg = JSON.parse(localStorage.getItem('propCalc_siteConfig_v1')||'{}');
        freeLimit = cfg.freeScenarioLimit || 1;
      } catch(e) {}
      const existing = await getAllScenarios();
      if(existing && existing.length >= freeLimit){
        const addrKeyTest = fullAddr.toLowerCase().trim();
        const isUpdate = existing.some(s =>
          (s.addrKey||'') === addrKeyTest ||
          (s.fullAddr||'').toLowerCase().trim() === addrKeyTest
        );
        if(!isUpdate){
          const plural = freeLimit > 1 ? 's' : '';
          showToast(`🔒 Free plan allows ${freeLimit} saved scenario${plural}. <a href="/pricing" style="color:var(--gold);text-decoration:underline;">Upgrade to Pro for unlimited →</a>`, 6000);
          return;
        }
      }
    }
    const now      = new Date();
    const dd = String(now.getDate()).padStart(2,'0');
    const mm = String(now.getMonth()+1).padStart(2,'0');
    const yyyy = now.getFullYear();
    const hh = String(now.getHours()).padStart(2,'0');
    const min = String(now.getMinutes()).padStart(2,'0');
    const timestamp = `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    const scenarios = await getAllScenarios();
    const addrKey  = fullAddr.toLowerCase().trim();
    const existIdx = scenarios.findIndex(s =>
      (s.addrKey||'') === addrKey ||
      (s.fullAddr||'').toLowerCase().trim() === addrKey
    );
    const id       = existIdx >= 0 ? scenarios[existIdx].id : ('sc_' + Date.now());
    const status   = state.values['pd-status'] || 'browsing';
    const existingExportCount = existIdx >= 0 ? (scenarios[existIdx].exportCount || 0) : 0;
    const record   = {
      id, addrKey, fullAddr, timestamp, status,
      bed:  state.values['pd-bed']  || '',
      bath: state.values['pd-bath'] || '',
      car:  state.values['pd-car']  || '',
      type: state.values['pd-type'] || 'House',
      price: state.values['inp-price'] || '',
      hasPhoto: !!propPhotoDataUrl,
      thumb: propThumbDataUrl || null,
      exportCount: existingExportCount,
      savedAt: new Date().toISOString(),
      state,
    };
    const saveBtns = document.querySelectorAll('.hdr-save-btn');
    if(!quiet) saveBtns.forEach(b=>{b._ot=b.innerHTML;b.innerHTML='<div class="spinner-sm"></div>';b.disabled=true;});
    _scenariosCache = null;
    const usedCloud = await saveScenarioToBackend(record, propPhotoDataUrl||null);
    if(!quiet){
      // Show saved checkmark briefly before restoring button
      saveBtns.forEach(b=>{b.innerHTML='<span style="color:var(--sage);">✓</span> Saved';});
      setTimeout(()=>saveBtns.forEach(b=>{if(b._ot)b.innerHTML=b._ot;b.disabled=false;}), 1200);
    } else {
      saveBtns.forEach(b=>{if(b._ot)b.innerHTML=b._ot;b.disabled=false;});
    }
    _lastSavedAddr = fullAddr; _isDirty = false; updateUnsavedBadge();
    // Update page title with saved address
    const titleEl = document.getElementById('page-title');
    if(titleEl && addr) titleEl.textContent = addr;
    const action = existIdx>=0 ? 'Updated' : 'Saved';
    if(!quiet){
      if(usedCloud){
        showToast(`☁️ ${action} to cloud — visible on all devices`);
      } else if(ON_NETLIFY){
        showToast(`⚠️ Cloud save failed — saved locally only. Check Netlify Functions.`);
      } else {
        showToast(`💾 ${action} locally (open via Netlify for shared sync)`);
      }
    }
    updateSavedCount();
  }

  async function updateSavedCount(){
    // Warm the scenarios cache in the background so library opens instantly
    const arr = await getAllScenarios();
    if(arr.length) _scenariosCache = arr; // cache so library opens without re-fetching
    const ct = document.getElementById('saved-count');
    if(!ct) return;
    if(arr.length > 0){ ct.textContent = arr.length; ct.style.display='inline'; }
    else ct.style.display='none';
  }

  function setScenariosView(mode){ /* grid view removed — list only */ }

  function openScenariosModal(){
    document.body.classList.add('modal-open');
    var sm=document.getElementById('scenarios-modal');sm.style.display='flex';sm.style.alignItems='flex-start';sm.style.paddingTop='max(8px, env(safe-area-inset-top, 0px))';sm.style.paddingBottom='24px';
    document.body.style.overflow='hidden';
    var fab=document.getElementById('mobile-calc-fab');if(fab)fab.style.display='none';
    renderScenariosList();
  }
  function closeScenariosModal(){
    document.body.classList.remove('modal-open');
    document.getElementById('scenarios-modal').style.display='none';
    document.body.style.overflow='';
    var fab=document.getElementById('mobile-calc-fab');if(fab)fab.style.display='';
  }
  function closeConfirmModal(){
    document.getElementById('confirm-modal').style.display='none';
    pendingLoadId = null;
    // Restore FAB only if scenarios modal is also closed
    var sm=document.getElementById('scenarios-modal');
    if(!sm||sm.style.display==='none'){
      var fab=document.getElementById('mobile-calc-fab');if(fab)fab.style.display='';
    }
  }

  const STATUS_COLORS = {
    'browsing':'#5B8FAB','auction':'#C4704A','for-sale':'#C9A84C',
    'offered':'#7B9E87','under-offer':'#E8A882','unconditional':'#5A9E7B','sold':'#C45A5A'
  };
  const STATUS_LABELS = {
    'browsing':'👀 Browsing','auction':'🔨 Auction','for-sale':'🏷 For Sale',
    'offered':'📝 Offer Sent','under-offer':'⏳ Under Offer',
    'unconditional':'✅ Unconditional','sold':'🔴 Sold/Passed'
  };

  let _libFilter = 'all';

  function setLibFilter(f, btn){
    _libFilter = f;
    document.querySelectorAll('.lib-filter').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    _renderScenariosToDOM(_scenariosCache || []);
  }

  async function renderScenariosList(){
    const grid = document.getElementById('scenarios-grid');
    if(!grid) return;
    grid.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:40px 20px;color:var(--slate);font-family:\u0027DM Mono\u0027,monospace;font-size:12px;"><div class="spinner"></div>Loading properties…</div>';
    _scenariosCache = await getAllScenarios();
    _renderScenariosToDOM(_scenariosCache);
    loadSharedWithMe(); // load shared-with-me in parallel
    loadAdminAllScenarios(); // admin: load all users' scenarios
  }

  async function _renderScenariosToDOM(all){
    const grid  = document.getElementById('scenarios-grid');
    const empty = document.getElementById('scenarios-empty');
    if(!grid) return;

    // Sort newest first by savedAt timestamp
    const sorted = [...all].sort((a,b) => (b.savedAt||0) - (a.savedAt||0));
    const scenarios = _libFilter === 'all' ? sorted : sorted.filter(s => (s.status||'browsing') === _libFilter);

    if(!all || all.length === 0){
      if(empty) empty.style.display = 'block';
      grid.innerHTML = ''; return;
    }
    if(empty) empty.style.display = 'none';
    const libCount = document.getElementById('lib-count');
    if(libCount) libCount.textContent = all.length > 0 ? `(${all.length})` : '';

    if(scenarios.length === 0){
      grid.innerHTML = '<div style="text-align:center;padding:32px;color:var(--slate);font-size:13px;">No properties match this filter.</div>';
      return;
    }

    // Render rows immediately without waiting for photos
    const rows = scenarios.map(s => {
      const price  = s.price ? '$' + parseInt(s.price).toLocaleString() : '—';
      const stats  = [s.type||'House', s.bed?s.bed+' bed':null, s.bath?s.bath+' bath':null, s.car?s.car+' car':null].filter(Boolean).join(' · ');
      const status = s.status || 'browsing';
      const sColor = STATUS_COLORS[status] || '#999';
      const sLabel = STATUS_LABELS[status] || '👀';
      return `
        <div class="lib-row" data-scenarioid="${escHtml(s.id)}">
          <div class="lib-thumb" id="thumb-${s.id}"><span style="font-size:24px;">🏠</span></div>
          <div class="lib-info">
            <div class="lib-addr">${escHtml(s.fullAddr||'')}</div>
            <div class="lib-meta">${escHtml(stats)}</div>
          </div>
          <div class="lib-price">${price}</div>
          <div class="lib-badge" style="background:${sColor}22;color:${sColor};border:1px solid ${sColor}55;">${sLabel}</div>
          <div class="lib-ts">${(s.timestamp||'').replace(/(\d+)\s([A-Za-z]+)\s(\d{4})/,(_,d,mo,y)=>{const mn={Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};return String(d).padStart(2,'0')+'/'+(mn[mo]||'01')+'/'+y;})}</div>
        </div>`;
    });
    grid.innerHTML = rows.join('');

    // Load photos lazily — use thumb from record if available, else fetch
    scenarios.forEach(async s => {
      if(!s.hasPhoto) return;
      const thumbId = 'thumb-'+s.id;
      const setThumbSrc = (src) => {
        if(!src) return;
        const el = document.getElementById(thumbId);
        if(!el) return; // element may no longer be in DOM
        const img = document.createElement('img');
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:3px;';
        img.loading = 'lazy';
        img.onerror = () => {}; // suppress broken image
        img.src = src;
        el.innerHTML = '';
        el.appendChild(img);
      };
      // Use embedded thumb first (no network call needed)
      if(s.thumb){
        setThumbSrc(s.thumb);
        return;
      }
      // Fallback: fetch full photo from backend
      try {
        const photo = await getPhoto(s.id);
        setThumbSrc(photo);
      } catch(e) { /* leave default house emoji */ }
    });
  }

  // ── Library Actions Popup ──────────────────────────────────────────────────
  var _libActionsId = null;
  function openLibActionsPopup(id){
    const scenarios = _scenariosCache || [];
    const sc = scenarios.find(s => s.id === id);
    if(!sc) return;
    _libActionsId = id;
    var addrEl = document.getElementById('lib-actions-addr');
    var metaEl = document.getElementById('lib-actions-meta');
    if(addrEl) addrEl.textContent = sc.fullAddr || '';
    if(metaEl){
      var parts = [sc.type||'House', sc.bed?sc.bed+' bed':null, sc.bath?sc.bath+' bath':null].filter(Boolean);
      var price = sc.price ? '$'+parseInt(sc.price).toLocaleString() : '';
      metaEl.textContent = [parts.join(' · '), price].filter(Boolean).join(' — ');
    }
    document.getElementById('lib-actions-overlay').style.display = 'block';
  }
  function closeLibActionsPopup(){
    document.getElementById('lib-actions-overlay').style.display = 'none';
    _libActionsId = null;
  }
  function libActionLoad(){
    var id = _libActionsId;
    closeLibActionsPopup();
    if(id) {
      // Track scenario restore
      if(window.trackScenarioAction) trackScenarioAction('restore', {id: id});
      promptLoadScenario(id);
    }
  }
  function libActionExport(){
    var id = _libActionsId;
    closeLibActionsPopup();
    if(!id) return;
    // Track scenario export
    if(window.trackProFeatureUsage) trackProFeatureUsage('scenario_export', 'library');
    // Load the scenario first, then export
    closeScenariosModal();
    pendingLoadId = id;
    _libExportAfterLoad = true;
    confirmLoad();
  }
  var _libExportAfterLoad = false;
  function libActionShare(){
    var id = _libActionsId;
    closeLibActionsPopup();
    if(id) {
      // Track scenario share
      if(window.trackScenarioAction) trackScenarioAction('share', {id: id});
      openShareModal(id);
    }
  }
  function libActionDelete(){
    var id = _libActionsId;
    closeLibActionsPopup();
    if(id) deleteScenario(id);
  }

  async function promptLoadScenario(id){
    const scenarios = _scenariosCache || await getAllScenarios();
    const sc = scenarios.find(s => s.id === id);
    if(!sc) return;
    pendingLoadId = id;
    document.getElementById('confirm-name').textContent = sc.fullAddr;
    document.getElementById('confirm-modal').style.display='block';
    var fab=document.getElementById('mobile-calc-fab');if(fab)fab.style.display='none';
  }

  async function confirmLoad(){
    if(!pendingLoadId) return;
    const scenarios = _scenariosCache || await getAllScenarios();
    let sc = scenarios.find(s => s.id === pendingLoadId);
    if(!sc){ pendingLoadId=null; closeConfirmModal(); return; }

    // Show loading state on confirm button
    const loadBtn = document.getElementById('confirm-load-btn');
    if(loadBtn){ loadBtn._ot = loadBtn.innerHTML; loadBtn.innerHTML = '<div class="spinner-sm"></div> Loading…'; loadBtn.disabled = true; }

    // State is stored separately on the backend — fetch it if not already in cache
    if(!sc.state && ON_NETLIFY){
      try{
        if(isLoggedIn()){
          const r = await fetch('/.netlify/functions/scenarios', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({action:'getState', userId:getUserId(), id:sc.id})
          });
          if(r.ok){
            const d = await r.json();
            if(d.state) sc = Object.assign({}, sc, {state: typeof d.state==='string' ? JSON.parse(d.state) : d.state});
          }
        }
      }catch(e){ console.warn('[scenarios] getState error:', e.message); }
    }

    if(!sc.state){
      showToast('⚠️ Could not load scenario data');
      if(loadBtn){ loadBtn.innerHTML = loadBtn._ot || '✓ Yes, Load It'; loadBtn.disabled = false; }
      pendingLoadId=null; closeConfirmModal(); return;
    }
    closeConfirmModal();
    if(loadBtn){ loadBtn.innerHTML = loadBtn._ot || '✓ Yes, Load It'; loadBtn.disabled = false; }
    closeScenariosModal();
    const photo = sc.hasPhoto ? await getPhoto(sc.id) : null;
    _restoringDraft = true;
    applyScenarioState(sc.state, photo);
    _lastSavedAddr = sc.fullAddr;
    _isDirty = false;
    _forceDirty = false;
    lsDel(DRAFT_KEY);
    updateUnsavedBadge();
    // Update page title with loaded address
    var titleEl = document.getElementById('page-title');
    if(titleEl) titleEl.textContent = sc.fullAddr || 'New Property';
    showToast('✓ Loaded: ' + _escBanner(sc.fullAddr));
    if(_readOnlyMode) disableReadOnlyMode(); // exit read-only if loading own scenario
    pendingLoadId = null;
    // If triggered from library Export action, open export dialog after load
    if(_libExportAfterLoad){
      _libExportAfterLoad = false;
      setTimeout(function(){ if(window.isPro()) window.showPDFOptionsPopup(); else window.requirePro('Export'); }, 400);
    }
    // Keep _restoringDraft=true past the 800ms autosaveDraft timer (prevents dirty)
    setTimeout(function(){
      _restoringDraft = false;
      _isDirty = false;   // re-confirm clean after timers have fired
      updateUnsavedBadge();
      // Write a draft immediately so that a page refresh restores the loaded scenario
      // (without this, if the user hasn't touched any inputs, no draft exists and the
      // photo and state are lost on refresh)
      try{
        const state = collectCurrentState();
        lsSet(DRAFT_KEY, JSON.stringify({state, photo: propPhotoDataUrl||'', thumb: propThumbDataUrl||'', savedId: _lastSavedAddr||''}));
      }catch(e){}
    }, 1400);
  }

  function applyScenarioState(state, photoSrc){
    trackUsage('load_scenario');
    const {values, dynCostData, renoItemData, keyDates:kd, commsLog:cl} = state;
    const skipFields = new Set(['pd-type','pd-type-label','renoEnabled','rentEnabled']);
    Object.entries(values||{}).forEach(([id, val]) => {
      if(skipFields.has(id) || id.startsWith('rn-')) return;
      const el = document.getElementById(id);
      if(el) el.value = val;
    });
    if(values?.['pd-type-label']){
      document.querySelectorAll('.prop-type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.trim() === values['pd-type-label']);
      });
    }
    // Restore status
    if(values?.['pd-status']) setStatus(values['pd-status'], null, true);
    // Agent links
    updateAgentLinks();
    // Key dates
    if(typeof keyDates !== 'undefined'){ keyDates = Array.isArray(kd)?[...kd]:[]; renderKeyDates(); }
    // Comms log
    if(typeof commsLog !== 'undefined'){ commsLog = Array.isArray(cl)?[...cl]:[]; renderCommsLog(); }
    // Reno items (item 13)
    renoItems = [];
    if(renoItemData && renoItemData.length>0){
      renoItemData.forEach(r=>renoItems.push({id:'ri-'+renoItemId++, emoji:r.emoji||'🔨', name:r.name||'', amount:r.amount||0, note:r.note||''}));
    } else if(dynCostData && !renoItemData) {
      // legacy: old saved data had reno in dynCostData — skip (can't distinguish)
    }
    renderRenoItems();
    // Purchase costs — all dynamic now, with category support
    dynCosts = [];
    if(dynCostData) dynCostData.forEach(c => dynCosts.push({id:'dyn-'+dynId++, name:c.name||'', amount:c.amount||0, category:c.category||'purchase'}));
    renderDynCosts();
    // Restore checkboxes
    const _fhbEl = document.getElementById('inp-fhb');
    if(_fhbEl && values?.['inp-fhb-checked'] !== undefined) _fhbEl.checked = values['inp-fhb-checked'] === '1';
    const _newPropEl = document.getElementById('inp-new-prop');
    if(_newPropEl && values?.['inp-new-prop-checked'] !== undefined) _newPropEl.checked = values['inp-new-prop-checked'] === '1';
    // Reno/rent toggles
    if(typeof renoEnabled !== 'undefined'){
      const newReno = values?.['renoEnabled'] !== false;
      if(newReno !== renoEnabled){ renoEnabled=newReno; applyRenoToggle(); }
    }
    const newRent = values?.['rentEnabled'] !== false;
    applyRentToggle(newRent);

    if(photoSrc) applyPropPhoto(photoSrc); else clearPropPhoto();
    ['price','savings','depp','govt','rate','term','cont','rent','weeks','offset'].forEach(k => {
      const inp = document.getElementById('inp-'+k), rng = document.getElementById('rng-'+k);
      if(inp && rng) rng.value = inp.value;
    });
    // Refresh settle date label (not driven by recalc)
    onSettleDateChange();
    updatePropertyDetails();
    recalc();
  }

  // ── Custom Dialog System ─────────────────────────────────────────────────
  var _appDialogResolveFn = null;
  function _appDialogResolve(val){
    var overlay = document.getElementById('app-dialog-overlay');
    var input   = document.getElementById('app-dialog-input');
    overlay.style.display = 'none';
    overlay.style.alignItems = '';
    overlay.style.justifyContent = '';
    if(_appDialogResolveFn){
      var fn = _appDialogResolveFn;
      _appDialogResolveFn = null;
      fn(input && input.style.display !== 'none' && val ? (input.value || '') : val);
    }
  }
  function _appDialog(title, message, opts){
    opts = opts || {};
    return new Promise(function(resolve){
      _appDialogResolveFn = resolve;
      var overlay    = document.getElementById('app-dialog-overlay');
      var icon       = document.getElementById('app-dialog-icon');
      var titleEl    = document.getElementById('app-dialog-title');
      var msgEl      = document.getElementById('app-dialog-message');
      var inputEl    = document.getElementById('app-dialog-input');
      var cancelBtn  = document.getElementById('app-dialog-cancel');
      var confirmBtn = document.getElementById('app-dialog-confirm');
      icon.textContent    = opts.icon || (opts.danger ? '⚠️' : 'ℹ️');
      titleEl.textContent = title;
      msgEl.innerHTML     = message;
      cancelBtn.style.display  = opts.alertOnly ? 'none' : '';
      confirmBtn.textContent   = opts.confirmLabel || (opts.danger ? 'Delete' : 'OK');
      confirmBtn.className     = 'app-dialog-btn app-dialog-btn-confirm' + (opts.danger ? ' danger' : '');
      if(opts.inputType){
        inputEl.type        = opts.inputType;
        inputEl.placeholder = opts.inputPlaceholder || '';
        inputEl.value       = '';
        inputEl.style.display = '';
        setTimeout(function(){ inputEl.focus(); }, 60);
      } else {
        inputEl.style.display = 'none';
        setTimeout(function(){ confirmBtn.focus(); }, 50);
      }
      overlay.style.display        = 'flex';
      overlay.style.alignItems     = 'center';
      overlay.style.justifyContent = 'center';
    });
  }
  function appConfirm(title, message, opts){ return _appDialog(title, message, opts); }
  function appAlert(title, message, opts){ return _appDialog(title, message, Object.assign({alertOnly:true, icon:'✓'}, opts)); }
  function appPrompt(title, message, opts){ return _appDialog(title, message, Object.assign({inputType:'password'}, opts)); }

  // Focus trap — keep Tab cycling within dialog while open
  document.getElementById('app-dialog-overlay').addEventListener('keydown', function(e){
    if(e.key !== 'Tab') return;
    var box = document.getElementById('app-dialog-box');
    var focusable = box.querySelectorAll('button:not([style*="display:none"]):not([style*="display: none"]), input:not([style*="display:none"]):not([style*="display: none"])');
    if(!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if(e.shiftKey){ if(document.activeElement === first){ e.preventDefault(); last.focus(); } }
    else { if(document.activeElement === last){ e.preventDefault(); first.focus(); } }
  });

  // Close on backdrop click / Escape
  document.getElementById('app-dialog-overlay').addEventListener('click', function(e){ if(e.target===this) _appDialogResolve(false); });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape' && document.getElementById('app-dialog-overlay').style.display==='flex') _appDialogResolve(false); });

  async function deleteScenario(id){
    var ok = await appConfirm('Delete Scenario', 'Delete this scenario? This cannot be undone.', {danger:true, confirmLabel:'Delete'});
    if(!ok) return;
    // Track scenario delete
    if(window.trackScenarioAction) trackScenarioAction('delete', {id: id});
    _scenariosCache = null;
    await deleteScenarioFromBackend(id);
    updateSavedCount();
    renderScenariosList();
  }

  // ── SHARE / COLLABORATE ──────────────────────────────────────────────
  var _shareTargetId = null;

  async function openShareModal(scenarioId, e){
    if(e) e.stopPropagation();
    _shareTargetId = scenarioId;
    document.getElementById('share-email-input').value = '';
    document.getElementById('share-status').textContent = '';
    document.getElementById('share-status').style.color = '';
    document.getElementById('share-also-list').style.display = 'none';
    // Show which property is being shared
    var addrEl = document.getElementById('share-scenario-addr');
    if(addrEl){
      var sc = (_scenariosCache||[]).find(function(s){return s.id===scenarioId;});
      addrEl.textContent = sc ? sc.fullAddr : '';
    }
    document.getElementById('share-modal').style.display = 'block';
    // Load existing shares for this scenario
    try{
      if(isLoggedIn()){
        const r = await fetch('/.netlify/functions/scenarios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'getMyShares',scenarioId})});
        if(r.ok){
          const d = await r.json();
          if(d.ok && d.shares && d.shares.length){
            document.getElementById('share-also-names').textContent = d.shares.map(s=>s.name||s.email).join(', ');
            document.getElementById('share-also-list').style.display = 'block';
          }
        }
      }
    }catch(e2){}
    setTimeout(()=>document.getElementById('share-email-input').focus(),100);
  }

  function closeShareModal(){
    document.getElementById('share-modal').style.display = 'none';
    _shareTargetId = null;
  }

  async function confirmShare(){
    const email = document.getElementById('share-email-input').value.trim();
    const statusEl = document.getElementById('share-status');
    const btn = document.getElementById('share-confirm-btn');
    if(!email){ statusEl.textContent = 'Please enter an email address'; statusEl.style.color = 'var(--risk-red)'; return; }
    if(!_shareTargetId){ closeShareModal(); return; }
    btn.textContent = '⏳ Sharing…'; btn.disabled = true;
    statusEl.textContent = ''; statusEl.style.color = '';
    try{
      if(!isLoggedIn()){ statusEl.textContent = 'Please sign in to share scenarios'; statusEl.style.color='var(--risk-red)'; btn.textContent='↗ Share'; btn.disabled=false; return; }
      const r = await fetch('/.netlify/functions/scenarios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'share',scenarioId:_shareTargetId,targetEmail:email})});
      const d = await r.json();
      if(d.ok){
        if(d.invited){
          statusEl.textContent = `✉ Invite sent to ${escHtml(d.email||email)} — they'll see your scenario once they sign up`;
          statusEl.style.color = 'var(--gold)';
          document.getElementById('share-email-input').value = '';
        } else if(d.already){
          statusEl.textContent = `Already shared with ${d.name||email}`;
          statusEl.style.color = 'var(--slate)';
        } else {
          statusEl.textContent = `✓ Shared with ${d.name||email}`;
          statusEl.style.color = 'var(--reward-green)';
          document.getElementById('share-email-input').value = '';
          // Refresh existing shares list
          const namesEl = document.getElementById('share-also-names');
          const cur = namesEl.textContent ? namesEl.textContent+', ' : '';
          namesEl.textContent = cur + (d.name||email);
          document.getElementById('share-also-list').style.display = 'block';
        }
      } else {
        statusEl.textContent = d.error || 'Failed to share';
        statusEl.style.color = 'var(--risk-red)';
      }
    }catch(err){
      statusEl.textContent = 'Network error — try again';
      statusEl.style.color = 'var(--risk-red)';
    }
    btn.textContent = '↗ Share'; btn.disabled = false;
  }

  async function loadSharedWithMe(){
    try{
      if(!isLoggedIn()) return;
      const r = await fetch('/.netlify/functions/scenarios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'getSharedWithMe'})});
      if(!r.ok) return;
      const d = await r.json();
      if(d.ok && d.items && d.items.length) _renderSharedSection(d.items);
    }catch(e){}
  }

  function _renderSharedSection(items){
    const section = document.getElementById('shared-section');
    const grid = document.getElementById('shared-grid');
    const countEl = document.getElementById('shared-count');
    if(!section||!grid) return;
    if(!items||!items.length){ section.style.display='none'; return; }
    countEl.textContent = '('+items.length+')';
    section.style.display = 'block';
    const rows = items.map(s => {
      const thumbSrc = s.thumb && /^(https?:\/\/|data:image\/)/.test(s.thumb) ? escHtml(s.thumb) : '';
      const thumbHtml = thumbSrc ? `<img src="${thumbSrc}" style="width:100%;height:100%;object-fit:cover;border-radius:3px;">` : '<span style="font-size:24px;">🏠</span>';
      const oid = escHtml(s.ownerId); const sid = escHtml(s.scenarioId);
      return `<div class="lib-row" data-action="load-shared" data-oid="${oid}" data-sid="${sid}" data-addr="${escHtml(s.fullAddr||'')}">
        <div class="lib-thumb">${thumbHtml}</div>
        <div class="lib-info">
          <div class="lib-addr">${escHtml(s.fullAddr||'Shared property')}</div>
          <div class="lib-meta" style="font-size:11px;color:var(--slate);">Shared by ${escHtml(s.ownerName||s.ownerEmail||'someone')}</div>
        </div>
        <div class="lib-shared-badge">Shared</div>
        <button class="lib-del" data-action="dismiss-shared" data-oid="${oid}" data-sid="${sid}" title="Remove from my list">✕</button>
      </div>`;
    });
    grid.innerHTML = rows.join('');
  }

  var _pendingShared = null;

  async function promptLoadSharedScenario(ownerId, scenarioId, fullAddr){
    _pendingShared = {ownerId, scenarioId};
    document.getElementById('confirm-name').textContent = fullAddr || 'this shared property';
    document.getElementById('confirm-modal').style.display = 'block';
    var fab=document.getElementById('mobile-calc-fab');if(fab)fab.style.display='none';
  }

  async function confirmLoadShared(){
    if(!_pendingShared) return;
    const {ownerId, scenarioId} = _pendingShared;
    _pendingShared = null;
    // Show loading state on confirm button
    const loadBtn = document.getElementById('confirm-load-btn');
    if(loadBtn){ loadBtn._ot = loadBtn.innerHTML; loadBtn.innerHTML = '<div class="spinner-sm"></div> Loading…'; loadBtn.disabled = true; }
    try{
      if(!isLoggedIn()){
        if(loadBtn){ loadBtn.innerHTML = loadBtn._ot || '✓ Yes, Load It'; loadBtn.disabled = false; }
        closeConfirmModal(); showToast('⚠️ Please sign in'); return;
      }
      const r = await fetch('/.netlify/functions/scenarios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'getSharedState',ownerId,scenarioId})});
      const d = await r.json();
      if(!d.ok){
        if(loadBtn){ loadBtn.innerHTML = loadBtn._ot || '✓ Yes, Load It'; loadBtn.disabled = false; }
        closeConfirmModal(); showToast('⚠️ '+(d.error||'Could not load shared scenario')); return;
      }
      const state = typeof d.state==='string' ? JSON.parse(d.state) : d.state;
      if(!state){
        if(loadBtn){ loadBtn.innerHTML = loadBtn._ot || '✓ Yes, Load It'; loadBtn.disabled = false; }
        closeConfirmModal(); showToast('⚠️ Shared scenario has no data'); return;
      }
      closeConfirmModal();
      if(loadBtn){ loadBtn.innerHTML = loadBtn._ot || '✓ Yes, Load It'; loadBtn.disabled = false; }
      closeScenariosModal();
      _restoringDraft = true;
      applyScenarioState(state, d.photo||null);
      _lastSavedAddr = null; // not owned by this user — don't auto-save over it
      _isDirty = false; _forceDirty = false;
      updateUnsavedBadge();
      // Update page title for shared scenario
      var addr = state.values?.['pd-address'] || '';
      var titleEl = document.getElementById('page-title');
      if(titleEl) titleEl.textContent = addr || 'Shared Scenario';
      showToast('✓ Loaded shared scenario (read-only view)');
      setTimeout(()=>{ _restoringDraft=false; _isDirty=false; updateUnsavedBadge(); }, 1400);
    }catch(err){
      if(loadBtn){ loadBtn.innerHTML = loadBtn._ot || '✓ Yes, Load It'; loadBtn.disabled = false; }
      closeConfirmModal();
      showToast('⚠️ Network error loading shared scenario');
    }
  }

  async function dismissSharedScenario(ownerId, scenarioId){
    try{
      if(!isLoggedIn()) return;
      await fetch('/.netlify/functions/scenarios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'dismissShared',ownerId,scenarioId})});
      loadSharedWithMe(); // refresh
    }catch(e){}
  }

  // ── Read-only mode (admin viewing another user's scenario) ─────────────────
  var _readOnlyMode = false;

  function enableReadOnlyMode(){
    _readOnlyMode = true;
    // Disable all inputs, selects, textareas, range sliders
    document.querySelectorAll('.sidebar input, .sidebar select, .sidebar textarea, .sidebar input[type="range"], main input, main select, main textarea').forEach(function(el){
      el.setAttribute('data-ro-disabled', el.disabled ? '1' : '0');
      el.disabled = true;
      el.style.opacity = '0.6';
      el.style.pointerEvents = 'none';
    });
    // Disable buttons that modify state (save, delete, share, add cost, add reno, etc.)
    document.querySelectorAll('.sidebar button, #save-btn, #save-btn-top, .add-cost-btn, #add-reno-btn, #add-key-date-btn, #add-comms-btn, .prop-type-btn, .status-option').forEach(function(el){
      el.setAttribute('data-ro-disabled', el.disabled ? '1' : '0');
      el.disabled = true;
      el.style.opacity = '0.6';
      el.style.pointerEvents = 'none';
    });
    // Show read-only banner
    var banner = document.getElementById('readonly-banner');
    if(!banner){
      banner = document.createElement('div');
      banner.id = 'readonly-banner';
      banner.style.cssText = 'position:fixed;top:var(--hdr-h-desktop,56px);left:0;right:0;z-index:200;background:var(--sky);color:white;font-family:"DM Mono",monospace;font-size:11px;text-align:center;padding:6px 12px;letter-spacing:0.5px;';
      banner.innerHTML = '🔒 READ-ONLY — Viewing another user\'s scenario <button id="exit-readonly-btn" style="margin-left:12px;background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);color:white;padding:3px 10px;border-radius:3px;cursor:pointer;font-family:inherit;font-size:10px;">Exit</button>';
      document.body.appendChild(banner);
      document.getElementById('exit-readonly-btn').addEventListener('click', disableReadOnlyMode);
    } else {
      banner.style.display = 'block';
    }
  }

  function disableReadOnlyMode(){
    _readOnlyMode = false;
    // Re-enable all inputs
    document.querySelectorAll('[data-ro-disabled]').forEach(function(el){
      var wasDis = el.getAttribute('data-ro-disabled') === '1';
      el.disabled = wasDis;
      el.style.opacity = '';
      el.style.pointerEvents = '';
      el.removeAttribute('data-ro-disabled');
    });
    // Hide banner
    var banner = document.getElementById('readonly-banner');
    if(banner) banner.style.display = 'none';
  }

  // ── Admin: All Users' Scenarios ────────────────────────────────────────────
  var _adminAllCache = []; // [{userId, userEmail, userName, scenarios:[...]}]
  var _adminViewAllEnabled = false; // set by applyFeatureFlags

  async function loadAdminAllScenarios(){
    if(!_currentUser||_currentUser.role!=='admin') return;
    // Check both the flag (set by applyFeatureFlags) and localStorage fallback
    if(!_adminViewAllEnabled){
      try{ var cfg=JSON.parse(localStorage.getItem('propCalc_siteConfig_v1')||'{}'); if(!cfg.adminViewAllScenarios) return; }catch(e){ return; }
    }
    try{
      if(!isLoggedIn()) return;
      const r=await fetch('/.netlify/functions/scenarios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'adminListAllScenarios'})});
      if(!r.ok) return;
      const d=await r.json();
      if(d.ok&&d.groups) { _adminAllCache=d.groups; _renderAdminAllSection(d.groups); }
    }catch(e){}
  }

  function _renderAdminAllSection(groups){
    const section=document.getElementById('admin-all-section');
    const grid=document.getElementById('admin-all-grid');
    const countEl=document.getElementById('admin-all-count');
    if(!section||!grid) return;
    // Re-check flag — applyFeatureFlags may have disabled it while fetch was in-flight
    if(!_adminViewAllEnabled){ section.style.display='none'; return; }
    // Filter out admin's own scenarios (they're already in the main grid)
    const myId=_currentUser&&_currentUser.id;
    const others=groups.filter(g=>g.userId!==myId);
    const total=others.reduce((n,g)=>n+g.scenarios.length,0);
    if(!total){ section.style.display='none'; return; }
    if(countEl) countEl.textContent='('+total+')';
    section.style.display='block';
    var html='';
    others.forEach(function(g){
      html+='<div style="font-family:\'DM Mono\',monospace;font-size:10px;letter-spacing:0.5px;color:rgba(91,143,171,0.7);padding:10px 0 4px;margin-top:8px;">'+escHtml(g.userEmail)+(g.userName?' — '+escHtml(g.userName):'')+' <span style="opacity:0.5;">('+g.scenarios.length+')</span></div>';
      var sorted=[...g.scenarios].sort(function(a,b){return (b.savedAt||0)-(a.savedAt||0);});
      sorted.forEach(function(s){
        var price=s.price?'$'+parseInt(s.price).toLocaleString():'—';
        var stats=[s.type||'House',s.bed?s.bed+' bed':null,s.bath?s.bath+' bath':null,s.car?s.car+' car':null].filter(Boolean).join(' · ');
        var status=s.status||'browsing';
        var sColor=STATUS_COLORS[status]||'#999';
        var sLabel=STATUS_LABELS[status]||'👀';
        var thumbSrc=s.thumb&&/^(https?:\/\/|data:image\/)/.test(s.thumb)?escHtml(s.thumb):'';
        var thumbHtml=thumbSrc?'<img src="'+thumbSrc+'" style="width:100%;height:100%;object-fit:cover;border-radius:3px;">':'<span style="font-size:24px;">🏠</span>';
        html+='<div class="lib-row" data-action="load-admin-scenario" data-uid="'+escHtml(g.userId)+'" data-sid="'+escHtml(s.id)+'" data-addr="'+escHtml(s.fullAddr||'')+'">';
        html+='<div class="lib-thumb">'+thumbHtml+'</div>';
        html+='<div class="lib-info"><div class="lib-addr">'+escHtml(s.fullAddr||'Unnamed')+'</div><div class="lib-meta">'+escHtml(stats)+'</div></div>';
        html+='<div class="lib-price">'+price+'</div>';
        html+='<div class="lib-badge" style="background:'+sColor+'22;color:'+sColor+';border:1px solid '+sColor+'55;">'+sLabel+'</div>';
        html+='<div class="lib-shared-badge" style="background:rgba(91,143,171,0.1);color:var(--sky);border-color:rgba(91,143,171,0.25);">Read-only</div>';
        html+='</div>';
      });
    });
    grid.innerHTML=html;
  }

  var _pendingAdminScenario=null;

  function promptLoadAdminScenario(userId,scenarioId,fullAddr){
    _pendingAdminScenario={userId:userId,scenarioId:scenarioId};
    document.getElementById('confirm-name').textContent=fullAddr||'this user\'s scenario';
    document.getElementById('confirm-modal').style.display='block';
    var fab=document.getElementById('mobile-calc-fab');if(fab)fab.style.display='none';
  }

  async function confirmLoadAdminScenario(){
    if(!_pendingAdminScenario) return;
    var uid=_pendingAdminScenario.userId;
    var sid=_pendingAdminScenario.scenarioId;
    _pendingAdminScenario=null;
    var loadBtn=document.getElementById('confirm-load-btn');
    if(loadBtn){loadBtn._ot=loadBtn.innerHTML;loadBtn.innerHTML='<div class="spinner-sm"></div> Loading…';loadBtn.disabled=true;}
    try{
      if(!isLoggedIn()){if(loadBtn){loadBtn.innerHTML=loadBtn._ot||'✓ Yes, Load It';loadBtn.disabled=false;}closeConfirmModal();return;}
      var r=await fetch('/.netlify/functions/scenarios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'adminGetScenarioState',userId:uid,id:sid})});
      var d=await r.json();
      if(!d.ok){if(loadBtn){loadBtn.innerHTML=loadBtn._ot||'✓ Yes, Load It';loadBtn.disabled=false;}closeConfirmModal();showToast('⚠️ '+(d.error||'Could not load scenario'));return;}
      var state=typeof d.state==='string'?JSON.parse(d.state):d.state;
      if(!state){if(loadBtn){loadBtn.innerHTML=loadBtn._ot||'✓ Yes, Load It';loadBtn.disabled=false;}closeConfirmModal();showToast('⚠️ Scenario has no saved state');return;}
      closeConfirmModal();
      if(loadBtn){loadBtn.innerHTML=loadBtn._ot||'✓ Yes, Load It';loadBtn.disabled=false;}
      closeScenariosModal();
      _restoringDraft=true;
      applyScenarioState(state,d.photo||null);
      _lastSavedAddr=null; // read-only — don't auto-save over it
      _isDirty=false;_forceDirty=false;
      updateUnsavedBadge();
      var addr=state.values&&state.values['pd-address']||'';
      var titleEl=document.getElementById('page-title');
      if(titleEl) titleEl.textContent=addr||'Scenario (read-only)';
      showToast('✓ Loaded scenario (read-only view)');
      setTimeout(function(){_restoringDraft=false;_isDirty=false;updateUnsavedBadge();enableReadOnlyMode();},1400);
    }catch(e){
      if(loadBtn){loadBtn.innerHTML=loadBtn._ot||'✓ Yes, Load It';loadBtn.disabled=false;}
      closeConfirmModal();showToast('⚠️ Network error');
    }
  }

  function updateUnsavedBadge(){
    const badge = document.getElementById('unsaved-badge');
    if(!badge) return;
    const price = v('inp-price');
    const addr  = document.getElementById('pd-address')?.value?.trim() || '';
    const hasContent = price > 0 || addr.length > 0;
    if(hasContent && _isDirty){
      badge.style.display = 'inline-flex';
      badge.title = 'You have unsaved changes — click Save to preserve them';
    } else {
      badge.style.display = 'none';
    }
  }

  // beforeunload dialog removed — saving is automatic

  function showToast(msg, duration){
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;background:var(--charcoal);color:var(--gold);font-family:"DM Mono",monospace;font-size:11px;padding:10px 16px;border-radius:3px;border:1px solid rgba(201,168,76,0.3);z-index:9999;letter-spacing:0.5px;box-shadow:0 4px 20px rgba(0,0,0,0.3);transition:opacity 0.8s;';
    // Use innerHTML so callers can embed anchor links (all toast messages are hardcoded, not user data)
    t.innerHTML = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 800); }, duration || 3500);
  }

  // ── RENO TOGGLE ──
  let renoEnabled = true;
  function toggleReno(){
    renoEnabled = !renoEnabled;
    applyRenoToggle();
    recalc();
  }
  function applyRenoToggle(){
    const knob = document.getElementById('reno-toggle-knob');
    const track = document.getElementById('reno-toggle');
    const section = document.getElementById('reno-sidebar-section');
    const tab = document.getElementById('tab-reno-btn');
    if(renoEnabled){
      if(knob) knob.style.left = '20px';
      if(track){ track.style.background = 'var(--sage)'; track.setAttribute('aria-checked', 'true'); }
      if(section) section.style.display = '';
      if(tab) tab.style.display = '';
    } else {
      if(knob) knob.style.left = '2px';
      if(track){ track.style.background = 'rgba(255,255,255,0.15)'; track.setAttribute('aria-checked', 'false'); }
      if(section) section.style.display = 'none';
      if(tab){ tab.style.display = 'none'; showTab('costs', document.querySelector('.tab[data-tab="costs"]')); }
    }
  }

  // ── RENT OVERLAP TOGGLE (item 12) ──
  let rentEnabled = true;
  let riskEnabled = true;
  function toggleRisk(){
    riskEnabled = !riskEnabled;
    const tog = document.getElementById('risk-toggle');
    const knob = document.getElementById('risk-toggle-knob');
    const tabBtn = document.getElementById('tab-risks-btn');
    if(tog){ tog.style.background = riskEnabled ? 'var(--terracotta)' : 'rgba(255,255,255,0.15)'; tog.setAttribute('aria-checked', String(riskEnabled)); }
    if(knob) knob.style.left = riskEnabled ? '20px' : '2px';
    if(tabBtn) tabBtn.style.display = riskEnabled ? '' : 'none';
    if(!riskEnabled){ const active = document.querySelector('.tab.active'); if(active && active.id==='tab-risks-btn') showTab('property', document.querySelector('.tab')); }
  }
  function toggleRent(){
    rentEnabled = !rentEnabled;
    applyRentToggle(rentEnabled);
    recalc();
  }
  function applyRentToggle(enabled){
    rentEnabled = enabled;
    const knob = document.getElementById('rent-toggle-knob');
    const track = document.getElementById('rent-toggle');
    const section = document.getElementById('rent-sidebar-section');
    const tab = document.querySelector('.tab[data-tab="overlap"]');
    if(enabled){
      if(knob) knob.style.left = '20px';
      if(track){ track.style.background = 'var(--sky)'; track.setAttribute('aria-checked', 'true'); }
      if(section) section.style.display = '';
      if(tab) tab.style.display = '';
    } else {
      if(knob) knob.style.left = '2px';
      if(track){ track.style.background = 'rgba(255,255,255,0.15)'; track.setAttribute('aria-checked', 'false'); }
      if(section) section.style.display = 'none';
      if(tab){ tab.style.display = 'none'; }
      // Redirect away from overlap tab if currently active
      const active = document.querySelector('.tab.active');
      if(active && active.dataset.tab === 'overlap') showTab('costs', document.querySelector('.tab[data-tab="costs"]'));
    }
  }

  // ── SETTLEMENT DATE ──
  function onSettleDateChange(){
    const el = document.getElementById('inp-settle-date');
    const lbl = document.getElementById('lbl-settle-date');
    if(el && el.value){
      // Parse as local time (append T00:00:00) to avoid UTC offset flipping the year/day
      const yr = parseInt(el.value.split('-')[0], 10);
      if(lbl) lbl.textContent = yr;
    } else {
      if(lbl) lbl.textContent = '';
    }
    drawProjection();
    autosaveDraft();
  }
  function getSettleYear(){
    const el = document.getElementById('inp-settle-date');
    if(!el || !el.value) return null;
    return parseInt(el.value.split('-')[0], 10);
  }

  // ── PROJECTION (items 6,7,8,9) ──
  let projData = []; // shared so tooltip can read it
  let projDataExtra = []; // early-payoff scenario
  let projDataOffset = []; // offset account scenario

  function drawProjection(){
    const price   = v('inp-price'); if(!price) return;
    const loanAmt = Math.max(0, price - price*v('inp-depp')/100 - price*v('inp-govt')/100);
    const rate    = v('inp-rate');
    const term    = v('inp-term');
    const govtPct = v('inp-govt') / 100;
    const growthPct = parseFloat(document.getElementById('proj-growth').value) / 100;
    const years   = 30;
    const totalQ  = years * 4; // 120 quarters — item #8
    const monthly = calcMonthly(loanAmt, rate, term);
    const mRate   = rate / 100 / 12;

    // ── Build quarterly data (item #8: quarterly instead of annually) ──
    projData = [];
    let loanBal = loanAmt;
    for(let q = 0; q <= totalQ; q++){
      const yr      = q / 4;
      const baseVal = price * Math.pow(1 + growthPct, yr);
      const govtOwed = baseVal * govtPct;
      if(q > 0){
        // advance 3 months per quarter
        for(let m = 0; m < 3; m++){
          const interest = loanBal * mRate;
          loanBal = Math.max(0, loanBal - (monthly - interest));
        }
      }
      projData.push({ q, yr, baseVal, renoVal: baseVal, loanBal: Math.max(0, loanBal), govtOwed, yourEquity: baseVal - loanBal - govtOwed });
    }

    // ── Build early-payoff data (item #9) ──
    const extraPayment = parseFloat(document.getElementById('proj-extra-payment')?.value || '0') || 0;
    projDataExtra = [];
    let loanBalExtra = loanAmt;
    let extraStdInterest = 0, extraTotalInterest = 0;
    let extraPaidOffQ = null;
    for(let q = 0; q <= totalQ; q++){
      if(q > 0){
        for(let m = 0; m < 3; m++){
          const int1 = Math.max(0, loanBal) * mRate; // reuse standard (unused here, just for savings calc)
          const int2 = loanBalExtra * mRate;
          loanBalExtra = Math.max(0, loanBalExtra - (monthly + extraPayment - int2));
          extraTotalInterest += int2;
        }
      }
      if(loanBalExtra <= 0.01 && extraPaidOffQ === null) extraPaidOffQ = q;
      projDataExtra.push({ q, yr: q/4, loanBal: Math.max(0, loanBalExtra) });
    }
    // Standard total interest
    let stdBal = loanAmt, stdTotalInterest = 0;
    for(let m = 0; m < term * 12; m++){
      const int = stdBal * mRate;
      stdBal = Math.max(0, stdBal - (monthly - int));
      stdTotalInterest += int;
    }
    const interestSaved = Math.max(0, stdTotalInterest - extraTotalInterest);
    const stdPayoffQ    = projData.find(d => d.loanBal <= 0.01)?.q ?? totalQ;
    const timeSavedQ    = Math.max(0, stdPayoffQ - (extraPaidOffQ ?? totalQ));

    // ── Build offset account data ──
    const offsetBal = parseFloat(document.getElementById('inp-offset')?.value || '0') || 0;
    projDataOffset = [];
    var offsetPaidOffQ = null;
    var offsetTotalInterest = 0;
    if(offsetBal > 0){
      let loanBalOff = loanAmt;
      for(let q = 0; q <= totalQ; q++){
        if(q > 0){
          for(let m = 0; m < 3; m++){
            const effBal = Math.max(0, loanBalOff - offsetBal);
            const interest = effBal * mRate;
            offsetTotalInterest += interest;
            const principal = monthly - interest;
            loanBalOff = Math.max(0, loanBalOff - principal);
          }
        }
        if(loanBalOff <= 0.01 && offsetPaidOffQ === null) offsetPaidOffQ = q;
        projDataOffset.push({ q, yr: q/4, loanBal: Math.max(0, loanBalOff) });
      }
    }
    const offsetInterestSaved = offsetBal > 0 ? Math.max(0, stdTotalInterest - offsetTotalInterest) : 0;
    const offsetTimeSavedQ = offsetBal > 0 ? Math.max(0, stdPayoffQ - (offsetPaidOffQ ?? totalQ)) : 0;

    // Update early payoff results panel
    const epResult = document.getElementById('early-payoff-result');
    if(epResult){
      if(extraPayment > 0 && timeSavedQ > 0){
        const savedYrs = Math.floor(timeSavedQ / 4);
        const savedMos = Math.round((timeSavedQ % 4) * 3);
        const timeStr = savedYrs > 0 ? `${savedYrs} yr${savedYrs!==1?'s':''} ${savedMos > 0 ? savedMos+' mo':''}`.trim() : `${savedMos} months`;
        epResult.innerHTML = `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div style="background:rgba(90,158,123,0.08);border:1px solid rgba(90,158,123,0.2);border-radius:6px;padding:12px 14px;">
              <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--slate);margin-bottom:5px;">Time Saved</div>
              <div style="font-family:'DM Mono',monospace;font-size:22px;font-weight:600;color:var(--reward-green);">${timeStr}</div>
            </div>
            <div style="background:rgba(90,158,123,0.08);border:1px solid rgba(90,158,123,0.2);border-radius:6px;padding:12px 14px;">
              <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--slate);margin-bottom:5px;">Interest Saved</div>
              <div style="font-family:'DM Mono',monospace;font-size:22px;font-weight:600;color:var(--reward-green);">${fmtK(interestSaved)}</div>
            </div>
          </div>`;
        epResult.style.display = 'block';
      } else if(extraPayment > 0){
        epResult.innerHTML = `<div style="font-size:12px;color:var(--slate);font-style:italic;">Loan already paid off within standard term — no additional saving.</div>`;
        epResult.style.display = 'block';
      } else {
        epResult.style.display = 'none';
      }
    }

    // ── Offset result panel ──
    const offsetCard = document.getElementById('proj-offset-card');
    if(offsetCard) offsetCard.style.display = offsetBal > 0 ? '' : 'none';
    set('proj-offset-lbl', fmt(offsetBal));
    const offsetResult = document.getElementById('proj-offset-result');
    if(offsetResult){
      if(offsetBal > 0 && offsetInterestSaved > 100){
        const oSavedYrs = Math.floor(offsetTimeSavedQ / 4);
        const oSavedMos = Math.round((offsetTimeSavedQ % 4) * 3);
        const oTimeStr = oSavedYrs > 0 ? `${oSavedYrs} yr${oSavedYrs!==1?'s':''} ${oSavedMos>0?oSavedMos+' mo':''}`.trim() : `${oSavedMos} months`;
        offsetResult.innerHTML = `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;">
            <div style="background:rgba(91,143,171,0.08);border:1px solid rgba(91,143,171,0.2);border-radius:6px;padding:12px 14px;">
              <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--slate);margin-bottom:5px;">Loan Paid Off Sooner</div>
              <div style="font-family:'DM Mono',monospace;font-size:22px;font-weight:600;color:var(--sky);">${oTimeStr}</div>
            </div>
            <div style="background:rgba(91,143,171,0.08);border:1px solid rgba(91,143,171,0.2);border-radius:6px;padding:12px 14px;">
              <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--slate);margin-bottom:5px;">Interest Saved</div>
              <div style="font-family:'DM Mono',monospace;font-size:22px;font-weight:600;color:var(--sky);">${fmtK(offsetInterestSaved)}</div>
            </div>
          </div>`;
        offsetResult.style.display = 'block';
      } else { offsetResult.style.display = 'none'; }
    }

    // ── Legend visibility ──
    const _lgGovt = document.getElementById('proj-legend-govt');
    if(_lgGovt) _lgGovt.style.display = govtPct > 0 ? 'flex' : 'none';
    const _lgExtra = document.getElementById('proj-legend-extra');
    if(_lgExtra) _lgExtra.style.display = extraPayment > 0 ? 'flex' : 'none';
    const _lgOffset = document.getElementById('proj-legend-offset');
    if(_lgOffset) _lgOffset.style.display = offsetBal > 0 ? 'flex' : 'none';

    // ── Settlement year label helpers ──
    const settleYr = getSettleYear();
    const fmtQLabel = (q) => {
      if(q === undefined || q === null) return '—';
      const wholeYr = Math.floor(q / 4);
      const qNum    = q % 4;
      const qStr    = qNum > 0 ? ` Q${qNum + 1}` : '';
      return settleYr ? `${settleYr + wholeYr}${qStr}` : `Year ${wholeYr}${qStr}`;
    };
    const yrLabel = (yr) => settleYr ? String(settleYr + yr) : `Yr ${yr}`;

    // ── MILESTONE TILES ──
    const payoffPoint = projData.find(d => d.loanBal <= 0.01);
    const payoffQ     = payoffPoint?.q;
    const buyoutPoint = projData.find(d => d.yourEquity >= d.govtOwed && d.q > 0);
    const buyoutQ     = buyoutPoint?.q;
    const payoffYr    = payoffPoint?.yr;
    const buyoutYr    = buyoutPoint?.yr;

    const payEl = document.getElementById('proj-payoff-yr');
    if(payEl) payEl.textContent = payoffQ != null ? fmtQLabel(payoffQ) : (term < 30 ? `Year ${term}` : '30+ yrs');
    const buyEl = document.getElementById('proj-buyout-yr');
    if(buyEl){
      if(govtPct <= 0){
        buyEl.textContent = 'No scheme';
        buyEl.closest('.tile').style.opacity = '0.4';
      } else {
        buyEl.textContent = buyoutQ != null ? fmtQLabel(buyoutQ) : '30+ yrs';
        buyEl.closest('.tile').style.opacity = '';
      }
    }

    const d5 = projData[Math.min(20, projData.length - 1)]; // q=20 = year 5
    set('proj-val-5', fmtK(d5.baseVal));
    const govt5El = document.getElementById('proj-govt-5');
    if(govt5El){
      if(govtPct <= 0){
        govt5El.textContent = 'No scheme';
        govt5El.closest('.tile').style.opacity = '0.4';
      } else {
        govt5El.textContent = fmtK(d5.govtOwed);
        govt5El.closest('.tile').style.opacity = '';
      }
    }
    const val5lbl = document.getElementById('proj-tiles')?.querySelectorAll('.tile-lbl');
    if(val5lbl && settleYr){
      if(val5lbl[2]) val5lbl[2].textContent = `Property Value @ ${settleYr + 5}`;
      if(val5lbl[3]) val5lbl[3].textContent = `Govt Equity Owed @ ${settleYr + 5}`;
    }

    // ── MILESTONES TIMELINE ──
    const msEl = document.getElementById('proj-milestones');
    if(msEl){
      const ms = [];
      ms.push({ q:0, color:'var(--gold)', label:`Settlement${settleYr?' — '+settleYr:''}`, desc:`Purchase price ${fmtK(price)} · Loan ${fmtK(loanAmt)} · Govt equity ${fmtK(price*govtPct)}` });
      if(buyoutQ != null){ const d=projData[buyoutQ]; ms.push({ q:buyoutQ, color:'var(--sage)', label:'Can Refinance/Buy Out Govt', desc:`Property ~${fmtK(d.baseVal)} · Govt owed ~${fmtK(d.govtOwed)} · Your equity ~${fmtK(d.yourEquity)}` }); }
      const halfQ = projData.find(d => d.loanBal <= loanAmt * 0.5 && d.q > 0)?.q;
      if(halfQ != null){ const d=projData[halfQ]; ms.push({ q:halfQ, color:'var(--sky)', label:'Loan 50% Paid Off', desc:`Loan balance ~${fmtK(d.loanBal)} · Property ~${fmtK(d.baseVal)}` }); }
      if(payoffQ != null && payoffQ <= totalQ) ms.push({ q:payoffQ, color:'var(--reward-green)', label:'Loan Fully Paid Off 🎉', desc:`Property ~${fmtK(projData[payoffQ].baseVal)} · Full equity achieved` });
      if(extraPayment > 0 && extraPaidOffQ != null && extraPaidOffQ < (payoffQ ?? totalQ)) ms.push({ q:extraPaidOffQ, color:'#9B7FE8', label:`Paid Off Early (+$${extraPayment}/mo) 🚀`, desc:`${fmtQLabel(extraPaidOffQ)} · Save ${fmtK(interestSaved)} in interest` });
      const last = projData[totalQ]; ms.push({ q:totalQ, color:'var(--terracotta)', label:`${yrLabel(30)} — End of Projection`, desc:`Est. value ${fmtK(last.baseVal)} · Est. govt equity owed ${fmtK(last.govtOwed)}` });
      msEl.innerHTML = ms.sort((a,b)=>a.q-b.q).map(m=>`
        <div class="tli">
          <div class="tld" style="color:${m.color}"></div>
          <div class="tlp" style="color:${m.color}">${fmtQLabel(m.q)}</div>
          <div class="tlt">${m.label}</div>
          <div class="tldesc">${m.desc}</div>
        </div>`).join('');
    }

    // ── SVG CHART ──
    const svg = document.getElementById('proj-chart');
    if(!svg) return;
    const container = svg.parentElement;
    const W = container ? Math.max(300, container.clientWidth || 700) : 700;
    const H = Math.round(W * 0.375);
    const padL=64, padR=16, padT=18, padB=36;
    const cW=W-padL-padR, cH=H-padT-padB;
    const maxVal = Math.max(...projData.map(d=>d.baseVal)) * 1.08;
    const scaleX = yr => padL + (yr / years) * cW;
    const scaleY = val => padT + cH - (val / maxVal) * cH;

    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.display = 'block'; svg.style.position = 'absolute'; svg.style.inset = '0';
    let html = '';

    // Y grid lines
    for(let p = 0; p <= 4; p++){
      const val = maxVal * p / 4, y = scaleY(val);
      html += `<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="rgba(28,28,30,0.07)" stroke-width="1"/>`;
      html += `<text x="${padL-6}" y="${y+4}" text-anchor="end" font-family="DM Mono" font-size="9" fill="#999">${fmtK(val)}</text>`;
    }
    // X axis labels (years)
    [0,5,10,15,20,25,30].forEach(yr => {
      html += `<text x="${scaleX(yr)}" y="${H-padB+16}" text-anchor="middle" font-family="DM Mono" font-size="9" fill="#999">${yrLabel(yr)}</text>`;
    });

    // Shaded equity area
    const topPts = projData.map(d=>`${scaleX(d.yr).toFixed(1)},${scaleY(d.baseVal).toFixed(1)}`).join(' ');
    const botPts = [...projData].reverse().map(d=>`${scaleX(d.yr).toFixed(1)},${scaleY(Math.max(d.loanBal+d.govtOwed,0)).toFixed(1)}`).join(' ');
    html += `<polygon points="${topPts} ${botPts}" fill="rgba(90,158,123,0.09)"/>`;

    // Helper to build an SVG path from any data array using a value key
    const mkPath = (dataArr, key, color, dash='', width=2.5) => {
      const pts = dataArr.map((d, i) => `${i===0?'M':'L'}${scaleX(d.yr).toFixed(1)},${scaleY(d[key]).toFixed(1)}`).join(' ');
      return `<path d="${pts}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${dash?` stroke-dasharray="${dash}"`:''}/>`;
    };
    html += mkPath(projData, 'baseVal',  '#C9A84C');
    html += mkPath(projData, 'loanBal',  '#5B8FAB', '6 3');
    html += mkPath(projData, 'govtOwed', '#C4704A');

    // Early payoff line — only draw if extra payment is set
    if(extraPayment > 0) html += mkPath(projDataExtra, 'loanBal', '#9B7FE8', '5 2', 2.2);
    // Offset account line — dashed sky blue, drawn on top of standard loan line
    if(offsetBal > 0 && projDataOffset.length) html += mkPath(projDataOffset, 'loanBal', '#5B8FAB', '3 2', 2.0);

    // Milestone markers
    if(payoffQ != null && payoffQ <= totalQ){ const d=projData[payoffQ]; html+=`<circle cx="${scaleX(d.yr)}" cy="${scaleY(d.loanBal)}" r="5" fill="#5A9E7B" stroke="white" stroke-width="2"/><text x="${scaleX(d.yr)}" y="${scaleY(d.loanBal)-9}" text-anchor="middle" font-family="DM Mono" font-size="8" fill="#5A9E7B">PAID OFF</text>`; }
    if(buyoutQ != null && buyoutQ <= totalQ){ const d=projData[buyoutQ]; html+=`<circle cx="${scaleX(d.yr)}" cy="${scaleY(d.baseVal)}" r="5" fill="#7B9E87" stroke="white" stroke-width="2"/><text x="${scaleX(d.yr)}" y="${scaleY(d.baseVal)-9}" text-anchor="middle" font-family="DM Mono" font-size="8" fill="#7B9E87">BUY OUT</text>`; }
    if(extraPayment > 0 && extraPaidOffQ != null){ const d=projDataExtra[extraPaidOffQ]; html+=`<circle cx="${scaleX(d.yr)}" cy="${scaleY(d.loanBal)}" r="5" fill="#9B7FE8" stroke="white" stroke-width="2"/><text x="${scaleX(d.yr)}" y="${scaleY(d.loanBal)-9}" text-anchor="middle" font-family="DM Mono" font-size="8" fill="#9B7FE8">EARLY 🚀</text>`; }
    if(offsetBal > 0 && offsetPaidOffQ != null && projDataOffset[offsetPaidOffQ]){ const d=projDataOffset[offsetPaidOffQ]; html+=`<circle cx="${scaleX(d.yr)}" cy="${scaleY(d.loanBal)}" r="5" fill="#5B8FAB" stroke="white" stroke-width="2"/><text x="${scaleX(d.yr)}" y="${scaleY(d.loanBal)-9}" text-anchor="middle" font-family="DM Mono" font-size="8" fill="#5B8FAB">OFFSET OFF</text>`; }

    // Hit overlay — passes totalQ so hover snaps to quarters
    html += `<rect id="proj-hit" x="${padL}" y="${padT}" width="${cW}" height="${cH}" fill="transparent" style="cursor:crosshair;"/>`;
    html += `<line id="proj-crosshair" x1="0" y1="${padT}" x2="0" y2="${H-padB}" stroke="rgba(201,168,76,0.5)" stroke-width="1" stroke-dasharray="3 2" style="display:none;pointer-events:none;"/>`;

    svg.innerHTML = html;
    // Attach chart interaction listeners after innerHTML is set (inline handlers blocked by CSP)
    const projHit = svg.querySelector('#proj-hit');
    if(projHit){
      projHit.addEventListener('mousemove', function(e){ projHover(e,padL,padR,cW,totalQ); });
      projHit.addEventListener('mouseleave', function(){ var t=document.getElementById('proj-tooltip'); if(t) t.style.display='none'; });
      projHit.addEventListener('click', function(e){ projHover(e,padL,padR,cW,totalQ); });
    }

    // ── QUARTERLY TABLE ──
    // Years 1-3: expand to all 4 quarters. Years 5+ show Q4 annual snapshot.
    const tblEl = document.getElementById('proj-table');
    if(tblEl){
      const mkRow = (q, labelOverride) => {
        const qi = Math.min(q, projData.length - 1);
        const d  = projData[qi];
        const de = projDataExtra[qi];
        const doff = projDataOffset[qi];
        const eq = d.yourEquity;
        const isMilestone = qi === payoffQ || qi === buyoutQ;
        const extraLoanStr = (extraPayment > 0 && de) ? `<span style="color:#9B7FE8;font-size:9px;display:block;">(+extra: ${fmtK(de.loanBal)})</span>` : '';
        const offsetLoanStr = (offsetBal > 0 && doff) ? `<span style="color:#5B8FAB;font-size:9px;display:block;">(offset: ${fmtK(doff.loanBal)})</span>` : '';
        const wholeYr  = Math.floor(d.yr);
        const qNum     = (qi % 4) || 4; // 1-based quarter within year
        const calLabel = settleYr ? `${settleYr + wholeYr} Q${qNum}` : `Yr ${wholeYr} Q${qNum}`;
        const label    = labelOverride || calLabel;
        return `<div style="display:grid;grid-template-columns:80px repeat(4,1fr);gap:6px;padding:7px 0;border-top:1px solid rgba(28,28,30,0.06);font-size:10px;font-family:'DM Mono',monospace;${isMilestone?'background:rgba(201,168,76,0.06);border-radius:2px;':''}">`
          +`<span style="color:var(--gold);white-space:nowrap;">${label}${isMilestone?' ★':''}</span>`
          +`<span>${fmtK(d.baseVal)}</span>`
          +`<span style="color:var(--sky)">${fmtK(d.loanBal)}${extraLoanStr}${offsetLoanStr}</span>`
          +`<span style="color:var(--terracotta)">${fmtK(d.govtOwed)}</span>`
          +`<span style="color:${eq>0?'var(--reward-green)':'var(--risk-red)'};font-weight:600;">${fmtK(eq)}</span></div>`;
      };
      // Rows: Q1-Q4 for years 1-3, Q4-only for years 5+
      const rows = [];
      for(let y = 1; y <= 3; y++){
        for(let qn = 1; qn <= 4; qn++) rows.push(mkRow(y * 4 - (4 - qn)));
      }
      [5,7,10,15,20,25,30].forEach(y => rows.push(mkRow(y * 4)));
      tblEl.innerHTML=`<div style="font-family:'DM Mono',monospace;font-size:10px;"><div style="display:grid;grid-template-columns:80px repeat(4,1fr);gap:6px;padding-bottom:6px;border-bottom:1px solid rgba(28,28,30,0.1);color:var(--slate);font-size:9px;letter-spacing:1px;text-transform:uppercase;"><span>${settleYr?'Cal. Q':'Quarter'}</span><span>Value</span><span>Loan Bal</span><span>Govt Owed</span><span>Your Equity</span></div>${rows.join('')}</div>`;
    }

    // Reset mobile slider to start and update display boxes
    const sliderEl = document.getElementById('proj-slider-input');
    if(sliderEl){ sliderEl.max = projData.length - 1; sliderEl.value = 0; }
    projSliderMove(0);

    // ── Rental yield quick-calc ──
    const investRentEl = document.getElementById('inp-invest-rent');
    const yieldResultsEl = document.getElementById('yield-results');
    if (investRentEl && yieldResultsEl) {
      const weeklyRent = parseFloat(investRentEl.value) || 0;
      if (weeklyRent > 0 && price > 0) {
        yieldResultsEl.style.display = '';
        const annualRent = weeklyRent * 52;
        const grossYield = annualRent / price * 100;
        // Typical net deductions: rates ~$2k, landlord insurance ~$1.5k, PM 8%, maintenance ~1%, vacancy ~2wk
        const mgmtFee = annualRent * 0.08;
        const netAnnualRent = annualRent - mgmtFee - 2000 - 1500 - price * 0.01;
        const netYield = Math.max(0, netAnnualRent / price * 100);
        const annualMortgage = monthly * 12;
        const cashflow = netAnnualRent - annualMortgage;
        const cashflowLabel = cashflow >= 0 ? '✓ Positively geared' : '⚠ Negatively geared';
        const cashflowColor = cashflow >= 0 ? 'var(--reward-green)' : 'var(--terracotta)';
        const verdictDesc = grossYield >= 6 ? 'Strong yield' : grossYield >= 4.5 ? 'Average yield' : grossYield >= 3 ? 'Below average' : 'Low yield';
        document.getElementById('yield-gross').textContent = grossYield.toFixed(2) + '%';
        document.getElementById('yield-net').textContent = netYield.toFixed(2) + '%';
        document.getElementById('yield-annual-rent').textContent = fmt(annualRent);
        document.getElementById('yield-cashflow').textContent = (cashflow >= 0 ? '+' : '') + fmt(cashflow) + '/yr';
        document.getElementById('yield-cashflow').style.color = cashflowColor;
        document.getElementById('yield-verdict').textContent = cashflowLabel + ' — ' + verdictDesc;
        document.getElementById('yield-verdict').style.color = cashflowColor;
      } else {
        yieldResultsEl.style.display = 'none';
      }
    }
  }

  // ── Mobile projection slider ──
  function projSliderMove(idx){
    if(!projData || !projData.length) return;
    const d = projData[Math.min(idx, projData.length-1)];
    if(!d) return;

    // Label for quarter
    const settleYr = getSettleYear();
    const wholeYr = Math.floor(d.yr);
    const qNum = (d.q % 4) + 1;
    const label = settleYr ? `${settleYr + wholeYr} Q${qNum}` : `Year ${wholeYr} Q${qNum}`;

    const qEl = document.getElementById('psb-quarter');
    const vEl = document.getElementById('psb-value');
    const lEl = document.getElementById('psb-loan');
    const gEl = document.getElementById('psb-govt');
    const eEl = document.getElementById('psb-equity');
    if(qEl) qEl.textContent = label;
    if(vEl) vEl.textContent = fmtK(d.baseVal);
    if(lEl) lEl.textContent = fmtK(d.loanBal);
    if(gEl) gEl.textContent = fmtK(d.govtOwed);
    if(eEl) eEl.textContent = fmtK(d.yourEquity);

    // Move marker dot on chart
    const svg = document.getElementById('proj-chart');
    if(!svg) return;
    const vb = svg.viewBox.baseVal;
    if(!vb || !vb.width) return;
    const W = vb.width, H = vb.height;
    const years = 30;
    const padL=64, padR=16, padT=18, padB=36;
    const cW2=W-padL-padR, cH=H-padT-padB;
    const maxVal = Math.max(...projData.map(p=>p.baseVal)) * 1.08;
    const sx = padL + (d.yr / years) * cW2;
    const sy = padT + cH - (d.baseVal / maxVal) * cH;

    let dot = document.getElementById('proj-slider-dot');
    if(!dot){
      dot = document.createElementNS('http://www.w3.org/2000/svg','circle');
      dot.setAttribute('id','proj-slider-dot');
      dot.setAttribute('r','6');
      dot.setAttribute('fill','#C9A84C');
      dot.setAttribute('stroke','white');
      dot.setAttribute('stroke-width','2');
      dot.setAttribute('pointer-events','none');
      svg.appendChild(dot);
    }
    dot.setAttribute('cx', sx.toFixed(1));
    dot.setAttribute('cy', sy.toFixed(1));
    dot.style.display = '';
  }

  function projHover(e, padL, padR, cW, totalQ){
    const svg   = document.getElementById('proj-chart');
    const tip   = document.getElementById('proj-tooltip');
    const cross = document.getElementById('proj-crosshair');
    if(!svg||!tip||!projData.length) return;
    const rect  = svg.getBoundingClientRect();
    const svgW  = svg.viewBox.baseVal.width || 800;
    const scale = svgW / rect.width;
    const mx    = (e.clientX - rect.left) * scale;
    const relX  = mx - padL;
    if(relX < 0 || relX > cW) return;

    // Snap to nearest quarter (item #8)
    const q  = Math.round((relX / cW) * totalQ);
    const d  = projData[Math.min(q, projData.length - 1)];
    const de = projDataExtra[Math.min(q, projDataExtra.length - 1)];
    if(!d) return;

    const cx = padL + (d.yr / 30) * cW;
    if(cross){ cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.style.display = ''; }

    // Build quarter label e.g. "YEAR 5 Q2" or "2029 Q3"
    const _sYr  = getSettleYear();
    const wholeYr = Math.floor(d.yr);
    const qNum    = d.q % 4;
    const qStr    = qNum > 0 ? ` Q${qNum + 1}` : '';
    const _tipYrLabel = _sYr ? `${_sYr + wholeYr}${qStr}` : `YEAR ${wholeYr}${qStr}`;

    const extraPayment = parseFloat(document.getElementById('proj-extra-payment')?.value || '0') || 0;
    const extraRow = (extraPayment > 0 && de != null)
      ? `<div style="display:flex;justify-content:space-between;gap:28px;align-items:baseline;"><span style="color:rgba(245,240,232,0.5);font-size:13px;">Loan+Extra</span><span style="color:#9B7FE8;font-size:19px;font-weight:700;">${fmtK(de.loanBal)}</span></div>`
      : '';

    tip.innerHTML = `<div style="font-size:13px;letter-spacing:2px;color:var(--gold);margin-bottom:12px;font-weight:700;">${_tipYrLabel}</div>`
      +`<div style="display:flex;flex-direction:column;gap:9px;">`
      +`<div style="display:flex;justify-content:space-between;gap:28px;align-items:baseline;"><span style="color:rgba(245,240,232,0.5);font-size:13px;">Value</span><span style="color:#C9A84C;font-size:19px;font-weight:700;">${fmtK(d.baseVal)}</span></div>`
      +`<div style="display:flex;justify-content:space-between;gap:28px;align-items:baseline;"><span style="color:rgba(245,240,232,0.5);font-size:13px;">Loan Bal</span><span style="color:#5B8FAB;font-size:19px;font-weight:700;">${fmtK(d.loanBal)}</span></div>`
      + extraRow
      +`<div style="display:flex;justify-content:space-between;gap:28px;align-items:baseline;"><span style="color:rgba(245,240,232,0.5);font-size:13px;">Govt Owed</span><span style="color:#C4704A;font-size:19px;font-weight:700;">${fmtK(d.govtOwed)}</span></div>`
      +`<div style="display:flex;justify-content:space-between;gap:28px;align-items:baseline;border-top:1px solid rgba(255,255,255,0.14);padding-top:10px;margin-top:4px;"><span style="color:rgba(245,240,232,0.5);font-size:13px;">Your Equity</span><span style="color:${d.yourEquity>0?'#5A9E7B':'#C45A5A'};font-size:22px;font-weight:700;">${fmtK(d.yourEquity)}</span></div>`
      +'</div>';

    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    tip.style.display = 'block';
    const tipW = tip.offsetWidth;
    const tipH = tip.offsetHeight;
    let tipX = px > rect.width / 2 ? (px - tipW - 12) : (px + 12);
    tipX = Math.max(4, Math.min(tipX, rect.width - tipW - 4));
    let tipY = Math.max(4, py - tipH / 2);
    tipY = Math.min(tipY, rect.height - tipH - 4);
    tip.style.left = tipX + 'px';
    tip.style.top  = tipY + 'px';
  }

  // ── SUBURB GROWTH LOOKUP (item 7) ──
  const GROWTH_CACHE_KEY = 'equitySight_growth_cache_v1';
  const GROWTH_CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

  function getCachedGrowth(suburb, state){
    try{
      const cache = JSON.parse(localStorage.getItem(GROWTH_CACHE_KEY)||'{}');
      const entry = cache[(suburb+'|'+state).toLowerCase()];
      if(entry && (Date.now() - entry.ts) < GROWTH_CACHE_TTL) return entry;
    }catch(e){}
    return null;
  }
  function setCachedGrowth(suburb, state, rate, note){
    try{
      const cache = JSON.parse(localStorage.getItem(GROWTH_CACHE_KEY)||'{}');
      cache[(suburb+'|'+state).toLowerCase()] = {rate, note, ts: Date.now()};
      localStorage.setItem(GROWTH_CACHE_KEY, JSON.stringify(cache));
    }catch(e){}
    // Also push to shared Redis cache (fire-and-forget)
    fetch('/.netlify/functions/growth',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'set',suburb,state,rate,note})
    }).catch(()=>{});
  }
  // Check shared Redis growth cache (returns {rate, note} or null)
  async function getSharedGrowth(suburb, state){
    try{
      const r = await fetch('/.netlify/functions/growth',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'get',suburb,state})
      });
      const d = await r.json();
      if(d.ok && d.found) return {rate:d.rate, note:d.note, ts:d.fetchedAt};
    }catch(e){}
    return null;
  }

  // Brisbane/QLD suburb growth rate lookup table (5-yr average % p.a.)
  const qldGrowthTable = {
    'kedron':6.8,'stafford':6.5,'stafford heights':6.2,'chermside':6.0,
    'chermside west':5.8,'everton park':6.3,'nundah':7.1,'wavell heights':6.9,
    'aspley':6.0,'zillmere':5.5,'geebung':5.8,'virginia':5.6,'northgate':6.4,
    'nudgee':5.2,'banyo':5.0,'hendra':7.5,'eagle farm':5.8,'hamilton':7.2,
    'ascot':7.8,'clayfield':7.3,'wooloowin':7.0,'gordon park':6.8,'grange':7.2,
    'newmarket':6.9,'alderley':7.0,'enoggera':5.8,'keperra':5.5,'mitchelton':6.2,
    'gaythorne':6.5,'oxley':5.5,'rocklea':5.0,'moorooka':5.8,'salisbury':5.5,
    'nathan':5.8,'sunnybank':5.5,'sunnybank hills':5.2,'macgregor':5.0,'eight mile plains':5.3,
    'mansfield':5.8,'wishart':5.5,'belmont':5.3,'tingalpa':5.0,'cannon hill':6.5,
    'morningside':6.8,'murarrie':5.8,'hawthorne':7.5,'balmoral':8.0,'bulimba':8.2,
    'new farm':9.0,'newstead':8.5,'teneriffe':9.2,'bowen hills':7.0,'fortitude valley':7.5,
    'spring hill':7.8,'paddington':7.5,'red hill':7.8,'kelvin grove':7.0,'herston':7.5,
    'taringa':7.0,'toowong':7.5,'auchenflower':7.8,'west end':8.5,'south brisbane':8.0,
    'woolloongabba':8.0,'east brisbane':8.2,'coorparoo':7.5,'greenslopes':7.0,'dutton park':7.8,
    'annerley':7.0,'yeronga':6.8,'graceville':7.5,'sherwood':7.0,'corinda':6.5,
    'indooroopilly':7.0,'st lucia':7.5,'fig tree pocket':7.0,'kenmore':6.5,'pullenvale':6.0,
    'chapel hill':6.5,'tarragindi':6.5,'holland park':6.8,'mount gravatt':6.0,'upper mount gravatt':5.8,
    'carindale':5.5,'mount ommaney':6.0,'jindalee':5.8,'westlake':5.5,'seventeen mile rocks':5.5,
    'sinnamon park':6.0,'riverhills':5.3,'middle park':5.5,'darra':4.8,'richlands':4.5,
    'inala':4.2,'durack':4.5,'forest lake':4.8,'ellen grove':4.5,'heathwood':4.8,
    'algester':5.0,'parkinson':5.2,'calamvale':5.5,'drewvale':5.0,'kuraby':5.0,
    'coopers plains':5.5,'acacia ridge':4.5,'pallara':5.2,'willawong':4.8,'larapinta':5.0,
    'springwood':5.0,'slacks creek':4.5,'woodridge':4.0,'logan central':3.8,'loganlea':4.0,
    'meadowbrook':4.5,'marsden':4.5,'kingston':4.0,'waterford west':4.5,'logan reserve':4.8,
    'crestmead':4.5,'berrinba':4.5,'browns plains':4.5,'heritage park':5.0,'regents park':4.8,
    'boronia heights':4.5,'park ridge':5.0,'hillcrest':4.8,'forestdale':4.5,'greenbank':4.8,
    'jimboomba':5.5,'dakabin':5.0,'mango hill':5.5,'kippa-ring':5.2,
    'redcliffe':5.5,'margate':5.8,'clontarf':5.5,'scarborough':6.0,'woody point':5.8,
    'kallangur':5.0,'murrumba downs':5.2,'griffin':5.5,'narangba':5.2,'caboolture':4.5,
    'morayfield':4.8,'burpengary':4.5,'deception bay':4.5,'north lakes':5.5,'rothwell':5.2,
    'ormiston':6.5,'cleveland':6.8,'thornlands':6.0,'victoria point':6.2,'redland bay':6.0,
    'capalaba':5.8,'alexandra hills':5.5,'wynnum':7.0,'manly':7.5,'lota':6.8,
    'ipswich':5.2,'redbank plains':5.8,'redbank':5.5,'goodna':5.0,'springfield':5.8,
    'springfield lakes':6.0,'collingwood park':5.5,'bellbird park':5.5,'camira':5.8,
    'silkstone':5.2,'leichhardt':5.0,'booval':5.2,'bundamba':5.0,'east ipswich':5.2,
    'north ipswich':5.0,'west ipswich':5.0,'brassall':5.5,'ripley':6.2,'deebing heights':5.8,
    'flinders view':5.5,'brookwater':6.0,'augustine heights':5.8,'raceview':5.2,
    'one mile':5.0,'pine mountain':5.5,'karalee':5.8,'moores pocket':5.0,
    'riverview':5.2,'dinmore':4.8,'gailes':5.0,'blackstone':5.0,'sadliers crossing':5.2,
    'woodend':5.0,'tivoli':5.2,'newtown':5.0,'coalfalls':5.0,'churchill':5.2,
  };

  // Auto-check when suburb field changes — applies cached/table data silently
  var _suburbCheckTimer = null;
  function onSuburbChange(){
    updatePropertyDetails();
    clearTimeout(_suburbCheckTimer);
    _suburbCheckTimer = setTimeout(async function(){
      const suburb = document.getElementById('pd-suburb')?.value?.trim();
      const state  = document.getElementById('pd-state')?.value?.trim() || '';
      const hint = document.getElementById('suburb-growth-hint');
      if(!suburb){ if(hint) hint.textContent = ''; return; }
      // 1. Check localStorage cache
      const cached = getCachedGrowth(suburb, state);
      if(cached){
        document.getElementById('proj-growth').value = cached.rate;
        document.getElementById('proj-growth-lbl').textContent = cached.rate.toFixed(1)+'%';
        if(hint) hint.textContent = `📍 ${suburb}: ~${cached.rate}% p.a. — ${cached.note||'cached'}`;
        drawProjection();
        return;
      }
      // 2. Check shared Redis cache
      const shared = await getSharedGrowth(suburb, state);
      if(shared){
        setCachedGrowth(suburb, state, shared.rate, shared.note); // store locally too
        document.getElementById('proj-growth').value = shared.rate;
        document.getElementById('proj-growth-lbl').textContent = shared.rate.toFixed(1)+'%';
        if(hint) hint.textContent = `📍 ${suburb}: ~${shared.rate}% p.a. — ${shared.note||'shared data'}`;
        drawProjection();
        return;
      }
      // 3. Check built-in table (QLD only)
      const key = suburb.toLowerCase().trim();
      const tableRate = qldGrowthTable[key];
      if(tableRate){
        setCachedGrowth(suburb, state, tableRate, 'historical estimate');
        document.getElementById('proj-growth').value = tableRate;
        document.getElementById('proj-growth-lbl').textContent = tableRate.toFixed(1)+'%';
        if(hint) hint.textContent = `📍 ${suburb} ${state}: ~${tableRate}% p.a. avg (historical estimate)`;
        drawProjection();
      } else {
        // No data found — let the user know so they can use the manual "Look Up" button
        if(hint) hint.textContent = `No data for ${suburb} — adjust growth rate manually or click "Look Up".`;
      }
    }, 800);
  }

  async function fetchSuburbGrowth(){
    const suburb = document.getElementById('pd-suburb')?.value?.trim();
    const state  = document.getElementById('pd-state')?.value?.trim() || '';
    if(!suburb){ showToast('⚠️ Enter a suburb in the Property tab first'); return; }
    if(!state){ showToast('⚠️ Select a state in the Property tab for accurate growth data'); return; }
    const btn = document.getElementById('fetch-growth-btn');
    const hint = document.getElementById('suburb-growth-hint');

    // Check local cache first
    const cached = getCachedGrowth(suburb, state);
    if(cached){
      document.getElementById('proj-growth').value = cached.rate;
      document.getElementById('proj-growth-lbl').textContent = cached.rate.toFixed(1)+'%';
      if(hint) hint.textContent = `📍 ${suburb}: ~${cached.rate}% p.a. — ${cached.note||'cached'}`;
      drawProjection();
      showToast(`📈 Growth rate for ${_escBanner(suburb)} loaded from cache`);
      return;
    }
    // Check shared Redis cache
    const shared = await getSharedGrowth(suburb, state);
    if(shared){
      setCachedGrowth(suburb, state, shared.rate, shared.note);
      document.getElementById('proj-growth').value = shared.rate;
      document.getElementById('proj-growth-lbl').textContent = shared.rate.toFixed(1)+'%';
      if(hint) hint.textContent = `📍 ${suburb}: ~${shared.rate}% p.a. — ${shared.note||'shared data'}`;
      drawProjection();
      showToast(`📈 Growth rate for ${_escBanner(suburb)} loaded from shared database`);
      return;
    }

    btn.textContent = '⏳ Looking up...';
    btn.disabled = true;

    const key = suburb.toLowerCase().trim();
    const rate = qldGrowthTable[key];

    if(rate){
      setCachedGrowth(suburb, state, rate, 'historical estimate');
      document.getElementById('proj-growth').value = rate;
      document.getElementById('proj-growth-lbl').textContent = rate.toFixed(1)+'%';
      if(hint) hint.textContent = `📍 ${suburb} ${state}: ~${rate}% p.a. avg (historical estimate)`;
      drawProjection();
      showToast(`📈 Set growth to ${rate}% for ${_escBanner(suburb)}`);
    } else {
      if(hint) hint.textContent = `No data found for ${suburb}. Try manual entry.`;
      showToast(`⚠️ Could not find data for ${_escBanner(suburb)} — adjust manually`);
    }
    btn.textContent = '🔍 Look Up Suburb Growth';
    btn.disabled = false;
  }

  // ── EXPORT PDF (Fix 2) — opens a clean read-only print-optimised view ──
  function showPDFOptionsPopup(){
    const modal = document.getElementById('pdf-options-modal');
    if(!modal) return exportPDF();
    modal.style.display = 'flex';
  }
  function closePDFOptionsModal(){
    const modal = document.getElementById('pdf-options-modal');
    if(modal) modal.style.display = 'none';
  }
  // Currently selected export format (default: pdf)
  var _exportFormat = 'pdf';

  function showPDFPreview(){
    incrementExportCount();
    // Read values BEFORE closing modal so elements are still in DOM
    const size    = document.getElementById('pdf-opt-size')?.value     || 'A4';
    const orient  = document.getElementById('pdf-opt-orient')?.value   || 'portrait';
    const colour  = document.getElementById('pdf-opt-colour')?.value   || 'full';
    const fsz     = document.getElementById('pdf-opt-fontsize')?.value || 'normal';
    const incFinancial = document.getElementById('pdf-opt-financial')?.checked !== false;
    const incReno      = document.getElementById('pdf-opt-reno')?.checked !== false;
    const incRepay     = document.getElementById('pdf-opt-repay')?.checked !== false;
    const incAmort     = document.getElementById('pdf-opt-amort')?.checked === true;
    const incOverlap   = document.getElementById('pdf-opt-overlap')?.checked !== false;
    const incRisks     = document.getElementById('pdf-opt-risks')?.checked !== false;
    const incNotes     = document.getElementById('pdf-opt-notes')?.checked !== false;
    const incTimeline  = document.getElementById('pdf-opt-timeline')?.checked === true;
    closePDFOptionsModal();

    var opts = {size, orient, colour, fsz, incFinancial, incReno, incRepay, incAmort, incOverlap, incRisks, incNotes, incTimeline};

    if(_exportFormat === 'csv') return exportCSV();
    if(_exportFormat === 'txt') return exportTXT();
    if(_exportFormat === 'html') return exportHTMLFile(opts);
    exportPDF(opts);
  }
  // Assign all export functions to window for onclick handler access
  window.showPDFOptionsPopup = showPDFOptionsPopup;
  window.showPDFPreview = showPDFPreview;
  window.closePDFOptionsModal = closePDFOptionsModal;

  function exportPDFWithOptions(){
    showPDFPreview();
  }

  function _gatherExportSnap(){
    var addr = document.getElementById('pd-address')?.value || 'Property';
    var suburb = document.getElementById('pd-suburb')?.value || '';
    var stateVal = document.getElementById('pd-state')?.value || '';
    var fullAddr = [addr,suburb,stateVal].filter(Boolean).join(', ') || 'Property Scenario';
    return {
      addr: fullAddr,
      price: document.getElementById('t-price')?.textContent || '—',
      deposit: document.getElementById('t-deposit')?.textContent || '—',
      govt: document.getElementById('t-govt')?.textContent || '—',
      remaining: document.getElementById('t-remaining')?.textContent || '—',
      savings: document.getElementById('cb-savings')?.textContent || '—',
      outOfPocket: document.getElementById('cb-out')?.textContent || '—',
      cashLeft: document.getElementById('cb-remaining')?.textContent || '—',
      monthly: document.getElementById('rp-monthly')?.textContent || '—',
      weekly: document.getElementById('rp-weekly')?.textContent || '—',
      annual: document.getElementById('rp-annual')?.textContent || '—',
      rateLabel: document.getElementById('rp-rate-lbl')?.textContent || '',
      termLabel: document.getElementById('rp-term-lbl')?.textContent || '',
      loanLabel: document.getElementById('rp-loan-lbl')?.textContent || '',
      totalInterest: document.getElementById('rp-interest')?.textContent || '—',
      totalPaid: document.getElementById('rp-total-paid')?.textContent || '—',
      poolVal: document.getElementById('reno-pool-val')?.textContent || '—',
      unspent: document.getElementById('reno-unspent-val')?.textContent || '—',
      renoTotal: document.getElementById('reno-total')?.textContent || '—',
      renoItems: renoItems.map(function(r){ return {name:r.name||'',amt:fmt(r.amount||0),note:r.note||''}; }),
      contingency: fmt(getRenoTotal()*(v('inp-cont')/100)),
      overlapWeekly: document.getElementById('ov-weekly-total')?.textContent || '—',
      overlapTotal: document.getElementById('ov-total-cost')?.textContent || '—',
      overlapAfter: document.getElementById('ov-remaining-after')?.textContent || '—',
      riskScore: document.getElementById('risk-meter')?.style.width || '50%',
      rewardScore: document.getElementById('reward-meter')?.style.width || '50%',
      riskDesc: document.getElementById('risk-desc')?.textContent || '',
      rewardDesc: document.getElementById('reward-desc')?.textContent || '',
      notes: document.getElementById('pd-notes')?.value || '',
      crDeposit: document.getElementById('cr-deposit')?.textContent || '—',
      crTotal: document.getElementById('cr-total')?.textContent || '—',
      renoOn: renoEnabled,
    };
  }

  function _downloadFile(filename, content, mimeType){
    var blob = new Blob([content], {type: mimeType});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 5000);
  }

  function exportCSV(){
    var s = _gatherExportSnap();
    var safeName = s.addr.replace(/[^a-zA-Z0-9 ]/g,'').trim().replace(/\s+/g,'-') || 'export';
    var rows = [
      ['Property Analysis', s.addr],
      ['Generated', new Date().toLocaleDateString('en-AU')],
      [],
      ['FINANCIAL SNAPSHOT'],
      ['Purchase Price', s.price],
      ['Deposit', s.deposit],
      ['Government Contribution', s.govt],
      ['Amount Remaining', s.remaining],
      [],
      ['CASH PICTURE'],
      ['Total Savings', s.savings],
      ['Out of Pocket', s.outOfPocket],
      ['Cash Left Over', s.cashLeft],
      [],
      ['LOAN REPAYMENTS'],
      ['Loan Details', s.loanLabel],
      ['Interest Rate', s.rateLabel],
      ['Loan Term', s.termLabel],
      ['Monthly Repayment', s.monthly],
      ['Weekly Repayment', s.weekly],
      ['Annual Repayment', s.annual],
      ['Total Interest', s.totalInterest],
      ['Total Amount Paid', s.totalPaid],
      [],
      ['RENT OVERLAP'],
      ['Weekly Overlap Cost', s.overlapWeekly],
      ['Total Overlap Cost', s.overlapTotal],
      ['Cash After Overlap', s.overlapAfter],
    ];
    if(s.renoOn){
      rows.push([], ['RENOVATION BUDGET']);
      rows.push(['Budget Pool', s.poolVal]);
      s.renoItems.forEach(function(it){ rows.push([it.name, it.amt, it.note]); });
      rows.push(['Contingency', s.contingency]);
      rows.push(['Total Spent', s.renoTotal]);
      rows.push(['Unspent', s.unspent]);
    }
    rows.push([], ['RISK & REWARD']);
    rows.push(['Risk Score', s.riskScore]);
    rows.push(['Risk Assessment', s.riskDesc]);
    rows.push(['Reward Score', s.rewardScore]);
    rows.push(['Reward Assessment', s.rewardDesc]);
    if(s.notes){
      rows.push([], ['NOTES']);
      rows.push([s.notes]);
    }
    var csv = rows.map(function(r){ return r.map(function(c){ return '"' + String(c||'').replace(/"/g,'""') + '"'; }).join(','); }).join('\n');
    _downloadFile(safeName + '.csv', csv, 'text/csv;charset=utf-8');
    showToast('CSV exported');
  }

  function exportTXT(){
    var s = _gatherExportSnap();
    var safeName = s.addr.replace(/[^a-zA-Z0-9 ]/g,'').trim().replace(/\s+/g,'-') || 'export';
    var lines = [
      '═══════════════════════════════════════════',
      '  PROPERTY ANALYSIS — ' + s.addr,
      '  Generated: ' + new Date().toLocaleDateString('en-AU'),
      '═══════════════════════════════════════════',
      '',
      '── FINANCIAL SNAPSHOT ──',
      '  Purchase Price:          ' + s.price,
      '  Deposit:                 ' + s.deposit,
      '  Government Contribution: ' + s.govt,
      '  Amount Remaining:        ' + s.remaining,
      '',
      '── CASH PICTURE ──',
      '  Total Savings:           ' + s.savings,
      '  Out of Pocket:           ' + s.outOfPocket,
      '  Cash Left Over:          ' + s.cashLeft,
      '',
      '── LOAN REPAYMENTS ──',
      '  Loan:     ' + s.loanLabel,
      '  Rate:     ' + s.rateLabel,
      '  Term:     ' + s.termLabel,
      '  Monthly:  ' + s.monthly,
      '  Weekly:   ' + s.weekly,
      '  Annual:   ' + s.annual,
      '  Total Interest:  ' + s.totalInterest,
      '  Total Paid:      ' + s.totalPaid,
      '',
      '── RENT OVERLAP ──',
      '  Weekly Overlap:  ' + s.overlapWeekly,
      '  Total Overlap:   ' + s.overlapTotal,
      '  Cash After:      ' + s.overlapAfter,
    ];
    if(s.renoOn){
      lines.push('', '── RENOVATION BUDGET ──');
      lines.push('  Budget Pool:  ' + s.poolVal);
      s.renoItems.forEach(function(it){ lines.push('  ' + it.name + ': ' + it.amt + (it.note ? ' (' + it.note + ')' : '')); });
      lines.push('  Contingency:  ' + s.contingency);
      lines.push('  Total Spent:  ' + s.renoTotal);
      lines.push('  Unspent:      ' + s.unspent);
    }
    lines.push('', '── RISK & REWARD ──');
    lines.push('  Risk:   ' + s.riskScore + ' — ' + s.riskDesc);
    lines.push('  Reward: ' + s.rewardScore + ' — ' + s.rewardDesc);
    if(s.notes){
      lines.push('', '── NOTES ──');
      lines.push('  ' + s.notes.replace(/\n/g, '\n  '));
    }
    lines.push('', '═══════════════════════════════════════════');
    lines.push('  EquitySight.app — Australia\'s smartest property calculator');
    lines.push('═══════════════════════════════════════════');
    _downloadFile(safeName + '.txt', lines.join('\n'), 'text/plain;charset=utf-8');
    showToast('TXT exported');
  }

  function exportHTMLFile(opts){
    // Re-use the existing PDF export but save as .html download instead of opening in new window
    exportPDF(Object.assign({}, opts, {_downloadAsHTML: true}));
  }
  async function incrementExportCount(){
    // Increment export count for the currently loaded scenario (if saved)
    if(!_lastSavedAddr) return;
    try {
      const scenarios = await getAllScenarios();
      const sc = scenarios.find(s => (s.fullAddr||'').toLowerCase().trim() === _lastSavedAddr.toLowerCase().trim());
      if(!sc) return;
      const updated = Object.assign({}, sc, { exportCount: (sc.exportCount || 0) + 1 });
      if(isLoggedIn()){
        await fetch('/.netlify/functions/scenarios', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ action:'save', userId:getUserId(), id:updated.id, fullAddr:updated.fullAddr, state:updated.state, hasPhoto:updated.hasPhoto, status:updated.status||'browsing', thumb:updated.thumb||'', exportCount:updated.exportCount, savedAt:updated.savedAt||updated.timestamp })
        });
      }
      _scenariosCache = null; // invalidate cache
    } catch(e) {}
  }

  function exportPDF(opts){
    trackUsage('pdf_export');
    // Track PDF export
    if(window.trackPDFExport) trackPDFExport('app');

    const o = opts || {};
    const pageSize   = o.size    || 'A4';
    const pageOrient = o.orient  || 'portrait';
    const colourMode = o.colour  || 'full';
    const fontSize   = o.fsz     || 'normal';
    const incFinancial = o.incFinancial !== false;
    const incReno      = o.incReno      !== false;
    const incRepay     = o.incRepay     !== false;
    const incAmort     = o.incAmort     === true;
    const incOverlap   = o.incOverlap   !== false;
    const incRisks     = o.incRisks     !== false;
    const incNotes     = o.incNotes     !== false;
    const incTimeline  = o.incTimeline  === true;

    const addr = document.getElementById('pd-address')?.value || 'Property';
    const suburb = document.getElementById('pd-suburb')?.value || '';
    const stateVal = document.getElementById('pd-state')?.value || '';
    const fullAddr = [addr,suburb,stateVal].filter(Boolean).join(', ') || 'Property Scenario';

    // Gather all display values from current DOM
    const snap = {
      renoOn: renoEnabled,
      rentOn: document.getElementById('rent-sidebar-section')?.style.display !== 'none',
      addr: fullAddr,
      photo: propPhotoDataUrl,
      sub: document.getElementById('header-sub-text')?.textContent || '',
      price: document.getElementById('t-price')?.textContent || '—',
      deposit: document.getElementById('t-deposit')?.textContent || '—',
      govt: document.getElementById('t-govt')?.textContent || '—',
      hasGovt: (parseFloat(document.getElementById('inp-govt')?.value) || 0) > 0,
      remaining: document.getElementById('t-remaining')?.textContent || '—',
      remainingColor: document.getElementById('t-remaining')?.style.color || '',
      savings: document.getElementById('cb-savings')?.textContent || '—',
      outOfPocket: document.getElementById('cb-out')?.textContent || '—',
      cashLeft: document.getElementById('cb-remaining')?.textContent || '—',
      monthly: document.getElementById('rp-monthly')?.textContent || '—',
      weekly: document.getElementById('rp-weekly')?.textContent || '—',
      annual: document.getElementById('rp-annual')?.textContent || '—',
      rateLabel: document.getElementById('rp-rate-lbl')?.textContent || '',
      termLabel: document.getElementById('rp-term-lbl')?.textContent || '',
      loanLabel: document.getElementById('rp-loan-lbl')?.textContent || '',
      totalInterest: document.getElementById('rp-interest')?.textContent || '—',
      totalPaid: document.getElementById('rp-total-paid')?.textContent || '—',
      poolVal: document.getElementById('reno-pool-val')?.textContent || '—',
      unspent: document.getElementById('reno-unspent-val')?.textContent || '—',
      unspentColor: document.getElementById('reno-unspent-val')?.style.color || 'green',
      renoTotal: document.getElementById('reno-total')?.textContent || '—',
      renoItems: renoItems.map(r=>({
        icon: r.emoji||'🔨',
        name: r.name||'',
        amt:  fmt(r.amount||0),
        note: r.note||''
      })),
      contingency: fmt(getRenoTotal()*(v('inp-cont')/100)),
      overlapWeekly: document.getElementById('ov-weekly-total')?.textContent || '—',
      overlapTotal: document.getElementById('ov-total-cost')?.textContent || '—',
      overlapAfter: document.getElementById('ov-remaining-after')?.textContent || '—',
      riskScore: document.getElementById('risk-meter')?.style.width || '50%',
      rewardScore: document.getElementById('reward-meter')?.style.width || '50%',
      riskDesc: document.getElementById('risk-desc')?.textContent || '',
      rewardDesc: document.getElementById('reward-desc')?.textContent || '',
      notes: document.getElementById('pd-notes')?.value || '',
      costRows: document.getElementById('cost-rows-display')?.innerHTML || '',
      crDeposit: document.getElementById('cr-deposit')?.textContent || '—',
      crTotal: document.getElementById('cr-total')?.textContent || '—',
    };

    const photoHTML = snap.photo
      ? `<img src="${snap.photo}" style="width:100%;height:100%;object-fit:cover;display:block;">`
      : `<div style="width:100%;height:100%;background:#2C2C2E;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.2);font-size:32px;">🏠</div>`;

    const renoRowsHTML = snap.renoItems.map(it=>`
      <tr><td style="padding:7px 10px;border-bottom:1px solid #eee;">${_escBanner(it.icon)} ${_escBanner(it.name)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:right;font-family:monospace;">${_escBanner(it.amt)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:10px;color:#666;">${_escBanner(it.note)}</td></tr>`).join('');

    // Build amortisation data for PDF if requested
    let amortTableHTML = '';
    if(incAmort && _lastAmortParams){
      const {loanAmt, rate, term} = _lastAmortParams;
      const monthly = calcMonthly(loanAmt, rate, term);
      if(loanAmt > 0 && monthly > 0){
        const r = rate / 100 / 12;
        const fa = v => '$' + Math.round(v).toLocaleString('en-AU');
        let bal = loanAmt, amRows = '';
        for(let yr = 1; yr <= term; yr++){
          const ob = bal; let yP=0, yI=0;
          for(let mo=1;mo<=12&&bal>0.005;mo++){
            const ic=bal*r, pc=Math.min(monthly-ic,bal);
            yI+=ic; yP+=pc; bal=Math.max(0,bal-pc);
          }
          amRows+=`<tr style="${yr%2===0?'background:#f9f6f0':''}"><td style="padding:5px 8px;border-bottom:1px solid #eee;">Yr ${yr}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right;font-family:monospace;">${fa(ob)}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right;font-family:monospace;color:#5A9E7A;">${fa(yP)}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right;font-family:monospace;color:#C45A5A;">${fa(yI)}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right;font-family:monospace;">${fa(bal)}</td></tr>`;
        }
        amortTableHTML = `<div class="section-title">— · Amortisation Schedule</div><div class="card" style="overflow-x:auto;"><table style="font-size:10px;"><thead><tr><th style="text-align:left;">Year</th><th style="text-align:right;">Opening Bal</th><th style="text-align:right;">Principal</th><th style="text-align:right;">Interest</th><th style="text-align:right;">Closing Bal</th></tr></thead><tbody>${amRows}</tbody></table></div>`;
      }
    }

    const html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>${_escBanner(snap.addr)} — Finance Scenario</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  html,body{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}
  /* Base font size — normal=12px, large=16px, compact=9px */
  body{background:#fff;font-family:'DM Sans',sans-serif;color:#1C1C1E;font-size:${fontSize==='large'?'16px':fontSize==='compact'?'9px':'12px'};}
  @page{margin:10mm 12mm;size:${pageSize} ${pageOrient};}
  @media print{
    body{font-size:${fontSize==='large'?'15px':fontSize==='compact'?'8px':'11px'}!important;}
    @page{size:${pageSize} ${pageOrient};margin:10mm 12mm;}
  }
  .page{max-width:${pageOrient==='landscape'?'none':'780px'};margin:0 auto;padding:${pageOrient==='landscape'?'16px 24px':'20px 24px'};}
  /* Landscape: wider grids and larger tiles */
  ${pageOrient==='landscape'?`
    .grid4{grid-template-columns:repeat(4,1fr)!important;}
    .grid2{grid-template-columns:1fr 1fr!important;}
    .hphoto{width:240px!important;}
  `:''}
  header{background:#1C1C1E;color:#F5F0E8;padding:0;display:flex;margin-bottom:20px;border-radius:4px;overflow:hidden;}
  .htext{flex:1;padding:20px 24px;}
  .htag{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:3px;color:#C9A84C;margin-bottom:4px;}
  h1{font-family:'Playfair Display',serif;font-size:${fontSize==='large'?'30px':fontSize==='compact'?'20px':'26px'};font-weight:900;margin-bottom:3px;}
  .hsub{font-size:11px;color:rgba(245,240,232,0.45);margin-bottom:12px;}
  .hstamp{font-family:'DM Mono',monospace;font-size:10px;color:rgba(245,240,232,0.3);}
  .hphoto{width:200px;flex-shrink:0;}
  .section-title{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:3px;text-transform:uppercase;color:#888;margin:18px 0 10px;padding-bottom:6px;border-bottom:1px solid #eee;display:flex;align-items:center;gap:10px;}
  .section-title::after{content:'';flex:1;height:1px;background:#eee;}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;}
  .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px;}
  .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;}
  .card{background:#FAF7F2;border-radius:4px;padding:${fontSize==='large'?'18px 20px':fontSize==='compact'?'10px 12px':'14px 16px'};border:1px solid #eee;}
  .card-accent{width:4px;height:100%;position:absolute;top:0;left:0;border-radius:4px 0 0 4px;}
  .card-rel{position:relative;}
  .kv{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f0f0f0;font-size:${fontSize==='large'?'13px':fontSize==='compact'?'9px':'11px'};}
  .kv:last-child{border-bottom:none;}
  .kv .lbl{color:#666;}
  .kv .val{font-family:'DM Mono',monospace;font-weight:500;}
  .tile{background:#1C1C1E;color:#F5F0E8;border-radius:3px;padding:${fontSize==='large'?'16px':fontSize==='compact'?'9px':'12px'};}
  .tile-val{font-family:'DM Mono',monospace;font-size:${fontSize==='large'?'28px':fontSize==='compact'?'16px':'22px'};margin-bottom:2px;}
  .tile-lbl{font-size:${fontSize==='large'?'11px':fontSize==='compact'?'8px':'9px'};color:rgba(245,240,232,0.5);letter-spacing:1px;text-transform:uppercase;}
  .big-num{font-family:'DM Mono',monospace;font-size:${fontSize==='large'?'34px':fontSize==='compact'?'20px':'28px'};font-weight:500;}
  .meter-wrap{height:8px;background:#eee;border-radius:4px;overflow:hidden;margin:6px 0 4px;}
  .meter-fill{height:100%;border-radius:4px;}
  table{width:100%;border-collapse:collapse;font-size:${fontSize==='large'?'13px':fontSize==='compact'?'9px':'11px'};}
  th{background:#F5F0E8;padding:7px 10px;text-align:left;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#888;}
  th:last-child,td:last-child{text-align:right;}
  /* Print / Save PDF button — bigger on mobile */
  .print-btn{position:fixed;bottom:max(20px,env(safe-area-inset-bottom,20px));left:50%;transform:translateX(-50%);background:#1C1C1E;color:#C9A84C;border:1px solid rgba(201,168,76,0.4);padding:14px 28px;border-radius:28px;font-family:'DM Mono',monospace;font-size:13px;cursor:pointer;z-index:100;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,0.4);letter-spacing:0.5px;}
  .print-btn:hover{background:#2C2C2E;}
  /* Share button (mobile only) */
  .share-btn{position:fixed;bottom:max(80px,calc(env(safe-area-inset-bottom,20px) + 64px));left:50%;transform:translateX(-50%);background:rgba(201,168,76,0.15);color:#C9A84C;border:1px solid rgba(201,168,76,0.4);padding:12px 24px;border-radius:28px;font-family:'DM Mono',monospace;font-size:12px;cursor:pointer;z-index:100;white-space:nowrap;display:none;letter-spacing:0.5px;}
  @media(max-width:600px){.share-btn{display:block;}}
  @media(min-width:601px){.print-btn{top:16px;bottom:auto;right:16px;left:auto;transform:none;border-radius:4px;padding:10px 20px;font-size:12px;box-shadow:none;}}
  @media print{.print-btn,.share-btn{display:none!important;}#account-panel-overlay,#account-panel{display:none!important;}}
  /* Page-break fixes — prevent content being sliced mid-element */
  .card,.tile,.section-title,.grid2,.grid3,.grid4,.kv{page-break-inside:avoid;break-inside:avoid;}
  .section-title{page-break-after:avoid;break-after:avoid;}
  header{page-break-inside:avoid;break-inside:avoid;page-break-after:avoid;break-after:avoid;}
  .grid2,.grid3,.grid4{display:grid;}
  ${colourMode==='mono'?`
  /* Monochrome — screen filter + explicit print overrides */
  html{filter:grayscale(1);}
  header{background:#1C1C1E!important;}
  .tile{background:#333!important;}
  .card{background:#f8f8f8!important;border-color:#ccc!important;}
  .tile-val,.big-num,.kv .val{color:#000!important;}
  .htag{color:#aaa!important;}
  .card-accent{background:#666!important;}
  .meter-fill{background:#666!important;}
  @media print{
    html{filter:grayscale(1);-webkit-filter:grayscale(1);}
    header{background:#1C1C1E!important;}
    .tile{background:#333!important;}
    .card{background:#f8f8f8!important;}
  }
  `:''}
</style>
</head>
<body>
<button class="print-btn" id="pdf-print-btn">🖨 Print / Save as PDF</button>
<button class="share-btn" id="pdf-share-btn">↑ Share Report</button>
<div class="page">
  <header>
    <div class="htext">
      <div class="htag">Property Finance Calculator</div>
      <h1>${_escBanner(snap.addr)}</h1>
      <div class="hsub">${_escBanner(snap.sub)}</div>
      <div class="hstamp">Exported ${(()=>{const n=new Date();return String(n.getDate()).padStart(2,'0')+'/'+String(n.getMonth()+1).padStart(2,'0')+'/'+n.getFullYear();})()}  ·  ${pageSize} ${pageOrient.charAt(0).toUpperCase()+pageOrient.slice(1)}</div>
      ${(snap.notes && incNotes) ? `<div style="margin-top:10px;font-size:11px;color:rgba(245,240,232,0.5);font-style:italic;max-width:360px;">"${_escBanner(snap.notes)}"</div>` : ''}
    </div>
    <div class="hphoto">${photoHTML}</div>
  </header>

  ${incFinancial ? `
  <div class="section-title">01 · Financial Snapshot</div>
  <div class="${snap.hasGovt?'grid4':'grid3'}">
    <div class="tile"><div class="tile-val">${snap.price}</div><div class="tile-lbl">Purchase Price</div></div>
    <div class="tile"><div class="tile-val">${snap.deposit}</div><div class="tile-lbl">Your Deposit</div></div>
    ${snap.hasGovt ? `<div class="tile"><div class="tile-val">${snap.govt}</div><div class="tile-lbl">Govt Contribution</div></div>` : ''}
    <div class="tile"><div class="tile-val" style="color:${snap.remainingColor||'#A8C4B0'}">${snap.remaining}</div><div class="tile-lbl">Remaining Cash</div></div>
  </div>
  <div class="grid2">
    <div class="card card-rel"><div class="card-accent" style="background:#C9A84C;position:absolute;"></div>
      <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:2px;color:#C9A84C;margin-bottom:8px;padding-left:10px;">CASH PICTURE</div>
      <div class="kv" style="padding-left:10px;"><span class="lbl">Your Savings</span><span class="val">${snap.savings}</span></div>
      <div class="kv" style="padding-left:10px;"><span class="lbl">Total Out-of-Pocket</span><span class="val" style="color:#C4704A;">${snap.outOfPocket}</span></div>
      <div class="kv" style="padding-left:10px;"><span class="lbl">Remaining Cash</span><span class="val" style="color:#7B9E87;">${snap.cashLeft}</span></div>
    </div>
    <div class="card card-rel"><div class="card-accent" style="background:#5B8FAB;position:absolute;"></div>
      <div style="font-family:'DM Mono',monospace;font-size:9px;letter-spacing:2px;color:#5B8FAB;margin-bottom:8px;padding-left:10px;">UPFRONT COSTS</div>
      <div class="kv" style="padding-left:10px;"><span class="lbl">Deposit</span><span class="val">${snap.crDeposit}</span></div>
      ${snap.costRows.replace(/<div class="cr">/g,'<div class="kv" style="padding-left:10px;">').replace(/<span class="nm">/g,'<span class="lbl">').replace(/<span class="am">/g,'<span class="val">').replace(/<\/div>/g,'</div>')}
      <div class="kv" style="padding-left:10px;border-top:2px solid #1C1C1E;padding-top:7px;margin-top:5px;"><span class="lbl" style="font-weight:600;">Total Required</span><span class="val" style="font-weight:600;">${snap.crTotal}</span></div>
    </div>
  </div>` : ''}

  ${(snap.renoOn && incReno) ? `
  <div class="section-title">02 · Renovation Budget</div>
  <div class="grid2" style="margin-bottom:12px;">
    <div class="card" style="text-align:center;">
      <div style="font-size:9px;font-family:'DM Mono',monospace;letter-spacing:2px;color:#888;margin-bottom:4px;">POOL</div>
      <div class="big-num" style="color:#7B9E87;">${snap.poolVal}</div>
      <div style="font-size:10px;color:#888;margin-top:2px;">Available for reno</div>
      <div style="border-top:1px solid #eee;margin-top:12px;padding-top:12px;">
      <div style="font-size:9px;font-family:'DM Mono',monospace;letter-spacing:2px;color:#888;margin-bottom:4px;">UNSPENT</div>
      <div class="big-num" style="color:${snap.unspentColor};">${snap.unspent}</div>
      <div style="font-size:10px;color:#888;margin-top:2px;">After planned reno</div>
      </div>
    </div>
    <div class="card">
      <table>
        <tr><th>Item</th><th>Cost</th><th style="text-align:left;">Note</th></tr>
        ${renoRowsHTML}
        <tr><td style="padding:7px 10px;border-bottom:1px solid #eee;">⚠️ Contingency</td><td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:right;font-family:monospace;">${snap.contingency}</td><td></td></tr>
        <tr><td style="padding:7px 10px;font-weight:700;">Total</td><td style="padding:7px 10px;text-align:right;font-family:monospace;font-weight:700;">${snap.renoTotal}</td><td></td></tr>
      </table>
    </div>
  </div>` : ''}

  ${incRepay ? `
  <div class="section-title">03 · Loan Repayments</div>
  <div class="grid2">
    <div class="card">
      <div style="display:flex;gap:16px;">
        <div style="text-align:center;flex:1;"><div class="big-num">${snap.monthly}</div><div style="font-size:10px;color:#888;margin-top:2px;">Monthly</div><div style="font-size:9px;color:#aaa;">${snap.rateLabel}</div></div>
        <div style="text-align:center;flex:1;"><div class="big-num">${snap.weekly}</div><div style="font-size:10px;color:#888;margin-top:2px;">Fortnightly</div><div style="font-size:9px;color:#aaa;">26&times; per year</div></div>
        <div style="text-align:center;flex:1;"><div class="big-num">${snap.annual}</div><div style="font-size:10px;color:#888;margin-top:2px;">Annual</div><div style="font-size:9px;color:#aaa;">${snap.loanLabel}</div></div>
      </div>
    </div>
    <div class="card">
      <div class="kv"><span class="lbl">Total Interest Paid</span><span class="val" style="color:#C45A5A;">${snap.totalInterest}</span></div>
      <div class="kv"><span class="lbl">Total Amount Paid</span><span class="val">${snap.totalPaid}</span></div>
    </div>
  </div>
  ${amortTableHTML}` : ''}

  ${(snap.rentOn && incOverlap) ? `
  <div class="section-title">04 · Rent Overlap</div>
  <div class="grid2" style="margin-bottom:0;">
    <div class="card">
      <div class="kv"><span class="lbl">Weekly Combined Cost</span><span class="val">${snap.overlapWeekly}</span></div>
      <div class="kv"><span class="lbl">Total Overlap Cost</span><span class="val" style="color:#C4704A;">${snap.overlapTotal}</span></div>
      <div class="kv"><span class="lbl">Cash Left After Overlap</span><span class="val" style="color:#5A9E7B;">${snap.overlapAfter}</span></div>
    </div>
    <div class="card" style="display:flex;align-items:center;justify-content:center;">
      <div style="font-size:11px;color:#888;font-style:italic;">Overlap period modelled from rent + mortgage input values.</div>
    </div>
  </div>` : ''}

  ${incRisks ? `
  <div class="section-title">05 · Risk &amp; Reward</div>
  <div class="grid2">
    <div class="card">
      <div style="margin-bottom:12px;"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;"><strong>Risk Level</strong><span style="font-family:monospace;">${snap.riskScore}</span></div><div class="meter-wrap"><div class="meter-fill" style="width:${snap.riskScore};background:linear-gradient(to right,#C9A84C,#C4704A);"></div></div><div style="font-size:11px;color:#666;margin-top:4px;">${snap.riskDesc}</div></div>
      <div><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;"><strong>Reward Potential</strong><span style="font-family:monospace;">${snap.rewardScore}</span></div><div class="meter-wrap"><div class="meter-fill" style="width:${snap.rewardScore};background:linear-gradient(to right,#7B9E87,#5A9E7B);"></div></div><div style="font-size:11px;color:#666;margin-top:4px;">${snap.rewardDesc}</div></div>
    </div>
    <div class="card" style="display:flex;align-items:center;justify-content:center;">
      <div style="font-size:11px;color:#888;font-style:italic;text-align:center;">Risk &amp; reward scores are calculated from loan-to-value ratio, cash buffer, and government scheme contribution.</div>
    </div>
  </div>` : ''}

  ${incTimeline ? `
  <div class="section-title">06 · Purchase Timeline</div>
  <div class="card" style="padding-left:32px;position:relative;">
    <div style="position:absolute;left:16px;top:20px;bottom:20px;width:2px;background:linear-gradient(to bottom,#C9A84C,#7B9E87);border-radius:2px;"></div>
    ${[
      {phase:'01',color:'#C9A84C',title:'Offer Accepted & Contracts Exchanged',dur:'Week 1–2',desc:'Sign contracts, pay deposit. Cooling-off period applies (typically 5 business days).'},
      {phase:'02',color:'#C4704A',title:'Building & Pest Inspection',dur:'Week 1–3',desc:'Book a licensed inspector within the first week. Results within 24–48 hours.'},
      {phase:'03',color:'#5B8FAB',title:'Finance & Loan Finalisation',dur:'Week 2–5',desc:'Bank formally approves the loan. Government scheme contribution confirmed.'},
      {phase:'04',color:'#7B9E87',title:'Settlement Day 🔑',dur:'Week 4–12',desc:'Title transfers to your name. Keys handed over. You are now a homeowner.'},
      {phase:'05',color:'#E8A882',title:'Overlap Period',dur:document.getElementById('tl-overlap-dur-cal')?.textContent||'Weeks 1–4 post-settlement',desc:document.getElementById('tl-overlap-desc')?.textContent||''},
      {phase:'06',color:'#E8A882',title:'Renovations Complete',dur:'Month 3–5',desc:'Tradies finish, final inspections done. Property ready to move in.'},
      {phase:'07',color:'#5A9E7B',title:'Move In & Rent Ends 🎉',dur:'Month 4–6',desc:'You move in and your rent obligation ends.'},
    ].map(p=>`
    <div style="position:relative;padding:10px 0 10px;border-bottom:1px solid #f0ede8;">
      <div style="position:absolute;left:-24px;top:14px;width:10px;height:10px;border-radius:50%;background:${p.color};border:2px solid white;box-shadow:0 0 0 2px ${p.color};"></div>
      <div style="font-family:'DM Mono',monospace;font-size:8px;letter-spacing:2px;text-transform:uppercase;color:${p.color};margin-bottom:3px;">Phase ${p.phase} · <span style="background:rgba(0,0,0,0.06);padding:1px 6px;border-radius:8px;color:#666;">${p.dur}</span></div>
      <div style="font-size:12px;font-weight:600;margin-bottom:2px;">${p.title}</div>
      <div style="font-size:10px;color:#666;line-height:1.5;">${p.desc}</div>
    </div>`).join('')}
  </div>` : ''}

<!-- PDF Action Buttons -->
<div style="padding:20px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;border-top:1px solid #eee;margin-top:20px;">
  <button id="pdf-preview-print-btn" style="padding:12px 20px;background:#1C1C1E;border:none;border-radius:4px;color:#C9A84C;font-family:'DM Mono',monospace;font-size:12px;font-weight:600;cursor:pointer;letter-spacing:0.5px;">🖨 Print</button>
  <button id="pdf-preview-share-btn" style="padding:12px 20px;background:#7B9E87;border:none;border-radius:4px;color:white;font-family:'DM Mono',monospace;font-size:12px;font-weight:600;cursor:pointer;letter-spacing:0.5px;">↗ Share</button>
</div>
</div>
<script>
  document.addEventListener('DOMContentLoaded', function() {
    var printBtn = document.getElementById('pdf-print-btn');
    if (printBtn) printBtn.addEventListener('click', function() { window.print(); });
    var shareBtn = document.getElementById('pdf-share-btn');
    if (shareBtn) shareBtn.addEventListener('click', async function() {
      try {
        var r = await fetch(location.href); var b = await r.blob();
        var f = new File([b], 'property-report.html', {type:'text/html'});
        if (navigator.canShare && navigator.canShare({files:[f]})) { await navigator.share({files:[f], title:'Property Finance Report'}); }
        else if (navigator.share) { await navigator.share({title:'Property Finance Report', url:location.href}); }
        else { window.print(); }
      } catch(e) { window.print(); }
    });
    var previewPrint = document.getElementById('pdf-preview-print-btn');
    if (previewPrint) previewPrint.addEventListener('click', function() { window.print(); });
    var previewShare = document.getElementById('pdf-preview-share-btn');
    if (previewShare) previewShare.addEventListener('click', function() {
      if (navigator.share) { navigator.share({title:'Property Analysis', url:window.location.href}).catch(function(){}); }
      else { alert('Share not available'); }
    });
  });
  setTimeout(function(){if(window.matchMedia&&window.matchMedia('print').matches||navigator.userAgent.match(/print/i))window.print();},300);
<\/script>
</body></html>`;

    if(o._downloadAsHTML){
      var safeName = (snap.addr||'Property').replace(/[^a-zA-Z0-9 ]/g,'').trim().replace(/\s+/g,'-') || 'export';
      _downloadFile(safeName + '.html', html, 'text/html;charset=utf-8');
      showToast('HTML exported');
      return;
    }
    const blob = new Blob([html], {type:'text/html'});
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if(!win) showToast('⚠️ Popup blocked — allow popups for this site');
    setTimeout(()=>URL.revokeObjectURL(url), 60000);
  }

  function setAppHeight(){
    const header  = document.querySelector('header');
    const appBody = document.querySelector('.app-body');
    const navEl   = document.querySelector('nav');
    if(!header || !appBody) return;

    const headerH = header.offsetHeight;
    const navH    = navEl ? (navEl.offsetHeight || 44) : 44;

    // Always position fixed nav directly below the actual rendered header
    if(navEl) navEl.style.top = headerH + 'px';

    if(window.innerWidth <= 600){
      // Mobile: header is fixed, nav is fixed — app-body needs padding for both
      appBody.style.height     = '';
      appBody.style.marginTop  = '';
      appBody.style.paddingTop = (headerH + navH) + 'px';
    } else if(window.innerWidth <= 820){
      // Tablet: header is sticky, nav is fixed
      appBody.style.height     = '';
      appBody.style.marginTop  = '';
      appBody.style.paddingTop = navH + 'px';
    } else {
      // Desktop: inner scroll model — app-body fills remaining viewport
      appBody.style.paddingTop = '';
      appBody.style.marginTop  = navH + 'px';
      appBody.style.height     = (window.innerHeight - headerH - navH) + 'px';
    }
  }
  window.addEventListener('resize', setAppHeight);
  // Watch header for size changes (e.g. banner appears, status badge inserted, fonts load)
  // so tabs always reposition without relying on timing hacks
  (function(){
    var _hdr = document.querySelector('header');
    if(_hdr && typeof ResizeObserver !== 'undefined'){
      new ResizeObserver(function(){ requestAnimationFrame(setAppHeight); }).observe(_hdr);
    }
  })();

  // ══════════════════════════════════════════════
  // PROPERTY STATUS (item 2)
  // ══════════════════════════════════════════════
  function setStatus(status, btn, silent){
    document.getElementById('pd-status').value = status;
    document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    else{
      const found = document.querySelector(`.status-btn[data-status="${status}"]`);
      if(found) found.classList.add('active');
    }
    const dateWrap = document.getElementById('status-note-wrap');
    if(dateWrap) dateWrap.style.display = ['auction','offered','under-offer','unconditional'].includes(status) ? '' : 'none';
    if(!silent) syncKeyDatesFromStatus();
  }

  function syncKeyDatesFromStatus(){
    const status = document.getElementById('pd-status')?.value;
    const date   = document.getElementById('pd-status-date')?.value;
    if(!date) return;
    const labels = {
      'auction':'🔨 Auction Date','offered':'📝 Offer Date',
      'under-offer':'⏳ Under Offer Date','unconditional':'✅ Unconditional Date'
    };
    const label = labels[status]; if(!label) return;
    const existing = keyDates.findIndex(d=>d.label===label);
    if(existing>=0) keyDates[existing].date = date;
    else keyDates.push({id:'kd-status-'+Date.now(), date, label});
    renderKeyDates();
    autosaveDraft();
  }

  // ══════════════════════════════════════════════
  // KEY DATES (items 3 & 5)
  // ══════════════════════════════════════════════
  let keyDates = [];

  function addKeyDate(date='', label=''){
    keyDates.push({id:'kd-'+Date.now(), date, label});
    renderKeyDates();
    autosaveDraft();
  }

  function removeKeyDate(id){
    keyDates = keyDates.filter(d=>d.id!==id);
    renderKeyDates();
    autosaveDraft();
  }

  function updateKeyDate(id, field, val){
    const d = keyDates.find(x=>x.id===id);
    if(d){ d[field]=val; syncKeyDatesToTimeline(); autosaveDraft(); }
  }

  function formatDate(iso){
    if(!iso) return '';
    const [y,m,d] = iso.split('-');
    if(!d || !m || !y) return iso;
    return `${d}/${m}/${y.slice(-2)}`; // DD/MM/YY
  }
  function fmtDateFull(iso){ // DD/MM/YYYY for timestamps
    if(!iso) return '';
    const [y,m,d] = iso.split('-');
    if(!d || !m || !y) return iso;
    return `${d}/${m}/${y}`;
  }
  function renderKeyDates(){
    const list  = document.getElementById('key-dates-list');
    const empty = document.getElementById('key-dates-empty');
    if(!list) return;
    if(keyDates.length===0){
      list.innerHTML='';
      if(empty) empty.style.display='block';
    } else {
      if(empty) empty.style.display='none';
      list.innerHTML = [...keyDates].sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(d=>`
        <div class="kd-row" data-dateid="${escHtml(d.id)}">
          <input type="date" value="${escHtml(d.date||'')}" data-field="date">
          <input type="text" value="${escHtml(d.label||'')}" placeholder="Event (e.g. Inspection, Auction)" data-field="label">
          <button class="kd-del" data-action="del-date">✕</button>
        </div>`).join('');
    }
    syncKeyDatesToTimeline();
  }

  function syncKeyDatesToTimeline(){
    const card = document.getElementById('tl-key-dates-card');
    const list = document.getElementById('tl-key-dates-list');
    if(!card||!list) return;
    const sorted = [...keyDates].filter(d=>d.date||d.label).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    card.style.display = sorted.length ? '' : 'none';
    const today = new Date().toISOString().split('T')[0];
    const colors = ['var(--sky)','var(--gold)','var(--sage)','var(--terracotta)','var(--terracotta-light)','var(--reward-green)'];
    list.innerHTML = sorted.map((d,i)=>{
      const isPast  = d.date && d.date < today;
      const isToday = d.date === today;
      const fmt = d.date ? formatDate(d.date) : 'No date';
      return `<div class="tli">
        <div class="tld" style="color:${colors[i%colors.length]}"></div>
        <div class="tlp" style="color:${colors[i%colors.length]}">${escHtml(fmt)}${isPast?' · past':isToday?' · TODAY':''}</div>
        <div class="tlt">${escHtml(d.label||'Unnamed Event')}</div>
      </div>`;
    }).join('');
  }

  // ══════════════════════════════════════════════
  // AGENT DETAILS (item 1)
  // ══════════════════════════════════════════════
  function markAgentDirty(){ updateAgentLinks(); }

  function updateAgentLinks(){
    const phone = document.getElementById('ag-phone')?.value?.trim();
    const email = document.getElementById('ag-email')?.value?.trim();
    const callLink  = document.getElementById('ag-call-link');
    const emailLink = document.getElementById('ag-email-link');
    if(callLink)  { callLink.href  = phone ? `tel:${phone}` : '#';       callLink.style.display  = phone ? 'inline-flex' : 'none'; }
    if(emailLink) { emailLink.href = email ? `mailto:${email}` : '#';    emailLink.style.display = email ? 'inline-flex' : 'none'; }
  }

  // ══════════════════════════════════════════════
  // COMMUNICATIONS LOG (item 1)
  // ══════════════════════════════════════════════
  let commsLog = [];
  let commsFormVisible = false;

  function addCommsEntry(){
    if(commsFormVisible){ closeCommsForm(); return; }
    commsFormVisible = true;
    const list = document.getElementById('comms-list');
    const today = new Date().toISOString().split('T')[0];
    const formDiv = document.createElement('div');
    formDiv.id = 'comms-add-form';
    formDiv.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <div><div style="font-size:10px;font-family:'DM Mono',monospace;color:var(--slate);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">Date</div>
          <input type="date" id="cf-date" value="${today}" style="width:100%;background:rgba(28,28,30,0.05);border:1px solid rgba(28,28,30,0.12);padding:7px;border-radius:3px;font-family:'DM Mono',monospace;font-size:11px;color:var(--charcoal);"></div>
        <div><div style="font-size:10px;font-family:'DM Mono',monospace;color:var(--slate);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">Type</div>
          <select id="cf-type" style="width:100%;background:rgba(28,28,30,0.05);border:1px solid rgba(28,28,30,0.12);padding:7px;border-radius:3px;font-family:'DM Mono',monospace;font-size:11px;color:var(--charcoal);">
            <option>📞 Phone call</option><option>✉ Email</option><option>💬 Text / SMS</option>
            <option>🤝 In person</option><option>📋 Inspection note</option><option>📝 Other</option>
          </select></div>
      </div>
      <div style="margin-bottom:8px;"><div style="font-size:10px;font-family:'DM Mono',monospace;color:var(--slate);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">Note</div>
        <textarea id="cf-text" rows="3" placeholder="What was discussed? Any key info from the agent?" style="width:100%;background:rgba(28,28,30,0.05);border:1px solid rgba(28,28,30,0.12);border-radius:3px;padding:8px;font-family:'DM Sans',sans-serif;font-size:12px;color:var(--charcoal);resize:vertical;outline:none;line-height:1.5;"></textarea></div>
      <div style="display:flex;gap:8px;">
        <button id="cf-submit-entry" style="flex:1;background:var(--charcoal);color:var(--gold);border:none;border-radius:3px;padding:8px;font-family:'DM Mono',monospace;font-size:11px;cursor:pointer;letter-spacing:0.5px;">＋ Add Entry</button>
        <button id="cf-cancel-entry" style="padding:8px 14px;background:rgba(28,28,30,0.06);border:1px solid rgba(28,28,30,0.12);border-radius:3px;font-family:'DM Mono',monospace;font-size:11px;cursor:pointer;color:var(--slate);">Cancel</button>
      </div>`;
    if(list) list.insertBefore(formDiv, list.firstChild);
    var cfSubmit = document.getElementById('cf-submit-entry');
    if(cfSubmit) cfSubmit.addEventListener('click', submitCommsEntry);
    var cfCancel = document.getElementById('cf-cancel-entry');
    if(cfCancel) cfCancel.addEventListener('click', closeCommsForm);
  }

  function closeCommsForm(){
    commsFormVisible = false;
    const f = document.getElementById('comms-add-form');
    if(f) f.remove();
  }

  function submitCommsEntry(){
    const date = document.getElementById('cf-date')?.value||'';
    const type = document.getElementById('cf-type')?.value||'';
    const text = document.getElementById('cf-text')?.value?.trim()||'';
    if(!text){ showToast('⚠️ Add a note before submitting'); return; }
    commsLog.unshift({id:'cm-'+Date.now(), date, type, text});
    closeCommsForm();
    renderCommsLog();
    autosaveDraft();
  }

  function deleteCommsEntry(id){
    commsLog = commsLog.filter(c=>c.id!==id);
    renderCommsLog();
    autosaveDraft();
  }

  function renderCommsLog(){
    const list  = document.getElementById('comms-list');
    const empty = document.getElementById('comms-empty');
    if(!list) return;
    list.querySelectorAll('.comms-entry').forEach(e=>e.remove());
    if(commsLog.length===0){
      if(empty) empty.style.display='block';
    } else {
      if(empty) empty.style.display='none';
      commsLog.forEach(c=>{
        const fmtDate = c.date ? formatDate(c.date) : '';
        const div = document.createElement('div');
        div.className = 'comms-entry';
        div.dataset.commid = c.id;
        div.innerHTML = `
          <div class="comms-meta">
            <span class="comms-date">${_escBanner(fmtDate)}</span>
            <span class="comms-type">${_escBanner(c.type||'Note')}</span>
            <button class="comms-del" data-action="del-comm" title="Delete">✕</button>
          </div>
          <div class="comms-text">${_escBanner(c.text)}</div>`;
        list.appendChild(div);
      });
    }
  }

  // ══════════════════════════════════════════════
  // MOBILE SIDEBAR TOGGLE (item 4)
  // ══════════════════════════════════════════════
  function toggleMobileSidebar(){
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('mobile-overlay');
    const isOpen  = sidebar?.classList.contains('mobile-open');
    if(isOpen){
      sidebar?.classList.remove('mobile-open');
      overlay?.classList.remove('open');
      document.body.classList.remove('sidebar-open');
    } else {
      sidebar?.classList.add('mobile-open');
      overlay?.classList.add('open');
      document.body.classList.add('sidebar-open');
    }
  }

  // ── SEED DEFAULT PURCHASE & MOVE-OUT COSTS ──
  dynCosts = [
    {id:'dyn-'+dynId++, name:'Stamp Duty',          amount:0,    category:'purchase'},
    {id:'dyn-'+dynId++, name:'Bank / Lender Fees',  amount:800,  category:'purchase'},
    {id:'dyn-'+dynId++, name:'Conveyancing',        amount:1600, category:'purchase'},
    {id:'dyn-'+dynId++, name:'Building & Pest',     amount:700,  category:'purchase'},
    {id:'dyn-'+dynId++, name:'Removalists',         amount:1200, category:'moveout'},
    {id:'dyn-'+dynId++, name:'Lease Break Fee',     amount:0,    category:'moveout'},
  ];
  renderDynCosts();

  // ── SEED DEFAULT RENO ITEMS (item 13 — now fully dynamic) ──
  const defaultReno = [
    {emoji:'🎨', name:'Paint',       amount:3500, note:''},
    {emoji:'🍳', name:'Kitchen',     amount:5000, note:''},
    {emoji:'🚿', name:'Bathroom',    amount:4500, note:''},
    {emoji:'🪵', name:'Flooring',    amount:4000, note:''},
    {emoji:'💡', name:'Electrical',  amount:2000, note:''},
    {emoji:'🌿', name:'Landscaping', amount:2000, note:''},
  ];
  defaultReno.forEach(r => renoItems.push({id:'ri-'+renoItemId++, ...r}));
  renderRenoItems();

  const PROFILE_KEY_BASE = 'propCalc_profile_v1';
  function getProfileKey(){
    const uid = (_currentUser && (_currentUser.id || _currentUser.userId)) || 'guest';
    return PROFILE_KEY_BASE + '_' + uid;
  }
  const SESSION_KEY = 'propCalc_session_v1';
  let _profileData  = {name:'',email:'',color:'#C9A84C',photo:''};
  let _currentUser  = null; // null=guest, {name,email,id}=logged in

  var SPLASH_SEEN_KEY = 'propCalc_splash_seen';
  // ?reset URL param clears stuck draft (useful if extreme values broke the app)
  if(new URLSearchParams(window.location.search).has('reset')){
    try{ lsSet('propCalc_draft_v1', null); localStorage.removeItem('propCalc_draft_v1'); }catch(e){}
    const cleanUrl = window.location.pathname;
    window.history.replaceState(null, '', cleanUrl);
  }
  // Load session early so updateSavedCount has auth for the cloud fetch
  try{ var _earlySession = lsGet(SESSION_KEY); if(_earlySession) _currentUser = JSON.parse(_earlySession); }catch(e){}
  const _hadDraft = restoreDraft();
  try { recalc(); } catch(e) { console.error('recalc init error:', e); }
  try { updatePropertyDetails(); } catch(e) { console.error('updatePropertyDetails init error:', e); }
  updateSavedCount();
  setAppHeight();
  // Re-measure after fonts load — web fonts can change header height slightly
  if(document.fonts && document.fonts.ready){
    document.fonts.ready.then(function(){ setTimeout(setAppHeight, 50); });
  }
  drawProjection();
  loadProfile();

  // Auth guard handled in <head> script — redirects to login.html if not signed in

  if(_hadDraft){
    // Re-fetch suburb growth rate for restored draft
    setTimeout(function(){
      var suburbEl = document.getElementById('pd-suburb');
      if(suburbEl && suburbEl.value.trim()) onSuburbChange();
    }, 500);
    setTimeout(function(){
      var addr = (document.getElementById('pd-address') && document.getElementById('pd-address').value.trim()) || '';
      // Update page title with restored address
      if(addr){ var tEl = document.getElementById('page-title'); if(tEl) tEl.textContent = addr; }
      showToast(addr ? '↩️ Restored: ' + _escBanner(addr) : '↩️ Draft restored');
    }, 600);
  } else if(!localStorage.getItem('propCalc_splash_seen')) {
    setTimeout(showWelcomeSplash, 300);
  } else {
    setTimeout(function(){ showToast('👋 Fill in your property details to get started'); }, 900);
  }


  // ══════════════════════════════════════════════
  // AUTH + PROFILE SYSTEM
  // ══════════════════════════════════════════════

  async function callAuthFn(action, payload){
    try{
      const r = await fetch('/.netlify/functions/auth', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({action, ...payload})
      });
      return await r.json();
    } catch(e){ return {ok:false, error:'Network error'}; }
  }

  function loadProfile(){
    try{
      // IMPORTANT: load session FIRST so getProfileKey() has the correct userId
      const sess = lsGet(SESSION_KEY);
      if(sess) _currentUser = JSON.parse(sess);
      // Now load profile keyed to this specific user (not shared 'guest' key)
      const raw = lsGet(getProfileKey());
      if(raw) _profileData = Object.assign({name:'',email:'',color:'#C9A84C',photo:''}, JSON.parse(raw));
      // Sync name/email from session if profile is blank
      if(_currentUser && !_profileData.name) _profileData.name = _currentUser.name || '';
      if(_currentUser && !_profileData.email) _profileData.email = _currentUser.email || '';
    } catch(e){}
    renderProfileBtn();
    renderProfilePanel();
    applyPlanUI();
    // Load government schemes from backend/cache
    setTimeout(loadSchemesFromBackend, 200);
    // Background sync: refresh plan/role from server so admin changes take effect without re-login
    // Also fetch latest profile including photo from Redis
    if(_currentUser && _currentUser.id && ON_NETLIFY){
      callAuthFn('verify', {}).then(function(d){
        if(!d.ok) return;
        var changed = d.plan !== _currentUser.plan || d.role !== _currentUser.role;
        if(changed){
          _currentUser.plan = d.plan;
          _currentUser.role = d.role;
          lsSet(SESSION_KEY, JSON.stringify(_currentUser));
          applyPlanUI();
          typeof renderSiteNav === 'function' && renderSiteNav();
        }
        // Update subscription status fields
        if(d.canceledAt || d.expiresAt || d.renewsAt){
          if(d.canceledAt) _currentUser.canceledAt = d.canceledAt;
          if(d.expiresAt) _currentUser.expiresAt = d.expiresAt;
          if(d.renewsAt) _currentUser.renewsAt = d.renewsAt;
          lsSet(SESSION_KEY, JSON.stringify(_currentUser));
        }
        // Fetch latest profile from Redis (includes photo)
        callAuthFn('getProfile', {}).then(function(p){
          if(p.ok && p.profile){
            try {
              var PROFILE_BASE = 'propCalc_profile_v1';
              var profileKey = PROFILE_BASE + '_' + (_currentUser.id || _currentUser.email || 'guest');
              lsSet(profileKey, JSON.stringify(p.profile));
              // Refresh profile display if panel is open
              if(typeof apRenderPanel === 'function') apRenderPanel();
            } catch(e) { console.log('Could not cache profile:', e); }
          }
        }).catch(function(){});
      }).catch(function(){});
    }
  }

  // ── SCHEME SELECTOR ──────────────────────────────────────────
  var _schemes = [];

  function updateSchemeInfo(){
    var infoEl = document.getElementById('scheme-info');
    if(!infoEl) return;
    var sel = document.getElementById('scheme-select');
    if(!sel || !sel.value){ infoEl.style.display='none'; return; }
    var opt = sel.querySelector('option[value="'+sel.value+'"]');
    if(!opt){ infoEl.style.display='none'; return; }
    var maxPrice = parseInt(opt.dataset.max) || 0;
    if(!maxPrice){ infoEl.style.display='none'; return; }
    var currentPrice = parseFloat(document.getElementById('inp-price').value) || 0;
    infoEl.style.display = 'block';
    if(currentPrice > 0 && currentPrice > maxPrice){
      infoEl.innerHTML = '⚠️ Price exceeds scheme cap of <strong>'+fmt(maxPrice)+'</strong>. You may not qualify.';
      infoEl.style.color = 'var(--risk-red)';
      infoEl.style.borderColor = 'rgba(220,80,60,0.25)';
      infoEl.style.background = 'rgba(220,80,60,0.06)';
    } else {
      infoEl.innerHTML = 'ℹ️ Max eligible price: <strong>'+fmt(maxPrice)+'</strong>';
      infoEl.style.color = 'rgba(201,168,76,0.7)';
      infoEl.style.borderColor = 'rgba(255,255,255,0.08)';
      infoEl.style.background = 'rgba(255,255,255,0.04)';
    }
  }

  function applySelectedScheme(schemeId){
    var infoEl = document.getElementById('scheme-info');
    if(!schemeId){
      if(infoEl){ infoEl.style.display='none'; }
      return;
    }
    var sel = document.getElementById('scheme-select');
    var opt = sel ? sel.querySelector('option[value="'+schemeId+'"]') : null;
    var pct = opt ? parseFloat(opt.dataset.pct) : null;
    if(pct !== null && !isNaN(pct)){
      var govtInput = document.getElementById('inp-govt');
      var govtRange = document.getElementById('rng-govt');
      if(govtInput){ govtInput.value = pct; }
      if(govtRange){ govtRange.value = pct; }
      rl('govt', pct);
      recalc();
      showToast('✓ Applied: ' + _escBanner(opt ? opt.textContent.split('(')[0].trim() : schemeId));
    }
    updateSchemeInfo();
  }

  function loadSchemesFromBackend(){
    // First try localStorage cache (set by admin page)
    try {
      var cached = localStorage.getItem('propCalc_schemes_v1');
      if(cached){
        var schemes = JSON.parse(cached);
        if(Array.isArray(schemes) && schemes.length) {
          _schemes = schemes;
          populateSchemeDropdown(schemes);
          return;
        }
      }
    } catch(e){}
    // Try fetching from backend
    if(!isLoggedIn() || typeof ON_NETLIFY === 'undefined' || !ON_NETLIFY) return;
    fetch('/.netlify/functions/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getSchemes' })
    }).then(function(r){ return r.json(); }).then(function(d){
      if(d.ok && d.schemes && d.schemes.length){
        _schemes = d.schemes;
        try { localStorage.setItem('propCalc_schemes_v1', JSON.stringify(d.schemes)); } catch(e){}
        populateSchemeDropdown(d.schemes);
      }
    }).catch(function(){});
  }

  function populateSchemeDropdown(schemes){
    var sel = document.getElementById('scheme-select');
    if(!sel) return;
    var active = schemes.filter(function(s){ return s.active !== false; });
    // Keep the "no scheme" option, rebuild the rest
    sel.innerHTML = '<option value="">No scheme (manual entry below)</option>' +
      active.map(function(s){
        return '<option value="'+escHtml(s.id)+'" data-pct="'+escHtml(String(s.govtDefaultPct))+'" data-max="'+(s.maxPropertyPrice||700000)+'">'
          + escHtml(s.name) + ' (' + escHtml(String(s.govtDefaultPct)) + '% — ' + escHtml(s.country||'') + ')'
          + '</option>';
      }).join('');
  }

  // Load site config from localStorage (written by admin page) and apply feature flags
  function loadSiteConfig(){
    try {
      var raw = localStorage.getItem('propCalc_siteConfig_v1');
      if(raw){
        var cfg = JSON.parse(raw);
        applyFeatureFlags(cfg);
      }
    } catch(e){}
    // Always fetch fresh config from backend so maintenance/banner changes are immediate
    var sess = null;
    try { sess = JSON.parse(localStorage.getItem('propCalc_session_v1')); } catch(e){}
    if(sess && sess.id && typeof ON_NETLIFY !== 'undefined' && ON_NETLIFY){
      fetch('/.netlify/functions/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'adminGetConfig' })
      }).then(function(r){ return r.json(); }).then(function(d){
        if(d.ok && d.config){
          try { localStorage.setItem('propCalc_siteConfig_v1', JSON.stringify(d.config)); } catch(e){}
          applyFeatureFlags(d.config);
        }
      }).catch(function(){});
    }
  }

  // Simple HTML escape for banner text
  function _escBanner(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function applyFeatureFlags(cfg){
    if(!cfg) return;

    // ── Maintenance Mode ──────────────────────────────────────────
    var maintOverlay = document.getElementById('maintenance-overlay');
    if(cfg.maintenanceMode){
      var userRole = (_currentUser && _currentUser.role) || '';
      if(userRole !== 'admin'){
        if(maintOverlay){
          var msg = document.getElementById('maintenance-msg');
          if(msg) msg.textContent = cfg.maintenanceMessage || "We'll be back shortly — upgrading our systems.";
          maintOverlay.style.display = 'flex';
        }
        return; // Stop applying other flags — page is in maintenance
      }
    } else {
      // Ensure overlay is hidden if maintenance mode was previously on
      if(maintOverlay) maintOverlay.style.display = 'none';
    }

    // ── Announcement Banner ───────────────────────────────────────
    var banner = document.getElementById('announce-banner');
    if(banner){
      var bannerText = cfg.bannerText || '';
      var bannerExpiry = cfg.bannerExpiry;
      var bannerActive = bannerText && (!bannerExpiry || new Date(bannerExpiry + 'T23:59:59') >= new Date());
      if(bannerActive){
        var type = cfg.bannerType || 'info';
        var bannerStyles = {
          info:    {bg:'rgba(91,143,171,0.18)',  color:'#4a7d9a', border:'rgba(91,143,171,0.35)'},
          success: {bg:'rgba(90,158,123,0.15)',  color:'#3d8a62', border:'rgba(90,158,123,0.35)'},
          warning: {bg:'rgba(201,168,76,0.18)',  color:'#7a5e1a', border:'rgba(201,168,76,0.45)'},
          danger:  {bg:'rgba(196,90,90,0.15)',   color:'#a03535', border:'rgba(196,90,90,0.35)'}
        };
        var bs = bannerStyles[type] || bannerStyles.info;
        if(banner.style.display === 'none' || !banner.dataset.shown){
          banner.dataset.shown = '1';
          banner.style.cssText = 'display:block;padding:9px 48px 9px 16px;font-size:13px;text-align:center;position:relative;line-height:1.4;'
            + 'background:' + bs.bg + ';color:' + bs.color + ';border-bottom:1px solid ' + bs.border + ';';
          banner.innerHTML = '<span>' + _escBanner(bannerText) + '</span>'
            + '<button id="announce-dismiss-btn" '
            + 'style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;'
            + 'color:currentColor;font-size:20px;cursor:pointer;opacity:0.55;padding:0 4px;line-height:1;" title="Dismiss">×</button>';
          var dismissBtn = document.getElementById('announce-dismiss-btn');
          if(dismissBtn) dismissBtn.addEventListener('click', function(){ banner.style.display='none'; setTimeout(setAppHeight,0); });
          // Recompute layout since header is now taller
          setTimeout(setAppHeight, 0);
        }
      } else {
        banner.style.display = 'none';
        delete banner.dataset.shown;
      }
    }

    // ── Admin View All Scenarios feature flag ─────────────────────
    _adminViewAllEnabled = !!cfg.adminViewAllScenarios;
    var adminSection = document.getElementById('admin-all-section');
    if(adminSection && !_adminViewAllEnabled){
      adminSection.style.display = 'none';
      adminSection.innerHTML = '';
    }

    // ── PDF Export feature flag ───────────────────────────────────
    var pdfEnabled = cfg.enablePdfExport !== false;
    // Also respect plan — only show if both admin-enabled AND user is pro
    var pdfVisible = pdfEnabled && isPro();
    document.querySelectorAll('.export-btn[title*="PDF"], .export-btn[onclick*="exportPDF"]').forEach(function(el){
      el.style.display = pdfVisible ? '' : 'none';
    });

    // ── Projection tab feature flag ───────────────────────────────
    var projEnabled = cfg.enableProjections !== false;
    var projBtn = document.getElementById('tab-projection-btn');
    if(projBtn) projBtn.style.display = projEnabled ? '' : 'none';
    // Toggle upgrade prompt vs projection content for free users
    toggleProjectionGate();
  }

  function applyPlanUI(){
    var pro = isPro();
    // Hide projection lock icon for pro users
    var lock = document.getElementById('proj-lock');
    if(lock) lock.style.display = pro ? 'none' : 'inline';
    // Hide PDF button entirely for free users (plan-based, not just toast)
    document.querySelectorAll('.export-btn[onclick*="exportPDF"],.export-btn[title*="PDF"]').forEach(function(el){
      el.style.display = pro ? '' : 'none';
    });
    // Show/hide upgrade banner in header if free
    var plan = getUserPlan();
    var badge = document.getElementById('plan-badge');
    if(badge) badge.textContent = plan === 'free' ? 'Starter' : 'Pro';
    // Toggle projection upgrade prompt vs content
    toggleProjectionGate();
    // Apply site feature flags (admin-controlled global toggles)
    loadSiteConfig();
  }

  // Show upgrade prompt or projection content based on plan
  function toggleProjectionGate(){
    var pro = isPro();
    var prompt = document.getElementById('proj-upgrade-prompt');
    var section = document.getElementById('projection');
    if(!prompt || !section) return;
    prompt.style.display = pro ? 'none' : 'block';
    // Hide/show all projection content siblings (everything after the prompt)
    var children = section.children;
    for(var i = 0; i < children.length; i++){
      var el = children[i];
      if(el.id === 'proj-upgrade-prompt' || el.classList.contains('sl')) continue;
      el.style.display = pro ? '' : 'none';
    }
  }

  function isLoggedIn(){
    return !!(_currentUser && _currentUser.id);
  }

  function getUserPlan(){
    return (_currentUser && _currentUser.plan) || 'free';
  }
  function isPro(){
    return getUserPlan() === 'pro' || getUserPlan() === 'adviser';
  }
  window.isPro = isPro;
  function requirePro(featureName){
    if(isPro()) return true;
    trackUsage('pro_upgrade_prompt');
    // Track feature gating - free user attempted to access pro feature
    if(window.trackFeatureGated) trackFeatureGated(featureName, 'attempted_access');
    showToast('🔒 ' + featureName + ' is a Pro feature — <a href="/pricing" style="color:var(--gold);text-decoration:underline;">Upgrade to Pro</a>', 5000);
    return false;
  }
  window.requirePro = requirePro;

  // Returns current user ID for body-fallback auth (works even without token)
  function getUserId(){
    return (_currentUser && (_currentUser.id || _currentUser.userId)) || null;
  }

  function renderProfileBtn(){
    const btn = document.getElementById('profile-btn');
    if(!btn) return;
    const name  = (_currentUser && _currentUser.name) || _profileData.name || '';
    const color = _profileData.color || '#C9A84C';
    if(safePhotoSrc(_profileData.photo)){
      btn.style.background = 'transparent';
      btn.style.padding = '0';
      btn.innerHTML = '<img src="' + safePhotoSrc(_profileData.photo) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;pointer-events:none;display:block;">';
    } else {
      var ppParts = name ? name.trim().split(/\s+/).filter(Boolean) : [];
      var initials = ppParts.length===0?'?':ppParts.length===1?ppParts[0][0].toUpperCase():(ppParts[0][0]+ppParts[ppParts.length-1][0]).toUpperCase();
      btn.style.background = color;
      btn.style.padding = '';
      btn.textContent = initials;
    }
    // Keep top-right widget in sync
    typeof renderSiteNav === 'function' && renderSiteNav();
  }

  function renderProfilePanel(){
    const name  = (_currentUser && _currentUser.name)  || _profileData.name  || '';
    const email = (_currentUser && _currentUser.email) || _profileData.email || '';
    const color = _profileData.color || '#C9A84C';
    const nameD  = document.getElementById('pp-name-display');
    const emailD = document.getElementById('pp-email-display');
    const nameI  = document.getElementById('pp-name-input');
    const emailI = document.getElementById('pp-email-input');
    const avd    = document.getElementById('pp-avatar-display');
    if(nameD)  nameD.textContent  = name  || 'Your Name';
    if(emailD) emailD.textContent = email || (_currentUser ? '' : 'Guest — not signed in');
    if(nameI)  nameI.value  = name;
    if(emailI) emailI.value = email;
    if(avd){
      if(safePhotoSrc(_profileData.photo)){
        avd.innerHTML = '<img src="' + safePhotoSrc(_profileData.photo) + '">';
        avd.style.background = 'transparent';
      } else {
        avd.textContent = name ? name.split(' ').map(function(w){return w[0];}).join('').toUpperCase().slice(0,2) : '?';
        avd.style.background = color;
      }
    }
    const signBtn = document.getElementById('pp-signout-btn');
    if(signBtn){
      if(_currentUser){
        signBtn.textContent = 'Sign Out';
        signBtn.onclick = signOut;
      } else {
        signBtn.textContent = '🔑 Sign In / Create Account';
        signBtn.onclick = function(){ location.href='/login'; };
      }
    }
    const ct   = document.getElementById('saved-count');
    const ppS  = document.getElementById('pp-stat-saved');
    if(ppS) ppS.textContent = (ct && ct.textContent !== '0') ? ct.textContent : '—';
    const ppL  = document.getElementById('pp-stat-last');
    if(ppL){
      const n = new Date();
      ppL.textContent = String(n.getDate()).padStart(2,'0')+'/'+String(n.getMonth()+1).padStart(2,'0')+'/'+String(n.getFullYear()).slice(-2);
    }
    const ppSt = document.getElementById('pp-stat-storage');
    if(ppSt) ppSt.textContent = _currentUser ? '☁ Cloud account' : (typeof ON_NETLIFY !== 'undefined' && ON_NETLIFY ? '☁ Cloud (guest)' : '💾 Local');
    document.querySelectorAll('.pp-color-btn').forEach(function(el){
      el.classList.toggle('active', el.dataset.color === color);
    });
  }

  function previewProfileName(val){
    const d = document.getElementById('pp-name-display');
    if(d) d.textContent = val || 'Your Name';
    const avd = document.getElementById('pp-avatar-display');
    if(avd && !_profileData.photo){
      avd.textContent = val ? val.split(' ').map(function(w){return w[0];}).join('').toUpperCase().slice(0,2) : '?';
    }
  }

  function setProfileColor(color){
    _profileData.color = color;
    // Immediately persist the colour so it propagates across all pages
    lsSet(getProfileKey(), JSON.stringify(_profileData));
    const avd = document.getElementById('pp-avatar-display');
    if(avd && !_profileData.photo) avd.style.background = color;
    document.querySelectorAll('.pp-color-btn').forEach(function(el){
      el.classList.toggle('active', el.dataset.color === color);
    });
    renderProfileBtn();
  }

  function handleProfilePhoto(input){
    const file = input.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = function(e){
      const img = new Image();
      img.onload = function(){
        // Use 320×320 for crisp display at all sizes — square-crop centred
        const size = Math.min(img.width, img.height, 320);
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        c.getContext('2d').drawImage(img, (img.width-size)/2, (img.height-size)/2, size, size, 0, 0, size, size);
        _profileData.photo = c.toDataURL('image/jpeg', 0.92);
        renderProfileBtn(); renderProfilePanel();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function saveProfile(){
    _profileData.name  = (document.getElementById('pp-name-input')  && document.getElementById('pp-name-input').value.trim())  || '';
    _profileData.email = (document.getElementById('pp-email-input') && document.getElementById('pp-email-input').value.trim()) || '';
    // Keep _currentUser in sync so renderProfilePanel shows the updated name immediately
    if(_currentUser && _profileData.name) _currentUser.name = _profileData.name;
    lsSet(getProfileKey(), JSON.stringify(_profileData));
    renderProfileBtn(); renderProfilePanel();
    closeProfile();
    showToast('✓ Profile saved');
  }

  function openProfile(){
    renderProfilePanel();
    const panel   = document.getElementById('profile-panel');
    const overlay = document.getElementById('profile-overlay');
    if(panel)   panel.classList.add('open');
    if(overlay) overlay.classList.add('open');
  }

  // ── TOP-RIGHT PROFILE WIDGET ──────────────────────────────────
  function toggleAppTheme(){
    const isDark = document.documentElement.classList.toggle('dark-mode');
    try{ localStorage.setItem('equitySight_theme', isDark ? 'dark' : 'light'); }catch(e){}
    const btn = document.getElementById('app-theme-toggle');
    if(btn) btn.textContent = isDark ? '☀️ Light mode' : '🌙 Dark mode';
  }
  // Update theme button label on page load
  (function(){
    const btn = document.getElementById('app-theme-toggle');
    if(btn && document.documentElement.classList.contains('dark-mode')) btn.textContent = '☀️ Light mode';
  })();

  function toggleAppProfileMenu(){
    const menu = document.getElementById('app-profile-menu');
    if(!menu) return;
    const isOpen = menu.style.display === 'block';
    if(!isOpen) renderAppProfileBtn(); // refresh admin link visibility on open
    menu.style.display = isOpen ? 'none' : 'block';
  }
  function closeAppProfileMenu(){
    const menu = document.getElementById('app-profile-menu');
    if(menu) menu.style.display = 'none';
  }
  function renderAppProfileBtn(){
    const btn   = document.getElementById('app-profile-btn');
    const nameEl  = document.getElementById('app-profile-name');
    const emailEl = document.getElementById('app-profile-email');
    if(!btn) return;
    const name  = (_currentUser && _currentUser.name)  || _profileData.name  || '';
    const email = (_currentUser && _currentUser.email) || _profileData.email || '';
    const color = _profileData.color || '#C9A84C';
    const photo = safePhotoSrc(_profileData.photo || '');
    if(photo){
      btn.style.background = 'transparent';
      btn.style.padding = '0';
      btn.innerHTML = '<img src="' + photo + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;pointer-events:none;display:block;">';
    } else {
      var parts2 = name ? name.trim().split(/\s+/).filter(Boolean) : [];
      var ini = parts2.length===0?'?':parts2.length===1?parts2[0][0].toUpperCase():(parts2[0][0]+parts2[parts2.length-1][0]).toUpperCase();
      btn.style.background = color;
      btn.style.padding = '';
      btn.textContent = ini;
    }
    if(nameEl)  nameEl.textContent  = name  || 'Account';
    if(emailEl) emailEl.textContent = email || '';
    const adminLink = document.getElementById('app-admin-link');
    if(adminLink) adminLink.style.display = (_currentUser && _currentUser.role === 'admin') ? 'flex' : 'none';
  }
  function appSignOut(){
    signOut();
  }
  // After full page load, re-render the top-right profile button via auth-nav
  window.addEventListener('load', function(){
    typeof renderSiteNav === 'function' && renderSiteNav();
    setAppHeight(); // recalculate after all elements are rendered
    // Extra recalc for PWA/iOS where safe-area-inset and font rendering settle after load
    setTimeout(setAppHeight, 200);
    setTimeout(setAppHeight, 600);
  });

  function closeProfile(){
    const panel   = document.getElementById('profile-panel');
    const overlay = document.getElementById('profile-overlay');
    if(panel)   panel.classList.remove('open');
    if(overlay) overlay.classList.remove('open');
  }




  function showPageSpinner(){ var s=document.getElementById('page-spinner'); if(s) s.classList.add('show'); }

  async function signOut(){
    var ok = await appConfirm('Sign Out', 'Are you sure you want to sign out?', {icon:'→', confirmLabel:'Sign Out'});
    if(!ok) return;
    showPageSpinner();
    callAuthFn('signout', {}).catch(function(){});
    lsDel(SESSION_KEY);
    location.href = '/login';
  }

  // ── NEW SCENARIO ──
  async function newScenario(){
    if(_isDirty){
      var ok = await appConfirm('New Scenario', 'Start a new scenario? Unsaved changes will be lost.', {icon:'✨', confirmLabel:'Start New'});
      if(!ok) return;
    }
    var defaults = {
      'inp-price':'0','inp-savings':'0','inp-depp':'10',
      'inp-govt':'0','inp-rate':'6.5','inp-term':'30',
      'inp-cont':'15','inp-rent':'0','inp-weeks':'4',
      'inp-offset':'0','inp-income':'0'
    };
    Object.keys(defaults).forEach(function(id){
      var val = defaults[id];
      var inp = document.getElementById(id);
      var rng = document.getElementById(id.replace('inp-','rng-'));
      if(inp) inp.value = val;
      if(rng) rng.value = val;
      rl(id.replace('inp-',''), parseFloat(val)||0);
    });
    // Default settlement date to ~6 weeks from today
    var inpSettle = document.getElementById('inp-settle-date');
    if(inpSettle){
      var sd = new Date(); sd.setDate(sd.getDate() + 42);
      inpSettle.value = sd.toISOString().split('T')[0];
      onSettleDateChange();
    }
    // Clear active scheme
    var schemeSel = document.getElementById('scheme-select');
    if(schemeSel) schemeSel.value = '';
    var schemeInfo = document.getElementById('scheme-info');
    if(schemeInfo){ schemeInfo.style.display='none'; }
    ['pd-address','pd-suburb','pd-state','pd-url','pd-notes','pd-photo-url',
     'ag-agency','ag-name','ag-phone','ag-email','inp-address'].forEach(function(id){
      var el = document.getElementById(id); if(el) el.value='';
    });
    ['pd-bed','pd-bath','pd-car'].forEach(function(id){
      var el = document.getElementById(id); if(el) el.value='0';
    });
    ['pd-land','pd-house','pd-year'].forEach(function(id){
      var el = document.getElementById(id); if(el) el.value='';
    });
    dynCosts = [
      {id:'dyn-'+dynId++, name:'Stamp Duty',          amount:0,    category:'purchase'},
      {id:'dyn-'+dynId++, name:'Bank / Lender Fees',  amount:800,  category:'purchase'},
      {id:'dyn-'+dynId++, name:'Conveyancing',        amount:1600, category:'purchase'},
      {id:'dyn-'+dynId++, name:'Building & Pest',     amount:700,  category:'purchase'},
      {id:'dyn-'+dynId++, name:'Removalists',         amount:1200, category:'moveout'},
      {id:'dyn-'+dynId++, name:'Lease Break Fee',     amount:0,    category:'moveout'},
    ];
    renderDynCosts();
    renoItems=[]; renderRenoItems();
    keyDates=[]; renderKeyDates();
    commsLog=[]; renderCommsLog();
    var browsingBtn = document.querySelector('[data-status="browsing"]');
    if(browsingBtn) setStatus('browsing', browsingBtn);
    clearPropPhoto();
    // Reset checkboxes
    var fhbEl = document.getElementById('inp-fhb'); if(fhbEl) fhbEl.checked = false;
    var newPropEl = document.getElementById('inp-new-prop'); if(newPropEl) newPropEl.checked = false;
    var houseBtn = document.querySelector('.prop-type-btn');
    if(houseBtn) setPropType(houseBtn,'House');
    // Reset page title
    var titleEl = document.getElementById('page-title');
    if(titleEl) titleEl.textContent = 'New Property';
    var subEl = document.getElementById('header-sub-text');
    if(subEl) subEl.textContent = 'Add property details in the Property tab to get started';
    _lastSavedAddr = null; _isDirty = false;
    if(_readOnlyMode) disableReadOnlyMode();
    lsDel(DRAFT_KEY);
    var propTabBtn = document.querySelector('.tab[data-tab="property"]');
    if(propTabBtn) showTab('property', propTabBtn);
    updateUnsavedBadge(); recalc();
    showToast('✨ New scenario ready');
  }

  // ── WELCOME SPLASH ──
  function showWelcomeSplash(){
    var splash = document.getElementById('welcome-splash');
    if(splash){ splash.style.display = 'flex'; }
  }
  function hideSplash(){
    var splash = document.getElementById('welcome-splash');
    if(!splash) return;
    splash.classList.add('hiding');
    setTimeout(function(){ splash.style.display='none'; splash.classList.remove('hiding'); }, 420);
    try{ localStorage.setItem('propCalc_splash_seen','1'); }catch(e){}
  }
  function splashNewScenario(){ hideSplash(); }
  function splashOpenLibrary(){
    hideSplash();
    setTimeout(openScenariosModal, 300);
  }


  // ── COLLAPSIBLE SIDEBAR ──
  var _sidebarCollapsed = false;
  function toggleSidebarCollapse(){
    var sb = document.querySelector('.sidebar');
    var btn = document.getElementById('sidebar-toggle');
    var appBody = document.querySelector('.app-body');
    _sidebarCollapsed = !_sidebarCollapsed;
    if(_sidebarCollapsed){
      sb.classList.add('collapsed');
      if(btn) btn.textContent = '›';
      if(appBody) appBody.style.gridTemplateColumns = '48px 1fr';
    } else {
      sb.classList.remove('collapsed');
      if(btn) btn.textContent = '‹';
      if(appBody) appBody.style.gridTemplateColumns = '';
    }
  }


  // ═══════════════════════════════════════════════
  // FLOATING ACCOUNT PANEL
  // ═══════════════════════════════════════════════
  const AP_COLORS = ['#C9A84C','#7B9E87','#5B8FAB','#C4704A','#C45A5A','#8B6FAE','#4A9E8A','#B0956E'];


  // Handle URL params - auto-open panels
  (function(){
    var params = new URLSearchParams(window.location.search);
    if(params.get('openAccount') === '1'){
      // Remove param from URL without reload
      var url = new URL(window.location);
      url.searchParams.delete('openAccount');
      window.history.replaceState({}, '', url);
      // Open account panel after init
      setTimeout(function(){
        if(window.openAccountPanel) window.openAccountPanel();
      }, 800);
    }
  })();

    window.openAccountPanel = function(){
    if(!_currentUser){ location.href='/login'; return; }
    document.getElementById('account-panel').classList.add('open');
    document.getElementById('account-panel-overlay').classList.add('open');
    document.body.style.overflow='hidden';
    apRenderPanel();
  };
  window.closeAccountPanel = function(){
    document.getElementById('account-panel').classList.remove('open');
    document.getElementById('account-panel-overlay').classList.remove('open');
    document.body.style.overflow='';
  };

  function apRenderPanel(){
    var u = _currentUser;
    var p = _profileData;
    if(!u) return;
    var name = u.name || p.name || 'User';
    var email = u.email || p.email || '';
    var plan = u.plan || 'free';
    var color = p.color || '#C9A84C';
    
    // Avatar
    var av = document.getElementById('ap-avatar');
    if(av){
      var parts = name.trim().split(/\s+/).filter(Boolean);
      var ini = parts.length===1?parts[0][0].toUpperCase():(parts[0][0]+parts[parts.length-1][0]).toUpperCase();
      if(safePhotoSrc(p.photo)){
        av.innerHTML='<img src="'+safePhotoSrc(p.photo)+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
        av.style.background='transparent';
      } else {
        av.textContent=ini;
        av.style.background=color;
      }
    }
    
    // Text fields
    var nd = document.getElementById('ap-name-display');
    var ed = document.getElementById('ap-email-display');
    var ni = document.getElementById('ap-name');
    if(nd) nd.textContent = name;
    if(ed) ed.textContent = email;
    if(ni) ni.value = name;
    
    // Plan
    var pd = document.getElementById('ap-plan-display');
    var pn = document.getElementById('ap-plan-name');
    var pdesc = document.getElementById('ap-plan-desc');
    var ub = document.getElementById('ap-upgrade-btn');
    var cfg = {};
    try { cfg = JSON.parse(localStorage.getItem('propCalc_siteConfig_v1')||'{}'); } catch(e) {}
    var freeLimit = cfg.freeScenarioLimit || 1;
    var proPrice = cfg.proMonthlyPrice || 2.99;
    var advPrice = cfg.adviserMonthlyPrice || 29;
    if(pd) pd.textContent = plan==='free'?'⭐ Starter':(plan==='pro'?'⚡ Pro':'👑 Adviser');
    if(pn) pn.textContent = plan==='free'?'Starter (Free)':(plan==='pro'?`Pro — A$${proPrice.toFixed(2)}/mo AUD`:`Adviser — A$${advPrice.toFixed(2)}/mo AUD`);
    if(pdesc) {
      if(plan==='free') {
        var pluralS = freeLimit > 1 ? 's' : '';
        pdesc.textContent = `${freeLimit} saved scenario${pluralS} · Core calculator`;
      } else {
        pdesc.textContent = 'Unlimited scenarios · Cloud sync · PDF export · Projection chart';
      }
    }
    if(ub) ub.style.display = plan==='free'?'':'none';
    
    // Color swatches
    var cr = document.getElementById('ap-colors');
    if(cr){
      cr.innerHTML = AP_COLORS.map(function(c2){
        return '<div class="ap-swatch'+(c2===color?' active':'')+'" style="background:'+c2+';" data-color="'+c2+'"></div>';
      }).join('');
      if(!cr._apClickBound){
        cr._apClickBound = true;
        cr.addEventListener('click', function(e){
          var sw = e.target.closest('.ap-swatch[data-color]');
          if(sw) apSetColor(sw, sw.dataset.color);
        });
      }
    }
  }

  function apSetColor(el, color){
    document.querySelectorAll('.ap-swatch').forEach(function(s){s.classList.remove('active');});
    el.classList.add('active');
    _profileData.color = color;
    var av = document.getElementById('ap-avatar');
    if(av && !_profileData.photo) av.style.background = color;
  }

  function apLoadPhoto(input){
    var file = input.files && input.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(e){
      var img = new Image();
      img.onload = function(){
        var canvas = document.createElement('canvas');
        var size = Math.min(img.width, img.height, 320);
        canvas.width = size; canvas.height = size;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, (img.width-size)/2, (img.height-size)/2, size, size, 0, 0, size, size);
        var data = canvas.toDataURL('image/jpeg', 0.92);
        _profileData.photo = data;
        var av = document.getElementById('ap-avatar');
        var safeSrc = safePhotoSrc(data);
        if(av && safeSrc){ av.innerHTML='<img src="'+safeSrc+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'; av.style.background='transparent'; }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function apRemovePhoto(){
    _profileData.photo = '';
    apRenderPanel();
  }

  async function apSaveProfile(){
    var st = document.getElementById('ap-profile-status');
    var nameVal = (document.getElementById('ap-name').value||'').trim();
    if(!nameVal){ st.textContent='Name is required'; st.className='ap-status err'; return; }
    st.textContent='Saving…'; st.className='ap-status ok';
    _profileData.name = nameVal;
    if(_currentUser) _currentUser.name = nameVal;
    // Save to localStorage
    lsSet(getProfileKey(), JSON.stringify(_profileData));
    // Save to backend
    try{
      if(isLoggedIn()){
        var profileToSave = Object.assign({}, _profileData);
        delete profileToSave.photo; // photos via separate endpoint
        await fetch('/.netlify/functions/auth',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'setProfile',profile:profileToSave})
        });
        if(_profileData.photo){
          await fetch('/.netlify/functions/auth',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({action:'setPhoto',photo:_profileData.photo})
          });
        }
      }
    } catch(e){}
    st.textContent='✓ Profile saved';
    renderProfileBtn();
    typeof renderSiteNav === 'function' && renderSiteNav();
    setTimeout(function(){ st.className='ap-status'; }, 3000);
  }

  async function apChangePassword(){
    var cur = (document.getElementById('ap-pw-current').value||'').trim();
    var nw  = document.getElementById('ap-pw-new').value;
    var cf  = document.getElementById('ap-pw-confirm').value;
    var st  = document.getElementById('ap-pw-status');
    if(!cur||!nw){ st.textContent='Fill in all fields'; st.className='ap-status err'; return; }
    if(nw.length<8){ st.textContent='New password must be 8+ characters'; st.className='ap-status err'; return; }
    if(nw!==cf){ st.textContent="Passwords don't match"; st.className='ap-status err'; return; }
    st.textContent='Updating…'; st.className='ap-status ok';
    try{
      var r = await fetch('/.netlify/functions/auth',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'changePassword', currentPassword:cur, newPassword:nw})
      });
      var d = await r.json();
      if(d.ok){
        st.textContent='✓ Password updated';
        document.getElementById('ap-pw-current').value='';
        document.getElementById('ap-pw-new').value='';
        document.getElementById('ap-pw-confirm').value='';
        setTimeout(function(){ st.className='ap-status'; }, 3000);
      } else {
        st.textContent = d.error||'Incorrect current password';
        st.className='ap-status err';
      }
    } catch(e){ st.textContent='Network error'; st.className='ap-status err'; }
  }

  async function apDeleteAccount(){
    var pw = await appPrompt('Delete Account', 'Enter your password to permanently delete your account. This cannot be undone.', {danger:true, confirmLabel:'Delete Account', inputPlaceholder:'Your password'});
    if(!pw) return;
    try{
      var r = await fetch('/.netlify/functions/auth',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'deleteAccount', password:pw})
      });
      var d = await r.json();
      if(d.ok){
        localStorage.clear();
        await appAlert('Account Deleted', 'Your account has been deleted. You will now be redirected.', {icon:'👋'});
        location.href='/';
      } else {
        await appAlert('Error', d.error||'Incorrect password — account not deleted', {danger:true, icon:'✗'});
      }
    } catch(e){
      await appAlert('Network Error', 'Could not connect — please try again.', {danger:true, icon:'✗'});
    }
  }
  // END FLOATING ACCOUNT PANEL

