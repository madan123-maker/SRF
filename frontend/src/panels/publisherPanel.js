import { getEditions, getUsers, getReformAreas, getDb, forceSave, getAllAssignments, getEditionById, removeAssignment, addAuditLog, updateAssignment, addReassignmentHistory, getUserById, createApplication, addNotification } from '../db/store.js';
import { showToast } from '../ui/toastManager.js';
import { isAssignmentValid } from '../panels/userPanel.js';
import { showConfirm } from '../ui/confirmDialog.js';
import { getCurrentUser } from '../auth/auth.js';

export function renderPublisherPanel(container) {
  if (!container) return;
  const editions = getEditions();
  const allUsers = getUsers().filter(u => u.role === 'user');

  container.innerHTML = `
    <div class="section-card" style="margin-bottom:24px;">
      <div class="section-badge admin-badge">Publish Wizard</div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;">
        <div>
          <h1>Content Creator &amp; Publisher</h1>
          <p style="color:var(--text-muted);font-size:14px;">Create and instantly publish a Reform Area, Action Point, or Question to a specific user.</p>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start;">

      <!-- LEFT: Create Form -->
      <div class="card glass-card">
        <div class="card-header" style="padding:14px 20px;">
          <h2 style="font-family:var(--font-title);font-size:15px;font-weight:700;margin:0;">Create &amp; Publish</h2>
        </div>
        <div class="card-body" style="padding:20px;">

          <div class="form-group" style="margin-bottom:16px;">
            <label>Target Edition</label>
            <select id="pub-edition-select" class="form-input" style="height:40px;">
              <option value="">— Select Edition —</option>
              ${editions.map(e => `<option value="${e.id}">${e.name}${e.status==='published'?' (Live)':' (Draft)'}</option>`).join('')}
            </select>
          </div>

          <div class="form-group" style="margin-bottom:16px;">
            <label>Entity Type</label>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;" id="pub-type-pills">
              <button type="button" class="pub-type-pill btn btn-outline btn-sm active" data-type="reform_area" style="border-radius:8px;font-size:12px;padding:8px 4px;">Reform Area</button>
              <button type="button" class="pub-type-pill btn btn-outline btn-sm" data-type="action_point" style="border-radius:8px;font-size:12px;padding:8px 4px;">Action Point</button>
              <button type="button" class="pub-type-pill btn btn-outline btn-sm" data-type="question" style="border-radius:8px;font-size:12px;padding:8px 4px;">Question</button>
            </div>
          </div>

          <!-- Reform Area Fields -->
          <div id="pub-fields-reform_area">
            <div class="form-group" style="margin-bottom:14px;">
              <label>Reform Area Title <span class="required-star">*</span></label>
              <input type="text" id="pub-ra-title" class="form-input" placeholder="e.g. Innovation &amp; Incubation Support">
            </div>
            <div class="form-group" style="margin-bottom:14px;">
              <label>Description</label>
              <textarea id="pub-ra-desc" class="form-input" rows="2" placeholder="Brief description of this reform area..."></textarea>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
              <div class="form-group">
                <label>Total Marks</label>
                <input type="number" id="pub-ra-marks" class="form-input" value="10" min="1">
              </div>
              <div class="form-group">
                <label>Due Date</label>
                <input type="date" id="pub-ra-due" class="form-input" value="2026-12-31" style="height:40px;font-size:13px;">
              </div>
            </div>
          </div>

          <!-- Action Point Fields -->
          <div id="pub-fields-action_point" class="hidden">
            <div class="form-group" style="margin-bottom:14px;">
              <label>Select Reform Area <span class="required-star">*</span></label>
              <select id="pub-ap-reform-area" class="form-input" style="height:40px;">
                <option value="">— Select after choosing Edition —</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom:14px;">
              <label>Action Point Title <span class="required-star">*</span></label>
              <input type="text" id="pub-ap-title" class="form-input" placeholder="e.g. Policy &amp; Regulatory Actions">
            </div>
          </div>

          <!-- Question Fields -->
          <div id="pub-fields-question" class="hidden">
            <div class="form-group" style="margin-bottom:14px;">
              <label>Select Reform Area <span class="required-star">*</span></label>
              <select id="pub-q-reform-area" class="form-input" style="height:40px;">
                <option value="">— Select after choosing Edition —</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom:14px;">
              <label>Question Text <span class="required-star">*</span></label>
              <textarea id="pub-q-text" class="form-input" rows="2" placeholder="e.g. Does the state provide financial support to incubators?"></textarea>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
              <div class="form-group">
                <label>Field Type</label>
                <select id="pub-q-type" class="form-input" style="height:40px;font-size:13px;">
                  <option value="radio">Yes/No Radio</option>
                  <option value="textbox">Short Text</option>
                  <option value="textarea">Long Text</option>
                  <option value="dropdown">Dropdown</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="file">File Upload</option>
                </select>
              </div>
              <div class="form-group">
                <label>Marks</label>
                <input type="number" id="pub-q-marks" class="form-input" value="1" min="1">
              </div>
            </div>
            <div class="form-group" style="margin-bottom:14px;">
              <label>Options (comma-separated, for Dropdown/Radio)</label>
              <input type="text" id="pub-q-options" class="form-input" placeholder="e.g. Yes, No, Partially">
            </div>
          </div>

          <!-- Assign To User (Dropdown Button) -->
          <div class="form-group" style="margin-bottom:20px;">
            <label>Publish to Specific User</label>
            <div style="position:relative;" id="pub-user-dropdown-wrap">
              <button type="button" id="pub-user-dropdown-btn" class="form-input" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;text-align:left;height:40px;">
                <span id="pub-user-selected-label">All Users (Default)</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div id="pub-user-dropdown-menu" class="hidden" style="position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--bg-card);border:1px solid var(--border-color);border-radius:8px;box-shadow:var(--shadow-lg);z-index:200;max-height:200px;overflow-y:auto;">
                <div class="pub-user-option" data-username="" style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border-color);color:var(--text-muted);">All Users (Default)</div>
                ${allUsers.map(u => `<div class="pub-user-option" data-username="${u.username}" style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border-color);">${u.name || u.username} <span style="font-size:11px;color:var(--text-muted);">(${u.organization || u.username})</span></div>`).join('')}
              </div>
            </div>
            <input type="hidden" id="pub-user-value" value="">
          </div>

          <div style="display:flex;gap:10px;">
            <button type="button" id="pub-create-submit" class="btn btn-primary btn-lg" style="flex:1;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="22 2 15 22 11 13 2 9 22 2"/></svg>
              Publish Now
            </button>
          </div>
          <div id="pub-result-msg" style="margin-top:14px;display:none;"></div>
        </div>
      </div>

      <!-- RIGHT: Preview & Recent -->
      <div>
        <div class="card glass-card" style="margin-bottom:16px;">
          <div class="card-header" style="padding:14px 20px;">
            <h2 style="font-family:var(--font-title);font-size:15px;font-weight:700;margin:0;">How it works</h2>
          </div>
          <div class="card-body" style="padding:20px;">
            <div style="display:flex;flex-direction:column;gap:14px;">
              <div style="display:flex;gap:12px;align-items:flex-start;">
                <div style="width:28px;height:28px;border-radius:50%;background:var(--primary-glow);border:1px solid rgba(79,70,229,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:800;color:var(--accent-indigo);">1</div>
                <div><strong style="font-size:13px;display:block;margin-bottom:3px;">Choose an Edition</strong><span style="font-size:12px;color:var(--text-muted);">Select which SRF edition this item belongs to.</span></div>
              </div>
              <div style="display:flex;gap:12px;align-items:flex-start;">
                <div style="width:28px;height:28px;border-radius:50%;background:var(--primary-glow);border:1px solid rgba(79,70,229,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:800;color:var(--accent-indigo);">2</div>
                <div><strong style="font-size:13px;display:block;margin-bottom:3px;">Select Entity Type</strong><span style="font-size:12px;color:var(--text-muted);">Pick Reform Area, Action Point, or Question.</span></div>
              </div>
              <div style="display:flex;gap:12px;align-items:flex-start;">
                <div style="width:28px;height:28px;border-radius:50%;background:var(--primary-glow);border:1px solid rgba(79,70,229,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:800;color:var(--accent-indigo);">3</div>
                <div><strong style="font-size:13px;display:block;margin-bottom:3px;">Fill in Details</strong><span style="font-size:12px;color:var(--text-muted);">Enter the title, description, and any options needed.</span></div>
              </div>
              <div style="display:flex;gap:12px;align-items:flex-start;">
                <div style="width:28px;height:28px;border-radius:50%;background:var(--primary-glow);border:1px solid rgba(79,70,229,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:800;color:var(--accent-indigo);">4</div>
                <div><strong style="font-size:13px;display:block;margin-bottom:3px;">Select Target User</strong><span style="font-size:12px;color:var(--text-muted);">Assign the item to a specific Nodal User, or leave as All Users.</span></div>
              </div>
              <div style="display:flex;gap:12px;align-items:flex-start;">
                <div style="width:28px;height:28px;border-radius:50%;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:800;color:var(--success);">✓</div>
                <div><strong style="font-size:13px;display:block;margin-bottom:3px;">Publish Now</strong><span style="font-size:12px;color:var(--text-muted);">It is instantly saved and visible in the Schema Editor and User Portal.</span></div>
              </div>
            </div>
          </div>
        </div>

        <div class="card glass-card" id="pub-reform-areas-summary">
          <div class="card-header" style="padding:14px 20px;">
            <h2 style="font-family:var(--font-title);font-size:15px;font-weight:700;margin:0;">Published Reform Areas</h2>
          </div>
          <div class="card-body p-0" style="max-height:300px;overflow-y:auto;padding:12px;">
            <p style="color:var(--text-muted);font-size:13px;">Select an edition to preview its reform areas.</p>
          </div>
        </div>
      </div>
    </div>
  `;

  // ── Entity type pill selection ──
  let activeType = 'reform_area';
  container.querySelectorAll('.pub-type-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      activeType = pill.dataset.type;
      container.querySelectorAll('.pub-type-pill').forEach(p => {
        p.classList.toggle('active', p === pill);
        p.style.background = p === pill ? 'var(--primary-glow)' : '';
        p.style.borderColor = p === pill ? 'var(--accent-indigo)' : '';
        p.style.color = p === pill ? 'var(--accent-indigo)' : '';
      });
      ['reform_area','action_point','question'].forEach(t => {
        const el = container.querySelector(`#pub-fields-${t}`);
        if (el) el.classList.toggle('hidden', t !== activeType);
      });
    });
  });
  // Initialise first pill styling
  const firstPill = container.querySelector('.pub-type-pill[data-type="reform_area"]');
  if (firstPill) { firstPill.style.background='var(--primary-glow)'; firstPill.style.borderColor='var(--accent-indigo)'; firstPill.style.color='var(--accent-indigo)'; }

  // ── User dropdown toggle ──
  const userDropBtn = container.querySelector('#pub-user-dropdown-btn');
  const userDropMenu = container.querySelector('#pub-user-dropdown-menu');
  const userSelectedLabel = container.querySelector('#pub-user-selected-label');
  const userValueInput = container.querySelector('#pub-user-value');

  userDropBtn?.addEventListener('click', () => userDropMenu?.classList.toggle('hidden'));
  document.addEventListener('click', (e) => {
    if (!container.querySelector('#pub-user-dropdown-wrap')?.contains(e.target)) userDropMenu?.classList.add('hidden');
  }, { once: false });
  container.querySelectorAll('.pub-user-option').forEach(opt => {
    opt.addEventListener('click', () => {
      userValueInput.value = opt.dataset.username;
      userSelectedLabel.textContent = opt.textContent.trim();
      userDropMenu.classList.add('hidden');
      // Highlight selected
      container.querySelectorAll('.pub-user-option').forEach(o => o.style.background = '');
      opt.style.background = 'var(--primary-glow)';
    });
    opt.addEventListener('mouseenter', () => { if(opt.style.background !== 'var(--primary-glow)') opt.style.background = 'var(--bg-deep)'; });
    opt.addEventListener('mouseleave', () => { if(opt.style.background !== 'var(--primary-glow)') opt.style.background = ''; });
  });

  // ── Populate reform area dropdowns when edition changes ──
  const editionSelect = container.querySelector('#pub-edition-select');
  function refreshReformAreaDropdowns(editionId) {
    const ras = editionId ? getReformAreas(editionId) : [];
    const opts = `<option value="">— Select Reform Area —</option>` + ras.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    ['pub-ap-reform-area','pub-q-reform-area'].forEach(id => {
      const sel = container.querySelector(`#${id}`);
      if (sel) sel.innerHTML = opts;
    });
    // Update reform areas summary
    const summaryBody = container.querySelector('#pub-reform-areas-summary .card-body');
    if (summaryBody) {
      if (!editionId) { summaryBody.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:8px 0;">Select an edition to preview its reform areas.</p>'; return; }
      if (ras.length === 0) { summaryBody.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:8px 0;">No reform areas yet for this edition.</p>'; return; }
      summaryBody.innerHTML = ras.map(r => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-color);">
          <div>
            <span style="font-size:13px;font-weight:600;color:var(--text-main);">${r.name}</span>
            ${r.description ? `<br><span style="font-size:11px;color:var(--text-muted);">${r.description}</span>` : ''}
          </div>
          <span style="font-size:11px;font-weight:700;color:var(--accent-indigo);white-space:nowrap;">${r.marks || 10} M</span>
        </div>
      `).join('');
    }
  }
  editionSelect?.addEventListener('change', () => refreshReformAreaDropdowns(editionSelect.value));

  // ── Submit handler ──
  container.querySelector('#pub-create-submit')?.addEventListener('click', () => {
    const editionId = editionSelect?.value;
    const targetUser = userValueInput?.value;
    const resultMsg = container.querySelector('#pub-result-msg');

    if (!editionId) {
      showToast('Please select an edition first.', 'error');
      return;
    }

    const db = getDb();
    if (!db) return;

    const userAssignment = targetUser ? { type: 'custom', users: [targetUser], category: '', sector: '', district: '', startups: [] } : { type: 'all', users: [], category: '', sector: '', district: '', startups: [] };

    try {
      if (activeType === 'reform_area') {
        const title = container.querySelector('#pub-ra-title')?.value.trim();
        const desc = container.querySelector('#pub-ra-desc')?.value.trim();
        const marks = parseInt(container.querySelector('#pub-ra-marks')?.value) || 10;
        const due = container.querySelector('#pub-ra-due')?.value || '2026-12-31';
        if (!title) { showToast('Reform Area title is required.', 'error'); return; }
        const existingRAs = getReformAreas(editionId);
        const newRA = {
          id: 'ra_' + Date.now() + '_' + Math.random().toString(36).substr(2,5),
          editionId, name: title, description: desc || '',
          orderIndex: existingRAs.length,
          marks, dueDate: due,
          assignment: userAssignment
        };
        db.reformAreas = db.reformAreas || [];
        db.reformAreas.push(newRA);
        // Auto-create default action point + question
        const apId = 'ap_' + newRA.id + '_1';
        const qId = 'field_' + Date.now() + '_' + Math.random().toString(36).substr(2,5);
        db.formFields = db.formFields || [];
        db.formFields.push({
          id: qId, editionId, reformAreaId: newRA.id,
          actionPointId: apId, actionPointTitle: 'Action Point 1',
          fieldType: 'radio', label: `Does the state meet the reform metric for ${title}?`,
          text: `Does the state meet the reform metric for ${title}?`,
          placeholder: 'Select Yes or No',
          required: true, mandatory: true, weight: marks, maxScore: marks,
          uploadRequirement: 'optional', options: ['Yes','No'],
          helpText: '', url: '', content: '', orderIndex: 0,
          isLayoutElement: false, isUploadElement: false,
          assignment: userAssignment,
          docs: [{ id: 'doc_' + Date.now(), name: 'Supporting proof document' }],
          elements: [], createdAt: new Date().toISOString()
        });
        forceSave();
        resultMsg.style.display = 'block';
        resultMsg.innerHTML = `<div class="alert-box alert-success" style="padding:10px 14px;border-radius:8px;"><strong>✓ Reform Area "${title}" published!</strong> A default Action Point and Question have been auto-created.</div>`;
        showToast(`Reform Area "${title}" published successfully!`, 'success');
        container.querySelector('#pub-ra-title').value = '';
        container.querySelector('#pub-ra-desc').value = '';
        refreshReformAreaDropdowns(editionId);

      } else if (activeType === 'action_point') {
        const raId = container.querySelector('#pub-ap-reform-area')?.value;
        const apTitle = container.querySelector('#pub-ap-title')?.value.trim();
        if (!raId) { showToast('Please select a Reform Area.', 'error'); return; }
        if (!apTitle) { showToast('Action Point title is required.', 'error'); return; }
        const existingForRA = (db.formFields || []).filter(f => f.reformAreaId === raId);
        const apId = 'ap_' + raId + '_' + Date.now();
        const qId = 'field_' + Date.now() + '_' + Math.random().toString(36).substr(2,5);
        db.formFields = db.formFields || [];
        db.formFields.push({
          id: qId, editionId, reformAreaId: raId,
          actionPointId: apId, actionPointTitle: apTitle,
          fieldType: 'radio', label: `${apTitle}: Does the state meet this criterion?`,
          text: `${apTitle}: Does the state meet this criterion?`,
          placeholder: 'Select Yes or No',
          required: true, mandatory: true, weight: 1, maxScore: 1,
          uploadRequirement: 'optional', options: ['Yes','No'],
          helpText: '', url: '', content: '',
          orderIndex: existingForRA.length,
          isLayoutElement: false, isUploadElement: false,
          assignment: userAssignment, docs: [], elements: [],
          createdAt: new Date().toISOString()
        });
        forceSave();
        resultMsg.style.display = 'block';
        resultMsg.innerHTML = `<div class="alert-box alert-success" style="padding:10px 14px;border-radius:8px;"><strong>✓ Action Point "${apTitle}" published!</strong> A default Question has been auto-created under it.</div>`;
        showToast(`Action Point "${apTitle}" published!`, 'success');
        container.querySelector('#pub-ap-title').value = '';

      } else if (activeType === 'question') {
        const raId = container.querySelector('#pub-q-reform-area')?.value;
        const qText = container.querySelector('#pub-q-text')?.value.trim();
        const qType = container.querySelector('#pub-q-type')?.value || 'radio';
        const qMarks = parseInt(container.querySelector('#pub-q-marks')?.value) || 1;
        const qOpts = container.querySelector('#pub-q-options')?.value.trim().split(',').map(s=>s.trim()).filter(Boolean);
        if (!raId) { showToast('Please select a Reform Area.', 'error'); return; }
        if (!qText) { showToast('Question text is required.', 'error'); return; }
        const existingForRA = (db.formFields || []).filter(f => f.reformAreaId === raId);
        // Use first available action point id or auto-create
        const firstAP = existingForRA.find(f => f.actionPointId);
        const apId = firstAP?.actionPointId || ('ap_' + raId + '_1');
        const apTitle = firstAP?.actionPointTitle || 'Action Point 1';
        const qId = 'field_' + Date.now() + '_' + Math.random().toString(36).substr(2,5);
        db.formFields = db.formFields || [];
        db.formFields.push({
          id: qId, editionId, reformAreaId: raId,
          actionPointId: apId, actionPointTitle: apTitle,
          fieldType: qType, label: qText, text: qText,
          placeholder: 'Enter your response...',
          required: true, mandatory: true, weight: qMarks, maxScore: qMarks,
          uploadRequirement: 'optional', options: qOpts || [],
          helpText: '', url: '', content: '',
          orderIndex: existingForRA.length,
          isLayoutElement: false, isUploadElement: ['file','pdf','imageupload'].includes(qType),
          assignment: userAssignment, docs: [], elements: [],
          createdAt: new Date().toISOString()
        });
        forceSave();
        resultMsg.style.display = 'block';
        resultMsg.innerHTML = `<div class="alert-box alert-success" style="padding:10px 14px;border-radius:8px;"><strong>✓ Question published!</strong> "${qText.substring(0,60)}..."</div>`;
        showToast('Question published successfully!', 'success');
        container.querySelector('#pub-q-text').value = '';
        container.querySelector('#pub-q-options').value = '';
      }
    } catch(err) {
      showToast('Error publishing: ' + err.message, 'error');
      console.error(err);
    }
  });
}

export function renderAssignedDetailsPanel(container) {
  const allUsers = getUsers();
  const userIdSet = new Set(allUsers.map(u => u.id));
  const assignments = getAllAssignments().filter(a => {
    if (!a) return false;
    if (!a.userId) return false;
    const user = allUsers.find(u => u.id === a.userId);
    if (!user || user.active === false || user.status === 'deleted') return false;
    if (typeof isAssignmentValid === 'function' && !isAssignmentValid(a)) return false;
    if (a.status === 'deleted' || a.deleted === true) return false;
    // Filter out system-published whole-document assignments (auto-assigned when super admin publishes)
    if (!a.assignedBy || a.assignedBy === 'system' || a.assignedBy === 'System') return false;
    if (!userIdSet.has(a.assignedBy)) return false;
    return true;
  });
  
  // Sort assignments by date descending
  assignments.sort((a, b) => new Date(b.assignedAt || 0) - new Date(a.assignedAt || 0));

  // Render outer card skeleton
  container.innerHTML = `
    <div class="section-card">
      <div class="section-badge admin-badge">Super Admin View</div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <div>
          <h2 style="margin:0;">Reassign Tasks Dashboard</h2>
          <p style="color:var(--text-muted); font-size:14px; margin-top:4px;">
            History of all tasks (Reform Areas, Action Points, Questions) assigned to users.
          </p>
        </div>
        <button class="btn btn-outline btn-sm" id="btn-refresh-assignments" style="display: inline-flex !important; align-items: center !important; gap: 6px !important;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px !important; height:14px !important;"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Refresh
        </button>
      </div>

      <!-- Filter Bar -->
      <div style="display:flex; gap:12px; align-items:center; margin-bottom:16px; flex-wrap:wrap; background:rgba(15,23,42,0.01); padding:10px; border-radius:8px; border:1px solid var(--border-color);">
        <div style="flex:1; min-width:200px; position:relative;">
          <input type="text" id="reassign-search-input" placeholder="Search by User, Department or Task..." class="form-input" style="height:36px; padding-left:36px; font-size:12.5px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-main); width:100%;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2.5" style="position:absolute; left:12px; top:11px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <select id="reassign-filter-version" class="form-input form-select" style="width:180px; height:36px; font-size:12.5px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-card); color:var(--text-main);">
          <option value="">All SRF Versions</option>
          ${Array.from(new Set(assignments.map(a => {
            const ed = getEditionById(a.editionId);
            return ed ? ed.name : '';
          }).filter(Boolean))).map(ver => `<option value="${ver}">${ver}</option>`).join('')}
        </select>
      </div>

      <div id="assignments-table-container"></div>
    </div>
  `;

  const refreshBtn = container.querySelector('#btn-refresh-assignments');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => renderAssignedDetailsPanel(container));
  }

  const searchInput = container.querySelector('#reassign-search-input');
  const versionSelect = container.querySelector('#reassign-filter-version');
  const tableContainer = container.querySelector('#assignments-table-container');

  const updateView = () => {
    const searchText = searchInput.value;
    const filterVersion = versionSelect.value;

    let filtered = [...assignments];
    
    if (searchText) {
      const q = searchText.toLowerCase();
      filtered = filtered.filter(a => {
        const assignee = allUsers.find(u => u.id === a.userId);
        const assigneeName = assignee ? (assignee.name || assignee.username || '').toLowerCase() : '';
        const assigneeDept = assignee ? (assignee.organization || '').toLowerCase() : '';
        const respText = (a.responsibility || '').toLowerCase();
        return assigneeName.includes(q) || assigneeDept.includes(q) || respText.includes(q);
      });
    }

    if (filterVersion) {
      filtered = filtered.filter(a => {
        const ed = getEditionById(a.editionId);
        return ed && ed.name === filterVersion;
      });
    }

    if (filtered.length === 0) {
      tableContainer.innerHTML = `
        <div class="empty-state" style="padding:40px 20px;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon" style="margin-bottom:10px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <h3>No matching assignments</h3>
          <p>Try adjusting your search query or version filters.</p>
        </div>`;
      return;
    }

    const tableRows = filtered.map(a => {
      const assignee = allUsers.find(u => u.id === a.userId);
      const assigneeName = assignee ? (assignee.name || assignee.username) : 'Unknown User';
      const assigneeDept = assignee ? (assignee.organization || 'No Department') : 'No Department';
      
      const assigner = allUsers.find(u => u.id === a.assignedBy);
      const assignerName = assigner ? (assigner.name || assigner.username) : 'System';

      let assignmentType = a.type;
      if (!assignmentType) {
        if (a.questionId || a.fieldId) assignmentType = 'Question';
        else if (a.actionPointId) assignmentType = 'Action Point';
        else if (a.sectionId || a.reformAreaId) assignmentType = 'Reform Area';
        else assignmentType = 'Reform Area';
      }

      let typeColor = '#4338ca';
      let typeBg = '#e0e7ff';
      if (assignmentType === 'Action Point') { typeColor = '#059669'; typeBg = '#d1fae5'; }
      else if (assignmentType === 'Question') { typeColor = '#d97706'; typeBg = '#fef3c7'; }
      else if (assignmentType === 'Reform Area') { typeColor = '#4338ca'; typeBg = '#e0e7ff'; }

      let responsibilityText = a.responsibility;
      if (!responsibilityText || responsibilityText === 'undefined') {
        if (a.questionId || a.fieldId) responsibilityText = `Question: ${a.questionId || a.fieldId}`;
        else if (a.actionPointId) responsibilityText = `Action Point: ${a.actionPointId}`;
        else if (a.sectionId || a.reformAreaId) responsibilityText = `Reform Area: ${a.sectionId || a.reformAreaId}`;
        else responsibilityText = 'Assigned Task';
      }

      if (responsibilityText && typeof responsibilityText === 'string') {
        let cleanText = responsibilityText;
        if (cleanText.startsWith('RA:')) {
          cleanText = cleanText.replace('RA:', 'Reform Area:');
        } else if (cleanText.startsWith('AP:')) {
          cleanText = cleanText.replace('AP:', 'Action Point:');
        } else if (cleanText.startsWith('Q:')) {
          cleanText = cleanText.replace('Q:', 'Question:');
        }
        
        if (cleanText.includes(':')) {
          const parts = cleanText.split(':');
          const category = parts[0].trim();
          let value = parts.slice(1).join(':').trim();
          if (value) {
            value = value.charAt(0).toUpperCase() + value.slice(1);
          }
          responsibilityText = `${category}: ${value}`;
        } else {
          responsibilityText = cleanText;
        }
      }

      const edition = getEditionById(a.editionId);
      const editionName = edition ? (edition.name || 'SRF') : 'SRF';

      return `
        <tr data-id="${a.id}">
          <td>
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="width:24px; height:24px; border-radius:50%; background:var(--accent-indigo); color:#fff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:bold;">
                ${assigneeName.charAt(0).toUpperCase()}
              </div>
              <span style="font-weight:600; color:var(--text-main); font-size:14.5px;">${assigneeName}</span>
            </div>
          </td>
          <td style="font-weight: 500; color: var(--text-muted); font-size: 14px;">${assigneeDept}</td>
          <td>
            <span class="status-badge" style="background:${typeBg}; color:${typeColor}; border:none; padding:4px 10px; font-size:11px; font-weight:700;">
              ${editionName}
            </span>
          </td>
          <td style="font-weight: 500; color: var(--text-dark);">${responsibilityText}</td>
          <td style="color:var(--text-muted); font-size:12px;">
            ${new Date(a.assignedAt).toLocaleDateString()}
          </td>
          <td style="color:var(--text-muted); font-size:12px; font-weight: 600;">
            ${assignerName}
          </td>
          <td>
            <div class="action-btns">
              <button class="btn btn-action-text btn-reassign" data-id="${a.id}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 2.1l4 4-4 4"/><path d="M3 12.2v-2a4 4 0 0 1 4-4h14"/><path d="M7 21.9l-4-4 4-4"/><path d="M21 11.8v2a4 4 0 0 1-4 4H3"/></svg>
                Reassign
              </button>
              <button class="btn btn-action-text btn-unassign" data-id="${a.id}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="23" y2="14"/><line x1="23" y1="8" x2="17" y2="14"/></svg>
                Unassign
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tableContainer.innerHTML = `
      <div style="overflow-x:auto; margin-top:10px;">
        <table class="admin-dashboard-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Department</th>
              <th>SRF Version</th>
              <th>Assigned Reform Area</th>
              <th>Assigned Date</th>
              <th>Assigned By</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="assignments-table-body">
            ${tableRows}
          </tbody>
        </table>
      </div>
    `;

    // Rebind action buttons
    tableContainer.querySelectorAll('.btn-unassign').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.dataset.id;
        showConfirm({
          title: 'Unassign Task',
          message: 'Are you sure you want to unassign this task? The user will lose responsibility for it.',
          confirmText: 'Unassign',
          type: 'warning',
          onConfirm: () => {
            removeAssignment(id);
            addAuditLog(getCurrentUser().id, `Unassigned task ${id}`, 'user');
            showToast('Task unassigned successfully', 'success');
            renderAssignedDetailsPanel(container);
          }
        });
      });
    });

    tableContainer.querySelectorAll('.btn-reassign').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.dataset.id;
        openReassignModal(id, container);
      });
    });
  };

  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(updateView, 250);
  });

  versionSelect.addEventListener('change', updateView);

  // Initial draw
  updateView();
}

export function openReassignModal(assignmentId, container) {
  if (getCurrentUser().role !== 'superadmin') {
    showToast('Only Super Admin is authorized to reassign tasks.', 'error');
    return;
  }

  const assignment = getAllAssignments().find(a => a.id === assignmentId);
  if (!assignment) return;

  const allAssignments = getAllAssignments();
  const db = getDb ? getDb() : { applications: [] };
  const allApplications = db.applications || [];

  // Get active users with the 'user' role, excluding only the currently assigned user
  const users = getUsers().filter(u => 
    u.role === 'user' &&
    u.id !== assignment.userId &&
    u.active !== false
  );
  
  if (users.length === 0) {
    showToast('No other active users are available in the system.', 'warning');
    return;
  }

  const optionsHtml = users.map(u => 
    `<option value="${u.id}">${u.name || u.username} (${u.organization || 'No Department'})</option>`
  ).join('');

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop-custom visible';
  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width:500px; text-align:left;">
      <h3 class="modal-title-custom" style="margin-bottom:15px;">Reassign Task</h3>
      <p style="color:var(--text-muted); font-size:14px; margin-bottom:15px;">
        Select a new actively participating user to assign <strong>${assignment.responsibility}</strong> to.
      </p>
      <div class="form-group" style="margin-bottom:16px;">
        <label style="display:block; font-weight:600; margin-bottom:6px; font-size:13px; color:var(--text-main);">Select User</label>
        <select id="reassign-user-select" class="form-input form-select" style="width:100%; height:40px;">
          ${optionsHtml}
        </select>
      </div>
      <div class="form-group" style="margin-bottom:20px;">
        <label style="display:block; font-weight:600; margin-bottom:6px; font-size:13px; color:var(--text-main);">Reassignment Reason <span style="color:var(--ui-error); font-weight:bold;">*</span></label>
        <textarea id="reassign-reason-input" class="form-input" style="width:100%; height:80px; padding:8px 12px; border-radius:6px; resize:none;" placeholder="Enter reason for reassignment (required)..."></textarea>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:10px;">
        <button class="btn btn-secondary" id="btn-cancel-reassign">Cancel</button>
        <button class="btn btn-primary" id="btn-confirm-reassign">Reassign</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const closeModal = () => backdrop.remove();

  document.getElementById('btn-cancel-reassign').addEventListener('click', closeModal);

  document.getElementById('btn-confirm-reassign').addEventListener('click', () => {
    const newUserId = document.getElementById('reassign-user-select').value;
    if (newUserId === assignment.userId) {
      showToast('Task is already assigned to this user.', 'info');
      return;
    }

    const reason = document.getElementById('reassign-reason-input').value.trim();
    if (!reason) {
      showToast('Reassignment reason is required.', 'error');
      return;
    }

    const duplicate = allAssignments.find(a => 
      a.userId === newUserId && 
      a.editionId === assignment.editionId && 
      a.type === assignment.type &&
      a.sectionId === assignment.sectionId &&
      a.fieldId === assignment.fieldId &&
      a.actionPointId === assignment.actionPointId
    );
    if (duplicate) {
      showToast('This user is already assigned to this specific task.', 'error');
      return;
    }

    const oldUserId = assignment.userId;
    updateAssignment(assignmentId, newUserId, getCurrentUser().id);
    
    // Log reassignment history in database
    addReassignmentHistory(assignmentId, oldUserId, newUserId, getCurrentUser().id, reason);

    // Auto-create application for the new user if not already existing
    const existingApp = allApplications.find(app => app.editionId === assignment.editionId && app.userId === newUserId);
    if (!existingApp) {
      const newUser = getUserById(newUserId);
      createApplication(newUserId, assignment.editionId, newUser?.category || 'cat_a1', 'FY 2025-26');
    }
    
    // Notify the new and old users
    addNotification(newUserId, 'SECTION_ASSIGNED', `You have been reassigned a task: ${assignment.responsibility}`);
    addNotification(oldUserId, 'SECTION_UNASSIGNED', `You are no longer assigned to task: ${assignment.responsibility}`);
    addAuditLog(getCurrentUser().id, `Reassigned task ${assignmentId} from ${oldUserId} to ${newUserId}. Reason: ${reason}`, 'user', newUserId);
    
    showToast('Task reassigned successfully', 'success');
    closeModal();
    renderAssignedDetailsPanel(container);
  });
}

