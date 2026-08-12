export function buildAttendancePayload({
  timetableEntryId,
  date,
  slotId,
  records,
}) {
  if (!timetableEntryId) {
    throw new Error("timetableEntryId is required");
  }

  if (!date) {
    throw new Error("Attendance date is required");
  }

  if (!slotId) {
    throw new Error("slotId is required");
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Attendance records are empty");
  }

  return {
    timetableEntryId,
    date,
    slotId,
    records,
    lock: false,
  };
}
