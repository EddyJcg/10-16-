(function () {
  const launcher = document.getElementById('chatbot-launcher');
  const dialog = document.getElementById('chatbot-dialog');
  const frame = document.getElementById('chatbot-frame');
  const closeBtn = document.getElementById('chatbot-close');
  if (!launcher || !dialog || !frame || !closeBtn) return;

  const MIN_W = 240;
  const MIN_H = 380;
  const DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  // inventory.css의 전역 dialog 규칙(!important)을 이기려면 인라인 !important로 지정해야 합니다.
  function setRect(left, top, width, height) {
    const style = dialog.style;
    style.setProperty('left', left + 'px', 'important');
    style.setProperty('top', top + 'px', 'important');
    style.setProperty('right', 'auto', 'important');
    style.setProperty('bottom', 'auto', 'important');
    style.setProperty('width', width + 'px', 'important');
    style.setProperty('height', height + 'px', 'important');
  }

  function currentRect() {
    const r = dialog.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }

  function fitInViewport() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const r = currentRect();
    const w = Math.min(r.width, vw);
    const h = Math.min(r.height, vh);
    setRect(clamp(r.left, 0, vw - w), clamp(r.top, 0, vh - h), w, h);
  }

  function startDrag(event, mode) {
    event.preventDefault();
    const target = event.currentTarget;
    const start = currentRect();
    const startX = event.clientX;
    const startY = event.clientY;
    target.setPointerCapture(event.pointerId);

    function onMove(e) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (mode === 'move') {
        setRect(
          clamp(start.left + dx, 0, vw - start.width),
          clamp(start.top + dy, 0, vh - start.height),
          start.width,
          start.height
        );
        return;
      }

      let left = start.left;
      let top = start.top;
      let width = start.width;
      let height = start.height;
      if (mode.includes('e')) {
        width = clamp(start.width + dx, MIN_W, vw - start.left);
      }
      if (mode.includes('w')) {
        left = clamp(start.left + dx, 0, start.right - MIN_W);
        width = start.right - left;
      }
      if (mode.includes('s')) {
        height = clamp(start.height + dy, MIN_H, vh - start.top);
      }
      if (mode.includes('n')) {
        top = clamp(start.top + dy, 0, start.bottom - MIN_H);
        height = start.bottom - top;
      }
      setRect(left, top, width, height);
    }

    function onUp() {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
    }

    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  }

  const dragBar = document.createElement('div');
  dragBar.className = 'chatbot-drag';
  dragBar.title = '드래그하여 이동';
  dragBar.addEventListener('pointerdown', function (event) {
    startDrag(event, 'move');
  });
  dialog.appendChild(dragBar);

  DIRS.forEach(function (dir) {
    const handle = document.createElement('div');
    handle.className = 'chatbot-resize rh-' + dir;
    handle.addEventListener('pointerdown', function (event) {
      startDrag(event, dir);
    });
    dialog.appendChild(handle);
  });

  launcher.addEventListener('click', function () {
    if (!frame.getAttribute('src')) frame.src = encodeURI('/챗봇.html');
    if (!dialog.open) dialog.show();
  });
  closeBtn.addEventListener('click', function () {
    dialog.close();
    launcher.focus();
  });
  window.addEventListener('resize', function () {
    if (dialog.open) fitInViewport();
  });
})();
