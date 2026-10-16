(function () {
  var status = document.getElementById('live-refresh-status');
  if (!status || status.getAttribute('data-auto') !== '1') { return; }
  status.innerHTML = 'Actualització automàtica cada 30 segons. Pots pausar-la amb el botó anterior.';
  window.setTimeout(function () {
    if (document.hidden) {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) { window.location.reload(); }
      });
    } else {
      window.location.reload();
    }
  }, 30000);
}());
