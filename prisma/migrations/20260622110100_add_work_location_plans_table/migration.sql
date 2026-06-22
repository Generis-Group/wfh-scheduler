ALTER TABLE "PendingSignup"
ADD COLUMN "departmentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "PlannedWorkLocation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "workLocation" "WorkLocation" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannedWorkLocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlannedWorkLocation_userId_workDate_key" ON "PlannedWorkLocation"("userId", "workDate");
CREATE INDEX "PlannedWorkLocation_workDate_idx" ON "PlannedWorkLocation"("workDate");

ALTER TABLE "PlannedWorkLocation"
ADD CONSTRAINT "PlannedWorkLocation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlannedWorkLocation"
ADD CONSTRAINT "PlannedWorkLocation_workLocation_check"
CHECK ("workLocation" IN (
  'OFFICE',
  'WFH',
  'OFFICE_AM_WFH_PM',
  'WFH_AM_OFFICE_PM',
  'PTO',
  'OUT_OF_OFFICE'
));

INSERT INTO "Department" ("id", "name", "slug", "updatedAt")
VALUES ('dept-it', 'IT', 'it', CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "UserDepartment" ("id", "userId", "departmentId", "role")
SELECT
  CONCAT('ud-it-', u."id"),
  u."id",
  d."id",
  'EMPLOYEE'::"UserRole"
FROM "User" u
CROSS JOIN "Department" d
WHERE d."slug" = 'it'
  AND u."status" <> 'DISABLED'
  AND NOT EXISTS (
    SELECT 1
    FROM "UserDepartment" ud
    WHERE ud."userId" = u."id"
  )
ON CONFLICT ("userId", "departmentId", "role") DO NOTHING;
