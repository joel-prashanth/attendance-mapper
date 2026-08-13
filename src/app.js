import { selectFacultyProfile } from "./workflows/profile.workflow.js";

import { selectAttendanceSession } from "./workflows/session.workflow.js";

import { runAttendanceWorkflow } from "./workflows/attendance.workflow.js";

import { startAuthBridge, waitForBrowserSession } from "./auth-bridge.js";

// =====================================================
// APPLICATION
// =====================================================

export async function runAttendanceApp() {
  let bridgeServer;

  try {
    const submitMode = process.argv.includes("--submit");

    // =================================================
    // START LOCAL CHROME BRIDGE
    // =================================================

    bridgeServer = await startAuthBridge();

    console.log("\nAurora Attendance Automation");

    console.log("Browser connector listening on 127.0.0.1:3847");

    // =================================================
    // WAIT FOR EXTENSION
    // =================================================

    const browserSession = await waitForBrowserSession();

    const cookie = browserSession.cookie;

    // =================================================
    // PROFILE
    // =================================================

    const profile = await selectFacultyProfile();

    // =================================================
    // SESSION
    // =================================================

    const session = await selectAttendanceSession({
      profile,
      cookie,
    });

    // =================================================
    // ATTENDANCE
    // =================================================

    await runAttendanceWorkflow({
      profile,
      cookie,
      session,
      submitMode,
    });
  } catch (error) {
    console.error("\n❌ ERROR");

    console.error(error.message);
  } finally {
    if (bridgeServer) {
      bridgeServer.close();
    }
  }
}
