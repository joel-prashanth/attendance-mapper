import inquirer from "inquirer";

import { getTodaySessions } from "../services/erp.service.js";

export async function selectAttendanceSession({ profile, cookie }) {
  const sessions = await getTodaySessions(cookie);

  if (!Array.isArray(sessions) || sessions.length === 0) {
    throw new Error("No ERP sessions found for today.");
  }

  const availableSessions = sessions.filter(
    (session) => profile.classMappings?.[session.sectionCode],
  );

  if (availableSessions.length === 0) {
    throw new Error(
      `No mapped ERP sessions found for profile "${profile.name}".`,
    );
  }

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
