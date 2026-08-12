export function validateSheet({ rows, sheetName, attendanceColumn }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Google Sheet tab "${sheetName}" returned no students.`);
  }

  const columns = Object.keys(rows[0]);

  if (!columns.includes("Registration Number")) {
    throw new Error(
      `Column "Registration Number" does not exist in ${sheetName}.`,
    );
  }

  if (!columns.includes(attendanceColumn)) {
    const dateColumns = columns.filter((column) =>
      /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(column),
    );

    const available = dateColumns.length ? dateColumns.join(", ") : "none";

    throw new Error(
      `Attendance column "${attendanceColumn}" does not exist in ${sheetName}. Available date columns: ${available}`,
    );
  }
}
