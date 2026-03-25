
  function EmailNormalizer() {
  // Load html-to-text library
  function loadHtmlToText() {
    if (window.htmlToText) {
      console.log("html-to-text already loaded");
      return;
    }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/html-to-text@9.0.5/+esm";
    s.type = "module";
    document.head.appendChild(s);
    
    // Also load as regular script for compatibility
    const s2 = document.createElement("script");
    s2.src = "https://cdn.jsdelivr.net/npm/html-to-text@9.0.5/lib/index.js";
    document.head.appendChild(s2);
  }

  // Alternative: Use a simpler approach with a custom HTML parser
  // Since html-to-text might have module issues, let's use a CDN that works better
  function loadHtmlToTextLibrary() {
    return new Promise((resolve) => {
      if (window.htmlToText || window.convert) {
        resolve();
        return;
      }
      
      // Use unpkg CDN which provides UMD build
      const script = document.createElement("script");
      script.src = "https://unpkg.com/html-to-text@9.0.5/lib/index.js";
      script.onload = () => {
        // html-to-text exports as module, we'll use a custom converter instead
        resolve();
      };
      script.onerror = () => {
        // Fallback: use custom converter
        resolve();
      };
      document.head.appendChild(script);
    });
  }

  // Custom HTML to formatted text converter - professional formatting without markdown
  function htmlToFormattedText(htmlString) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlString;
    
    // Remove unwanted elements
    const unwanted = tempDiv.querySelectorAll('script, style, img, blockquote');
    unwanted.forEach(el => el.remove());
    
    // Remove links but keep their text
    const links = tempDiv.querySelectorAll('a');
    links.forEach(link => {
      const text = document.createTextNode(link.textContent);
      link.parentNode.replaceChild(text, link);
    });
    
    let result = [];
    
    // Helper function to process inline formatting (bold, italic, etc.)
    function processInlineNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();
        
        if (tagName === 'b' || tagName === 'strong') {
          // Bold text - keep as is (textareas can't show bold, but preserve the text)
          return node.textContent;
        } else if (tagName === 'i' || tagName === 'em') {
          // Italic text - format with underscores for visual indication
          return `_${node.textContent}_`;
        } else if (tagName === 'u') {
          // Underline - format with underscores
          return `_${node.textContent}_`;
        } else if (tagName === 'span' || tagName === 'a') {
          // Process children of span/link
          return Array.from(node.childNodes).map(processInlineNode).join('');
        } else {
          // For other inline elements, process children
          return Array.from(node.childNodes).map(processInlineNode).join('');
        }
      }
      return '';
    }
    
    function processNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (text.trim()) {
          result.push(text);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();
        
        // Headings - make BIG (uppercase) with proper spacing, NO markdown #
        if (tagName.match(/^h[1-6]$/)) {
          const headingText = node.textContent.trim();
          if (headingText) {
            // Add spacing before heading
            if (result.length > 0) {
              result.push('\n\n');
            }
            // Make heading BIG and uppercase
            result.push(headingText.toUpperCase());
            result.push('\n\n');
          }
        }
        // Paragraphs - simple formatted text
        else if (tagName === 'p') {
          const pContent = Array.from(node.childNodes)
            .map(processInlineNode)
            .join('')
            .trim();
          
          if (pContent) {
            // Add spacing before paragraph
            if (result.length > 0 && !result[result.length - 1].endsWith('\n\n')) {
              result.push('\n\n');
            }
            result.push(pContent);
            result.push('\n\n');
          }
        }
        // Bold text
        else if (tagName === 'b' || tagName === 'strong') {
          result.push(node.textContent);
        }
        // Italic text - format with underscores
        else if (tagName === 'i' || tagName === 'em') {
          result.push(`_${node.textContent}_`);
        }
        // Unordered lists
        else if (tagName === 'ul') {
          const items = node.querySelectorAll('li');
          items.forEach((item) => {
            const itemText = item.textContent.trim();
            if (itemText) {
              result.push('\n• ');
              // Process any inline formatting in list items
              result.push(Array.from(item.childNodes).map(processInlineNode).join(''));
            }
          });
          result.push('\n');
        }
        // Ordered lists
        else if (tagName === 'ol') {
          const items = node.querySelectorAll('li');
          items.forEach((item, index) => {
            const itemText = item.textContent.trim();
            if (itemText) {
              result.push(`\n${index + 1}. `);
              // Process any inline formatting in list items
              result.push(Array.from(item.childNodes).map(processInlineNode).join(''));
            }
          });
          result.push('\n');
        }
        // Line breaks
        else if (tagName === 'br') {
          result.push('\n');
        }
        // Divs - process children recursively
        else if (tagName === 'div') {
          Array.from(node.childNodes).forEach(child => processNode(child));
        }
        // Spans and other inline elements - process children
        else if (tagName === 'span' || tagName === 'a') {
          result.push(Array.from(node.childNodes).map(processInlineNode).join(''));
        }
        // Default: process children
        else {
          Array.from(node.childNodes).forEach(child => processNode(child));
        }
      }
    }
    
    // Process all child nodes
    Array.from(tempDiv.childNodes).forEach(child => processNode(child));
    
    let formattedText = result.join('');
    
    // Clean up excessive newlines and whitespace
    formattedText = formattedText
      .replace(/\n{3,}/g, '\n\n')  // Max 2 newlines
      .replace(/[ \t]+/g, ' ')     // Normalize spaces
      .replace(/\n /g, '\n')       // Remove spaces after newlines
      .replace(/ \n/g, '\n')       // Remove spaces before newlines
      .trim();
    
    return formattedText;
  }

  // Load library
  loadHtmlToTextLibrary();

  setTimeout(() => {
    let elementObserver = null;
    let elementCheckInterval = null;
    let urlCheckInterval = null;

    // Helper function to check if content contains HTML
    function containsHTML(text) {
      if (!text) return false;
      const htmlPattern = /<[a-z][\s\S]*>/i;
      return htmlPattern.test(text);
    }

    // Normalize email content function - processes a single element
    function normalizeSingleElement(el) {
      if (!el) {
        return false;
      }

      let raw = el.value || el.innerHTML || "";
      
      // Only process if content contains HTML tags
      if (!containsHTML(raw)) {
        return false;
      }

      /* 1️⃣ HARD CUT quoted replies (HTML + plain text safe) */
      raw = raw.split(/<div class="gmail_quote/i)[0];
      raw = raw.split(/On\s.+?wrote:/i)[0];
      raw = raw.split(/If you no longer wish to receive/i)[0];

      /* 2️⃣ Convert HTML → formatted text using custom converter */
      let cleanText = htmlToFormattedText(raw);

      /* 3️⃣ Normalize whitespace */
      cleanText = cleanText
        .replace(/\r/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]+/g, " ")
        .trim();

      /* 4️⃣ Fix glued words like "okOn Thu" */
      cleanText = cleanText.replace(/([a-z])On\s/i, "$1\n\n");

      /* 5️⃣ Click on textarea and paste the normalized text */
      // Focus and click on the element first
      el.focus();
      el.click();
      
      // Small delay to ensure focus is set
      setTimeout(() => {
        if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
          // Select all existing text
          el.select();
          el.setSelectionRange(0, el.value.length);
          
          // Simulate paste by using execCommand insertText
          try {
            // Try modern execCommand insertText first (most natural)
            if (document.execCommand && document.execCommand('insertText', false, cleanText)) {
              // Success - text inserted naturally
            } else {
              // Fallback: simulate paste event
              const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: new DataTransfer()
              });
              pasteEvent.clipboardData.setData('text/plain', cleanText);
              
              if (el.dispatchEvent(pasteEvent)) {
                // If paste event was not prevented, set value directly
                el.value = cleanText;
              }
              
              // Also trigger input event to notify any listeners
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          } catch (e) {
            // Final fallback: set value directly
            el.value = cleanText;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } else {
          // For contenteditable or other elements
          el.focus();
          
          try {
            // Select all content
            const range = document.createRange();
            range.selectNodeContents(el);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            
            // Try to insert text
            if (document.execCommand && document.execCommand('insertText', false, cleanText)) {
              // Success
            } else {
              el.innerText = cleanText;
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }
          } catch (e) {
            el.innerText = cleanText;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        
        console.log("Email content normalized and pasted successfully");
      }, 50);
      
      return true;
    }

    // Normalize email content function - handles all elements with the class
    function normalizeEmailContent(selector = ".hr-input__textarea-el") {
      // Get all elements with the class, not just the first one
      const elements = document.querySelectorAll(selector);
      
      if (elements.length === 0) {
        return false;
      }

      let processed = false;
      // Process each element
      elements.forEach((el) => {
        if (normalizeSingleElement(el)) {
          processed = true;
        }
      });

      return processed;
    }

    // Initialize email normalizer with mutation observer
    function initializeEmailNormalizer(targetElement) {
      if (!targetElement) return;

      // Clear existing observer if any
      if (elementObserver) {
        elementObserver.disconnect();
      }

      // Try to normalize immediately
      normalizeEmailContent();

      // Create mutation observer to watch for changes
      const config = { childList: true, subtree: true, characterData: true };
      elementObserver = new MutationObserver(() => {
        normalizeEmailContent();
      });

      elementObserver.observe(targetElement, config);
    }

    // Check for target element and initialize
    function checkAndInitializeElement() {
      const targetElement = document.querySelector('.hr-input__textarea-el');
      
      if (targetElement) {
        if (elementCheckInterval) {
          clearInterval(elementCheckInterval);
          elementCheckInterval = null;
        }
        initializeEmailNormalizer(targetElement);
        return true;
      }
      return false;
    }

    // Main function to load email normalizer
    function onLoadForEmailNormalizer() {
        console.log("Onload")
      const url = window.location.href;
      
      // Only proceed if URL contains "opportunities"
      if (!url.includes("opportunities")) {
        return;
      }

      // Clear any existing interval
      if (elementCheckInterval) {
        clearInterval(elementCheckInterval);
      }

      // Try to initialize immediately (no external library dependency needed)
      if (!checkAndInitializeElement()) {
        // If not found, check periodically
        elementCheckInterval = setInterval(() => {
          if (checkAndInitializeElement()) {
            // Successfully initialized, interval will be cleared in checkAndInitializeElement
          }
        }, 1000);
      }
    }

    // URL change detection
    function urlDetectForEmailNormalizer() {
      let initialPathname = window.location.pathname;
      let initialUrl = window.location.href;

      if (urlCheckInterval) {
        clearInterval(urlCheckInterval);
      }

      urlCheckInterval = setInterval(() => {
        const currentPathname = window.location.pathname;
        const currentUrl = window.location.href;
        
        if (currentPathname !== initialPathname || currentUrl !== initialUrl) {
          // URL changed, check if we should initialize
          onLoadForEmailNormalizer();
          
          // Update tracking variables
          initialPathname = currentPathname;
          initialUrl = currentUrl;
        }
      }, 500);
    }

    // Initial check
    function initialize() {
      // Check immediately
      onLoadForEmailNormalizer();
      
      // Set up URL change detection
      urlDetectForEmailNormalizer();
    }

    // Start initialization
    initialize();
  }, 1000);
}

EmailNormalizer();

