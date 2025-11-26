import { StateGraph, END, START } from "@langchain/langgraph";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";

// Define the graph state
const graphState = {
  messages: {
    value: (x, y) => x.concat(y),
    default: () => [],
  },
  context: {
    value: (x, y) => y, // Latest context overwrites
    default: () => ({}),
  },
  settings: {
    value: (x, y) => y,
    default: () => ({}),
  }
};

// Define the agent node (communicates with local LLM)
async function agentNode(state) {
  const { messages, context, settings } = state;

  // We'll instantiate a temporary agent to use its query methods
  // In a real refactor, we'd separate the LLM service
  // Pass settings directly to constructor to avoid race condition with loadSettings()
  try {
    const tabMind = new TabMindAgent(settings);

    // Pass the full message history to the new queryChat method
    // We need to pass context as well so it can be injected
    const response = await tabMind.queryChat(messages, context);
    return { messages: [new AIMessage(response)] };
  } catch (error) {
    console.error("Error in agentNode:", error);
    return { messages: [new AIMessage(`Error: ${error.message}`)] };
  }
}

// Compile the graph
const workflow = new StateGraph({ channels: graphState })
  .addNode("agent", agentNode)
  .addEdge(START, "agent")
  .addEdge("agent", END);

const app = workflow.compile();

// ... existing TabMindAgent class ...
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
        timeout: 300000, // Default timeout in ms (5 mins)
        models: [],
      };
      this.loadSettings();
    }
  }

  loadSettings() {
    // Load saved settings or use defaults
    browser.storage.local.get(['llmSettings']).then((result) => {
      if (result.llmSettings) {
        // Merge saved settings with current defaults to ensure new fields (like timeout) exist
        this.llmSettings = { ...this.llmSettings, ...result.llmSettings };
      }
      // Auto-detect models when settings are loaded
      this.autoDetectModels();
    });
  }

  saveSettings(settings) {
    this.llmSettings = settings;
    browser.storage.local.set({ llmSettings: settings });
  }

  async autoDetectModels() {
    // Detect models for LM Studio or OpenAI-compatible endpoints
    const service = this.llmSettings.service;
    if (service === 'lmstudio' || service === 'openai') {
      // Normalize endpoint to ensure protocol and remove trailing slash
      let rawEndpoint = this.llmSettings.endpoint.trim();

      // Add http:// if missing protocol
      if (!rawEndpoint.match(/^https?:\/\//)) {
        rawEndpoint = `http://${rawEndpoint}`;
      }

      let baseUrl = rawEndpoint.replace(/\/$/, '');

      // Remove specific paths if they exist to get base URL
      baseUrl = baseUrl.replace(/\/v1\/completions$/, '');
      baseUrl = baseUrl.replace(/\/v1\/chat\/completions$/, '');
      baseUrl = baseUrl.replace(/\/v1\/models$/, '');
      baseUrl = baseUrl.replace(/\/models$/, '');
      baseUrl = baseUrl.replace(/\/v1$/, '');

      // Existing LM Studio detection logic
      const possibleEndpoints = [
        `${baseUrl}/v1/models`,
        `${baseUrl}/models`
      ];

      let detectedModels = [];

      for (const endpoint of possibleEndpoints) {
        try {
          const response = await fetch(endpoint, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });
          if (response.ok) {
            const data = await response.json();
            // Extract model names from different response formats
            if (data.data && Array.isArray(data.data)) {
              detectedModels = data.data.map((m) => m.id);
            } else if (data.models && Array.isArray(data.models)) {
              detectedModels = data.models.map((m) => m.id || m.name);
            } else if (Array.isArray(data)) {
              detectedModels = data.map(m => m.id || m.name || m);
            } else if (data.model) {
              detectedModels = [data.model];
            }
          }
        } catch (e) {
            // Silently fail individual endpoints
        }
      }

      if (detectedModels.length) {
        this.llmSettings.models = detectedModels;
        if (!this.llmSettings.model || !detectedModels.includes(this.llmSettings.model)) {
          this.llmSettings.model = detectedModels[0];
        }
      } else {
        this.llmSettings.models = [];
      }
    }

    // Persist updated settings
    browser.storage.local.set({ llmSettings: this.llmSettings });
    return this.llmSettings.models;
  }

  async getContextForTab(tabId) {
    // Cache removed to ensure we always get the latest selection
    // if (this.contextCache.has(tabId)) {
    //   const cached = this.contextCache.get(tabId);
    //   if (Date.now() - cached.timestamp < 30000) {
    //     return cached.data;
    //   }
    // }

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
      // Return a minimal context fallback
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

  // Clean LLM outputs: remove internal 'thinking' sections and unwanted markers
  // This follows best practices for handling both thinking and non-thinking model outputs
  cleanLLMOutput(text) {
    if (!text || typeof text !== 'string') return text;
    let out = text;

    // === Remove Anthropic-style thinking blocks ===
    // Format: <thinking>...</thinking> or variations
    out = out.replace(/<thinking[\s\S]*?<\/thinking>/gi, '');
    out = out.replace(/<think[\s\S]*?<\/think>/gi, '');
    out = out.replace(/\[think\][\s\S]*?\[\/think\]/gi, '');
    out = out.replace(/<\/?\s*thought[^>]*>/gi, '');

    // === Remove OpenAI-style reasoning blocks ===
    // Format: <reasoning>...</reasoning>
    out = out.replace(/<reasoning[\s\S]*?<\/reasoning>/gi, '');

    // === Remove channel/role marker blocks (LM Studio, Ollama variants) ===
    // Pattern 1: <|channel|>analysis<|message|>...content...<|channel|>message<|message|>
    // This removes entire analysis/reasoning sections before the message channel
    out = out.replace(
      /<\|channel\|>\s*(?:analysis|reasoning|thinking|thought)\s*<\|message\|>[\s\S]*?(?=<\|channel\|>\s*message\s*<\|message\|>|<\|channel\|>\s*user\s*<\|message\|>|$)/gi,
      ''
    );

    // Pattern 2: Remove standalone channel markers and their content in sequence
    // Match: <|channel|>KEYWORD<|message|>...anything...<|message|>
    out = out.replace(
      /<\|channel\|>\s*(?:analysis|reasoning|thinking|thought|internal)\s*<\|message\|>[\s\S]*?<\|message\|>/gi,
      ''
    );

    // Pattern 3: Remove isolated channel markers
    out = out.replace(/<\|channel\|>/gi, '');
    out = out.replace(/<\|message\|>/gi, '');
    out = out.replace(/<\|endoftext\|>/gi, '');
    out = out.replace(/<\|start\|>/gi, '');
    out = out.replace(/<\|end\|>/gi, '');

    // === Remove HTML/XML style comments ===
    out = out.replace(/<!--[\s\S]*?-->/g, '');
    out = out.replace(/<!---[\s\S]*?--->/g, '');

    // === Remove template labels often injected by servers ===
    out = out.replace(/\*\*Final Answer:\*\*/gi, '');
    out = out.replace(/Final Answer:\s*/gi, '');
    out = out.replace(/\*\*Answer:\*\*/gi, '');
    out = out.replace(/^Answer:\s*/gim, '');
    out = out.replace(/\*\*Response:\*\*/gi, '');
    out = out.replace(/^Response:\s*/gim, '');

    // === Collapse excessive whitespace ===
    out = out.replace(/\n{3,}/g, '\n\n');
    out = out.replace(/^\s+|\s+$/g, '');

    return out.trim();
  }

  // Handle full chat history
  async queryChat(messages, context) {
    try {
      const settings = this.llmSettings;
      // Different handling based on service type
      // For simplicity, we map both LM Studio and OpenAI to the same generic handler
      // Ollama needs a slight adapter if it doesn't support standard OpenAI chat format perfectly,
      // but usually it does.
      return await this.queryGenericOpenAIChat(messages, context, settings.service);
    } catch (error) {
      console.error('LLM chat query failed:', error);
      throw new Error(`Failed to query LLM: ${error.message}`);
    }
  }

  async queryGenericOpenAIChat(messages, context, serviceName) {
    // Normalize endpoint URL
    let rawEndpoint = this.llmSettings.endpoint.trim();
    if (!rawEndpoint.match(/^https?:\/\//)) {
      rawEndpoint = `http://${rawEndpoint}`;
    }

    let baseUrl = rawEndpoint.replace(/\/$/, '');
    // Clean up base URL
    baseUrl = baseUrl.replace(/\/v1\/completions$/, '');
    baseUrl = baseUrl.replace(/\/v1\/chat\/completions$/, '');
    baseUrl = baseUrl.replace(/\/v1$/, '');

    const endpoint = `${baseUrl}/v1/chat/completions`;

    try {
      // Construct the messages payload
      // 1. System Prompt
      const systemPrompt = 'You are a helpful browser assistant. You answer questions based on the provided page context. You must respond with a valid JSON object containing a single field "answer". Example: { "answer": "Your response..." }. Ensure the JSON is valid and properly escaped. Do not include any markdown formatting outside the JSON. Do not include thinking or reasoning traces in the JSON output.';

      // 2. Context Message (inject as system or high priority user message)
      let contextContent = '';
      if (context.selection && context.selection.trim().length > 0) {
        contextContent = `Selected Text Context:\n${context.selection.substring(0, 15000)}`;
      } else {
        contextContent = `Page Context:\n${context.text.substring(0, 15000)}`;
      }

      const apiMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'system', content: contextContent }
      ];

      // 3. Append conversation history
      for (const msg of messages) {
        let role = 'user';
        if (msg._getType() === 'ai') role = 'assistant';
        else if (msg._getType() === 'system') role = 'system';

        apiMessages.push({
          role: role,
          content: msg.content
        });
      }

      // 4. Append JSON instruction reminder to the very last message to ensure adherence
      const lastMsg = apiMessages[apiMessages.length - 1];
      lastMsg.content += "\n\nRemember: Respond ONLY with valid JSON in the format { \"answer\": \"...\" }. Escape double quotes inside the answer string.";

      const payload = {
        model: this.llmSettings.model || 'local-model', // Fallback to 'local-model' if empty
        messages: apiMessages,
        max_tokens: 2048,
        temperature: 0.2,
        stream: false
      };

      // Add API key if present
      const headers = { 'Content-Type': 'application/json' };
      if (this.llmSettings.apiKey) {
        headers['Authorization'] = `Bearer ${this.llmSettings.apiKey}`;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.llmSettings.timeout || 300000);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(payload),
          signal: controller.signal
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
          rawContent = typeof data.response === 'string' ? data.response : JSON.stringify(data.response);
        }

        // Clean and Parse
        const cleanedContent = this.cleanLLMOutput(String(rawContent));
        const jsonResult = this.extractAndParseJSON(cleanedContent);

        if (jsonResult && jsonResult.answer) return jsonResult.answer;
        if (jsonResult && jsonResult.content) return jsonResult.content;

        // Regex Fallback
        const answerRegex = /(?:["']?answer["']?)\s*:\s*"((?:[^"\\]|\\.)*)"/s;
        const match = cleanedContent.match(answerRegex);
        if (match) {
             try { return JSON.parse(`"${match[1]}"`); } catch { return match[1]; }
        }

        console.warn('Could not extract JSON "answer" field, returning cleaned text');
        return cleanedContent;

      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error(`Request timed out after ${this.llmSettings.timeout || 300000}ms`);
        }
        throw error;
      }

    } catch (error) {
      console.error(`Chat query failed:`, error);
      throw error;
    }
  }


  // Parse JSON from LLM response, handling markdown blocks and loose text
  extractAndParseJSON(text) {
    if (!text) return null;

    let jsonStr = text;

    // 1. Try to extract from markdown code blocks
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    } else {
      // 2. If no code block, try to find the first { and last }
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');

      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = text.substring(firstBrace, lastBrace + 1);
      }
    }

    try {
      // Clean up any potential trailing commas or control characters if needed
      // (Basic parsing usually handles whitespace)
      return JSON.parse(jsonStr);
    } catch (e) {
      console.warn('Failed to parse JSON from LLM response:', e);
      return null;
    }
  }




  // Use LangGraph workflow instead of direct query
  async processWithLLM(tabId, userPrompt) {
    try {
      const context = await this.getContextForTab(tabId);
      if (!context) {
        throw new Error('No context available');
      }

      // Invoke the graph
      const result = await app.invoke({
        messages: [new HumanMessage(userPrompt)],
        context: context,
        settings: this.llmSettings
      });

      // Extract the final AI message
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
