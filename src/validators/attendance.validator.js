export function isAttendanceAlreadyMarked(session) {
  return (
    Boolean(session.id) ||
    (Array.isArray(session.records) && session.records.length > 0) ||
    Number(session.totalStudents ?? 0) > 0
  );
}

export function canSubmitAttendance({ result, erpStudents }) {
  if (!result) {
    return false;
  }

  if (!Array.isArray(erpStudents)) {
    return false;
  }

  return (
    result.erpOnly.length === 0 &&
    result.invalidAttendance.length === 0 &&
    result.noClass.length === 0 &&
    result.records.length === erpStudents.length
  );
}
