/* ==========================================================================
   store.js — Unified Data Access Layer v2.1
   Dynamic SRF Management Platform — Full CRUD + Question/Doc Review
   ========================================================================== */

import {
  DB_KEY,
  MIGRATION_KEY,
  DB_VERSION,
  createEmptyDb,
  buildDefaultUsers,
  DEFAULT_SRF_6_EDITION,
  NOTIFICATION_EVENTS,
  QUESTION_STATUS,
  DOC_STATUS,
} from "./schema.js";
import { SRF_6_SEED } from "./srf6Seed.js";

let _db = null;
let _saveTimer = null;
let _isSaving = false;
const _saveQueue = [];

// ═══════════════════════════════════════════════════════════════
// BOOTSTRAP & MIGRATION
// ═══════════════════════════════════════════════════════════════
export async function initStore() {
  try {
    const headers = {};
    try {
      const sessionRaw = sessionStorage.getItem("srf_session_v2");
      if (sessionRaw) {
        const sess = JSON.parse(sessionRaw);
        if (sess && sess.id && sess.role) {
          headers["X-User-Id"] = sess.id;
          headers["X-User-Role"] = sess.role;
        }
      }
    } catch (e) {}

    const res = await fetch("/api/db", { headers });
    if (res.ok) {
      _db = await res.json();
      console.log("[Store] Database loaded from MongoDB backend API.");
    } else {
      console.warn(
        "[Store] Failed to load database from API, trying localStorage fallback.",
      );
      _loadFromLocalStorage();
    }
  } catch (error) {
    console.warn(
      "[Store] Network error loading database from API, trying localStorage fallback:",
      error,
    );
    _loadFromLocalStorage();
  }

  // Clean duplication
  if (_db) {
    _db.departments = _db.departments || [];
    let changed = false;
    if (_db.editions) {
      const origCount = _db.editions.length;
      _db.editions = _db.editions.filter(
        (e, idx, self) => self.findIndex((x) => x.id === e.id) === idx,
      );
      if (_db.editions.length !== origCount) changed = true;
    }
    if (_db.reformAreas) {
      const origCount = _db.reformAreas.length;
      _db.reformAreas = _db.reformAreas.filter(
        (r, idx, self) =>
          self.findIndex(
            (x) => x.editionId === r.editionId && x.name === r.name,
          ) === idx,
      );
      if (_db.reformAreas.length !== origCount) changed = true;
    }
    if (_db.formFields) {
      const origCount = _db.formFields.length;
      _db.formFields = _db.formFields.filter((f, idx, self) => {
        if (f.num) {
          return (
            self.findIndex(
              (x) => x.editionId === f.editionId && x.num === f.num,
            ) === idx
          );
        }
        return self.findIndex((x) => x.id === f.id) === idx;
      });
      if (_db.formFields.length !== origCount) changed = true;
    }
    if (_db.users) {
      const origCount = _db.users.length;
      _db.users = _db.users.filter(
        (u, idx, self) =>
          self.findIndex((x) => x.id === u.id || x.username === u.username) ===
          idx,
      );
      if (_db.users.length !== origCount) changed = true;

      _db.users.forEach((user) => {
        if (user.username && /\s/.test(user.username)) {
          const oldUsername = user.username;
          user.username = oldUsername.replace(/\s+/g, "");
          changed = true;

          // Also clean up local assignments referencing the old username
          if (_db.formFields) {
            _db.formFields.forEach((field) => {
              if (field.assignment) {
                if (field.assignment.userIds) {
                  field.assignment.userIds = field.assignment.userIds.map(
                    (uid) => (uid === oldUsername ? user.username : uid),
                  );
                }
                if (field.assignment.users) {
                  field.assignment.users = field.assignment.users.map((uid) =>
                    uid === oldUsername ? user.username : uid,
                  );
                }
              }
            });
          }
        }
      });
    }
    if (_db.assignments) {
      const origCount = _db.assignments.length;
      const editionIds = new Set((_db.editions || []).map((e) => e.id));
      const sectionIds = new Set((_db.reformAreas || []).map((r) => r.id));
      const fieldIds = new Set((_db.formFields || []).map((f) => f.id));
      const apIds = new Set(
        (_db.formFields || [])
          .filter((f) => f.actionPointId)
          .map((f) => f.actionPointId),
      );

      _db.assignments = _db.assignments.filter((a) => {
        if (!editionIds.has(a.editionId)) return false;

        if (!a.type || a.type === "Reform Area") {
          return sectionIds.has(a.sectionId) || sectionIds.has(a.reformAreaId);
        }
        if (a.type === "Question") {
          return fieldIds.has(a.questionId) || fieldIds.has(a.fieldId);
        }
        if (a.type === "Action Point") {
          return apIds.has(a.actionPointId);
        }
        return true;
      });

      // Deduplicate existing assignments
      const uniqueAssignments = [];
      _db.assignments.forEach((a) => {
        const isDup = uniqueAssignments.some(
          (x) =>
            x.userId === a.userId &&
            x.editionId === a.editionId &&
            x.type === a.type &&
            (a.type === "Reform Area"
              ? x.sectionId === a.sectionId || x.reformAreaId === a.reformAreaId
              : true) &&
            (a.type === "Action Point"
              ? x.actionPointId === a.actionPointId
              : true) &&
            (a.type === "Question"
              ? x.questionId === a.questionId || x.fieldId === a.fieldId
              : true),
        );
        if (!isDup) {
          uniqueAssignments.push(a);
        }
      });
      _db.assignments = uniqueAssignments;

      if (_db.assignments.length !== origCount) changed = true;
    }
    // Deduplicate existing applications (keep only one application per State/Organization per edition)
    if (_db.applications && _db.applications.length > 0) {
      const groups = {};
      _db.applications.forEach((app) => {
        const user = (_db.users || []).find((u) => u.id === app.userId);
        const state = user?.state || "";
        const org = user?.organization || "";

        // Fill state and organization properties if not present
        if (!app.state) app.state = state;
        if (!app.organization) app.organization = org;

        const isUserRole = user?.role === "user";
        const key = isUserRole
          ? state
            ? `${app.editionId}_state_${state}`
            : `${app.editionId}_org_${org}`
          : `${app.editionId}_user_${app.userId}`;

        if (!groups[key]) groups[key] = [];
        groups[key].push(app);
      });

      const keptApps = [];
      const deletedAppIds = [];
      let appChanged = false;

      Object.keys(groups).forEach((key) => {
        const apps = groups[key];

        // Always keep all Approved and Rejected applications as historical records
        const approvedOrRejected = apps.filter(
          (a) => a.status === "Approved" || a.status === "Rejected",
        );
        approvedOrRejected.forEach((a) => keptApps.push(a));

        // For active/in-progress applications, keep only the highest priority one
        const activeApps = apps.filter(
          (a) => a.status !== "Approved" && a.status !== "Rejected",
        );
        if (activeApps.length === 1) {
          keptApps.push(activeApps[0]);
        } else if (activeApps.length > 1) {
          const statusPriority = {
            "Under Review": 5,
            "Additional Documents Requested": 4,
            Submitted: 3,
            Resubmitted: 2,
            Draft: 1,
          };

          activeApps.sort((a, b) => {
            const pa = statusPriority[a.status] || 0;
            const pb = statusPriority[b.status] || 0;
            if (pa !== pb) return pb - pa;
            return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
          });

          keptApps.push(activeApps[0]);
          activeApps.slice(1).forEach((deletedApp) => {
            deletedAppIds.push(deletedApp.id);
          });
          appChanged = true;
        }
      });

      if (appChanged) {
        console.log(
          `[Store] Deduplicated applications. Removed ${deletedAppIds.length} duplicate applications.`,
        );
        _db.applications = keptApps;
        if (_db.applicationAnswers) {
          _db.applicationAnswers = _db.applicationAnswers.filter(
            (ans) => !deletedAppIds.includes(ans.applicationId),
          );
        }
        changed = true;
      }
    }
    if (_db.applicationAnswers) {
      const origCount = _db.applicationAnswers.length;
      const uniqueAnswers = [];
      _db.applicationAnswers.forEach((ans) => {
        const firstIdx = uniqueAnswers.findIndex(
          (x) =>
            x.applicationId === ans.applicationId && x.fieldId === ans.fieldId,
        );
        if (firstIdx === -1) {
          uniqueAnswers.push(ans);
        } else {
          const existing = uniqueAnswers[firstIdx];
          const statusPriority = {
            Approved: 4,
            Rejected: 3,
            Submitted: 2,
            Draft: 1,
          };
          const pExisting = statusPriority[existing.questionStatus] || 0;
          const pCurrent = statusPriority[ans.questionStatus] || 0;
          if (
            pCurrent > pExisting ||
            (pCurrent === pExisting &&
              new Date(ans.updatedAt || 0) > new Date(existing.updatedAt || 0))
          ) {
            uniqueAnswers[firstIdx] = ans;
          }
        }
      });
      _db.applicationAnswers = uniqueAnswers;
      if (_db.applicationAnswers.length !== origCount) changed = true;
    }
    if (changed) {
      console.log("[Store] Deduplicated databases inside localStorage.");
      _save();
    }
  }

  // Ensure seed edition exists
  _ensureDefaultEdition();

  // Run database integrity check and repair
  runDatabaseIntegrityCheck();
  repairDataIntegrity();

  // Fix any scores that were incorrectly given to "No"/empty answers
  recalculateExistingApplications();
}

function _loadFromLocalStorage() {
  const raw = localStorage.getItem(DB_KEY);
  if (raw) {
    try {
      _db = JSON.parse(raw);
    } catch {
      _db = null;
    }
  }

  if (!_db || !_db.version || _db.version < DB_VERSION) {
    _db = createEmptyDb();
    _db.users = buildDefaultUsers();
    _db.schemaVersions = [];
    _migrateFromV2();
    _save();
  }
}

function _migrateFromV2() {
  // Try to import from old v2 key
  const v2Raw = localStorage.getItem("srf_platform_v2");
  if (!v2Raw) return;
  try {
    const v2 = JSON.parse(v2Raw);
    // Migrate editions
    if (v2.editions?.length) _db.editions = v2.editions.map((e) => ({ ...e }));
    // Migrate reform areas (v2 called them sections/reformAreas)
    if (v2.reformAreas?.length)
      _db.reformAreas = v2.reformAreas.map((r) => ({ ...r }));
    else if (v2.sections?.length)
      _db.reformAreas = v2.sections.map((s) => ({ ...s, id: s.id }));
    // Migrate form fields
    if (v2.formFields?.length)
      _db.formFields = v2.formFields.map((f) => ({ ...f }));
    // Migrate applications
    if (v2.applications?.length)
      _db.applications = v2.applications.map((a) => ({ ...a }));
    // Migrate answers with new fields
    if (v2.applicationAnswers?.length) {
      _db.applicationAnswers = v2.applicationAnswers.map((a) => ({
        ...a,
        questionStatus:
          a.questionStatus ||
          (a.status === "Submitted"
            ? QUESTION_STATUS.SUBMITTED
            : QUESTION_STATUS.DRAFT),
        questionScore: a.questionScore || 0,
        adminRemarks: a.adminRemarks || "",
        files: (a.files || []).map((f) => ({
          ...f,
          fileStatus: f.fileStatus || DOC_STATUS.PENDING,
          fileRejectionReason: f.fileRejectionReason || "",
        })),
      }));
    }
    // Migrate users
    if (v2.users?.length) _db.users = v2.users.map((u) => ({ ...u }));
    // Migrate audit logs
    if (v2.auditLogs?.length) _db.auditLogs = v2.auditLogs.slice(0, 1000);
    // Migrate notifications
    if (v2.notifications?.length) _db.notifications = v2.notifications;
    console.log("[SRF v3] Migrated from v2.");
  } catch (e) {
    console.warn("[SRF v3] Migration error:", e);
  }
}

function _ensureDefaultEdition() {
  if (!_db.editions.find((e) => e.id === DEFAULT_SRF_6_EDITION.id)) {
    _db.editions.push({ ...DEFAULT_SRF_6_EDITION });
  }

  // Check if we need to seed reform areas and fields for srf 6
  const existingRAs = (_db.reformAreas || []).filter(
    (r) => r.editionId === DEFAULT_SRF_6_EDITION.id,
  );
  const existingFields = (_db.formFields || []).filter(
    (f) => f.editionId === DEFAULT_SRF_6_EDITION.id,
  );
  const firstField = existingFields.find((f) => f.num === "1.1");
  const needsReseed =
    !firstField ||
    firstField.actionPointTitle?.startsWith("Action Point") ||
    existingFields.some(
      (f) =>
        f.num &&
        (f.fieldType !== "radio" ||
          !f.options ||
          f.options.length !== 2 ||
          f.options[0] !== "Yes" ||
          f.options[1] !== "No"),
    ) ||
    existingFields.some(
      (f) =>
        f.num &&
        f.num !== "1.1" &&
        f.docs?.some((d) => d.name === "Upload Supporting Document"),
    );

  if (existingRAs.length < 7 || existingFields.length < 49 || needsReseed) {
    console.log(
      "[Store] Seeding default SRF 6.0 schema with official Action Point titles...",
    );
    _db.reformAreas = (_db.reformAreas || []).filter(
      (r) => r.editionId !== DEFAULT_SRF_6_EDITION.id,
    );
    _db.formFields = (_db.formFields || []).filter(
      (f) => f.editionId !== DEFAULT_SRF_6_EDITION.id,
    );

    const apTitles = {
      1: "1. Support Provided to Startups by State/UT Department(s)",
      2: "2. Priority Sectors",
      3: "3. Special Provisions",
      4: "4. Incubators and Accelerators",
      5: "5. Infrastructure Support in Tier 2/3/4 Cities",
      6: "6. Startup Portal and Grievance Mechanism",
      7: "7. Funding Support",
      8: "8. Financial Assistance Disbursal",
      9: "9. Sensitization of Investors",
      10: "10. Public Procurement Relaxations",
      11: "11. Market Linkages and Mentorship",
      12: "12. Ease of Doing Business & Fast-track Approvals",
      13: "13. Capacity Building of Government Officials",
      14: "14. Sensitization and Mentorship of Startups",
      15: "15. Intellectual Property Rights (IPR) Facilitation",
      16: "16. Clean Tech and Sustainability initiatives",
      17: "17. Social Enterprises Support",
      18: "18. Employment and Career Opportunities",
      19: "19. Accolades and Recognition",
    };

    SRF_6_SEED.forEach((raData, raIdx) => {
      const raId = `ra_srf6_${raIdx + 1}`;
      _db.reformAreas.push({
        id: raId,
        editionId: DEFAULT_SRF_6_EDITION.id,
        name: raData.name,
        description: `DPIIT initiatives on ${raData.name}`,
        orderIndex: raIdx,
        color: [
          "#4f46e5",
          "#0284c7",
          "#7e22ce",
          "#10b981",
          "#d97706",
          "#ef4444",
          "#0891b2",
        ][raIdx % 7],
        marks: raData.marks || 10,
      });

      raData.questions.forEach((qData, qIdx) => {
        const fieldId = `field_srf6_${qData.num.replace(".", "_")}`;
        const apNum = qData.num.split(".")[0];
        const apTitle = apTitles[apNum] || `Action Point ${apNum}`;

        const defaultEl = {
          id: `el_srf6_${qData.num.replace(".", "_")}_1`,
          type: qData.type,
          label: qData.label,
          required: true,
          options: qData.options || [],
        };
        if (
          qData.type === "radio" &&
          (!defaultEl.options || defaultEl.options.length === 0)
        ) {
          defaultEl.options = ["Yes", "No"];
        }

        _db.formFields.push({
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
          uploadRequirement: "optional",
          options: qData.options || [],
          helpText: `DPIIT guidelines checklist for AP ${qData.num}`,
          url: "",
          content: "",
          orderIndex: qIdx,
          isLayoutElement: false,
          isUploadElement: false,
          elements: [defaultEl],
          docs: qData.docs || [
            {
              id: `doc_srf6_${qData.num.replace(".", "_")}_1`,
              name: "Upload Supporting Document",
              requirement: "optional",
            },
          ],
          createdAt: new Date().toISOString(),
        });
      });
    });
    _save();
  }

  // Force update Question 1.1 layout and docs to match standard radio layout (like 1.2)
  const field11 = (_db.formFields || []).find(
    (f) => f.num === "1.1" && f.editionId === DEFAULT_SRF_6_EDITION.id,
  );
  if (field11) {
    const hasCorrectDocs =
      field11.docs?.length === 2 &&
      (field11.docs[0].name.startsWith("Government Order") ||
        field11.docs[0].name.startsWith("Date of official")) &&
      field11.docs[1].name.startsWith("G.O.");

    const isCorrectRadio =
      field11.fieldType === "radio" &&
      field11.options?.length === 2 &&
      field11.options[0] === "Yes" &&
      field11.elements?.length === 1 &&
      field11.elements[0].type === "radio" &&
      field11.isLayoutElement === false &&
      field11.isUploadElement === false;

    if (!hasCorrectDocs || !isCorrectRadio) {
      console.log(
        "[Store] Force resetting Question 1.1 properties to match Question 1.2 radio layout...",
      );
      field11.fieldType = "radio";
      field11.label =
        "Question 1.1: Does your State/UT have an active Startup Policy?";
      field11.text =
        "Question 1.1: Does your State/UT have an active Startup Policy?";
      field11.options = ["Yes", "No"];
      field11.helpText = "DPIIT guidelines checklist for AP 1.1";
      field11.url = "";
      field11.content = "";
      field11.isLayoutElement = false;
      field11.isUploadElement = false;
      field11.elements = [
        {
          id: "el_srf6_1_1_1",
          type: "radio",
          label:
            "Question 1.1: Does your State/UT have an active Startup Policy?",
          required: true,
          options: ["Yes", "No"],
        },
      ];
      field11.docs = [
        {
          id: "doc_srf6_1_1_1",
          name: "Date of official implementation of the State/UT Startup Policy, as per the Government Order or Notification. This should indicate when the policy came into effect and began guiding startup- related initiatives in the State/UT.",
          requirement: "optional",
        },
        {
          id: "doc_srf6_1_1_2",
          name: "G.O. / Notification and Policy Document for State / UT Startup Policy",
          requirement: "optional",
        },
      ];
      _save();
    }
  }

  // Fix application status if it was accidentally locked to 'Submitted' by individual question submits
  (_db.applications || []).forEach((app) => {
    if (app.status === "Submitted") {
      const lastTimelineEntry =
        app.timeline && app.timeline[app.timeline.length - 1];
      if (
        lastTimelineEntry &&
        lastTimelineEntry.action.startsWith("Question submitted")
      ) {
        console.log(
          `[Store] Resetting application ${app.id} status to 'Draft' because it was locked by a question submit.`,
        );
        app.status = "Draft";
        _save();
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// SAVE
// ═══════════════════════════════════════════════════════════════
async function _save() {
  if (_isSaving) {
    return new Promise((resolve) => {
      _saveQueue.push(resolve);
    }).then(() => _save());
  }
  _isSaving = true;

  try {
    if (_db) {
      // Write to API (MongoDB)
      try {
        let reqUserId = null;
        let reqUserRole = null;
        let reqToken = null;
        try {
          const sessionRaw = sessionStorage.getItem("srf_session_v2");
          if (sessionRaw) {
            const sess = JSON.parse(sessionRaw);
            reqUserId = sess.id;
            reqUserRole = sess.role;
            reqToken = sess.token;
          }
        } catch (e) {}

        const payload = { ..._db, requestingUserId: reqUserId };

        const headers = { "Content-Type": "application/json" };
        if (reqToken) {
          headers["Authorization"] = "Bearer " + reqToken;
        }
        if (reqUserId) {
          headers["X-User-Id"] = reqUserId;
          headers["X-User-Role"] = reqUserRole;
        }

        const res = await fetch("/api/db", {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.applications) {
            _db.applications = data.applications;
          }
          if (data.applicationAnswers) {
            _db.applicationAnswers = data.applicationAnswers;
          }
        } else {
          console.error("[Store] Failed to save database to MongoDB API.");
        }
      } catch (e) {
        console.error(
          "[Store] Network error saving database to MongoDB API:",
          e,
        );
      }

      // Also write to localStorage as backup/cache
      try {
        const cacheDb = { ..._db };
        if (cacheDb.applicationAnswers) {
          cacheDb.applicationAnswers = cacheDb.applicationAnswers.map(ans => {
            if (ans.files && ans.files.length > 0) {
              return { ...ans, files: ans.files.map(f => ({ ...f, dataUrl: undefined })) };
            }
            return ans;
          });
        }
        if (cacheDb.recycleBin) {
          cacheDb.recycleBin = cacheDb.recycleBin.map(rb => ({ ...rb, dataUrl: undefined }));
        }
        localStorage.setItem(DB_KEY, JSON.stringify(cacheDb));
      } catch (e) {
        console.warn("[SRF] Storage quota exceeded — trimming logs");
        _db.auditLogs = (_db.auditLogs || []).slice(0, 500);
        try {
          const cacheDbFallback = { ..._db };
          if (cacheDbFallback.applicationAnswers) {
            cacheDbFallback.applicationAnswers = cacheDbFallback.applicationAnswers.map(ans => {
              if (ans.files && ans.files.length > 0) {
                return { ...ans, files: ans.files.map(f => ({ ...f, dataUrl: undefined })) };
              }
              return ans;
            });
          }
          if (cacheDbFallback.recycleBin) {
            cacheDbFallback.recycleBin = cacheDbFallback.recycleBin.map(rb => ({ ...rb, dataUrl: undefined }));
          }
          localStorage.setItem(DB_KEY, JSON.stringify(cacheDbFallback));
        } catch (err) {}
      }

      try {
        window.dispatchEvent(new CustomEvent("db-sync-complete"));
      } catch (err) {}
    }
  } finally {
    _isSaving = false;
    if (_saveQueue.length > 0) {
      const next = _saveQueue.shift();
      next();
    }
  }
}
export function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(_save, 1500);
}
export async function forceSave() {
  await _save();
}
export function getDb() {
  return _db;
}
export function getSettings() {
  return _db.settings || {};
}
export function updateSettings(u) {
  Object.assign(_db.settings, u);
  _save();
}

// ═══════════════════════════════════════════════════════════════
// EDITIONS
// ═══════════════════════════════════════════════════════════════
export function getEditions(includeDeleted = false) {
  const all = _db.editions || [];
  const active = includeDeleted ? all : all.filter((e) => !e.isDeleted);

  try {
    const sessionRaw = sessionStorage.getItem("srf_session_v2");
    if (sessionRaw) {
      const user = JSON.parse(sessionRaw);
      if (
        user &&
        (user.role === "superadmin" ||
          user.role === "admin" ||
          user.role === "reviewer")
      ) {
        return active;
      }
    }
  } catch (e) {}

  return active.filter((e) => e.status === "published");
}
export function getEditionById(id) {
  return (_db.editions || []).find((e) => e.id === id);
}

export function createEdition(data) {
  const ed = {
    id: "edition_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
    name: data.name || "New Edition",
    version: data.version || data.name,
    description: data.description || "",
    startDate: data.startDate || "",
    endDate: data.endDate || "",
    status: "draft",
    createdBy: data.createdBy || "admin",
    createdAt: new Date().toISOString(),
    clonedFrom: data.clonedFrom || null,
    categories: data.categories || [
      {
        id: "cat_a1",
        name: "Category A1 (Population > 5 Cr)",
        shortName: "A1",
      },
      {
        id: "cat_a2",
        name: "Category A2 (Population 1-5 Cr)",
        shortName: "A2",
      },
      { id: "cat_b", name: "Category B (Population < 1 Cr)", shortName: "B" },
    ],
    totalMarks: data.totalMarks || 100,
  };
  _db.editions.push(ed);

  let currentUserId = ed.createdBy;
  try {
    const sessionRaw = sessionStorage.getItem("srf_session_v2");
    if (sessionRaw) {
      const u = JSON.parse(sessionRaw);
      if (u && u.id) currentUserId = u.id;
    }
  } catch (e) {}
  addAuditLog(currentUserId, `Created edition: ${ed.name}`, "edition", ed.id);

  _save();
  return ed;
}

export function updateEdition(id, data) {
  const idx = _db.editions.findIndex((e) => e.id === id);
  if (idx !== -1) {
    const oldStatus = _db.editions[idx].status;
    Object.assign(_db.editions[idx], data, { id });
    const newStatus = _db.editions[idx].status;

    if (oldStatus !== newStatus) {
      let currentUserId = "admin";
      try {
        const sessionRaw = sessionStorage.getItem("srf_session_v2");
        if (sessionRaw) {
          const u = JSON.parse(sessionRaw);
          if (u && u.id) currentUserId = u.id;
        }
      } catch (e) {}
      if (newStatus === "published") {
        addAuditLog(
          currentUserId,
          `Published edition: ${_db.editions[idx].name}`,
          "edition",
          id,
        );
        addAuditLog(
          "system",
          `Published Edition Setup Complete: Edition is now available for task assignment.`,
          "edition",
          id,
        );
      } else {
        addAuditLog(
          currentUserId,
          `Unpublished edition: ${_db.editions[idx].name}`,
          "edition",
          id,
        );
      }
    }

    _save();
  }
  return _db.editions[idx];
}

export function deleteEdition(id) {
  const edition = _db.editions.find((e) => e.id === id);
  if (edition) {
    edition.isDeleted = true;
    edition.deletedAt = new Date().toISOString();

    let currentUserId = "admin";
    try {
      const sessionRaw = sessionStorage.getItem("srf_session_v2");
      if (sessionRaw) {
        const u = JSON.parse(sessionRaw);
        if (u && u.id) {
          currentUserId = u.id;
          edition.deletedBy = u.username || u.name;
        }
      }
    } catch (e) {}

    if (!_db.recycleBin) _db.recycleBin = [];

    const reformAreas = (_db.reformAreas || []).filter(
      (r) => r.editionId === id,
    );
    const formFields = (_db.formFields || []).filter((f) => f.editionId === id);
    const apps = (_db.applications || []).filter((a) => a.editionId === id);

    _db.recycleBin.push({
      id: "rb_ed_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
      type: "edition",
      editionId: id,
      name: `Edition Framework: ${edition.name} (${edition.version})`,
      editionData: edition,
      reformAreasData: reformAreas,
      fieldsData: formFields,
      appsData: apps,
      deletedAt: new Date().toISOString(),
      deletedBy: edition.deletedBy || "admin",
    });

    // Cascade delete assignments
    _db.assignments = (_db.assignments || []).filter((a) => a.editionId !== id);

    // Cascade delete applications and their answers
    _db.applications = (_db.applications || []).filter(
      (a) => a.editionId !== id,
    );
    const appIdsToDelete = apps.map((a) => a.id);
    _db.applicationAnswers = (_db.applicationAnswers || []).filter(
      (a) => !appIdsToDelete.includes(a.applicationId),
    );

    // Cascade delete all other framework elements
    _db.reformAreas = (_db.reformAreas || []).filter((r) => r.editionId !== id);
    _db.formFields = (_db.formFields || []).filter((f) => f.editionId !== id);
    _db.guidelines = (_db.guidelines || []).filter((g) => g.editionId !== id);
    _db.documentRules = (_db.documentRules || []).filter(
      (r) => r.editionId !== id,
    );
    _db.schemaVersions = (_db.schemaVersions || []).filter(
      (v) => v.editionId !== id,
    );
    _db.reassignmentHistory = (_db.reassignmentHistory || []).filter(
      (h) => h.editionId !== id,
    );

    addAuditLog(
      currentUserId,
      `Deleted edition: ${edition.name}`,
      "edition",
      id,
    );
    _save();
  }
}

export function restoreEdition(id) {
  const edition = _db.editions.find((e) => e.id === id);
  if (edition) {
    edition.isDeleted = false;
    delete edition.deletedAt;
    delete edition.deletedBy;
    _save();
  }
}

// ═══════════════════════════════════════════════════════════════
// REFORM AREAS  (replaces "Sections" everywhere)
// ═══════════════════════════════════════════════════════════════
export function getReformAreas(editionId) {
  return (_db.reformAreas || [])
    .filter((r) => r.editionId === editionId)
    .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
}
export function getReformAreaById(id) {
  return (_db.reformAreas || []).find((r) => r.id === id);
}

export function createReformArea(editionId, data) {
  const existing = getReformAreas(editionId);
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const letter = letters[existing.length] || String(existing.length + 1);
  const ra = {
    id: "ra_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
    editionId,
    name: data.name || `Reform Area ${letter}`,
    description: data.description || "",
    orderIndex: data.orderIndex ?? existing.length,
    color:
      data.color ||
      [
        "#4f46e5",
        "#0284c7",
        "#7e22ce",
        "#10b981",
        "#d97706",
        "#ef4444",
        "#0891b2",
        "#db2777",
      ][existing.length % 8],
    marks: data.marks || 10,
  };
  _db.reformAreas.push(ra);
  _save();
  return ra;
}

export function updateReformArea(id, data) {
  const idx = _db.reformAreas.findIndex((r) => r.id === id);
  if (idx !== -1) {
    Object.assign(_db.reformAreas[idx], data, { id });
    _save();
  }
  return _db.reformAreas[idx];
}

export function deleteReformArea(id) {
  const ra = (_db.reformAreas || []).find((r) => r.id === id);
  if (ra) {
    if (!_db.recycleBin) _db.recycleBin = [];
    let deletedBy = "admin";
    try {
      const sessUserRaw = sessionStorage.getItem("srf_session_v2");
      if (sessUserRaw) {
        const u = JSON.parse(sessUserRaw);
        if (u && u.username) deletedBy = u.username;
      }
    } catch (e) {}

    const fields = (_db.formFields || []).filter((f) => f.reformAreaId === id);
    const fieldIds = fields.map((f) => f.id);
    const answers = (_db.applicationAnswers || []).filter((a) =>
      fieldIds.includes(a.fieldId),
    );
    const assignments = (_db.assignments || []).filter(
      (a) =>
        a.sectionId === id ||
        a.reformAreaId === id ||
        (a.type === "Question" && fieldIds.includes(a.questionId || a.fieldId)),
    );

    _db.recycleBin.push({
      id: "rb_ra_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
      type: "reformArea",
      reformAreaId: id,
      name: `Reform Area: ${ra.name}`,
      reformAreaData: ra,
      fieldsData: fields,
      answersData: answers,
      assignmentsData: assignments,
      deletedAt: new Date().toISOString(),
      deletedBy: deletedBy,
    });

    _db.reformAreas = _db.reformAreas.filter((r) => r.id !== id);
    _db.formFields = _db.formFields.filter((f) => f.reformAreaId !== id);
    _db.applicationAnswers = (_db.applicationAnswers || []).filter(
      (a) => !fieldIds.includes(a.fieldId),
    );
    _db.assignments = (_db.assignments || []).filter(
      (a) =>
        a.sectionId !== id &&
        a.reformAreaId !== id &&
        !(
          a.type === "Question" && fieldIds.includes(a.questionId || a.fieldId)
        ),
    );
    _save();
  }
}

export function reorderReformAreas(editionId, orderedIds) {
  orderedIds.forEach((id, idx) => {
    const ra = _db.reformAreas.find((r) => r.id === id);
    if (ra) ra.orderIndex = idx;
  });
  _save();
}

// ═══════════════════════════════════════════════════════════════
// FORM FIELDS  (questions / elements inside reform areas)
// ═══════════════════════════════════════════════════════════════
export function getFieldsByReformArea(reformAreaId) {
  return (_db.formFields || [])
    .filter((f) => f.reformAreaId === reformAreaId)
    .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
}
export function getFieldsByEdition(editionId) {
  return (_db.formFields || []).filter((f) => f.editionId === editionId);
}
export function getFieldById(id) {
  return (_db.formFields || []).find((f) => f.id === id);
}

export function createField(editionId, reformAreaId, data) {
  const existing = getFieldsByReformArea(reformAreaId);
  const field = {
    id: "field_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
    editionId,
    reformAreaId,
    fieldType: data.fieldType || "text",
    label: data.label || data.text || "New Question",
    text: data.text || data.label || "New Question",
    placeholder: data.placeholder || "",
    required: data.required !== false,
    mandatory: data.mandatory !== false,
    weight: data.weight || 1,
    maxScore: data.maxScore || 1,
    uploadRequirement: data.uploadRequirement || "optional",
    options: data.options || [],
    helpText: data.helpText || "",
    url: data.url || "", // for hyperlinks
    content: data.content || "", // for descriptions/instructions/banners
    orderIndex: data.orderIndex ?? existing.length,
    isLayoutElement: [
      "heading",
      "subheading",
      "description",
      "instruction",
      "divider",
      "card",
      "banner",
      "notes",
      "warning",
      "image",
      "hyperlink",
    ].includes(data.fieldType),
    isUploadElement: ["file", "pdf", "imageupload"].includes(data.fieldType),
    createdAt: new Date().toISOString(),
  };
  _db.formFields.push(field);
  _save();
  return field;
}

export function updateField(id, data) {
  const idx = _db.formFields.findIndex((f) => f.id === id);
  if (idx !== -1) {
    Object.assign(_db.formFields[idx], data, { id });
    _save();
  }
  return _db.formFields[idx];
}

export function deleteField(id) {
  const field = (_db.formFields || []).find((f) => f.id === id);
  if (field) {
    if (!_db.recycleBin) _db.recycleBin = [];
    let deletedBy = "admin";
    try {
      const sessUserRaw = sessionStorage.getItem("srf_session_v2");
      if (sessUserRaw) {
        const u = JSON.parse(sessUserRaw);
        if (u && u.username) deletedBy = u.username;
      }
    } catch (e) {}

    const answers = (_db.applicationAnswers || []).filter(
      (a) => a.fieldId === id,
    );
    const assignments = (_db.assignments || []).filter(
      (a) => a.type === "Question" && (a.questionId === id || a.fieldId === id),
    );

    _db.recycleBin.push({
      id:
        "rb_field_" +
        Date.now() +
        "_" +
        Math.random().toString(36).substr(2, 4),
      type: "field",
      fieldId: id,
      name: `Action Point / Question: ${field.label || field.text}`,
      fieldData: field,
      answersData: answers,
      assignmentsData: assignments,
      deletedAt: new Date().toISOString(),
      deletedBy: deletedBy,
    });

    _db.formFields = _db.formFields.filter((f) => f.id !== id);
    _db.applicationAnswers = (_db.applicationAnswers || []).filter(
      (a) => a.fieldId !== id,
    );
    _db.assignments = (_db.assignments || []).filter(
      (a) =>
        !(a.type === "Question" && (a.questionId === id || a.fieldId === id)),
    );
    _save();
  }
}

export function reorderFields(reformAreaId, orderedIds) {
  orderedIds.forEach((id, idx) => {
    const f = _db.formFields.find((f) => f.id === id);
    if (f) f.orderIndex = idx;
  });
  _save();
}

// ═══════════════════════════════════════════════════════════════
// SCHEMA VERSIONING
// ═══════════════════════════════════════════════════════════════
export function saveSchemaVersion(editionId, userId, note = "") {
  const snapshot = {
    reformAreas: getReformAreas(editionId),
    formFields: getFieldsByEdition(editionId),
  };
  const versions = (_db.schemaVersions || []).filter(
    (v) => v.editionId === editionId,
  );
  const version = versions.length + 1;
  const sv = {
    id: "sv_" + Date.now(),
    editionId,
    version,
    versionLabel: `Version ${version}`,
    snapshot: JSON.stringify(snapshot),
    createdAt: new Date().toISOString(),
    createdBy: userId,
    note: note || `Auto-saved v${version}`,
  };
  if (!_db.schemaVersions) _db.schemaVersions = [];
  _db.schemaVersions.push(sv);
  // Keep last 20 versions per edition
  const all = _db.schemaVersions.filter((v) => v.editionId === editionId);
  if (all.length > 20) {
    const toRemove = all.slice(0, all.length - 20).map((v) => v.id);
    _db.schemaVersions = _db.schemaVersions.filter(
      (v) => !toRemove.includes(v.id),
    );
  }
  _save();
  return sv;
}

export function getSchemaVersions(editionId) {
  return (_db.schemaVersions || [])
    .filter((v) => v.editionId === editionId)
    .sort((a, b) => b.version - a.version);
}

export function restoreSchemaVersion(versionId, userId) {
  const sv = (_db.schemaVersions || []).find((v) => v.id === versionId);
  if (!sv) return false;
  const snapshot = JSON.parse(sv.snapshot);
  // Remove current reform areas and fields for this edition
  _db.reformAreas = _db.reformAreas.filter((r) => r.editionId !== sv.editionId);
  _db.formFields = _db.formFields.filter((f) => f.editionId !== sv.editionId);
  // Restore
  _db.reformAreas.push(...snapshot.reformAreas);
  _db.formFields.push(...snapshot.formFields);
  addAuditLog(
    userId,
    `Restored schema to ${sv.versionLabel}`,
    "schema",
    sv.editionId,
  );
  _save();
  return true;
}

export function exportSchema(editionId) {
  const edition = getEditionById(editionId);
  return {
    edition,
    reformAreas: getReformAreas(editionId),
    formFields: getFieldsByEdition(editionId),
    exportedAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
// APPLICATIONS
// ═══════════════════════════════════════════════════════════════
export function getApplications(filters = {}) {
  const activeEditionIds = getEditions(false).map((e) => e.id);
  let apps = (_db.applications || []).filter((a) =>
    activeEditionIds.includes(a.editionId),
  );

  try {
    const sessionRaw = sessionStorage.getItem("srf_session_v2");
    if (sessionRaw) {
      const user = JSON.parse(sessionRaw);
      if (user && user.role === "user") {
        apps = apps.filter((a) => a.userId === user.id);
      } else if (
        user &&
        (user.role === "admin" ||
          user.role === "reviewer" ||
          user.role === "superadmin")
      ) {
        apps = apps.filter((a) => a.status !== "Draft");
      }
    } else {
      apps = apps.filter((a) => a.status !== "Draft");
    }
  } catch (e) {
    apps = apps.filter((a) => a.status !== "Draft");
  }

  if (filters.editionId)
    apps = apps.filter((a) => a.editionId === filters.editionId);
  if (filters.userId) apps = apps.filter((a) => a.userId === filters.userId);
  if (filters.status) apps = apps.filter((a) => a.status === filters.status);
  if (filters.category)
    apps = apps.filter((a) => a.category === filters.category);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    apps = apps.filter((a) => {
      const user = getUserById(a.userId);
      return (
        a.id.toLowerCase().startsWith(q) ||
        user?.name?.toLowerCase().startsWith(q) ||
        user?.organization?.toLowerCase().startsWith(q)
      );
    });
  }
  if (filters.sortBy) {
    apps = [...apps].sort((a, b) => {
      const av = a[filters.sortBy] || "",
        bv = b[filters.sortBy] || "";
      return filters.sortDir === "asc" ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
    });
  } else {
    apps = [...apps].sort(
      (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0),
    );
  }
  const total = apps.length;
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 25;
  return {
    items: apps.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export function getApplicationById(id) {
  return (_db.applications || []).find((a) => a.id === id);
}
export function getApplicationsByUser(userId) {
  const user = getUserById(userId);
  if (!user) return [];
  const activeEditionIds = getEditions(false)
    .filter((e) => e.status === "published")
    .map((e) => e.id);
  return (_db.applications || []).filter(
    (a) => a.userId === userId && activeEditionIds.includes(a.editionId),
  );
}

export function getApplicationsByEdition(editionId) {
  return (_db.applications || []).filter((a) => a.editionId === editionId);
}

export function createApplication(userId, editionId, category, duration) {
  const user = getUserById(userId);
  const existing = _db.applications.find(
    (a) =>
      a.userId === userId &&
      a.editionId === editionId &&
      a.status !== "Rejected",
  );

  if (existing) return existing;

  const app = {
    id:
      "APP_" +
      Date.now() +
      "_" +
      Math.random().toString(36).substr(2, 5).toUpperCase(),
    editionId,
    userId,
    state: user?.state || "",
    organization: user?.organization || "",
    category: category || "",
    duration: duration || "",
    status: "Draft",
    score: 0,
    submittedAt: null,
    updatedAt: new Date().toISOString(),
    rejectionReason: "",
    additionalDocsNote: "",
    reviewerComments: "",
    timeline: [
      {
        action: "Application created",
        timestamp: new Date().toISOString(),
        by: userId,
      },
    ],
    comments: [],
    reformAreaStatuses: {}, // { [reformAreaId]: 'Draft'|'Submitted'|'Approved' }
    statusHistory: [
      { status: "Draft", timestamp: new Date().toISOString(), by: userId },
    ],
    submissions: [],
  };
  _db.applications.push(app);
  _save();
  return app;
}

export function updateApplication(id, data) {
  const idx = _db.applications.findIndex((a) => a.id === id);
  if (idx !== -1) {
    const oldStatus = _db.applications[idx].status;
    const newStatus = data.status;

    if (newStatus && newStatus !== oldStatus) {
      // Validate transition
      const allowedTransitions = {
        Draft: ["Submitted", "Resubmitted"],
        Submitted: [
          "Under Review",
          "Approved",
          "Rejected",
          "Additional Documents Requested",
        ],
        Resubmitted: [
          "Under Review",
          "Approved",
          "Rejected",
          "Additional Documents Requested",
        ],
        "Under Review": [
          "Approved",
          "Rejected",
          "Additional Documents Requested",
        ],
        Rejected: ["Draft"],
        Approved: ["Draft"],
        "Additional Documents Requested": ["Draft", "Submitted", "Resubmitted"],
      };

      let currentUserId = "system";
      let currentUserRole = "system";
      try {
        const sessionRaw = sessionStorage.getItem("srf_session_v2");
        if (sessionRaw) {
          const u = JSON.parse(sessionRaw);
          currentUserId = u.id;
          currentUserRole = u.role;
        }
      } catch (e) {}

      if (currentUserRole !== "superadmin") {
        const allowed = allowedTransitions[oldStatus] || [];
        if (!allowed.includes(newStatus)) {
          console.warn(
            `[Status Flow Block] Blocked invalid status change from ${oldStatus} to ${newStatus} for app ${id}`,
          );
          delete data.status;
        }
      }

      if (data.status) {
        if (!_db.applications[idx].statusHistory) {
          _db.applications[idx].statusHistory = [];
        }
        _db.applications[idx].statusHistory.push({
          status: newStatus,
          timestamp: new Date().toISOString(),
          by: currentUserId,
        });
      }
    }

    Object.assign(_db.applications[idx], data, { id });
    _db.applications[idx].updatedAt = new Date().toISOString();
    _save();
  }
  return _db.applications[idx];
}

export function deleteApplication(id) {
  const app = _db.applications.find((a) => a.id === id);
  if (app) {
    if (!_db.recycleBin) _db.recycleBin = [];

    const answers = (_db.applicationAnswers || []).filter(
      (a) => a.applicationId === id,
    );

    let deletedBy = "admin";
    try {
      const sessUserRaw = sessionStorage.getItem("srf_current_user");
      if (sessUserRaw) {
        const u = JSON.parse(sessUserRaw);
        if (u && u.username) deletedBy = u.username;
      }
    } catch (e) {}

    _db.recycleBin.push({
      id:
        "rb_app_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
      type: "application",
      appId: id,
      name: `Application for ${app.state || app.organization || "User"} (${app.editionId})`,
      appData: app,
      answersData: answers,
      deletedAt: new Date().toISOString(),
      deletedBy: deletedBy,
    });
  }

  _db.applications = _db.applications.filter((a) => a.id !== id);
  _db.applicationAnswers = _db.applicationAnswers.filter(
    (a) => a.applicationId !== id,
  );
  _save();
}

export function addTimelineEntry(appId, action, by, remarks = "") {
  const app = getApplicationById(appId);
  if (!app) return;
  if (!app.timeline) app.timeline = [];

  let displayName = by;
  const user = getUserById(by) || getUserByUsername(by);
  if (user) {
    displayName = user.name || user.username;
  }

  app.timeline.push({
    action,
    by: displayName,
    timestamp: new Date().toISOString(),
    remarks: remarks || "",
  });

  const idx = _db.applications.findIndex((a) => a.id === appId);
  if (idx !== -1) _db.applications[idx].timeline = app.timeline;
  _save();
}

// ─── Completion Validation ───────────────────────────────────────
// Returns TRUE if the user has given ANY response (including "No").
// Used for: progress tracking, draft save, submission required-field checks.
export function isQuestionFilled(ans, field) {
  if (!ans) return false;
  const isUploadType =
    field &&
    (["file", "pdf", "imageupload"].includes(field.fieldType) ||
      field.isUploadElement);
  if (isUploadType) {
    return Array.isArray(ans.files) && ans.files.length > 0;
  }
  if (!ans.value && ans.value !== 0) return false;
  const valStr = String(ans.value).trim().toLowerCase();
  // Only these specific placeholders are considered NOT answered
  if (
    valStr === "" ||
    valStr === "not answered" ||
    valStr === "not answered yet"
  )
    return false;
  return true; // "No", "0", any text → counts as answered
}

// ─── Scoring Validation ──────────────────────────────────────────
// Returns TRUE only if an answer is valid enough to award marks.
// Used for: score calculation, approveQuestion guard.
export function isScorableAnswer(ans, field) {
  if (!ans) return false;
  const isUploadType =
    field &&
    (["file", "pdf", "imageupload"].includes(field.fieldType) ||
      field.isUploadElement);
  if (isUploadType) {
    return Array.isArray(ans.files) && ans.files.length > 0;
  }
  if (!ans.value && ans.value !== 0) return false;
  const valStr = String(ans.value).trim().toLowerCase();
  if (
    valStr === "" ||
    valStr === "no" ||
    valStr === "not answered" ||
    valStr === "not answered yet" ||
    valStr === "not applicable" ||
    valStr === "n/a"
  ) {
    return false;
  }
  return true;
}

// ─── Legacy alias (kept for backward compat with external callers) ─
export function isAnswerValueValid(value, field) {
  if (value === null || value === undefined) return false;
  const valStr = String(value).trim().toLowerCase();
  if (
    valStr === "" ||
    valStr === "no" ||
    valStr === "not answered" ||
    valStr === "not answered yet" ||
    valStr === "not applicable" ||
    valStr === "n/a"
  ) {
    return false;
  }
  return true;
}

export function isAnswerNormalizerValid(ans, field) {
  // Delegates to isScorableAnswer — keeps backward compat
  return isScorableAnswer(ans, field);
}

// Helper to check if an answer is "No"
function isAnswerNo(ans, field) {
  if (!ans || !ans.value) return false;
  if (typeof ans.value === "string") {
    if (ans.value.trim().toLowerCase() === "no") return true;
    if (ans.value.startsWith("{")) {
      try {
        const parsed = JSON.parse(ans.value);
        let elementsList = [];
        if (field.customCanvas) {
          elementsList =
            typeof field.customCanvas === "string"
              ? JSON.parse(field.customCanvas)
              : field.customCanvas;
        } else if (field.elements && field.elements.length > 0) {
          elementsList =
            typeof field.elements === "string"
              ? JSON.parse(field.elements)
              : field.elements;
        }
        let hasNo = false;
        elementsList.forEach((el) => {
          if (el.options && el.options.length > 0 && parsed[el.id] === "No") {
            hasNo = true;
          }
        });
        return hasNo;
      } catch (e) {}
    }
  }
  return false;
}

export function approveApplication(appId, adminId, comments = "") {
  updateApplication(appId, { status: "Approved", reviewerComments: comments });
  addTimelineEntry(
    appId,
    comments ? `Approved: ${comments}` : "Application approved",
    adminId,
  );
  addAuditLog(
    adminId,
    comments
      ? `Approved application: ${comments}`
      : `Approved application: ${appId}`,
    "application",
    appId,
  );

  // Auto-approve any unanswered/pending questions in the application so that the total score is fully generated
  const app = getApplicationById(appId);
  if (app) {
    const fields = getFieldsByEdition(app.editionId);
    const answers = getAnswersByApplication(appId);
    fields.forEach((field) => {
      if (field.isLayoutElement) return;
      let ans = answers.find((a) => a.fieldId === field.id);
      if (!ans) {
        ans = {
          id: `ans_${appId}_${field.id}_${Date.now()}`,
          applicationId: appId,
          fieldId: field.id,
          value: "",
          compliance: "",
          questionStatus: QUESTION_STATUS.DRAFT,
          questionScore: 0,
          adminRemarks: "",
          files: [],
          updatedAt: new Date().toISOString(),
        };
        _db.applicationAnswers.push(ans);
      }
      if (
        ans.questionStatus !== QUESTION_STATUS.APPROVED &&
        ans.questionStatus !== QUESTION_STATUS.REJECTED
      ) {
        const isUploadType =
          ["file", "pdf", "imageupload"].includes(field.fieldType) ||
          field.isUploadElement;
        let isAnswered = false;
        if (isUploadType) {
          isAnswered = Array.isArray(ans.files) && ans.files.length > 0;
        } else if (field.fieldType === "radio") {
          isAnswered = ans.value && !isAnswerNo(ans, field);
        } else {
          isAnswered = typeof ans.value === "string" && ans.value.trim() !== "";
        }

        ans.questionStatus = QUESTION_STATUS.APPROVED;
        ans.questionScore = isAnswered
          ? field.maxScore || field.weight || 1
          : 0;
        ans.compliance = isAnswered ? "Yes" : "No";
        ans.approvedAt = new Date().toISOString();
        ans.approvedBy = adminId;
      }
    });
    _recalcScore(appId);
    _save();
  }
}

export function rejectApplication(appId, adminId, reason) {
  updateApplication(appId, {
    status: "Rejected",
    rejectionReason: reason,
    reviewerComments: reason,
  });
  addTimelineEntry(appId, `Rejected: ${reason}`, adminId);
  addAuditLog(
    adminId,
    `Application rejected: ${appId} - Reason: ${reason}`,
    "application",
    appId,
  );
}

export function requestAdditionalDocs(appId, adminId, note) {
  updateApplication(appId, {
    status: "Additional Documents Requested",
    additionalDocsNote: note,
  });
  addTimelineEntry(appId, `Additional docs requested: ${note}`, adminId);
}

export function addComment(appId, userId, text) {
  const app = getApplicationById(appId);
  if (!app) return;
  if (!app.comments) app.comments = [];
  app.comments.push({ text, by: userId, timestamp: new Date().toISOString() });
  updateApplication(appId, { comments: app.comments });
}
// Helper to check question assignment
export function isFieldAssignedToUser(f, userId) {
  const user = (_db.users || []).find((u) => u.id === userId);
  if (!user) return false;

  // 1. Check if assigned via database assignments
  const editionAssignments = (_db.assignments || []).filter(
    (a) => a.userId === userId && a.editionId === f.editionId,
  );
  const isAssignedInDb = editionAssignments.some((a) => {
    if (
      (!a.type || a.type === "Reform Area") &&
      (a.sectionId === f.reformAreaId || a.reformAreaId === f.reformAreaId)
    )
      return true;
    if (a.type === "Action Point" && a.actionPointId === f.actionPointId)
      return true;
    if (a.type === "Question" && (a.questionId === f.id || a.fieldId === f.id))
      return true;
    return false;
  });

  // 2. Check if assigned via schema mappings
  let isAssignedInSchema = false;
  if (f.assignment) {
    const ass = f.assignment;
    if (
      ass.type === "custom" &&
      ass.users &&
      (ass.users.includes(user.username) || ass.users.includes(user.id))
    ) {
      isAssignedInSchema = true;
    }
  }
  const parentRA = (_db.reformAreas || []).find(
    (s) => s.id === f.reformAreaId && s.editionId === f.editionId,
  );
  if (parentRA && parentRA.assignment) {
    const raAss = parentRA.assignment;
    if (
      raAss.type === "custom" &&
      raAss.users &&
      (raAss.users.includes(user.username) || raAss.users.includes(user.id))
    ) {
      isAssignedInSchema = true;
    }
  }

  if (isAssignedInDb || isAssignedInSchema) return true;

  return false;
}

export function isSectionAssignedToUser(sec, userId) {
  const user = (_db.users || []).find((u) => u.id === userId);
  if (!user) return false;

  // A section is assigned if:
  // 1. Any field in this section is assigned to the user
  const fields = getFieldsByReformArea(sec.id);
  const anyFieldAssigned = fields.some((f) => isFieldAssignedToUser(f, userId));
  if (anyFieldAssigned) return true;

  // 2. Or if there is an explicit Reform Area assignment for this section
  const raAssignments = (_db.assignments || []).filter(
    (a) => a.userId === userId && a.editionId === sec.editionId,
  );
  const isRAAssigned = raAssignments.some((a) => {
    if (
      (!a.type || a.type === "Reform Area") &&
      (a.sectionId === sec.id || a.reformAreaId === sec.id)
    )
      return true;
    return false;
  });
  if (isRAAssigned) return true;

  // 3. Or check if the section itself has schema mappings assigning it to the user
  if (sec.assignment) {
    const ass = sec.assignment;
    if (
      ass.type === "custom" &&
      ass.users &&
      (ass.users.includes(user.username) || ass.users.includes(user.id))
    ) {
      return true;
    }
  }

  return false;
}

// ─── Reform Area Submission ───────────────────────────────────
export function submitReformArea(appId, reformAreaId, userId) {
  const app = getApplicationById(appId);
  if (!app) return { success: false, error: "Application not found" };

  const fields = getFieldsByEdition(app.editionId).filter(
    (f) => f.reformAreaId === reformAreaId && isFieldAssignedToUser(f, userId),
  );
  const answers = getAnswersByApplication(appId);
  const answersMap = {};
  answers.forEach((a) => {
    answersMap[a.fieldId] = a;
  });

  const missing = [];
  fields.forEach((f) => {
    if (f.mandatory && !f.isLayoutElement) {
      const ans = answersMap[f.id];
      if (!ans || !ans.value) {
        missing.push(f);
        return;
      }
      // Check mandatory docs
      if (f.docs && f.docs.length > 0) {
        const mandatoryDocs = f.docs.filter(
          (d) => d.requirement === "mandatory",
        );
        for (const doc of mandatoryDocs) {
          const uploadedFile = (ans.files || []).find(
            (file) => file.docId === doc.id,
          );
          if (!uploadedFile || (!uploadedFile.dataUrl && !uploadedFile.name)) {
            missing.push(f);
            return;
          }
        }
      }
      // Check uploadRequirement
      if (f.uploadRequirement === "mandatory") {
        if (!ans.files || ans.files.length === 0) {
          missing.push(f);
          return;
        }
      }
    }
  });

  if (missing.length > 0) {
    const labelList = missing
      .map((m) => (m.num ? `Q ${m.num}` : m.label || m.id))
      .join(", ");
    return {
      success: false,
      error: `Please answer all mandatory questions and upload all required documents: ${labelList}`,
    };
  }

  if (!app.reformAreaStatuses) app.reformAreaStatuses = {};
  app.reformAreaStatuses[reformAreaId] = "Submitted";

  // Also submit all answered questions in this reform area
  answers.forEach((ans) => {
    const field = getFieldById(ans.fieldId);
    if (field?.reformAreaId === reformAreaId && ans.value) {
      ans.questionStatus = QUESTION_STATUS.SUBMITTED;
    }
  });

  // Keep the overall status as Draft
  updateApplication(appId, {
    reformAreaStatuses: app.reformAreaStatuses,
    status: "Draft",
  });

  addTimelineEntry(appId, `Reform Area submitted: ${reformAreaId}`, userId);
  _save();
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// APPLICATION ANSWERS (Question-level)
// ═══════════════════════════════════════════════════════════════
export function getAnswersByApplication(appId) {
  return (_db.applicationAnswers || []).filter(
    (a) => a.applicationId === appId,
  );
}

export function getAnswerByField(appId, fieldId) {
  return (_db.applicationAnswers || []).find(
    (a) => a.applicationId === appId && a.fieldId === fieldId,
  );
}

export function saveAnswer(appId, fieldId, value, files = []) {
  let ans = _db.applicationAnswers.find(
    (a) => a.applicationId === appId && a.fieldId === fieldId,
  );
  if (ans) {
    ans.value = value;
    // Merge files — preserve existing file statuses for unchanged files
    const existingFiles = ans.files || [];
    ans.files = files.map((f) => {
      const existing = existingFiles.find((ef) => ef.docId === f.docId);
      if (existing) {
        return {
          ...f,
          fileStatus: existing.fileStatus,
          fileRejectionReason: existing.fileRejectionReason || "",
        };
      }
      return { ...f, fileStatus: DOC_STATUS.PENDING, fileRejectionReason: "" };
    });
    ans.updatedAt = new Date().toISOString();
  } else {
    _db.applicationAnswers.push({
      id: `ans_${appId}_${fieldId}_${Date.now()}`,
      applicationId: appId,
      fieldId,
      value,
      compliance: "",
      questionStatus: QUESTION_STATUS.DRAFT,
      questionScore: 0,
      adminRemarks: "",
      files: files.map((f) => ({
        ...f,
        fileStatus: DOC_STATUS.PENDING,
        fileRejectionReason: "",
      })),
      updatedAt: new Date().toISOString(),
    });
  }
  scheduleSave();
}

export function saveAnswerCompliance(appId, fieldId, compliance) {
  let ans = _db.applicationAnswers.find(
    (a) => a.applicationId === appId && a.fieldId === fieldId,
  );
  if (ans) {
    ans.compliance = compliance;
    ans.value = compliance; // also write to value so submitQuestion validation passes
    ans.updatedAt = new Date().toISOString();
  } else {
    _db.applicationAnswers.push({
      id: `ans_${appId}_${fieldId}_${Date.now()}`,
      applicationId: appId,
      fieldId,
      value: compliance, // radio selection IS the answer value
      compliance,
      questionStatus: QUESTION_STATUS.DRAFT,
      questionScore: 0,
      adminRemarks: "",
      files: [],
      updatedAt: new Date().toISOString(),
    });
  }
  autoCalculateScore(appId, fieldId);
  scheduleSave();
}

// ─── Question-Level Submit ────────────────────────────────────
export function submitQuestion(appId, fieldId, userId) {
  let ans = _db.applicationAnswers.find(
    (a) => a.applicationId === appId && a.fieldId === fieldId,
  );
  if (!ans) return { success: false, error: "No answer found" };
  const field = getFieldById(fieldId);
  if (field?.mandatory) {
    const isUploadType =
      ["file", "pdf", "imageupload"].includes(field.fieldType) ||
      field.isUploadElement;
    if (isUploadType) {
      if (!ans.files || ans.files.length === 0) {
        return {
          success: false,
          error: "At least one supporting document must be uploaded.",
        };
      }
    } else {
      if (!ans.value) {
        return {
          success: false,
          error: "Answer is required before submitting.",
        };
      }
    }
  }
  // Check mandatory docs
  const mandatoryDocs = (field?.docs || []).filter(
    (d) => d.requirement === "mandatory",
  );
  for (const doc of mandatoryDocs) {
    if (!ans.files?.find((f) => f.docId === doc.id))
      return {
        success: false,
        error: `Mandatory document "${doc.name}" must be uploaded.`,
      };
  }
  autoCalculateScore(appId, fieldId);
  ans.questionStatus = QUESTION_STATUS.SUBMITTED;
  ans.updatedAt = new Date().toISOString();
  addTimelineEntry(
    appId,
    `Question submitted: ${field?.label || fieldId}`,
    userId,
  );
  _save();
  return { success: true };
}

// ─── Question-Level Approve / Reject ─────────────────────────
export function approveQuestion(
  appId,
  fieldId,
  adminId,
  score = null,
  remarks = "",
) {
  const ans = _db.applicationAnswers.find(
    (a) => a.applicationId === appId && a.fieldId === fieldId,
  );
  if (!ans) return false;
  const field = getFieldById(fieldId);

  // Guard: question must be filled before it can be approved
  if (!isQuestionFilled(ans, field)) {
    throw new Error(
      "Cannot approve unanswered question. Question contains no valid response.",
    );
  }

  ans.questionStatus = QUESTION_STATUS.APPROVED;
  // Score: only award marks if the answer is scorable (not "No"/empty/N/A)
  if (score !== null) {
    ans.questionScore = isScorableAnswer(ans, field) ? score : 0;
  } else {
    ans.questionScore = isScorableAnswer(ans, field)
      ? field?.maxScore || field?.weight || 1
      : 0;
  }

  ans.adminRemarks = remarks || ans.adminRemarks || "Approved by reviewer.";
  ans.approvedAt = new Date().toISOString();
  ans.approvedBy = adminId;
  _recalcScore(appId);

  const reviewerUser = getUserById(adminId);
  const reviewerName = reviewerUser
    ? reviewerUser.name || reviewerUser.username
    : adminId;
  addTimelineEntry(
    appId,
    `Question approved by ${reviewerName}: ${field?.num || ""} ${field?.label || fieldId}`,
    adminId,
    remarks,
  );
  _save();
  return true;
}

export function rejectQuestion(appId, fieldId, adminId, reason) {
  const ans = _db.applicationAnswers.find(
    (a) => a.applicationId === appId && a.fieldId === fieldId,
  );
  if (!ans) return false;
  const field = getFieldById(fieldId);
  ans.questionStatus = QUESTION_STATUS.REJECTED;
  ans.questionScore = 0;
  ans.adminRemarks = reason || "";
  ans.questionRejectedAt = new Date().toISOString();
  ans.questionRejectedBy = adminId;
  _recalcScore(appId);

  const reviewerUser = getUserById(adminId);
  const reviewerName = reviewerUser
    ? reviewerUser.name || reviewerUser.username
    : adminId;
  addTimelineEntry(
    appId,
    `Question rejected by ${reviewerName}: ${field?.num || ""} ${field?.label || fieldId}`,
    adminId,
    reason,
  );
  _save();
  return true;
}

export function requestAdditionalDocsForQuestion(
  appId,
  fieldId,
  adminId,
  remarks,
) {
  let ans = _db.applicationAnswers.find(
    (a) => a.applicationId === appId && a.fieldId === fieldId,
  );
  const field = getFieldById(fieldId);
  if (!ans) {
    ans = {
      id: `ans_${appId}_${fieldId}_${Date.now()}`,
      applicationId: appId,
      fieldId,
      value: "",
      compliance: "",
      questionStatus: "Additional Documents Requested",
      questionScore: 0,
      adminRemarks: remarks || "",
      files: [],
      updatedAt: new Date().toISOString(),
    };
    _db.applicationAnswers.push(ans);
  } else {
    ans.questionStatus = "Additional Documents Requested";
    ans.questionScore = 0;
    ans.adminRemarks = remarks || "";
    ans.updatedAt = new Date().toISOString();
  }

  updateApplication(appId, { status: "Additional Documents Requested" });
  _recalcScore(appId);

  const reviewerUser = getUserById(adminId);
  const reviewerName = reviewerUser
    ? reviewerUser.name || reviewerUser.username
    : adminId;
  addTimelineEntry(
    appId,
    `Additional documents requested by ${reviewerName} for question: ${field?.num || ""} ${field?.label || fieldId}`,
    adminId,
    remarks,
  );
  _save();
  return true;
}

// ─── Document-Level Approve / Reject ─────────────────────────
export function approveDocument(appId, fieldId, docId, adminId) {
  const ans = _db.applicationAnswers.find(
    (a) => a.applicationId === appId && a.fieldId === fieldId,
  );
  if (!ans) return false;
  const file = (ans.files || []).find((f) => f.docId === docId);
  if (!file) return false;
  file.fileStatus = DOC_STATUS.APPROVED;
  file.fileRejectionReason = "";
  file.approvedBy = adminId;
  file.approvedAt = new Date().toISOString();
  _save();
  return true;
}

export function rejectDocument(appId, fieldId, docId, adminId, reason) {
  const ans = _db.applicationAnswers.find(
    (a) => a.applicationId === appId && a.fieldId === fieldId,
  );
  if (!ans) return false;
  const file = (ans.files || []).find((f) => f.docId === docId);
  if (!file) return false;
  file.fileStatus = DOC_STATUS.REJECTED;
  file.fileRejectionReason = reason;
  file.rejectedBy = adminId;
  file.rejectedAt = new Date().toISOString();
  addTimelineEntry(
    appId,
    `Document rejected: ${file.name} — ${reason}`,
    adminId,
  );
  _save();
  return true;
}

function _recalcScore(appId) {
  const score = calculateApplicationScore(appId);
  const idx = _db.applications.findIndex((a) => a.id === appId);
  if (idx !== -1) {
    const oldScore = _db.applications[idx].score;
    _db.applications[idx].score = score;
    if (oldScore !== score) {
      let currentUserId = "system";
      try {
        const sessionRaw = sessionStorage.getItem("srf_session_v2");
        if (sessionRaw) {
          const u = JSON.parse(sessionRaw);
          currentUserId = u.username || u.name || u.id;
        }
      } catch (e) {}
      addTimelineEntry(
        appId,
        `Score updated: ${score} marks (previously ${oldScore})`,
        currentUserId,
      );
    }
  }
}

export function calculateApplicationScore(appId) {
  const app = getApplicationById(appId);
  if (!app) return 0;
  const answers = getAnswersByApplication(appId);
  const fields = getFieldsByEdition(app.editionId);

  return answers.reduce((sum, a) => {
    const field = fields.find((f) => f.id === a.fieldId);
    if (!field || field.isLayoutElement) return sum;

    // Only Approved questions contribute to score
    if (a.questionStatus !== "Approved") return sum;

    // "No", "Not Applicable", empty = 0 marks (never add to score)
    if (!isScorableAnswer(a, field)) return sum;

    return sum + (a.questionScore || 0);
  }, 0);
}

// ─── Application Progress (Completion Rate) ───────────────────────
// Counts answered questions using isQuestionFilled ("No" = answered).
export function calculateApplicationProgress(appId) {
  const app = getApplicationById(appId);
  if (!app) return { completed: 0, total: 0, percentage: 0 };
  const user = getUserById(app.userId);
  const fields = getFieldsByEdition(app.editionId).filter((f) => {
    if (f.isLayoutElement) return false;
    if (!user) return true;
    return isFieldAssignedToUser(f, user.id);
  });
  const answers = getAnswersByApplication(appId);
  const answersMap = {};
  answers.forEach((a) => {
    answersMap[a.fieldId] = a;
  });
  const total = fields.length;
  const completed = fields.filter((f) =>
    isQuestionFilled(answersMap[f.id], f),
  ).length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, percentage };
}

export function calculateApplicationMaxScore(appId) {
  const app = getApplicationById(appId);
  if (!app) return 0;
  const user = getUserById(app.userId);
  if (!user) return 0;
  const fields = getFieldsByEdition(app.editionId).filter((f) => {
    if (f.isLayoutElement) return false;
    return isFieldAssignedToUser(f, user.id);
  });
  return fields.reduce((sum, f) => sum + (f.maxScore || f.weight || 1), 0);
}

// ─── Question Review Queue (Admin) ───────────────────────────
export function getQuestionReviewQueue(editionId, filters = {}) {
  const apps = (_db.applications || []).filter(
    (a) => a.editionId === editionId,
  );
  const rows = [];
  apps.forEach((app) => {
    const user = getUserById(app.userId);
    const answers = getAnswersByApplication(app.id);
    answers.forEach((ans) => {
      const field = getFieldById(ans.fieldId);
      if (!field || field.editionId !== editionId) return;
      if (field.isLayoutElement) return;
      const ra = getReformAreaById(field.reformAreaId);
      const row = {
        appId: app.id,
        userId: app.userId,
        userName: user?.name || app.userId,
        reformAreaId: field.reformAreaId,
        reformAreaName: ra?.name || "",
        fieldId: ans.fieldId,
        questionLabel: field.label || field.text,
        questionStatus: ans.questionStatus || QUESTION_STATUS.DRAFT,
        questionScore: ans.questionScore || 0,
        maxScore: field.maxScore || field.weight || 1,
        adminRemarks: ans.adminRemarks || "",
        value: ans.value,
        files: ans.files || [],
        submittedAt: app.submittedAt || app.updatedAt,
      };
      if (filters.status && row.questionStatus !== filters.status) return;
      if (filters.reformAreaId && row.reformAreaId !== filters.reformAreaId)
        return;
      rows.push(row);
    });
  });
  // Sort by submitted date
  rows.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 25;
  return {
    items: rows.slice((page - 1) * pageSize, page * pageSize),
    total: rows.length,
  };
}

// ═══════════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════════
export function getUsers() {
  return _db.users || [];
}
export function getUserById(id) {
  return (_db.users || []).find((u) => u.id === id);
}
export function getUserByUsername(u) {
  return (_db.users || []).find((x) => x.username === u);
}
export function authenticateUser(username, password) {
  return (_db.users || []).find(
    (u) =>
      u.username === username &&
      String(u.password) === String(password) &&
      u.active !== false,
  );
}
export async function createUser(data) {
  let reqUserId = null;
  let reqUserRole = null;
  try {
    const sessionRaw = sessionStorage.getItem("srf_session_v2");
    if (sessionRaw) {
      const sess = JSON.parse(sessionRaw);
      reqUserId = sess.id;
      reqUserRole = sess.role;
      reqToken = sess.token;
    }
  } catch (e) {}

  if (reqUserRole !== "superadmin" && reqUserRole !== "admin") {
    return { error: "Only administrators can register users." };
  }

  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": reqUserId,
        "X-User-Role": reqUserRole,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      let errData = {};
      try { errData = await res.json(); } catch(e) { errData.error = res.statusText || 'Server error'; }
      return { error: errData.error || "Failed to create user" };
    }
    const result = await res.json();
    if (result.success) {
      if (!_db.users) _db.users = [];
      _db.users.push(result.user);
      try {
        localStorage.setItem(DB_KEY, JSON.stringify(_db));
      } catch (e) {}
      return { ...result.user, tempPassword: result.tempPassword };
    }
    return { error: result.error || "Invalid server response" };
  } catch (err) {
    console.error("[Store] error creating user:", err);
    return { error: "Network error or server unreachable. Please try again." };
  }
}
export async function importUsersBulk(usersArray) {
  let reqUserId = null;
  let reqUserRole = null;
  try {
    const sessionRaw = sessionStorage.getItem("srf_session_v2");
    if (sessionRaw) {
      const sess = JSON.parse(sessionRaw);
      reqUserId = sess.id;
      reqUserRole = sess.role;
      reqToken = sess.token;
    }
  } catch (e) {}

  if (reqUserRole !== "superadmin" && reqUserRole !== "admin") {
    return { error: "Only administrators can bulk register users." };
  }

  try {
    const res = await fetch("/api/register-bulk", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": reqUserId,
        "X-User-Role": reqUserRole,
      },
      body: JSON.stringify({ users: usersArray }),
    });
    if (!res.ok) {
      const errData = await res.json();
      return { error: errData.error || "Failed to bulk import users" };
    }
    const result = await res.json();
    if (result.success) {
      if (!_db.users) _db.users = [];
      if (result.createdUsers && Array.isArray(result.createdUsers)) {
        result.createdUsers.forEach((nu) => {
          const exists = _db.users.some((u) => u.id === nu.id);
          if (!exists) {
            _db.users.push(nu);
          }
        });
      }
      try {
        localStorage.setItem(DB_KEY, JSON.stringify(_db));
      } catch (e) {}
      return result;
    }
    return { error: "Invalid server response" };
  } catch (err) {
    console.error("[Store] error bulk importing users:", err);
    return { error: "Network error bulk importing users" };
  }
}
export function updateUser(id, data) {
  const idx = _db.users.findIndex((u) => u.id === id);
  if (idx !== -1) {
    Object.assign(_db.users[idx], data, { id });
    _save();
  }
}
export function deleteUser(id) {
  const user = (_db.users || []).find((u) => u.id === id);
  if (user) {
    _db.users = (_db.users || []).filter((u) => u.id !== id);
    _db.assignments = (_db.assignments || []).filter((a) => a.userId !== id);
    _db.notifications = (_db.notifications || []).filter((n) => n.userId !== id);
    
    // Explicitly delete user from backend to free up email address
    let headers = { "Content-Type": "application/json" };
    try {
      const sessUserRaw = sessionStorage.getItem("srf_session_v2");
      if (sessUserRaw) {
        const u = JSON.parse(sessUserRaw);
        if (u && u.token) headers["Authorization"] = "Bearer " + u.token;
      }
    } catch (e) {}

    fetch("/api/users/" + id, { method: "DELETE", headers }).catch(e => console.error(e));

    _save();
  }
}

// ═══════════════════════════════════════════════════════════════
// NOTIFICATIONS (with deduplication)
// ═══════════════════════════════════════════════════════════════
export function getNotifications(userId) {
  return (_db.notifications || [])
    .filter((n) => n.userId === userId && !n.isDismissed)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
export function getUnreadCount(userId) {
  return (_db.notifications || []).filter(
    (n) => n.userId === userId && !n.read && !n.isDismissed,
  ).length;
}
export function addNotification(
  userId,
  eventType,
  message,
  applicationId = null,
) {
  const now = Date.now();
  const key = `${eventType}_${applicationId || "none"}_${userId}`;

  const dup = (_db.notifications || []).find(
    (n) =>
      (n.notificationKey === key ||
        (n.userId === userId &&
          n.eventType === eventType &&
          n.applicationId === applicationId)) &&
      now - new Date(n.createdAt).getTime() < 10 * 60 * 1000,
  );
  if (dup) return dup;

  const note = {
    id: "note_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
    userId,
    eventType,
    message,
    applicationId,
    notificationKey: key,
    read: false,
    isDismissed: false,
    createdAt: new Date().toISOString(),
  };
  if (!_db.notifications) _db.notifications = [];
  _db.notifications.unshift(note);
  if (_db.notifications.length > 500)
    _db.notifications = _db.notifications.slice(0, 500);
  scheduleSave();
  return note;
}
export function markNotificationRead(id) {
  const n = (_db.notifications || []).find((n) => n.id === id);
  if (n) {
    n.read = true;
    _save();
  }
}
export function markAllNotificationsRead(userId) {
  (_db.notifications || [])
    .filter((n) => n.userId === userId)
    .forEach((n) => {
      n.read = true;
    });
  _save();
}
export function dismissNotification(userId, notifId) {
  const n = (_db.notifications || []).find(
    (n) => n.id === notifId && n.userId === userId,
  );
  if (n) {
    n.isDismissed = true;
    _save();
    return true;
  }
  return false;
}
export function getNotStartedCount(userId) {
  const user = getUserById(userId);
  if (!user) return 0;
  const apps = getApplicationsByUser(userId);
  const editions = getEditions(false).filter((e) => e.status === "published");
  let notStarted = 0;
  editions.forEach((e) => {
    const allSections = getReformAreas(e.id) || [];
    const hasAssigned = allSections.some((sec) =>
      isSectionAssignedToUser(sec, userId),
    );
    if (hasAssigned) {
      const hasApp = apps.some((a) => a.editionId === e.id);
      if (!hasApp) {
        notStarted++;
      }
    }
  });
  return notStarted;
}

// ═══════════════════════════════════════════════════════════════
// AUDIT LOGS
// ═══════════════════════════════════════════════════════════════
export function addAuditLog(
  userId,
  action,
  entityType,
  entityId,
  details = "",
) {
  const now = new Date();
  const timestamp = now.toISOString();
  const date = timestamp.slice(0, 10);
  const time = now.toTimeString().split(" ")[0];

  const user =
    getUserById(userId) || (_db.users || []).find((u) => u.username === userId);
  const username = user ? user.username : userId || "system";
  const role = user ? user.role : userId === "system" ? "system" : "unknown";

  const log = {
    id: "log_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
    userId: user ? user.id : userId,
    username,
    role,
    action,
    entityType,
    entityId,
    details,
    timestamp,
    date,
    time,
    ipAddress: "127.0.0.1", // Server will update this with client request IP during sync
  };

  if (!_db.auditLogs) _db.auditLogs = [];
  _db.auditLogs.unshift(log);
  if (_db.auditLogs.length > 2000) _db.auditLogs = _db.auditLogs.slice(0, 2000);
  scheduleSave();
  return log;
}
export function getAuditLogs(filters = {}) {
  let logs = _db.auditLogs || [];

  if (filters.userQuery) {
    const query = filters.userQuery.toLowerCase();
    const matchingUserIds = new Set(
      (_db.users || [])
        .filter(
          (u) =>
            (u.username || "").toLowerCase().startsWith(query) ||
            (u.name || "").toLowerCase().startsWith(query),
        )
        .map((u) => u.id),
    );
    logs = logs.filter(
      (l) =>
        matchingUserIds.has(l.userId) ||
        (l.userId || "").toLowerCase().startsWith(query),
    );
  } else if (filters.userId) {
    logs = logs.filter((l) => l.userId === filters.userId);
  }
  if (filters.adminId) {
    logs = logs.filter((l) => l.userId === filters.adminId);
  }
  if (filters.district) {
    const districtUserIds = new Set(
      (_db.users || [])
        .filter((u) => u.district === filters.district)
        .map((u) => u.id),
    );
    logs = logs.filter((l) => districtUserIds.has(l.userId));
  }
  if (filters.category) {
    const cat = filters.category.toLowerCase();
    if (cat === "login") {
      logs = logs.filter((l) => {
        const act = (l.action || "").toLowerCase();
        return (
          act.includes("portal accessed") ||
          act.includes("login") ||
          act.includes("logout") ||
          act.includes("password") ||
          l.entityType === "auth"
        );
      });
    } else if (cat === "approve") {
      logs = logs.filter((l) => {
        const act = (l.action || "").toLowerCase();
        return act.includes("approved") || act.includes("approval");
      });
    } else if (cat === "reject") {
      logs = logs.filter((l) => {
        const act = (l.action || "").toLowerCase();
        return (
          act.includes("rejected") ||
          act.includes("rejection") ||
          act.includes("resubmission") ||
          act.includes("resubmit") ||
          act.includes("additional docs") ||
          act.includes("additional documents")
        );
      });
    } else if (cat === "assign") {
      logs = logs.filter((l) => {
        const act = (l.action || "").toLowerCase();
        return (
          act.includes("assigned") ||
          act.includes("reassigned") ||
          act.includes("unassigned") ||
          act.includes("assignment") ||
          act.includes("mappings")
        );
      });
    }
  }

  if (filters.startDate) {
    const start = new Date(filters.startDate).getTime();
    logs = logs.filter((l) => new Date(l.timestamp).getTime() >= start);
  }
  if (filters.endDate) {
    const end = new Date(filters.endDate);
    end.setHours(23, 59, 59, 999);
    const endTime = end.getTime();
    logs = logs.filter((l) => new Date(l.timestamp).getTime() <= endTime);
  }

  const page = filters.page || 1,
    pageSize = filters.pageSize || 100;
  return {
    items: logs.slice((page - 1) * pageSize, page * pageSize),
    total: logs.length,
    totalPages: Math.ceil(logs.length / pageSize),
  };
}

// ═══════════════════════════════════════════════════════════════
// ASSIGNMENTS
// ═══════════════════════════════════════════════════════════════
export function getAllAssignments() {
  const activeEditionIds = getEditions(false).map((e) => e.id);
  return (_db.assignments || []).filter((a) =>
    activeEditionIds.includes(a.editionId),
  );
}
export function getAssignments(userId) {
  const activeEditionIds = getEditions(false).map((e) => e.id);
  return (_db.assignments || []).filter(
    (a) => a.userId === userId && activeEditionIds.includes(a.editionId),
  );
}

export function isFieldAnsweredForStats(ans, field) {
  if (!ans) return false;
  const isUploadType =
    ["file", "pdf", "imageupload"].includes(field.fieldType) ||
    field.isUploadElement;
  if (isUploadType) {
    return Array.isArray(ans.files) && ans.files.length > 0;
  }
  if (field.fieldType === "radio") {
    return (
      ans.value === "Yes" ||
      ans.value === "No" ||
      (ans.value && ans.value !== "")
    );
  }
  return typeof ans.value === "string" && ans.value.trim() !== "";
}

export function getPendingAssignmentsCount(userId, editionId = null) {
  const assigned = getAssignments(userId).filter(
    (a) => !editionId || a.editionId === editionId,
  );
  const assignedFieldIds = new Set();

  const activeEditions = getEditions(false).map((e) => e.id);
  const fields = (_db.formFields || []).filter(
    (f) => activeEditions.includes(f.editionId) && !f.isLayoutElement,
  );

  assigned.forEach((a) => {
    if (a.type === "Question") {
      assignedFieldIds.add(a.fieldId || a.questionId);
    } else if (a.type === "Action Point") {
      fields
        .filter((f) => f.actionPointId === a.actionPointId)
        .forEach((f) => assignedFieldIds.add(f.id));
    } else if (a.type === "Reform Area") {
      fields
        .filter((f) => f.reformAreaId === a.reformAreaId)
        .forEach((f) => assignedFieldIds.add(f.id));
    }
  });

  const apps = getApplicationsByUser(userId);
  let pending = 0;

  assignedFieldIds.forEach((fid) => {
    const field = fields.find((f) => f.id === fid);
    if (!field) return;

    // Check if answered in any of user's active applications
    let answered = false;
    for (const app of apps) {
      if (app.editionId !== field.editionId) continue;
      const answers = getAnswersByApplication(app.id);
      const ans = answers.find((x) => x.fieldId === fid);
      if (ans && isFieldAnsweredForStats(ans, field)) {
        answered = true;
        break;
      }
    }
    if (!answered) pending++;
  });

  return pending;
}

export function autoCalculateScore(appId, fieldId) {
  const ans = _db.applicationAnswers.find(
    (a) => a.applicationId === appId && a.fieldId === fieldId,
  );
  if (!ans) return;
  const field = getFieldById(fieldId);
  if (!field) return;

  // Use isScorableAnswer: "No", "N/A", empty = 0 marks
  if (!isScorableAnswer(ans, field)) {
    ans.questionScore = 0;
  } else {
    ans.questionScore = field.maxScore || field.weight || 1;
  }
  _recalcScore(appId);
}
export function createAssignment(userId, data, assignedBy) {
  const exists = (_db.assignments || []).some(
    (x) =>
      x.userId === userId &&
      x.editionId === data.editionId &&
      x.type === data.type &&
      (data.type === "Reform Area"
        ? x.sectionId === data.sectionId || x.reformAreaId === data.reformAreaId
        : true) &&
      (data.type === "Action Point"
        ? x.actionPointId === data.actionPointId
        : true) &&
      (data.type === "Question"
        ? x.questionId === data.questionId || x.fieldId === data.fieldId
        : true),
  );

  if (exists) {
    const existing = (_db.assignments || []).find(
      (x) =>
        x.userId === userId &&
        x.editionId === data.editionId &&
        x.type === data.type &&
        (data.type === "Reform Area"
          ? x.sectionId === data.sectionId ||
            x.reformAreaId === data.reformAreaId
          : true) &&
        (data.type === "Action Point"
          ? x.actionPointId === data.actionPointId
          : true) &&
        (data.type === "Question"
          ? x.questionId === data.questionId || x.fieldId === data.fieldId
          : true),
    );
    return existing;
  }

  const safeId =
    "assign_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
  const a = {
    id: safeId,
    userId,
    ...data,
    assignedBy,
    assignedAt: new Date().toISOString(),
  };
  _db.assignments.push(a);
  addAuditLog(
    assignedBy,
    `Assigned task to user: ${userId}`,
    "Assignment",
    a.id,
  );
  validateApplicationAssignmentLink(userId, data.editionId);
  _save();
  return a;
}
export function createAssignmentsBulk(userId, assignmentsArray, assignedBy) {
  let createdCount = 0;
  const now = new Date().toISOString();

  if (!_db.assignments) _db.assignments = [];

  const editionIds = new Set();

  assignmentsArray.forEach((data) => {
    const exists = _db.assignments.some(
      (x) =>
        x.userId === userId &&
        x.editionId === data.editionId &&
        x.type === data.type &&
        (data.type === "Reform Area"
          ? x.sectionId === data.sectionId ||
            x.reformAreaId === data.reformAreaId
          : true) &&
        (data.type === "Action Point"
          ? x.actionPointId === data.actionPointId
          : true) &&
        (data.type === "Question"
          ? x.questionId === data.questionId || x.fieldId === data.fieldId
          : true),
    );

    if (!exists) {
      const safeId =
        "assign_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
      const a = {
        id: safeId,
        userId,
        ...data,
        assignedBy,
        assignedAt: now,
      };
      _db.assignments.push(a);
      createdCount++;
      editionIds.add(data.editionId);
    }
  });

  if (createdCount > 0) {
    editionIds.forEach((editionId) => {
      validateApplicationAssignmentLink(userId, editionId);
    });
    addAuditLog(
      assignedBy,
      `Bulk assigned ${createdCount} items to user: ${userId}`,
      "Assignment",
      "bulk",
    );
    _save();
  }
  return createdCount;
}
export function updateAssignment(id, newUserId, assignedBy) {
  const a = (_db.assignments || []).find((x) => x.id === id);
  if (a) {
    a.userId = newUserId;
    a.assignedBy = assignedBy;
    a.assignedAt = new Date().toISOString();
    validateApplicationAssignmentLink(newUserId, a.editionId);
    _save();
    return a;
  }
  return null;
}
export function removeAssignment(id) {
  const a = (_db.assignments || []).find((x) => x.id === id);
  if (a) {
    if (!_db.recycleBin) _db.recycleBin = [];
    let removedBy = "admin";
    try {
      const sessionRaw = sessionStorage.getItem("srf_session_v2");
      if (sessionRaw) {
        const u = JSON.parse(sessionRaw);
        if (u && u.username) removedBy = u.username;
      }
    } catch (e) {}

    _db.recycleBin.push({
      id:
        "rb_assign_" +
        Date.now() +
        "_" +
        Math.random().toString(36).substr(2, 4),
      type: "assignment",
      assignmentId: id,
      name: `Assignment: ${a.responsibility || "Task"}`,
      assignmentData: a,
      deletedAt: new Date().toISOString(),
      deletedBy: removedBy,
    });

    _db.assignments = (_db.assignments || []).filter((x) => x.id !== id);
    addAuditLog(removedBy, `Assignment removed: ${id}`, "Assignment", id);
    _save();
  }
}

export function addReassignmentHistory(
  assignmentId,
  oldUserId,
  newUserId,
  reassignedBy,
  reason = "",
) {
  const assignment = (_db.assignments || []).find((x) => x.id === assignmentId);
  const history = {
    id:
      "reassign_hist_" +
      Date.now() +
      "_" +
      Math.random().toString(36).substr(2, 9),
    assignmentId,
    oldUserId,
    newUserId,
    reason,
    reassignedBy,
    reassignedAt: new Date().toISOString(),
    responsibility: assignment ? assignment.responsibility : "Unknown Task",
    type: assignment ? assignment.type : "General",
    editionId: assignment ? assignment.editionId : "",
  };
  _db.reassignmentHistory = _db.reassignmentHistory || [];
  _db.reassignmentHistory.push(history);
  addAuditLog(
    reassignedBy,
    `Reassigned task from ${oldUserId} to ${newUserId}. Reason: ${reason}`,
    "Assignment",
    assignmentId,
  );
  _save();
  return history;
}

export function getReassignmentHistory() {
  return _db.reassignmentHistory || [];
}

// ═══════════════════════════════════════════════════════════════
// STATS & ANALYTICS
// ═══════════════════════════════════════════════════════════════
export function getEditionStats(editionId) {
  let apps = (_db.applications || []).filter((a) => a.editionId === editionId);
  try {
    const sessionRaw = sessionStorage.getItem("srf_session_v2");
    if (sessionRaw) {
      const user = JSON.parse(sessionRaw);
      if (
        user &&
        (user.role === "admin" ||
          user.role === "reviewer" ||
          user.role === "superadmin")
      ) {
        apps = apps.filter((a) => a.status !== "Draft");
      }
    }
  } catch (e) {}
  const scores = apps
    .map((a) => calculateApplicationScore(a.id))
    .filter((s) => s > 0);
  return {
    total: apps.length,
    draft: apps.filter((a) => a.status === "Draft").length,
    submitted: apps.filter((a) =>
      ["Submitted", "Resubmitted"].includes(a.status),
    ).length,
    underReview: apps.filter((a) => a.status === "Under Review").length,
    approved: apps.filter((a) => a.status === "Approved").length,
    rejected: apps.filter((a) => a.status === "Rejected").length,
    additionalDocs: apps.filter(
      (a) => a.status === "Additional Documents Requested",
    ).length,
    avgScore: scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0,
    topScore: scores.length ? Math.max(...scores) : 0,
    lowestScore: scores.length ? Math.min(...scores) : 0,
  };
}

export function getReformAreaScores(editionId) {
  const reformAreas = getReformAreas(editionId);
  const apps = (_db.applications || []).filter(
    (a) => a.editionId === editionId,
  );
  return reformAreas.map((ra) => {
    const fields = getFieldsByReformArea(ra.id);
    let totalScore = 0,
      count = 0;
    apps.forEach((app) => {
      const answers = getAnswersByApplication(app.id);
      fields.forEach((f) => {
        const ans = answers.find((a) => a.fieldId === f.id);
        if (ans?.questionScore) {
          totalScore += ans.questionScore;
          count++;
        }
      });
    });
    return {
      ...ra,
      avgScore: count ? Math.round(totalScore / count) : 0,
      totalScore,
    };
  });
}

export function getAnalytics(editionId) {
  const apps = (_db.applications || []).filter(
    (a) => a.editionId === editionId,
  );
  // Submissions by day (last 14 days)
  const daily = {};
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    });
    daily[key] = 0;
  }
  apps.forEach((app) => {
    if (!app.submittedAt) return;
    const key = new Date(app.submittedAt).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    });
    if (key in daily) daily[key]++;
  });
  // Score buckets
  const buckets = {
    "0-10": 0,
    "11-20": 0,
    "21-30": 0,
    "31-40": 0,
    "41-50": 0,
    "51-60": 0,
    "61-70": 0,
    "71-80": 0,
    "81-90": 0,
    "91-100": 0,
  };
  apps.forEach((app) => {
    const s = calculateApplicationScore(app.id);
    const bucket = Math.min(Math.floor(s / 10) * 10, 90);
    const key = `${bucket}-${bucket + 10}`;
    if (key in buckets) buckets[key]++;
  });
  // Category breakdown
  const catScores = {};
  apps.forEach((app) => {
    const cat = app.category || "Unknown";
    if (!catScores[cat]) catScores[cat] = { total: 0, count: 0 };
    catScores[cat].total += calculateApplicationScore(app.id);
    catScores[cat].count++;
  });
  const reformAreaScores = getReformAreaScores(editionId);
  return {
    daily,
    buckets,
    catScores,
    reformAreaScores,
    stats: getEditionStats(editionId),
  };
}

// Legacy aliases for app.js and editionManager.js backward compatibility
export { getReformAreas as getSectionsByEdition };
export { getFieldsByReformArea as getFieldsBySection };

// Guidelines and Document Rules Database Management
export function getGuidelines(filters = {}) {
  if (!_db.guidelines) _db.guidelines = [];
  let g = _db.guidelines;
  if (filters.editionId) g = g.filter((x) => x.editionId === filters.editionId);
  if (filters.fieldId) g = g.filter((x) => x.fieldId === filters.fieldId);
  return g;
}

export function createGuideline(data) {
  if (!_db.guidelines) _db.guidelines = [];
  const g = {
    id: "guide_" + Date.now(),
    editionId: data.editionId,
    fieldId: data.fieldId || "",
    title: data.title || "Guideline",
    type: data.type || "text",
    url: data.url || "",
    content: data.content || "",
  };
  _db.guidelines.push(g);
  _save();
  return g;
}

export function deleteGuideline(id) {
  if (!_db.guidelines) return;
  const g = _db.guidelines.find((x) => x.id === id);
  if (g) {
    if (!_db.recycleBin) _db.recycleBin = [];
    let deletedBy = "admin";
    try {
      const sessUserRaw = sessionStorage.getItem("srf_session_v2");
      if (sessUserRaw) {
        const u = JSON.parse(sessUserRaw);
        if (u && u.username) deletedBy = u.username;
      }
    } catch (e) {}

    _db.recycleBin.push({
      id:
        "rb_guideline_" +
        Date.now() +
        "_" +
        Math.random().toString(36).substr(2, 4),
      type: "guideline",
      guidelineId: id,
      name: `Guideline: ${g.title || "Guideline"} (Page ${g.page || "—"})`,
      guidelineData: g,
      deletedAt: new Date().toISOString(),
      deletedBy: deletedBy,
    });

    _db.guidelines = _db.guidelines.filter((x) => x.id !== id);
    _save();
  }
}

export function getDocumentRules(editionId) {
  if (!_db.documentRules) _db.documentRules = [];
  return _db.documentRules.filter((r) => r.editionId === editionId);
}

export function checkAndConsolidateSRF(editionId, organization) {
  if (!organization) return;

  const allAssignments = getAllAssignments().filter(
    (a) => a.editionId === editionId,
  );
  const assignedUserIds = [...new Set(allAssignments.map((a) => a.userId))];

  if (assignedUserIds.length === 0) return;

  const apps = [];
  const db = _db;

  for (const uid of assignedUserIds) {
    const userApp = (db.applications || []).find(
      (app) => app.editionId === editionId && app.userId === uid,
    );
    if (!userApp) return; // Not all assigned users have applications yet
    if (userApp.status !== "Submitted") return; // Not all have submitted
    apps.push(userApp);
  }

  console.log(
    `[Consolidation] All ${apps.length} assigned users have submitted for ${organization}. Consolidating...`,
  );

  // Clean org name for ID
  const orgCleaned = organization.replace(/[^a-zA-Z0-9]/g, "_");
  const masterAppId = "APP_consolidated_" + editionId + "_" + orgCleaned;

  // Overwrite existing consolidated records if any
  db.applications = (db.applications || []).filter((a) => a.id !== masterAppId);
  db.applicationAnswers = (db.applicationAnswers || []).filter(
    (ans) => ans.applicationId !== masterAppId,
  );

  const masterApp = {
    id: masterAppId,
    editionId,
    userId: "consolidated_" + orgCleaned,
    organization,
    status: "Submitted",
    submittedAt: new Date().toISOString(),
    isConsolidated: true,
    consolidatedFrom: apps.map((a) => a.id),
  };

  db.applications.push(masterApp);

  // Merge answers
  apps.forEach((app) => {
    const answers = (db.applicationAnswers || []).filter(
      (ans) => ans.applicationId === app.id,
    );
    answers.forEach((ans) => {
      const masterAns = {
        ...ans,
        id: "ans_consolidated_" + ans.fieldId + "_" + masterAppId,
        applicationId: masterAppId,
        consolidatedFromAppId: app.id,
        consolidatedFromUserId: app.userId,
      };
      db.applicationAnswers.push(masterAns);
    });
  });

  try {
    addAuditLog(
      "system",
      `Consolidated SRF records for ${organization} into master application ${masterAppId}`,
      "application",
      masterAppId,
    );
  } catch (e) {
    console.error("Failed to log consolidated audit log:", e);
  }

  console.log(`[Consolidation] Complete. Master application: ${masterAppId}`);
}

export function submitApplication(appId, userId) {
  if (!appId) return { success: false, error: "Application ID is missing." };
  if (!userId) return { success: false, error: "User ID is missing." };

  const app = getApplicationById(appId);
  if (!app) return { success: false, error: "Application not found." };

  const user = getUserById(userId);
  if (!user) return { success: false, error: "User not found." };

  const edition = getEditionById(app.editionId);
  if (!edition) return { success: false, error: "Edition not found." };

  // Run integrity validation
  validateApplicationAssignmentLink(userId, app.editionId);

  const hasAssignment = (_db.assignments || []).some(
    (a) => a.userId === userId && a.editionId === app.editionId,
  );
  if (!hasAssignment) {
    return {
      success: false,
      error: "No active assignments found for this user in this edition.",
    };
  }

  if (
    app.status === "Submitted" ||
    app.status === "Approved" ||
    app.status === "Under Review" ||
    app.submittedAt
  ) {
    return { success: false, error: "Application has already been submitted." };
  }

  const fields = getFieldsByEdition(app.editionId).filter((f) =>
    isFieldAssignedToUser(f, userId),
  );
  const answers = getAnswersByApplication(appId);
  const answersMap = {};
  answers.forEach((a) => {
    answersMap[a.fieldId] = a;
  });

  const missingQuestions = [];
  const missingDocs = [];
  fields.forEach((f) => {
    if (!f.mandatory || f.isLayoutElement) return;
    const ans = answersMap[f.id];

    // Use isQuestionFilled: "No" = answered, empty/null = NOT answered
    if (!isQuestionFilled(ans, f)) {
      missingQuestions.push(f);
      return;
    }

    // If answered "No", documents are not required
    if (isAnswerNo(ans, f)) return;

    // Check mandatory docs (only when answer is not "No")
    if (f.docs && f.docs.length > 0) {
      const mandatoryDocs = f.docs.filter((d) => d.requirement === "mandatory");
      for (const doc of mandatoryDocs) {
        const uploadedFile = (ans.files || []).find(
          (file) => file.docId === doc.id,
        );
        if (!uploadedFile || (!uploadedFile.dataUrl && !uploadedFile.name)) {
          missingDocs.push({ field: f, doc });
          return;
        }
      }
    }
    if (f.uploadRequirement === "mandatory") {
      if (!ans.files || ans.files.length === 0) {
        missingDocs.push({ field: f });
      }
    }
  });

  const missing = missingQuestions; // kept for backward compat with caller
  if (missingQuestions.length > 0 || missingDocs.length > 0) {
    return { success: false, missing, missingQuestions, missingDocs };
  }

  const wasRejectedOrRequested =
    (app.statusHistory || []).some(
      (h) =>
        h.status === "Rejected" ||
        h.status === "Additional Documents Requested",
    ) ||
    app.rejectionReason ||
    app.status === "Additional Documents Requested";
  const finalStatus = wasRejectedOrRequested ? "Resubmitted" : "Submitted";

  // Snapshot answers to preserve history
  const answersSnapshot = answers.map((ans) => ({
    fieldId: ans.fieldId,
    value: ans.value,
    compliance: ans.compliance,
    questionStatus: ans.questionStatus,
    questionScore: ans.questionScore,
    adminRemarks: ans.adminRemarks,
    files: (ans.files || []).map((f) => ({
      docId: f.docId,
      name: f.name,
      fileStatus: f.fileStatus,
      fileRejectionReason: f.fileRejectionReason,
    })),
  }));

  if (!app.submissions) app.submissions = [];
  app.submissions.push({
    submissionIndex: app.submissions.length + 1,
    status: finalStatus,
    submittedAt: new Date().toISOString(),
    submittedBy: userId,
    answersSnapshot,
  });

  // Auto-assign reviewer if not already assigned
  if (!app.assignedReviewer) {
    const admins = (_db.users || []).filter(
      (u) => u.role === "admin" || u.role === "reviewer",
    );
    if (admins.length > 0) {
      const workloads = {};
      admins.forEach((adm) => {
        workloads[adm.id] = 0;
      });
      (_db.applications || []).forEach((a) => {
        if (
          a.assignedReviewer &&
          ["Submitted", "Under Review", "Resubmitted"].includes(a.status)
        ) {
          if (workloads[a.assignedReviewer] !== undefined) {
            workloads[a.assignedReviewer]++;
          }
        }
      });
      let leastReviewer = admins[0].id;
      let leastWorkload = workloads[leastReviewer];
      admins.forEach((adm) => {
        if (workloads[adm.id] < leastWorkload) {
          leastReviewer = adm.id;
          leastWorkload = workloads[adm.id];
        }
      });
      app.assignedReviewer = leastReviewer;
      app.assignedDate = new Date().toISOString();

      const revUser = admins.find((u) => u.id === leastReviewer);
      const revName = revUser
        ? revUser.name || revUser.username
        : leastReviewer;
      app.timeline = app.timeline || [];
      app.timeline.push({
        id: `tl_auto_assign_${Date.now()}`,
        action: "Application Assigned",
        details: `Automatically assigned reviewer ${revName} based on workload`,
        userId: "system",
        timestamp: new Date().toISOString(),
      });

      addNotification(
        leastReviewer,
        "APPLICATION_ASSIGNED",
        `Application ${app.id} has been automatically assigned to you.`,
        app.id,
      );
    }
  }

  updateApplication(appId, {
    status: finalStatus,
    submittedAt: new Date().toISOString(),
    submissions: app.submissions,
    assignedReviewer: app.assignedReviewer,
    assignedDate: app.assignedDate,
    reviewQueue: true,
    visibleToAdmin: true,
    visibleToSuperAdmin: true,
  });

  // Verify values after saving
  const verifiedApp = getApplicationById(appId);
  if (
    !verifiedApp ||
    verifiedApp.status !== finalStatus ||
    !verifiedApp.reviewQueue ||
    !verifiedApp.visibleToAdmin ||
    !verifiedApp.visibleToSuperAdmin
  ) {
    console.error(
      `[Submit Verification Error] Verification failed for app: ${appId}`,
    );
    return {
      success: false,
      error: "Database verification failed after submission.",
    };
  }

  addTimelineEntry(
    appId,
    wasRejectedOrRequested
      ? "Application resubmitted"
      : "Application submitted",
    userId,
  );
  addAuditLog(
    userId,
    wasRejectedOrRequested
      ? `Resubmitted application: ${appId}`
      : `Submitted application: ${appId}`,
    "application",
    appId,
  );

  // Check and consolidate SRF if all assigned users submitted
  checkAndConsolidateSRF(app.editionId, app.organization);

  _save();
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// DEPARTMENTS
// ═══════════════════════════════════════════════════════════════
export function getDepartments() {
  return _db.departments || [];
}

export function createDepartment(data) {
  _db.departments = _db.departments || [];
  const nameExists = _db.departments.some(
    (d) => d.name.toLowerCase() === data.name.toLowerCase(),
  );
  const codeExists = _db.departments.some(
    (d) => d.code.toLowerCase() === data.code.toLowerCase(),
  );
  if (nameExists) return { error: "Department name already exists." };
  if (codeExists) return { error: "Department code already exists." };

  const dept = {
    id: "dept_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
    name: data.name,
    code: data.code.toUpperCase(),
    description: data.description || "",
    createdAt: new Date().toISOString(),
  };
  _db.departments.push(dept);
  _save();
  return dept;
}

export function updateDepartment(id, data) {
  _db.departments = _db.departments || [];
  const dept = _db.departments.find((d) => d.id === id);
  if (!dept) return { error: "Department not found." };

  const nameExists = _db.departments.some(
    (d) => d.id !== id && d.name.toLowerCase() === data.name.toLowerCase(),
  );
  const codeExists = _db.departments.some(
    (d) => d.id !== id && d.code.toLowerCase() === data.code.toLowerCase(),
  );
  if (nameExists) return { error: "Department name already exists." };
  if (codeExists) return { error: "Department code already exists." };

  dept.name = data.name;
  dept.code = data.code.toUpperCase();
  dept.description = data.description || "";
  _save();
  return dept;
}

export function deleteDepartment(id) {
  const dept = (_db.departments || []).find((d) => d.id === id);
  if (dept) {
    if (!_db.recycleBin) _db.recycleBin = [];
    let deletedBy = "admin";
    try {
      const sessUserRaw = sessionStorage.getItem("srf_session_v2");
      if (sessUserRaw) {
        const u = JSON.parse(sessUserRaw);
        if (u && u.username) deletedBy = u.username;
      }
    } catch (e) {}

    _db.recycleBin.push({
      id:
        "rb_dept_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
      type: "department",
      departmentId: id,
      name: `Department: ${dept.name} (${dept.code})`,
      departmentData: dept,
      deletedAt: new Date().toISOString(),
      deletedBy: deletedBy,
    });

    _db.departments = (_db.departments || []).filter((d) => d.id !== id);
    _save();
  }
  return { success: true };
}

export function getMessagesBetween(userIdA, userIdB) {
  return (_db.messages || [])
    .filter(
      (m) =>
        (m.senderId === userIdA && m.receiverId === userIdB) ||
        (m.senderId === userIdB && m.receiverId === userIdA),
    )
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

export function getUnreadMessageCountFrom(senderId, receiverId) {
  return (_db.messages || []).filter(
    (m) => m.senderId === senderId && m.receiverId === receiverId && !m.read,
  ).length;
}

export function sendMessage(senderId, receiverId, content) {
  const msg = {
    id: "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
    senderId,
    receiverId,
    content,
    read: false,
    timestamp: new Date().toISOString(),
  };
  _db.messages = _db.messages || [];
  _db.messages.push(msg);
  forceSave();
  return msg;
}

export function markMessagesRead(senderId, receiverId) {
  let changed = false;
  (_db.messages || []).forEach((m) => {
    if (m.senderId === senderId && m.receiverId === receiverId && !m.read) {
      m.read = true;
      changed = true;
    }
  });
  if (changed) {
    forceSave();
  }
}

export function getRecycleBin() {
  if (!_db.recycleBin) _db.recycleBin = [];
  return _db.recycleBin;
}

export function addToRecycleBin(fileObj, appId, fieldId, deletedBy) {
  if (!_db.recycleBin) _db.recycleBin = [];
  _db.recycleBin.push({
    id: "rb_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
    name: fileObj.name,
    size: fileObj.size,
    type: fileObj.type,
    dataUrl: fileObj.dataUrl,
    appId,
    fieldId,
    deletedAt: new Date().toISOString(),
    deletedBy: deletedBy || "user",
  });
  _save();
}

export function restoreFromRecycleBin(id) {
  if (!_db.recycleBin) _db.recycleBin = [];
  const idx = _db.recycleBin.findIndex((x) => x.id === id);
  if (idx === -1) return false;

  const item = _db.recycleBin[idx];

  if (item.type === "edition") {
    if (!_db.editions) _db.editions = [];
    const edId = item.editionId || (item.editionData && item.editionData.id);
    const existingEd = _db.editions.find((e) => e.id === edId);
    if (existingEd) {
      existingEd.isDeleted = false;
      delete existingEd.deletedAt;
      delete existingEd.deletedBy;
    } else if (item.editionData) {
      const edData = { ...item.editionData };
      edData.isDeleted = false;
      delete edData.deletedAt;
      delete edData.deletedBy;
      _db.editions.push(edData);
    }
    if (!_db.reformAreas) _db.reformAreas = [];
    (item.reformAreasData || []).forEach((ra) => {
      if (!_db.reformAreas.some((r) => r.id === ra.id))
        _db.reformAreas.push(ra);
    });
    if (!_db.formFields) _db.formFields = [];
    (item.fieldsData || []).forEach((f) => {
      if (!_db.formFields.some((field) => field.id === f.id))
        _db.formFields.push(f);
    });
    if (!_db.applications) _db.applications = [];
    (item.appsData || []).forEach((app) => {
      if (!_db.applications.some((a) => a.id === app.id))
        _db.applications.push(app);
    });
  } else if (item.type === "application") {
    if (!_db.applications) _db.applications = [];
    if (!_db.applications.some((a) => a.id === item.appData.id)) {
      _db.applications.push(item.appData);
    }
    if (!_db.applicationAnswers) _db.applicationAnswers = [];
    (item.answersData || []).forEach((ans) => {
      if (!_db.applicationAnswers.some((a) => a.id === ans.id)) {
        _db.applicationAnswers.push(ans);
      }
    });
  } else if (item.type === "user") {
    if (!_db.users) _db.users = [];
    if (!_db.users.some((u) => u.id === item.userId)) {
      _db.users.push(item.userData);
    }
    if (!_db.assignments) _db.assignments = [];
    (item.assignmentsData || []).forEach((a) => {
      if (!_db.assignments.some((x) => x.id === a.id)) _db.assignments.push(a);
    });
    if (!_db.notifications) _db.notifications = [];
    (item.notificationsData || []).forEach((n) => {
      if (!_db.notifications.some((x) => x.id === n.id))
        _db.notifications.push(n);
    });
  } else if (item.type === "department") {
    if (!_db.departments) _db.departments = [];
    if (!_db.departments.some((d) => d.id === item.departmentId)) {
      _db.departments.push(item.departmentData);
    }
  } else if (item.type === "guideline") {
    if (!_db.guidelines) _db.guidelines = [];
    if (!_db.guidelines.some((g) => g.id === item.guidelineId)) {
      _db.guidelines.push(item.guidelineData);
    }
  } else if (item.type === "assignment") {
    if (!_db.assignments) _db.assignments = [];
    if (!_db.assignments.some((a) => a.id === item.assignmentId)) {
      _db.assignments.push(item.assignmentData);
    }
  } else if (item.type === "reformArea") {
    if (!_db.reformAreas) _db.reformAreas = [];
    if (!_db.reformAreas.some((r) => r.id === item.reformAreaId)) {
      _db.reformAreas.push(item.reformAreaData);
    }
    if (!_db.formFields) _db.formFields = [];
    (item.fieldsData || []).forEach((f) => {
      if (!_db.formFields.some((x) => x.id === f.id)) _db.formFields.push(f);
    });
    if (!_db.applicationAnswers) _db.applicationAnswers = [];
    (item.answersData || []).forEach((a) => {
      if (!_db.applicationAnswers.some((x) => x.id === a.id))
        _db.applicationAnswers.push(a);
    });
    if (!_db.assignments) _db.assignments = [];
    (item.assignmentsData || []).forEach((a) => {
      if (!_db.assignments.some((x) => x.id === a.id)) _db.assignments.push(a);
    });
  } else if (item.type === "field") {
    if (!_db.formFields) _db.formFields = [];
    if (!_db.formFields.some((f) => f.id === item.fieldId)) {
      _db.formFields.push(item.fieldData);
    }
    if (!_db.applicationAnswers) _db.applicationAnswers = [];
    (item.answersData || []).forEach((a) => {
      if (!_db.applicationAnswers.some((x) => x.id === a.id))
        _db.applicationAnswers.push(a);
    });
    if (!_db.assignments) _db.assignments = [];
    (item.assignmentsData || []).forEach((a) => {
      if (!_db.assignments.some((x) => x.id === a.id)) _db.assignments.push(a);
    });
  } else {
    const answer = (_db.applicationAnswers || []).find(
      (a) => a.applicationId === item.appId && a.fieldId === item.fieldId,
    );
    if (answer) {
      answer.files = answer.files || [];
      if (!answer.files.some((f) => f.name === item.name)) {
        answer.files.push({
          docId: "doc_" + Date.now(),
          name: item.name,
          size: item.size,
          type: item.type,
          fileStatus: "Pending",
          fileRejectionReason: "",
          uploadedAt: new Date().toISOString(),
          dataUrl: item.dataUrl,
        });
      }
    } else {
      _db.applicationAnswers = _db.applicationAnswers || [];
      _db.applicationAnswers.push({
        id: "ans_" + Date.now(),
        applicationId: item.appId,
        fieldId: item.fieldId,
        value: "",
        files: [
          {
            docId: "doc_" + Date.now(),
            name: item.name,
            size: item.size,
            type: item.type,
            fileStatus: "Pending",
            fileRejectionReason: "",
            uploadedAt: new Date().toISOString(),
            dataUrl: item.dataUrl,
          },
        ],
      });
    }
  }

  let restoredBy = "admin";
  try {
    const sessionRaw = sessionStorage.getItem("srf_session_v2");
    if (sessionRaw) {
      const u = JSON.parse(sessionRaw);
      if (u && u.username) restoredBy = u.username;
    }
  } catch (e) {}
  addAuditLog(
    restoredBy,
    `Restored item from Recycle Bin: ${item.name} (${item.type})`,
    item.type,
    item.id,
    `Restored At: ${new Date().toISOString()}`,
  );

  _db.recycleBin.splice(idx, 1);
  _save();
  return true;
}

export function deleteFromRecycleBin(id) {
  if (!_db.recycleBin) _db.recycleBin = [];
  const idx = _db.recycleBin.findIndex((x) => x.id === id);
  if (idx !== -1) {
    const item = _db.recycleBin[idx];
    let deletedBy = "admin";
    try {
      const sessionRaw = sessionStorage.getItem("srf_session_v2");
      if (sessionRaw) {
        const u = JSON.parse(sessionRaw);
        if (u && u.username) deletedBy = u.username;
      }
    } catch (e) {}
    addAuditLog(
      deletedBy,
      `Permanently deleted item from Recycle Bin: ${item.name} (${item.type})`,
      item.type,
      item.id,
      `Permanently Deleted At: ${new Date().toISOString()}`,
    );

    _db.recycleBin.splice(idx, 1);
    _save();
    return true;
  }
  return false;
}

// ─── REVIEW ASSIGNMENT & LOCKING HELPERS ────────────────────────────────────

export function assignApplicationReviewer(appId, reviewerId, assignedBy) {
  const app = getApplicationById(appId);
  if (app) {
    app.assignedReviewer = reviewerId;
    app.assignedDate = new Date().toISOString();

    const revUser = getUserById(reviewerId);
    const revName = revUser ? revUser.name || revUser.username : reviewerId;

    app.timeline = app.timeline || [];
    app.timeline.push({
      id: `tl_assign_${Date.now()}`,
      action: "Application Assigned",
      details: `Assigned to reviewer ${revName}`,
      userId: assignedBy,
      timestamp: new Date().toISOString(),
    });

    addNotification(
      reviewerId,
      "APPLICATION_ASSIGNED",
      `Application ${app.id} has been manually assigned to you.`,
      app.id,
    );
    _save();
    return true;
  }
  return false;
}

export function removeApplicationReviewer(appId, removedBy) {
  const app = getApplicationById(appId);
  if (app) {
    const oldReviewer = app.assignedReviewer;
    app.assignedReviewer = null;
    app.assignedDate = null;

    app.timeline = app.timeline || [];
    app.timeline.push({
      id: `tl_remove_assign_${Date.now()}`,
      action: "Reviewer Removed",
      details: `Assigned reviewer removed`,
      userId: removedBy,
      timestamp: new Date().toISOString(),
    });

    if (oldReviewer) {
      addNotification(
        oldReviewer,
        "APPLICATION_ASSIGNED",
        `You have been unassigned from Application ${app.id}.`,
        app.id,
      );
    }
    _save();
    return true;
  }
  return false;
}

export function autoAssignApplicationReviewer(appId) {
  const app = getApplicationById(appId);
  if (!app) return false;

  const admins = (_db.users || []).filter(
    (u) => u.role === "admin" || u.role === "reviewer",
  );
  if (admins.length === 0) return false;

  const workloads = {};
  admins.forEach((adm) => {
    workloads[adm.id] = 0;
  });
  (_db.applications || []).forEach((a) => {
    if (
      a.assignedReviewer &&
      a.status !== "Draft" &&
      a.status !== "Approved" &&
      a.status !== "Rejected"
    ) {
      if (workloads[a.assignedReviewer] !== undefined) {
        workloads[a.assignedReviewer]++;
      }
    }
  });

  let leastReviewer = admins[0].id;
  let leastWorkload = workloads[leastReviewer];
  admins.forEach((adm) => {
    if (workloads[adm.id] < leastWorkload) {
      leastReviewer = adm.id;
      leastWorkload = workloads[adm.id];
    }
  });

  app.assignedReviewer = leastReviewer;
  app.assignedDate = new Date().toISOString();

  const revUser = admins.find((u) => u.id === leastReviewer);
  const revName = revUser ? revUser.name || revUser.username : leastReviewer;

  app.timeline = app.timeline || [];
  app.timeline.push({
    id: `tl_auto_assign_${Date.now()}`,
    action: "Application Assigned",
    details: `Automatically assigned reviewer ${revName} based on workload`,
    userId: "system",
    timestamp: new Date().toISOString(),
  });

  addNotification(
    leastReviewer,
    "APPLICATION_ASSIGNED",
    `Application ${app.id} has been automatically assigned to you.`,
    app.id,
  );
  _save();
  return true;
}

export function lockApplication(appId, reviewerId) {
  const app = getApplicationById(appId);
  if (app) {
    app.reviewLockedBy = reviewerId;
    app.reviewLockedAt = new Date().toISOString();
    _save();
    return true;
  }
  return false;
}

export function unlockApplication(appId) {
  const app = getApplicationById(appId);
  if (app) {
    app.reviewLockedBy = null;
    app.reviewLockedAt = null;
    _save();
    return true;
  }
  return false;
}

export function savePrivateReviewerNotes(appId, notes) {
  const app = getApplicationById(appId);
  if (app) {
    app.reviewerNotes = notes;
    _save();
    return true;
  }
  return false;
}

export function escalateApplicationReview(appId, escalationDetails) {
  const app = getApplicationById(appId);
  if (app) {
    app.isEscalated = true;
    app.escalationDetails = escalationDetails;

    app.timeline = app.timeline || [];
    app.timeline.push({
      id: `tl_escalate_${Date.now()}`,
      action: "Review Escalated",
      details: `Escalated to: ${escalationDetails.assignedTo}. Reason: ${escalationDetails.reason}`,
      userId: escalationDetails.escalatedBy,
      timestamp: new Date().toISOString(),
    });

    addNotification(
      escalationDetails.assignedTo,
      "REVIEW_ESCALATED",
      `Application ${app.id} has been escalated to you by ${escalationDetails.escalatedBy}.`,
      app.id,
    );
    _save();
    return true;
  }
  return false;
}

export function validateApplicationAssignmentLink(userId, editionId) {
  // Check if there are assignments for this userId and editionId
  const userAssignments = (_db.assignments || []).filter(
    (a) => a.userId === userId && a.editionId === editionId,
  );
  const app = (_db.applications || []).find(
    (a) =>
      a.userId === userId &&
      a.editionId === editionId &&
      a.status !== "Rejected",
  );

  if (userAssignments.length > 0 && !app) {
    // Missing application placeholder! Create it.
    console.warn(
      `[Integrity Repair] Found assignments for user ${userId} on edition ${editionId} but no application draft. Creating application draft.`,
    );
    const user = getUserById(userId);
    const newApp = createApplication(
      userId,
      editionId,
      user?.category || "",
      "",
    );
    addAuditLog(
      "system",
      `Auto-repaired missing application draft for user ${userId} on edition ${editionId}`,
      "integrity",
      newApp.id,
    );
  }
}

export function runDatabaseIntegrityCheck() {
  if (!_db) return { valid: false, errors: ["Database not loaded"] };

  const errors = [];
  const editionsSet = new Set((_db.editions || []).map((e) => e.id));
  const usersSet = new Set((_db.users || []).map((u) => u.id));

  (_db.applications || []).forEach((app) => {
    if (!editionsSet.has(app.editionId)) {
      errors.push(
        `Application ${app.id} references non-existent edition ${app.editionId}`,
      );
    }
    if (!usersSet.has(app.userId)) {
      errors.push(
        `Application ${app.id} references non-existent user ${app.userId}`,
      );
    }
  });

  (_db.assignments || []).forEach((assign) => {
    if (!editionsSet.has(assign.editionId)) {
      errors.push(
        `Assignment ${assign.id} references non-existent edition ${assign.editionId}`,
      );
    }
    if (!usersSet.has(assign.userId)) {
      errors.push(
        `Assignment ${assign.id} references non-existent user ${assign.userId}`,
      );
    }
  });

  if (errors.length > 0) {
    console.error(`[Integrity Audit] Violations found:`, errors);
    addAuditLog(
      "system",
      `Database Integrity Audit failed: ${errors.length} errors found.`,
      "integrity_audit",
      "system",
    );
  } else {
    console.log("[Integrity Audit] Database matches all constraints.");
  }

  try {
    window.lastAuditErrorsCount = errors.length;
  } catch (e) {}

  return { valid: errors.length === 0, errors };
}

export function repairDataIntegrity() {
  if (!_db) return;
  console.log(
    "[Integrity Repair] Starting database integrity check & repair...",
  );

  let stats = {
    assignmentsRepaired: 0,
    applicationsRepaired: 0,
    reviewersAssigned: 0,
    scoresCorrected: 0,
    answersReset: 0,
  };

  const editionsSet = new Set((_db.editions || []).map((e) => e.id));
  const usersSet = new Set((_db.users || []).map((u) => u.id));

  // Remove applications referencing non-existent user or edition
  const origAppsCount = (_db.applications || []).length;
  _db.applications = (_db.applications || []).filter((app) => {
    const valid = editionsSet.has(app.editionId) && usersSet.has(app.userId);
    if (!valid) {
      _db.applicationAnswers = (_db.applicationAnswers || []).filter(
        (ans) => ans.applicationId !== app.id,
      );
    }
    return valid;
  });
  stats.applicationsRepaired += origAppsCount - _db.applications.length;

  // Remove assignments referencing non-existent user or edition
  const origAssignsCount = (_db.assignments || []).length;
  _db.assignments = (_db.assignments || []).filter((assign) => {
    return editionsSet.has(assign.editionId) && usersSet.has(assign.userId);
  });
  stats.assignmentsRepaired += origAssignsCount - _db.assignments.length;

  const activeUsers = (_db.users || []).filter(
    (u) => u.role === "user" && u.active !== false,
  );
  const publishedEditions = (_db.editions || []).filter(
    (e) => e.status === "published" && !e.isDeleted,
  );

  // 1. Repair published editions missing applications
  publishedEditions.forEach((ed) => {
    activeUsers.forEach((user) => {
      // Validate application draft placeholder
      const existingApp = (_db.applications || []).find(
        (a) =>
          a.userId === user.id &&
          a.editionId === ed.id &&
          a.status !== "Rejected",
      );
      if (!existingApp) {
        const newApp = {
          id:
            "APP_" +
            Date.now() +
            "_" +
            Math.random().toString(36).substr(2, 5).toUpperCase(),
          editionId: ed.id,
          userId: user.id,
          state: user.state || "",
          organization: user.organization || "",
          category: user.category || "",
          duration: "",
          status: "Draft",
          score: 0,
          submittedAt: null,
          updatedAt: new Date().toISOString(),
          rejectionReason: "",
          additionalDocsNote: "",
          reviewerComments: "",
          timeline: [
            {
              action: "Application created via system repair",
              timestamp: new Date().toISOString(),
              by: "system_repair",
            },
          ],
          comments: [],
          reformAreaStatuses: {},
          statusHistory: [
            {
              status: "Draft",
              timestamp: new Date().toISOString(),
              by: "system_repair",
            },
          ],
          submissions: [],
        };
        _db.applications.push(newApp);
        stats.applicationsRepaired++;
      }
    });
  });

  // 2. Validate assignments matching applications
  (_db.assignments || []).forEach((assign) => {
    const existingApp = (_db.applications || []).find(
      (a) =>
        a.userId === assign.userId &&
        a.editionId === assign.editionId &&
        a.status !== "Rejected",
    );
    if (!existingApp) {
      // Create missing application placeholder
      const user = getUserById(assign.userId);
      if (user) {
        const newApp = {
          id:
            "APP_" +
            Date.now() +
            "_" +
            Math.random().toString(36).substr(2, 5).toUpperCase(),
          editionId: assign.editionId,
          userId: assign.userId,
          state: user.state || "",
          organization: user.organization || "",
          category: user.category || "",
          duration: "",
          status: "Draft",
          score: 0,
          submittedAt: null,
          updatedAt: new Date().toISOString(),
          rejectionReason: "",
          additionalDocsNote: "",
          reviewerComments: "",
          timeline: [
            {
              action:
                "Application created via system repair (missing assignment link)",
              timestamp: new Date().toISOString(),
              by: "system_repair",
            },
          ],
          comments: [],
          reformAreaStatuses: {},
          statusHistory: [
            {
              status: "Draft",
              timestamp: new Date().toISOString(),
              by: "system_repair",
            },
          ],
          submissions: [],
        };
        _db.applications.push(newApp);
        stats.applicationsRepaired++;
      }
    }
  });

  // 3. Repair application details
  (_db.applications || []).forEach((app) => {
    let appChanged = false;

    // Check visibility flags
    if (app.status !== "Draft") {
      if (!app.reviewQueue || !app.visibleToAdmin || !app.visibleToSuperAdmin) {
        app.reviewQueue = true;
        app.visibleToAdmin = true;
        app.visibleToSuperAdmin = true;
        appChanged = true;
      }
    }
    // Auto-assign reviewer if submitted but missing
    if (
      ["Submitted", "Under Review", "Resubmitted"].includes(app.status) &&
      !app.assignedReviewer
    ) {
      const admins = (_db.users || []).filter(
        (u) => u.role === "admin" || u.role === "reviewer",
      );
      if (admins.length > 0) {
        const workloads = {};
        admins.forEach((adm) => {
          workloads[adm.id] = 0;
        });
        (_db.applications || []).forEach((a) => {
          if (
            a.assignedReviewer &&
            ["Submitted", "Under Review", "Resubmitted"].includes(a.status)
          ) {
            if (workloads[a.assignedReviewer] !== undefined) {
              workloads[a.assignedReviewer]++;
            }
          }
        });
        let leastReviewer = admins[0].id;
        let leastWorkload = workloads[leastReviewer];
        admins.forEach((adm) => {
          if (workloads[adm.id] < leastWorkload) {
            leastReviewer = adm.id;
            leastWorkload = workloads[adm.id];
          }
        });

        // Delegation Check
        const selectedReviewerUser = admins.find((u) => u.id === leastReviewer);
        if (
          selectedReviewerUser &&
          selectedReviewerUser.delegationActive &&
          selectedReviewerUser.delegatedTo
        ) {
          const delegateUser = (_db.users || []).find(
            (u) =>
              u.id === selectedReviewerUser.delegatedTo ||
              u.username === selectedReviewerUser.delegatedTo,
          );
          if (
            delegateUser &&
            delegateUser.active !== false &&
            ["admin", "superadmin", "reviewer"].includes(delegateUser.role)
          ) {
            console.log(
              `[Delegation] Re-routing auto-assigned application ${app.id} from ${selectedReviewerUser.username} to backup reviewer ${delegateUser.username}`,
            );
            leastReviewer = delegateUser.id;
          }
        }

        app.assignedReviewer = leastReviewer;
        app.assignedDate = new Date().toISOString();
        appChanged = true;
        stats.reviewersAssigned++;
      }
    }
    // Correct question scores and status
    const answers = getAnswersByApplication(app.id);
    const fields = getFieldsByEdition(app.editionId);

    answers.forEach((ans) => {
      const field = fields.find((f) => f.id === ans.fieldId);
      if (!field || field.isLayoutElement) return;

      const isValid = isAnswerNormalizerValid(ans, field);

      // Force score = 0 if invalid
      if (!isValid) {
        if (ans.questionScore !== 0) {
          ans.questionScore = 0;
          appChanged = true;
        }
        // Block approval: if it was approved, reset it to Draft or Submitted
        if (ans.questionStatus === "Approved") {
          ans.questionStatus = "Draft";
          appChanged = true;
          stats.answersReset++;
        }
      } else {
        // If approved, ensure it has full marks
        if (ans.questionStatus === "Approved") {
          const maxMarks = field.maxScore || field.weight || 1;
          if (ans.questionScore !== maxMarks) {
            ans.questionScore = maxMarks;
            appChanged = true;
          }
        }
      }

      // If rejected, ensure it has 0 marks
      if (ans.questionStatus === "Rejected" && ans.questionScore !== 0) {
        ans.questionScore = 0;
        appChanged = true;
      }
    });

    // Recalculate application score
    const correctScore = calculateApplicationScore(app.id);
    if (app.score !== correctScore) {
      app.score = correctScore;
      appChanged = true;
      stats.scoresCorrected++;
    }

    if (appChanged) {
      app.updatedAt = new Date().toISOString();
    }
  });

  console.log("[Integrity Repair] Complete. Stats:", stats);
  if (
    stats.assignmentsRepaired > 0 ||
    stats.applicationsRepaired > 0 ||
    stats.reviewersAssigned > 0 ||
    stats.scoresCorrected > 0 ||
    stats.answersReset > 0
  ) {
    addAuditLog(
      "system",
      `Database Integrity Repair executed: ${JSON.stringify(stats)}`,
      "integrity",
      "system",
    );
    _save();
  }

  // Store stats in window so diagnostics panel can display them
  try {
    window.lastRepairStats = stats;
  } catch (e) {}
}

// ─── Startup Score Repair ────────────────────────────────────────
// Zeroes out any marks incorrectly stored on "No"/empty/"Not Answered"
// answers and recalculates all application scores from scratch.
function recalculateExistingApplications() {
  if (!_db || !_db.applications) return;
  let changed = false;
  const fields = _db.formFields || [];
  (_db.applicationAnswers || []).forEach((ans) => {
    const field = fields.find((f) => f.id === ans.fieldId);
    if (!field) return;
    // If the stored score is > 0 but the answer is not scorable, zero it out
    if (ans.questionScore > 0 && !isScorableAnswer(ans, field)) {
      console.warn(
        "[Store] Repair: zeroing phantom score for answer",
        ans.fieldId,
        "value:",
        ans.value,
      );
      ans.questionScore = 0;
      changed = true;
    }
  });
  // Recalculate overall application scores
  (_db.applications || []).forEach((app) => {
    const newScore = calculateApplicationScore(app.id);
    if (app.score !== newScore) {
      app.score = newScore;
      changed = true;
    }
  });
  if (changed) {
    console.log("[Store] Score repair complete. Persisting fixes.");
    _save();
  }
}

export async function getActiveLocks() {
  try {
    const sessionRaw = sessionStorage.getItem("srf_session_v2");
    const sess = sessionRaw ? JSON.parse(sessionRaw) : {};
    const res = await fetch("/api/applications/locks/active", {
      headers: {
        "X-User-Id": sess.id || "",
        "X-User-Role": sess.role || "",
      },
    });
    return res.json();
  } catch (e) {
    console.error("Error fetching active locks:", e);
    return [];
  }
}

export async function getLockStatus(appId) {
  try {
    const sessionRaw = sessionStorage.getItem("srf_session_v2");
    const sess = sessionRaw ? JSON.parse(sessionRaw) : {};
    const res = await fetch(`/api/applications/${appId}/lock`, {
      headers: {
        "X-User-Id": sess.id || "",
        "X-User-Role": sess.role || "",
      },
    });
    return res.json();
  } catch (e) {
    console.error("Error fetching lock status:", e);
    return { locked: false };
  }
}

export async function acquireLock(appId, reason = "") {
  try {
    const sessionRaw = sessionStorage.getItem("srf_session_v2");
    const sess = sessionRaw ? JSON.parse(sessionRaw) : {};
    const res = await fetch(`/api/applications/${appId}/lock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": sess.id || "",
        "X-User-Role": sess.role || "",
      },
      body: JSON.stringify({ reason }),
    });
    return res.json();
  } catch (e) {
    console.error("Error acquiring lock:", e);
    return { success: false };
  }
}

export async function releaseLock(appId, force = false, forceReason = "") {
  try {
    const sessionRaw = sessionStorage.getItem("srf_session_v2");
    const sess = sessionRaw ? JSON.parse(sessionRaw) : {};
    const res = await fetch(`/api/applications/${appId}/unlock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": sess.id || "",
        "X-User-Role": sess.role || "",
      },
      body: JSON.stringify({ force, forceReason }),
    });
    return res.json();
  } catch (e) {
    console.error("Error releasing lock:", e);
    return { success: false };
  }
}

export async function getApplicationVersions(appId) {
  try {
    const sessionRaw = sessionStorage.getItem("srf_session_v2");
    const sess = sessionRaw ? JSON.parse(sessionRaw) : {};
    const res = await fetch(`/api/applications/${appId}/versions`, {
      headers: {
        "X-User-Id": sess.id || "",
        "X-User-Role": sess.role || "",
      },
    });
    return res.json();
  } catch (e) {
    console.error("Error fetching versions:", e);
    return [];
  }
}

export async function createApplicationVersion(appId, changeSummary = "") {
  try {
    const sessionRaw = sessionStorage.getItem("srf_session_v2");
    const sess = sessionRaw ? JSON.parse(sessionRaw) : {};
    const res = await fetch(`/api/applications/${appId}/versions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": sess.id || "",
        "X-User-Role": sess.role || "",
      },
      body: JSON.stringify({ changeSummary }),
    });
    return res.json();
  } catch (e) {
    console.error("Error creating version:", e);
    return { success: false };
  }
}

export async function getApplicationVersionDetails(appId, versionNum) {
  try {
    const sessionRaw = sessionStorage.getItem("srf_session_v2");
    const sess = sessionRaw ? JSON.parse(sessionRaw) : {};
    const res = await fetch(
      `/api/applications/${appId}/versions/${versionNum}`,
      {
        headers: {
          "X-User-Id": sess.id || "",
          "X-User-Role": sess.role || "",
        },
      },
    );
    return res.json();
  } catch (e) {
    console.error("Error fetching version details:", e);
    return null;
  }
}

export async function getSLASettings() {
  try {
    const sessionRaw = sessionStorage.getItem("srf_session_v2");
    const sess = sessionRaw ? JSON.parse(sessionRaw) : {};
    const res = await fetch("/api/sla-settings", {
      headers: {
        "X-User-Id": sess.id || "",
        "X-User-Role": sess.role || "",
      },
    });
    return res.json();
  } catch (e) {
    console.error("Error fetching SLA settings:", e);
    return {
      submissionDays: 15,
      reviewDays: 5,
      approvalDays: 5,
      escalationDays: 3,
      reminderFrequency: 2,
    };
  }
}

export async function saveSLASettings(data) {
  try {
    const sessionRaw = sessionStorage.getItem("srf_session_v2");
    const sess = sessionRaw ? JSON.parse(sessionRaw) : {};
    const res = await fetch("/api/sla-settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": sess.id || "",
        "X-User-Role": sess.role || "",
      },
      body: JSON.stringify(data),
    });
    return res.json();
  } catch (e) {
    console.error("Error saving SLA settings:", e);
    return { success: false };
  }
}

export async function getReviewerWorkload() {
  try {
    const sessionRaw = sessionStorage.getItem("srf_session_v2");
    const sess = sessionRaw ? JSON.parse(sessionRaw) : {};
    const res = await fetch("/api/reviewer-workload", {
      headers: {
        "X-User-Id": sess.id || "",
        "X-User-Role": sess.role || "",
      },
    });
    return res.json();
  } catch (e) {
    console.error("Error fetching workloads:", e);
    return [];
  }
}

export async function rebalanceWorkload(sourceReviewerId, targetReviewerId) {
  try {
    const sessionRaw = sessionStorage.getItem("srf_session_v2");
    const sess = sessionRaw ? JSON.parse(sessionRaw) : {};
    const res = await fetch("/api/reviewer-workload/rebalance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": sess.id || "",
        "X-User-Role": sess.role || "",
      },
      body: JSON.stringify({ sourceReviewerId, targetReviewerId }),
    });
    return res.json();
  } catch (e) {
    console.error("Error rebalancing workload:", e);
    return { success: false };
  }
}

export async function getBackups() {
  try {
    const sessionRaw = sessionStorage.getItem("srf_session_v2");
    const sess = sessionRaw ? JSON.parse(sessionRaw) : {};
    const res = await fetch("/api/backups", {
      headers: {
        "X-User-Id": sess.id || "",
        "X-User-Role": sess.role || "",
      },
    });
    return res.json();
  } catch (e) {
    console.error("Error fetching backups:", e);
    return [];
  }
}

export async function createBackup() {
  try {
    const sessionRaw = sessionStorage.getItem("srf_session_v2");
    const sess = sessionRaw ? JSON.parse(sessionRaw) : {};
    const res = await fetch("/api/backups", {
      method: "POST",
      headers: {
        "X-User-Id": sess.id || "",
        "X-User-Role": sess.role || "",
      },
    });
    return res.json();
  } catch (e) {
    console.error("Error creating backup:", e);
    return { success: false };
  }
}

export async function restoreBackup(id) {
  try {
    const sessionRaw = sessionStorage.getItem("srf_session_v2");
    const sess = sessionRaw ? JSON.parse(sessionRaw) : {};
    const res = await fetch(`/api/backups/${id}/restore`, {
      method: "POST",
      headers: {
        "X-User-Id": sess.id || "",
        "X-User-Role": sess.role || "",
      },
    });
    return res.json();
  } catch (e) {
    console.error("Error restoring backup:", e);
    return { success: false };
  }
}

export async function getDataQualityReport() {
  try {
    const sessionRaw = sessionStorage.getItem("srf_session_v2");
    const sess = sessionRaw ? JSON.parse(sessionRaw) : {};
    const res = await fetch("/api/data-quality-report", {
      headers: {
        "X-User-Id": sess.id || "",
        "X-User-Role": sess.role || "",
      },
    });
    return res.json();
  } catch (e) {
    console.error("Error fetching data quality report:", e);
    return { success: false, errors: [] };
  }
}
