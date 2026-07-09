const fs = require('fs');
let c = fs.readFileSync('src/routes/index.js', 'utf8');

const regexMappings = [
    {
        find: /const activeUsers = await User\.find\(\{ active: \{ \$ne: false \} \}\);/g,
        replace: "const activeUsers = await prisma.user.findMany({ where: { active: { not: false } } });"
    },
    {
        find: /const users = await User\.find\(\{ active: \{ \$ne: false \} \}\);/g,
        replace: "const users = await prisma.user.findMany({ where: { active: { not: false } } });"
    },
    {
        find: /const userApps = await Application\.find\(\{ userId: req\.user\.id \}, null, options\);/g,
        replace: "const userApps = await prisma.application.findMany({ where: { userId: req.user.id } });"
    },
    {
        find: /const apps = await Application\.find\(\);/g,
        replace: "const apps = await prisma.application.findMany();"
    },
    {
        find: /const users = await User\.find\(\);/g,
        replace: "const users = await prisma.user.findMany();"
    },
    {
        find: /const formFields = await FormField\.find\(\{\s*editionId: ed\.id\s*\}\)/g,
        replace: "const formFields = await prisma.formField.findMany({ where: { editionId: ed.id } })"
    },
    {
        find: /records = await User\.find\(\{ role: \{ \$in: \['admin', 'superadmin'\] \} \}\);/g,
        replace: "records = await prisma.user.findMany({ where: { role: { in: ['admin', 'superadmin'] } } });"
    },
    {
        find: /const evaluators = await User\.find\(\{ role: \{ \$in: \['admin', 'superadmin'\] \} \}\);/g,
        replace: "const evaluators = await prisma.user.findMany({ where: { role: { in: ['admin', 'superadmin'] } } });"
    },
    {
        find: /const existingNotif = await Notification\.findOne\(\{\s*userId: assigneeId,\s*message: notifMessage\s*\}\);/,
        replace: "const existingNotif = await prisma.notification.findFirst({ where: { userId: assigneeId, message: notifMessage } });"
    },
    {
        find: /const user = await User\.findOne\(\{\s*email: new RegExp\('\\^' \+ email \+ '\\$', 'i'\)\s*\}\);/,
        replace: "const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });"
    },
    {
        find: /const versionCount = await ApplicationVersion\.countDocuments\(\{ applicationId: appId \}\);/g,
        replace: "const versionCount = await prisma.applicationVersion.count({ where: { applicationId: appId } });"
    },
    {
        find: /const result = await ApplicationAnswer\.findOneAndUpdate\([\s\S]*?returnDocument: 'after' \}?\s*\);/,
        replace: "let result = await prisma.applicationAnswer.findFirst({ where: { applicationId: appId, fieldId } });\n    if (result) {\n      result = await prisma.applicationAnswer.update({ where: { id: result.id }, data: { files, updatedAt: new Date().toISOString() } });\n    } else {\n      result = await prisma.applicationAnswer.create({ data: { id: 'ans_'+Date.now(), applicationId: appId, fieldId, files, updatedAt: new Date().toISOString() } });\n    }"
    },
    {
        find: /await Application\.findOneAndUpdate\(query, \{ \$set: updateObj \}, \{ upsert: true, returnDocument: 'after', \.\.\.options \}\);/g,
        replace: "const existingApp = await prisma.application.findFirst({ where: query });\n          if (existingApp) {\n            await prisma.application.update({ where: { id: existingApp.id }, data: updateObj });\n          } else {\n             if (!updateObj.id) updateObj.id = 'app_' + Date.now();\n             await prisma.application.create({ data: updateObj });\n          }"
    }
];

regexMappings.forEach(mapping => {
    c = c.replace(mapping.find, mapping.replace);
});

// Remove syncCollection function completely
c = c.replace(/\/\/ Helper to synchronize collection[\s\S]*?\/\/ Helper to upsert RecycleBin items/, '// Helper to upsert RecycleBin items');

fs.writeFileSync('src/routes/index.js', c);
console.log('Sanitization applied to src/routes/index.js');
