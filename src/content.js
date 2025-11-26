function extractPageContext() {
  const context = {
    url: window.location.href,
    title: document.title,
    domain: new URL(window.location.href).hostname,
    text: '',
    selection: window.getSelection().toString(),
    headings: [],
    links: [],
    images: [],
    metadata: {},
    readability: {},
  };

  context.text = extractReadableText();
  context.metadata = extractMetadata();
  context.headings = extractHeadings();
  context.links = extractLinks();
  context.images = extractImages();
  context.readability = calculateReadability(context.text);

  return context;
}

function extractReadableText() {
  try {
    const bodyClone = document.body.cloneNode(true);

    const unwantedSelectors = [
      'script',
      'style',
      'noscript',
      'meta',
      'link',
      'header',
      'footer',
      'nav',
      'aside',
      'advertisement',
      '[class*="ad"]',
      '[id*="ad"]',
      '[class*="cookie"]',
      '[id*="cookie"]',
      '[class*="popup"]',
      '[id*="popup"]',
    ];

    unwantedSelectors.forEach((selector) => {
      const elements = bodyClone.querySelectorAll(selector);
      elements.forEach((el) => el.remove());
    });

    const mainContentSelectors = [
      'main',
      'article',
      '[role="main"]',
      '.content',
      '.post-content',
      '.entry-content',
      '.article-body',
      '#content',
      '#main',
      'body',
    ];

    let bestContent = null;
    let maxTextLength = 0;

    for (const selector of mainContentSelectors) {
      const elements = bodyClone.querySelectorAll(selector);
      if (elements.length > 0) {
        for (const element of elements) {
          const textLength = element.textContent.trim().length;
          if (textLength > maxTextLength) {
            maxTextLength = textLength;
            bestContent = element;
          }
        }
      }
    }

    const targetElement =
      bestContent && maxTextLength > 200 ? bestContent : bodyClone;

    return domToMarkdown(targetElement).substring(0, 15000);
  } catch (error) {
    console.error('Error extracting readable text:', error);
    return 'Failed to extract page content';
  }
}

function domToMarkdown(node) {
  let text = '';

  if (node.nodeType === Node.ELEMENT_NODE) {
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return '';
    }
  }

  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent.replace(/\s+/g, ' ');
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const tagName = node.tagName.toLowerCase();

    let childrenText = '';
    node.childNodes.forEach((child) => {
      childrenText += domToMarkdown(child);
    });

    switch (tagName) {
      case 'h1':
        return `\n\n# ${childrenText.trim()}\n\n`;
      case 'h2':
        return `\n\n## ${childrenText.trim()}\n\n`;
      case 'h3':
        return `\n\n### ${childrenText.trim()}\n\n`;
      case 'h4':
      case 'h5':
      case 'h6':
        return `\n\n#### ${childrenText.trim()}\n\n`;
      case 'p':
      case 'div':
        return `\n${childrenText.trim()}\n`;
      case 'br':
        return '\n';
      case 'li':
        return `\n- ${childrenText.trim()}`;
      case 'ul':
      case 'ol':
        return `\n${childrenText}\n`;
      case 'a':
        const href = node.getAttribute('href');
        return href ? ` [${childrenText.trim()}](${href}) ` : childrenText;
      case 'img':
        const alt = node.getAttribute('alt') || '';
        return alt ? ` [Image: ${alt}] ` : '';
      case 'code':
        return ` \`${childrenText}\` `;
      case 'pre':
        return `\n\`\`\`\n${childrenText}\n\`\`\`\n`;
      case 'blockquote':
        return `\n> ${childrenText.trim()}\n`;
      case 'strong':
      case 'b':
        return ` **${childrenText}** `;
      case 'em':
      case 'i':
        return ` *${childrenText}* `;
      default:
        return childrenText;
    }
  }

  return text;
}

function extractMetadata() {
  const metadata = {};

  try {
    const metaTags = document.querySelectorAll('meta');
    metaTags.forEach((tag) => {
      const name = tag.getAttribute('name') || tag.getAttribute('property');
      const content = tag.getAttribute('content');
      if (name && content) {
        metadata[name] = content;
      }
    });

    const ogData = {};
    const ogTags = document.querySelectorAll('meta[property^="og:"]');
    ogTags.forEach((tag) => {
      const property = tag.getAttribute('property');
      const content = tag.getAttribute('content');
      if (property && content) {
        ogData[property] = content;
      }
    });

    const twitterData = {};
    const twitterTags = document.querySelectorAll('meta[name^="twitter:"]');
    twitterTags.forEach((tag) => {
      const name = tag.getAttribute('name');
      const content = tag.getAttribute('content');
      if (name && content) {
        twitterData[name] = content;
      }
    });

    return {
      ...metadata,
      openGraph: ogData,
      twitter: twitterData,
      description:
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute('content') || '',
      keywords:
        document
          .querySelector('meta[name="keywords"]')
          ?.getAttribute('content') || '',
    };
  } catch (error) {
    console.error('Error extracting metadata:', error);
    return {};
  }
}

function extractHeadings() {
  try {
    const headings = [];
    const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');

    headingElements.forEach((heading, index) => {
      const text = heading.textContent.trim();
      if (text.length > 0) {
        headings.push({
          level: heading.tagName,
          text: text.substring(0, 200),
          id: heading.id || `heading-${index}`,
          position: {
            top: heading.getBoundingClientRect().top,
            left: heading.getBoundingClientRect().left,
          },
        });
      }
    });

    return headings;
  } catch (error) {
    console.error('Error extracting headings:', error);
    return [];
  }
}

function extractLinks() {
  try {
    const links = [];
    const linkElements = document.querySelectorAll('a[href]');

    const validLinks = Array.from(linkElements)
      .filter((link) => {
        const text = link.textContent.trim();
        return (
          text.length > 0 &&
          !text.includes('javascript:') &&
          !text.includes('mailto:') &&
          !link.href.includes('javascript:')
        );
      })
      .slice(0, 20);

    validLinks.forEach((link) => {
      const text = link.textContent.trim().substring(0, 100);
      const url = link.href;

      const title = link.title || '';

      links.push({
        text: text,
        url: url,
        title: title,
        position: {
          top: link.getBoundingClientRect().top,
          left: link.getBoundingClientRect().left,
        },
      });
    });

    return links;
  } catch (error) {
    console.error('Error extracting links:', error);
    return [];
  }
}

function extractImages() {
  try {
    const images = [];
    const imageElements = document.querySelectorAll('img[src]');

    const validImages = Array.from(imageElements)
      .filter((img) => {
        return (
          img.src &&
          (img.alt || img.title) &&
          !img.src.includes('data:image') &&
          img.naturalWidth > 10
        );
      })
      .slice(0, 10);

    validImages.forEach((img) => {
      images.push({
        alt: img.alt || img.title || '',
        src: img.src,
        width: img.naturalWidth,
        height: img.naturalHeight,
        position: {
          top: img.getBoundingClientRect().top,
          left: img.getBoundingClientRect().left,
        },
      });
    });

    return images;
  } catch (error) {
    console.error('Error extracting images:', error);
    return [];
  }
}

function calculateReadability(text) {
  try {
    if (!text) return {};

    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const characters = text.replace(/\s/g, '').length;

    const avgWordsPerSentence =
      sentences.length > 0 ? words.length / sentences.length : 0;
    const avgCharactersPerWord =
      words.length > 0 ? characters / words.length : 0;

    return {
      wordCount: words.length,
      sentenceCount: sentences.length,
      characterCount: characters,
      avgWordsPerSentence: Math.round(avgWordsPerSentence * 100) / 100,
      avgCharactersPerWord: Math.round(avgCharactersPerWord * 100) / 100,
      readabilityScore: calculateFleschReadingEase(
        words.length,
        sentences.length,
        characters
      ),
    };
  } catch (error) {
    console.error('Error calculating readability:', error);
    return {};
  }
}

function calculateFleschReadingEase(wordCount, sentenceCount, characterCount) {
  try {
    if (sentenceCount === 0 || wordCount === 0) return 0;

    const avgWordsPerSentence = wordCount / sentenceCount;
    const avgSyllablesPerWord =
      characterCount > 0 ? (characterCount / wordCount) * 0.5 : 0;

    const score =
      206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;
    return Math.max(0, Math.min(100, Math.round(score)));
  } catch (error) {
    console.error('Error calculating Flesch Reading Ease:', error);
    return 0;
  }
}

let selectionTimeout;
document.addEventListener('selectionchange', () => {
  if (selectionTimeout) clearTimeout(selectionTimeout);
  selectionTimeout = setTimeout(() => {
    const selection = window.getSelection().toString();
    if (selection) {
      try {
        browser.runtime.sendMessage({
          action: 'selectionChanged',
          selectionLength: selection.length,
          hasSelection: selection.length > 0,
        });
      } catch (e) {}
    } else {
      try {
        browser.runtime.sendMessage({
          action: 'selectionChanged',
          selectionLength: 0,
          hasSelection: false,
        });
      } catch (e) {}
    }
  }, 500);
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getPageContext') {
    try {
      const context = extractPageContext();
      sendResponse({ context });
    } catch (error) {
      console.error('Error in getPageContext:', error);
      sendResponse({ error: error.message });
    }
  }

  return true;
});

window.addEventListener('load', () => {
  try {
    const context = extractPageContext();
    browser.runtime.sendMessage({
      action: 'contextReady',
      data: context,
    });
  } catch (error) {
    console.error('Error sending initial context:', error);
  }
});
