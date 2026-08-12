import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SECRETS_PATH = path.join(
  __dirname,
  "../data/profile-secrets.json",
);

function ensureSecretsFile() {
  const directory = path.dirname(SECRETS_PATH);

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, {
      recursive: true,
    });
  }

  if (!fs.existsSync(SECRETS_PATH)) {
    fs.writeFileSync(
      SECRETS_PATH,
      JSON.stringify({}, null, 2),
    );
  }
}

function loadSecrets() {
  ensureSecretsFile();

  const raw = fs.readFileSync(
    SECRETS_PATH,
    "utf-8",
  );

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      "profile-secrets.json contains invalid JSON.",
    );
  }
}

function saveSecrets(secrets) {
  ensureSecretsFile();

  fs.writeFileSync(
    SECRETS_PATH,
    JSON.stringify(secrets, null, 2),
  );
}

export function getProfileSecret(profileId) {
  const secrets = loadSecrets();

  return secrets?.[profileId] ?? null;
}

export function setProfileSecret(
  profileId,
  secret,
) {
  if (!profileId) {
    throw new Error(
      "profileId is required.",
    );
  }

  const secrets = loadSecrets();

  secrets[profileId] = {
    ...(secrets[profileId] ?? {}),
    ...secret,
  };

  saveSecrets(secrets);
}

export function deleteProfileSecret(
  profileId,
) {
  const secrets = loadSecrets();

  if (!secrets[profileId]) {
    return false;
  }

  delete secrets[profileId];

  saveSecrets(secrets);

  return true;
}