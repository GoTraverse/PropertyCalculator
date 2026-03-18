// app-events.js — Event listeners for app.html (extracted from inline handlers)
// Loaded after app.js so all functions are available.

// ── Tab navigation ────────────────────────────────────────────────────────────
document.querySelectorAll('.tab[data-tab]').forEach(function(btn){
  btn.addEventListener('click', function(){
    var tab = this.dataset.tab;
    if(tab === 'projection'){
      if(isPro()) showTab('projection', this); else requirePro('30-Year Projection');
    } else {
      showTab(tab, this);
    }
  });
});

// ── Sidebar toggles ──────────────────────────────────────────────────────────
var mobileOverlay = document.getElementById('mobile-overlay');
if(mobileOverlay) mobileOverlay.addEventListener('click', toggleMobileSidebar);
var mobileSidebarBtn = document.getElementById('mobile-sidebar-btn');
if(mobileSidebarBtn) mobileSidebarBtn.addEventListener('click', toggleMobileSidebar);
var mobileCalcFab = document.getElementById('mobile-calc-fab');
if(mobileCalcFab) mobileCalcFab.addEventListener('click', toggleMobileSidebar);
var sidebarCloseBtn = document.getElementById('sidebar-close-btn');
if(sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', toggleMobileSidebar);
var sidebarToggle = document.getElementById('sidebar-toggle');
if(sidebarToggle) sidebarToggle.addEventListener('click', toggleSidebarCollapse);
var collapsedHint = document.querySelector('.sidebar-collapsed-hint');
if(collapsedHint) collapsedHint.addEventListener('click', toggleSidebarCollapse);

// ── Header action buttons ─────────────────────────────────────────────────────
var hdrSaveBtn = document.querySelector('.hdr-save-btn');
if(hdrSaveBtn) hdrSaveBtn.addEventListener('click', saveScenario);
var hdrNewBtn = document.getElementById('hdr-new-btn');
if(hdrNewBtn) hdrNewBtn.addEventListener('click', newScenario);
var openSavedBtn = document.getElementById('open-saved-btn');
if(openSavedBtn) openSavedBtn.addEventListener('click', openScenariosModal);
var hdrPdfBtn = document.getElementById('hdr-pdf-btn');
if(hdrPdfBtn) hdrPdfBtn.addEventListener('click', function(){
  if(window.isPro()) window.showPDFOptionsPopup(); else window.requirePro('PDF Export');
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
if(renoToggle) renoToggle.addEventListener('click', toggleReno);
var rentToggle = document.getElementById('rent-toggle');
if(rentToggle) rentToggle.addEventListener('click', toggleRent);
var riskToggle = document.getElementById('risk-toggle');
if(riskToggle) riskToggle.addEventListener('click', toggleRisk);

// ── Generic range inputs (rng-KEY → syncInput + dRecalc) ─────────────────────
document.querySelectorAll('input[id^="rng-"]').forEach(function(el){
  el.addEventListener('input', function(){
    syncInput(this.id.slice(4));
    dRecalc();
  });
});

// ── Generic calculator number inputs (inp-KEY → clamp + syncRange + dRecalc) ─
var calcInputKeys = ['price','savings','depp','govt','rate','term','cont','rent','weeks'];
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
if(confirmLoadBtn) confirmLoadBtn.addEventListener('click', function(){ if(_pendingShared) confirmLoadShared(); else confirmLoad(); });
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
  if(parseFloat(this.value) > 2026) this.value = 2026;
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
if(addKeyDateBtn) addKeyDateBtn.addEventListener('click', addKeyDate);
var addCommsEntryBtn = document.getElementById('add-comms-entry-btn');
if(addCommsEntryBtn) addCommsEntryBtn.addEventListener('click', addCommsEntry);

// ── Agent inputs ──────────────────────────────────────────────────────────────
['ag-agency','ag-name','ag-phone','ag-email'].forEach(function(id){
  var el = document.getElementById(id);
  if(el) el.addEventListener('input', markAgentDirty);
});

// ── Reno ──────────────────────────────────────────────────────────────────────
var addRenoItemBtn = document.getElementById('add-reno-item-btn');
if(addRenoItemBtn) addRenoItemBtn.addEventListener('click', addRenoItem);

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

// ── PDF options modal ─────────────────────────────────────────────────────────
var pdfOptionsModal = document.getElementById('pdf-options-modal');
if(pdfOptionsModal) pdfOptionsModal.addEventListener('click', function(e){ if(e.target === this) closePDFOptionsModal(); });
var pdfOptionsCloseBtn = document.getElementById('pdf-options-close-btn');
if(pdfOptionsCloseBtn) pdfOptionsCloseBtn.addEventListener('click', closePDFOptionsModal);
var pdfCancelBtn = document.getElementById('pdf-cancel-btn');
if(pdfCancelBtn) pdfCancelBtn.addEventListener('click', function(){ window.closePDFOptionsModal(); });
var pdfGenerateBtn = document.getElementById('pdf-generate-btn');
if(pdfGenerateBtn) pdfGenerateBtn.addEventListener('click', function(){ window.showPDFPreview(); });
