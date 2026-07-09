const fs = require('fs');
let c = fs.readFileSync('src/routes/index.js', 'utf8');

c = c.replace(/await ([a-zA-Z0-9_]+)\.findOne\(\{([^}]+)\}\);?/g, (m, model, args) => {
    let lowerModel = model.charAt(0).toLowerCase() + model.slice(1);
    return `await prisma.${lowerModel}.findFirst({ where: {${args}} })`;
});

c = c.replace(/await ([a-zA-Z0-9_]+)\.find\(\{([^}]+)\}\);?/g, (m, model, args) => {
    let lowerModel = model.charAt(0).toLowerCase() + model.slice(1);
    return `await prisma.${lowerModel}.findMany({ where: {${args}} })`;
});

c = c.replace(/await ([a-zA-Z0-9_]+)\.find\(\{\}\);?/g, (m, model) => {
    return `await prisma.${model.charAt(0).toLowerCase() + model.slice(1)}.findMany()`;
});

c = c.replace(/await ([a-zA-Z0-9_]+)\.find\([^)]+\)\.skip[^;]+;/g, (m, model) => {
    return `await prisma.${model.charAt(0).toLowerCase() + model.slice(1)}.findMany({ where: textQuery, skip: skip, take: limit })`;
});

c = c.replace(/await ([a-zA-Z0-9_]+)\.deleteMany\(\{\}\);?/g, (m, model) => {
    return `await prisma.${model.charAt(0).toLowerCase() + model.slice(1)}.deleteMany()`;
});

c = c.replace(/await ([a-zA-Z0-9_]+)\.countDocuments\(\);?/g, (m, model) => {
    return `await prisma.${model.charAt(0).toLowerCase() + model.slice(1)}.count()`;
});

// Manual replacement for complex line 1498 findOneAndUpdate
const findAndUpdateStr = `    const result = await ApplicationAnswer.findOneAndUpdate(
      { applicationId: appId, fieldId },
      { $set: { files, updatedAt: new Date().toISOString() } },
      { upsert: true, returnDocument: 'after' }
    );`;
const prismaUpsertStr = `    let result = await prisma.applicationAnswer.findFirst({ where: { applicationId: appId, fieldId } });
    if (result) {
      result = await prisma.applicationAnswer.update({ where: { id: result.id }, data: { files, updatedAt: new Date().toISOString() } });
    } else {
      result = await prisma.applicationAnswer.create({ data: { id: 'ans_'+Date.now(), applicationId: appId, fieldId, files, updatedAt: new Date().toISOString() } });
    }`;
c = c.replace(findAndUpdateStr, prismaUpsertStr);

// Also line 1515 wait..
c = c.replace(/\.lean\(\)/g, '');

fs.writeFileSync('src/routes/index.js', c);
console.log('Final Mongoose purge completed successfully!');
