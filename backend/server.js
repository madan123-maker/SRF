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

app.get('/api/db', verifySessionOptional, async (req, res) => {
  try {
    const editions = await Edition.find().lean();
    const reformAreas = await ReformArea.find().lean();
    const formFields = await FormField.find().lean();
    const applications = await Application.find().lean();
    const applicationAnswers = await ApplicationAnswer.find().lean();
    const users = await User.find().lean();
    const notifications = await Notification.find().lean();
    const assignments = await Assignment.find().lean();
    const auditLogs = await AuditLog.find().lean();
    const schemaVersions = await SchemaVersion.find().lean();
    const guidelines = await Guideline.find().lean();
    const documentRules = await DocumentRule.find().lean();
    const departments = await Department.find().lean();
    const messages = await Message.find().lean();
    const recycleBin = await RecycleBin.find().lean();
    const reassignmentHistory = await ReassignmentHistory.find().lean();
    
    let settingsDoc = await Settings.findOne().lean();
    if (!settingsDoc) {
      settingsDoc = {
        platformName: 'SRF Management Platform',
        orgName: 'DPIIT',
        logoText: 'SRF Portal',
        autoSaveDraftInterval: 30000
      };
    }
    
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

// ─── DEDICATED FILE ENDPOINTS ───────────────────────────────────────────────

// GET file data for a specific answer (appId + fieldId)
app.get('/api/files/:appId/:fieldId', verifySession, async (req, res) => {
  try {
    const { appId, fieldId } = req.params;
    const appRecord = await Application.findOne({ id: appId }).lean();
    if (!appRecord) return res.status(404).json({ error: 'Application not found' });

    if (appRecord.status === 'Draft' || req.user.role === 'user') {
      if (req.user.id !== appRecord.userId) {
        return res.status(403).json({ error: 'Access denied: You do not own this application' });
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

    if (appRecord.status === 'Draft' || req.user.role === 'user') {
      if (req.user.id !== appRecord.userId) {
        return res.status(403).json({ error: 'Access denied: You do not own this application' });
      }
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
app.post('/api/db', async (req, res) => {
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

    // Deduplicate applications in payload before syncing
    if (payload.applications && payload.applications.length > 0) {
      const keptApps = [];
      const deletedAppIds = [];
      const groups = {};

      for (const app of payload.applications) {
        // Find owner user
        const user = payload.users?.find(u => u.id === app.userId) || 
                     await User.findOne({ id: app.userId }, null, options).lean();
        
        app.state = user?.state || '';
        app.organization = user?.organization || '';

        // If user role is user, group by state (or org if state is empty)
        // For other roles, group by userId
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
          // Keep only one application per key
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
            console.log(`[Backend Sync] DELETING DUPLICATE APP: ${deletedApp.id} (Status: ${deletedApp.status}, State: ${deletedApp.state}). Kept: ${apps[0].id} (Status: ${apps[0].status}, State: ${apps[0].state})`);
            deletedAppIds.push(deletedApp.id);
          });
        }
      });

      payload.applications = keptApps;
      if (deletedAppIds.length > 0) {
        console.log(`[Backend Sync] Deduplicated applications. Removing ${deletedAppIds.length} duplicate applications from payload.`);
        if (payload.applicationAnswers) {
          payload.applicationAnswers = payload.applicationAnswers.filter(ans => !deletedAppIds.includes(ans.applicationId));
        }
        // Delete records from database to ensure no leftover trace
        await Application.deleteMany({ id: { $in: deletedAppIds } }, options);
        await ApplicationAnswer.deleteMany({ applicationId: { $in: deletedAppIds } }, options);
      }
    }

    // SANITIZE formFields TO PREVENT CACHE INFECTION FROM OLD LOCALSTORAGE
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

    // Aligned assignment helper function
    function isFieldAssignedToUserBackend(f, user, payload) {
      if (!user) return false;

      // 1. Check if assigned via database assignments
      const editionAssignments = (payload.assignments || []).filter(a => a.userId === user.id && a.editionId === f.editionId);
      const isAssignedInDb = editionAssignments.some(a => {
        if ((!a.type || a.type === 'Reform Area') && (a.sectionId === f.reformAreaId || a.reformAreaId === f.reformAreaId)) return true;
        if (a.type === 'Action Point' && a.actionPointId === f.actionPointId) return true;
        if (a.type === 'Question' && (a.questionId === f.id || a.fieldId === f.id)) return true;
        return false;
      });

      // 2. Check if assigned via schema mappings
      let isAssignedInSchema = false;
      if (f.assignment) {
        const ass = f.assignment;
        if (ass.type === 'custom' && ass.users && (ass.users.includes(user.username) || ass.users.includes(user.id))) {
          isAssignedInSchema = true;
        }
      }
      const parentRA = (payload.reformAreas || []).find(s => s.id === f.reformAreaId && s.editionId === f.editionId);
      if (parentRA && parentRA.assignment) {
        const raAss = parentRA.assignment;
        if (raAss.type === 'custom' && raAss.users && (raAss.users.includes(user.username) || raAss.users.includes(user.id))) {
          isAssignedInSchema = true;
        }
      }

      if (isAssignedInDb || isAssignedInSchema) return true;

      // 3. Check if strict mode is active for this user
      const userEdAssignments = (payload.assignments || []).filter(a => a.userId === user.id && a.editionId === f.editionId);
      if (userEdAssignments.length > 0) return false;

      return true;
    }

    // Backend validation for question assignments
    if (payload.applicationAnswers) {
      for (const ans of payload.applicationAnswers) {
        // Find the application
        const app = payload.applications?.find(a => a.id === ans.applicationId) || 
                    await Application.findOne({ id: ans.applicationId }, null, options).lean();
        if (!app) continue;
        
        // Find the form field (question)
        const field = payload.formFields?.find(f => f.id === ans.fieldId) ||
                      await FormField.findOne({ id: ans.fieldId }, null, options).lean();
        if (!field) continue;
        
        // Find the user
        const user = payload.users?.find(u => u.id === app.userId) ||
                     await User.findOne({ id: app.userId }, null, options).lean();
        if (!user) continue;
        
        // Check aligned assignment
        if (!isFieldAssignedToUserBackend(field, user, payload)) {
          console.warn(`[API Validation Block] User "${user.username}" attempted to submit answer for unassigned field "${field.id}"`);
          if (useTransaction) {
            await session.abortTransaction();
            session.endSession();
          }
          return res.status(403).json({ error: `Question ${field.num || field.id} is not assigned to this user` });
        }
      }
    }

    // Backend validation for question score limit
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
        
        // Allow initial seed logic to bypass if no existing users
        if (existingUsers.length > 0 && !isAuthorizedAdminReq) {
          console.warn(`[API Validation Block] Non-admin/non-superadmin attempted to create ${newUsers.length} users.`);
          if (useTransaction) {
            await session.abortTransaction();
            session.endSession();
          }
          return res.status(403).json({ error: 'Only Super Admin or Admin can register users.' });
        }

        // Send welcome email to newly created users/admins
        for (const user of newUsers) {
          try {
            await emailService.sendWelcomeEmail(user.email, user.username, user.password, user.role);
          } catch (mailErr) {
            console.error(`[Email Error] Failed to send credentials to ${user.email} for ${user.username}:`, mailErr);
          }
        }
      }
    }
    
    // Sync all collections
    await syncCollection(User, payload.users, 'id', options);
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

    if (appRecord.status === 'Draft' || req.user.role === 'user') {
      if (req.user.id !== appRecord.userId) {
        return res.status(403).send('Access denied: You do not own this application');
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
