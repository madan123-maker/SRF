import mongoose from 'mongoose';

// Connection function
export async function connectDB(mongoUri) {
  try {
    const conn = await mongoose.connect(mongoUri);
    console.log(`[Database] MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`[Database] Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════
// SCHEMAS & MODELS
// ═══════════════════════════════════════════════════════════════

const userSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  email: String,
  mobile: String,
  role: String,
  name: String,
  organization: String,
  category: String,
  state: String,
  district: String,
  sector: String,
  nodalOfficer: String,
  startupName: String,
  createdAt: String,
  lastLogin: String,
  active: { type: Boolean, default: true }
}, { minimize: false });

const editionSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  name: String,
  version: String,
  description: String,
  startDate: String,
  endDate: String,
  status: String,
  createdBy: String,
  createdAt: String,
  clonedFrom: String,
  categories: [mongoose.Schema.Types.Mixed],
  totalMarks: Number,
  isDeleted: { type: Boolean, default: false }
}, { minimize: false });

const reformAreaSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  editionId: String, // Reference ID to Edition
  name: String,
  description: String,
  orderIndex: Number,
  color: String,
  marks: Number,
  dueDate: String,
  assignment: mongoose.Schema.Types.Mixed
}, { minimize: false });

const formFieldSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  num: String,
  editionId: String, // Reference ID to Edition
  reformAreaId: String, // Reference ID to ReformArea
  actionPointId: String,
  actionPointTitle: String,
  fieldType: String,
  label: String,
  text: String,
  placeholder: String,
  required: Boolean,
  mandatory: Boolean,
  weight: Number,
  maxScore: Number,
  uploadRequirement: String,
  options: [String],
  helpText: String,
  url: String,
  content: String,
  orderIndex: Number,
  isLayoutElement: Boolean,
  isUploadElement: Boolean,
  docs: [mongoose.Schema.Types.Mixed],
  guidelinePage: Number,
  createdAt: String,
  elements: [mongoose.Schema.Types.Mixed],
  assignment: mongoose.Schema.Types.Mixed
}, { minimize: false });

const applicationSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  editionId: String, // Reference ID to Edition
  userId: String, // Reference ID to User
  state: String,
  organization: String,
  category: String,
  duration: String,
  status: String,
  score: Number,
  submittedAt: String,
  updatedAt: String,
  rejectionReason: String,
  additionalDocsNote: String,
  timeline: [mongoose.Schema.Types.Mixed],
  comments: [mongoose.Schema.Types.Mixed],
  reformAreaStatuses: mongoose.Schema.Types.Mixed,
  assignedReviewer: String, // userId of reviewer
  assignedDate: String,     // ISO timestamp of assignment
  lastReviewDate: String,   // ISO timestamp of last review action
  reviewLockedBy: String,   // userId of lock holder
  reviewLockedAt: String,   // ISO timestamp of lock creation
  reviewerNotes: String,    // private notes only visible to admin/superadmin
  isEscalated: { type: Boolean, default: false },
  escalationDetails: mongoose.Schema.Types.Mixed // { reason, priority, assignedTo, escalatedBy, escalatedAt }
}, { minimize: false });

// Compound unique indexes to ensure a single application per State/Organization and Edition
applicationSchema.index(
  { editionId: 1, state: 1 },
  { unique: true, partialFilterExpression: { state: { $type: "string", $ne: "" } } }
);
applicationSchema.index(
  { editionId: 1, organization: 1 },
  { unique: true, partialFilterExpression: { state: { $eq: "" }, organization: { $type: "string", $ne: "" } } }
);

const applicationAnswerSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  applicationId: String, // Reference ID to Application
  fieldId: String, // Reference ID to FormField
  value: mongoose.Schema.Types.Mixed,
  compliance: String,
  questionStatus: String,
  questionScore: Number,
  adminRemarks: String,
  approvedAt: String,
  approvedBy: String,
  questionRejectedAt: String,
  questionRejectedBy: String,
  files: [mongoose.Schema.Types.Mixed],
  updatedAt: String
}, { minimize: false });

const notificationSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  userId: String, // Reference ID to User
  eventType: String,
  message: String,
  applicationId: String,
  read: { type: Boolean, default: false },
  createdAt: String
}, { minimize: false });

const assignmentSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  userId: String, // Reference ID to User
  sectionId: String, // Reference ID to ReformArea
  editionId: String, // Reference ID to Edition
  responsibility: String,
  assignedBy: String,
  assignedAt: String,
  type: String,
  reformAreaId: String,
  actionPointId: String,
  questionId: String,
  fieldId: String
}, { minimize: false });

const auditLogSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  userId: String, // Reference ID to User
  action: String,
  entityType: String,
  entityId: String,
  details: String,
  timestamp: String
}, { minimize: false });

const schemaVersionSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  editionId: String, // Reference ID to Edition
  version: Number,
  versionLabel: String,
  snapshot: String, // Stringified JSON snapshot
  createdAt: String,
  createdBy: String,
  note: String
}, { minimize: false });

const settingsSchema = new mongoose.Schema({
  platformName: String,
  orgName: String,
  logoText: String,
  autoSaveDraftInterval: Number
}, { minimize: false });

const guidelineSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  editionId: String, // Reference ID to Edition
  fieldId: String, // Reference ID to FormField
  title: String,
  type: String,
  url: String,
  content: String
}, { minimize: false });

const documentRuleSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  editionId: String, // Reference ID to Edition
  sectionId: String, // Reference ID to ReformArea
  ruleName: String,
  expression: String,
  errorMessage: String
}, { minimize: false });

const departmentSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  name: { type: String, unique: true, required: true },
  code: { type: String, required: true },
  description: String,
  createdAt: String
}, { minimize: false });

const reassignmentHistorySchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  assignmentId: String,
  oldUserId: String,
  newUserId: String,
  reassignedBy: String,
  reassignedAt: String
}, { minimize: false });

const messageSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  senderId: String,
  receiverId: String,
  content: String,
  read: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
}, { minimize: false });

const recycleBinSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  name: String,
  size: Number,
  type: String, // 'application', 'edition', 'file'
  dataUrl: String, // for files
  appId: String, // for files
  fieldId: String, // for files
  appData: mongoose.Schema.Types.Mixed, // for application
  answersData: [mongoose.Schema.Types.Mixed], // for application
  editionData: mongoose.Schema.Types.Mixed, // for edition
  reformAreasData: [mongoose.Schema.Types.Mixed], // for edition
  fieldsData: [mongoose.Schema.Types.Mixed], // for edition
  appsData: [mongoose.Schema.Types.Mixed], // for edition
  deletedAt: String,
  deletedBy: String
}, { minimize: false });

// Export Models
export const User = mongoose.model('User', userSchema);
export const Edition = mongoose.model('Edition', editionSchema);
export const ReformArea = mongoose.model('ReformArea', reformAreaSchema);
export const FormField = mongoose.model('FormField', formFieldSchema);
export const Application = mongoose.model('Application', applicationSchema);
export const ApplicationAnswer = mongoose.model('ApplicationAnswer', applicationAnswerSchema);
export const Notification = mongoose.model('Notification', notificationSchema);
export const Assignment = mongoose.model('Assignment', assignmentSchema);
export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export const SchemaVersion = mongoose.model('SchemaVersion', schemaVersionSchema);
export const Settings = mongoose.model('Settings', settingsSchema);
export const Guideline = mongoose.model('Guideline', guidelineSchema);
export const DocumentRule = mongoose.model('DocumentRule', documentRuleSchema);
export const Department = mongoose.model('Department', departmentSchema);
export const ReassignmentHistory = mongoose.model('ReassignmentHistory', reassignmentHistorySchema);
export const Message = mongoose.model('Message', messageSchema);
export const RecycleBin = mongoose.model('RecycleBin', recycleBinSchema);


