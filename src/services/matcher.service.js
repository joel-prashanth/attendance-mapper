import {
  normalizeAttendance,
  normalizeRegistrationNo,
} from "../utils/attendance.js";

export function matchAttendance({
  sheetStudents,
  erpStudents,
  attendanceColumn,
}) {
  const sheetMap = new Map();

  for (const student of sheetStudents) {
    const registrationNo = normalizeRegistrationNo(student.registrationNo);

    if (!registrationNo) continue;

    sheetMap.set(registrationNo, student);
  }

  const erpMap = new Map();

  for (const student of erpStudents) {
    const registrationNo = normalizeRegistrationNo(student.registrationNo);

    if (!registrationNo) continue;

    erpMap.set(registrationNo, student);
  }

  const matched = [];
  const erpOnly = [];
  const sheetOnly = [];

  for (const erpStudent of erpStudents) {
    const registrationNo = normalizeRegistrationNo(erpStudent.registrationNo);

    const sheetStudent = sheetMap.get(registrationNo);

    if (!sheetStudent) {
      erpOnly.push(erpStudent);
      continue;
    }

    const attendance = normalizeAttendance(sheetStudent[attendanceColumn]);

    matched.push({
      registrationNo,
      studentId: erpStudent.studentId,

      name: `${erpStudent.firstName ?? ""} ${erpStudent.lastName ?? ""}`.trim(),

      sheetName: sheetStudent.name,

      attendance,
    });
  }

  for (const sheetStudent of sheetStudents) {
    const registrationNo = normalizeRegistrationNo(sheetStudent.registrationNo);

    if (!erpMap.has(registrationNo)) {
      sheetOnly.push(sheetStudent);
    }
  }

  const invalidAttendance = matched.filter((student) => !student.attendance);

  const records = matched
    .filter((student) => student.attendance)
    .map((student) => ({
      studentId: student.studentId,
      status: student.attendance,
    }));

  return {
    matched,
    sheetOnly,
    erpOnly,
    invalidAttendance,
    records,

    summary: {
      sheetStudents: sheetStudents.length,
      erpStudents: erpStudents.length,
      matched: matched.length,
      sheetOnly: sheetOnly.length,
      erpOnly: erpOnly.length,

      present: records.filter((record) => record.status === "PRESENT").length,

      absent: records.filter((record) => record.status === "ABSENT").length,

      invalidAttendance: invalidAttendance.length,
    },
  };
}
