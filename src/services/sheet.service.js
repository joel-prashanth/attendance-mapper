import { parse } from "csv-parse/sync";
import fetch from "node-fetch";

const SHEET_ID = "1x6a363Rb78OhSfZMxxfQazqcS00ClG3JekmPRehrMWA";

export async function getSheetStudents(sheetName) {
  if (!sheetName) {
    throw new Error("sheetName is required");
  }

  const csvUrl =
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq` +
    `?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;

  console.log("\nFetching Google Sheet tab:");
  console.log(sheetName);

  const response = await fetch(csvUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch Google Sheet: ${response.status}`);
  }

  const csv = await response.text();

  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return rows;
}
