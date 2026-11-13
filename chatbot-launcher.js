(function () {
  const launcher = document.getElementById('chatbot-launcher');
  const dialog = document.getElementById('chatbot-dialog');
  const frame = document.getElementById('chatbot-frame');
  const closeBtn = document.getElementById('chatbot-close');
  if (!launcher || !dialog || !frame || !closeBtn) return;

  launcher.addEventListener('click', function () {
    if (!frame.getAttribute('src')) frame.src = encodeURI('/챗봇.html');
    if (!dialog.open) dialog.show();
  });
  closeBtn.addEventListener('click', function () {
    dialog.close();
    launcher.focus();
  });
})();
