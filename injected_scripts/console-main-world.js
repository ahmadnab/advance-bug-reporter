(() => {
    // Check if the interceptor has already been injected in MAIN world
    if (window.__hasInjectedConsoleInterceptor) {
        return;
    }
    window.__hasInjectedConsoleInterceptor = true;
    console.log('[ConsoleInterceptor] Script injected in MAIN world.');
    
    const originalConsole = {};
    const consoleMethodsToOverride = ['log', 'warn', 'error', 'info', 'debug', 'assert', 'clear', 'count', 'countReset', 'dir', 'dirxml', 'group', 'groupCollapsed', 'groupEnd', 'table', 'time', 'timeEnd', 'timeLog', 'trace'];
    
    function serializeArg(arg) {
        if (arg === undefined) { return 'undefined'; }
        if (arg === null) { return 'null'; }
        if (typeof arg === 'function') { return `[Function: ${arg.name || 'anonymous'}]`; }
        if (arg instanceof Error) { 
            return `[Error: ${arg.name} - ${arg.message}${arg.stack ? `\\nStack: ${arg.stack}` : ''}]`; 
        }
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
    
    consoleMethodsToOverride.forEach(methodName => {
        if (typeof console[methodName] === 'function') {
            originalConsole[methodName] = console[methodName].bind(console);
            
            console[methodName] = (...args) => {
                // 1. Call original
                try {
                    originalConsole[methodName](...args);
                } catch (e) {
                    // Ignore errors in original console
                }
                
                // 2. Serialize arguments
                let serializableArgs;
                try {
                    serializableArgs = args.map(arg => serializeArg(arg));
                } catch (e) {
                    serializableArgs = [`[Error serializing console arguments: ${e.message}]`];
                }
                
                // 3. Send to content script via custom event
                const logPayload = {
                    level: methodName,
                    args: serializableArgs,
                    timestamp: new Date().toISOString(),
                    url: window.location.href
                };
                
                window.postMessage({
                    type: '__CONSOLE_LOG_INTERCEPTED__',
                    payload: logPayload
                }, '*');
            };
        }
    });
})();
