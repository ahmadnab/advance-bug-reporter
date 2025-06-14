// service-worker.js

// Import helper modules
import * as jiraApi from './utils/jiraApi.js';
import * as geminiApi from './utils/geminiApi.js';
import * as storageHelper from './utils/storageHelper.js';
import * as logFormatter from './utils/logFormatter.js';
import * as zipHelper from './utils/zipHelper.js';

// --- Global State Variables ---
let recordingState = {
  isRecording: false,
  activeTabId: null,
  streamId: null,
  // mediaRecorder managed by offscreen document
  consoleLogs: [],
  networkLogs: [],
  videoBlob: null, // This will hold the reconstructed Blob
  userBugSummary: '', // User's text from popup
  userBugDescription: '', // User's text from popup
  // AI suggestions are handled transiently or stored if needed for review
  jiraIssueKey: null,
  offscreenDocumentCreated: false,
  // Flag to track if stop process is waiting for video data
  isWaitingForVideoData: false
};

// --- Event Listeners ---
chrome.runtime.onInstalled.addListener(() => {
  console.log('Advanced Bug Reporter extension installed/updated.');
  // Initialize default settings if not already set
  storageHelper.getJiraCredentials().then(creds => {
    if (!creds) {
      storageHelper.saveJiraCredentials({ baseUrl: '', email: '', apiToken: '', projectKey: '' });
    }
  });
  storageHelper.getAiApiKey().then(key => {
    if (key === null) {
        storageHelper.saveAiApiKey('');
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[ServiceWorker] Received message:', message.type, message.payload || '');
  switch (message.type) {
    case 'GET_RECORDING_STATE':
      const hasDataNow = recordingState.videoBlob !== null || recordingState.consoleLogs.length > 0 || recordingState.networkLogs.length > 0;
      console.log(`[ServiceWorker] GET_RECORDING_STATE check. isRecording: ${recordingState.isRecording}, hasDataNow: ${hasDataNow} (video: ${!!recordingState.videoBlob}, console: ${recordingState.consoleLogs.length}, network: ${recordingState.networkLogs.length})`);
      sendResponse({
        isRecording: recordingState.isRecording,
        hasRecordedData: hasDataNow
      });
      break;
    case 'START_RECORDING':
      handleStartRecording(message.tabId)
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          console.error('[ServiceWorker] Error starting recording:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Indicates asynchronous response
    case 'STOP_RECORDING':
      handleStopRecording() // No longer directly sends response based on completion
        .then(() => {
            // Acknowledge receipt of stop command, but actual state update happens later
            sendResponse({ success: true, message: "Stop initiated, waiting for data processing." });
        })
        .catch(error => {
          console.error('[ServiceWorker] Error initiating stop recording:', error);
          sendResponse({ success: false, error: error.message });
          // Attempt to reset state if stop initiation failed badly
          recordingState.isRecording = false;
          recordingState.isWaitingForVideoData = false;
          chrome.action.setBadgeText({ text: '' });
        });
      return true; // Still async as handleStopRecording is async
    case 'CONSOLE_LOG_CAPTURED': // *** ADDED LOGGING ***
      if (recordingState.isRecording) {
        console.log('[ServiceWorker] CONSOLE_LOG_CAPTURED received:', message.payload.level); // Log level only for brevity
        recordingState.consoleLogs.push(message.payload);
        console.log(`[ServiceWorker] consoleLogs count now: ${recordingState.consoleLogs.length}`); // Log count
      } else {
         console.log('[ServiceWorker] CONSOLE_LOG_CAPTURED received, but not recording. Discarding.');
      }
      break;
    // --- Modified handler for video data ---
    case 'VIDEO_BUFFER_READY':
      console.log('[ServiceWorker] Received VIDEO_BUFFER_READY message.');
      if (message.payload && message.payload.buffer instanceof ArrayBuffer && message.payload.mimeType) {
        try {
          // Reconstruct the Blob from the ArrayBuffer and MIME type
          const reconstructedBlob = new Blob([message.payload.buffer], { type: message.payload.mimeType });
          // *** ADDED LOGGING ***
          if (reconstructedBlob && reconstructedBlob.size > 0) {
              recordingState.videoBlob = reconstructedBlob;
              console.log('[ServiceWorker] SUCCESS: Video blob reconstructed from ArrayBuffer. Size:', recordingState.videoBlob.size, 'Type:', recordingState.videoBlob.type);
          } else {
              console.error('[ServiceWorker] FAILED: Reconstructed Blob is invalid or empty.', reconstructedBlob);
              recordingState.videoBlob = null;
          }
        } catch (error) {
          console.error('[ServiceWorker] Error reconstructing Blob from ArrayBuffer:', error);
          recordingState.videoBlob = null; // Ensure it's null on error
        }
      } else {
        recordingState.videoBlob = null; // Ensure it's null if data is invalid
        console.error('[ServiceWorker] VIDEO_BUFFER_READY received, but payload buffer/mimeType is invalid or missing.', message.payload);
      }
      // *** Send state update AFTER processing video data ***
      if (recordingState.isWaitingForVideoData) {
          sendFinalStopUpdate(null); // Send update, no specific error here
          recordingState.isWaitingForVideoData = false; // Reset flag
      }
      closeOffscreenDocumentIfNeeded();
      break;
    // --- End of modified handler ---
    case 'RECORDING_ERROR': // Error from offscreen doc
      console.error('[ServiceWorker] Error during recording in offscreen document:', message.error);
      recordingState.videoBlob = null; // Ensure video blob is null on error
      // *** Send state update AFTER processing video error ***
      if (recordingState.isWaitingForVideoData) {
          sendFinalStopUpdate(`Offscreen recording error: ${message.error}`); // Send update with error reason
          recordingState.isWaitingForVideoData = false; // Reset flag
      }
      // Don't call handleStopRecording again here, just update state
      chrome.action.setBadgeText({ text: '' });
      closeOffscreenDocumentIfNeeded();
      // We don't sendResponse here as this message originates from offscreen, not popup
      break;
    case 'GENERATE_AI_SUGGESTIONS':
      handleGenerateAISuggestions(message.payload.summary, message.payload.description)
        .then(suggestions => sendResponse({ success: true, aiSummary: suggestions.summary, aiSteps: suggestions.steps }))
        .catch(error => {
          console.error('[ServiceWorker] Error generating AI suggestions:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
    case 'SUBMIT_TO_JIRA':
      handleSubmitToJira(message.payload)
        .then(issueKey => sendResponse({ success: true, issueKey }))
        .catch(error => {
          console.error('[ServiceWorker] Error submitting to Jira:', error);
          const errorMessage = (error instanceof Error) ? error.message : String(error);
          sendResponse({ success: false, error: errorMessage });
        });
      return true;
    case 'FETCH_JIRA_PROJECTS':
      handleFetchJiraProjects()
        .then(projects => sendResponse({ success: true, projects }))
        .catch(error => {
            console.error('[ServiceWorker] Error fetching Jira projects:', error);
            const errorMessage = (error instanceof Error) ? error.message : String(error);
            sendResponse({ success: false, error: errorMessage });
        });
      return true;
    case 'FETCH_JIRA_ISSUE_TYPES':
      handleFetchJiraIssueTypes(message.payload.projectKey)
        .then(issueTypes => sendResponse({ success: true, issueTypes }))
        .catch(error => {
            console.error('[ServiceWorker] Error fetching Jira issue types:', error);
            const errorMessage = (error instanceof Error) ? error.message : String(error);
            sendResponse({ success: false, error: errorMessage });
        });
      return true;
    default:
      console.warn('[ServiceWorker] Unknown message type received:', message.type);
      sendResponse({ success: false, error: 'Unknown message type' });
  }
  return false;
});

chrome.debugger.onEvent.addListener((source, method, params) => { // *** ADDED LOGGING ***
  if (!recordingState.isRecording || source.tabId !== recordingState.activeTabId) { return; }
  // Log that an event was received
  console.log(`[ServiceWorker] Debugger event received: ${method}`);
   recordingState.networkLogs.push({ type: method, source, params, timestamp: Date.now() });
   console.log(`[ServiceWorker] networkLogs count now: ${recordingState.networkLogs.length}`); // Log count
});

chrome.debugger.onDetach.addListener((source, reason) => {
  if (recordingState.isRecording && source.tabId === recordingState.activeTabId) {
    console.warn(`[ServiceWorker] Debugger detached from tab ${source.tabId} due to: ${reason}. Stopping recording.`);
    // If debugger detaches unexpectedly, trigger stop but flag it as potentially incomplete
    handleStopRecording(true, `Debugger detached: ${reason}`)
      .catch(error => console.error('[ServiceWorker] Error stopping recording after debugger detach:', error));
  }
});

// --- Core Logic Functions ---
async function handleStartRecording(tabIdToRecord) {
  if (recordingState.isRecording) {
    return Promise.reject(new Error('Recording already in progress.'));
  }
  resetRecordingState(); // Reset state *before* starting
  recordingState.isRecording = true;
  recordingState.activeTabId = tabIdToRecord || (await getActiveTabId());

  if (!recordingState.activeTabId) {
    recordingState.isRecording = false;
    return Promise.reject(new Error('Could not determine active tab.'));
  }
  try {
    console.log("[ServiceWorker] Attempting to start tab capture...");
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: recordingState.activeTabId });
    recordingState.streamId = streamId;
    console.log("[ServiceWorker] Tab capture stream ID obtained:", streamId);

    await setupOffscreenDocument(streamId); // Creates doc and sends start message

    console.log("[ServiceWorker] Attempting to inject content script...");
    await chrome.scripting.executeScript({
      target: { tabId: recordingState.activeTabId },
      files: ['content_scripts/console-interceptor.js'],
      injectImmediately: true,
      world: 'MAIN'
    });
    console.log("[ServiceWorker] Content script injected.");

    console.log("[ServiceWorker] Attempting to attach debugger...");
    await chrome.debugger.attach({ tabId: recordingState.activeTabId }, "1.3");
    console.log("[ServiceWorker] Debugger attached.");
    await chrome.debugger.sendCommand({ tabId: recordingState.activeTabId }, "Network.enable", {});
    console.log("[ServiceWorker] Network domain enabled.");

    chrome.action.setBadgeText({ text: 'REC' });
    chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
    console.log(`[ServiceWorker] Recording started successfully on tab ${recordingState.activeTabId}`);
  } catch (error) {
    console.error('[ServiceWorker] Failed to start recording:', error);
    // Attempt cleanup even if start failed
    await handleStopRecording(true, `Error during startup: ${error.message}`);
    throw error; // Re-throw to notify popup
  }
}

// *** Modified handleStopRecording ***
async function handleStopRecording(forced = false, reason = '') {
  if (!recordingState.isRecording && !forced) {
    console.warn('[ServiceWorker] Stop requested, but recording is already inactive.');
    return; // Avoid duplicate stop logic
  }
  console.log(`[ServiceWorker] Initiating stop recording process. Forced: ${forced}, Reason: ${reason}`);

  // Mark that we are now waiting for the video data result
  recordingState.isWaitingForVideoData = true;
  // Keep isRecording = true for now, set false in sendFinalStopUpdate

  try {
    // Stop video recording (message offscreen)
    if (recordingState.offscreenDocumentCreated && recordingState.streamId) {
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL('offscreen/offscreen.html')]
      });
      if (existingContexts.length > 0) {
         console.log("[ServiceWorker] Sending stopTabRecording message to offscreen.");
         chrome.runtime.sendMessage({ type: 'stopTabRecording', target: 'offscreen' });
         // Video data will arrive via 'VIDEO_BUFFER_READY' or 'RECORDING_ERROR' asynchronously
      } else {
        console.warn("[ServiceWorker] Offscreen doc not found for stopTabRecording. Video data might be lost.");
        recordingState.videoBlob = null; // Ensure blob is null
        // Since offscreen isn't there, we are no longer waiting for video data from it
        recordingState.isWaitingForVideoData = false;
        // Send the final update now as there's no video data coming
        sendFinalStopUpdate(reason || "Offscreen document missing during stop.");
      }
    } else {
        console.warn("[ServiceWorker] Offscreen doc not created or streamId missing, cannot stop video recording via message.");
        recordingState.videoBlob = null; // Ensure blob is null
        // No offscreen doc means no video data is coming
        recordingState.isWaitingForVideoData = false;
        // Send the final update now
        sendFinalStopUpdate(reason || "Offscreen document not used during recording.");
    }

    // Detach debugger (can happen in parallel with waiting for video)
    if (recordingState.activeTabId) {
      try {
        const targets = await chrome.debugger.getTargets();
        const attachedTarget = targets.find(target => target.tabId === recordingState.activeTabId && target.attached);
        if (attachedTarget) {
          await chrome.debugger.detach({ tabId: recordingState.activeTabId });
          console.log("[ServiceWorker] Debugger detached.");
        } else {
             console.log("[ServiceWorker] Debugger detach requested, but not attached.");
        }
      } catch (e) {
        console.warn('[ServiceWorker] Error detaching debugger (may be benign):', e.message);
      }
    }
  } catch (error) {
    console.error('[ServiceWorker] Error initiating stop recording components:', error);
    // If errors happen here, still try to send a final update, marking recording as stopped
    recordingState.isWaitingForVideoData = false; // Stop waiting
    sendFinalStopUpdate(error.message || "Error during stop initiation.");
  }
  // NOTE: The final update to the popup now happens in sendFinalStopUpdate,
  // which is called either immediately above (if offscreen wasn't used/found)
  // or later when VIDEO_BUFFER_READY or RECORDING_ERROR is received.
}

// *** NEW FUNCTION to send the final state update ***
function sendFinalStopUpdate(errorReason = null) {
    console.log("[ServiceWorker] Preparing to send final stop update to popup.");
    recordingState.isRecording = false; // Officially stopped now
    const calculatedHasData = recordingState.videoBlob !== null || recordingState.consoleLogs.length > 0 || recordingState.networkLogs.length > 0;
    console.log(`[ServiceWorker] sendFinalStopUpdate. videoBlob: ${recordingState.videoBlob ? `Blob(size=${recordingState.videoBlob.size})` : 'null'}, consoleLogs: ${recordingState.consoleLogs.length}, networkLogs: ${recordingState.networkLogs.length}, calculatedHasData: ${calculatedHasData}`);

    chrome.action.setBadgeText({ text: '' });
    chrome.runtime.sendMessage({
        type: 'RECORDING_STATE_UPDATED',
        payload: {
            isRecording: false,
            hasRecordedData: calculatedHasData,
            error: errorReason // Pass along any error reason
        }
    });
    console.log('[ServiceWorker] Final recording stopped signal sent.');
    // Close offscreen doc *after* sending update
    setTimeout(closeOffscreenDocumentIfNeeded, 100);
}


async function setupOffscreenDocument(streamId) {
  const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [offscreenUrl]
  });
  if (existingContexts.length === 0) {
    console.log("[ServiceWorker] Creating offscreen document.");
    await chrome.offscreen.createDocument({
      url: offscreenUrl,
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: 'Tab video recording using MediaRecorder API'
    });
  } else {
      console.log("[ServiceWorker] Offscreen document already exists.");
  }
  recordingState.offscreenDocumentCreated = true;
  console.log("[ServiceWorker] Sending startTabRecording message to offscreen.");
  setTimeout(() => {
    chrome.runtime.sendMessage({ type: 'startTabRecording', target: 'offscreen', streamId: streamId });
  }, 500);
}

async function closeOffscreenDocumentIfNeeded() {
  if (recordingState.offscreenDocumentCreated) {
    const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [offscreenUrl]
    });
    if (existingContexts.length > 0) {
      await chrome.offscreen.closeDocument();
      recordingState.offscreenDocumentCreated = false;
      console.log("[ServiceWorker] Offscreen document closed.");
    } else {
        console.log("[ServiceWorker] Attempted to close offscreen doc, but none found.");
        recordingState.offscreenDocumentCreated = false;
    }
  }
}

async function handleGenerateAISuggestions(userSummary, userDescription) {
  const aiApiKey = await storageHelper.getAiApiKey();
  if (!aiApiKey) throw new Error('AI API Key not configured.');
  const promptText = logFormatter.formatLogsForAiPrompt(
    recordingState.consoleLogs, recordingState.networkLogs,
    { summary: userSummary, description: userDescription }
  );
  try {
    const { summary: aiSummary, steps: aiSteps } = await geminiApi.generateAiSuggestions(aiApiKey, promptText);
    return { summary: aiSummary, steps: aiSteps };
  } catch (error) {
    console.error("[ServiceWorker] Error from Gemini API:", error);
    throw new Error(`AI suggestion generation failed: ${error.message}`);
  }
}

// --- Dynamic Jira Data Handlers ---
async function handleFetchJiraProjects() {
    const jiraCredentials = await storageHelper.getJiraCredentials();
    if (!jiraCredentials || !jiraCredentials.baseUrl || !jiraCredentials.email || !jiraCredentials.apiToken) {
        throw new Error('Jira credentials not configured. Please set them in the extension options.');
    }
    const credsForApi = { baseUrl: jiraCredentials.baseUrl, email: jiraCredentials.email, apiToken: jiraCredentials.apiToken };
    return jiraApi.getJiraProjects(credsForApi);
}

async function handleFetchJiraIssueTypes(projectKey) {
    if (!projectKey) { throw new Error('Project Key is required to fetch issue types.'); }
    const jiraCredentials = await storageHelper.getJiraCredentials();
     if (!jiraCredentials || !jiraCredentials.baseUrl || !jiraCredentials.email || !jiraCredentials.apiToken) {
        throw new Error('Jira credentials not configured. Please set them in the extension options.');
    }
    const credsForApi = { baseUrl: jiraCredentials.baseUrl, email: jiraCredentials.email, apiToken: jiraCredentials.apiToken };
    return jiraApi.getJiraIssueTypesForProject(credsForApi, projectKey);
}


// --- Modified Jira Submission with CreateMeta Check ---
async function handleSubmitToJira(payload) {
  const { projectKey, issueTypeName, summary, description } = payload;

  if (!projectKey || !issueTypeName || !summary) {
    throw new Error('Project Key, Issue Type, or Summary is missing for Jira submission.');
  }

  const jiraCredentials = await storageHelper.getJiraCredentials();
  if (!jiraCredentials || !jiraCredentials.baseUrl || !jiraCredentials.email || !jiraCredentials.apiToken) {
    throw new Error('Jira credentials (Base URL, Email, API Token) not configured.');
  }

  // Use the reconstructed videoBlob from recordingState
  const hasAnyData = recordingState.videoBlob !== null || recordingState.consoleLogs.length > 0 || recordingState.networkLogs.length > 0;
  if (!hasAnyData) {
    throw new Error('No data recorded (video, console, or network logs). Cannot submit empty report.');
  }

  recordingState.userBugSummary = summary;
  recordingState.userBugDescription = description;

  const reportDetailsText = `User Summary: ${summary}\n\nUser Description/Steps:\n${description}\n\n--- Additional Context ---\nReport generated by Advanced Bug Reporter Chrome Extension.`;

  // --- Create ZIP ---
  console.log('[ServiceWorker] Preparing to create ZIP. Current videoBlob:', recordingState.videoBlob);
  const zipBlobPackage = await zipHelper.createReportZip(
    recordingState.videoBlob, recordingState.consoleLogs, recordingState.networkLogs,
    reportDetailsText, summary
  );
  if (!zipBlobPackage) { throw new Error('Failed to create ZIP report package.'); }

  // --- Prepare Issue Data ---
  const descriptionForJira = {
    type: "doc", version: 1, content: [
      { type: "paragraph", content: [{ type: "text", text: "Bug Report Details:" }] },
      { type: "paragraph", content: [{ type: "text", text: `User Provided Summary: ${summary}` }] },
      { type: "paragraph", content: [{ type: "text", text: `User Provided Description/Steps to Reproduce:\n${description}` }] },
      { type: "paragraph", content: [{ type: "text", text: "\n\n(See attached ZIP file for video recording, console logs, and network logs if available.)" }] }
    ]
  };
  const issueData = {
    projectKey: projectKey,
    issueTypeName: issueTypeName,
    summary: summary,
    descriptionAdf: descriptionForJira,
  };
  const credsForApi = {
      baseUrl: jiraCredentials.baseUrl,
      email: jiraCredentials.email,
      apiToken: jiraCredentials.apiToken,
      projectKey: projectKey // Pass selected project key here
  };

  // --- Get Create Metadata (Optional but recommended) ---
  let availableFields = null;
  try {
    console.log(`[ServiceWorker] Fetching createmeta for ${projectKey} / ${issueTypeName}`);
    const metadataCreds = { baseUrl: jiraCredentials.baseUrl, email: jiraCredentials.email, apiToken: jiraCredentials.apiToken };
    const issueTypeMetadata = await jiraApi.getCreateMetadata(metadataCreds, projectKey, issueTypeName);
    availableFields = issueTypeMetadata.fields;
    console.log("[ServiceWorker] Successfully fetched createmeta. Available fields obtained.");
  } catch (metaError) {
    console.warn(`[ServiceWorker] Failed to fetch createmeta: ${metaError.message}. Proceeding without field availability check.`);
    availableFields = null;
  }

  // --- Create Issue ---
  try {
    const createdIssue = await jiraApi.createJiraIssue(credsForApi, issueData, availableFields);
    recordingState.jiraIssueKey = createdIssue.key;
    console.log('[ServiceWorker] Jira issue created:', createdIssue.key);

    // --- Add Attachment ---
    const attachmentCreds = { baseUrl: jiraCredentials.baseUrl, email: jiraCredentials.email, apiToken: jiraCredentials.apiToken };
    await jiraApi.addJiraAttachment(attachmentCreds, createdIssue.key, zipBlobPackage, `bug_report_${createdIssue.key.replace(/\s+/g, '_')}.zip`);
    console.log('[ServiceWorker] Report ZIP attached to Jira issue:', createdIssue.key);

    resetRecordingState(); // Reset state after successful submission
    return createdIssue.key; // Success
  } catch (error) {
    console.error("[ServiceWorker] Error during Jira issue creation or attachment:", error);
    throw error; // Re-throw the original error
  }
}

// --- Utility Functions ---
function resetRecordingState() {
  recordingState.isRecording = false;
  recordingState.activeTabId = null;
  recordingState.streamId = null;
  recordingState.consoleLogs = [];
  recordingState.networkLogs = [];
  recordingState.videoBlob = null; // Clear the reconstructed blob
  recordingState.userBugSummary = '';
  recordingState.userBugDescription = '';
  recordingState.jiraIssueKey = null;
  console.log('[ServiceWorker] Recording state reset.');
}

async function getActiveTabId() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return activeTab ? activeTab.id : null;
  } catch (error) {
    console.error("[ServiceWorker] Error getting active tab ID:", error);
    return null;
  }
}

console.log('[ServiceWorker] Script loaded and running (Corrected Stop Timing, ArrayBuffer handling, createmeta check, and added logging).');
