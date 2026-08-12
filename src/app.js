import {
  selectFacultyProfile,
  getProfileCookie,
} from "./workflows/profile.workflow.js";

import { selectAttendanceSession } from "./workflows/session.workflow.js";

import { runAttendanceWorkflow } from "./workflows/attendance.workflow.js";

export async function runAttendanceApp() {
  try {
    const submitMode = process.argv.includes("--submit");

    const profile = await selectFacultyProfile();

    const cookie = getProfileCookie(profile);

    const session = await selectAttendanceSession({
      profile,
      cookie,
    });

    await runAttendanceWorkflow({
      profile,
      cookie,
      session,
      submitMode,
    });
  } catch (error) {
    console.error("\n❌ ERROR");

    console.error(error.message);
  }
}
