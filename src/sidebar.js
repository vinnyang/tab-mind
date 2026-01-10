document.addEventListener('DOMContentLoaded', () => {
  const elements = {
    sendButton: document.getElementById('send-button'),
    promptInput: document.getElementById('prompt-input'),
    chatMessages: document.getElementById('chat-messages'),
    clearChatBtn: document.getElementById('clear-chat'),
    contextDisplay: document.getElementById('context-display'),
    suggestionsContainer: document.getElementById('suggestions'),
    debugInfo: document.getElementById('debug-info'),
    debugText: document.getElementById('debug-text'),
    detectModelsButton: document.getElementById('detect-models'),
    refreshModelsBtn: document.getElementById('refresh-models-btn'),
    modelInfo: document.getElementById('model-info'),
    sidebarContainer: document.getElementById('sidebar-container'),
    modelSelect: document.getElementById('model-select'),
    endpointInput: document.getElementById('endpoint-input'),
    timeoutInput: document.getElementById('timeout-input'),
    refreshButton: document.getElementById('refresh-button'),
    toggleContextButton: document.getElementById('toggle-context'),
    contextSection: document.querySelector('.context-section'),
    toggleDebugButton: document.getElementById('toggle-debug'),
    debugSection: document.querySelector('.debug-section'),
    providerSelect: document.getElementById('provider-select'),
    apiKeyInput: document.getElementById('api-key-input'),
    passphraseInput: document.getElementById('passphrase-input'),
    saveApiKeyBtn: document.getElementById('save-api-key'),
    forgetApiKeyBtn: document.getElementById('forget-api-key'),
    refererInput: document.getElementById('referer-input'),
    titleInput: document.getElementById('title-input'),
    apiKeyStatus: document.getElementById('api-key-status'),
    resizeHandle: document.getElementById('resize-handle'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    closeSettingsBtn: document.getElementById('close-settings'),
    themeSwitch: document.getElementById('theme-switch'),
    systemMsgSwitch: document.getElementById('system-msg-switch'),
    contextSwitch: document.getElementById('context-switch'),
    openrouterFilters: document.getElementById('openrouter-filters'),
    modelSearch: document.getElementById('model-search'),
    variantFilters: document.getElementById('variant-filters'),
    modelCount: document.getElementById('model-count'),
  };

  let modelInfoTimeout = null;
  let showSystemMessages = false;
  let showPageContext = true;
  let currentModels = [];
  let openrouterSearchText = '';
  let selectedVariantSuffixes = new Set(['free']);

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (elements.themeSwitch) {
      elements.themeSwitch.checked = theme === 'dark';
    }
    browser.storage.local.set({ theme });
  }

  browser.storage.local.get(['theme']).then((result) => {
    setTheme(result.theme || 'dark');
  });

  if (elements.themeSwitch) {
    elements.themeSwitch.addEventListener('change', (e) => {
      const newTheme = e.target.checked ? 'dark' : 'light';
      setTheme(newTheme);
    });
  }

  elements.settingsBtn.addEventListener('click', () => {
    elements.settingsModal.classList.remove('hidden');
  });

  elements.closeSettingsBtn.addEventListener('click', () => {
    elements.settingsModal.classList.add('hidden');
  });

  elements.settingsModal.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) {
      elements.settingsModal.classList.add('hidden');
    }
  });

  async function getCurrentTab() {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tab;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderMarkdown(md) {
    if (!md) return '';
    let text = String(md).replace(/\r\n?/g, '\n');
    text = escapeHtml(text);

    text = text.replace(
      /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g,
      (m, lang, code) => `<pre><code>${code.replace(/</g, '&lt;')}</code></pre>`
    );

    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

    text = text
      .replace(/^######\s*(.*)$/gm, '<h6>$1</h6>')
      .replace(/^#####\s*(.*)$/gm, '<h5>$1</h5>')
      .replace(/^####\s*(.*)$/gm, '<h4>$1</h4>')
      .replace(/^###\s*(.*)$/gm, '<h3>$1</h3>')
      .replace(/^##\s*(.*)$/gm, '<h2>$1</h2>')
      .replace(/^#\s*(.*)$/gm, '<h1>$1</h1>');

    text = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');

    text = text.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (m, label, url) =>
        `<a href="${url.replace(
          /"/g,
          '%22'
        )}" target="_blank" rel="noopener noreferrer">${label}</a>`
    );

    text = text.replace(
      /(^|\n)([ \t]*[-\*+]\s+.+(\n|$))+/g,
      (m) =>
        `\n<ul>${m
          .trim()
          .split(/\n/)
          .map((l) => `<li>${l.replace(/^[ \t]*[-\*+]\s+/, '')}</li>`)
          .join('')}</ul>\n`
    );
    text = text.replace(
      /(^|\n)([ \t]*\d+\.\s+.+(\n|$))+/g,
      (m) =>
        `\n<ol>${m
          .trim()
          .split(/\n/)
          .map((l) => `<li>${l.replace(/^[ \t]*\d+\.\s+/, '')}</li>`)
          .join('')}</ol>\n`
    );

    const blocks = text.split(/\n{2,}/).map((b) => b.trim());
    return blocks
      .map((b) => {
        if (/^<h[1-6]>|^<ul>|^<ol>|^<pre>/.test(b)) return b;
        return `<p>${b.replace(/\n/g, '<br>')}</p>`;
      })
      .join('\n');
  }

  function updateClearChatButton() {
    if (!elements.clearChatBtn) return;
    const messageCount =
      elements.chatMessages.querySelectorAll('.message').length;
    if (messageCount > 10) {
      elements.clearChatBtn.classList.remove('hidden');
    } else {
      elements.clearChatBtn.classList.add('hidden');
    }
  }

  function getDefaultEndpoint(provider) {
    if (provider === 'openrouter') {
      return 'https://openrouter.ai/api/v1';
    }
    if (provider === 'openai') {
      return 'http://localhost:1234';
    }
    return '';
  }

  function renderApiKeyStatus(settings = {}) {
    if (!elements.apiKeyStatus) return;
    const hasKey = settings.hasApiKey;
    const encrypted = settings.apiKeyIsEncrypted;
    const locked = settings.requiresPassphrase;
    if (locked) {
      elements.apiKeyStatus.textContent =
        'Key stored encrypted. Enter passphrase to unlock.';
      return;
    }
    if (hasKey && encrypted) {
      elements.apiKeyStatus.textContent = 'Key stored locally (encrypted).';
    } else if (hasKey) {
      elements.apiKeyStatus.textContent = 'Key stored locally (not synced).';
    } else {
      elements.apiKeyStatus.textContent = 'No key stored.';
    }
  }

  function sanitizeInput(str) {
    if (!str || typeof str !== 'string') return '';
    return str.trim().replace(/\s+/g, ' ');
  }

  function addMessage(text, type = 'assistant', options = {}) {
    const { enableCopy = type === 'assistant' } = options;
    if (type === 'system' && !showSystemMessages) {
      return;
    }

    const messageDiv = document.createElement('div');

    let className = 'message';
    if (type === 'user') className += ' user-message';
    else if (type === 'system') className += ' system-message';
    else className += ' assistant-message';

    messageDiv.className = className;

    if (type === 'assistant') {
      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'message-content';
      contentWrapper.innerHTML = renderMarkdown(text);
      messageDiv.appendChild(contentWrapper);

      if (enableCopy) {
        messageDiv.classList.add('has-copy');
        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'copy-btn';
        copyButton.setAttribute('aria-label', 'Copy message');
        copyButton.setAttribute('title', 'Copy message');
        copyButton.innerHTML = `
          <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
            <path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/>
          </svg>
        `;
        messageDiv.appendChild(copyButton);
      }
    } else {
      messageDiv.textContent = text;
    }

    elements.chatMessages.prepend(messageDiv);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;

    updateClearChatButton();
  }

  function updateSuggestions(hasSelection) {
    const suggestions = hasSelection
      ? [
          {
            label: 'Summarize Selection',
            prompt: 'Summarize the selected text in a concise manner.',
          },
          {
            label: 'Explain This',
            prompt: 'Explain the selected text in simple terms.',
          },
          {
            label: 'Key Takeaways',
            prompt: 'List the key points from the selected text.',
          },
          {
            label: 'Rewrite',
            prompt: 'Rewrite the selected text to be more clear and concise.',
          },
          {
            label: 'Critique',
            prompt:
              'Identify any potential biases or logical gaps in the selected text.',
          },
          {
            label: 'Translate...',
            template: 'Translate the selected text into [LANGUAGE].',
          },
        ]
      : [
          {
            label: 'Summarize',
            prompt:
              'Summarize the key takeaways of this page in a concise manner.',
          },
          {
            label: 'Key Points',
            prompt: 'List the main arguments or facts as bullet points.',
          },
          {
            label: 'Simplify',
            prompt: "Explain the content in simple terms like I'm a beginner.",
          },
          {
            label: 'Critique',
            prompt:
              'Identify any potential biases, logical gaps, or missing perspectives in this content.',
          },
          {
            label: 'Action Items',
            prompt:
              'Extract actionable steps or practical advice from this text.',
          },
          {
            label: 'Quiz Me',
            prompt:
              'Create a short multiple-choice quiz to test my understanding of this content.',
          },
          {
            label: 'Social Post',
            prompt:
              'Draft a short social media post (like for Twitter/LinkedIn) summarizing the interesting parts of this page.',
          },
          {
            label: 'Translate...',
            template: 'Translate this page into [LANGUAGE].',
          },
        ];

    elements.suggestionsContainer.innerHTML = '';
    suggestions.forEach((s) => {
      const btn = document.createElement('button');
      btn.className = 'suggestion-btn';
      if (s.template) {
        btn.setAttribute('data-template', s.template);
        btn.classList.add('dynamic-btn');
      } else {
        btn.setAttribute('data-prompt', s.prompt);
      }
      btn.textContent = s.label;
      elements.suggestionsContainer.appendChild(btn);
    });
  }

  async function refreshContext() {
    try {
      const tab = await getCurrentTab();
      const response = await browser.tabs.sendMessage(tab.id, {
        action: 'getPageContext',
      });

      if (response && response.context) {
        displayContext(response.context);

        const hasSelection =
          response.context.selection &&
          response.context.selection.trim().length > 0;
        updateSuggestions(hasSelection);

        addMessage(`Context refreshed: ${response.context.title}`, 'system');
        return response.context;
      } else {
        addMessage('Error: Could not get context', 'system');
        return null;
      }
    } catch (error) {
      console.error('Error refreshing context:', error);
      if (
        error.message &&
        error.message.includes('Receiving end does not exist')
      ) {
        addMessage(
          'Connection error: Please refresh the web page and try again.',
          'system'
        );
      } else {
        addMessage('Error: Could not get context', 'system');
      }
      return null;
    }
  }

  function displayContext(context) {
    if (!context) return;
    const contextText = [
      `<strong>Title:</strong> ${escapeHtml(context.title)}`,
      `<strong>Domain:</strong> ${escapeHtml(context.domain)}`,
      `<strong>Selection:</strong> ${
        context.selection && context.selection.trim().length > 0
          ? 'Active (' + context.selection.trim().length + ' chars)'
          : 'None'
      }`,
      `<strong>Content Length:</strong> ${
        context.readability?.wordCount || 0
      } words`,
      `<strong>Headings:</strong> ${context.headings?.length || 0} sections`,
      `<strong>Links:</strong> ${context.links?.length || 0} available`,
    ].join('\n');
    elements.contextDisplay.innerHTML = contextText;
  }

  async function queryLLM(prompt) {
    try {
      setLoadingState(true);
      const tab = await getCurrentTab();
      const response = await browser.runtime.sendMessage({
        action: 'queryLLM',
        tabId: tab.id,
        prompt: prompt,
      });

      setLoadingState(false);

      if (response.success) {
        addMessage(response.result, 'assistant');
        return response.result;
      } else {
        addMessage(`Error: ${response.error}`, 'system');
        return null;
      }
    } catch (error) {
      console.error('LLM query failed:', error);
      setLoadingState(false);
      addMessage(`Error: ${error.message}`, 'system');
      return null;
    }
  }

  function setLoadingState(isLoading) {
    elements.sendButton.disabled = isLoading;

    const suggestionButtons =
      elements.suggestionsContainer.querySelectorAll('.suggestion-btn');
    suggestionButtons.forEach((btn) => (btn.disabled = isLoading));

    let bubble = document.getElementById('typing-bubble');
    if (isLoading) {
      if (!bubble) {
        bubble = document.createElement('div');
        bubble.id = 'typing-bubble';
        bubble.className = 'typing-indicator';
        bubble.innerHTML = `
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        `;
        elements.chatMessages.prepend(bubble);
        elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
      }
    } else {
      if (bubble) {
        bubble.remove();
      }
    }
  }

  function updateModelFiltersUI(provider, models) {
    if (provider !== 'openrouter') {
      elements.openrouterFilters.classList.add('hidden');
      return;
    }

    elements.openrouterFilters.classList.remove('hidden');

    // Extract variants from models
    const variants = new Set(['free', 'thinking']);
    models.forEach((m) => {
      const parts = m.split(':');
      if (parts.length > 1) {
        variants.add(parts[parts.length - 1]);
      }
    });

    // Render variant checkboxes
    elements.variantFilters.innerHTML = '';
    const sortedVariants = Array.from(variants).sort();
    sortedVariants.forEach((variant) => {
      const label = document.createElement('label');
      label.className = 'variant-filter-label';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = variant;
      checkbox.checked = selectedVariantSuffixes.has(variant);
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          selectedVariantSuffixes.add(variant);
        } else {
          selectedVariantSuffixes.delete(variant);
        }
        filterAndPopulateModels();
      });
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(`:${variant}`));
      elements.variantFilters.appendChild(label);
    });
  }

  function filterAndPopulateModels() {
    if (!elements.modelSelect) return;

    let filtered = currentModels;
    const provider = elements.providerSelect?.value || 'openai';

    if (provider === 'openrouter') {
      if (openrouterSearchText) {
        const lowerSearch = openrouterSearchText.toLowerCase();
        filtered = filtered.filter((m) =>
          m.toLowerCase().includes(lowerSearch)
        );
      }

      if (selectedVariantSuffixes.size > 0) {
        filtered = filtered.filter((m) => {
          const parts = m.split(':');
          if (parts.length < 2) return false;
          return selectedVariantSuffixes.has(parts[parts.length - 1]);
        });
      }
    }

    // Preserve selection if possible
    const previousSelection = elements.modelSelect.value;

    elements.modelSelect.innerHTML = '';
    filtered.forEach((model) => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      elements.modelSelect.appendChild(option);
    });

    if (elements.modelCount) {
      elements.modelCount.textContent = `${filtered.length} of ${currentModels.length}`;
    }

    if (filtered.includes(previousSelection)) {
      elements.modelSelect.value = previousSelection;
    } else if (filtered.length > 0) {
      elements.modelSelect.value = filtered[0];
      // Only auto-save if user is actively interacting or it's a critical fallback
      // Ideally we don't auto-save on every keystroke filter, but we need
      // the selection to be valid for the next chat.
      // Let's just update the UI value; actual save happens on 'change' event or next chat.
      // But 'change' event isn't fired programmatically.
      // So let's silently update settings to keep in sync.
      updateSettings({ model: filtered[0] }).catch(() => {});
    }
  }

  function populateModelSelect(models, selected) {
    currentModels = models || [];
    // Just save selection for filter logic to use
    // Initial population happens via filter logic

    // Check provider to init UI
    const provider = elements.providerSelect?.value || 'openai';
    updateModelFiltersUI(provider, currentModels);

    // Set initial search/filter state from nothing?
    // Or just clear them? Let's keep them if they exist in memory (page session)

    // Force initial render
    // Temporarily set value to 'selected' so filter logic can try to keep it
    if (elements.modelSelect) elements.modelSelect.value = selected;

    filterAndPopulateModels();

    if (elements.modelSelect && elements.modelSelect.value !== selected && currentModels.includes(selected)) {
        // If filter hid the selected model, but it's in the full list, what do?
        // OpenRouter filters are strict. If you filter for 'free' and selected was 'paid', it's gone.
        // So standard behavior is fine.
    }
  }

  async function updateSettings(newSettings) {
    const resp = await browser.runtime.sendMessage({
      action: 'setLLMSettings',
      settings: newSettings,
    });
    if (!resp?.success) {
      throw new Error(resp?.error || 'Failed to save settings');
    }
  }

  async function updateSettingsWithPassphrase(newSettings, passphrase, options) {
    const resp = await browser.runtime.sendMessage({
      action: 'setLLMSettings',
      settings: newSettings,
      passphrase: passphrase || undefined,
      encryptApiKey: options?.encryptApiKey || false,
      clearApiKey: options?.clearApiKey || false,
    });
    if (!resp?.success) {
      throw new Error(resp?.error || 'Failed to save settings');
    }
  }

  async function getSettings() {
    const resp = await browser.runtime.sendMessage({
      action: 'getLLMSettings',
    });
    return resp.settings;
  }

  function setSystemMessagesVisibility(visible) {
    if (elements.systemMsgSwitch) {
      elements.systemMsgSwitch.checked = visible;
    }
    showSystemMessages = visible;
    if (visible) {
      elements.chatMessages.classList.remove('hide-system-messages');
    } else {
      elements.chatMessages.classList.add('hide-system-messages');
    }
    browser.storage.local.set({ showSystemMessages: visible });
  }

  function setContextSectionVisibility(visible) {
    showPageContext = visible;
    if (elements.contextSwitch) {
      elements.contextSwitch.checked = visible;
    }
    if (elements.contextSection) {
      if (visible) {
        elements.contextSection.classList.remove('force-hidden');
      } else {
        elements.contextSection.classList.add('force-hidden');
      }
    }
    if (elements.toggleContextButton) {
      elements.toggleContextButton.disabled = !visible;
    }
    if (elements.refreshButton) {
      elements.refreshButton.disabled = !visible;
    }
    browser.storage.local.set({ showPageContext: visible });
  }

  browser.storage.local
    .get(['showSystemMessages', 'showPageContext'])
    .then((result) => {
      const sysVisible =
        result.showSystemMessages !== undefined
          ? result.showSystemMessages
          : false;
      const contextVisible =
        result.showPageContext !== undefined ? result.showPageContext : true;
      setSystemMessagesVisibility(sysVisible);
      setContextSectionVisibility(contextVisible);
    });

  if (elements.systemMsgSwitch) {
    elements.systemMsgSwitch.addEventListener('change', (e) => {
      setSystemMessagesVisibility(e.target.checked);
    });
  }

  if (elements.contextSwitch) {
    elements.contextSwitch.addEventListener('change', (e) => {
      setContextSectionVisibility(e.target.checked);
    });
  }

  if (elements.clearChatBtn) {
    elements.clearChatBtn.addEventListener('click', () => {
      elements.chatMessages.innerHTML = '';
      const initialGreeting =
        'Hello! I can help you analyze this page using your local LLM. Try one of the suggestions below or type your own question.';
      addMessage(initialGreeting, 'assistant', { enableCopy: false });
    });
  }

  elements.chatMessages.addEventListener('click', async (event) => {
    const copyButton = event.target.closest('.copy-btn');
    if (!copyButton) {
      return;
    }
    const messageElement = copyButton.closest('.assistant-message');
    if (!messageElement) {
      return;
    }
    const contentElement = messageElement.querySelector('.message-content');
    if (!contentElement) {
      return;
    }
    const textToCopy = contentElement.textContent.trim();
    if (!textToCopy) {
      return;
    }
    const originalTitle = copyButton.getAttribute('title') || 'Copy message';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else if (
        typeof browser !== 'undefined' &&
        browser.clipboard &&
        browser.clipboard.writeText
      ) {
        await browser.clipboard.writeText(textToCopy);
      } else {
        throw new Error('Clipboard API unavailable');
      }
      copyButton.classList.add('copied');
      copyButton.setAttribute('title', 'Copied!');
    } catch (error) {
      console.error('Copy failed:', error);
      copyButton.classList.add('copied');
      copyButton.setAttribute('title', 'Copy failed');
    }
    copyButton.disabled = true;
    setTimeout(() => {
      copyButton.classList.remove('copied');
      copyButton.setAttribute('title', originalTitle);
      copyButton.disabled = false;
    }, 1500);
  });

  elements.sendButton.addEventListener('click', async () => {
    const prompt = elements.promptInput.value.trim();
    if (!prompt) return;

    addMessage(prompt, 'user');
    elements.promptInput.value = '';
    await queryLLM(prompt);
  });

  elements.promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      elements.sendButton.click();
    }
  });

  elements.suggestionsContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('suggestion-btn')) {
      const template = e.target.getAttribute('data-template');
      if (template) {
        elements.promptInput.value = template;
        elements.promptInput.focus();

        const bracketIndex = template.indexOf('[');
        if (bracketIndex !== -1) {
          elements.promptInput.setSelectionRange(
            bracketIndex,
            template.indexOf(']') + 1
          );
        }
      } else {
        elements.promptInput.value = e.target.getAttribute('data-prompt');
        elements.promptInput.focus();
        elements.sendButton.click();
      }
    }
  });

  if (elements.modelSearch) {
    elements.modelSearch.addEventListener('input', (e) => {
      openrouterSearchText = e.target.value.trim();
      filterAndPopulateModels();
    });
  }

  elements.modelSelect.addEventListener('change', async () => {
    try {
      await updateSettings({ model: elements.modelSelect.value });
    } catch (error) {
      addMessage(`Error saving model: ${error.message}`, 'system');
    }
  });

  if (elements.providerSelect) {
    elements.providerSelect.addEventListener('change', async () => {
      const provider = elements.providerSelect.value;
      const settings = await getSettings();

      // Determine target endpoint
      let updatedEndpoint = '';
      if (provider === 'openrouter') {
        updatedEndpoint = 'https://openrouter.ai/api/v1';
      } else {
        // Use stored endpoint for this provider or default
        updatedEndpoint = settings.endpoints?.[provider] || getDefaultEndpoint(provider);
      }

      if (elements.endpointInput) {
        elements.endpointInput.value = updatedEndpoint;
      }

      // Reset filters when switching to OpenRouter
      if (provider === 'openrouter') {
        openrouterSearchText = '';
        if (elements.modelSearch) elements.modelSearch.value = '';
      }

      updateModelFiltersUI(provider, currentModels);
      filterAndPopulateModels();

      try {
        await updateSettings({
          provider,
          service: provider,
          endpoint: updatedEndpoint,
        });
      } catch (error) {
        addMessage(`Error saving provider: ${error.message}`, 'system');
      }
    });
  }

  if (elements.endpointInput) {
    elements.endpointInput.addEventListener('change', async () => {
      const newEndpoint = elements.endpointInput.value.trim();
      if (!newEndpoint) return;

      try {
        await updateSettings({ endpoint: newEndpoint });
        elements.detectModelsButton.click();
      } catch (error) {
        addMessage(`Error saving endpoint: ${error.message}`, 'system');
      }
    });
  }

  if (elements.refererInput) {
    elements.refererInput.addEventListener('change', async () => {
      const val = sanitizeInput(elements.refererInput.value);
      try {
        await updateSettings({ referer: val });
      } catch (error) {
        addMessage(`Error saving referer: ${error.message}`, 'system');
      }
    });
  }

  if (elements.titleInput) {
    elements.titleInput.addEventListener('change', async () => {
      const val = sanitizeInput(elements.titleInput.value);
      try {
        await updateSettings({ title: val });
      } catch (error) {
        addMessage(`Error saving title: ${error.message}`, 'system');
      }
    });
  }

  async function saveApiKey() {
    const apiKey = sanitizeInput(elements.apiKeyInput?.value || '');
    const passphrase = sanitizeInput(elements.passphraseInput?.value || '');

    if (!apiKey && !passphrase) {
      renderApiKeyStatus({ hasApiKey: false });
      return;
    }

    try {
      await updateSettingsWithPassphrase(
        apiKey ? { apiKey } : {},
        passphrase,
        {
        encryptApiKey: Boolean(passphrase && apiKey),
        }
      );
      if (elements.apiKeyInput) elements.apiKeyInput.value = '';
      if (elements.passphraseInput) elements.passphraseInput.value = '';
      const updated = await getSettings();
      renderApiKeyStatus(updated);
      addMessage(
        passphrase && apiKey
          ? 'API key saved with encryption.'
          : apiKey
            ? 'API key saved locally.'
            : 'Passphrase applied. If a key was stored encrypted, it is now unlocked.',
        'system'
      );
    } catch (error) {
      addMessage(`Error saving key: ${error.message}`, 'system');
    }
  }

  async function forgetApiKey() {
    try {
      await updateSettingsWithPassphrase({}, null, { clearApiKey: true });
      if (elements.apiKeyInput) elements.apiKeyInput.value = '';
      if (elements.passphraseInput) elements.passphraseInput.value = '';
      renderApiKeyStatus({ hasApiKey: false });
      addMessage('API key cleared from local storage.', 'system');
    } catch (error) {
      addMessage(`Error clearing key: ${error.message}`, 'system');
    }
  }

  if (elements.saveApiKeyBtn) {
    elements.saveApiKeyBtn.addEventListener('click', saveApiKey);
  }

  if (elements.forgetApiKeyBtn) {
    elements.forgetApiKeyBtn.addEventListener('click', forgetApiKey);
  }

  if (elements.timeoutInput) {
    elements.timeoutInput.addEventListener('change', async () => {
      const val = parseInt(elements.timeoutInput.value, 10);
      const ms = val && val > 0 ? val * 1000 : 300000;

    try {
      await updateSettings({ timeout: ms });
    } catch (error) {
      addMessage(`Error saving timeout: ${error.message}`, 'system');
      }
    });
  }

  async function detectModelsAndUpdateUI() {
    try {
      if (modelInfoTimeout) clearTimeout(modelInfoTimeout);
      if (elements.modelInfo) {
        elements.modelInfo.textContent = 'Detecting models...';
      }

      const response = await browser.runtime.sendMessage({
        action: 'detectModels',
      });

      if (response.success) {
        const models = response.models;
        if (elements.modelInfo) {
          elements.modelInfo.textContent = models.length
            ? `Detected models: ${models.join(', ')}`
            : 'No model found';
        }

        const settings = await getSettings();
        const selected = settings.model || (models[0] ?? '');
        populateModelSelect(models, selected);
      renderApiKeyStatus(settings);
      const provider = settings.provider || settings.service || 'openai';
      const keyStatus = settings.requiresPassphrase
        ? 'locked (passphrase needed)'
        : settings.hasApiKey
          ? settings.apiKeyIsEncrypted
            ? 'set (encrypted)'
            : 'set'
          : 'missing';
      elements.debugText.textContent = `Provider: ${provider}\nEndpoint: ${settings.endpoint}\nModel: ${settings.model}\nKey: ${keyStatus}`;
      } else {
        if (elements.modelInfo) {
          elements.modelInfo.textContent = `Error: ${response.error}`;
        }
        addMessage(`Model detection failed: ${response.error}`, 'system');
      }
    } catch (error) {
      console.error('Model detection failed:', error);
      if (elements.modelInfo) {
        elements.modelInfo.textContent = `Error: ${error.message}`;
      }
    } finally {
      modelInfoTimeout = setTimeout(() => {
        if (elements.modelInfo) {
          elements.modelInfo.textContent = '';
        }
        modelInfoTimeout = null;
      }, 5000);
    }
  }

  elements.detectModelsButton.addEventListener('click', detectModelsAndUpdateUI);

  if (elements.refreshModelsBtn) {
    elements.refreshModelsBtn.addEventListener('click', detectModelsAndUpdateUI);
  }

  if (elements.refreshButton) {
    elements.refreshButton.addEventListener('click', async () => {
      if (!showPageContext) return;
      elements.refreshButton.disabled = true;
      await refreshContext();
      setTimeout(() => {
        elements.refreshButton.disabled = !showPageContext;
      }, 500);
    });
  }

  function toggleSection(button, section) {
    if (!button || !section) return;
    if (!showPageContext && section === elements.contextSection) {
      return;
    }
    section.classList.toggle('hidden');
    const isHidden = section.classList.contains('hidden');
    button.classList.toggle('expanded', !isHidden);
  }

  if (elements.toggleContextButton) {
    elements.toggleContextButton.addEventListener('click', () =>
      toggleSection(elements.toggleContextButton, elements.contextSection)
    );
  }

  if (elements.toggleDebugButton) {
    elements.toggleDebugButton.addEventListener('click', () => {
      toggleSection(elements.toggleDebugButton, elements.debugSection);
    });
  }

  elements.promptInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
  });

  try {
    browser.tabs.onActivated.addListener(refreshContext);
    browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo && changeInfo.status === 'complete') refreshContext();
    });
  } catch (e) {
    console.warn('Could not attach tab listeners in sidebar:', e);
  }

  getSettings().then((settings) => {
    if (settings) {
      const provider =
        settings.provider || settings.service || 'openai';
      if (elements.providerSelect) {
        elements.providerSelect.value = provider;
      }
      if (settings.models) populateModelSelect(settings.models, settings.model);
      if (elements.endpointInput && settings.endpoint)
        elements.endpointInput.value = settings.endpoint;
      else if (elements.endpointInput)
        elements.endpointInput.value = getDefaultEndpoint(provider);
      if (elements.timeoutInput) {
        const ms = settings.timeout || 300000;
        elements.timeoutInput.value = Math.floor(ms / 1000);
      }
      if (elements.refererInput && settings.referer)
        elements.refererInput.value = settings.referer;
      if (elements.titleInput && settings.title) {
        elements.titleInput.value = settings.title;
      }
      renderApiKeyStatus(settings);

      const keyStatus = settings.requiresPassphrase
        ? 'locked (passphrase needed)'
        : settings.hasApiKey
          ? settings.apiKeyIsEncrypted
            ? 'set (encrypted)'
            : 'set'
          : 'missing';

      elements.debugText.textContent = `Provider: ${provider}\nEndpoint: ${settings.endpoint}\nModel: ${settings.model}\nKey: ${keyStatus}`;
    }
  });

  if (elements.debugSection) {
    elements.debugSection.classList.add('hidden');
    if (elements.toggleDebugButton)
      elements.toggleDebugButton.classList.remove('expanded');
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message.action === 'selectionChanged') {
      refreshContext();
    }
  });

  refreshContext();

  let isResizing = false;
  let startX, startWidth;

  elements.resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = parseInt(
      window.getComputedStyle(elements.sidebarContainer).width,
      10
    );
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const newWidth = startWidth + (e.clientX - startX);
    if (newWidth >= 300 && newWidth <= 600) {
      elements.sidebarContainer.style.width = `${newWidth}px`;
      document.documentElement.style.setProperty(
        '--sidebar-width',
        `${newWidth}px`
      );
    }
  });

  document.addEventListener('mouseup', () => {
    isResizing = false;
    document.body.style.cursor = 'default';
  });

  function updateSidebarWidth() {
    const width =
      window.innerWidth < 768
        ? '100%'
        : Math.min(400, Math.min(600, window.innerWidth * 0.7)) + 'px';
    elements.sidebarContainer.style.width = width;
    document.documentElement.style.setProperty('--sidebar-width', width);
  }

  window.addEventListener('resize', () => {
    if (parseInt(elements.sidebarContainer.style.width) > 600) {
      elements.sidebarContainer.style.width = '600px';
      document.documentElement.style.setProperty('--sidebar-width', '600px');
    }
    updateSidebarWidth();
  });

  updateSidebarWidth();

  updateClearChatButton();
});
