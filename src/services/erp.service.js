import fetch from "node-fetch";

const ERP_BASE = "https://admissionsserver.aurora.edu.in/api/v1";

function throwIfUnauthorized(response) {
  if (response.status === 401 || response.status === 403) {
    throw new Error("ERP session expired or unauthorized. Run: npm run auth");
  }
}

// =====================================================
// TODAY'S FACULTY SESSIONS
// =====================================================

export async function getTodaySessions(cookie) {
  if (!cookie) {
    throw new Error("ERP authentication cookie is required.");
  }

  const response = await fetch(`${ERP_BASE}/attendance/sessions/today`, {
    headers: {
      Cookie: cookie,

      Accept: "application/json, text/plain, */*",

      Origin: "https://admissions.aurora.edu.in",

      Referer:
        "https://admissions.aurora.edu.in/faculty-portal/faculty/attendance",
    },
  });

  throwIfUnauthorized(response);

  if (!response.ok) {
    throw new Error(`Failed to fetch today's sessions: ${response.status}`);
  }

  const body = await response.json();

  if (!body?.success) {
    throw new Error(body?.message || "ERP failed to return today's sessions.");
  }

  return body.data;
}

// =====================================================
// SECTION ROSTER
// =====================================================

export async function getRoster(sectionId, courseOfferingId, cookie) {
  if (!sectionId) {
    throw new Error("sectionId is required.");
  }

  if (!courseOfferingId) {
    throw new Error("courseOfferingId is required.");
  }

  if (!cookie) {
    throw new Error("ERP authentication cookie is required.");
  }

  const url =
    `${ERP_BASE}/attendance/sections/${sectionId}/roster` +
    `?courseOfferingId=${courseOfferingId}`;

  const response = await fetch(url, {
    headers: {
      Cookie: cookie,

      Accept: "application/json, text/plain, */*",

      Origin: "https://admissions.aurora.edu.in",

      Referer:
        "https://admissions.aurora.edu.in/faculty-portal/faculty/attendance",
    },
  });

  throwIfUnauthorized(response);

  if (!response.ok) {
    throw new Error(`Failed to fetch ERP roster: ${response.status}`);
  }

  const body = await response.json();

  if (!body?.success) {
    throw new Error(body?.message || "ERP failed to return roster.");
  }

  return body.data;
}

// =====================================================
// SUBMIT ATTENDANCE
// =====================================================

export async function submitAttendance(payload, cookie) {
  if (!payload) {
    throw new Error("Attendance payload is required.");
  }

  if (!cookie) {
    throw new Error("ERP authentication cookie is required.");
  }

  const url = `${ERP_BASE}/attendance/sessions/mark`;

  const response = await fetch(url, {
    method: "POST",

    headers: {
      Cookie: cookie,

      "Content-Type": "application/json",

      Accept: "application/json, text/plain, */*",

      Origin: "https://admissions.aurora.edu.in",

      Referer:
        "https://admissions.aurora.edu.in/faculty-portal/faculty/attendance",
    },

    body: JSON.stringify(payload),
  });

  throwIfUnauthorized(response);

  const rawBody = await response.text();

  let body;

  try {
    body = JSON.parse(rawBody);
  } catch {
    body = {
      raw: rawBody,
    };
  }

  if (!response.ok) {
    const message =
      body?.message ||
      body?.error ||
      `Attendance submission failed (${response.status})`;

    throw new Error(message);
  }

  if (!body?.success) {
    throw new Error(body?.message || "ERP rejected attendance submission.");
  }

  return body;
}
