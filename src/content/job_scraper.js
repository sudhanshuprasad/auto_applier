// AutoApplier Universal Job Page Scraper

(() => {
  if (window.__autoApplierScraperLoaded) {
    console.log('AutoApplier Scraper already initialized.');
    return;
  }
  window.__autoApplierScraperLoaded = true;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'TRIGGER_SCRAPE') {
      try {
        const jobData = scrapeJobPosting();
        chrome.runtime.sendMessage({
          action: 'JOB_SCRAPED_DATA',
          jobTabId: sender.tab ? sender.tab.id : null,
          jobData
        });
        sendResponse({ status: 'scraped', count: jobData.fields.length });
      } catch (err) {
        console.error('Scraping error:', err);
        chrome.runtime.sendMessage({
          action: 'PIPELINE_ERROR',
          error: `Scraping failed: ${err.message}`
        });
        sendResponse({ status: 'error', error: err.message });
      }
    }
    return true;
  });

  function scrapeJobPosting() {
    const url = window.location.href;
    const platform = window.AtsRules ? window.AtsRules.detectPlatform(url) : 'generic';

    const jobTitle = extractJobTitle(platform);
    const company = extractCompany(platform);
    const jobDescription = extractJobDescription(platform);
    const fields = extractFormFields();

    console.log(`[AutoApplier] Scraped Job: "${jobTitle}" at "${company}" (${platform})`);
    console.log(`[AutoApplier] Found ${fields.length} form inputs.`);

    return {
      url,
      platform,
      jobTitle,
      company,
      jobDescription,
      fields,
      hasFileInput: fields.some(f => f.type === 'file')
    };
  }

  // Extract Job Title
  function extractJobTitle(platform) {
    const rules = window.AtsRules;
    const selectors = (rules && rules.titleSelectors[platform]) || rules.titleSelectors.generic;

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 2) {
        return el.innerText.trim();
      }
    }

    // Fallback: document title
    const docTitle = document.title || '';
    return docTitle.split(/[-–|]/)[0].trim() || 'Software Engineer';
  }

  // Extract Company Name
  function extractCompany(platform) {
    const rules = window.AtsRules;
    const selectors = (rules && rules.companySelectors[platform]) || rules.companySelectors.generic;

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 1) {
        return el.innerText.trim();
      }
    }

    // Fallback: parse hostname
    const host = window.location.hostname.replace('www.', '');
    return host.split('.')[0] || 'Target Company';
  }

  // Extract Job Description
  function extractJobDescription(platform) {
    const rules = window.AtsRules;
    const selectors = (rules && rules.jdSelectors[platform]) || rules.jdSelectors.generic;

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 180) {
        return cleanText(el.innerText);
      }
    }

    // Heuristic fallback: Find the container with the highest paragraph / word density
    const candidates = Array.from(document.querySelectorAll('article, main, section, div'));
    let bestText = '';
    let maxWords = 0;

    candidates.forEach(el => {
      // Ignore header, footer, navigation, scripts
      if (el.closest('header, footer, nav, script, style')) return;
      const text = el.innerText || '';
      const wordCount = text.split(/\s+/).length;
      if (wordCount > maxWords && wordCount < 6000) {
        maxWords = wordCount;
        bestText = text;
      }
    });

    return cleanText(bestText) || cleanText(document.body.innerText.slice(0, 4000));
  }

  // Clean and normalize text
  function cleanText(raw) {
    if (!raw) return '';
    return raw
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Extract all interactive form controls
  function extractFormFields() {
    const fieldElements = Array.from(document.querySelectorAll(
      'input, textarea, select, [role="combobox"], [role="radiogroup"]'
    ));

    const fields = [];
    const seenSelectors = new Set();

    fieldElements.forEach((el, index) => {
      // Skip hidden, submit, or button inputs
      const type = (el.getAttribute('type') || el.tagName.toLowerCase()).toLowerCase();
      if (['hidden', 'submit', 'button', 'image', 'reset'].includes(type)) return;

      // Skip elements that are inside hidden dialogs/containers
      const style = window.getComputedStyle(el);
      if (style.display === 'none' && type !== 'file') return; // Keep hidden file inputs

      const label = resolveFieldLabel(el);
      const semanticKey = window.AtsRules ? window.AtsRules.matchSemanticField(label || el.name || el.id) : null;
      const selector = generateUniqueSelector(el, index);

      if (seenSelectors.has(selector)) return;
      seenSelectors.add(selector);

      // Collect options if select element
      let options = [];
      if (el.tagName.toLowerCase() === 'select') {
        options = Array.from(el.querySelectorAll('option'))
          .map(o => o.text.trim())
          .filter(t => t.length > 0 && !t.toLowerCase().includes('select') && !t.toLowerCase().includes('choose'));
      }

      fields.push({
        id: el.id || '',
        name: el.name || '',
        type,
        label: label || el.placeholder || el.name || 'Custom Field',
        semanticKey,
        required: el.required || el.getAttribute('aria-required') === 'true' || false,
        placeholder: el.placeholder || '',
        selector,
        options
      });
    });

    return fields;
  }

  // Resolve semantic label for an input element
  function resolveFieldLabel(el) {
    // 1. Explicit <label for="...">
    if (el.id) {
      const explicitLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (explicitLabel && explicitLabel.innerText.trim()) {
        return cleanLabelText(explicitLabel.innerText);
      }
    }

    // 2. Parent / Ancestor <label>
    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.innerText.trim()) {
      return cleanLabelText(parentLabel.innerText);
    }

    // 3. aria-label or aria-labelledby
    if (el.getAttribute('aria-label')) {
      return cleanLabelText(el.getAttribute('aria-label'));
    }
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const refEl = document.getElementById(labelledBy);
      if (refEl && refEl.innerText.trim()) {
        return cleanLabelText(refEl.innerText);
      }
    }

    // 4. Preceding sibling or adjacent text container
    const container = el.closest('.form-group, .field, [class*="form"], [class*="field"], div');
    if (container) {
      const labelInContainer = container.querySelector('label, .label, [class*="label"], span');
      if (labelInContainer && labelInContainer.innerText.trim()) {
        return cleanLabelText(labelInContainer.innerText);
      }
    }

    // 5. Placeholder, Name, or ID fallback
    return el.placeholder || el.name || el.id || '';
  }

  function cleanLabelText(text) {
    if (!text) return '';
    return text
      .replace(/[*:]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Generate unique selector for querySelector in form_filler
  function generateUniqueSelector(el, fallbackIndex) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el.name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
    if (el.getAttribute('data-automation-id')) {
      return `[data-automation-id="${CSS.escape(el.getAttribute('data-automation-id'))}"]`;
    }
    return `${el.tagName.toLowerCase()}:nth-of-type(${fallbackIndex + 1})`;
  }
})();
