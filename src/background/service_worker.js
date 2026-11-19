// AutoApplier Service Worker (Manifest V3)

// Listen for extension installation / update
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log(`AutoApplier installed/updated: ${details.reason}`);
  const { auto_applier_profile } = await chrome.storage.local.get(['auto_applier_profile']);
  if (!auto_applier_profile) {
    console.log('Initializing default user profile in storage.');
    // Storage initialization will be completed by popup if accessed,
    // or we can set an empty baseline schema here.
  }
});

// Central message dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.action) {
        case 'START_APPLICATION':
          await handleStartApplication(message, sendResponse);
          break;

        case 'JOB_SCRAPED_DATA':
          await handleJobScrapedData(message);
          break;

        case 'AI_GENERATION_COMPLETE':
          await handleAiGenerationComplete(message);
          break;

        case 'FORM_FILL_COMPLETE':
          await handleFormFillComplete(message);
          break;

        case 'PIPELINE_ERROR':
          await handlePipelineError(message);
          break;

        default:
          sendResponse({ status: 'unknown_action' });
      }
    } catch (err) {
      console.error('Service worker message handling error:', err);
      broadcastLog(`System error: ${err.message}`, 'error', 0);
      broadcastStatus('Error', 'error', true);
      sendResponse({ status: 'error', error: err.message });
    }
  })();
  return true; // Keep channel open for async response
});

// 1. Kick off application process
async function handleStartApplication(message, sendResponse) {
  const { jobTabId, jobUrl, profile } = message;

  // Persist session state in chrome.storage.session (survives SW suspension)
  await chrome.storage.session.set({
    activeSession: {
      jobTabId,
      jobUrl,
      profile,
      stage: 'SCRAPING',
      startTime: Date.now()
    }
  });

  broadcastLog('Injecting job page scraper...', 'info', 15);
  broadcastStatus('Scraping Page', 'busy');

  // Inject ATS rules & Scraper into job page
  await chrome.scripting.executeScript({
    target: { tabId: jobTabId },
    files: ['src/lib/ats_rules.js', 'src/content/job_scraper.js']
  });

  // Request scrape
  chrome.tabs.sendMessage(jobTabId, { action: 'TRIGGER_SCRAPE' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Scrape trigger error:', chrome.runtime.lastError);
      broadcastLog(`Scrape trigger failed: ${chrome.runtime.lastError.message}`, 'error', 0);
      broadcastStatus('Error', 'error', true);
    }
  });

  sendResponse({ status: 'started' });
}

// 2. Handle Scraped Job Description & Form Fields
async function handleJobScrapedData(message) {
  const { jobTabId, jobData } = message;
  const { activeSession } = await chrome.storage.session.get(['activeSession']);
  if (!activeSession) return;

  activeSession.jobData = jobData;
  activeSession.stage = 'AI_GENERATION';
  await chrome.storage.session.set({ activeSession });

  broadcastLog(`Scraped JD (${jobData.jobDescription.length} chars) & ${jobData.fields.length} form inputs.`, 'success', 35);
  broadcastLog(`Connecting to free ${activeSession.profile.settings.aiProvider === 'gemini' ? 'Gemini' : 'ChatGPT'} web interface...`, 'info', 40);
  broadcastStatus('Consulting AI', 'busy');

  // Construct prompt
  const prompt = buildAiPrompt(jobData, activeSession.profile);

  // Target AI provider URL - always navigate to fresh chat root
  const provider = activeSession.profile.settings.aiProvider || 'gemini';
  const targetUrl = provider === 'gemini' 
    ? 'https://gemini.google.com/app' 
    : 'https://chatgpt.com/?temporary-chat=true';

  // Find or create AI tab
  const aiTab = await getOrCreateAiTab(targetUrl);

  // Save AI tab ID to session
  activeSession.aiTabId = aiTab.id;
  await chrome.storage.session.set({ activeSession });

  // Give tab a brief moment to stabilize if newly opened
  setTimeout(async () => {
    broadcastLog('Injecting Web GUI automator into AI chat tab...', 'info', 50);

    // Ensure content script is ready
    await chrome.scripting.executeScript({
      target: { tabId: aiTab.id },
      files: ['src/lib/ats_rules.js', 'src/content/ai_automator.js']
    });

    // Send prompt to AI Automator
    chrome.tabs.sendMessage(aiTab.id, {
      action: 'RUN_AI_PROMPT',
      provider,
      prompt,
      jobTabId
    });
  }, 1200);
}

// 3. Handle Completed Response from Web GUI AI
async function handleAiGenerationComplete(message) {
  const { jobTabId, aiTabId, parsedData, rawResponse } = message;
  const { activeSession } = await chrome.storage.session.get(['activeSession']);
  if (!activeSession) return;

  broadcastLog('AI response extracted and parsed successfully!', 'success', 75);
  broadcastStatus('Building DOCX & Filling', 'busy');

  // Close AI Tab if user preference dictates
  if (activeSession.profile.settings.closeAiTab && aiTabId) {
    try {
      await chrome.tabs.remove(aiTabId);
    } catch (e) {
      console.warn('Could not close AI tab:', e);
    }
  }

  // Switch back to Job Application Tab
  try {
    await chrome.tabs.update(jobTabId, { active: true });
  } catch (e) {
    console.warn('Could not focus job tab:', e);
  }

  activeSession.parsedAiData = parsedData;
  activeSession.stage = 'FILLING';
  await chrome.storage.session.set({ activeSession });

  broadcastLog('Injecting tailored resume synthesizer & form filler...', 'info', 85);

  // Inject docx library & form filler
  await chrome.scripting.executeScript({
    target: { tabId: jobTabId },
    files: [
      'src/lib/ats_rules.js',
      'src/lib/docx.min.js',
      'src/templates/resume_builder.js',
      'src/content/form_filler.js'
    ]
  });

  // Trigger form filling
  chrome.tabs.sendMessage(jobTabId, {
    action: 'START_FORM_FILL',
    profile: activeSession.profile,
    jobData: activeSession.jobData,
    aiData: parsedData
  });
}

// 4. Handle Form Fill Completion
async function handleFormFillComplete(message) {
  const { filledCount, fileAttached, submitted } = message;
  
  if (submitted) {
    broadcastLog(`Application successfully submitted! (${filledCount} fields populated, resume attached)`, 'success', 100);
    broadcastStatus('Submitted', 'online', true);
  } else {
    broadcastLog(`Form populated (${filledCount} fields, resume attached). Review fields and click Submit!`, 'success', 100);
    broadcastStatus('Ready for Review', 'online', true);
  }

  await chrome.storage.session.remove(['activeSession']);
}

// 5. Handle Pipeline Errors
async function handlePipelineError(message) {
  console.error('Pipeline error received:', message);
  broadcastLog(`Pipeline Error: ${message.error}`, 'error');
  broadcastStatus('Error', 'error', true);
  await chrome.storage.session.remove(['activeSession']);
}

// 6. Multi-Step Wizard Listener (Workday, Multi-page portals)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    const { activeSession } = await chrome.storage.session.get(['activeSession']);
    if (activeSession && activeSession.jobTabId === tabId && activeSession.stage === 'FILLING') {
      console.log(`[AutoApplier] Multi-step page transition detected on Tab #${tabId}. Re-injecting form filler...`);
      broadcastLog('Multi-step page transition detected. Populating next stage...', 'info');

      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: [
            'src/lib/ats_rules.js',
            'src/lib/docx.min.js',
            'src/templates/resume_builder.js',
            'src/content/form_filler.js'
          ]
        });

        chrome.tabs.sendMessage(tabId, {
          action: 'START_FORM_FILL',
          profile: activeSession.profile,
          jobData: activeSession.jobData,
          aiData: activeSession.parsedAiData
        });
      } catch (err) {
        console.warn('[AutoApplier] Multi-step re-injection error:', err);
      }
    }
  }
});

// Helper: Open a fresh new chat session on the AI Provider
async function getOrCreateAiTab(targetUrl) {
  const isGemini = targetUrl.includes('gemini');
  const urlPattern = isGemini ? '*://gemini.google.com/*' : '*://chatgpt.com/*';

  const matchingTabs = await chrome.tabs.query({ url: urlPattern });
  let targetTab = null;

  if (matchingTabs.length > 0) {
    targetTab = matchingTabs[0];
    await chrome.tabs.update(targetTab.id, { url: targetUrl, active: true });
  } else {
    // Open fresh new tab with clean new chat URL
    targetTab = await chrome.tabs.create({ url: targetUrl, active: true });
  }

  // Wait until tab completes loading the new chat page
  await new Promise((resolve) => {
    const listener = (tabId, info) => {
      if (tabId === targetTab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });

  return targetTab;
}

// Helper: Construct JSON-only prompt
function buildAiPrompt(jobData, profile) {
  const fieldsContext = jobData.fields.map(f => {
    return `- [${f.id || f.name}]: "${f.label || f.placeholder || f.name}" (Type: ${f.type})`;
  }).join('\n');

  return `You are an expert ATS Resume & Job Application Assistant.
Task:
1. Tailor the applicant's experience bullet points and professional summary to aggressively align with the target Job Description while remaining completely truthful to their background.
2. Formulate direct, tailored answers for the custom screening questions detected on this application form.

=== TARGET JOB ===
Title: ${jobData.jobTitle || 'Role'}
Company: ${jobData.company || 'Company'}
Description:
${jobData.jobDescription.slice(0, 4000)}

=== APPLICANT MASTER PROFILE ===
Name: ${profile.personal.fullName}
Skills: ${profile.personal.skills}
Education: ${profile.personal.education}
Work Experience:
${profile.experience.map(e => `[${e.company} - ${e.role} (${e.startDate} to ${e.endDate})]\n${e.bullets}`).join('\n\n')}

=== FORM QUESTIONS DETECTED ===
${fieldsContext}

=== DEFAULT DISCLOSURES ===
Authorized to work: ${profile.defaults.workAuth}
Requires visa sponsorship: ${profile.defaults.sponsorship}
Target Compensation: ${profile.defaults.salary}
Notice Period: ${profile.defaults.notice}

IMPORTANT INSTRUCTIONS:
- You must respond with ONLY a single valid raw JSON object.
- DO NOT include any conversational preamble, explanations, or Markdown fences (no \`\`\`json).
- Use this EXACT JSON schema:

{
  "tailored_summary": "A 3-4 sentence high-impact summary targeting this role.",
  "highlighted_skills": ["Skill 1", "Skill 2", "Skill 3", "Skill 4", "Skill 5"],
  "tailored_experience": [
    {
      "company": "Company Name",
      "role": "Role Title",
      "bullets": [
        "Tailored achievement bullet point incorporating JD keywords...",
        "Quantified metric-driven bullet point..."
      ]
    }
  ],
  "form_answers": {
    "field_id_or_label": "Direct, tailored, professional answer"
  }
}`;
}

// Broadcast helpers to keep popup or devtools updated
function broadcastLog(message, level = 'info', progress = null) {
  chrome.runtime.sendMessage({
    action: 'PIPELINE_LOG',
    message,
    level,
    progress
  }).catch(() => {}); // Ignore error if popup is closed
}

function broadcastStatus(statusText, badgeClass = 'online', done = false) {
  chrome.runtime.sendMessage({
    action: 'PIPELINE_STATUS',
    statusText,
    badgeClass,
    done
  }).catch(() => {}); // Ignore error if popup is closed
}
