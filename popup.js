// popup script to handle user interaction
document.addEventListener('DOMContentLoaded', () => {
  const queryInput = document.getElementById('query');
  const submitButton = document.getElementById('submit');
  const responseDiv = document.getElementById('response');
  
  // Handle form submission
  submitButton.addEventListener('click', async () => {
    const query = queryInput.value.trim();
    
    if (!query) {
      responseDiv.textContent = "Please enter a question.";
      return;
    }
    
    // Show loading state
    responseDiv.textContent = "Processing...";
    
    try {
      // Get page context from background script
      const response = await chrome.runtime.sendMessage({
        action: "getTabContext"
      });
      
      if (response.error) {
        responseDiv.textContent = "Error: " + response.error;
        return;
      }
      
      const context = response.context;
      
      // In a real implementation, you would send this to your local LLM
      // For now, we'll simulate a response based on the context
      
      const simulatedResponse = generateSimulatedResponse(query, context);
      responseDiv.textContent = simulatedResponse;
      
    } catch (error) {
      console.error("Error:", error);
      responseDiv.textContent = "Error processing request: " + error.message;
    }
  });
  
  // Generate a simulated response based on context (in real implementation, send to local LLM)
  function generateSimulatedResponse(query, context) {
    // This is a placeholder - in a real implementation you would:
    // 1. Send the context and query to your local LLM API
    // 2. Receive the response from the LLM
    // 3. Return that response
    
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes("title") || lowerQuery.includes("name")) {
      return `The page title is: "${context.title}"`;
    } else if (lowerQuery.includes("url")) {
      return `The page URL is: ${context.url}`;
    } else if (lowerQuery.includes("description")) {
      return `Page description: ${context.description || "No description available"}`;
    } else if (lowerQuery.includes("heading") || lowerQuery.includes("header")) {
      if (context.headings.length > 0) {
        return `Found headings: ${context.headings.map(h => h.text).join(', ')}`;
      } else {
        return "No headings found on this page.";
      }
    } else if (lowerQuery.includes("link") || lowerQuery.includes("url")) {
      if (context.links.length > 0) {
        return `Found ${context.links.length} links. First few: ${context.links.slice(0, 3).map(l => l.text).join(', ')}`;
      } else {
        return "No links found on this page.";
      }
    } else {
      // Default response
      return `I analyzed the page "${context.title}" and found ${context.textContent.length} characters of text. The page URL is ${context.url}. You asked: "${query}"`;
    }
  }
});
