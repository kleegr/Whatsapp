
  (function initConversationTicket() {
  var LOG = "[ConversationTicket]";
  var SIDEBAR_SELECTOR = "[data-v-3112ca94].flex.flex-col.items-center.gap-2";
  var CONTAINER_ID = "new-conversation-right-side-bar";
  var FALLBACK_CONTAINER_ID = "conversations-contact-details";
  var RIGHT_SIDEBAR_CLASS = "right-sidebar-container";
  var TARGET_SELECTOR = ".flex-1.h-full.relative.overflow-hidden.rounded-lg";
  var BTN_MARKER = "data-conversation-ticket-btn";
  var APP_BASE = "https://whatsapp-rk9i.onrender.com";

  function getPanelContainer() {
    return (
      document.getElementById(CONTAINER_ID) ||
      document.getElementById(FALLBACK_CONTAINER_ID) ||
      document.querySelector("." + RIGHT_SIDEBAR_CLASS) ||
      null
    );
  }

  /**
   * Resolve the panel content element where the iframe will be injected.
   * - #new-conversation-right-side-bar: .hr-config-provider > * > *
   * - .right-sidebar-container: first child's first child (same content slot as Activity panel)
   * - #conversations-contact-details: TARGET_SELECTOR or first child
   */
  function getPanelTarget(container) {
    if (!container) return null;
    if (container.id === CONTAINER_ID) {
      var provider = container.querySelector(".hr-config-provider");
      if (provider && provider.children[0] && provider.children[0].children[0]) {
        return provider.children[0].children[0];
      }
    }
    if (container.classList && container.classList.contains(RIGHT_SIDEBAR_CLASS)) {
      var first = container.children[0];
      if (first && first.children[0]) {
        return first.children[0];
      }
    }
    return container.querySelector(TARGET_SELECTOR) || (container.id === FALLBACK_CONTAINER_ID ? container.querySelector("[class*='h-full'][class*='w-full']") || container.firstElementChild : null);
  }

  var urlCheckInterval = null;
  var findInterval = null;

  var lastPathname = window.location.pathname;
  var lastUrl = window.location.href;

  function isRelevantPage() {
    return window.location.href.indexOf("v2/location") !== -1;
  }

  /**
   * Parse locationId from current URL path: /v2/location/{locationId}/...
   */
  function getLocationIdFromUrl() {
    var path = window.location.pathname || "";
    var m = path.match(/\/v2\/location\/([^/]+)/);
    return m ? m[1] : null;
  }

  /**
   * Parse conversationId from current URL path: .../conversations/conversations/{conversationId}
   */
  function getConversationIdFromUrl() {
    var path = window.location.pathname || "";
    var m = path.match(/\/conversations\/conversations\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  /**
   * Parse contactId from contact detail URL path: .../contacts/detail/{contactId}
   */
  function getContactIdFromContactDetailUrl() {
    var path = window.location.pathname || "";
    var m = path.match(/\/contacts\/detail\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  /**
   * Find conversation card by data-conversation-id and read contactid from it.
   * Returns contactId (from attribute contactid or contactId) or null.
   */
  function getContactIdFromConversationCard(conversationId) {
    if (!conversationId) return null;
    var el = document.querySelector('[data-conversation-id="' + conversationId + '"]');
    if (!el) return null;
    return el.getAttribute("contactid") || el.getAttribute("contactId") || null;
  }

  /**
   * Build ticketForContact iframe URL from current page URL and DOM.
   * Contact ID: from conversation card (conversations page) or from URL path (contacts/detail page).
   * Returns { url: string } or null if locationId or contactId cannot be resolved.
   */
  function buildTicketForContactUrl() {
    var locationId = getLocationIdFromUrl();
    var conversationId = getConversationIdFromUrl();
    var contactId = getContactIdFromConversationCard(conversationId);
    if (!contactId) {
      contactId = getContactIdFromContactDetailUrl();
    }
    if (!locationId || !contactId) {
      console.warn(LOG, "Missing locationId or contactId. locationId=" + locationId + " conversationId=" + conversationId + " contactId=" + contactId);
      return null;
    }
    var url = APP_BASE + "/ticketForContact/" + encodeURIComponent(contactId) + "?locationId=" + encodeURIComponent(locationId);
    return { url: url, locationId: locationId, contactId: contactId };
  }

  function cleanup() {
    if (urlCheckInterval) {
      clearInterval(urlCheckInterval);
      urlCheckInterval = null;
    }
    if (findInterval) {
      clearInterval(findInterval);
      findInterval = null;
    }
  }

  function addSidebarIcon() {
    var sidebar = document.querySelector(SIDEBAR_SELECTOR);
    if (!sidebar) return;
    if (sidebar.querySelector("[" + BTN_MARKER + "]")) return;

    var originalContent = null;
    var isActive = false;

    var newButton = document.createElement("button");
    newButton.setAttribute("data-v-3112ca94", "");
    newButton.setAttribute(BTN_MARKER, "true");
    newButton.className = "w-8 h-8 rounded-lg flex items-center justify-center sidebar-option-button text-gray-900 hover:text-blue-600";

    function deactivate() {
      if (!isActive) return;
      var container = getPanelContainer();
      var target = getPanelTarget(container);
      if (target && originalContent !== null) {
        target.innerHTML = originalContent;
        originalContent = null;
      }
      newButton.classList.remove("text-blue-600", "bg-white");
      newButton.classList.add("text-gray-900", "hover:text-blue-600");
      isActive = false;
    }

    function bindOtherButtons() {
      var allButtons = sidebar.querySelectorAll("button");
      for (var i = 0; i < allButtons.length; i++) {
        var btn = allButtons[i];
        if (btn !== newButton) {
          btn.addEventListener("click", function () {
            deactivate();
          });
        }
      }
    }

    newButton.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();

      var container = getPanelContainer();
      if (!container) {
        console.warn(LOG, "Container not found: #" + CONTAINER_ID + ", #" + FALLBACK_CONTAINER_ID + ", or ." + RIGHT_SIDEBAR_CLASS + ". Right panel may not be loaded yet.");
        return;
      }
      var target = getPanelTarget(container);
      if (!target) {
        console.warn(LOG, "Target not found: #new-conversation-right-side-bar .hr-config-provider > * > * (or fallback).");
        return;
      }
      if (isActive) {
        deactivate();
        return;
      }

      var built = buildTicketForContactUrl();
      if (!built) {
        originalContent = target.innerHTML;
        isActive = true;
        newButton.classList.remove("text-gray-900", "hover:text-blue-600");
        newButton.classList.add("text-blue-600", "bg-white");
        var allButtons = sidebar.querySelectorAll("button");
        for (var j = 0; j < allButtons.length; j++) {
          var b = allButtons[j];
          if (b !== newButton) {
            b.classList.remove("text-blue-600", "bg-white");
            b.classList.add("text-gray-900", "hover:text-blue-600");
          }
        }
        target.innerHTML = "<div class=\"p-4 text-gray-600 text-sm\">Could not load ticket. Open a conversation first.</div>";
        console.warn(LOG, "Could not build ticket URL. Ensure you are on a conversation page and the conversation card is loaded.");
        return;
      }

      originalContent = target.innerHTML;
      isActive = true;

      newButton.classList.remove("text-gray-900", "hover:text-blue-600");
      newButton.classList.add("text-blue-600", "bg-white");

      var allButtons = sidebar.querySelectorAll("button");
      for (var j = 0; j < allButtons.length; j++) {
        var b = allButtons[j];
        if (b !== newButton) {
          b.classList.remove("text-blue-600", "bg-white");
          b.classList.add("text-gray-900", "hover:text-blue-600");
        }
      }

      var iframe = document.createElement("iframe");
      iframe.src = built.url;
      iframe.style.cssText = "width:100%; height:100%; border:none; display:block;";
      target.innerHTML = "";
      target.appendChild(iframe);
      console.log(LOG, "iframe injected and custom button set as active.", built.url);
    });

    newButton.innerHTML =
      '<i data-v-3112ca94="" class="hr-icon-inner hr-icon" aria-label="Tickets" role="img" style="--n-bezier: cubic-bezier(.4, 0, .2, 1); font-size: 22px;">' +
      '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true">' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M3 7.5A2.5 2.5 0 015.5 5H18a1 1 0 01.894.553l2 4A1 1 0 0121 11a2 2 0 000 4 1 1 0 01.894 1.447l-2 4A1 1 0 0118 21H5.5A2.5 2.5 0 013 18.5V17a1 1 0 011-1 2 2 0 000-4 1 1 0 01-1-1V7.5z"/>' +
      '<path stroke-linecap="round" stroke-linejoin="round" d="M10 9h4M10 12h2M10 15h3"/>' +
      "</svg>" +
      "</i>";

    sidebar.appendChild(newButton);
    bindOtherButtons();
    console.log(LOG, "Sidebar icon added successfully.");
  }

  function onLoadForConversationTicket() {
    if (!isRelevantPage()) return;
    addSidebarIcon();
  }

  function startFindInterval() {
    if (findInterval) return;
    findInterval = setInterval(function () {
      if (!isRelevantPage()) return;
      addSidebarIcon();
    }, 700);
  }

  function urlDetectForConversationTicket() {
    if (urlCheckInterval) clearInterval(urlCheckInterval);
    urlCheckInterval = setInterval(function () {
      var currentPathname = window.location.pathname;
      var currentUrl = window.location.href;
      if (currentPathname !== lastPathname || currentUrl !== lastUrl) {
        console.log(LOG, "URL change detected, reinitializing...");
        lastPathname = currentPathname;
        lastUrl = currentUrl;
        if (isRelevantPage()) {
          initialize();
        } else {
          cleanup();
        }
      }
    }, 500);
  }

  function initialize() {
    cleanup();
    onLoadForConversationTicket();
    urlDetectForConversationTicket();
    if (isRelevantPage()) {
      startFindInterval();
    }
  }

  function interceptSPANavigation() {
    var originalPushState = history.pushState;
    var originalReplaceState = history.replaceState;

    history.pushState = function () {
      originalPushState.apply(history, arguments);
      setTimeout(function () {
        console.log(LOG, "SPA navigation (pushState), reinitializing...");
        initialize();
      }, 350);
    };

    history.replaceState = function () {
      originalReplaceState.apply(history, arguments);
      setTimeout(function () {
        console.log(LOG, "SPA navigation (replaceState), reinitializing...");
        initialize();
      }, 350);
    };

    window.addEventListener("popstate", function () {
      setTimeout(function () {
        console.log(LOG, "SPA navigation (popstate), reinitializing...");
        initialize();
      }, 350);
    });
  }

  interceptSPANavigation();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();

