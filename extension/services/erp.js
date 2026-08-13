const API_BASE = "https://admissionsserver.aurora.edu.in/api/v1";

// =====================================================
// REQUEST
// =====================================================

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",

    ...options,

    headers: {
      Accept: "application/json",

      ...(options.body
        ? {
            "Content-Type": "application/json",
          }
        : {}),

      ...(options.headers ?? {}),
    },
  });

  let data = null;

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    const text = await response.text();

    data = text
      ? {
          message: text,
        }
      : null;
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "Aurora ERP login is required. Log into Aurora ERP in Chrome and try again.",
      );
    }

    throw new Error(
      data?.message ?? `Aurora ERP request failed. HTTP ${response.status}.`,
    );
  }

  return data;
}

// =====================================================
// ARRAY NORMALIZER
// =====================================================

function extractArray(response, possibleKeys = []) {
  if (Array.isArray(response)) {
    return response;
  }

  for (const key of possibleKeys) {
    if (Array.isArray(response?.[key])) {
      return response[key];
    }
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  if (response?.data && typeof response.data === "object") {
    for (const key of possibleKeys) {
      if (Array.isArray(response.data[key])) {
        return response.data[key];
      }
    }
  }

  return [];
}

// =====================================================
// DATE HELPERS
// =====================================================

function toDateKey(value) {
  if (!value) {
    return null;
  }

  const stringValue = String(value);

  const direct = stringValue.match(/^(\d{4}-\d{2}-\d{2})/);

  if (direct) {
    return direct[1];
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getCurrentDateKey() {
  const now = new Date();

  const year = now.getFullYear();

  const month = String(now.getMonth() + 1).padStart(2, "0");

  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getMonday(dateValue) {
  const dateKey = toDateKey(dateValue);

  if (!dateKey) {
    throw new Error("Invalid date.");
  }

  const date = new Date(`${dateKey}T12:00:00`);

  const day = date.getDay();

  const offset = day === 0 ? -6 : 1 - day;

  date.setDate(date.getDate() + offset);

  return toDateKey(date);
}

// =====================================================
// LOGIN
// =====================================================

export async function verifyLogin() {
  const response = await apiRequest("/attendance/sessions/today");

  return extractArray(response, ["sessions", "attendanceSessions"]);
}

// =====================================================
// TIMETABLE
// =====================================================

export async function getTimetableForWeek(weekStart) {
  const response = await apiRequest(
    `/timetable/entries/mine?weekStart=${encodeURIComponent(weekStart)}`,
  );

  return extractArray(response, ["entries", "timetableEntries"]);
}

// =====================================================
// FACULTY CLASSES
// =====================================================

export async function getFacultyClasses() {
  const weekStart = getMonday(getCurrentDateKey());

  const entries = await getTimetableForWeek(weekStart);

  const classes = new Map();

  for (const entry of entries) {
    if (entry.isCancelled) {
      continue;
    }

    if (!entry.sectionCode || !entry.sectionId || !entry.courseOfferingId) {
      continue;
    }

    const key = `${entry.sectionId}|${entry.courseOfferingId}`;

    if (!classes.has(key)) {
      classes.set(key, {
        sectionId: entry.sectionId,

        sectionCode: entry.sectionCode,

        sectionName: entry.sectionName,

        courseOfferingId: entry.courseOfferingId,

        subjectId: entry.subjectId,

        subjectCode: entry.subjectCode,

        subjectName: entry.subjectName,

        facultyName: entry.facultyName,

        rooms: [],
      });
    }

    const value = classes.get(key);

    if (entry.room && !value.rooms.includes(entry.room)) {
      value.rooms.push(entry.room);
    }
  }

  return [...classes.values()];
}

// =====================================================
// TODAY
// =====================================================

export async function getTodaySessions() {
  const response = await apiRequest("/attendance/sessions/today");

  return extractArray(response, ["sessions", "attendanceSessions"]);
}

// =====================================================
// EXISTING ATTENDANCE BY DATE
// =====================================================

export async function getAttendanceSessionsByDate(date) {
  const response = await apiRequest(
    `/attendance/sessions?fromDate=${encodeURIComponent(
      date,
    )}&toDate=${encodeURIComponent(date)}`,
  );

  return extractArray(response, ["sessions", "attendanceSessions"]);
}

// =====================================================
// HISTORICAL SESSIONS
// =====================================================

export async function getHistoricalSessions(date) {
  const selectedDate = toDateKey(date);

  if (!selectedDate) {
    throw new Error("Invalid historical attendance date.");
  }

  const weekStart = getMonday(selectedDate);

  const [timetableEntries, attendanceSessions] = await Promise.all([
    getTimetableForWeek(weekStart),

    getAttendanceSessionsByDate(selectedDate),
  ]);

  const scheduled = timetableEntries.filter(
    (entry) => toDateKey(entry.date) === selectedDate && !entry.isCancelled,
  );

  return scheduled.map((entry) => {
    let existing = attendanceSessions.find(
      (session) =>
        session.timetableEntryId && session.timetableEntryId === entry.id,
    );

    if (!existing) {
      existing = attendanceSessions.find(
        (session) =>
          session.sectionId === entry.sectionId &&
          session.slotId === entry.slotId &&
          toDateKey(session.date) === selectedDate,
      );
    }

    return {
      // Existing attendance session ID only.
      id: existing?.id ?? null,

      timetableEntryId: entry.id,

      date: selectedDate,

      isLocked: existing?.isLocked ?? entry.isLocked ?? false,

      slotId: entry.slotId,

      periodIndex: existing?.periodIndex,

      periodCount: existing?.periodCount ?? entry.spanSlots,

      startTime: entry.startTime,

      endTime: entry.endTime,

      room: entry.room,

      sectionId: entry.sectionId,

      sectionCode: entry.sectionCode,

      sectionName: entry.sectionName,

      courseOfferingId: entry.courseOfferingId,

      subjectId: entry.subjectId,

      subjectCode: entry.subjectCode,

      subjectName: entry.subjectName,

      facultyId: existing?.facultyId,

      facultyName: entry.facultyName ?? existing?.facultyName,

      totalStudents: existing?.totalStudents ?? 0,

      presentCount: existing?.presentCount ?? 0,

      absentCount: existing?.absentCount ?? 0,

      records: existing?.records ?? [],
    };
  });
}

// =====================================================
// ROSTER
// =====================================================

export async function getRoster(sectionId, courseOfferingId) {
  const response = await apiRequest(
    `/attendance/sections/${encodeURIComponent(
      sectionId,
    )}/roster?courseOfferingId=${encodeURIComponent(courseOfferingId)}`,
  );

  return extractArray(response, ["roster", "students"]);
}

// =====================================================
// SUBMIT
// =====================================================

export async function submitAttendance(payload) {
  return apiRequest("/attendance/sessions/mark", {
    method: "POST",

    body: JSON.stringify(payload),
  });
}

// =====================================================
// DATE VALUES
// =====================================================

export function getAttendanceDateValues(date) {
  const attendanceDate = toDateKey(date);

  if (!attendanceDate) {
    throw new Error("Unable to determine attendance date.");
  }

  const [year, month, day] = attendanceDate.split("-").map(Number);

  const attendanceColumn = `${month}/${day}/${year}`;

  return {
    attendanceDate,
    attendanceColumn,
  };
}
