import inquirer from "inquirer";

import {
  getTodaySessions,
  getSessionsByDate,
  getTimetableEntriesForWeek,
} from "../services/erp.service.js";

// =====================================================
// DATE HELPERS
// =====================================================

function getDatePart(value) {
  return String(value ?? "")
    .trim()
    .split("T")[0];
}

// =====================================================
// VALIDATE YYYY-MM-DD
// =====================================================

function isValidDateInput(value) {
  const trimmed = String(value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return false;
  }

  const [year, month, day] = trimmed.split("-").map(Number);

  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

// =====================================================
// FUTURE DATE CHECK
// =====================================================

function isFutureDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);

  const selected = new Date(year, month - 1, day);

  selected.setHours(0, 0, 0, 0);

  const today = new Date();

  today.setHours(0, 0, 0, 0);

  return selected > today;
}

// =====================================================
// CALCULATE MONDAY FOR SELECTED DATE
// =====================================================

function getWeekStart(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);

  const date = new Date(year, month - 1, day);

  const weekday = date.getDay();

  // JS:
  // Sunday = 0
  // Monday = 1
  // ...
  // Saturday = 6

  const difference = weekday === 0 ? -6 : 1 - weekday;

  date.setDate(date.getDate() + difference);

  const weekYear = date.getFullYear();

  const weekMonth = String(date.getMonth() + 1).padStart(2, "0");

  const weekDay = String(date.getDate()).padStart(2, "0");

  return `${weekYear}-` + `${weekMonth}-` + `${weekDay}`;
}

// =====================================================
// SESSION LABEL
// =====================================================

function buildSessionLabel(session) {
  const subject = session.subjectCode || session.subjectName || "SUBJECT";

  const section = session.sectionCode || session.sectionName || "SECTION";

  const time = `${session.startTime ?? ""}` + `-${session.endTime ?? ""}`;

  let status = "";

  if (session.isLocked) {
    status = " | 🔒 LOCKED";
  } else if (
    Boolean(session.id) ||
    (Array.isArray(session.records) && session.records.length > 0) ||
    Number(session.totalStudents ?? 0) > 0
  ) {
    status = " | ✅ MARKED";
  }

  return `${subject} | ` + `${section} | ` + `${time}` + status;
}

// =====================================================
// SELECT MODE
// =====================================================

async function selectAttendanceMode() {
  const answer = await inquirer.prompt([
    {
      type: "select",

      name: "mode",

      message: "Select attendance mode:",

      choices: [
        {
          name: "Today",

          value: "today",
        },

        {
          name: "Previous Date",

          value: "historical",
        },
      ],
    },
  ]);

  return answer.mode;
}

// =====================================================
// ASK PREVIOUS DATE
// =====================================================

async function askHistoricalDate() {
  const answer = await inquirer.prompt([
    {
      type: "input",

      name: "date",

      message: "Enter attendance date (YYYY-MM-DD):",

      filter(value) {
        return String(value ?? "").trim();
      },

      validate(value) {
        const date = String(value ?? "").trim();

        if (!isValidDateInput(date)) {
          return "Enter a valid date in YYYY-MM-DD format.";
        }

        if (isFutureDate(date)) {
          return "Future attendance dates are not allowed.";
        }

        return true;
      },
    },
  ]);

  return answer.date;
}

// =====================================================
// FIND EXISTING ATTENDANCE SESSION
// =====================================================

function findExistingAttendanceSession(timetableEntry, attendanceSessions) {
  // Best possible match:
  // attendance session explicitly references timetable entry.

  const exact = attendanceSessions.find(
    (session) => session.timetableEntryId === timetableEntry.id,
  );

  if (exact) {
    return exact;
  }

  // Fallback matching in case ERP changes behavior.

  const timetableDate = getDatePart(timetableEntry.date);

  return (
    attendanceSessions.find(
      (session) =>
        session.sectionId === timetableEntry.sectionId &&
        getDatePart(session.date) === timetableDate &&
        session.slotId === timetableEntry.slotId,
    ) ?? null
  );
}

// =====================================================
// NORMALIZE HISTORICAL TIMETABLE ENTRY
//
// Critical:
//
// timetableEntry.id
//     ≠
// attendanceSession.id
//
// Existing duplicate protection uses session.id,
// so we deliberately keep them separate.
// =====================================================

function normalizeHistoricalSession(timetableEntry, attendanceSession) {
  return {
    // Attendance-session ID.
    // Null means attendance has NOT yet been created.
    id: attendanceSession?.id ?? null,

    // Timetable entry ID required by POST /mark.
    timetableEntryId: timetableEntry.id,

    date: timetableEntry.date,

    topic: attendanceSession?.topic ?? null,

    isLocked: Boolean(timetableEntry.isLocked || attendanceSession?.isLocked),

    isCancelled: Boolean(timetableEntry.isCancelled),

    slotId: timetableEntry.slotId,

    periodIndex: attendanceSession?.periodIndex ?? 1,

    periodCount:
      attendanceSession?.periodCount ?? timetableEntry.spanSlots ?? 1,

    startTime: timetableEntry.startTime,

    endTime: timetableEntry.endTime,

    room: timetableEntry.room,

    sectionId: timetableEntry.sectionId,

    sectionCode: timetableEntry.sectionCode,

    sectionName: timetableEntry.sectionName,

    courseOfferingId: timetableEntry.courseOfferingId,

    subjectId: timetableEntry.subjectId,

    subjectCode: timetableEntry.subjectCode,

    subjectName: timetableEntry.subjectName,

    subjectType: timetableEntry.subjectType,

    facultyId: timetableEntry.facultyId,

    facultyName: timetableEntry.facultyName,

    sessionType: timetableEntry.sessionType,

    totalStudents: attendanceSession?.totalStudents ?? 0,

    presentCount: attendanceSession?.presentCount ?? 0,

    absentCount: attendanceSession?.absentCount ?? 0,

    records: attendanceSession?.records ?? [],

    // Keep source information for troubleshooting.
    source: "historical-timetable",

    timetableEntryRaw: timetableEntry,
  };
}

// =====================================================
// LOAD HISTORICAL SESSIONS
// =====================================================

async function loadHistoricalSessions(date, cookie) {
  const weekStart = getWeekStart(date);

  console.log(`\nHistorical week starts: ${weekStart}`);

  console.log("Fetching ERP timetable...");

  const timetableEntries = await getTimetableEntriesForWeek(weekStart, cookie);

  if (!Array.isArray(timetableEntries)) {
    throw new Error("ERP timetable response is invalid.");
  }

  // ===================================================
  // EXACT DATE ONLY
  // ===================================================

  const entriesForDate = timetableEntries.filter(
    (entry) => getDatePart(entry.date) === date,
  );

  // ===================================================
  // REMOVE CANCELLED CLASSES
  // ===================================================

  const activeEntries = entriesForDate.filter((entry) => !entry.isCancelled);

  if (activeEntries.length === 0) {
    return [];
  }

  console.log(`Scheduled classes found: ${activeEntries.length}`);

  // ===================================================
  // FETCH EXISTING ATTENDANCE RECORDS
  // ===================================================

  console.log("Checking existing attendance...");

  const attendanceSessions = await getSessionsByDate(date, cookie);

  const existingSessions = Array.isArray(attendanceSessions)
    ? attendanceSessions
    : [];

  // ===================================================
  // MERGE TIMETABLE + ATTENDANCE
  // ===================================================

  return activeEntries.map((entry) => {
    const existing = findExistingAttendanceSession(entry, existingSessions);

    return normalizeHistoricalSession(entry, existing);
  });
}

// =====================================================
// UNMAPPED WARNINGS
// =====================================================

function showUnmappedSessions(sessions, profile) {
  const classMappings = profile.classMappings ?? {};

  const unmapped = sessions.filter(
    (session) => !classMappings[session.sectionCode],
  );

  if (unmapped.length === 0) {
    return;
  }

  console.log("\n==============================");

  console.log(" ⚠️ UNMAPPED ERP CLASSES");

  console.log("==============================");

  for (const session of unmapped) {
    console.log(buildSessionLabel(session));
  }

  console.log();

  console.log("Run npm run setup to configure these classes.");
}

// =====================================================
// FILTER MAPPED
// =====================================================

function getMappedSessions(sessions, profile) {
  const classMappings = profile.classMappings ?? {};

  return sessions.filter((session) =>
    Boolean(classMappings[session.sectionCode]),
  );
}

// =====================================================
// SELECT SESSION
// =====================================================

export async function selectAttendanceSession({ profile, cookie }) {
  const mode = await selectAttendanceMode();

  let sessions;
  let selectedDate;

  // ===================================================
  // TODAY
  // ===================================================

  if (mode === "today") {
    console.log("\nFetching today's ERP sessions...");

    sessions = await getTodaySessions(cookie);
  }

  // ===================================================
  // HISTORICAL
  // ===================================================
  else {
    selectedDate = await askHistoricalDate();

    console.log(`\nLoading historical attendance for ${selectedDate}...`);

    sessions = await loadHistoricalSessions(selectedDate, cookie);
  }

  // ===================================================
  // EMPTY
  // ===================================================

  if (!Array.isArray(sessions) || sessions.length === 0) {
    if (mode === "historical") {
      throw new Error(`No scheduled ERP classes found for ${selectedDate}.`);
    }

    throw new Error("No ERP sessions found for today.");
  }

  console.log();

  console.log(
    mode === "historical"
      ? `Scheduled classes on ${selectedDate}: ${sessions.length}`
      : `ERP sessions today: ${sessions.length}`,
  );

  // ===================================================
  // WARN UNMAPPED
  // ===================================================

  showUnmappedSessions(sessions, profile);

  // ===================================================
  // MAPPED CLASSES ONLY
  // ===================================================

  const mappedSessions = getMappedSessions(sessions, profile);

  if (mappedSessions.length === 0) {
    throw new Error("No mapped ERP classes were found. Run npm run setup.");
  }

  // ===================================================
  // ONE CLASS
  // ===================================================

  if (mappedSessions.length === 1) {
    const session = mappedSessions[0];

    console.log(`\nUsing class: ${buildSessionLabel(session)}`);

    return session;
  }

  // ===================================================
  // SELECT CLASS
  // ===================================================

  const answer = await inquirer.prompt([
    {
      type: "select",

      name: "session",

      message: "Select class:",

      choices: mappedSessions.map((session) => ({
        name: buildSessionLabel(session),

        value: session,
      })),
    },
  ]);

  return answer.session;
}
