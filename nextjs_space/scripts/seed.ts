import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Seed test account
  const hashedPassword = await bcrypt.hash('Y6*iEIIkzn', 12);
  const testUser = await prisma.user.upsert({
    where: { email: 'abacus-c2e7d02a@example.com' },
    update: {},
    create: {
      email: 'abacus-c2e7d02a@example.com',
      name: 'Test Admin',
      hashedPassword,
    },
  });

  // Create a test company for the test user
  let company = await prisma.company.findFirst({
    where: { members: { some: { userId: testUser.id } } },
  });

  if (!company) {
    company = await prisma.company.create({
      data: {
        name: 'Demo Company',
        country: 'US',
        defaultCurrency: 'USD',
        businessType: 'LLC',
        members: { create: { userId: testUser.id, role: 'owner' } },
      },
    });

    // Create default categories
    const defaultCategories = [
      { name: 'Services', type: 'income', color: '#7C3AED' },
      { name: 'Products', type: 'income', color: '#2563EB' },
      { name: 'Consulting', type: 'income', color: '#059669' },
      { name: 'Other Income', type: 'income', color: '#6B7280' },
      { name: 'Office Supplies', type: 'expense', color: '#EF4444' },
      { name: 'Rent', type: 'expense', color: '#F59E0B' },
      { name: 'Utilities', type: 'expense', color: '#8B5CF6' },
      { name: 'Software', type: 'expense', color: '#3B82F6' },
      { name: 'Marketing', type: 'expense', color: '#EC4899' },
      { name: 'Travel', type: 'expense', color: '#14B8A6' },
      { name: 'Insurance', type: 'expense', color: '#F97316' },
      { name: 'Other Expense', type: 'expense', color: '#6B7280' },
    ];
    await prisma.category.createMany({
      data: defaultCategories.map((c) => ({ ...c, companyId: company!.id })),
      skipDuplicates: true,
    });
  }

  console.log('Seed completed successfully');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
