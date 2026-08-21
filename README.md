# Attendance Mapper

Chrome extension for Aurora ERP faculty workflows: attendance submission from a
Google Sheet, and AI-assisted Reflective Journal grading.

Everything runs inside the browser, using the faculty member's existing
authenticated Aurora ERP session. There is no separate server or CLI
component to install or run.

## Features

### Attendance

- Reads attendance from a faculty-maintained Google Sheet
- Validates the sheet against the official Aurora ERP roster
- Today's attendance and historical attendance by date
- Automatic Google Sheet date-column selection
- Duplicate-attendance protection
- Locked-session protection
- `NO CLASS` and mixed `NO CLASS` detection
- Blank/invalid attendance detection
- ERP-only students block submission; sheet-only students are safely ignored
- Explicit submission confirmation, with ERP response count verification

### Reflective Journal grading

- Detects classes/assessments with Reflective Journal submissions
- AI-generated rubric scores and feedback as an editable suggestion
- Faculty must review and edit before saving — nothing is submitted
  automatically
- Save verifies the evaluation was recorded correctly by Aurora ERP before
  confirming success

## Install (unpacked, for development)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `extension/` folder

## Structure

```
extension/
  app.html / app.css / app.js   Main extension UI
  journal-ui.js                 Reflective Journal grading UI
  background.js                 Service worker
  manifest.json                 Extension manifest (MV3)
  services/
    erp.js                      Aurora ERP API calls
    sheet.js                    Google Sheet reading
    matcher.js                  Sheet ↔ ERP roster matching
    storage.js                  Local extension storage
    journal.js                  Journal submission helpers
    journal-ai.js                AI grading requests
```

See [extension/privacy.html](extension/privacy.html) for the extension's
privacy policy.
