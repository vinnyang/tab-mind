import { HumanMessage } from '@langchain/core/messages';
import { buildGraph } from './agent/graph.js';
import { setSettings } from './lib/llm.js';
import { PROVIDERS, DEFAULT_PROVIDER, egressAllowList, assertEgressAllowed, detectProviderFromEndpoint } from './lib/providers.js';

class TabMindAgent {
  constructor(initialSettings = null) {
    this.contextCache = new Map();
    if (initialSettings) {
      this.llmSettings = initialSettings;
    } else {
      this.llmSettings = {
        service: 'openai',
        endpoint: 'localhost:1234',
        model: '',
        apiKey: '',
        timeout: 300000,
        models: [],
      };
      this.loadSettings();
    }
  }

  loadSettings() {
    browser.storage.local.get(['llmSettings']).then((result) => {
      if (result.llmSettings) {
        this.llmSettings = { ...this.llmSettings, ...result.llmSettings };
      }
      this.autoDetectModels();
    });
  }

  saveSettings(settings) {
    this.llmSettings = settings;
    browser.storage.local.set({ llmSettings: settings });
  }

  async autoDetectModels() {
    let provider =
      this.llmSettings.provider ||
      this.llmSettings.service ||
      DEFAULT_PROVIDER;

    let endpoint = (this.llmSettings.endpoint ?? '').toString().trim();
    if (endpoint && !endpoint.match(/^https?:\/\//)) {
      endpoint = `http://${endpoint}`;
    }

    // If the configured provider is unknown (e.g. legacy "openai"), detect from endpoint.
    if (!PROVIDERS[provider] && endpoint) {
      provider = detectProviderFromEndpoint(endpoint);
    }

    const def = PROVIDERS[provider] || PROVIDERS[DEFAULT_PROVIDER];

    // Normalize: ensure baseUrl includes /v1 (LM Studio, Ollama, etc. serve /v1/models).
    // Old settings may store bare host:port like "localhost:1234".
    let baseUrl = (endpoint || def.baseUrl).replace(/\/+$/, '');
    if (!/\/v1$/.test(baseUrl)) baseUrl += "/v1";
    const url = `${baseUrl}${def.modelsPath}`;

    let detectedModels = [];
    try {
      assertEgressAllowed(url, egressAllowList(def, endpoint || undefined));
      const headers = { 'Content-Type': 'application/json' };
      if (def.requiresApiKey && this.llmSettings.apiKey) {
        headers['Authorization'] = `Bearer ${this.llmSettings.apiKey}`;
      }
      const response = await fetch(url, { method: 'GET', headers });
      if (response.ok) {
        const data = await response.json();
        if (data.data && Array.isArray(data.data)) {
          detectedModels = data.data.map((m) => m.id);
        } else if (data.models && Array.isArray(data.models)) {
          detectedModels = data.models.map((m) => m.id || m.name);
        } else if (Array.isArray(data)) {
          detectedModels = data.map((m) => m.id || m.name || m);
        } else if (data.model) {
          detectedModels = [data.model];
        }
      }
    } catch (e) {
      console.warn('Model detection failed:', e.message);
    }

    if (detectedModels.length) {
      this.llmSettings.models = detectedModels;
      if (
        !this.llmSettings.model ||
        !detectedModels.includes(this.llmSettings.model)
      ) {
        this.llmSettings.model = detectedModels[0];
      }
    } else {
      this.llmSettings.models = [];
    }

    browser.storage.local.set({ llmSettings: this.llmSettings });
    return this.llmSettings.models;
  }

  async getContextForTab(tabId) {
    try {
      const tab = await browser.tabs.get(tabId);
      const context = await this.extractPageContext(tab);

      const processedContext = this.processContext(context);

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
    try {
      const response = await browser.tabs.sendMessage(tab.id, {
        action: 'getPageContext',
      });

      if (response && response.context) {
        return response.context;
      } else if (response && response.error) {
        throw new Error(`Content script error: ${response.error}`);
      } else {
        throw new Error('No context received from content script');
      }
    } catch (error) {
      console.error('Error extracting page context:', error);
      return {
        url: tab.url,
        title: tab.title,
        domain: new URL(tab.url).hostname,
        text: 'Failed to extract page content',
        selection: '',
        headings: [],
        links: [],
        images: [],
        metadata: {},
        readability: {},
      };
    }
  }

  processContext(context) {
    const processed = { ...context };

    if (processed.text && processed.text.length < 50) {
      processed.text = 'No substantial content found on this page.';
    }

    if (processed.headings && processed.headings.length > 0) {
      processed.headings = processed.headings.filter((h) => h.text.length > 5);
    }

    if (processed.links && processed.links.length > 0) {
      processed.links = processed.links.filter(
        (link) => link.text.length > 3 && link.url.length > 10
      );
    }

    if (processed.images && processed.images.length > 0) {
      processed.images = processed.images.filter(
        (img) => img.alt.length > 3 && img.src.length > 10
      );
    }

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

  async syncLlmSettings() {
    let provider =
      this.llmSettings.provider ||
      this.llmSettings.service ||
      DEFAULT_PROVIDER;

    let endpoint = (this.llmSettings.endpoint ?? '').toString().trim();
    if (endpoint && !endpoint.match(/^https?:\/\//)) {
      endpoint = `http://${endpoint}`;
    }

    // If the configured provider is unknown (e.g. legacy "openai"), detect from endpoint.
    if (!PROVIDERS[provider] && endpoint) {
      provider = detectProviderFromEndpoint(endpoint);
    }

    const def = PROVIDERS[provider] || PROVIDERS[DEFAULT_PROVIDER];
    if (!endpoint) {
      endpoint = def.baseUrl;
    } else if (provider === 'openrouter') {
      if (!/\/api\/v1\/?$/.test(endpoint)) {
        endpoint = endpoint.replace(/\/+$/, '');
        if (!/\/api\/v1$/.test(endpoint)) endpoint = `${endpoint}/api/v1`;
      }
    } else if (!/\/v1$/.test(endpoint)) {
      // Old settings may store bare host:port; providers serve on /v1.
      endpoint = endpoint.replace(/\/+$/, "") + "/v1";
    }

    const providerDef = PROVIDERS[provider] || PROVIDERS[DEFAULT_PROVIDER];
    const apiKey = providerDef.requiresApiKey ? (this.llmSettings.apiKey || '') : '';

    setSettings({
      provider: provider in PROVIDERS ? provider : DEFAULT_PROVIDER,
      endpoint,
      model: this.llmSettings.model || '',
      apiKey,
      referer: this.llmSettings.referer,
      title: this.llmSettings.title,
      timeout: this.llmSettings.timeout,
    });
  }

  async processWithLLM(tabId, userPrompt) {
    try {
      const context = await this.getContextForTab(tabId);
      if (!context) {
        throw new Error('No context available');
      }

      await this.syncLlmSettings();

      const app = buildGraph();
      const result = await app.invoke({
        messages: [new HumanMessage(userPrompt)],
        rawPage: context.text || '',
        selection: context.selection || '',
      });

      const lastMessage = result.messages[result.messages.length - 1];
      return lastMessage.content;
    } catch (error) {
      console.error('LLM processing failed:', error);
      throw error;
    }
  }
}

const agent = new TabMindAgent();

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'getContext':
      return Promise.resolve({
        context: agent.getContextForTab(message.tabId),
      });

    case 'queryLLM':
      agent
        .processWithLLM(message.tabId, message.prompt)
        .then((result) => sendResponse({ success: true, result }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message })
        );
      return true; // Keep message channel open for async response

    case 'getPageContext':
      agent
        .extractPageContext(sender.tab)
        .then((context) => sendResponse({ context }))
        .catch((error) => sendResponse({ error: error.message }));
      return true;

    case 'getLLMSettings':
      sendResponse({ settings: agent.llmSettings });
      return true;

    case 'setLLMSettings':
      agent.saveSettings(message.settings);
      agent.autoDetectModels();
      sendResponse({ success: true });
      return true;

    case 'detectModels':
      agent
        .autoDetectModels()
        .then((models) => sendResponse({ success: true, models }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message })
        );
      return true;
  }
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    browser.tabs.sendMessage(tabId, { action: 'getPageContext' });
  }
});

if (browser.browserAction && browser.sidebarAction) {
  browser.browserAction.onClicked.addListener(() => {
    browser.sidebarAction.open();
  });
}
