export function getAttendanceDateValues(sessionDate) {
  if (!sessionDate) {
    throw new Error("Selected ERP session has no date.");
  }

  const datePart = String(sessionDate).trim().split("T")[0];

  const [year, month, day] = datePart.split("-");

  if (!year || !month || !day) {
    throw new Error(`Invalid ERP session date: ${sessionDate}`);
  }

  return {
    attendanceDate: `${year}-${month}-${day}`,

    attendanceColumn: `${Number(month)}/${Number(day)}/${year}`,
  };
}
