/* ==========================================================================
   confirmDialog.js — Modern Confirmation & Alert Modals
   Dynamic SRF Management Platform v2.0
   ========================================================================== */

let activeModal = null;

/**
 * Show a confirmation dialog
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {string} opts.confirmText
 * @param {string} opts.cancelText
 * @param {string} opts.type - 'danger' | 'warning' | 'success' | 'info'
 * @param {Function} opts.onConfirm
 * @param {Function} opts.onCancel
 */
export function showConfirm({
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger',
  onConfirm,
  onCancel
}) {
  dismissModal();

  const colors = {
    danger:  { icon: '⚠', color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  btnClass: 'btn-danger' },
    warning: { icon: '⚠', color: '#d97706', bg: 'rgba(217,119,6,0.08)', btnClass: 'btn-warning' },
    success: { icon: '✓', color: '#10b981', bg: 'rgba(16,185,129,0.08)', btnClass: 'btn-success-solid' },
    info:    { icon: 'ℹ', color: '#4f46e5', bg: 'rgba(79,70,229,0.08)',  btnClass: 'btn-primary' },
  };
  const c = colors[type] || colors.info;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom';
  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in">
      <div class="modal-icon-wrap" style="background:${c.bg}; color:${c.color};">
        <span style="font-size:24px;">${c.icon}</span>
      </div>
      <h3 class="modal-title-custom">${title}</h3>
      <p class="modal-msg-custom">${message}</p>
      <div class="modal-actions-custom">
        <button id="modal-cancel-btn" class="btn btn-secondary">${cancelText}</button>
        <button id="modal-confirm-btn" class="btn ${c.btnClass}">${confirmText}</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  activeModal = backdrop;

  // Bind events
  backdrop.querySelector('#modal-confirm-btn').addEventListener('click', () => {
    dismissModal();
    if (onConfirm) onConfirm();
  });

  backdrop.querySelector('#modal-cancel-btn').addEventListener('click', () => {
    dismissModal();
    if (onCancel) onCancel();
  });

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      dismissModal();
      if (onCancel) onCancel();
    }
  });

  // Animate in
  requestAnimationFrame(() => {
    backdrop.classList.add('visible');
  });

  return backdrop;
}

/**
 * Show a success/info alert (no cancel button)
 */
export function showAlert({ title, message, type = 'success', confirmText = 'OK', onClose }) {
  dismissModal();

  const colors = {
    success: { icon: '✓', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
    info:    { icon: 'ℹ', color: '#4f46e5', bg: 'rgba(79,70,229,0.08)' },
    error:   { icon: '✕', color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
    warning: { icon: '⚠', color: '#d97706', bg: 'rgba(217,119,6,0.08)' },
  };
  const c = colors[type] || colors.info;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom';
  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in">
      <div class="modal-icon-wrap" style="background:${c.bg}; color:${c.color};">
        <span style="font-size:26px;">${c.icon}</span>
      </div>
      <h3 class="modal-title-custom">${title}</h3>
      <p class="modal-msg-custom">${message}</p>
      <div class="modal-actions-custom" style="justify-content:center;">
        <button id="modal-ok-btn" class="btn btn-primary" style="min-width:120px;">${confirmText}</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  activeModal = backdrop;

  backdrop.querySelector('#modal-ok-btn').addEventListener('click', () => {
    dismissModal();
    if (onClose) onClose();
  });

  requestAnimationFrame(() => { backdrop.classList.add('visible'); });
  return backdrop;
}

/**
 * Show a prompt dialog with an input field
 */
export function showPrompt({ title, message, placeholder = '', confirmText = 'Submit', type = 'info', onConfirm, onCancel }) {
  dismissModal();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom';
  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width:480px;">
      <h3 class="modal-title-custom">${title}</h3>
      <p class="modal-msg-custom">${message}</p>
      <textarea id="modal-prompt-input" rows="4" placeholder="${placeholder}"
        style="width:100%;border:1px solid var(--border-color);border-radius:8px;padding:10px 12px;
               font-size:13.5px;resize:vertical;font-family:var(--font-body);color:var(--text-main);
               background:var(--bg-deep);margin-bottom:16px;"></textarea>
      <div class="modal-actions-custom">
        <button id="modal-cancel-btn" class="btn btn-secondary">${'Cancel'}</button>
        <button id="modal-confirm-btn" class="btn btn-primary">${confirmText}</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  activeModal = backdrop;

  backdrop.querySelector('#modal-confirm-btn').addEventListener('click', () => {
    const value = backdrop.querySelector('#modal-prompt-input').value.trim();
    dismissModal();
    if (onConfirm) onConfirm(value);
  });

  backdrop.querySelector('#modal-cancel-btn').addEventListener('click', () => {
    dismissModal();
    if (onCancel) onCancel();
  });

  requestAnimationFrame(() => { backdrop.classList.add('visible'); });
  setTimeout(() => backdrop.querySelector('#modal-prompt-input').focus(), 100);
  return backdrop;
}

function dismissModal() {
  if (activeModal) {
    const modalToDismiss = activeModal;
    const card = modalToDismiss.querySelector('.modal-card-custom');
    if (card) card.style.transform = 'scale(0.95)';
    modalToDismiss.classList.remove('visible');
    activeModal = null;
    setTimeout(() => {
      modalToDismiss.remove();
    }, 200);
  }
}

/**
 * Show an inline file viewer modal for PDF or image data URLs
 */
export function showFileViewer({ title = 'File Viewer', dataUrl, fileName }) {
  dismissModal();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom';
  
  const isImage = (dataUrl && (dataUrl.startsWith('data:image/') || dataUrl.includes('image/'))) || 
                  (fileName && fileName.match(/\.(png|jpe?g|gif|webp|svg)$/i));
  const isPdf = (dataUrl && (dataUrl.startsWith('data:application/pdf') || dataUrl.includes('application/pdf'))) || 
                (fileName && fileName.toLowerCase().endsWith('.pdf'));

  let contentHtml = '';
  if (!dataUrl) {
    contentHtml = `<div style="padding:48px; text-align:center; color:var(--text-muted); font-size:14px; font-weight:500;">No document content available to preview.</div>`;
  } else if (isImage) {
    contentHtml = `
      <div style="text-align:center; padding:16px; max-height:70vh; overflow-y:auto; display:flex; align-items:center; justify-content:center;">
        <img src="${dataUrl}" alt="${fileName}" style="max-width:100%; max-height:60vh; border-radius:8px; object-fit:contain; border:1px solid var(--border-color); box-shadow:var(--shadow-normal);" />
      </div>
    `;
  } else if (isPdf) {
    contentHtml = `
      <div style="width:100%; height:70vh; min-height:500px;">
        <iframe src="${dataUrl}" width="100%" height="100%" style="border:none; border-radius:8px;"></iframe>
      </div>
    `;
  } else {
    contentHtml = `
      <div style="padding:48px 24px; text-align:center; color:var(--text-main);">
        <p style="font-weight:600; margin-bottom:20px; font-size:14px;">Inline preview is not supported for this file type.</p>
        <a href="${dataUrl}" download="${fileName}" class="btn btn-primary" style="font-family:var(--font-title); font-size:13.5px; font-weight:600; padding:10px 20px; border-radius:8px;">
          📥 Download File to View
        </a>
      </div>
    `;
  }

  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width:900px; width:92%; padding:24px; text-align:left; display:flex; flex-direction:column; gap:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:12px;">
        <h3 class="modal-title-custom" style="margin:0; font-size:16px; font-family:var(--font-title); font-weight:700; color:var(--text-main);">${title}</h3>
        <button id="modal-close-x" style="background:none; border:none; color:var(--text-muted); font-size:24px; cursor:pointer; font-weight:bold; padding:0; line-height:1;">&times;</button>
      </div>
      <div style="background:var(--bg-deep); border-radius:12px; overflow:hidden; border:1px solid var(--border-color);">
        ${contentHtml}
      </div>
      <div class="modal-actions-custom" style="justify-content:flex-end; border-top:1px solid var(--border-color); padding-top:12px; margin:0; gap:8px; display:flex;">
        ${dataUrl ? `
          <a href="${dataUrl}" download="${fileName}" class="btn btn-primary" style="display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:600; padding:6px 14px; border-radius:8px; text-decoration:none; color:white;">
            📥 Download Document
          </a>
        ` : ''}
        <button id="modal-close-btn" class="btn btn-secondary" style="min-width:100px;">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  activeModal = backdrop;

  const closeBtn = backdrop.querySelector('#modal-close-btn');
  const closeX = backdrop.querySelector('#modal-close-x');

  const closeHandler = () => {
    dismissModal();
  };

  closeBtn.addEventListener('click', closeHandler);
  closeX.addEventListener('click', closeHandler);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      closeHandler();
    }
  });

  requestAnimationFrame(() => { backdrop.classList.add('visible'); });
  return backdrop;
}
