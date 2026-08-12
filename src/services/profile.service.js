import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROFILES_DIR = path.join(__dirname, "../data/profiles");

// =====================================================
// INTERNAL HELPERS
// =====================================================

function ensureProfilesDirectory() {
  if (!fs.existsSync(PROFILES_DIR)) {
    fs.mkdirSync(PROFILES_DIR, {
      recursive: true,
    });
  }
}

function sanitizeProfileId(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// =====================================================
// LIST PROFILES
// =====================================================

export function listProfiles() {
  ensureProfilesDirectory();

  const files = fs
    .readdirSync(PROFILES_DIR)
    .filter((file) => file.endsWith(".json"));

  return files
    .map((file) => {
      const fullPath = path.join(PROFILES_DIR, file);

      try {
        const raw = fs.readFileSync(fullPath, "utf-8");

        const profile = JSON.parse(raw);

        return {
          id: file.replace(".json", ""),

          ...profile,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// =====================================================
// LOAD PROFILE
// =====================================================

export function loadProfile(profileId) {
  ensureProfilesDirectory();

  const cleanId = sanitizeProfileId(profileId);

  if (!cleanId) {
    return null;
  }

  const profilePath = path.join(PROFILES_DIR, `${cleanId}.json`);

  if (!fs.existsSync(profilePath)) {
    return null;
  }

  const raw = fs.readFileSync(profilePath, "utf-8");

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Profile "${cleanId}" contains invalid JSON.`);
  }
}

// =====================================================
// SAVE PROFILE
// =====================================================

export function saveProfile(profile) {
  ensureProfilesDirectory();

  if (!profile?.name) {
    throw new Error("Profile name is required.");
  }

  const profileId = sanitizeProfileId(profile.id || profile.name);

  if (!profileId) {
    throw new Error("Could not generate a valid profile ID.");
  }

  const profilePath = path.join(PROFILES_DIR, `${profileId}.json`);

  const data = {
    ...profile,

    id: profileId,
  };

  fs.writeFileSync(
    profilePath,

    JSON.stringify(data, null, 2),
  );

  return {
    id: profileId,

    path: profilePath,

    profile: data,
  };
}

// =====================================================
// UPDATE PROFILE
// =====================================================

export function updateProfile(profileId, updates) {
  const existingProfile = loadProfile(profileId);

  if (!existingProfile) {
    throw new Error(`Profile "${profileId}" does not exist.`);
  }

  if (!updates || typeof updates !== "object") {
    throw new Error("Profile updates must be an object.");
  }

  const updatedProfile = {
    ...existingProfile,

    ...updates,

    // Keep original profile identity
    id: existingProfile.id,

    updatedAt: new Date().toISOString(),
  };

  const result = saveProfile(updatedProfile);

  return result.profile;
}

// =====================================================
// DELETE PROFILE
// =====================================================

export function deleteProfile(profileId) {
  ensureProfilesDirectory();

  const cleanId = sanitizeProfileId(profileId);

  if (!cleanId) {
    return false;
  }

  const profilePath = path.join(PROFILES_DIR, `${cleanId}.json`);

  if (!fs.existsSync(profilePath)) {
    return false;
  }

  fs.unlinkSync(profilePath);

  return true;
}
