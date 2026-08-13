import {
  getProfile,
  saveProfile,
  getPrivacyConsent,
  savePrivacyConsent,
  clearAllExtensionData,
} from "./services/storage.js";

import {
  fetchSheet,
  tryFetchSheet,
  extractSpreadsheetId,
} from "./services/sheet.js";

import {
  matchAttendance,
  normalizeRegistrationNo,
} from "./services/matcher.js";

import {
  verifyLogin,
  getFacultyClasses,
  getTodaySessions,
  getHistoricalSessions,
  getRoster,
  submitAttendance,
  getAttendanceDateValues,
} from "./services/erp.js";

// =====================================================
// ELEMENTS
// =====================================================

const loginStatus = document.getElementById("loginStatus");

const consentSection = document.getElementById("consentSection");

const consentCheckbox = document.getElementById("consentCheckbox");

const acceptConsentButton = document.getElementById("acceptConsentButton");

const setupSection = document.getElementById("setupSection");

const attendanceSection = document.getElementById("attendanceSection");

const facultyNameInput = document.getElementById("facultyNameInput");

const spreadsheetInput = document.getElementById("spreadsheetInput");

const detectMappingsButton = document.getElementById("detectMappingsButton");

const mappingStatus = document.getElementById("mappingStatus");

const mappingResults = document.getElementById("mappingResults");

const saveSetupButton = document.getElementById("saveSetupButton");

const profileDisplay = document.getElementById("profileDisplay");

const settingsButton = document.getElementById("settingsButton");

const resetExtensionButton = document.getElementById("resetExtensionButton");

const modeSelect = document.getElementById("modeSelect");

const dateField = document.getElementById("dateField");

const dateInput = document.getElementById("dateInput");

const loadClassesButton = document.getElementById("loadClassesButton");

const classSection = document.getElementById("classSection");

const classSelect = document.getElementById("classSelect");

const previewButton = document.getElementById("previewButton");

const previewSection = document.getElementById("previewSection");

const previewInfo = document.getElementById("previewInfo");

const validationMessage = document.getElementById("validationMessage");

const absenteesSection = document.getElementById("absenteesSection");

const absenteesList = document.getElementById("absenteesList");

const invalidSection = document.getElementById("invalidSection");

const invalidList = document.getElementById("invalidList");

const submitButton = document.getElementById("submitButton");

const resultSection = document.getElementById("resultSection");

const resultOutput = document.getElementById("resultOutput");

// =====================================================
// STATE
// =====================================================

let profile = null;

let detectedFacultyName = null;

let facultyClasses = [];

let setupMappings = {};

let sessions = [];

let selectedSession = null;

let previewState = null;

// =====================================================
// DOM HELPERS
// =====================================================

function clearElement(element) {
  element.replaceChildren();
}

function createMessage(type, lines) {
  const box = document.createElement("div");

  box.className = `${type}-message`;

  lines.forEach((line, index) => {
    if (index > 0) {
      box.appendChild(document.createElement("br"));
    }

    box.appendChild(document.createTextNode(line));
  });

  return box;
}

function showMessage(target, type, lines) {
  target.replaceChildren(createMessage(type, lines));
}

function appendSummaryLine(container, label, value, bold = false) {
  const line = document.createElement("div");

  if (bold) {
    const strong = document.createElement("strong");

    strong.textContent = `${label}: ${value}`;

    line.appendChild(strong);
  } else {
    line.textContent = `${label}: ${value}`;
  }

  container.appendChild(line);
}

function appendSpacer(container) {
  const spacer = document.createElement("div");

  spacer.className = "summary-spacer";

  spacer.style.height = "12px";

  container.appendChild(spacer);
}

// =====================================================
// STATUS
// =====================================================

function setLoginStatus(message, type) {
  loginStatus.textContent = message;

  loginStatus.className = `status status-${type}`;
}

function showMappingStatus(message) {
  mappingStatus.textContent = message;

  mappingStatus.classList.remove("hidden");
}

// =====================================================
// STUDENT NAME HELPER
// =====================================================

function getRosterStudentName(student) {
  if (student?.name) {
    return String(student.name).trim();
  }

  if (student?.studentName) {
    return String(student.studentName).trim();
  }

  return [student?.firstName, student?.middleName, student?.lastName]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .join(" ");
}

// =====================================================
// ATTENDANCE SESSION STATE
// =====================================================

function alreadyMarked(session) {
  return (
    Boolean(session.id) ||
    (Array.isArray(session.records) && session.records.length > 0) ||
    Number(session.totalStudents ?? 0) > 0
  );
}

// =====================================================
// SHEET CANDIDATES
// =====================================================

function generateSheetCandidates(erpClass) {
  const sectionCode = String(erpClass.sectionCode ?? "")
    .trim()
    .toUpperCase();

  const rooms = erpClass.rooms ?? [];

  const candidates = new Set();

  const match = sectionCode.match(/CSE([A-Z]*)-(\d+)([A-Z])$/);

  if (!match) {
    return [];
  }

  const specialization = match[1];

  const erpYear = Number(match[2]);

  const sectionLetter = match[3];

  const sheetYear = Math.max(1, erpYear - 1);

  const csePart = specialization ? `CSE(${specialization})` : "CSE";

  for (const room of rooms) {
    if (!room) {
      continue;
    }

    candidates.add(`${room}-${csePart}-${sheetYear}${sectionLetter}`);
  }

  return [...candidates];
}

// =====================================================
// ROSTER COVERAGE
// =====================================================

function calculateRosterCoverage(rows, roster) {
  const sheetMap = new Map();

  // ---------------------------------------------------
  // BUILD GOOGLE SHEET REGISTRATION MAP
  // ---------------------------------------------------

  for (const row of rows) {
    const registrationNo = normalizeRegistrationNo(row["Registration Number"]);

    if (!registrationNo) {
      continue;
    }

    // Keep first occurrence if duplicate exists.
    if (!sheetMap.has(registrationNo)) {
      sheetMap.set(registrationNo, row);
    }
  }

  const matchedStudents = [];

  const missingStudents = [];

  // ---------------------------------------------------
  // COMPARE EVERY ERP STUDENT AGAINST SHEET
  // ---------------------------------------------------

  for (const student of roster) {
    const registrationNo = normalizeRegistrationNo(student.registrationNo);

    if (!registrationNo) {
      continue;
    }

    const studentName = getRosterStudentName(student);

    if (sheetMap.has(registrationNo)) {
      matchedStudents.push({
        registrationNo,
        name: studentName,
      });
    } else {
      missingStudents.push({
        registrationNo,
        name: studentName,
      });
    }
  }

  const matched = matchedStudents.length;

  const total = roster.length;

  const coverage = total > 0 ? (matched / total) * 100 : 0;

  return {
    matched,
    total,
    coverage,
    matchedStudents,
    missingStudents,
  };
}

// =====================================================
// VERIFY ONE MAPPING
// =====================================================

async function verifyMapping({ erpClass, spreadsheetId, sheetName }) {
  if (!sheetName) {
    return {
      verified: false,
      coverage: 0,
      matched: 0,
      total: 0,
      missingStudents: [],
      reason: "Sheet name is missing.",
    };
  }

  // ---------------------------------------------------
  // FETCH GOOGLE SHEET TAB
  // ---------------------------------------------------

  const sheetResult = await tryFetchSheet({
    spreadsheetId,
    sheetName,
  });

  if (!sheetResult.success) {
    return {
      verified: false,
      coverage: 0,
      matched: 0,
      total: 0,
      missingStudents: [],
      reason: sheetResult.error ?? "Unable to read Google Sheet tab.",
    };
  }

  // ---------------------------------------------------
  // FETCH ERP ROSTER
  // ---------------------------------------------------

  const roster = await getRoster(erpClass.sectionId, erpClass.courseOfferingId);

  if (!Array.isArray(roster) || roster.length === 0) {
    return {
      verified: false,
      coverage: 0,
      matched: 0,
      total: 0,
      missingStudents: [],
      reason: "ERP roster unavailable.",
    };
  }

  // ---------------------------------------------------
  // CALCULATE COVERAGE
  // ---------------------------------------------------

  const coverage = calculateRosterCoverage(sheetResult.rows, roster);

  let reason = null;

  if (coverage.coverage !== 100) {
    reason = `${coverage.matched}/${coverage.total} ERP students matched.`;

    if (coverage.missingStudents.length > 0) {
      const missingText = coverage.missingStudents
        .map((student) => {
          if (student.name) {
            return `${student.registrationNo} (${student.name})`;
          }

          return student.registrationNo;
        })
        .join(", ");

      reason += ` Missing from Sheet: ${missingText}`;
    }
  }

  return {
    verified: coverage.coverage === 100,

    coverage: coverage.coverage,

    matched: coverage.matched,

    total: coverage.total,

    matchedStudents: coverage.matchedStudents,

    missingStudents: coverage.missingStudents,

    reason,
  };
}

// =====================================================
// AUTO-DETECT
// =====================================================

async function autoDetectSheetForClass({ erpClass, spreadsheetId }) {
  const candidates = generateSheetCandidates(erpClass);

  let bestResult = null;

  // ---------------------------------------------------
  // TRY EVERY GENERATED CANDIDATE
  // ---------------------------------------------------

  for (const candidate of candidates) {
    const verification = await verifyMapping({
      erpClass,
      spreadsheetId,
      sheetName: candidate,
    });

    // Perfect match.
    if (verification.verified) {
      return {
        ...verification,
        sheetName: candidate,
      };
    }

    // Keep the candidate with the highest roster match.
    if (!bestResult || verification.matched > (bestResult.matched ?? 0)) {
      bestResult = {
        ...verification,
        sheetName: candidate,
      };
    }
  }

  // ---------------------------------------------------
  // RETURN BEST FAILED CANDIDATE
  //
  // This is important so 52/53 information is not lost.
  // ---------------------------------------------------

  if (bestResult) {
    return bestResult;
  }

  return {
    verified: false,

    sheetName: candidates[0] ?? "",

    coverage: 0,

    matched: 0,

    total: 0,

    missingStudents: [],

    reason:
      candidates.length === 0
        ? "Unable to generate a likely Google Sheet tab name for this ERP class."
        : "Automatic mapping could not be verified.",
  };
}

// =====================================================
// RENDER MAPPINGS
// =====================================================

function renderMappingResults() {
  clearElement(mappingResults);

  for (const erpClass of facultyClasses) {
    const mapping = setupMappings[erpClass.sectionCode];

    const card = document.createElement("div");

    card.className = "mapping-card";

    // -------------------------------------------------
    // ERP CLASS INFORMATION
    // -------------------------------------------------

    const classInfo = document.createElement("div");

    classInfo.className = "mapping-class";

    classInfo.appendChild(document.createTextNode(erpClass.sectionCode));

    const details = document.createElement("small");

    details.textContent =
      `${erpClass.subjectCode ?? ""} ` +
      `${erpClass.subjectName ?? ""} | ` +
      `Room(s): ${(erpClass.rooms ?? []).join(", ") || "—"}`;

    classInfo.appendChild(details);

    // -------------------------------------------------
    // SHEET INPUT
    // -------------------------------------------------

    const sheetWrapper = document.createElement("div");

    sheetWrapper.className = "mapping-sheet";

    const input = document.createElement("input");

    input.type = "text";

    input.value = mapping?.sheetName ?? "";

    input.placeholder = "Google Sheet tab name";

    sheetWrapper.appendChild(input);

    // -------------------------------------------------
    // DIAGNOSTICS
    // -------------------------------------------------

    const diagnostics = document.createElement("div");

    diagnostics.className = "mapping-diagnostics";

    sheetWrapper.appendChild(diagnostics);

    // -------------------------------------------------
    // VERIFICATION BADGE
    // -------------------------------------------------

    const badge = document.createElement("div");

    function refreshBadge() {
      const current = setupMappings[erpClass.sectionCode];

      diagnostics.replaceChildren();

      // ===============================================
      // VERIFIED
      // ===============================================

      if (current?.verified) {
        badge.textContent = "✓ Verified";

        badge.className = "mapping-badge success";

        const verifiedMessage = document.createElement("div");

        verifiedMessage.className = "mapping-verified-summary";

        if (current.total && current.matched) {
          verifiedMessage.textContent = `${current.matched}/${current.total} ERP students matched.`;
        } else {
          verifiedMessage.textContent = "ERP roster matched successfully.";
        }

        diagnostics.appendChild(verifiedMessage);

        return;
      }

      // ===============================================
      // NOT VERIFIED
      // ===============================================

      badge.textContent = "Verification Required";

      badge.className = "mapping-badge warning";

      // ===============================================
      // COVERAGE SUMMARY
      // ===============================================

      if (
        Number.isFinite(current?.matched) &&
        Number.isFinite(current?.total) &&
        current.total > 0
      ) {
        const coverage = document.createElement("div");

        coverage.className = "mapping-diagnostic-summary";

        coverage.textContent = `${current.matched}/${current.total} ERP students matched.`;

        diagnostics.appendChild(coverage);
      }

      // ===============================================
      // MISSING STUDENTS
      // ===============================================

      if (
        Array.isArray(current?.missingStudents) &&
        current.missingStudents.length > 0
      ) {
        const heading = document.createElement("div");

        heading.className = "mapping-missing-heading";

        heading.textContent = "Missing from Google Sheet:";

        diagnostics.appendChild(heading);

        for (const student of current.missingStudents) {
          const row = document.createElement("div");

          row.className = "mapping-missing-student";

          row.textContent =
            `${student.registrationNo}` +
            `${student.name ? ` | ${student.name}` : ""}`;

          diagnostics.appendChild(row);
        }

        return;
      }

      // ===============================================
      // GENERAL FAILURE REASON
      // ===============================================

      if (current?.reason) {
        const reason = document.createElement("div");

        reason.className = "mapping-diagnostic-summary";

        reason.textContent = current.reason;

        diagnostics.appendChild(reason);
      }
    }

    // -------------------------------------------------
    // MANUAL SHEET NAME CHANGE
    // -------------------------------------------------

    input.addEventListener("input", () => {
      setupMappings[erpClass.sectionCode] = {
        ...setupMappings[erpClass.sectionCode],

        sheetName: input.value.trim(),

        verified: false,

        matched: 0,

        total: 0,

        missingStudents: [],

        reason:
          "Sheet mapping changed. Click Verify & Save Setup to verify it.",
      };

      refreshBadge();
    });

    refreshBadge();

    card.appendChild(classInfo);

    card.appendChild(sheetWrapper);

    card.appendChild(badge);

    mappingResults.appendChild(card);
  }

  mappingResults.classList.remove("hidden");

  saveSetupButton.classList.remove("hidden");
}

// =====================================================
// ERP AUTH INITIALIZATION
// =====================================================

async function initializeAuthenticatedApp() {
  try {
    setLoginStatus("Checking ERP login...", "neutral");

    const todaySessions = await verifyLogin();

    detectedFacultyName =
      todaySessions.find((session) => session.facultyName)?.facultyName ?? null;

    // -------------------------------------------------
    // FALLBACK:
    // THERE MAY BE NO ATTENDANCE SESSIONS TODAY
    // -------------------------------------------------

    if (!detectedFacultyName) {
      const classes = await getFacultyClasses();

      detectedFacultyName =
        classes.find((item) => item.facultyName)?.facultyName ?? null;
    }

    if (!detectedFacultyName) {
      throw new Error(
        "ERP login was detected, but faculty identity could not be determined from the current timetable.",
      );
    }

    setLoginStatus(`ERP Login ✓ ${detectedFacultyName}`, "success");

    facultyNameInput.value = detectedFacultyName;

    profile = await getProfile();

    // =================================================
    // PROFILE DOES NOT MATCH ERP ACCOUNT
    // =================================================

    if (
      profile?.erpFacultyName &&
      profile.erpFacultyName !== detectedFacultyName
    ) {
      profile = null;
    }

    if (!profile) {
      setupSection.classList.remove("hidden");

      attendanceSection.classList.add("hidden");

      return;
    }

    showAttendanceApp();
  } catch (error) {
    setLoginStatus(
      error?.message ?? "Unable to connect to Aurora ERP.",
      "error",
    );
  }
}

// =====================================================
// FIRST RUN
// =====================================================

async function initialize() {
  const consent = await getPrivacyConsent();

  if (!consent) {
    setLoginStatus("Privacy consent required", "neutral");

    consentSection.classList.remove("hidden");

    setupSection.classList.add("hidden");

    attendanceSection.classList.add("hidden");

    return;
  }

  await initializeAuthenticatedApp();
}

// =====================================================
// PRIVACY CONSENT
// =====================================================

consentCheckbox.addEventListener("change", () => {
  acceptConsentButton.disabled = !consentCheckbox.checked;
});

acceptConsentButton.addEventListener("click", async () => {
  if (!consentCheckbox.checked) {
    return;
  }

  await savePrivacyConsent();

  consentSection.classList.add("hidden");

  await initializeAuthenticatedApp();
});

// =====================================================
// MAIN APPLICATION
// =====================================================

function showAttendanceApp() {
  consentSection.classList.add("hidden");

  setupSection.classList.add("hidden");

  attendanceSection.classList.remove("hidden");

  profileDisplay.textContent =
    `${detectedFacultyName} • ` +
    `${Object.keys(profile?.classMappings ?? {}).length} mapped classes`;
}

// =====================================================
// DETECT MAPPINGS
// =====================================================

detectMappingsButton.addEventListener("click", async () => {
  try {
    if (!detectedFacultyName) {
      throw new Error("ERP faculty identity has not been verified.");
    }

    const spreadsheetId = extractSpreadsheetId(spreadsheetInput.value);

    if (!spreadsheetId) {
      throw new Error("Enter a valid Google Spreadsheet URL or ID.");
    }

    detectMappingsButton.disabled = true;

    detectMappingsButton.textContent = "Detecting...";

    mappingResults.classList.add("hidden");

    saveSetupButton.classList.add("hidden");

    showMappingStatus("Reading your ERP timetable...");

    facultyClasses = await getFacultyClasses();

    if (!facultyClasses.length) {
      throw new Error(
        "No faculty classes were found in the current ERP timetable.",
      );
    }

    setupMappings = {};

    let verifiedCount = 0;

    for (let index = 0; index < facultyClasses.length; index++) {
      const erpClass = facultyClasses[index];

      showMappingStatus(
        `Checking ${index + 1}/${facultyClasses.length}: ${erpClass.sectionCode}`,
      );

      const result = await autoDetectSheetForClass({
        erpClass,
        spreadsheetId,
      });

      setupMappings[erpClass.sectionCode] = {
        sheetName: result.sheetName,

        verified: result.verified,

        matched: result.matched ?? 0,

        total: result.total ?? 0,

        coverage: result.coverage ?? 0,

        missingStudents: result.missingStudents ?? [],

        reason: result.reason ?? null,
      };

      if (result.verified) {
        verifiedCount++;
      }
    }

    renderMappingResults();

    showMappingStatus(
      `${verifiedCount}/${facultyClasses.length} classes roster-verified automatically.`,
    );
  } catch (error) {
    showMappingStatus(`Setup error: ${error?.message ?? "Unknown error."}`);
  } finally {
    detectMappingsButton.disabled = false;

    detectMappingsButton.textContent = "Detect & Map Classes";
  }
});

// =====================================================
// VERIFY + SAVE
// =====================================================

saveSetupButton.addEventListener("click", async () => {
  try {
    if (!detectedFacultyName) {
      throw new Error("Unable to verify ERP faculty identity.");
    }

    const spreadsheetId = extractSpreadsheetId(spreadsheetInput.value);

    if (!spreadsheetId) {
      throw new Error("Spreadsheet ID is missing.");
    }

    if (!facultyClasses.length) {
      throw new Error("Detect ERP classes before saving.");
    }

    saveSetupButton.disabled = true;

    saveSetupButton.textContent = "Verifying...";

    // -------------------------------------------------
    // VERIFY EVERY MAPPING
    // -------------------------------------------------

    for (let index = 0; index < facultyClasses.length; index++) {
      const erpClass = facultyClasses[index];

      const mapping = setupMappings[erpClass.sectionCode];

      if (!mapping?.sheetName) {
        throw new Error(`Sheet mapping missing for ${erpClass.sectionCode}.`);
      }

      showMappingStatus(
        `Verifying ${index + 1}/${facultyClasses.length}: ${erpClass.sectionCode}`,
      );

      const verification = await verifyMapping({
        erpClass,
        spreadsheetId,
        sheetName: mapping.sheetName,
      });

      // ===============================================
      // PRESERVE FULL DIAGNOSTIC INFORMATION
      // ===============================================

      setupMappings[erpClass.sectionCode] = {
        sheetName: mapping.sheetName,

        verified: verification.verified,

        matched: verification.matched ?? 0,

        total: verification.total ?? 0,

        coverage: verification.coverage ?? 0,

        missingStudents: verification.missingStudents ?? [],

        reason: verification.reason ?? null,
      };

      // ===============================================
      // RERENDER SO USER CAN SEE MISSING STUDENT
      // ===============================================

      renderMappingResults();

      if (!verification.verified) {
        let message =
          `${erpClass.sectionCode} failed roster verification. ` +
          `${verification.matched ?? 0}/${verification.total ?? 0} ERP students matched.`;

        if (verification.missingStudents?.length) {
          const missing = verification.missingStudents
            .map((student) => {
              if (student.name) {
                return `${student.registrationNo} (${student.name})`;
              }

              return student.registrationNo;
            })
            .join(", ");

          message += ` Missing from Sheet: ${missing}`;
        }

        throw new Error(message);
      }
    }

    // -------------------------------------------------
    // FINAL STRICT CHECK
    // -------------------------------------------------

    const classMappings = {};

    for (const erpClass of facultyClasses) {
      const mapping = setupMappings[erpClass.sectionCode];

      if (!mapping?.verified) {
        throw new Error(
          `${erpClass.sectionCode} has not been roster-verified.`,
        );
      }

      classMappings[erpClass.sectionCode] = {
        sheetName: mapping.sheetName,
      };
    }

    // -------------------------------------------------
    // SAVE SAFE PROFILE
    // -------------------------------------------------

    profile = {
      name: detectedFacultyName,

      erpFacultyName: detectedFacultyName,

      spreadsheetId,

      classMappings,

      updatedAt: new Date().toISOString(),
    };

    await saveProfile(profile);

    showMappingStatus("All class mappings verified successfully.");

    showAttendanceApp();
  } catch (error) {
    showMappingStatus(
      `Cannot save setup: ${error?.message ?? "Unknown error."}`,
    );
  } finally {
    saveSetupButton.disabled = false;

    saveSetupButton.textContent = "Verify & Save Setup";
  }
});

// =====================================================
// SETTINGS
// =====================================================

settingsButton.addEventListener("click", () => {
  facultyNameInput.value = detectedFacultyName ?? "";

  spreadsheetInput.value = profile?.spreadsheetId ?? "";

  attendanceSection.classList.add("hidden");

  setupSection.classList.remove("hidden");

  mappingResults.classList.add("hidden");

  mappingStatus.classList.add("hidden");

  saveSetupButton.classList.add("hidden");
});

// =====================================================
// RESET
// =====================================================

resetExtensionButton.addEventListener("click", async () => {
  const confirmed = confirm(
    [
      "Reset Attendance Mapper?",
      "",
      "This removes:",
      "• Saved faculty configuration",
      "• Spreadsheet ID",
      "• Class mappings",
      "• Privacy consent",
      "",
      "Attendance already submitted to Aurora ERP will NOT be changed.",
    ].join("\n"),
  );

  if (!confirmed) {
    return;
  }

  await clearAllExtensionData();

  location.reload();
});

// =====================================================
// MODE
// =====================================================

modeSelect.addEventListener("change", () => {
  dateField.classList.toggle("hidden", modeSelect.value !== "historical");
});

// =====================================================
// LOAD CLASSES
// =====================================================

loadClassesButton.addEventListener("click", async () => {
  try {
    classSection.classList.add("hidden");

    previewSection.classList.add("hidden");

    resultSection.classList.add("hidden");

    previewState = null;

    // -------------------------------------------------
    // TODAY
    // -------------------------------------------------

    if (modeSelect.value === "today") {
      sessions = await getTodaySessions();
    }

    // -------------------------------------------------
    // HISTORICAL
    // -------------------------------------------------
    else {
      if (!dateInput.value) {
        throw new Error("Select an attendance date.");
      }

      sessions = await getHistoricalSessions(dateInput.value);
    }

    // -------------------------------------------------
    // ONLY SHOW CLASSES WITH VERIFIED PROFILE MAPPING
    // -------------------------------------------------

    sessions = sessions.filter((session) =>
      Boolean(profile?.classMappings?.[session.sectionCode]),
    );

    if (!sessions.length) {
      throw new Error(
        "No mapped ERP classes were found for the selected date.",
      );
    }

    clearElement(classSelect);

    sessions.forEach((session, index) => {
      const option = document.createElement("option");

      let status = "";

      if (session.isLocked) {
        status = " | LOCKED";
      } else if (alreadyMarked(session)) {
        status = " | MARKED";
      }

      option.value = String(index);

      option.textContent =
        `${session.subjectCode ?? "Subject"} | ` +
        `${session.sectionCode ?? "Section"} | ` +
        `${session.startTime ?? ""}-${session.endTime ?? ""}` +
        status;

      classSelect.appendChild(option);
    });

    classSection.classList.remove("hidden");
  } catch (error) {
    alert(error?.message ?? "Unable to load classes.");
  }
});

// =====================================================
// PREVIEW SUMMARY
// =====================================================

function renderPreviewSummary({
  session,
  attendanceDate,
  sheetName,
  roster,
  result,
}) {
  clearElement(previewInfo);

  const subject = document.createElement("strong");

  subject.textContent =
    session.subjectName ?? session.subjectCode ?? "Attendance";

  previewInfo.appendChild(subject);

  appendSpacer(previewInfo);

  appendSummaryLine(previewInfo, "Section", session.sectionCode ?? "—");

  appendSummaryLine(previewInfo, "Date", attendanceDate);

  appendSummaryLine(
    previewInfo,
    "Time",
    `${session.startTime ?? "—"} - ${session.endTime ?? "—"}`,
  );

  appendSummaryLine(previewInfo, "Sheet", sheetName);

  appendSpacer(previewInfo);

  appendSummaryLine(previewInfo, "ERP Roster", roster.length);

  appendSummaryLine(previewInfo, "Matched", result.matched.length);

  appendSummaryLine(previewInfo, "Sheet Only", result.sheetOnly.length);

  appendSummaryLine(previewInfo, "ERP Only", result.erpOnly.length);

  appendSpacer(previewInfo);

  appendSummaryLine(previewInfo, "Present", result.present, true);

  appendSummaryLine(previewInfo, "Absent", result.absent, true);

  appendSummaryLine(previewInfo, "No Class", result.noClass.length);

  appendSummaryLine(previewInfo, "Invalid", result.invalid.length);
}

// =====================================================
// STUDENT LIST
// =====================================================

function renderStudentList(target, students, formatter) {
  clearElement(target);

  for (const student of students) {
    const div = document.createElement("div");

    div.className = "student-row";

    div.textContent = formatter(student);

    target.appendChild(div);
  }
}

// =====================================================
// PREVIEW
// =====================================================

previewButton.addEventListener("click", async () => {
  try {
    submitButton.classList.add("hidden");

    clearElement(validationMessage);

    absenteesSection.classList.add("hidden");

    invalidSection.classList.add("hidden");

    clearElement(absenteesList);

    clearElement(invalidList);

    // -------------------------------------------------
    // SELECT SESSION
    // -------------------------------------------------

    const index = Number(classSelect.value);

    selectedSession = sessions[index];

    if (!selectedSession) {
      throw new Error("Select an ERP class.");
    }

    // -------------------------------------------------
    // SAFETY: LOCKED
    // -------------------------------------------------

    if (selectedSession.isLocked) {
      throw new Error("This ERP attendance session is locked.");
    }

    // -------------------------------------------------
    // SAFETY: ALREADY MARKED
    // -------------------------------------------------

    if (alreadyMarked(selectedSession)) {
      throw new Error(
        `Attendance already marked. ERP: ` +
          `${selectedSession.presentCount ?? 0} present, ` +
          `${selectedSession.absentCount ?? 0} absent.`,
      );
    }

    // -------------------------------------------------
    // ATTENDANCE DATE / SHEET COLUMN
    // -------------------------------------------------

    const { attendanceDate, attendanceColumn } = getAttendanceDateValues(
      selectedSession.date,
    );

    // -------------------------------------------------
    // VERIFIED CLASS MAPPING
    // -------------------------------------------------

    const mapping = profile?.classMappings?.[selectedSession.sectionCode];

    if (!mapping) {
      throw new Error("Verified class mapping was not found.");
    }

    // -------------------------------------------------
    // GOOGLE SHEET
    // -------------------------------------------------

    const rows = await fetchSheet({
      spreadsheetId: profile.spreadsheetId,

      sheetName: mapping.sheetName,
    });

    if (!rows.length) {
      throw new Error("Google Sheet contains no attendance rows.");
    }

    if (!("Registration Number" in rows[0])) {
      throw new Error('Missing "Registration Number" column.');
    }

    if (!(attendanceColumn in rows[0])) {
      throw new Error(
        `Google Sheet attendance column "${attendanceColumn}" does not exist.`,
      );
    }

    // -------------------------------------------------
    // ERP ROSTER
    // -------------------------------------------------

    const roster = await getRoster(
      selectedSession.sectionId,
      selectedSession.courseOfferingId,
    );

    if (!roster.length) {
      throw new Error("ERP returned an empty class roster.");
    }

    // -------------------------------------------------
    // MATCH ATTENDANCE
    // -------------------------------------------------

    const result = matchAttendance({
      rows,
      roster,
      attendanceColumn,
    });

    previewState = {
      session: selectedSession,

      attendanceDate,

      attendanceColumn,

      sheetName: mapping.sheetName,

      roster,

      result,
    };

    renderPreviewSummary({
      session: selectedSession,

      attendanceDate,

      sheetName: mapping.sheetName,

      roster,

      result,
    });

    // =================================================
    // ABSENTEES
    // =================================================

    const absentees = result.matched.filter(
      (student) => student.attendance === "ABSENT",
    );

    if (absentees.length > 0) {
      renderStudentList(
        absenteesList,
        absentees,
        (student) => `${student.registrationNo} | ${student.name || "Student"}`,
      );

      absenteesSection.classList.remove("hidden");
    }

    // =================================================
    // INVALID / MISSING ATTENDANCE
    // =================================================

    if (result.invalid.length > 0) {
      renderStudentList(invalidList, result.invalid, (student) => {
        const rawValue = String(student.rawAttendance ?? "").trim();

        return (
          `${student.registrationNo} | ` +
          `${student.name || "Student"} | ` +
          `Value: ${rawValue ? `"${rawValue}"` : "[BLANK]"}`
        );
      });

      invalidSection.classList.remove("hidden");
    }

    // =================================================
    // VALIDATION
    // =================================================

    if (result.allNoClass) {
      showMessage(validationMessage, "warning", [
        "NO CLASS is marked for the entire ERP roster.",
        "Nothing will be submitted.",
      ]);
    } else if (result.mixedNoClass) {
      showMessage(validationMessage, "error", [
        "NO CLASS is mixed with Present/Absent values.",
        "Correct the Google Sheet before submitting.",
      ]);
    } else if (!result.safe) {
      const validationLines = [
        "Validation failed.",
        `ERP-only students: ${result.erpOnly.length}`,
        `Invalid attendance values: ${result.invalid.length}`,
      ];

      // -----------------------------------------------
      // ALSO SHOW ERP STUDENTS MISSING FROM SHEET
      // -----------------------------------------------

      if (result.erpOnly.length > 0) {
        validationLines.push("", "Missing from Google Sheet:");

        for (const student of result.erpOnly) {
          validationLines.push(
            `${student.registrationNo} | ${student.name || "Student"}`,
          );
        }
      }

      showMessage(validationMessage, "error", validationLines);
    } else {
      showMessage(validationMessage, "success", [
        "✓ Validation Passed",
        "DRY RUN ONLY — NOTHING SENT TO ERP",
      ]);

      submitButton.classList.remove("hidden");
    }

    previewSection.classList.remove("hidden");
  } catch (error) {
    previewSection.classList.remove("hidden");

    clearElement(previewInfo);

    showMessage(validationMessage, "error", [
      error?.message ?? "Unable to preview attendance.",
    ]);
  }
});

// =====================================================
// SUBMIT
// =====================================================

submitButton.addEventListener("click", async () => {
  try {
    if (!previewState?.result?.safe) {
      throw new Error("Attendance has not passed validation.");
    }

    const { session, attendanceDate, result } = previewState;

    // -------------------------------------------------
    // FINAL USER CONFIRMATION
    // -------------------------------------------------

    const confirmed = confirm(
      [
        "Submit attendance to Aurora ERP?",
        "",
        `Faculty: ${detectedFacultyName}`,
        `Subject: ${session.subjectName}`,
        `Section: ${session.sectionCode}`,
        `Date: ${attendanceDate}`,
        `Present: ${result.present}`,
        `Absent: ${result.absent}`,
        `Total: ${result.records.length}`,
      ].join("\n"),
    );

    if (!confirmed) {
      return;
    }

    submitButton.disabled = true;

    submitButton.textContent = "Submitting...";

    // -------------------------------------------------
    // EXACT ERP PAYLOAD
    // -------------------------------------------------

    const payload = {
      timetableEntryId: session.timetableEntryId,

      date: attendanceDate,

      slotId: session.slotId,

      records: result.records,

      lock: false,
    };

    const response = await submitAttendance(payload);

    const data = response?.data ?? response;

    const totalStudents = Number(data?.totalStudents);

    const presentCount = Number(data?.presentCount);

    const absentCount = Number(data?.absentCount);

    // -------------------------------------------------
    // VERIFY ERP RESPONSE
    // -------------------------------------------------

    const countsMatch =
      totalStudents === result.records.length &&
      presentCount === result.present &&
      absentCount === result.absent;

    resultSection.classList.remove("hidden");

    if (!countsMatch) {
      showMessage(resultOutput, "error", [
        "ERP saved attendance, but the returned counts do not match the preview.",

        `ERP Total: ${
          Number.isFinite(totalStudents) ? totalStudents : "Unknown"
        }`,

        `ERP Present: ${
          Number.isFinite(presentCount) ? presentCount : "Unknown"
        }`,

        `ERP Absent: ${Number.isFinite(absentCount) ? absentCount : "Unknown"}`,
      ]);

      return;
    }

    // -------------------------------------------------
    // SUCCESS
    // -------------------------------------------------

    showMessage(resultOutput, "success", [
      "✓ Attendance Submitted Successfully",

      `ERP Total: ${totalStudents}`,

      `ERP Present: ${presentCount}`,

      `ERP Absent: ${absentCount}`,

      "ERP response matches the Google Sheet preview.",
    ]);

    submitButton.classList.add("hidden");
  } catch (error) {
    resultSection.classList.remove("hidden");

    showMessage(resultOutput, "error", [
      error?.message ?? "Attendance submission failed.",
    ]);
  } finally {
    submitButton.disabled = false;

    submitButton.textContent = "Submit Attendance";
  }
});

// =====================================================
// START
// =====================================================

initialize();
