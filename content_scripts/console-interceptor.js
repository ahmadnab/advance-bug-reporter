// content_scripts/console-interceptor.js
(() => {
    // Check if the interceptor has already been injected to avoid multiple executions
    if (window.hasInjectedConsoleInterceptor) {
        // console.log('[ConsoleInterceptor] Already active.');
        return;
    }
    window.hasInjectedConsoleInterceptor = true;
    console.log('[ConsoleInterceptor] Script injected and running.'); // Log injection

    const originalConsole = {};
    const consoleMethodsToOverride = ['log', 'warn', 'error', 'info', 'debug', 'assert', 'clear', 'count', 'countReset', 'dir', 'dirxml', 'group', 'groupCollapsed', 'groupEnd', 'table', 'time', 'timeEnd', 'timeLog', 'trace'];

    function serializeArg(arg) {
        // ... (serialization logic remains the same) ...
        if (arg === undefined) { return 'undefined'; }
        if (arg === null) { return 'null'; }
        if (typeof arg === 'function') { return `[Function: ${arg.name || 'anonymous'}]`; }
        if (arg instanceof Error) { return `[Error: ${arg.name} - ${arg.message}${arg.stack ? `\\nStack: ${arg.stack}` : ''}]`; }
        if (arg instanceof HTMLElement) {
             let attributes = ''; if (arg.attributes) { for (let i = 0; i < arg.attributes.length; i++) { attributes += ` ${arg.attributes[i].name}="${arg.attributes[i].value}"`; } }
             return `<${arg.tagName.toLowerCase()}${attributes}>...</${arg.tagName.toLowerCase()}>`;
        }
        if (typeof arg === 'object') {
            try { return JSON.parse(JSON.stringify(arg)); } catch (e) {
                 if (Array.isArray(arg)) { return `[Array(${arg.length})]`; }
                 return `[Object: ${Object.prototype.toString.call(arg).slice(8, -1)}]`;
            }
        }
        return arg;
    }

    consoleMethodsToOverride.forEach(methodName => {
        if (typeof console[methodName] === 'function') {
            originalConsole[methodName] = console[methodName].bind(console);
            console.log(`[ConsoleInterceptor] Overriding console.${methodName}`); // Log override

            console[methodName] = (...args) => {
                // 1. Call original
                try { // Wrap original call in try...catch
                    originalConsole[methodName](...args);
                } catch (e) {
                    console.error('[ConsoleInterceptor] Error calling original console method:', e);
                }


                // 2. Serialize arguments
                let serializableArgs;
                try {
                    serializableArgs = args.map(arg => serializeArg(arg));
                } catch (e) {
                    serializableArgs = [`[Error serializing console arguments: ${e.message}]`];
                    originalConsole.error('[ConsoleInterceptor] Error during console argument serialization:', e);
                }

                // 3. Send the captured log to the service worker
                const logPayload = {
                    level: methodName,
                    args: serializableArgs,
                    timestamp: new Date().toISOString(),
                    url: window.location.href
                };
                console.log('[ConsoleInterceptor] Attempting to send message:', logPayload); // Log before sending
                try {
                    chrome.runtime.sendMessage({
                        type: 'CONSOLE_LOG_CAPTURED',
                        payload: logPayload
                    }, response => {
                        if (chrome.runtime.lastError) {
                            console.error('[ConsoleInterceptor] Failed to send console log to service worker:', chrome.runtime.lastError.message);
                        } else {
                            // console.log('[ConsoleInterceptor] Message sent successfully (response):', response); // Optional: log success
                        }
                    });
                } catch (e) {
                    console.error('[ConsoleInterceptor] Exception when trying to send console log:', e);
                }
            };
        }
    });
})();
