/* ==========================================================================
   schema.js — Multi-Edition Data Schema v2.1
   Dynamic SRF Management Platform — Reform-Area Centric
   ========================================================================== */

export const DB_VERSION = 3;
export const DB_KEY = 'srf_platform_v3';
export const MIGRATION_KEY = 'srf_v3_migrated';

export function createEmptyDb() {
  return {
    version: DB_VERSION,
    editions: [],
    reformAreas: [],       // replaces "sections" everywhere
    formFields: [],        // questions / elements inside reform areas
    applications: [],
    applicationAnswers: [], // one per field per application
    users: [],
    departments: [],
    roles: buildDefaultRoles(),
    notifications: [],
    assignments: [],
    reassignmentHistory: [],
    auditLogs: [],
    schemaVersions: [],    // version history for each edition schema
    messages: [],
    recycleBin: [],
    settings: {
      platformName: 'SRF Management Platform',
      orgName: 'DPIIT',
      logoText: 'SRF Portal',
      autoSaveDraftInterval: 30000,
    }
  };
}

export function buildDefaultRoles() {
  return [
    { id: 'role_superadmin', name: 'Super Admin', key: 'superadmin', permissions: ['*'] },
    {
      id: 'role_admin', name: 'Admin', key: 'admin',
      permissions: [
        'edition:create', 'edition:edit', 'edition:publish', 'edition:archive', 'edition:clone', 'edition:delete',
        'reformArea:create', 'reformArea:edit', 'reformArea:delete', 'reformArea:assign',
        'application:view', 'application:approve', 'application:reject', 'application:delete', 'application:download',
        'application:request_docs', 'application:comment', 'question:approve', 'question:reject',
        'document:approve', 'document:reject',
        'user:view', 'user:assign', 'user:create',
        'schema:edit', 'schema:version',
        'audit:view', 'notification:manage'
      ]
    },
    {
      id: 'role_reviewer', name: 'Reviewer', key: 'reviewer',
      permissions: ['application:view', 'application:comment', 'question:approve', 'question:reject', 'document:approve', 'document:reject', 'audit:view']
    },
    {
      id: 'role_user', name: 'User', key: 'user',
      permissions: ['application:submit', 'application:view_own', 'application:draft', 'document:upload', 'notification:view_own']
    }
  ];
}

export function buildDefaultUsers() {
  return [
    {
      id: 'user_superadmin', username: 'superadmin_placeholder', password: '',
      email: 'superadmin@srfportal.gov.in', role: 'superadmin',
      name: 'Super Administrator', organization: 'DPIIT', createdAt: new Date().toISOString(), active: true
    },
    {
      id: 'user_admin', username: 'admin_placeholder', password: '',
      email: 'admin@srfportal.gov.in', role: 'admin',
      name: 'DPIIT Admin', organization: 'DPIIT', createdAt: new Date().toISOString(), active: true
    },
    {
      id: 'user_alpha', username: 'user_placeholder', password: '',
      email: 'startup.cell@statealpha.gov.in', role: 'user',
      name: 'State Alpha', organization: 'State Alpha Startup Cell',
      category: 'cat_a1', state: 'State Alpha', district: 'Bengaluru',
      sector: 'IT / DeepTech', nodalOfficer: 'Shri Rajesh Kumar',
      startupName: 'Alpha Startup Hub', createdAt: new Date().toISOString(), active: true
    }
  ];
}

export const DEFAULT_SRF_6_EDITION = {
  id: 'edition_srf_6_0',
  name: 'SRF 6.0',
  version: '6.0',
  description: "States' Startup Ranking Framework 6.0 — DPIIT Initiatives 2026",
  startDate: '2025-04-01',
  endDate: '2026-03-31',
  status: 'published',
  createdBy: 'superadmin',
  createdAt: '2025-04-01T00:00:00.000Z',
  categories: [
    { id: 'cat_a1', name: 'Category A1 (Population > 5 Cr)', shortName: 'A1' },
    { id: 'cat_a2', name: 'Category A2 (Population 1-5 Cr)', shortName: 'A2' },
    { id: 'cat_b', name: 'Category B (Population < 1 Cr)', shortName: 'B' }
  ],
  totalMarks: 100
};

// ─── APPLICATION / QUESTION STATUSES ─────────────────────────────────────
export const APP_STATUS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  RESUBMITTED: 'Resubmitted',
  ADDITIONAL_DOCS_REQUESTED: 'Additional Documents Requested',
};

export const QUESTION_STATUS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  RESUBMITTED: 'Resubmitted',
};

export const DOC_STATUS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export const NOTIFICATION_EVENTS = {
  APPLICATION_SUBMITTED: 'APPLICATION_SUBMITTED',
  APPLICATION_APPROVED: 'APPLICATION_APPROVED',
  APPLICATION_REJECTED: 'APPLICATION_REJECTED',
  APPLICATION_ASSIGNED: 'APPLICATION_ASSIGNED',
  REFORM_AREA_SUBMITTED: 'REFORM_AREA_SUBMITTED',
  QUESTION_APPROVED: 'QUESTION_APPROVED',
  QUESTION_REJECTED: 'QUESTION_REJECTED',
  DOCUMENT_APPROVED: 'DOCUMENT_APPROVED',
  DOCUMENT_REJECTED: 'DOCUMENT_REJECTED',
  ADDITIONAL_DOCS_REQUESTED: 'ADDITIONAL_DOCS_REQUESTED',
  EDITION_PUBLISHED: 'EDITION_PUBLISHED',
  USER_CREATED: 'USER_CREATED',
};

// ─── TOOLBOX ELEMENT TYPES ────────────────────────────────────────────────
export const TOOLBOX_ELEMENTS = [
  // Layout
  { id: 'heading', label: 'Heading', icon: 'H1', category: 'layout', color: '#4f46e5' },
  { id: 'subheading', label: 'Sub Heading', icon: 'H2', category: 'layout', color: '#4f46e5' },
  { id: 'description', label: 'Description', icon: '¶', category: 'layout', color: '#4f46e5' },
  { id: 'instruction', label: 'Instruction Text', icon: 'ℹ', category: 'layout', color: '#4f46e5' },
  { id: 'divider', label: 'Section Divider', icon: '—', category: 'layout', color: '#4f46e5' },
  { id: 'card', label: 'Card Component', icon: '▭', category: 'layout', color: '#4f46e5' },
  { id: 'banner', label: 'Banner', icon: '◈', category: 'layout', color: '#4f46e5' },
  { id: 'notes', label: 'Notes', icon: '📝', category: 'layout', color: '#10b981' },
  { id: 'warning', label: 'Warning Message', icon: '⚠', category: 'layout', color: '#d97706' },
  // Media
  { id: 'image', label: 'Image', icon: '🖼', category: 'media', color: '#0284c7' },
  { id: 'hyperlink', label: 'Hyperlink', icon: '🔗', category: 'media', color: '#0284c7' },
  // Input fields
  { id: 'text', label: 'Textbox', icon: 'T', category: 'input', color: '#7e22ce' },
  { id: 'textarea', label: 'Textarea', icon: '≡', category: 'input', color: '#7e22ce' },
  { id: 'number', label: 'Number Field', icon: '#', category: 'input', color: '#7e22ce' },
  { id: 'email', label: 'Email Field', icon: '@', category: 'input', color: '#7e22ce' },
  { id: 'mobile', label: 'Mobile Number', icon: '📱', category: 'input', color: '#7e22ce' },
  { id: 'date', label: 'Date Picker', icon: '📅', category: 'input', color: '#7e22ce' },
  { id: 'url', label: 'URL Field', icon: '🌐', category: 'input', color: '#7e22ce' },
  { id: 'richtext', label: 'Rich Text Editor', icon: '✏', category: 'input', color: '#7e22ce' },
  // Choice
  { id: 'radio', label: 'Radio Button', icon: '◉', category: 'choice', color: '#10b981' },
  { id: 'checkbox', label: 'Checkbox', icon: '☑', category: 'choice', color: '#10b981' },
  { id: 'dropdown', label: 'Dropdown', icon: '▾', category: 'choice', color: '#10b981' },
  { id: 'multiselect', label: 'Multi Select', icon: '☰', category: 'choice', color: '#10b981' },
  // Upload
  { id: 'file', label: 'File Upload', icon: '📎', category: 'upload', color: '#ef4444' },
  { id: 'pdf', label: 'PDF Upload', icon: '📄', category: 'upload', color: '#ef4444' },
  { id: 'imageupload', label: 'Image Upload', icon: '📷', category: 'upload', color: '#ef4444' },
  // Advanced
  { id: 'table', label: 'Table', icon: '⊞', category: 'advanced', color: '#64748b' },
];

export const UPLOAD_REQUIREMENTS = [
  { id: 'mandatory', label: 'Mandatory' },
  { id: 'optional', label: 'Optional' },
  { id: 'none', label: 'No Upload' },
];
