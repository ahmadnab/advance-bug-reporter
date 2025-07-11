// content_scripts/rrweb-recorder.js
(() => {
  // Check if already injected
  if (window.__rrwebRecorderInjected) {
    return;
  }
  window.__rrwebRecorderInjected = true;

  console.log('[rrweb-recorder] Initializing DOM recording...');

  // Inject rrweb library into the page
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('libs/rrweb.min.js');
  script.onload = () => {
    console.log('[rrweb-recorder] rrweb library loaded, injecting recorder...');
    
    // After rrweb loads, inject the recording logic
    const recorderScript = document.createElement('script');
    recorderScript.src = chrome.runtime.getURL('injected_scripts/rrweb-recorder-main-world.js');
    recorderScript.onload = () => {
        recorderScript.remove(); // Clean up
        
        // Now inject the indicator script
        const indicatorScript = document.createElement('script');
        indicatorScript.src = chrome.runtime.getURL('injected_scripts/rrweb-indicator.js');
        indicatorScript.onload = () => {
            indicatorScript.remove(); // Clean up
        };
        indicatorScript.onerror = (e) => {
            console.error('[rrweb-recorder] Failed to load rrweb-indicator.js:', e);
        };
        (document.head || document.documentElement).appendChild(indicatorScript);
    };
    recorderScript.onerror = (e) => {
        console.error('[rrweb-recorder] Failed to load rrweb-recorder-main-world.js:', e);
    };
    (document.head || document.documentElement).appendChild(recorderScript);
  };
  
  script.onerror = () => {
    console.error('[rrweb-recorder] Failed to load rrweb library');
  };
  
  document.head.appendChild(script);

  // Listen for events from MAIN world
  window.addEventListener('message', (event) => {
    // Only accept messages from the same window
    if (event.source !== window) return;
    
    if (event.data && event.data.type === '__RRWEB_EVENTS__') {
      // Forward to service worker
      try {
        console.log('[rrweb-recorder] Sending RRWEB_EVENTS to service worker. Event count:', event.data.events ? event.data.events.length : 0, 'Payload:', event.data.events);
        chrome.runtime.sendMessage({
          type: 'RRWEB_EVENTS',
          payload: event.data.events
        }, response => {
          if (chrome.runtime.lastError) {
            console.error('[rrweb-recorder] Failed to send events. Error:', chrome.runtime.lastError);
          } else {
            console.log('[rrweb-recorder] Service worker response for RRWEB_EVENTS:', response);
          }
        });
      } catch (error) {
        console.error('[rrweb-recorder] Error sending events:', error);
      }
    }
    
    if (event.data && event.data.type === '__RRWEB_RECORDING_STOPPED__') {
      console.log('[rrweb-recorder] Recording stopped signal received');
    }
  });

  // Handle stop message from service worker
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'STOP_RRWEB_RECORDING') {
      console.log('[rrweb-recorder] Received stop signal from service worker');
      
      // Inject stop command
      const stopScript = document.createElement('script');
      stopScript.src = chrome.runtime.getURL('injected_scripts/rrweb-stop.js');
      stopScript.onload = () => {
          stopScript.remove(); // Clean up
      };
      stopScript.onerror = (e) => {
          console.error('[rrweb-recorder] Failed to load rrweb-stop.js:', e);
      };
      (document.head || document.documentElement).appendChild(stopScript);
      
      sendResponse({ success: true });
    }
    return true;
  });
})();