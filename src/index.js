import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";

import { getSheetStudents } from "./services/sheet.service.js";
import { matchAttendance } from "./services/matcher.service.js";
import { buildAttendancePayload } from "./services/payload.service.js";

import {
  getTodaySessions,
  getRoster,
  submitAttendance,
} from "./services/erp.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, "../.env"),
});

// =====================================================
// V1 CONFIGURATION
// =====================================================

const SHEET_NAME = "112-CSE(GAI)-1C";

const TARGET_SECTION = "BTECH(HONS.)CSEGAI-2C";

const ATTENDANCE_COLUMN = "8/12/2026";

const ATTENDANCE_DATE = "2026-08-12";

// =====================================================
// MAIN
// =====================================================

async function main() {
  try {
    const submitMode = process.argv.includes("--submit");

    // =================================================
    // 1. LOAD GOOGLE SHEET
    // =================================================

    const rawSheetStudents = await getSheetStudents(SHEET_NAME);

    const sheetStudents = rawSheetStudents.map((row) => ({
      registrationNo: row["Registration Number"],

      name: row["NAME AS PER SSC"],

      attendance: row[ATTENDANCE_COLUMN],
    }));

    const preparedSheetStudents = sheetStudents.map((student) => ({
      registrationNo: student.registrationNo,

      name: student.name,

      [ATTENDANCE_COLUMN]: student.attendance,
    }));

    console.log("\n==============================");
    console.log(" GOOGLE SHEET");
    console.log("==============================");

    console.log(`Tab: ${SHEET_NAME}`);
    console.log(`Students: ${preparedSheetStudents.length}`);
    console.log(`Attendance column: ${ATTENDANCE_COLUMN}`);

    // =================================================
    // 2. AUTH
    // =================================================

    const cookie = process.env.ERP_COOKIE;

    if (!cookie) {
      throw new Error("ERP_COOKIE missing from .env");
    }

    // =================================================
    // 3. FETCH TODAY'S SESSIONS
    // =================================================

    const sessions = await getTodaySessions(cookie);

    const selectedSession = sessions.find(
      (session) => session.sectionCode === TARGET_SECTION,
    );

    if (!selectedSession) {
      throw new Error(`ERP session not found for ${TARGET_SECTION}`);
    }

    // =================================================
    // 4. DISPLAY SESSION
    // =================================================

    console.log("\n==============================");
    console.log(" ERP SESSION");
    console.log("==============================");

    console.log(`Subject: ${selectedSession.subjectName}`);

    console.log(`Code: ${selectedSession.subjectCode}`);

    console.log(`Section: ${selectedSession.sectionCode}`);

    console.log(`Room: ${selectedSession.room}`);

    console.log(
      `Time: ${selectedSession.startTime} - ${selectedSession.endTime}`,
    );

    // =================================================
    // 5. LIVE ERP ROSTER
    // =================================================

    const erpStudents = await getRoster(
      selectedSession.sectionId,
      selectedSession.courseOfferingId,
      cookie,
    );

    if (!Array.isArray(erpStudents)) {
      throw new Error("ERP roster is invalid");
    }

    if (erpStudents.length === 0) {
      throw new Error("ERP roster returned 0 students");
    }

    // =================================================
    // 6. MATCH
    // =================================================

    const result = matchAttendance({
      sheetStudents: preparedSheetStudents,

      erpStudents,

      attendanceColumn: ATTENDANCE_COLUMN,
    });

    // =================================================
    // 7. SUMMARY
    // =================================================

    console.log("\n==============================");
    console.log(" ATTENDANCE VALIDATION");
    console.log("==============================");

    console.log(`Google Sheet : ${result.summary.sheetStudents}`);

    console.log(`ERP Roster   : ${result.summary.erpStudents}`);

    console.log(`Matched      : ${result.summary.matched}`);

    console.log(`Sheet Only   : ${result.summary.sheetOnly}`);

    console.log(`ERP Only     : ${result.summary.erpOnly}`);

    console.log();

    console.log(`Present      : ${result.summary.present}`);

    console.log(`Absent       : ${result.summary.absent}`);

    console.log(`Blank/Invalid: ${result.summary.invalidAttendance}`);

    // =================================================
    // 8. SHOW ABSENTEES
    // =================================================

    const absentees = result.matched.filter(
      (student) => student.attendance === "ABSENT",
    );

    if (absentees.length > 0) {
      console.log("\n--- ABSENTEES ---");

      for (const student of absentees) {
        console.log(`${student.registrationNo} | ${student.name}`);
      }
    }

    // =================================================
    // 9. SHOW MISMATCHES
    // =================================================

    if (result.erpOnly.length > 0) {
      console.log("\n❌ ERP STUDENTS MISSING FROM SHEET");

      for (const student of result.erpOnly) {
        console.log(
          `${student.registrationNo} | ${student.firstName ?? ""} ${student.lastName ?? ""}`,
        );
      }
    }

    if (result.invalidAttendance.length > 0) {
      console.log("\n❌ INVALID / BLANK ATTENDANCE");

      for (const student of result.invalidAttendance) {
        console.log(`${student.registrationNo} | ${student.name}`);
      }
    }

    if (result.sheetOnly.length > 0) {
      console.log("\n⚠️ SHEET-ONLY STUDENTS (IGNORED)");

      for (const student of result.sheetOnly) {
        console.log(`${student.registrationNo} | ${student.name}`);
      }
    }

    // =================================================
    // 10. HARD SAFETY CHECK
    // =================================================

    const canSubmit =
      result.erpOnly.length === 0 &&
      result.invalidAttendance.length === 0 &&
      result.records.length === erpStudents.length;

    if (!canSubmit) {
      console.log("\n==============================");
      console.log("❌ VALIDATION FAILED");
      console.log("==============================");

      console.log("Attendance will NOT be submitted.");

      return;
    }

    console.log("\n==============================");
    console.log("✅ VALIDATION PASSED");
    console.log("==============================");

    // =================================================
    // 11. BUILD PAYLOAD
    // =================================================

    const payload = buildAttendancePayload({
      timetableEntryId: selectedSession.timetableEntryId,
      date: ATTENDANCE_DATE,
      slotId: selectedSession.slotId,
      records: result.records,
    });

    console.log({
      timetableEntryId: payload.timetableEntryId,
      date: payload.date,
      slotId: payload.slotId,
      recordCount: payload.records.length,
      lock: payload.lock,
    });

    // =================================================
    // 12. DRY RUN DEFAULT
    // =================================================

    if (!submitMode) {
      console.log("\n🚫 DRY RUN ONLY — NOTHING SENT TO ERP");

      console.log("\nTo submit attendance explicitly:");

      console.log("node index.js --submit");

      return;
    }

    // =================================================
    // 13. FINAL HUMAN CONFIRMATION
    // =================================================

    console.log("\n==============================");
    console.log(" ⚠️ FINAL SUBMISSION");
    console.log("==============================");

    console.log(`${selectedSession.subjectName}`);

    console.log(`${selectedSession.sectionCode}`);

    console.log(`${selectedSession.startTime} - ${selectedSession.endTime}`);

    console.log(`Date: ${ATTENDANCE_DATE}`);

    console.log();

    console.log(`Present: ${result.summary.present}`);

    console.log(`Absent : ${result.summary.absent}`);

    console.log(`Total  : ${result.records.length}`);

    const rl = readline.createInterface({
      input,
      output,
    });

    const answer = await rl.question("\nType SUBMIT to mark attendance: ");

    rl.close();

    if (answer.trim() !== "SUBMIT") {
      console.log("\n❌ Submission cancelled.");

      return;
    }

    // =================================================
    // 14. POST TO ERP
    // =================================================

    console.log("\nSubmitting attendance...");

    const response = await submitAttendance(payload, cookie);

    // =================================================
    // 15. VERIFY ERP RESPONSE
    // =================================================

    console.log("\n==============================");
    console.log(" ERP RESPONSE");
    console.log("==============================");

    console.log(`Success: ${response.success}`);

    console.log(`Message: ${response.message ?? ""}`);

    const data = response.data;

    if (!data) {
      throw new Error("ERP returned no attendance data");
    }

    console.log(`ERP total   : ${data.totalStudents}`);

    console.log(`ERP present : ${data.presentCount}`);

    console.log(`ERP absent  : ${data.absentCount}`);

    // =================================================
    // 16. FINAL COUNT VERIFICATION
    // =================================================

    const countsMatch =
      data.totalStudents === result.records.length &&
      data.presentCount === result.summary.present &&
      data.absentCount === result.summary.absent;

    if (!countsMatch) {
      console.log("\n⚠️ ATTENDANCE SAVED BUT COUNTS DO NOT MATCH LOCAL DATA");

      return;
    }

    console.log("\n==============================");
    console.log("✅ ATTENDANCE SUBMITTED");
    console.log("==============================");

    console.log("ERP response matches Google Sheet attendance.");
  } catch (error) {
    console.error("\n❌ ERROR");
    console.error(error.message);
  }
}

main();
