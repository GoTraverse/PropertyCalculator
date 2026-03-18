// admin-events.js — Event listeners for admin.html (extracted from inline handlers)
// Loaded after admin.js so all functions are available.

// ── Custom dialog ─────────────────────────────────────────────────────────────
var adminDialogCancel = document.getElementById('custom-dialog-cancel');
if(adminDialogCancel) adminDialogCancel.addEventListener('click', function(){ _dialogResolve(false); });
var adminDialogConfirm = document.getElementById('custom-dialog-confirm');
if(adminDialogConfirm) adminDialogConfirm.addEventListener('click', function(){ _dialogResolve(true); });

// ── Stat popup ────────────────────────────────────────────────────────────────
var statPopupOverlay = document.getElementById('stat-popup-overlay');
if(statPopupOverlay) statPopupOverlay.addEventListener('click', function(e){ if(e.target === this) closeStatPopup(); });
var statPopupCloseBtn = document.getElementById('stat-popup-close-btn');
if(statPopupCloseBtn) statPopupCloseBtn.addEventListener('click', closeStatPopup);
document.querySelectorAll('.stat-popup-filter-btn[data-range]').forEach(function(btn){
  btn.addEventListener('click', function(){ setStatPopupRange(parseInt(this.dataset.range), this); });
});

// ── Stat cards ────────────────────────────────────────────────────────────────
document.querySelectorAll('.stat-card[data-stat]').forEach(function(card){
  card.addEventListener('click', function(){ openStatPopup(this.dataset.stat); });
});

// ── Stats refresh ─────────────────────────────────────────────────────────────
var statsRefreshBtn = document.getElementById('stats-refresh-btn');
if(statsRefreshBtn) statsRefreshBtn.addEventListener('click', refreshStats);

// ── Admin tabs ────────────────────────────────────────────────────────────────
var tabCallbacks = {
  'scenarios': loadAllScenarios,
  'schemes': loadSchemes,
  'growth': loadGrowthData,
  'client-errors': loadClientErrors,
  'config': loadConfig,
  'branding': loadConfig,
  'email-templates': loadEmailTemplates,
  'about-page': loadAboutPage,
  'legal-pages': loadLegalPagesList,
  'suburbs': loadSuburbsTab
};
document.querySelectorAll('.admin-tab[data-tab]').forEach(function(btn){
  btn.addEventListener('click', function(){
    var tab = this.dataset.tab;
    showAdminTab(tab, this);
    if(tabCallbacks[tab]) tabCallbacks[tab]();
  });
});

// ── User list filters ─────────────────────────────────────────────────────────
var userSearch = document.getElementById('user-search');
if(userSearch) userSearch.addEventListener('input', filterUsers);
['plan-filter','login-filter','sort-filter'].forEach(function(id){
  var el = document.getElementById(id);
  if(el) el.addEventListener('change', filterUsers);
});
var loadUsersBtn = document.getElementById('load-users-btn');
if(loadUsersBtn) loadUsersBtn.addEventListener('click', loadUsers);

// ── Error log ─────────────────────────────────────────────────────────────────
var ceRefreshBtn = document.getElementById('ce-refresh-btn');
if(ceRefreshBtn) ceRefreshBtn.addEventListener('click', loadClientErrors);
var ceClearBtn = document.getElementById('ce-clear-btn');
if(ceClearBtn) ceClearBtn.addEventListener('click', clearClientErrors);
var ceSyncBtn = document.getElementById('ce-sync-btn');
if(ceSyncBtn) ceSyncBtn.addEventListener('click', syncErrorsToGitHub);

// ── Config inputs (price clamp) ───────────────────────────────────────────────
['cfg-pro-monthly','cfg-pro-annual','cfg-adviser-monthly'].forEach(function(id){
  var el = document.getElementById(id);
  if(el) el.addEventListener('input', function(){
    if(parseFloat(this.value) > 99999999) this.value = 99999999;
  });
});
var saveConfigBtn = document.getElementById('save-config-btn');
if(saveConfigBtn) saveConfigBtn.addEventListener('click', saveConfig);
var exportConfigBtn = document.getElementById('export-config-btn');
if(exportConfigBtn) exportConfigBtn.addEventListener('click', exportConfigJson);

// ── Branding ──────────────────────────────────────────────────────────────────
var logoImgZone = document.getElementById('logo-img-zone');
if(logoImgZone) logoImgZone.addEventListener('click', function(){ document.getElementById('logo-img-input').click(); });
var logoImgInput = document.getElementById('logo-img-input');
if(logoImgInput) logoImgInput.addEventListener('change', function(){ handleLogoImageUpload(this); });
var logoImgUploadBtn = document.getElementById('logo-img-upload-btn');
if(logoImgUploadBtn) logoImgUploadBtn.addEventListener('click', function(){ document.getElementById('logo-img-input').click(); });
var logoImgClearBtn = document.getElementById('logo-img-clear-btn');
if(logoImgClearBtn) logoImgClearBtn.addEventListener('click', clearLogoImage);

// Logo emoji / brand name / TLD inputs
var cfgLogoMark = document.getElementById('cfg-logo-mark');
if(cfgLogoMark) cfgLogoMark.addEventListener('input', function(){ updateLogoEmojiPreview(this.value); });
var cfgLogoName = document.getElementById('cfg-logo-name');
if(cfgLogoName) cfgLogoName.addEventListener('input', function(){
  var el = document.getElementById('brand-preview-name');
  if(el) el.textContent = this.value || 'EquitySight';
});
var cfgLogoTld = document.getElementById('cfg-logo-tld');
if(cfgLogoTld) cfgLogoTld.addEventListener('input', function(){
  var el = document.getElementById('brand-preview-tld');
  if(el) el.textContent = this.value;
});

// Theme swatches
document.querySelectorAll('.brand-theme-swatch[data-theme]').forEach(function(btn){
  btn.addEventListener('click', function(){ selectTheme(this.dataset.theme); });
});

// Brand color inputs
var cfgBrandColor = document.getElementById('cfg-brand-color');
if(cfgBrandColor) cfgBrandColor.addEventListener('input', function(){ syncBrandColor(this.value); });
var cfgBrandColorHex = document.getElementById('cfg-brand-color-hex');
if(cfgBrandColorHex) cfgBrandColorHex.addEventListener('input', function(){ syncBrandColorHex(this.value); });

var saveBrandingBtn = document.getElementById('save-branding-btn');
if(saveBrandingBtn) saveBrandingBtn.addEventListener('click', saveConfig);

// ── Scenarios ─────────────────────────────────────────────────────────────────
var loadScenariosBtn = document.getElementById('load-scenarios-btn');
if(loadScenariosBtn) loadScenariosBtn.addEventListener('click', loadAllScenarios);

// ── Gov Schemes ───────────────────────────────────────────────────────────────
var addSchemeBtn = document.getElementById('add-scheme-btn');
if(addSchemeBtn) addSchemeBtn.addEventListener('click', addScheme);
var collapseSchemesBtn = document.getElementById('collapse-schemes-btn');
if(collapseSchemesBtn) collapseSchemesBtn.addEventListener('click', collapseAllSchemes);
var saveSchemesBtn = document.getElementById('save-schemes-btn');
if(saveSchemesBtn) saveSchemesBtn.addEventListener('click', saveSchemes);

// ── Growth data ───────────────────────────────────────────────────────────────
var loadGrowthBtn = document.getElementById('load-growth-btn');
if(loadGrowthBtn) loadGrowthBtn.addEventListener('click', loadGrowthData);
var showAddGrowthBtn = document.getElementById('show-add-growth-btn');
if(showAddGrowthBtn) showAddGrowthBtn.addEventListener('click', showAddGrowthEntry);
var importGrowthCsvBtn = document.getElementById('import-growth-csv-btn');
if(importGrowthCsvBtn) importGrowthCsvBtn.addEventListener('click', function(){ document.getElementById('growth-csv-input').click(); });
var growthCsvInput = document.getElementById('growth-csv-input');
if(growthCsvInput) growthCsvInput.addEventListener('change', function(){ importGrowthCSV(this); });
var saveGrowthEntryBtn = document.getElementById('save-growth-entry-btn');
if(saveGrowthEntryBtn) saveGrowthEntryBtn.addEventListener('click', saveGrowthEntry);
var hideGrowthEntryBtn = document.getElementById('hide-growth-entry-btn');
if(hideGrowthEntryBtn) hideGrowthEntryBtn.addEventListener('click', hideAddGrowthEntry);

// ── Database ──────────────────────────────────────────────────────────────────
var purgeSessionsBtn = document.getElementById('purge-sessions-btn');
if(purgeSessionsBtn) purgeSessionsBtn.addEventListener('click', purgeExpiredSessions);
var purgeProfilesBtn = document.getElementById('purge-profiles-btn');
if(purgeProfilesBtn) purgeProfilesBtn.addEventListener('click', purgeOrphanedProfiles);
var purgeScenariosBtn = document.getElementById('purge-scenarios-btn');
if(purgeScenariosBtn) purgeScenariosBtn.addEventListener('click', purgeOrphanedScenarios);
var exportUsersBtn = document.getElementById('export-users-btn');
if(exportUsersBtn) exportUsersBtn.addEventListener('click', exportAllUsers);

// ── Email templates ───────────────────────────────────────────────────────────
var etTypeSelect = document.getElementById('et-type-select');
if(etTypeSelect) etTypeSelect.addEventListener('change', onEmailTemplateTypeChange);
var resetEtBtn = document.getElementById('reset-et-btn');
if(resetEtBtn) resetEtBtn.addEventListener('click', resetEmailTemplate);
var saveEtBtn = document.getElementById('save-et-btn');
if(saveEtBtn) saveEtBtn.addEventListener('click', saveEmailTemplate);
var previewEtBtn = document.getElementById('preview-et-btn');
if(previewEtBtn) previewEtBtn.addEventListener('click', previewEmailTemplate);
var etTestBtn = document.getElementById('et-test-btn');
if(etTestBtn) etTestBtn.addEventListener('click', sendTestEmail);

// ── About page ────────────────────────────────────────────────────────────────
var saveAboutBtn = document.getElementById('save-about-btn');
if(saveAboutBtn) saveAboutBtn.addEventListener('click', saveAboutPage);
var resetAboutBtn = document.getElementById('reset-about-btn');
if(resetAboutBtn) resetAboutBtn.addEventListener('click', resetAboutPage);

// ── Suburbs ───────────────────────────────────────────────────────────────────
var triggerSuburbRebuildBtn = document.getElementById('trigger-suburb-rebuild-btn');
if(triggerSuburbRebuildBtn) triggerSuburbRebuildBtn.addEventListener('click', triggerSuburbRebuild);
var saveSuburbHookBtn = document.getElementById('save-suburb-hook-btn');
if(saveSuburbHookBtn) saveSuburbHookBtn.addEventListener('click', saveSuburbDeployHook);
var editSuburbHookBtn = document.getElementById('edit-suburb-hook-btn');
if(editSuburbHookBtn) editSuburbHookBtn.addEventListener('click', editSuburbDeployHook);
var suburbsAdminSearch = document.getElementById('suburbs-admin-search');
if(suburbsAdminSearch) suburbsAdminSearch.addEventListener('input', searchAdminSuburbs);

// ── Legal pages ───────────────────────────────────────────────────────────────
var legalPageSelect = document.getElementById('legal-page-select');
if(legalPageSelect) legalPageSelect.addEventListener('change', function(){ loadLegalPage(this.value); });
var previewLegalBtn = document.getElementById('preview-legal-btn');
if(previewLegalBtn) previewLegalBtn.addEventListener('click', previewLegalPage);
var reloadLegalBtn = document.getElementById('reload-legal-btn');
if(reloadLegalBtn) reloadLegalBtn.addEventListener('click', reloadLegalFromFile);
var resetLegalBtn = document.getElementById('reset-legal-btn');
if(resetLegalBtn) resetLegalBtn.addEventListener('click', resetLegalPage);
var saveLegalBtn = document.getElementById('save-legal-btn');
if(saveLegalBtn) saveLegalBtn.addEventListener('click', saveLegalPage);

// Legal preview overlay
var legalPreviewOverlay = document.getElementById('legal-preview-overlay');
if(legalPreviewOverlay){
  legalPreviewOverlay.addEventListener('click', function(e){
    if(e.target === this) this.style.display = 'none';
  });
  var closeLegalPreviewBtn = legalPreviewOverlay.querySelector('button');
  if(closeLegalPreviewBtn) closeLegalPreviewBtn.id = 'close-legal-preview-btn';
}
var closeLegalPreviewBtn2 = document.getElementById('close-legal-preview-btn');
if(closeLegalPreviewBtn2) closeLegalPreviewBtn2.addEventListener('click', function(){
  document.getElementById('legal-preview-overlay').style.display = 'none';
});

// ── Modals / overlays ─────────────────────────────────────────────────────────
var closeScenarioDetailBtn = document.getElementById('close-scenario-detail-btn');
if(closeScenarioDetailBtn) closeScenarioDetailBtn.addEventListener('click', function(){
  document.getElementById('scenario-detail-overlay').classList.remove('open');
});
var closeUserDetailBtn = document.getElementById('close-user-detail-btn');
if(closeUserDetailBtn) closeUserDetailBtn.addEventListener('click', function(){
  document.getElementById('user-detail-overlay').classList.remove('open');
});

// Reset pw modal
var resetPwConfirmBtn = document.getElementById('reset-pw-confirm-btn');
if(resetPwConfirmBtn) resetPwConfirmBtn.addEventListener('click', confirmResetPw);
var resetModalCancelBtn = document.getElementById('reset-modal-cancel-btn');
if(resetModalCancelBtn) resetModalCancelBtn.addEventListener('click', closeResetModal);
var resetBackBtn = document.getElementById('reset-back-btn');
if(resetBackBtn) resetBackBtn.addEventListener('click', function(){ closeResetModal(); backToUserDetail(); });

// Plan modal
var confirmPlanChangeBtn = document.getElementById('confirm-plan-change-btn');
if(confirmPlanChangeBtn) confirmPlanChangeBtn.addEventListener('click', confirmPlanChange);
var closePlanModalBtn = document.getElementById('close-plan-modal-btn');
if(closePlanModalBtn) closePlanModalBtn.addEventListener('click', closePlanModal);
var planBackBtn = document.getElementById('plan-back-btn');
if(planBackBtn) planBackBtn.addEventListener('click', function(){ closePlanModal(); backToUserDetail(); });

// Bootstrap admin
var bootstrapBtn = document.getElementById('bootstrap-btn');
if(bootstrapBtn) bootstrapBtn.addEventListener('click', bootstrapAdmin);

// History modal
var historyModalOverlay = document.getElementById('history-modal-overlay');
if(historyModalOverlay) historyModalOverlay.addEventListener('click', function(e){ if(e.target === this) closeHistoryModal(); });
var historyBackBtn = document.getElementById('history-back-btn');
if(historyBackBtn) historyBackBtn.addEventListener('click', function(){ closeHistoryModal(); backToUserDetail(); });
// Close history modal (✕ button — second button in header)
(function(){
  var overlay = document.getElementById('history-modal-overlay');
  if(!overlay) return;
  var btns = overlay.querySelectorAll('button');
  // history-back-btn is first, close ✕ is second
  if(btns.length >= 2) {
    var closeBtn = btns[btns.length - 1];
    if(!closeBtn.id) {
      closeBtn.id = 'history-close-btn';
      closeBtn.addEventListener('click', closeHistoryModal);
    }
  }
})();

// Email preview overlay
var emailPreviewOverlay = document.getElementById('email-preview-overlay');
if(emailPreviewOverlay) emailPreviewOverlay.addEventListener('click', function(e){ if(e.target === this) closeEmailPreview(); });
(function(){
  var overlay = document.getElementById('email-preview-overlay');
  if(!overlay) return;
  var closeBtn = overlay.querySelector('button');
  if(closeBtn && !closeBtn.id) {
    closeBtn.id = 'email-preview-close-btn';
    closeBtn.addEventListener('click', closeEmailPreview);
  }
})();
