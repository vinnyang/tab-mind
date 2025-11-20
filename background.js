// background script to handle extension logic
chrome.browserAction.onClicked.addListener((tab) => {
  // Open the popup when clicking the extension icon
  chrome.tabs.create({
    url: chrome.runtime.getURL('popup.html'),
    active: true
  });
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getTabContext") {
    // Get the active tab
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs.length > 0) {
        const activeTab = tabs[0];
        
        // Send message to content script to get page context
        chrome.tabs.sendMessage(activeTab.id, {action: "getPageContext"}, (response) => {
          if (chrome.runtime.lastError) {
            console.error("Error getting context:", chrome.runtime.lastError);
            sendResponse({error: "Failed to get page context"});
          } else {
            sendResponse({context: response.context});
          }
        });
      } else {
        sendResponse({error: "No active tab found"});
      }
    });
    
    // Keep the message channel open for async response
    return true;
  }
});
