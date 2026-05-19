import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts"
  }
});
