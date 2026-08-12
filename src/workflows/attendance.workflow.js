import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";

import { getRoster, submitAttendance } from "../services/erp.service.js";

import { getSheetStudents } from "../services/sheet.service.js";

import { matchAttendance } from "../services/matcher.service.js";

import { buildAttendancePayload } from "../services/payload.service.js";

import { getAttendanceDateValues } from "../utils/date.js";

import { validateSheet } from "../validators/sheet.validator.js";

import {
  isAttendanceAlreadyMarked,
  canSubmitAttendance,
} from "../validators/attendance.validator.js";

export async function runAttendanceWorkflow({
  profile,
  cookie,
  session,
  submitMode = false,
}) {
  // ===============================================
  // DUPLICATE PROTECTION
  // ===============================================

  if (isAttendanceAlreadyMarked(session)) {
    console.log("\n==============================");

    console.log(" ⚠️ ATTENDANCE ALREADY MARKED");

    console.log("==============================");

    console.log(`Subject : ${session.subjectName}`);

    console.log(`Section : ${session.sectionCode}`);

    console.log(`ERP total   : ${session.totalStudents ?? 0}`);

    console.log(`ERP present : ${session.presentCount ?? 0}`);

    console.log(`ERP absent  : ${session.absentCount ?? 0}`);

    return;
  }

  // ===============================================
  // DATE
  // ===============================================

  const { attendanceDate, attendanceColumn } = getAttendanceDateValues(
    session.date,
  );

  // ===============================================
  // CLASS MAPPING
  // ===============================================

  const classMapping = profile.classMappings?.[session.sectionCode];

  if (!classMapping) {
    throw new Error(`No sheet mapping exists for ${session.sectionCode}`);
  }

  const sheetName = classMapping.sheetName;

  // ===============================================
  // SHEET
  // ===============================================

  const rows = await getSheetStudents(profile.spreadsheetId, sheetName);

  validateSheet({
    rows,
    sheetName,
    attendanceColumn,
  });

  const sheetStudents = rows.map((row) => ({
    registrationNo: row["Registration Number"],

    name: row["NAME AS PER SSC"],

    [attendanceColumn]: row[attendanceColumn],
  }));

  // ===============================================
  // ERP ROSTER
  // ===============================================

  const erpStudents = await getRoster(
    session.sectionId,
    session.courseOfferingId,
    cookie,
  );

  if (!Array.isArray(erpStudents) || erpStudents.length === 0) {
    throw new Error("ERP roster is empty or invalid.");
  }

  // ===============================================
  // MATCH
  // ===============================================

  const result = matchAttendance({
    sheetStudents,
    erpStudents,
    attendanceColumn,
  });

  // ===============================================
  // SUMMARY
  // ===============================================

  console.log("\n==============================");

  console.log(" ATTENDANCE VALIDATION");

  console.log("==============================");

  console.log(`Faculty : ${profile.name}`);

  console.log(`Subject : ${session.subjectName}`);

  console.log(`Section : ${session.sectionCode}`);

  console.log(`Sheet   : ${sheetName}`);

  console.log(`Date    : ${attendanceDate}`);

  console.log();

  console.log(`Google Sheet : ${result.summary.sheetStudents}`);

  console.log(`ERP Roster   : ${result.summary.erpStudents}`);

  console.log(`Matched      : ${result.summary.matched}`);

  console.log(`Sheet Only   : ${result.summary.sheetOnly}`);

  console.log(`ERP Only     : ${result.summary.erpOnly}`);

  console.log();

  console.log(`Present      : ${result.summary.present}`);

  console.log(`Absent       : ${result.summary.absent}`);

  console.log(`Blank/Invalid: ${result.summary.invalidAttendance}`);

  // ===============================================
  // ABSENTEES
  // ===============================================

  const absentees = result.matched.filter(
    (student) => student.attendance === "ABSENT",
  );

  if (absentees.length > 0) {
    console.log("\n--- ABSENTEES ---");

    for (const student of absentees) {
      console.log(`${student.registrationNo} | ${student.name}`);
    }
  }

  // ===============================================
  // SAFETY CHECK
  // ===============================================

  if (
    !canSubmitAttendance({
      result,
      erpStudents,
    })
  ) {
    console.log("\n❌ VALIDATION FAILED");

    console.log("Attendance will NOT be submitted.");

    return;
  }

  console.log("\n✅ VALIDATION PASSED");

  // ===============================================
  // PAYLOAD
  // ===============================================

  const payload = buildAttendancePayload({
    timetableEntryId: session.timetableEntryId,

    date: attendanceDate,

    slotId: session.slotId,

    records: result.records,
  });

  // ===============================================
  // DRY RUN
  // ===============================================

  if (!submitMode) {
    console.log("\n🚫 DRY RUN ONLY — NOTHING SENT TO ERP");

    console.log("\nTo submit:");

    console.log("npm start -- --submit");

    return;
  }

  // ===============================================
  // HUMAN CONFIRMATION
  // ===============================================

  console.log("\n==============================");

  console.log(" ⚠️ FINAL SUBMISSION");

  console.log("==============================");

  console.log(`Faculty : ${profile.name}`);

  console.log(`Section : ${session.sectionCode}`);

  console.log(`Present : ${result.summary.present}`);

  console.log(`Absent  : ${result.summary.absent}`);

  console.log(`Total   : ${result.records.length}`);

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

  // ===============================================
  // SUBMIT
  // ===============================================

  const response = await submitAttendance(payload, cookie);

  const data = response.data;

  if (!data) {
    throw new Error("ERP returned no attendance data.");
  }

  const countsMatch =
    data.totalStudents === result.records.length &&
    data.presentCount === result.summary.present &&
    data.absentCount === result.summary.absent;

  if (!countsMatch) {
    console.log(
      "\n⚠️ Attendance saved, but ERP counts differ from local counts.",
    );

    return;
  }

  console.log("\n==============================");

  console.log("✅ ATTENDANCE SUBMITTED");

  console.log("==============================");

  console.log("ERP response matches Google Sheet attendance.");
}
