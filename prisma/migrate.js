const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

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

function loadEnv() {
  for (const fileName of envFiles) {
    const values = readEnvFile(fileName);
    for (const [key, value] of Object.entries(values)) {
      if (!process.env[key] && value) {
        process.env[key] = value;
      }
    }
  }
}

function runPrismaMigrate() {
  const command = process.platform === "win32" ? "prisma.cmd" : "prisma";
  const child = spawn(command, ["migrate", "dev"], {
    stdio: "inherit",
    env: process.env,
    shell: true,
  });

  child.on("exit", (code) => {
    process.exit(code ?? 1);
  });
}

loadEnv();

const databaseUrl = process.env.DATABASE_URL;
const directUrl = process.env.DIRECT_URL;

if (!databaseUrl) {
  console.error(
    [
      "Missing DATABASE_URL for Prisma.",
      "Set DATABASE_URL in .env to your Supabase session pooler connection string.",
      "Use your Supabase Database password (not the anon key).",
    ].join(" ")
  );
  process.exit(1);
}

if (directUrl) {
  console.log("Prisma migrate will use DIRECT_URL via schema directUrl.");
} else {
  console.log("Prisma migrate will use DATABASE_URL (DIRECT_URL not set).");
}

runPrismaMigrate();
