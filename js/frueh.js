// Wird vor allem anderen geladen (klassisches Skript im <head>):
// gemerktes Design, Textgröße und Style sofort setzen, damit beim Start nichts aufblitzt oder springt.
// Als eigene Datei statt eingebettet, damit die Sicherheitsregel (Content-Security-Policy) nur Skripte von hier erlaubt.
(function () {
  try {
    var p = /beta/i.test(location.pathname) ? 'vsb-' : 'vs-';
    var d = localStorage.getItem(p + 'design');
    if (d === 'dunkel') document.documentElement.dataset.theme = 'dark';
    else if (d === 'hell') document.documentElement.dataset.theme = 'light';
    var tg = localStorage.getItem(p + 'text');
    if (tg === 'gross') document.documentElement.style.zoom = '1.15';
    else if (tg === 'sehrgross') document.documentElement.style.zoom = '1.3';
    var st = localStorage.getItem(p + 'style');
    if (st && st !== 'standard') document.documentElement.dataset.style = st;
  } catch (e) { /* privater Modus */ }
})();
