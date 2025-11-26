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
    const service = this.llmSettings.service;
    if (service === 'lmstudio' || service === 'openai') {
      let rawEndpoint = this.llmSettings.endpoint.trim();

      if (!rawEndpoint.match(/^https?:\/\//)) {
        rawEndpoint = `http://${rawEndpoint}`;
      }

      let baseUrl = rawEndpoint.replace(/\//, '');
      baseUrl = baseUrl.replace(/\/v1\/completions$/, '');
      baseUrl = baseUrl.replace(/\/v1\/chat\/completions$/, '');
      baseUrl = baseUrl.replace(/\/v1\/models$/, '');
      baseUrl = baseUrl.replace(/\/models$/, '');
      baseUrl = baseUrl.replace(/\/v1$/, '');
      baseUrl = baseUrl.replace(/\/models$/, '');
      baseUrl = baseUrl.replace(/\/v1$/, '');

      const possibleEndpoints = [`${baseUrl}/v1/models`, `${baseUrl}/models`];

      let detectedModels = [];

      for (const endpoint of possibleEndpoints) {
        try {
          const response = await fetch(endpoint, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });
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
        } catch (e) {}
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
      return await this.queryGenericOpenAIChat(
        messages,
        context,
        settings.service
      );
    } catch (error) {
      console.error('LLM chat query failed:', error);
      throw new Error(`Failed to query LLM: ${error.message}`);
    }
  }

  async queryGenericOpenAIChat(messages, context, serviceName) {
    let rawEndpoint = this.llmSettings.endpoint.trim();
    if (!rawEndpoint.match(/^https?:\/\//)) {
      rawEndpoint = `http://${rawEndpoint}`;
    }

    let baseUrl = rawEndpoint.replace(/\/$/, '');
    baseUrl = baseUrl.replace(/\/v1\/completions$/, '');
    baseUrl = baseUrl.replace(/\/v1\/chat\/completions$/, '');
    baseUrl = baseUrl.replace(/\/v1$/, '');

    const endpoint = `${baseUrl}/v1/chat/completions`;

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
      if (this.llmSettings.apiKey) {
        headers['Authorization'] = `Bearer ${this.llmSettings.apiKey}`;
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

      const result = await app.invoke({
        messages: [new HumanMessage(userPrompt)],
        context: context,
        settings: this.llmSettings,
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
      sendResponse({ settings: agent.llmSettings });
      return true;

    case 'setLLMSettings':
      agent.saveSettings(message.settings);
      // Auto-detect models after settings update
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
