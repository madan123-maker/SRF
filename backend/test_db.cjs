const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const eds = await prisma.edition.findMany();
    console.log("ALL EDITIONS IN DB:", eds.map(e => ({ id: e.id, name: e.name, status: e.status, isDeleted: e.isDeleted })));

    const assignments = await prisma.assignment.findMany();
    console.log("ALL ASSIGNMENTS:", assignments.length);

    const users = await prisma.user.findMany();
    console.log("ALL USERS:", users.length);
}

main().catch(console.error).finally(() => prisma.$disconnect());
