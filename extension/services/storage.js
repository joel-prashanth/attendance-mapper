const PROFILE_KEY = "profile";
const CONSENT_KEY = "privacyConsent";

export const PRIVACY_CONSENT_VERSION = "2026-08-v1";

// =====================================================
// PROFILE
// =====================================================

export async function getProfile() {
  const data = await chrome.storage.local.get([PROFILE_KEY]);

  return data[PROFILE_KEY] ?? null;
}

export async function saveProfile(profile) {
  await chrome.storage.local.set({
    [PROFILE_KEY]: profile,
  });

  return profile;
}

export async function deleteProfile() {
  await chrome.storage.local.remove(PROFILE_KEY);
}

// =====================================================
// PRIVACY CONSENT
// =====================================================

export async function getPrivacyConsent() {
  const data = await chrome.storage.local.get([CONSENT_KEY]);

  const consent = data[CONSENT_KEY];

  if (!consent) {
    return null;
  }

  if (consent.version !== PRIVACY_CONSENT_VERSION) {
    return null;
  }

  if (consent.accepted !== true) {
    return null;
  }

  return consent;
}

export async function savePrivacyConsent() {
  const consent = {
    accepted: true,
    version: PRIVACY_CONSENT_VERSION,
    acceptedAt: new Date().toISOString(),
  };

  await chrome.storage.local.set({
    [CONSENT_KEY]: consent,
  });

  return consent;
}

// =====================================================
// RESET
// =====================================================

export async function clearAllExtensionData() {
  await chrome.storage.local.clear();
}
