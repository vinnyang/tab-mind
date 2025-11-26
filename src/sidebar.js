document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
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
    resizeHandle: document.getElementById('resize-handle'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    closeSettingsBtn: document.getElementById('close-settings'),
    themeSwitch: document.getElementById('theme-switch'),
    systemMsgSwitch: document.getElementById('system-msg-switch'),
    contextSwitch: document.getElementById('context-switch')
  };

  let modelInfoTimeout = null;
  let showSystemMessages = true;
  let showPageContext = true;

  // --- Theme Logic ---
  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (elements.themeSwitch) {
        // Checkbox checked = Dark (On side), Unchecked = Light (Off side)
        // If theme is dark, check it. If light, uncheck it.
        elements.themeSwitch.checked = (theme === 'dark');
    }
    // Save theme preference
    browser.storage.local.set({ theme });
  }

  // Load theme
  browser.storage.local.get(['theme']).then((result) => {
    setTheme(result.theme || 'dark');
  });

  if (elements.themeSwitch) {
      elements.themeSwitch.addEventListener('change', (e) => {
          const newTheme = e.target.checked ? 'dark' : 'light';
          setTheme(newTheme);
      });
  }

  // --- Modal Logic ---
  elements.settingsBtn.addEventListener('click', () => {
    elements.settingsModal.classList.remove('hidden');
  });

  elements.closeSettingsBtn.addEventListener('click', () => {
    elements.settingsModal.classList.add('hidden');
  });

  // Close on click outside
  elements.settingsModal.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) {
      elements.settingsModal.classList.add('hidden');
    }
  });

  // --- Core Logic ---

  async function getCurrentTab() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
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

    // Code blocks
    text = text.replace(
      /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g,
      (m, lang, code) => `<pre><code>${code.replace(/</g, '&lt;')}</code></pre>`
    );

    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headings
    text = text.replace(/^######\s*(.*)$/gm, '<h6>$1</h6>')
               .replace(/^#####\s*(.*)$/gm, '<h5>$1</h5>')
               .replace(/^####\s*(.*)$/gm, '<h4>$1</h4>')
               .replace(/^###\s*(.*)$/gm, '<h3>$1</h3>')
               .replace(/^##\s*(.*)$/gm, '<h2>$1</h2>')
               .replace(/^#\s*(.*)$/gm, '<h1>$1</h1>');

    // Formatting
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
               .replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Links
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, url) =>
      `<a href="${url.replace(/"/g, '%22')}" target="_blank" rel="noopener noreferrer">${label}</a>`
    );

    // Lists
    text = text.replace(/(^|\n)([ \t]*[-\*+]\s+.+(\n|$))+/g, m =>
      `\n<ul>${m.trim().split(/\n/).map(l => `<li>${l.replace(/^[ \t]*[-\*+]\s+/, '')}</li>`).join('')}</ul>\n`
    );
    text = text.replace(/(^|\n)([ \t]*\d+\.\s+.+(\n|$))+/g, m =>
      `\n<ol>${m.trim().split(/\n/).map(l => `<li>${l.replace(/^[ \t]*\d+\.\s+/, '')}</li>`).join('')}</ol>\n`
    );

    // Paragraphs
    const blocks = text.split(/\n{2,}/).map(b => b.trim());
    return blocks.map(b => {
      if (/^<h[1-6]>|^<ul>|^<ol>|^<pre>/.test(b)) return b;
      return `<p>${b.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');
  }

  function updateClearChatButton() {
    if (!elements.clearChatBtn) return;
    // Count total messages (including system/user/assistant)
    const messageCount = elements.chatMessages.querySelectorAll('.message').length;
    if (messageCount > 10) {
      elements.clearChatBtn.classList.remove('hidden');
    } else {
      elements.clearChatBtn.classList.add('hidden');
    }
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

  // --- Suggestions Logic ---
  function updateSuggestions(hasSelection) {
    const suggestions = hasSelection
      ? [
          { label: 'Summarize Selection', prompt: 'Summarize the selected text in a concise manner.' },
          { label: 'Explain This', prompt: 'Explain the selected text in simple terms.' },
          { label: 'Key Takeaways', prompt: 'List the key points from the selected text.' },
          { label: 'Rewrite', prompt: 'Rewrite the selected text to be more clear and concise.' },
          { label: 'Critique', prompt: 'Identify any potential biases or logical gaps in the selected text.' },
          { label: 'Translate...', template: 'Translate the selected text into [LANGUAGE].' }
        ]
      : [
          { label: 'Summarize', prompt: 'Summarize the key takeaways of this page in a concise manner.' },
          { label: 'Key Points', prompt: 'List the main arguments or facts as bullet points.' },
          { label: 'Simplify', prompt: 'Explain the content in simple terms like I\'m a beginner.' },
          { label: 'Critique', prompt: 'Identify any potential biases, logical gaps, or missing perspectives in this content.' },
          { label: 'Action Items', prompt: 'Extract actionable steps or practical advice from this text.' },
          { label: 'Quiz Me', prompt: 'Create a short multiple-choice quiz to test my understanding of this content.' },
          { label: 'Social Post', prompt: 'Draft a short social media post (like for Twitter/LinkedIn) summarizing the interesting parts of this page.' },
          { label: 'Translate...', template: 'Translate this page into [LANGUAGE].' }
        ];

    elements.suggestionsContainer.innerHTML = '';
    suggestions.forEach(s => {
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
      const response = await browser.tabs.sendMessage(tab.id, { action: 'getPageContext' });

      if (response && response.context) {
        displayContext(response.context);

        // Update suggestions based on selection state
        const hasSelection = response.context.selection && response.context.selection.trim().length > 0;
        updateSuggestions(hasSelection);

        addMessage(`Context refreshed: ${response.context.title}`, 'system');
        return response.context;
      } else {
        addMessage('Error: Could not get context', 'system');
        return null;
      }
    } catch (error) {
      console.error('Error refreshing context:', error);
      if (error.message && error.message.includes('Receiving end does not exist')) {
        addMessage('Connection error: Please refresh the web page and try again.', 'system');
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
      `<strong>Selection:</strong> ${context.selection && context.selection.trim().length > 0 ? 'Active (' + context.selection.trim().length + ' chars)' : 'None'}`,
      `<strong>Content Length:</strong> ${context.readability?.wordCount || 0} words`,
      `<strong>Headings:</strong> ${context.headings?.length || 0} sections`,
      `<strong>Links:</strong> ${context.links?.length || 0} available`
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

    const suggestionButtons = elements.suggestionsContainer.querySelectorAll('.suggestion-btn');
    suggestionButtons.forEach(btn => btn.disabled = isLoading);

    // Manage typing bubble
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

  function populateModelSelect(models, selected) {
    elements.modelSelect.innerHTML = '';
    models.forEach((model) => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      if (model === selected) option.selected = true;
      elements.modelSelect.appendChild(option);
    });
  }

  async function updateSettings(newSettings) {
    await browser.runtime.sendMessage({ action: 'setLLMSettings', settings: newSettings });
  }

  async function getSettings() {
    const resp = await browser.runtime.sendMessage({ action: 'getLLMSettings' });
    return resp.settings;
  }

  // --- System Messages Logic ---
  function setSystemMessagesVisibility(visible) {
    if (elements.systemMsgSwitch) {
      elements.systemMsgSwitch.checked = visible;
    }
    // Toggle class on container to hide/show system messages via CSS
    showSystemMessages = visible;
    if (visible) {
      elements.chatMessages.classList.remove('hide-system-messages');
    } else {
      elements.chatMessages.classList.add('hide-system-messages');
    }
    // Save preference
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

  // Load stored preferences
  browser.storage.local.get(['showSystemMessages', 'showPageContext']).then((result) => {
    const sysVisible = result.showSystemMessages !== undefined ? result.showSystemMessages : true;
    const contextVisible = result.showPageContext !== undefined ? result.showPageContext : true;
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

  // --- Event Listeners ---

  if (elements.clearChatBtn) {
    elements.clearChatBtn.addEventListener('click', () => {
      elements.chatMessages.innerHTML = '';
      const initialGreeting = 'Hello! I can help you analyze this page using your local LLM. Try one of the suggestions below or type your own question.';
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
      } else if (typeof browser !== 'undefined' && browser.clipboard && browser.clipboard.writeText) {
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
        // For dynamic templates (like translate), populate input and focus for user to complete
        elements.promptInput.value = template;
        elements.promptInput.focus();

        // Highlight the placeholder if possible
        const bracketIndex = template.indexOf('[');
        if (bracketIndex !== -1) {
            elements.promptInput.setSelectionRange(bracketIndex, template.indexOf(']') + 1);
        }
      } else {
        // For standard prompts, send immediately
        elements.promptInput.value = e.target.getAttribute('data-prompt');
        elements.promptInput.focus();
        elements.sendButton.click();
      }
    }
  });

  elements.modelSelect.addEventListener('change', async () => {
    const settings = await getSettings();
    if (settings) {
      await updateSettings({ ...settings, model: elements.modelSelect.value });
    }
  });

  if (elements.endpointInput) {
    elements.endpointInput.addEventListener('change', async () => {
      const newEndpoint = elements.endpointInput.value.trim();
      if (!newEndpoint) return;

      const settings = await getSettings();
      if (settings) {
        await updateSettings({ ...settings, endpoint: newEndpoint });
        elements.detectModelsButton.click();
      }
    });
  }

  if (elements.timeoutInput) {
    elements.timeoutInput.addEventListener('change', async () => {
      const val = parseInt(elements.timeoutInput.value, 10);
      // Convert seconds to ms
      const ms = (val && val > 0) ? val * 1000 : 300000;

      const settings = await getSettings();
      if (settings) {
        await updateSettings({ ...settings, timeout: ms });
      }
    });
  }

  elements.detectModelsButton.addEventListener('click', async () => {
    try {
      if (modelInfoTimeout) clearTimeout(modelInfoTimeout);
      elements.modelInfo.textContent = 'Detecting models...';

      const response = await browser.runtime.sendMessage({ action: 'detectModels' });

      if (response.success) {
        const models = response.models;
        elements.modelInfo.textContent = models.length ? `Detected models: ${models.join(', ')}` : 'No model found';

        const settings = await getSettings();
        const selected = settings.model || (models[0] ?? '');
        populateModelSelect(models, selected);
      } else {
        elements.modelInfo.textContent = `Error: ${response.error}`;
      }
    } catch (error) {
      console.error('Model detection failed:', error);
      elements.modelInfo.textContent = `Error: ${error.message}`;
    } finally {
      modelInfoTimeout = setTimeout(() => {
        elements.modelInfo.textContent = '';
        modelInfoTimeout = null;
      }, 5000);
    }
  });

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

  // Auto-resize textarea
  elements.promptInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
  });

  // --- Initialization ---

  // Tab listeners
  try {
    browser.tabs.onActivated.addListener(refreshContext);
    browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo && changeInfo.status === 'complete') refreshContext();
    });
  } catch (e) {
    console.warn('Could not attach tab listeners in sidebar:', e);
  }

  // Initial settings load
  getSettings().then((settings) => {
    if (settings) {
      if (settings.models) populateModelSelect(settings.models, settings.model);
      if (elements.endpointInput && settings.endpoint) elements.endpointInput.value = settings.endpoint;
      if (elements.timeoutInput) {
         // Default to 300s if not set, convert ms to seconds for display
         const ms = settings.timeout || 300000;
         elements.timeoutInput.value = Math.floor(ms / 1000);
      }

      // Show debug info
      elements.debugText.textContent = `Service: ${settings.service}\nEndpoint: ${settings.endpoint}\nModel: ${settings.model}`;
    }
  });

  // Default visibility states
  if (elements.debugSection) {
    elements.debugSection.classList.add('hidden');
    if (elements.toggleDebugButton) elements.toggleDebugButton.classList.remove('expanded');
  }

  // Listen for selection updates from content script
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === 'selectionChanged') {
      // Update the context display to reflect selection change
      // We need to get the full context again to have consistent state,
      // or we can just hack the display. Ideally, we refresh context cleanly.
      // But doing a full refresh might be expensive if it re-parses the whole page.
      // Let's just update the specific UI element if possible, but displayContext
      // rebuilds the whole HTML.

      // A full refresh is safest to keep internal state consistent
      // refreshContext();

      // optimization: if we already have a context displayed, just update the selection field
      // But we don't store the current context object globally except in displayContext.
      // Let's just call refreshContext for now as it's robust.
      refreshContext();
    }
  });

  // Initial context refresh
  refreshContext();

  // Resizing Logic
  let isResizing = false;
  let startX, startWidth;

  elements.resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = parseInt(window.getComputedStyle(elements.sidebarContainer).width, 10);
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const newWidth = startWidth + (e.clientX - startX);
    if (newWidth >= 300 && newWidth <= 600) {
      elements.sidebarContainer.style.width = `${newWidth}px`;
      document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
    }
  });

  document.addEventListener('mouseup', () => {
    isResizing = false;
    document.body.style.cursor = 'default';
  });

  function updateSidebarWidth() {
    const width = window.innerWidth < 768 ? '100%' : Math.min(400, Math.min(600, window.innerWidth * 0.7)) + 'px';
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

  // Initial check
  updateClearChatButton();
});
