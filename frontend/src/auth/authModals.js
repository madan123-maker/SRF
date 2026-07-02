import { postJson, initPortal } from '../core/bootstrap.js';
import { login, getCurrentUser } from './auth.js';
import { showToast } from '../ui/toastManager.js';
import { updateUser, addAuditLog, getDepartments, getUserById } from '../db/store.js';
import { statesDistrictsData } from '../data/geoData.js';


export function sendPasswordOtp(email, otp, subject, userId) {
  return postJson('/api/send-otp', { email, otp, subject, userId });
}

export function openFirstLoginResetModal(userObj) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom visible';
  backdrop.style.zIndex = '10005';
  
  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width:420px; width:90%; padding:32px; border-radius:24px; text-align:left; background:#ffffff; box-shadow:0 25px 50px -12px rgba(0, 0, 0, 0.25);">
      <h3 class="modal-title-custom" style="margin-bottom:12px; font-family:var(--font-title); font-weight:800; font-size:22px; color:#0f172a;">Reset Password</h3>
      <p style="font-size: 14px; color: #64748b; margin-bottom: 24px; line-height:1.5;">
        For security purposes, please set a new password for your first login.
      </p>
      
      <div class="form-group" style="margin-bottom:16px; position:relative;">
        <label style="display:block; font-weight:600; margin-bottom:8px; font-size:13px; color:#334155;">New Password <span style="color:#ef4444">*</span></label>
        <div style="position:relative; display:flex; align-items:center;">
          <input type="password" id="first-reset-pwd-new" class="form-input" placeholder="••••••••" style="width:100%; border-radius:12px; padding:12px 16px; padding-right:80px; border:1px solid #cbd5e1; background:#f8fafc; transition:all 0.3s ease; outline:none; font-family:monospace;" required>
          <div style="position:absolute; right:12px; display:flex; gap:6px;">
            <button type="button" id="toggle-pwd-new" title="Show/Hide" style="background:none; border:none; padding:4px; cursor:pointer; color:#64748b; border-radius:6px; transition:0.2s;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='none'">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-icon"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
            <button type="button" id="copy-pwd-new" title="Copy Password" style="background:none; border:none; padding:4px; cursor:pointer; color:#64748b; border-radius:6px; transition:0.2s;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='none'">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>
        </div>
      </div>
      
      <div class="form-group" style="margin-bottom:28px; position:relative;">
        <label style="display:block; font-weight:600; margin-bottom:8px; font-size:13px; color:#334155;">Confirm Password <span style="color:#ef4444">*</span></label>
        <div style="position:relative; display:flex; align-items:center;">
          <input type="password" id="first-reset-pwd-confirm" class="form-input" placeholder="••••••••" style="width:100%; border-radius:12px; padding:12px 16px; padding-right:44px; border:1px solid #cbd5e1; background:#f8fafc; transition:all 0.3s ease; outline:none; font-family:monospace;" required>
          <button type="button" id="toggle-pwd-confirm" title="Show/Hide" style="position:absolute; right:12px; background:none; border:none; padding:4px; cursor:pointer; color:#64748b; border-radius:6px; transition:0.2s;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='none'">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="eye-icon"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          </button>
        </div>
      </div>
      
      <button class="btn btn-primary" id="btn-submit-first-reset-pwd" style="width:100%; border-radius:12px; padding:14px; font-size:15px; font-weight:700; background:linear-gradient(135deg, #4f46e5, #7c3aed); border:none; box-shadow:0 4px 14px 0 rgba(99, 102, 241, 0.39); transition:all 0.3s ease; display:flex; justify-content:center; align-items:center; gap:8px;">
        <span class="btn-text">Update Password</span>
        <svg class="spinner-icon" style="display:none; animation:spin 1s linear infinite;" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
      </button>
    </div>
    <style>
      @keyframes spin { 100% { transform: rotate(360deg); } }
      .form-input:focus { border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2) !important; background: #fff !important; }
      #btn-submit-first-reset-pwd:hover { transform: translateY(-2px); box-shadow:0 6px 20px rgba(99,102,241,0.5); }
      #btn-submit-first-reset-pwd:active { transform: translateY(0); }
    </style>
  `;
  
  document.body.appendChild(backdrop);
  
  const newPwdInput = backdrop.querySelector('#first-reset-pwd-new');
  const confirmPwdInput = backdrop.querySelector('#first-reset-pwd-confirm');
  
  // Show/Hide Toggle Logic
  const toggleVisibility = (inputEl, btnEl) => {
    const isPassword = inputEl.type === 'password';
    inputEl.type = isPassword ? 'text' : 'password';
    btnEl.innerHTML = isPassword 
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
  };
  
  backdrop.querySelector('#toggle-pwd-new').addEventListener('click', function() {
    toggleVisibility(newPwdInput, this);
  });
  
  backdrop.querySelector('#toggle-pwd-confirm').addEventListener('click', function() {
    toggleVisibility(confirmPwdInput, this);
  });
  
  // Copy Password Logic
  backdrop.querySelector('#copy-pwd-new').addEventListener('click', function() {
    if (newPwdInput.value) {
      navigator.clipboard.writeText(newPwdInput.value).then(() => {
        const originalHtml = this.innerHTML;
        this.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        setTimeout(() => { this.innerHTML = originalHtml; }, 2000);
      });
    }
  });

  const submitBtn = backdrop.querySelector('#btn-submit-first-reset-pwd');
  const btnText = submitBtn.querySelector('.btn-text');
  const spinner = submitBtn.querySelector('.spinner-icon');
  
  submitBtn.addEventListener('click', async () => {
    const newPwd = newPwdInput.value;
    const confirmPwd = confirmPwdInput.value;
    
    if (!newPwd || !confirmPwd) {
      showToast('Please fill in all password fields.', 'error');
      return;
    }
    if (newPwd !== confirmPwd) {
      showToast('Passwords do not match.', 'error');
      return;
    }
    if (newPwd.length < 3) {
      showToast('Password must be at least 3 characters long.', 'error');
      return;
    }
    
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.8';
    btnText.textContent = 'Updating...';
    spinner.style.display = 'block';
    
    try {
      await postJson('/api/change-password', { userId: userObj.id, newPassword: newPwd });
      updateUser(userObj.id, { password: newPwd, mustResetPassword: false });
      addAuditLog(userObj.id, 'Reset temporary password on first login', 'auth', userObj.id);
      showToast('Password updated successfully! Logging you in...', 'success');
      
      // Add success animation to button
      submitBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
      btnText.textContent = 'Success!';
      spinner.style.display = 'none';
      
      setTimeout(() => {
        backdrop.remove();
        initPortal();
      }, 800);
      
    } catch(err) {
      showToast(err.message || 'Failed to update password.', 'error');
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
      btnText.textContent = 'Update Password';
      spinner.style.display = 'none';
    }
  });
}

export function openForgotPasswordModal() {
  let step = 1;
  let userId = '';
  let maskedEmail = '';
  
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom visible';
  backdrop.style.zIndex = '10005';
  
  const renderStep = () => {
    let html = '';
    if (step === 1) {
      html = `
        <div class="modal-card-custom animate-modal-in" style="max-width: 420px; width: 90%; padding: 32px; border-radius: 24px; text-align: left; background: #ffffff; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);">
          <h3 class="modal-title-custom" style="margin-bottom:12px; font-family:var(--font-title); font-weight:800; font-size:22px; color:#0f172a;">Account Recovery</h3>
          <p class="modal-msg-custom" style="font-size: 14px; color: #64748b; margin-bottom: 24px; line-height:1.5;">Enter your username or registered email. We will send you an OTP code to verify your identity.</p>
          <div class="form-group" style="margin-bottom: 24px;">
            <label for="recovery-input" style="font-weight:600; font-size:13px; margin-bottom:8px; display:block; color:#334155;">Username or Email</label>
            <input type="text" id="recovery-input" required class="form-input" placeholder="e.g. ap_officer" style="width: 100%; border-radius: 12px; padding: 12px 16px; border: 1px solid #cbd5e1; background: #f8fafc; outline: none; transition: all 0.3s ease;">
          </div>
          <div class="modal-actions-custom" style="margin-top: 24px; display: flex; gap: 12px; justify-content: flex-end;">
            <button type="button" class="btn btn-secondary" id="btn-recovery-cancel" style="border-radius: 12px; padding: 12px 24px; font-weight: 600; background: #f1f5f9; color: #475569; border: none;">Cancel</button>
            <button type="button" class="btn btn-primary" id="btn-recovery-send" style="border-radius: 12px; padding: 12px 24px; font-weight: 700; background: linear-gradient(135deg, #4f46e5, #7c3aed); border: none; box-shadow: 0 4px 14px 0 rgba(99, 102, 241, 0.39); color: white; display: flex; align-items: center; justify-content: center; min-width: 120px;">
              <span class="btn-text">Send OTP</span>
              <svg class="spinner-icon" style="display:none; animation:spin 1s linear infinite; margin-left:8px;" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
            </button>
          </div>
        </div>
      `;
    } else if (step === 2) {
      html = `
        <div class="modal-card-custom animate-modal-in" style="max-width: 420px; width: 90%; padding: 32px; border-radius: 24px; text-align: left; background: #ffffff; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);">
          <h3 class="modal-title-custom" style="margin-bottom:12px; font-family:var(--font-title); font-weight:800; font-size:22px; color:#0f172a;">Reset Password</h3>
          <p class="modal-msg-custom" style="font-size: 14px; color: #64748b; margin-bottom: 24px; line-height:1.5;">We have sent a 6-digit OTP code to <strong>${maskedEmail}</strong>. Please enter the OTP and your new password below.</p>
          <div class="form-group" style="margin-bottom: 16px;">
            <label for="recovery-otp" style="font-weight:600; font-size:13px; margin-bottom:8px; display:block; color:#334155;">6-Digit OTP Code</label>
            <input type="text" id="recovery-otp" maxlength="6" required class="form-input" placeholder="e.g. 123456" style="width: 100%; text-align: center; font-size: 18px; font-weight: bold; letter-spacing: 4px; border-radius: 12px; padding: 12px 16px; border: 1px solid #cbd5e1; background: #f8fafc; outline: none; transition: all 0.3s ease;">
          </div>
          <div class="form-group" style="margin-bottom: 16px; position:relative;">
            <label for="recovery-pwd-new" style="font-weight:600; font-size:13px; margin-bottom:8px; display:block; color:#334155;">New Password</label>
            <input type="password" id="recovery-pwd-new" required class="form-input" placeholder="••••••••" style="width: 100%; border-radius: 12px; padding: 12px 16px; padding-right:40px; border: 1px solid #cbd5e1; background: #f8fafc; outline: none; transition: all 0.3s ease; font-family:monospace;">
            <button type="button" class="toggle-rec-pwd" data-target="recovery-pwd-new" style="position:absolute; right:12px; bottom:12px; background:none; border:none; cursor:pointer; color:#64748b; display:flex; align-items:center; justify-content:center; padding:4px; border-radius:6px; transition:0.2s;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='none'">
              <svg class="eye-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
          <div class="form-group" style="margin-bottom: 24px; position:relative;">
            <label for="recovery-pwd-confirm" style="font-weight:600; font-size:13px; margin-bottom:8px; display:block; color:#334155;">Confirm New Password</label>
            <input type="password" id="recovery-pwd-confirm" required class="form-input" placeholder="••••••••" style="width: 100%; border-radius: 12px; padding: 12px 16px; padding-right:40px; border: 1px solid #cbd5e1; background: #f8fafc; outline: none; transition: all 0.3s ease; font-family:monospace;">
            <button type="button" class="toggle-rec-pwd" data-target="recovery-pwd-confirm" style="position:absolute; right:12px; bottom:12px; background:none; border:none; cursor:pointer; color:#64748b; display:flex; align-items:center; justify-content:center; padding:4px; border-radius:6px; transition:0.2s;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='none'">
              <svg class="eye-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
          <div class="modal-actions-custom" style="display: flex; gap: 12px; justify-content: space-between; align-items: center;">
            <button type="button" class="btn btn-link" id="btn-recovery-resend" style="color: var(--primary); padding: 0; font-size: 13px; font-weight: 600;">Resend OTP</button>
            <div style="display:flex; gap:12px;">
              <button type="button" class="btn btn-secondary" id="btn-recovery-back" style="border-radius: 12px; padding: 12px 24px; font-weight: 600; background: #f1f5f9; color: #475569; border: none;">Back</button>
              <button type="button" class="btn btn-primary" id="btn-recovery-verify" style="border-radius: 12px; padding: 12px 24px; font-weight: 700; background: linear-gradient(135deg, #4f46e5, #7c3aed); border: none; box-shadow: 0 4px 14px 0 rgba(99, 102, 241, 0.39); color: white; display: flex; align-items: center; justify-content: center; min-width: 130px;">
                <span class="btn-text">Reset Password</span>
                <svg class="spinner-icon" style="display:none; animation:spin 1s linear infinite; margin-left:8px;" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }
    backdrop.innerHTML = html;
    attachListeners();
  };

  const attachListeners = () => {
    if (step === 1) {
      backdrop.querySelector('#btn-recovery-cancel').addEventListener('click', () => backdrop.remove());
      backdrop.querySelector('#btn-recovery-send').addEventListener('click', async () => {
        const identifier = backdrop.querySelector('#recovery-input').value.trim();
        if (!identifier) {
          showToast('Please enter your Username or Email.', 'error');
          return;
        }
        const sendBtn = document.getElementById('btn-recovery-send');
        const btnText = sendBtn.querySelector('.btn-text');
        const spinner = sendBtn.querySelector('.spinner-icon');
        
        sendBtn.disabled = true;
        sendBtn.style.opacity = '0.8';
        btnText.textContent = 'Sending...';
        spinner.style.display = 'block';

        try {
          const res = await postJson('/api/forgot-password', { usernameOrEmail: identifier });
          userId = res.userId;
          const emailParts = res.email.split('@');
          maskedEmail = emailParts[0].slice(0, 3) + '•••@' + emailParts[1];
          showToast('OTP code sent successfully to your registered email.', 'success');
          step = 2;
          renderStep();
        } catch (err) {
          showToast(err.message || 'Account lookup failed.', 'error');
          sendBtn.disabled = false;
          sendBtn.style.opacity = '1';
          btnText.textContent = 'Send OTP';
          spinner.style.display = 'none';
        }
      });
    } else if (step === 2) {
      backdrop.querySelectorAll('.toggle-rec-pwd').forEach(btn => {
        btn.addEventListener('click', function() {
          const input = document.getElementById(this.dataset.target);
          const isPassword = input.type === 'password';
          input.type = isPassword ? 'text' : 'password';
          this.innerHTML = isPassword 
            ? '<svg class="eye-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
            : '<svg class="eye-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
        });
      });
      backdrop.querySelector('#btn-recovery-back').addEventListener('click', () => {
        step = 1;
        renderStep();
      });
      backdrop.querySelector('#btn-recovery-verify').addEventListener('click', async () => {
        const otp = backdrop.querySelector('#recovery-otp').value.trim();
        const newPassword = backdrop.querySelector('#recovery-pwd-new').value;
        const confirm = backdrop.querySelector('#recovery-pwd-confirm').value;

        if (!otp || !newPassword || !confirm) {
          showToast('All fields are required.', 'error');
          return;
        }
        if (newPassword !== confirm) {
          showToast('Passwords do not match.', 'error');
          return;
        }
        if (newPassword.length < 3) {
          showToast('Password must be at least 3 characters.', 'error');
          return;
        }

        const verifyBtn = document.getElementById('btn-recovery-verify');
        const btnText = verifyBtn.querySelector('.btn-text');
        const spinner = verifyBtn.querySelector('.spinner-icon');

        verifyBtn.disabled = true;
        verifyBtn.style.opacity = '0.8';
        btnText.textContent = 'Verifying...';
        spinner.style.display = 'block';

        try {
          await postJson('/api/reset-password', { userId, otp, newPassword });
          try {
            updateUser(userId, { password: newPassword, mustResetPassword: false });
          } catch(e) {}
          showToast('Password reset successfully! Please sign in.', 'success');
          backdrop.remove();
        } catch (err) {
          showToast(err.message || 'Verification or reset failed.', 'error');
          verifyBtn.disabled = false;
          verifyBtn.style.opacity = '1';
          btnText.textContent = 'Reset Password';
          spinner.style.display = 'none';
        }
      });
    }
  };

  document.body.appendChild(backdrop);
  renderStep();
}

export function openRequestNodalModal() {
  const depts = getDepartments();
  const deptOptionsHtml = depts.map(d => `<option value="${d.name}">${d.name} (${d.code})</option>`).join('');

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom visible';
  backdrop.style.zIndex = '10005';
  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width: 550px; text-align: left;">
      <h3 class="modal-title-custom">Request State Nodal Account</h3>
      <p class="modal-msg-custom">Request official credentials to access the SRF Portal. Your temporary password will be sent to your official email.</p>
      <form id="public-register-form" autocomplete="off">
        <select id="pub-state" required class="form-select" style="display:none;">
          <option value="Andhra Pradesh" selected>Andhra Pradesh</option>
        </select>
        <div class="form-group-row">
          <div class="form-group">
            <label for="pub-district">District *</label>
            <select id="pub-district" required class="form-select">
              <option value="" disabled selected>Select District</option>
            </select>
          </div>
          <div class="form-group">
            <label for="pub-org">Department / Organization *</label>
            <select id="pub-org" required class="form-select">
              <option value="" disabled selected>Select Department</option>
              ${deptOptionsHtml || '<option value="" disabled>No departments available.</option>'}
            </select>
          </div>
        </div>
        <div class="form-group-row">
          <div class="form-group">
            <label for="pub-name">Full Name *</label>
            <input type="text" id="pub-name" required placeholder="e.g. Ramesh Kumar">
          </div>
          <div class="form-group">
            <label for="pub-email">Official Email *</label>
            <input type="email" id="pub-email" required placeholder="name@state.gov.in">
          </div>
        </div>
        <div class="form-group">
          <label for="pub-username">Desired Username *</label>
          <input type="text" id="pub-username" required placeholder="e.g. ap_ramesh" autocomplete="off" readonly onfocus="this.removeAttribute('readonly');">
        </div>
        <div class="modal-actions-custom" style="margin-top: 24px;">
          <button type="button" class="btn btn-secondary" id="btn-pub-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary">Submit Request</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(backdrop);
  
  const form = backdrop.querySelector('#public-register-form');
  const cancelBtn = backdrop.querySelector('#btn-pub-cancel');
  const districtSelect = backdrop.querySelector('#pub-district');
  const usernameInput = backdrop.querySelector('#pub-username');

  // Strip spaces dynamically
  usernameInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\s+/g, '');
  });

  // Populate districts
  const districts = statesDistrictsData["Andhra Pradesh"] || [];
  districts.forEach(dist => {
    const opt = document.createElement('option');
    opt.value = dist;
    opt.textContent = dist;
    districtSelect.appendChild(opt);
  });

  const close = () => {
    backdrop.remove();
  };

  cancelBtn.addEventListener('click', close);
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = usernameInput.value.replace(/\s+/g, '').toLowerCase();
    const name = backdrop.querySelector('#pub-name').value.trim();
    const email = backdrop.querySelector('#pub-email').value.trim();
    const organization = backdrop.querySelector('#pub-org').value;
    const state = 'Andhra Pradesh';
    const district = districtSelect.value;

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
      const res = await postJson('/api/register-public', {
        username, name, email, organization, state, district
      });

      if (res.success && res.user) {
        if (!_db.users) _db.users = [];
        _db.users.push(res.user);
        try { localStorage.setItem(DB_KEY, JSON.stringify(_db)); } catch(e) {}
      }

      showToast('Registration request successful! Your welcome credentials have been emailed to you.', 'success');
      close();
    } catch (err) {
      showToast(err.message || 'Self-registration failed.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Request';
    }
  });
}

export function openChangePasswordModal() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  const fullUserObj = getUserById(currentUser.id);
  if (!fullUserObj) return;

  let step = 1;
  let generatedOtp = '';
  let otpGeneratedAt = 0;
  let otpCooldown = 0;
  let otpTimerInterval = null;
  
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom visible';
  backdrop.style.zIndex = '10000';
  
  const renderStepContent = () => {
    let content = '';
    if (step === 1) {
      content = `
        <h3 class="modal-title-custom" style="margin-bottom:15px; font-family:var(--font-title); font-weight:700;">Change Password (Step 1 of 3)</h3>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 15px;">Verify your identity to proceed. We will send an OTP to your email: <strong>${fullUserObj.email}</strong></p>
        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button class="btn btn-secondary" id="btn-cancel-change-pwd">Cancel</button>
          <button class="btn btn-primary" id="btn-send-otp">Send OTP</button>
        </div>
      `;
    } else if (step === 2) {
      content = `
        <h3 class="modal-title-custom" style="margin-bottom:15px; font-family:var(--font-title); font-weight:700;">Verify OTP (Step 2 of 3)</h3>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 15px;">A 6-digit OTP code has been sent to <strong>${fullUserObj.email}</strong>. Please check your inbox (and toast notifications) and enter it below.</p>
        <div class="form-group" style="margin-bottom:20px;">
          <label style="display:block; font-weight:600; margin-bottom:6px; font-size:13px; color:var(--text-main);">OTP Verification Code *</label>
          <input type="text" id="change-pwd-otp" class="form-input" placeholder="e.g. 123456" style="width:100%; letter-spacing: 4px; text-align: center; font-size: 18px; font-weight: bold;" maxlength="6" required>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <button class="btn btn-link" id="btn-resend-otp" style="font-size: 12px; color: var(--primary); background:none; border:none; padding:0; cursor:pointer;" ${otpCooldown > 0 ? 'disabled' : ''}>${otpCooldown > 0 ? 'Resend OTP (' + otpCooldown + 's)' : 'Resend OTP'}</button>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-secondary" id="btn-back-step-1">Back</button>
            <button class="btn btn-primary" id="btn-verify-otp">Verify OTP</button>
          </div>
        </div>
      `;
    } else if (step === 3) {
      content = `
        <h3 class="modal-title-custom" style="margin-bottom:15px; font-family:var(--font-title); font-weight:700;">Set New Password (Step 3 of 3)</h3>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 15px;">Your email has been verified. Enter your new password details below.</p>
        <div class="form-group" style="margin-bottom:12px;">
          <label style="display:block; font-weight:600; margin-bottom:6px; font-size:13px; color:var(--text-main);">New Password *</label>
          <input type="password" id="change-pwd-new" class="form-input" placeholder="••••••••" style="width:100%;" required>
        </div>
        <div class="form-group" style="margin-bottom:20px;">
          <label style="display:block; font-weight:600; margin-bottom:6px; font-size:13px; color:var(--text-main);">Confirm New Password *</label>
          <input type="password" id="change-pwd-confirm" class="form-input" placeholder="••••••••" style="width:100%;" required>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button class="btn btn-secondary" id="btn-cancel-change-pwd">Cancel</button>
          <button class="btn btn-primary" id="btn-submit-change-pwd">Change Password</button>
        </div>
      `;
    }
    
    backdrop.querySelector('.modal-card-custom').innerHTML = content;
    attachStepListeners();
  };

  backdrop.innerHTML = `<div class="modal-card-custom animate-modal-in" style="max-width:400px; text-align:left;"></div>`;
  document.body.appendChild(backdrop);
  renderStepContent();

  function startCooldownTimer() {
    otpCooldown = 30;
    clearInterval(otpTimerInterval);
    otpTimerInterval = setInterval(() => {
      otpCooldown--;
      const resendBtn = document.getElementById('btn-resend-otp');
      const sendBtn = document.getElementById('btn-send-otp');
      if (resendBtn) {
        if (otpCooldown > 0) {
          resendBtn.disabled = true;
          resendBtn.textContent = 'Resend OTP (' + otpCooldown + 's)';
        } else {
          resendBtn.disabled = false;
          resendBtn.textContent = 'Resend OTP';
        }
      }
      if (sendBtn && step === 1) {
        if (otpCooldown > 0) {
          sendBtn.disabled = true;
          sendBtn.textContent = 'Send OTP (' + otpCooldown + 's)';
        } else {
          sendBtn.disabled = false;
          sendBtn.textContent = 'Send OTP';
        }
      }
      if (otpCooldown <= 0) clearInterval(otpTimerInterval);
    }, 1000);
  }

  function attachStepListeners() {
    if (step === 1) {
      document.getElementById('btn-cancel-change-pwd').addEventListener('click', () => backdrop.remove());
      document.getElementById('btn-send-otp').addEventListener('click', () => {
        if (otpCooldown > 0) return;
        // Generate OTP
        generatedOtp = String(Math.floor(100000 + Math.random() * 900000));
        otpGeneratedAt = Date.now();
        startCooldownTimer();
        const btn = document.getElementById('btn-send-otp');
        if (btn) btn.disabled = true;
        
        sendPasswordOtp(fullUserObj.email, generatedOtp, 'Password Change Request', fullUserObj.id)
        .then(() => {
          showToast(`OTP Code sent to ${fullUserObj.email}!`, 'success');
          step = 2;
          renderStepContent();
        })
        .catch(err => {
          console.error('Failed to send OTP email:', err);
          showToast(`Failed to send OTP: ${err.message}`, 'error');
        });
      });
    } else if (step === 2) {
      document.getElementById('btn-back-step-1').addEventListener('click', () => {
        step = 1;
        renderStepContent();
      });
      document.getElementById('btn-resend-otp').addEventListener('click', () => {
        if (otpCooldown > 0) return;
        generatedOtp = String(Math.floor(100000 + Math.random() * 900000));
        otpGeneratedAt = Date.now();
        startCooldownTimer();
        
        sendPasswordOtp(fullUserObj.email, generatedOtp, 'Password Change Request (Resend)', fullUserObj.id)
        .then(() => {
          showToast(`OTP code resent to ${fullUserObj.email}`, 'success');
        })
        .catch(err => {
          console.error('Failed to resend OTP email:', err);
          showToast(`Failed to resend OTP: ${err.message}`, 'error');
        });
      });
      document.getElementById('btn-verify-otp').addEventListener('click', () => {
        const inputOtp = document.getElementById('change-pwd-otp').value.replace(/\s+/g, '');
        if (!inputOtp) {
          showToast('Please enter the OTP code.', 'error');
          return;
        }
        if (Date.now() - otpGeneratedAt > 300000) {
          showToast('OTP Expired. Please resend the OTP.', 'error');
          return;
        }
        if (inputOtp !== generatedOtp) {
          showToast('Invalid OTP code. Please try again.', 'error');
          return;
        }
        showToast('OTP verified successfully!', 'success');
        step = 3;
        renderStepContent();
      });
    } else if (step === 3) {
      document.getElementById('btn-cancel-change-pwd').addEventListener('click', () => backdrop.remove());
      document.getElementById('btn-submit-change-pwd').addEventListener('click', async () => {
        const newPwd = document.getElementById('change-pwd-new').value;
        const confirmPwd = document.getElementById('change-pwd-confirm').value;

        if (!newPwd || !confirmPwd) {
          showToast('All fields are required.', 'error');
          return;
        }
        if (newPwd !== confirmPwd) {
          showToast('New passwords do not match.', 'error');
          return;
        }
        if (newPwd.length < 3) {
          showToast('Password must be at least 3 characters long.', 'error');
          return;
        }

        const submitBtn = document.getElementById('btn-submit-change-pwd');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Updating...';

        try {
          await postJson('/api/change-password', { userId: currentUser.id, newPassword: newPwd });
          updateUser(currentUser.id, { password: newPwd });
          currentUser.password = newPwd;
          sessionStorage.setItem('srf_current_user', JSON.stringify(currentUser));
          addAuditLog(currentUser.id, 'Changed password via email OTP authentication', 'auth', currentUser.id);
          showToast('Password changed successfully!', 'success');
          backdrop.remove();
        } catch(err) {
          showToast(err.message || 'Failed to update password.', 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Change Password';
        }
      });
    }
  }
}

