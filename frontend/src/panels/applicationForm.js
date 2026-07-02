import { uiState } from '../../app.js';
import { getApplicationById, getLockStatus, releaseLock, acquireLock, getEditionById, isSectionAssignedToUser, getAnswersByApplication, isFieldAssignedToUser, getGuidelines, isQuestionFilled, calculateApplicationProgress, saveAnswerCompliance, submitQuestion, saveAnswer, forceSave, addToRecycleBin, updateApplication, addNotification, addAuditLog, submitReformArea, getAllAssignments, getFieldsByEdition, submitApplication } from '../db/store.js';
import { getCurrentUser } from '../auth/auth.js';
import { renderUserSidebar, switchUserTab, getGuidelinePageForQuestion } from '../panels/userPanel.js';
import { showConfirm, showAlert, showFileViewer } from '../ui/confirmDialog.js';
import { showToast } from '../ui/toastManager.js';
import { pushToNavHistory } from '../core/bootstrap.js';


export async function openApplicationForm(appId, container, allowRemainingUploads = null) {
  window.workspaceLock = true;
  uiState.activeApplicationId = appId;
  activeUserFormContainer = container;

  const app = getApplicationById(appId);
  if (!app) return;
  const user = getCurrentUser();

  // Clear existing heartbeat
  if (window.formLockHeartbeat) {
    clearInterval(window.formLockHeartbeat);
    window.formLockHeartbeat = null;
  }

  // Check Lock Status
  const lockStatus = await getLockStatus(appId);
  if (lockStatus.locked && lockStatus.userId !== user.id) {
    const lockUser = lockStatus.username || lockStatus.lockedBy;
    const expiryMin = lockStatus.durationRemaining !== undefined ? Math.ceil(lockStatus.durationRemaining / 60) : '?';
    container.innerHTML = `
      <div class="section-card" style="margin-bottom: 24px; text-align: center; padding: 40px 20px;">
        <div style="font-size: 48px; margin-bottom: 16px;">🔒</div>
        <h2 style="color: var(--danger);">Application is Locked for Editing</h2>
        <p style="font-size: 14px; color: var(--text-muted); max-width: 500px; margin: 8px auto 24px auto;">
          This application is currently locked by <strong>${lockUser}</strong> (Reason: ${lockStatus.reason || 'Editing'}).
          The lock will automatically expire in approximately <strong>${expiryMin} minutes</strong>.
        </p>
        <div style="display:flex; justify-content:center; gap:12px;">
          <button class="btn btn-secondary" id="btn-lock-back">Go Back</button>
          ${user.role === 'superadmin' ? `<button class="btn btn-danger" id="btn-lock-force-unlock">Force Unlock (Super Admin)</button>` : ''}
        </div>
      </div>
    `;
    container.querySelector('#btn-lock-back').addEventListener('click', () => {
      window.workspaceLock = false;
      uiState.activeUserTab = 'dashboard';
      const sb = document.getElementById('sidebar-nav-container');
      if (sb) sb.innerHTML = '';
      renderUserSidebar();
      switchUserTab('dashboard');
    });
    if (user.role === 'superadmin') {
      container.querySelector('#btn-lock-force-unlock').addEventListener('click', async () => {
        const confirmResult = await showConfirm({
          title: 'Force Unlock Application',
          message: 'Are you sure you want to release the edit lock? Unsaved modifications by the active editor will not be persisted.',
          confirmText: 'Release Lock',
          cancelText: 'Cancel'
        });
        if (confirmResult) {
          const unlockRes = await releaseLock(appId, true, 'Super Admin Force Override');
          if (unlockRes.success) {
            showToast('Lock overridden!', 'success');
            openApplicationForm(appId, container);
          } else {
            showAlert({ title: 'Override Failed', message: 'Failed to release lock.', type: 'error' });
          }
        }
      });
    }
    return;
  }

  // Not locked: Acquire Lock
  const acquireRes = await acquireLock(appId, 'Editing Application Form');
  if (!acquireRes.success) {
    showAlert({ title: 'Lock Acquisition Failed', message: acquireRes.error || 'Could not lock application.', type: 'error' });
    return;
  }

  // Start heartbeat renewal
  window.formLockHeartbeat = setInterval(async () => {
    await acquireLock(appId, 'Heartbeat renewal');
  }, 30000);

  if (allowRemainingUploads !== null) {
    uiState.currentFormAllowRemainingUploads = allowRemainingUploads;
  } else {
    if (app && app.status === 'Additional Documents Requested') {
      uiState.currentFormAllowRemainingUploads = true;
    } else {
      uiState.currentFormAllowRemainingUploads = false;
    }
  }
  pushToNavHistory({ role: 'user', tab: 'form', appId });
  uiState.activeUserTab = 'form';

  if (user.role === 'user' && app.userId !== user.id) {
    showAlert({ title: 'Access Denied', message: 'You are not authorized to view this application.', type: 'error' });
    uiState.activeUserTab = 'dashboard';
    renderUserSidebar();
    switchUserTab('dashboard');
    return;
  }
  const edition = getEditionById(app.editionId);
  if (!edition || edition.status !== 'published') {
    showAlert({
      title: 'Edition Unavailable',
      message: 'This edition is currently unavailable.',
      type: 'warning'
    });
    uiState.activeUserTab = 'dashboard';
    renderUserSidebar();
    switchUserTab('dashboard');
    return;
  }
  const allSections = getSectionsByEdition(app.editionId);
  const sections = allSections.filter(sec => isSectionAssignedToUser(sec, user));

  if (!activeSectionId || !sections.find(s => s.id === activeSectionId)) {
    // Try to restore last active section from sessionStorage (for drafts)
    let restoredSection = false;
    try {
      const posRaw = sessionStorage.getItem(`srf_draft_pos_${appId}`);
      if (posRaw) {
        const pos = JSON.parse(posRaw);
        if (pos && pos.sectionId && sections.find(s => s.id === pos.sectionId)) {
          activeSectionId = pos.sectionId;
          restoredSection = true;
        }
      }
    } catch(e) {}
    if (!restoredSection) activeSectionId = sections[0]?.id;
  }

  const answers = getAnswersByApplication(appId);
  const answersMap = {};
  answers.forEach(a => { answersMap[a.fieldId] = a; });

  const isAppDraft = app.status === 'Draft';
  const hasResubmissionRequests = answers.some(ans => ans.questionStatus === 'Rejected' || ans.questionStatus === 'Additional Documents Requested' || ans.questionStatus === 'Docs Requested');
  const isFrozen = !isAppDraft && !hasResubmissionRequests;

  // Sidebar section nav (integrated with main nav bar via renderUserSidebar)
  renderUserSidebar();

  const activeSection = sections.find(s => s.id === activeSectionId) || sections[0];
  let sectionFields = activeSection ? getFieldsBySection(activeSection.id) : [];
  sectionFields = sectionFields.filter(f => isFieldAssignedToUser(f, user));

  const currentIdx = sections.findIndex(s => s.id === activeSectionId);
  const prevSec = currentIdx > 0 ? sections[currentIdx - 1] : null;
  const nextSec = currentIdx < sections.length - 1 ? sections[currentIdx + 1] : null;

  const navButtonsHtml = `
    <div class="form-navigation-row" style="display:flex; justify-content:space-between; margin-top:24px; border-top:1px solid var(--border-color); padding-top:16px;">
      ${prevSec ? `
        <button class="btn btn-secondary btn-sm" id="btn-prev-section" data-sec="${prevSec.id}">
          ← Previous: ${prevSec.name || prevSec.title || ''}
        </button>
      ` : '<div></div>'}
      ${nextSec ? `
        <button class="btn btn-primary btn-sm" id="btn-next-section" data-sec="${nextSec.id}">
          Next: ${nextSec.name || nextSec.title || ''} →
        </button>
      ` : '<div></div>'}
    </div>
  `;

  // Render questions
  // Group fields by Action Point
  const apGroups = [];
  const apMap = {};
  sectionFields.forEach(field => {
    const apId = field.actionPointId || 'general_ap';
    const apTitle = field.actionPointTitle || 'Action Point';
    if (!apMap[apId]) {
      apMap[apId] = { id: apId, title: apTitle, fields: [] };
      apGroups.push(apMap[apId]);
    }
    apMap[apId].fields.push(field);
  });

  // Render questions grouped under Action Point blue lines
  const questionsHtml = apGroups.map(group => {
    const apHeaderHtml = `
      <div class="ap-group-header" style="margin-top:32px; margin-bottom:16px; border-bottom:2px solid var(--accent-indigo); padding-bottom:6px;">
        <h3 style="font-family:var(--font-title); font-size:14px; font-weight:700; color:var(--accent-indigo); margin:0; display:flex; align-items:center; gap:8px; text-transform:uppercase; letter-spacing:0.03em;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:2px;"><polyline points="20 6 9 17 4 12"/></svg>
          ${group.title}
        </h3>
      </div>
    `;

    const fieldsHtml = group.fields.map(field => {
      const existingAnswer = answersMap[field.id];
      const val = existingAnswer?.value || '';
      const guidelines = getGuidelines({ fieldId: field.id });

      // Automatic Guidelines PDF Hyperlink (offset from page 9)
      const pageNum = getGuidelinePageForQuestion(field.num);
      const pdfGuideHtml = pageNum ? `
        <a href="/SRF_6_Framework_VF.pdf#page=${pageNum}" target="_blank" class="guideline-link" title="Open DPIIT Guidelines PDF on page ${pageNum}" style="background:rgba(99,102,241,0.08); color:var(--accent-indigo); padding:4px 8px; border-radius:4px; font-weight:600; font-size:11.5px; display:inline-flex; align-items:center; gap:4px;">
          📄 DPIIT Guidelines (Page ${pageNum})
        </a>
      ` : '';

      const guidelineLinks = guidelines.map(g => `
        <a href="${g.url || '#'}" target="${g.url ? '_blank' : '_self'}" class="guideline-link" title="${g.title}">
          ${g.type === 'pdf' ? '📄' : g.type === 'video' ? '▶' : g.type === 'url' ? '🔗' : 'ℹ'} ${g.title}
        </a>
      `).join('');

      // Question statuses
      const isQuestionSubmitted = existingAnswer?.questionStatus === 'Submitted';
      const isQuestionApproved = existingAnswer?.questionStatus === 'Approved';
      const isQuestionRejected = existingAnswer?.questionStatus === 'Rejected';
      const isQuestionDocsReq = existingAnswer?.questionStatus === 'Additional Documents Requested' || existingAnswer?.questionStatus === 'Docs Requested';
      const isQuestionEditable = isAppDraft || isQuestionRejected || isQuestionDocsReq || !isQuestionFilled(existingAnswer, field);
      const freezeInputs = !isQuestionEditable;

      const inputHtml = renderFieldInput(field, val, freezeInputs, appId);

      let questionStatusBadge = '';
      if (existingAnswer?.questionStatus && existingAnswer?.questionStatus !== 'Draft') {
        const qStatusCls = _statusClass(existingAnswer.questionStatus);
        questionStatusBadge = `<span class="status-badge ${qStatusCls}" style="font-size:9px; vertical-align:middle; margin-left:8px;">${existingAnswer.questionStatus}</span>`;
      }

      // Score / Marks Text
      const scoreText = isQuestionApproved ? 
        `<span style="color:var(--success); font-weight:700; margin-left:8px;">[Score: ${existingAnswer?.questionScore || 0} / ${field.weight || 1}]</span>` : 
        `<span style="color:var(--text-dark); margin-left:8px;">[Marks: ${field.weight || 1}]</span>`;

      // Standard doc uploads
      const mandatoryDocs = (field.docs || []).filter(d => d.requirement === 'mandatory');
      const optionalDocs  = (field.docs || []).filter(d => d.requirement !== 'mandatory');

      const hasRejectedDocs = existingAnswer?.files?.some(f => f.fileStatus === 'Rejected');

      const docsHtml = [...mandatoryDocs, ...optionalDocs].map(doc => {
        const existing = existingAnswer?.files?.find(f => f.docId === doc.id);
        const isCustomSlot = doc.id.startsWith('custom_doc_');
        const isRejected = existing?.fileStatus === 'Rejected';
        return `
          <div class="doc-upload-row ${doc.requirement === 'mandatory' ? 'doc-mandatory' : 'doc-optional'}">
            <div class="doc-info">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span>${doc.name}</span>
            </div>
            <div class="doc-upload-action">
              ${existing ? `
                <div style="display:flex; flex-direction:column; align-items:flex-end; margin-right:8px;">
                  <span class="doc-uploaded" style="${isRejected ? 'color:var(--danger); font-weight:600;' : ''}">
                    ${isRejected ? '✕' : '✓'} <a href="#" class="user-view-doc-link" data-app-id="${appId}" data-field-id="${field.id}" data-doc-id="${doc.id}" data-doc-name="${existing.name}" style="text-decoration:underline; cursor:pointer; color:inherit;">${existing.name}</a>
                    ${existing.fileStatus ? `<span class="status-badge ${_statusClass(existing.fileStatus)}" style="font-size:9px; margin-left:4px;">${existing.fileStatus}</span>` : ''}
                  </span>
                  ${isRejected && existing.fileRejectionReason ? `
                    <span style="color:var(--danger); font-size:11px; margin-top:2px;">Reason: ${existing.fileRejectionReason}</span>
                  ` : ''}
                </div>
              ` : ''}
              ${isCustomSlot && isQuestionEditable ? `
                <button class="btn btn-xs btn-outline btn-delete-doc-slot" data-field-id="${field.id}" data-doc-id="${doc.id}" style="color:var(--danger); border-color:rgba(239,68,68,0.2); margin-right:4px;">✕ Delete Slot</button>
              ` : ''}
              ${(isQuestionEditable && existing?.fileStatus !== 'Approved') || isRejected ? `
                <label class="btn btn-xs btn-outline btn-upload-doc" style="cursor:pointer;">
                  ${existing ? 'Replace' : 'Upload'}
                  <input type="file" class="doc-file-input hidden" data-app-id="${appId}" data-field-id="${field.id}" data-doc-id="${doc.id}" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.zip,.xlsx,.csv">
                </label>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');

      // Custom Document Uploads Widget ("Other" for multiple file uploads)
      const standardDocIds = (field.docs || []).map(d => d.id);
      const customFiles = (existingAnswer?.files || []).filter(f => !standardDocIds.includes(f.docId));

      const customDocsHtml = customFiles.map(f => {
        const isRejected = f.fileStatus === 'Rejected';
        return `
          <div class="doc-upload-row doc-optional" style="border-style: dashed; border-color: var(--primary);">
            <div class="doc-info">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span>${f.customLabel || 'Other Document'}</span>
              <span class="doc-req-tag tag-optional" style="background:rgba(99, 102, 241, 0.08); color:var(--accent-indigo)">Other</span>
            </div>
            <div class="doc-upload-action">
              <div style="display:flex; flex-direction:column; align-items:flex-end; margin-right:8px;">
                <span class="doc-uploaded" style="${isRejected ? 'color:var(--danger); font-weight:600;' : ''}">
                  ${isRejected ? '✕' : '✓'} <a href="#" class="user-view-doc-link" data-app-id="${appId}" data-field-id="${field.id}" data-doc-id="${f.docId}" data-doc-name="${f.name}" style="text-decoration:underline; cursor:pointer; color:inherit;">${f.name}</a>
                  ${f.fileStatus ? `<span class="status-badge ${_statusClass(f.fileStatus)}" style="font-size:9px; margin-left:4px;">${f.fileStatus}</span>` : ''}
                </span>
                ${isRejected && f.fileRejectionReason ? `
                  <span style="color:var(--danger); font-size:11px; margin-top:2px;">Reason: ${f.fileRejectionReason}</span>
                ` : ''}
              </div>
              ${isQuestionEditable && f.fileStatus !== 'Approved' ? `
                <button class="btn btn-xs btn-outline btn-delete-custom-doc" data-field-id="${field.id}" data-doc-id="${f.docId}" style="color:var(--danger); border-color:rgba(239,68,68,0.2); margin-right:4px;">✕ Remove</button>
                <label class="btn btn-xs btn-outline btn-upload-doc" style="cursor:pointer;">
                  Replace
                  <input type="file" class="doc-file-input hidden" data-app-id="${appId}" data-field-id="${field.id}" data-doc-id="${f.docId}" data-custom-label="${f.customLabel || 'Other Document'}" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.zip,.xlsx,.csv">
                </label>
              ` : isRejected ? `
                <label class="btn btn-xs btn-outline btn-upload-doc" style="cursor:pointer;">
                  Replace
                  <input type="file" class="doc-file-input hidden" data-app-id="${appId}" data-field-id="${field.id}" data-doc-id="${f.docId}" data-custom-label="${f.customLabel || 'Other Document'}" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.zip,.xlsx,.csv">
                </label>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');

      // Actions/Status block for all fields
      const canEdit = isQuestionEditable;
      const actionsRowHtml = `
        <div class="field-actions-row" style="margin-top:16px; padding:12px; background:rgba(15,23,42,0.02); border-radius:8px; border:1px dashed var(--border-color); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          ${canEdit ? `
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <label class="btn btn-xs btn-outline" style="cursor:pointer; height:32px; font-size:12px; display:inline-flex; align-items:center; gap:4px; border-style:dashed;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 12l2 2 4-4"/><path d="M20.42 10.18a8.87 8.87 0 0 0-14.7-2.06 6 6 0 0 0-.15 11.88"/></svg>
                Upload Multiple Files
                <input type="file" class="other-doc-file-input hidden" data-app-id="${appId}" data-field-id="${field.id}" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.zip,.xlsx,.csv" multiple>
              </label>
            </div>
          ` : '<div></div>'}
          
          <div class="submit-action-wrap">
            ${isQuestionEditable || hasRejectedDocs ? `
              <button class="btn btn-xs btn-primary btn-submit-question" data-field-id="${field.id}" style="height:32px; padding:0 14px; font-size:12px; font-weight:700;">
                ✓ Save Question
              </button>
            ` : isQuestionSubmitted ? `
              <span style="font-size:12.5px; color:var(--accent-blue); font-weight:600; display:inline-flex; align-items:center; gap:4px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Saved
              </span>
            ` : isQuestionApproved ? `
              <span style="font-size:12.5px; color:var(--success); font-weight:600; display:inline-flex; align-items:center; gap:4px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                ✓ Approved
              </span>
            ` : ''}
          </div>
        </div>
      `;

      let canvasFieldsHtml = '';
      let elementsList = field.elements || [];
      if (typeof elementsList === 'string') {
        try {
          elementsList = JSON.parse(elementsList);
        } catch (e) {
          elementsList = [];
        }
      }
      const hasCustomElements = Array.isArray(elementsList) && elementsList.length > 0 && !(elementsList.length === 1 && (elementsList[0].id.startsWith('el_srf6_') || elementsList[0].id.startsWith('main_el_')));
      if (hasCustomElements) {
        let valuesMap = {};
        if (val) {
          try { valuesMap = JSON.parse(val); } catch (e) { valuesMap = { "legacy": val }; }
        }
        canvasFieldsHtml = elementsList.map(el => {
          const elVal = valuesMap[el.id] || (el.type === field.fieldType ? val : '');
          return renderUserElementInput(el, field.id, elVal, freezeInputs, appId);
        }).join('');
      } else {
        canvasFieldsHtml = `<div class="question-input-wrap">${inputHtml}</div>`;
      }

      const hasDocs = (field.docs && field.docs.length > 0) || (field.uploadRequirement && field.uploadRequirement !== 'none');
      const isPureLayout = Array.isArray(elementsList) && elementsList.length > 0 && elementsList.every(el => ['heading','subheading','description','instruction','divider','card','banner','hyperlink'].includes(el.type));
      const isLegacyLayout = (!field.elements || field.elements.length === 0) && ['heading','subheading','description','instruction','divider','card','banner','notes','warning','image','hyperlink'].includes(field.fieldType);
      
      const fieldLinkHtml = (field.url && field.url !== '#') ? `
        <a href="${field.url}" target="_blank" class="guideline-link" title="Reference Link" style="background:rgba(99,102,241,0.08); color:var(--accent-indigo); padding:4px 8px; border-radius:4px; font-weight:600; font-size:11.5px; display:inline-flex; align-items:center; gap:4px;">
          🔗 Reference Link
        </a>
      ` : '';

      if (isPureLayout || isLegacyLayout) {
        return `
          <div class="layout-element-group" id="qg-${field.id}" style="margin-bottom:18px;">
            ${canvasFieldsHtml}
            ${fieldLinkHtml ? `<div style="margin-top:4px; margin-bottom:8px;">${fieldLinkHtml}</div>` : ''}
            ${hasDocs ? `
              <div class="doc-uploads-section" style="margin-top:12px;">
                <div class="doc-uploads-label">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Supporting Documents
                </div>
                ${docsHtml}
                ${customDocsHtml}
                ${actionsRowHtml}
              </div>
            ` : ''}
          </div>
        `;
      }

      return `
        <div class="question-group" id="qg-${field.id}" data-field-id="${field.id}" style="margin-bottom:24px; padding-bottom:16px; border-bottom:1px solid var(--border-color);">
          <div class="question-header">
            <div class="question-title-block">
              <span class="question-num">${field.num || ''}</span>
              <span class="question-text">${field.text}${field.mandatory ? ' <span class="required-star">*</span>' : ''} ${scoreText} ${questionStatusBadge}</span>
            </div>
            <div class="question-guidelines" style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
              ${pdfGuideHtml}
              ${fieldLinkHtml}
              ${guidelineLinks}
            </div>
          </div>
          ${field.helpText ? `<div class="question-help-text">${field.helpText}</div>` : ''}
          <div class="question-input-wrap">${canvasFieldsHtml}</div>
          
          <div class="doc-uploads-section" style="margin-top:12px;">
            <div class="doc-uploads-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Supporting Documents
            </div>
            ${docsHtml}
            ${customDocsHtml}
            ${actionsRowHtml}
          </div>
        </div>
      `;
    }).join('');

    return apHeaderHtml + fieldsHtml;
  }).join('');

  container.innerHTML = `
    <div style="margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <button class="btn btn-secondary btn-sm" id="btn-back-to-user-dash">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        Dashboard
      </button>
      <div class="breadcrumbs-container" style="font-size:12.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;font-family:var(--font-body);">
        <a href="#" class="breadcrumb-link" data-breadcrumb="dashboard" style="color:var(--primary);text-decoration:none;font-weight:500;transition:color var(--transition-fast);">Dashboard</a>
        <span>&gt;</span>
        <a href="#" class="breadcrumb-link" data-breadcrumb="explore" style="color:var(--primary);text-decoration:none;font-weight:500;transition:color var(--transition-fast);">Explore Applications</a>
        <span>&gt;</span>
        <span style="color:var(--text-muted);font-weight:500;">${edition?.name}</span>
        <span>&gt;</span>
        <span style="color:var(--text-main);font-weight:600;">${activeSection?.name || activeSection?.title || ''}</span>
      </div>
      ${isFrozen ? `<span class="status-badge status-submitted" style="margin-left:auto;">${app.status}</span>` : `
        <div style="margin-left:auto;display:flex;gap:8px;">
          <button class="btn btn-secondary btn-sm" id="btn-save-draft">💾 Save & Exit</button>
          <button class="btn btn-success-solid btn-sm" id="btn-submit-reform-area">✓ Submit Reform Area</button>
          <button class="btn btn-primary btn-sm" id="btn-submit-app">Submit Entire Application</button>
        </div>
      `}
    </div>

    <div class="section-card section-intro" style="margin-bottom:24px;">
      <div class="section-badge">${edition?.name}</div>
      <h1>${activeSection?.name || activeSection?.title || ''}</h1>
      <p>${activeSection?.description || activeSection?.desc || ''}</p>
    </div>

    ${(() => {
      const prog = calculateApplicationProgress(appId);
      const pct = prog.percentage;
      const barColor = pct >= 100 ? '#10b981' : pct >= 60 ? '#6366f1' : '#f59e0b';
      return `
        <div id="app-progress-bar-wrap" style="background:rgba(255,255,255,0.04); border:1px solid var(--border-color); border-radius:12px; padding:14px 18px; margin-bottom:20px; display:flex; align-items:center; gap:14px;">
          <div style="flex:1;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-size:12.5px; font-weight:600; color:var(--text-main);">Overall Progress</span>
              <span style="font-size:12px; font-weight:700; color:${barColor};">${prog.completed} / ${prog.total} questions answered (${pct}%)</span>
            </div>
            <div style="background:rgba(255,255,255,0.06); border-radius:99px; height:7px; overflow:hidden;">
              <div style="width:${pct}%; height:100%; background:${barColor}; border-radius:99px; transition:width 0.5s ease;"></div>
            </div>
          </div>
        </div>
      `;
    })()}
    ${app.status === 'Rejected' && app.rejectionReason ? `
      <div class="alert-box alert-danger" style="margin-bottom:20px;">
        <strong>Rejected:</strong> ${app.rejectionReason}
        <p style="margin-top:6px;font-size:13px;">Please address the issues above and resubmit your application.</p>
      </div>
    ` : ''}
    ${app.status === 'Additional Documents Requested' ? `
      <div class="alert-box alert-warning" style="margin-bottom:20px;">
        <strong>Additional Documents Requested:</strong> ${app.additionalDocsNote}
      </div>
    ` : ''}

    <div class="card glass-card">
      <div class="card-body p-0">
        <div id="form-questions">${questionsHtml || '<div class="empty-state"><p>No questions in this section yet.</p></div>'}</div>
      </div>
    </div>

    ${navButtonsHtml}


    ${!isFrozen ? `
      <div style="display:flex;gap:12px;margin-top:24px;justify-content:flex-end;">
        <button class="btn btn-secondary" id="btn-save-draft-bottom">💾 Save & Exit</button>
        <button class="btn btn-success-solid" id="btn-submit-reform-area-bottom">✓ Submit Reform Area</button>
        <button class="btn btn-primary" id="btn-submit-app-bottom">✓ Submit Entire Application</button>
      </div>
    ` : ''}
  `;

  // Dynamic Upload Disabler for "No" Selection
  const toggleUploadsForNoRadio = () => {
    container.querySelectorAll('.question-group, .layout-element-group').forEach(qg => {
      const checkedRadios = Array.from(qg.querySelectorAll('input[type="radio"]:checked'));
      const isNo = checkedRadios.some(r => r.value === 'No');
      
      const uploadActions = qg.querySelectorAll('.btn-upload-doc, .other-doc-file-input, .btn-delete-custom-doc, .btn-delete-doc-slot');
      uploadActions.forEach(el => {
        const target = el.tagName === 'LABEL' ? el : (el.closest('label') || el);
        if (target) {
          target.style.opacity = isNo ? '0.4' : '1';
          target.style.pointerEvents = isNo ? 'none' : 'auto';
        }
      });
    });
  };
  toggleUploadsForNoRadio();

  // Restore last scroll position for this draft
  try {
    const posRaw = sessionStorage.getItem(`srf_draft_pos_${appId}`);
    if (posRaw) {
      const pos = JSON.parse(posRaw);
      if (pos && typeof pos.scrollY === 'number') {
        requestAnimationFrame(() => window.scrollTo({ top: pos.scrollY, behavior: 'instant' }));
      }
    }
  } catch(e) {}

  // Compliance Radio Listeners
  container.querySelectorAll('.q-compliance-radio').forEach(radio => {
    radio.addEventListener('change', () => {
      const fieldId = radio.dataset.fieldId;
      saveAnswerCompliance(appId, fieldId, radio.value);
      showToast('Compliance self-assessment saved.', 'info');
    });
  });

  // Individual Save Question Listener
  container.querySelectorAll('.btn-submit-question').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const fieldId = btn.dataset.fieldId;

      // Read answer fresh from DB (answersMap can be stale if user just selected a radio)
      const freshAnswers = getAnswersByApplication(appId);
      const ans = freshAnswers.find(a => a.fieldId === fieldId);

      // Also check live DOM for radio value in case saveAnswerCompliance hasn't fired yet
      const liveRadio = container.querySelector(`input[type="radio"][data-field-id="${fieldId}"]:checked`);
      const liveInput = container.querySelector(`[data-field-id="${fieldId}"].user-field-input`);
      const liveVal = ans?.value || liveRadio?.value || liveInput?.value || '';

      // Only require text/choice input validation if the question actually renders input elements
      const hasInputs = container.querySelector(
        `input[data-field-id="${fieldId}"]:not([type="file"]), ` +
        `textarea[data-field-id="${fieldId}"], ` +
        `select[data-field-id="${fieldId}"], ` +
        `.user-field-input[data-field-id="${fieldId}"]`
      );

      if (hasInputs && !liveVal) {
        showAlert({
          title: "Can't Submit Question",
          message: "can't submit the question and whole application untill user fully fill the form",
          type: 'error'
        });
        return;
      }

      // If the live DOM has a value not yet persisted, save it first
      if (!ans?.value && liveVal) {
        saveAnswerCompliance(appId, fieldId, liveVal);
      }

      const res = submitQuestion(appId, fieldId, user.id);
      if (res.success) {
        showToast('Question saved successfully!', 'success');
        openApplicationForm(appId, container); // refresh
      } else {
        showAlert({
          title: "Can't Submit Question",
          message: `can't submit the question and whole application untill user fully fill the form<br><br><strong>Details:</strong> ${res.error || 'Failed to save question.'}`,
          type: 'error'
        });
      }
    });
  });

  // Custom Document File Input Listener
  container.querySelectorAll('.other-doc-file-input').forEach(fileInput => {
    fileInput.addEventListener('change', (e) => {
      const filesUploaded = e.target.files;
      if (!filesUploaded || filesUploaded.length === 0) return;
      const { fieldId } = fileInput.dataset;
      
      const existing = getAnswersByApplication(appId).find(a => a.fieldId === fieldId);
      const files = existing?.files ? [...existing.files] : [];
      
      const promises = Array.from(filesUploaded).map((file, i) => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const docId = 'custom_doc_' + Date.now() + '_' + i + '_' + Math.random().toString(36).substr(2,4);
            const label = file.name;
            resolve({
              docId,
              name: file.name,
              size: file.size,
              type: file.type,
              customLabel: label,
              fileStatus: 'Pending',
              fileRejectionReason: '',
              uploadedAt: new Date().toISOString(),
              dataUrl: event.target.result
            });
          };
          reader.readAsDataURL(file);
        });
      });

      Promise.all(promises).then(async (newFiles) => {
        files.push(...newFiles);
        saveAnswer(appId, fieldId, existing?.value || '', files);
        // Directly persist files with dataUrls to server
        try {
          await fetch(`/api/files/${appId}/${fieldId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files })
          });
        } catch(e) { console.warn('[Upload] Direct file save failed, will sync on next save:', e); }
        forceSave();
        showToast(filesUploaded.length > 1 ? `${filesUploaded.length} files uploaded!` : `File uploaded successfully!`, 'success');
        openApplicationForm(appId, container); // refresh
      });
    });
  });

  // User Document View Listener
  container.querySelectorAll('.user-view-doc-link').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const { appId: aId, fieldId, docId, docName } = link.dataset;
      const ans = getAnswersByApplication(aId).find(a => a.fieldId === fieldId);
      let fileObj = (ans?.files || []).find(f => f.docId === docId) || (ans?.files || []).find(f => f.name === docName);

      if (!fileObj?.dataUrl) {
        try {
          link.textContent = 'Loading...';
          const res = await fetch(`/api/files/${aId}/${fieldId}`);
          if (res.ok) {
            const data = await res.json();
            const serverFiles = data.files || [];
            fileObj = serverFiles.find(f => f.docId === docId) || serverFiles.find(f => f.name === docName);
          }
        } catch(err) {
          console.error('[View] Failed to fetch file:', err);
        } finally {
          link.textContent = docName;
        }
      }

      if (fileObj && fileObj.dataUrl) {
        // Need to import or use dataURLtoObjectURL if not available, but it is imported at top in app.js
        const objectUrl = dataURLtoObjectURL(fileObj.dataUrl);
        showFileViewer({
          title: `Document: ${fileObj.name}`,
          dataUrl: objectUrl,
          fileName: fileObj.name
        });
      } else if (docId) {
        fetch(`/api/files/${aId}/${fieldId}/${docId}`)
          .then(res => {
            if (!res.ok) {
              if (res.status === 401 || res.status === 403) {
                throw new Error("Access Denied: You do not have permission to view this file.");
              }
              throw new Error("Failed to download file.");
            }
            return res.blob();
          })
          .then(blob => {
            const objectUrl = URL.createObjectURL(blob);
            showFileViewer({
              title: `Document Preview: ${fileObj ? fileObj.name : 'File'}`,
              dataUrl: objectUrl,
              fileName: fileObj ? fileObj.name : `document_${docId}`
            });
          })
          .catch(err => {
            showAlert({ title: 'Preview Failed', message: err.message, type: 'error' });
          });
      } else {
        showAlert({ title: 'Preview Unavailable', message: 'The file has no preview data or was not fully uploaded.', type: 'warning' });
      }
    });
  });

  // Delete Custom Document Listener
  container.querySelectorAll('.btn-delete-custom-doc').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const { fieldId, docId } = btn.dataset;
      const existing = getAnswersByApplication(appId).find(a => a.fieldId === fieldId);
      if (existing && existing.files) {
        const deletedFile = existing.files.find(f => f.docId === docId);
        if (deletedFile) {
          addToRecycleBin(deletedFile, appId, fieldId, getCurrentUser()?.username || 'user');
        }
        const updatedFiles = existing.files.filter(f => f.docId !== docId);
        saveAnswer(appId, fieldId, existing.value || '', updatedFiles);
        showToast('Other document removed.', 'info');
        openApplicationForm(appId, container); // refresh
      }
    });
  });

  // Delete Document Slot Listener
  container.querySelectorAll('.btn-delete-doc-slot').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const { fieldId, docId } = btn.dataset;
      const existing = getAnswersByApplication(appId).find(a => a.fieldId === fieldId);
      if (existing && existing.files) {
        const deletedFile = existing.files.find(f => f.docId === docId);
        if (deletedFile) {
          addToRecycleBin(deletedFile, appId, fieldId, getCurrentUser()?.username || 'user');
        }
        const updatedFiles = existing.files.filter(f => f.docId !== docId);
        saveAnswer(appId, fieldId, existing.value || '', updatedFiles);
        showToast('Document deleted.', 'info');
        openApplicationForm(appId, container); // refresh
      }
    });
  });

  // Next / Prev Section Navigation Listeners
  container.querySelector('#btn-prev-section')?.addEventListener('click', () => {
    activeSectionId = prevSec.id;
    openApplicationForm(appId, container);
  });
  container.querySelector('#btn-next-section')?.addEventListener('click', () => {
    activeSectionId = nextSec.id;
    openApplicationForm(appId, container);
  });

  const saveCustomCanvasAnswer = (fieldId) => {
    const questionGroup = container.querySelector(`#qg-${fieldId}`);
    if (!questionGroup) return;

    const valuesMap = {};

    // 1. Inputs (Text, TextArea, Select, Date, URL, File)
    questionGroup.querySelectorAll(`.user-el-input`).forEach(inp => {
      const elId = inp.dataset.elId;
      valuesMap[elId] = inp.value;
    });

    // 2. Checkboxes
    const cbMap = {};
    questionGroup.querySelectorAll(`.user-el-cb-input:checked`).forEach(chk => {
      const elId = chk.dataset.elId;
      if (!cbMap[elId]) cbMap[elId] = [];
      cbMap[elId].push(chk.value);
    });
    Object.keys(cbMap).forEach(elId => {
      valuesMap[elId] = cbMap[elId].join(', ');
    });

    // 3. Radios
    questionGroup.querySelectorAll(`.user-el-radio-input:checked`).forEach(rad => {
      const elId = rad.dataset.elId;
      valuesMap[elId] = rad.value;
    });

    // 4. Tables
    const tableMap = {};
    questionGroup.querySelectorAll(`.user-el-table-input`).forEach(cell => {
      const elId = cell.dataset.elId;
      const idx = parseInt(cell.dataset.rowIdx);
      if (!tableMap[elId]) tableMap[elId] = [];
      tableMap[elId][idx] = cell.value;
    });
    Object.keys(tableMap).forEach(elId => {
      valuesMap[elId] = tableMap[elId].join('|');
    });

    // Save
    const serializedVal = JSON.stringify(valuesMap);
    const existingAnswer = answersMap[fieldId];
    saveAnswer(appId, fieldId, serializedVal, existingAnswer?.files || []);
  };

  // Canvas Element Event Listeners
  container.querySelectorAll('.user-el-input, .user-el-cb-input, .user-el-radio-input, .user-el-table-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const fieldId = inp.dataset.fieldId;
      saveCustomCanvasAnswer(fieldId);
      toggleUploadsForNoRadio();
    });
  });

  // Answer listeners
  container.querySelectorAll('.field-answer-input').forEach(input => {
    input.addEventListener('change', () => {
      const fieldId = input.dataset.fieldId;
      const existingAnswer = answersMap[fieldId];
      saveAnswer(appId, fieldId, input.value, existingAnswer?.files || []);
      toggleUploadsForNoRadio();
    });
  });

  // Multiselect Listeners
  container.querySelectorAll('.multiselect-chk').forEach(input => {
    input.addEventListener('change', () => {
      const fieldId = input.dataset.fieldId;
      const chks = [...container.querySelectorAll(`.multiselect-chk[data-field-id="${fieldId}"]:checked`)];
      const val = chks.map(c => c.value).join(', ');
      const existingAnswer = answersMap[fieldId];
      saveAnswer(appId, fieldId, val, existingAnswer?.files || []);
    });
  });

  // Table Cell Listeners
  container.querySelectorAll('.table-cell-input').forEach(input => {
    input.addEventListener('change', () => {
      const fieldId = input.dataset.fieldId;
      const cells = [...container.querySelectorAll(`.table-cell-input[data-field-id="${fieldId}"]`)];
      cells.sort((a, b) => (parseInt(a.dataset.rowIdx) - parseInt(b.dataset.rowIdx)));
      const val = cells.map(c => c.value).join('|');
      const existingAnswer = answersMap[fieldId];
      saveAnswer(appId, fieldId, val, existingAnswer?.files || []);
    });
  });

  container.querySelectorAll('.doc-file-input').forEach(fileInput => {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const { appId: aid, fieldId, docId } = fileInput.dataset;
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target.result;
        const existing = getAnswersByApplication(aid).find(a => a.fieldId === fieldId);
        const existingFile = existing?.files?.find(f => f.docId === docId);
        if (existingFile) {
          addToRecycleBin(existingFile, aid, fieldId, getCurrentUser()?.username || 'user');
        }
        const files = existing?.files ? [...existing.files.filter(f => f.docId !== docId)] : [];
        files.push({
          docId,
          name: file.name,
          size: file.size,
          type: file.type,
          fileStatus: 'Pending',
          fileRejectionReason: '',
          uploadedAt: new Date().toISOString(),
          dataUrl
        });
        saveAnswer(aid, fieldId, existing?.value || '', files);
        // Directly persist files with dataUrls to server
        try {
          await fetch(`/api/files/${aid}/${fieldId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files })
          });
        } catch(e) { console.warn('[Upload] Direct file save failed, will sync on next save:', e); }
        forceSave();
        showToast(`"${file.name}" uploaded!`, 'success');
        openApplicationForm(appId, container); // refresh
      };
      reader.readAsDataURL(file);
    });
  });


  // Navigation

  container.querySelector('#btn-back-to-user-dash')?.addEventListener('click', () => {
    window.workspaceLock = false;
    uiState.activeUserTab = 'dashboard';
    document.getElementById('sidebar-nav-container').innerHTML = '';
    renderUserSidebar();
    switchUserTab('dashboard');
  });

  // Save draft — also persists active section and scroll position
  const _persistDraftPosition = () => {
    try {
      sessionStorage.setItem(`srf_draft_pos_${appId}`, JSON.stringify({
        sectionId: activeSectionId,
        scrollY: window.scrollY
      }));
    } catch(e) {}
  };

  const doSaveDraft = () => {
    // Flush all live DOM inputs into the store first
    container.querySelectorAll('.field-answer-input, .multiselect-chk, .user-el-input, .user-el-cb-input, .user-el-radio-input, .user-el-table-input').forEach(inp => {
      inp.dispatchEvent(new Event('change'));
    });
    updateApplication(appId, { status: 'Draft' });
    _persistDraftPosition();
    forceSave();
    showToast('Draft saved successfully! Exiting to Explore Applications.', 'success');
    addNotification(user.id, 'DRAFT_SAVED', `Your application draft has been saved successfully.`, appId);
    addAuditLog(user.id, 'Saved draft application', 'application', appId);
    
    // Redirect user to Explore Applications → Drafts tab
    window.exploreAppsState = window.exploreAppsState || {};
    window.exploreAppsState.activeTab = 'Drafts';
    window.workspaceLock = false;
    uiState.activeUserTab = 'explore';
    renderUserSidebar();
    switchUserTab('explore');
  };
  container.querySelector('#btn-save-draft')?.addEventListener('click', doSaveDraft);
  container.querySelector('#btn-save-draft-bottom')?.addEventListener('click', doSaveDraft);

  // Bind clickable breadcrumbs
  container.querySelectorAll('.breadcrumb-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.dataset.breadcrumb;
      window.workspaceLock = false;
      if (target === 'dashboard') {
        uiState.activeUserTab = 'dashboard';
        renderUserSidebar();
        switchUserTab('dashboard');
      } else if (target === 'explore') {
        window.exploreAppsState = window.exploreAppsState || {};
        window.exploreAppsState.activeTab = 'Drafts';
        uiState.activeUserTab = 'explore';
        renderUserSidebar();
        switchUserTab('explore');
      }
    });
  });

  const doSubmitReformArea = () => {
    const result = submitReformArea(appId, activeSectionId, user.id);
    if (result.success) {
      addNotification(user.id, NOTIFICATION_EVENTS.REFORM_AREA_SUBMITTED,
        `Reform Area "${activeSection?.title || activeSectionId}" has been submitted successfully.`, appId);
      addAuditLog(user.id, `Submitted Reform Area ${activeSectionId}`, 'application', appId);
      showToast('Reform Area Submitted Successfully!', 'success');
      openApplicationForm(appId, container);
    } else {
      showAlert({
        title: 'Cannot Submit Reform Area',
        message: `can't submit the question and whole application untill user fully fill the form<br><br><strong>Details:</strong> ${result.error || 'Submission failed.'}`,
        type: 'error'
      });
    }
  };
  container.querySelector('#btn-submit-reform-area')?.addEventListener('click', doSubmitReformArea);
  container.querySelector('#btn-submit-reform-area-bottom')?.addEventListener('click', doSubmitReformArea);

  const doSubmit = async () => {
    const btnTop = container.querySelector('#btn-submit-app');
    const btnBottom = container.querySelector('#btn-submit-app-bottom');
    
    // Disable buttons and show loader spinner
    if (btnTop) {
      btnTop.disabled = true;
      btnTop.innerHTML = '<span class="spinner" style="display:inline-block; width:12px; height:12px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite; margin-right:6px; vertical-align:middle;"></span> Submitting...';
    }
    if (btnBottom) {
      btnBottom.disabled = true;
      btnBottom.innerHTML = '<span class="spinner" style="display:inline-block; width:12px; height:12px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite; margin-right:6px; vertical-align:middle;"></span> Submitting...';
    }

    try {
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }

      // Auto-save all active inputs before validating submission
      container.querySelectorAll('.field-answer-input, .multiselect-chk, .user-el-input, .user-el-cb-input, .user-el-radio-input, .user-el-table-input').forEach(inp => {
        inp.dispatchEvent(new Event('change'));
      });

      await forceSave();

      const answers = getAnswersByApplication(appId);
      const app = getApplicationById(appId);
      if (!app) {
        throw new Error('Application not found.');
      }
      
      // Check assignments existence
      const hasAssignment = getAllAssignments().some(a => a.userId === user.id && a.editionId === app.editionId);
      if (!hasAssignment) {
        throw new Error('No assignments found for this user in this edition.');
      }

      const fields = getFieldsByEdition(app.editionId);
      
      // Validate mandatory questions and documents
      const missingQuestions = [];
      const missingDocs = [];
      
      fields.forEach(f => {
        if (f.isLayoutElement) return;
        
        // Check if question is assigned to the current user
        if (!isFieldAssignedToUser(f, user)) return;

        if (f.mandatory) {
          const ans = answers.find(a => a.fieldId === f.id);
          // Use isQuestionFilled: "No" = answered for completion purposes
          if (!isQuestionFilled(ans, f)) {
            missingQuestions.push(f);
          } else {
            // Check documents only when answer is not "No"
            const isNo = ans && ans.value && (ans.value === 'No' || (typeof ans.value === 'string' && ans.value.trim().toLowerCase() === 'no'));
            if (!isNo) {
              if (f.docs && f.docs.length > 0) {
                f.docs.forEach(d => {
                  if (d.requirement === 'mandatory') {
                    const file = ans.files?.find(fi => fi.docId === d.id);
                    if (!file || (!file.dataUrl && !file.name)) {
                      missingDocs.push({ field: f, doc: d });
                    }
                  }
                });
              }
              if (f.uploadRequirement === 'mandatory') {
                if (!ans.files || ans.files.length === 0) {
                  missingDocs.push({ field: f });
                }
              }
            }
          }
        }
      });

      if (missingQuestions.length > 0 || missingDocs.length > 0) {
        let msg = "Cannot submit the application until all required fields are filled.";
        if (missingQuestions.length > 0) {
          msg += `<br><br><strong>Missing Required Questions:</strong><ul style="margin-top:6px;padding-left:20px;text-align:left;">${missingQuestions.map(m => `<li>Q${m.num || m.id}: ${m.label || m.text}</li>`).join('')}</ul>`;
        }
        if (missingDocs.length > 0) {
          msg += `<br><br><strong>Missing Required Documents:</strong><ul style="margin-top:6px;padding-left:20px;text-align:left;">${missingDocs.map(m => `<li>Q${m.field.num || m.field.id}: ${m.doc ? m.doc.name : 'Supporting Document'}</li>`).join('')}</ul>`;
        }
        
        showAlert({
          title: 'Cannot Submit Application',
          message: msg,
          type: 'error'
        });
        return;
      }

      const result = submitApplication(appId, user.id);
      if (result.success) {
        // Create notification and audit log
        addNotification(user.id, NOTIFICATION_EVENTS.APPLICATION_SUBMITTED,
          `Your application ${appId} has been submitted successfully.`, appId);
        addAuditLog(user.id, 'Submitted application', 'application', appId);

        // Redirect user to Explore Applications → Submitted tab
        window.exploreAppsState = window.exploreAppsState || {};
        window.exploreAppsState.activeTab = 'Submitted';
        uiState.activeUserTab = 'explore';
        renderUserSidebar();
        switchUserTab('explore');
        
        showAlert({
          title: 'Application Submitted!',
          message: `Your application <strong>${appId}</strong> has been submitted successfully. You will be notified once it is reviewed.`,
          type: 'success'
        });
      } else {
        showAlert({
          title: 'Cannot Submit',
          message: result.error || 'Submission failed.',
          type: 'error'
        });
      }
    } catch(err) {
      console.error(err);
      showAlert({
        title: 'Error during submission',
        message: err.message || 'An unexpected error occurred.',
        type: 'error'
      });
    } finally {
      // Re-enable buttons
      if (btnTop) {
        btnTop.disabled = false;
        btnTop.innerHTML = 'Submit Entire Application';
      }
      if (btnBottom) {
        btnBottom.disabled = false;
        btnBottom.innerHTML = 'Submit Entire Application';
      }
    }
  };
  container.querySelector('#btn-submit-app')?.addEventListener('click', doSubmit);
  container.querySelector('#btn-submit-app-bottom')?.addEventListener('click', doSubmit);


  // Auto-save every 30 seconds — flush live DOM inputs, then persist
  clearInterval(autoSaveTimer);
  if (!isFrozen) {
    autoSaveTimer = setInterval(() => {
      // Collect live DOM values before flushing
      container.querySelectorAll('.field-answer-input, .multiselect-chk, .user-el-input, .user-el-cb-input, .user-el-radio-input, .user-el-table-input').forEach(inp => {
        inp.dispatchEvent(new Event('change'));
      });
      forceSave();
      // Update progress bar without full re-render
      const prog = calculateApplicationProgress(appId);
      const barWrap = container.querySelector('#app-progress-bar-wrap');
      if (barWrap) {
        const pct = prog.percentage;
        const barColor = pct >= 100 ? '#10b981' : pct >= 60 ? '#6366f1' : '#f59e0b';
        const bar = barWrap.querySelector('div > div:last-child > div');
        const label = barWrap.querySelector('span:last-child');
        if (bar) bar.style.width = pct + '%';
        if (bar) bar.style.background = barColor;
        if (label) { label.textContent = `${prog.completed} / ${prog.total} questions answered (${pct}%)`; label.style.color = barColor; }
      }
    }, 30000);
  }
}

export function renderUserElementInput(el, fieldId, value, disabled, appId) {
  const dis = disabled ? 'disabled' : '';
  const cls = 'user-el-input';
  const attr = `data-field-id="${fieldId}" data-el-id="${el.id}"`;
  const reqStar = el.required ? `<span style="color:var(--danger)">*</span>` : '';

  switch (el.type) {
    case 'heading':
      const hText = `<h3 style="font-family:var(--font-title); font-size:16px; font-weight:700; color:var(--text-main); margin-top:10px;">${el.label || ''}</h3>`;
      if (el.options && el.options.length > 0) {
        const hOpts = el.options.map(o => `
          <label class="radio-label" style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; margin-right:12px;">
            <input type="radio" class="user-el-radio-input" name="radio-${fieldId}-${el.id}" data-field-id="${fieldId}" data-el-id="${el.id}" value="${o}" ${value === o ? 'checked' : ''} ${dis}>
            <span class="radio-custom"></span> ${o}
          </label>
        `).join('');
        return `
          ${hText}
          <div style="margin-top:6px; margin-bottom:12px; display:flex; flex-wrap:wrap; gap:6px;">
            ${hOpts}
          </div>
        `;
      }
      return hText;
    case 'subheading':
      return `<h4 style="font-family:var(--font-title); font-size:14px; font-weight:600; color:var(--text-main); margin-top:8px;">${el.label || ''}</h4>`;
    case 'description':
      return `<p style="font-size:13.5px; color:var(--text-muted); line-height:1.6; margin:4px 0;">${el.label || ''}</p>`;
    case 'instruction':
      return `
        <div style="background:rgba(99,102,241,0.05); border-left:4px solid var(--accent-indigo); padding:10px 14px; border-radius:4px; font-size:13px; color:var(--text-muted); line-height:1.5; margin:8px 0;">
          ${el.label || ''}
        </div>
      `;
    case 'divider':
      return `<hr style="border:none; border-top:1px solid var(--border-color); margin:12px 0;">`;
    case 'card':
      return `
        <div style="border:1px solid var(--border-color); border-radius:8px; padding:12px; background:rgba(255,255,255,0.01); font-size:13px; color:var(--text-main); margin:8px 0;">
          ${el.label || ''}
        </div>
      `;
    case 'banner':
      return `
        <div style="background:rgba(217,119,6,0.06); border:1px solid rgba(217,119,6,0.15); padding:10px 14px; border-radius:6px; font-size:13px; color:var(--warning); font-weight:500; margin:8px 0;">
          ⚠️ ${el.label || ''}
        </div>
      `;
    case 'hyperlink':
      const targetAttr = 'target="_blank"';
      const actualUrl = (el.url && el.url !== '#') ? el.url : (el.label && el.label.startsWith('http') ? el.label : '#');
      return `
        <div style="margin:8px 0;">
          <a href="${actualUrl}" ${targetAttr} style="color:var(--accent-indigo); font-weight:600; text-decoration:underline; display:inline-flex; align-items:center; gap:6px; font-size:13px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            ${el.label || 'Click here to view reference'}
          </a>
          ${el.description ? `<p style="font-size:12px; color:var(--text-muted); margin:4px 0 0 0; line-height:1.4;">${el.description}</p>` : ''}
        </div>
      `;
    case 'textbox':
      return `
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${el.label || 'Input'} ${reqStar}</label>
          <input type="text" class="${cls} form-input" ${attr} value="${value || ''}" placeholder="${el.placeholder || ''}" ${dis}>
        </div>
      `;
    case 'textarea':
      return `
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${el.label || 'Input'} ${reqStar}</label>
          <textarea class="${cls} form-textarea" ${attr} rows="3" placeholder="${el.placeholder || ''}" ${dis}>${value || ''}</textarea>
        </div>
      `;
    case 'dropdown':
      const opts = (el.options || []).map(o => `<option value="${o}" ${value === o ? 'selected' : ''}>${o}</option>`).join('');
      return `
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${el.label || 'Select Options'} ${reqStar}</label>
          <select class="${cls} form-input form-select" ${attr} ${dis}>
            <option value="">Select an option</option>
            ${opts}
          </select>
        </div>
      `;
    case 'checkbox':
      const cbOpts = (el.options || ['Option 1', 'Option 2']).map(o => {
        const isChecked = (value || '').split(', ').includes(o) ? 'checked' : '';
        return `
          <label class="checkbox-label" style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; margin-right:12px;">
            <input type="checkbox" class="user-el-cb-input" data-field-id="${fieldId}" data-el-id="${el.id}" value="${o}" ${isChecked} ${dis}>
            <span class="checkbox-custom"></span> ${o}
          </label>
        `;
      }).join('');
      return `
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${el.label || 'Checkbox Options'} ${reqStar}</label>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">${cbOpts}</div>
        </div>
      `;
    case 'radio':
      const rdOpts = (el.options || ['Yes', 'No']).map(o => `
        <label class="radio-label" style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; margin-right:12px;">
          <input type="radio" class="user-el-radio-input" name="radio-${fieldId}-${el.id}" data-field-id="${fieldId}" data-el-id="${el.id}" value="${o}" ${value === o ? 'checked' : ''} ${dis}>
          <span class="radio-custom"></span> ${o}
        </label>
      `).join('');
      return `
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${el.label || 'Select Option'} ${reqStar}</label>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">${rdOpts}</div>
        </div>
      `;
    case 'date':
      return `
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${el.label || 'Select Date'} ${reqStar}</label>
          <input type="date" class="${cls} form-input" ${attr} value="${value || ''}" ${dis}>
        </div>
      `;
    case 'number':
      return `
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${el.label || 'Number Input'} ${reqStar}</label>
          <input type="number" class="${cls} form-input" ${attr} value="${value || ''}" placeholder="${el.placeholder || '0'}" ${dis}>
        </div>
      `;
    case 'email':
      return `
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${el.label || 'Email Input'} ${reqStar}</label>
          <input type="email" class="${cls} form-input" ${attr} value="${value || ''}" placeholder="${el.placeholder || 'email@example.com'}" ${dis}>
        </div>
      `;
    case 'url':
      return `
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${el.label || 'URL Input'} ${reqStar}</label>
          <input type="url" class="${cls} form-input" ${attr} value="${value || ''}" placeholder="${el.placeholder || 'https://...'}" ${dis}>
        </div>
      `;
    case 'richtext':
      return `
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${el.label || 'Rich Text Content'} ${reqStar}</label>
          <textarea class="${cls} form-textarea" ${attr} rows="4" placeholder="${el.placeholder || ''}" style="font-family:inherit;" ${dis}>${value || ''}</textarea>
        </div>
      `;
    case 'table':
      const tRows = el.options || ['Dimension 1', 'Dimension 2'];
      const rowVals = value ? value.split('|') : [];
      return `
        <div style="margin-bottom:12px;">
          <label style="display:block; font-size:13px; font-weight:600; color:var(--text-main); margin-bottom:6px;">${el.label || 'Table Grid'} ${reqStar}</label>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; border:1px solid var(--border-color); font-size:13px; border-radius:8px; overflow:hidden;">
              <thead>
                <tr style="background:rgba(255,255,255,0.02);">
                  <th style="padding:10px; border:1px solid var(--border-color); text-align:left; color:var(--text-muted);">Parameter</th>
                  <th style="padding:10px; border:1px solid var(--border-color); text-align:left; color:var(--text-muted);">Response</th>
                </tr>
              </thead>
              <tbody>
                ${tRows.map((rowOpt, rIdx) => {
                  const cellVal = rowVals[rIdx] || '';
                  return `
                    <tr>
                      <td style="padding:10px; border:1px solid var(--border-color); font-weight:500; background:rgba(255,255,255,0.01);">${rowOpt}</td>
                      <td style="padding:8px; border:1px solid var(--border-color);">
                        <input type="text" class="user-el-table-input form-input" data-field-id="${fieldId}" data-el-id="${el.id}" data-row-idx="${rIdx}" value="${cellVal}" style="width:100%; height:32px; padding:4px 8px;" ${dis}>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    case 'file':
    case 'pdf':
    case 'imageupload':
      const allowedText = el.allowedFormats ? `Formats allowed: ${el.allowedFormats}` : '';
      const limitText = el.maxSize ? `Max size: ${el.maxSize}MB` : '';
      return `
        <div style="margin-bottom:12px; border:1px dashed var(--border-color); border-radius:8px; padding:16px; text-align:center; background:rgba(255,255,255,0.01);">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" style="margin-bottom:6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <div style="font-size:13px; font-weight:600; color:var(--text-main);">${el.label || 'Upload File'} ${reqStar}</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px; margin-bottom:8px;">${allowedText} ${allowedText && limitText ? ' | ' : ''} ${limitText}</div>
          <input type="text" class="${cls} form-input" ${attr} value="${value || ''}" placeholder="Upload file path or link..." ${dis}>
        </div>
      `;
    default:
      return `<input type="text" class="${cls} form-input" ${attr} value="${value || ''}" ${dis}>`;
  }
}

export function renderFieldInput(field, value, disabled, appId) {
  const dis = disabled ? 'disabled' : '';
  const cls = 'field-answer-input';
  const attr = `data-field-id="${field.id}"`;

  switch (field.fieldType) {
    case 'radio':
      const radioOpts = (field.options && field.options.length > 0) ? field.options : ['Yes', 'No'];
      return `
        <div class="radio-group">
          ${radioOpts.map(opt => `
            <label class="radio-label ${disabled ? 'radio-disabled' : ''}">
              <input type="radio" class="${cls}" name="radio-${field.id}" ${attr} value="${opt}" ${value === opt ? 'checked' : ''} ${dis}>
              <span class="radio-custom"></span> ${opt}
            </label>
          `).join('')}
        </div>
      `;
    case 'checkbox':
      return `
        <label class="checkbox-label">
          <input type="checkbox" class="${cls}" ${attr} ${value === 'true' || value === true ? 'checked' : ''} ${dis}>
          <span class="checkbox-custom"></span>
          Confirmed
        </label>
      `;
    case 'textarea':
      return `<textarea class="${cls} form-textarea" ${attr} rows="4" placeholder="Enter your response..." ${dis}>${value}</textarea>`;
    case 'email':
      return `<input type="email" class="${cls} form-input" ${attr} value="${value}" placeholder="email@example.com" ${dis}>`;
    case 'number':
      return `<input type="number" class="${cls} form-input" ${attr} value="${value}" placeholder="0" ${dis}>`;
    case 'date':
      return `<input type="date" class="${cls} form-input" ${attr} value="${value}" ${dis}>`;
    case 'url':
      return `<input type="url" class="${cls} form-input" ${attr} value="${value}" placeholder="https://..." ${dis}>`;
    case 'dropdown':
      const opts = (field.options || []).map(o => `<option value="${o}" ${value === o ? 'selected':''}>${o}</option>`).join('');
      return `<select class="${cls} form-input form-select" ${attr} ${dis}><option value="">Select an option</option>${opts}</select>`;
    case 'multiselect':
      const msOpts = (field.options || []);
      const selectedVals = value ? value.split(',').map(s => s.trim()) : [];
      return `
        <div class="checkbox-group" style="display:flex; flex-direction:column; gap:8px;">
          ${msOpts.map(opt => {
            const isChecked = selectedVals.includes(opt) ? 'checked' : '';
            return `
              <label class="checkbox-label" style="display:inline-flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" class="multiselect-chk" data-field-id="${field.id}" value="${opt}" ${isChecked} ${dis}>
                <span class="checkbox-custom"></span>
                ${opt}
              </label>
            `;
          }).join('')}
        </div>
      `;
    case 'mobile':
      return `<input type="tel" class="${cls} form-input" ${attr} value="${value}" placeholder="Enter 10-digit mobile number" pattern="[0-9]{10}" ${dis}>`;
    case 'richtext':
      return `<textarea class="${cls} form-textarea" ${attr} rows="6" placeholder="Enter detailed rich response..." style="font-family:inherit; min-height:120px;" ${dis}>${value}</textarea>`;
    case 'divider':
      return `<hr style="border:none;border-top:1px solid var(--border-color);margin:12px 0;">`;
    case 'heading':
      const headingText = `<h3 style="font-family:var(--font-title);font-size:16px;font-weight:700;color:var(--text-main);margin-top:10px;">${field.text || field.label}</h3>`;
      if (field.options && field.options.length > 0) {
        const headingRadioOpts = field.options;
        return `
          ${headingText}
          <div class="radio-group" style="margin-top:8px; margin-bottom:12px; display:flex; flex-wrap:wrap; gap:8px;">
            ${headingRadioOpts.map(opt => `
              <label class="radio-label ${disabled ? 'radio-disabled' : ''}" style="margin-right:12px; display:inline-flex; align-items:center; gap:6px; cursor:pointer;">
                <input type="radio" class="${cls}" name="heading-radio-${field.id}" ${attr} value="${opt}" ${value === opt ? 'checked' : ''} ${dis}>
                <span class="radio-custom"></span> ${opt}
              </label>
            `).join('')}
          </div>
        `;
      }
      return headingText;
    case 'subheading':
      return `<h4 style="font-family:var(--font-title);font-size:14px;font-weight:600;color:var(--text-main);margin-top:8px;">${field.text || field.label}</h4>`;
    case 'description':
      return `<p style="font-size:13.5px;color:var(--text-muted);line-height:1.6;margin: 4px 0;">${field.text || field.label}</p>`;
    case 'instruction':
      return `
        <div style="background:rgba(99,102,241,0.05); border-left:4px solid var(--accent-indigo); padding:10px 14px; border-radius:4px; font-size:13px; color:var(--text-muted); line-height:1.5; margin: 8px 0;">
          ${field.text || field.label}
        </div>
      `;
    case 'hyperlink':
      const linkUrl = (field.url && field.url !== '#') ? field.url : (field.label && field.label.startsWith('http') ? field.label : (field.helpText || '#'));
      return `
        <div style="margin:8px 0;">
          <a href="${linkUrl}" target="_blank" style="color:var(--accent-indigo); font-weight:600; text-decoration:underline; display:inline-flex; align-items:center; gap:6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            ${field.label || 'Click here to view reference'}
          </a>
        </div>
      `;
    case 'table':
      const tableRows = (field.options || ['Row 1', 'Row 2']);
      return `
        <div style="overflow-x:auto; margin: 8px 0;">
          <table style="width:100%; border-collapse:collapse; border:1px solid var(--border-color); font-size:13px; border-radius:8px; overflow:hidden;">
            <thead>
              <tr style="background:rgba(255,255,255,0.02);">
                <th style="padding:10px; border:1px solid var(--border-color); text-align:left; color:var(--text-muted);">Parameter / Dimension</th>
                <th style="padding:10px; border:1px solid var(--border-color); text-align:left; color:var(--text-muted);">Response Value</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows.map((rowOpt, rIdx) => {
                const rowVals = value ? value.split('|') : [];
                const rowVal = rowVals[rIdx] || '';
                return `
                  <tr>
                    <td style="padding:10px; border:1px solid var(--border-color); font-weight:500; background:rgba(255,255,255,0.01);">${rowOpt}</td>
                    <td style="padding:8px; border:1px solid var(--border-color);">
                      <input type="text" class="table-cell-input form-input" data-field-id="${field.id}" data-row-idx="${rIdx}" value="${rowVal}" style="width:100%; height:32px; padding:4px 8px;" ${dis}>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    case 'file':
    case 'pdf':
    case 'imageupload':
      return `
        <div style="font-size:12px; color:var(--text-muted); margin-bottom:4px;">Direct Question File Upload:</div>
        <input type="text" class="${cls} form-input" ${attr} value="${value}" placeholder="File link or metadata (Or use Supporting Documents section below)" ${dis}>
      `;
    default:
      return `<input type="text" class="${cls} form-input" ${attr} value="${value}" placeholder="Enter your answer..." ${dis}>`;
  }
}

export function _userFacingStatus(status) {
  const map = {
    'Under Review': 'Submitted', 'Resubmitted': 'Submitted',
    'Admin Approved': 'Submitted', 'Super Admin Review': 'Submitted',
    'Final Approved': 'Approved',
    'Additional Documents Requested': 'Docs Requested',
  };
  return map[status] || status;
}

export function _timeAgo(dateStr) {
  if (!dateStr) return 'N/A';
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  return Math.floor(hours / 24) + 'd ago';
}

export function _statusClass(status) {
  const map = {
    'Draft': 'status-draft', 'Submitted': 'status-submitted',
    'Resubmitted': 'status-submitted', 'Under Review': 'status-review',
    'Admin Approved': 'status-submitted', 'Super Admin Review': 'status-review',
    'Final Approved': 'status-approved',
    'Approved': 'status-approved', 'Rejected': 'status-rejected',
    'Additional Documents Requested': 'status-add-docs',
    'Not Started': 'status-draft'
  };
  return map[status] || 'status-draft';
}

export function _statusLabel(status) {
  const abbr = {
    'Additional Documents Requested': 'Docs Req.',
    'Under Review': 'In Review',
    'Resubmitted': 'Resubmitted',
  };
  return abbr[status] || status;
}

