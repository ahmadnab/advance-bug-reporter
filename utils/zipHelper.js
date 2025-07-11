// utils/zipHelper.js
console.log("zipHelper.js: Loading...");

// JSZip will be loaded globally from the jszip.esm.js file
// We need to handle the fact that it might be loaded as a UMD module
let JSZip = null;

// Try to get JSZip from global scope (it will be loaded by jszip.esm.js)
if (typeof globalThis.JSZip !== 'undefined') {
    JSZip = globalThis.JSZip;
    console.log("JSZip loaded from globalThis");
} else if (typeof self.JSZip !== 'undefined') {
    JSZip = self.JSZip;
    console.log("JSZip loaded from self");
} else if (typeof window !== 'undefined' && window.JSZip) {
    JSZip = window.JSZip;
    console.log("JSZip loaded from window");
} else {
    // Try to load it synchronously as the file should define it globally
    try {
        // In a service worker, we can use importScripts
        if (typeof importScripts === 'function') {
            importScripts('../libs/jszip.esm.js');
            JSZip = globalThis.JSZip || self.JSZip;
            console.log("JSZip loaded via importScripts");
        }
    } catch (e) {
        console.error("Failed to load JSZip via importScripts:", e);
    }
}

// Final check
if (!JSZip) {
    console.error("CRITICAL: JSZip could not be loaded!");
} else {
    console.log("JSZip successfully loaded, version:", JSZip.version || "unknown");
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
    if (!JSZip) {
        console.error("[zipHelper] JSZip is not available. Cannot create ZIP file.");
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

    try {
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
        
        // Add video file - with more checks
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
        console.error('[zipHelper] Error creating ZIP file during JSZip operation:', error);
        throw new Error(`Failed to create report ZIP during JSZip operation: ${error.message}`);
    }
}

console.log('zipHelper.js: Module loaded and ready');