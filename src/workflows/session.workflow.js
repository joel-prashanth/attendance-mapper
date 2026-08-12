import inquirer from "inquirer";

import { getTodaySessions } from "../services/erp.service.js";

// =====================================================
// SELECT ATTENDANCE SESSION
// =====================================================

export async function selectAttendanceSession({ profile, cookie }) {
  if (!profile) {
    throw new Error("Faculty profile is required.");
  }

  if (!cookie) {
    throw new Error("ERP authentication is required.");
  }

  // ===================================================
  // FETCH TODAY'S ERP SESSIONS
  // ===================================================

  const sessions = await getTodaySessions(cookie);

  if (!Array.isArray(sessions) || sessions.length === 0) {
    throw new Error("No ERP sessions found for today.");
  }

  // ===================================================
  // DETECT UNMAPPED CLASSES
  // ===================================================

  const unmappedSessions = sessions.filter(
    (session) => !profile.classMappings?.[session.sectionCode],
  );

  if (unmappedSessions.length > 0) {
    console.log("\n==============================");

    console.log(" ⚠️ UNMAPPED ERP CLASSES");

    console.log("==============================");

    for (const session of unmappedSessions) {
      console.log(
        `${session.subjectCode} | ` +
          `${session.sectionCode} | ` +
          `${session.startTime}-${session.endTime}`,
      );
    }

    console.log("\nThese classes are not configured in this faculty profile.");

    console.log("Run npm run setup to configure them.");
  }

  // ===================================================
  // ONLY MAPPED CLASSES CAN BE USED
  // ===================================================

  const availableSessions = sessions.filter(
    (session) => profile.classMappings?.[session.sectionCode],
  );

  if (availableSessions.length === 0) {
    throw new Error(
      `No mapped ERP sessions found for profile "${profile.name}".`,
    );
  }

  // ===================================================
  // SELECT SESSION
  // ===================================================

  const { timetableEntryId } = await inquirer.prompt([
    {
      type: "select",

      name: "timetableEntryId",

      message: "Select class:",

      choices: availableSessions.map((session) => ({
        name:
          `${session.subjectCode} | ` +
          `${session.sectionCode} | ` +
          `${session.startTime}-${session.endTime}`,

        value: session.timetableEntryId,
      })),
    },
  ]);

  const selectedSession = availableSessions.find(
    (session) => session.timetableEntryId === timetableEntryId,
  );

  if (!selectedSession) {
    throw new Error("Selected ERP session could not be resolved.");
  }

  return selectedSession;
}
