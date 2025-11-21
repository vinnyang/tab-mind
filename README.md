# TabMind - Browser Agent

TabMind is a Firefox extension that brings the power of local Large Language Models (LLMs) directly to your browsing experience. It allows you to chat with your current web page using models running locally on your machine (via LM Studio, Ollama, or other OpenAI-compatible endpoints).

## Features

- **Local LLM Integration**: Connects to your local inference server (e.g., LM Studio, Ollama) to process data without sending it to the cloud.
- **Page Context Extraction**: Automatically extracts and cleans the main content of the active tab (text, headings, links) to provide context for the LLM.
- **Interactive Sidebar**:
  - Chat interface to ask questions about the page.
  - Quick suggestion chips (Summarize, Key Points, Simplify, Critique, etc.).
  - Adjustable sidebar width.
- **Model Management**: Auto-detects available models from your local server and allows easy switching.
- **Customizable Endpoint**: Supports custom host/port configurations for different local servers.
- **Tokyo Night Theme**: A clean, dark-mode UI inspired by the Tokyo Night color scheme.

## Installation

1.  **Clone or Download** this repository to your local machine.
2.  Open Firefox and navigate to `about:debugging`.
3.  Click on **"This Firefox"** in the left sidebar.
4.  Click **"Load Temporary Add-on..."**.
5.  Navigate to the project directory and select the `manifest.json` file.
6.  The **TabMind** icon should appear in your toolbar.

## Usage

### 1. Start Your Local LLM Server

Ensure your local LLM server is running and accessible.

- **LM Studio**: Start the server (usually on port `1234`). Ensure CORS is enabled if necessary (though the extension runs in a privileged context).
- **Ollama**: Start Ollama (usually on port `11434`).

### 2. Open TabMind

Click the extension icon in the toolbar or use the keyboard shortcut (if configured) to open the sidebar.

### 3. Configure Connection

- In the sidebar header, enter your local server address (e.g., `localhost:1234`).
- Click the **Refresh** (circular arrow) icon to detect available models.
- Select your desired model from the dropdown.

### 4. Chat with the Page

- The extension automatically extracts the content of the current tab.
- Use the **Suggestion Chips** to quickly analyze the page (e.g., "Summarize", "Key Points").
- Or type your own question in the input box and hit **Send**.

## Supported Backends

TabMind works with any server providing an OpenAI-compatible API structure.

- **LM Studio** (Recommended for ease of use)
- **Ollama**
- **LocalAI**
- **Generic OpenAI-compatible endpoints**

## Permissions

- `activeTab`: To read the content of the current tab when you interact with the extension.
- `storage`: To save your preferences (endpoint URL, selected model).
- `scripting`: To inject the content extraction script.
- `tabs`: To communicate between the sidebar and the active tab.

## Development

- `background.js`: Handles API requests, LLM communication, and settings management.
- `content.js`: Runs on the web page to extract readable text and metadata.
- `sidebar.js` / `sidebar.html` / `sidebar.css`: Manages the UI and user interaction.

## License

MIT
