// utils/zipHelper.js
console.log("zipHelper.js: Loading...");

// Dynamic import approach for better compatibility
let JSZip = null;

// Try to load JSZip from global scope if available
if (typeof self !== 'undefined' && self.JSZip) {
  JSZip = self.JSZip;
  console.log("JSZip loaded from global scope");
}

// Function to dynamically load JSZip
async function loadJSZip() {
  if (JSZip) return JSZip;
  
  try {
    // Try dynamic import
    const module = await import('../libs/jszip.esm.js');
    
    // Check various possible export patterns
    if (module.default && typeof module.default === 'function' && module.default.prototype && module.default.prototype.file) {
      JSZip = module.default;
      console.log("JSZip loaded via default export from dynamic import");
    } else if (module.JSZip && typeof module.JSZip === 'function') {
      JSZip = module.JSZip;
      console.log("JSZip loaded via named export from dynamic import");
    } else if (typeof module === 'function' && module.prototype && module.prototype.file) {
      JSZip = module;
      console.log("JSZip loaded as direct export from dynamic import");
    }
    
    if (!JSZip) {
      throw new Error('Failed to find valid JSZip constructor in imported module');
    }
    
    return JSZip;
  } catch (error) {
    console.error("[zipHelper] Failed to dynamically load JSZip:", error);
    
    // Fallback: try to load via script tag injection if in content script context
    if (typeof document !== 'undefined') {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('libs/jszip.esm.js');
        script.onload = () => {
          if (window.JSZip) {
            JSZip = window.JSZip;
            console.log("JSZip loaded via script tag");
            resolve(JSZip);
          } else {
            reject(new Error('JSZip not available after script load'));
          }
        };
        script.onerror = () => reject(new Error('Failed to load JSZip script'));
        document.head.appendChild(script);
      });
    }
    
    throw error;
  }
}

/**
 * Creates a ZIP file Blob containing the bug report data.
 * @param {Blob|null} videoBlobInput - The recorded video Blob (can be null if no video).
 * @param {Array<object>} consoleLogData - Array of console log objects.
 * @param {Array<object>} networkLogData - Array of network log objects.
 * @param {string} userDetailsText - A string containing the user's summary and description.
 * @param {string} baseFileName - A base name for the files, e.g., from bug summary or Jira key.
 * @returns {Promise<Blob|null>} A promise that resolves with the ZIP file Blob, or null on error or if JSZip failed to load.
 */
export async function createReportZip(videoBlobInput, consoleLogData, networkLogData, userDetailsText, baseFileName = 'bug_report') {
  try {
    // Ensure JSZip is loaded
    await loadJSZip();
    
    if (!JSZip) {
      console.error("[zipHelper] JSZip is not available after load attempt. Cannot create ZIP file.");
      return null;
    }

    console.log("[zipHelper] createReportZip called. videoBlobInput:", videoBlobInput);
    if (videoBlobInput) {
      console.log("[zipHelper] videoBlobInput details - Size:", videoBlobInput.size, "Type:", videoBlobInput.type, "Is Blob:", videoBlobInput instanceof Blob);
    } else {
      console.warn("[zipHelper] videoBlobInput is null or undefined.");
    }

    if (!videoBlobInput && (!consoleLogData || consoleLogData.length === 0) && (!networkLogData || networkLogData.length === 0)) {
      console.warn('[zipHelper] No data provided to create a ZIP file.');
      return null;
    }

    const zip = new JSZip();

    if (userDetailsText) {
      zip.file(`${baseFileName}_details.txt`, userDetailsText);
    }
    
    if (consoleLogData && consoleLogData.length > 0) {
      const consoleJsonString = JSON.stringify(consoleLogData, null, 2);
      zip.file(`${baseFileName}_console_logs.json`, consoleJsonString);
    } else {
      zip.file(`${baseFileName}_console_logs.txt`, "No console logs captured or provided.");
    }
    
    if (networkLogData && networkLogData.length > 0) {
      const networkJsonString = JSON.stringify(networkLogData, null, 2);
      zip.file(`${baseFileName}_network_logs.json`, networkJsonString);
    } else {
      zip.file(`${baseFileName}_network_logs.txt`, "No network logs captured or provided.");
    }
    
    // Add video file with more checks
    if (videoBlobInput && videoBlobInput instanceof Blob && videoBlobInput.size > 0) {
      let videoExtension = '.webm';
      if (videoBlobInput.type && videoBlobInput.type.includes('mp4')) videoExtension = '.mp4';
      console.log(`[zipHelper] Adding video to ZIP: ${baseFileName}_recording${videoExtension}, Size: ${videoBlobInput.size}`);
      zip.file(`${baseFileName}_recording${videoExtension}`, videoBlobInput);
    } else if (videoBlobInput) {
      console.warn(`[zipHelper] videoBlobInput was provided but is not a valid Blob or is empty. Size: ${videoBlobInput.size}, Is Blob: ${videoBlobInput instanceof Blob}. Video not added to ZIP.`);
    } else {
      console.log("[zipHelper] No videoBlobInput to add to ZIP.");
    }

    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
      streamFiles: true
    });

    console.log('[zipHelper] ZIP file created successfully, size:', zipBlob.size);
    return zipBlob;

  } catch (error) {
    console.error('[zipHelper] Error creating ZIP file:', error);
    throw new Error(`Failed to create report ZIP: ${error.message}`);
  }
}

console.log('zipHelper.js: Module initialized');