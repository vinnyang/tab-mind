// content script to extract page context
(function() {
  // Extract text content from the current page
  function extractPageContent() {
    const title = document.title;
    const url = window.location.href;
    
    // Get main text content
    const bodyText = document.body.innerText || document.body.textContent || "";
    
    // Get meta description if available
    const metaDescription = document.querySelector('meta[name="description"]');
    const description = metaDescription ? metaDescription.getAttribute('content') : "";
    
    // Get headings
    const headings = [];
    const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headingElements.forEach(heading => {
      headings.push({
        level: heading.tagName,
        text: heading.innerText.trim()
      });
    });
    
    // Get links
    const links = [];
    const linkElements = document.querySelectorAll('a[href]');
    linkElements.forEach(link => {
      links.push({
        text: link.innerText.trim(),
        url: link.href
      });
    });
    
    return {
      title,
      url,
      description,
      textContent: bodyText.substring(0, 5000), // Limit to first 5k chars
      headings,
      links
    };
  }
  
  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getPageContext") {
      const context = extractPageContent();
      sendResponse({context: context});
    }
  });
})();
