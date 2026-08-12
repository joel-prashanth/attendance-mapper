import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

const AUDIT_DIR = path.join(__dirname, "../data/audit");

const AUDIT_FILE = path.join(AUDIT_DIR, "attendance-audit.jsonl");

// =====================================================
// INTERNAL
// =====================================================

function ensureAuditDirectory() {
  if (!fs.existsSync(AUDIT_DIR)) {
    fs.mkdirSync(AUDIT_DIR, {
      recursive: true,
    });
  }
}

// =====================================================
// WRITE AUDIT RECORD
// =====================================================

export function writeAuditLog(entry) {
  ensureAuditDirectory();

  const record = {
    timestamp: new Date().toISOString(),

    ...entry,
  };

  fs.appendFileSync(AUDIT_FILE, `${JSON.stringify(record)}\n`, "utf-8");
}

// =====================================================
// AUDIT FILE LOCATION
// =====================================================

export function getAuditFilePath() {
  ensureAuditDirectory();

  return AUDIT_FILE;
}
