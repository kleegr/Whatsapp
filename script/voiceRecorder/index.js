


  
      
function VoiceRecorder() {
  // Load jQuery
  if (!window.jQuery) {
    const script = document.createElement("script");
    script.src = "https://code.jquery.com/jquery-3.6.0.min.js";
    document.head.appendChild(script);
  }

  // Wait for jQuery to load, then initialize
  function waitForJQuery(callback) {
    if (window.jQuery) {
      callback();
    } else {
      setTimeout(() => waitForJQuery(callback), 100);
    }
  }

  waitForJQuery(() => {
    let loc_id = "";
    let composerObserver = null;
    let composerCheckInterval = null;
    let urlCheckInterval = null;
    let locationCheckInterval = null;
    let conditionCheckInterval = null;
    let bodyObserver = null;
    let isInitialized = false;

    // Unified function to extract location ID from URL
    function getLocationId(url) {
      const match = url.match(/location\/([a-zA-Z0-9]+)/);
      return match ? match[1] : null;
    }

    // Check if Klegger Whatsapp condition is met
    function checkKleggerWhatsappCondition() {
      const composerTextarea = document.querySelector("#composer-textarea");
      if (!composerTextarea || !composerTextarea.children || composerTextarea.children.length === 0) {
        return false;
      }
      const firstChild = composerTextarea.children[0];
      const innerText = firstChild.innerText || firstChild.textContent || "";
      return innerText.trim().startsWith('Klegger Whatsapp');
    }

    // Function to update button visibility based on condition
    function updateButtonVisibility() {
      const conditionMet = checkKleggerWhatsappCondition();
      const existingButton = document.getElementById("voice-button");

      if (conditionMet) {
        // Show button if condition is met
        if (existingButton) {
          const iconContainer = existingButton.closest('div[style*="position: relative"]');
          if (iconContainer) {
            const wasHidden = iconContainer.style.display === "none" || iconContainer.style.display === "";
            iconContainer.style.display = "inline-block";
            if (wasHidden) {
              console.log("🎤 Microphone button APPENDED (shown)");
            }
          }
        } else {
          // Create button if it doesn't exist
          console.log("🎤 Microphone button APPENDED (created and shown)");
          VoiceRecorderWidget();
        }
      } else {
        // Hide button if condition is not met
        if (existingButton) {
          const iconContainer = existingButton.closest('div[style*="position: relative"]');
          if (iconContainer) {
            const wasVisible = iconContainer.style.display === "inline-block" || iconContainer.style.display === "flex";
            iconContainer.style.display = "none";
            if (wasVisible) {
              console.log("🎤 Microphone button HIDDEN3");
            }
          }
        }
      }
    }

    // Initialize voice recorder widget with mutation observer
    function initializeVoiceRecorder(composerElement) {
      if (!composerElement) return;

      // Clear existing observer if any
      if (composerObserver) {
        composerObserver.disconnect();
      }

      // Clear existing condition check interval if any
      if (conditionCheckInterval) {
        clearInterval(conditionCheckInterval);
      }

      // Initial check
      updateButtonVisibility();

      // Create single mutation observer to constantly check condition
      const config = { childList: true, subtree: true, characterData: true };
      composerObserver = new MutationObserver(() => {
        updateButtonVisibility();
      });

      composerObserver.observe(composerElement, config);

      // Also set up a periodic check interval as backup (every 500ms)
      conditionCheckInterval = setInterval(() => {
        updateButtonVisibility();
      }, 500);
    }

    // Check for composer element and initialize
    function checkAndInitializeComposer() {
      const composerElement = document.querySelector('#composer-textarea') || document.querySelector('#message-composer');

      if (composerElement) {
        // Only clear intervals if we're successfully initializing
        if (composerCheckInterval) {
          clearInterval(composerCheckInterval);
          composerCheckInterval = null;
        }
        initializeVoiceRecorder(composerElement);
        return true;
      }
      return false;
    }

    // Main function to load AI chat features
    function onLoadForAiChat() {
      const url = window.location.href;

      if (!url.includes("v2/location")) {
        return;
      }

      const isContactsOrConversations = url.includes("contacts/detail") || url.includes("conversations");

      if (isContactsOrConversations) {
        // Always try to initialize immediately
        checkAndInitializeComposer();

        // Keep checking periodically in case element appears/disappears
        if (composerCheckInterval) {
          clearInterval(composerCheckInterval);
        }

        composerCheckInterval = setInterval(() => {
          checkAndInitializeComposer();
        }, 1000);
      } else {
        // If not on contacts/conversations page, cleanup
        if (composerCheckInterval) {
          clearInterval(composerCheckInterval);
          composerCheckInterval = null;
        }
        if (composerObserver) {
          composerObserver.disconnect();
          composerObserver = null;
        }
        if (conditionCheckInterval) {
          clearInterval(conditionCheckInterval);
          conditionCheckInterval = null;
        }
      }
    }
    async function getDataFromLocalStorage(apiUrl) {
      // Function to get a cookie value by name
      function getCookieValue(cookieName) {
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
          const [name, value] = cookie.split('=').map(part => part.trim());
          if (name === cookieName) {
            return decodeURIComponent(value);
          }
        }
        return null; // Return null if the cookie is not found
      }

      // Get the access token (e.g., stored in "m_a" cookie)
      const accessToken = getCookieValue('m_a');
      if (!accessToken) {
        console.error('Access token not found in cookies.');
        return;
      }

      // API call using fetch
      try {
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'authorization': `Bearer ${accessToken}`,
            'channel': 'APP',
            'source': 'WEB_USER',
            'version': '2021-07-28',
          },
        });

        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('API Response:', data);
        return data;
      } catch (error) {
        console.error('Error during API call:', error);
      }
    }
    // URL change detection for dialer
    let lastPathname = window.location.pathname;
    let lastLocationId = getLocationId(window.location.href);

    function urlDetectForDailer() {
      if (urlCheckInterval) {
        clearInterval(urlCheckInterval);
      }

      urlCheckInterval = setInterval(() => {
        const currentPathname = window.location.pathname;
        const currentLocationId = getLocationId(window.location.href);

        if (currentPathname !== lastPathname || currentLocationId !== lastLocationId) {
          console.log("URL change detected, reinitializing...");
          lastPathname = currentPathname;
          lastLocationId = currentLocationId;

          // Reinitialize when URL changes
          onLoadForAiChat();
        }
      }, 500);
    }

    // Cleanup function to clear all intervals and observers
    function cleanup() {
      if (composerObserver) {
        composerObserver.disconnect();
        composerObserver = null;
      }
      if (composerCheckInterval) {
        clearInterval(composerCheckInterval);
        composerCheckInterval = null;
      }
      if (urlCheckInterval) {
        clearInterval(urlCheckInterval);
        urlCheckInterval = null;
      }
      if (locationCheckInterval) {
        clearInterval(locationCheckInterval);
        locationCheckInterval = null;
      }
      if (conditionCheckInterval) {
        clearInterval(conditionCheckInterval);
        conditionCheckInterval = null;
      }
      if (bodyObserver) {
        bodyObserver.disconnect();
        bodyObserver = null;
      }
    }

    // Main initialization function
    function initialize() {
      // Cleanup existing intervals/observers first
      cleanup();

      const newPath = window.location.pathname;
      const level = newPath?.split("/v2/location/");

      if (level?.length > 1 && level[0] === "") {
        loc_id = level[1].split("/")[0];
      }

      // Initialize AI chat features
      onLoadForAiChat();
      urlDetectForDailer();

      // Set up continuous location check
      locationCheckInterval = setInterval(function () {
        const currentPath = window.location.pathname;
        const currentLevel = currentPath?.split("/v2/location/");

        if (currentLevel?.length > 1 && currentLevel[0] === "") {
          const newLocId = currentLevel[1].split("/")[0];
          if (newLocId !== loc_id) {
            loc_id = newLocId;
            onLoadForAiChat();
            urlDetectForDailer();
          }
        } else {
          onLoadForAiChat();
          urlDetectForDailer();
        }
      }, 1000);
    }

    // Intercept SPA navigation (pushState and replaceState)
    function interceptSPANavigation() {
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;

      history.pushState = function () {
        originalPushState.apply(history, arguments);
        setTimeout(() => {
          console.log("SPA navigation detected (pushState), reinitializing...");
          initialize();
        }, 100);
      };

      history.replaceState = function () {
        originalReplaceState.apply(history, arguments);
        setTimeout(() => {
          console.log("SPA navigation detected (replaceState), reinitializing...");
          initialize();
        }, 100);
      };

      // Also listen to popstate for back/forward navigation
      window.addEventListener('popstate', () => {
        setTimeout(() => {
          console.log("SPA navigation detected (popstate), reinitializing...");
          initialize();
        }, 100);
      });
    }

    // Set up body observer to detect DOM changes
    function setupBodyObserver() {
      if (bodyObserver) {
        bodyObserver.disconnect();
      }

      bodyObserver = new MutationObserver((mutations) => {
        let shouldReinit = false;

        for (let mutation of mutations) {
          // Check if composer element was added
          if (mutation.addedNodes.length > 0) {
            for (let node of mutation.addedNodes) {
              if (node.nodeType === 1) { // Element node
                if (node.querySelector && (
                  node.querySelector('#composer-textarea') ||
                  node.querySelector('#message-composer') ||
                  node.id === 'composer-textarea' ||
                  node.id === 'message-composer'
                )) {
                  shouldReinit = true;
                  break;
                }
              }
            }
          }

          // Check if URL changed in the page
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            // Debounce reinitialization
            clearTimeout(window.voiceRecorderReinitTimeout);
            window.voiceRecorderReinitTimeout = setTimeout(() => {
              const composerElement = document.querySelector('#composer-textarea') || document.querySelector('#message-composer');
              if (composerElement) {
                console.log("Composer element detected in DOM, checking initialization...");
                onLoadForAiChat();
              }
            }, 500);
          }
        }

        if (shouldReinit) {
          setTimeout(() => {
            console.log("DOM change detected, reinitializing...");
            initialize();
          }, 300);
        }
      });

      bodyObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    // Initial setup
    interceptSPANavigation();
    setupBodyObserver();

    // Initial location check - run immediately and on document ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initialize);
    } else {
      initialize();
    }

    // Also run on jQuery ready as backup
    $(document).ready(initialize);

    // VoiceRecorderWidget function (unchanged, as it's already optimized)
    function VoiceRecorderWidget() {
      console.log("VoiceRecorderWidget function called");

      // Check Klegger Whatsapp condition before proceeding
      const composerTextarea = document.querySelector("#composer-textarea");
      if (!composerTextarea || !composerTextarea.children || composerTextarea.children.length === 0) {
        console.log("Composer textarea or children not found, hiding button");
        const existingButton = document.getElementById("voice-button");
        if (existingButton) {
          const iconContainer = existingButton.closest('div[style*="position: relative"]');
          if (iconContainer) {
            const wasVisible = iconContainer.style.display === "inline-block" || iconContainer.style.display === "flex";
            iconContainer.style.display = "none";
            if (wasVisible) {
              console.log("🎤 Microphone button HIDDEN1");
            }
          }
        }
        return;
      }

      const firstChild = composerTextarea.children[0];
      const innerText = firstChild.innerText || firstChild.textContent || "";
      if (!innerText.trim().startsWith('Klegger Whatsapp')) {
        console.log("Condition not met - not Klegger Whatsapp, hiding button");
        const existingButton = document.getElementById("voice-button");
        if (existingButton) {
          const iconContainer = existingButton.closest('div[style*="position: relative"]');
          if (iconContainer) {
            const wasVisible = iconContainer.style.display === "inline-block" || iconContainer.style.display === "flex";
            iconContainer.style.display = "none";
            if (wasVisible) {
              console.log("🎤 Microphone button HIDDEN2");
            }
          }
        }
        return;
      }

      // Load Font Awesome if not already loaded
      if (!document.getElementById("font-awesome-stylesheet")) {
        const linkFontAwesome = document.createElement("link");
        linkFontAwesome.id = "font-awesome-stylesheet";
        linkFontAwesome.rel = "stylesheet";
        linkFontAwesome.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css";
        document.head.appendChild(linkFontAwesome);
      }

      // Check if the button already exists
      const existingButton = document.getElementById("voice-button");
      if (existingButton) {
        // Show button if it exists and condition is met
        const iconContainer = existingButton.closest('div[style*="position: relative"]');
        if (iconContainer) {
          const wasHidden = iconContainer.style.display === "none" || iconContainer.style.display === "";
          iconContainer.style.display = "inline-block";
          if (wasHidden) {
            console.log("🎤 Microphone button APPENDED (shown)");
          }
        }
        return;
      }

      let mediaRecorder;
      let audioChunks = [];
      let audioBlob;
      let audioURL;
      let audioContext;
      let analyser;
      let dataArray;
      let animationId;
      let recordingStartTime;
      let timerInterval;

      // Create the container for the icon
      const iconContainer = document.createElement("div");
      iconContainer.style.position = "relative";
      iconContainer.style.display = "inline-block";
      iconContainer.style.cursor = "pointer";
      iconContainer.style.verticalAlign = "middle";

      // Create the microphone icon - small gray icon matching toolbar style
      const microphoneIcon = document.createElement("span");
      microphoneIcon.id = "voice-button";
      microphoneIcon.innerHTML = '<i class="fa-solid fa-microphone"></i>';
      microphoneIcon.style.fontSize = "14px";
      microphoneIcon.style.padding = "6px";
      microphoneIcon.style.borderRadius = "4px";
      microphoneIcon.style.color = "#6b7280";
      microphoneIcon.style.transition = "background-color 0.2s, color 0.2s";

      // Hover effect for the icon
      microphoneIcon.addEventListener("mouseenter", () => {
        microphoneIcon.style.backgroundColor = "#f3f4f6";
        microphoneIcon.style.color = "#374151";
      });
      microphoneIcon.addEventListener("mouseleave", () => {
        microphoneIcon.style.backgroundColor = "transparent";
        microphoneIcon.style.color = "#6b7280";
      });

      // Append the icon to the container
      iconContainer.appendChild(microphoneIcon);

      // Variables to store recording UI elements (created on demand)
      let recordingContainer = null;
      let recordBtn = null;
      let stopBtn = null;
      let playBtn = null;
      let sendBtn = null;
      let sendMessageBtn = null;
      let deleteBtn = null;
      let visualizerContainer = null;
      let timerDisplay = null;
      let statusText = null;
      let canvas = null;
      let canvasCtx = null;
      let audio = null;
      let handlersSetup = false; // Flag to track if handlers have been set up

      // Function to create recording UI (only called when microphone is clicked)
      function createRecordingUI() {
        // Check if already created
        const existingWidget = document.getElementById("voice-recorder-widget");
        if (existingWidget) {
          recordingContainer = existingWidget;
          // Get references to all elements if they exist
          recordBtn = recordingContainer.querySelector('button[title="Start Recording"]');
          stopBtn = recordingContainer.querySelector('button[title="Stop Recording"]');
          playBtn = recordingContainer.querySelector('button[title="Play Recording"]');
          sendBtn = recordingContainer.querySelector('button[title="Send Voice Message"]');
          sendMessageBtn = recordingContainer.querySelector('button[title="Send Text Message"]');
          deleteBtn = recordingContainer.querySelector('button[title="Delete Recording"]');
          visualizerContainer = recordingContainer.querySelector('div[style*="flex-direction: column"]');
          if (visualizerContainer) {
            timerDisplay = visualizerContainer.querySelector('div[style*="font-family"]');
            statusText = visualizerContainer.querySelector('div[style*="text-transform: uppercase"]');
            canvas = visualizerContainer.querySelector('canvas');
            if (canvas) {
              canvasCtx = canvas.getContext("2d");
            }
          }
          // Get audio element if it exists, or create a new one
          audio = recordingContainer.querySelector('audio');
          if (!audio) {
            audio = document.createElement("audio");
            audio.controls = false;
            recordingContainer.appendChild(audio);
          }
          return;
        }

        // Recording UI Container - white background with light blue border
        recordingContainer = document.createElement("div");
        recordingContainer.id = "voice-recorder-widget";
        recordingContainer.style.cssText = `
          display: none;
          position: absolute;
          bottom: 100%;
          left: -120;
          margin-bottom: 8px;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 16px;
          background: #ffffff;
          border: 1px solid #bfdbfe;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          z-index: 10000;
          min-width: 280px;
          max-width: 350px;
        `;

        // Header with title
        const headerDiv = document.createElement("div");
        headerDiv.style.cssText = `
          width: 100%;
          text-align: center;
          margin-bottom: 4px;
        `;
        const titleText = document.createElement("div");
        titleText.textContent = "Voice Recorder";
        titleText.style.cssText = `
          font-size: 14px;
          font-weight: 600;
          color: #1f2937;
        `;
        headerDiv.appendChild(titleText);

        // Record Button - blue accent when active
        recordBtn = document.createElement("button");
        recordBtn.innerHTML = `<i class="fa-solid fa-microphone"></i>`;
        recordBtn.title = "Start Recording";
        recordBtn.style.cssText = `
          border: none;
          padding: 10px;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #3b82f6;
          color: white;
          cursor: pointer;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
        `;

        recordBtn.onmouseenter = () => {
          if (!recordBtn.dataset.recording) {
            recordBtn.style.transform = "scale(1.05)";
            recordBtn.style.boxShadow = "0 4px 8px rgba(59, 130, 246, 0.4)";
          }
        };

        recordBtn.onmouseleave = () => {
          if (!recordBtn.dataset.recording) {
            recordBtn.style.transform = "scale(1)";
            recordBtn.style.boxShadow = "0 2px 4px rgba(59, 130, 246, 0.3)";
          }
        };

        // Visualizer Container
        visualizerContainer = document.createElement("div");
        visualizerContainer.style.cssText = `
          display: none;
          flex-direction: column;
          gap: 6px;
          width: 100%;
          align-items: center;
          background: #f9fafb;
          padding: 10px;
          border-radius: 6px;
          border: 1px solid #e5e7eb;
        `;

        // Timer Display
        timerDisplay = document.createElement("div");
        timerDisplay.style.cssText = `
          font-size: 16px;
          font-weight: 600;
          color: #dc2626;
          font-family: 'Courier New', monospace;
          letter-spacing: 1px;
        `;
        timerDisplay.textContent = "00:00";

        // Status Text
        statusText = document.createElement("div");
        statusText.style.cssText = `
          font-size: 11px;
          font-weight: 500;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        `;
        statusText.textContent = "Recording...";

        // Canvas for Visualization
        canvas = document.createElement("canvas");
        canvas.width = 260;
        canvas.height = 50;
        canvas.style.cssText = `
          width: 100%;
          height: 50px;
          border-radius: 4px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
        `;
        canvasCtx = canvas.getContext("2d");

        visualizerContainer.appendChild(timerDisplay);
        visualizerContainer.appendChild(statusText);
        visualizerContainer.appendChild(canvas);

        // Button Container for action buttons
        const buttonContainer = document.createElement("div");
        buttonContainer.style.cssText = `
          display: flex;
          gap: 8px;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          width: 100%;
        `;

        // Stop Button - small gray icon
        stopBtn = document.createElement("button");
        stopBtn.innerHTML = `<i class="fa-solid fa-stop"></i>`;
        stopBtn.title = "Stop Recording";
        stopBtn.style.cssText = `
          display: none;
          border: none;
          padding: 8px;
          width: 32px;
          height: 32px;
          border-radius: 4px;
          background: #f3f4f6;
          color: #dc2626;
          cursor: pointer;
          font-size: 12px;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        `;

        stopBtn.onmouseenter = () => {
          stopBtn.style.backgroundColor = "#fee2e2";
          stopBtn.style.transform = "scale(1.05)";
        };

        stopBtn.onmouseleave = () => {
          stopBtn.style.backgroundColor = "#f3f4f6";
          stopBtn.style.transform = "scale(1)";
        };

        // Play Button - small gray icon
        playBtn = document.createElement("button");
        playBtn.innerHTML = `<i class="fa-solid fa-play"></i>`;
        playBtn.title = "Play Recording";
        playBtn.style.cssText = `
          display: none;
          border: none;
          padding: 8px;
          width: 32px;
          height: 32px;
          border-radius: 4px;
          background: #f3f4f6;
          color: #059669;
          cursor: pointer;
          font-size: 12px;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        `;

        playBtn.onmouseenter = () => {
          playBtn.style.backgroundColor = "#d1fae5";
          playBtn.style.transform = "scale(1.05)";
        };

        playBtn.onmouseleave = () => {
          playBtn.style.backgroundColor = "#f3f4f6";
          playBtn.style.transform = "scale(1)";
        };

        // Send Button - blue accent (matching send button style)
        sendBtn = document.createElement("button");
        sendBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i>`;
        sendBtn.title = "Send Voice Message";
        sendBtn.style.cssText = `
          display: none;
          border: none;
          padding: 8px;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #3b82f6;
          color: white;
          cursor: pointer;
          font-size: 12px;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
        `;

        sendBtn.onmouseenter = () => {
          sendBtn.style.transform = "scale(1.05)";
          sendBtn.style.boxShadow = "0 4px 8px rgba(59, 130, 246, 0.4)";
        };

        sendBtn.onmouseleave = () => {
          sendBtn.style.transform = "scale(1)";
          sendBtn.style.boxShadow = "0 2px 4px rgba(59, 130, 246, 0.3)";
        };

        // Send Message Button - small gray icon
        sendMessageBtn = document.createElement("button");
        sendMessageBtn.innerHTML = `<i class="fa-solid fa-comment"></i>`;
        sendMessageBtn.title = "Send Text Message";
        sendMessageBtn.style.cssText = `
          border: none;
          padding: 8px;
          width: 32px;
          height: 32px;
          border-radius: 4px;
          background: #f3f4f6;
          color: #6b7280;
          cursor: pointer;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        `;

        sendMessageBtn.onmouseenter = () => {
          sendMessageBtn.style.backgroundColor = "#e5e7eb";
          sendMessageBtn.style.color = "#374151";
          sendMessageBtn.style.transform = "scale(1.05)";
        };

        sendMessageBtn.onmouseleave = () => {
          sendMessageBtn.style.backgroundColor = "#f3f4f6";
          sendMessageBtn.style.color = "#6b7280";
          sendMessageBtn.style.transform = "scale(1)";
        };

        // Delete Button - small gray icon
        deleteBtn = document.createElement("button");
        deleteBtn.innerHTML = `<i class="fa-solid fa-trash"></i>`;
        deleteBtn.title = "Delete Recording";
        deleteBtn.style.cssText = `
          display: none;
          border: none;
          padding: 8px;
          width: 32px;
          height: 32px;
          border-radius: 4px;
          background: #f3f4f6;
          color: #6b7280;
          cursor: pointer;
          font-size: 12px;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        `;

        deleteBtn.onmouseenter = () => {
          deleteBtn.style.backgroundColor = "#fee2e2";
          deleteBtn.style.color = "#dc2626";
          deleteBtn.style.transform = "scale(1.05)";
        };

        deleteBtn.onmouseleave = () => {
          deleteBtn.style.backgroundColor = "#f3f4f6";
          deleteBtn.style.color = "#6b7280";
          deleteBtn.style.transform = "scale(1)";
        };

        // Audio element
        audio = document.createElement("audio");
        audio.controls = false;
        audio.style.display = "none";

        // Append buttons to button container
        buttonContainer.appendChild(recordBtn);
        buttonContainer.appendChild(stopBtn);
        buttonContainer.appendChild(playBtn);
        buttonContainer.appendChild(sendBtn);
        buttonContainer.appendChild(sendMessageBtn);
        buttonContainer.appendChild(deleteBtn);

        // Append elements to recording container
        recordingContainer.appendChild(headerDiv);
        recordingContainer.appendChild(visualizerContainer);
        recordingContainer.appendChild(buttonContainer);
        recordingContainer.appendChild(audio); // Append audio element

        // Append recording container to iconContainer (positioned relative to icon)
        iconContainer.appendChild(recordingContainer);

        // Hide recording container when clicking outside (only add once)
        if (!window.voiceRecorderClickHandlerAdded) {
          window.voiceRecorderClickHandlerAdded = true;
          document.addEventListener("click", (e) => {
            const container = document.getElementById("voice-recorder-widget");
            if (
              container &&
              container.style.display === "flex" &&
              !container.contains(e.target) &&
              !iconContainer.contains(e.target)
            ) {
              container.style.display = "none";
            }
          });
        }
      }

      // Visualizer Animation Function
      function drawVisualization() {
        if (!analyser || !dataArray) return;

        animationId = requestAnimationFrame(drawVisualization);

        analyser.getByteFrequencyData(dataArray);

        // Clear canvas with white background
        canvasCtx.fillStyle = "#ffffff";
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = 2;
        const gap = 1;
        const barCount = Math.floor(canvas.width / (barWidth + gap));
        const centerY = canvas.height / 2;

        for (let i = 0; i < barCount; i++) {
          const dataIndex = Math.floor((i / barCount) * dataArray.length);
          const barHeight = (dataArray[dataIndex] / 255) * canvas.height * 0.7;

          // Use blue gradient matching the theme
          const gradient = canvasCtx.createLinearGradient(0, centerY - barHeight / 2, 0, centerY + barHeight / 2);
          gradient.addColorStop(0, "#3b82f6");
          gradient.addColorStop(0.5, "#60a5fa");
          gradient.addColorStop(1, "#93c5fd");

          canvasCtx.fillStyle = gradient;

          // Draw bars from center (symmetrical)
          const x = i * (barWidth + gap);
          canvasCtx.fillRect(
            x,
            centerY - barHeight / 2,
            barWidth,
            barHeight
          );
        }

        // Add center line
        canvasCtx.strokeStyle = "#e5e7eb";
        canvasCtx.lineWidth = 1;
        canvasCtx.beginPath();
        canvasCtx.moveTo(0, centerY);
        canvasCtx.lineTo(canvas.width, centerY);
        canvasCtx.stroke();
      }

      // Timer Function
      function updateTimer() {
        const elapsed = Date.now() - recordingStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      }

      // Click handler for microphone icon - creates and shows recording UI
      microphoneIcon.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();

        // Prevent rapid clicking
        if (microphoneIcon.dataset.processing === "true") {
          return;
        }
        microphoneIcon.dataset.processing = "true";

        setTimeout(() => {
          microphoneIcon.dataset.processing = "false";
        }, 300);

        // Create recording UI if it doesn't exist
        if (!recordingContainer || !document.getElementById("voice-recorder-widget")) {
          createRecordingUI();
        }

        // Always ensure we have references to all elements
        const widget = document.getElementById("voice-recorder-widget");
        if (widget) {
          recordingContainer = widget;
          recordBtn = widget.querySelector('button[title="Start Recording"]');
          stopBtn = widget.querySelector('button[title="Stop Recording"]');
          playBtn = widget.querySelector('button[title="Play Recording"]');
          sendBtn = widget.querySelector('button[title="Send Voice Message"]');
          sendMessageBtn = widget.querySelector('button[title="Send Text Message"]');
          deleteBtn = widget.querySelector('button[title="Delete Recording"]');
          visualizerContainer = widget.querySelector('div[style*="flex-direction: column"]');
          if (visualizerContainer) {
            timerDisplay = visualizerContainer.querySelector('div[style*="font-family"]');
            statusText = visualizerContainer.querySelector('div[style*="text-transform: uppercase"]');
            canvas = visualizerContainer.querySelector('canvas');
            if (canvas) {
              canvasCtx = canvas.getContext("2d");
            }
          }
          // Get or create audio element
          audio = widget.querySelector('audio');
          if (!audio) {
            audio = document.createElement("audio");
            audio.controls = false;
            audio.style.display = "none";
            widget.appendChild(audio);
          }
        }

        // Set up event handlers only once
        if (!handlersSetup && recordingContainer && recordBtn) {
          setupRecordingHandlers();
          handlersSetup = true;
        }

        // Toggle visibility
        if (recordingContainer) {
          const isVisible = recordingContainer.style.display === "flex";
          recordingContainer.style.display = isVisible ? "none" : "flex";
          if (!isVisible && statusText) {
            statusText.textContent = "Ready to record";
          }
        }
      });

      // Function to set up all recording event handlers
      function setupRecordingHandlers() {
        if (!recordingContainer || !recordBtn) return;

        // Prevent multiple handler attachments
        if (recordBtn.dataset.handlersSetup === "true") {
          return;
        }
        recordBtn.dataset.handlersSetup = "true";

        // Start Recording
        recordBtn.onclick = async (e) => {
          e.stopPropagation();
          e.preventDefault();

          // Prevent multiple simultaneous recordings
          if (mediaRecorder && mediaRecorder.state === "recording") {
            console.log("Already recording, ignoring click");
            return;
          }

          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Setup Audio Context for Visualization
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 256;

            const bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);

            // Setup MediaRecorder
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = () => {
              audioBlob = new Blob(audioChunks, { type: "audio/webm" });
              audioURL = URL.createObjectURL(audioBlob);
              audio.src = audioURL;

              // Show play, send (audio), and delete buttons - HIDE send message button
              playBtn.style.display = "flex";
              sendBtn.style.display = "flex";
              deleteBtn.style.display = "flex";
              sendMessageBtn.style.display = "none";
              statusText.textContent = "Recording complete";
              visualizerContainer.style.display = "none";
              recordingContainer.style.borderColor = "#bfdbfe";
            };

            mediaRecorder.start();
            recordingStartTime = Date.now();

            // Update UI for recording state
            recordBtn.dataset.recording = "true";
            recordBtn.style.background = "#dc2626";
            recordBtn.style.animation = "pulse 1.5s infinite";
            recordBtn.innerHTML = `<i class="fa-solid fa-microphone"></i>`;

            // Show visualizer and stop button
            visualizerContainer.style.display = "flex";
            stopBtn.style.display = "flex";
            recordBtn.style.display = "none"; // Hide record button while recording
            recordingContainer.style.borderColor = "#fca5a5";
            recordingContainer.style.boxShadow = "0 2px 8px rgba(220, 38, 38, 0.2)";
            statusText.textContent = "Recording...";

            // Ensure canvas is ready
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

            // Start visualization and timer
            drawVisualization();
            timerInterval = setInterval(updateTimer, 100);

            // Add pulse animation
            const style = document.createElement("style");
            style.textContent = `
              @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
              }
            `;
            document.head.appendChild(style);

          } catch (err) {
            console.error("Microphone permission denied", err);
            // alert("Microphone access is required to record audio.");
          }
        };

        // Stop Recording
        stopBtn.onclick = (e) => {
          e.stopPropagation();
          e.preventDefault();

          if (mediaRecorder && mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(t => t.stop());

            // Stop visualization and timer
            if (animationId) {
              cancelAnimationFrame(animationId);
              animationId = null;
            }
            if (timerInterval) {
              clearInterval(timerInterval);
              timerInterval = null;
            }

            // Clear canvas
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

            // Close audio context
            if (audioContext) {
              audioContext.close();
              audioContext = null;
            }

            // Reset UI
            delete recordBtn.dataset.recording;
            recordBtn.style.background = "#3b82f6";
            recordBtn.style.animation = "none";
            recordBtn.style.display = "flex"; // Show record button again
            visualizerContainer.style.display = "none";
            stopBtn.style.display = "none";
            recordingContainer.style.borderColor = "#bfdbfe";
            recordingContainer.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
            if (statusText) {
              statusText.textContent = "Ready to record";
            }
          }
        };

        // Play Recording
        playBtn.onclick = () => {
          if (audioURL) {
            if (audio.paused) {
              audio.play();
              playBtn.innerHTML = `<i class="fa-solid fa-pause"></i>`;
              console.log("Playing audio recording");
              console.log("Audio Blob:", audioBlob);
              console.log("Audio URL:", audioURL);
              console.log("Audio Duration:", audio.duration || "Loading...");
              console.log("Audio Type:", audioBlob.type);
              console.log("Audio Size:", (audioBlob.size / 1024).toFixed(2), "KB");
            } else {
              audio.pause();
              playBtn.innerHTML = `<i class="fa-solid fa-play"></i>`;
              console.log("Audio paused");
            }
          }
        };

        audio.onended = () => {
          playBtn.innerHTML = `<i class="fa-solid fa-play"></i>`;
        };

        // Send Text Message via WhatsApp API
        sendMessageBtn.onclick = async () => {
          const composerTextarea = document.querySelector("#composer-textarea textarea");
          const messageInput = document.querySelector("#mail-composer-container input[type='text']");

          let messageText = "";
          if (composerTextarea) {
            messageText = composerTextarea.value.trim();
          } else if (messageInput) {
            messageText = messageInput.value.trim();
          }

          if (!messageText) {
            // alert("Please enter a message to send!");
            return;
          }

          try {
            sendMessageBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
            sendMessageBtn.disabled = true;

            console.log("Preparing to send text message...");

            const config = {
              apiUrl: "https://7105.api.greenapi.com/waInstance7105467846/sendMessage/62b550f4caf24087bd599232c8c4ec184961c0fcc61246c58f",
              chatId: "923246483156@c.us"
            };

            const payload = {
              chatId: config.chatId,
              message: messageText
            };

            console.log("Sending message:", payload);

            const response = await fetch(config.apiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (response.ok) {
              console.log("Message sent successfully:", result);
            //   alert("Message sent successfully! ✅");

              if (composerTextarea) {
                composerTextarea.value = "";
              } else if (messageInput) {
                messageInput.value = "";
              }
            } else {
              console.error("Failed to send message:", result);
              // alert("Failed to send message ❌\nError: " + (result.error || result.message || "Unknown error"));
            }

          } catch (error) {
            console.error("Error sending message:", error);
            // alert("Error sending message ❌\n" + error.message);
          } finally {
            sendMessageBtn.innerHTML = `<i class="fa-solid fa-comment"></i>`;
            sendMessageBtn.disabled = false;
          }
        };

        // Send Audio File via GHL API
        sendBtn.onclick = async () => {
          if (!audioBlob) {
            // alert("No audio recording to send!");
            return;
          }

          try {
            sendBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
            sendBtn.disabled = true;

            console.log("Uploading audio to GHL and sending message...");
            console.log("Audio Blob Info:", {
              size: audioBlob.size,
              type: audioBlob.type
            });

            // Extract contactId and locationId from URL path
            const newPath = window.location.pathname;
            const locationId = newPath.split("/v2/location/")[1]?.split("/")[0];
            const parts = newPath.split("/v2/location/")[1]?.split("/");
            let contactId = null;

            if (parts[1] === "contacts" && parts[2] === "detail") {
              contactId = parts[3];
            } else if (parts[1] === "conversations" && parts[2] === "conversations") {
              const conversationId = parts[3];
              // Fetch conversation details to get contactId
              try {
                const convRes = await fetch(`https://whatsapp-rk9i.onrender.com/api/get-conversation?locationId=${locationId}&conversationId=${conversationId}`);
                if (convRes.ok) {
                  const convData = await convRes.json();
                  if (convData.success && convData.data) {
                    contactId = convData.data.contactId;
                    console.log("Resolved contactId from conversation:", contactId);
                  }
                } else {
                  console.error("Failed to fetch conversation details");
                }
              } catch (e) {
                console.error("Error fetching conversation details:", e);
              }
            }

            console.log("contactId", contactId);
            console.log("locationId", locationId);

            // Validate required parameters
            if (!contactId || !locationId) {
            //   alert("Contact ID or Location ID not found (or failed to resolve from conversation)");
              sendBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i>`;
              sendBtn.disabled = false;
              return;
            }

            // Step 1: Upload file to GHL Media Library
            const uploadApiUrl = `https://whatsapp-rk9i.onrender.com/api/upload-media?locationId=${locationId}`;
            console.log("Uploading file to:", uploadApiUrl);

            // Determine file extension and MIME type based on blob type
            let fileName = 'voice_message.mp3';
            let mimeType = 'audio/mpeg';

            if (audioBlob.type) {
              if (audioBlob.type === 'audio/webm' || audioBlob.type.includes('webm')) {
                fileName = 'voice_message.webm';
                mimeType = 'audio/webm';
              } else if (audioBlob.type === 'audio/wav' || audioBlob.type.includes('wav')) {
                fileName = 'voice_message.wav';
                mimeType = 'audio/wav';
              } else if (audioBlob.type === 'audio/ogg' || audioBlob.type.includes('ogg')) {
                fileName = 'voice_message.ogg';
                mimeType = 'audio/ogg';
              } else if (audioBlob.type.startsWith('audio/')) {
                mimeType = audioBlob.type;
                // Extract extension from MIME type if possible
                const ext = audioBlob.type.split('/')[1]?.split(';')[0];
                if (ext) {
                  fileName = `voice_message.${ext}`;
                }
              } else {
                // Default to webm if type is not recognized (MediaRecorder usually creates webm)
                fileName = 'voice_message.webm';
                mimeType = 'audio/webm';
              }
            } else {
              // If no type, default to webm (most common for MediaRecorder)
              fileName = 'voice_message.webm';
              mimeType = 'audio/webm';
            }

            const uploadFormData = new FormData();
            // Create a File object from Blob with explicit MIME type
            const audioFile = new File([audioBlob], fileName, {
              type: mimeType,
              lastModified: Date.now()
            });
            uploadFormData.append('file', audioFile);

            console.log("File details:", {
              name: fileName,
              type: mimeType,
              originalBlobType: audioBlob.type,
              size: audioBlob.size
            });

            const uploadResponse = await fetch(uploadApiUrl, {
              method: 'POST',
              headers: {
                'Accept': 'application/json'
              },
              body: uploadFormData
            });

            // Check if response is ok before trying to parse JSON
            if (!uploadResponse.ok) {
              const errorText = await uploadResponse.text();
              console.error("Upload failed - Status:", uploadResponse.status, "Response:", errorText);
              let errorMessage = "Upload failed";
              try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error || errorJson.message || errorMessage;
              } catch (e) {
                errorMessage = errorText || `HTTP ${uploadResponse.status}`;
              }
              //alert("Failed to upload voice message ❌\nError: " + errorMessage);
              sendBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i>`;
              sendBtn.disabled = false;
              return;
            }

            const uploadResult = await uploadResponse.json();
            console.log("Upload Response:", uploadResult);

            if (!uploadResult.success || !uploadResult.url) {
              console.error("File upload failed:", uploadResult);
              // alert("Failed to upload voice message ❌\nError: " + (uploadResult.error || uploadResult.message || "Upload failed - no URL returned"));
              sendBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i>`;
              sendBtn.disabled = false;
              return;
            }

            const fileUrl = uploadResult.url;
            console.log("File uploaded successfully. URL:", fileUrl);

            // Step 2: Send message with attachment via add-message-recording API
            const messageApiUrl = `https://whatsapp-rk9i.onrender.com/api/add-meesage-recording?locationId=${locationId}`;
            console.log("Sending message to:", messageApiUrl);

            const messagePayload = {
              contactId: contactId,
              attachments: [fileUrl]
            };

            console.log("Message payload:", messagePayload);

            const messageResponse = await fetch(messageApiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(messagePayload)
            });

            const messageResult = await messageResponse.json();
            console.log("Message Response:", messageResult);

            if (messageResponse.ok && messageResult.success) {
              console.log("Message sent successfully:", messageResult);
              

              // Clear recording
              audioURL = null;
              audioBlob = null;
              audio.src = "";
              playBtn.style.display = "none";
              sendBtn.style.display = "none";
              deleteBtn.style.display = "none";
              sendMessageBtn.style.display = "flex";
              timerDisplay.textContent = "00:00";
              recordingContainer.style.display = "none";
            } else {
              console.error("Failed to send message:", messageResult);
              // alert("Failed to send voice message ❌\nError: " + (messageResult.error || messageResult.message || "Message sending failed"));
            }

          } catch (error) {
            console.error("Error sending audio:", error);
            // alert("Error sending voice message ❌\n" + error.message);
          } finally {
            sendBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i>`;
            sendBtn.disabled = false;
          }
        };

        // Delete Recording
        deleteBtn.onclick = () => {
          if (confirm("Are you sure you want to delete this recording?")) {
            audioURL = null;
            audioBlob = null;
            audio.src = "";
            playBtn.style.display = "none";
            sendBtn.style.display = "none";
            deleteBtn.style.display = "none";
            sendMessageBtn.style.display = "flex";
            timerDisplay.textContent = "00:00";
            recordingContainer.style.display = "none";
          }
        };

      }

      // Append the icon container to the desired parent element
      // composerTextarea is already available from the condition check above
      if (composerTextarea) {
        composerTextarea.style.overflow = 'visible';
        const parent = composerTextarea.parentElement;
        if (parent) {
          parent.style.overflow = 'visible';
        }
      }
      const mailComposerContainer = document.querySelector('#mail-composer-container');

      let targetParent;
      if (composerTextarea) {
        targetParent = composerTextarea.querySelector('.flex.flex-row.gap-2.items-center.pl-2.rounded-md.flex-1.min-w-0');
      } else if (mailComposerContainer) {
        targetParent = mailComposerContainer;
      }

      if (targetParent) {
        targetParent.appendChild(iconContainer);
        console.log("🎤 Microphone button APPENDED to DOM");
      } else {
        console.warn("Could not find a suitable parent element for the voice button.");
      }
    }
  });
}

    VoiceRecorder();









