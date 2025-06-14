// offscreen/offscreen.js
console.log('Offscreen document script loaded.');

let mediaRecorder;
let recordedChunks = [];
let mediaStream; // To keep track of the stream

// Listen for messages from the service worker
chrome.runtime.onMessage.addListener(handleMessages);

async function handleMessages(message, sender, sendResponse) {
    console.log('[Offscreen] Received message:', message.type, message.payload || '');
    if (message.target !== 'offscreen') {
        return;
    }

    switch (message.type) {
        case 'startTabRecording':
            try {
                // ... (start recording logic remains the same) ...
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    console.warn('[Offscreen] Recording already in progress. Stopping existing.');
                    mediaRecorder.stop();
                    await new Promise(resolve => { /* ... wait ... */ });
                }
                console.log('[Offscreen] Starting tab recording with streamId:', message.streamId);
                const stream = await navigator.mediaDevices.getUserMedia({ /* ... constraints ... */ });
                mediaStream = stream;
                stream.oninactive = () => { /* ... stop recorder ... */ };
                const options = { mimeType: 'video/webm; codecs=vp9,opus' };
                // ... (mime type fallback logic) ...
                const actualMimeType = options.mimeType || 'video/webm';
                mediaRecorder = new MediaRecorder(stream, options);
                recordedChunks = [];
                mediaRecorder.ondataavailable = (event) => { /* ... push chunks ... */ };

                // --- Modified onstop handler ---
                mediaRecorder.onstop = async () => { // Make handler async
                    console.log('[Offscreen] MediaRecorder stopped. Total chunks:', recordedChunks.length);
                    if (recordedChunks.length > 0) {
                        const completeBlob = new Blob(recordedChunks, { type: actualMimeType });
                        console.log('[Offscreen] Complete video blob created, size:', completeBlob.size, 'type:', completeBlob.type);

                        try {
                            // Convert Blob to ArrayBuffer
                            const buffer = await completeBlob.arrayBuffer();
                            console.log('[Offscreen] Converted Blob to ArrayBuffer, size:', buffer.byteLength);

                            // Send ArrayBuffer and original MIME type
                            chrome.runtime.sendMessage({
                                type: 'VIDEO_BUFFER_READY', // *** NEW MESSAGE TYPE ***
                                target: 'service-worker',
                                payload: {
                                    buffer: buffer,
                                    mimeType: actualMimeType
                                }
                            }, response => {
                                 if (chrome.runtime.lastError) {
                                    console.error('[Offscreen] Error sending VIDEO_BUFFER_READY message:', chrome.runtime.lastError.message);
                                 } else {
                                    console.log('[Offscreen] VIDEO_BUFFER_READY message sent successfully.');
                                 }
                            });
                        } catch (error) {
                             console.error('[Offscreen] Error converting Blob to ArrayBuffer or sending:', error);
                             chrome.runtime.sendMessage({
                                type: 'RECORDING_ERROR',
                                target: 'service-worker',
                                error: 'Failed to process video blob data in offscreen document.'
                            });
                        }
                    } else {
                        console.warn("[Offscreen] No data chunks recorded. Sending error.");
                         chrome.runtime.sendMessage({ /* ... RECORDING_ERROR ... */ });
                    }
                    // Clean up
                    recordedChunks = [];
                    if (mediaStream) { /* ... stop tracks ... */ }
                    mediaRecorder = null;
                };
                // --- End of modified onstop handler ---

                mediaRecorder.onerror = (event) => { /* ... error handling ... */ };
                mediaRecorder.start();
                console.log('[Offscreen] MediaRecorder started, state:', mediaRecorder.state);
                sendResponse({ success: true, message: 'Recording started.' });

            } catch (error) { /* ... error handling ... */ }
            break; // End of startTabRecording case

        case 'stopTabRecording':
             // ... (stopTabRecording logic remains the same) ...
            console.log('[Offscreen] Received stopTabRecording message.');
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop(); // This triggers 'onstop'
                console.log('[Offscreen] MediaRecorder stop() called.');
                sendResponse({ success: true, message: 'Recording stopping.' });
            } else {
                console.warn('[Offscreen] MediaRecorder not recording or not initialized when stop called.');
                if (mediaStream) {
                    mediaStream.getTracks().forEach(track => track.stop());
                    mediaStream = null;
                }
                sendResponse({ success: false, message: 'Recorder was not active.' });
            }
            break; // End of stopTabRecording case

        default:
            console.warn('[Offscreen] Unknown message type received:', message.type);
            sendResponse({ success: false, error: 'Unknown message type for offscreen' });
    }
    return true; // Indicate async response potential
}

console.log('Offscreen document event listener for messages is active.');
