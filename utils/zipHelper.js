// utils/zipHelper.js
console.log("zipHelper.js: Loading JSZip library");

// For Chrome extensions with module service workers, we need to use dynamic import
// and handle the fact that most CDN versions of JSZip are UMD, not ES modules
let JSZip = null;

// Initialize JSZip asynchronously
async function initializeJSZip() {
    if (JSZip) return JSZip;
    
    try {
        // Try to dynamically import the local file
        const module = await import('../libs/jszip.esm.js');
        
        // Handle different possible module formats
        if (module.default && typeof module.default === 'function') {
            JSZip = module.default;
        } else if (module.JSZip && typeof module.JSZip === 'function') {
            JSZip = module.JSZip;
        } else if (typeof module === 'function') {
            JSZip = module;
        } else {
            // If the module doesn't export JSZip properly, we'll need to load it differently
            throw new Error('JSZip not found in imported module');
        }
        
        console.log("JSZip loaded successfully via dynamic import");
        return JSZip;
    } catch (error) {
        console.error("Failed to load JSZip:", error);
        
        // Alternative: Load JSZip from a CDN that provides proper ES modules
        try {
            const response = await fetch('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
            const text = await response.text();
            const blob = new Blob([text], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            const module = await import(url);
            URL.revokeObjectURL(url);
            
            JSZip = module.default || module.JSZip || module;
            console.log("JSZip loaded from CDN");
            return JSZip;
        } catch (cdnError) {
            console.error("Failed to load JSZip from CDN:", cdnError);
            return null;
        }
    }
}

/**
 * Creates a ZIP file Blob containing the bug report data.
 * @param {Blob|null} videoBlobInput - The recorded video Blob (can be null if no video).
 * @param {Array<object>} consoleLogData - Array of console log objects.
 * @param {Array<object>} networkLogData - Array of network log objects.
 * @param {string} userDetailsText - A string containing the user's summary and description.
 * @param {string} baseFileName - A base name for the files, e.g., from bug summary or Jira key.
 * @returns {Promise<Blob|null>} A promise that resolves with the ZIP file Blob, or null on error.
 */
export async function createReportZip(videoBlobInput, consoleLogData, networkLogData, userDetailsText, baseFileName = 'bug_report') {
    // Ensure JSZip is loaded
    const JSZipLib = await initializeJSZip();
    
    if (!JSZipLib) {
        console.error("[zipHelper] JSZip could not be loaded. Cannot create ZIP file.");
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
        const zip = new JSZipLib();

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
        console.error('[zipHelper] Error creating ZIP file:', error);
        throw new Error(`Failed to create report ZIP: ${error.message}`);
    }
}

console.log('zipHelper.js: Module initialized');