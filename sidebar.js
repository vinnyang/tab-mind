document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const elements = {
    sendButton: document.getElementById('send-button'),
    promptInput: document.getElementById('prompt-input'),
    chatMessages: document.getElementById('chat-messages'),
    contextDisplay: document.getElementById('context-display'),
    // Removed loadingIndicator reference, logic moved to setLoadingState
    suggestionsContainer: document.getElementById('suggestions'),
    debugInfo: document.getElementById('debug-info'),
    debugText: document.getElementById('debug-text'),
    detectModelsButton: document.getElementById('detect-models'),
    modelInfo: document.getElementById('model-info'),
    sidebarContainer: document.getElementById('sidebar-container'),
    modelSelect: document.getElementById('model-select'),
    endpointInput: document.getElementById('endpoint-input'),
    refreshButton: document.getElementById('refresh-button'),
    toggleContextButton: document.getElementById('toggle-context'),
    contextSection: document.querySelector('.context-section'),
    toggleDebugButton: document.getElementById('toggle-debug'),
    debugSection: document.querySelector('.debug-section'),
    resizeHandle: document.getElementById('resize-handle'),
  };

  let modelInfoTimeout = null;

  // --- Core Logic ---

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

    // Code blocks
    text = text.replace(
      /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g,
      (m, lang, code) => `<pre><code>${code.replace(/</g, '&lt;')}</code></pre>`
    );

    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headings
    text = text
      .replace(/^######\s*(.*)$/gm, '<h6>$1</h6>')
      .replace(/^#####\s*(.*)$/gm, '<h5>$1</h5>')
      .replace(/^####\s*(.*)$/gm, '<h4>$1</h4>')
      .replace(/^###\s*(.*)$/gm, '<h3>$1</h3>')
      .replace(/^##\s*(.*)$/gm, '<h2>$1</h2>')
      .replace(/^#\s*(.*)$/gm, '<h1>$1</h1>');

    // Formatting
    text = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Links
    text = text.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (m, label, url) =>
        `<a href="${url.replace(
          /"/g,
          '%22'
        )}" target="_blank" rel="noopener noreferrer">${label}</a>`
    );

    // Lists
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

    // Paragraphs
    const blocks = text.split(/\n{2,}/).map((b) => b.trim());
    return blocks
      .map((b) => {
        if (/^<h[1-6]>|^<ul>|^<ol>|^<pre>/.test(b)) return b;
        return `<p>${b.replace(/\n/g, '<br>')}</p>`;
      })
      .join('\n');
  }

  function addMessage(text, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${
      isUser ? 'user-message' : 'assistant-message'
    }`;

    if (isUser) {
      messageDiv.textContent = text;
    } else {
      messageDiv.innerHTML = renderMarkdown(text);
    }

    elements.chatMessages.appendChild(messageDiv);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  }

  async function refreshContext() {
    try {
      elements.chatMessages.innerHTML = '';
      const tab = await getCurrentTab();
      const response = await browser.tabs.sendMessage(tab.id, {
        action: 'getPageContext',
      });

      if (response && response.context) {
        displayContext(response.context);
        addMessage(
          `Page context refreshed from: ${response.context.title}`,
          false
        );
        return response.context;
      } else {
        addMessage('Error: Could not get context', false);
        return null;
      }
    } catch (error) {
      console.error('Error refreshing context:', error);
      addMessage('Error: Could not get context', false);
      return null;
    }
  }

  function displayContext(context) {
    if (!context) return;
    const contextText = `
      Title: ${context.title}
      Domain: ${context.domain}
      Content Length: ${context.readability?.wordCount || 0} words
      Headings: ${context.headings?.length || 0} sections
      Links: ${context.links?.length || 0} available
    `.trim();
    elements.contextDisplay.textContent = contextText;
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
        addMessage(response.result, false);
        return response.result;
      } else {
        addMessage(`Error: ${response.error}`, false);
        return null;
      }
    } catch (error) {
      console.error('LLM query failed:', error);
      setLoadingState(false);
      addMessage(`Error: ${error.message}`, false);
      return null;
    }
  }

  function setLoadingState(isLoading) {
    elements.sendButton.disabled = isLoading;
    // Don't change button text, keep it as 'Send'
    // elements.sendButton.textContent = isLoading ? 'Processing...' : 'Send';

    const suggestionButtons =
      elements.suggestionsContainer.querySelectorAll('.suggestion-btn');
    suggestionButtons.forEach((btn) => (btn.disabled = isLoading));

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
        elements.chatMessages.appendChild(bubble);
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
    await browser.runtime.sendMessage({
      action: 'setLLMSettings',
      settings: newSettings,
    });
  }

  async function getSettings() {
    const resp = await browser.runtime.sendMessage({
      action: 'getLLMSettings',
    });
    return resp.settings;
  }

  // --- Event Listeners ---

  elements.sendButton.addEventListener('click', async () => {
    const prompt = elements.promptInput.value.trim();
    if (!prompt) return;

    addMessage(prompt, true);
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
      elements.promptInput.value = e.target.getAttribute('data-prompt');
      elements.promptInput.focus();
      elements.sendButton.click();
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

  elements.detectModelsButton.addEventListener('click', async () => {
    try {
      if (modelInfoTimeout) clearTimeout(modelInfoTimeout);
      elements.modelInfo.textContent = 'Detecting models...';

      const response = await browser.runtime.sendMessage({
        action: 'detectModels',
      });

      if (response.success) {
        const models = response.models;
        elements.modelInfo.textContent = models.length
          ? `Detected models: ${models.join(', ')}`
          : 'No model found';

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
      elements.refreshButton.disabled = true;
      await refreshContext();
      setTimeout(() => (elements.refreshButton.disabled = false), 500);
    });
  }

  function toggleSection(button, section) {
    if (!button || !section) return;
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
      // Also update debug info visibility if needed, though CSS handles it now
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
      if (elements.endpointInput && settings.endpoint)
        elements.endpointInput.value = settings.endpoint;

      // Show debug info
      elements.debugText.textContent = `Service: ${settings.service}\nEndpoint: ${settings.endpoint}\nModel: ${settings.model}`;
    }
  });

  // Default visibility states
  elements.contextSection.classList.add('hidden');
  if (elements.debugSection) {
    elements.debugSection.classList.add('hidden');
    if (elements.toggleDebugButton)
      elements.toggleDebugButton.classList.remove('expanded');
  }

  // Initial context refresh
  refreshContext();

  // Resizing Logic
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
});
