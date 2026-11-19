# Master Implementation Plan: Zero-API-Key One-Click AI Job Applier
**Chrome Extension (Manifest V3)**

---

## Executive Summary

The **One-Click AI Job Applier** is a Manifest V3 Chrome Extension that automates job applications across major ATS platforms (Greenhouse, Lever, Workday, Ashby, etc.) by extracting job descriptions and form requirements, driving the **free web GUI of ChatGPT or Gemini** in the browser (zero paid API keys or external services), compiling a tailored ATS-friendly `.docx` resume directly in-memory, and injecting answers and files into application forms with React/Vue-safe synthetic event synchronization.

---

## Core Architecture & Technical Paradigms

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   JOB APPLICATION TAB                                  │
│  User clicks "Apply" ──► Extracts JD & Form Field Schema (job_scraper.js)              │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Message Passing
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               SERVICE WORKER COORDINATOR                               │
│  Loads Master Profile ──► Formats JSON-Only Prompt ──► Spawns / Selects AI Tab         │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ chrome.tabs.create / chrome.scripting
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        FREE AI WEB GUI TAB (chatgpt.com / gemini)                      │
│  ai_automator.js:                                                                      │
│   1. Verifies user login session (prompts if login screen detected)                    │
│   2. Types prompt into GUI (ProseMirror / Rich-Textarea safe)                          │
│   3. Clicks Send button in GUI & observes streaming via MutationObserver               │
│   4. Scrapes structured JSON payload directly from the response message DOM            │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Returns JSON (Tailored Experience + Answers)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              IN-MEMORY ATS DOCX ENGINE                                 │
│  docx.js generates formatted ATS Resume Blob in milliseconds (Zero Disk I/O)           │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Dispatches to Job Tab
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              REACT-SAFE FORM INJECTOR                                  │
│  form_filler.js:                                                                       │
│   1. Injects File into input[type="file"] via new DataTransfer()                       │
│   2. Overrides HTMLInputElement.prototype.value to trigger React/Vue listeners         │
│   3. Handles custom dropdowns, comboboxes, and radio groups                            │
│   4. Safe Mode (highlight & pause) or Auto-Submit (after 1.5s validation)              │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Workspace File Structure

```text
auto_applier/
├── manifest.json                  # Manifest V3 configuration & permissions
├── PLAN.md                        # Persistent project blueprint & tracking
├── icons/                         # Extension icons (16px, 48px, 128px)
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── src/
│   ├── background/
│   │   └── service_worker.js      # Tab orchestration, message bus & state persistence
│   ├── content/
│   │   ├── job_scraper.js         # JD extractor & form field identifier
│   │   ├── form_filler.js         # React-safe input filler & DataTransfer file injector
│   │   └── ai_automator.js        # Web GUI driver for chatgpt.com & gemini.google.com
│   ├── popup/
│   │   ├── popup.html             # Profile editor, settings & Apply button
│   │   ├── popup.css              # Modern dark/light UI
│   │   └── popup.js               # Popup event wiring & storage synchronization
│   ├── lib/
│   │   ├── docx.min.js            # Bundled client-side DOCX library
│   │   └── ats_rules.js           # Platform-specific selectors (Greenhouse, Lever, etc.)
│   └── templates/
│       └── resume_builder.js      # ATS-standard single-column layout synthesizer
```

---

## 5-Phase Implementation Breakdown

### Phase 1: MV3 Scaffolding & Master Profile Store

#### Goals
- Establish the Manifest V3 structure adhering strictly to Chrome extension security policies.
- Build the profile configuration store and popup interface.

#### Tasks
1. **Manifest Configuration (`manifest.json`):**
   - Declare `manifest_version: 3`.
   - Permissions: `["storage", "tabs", "scripting", "activeTab"]`.
   - Host Permissions: `["https://chatgpt.com/*", "https://gemini.google.com/*", "<all_urls>"]`.
   - Action item referencing `src/popup/popup.html`.
   - Service worker declared at `src/background/service_worker.js`.
2. **Icons Asset Generation:**
   - Programmatically generate valid PNG assets for 16×16, 48×48, and 128×128 pixel icons to prevent unpack errors.
3. **Master Profile Schema (`chrome.storage.local`):**
   - `personal_info`: Full name, email, phone, location, LinkedIn, GitHub, website.
   - `work_history`: Array of past companies, titles, start/end dates, base accomplishment bullets.
   - `education`: University, degree, major, graduation year.
   - `skills`: Categorized skill inventory (languages, frameworks, tools).
   - `preferences`: Work authorization, sponsorship requirements, veteran status, target salary.
   - `settings`: Preferred AI interface (`chatgpt` vs `gemini`), auto-submit toggle (`true`/`false`), safe review mode (`true`/`false`).
4. **Popup Interface (`src/popup/`):**
   - Clean, modern dashboard with status badge.
   - Primary **"Apply to This Job"** CTA button.
   - Collapsible settings accordion to manage the Master Profile and toggle AI backend.

#### Milestone 1 Verification
- Load unpacked extension into `chrome://extensions`.
- Open popup, edit and save profile details.
- Confirm state persists in `chrome.storage.local` via DevTools.

---

### Phase 2: Universal ATS Job Scraper & Field Analyzer

#### Goals
- Reliably extract the job title, company name, and full job description text.
- Map all visible and hidden form controls to their natural-language questions/labels.

#### Tasks
1. **Platform Detection (`src/lib/ats_rules.js`):**
   - Detect known platforms: Greenhouse (`grnhse.io`), Lever (`lever.co`), Workday (`myworkdayjobs.com`), Ashby (`ashbyhq.com`), SmartRecruiters.
   - Provide platform-specific container queries for high-accuracy description extraction.
2. **Generic JD Heuristic (`src/content/job_scraper.js`):**
   - Fallback algorithm that identifies the largest content block by text density, skipping headers, sidebars, and cookie banners.
3. **Field & Label Resolver:**
   - Traverse all form controls: `<input>`, `<textarea>`, `<select>`, and custom role elements (`[role="combobox"]`, `[role="radiogroup"]`).
   - Extract semantic labels using a multi-step resolution order:
     1. Direct `<label for="...">` mapping.
     2. Enclosing `<label>` container text.
     3. `aria-label` or `aria-labelledby` targets.
     4. `placeholder` and `name` attributes.
   - Identify resume upload inputs (`input[type="file"]`, dropzone wrapper divs).
4. **Message Dispatch:**
   - Package `{ jobTitle, company, jobDescription, fields, hasFileInput }` and send to the service worker.

#### Milestone 2 Verification
- Navigate to sample Greenhouse, Lever, and generic job pages.
- Click "Apply" in popup; verify console logs clean JD text and a structured list of inputs with their identified labels.

---

### Phase 3: Free Web AI GUI Automator (ChatGPT & Gemini)

#### Goals
- Automate the web chat interface without paid API keys, using the user's active browser session.
- Extract structured JSON responses containing tailored bullet points and form answers.

#### Tasks
1. **Prompt Engineering for GUI Models:**
   - Construct a strict prompt that prevents chatty conversational preambles:
     ```text
     You are an ATS resume optimization engine. 
     Analyze the following Job Description, Master Profile, and Form Questions.
     Respond ONLY with a single valid raw JSON object (no markdown quotes, no explanations):
     {
       "tailored_summary": "...",
       "highlighted_skills": ["..."],
       "tailored_bullets": {
         "CompanyA_Role": ["..."]
       },
       "answers": {
         "field_id_or_label": "..."
       }
     }
     ```
2. **Tab Manager (`src/background/service_worker.js`):**
   - Check if an existing ChatGPT or Gemini tab is open; if not, open one via `chrome.tabs.create`.
   - Focus the AI tab temporarily during execution.
3. **ChatGPT GUI Automator (`src/content/ai_automator.js`):**
   - Check for login state: if login/signup buttons are visible, trigger an extension notification prompting the user to sign in.
   - Input injection: Locate `#prompt-textarea` (contenteditable ProseMirror div). Inject text using synthetic `beforeinput` and `input` events to synchronize React state.
   - Send trigger: Locate and click `button[data-testid="send-button"]` (or dispatch Enter key).
   - Stream watcher: Initialize `MutationObserver` on the chat transcript. Detect completion when `button[data-testid="stop-button"]` is replaced back by the send button.
4. **Gemini GUI Automator (`src/content/ai_automator.js`):**
   - Target rich text container (`<rich-textarea>`, `div[role="textbox"]`).
   - Insert text content, dispatch `input` events, and click `button[aria-label*="Send"]`.
   - Monitor query streaming until cursor and typing indicators disappear.
5. **JSON Sanitizer & Extraction:**
   - Query the final assistant message container.
   - Extract raw text, strip markdown backticks (````json ... ````), and validate with `JSON.parse()`.
   - Fallback regex extractor for partially wrapped responses.

#### Milestone 3 Verification
- Run test pipeline with a dummy JD.
- Observe extension open ChatGPT/Gemini, type the prompt, wait for streaming completion, extract the JSON, and return it to the service worker.

---

### Phase 4: In-Memory ATS DOCX Synthesis & Form Filling

#### Goals
- Synthesize an ATS-optimized `.docx` resume directly in-memory (no local filesystem writes, no download popups).
- Populate all form fields and attach the generated file using React-safe event injection.

#### Tasks
1. **In-Memory DOCX Generator (`src/templates/resume_builder.js`):**
   - Bundle lightweight `docx.js`.
   - Create ATS-standard layout:
     - 0.75-inch margins, standard fonts (Calibri/Arial, 10–12pt).
     - Single-column flow: Contact Header ➔ Summary ➔ Core Competencies ➔ Professional Experience (with AI-tailored bullets) ➔ Education.
   - Output directly as a `Blob` / `Uint8Array`.
2. **React/Vue/Angular-Safe Input Injection (`src/content/form_filler.js`):**
   - Bypass framework internal value tracking by calling native property setters:
     ```javascript
     function setNativeValue(element, value) {
       const prototype = Object.getPrototypeOf(element);
       const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
       if (setter) {
         setter.call(element, value);
       } else {
         element.value = value;
       }
       element.dispatchEvent(new Event('input', { bubbles: true }));
       element.dispatchEvent(new Event('change', { bubbles: true }));
       element.dispatchEvent(new Event('blur', { bubbles: true }));
     }
     ```
3. **File Attachment via `DataTransfer`:**
   - Convert the DOCX `Blob` into a `File` object:
     ```javascript
     const file = new File([docxBlob], `${profile.name.replace(/\s+/g, '_')}_Resume.docx`, {
       type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
     });
     const dt = new DataTransfer();
     dt.items.add(file);
     fileInput.files = dt.files;
     fileInput.dispatchEvent(new Event('change', { bubbles: true }));
     ```
4. **Custom Component Support:**
   - Support custom dropdowns (`[role="combobox"]`, `[role="listbox"]`): simulate click to expand, locate best matching option via text similarity, dispatch selection click.
   - Support checkboxes & radio groups for standard legal disclosures (work authorization, sponsorship).

#### Milestone 4 Verification
- Run on an application test form; confirm all inputs reflect AI values, and the generated `.docx` file is attached to the file upload control.

---

### Phase 5: Multi-Step Portals, Verification & Safe Auto-Submit

#### Goals
- Handle multi-page wizards (Workday), detect CAPTCHAs, and support both Safe Review Mode and Instant Auto-Submit.

#### Tasks
1. **Multi-Step State Machine:**
   - Track application progress in `chrome.storage.session` keyed by `tabId`.
   - Re-inject `form_filler.js` when URL changes or DOM re-renders across steps (e.g. Workday: Contact ➔ Experience ➔ Voluntary Disclosures ➔ Review).
2. **CAPTCHA & Bot Gate Detection:**
   - Scan for reCAPTCHA, hCaptcha, or Cloudflare Turnstile iframes.
   - If a CAPTCHA is detected:
     - Halt auto-submission immediately.
     - Play a chime and present a floating notification: *"Please complete the CAPTCHA to proceed."*
3. **Execution Modes:**
   - **Review Mode (Default):** Adds a subtle green outline to all auto-filled fields, displays an floating action pill with a button *"Looks Good — Submit Now"*.
   - **Auto-Submit Mode:** Waits 1.5 seconds for file upload validation to settle, verifies no required fields are blank, and automatically triggers the submit button.

#### Milestone 5 Verification
- Perform end-to-end applications across live job postings in both Review Mode and Auto-Submit Mode.

---

## Risk Mitigation Matrix

| Potential Challenge | Impact | Preventive Architecture |
| :--- | :--- | :--- |
| **ChatGPT / Gemini DOM selector updates** | High | Abstract all selector queries into `src/lib/ats_rules.js` with fallback arrays. |
| **User not logged in to AI Web GUI** | Medium | Automator detects login/signup DOM elements and displays a clear prompt to log in before continuing. |
| **AI outputs conversational text with JSON** | Medium | Robust JSON extraction with regex boundary matching (`\{[\s\S]*\}`) and markdown fence stripping. |
| **React/Angular forms discarding filled text** | High | Use `Object.getOwnPropertyDescriptor.set` on `HTMLInputElement.prototype` with bubbling events. |
| **File input hidden or styled with opacity 0** | Medium | Query all `input[type="file"]` regardless of visibility; trigger events on enclosing dropzone parent. |
