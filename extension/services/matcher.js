// =====================================================
// REGISTRATION NUMBER
// =====================================================

export function normalizeRegistrationNo(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

// =====================================================
// ATTENDANCE NORMALIZATION
// =====================================================

export function normalizeAttendance(value) {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");

  if (normalized === "PRESENT" || normalized === "P" || normalized === "1") {
    return "PRESENT";
  }

  if (normalized === "ABSENT" || normalized === "A" || normalized === "0") {
    return "ABSENT";
  }

  if (
    normalized === "NO CLASS" ||
    normalized === "NO_CLASS" ||
    normalized === "NOCLASS" ||
    normalized === "NO-CLASS"
  ) {
    return "NO_CLASS";
  }

  return null;
}

// =====================================================
// STUDENT NAME
// =====================================================

function getStudentName(student) {
  if (student.name) {
    return String(student.name).trim();
  }

  if (student.studentName) {
    return String(student.studentName).trim();
  }

  const parts = [student.firstName, student.middleName, student.lastName]
    .filter(Boolean)
    .map((value) => String(value).trim());

  return parts.join(" ");
}

// =====================================================
// MATCH ATTENDANCE
// =====================================================

export function matchAttendance({ rows, roster, attendanceColumn }) {
  if (!Array.isArray(rows)) {
    throw new Error("Google Sheet rows are invalid.");
  }

  if (!Array.isArray(roster)) {
    throw new Error("ERP roster is invalid.");
  }

  // ===================================================
  // BUILD SHEET MAP
  // ===================================================

  const sheetMap = new Map();

  const sheetRegistrations = new Set();

  for (const row of rows) {
    const registrationNo = normalizeRegistrationNo(row["Registration Number"]);

    if (!registrationNo) {
      continue;
    }

    sheetRegistrations.add(registrationNo);

    // Keep first occurrence.
    if (!sheetMap.has(registrationNo)) {
      sheetMap.set(registrationNo, row);
    }
  }

  // ===================================================
  // ERP REGISTRATIONS
  // ===================================================

  const erpRegistrations = new Set(
    roster
      .map((student) => normalizeRegistrationNo(student.registrationNo))
      .filter(Boolean),
  );

  // ===================================================
  // MATCH
  // ===================================================

  const matched = [];
  const erpOnly = [];
  const invalid = [];
  const noClass = [];
  const records = [];

  for (const student of roster) {
    const registrationNo = normalizeRegistrationNo(student.registrationNo);

    if (!registrationNo) {
      continue;
    }

    const sheetRow = sheetMap.get(registrationNo);

    if (!sheetRow) {
      erpOnly.push({
        studentId: student.studentId ?? student.id,

        registrationNo,

        name: getStudentName(student),
      });

      continue;
    }

    const rawAttendance = sheetRow[attendanceColumn];

    const attendance = normalizeAttendance(rawAttendance);

    const matchedStudent = {
      studentId: student.studentId ?? student.id,

      registrationNo,

      name: getStudentName(student),

      attendance,

      rawAttendance,
    };

    matched.push(matchedStudent);

    if (attendance === "NO_CLASS") {
      noClass.push(matchedStudent);

      continue;
    }

    if (!attendance) {
      invalid.push(matchedStudent);

      continue;
    }

    records.push({
      studentId: matchedStudent.studentId,

      status: attendance,
    });
  }

  // ===================================================
  // SHEET-ONLY STUDENTS
  // ===================================================

  const sheetOnly = [];

  for (const registrationNo of sheetRegistrations) {
    if (erpRegistrations.has(registrationNo)) {
      continue;
    }

    const row = sheetMap.get(registrationNo);

    sheetOnly.push({
      registrationNo,

      name: String(
        row?.["NAME AS PER SSC"] ?? row?.Name ?? row?.NAME ?? "",
      ).trim(),
    });
  }

  // ===================================================
  // COUNTS
  // ===================================================

  const present = matched.filter(
    (student) => student.attendance === "PRESENT",
  ).length;

  const absent = matched.filter(
    (student) => student.attendance === "ABSENT",
  ).length;

  // ===================================================
  // NO CLASS STATE
  // ===================================================

  const allNoClass =
    roster.length > 0 &&
    erpOnly.length === 0 &&
    invalid.length === 0 &&
    noClass.length === roster.length;

  const mixedNoClass = noClass.length > 0 && !allNoClass;

  // ===================================================
  // SAFETY RULE
  // ===================================================

  const safe =
    erpOnly.length === 0 &&
    invalid.length === 0 &&
    noClass.length === 0 &&
    records.length === roster.length;

  return {
    matched,
    sheetOnly,
    erpOnly,
    invalid,
    noClass,
    records,
    present,
    absent,
    allNoClass,
    mixedNoClass,
    safe,
  };
}
