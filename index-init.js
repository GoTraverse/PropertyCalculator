// index-init.js — PWA standalone redirect (must load synchronously, no defer)
// In PWA standalone mode, index.html is never the right page — go straight to app
if (window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches) {
  window.location.replace('/app');
}
