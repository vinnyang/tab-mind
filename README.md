# <img src="icon.svg" width="24" /> TabMind - Your Local Browser Agent 🧠

**Stop sending your browsing data to the cloud. Bring the AI to your browser.**

TabMind is a privacy-first browser extension that gives your browser a brain of its own. It connects directly to your **local** Large Language Models (like LM Studio or Ollama) to analyze web pages, summarize articles, and answer questions—all without your data ever leaving your machine.

---

## 🚀 Why TabMind?

*   **🔒 Private by Design**: Your data stays on localhost. Zero cloud leakage.
*   **⚡ Local Power**: Run 7B, 13B, or even 70B models on your own hardware.
*   **🧠 Context Aware**: It reads what you read. Select text to focus on specific paragraphs, or let it digest the whole page.
*   **🔑 API-key Providers**: Use OpenRouter or any OpenAI-compatible endpoint with locally stored keys (optional passphrase encryption).

## ✨ Features

*   **Local LLM Integration**: Plug & play with LM Studio, Ollama, or any OpenAI-compatible local server.
*   **Smart Context Extraction**:
    *   **Full Page Mode**: Digests the entire article, blog post, or documentation page.
      <img width="1832" height="1521" alt="image" src="https://github.com/user-attachments/assets/fab6dd88-dee2-4ef5-b7de-303170f48210" />

      <img width="1832" height="1521" alt="image" src="https://github.com/user-attachments/assets/26242d40-5f2e-4e7e-8583-416e45c60efc" />

    *   **Precision Mode**: Highlight specific text, and TabMind instantly focuses on just that snippet.
      <img width="1832" height="1521" alt="image" src="https://github.com/user-attachments/assets/b42c75f5-5c09-45a3-9e9b-e882e219a8b0" />


*   **Interactive Sidebar**:
    *   **Chat**: Have a conversation with the page or any highlighted snippet.
    *   **Dynamic Suggestions**: Suggestions swap automatically between full-page and selection mode.
    *   **One-Click Copy**: Hover any AI response to copy the full answer instantly.
    *   **Customizable**: Dark mode, resizable width, optional page context pane, and toggleable system messages.

    ![Screenshot 2025-11-25 at 22 04 29](https://github.com/user-attachments/assets/7c566a94-9a6e-4361-a6e2-683d7e782426)

    ![Screenshot 2025-11-25 at 21 55 12](https://github.com/user-attachments/assets/e9662e1f-1c3a-483b-bc33-07af293c9e17)

    ![Screenshot 2025-11-25 at 21 51 15](https://github.com/user-attachments/assets/91459ca6-f729-413d-aa23-c270f6f62b54)

    <img width="1832" height="1521" alt="image" src="https://github.com/user-attachments/assets/68dfc5ba-95a0-4165-a013-961fac114f4a" />


*   **Model Management**: Auto-detects your local models. Swap between Mistral, Llama 3, and DeepSeek in two clicks.
    <img width="532" height="210" alt="image" src="https://github.com/user-attachments/assets/787536b7-1d6e-4290-9da6-6f61c4555295" />
     ﻿
*   **Power User Settings**:
    *   Custom API endpoints.
    *   Configurable timeouts (because sometimes local 70B models need a minute to think).
    *   Fine-grained visibility controls for system messages and page context.
    <img width="458" height="571" alt="image" src="https://github.com/user-attachments/assets/3d97eb8d-0900-42df-97ff-a1a4c85d5087" />


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
*   Enter your address (e.g., `http://localhost:1234/v1` for local, or `https://openrouter.ai/api/v1` for OpenRouter).
*   Click **Detect Models** 🔄.
*   Pick your weapon of choice from the dropdown.

### 3. Chat Away 💬
*   **Analyze the Page**: "What is the main argument of this article?"
*   **Analyze a Selection**: Highlight a complex paragraph and ask, "Explain this in simple terms."
*   **Use Chips**: Click "Summarize" for a quick TL;DR (or swap to selection-specific actions).

## 🔌 Supported Backends

If it speaks "OpenAI API", TabMind understands it.
*   **LM Studio** (Highly Recommended for UI, default)
*   **Ollama** (Great for CLI lovers)
*   **LocalAI**
*   **vLLM**
*   **OpenRouter** (bring your API key)

### OpenRouter quick start
1. Get an API key from your OpenRouter dashboard.
2. Open Settings → set **Provider** to **OpenRouter**.
3. Paste your API key (optional: add a passphrase to encrypt it at rest). Keys stay in `browser.storage.local` only.
4. Click **Detect Models**.
5. Use the **search box** or **:free/:thinking filters** to find your preferred model.

Key handling:
- Keys are stored locally (no sync) and never exposed to pages.
- If you add a passphrase, the key is encrypted with WebCrypto (AES-GCM + PBKDF2) and decrypted only in-memory after you re-enter the passphrase.
- Use **Forget key** anytime to wipe stored credentials.

Troubleshooting:
- 401/403: verify the API key, passphrase unlock, and `HTTP-Referer`/`X-Title` values.
- 429: provider rate limited; wait or lower request rate.
- Stuck on “models”: confirm the endpoint is `https://openrouter.ai/api/v1` (or your custom base) and the key is set.

## 👨‍💻 Development

Want to hack on it?
*   `src/background.js`: The brain. Handles API calls, timeouts, and LangGraph logic.
*   `src/content.js`: The eyes. Reads the DOM, extracts text, and watches for selections.
*   `src/sidebar.js`: The face. Manages the chat UI, settings, and those snappy suggestion chips.

## 📄 License

MIT. Go wild. build cool stuff.
