// =====================================================
// SPREADSHEET ID
// =====================================================

export function extractSpreadsheetId(value) {
  if (!value) {
    return null;
  }

  const trimmed = String(value).trim();

  // Already an ID
  if (!trimmed.includes("/") && trimmed.length > 20) {
    return trimmed;
  }

  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);

  return match?.[1] ?? null;
}

// =====================================================
// CSV PARSER
// =====================================================

function parseCsv(text) {
  const rows = [];

  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;

        continue;
      }

      inQuotes = !inQuotes;

      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";

      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i++;
      }

      row.push(cell);

      if (row.some((value) => String(value).trim() !== "")) {
        rows.push(row);
      }

      row = [];
      cell = "";

      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);

    rows.push(row);
  }

  return rows;
}

// =====================================================
// ARRAY -> OBJECTS
// =====================================================

function rowsToObjects(rows) {
  if (!rows.length) {
    return [];
  }

  const headers = rows[0].map((header) => String(header).trim());

  return rows
    .slice(1)
    .map((row) => {
      const object = {};

      headers.forEach((header, index) => {
        if (!header) {
          return;
        }

        object[header] = row[index] ?? "";
      });

      return object;
    })
    .filter((row) =>
      Object.values(row).some((value) => String(value).trim() !== ""),
    );
}

// =====================================================
// FETCH SHEET
// =====================================================

export async function fetchSheet({ spreadsheetId, sheetName }) {
  if (!spreadsheetId) {
    throw new Error("Spreadsheet ID is missing.");
  }

  if (!sheetName) {
    throw new Error("Sheet tab name is missing.");
  }

  const url =
    `https://docs.google.com/spreadsheets/d/` +
    `${encodeURIComponent(spreadsheetId)}` +
    `/gviz/tq?` +
    `tqx=out:csv&` +
    `sheet=${encodeURIComponent(sheetName)}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Unable to read Google Sheet "${sheetName}". ` +
        `HTTP ${response.status}.`,
    );
  }

  const text = await response.text();

  // Private/inaccessible sheets often return HTML.
  if (
    text.trim().toLowerCase().startsWith("<!doctype html") ||
    text.trim().toLowerCase().startsWith("<html")
  ) {
    throw new Error(`Google Sheet "${sheetName}" is not accessible.`);
  }

  const parsed = parseCsv(text);

  const rows = rowsToObjects(parsed);

  if (!rows.length) {
    throw new Error(`Google Sheet "${sheetName}" contains no usable rows.`);
  }

  return rows;
}

// =====================================================
// SAFE FETCH
// =====================================================

export async function tryFetchSheet({ spreadsheetId, sheetName }) {
  try {
    const rows = await fetchSheet({
      spreadsheetId,
      sheetName,
    });

    return {
      success: true,
      rows,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      rows: [],
      error: error?.message ?? "Unable to read Google Sheet.",
    };
  }
}
