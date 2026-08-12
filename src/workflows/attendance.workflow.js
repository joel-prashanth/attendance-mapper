import readline from "readline/promises";

import { stdin as input, stdout as output } from "process";

import { getRoster, submitAttendance } from "../services/erp.service.js";

import { getSheetStudents } from "../services/sheet.service.js";

import { matchAttendance } from "../services/matcher.service.js";

import { buildAttendancePayload } from "../services/payload.service.js";

import { writeAuditLog } from "../services/audit.service.js";

import { getAttendanceDateValues } from "../utils/date.js";

import { validateSheet } from "../validators/sheet.validator.js";

import {
  isAttendanceAlreadyMarked,
  canSubmitAttendance,
} from "../validators/attendance.validator.js";

// =====================================================
// ATTENDANCE WORKFLOW
// =====================================================

export async function runAttendanceWorkflow({
  profile,
  cookie,
  session,
  submitMode = false,
}) {
  // ===================================================
  // DUPLICATE ATTENDANCE PROTECTION
  // ===================================================

  if (isAttendanceAlreadyMarked(session)) {
    console.log("\n==============================");

    console.log(" ⚠️ ATTENDANCE ALREADY MARKED");

    console.log("==============================");

    console.log(`Subject : ${session.subjectName}`);

    console.log(`Section : ${session.sectionCode}`);

    console.log(`ERP total   : ${session.totalStudents ?? 0}`);

    console.log(`ERP present : ${session.presentCount ?? 0}`);

    console.log(`ERP absent  : ${session.absentCount ?? 0}`);

    writeAuditLog({
      profileId: profile.id,

      faculty: profile.name,

      subject: session.subjectCode,

      section: session.sectionCode,

      date: String(session.date ?? "").split("T")[0],

      status: "BLOCKED_ALREADY_MARKED",
    });

    return;
  }

  // ===================================================
  // DATE
  // ===================================================

  const { attendanceDate, attendanceColumn } = getAttendanceDateValues(
    session.date,
  );

  // ===================================================
  // CLASS → SHEET MAPPING
  // ===================================================

  const classMapping = profile.classMappings?.[session.sectionCode];

  if (!classMapping) {
    throw new Error(
      `No Google Sheet mapping exists for ${session.sectionCode}.`,
    );
  }

  const sheetName = classMapping.sheetName;

  if (!sheetName) {
    throw new Error(`Google Sheet tab is missing for ${session.sectionCode}.`);
  }

  if (!profile.spreadsheetId) {
    throw new Error(`Spreadsheet ID is missing for profile "${profile.name}".`);
  }

  // ===================================================
  // LOAD GOOGLE SHEET
  // ===================================================

  const rows = await getSheetStudents(profile.spreadsheetId, sheetName);

  validateSheet({
    rows,
    sheetName,
    attendanceColumn,
  });

  // ===================================================
  // PREPARE GOOGLE SHEET STUDENTS
  // ===================================================

  const sheetStudents = rows.map((row) => ({
    registrationNo: row["Registration Number"],

    name: row["NAME AS PER SSC"],

    [attendanceColumn]: row[attendanceColumn],
  }));

  // ===================================================
  // FETCH ERP ROSTER
  // ===================================================

  const erpStudents = await getRoster(
    session.sectionId,
    session.courseOfferingId,
    cookie,
  );

  if (!Array.isArray(erpStudents) || erpStudents.length === 0) {
    throw new Error("ERP roster is empty or invalid.");
  }

  // ===================================================
  // MATCH SHEET ↔ ERP
  // ===================================================

  const result = matchAttendance({
    sheetStudents,
    erpStudents,
    attendanceColumn,
  });

  const erpCoverage = (result.summary.matched / erpStudents.length) * 100;

  // ===================================================
  // MAPPING CHECK
  // ===================================================

  console.log("\n==============================");

  console.log(" SHEET ↔ ERP MAPPING CHECK");

  console.log("==============================");

  console.log(`Sheet students : ${result.summary.sheetStudents}`);

  console.log(`ERP students   : ${result.summary.erpStudents}`);

  console.log(
    `ERP matched    : ${result.summary.matched}/${result.summary.erpStudents}`,
  );

  console.log(`Coverage       : ${erpCoverage.toFixed(2)}%`);

  if (result.erpOnly.length > 0) {
    console.log("\n❌ SHEET MAPPING REJECTED");

    console.log("Not every ERP student exists in the mapped Google Sheet.");

    writeAuditLog({
      profileId: profile.id,

      faculty: profile.name,

      subject: session.subjectCode,

      section: session.sectionCode,

      date: attendanceDate,

      status: "BLOCKED_ROSTER_MISMATCH",

      erpStudents: result.summary.erpStudents,

      matched: result.summary.matched,

      erpOnly: result.summary.erpOnly,
    });

    return;
  }

  console.log("\n✅ Sheet mapping verified");

  // ===================================================
  // ATTENDANCE VALIDATION
  // ===================================================

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

  // ===================================================
  // ABSENTEES
  // ===================================================

  const absentees = result.matched.filter(
    (student) => student.attendance === "ABSENT",
  );

  if (absentees.length > 0) {
    console.log("\n--- ABSENTEES ---");

    for (const student of absentees) {
      console.log(`${student.registrationNo} | ${student.name}`);
    }
  }

  // ===================================================
  // SHEET-ONLY INFORMATION
  // ===================================================

  if (result.sheetOnly.length > 0) {
    console.log("\n⚠️ SHEET-ONLY STUDENTS (IGNORED)");

    for (const student of result.sheetOnly) {
      console.log(`${student.registrationNo} | ${student.name}`);
    }
  }

  // ===================================================
  // HARD SAFETY CHECK
  // ===================================================

  const safeToSubmit = canSubmitAttendance({
    result,
    erpStudents,
  });

  if (!safeToSubmit) {
    console.log("\n==============================");

    console.log("❌ VALIDATION FAILED");

    console.log("==============================");

    console.log("Attendance will NOT be submitted.");

    writeAuditLog({
      profileId: profile.id,

      faculty: profile.name,

      subject: session.subjectCode,

      section: session.sectionCode,

      date: attendanceDate,

      present: result.summary.present,

      absent: result.summary.absent,

      total: result.records.length,

      invalidAttendance: result.summary.invalidAttendance,

      erpOnly: result.summary.erpOnly,

      status: "BLOCKED_VALIDATION",
    });

    return;
  }

  console.log("\n==============================");

  console.log("✅ VALIDATION PASSED");

  console.log("==============================");

  // ===================================================
  // BUILD PAYLOAD
  // ===================================================

  const payload = buildAttendancePayload({
    timetableEntryId: session.timetableEntryId,

    date: attendanceDate,

    slotId: session.slotId,

    records: result.records,
  });

  // ===================================================
  // DRY RUN
  // ===================================================

  if (!submitMode) {
    writeAuditLog({
      profileId: profile.id,

      faculty: profile.name,

      subject: session.subjectCode,

      section: session.sectionCode,

      date: attendanceDate,

      present: result.summary.present,

      absent: result.summary.absent,

      total: result.records.length,

      status: "DRY_RUN_VALIDATED",
    });

    console.log("\n🚫 DRY RUN ONLY — NOTHING SENT TO ERP");

    console.log("\nTo submit attendance explicitly:");

    console.log("npm start -- --submit");

    return;
  }

  // ===================================================
  // FINAL HUMAN CONFIRMATION
  // ===================================================

  console.log("\n==============================");

  console.log(" ⚠️ FINAL SUBMISSION");

  console.log("==============================");

  console.log(`Faculty : ${profile.name}`);

  console.log(`Subject : ${session.subjectName}`);

  console.log(`Section : ${session.sectionCode}`);

  console.log(`Time    : ${session.startTime} - ${session.endTime}`);

  console.log(`Date    : ${attendanceDate}`);

  console.log();

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
    writeAuditLog({
      profileId: profile.id,

      faculty: profile.name,

      subject: session.subjectCode,

      section: session.sectionCode,

      date: attendanceDate,

      present: result.summary.present,

      absent: result.summary.absent,

      total: result.records.length,

      status: "SUBMISSION_CANCELLED",
    });

    console.log("\n❌ Submission cancelled.");

    return;
  }

  // ===================================================
  // SUBMIT TO ERP
  // ===================================================

  console.log("\nSubmitting attendance...");

  const response = await submitAttendance(payload, cookie);

  const data = response.data;

  if (!data) {
    throw new Error("ERP returned no attendance data.");
  }

  // ===================================================
  // ERP RESPONSE VERIFICATION
  // ===================================================

  console.log("\n==============================");

  console.log(" ERP RESPONSE");

  console.log("==============================");

  console.log(`Success: ${response.success}`);

  console.log(`Message: ${response.message ?? ""}`);

  console.log(`ERP total   : ${data.totalStudents}`);

  console.log(`ERP present : ${data.presentCount}`);

  console.log(`ERP absent  : ${data.absentCount}`);

  const countsMatch =
    data.totalStudents === result.records.length &&
    data.presentCount === result.summary.present &&
    data.absentCount === result.summary.absent;

  if (!countsMatch) {
    writeAuditLog({
      profileId: profile.id,

      faculty: profile.name,

      subject: session.subjectCode,

      section: session.sectionCode,

      date: attendanceDate,

      present: result.summary.present,

      absent: result.summary.absent,

      total: result.records.length,

      erpPresent: data.presentCount,

      erpAbsent: data.absentCount,

      erpTotal: data.totalStudents,

      status: "SUBMITTED_COUNT_MISMATCH",
    });

    console.log("\n⚠️ ATTENDANCE SAVED BUT COUNTS DO NOT MATCH LOCAL DATA");

    return;
  }

  // ===================================================
  // SUCCESS AUDIT
  // ===================================================

  writeAuditLog({
    profileId: profile.id,

    faculty: profile.name,

    subject: session.subjectCode,

    section: session.sectionCode,

    date: attendanceDate,

    present: result.summary.present,

    absent: result.summary.absent,

    total: result.records.length,

    status: "SUBMITTED",
  });

  console.log("\n==============================");

  console.log("✅ ATTENDANCE SUBMITTED");

  console.log("==============================");

  console.log("ERP response matches Google Sheet attendance.");
}
