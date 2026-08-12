import inquirer from "inquirer";

import { setProfileSecret } from "./services/secret.service.js";

import { getTodaySessions, getRoster } from "./services/erp.service.js";

import { getSheetStudents } from "./services/sheet.service.js";

import { saveProfile } from "./services/profile.service.js";

import { normalizeRegistrationNo } from "./utils/attendance.js";

// =====================================================
// EXTRACT GOOGLE SPREADSHEET ID
// =====================================================

function extractSpreadsheetId(input) {
  const value = String(input ?? "").trim();

  const urlMatch = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);

  if (urlMatch) {
    return urlMatch[1];
  }

  // Also allow direct spreadsheet ID
  if (/^[a-zA-Z0-9-_]+$/.test(value)) {
    return value;
  }

  throw new Error("Invalid Google Spreadsheet URL or ID.");
}

// =====================================================
// UNIQUE ERP CLASSES
// =====================================================

function getUniqueClasses(sessions) {
  const classes = new Map();

  for (const session of sessions) {
    if (!session.sectionCode) {
      continue;
    }

    if (!classes.has(session.sectionCode)) {
      classes.set(session.sectionCode, session);
    }
  }

  return [...classes.values()];
}

// =====================================================
// VERIFY ERP ↔ SHEET MAPPING
// =====================================================

function verifyMapping({ sheetStudents, erpStudents }) {
  const sheetRegistrationNumbers = new Set(
    sheetStudents
      .map((student) => normalizeRegistrationNo(student["Registration Number"]))
      .filter(Boolean),
  );

  const matched = [];
  const erpOnly = [];

  for (const student of erpStudents) {
    const registrationNo = normalizeRegistrationNo(student.registrationNo);

    if (sheetRegistrationNumbers.has(registrationNo)) {
      matched.push(student);
    } else {
      erpOnly.push(student);
    }
  }

  const coverage =
    erpStudents.length === 0 ? 0 : (matched.length / erpStudents.length) * 100;

  return {
    matched,
    erpOnly,
    coverage,
  };
}

// =====================================================
// VERIFY USER-ENTERED SHEET TAB
// =====================================================

async function verifySheetMapping({ spreadsheetId, sheetName, erpStudents }) {
  let sheetStudents;

  try {
    sheetStudents = await getSheetStudents(spreadsheetId, sheetName);
  } catch (error) {
    console.log("\n❌ Could not load that Google Sheet tab.");

    console.log(error.message);

    return {
      valid: false,
    };
  }

  if (!Array.isArray(sheetStudents) || sheetStudents.length === 0) {
    console.log("\n❌ Sheet tab contains no students.");

    return {
      valid: false,
    };
  }

  const columns = Object.keys(sheetStudents[0]);

  if (!columns.includes("Registration Number")) {
    console.log('\n❌ Column "Registration Number" was not found.');

    return {
      valid: false,
    };
  }

  const verification = verifyMapping({
    sheetStudents,
    erpStudents,
  });

  console.log("\n==============================");

  console.log(" MAPPING VERIFICATION");

  console.log("==============================");

  console.log(`Sheet students : ${sheetStudents.length}`);

  console.log(`ERP students   : ${erpStudents.length}`);

  console.log(
    `ERP matched    : ${verification.matched.length}/${erpStudents.length}`,
  );

  console.log(`Coverage       : ${verification.coverage.toFixed(2)}%`);

  if (verification.erpOnly.length > 0) {
    console.log("\n❌ MAPPING REJECTED");

    console.log("Some ERP students are missing from this Google Sheet tab.");

    console.log("\nERP students not found:");

    for (const student of verification.erpOnly) {
      console.log(
        `${student.registrationNo} | ` +
          `${student.firstName ?? ""} ` +
          `${student.lastName ?? ""}`,
      );
    }

    return {
      valid: false,
    };
  }

  console.log("\n✅ Mapping verified");

  return {
    valid: true,
    sheetStudents,
  };
}

// =====================================================
// MAIN
// =====================================================

async function main() {
  try {
    console.log("\n==============================");

    console.log(" AURORA ATTENDANCE V2 SETUP");

    console.log("==============================");

    // =================================================
    // 1. FACULTY NAME
    // =================================================

    const { facultyName } = await inquirer.prompt([
      {
        type: "input",

        name: "facultyName",

        message: "Faculty profile name:",

        validate(value) {
          return value.trim() ? true : "Faculty name is required.";
        },
      },
    ]);

    const cleanFacultyName = facultyName.trim();

    // =================================================
    // 2. FACULTY-SPECIFIC ERP COOKIE
    // =================================================

    const { erpCookie } = await inquirer.prompt([
      {
        type: "password",

        name: "erpCookie",

        message: `Paste ERP Cookie header for ${cleanFacultyName}:`,

        mask: "*",

        validate(value) {
          return value.trim() ? true : "ERP cookie is required.";
        },
      },
    ]);

    const cookie = erpCookie.trim();

    // =================================================
    // 3. VERIFY ERP IDENTITY
    // =================================================

    console.log(`\nChecking ERP session for ${cleanFacultyName}...`);

    const sessions = await getTodaySessions(cookie);

    if (!Array.isArray(sessions) || sessions.length === 0) {
      throw new Error(
        "No ERP sessions were returned. Check the ERP cookie or today's timetable.",
      );
    }

    // Useful identity hint
    const detectedFacultyName = sessions.find(
      (session) => session.facultyName,
    )?.facultyName;

    if (detectedFacultyName) {
      console.log(`ERP faculty detected: ${detectedFacultyName}`);
    }

    // =================================================
    // 4. GOOGLE SPREADSHEET
    // =================================================

    const { spreadsheetInput } = await inquirer.prompt([
      {
        type: "input",

        name: "spreadsheetInput",

        message: "Paste Google Spreadsheet URL or ID:",

        validate(value) {
          return value.trim() ? true : "Spreadsheet URL/ID is required.";
        },
      },
    ]);

    const spreadsheetId = extractSpreadsheetId(spreadsheetInput);

    console.log(`\nSpreadsheet ID: ${spreadsheetId}`);

    // =================================================
    // 5. UNIQUE ERP CLASSES
    // =================================================

    const classes = getUniqueClasses(sessions);

    if (classes.length === 0) {
      throw new Error("No usable ERP classes found.");
    }

    console.log(`\nFound ${classes.length} unique class(es).`);

    // =================================================
    // 6. BUILD VERIFIED CLASS MAPPINGS
    // =================================================

    const classMappings = {};

    for (const session of classes) {
      console.log("\n================================");

      console.log(session.subjectName);

      console.log(`Subject : ${session.subjectCode}`);

      console.log(`Section : ${session.sectionCode}`);

      console.log(`Room    : ${session.room}`);

      console.log(`Time    : ${session.startTime} - ${session.endTime}`);

      // ===============================================
      // FETCH ERP ROSTER
      // ===============================================

      console.log("\nFetching ERP roster...");

      const erpStudents = await getRoster(
        session.sectionId,
        session.courseOfferingId,
        cookie,
      );

      if (!Array.isArray(erpStudents) || erpStudents.length === 0) {
        console.log("\n⚠️ ERP roster unavailable.");

        console.log("Skipping this class.");

        continue;
      }

      console.log(`ERP roster: ${erpStudents.length}`);

      // ===============================================
      // ASK UNTIL VERIFIED / SKIPPED
      // ===============================================

      let finished = false;

      while (!finished) {
        const { sheetName } = await inquirer.prompt([
          {
            type: "input",

            name: "sheetName",

            message: `Google Sheet tab for ${session.sectionCode}:`,

            validate(value) {
              return value.trim() ? true : "Sheet tab name is required.";
            },
          },
        ]);

        const cleanSheetName = sheetName.trim();

        const verification = await verifySheetMapping({
          spreadsheetId,

          sheetName: cleanSheetName,

          erpStudents,
        });

        if (verification.valid) {
          classMappings[session.sectionCode] = {
            sheetName: cleanSheetName,
          };

          finished = true;

          continue;
        }

        const { action } = await inquirer.prompt([
          {
            type: "select",

            name: "action",

            message: "Mapping failed. What would you like to do?",

            choices: [
              {
                name: "Try another sheet tab",

                value: "retry",
              },

              {
                name: "Skip this class",

                value: "skip",
              },

              {
                name: "Cancel setup",

                value: "cancel",
              },
            ],
          },
        ]);

        if (action === "skip") {
          console.log(`\nSkipping ${session.sectionCode}`);

          finished = true;
        }

        if (action === "cancel") {
          console.log("\nSetup cancelled.");

          return;
        }
      }
    }

    // =================================================
    // 7. ENSURE AT LEAST ONE MAPPING
    // =================================================

    if (Object.keys(classMappings).length === 0) {
      throw new Error("No class mappings were successfully configured.");
    }

    // =================================================
    // 8. BUILD PROFILE
    // =================================================

    const profile = {
      version: 2,

      name: cleanFacultyName,

      spreadsheetId,

      classMappings,

      createdAt: new Date().toISOString(),
    };

    // =================================================
    // 9. SAVE PROFILE
    // =================================================

    const savedProfile = saveProfile(profile);

    // =================================================
    // 10. SAVE PROFILE-SPECIFIC SECRET
    // =================================================

    setProfileSecret(savedProfile.id, {
      erpCookie: cookie,
    });

    // =================================================
    // 11. FINAL SUMMARY
    // =================================================

    console.log("\n==============================");

    console.log(" ✅ SETUP COMPLETE");

    console.log("==============================");

    console.log(`\nFaculty profile: ${cleanFacultyName}`);

    if (detectedFacultyName) {
      console.log(`ERP identity   : ${detectedFacultyName}`);
    }

    console.log(`\nProfile saved to:\n${savedProfile.path}`);

    console.log("\nVerified class mappings:");

    for (const [sectionCode, mapping] of Object.entries(classMappings)) {
      console.log(`✅ ${sectionCode} → ${mapping.sheetName}`);
    }

    console.log(
      "\nERP authentication has been stored separately in profile-secrets.json.",
    );

    console.log("\nYou can now run:");

    console.log("npm start");
  } catch (error) {
    console.error("\n❌ SETUP ERROR");

    console.error(error.message);
  }
}

main();
