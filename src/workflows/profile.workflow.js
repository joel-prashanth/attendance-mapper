import inquirer from "inquirer";

import { listProfiles, loadProfile } from "../services/profile.service.js";

import { getProfileSecret } from "../services/secret.service.js";

export async function selectFacultyProfile() {
  const profiles = listProfiles();

  if (profiles.length === 0) {
    throw new Error("No faculty profiles found. Run: npm run setup");
  }

  let selectedProfileId;

  if (profiles.length === 1) {
    selectedProfileId = profiles[0].id;

    console.log(`\nUsing faculty profile: ${profiles[0].name}`);
  } else {
    const { profileId } = await inquirer.prompt([
      {
        type: "select",
        name: "profileId",
        message: "Select faculty profile:",

        choices: profiles.map((profile) => ({
          name: profile.name,

          value: profile.id,
        })),
      },
    ]);

    selectedProfileId = profileId;
  }

  const profile = loadProfile(selectedProfileId);

  if (!profile) {
    throw new Error("Selected faculty profile could not be loaded.");
  }

  return profile;
}

export function getProfileCookie(profile) {
  const secret = getProfileSecret(profile.id);

  const cookie = secret?.erpCookie;

  if (!cookie) {
    throw new Error(
      `No ERP session configured for profile "${profile.name}". Run: npm run auth`,
    );
  }

  return cookie;
}
