
function attachContactSelector() {

  // Deployed API base (so this works even when script runs on another domain)
  const API_BASE = "https://whatsapp-rk9i.onrender.com";

  /* =========================
     1) HELPER: Get Cookie
  ==========================*/
  function getCookieValue(cookieName) {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      const [name, value] = cookie.split('=').map(part => part.trim());
      if (name === cookieName) {
        return decodeURIComponent(value);
      }
    }
    return null;
  }

  /* =========================
     Get locationId from current GHL URL (works for location and agency)
  ==========================*/
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

  /* =========================
     Normalize phone from contact (GHL can use phone, phones[], etc.)
  ==========================*/
  function getContactPhone(c) {
    if (!c) return null;
    const p = c.phone;
    if (p != null && String(p).trim()) return String(p).trim();
    const arr = c.phones;
    if (Array.isArray(arr) && arr.length > 0) {
      const first = arr[0];
      const num = (first && (first.phone || first.number || first));
      if (num != null && String(num).trim()) return String(num).trim();
    }
    if (c.phoneNumber != null && String(c.phoneNumber).trim()) return String(c.phoneNumber).trim();
    return null;
  }

  function getContactTarget(c) {
    if (!c) return null;
    if (c.type === "group" && (c.groupId || c.id)) return String(c.groupId || c.id).trim();
    return getContactPhone(c);
  }

  /* =========================
     Contact cache: avoid refetching on every Forward open. Keyed by locationId.
  ==========================*/
  if (typeof window.__forwardMessageContactCache === "undefined") {
    window.__forwardMessageContactCache = {};
  }

  /* =========================
     Reply mode: swap GHL send button with our WhatsApp reply send button.
     When user clicks Reply, we enter reply mode. User types, then clicks our send.
  ==========================*/
  if (typeof window.__replyModeContext === "undefined") {
    window.__replyModeContext = null;
  }

  function getGhlSendButton() {
    return document.querySelector("#conv-send-button-simple") ||
      document.querySelector("[data-testid='send-button']") ||
      document.querySelector(".conv-send-button") ||
      document.querySelector("[class*='send'][class*='button']");
  }

  function createOurReplySendButton(onClick) {
    const btn = document.createElement("div");
    btn.id = "wp-reply-send-button";
    btn.className = "flex items-center justify-center cursor-pointer hover:bg-primary-700";
    btn.style.cssText = "padding: 4px 6px;";
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" aria-hidden="true" class="w-4 h-4 text-white outline-none"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 13.5L21 3M10.627 13.828l2.628 6.758c.232.596.347.893.514.98a.5.5 0 00.462 0c.167-.086.283-.384.515-.979l6.59-16.888c.21-.537.315-.806.258-.977a.5.5 0 00-.316-.316c-.172-.057-.44.048-.978.257L3.413 9.253c-.595.233-.893.349-.98.516a.5.5 0 000 .461c.087.167.385.283.98.514l6.758 2.629c.121.046.182.07.233.106a.5.5 0 01.116.117c.037.05.06.111.107.232z"></path></svg>`;
    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    };
    return btn;
  }

  function exitReplyMode() {
    const ctx = window.__replyModeContext;
    if (!ctx) return;
    if (ctx._keydownHandler) {
      document.removeEventListener("keydown", ctx._keydownHandler, true);
    }
    if (ctx.ghlSendButton) {
      ctx.ghlSendButton.style.display = "";
      ctx.ghlSendButton.style.visibility = "";
    }
    if (ctx.ourSendButton && ctx.ourSendButton.parentNode) {
      ctx.ourSendButton.remove();
    }
    window.__replyModeContext = null;
  }

  function getMessagePreviewFromEl(msgEl) {
    if (!msgEl) return "";
    var content = msgEl.querySelector(".chat-content");
    if (!content) content = msgEl;
    // Clone so we don't mutate DOM; remove nested quoted block so we only get the immediate message text
    // (e.g. when replying to a replied message, quote only "Click" not "Alright got it\nClick")
    var clone = content.cloneNode(true);
    var nestedQuote = clone.querySelector(".ghl-quoted-reply-block");
    if (nestedQuote) nestedQuote.remove();
    var text = (clone.textContent || clone.innerText || "").trim();

    // When replying/forwarding a forwarded message, strip only the "Forwarded" label line
    text = text.replace(/^\s*Forwarded\s*(?:to\s+[^\n]+?)?\s*\n?/i, "").trim();

    // If there's no text (e.g. pure image/document), fall back to an attachment label so
    // the quoted block and forwarded ghost message still show something meaningful.
    if (!text) {
      var hasImage = content.querySelector("img[src]") != null;
      var hasFileLink = content.querySelector("a[href*='storage'], a[href*='media'], [data-url]") != null;
      if (hasImage) text = "Photo";
      else if (hasFileLink) text = "Attachment";
    }

    return text.length > 200 ? text.slice(0, 200) + "…" : text;
  }

  function enterReplyMode(messageData, ghlMsgId, quotedTextPreview, retryCount) {
    retryCount = retryCount || 0;
    if (retryCount > 15) {
      console.warn("[ForwardMessage] GHL send button not found after retries");
      return;
    }
    exitReplyMode();
    const ghlBtn = getGhlSendButton();
    if (!ghlBtn) {
      setTimeout(function () { enterReplyMode(messageData, ghlMsgId, quotedTextPreview, retryCount + 1); }, 200);
      return;
    }
    ghlBtn.style.display = "none";
    ghlBtn.style.visibility = "hidden";
    const ourBtn = createOurReplySendButton(function () {
      sendReplyFromComposer(messageData, ghlMsgId, quotedTextPreview);
    });
    ghlBtn.parentNode.insertBefore(ourBtn, ghlBtn.nextSibling);
    window.__replyModeContext = { messageData, ghlMsgId, quotedTextPreview: quotedTextPreview || "", ghlSendButton: ghlBtn, ourSendButton: ourBtn };
    const composer = document.querySelector("#composer-textarea textarea") || document.querySelector("#composer-textarea [contenteditable='true']");
    if (composer) {
      composer.focus();
    }
    var onComposerKeydown = function (e) {
      if (!window.__replyModeContext) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        sendReplyFromComposer(messageData, ghlMsgId);
      }
    };
    document.addEventListener("keydown", onComposerKeydown, true);
    window.__replyModeContext._keydownHandler = onComposerKeydown;
  }

  var WHATSAPP_ICON_URL = "msgsndr-private.storage.googleapis.com/oauthclient/696177c8dbdd5128097e6e12/e6d736b5-e7fa-43e0-b4d5-8aab7d88e0ab.png";

  function getMessageAttachmentsForForward(msgEl) {
    const root = msgEl.querySelector(".chat-content") || msgEl;
    if (!root) return [];
    const urls = [];
    const imgs = root.querySelectorAll("img[src]");
    imgs.forEach(function (img) {
      const src = (img.src || img.getAttribute("src") || "").trim();
      if (src && !src.startsWith("data:") && (src.includes("http") || src.includes("storage") || src.includes("media"))) {
        if (src.indexOf(WHATSAPP_ICON_URL) === -1 && !urls.includes(src)) urls.push(src);
      }
    });
    const links = root.querySelectorAll("a[href*='storage'], a[href*='media'], [data-url]");
    links.forEach(function (el) {
      const url = el.href || el.getAttribute("href") || el.getAttribute("data-url") || "";
      if (url && url.indexOf(WHATSAPP_ICON_URL) === -1 && !urls.includes(url)) urls.push(url);
    });
    return urls;
  }

  function getComposerAttachments() {
    const composer = document.querySelector("#composer-textarea") || document.querySelector("#message-composer") || document.querySelector("[data-composer]");
    if (!composer) return [];
    const imgs = composer.querySelectorAll("img[src]");
    const urls = [];
    imgs.forEach(function (img) {
      const src = (img.src || img.getAttribute("src") || "").trim();
      if (src && !src.startsWith("data:") && (src.includes("http") || src.includes("storage") || src.includes("media"))) {
        if (src.indexOf(WHATSAPP_ICON_URL) === -1) urls.push(src);
      }
    });
    const links = composer.querySelectorAll("a[href*='storage'], a[href*='media'], [data-url]");
    links.forEach(function (el) {
      const url = el.href || el.getAttribute("href") || el.getAttribute("data-url") || "";
      if (url && url.indexOf(WHATSAPP_ICON_URL) === -1 && !urls.includes(url)) urls.push(url);
    });
    return urls;
  }

  async function sendReplyFromComposer(messageData, ghlMsgId, quotedTextPreview) {
    const composerTextarea = document.querySelector("#composer-textarea textarea") || document.querySelector("#composer-textarea [contenteditable='true']");
    const replyText = composerTextarea ? (composerTextarea.value || composerTextarea.innerText || "").trim() : "";
    const attachments = getComposerAttachments();
    if (!replyText && attachments.length === 0) return;
    const chatId = messageData.fromChatId || messageData.toChatId;
    if (!chatId) return;
    var preview = quotedTextPreview;
    if (preview === undefined && window.__replyModeContext) preview = window.__replyModeContext.quotedTextPreview;
    const ourBtn = window.__replyModeContext && window.__replyModeContext.ourSendButton;
    if (ourBtn) ourBtn.style.pointerEvents = "none";
    try {
      const payload = {
        locationId: messageData.locationId,
        chatId,
        message: replyText || "",
        quotedMessageId: messageData.wpMsgId,
      };
      if (preview) payload.quotedTextPreview = String(preview).trim().slice(0, 500);
      if (attachments.length > 0) payload.attachments = attachments;
      const sendRes = await fetch(`${API_BASE}/api/whatsapp/reply-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const sendJson = await sendRes.json().catch(function () { return {}; });
      if (sendRes.ok && sendJson.success !== false) {
        if (composerTextarea) {
          if ("value" in composerTextarea) composerTextarea.value = "";
          else composerTextarea.innerText = "";
        }
        exitReplyMode();
      } else {
        console.error("[ForwardMessage][Reply] Send failed:", sendJson);
        if (ourBtn) ourBtn.style.pointerEvents = "";
      }
    } catch (err) {
      console.error("[ForwardMessage][Reply] Error:", err);
      if (ourBtn) ourBtn.style.pointerEvents = "";
    }
  }
  const CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

  function getContactCache(locationId) {
    const entry = window.__forwardMessageContactCache[locationId];
    if (!entry) return null;
    if (entry.timestamp && Date.now() - entry.timestamp > CACHE_MAX_AGE_MS) return null;
    return entry;
  }

  function setContactCache(locationId, data) {
    window.__forwardMessageContactCache[locationId] = {
      list: data.list || [],
      page: data.page != null ? data.page : 1,
      hasMore: data.hasMore !== false,
      inProgress: false,
      timestamp: Date.now(),
    };
  }

  /* =========================
     Fetch ONE page of contacts (with phone only). Used for first load + load more on scroll.
  ==========================*/
  const LIMIT = 50;
  const headersForContacts = function () {
    const accessToken = getCookieValue("m_a");
    return {
      "Accept": "application/json",
      "Authorization": "Bearer " + (accessToken || ""),
      "channel": "APP",
      "source": "WEB_USER",
      "version": "2021-07-28",
    };
  };

  async function fetchContactsPage(locationId, page) {
    const accessToken = getCookieValue("m_a");
    if (!accessToken) return { contactsWithPhone: [], hasMore: false };

    const url = `https://backend.leadconnectorhq.com/contacts/?locationId=${encodeURIComponent(locationId)}&limit=${LIMIT}&page=${page}`;
    try {
      const res = await fetch(url, { method: "GET", headers: headersForContacts() });
      if (!res.ok) return { contactsWithPhone: [], hasMore: false };
      const data = await res.json();
      const contacts = data.contacts || [];
      const withPhone = contacts.filter(function (c) { return getContactPhone(c) != null; });
      const hasMore = contacts.length >= LIMIT;
      return { contactsWithPhone: withPhone, hasMore: hasMore };
    } catch (err) {
      console.error("Contacts Fetch Error:", err);
      return { contactsWithPhone: [], hasMore: false };
    }
  }

  /* =========================
     Fetch groups from our API (for Forward list).
  ==========================*/
  async function fetchGroupsForForward(locationId) {
    try {
      const res = await fetch(
        `${API_BASE}/api/whatsapp/groups?locationId=${encodeURIComponent(locationId)}`
      );
      const json = await res.json().catch(function () { return {}; });
      if (json.success && Array.isArray(json.data)) return json.data;
      return [];
    } catch (err) {
      console.error("[ForwardMessage] Fetch groups error:", err);
      return [];
    }
  }

  /* =========================
     Get contacts + groups for Forward: use cache or fetch.
  ==========================*/
  async function getContactsForForward() {
    const accessToken = getCookieValue("m_a");
    if (!accessToken) {
      return { list: [], page: 1, hasMore: false };
    }

    const locationId = getLocationIdFromUrl();
    if (!locationId) {
      return { list: [], page: 1, hasMore: false };
    }

    const cached = getContactCache(locationId);

    if (cached && cached.list.length > 0) {
      return { list: cached.list, page: cached.page, hasMore: cached.hasMore, fromCache: true };
    }

    const entry = window.__forwardMessageContactCache[locationId];
    if (entry && entry.inProgress) {
      return { list: entry.list || [], page: entry.page || 1, hasMore: entry.hasMore || false };
    }

    if (entry) entry.inProgress = true;
    const [first, groups] = await Promise.all([
      fetchContactsPage(locationId, 1),
      fetchGroupsForForward(locationId),
    ]);
    const merged = (groups || []).concat(first.contactsWithPhone || []);
    setContactCache(locationId, {
      list: merged,
      page: 1,
      hasMore: first.hasMore,
    });
    return { list: merged, page: 1, hasMore: first.hasMore };
  }

  /* =========================
     Load next page and append to cache + return new items (for scroll).
  ==========================*/
  async function loadMoreContacts(locationId) {
    const entry = window.__forwardMessageContactCache[locationId];
    if (!entry || entry.inProgress || !entry.hasMore) return [];

    entry.inProgress = true;
    const nextPage = entry.page + 1;
    const result = await fetchContactsPage(locationId, nextPage);

    entry.inProgress = false;
    entry.list = entry.list.concat(result.contactsWithPhone);
    entry.page = nextPage;
    entry.hasMore = result.hasMore;
    return result.contactsWithPhone;
  }

  /* =========================
     3) CREATE UI FOR EACH MESSAGE
  ==========================*/

  const messageEls = document.querySelectorAll('[data-message-id]');

  if (!messageEls.length) {
    console.warn("No messages with data-message-id found");
    return;
  }

  messageEls.forEach((messageEl) => {
    // Only append button for messages that contain the specific image icon
    const targetImg = messageEl.querySelector(
      'img[src="https://msgsndr-private.storage.googleapis.com/oauthclient/696177c8dbdd5128097e6e12/e6d736b5-e7fa-43e0-b4d5-8aab7d88e0ab.png"]'
    );
    if (!targetImg) return;

    if (messageEl.querySelector(".message-menu-wrapper")) return;

    // Create 3-dot menu button
    const menuBtn = document.createElement("button");
    menuBtn.className = "message-menu-btn";
    menuBtn.innerHTML = `
      <span class="menu-dots">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </span>
    `;
    menuBtn.title = "Message options";

    // Create dropdown menu
    const dropdownMenu = document.createElement("div");
    dropdownMenu.className = "message-menu-dropdown hidden";

    // Reply menu item
    const replyMenuItem = document.createElement("div");
    replyMenuItem.className = "menu-item menu-item-reply";
    replyMenuItem.innerHTML = `
      <span class="menu-item-icon">↻</span>
      <span class="menu-item-text">Reply</span>
    `;

    // Forward menu item
    const forwardMenuItem = document.createElement("div");
    forwardMenuItem.className = "menu-item menu-item-forward";
    forwardMenuItem.innerHTML = `
      <span class="menu-item-icon">↪</span>
      <span class="menu-item-text">Forward</span>
      <span class="menu-item-arrow">›</span>
    `;

    dropdownMenu.appendChild(replyMenuItem);
    dropdownMenu.appendChild(forwardMenuItem);

    // Nested submenu: contact list (shown when Forward is clicked)
    const contactSubmenu = document.createElement("div");
    contactSubmenu.className = "menu-submenu contact-submenu hidden";

    const submenuHeader = document.createElement("div");
    submenuHeader.className = "submenu-header";
    submenuHeader.innerHTML = `
      <span class="submenu-back" title="Back">‹</span>
      <span class="submenu-title">Forward to</span>
    `;

    const searchWrap = document.createElement("div");
    searchWrap.className = "contact-search-wrap";
    searchWrap.style.cssText = "padding: 6px 10px; border-bottom: 1px solid #f1f5f9;";
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search contacts (min 3 characters)";
    searchInput.className = "contact-search-input";
    searchInput.style.cssText = "width: 100%; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 13px; box-sizing: border-box;";
    searchWrap.appendChild(searchInput);

    const contactList = document.createElement("div");
    contactList.className = "contact-list";

    const contactListScroll = document.createElement("div");
    contactListScroll.className = "contact-list-scroll";

    contactSubmenu.appendChild(submenuHeader);
    contactSubmenu.appendChild(searchWrap);
    contactSubmenu.appendChild(contactList);
    contactList.appendChild(contactListScroll);

    dropdownMenu.appendChild(contactSubmenu);

    // Wrapper container
    const wrapper = document.createElement("div");
    wrapper.className = "message-menu-wrapper";

    wrapper.appendChild(menuBtn);
    wrapper.appendChild(dropdownMenu);

    const container =
      messageEl.querySelector(".message-container") || messageEl;
    container.appendChild(wrapper);

    // Store message element reference for handlers
    const ghlMsgId = messageEl.getAttribute("data-message-id");

    /* =========================
       4) MENU BUTTON CLICK - TOGGLE DROPDOWN
    ==========================*/

    function showMainMenu() {
      replyMenuItem.classList.remove("hidden");
      forwardMenuItem.classList.remove("hidden");
      contactSubmenu.classList.add("hidden");
    }

    function showContactSubmenu() {
      replyMenuItem.classList.add("hidden");
      forwardMenuItem.classList.add("hidden");
      contactSubmenu.classList.remove("hidden");
    }

    menuBtn.onclick = (e) => {
      e.stopPropagation();
      const isHidden = dropdownMenu.classList.contains("hidden");
      
      // Close all other open menus first
      document.querySelectorAll(".message-menu-dropdown").forEach(menu => {
        if (menu !== dropdownMenu) {
          menu.classList.add("hidden");
          menu.querySelector(".contact-submenu")?.classList.add("hidden");
          menu.querySelectorAll(".menu-item").forEach(mi => mi.classList.remove("hidden"));
        }
      });

      if (isHidden) {
        dropdownMenu.classList.remove("hidden");
        menuBtn.classList.add("active");
        showMainMenu();
      } else {
        dropdownMenu.classList.add("hidden");
        menuBtn.classList.remove("active");
      }
    };

    submenuHeader.onclick = (e) => {
      e.stopPropagation();
      showMainMenu();
    };

    /* =========================
       5) REPLY MENU ITEM CLICK LOGIC
    ==========================*/

    replyMenuItem.onclick = async (e) => {
      e.stopPropagation();
      dropdownMenu.classList.add("hidden");
      menuBtn.classList.remove("active");

      if (!ghlMsgId) {
        console.error("Message id not found on element");
        return;
      }

      try {
        replyMenuItem.classList.add("loading");
        const mapRes = await fetch(
          `${API_BASE}/api/whatsapp/get-ghl-message?ghlMsgId=${encodeURIComponent(ghlMsgId)}`
        );
        if (!mapRes.ok) throw new Error("Failed to fetch message mapping");
        const mapJson = await mapRes.json();
        if (!mapJson.success || !mapJson.data) throw new Error(mapJson.error || "Message mapping not found");

        const messageData = mapJson.data;
        const chatId = messageData.fromChatId || messageData.toChatId;
        if (!chatId) {
          console.error("WhatsApp chatId not found");
          replyMenuItem.classList.remove("loading");
          return;
        }

        var quotedTextPreview = getMessagePreviewFromEl(messageEl);
        enterReplyMode(messageData, ghlMsgId, quotedTextPreview);
        replyMenuItem.classList.remove("loading");
      } catch (err) {
        console.error("Error entering reply mode:", err);
        replyMenuItem.classList.remove("loading");
      }
    };

    /* =========================
       Render one contact row (used for initial list + append on scroll)
    ==========================*/
    function renderContactItem(c) {
      const item = document.createElement("div");
      item.className = "contact-item";
      const target = getContactTarget(c);
      const isGroup = c.type === "group" || (c.groupId || (c.id && String(c.id).includes("@g.us")));
      const label = c.contactName || c.firstName || c.name || c.email || (target || "") || "Unknown";
      const avatar = isGroup ? "👥" : (label.charAt(0) || "?").toUpperCase();
      item.innerHTML = `
        <span class="contact-item-avatar">${avatar}</span>
        <span class="contact-item-label">${escapeHtml(label)}${isGroup ? " (Group)" : ""}</span>
      `;
      item.dataset.contact = JSON.stringify({ ...c, phone: getContactPhone(c), groupId: c.groupId || (isGroup ? c.id : null), type: isGroup ? "group" : "contact" });
      return item;
    }

    function renderLoadMoreRow() {
      const row = document.createElement("div");
      row.className = "contact-item contact-item-load-more";
      row.innerHTML = "<span class=\"contact-item-load-more-text\">Loading more…</span>";
      return row;
    }

    /* =========================
       6) FORWARD MENU ITEM CLICK LOGIC – use cache or first page only
    ==========================*/

    let cachedInitialList = [];
    let cachedHasMore = false;
    let searchDebounceTimer = null;

    function renderContactList(list, hasMore) {
      contactListScroll.innerHTML = "";
      removeLoadMoreTrigger(contactListScroll);
      const validList = list.filter(function (c) { return getContactTarget(c); });
      if (validList.length === 0) {
        const empty = document.createElement("div");
        empty.className = "contact-item contact-item-empty";
        empty.textContent = "No contacts or groups";
        contactListScroll.appendChild(empty);
      } else {
        validList.forEach(function (c) {
          contactListScroll.appendChild(renderContactItem(c));
        });
        if (hasMore) {
          appendLoadMoreTrigger(contactListScroll);
        }
      }
    }

    async function doSearchContacts(query) {
      const locationId = getLocationIdFromUrl();
      if (!locationId) {
        renderContactList([], false);
        return;
      }
      contactListScroll.innerHTML = "";
      const loadingRow = document.createElement("div");
      loadingRow.className = "contact-item contact-item-empty";
      loadingRow.textContent = "Searching…";
      contactListScroll.appendChild(loadingRow);
      try {
        const res = await fetch(
          `${API_BASE}/api/contacts/search?locationId=${encodeURIComponent(locationId)}&query=${encodeURIComponent(query)}&appId=696177c8dbdd5128097e6e12`
        );
        const json = await res.json().catch(function () { return {}; });
        if (!res.ok) {
          renderContactList([], false);
          const empty = contactListScroll.querySelector(".contact-item-empty");
          if (empty) empty.textContent = "Search failed";
          return;
        }
        const raw = json.data || [];
        const filtered = raw.filter(function (c) { return getContactTarget(c); });
        renderContactList(filtered, false);
      } catch (err) {
        console.error("[ForwardMessage] Search contacts error:", err);
        renderContactList([], false);
        const empty = contactListScroll.querySelector(".contact-item-empty");
        if (empty) empty.textContent = "Search failed";
      }
    }

    searchInput.addEventListener("input", function () {
      const q = (searchInput.value || "").trim();
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      if (q.length >= 3) {
        searchDebounceTimer = setTimeout(function () {
          searchDebounceTimer = null;
          doSearchContacts(q);
        }, 350);
      } else {
        renderContactList(cachedInitialList, cachedHasMore);
      }
    });

    searchInput.addEventListener("keydown", function (e) {
      e.stopPropagation();
    });

    forwardMenuItem.onclick = async (e) => {
      e.stopPropagation();

      searchInput.value = "";
      searchInput.placeholder = "Search contacts (min 3 characters)";

      forwardMenuItem.classList.add("loading");
      const result = await getContactsForForward();
      forwardMenuItem.classList.remove("loading");

      cachedInitialList = result.list || [];
      cachedHasMore = !!result.hasMore;
      renderContactList(cachedInitialList, cachedHasMore);

      showContactSubmenu();
      setTimeout(function () { searchInput.focus(); }, 50);
    };

    /* =========================
       Append "Load more" trigger (sentinel + optional button). Called after initial list and after each load.
    ==========================*/
    function appendLoadMoreTrigger(containerEl) {
      var sentinel = containerEl.querySelector(".contact-load-more-sentinel");
      if (sentinel) return;
      sentinel = document.createElement("div");
      sentinel.className = "contact-load-more-sentinel";
      sentinel.setAttribute("aria-hidden", "true");
      containerEl.appendChild(sentinel);

      var btnWrap = document.createElement("div");
      btnWrap.className = "contact-load-more-btn-wrap";
      btnWrap.innerHTML = "<button type=\"button\" class=\"contact-load-more-btn\">Load more contacts</button>";
      containerEl.appendChild(btnWrap);

      btnWrap.querySelector("button").onclick = function () {
        doLoadMore(containerEl);
      };

      if (typeof IntersectionObserver !== "undefined") {
        var io = new IntersectionObserver(
          function (entries) {
            var en = entries[0];
            if (!en || !en.isIntersecting) return;
            doLoadMore(containerEl);
          },
          { root: containerEl, rootMargin: "100px", threshold: 0 }
        );
        io.observe(sentinel);
        containerEl._loadMoreObserver = io;
      }
    }

    function removeLoadMoreTrigger(containerEl) {
      var s = containerEl.querySelector(".contact-load-more-sentinel");
      if (s) s.remove();
      var wrap = containerEl.querySelector(".contact-load-more-btn-wrap");
      if (wrap) wrap.remove();
      if (containerEl._loadMoreObserver) {
        containerEl._loadMoreObserver.disconnect();
        containerEl._loadMoreObserver = null;
      }
    }

    function doLoadMore(containerEl) {
      var locationId = getLocationIdFromUrl();
      var entry = window.__forwardMessageContactCache[locationId];
      if (!entry || entry.inProgress || !entry.hasMore) return;

      var btnWrap = containerEl.querySelector(".contact-load-more-btn-wrap");
      var loadMoreRow = renderLoadMoreRow();
      if (btnWrap) {
        btnWrap.style.display = "none";
      }
      containerEl.appendChild(loadMoreRow);

      loadMoreContacts(locationId)
        .then(function (newContacts) {
          loadMoreRow.remove();
          if (btnWrap) btnWrap.style.display = "";

          var oldSentinel = containerEl.querySelector(".contact-load-more-sentinel");
          if (oldSentinel) oldSentinel.remove();
          var oldWrap = containerEl.querySelector(".contact-load-more-btn-wrap");
          if (oldWrap) oldWrap.remove();
          if (containerEl._loadMoreObserver) {
            containerEl._loadMoreObserver.disconnect();
            containerEl._loadMoreObserver = null;
          }

          newContacts.forEach(function (c) {
            containerEl.appendChild(renderContactItem(c));
          });

          if (entry.hasMore) {
            appendLoadMoreTrigger(containerEl);
          }
        })
        .catch(function () {
          loadMoreRow.remove();
          if (btnWrap) btnWrap.style.display = "";
          if (entry) entry.inProgress = false;
          appendLoadMoreTrigger(containerEl);
        });
    }

    /* =========================
       7) CONTACT ITEM CLICK -> FORWARD MESSAGE (delegated)
    ==========================*/

    contactListScroll.addEventListener("click", async (e) => {
      const item = e.target.closest(".contact-item");
      if (!item || item.classList.contains("contact-item-empty") || item.classList.contains("contact-item-load-more")) return;

      const contactData = JSON.parse(item.dataset.contact || "{}");

      if (!ghlMsgId) {
        // alert("Message id not found on element");
        return;
      }

      try {
        item.classList.add("loading");
        const mapRes = await fetch(
          `${API_BASE}/api/whatsapp/get-ghl-message?ghlMsgId=${encodeURIComponent(ghlMsgId)}`
        );

        if (!mapRes.ok) throw new Error("Failed to fetch message mapping");
        const mapJson = await mapRes.json();
        if (!mapJson.success || !mapJson.data) throw new Error(mapJson.error || "Message mapping not found");

        const { wpMsgId, fromChatId, locationId } = mapJson.data;

        let targetChatId = null;
        const target = getContactTarget(contactData);
        if (target) {
          if (contactData.type === "group" || (contactData.groupId || String(target).includes("@g.us"))) {
            targetChatId = String(target).includes("@") ? target : target + "@g.us";
          } else {
            let raw = String(target).trim();
            if (raw.endsWith("@c.us")) targetChatId = raw;
            else {
              if (raw.startsWith("+")) raw = raw.slice(1);
              targetChatId = raw.includes("@") ? raw : `${raw}@c.us`;
            }
          }
        }

        if (!targetChatId) {
          item.classList.remove("loading");
          return;
        }

        var messagePreview = getMessagePreviewFromEl(messageEl);
        var forwardAttachments = getMessageAttachmentsForForward(messageEl);
        var toContactName = contactData.contactName || contactData.firstName || contactData.name || contactData.label || "";
        const fwdRes = await fetch(`${API_BASE}/api/whatsapp/forward-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locationId,
            fromChatId,
            toChatId: targetChatId,
            wpMsgId,
            messagePreview: messagePreview ? String(messagePreview).slice(0, 300) : undefined,
            toContactName: toContactName ? String(toContactName).trim() : undefined,
            attachments: forwardAttachments && forwardAttachments.length > 0 ? forwardAttachments.slice(0, 3) : undefined,
          }),
        });

        const fwdJson = await fwdRes.json();
        item.classList.remove("loading");

        if (!fwdRes.ok || fwdJson.success === false) {
          console.error("Forward message failed:", fwdJson);
          // alert("Failed to forward message");
          return;
        }

        console.log("Forward message result:", fwdJson);
        dropdownMenu.classList.add("hidden");
        menuBtn.classList.remove("active");
        showMainMenu();
        // alert("Message forwarded successfully ✅");
      } catch (err) {
        console.error("Error during forward flow:", err);
        // alert("Something went wrong while forwarding the message");
        item.classList.remove("loading");
      }
    });
  });

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /* =========================
     8) CLICK OUTSIDE TO CLOSE MENU
  ==========================*/

  if (!window.messageMenuClickHandlerAdded) {
    window.messageMenuClickHandlerAdded = true;
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".message-menu-wrapper")) {
        document.querySelectorAll(".message-menu-dropdown").forEach(menu => {
          menu.classList.add("hidden");
          const sub = menu.querySelector(".contact-submenu");
          if (sub) sub.classList.add("hidden");
          menu.querySelectorAll(".menu-item").forEach(mi => mi.classList.remove("hidden"));
        });
        document.querySelectorAll(".message-menu-btn").forEach(btn => btn.classList.remove("active"));
      }
    });
  }

  /* =========================
     9) STYLES
  ==========================*/

  if (!document.getElementById("message-menu-style")) {
    const s = document.createElement("style");
    s.id = "message-menu-style";

    s.innerHTML = `
      .message-menu-wrapper{
        margin-left:8px;
        display:inline-flex;
        align-items:center;
        position:relative;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      }

      .message-menu-btn{
        background:transparent;
        border:none;
        width:28px;
        height:28px;
        border-radius:6px;
        cursor:pointer;
        display:flex;
        align-items:center;
        justify-content:center;
        transition:background 0.15s ease, color 0.15s ease;
        padding:0;
      }

      .message-menu-btn:hover{
        background:rgba(0,0,0,0.06);
      }

      .message-menu-btn.active{
        background:rgba(59,130,246,0.08);
      }

      .menu-dots{
        display:flex;
        flex-direction:column;
        gap:2px;
        align-items:center;
        justify-content:center;
      }

      .menu-dots .dot{
        width:3px;
        height:3px;
        border-radius:50%;
        background:#9ca3af;
        transition:background 0.2s ease;
      }

      .message-menu-btn:hover .menu-dots .dot,
      .message-menu-btn.active .menu-dots .dot{
        background:#3b82f6;
      }

      .message-menu-dropdown{
        position:absolute;
        top:100%;
        left:0;
        margin-top:4px;
        background:#fff;
        border-radius:8px;
        box-shadow:0 2px 8px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04);
        min-width:140px;
        padding:4px;
        z-index:10000;
        animation:menuFadeInDown 0.18s ease-out;
      }

      @keyframes menuFadeInDown{
        from{
          opacity:0;
          transform:translateY(-4px);
        }
        to{
          opacity:1;
          transform:translateY(0);
        }
      }

      .menu-item{
        display:flex;
        align-items:center;
        gap:8px;
        padding:8px 10px;
        border-radius:6px;
        cursor:pointer;
        transition:background 0.12s ease, color 0.12s ease;
        font-size:13px;
        color:#374151;
        user-select:none;
        font-weight:500;
      }

      .menu-item:hover{
        background:#f1f5f9;
        color:#1e293b;
      }

      .menu-item:active{
        background:#e2e8f0;
      }

      .menu-item.loading{
        opacity:0.6;
        cursor:wait;
        pointer-events:none;
      }

      .menu-item-icon{
        font-size:14px;
        display:flex;
        align-items:center;
        justify-content:center;
        width:18px;
        flex-shrink:0;
      }

      .menu-item-reply .menu-item-icon{
        color:#3b82f6;
      }

      .menu-item-forward .menu-item-icon{
        color:#16a34a;
      }

      .menu-item-text{
        flex:1;
        font-weight:500;
        letter-spacing:0.01em;
      }

      .menu-item-arrow{
        font-size:12px;
        color:#94a3b8;
        font-weight:400;
      }

      .menu-submenu.contact-submenu{
        padding:0;
        min-width:200px;
        max-width:260px;
      }

      .submenu-header{
        display:flex;
        align-items:center;
        gap:6px;
        padding:8px 10px;
        border-bottom:1px solid #f1f5f9;
        cursor:pointer;
        background:#f8fafc;
        border-radius:8px 8px 0 0;
        transition:background 0.12s ease;
        user-select:none;
      }

      .submenu-header:hover{
        background:#f1f5f9;
      }

      .submenu-back{
        font-size:16px;
        color:#64748b;
        font-weight:600;
        line-height:1;
      }

      .submenu-title{
        font-size:12px;
        font-weight:600;
        color:#475569;
        letter-spacing:0.02em;
      }

      .contact-list{
        max-height:220px;
        overflow:hidden;
        border-radius:0 0 8px 8px;
      }

      .contact-list-scroll{
        overflow-y:auto;
        overflow-x:hidden;
        max-height:220px;
        padding:4px;
      }

      .contact-list-scroll::-webkit-scrollbar{
        width:6px;
      }

      .contact-list-scroll::-webkit-scrollbar-track{
        background:#f1f5f9;
        border-radius:3px;
      }

      .contact-list-scroll::-webkit-scrollbar-thumb{
        background:#cbd5e1;
        border-radius:3px;
      }

      .contact-item{
        display:flex;
        align-items:center;
        gap:10px;
        padding:8px 10px;
        border-radius:6px;
        cursor:pointer;
        transition:background 0.12s ease, color 0.12s ease;
        font-size:13px;
        color:#334155;
        user-select:none;
      }

      .contact-item:hover{
        background:#f1f5f9;
        color:#0f172a;
      }

      .contact-item:active{
        background:#e2e8f0;
      }

      .contact-item.loading{
        opacity:0.7;
        pointer-events:none;
      }

      .contact-item-avatar{
        width:28px;
        height:28px;
        border-radius:50%;
        background:linear-gradient(135deg,#3b82f6,#2563eb);
        color:#fff;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:12px;
        font-weight:600;
        flex-shrink:0;
      }

      .contact-item-label{
        flex:1;
        min-width:0;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .contact-item-empty{
        cursor:default;
        color:#94a3b8;
        justify-content:center;
        padding:12px;
      }

      .contact-item-empty:hover{
        background:transparent;
      }

      .contact-item-load-more{
        justify-content:center;
        color:#64748b;
        cursor:default;
      }
      .contact-item-load-more:hover{ background:transparent; }
      .contact-load-more-sentinel{
        height:1px;
        min-height:0;
        visibility:hidden;
        pointer-events:none;
      }
      .contact-load-more-btn-wrap{
        padding:6px 10px;
        text-align:center;
      }
      .contact-load-more-btn{
        background:#f1f5f9;
        border:1px solid #e2e8f0;
        border-radius:6px;
        padding:6px 12px;
        font-size:12px;
        color:#475569;
        cursor:pointer;
        width:100%;
        max-width:200px;
      }
      .contact-load-more-btn:hover{
        background:#e2e8f0;
        color:#334155;
      }

      .hidden{
        display:none !important;
      }
    `;

    document.head.appendChild(s);
  }
}
(function initForwardMessageScript() {
let loc_id = "";
let urlCheckInterval = null;
let locationCheckInterval = null;
let bodyObserver = null;

function getLocationId(url) {
  if (!url) return null;
  const path = (url.indexOf("?") >= 0 ? url.slice(0, url.indexOf("?")) : url) || "";
  let m = path.match(/\/v2\/location\/([a-zA-Z0-9]+)/);
  if (m) return m[1];
  m = path.match(/\/location\/([a-zA-Z0-9]+)/g);
  if (m && m.length) return m[m.length - 1].replace(/\/location\//, "");
  m = url.match(/[?&]locationId=([a-zA-Z0-9]+)/);
  if (m) return m[1];
  return null;
}

const SCRIPT_API_BASE = "https://whatsapp-rk9i.onrender.com";

/** WhatsApp-style forwarded icon: right-pointing forward arrow (grey), like WhatsApp */
function createForwardedIconSVG() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("style", "flex-shrink: 0; vertical-align: middle;");
  // Single curved arrow pointing right (forward)
  svg.innerHTML = '<path fill="#8696a0" d="M12.5 2.5L11 4h-2c-3.3 0-6 2.7-6 6v1h1.5v-1c0-2.5 2-4.5 4.5-4.5h2l-1.5 1.5 1.1 1.1 3.4-3.4-3.4-3.4-1.1 1.1z"/>';
  return svg;
}

/**
 * For each message with [data-message-id], fetch quoted-message API; if forwarded, inject
 * a "Forwarded" label (icon + text) at the top of the bubble; if reply, inject "Quoted ..." block.
 */
function injectQuotedBlocks() {
  const items = document.querySelectorAll("[data-message-id]");
  items.forEach((el) => {
    if (el.getAttribute("data-quoted-checked")) return;
    el.setAttribute("data-quoted-checked", "1");
    const ghlMsgId = el.getAttribute("data-message-id");
    if (!ghlMsgId) return;
    fetch(`${SCRIPT_API_BASE}/api/whatsapp/quoted-message?ghlMsgId=${encodeURIComponent(ghlMsgId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) return;
        const bubble = el.querySelector(".chat-bubble-inbound, .chat-bubble-outbound, [class*='chat-bubble']");
        if (!bubble) return;
        const content = bubble.querySelector(".chat-content");
        if (!content) return;

        // 1) Forwarded label at top (icon + "Forwarded" or "Forwarded to [name]" in grey)
        if ((data.isForwarded || data.isForwardedOut) && !content.querySelector(".ghl-forwarded-label")) {
          const forwardedBlock = document.createElement("div");
          forwardedBlock.className = "ghl-forwarded-label";
          forwardedBlock.style.cssText = "display: flex; align-items: center; gap: 4px; margin-bottom: 4px; color: #8696a0; font-size: 12px; line-height: 1.3;";
          forwardedBlock.appendChild(createForwardedIconSVG());
          var labelText = data.isForwardedOut && data.forwardedToName ? "Forwarded to " + data.forwardedToName : "Forwarded";
          forwardedBlock.appendChild(document.createTextNode(labelText));
          const insertBefore = content.firstElementChild;
          if (insertBefore) content.insertBefore(forwardedBlock, insertBefore);
          else content.appendChild(forwardedBlock);
        }

        // 2) Quoted reply block below forwarded (if any)
        if (data.isReply && (data.quotedText || (data.quotedAttachments && data.quotedAttachments.length)) && !content.querySelector(".ghl-quoted-reply-block")) {
          const quotedBlock = document.createElement("div");
          quotedBlock.className = "ghl-quoted-reply-block";
          quotedBlock.style.cssText = "display: flex; align-items: flex-start; gap: 8px; background: #f3f4f6; border-radius: 6px; padding: 6px 10px; margin-bottom: 6px; color: #111827; font-size: 13px; line-height: 1.4;";
          const arrow = document.createElement("span");
          arrow.setAttribute("aria-hidden", "true");
          arrow.style.cssText = "flex-shrink: 0; margin-top: 1px;";
          arrow.innerHTML = "<svg width=\"14\" height=\"14\" viewBox=\"0 0 16 16\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M10 4 L4 8 L10 12\" stroke=\"#25D366\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>";
          quotedBlock.appendChild(arrow);
          const innerWrap = document.createElement("div");
          innerWrap.style.cssText = "display: flex; align-items: center; gap: 8px;";

          // Optional small media thumbnail for quoted attachments (first URL only)
          if (Array.isArray(data.quotedAttachments) && data.quotedAttachments.length > 0) {
            const firstUrl = String(data.quotedAttachments[0]);
            const thumbWrap = document.createElement("div");
            thumbWrap.style.cssText = "width: 40px; height: 40px; border-radius: 4px; overflow: hidden; flex-shrink: 0; background: #e5e7eb; display: flex; align-items: center; justify-content: center;";
            if (/\.(jpe?g|png|gif|webp)$/i.test(firstUrl)) {
              const img = document.createElement("img");
              img.src = firstUrl;
              img.alt = "media";
              img.style.width = "100%";
              img.style.height = "100%";
              img.style.objectFit = "cover";
              thumbWrap.appendChild(img);
            } else {
              const icon = document.createElement("span");
              icon.textContent = "📎";
              icon.style.fontSize = "16px";
              thumbWrap.appendChild(icon);
            }
            innerWrap.appendChild(thumbWrap);
          }

          const textEl = document.createElement("span");
          const text = (data.quotedText || "").trim();
          textEl.textContent = text.length > 200 ? text.slice(0, 200) + "…" : text || (Array.isArray(data.quotedAttachments) && data.quotedAttachments.length ? "Media" : "");
          innerWrap.appendChild(textEl);

          quotedBlock.appendChild(innerWrap);
          const firstChild = content.firstElementChild;
          if (firstChild) content.insertBefore(quotedBlock, firstChild);
          else content.appendChild(quotedBlock);
        }
      })
      .catch(() => {});
  });
}

let lastPathname = window.location.pathname;
let lastLocationId = getLocationId(window.location.href);
let readTicksInterval = null;

function cleanup() {
  if (urlCheckInterval) {
    clearInterval(urlCheckInterval);
    urlCheckInterval = null;
  }
  if (locationCheckInterval) {
    clearInterval(locationCheckInterval);
    locationCheckInterval = null;
  }
  if (readTicksInterval) {
    clearInterval(readTicksInterval);
    readTicksInterval = null;
  }
  if (bodyObserver) {
    bodyObserver.disconnect();
    bodyObserver = null;
  }
}

/** Inject CSS once for our read-tick icon (GHL often does not render a native tick). */
function ensureReadTicksStyle() {
  if (document.getElementById("ghl-read-ticks-style")) return;
  const style = document.createElement("style");
  style.id = "ghl-read-ticks-style";
  style.textContent = [
    ".ghl-message-read svg path { fill: #25D366 !important; }",
    ".ghl-message-read svg { color: #25D366 !important; }",
    ".ghl-injected-read-tick, .ghl-injected-sent-tick { display: inline-flex !important; align-items: center !important; margin-left: 4px !important; vertical-align: middle !important; }",
    ".ghl-injected-read-tick svg, .ghl-injected-sent-tick svg { width: 14px !important; height: 14px !important; flex-shrink: 0 !important; }",
    ".ghl-injected-sent-tick svg path { fill: #8696a0 !important; }",
    ".ghl-message-read .ghl-injected-sent-tick svg path { fill: #25D366 !important; }"
  ].join("\n");
  document.head.appendChild(style);
}

var TICK_PATH = "M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.266c.143.14.361.125.484-.033l6.272-8.052a.366.366 0 0 0-.063-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.892 7.77a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.255 3.185c.143.14.361.125.484-.033l6.272-8.052a.365.365 0 0 0-.063-.51z";

/** WhatsApp-style double check SVG (green when read, grey when sent). */
function createReadTickSvg() {
  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 11");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "ghl-read-tick-svg");
  svg.style.fill = "#25D366";
  svg.innerHTML = "<path d=\"" + TICK_PATH + "\"/>";
  return svg;
}

/** Grey double-check for "sent" state (turns green via CSS when parent has .ghl-message-read). */
function createSentTickSvg() {
  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 11");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "ghl-sent-tick-svg");
  svg.innerHTML = "<path d=\"" + TICK_PATH + "\"/>";
  return svg;
}

function getTickInsertPoint(el) {
  var row = el.querySelector(".flex.justify-end") || el.querySelector("[class*='justify-end']");
  if (!row) {
    var menuBtn = el.querySelector("[data-testid='MESSAGE_DETAILS']") || el.querySelector("[id^='message-menu-btn-']");
    if (menuBtn) row = menuBtn.closest(".flex");
    if (!row) row = el.querySelector(".flex");
  }
  if (!row) return null;
  var container = row.firstElementChild;
  if (!container) container = row;
  var menuBtn = container.querySelector("[data-testid='MESSAGE_DETAILS']") || container.querySelector("[id^='message-menu-btn-']");
  if (!menuBtn && container.parentElement) menuBtn = container.parentElement.querySelector("[id^='message-menu-btn-']");
  return { container: container, menuBtn: menuBtn };
}

/** Insert a visible green double-tick icon next to the timestamp (for read state). */
function injectReadTickIntoMessage(el) {
  if (!el || el.querySelector(".ghl-injected-read-tick")) return;
  var point = getTickInsertPoint(el);
  if (!point) return;
  var tickWrap = document.createElement("span");
  tickWrap.className = "ghl-injected-read-tick";
  tickWrap.appendChild(createReadTickSvg());
  if (point.menuBtn) {
    var parent = point.menuBtn.parentElement;
    if (parent) parent.insertBefore(tickWrap, point.menuBtn);
    else point.container.appendChild(tickWrap);
  } else {
    point.container.appendChild(tickWrap);
  }
}

/** Inject grey "sent" tick for outbound messages (turns green when .ghl-message-read is added). */
function injectSentTickIntoMessage(el) {
  if (!el || el.querySelector(".ghl-injected-read-tick") || el.querySelector(".ghl-injected-sent-tick")) return;
  var point = getTickInsertPoint(el);
  if (!point) return;
  var tickWrap = document.createElement("span");
  tickWrap.className = "ghl-injected-sent-tick";
  tickWrap.appendChild(createSentTickSvg());
  if (point.menuBtn) {
    var parent = point.menuBtn.parentElement;
    if (parent) parent.insertBefore(tickWrap, point.menuBtn);
    else point.container.appendChild(tickWrap);
  } else {
    point.container.appendChild(tickWrap);
  }
}

/** Ensure every outbound message has a tick (grey by default; turns green when read). */
function injectSentTicksForOutbound() {
  var items = document.querySelectorAll("[data-message-id]");
  items.forEach(function (el) {
    var container = el.querySelector(".message-container");
    var isOutbound = el.querySelector(".chat-bubble-outbound") || el.querySelector("[class*='chat-bubble-outbound']") ||
      (container && (container.classList.contains("ml-auto") || (container.className && container.className.indexOf("ml-auto") !== -1)));
    if (isOutbound) injectSentTickIntoMessage(el);
  });
}

/** Poll read-ticks API and apply green tick to messages that were just marked read. */
function pollReadTicks() {
  var locationId = getLocationId(window.location.href);
  if (!locationId) return;
  fetch(SCRIPT_API_BASE + "/api/whatsapp/read-ticks?locationId=" + encodeURIComponent(locationId))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.success || !Array.isArray(data.ghlMsgIds) || data.ghlMsgIds.length === 0) return;
      ensureReadTicksStyle();
      data.ghlMsgIds.forEach(function (ghlMsgId) {
        var el = document.querySelector("[data-message-id=\"" + ghlMsgId + "\"]");
        if (el && !el.classList.contains("ghl-message-read")) {
          el.classList.add("ghl-message-read");
          if (!el.querySelector(".ghl-injected-sent-tick")) injectReadTickIntoMessage(el);
        }
      });
    })
    .catch(function () {});
}

// Run forward-message UI only on relevant GHL pages (works when script is on location or agency)
function onLoadForForward() {
  const url = window.location.href;
  const path = window.location.pathname || "";

  const isContactsOrConversations =
    path.includes("contacts/detail") || path.includes("conversations") || url.includes("contacts/detail") || url.includes("conversations");

  const locationId = getLocationId(url);

  if (isContactsOrConversations && locationId) {
    attachContactSelector();
    injectQuotedBlocks();
    injectSentTicksForOutbound();
    ensureReadTicksStyle();
    if (readTicksInterval) clearInterval(readTicksInterval);
    readTicksInterval = setInterval(pollReadTicks, 3000);
    pollReadTicks();
  }
}

// Detect URL changes in SPA and re-run onLoadForForward
function urlDetectForForward() {
  if (urlCheckInterval) {
    clearInterval(urlCheckInterval);
  }

  urlCheckInterval = setInterval(() => {
    const currentPathname = window.location.pathname;
    const currentLocationId = getLocationId(window.location.href);

    if (
      currentPathname !== lastPathname ||
      currentLocationId !== lastLocationId
    ) {
      console.log("[ForwardMessage] URL change detected, reinitializing...");
      lastPathname = currentPathname;
      lastLocationId = currentLocationId;
      onLoadForForward();
    }
  }, 500);
}

// Watch DOM for new messages and attach buttons
function setupBodyObserver() {
  if (bodyObserver) {
    bodyObserver.disconnect();
  }

  if (!document.body) return;

  bodyObserver = new MutationObserver((mutations) => {
    let shouldAttach = false;

    for (const mutation of mutations) {
      if (mutation.addedNodes && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            if (
              (node.hasAttribute && node.hasAttribute("data-message-id")) ||
              (node.querySelector && node.querySelector("[data-message-id]"))
            ) {
              shouldAttach = true;
              break;
            }
          }
        }
      }
      if (shouldAttach) break;
    }

    if (shouldAttach) {
      clearTimeout(window.forwardMessageAttachTimeout);
      window.forwardMessageAttachTimeout = setTimeout(() => {
        attachContactSelector();
        injectQuotedBlocks();
        injectSentTicksForOutbound();
      }, 300);
    }
  });

  bodyObserver.observe(document.body, { childList: true, subtree: true });
}

function initialize() {
  cleanup();

  const newPath = window.location.pathname;
  const level = newPath?.split("/v2/location/");

  if (level?.length > 1 && level[0] === "") {
    loc_id = level[1].split("/")[0];
  }

  onLoadForForward();
  urlDetectForForward();
  setupBodyObserver();

  // Watch for locationId changes in URL path
  locationCheckInterval = setInterval(() => {
    const currentPath = window.location.pathname;
    const currentLevel = currentPath?.split("/v2/location/");

    if (currentLevel?.length > 1 && currentLevel[0] === "") {
      const newLocId = currentLevel[1].split("/")[0];
      if (newLocId !== loc_id) {
        loc_id = newLocId;
        onLoadForForward();
      }
    } else {
      onLoadForForward();
    }
  }, 1000);
}

// Intercept SPA navigation like in voice script
function interceptSPANavigation() {
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function () {
    originalPushState.apply(history, arguments);
    setTimeout(() => {
      console.log(
        "[ForwardMessage] SPA navigation detected (pushState), reinitializing..."
      );
      initialize();
    }, 100);
  };

  history.replaceState = function () {
    originalReplaceState.apply(history, arguments);
    setTimeout(() => {
      console.log(
        "[ForwardMessage] SPA navigation detected (replaceState), reinitializing..."
      );
      initialize();
    }, 100);
  };

  window.addEventListener("popstate", () => {
    setTimeout(() => {
      console.log(
        "[ForwardMessage] SPA navigation detected (popstate), reinitializing..."
      );
      initialize();
    }, 100);
  });
}

interceptSPANavigation();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
})();


