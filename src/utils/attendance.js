export function normalizeRegistrationNo(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function normalizeAttendance(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "present" || normalized === "p" || normalized === "1") {
    return "PRESENT";
  }

  if (normalized === "absent" || normalized === "a" || normalized === "0") {
    return "ABSENT";
  }

  return null;
}
