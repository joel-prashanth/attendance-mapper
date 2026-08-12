import fetch from "node-fetch";

const ERP_BASE = "https://admissionsserver.aurora.edu.in/api/v1";

export async function getTodaySessions(cookie) {
  const response = await fetch(`${ERP_BASE}/attendance/sessions/today`, {
    headers: {
      Cookie: cookie,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch today's sessions: ${response.status}`);
  }

  const body = await response.json();

  return body.data;
}

export async function getRoster(sectionId, courseOfferingId, cookie) {
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

  if (!response.ok) {
    throw new Error(`Failed to fetch ERP roster: ${response.status}`);
  }

  const body = await response.json();

  return body.data;
}

export async function submitAttendance(payload, cookie) {
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

  const rawBody = await response.text();

  console.log("\n--- RAW ERP SUBMISSION RESPONSE ---");
  console.log("Status:", response.status);
  console.log(rawBody);

  let body;

  try {
    body = JSON.parse(rawBody);
  } catch {
    body = {
      raw: rawBody,
    };
  }

  if (!response.ok) {
    throw new Error(`Attendance submission failed (${response.status})`);
  }

  return body;
}
