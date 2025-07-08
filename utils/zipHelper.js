// utils/zipHelper.js - Service Worker Compatible Version
console.log("zipHelper.js: Initializing...");

let JSZip = null;

// For service worker context, we need to load JSZip synchronously
if (typeof importScripts === 'function') {
    // We're in a service worker
    try {
        importScripts('../libs/jszip.min.js');
        JSZip = self.JSZip;
        console.log("JSZip loaded successfully in service worker");
    } catch (error) {
        console.error("Failed to load JSZip in service worker:", error);
    }
}

// If JSZip is still not loaded, we'll try dynamic import as a fallback
async function ensureJSZipLoaded() {
    if (JSZip) return true;
    
    try {
        // Try dynamic import
        const module = await import('../libs/jszip.min.js');
        JSZip = module.default || module.JSZip || self.JSZip || window.JSZip;
        
        if (!JSZip) {
            throw new Error("JSZip not found in imported module");
        }
        
        console.log("JSZip loaded via dynamic import");
        return true;
    } catch (error) {
        console.error("Failed to dynamically load JSZip:", error);
        return false;
    }
}

/**
 * Creates a ZIP file Blob containing the bug report data.
 * @param {Blob|null} videoBlobInput - The recorded video Blob (can be null if no video)
 * @param {Array<object>} consoleLogData - Array of console log objects
 * @param {Array<object>} networkLogData - Array of network log objects
 * @param {string} userDetailsText - A string containing the user's summary and description
 * @param {string} baseFileName - A base name for the files, e.g., from bug summary or Jira key
 * @returns {Promise<Blob|null>} A promise that resolves with the ZIP file Blob, or null on error
 */
export async function createReportZip(videoBlobInput, consoleLogData, networkLogData, userDetailsText, baseFileName = 'bug_report') {
    // Ensure JSZip is loaded
    await ensureJSZipLoaded();
    
    if (!JSZip) {
        console.error("[zipHelper] JSZip is not available. Cannot create ZIP file.");
        // Return a simple text file as fallback
        const fallbackText = `Bug Report - ${baseFileName}\n\n${userDetailsText}\n\nNote: ZIP creation failed. This is a text-only fallback.`;
        return new Blob([fallbackText], { type: 'text/plain' });
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

        // Add text details
        if (userDetailsText) {
            zip.file(`${baseFileName}_details.txt`, userDetailsText);
        }

        // Add console logs
        if (consoleLogData && consoleLogData.length > 0) {
            const consoleJsonString = JSON.stringify(consoleLogData, null, 2);
            zip.file(`${baseFileName}_console_logs.json`, consoleJsonString);
            
            // Also create a human-readable version
            const consoleText = formatConsoleLogsReadable(consoleLogData);
            zip.file(`${baseFileName}_console_logs.txt`, consoleText);
        } else {
            zip.file(`${baseFileName}_console_logs.txt`, "No console logs captured or provided.");
        }

        // Add network logs
        if (networkLogData && networkLogData.length > 0) {
            const networkJsonString = JSON.stringify(networkLogData, null, 2);
            zip.file(`${baseFileName}_network_logs.json`, networkJsonString);
            
            // Create a summary text file
            const networkSummary = createNetworkSummary(networkLogData);
            zip.file(`${baseFileName}_network_summary.txt`, networkSummary);
        } else {
            zip.file(`${baseFileName}_network_logs.txt`, "No network logs captured or provided.");
        }
        
        // Add video file
        if (videoBlobInput && videoBlobInput instanceof Blob && videoBlobInput.size > 0) {
            let videoExtension = '.webm';
            if (videoBlobInput.type) {
                if (videoBlobInput.type.includes('mp4')) videoExtension = '.mp4';
                else if (videoBlobInput.type.includes('webm')) videoExtension = '.webm';
                else if (videoBlobInput.type.includes('ogg')) videoExtension = '.ogg';
            }
            console.log(`[zipHelper] Adding video to ZIP: ${baseFileName}_recording${videoExtension}, Size: ${videoBlobInput.size}`);
            zip.file(`${baseFileName}_recording${videoExtension}`, videoBlobInput);
        }

        // Add metadata file
        const metadata = {
            created: new Date().toISOString(),
            fileName: baseFileName,
            contents: {
                hasVideo: !!(videoBlobInput && videoBlobInput.size > 0),
                consoleLogCount: consoleLogData ? consoleLogData.length : 0,
                networkLogCount: networkLogData ? networkLogData.length : 0
            }
        };
        zip.file('metadata.json', JSON.stringify(metadata, null, 2));

        // Generate ZIP file
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
        // Return a simple text file as fallback
        const fallbackText = `Bug Report - ${baseFileName}\n\n${userDetailsText}\n\nError creating ZIP: ${error.message}`;
        return new Blob([fallbackText], { type: 'text/plain' });
    }
}

/**
 * Formats console logs in a human-readable format
 */
function formatConsoleLogsReadable(consoleLogs) {
    let output = "Console Logs\n";
    output += "============\n\n";
    
    consoleLogs.forEach(log => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        const level = (log.level || 'log').toUpperCase().padEnd(5);
        const url = log.url ? ` [${new URL(log.url).pathname}]` : '';
        
        output += `[${time}] ${level}${url}\n`;
        
        // Format arguments
        if (log.args && log.args.length > 0) {
            log.args.forEach(arg => {
                if (typeof arg === 'object') {
                    try {
                        output += '  ' + JSON.stringify(arg, null, 2).split('\n').join('\n  ') + '\n';
                    } catch (e) {
                        output += '  [Complex Object]\n';
                    }
                } else {
                    output += '  ' + String(arg) + '\n';
                }
            });
        }
        output += '\n';
    });
    
    return output;
}

/**
 * Creates a human-readable network summary
 */
function createNetworkSummary(networkLogs) {
    const requests = {};
    
    // Group by request ID
    networkLogs.forEach(log => {
        const id = log.params?.requestId || log.requestId;
        if (!id) return;
        
        if (!requests[id]) {
            requests[id] = {};
        }
        requests[id][log.type] = log;
    });
    
    let summary = "Network Activity Summary\n";
    summary += "========================\n\n";
    
    let totalRequests = 0;
    let failedRequests = 0;
    let totalSize = 0;
    
    Object.entries(requests).forEach(([id, events]) => {
        const request = events['Network.requestWillBeSent'];
        const response = events['Network.responseReceived'];
        const finished = events['Network.loadingFinished'];
        const failed = events['Network.loadingFailed'];
        
        if (request) {
            totalRequests++;
            const url = request.params?.request?.url || 'Unknown URL';
            const method = request.params?.request?.method || 'Unknown';
            const status = response?.params?.response?.status || (failed ? 'Failed' : 'Pending');
            const size = finished?.params?.encodedDataLength || 0;
            
            totalSize += size;
            if (failed || (status >= 400)) failedRequests++;
            
            summary += `${method} ${url}\n`;
            summary += `  Status: ${status}`;
            if (size > 0) {
                summary += ` | Size: ${formatBytes(size)}`;
            }
            summary += '\n';
            
            if (failed) {
                summary += `  Error: ${failed.params?.errorText || 'Unknown error'}\n`;
            }
            
            if (response?.params?.response?.headers) {
                const contentType = response.params.response.headers['content-type'] || 
                                 response.params.response.headers['Content-Type'];
                if (contentType) {
                    summary += `  Content-Type: ${contentType}\n`;
                }
            }
            
            summary += '\n';
        }
    });
    
    summary += "Summary Statistics\n";
    summary += "-----------------\n";
    summary += `Total Requests: ${totalRequests}\n`;
    summary += `Failed Requests: ${failedRequests}\n`;
    summary += `Total Data Transferred: ${formatBytes(totalSize)}\n`;
    
    return summary;
}

/**
 * Formats bytes to human-readable string
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

console.log('zipHelper.js: Module loaded successfully');