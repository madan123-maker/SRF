import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import mongoose from 'mongoose';
import {
  connectDB,
  User,
  Edition,
  ReformArea,
  FormField,
  Application,
  ApplicationAnswer,
  Notification,
  Assignment,
  AuditLog,
  SchemaVersion,
  Settings,
  Guideline,
  DocumentRule,
  Department,
  ReassignmentHistory,
  Message,
  RecycleBin
} from './db.js';
import emailService from './emailService.js';
import { exportApplicationsToExcel } from './excelExport.js';

// Import seed defaults from the frontend source
import { buildDefaultUsers, DEFAULT_SRF_6_EDITION } from '../frontend/src/db/schema.js';
import { SRF_6_SEED } from '../frontend/src/db/srf6Seed.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // support large form/schema payloads

const PORT = process.env.PORT || 5001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/userform';

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function isFieldAssignedToUserBackend(field, user, context = {}) {
  if (!user) return false;

  let assignments = context.assignments;
  if (!assignments) {
    assignments = await Assignment.find({ userId: user.id }).lean();
  }

  const isAssignedInDb = assignments.some(a => {
    if (a.editionId !== field.editionId) return false;
    if ((!a.type || a.type === 'Reform Area') && (a.sectionId === field.reformAreaId || a.reformAreaId === field.reformAreaId)) return true;
    if (a.type === 'Action Point' && a.actionPointId === field.actionPointId) return true;
    if (a.type === 'Question' && (a.questionId === field.id || a.fieldId === field.id)) return true;
    return false;
  });
  if (isAssignedInDb) return true;

  if (field.assignment) {
    const ass = field.assignment;
    if (ass.type === 'custom' && ass.users && (ass.users.includes(user.username) || ass.users.includes(user.id))) {
      return true;
    }
  }

  let reformAreas = context.reformAreas;
  if (!reformAreas) {
    reformAreas = await ReformArea.find({ editionId: field.editionId }).lean();
  }
  const parentRA = reformAreas.find(s => s.id === field.reformAreaId);
  if (parentRA && parentRA.assignment) {
    const raAss = parentRA.assignment;
    if (raAss.type === 'custom' && raAss.users && (raAss.users.includes(user.username) || raAss.users.includes(user.id))) {
      return true;
    }
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════
// DATABASE SEEDING
// ═══════════════════════════════════════════════════════════════
async function seedDatabase() {
  const deptCount = await Department.countDocuments();
  if (deptCount === 0) {
    const defaultDepts = [
      { id: 'dept_1', name: 'Department of Industries & Commerce', code: 'IND', description: 'Nodal department for industrial policy and startup encouragement.', createdAt: new Date().toISOString() },
      { id: 'dept_2', name: 'Department of Information Technology', code: 'IT', description: 'IT infrastructure, policies, and tech startup initiatives.', createdAt: new Date().toISOString() },
      { id: 'dept_3', name: 'Department of Science & Technology', code: 'SNT', description: 'Promoting R&D, innovation, and scientific research.', createdAt: new Date().toISOString() },
      { id: 'dept_4', name: 'Department of Finance', code: 'FIN', description: 'Financial allocations, budget, and funding schemes oversight.', createdAt: new Date().toISOString() },
      { id: 'dept_5', name: 'Department of Environment & Forests', code: 'ENV', description: 'Environmental clearances and green startup promotions.', createdAt: new Date().toISOString() }
    ];
    await Department.insertMany(defaultDepts);
    console.log(`[Seed] Seeded ${defaultDepts.length} default departments.`);
  }

  const userCount = await User.countDocuments();
  if (userCount > 0) {
    console.log('[Seed] Database already has data. Skipping user seed.');
    return;
  }

  console.log('[Seed] Database is empty. Running initial seed...');

  // 1. Seed default users
  const defaultUsers = buildDefaultUsers();
  for (const u of defaultUsers) {
    await User.create(u);
  }
  console.log(`[Seed] Seeded ${defaultUsers.length} default users.`);

  // 2. Seed settings
  const defaultSettings = {
    platformName: 'SRF Management Platform',
    orgName: 'DPIIT',
    logoText: 'SRF Portal',
    autoSaveDraftInterval: 30000
  };
  await Settings.create(defaultSettings);
  console.log('[Seed] Seeded default settings.');

  // 3. Seed default edition (SRF 6.0)
  await Edition.create(DEFAULT_SRF_6_EDITION);
  console.log(`[Seed] Seeded default edition: ${DEFAULT_SRF_6_EDITION.name}`);

  // 4. Seed default reform areas and form fields for SRF 6.0
  const apTitles = {
    "1": "1. Support Provided to Startups by State/UT Department(s)",
    "2": "2. Priority Sectors",
    "3": "3. Special Provisions",
    "4": "4. Incubators and Accelerators",
    "5": "5. Infrastructure Support in Tier 2/3/4 Cities",
    "6": "6. Startup Portal and Grievance Mechanism",
    "7": "7. Funding Support",
    "8": "8. Financial Assistance Disbursal",
    "9": "9. Sensitization of Investors",
    "10": "10. Public Procurement Relaxations",
    "11": "11. Market Linkages and Mentorship",
    "12": "12. Ease of Doing Business & Fast-track Approvals",
    "13": "13. Capacity Building of Government Officials",
    "14": "14. Sensitization and Mentorship of Startups",
    "15": "15. Intellectual Property Rights (IPR) Facilitation",
    "16": "16. Clean Tech and Sustainability initiatives",
    "17": "17. Social Enterprises Support",
    "18": "18. Employment and Career Opportunities",
    "19": "19. Accolades and Recognition"
  };

  const seededReformAreas = [];
  const seededFormFields = [];

  SRF_6_SEED.forEach((raData, raIdx) => {
    const raId = `ra_srf6_${raIdx + 1}`;
    seededReformAreas.push({
      id: raId,
      editionId: DEFAULT_SRF_6_EDITION.id,
      name: raData.name,
      description: `DPIIT initiatives on ${raData.name}`,
      orderIndex: raIdx,
      color: ['#4f46e5', '#0284c7', '#7e22ce', '#10b981', '#d97706', '#ef4444', '#0891b2'][raIdx % 7],
      marks: raData.marks || 10
    });

    raData.questions.forEach((qData, qIdx) => {
      const fieldId = `field_srf6_${qData.num.replace('.', '_')}`;
      const apNum = qData.num.split('.')[0];
      const apTitle = apTitles[apNum] || `Action Point ${apNum}`;
      
      const defaultEl = {
        id: `el_srf6_${qData.num.replace('.', '_')}_1`,
        type: qData.type,
        label: qData.label,
        required: true,
        options: qData.options || []
      };
      if (qData.type === 'radio' && (!defaultEl.options || defaultEl.options.length === 0)) {
        defaultEl.options = ["Yes", "No"];
      }

      seededFormFields.push({
        id: fieldId,
        num: qData.num,
        editionId: DEFAULT_SRF_6_EDITION.id,
        reformAreaId: raId,
        actionPointId: `ap_srf6_${apNum}`,
        actionPointTitle: apTitle,
        fieldType: qData.type,
        label: qData.label,
        text: qData.label,
        placeholder: `Enter response for Question ${qData.num}...`,
        required: true,
        mandatory: true,
        weight: qData.weight || 1,
        maxScore: qData.maxScore || 1,
        uploadRequirement: 'optional',
        options: qData.options || [],
        helpText: `DPIIT guidelines checklist for AP ${qData.num}`,
        url: '',
        content: '',
        orderIndex: qIdx,
        isLayoutElement: false,
        isUploadElement: false,
        elements: [defaultEl],
        docs: qData.docs || [
          { id: `doc_srf6_${qData.num.replace('.', '_')}_1`, name: 'Upload Supporting Document', requirement: 'optional' }
        ],
        createdAt: new Date().toISOString()
      });
    });
  });

  // Bulk create in MongoDB
  await ReformArea.insertMany(seededReformAreas);
  await FormField.insertMany(seededFormFields);
  console.log(`[Seed] Seeded ${seededReformAreas.length} reform areas and ${seededFormFields.length} fields.`);
  console.log('[Seed] Database seeding completed successfully.');
}

// Auth verification middlewares
async function verifySession(req, res, next) {
  const reqUserId = req.header('X-User-Id');
  const reqUserRole = req.header('X-User-Role');

  if (!reqUserId || !reqUserRole) {
    return res.status(401).json({ error: 'Session credentials required' });
  }

  try {
    const user = await User.findOne({ id: reqUserId, role: reqUserRole }).lean();
    if (!user || user.active === false) {
      return res.status(403).json({ error: 'Access denied: Invalid session or user inactive' });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error('[Auth Middleware Error]:', err);
    res.status(500).json({ error: 'Server authentication error' });
  }
}

async function verifySessionOptional(req, res, next) {
  const reqUserId = req.header('X-User-Id');
  const reqUserRole = req.header('X-User-Role');
  if (!reqUserId || !reqUserRole) {
    return next();
  }
  try {
    const user = await User.findOne({ id: reqUserId, role: reqUserRole }).lean();
    if (!user || user.active === false) {
      return res.status(403).json({ error: 'Access denied: Invalid session or user inactive' });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error('[Auth Middleware Error]:', err);
    res.status(500).json({ error: 'Server authentication error' });
  }
}

// ═══════════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// GET complete database state
app.get('/api/export/excel', verifySession, exportApplicationsToExcel);

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const cleanUsername = String(username).replace(/\s+/g, '').toLowerCase();
    const user = await User.findOne({ username: cleanUsername }).lean();
    if (!user || user.password !== password || user.active === false) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    const sanitizedUser = { ...user };
    delete sanitizedUser.password;
    res.json({ success: true, user: sanitizedUser });
  } catch (err) {
    console.error('[API Login Error]:', err);
    res.status(500).json({ error: 'Server error during authentication' });
  }
});

app.get('/api/db', verifySessionOptional, async (req, res) => {
  try {
    let settingsDoc = await Settings.findOne().lean();
    if (!settingsDoc) {
      settingsDoc = {
        platformName: 'SRF Management Platform',
        orgName: 'DPIIT',
        logoText: 'SRF Portal',
        autoSaveDraftInterval: 30000
      };
    }

    if (!req.user) {
      // Unauthenticated users receive only settings
      return res.json({
        version: 3,
        editions: [],
        reformAreas: [],
        formFields: [],
        applications: [],
        applicationAnswers: [],
        users: [],
        notifications: [],
        assignments: [],
        auditLogs: [],
        schemaVersions: [],
        guidelines: [],
        documentRules: [],
        departments: [],
        messages: [],
        recycleBin: [],
        reassignmentHistory: [],
        settings: settingsDoc
      });
    }

    if (req.user.role === 'user') {
      // Restrict users to their assigned editions, reform areas, questions, own data
      const assignments = await Assignment.find({ userId: req.user.id }).lean();
      const assignedEditionIds = [...new Set(assignments.map(a => a.editionId))];
      
      const editions = await Edition.find({ id: { $in: assignedEditionIds }, status: 'published', isDeleted: false }).lean();
      const activeEdIds = editions.map(e => e.id);
      
      const allReformAreas = await ReformArea.find({ editionId: { $in: activeEdIds } }).lean();
      const allFields = await FormField.find({ editionId: { $in: activeEdIds } }).lean();

      function isFieldAssigned(f) {
        const isAssignedInDb = assignments.some(a => {
          if (a.editionId !== f.editionId) return false;
          if ((!a.type || a.type === 'Reform Area') && (a.sectionId === f.reformAreaId || a.reformAreaId === f.reformAreaId)) return true;
          if (a.type === 'Action Point' && a.actionPointId === f.actionPointId) return true;
          if (a.type === 'Question' && (a.questionId === f.id || a.fieldId === f.id)) return true;
          return false;
        });
        if (isAssignedInDb) return true;

        if (f.assignment && f.assignment.type === 'custom' && f.assignment.users && (f.assignment.users.includes(req.user.username) || f.assignment.users.includes(req.user.id))) return true;

        const parentRA = allReformAreas.find(s => s.id === f.reformAreaId && s.editionId === f.editionId);
        if (parentRA && parentRA.assignment && parentRA.assignment.type === 'custom' && parentRA.assignment.users && (parentRA.assignment.users.includes(req.user.username) || parentRA.assignment.users.includes(req.user.id))) return true;

        return false;
      }

      const formFields = allFields.filter(isFieldAssigned);
      const assignedFieldRAIds = formFields.map(f => f.reformAreaId);
      const assignedRAIds = assignments.map(a => a.reformAreaId || a.sectionId);
      const allAssignedRAIds = [...new Set([...assignedFieldRAIds, ...assignedRAIds])];

      const reformAreas = allReformAreas.filter(ra => {
        if (allAssignedRAIds.includes(ra.id)) return true;
        if (ra.assignment && ra.assignment.type === 'custom' && ra.assignment.users && (ra.assignment.users.includes(req.user.username) || ra.assignment.users.includes(req.user.id))) return true;
        return false;
      });

      const applications = await Application.find({ userId: req.user.id, editionId: { $in: activeEdIds } }).lean();
      const appIds = applications.map(a => a.id);
      const applicationAnswers = await ApplicationAnswer.find({ applicationId: { $in: appIds } }).lean();
      
      const notifications = await Notification.find({ userId: req.user.id }).lean();
      const auditLogs = await AuditLog.find({ userId: req.user.id }).lean();
      const schemaVersions = await SchemaVersion.find({ editionId: { $in: activeEdIds } }).lean();
      const guidelines = await Guideline.find({ editionId: { $in: activeEdIds } }).lean();
      const documentRules = await DocumentRule.find({ editionId: { $in: activeEdIds } }).lean();
      const departments = await Department.find().lean();
      const messages = await Message.find({ $or: [{ senderId: req.user.id }, { receiverId: req.user.id }] }).lean();

      const sanitizedProfile = { ...req.user };
      delete sanitizedProfile.password;

      return res.json({
        version: 3,
        editions,
        reformAreas,
        formFields,
        applications,
        applicationAnswers,
        users: [sanitizedProfile],
        notifications,
        assignments,
        auditLogs,
        schemaVersions,
        guidelines,
        documentRules,
        departments,
        messages,
        recycleBin: [],
        reassignmentHistory: [],
        settings: settingsDoc
      });
    }

    // Admins, Reviewers, and Super Admins get all data, but passwords must be sanitized
    const editions = await Edition.find().lean();
    const reformAreas = await ReformArea.find().lean();
    const formFields = await FormField.find().lean();
    const applications = await Application.find().lean();
    const applicationAnswers = await ApplicationAnswer.find().lean();
    
    const usersRaw = await User.find().lean();
    const users = usersRaw.map(u => {
      const sanitized = { ...u };
      delete sanitized.password;
      return sanitized;
    });

    const notifications = await Notification.find().lean();
    const assignments = await Assignment.find().lean();
    const auditLogs = await AuditLog.find().lean();
    const schemaVersions = await SchemaVersion.find().lean();
    const guidelines = await Guideline.find().lean();
    const documentRules = await DocumentRule.find().lean();
    const departments = await Department.find().lean();
    const messages = await Message.find().lean();
    const recycleBin = req.user.role === 'superadmin' ? await RecycleBin.find().lean() : [];
    const reassignmentHistory = await ReassignmentHistory.find().lean();

    res.json({
      version: 3,
      editions,
      reformAreas,
      formFields,
      applications,
      applicationAnswers,
      users,
      notifications,
      assignments,
      auditLogs,
      schemaVersions,
      guidelines,
      documentRules,
      departments,
      messages,
      recycleBin,
      reassignmentHistory,
      settings: settingsDoc
    });
  } catch (err) {
    console.error('[API Error] Failed to retrieve database state:', err);
    res.status(500).json({ error: 'Server error retrieving database state' });
  }
});

// Helper to synchronize collection
async function syncCollection(Model, items, keyField = 'id', options = {}) {
  if (!Array.isArray(items)) return;
  const ids = [];
  for (const item of items) {
    const query = { [keyField]: item[keyField] };
    const updateObj = { ...item };
    delete updateObj._id;
    await Model.findOneAndUpdate(query, { $set: updateObj }, { upsert: true, returnDocument: 'after', ...options });
    ids.push(item[keyField]);
  }
  // Delete records not present in the payload
  await Model.deleteMany({ [keyField]: { $nin: ids } }, options);
}

// Helper to upsert RecycleBin items without deleting others
async function upsertRecycleBinItems(items, options = {}) {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    const query = { id: item.id };
    const updateObj = { ...item };
    delete updateObj._id;
    await RecycleBin.findOneAndUpdate(query, { $set: updateObj }, { upsert: true, ...options });
  }
}

// ─── DEDICATED FILE ENDPOINTS ───────────────────────────────────────────────

// GET file data for a specific answer (appId + fieldId)
app.get('/api/files/:appId/:fieldId', verifySession, async (req, res) => {
  try {
    const { appId, fieldId } = req.params;
    const appRecord = await Application.findOne({ id: appId }).lean();
    if (!appRecord) return res.status(404).json({ error: 'Application not found' });

    // Enforce role security
    if (req.user.role === 'user') {
      if (req.user.id !== appRecord.userId) {
        return res.status(403).json({ error: 'Access denied: You do not own this application' });
      }
      const field = await FormField.findOne({ id: fieldId }).lean();
      const userAssignments = await Assignment.find({ userId: req.user.id }).lean();
      if (!field || !await isFieldAssignedToUserBackend(field, req.user, { assignments: userAssignments })) {
        return res.status(403).json({ error: 'Access denied: Question is not assigned to you' });
      }
    } else if (req.user.role === 'admin' || req.user.role === 'reviewer') {
      if (appRecord.status === 'Draft') {
        return res.status(403).json({ error: 'Access denied: Draft application' });
      }
      const applicant = await User.findOne({ id: appRecord.userId }).lean();
      if (req.user.organization !== 'DPIIT' && applicant && applicant.organization !== req.user.organization) {
        return res.status(403).json({ error: 'Access denied: Application belongs to another department' });
      }
    } else if (req.user.role === 'superadmin') {
      const allowed = ['Admin Approved', 'Super Admin Review', 'Final Approved', 'Rejected'];
      if (!allowed.includes(appRecord.status)) {
        return res.status(403).json({ error: 'Access denied: Application is not in Super Admin review stage' });
      }
    }

    const ans = await ApplicationAnswer.findOne({ applicationId: appId, fieldId }).lean();
    if (!ans) return res.status(404).json({ error: 'Answer not found' });
    res.json({ files: ans.files || [] });
  } catch (err) {
    console.error('[API Error] Failed to retrieve files:', err);
    res.status(500).json({ error: 'Server error retrieving files' });
  }
});

// POST save/update files for a specific answer
app.post('/api/files/:appId/:fieldId', verifySession, async (req, res) => {
  try {
    const { appId, fieldId } = req.params;
    const appRecord = await Application.findOne({ id: appId }).lean();
    if (!appRecord) return res.status(404).json({ error: 'Application not found' });

    // Only owner user can upload files
    if (req.user.role !== 'user' || req.user.id !== appRecord.userId) {
      return res.status(403).json({ error: 'Access denied: Only application owner can upload files' });
    }

    // Block changes if final approved
    if (appRecord.status === 'Final Approved') {
      return res.status(403).json({ error: 'Access denied: Application is locked' });
    }

    const field = await FormField.findOne({ id: fieldId }).lean();
    const userAssignments = await Assignment.find({ userId: req.user.id }).lean();
    if (!field || !await isFieldAssignedToUserBackend(field, req.user, { assignments: userAssignments })) {
      return res.status(403).json({ error: 'Access denied: Question is not assigned to you' });
    }

    const { files } = req.body;
    if (!Array.isArray(files)) return res.status(400).json({ error: 'files must be an array' });
    const result = await ApplicationAnswer.findOneAndUpdate(
      { applicationId: appId, fieldId },
      { $set: { files, updatedAt: new Date().toISOString() } },
      { upsert: true, returnDocument: 'after' }
    );
    res.json({ success: true, id: result.id });
  } catch (err) {
    console.error('[API Error] Failed to save files:', err);
    res.status(500).json({ error: 'Server error saving files' });
  }
});

// GET base64-decoded document stream for download from Excel hyperlinks
app.get('/api/download-file/:appId/:fieldId/:docId', async (req, res) => {
  try {
    const { appId, fieldId, docId } = req.params;
    const ans = await ApplicationAnswer.findOne({ applicationId: appId, fieldId }).lean();
    if (!ans || !ans.files) {
      return res.status(404).send('Answer or files not found');
    }
    const file = ans.files.find(f => f.docId === docId);
    if (!file || !file.dataUrl) {
      return res.status(404).send('File or file data not found');
    }

    const match = file.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return res.status(400).send('Invalid file data format');
    }

    const contentType = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Fetch details for filename branding
    const appRecord = await Application.findOne({ id: appId }).lean();
    let userName = 'User';
    if (appRecord && appRecord.userId) {
      const userRecord = await User.findOne({ id: appRecord.userId }).lean();
      if (userRecord) {
        userName = userRecord.name || userRecord.username || 'User';
      }
    }

    const fieldRecord = await FormField.findOne({ id: fieldId }).lean();
    let reformAreaName = 'ReformArea';
    let actionPointNum = 'Question';
    if (fieldRecord) {
      actionPointNum = fieldRecord.num || 'Question';
      if (fieldRecord.reformAreaId) {
        const raRecord = await ReformArea.findOne({ id: fieldRecord.reformAreaId }).lean();
        if (raRecord) {
          reformAreaName = raRecord.name || 'ReformArea';
        }
      }
    }

    // Sanitize values for safe filenames
    const clean = (s) => s.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').trim();
    const cleanUserName = clean(userName);
    const cleanReformArea = clean(reformAreaName);
    const cleanActionPoint = clean(actionPointNum);
    const origFilename = file.name || 'document';

    const safeFilename = `${cleanUserName}_${cleanReformArea}_AP_${cleanActionPoint}_${origFilename}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.send(buffer);
  } catch (err) {
    console.error('[Download File Error]:', err);
    res.status(500).send('Server error downloading file');
  }
});

// POST update complete database state
app.post('/api/db', verifySession, async (req, res) => {
  const payload = req.body;
  if (!payload) {
    return res.status(400).json({ error: 'No database state payload provided' });
  }

  let session = null;
  let useTransaction = false;

  try {
    const client = mongoose.connection.getClient();
    const isReplicaSet = client.topology && client.topology.description && 
                         (client.topology.description.type === 'ReplicaSetWithPrimary' || 
                          client.topology.description.type === 'ReplicaSetNoPrimary');
    if (isReplicaSet) {
      session = await mongoose.startSession();
      session.startTransaction();
      useTransaction = true;
    } else {
      console.log('[API] Standalone MongoDB server detected. Fall back to non-transactional execution.');
      useTransaction = false;
    }
  } catch (sessErr) {
    console.log('[API] Transactions not supported or failed to start session. Falling back to non-transactional execution.');
    if (session) {
      try { session.endSession(); } catch(e) {}
    }
    session = null;
    useTransaction = false;
  }

  try {
    console.log('[API] Synchronizing database state with MongoDB...');
    const options = useTransaction ? { session } : {};

    // Deduplicate applications in payload before validation/syncing
    if (payload.applications && payload.applications.length > 0) {
      const keptApps = [];
      const deletedAppIds = [];
      const groups = {};

      for (const app of payload.applications) {
        const user = payload.users?.find(u => u.id === app.userId) || 
                     await User.findOne({ id: app.userId }, null, options).lean();
        
        app.state = user?.state || '';
        app.organization = user?.organization || '';

        const isUserRole = user?.role === 'user';
        const key = isUserRole
          ? (app.state 
              ? `${app.editionId}_state_${app.state}` 
              : `${app.editionId}_org_${app.organization}`)
          : `${app.editionId}_user_${app.userId}`;

        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(app);
      }

      Object.keys(groups).forEach(key => {
        const apps = groups[key];
        if (apps.length === 1) {
          keptApps.push(apps[0]);
        } else {
          const statusPriority = {
            'Approved': 7,
            'Under Review': 6,
            'Additional Documents Requested': 5,
            'Submitted': 4,
            'Resubmitted': 3,
            'Draft': 2,
            'Rejected': 1
          };
          
          apps.sort((a, b) => {
            const pa = statusPriority[a.status] || 0;
            const pb = statusPriority[b.status] || 0;
            if (pa !== pb) return pb - pa;
            return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
          });

          keptApps.push(apps[0]);
          apps.slice(1).forEach(deletedApp => {
            console.log(`[Backend Sync] DELETING DUPLICATE APP: ${deletedApp.id}. Kept: ${apps[0].id}`);
            deletedAppIds.push(deletedApp.id);
          });
        }
      });

      payload.applications = keptApps;
      if (deletedAppIds.length > 0) {
        if (payload.applicationAnswers) {
          payload.applicationAnswers = payload.applicationAnswers.filter(ans => !deletedAppIds.includes(ans.applicationId));
        }
        await Application.deleteMany({ id: { $in: deletedAppIds } }, options);
        await ApplicationAnswer.deleteMany({ applicationId: { $in: deletedAppIds } }, options);
      }
    }

    // SANITIZE formFields TO PREVENT CACHE INFECTION
    if (payload.formFields) {
      const arrowText = [
        "Government orders / notifications / circulars issued by other departments for startup support",
        "Department-specific startup policies or sectoral schemes",
        "Details on the type of support provided to startups from other departments",
        "Any other related document",
        "Document specifying mandate",
        "Grievance Redressal Mechanism",
        "Process for receipt of grievance",
        "Timelines for resolving",
        "Process for escalation",
        "Officer in charge for resolution",
        "Link to grievance redressal mechanism",
        "Document highlighting availability of a dedicated helpline or a call centre",
        "List of Startups connected and supported",
        "Impact Assessment Report",
        "Feedback document from Startups / incubators / investors connected or benefited",
        "Impact Assessment Reports",
        "List of Higher Education Institutes / Incubators / relevant entities covered"
      ];
      const arrowLines = arrowText.map(line => line.trim().toLowerCase().replace(/\s+/g, ' '));
      
      payload.formFields = payload.formFields.map(field => {
        if (field.docs && Array.isArray(field.docs)) {
          field.docs = field.docs.filter(doc => {
            let docNameLower = (doc.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
            if (docNameLower === '-' || docNameLower === '') return false;
            return !arrowLines.some(arrow => arrow.includes(docNameLower) || docNameLower.includes(arrow));
          });
        }
        return field;
      });
    }

    // Role-based write authorization check
    if (req.user.role === 'user') {
      // Validate that they didn't modify or create editions / users
      if (payload.editions) {
        const dbEditions = await Edition.find().lean();
        for (const ed of payload.editions) {
          const matching = dbEditions.find(x => x.id === ed.id);
          if (!matching || matching.name !== ed.name || matching.status !== ed.status) {
            if (useTransaction) { await session.abortTransaction(); session.endSession(); }
            return res.status(403).json({ error: 'Access denied: Cannot create or modify editions schema' });
          }
        }
      }
      if (payload.users) {
        const dbUsers = await User.find({}).lean();
        for (const u of payload.users) {
          const matching = dbUsers.find(x => x.id === u.id);
          if (!matching || matching.role !== u.role || matching.username !== u.username) {
            if (useTransaction) { await session.abortTransaction(); session.endSession(); }
            return res.status(403).json({ error: 'Access denied: Cannot modify user directory' });
          }
        }
      }

      // 1. Validate application updates belong to user
      if (payload.applications) {
        for (const app of payload.applications) {
          if (app.userId !== req.user.id) {
            if (useTransaction) { await session.abortTransaction(); session.endSession(); }
            return res.status(403).json({ error: 'Access denied: Cannot modify other users applications' });
          }
        }
      }

      // 2. Validate answers and check alignment
      if (payload.applicationAnswers) {
        for (const ans of payload.applicationAnswers) {
          const app = payload.applications?.find(a => a.id === ans.applicationId) || 
                      await Application.findOne({ id: ans.applicationId }, null, options).lean();
          if (!app) continue;
          if (app.userId !== req.user.id) {
            if (useTransaction) { await session.abortTransaction(); session.endSession(); }
            return res.status(403).json({ error: 'Access denied: Cannot modify answers for other applications' });
          }

          const field = payload.formFields?.find(f => f.id === ans.fieldId) ||
                        await FormField.findOne({ id: ans.fieldId }, null, options).lean();
          if (!field) continue;

          if (!await isFieldAssignedToUserBackend(field, req.user, payload)) {
            console.warn(`[API Validation Block] User "${req.user.username}" attempted to submit answer for unassigned field "${field.id}"`);
            if (useTransaction) {
              await session.abortTransaction();
              session.endSession();
            }
            return res.status(403).json({ error: `Question ${field.num || field.id} is not assigned to this user` });
          }
        }
      }

      // Sync user applications (insert/update only)
      if (payload.applications) {
        for (const app of payload.applications) {
          const query = { id: app.id };
          const updateObj = { ...app };
          delete updateObj._id;
          await Application.findOneAndUpdate(query, { $set: updateObj }, { upsert: true, returnDocument: 'after', ...options });
        }
      }

      // Sync user answers (insert/update, and delete missing ones only for this user's applications)
      if (payload.applicationAnswers) {
        const payloadAnsIds = payload.applicationAnswers.map(ans => ans.id);
        const userApps = await Application.find({ userId: req.user.id }, null, options).lean();
        const userAppIds = userApps.map(a => a.id);
        if (payload.applications) {
          payload.applications.forEach(a => { if (!userAppIds.includes(a.id)) userAppIds.push(a.id); });
        }

        for (let ans of payload.applicationAnswers) {
          const existingAns = await ApplicationAnswer.findOne({ id: ans.id }, null, options).lean();
          if (existingAns && existingAns.files && existingAns.files.length > 0) {
            ans.files = ans.files || [];
            ans.files = ans.files.map(f => {
              const existingFile = existingAns.files.find(ef => ef.docId === f.docId);
              if (existingFile && existingFile.dataUrl && !f.dataUrl) {
                f.dataUrl = existingFile.dataUrl;
              }
              return f;
            });
          }
        }

        for (const ans of payload.applicationAnswers) {
          const query = { id: ans.id };
          const updateObj = { ...ans };
          delete updateObj._id;
          await ApplicationAnswer.findOneAndUpdate(query, { $set: updateObj }, { upsert: true, returnDocument: 'after', ...options });
        }

        await ApplicationAnswer.deleteMany({
          applicationId: { $in: userAppIds },
          id: { $nin: payloadAnsIds }
        }, options);
      }

      // Sync user messages
      if (payload.messages) {
        for (const msg of payload.messages) {
          if (msg.senderId !== req.user.id && msg.receiverId !== req.user.id) {
            if (useTransaction) { await session.abortTransaction(); session.endSession(); }
            return res.status(403).json({ error: 'Access denied: Cannot write messages for other users' });
          }
          const query = { id: msg.id };
          const updateObj = { ...msg };
          delete updateObj._id;
          await Message.findOneAndUpdate(query, { $set: updateObj }, { upsert: true, ...options });
        }
      }

      if (payload.notifications) {
        // Users can dismiss their own notifications
        for (const note of payload.notifications) {
          if (note.userId === req.user.id) {
            const query = { id: note.id };
            const updateObj = { ...note };
            delete updateObj._id;
            await Notification.findOneAndUpdate(query, { $set: updateObj }, { upsert: true, ...options });
          }
        }
      }

      if (payload.recycleBin) {
        await upsertRecycleBinItems(payload.recycleBin, options);
      }

      if (useTransaction) {
        await session.commitTransaction();
        session.endSession();
      }

      console.log(`[API] User ${req.user.username} synced data successfully.`);
      return res.json({
        success: true,
        applications: payload.applications,
        applicationAnswers: payload.applicationAnswers
      });
    }

    // Backend validation for question score limit (Admins & Reviewers)
    if (payload.applicationAnswers) {
      for (const ans of payload.applicationAnswers) {
        if (ans.questionStatus === 'Approved' && ans.questionScore > 0) {
          const field = payload.formFields?.find(f => f.id === ans.fieldId) ||
                        await FormField.findOne({ id: ans.fieldId }, null, options).lean();
          if (field) {
            const maxScore = field.maxScore || field.weight || 1;
            if (ans.questionScore > maxScore) {
              console.warn(`[API Validation Block] Attempted to award score ${ans.questionScore} exceeding maxScore ${maxScore} for field ${ans.fieldId}`);
              if (useTransaction) {
                await session.abortTransaction();
                session.endSession();
              }
              return res.status(400).json({ error: `Question ${field.num || field.id} score cannot exceed configured maximum of ${maxScore}` });
            }
          }
        }
      }
    }
    
    // Backend validation for user registration
    if (payload.users) {
      const existingUsers = await User.find({}, null, options).lean();
      const newUsers = payload.users.filter(pu => !existingUsers.some(eu => eu.id === pu.id));
      if (newUsers.length > 0) {
        let isAuthorizedAdminReq = false;
        if (payload.requestingUserId) {
          const reqUser = existingUsers.find(u => u.id === payload.requestingUserId) || await User.findOne({ id: payload.requestingUserId }, null, options).lean();
          if (reqUser && (reqUser.role === 'superadmin' || reqUser.role === 'admin')) {
            isAuthorizedAdminReq = true;
          }
        }
        
        if (existingUsers.length > 0 && !isAuthorizedAdminReq) {
          console.warn(`[API Validation Block] Non-admin/non-superadmin attempted to create ${newUsers.length} users.`);
          if (useTransaction) {
            await session.abortTransaction();
            session.endSession();
          }
          return res.status(403).json({ error: 'Only Super Admin or Admin can register users.' });
        }

        for (const user of newUsers) {
          try {
            await emailService.sendWelcomeEmail(user.email, user.username, user.password, user.role);
          } catch (mailErr) {
            console.error(`[Email Error] Failed to send credentials to ${user.email} for ${user.username}:`, mailErr);
          }
        }
      }
    }
    
    // Sync users list while preserving passwords in DB
    if (payload.users) {
      for (const u of payload.users) {
        const existing = await User.findOne({ id: u.id }, null, options).lean();
        const updateObj = { ...u };
        delete updateObj._id;
        if (existing && !u.password) {
          updateObj.password = existing.password;
        }
        await User.findOneAndUpdate({ id: u.id }, { $set: updateObj }, { upsert: true, returnDocument: 'after', ...options });
      }
      if (req.user.role === 'superadmin' || req.user.role === 'admin') {
        const payloadUserIds = payload.users.map(u => u.id);
        await User.deleteMany({ id: { $nin: payloadUserIds } }, options);
      }
    }

    if (req.user.role === 'admin' || req.user.role === 'reviewer') {
      // Admins cannot change Edition schemas or global Platform Settings
      await syncCollection(Application, payload.applications, 'id', options);
      
      if (payload.applicationAnswers) {
        for (let ans of payload.applicationAnswers) {
          const existingAns = await ApplicationAnswer.findOne({ id: ans.id }, null, options).lean();
          if (existingAns && existingAns.files && existingAns.files.length > 0) {
            ans.files = ans.files || [];
            ans.files = ans.files.map(f => {
              const existingFile = existingAns.files.find(ef => ef.docId === f.docId);
              if (existingFile && existingFile.dataUrl && !f.dataUrl) {
                f.dataUrl = existingFile.dataUrl;
              }
              return f;
            });
          }
        }
      }
      await syncCollection(ApplicationAnswer, payload.applicationAnswers, 'id', options);
      await syncCollection(Notification, payload.notifications, 'id', options);
      await syncCollection(Assignment, payload.assignments, 'id', options);
      await syncCollection(AuditLog, payload.auditLogs, 'id', options);
      await syncCollection(ReassignmentHistory, payload.reassignmentHistory, 'id', options);
      await upsertRecycleBinItems(payload.recycleBin, options);

      if (payload.messages) {
        await syncCollection(Message, payload.messages, 'id', options);
      }
    } else if (req.user.role === 'superadmin') {
      // Super Admin syncs everything
      await syncCollection(Edition, payload.editions, 'id', options);
      await syncCollection(ReformArea, payload.reformAreas, 'id', options);
      await syncCollection(FormField, payload.formFields, 'id', options);
      await syncCollection(Application, payload.applications, 'id', options);

      if (payload.applicationAnswers) {
        for (let ans of payload.applicationAnswers) {
          const existingAns = await ApplicationAnswer.findOne({ id: ans.id }, null, options).lean();
          if (existingAns && existingAns.files && existingAns.files.length > 0) {
            ans.files = ans.files || [];
            ans.files = ans.files.map(f => {
              const existingFile = existingAns.files.find(ef => ef.docId === f.docId);
              if (existingFile && existingFile.dataUrl && !f.dataUrl) {
                f.dataUrl = existingFile.dataUrl;
              }
              return f;
            });
          }
        }
      }
      await syncCollection(ApplicationAnswer, payload.applicationAnswers, 'id', options);
      await syncCollection(Notification, payload.notifications, 'id', options);
      await syncCollection(Assignment, payload.assignments, 'id', options);
      await syncCollection(AuditLog, payload.auditLogs, 'id', options);
      await syncCollection(SchemaVersion, payload.schemaVersions, 'id', options);
      await syncCollection(Guideline, payload.guidelines, 'id', options);
      await syncCollection(DocumentRule, payload.documentRules, 'id', options);
      await syncCollection(Department, payload.departments, 'id', options);
      await syncCollection(ReassignmentHistory, payload.reassignmentHistory, 'id', options);
      await syncCollection(RecycleBin, payload.recycleBin, 'id', options);

      if (payload.messages) {
        await syncCollection(Message, payload.messages, 'id', options);
      }

      if (payload.settings) {
        await Settings.findOneAndUpdate({}, payload.settings, { upsert: true, ...options });
      }
    }

    if (useTransaction) {
      await session.commitTransaction();
      session.endSession();
    }

    console.log('[API] Synchronization complete.');
    res.json({
      success: true,
      applications: payload.applications,
      applicationAnswers: payload.applicationAnswers
    });
  } catch (err) {
    console.error('[API Error] Failed to synchronize database state:', err);
    if (useTransaction) {
      try {
        await session.abortTransaction();
      } catch (abortErr) {
        console.error('Failed to abort transaction:', abortErr);
      }
      try {
        session.endSession();
      } catch (e) {}
    }
    res.status(500).json({ error: 'Server error synchronizing database state' });
  }
});

// POST reset database state to seed defaults
app.post('/api/db/reset', async (req, res) => {
  try {
    console.log('[API] Resetting database to seed state...');
    
    // Clear all collections
    await User.deleteMany({});
    await Edition.deleteMany({});
    await ReformArea.deleteMany({});
    await FormField.deleteMany({});
    await Application.deleteMany({});
    await ApplicationAnswer.deleteMany({});
    await Notification.deleteMany({});
    await Assignment.deleteMany({});
    await AuditLog.deleteMany({});
    await SchemaVersion.deleteMany({});
    await Guideline.deleteMany({});
    await DocumentRule.deleteMany({});
    await Settings.deleteMany({});
    await Department.deleteMany({});
    await ReassignmentHistory.deleteMany({});
    await Message.deleteMany({});

    // Seed again
    await seedDatabase();

    console.log('[API] Reset complete.');
    res.json({ success: true });
  } catch (err) {
    console.error('[API Error] Failed to reset database:', err);
    res.status(500).json({ error: 'Server error resetting database' });
  }
});


// Deduplicate existing applications in the database on startup
async function deduplicateExistingApplicationsInDB() {
  console.log('[Cleanup] Running startup application deduplication check...');
  try {
    const apps = await Application.find().lean();
    if (apps.length === 0) {
      console.log('[Cleanup] No applications found in database.');
      return;
    }

    const users = await User.find().lean();
    const groups = {};

    for (const app of apps) {
      const user = users.find(u => u.id === app.userId);
      const state = user?.state || '';
      const organization = user?.organization || '';

      // Update state and organization in the DB if they are missing
      if (app.state !== state || app.organization !== organization) {
        await Application.updateOne({ id: app.id }, { $set: { state, organization } });
        app.state = state;
        app.organization = organization;
      }

      const isUserRole = user?.role === 'user';
      const key = isUserRole
        ? (state 
            ? `${app.editionId}_state_${state}` 
            : `${app.editionId}_org_${organization}`)
        : `${app.editionId}_user_${app.userId}`;

      if (!groups[key]) groups[key] = [];
      groups[key].push(app);
    }

    let deletedCount = 0;
    for (const key of Object.keys(groups)) {
      const group = groups[key];
      if (group.length > 1) {
        const statusPriority = {
          'Approved': 7,
          'Under Review': 6,
          'Additional Documents Requested': 5,
          'Submitted': 4,
          'Resubmitted': 3,
          'Draft': 2,
          'Rejected': 1
        };
        group.sort((a, b) => {
          const pa = statusPriority[a.status] || 0;
          const pb = statusPriority[b.status] || 0;
          if (pa !== pb) return pb - pa;
          return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
        });

        const keep = group[0];
        const duplicates = group.slice(1);
        const duplicateIds = duplicates.map(d => d.id);

        await Application.deleteMany({ id: { $in: duplicateIds } });
        await ApplicationAnswer.deleteMany({ applicationId: { $in: duplicateIds } });
        deletedCount += duplicateIds.length;
        console.log(`[Cleanup] Deleted ${duplicateIds.length} duplicate applications for group ${key}, kept application ${keep.id}`);
      }
    }

    if (deletedCount > 0) {
      console.log(`[Cleanup] Startup deduplication finished. Removed ${deletedCount} duplicate applications.`);
    } else {
      console.log('[Cleanup] Startup deduplication finished. No duplicates found.');
    }
  } catch (err) {
    console.error('[Cleanup Error] Failed to run startup application deduplication:', err);
  }
}

// ═══════════════════════════════════════════════════════════════
// DOWNLOAD FILE ENDPOINT
// ═══════════════════════════════════════════════════════════════
app.get('/api/files/:appId/:fieldId/:docId', verifySession, async (req, res) => {
  try {
    const { appId, fieldId, docId } = req.params;
    const appRecord = await Application.findOne({ id: appId }).lean();
    if (!appRecord) return res.status(404).send('Application not found');

    // Enforce role security
    if (req.user.role === 'user') {
      if (req.user.id !== appRecord.userId) {
        return res.status(403).send('Access denied: You do not own this application');
      }
      const field = await FormField.findOne({ id: fieldId }).lean();
      const userAssignments = await Assignment.find({ userId: req.user.id }).lean();
      if (!field || !await isFieldAssignedToUserBackend(field, req.user, { assignments: userAssignments })) {
        return res.status(403).send('Access denied: Question is not assigned to you');
      }
    } else if (req.user.role === 'admin' || req.user.role === 'reviewer') {
      if (appRecord.status === 'Draft') {
        return res.status(403).send('Access denied: Draft application');
      }
      const applicant = await User.findOne({ id: appRecord.userId }).lean();
      if (req.user.organization !== 'DPIIT' && applicant && applicant.organization !== req.user.organization) {
        return res.status(403).send('Access denied: Application belongs to another department');
      }
    } else if (req.user.role === 'superadmin') {
      const allowed = ['Admin Approved', 'Super Admin Review', 'Final Approved', 'Rejected'];
      if (!allowed.includes(appRecord.status)) {
        return res.status(403).send('Access denied: Application is not in Super Admin review stage');
      }
    }

    const ans = await ApplicationAnswer.findOne({ applicationId: appId, fieldId: fieldId }).lean();
    if (!ans || !ans.files) return res.status(404).send('Document not found');
    
    const file = ans.files.find(f => f.docId === docId);
    if (!file || !file.dataUrl) return res.status(404).send('File content not found');
    
    const matches = file.dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return res.status(400).send('Invalid file format');
    
    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    
    res.set('Content-Type', mimeType);
    res.set('Content-Disposition', `attachment; filename="${file.name || 'document'}"`);
    res.send(buffer);
  } catch (err) {
    console.error('[API Error] Failed to download file:', err);
    res.status(500).send('Server error');
  }
});

// ═══════════════════════════════════════════════════════════════
// REAL EMAIL SENDING ENDPOINT (OTP)
// ═══════════════════════════════════════════════════════════════
app.post('/api/send-otp', async (req, res) => {
  const { email, otp, subject, userId } = req.body;
  if (!email || !otp) return res.status(400).json({ error: 'Registered email and OTP are required.' });

  const normalizedEmail = String(email).trim().toLowerCase();
  if (!normalizedEmail) return res.status(400).json({ error: 'Registered email is required.' });

  const registeredUser = userId
    ? await User.findOne({ id: userId, email: new RegExp(`^${escapeRegExp(normalizedEmail)}$`, 'i'), active: { $ne: false } }).lean()
    : await User.findOne({ email: new RegExp(`^${escapeRegExp(normalizedEmail)}$`, 'i'), active: { $ne: false } }).lean();

  if (!registeredUser) {
    return res.status(404).json({ error: 'OTP can only be sent to the email registered for this user.' });
  }

  // Read SMTP config from .env
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpUser || !smtpPass) {
    console.error('SMTP Credentials missing in .env');
    return res.status(500).json({ error: 'Email service is not configured on the server. Please contact support or update .env.' });
  }

  try {
    await emailService.sendOTP(registeredUser.email, otp, subject);
    res.status(200).json({ success: true, message: 'OTP Email sent successfully!' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email. Check SMTP credentials.' });
  }
});

app.use((err, req, res, next) => {
  console.error('[API Error]', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({
    error: err.message || 'Unexpected server error.'
  });
});

// Database cleanup migration for usernames with spaces
async function cleanupUsernamesWithSpaces() {
  try {
    const users = await User.find();
    let updatedCount = 0;
    for (const user of users) {
      if (user.username && /\s/.test(user.username)) {
        const oldUsername = user.username;
        const newUsername = oldUsername.replace(/\s+/g, '');
        console.log(`[Startup Cleanup] Removing spaces from username: "${oldUsername}" -> "${newUsername}"`);
        
        // Update User document
        await User.updateOne({ _id: user._id }, { username: newUsername });
        updatedCount++;
        
        // Update any FormField assignments that reference this username
        const formFields = await FormField.find({
          $or: [
            { 'assignment.userIds': oldUsername },
            { 'assignment.users': oldUsername }
          ]
        });
        for (const field of formFields) {
          if (field.assignment) {
            if (field.assignment.userIds) {
              field.assignment.userIds = field.assignment.userIds.map(uid => uid === oldUsername ? newUsername : uid);
            }
            if (field.assignment.users) {
              field.assignment.users = field.assignment.users.map(uid => uid === oldUsername ? newUsername : uid);
            }
            await FormField.updateOne({ _id: field._id }, { assignment: field.assignment });
          }
        }
      }
    }
    if (updatedCount > 0) {
      console.log(`[Startup Cleanup] Cleaned up ${updatedCount} usernames with spaces.`);
    }
  } catch (err) {
    console.error('[Startup Cleanup] Error cleaning up usernames:', err);
  }
}

// Start server
async function start() {
  await connectDB(MONGODB_URI);
  await seedDatabase();
  await cleanupUsernamesWithSpaces();
  await deduplicateExistingApplicationsInDB();

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

start();
