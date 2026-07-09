const fs = require('fs');
let c = fs.readFileSync('src/routes/index.js', 'utf8');

const regexMappings = [
    {
        find: /const existingNotif = await Notification\.findOne\(\{[\s\S]*?userId: user\.id,[\s\S]*?eventType: eventType,[\s\S]*?message: reminderMessage,[\s\S]*?createdAt: \{ \$gte: new Date\(now - 12 \* 60 \* 60 \* 1000\)\.toISOString\(\) \}[\s\S]*?\}\);/,
        replace: `const existingNotif = await prisma.notification.findFirst({\n          where: {\n            userId: user.id,\n            eventType: eventType,\n            message: reminderMessage,\n            createdAt: { gte: new Date(now - 12 * 60 * 60 * 1000).toISOString() }\n          }\n        });`
    },
    {
        find: /const user = await User\.findOne\(\{[\s\S]*?\$or: \[[\s\S]*?\{ username: cleanInput \},[\s\S]*?\{ email: new RegExp\(\`\^\\\$?\{escapeRegExp\(cleanInput\)\}\\\$\`, 'i'\) \}[\s\S]*?\],[\s\S]*?active: \{ \$ne: false \}[\s\S]*?\}\);/,
        replace: `const user = await prisma.user.findFirst({\n      where: {\n        OR: [\n          { username: cleanInput },\n          { email: { equals: cleanInput, mode: 'insensitive' } }\n        ],\n        active: { not: false }\n      }\n    });`
    },
    {
        find: /await User\.updateOne\(\{ _id: user\._id \}, \{ username: newUsername \}\);[\s\S]*?updatedCount\+\+;[\s\S]*?\/\/ Update any FormField assignments that reference this username[\s\S]*?const formFields = await FormField\.find\(\{[\s\S]*?\$or: \[[\s\S]*?\{ 'assignment\.userIds': oldUsername \},[\s\S]*?\{ 'assignment\.users': oldUsername \}[\s\S]*?\][\s\S]*?\}\);[\s\S]*?for \(const field of formFields\) \{[\s\S]*?if \(field\.assignment\) \{[\s\S]*?if \(field\.assignment\.userIds\) \{[\s\S]*?field\.assignment\.userIds = field\.assignment\.userIds\.map\(uid => uid === oldUsername \? newUsername : uid\);[\s\S]*?\}[\s\S]*?if \(field\.assignment\.users\) \{[\s\S]*?field\.assignment\.users = field\.assignment\.users\.map\(uid => uid === oldUsername \? newUsername : uid\);[\s\S]*?\}[\s\S]*?await FormField\.updateOne\(\{ _id: field\._id \}, \{ assignment: field\.assignment \}\);[\s\S]*?\}[\s\S]*?\}/,
        replace: `await prisma.user.update({ where: { id: user.id }, data: { username: newUsername } });\n        updatedCount++;\n\n        // Update any FormField assignments that reference this username\n        const allFormFields = await prisma.formField.findMany();\n        const formFieldsToSync = allFormFields.filter(f => {\n          if (!f.data || !f.data.assignment) return false;\n          const a = f.data.assignment;\n          return (a.userIds && Array.isArray(a.userIds) && a.userIds.includes(oldUsername)) ||\n                 (a.users && Array.isArray(a.users) && a.users.includes(oldUsername));\n        });\n        \n        for (const field of formFieldsToSync) { \n          if (field.data && field.data.assignment) { \n             if (field.data.assignment.userIds) { field.data.assignment.userIds = field.data.assignment.userIds.map(uid => uid === oldUsername ? newUsername : uid); } \n             if (field.data.assignment.users) { field.data.assignment.users = field.data.assignment.users.map(uid => uid === oldUsername ? newUsername : uid); } \n             await prisma.formField.update({ where: { id: field.id }, data: { data: field.data } }); \n          } \n        }`
    }
];

regexMappings.forEach(mapping => {
    c = c.replace(mapping.find, mapping.replace);
});

fs.writeFileSync('src/routes/index.js', c);
console.log('Final 3 deep structures unmapped.');
