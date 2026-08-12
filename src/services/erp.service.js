import fetch from "node-fetch";

const ERP_BASE = "https://admissionsserver.aurora.edu.in/api/v1";

const ERP_ORIGIN = "https://admissions.aurora.edu.in";

// =====================================================
// AUTH ERROR
// =====================================================

function throwIfUnauthorized(response) {
  if (response.status === 401 || response.status === 403) {
    throw new Error("ERP session expired or unauthorized. Run: npm run auth");
  }
}

// =====================================================
// COMMON HEADERS
// =====================================================

function getHeaders(cookie) {
  return {
    Cookie: cookie,
    Accept: "application/json",
    Origin: ERP_ORIGIN,
    Referer: `${ERP_ORIGIN}/`,
  };
}

// =====================================================
// TODAY'S ATTENDANCE SESSIONS
// =====================================================

export async function getTodaySessions(cookie) {
  if (!cookie) {
    throw new Error("ERP cookie is required.");
  }

  const response = await fetch(`${ERP_BASE}/attendance/sessions/today`, {
    method: "GET",
    headers: getHeaders(cookie),
  });

  throwIfUnauthorized(response);

  if (!response.ok) {
    throw new Error(`Failed to fetch today's ERP sessions: ${response.status}`);
  }

  const body = await response.json();

  if (!body?.success) {
    throw new Error(
      body?.message || body?.error || "Failed to fetch today's ERP sessions.",
    );
  }

  return body.data ?? [];
}

// =====================================================
// ATTENDANCE SESSIONS BY DATE
//
// IMPORTANT:
// These appear to represent actual attendance sessions,
// not necessarily every timetable class.
// =====================================================

export async function getSessionsByDate(date, cookie) {
  if (!date) {
    throw new Error("Attendance date is required.");
  }

  if (!cookie) {
    throw new Error("ERP cookie is required.");
  }

  const url =
    `${ERP_BASE}/attendance/sessions` +
    `?fromDate=${encodeURIComponent(date)}` +
    `&toDate=${encodeURIComponent(date)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders(cookie),
  });

  throwIfUnauthorized(response);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch attendance sessions for ${date}: ${response.status}`,
    );
  }

  const body = await response.json();

  if (!body?.success) {
    throw new Error(
      body?.message ||
        body?.error ||
        `Failed to fetch attendance sessions for ${date}.`,
    );
  }

  return body.data ?? [];
}

// =====================================================
// FACULTY TIMETABLE ENTRIES FOR A WEEK
// =====================================================

export async function getTimetableEntriesForWeek(weekStart, cookie) {
  if (!weekStart) {
    throw new Error("weekStart is required.");
  }

  if (!cookie) {
    throw new Error("ERP cookie is required.");
  }

  const url =
    `${ERP_BASE}/timetable/entries/mine` +
    `?weekStart=${encodeURIComponent(weekStart)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders(cookie),
  });

  throwIfUnauthorized(response);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch timetable for week ${weekStart}: ${response.status}`,
    );
  }

  const body = await response.json();

  if (!body?.success) {
    throw new Error(
      body?.message ||
        body?.error ||
        `Failed to fetch timetable for week ${weekStart}.`,
    );
  }

  return body.data ?? [];
}

// =====================================================
// SPECIFIC SECTION + DATE ATTENDANCE SESSION
// =====================================================

export async function getSessionBySectionAndDate(sectionId, date, cookie) {
  if (!sectionId) {
    throw new Error("sectionId is required.");
  }

  if (!date) {
    throw new Error("Date is required.");
  }

  if (!cookie) {
    throw new Error("ERP cookie is required.");
  }

  const url =
    `${ERP_BASE}/attendance/sessions` +
    `?sectionId=${encodeURIComponent(sectionId)}` +
    `&date=${encodeURIComponent(date)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders(cookie),
  });

  throwIfUnauthorized(response);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch attendance session for ${date}: ${response.status}`,
    );
  }

  const body = await response.json();

  if (!body?.success) {
    throw new Error(
      body?.message ||
        body?.error ||
        `Failed to fetch attendance session for ${date}.`,
    );
  }

  return body.data ?? [];
}

// =====================================================
// ERP ROSTER
// =====================================================

export async function getRoster(sectionId, courseOfferingId, cookie) {
  if (!sectionId) {
    throw new Error("sectionId is required.");
  }

  if (!courseOfferingId) {
    throw new Error("courseOfferingId is required.");
  }

  if (!cookie) {
    throw new Error("ERP cookie is required.");
  }

  const url =
    `${ERP_BASE}/attendance/sections/` +
    `${encodeURIComponent(sectionId)}/roster` +
    `?courseOfferingId=${encodeURIComponent(courseOfferingId)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: getHeaders(cookie),
  });

  throwIfUnauthorized(response);

  if (!response.ok) {
    throw new Error(`Failed to fetch ERP roster: ${response.status}`);
  }

  const body = await response.json();

  if (!body?.success) {
    throw new Error(
      body?.message || body?.error || "Failed to fetch ERP roster.",
    );
  }

  return body.data ?? [];
}

// =====================================================
// SUBMIT ATTENDANCE
// =====================================================

export async function submitAttendance(payload, cookie) {
  if (!payload) {
    throw new Error("Attendance payload is required.");
  }

  if (!cookie) {
    throw new Error("ERP cookie is required.");
  }

  const response = await fetch(`${ERP_BASE}/attendance/sessions/mark`, {
    method: "POST",

    headers: {
      ...getHeaders(cookie),

      "Content-Type": "application/json",
    },

    body: JSON.stringify(payload),
  });

  const raw = await response.text();

  let body;

  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {
      success: false,
      message: raw,
    };
  }

  throwIfUnauthorized(response);

  if (!response.ok) {
    throw new Error(
      body?.message ||
        body?.error ||
        `ERP attendance submission failed: ${response.status}`,
    );
  }

  if (!body?.success) {
    throw new Error(
      body?.message || body?.error || "ERP rejected attendance submission.",
    );
  }

  return body;
}
