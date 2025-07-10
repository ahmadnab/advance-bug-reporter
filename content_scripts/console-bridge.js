// content_scripts/console-bridge.js
// This runs in ISOLATED world and bridges messages from MAIN world to service worker

(function() {
    if (window.__consoleBridgeInjected) {
        return;
    }
    window.__consoleBridgeInjected = true;

    console.log('[ConsoleBridge] Bridge script loaded in ISOLATED world');

    // Listen for messages from the MAIN world console interceptor
    window.addEventListener('message', function(event) {
        // Only accept messages from the same window
        if (event.source !== window) return;
        
        // Check for our custom message type
        if (event.data && event.data.type === 'CONSOLE_LOG_FROM_PAGE') {
            // Forward to service worker
            try {
                chrome.runtime.sendMessage({
                    type: 'CONSOLE_LOG_CAPTURED',
                    payload: event.data.payload
                }, response => {
                    if (chrome.runtime.lastError) {
                        console.error('[ConsoleBridge] Failed to send console log to service worker:', chrome.runtime.lastError.message);
                    }
                });
            } catch (e) {
                console.error('[ConsoleBridge] Exception when sending to service worker:', e);
            }
        }
    });

    console.log('[ConsoleBridge] Listening for console messages from page');
})();