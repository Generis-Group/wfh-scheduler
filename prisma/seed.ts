import bcrypt from "bcryptjs";

import { UserRole, UserStatus } from "@prisma/client";

import { prisma } from "../lib/prisma";

async function main() {
  const email = process.env.INITIAL_ADMIN_EMAIL;
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("Skipping seed: INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD are not set.");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: {
      role: UserRole.ADMIN,
      roles: [UserRole.ADMIN],
      status: UserStatus.ACTIVE,
      passwordHash,
      mustChangePassword: true,
      reviewerAllDepartments: true
    },
    create: {
      email,
      name: "Generis Admin",
      role: UserRole.ADMIN,
      roles: [UserRole.ADMIN],
      status: UserStatus.ACTIVE,
      passwordHash,
      mustChangePassword: true,
      reviewerAllDepartments: true
    }
  });

  await prisma.appSetting.upsert({
    where: { key: "company" },
    update: {},
    create: {
      key: "company",
      value: {
        jiraProjectKeys: []
      }
    }
  });

  console.log(`Seeded admin user ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
