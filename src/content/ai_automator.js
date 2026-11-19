// AutoApplier Free AI Web GUI Automator (ChatGPT & Gemini)

(() => {
  if (window.__autoApplierAiAutomatorLoaded) {
    console.log('AutoApplier AI Automator already loaded.');
    return;
  }
  window.__autoApplierAiAutomatorLoaded = true;

  console.log('[AutoApplier] AI Web GUI Automator initialized on:', window.location.hostname);

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'RUN_AI_PROMPT') {
      const { provider, prompt, jobTabId } = request;
      console.log(`[AutoApplier] Executing prompt on ${provider} for Job Tab #${jobTabId}`);

      handleAiPromptExecution(provider, prompt, jobTabId)
        .then((result) => {
          sendResponse({ status: 'completed', result });
        })
        .catch((err) => {
          console.error('[AutoApplier] AI Execution Failed:', err);
          chrome.runtime.sendMessage({
            action: 'PIPELINE_ERROR',
            error: `AI Web GUI error: ${err.message}`
          });
          sendResponse({ status: 'error', error: err.message });
        });

      return true; // Keep message channel open for async response
    }
  });

  async function handleAiPromptExecution(provider, prompt, jobTabId) {
    // 1. Check Login Status
    checkLoginState(provider);

    // 2. Inject Prompt into Web GUI Chatbox
    if (provider === 'gemini') {
      await injectAndSubmitGemini(prompt);
      const rawText = await waitForGeminiCompletion();
      const parsedData = extractJsonFromText(rawText);
      chrome.runtime.sendMessage({
        action: 'AI_GENERATION_COMPLETE',
        jobTabId,
        parsedData,
        rawResponse: rawText
      });
      return parsedData;
    } else {
      // Default: ChatGPT
      await injectAndSubmitChatGPT(prompt);
      const rawText = await waitForChatGPTCompletion();
      const parsedData = extractJsonFromText(rawText);
      chrome.runtime.sendMessage({
        action: 'AI_GENERATION_COMPLETE',
        jobTabId,
        parsedData,
        rawResponse: rawText
      });
      return parsedData;
    }
  }

  // --- Login State Verification ---
  function checkLoginState(provider) {
    if (provider === 'gemini') {
      const signInBtn = document.querySelector('a[href*="accounts.google.com"], button[aria-label*="Sign in"]');
      if (signInBtn) {
        throw new Error('You are not logged in to Gemini. Please sign in to Google Gemini in this tab and try again.');
      }
    } else {
      // ChatGPT
      const loginBtn = document.querySelector('button[data-testid="login-button"], a[href*="/auth/login"], a[href*="/login"]');
      if (loginBtn && !document.querySelector('#prompt-textarea')) {
        throw new Error('You are not logged in to ChatGPT. Please sign in to ChatGPT in this tab and try again.');
      }
    }
  }

  // --- ChatGPT Automator ---
  async function injectAndSubmitChatGPT(prompt) {
    console.log('[AutoApplier] Locating ChatGPT input textarea...');

    // If currently on an existing conversation URL (/c/...), click "New chat" if available
    if (window.location.pathname.startsWith('/c/')) {
      const newChatBtn = document.querySelector('a[href="/"], button[aria-label*="New chat"], a[data-discover="true"]');
      if (newChatBtn) {
        console.log('[AutoApplier] Clicking New Chat in ChatGPT UI...');
        newChatBtn.click();
        await delay(1000);
      }
    }

    // Wait for the prompt textarea to be present in DOM (up to 10s)
    const textarea = await waitForElement([
      '#prompt-textarea',
      'div[contenteditable="true"]#prompt-textarea',
      'div[contenteditable="true"][data-placeholder]',
      'textarea[data-id="root"]'
    ], 10000);

    if (!textarea) {
      throw new Error('ChatGPT chat input element (#prompt-textarea) not found.');
    }

    // Focus & prepare input
    textarea.focus();
    await delay(200);

    // In ProseMirror / Slate, execCommand insertText is the most reliable way to trigger internal state
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    
    // Insert text
    const success = document.execCommand('insertText', false, prompt);
    if (!success) {
      // Fallback: direct text assignment with input event
      if (textarea.tagName.toLowerCase() === 'textarea') {
        textarea.value = prompt;
      } else {
        textarea.textContent = prompt;
      }
    }

    // Dispatch input events
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    await delay(400);

    // Locate and click the send button
    const sendButton = await waitForElement([
      'button[data-testid="send-button"]',
      'button[aria-label*="Send prompt"]',
      'button[aria-label*="Send message"]',
      'button[aria-label="Send"]',
      'button.mb-1.mr-1'
    ], 4000);

    if (sendButton && !sendButton.disabled) {
      console.log('[AutoApplier] Clicking ChatGPT Send button.');
      sendButton.click();
    } else {
      console.log('[AutoApplier] Send button disabled or not found, dispatching Enter keydown...');
      textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      }));
    }
  }

  // Wait for ChatGPT to finish generating response
  async function waitForChatGPTCompletion() {
    console.log('[AutoApplier] Waiting for ChatGPT generation to complete...');
    await delay(1500); // Give streaming a moment to begin

    return new Promise((resolve, reject) => {
      const maxTimeoutMs = 120000; // 2 minutes max
      const startTime = Date.now();
      let lastText = '';
      let sameTextCount = 0;

      const interval = setInterval(() => {
        // Check timeout
        if (Date.now() - startTime > maxTimeoutMs) {
          clearInterval(interval);
          reject(new Error('ChatGPT generation timed out after 120 seconds.'));
          return;
        }

        // Look for the "Stop generating" button
        const stopBtn = document.querySelector([
          'button[data-testid="stop-button"]',
          'button[aria-label="Stop generating"]',
          'button[aria-label*="Stop"]'
        ].join(','));

        // Query the latest assistant response message container
        const messages = document.querySelectorAll([
          '[data-message-author-role="assistant"]',
          'div[data-testid*="conversation-turn-"] .markdown',
          'div.agent-turn .markdown',
          '.markdown'
        ].join(','));

        if (messages.length > 0) {
          const latestMessage = messages[messages.length - 1];
          const currentText = latestMessage.innerText.trim();

          // If stop button is gone and we have content
          if (!stopBtn && currentText.length > 50) {
            if (currentText === lastText) {
              sameTextCount++;
              if (sameTextCount >= 2) {
                // Completed!
                clearInterval(interval);
                console.log('[AutoApplier] ChatGPT streaming finished. Text length:', currentText.length);
                resolve(currentText);
                return;
              }
            } else {
              lastText = currentText;
              sameTextCount = 0;
            }
          }
        }
      }, 1000);
    });
  }

  // --- Gemini Automator ---
  async function injectAndSubmitGemini(prompt) {
    console.log('[AutoApplier] Locating Gemini input textarea...');

    const textbox = await waitForElement([
      'rich-textarea div[role="textbox"]',
      'div[contenteditable="true"][role="textbox"]',
      '.ql-editor',
      'textarea'
    ], 10000);

    if (!textbox) {
      throw new Error('Gemini input box (div[role="textbox"]) not found.');
    }

    textbox.focus();
    await delay(200);

    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    document.execCommand('insertText', false, prompt);

    textbox.dispatchEvent(new Event('input', { bubbles: true }));
    await delay(400);

    const sendBtn = await waitForElement([
      'button[aria-label*="Send"]',
      'button.send-button',
      '.send-button-container button'
    ], 4000);

    if (sendBtn && !sendBtn.disabled) {
      console.log('[AutoApplier] Clicking Gemini Send button.');
      sendBtn.click();
    } else {
      console.log('[AutoApplier] Dispatching Enter key on Gemini input...');
      textbox.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true
      }));
    }
  }

  // Wait for Gemini to finish generating response
  async function waitForGeminiCompletion() {
    console.log('[AutoApplier] Waiting for Gemini generation to complete...');
    await delay(1800);

    return new Promise((resolve, reject) => {
      const maxTimeoutMs = 120000;
      const startTime = Date.now();
      let lastText = '';
      let sameTextCount = 0;

      const interval = setInterval(() => {
        if (Date.now() - startTime > maxTimeoutMs) {
          clearInterval(interval);
          reject(new Error('Gemini generation timed out after 120 seconds.'));
          return;
        }

        // Query responses
        const responseEls = document.querySelectorAll([
          'message-content',
          '.model-response-text',
          'div[class*="response-content"]',
          '.response-container-content'
        ].join(','));

        if (responseEls.length > 0) {
          const latestEl = responseEls[responseEls.length - 1];
          const currentText = latestEl.innerText.trim();

          // Check if streaming indicator is active
          const isTyping = document.querySelector('.typing-indicator, [class*="sparkle-anim"], [class*="loading-spinner"]');

          if (!isTyping && currentText.length > 50) {
            if (currentText === lastText) {
              sameTextCount++;
              if (sameTextCount >= 2) {
                clearInterval(interval);
                console.log('[AutoApplier] Gemini streaming finished. Text length:', currentText.length);
                resolve(currentText);
                return;
              }
            } else {
              lastText = currentText;
              sameTextCount = 0;
            }
          }
        }
      }, 1000);
    });
  }

  // --- Robust JSON Extraction ---
  function extractJsonFromText(rawText) {
    if (!rawText) throw new Error('AI returned empty response.');

    // 1. Try stripping standard ```json ... ``` markdown code block
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    let candidate = fenceMatch ? fenceMatch[1].trim() : rawText.trim();

    // Direct JSON parse attempt
    try {
      return JSON.parse(candidate);
    } catch (e) {
      // Continue to search for balanced { ... }
    }

    // 2. Find outermost matching { and }
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonCandidate = rawText.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(jsonCandidate);
      } catch (err) {
        console.warn('[AutoApplier] Regex repair needed on JSON substring:', err);
        // Attempt simple repairs: replace unescaped line breaks inside strings
        const repaired = jsonCandidate.replace(/[\u0000-\u001F]+/g, ' ');
        return JSON.parse(repaired);
      }
    }

    throw new Error('Failed to find a valid JSON object in the AI response.');
  }

  // --- Helper Utilities ---
  function waitForElement(selectors, timeoutMs = 8000) {
    const selectorString = Array.isArray(selectors) ? selectors.join(',') : selectors;
    const existing = document.querySelector(selectorString);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve) => {
      const startTime = Date.now();
      const interval = setInterval(() => {
        const el = document.querySelector(selectorString);
        if (el) {
          clearInterval(interval);
          resolve(el);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(interval);
          resolve(null);
        }
      }, 250);
    });
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
})();
