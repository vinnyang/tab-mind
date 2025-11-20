// popup.js - Enhanced with LLM settings and configuration
document.addEventListener('DOMContentLoaded', () => {
  const refreshButton = document.getElementById('refresh');
  const queryButton = document.getElementById('query-llm');
  const promptInput = document.getElementById('prompt-input');
  const resultDisplay = document.getElementById('result-display');
  const contextDisplay = document.getElementById('context-display');
  const loadingIndicator = document.getElementById('loading');
  const settingsButton = document.getElementById('settings-button');
  const settingsPanel = document.getElementById('settings-panel');
  const serviceSelect = document.getElementById('service-select');
  const endpointInput = document.getElementById('endpoint-input');
  const modelInput = document.getElementById('model-input');
  const apiKeyInput = document.getElementById('api-key-input');
  const saveSettingsButton = document.getElementById('save-settings');

  // Get current tab
  async function getCurrentTab() {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tab;
  }

  // Refresh context button
  refreshButton.addEventListener('click', async () => {
    try {
      const tab = await getCurrentTab();
      const response = await browser.tabs.sendMessage(tab.id, {
        action: 'getPageContext',
      });

      if (response && response.context) {
        displayContext(response.context);
      }
    } catch (error) {
      console.error('Error refreshing context:', error);
      contextDisplay.textContent = 'Error: Could not get context';
    }
  });

  // Query LLM button
  queryButton.addEventListener('click', async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) {
      resultDisplay.textContent = 'Please enter a prompt';
      return;
    }

    try {
      loadingIndicator.style.display = 'block';
      resultDisplay.textContent = '';

      const tab = await getCurrentTab();

      // Send query to background script
      const response = await browser.runtime.sendMessage({
        action: 'queryLLM',
        tabId: tab.id,
        prompt: prompt,
      });

      if (response.success) {
        resultDisplay.textContent = response.result;
      } else {
        resultDisplay.textContent = `Error: ${response.error}`;
      }
    } catch (error) {
      console.error('LLM query failed:', error);
      resultDisplay.textContent = `Error: ${error.message}`;
    } finally {
      loadingIndicator.style.display = 'none';
    }
  });

  // Settings panel toggle
  settingsButton.addEventListener('click', () => {
    settingsPanel.style.display =
      settingsPanel.style.display === 'none' ? 'block' : 'none';
  });

  // Save settings
  saveSettingsButton.addEventListener('click', async () => {
    const settings = {
      service: serviceSelect.value,
      endpoint: endpointInput.value.trim(),
      model: modelInput.value.trim(),
      apiKey: apiKeyInput.value.trim(),
    };

    try {
      await browser.runtime.sendMessage({
        action: 'setLLMSettings',
        settings: settings,
      });

      // Show success message
      const status = document.getElementById('settings-status');
      status.textContent = 'Settings saved successfully!';
      status.style.color = 'green';

      // Hide status after 3 seconds
      setTimeout(() => {
        status.textContent = '';
      }, 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      const status = document.getElementById('settings-status');
      status.textContent = 'Error saving settings';
      status.style.color = 'red';
    }
  });

  // Display context in popup
  function displayContext(context) {
    if (!context) return;

    contextDisplay.innerHTML = `
      <h3>${context.title}</h3>
      <p><strong>URL:</strong> ${context.url}</p>
      <p><strong>Domain:</strong> ${context.domain}</p>
      <p><strong>Text Preview:</strong> ${context.text.substring(0, 200)}...</p>
      <p><strong>Selection:</strong> ${context.selection || 'None'}</p>
    `;
  }

  // Load current settings
  async function loadSettings() {
    try {
      const response = await browser.runtime.sendMessage({
        action: 'getLLMSettings',
      });
      if (response.settings) {
        const settings = response.settings;
        serviceSelect.value = settings.service || 'lmstudio';
        endpointInput.value =
          settings.endpoint || 'http://localhost:1234/v1/completions';
        modelInput.value = settings.model || 'llama3';
        apiKeyInput.value = settings.apiKey || '';
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  // Initialize with current context and settings
  getCurrentTab().then(async (tab) => {
    try {
      const response = await browser.tabs.sendMessage(tab.id, {
        action: 'getPageContext',
      });
      if (response && response.context) {
        displayContext(response.context);
      }
    } catch (error) {
      console.error('Error getting initial context:', error);
    }

    // Load settings
    await loadSettings();
  });
});
