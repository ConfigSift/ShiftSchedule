const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const envFiles = [".env", ".env.local"];

function readEnvFile(fileName) {
  try {
    const fullPath = path.join(rootDir, fileName);
    if (!fs.existsSync(fullPath)) {
      return {};
    }

    const contents = fs.readFileSync(fullPath, "utf8");
    const result = {};

    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) {
        continue;
      }

      const key = match[1];
      let value = match[2];

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      result[key] = value;
    }

    return result;
  } catch (error) {
    console.error(`Failed to read ${fileName}:`, error);
    return {};
  }
}

function getEnvValue(key) {
  if (process.env[key]) {
    return process.env[key];
  }

  for (const fileName of envFiles) {
    const values = readEnvFile(fileName);
    if (values[key]) {
      return values[key];
    }
  }

  return "";
}

const databaseUrl = getEnvValue("DATABASE_URL");
const directUrl = getEnvValue("DIRECT_URL");

if (!databaseUrl) {
  console.error(
    [
      "Missing DATABASE_URL for Prisma.",
      "Set DATABASE_URL in .env to your Supabase session pooler connection string.",
      "Use your Supabase Database password (not the anon key).",
    ].join(" ")
  );
  console.error(
    'Example: postgresql://postgres.<project-ref>:<DB_PASSWORD>@aws-1-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require'
  );
  process.exit(1);
}

if (!directUrl) {
  console.warn(
    "DIRECT_URL is not set. Prisma migrations can use DIRECT_URL for a direct (non-pooler) connection."
  );
}
