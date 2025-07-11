// content_scripts/console-interceptor.js
// Fixed version that works in ISOLATED world and injects into MAIN world

(() => {
    // Check if already injected
    if (window.__consoleInterceptorInjected) {
        return;
    }
    window.__consoleInterceptorInjected = true;
    
    console.log('[ConsoleInterceptor] Injecting console interceptor...');
    
    // Create and inject script into the page's MAIN world
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected_scripts/console-main-world.js');
    
    // Inject the script
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => {
        // Optional: remove script tag after loading to keep DOM clean
        script.remove();
    };
    script.onerror = (e) => {
        console.error('[ConsoleInterceptor] Failed to load console-main-world.js:', e);
    };
    
    // Listen for messages from the injected script
    window.addEventListener('message', (event) => {
        // Only accept messages from the same window
        if (event.source !== window) return;
        
        // Check for our custom message type
        if (event.data && event.data.type === '__CONSOLE_LOG_INTERCEPTED__') {
            // Forward to service worker
            try {
                console.log('[ConsoleInterceptor] Sending CONSOLE_LOG_CAPTURED to service worker. Payload:', event.data.payload);
                chrome.runtime.sendMessage({
                    type: 'CONSOLE_LOG_CAPTURED',
                    payload: event.data.payload
                }, response => {
                    if (chrome.runtime.lastError) {
                        console.error('[ConsoleInterceptor] Failed to send log to service worker. Error:', chrome.runtime.lastError);
                    } else {
                        console.log('[ConsoleInterceptor] Service worker response for CONSOLE_LOG_CAPTURED:', response);
                    }
                });
            } catch (e) {
                console.error('[ConsoleInterceptor] Exception sending log:', e);
            }
        }
    });
    
    console.log('[ConsoleInterceptor] Message listener active in ISOLATED world.');
})();