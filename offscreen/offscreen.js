// offscreen/offscreen.js
console.log('[Offscreen] Script loaded.');

let mediaRecorder;
let recordedChunks = [];
let mediaStream; // To keep track of the stream

// Listen for messages from the service worker
chrome.runtime.onMessage.addListener(handleMessages);

async function handleMessages(message, sender, sendResponse) {
    console.log(`[Offscreen] handleMessages: Received message type: ${message.type}, target: ${message.target}`, message.payload || '');
    console.log(`[Offscreen] handleMessages: Current state - mediaStream: ${mediaStream ? 'exists' : 'null'}, mediaRecorder: ${mediaRecorder ? mediaRecorder.state : 'null'}`);

    if (message.target !== 'offscreen') {
        console.log('[Offscreen] Message not targeted for offscreen, ignoring.');
        return;
    }

    switch (message.type) {
        case 'startTabRecording':
            console.log('[Offscreen] startTabRecording: Initiating.');
            try {
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    console.warn('[Offscreen] startTabRecording: Recording already in progress. Stopping existing one first.');
                    mediaRecorder.stop(); // This will trigger onstop, which should clean up.
                    // It might be better to await a full stop or handle this more gracefully
                    await new Promise(resolve => setTimeout(resolve, 100)); // Short delay for cleanup
                }
                
                console.log('[Offscreen] startTabRecording: Attempting to get user media with streamId:', message.streamId);
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        mandatory: {
                            chromeMediaSource: 'tab',
                            chromeMediaSourceId: message.streamId
                        }
                    },
                    audio: {
                        mandatory: {
                            chromeMediaSource: 'tab',
                            chromeMediaSourceId: message.streamId
                        }
                    }
                });
                mediaStream = stream;
                console.log('[Offscreen] startTabRecording: getUserMedia successful. mediaStream acquired.');

                stream.oninactive = () => {
                    console.log('[Offscreen] stream.oninactive called. Stopping recorder if active.');
                    if (mediaRecorder && mediaRecorder.state === 'recording') {
                        mediaRecorder.stop();
                    }
                };
                
                const options = { mimeType: 'video/webm; codecs=vp9,opus' };
                // Basic fallback, could be more sophisticated
                if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                    console.warn(`[Offscreen] MIME type ${options.mimeType} not supported. Falling back.`);
                    options.mimeType = 'video/webm'; 
                }
                const actualMimeType = options.mimeType;
                console.log('[Offscreen] startTabRecording: Using MIME type:', actualMimeType);

                console.log('[Offscreen] startTabRecording: Creating MediaRecorder.');
                mediaRecorder = new MediaRecorder(stream, options);
                console.log(`[Offscreen] startTabRecording: MediaRecorder created. Initial state: ${mediaRecorder.state}`);
                
                recordedChunks = [];
                
                mediaRecorder.ondataavailable = (event) => {
                    console.log(`[Offscreen] mediaRecorder.ondataavailable: Fired. Chunk size: ${event.data.size}`);
                    if (event.data.size > 0) {
                        recordedChunks.push(event.data);
                    }
                };

                mediaRecorder.onstop = async () => {
                    console.log(`[Offscreen] mediaRecorder.onstop: Fired. Current state: ${mediaRecorder ? mediaRecorder.state : 'recorder gone'}. Total chunks: ${recordedChunks.length}`);
                    if (recordedChunks.length > 0) {
                        const completeBlob = new Blob(recordedChunks, { type: actualMimeType });
                        console.log(`[Offscreen] mediaRecorder.onstop: Complete video blob created. Size: ${completeBlob.size}, Type: ${completeBlob.type}`);

                        try {
                            const buffer = await completeBlob.arrayBuffer();
                            console.log(`[Offscreen] mediaRecorder.onstop: Converted Blob to ArrayBuffer. Size: ${buffer.byteLength}`);

                            chrome.runtime.sendMessage({
                                type: 'VIDEO_BUFFER_READY',
                                target: 'service-worker',
                                payload: { buffer: buffer, mimeType: actualMimeType }
                            }, response => {
                                 if (chrome.runtime.lastError) {
                                    console.error('[Offscreen] mediaRecorder.onstop: Error sending VIDEO_BUFFER_READY:', chrome.runtime.lastError.message);
                                 } else {
                                    console.log('[Offscreen] mediaRecorder.onstop: VIDEO_BUFFER_READY message sent successfully.');
                                 }
                            });
                        } catch (error) {
                             console.error('[Offscreen] mediaRecorder.onstop: Error processing blob or sending message:', error);
                             chrome.runtime.sendMessage({
                                type: 'RECORDING_ERROR',
                                target: 'service-worker',
                                error: 'Failed to process video blob in offscreen.js'
                            });
                        }
                    } else {
                        console.warn("[Offscreen] mediaRecorder.onstop: No data chunks recorded. Sending error.");
                         chrome.runtime.sendMessage({
                            type: 'RECORDING_ERROR',
                            target: 'service-worker',
                            error: 'No video data recorded in offscreen.js'
                         });
                    }
                    // Clean up
                    console.log('[Offscreen] mediaRecorder.onstop: Cleaning up resources.');
                    recordedChunks = [];
                    if (mediaStream) {
                        mediaStream.getTracks().forEach(track => track.stop());
                        console.log('[Offscreen] mediaRecorder.onstop: MediaStream tracks stopped.');
                    }
                    mediaStream = null;
                    // mediaRecorder is already stopped, setting to null might be redundant if a new one is created
                    // but good for explicit cleanup if stop is called without immediate restart.
                    mediaRecorder = null; 
                    console.log('[Offscreen] mediaRecorder.onstop: mediaStream and mediaRecorder set to null.');
                };

                mediaRecorder.onerror = (event) => {
                    console.error('[Offscreen] mediaRecorder.onerror: Recording error:', event.error);
                    chrome.runtime.sendMessage({
                        type: 'RECORDING_ERROR',
                        target: 'service-worker',
                        error: `MediaRecorder error in offscreen: ${event.error.name} - ${event.error.message}`
                    });
                    // No need to call stop() here, onerror usually precedes onstop or implies it.
                };
                
                console.log('[Offscreen] startTabRecording: Starting MediaRecorder.');
                mediaRecorder.start();
                console.log(`[Offscreen] startTabRecording: MediaRecorder started. Current state: ${mediaRecorder.state}`);
                sendResponse({ success: true, message: 'Recording started in offscreen.' });

            } catch (error) {
                console.error('[Offscreen] startTabRecording: Error during setup:', error);
                // Ensure cleanup if error occurs mid-setup
                if (mediaStream) {
                    mediaStream.getTracks().forEach(track => track.stop());
                    mediaStream = null;
                }
                mediaRecorder = null;
                sendResponse({ success: false, error: `Failed to start recording in offscreen: ${error.message}` });
            }
            break;

        case 'stopTabRecording':
            console.log(`[Offscreen] stopTabRecording: Received. Current mediaRecorder state: ${mediaRecorder ? mediaRecorder.state : 'null'}`);
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                console.log('[Offscreen] stopTabRecording: MediaRecorder is recording, calling stop().');
                mediaRecorder.stop(); // This triggers 'onstop'
                sendResponse({ success: true, message: 'Recording stopping in offscreen.' });
            } else {
                console.warn(`[Offscreen] stopTabRecording: MediaRecorder not recording or not initialized. State: ${mediaRecorder ? mediaRecorder.state : 'null'}`);
                if (mediaStream) {
                    console.log('[Offscreen] stopTabRecording: mediaStream exists, stopping tracks.');
                    mediaStream.getTracks().forEach(track => track.stop());
                    mediaStream = null;
                } else {
                    console.log('[Offscreen] stopTabRecording: mediaStream is null.');
                }
                // If mediaRecorder exists but not recording (e.g. 'inactive'), onstop might not have cleaned it.
                if (mediaRecorder) {
                    console.log('[Offscreen] stopTabRecording: mediaRecorder exists but not recording, setting to null.');
                    mediaRecorder = null;
                }
                sendResponse({ success: false, message: 'Recorder was not active or initialized in offscreen.' });
            }
            break;

        default:
            console.warn(`[Offscreen] Unknown message type: ${message.type}`);
            sendResponse({ success: false, error: 'Unknown message type for offscreen' });
    }
    return true; // Indicate async response potential
}

console.log('[Offscreen] Event listener for messages is active.');
