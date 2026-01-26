import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schama",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.PG_URL!,
  },
});