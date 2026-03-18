// Apply saved theme before render to prevent flash of wrong theme.
// Loaded synchronously (no defer/async) so it runs before CSS paints.
(function(){ try{ if(localStorage.getItem('equitySight_theme')==='dark') document.documentElement.classList.add('dark-mode'); }catch(e){} })();
