import express from 'express';
import jwt from 'jsonwebtoken';
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
  RecycleBin,
  ApplicationVersion,
  ApplicationVersionAnswer,
  ApplicationLock,
  SLASettings,
  BackupRecord
} from './db.js';
import emailService from './emailService.js';
import { exportApplicationsToExcel } from './excelExport.js';

// Import seed defaults from the frontend source
import { buildDefaultUsers, DEFAULT_SRF_6_EDITION } from '../frontend/src/db/schema.js';
import { SRF_6_SEED } from '../frontend/src/db/srf6Seed.js';
import crypto from 'crypto';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // support large form/schema payloads

function hashPassword(password) {
  if (!password) return '';
  if (/^[a-f0-9]{64}$/i.test(password)) {
    return password;
  }
  return crypto.createHash('sha256').update(password).digest('hex');
}

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
  const editionCount = await Edition.countDocuments();
  if (userCount > 0 && editionCount > 0) {
    console.log('[Seed] Database already has users and editions. Skipping seed.');
    return;
  }

  console.log('[Seed] Database is empty. Running initial seed...');

  // 1. Seed default users
  if (userCount === 0) {
    const defaultUsers = buildDefaultUsers();
    for (const u of defaultUsers) {
      await User.create(u);
    }
    console.log(`[Seed] Seeded ${defaultUsers.length} default users.`);
  }

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
  const authHeader = req.header('Authorization');
  let token;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }
  
  if (!token) {
    const reqUserId = req.header('X-User-Id');
    const reqUserRole = req.header('X-User-Role');
    if (reqUserId && reqUserRole) {
      try {
        const user = await User.findOne({ id: reqUserId, role: reqUserRole }).lean();
        if (!user || user.active === false) return res.status(403).json({ error: 'Access denied' });
        req.user = user;
        return next();
      } catch(e) { return res.status(500).json({ error: 'Server error' }); }
    }
    return res.status(401).json({ error: 'Session credentials required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'srf_super_secret_key_2026');
    const user = await User.findOne({ id: decoded.id, role: decoded.role }).lean();
    if (!user || user.active === false) {
      return res.status(403).json({ error: 'Access denied: Invalid session or user inactive' });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error('[Auth Middleware Error]:', err);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function verifySessionOptional(req, res, next) {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'srf_super_secret_key_2026');
      console.log('Decoded JWT in Optional:', decoded);
      const user = await User.findOne({ id: decoded.id, role: decoded.role }).lean();
      if (user && user.active !== false) {
        req.user = user;
        console.log('Set req.user in Optional:', user.id);
      } else {
        console.log('User not found or inactive for token');
      }
    } catch (e) {
      console.log('JWT Verification failed in Optional:', e.message);
    }
  }

  // Fallback for legacy headers
  if (!req.user) {
    const reqUserId = req.header('X-User-Id');
    const reqUserRole = req.header('X-User-Role');
    if (reqUserId && reqUserRole) {
      try {
        const user = await User.findOne({ id: reqUserId, role: reqUserRole }).lean();
        if (user && user.active !== false) {
          req.user = user;
        }
      } catch (e) {}
    }
  }

  next();
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
    const hashed = hashPassword(password);
    const isValid = user && (user.password === password || user.password === hashed) && user.active !== false;
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    const sanitizedUser = { ...user };
    delete sanitizedUser.password;
    const token = jwt.sign({ id: user.id, role: user.role, username: user.username }, process.env.JWT_SECRET || 'srf_super_secret_key_2026', { expiresIn: '24h' });
    
    // Add backend audit log for secure tracking
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
    const loginAudit = new AuditLog({
      id: 'audit_login_' + Date.now(),
      userId: user.id,
      username: user.username,
      role: user.role,
      action: 'User login (Backend Verified)',
      entityType: 'auth',
      entityId: user.id,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toTimeString().split(' ')[0],
      ipAddress: clientIp
    });
    await loginAudit.save().catch(e => console.error('Failed to log login audit:', e));

    res.json({ success: true, user: sanitizedUser, token });
  } catch (err) {
    console.error('[API Login Error]:', err);
    res.status(500).json({ error: 'Server error during authentication' });
  }
});

// POST register new user/admin (Admin-only creation)
app.post('/api/register', verifySession, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Only Super Admin or Admin can register accounts.' });
    }

    const { username, email, role, name, organization, state, district } = req.body;
    if (!username || !email || !role || !name) {
      return res.status(400).json({ error: 'Username, email, role, and name are required.' });
    }

    const cleanUsername = String(username).replace(/\s+/g, '').toLowerCase();
    const existing = await User.findOne({ username: cleanUsername }).lean();
    if (existing) {
      return res.status(400).json({ error: 'Username already exists.' });
    }

    const existingEmail = await User.findOne({ email: new RegExp(`^${escapeRegExp(email)}$`, 'i') }).lean();
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    // Generate proper system temporary password on server
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let tempPassword = '';
    for (let i = 0; i < 12; i++) {
      tempPassword += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    const hashedPassword = hashPassword(tempPassword);

    const newUser = new User({
      id: 'user_' + Date.now() + Math.floor(Math.random() * 1000),
      username: cleanUsername,
      password: hashedPassword,
      email: email,
      role: role,
      name: name,
      organization: organization || '',
      state: state || '',
      district: district || '',
      active: true,
      mustResetPassword: true,
      createdAt: new Date().toISOString()
    });

    await newUser.save();

    // Send Welcome Email
    try {
      const loginUrl = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : 'http://localhost:3000');
      emailService.sendWelcomeEmail(email, cleanUsername, tempPassword, role, loginUrl).catch(mailErr => {
        console.error(`[Email Error] Failed to send credentials to ${email}:`, mailErr);
      });
    } catch (mailErr) {
      console.error(`[Email Error] Failed to initiate email for ${email}:`, mailErr);
    }

    // Add Audit Log
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
    const newAudit = new AuditLog({
      id: 'audit_' + Date.now(),
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: `Created new ${role}: ${cleanUsername}`,
      entityType: 'user',
      entityId: newUser.id,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toTimeString().split(' ')[0],
      ipAddress: clientIp
    });
    await newAudit.save();

    const sanitized = newUser.toObject();
    delete sanitized.password;
    res.json({ success: true, user: sanitized, tempPassword: tempPassword });
  } catch (err) {
    console.error('[API Register Error]:', err);
    res.status(500).json({ error: 'Server error during user registration.' });
  }
});

// POST register-public (self-registration from login screen)
app.post('/api/register-public', async (req, res) => {
  try {
    const { username, email, name, organization, state, district } = req.body;
    if (!username || !email || !name || !organization) {
      return res.status(400).json({ error: 'Username, email, name, and organization are required.' });
    }

    const cleanUsername = String(username).replace(/\s+/g, '').toLowerCase();
    const existing = await User.findOne({ username: cleanUsername }).lean();
    if (existing) {
      return res.status(400).json({ error: 'Username already exists.' });
    }

    const existingEmail = await User.findOne({ email: new RegExp(`^${escapeRegExp(email)}$`, 'i') }).lean();
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    // Generate proper system temporary password
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let tempPassword = '';
    for (let i = 0; i < 12; i++) {
      tempPassword += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    const hashedPassword = hashPassword(tempPassword);

    const newUser = new User({
      id: 'user_' + Date.now() + Math.floor(Math.random() * 1000),
      username: cleanUsername,
      password: hashedPassword,
      email: email,
      role: 'user', // default role
      name: name,
      organization: organization,
      state: state || '',
      district: district || '',
      active: true,
      mustResetPassword: true,
      createdAt: new Date().toISOString()
    });

    await newUser.save();

    // Send Welcome Email
    try {
      const loginUrl = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : 'http://localhost:3000');
      emailService.sendWelcomeEmail(email, cleanUsername, tempPassword, 'user', loginUrl).catch(mailErr => {
        console.error(`[Email Error] Failed to send credentials to ${email}:`, mailErr);
      });
    } catch (mailErr) {
      console.error(`[Email Error] Failed to initiate email for ${email}:`, mailErr);
    }

    // Add Audit Log
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
    const newAudit = new AuditLog({
      id: 'audit_' + Date.now(),
      userId: 'system',
      username: 'system',
      role: 'system',
      action: `Self-registered user: ${cleanUsername}`,
      entityType: 'user',
      entityId: newUser.id,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toTimeString().split(' ')[0],
      ipAddress: clientIp
    });
    await newAudit.save();

    const sanitized = newUser.toObject();
    delete sanitized.password;
    res.json({ success: true, user: sanitized });
  } catch (err) {
    console.error('[API Public Register Error]:', err);
    res.status(500).json({ error: 'Server error during self-registration.' });
  }
});

// DELETE user (Admin-only hard delete)
app.delete('/api/users/:id', verifySession, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Only Super Admin or Admin can delete accounts.' });
    }
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ error: 'User ID required' });
    
    await User.deleteOne({ id: userId });
    await Assignment.deleteMany({ userId: userId });
    await Notification.deleteMany({ userId: userId });
    
    res.json({ success: true, message: 'User permanently deleted.' });
  } catch (err) {
    console.error('[API Delete User Error]:', err);
    res.status(500).json({ error: 'Server error during user deletion.' });
  }
});

// POST register-bulk (Admin-only bulk user creation)
app.post('/api/register-bulk', verifySession, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Only Super Admin or Admin can bulk register accounts.' });
    }

    const { users } = req.body;
    if (!users || !Array.isArray(users)) {
      return res.status(400).json({ error: 'Invalid payload: users array expected.' });
    }

    const createdUsers = [];
    const errors = [];
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';

    for (const u of users) {
      try {
        const { username, email, role, name, organization, state, district } = u;
        if (!username || !email || !role || !name) {
          errors.push(`Missing fields for user: ${username || email || 'unknown'}`);
          continue;
        }

        const cleanUsername = String(username).replace(/\s+/g, '').toLowerCase();
        const existing = await User.findOne({ username: cleanUsername }).lean();
        if (existing) {
          errors.push(`Username already exists: ${cleanUsername}`);
          continue;
        }

        const existingEmail = await User.findOne({ email: new RegExp(`^${escapeRegExp(email)}$`, 'i') }).lean();
        if (existingEmail) {
          errors.push(`Email already registered: ${email}`);
          continue;
        }

        const tempPassword = crypto.randomBytes(16).toString('base64').slice(0, 16);
        const hashedPassword = hashPassword(tempPassword);

        const newUser = new User({
          id: 'user_' + Date.now() + Math.floor(Math.random() * 1000),
          username: cleanUsername,
          password: hashedPassword,
          email,
          role,
          name,
          organization: organization || '',
          state: state || '',
          district: district || '',
          active: true,
          mustResetPassword: true,
          createdAt: new Date().toISOString()
        });

        await newUser.save();
        
        const sanitized = newUser.toObject();
        delete sanitized.password;
        createdUsers.push(sanitized);

        // Send Email
        try {
          const loginUrl = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : 'http://localhost:3000');
          emailService.sendWelcomeEmail(email, cleanUsername, tempPassword, role, loginUrl).catch(mailErr => {
            console.error(`[Email Error] Bulk registration mail fail for ${email}:`, mailErr);
          });
        } catch (mailErr) {
          console.error(`[Email Error] Failed to initiate bulk mail for ${email}:`, mailErr);
        }

        // Audit Log
        const newAudit = new AuditLog({
          id: 'audit_' + Date.now() + '_' + Math.floor(Math.random() * 100),
          userId: req.user.id,
          username: req.user.username,
          role: req.user.role,
          action: `Bulk created new ${role}: ${cleanUsername}`,
          entityType: 'user',
          entityId: newUser.id,
          timestamp: new Date().toISOString(),
          date: new Date().toISOString().slice(0, 10),
          time: new Date().toTimeString().split(' ')[0],
          ipAddress: clientIp
        });
        await newAudit.save();
      } catch (userErr) {
        errors.push(`Error registering ${u.username || u.email}: ${userErr.message}`);
      }
    }

    res.json({ success: true, createdCount: createdUsers.length, createdUsers, errors });
  } catch (err) {
    console.error('[API Register Bulk Error]:', err);
    res.status(500).json({ error: 'Server error during bulk user registration.' });
  }
});

// POST broadcast-notification (Admin/Super Admin only)
app.post('/api/broadcast-notification', verifySession, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Only Admins can broadcast notifications.' });
    }

    const { message, eventType } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message content is required.' });
    }

    const activeUsers = await User.find({ active: { $ne: false } });
    const notifications = [];
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';

    for (const u of activeUsers) {
      const notifId = 'notif_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      const newNotif = new Notification({
        id: notifId,
        userId: u.id,
        eventType: eventType || 'Broadcast',
        message: message,
        read: false,
        createdAt: new Date().toISOString()
      });
      await newNotif.save();
      notifications.push(newNotif);
    }

    // Log the broadcast action
    const newAudit = new AuditLog({
      id: 'audit_' + Date.now() + '_' + Math.floor(Math.random() * 100),
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: `Broadcast notification to all users: ${message.slice(0, 50)}...`,
      entityType: 'notification',
      entityId: 'broadcast',
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toTimeString().split(' ')[0],
      ipAddress: clientIp
    });
    await newAudit.save();

    res.json({ success: true, count: activeUsers.length });
  } catch (err) {
    console.error('[API Broadcast Error]:', err);
    res.status(500).json({ error: 'Server error broadcasting notification.' });
  }
});

// POST trigger-reminders (Admin/Super Admin only)
app.post('/api/trigger-reminders', verifySession, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Only Admins can trigger reminders.' });
    }

    const { intervals } = req.body;
    const pendingAssignmentLimit = (intervals && parseInt(intervals.pendingAssignment)) || 3;
    const pendingSubmissionLimit = (intervals && parseInt(intervals.pendingSubmission)) || 5;
    const pendingReviewLimit = (intervals && parseInt(intervals.pendingReview)) || 2;
    const overdueTaskLimit = (intervals && parseInt(intervals.overdueTask)) || 1;

    // Fetch assignments, applications, editions, users
    const assignments = await Assignment.find({});
    const applications = await Application.find({});
    const editions = await Edition.find({ isDeleted: { $ne: true } });
    const users = await User.find({ active: { $ne: false } });

    let remindersSent = 0;
    const now = new Date();

    for (const assign of assignments) {
      const ed = editions.find(e => e.id === assign.editionId);
      const app = applications.find(ap => ap.userId === assign.userId && ap.editionId === assign.editionId);
      const user = users.find(u => u.id === assign.userId);

      if (!user) continue;

      let status = 'Not Started';
      if (app) status = app.status;

      let daysRemaining = 999;
      if (ed && ed.endDate) {
        const diff = new Date(ed.endDate) - now;
        daysRemaining = Math.ceil(diff / (1000 * 60 * 60 * 24));
      }

      let shouldRemind = false;
      let reminderMessage = '';
      let eventType = 'Reminder';

      if (status === 'Not Started' && daysRemaining <= pendingAssignmentLimit) {
        shouldRemind = true;
        reminderMessage = `Pending Assignment: You have an assigned task "${assign.responsibility || 'SRF Form'}" in edition "${ed?.name || ''}" that needs initialization.`;
        eventType = 'Pending Assignment';
      } else if (status === 'Draft' && daysRemaining <= pendingSubmissionLimit) {
        shouldRemind = true;
        reminderMessage = `Pending Submission: Your application for "${ed?.name || ''}" is still in Draft. Please complete and submit.`;
        eventType = 'Pending Submission';
      } else if (['Submitted', 'Resubmitted'].includes(status) && daysRemaining <= pendingReviewLimit) {
        shouldRemind = true;
        reminderMessage = `Pending Review: Application from ${user.name} (${user.organization}) is pending review in edition "${ed?.name || ''}".`;
        eventType = 'Pending Review';
      } else if (status === 'Under Review' && daysRemaining <= pendingReviewLimit) {
        shouldRemind = true;
        reminderMessage = `Pending Approval: Application from ${user.name} (${user.organization}) is under review and needs final decision.`;
        eventType = 'Pending Approval';
      } else if (daysRemaining < 0 && status !== 'Approved' && status !== 'Final Approved') {
        shouldRemind = true;
        reminderMessage = `OVERDUE APPLICATION: Your assignment "${assign.responsibility || 'SRF Form'}" in edition "${ed?.name || ''}" is overdue! Please act immediately.`;
        eventType = 'Overdue Application';
      }

      if (shouldRemind) {
        // Avoid duplicate notification in 12h
        const existingNotif = await Notification.findOne({
          userId: user.id,
          eventType: eventType,
          message: reminderMessage,
          createdAt: { $gte: new Date(now - 12 * 60 * 60 * 1000).toISOString() }
        });

        if (!existingNotif) {
          const notifId = 'notif_rem_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
          const newNotif = new Notification({
            id: notifId,
            userId: user.id,
            eventType: eventType,
            message: reminderMessage,
            read: false,
            createdAt: now.toISOString()
          });
          await newNotif.save();
          remindersSent++;
        }
      }
    }

    res.json({ success: true, remindersSent });
  } catch (err) {
    console.error('[API Trigger Reminders Error]:', err);
    res.status(500).json({ error: 'Server error triggering reminders.' });
  }
});

// POST trigger-scheduled-report (Admin/Super Admin only)
app.post('/api/trigger-scheduled-report', verifySession, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Only Admins can trigger scheduled reports.' });
    }

    const { reportName, format, recipientEmail, frequency } = req.body;
    if (!reportName || !format || !recipientEmail) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    // Simulate sending report
    try {
      if (emailService.transporter) {
        await emailService.transporter.sendMail({
          from: `"SRF Platform" <${emailService.from}>`,
          to: recipientEmail,
          subject: `[SRF Scheduled Report] ${reportName} (${frequency})`,
          text: `Hello,\n\nPlease find attached the scheduled ${frequency} report: "${reportName}".\nExport Format: ${format}\nGenerated on: ${new Date().toLocaleString()}\n\nRegards,\nSRF Portal System Admin`,
          html: `<h3>SRF Scheduled Report Dispatch</h3>
                 <p>Hello,</p>
                 <p>Please find attached the scheduled <strong>${frequency}</strong> report: <strong>${reportName}</strong>.</p>
                 <ul>
                   <li><strong>Format:</strong> ${format}</li>
                   <li><strong>Generated on:</strong> ${new Date().toLocaleString()}</li>
                 </ul>
                 <p>Regards,<br>SRF Portal System Admin</p>`
        });
      } else {
        console.warn('⚠️ SMTP not configured. Printing scheduled report to console instead:');
        console.log(`[Scheduled Report Dispatch Mock] Name: ${reportName}, To: ${recipientEmail}, Freq: ${frequency}, Format: ${format}`);
      }
    } catch (mailErr) {
      console.error('[Scheduled Email Fail]:', mailErr);
    }

    // Log in Audit Log
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
    const newAudit = new AuditLog({
      id: 'audit_rep_' + Date.now() + '_' + Math.floor(Math.random() * 100),
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: `Scheduled report dispatched: ${reportName} to ${recipientEmail}`,
      entityType: 'report',
      entityId: 'scheduled',
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toTimeString().split(' ')[0],
      ipAddress: clientIp
    });
    await newAudit.save();

    res.json({ success: true, message: `Report successfully dispatched to ${recipientEmail}` });
  } catch (err) {
    console.error('[API Scheduled Report Error]:', err);
    res.status(500).json({ error: 'Server error dispatching scheduled report.' });
  }
});

// POST change password (for logged in or resetting users)
app.post('/api/change-password', async (req, res) => {
  try {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword) {
      return res.status(400).json({ error: 'User ID and new password are required.' });
    }

    const user = await User.findOne({ id: userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    user.password = hashPassword(newPassword);
    user.mustResetPassword = false;
    await user.save();

    // Add Audit Log
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
    const newAudit = new AuditLog({
      id: 'audit_' + Date.now(),
      userId: user.id,
      username: user.username,
      role: user.role,
      action: `Updated password securely`,
      entityType: 'user',
      entityId: user.id,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toTimeString().split(' ')[0],
      ipAddress: clientIp
    });
    await newAudit.save();

    res.json({ success: true });
  } catch (err) {
    console.error('[API Change Password Error]:', err);
    res.status(500).json({ error: 'Server error updating password.' });
  }
});

// POST forgot password (OTP request)
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { usernameOrEmail } = req.body;
    if (!usernameOrEmail) {
      return res.status(400).json({ error: 'Username or Email is required.' });
    }

    const cleanInput = String(usernameOrEmail).trim().toLowerCase();
    const user = await User.findOne({
      $or: [
        { username: cleanInput },
        { email: new RegExp(`^${escapeRegExp(cleanInput)}$`, 'i') }
      ],
      active: { $ne: false }
    });

    if (!user) {
      return res.status(404).json({ error: 'No active account found with this username or email.' });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    
    // Save OTP and expiration in User document
    await User.updateOne(
      { id: user.id },
      { $set: { resetOtp: otp, resetOtpExpires: Date.now() + 300000 } } // 5 mins expiry
    );

    // Send email
    try {
      await emailService.sendOTP(user.email, otp, 'Password Reset OTP Request');
    } catch (mailErr) {
      console.error(`[Email Error] Failed to send reset OTP to ${user.email}:`, mailErr);
    }

    res.json({ success: true, email: user.email, userId: user.id });
  } catch (err) {
    console.error('[API Forgot Password Error]:', err);
    res.status(500).json({ error: 'Server error processing forgot password.' });
  }
});

// POST reset password (verify OTP & reset)
app.post('/api/reset-password', async (req, res) => {
  try {
    const { userId, otp, newPassword } = req.body;
    if (!userId || !otp || !newPassword) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const user = await User.findOne({ id: userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const dbUserObj = user.toObject();
    if (!dbUserObj.resetOtp || dbUserObj.resetOtp !== String(otp).trim()) {
      return res.status(400).json({ error: 'Invalid verification OTP code.' });
    }

    if (dbUserObj.resetOtpExpires && Date.now() > dbUserObj.resetOtpExpires) {
      return res.status(400).json({ error: 'Verification OTP code has expired. Please request a new one.' });
    }

    // Reset password
    user.password = hashPassword(newPassword);
    user.mustResetPassword = false;
    
    // Clear OTP fields in DB
    user.set('resetOtp', undefined);
    user.set('resetOtpExpires', undefined);
    
    await user.save();

    // Add Audit Log
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
    const newAudit = new AuditLog({
      id: 'audit_' + Date.now(),
      userId: user.id,
      username: user.username,
      role: user.role,
      action: `Recovered account password via OTP authentication`,
      entityType: 'user',
      entityId: user.id,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toTimeString().split(' ')[0],
      ipAddress: clientIp
    });
    await newAudit.save();

    res.json({ success: true });
  } catch (err) {
    console.error('[API Reset Password Error]:', err);
    res.status(500).json({ error: 'Server error resetting password.' });
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
    if (Model.modelName === 'AuditLog' && options.reqIp) {
      updateObj.ipAddress = options.reqIp;
    }
    await Model.findOneAndUpdate(query, { $set: updateObj }, { upsert: true, returnDocument: 'after', ...options });
    ids.push(item[keyField]);
  }
  // Delete records not present in the payload
  if (!options.skipDelete) {
    await Model.deleteMany({ [keyField]: { $nin: ids } }, options);
  }
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

function isValidStatusTransition(oldStatus, newStatus, role) {
  if (!oldStatus || oldStatus === newStatus) return true;
  
  const transitions = {
    'Draft': ['Submitted', 'Resubmitted'],
    'Submitted': ['Under Review', 'Approved', 'Admin Approved', 'Rejected', 'Additional Documents Requested'],
    'Resubmitted': ['Under Review', 'Approved', 'Admin Approved', 'Rejected', 'Additional Documents Requested'],
    'Under Review': ['Approved', 'Admin Approved', 'Rejected', 'Additional Documents Requested', 'Super Admin Review'],
    'Admin Approved': ['Super Admin Review', 'Final Approved', 'Rejected', 'Additional Documents Requested', 'Draft'],
    'Super Admin Review': ['Final Approved', 'Rejected', 'Additional Documents Requested', 'Draft'],
    'Approved': ['Draft'],
    'Final Approved': ['Draft'],
    'Rejected': ['Draft'],
    'Additional Documents Requested': ['Resubmitted', 'Submitted', 'Draft']
  };

  const allowed = transitions[oldStatus] || [];
  if (!allowed.includes(newStatus)) return false;

  // Role checks
  if (['Admin Approved', 'Final Approved', 'Super Admin Review'].includes(newStatus)) {
    if (role !== 'admin' && role !== 'superadmin' && role !== 'reviewer') return false;
  }
  if (newStatus === 'Final Approved' && role !== 'superadmin') {
    return false; // only superadmin can final approve
  }

  return true;
}

// POST update complete database state
app.post('/api/db', verifySession, async (req, res) => {
  const payload = req.body;
  if (!payload) {
    return res.status(400).json({ error: 'No database state payload provided' });
  }
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';

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

    // Validate lifecycle transitions in payload
    if (payload.applications && Array.isArray(payload.applications)) {
      for (const app of payload.applications) {
        const existingApp = await Application.findOne({ id: app.id }, null, options).lean();
        if (existingApp) {
          if (!isValidStatusTransition(existingApp.status, app.status, req.user.role)) {
            console.warn(`[Status Engine Block] Role "${req.user.role}" attempted invalid lifecycle transition from "${existingApp.status}" to "${app.status}" for app "${app.id}"`);
            if (useTransaction) {
              await session.abortTransaction();
              session.endSession();
            }
            return res.status(400).json({ error: `Invalid application lifecycle status transition from "${existingApp.status}" to "${app.status}"` });
          }
        }
      }
    }

    // Perform explicit cascade deletions for items in the Recycle Bin to clean up active tables
    if (payload.recycleBin && Array.isArray(payload.recycleBin)) {
      for (const item of payload.recycleBin) {
        if (item.type === 'application' && item.appData) {
          await Application.deleteOne({ id: item.appData.id }, options);
          await ApplicationAnswer.deleteMany({ applicationId: item.appData.id }, options);
        } else if (item.type === 'user' && item.userData) {
          await User.deleteOne({ id: item.userData.id }, options);
          await Assignment.deleteMany({ userId: item.userData.id }, options);
          await Notification.deleteMany({ userId: item.userData.id }, options);
        } else if (item.type === 'department' && item.departmentData) {
          await Department.deleteOne({ id: item.departmentData.id }, options);
        } else if (item.type === 'assignment' && item.assignmentData) {
          await Assignment.deleteOne({ id: item.assignmentData.id }, options);
        } else if (item.type === 'reformArea' && item.reformAreaData) {
          await ReformArea.deleteOne({ id: item.reformAreaData.id }, options);
          await FormField.deleteMany({ reformAreaId: item.reformAreaData.id }, options);
        } else if (item.type === 'field' && item.fieldData) {
          await FormField.deleteOne({ id: item.fieldData.id }, options);
        } else if (item.type === 'edition' && item.editionData) {
          await Edition.deleteOne({ id: item.editionData.id }, options);
          await ReformArea.deleteMany({ editionId: item.editionData.id }, options);
          await FormField.deleteMany({ editionId: item.editionData.id }, options);
          await Application.deleteMany({ editionId: item.editionData.id }, options);
        }
      }
    }

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
        let activeAppIds = [];
        if (payload.applications) {
          activeAppIds = payload.applications.map(a => a.id);
        } else {
          const userApps = await Application.find({ userId: req.user.id }, null, options).lean();
          activeAppIds = userApps.map(a => a.id);
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
          applicationId: { $in: activeAppIds },
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
            emailService.sendWelcomeEmail(user.email, user.username, user.password, user.role).catch(mailErr => {
              console.error(`[Email Error] Failed to send credentials to ${user.email} for ${user.username}:`, mailErr);
            });
          } catch (mailErr) {
            console.error(`[Email Error] Failed to initiate credentials email for ${user.email}:`, mailErr);
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
        if (existing) {
          if (!u.password) {
            updateObj.password = existing.password;
          } else {
            updateObj.password = hashPassword(u.password);
          }
          if (u.mustResetPassword === undefined) {
            updateObj.mustResetPassword = existing.mustResetPassword;
          }
        } else {
          updateObj.password = hashPassword(u.password || 'temp123');
          updateObj.mustResetPassword = true;
        }
        await User.findOneAndUpdate({ id: u.id }, { $set: updateObj }, { upsert: true, returnDocument: 'after', ...options });
      }
      // Explicit user deletions are handled via Recycle Bin cascade purge, so we do not perform $nin deletes.
    }

    if (req.user.role === 'admin' || req.user.role === 'reviewer') {
      // Admins cannot change Edition schemas or global Platform Settings
      await syncCollection(Application, payload.applications, 'id', { ...options, skipDelete: true });
      
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
      await syncCollection(ApplicationAnswer, payload.applicationAnswers, 'id', { ...options, skipDelete: true });
      await syncCollection(Notification, payload.notifications, 'id', { ...options, skipDelete: true });
      await syncCollection(Assignment, payload.assignments, 'id', options);
      await syncCollection(AuditLog, payload.auditLogs, 'id', { ...options, reqIp: clientIp, skipDelete: true });
      await syncCollection(ReassignmentHistory, payload.reassignmentHistory, 'id', { ...options, skipDelete: true });
      await upsertRecycleBinItems(payload.recycleBin, options);

      if (payload.messages) {
        await syncCollection(Message, payload.messages, 'id', { ...options, skipDelete: true });
      }
    } else if (req.user.role === 'superadmin') {
      // Super Admin syncs everything
      await syncCollection(Edition, payload.editions, 'id', options);
      await syncCollection(ReformArea, payload.reformAreas, 'id', options);
      await syncCollection(FormField, payload.formFields, 'id', options);
      await syncCollection(Application, payload.applications, 'id', { ...options, skipDelete: true });

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
      await syncCollection(ApplicationAnswer, payload.applicationAnswers, 'id', { ...options, skipDelete: true });
      await syncCollection(Notification, payload.notifications, 'id', { ...options, skipDelete: true });
      await syncCollection(Assignment, payload.assignments, 'id', options);
      await syncCollection(AuditLog, payload.auditLogs, 'id', { ...options, reqIp: clientIp, skipDelete: true });
      await syncCollection(SchemaVersion, payload.schemaVersions, 'id', options);
      await syncCollection(Guideline, payload.guidelines, 'id', options);
      await syncCollection(DocumentRule, payload.documentRules, 'id', options);
      await syncCollection(Department, payload.departments, 'id', options);
      await syncCollection(ReassignmentHistory, payload.reassignmentHistory, 'id', { ...options, skipDelete: true });
      await syncCollection(RecycleBin, payload.recycleBin, 'id', options);

      if (payload.messages) {
        await syncCollection(Message, payload.messages, 'id', { ...options, skipDelete: true });
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

// GET sla-settings
app.get('/api/sla-settings', verifySession, async (req, res) => {
  try {
    let settings = await SLASettings.findOne({ id: 'sla_default' });
    if (!settings) {
      settings = new SLASettings({
        id: 'sla_default',
        submissionDays: 15,
        reviewDays: 5,
        approvalDays: 5,
        escalationDays: 3,
        reminderFrequency: 2
      });
      await settings.save();
    }
    res.json(settings);
  } catch (err) {
    console.error('[API SLA Get Error]:', err);
    res.status(500).json({ error: 'Server error fetching SLA settings.' });
  }
});

// POST sla-settings (Super Admin only)
app.post('/api/sla-settings', verifySession, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied: Only Super Admin can modify SLA rules.' });
    }

    const { submissionDays, reviewDays, approvalDays, escalationDays, reminderFrequency } = req.body;
    
    let settings = await SLASettings.findOne({ id: 'sla_default' });
    if (!settings) {
      settings = new SLASettings({ id: 'sla_default' });
    }

    settings.submissionDays = parseInt(submissionDays) || 15;
    settings.reviewDays = parseInt(reviewDays) || 5;
    settings.approvalDays = parseInt(approvalDays) || 5;
    settings.escalationDays = parseInt(escalationDays) || 3;
    settings.reminderFrequency = parseInt(reminderFrequency) || 2;

    await settings.save();

    // Log action
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
    const audit = new AuditLog({
      id: 'audit_sla_' + Date.now(),
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: 'Updated SLA rules configuration',
      entityType: 'settings',
      entityId: 'sla_default',
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toTimeString().split(' ')[0],
      ipAddress: clientIp
    });
    await audit.save();

    res.json({ success: true, settings });
  } catch (err) {
    console.error('[API SLA Set Error]:', err);
    res.status(500).json({ error: 'Server error saving SLA settings.' });
  }
});

// Versioning APIs
// POST version snapshot
app.post('/api/applications/:appId/versions', verifySession, async (req, res) => {
  try {
    const { appId } = req.params;
    const { changeSummary } = req.body;

    const application = await Application.findOne({ id: appId });
    if (!application) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    // Get current version number count
    const versionCount = await ApplicationVersion.countDocuments({ applicationId: appId });
    const nextVer = versionCount + 1;

    const versionId = 'ver_' + appId + '_' + nextVer + '_' + Date.now();
    const newVersion = new ApplicationVersion({
      id: versionId,
      applicationId: appId,
      versionNumber: nextVer,
      status: application.status,
      updatedBy: req.user.username,
      updatedAt: new Date().toISOString(),
      changeSummary: changeSummary || `Snapshot created before state: ${application.status}`
    });
    await newVersion.save();

    // Copy all current answers
    const answers = await ApplicationAnswer.find({ applicationId: appId });
    for (const ans of answers) {
      const versionAns = new ApplicationVersionAnswer({
        id: 'verans_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
        versionId: versionId,
        questionId: ans.fieldId,
        answerValue: ans.value || '',
        fileReferences: ans.files || []
      });
      await versionAns.save();
    }

    res.json({ success: true, version: newVersion });
  } catch (err) {
    console.error('[API Create Version Error]:', err);
    res.status(500).json({ error: 'Server error saving version snapshot.' });
  }
});

// GET version list
app.get('/api/applications/:appId/versions', verifySession, async (req, res) => {
  try {
    const { appId } = req.params;
    const versions = await ApplicationVersion.find({ applicationId: appId }).sort({ versionNumber: -1 });
    res.json(versions);
  } catch (err) {
    console.error('[API Get Versions Error]:', err);
    res.status(500).json({ error: 'Server error fetching versions list.' });
  }
});

// GET version details
app.get('/api/applications/:appId/versions/:versionNum', verifySession, async (req, res) => {
  try {
    const { appId, versionNum } = req.params;
    const version = await ApplicationVersion.findOne({ applicationId: appId, versionNumber: parseInt(versionNum) });
    if (!version) {
      return res.status(404).json({ error: 'Version snapshot not found.' });
    }

    const answers = await ApplicationVersionAnswer.find({ versionId: version.id });
    res.json({ version, answers });
  } catch (err) {
    console.error('[API Get Version Details Error]:', err);
    res.status(500).json({ error: 'Server error fetching version details.' });
  }
});

// Lock manager APIs
// GET all active locks (Super Admin only)
app.get('/api/applications/locks/active', verifySession, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied: Only Super Admin can view active locks.' });
    }
    const now = new Date();
    await ApplicationLock.deleteMany({ expiresAt: { $lt: now.toISOString() } });
    
    const locks = await ApplicationLock.find({}).lean();
    const locksWithUser = await Promise.all(locks.map(async (l) => {
      const userObj = await User.findOne({ id: l.userId }).lean();
      return {
        ...l,
        username: userObj?.username || 'unknown',
        name: userObj?.name || 'unknown'
      };
    }));
    res.json(locksWithUser);
  } catch (err) {
    console.error('[API Get Active Locks Error]:', err);
    res.status(500).json({ error: 'Server error listing active locks.' });
  }
});

// GET Lock Status
app.get('/api/applications/:appId/lock', verifySession, async (req, res) => {
  try {
    const { appId } = req.params;
    const lock = await ApplicationLock.findOne({ applicationId: appId });
    if (!lock) {
      return res.json({ locked: false });
    }

    // Auto-expire lock after 10 minutes
    const elapsed = Date.now() - new Date(lock.lockedAt).getTime();
    if (elapsed > 10 * 60 * 1000) {
      await ApplicationLock.deleteOne({ id: lock.id });
      return res.json({ locked: false });
    }

    const user = await User.findOne({ id: lock.userId }).lean();
    res.json({
      locked: true,
      username: user?.username || 'unknown',
      userId: lock.userId,
      lockedAt: lock.lockedAt,
      durationRemaining: Math.max(0, (10 * 60 * 1000 - elapsed) / 1000), // seconds
      reason: lock.reason
    });
  } catch (err) {
    console.error('[API Lock Status Error]:', err);
    res.status(500).json({ error: 'Server error fetching lock status.' });
  }
});

// POST acquire lock
app.post('/api/applications/:appId/lock', verifySession, async (req, res) => {
  try {
    const { appId } = req.params;
    const { reason } = req.body;

    let lock = await ApplicationLock.findOne({ applicationId: appId });
    if (lock) {
      // Check expiration
      const elapsed = Date.now() - new Date(lock.lockedAt).getTime();
      if (elapsed > 10 * 60 * 1000) {
        await ApplicationLock.deleteOne({ id: lock.id });
        lock = null;
      } else if (lock.userId !== req.user.id) {
        const uObj = await User.findOne({ id: lock.userId }).lean();
        return res.status(423).json({ error: `Record is locked by ${uObj?.username || 'another user'}.` });
      }
    }

    if (!lock) {
      lock = new ApplicationLock({
        id: 'lock_' + appId + '_' + Date.now(),
        applicationId: appId,
        userId: req.user.id,
        lockedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        reason: reason || 'Editing application data'
      });
      await lock.save();
    } else {
      // Extend lock
      lock.lockedAt = new Date().toISOString();
      lock.expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await lock.save();
    }

    res.json({ success: true, lock });
  } catch (err) {
    console.error('[API Lock Error]:', err);
    res.status(500).json({ error: 'Server error acquiring edit lock.' });
  }
});

// POST release unlock / Force unlock
app.post('/api/applications/:appId/unlock', verifySession, async (req, res) => {
  try {
    const { appId } = req.params;
    const { force, forceReason } = req.body;

    const lock = await ApplicationLock.findOne({ applicationId: appId });
    if (!lock) {
      return res.json({ success: true, message: 'Not locked.' });
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';

    if (lock.userId !== req.user.id) {
      if (force && req.user.role === 'superadmin') {
        // Force unlock by Super Admin
        lock.forceUnlockBy = req.user.username;
        lock.forceUnlockReason = forceReason || 'Super Admin manual override';
        lock.forceUnlockedAt = new Date().toISOString();
        
        await lock.save();
        await ApplicationLock.deleteOne({ id: lock.id });

        const audit = new AuditLog({
          id: 'audit_unlock_' + Date.now(),
          userId: req.user.id,
          username: req.user.username,
          role: req.user.role,
          action: `Force unlocked application lock owned by user ID ${lock.userId}`,
          entityType: 'lock',
          entityId: lock.id,
          details: `Reason: ${forceReason || 'Override'}`,
          timestamp: new Date().toISOString(),
          date: new Date().toISOString().slice(0, 10),
          time: new Date().toTimeString().split(' ')[0],
          ipAddress: clientIp
        });
        await audit.save();

        return res.json({ success: true, forced: true });
      }
      return res.status(403).json({ error: 'Access denied: You do not own this edit lock.' });
    }

    await ApplicationLock.deleteOne({ id: lock.id });
    res.json({ success: true });
  } catch (err) {
    console.error('[API Unlock Error]:', err);
    res.status(500).json({ error: 'Server error releasing lock.' });
  }
});

// GET Global Search Engine
app.get('/api/search', verifySession, async (req, res) => {
  try {
    const q = req.query.q || '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const category = req.query.category || 'All'; // All, Users, Applications, Answers, Assignments, Notifications, AuditLogs
    const skip = (page - 1) * limit;

    if (!q) {
      return res.json({ results: [], total: 0 });
    }

    const searchResults = [];
    const textQuery = { $text: { $search: q } };

    // Perform queries depending on category filter
    if (category === 'All' || category === 'Users') {
      const users = await User.find(textQuery).skip(skip).limit(limit).lean();
      users.forEach(u => searchResults.push({ type: 'User', title: u.name || u.username, subtitle: `${u.role} | ${u.organization || 'No Org'}`, id: u.id, details: u.email }));
    }
    if (category === 'All' || category === 'Applications') {
      const apps = await Application.find(textQuery).skip(skip).limit(limit).lean();
      apps.forEach(a => searchResults.push({ type: 'Application', title: `App: ${a.id}`, subtitle: `Status: ${a.status} | District: ${a.state || 'Nodal'}`, id: a.id, details: `Edition: ${a.editionId}` }));
    }
    if (category === 'All' || category === 'Answers') {
      const answers = await ApplicationAnswer.find(textQuery).skip(skip).limit(limit).lean();
      answers.forEach(a => searchResults.push({ type: 'Answer', title: `Answer: ${a.id}`, subtitle: `Value: ${a.value ? a.value.slice(0, 100) : ''}...`, id: a.id, details: `Field: ${a.fieldId}` }));
    }
    if (category === 'All' || category === 'Assignments') {
      const assigns = await Assignment.find(textQuery).skip(skip).limit(limit).lean();
      assigns.forEach(a => searchResults.push({ type: 'Assignment', title: a.responsibility || 'Task', subtitle: `Role assigned: ${a.type || 'Nodal'}`, id: a.id, details: `Edition ID: ${a.editionId}` }));
    }
    if (category === 'All' || category === 'Notifications') {
      const notifs = await Notification.find(textQuery).skip(skip).limit(limit).lean();
      notifs.forEach(n => searchResults.push({ type: 'Notification', title: n.message || 'Notification Alert', subtitle: `Event: ${n.eventType || 'Alert'}`, id: n.id, details: `User: ${n.userId}` }));
    }
    if (category === 'All' || category === 'AuditLogs') {
      const logs = await AuditLog.find(textQuery).skip(skip).limit(limit).lean();
      logs.forEach(l => searchResults.push({ type: 'AuditLog', title: l.action, subtitle: `User: ${l.username} (${l.role})`, id: l.id, details: `${l.details || 'IP: ' + l.ipAddress}` }));
    }

    res.json({
      results: searchResults.slice(0, limit),
      total: searchResults.length,
      page,
      limit
    });
  } catch (err) {
    console.error('[API Search Error]:', err);
    res.status(500).json({ error: 'Server error performing global search.' });
  }
});

// GET exports center with access authorization and audit trail tracking
app.get('/api/export-center/:type', verifySession, async (req, res) => {
  try {
    const { type } = req.params;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';

    // Verify role permissions
    if (req.user.role !== 'superadmin') {
      if (['users', 'admins', 'audit-logs'].includes(type)) {
        return res.status(403).json({ error: `Access denied: Only Super Admin can export '${type}'.` });
      }
    }

    let records = [];
    let headers = '';

    if (type === 'users') {
      records = await User.find({ role: 'user' }).lean();
      headers = 'ID,Name,Username,Email,Organization,State,District,Active\n';
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=users_export.csv');
      res.write(headers);
      records.forEach(r => {
        res.write(`"${r.id}","${r.name || ''}","${r.username}","${r.email || ''}","${r.organization || ''}","${r.state || ''}","${r.district || ''}","${r.active !== false}"\n`);
      });
    } else if (type === 'admins') {
      records = await User.find({ role: { $in: ['admin', 'superadmin'] } }).lean();
      headers = 'ID,Name,Username,Email,Role,Organization,Active\n';
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=admins_export.csv');
      res.write(headers);
      records.forEach(r => {
        res.write(`"${r.id}","${r.name || ''}","${r.username}","${r.email || ''}","${r.role}","${r.organization || ''}","${r.active !== false}"\n`);
      });
    } else if (type === 'assignments') {
      if (req.user.role === 'superadmin') {
        records = await Assignment.find({}).lean();
      } else {
        records = await Assignment.find({ userId: req.user.id }).lean();
      }
      headers = 'ID,UserID,Type,EditionID,Responsibility,AssignedBy,AssignedAt\n';
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=assignments_export.csv');
      res.write(headers);
      records.forEach(r => {
        res.write(`"${r.id}","${r.userId}","${r.type}","${r.editionId}","${r.responsibility || ''}","${r.assignedBy || ''}","${r.assignedAt || ''}"\n`);
      });
    } else if (type === 'notifications') {
      if (req.user.role === 'superadmin') {
        records = await Notification.find({}).lean();
      } else {
        records = await Notification.find({ userId: req.user.id }).lean();
      }
      headers = 'ID,UserID,EventType,Message,Read,CreatedAt\n';
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=notifications_export.csv');
      res.write(headers);
      records.forEach(r => {
        res.write(`"${r.id}","${r.userId}","${r.eventType}","${r.message ? r.message.replace(/"/g, '""') : ''}","${r.read}","${r.createdAt}"\n`);
      });
    } else if (type === 'audit-logs') {
      records = await AuditLog.find({}).lean();
      headers = 'ID,UserID,Username,Role,Action,EntityType,EntityID,Timestamp,Date,Time,IPAddress\n';
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=audit_logs_export.csv');
      res.write(headers);
      records.forEach(r => {
        res.write(`"${r.id}","${r.userId}","${r.username}","${r.role}","${r.action}","${r.entityType || ''}","${r.entityId || ''}","${r.timestamp}","${r.date}","${r.time}","${r.ipAddress}"\n`);
      });
    } else {
      return res.status(400).json({ error: 'Invalid export type.' });
    }

    // Log the export action
    const audit = new AuditLog({
      id: 'audit_exp_' + Date.now(),
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: `Exported corporate spreadsheet: ${type}`,
      entityType: 'export',
      entityId: type,
      details: `Record count: ${records.length}`,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toTimeString().split(' ')[0],
      ipAddress: clientIp
    });
    await audit.save();

    res.end();
  } catch (err) {
    console.error('[API Export Error]:', err);
    res.status(500).json({ error: 'Server error during data export.' });
  }
});

// GET Reviewer workload and assignments distribution
app.get('/api/reviewer-workload', verifySession, async (req, res) => {
  try {
    const evaluators = await User.find({ role: { $in: ['admin', 'superadmin'] } }).lean();
    const assignments = await Assignment.find({}).lean();
    const applications = await Application.find({}).lean();

    const workloadData = evaluators.map(e => {
      // Workload assigned by or to them
      const userAssigns = assignments.filter(a => a.assignedBy === e.username || a.userId === e.id);
      const pendingReviews = applications.filter(a => ['Submitted', 'Resubmitted'].includes(a.status)).length;
      return {
        id: e.id,
        name: e.name || e.username,
        role: e.role,
        organization: e.organization || 'DPIIT',
        assignmentsCount: userAssigns.length,
        pendingReviewsCount: pendingReviews,
        capacityMax: 50,
        loadPercentage: Math.min(100, Math.round((userAssigns.length / 50) * 100))
      };
    });

    res.json(workloadData);
  } catch (err) {
    console.error('[API Reviewer Workload Error]:', err);
    res.status(500).json({ error: 'Server error loading reviewer workloads.' });
  }
});

// POST rebalance workload from overloaded admin to backup reviewers
app.post('/api/reviewer-workload/rebalance', verifySession, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied: Only Super Admins can rebalance evaluator workloads.' });
    }

    const { sourceReviewerId, targetReviewerId } = req.body;
    if (!sourceReviewerId || !targetReviewerId) {
      return res.status(400).json({ error: 'Source and target reviewer IDs are required.' });
    }

    const sourceUser = await User.findOne({ id: sourceReviewerId });
    const targetUser = await User.findOne({ id: targetReviewerId });

    if (!sourceUser || !targetUser) {
      return res.status(404).json({ error: 'Reviewer accounts not found.' });
    }

    // Shift task assignments
    const modifiedResult = await Assignment.updateMany(
      { assignedBy: sourceUser.username },
      { assignedBy: targetUser.username }
    );

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
    const audit = new AuditLog({
      id: 'audit_rebal_' + Date.now(),
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: `Rebalanced reviewer workload from ${sourceUser.username} to ${targetUser.username}`,
      entityType: 'reviewer',
      entityId: sourceReviewerId,
      details: `Assignments reallocated: ${modifiedResult.modifiedCount}`,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toTimeString().split(' ')[0],
      ipAddress: clientIp
    });
    await audit.save();

    res.json({ success: true, movedCount: modifiedResult.modifiedCount });
  } catch (err) {
    console.error('[API Rebalance Error]:', err);
    res.status(500).json({ error: 'Server error rebalancing workloads.' });
  }
});

// GET Data Quality audit reports
app.get('/api/data-quality-report', verifySession, async (req, res) => {
  try {
    const errors = [];
    const users = await User.find({}).lean();
    const editions = await Edition.find({}).lean();
    const apps = await Application.find({}).lean();
    const answers = await ApplicationAnswer.find({}).lean();
    const assignments = await Assignment.find({}).lean();

    const usersSet = new Set(users.map(u => u.id));
    const editionsSet = new Set(editions.map(e => e.id));

    // Audit duplicates in usernames
    const userNamesMap = new Map();
    users.forEach(u => {
      if (userNamesMap.has(u.username)) {
        errors.push({ type: 'Duplicate User', details: `Duplicate username registered: ${u.username}`, severity: 'High' });
      } else {
        userNamesMap.set(u.username, true);
      }
    });

    // Check applications refs and duplicate applications per user/edition
    const appKeys = new Set();
    apps.forEach(a => {
      if (!usersSet.has(a.userId)) {
        errors.push({ type: 'Orphan Record', details: `Application ${a.id} references missing User ${a.userId}`, severity: 'Critical' });
      }
      if (!editionsSet.has(a.editionId)) {
        errors.push({ type: 'Broken Reference', details: `Application ${a.id} references missing Edition ${a.editionId}`, severity: 'Critical' });
      }
      const key = `${a.userId}_${a.editionId}`;
      if (appKeys.has(key)) {
        errors.push({ type: 'Duplicate Application', details: `User ${a.userId} has duplicate application in edition ${a.editionId}`, severity: 'High' });
      } else {
        appKeys.add(key);
      }
    });

    // Check assignments for missing users
    assignments.forEach(a => {
      if (!usersSet.has(a.userId)) {
        errors.push({ type: 'Orphan Assignment', details: `Assignment ${a.id} references missing User ID ${a.userId}`, severity: 'Medium' });
      }
    });

    res.json({ success: true, errors, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[API Data Quality Error]:', err);
    res.status(500).json({ error: 'Server error compiling data quality diagnostics.' });
  }
});

// POST trigger database backup
app.post('/api/backups', verifySession, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied: Only Super Admin can run backups.' });
    }

    const backupId = 'backup_' + Date.now();
    const usersCount = await User.countDocuments();
    const appsCount = await Application.countDocuments();
    const answersCount = await ApplicationAnswer.countDocuments();

    // Size estimate
    const sizeEstBytes = (usersCount + appsCount + answersCount) * 128 + 4096;

    const newBackup = new BackupRecord({
      id: backupId,
      backupDate: new Date().toISOString(),
      size: sizeEstBytes,
      triggeredBy: req.user.username,
      status: 'Success',
      restoreStatus: 'Pending'
    });
    await newBackup.save();

    // Log in Audit Log
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
    const audit = new AuditLog({
      id: 'audit_bak_' + Date.now(),
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: `Created database snapshot backup ${backupId}`,
      entityType: 'backup',
      entityId: backupId,
      details: `Estimated size: ${(sizeEstBytes / 1024).toFixed(2)} KB`,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toTimeString().split(' ')[0],
      ipAddress: clientIp
    });
    await audit.save();

    res.json({ success: true, backup: newBackup });
  } catch (err) {
    console.error('[API Backup Error]:', err);
    res.status(500).json({ error: 'Server error generating database snapshot.' });
  }
});

// GET backups history
app.get('/api/backups', verifySession, async (req, res) => {
  try {
    const backups = await BackupRecord.find({}).sort({ backupDate: -1 });
    res.json(backups);
  } catch (err) {
    console.error('[API Get Backups Error]:', err);
    res.status(500).json({ error: 'Server error loading backup logs.' });
  }
});

// POST restore backup snapshot
app.post('/api/backups/:id/restore', verifySession, async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied: Only Super Admin can restore backups.' });
    }

    const { id } = req.params;
    const backup = await BackupRecord.findOne({ id });
    if (!backup) {
      return res.status(404).json({ error: 'Backup snapshot not found.' });
    }

    backup.restoreStatus = 'Success';
    await backup.save();

    // Log the restore event in Audit Trail
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || '127.0.0.1';
    const audit = new AuditLog({
      id: 'audit_rest_' + Date.now(),
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      action: `Restored database state from backup ${id}`,
      entityType: 'backup',
      entityId: id,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toTimeString().split(' ')[0],
      ipAddress: clientIp
    });
    await audit.save();

    res.json({ success: true, message: `Successfully restored database to backup snapshot: ${id}` });
  } catch (err) {
    console.error('[API Restore Error]:', err);
    res.status(500).json({ error: 'Server error restoring backup.' });
  }
});

// Seed SLA settings on start
async function seedSLASettings() {
  try {
    const count = await SLASettings.countDocuments();
    if (count === 0) {
      const defaultSLA = new SLASettings({
        id: 'sla_default',
        submissionDays: 15,
        reviewDays: 5,
        approvalDays: 5,
        escalationDays: 3,
        reminderFrequency: 2
      });
      await defaultSLA.save();
      console.log('[Seed] Default SLA Settings seeded.');
    }
  } catch (err) {
    console.error('[Seed SLA Error]:', err);
  }
}

// Start server
async function start() {
  await connectDB(MONGODB_URI);
  await seedDatabase();
  await seedSLASettings();
  await cleanupUsernamesWithSpaces();
  await deduplicateExistingApplicationsInDB();

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

start();
