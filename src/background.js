import { StateGraph, END, START } from '@langchain/langgraph';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';

const graphState = {
  messages: {
    value: (x, y) => x.concat(y),
    default: () => [],
  },
  context: {
    value: (x, y) => y,
    default: () => ({}),
  },
  settings: {
    value: (x, y) => y,
    default: () => ({}),
  },
};

async function agentNode(state) {
  const { messages, context, settings } = state;

  try {
    const tabMind = new TabMindAgent(settings);

    const response = await tabMind.queryChat(messages, context);
    return { messages: [new AIMessage(response)] };
  } catch (error) {
    console.error('Error in agentNode:', error);
    return { messages: [new AIMessage(`Error: ${error.message}`)] };
  }
}

const workflow = new StateGraph({ channels: graphState })
  .addNode('agent', agentNode)
  .addEdge(START, 'agent')
  .addEdge('agent', END);

const app = workflow.compile();

class TabMindAgent {
  constructor(initialSettings = null) {
    this.contextCache = new Map();
    this.passphraseRuntime = '';
    this.apiKeyRuntime = '';
    const baseSettings = {
      provider: 'openai',
        service: 'openai',
      endpoint: 'http://localhost:1234',
      referer: '',
      title: '',
        model: '',
        apiKey: '',
      apiKeyIsEncrypted: false,
      apiKeyCipher: '',
      apiKeyIv: '',
      apiKeySalt: '',
      timeout: 300000,
      models: [],
      endpoints: {
        openrouter: 'https://openrouter.ai/api/v1',
        openai: 'http://localhost:1234',
      },
    };
    if (initialSettings) {
      this.llmSettings = { ...baseSettings, ...initialSettings };
      if (initialSettings.apiKey) {
        this.apiKeyRuntime = initialSettings.apiKey;
      }
      if (initialSettings.passphraseRuntime) {
        this.passphraseRuntime = initialSettings.passphraseRuntime;
      }
    } else {
      this.llmSettings = baseSettings;
      this.loadSettings();
    }
  }

  async loadSettings() {
    try {
      const result = await browser.storage.local.get(['llmSettings']);
      if (result.llmSettings) {
        this.llmSettings = { ...this.llmSettings, ...result.llmSettings };
      }
      if (!this.llmSettings.provider) {
        this.llmSettings.provider = this.llmSettings.service || 'openai';
      }
      if (!this.llmSettings.service) {
        this.llmSettings.service = this.llmSettings.provider;
      }
      if (!this.llmSettings.endpoint) {
        this.llmSettings.endpoint = this.getDefaultEndpointForProvider(
          this.llmSettings.provider
        );
      }
      if (!this.llmSettings.apiKeyIsEncrypted && this.llmSettings.apiKey) {
        this.apiKeyRuntime = this.llmSettings.apiKey;
      } else {
        this.apiKeyRuntime = '';
      }
      await this.autoDetectModels();
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  getDefaultEndpointForProvider(provider) {
    if (provider === 'openrouter') return 'https://openrouter.ai/api/v1';
    if (provider === 'openai') return 'http://localhost:1234';
    return '';
  }

  normalizeBaseUrl(provider, endpoint) {
    let rawEndpoint =
      (endpoint && endpoint.toString().trim()) ||
      this.getDefaultEndpointForProvider(provider);

      if (!rawEndpoint.match(/^https?:\/\//)) {
      rawEndpoint = provider === 'openrouter' ? `https://${rawEndpoint}` : `http://${rawEndpoint}`;
    }

    let baseUrl = rawEndpoint.replace(/\/$/, '');

    if (provider === 'openrouter') {
      baseUrl = baseUrl.replace(
        /\/api\/v1\/?(chat\/completions|completions|models)?$/,
        ''
      );
      baseUrl = baseUrl.replace(
        /\/v1\/?(chat\/completions|completions|models)?$/,
        ''
      );
      if (!/\/api\/v1$/.test(baseUrl)) {
        baseUrl = `${baseUrl}/api/v1`;
      } else {
        baseUrl = `${baseUrl}`;
      }
      return baseUrl;
    }

      baseUrl = baseUrl.replace(/\/v1\/completions$/, '');
      baseUrl = baseUrl.replace(/\/v1\/chat\/completions$/, '');
      baseUrl = baseUrl.replace(/\/v1\/models$/, '');
      baseUrl = baseUrl.replace(/\/models$/, '');
      baseUrl = baseUrl.replace(/\/v1$/, '');
    return baseUrl;
  }

  arrayBufferToBase64(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  }

  base64ToArrayBuffer(str) {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  async deriveKey(passphrase, saltBuffer) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(passphrase),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async encryptApiKey(apiKey, passphrase) {
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await this.deriveKey(passphrase, salt);
    const cipherBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(apiKey)
    );
    return {
      cipher: this.arrayBufferToBase64(cipherBuffer),
      iv: this.arrayBufferToBase64(iv),
      salt: this.arrayBufferToBase64(salt),
    };
  }

  async decryptApiKey(encrypted, passphrase) {
    if (!encrypted || !encrypted.cipher || !encrypted.iv || !encrypted.salt) {
      throw new Error('Missing encrypted key data');
    }
    const saltBuffer = this.base64ToArrayBuffer(encrypted.salt);
    const ivBuffer = this.base64ToArrayBuffer(encrypted.iv);
    const cipherBuffer = this.base64ToArrayBuffer(encrypted.cipher);
    const key = await this.deriveKey(passphrase, saltBuffer);
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
      key,
      cipherBuffer
    );
    return new TextDecoder().decode(plainBuffer);
  }

  sanitizeInput(str) {
    if (!str || typeof str !== 'string') return '';
    return str.trim().replace(/\s+/g, ' ');
  }

  async getApiKeyForRequests(requireKey = false) {
    if (this.llmSettings.apiKeyIsEncrypted) {
      if (this.apiKeyRuntime) return this.apiKeyRuntime;
      if (!this.passphraseRuntime) {
        if (requireKey) {
          throw new Error('Passphrase required to unlock stored API key');
        }
        return '';
      }

      const decrypted = await this.decryptApiKey(
        {
          cipher: this.llmSettings.apiKeyCipher,
          iv: this.llmSettings.apiKeyIv,
          salt: this.llmSettings.apiKeySalt,
        },
        this.passphraseRuntime
      );
      this.apiKeyRuntime = decrypted;
      return decrypted;
    }

    if (this.llmSettings.apiKey) {
      this.apiKeyRuntime = this.llmSettings.apiKey;
      return this.llmSettings.apiKey;
    }

    if (requireKey) {
      throw new Error('API key is required for this provider');
    }

    return '';
  }

  async unlockApiKeyWithPassphrase(passphrase) {
    this.passphraseRuntime = passphrase;
    if (!this.llmSettings.apiKeyIsEncrypted) return;
    const decrypted = await this.decryptApiKey(
      {
        cipher: this.llmSettings.apiKeyCipher,
        iv: this.llmSettings.apiKeyIv,
        salt: this.llmSettings.apiKeySalt,
      },
      passphrase
    );
    this.apiKeyRuntime = decrypted;
  }

  getSafeSettings() {
    const safeSettings = { ...this.llmSettings };
    delete safeSettings.apiKey;
    delete safeSettings.apiKeyCipher;
    delete safeSettings.apiKeyIv;
    delete safeSettings.apiKeySalt;
    safeSettings.hasApiKey = Boolean(
      this.llmSettings.apiKeyIsEncrypted
        ? this.llmSettings.apiKeyCipher
        : this.llmSettings.apiKey
    );
    safeSettings.apiKeyIsEncrypted = Boolean(
      this.llmSettings.apiKeyIsEncrypted
    );
    safeSettings.requiresPassphrase =
      Boolean(this.llmSettings.apiKeyIsEncrypted) && !this.apiKeyRuntime;
    return safeSettings;
  }

  async saveSettings(settings = {}, options = {}) {
    const merged = { ...this.llmSettings, ...settings };

    // Normalize provider/service
    merged.provider = merged.provider || merged.service || 'openai';
    merged.service = merged.service || merged.provider;

    // Endpoint fallback and update per-provider endpoints
    merged.endpoints = { ...this.llmSettings.endpoints, ...(merged.endpoints || {}) };

    // If we're changing provider, we might want to switch endpoint,
    // but if we're setting endpoint explicitly, we update the map.
    // However, saveSettings merges everything.

    // If settings.endpoint is provided, update the map for the *current* (or new) provider.
    // If only provider is provided (switching), we shouldn't overwrite the endpoint in merged
    // with the old one unless we handle it carefully. But UI sends endpoint along with provider usually.
    // Actually, UI logic I plan will send { provider, endpoint }.
    // So here we just need to ensure the map is updated.

    if (settings.endpoint) {
      // User provided an endpoint explicitly
      merged.endpoints[merged.provider] = this.sanitizeInput(settings.endpoint);
    } else {
      // No endpoint provided, try to restore from map or default
      const stored = merged.endpoints[merged.provider];
      merged.endpoint = stored || this.getDefaultEndpointForProvider(merged.provider);
      // Update map if it was empty/default
      merged.endpoints[merged.provider] = merged.endpoint;
    }

    merged.endpoint = this.sanitizeInput(merged.endpoint);
    merged.referer = this.sanitizeInput(merged.referer);
    merged.title = this.sanitizeInput(merged.title);

    if (options.clearApiKey) {
      merged.apiKey = '';
      merged.apiKeyIsEncrypted = false;
      merged.apiKeyCipher = '';
      merged.apiKeyIv = '';
      merged.apiKeySalt = '';
      this.apiKeyRuntime = '';
      this.passphraseRuntime = '';
    }

    if (settings.apiKey !== undefined) {
      const sanitizedKey = this.sanitizeInput(settings.apiKey);
      if (options.encryptApiKey && options.passphrase) {
        const encrypted = await this.encryptApiKey(
          sanitizedKey,
          options.passphrase
        );
        merged.apiKey = '';
        merged.apiKeyIsEncrypted = true;
        merged.apiKeyCipher = encrypted.cipher;
        merged.apiKeyIv = encrypted.iv;
        merged.apiKeySalt = encrypted.salt;
        this.apiKeyRuntime = sanitizedKey;
        this.passphraseRuntime = options.passphrase;
      } else {
        merged.apiKey = sanitizedKey;
        merged.apiKeyIsEncrypted = false;
        merged.apiKeyCipher = '';
        merged.apiKeyIv = '';
        merged.apiKeySalt = '';
        this.apiKeyRuntime = sanitizedKey;
        this.passphraseRuntime = '';
      }
    } else if (options.passphrase) {
      // Attempt to unlock existing encrypted key
      await this.unlockApiKeyWithPassphrase(options.passphrase);
    }

    this.llmSettings = merged;
    await browser.storage.local.set({ llmSettings: merged });
    return merged;
  }

  async autoDetectModels() {
    const provider = this.llmSettings.provider || this.llmSettings.service;
    const baseUrl = this.normalizeBaseUrl(provider, this.llmSettings.endpoint);
    const detectedModels = [];
    let endpoints = [];
    const headers = { 'Content-Type': 'application/json' };

    try {
      if (provider === 'openrouter') {
        const apiKey = await this.getApiKeyForRequests(true);
        headers['Authorization'] = `Bearer ${apiKey}`;
        if (this.llmSettings.referer) {
          headers['HTTP-Referer'] = this.llmSettings.referer;
        }
        if (this.llmSettings.title) {
          headers['X-Title'] = this.llmSettings.title;
        }
        endpoints = [`${baseUrl}/models`];
      } else {
        const requireKey =
          this.llmSettings.apiKeyIsEncrypted ||
          Boolean(this.llmSettings.apiKey);
        const apiKey = await this.getApiKeyForRequests(requireKey);
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
        endpoints = [`${baseUrl}/v1/models`, `${baseUrl}/models`];
      }

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            method: 'GET',
            headers,
          });
          if (response.ok) {
            const data = await response.json();
            if (data.data && Array.isArray(data.data)) {
              detectedModels.push(...data.data.map((m) => m.id));
            } else if (data.models && Array.isArray(data.models)) {
              detectedModels.push(...data.models.map((m) => m.id || m.name));
            } else if (Array.isArray(data)) {
              detectedModels.push(
                ...data.map((m) => m.id || m.name || m).filter(Boolean)
              );
            } else if (data.model) {
              detectedModels.push(data.model);
            }
            if (detectedModels.length) break;
          } else if (response.status === 401 || response.status === 403) {
            const txt = await response.text();
            throw new Error(
              `Authentication failed (${response.status}). ${txt || ''}`.trim()
            );
          } else if (response.status === 429) {
            throw new Error('Rate limited while detecting models.');
          }
        } catch (err) {
          if (provider === 'openrouter') throw err;
        }
      }
    } catch (error) {
      this.llmSettings.models = [];
      await browser.storage.local.set({ llmSettings: this.llmSettings });
      throw error;
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

    await browser.storage.local.set({ llmSettings: this.llmSettings });
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

  cleanLLMOutput(text) {
    if (!text || typeof text !== 'string') return text;
    let out = text;

    out = out.replace(/<thinking[\s\S]*?<\/thinking>/gi, '');
    out = out.replace(/<think[\s\S]*?<\/think>/gi, '');
    out = out.replace(/\[think\][\s\S]*?\[\/think\]/gi, '');
    out = out.replace(/<\/?\s*thought[^>]*>/gi, '');

    out = out.replace(/<reasoning[\s\S]*?<\/reasoning>/gi, '');

    out = out.replace(
      /<\|channel\|>\s*(?:analysis|reasoning|thinking|thought)\s*<\|message\|>[\s\S]*?(?=<\|channel\|>\s*message\s*<\|message\|>|<\|channel\|>\s*user\s*<\|message\|>|$)/gi,
      ''
    );

    out = out.replace(
      /<\|channel\|>\s*(?:analysis|reasoning|thinking|thought|internal)\s*<\|message\|>[\s\S]*?<\|message\|>/gi,
      ''
    );

    out = out.replace(/<\|channel\|>/gi, '');
    out = out.replace(/<\|message\|>/gi, '');
    out = out.replace(/<\|endoftext\|>/gi, '');
    out = out.replace(/<\|start\|>/gi, '');
    out = out.replace(/<\|end\|>/gi, '');

    out = out.replace(/<!--[\s\S]*?-->/g, '');
    out = out.replace(/<!---[\s\S]*?--->/g, '');

    out = out.replace(/\*\*Final Answer:\*\*/gi, '');
    out = out.replace(/Final Answer:\s*/gi, '');
    out = out.replace(/\*\*Answer:\*\*/gi, '');
    out = out.replace(/^Answer:\s*/gim, '');
    out = out.replace(/\*\*Response:\*\*/gi, '');
    out = out.replace(/^Response:\s*/gim, '');

    out = out.replace(/\n{3,}/g, '\n\n');
    out = out.replace(/^\s+|\s+$/g, '');

    return out.trim();
  }

  async queryChat(messages, context) {
    try {
      const settings = this.llmSettings;
      const provider = settings.provider || settings.service || 'openrouter';
      return await this.queryGenericOpenAIChat(messages, context, provider);
    } catch (error) {
      console.error('LLM chat query failed:', error);
      throw new Error(`Failed to query LLM: ${error.message}`);
    }
  }

  async queryGenericOpenAIChat(messages, context, serviceName) {
    const provider = serviceName || this.llmSettings.provider || 'openrouter';
    const baseUrl = this.normalizeBaseUrl(provider, this.llmSettings.endpoint);
    const endpoint =
      provider === 'openrouter'
        ? `${baseUrl}/chat/completions`
        : `${baseUrl}/v1/chat/completions`;

    try {
      const systemPrompt =
        'You are a helpful browser assistant. You answer questions based on the provided page context. You must respond with a valid JSON object containing a single field "answer". Example: { "answer": "Your response..." }. Ensure the JSON is valid and properly escaped. Do not include any markdown formatting outside the JSON. Do not include thinking or reasoning traces in the JSON output.';

      let contextContent = '';
      if (context.selection && context.selection.trim().length > 0) {
        contextContent = `Selected Text Context:\n${context.selection.substring(
          0,
          15000
        )}`;
      } else {
        contextContent = `Page Context:\n${context.text.substring(0, 15000)}`;
      }

      const apiMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'system', content: contextContent },
      ];

      for (const msg of messages) {
        let role = 'user';
        if (msg._getType() === 'ai') role = 'assistant';
        else if (msg._getType() === 'system') role = 'system';

        apiMessages.push({
          role: role,
          content: msg.content,
        });
      }

      const lastMsg = apiMessages[apiMessages.length - 1];
      lastMsg.content +=
        '\n\nRemember: Respond ONLY with valid JSON in the format { "answer": "..." }. Escape double quotes inside the answer string.';

      const payload = {
        model: this.llmSettings.model || 'local-model',
        messages: apiMessages,
        max_tokens: 2048,
        temperature: 0.2,
        stream: false,
      };

      const headers = { 'Content-Type': 'application/json' };
      try {
        const requireKey =
          provider === 'openrouter' ||
          this.llmSettings.apiKeyIsEncrypted ||
          Boolean(this.llmSettings.apiKey);
        const apiKey = await this.getApiKeyForRequests(requireKey);
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
      } catch (err) {
        throw new Error(err.message);
      }

      if (provider === 'openrouter') {
        if (this.llmSettings.referer) {
          headers['HTTP-Referer'] = this.llmSettings.referer;
        }
        if (this.llmSettings.title) {
          headers['X-Title'] = this.llmSettings.title;
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.llmSettings.timeout || 300000
      );

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const txt = await response.text();
          if (response.status === 401 || response.status === 403) {
            throw new Error(
              `Authentication failed (HTTP ${response.status}). ${txt || 'Check your API key and headers.'}`
            );
          }
          if (response.status === 429) {
            throw new Error('Rate limited by the provider (HTTP 429).');
          }
          throw new Error(`HTTP ${response.status}: ${txt}`);
        }

        const data = await response.json();

        let rawContent = '';
        if (data.choices && data.choices[0]) {
          rawContent = data.choices[0].message?.content || '';
        } else if (data.response) {
          rawContent =
            typeof data.response === 'string'
              ? data.response
              : JSON.stringify(data.response);
        }

        const cleanedContent = this.cleanLLMOutput(String(rawContent));
        const jsonResult = this.extractAndParseJSON(cleanedContent);

        if (jsonResult && jsonResult.answer) return jsonResult.answer;
        if (jsonResult && jsonResult.content) return jsonResult.content;

        const answerRegex = /(?:["']?answer["']?)\s*:\s*"((?:[^"\\]|\\.)*)"/s;
        const match = cleanedContent.match(answerRegex);
        if (match) {
          try {
            return JSON.parse(`"${match[1]}"`);
          } catch {
            return match[1];
          }
        }

        return cleanedContent;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error(
            `Request timed out after ${this.llmSettings.timeout || 300000}ms`
          );
        }
        throw error;
      }
    } catch (error) {
      console.error(`Chat query failed:`, error);
      throw error;
    }
  }

  extractAndParseJSON(text) {
    if (!text) return null;

    let jsonStr = text;

    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    } else {
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');

      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = text.substring(firstBrace, lastBrace + 1);
      }
    }

    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      return null;
    }
  }

  async processWithLLM(tabId, userPrompt) {
    try {
      const context = await this.getContextForTab(tabId);
      if (!context) {
        throw new Error('No context available');
      }

      const provider = this.llmSettings.provider || this.llmSettings.service;
      const requireKey =
        provider === 'openrouter' ||
        this.llmSettings.apiKeyIsEncrypted ||
        Boolean(this.llmSettings.apiKey);
      const runtimeApiKey = await this.getApiKeyForRequests(requireKey);
      const runtimeSettings = {
        ...this.llmSettings,
        apiKey: runtimeApiKey,
        passphraseRuntime: this.passphraseRuntime,
      };

      const result = await app.invoke({
        messages: [new HumanMessage(userPrompt)],
        context: context,
        settings: runtimeSettings,
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

// Listen for messages from popup/content scripts
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
      sendResponse({ settings: agent.getSafeSettings() });
      return true;

    case 'setLLMSettings':
      agent
        .saveSettings(message.settings || {}, {
          passphrase: message.passphrase,
          encryptApiKey: message.encryptApiKey,
          clearApiKey: message.clearApiKey,
        })
        .then(() => agent.autoDetectModels())
        .then(() => sendResponse({ success: true }))
        .catch((error) =>
          sendResponse({ success: false, error: error.message })
        );
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

// Listen for tab updates to refresh context
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
