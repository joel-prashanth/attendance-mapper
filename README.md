#  Attendance Automation

Internal faculty attendance automation for Aurora ERP.

Current release:

`v0.3.1-beta`

The application reads attendance from a faculty-maintained Google Sheet, validates it against the official Aurora ERP roster and safely submits attendance to ERP.

## Features

- Multiple faculty profiles
- Separate Google Sheet configuration for each faculty member
- ERP credentials stored locally outside the repository
- Today's attendance
- Historical attendance by date
- Historical timetable discovery
- Automatic Google Sheet date-column selection
- ERP roster ↔ Google Sheet validation
- Duplicate-attendance protection
- Locked-session protection
- `NO CLASS` support
- Mixed `NO CLASS` detection
- Blank/invalid attendance detection
- Sheet-only students safely ignored
- ERP-only students block submission
- Dry-run mode by default
- Explicit `SUBMIT` confirmation
- ERP response count verification
- Local audit logging

---

# Requirements

Install:

- Node.js
- npm
- Internet connection
- Aurora Faculty ERP access
- Faculty Google Attendance Sheet

Check Node:

```powershell
node --version
```
