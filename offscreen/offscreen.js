// offscreen/offscreen.js
console.log('Offscreen document script loaded.');

let mediaRecorder;
let recordedChunks = [];
let mediaStream; // To keep track of the stream

// Listen for messages from the service worker
chrome.runtime.onMessage.addListener(handleMessages);

async function handleMessages(message, sender, sendResponse) {
    console.log('[Offscreen] Received message:', message.type, message.payload || '');
    
    // Always send response to avoid "Receiving end does not exist" error
    if (message.target !== 'offscreen') {
        sendResponse({ success: false, error: 'Not for offscreen' });
        return false;
    }

    switch (message.type) {
        case 'startTabRecording':
            handleStartRecording(message, sendResponse);
            return true; // Will respond asynchronously
            
        case 'stopTabRecording':
            handleStopRecording(sendResponse);
            return true; // Will respond asynchronously
            
        default:
            console.warn('[Offscreen] Unknown message type received:', message.type);
            sendResponse({ success: false, error: 'Unknown message type for offscreen' });
            return false;
    }
}

async function handleStartRecording(message, sendResponse) {
    try {
        // Clean up any existing recording
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            console.warn('[Offscreen] Recording already in progress. Stopping existing.');
            await stopExistingRecording();
        }
        
        console.log('[Offscreen] Starting tab recording with streamId:', message.streamId);
        
        // Get media stream
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: message.streamId
                }
            },
            video: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: message.streamId
                }
            }
        });
        
        mediaStream = stream;
        
        // Handle stream becoming inactive
        stream.oninactive = () => {
            console.log('[Offscreen] Stream became inactive');
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
            }
        };
        
        // Set up MediaRecorder with fallback options
        const options = { mimeType: 'video/webm; codecs=vp9,opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            console.warn('[Offscreen] VP9 codec not supported, trying VP8');
            options.mimeType = 'video/webm; codecs=vp8,opus';
            
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                console.warn('[Offscreen] VP8 codec not supported, trying basic webm');
                options.mimeType = 'video/webm';
                
                if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                    console.warn('[Offscreen] WebM not supported, using default');
                    delete options.mimeType;
                }
            }
        }
        
        const actualMimeType = options.mimeType || 'video/webm';
        mediaRecorder = new MediaRecorder(stream, options);
        recordedChunks = [];
        
        // Set up event handlers
        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                recordedChunks.push(event.data);
                console.log('[Offscreen] Data chunk received, size:', event.data.size);
            }
        };
        
        mediaRecorder.onstop = async () => {
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
                        type: 'VIDEO_BUFFER_READY',
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
                chrome.runtime.sendMessage({
                    type: 'RECORDING_ERROR',
                    target: 'service-worker',
                    error: 'No video data was recorded.'
                });
            }
            
            // Clean up
            cleanup();
        };
        
        mediaRecorder.onerror = (event) => {
            console.error('[Offscreen] MediaRecorder error:', event.error);
            chrome.runtime.sendMessage({
                type: 'RECORDING_ERROR',
                target: 'service-worker',
                error: `MediaRecorder error: ${event.error}`
            });
            cleanup();
        };
        
        // Start recording
        mediaRecorder.start(1000); // Capture in 1-second chunks
        console.log('[Offscreen] MediaRecorder started, state:', mediaRecorder.state);
        
        sendResponse({ success: true, message: 'Recording started.' });
        
    } catch (error) {
        console.error('[Offscreen] Error starting recording:', error);
        sendResponse({ success: false, error: error.message });
        cleanup();
    }
}

async function handleStopRecording(sendResponse) {
    console.log('[Offscreen] Received stopTabRecording message.');
    
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop(); // This triggers 'onstop'
        console.log('[Offscreen] MediaRecorder stop() called.');
        sendResponse({ success: true, message: 'Recording stopping.' });
    } else {
        console.warn('[Offscreen] MediaRecorder not recording or not initialized when stop called.');
        
        // Still clean up any resources
        cleanup();
        
        // Check if we have any recorded chunks to send
        if (recordedChunks.length > 0) {
            console.log('[Offscreen] Found existing chunks to process');
            // Process existing chunks
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const buffer = await blob.arrayBuffer();
            
            chrome.runtime.sendMessage({
                type: 'VIDEO_BUFFER_READY',
                target: 'service-worker',
                payload: {
                    buffer: buffer,
                    mimeType: 'video/webm'
                }
            });
        } else {
            // Notify that recording was not active
            chrome.runtime.sendMessage({
                type: 'RECORDING_ERROR',
                target: 'service-worker',
                error: 'Recording was not active when stop was called.'
            });
        }
        
        sendResponse({ success: false, message: 'Recorder was not active.' });
    }
}

async function stopExistingRecording() {
    return new Promise((resolve) => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.addEventListener('stop', () => {
                resolve();
            }, { once: true });
            mediaRecorder.stop();
        } else {
            resolve();
        }
    });
}

function cleanup() {
    recordedChunks = [];
    
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => {
            track.stop();
            console.log('[Offscreen] Track stopped:', track.kind);
        });
        mediaStream = null;
    }
    
    mediaRecorder = null;
}

console.log('Offscreen document event listener for messages is active.');