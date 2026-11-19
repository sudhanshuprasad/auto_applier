// AutoApplier React/Vue-Safe Form Filler & In-Memory File Injector

(() => {
  if (window.__autoApplierFillerLoaded) {
    console.log('AutoApplier Form Filler already active.');
    return;
  }
  window.__autoApplierFillerLoaded = true;

  console.log('[AutoApplier] Form Filler initialized.');

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_FORM_FILL') {
      const { profile, jobData, aiData } = request;
      console.log('[AutoApplier] Received form fill directive with profile & AI data.');

      executeFormFill(profile, jobData, aiData)
        .then((result) => {
          sendResponse({ status: 'completed', result });
        })
        .catch((err) => {
          console.error('[AutoApplier] Form Fill Error:', err);
          chrome.runtime.sendMessage({
            action: 'PIPELINE_ERROR',
            error: `Form fill failed: ${err.message}`
          });
          sendResponse({ status: 'error', error: err.message });
        });

      return true;
    }
  });

  async function executeFormFill(profile, jobData, aiData) {
    let filledCount = 0;
    let fileAttached = false;

    // 1. Synthesize Tailored Resume File In-Memory
    let resumeFile = null;
    try {
      if (window.ResumeBuilder) {
        resumeFile = window.ResumeBuilder.generateResumeFile(profile, aiData);
      }
    } catch (e) {
      console.warn('[AutoApplier] Could not generate in-memory resume:', e);
    }

    // 2. Attach File into file inputs
    if (resumeFile) {
      fileAttached = attachFileToInputs(resumeFile);
    }

    // 3. Map Fields and Populate
    const fieldMap = buildFieldValuesMap(profile, aiData);
    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]), textarea, select');

    inputs.forEach(el => {
      const resolvedValue = resolveValueForElement(el, fieldMap);
      if (resolvedValue !== null && resolvedValue !== undefined && resolvedValue !== '') {
        setNativeValue(el, resolvedValue);
        highlightFilledField(el);
        filledCount++;
      }
    });

    console.log(`[AutoApplier] Successfully populated ${filledCount} fields.`);

    // 4. Handle Safe Review Banner vs Auto-Submit
    const isAutoSubmit = !!(profile.settings && profile.settings.autoSubmit);
    const hasCaptcha = checkForCaptcha();

    if (isAutoSubmit && !hasCaptcha) {
      console.log('[AutoApplier] Auto-submit enabled. Waiting 1.5s for upload validation before submission...');
      await delay(1500);
      const submitted = clickSubmitButton();
      chrome.runtime.sendMessage({
        action: 'FORM_FILL_COMPLETE',
        filledCount,
        fileAttached,
        submitted
      });
      return { filledCount, fileAttached, submitted };
    } else {
      // Safe Review Mode: Show Banner & Highlight
      injectReviewBanner(hasCaptcha);
      chrome.runtime.sendMessage({
        action: 'FORM_FILL_COMPLETE',
        filledCount,
        fileAttached,
        submitted: false
      });
      return { filledCount, fileAttached, submitted: false };
    }
  }

  // Build a normalized lookup table from profile + defaults + AI form_answers
  function buildFieldValuesMap(profile, aiData) {
    const p = profile.personal || {};
    const d = profile.defaults || {};
    const answers = (aiData && aiData.form_answers) || {};

    const nameParts = (p.fullName || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Standard Semantic Key Map
    const map = {
      firstName,
      lastName,
      fullName: p.fullName,
      email: p.email,
      phone: p.phone,
      location: p.location,
      linkedin: p.linkedin,
      github: p.github,
      portfolio: p.portfolio,
      workAuth: d.workAuth || 'Yes',
      sponsorship: d.sponsorship || 'No',
      salary: d.salary || '',
      notice: d.notice || '',
      veteran: d.veteran || 'I am not a protected veteran',
      disability: d.disability || 'No, I do not have a disability',
      gender: d.gender || 'Decline to self-identify',
      race: d.race || 'Decline to self-identify'
    };

    // Attach raw AI answers (both by lowercase key and original key)
    map.aiAnswers = {};
    for (const [q, a] of Object.entries(answers)) {
      map.aiAnswers[q.toLowerCase().trim()] = a;
    }

    return map;
  }

  // Resolve matching value for an input element
  function resolveValueForElement(el, fieldMap) {
    const label = getLabelText(el).toLowerCase().trim();
    const name = (el.name || '').toLowerCase().trim();
    const id = (el.id || '').toLowerCase().trim();
    const placeholder = (el.placeholder || '').toLowerCase().trim();

    // 1. Check AI-generated custom screening answers first
    if (fieldMap.aiAnswers) {
      for (const [questionKey, answerVal] of Object.entries(fieldMap.aiAnswers)) {
        if (
          (label && (label.includes(questionKey) || questionKey.includes(label))) ||
          (name && name.includes(questionKey)) ||
          (id && id.includes(questionKey))
        ) {
          return answerVal;
        }
      }
    }

    // 2. Check semantic key from AtsRules
    const semanticKey = window.AtsRules ? window.AtsRules.matchSemanticField(label || placeholder || name) : null;
    if (semanticKey && fieldMap[semanticKey]) {
      return fieldMap[semanticKey];
    }

    // 3. Fallback direct string matching
    if (label.includes('first name') || name.includes('firstname') || name === 'fname') return fieldMap.firstName;
    if (label.includes('last name') || name.includes('lastname') || name === 'lname') return fieldMap.lastName;
    if (label.includes('full name') || label === 'name' || name === 'name') return fieldMap.fullName;
    if (label.includes('email') || name.includes('email')) return fieldMap.email;
    if (label.includes('phone') || label.includes('mobile') || name.includes('phone')) return fieldMap.phone;
    if (label.includes('linkedin') || name.includes('linkedin')) return fieldMap.linkedin;
    if (label.includes('github') || name.includes('github')) return fieldMap.github;
    if (label.includes('website') || label.includes('portfolio') || name.includes('website')) return fieldMap.portfolio;
    if (label.includes('city') || label.includes('location') || label.includes('address')) return fieldMap.location;

    // Disclosures
    if (label.includes('authorized to work') || label.includes('legally authorized')) return fieldMap.workAuth;
    if (label.includes('sponsorship') || label.includes('visa')) return fieldMap.sponsorship;
    if (label.includes('salary') || label.includes('compensation') || label.includes('desired pay')) return fieldMap.salary;

    return null;
  }

  // React/Vue-Safe Setter Override
  function setNativeValue(element, value) {
    if (!element || value === undefined || value === null) return;
    const tag = element.tagName.toLowerCase();
    const type = (element.getAttribute('type') || '').toLowerCase();

    // Select dropdowns
    if (tag === 'select') {
      selectDropdownOption(element, value);
      return;
    }

    // Checkboxes
    if (type === 'checkbox') {
      const boolVal = (value === true || String(value).toLowerCase() === 'yes' || String(value).toLowerCase() === 'true');
      if (element.checked !== boolVal) {
        element.checked = boolVal;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }

    // Radio buttons
    if (type === 'radio') {
      if (element.value.toLowerCase() === String(value).toLowerCase()) {
        element.checked = true;
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }

    // Standard inputs & textareas: override prototype to sync React synthetic state
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

  // Select dropdown option by fuzzy text match
  function selectDropdownOption(selectEl, targetValue) {
    const cleanTarget = String(targetValue).toLowerCase().trim();
    const options = Array.from(selectEl.options);

    let matchIndex = -1;
    // Exact or contains match
    for (let i = 0; i < options.length; i++) {
      const optText = options[i].text.toLowerCase().trim();
      const optVal = options[i].value.toLowerCase().trim();
      if (optText === cleanTarget || optVal === cleanTarget || optText.includes(cleanTarget)) {
        matchIndex = i;
        break;
      }
    }

    if (matchIndex !== -1) {
      selectEl.selectedIndex = matchIndex;
      selectEl.dispatchEvent(new Event('input', { bubbles: true }));
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // Attach File to input[type="file"] via DataTransfer
  function attachFileToInputs(file) {
    const fileInputs = document.querySelectorAll('input[type="file"]');
    if (fileInputs.length === 0) {
      console.warn('[AutoApplier] No input[type="file"] found on page.');
      return false;
    }

    let attached = false;
    fileInputs.forEach(input => {
      // Check if this input is for resume/cv (or only file input on page)
      const label = (getLabelText(input) + ' ' + (input.name || '')).toLowerCase();
      if (fileInputs.length === 1 || label.includes('resume') || label.includes('cv') || !label.includes('cover')) {
        try {
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;

          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('input', { bubbles: true }));

          // Also simulate drop on parent dropzone if present
          const dropzone = input.closest('.dropzone, [class*="drop-zone"], [class*="upload"], label');
          if (dropzone) {
            dropzone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
          }

          highlightFilledField(input);
          attached = true;
          console.log('[AutoApplier] Resume attached to:', input);
        } catch (err) {
          console.error('[AutoApplier] Failed to attach file:', err);
        }
      }
    });

    return attached;
  }

  // Visual highlight for filled fields
  function highlightFilledField(el) {
    el.style.transition = 'all 0.3s ease';
    el.style.outline = '2px solid #10b981';
    el.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.4)';
    el.setAttribute('data-auto-applied', 'true');
  }

  // Floating Action Banner for Safe Review Mode
  function injectReviewBanner(hasCaptcha) {
    if (document.getElementById('auto-applier-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'auto-applier-banner';
    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:20px;">⚡</span>
        <div>
          <div style="font-weight:700;font-size:13px;color:#fff;">AutoApplier: Form Auto-Filled & Tailored Resume Attached</div>
          <div style="font-size:11px;color:#cbd5e1;">${hasCaptcha ? '⚠️ CAPTCHA detected — please solve it, review fields, and click Submit.' : 'Review highlighted fields below and click Submit to complete.'}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="btn-banner-close" style="background:#334155;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">Dismiss</button>
        <button id="btn-banner-submit" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;padding:6px 16px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(99,102,241,0.4);">Confirm & Submit</button>
      </div>
    `;

    Object.assign(banner.style, {
      position: 'fixed',
      top: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: '#0f172a',
      color: '#fff',
      padding: '12px 20px',
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px #334155',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '24px',
      zIndex: '2147483647',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    });

    document.body.appendChild(banner);

    document.getElementById('btn-banner-close')?.addEventListener('click', () => {
      banner.remove();
    });

    document.getElementById('btn-banner-submit')?.addEventListener('click', () => {
      banner.remove();
      clickSubmitButton();
    });
  }

  // Detect CAPTCHA gates
  function checkForCaptcha() {
    const captchaSelectors = [
      'iframe[src*="recaptcha"]',
      'iframe[src*="hcaptcha"]',
      'iframe[src*="turnstile"]',
      '#cf-turnstile',
      '.g-recaptcha',
      '.h-captcha'
    ];
    return !!document.querySelector(captchaSelectors.join(','));
  }

  // Trigger form submit button
  function clickSubmitButton() {
    const submitBtn = document.querySelector([
      'input[type="submit"]',
      'button[type="submit"]',
      'button[data-automation-id*="submit"]',
      '#submit_app',
      'button.submit-button',
      '.postings-btn'
    ].join(','));

    if (submitBtn) {
      console.log('[AutoApplier] Clicking Submit button:', submitBtn);
      submitBtn.click();
      return true;
    }
    return false;
  }

  function getLabelText(el) {
    if (el.id) {
      const explicit = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (explicit) return explicit.innerText.trim();
    }
    const parent = el.closest('label');
    if (parent) return parent.innerText.trim();
    return el.getAttribute('aria-label') || el.placeholder || el.name || '';
  }

  function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
})();
