// service-worker.js - Enhanced with rrweb and improved architecture

// Use static imports for service worker modules
import * as jiraApi from './utils/jiraApi.js';
import * as geminiApi from './utils/geminiApi.js';
import * as storageHelper from './utils/storageHelper.js';
import * as logFormatter from './utils/logFormatter.js';
import * as zipHelper from './utils/zipHelper.js';

console.log('[ServiceWorker] Modules loaded successfully');

// --- Recording Storage ---
class RecordingStorage {
  static async saveRecording(recording) {
    const recordings = await this.getAllRecordings();
    recordings.unshift(recording); // Add to beginning
    
    // Keep only last 10 recordings
    if (recordings.length > 10) {
      recordings.length = 10;
    }
    
    console.log('[ServiceWorker] RecordingStorage.saveRecording: Approx. size of recordings array being saved: ' + JSON.stringify(recordings).length + ' bytes. Number of records: ' + recordings.length);
    await chrome.storage.local.set({ recordings });
    return recording.id;
  }
  
  static async getAllRecordings() {
    const result = await chrome.storage.local.get('recordings');
    return result.recordings || [];
  }
  
  static async getRecording(id) {
    const recordings = await this.getAllRecordings();
    return recordings.find(r => r.id === id);
  }
  
  static async deleteRecording(id) {
    const recordings = await this.getAllRecordings();
    const filtered = recordings.filter(r => r.id !== id);
    await chrome.storage.local.set({ recordings: filtered });
  }
}

// --- Enhanced Recording State ---
let recordingState = {
  isRecording: false,
  recordingStartTime: null,
  activeTabId: null,
  streamId: null,
  
  // Recording options
  captureMode: 'tab', // 'tab', 'window', 'screen'
  recordVideo: true,
  recordDOM: true,
  recordConsole: true,
  recordNetwork: true,
  
  // Captured data
  consoleLogs: [],
  networkLogs: [],
  domEvents: [], // rrweb events
  videoBlob: null,
  
  // Metadata
  pageUrl: '',
  pageTitle: '',
  userAgent: '',
  screenResolution: '',
  
  // Processing flags
  offscreenDocumentCreated: false,
  isWaitingForVideoData: false,
  rrwebScriptInjected: false
};

// --- Event Listeners ---
chrome.runtime.onInstalled.addListener(() => {
  console.log('Advanced Bug Reporter Pro installed/updated.');
  
  // Initialize settings
  chrome.storage.local.get(['jiraBaseUrl', 'aiApiKey'], (items) => {
    if (!items.jiraBaseUrl) {
      chrome.storage.local.set({
        jiraBaseUrl: '',
        jiraEmail: '',
        jiraApiToken: '',
        jiraProjectKey: ''
      });
    }
    if (!items.aiApiKey) {
      chrome.storage.local.set({ aiApiKey: '' });
    }
  });
  
  // Create context menu for quick recording
  chrome.contextMenus.create({
    id: 'quick-record',
    title: 'Start Bug Recording',
    contexts: ['page', 'selection', 'image', 'link']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'quick-record' && tab) {
    handleStartRecording(tab.id, { captureMode: 'tab' });
  }
});

// Enhanced message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[ServiceWorker] Message received:', message.type);
  
  switch (message.type) {
    case 'GET_RECORDING_STATE':
      sendResponse({
        isRecording: recordingState.isRecording,
        hasRecordedData: hasRecordedData(),
        recordingDuration: getRecordingDuration(),
        options: {
          captureMode: recordingState.captureMode,
          recordVideo: recordingState.recordVideo,
          recordDOM: recordingState.recordDOM,
          recordConsole: recordingState.recordConsole,
          recordNetwork: recordingState.recordNetwork
        }
      });
      break;
      
    case 'START_RECORDING':
      handleStartRecording(message.tabId, message.options)
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          console.error('[ServiceWorker] Start recording error:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
      
    case 'STOP_RECORDING':
      handleStopRecording()
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          console.error('[ServiceWorker] Stop recording error:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
      
    case 'CONSOLE_LOG_CAPTURED':
      console.log('[ServiceWorker] CONSOLE_LOG_CAPTURED received:', message.payload);
      if (recordingState.isRecording && recordingState.recordConsole) {
        recordingState.consoleLogs.push({
          ...message.payload,
          relativeTime: Date.now() - recordingState.recordingStartTime
        });
      }
      sendResponse({ success: true, received: message.type }); 
      return true; 
      
    case 'RRWEB_EVENTS':
      console.log('[ServiceWorker] RRWEB_EVENTS received, event count:', message.payload ? message.payload.length : 0);
      if (recordingState.isRecording && recordingState.recordDOM) {
        recordingState.domEvents.push(...message.payload);
      }
      sendResponse({ success: true, received: message.type }); 
      return true; 
      
    case 'VIDEO_BUFFER_READY':
      console.log('[ServiceWorker] VIDEO_BUFFER_READY received:', message.payload ? 'payload present' : 'no payload');
      handleVideoBufferReady(message.payload)
        .then(() => {
          console.log('[ServiceWorker] VIDEO_BUFFER_READY processed.');
          sendResponse({ success: true, message: "VIDEO_BUFFER_READY processed by service worker." });
        })
        .catch(error => {
          console.error('[ServiceWorker] Error processing VIDEO_BUFFER_READY:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Crucial for async sendResponse
      
    case 'RECORDING_ERROR':
      handleRecordingError(message.error);
      break;
      
    case 'GET_RECENT_RECORDINGS':
      RecordingStorage.getAllRecordings()
        .then(recordings => sendResponse({ success: true, recordings }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'OPEN_RECORDING':
      openRecordingReview(message.recordingId);
      break;
      
    case 'DELETE_RECORDING':
      RecordingStorage.deleteRecording(message.recordingId)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'GENERATE_AI_SUGGESTIONS':
      handleGenerateAISuggestions(message.payload)
        .then(suggestions => sendResponse({ success: true, ...suggestions }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'SUBMIT_TO_JIRA':
      handleSubmitToJira(message.payload)
        .then(issueKey => sendResponse({ success: true, issueKey }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'FETCH_JIRA_PROJECTS':
      handleFetchJiraProjects()
        .then(projects => sendResponse({ success: true, projects }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'FETCH_JIRA_ISSUE_TYPES':
      handleFetchJiraIssueTypes(message.payload.projectKey)
        .then(issueTypes => sendResponse({ success: true, issueTypes }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    default:
      console.warn('[ServiceWorker] Unknown message type:', message.type);
  }
});

// Enhanced debugger event handler
chrome.debugger.onEvent.addListener((source, method, params) => {
  if (!recordingState.isRecording || 
      !recordingState.recordNetwork || 
      source.tabId !== recordingState.activeTabId) {
    return;
  }
  
  // Filter relevant network events
  if (['Network.requestWillBeSent', 'Network.responseReceived', 
       'Network.loadingFinished', 'Network.loadingFailed'].includes(method)) {
    recordingState.networkLogs.push({
      type: method,
      params,
      timestamp: Date.now(),
      relativeTime: Date.now() - recordingState.recordingStartTime,
      requestId: params.requestId
    });
  }
});

// --- Core Recording Functions ---
async function handleStartRecording(tabId, options = {}) {
  if (recordingState.isRecording) {
    throw new Error('Recording already in progress');
  }
  
  // Reset and configure state
  resetRecordingState();
  recordingState.isRecording = true;
  recordingState.recordingStartTime = Date.now();
  recordingState.activeTabId = tabId || (await getActiveTabId());
  
  // Apply recording options
  Object.assign(recordingState, {
    captureMode: options.captureMode || 'tab',
    recordVideo: options.recordVideo !== false,
    recordDOM: options.recordDOM !== false,
    recordConsole: options.recordConsole !== false,
    recordNetwork: options.recordNetwork !== false
  });
  
  if (!recordingState.activeTabId) {
    recordingState.isRecording = false;
    throw new Error('No active tab found');
  }
  
  try {
    // Get tab information
    const tab = await chrome.tabs.get(recordingState.activeTabId);
    recordingState.pageUrl = tab.url;
    recordingState.pageTitle = tab.title;
    
    // Start appropriate capture method
    if (recordingState.recordVideo) {
      if (recordingState.captureMode === 'tab') {
        await startTabCapture();
      } else {
        await startDesktopCapture();
      }
    }
    
    // Inject scripts for console and DOM recording
    if (recordingState.recordConsole || recordingState.recordDOM) {
      console.log('[ServiceWorker] handleStartRecording: Attempting to inject recording scripts...');
      await injectRecordingScripts();
      console.log('[ServiceWorker] handleStartRecording: Finished injecting recording scripts.');
    }
    
    // Attach debugger for network recording
    if (recordingState.recordNetwork) {
      console.log('[ServiceWorker] handleStartRecording: Attempting to attach debugger...');
      await attachDebugger();
      console.log('[ServiceWorker] handleStartRecording: Finished attaching debugger.');
    }
    
    // Update badge
    chrome.action.setBadgeText({ text: 'REC' });
    chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
    
    // Notify popup
    chrome.runtime.sendMessage({
      type: 'RECORDING_STARTED',
      payload: { tabId: recordingState.activeTabId }
    }).catch(() => {
      // Popup might be closed, ignore error
    });
    
    console.log('[ServiceWorker] Recording started successfully');
  } catch (error) {
    console.error('[ServiceWorker] handleStartRecording: Error caught during setup:', error, 'Stack:', error.stack);
    await handleStopRecording(true, error.message);
    throw error;
  }
}

async function startTabCapture() {
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: recordingState.activeTabId
  });
  recordingState.streamId = streamId;
  await setupOffscreenDocument(streamId);
}

async function startDesktopCapture() {
  return new Promise((resolve, reject) => {
    chrome.desktopCapture.chooseDesktopMedia(
      recordingState.captureMode === 'window' ? ['window'] : ['screen'],
      async (streamId) => {
        if (!streamId) {
          reject(new Error('User cancelled desktop capture'));
          return;
        }
        recordingState.streamId = streamId;
        await setupOffscreenDocument(streamId);
        resolve();
      }
    );
  });
}

async function injectRecordingScripts() {
  const scripts = [];
  
  if (recordingState.recordConsole) {
    scripts.push('content_scripts/console-interceptor.js');
  }
  
  if (recordingState.recordDOM) {
    scripts.push('content_scripts/rrweb-recorder.js');
  }
  
  for (const file of scripts) {
    console.log(`[ServiceWorker] injectRecordingScripts: Attempting to inject ${file}`);
    try {
      await chrome.scripting.executeScript({
        target: { tabId: recordingState.activeTabId },
        files: [file],
        injectImmediately: true,
        world: 'ISOLATED'  // Changed from 'MAIN' to avoid conflicts
      });
      console.log(`[ServiceWorker] injectRecordingScripts: Successfully injected ${file}`);
    } catch (injectionError) {
      console.error(`[ServiceWorker] injectRecordingScripts: Failed to inject ${file}. Error:`, injectionError, 'Stack:', injectionError.stack);
      // Optionally, re-throw or handle as a critical failure of handleStartRecording
      throw injectionError; // Re-throw to be caught by handleStartRecording's catch block
    }
  }
  
  recordingState.rrwebScriptInjected = recordingState.recordDOM;
}

async function attachDebugger() {
  await chrome.debugger.attach({ tabId: recordingState.activeTabId }, "1.3");
  await chrome.debugger.sendCommand(
    { tabId: recordingState.activeTabId },
    "Network.enable",
    {}
  );
}

async function handleStopRecording(forced = false, reason = '') {
  if (!recordingState.isRecording && !forced) {
    return;
  }
  
  console.log('[ServiceWorker] Stopping recording...');
  recordingState.isWaitingForVideoData = recordingState.recordVideo;
  
  try {
    // Stop video recording
    if (recordingState.recordVideo && recordingState.offscreenDocumentCreated) {
      chrome.runtime.sendMessage({
        type: 'stopTabRecording',
        target: 'offscreen'
      }).catch(() => {
        // Offscreen might be closed, ignore
      });
    }
    
    // Detach debugger
    if (recordingState.recordNetwork && recordingState.activeTabId) {
      try {
        await chrome.debugger.detach({ tabId: recordingState.activeTabId });
      } catch (e) {
        console.warn('[ServiceWorker] Debugger detach error:', e);
      }
    }
    
    // Get final DOM events if recording
    if (recordingState.recordDOM && recordingState.rrwebScriptInjected) {
      try {
        await chrome.tabs.sendMessage(recordingState.activeTabId, {
          type: 'STOP_RRWEB_RECORDING'
        });
      } catch (e) {
        console.warn('[ServiceWorker] Failed to stop rrweb recording:', e);
      }
    }
    
    // If not waiting for video, finalize now
    if (!recordingState.isWaitingForVideoData) {
      await finalizeRecording();
    }
  } catch (error) {
    console.error('[ServiceWorker] Error stopping recording:', error);
    await finalizeRecording(error.message);
  }
}

async function handleVideoBufferReady(payload) {
  console.log('[ServiceWorker] handleVideoBufferReady: Processing payload.');
  if (payload && payload.buffer instanceof ArrayBuffer && payload.mimeType) {
    try {
      recordingState.videoBlob = new Blob([payload.buffer], { type: payload.mimeType });
      console.log('[ServiceWorker] handleVideoBufferReady: Video blob created, size:', recordingState.videoBlob.size);
    } catch (error) {
      console.error('[ServiceWorker] handleVideoBufferReady: Error creating video blob:', error);
    }
  }
  
  if (payload && payload.buffer instanceof ArrayBuffer && payload.mimeType) {
    try {
      recordingState.videoBlob = new Blob([payload.buffer], { type: payload.mimeType });
      console.log('[ServiceWorker] handleVideoBufferReady: Video blob created, size:', recordingState.videoBlob.size);
    } catch (error) {
      console.error('[ServiceWorker] handleVideoBufferReady: Error creating video blob:', error);
    }
  }
  
  if (recordingState.isWaitingForVideoData) {
    await finalizeRecording();
  }
  closeOffscreenDocumentIfNeeded();
  console.log('[ServiceWorker] handleVideoBufferReady: Full processing complete.');
}

async function handleRecordingError(error) {
  console.error('[ServiceWorker] handleRecordingError: Received error:', error);
  
  if (recordingState.isWaitingForVideoData) {
    await finalizeRecording(error);
  }
  closeOffscreenDocumentIfNeeded();
  console.log('[ServiceWorker] handleRecordingError: Full processing complete.');
}

async function finalizeRecording(error = null) {
  try {
    console.log(`[ServiceWorker] finalizeRecording: Starting. Initial error param:`, error);
    recordingState.isRecording = false;
    recordingState.isWaitingForVideoData = false;
    
    chrome.action.setBadgeText({ text: '' });
    
    // Get screen resolution
    try {
      const displays = await chrome.system.display.getInfo();
      if (displays.length > 0) {
        const primary = displays.find(d => d.isPrimary) || displays[0];
        recordingState.screenResolution = `${primary.bounds.width}x${primary.bounds.height}`;
      }
    } catch (e) {
      console.warn('[ServiceWorker] finalizeRecording: Could not get display info:', e);
    }
    
    // Save recording
    const recording = {
      id: `rec_${Date.now()}`,
      timestamp: recordingState.recordingStartTime,
      duration: Date.now() - recordingState.recordingStartTime,
      pageUrl: recordingState.pageUrl,
      pageTitle: recordingState.pageTitle,
      userAgent: navigator.userAgent,
      screenResolution: recordingState.screenResolution,
      hasVideo: !!recordingState.videoBlob,
      hasDOM: recordingState.domEvents.length > 0,
      consoleLogs: recordingState.consoleLogs.length,
      networkLogs: recordingState.networkLogs.length,
      error: error ? (typeof error === 'string' ? error.substring(0, 500) : ( (error.message ? String(error.message).substring(0,500) : 'Unknown error object') + (error.name ? ` (Name: ${String(error.name)})` : '') ) ) : null
    };
    
    // console.log('[ServiceWorker] finalizeRecording: Recording object prepared:', recording); // Original log
    console.log('[ServiceWorker] finalizeRecording: Recording object prepared (metadata with sanitized error):', recording);

    // Store only the 'recording' object (metadata) under the dynamic key.
    // The actual large data (consoleLogs, networkLogs, videoBlob, domEvents)
    // are still in recordingState but are NOT being saved to chrome.storage.local here.
    // This is a temporary step to prevent quota errors.
    // For a full solution, these large data pieces would be saved to IndexedDB.
    console.log(`[ServiceWorker] finalizeRecording: Attempting to save metadata for recording ID ${recording.id} to chrome.storage.local.set.`);
    console.log('[ServiceWorker] finalizeRecording: Approx. size of single metadata item being saved: ' + JSON.stringify(recording).length + ' bytes');
    await chrome.storage.local.set({
      [`recording_${recording.id}`]: recording // 'recording' object itself is just metadata
    });
    console.log(`[ServiceWorker] finalizeRecording: Metadata for recording ID ${recording.id} stored in local.set.`);
    
    // RecordingStorage.saveRecording also saves a summary (the 'recording' object) 
    // to a general 'recordings' list. This is fine as 'recording' is metadata.
    await RecordingStorage.saveRecording(recording); 
    console.log('[ServiceWorker] finalizeRecording: Recording summary saved via RecordingStorage.');
    
    // Open review page only if there was no initial error passed to finalizeRecording
    if (!error) {
      console.log('[ServiceWorker] finalizeRecording: No initial error, attempting to open review page.');
      await openRecordingReview(recording.id);
    } else {
      console.log('[ServiceWorker] finalizeRecording: Initial error present, skipping review page opening.');
    }
    
    // Notify popup
    chrome.runtime.sendMessage({
      type: 'RECORDING_STOPPED',
      payload: { recordingId: recording.id, error }
    }).catch((e) => {
      console.warn('[ServiceWorker] finalizeRecording: Failed to send RECORDING_STOPPED to popup (it might be closed). Error:', e);
    });
    
    console.log('[ServiceWorker] Recording finalized successfully:', recording.id);
  } catch (criticalError) {
    console.error('[ServiceWorker] CRITICAL ERROR in finalizeRecording:', criticalError, 'Stack:', criticalError.stack);
    // Potentially try to notify the user or log this critical failure more permanently
    // Avoid further complex operations here that might also fail
  }
}

async function openRecordingReview(recordingId) {
  const url = chrome.runtime.getURL(`review/review.html?id=${recordingId}`);
  await chrome.tabs.create({ url });
}

// --- Helper Functions ---
function resetRecordingState() {
  recordingState = {
    isRecording: false,
    recordingStartTime: null,
    activeTabId: null,
    streamId: null,
    captureMode: 'tab',
    recordVideo: true,
    recordDOM: true,
    recordConsole: true,
    recordNetwork: true,
    consoleLogs: [],
    networkLogs: [],
    domEvents: [],
    videoBlob: null,
    pageUrl: '',
    pageTitle: '',
    userAgent: '',
    screenResolution: '',
    offscreenDocumentCreated: false,
    isWaitingForVideoData: false,
    rrwebScriptInjected: false
  };
}

function hasRecordedData() {
  return recordingState.videoBlob !== null ||
         recordingState.consoleLogs.length > 0 ||
         recordingState.networkLogs.length > 0 ||
         recordingState.domEvents.length > 0;
}

function getRecordingDuration() {
  if (!recordingState.isRecording || !recordingState.recordingStartTime) {
    return 0;
  }
  return Date.now() - recordingState.recordingStartTime;
}

async function getActiveTabId() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return activeTab ? activeTab.id : null;
  } catch (error) {
    console.error('[ServiceWorker] Error getting active tab:', error);
    return null;
  }
}

async function setupOffscreenDocument(streamId) {
  const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });
  
  if (existingContexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: offscreenUrl,
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: 'Recording browser content for bug reporting'
    });
  }
  
  recordingState.offscreenDocumentCreated = true;
  
  setTimeout(() => {
    chrome.runtime.sendMessage({
      type: 'startTabRecording',
      target: 'offscreen',
      streamId: streamId
    }).catch(error => {
      console.error('[ServiceWorker] Error sending startTabRecording to offscreen document. Offscreen might not be ready or an error occurred.', error);
      // Consider sending an error message back to UI or handling this state
      recordingState.isRecording = false; // Stop recording if offscreen setup fails
      chrome.action.setBadgeText({ text: '' });
      // Potentially call finalizeRecording with an error
    });
  }, 100); // Keeping timeout for now, but ideally replace with a ready signal from offscreen
}

async function closeOffscreenDocumentIfNeeded() {
  if (recordingState.offscreenDocumentCreated) {
    try {
      await chrome.offscreen.closeDocument();
      recordingState.offscreenDocumentCreated = false;
    } catch (e) {
      console.log('[ServiceWorker] Offscreen document already closed');
    }
  }
}

// --- API Handlers ---
async function handleGenerateAISuggestions(payload) {
  const { recordingId, summary, description } = payload;
  
  let recordingData;
  if (recordingId) {
    const stored = await chrome.storage.local.get(`recording_${recordingId}`);
    recordingData = stored[`recording_${recordingId}`];
  } else {
    recordingData = {
      consoleLogs: recordingState.consoleLogs,
      networkLogs: recordingState.networkLogs
    };
  }
  
  const aiApiKey = await storageHelper.getAiApiKey();
  if (!aiApiKey) {
    throw new Error('AI API Key not configured');
  }
  
  const promptText = logFormatter.formatLogsForAiPrompt(
    recordingData.consoleLogs,
    recordingData.networkLogs,
    { summary, description }
  );
  
  const { summary: aiSummary, steps: aiSteps } = await geminiApi.generateAiSuggestions(
    aiApiKey,
    promptText
  );
  
  return { aiSummary, aiSteps };
}

async function handleFetchJiraProjects() {
  const jiraCredentials = await storageHelper.getJiraCredentials();
  if (!jiraCredentials || !jiraCredentials.baseUrl) {
    throw new Error('Jira not configured');
  }
  
  return jiraApi.getJiraProjects(jiraCredentials);
}

async function handleFetchJiraIssueTypes(projectKey) {
  if (!projectKey) {
    throw new Error('Project key required');
  }
  
  const jiraCredentials = await storageHelper.getJiraCredentials();
  if (!jiraCredentials || !jiraCredentials.baseUrl) {
    throw new Error('Jira not configured');
  }
  
  return jiraApi.getJiraIssueTypesForProject(jiraCredentials, projectKey);
}

async function handleSubmitToJira(payload) {
  const {
    recordingId,
    projectKey,
    issueTypeName,
    summary,
    description,
    attachments
  } = payload;
  
  const jiraCredentials = await storageHelper.getJiraCredentials();
  if (!jiraCredentials || !jiraCredentials.baseUrl) {
    throw new Error('Jira not configured');
  }
  
  // Get recording data if specified
  let recordingData = null;
  if (recordingId) {
    const stored = await chrome.storage.local.get(`recording_${recordingId}`);
    recordingData = stored[`recording_${recordingId}`];
  }
  
  // Create issue
  const issueData = {
    projectKey,
    issueTypeName,
    summary,
    descriptionAdf: {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: description }]
        }
      ]
    }
  };
  
  const createdIssue = await jiraApi.createJiraIssue(
    jiraCredentials,
    issueData
  );
  
  // Add attachments if requested
  if (recordingData && attachments) {
    const zipBlob = await zipHelper.createReportZip(
      attachments.video ? recordingData.videoBlob : null,
      attachments.logs ? recordingData.consoleLogs : [],
      attachments.logs ? recordingData.networkLogs : [],
      description,
      summary
    );
    
    if (zipBlob) {
      await jiraApi.addJiraAttachment(
        jiraCredentials,
        createdIssue.key,
        zipBlob,
        `bug_report_${createdIssue.key}.zip`
      );
    }
  }
  
  return createdIssue.key;
}

console.log('[ServiceWorker] Enhanced Bug Reporter Pro loaded');