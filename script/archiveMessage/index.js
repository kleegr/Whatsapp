function ArchiveMessageButton() {
  let elementObserver = null;
  let urlCheckInterval = null;

  const ARCHIVE_API_URL = "https://whatsapp.kleegr.com/api/whatsapp/archive-chat";

  function getLocationIdFromUrl() {
    const href = window.location.href;
    const path = window.location.pathname || "";
    let m = path.match(/\/v2\/location\/([a-zA-Z0-9]+)/);
    if (m) return m[1];
    m = path.match(/\/location\/([a-zA-Z0-9]+)/g);
    if (m && m.length) return m[m.length - 1].replace(/\/location\//, "");
    m = href.match(/[?&]locationId=([a-zA-Z0-9]+)/);
    if (m) return m[1];
    return null;
  }

  /** Contact detail URL: .../contacts/detail/{contactId} */
  function getContactIdFromContactDetailUrl() {
    const path = window.location.pathname || "";
    const m = path.match(/\/contacts\/detail\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  function getCookieValue(cookieName) {
    const cookies = document.cookie.split(";");
    for (let cookie of cookies) {
      const [name, value] = cookie.split("=").map((part) => part.trim());
      if (name === cookieName) {
        return decodeURIComponent(value);
      }
    }
    return null;
  }

  async function getDataFromLocalStorage(apiUrl) {
    const accessToken = getCookieValue("m_a");
    if (!accessToken) {
      console.error("Access token not found in cookies.");
      return null;
    }
    try {
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          authorization: `Bearer ${accessToken}`,
          channel: "APP",
          source: "WEB_USER",
          version: "2021-07-28",
        },
      });
      if (!response.ok) {
        throw new Error(
          `API request failed with status ${response.status}: ${response.statusText}`
        );
      }
      return await response.json();
    } catch (error) {
      console.error("Error during API call:", error);
      return null;
    }
  }

  function getPhoneFromContactPayload(data) {
    const c = data && (data.contact || data);
    if (!c) return null;
    const p = c.phone;
    if (p != null && String(p).trim()) return String(p).trim();
    const arr = c.phones;
    if (Array.isArray(arr) && arr.length > 0) {
      const first = arr[0];
      const num = first && (first.phone || first.number || first);
      if (num != null && String(num).trim()) return String(num).trim();
    }
    if (c.phoneNumber != null && String(c.phoneNumber).trim()) {
      return String(c.phoneNumber).trim();
    }
    return null;
  }

  /** Green-API private chat id: digits only + @c.us */
  function phoneToChatId(phone) {
    if (!phone) return null;
    const digits = String(phone).replace(/\D/g, "");
    if (!digits) return null;
    return digits + "@c.us";
  }

  async function getCurrentUserId() {
    try {
      if (
        window.AppUtils &&
        window.AppUtils.Utilities &&
        typeof window.AppUtils.Utilities.getCurrentUser === "function"
      ) {
        const userInfo = await window.AppUtils.Utilities.getCurrentUser();
        console.log("userInfo", userInfo);
        if (!userInfo) return null;
        return (
          userInfo.id ||
          userInfo.userId ||
          (userInfo.user && userInfo.user.id) ||
          null
        );
      }
    } catch (e) {
      console.warn("getCurrentUser failed", e);
    }
    return null;
  }

  function showArchiveToast(message, isError) {
    const id = "custom-archive-toast";
    let el = document.getElementById(id);
    if (el) el.remove();
    el = document.createElement("div");
    el.id = id;
    el.textContent = message;
    el.style.cssText = [
      "position:fixed",
      "bottom:24px",
      "left:50%",
      "transform:translateX(-50%)",
      "z-index:2147483647",
      "padding:12px 20px",
      "border-radius:8px",
      "font-size:14px",
      "font-family:system-ui,-apple-system,sans-serif",
      "box-shadow:0 4px 12px rgba(0,0,0,0.15)",
      isError ? "background:#fef2f2;color:#b91c1c;border:1px solid #fecaca" : "background:#ecfdf5;color:#047857;border:1px solid #a7f3d0",
    ].join(";");
    document.body.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 4000);
  }

  async function handleCustomArchiveClick(btn) {
    const locationId = getLocationIdFromUrl();
    console.log("locationId", locationId);
    if (!locationId) {
      showArchiveToast("Could not read location from URL.", true);
      return;
    }

    const contactId = getContactIdFromContactDetailUrl();
    if (!contactId) {
      showArchiveToast(
        "Open a contact (contacts/detail/…) to archive this chat.",
        true
      );
      return;
    }
    console.log("contactId", contactId);
    const prevPointer = btn.style.pointerEvents;
    btn.style.pointerEvents = "none";
    btn.style.opacity = "0.6";

    try {
      const userId = await getCurrentUserId();
      const contactUrl = `https://backend.leadconnectorhq.com/contacts/${encodeURIComponent(contactId)}`;
      const contactJson = await getDataFromLocalStorage(contactUrl);
      console.log("contactJson", contactJson);
      if (!contactJson) {
        showArchiveToast("Could not load contact details.", true);
        return;
      }
      const phone = getPhoneFromContactPayload(contactJson);
      console.log("phone", phone);
      const chatId = phoneToChatId(phone);
      console.log("chatId", chatId);
      if (!chatId) {
        showArchiveToast(
          "No phone number on this contact — cannot build WhatsApp chat id.",
          true
        );
        return;
      }

      const payload = {
        locationId,
        chatId,
        ...(userId ? { userId } : {}),
      };

      const res = await fetch(ARCHIVE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (res.ok && json.success !== false) {
        showArchiveToast("Chat archived.", false);
      } else {
        const msg =
          (json && (json.error || json.details)) ||
          res.statusText ||
          "Archive failed";
        showArchiveToast(String(msg), true);
      }
    } catch (e) {
      console.error("Archive chat error:", e);
      showArchiveToast(
        (e && e.message) || "Something went wrong while archiving.",
        true
      );
    } finally {
      btn.style.pointerEvents = prevPointer || "";
      btn.style.opacity = "";
    }
  }

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

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleCustomArchiveClick(btn);
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