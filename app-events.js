// app-events.js — Event listeners for app.html (extracted from inline handlers)
// Loaded after app.js so all functions are available.

// ── Tab navigation ────────────────────────────────────────────────────────────
document.querySelectorAll('.tab[data-tab]').forEach(function(btn){
  btn.addEventListener('click', function(){
    showTab(this.dataset.tab, this);
  });
});

// ── Sidebar toggles ──────────────────────────────────────────────────────────
var mobileOverlay = document.getElementById('mobile-overlay');
if(mobileOverlay) mobileOverlay.addEventListener('click', function(){
  if(window.trackSidebarToggle) trackSidebarToggle('toggle');
  toggleMobileSidebar();
});
var mobileSidebarBtn = document.getElementById('mobile-sidebar-btn');
if(mobileSidebarBtn) mobileSidebarBtn.addEventListener('click', function(){
  if(window.trackSidebarToggle) trackSidebarToggle('toggle');
  toggleMobileSidebar();
});
var mobileCalcFab = document.getElementById('mobile-calc-fab');
if(mobileCalcFab) mobileCalcFab.addEventListener('click', function(){
  if(window.trackSidebarToggle) trackSidebarToggle('toggle');
  toggleMobileSidebar();
});
var sidebarCloseBtn = document.getElementById('sidebar-close-btn');
if(sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', function(){
  if(window.trackSidebarToggle) trackSidebarToggle('close');
  toggleMobileSidebar();
});
var sidebarToggle = document.getElementById('sidebar-toggle');
if(sidebarToggle) sidebarToggle.addEventListener('click', toggleSidebarCollapse);
var collapsedHint = document.querySelector('.sidebar-collapsed-hint');
if(collapsedHint) collapsedHint.addEventListener('click', toggleSidebarCollapse);

// ── Header action buttons ─────────────────────────────────────────────────────
var hdrSaveBtn = document.querySelector('.hdr-save-btn');
if(hdrSaveBtn) hdrSaveBtn.addEventListener('click', function(){ saveScenario(false); });
var hdrNewBtn = document.getElementById('hdr-new-btn');
if(hdrNewBtn) hdrNewBtn.addEventListener('click', newScenario);
var openSavedBtn = document.getElementById('open-saved-btn');
if(openSavedBtn) openSavedBtn.addEventListener('click', openScenariosModal);
var hdrPdfBtn = document.getElementById('hdr-pdf-btn');
if(hdrPdfBtn) hdrPdfBtn.addEventListener('click', function(){
  if(window.isPro()) window.showPDFOptionsPopup(); else window.requirePro('Export');
});

// ── Header photo upload zone ──────────────────────────────────────────────────
var uploadZone = document.getElementById('upload-zone');
if(uploadZone){
  uploadZone.addEventListener('click', function(){ document.getElementById('pd-file-input').click(); });
  uploadZone.addEventListener('dragover', function(e){ e.preventDefault(); this.classList.add('drag-over'); });
  uploadZone.addEventListener('dragleave', function(){ this.classList.remove('drag-over'); });
  uploadZone.addEventListener('drop', handlePhotoDrop);
}
var photoFileInput = document.getElementById('photo-file-input');
if(photoFileInput) photoFileInput.addEventListener('change', function(){ handlePhotoFile(this.files[0]); });

// ── Sidebar feature toggles ───────────────────────────────────────────────────
var renoToggle = document.getElementById('reno-toggle');
if(renoToggle) renoToggle.addEventListener('click', function(){
  if(window.trackPageEvent) trackPageEvent('feature_toggle', {'feature': 'renovation'});
  toggleReno();
});
var rentToggle = document.getElementById('rent-toggle');
if(rentToggle) rentToggle.addEventListener('click', function(){
  if(window.trackPageEvent) trackPageEvent('feature_toggle', {'feature': 'rental'});
  toggleRent();
});
var riskToggle = document.getElementById('risk-toggle');
if(riskToggle) riskToggle.addEventListener('click', function(){
  if(window.trackPageEvent) trackPageEvent('feature_toggle', {'feature': 'risk_analysis'});
  toggleRisk();
});

// ── Generic range inputs (rng-KEY → syncInput + dRecalc) ─────────────────────
document.querySelectorAll('input[id^="rng-"]').forEach(function(el){
  el.addEventListener('input', function(){
    syncInput(this.id.slice(4));
    dRecalc();
  });
});

// ── Generic calculator number inputs (inp-KEY → clamp + syncRange + dRecalc) ─
var calcInputKeys = ['price','savings','depp','govt','rate','term','cont','rent','weeks','offset'];
calcInputKeys.forEach(function(key){
  var el = document.getElementById('inp-' + key);
  if(!el) return;
  el.addEventListener('input', function(){
    var max = parseFloat(this.max);
    if(max && parseFloat(this.value) > max) this.value = max;
    syncRange(key);
    dRecalc();
  });
});

// ── State dropdown ─────────────────────────────────────────────────────────────
var stateSelect = document.getElementById('inp-state');
if(stateSelect) stateSelect.addEventListener('input', dRecalc);

// ── First home buyer / new property checkboxes ────────────────────────────────
var fhbCheck = document.getElementById('inp-fhb');
if(fhbCheck) fhbCheck.addEventListener('change', dRecalc);
var newPropCheck = document.getElementById('inp-new-prop');
if(newPropCheck) newPropCheck.addEventListener('change', dRecalc);

// ── Settle date ───────────────────────────────────────────────────────────────
var settleDate = document.getElementById('inp-settle-date');
if(settleDate) settleDate.addEventListener('input', onSettleDateChange);

// ── Scheme select ─────────────────────────────────────────────────────────────
var schemeSelect = document.getElementById('scheme-select');
if(schemeSelect) schemeSelect.addEventListener('change', function(){ applySelectedScheme(this.value); });

// ── Cost add buttons ──────────────────────────────────────────────────────────
var addCostPurchaseBtn = document.getElementById('add-cost-purchase-btn');
if(addCostPurchaseBtn) addCostPurchaseBtn.addEventListener('click', function(){ addCostItem('purchase'); });
var addCostMoveoutBtn = document.getElementById('add-cost-moveout-btn');
if(addCostMoveoutBtn) addCostMoveoutBtn.addEventListener('click', function(){ addCostItem('moveout'); });

// ── Scenarios modal ───────────────────────────────────────────────────────────
var scenariosModal = document.getElementById('scenarios-modal');
if(scenariosModal) scenariosModal.addEventListener('click', function(e){ if(e.target === this) closeScenariosModal(); });
var closeScenarioModalBtn = document.getElementById('close-scenarios-modal-btn');
if(closeScenarioModalBtn) closeScenarioModalBtn.addEventListener('click', closeScenariosModal);

// Lib filter buttons (data-filter already set)
document.querySelectorAll('.lib-filter[data-filter]').forEach(function(btn){
  btn.addEventListener('click', function(){ setLibFilter(this.dataset.filter, this); });
});

// ── Share modal ───────────────────────────────────────────────────────────────
var shareModal = document.getElementById('share-modal');
if(shareModal) shareModal.addEventListener('click', function(e){ if(e.target === this) closeShareModal(); });
var shareEmailInput = document.getElementById('share-email-input');
if(shareEmailInput) shareEmailInput.addEventListener('keydown', function(e){ if(e.key === 'Enter') confirmShare(); });
var shareConfirmBtn = document.getElementById('share-confirm-btn');
if(shareConfirmBtn) shareConfirmBtn.addEventListener('click', confirmShare);
var cancelShareBtn = document.getElementById('cancel-share-btn');
if(cancelShareBtn) cancelShareBtn.addEventListener('click', closeShareModal);

// ── Confirm load modal ────────────────────────────────────────────────────────
var confirmLoadBtn = document.getElementById('confirm-load-btn');
if(confirmLoadBtn) confirmLoadBtn.addEventListener('click', function(){ if(_pendingAdminScenario) confirmLoadAdminScenario(); else if(_pendingShared) confirmLoadShared(); else confirmLoad(); });
var cancelConfirmModalBtn = document.getElementById('cancel-confirm-modal-btn');
if(cancelConfirmModalBtn) cancelConfirmModalBtn.addEventListener('click', closeConfirmModal);

// ── App dialog ────────────────────────────────────────────────────────────────
var appDialogCancel = document.getElementById('app-dialog-cancel');
if(appDialogCancel) appDialogCancel.addEventListener('click', function(){ _appDialogResolve(false); });
var appDialogConfirm = document.getElementById('app-dialog-confirm');
if(appDialogConfirm) appDialogConfirm.addEventListener('click', function(){ _appDialogResolve(true); });

// ── Property photo big zone ───────────────────────────────────────────────────
var propPhotoBigWrap = document.getElementById('prop-photo-big-wrap');
if(propPhotoBigWrap){
  propPhotoBigWrap.addEventListener('click', function(){ document.getElementById('pd-file-input').click(); });
  propPhotoBigWrap.addEventListener('dragover', function(e){ e.preventDefault(); this.classList.add('pd-drag'); });
  propPhotoBigWrap.addEventListener('dragleave', function(){ this.classList.remove('pd-drag'); });
  propPhotoBigWrap.addEventListener('drop', handlePropPhotoDrop);
}
var pdFileInput = document.getElementById('pd-file-input');
if(pdFileInput) pdFileInput.addEventListener('change', function(){ handlePropPhotoFile(this.files[0]); });
var clearPropPhotoBtn = document.getElementById('clear-prop-photo-btn');
if(clearPropPhotoBtn) clearPropPhotoBtn.addEventListener('click', function(e){ e.stopPropagation(); clearPropPhoto(); });
var pdPhotoUrl = document.getElementById('pd-photo-url');
if(pdPhotoUrl) pdPhotoUrl.addEventListener('input', function(){ handlePhotoUrlInput(this.value); });
var applyPhotoUrlBtn = document.getElementById('apply-photo-url-btn');
if(applyPhotoUrlBtn) applyPhotoUrlBtn.addEventListener('click', applyPhotoUrl);
var mapImgBtn = document.getElementById('map-img-btn');
if(mapImgBtn) mapImgBtn.addEventListener('click', loadMapImage);

// ── Property detail inputs ────────────────────────────────────────────────────
var pdAddress = document.getElementById('pd-address');
if(pdAddress){
  pdAddress.addEventListener('input', function(){ updatePropertyDetails(); addrAutocomplete(this.value); });
  pdAddress.addEventListener('blur', function(){ setTimeout(hideAddrSuggestions, 200); });
}
var pdSuburb = document.getElementById('pd-suburb');
if(pdSuburb) pdSuburb.addEventListener('input', onSuburbChange);
['pd-state','pd-url','pd-notes'].forEach(function(id){
  var el = document.getElementById(id);
  if(el) el.addEventListener('input', updatePropertyDetails);
});

// Stat inputs (bed/bath/car) — update on input
['pd-bed','pd-bath','pd-car'].forEach(function(id){
  var el = document.getElementById(id);
  if(el) el.addEventListener('input', updatePropertyDetails);
});

// Step buttons (bed/bath/car)
document.querySelectorAll('.step-btn[data-target]').forEach(function(btn){
  btn.addEventListener('click', function(){ stepStat(this.dataset.target, parseInt(this.dataset.dir)); });
});

// Property size/year inputs with max clamp
var pdLand = document.getElementById('pd-land');
if(pdLand) pdLand.addEventListener('input', function(){
  if(parseFloat(this.value) > 100000) this.value = 100000;
  updatePropertyDetails();
});
var pdHouse = document.getElementById('pd-house');
if(pdHouse) pdHouse.addEventListener('input', function(){
  if(parseFloat(this.value) > 10000) this.value = 10000;
  updatePropertyDetails();
});
var pdYear = document.getElementById('pd-year');
if(pdYear) pdYear.addEventListener('input', function(){
  var curYear = new Date().getFullYear();
  if(parseFloat(this.value) > curYear) this.value = curYear;
  if(parseFloat(this.value) < 1800 && this.value.length >= 4) this.value = 1800;
  updatePropertyDetails();
});

// ── Property type buttons ─────────────────────────────────────────────────────
document.querySelectorAll('.prop-type-btn[data-type]').forEach(function(btn){
  btn.addEventListener('click', function(){ setPropType(this, this.dataset.type); });
});

// ── Status buttons ────────────────────────────────────────────────────────────
document.querySelectorAll('.status-btn[data-status]').forEach(function(btn){
  btn.addEventListener('click', function(){ setStatus(this.dataset.status, this); });
});

// ── Status date ───────────────────────────────────────────────────────────────
var pdStatusDate = document.getElementById('pd-status-date');
if(pdStatusDate) pdStatusDate.addEventListener('input', function(){
  syncKeyDatesFromStatus();
  var display = document.getElementById('pd-status-date-display');
  if(display) display.textContent = this.value ? formatDate(this.value) : '';
});

// ── Key dates & comms ─────────────────────────────────────────────────────────
var addKeyDateBtn = document.getElementById('add-key-date-btn');
if(addKeyDateBtn) addKeyDateBtn.addEventListener('click', function(){ addKeyDate(); });
var addCommsEntryBtn = document.getElementById('add-comms-entry-btn');
if(addCommsEntryBtn) addCommsEntryBtn.addEventListener('click', addCommsEntry);

// ── Agent inputs ──────────────────────────────────────────────────────────────
['ag-agency','ag-name','ag-phone','ag-email'].forEach(function(id){
  var el = document.getElementById(id);
  if(el) el.addEventListener('input', markAgentDirty);
});

// ── Reno ──────────────────────────────────────────────────────────────────────
var addRenoItemBtn = document.getElementById('add-reno-item-btn');
if(addRenoItemBtn) addRenoItemBtn.addEventListener('click', function(){ addRenoItem(); });

// ── Amortisation toggle ───────────────────────────────────────────────────────
var amortToggleBtn = document.getElementById('amort-toggle-btn');
if(amortToggleBtn) amortToggleBtn.addEventListener('click', toggleAmortTable);

// ── Projection ────────────────────────────────────────────────────────────────
var projGrowth = document.getElementById('proj-growth');
if(projGrowth) projGrowth.addEventListener('input', function(){
  var lbl = document.getElementById('proj-growth-lbl');
  if(lbl) lbl.textContent = parseFloat(this.value).toFixed(1) + '%';
  drawProjection();
});
var fetchGrowthBtn = document.getElementById('fetch-growth-btn');
if(fetchGrowthBtn) fetchGrowthBtn.addEventListener('click', fetchSuburbGrowth);
var projSliderInput = document.getElementById('proj-slider-input');
if(projSliderInput) projSliderInput.addEventListener('input', function(){ projSliderMove(parseInt(this.value)); });
var projExtraPayment = document.getElementById('proj-extra-payment');
if(projExtraPayment) projExtraPayment.addEventListener('input', function(){
  if(parseFloat(this.value) > 50000) this.value = 50000;
  drawProjection();
});
document.querySelectorAll('.proj-extra-preset[data-val]').forEach(function(btn){
  btn.addEventListener('click', function(){
    var el = document.getElementById('proj-extra-payment');
    if(el){ el.value = this.dataset.val; drawProjection(); }
  });
});

// ── Profile panel ─────────────────────────────────────────────────────────────
var profileOverlay = document.getElementById('profile-overlay');
if(profileOverlay) profileOverlay.addEventListener('click', closeProfile);
var ppCloseBtn = document.getElementById('pp-close-btn');
if(ppCloseBtn) ppCloseBtn.addEventListener('click', closeProfile);
var ppPhotoFileInput = document.getElementById('pp-photo-file-input');
if(ppPhotoFileInput) ppPhotoFileInput.addEventListener('change', function(){ handleProfilePhoto(this); });
var ppNameInput = document.getElementById('pp-name-input');
if(ppNameInput) ppNameInput.addEventListener('input', function(){ previewProfileName(this.value); });
document.querySelectorAll('.pp-color-btn[data-color]').forEach(function(btn){
  btn.addEventListener('click', function(){ setProfileColor(this.dataset.color); });
});
var ppSaveBtn = document.getElementById('pp-save-btn');
if(ppSaveBtn) ppSaveBtn.addEventListener('click', saveProfile);

// ── Welcome splash ────────────────────────────────────────────────────────────
var splashNewBtn = document.getElementById('splash-new-btn');
if(splashNewBtn) splashNewBtn.addEventListener('click', splashNewScenario);
var splashLibraryBtn = document.getElementById('splash-library-btn');
if(splashLibraryBtn) splashLibraryBtn.addEventListener('click', splashOpenLibrary);

// ── Export options modal ─────────────────────────────────────────────────────
var pdfOptionsModal = document.getElementById('pdf-options-modal');
if(pdfOptionsModal) pdfOptionsModal.addEventListener('click', function(e){ if(e.target === this) closePDFOptionsModal(); });
var pdfOptionsCloseBtn = document.getElementById('pdf-options-close-btn');
if(pdfOptionsCloseBtn) pdfOptionsCloseBtn.addEventListener('click', closePDFOptionsModal);
var pdfCancelBtn = document.getElementById('pdf-cancel-btn');
if(pdfCancelBtn) pdfCancelBtn.addEventListener('click', function(){ window.closePDFOptionsModal(); });
var pdfGenerateBtn = document.getElementById('pdf-generate-btn');
if(pdfGenerateBtn) pdfGenerateBtn.addEventListener('click', function(){ window.showPDFPreview(); });

// ── Export format toggle buttons ─────────────────────────────────────────────
var exportFormatBtns = document.getElementById('export-format-btns');
if(exportFormatBtns) exportFormatBtns.addEventListener('click', function(e){
  var btn = e.target.closest('.export-format-btn');
  if(!btn) return;
  var fmt = btn.getAttribute('data-format');
  window._exportFormat = fmt;
  exportFormatBtns.querySelectorAll('.export-format-btn').forEach(function(b){
    if(b === btn){
      b.style.background = '#1C1C1E';
      b.style.color = '#C9A84C';
      b.style.fontWeight = '600';
      b.classList.add('active');
    } else {
      b.style.background = 'white';
      b.style.color = '#1C1C1E';
      b.style.fontWeight = 'normal';
      b.classList.remove('active');
    }
  });
  var pdfOnly = (fmt === 'pdf' || fmt === 'html');
  var layoutSec = document.getElementById('pdf-layout-section');
  var sectionsSec = document.getElementById('pdf-sections-section');
  var appearanceSec = document.getElementById('pdf-appearance-section');
  if(layoutSec) layoutSec.style.display = fmt === 'pdf' ? '' : 'none';
  if(sectionsSec) sectionsSec.style.display = pdfOnly ? '' : 'none';
  if(appearanceSec) appearanceSec.style.display = pdfOnly ? '' : 'none';
  var hint = document.getElementById('export-format-hint');
  var hints = {
    pdf: 'Opens a printable report \u2014 use your browser\'s Print to save as PDF.',
    csv: 'Downloads a spreadsheet-friendly file. Opens in Excel, Google Sheets, etc.',
    html: 'Downloads a standalone HTML report you can open in any browser.',
    txt: 'Downloads a plain text summary \u2014 great for email or notes.'
  };
  if(hint) hint.textContent = hints[fmt] || '';
});

// ── Dynamic cost items delegation (cost-items-purchase / cost-items-moveout) ──
['cost-items-purchase','cost-items-moveout'].forEach(function(listId){
  var list = document.getElementById(listId);
  if(!list) return;
  list.addEventListener('input', function(e){
    var row = e.target.closest('.dyn-cost-row');
    if(!row) return;
    var id = row.dataset.costid;
    var field = e.target.dataset.field;
    if(!id || !field) return;
    if(field === 'name'){
      updateDynCost(id, 'name', e.target.value);
    } else if(field === 'amount'){
      var v = parseFloat(e.target.value);
      if(v > 500000){ e.target.value = 500000; v = 500000; }
      updateDynCost(id, 'amount', v || 0);
      dRecalc();
    }
  });
  list.addEventListener('keydown', function(e){
    var row = e.target.closest('.dyn-cost-row');
    if(!row || e.key !== 'Enter') return;
    e.preventDefault();
    var field = e.target.dataset.field;
    if(field === 'name'){
      var nxt = row.querySelector('input[type=number]');
      if(nxt){ nxt.focus(); nxt.select(); }
    } else if(field === 'amount'){
      addCostItem(row.dataset.category || 'purchase');
    }
  });
  list.addEventListener('click', function(e){
    var btn = e.target.closest('[data-action="del-cost"]');
    if(!btn) return;
    var row = btn.closest('.dyn-cost-row');
    if(row) removeCostItem(row.dataset.costid);
  });
});

// ── Reno items delegation (#reno-items-list) ─────────────────────────────────
var renoList = document.getElementById('reno-items-list');
if(renoList){
  renoList.addEventListener('change', function(e){
    var row = e.target.closest('[data-reno]');
    if(!row || e.target.dataset.field !== 'emoji') return;
    updateRenoItem(row.dataset.reno, 'emoji', e.target.value);
    renderRenoItems();
  });
  renoList.addEventListener('input', function(e){
    var row = e.target.closest('[data-reno]');
    if(!row) return;
    var id = row.dataset.reno;
    var field = e.target.dataset.field;
    if(field === 'name'){
      updateRenoItem(id, 'name', e.target.value);
    } else if(field === 'amount'){
      var v = parseFloat(e.target.value);
      if(v > 2000000){ e.target.value = 2000000; v = 2000000; }
      updateRenoItem(id, 'amount', v || 0);
      dRecalc();
      updateRenoBar(id, v || 0);
    } else if(field === 'note'){
      updateRenoItem(id, 'note', e.target.value);
      e.target.style.height = 'auto';
      e.target.style.height = e.target.scrollHeight + 'px';
    }
  });
  renoList.addEventListener('keydown', function(e){
    var row = e.target.closest('[data-reno]');
    if(!row || e.key !== 'Enter') return;
    e.preventDefault();
    var field = e.target.dataset.field;
    if(field === 'name'){
      var amt = row.querySelector('input[type=number]');
      if(amt){ amt.focus(); amt.select(); }
    } else if(field === 'amount'){
      addRenoItem();
    }
  });
  renoList.addEventListener('focusin', function(e){
    if(e.target.dataset.field === 'name' || e.target.dataset.field === 'amount'){
      e.target.style.borderColor = 'var(--sage)';
    }
  });
  renoList.addEventListener('focusout', function(e){
    if(e.target.dataset.field === 'name' || e.target.dataset.field === 'amount'){
      e.target.style.borderColor = 'rgba(28,28,30,0.1)';
    }
  });
  renoList.addEventListener('click', function(e){
    var btn = e.target.closest('[data-action="del-reno"]');
    if(!btn) return;
    var row = btn.closest('[data-reno]');
    if(row) removeRenoItem(row.dataset.reno);
  });
}

// ── Address suggestions delegation (#addr-suggestions) ───────────────────────
var addrSuggestions = document.getElementById('addr-suggestions');
if(addrSuggestions){
  addrSuggestions.addEventListener('mousedown', function(e){
    var item = e.target.closest('[data-idx]');
    if(!item) return;
    var idx = parseInt(item.dataset.idx);
    if(typeof _addrResults !== 'undefined' && _addrResults[idx]) selectAddress(_addrResults[idx]);
  });
}

// ── Scenarios library delegation (#scenarios-grid) ───────────────────────────
var scenariosGrid = document.getElementById('scenarios-grid');
if(scenariosGrid){
  scenariosGrid.addEventListener('click', function(e){
    var row = e.target.closest('.lib-row[data-scenarioid]');
    if(row) openLibActionsPopup(row.dataset.scenarioid);
  });
}

// ── Library actions popup ────────────────────────────────────────────────────
var libActionsOverlay = document.getElementById('lib-actions-overlay');
if(libActionsOverlay) libActionsOverlay.addEventListener('click', function(e){ if(e.target === this) closeLibActionsPopup(); });
var libActionCancelBtn = document.getElementById('lib-action-cancel');
if(libActionCancelBtn) libActionCancelBtn.addEventListener('click', closeLibActionsPopup);
var libActionLoadBtn = document.getElementById('lib-action-load');
if(libActionLoadBtn) libActionLoadBtn.addEventListener('click', libActionLoad);
var libActionExportBtn = document.getElementById('lib-action-export');
if(libActionExportBtn) libActionExportBtn.addEventListener('click', libActionExport);
var libActionShareBtn = document.getElementById('lib-action-share');
if(libActionShareBtn) libActionShareBtn.addEventListener('click', libActionShare);
var libActionDeleteBtn = document.getElementById('lib-action-delete');
if(libActionDeleteBtn) libActionDeleteBtn.addEventListener('click', libActionDelete);

// ── Shared scenarios delegation (#shared-grid) ───────────────────────────────
var sharedGrid = document.getElementById('shared-grid');
if(sharedGrid){
  sharedGrid.addEventListener('click', function(e){
    var dismissBtn = e.target.closest('[data-action="dismiss-shared"]');
    if(dismissBtn){ e.stopPropagation(); dismissSharedScenario(dismissBtn.dataset.oid, dismissBtn.dataset.sid); return; }
    var row = e.target.closest('[data-action="load-shared"]');
    if(row) promptLoadSharedScenario(row.dataset.oid, row.dataset.sid, row.dataset.addr);
  });
}

// ── Admin: all users' scenarios delegation (#admin-all-grid) ─────────────────
var adminAllGrid = document.getElementById('admin-all-grid');
if(adminAllGrid){
  adminAllGrid.addEventListener('click', function(e){
    var row = e.target.closest('[data-action="load-admin-scenario"]');
    if(row) promptLoadAdminScenario(row.dataset.uid, row.dataset.sid, row.dataset.addr);
  });
}

// ── Serviceability income input ──────────────────────────────────────────────
var incomeInput = document.getElementById('inp-income');
if(incomeInput) incomeInput.addEventListener('input', dRecalc);

// ── Investment rent (yield calc in projection tab) ────────────────────────────
var investRentInput = document.getElementById('inp-invest-rent');
if(investRentInput) investRentInput.addEventListener('input', function(){ drawProjection && drawProjection(); });

// ── Key dates delegation (#key-dates-list) ───────────────────────────────────
var keyDatesList = document.getElementById('key-dates-list');
if(keyDatesList){
  keyDatesList.addEventListener('input', function(e){
    var row = e.target.closest('.kd-row[data-dateid]');
    if(!row) return;
    var field = e.target.dataset.field;
    if(field === 'date' || field === 'label') updateKeyDate(row.dataset.dateid, field, e.target.value);
  });
  keyDatesList.addEventListener('click', function(e){
    var btn = e.target.closest('[data-action="del-date"]');
    if(!btn) return;
    var row = btn.closest('.kd-row[data-dateid]');
    if(row) removeKeyDate(row.dataset.dateid);
  });
}

// ── Comms log delegation (#comms-list) ───────────────────────────────────────
var commsList = document.getElementById('comms-list');
if(commsList){
  commsList.addEventListener('click', function(e){
    var btn = e.target.closest('[data-action="del-comm"]');
    if(!btn) return;
    var entry = btn.closest('.comms-entry[data-commid]');
    if(entry) deleteCommsEntry(entry.dataset.commid);
  });
}

// ── Keyboard shortcuts ───────────────────────────────────────────────────
document.addEventListener('keydown', function(e){
  // Ctrl+S / Cmd+S → save scenario
  if((e.ctrlKey || e.metaKey) && e.key === 's'){
    e.preventDefault();
    if(typeof saveScenario === 'function') saveScenario();
  }
});
