import inquirer from "inquirer";

import { listProfiles } from "./services/profile.service.js";

import { setProfileSecret } from "./services/secret.service.js";

async function main() {
  try {
    const profiles = listProfiles();

    if (profiles.length === 0) {
      throw new Error("No faculty profiles found. Run npm run setup first.");
    }

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

    const { erpCookie } = await inquirer.prompt([
      {
        type: "password",
        name: "erpCookie",
        message: "Paste ERP Cookie header:",
        mask: "*",
        validate(value) {
          return value.trim() ? true : "ERP cookie is required.";
        },
      },
    ]);

    setProfileSecret(profileId, {
      erpCookie: erpCookie.trim(),
    });

    console.log("\n✅ ERP session saved for selected profile.");

    console.log("The secret is stored locally and excluded from Git.");
  } catch (error) {
    console.error("\n❌ AUTH SETUP ERROR");

    console.error(error.message);
  }
}

main();
