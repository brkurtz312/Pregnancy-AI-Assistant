import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

/**
 * Absolute so the config does not depend on the working directory, and
 * forward-slashed because drizzle-kit matches this as a glob. On Windows
 * `path.join` yields backslashes, which a glob reads as escape characters, so
 * the pattern silently matches nothing and the push fails with "No schema
 * files found" pointing at a path that plainly exists.
 */
const schemaPath = path
  .join(__dirname, "src", "schema", "index.ts")
  .replace(/\\/g, "/");

export default defineConfig({
  schema: schemaPath,
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
