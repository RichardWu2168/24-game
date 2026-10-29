import "dotenv/config";
import { defineConfig } from "prisma/config";
import process from "node:process";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // CLI/schema operations deliberately use the direct URL, not the runtime pooler.
    url: process.env.DATABASE_URL,
  },
});
