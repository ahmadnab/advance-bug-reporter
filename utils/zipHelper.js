// utils/zipHelper.js
console.log("zipHelper.js: Attempting static import of JSZip from local ESM.");

// Attempt static import of the local ES module.
// This assumes jszip.esm.js (containing the actual bundled code)
// is a valid ES module with a default export or a named 'JSZip' export.
import JSZipDefault, * as JSZipNamespace from '../libs/jszip.esm.js';

let JSZip;

// Check for default export (most common for ESM builds like those from esm.sh's deeper paths)
if (JSZipDefault && typeof JSZipDefault === 'function' && JSZipDefault.prototype && JSZipDefault.prototype.file) {
    JSZip = JSZipDefault;
    console.log("JSZip loaded via default static import from local ESM.");
} 
// Check for named export 'JSZip' within the namespace
else if (JSZipNamespace.JSZip && typeof JSZipNamespace.JSZip === 'function' && JSZipNamespace.JSZip.prototype && JSZipNamespace.JSZip.prototype.file) {
    JSZip = JSZipNamespace.JSZip;
    console.log("JSZip loaded via named export (JSZipNamespace.JSZip) from local ESM.");
} 
// Check if the default export is nested under 'default' in the namespace object (another common pattern)
else if (JSZipNamespace.default && typeof JSZipNamespace.default === 'function' && JSZipNamespace.default.prototype && JSZipNamespace.default.prototype.file) {
    JSZip = JSZipNamespace.default;
    console.log("JSZip loaded via named export (JSZipNamespace.default) from local ESM.");
} 
// Check if the entire namespace object is the JSZip constructor (less common but possible)
else if (typeof JSZipNamespace === 'function' && JSZipNamespace.prototype && JSZipNamespace.prototype.file) {
    JSZip = JSZipNamespace;
    console.log("JSZip loaded because the entire imported namespace is the JSZip constructor.");
}
else {
    console.error("CRITICAL: Failed to statically import JSZip from local ESM. Neither default nor a valid named 'JSZip' export found or is not a valid JSZip constructor.", { JSZipDefault_type: typeof JSZipDefault, JSZipNamespace });
    JSZip = null;
}

// Final verification of the resolved JSZip variable
if (JSZip && (typeof JSZip !== 'function' || !JSZip.prototype || !JSZip.prototype.constructor || !JSZip.prototype.file)) {
    console.error("CRITICAL: JSZip was resolved but does not appear to be a valid JSZip constructor after initial checks.", { JSZip_resolved: JSZip });
    JSZip = null; // Invalidate if it's not the correct constructor
}

if (JSZip) {
    console.log("JSZip successfully initialized via static import from local ESM.");
} else {
    console.error("JSZip could not be initialized. Zipping functionality will be disabled.");
}

/**
 * Creates a ZIP file Blob containing the bug report data.
 * @param {Blob|null} videoBlobInput - The recorded video Blob (can be null if no video). Changed name to avoid confusion
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

console.log('zipHelper.js: Static import of JSZip attempted. Exporting createReportZip.');
