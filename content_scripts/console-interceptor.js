// content_scripts/console-interceptor.js
(() => {
    // Check if the interceptor has already been injected to avoid multiple executions
    if (window.hasInjectedConsoleInterceptor) {
        return;
    }
    window.hasInjectedConsoleInterceptor = true;
    console.log('[ConsoleInterceptor] Script injected and running.');

    const originalConsole = {};
    const consoleMethodsToOverride = ['log', 'warn', 'error', 'info', 'debug', 'assert', 'clear', 'count', 'countReset', 'dir', 'dirxml', 'group', 'groupCollapsed', 'groupEnd', 'table', 'time', 'timeEnd', 'timeLog', 'trace'];

    function serializeArg(arg) {
        if (arg === undefined) { return 'undefined'; }
        if (arg === null) { return 'null'; }
        if (typeof arg === 'function') { return `[Function: ${arg.name || 'anonymous'}]`; }
        if (arg instanceof Error) { return `[Error: ${arg.name} - ${arg.message}${arg.stack ? `\nStack: ${arg.stack}` : ''}]`; }
        if (arg instanceof HTMLElement) {
             let attributes = ''; 
             if (arg.attributes) { 
                 for (let i = 0; i < arg.attributes.length; i++) { 
                     attributes += ` ${arg.attributes[i].name}="${arg.attributes[i].value}"`; 
                 } 
             }
             return `<${arg.tagName.toLowerCase()}${attributes}>...</${arg.tagName.toLowerCase()}>`;
        }
        if (typeof arg === 'object') {
            try { 
                return JSON.parse(JSON.stringify(arg)); 
            } catch (e) {
                if (Array.isArray(arg)) { 
                    return `[Array(${arg.length})]`; 
                }
                return `[Object: ${Object.prototype.toString.call(arg).slice(8, -1)}]`;
            }
        }
        return arg;
    }

    // Create a custom event dispatcher since we're in MAIN world
    function sendLogToExtension(logData) {
        // Use custom events to communicate with content script in ISOLATED world
        window.postMessage({
            type: 'CONSOLE_LOG_FROM_PAGE',
            payload: logData
        }, '*');
    }

    consoleMethodsToOverride.forEach(methodName => {
        if (typeof console[methodName] === 'function') {
            originalConsole[methodName] = console[methodName].bind(console);
            
            console[methodName] = (...args) => {
                // 1. Call original
                try {
                    originalConsole[methodName](...args);
                } catch (e) {
                    // Fallback if original console method fails
                }

                // 2. Serialize arguments
                let serializableArgs;
                try {
                    serializableArgs = args.map(arg => serializeArg(arg));
                } catch (e) {
                    serializableArgs = [`[Error serializing console arguments: ${e.message}]`];
                }

                // 3. Send the captured log via postMessage
                const logPayload = {
                    level: methodName,
                    args: serializableArgs,
                    timestamp: new Date().toISOString(),
                    url: window.location.href
                };
                
                sendLogToExtension(logPayload);
            };
        }
    });

    // Also inject a bridge script in ISOLATED world to relay messages
    const script = document.createElement('script');
    script.textContent = `
        (function() {
            // This runs in ISOLATED world and can access chrome.runtime
            window.addEventListener('message', function(event) {
                if (event.source !== window) return;
                if (event.data.type === 'CONSOLE_LOG_FROM_PAGE') {
                    // Send to service worker
                    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                        chrome.runtime.sendMessage({
                            type: 'CONSOLE_LOG_CAPTURED',
                            payload: event.data.payload
                        });
                    }
                }
            });
        })();
    `;
    
    // This part needs to be injected by the service worker separately in ISOLATED world
    // The above script won't work here since we're in MAIN world
    
    console.log('[ConsoleInterceptor] Console methods overridden successfully');
})();