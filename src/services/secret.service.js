import fs from "fs";
import path from "path";
import os from "os";

// =====================================================
// APP DATA LOCATION
// =====================================================

function getAppDataDirectory() {
  // Windows
  if (process.platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");

    return path.join(localAppData, "AuroraAttendance");
  }

  // macOS
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "AuroraAttendance",
    );
  }

  // Linux
  return path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
    "AuroraAttendance",
  );
}

// =====================================================
// PATHS
// =====================================================

const APP_DATA_DIR = getAppDataDirectory();

const SECRETS_FILE = path.join(APP_DATA_DIR, "profile-secrets.json");

// =====================================================
// ENSURE STORAGE EXISTS
// =====================================================

function ensureStorage() {
  if (!fs.existsSync(APP_DATA_DIR)) {
    fs.mkdirSync(APP_DATA_DIR, {
      recursive: true,
    });
  }

  if (!fs.existsSync(SECRETS_FILE)) {
    fs.writeFileSync(SECRETS_FILE, JSON.stringify({}, null, 2), "utf8");
  }
}

// =====================================================
// LOAD ALL SECRETS
// =====================================================

export function loadSecrets() {
  ensureStorage();

  const raw = fs.readFileSync(SECRETS_FILE, "utf8");

  const trimmed = raw.trim();

  if (!trimmed) {
    return {};
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(`Invalid secrets file: ${SECRETS_FILE}`);
  }
}

// =====================================================
// SAVE ALL SECRETS
// =====================================================

function saveSecrets(secrets) {
  ensureStorage();

  fs.writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2), "utf8");
}

// =====================================================
// GET PROFILE SECRET
// =====================================================

export function getProfileSecret(profileId) {
  if (!profileId) {
    return null;
  }

  const secrets = loadSecrets();

  return secrets[profileId] ?? null;
}

// =====================================================
// SET PROFILE SECRET
// =====================================================

export function setProfileSecret(profileId, secret) {
  if (!profileId) {
    throw new Error("profileId is required.");
  }

  if (!secret || typeof secret !== "object") {
    throw new Error("Secret data is required.");
  }

  const secrets = loadSecrets();

  secrets[profileId] = {
    ...(secrets[profileId] ?? {}),

    ...secret,

    updatedAt: new Date().toISOString(),
  };

  saveSecrets(secrets);

  return secrets[profileId];
}

// =====================================================
// DELETE PROFILE SECRET
// =====================================================

export function deleteProfileSecret(profileId) {
  if (!profileId) {
    return false;
  }

  const secrets = loadSecrets();

  if (!secrets[profileId]) {
    return false;
  }

  delete secrets[profileId];

  saveSecrets(secrets);

  return true;
}

// =====================================================
// GET STORAGE PATH
// Useful for troubleshooting only.
// Do NOT print cookie contents.
// =====================================================

export function getSecretsStoragePath() {
  return SECRETS_FILE;
}
