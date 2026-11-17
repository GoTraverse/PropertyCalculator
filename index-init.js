// index-init.js — PWA standalone redirect (must load synchronously, no defer)
// The installed app opens on the First Home Journey (manifest start_url), so if
// a standalone session ever lands on the marketing homepage, send it there.
if (window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches) {
  window.location.replace('/journey');
}
