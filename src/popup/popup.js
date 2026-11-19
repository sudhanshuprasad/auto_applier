// AutoApplier Popup Controller

document.addEventListener('DOMContentLoaded', async () => {
  // Navigation Tabs
  initTabs();

  // Load and bind user profile data
  await loadProfile();

  // Detect current active tab & portal
  await detectActiveJobPage();

  // Bind actions
  bindEvents();

  // Listen for pipeline updates from service worker
  chrome.runtime.onMessage.addListener(handleRuntimeMessages);
});

// Default sample profile structure
const DEFAULT_PROFILE = {
  personal: {
    fullName: "Alex Morgan",
    email: "alex.morgan.dev@gmail.com",
    phone: "+1 (415) 555-0199",
    location: "San Francisco, CA",
    linkedin: "https://linkedin.com/in/alexmorgan-dev",
    github: "https://github.com/alexmorgandev",
    portfolio: "https://alexmorgan.dev",
    skills: "JavaScript, TypeScript, React, Next.js, Node.js, Python, PostgreSQL, Redis, Docker, AWS, Git, CI/CD",
    education: "B.S. in Computer Science, UC Berkeley, 2021"
  },
  experience: [
    {
      company: "Apex Cloud Systems",
      role: "Senior Software Engineer",
      startDate: "2022-04",
      endDate: "Present",
      bullets: "Architected real-time event streaming pipeline processing 12M events daily with sub-50ms latency.\nLed migration of monolithic frontend to Next.js micro-frontends, reducing TTI by 45%.\nMentored 4 junior engineers and spearheaded automated unit testing achieving 88% test coverage."
    },
    {
      company: "Starlight Interactive",
      role: "Full Stack Engineer",
      startDate: "2020-06",
      endDate: "2022-03",
      bullets: "Built customer-facing React web applications integrating Stripe billing and OAuth 2.0 authentication.\nDesigned RESTful and GraphQL APIs in Node.js/PostgreSQL with automated database indexing.\nCollaborated with product designers to implement responsive UI component libraries conforming to WCAG 2.1 AA accessibility."
    }
  ],
  defaults: {
    workAuth: "Yes",
    sponsorship: "No",
    salary: "$150,000",
    notice: "2 weeks",
    veteran: "I am not a protected veteran",
    disability: "No, I do not have a disability",
    gender: "Decline to self-identify",
    race: "Decline to self-identify"
  },
  settings: {
    aiProvider: "gemini",
    autoSubmit: false,
    reviewMode: true,
    closeAiTab: true
  }
};

let currentProfile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
let currentActiveTab = null;

// Tab Switching
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId)?.classList.add('active');
    });
  });
}

// Load Profile from chrome.storage.local
async function loadProfile() {
  try {
    const data = await chrome.storage.local.get(['auto_applier_profile']);
    if (data.auto_applier_profile) {
      currentProfile = data.auto_applier_profile;
      if (!currentProfile.settings) {
        currentProfile.settings = { ...DEFAULT_PROFILE.settings };
      }
    } else {
      // First time initialization: save default profile
      await chrome.storage.local.set({ auto_applier_profile: currentProfile });
    }

    populateFormFields();
    renderExperienceCards();
  } catch (err) {
    console.error('Error loading profile:', err);
    addLog('Error reading saved profile from storage.', 'error');
  }
}

// Populate UI form inputs from currentProfile
function populateFormFields() {
  const p = currentProfile.personal || {};
  document.getElementById('prof-fullName').value = p.fullName || '';
  document.getElementById('prof-email').value = p.email || '';
  document.getElementById('prof-phone').value = p.phone || '';
  document.getElementById('prof-location').value = p.location || '';
  document.getElementById('prof-linkedin').value = p.linkedin || '';
  document.getElementById('prof-github').value = p.github || '';
  document.getElementById('prof-portfolio').value = p.portfolio || '';
  document.getElementById('prof-skills').value = p.skills || '';
  document.getElementById('prof-education').value = p.education || '';

  const d = currentProfile.defaults || {};
  document.getElementById('pref-workAuth').value = d.workAuth || 'Yes';
  document.getElementById('pref-sponsorship').value = d.sponsorship || 'No';
  document.getElementById('pref-salary').value = d.salary || '';
  document.getElementById('pref-notice').value = d.notice || '';
  document.getElementById('pref-veteran').value = d.veteran || 'I am not a protected veteran';
  document.getElementById('pref-disability').value = d.disability || 'No, I do not have a disability';
  document.getElementById('pref-gender').value = d.gender || 'Decline to self-identify';
  document.getElementById('pref-race').value = d.race || 'Decline to self-identify';

  const s = currentProfile.settings || {};
  document.getElementById('quick-auto-submit').checked = !!s.autoSubmit;
  document.getElementById('set-review-mode').checked = s.reviewMode !== false;
  document.getElementById('set-close-ai-tab').checked = s.closeAiTab !== false;

  const aiRadios = document.querySelectorAll('input[name="set-ai-provider"]');
  aiRadios.forEach(r => {
    r.checked = (r.value === (s.aiProvider || 'gemini'));
  });

  updateModelBadge(s.aiProvider || 'gemini');
}

// Render dynamic experience cards
function renderExperienceCards() {
  const container = document.getElementById('experience-list');
  container.innerHTML = '';

  const experiences = currentProfile.experience || [];
  experiences.forEach((exp, index) => {
    const card = document.createElement('div');
    card.className = 'exp-card';
    card.innerHTML = `
      <div class="exp-card-header">
        <span class="exp-card-title">${exp.role || 'New Role'} at ${exp.company || 'Company'}</span>
        <button type="button" class="btn-delete-exp" data-index="${index}" title="Remove role">✕</button>
      </div>
      <div class="form-group-row">
        <div class="form-group">
          <label>Company</label>
          <input type="text" class="exp-company" value="${exp.company || ''}" placeholder="Company name">
        </div>
        <div class="form-group">
          <label>Role / Title</label>
          <input type="text" class="exp-role" value="${exp.role || ''}" placeholder="Software Engineer">
        </div>
      </div>
      <div class="form-group-row">
        <div class="form-group">
          <label>Start Date</label>
          <input type="text" class="exp-start" value="${exp.startDate || ''}" placeholder="2021-01">
        </div>
        <div class="form-group">
          <label>End Date</label>
          <input type="text" class="exp-end" value="${exp.endDate || ''}" placeholder="Present">
        </div>
      </div>
      <div class="form-group">
        <label>Achievements & Bullet Points (One per line)</label>
        <textarea class="exp-bullets" rows="3" placeholder="Key responsibilities and quantified accomplishments...">${exp.bullets || ''}</textarea>
      </div>
    `;

    // Listen for inputs to update model in real time
    card.querySelectorAll('input, textarea').forEach(input => {
      input.addEventListener('input', () => {
        exp.company = card.querySelector('.exp-company').value;
        exp.role = card.querySelector('.exp-role').value;
        exp.startDate = card.querySelector('.exp-start').value;
        exp.endDate = card.querySelector('.exp-end').value;
        exp.bullets = card.querySelector('.exp-bullets').value;
        card.querySelector('.exp-card-title').textContent = `${exp.role || 'Role'} at ${exp.company || 'Company'}`;
      });
    });

    // Delete button
    card.querySelector('.btn-delete-exp').addEventListener('click', () => {
      currentProfile.experience.splice(index, 1);
      renderExperienceCards();
    });

    container.appendChild(card);
  });
}

// Save Profile
async function saveAllProfile() {
  // Personal
  currentProfile.personal = {
    fullName: document.getElementById('prof-fullName').value.trim(),
    email: document.getElementById('prof-email').value.trim(),
    phone: document.getElementById('prof-phone').value.trim(),
    location: document.getElementById('prof-location').value.trim(),
    linkedin: document.getElementById('prof-linkedin').value.trim(),
    github: document.getElementById('prof-github').value.trim(),
    portfolio: document.getElementById('prof-portfolio').value.trim(),
    skills: document.getElementById('prof-skills').value.trim(),
    education: document.getElementById('prof-education').value.trim()
  };

  // Defaults
  currentProfile.defaults = {
    workAuth: document.getElementById('pref-workAuth').value,
    sponsorship: document.getElementById('pref-sponsorship').value,
    salary: document.getElementById('pref-salary').value.trim(),
    notice: document.getElementById('pref-notice').value.trim(),
    veteran: document.getElementById('pref-veteran').value,
    disability: document.getElementById('pref-disability').value,
    gender: document.getElementById('pref-gender').value,
    race: document.getElementById('pref-race').value
  };

  // Settings
  const selectedAi = document.querySelector('input[name="set-ai-provider"]:checked')?.value || 'gemini';
  currentProfile.settings = {
    aiProvider: selectedAi,
    autoSubmit: document.getElementById('quick-auto-submit').checked,
    reviewMode: document.getElementById('set-review-mode').checked,
    closeAiTab: document.getElementById('set-close-ai-tab').checked
  };

  await chrome.storage.local.set({ auto_applier_profile: currentProfile });
  updateModelBadge(selectedAi);
  showToast('Settings & Profile Saved!');
}

function updateModelBadge(model) {
  const badge = document.getElementById('active-model-badge');
  if (badge) {
    badge.textContent = model === 'chatgpt' ? 'ChatGPT Free' : 'Gemini Free';
  }
}

// Toast helper
function showToast(msg) {
  const toast = document.getElementById('toast-message');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove('toast-hidden');
  setTimeout(() => {
    toast.classList.add('toast-hidden');
  }, 2200);
}

// Detect active job page
async function detectActiveJobPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;
    currentActiveTab = tab;

    const url = tab.url.toLowerCase();
    const title = tab.title || '';
    const portalBadge = document.getElementById('detected-portal');
    const titleEl = document.getElementById('detected-title');
    const compEl = document.getElementById('detected-company');

    let portalName = "Standard Web Application";
    if (url.includes('greenhouse.io') || url.includes('grnhse.io')) portalName = "Greenhouse ATS";
    else if (url.includes('lever.co')) portalName = "Lever Portal";
    else if (url.includes('myworkdayjobs.com')) portalName = "Workday Portal";
    else if (url.includes('ashbyhq.com')) portalName = "Ashby Portal";
    else if (url.includes('smartrecruiters.com')) portalName = "SmartRecruiters";
    else if (url.includes('linkedin.com/jobs')) portalName = "LinkedIn Jobs";
    else if (url.includes('indeed.com')) portalName = "Indeed Application";

    portalBadge.textContent = portalName;
    titleEl.textContent = title.split(' - ')[0].split(' | ')[0] || "Active Job Posting";
    compEl.textContent = tab.url.split('/')[2] || "Online Application";
  } catch (err) {
    console.error('Error querying tab:', err);
  }
}

// Bind Button & Event Listeners
function bindEvents() {
  // Save buttons
  document.getElementById('btn-save-profile')?.addEventListener('click', saveAllProfile);
  document.getElementById('btn-save-defaults')?.addEventListener('click', saveAllProfile);
  document.getElementById('btn-save-settings')?.addEventListener('click', saveAllProfile);
  document.getElementById('btn-save-experience')?.addEventListener('click', saveAllProfile);

  // Add new experience role
  document.getElementById('btn-add-experience')?.addEventListener('click', () => {
    currentProfile.experience = currentProfile.experience || [];
    currentProfile.experience.unshift({
      company: "",
      role: "Software Engineer",
      startDate: "",
      endDate: "Present",
      bullets: ""
    });
    renderExperienceCards();
  });

  // Quick auto-submit toggle
  document.getElementById('quick-auto-submit')?.addEventListener('change', async (e) => {
    currentProfile.settings = currentProfile.settings || {};
    currentProfile.settings.autoSubmit = e.target.checked;
    await chrome.storage.local.set({ auto_applier_profile: currentProfile });
  });

  // Model selection radio change
  document.querySelectorAll('input[name="set-ai-provider"]').forEach(r => {
    r.addEventListener('change', (e) => {
      updateModelBadge(e.target.value);
    });
  });

  // One-Click Apply Button
  document.getElementById('btn-start-apply')?.addEventListener('click', startApplicationPipeline);
}

// Execute 1-Click Pipeline
async function startApplicationPipeline() {
  if (!currentActiveTab) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentActiveTab = tab;
  }

  if (!currentActiveTab || !currentActiveTab.id) {
    addLog('No active tab detected.', 'error');
    return;
  }

  // Ensure profile has at least name and email
  if (!currentProfile.personal?.fullName || !currentProfile.personal?.email) {
    addLog('Please complete your Full Name and Email in the Profile tab first.', 'warn');
    document.querySelector('[data-tab="tab-profile"]')?.click();
    return;
  }

  const btn = document.getElementById('btn-start-apply');
  btn.disabled = true;
  updateStatusBadge('Processing', 'busy');
  updateProgress(10);
  addLog(`Starting application pipeline for Tab #${currentActiveTab.id}...`, 'info');

  try {
    // Save any pending settings changes
    await saveAllProfile();

    // Trigger service worker pipeline
    chrome.runtime.sendMessage({
      action: 'START_APPLICATION',
      jobTabId: currentActiveTab.id,
      jobUrl: currentActiveTab.url,
      profile: currentProfile
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error starting application:', chrome.runtime.lastError);
        addLog(`Service worker error: ${chrome.runtime.lastError.message}`, 'error');
        btn.disabled = false;
        updateStatusBadge('Error', 'error');
        return;
      }

      if (response && response.status === 'started') {
        addLog('Scraper dispatched. Consulting AI Web Interface...', 'info');
      }
    });
  } catch (err) {
    console.error('Pipeline trigger error:', err);
    addLog(`Pipeline error: ${err.message}`, 'error');
    btn.disabled = false;
    updateStatusBadge('Error', 'error');
  }
}

// Handle runtime messages from Service Worker
function handleRuntimeMessages(msg) {
  if (msg.action === 'PIPELINE_LOG') {
    addLog(msg.message, msg.level || 'info');
    if (typeof msg.progress === 'number') {
      updateProgress(msg.progress);
    }
  } else if (msg.action === 'PIPELINE_STATUS') {
    updateStatusBadge(msg.statusText, msg.badgeClass);
    if (msg.done) {
      document.getElementById('btn-start-apply').disabled = false;
      updateProgress(100);
    }
  }
}

// Progress and log helpers
function updateProgress(percent) {
  const bar = document.getElementById('progress-bar');
  const label = document.getElementById('progress-percentage');
  if (bar) bar.style.width = `${percent}%`;
  if (label) label.textContent = `${percent}%`;
}

function updateStatusBadge(text, type = 'online') {
  const badge = document.getElementById('status-badge');
  const dot = document.querySelector('.status-dot');
  if (badge) badge.textContent = text;
  if (dot) {
    dot.className = 'status-dot ' + type;
  }
}

function addLog(text, level = 'info') {
  const list = document.getElementById('log-list');
  if (!list) return;

  const item = document.createElement('li');
  item.className = `log-item ${level}`;
  item.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  list.appendChild(item);
  list.scrollTop = list.scrollHeight;
}
