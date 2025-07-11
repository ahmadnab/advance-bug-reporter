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
    recorderScript.textContent = `
      (() => {
        if (!window.rrweb || window.__rrwebMainWorldRecorder) {
          console.warn('[rrweb-recorder] rrweb not available or already initialized');
          return;
        }
        window.__rrwebMainWorldRecorder = true;
        
        console.log('[rrweb-recorder] Starting recording in MAIN world...');
        
        let events = [];
        let isRecording = true;
        
        // Start recording
        const stopFn = window.rrweb.record({
          emit(event) {
            if (!isRecording) return;
            
            // Store events
            events.push(event);
            
            // Send events in batches
            if (events.length >= 50 || event.type === 2) { // 2 is FullSnapshot
              window.postMessage({
                type: '__RRWEB_EVENTS__',
                events: [...events]
              }, '*');
              events = [];
            }
          },
          // Recording options
          sampling: {
            scroll: 150,
            media: 800,
            input: 'last',
            mouse: 20,
            drag: 100,
          },
          recordCanvas: true,
          recordCrossOriginIframes: false,
          maskInputOptions: {
            password: true,
            email: true,
            tel: true,
          },
          blockClass: 'rr-block',
          ignoreClass: 'rr-ignore',
          maskTextClass: 'rr-mask',
          maskAllInputs: false,
          inlineStylesheet: true,
          collectFonts: true,
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
        
        console.log('[rrweb-recorder] Recording started');
        
        // Set up periodic event flushing
        const flushInterval = setInterval(() => {
          if (events.length > 0 && isRecording) {
            window.postMessage({
              type: '__RRWEB_EVENTS__',
              events: [...events]
            }, '*');
            events = [];
          }
        }, 5000);
        
        // Stop recording function
        window.__stopRrwebRecording = () => {
          console.log('[rrweb-recorder] Stopping recording...');
          isRecording = false;
          clearInterval(flushInterval);
          
          if (stopFn) {
            stopFn();
          }
          
          // Send any remaining events
          if (events.length > 0) {
            window.postMessage({
              type: '__RRWEB_EVENTS__',
              events: [...events]
            }, '*');
            events = [];
          }
          
          // Send completion signal
          window.postMessage({
            type: '__RRWEB_RECORDING_STOPPED__'
          }, '*');
        };
        
        // Handle page unload
        window.addEventListener('beforeunload', () => {
          if (window.__stopRrwebRecording) {
            window.__stopRrwebRecording();
          }
        });
      })();
    `;
    document.head.appendChild(recorderScript);
    recorderScript.remove();
    
    // Add visual indicator
    const indicatorScript = document.createElement('script');
    indicatorScript.textContent = `
      (() => {
        const indicator = document.createElement('div');
        indicator.id = '__rrweb-recording-indicator';
        indicator.style.cssText = \`
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
        \`;
        
        const style = document.createElement('style');
        style.textContent = \`
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
        \`;
        document.head.appendChild(style);
        document.body.appendChild(indicator);
        
        window.__removeRrwebIndicator = () => {
          indicator.remove();
          style.remove();
        };
      })();
    `;
    document.head.appendChild(indicatorScript);
    indicatorScript.remove();
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
        chrome.runtime.sendMessage({
          type: 'RRWEB_EVENTS',
          payload: event.data.events
        }, response => {
          if (chrome.runtime.lastError) {
            console.error('[rrweb-recorder] Failed to send events:', chrome.runtime.lastError.message);
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
      stopScript.textContent = `
        if (window.__stopRrwebRecording) {
          window.__stopRrwebRecording();
        }
        if (window.__removeRrwebIndicator) {
          window.__removeRrwebIndicator();
        }
      `;
      document.head.appendChild(stopScript);
      stopScript.remove();
      
      sendResponse({ success: true });
    }
    return true;
  });
})();