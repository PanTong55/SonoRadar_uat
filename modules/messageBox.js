// modules/messageBox.js

export function showMessageBox({
  message = '',
  title = '',
  confirmText = 'OK',
  cancelText = null,
  onConfirm,
  onCancel,
  width = 420
} = {}) {
  const popup = document.createElement('div');
  popup.className = 'map-popup modal-popup';
  popup.style.width = `${width}px`;

  const dragBar = document.createElement('div');
  dragBar.className = 'popup-drag-bar';
  if (title) {
    const titleSpan = document.createElement('span');
    titleSpan.className = 'popup-title';
    titleSpan.textContent = title;
    dragBar.appendChild(titleSpan);
  }
  const closeBtn = document.createElement('button');
  closeBtn.className = 'popup-close-btn';
  closeBtn.title = 'Close';
  closeBtn.innerHTML = '&times;';
  dragBar.appendChild(closeBtn);
  popup.appendChild(dragBar);

  const content = document.createElement('div');
  content.className = 'message-box-content';
  content.textContent = message;
  popup.appendChild(content);

  const actions = document.createElement('div');
  actions.className = 'message-box-actions';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'flat-icon-button';
  confirmBtn.textContent = confirmText;
  actions.appendChild(confirmBtn);

  let cancelBtn = null;
  if (cancelText) {
    cancelBtn = document.createElement('button');
    cancelBtn.className = 'flat-icon-button';
    cancelBtn.textContent = cancelText;
    actions.appendChild(cancelBtn);
  }
  popup.appendChild(actions);

  function close(result) {
    popup.remove();
    if (result === 'confirm' && typeof onConfirm === 'function') {
      onConfirm();
    } else if (result === 'cancel' && typeof onCancel === 'function') {
      onCancel();
    }
  }

  confirmBtn.addEventListener('click', () => close('confirm'));
  cancelBtn?.addEventListener('click', () => close('cancel'));
  closeBtn.addEventListener('click', () => close('close'));

  document.body.appendChild(popup);
}

export function showPromptBox({
  message = '',
  title = '',
  placeholder = '',
  confirmText = 'OK',
  cancelText = 'Cancel',
  width = 420
} = {}) {
  return new Promise((resolve, reject) => {
    const popup = document.createElement('div');
    popup.className = 'map-popup modal-popup';
    popup.style.width = `${width}px`;

    const dragBar = document.createElement('div');
    dragBar.className = 'popup-drag-bar';
    if (title) {
      const titleSpan = document.createElement('span');
      titleSpan.className = 'popup-title';
      titleSpan.textContent = title;
      dragBar.appendChild(titleSpan);
    }
    const closeBtn = document.createElement('button');
    closeBtn.className = 'popup-close-btn';
    closeBtn.title = 'Close';
    closeBtn.innerHTML = '&times;';
    dragBar.appendChild(closeBtn);
    popup.appendChild(dragBar);

    const content = document.createElement('div');
    content.className = 'message-box-content';
    const msg = document.createElement('div');
    msg.innerHTML = message;
    content.appendChild(msg);

    const input = document.createElement('input');
    input.type = 'password';
    input.placeholder = placeholder;
    input.className = 'message-box-input';
    input.style.width = '100%';
    input.style.boxSizing = 'border-box';
    input.style.marginTop = '8px';
    content.appendChild(input);

    const hint = document.createElement('div');
    hint.className = 'message-box-hint';
    hint.style.color = 'red';
    hint.style.display = 'none';
    content.appendChild(hint);

    popup.appendChild(content);

    const actions = document.createElement('div');
    actions.className = 'message-box-actions';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'flat-icon-button';
    confirmBtn.textContent = confirmText;
    actions.appendChild(confirmBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'flat-icon-button';
    cancelBtn.textContent = cancelText;
    actions.appendChild(cancelBtn);
    popup.appendChild(actions);

    function close(result, value) {
      popup.remove();
      if (result === 'confirm') resolve({ confirmed: true, value });
      else resolve({ confirmed: false });
    }

    confirmBtn.addEventListener('click', () => close('confirm', input.value));
    cancelBtn.addEventListener('click', () => close('cancel'));
    closeBtn.addEventListener('click', () => close('close'));

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmBtn.click();
      }
    });

    document.body.appendChild(popup);
    setTimeout(() => input.focus(), 10);
  });
}
