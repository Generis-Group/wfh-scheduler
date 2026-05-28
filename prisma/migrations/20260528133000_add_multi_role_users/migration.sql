-- Add additive roles while keeping the legacy primary role mirror.
ALTER TABLE "User" ADD COLUMN "roles" "UserRole"[] NOT NULL DEFAULT ARRAY['EMPLOYEE']::"UserRole"[];

UPDATE "User"
SET "roles" = ARRAY["role"]::"UserRole"[];

-- Make department membership role-scoped so employee and reviewer departments can differ.
ALTER TABLE "UserDepartment" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'EMPLOYEE';

UPDATE "UserDepartment" AS ud
SET "role" = CASE
  WHEN u."role" = 'REVIEWER' THEN 'REVIEWER'::"UserRole"
  ELSE 'EMPLOYEE'::"UserRole"
END
FROM "User" AS u
WHERE ud."userId" = u."id";

DROP INDEX "UserDepartment_userId_departmentId_key";
CREATE UNIQUE INDEX "UserDepartment_userId_departmentId_role_key" ON "UserDepartment"("userId", "departmentId", "role");
CREATE INDEX "UserDepartment_role_departmentId_idx" ON "UserDepartment"("role", "departmentId");
