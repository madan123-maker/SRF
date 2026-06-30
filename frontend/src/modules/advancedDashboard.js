/* ==========================================================================
   advancedDashboard.js — Compliance Monitoring & Intelligence Dashboard Engine
   Dynamic SRF Management Platform — Enterprise Edition
   ========================================================================== */

import * as Store from '../db/store.js';
import { getCurrentUser, isSuperAdmin, isAdmin, getRoleInfo } from '../auth/auth.js';
import { showConfirm, showAlert, showPrompt, showFileViewer } from '../ui/confirmDialog.js';
import { showToast } from '../ui/toastManager.js';
import { NOTIFICATION_EVENTS } from '../db/schema.js';

let activeSaTab = 'submitted';
let activeAdTab = 'submitted';

// Status labels for user-friendly mapping
export function userFriendlyStatus(status) {
  const mapping = {
    'Draft': 'In Progress',
    'Submitted': 'Awaiting Review',
    'Under Review': 'Awaiting Review',
    'Approved': 'Completed Successfully',
    'Rejected': 'Needs Attention',
    'Resubmitted': 'Awaiting Review',
    'Additional Documents Requested': 'Needs Attention'
  };
  return mapping[status] || status;
}

export function userFriendlyStatusClass(status) {
  const mapping = {
    'Draft': 'status-draft',
    'Submitted': 'status-submitted',
    'Under Review': 'status-review',
    'Approved': 'status-approved',
    'Rejected': 'status-rejected',
    'Resubmitted': 'status-submitted',
    'Additional Documents Requested': 'status-add-docs'
  };
  return mapping[status] || 'status-draft';
}

// ─── RISK CALCULATIONS ──────────────────────────────────────────────────────
export function getRiskLevel(app, answers, fields) {
  // Checks compliance indicators to return Critical, High, Medium, Low risk
  if (app.status === 'Rejected') return { label: 'Critical', color: 'var(--danger)', class: 'priority-critical' };
  
  // 1. Inactive draft older than 7 days
  const updatedDate = new Date(app.updatedAt);
  const now = new Date();
  const diffDays = Math.ceil((now - updatedDate) / (1000 * 60 * 60 * 24));
  if (app.status === 'Draft' && diffDays > 7) {
    return { label: 'High', color: 'var(--warning)', class: 'priority-high' };
  }

  // 2. Missing mandatory documents
  let missingMandatoryDocs = 0;
  fields.forEach(field => {
    const ans = answers.find(a => a.fieldId === field.id);
    const hasValue = ans && ans.value && ans.value.trim() !== '';
    if (field.docs && Array.isArray(field.docs)) {
      field.docs.forEach(doc => {
        if (doc.requirement === 'mandatory') {
          const docUploaded = ans?.files?.some(f => f.docId === doc.id && f.fileStatus !== 'Rejected');
          if (hasValue && !docUploaded) {
            missingMandatoryDocs++;
          }
        }
      });
    }
  });
  if (missingMandatoryDocs > 0) {
    return { label: 'High', color: 'var(--warning)', class: 'priority-high' };
  }

  // 3. Low completion rate (under 50%) for submitted/submitted draft
  const score = Store.calculateApplicationScore(app.id) || 0;
  const maxScore = Store.calculateApplicationMaxScore(app.id) || 1;
  const pct = (score / maxScore) * 100;
  if (pct < 50 && app.status !== 'Draft') {
    return { label: 'Medium', color: 'var(--accent-purple)', class: 'priority-normal' };
  }

  return { label: 'Low', color: 'var(--text-muted)', class: 'priority-low' };
}

// ─── COMPLIANCE HEALTH SCORE ────────────────────────────────────────────────
export function getComplianceHealth(pct, hasApps = true) {
  if (!hasApps) return { label: 'No Data', class: 'health-no-data' };
  if (pct >= 80) return { label: 'Excellent', class: 'health-excellent' };
  if (pct >= 50) return { label: 'Good', class: 'health-good' };
  if (pct >= 20) return { label: 'Needs Improvement', class: 'health-needs-imp' };
  return { label: 'Critical', class: 'health-critical' };
}

// ─── PREDICTIVE COMPLETION INSIGHTS ─────────────────────────────────────────
export function getPredictiveInsight(app, answers, fields) {
  if (app.status === 'Approved') return 'Completed & Certified Successfully';
  
  // Calculate completion percentage
  const answeredCount = fields.filter(f => answers.some(a => a.fieldId === f.id && a.value && a.value.trim() !== '')).length;
  const totalCount = fields.length || 1;
  const pct = (answeredCount / totalCount) * 100;
  
  if (app.status === 'Draft') {
    if (pct > 80) return 'Highly likely to be completed within 2 days.';
    if (pct > 50) return 'On track to submit within 4 days.';
    return 'Action required: Pace needs acceleration to meet framework targets.';
  }
  if (app.status === 'Submitted' || app.status === 'Resubmitted' || app.status === 'Under Review') {
    return 'Under evaluation. Estimated review completion: 3 days.';
  }
  if (app.status === 'Additional Documents Requested') {
    return 'Awaiting required document upload for certification.';
  }
  return 'Awaiting resubmission actions.';
}

// ─── PRODUCTIVITY METRICS ──────────────────────────────────────────────────
export function calculateProductivityMetrics() {
  const db = Store.getDb();
  const apps = db.applications || [];
  
  let totalSubmitTime = 0;
  let totalReviewTime = 0;
  let submitCount = 0;
  let reviewCount = 0;
  let resubmissions = 0;

  apps.forEach(app => {
    const timeline = app.timeline || [];
    const created = timeline.find(t => t.action.includes('created') || t.action.includes('created assignment'));
    const submitted = timeline.find(t => t.action.toLowerCase().includes('submitted'));
    const reviewed = timeline.find(t => t.action.toLowerCase().includes('approved') || t.action.toLowerCase().includes('rejected'));

    if (created && submitted) {
      totalSubmitTime += (new Date(submitted.timestamp) - new Date(created.timestamp));
      submitCount++;
    }
    if (submitted && reviewed) {
      totalReviewTime += (new Date(reviewed.timestamp) - new Date(submitted.timestamp));
      reviewCount++;
    }
    
    // Count resubmissions
    resubmissions += timeline.filter(t => t.action.toLowerCase().includes('reopened') || t.action.toLowerCase().includes('resubmitted')).length;
  });

  const avgSubmitDays = submitCount ? (totalSubmitTime / (1000 * 60 * 60 * 24 * submitCount)).toFixed(1) : '2.4';
  const avgReviewDays = reviewCount ? (totalReviewTime / (1000 * 60 * 60 * 24 * reviewCount)).toFixed(1) : '1.8';
  const avgResubmissions = apps.length ? (resubmissions / apps.length).toFixed(1) : '0.5';

  return {
    avgSubmitDays,
    avgReviewDays,
    avgResubmissions
  };
}

// ─── EXPORT EXECUTIVE SUMMARY REPORT ────────────────────────────────────────
export function downloadExecutiveReport(editionId = null) {
  const db = Store.getDb();
  const selectedEditionId = editionId || (db.editions && db.editions[0]?.id);
  const edition = Store.getEditionById(selectedEditionId);
  const stats = Store.getEditionStats(selectedEditionId);
  const prod = calculateProductivityMetrics();
  
  // Build a beautiful printable report outline in HTML
  let reportHtml = `
    <html>
    <head>
      <title>SRF Executive Summary Report</title>
      <style>
        body { font-family: 'Outfit', 'Inter', sans-serif; padding: 40px; color: #0f172a; line-height: 1.6; }
        .header { text-align: center; border-bottom: 3px solid #312e81; padding-bottom: 20px; margin-bottom: 30px; }
        .header img { width: 60px; height: 60px; object-fit: contain; }
        .header h1 { margin: 8px 0 2px; font-size: 24px; color: #312e81; text-transform: uppercase; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 30px; }
        .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .card h3 { margin-top: 0; color: #312e81; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; font-size: 16px; }
        .metric-val { font-size: 22px; font-weight: bold; color: #6366f1; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
        th { background: #f8fafc; border-bottom: 2px solid #cbd5e1; text-align: left; padding: 8px; font-weight: bold; }
        td { border-bottom: 1px solid #f1f5f9; padding: 8px; }
        .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 15px; }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="/ap_emblem.svg" alt="Govt Emblem">
        <h1>SRF Executive Compliance Summary</h1>
        <p style="margin:4px 0 0; font-size:13px; color:#475569;">Generated on ${new Date().toLocaleDateString('en-IN')} | Framework Edition: ${edition?.name || 'All Editions'}</p>
      </div>

      <div class="grid">
        <div class="card">
          <h3>Framework Performance Statistics</h3>
          <p>Total Assignments: <strong>${stats.total}</strong></p>
          <p>Completed Applications: <span class="metric-val">${stats.approved}</span></p>
          <p>Pending Evaluations: <strong>${stats.submitted + stats.underReview}</strong></p>
          <p>Rejections / Resubmissions: <strong>${stats.rejected}</strong></p>
          <p>Average Compliance Score: <span class="metric-val" style="color:#10b981">${stats.avgScore}%</span></p>
        </div>
        <div class="card">
          <h3>Operational Productivity Metrics</h3>
          <p>Avg. Days to Prepare & Submit: <strong>${prod.avgSubmitDays} Days</strong></p>
          <p>Avg. Evaluation Turnaround: <strong>${prod.avgReviewDays} Days</strong></p>
          <p>Avg. Resubmission Cycles: <strong>${prod.avgResubmissions}</strong></p>
          <p>Overall District Participation: <strong>100% Active</strong></p>
        </div>
      </div>

      <div class="card" style="margin-bottom: 30px;">
        <h3>District Rankings & Compliance Health</h3>
        <table>
          <thead>
            <tr>
              <th>District Name</th>
              <th>State</th>
              <th>Applications</th>
              <th>Approved Rate</th>
              <th>Compliance Score</th>
              <th>Health Status</th>
            </tr>
          </thead>
          <tbody>
            ${(db.users || []).filter(u => u.role === 'user').map(u => {
              const uApps = (db.applications || []).filter(ap => ap.userId === u.id);
              const appCount = uApps.length;
              const approvedCount = uApps.filter(ap => ap.status === 'Approved').length;
              const appRate = appCount ? ((approvedCount / appCount) * 100).toFixed(0) : '0';
              
              let pctSum = 0;
              uApps.forEach(ap => {
                const s = Store.calculateApplicationScore(ap.id) || 0;
                const m = Store.calculateApplicationMaxScore(ap.id) || 1;
                pctSum += (s / m) * 100;
              });
              const avgPct = appCount ? (pctSum / appCount) : 0;
              const health = getComplianceHealth(avgPct, appCount > 0);
              
              let healthColor = '#64748b';
              if (health.label === 'Excellent') healthColor = '#10b981';
              else if (health.label === 'Good') healthColor = '#0ea5e9';
              else if (health.label === 'Needs Improvement') healthColor = '#f59e0b';
              else if (health.label === 'Critical') healthColor = '#f43f5e';
              
              return `
                <tr>
                  <td><strong>${u.district || 'General'}</strong></td>
                  <td>${u.state || '—'}</td>
                  <td>${appCount}</td>
                  <td>${appRate}%</td>
                  <td><strong>${avgPct.toFixed(1)}%</strong></td>
                  <td><span style="font-weight:bold; color:${healthColor}">${health.label}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div class="footer">
        <p>This report is classified as OFFICIAL USE ONLY. Powered by the State Startup Ranking Framework (SRF) Intelligence Platform.</p>
      </div>
    </body>
    </html>
  `;

  const reportWindow = window.open('', '_blank');
  if (reportWindow) {
    reportWindow.document.write(reportHtml);
    reportWindow.document.close();
    setTimeout(() => {
      reportWindow.print();
    }, 500);
  } else {
    showToast('Please allow popups to print report', 'warning');
  }
}

// Helper to render circular progress ring SVG
function createProgressRingHtml(percentage, size = 52, strokeWidth = 5, color = 'var(--accent-indigo)') {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(Math.max(percentage, 0), 100) / 100) * circumference;
  return `
    <div class="progress-ring-container" style="width: ${size}px; height: ${size}px;">
      <svg width="${size}" height="${size}">
        <circle class="progress-ring-track" stroke="rgba(226,232,240,0.12)" stroke-width="${strokeWidth}" fill="transparent" r="${radius}" cx="${size/2}" cy="${size/2}"/>
        <circle class="progress-ring-circle" stroke="${color}" stroke-width="${strokeWidth}" fill="transparent" r="${radius}" cx="${size/2}" cy="${size/2}"
                stroke-dasharray="${circumference} ${circumference}" stroke-dashoffset="${offset}"/>
      </svg>
      <span class="progress-ring-text">${percentage}%</span>
    </div>
  `;
}

// Helper to render semi-circular compliance health gauge SVG
function createGaugeHtml(percentage, labelText = 'Compliance Completeness') {
  const size = 150;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * Math.PI;
  const offset = circumference - (Math.min(Math.max(percentage, 0), 100) / 100) * circumference;
  let color = 'var(--accent-indigo)';
  if (percentage >= 80) color = 'var(--success)';
  else if (percentage >= 60) color = 'var(--accent-blue)';
  else if (percentage >= 40) color = 'var(--warning)';
  else color = 'var(--danger)';

  return `
    <div class="gauge-container" style="padding-top: 15px;">
      <svg width="${size}" height="${size/2 + 10}">
        <path d="M ${strokeWidth/2 + 5} ${size/2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth/2 - 5} ${size/2}" stroke="rgba(226, 232, 240, 0.12)" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round"/>
        <path d="M ${strokeWidth/2 + 5} ${size/2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth/2 - 5} ${size/2}" stroke="${color}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round"
              stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"/>
      </svg>
      <span class="gauge-label" style="transform: translateY(-8px);">${percentage}%</span>
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; text-align: center;">${labelText}</div>
    </div>
  `;
}

export function renderUserDashboardEnhanced(container) {
  const user = getCurrentUser();
  const db = Store.getDb();
  const formatTimelineDate = (timestamp) => {
    const d = new Date(timestamp);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12;
    
    return `${day}/${month}/${year}, ${hours}:${minutes} ${ampm}`;
  };
  if (!db) {
    container.innerHTML = `
      <style>
        @keyframes skeleton-glow {
          0% { opacity: 0.35; }
          50% { opacity: 0.7; }
          100% { opacity: 0.35; }
        }
        .skeleton-block {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          border: 1px solid var(--border-color);
          animation: skeleton-glow 1.5s infinite ease-in-out;
        }
      </style>
      <div class="dashboard-skeleton" style="padding: 10px; display: flex; flex-direction: column; gap: 24px;">
        <!-- Header Skeleton -->
        <div class="skeleton-block" style="height: 120px; width: 100%;"></div>
        
        <!-- KPI Cards Skeleton -->
        <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 16px;">
          <div class="skeleton-block" style="height: 90px;"></div>
          <div class="skeleton-block" style="height: 90px; animation-delay: 0.1s;"></div>
          <div class="skeleton-block" style="height: 90px; animation-delay: 0.2s;"></div>
          <div class="skeleton-block" style="height: 90px; animation-delay: 0.3s;"></div>
          <div class="skeleton-block" style="height: 90px; animation-delay: 0.4s;"></div>
        </div>
        
        <!-- Analytics Grid Skeleton -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;">
          <div class="skeleton-block" style="height: 250px;"></div>
          <div class="skeleton-block" style="height: 250px; animation-delay: 0.2s;"></div>
          <div class="skeleton-block" style="height: 250px; animation-delay: 0.4s;"></div>
        </div>
      </div>
    `;
    return;
  }

  const apps = Store.getApplicationsByUser(user.id);
  const unread = Store.getUnreadCount(user.id);
  const rawUserAssignments = Store.getAssignments ? Store.getAssignments(user.id) : [];
  const userAssignments = rawUserAssignments.filter(a => {
    const ed = Store.getEditionById(a.editionId);
    return ed && !ed.isDeleted && ed.status !== 'archived';
  });

  const uniqueAssignedEditionIds = [...new Set(userAssignments.map(a => a.editionId))];
  const totalAssigned = uniqueAssignedEditionIds.length;

  // Onboarding Empty State Check (U12)
  if (apps.length === 0 && totalAssigned === 0) {
    container.innerHTML = `
      <div class="section-card" style="margin-bottom:24px;">
        <div class="section-badge" style="background:rgba(79,70,229,0.08);color:var(--accent-indigo);border:1px solid rgba(79,70,229,0.15);">Getting Started</div>
        <h1>Welcome to SRF Compliance Portal</h1>
        <p style="color:var(--text-muted);font-size:14px;">Let's get your compliance dashboard set up.</p>
      </div>

      <div class="onboarding-get-started-panel">
        <div class="onboarding-content">
          <h2>Welcome to your compliance Journey!</h2>
          <p>It looks like you don't have any assigned tasks or compliance folders yet. As a Nodal Officer, you will use this workspace to submit rankings, answer frameworks, and upload evidence.</p>
          <div class="onboarding-steps" style="margin-bottom:20px;">
            <div class="onboarding-step-item">
              <span class="onboarding-step-number">1</span>
              <div><strong>Profile Setup:</strong> Check your department and category details under "My Profile".</div>
            </div>
            <div class="onboarding-step-item" style="margin-top:10px;">
              <span class="onboarding-step-number">2</span>
              <div><strong>Explore Frameworks:</strong> View assignments when DPIIT administrators allocate sections to your cell.</div>
            </div>
            <div class="onboarding-step-item" style="margin-top:10px;">
              <span class="onboarding-step-number">3</span>
              <div><strong>Build Submissions:</strong> Respond to questions and track compliance workflow timelines.</div>
            </div>
          </div>
          <div class="onboarding-button-group">
            <button class="btn btn-primary btn-sm" id="btn-onboarding-profile">Check My Profile</button>
          </div>
        </div>
        <div class="onboarding-illustration">
          <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4"/>
            <path d="M12 8h.01"/>
          </svg>
        </div>
      </div>
    `;
    container.querySelector('#btn-onboarding-profile').addEventListener('click', () => {
      window.switchUserTab('profile');
    });
    return;
  }

  // Calculate statistics (Component 1)
  const draftApps = apps.filter(a => a.status === 'Draft');
  const submittedApps = apps.filter(a => ['Submitted', 'Resubmitted', 'Under Review'].includes(a.status));
  const approvedApps = apps.filter(a => a.status === 'Approved');
  const rejectedApps = apps.filter(a => a.status === 'Rejected');
  const docsReqApps = apps.filter(a => a.status === 'Additional Documents Requested');
  const notStartedVal = Store.getNotStartedCount ? Store.getNotStartedCount(user.id) : 0;
  const inProgressVal = draftApps.length + docsReqApps.length;

  // Aliases used by Chart.js doughnut dataset
  const approvedCount = approvedApps.length;
  const underReviewCount = submittedApps.length;
  const draftCount = draftApps.length;
  const rejectedCount = rejectedApps.length;

  let totalScoreSum = 0;
  let totalMaxScoreSum = 0;
  let answeredCount = 0;
  let pendingCount = 0;
  let docsCount = 0;
  let requestedDocsCount = 0;

  apps.forEach(ap => {
    totalScoreSum += Store.calculateApplicationScore(ap.id) || 0;
    totalMaxScoreSum += Store.calculateApplicationMaxScore(ap.id) || 1;

    const answers = Store.getAnswersByApplication(ap.id);
    const fields = Store.getFieldsByEdition(ap.editionId);
    
    fields.forEach(f => {
      if (f.isLayoutElement) return;
      const ans = answers.find(x => x.fieldId === f.id);
      if (ans && ans.value && ans.value.trim() !== '') {
        answeredCount++;
        if (ans.files && Array.isArray(ans.files)) {
          docsCount += ans.files.length;
        }
      } else {
        pendingCount++;
      }
      if (ans?.questionStatus === 'Additional Documents Requested') {
        requestedDocsCount++;
      }
    });
  });

  const completionPercent = totalMaxScoreSum ? Math.round((totalScoreSum / totalMaxScoreSum) * 100) : 0;

  // Deduplicate user assignments to ensure each task is shown only once
  const uniqueAssignments = [];
  const assignmentKeys = new Set();
  for (const a of userAssignments) {
    const edition = Store.getEditionById(a.editionId);
    if (!edition || edition.isDeleted) continue;

    const existingApp = apps.find(app => app.editionId === a.editionId);
    if (existingApp && existingApp.status !== 'Draft') continue;

    const key = `${a.editionId}_${a.sectionId || a.reformAreaId || ''}_${a.type || 'General'}_${a.responsibility || a.title || ''}`;
    if (!assignmentKeys.has(key)) {
      assignmentKeys.add(key);
      uniqueAssignments.push(a);
    }
  }

  // Total editions in the system (dynamic, from DB)
  const totalEditions = (Store.getEditions ? Store.getEditions() : []).filter(e => !e.isDeleted && e.status !== 'archived').length;

  const submittedTasks = apps.filter(a => ['Submitted', 'Resubmitted', 'Under Review', 'Admin Approved', 'Super Admin Review', 'Final Approved'].includes(a.status));
  const pendingActionsCount = draftApps.length + docsReqApps.length;

  // Row 1: Executive KPI Cards — 6 cards matching spec
  const kpis = [
    { label: 'Assigned Editions',       val: userAssignments.length,    desc: 'Editions assigned to your department.',    class: 'blue',   tab: 'assigned-editions', icon: '⚡' },
    { label: 'Draft Applications',       val: draftApps.length,         desc: 'Active drafts awaiting submission.',         class: 'gray',   tab: 'drafts',            icon: '📝' },
    { label: 'Submitted Applications',   val: submittedTasks.length,    desc: 'Submitted and under admin review.',          class: 'blue',   tab: 'explore',           icon: '📤' },
    { label: 'Approved',                 val: approvedApps.length,      desc: 'Applications approved and certified.',       class: 'green',  tab: 'approved',          icon: '✅' },
    { label: 'Rejected',                 val: rejectedApps.length,      desc: 'Applications that were rejected.',           class: 'red',    tab: 'rejected',          icon: '❌' },
    { label: 'Pending Actions',          val: pendingActionsCount,      desc: 'Drafts + docs requested needing attention.', class: 'orange', tab: 'explore',           icon: '⚠️' },
  ];

  const kpisHtml = `
    <div class="dashboard-kpi-grid" style="grid-template-columns: repeat(3, 1fr);">
      ${kpis.map(k => `
        <div class="glass-card glass-card-enhanced status-border-${k.class}" data-tab="${k.tab}" style="padding: 16px; cursor: pointer;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span class="status-badge status-badge-${k.class}" style="font-size:10px; font-weight:700; padding:2px 8px; border-radius:99px; text-transform:uppercase;">${k.label}</span>
            <span style="font-size: 16px;">${k.icon}</span>
          </div>
          <div style="font-size: 26px; font-weight: 800; color: var(--text-main); margin-bottom: 4px;">${k.val}</div>
          <div style="font-size: 11.5px; color: var(--text-muted);">${k.desc}</div>
        </div>
      `).join('')}
    </div>
  `;

  // Row 2: Analytics Grid (3 columns, empty verification)
  const hasAnalyticsData = apps.length > 0;
  const analyticsHtml = `
    <div class="dashboard-grid-12" style="margin-bottom: 24px;">
      <div class="col-span-4 glass-card glass-card-enhanced" style="padding: 20px;">
        <h3 style="font-family: var(--font-title); font-size: 14.5px; font-weight: 700; margin-bottom: 12px; display:flex; justify-content:space-between;">
          <span>📊 Status Distribution</span>
        </h3>
        <div style="position: relative; height: 210px; width: 100%; display: flex; align-items: center; justify-content: center;">
          ${hasAnalyticsData ? `
            <canvas id="user-status-doughnut-chart"></canvas>
            <div class="chart-skeleton" style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(255,255,255,0.03); border-radius: 8px; pointer-events: none; animation: skeleton-glow 1.5s infinite ease-in-out;">
              <div style="width: 80px; height: 80px; border-radius: 50%; border: 6px solid rgba(255,255,255,0.05); border-top-color: var(--accent-indigo); animation: spin 1s linear infinite;"></div>
              <span style="font-size:11px; color:var(--text-muted); margin-top:12px;">Loading statuses...</span>
            </div>
          ` : `<span style="font-size:13px; color:var(--text-muted);">No analytics data available yet.</span>`}
        </div>
      </div>
      
      <div class="col-span-4 glass-card glass-card-enhanced" style="padding: 20px;">
        <h3 style="font-family: var(--font-title); font-size: 14.5px; font-weight: 700; margin-bottom: 12px;">
          <span>📈 Progress Trends (12 Months)</span>
        </h3>
        <div style="position: relative; height: 210px; width: 100%; display: flex; align-items: center; justify-content: center;">
          ${hasAnalyticsData ? `
            <canvas id="user-progress-line-chart"></canvas>
            <div class="chart-skeleton" style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(255,255,255,0.03); border-radius: 8px; pointer-events: none; animation: skeleton-glow 1.5s infinite ease-in-out;">
              <div style="width: 80%; height: 60px; background: rgba(255,255,255,0.05); border-radius: 4px;"></div>
              <span style="font-size:11px; color:var(--text-muted); margin-top:12px;">Loading trends...</span>
            </div>
          ` : `<span style="font-size:13px; color:var(--text-muted);">No analytics data available yet.</span>`}
        </div>
      </div>

      <div class="col-span-4 glass-card glass-card-enhanced" style="padding: 20px;">
        <h3 style="font-family: var(--font-title); font-size: 14.5px; font-weight: 700; margin-bottom: 12px;">
          <span>🏆 Score Distribution (%)</span>
        </h3>
        <div style="position: relative; height: 210px; width: 100%; display: flex; align-items: center; justify-content: center;">
          ${hasAnalyticsData ? `
            <canvas id="user-score-bar-chart"></canvas>
            <div class="chart-skeleton" style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(255,255,255,0.03); border-radius: 8px; pointer-events: none; animation: skeleton-glow 1.5s infinite ease-in-out;">
              <div style="display: flex; gap: 8px; width: 80%; height: 80px; align-items: flex-end;">
                <div style="flex:1; height:40%; background:rgba(255,255,255,0.05); border-radius: 2px;"></div>
                <div style="flex:1; height:70%; background:rgba(255,255,255,0.05); border-radius: 2px;"></div>
                <div style="flex:1; height:50%; background:rgba(255,255,255,0.05); border-radius: 2px;"></div>
                <div style="flex:1; height:90%; background:rgba(255,255,255,0.05); border-radius: 2px;"></div>
              </div>
              <span style="font-size:11px; color:var(--text-muted); margin-top:12px;">Loading scores...</span>
            </div>
          ` : `<span style="font-size:13px; color:var(--text-muted);">No analytics data available yet.</span>`}
        </div>
      </div>
    </div>
  `;

  // Row 3: Active Workspace Grid & Sidebar widgets
  // Active assignments cards list
  const activeFolders = apps.filter(ap => ['Draft', 'Additional Documents Requested'].includes(ap.status));
  let folderCardsHtml = '';
  if (activeFolders.length === 0) {
    folderCardsHtml = `
      <div class="empty-state" style="padding: 30px; text-align: center; border: 1px dashed var(--border-color); border-radius: 12px;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border-color)" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <h4 style="font-size: 14px; font-weight: 700; margin-top: 10px;">No active compliance folders</h4>
        <p style="font-size: 12.5px; color: var(--text-muted); margin-bottom: 12px;">Start your first assigned framework submission to begin.</p>
        <button class="btn btn-xs btn-primary btn-explore-dash">Explore Assignments</button>
      </div>
    `;
  } else {
    folderCardsHtml = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        ${activeFolders.map(ap => {
          const ed = Store.getEditionById(ap.editionId);
          const score = Store.calculateApplicationScore(ap.id) || 0;
          const maxScore = Store.calculateApplicationMaxScore(ap.id) || 1;
          const pct = Math.round((score / maxScore) * 100);
          
          let statusCls = 'blue';
          if (ap.status === 'Draft') statusCls = 'orange';
          else if (ap.status === 'Additional Documents Requested') statusCls = 'yellow';
          
          // Days remaining calculation
          let daysText = 'No deadline';
          let countdownBadge = '';
          if (ed?.endDate) {
            const diff = new Date(ed.endDate) - new Date();
            const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
            if (days > 10) {
              daysText = `⏰ ${days} Days Left`;
              countdownBadge = `<span class="status-badge status-badge-green" style="font-size:9px; font-weight:700; padding:2px 6px;">${days} days left</span>`;
            } else if (days > 0) {
              daysText = `⏰ Ending Soon (${days}d)`;
              countdownBadge = `<span class="status-badge status-badge-orange" style="font-size:9px; font-weight:700; padding:2px 6px; border:1px solid rgba(249,115,22,0.3); background:rgba(249,115,22,0.1); color:var(--warning);">${days} days left</span>`;
            } else {
              daysText = `⏰ Deadline Passed`;
              countdownBadge = `<span class="status-badge status-badge-red" style="font-size:9px; font-weight:700; padding:2px 6px;">Overdue</span>`;
            }
          } else {
            countdownBadge = `<span class="status-badge status-badge-blue" style="font-size:9px; font-weight:700; padding:2px 6px;">Ongoing</span>`;
          }

          // Resolve reviewer name
          const revName = ap.reviewerComments ? 'Assigned Evaluator' : 'Under Review';

          return `
            <div class="glass-card glass-card-enhanced status-border-${statusCls}" style="padding: 16px; display:flex; flex-direction:column; justify-content:space-between; position: relative;">
              <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 8px; gap: 8px;">
                  <h4 style="font-size:14px; font-weight:700; margin:0; color:var(--text-main); line-height: 1.3;">${ed?.name || 'Startup Edition'}</h4>
                  <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px; flex-shrink:0;">
                    <span class="status-badge status-badge-${statusCls}" style="font-size:9px; font-weight:700; text-transform:uppercase; padding: 2px 6px;">${ap.status}</span>
                    ${countdownBadge}
                  </div>
                </div>
                <div style="font-size: 11px; color: var(--text-muted); margin-bottom:12px;">
                  Category: <strong>${ap.category}</strong> | FY: <strong>${ed?.version || ed?.name || ''}</strong>
                </div>
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 14px;">
                  ${createProgressRingHtml(pct, 44, 4, statusCls === 'orange' ? 'var(--accent-indigo)' : 'var(--warning)')}
                  <div>
                    <span style="font-size:11.5px; color:var(--text-muted); display:block;">Current Score</span>
                    <strong style="font-size:14px; color:var(--text-main);">${score} / ${maxScore}</strong>
                  </div>
                </div>
              </div>
              <div style="border-top: 1px dashed var(--border-color); padding-top: 12px; margin-top: auto; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:11px; color:var(--text-muted); font-weight:600; display:flex; align-items:center; gap:4px;">${daysText}</span>
                <button class="btn btn-xs btn-primary btn-open-folder" data-id="${ap.id}">
                  ${ap.status === 'Draft' ? '✏️ Edit Draft' : '📎 Upload Docs'}
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // Smart Quick Actions (Component 6)
  const quickActions = [];
  if (draftApps.length > 0) {
    quickActions.push({ label: '📝 Continue Active Draft', id: draftApps[0].id, type: 'edit' });
  }
  if (docsReqApps.length > 0) {
    quickActions.push({ label: '📎 Upload Requested Docs', id: docsReqApps[0].id, type: 'workspace' });
  }
  if (totalAssigned > 0) {
    quickActions.push({ label: '🚀 Start New Framework', type: 'explore' });
  }
  if (unread > 0) {
    quickActions.push({ label: '🔔 View Unread Alerts', type: 'notifications' });
  }
  quickActions.push({ label: '⚙ Update Profile Password', type: 'profile' });

  // Activity Feed chronological list (Component 7)
  const timelineEvents = [];
  apps.forEach(ap => {
    const ed = Store.getEditionById(ap.editionId);
    (ap.timeline || []).forEach(evt => {
      timelineEvents.push({
        appId: ap.id,
        editionName: ed?.name || 'Framework',
        action: evt.action,
        timestamp: evt.timestamp,
        by: evt.by,
        remarks: evt.remarks || ''
      });
    });
  });
  // Sort timelineEvents descending by date
  timelineEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const activityFeedHtml = `
    <div class="glass-card glass-card-enhanced" style="padding: 20px 24px; margin-bottom: 24px;">
      <h3 style="font-family: var(--font-title); font-size: 14px; font-weight: 700; margin-bottom:12px;">📊 User Activity Feed</h3>
      <div class="activity-feed-list">
        ${timelineEvents.length === 0 ? `
          <span style="font-size: 12px; color: var(--text-muted); text-align: center; display: block; padding: 10px 0;">No activities recorded.</span>
        ` : timelineEvents.slice(0, 8).map(evt => {
          let iconHtml = '';
          if (evt.action.toLowerCase().includes('approved')) {
            iconHtml = `
              <div class="activity-feed-icon-container approved" style="background:#e6f4ea; color:#137333; border: 1px solid #ceead6; width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
            `;
          } else if (evt.action.toLowerCase().includes('rejected')) {
            iconHtml = `
              <div class="activity-feed-icon-container rejected" style="background:#fce8e6; color:#c5221f; border: 1px solid #fad2cf; width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </div>
            `;
          } else if (evt.action.toLowerCase().includes('submitted')) {
            iconHtml = `
              <div class="activity-feed-icon-container submitted" style="background:#e8f0fe; color:#1a73e8; border: 1px solid #d2e3fc; width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="16 16 12 12 8 16"></polyline>
                  <line x1="12" y1="12" x2="12" y2="21"></line>
                  <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path>
                </svg>
              </div>
            `;
          } else if (evt.action.toLowerCase().includes('docs')) {
            iconHtml = `
              <div class="activity-feed-icon-container docs" style="background:#fef7e0; color:#b06000; border: 1px solid #feecb5; width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                </svg>
              </div>
            `;
          } else {
            iconHtml = `
              <div class="activity-feed-icon-container default" style="background:var(--bg-deep); color:var(--text-muted); border: 1px solid var(--border-color); width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
              </div>
            `;
          }
          
          return `
            <div class="activity-feed-item btn-timeline-deep-link" data-app-id="${evt.appId}">
              ${iconHtml}
              <div class="activity-feed-details">
                <div class="activity-feed-title">${evt.action} - <strong>${evt.editionName}</strong></div>
                <div class="activity-feed-meta">
                  <span style="display:flex; align-items:center;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>${evt.by}</span>
                  <span style="display:flex; align-items:center;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${formatTimelineDate(evt.timestamp)}</span>
                </div>
                ${evt.remarks ? `<div class="activity-feed-remarks">Note: "${evt.remarks}"</div>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  const lastSyncStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Assembling entire dashboard grid (12 columns)
  container.innerHTML = `
    <!-- Header Block -->
    <div class="dashboard-header-card" style="margin-bottom: 24px; padding: 32px 40px; background: linear-gradient(135deg, var(--accent-indigo) 0%, var(--accent-purple) 100%); border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(99,102,241,0.25), 0 8px 10px -6px rgba(99,102,241,0.25); color: #fff; position: relative; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
      <div style="position: absolute; right: -50px; top: -50px; width: 250px; height: 250px; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 70%); pointer-events: none;"></div>
      <div style="position: absolute; left: -50px; bottom: -50px; width: 250px; height: 250px; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 70%); pointer-events: none;"></div>

      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:24px; position:relative; z-index:1;">
        <div style="flex: 1; min-width: 280px;">
          <h1 style="margin:0 0 10px; color:#fff; font-size:28px; font-weight: 800; font-family: var(--font-title); letter-spacing: -0.02em;">Welcome back, ${user.name || user.username}!</h1>
          <p style="color:rgba(255,255,255,0.9); font-size:14px; margin:0 0 16px; line-height: 1.5; font-weight: 500;">
            District: <strong style="color:#fff;">${user.district || 'State General'}</strong> <span style="margin: 0 8px; color: rgba(255,255,255,0.45);">|</span> Department: <strong style="color:#fff;">${user.organization || 'Startup India'}</strong>
          </p>
          <div style="font-size: 12px; color: rgba(255,255,255,0.75); display:flex; align-items:center; gap:6px; background: rgba(0,0,0,0.12); padding: 6px 14px; border-radius: 20px; width: fit-content; border: 1px solid rgba(255,255,255,0.05);">
            <span>⏱️ Last portal update: Today at ${lastSyncStr}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Row 1: KPI Cards -->
    ${kpisHtml}

    <!-- Row 2: Analytics Charts -->
    ${analyticsHtml}

    <!-- Row 3: Active Workspace Grid & Sidebar widgets -->
    <div class="dashboard-layout-row">
      <div class="dashboard-layout-col-main">
        <div class="glass-card glass-card-enhanced" style="padding: 20px; margin-bottom: 24px;">
          <h3 style="font-family: var(--font-title); font-size: 14.5px; font-weight: 700; margin-bottom: 16px; display:flex; justify-content:space-between; align-items:center;">
            <span>📂 Active Compliance Folders</span>
            <span style="font-size: 11.5px; font-weight:normal; color:var(--text-muted);">Editions you are actively submitting</span>
          </h3>
          ${folderCardsHtml}
        </div>
        
        ${activityFeedHtml}
      </div>
      
      <div class="dashboard-layout-col-side">
        <!-- Quick Actions Panel -->
        <div class="glass-card glass-card-enhanced" style="padding: 20px; margin-bottom: 24px;">
          <h3 style="font-family: var(--font-title); font-size: 14.5px; font-weight: 700; margin-bottom: 16px;">⚙️ Quick Actions</h3>
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${quickActions.map(act => `
              <button class="btn btn-outline btn-block btn-quick-act" data-type="${act.type}" ${act.id ? `data-id="${act.id}"` : ''} style="text-align:left; justify-content:flex-start; padding: 10px 14px; font-size: 13px;">
                ${act.label}
              </button>
            `).join('')}
          </div>
        </div>
        
        <!-- Helpful Tips/Resources -->
        <div class="glass-card glass-card-enhanced" style="padding: 20px; background: linear-gradient(135deg, rgba(79,70,229,0.05) 0%, rgba(124,58,237,0.05) 100%); border: 1px solid rgba(79,70,229,0.1);">
          <h4 style="font-size: 13.5px; font-weight: 700; color: var(--accent-indigo); margin-bottom: 8px;">💡 Nodal Officer Tips</h4>
          <ul style="font-size: 12px; color: var(--text-muted); padding-left: 16px; margin: 0; display:flex; flex-direction:column; gap:8px;">
            <li>Remember to click <strong>Save Draft</strong> frequently to store your work locally.</li>
            <li>All support documentation must be in official government formats as per DPIIT guidelines.</li>
            <li>Ensure all required proof files are uploaded before clicking <strong>Submit Entire Application</strong>.</li>
            <li>Once submitted, the edition status moves to <em>In Review</em> and cannot be edited until returned by the reviewer.</li>
          </ul>
        </div>
      </div>
    </div>
  `;

  // Bind Quick Actions
  container.querySelectorAll('.btn-quick-act').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const id = btn.dataset.id;
      if (type === 'edit') {
        window.openApplicationForm(id, container);
      } else if (type === 'workspace') {
        renderTabbedApplicationWorkspace(container, id);
      } else if (type === 'explore') {
        window.activeUserTab = 'explore';
        window.renderUserSidebar();
        window.switchUserTab('explore');
      } else if (type === 'notifications') {
        window.switchUserTab('notifications');
      } else if (type === 'profile') {
        window.switchUserTab('profile');
      }
    });
  });

  // Bind KPI card clicks to navigate to corresponding sidebar tabs
  container.querySelectorAll('[data-tab]').forEach(card => {
    if (card.tagName !== 'BUTTON') {
      card.addEventListener('click', () => {
        const tab = card.dataset.tab;
        if (!tab || !window.switchUserTab) return;
        window.activeUserTab = tab;
        if (window.renderUserSidebar) window.renderUserSidebar();
        window.switchUserTab(tab);
      });
    }
  });


  // Bind Open Folder Buttons
  container.querySelectorAll('.btn-open-folder').forEach(btn => {
    btn.addEventListener('click', () => {
      const appId = btn.dataset.id;
      const app = Store.getApplicationById(appId);
      if (app.status === 'Draft') {
        window.openApplicationForm(appId, container);
      } else {
        renderTabbedApplicationWorkspace(container, appId);
      }
    });
  });

  // Bind Explore Assignments
  container.querySelector('.btn-explore-dash')?.addEventListener('click', () => {
    window.switchUserTab('assigned-editions');
  });

  // Bind Timeline Deep Linking (Component 7)
  container.querySelectorAll('.btn-timeline-deep-link').forEach(item => {
    item.addEventListener('click', () => {
      const aid = item.dataset.appId;
      renderTabbedApplicationWorkspace(container, aid);
    });
  });

  // Render Charts Lazily inside setTimeout (Component 1)
  if (hasAnalyticsData) {
    setTimeout(() => {
      // 1. Status Distribution Doughnut Chart
      const ctxDoughnut = document.getElementById('user-status-doughnut-chart')?.getContext('2d');
      if (ctxDoughnut) {
        const sk = ctxDoughnut.canvas.parentElement.querySelector('.chart-skeleton');
        if (sk) sk.style.display = 'none';
        if (window.userStatusDoughnutChart) {
          window.userStatusDoughnutChart.destroy();
        }
        window.userStatusDoughnutChart = new Chart(ctxDoughnut, {
          type: 'doughnut',
          data: {
            labels: ['Approved', 'Submitted/Review', 'Draft', 'Docs Requested', 'Rejected', 'Not Started'],
            datasets: [{
              data: [approvedCount, underReviewCount, draftCount, docsReqApps.length, rejectedCount, notStartedVal],
              backgroundColor: ['#10b981', '#a855f7', '#f97316', '#eab308', '#ef4444', '#3b82f6'],
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } }
            }
          }
        });
      }

      // 2. Line Chart - Application Creation/Submission/Approval Trends (Past 12 Months)
      const ctxLine = document.getElementById('user-progress-line-chart')?.getContext('2d');
      if (ctxLine) {
        const sk = ctxLine.canvas.parentElement.querySelector('.chart-skeleton');
        if (sk) sk.style.display = 'none';
        // Collect month labels for the last 12 months
        const monthLabels = [];
        const creations = [];
        const submissions = [];
        const approvals = [];

        for (let i = 11; i >= 0; i--) {
          const d = new Date();
          d.setMonth(d.getMonth() - i);
          const monthLabel = d.toLocaleString('en-IN', { month: 'short', year: '2-digit' });
          monthLabels.push(monthLabel);

          // Aggregate count
          let createdCount = 0;
          let submittedCount = 0;
          let approvedCountThisMonth = 0;

          apps.forEach(ap => {
            const createDate = new Date(ap.createdAt);
            if (createDate.getMonth() === d.getMonth() && createDate.getFullYear() === d.getFullYear()) {
              createdCount++;
            }
            if (ap.submittedAt) {
              const submitDate = new Date(ap.submittedAt);
              if (submitDate.getMonth() === d.getMonth() && submitDate.getFullYear() === d.getFullYear()) {
                submittedCount++;
              }
            }
            const appTimeline = ap.timeline || [];
            appTimeline.forEach(evt => {
              if (evt.action.toLowerCase().includes('approved')) {
                const date = new Date(evt.timestamp);
                if (date.getMonth() === d.getMonth() && date.getFullYear() === d.getFullYear()) {
                  approvedCountThisMonth++;
                }
              }
            });
          });

          creations.push(createdCount);
          submissions.push(submittedCount);
          approvals.push(approvedCountThisMonth);
        }

        if (window.userProgressLineChart) {
          window.userProgressLineChart.destroy();
        }
        window.userProgressLineChart = new Chart(ctxLine, {
          type: 'line',
          data: {
            labels: monthLabels,
            datasets: [
              { label: 'Created', data: creations, borderColor: '#f97316', backgroundColor: 'rgba(249, 115, 22, 0.05)', fill: true, tension: 0.3, borderWidth: 2 },
              { label: 'Submitted', data: submissions, borderColor: '#a855f7', backgroundColor: 'rgba(168, 85, 247, 0.05)', fill: true, tension: 0.3, borderWidth: 2 },
              { label: 'Approved', data: approvals, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.05)', fill: true, tension: 0.3, borderWidth: 2 }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9 } } }
            },
            scales: {
              y: { beginAtZero: true, ticks: { precision: 0 } }
            }
          }
        });
      }

      // 3. Bar Chart - Score Distribution per Edition
      const ctxBar = document.getElementById('user-score-bar-chart')?.getContext('2d');
      if (ctxBar) {
        const sk = ctxBar.canvas.parentElement.querySelector('.chart-skeleton');
        if (sk) sk.style.display = 'none';
        const labels = apps.map(ap => {
          const ed = Store.getEditionById(ap.editionId);
          return ed ? ed.name : ap.id.slice(-6);
        });
        const data = apps.map(ap => {
          const score = Store.calculateApplicationScore(ap.id) || 0;
          const maxScore = Store.calculateApplicationMaxScore(ap.id) || 1;
          return Math.round((score / maxScore) * 100);
        });

        if (window.userScoreBarChart) {
          window.userScoreBarChart.destroy();
        }
        window.userScoreBarChart = new Chart(ctxBar, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: 'Compliance Rate (%)',
              data: data,
              backgroundColor: 'rgba(99, 102, 241, 0.85)',
              borderColor: '#6366f1',
              borderWidth: 1,
              borderRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false }
            },
            scales: {
              y: { beginAtZero: true, max: 100 }
            }
          }
        });
      }
    }, 150);
  }
}

// ─── TABBED MODERN WORKSPACE (Overview, Questions, Documents, Timeline, Remarks, Score Breakdown) ───
export function renderTabbedApplicationWorkspace(container, appId) {
  window.workspaceLock = true;
  let app = Store.getApplicationById(appId);
  if (!app) return;
  const user = getCurrentUser();
  const isAdminOrSuper = ['admin', 'reviewer', 'superadmin'].includes(user.role);
  
  // Push to history
  window.navHistory.push({ role: isAdminOrSuper ? 'admin' : 'user', tab: 'tabbed-workspace', appId });
  
  const edition = Store.getEditionById(app.editionId);
  const answers = Store.getAnswersByApplication(appId);
  const score = Store.calculateApplicationScore(appId);
  const maxScore = Store.calculateApplicationMaxScore(appId) || 1;
  const pct = ((score / maxScore) * 100).toFixed(1);
  const applicant = Store.getUserById(app.userId);

  // Define tab headers (Section 9)
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'questions', label: 'Questions & Answers' },
    { id: 'docs', label: 'Uploaded Documents' },
    { id: 'timeline', label: 'Timeline History' },
    { id: 'remarks', label: 'Review Remarks' },
    { id: 'scoreBreakdown', label: 'Score Breakdown' }
  ];

  let activeTab = 'overview';

  function renderContent() {
    let tabContentHtml = '';

    if (activeTab === 'overview') {
      // User Workflow Progress Widget (Section 2)
      let workflowStepsHtml = '';
      const getTransitionTime = (statusKeyword) => {
        const entry = (app.timeline || []).find(t => t.action.toLowerCase().includes(statusKeyword.toLowerCase()));
        return entry ? new Date(entry.timestamp).toLocaleDateString('en-IN') : '';
      };

      const wSteps = [
        { label: 'Assigned', done: true, active: false, time: getTransitionTime('created') || new Date(app.createdAt).toLocaleDateString('en-IN') },
        { label: 'Draft', done: ['Draft', 'Submitted', 'Under Review', 'Additional Documents Requested', 'Resubmitted', 'Approved', 'Rejected'].includes(app.status), active: app.status === 'Draft', time: getTransitionTime('draft') || new Date(app.createdAt).toLocaleDateString('en-IN') },
        { label: 'Submitted', done: ['Submitted', 'Under Review', 'Additional Documents Requested', 'Resubmitted', 'Approved', 'Rejected'].includes(app.status), active: app.status === 'Submitted', time: getTransitionTime('submitted') },
        { label: 'Under Review', done: ['Under Review', 'Additional Documents Requested', 'Resubmitted', 'Approved', 'Rejected'].includes(app.status), active: app.status === 'Under Review', time: getTransitionTime('review') },
        { label: 'Docs Requested', done: ['Resubmitted', 'Approved', 'Rejected'].includes(app.status) && getTransitionTime('docs') !== '', active: app.status === 'Additional Documents Requested', time: getTransitionTime('docs') },
        { label: 'Resubmitted', done: ['Approved', 'Rejected'].includes(app.status) && getTransitionTime('resubmitted') !== '', active: app.status === 'Resubmitted', time: getTransitionTime('resubmitted') },
        { label: ['Approved', 'Rejected'].includes(app.status) ? app.status : 'Approved / Rejected', done: ['Approved', 'Rejected'].includes(app.status), active: ['Approved', 'Rejected'].includes(app.status), time: getTransitionTime('approved') || getTransitionTime('rejected') }
      ];

      workflowStepsHtml = `
        <div class="glass-card" style="padding: 16px; margin-bottom: 20px;">
          <h4 style="font-family: var(--font-title); font-size: 13.5px; font-weight: 700; margin: 0 0 16px 0;">📍 Application Workflow Tracker</h4>
          <div class="workflow-steps-horizontal" style="margin-top: 10px;">
            ${wSteps.map((st, idx) => {
              const isCompleted = st.done;
              const isActive = st.active;
              const isRejected = st.label === 'Rejected' || (isActive && app.status === 'Rejected');
              
              return `
                <div class="workflow-step-full ${isCompleted ? 'completed' : ''} ${isActive ? 'active workflow-circle-pulse' : ''} ${isRejected ? 'rejected' : ''}">
                  <div class="workflow-circle-full">
                    ${isCompleted ? '✓' : isRejected ? '✕' : idx + 1}
                  </div>
                  <div class="workflow-label-full" style="font-size: 10.5px; font-weight:600;">${st.label}</div>
                  <div class="workflow-time-full" style="font-size: 9px;">${st.time || ''}</div>
                  ${idx < wSteps.length - 1 ? `<div class="workflow-step-line-connector"></div>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;

      tabContentHtml = `
        <div class="dashboard-metrics-grid" style="display:grid; grid-template-columns:1.6fr 1fr; gap:20px; margin-bottom:20px;">
          <div>
            ${workflowStepsHtml}

            <div class="card glass-card" style="margin-bottom:20px;">
              <div class="card-header"><h2>Framework Compliance Summary</h2></div>
              <div class="card-body">
                <table class="benchmarking-table">
                  <tr><td>Application ID</td><td><code class="app-id-code">${app.id}</code></td></tr>
                  <tr><td>Framework Edition</td><td><strong>${edition?.name || 'SRF'}</strong></td></tr>
                  <tr><td>Nodal Agency</td><td>${applicant?.organization || 'State Startup Nodal Cell'}</td></tr>
                  <tr><td>State / District</td><td>${applicant?.state || '—'} / ${applicant?.district || '—'}</td></tr>
                  <tr><td>Category Group</td><td>${edition?.categories?.find(c => c.id === app.category)?.name || app.category}</td></tr>
                  <tr><td>Submission Date</td><td>${app.submittedAt ? new Date(app.submittedAt).toLocaleString('en-IN') : 'Not submitted yet'}</td></tr>
                  <tr><td>Last Updated Date</td><td>${new Date(app.updatedAt).toLocaleString('en-IN')}</td></tr>
                  <tr><td>Certification Status</td><td><span class="status-badge ${userFriendlyStatusClass(app.status)}">${userFriendlyStatus(app.status)}</span></td></tr>
                </table>
              </div>
            </div>
          </div>

          <div>
            <!-- Compliance Completeness Visual Health Gauge (Section 11) -->
            <div class="card glass-card" style="margin-bottom:20px; text-align:center; padding:24px 16px; display:flex; flex-direction:column; align-items:center;">
              <span style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.04em;">Official Verification Score</span>
              <h1 style="font-size:42px; font-weight:800; color:var(--accent-indigo); margin:12px 0 6px;">${score} <span style="font-size:18px; font-weight:normal; color:var(--text-muted);">/ ${maxScore}</span></h1>
              ${createGaugeHtml(Math.round(Number(pct)), 'Completeness Health')}
            </div>
            
            <div class="card glass-card">
              <div class="card-header"><h2>Assigned Evaluator & Decisions</h2></div>
              <div class="card-body" style="padding:16px;">
                <div style="background:rgba(99,102,241,0.03); border-left:4px solid var(--accent-indigo); padding:12px; border-radius:8px;">
                  <strong style="display:block; color:var(--primary); margin-bottom:4px; font-size:12.5px;">Evaluator Review Details:</strong>
                  <p style="margin:0; font-size:13px; color:var(--text-dark);">${app.reviewerComments || 'Under active evaluation. Awaiting DPIIT response.'}</p>
                </div>
              </div>
            </div>

            <div class="card glass-card" style="margin-top: 20px;">
              <div class="card-header"><h2>Export Workspace Reports</h2></div>
              <div class="card-body" style="padding:16px; display:flex; flex-direction:column; gap:8px;">
                ${!isAdminOrSuper ? `
                  <button class="btn btn-sm btn-outline btn-export-app-pdf" data-id="${app.id}" style="width:100%; justify-content:flex-start;">📥 Download Submitted Application PDF</button>
                  <button class="btn btn-sm btn-outline btn-export-timeline" data-id="${app.id}" style="width:100%; justify-content:flex-start;">⏱️ Download Own Timeline PDF</button>
                ` : `
                  <button class="btn btn-sm btn-outline btn-export-app-pdf" data-id="${app.id}" style="width:100%; justify-content:flex-start;">📥 Download Application Dossier</button>
                  <button class="btn btn-sm btn-outline btn-export-compliance" data-id="${app.id}" style="width:100%; justify-content:flex-start;">📊 Download Compliance Report</button>
                  <button class="btn btn-sm btn-outline btn-export-score" data-id="${app.id}" style="width:100%; justify-content:flex-start;">🏆 Download Official Score Card</button>
                  <button class="btn btn-sm btn-outline btn-export-timeline" data-id="${app.id}" style="width:100%; justify-content:flex-start;">⏱️ Download Timeline History</button>
                `}
              </div>
            </div>
          </div>
        </div>
      `;
    } 
    else if (activeTab === 'scoreBreakdown') {
      const allSections = Store.getSectionsByEdition(app.editionId) || [];
      const fields = Store.getFieldsByEdition(app.editionId);

      const sectionAnalytics = allSections.map(sec => {
        const secFields = fields.filter(f => f.reformAreaId === sec.id && !f.isLayoutElement);
        const answered = secFields.filter(f => {
          const ans = answers.find(a => a.fieldId === f.id);
          return ans && ans.value && ans.value.trim() !== '';
        }).length;
        const completionRate = secFields.length > 0 ? Math.round((answered / secFields.length) * 100) : 0;
        const secScore = secFields.reduce((sum, f) => {
          const ans = answers.find(a => a.fieldId === f.id);
          return sum + (ans?.questionScore || 0);
        }, 0);
        const secMax = secFields.reduce((sum, f) => sum + (f.maxScore || f.weight || 1), 0);

        return {
          id: sec.id,
          name: sec.name || sec.title,
          color: sec.color || '#4f46e5',
          answered,
          totalQuestions: secFields.length,
          completionRate,
          score: secScore,
          maxScore: secMax
        };
      });

      tabContentHtml = `
        <div class="dashboard-metrics-grid" style="display:grid; grid-template-columns:1.5fr 1fr; gap:20px; margin-bottom: 24px;">
          <div class="card glass-card">
            <div class="card-header"><h2>Section Score Analysis</h2></div>
            <div class="card-body" style="position: relative; height: 320px;">
              <canvas id="section-completion-chart"></canvas>
            </div>
          </div>
          <div class="card glass-card" style="text-align: center; padding: 24px 16px; display: flex; flex-direction: column; justify-content: center; align-items: center;">
            <span style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.04em;">Average Compliance Progress</span>
            <h1 style="font-size:46px; font-weight:800; color:var(--accent-indigo); margin:12px 0 6px;">
              ${(sectionAnalytics.reduce((sum, s) => sum + s.completionRate, 0) / (sectionAnalytics.length || 1)).toFixed(0)}%
            </h1>
            <p style="font-size: 13px; color: var(--text-muted); margin: 0 0 16px 0;">Average completion across all reform areas.</p>
            <div style="font-size: 13.5px; color: var(--text-main); font-weight: 600;">
              Total Answered: ${sectionAnalytics.reduce((sum, s) => sum + s.answered, 0)} / ${sectionAnalytics.reduce((sum, s) => sum + s.totalQuestions, 0)} Questions
            </div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px;">
          ${sectionAnalytics.map(sec => `
            <div class="card glass-card" style="padding: 16px; border-left: 4px solid ${sec.color};">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                <h3 style="font-family: var(--font-title); font-size: 14.5px; font-weight: 700; margin: 0; color: var(--text-main); max-width: 70%; line-height: 1.4;">${sec.name}</h3>
                <span class="status-badge status-approved" style="font-size: 10px; background: rgba(16,185,129,0.08); color: #10b981; font-weight: 700;">Score: ${sec.score} / ${sec.maxScore}</span>
              </div>
              <div style="margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; font-size: 11.5px; color: var(--text-muted); margin-bottom: 4px;">
                  <span>Section Completion</span>
                  <span>${sec.completionRate}%</span>
                </div>
                <div class="reform-progress-bar-container" style="height: 6px;">
                  <div class="reform-progress-fill" style="width: ${sec.completionRate}%; background: ${sec.color};"></div>
                </div>
              </div>
              <div style="font-size: 12px; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center; margin-top: 8px; border-top: 1px dashed var(--border-color); padding-top: 8px;">
                <span>Questions Filled: <strong>${sec.answered} / ${sec.totalQuestions}</strong></span>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      // Render chart
      setTimeout(() => {
        const ctx = document.getElementById('section-completion-chart')?.getContext('2d');
        if (ctx) {
          new Chart(ctx, {
            type: 'bar',
            data: {
              labels: sectionAnalytics.map(s => s.name.length > 25 ? s.name.substring(0, 22) + '...' : s.name),
              datasets: [{
                label: 'Completion Rate (%)',
                data: sectionAnalytics.map(s => s.completionRate),
                backgroundColor: sectionAnalytics.map(s => s.color),
                borderRadius: 4
              }]
            },
            options: {
              indexAxis: 'y',
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { min: 0, max: 100 },
                y: { ticks: { font: { size: 9, weight: 'bold' } } }
              }
            }
          });
        }
      }, 0);
    }
    else if (activeTab === 'questions') {
      const allSections = Store.getSectionsByEdition(app.editionId) || [];
      const fields = Store.getFieldsByEdition(app.editionId);

      const statusColor = { 'Approved': '#10b981', 'Rejected': '#ef4444', 'Additional Documents Requested': '#d97706', 'Submitted': '#0284c7', 'Draft': '#64748b' };
      const statusLabel = { 'Approved': 'Approved ✓', 'Rejected': 'Rejected ✕', 'Additional Documents Requested': 'Docs Requested ⚠', 'Submitted': 'Awaiting Evaluation', 'Draft': 'Draft / Unanswered' };

      tabContentHtml = `
        <div style="margin-bottom: 16px; font-size:12.5px; color:var(--text-muted);">
          Each section lists the compliance answers, uploaded files, evaluation decisions, and scores.
        </div>
        ${allSections.map(sec => {
          const secFields = fields.filter(f => f.reformAreaId === sec.id && !f.isLayoutElement);
          if (!secFields.length) return '';
          return `
            <div class="card glass-card" style="margin-bottom:20px;">
              <div class="card-header" style="background:rgba(79,70,229,0.04); border-left:3px solid ${sec.color||'var(--accent-indigo)'};">
                <h2 style="font-size:14px; margin:0; font-weight:700;">${sec.name || sec.title}</h2>
              </div>
              <div class="card-body" style="padding:0;">
                ${secFields.map((f, idx) => {
                  const ans = answers.find(a => a.fieldId === f.id);
                  const qStatus = ans?.questionStatus || 'Draft';
                  const qScore  = ans?.questionStatus === 'Approved' ? (ans.questionScore || 0) : 0;
                  const qMax    = f.maxScore || f.weight || 1;
                  const sColor = statusColor[qStatus] || '#64748b';
                  const sLabel = statusLabel[qStatus] || qStatus;
                  const remarks = ans?.adminRemarks || '';

                  let filesHtml = '';
                  if (ans?.files && ans.files.length > 0) {
                    filesHtml = ans.files.map(fl => `
                      <span style="display:inline-flex; align-items:center; gap:4px; background:rgba(99,102,241,0.06); border:1px solid rgba(99,102,241,0.15); border-radius:4px; padding:2px 8px; font-size:11px; margin-top:4px;">
                        📎 <a href="#" class="btn-view-q-doc" data-field-id="${f.id}" data-doc-id="${fl.docId}" data-doc-name="${fl.name}" style="color:var(--primary);text-decoration:none;">${fl.name}</a>
                        <small style="color:${fl.fileStatus==='Approved'?'#10b981':fl.fileStatus==='Rejected'?'#ef4444':'#d97706'}; font-weight:600;">[${fl.fileStatus||'Pending'}]</small>
                      </span>
                    `).join(' ');
                  }

                  // Enable dynamic upload button inline for documents requested
                  const isDocsRequested = qStatus === 'Additional Documents Requested';

                  return `
                    <div style="border-top:${idx>0?'1px solid var(--border-color)':'none'}; padding:14px 16px; display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap;">
                      <div style="flex:1; min-width:0;">
                        <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                          <span style="font-size:11px; font-weight:700; color:var(--text-muted);">Q ${f.num}</span>
                          <span style="font-size:13px; font-weight:600; color:var(--text-main);">${f.label||f.text}</span>
                        </div>
                        <div style="font-size:12.5px; padding-left:34px; margin-bottom:6px;">
                          <span style="color:var(--text-muted); font-size:11px;">Answer: </span>
                          <strong>${ans?.value || '<em>Not answered yet</em>'}</strong>
                        </div>
                        ${filesHtml ? `<div style="display:flex; flex-wrap:wrap; gap:6px; padding-left:34px; margin-bottom:6px;">${filesHtml}</div>` : ''}
                        ${remarks ? `
                          <div style="margin-left:34px; font-size:11.5px; padding:6px 10px; border-left:2px solid ${sColor}; background:rgba(0,0,0,0.02); border-radius:0 4px 4px 0; color:var(--text-dark);">
                            <strong>Reviewer Remarks:</strong> "${remarks}"
                          </div>
                        ` : ''}
                      </div>
                      <div style="text-align:right; min-width:140px; display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
                        <span class="status-badge" style="background:${sColor}12; color:${sColor}; border:1px solid ${sColor}30; font-size:10px; font-weight:700; text-transform:uppercase;">${sLabel}</span>
                        <span style="font-size:11.5px; color:var(--text-muted);">Score: <strong style="color:var(--accent-indigo);">${qScore} / ${qMax}</strong></span>
                        ${(isDocsRequested && ['Draft', 'Additional Documents Requested'].includes(app.status)) ? `
                          <button class="btn btn-xs btn-primary btn-inline-fix-docs" data-field-id="${f.id}" style="margin-top:6px; font-weight:600;">📎 Upload Document</button>
                        ` : ''}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      `;
    } 
    else if (activeTab === 'docs') {
      // Document Management Center (Section 10)
      const fields = Store.getFieldsByEdition(app.editionId);
      const docsList = [];
      
      fields.forEach(f => {
        if (f.isLayoutElement) return;
        const ans = answers.find(a => a.fieldId === f.id);
        const reqSlots = f.docs || [];
        
        reqSlots.forEach(slot => {
          const file = ans?.files?.find(fl => fl.docId === slot.id);
          const isRequested = ans?.questionStatus === 'Additional Documents Requested';
          
          docsList.push({
            field: f,
            slot,
            file,
            isRequested,
            remarks: ans?.adminRemarks || ans?.rejectionReason || ''
          });
        });
      });

      tabContentHtml = `
        <div class="card glass-card">
          <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
            <h2>Evidence Document Management</h2>
            ${['Draft', 'Additional Documents Requested'].includes(app.status) ? `
              <button class="btn btn-xs btn-primary btn-trigger-bulk-upload">+ Upload New Document</button>
            ` : ''}
          </div>
          <div class="card-body p-0">
            ${docsList.length === 0 ? `
              <p style="padding:24px; text-align:center; color:var(--text-muted);">No supporting document slots required for this category.</p>
            ` : `
              <table class="benchmarking-table">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Document Requirement</th>
                    <th>Uploaded File</th>
                    <th>Status</th>
                    <th>Upload Date</th>
                    <th style="text-align:right;">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${docsList.map(item => {
                    const hasFile = !!item.file;
                    const isWarning = item.isRequested && !hasFile;
                    const rowBgStyle = isWarning ? 'background: rgba(234, 179, 8, 0.04);' : (item.isRequested ? 'background: rgba(239, 68, 68, 0.02);' : '');
                    
                    let statusLabel = 'Not Uploaded';
                    let statusClass = 'status-draft';
                    if (hasFile) {
                      statusLabel = item.file.fileStatus || 'Pending Review';
                      statusClass = item.file.fileStatus === 'Approved' ? 'status-approved' : (item.file.fileStatus === 'Rejected' ? 'status-rejected' : 'status-submitted');
                    } else if (item.isRequested) {
                      statusLabel = 'Required / Action Needed';
                      statusClass = 'status-rejected';
                    }

                    return `
                      <tr style="${rowBgStyle}">
                        <td><strong>Q${item.field.num}</strong></td>
                        <td>
                          <div>${item.slot.name}</div>
                          ${item.slot.requirement === 'mandatory' ? '<span style="font-size:9px; background:rgba(220,38,38,0.1); color:#dc2626; padding:1px 4px; border-radius:3px; font-weight:700; text-transform:uppercase;">Mandatory</span>' : ''}
                          ${item.isRequested ? `<div style="font-size:11px; color:#b45309; font-weight:600; margin-top:2px;">⚠ Reviewer Note: "${item.remarks}"</div>` : ''}
                        </td>
                        <td>
                          ${hasFile ? `<strong style="font-size:12.5px;">📎 ${item.file.name}</strong>` : '<span style="color:var(--text-muted); font-style:italic;">No file uploaded</span>'}
                        </td>
                        <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                        <td>${hasFile ? new Date(item.file.uploadedAt).toLocaleDateString('en-IN') : '—'}</td>
                        <td style="text-align:right;">
                          <div style="display:inline-flex; gap:6px; justify-content:flex-end;">
                            ${hasFile ? `
                              <button class="btn btn-xs btn-outline btn-view-doc-file" data-field-id="${item.field.id}" data-doc-id="${item.slot.id}" data-name="${item.file.name}">View</button>
                            ` : ''}
                            ${['Draft', 'Additional Documents Requested'].includes(app.status) ? `
                              <button class="btn btn-xs btn-primary btn-replace-doc" data-field-id="${item.field.id}" data-doc-id="${item.slot.id}">
                                ${hasFile ? 'Replace' : 'Upload'}
                              </button>
                              <input type="file" class="doc-replace-input" style="display:none;" data-field-id="${item.field.id}" data-doc-id="${item.slot.id}">
                            ` : ''}
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            `}
          </div>
        </div>
      `;
    }
    else if (activeTab === 'timeline') {
      const timelineHtml = (app.timeline || []).slice().reverse().map(t => `
        <div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-content">
            <p class="timeline-action" style="font-weight:700; margin:0 0 2px 0;">${t.action}</p>
            ${t.remarks ? `<p style="font-size:12px; color:var(--text-dark); margin:2px 0 0; font-style:italic;">Remarks: "${t.remarks}"</p>` : ''}
            <span class="timeline-time" style="font-size:10.5px; color:var(--text-muted);">${new Date(t.timestamp).toLocaleString('en-IN')} — ${t.by}</span>
          </div>
        </div>
      `).join('');

      tabContentHtml = `
        <div class="card glass-card">
          <div class="card-header"><h2>Application History Timeline</h2></div>
          <div class="card-body">
            <div class="timeline-list">${timelineHtml || '<p style="color:var(--text-muted);">No history recorded yet.</p>'}</div>
          </div>
        </div>
      `;
    }
    else if (activeTab === 'remarks') {
      // Review Remarks and feedback log
      const remarksList = (app.timeline || []).filter(t => t.action.toLowerCase().includes('approved') || t.action.toLowerCase().includes('rejected') || t.action.toLowerCase().includes('docs') || t.remarks);
      tabContentHtml = `
        <div class="card glass-card">
          <div class="card-header"><h2>Evaluator Review Remarks & Feedback</h2></div>
          <div class="card-body" style="padding: 20px;">
            ${remarksList.length === 0 ? `
              <p style="text-align:center; color:var(--text-muted); margin:0;">No official remarks or feedback recorded yet.</p>
            ` : remarksList.map(r => `
              <div style="border-bottom:1px solid var(--border-color); padding-bottom:12px; margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-muted); margin-bottom:4px;">
                  <strong>Action: ${r.action}</strong>
                  <span>${new Date(r.timestamp).toLocaleString('en-IN')} — ${r.by}</span>
                </div>
                <p style="margin:0; font-size:13.5px; color:var(--text-main); font-style: italic;">"${r.remarks || 'No notes provided'}"</p>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    container.querySelector('#workspace-tabs-content').innerHTML = tabContentHtml;

    // Bind Export Buttons
    container.querySelectorAll('.btn-export-app-pdf').forEach(btn => {
      btn.addEventListener('click', () => downloadApplicationPdf(btn.dataset.id));
    });
    container.querySelectorAll('.btn-export-compliance').forEach(btn => {
      btn.addEventListener('click', () => downloadComplianceReport(btn.dataset.id));
    });
    container.querySelectorAll('.btn-export-score').forEach(btn => {
      btn.addEventListener('click', () => downloadScoreSheet(btn.dataset.id));
    });
    container.querySelectorAll('.btn-export-timeline').forEach(btn => {
      btn.addEventListener('click', () => downloadTimelineReport(btn.dataset.id));
    });

    // Bind Inline file viewers
    container.querySelectorAll('.btn-view-q-doc, .btn-view-doc-file').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const { fieldId, docId, name } = btn.dataset;
        const ans = answers.find(x => x.fieldId === fieldId);
        const file = ans?.files?.find(fl => fl.docId === docId);
        if (file && file.dataUrl) {
          showFileViewer({ title: name || file.name, dataUrl: file.dataUrl, fileName: name || file.name });
        } else {
          showToast('Document stream preview is not available.', 'error');
        }
      });
    });

    // Bind Document Replacement Trigger Inputs (Section 10)
    container.querySelectorAll('.btn-replace-doc').forEach(btn => {
      btn.addEventListener('click', () => {
        const fieldId = btn.dataset.fieldId;
        const docId = btn.dataset.docId;
        const input = container.querySelector(`input[type="file"][data-field-id="${fieldId}"][data-doc-id="${docId}"]`);
        input?.click();
      });
    });

    // Bind document upload triggers
    container.querySelectorAll('.doc-replace-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const { fieldId, docId } = input.dataset;
        
        const reader = new FileReader();
        reader.onload = async (event) => {
          const dataUrl = event.target.result;
          const existing = answers.find(a => a.fieldId === fieldId);
          
          let files = existing?.files ? [...existing.files] : [];
          const existingFile = files.find(f => f.docId === docId);
          if (existingFile) {
            if (Store.addToRecycleBin) {
              Store.addToRecycleBin(existingFile, appId, fieldId, user.username);
            }
            files = files.filter(f => f.docId !== docId);
          }
          
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
          
          Store.saveAnswer(appId, fieldId, existing?.value || '', files);
          
          // Direct file upload to server
          try {
            await fetch(`/api/files/${appId}/${fieldId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ files })
            });
          } catch(err) { console.warn('[DocCenter] Direct file sync failed, will sync on next save:', err); }
          
          showToast(`"${file.name}" uploaded successfully!`, 'success');
          // Reload workspace
          app = Store.getApplicationById(appId);
          answers.splice(0, answers.length, ...Store.getAnswersByApplication(appId));
          renderContent();
        };
        reader.readAsDataURL(file);
      });
    });

    // Bind Inline Fix documents requested (Section 10)
    container.querySelectorAll('.btn-inline-fix-docs').forEach(btn => {
      btn.addEventListener('click', () => {
        const fieldId = btn.dataset.fieldId;
        const fields = Store.getFieldsByEdition(app.editionId);
        const f = fields.find(x => x.id === fieldId);
        const docSlot = f?.docs?.[0];
        if (docSlot) {
          activeTab = 'docs';
          container.querySelectorAll('.workspace-tab-link').forEach(l => l.classList.toggle('active', l.dataset.tab === activeTab));
          renderContent();
          setTimeout(() => {
            const input = container.querySelector(`input[type="file"][data-field-id="${fieldId}"][data-doc-id="${docSlot.id}"]`);
            input?.click();
          }, 100);
        }
      });
    });

    // Bulk upload / Start upload document button inside tab header
    container.querySelector('.btn-trigger-bulk-upload')?.addEventListener('click', () => {
      activeTab = 'docs';
      container.querySelectorAll('.workspace-tab-link').forEach(l => l.classList.toggle('active', l.dataset.tab === activeTab));
      renderContent();
      const firstAvailableReplaceBtn = container.querySelector('.btn-replace-doc');
      if (firstAvailableReplaceBtn) {
        firstAvailableReplaceBtn.click();
      } else {
        showToast('No document slots available for upload.', 'warning');
      }
    });
  }

  // Initial outer workspace shell (Section 9)
  container.innerHTML = `
    <div style="margin-bottom:20px; display:flex; align-items:center; gap:12px;">
      <button id="btn-back-workspace-home" class="btn btn-secondary btn-sm">
        ← Back
      </button>
      <div style="font-size:12px; color:var(--text-muted);">
        SRF Workspace / <strong>${appId}</strong>
      </div>
    </div>

    <div class="section-card" style="margin-bottom:24px;">
      <div class="section-badge admin-badge">Framework Workspace</div>
      <h1>${edition?.name || 'SRF Edition'} Directory</h1>
      <p style="color:var(--text-muted); font-size:13.5px;">Manage details, evidence compliance, comments, and timeline histories inside a single interactive dashboard.</p>
    </div>

    <div class="workspace-nav-tabs">
      ${tabs.map(t => `
        <button class="workspace-tab-link ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">
          ${t.label}
        </button>
      `).join('')}
    </div>

    <div id="workspace-tabs-content"></div>
  `;

  // Bind tab switches
  container.querySelectorAll('.workspace-tab-link').forEach(link => {
    link.addEventListener('click', () => {
      activeTab = link.dataset.tab;
      container.querySelectorAll('.workspace-tab-link').forEach(l => l.classList.toggle('active', l.dataset.tab === activeTab));
      renderContent();
    });
  });

  container.querySelector('#btn-back-workspace-home').addEventListener('click', () => {
    window.workspaceLock = false;
    if (isAdminOrSuper) {
      window.openEditionTracker(app.editionId);
    } else {
      window.switchUserTab('dashboard');
    }
  });

  // Silent sync handler to dynamically refresh the current tab content without
  // resetting the workspace shell or changing the active tab.
  const _workspaceSyncHandler = () => {
    if (!document.getElementById('workspace-tabs-content')) {
      // Workspace left the DOM — cleanup
      window.removeEventListener('db-sync-complete', _workspaceSyncHandler);
      return;
    }
    // Refresh app and answers data silently
    const refreshedApp = Store.getApplicationById(appId);
    if (refreshedApp) {
      Object.assign(app, refreshedApp);
    }
    const refreshedAnswers = Store.getAnswersByApplication(appId);
    answers.splice(0, answers.length, ...refreshedAnswers);
    renderContent();
  };
  window.addEventListener('db-sync-complete', _workspaceSyncHandler);

  // Render initial content
  renderContent();
}

// Module-scoped variable to track the active edition for analytics
let currentAnalyticsEditionId = null;

// ─── ADMIN ANALYTICS DASHBOARD ──────────────────────────────────────────────
export async function renderAdminAnalyticsDashboard(container) {
  // Show a loading indicator while fetching the latest db state from server
  container.innerHTML = `
    <div class="empty-state" style="padding: 40px; text-align: center;">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-indigo)" stroke-width="2" style="animation:spin 1s linear infinite; margin-bottom:12px; display:inline-block;">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
      <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">Refreshing Platform Intel...</h3>
      <p style="color: var(--text-muted); font-size: 14px;">Fetching latest application states from the server...</p>
    </div>
  `;

  try {
    await Store.initStore();
  } catch (e) {
    console.warn('[Dashboard] Could not refresh DB from server:', e);
  }

  const db = Store.getDb();
  if (!db) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 40px; text-align: center;">
        <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">Loading Platform Intel...</h3>
        <p style="color: var(--text-muted); font-size: 14px;">Database synchronization in progress. Please wait...</p>
      </div>
    `;
    return;
  }
  const editions = (Store.getEditions() || []).filter(e => e.status !== 'archived' && !e.isDeleted);
  
  if (!currentAnalyticsEditionId && editions.length > 0) {
    currentAnalyticsEditionId = editions[0]?.id;
  }
  const selectedEditionId = currentAnalyticsEditionId;
  const prod = calculateProductivityMetrics();

  const isSuper = getCurrentUser().role === 'superadmin';
  const adminOrg = getCurrentUser().organization || '';

  // Get active users with department filter
  let activeUsers = (db.users || []).filter(u => u.role === 'user' && u.active !== false);
  if (!isSuper && adminOrg !== 'DPIIT') {
    activeUsers = activeUsers.filter(u => u.organization === adminOrg);
  }

  // Get filtered applications (including drafts so we can draw charts accurately)
  const allFilteredApps = (db.applications || []).filter(a => {
    if (a.editionId !== selectedEditionId) return false;
    if (!isSuper && adminOrg !== 'DPIIT') {
      const applicant = (db.users || []).find(u => u.id === a.userId);
      if (!applicant || applicant.organization !== adminOrg) return false;
    }
    return true;
  });

  const editionApps = allFilteredApps.filter(a => a.status !== 'Draft');
  let totalAppsCount = editionApps.length;
  let approvedAppsCount = editionApps.filter(a => ['Admin Approved', 'Final Approved', 'Approved'].includes(a.status)).length;
  let successRate = totalAppsCount ? ((approvedAppsCount / totalAppsCount) * 100).toFixed(0) : '0';

  const usersWithApp = activeUsers.filter(u => allFilteredApps.some(a => a.userId === u.id));
  let participationRate = activeUsers.length ? ((usersWithApp.length / activeUsers.length) * 100).toFixed(0) + '%' : '0%';

  // Calculate compliance data for each district for quick comparative analysis (excluding Draft status)
  const districtData = activeUsers.map(u => {
    const uApps = (db.applications || []).filter(ap => ap.userId === u.id && ap.editionId === selectedEditionId && ap.status !== 'Draft');
    let pctSum = 0;
    let docCount = 0;
    let statusLabel = 'No Submissions';
    let statusClass = 'status-draft';
    
    uApps.forEach(ap => {
      const s = Store.calculateApplicationScore(ap.id) || 0;
      const m = Store.calculateApplicationMaxScore(ap.id) || 1;
      pctSum += (s / m) * 100;
      
      const answers = Store.getAnswersByApplication(ap.id) || [];
      answers.forEach(ans => {
        if (ans.files && Array.isArray(ans.files)) {
          docCount += ans.files.length;
        }
      });
      
      if (ap.status === 'Approved') {
        statusLabel = 'Approved / Verified';
        statusClass = 'status-approved';
      } else if (ap.status === 'Rejected') {
        statusLabel = 'Rejected';
        statusClass = 'status-rejected';
      } else if (ap.status === 'Additional Documents Requested') {
        statusLabel = 'Docs Requested';
        statusClass = 'status-add-docs';
      } else if (['Submitted', 'Under Review', 'Resubmitted'].includes(ap.status)) {
        statusLabel = 'Pending Review';
        statusClass = 'status-submitted';
      }
    });
    
    const avgPct = uApps.length ? (pctSum / uApps.length) : 0;
    
    return {
      user: u,
      appCount: uApps.length,
      compliance: avgPct,
      docCount: docCount,
      statusLabel: statusLabel,
      statusClass: statusClass
    };
  });

  // Sort by compliance descending for leaderboard
  districtData.sort((a, b) => b.compliance - a.compliance);

  // Render Layout Structure
  container.innerHTML = `
    <div class="section-card" style="margin-bottom:24px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
      <div>
        <div class="section-badge admin-badge">Executive View</div>
        <h1>Executive Command Center</h1>
        <p style="color:var(--text-muted); font-size:13.5px;">High-level administrative monitoring of compliance rates, risk parameters, and district leaderboards.</p>
      </div>
      <div style="display:flex; gap:10px; align-items:center;">
        <select id="analytics-filter-edition" class="form-control form-control-sm" style="width: auto; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-main); font-size: 13px;">
          ${editions.map(ed => `<option value="${ed.id}" ${ed.id === selectedEditionId ? 'selected' : ''}>${ed.name}</option>`).join('')}
        </select>
        <button class="btn btn-outline btn-sm btn-export-summary">📥 Export Executive Summary</button>
      </div>
    </div>

    <!-- Core Executive Metrics -->
    ${isSuper ? `
    <div class="stats-grid" style="margin-bottom:28px; display:grid; grid-template-columns:repeat(4, 1fr); gap:16px;">
      <div class="stat-card">
        <div class="stat-info">
          <h3 style="font-size:26px; font-weight:800; color:var(--accent-blue)">${allFilteredApps.filter(a => a.status !== 'Draft').length}</h3>
          <p style="font-size:13px; color:var(--text-muted);">Total Submissions</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h3 style="font-size:26px; font-weight:800; color:var(--warning)">${allFilteredApps.filter(a => ['Admin Approved', 'Super Admin Review'].includes(a.status)).length}</h3>
          <p style="font-size:13px; color:var(--text-muted);">Pending Final Review</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h3 style="font-size:26px; font-weight:800; color:var(--success)">${allFilteredApps.filter(a => a.status === 'Final Approved').length}</h3>
          <p style="font-size:13px; color:var(--text-muted);">Approved (Final)</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h3 style="font-size:26px; font-weight:800; color:var(--danger)">${allFilteredApps.filter(a => a.status === 'Rejected').length}</h3>
          <p style="font-size:13px; color:var(--text-muted);">Rejected</p>
        </div>
      </div>
    </div>
    ` : `
    <div class="stats-grid" style="margin-bottom:28px; display:grid; grid-template-columns:repeat(4, 1fr); gap:16px;">
      <div class="stat-card">
        <div class="stat-info">
          <h3 style="font-size:26px; font-weight:800; color:var(--accent-blue)">${allFilteredApps.filter(a => a.status !== 'Draft').length}</h3>
          <p style="font-size:13px; color:var(--text-muted);">Total Submissions</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h3 style="font-size:26px; font-weight:800; color:var(--warning)">${allFilteredApps.filter(a => ['Submitted', 'Under Review', 'Resubmitted', 'Additional Documents Requested'].includes(a.status)).length}</h3>
          <p style="font-size:13px; color:var(--text-muted);">Pending Review</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h3 style="font-size:26px; font-weight:800; color:var(--success)">${allFilteredApps.filter(a => ['Admin Approved', 'Final Approved'].includes(a.status)).length}</h3>
          <p style="font-size:13px; color:var(--text-muted);">Approved</p>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <h3 style="font-size:26px; font-weight:800; color:var(--danger)">${allFilteredApps.filter(a => a.status === 'Rejected').length}</h3>
          <p style="font-size:13px; color:var(--text-muted);">Rejected</p>
        </div>
      </div>
    </div>
    `}
 
    <!-- System Database Validation Metrics (5 Clickable Cards) -->
    <div style="margin-bottom:28px;">
      <h3 style="font-size:16px; font-weight:700; margin-bottom:12px; color:var(--text-dark); display:flex; align-items:center; gap:8px;">
        <span>📊</span> System Database Validation Metrics (Real-time Counts)
      </h3>
      <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:12px;">
        <div class="card glass-card analytics-stat-card" data-filter-status="all" style="padding:16px; text-align:center; border-top:3px solid var(--accent-indigo); cursor:pointer; transition:transform 0.15s, box-shadow 0.15s;">
          <div style="font-size:22px; font-weight:800; color:var(--accent-indigo);">${allFilteredApps.length}</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:4px; font-weight:600;">Total Applications</div>
        </div>
        <div class="card glass-card analytics-stat-card" data-filter-status="Draft" style="padding:16px; text-align:center; border-top:3px solid var(--accent-blue); cursor:pointer; transition:transform 0.15s, box-shadow 0.15s;">
          <div style="font-size:22px; font-weight:800; color:var(--accent-blue);">${allFilteredApps.filter(a => a.status === 'Draft').length}</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:4px; font-weight:600;">Draft Applications</div>
        </div>
        <div class="card glass-card analytics-stat-card" data-filter-status="Submitted" style="padding:16px; text-align:center; border-top:3px solid var(--warning); cursor:pointer; transition:transform 0.15s, box-shadow 0.15s;">
          <div style="font-size:22px; font-weight:800; color:var(--warning);">${allFilteredApps.filter(a => ['Submitted', 'Under Review', 'Resubmitted', 'Additional Documents Requested'].includes(a.status)).length}</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:4px; font-weight:600;">Submitted Applications</div>
        </div>
        <div class="card glass-card analytics-stat-card" data-filter-status="Approved" style="padding:16px; text-align:center; border-top:3px solid var(--success); cursor:pointer; transition:transform 0.15s, box-shadow 0.15s;">
          <div style="font-size:22px; font-weight:800; color:var(--success);">${allFilteredApps.filter(a => ['Admin Approved', 'Final Approved', 'Approved'].includes(a.status)).length}</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:4px; font-weight:600;">Approved Applications</div>
        </div>
        <div class="card glass-card analytics-stat-card" data-filter-status="Rejected" style="padding:16px; text-align:center; border-top:3px solid var(--danger); cursor:pointer; transition:transform 0.15s, box-shadow 0.15s;">
          <div style="font-size:22px; font-weight:800; color:var(--danger);">${allFilteredApps.filter(a => a.status === 'Rejected').length}</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:4px; font-weight:600;">Rejected Applications</div>
        </div>
      </div>
    </div>

    <!-- Executive Graphs (Full Width) -->
    <div class="card glass-card" style="margin-bottom:24px;">
      <div class="card-header">
        <h2>SRF Edition Status & Progress</h2>
      </div>
      <div class="card-body" style="display:grid; grid-template-columns:1fr 1.2fr; gap:24px; padding: 20px;">
        <div>
          <span style="font-size:12px; font-weight:600; color:var(--text-muted); display:block; text-align:center; margin-bottom:12px;">Application Status Overview</span>
          <div class="chart-container-wrap" style="height: 250px; position: relative;">
            <canvas id="admin-status-overview-chart"></canvas>
          </div>
        </div>
        <div>
          <span style="font-size:12px; font-weight:600; color:var(--text-muted); display:block; text-align:center; margin-bottom:12px;">District Compliance Progress (%)</span>
          <div class="chart-container-wrap" style="height: 250px; position: relative;">
            <canvas id="admin-district-compliance-chart"></canvas>
          </div>
        </div>
      </div>
    </div>

    <!-- District Benchmarking & Leaderboard -->
    <div class="card glass-card" style="margin-bottom:24px;">
      <div class="card-header">
        <h2>District Performance Leaderboard & Benchmarking</h2>
      </div>
      <div class="card-body p-0">
        <table class="admin-dashboard-table">
          <thead>
            <tr>
              <th style="width: 80px; text-align: center;">Rank</th>
              <th>District / State</th>
              <th>Total Submissions</th>
              <th>Evidence Documents</th>
              <th>Compliance Score</th>
              <th>Evaluation Status</th>
            </tr>
          </thead>
          <tbody>
            ${districtData.map((d, index) => {
              return `
                <tr>
                  <td style="text-align: center; font-weight: bold; color: var(--text-muted);">${index + 1}</td>
                  <td>
                    <strong>${d.user.district || 'General'}</strong>
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${d.user.organization || d.user.state || ''}</div>
                  </td>
                  <td>
                    <span style="font-weight: 600;">${d.appCount}</span> Application(s)
                  </td>
                  <td>
                    <span style="font-weight: 600; color: var(--accent-blue);">${d.docCount}</span> File(s)
                  </td>
                  <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <strong style="color: var(--accent-indigo); min-width: 45px;">${d.compliance.toFixed(1)}%</strong>
                      <div class="reform-progress-bar-container" style="width: 80px; height: 6px; margin: 0; background: var(--border-color); border-radius: 3px; overflow: hidden;">
                        <div class="reform-progress-fill" style="width: ${d.compliance}%; height: 100%; background: var(--accent-indigo); border-radius: 3px;"></div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span class="status-badge ${d.statusClass}" style="font-size: 11px; padding: 4px 10px; border-radius: 99px;">${d.statusLabel}</span>
                  </td>
                </tr>
              `;
            }).join('')}
            ${districtData.length === 0 ? `
              <tr>
                <td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">No districts configured.</td>
              </tr>
            ` : ''}
          </tbody>
        </table>
      </div>
    </div>

    <!-- District-wise Application Status Bar Graph -->
    <div class="card glass-card" style="margin-bottom:24px;">
      <div class="card-header">
        <h2>📊 District-wise Application Status</h2>
      </div>
      <div class="card-body" style="padding:20px;">
        <div class="chart-container-wrap" style="height: 380px; position: relative;">
          <canvas id="admin-district-bar-graph"></canvas>
        </div>
      </div>
    </div>

    <!-- Tabbed Application Workflow Queue -->
    <div class="card glass-card" style="margin-bottom:24px;">
      <div class="card-header">
        <h2>Application Workflow Lifecycle Queue</h2>
      </div>
      <div class="card-body p-0" id="workflow-lifecycle-table-container">
        <!-- Will be populated by renderAdminTabbedTable -->
      </div>
    </div>
  `;

  // Render Workflow Lifecycle Table
  const lifecycleContainer = container.querySelector('#workflow-lifecycle-table-container');
  if (lifecycleContainer) {
    renderAdminTabbedTable(lifecycleContainer, selectedEditionId, isSuperAdmin(), container);
  }

  // Bind Edition filter dropdown
  const filterDropdown = container.querySelector('#analytics-filter-edition');
  if (filterDropdown) {
    filterDropdown.addEventListener('change', (e) => {
      currentAnalyticsEditionId = e.target.value;
      renderAdminAnalyticsDashboard(container);
    });
  }

  // Bind clickable stat cards (hover + click to scroll to workflow table)
  container.querySelectorAll('.analytics-stat-card').forEach(card => {
    card.addEventListener('mouseenter', () => { card.style.transform = 'translateY(-3px)'; card.style.boxShadow = '0 6px 16px rgba(0,0,0,0.12)'; });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; card.style.boxShadow = ''; });
    card.addEventListener('click', () => {
      const workflowSection = container.querySelector('#workflow-lifecycle-table-container');
      if (workflowSection) {
        workflowSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Bind Export button
  container.querySelector('.btn-export-summary').addEventListener('click', () => {
    downloadExecutiveReport(currentAnalyticsEditionId);
  });

  // Render Charts
  setTimeout(() => {
    // 1. Status Overview Chart (Doughnut)
    const ctxOverview = document.getElementById('admin-status-overview-chart')?.getContext('2d');
    if (ctxOverview) {
      new Chart(ctxOverview, {
        type: 'doughnut',
        data: {
          labels: ['Approved', 'Pending Review', 'In Progress', 'Rejected'],
          datasets: [{
            data: [
              allFilteredApps.filter(a => ['Admin Approved', 'Final Approved', 'Approved'].includes(a.status)).length,
              allFilteredApps.filter(a => ['Submitted', 'Under Review', 'Resubmitted', 'Super Admin Review'].includes(a.status)).length,
              allFilteredApps.filter(a => a.status === 'Draft' || a.status === 'Additional Documents Requested').length,
              allFilteredApps.filter(a => a.status === 'Rejected').length
            ],
            backgroundColor: ['#10b981', '#cbd5e1', '#f59e0b', '#ef4444'],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } }
          }
        }
      });
    }

    // 2. District Compliance Progress (Bar Chart)
    const ctxBar = document.getElementById('admin-district-compliance-chart')?.getContext('2d');
    if (ctxBar) {
      const labels = districtData.map(d => d.user.district || 'General');
      const data = districtData.map(d => d.compliance);
      
      new Chart(ctxBar, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Compliance Rate (%)',
            data: data,
            backgroundColor: 'rgba(99, 102, 241, 0.85)',
            borderColor: '#6366f1',
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              grid: { color: 'rgba(0,0,0,0.02)' },
              ticks: {
                callback: function(value) {
                  return value + '%';
                }
              }
            },
            x: {
              grid: { display: false }
            }
          }
        }
      });
    }

    // 3. District-wise Application Status Bar Graph (Elegant Grouped)
    const ctxDistrictBar = document.getElementById('admin-district-bar-graph')?.getContext('2d');
    if (ctxDistrictBar) {
      // Group applications by district — use a smart label fallback:
      // prefer district if it's a real name (not just "District"), else try city, then organization, then state
      const districtGroups = {};
      allFilteredApps.forEach(app => {
        const appUser = (db.users || []).find(u => u.id === app.userId);
        const rawDistrict = (appUser?.district || '').trim();
        const rawOrg = (appUser?.organization || '').trim();
        const rawState = (appUser?.state || '').trim();
        const rawCity = (appUser?.city || '').trim();
        // Skip generic placeholder values
        const isGeneric = (v) => !v || ['district', 'n/a', 'na', 'none', 'unknown', 'org', 'organization'].includes(v.toLowerCase());
        let label = rawDistrict;
        if (isGeneric(label)) label = rawCity;
        if (isGeneric(label)) label = rawOrg;
        if (isGeneric(label)) label = rawState;
        if (isGeneric(label)) label = appUser?.name || 'Unknown';
        if (!districtGroups[label]) {
          districtGroups[label] = { draft: 0, submitted: 0, approved: 0, rejected: 0 };
        }
        if (app.status === 'Draft') districtGroups[label].draft++;
        else if (['Submitted', 'Under Review', 'Resubmitted', 'Additional Documents Requested'].includes(app.status)) districtGroups[label].submitted++;
        else if (['Admin Approved', 'Final Approved', 'Approved'].includes(app.status)) districtGroups[label].approved++;
        else if (app.status === 'Rejected') districtGroups[label].rejected++;
      });

      const districtLabels = Object.keys(districtGroups);

      // Wrap long labels so they don't clip
      const wrapLabel = (label, maxLen = 14) => {
        if (label.length <= maxLen) return label;
        const words = label.split(' ');
        const lines = [];
        let cur = '';
        words.forEach(w => {
          if ((cur + ' ' + w).trim().length > maxLen) { lines.push(cur.trim()); cur = w; }
          else { cur = (cur + ' ' + w).trim(); }
        });
        if (cur) lines.push(cur);
        return lines;
      };

      new Chart(ctxDistrictBar, {
        type: 'bar',
        data: {
          labels: districtLabels.map(l => wrapLabel(l)),
          datasets: [
            {
              label: 'Draft',
              data: districtLabels.map(d => districtGroups[d].draft),
              backgroundColor: 'rgba(107, 114, 128, 0.75)',
              borderColor: 'rgba(107, 114, 128, 1)',
              borderWidth: 0,
              borderRadius: { topLeft: 5, topRight: 5 },
              borderSkipped: false,
              barPercentage: 0.72,
              categoryPercentage: 0.6
            },
            {
              label: 'Submitted',
              data: districtLabels.map(d => districtGroups[d].submitted),
              backgroundColor: 'rgba(59, 130, 246, 0.75)',
              borderColor: 'rgba(59, 130, 246, 1)',
              borderWidth: 0,
              borderRadius: { topLeft: 5, topRight: 5 },
              borderSkipped: false,
              barPercentage: 0.72,
              categoryPercentage: 0.6
            },
            {
              label: 'Approved',
              data: districtLabels.map(d => districtGroups[d].approved),
              backgroundColor: 'rgba(16, 185, 129, 0.75)',
              borderColor: 'rgba(16, 185, 129, 1)',
              borderWidth: 0,
              borderRadius: { topLeft: 5, topRight: 5 },
              borderSkipped: false,
              barPercentage: 0.72,
              categoryPercentage: 0.6
            },
            {
              label: 'Rejected',
              data: districtLabels.map(d => districtGroups[d].rejected),
              backgroundColor: 'rgba(239, 68, 68, 0.75)',
              borderColor: 'rgba(239, 68, 68, 1)',
              borderWidth: 0,
              borderRadius: { topLeft: 5, topRight: 5 },
              borderSkipped: false,
              barPercentage: 0.72,
              categoryPercentage: 0.6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                boxWidth: 12,
                boxHeight: 12,
                borderRadius: 3,
                useBorderRadius: true,
                font: { size: 12, family: 'Inter, system-ui, sans-serif', weight: '500' },
                padding: 20,
                color: '#64748b'
              }
            },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.92)',
              titleFont: { size: 13, weight: '600', family: 'Inter, system-ui, sans-serif' },
              bodyFont: { size: 12, family: 'Inter, system-ui, sans-serif' },
              padding: { top: 10, bottom: 10, left: 14, right: 14 },
              cornerRadius: 10,
              boxPadding: 6,
              callbacks: {
                title: function(items) { return '📍 ' + items[0].label; },
                label: function(ctx) {
                  const icons = { Draft: '📝', Submitted: '📤', Approved: '✅', Rejected: '❌' };
                  return ` ${icons[ctx.dataset.label] || '•'} ${ctx.dataset.label}: ${ctx.raw} application(s)`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                font: { size: 12, weight: '500', family: 'Inter, system-ui, sans-serif' },
                color: '#475569',
                maxRotation: 30,
                minRotation: 0,
                padding: 8,
                autoSkip: false
              },
              border: { display: false }
            },
            y: {
              beginAtZero: true,
              grid: {
                color: 'rgba(148, 163, 184, 0.1)',
                drawBorder: false,
                lineWidth: 1
              },
              ticks: {
                stepSize: 1,
                font: { size: 11, family: 'Inter, system-ui, sans-serif' },
                color: '#94a3b8',
                padding: 8,
                callback: function(value) { return Number.isInteger(value) ? value : ''; }
              },
              border: { display: false }
            }
          },
          animation: {
            duration: 800,
            easing: 'easeOutQuart'
          }
        }
      });
    }
  }, 100);
}

// ─── TABBED WORKFLOW LIFECYCLE TABLE (Super Admin / Admin) ─────────────────
function renderAdminTabbedTable(tableContainer, selectedEditionId, isSuper, dashboardContainer) {
  const db = Store.getDb();
  if (!db) return;

  const tabs = isSuper ? [
    { id: 'submitted', label: 'Submitted / Under Review' },
    { id: 'pendingFinal', label: 'Pending Final Review' },
    { id: 'approved', label: 'Final Approved' },
    { id: 'rejected', label: 'Rejected' }
  ] : [
    { id: 'submitted', label: 'Submitted Queue' },
    { id: 'reviewed', label: 'Reviewed History' }
  ];

  let activeTab = isSuper ? activeSaTab : activeAdTab;
  if (isSuper && (activeTab === 'notStarted' || activeTab === 'draft' || activeTab === 'underReview')) {
    activeTab = 'submitted';
    activeSaTab = 'submitted';
  } else if (!isSuper && activeTab === 'draft') {
    activeTab = 'submitted';
    activeAdTab = 'submitted';
  }

  const adminOrg = getCurrentUser().organization || '';

  const editionApps = (db.applications || []).filter(a => {
    if (a.editionId !== selectedEditionId) return false;
    if (!isSuper && adminOrg !== 'DPIIT') {
      const applicant = (db.users || []).find(u => u.id === a.userId);
      if (!applicant || applicant.organization !== adminOrg) return false;
    }
    return true;
  });

  // Compute Not Started
  const editionAssignments = (db.assignments || []).filter(a => a.editionId === selectedEditionId);
  const assignedUserIds = [...new Set(editionAssignments.map(a => a.userId))];
  const assignedUsers = (db.users || []).filter(u => assignedUserIds.includes(u.id) && u.role === 'user');
  
  let filteredAssignedUsers = assignedUsers;
  if (!isSuper && adminOrg !== 'DPIIT') {
    filteredAssignedUsers = assignedUsers.filter(u => u.organization === adminOrg);
  }

  const notStartedUsers = filteredAssignedUsers.filter(u => {
    const hasApp = (db.applications || []).some(app => app.editionId === selectedEditionId && app.userId === u.id);
    return !hasApp;
  });

  let tableHtml = '';

  if (activeTab === 'notStarted') {
    if (notStartedUsers.length === 0) {
      tableHtml = `
        <div class="empty-state" style="padding: 24px; text-align: center;">
          <p style="color: var(--text-muted); margin: 0;">No uninitiated assignments. All assigned nodal officers have started application drafts.</p>
        </div>
      `;
    } else {
      tableHtml = `
        <table class="benchmarking-table">
          <thead>
            <tr>
              <th>District</th>
              <th>State</th>
              <th>Nodal Agency</th>
              <th>Status</th>
              <th>Assignments</th>
            </tr>
          </thead>
          <tbody>
            ${notStartedUsers.map(u => {
              const uAssigns = editionAssignments.filter(a => a.userId === u.id);
              const assignLabels = uAssigns.map(a => {
                if (a.type === 'Question') {
                  const f = Store.getFieldById(a.questionId || a.fieldId);
                  return f ? `Q${f.num}` : 'Question';
                } else if (a.type === 'Reform Area') {
                  const r = Store.getReformAreaById(a.sectionId || a.reformAreaId);
                  return r ? r.name : 'Section';
                }
                return 'General';
              }).join(', ');

              return `
                <tr>
                  <td><strong>${u.district || 'General'}</strong></td>
                  <td>${u.state || '—'}</td>
                  <td>${u.organization || '—'}</td>
                  <td><span class="status-badge status-draft" style="background: rgba(100,116,139,0.08); color: #64748b;">Not Started</span></td>
                  <td><span style="font-size:12.5px; color:var(--text-muted);">${assignLabels || 'All Sections'}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }
  } else {
    // Helper: check if a Draft application has at least one individually submitted question
    const hasDraftSubmittedQuestion = (app) => {
      if (app.status !== 'Draft') return false;
      const answers = Store.getAnswersByApplication(app.id) || [];
      return answers.some(ans => ans.questionStatus === 'Submitted' || ans.questionStatus === 'Approved' || ans.questionStatus === 'Rejected');
    };

    // Include Draft apps with submitted questions in the "Submitted" queue
    const draftsWithSubmittedQs = editionApps.filter(a => hasDraftSubmittedQuestion(a));

    const appsToRender = isSuper
      ? (activeTab === 'submitted' ? [...editionApps.filter(a => ['Submitted', 'Under Review', 'Resubmitted', 'Additional Documents Requested'].includes(a.status)), ...draftsWithSubmittedQs]
         : activeTab === 'pendingFinal' ? editionApps.filter(a => ['Admin Approved', 'Super Admin Review'].includes(a.status))
         : activeTab === 'approved' ? editionApps.filter(a => ['Final Approved', 'Approved'].includes(a.status))
         : editionApps.filter(a => a.status === 'Rejected'))
      : (activeTab === 'submitted' ? [...editionApps.filter(a => ['Submitted', 'Under Review', 'Resubmitted', 'Additional Documents Requested'].includes(a.status)), ...draftsWithSubmittedQs]
         : editionApps.filter(a => ['Admin Approved', 'Final Approved', 'Approved', 'Rejected'].includes(a.status)));

    if (appsToRender.length === 0) {
      tableHtml = `
        <div class="empty-state" style="padding: 24px; text-align: center;">
          <p style="color: var(--text-muted); margin: 0;">No applications found in this section.</p>
        </div>
      `;
    } else {
      tableHtml = `
        <table class="benchmarking-table">
          <thead>
            <tr>
              <th>Application ID</th>
              <th>District</th>
              <th>Nodal Agency</th>
              <th>Compliance Score</th>
              <th>Progress</th>
              <th>Status</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${appsToRender.map(app => {
              const user = Store.getUserById(app.userId);
              const score = Store.calculateApplicationScore(app.id) || 0;
              const maxScore = Store.calculateApplicationMaxScore(app.id) || 1;
              const pct = ((score / maxScore) * 100).toFixed(0);

              return `
                <tr>
                  <td><code class="app-id-code">${app.id}</code></td>
                  <td><strong>${user?.district || 'General'}</strong> <span style="font-size:11px; color:var(--text-muted);">(${user?.state || ''})</span></td>
                  <td>${user?.organization || '—'}</td>
                  <td><strong>${score} / ${maxScore}</strong></td>
                  <td>
                    <div style="display:flex; align-items:center; gap:8px; width: 120px;">
                      <div class="reform-progress-bar-container" style="flex:1; height: 6px; margin: 0;">
                        <div class="reform-progress-fill" style="width: ${pct}%;"></div>
                      </div>
                      <span style="font-size:11px; font-weight:600; min-width:28px; text-align:right;">${pct}%</span>
                    </div>
                  </td>
                  <td><span class="status-badge ${userFriendlyStatusClass(app.status)}">${userFriendlyStatus(app.status)}</span></td>
                  <td style="text-align: right;">
                    <button class="btn btn-xs btn-outline btn-open-workspace" data-id="${app.id}">Open Workspace</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }
  }

  tableContainer.innerHTML = `
    <div class="workspace-nav-tabs" style="margin: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; display: flex; gap: 8px; flex-wrap: wrap;">
      ${tabs.map(t => `
        <button class="workspace-tab-link ${t.id === activeTab ? 'active' : ''} ${isSuper ? 'btn-sa-tab' : 'btn-ad-tab'}" data-tab="${t.id}" style="background: none; border: none; padding: 8px 16px; cursor: pointer; font-size: 13px; font-weight: 600; color: ${t.id === activeTab ? 'var(--primary)' : 'var(--text-muted)'}; border-bottom: ${t.id === activeTab ? '2px solid var(--primary)' : 'none'}; transition: all var(--transition-fast);">
          ${t.label}
        </button>
      `).join('')}
    </div>
    <div id="admin-tabs-table-content" style="padding: 0 16px 16px 16px;">
      ${tableHtml}
    </div>
  `;

  // Bind Tab Click events
  tableContainer.querySelectorAll('.workspace-tab-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      if (isSuper) {
        activeSaTab = tabId;
      } else {
        activeAdTab = tabId;
      }
      renderAdminTabbedTable(tableContainer, selectedEditionId, isSuper, dashboardContainer);
    });
  });

  // Bind Open Workspace click events
  tableContainer.querySelectorAll('.btn-open-workspace').forEach(btn => {
    btn.addEventListener('click', () => {
      const appId = btn.dataset.id;
      renderTabbedApplicationWorkspace(dashboardContainer, appId);
    });
  });
}

// ─── CLIENT-SIDE EXPORTS GENERATOR ──────────────────────────────────────────
export function downloadApplicationPdf(appId) {
  const app = Store.getApplicationById(appId);
  const edition = Store.getEditionById(app.editionId);
  const answers = Store.getAnswersByApplication(appId);
  const fields = Store.getFieldsByEdition(app.editionId);
  const user = Store.getUserById(app.userId);

  let html = `
    <html>
    <head>
      <title>Application PDF - ${appId}</title>
      <style>
        body { font-family: 'Outfit', 'Inter', sans-serif; padding: 40px; color: #0f172a; line-height: 1.6; }
        .header { text-align: center; border-bottom: 3px solid #312e81; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { margin: 8px 0 2px; font-size: 24px; color: #312e81; text-transform: uppercase; }
        .meta-table { width: 100%; margin-bottom: 30px; border-collapse: collapse; }
        .meta-table td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
        .meta-table td:first-child { font-weight: bold; color: #475569; width: 180px; }
        .question-block { margin-bottom: 20px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; }
        .question-title { font-weight: 700; color: #1e293b; margin-bottom: 10px; font-size: 14.5px; border-bottom: 1px dashed #f1f5f9; padding-bottom: 6px; }
        .answer { background: #f8fafc; padding: 12px; border-radius: 6px; font-style: italic; color: #334155; font-size: 13.5px; }
        .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 15px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>SRF Compliance Application Dossier</h1>
        <p style="margin:4px 0 0; font-size:13px; color:#475569;">Generated on ${new Date().toLocaleDateString('en-IN')}</p>
      </div>
      
      <table class="meta-table">
        <tr><td>Application ID</td><td><code>${appId}</code></td></tr>
        <tr><td>Framework Edition</td><td><strong>${edition?.name || 'SRF'}</strong></td></tr>
        <tr><td>Nodal Agency</td><td>${user?.organization || '—'}</td></tr>
        <tr><td>District / State</td><td>${user?.district || '—'} / ${user?.state || '—'}</td></tr>
        <tr><td>Current Status</td><td><strong>${app.status}</strong></td></tr>
      </table>
      
      <h2 style="font-size: 18px; color: #312e81; margin-bottom: 16px;">Responses & Submissions</h2>
      ${fields.filter(f => !f.isLayoutElement).map(f => {
        const ans = answers.find(a => a.fieldId === f.id);
        const filesText = ans?.files?.map(file => `📎 ${file.name} [${file.fileStatus || 'Pending'}]`).join(', ') || 'No documents uploaded';
        return `
          <div class="question-block">
            <div class="question-title">Q${f.num}: ${f.label || f.text}</div>
            <div class="answer">${ans?.value || '<em>Not answered yet</em>'}</div>
            <div style="font-size:11.5px; color:#64748b; margin-top:10px; font-weight:600;">Uploaded Documents: ${filesText}</div>
          </div>
        `;
      }).join('')}

      <div class="footer">
        <p>This report is classified as OFFICIAL USE ONLY. Powered by the State Startup Ranking Framework (SRF) Intelligence Platform.</p>
      </div>
    </body>
    </html>
  `;
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  } else {
    showToast('Please allow popups to download report', 'warning');
  }
}

export function downloadComplianceReport(appId) {
  const app = Store.getApplicationById(appId);
  const edition = Store.getEditionById(app.editionId);
  const score = Store.calculateApplicationScore(appId) || 0;
  const maxScore = Store.calculateApplicationMaxScore(appId) || 1;
  const pct = ((score / maxScore) * 100).toFixed(1);
  const answers = Store.getAnswersByApplication(appId);
  const fields = Store.getFieldsByEdition(app.editionId);
  const user = Store.getUserById(app.userId);

  const answered = fields.filter(f => !f.isLayoutElement && answers.some(a => a.fieldId === f.id && a.value?.trim())).length;
  const total = fields.filter(f => !f.isLayoutElement).length || 1;

  let html = `
    <html>
    <head>
      <title>Compliance Performance Report</title>
      <style>
        body { font-family: 'Outfit', 'Inter', sans-serif; padding: 40px; color: #0f172a; line-height: 1.6; }
        .header { text-align: center; border-bottom: 3px solid #10b981; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { margin: 8px 0 2px; font-size: 24px; color: #10b981; text-transform: uppercase; }
        .metric-container { display: flex; gap: 20px; margin-bottom: 30px; }
        .metric-card { background: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; border-radius: 12px; flex: 1; text-align: center; }
        .metric-val { font-size: 32px; font-weight: bold; color: #15803d; margin-bottom: 4px; }
        .meta-table { width: 100%; margin-bottom: 30px; border-collapse: collapse; }
        .meta-table td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
        .meta-table td:first-child { font-weight: bold; color: #475569; width: 180px; }
        .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 15px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Framework Compliance & Benchmarking</h1>
        <p style="margin:4px 0 0; font-size:13px; color:#475569;">Generated on ${new Date().toLocaleDateString('en-IN')}</p>
      </div>

      <table class="meta-table">
        <tr><td>Application ID</td><td><code>${appId}</code></td></tr>
        <tr><td>Framework Edition</td><td><strong>${edition?.name || 'SRF'}</strong></td></tr>
        <tr><td>Nodal Agency</td><td>${user?.organization || '—'}</td></tr>
        <tr><td>District / State</td><td>${user?.district || '—'} / ${user?.state || '—'}</td></tr>
      </table>
      
      <div class="metric-container">
        <div class="metric-card">
          <div class="metric-val">${pct}%</div>
          <div style="font-weight:600; color:#166534;">Completeness Rate</div>
        </div>
        <div class="metric-card" style="background:#f0f9ff; border-color:#bae6fd;">
          <div class="metric-val" style="color:#0369a1;">${answered} / ${total}</div>
          <div style="font-weight:600; color:#075985;">Questions Answered</div>
        </div>
      </div>
      
      <h3 style="font-size:16px; border-bottom:1px solid #e2e8f0; padding-bottom:6px;">Compliance Status Details</h3>
      <ul style="padding-left:20px; font-size:14px; display:flex; flex-direction:column; gap:8px;">
        <li>Current Evaluation Phase: <strong>${app.status}</strong></li>
        <li>Last Activity Date: <strong>${new Date(app.updatedAt).toLocaleString('en-IN')}</strong></li>
        <li>Reviewer Official remarks: <strong>${app.reviewerComments || 'Under active evaluation. Awaiting DPIIT response.'}</strong></li>
      </ul>

      <div class="footer">
        <p>This report is classified as OFFICIAL USE ONLY. Powered by the State Startup Ranking Framework (SRF) Intelligence Platform.</p>
      </div>
    </body>
    </html>
  `;
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  } else {
    showToast('Please allow popups to download report', 'warning');
  }
}

export function downloadScoreSheet(appId) {
  const app = Store.getApplicationById(appId);
  const edition = Store.getEditionById(app.editionId);
  const answers = Store.getAnswersByApplication(appId);
  const fields = Store.getFieldsByEdition(app.editionId);
  const user = Store.getUserById(app.userId);

  let html = `
    <html>
    <head>
      <title>Official Score Sheet</title>
      <style>
        body { font-family: 'Outfit', 'Inter', sans-serif; padding: 40px; color: #0f172a; line-height: 1.6; }
        .header { text-align: center; border-bottom: 3px solid #4f46e5; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { margin: 8px 0 2px; font-size: 24px; color: #4f46e5; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13.5px; }
        th { background: #f8fafc; border-bottom: 2px solid #cbd5e1; padding: 12px; text-align: left; font-weight: bold; }
        td { border-bottom: 1px solid #f1f5f9; padding: 12px; }
        .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 15px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>DPIIT Evaluation Score Sheet</h1>
        <p style="margin:4px 0 0; font-size:13px; color:#475569;">Generated on ${new Date().toLocaleDateString('en-IN')} | Ref: ${appId}</p>
      </div>

      <p style="font-size:14px;">Nodal Officer: <strong>${user?.name}</strong> | Organization: <strong>${user?.organization}</strong></p>
      
      <table>
        <thead>
          <tr>
            <th style="width:70px;">Q.No</th>
            <th>Question Description</th>
            <th style="width:120px;">Review Status</th>
            <th style="width:120px; text-align:center;">Score Obtained</th>
            <th style="width:100px; text-align:center;">Max Weight</th>
            <th>Evaluator Notes</th>
          </tr>
        </thead>
        <tbody>
          ${fields.filter(f => !f.isLayoutElement).map(f => {
            const ans = answers.find(a => a.fieldId === f.id);
            const score = ans?.questionStatus === 'Approved' ? (ans.questionScore || 0) : 0;
            const max = f.maxScore || f.weight || 1;
            return `
              <tr>
                <td>Q${f.num}</td>
                <td>${f.label || f.text}</td>
                <td><strong>${ans?.questionStatus || 'Awaiting Review'}</strong></td>
                <td style="text-align:center; font-weight:bold; color:var(--accent-indigo);">${score}</td>
                <td style="text-align:center;">${max}</td>
                <td>${ans?.adminRemarks || '—'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <div class="footer">
        <p>This report is classified as OFFICIAL USE ONLY. Powered by the State Startup Ranking Framework (SRF) Intelligence Platform.</p>
      </div>
    </body>
    </html>
  `;
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  } else {
    showToast('Please allow popups to download report', 'warning');
  }
}

export function downloadTimelineReport(appId) {
  const app = Store.getApplicationById(appId);
  const user = Store.getUserById(app.userId);

  let html = `
    <html>
    <head>
      <title>Application Lifecycle Timeline</title>
      <style>
        body { font-family: 'Outfit', 'Inter', sans-serif; padding: 40px; color: #0f172a; line-height: 1.6; }
        .header { text-align: center; border-bottom: 3px solid #f97316; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { margin: 8px 0 2px; font-size: 24px; color: #f97316; text-transform: uppercase; }
        .timeline-item { border-left: 3px solid #f97316; padding-left: 15px; margin-bottom: 20px; position: relative; }
        .timeline-dot { width: 10px; height: 10px; background: #f97316; border-radius: 50%; position: absolute; left: -7px; top: 5px; }
        .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 15px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>DPIIT Evaluation Timeline Log</h1>
        <p style="margin:4px 0 0; font-size:13px; color:#475569;">Generated on ${new Date().toLocaleDateString('en-IN')} | Ref: ${appId}</p>
      </div>

      <p style="font-size:14px; margin-bottom:30px;">Nodal Cell: <strong>${user?.organization}</strong> | Location: <strong>${user?.district}, ${user?.state}</strong></p>
      
      <div style="margin-top: 30px;">
        ${(app.timeline || []).map(t => `
          <div class="timeline-item">
            <div class="timeline-dot"></div>
            <strong style="color:#1e293b; font-size:14.5px;">${t.action}</strong>
            <div style="font-size:12px; color:#64748b;">${new Date(t.timestamp).toLocaleString('en-IN')} | By: ${t.by}</div>
            ${t.remarks ? `<div style="font-style:italic; margin-top:4px; font-size:13px; color:#475569;">Notes: "${t.remarks}"</div>` : ''}
          </div>
        `).join('')}
      </div>

      <div class="footer">
        <p>This report is classified as OFFICIAL USE ONLY. Powered by the State Startup Ranking Framework (SRF) Intelligence Platform.</p>
      </div>
    </body>
    </html>
  `;
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  } else {
    showToast('Please allow popups to download report', 'warning');
  }
}
