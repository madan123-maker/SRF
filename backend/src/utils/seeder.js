import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import { SRF_6_SEED } from '../../../frontend/src/db/srf6Seed.js';

export async function seedDatabase() {
  const deptCount = await prisma.department.count();
  if (deptCount === 0) {
    const defaultDepts = [
      { id: 'dept_1', name: 'Department of Industries & Commerce', code: 'IND', description: 'Nodal department for industrial policy and startup encouragement.', createdAt: new Date().toISOString() },
      { id: 'dept_2', name: 'Department of Information Technology', code: 'IT', description: 'IT infrastructure, policies, and tech startup initiatives.', createdAt: new Date().toISOString() },
      { id: 'dept_3', name: 'Department of Science & Technology', code: 'SNT', description: 'Promoting R&D, innovation, and scientific research.', createdAt: new Date().toISOString() },
      { id: 'dept_4', name: 'Department of Finance', code: 'FIN', description: 'Financial allocations, budget, and funding schemes oversight.', createdAt: new Date().toISOString() },
      { id: 'dept_5', name: 'Department of Environment & Forests', code: 'ENV', description: 'Environmental clearances and green startup promotions.', createdAt: new Date().toISOString() }
    ];
    await prisma.department.createMany({ data: defaultDepts });
    console.log(`[Seed] Seeded ${defaultDepts.length} default departments.`);
  }

  const userCount = await prisma.user.count();
  const editionCount = await prisma.edition.count();
  if (userCount > 0 && editionCount > 0) {
    console.log('[Seed] Database already has users and editions. Skipping seed.');
    return;
  }

  console.log('[Seed] Database is empty. Running initial seed...');

  // 1. Seed default users
  if (userCount === 0) {
    const defaultUsers = buildDefaultUsers();

    if (defaultUsers[0]) {
      defaultUsers[0].username = process.env.SUPERADMIN_USERNAME || 'superadmin';
      defaultUsers[0].password = process.env.SUPERADMIN_PASSWORD;
    }
    if (defaultUsers[1]) {
      defaultUsers[1].username = process.env.ADMIN_USERNAME || 'admin';
      defaultUsers[1].password = process.env.ADMIN_PASSWORD;
    }
    const validUsers = defaultUsers.filter(u => u.password);
    for (const u of validUsers) {
      await prisma.user.create({ data: u });
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
  await prisma.settings.create({ data: { id: 'global', data: defaultSettings } });
  console.log('[Seed] Seeded default settings.');

  // 3. Seed default edition (SRF 6.0)
  // await Edition.create(DEFAULT_SRF_6_EDITION);
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
  const formattedReformAreas = seededReformAreas.map(r => ({ id: r.id, data: r }));
  const formattedFormFields = seededFormFields.map(f => ({ id: f.id, data: f }));

  if (formattedReformAreas.length > 0) {
    await prisma.reformArea.createMany({ data: formattedReformAreas, skipDuplicates: true });
  }
  if (formattedFormFields.length > 0) {
    await prisma.formField.createMany({ data: formattedFormFields, skipDuplicates: true });
  }

  console.log(`[Seed] Seeded ${seededReformAreas.length} reform areas and ${seededFormFields.length} fields.`);
  console.log('[Seed] Database seeding completed successfully.');
}

