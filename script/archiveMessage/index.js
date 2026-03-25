function ArchiveMessageButton() {
  let elementObserver = null;
  let urlCheckInterval = null;

  function shouldRunOnArchiveMessagePage() {
    const url = window.location.href;
    const path = window.location.pathname || "";

    // This project uses these routes in other scripts for "contacts/conversations" pages.
    const isContactsOrConversations =
      path.includes("contacts/detail") ||
      url.includes("contacts/detail") ||
      path.includes("conversations") ||
      url.includes("conversations");

    // Optional extra guard: make sure the "Archive" anchor is present (or will be).
    // We still allow observer to run so it can catch the element when loaded.
    return isContactsOrConversations;
  }

  function cleanup() {
    if (elementObserver) {
      elementObserver.disconnect();
      elementObserver = null;
    }

    const existing = document.getElementById("custom-archive-btn");
    if (existing) existing.remove();
  }

  function createCustomArchiveButton() {
    // Prevent duplicate
    if (document.getElementById("custom-archive-btn")) return;

    // Find exact anchor element
    const archiveBtn = document.querySelector("#archive-conversation");
    if (!archiveBtn) return;

    // Get correct container
    const container = archiveBtn.parentElement;
    if (!container) return;

    // Create button
    const btn = document.createElement("div");
    btn.id = "custom-archive-btn";
    btn.className =
      "flex items-center justify-center hover:bg-gray-50 cursor-pointer transition-colors p-2 rounded-md";

    // Bigger icon
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" 
        fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"
        class="text-gray-600 w-7 h-7">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M4 7h16M5 7l1 12h12l1-12M9 11h6"/>
      </svg>
    `;

    btn.title = "Custom Archive";

    // Click event
    btn.addEventListener("click", () => {
      console.log("Custom Archive Clicked 🚀");
    });

    // Insert as FIRST button
    container.insertBefore(btn, container.firstChild);
  }

  function observeAndInject() {
    // Clear existing observer to avoid multiple observers piling up.
    if (elementObserver) {
      elementObserver.disconnect();
      elementObserver = null;
    }

    const observer = new MutationObserver(() => {
      createCustomArchiveButton();
    });

    elementObserver = observer;
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // Main function to load archive button
  function onLoadForArchiveMessage() {
    if (!shouldRunOnArchiveMessagePage()) {
      cleanup();
      return;
    }

    // Try immediately
    createCustomArchiveButton();

    // Keep re-injecting if WhatsApp re-renders the contact tab UI
    observeAndInject();
  }

  // URL change detection (SPA navigation)
  function urlDetectForArchiveMessage() {
    let initialPathname = window.location.pathname;
    let initialUrl = window.location.href;

    if (urlCheckInterval) {
      clearInterval(urlCheckInterval);
    }

    urlCheckInterval = setInterval(() => {
      const currentPathname = window.location.pathname;
      const currentUrl = window.location.href;

      if (currentPathname !== initialPathname || currentUrl !== initialUrl) {
        onLoadForArchiveMessage();
        initialPathname = currentPathname;
        initialUrl = currentUrl;
      }
    }, 500);
  }

  function initialize() {
    onLoadForArchiveMessage();
    urlDetectForArchiveMessage();
  }

  // Give the SPA a moment to render the contact tab anchor
  setTimeout(initialize, 1000);
}

ArchiveMessageButton();