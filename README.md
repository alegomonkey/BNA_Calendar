# BNA Community Calendar

The Bayside Neighborhood Association is a community organization serving the Bayside neighborhood of Portland, Maine, working to connect residents and local businesses through advocacy, events, and shared resources. This repository contains the code powering the community calendar on [baysideportland.org](https://baysideportland.org/community-calendar/).

## What this repo is for

The calendar is a custom-built widget embedded in a WordPress.com page. It pulls events directly from two Google Calendars (BNA Events and Community Events), displays them in schedule, month, and week views, and lets visitors search, filter, and add events to their own calendar — all without requiring a plugin or a paid WordPress plan upgrade. This repo stores the four code files that make the calendar work, plus a prompt file used during development.

---

## Files

### `bna-calendar-google-script.js` — Google Apps Script (the data bridge)

This script runs on Google's servers under your Google account. It reads both BNA and Community Google Calendars and serves the event data as JSON to the website. It is deployed once as a Google Apps Script Web App at [script.google.com](https://script.google.com).

**To update events:** You don't touch this file. Add or edit events directly in Google Calendar — the script reads them live every time the calendar page loads.

**To change which calendars are shown:** Edit the `CALENDARS` array near the top of the file. Each entry has a calendar `id`, a `label` (the badge text shown on the site), and a `color` key. Calendar IDs are found in Google Calendar under Settings → the calendar name → Integrate calendar → Calendar ID.

**To deploy a change:** Paste the updated code into the Apps Script editor, then click Deploy → New deployment (do not edit the existing deployment — create a new one). Copy the new Web App URL and update `SCRIPT_URL` in `bna-calendar.js`.

---

### `bna-calendar.js` — Frontend JavaScript (the calendar widget)

This is the JavaScript that runs in visitors' browsers. It fetches event data from the Google Apps Script, then builds and renders the calendar — schedule view with search and filters, month grid, week time grid, event popups, and add-to-calendar buttons. This file is served to the website via the jsDelivr CDN.

**Live URL:**
```
https://cdn.jsdelivr.net/gh/alegomonkey/BNA_Calendar@latest/bna-calendar.js
```

**To update:** Edit this file and commit. Because jsDelivr caches aggressively, also update the version tag in the `<script src="">` line inside `bna-calendar-block-slim.html` (e.g. change `@latest` to a specific version tag, or `@1.0.0` to `@1.0.1`) so visitors get the new version immediately.

**To point to a redeployed Apps Script:** Find `var SCRIPT_URL` near the top of this file and replace the URL with the new one from your Google Apps Script deployment.

---

### `bna-calendar-block-slim.html` — WordPress Custom HTML block *(deployed in production)*

This is what is pasted into the WordPress Custom HTML block on the Community Calendar page. It contains the calendar's CSS styles, the `<div>` container the calendar renders into, and a `<script src="">` tag that loads `bna-calendar.js` from jsDelivr. It contains no inline JavaScript, which is required for scripts to execute on WordPress.com's Personal plan.

**To deploy or update in WordPress:**
1. Log in to WordPress → Pages → Community Calendar → Edit
2. Click the Custom HTML block on the page
3. Select all and replace with the contents of this file
4. Click Update

**To update the jsDelivr version** after editing `bna-calendar.js`, find the `<script src="https://cdn.jsdelivr.net/gh/alegomonkey/BNA_Calendar@...">` line at the bottom of this file and increment the version (e.g. `@1.0.0` → `@1.0.1`). Commit and push both files together.

---

### `bna-calendar-block-full.html` — Full combined block *(development reference and local testing)*

This is the self-contained version of the calendar with the CSS, HTML, and JavaScript all in one file. It is not used in production on WordPress.com — inline scripts are stripped by WordPress.com's security filter on the Personal plan — but it is useful for:

- **Local testing:** Open it directly in a browser to preview and test the calendar without needing WordPress or a server.
- **Development reference:** The single-file format makes it easier to read and edit the full codebase in one place before splitting changes across the other files.
- **Future migration:** If the site moves to WordPress.com Business plan or a self-hosted WordPress.org setup, this file can be pasted directly into a Custom HTML block and will work without any CDN dependency.

---

### `website_analysis_prompt.md` — Site analysis prompt 

A prompt template for analyzing a website that needs improvement against a reference site. It was used at the start of this project to evaluate the original BNA calendar page and plan the redesign. 

---

## How events get updated

Events are managed entirely through Google Calendar. Anyone with edit access to the BNA Events or Community Events Google Calendars can add, edit, or remove events and they will appear on the website automatically — no WordPress login or code changes required. The calendar color in Google Calendar determines which source badge appears on the site: the pink **BNA** badge or the blue **Community** badge.
