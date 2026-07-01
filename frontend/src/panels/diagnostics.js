import { getDb, runDatabaseIntegrityCheck, repairDataIntegrity } from '../db/store.js';
import { showToast } from '../ui/toastManager.js';

export function renderDiagnosticsPanel() {
  if (document.getElementById('debug-diagnostics-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'debug-diagnostics-btn';
  btn.innerHTML = '⚙️';
  btn.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: rgba(15, 23, 42, 0.4);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #fff;
    font-size: 24px;
    cursor: pointer;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
    transition: all 0.3s ease;
  `;
  btn.onmouseover = () => {
    btn.style.transform = 'scale(1.1) rotate(45deg)';
    btn.style.background = 'rgba(79, 70, 229, 0.4)';
    btn.style.border = '1px solid rgba(255, 255, 255, 0.3)';
  };
  btn.onmouseout = () => {
    btn.style.transform = 'scale(1) rotate(0deg)';
    btn.style.background = 'rgba(15, 23, 42, 0.4)';
    btn.style.border = '1px solid rgba(255, 255, 255, 0.15)';
  };

  const panel = document.createElement('div');
  panel.id = 'debug-diagnostics-panel';
  panel.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 20px;
    width: 320px;
    max-height: 520px;
    overflow-y: auto;
    border-radius: 16px;
    background: rgba(15, 23, 42, 0.85);
    backdrop-filter: blur(15px);
    -webkit-backdrop-filter: blur(15px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #f8fafc;
    z-index: 9998;
    padding: 20px;
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.5);
    display: none;
    flex-direction: column;
    gap: 15px;
    font-family: 'Inter', sans-serif;
  `;

  btn.onclick = () => {
    if (panel.style.display === 'none' || panel.style.display === '') {
      updatePanelData();
      panel.style.display = 'flex';
      btn.style.background = 'rgba(79, 70, 229, 0.6)';
    } else {
      panel.style.display = 'none';
      btn.style.background = 'rgba(15, 23, 42, 0.4)';
    }
  };

  const updatePanelData = () => {
    const db = getDb();
    if (!db) return;

    const totalUsers = (db.users || []).length;
    const totalEditions = (db.editions || []).length;
    const totalAssignments = (db.assignments || []).length;
    const totalApplications = (db.applications || []).length;
    const submittedApplications = (db.applications || []).filter(a => 
      ['Submitted', 'Resubmitted', 'Under Review', 'Approved', 'Rejected', 'Additional Documents Requested'].includes(a.status)
    ).length;
    
    const visibilityFailures = (db.applications || []).filter(a => 
      a.status !== 'Draft' && (!a.reviewQueue || !a.visibleToAdmin || !a.visibleToSuperAdmin)
    ).length;

    const auditRes = runDatabaseIntegrityCheck();
    const auditErrorsCount = auditRes.errors ? auditRes.errors.length : 0;

    const stats = window.lastRepairStats || {
      assignmentsRepaired: 0,
      applicationsRepaired: 0,
      reviewersAssigned: 0,
      scoresCorrected: 0,
      answersReset: 0
    };

    panel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;">
        <h4 style="margin: 0; font-size: 16px; font-weight: 600; color: #818cf8; font-family: 'Inter', sans-serif;">System Diagnostics</h4>
        <span style="font-size: 10px; padding: 2px 6px; background: rgba(16, 185, 129, 0.2); color: #34d399; border-radius: 12px; font-weight: 500; font-family: 'Inter', sans-serif;">Live Backend</span>
      </div>
      
      <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12px; font-family: 'Inter', sans-serif;">
        <div style="display: flex; justify-content: space-between;"><span style="color: #94a3b8;">Total Users:</span><span style="font-weight: 600;">${totalUsers}</span></div>
        <div style="display: flex; justify-content: space-between;"><span style="color: #94a3b8;">Total Editions:</span><span style="font-weight: 600;">${totalEditions}</span></div>
        <div style="display: flex; justify-content: space-between;"><span style="color: #94a3b8;">Total Assignments:</span><span style="font-weight: 600;">${totalAssignments}</span></div>
        <div style="display: flex; justify-content: space-between;"><span style="color: #94a3b8;">Total Applications:</span><span style="font-weight: 600;">${totalApplications}</span></div>
        <div style="display: flex; justify-content: space-between;"><span style="color: #94a3b8;">Submitted Apps:</span><span style="font-weight: 600;">${submittedApplications}</span></div>
        <div style="display: flex; justify-content: space-between;"><span style="color: #94a3b8;">Visibility Failures:</span><span style="font-weight: 600; color: ${visibilityFailures > 0 ? '#ef4444' : '#34d399'};">${visibilityFailures}</span></div>
        <div style="display: flex; justify-content: space-between;"><span style="color: #94a3b8;">Audit Errors:</span><span style="font-weight: 600; color: ${auditErrorsCount > 0 ? '#f59e0b' : '#34d399'};">${auditErrorsCount}</span></div>
      </div>

      <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px; display: flex; flex-direction: column; gap: 6px; font-size: 11px; font-family: 'Inter', sans-serif;">
        <div style="font-weight: 600; color: #a5b4fc; margin-bottom: 2px;">Last Repair Stats:</div>
        <div style="display: flex; justify-content: space-between;"><span style="color: #94a3b8;">Assignments Repaired:</span><span>${stats.assignmentsRepaired}</span></div>
        <div style="display: flex; justify-content: space-between;"><span style="color: #94a3b8;">Applications Repaired:</span><span>${stats.applicationsRepaired}</span></div>
        <div style="display: flex; justify-content: space-between;"><span style="color: #94a3b8;">Reviewers Auto-assigned:</span><span>${stats.reviewersAssigned}</span></div>
        <div style="display: flex; justify-content: space-between;"><span style="color: #94a3b8;">Scores Recalculated:</span><span>${stats.scoresCorrected}</span></div>
        <div style="display: flex; justify-content: space-between;"><span style="color: #94a3b8;">Invalid Approvals Reset:</span><span>${stats.answersReset}</span></div>
      </div>

      <div style="display: flex; gap: 10px; margin-top: 5px;">
        <button id="diagnostics-btn-audit" style="flex: 1; padding: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.05); color: #fff; font-size: 11px; font-weight: 500; cursor: pointer; transition: all 0.2s;">Run Audit</button>
        <button id="diagnostics-btn-repair" style="flex: 1; padding: 8px; border-radius: 8px; border: none; background: #4f46e5; color: #fff; font-size: 11px; font-weight: 500; cursor: pointer; transition: all 0.2s;">Repair DB</button>
      </div>
    `;

    panel.querySelector('#diagnostics-btn-audit').onclick = () => {
      const res = runDatabaseIntegrityCheck();
      updatePanelData();
      if (res.valid) {
        showToast('Database integrity check passed! 0 errors found.', 'success');
      } else {
        showToast(`Audit failed! Found ${res.errors.length} violations. Check console/panel.`, 'warning');
      }
    };

    panel.querySelector('#diagnostics-btn-repair').onclick = () => {
      repairDataIntegrity();
      updatePanelData();
      showToast('Database repair operation completed successfully.', 'success');
      // Trigger dynamic refresh after repair
      if (window.refreshCurrentView) {
        window.refreshCurrentView();
      }
    };

    const auditBtn = panel.querySelector('#diagnostics-btn-audit');
    auditBtn.onmouseover = () => { auditBtn.style.background = 'rgba(255,255,255,0.1)'; };
    auditBtn.onmouseout = () => { auditBtn.style.background = 'rgba(255,255,255,0.05)'; };

    const repairBtn = panel.querySelector('#diagnostics-btn-repair');
    repairBtn.onmouseover = () => { repairBtn.style.background = '#4338ca'; };
    repairBtn.onmouseout = () => { repairBtn.style.background = '#4f46e5'; };
  };

  document.body.appendChild(btn);
  document.body.appendChild(panel);
}

