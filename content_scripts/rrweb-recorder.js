// content_scripts/rrweb-recorder.js
(() => {
  // Check if already injected
  if (window.__rrwebRecorderInjected) {
    return;
  }
  window.__rrwebRecorderInjected = true;

  console.log('[rrweb-recorder] Initializing DOM recording...');

  // Load rrweb library dynamically
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('libs/rrweb.min.js');
  script.onload = initializeRecording;
  script.onerror = () => {
    console.error('[rrweb-recorder] Failed to load rrweb library');
  };
  document.head.appendChild(script);

  let stopFn = null;
  let events = [];
  let isRecording = false;

  function initializeRecording() {
    if (!window.rrweb) {
      console.error('[rrweb-recorder] rrweb not available after script load');
      return;
    }

    console.log('[rrweb-recorder] rrweb loaded, starting recording...');

    // Start recording
    stopFn = rrweb.record({
      emit(event) {
        // Store events locally
        events.push(event);
        
        // Send events in batches to avoid overwhelming message passing
        if (events.length >= 50 || event.type === rrweb.EventType.FullSnapshot) {
          sendEvents();
        }
      },
      // Recording options
      sampling: {
        // Sampling rates for different event types
        scroll: 150, // ms
        media: 800,
        input: 'last', // 'all' or 'last'
        mouse: 20, // ms
        drag: 100,
      },
      // Capture additional details
      recordCanvas: true,
      recordCrossOriginIframes: false, // For security
      // Mask sensitive inputs
      maskInputOptions: {
        password: true,
        email: true,
        tel: true,
      },
      // Block certain CSS classes from recording
      blockClass: 'rr-block',
      // Ignore certain CSS classes
      ignoreClass: 'rr-ignore',
      // Privacy options
      maskTextClass: 'rr-mask',
      maskAllInputs: false,
      // Performance options
      inlineStylesheet: true,
      hooks: {
        // Custom hooks for specific needs
        collectFonts: true,
      },
      // Slimmer DOM snapshots
      slimDOMOptions: {
        script: false,
        comment: false,
        headFavicon: false,
        headWhitespace: false,
        headMetaDescKeywords: false,
        headMetaSocial: true,
        headMetaRobots: false,
        headMetaHttpEquiv: false,
        headMetaAuthorship: false,
        headMetaVerification: false,
      },
    });

    isRecording = true;
    console.log('[rrweb-recorder] Recording started');

    // Set up periodic event flushing
    const flushInterval = setInterval(() => {
      if (events.length > 0) {
        sendEvents();
      }
    }, 5000); // Send every 5 seconds

    // Clean up function
    window.__rrwebCleanup = () => {
      clearInterval(flushInterval);
      if (stopFn) {
        stopFn();
      }
      sendEvents(); // Send any remaining events
      isRecording = false;
    };

    // Listen for stop message
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'STOP_RRWEB_RECORDING') {
        console.log('[rrweb-recorder] Received stop signal');
        if (window.__rrwebCleanup) {
          window.__rrwebCleanup();
        }
        sendResponse({ success: true, eventCount: events.length });
      }
    });
  }

  function sendEvents() {
    if (events.length === 0) return;

    const eventsToSend = [...events];
    events = []; // Clear the array

    try {
      chrome.runtime.sendMessage({
        type: 'RRWEB_EVENTS',
        payload: eventsToSend
      }, response => {
        if (chrome.runtime.lastError) {
          console.error('[rrweb-recorder] Failed to send events:', chrome.runtime.lastError);
          // Re-add events if sending failed
          events.unshift(...eventsToSend);
        }
      });
    } catch (error) {
      console.error('[rrweb-recorder] Error sending events:', error);
      events.unshift(...eventsToSend);
    }
  }

  // Handle page unload
  window.addEventListener('beforeunload', () => {
    if (isRecording && window.__rrwebCleanup) {
      window.__rrwebCleanup();
    }
  });

  // Add visual indicator that recording is active
  const indicator = document.createElement('div');
  indicator.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    width: 12px;
    height: 12px;
    background: #dc2626;
    border-radius: 50%;
    z-index: 999999;
    pointer-events: none;
    animation: rrwebPulse 2s infinite;
    box-shadow: 0 0 0 0 rgba(220, 38, 38, 1);
  `;
  
  const style = document.createElement('style');
  style.textContent = `
    @keyframes rrwebPulse {
      0% {
        box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.7);
      }
      70% {
        box-shadow: 0 0 0 10px rgba(220, 38, 38, 0);
      }
      100% {
        box-shadow: 0 0 0 0 rgba(220, 38, 38, 0);
      }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(indicator);
  
  // Store reference for cleanup
  window.__rrwebIndicator = indicator;
})();