import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/pgSchema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.PG_URL!,
  },
});