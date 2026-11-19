# AutoApplier — 1-Click AI Job Assistant
**Manifest V3 Chrome Extension (Zero API Keys)**

AutoApplier is a one-click Chrome Extension that automates job applications across modern ATS platforms (Greenhouse, Lever, Workday, Ashby, etc.). It automates the **free web GUI of ChatGPT or Gemini** in the browser with **zero paid API keys**, compiles an ATS-tailored `.docx` resume directly in memory, and auto-fills application forms with React/Vue-safe synthetic event synchronization.

---

## Key Features

1. **Zero API Keys (100% Free)**:
   * Drives the actual web interface of **ChatGPT** (`chatgpt.com`) or **Google Gemini** (`gemini.google.com`) using your existing free browser login session.
   * Dispatches human-like input events into the chatbox, tracks streaming via DOM `MutationObserver`, and scrapes the structured response directly from the message bubbles.
2. **In-Memory ATS DOCX Synthesis (`docx.min.js`)**:
   * Compiles your tailored summary, highlighted competencies, and tailored experience bullets into a pixel-perfect, ATS-standard single-column Word document (`.docx`) in under 15ms.
   * Zero disk I/O, no download popups, and no permissions issues with local `file:///` URLs.
3. **React/Vue-Safe Form Injection (`form_filler.js`)**:
   * Injects input values through native prototype setters (`Object.getOwnPropertyDescriptor(prototype, 'value').set`) so React, Angular, and Vue portals synchronize form state.
   * Attaches the in-memory `.docx` directly into `input[type="file"]` using `new DataTransfer()`.
4. **Safety & Review Modes**:
   * **Review Mode (Default)**: Highlights every auto-filled field with a gentle green glow and displays a floating confirmation banner: *"Fields auto-filled. Review and click Submit."*
   * **1-Click Auto-Submit**: Submits the application after a 1.5-second validation delay (with automated CAPTCHA detection safeguards).
5. **Multi-Step Wizard Support**:
   * Persists application state in `chrome.storage.session` to seamlessly fill multi-page portals (e.g. Workday).

---

## Project Structure

```text
auto_applier/
├── manifest.json                  # Manifest V3 specification
├── PLAN.md                        # Master implementation plan & roadmap
├── icons/                         # 16px, 48px, 128px PNG icons
├── src/
│   ├── background/
│   │   └── service_worker.js      # Message coordinator & multi-step state machine
│   ├── content/
│   │   ├── job_scraper.js         # Extracts JD & resolves form inputs
│   │   ├── form_filler.js         # React-safe filler & DataTransfer file injector
│   │   └── ai_automator.js        # Web GUI automator for ChatGPT & Gemini
│   ├── popup/
│   │   ├── popup.html             # Profile dashboard & 1-Click CTA
│   │   ├── popup.css              # Dark modern UI
│   │   └── popup.js               # Storage sync & pipeline controller
│   ├── lib/
│   │   ├── docx.min.js            # Standalone, zero-dependency OpenXML DOCX synthesizer
│   │   └── ats_rules.js           # ATS platform selectors & semantic field matcher
│   └── templates/
│       └── resume_builder.js      # ATS layout compiler & File builder
└── test/
    └── mock_job_application.html  # Interactive test job application page
```

---

## How to Install in Chrome

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. In the top-right corner, toggle **Developer mode** to **ON**.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the `auto_applier` directory:
   ```text
   /Users/sudhanshuprasad/auto_applier
   ```
5. The **AutoApplier** extension will appear in your extensions toolbar. Click the puzzle icon in Chrome and pin **AutoApplier** for quick access.

---

## Quick Start & Verification (Using Mock Job Page)

### Step 1: Open the Mock Application Page
Double-click or open `test/mock_job_application.html` directly in Chrome (or navigate to any live Greenhouse/Lever posting):
```text
file:///Users/sudhanshuprasad/auto_applier/test/mock_job_application.html
```

### Step 2: Open Extension Popup & Review Profile
1. Click the **AutoApplier** icon in Chrome's toolbar.
2. In the **Profile** tab, review or edit your Full Name, Email, Phone, Skills, and Experience.
3. In the **Config** tab, select your preferred free web interface:
   - **ChatGPT Free** (`chatgpt.com`)
   - **Gemini Free** (`gemini.google.com`)
4. Make sure you are logged in to your selected AI platform in your browser.

### Step 3: Click "One-Click Auto Apply"
1. In the extension popup's **Apply** tab, click **🚀 One-Click Auto Apply**.
2. **Observe the Pipeline**:
   - The extension scrapes the Job Description and Form Fields.
   - It focuses or opens your chosen AI tab, types the prompt into the chatbox, and clicks Send.
   - It monitors the streaming response until completion and extracts the structured JSON payload.
   - It switches back to the job application tab.
   - It synthesizes a tailored ATS `.docx` resume in memory and attaches it to the file upload field.
   - It populates all personal info, answers the custom screening questions, and fills disclosure dropdowns.
   - In Review Mode, a floating banner confirms: *"AutoApplier: Form Auto-Filled & Tailored Resume Attached"* with highlighted fields.
