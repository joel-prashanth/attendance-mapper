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
  // 1. SESSION DATE
  // ===================================================

  const sessionDate = String(session.date ?? "").split("T")[0];

  // ===================================================
  // 2. LOCKED SESSION PROTECTION
  // ===================================================

  if (session.isLocked) {
    console.log("\n==============================");

    console.log(" ⛔ ERP SESSION LOCKED");

    console.log("==============================");

    console.log(`Faculty : ${profile.name}`);

    console.log(`Subject : ${session.subjectName}`);

    console.log(`Section : ${session.sectionCode}`);

    console.log(`Date    : ${sessionDate}`);

    console.log();

    console.log("ERP has locked this attendance session.");

    console.log("Attendance will not be submitted.");

    writeAuditLog({
      profileId: profile.id,

      faculty: profile.name,

      subject: session.subjectCode,

      section: session.sectionCode,

      date: sessionDate,

      status: "BLOCKED_SESSION_LOCKED",
    });

    return;
  }

  // ===================================================
  // 3. DUPLICATE ATTENDANCE PROTECTION
  // ===================================================

  if (isAttendanceAlreadyMarked(session)) {
    console.log("\n==============================");

    console.log(" ⚠️ ATTENDANCE ALREADY MARKED");

    console.log("==============================");

    console.log(`Faculty : ${profile.name}`);

    console.log(`Subject : ${session.subjectName}`);

    console.log(`Section : ${session.sectionCode}`);

    console.log(`Date    : ${sessionDate}`);

    console.log();

    console.log(`ERP total   : ${session.totalStudents ?? 0}`);

    console.log(`ERP present : ${session.presentCount ?? 0}`);

    console.log(`ERP absent  : ${session.absentCount ?? 0}`);

    console.log();

    console.log("Existing ERP attendance will not be overwritten.");

    writeAuditLog({
      profileId: profile.id,

      faculty: profile.name,

      subject: session.subjectCode,

      section: session.sectionCode,

      date: sessionDate,

      total: session.totalStudents ?? 0,

      present: session.presentCount ?? 0,

      absent: session.absentCount ?? 0,

      status: "BLOCKED_ALREADY_MARKED",
    });

    return;
  }

  // ===================================================
  // 4. RESOLVE ERP DATE → GOOGLE SHEET COLUMN
  // ===================================================

  const { attendanceDate, attendanceColumn } = getAttendanceDateValues(
    session.date,
  );

  // ===================================================
  // 5. CLASS → SHEET MAPPING
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

  console.log("\n==============================");

  console.log(" ATTENDANCE SESSION");

  console.log("==============================");

  console.log(`Faculty : ${profile.name}`);

  console.log(`Subject : ${session.subjectName}`);

  console.log(`Section : ${session.sectionCode}`);

  console.log(`Date    : ${attendanceDate}`);

  console.log(`Column  : ${attendanceColumn}`);

  console.log(`Sheet   : ${sheetName}`);

  // ===================================================
  // 6. LOAD GOOGLE SHEET
  // ===================================================

  const rows = await getSheetStudents(profile.spreadsheetId, sheetName);

  // ===================================================
  // 7. VALIDATE SHEET STRUCTURE + DATE
  // ===================================================

  validateSheet({
    rows,
    sheetName,
    attendanceColumn,
  });

  // ===================================================
  // 8. PREPARE SHEET STUDENTS
  // ===================================================

  const sheetStudents = rows.map((row) => ({
    registrationNo: row["Registration Number"],

    name: row["NAME AS PER SSC"],

    [attendanceColumn]: row[attendanceColumn],
  }));

  // ===================================================
  // 9. FETCH ERP ROSTER
  // ===================================================

  console.log("\nFetching ERP roster...");

  const erpStudents = await getRoster(
    session.sectionId,
    session.courseOfferingId,
    cookie,
  );

  if (!Array.isArray(erpStudents) || erpStudents.length === 0) {
    throw new Error("ERP roster is empty or invalid.");
  }

  // ===================================================
  // 10. MATCH GOOGLE SHEET ↔ ERP
  // ===================================================

  const result = matchAttendance({
    sheetStudents,
    erpStudents,
    attendanceColumn,
  });

  // ===================================================
  // 11. COMPLETE NO CLASS
  // ===================================================

  if (result.allMatchedAreNoClass) {
    console.log("\n==============================");

    console.log(" ⛔ NO CLASS");

    console.log("==============================");

    console.log(`Faculty : ${profile.name}`);

    console.log(`Subject : ${session.subjectName}`);

    console.log(`Section : ${session.sectionCode}`);

    console.log(`Sheet   : ${sheetName}`);

    console.log(`Date    : ${attendanceDate}`);

    console.log();

    console.log("The Google Sheet marks this date as NO CLASS.");

    console.log("Attendance will not be submitted.");

    writeAuditLog({
      profileId: profile.id,

      faculty: profile.name,

      subject: session.subjectCode,

      section: session.sectionCode,

      date: attendanceDate,

      total: erpStudents.length,

      status: "BLOCKED_NO_CLASS",
    });

    return;
  }

  // ===================================================
  // 12. MIXED NO CLASS
  // ===================================================

  if (result.mixedNoClass) {
    console.log("\n==============================");

    console.log(" ❌ INCONSISTENT NO CLASS DATA");

    console.log("==============================");

    console.log(`Faculty : ${profile.name}`);

    console.log(`Subject : ${session.subjectName}`);

    console.log(`Section : ${session.sectionCode}`);

    console.log(`Date    : ${attendanceDate}`);

    console.log();

    console.log(`No Class : ${result.summary.noClass}`);

    console.log(`Present  : ${result.summary.present}`);

    console.log(`Absent   : ${result.summary.absent}`);

    if (result.noClass.length > 0) {
      console.log("\nStudents marked NO CLASS:");

      for (const student of result.noClass) {
        console.log(`${student.registrationNo} | ${student.name}`);
      }
    }

    console.log();

    console.log(
      "The attendance column contains a mixture of NO CLASS and Present/Absent.",
    );

    console.log("Attendance will not be submitted.");

    writeAuditLog({
      profileId: profile.id,

      faculty: profile.name,

      subject: session.subjectCode,

      section: session.sectionCode,

      date: attendanceDate,

      present: result.summary.present,

      absent: result.summary.absent,

      noClass: result.summary.noClass,

      status: "BLOCKED_MIXED_NO_CLASS",
    });

    return;
  }

  // ===================================================
  // 13. ERP COVERAGE
  // ===================================================

  const erpCoverage =
    erpStudents.length > 0
      ? (result.summary.matched / erpStudents.length) * 100
      : 0;

  // ===================================================
  // 14. MAPPING SUMMARY
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

  // ===================================================
  // 15. ERP STUDENTS MISSING FROM SHEET
  // ===================================================

  if (result.erpOnly.length > 0) {
    console.log("\n❌ SHEET MAPPING REJECTED");

    console.log("Some ERP students are missing from the Google Sheet.");

    console.log("\nERP-only students:");

    for (const student of result.erpOnly) {
      console.log(student.registrationNo ?? student.studentId);
    }

    writeAuditLog({
      profileId: profile.id,

      faculty: profile.name,

      subject: session.subjectCode,

      section: session.sectionCode,

      date: attendanceDate,

      erpStudents: result.summary.erpStudents,

      matched: result.summary.matched,

      erpOnly: result.summary.erpOnly,

      status: "BLOCKED_ROSTER_MISMATCH",
    });

    return;
  }

  console.log("\n✅ Sheet mapping verified");

  // ===================================================
  // 16. ATTENDANCE SUMMARY
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

  console.log(`No Class     : ${result.summary.noClass}`);

  console.log(`Blank/Invalid: ${result.summary.invalidAttendance}`);

  // ===================================================
  // 17. ABSENTEES
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
  // 18. INVALID ATTENDANCE
  // ===================================================

  if (result.invalidAttendance.length > 0) {
    console.log("\n--- BLANK / INVALID ATTENDANCE ---");

    for (const student of result.invalidAttendance) {
      console.log(
        `${student.registrationNo} | ${student.name} | ${student.rawAttendance ?? ""}`,
      );
    }
  }

  // ===================================================
  // 19. SHEET-ONLY STUDENTS
  // ===================================================

  if (result.sheetOnly.length > 0) {
    console.log("\n⚠️ SHEET-ONLY STUDENTS (IGNORED)");

    for (const student of result.sheetOnly) {
      console.log(`${student.registrationNo} | ${student.name}`);
    }
  }

  // ===================================================
  // 20. HARD SAFETY CHECK
  // ===================================================

  const safeToSubmit = canSubmitAttendance({
    result,
    erpStudents,
  });

  if (!safeToSubmit) {
    console.log("\n==============================");

    console.log(" ❌ VALIDATION FAILED");

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

      noClass: result.summary.noClass,

      total: result.records.length,

      invalidAttendance: result.summary.invalidAttendance,

      erpOnly: result.summary.erpOnly,

      status: "BLOCKED_VALIDATION",
    });

    return;
  }

  console.log("\n==============================");

  console.log(" ✅ VALIDATION PASSED");

  console.log("==============================");

  // ===================================================
  // 21. BUILD ERP PAYLOAD
  // ===================================================

  const payload = buildAttendancePayload({
    timetableEntryId: session.timetableEntryId,

    date: attendanceDate,

    slotId: session.slotId,

    records: result.records,
  });

  // ===================================================
  // 22. DRY RUN
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

    console.log();

    console.log("To submit this attendance:");

    console.log("npm start -- --submit");

    return;
  }

  // ===================================================
  // 23. FINAL HUMAN CONFIRMATION
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
  // 24. SUBMIT
  // ===================================================

  console.log("\nSubmitting attendance...");

  const response = await submitAttendance(payload, cookie);

  const data = response.data;

  if (!data) {
    throw new Error("ERP returned no attendance data.");
  }

  // ===================================================
  // 25. ERP RESPONSE
  // ===================================================

  console.log("\n==============================");

  console.log(" ERP RESPONSE");

  console.log("==============================");

  console.log(`Success: ${response.success}`);

  console.log(`Message: ${response.message ?? ""}`);

  console.log(`ERP total   : ${data.totalStudents}`);

  console.log(`ERP present : ${data.presentCount}`);

  console.log(`ERP absent  : ${data.absentCount}`);

  // ===================================================
  // 26. VERIFY COUNTS
  // ===================================================

  const countsMatch =
    Number(data.totalStudents) === result.records.length &&
    Number(data.presentCount) === result.summary.present &&
    Number(data.absentCount) === result.summary.absent;

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

    console.log("\n⚠️ ATTENDANCE SAVED BUT ERP COUNTS DO NOT MATCH LOCAL DATA");

    return;
  }

  // ===================================================
  // 27. SUCCESS AUDIT
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

  console.log(" ✅ ATTENDANCE SUBMITTED");

  console.log("==============================");

  console.log("ERP response matches Google Sheet attendance.");
}
