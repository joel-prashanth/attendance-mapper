import {
  normalizeAttendance,
  normalizeRegistrationNo,
} from "../utils/attendance.js";

export function matchAttendance({
  sheetStudents,
  erpStudents,
  attendanceColumn,
}) {
  if (!Array.isArray(sheetStudents)) {
    throw new Error("sheetStudents must be an array.");
  }

  if (!Array.isArray(erpStudents)) {
    throw new Error("erpStudents must be an array.");
  }

  if (!attendanceColumn) {
    throw new Error("attendanceColumn is required.");
  }

  // =====================================================
  // BUILD SHEET MAP
  // =====================================================

  const sheetMap = new Map();

  for (const student of sheetStudents) {
    const registrationNo = normalizeRegistrationNo(student.registrationNo);

    if (!registrationNo) {
      continue;
    }

    sheetMap.set(registrationNo, student);
  }

  // =====================================================
  // BUILD ERP MAP
  // =====================================================

  const erpMap = new Map();

  for (const student of erpStudents) {
    const registrationNo = normalizeRegistrationNo(student.registrationNo);

    if (!registrationNo) {
      continue;
    }

    erpMap.set(registrationNo, student);
  }

  // =====================================================
  // RESULT COLLECTIONS
  // =====================================================

  const matched = [];

  const sheetOnly = [];

  const erpOnly = [];

  const invalidAttendance = [];

  const noClass = [];

  const records = [];

  // =====================================================
  // MATCH ERP STUDENTS AGAINST SHEET
  // =====================================================

  for (const [registrationNo, erpStudent] of erpMap) {
    const sheetStudent = sheetMap.get(registrationNo);

    if (!sheetStudent) {
      erpOnly.push(erpStudent);

      continue;
    }

    const rawAttendance = sheetStudent[attendanceColumn];

    const attendance = normalizeAttendance(rawAttendance);

    const matchedStudent = {
      registrationNo,

      name: sheetStudent.name,

      studentId: erpStudent.studentId,

      attendance,

      rawAttendance,

      erpStudent,

      sheetStudent,
    };

    matched.push(matchedStudent);

    // =================================================
    // NO CLASS
    // =================================================

    if (attendance === "NO_CLASS") {
      noClass.push(matchedStudent);

      continue;
    }

    // =================================================
    // INVALID / BLANK
    // =================================================

    if (!attendance) {
      invalidAttendance.push(matchedStudent);

      continue;
    }

    // =================================================
    // VALID ERP RECORD
    // =================================================

    records.push({
      studentId: erpStudent.studentId,

      status: attendance,
    });
  }

  // =====================================================
  // SHEET-ONLY STUDENTS
  // =====================================================

  for (const [registrationNo, sheetStudent] of sheetMap) {
    if (!erpMap.has(registrationNo)) {
      sheetOnly.push({
        registrationNo,

        name: sheetStudent.name,

        ...sheetStudent,
      });
    }
  }

  // =====================================================
  // COUNTS
  // =====================================================

  const present = matched.filter(
    (student) => student.attendance === "PRESENT",
  ).length;

  const absent = matched.filter(
    (student) => student.attendance === "ABSENT",
  ).length;

  // =====================================================
  // DETECT NO-CLASS STATE
  // =====================================================

  const allMatchedAreNoClass =
    matched.length > 0 && noClass.length === matched.length;

  const mixedNoClass = noClass.length > 0 && noClass.length < matched.length;

  return {
    matched,

    sheetOnly,

    erpOnly,

    invalidAttendance,

    noClass,

    records,

    allMatchedAreNoClass,

    mixedNoClass,

    summary: {
      sheetStudents: sheetStudents.length,

      erpStudents: erpStudents.length,

      matched: matched.length,

      sheetOnly: sheetOnly.length,

      erpOnly: erpOnly.length,

      present,

      absent,

      noClass: noClass.length,

      invalidAttendance: invalidAttendance.length,
    },
  };
}
