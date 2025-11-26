# <img src="icon.svg" width="24" /> TabMind - Your Local Browser Agent 🧠

**Stop sending your browsing data to the cloud. Bring the AI to your browser.**

TabMind is a privacy-first browser extension that gives your browser a brain of its own. It connects directly to your **local** Large Language Models (like LM Studio or Ollama) to analyze web pages, summarize articles, and answer questions—all without your data ever leaving your machine.

---

## 🚀 Why TabMind?

*   **🔒 Private by Design**: Your data stays on localhost. Zero cloud leakage.
*   **⚡ Local Power**: Run 7B, 13B, or even 70B models on your own hardware.
*   **🧠 Context Aware**: It reads what you read. Select text to focus on specific paragraphs, or let it digest the whole page.

## ✨ Features

*   **Local LLM Integration**: Plug & play with LM Studio, Ollama, or any OpenAI-compatible local server.
*   **Smart Context Extraction**:
    *   **Full Page Mode**: Digests the entire article, blog post, or documentation page.
    *   **Precision Mode**: Highlight specific text, and TabMind instantly focuses on just that snippet.
*   **Interactive Sidebar**:
    *   **Chat**: Have a conversation with the page or any highlighted snippet.
    *   **Dynamic Chips**: Suggestions swap automatically between full-page and selection mode.
    *   **One-Click Copy**: Hover any AI response to copy the full answer instantly.
    *   **Customizable**: Dark mode, resizable width, optional page context pane, and toggleable system messages.
*   **Model Management**: Auto-detects your local models. Swap between Mistral, Llama 3, and DeepSeek in two clicks.
*   **Power User Settings**:
    *   Custom API endpoints.
    *   Configurable timeouts (because sometimes local 70B models need a minute to think).
    *   Fine-grained visibility controls for system messages and page context.

## 🛠️ Installation

1.  **Clone or Download** this repo.
2.  **Build it**:
    ```bash
    npm install
    npm run build
    ```
3.  **Load it** (Firefox only — this add-on relies on Firefox-specific APIs):
    *   Go to `about:debugging` > **This Firefox**.
    *   Click **Load Temporary Add-on…** and select `manifest.json`.

## 🎮 Usage Guide

### 1. Fire Up Your Model 🔥
Make sure your local server is running:
*   **LM Studio**: Start server on port `1234`. (Turn on CORS!)
*   **Ollama**: `ollama serve` (usually port `11434`).

### 2. Connect TabMind 🔗
*   Open the sidebar (click the icon).
*   Hit the **Gear Icon** ⚙️.
*   Enter your address (e.g., `http://localhost:1234/v1`).
*   Click **Detect Models** 🔄.
*   Pick your weapon of choice from the dropdown.

### 3. Chat Away 💬
*   **Analyze the Page**: "What is the main argument of this article?"
*   **Analyze a Selection**: Highlight a complex paragraph and ask, "Explain this in simple terms."
*   **Use Chips**: Click "Summarize" for a quick TL;DR (or swap to selection-specific actions).

## 🔌 Supported Backends

If it speaks "OpenAI API", TabMind understands it.
*   **LM Studio** (Highly Recommended for UI)
*   **Ollama** (Great for CLI lovers)
*   **LocalAI**
*   **vLLM**

## 👨‍💻 Development

Want to hack on it?
*   `src/background.js`: The brain. Handles API calls, timeouts, and LangGraph logic.
*   `src/content.js`: The eyes. Reads the DOM, extracts text, and watches for selections.
*   `src/sidebar.js`: The face. Manages the chat UI, settings, and those snappy suggestion chips.

## 📄 License

MIT. Go wild. build cool stuff.
