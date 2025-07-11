(() => {
  if (!window.rrweb || window.__rrwebMainWorldRecorder) {
    console.warn('[rrweb-recorder] rrweb not available or already initialized');
    return;
  }
  window.__rrwebMainWorldRecorder = true;
  
  console.log('[rrweb-recorder] Starting recording in MAIN world...');
  
  let events = [];
  let isRecording = true;
  
  // Start recording
  const stopFn = window.rrweb.record({
    emit(event) {
      if (!isRecording) return;
      
      // Store events
      events.push(event);
      
      // Send events in batches
      if (events.length >= 50 || event.type === 2) { // 2 is FullSnapshot
        window.postMessage({
          type: '__RRWEB_EVENTS__',
          events: [...events]
        }, '*');
        events = [];
      }
    },
    // Recording options
    sampling: {
      scroll: 150,
      media: 800,
      input: 'last',
      mouse: 20,
      drag: 100,
    },
    recordCanvas: true,
    recordCrossOriginIframes: false,
    maskInputOptions: {
      password: true,
      email: true,
      tel: true,
    },
    blockClass: 'rr-block',
    ignoreClass: 'rr-ignore',
    maskTextClass: 'rr-mask',
    maskAllInputs: false,
    inlineStylesheet: true,
    collectFonts: true,
    slimDOMOptions: {
      script: false,
      comment: false,
      headFavicon: false,
      headWhitespace: false,
      headMetaDescKeywords: false,
      headMetaSocial: true,
      headMetaRobots: false,
      headMetaHttpEquiv: false,
      headMetaAuthorship: false,
      headMetaVerification: false,
    },
  });
  
  console.log('[rrweb-recorder] Recording started');
  
  // Set up periodic event flushing
  const flushInterval = setInterval(() => {
    if (events.length > 0 && isRecording) {
      window.postMessage({
        type: '__RRWEB_EVENTS__',
        events: [...events]
      }, '*');
      events = [];
    }
  }, 5000);
  
  // Stop recording function
  window.__stopRrwebRecording = () => {
    console.log('[rrweb-recorder] Stopping recording...');
    isRecording = false;
    clearInterval(flushInterval);
    
    if (stopFn) {
      stopFn();
    }
    
    // Send any remaining events
    if (events.length > 0) {
      window.postMessage({
        type: '__RRWEB_EVENTS__',
        events: [...events]
      }, '*');
      events = [];
    }
    
    // Send completion signal
    window.postMessage({
      type: '__RRWEB_RECORDING_STOPPED__'
    }, '*');
  };
  
  // Handle page unload
  window.addEventListener('beforeunload', () => {
    if (window.__stopRrwebRecording) {
      window.__stopRrwebRecording();
    }
  });
})();
