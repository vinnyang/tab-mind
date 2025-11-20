// background.js - Enhanced with advanced context processing
class LLMContextManager {
  constructor() {
    this.contextCache = new Map();
    this.loadSettings();
  }

  loadSettings() {
    // Load saved settings or use defaults
    browser.storage.local.get(['llmSettings']).then((result) => {
      this.llmSettings = result.llmSettings || {
        service: 'lmstudio',
        endpoint: 'http://localhost:1234/v1/completions',
        model: 'llama3',
        apiKey: '',
      };
    });
  }

  saveSettings(settings) {
    this.llmSettings = settings;
    browser.storage.local.set({ llmSettings: settings });
  }

  async getContextForTab(tabId) {
    // Check if we have cached context
    if (this.contextCache.has(tabId)) {
      const cached = this.contextCache.get(tabId);
      if (Date.now() - cached.timestamp < 30000) {
        // 30 second cache
        return cached.data;
      }
    }

    try {
      const tab = await browser.tabs.get(tabId);
      const context = await this.extractPageContext(tab);

      // Process and enhance the context
      const processedContext = this.processContext(context);

      // Cache the processed context
      this.contextCache.set(tabId, {
        data: processedContext,
        timestamp: Date.now(),
      });

      return processedContext;
    } catch (error) {
      console.error('Error getting tab context:', error);
      return null;
    }
  }

  async extractPageContext(tab) {
    // Send message to content script to get page context
    const response = await browser.tabs.sendMessage(tab.id, {
      action: 'getPageContext',
    });

    return response;
  }

  processContext(context) {
    // Enhance context with additional processing
    const processed = { ...context };

    // Filter out empty or very short content
    if (processed.text && processed.text.length < 50) {
      processed.text = 'No substantial content found on this page.';
    }

    // Clean up headings
    if (processed.headings && processed.headings.length > 0) {
      processed.headings = processed.headings.filter((h) => h.text.length > 5);
    }

    // Clean up links
    if (processed.links && processed.links.length > 0) {
      processed.links = processed.links.filter(
        (link) => link.text.length > 3 && link.url.length > 10
      );
    }

    // Clean up images
    if (processed.images && processed.images.length > 0) {
      processed.images = processed.images.filter(
        (img) => img.alt.length > 3 && img.src.length > 10
      );
    }

    // Add context summary
    processed.summary = this.generateContextSummary(processed);

    return processed;
  }

  generateContextSummary(context) {
    const summary = [];

    if (context.title) {
      summary.push(`Page title: ${context.title}`);
    }

    if (context.domain) {
      summary.push(`Domain: ${context.domain}`);
    }

    if (context.readability && context.readability.wordCount) {
      summary.push(`Content length: ${context.readability.wordCount} words`);
    }

    if (context.headings && context.headings.length > 0) {
      summary.push(`Headings: ${context.headings.length} sections`);
    }

    if (context.links && context.links.length > 0) {
      summary.push(`Links: ${context.links.length} available`);
    }

    if (context.images && context.images.length > 0) {
      summary.push(`Images: ${context.images.length} with alt text`);
    }

    return summary.join('; ');
  }

  async queryLLM(context, prompt) {
    try {
      const settings = this.llmSettings;

      // Different handling based on service type
      switch (settings.service) {
        case 'lmstudio':
          return await this.queryLMStudio(context, prompt);
        case 'ollama':
          return await this.queryOllama(context, prompt);
        case 'openai':
          return await this.queryOpenAI(context, prompt);
        default:
          return await this.queryLMStudio(context, prompt);
      }
    } catch (error) {
      console.error('LLM query failed:', error);
      throw new Error(`Failed to query LLM: ${error.message}`);
    }
  }

  async queryLMStudio(context, prompt) {
    const payload = {
      model: this.llmSettings.model,
      prompt: `${prompt}\n\nContext:\n${context.text.substring(0, 1000)}`,
      max_tokens: 500,
      temperature: 0.7,
    };

    const response = await fetch(this.llmSettings.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // LM Studio returns different structure
    if (data.choices && data.choices[0]) {
      return data.choices[0].text.trim();
    }

    return data.response || 'No response from LLM';
  }

  async queryOllama(context, prompt) {
    const payload = {
      model: this.llmSettings.model,
      prompt: `${prompt}\n\nContext:\n${context.text.substring(0, 1000)}`,
      stream: false,
    };

    const response = await fetch(this.llmSettings.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.response || 'No response from LLM';
  }

  async queryOpenAI(context, prompt) {
    const payload = {
      model: this.llmSettings.model,
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant that answers questions based on provided context.',
        },
        {
          role: 'user',
          content: `${prompt}\n\nContext:\n${context.text.substring(0, 1000)}`,
        },
      ],
      max_tokens: 500,
      temperature: 0.7,
    };

    const headers = {
      'Content-Type': 'application/json',
    };

    if (this.llmSettings.apiKey) {
      headers['Authorization'] = `Bearer ${this.llmSettings.apiKey}`;
    }

    const response = await fetch(this.llmSettings.endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.choices && data.choices[0]) {
      return data.choices[0].message.content.trim();
    }

    return 'No response from LLM';
  }

  async processWithLLM(tabId, userPrompt) {
    try {
      const context = await this.getContextForTab(tabId);
      if (!context) {
        throw new Error('No context available');
      }

      const result = await this.queryLLM(context, userPrompt);
      return result;
    } catch (error) {
      console.error('LLM processing failed:', error);
      throw error;
    }
  }
}

const llmManager = new LLMContextManager();

// Listen for messages from popup/content scripts
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'getContext':
      return Promise.resolve({
        context: llmManager.getContextForTab(message.tabId),
      });

    case 'queryLLM':
      llmManager
        .processWithLLM(message.tabId, message.prompt)
        .then((result) => sendResponse({ success: true, result }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message })
        );
      return true; // Keep message channel open for async response

    case 'getPageContext':
      llmManager
        .extractPageContext(sender.tab)
        .then((context) => sendResponse({ context }))
        .catch((error) => sendResponse({ error: error.message }));
      return true;

    case 'getLLMSettings':
      sendResponse({ settings: llmManager.llmSettings });
      return true;

    case 'setLLMSettings':
      llmManager.saveSettings(message.settings);
      sendResponse({ success: true });
      return true;
  }
});

// Listen for tab updates to refresh context
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Optionally refresh context on page load
    browser.tabs.sendMessage(tabId, { action: 'getPageContext' });
  }
});
