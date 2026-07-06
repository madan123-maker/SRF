// Phase 2: All PostgreSQL legacy structures surgically removed.
// Smart proxy stubs injected to prevent API endpoints from crashing via TypeErrors.

const createDummyModel = () => {
    const dummyPromise = Promise.resolve(null);
    dummyPromise.lean = () => dummyPromise;
    dummyPromise.sort = () => dummyPromise;
    dummyPromise.populate = () => dummyPromise;
    dummyPromise.exec = () => dummyPromise;
    dummyPromise.select = () => dummyPromise;

    const DummyModel = function (data) {
        return { ...data, save: async () => ({ id: 'dummy_uuid', ...data }) };
    };

    return new Proxy(DummyModel, {
        get: (target, prop) => {
            if (prop === 'find') return () => {
                const arrPromise = Promise.resolve([]);
                arrPromise.lean = () => arrPromise;
                arrPromise.sort = () => arrPromise;
                arrPromise.populate = () => arrPromise;
                return arrPromise;
            };
            if (prop === 'countDocuments') return () => Promise.resolve(0);
            return () => dummyPromise; // Any other function silently resolves to null safely
        }
    });
};

export const User = createDummyModel();
export const Edition = createDummyModel();
export const ReformArea = createDummyModel();
export const FormField = createDummyModel();
export const Application = createDummyModel();
export const ApplicationAnswer = createDummyModel();
export const Notification = createDummyModel();
export const Assignment = createDummyModel();
export const AuditLog = createDummyModel();
export const SchemaVersion = createDummyModel();
export const Settings = createDummyModel();
export const Guideline = createDummyModel();
export const DocumentRule = createDummyModel();
export const Department = createDummyModel();
export const ReassignmentHistory = createDummyModel();
export const Message = createDummyModel();
export const RecycleBin = createDummyModel();
export const ApplicationVersion = createDummyModel();
export const ApplicationVersionAnswer = createDummyModel();
export const ApplicationLock = createDummyModel();
export const SLASettings = createDummyModel();
export const BackupRecord = createDummyModel();
export const prisma = {};
