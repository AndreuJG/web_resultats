(function () {
  function autoSubmit(formId, selectId) {
    var form = document.getElementById(formId);
    var select = document.getElementById(selectId);
    if (!form || !select) { return; }
    select.addEventListener('change', function () { form.submit(); });
    var button = form.querySelector('button[type="submit"]');
    if (button) { button.style.display = 'none'; }
  }
  autoSubmit('round-form', 'jornada');
  autoSubmit('phase-form', 'fase');
  autoSubmit('group-form', 'grup');
  var status = document.getElementById('live-refresh-status');
  if (!status || status.getAttribute('data-auto') !== '1') { return; }
  var delay = Number(status.getAttribute('data-refresh-ms'));
  if (!(delay > 0)) { return; }
  var due = new Date().getTime() + delay;
  var timer = null;
  function pause() {
    if (timer !== null) { window.clearTimeout(timer); timer = null; }
  }
  function resume() {
    pause();
    if (document.hidden) { return; }
    var remaining = due - new Date().getTime();
    if (remaining <= 0) { window.location.reload(); return; }
    timer = window.setTimeout(resume, remaining);
  }
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('pagehide', pause);
  window.addEventListener('pageshow', resume);
  resume();
}());
