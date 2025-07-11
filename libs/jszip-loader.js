// libs/jszip-loader.js
// Utility to load JSZip in the review page context

window.loadJSZip = async function() {
    if (window.JSZip) {
        return window.JSZip;
    }
    
    try {
        // Try loading from local file first
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('libs/jszip.esm.js');
        
        return new Promise((resolve, reject) => {
            script.onload = () => {
                if (window.JSZip) {
                    resolve(window.JSZip);
                } else {
                    reject(new Error('JSZip not found after loading local file'));
                }
            };
            script.onerror = () => reject(new Error('Failed to load local JSZip'));
            document.head.appendChild(script);
        });
    } catch (error) {
        console.warn('Failed to load local JSZip, trying CDN...', error);
        
        // Fallback to CDN
        const response = await fetch('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        const scriptText = await response.text();
        
        // Create a script element with the CDN content
        const script = document.createElement('script');
        script.textContent = scriptText;
        document.head.appendChild(script);
        
        if (window.JSZip) {
            return window.JSZip;
        } else {
            throw new Error('Failed to load JSZip from CDN');
        }
    }
};