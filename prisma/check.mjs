import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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

function maskPassword(url) {
  if (!url.password) {
    return "";
  }

  return "*".repeat(Math.max(4, url.password.length));
}

function printParsed(label, value) {
  if (!value) {
    console.log(`${label}: (not set)`);
    return null;
  }

  try {
    const url = new URL(value);
    const masked = maskPassword(url);
    console.log(`${label}:`);
    console.log(`  host: ${url.hostname}`);
    console.log(`  port: ${url.port || "5432"}`);
    console.log(`  user: ${url.username || "(missing)"}`);
    console.log(`  db: ${url.pathname.replace(/^\//, "") || "(missing)"}`);
    console.log(`  password: ${masked || "(missing)"}`);
    return url;
  } catch {
    console.error(`${label}: invalid URL`);
    return null;
  }
}

function testTcp(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => {
      socket.end();
      resolve({ ok: true });
    });

    socket.setTimeout(5000);

    socket.on("error", (error) => {
      resolve({ ok: false, error });
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, error: new Error("Connection timed out") });
    });
  });
}

async function main() {
  const databaseUrl = getEnvValue("DATABASE_URL");
  const directUrl = getEnvValue("DIRECT_URL");

  const dbParsed = printParsed("DATABASE_URL", databaseUrl);
  const directParsed = printParsed("DIRECT_URL", directUrl);

  if (!dbParsed && !directParsed) {
    console.log(
      "No valid URLs found. Set DATABASE_URL (and optionally DIRECT_URL) in .env or .env.local."
    );
    process.exit(1);
  }

  if (dbParsed) {
    const port = Number(dbParsed.port || 5432);
    console.log("TCP check: DATABASE_URL");
    const result = await testTcp(dbParsed.hostname, port);
    if (result.ok) {
      console.log("  Success: TCP connection established.");
    } else {
      console.log(`  Failure: ${result.error?.message || "Unknown error"}`);
      console.log(
        [
          "  Likely causes:",
          "wrong host/port, DNS issues, firewall rules, or an invalid password (auth happens after TCP).",
        ].join(" ")
      );
    }
  }

  if (directParsed) {
    const port = Number(directParsed.port || 5432);
    console.log("TCP check: DIRECT_URL");
    const result = await testTcp(directParsed.hostname, port);
    if (result.ok) {
      console.log("  Success: TCP connection established.");
    } else {
      console.log(`  Failure: ${result.error?.message || "Unknown error"}`);
      console.log(
        [
          "  Likely causes:",
          "wrong host/port, DNS issues, firewall rules, or an invalid password (auth happens after TCP).",
        ].join(" ")
      );
    }
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
