/* ==========================================================================
   formEditor.js - Admin Form Schema Editor Module (3-Column Layout)
   Dynamic SRF Management Platform
   ========================================================================== */

import { showToast } from '../ui/toastManager.js';
import { showConfirm, showAlert } from '../ui/confirmDialog.js';

let activeSectionId = null;
let activeApIdx = 0;
let activeQIdx = 0;
let activeStatesList = [];

// Close dropdowns on outside click
document.addEventListener('click', (e) => {
  const dropdowns = document.querySelectorAll('.searchable-dropdown-content');
  dropdowns.forEach(dd => {
    if (!dd.classList.contains('hidden') && !dd.contains(e.target) && !dd.previousElementSibling.contains(e.target)) {
      dd.classList.add('hidden');
    }
  });
});

export function initFormEditor(container, sections, onSchemaSave, onSchemaReset, statesList = []) {
  if (!container) return;

  activeStatesList = statesList;

  // Set default active indices
  if (!activeSectionId && sections.length > 0) {
    activeSectionId = sections[0].id;
  }
  const activeSection = sections.find(s => s.id === activeSectionId) || sections[0];
  if (activeSection) {
    if (!activeSection.actionPoints) activeSection.actionPoints = [];
    if (activeApIdx >= activeSection.actionPoints.length) activeApIdx = 0;
    const ap = activeSection.actionPoints[activeApIdx];
    if (ap) {
      if (!ap.questions) ap.questions = [];
      if (activeQIdx >= ap.questions.length) activeQIdx = 0;
    }
  }

  renderEditor(container, sections, onSchemaSave, onSchemaReset);
}

function renderEditor(container, sections, onSchemaSave, onSchemaReset) {
  const panel = container;
  const activeSection = sections.find(s => s.id === activeSectionId) || sections[0];

  // 1. LEFT COLUMN: Reform Areas List
  let leftHtml = "";
  sections.forEach((sec, idx) => {
    const isActive = sec.id === activeSectionId ? "active" : "";
    const secNum = (sec.num && sec.num !== 'undefined') ? sec.num : String(idx + 1);
    const secTitle = (sec.title && sec.title !== 'undefined') ? sec.title : (sec.name || '');

    leftHtml += `
      <div class="editor-section-item ${isActive}" data-id="${sec.id}" style="padding:10px 12px; border-radius:8px; border:1px solid var(--border-color); background:var(--bg-card); cursor:pointer; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; transition: all 0.2s;">
        <div class="editor-section-info" style="flex:1; min-width: 0; margin-right: 8px;">
          <h4 style="font-family:var(--font-title); font-size:12px; font-weight:700; color:var(--accent-indigo); margin-bottom:2px;">Reform Area ${secNum}</h4>
          <input type="text" class="edit-sec-title-inline" data-id="${sec.id}" value="${secTitle}" style="font-size:11.5px; color:var(--text-muted); font-weight:600; border:none; background:transparent; width:95%; padding:2px 0;" placeholder="Enter name...">
        </div>
        <div style="display:flex; gap:4px; align-items:center; flex-shrink: 0;">
          <button class="btn btn-outline btn-xs btn-move-up-section" data-id="${sec.id}" ${idx === 0 ? 'disabled' : ''} style="padding: 2px 4px; font-size:9px;">▲</button>
          <button class="btn btn-outline btn-xs btn-move-down-section" data-id="${sec.id}" ${idx === sections.length - 1 ? 'disabled' : ''} style="padding: 2px 4px; font-size:9px;">▼</button>
          <button class="btn btn-outline btn-xs btn-delete-section" data-id="${sec.id}" style="padding: 2px 5px; color:var(--danger); border-color:rgba(220,38,38,0.25); font-size:10px; font-weight:bold;">✕</button>
        </div>
      </div>
    `;
  });

  // 2. CENTER COLUMN: Action Points List (under active Reform Area)
  let centerHtml = "";
  if (activeSection) {
    let apCardsHtml = "";
    if (activeSection.actionPoints && activeSection.actionPoints.length > 0) {
      activeSection.actionPoints.forEach((ap, apIdx) => {
        let qListHtml = "";
        if (ap.questions && ap.questions.length > 0) {
          ap.questions.forEach((q, qIdx) => {
            const isQActive = (apIdx === activeApIdx && qIdx === activeQIdx) ? "active-q" : "";
            const qNum = q.num || `${activeSection.num || activeSectionId}.${qIdx + 1}`;
            qListHtml += `
              <div class="q-list-row ${isQActive}" data-ap-idx="${apIdx}" data-q-idx="${qIdx}" style="padding:8px 10px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-card); cursor:pointer; font-size:12px; display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; transition:all 0.15s;">
                <span style="font-weight:600; color:var(--text-main); font-size:11px;">Q ${qNum}</span>
                <span style="flex:1; margin-left:8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-muted); font-size:11px;">${q.text || ''}</span>
                <span style="font-size:10px; font-weight:700; color:var(--accent-indigo); margin-left:6px;">[${q.weight || 1} M]</span>
              </div>
            `;
          });
        } else {
          qListHtml = `<p style="font-size:11px; color:var(--text-muted); text-align:center; padding:6px; border:1px dashed var(--border-color); border-radius:6px;">No Questions</p>`;
        }

        apCardsHtml += `
          <div class="ap-editor-card" style="border: 1px solid var(--border-color); border-radius:10px; padding:12px; margin-bottom:14px; background:var(--bg-card);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; gap:8px;">
              <input type="text" class="edit-ap-title form-input-sm" data-ap-idx="${apIdx}" value="${ap.title}" style="font-weight:700; font-size:12px; flex:1; height:28px; padding:2px 6px;">
              <div style="display:flex; gap:3px;">
                <button type="button" class="btn btn-outline btn-xs btn-move-up-ap" data-ap-idx="${apIdx}" ${apIdx === 0 ? 'disabled' : ''} style="padding: 2px 4px; font-size:9px;">▲</button>
                <button type="button" class="btn btn-outline btn-xs btn-move-down-ap" data-ap-idx="${apIdx}" ${apIdx === activeSection.actionPoints.length - 1 ? 'disabled' : ''} style="padding: 2px 4px; font-size:9px;">▼</button>
                <button type="button" class="btn btn-outline btn-xs btn-delete-ap" data-ap-idx="${apIdx}" style="padding:2px 5px; color:var(--danger); border-color:rgba(220,38,38,0.25); font-size:9px; font-weight:bold;">✕</button>
              </div>
            </div>
            
            <!-- No AP level assignment dropdown -->

            <div class="questions-container" data-ap-idx="${apIdx}" style="padding-left:4px; min-height:40px; border:1px solid transparent; border-radius:6px; transition:all 0.2s;">
              ${qListHtml}
            </div>
            <div style="margin-top:8px; display:flex; justify-content:flex-end;">
              <button type="button" class="btn btn-outline btn-xs btn-add-question" data-ap-idx="${apIdx}" style="font-size:10px; padding:2px 6px;">+ Add Question</button>
            </div>
          </div>
        `;
      });
    } else {
      apCardsHtml = `<div class="empty-state" style="padding:20px;"><p style="font-size:12px; color:var(--text-muted);">No Action Points. Add one below.</p></div>`;
    }

    centerHtml = `
      <div class="card glass-card" style="margin-bottom:16px;">
        <div class="card-header" style="padding:10px 14px; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
          <h2 style="font-size:13px; font-family:var(--font-title); font-weight:700; margin:0;">Area Rules & Settings</h2>
          <button id="btn-toggle-rules" class="btn btn-outline btn-xs" style="padding:2px 8px; font-size:11px;">Rules/Assignments</button>
        </div>
        <div class="card-body hidden" id="rules-collapsible-body" style="padding:14px;">
          <div class="form-group-row" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px;">
            <div class="form-group" style="margin-bottom:8px;">
              <label style="font-size:11px;">Marks</label>
              <input type="number" id="edit-sec-marks" value="${activeSection.marks || 10}" class="form-input-sm" style="height:32px;">
            </div>
            <div class="form-group" style="margin-bottom:8px;">
              <label style="font-size:11px;">Due Date</label>
              <input type="date" id="edit-sec-due" value="${activeSection.dueDate || '2026-12-31'}" class="form-input-sm" style="height:32px; font-size:11px;">
            </div>
            <div class="form-group" style="margin-bottom:8px;">
              <label style="font-size:11px;">Guidelines Page</label>
              <input type="number" id="edit-sec-page" value="${activeSection.pageNumber || activeSection.guidelinesPage || 1}" class="form-input-sm" style="height:32px;">
            </div>
          </div>
          <div class="form-group" style="margin-bottom:8px;">
            <label style="font-size:11px;">Reform Area Title</label>
            <input type="text" id="edit-sec-title" value="${(activeSection.title && activeSection.title !== 'undefined') ? activeSection.title : (activeSection.name || '')}" class="form-input-sm" style="height:32px;">
            <input type="hidden" id="edit-sec-num" value="${activeSection.num || ''}">
          </div>
          <div class="form-group" style="margin-bottom:8px;">
            <label style="font-size:11px;">Description</label>
            <textarea id="edit-sec-desc" rows="2" class="form-input-sm" style="font-size:11px; padding:6px;">${activeSection.desc || activeSection.description || ''}</textarea>
          </div>
          <!-- No Reform Area level assignment options -->
        </div>
      </div>

      <div class="card glass-card">
        <div class="card-header" style="padding:10px 14px; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
          <h2 style="font-size:13px; font-family:var(--font-title); font-weight:700; margin:0;">Action Points</h2>
          <button id="btn-add-action-point" class="btn btn-primary btn-xs">▲ Add Action Point</button>
        </div>
        <div class="card-body" style="padding:12px; max-height:calc(100vh - 280px); overflow-y:auto;">
          ${apCardsHtml}
        </div>
      </div>
    `;
  }

  // 3. RIGHT COLUMN: Question Editor
  let rightHtml = "";
  const ap = activeSection ? activeSection.actionPoints[activeApIdx] : null;
  const q = ap ? ap.questions[activeQIdx] : null;

  if (q) {
    const docsList = (q.docs || []).filter(d => !d.id.startsWith('custom_doc_')).map(d => d.name).join("\n");
    const optList = (q.options || []).join("\n");
    const isLinkEl = (q.fieldType === 'hyperlink' || q.fieldType === 'url' || q.fieldType === 'image');

    const qElements = q.elements || [];
    let droppedFieldsHtml = '';
    if (qElements.length > 0) {
      droppedFieldsHtml = qElements.map((el, elIdx) => {
        const hasOptions = ['dropdown', 'checkbox', 'radio', 'multiselect', 'table'].includes(el.type);
        const hasUrl = ['hyperlink', 'url', 'pdf', 'file', 'imageupload'].includes(el.type);
        const optionsVal = el.options ? el.options.join(', ') : '';
        return `
          <div class="dropped-field-row" style="background:var(--bg-deep); border:1px solid var(--border-color); border-radius:8px; padding:10px; position:relative; display:flex; flex-direction:column; gap:6px; transition:all 0.2s;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.04em; display:flex; align-items:center; gap:4px;">
                ${_getElementIcon(el.type)}
              </span>
              <button type="button" class="btn-remove-admin-el" data-el-id="${el.id}" style="background:transparent; border:none; color:var(--danger); font-size:12px; cursor:pointer; font-weight:bold; padding:2px 6px;" title="Remove element">✕</button>
            </div>
            
            <div style="display:grid; grid-template-columns: 1fr auto; gap:10px; align-items:center;">
              <input type="text" class="edit-admin-el-label form-input-sm" data-el-id="${el.id}" value="${el.label || ''}" placeholder="Field Label" style="height:28px; font-size:12px; padding:2px 8px; background:var(--bg-card);">
              <label style="font-size:11px; display:inline-flex; align-items:center; gap:4px; margin:0; cursor:pointer; user-select:none;">
                <input type="checkbox" class="edit-admin-el-req" data-el-id="${el.id}" ${el.required ? 'checked' : ''}>
                Required
              </label>
            </div>

            ${hasOptions ? `
              <div style="margin-top:2px;">
                <input type="text" class="edit-admin-el-options form-input-sm" data-el-id="${el.id}" value="${optionsVal}" placeholder="Options (comma-separated: e.g. Option A, Option B)" style="height:28px; font-size:11.5px; padding:2px 8px; background:var(--bg-card);">
              </div>
            ` : ''}

            ${hasUrl ? `
              <div style="margin-top:2px;">
                <input type="text" class="edit-admin-el-url form-input-sm" data-el-id="${el.id}" value="${el.url || ''}" placeholder="Link URL (e.g. https://...)" style="height:28px; font-size:11.5px; padding:2px 8px; background:var(--bg-card);">
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    } else {
      droppedFieldsHtml = `
        <div style="text-align:center; padding:16px; color:var(--text-muted); font-size:11.5px; pointer-events:none;">
          No custom elements dropped yet. Drag an element from the Toolbox below and drop here to build a multi-input question.
        </div>
      `;
    }

    rightHtml = `
      <div class="card glass-card" style="margin-bottom:16px;">
        <div class="card-header flex-header" style="padding:12px 16px;">
          <h2 style="font-size:14px; font-family:var(--font-title); font-weight:800; margin:0;">Question Editor</h2>
          <span class="role-badge" style="font-size:10px; background:rgba(99,102,241,0.06); color:var(--accent-indigo); padding:2px 8px;">ID: ${q.id}</span>
        </div>
        <div class="card-body" style="padding:16px;">
          <form id="editor-question-form">
            <div class="form-group-row" style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px;">
              <div class="form-group">
                <label>Question Number</label>
                <input type="text" class="edit-q-num form-input" value="${q.num || ''}" placeholder="e.g. 1.1">
              </div>
              <div class="form-group">
                <label>Weightage (Marks)</label>
                <input type="number" class="edit-q-weight form-input" value="${q.weight || 1}" min="1">
              </div>
            </div>

            <div class="form-group" style="margin-bottom:12px;">
              <label>${isLinkEl ? 'Link Text / Display Name (Field Name)' : 'Question Title (Label)'}</label>
              <textarea class="edit-q-text form-input" rows="2" style="font-size:13px; line-height:1.4;">${q.text || q.label || ''}</textarea>
            </div>

            ${isLinkEl ? `
              <div class="form-group" style="margin-bottom:12px;">
                <label>Link Destination URL / Source URL</label>
                <input type="text" class="edit-q-url form-input" value="${q.url || ''}" placeholder="https://example.com/guidelines.pdf" style="font-size:13px;">
              </div>
            ` : ''}

            <div class="form-group" style="margin-bottom:12px;">
              <label>Question Description / Help Text</label>
              <textarea class="edit-q-help-text form-input" rows="2" style="font-size:12px;" placeholder="DPIIT guidelines checklist or helper description...">${q.helpText || q.description || ''}</textarea>
            </div>

            <div class="form-group" style="margin-bottom:12px;">
              <label>Action Point Mapping (Static Reference)</label>
              <input type="text" class="form-input" value="${ap.title}" disabled style="background:rgba(255,255,255,0.02); cursor:not-allowed; font-size:12px;">
            </div>

            <div class="form-group-row" style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px;">
              <div class="form-group">
                <label>Field Type</label>
                <select class="edit-q-field-type form-input" style="height:38px; font-size:13px;">
                  <option value="radio" ${q.fieldType === 'radio' || !q.fieldType ? 'selected' : ''}>Yes/No Buttons (Radio)</option>
                  <option value="textbox" ${q.fieldType === 'textbox' || q.fieldType === 'text' ? 'selected' : ''}>Textbox (Short Text)</option>
                  <option value="textarea" ${q.fieldType === 'textarea' ? 'selected' : ''}>Textarea (Paragraph)</option>
                  <option value="number" ${q.fieldType === 'number' ? 'selected' : ''}>Number Input</option>
                  <option value="date" ${q.fieldType === 'date' ? 'selected' : ''}>Date Picker</option>
                  <option value="dropdown" ${q.fieldType === 'dropdown' ? 'selected' : ''}>Dropdown Selection</option>
                  <option value="checkbox" ${q.fieldType === 'checkbox' ? 'selected' : ''}>Checkbox Options</option>
                  <option value="multiselect" ${q.fieldType === 'multiselect' ? 'selected' : ''}>Multi-Select Choices</option>
                  <option value="url" ${q.fieldType === 'url' ? 'selected' : ''}>URL Field</option>
                  <option value="pdf" ${q.fieldType === 'pdf' ? 'selected' : ''}>PDF File Upload Only</option>
                  <option value="file" ${q.fieldType === 'file' ? 'selected' : ''}>Generic Document Upload</option>
                  <option value="imageupload" ${q.fieldType === 'imageupload' ? 'selected' : ''}>Image Upload Widget</option>
                  <option value="heading" ${q.fieldType === 'heading' ? 'selected' : ''}>Layout Heading Element</option>
                  <option value="subheading" ${q.fieldType === 'subheading' ? 'selected' : ''}>Layout Subheading Element</option>
                  <option value="description" ${q.fieldType === 'description' ? 'selected' : ''}>Layout Description Element</option>
                  <option value="instruction" ${q.fieldType === 'instruction' ? 'selected' : ''}>Layout Instruction Element</option>
                  <option value="hyperlink" ${q.fieldType === 'hyperlink' ? 'selected' : ''}>Layout Hyperlink Element</option>
                  <option value="table" ${q.fieldType === 'table' ? 'selected' : ''}>Dynamic Table Grid</option>
                </select>
              </div>
              <div class="form-group">
                <label>Upload Rules</label>
                <select class="edit-q-upload-req form-input" style="height:38px; font-size:13px;">
                  <option value="optional" ${q.uploadRequirement === 'optional' ? 'selected' : ''}>Optional Documents Allowed</option>
                  <option value="required" ${q.uploadRequirement === 'required' ? 'selected' : ''}>Mandatory Document Required</option>
                  <option value="none" ${q.uploadRequirement === 'none' ? 'selected' : ''}>No Documents Allowed</option>
                </select>
              </div>
            </div>

            <div class="form-group" style="margin-bottom:12px; display:flex; align-items:center; gap:8px;">
              <input type="checkbox" class="edit-q-mandatory" id="q-mandatory" ${q.mandatory !== false ? 'checked' : ''}>
              <label for="q-mandatory" style="margin-bottom:0; font-weight:600; font-size:13px; cursor:pointer;">Mandatory Input Flag</label>
            </div>

            <div class="form-group" style="margin-bottom:12px;">
              <label>Choices / Options (One per line for Dropdown/Radios/Checkboxes)</label>
              <textarea class="edit-q-options form-input" rows="2" style="font-size:12px;" placeholder="Yes&#10;No">${optList}</textarea>
            </div>

            <!-- No Question level assignment dropdown -->

            <div class="form-group" style="margin-bottom:12px;">
              <label>Required Documents (One per line)</label>
              <textarea class="edit-q-docs form-input" rows="2" style="font-size:12px;" placeholder="Circular Copy&#10;Budget Sanction Letter">${docsList}</textarea>
            </div>

            <div class="form-group-row" style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px;">
              <div class="form-group">
                <label>Mandatory Guidelines Page Reference</label>
                <input type="number" class="edit-q-page-guideline form-input" value="${q.guidelinePage || ''}" placeholder="e.g. 9">
              </div>
              <div class="form-group">
                <label>Scoring Criteria / Rules Description</label>
                <input type="text" class="edit-q-scoring-rules form-input" value="${q.scoringRules || ''}" placeholder="e.g. Absolute Score: 1 for Yes, 0 for No">
              </div>
            </div>

            <!-- Dynamic Form Fields Builder Dropzone -->
            <div class="form-group" style="margin-top:16px; margin-bottom:16px; border:1px dashed var(--border-color); border-radius:8px; padding:12px; background:rgba(255,255,255,0.01);">
              <label style="font-weight:700; color:var(--accent-indigo); margin-bottom:8px; display:flex; align-items:center; gap:6px; font-size:12.5px;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
                Dynamic Form Fields Builder
              </label>
              <p style="font-size:11px; color:var(--text-muted); margin-top:-4px; margin-bottom:12px; line-height:1.4;">Drag elements from the Toolbox below and drop them here to build a multi-input question dynamically.</p>
              
              <div class="admin-question-dropzone" style="min-height:70px; background:rgba(15,23,42,0.02); border:1px dashed var(--border-color); border-radius:8px; padding:10px; display:flex; flex-direction:column; gap:10px; transition:all 0.25s;">
                ${droppedFieldsHtml}
              </div>
            </div>

            <div class="form-group-row" style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:20px;">
              <button type="button" class="btn btn-outline btn-sm btn-duplicate-active-question">Duplicate</button>
              <button type="button" class="btn btn-outline btn-sm btn-delete-active-question" style="color:var(--danger); border-color:rgba(220,38,38,0.25);">Delete Question</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Advanced sticky Element Toolbox -->
      <div class="card glass-card" style="position:sticky; top:10px; z-index:10;">
        <div class="card-header" style="padding:10px 14px; border-bottom:1px solid var(--border-color); display:flex; align-items:center; gap:8px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
          <h2 style="font-size:12.5px; font-family:var(--font-title); font-weight:700; margin:0;">Form Element Toolbox</h2>
        </div>
        <div class="card-body" style="padding:12px; display:grid; grid-template-columns: repeat(3, 1fr); gap:6px;">
          ${_toolboxBtn('Heading', 'heading')}
          ${_toolboxBtn('Sub Heading', 'subheading')}
          ${_toolboxBtn('Description', 'description')}
          ${_toolboxBtn('Instruction', 'instruction')}
          ${_toolboxBtn('Hyperlink', 'hyperlink')}
          ${_toolboxBtn('Textbox', 'textbox')}
          ${_toolboxBtn('Textarea', 'textarea')}
          ${_toolboxBtn('Number Field', 'number')}
          ${_toolboxBtn('Email Field', 'email')}
          ${_toolboxBtn('Phone Field', 'mobile')}
          ${_toolboxBtn('Date Picker', 'date')}
          ${_toolboxBtn('Radio Button', 'radio')}
          ${_toolboxBtn('Checkbox', 'checkbox')}
          ${_toolboxBtn('Dropdown', 'dropdown')}
          ${_toolboxBtn('Multi Select', 'multiselect')}
          ${_toolboxBtn('URL Field', 'url')}
          ${_toolboxBtn('PDF Upload', 'pdf')}
          ${_toolboxBtn('File Upload', 'file')}
          ${_toolboxBtn('Image Upload', 'imageupload')}
          ${_toolboxBtn('Table Grid', 'table')}
        </div>
      </div>
    `;
  } else {
    rightHtml = `
      <div class="card glass-card">
        <div class="card-body" style="text-align:center; padding: 48px;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--border-color)" stroke-width="1.5" style="margin-bottom:12px;"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <p style="color:var(--text-muted); font-size:13px;">No question selected. Click a question card in the Center Column to open the editor.</p>
        </div>
      </div>
    `;
  }

  panel.innerHTML = `
    <div class="section-card admin-dashboard-intro" style="margin-bottom:16px;">
      <div class="section-badge admin-badge" style="background:rgba(79,70,229,0.08); color:var(--accent-indigo); border:1px solid rgba(79,70,229,0.15);">DPIIT Schema Manager</div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h1>Form Schema Editor Workspace</h1>
          <p style="font-size:13px; color:var(--text-muted); margin-bottom:0;">Configure compliance templates, documents, and rules dynamically.</p>
        </div>
        <div style="display:flex; gap:8px;">
          <button id="btn-reset-schema" class="btn btn-outline btn-sm">Reset to Default</button>
          <button id="btn-save-schema" class="btn btn-primary btn-sm">Save Framework Schema</button>
        </div>
      </div>
    </div>

    <!-- 3-Column Layout Grid -->
    <div class="editor-grid-3col" style="display:grid; grid-template-columns: 240px 330px 1fr; gap:16px; align-items:start;">
      <!-- Col 1: Reform Areas (Left) -->
      <div class="editor-sticky-col">
        <div class="card glass-card" style="margin-bottom:12px;">
          <div class="card-header" style="padding:10px 14px; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
            <h2 style="font-size:12.5px; font-family:var(--font-title); font-weight:700; margin:0;">Reform Areas</h2>
            <button id="btn-add-section-modal" class="btn btn-primary btn-xs" style="padding:2px 6px;">+ Add Area</button>
          </div>
          <div class="card-body" style="padding:10px; max-height:calc(100vh - 220px); overflow-y:auto;">
            ${leftHtml}
          </div>
        </div>
      </div>

      <!-- Col 2: Action Points & Questions (Center) -->
      <div class="editor-sticky-col">
        ${centerHtml}
      </div>

      <!-- Col 3: Question Editor (Right) -->
      <div>
        ${rightHtml}
      </div>
    </div>
  `;

  // Rules toggle button helper
  const rulesTrigger = panel.querySelector('#btn-toggle-rules');
  const rulesBody = panel.querySelector('#rules-collapsible-body');
  if (rulesTrigger && rulesBody) {
    rulesTrigger.addEventListener('click', () => {
      rulesBody.classList.toggle('hidden');
    });
  }

  // Attach event handlers
  attachEditorListeners(container, sections, onSchemaSave, onSchemaReset);
}

function _toolboxBtn(label, type) {
  return `<button type="button" class="btn btn-outline btn-xs btn-toolbox-el" draggable="true" data-type="${type}" style="font-size:10px; padding:4px; text-align:center; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:grab;" title="Drag & drop onto a question/Action Point, or click to set active question type to ${label}">${label}</button>`;
}

function attachEditorListeners(container, sections, onSchemaSave, onSchemaReset) {
  const activeSection = sections.find(s => s.id === activeSectionId) || sections[0];
  const ap = activeSection ? activeSection.actionPoints[activeApIdx] : null;
  const q = ap ? ap.questions[activeQIdx] : null;

  // Legacy dropdown listeners removed

  // 1. REFORM AREAS NAVIGATION
  container.querySelectorAll(".editor-section-item").forEach(item => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".btn-delete-section") || e.target.closest(".btn-move-up-section") || e.target.closest(".btn-move-down-section") || e.target.closest(".edit-sec-title-inline") || e.target.closest(".searchable-dropdown-container")) return;
      activeSectionId = item.getAttribute("data-id");
      activeApIdx = 0;
      activeQIdx = 0;
      renderEditor(container, sections, onSchemaSave, onSchemaReset);
    });
  });

  // Inline Reform Area title update
  container.querySelectorAll(".edit-sec-title-inline").forEach(input => {
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("input", () => {
      const secId = input.getAttribute("data-id");
      const sec = sections.find(s => s.id === secId);
      if (sec) {
        sec.title = input.value;
        sec.name = input.value;
        onSchemaSave(sections, false); // save silently
      }
    });
  });

  // Reorder Sections
  container.querySelectorAll(".btn-move-up-section").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      const idx = sections.findIndex(s => s.id === id);
      if (idx > 0) {
        const temp = sections[idx];
        sections[idx] = sections[idx - 1];
        sections[idx - 1] = temp;
        // Re-assign order indexes
        sections.forEach((s, sIdx) => { s.orderIndex = sIdx; });
        onSchemaSave(sections, false); // silent save
        renderEditor(container, sections, onSchemaSave, onSchemaReset);
      }
    });
  });

  container.querySelectorAll(".btn-move-down-section").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      const idx = sections.findIndex(s => s.id === id);
      if (idx !== -1 && idx < sections.length - 1) {
        const temp = sections[idx];
        sections[idx] = sections[idx + 1];
        sections[idx + 1] = temp;
        sections.forEach((s, sIdx) => { s.orderIndex = sIdx; });
        onSchemaSave(sections, false);
        renderEditor(container, sections, onSchemaSave, onSchemaReset);
      }
    });
  });

  // Delete Section
  container.querySelectorAll(".btn-delete-section").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const secId = btn.getAttribute("data-id");
      showConfirm({
        title: 'Delete Reform Area',
        message: 'Delete this Reform Area and all its Action Points?',
        type: 'danger', confirmText: 'Delete',
        onConfirm: () => {
          const idx = sections.findIndex(s => s.id === secId);
          if (idx !== -1) {
            sections.splice(idx, 1);
            sections.forEach((s, sIdx) => { s.orderIndex = sIdx; });
            if (activeSectionId === secId) {
              activeSectionId = sections.length > 0 ? sections[0].id : null;
              activeApIdx = 0;
              activeQIdx = 0;
            }
            onSchemaSave(sections, false);
            renderEditor(container, sections, onSchemaSave, onSchemaReset);
          }
        }
      });
    });
  });

  // 2. RULES & ASSIGNMENT SYNC (Center)
  if (activeSection) {
    const titleInput = container.querySelector("#edit-sec-title");
    const descInput = container.querySelector("#edit-sec-desc");
    const marksInput = container.querySelector("#edit-sec-marks");
    const pageInput = container.querySelector("#edit-sec-page");
    const dueInput = container.querySelector("#edit-sec-due");

    const syncSectionDetails = () => {
      if (titleInput) activeSection.title = titleInput.value;
      if (descInput) activeSection.desc = descInput.value;
      if (marksInput) activeSection.marks = parseInt(marksInput.value) || 10;
      if (pageInput) activeSection.pageNumber = parseInt(pageInput.value) || 1;
      if (dueInput) activeSection.dueDate = dueInput.value;

      onSchemaSave(sections, false); // silent save
    };

    [titleInput, descInput, marksInput, pageInput, dueInput].forEach(inp => {
      inp?.addEventListener('input', syncSectionDetails);
    });

    // AP TITLE IN-PLACE SYNC
    container.querySelectorAll(".edit-ap-title").forEach(input => {
      input.addEventListener("input", () => {
        const apIdx = parseInt(input.getAttribute("data-ap-idx"));
        activeSection.actionPoints[apIdx].title = input.value;
        onSchemaSave(sections, false);
      });
    });

    // AP assignment listeners removed

    // CLICK QUESTION TO EDIT
    container.querySelectorAll(".q-list-row").forEach(row => {
      row.addEventListener("click", () => {
        activeApIdx = parseInt(row.getAttribute("data-ap-idx"));
        activeQIdx = parseInt(row.getAttribute("data-q-idx"));
        renderEditor(container, sections, onSchemaSave, onSchemaReset);
      });
    });

    // REORDER ACTION POINTS
    container.querySelectorAll(".btn-move-up-ap").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const apIdx = parseInt(btn.getAttribute("data-ap-idx"));
        if (apIdx > 0) {
          const temp = activeSection.actionPoints[apIdx];
          activeSection.actionPoints[apIdx] = activeSection.actionPoints[apIdx - 1];
          activeSection.actionPoints[apIdx - 1] = temp;
          activeApIdx = apIdx - 1;
          activeQIdx = 0;
          onSchemaSave(sections, false);
          renderEditor(container, sections, onSchemaSave, onSchemaReset);
        }
      });
    });

    container.querySelectorAll(".btn-move-down-ap").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const apIdx = parseInt(btn.getAttribute("data-ap-idx"));
        if (apIdx < activeSection.actionPoints.length - 1) {
          const temp = activeSection.actionPoints[apIdx];
          activeSection.actionPoints[apIdx] = activeSection.actionPoints[apIdx + 1];
          activeSection.actionPoints[apIdx + 1] = temp;
          activeApIdx = apIdx + 1;
          activeQIdx = 0;
          onSchemaSave(sections, false);
          renderEditor(container, sections, onSchemaSave, onSchemaReset);
        }
      });
    });

    // DELETE ACTION POINT
    container.querySelectorAll(".btn-delete-ap").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const apIdx = parseInt(btn.getAttribute("data-ap-idx"));
        showConfirm({
          title: 'Delete Action Point',
          message: 'Delete this Action Point and all its Questions?',
          type: 'danger', confirmText: 'Delete',
          onConfirm: () => {
            activeSection.actionPoints.splice(apIdx, 1);
            activeApIdx = 0;
            activeQIdx = 0;
            onSchemaSave(sections, false);
            renderEditor(container, sections, onSchemaSave, onSchemaReset);
          }
        });
      });
    });

    // ADD ACTION POINT
    container.querySelector("#btn-add-action-point")?.addEventListener("click", () => {
      const nextApIdx = activeSection.actionPoints.length + 1;
      const apId = `ap_sec${activeSection.id.replace('sec', '')}_${nextApIdx}`;
      activeSection.actionPoints.push({
        id: apId,
        title: `Action Point ${nextApIdx}: Custom Reform Metric`,
        questions: [{
          id: `q_${apId}_1`,
          num: `${activeSection.num || '1'}.${nextApIdx}.1`,
          text: "New evaluation criteria question...",
          weight: 1,
          maxScore: 1,
          guidelinePage: 1,
          fieldType: "radio",
          uploadRequirement: "optional",
          mandatory: true,
          docs: [{ id: `doc_${apId}_1_1`, name: "Support documentation details" }]
        }]
      });
      activeApIdx = activeSection.actionPoints.length - 1;
      activeQIdx = 0;
      onSchemaSave(sections, false);
      renderEditor(container, sections, onSchemaSave, onSchemaReset);
    });

    // ADD QUESTION TO AP
    container.querySelectorAll(".btn-add-question").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const apIdx = parseInt(btn.getAttribute("data-ap-idx"));
        const targetAp = activeSection.actionPoints[apIdx];
        const nextQId = `q_${targetAp.id}_${targetAp.questions.length + 1}`;
        targetAp.questions.push({
          id: nextQId,
          num: `${activeSection.num || '1'}.${apIdx + 1}.${targetAp.questions.length + 1}`,
          text: "Enter new evaluation criteria question text...",
          weight: 1,
          maxScore: 1,
          guidelinePage: 1,
          fieldType: "radio",
          uploadRequirement: "optional",
          mandatory: true,
          docs: [{ id: `${nextQId}_doc1`, name: "Required proof document" }],
          assignment: targetAp.assignment ? { ...targetAp.assignment, users: [...(targetAp.assignment.users || [])] } : { type: 'all', users: [], startups: [], category: '', sector: '', district: '' }
        });
        activeApIdx = apIdx;
        activeQIdx = targetAp.questions.length - 1;
        onSchemaSave(sections, false);
        renderEditor(container, sections, onSchemaSave, onSchemaReset);
      });
    });
  }

  // 3. QUESTION EDITOR INPUTS SYNC (Right)
  if (q) {
    const numInput = container.querySelector(".edit-q-num");
    const textInput = container.querySelector(".edit-q-text");
    const helpInput = container.querySelector(".edit-q-help-text");
    const fieldTypeSelect = container.querySelector(".edit-q-field-type");
    const uploadReqSelect = container.querySelector(".edit-q-upload-req");
    const mandatoryChk = container.querySelector(".edit-q-mandatory");
    const optionsInput = container.querySelector(".edit-q-options");
    const docsInput = container.querySelector(".edit-q-docs");
    const weightInput = container.querySelector(".edit-q-weight");
    const guidelinePageInput = container.querySelector(".edit-q-page-guideline");
    const scoringRulesInput = container.querySelector(".edit-q-scoring-rules");
    const urlInput = container.querySelector(".edit-q-url");

    const syncQuestionDetails = () => {
      q.num = numInput.value;
      q.text = textInput.value;
      q.label = textInput.value;
      q.helpText = helpInput.value;
      q.fieldType = fieldTypeSelect.value;
      q.uploadRequirement = uploadReqSelect.value;
      q.mandatory = mandatoryChk.checked;
      q.weight = parseInt(weightInput.value) || 1;
      q.maxScore = q.weight;
      q.guidelinePage = parseInt(guidelinePageInput.value) || null;
      q.scoringRules = scoringRulesInput.value;
      if (urlInput) {
        q.url = urlInput.value.trim();
      }

      // Sync options
      const optLines = optionsInput ? optionsInput.value.split("\n").map(l => l.trim()).filter(l => l.length > 0) : [];
      q.options = optLines;

      // Sync default element type and options if it's a single default element representing the question itself
      if (q.elements && q.elements.length === 1 && (q.elements[0].id.startsWith('el_') || q.elements[0].id.startsWith('main_el_'))) {
        q.elements[0].type = q.fieldType;
        q.elements[0].label = q.text;
        q.elements[0].options = q.options;
        q.elements[0].required = q.mandatory !== false;
      }

      // Sync documents
      const docsLines = docsInput ? docsInput.value.split("\n").map(l => l.trim()).filter(l => l.length > 0) : [];
      const nonCustomDocs = (q.docs || []).filter(d => !d.id.startsWith('custom_doc_'));
      q.docs = docsLines.map((line, dIdx) => {
        const existing = nonCustomDocs[dIdx];
        return {
          id: existing ? existing.id : `${q.id}_doc${dIdx + 1}`,
          name: line
        };
      });

      onSchemaSave(sections, false); // silent save
    };

    [numInput, textInput, helpInput, optionsInput, docsInput, weightInput, guidelinePageInput, scoringRulesInput, urlInput].forEach(inp => {
      inp?.addEventListener('input', syncQuestionDetails);
    });
    // Question assignment listener removed
    
    fieldTypeSelect?.addEventListener('change', () => {
      syncQuestionDetails();
      renderEditor(container, sections, onSchemaSave, onSchemaReset);
    });
    
    uploadReqSelect?.addEventListener('change', syncQuestionDetails);
    mandatoryChk?.addEventListener('change', syncQuestionDetails);

    // DUPLICATE QUESTION
    container.querySelector(".btn-duplicate-active-question")?.addEventListener('click', () => {
      const qCopy = JSON.parse(JSON.stringify(q));
      qCopy.id = `${q.id}_copy_${Math.random().toString(36).substr(2, 4)}`;
      qCopy.num = q.num ? `${q.num}.1` : `copy`;
      ap.questions.splice(activeQIdx + 1, 0, qCopy);
      activeQIdx = activeQIdx + 1;
      onSchemaSave(sections, false);
      renderEditor(container, sections, onSchemaSave, onSchemaReset);
    });

    // DELETE QUESTION
    container.querySelector(".btn-delete-active-question")?.addEventListener('click', () => {
      showConfirm({
        title: 'Delete Question',
        message: 'Are you sure you want to delete this question?',
        type: 'danger', confirmText: 'Delete',
        onConfirm: () => {
          ap.questions.splice(activeQIdx, 1);
          activeQIdx = 0;
          onSchemaSave(sections, false);
          renderEditor(container, sections, onSchemaSave, onSchemaReset);
        }
      });
    });

    // TOOLBOX ELEMENT CLICK INJECTION
    container.querySelectorAll(".btn-toolbox-el").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const type = btn.getAttribute("data-type");
        q.fieldType = type;
        onSchemaSave(sections, false); // save silently
        renderEditor(container, sections, onSchemaSave, onSchemaReset);
        showToast(`Changed field type to: ${type.toUpperCase()}`, 'success');
      });
    });

    // Drag start for toolbox buttons
    container.querySelectorAll('.btn-toolbox-el').forEach(btn => {
      btn.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', btn.getAttribute('data-type'));
        btn.style.opacity = '0.5';
      });
      btn.addEventListener('dragend', () => {
        btn.style.opacity = '1';
      });
    });

    // Drop target for Question Editor Dropzone (to add sub-elements to the active question)
    const adminDropzone = container.querySelector('.admin-question-dropzone');
    if (adminDropzone) {
      adminDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        adminDropzone.style.border = '2px dashed var(--accent-indigo)';
        adminDropzone.style.background = 'rgba(79, 70, 229, 0.02)';
      });
      adminDropzone.addEventListener('dragleave', () => {
        adminDropzone.style.border = '1px dashed var(--border-color)';
        adminDropzone.style.background = 'rgba(255,255,255,0.01)';
      });
      adminDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        adminDropzone.style.border = '1px dashed var(--border-color)';
        adminDropzone.style.background = 'rgba(255,255,255,0.01)';
        
        const type = e.dataTransfer.getData('text/plain');
        if (!type) return;

        if (!q.elements) q.elements = [];

        const newEl = {
          id: 'custom_el_' + Date.now(),
          type: type,
          label: type.charAt(0).toUpperCase() + type.slice(1) + ' Field',
          placeholder: 'Enter your response...',
          required: false,
          options: ['dropdown', 'checkbox', 'radio', 'multiselect', 'table'].includes(type) ? ['Option 1', 'Option 2'] : undefined
        };

        q.elements.push(newEl);
        onSchemaSave(sections, false); // save silently
        renderEditor(container, sections, onSchemaSave, onSchemaReset);
        showToast(`Added ${type.toUpperCase()} element to question!`, 'success');
      });
    }

    // Label change for sub-elements
    container.querySelectorAll('.edit-admin-el-label').forEach(inp => {
      inp.addEventListener('input', () => {
        const elId = inp.getAttribute('data-el-id');
        const el = q.elements?.find(e => e.id === elId);
        if (el) {
          el.label = inp.value;
          onSchemaSave(sections, false); // save silently
        }
      });
    });

    // Required checkbox change for sub-elements
    container.querySelectorAll('.edit-admin-el-req').forEach(chk => {
      chk.addEventListener('change', () => {
        const elId = chk.getAttribute('data-el-id');
        const el = q.elements?.find(e => e.id === elId);
        if (el) {
          el.required = chk.checked;
          onSchemaSave(sections, false); // save silently
        }
      });
    });

    // Options change for sub-elements
    container.querySelectorAll('.edit-admin-el-options').forEach(inp => {
      inp.addEventListener('input', () => {
        const elId = inp.getAttribute('data-el-id');
        const el = q.elements?.find(e => e.id === elId);
        if (el) {
          el.options = inp.value.split(',').map(s => s.trim()).filter(Boolean);
          onSchemaSave(sections, false); // save silently
        }
      });
    });

    // URL change for sub-elements
    container.querySelectorAll('.edit-admin-el-url').forEach(inp => {
      inp.addEventListener('input', () => {
        const elId = inp.getAttribute('data-el-id');
        const el = q.elements?.find(e => e.id === elId);
        if (el) {
          el.url = inp.value.trim();
          onSchemaSave(sections, false); // save silently
        }
      });
    });

    // Remove sub-element click listener
    container.querySelectorAll('.btn-remove-admin-el').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const elId = btn.getAttribute('data-el-id');
        if (q.elements) {
          const updatedElements = q.elements.filter(el => el.id !== elId);
          if (updatedElements.length === 0) {
            q.elements = undefined;
          } else {
            q.elements = updatedElements;
          }
          onSchemaSave(sections, false); // save silently
          renderEditor(container, sections, onSchemaSave, onSchemaReset);
          showToast('Form element removed.', 'info');
        }
      });
    });
  }

  // 4. HEADER CONTROL BUTTONS
  // Save Schema
  container.querySelector("#btn-save-schema")?.addEventListener("click", () => {
    onSchemaSave(sections);
  });

  // Reset Schema
  container.querySelector("#btn-reset-schema")?.addEventListener("click", () => {
    showConfirm({
      title: 'Reset Schema',
      message: 'Reset the compliance framework schema to default? All custom edits will be cleared.',
      type: 'danger', confirmText: 'Reset Schema',
      onConfirm: () => onSchemaReset()
    });
  });

  // Add Section Modal Trigger (Left)
  container.querySelector("#btn-add-section-modal")?.addEventListener("click", () => {
    openCreateSectionModal(sections, onSchemaSave, onSchemaReset);
  });
}

function openCreateSectionModal(sections, onSchemaSave, onSchemaReset) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop-custom visible";
  backdrop.style.zIndex = "10000";
  
  backdrop.innerHTML = `
    <div class="modal-card-custom animate-modal-in" style="max-width: 500px; text-align: left; padding:24px;">
      <h2 style="font-family: var(--font-title); font-size:18px; font-weight:700; color:var(--text-main); margin-bottom: 16px;">Create New Reform Area</h2>
      
      <div class="form-group" style="margin-bottom:12px;">
        <label>Reform Area Title</label>
        <input type="text" id="new-sec-title" placeholder="e.g. Institutional Support" class="form-input" required>
      </div>
      
      <div class="form-group" style="margin-bottom:12px;">
        <label>Description</label>
        <textarea id="new-sec-desc" placeholder="Describe objectives..." rows="2" class="form-input" required></textarea>
      </div>

      <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px;">
        <div class="form-group">
          <label>Marks</label>
          <input type="number" id="new-sec-marks" value="10" min="1" class="form-input">
        </div>
        <div class="form-group">
          <label>Guidelines Page</label>
          <input type="number" id="new-sec-page" value="1" min="1" class="form-input">
        </div>
        <div class="form-group">
          <label>Due Date</label>
          <input type="date" id="new-sec-due" value="2026-12-31" class="form-input" style="height: 38px; font-size:12px;">
        </div>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top: 20px;">
        <button type="button" id="btn-create-sec-cancel" class="btn btn-secondary">Cancel</button>
        <button type="button" id="btn-create-sec-submit" class="btn btn-primary">Create Area</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  
  document.getElementById("btn-create-sec-cancel").addEventListener("click", () => {
    backdrop.remove();
  });
  
  document.getElementById("btn-create-sec-submit").addEventListener("click", () => {
    const titleVal = document.getElementById("new-sec-title").value.trim();
    const descVal = document.getElementById("new-sec-desc").value.trim();
    const marksVal = parseInt(document.getElementById("new-sec-marks").value) || 10;
    const pageVal = parseInt(document.getElementById("new-sec-page").value) || 1;
    const dueVal = document.getElementById("new-sec-due").value;
    
    if (!titleVal || !descVal) {
      showAlert({ title: 'Missing Fields', message: 'Please fill in Title and Description.', type: 'error' });
      return;
    }
    
    const nextSecNum = sections.length + 1;
    const randSuffix = Math.random().toString(36).substr(2, 5);
    const nextSecId = `sec_${Date.now()}_${randSuffix}`;
    
    sections.push({
      id: nextSecId,
      num: String(nextSecNum),
      title: titleVal,
      desc: descVal,
      marks: marksVal,
      pageNumber: pageVal,
      dueDate: dueVal,
      assignment: { type: 'all', users: [], startups: [], category: '', sector: '', district: '' },
      actionPoints: [{
        id: `ap_${nextSecId}_1`,
        title: `Action Point 1: Reform Area Details`,
        questions: [{
          id: `q_${nextSecId}_ap1_q1`,
          num: `${nextSecNum}.1`,
          text: `Does the state/UT meet the specified reform metric for ${titleVal}?`,
          weight: marksVal,
          guidelinePage: pageVal,
          fieldType: "radio",
          uploadRequirement: "optional",
          mandatory: true,
          docs: [{ id: `doc_${nextSecId}_ap1_q1_1`, name: "Supporting proof document" }]
        }]
      }]
    });
    
    activeSectionId = nextSecId;
    activeApIdx = 0;
    activeQIdx = 0;
    backdrop.remove();
    onSchemaSave(sections); // verbose save, triggers toast
    renderEditor(document.getElementById("workspace-schema-content") || document.getElementById("schema-editor-panel"), sections, onSchemaSave, onSchemaReset);
  });
}

function _getElementIcon(type) {
  const icons = {
    heading: 'Heading Layout',
    subheading: 'Subheading Layout',
    description: 'Description Layout',
    instruction: 'Instruction Layout',
    hyperlink: 'Hyperlink Layout',
    textbox: '📝 Textbox Input',
    textarea: '📖 Textarea Input',
    number: '🔢 Number Input',
    email: '✉️ Email Input',
    mobile: '📱 Phone Input',
    date: '📅 Date Input',
    radio: '🔘 Radio Selection',
    checkbox: '☑️ Checkbox Selection',
    dropdown: '🔽 Dropdown Selection',
    multiselect: '📋 Multi-Select Selection',
    url: '🔗 URL Input',
    pdf: '📄 PDF File Upload',
    file: '📁 Generic File Upload',
    imageupload: '🖼️ Image Upload',
    table: '📊 Table Grid'
  };
  return icons[type] || '📝 Input Field';
}

