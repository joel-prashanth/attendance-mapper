import { parse } from "csv-parse/sync";
import fetch from "node-fetch";

export async function getSheetStudents(spreadsheetId, sheetName) {
  if (!spreadsheetId) {
    throw new Error("spreadsheetId is required");
  }

  if (!sheetName) {
    throw new Error("sheetName is required");
  }

  const csvUrl =
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq` +
    `?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;

  console.log(`\nFetching Google Sheet tab:\n${sheetName}`);

  const response = await fetch(csvUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Google Sheet "${sheetName}": ${response.status}`,
    );
  }

  const csv = await response.text();

  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return rows;
}
