// utils/debug-helper.js
// Debug helper functions for the service worker console

// Safely get global object
let globalObj;
try {
    if (typeof self !== 'undefined') {
        globalObj = self;
    }
} catch (e) {}

if (!globalObj) {
    try {
        if (typeof window !== 'undefined') {
            globalObj = window;
        }
    } catch (e) {}
}

if (!globalObj) {
    globalObj = (function() { return this; })() || {};
}

// Create global debug namespace
if (!globalObj.BugReporterDebug) globalObj.BugReporterDebug = {};

globalObj.BugReporterDebug = {
    // Check if all modules are loaded
    checkModules: function() {
        console.log('Checking loaded modules...');
        const modules = {
            'storageHelper': globalObj.BugReporter?.utils?.storageHelper,
            'logFormatter': globalObj.BugReporter?.utils?.logFormatter,
            'geminiApi': globalObj.BugReporter?.utils?.geminiApi,
            'jiraApi': globalObj.BugReporter?.utils?.jiraApi,
            'zipHelper': globalObj.BugReporter?.utils?.zipHelper
        };
        
        for (const [name, module] of Object.entries(modules)) {
            if (module) {
                console.log(`✅ ${name} loaded`);
                console.log(`   Available methods:`, Object.keys(module));
            } else {
                console.error(`❌ ${name} NOT loaded`);
            }
        }
    },
    
    // Check current recording state
    checkRecordingState: function() {
        console.log('Current recording state:', typeof recordingState !== 'undefined' ? recordingState : 'recordingState not defined');
    },
    
    // Test storage access
    testStorage: async function() {
        console.log('Testing storage...');
        try {
            await chrome.storage.local.set({ test: 'value' });
            const result = await chrome.storage.local.get('test');
            console.log('✅ Storage working:', result);
            await chrome.storage.local.remove('test');
        } catch (error) {
            console.error('❌ Storage error:', error);
        }
    },
    
    // List all recordings
    listRecordings: async function() {
        try {
            const result = await chrome.storage.local.get('recordings');
            const recordings = result.recordings || [];
            console.log(`Found ${recordings.length} recordings:`);
            recordings.forEach(rec => {
                console.log(`- ${rec.id}: ${rec.pageTitle} (${new Date(rec.timestamp).toLocaleString()})`);
            });
        } catch (error) {
            console.error('Error listing recordings:', error);
        }
    },
    
    // Clear all recordings
    clearAllRecordings: async function() {
        if (!confirm('Are you sure you want to clear all recordings?')) return;
        
        try {
            const result = await chrome.storage.local.get('recordings');
            const recordings = result.recordings || [];
            for (const rec of recordings) {
                await chrome.storage.local.remove(`recording_${rec.id}`);
            }
            await chrome.storage.local.set({ recordings: [] });
            console.log('✅ All recordings cleared');
        } catch (error) {
            console.error('Error clearing recordings:', error);
        }
    },
    
    // Test Jira connection
    testJiraConnection: async function() {
        console.log('Testing Jira connection...');
        try {
            const storageHelper = globalObj.BugReporter?.utils?.storageHelper;
            const jiraApi = globalObj.BugReporter?.utils?.jiraApi;
            
            if (!storageHelper || !jiraApi) {
                console.error('❌ Required modules not loaded');
                return;
            }
            
            const credentials = await storageHelper.getJiraCredentials();
            if (!credentials) {
                console.error('❌ No Jira credentials configured');
                return;
            }
            
            console.log('Fetching projects...');
            const projects = await jiraApi.getJiraProjects(credentials);
            console.log(`✅ Connected! Found ${projects.length} projects`);
            console.log('First 5 projects:', projects.slice(0, 5).map(p => `${p.key}: ${p.name}`));
        } catch (error) {
            console.error('❌ Jira connection failed:', error);
        }
    },
    
    // Test AI API
    testAiApi: async function() {
        console.log('Testing AI API...');
        try {
            const storageHelper = globalObj.BugReporter?.utils?.storageHelper;
            const geminiApi = globalObj.BugReporter?.utils?.geminiApi;
            
            if (!storageHelper || !geminiApi) {
                console.error('❌ Required modules not loaded');
                return;
            }
            
            const apiKey = await storageHelper.getAiApiKey();
            if (!apiKey) {
                console.error('❌ No AI API key configured');
                return;
            }
            
            const testPrompt = 'Test prompt: Generate a bug summary for a button that does not respond to clicks.';
            const result = await geminiApi.generateAiSuggestions(apiKey, testPrompt);
            console.log('✅ AI API working!');
            console.log('Generated summary:', result.summary);
        } catch (error) {
            console.error('❌ AI API test failed:', error);
        }
    },
    
    // Force stop recording
    forceStopRecording: async function() {
        console.log('Force stopping recording...');
        if (typeof recordingState !== 'undefined') {
            recordingState.isRecording = false;
            recordingState.isWaitingForVideoData = false;
        }
        chrome.action.setBadgeText({ text: '' });
        
        try {
            if (typeof closeOffscreenDocumentIfNeeded === 'function') {
                await closeOffscreenDocumentIfNeeded();
            }
        } catch (e) {
            console.error('Error closing offscreen document:', e);
        }
        
        console.log('✅ Recording force stopped');
    },
    
    // Get extension info
    getInfo: function() {
        const manifest = chrome.runtime.getManifest();
        console.log('Extension Info:');
        console.log('- Name:', manifest.name);
        console.log('- Version:', manifest.version);
        console.log('- ID:', chrome.runtime.id);
        console.log('- Permissions:', manifest.permissions);
    }
};

// Auto-run basic checks
console.log('🐛 Debug Helper Loaded! Available commands:');
console.log('- BugReporterDebug.checkModules()');
console.log('- BugReporterDebug.checkRecordingState()');
console.log('- BugReporterDebug.testStorage()');
console.log('- BugReporterDebug.listRecordings()');
console.log('- BugReporterDebug.clearAllRecordings()');
console.log('- BugReporterDebug.testJiraConnection()');
console.log('- BugReporterDebug.testAiApi()');
console.log('- BugReporterDebug.forceStopRecording()');
console.log('- BugReporterDebug.getInfo()');

// Run initial module check
globalObj.BugReporterDebug.checkModules();