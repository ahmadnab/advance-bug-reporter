// review/review.js - Recording Review Interface

// Wait for dependencies to load
let formatConsoleLogsForReport, formatNetworkLogsForReport;

// Load utilities
function loadUtilities() {
    // Try to load from BugReporter namespace
    if (window.BugReporter && window.BugReporter.utils) {
        formatConsoleLogsForReport = window.BugReporter.utils.logFormatter.formatConsoleLogsForReport;
        formatNetworkLogsForReport = window.BugReporter.utils.logFormatter.formatNetworkLogsForReport;
    } else {
        // If not available, define inline versions
        formatConsoleLogsForReport = function(consoleLogs) {
            if (!consoleLogs || consoleLogs.length === 0) {
                return "No console logs captured.\n";
            }
            let reportString = "Console Logs:\n========================================\n";
            consoleLogs.forEach(log => {
                const time = new Date(log.timestamp).toLocaleTimeString();
                const level = log.level.toUpperCase();
                const argsString = log.args.join(' ');
                reportString += `[${time}] [${level}] ${argsString}\n`;
            });
            reportString += "========================================\n";
            return reportString;
        };

        formatNetworkLogsForReport = function(networkLogs) {
            if (!networkLogs || networkLogs.length === 0) {
                return "No network logs captured.\n";
            }
            let reportString = "Network Activity Log:\n========================================\n";
            networkLogs.forEach(log => {
                reportString += `${log.type}: ${JSON.stringify(log.params, null, 2)}\n`;
            });
            reportString += "========================================\n";
            return reportString;
        };
    }
}

// Load JSZip dynamically
function loadJSZip() {
    return new Promise((resolve, reject) => {
        if (window.JSZip) {
            resolve(window.JSZip);
            return;
        }

        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('libs/jszip.esm.js');
        script.onload = () => {
            if (window.JSZip) {
                resolve(window.JSZip);
            } else {
                reject(new Error('JSZip failed to load'));
            }
        };
        script.onerror = () => reject(new Error('Failed to load JSZip script'));
        document.head.appendChild(script);
    });
}

// Get recording ID from URL
const urlParams = new URLSearchParams(window.location.search);
const recordingId = urlParams.get('id');

if (!recordingId) {
    showError('No recording ID provided');
}

// State
let currentRecording = null;
let currentPanel = 'player';
let currentPlayer = 'video';
let rrwebPlayer = null;
let JSZip = null;

// DOM Elements
const loadingOverlay = document.getElementById('loadingOverlay');
const recordingDate = document.querySelector('#recordingDate span');

// Navigation
const navItems = document.querySelectorAll('.nav-item');
const panels = document.querySelectorAll('.panel');

// Player
const playerTabs = document.querySelectorAll('.tab-btn');
const playerContents = document.querySelectorAll('.player-content');
const videoPlayer = document.getElementById('recordingVideo');
const noVideoMessage = document.getElementById('noVideoMessage');
const noDomMessage = document.getElementById('noDomMessage');
const rrwebPlayerContainer = document.getElementById('rrwebPlayer');

// Console
const consoleLogsContainer = document.getElementById('consoleLogs');
const consoleCount = document.getElementById('consoleCount');
const consoleSearch = document.getElementById('consoleSearch');
const consoleFilter = document.getElementById('consoleFilter');
const clearConsoleFilter = document.getElementById('clearConsoleFilter');
const exportConsole = document.getElementById('exportConsole');

// Network
const networkRequests = document.getElementById('networkRequests');
const networkCount = document.getElementById('networkCount');
const networkSearch = document.getElementById('networkSearch');
const networkFilter = document.getElementById('networkFilter');
const exportNetwork = document.getElementById('exportNetwork');

// Summary
const bugTitle = document.getElementById('bugTitle');
const bugDescription = document.getElementById('bugDescription');
const stepsToReproduce = document.getElementById('stepsToReproduce');
const expectedBehavior = document.getElementById('expectedBehavior');
const actualBehavior = document.getElementById('actualBehavior');
const generateAiSummary = document.getElementById('generateAiSummary');
const aiSuggestions = document.getElementById('aiSuggestions');
const suggestionContent = document.getElementById('suggestionContent');
const applyAiSuggestions = document.getElementById('applyAiSuggestions');
const dismissAiSuggestions = document.getElementById('dismissAiSuggestions');

// Timeline
const timelineContainer = document.getElementById('timelineContainer');
const timelineZoomIn = document.getElementById('timelineZoomIn');
const timelineZoomOut = document.getElementById('timelineZoomOut');

// Header actions
const downloadBtn = document.getElementById('downloadBtn');
const createJiraBtn = document.getElementById('createJiraBtn');

// Jira Modal
const jiraModal = document.getElementById('jiraModal');
const closeJiraModal = document.getElementById('closeJiraModal');
const jiraProject = document.getElementById('jiraProject');
const jiraIssueType = document.getElementById('jiraIssueType');
const submitJiraTicket = document.getElementById('submitJiraTicket');
const cancelJiraSubmit = document.getElementById('cancelJiraSubmit');

// Initialize
init();

async function init() {
    try {
        showLoading('Loading recording data...');
        
        // Load utilities
        loadUtilities();
        
        // Load JSZip
        try {
            JSZip = await loadJSZip();
            console.log('JSZip loaded successfully');
        } catch (error) {
            console.error('Failed to load JSZip:', error);
        }
        
        // Load recording data
        await loadRecording();
        
        // Set up event listeners
        setupEventListeners();
        
        // Initialize UI
        updateUI();
        
        hideLoading();
    } catch (error) {
        console.error('Failed to initialize:', error);
        showError('Failed to load recording: ' + error.message);
        hideLoading();
    }
}

async function loadRecording() {
    const stored = await chrome.storage.local.get(`recording_${recordingId}`);
    currentRecording = stored[`recording_${recordingId}`];
    
    if (!currentRecording) {
        throw new Error('Recording not found');
    }
    
    // Update recording date
    const date = new Date(currentRecording.timestamp);
    recordingDate.textContent = date.toLocaleString();
}

function setupEventListeners() {
    // Navigation
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const panel = item.dataset.panel;
            switchPanel(panel);
        });
    });
    
    // Player tabs
    playerTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const player = tab.dataset.player;
            switchPlayer(player);
        });
    });
    
    // Console
    consoleSearch.addEventListener('input', filterConsoleLogs);
    consoleFilter.addEventListener('change', filterConsoleLogs);
    clearConsoleFilter.addEventListener('click', () => {
        consoleSearch.value = '';
        consoleFilter.value = 'all';
        filterConsoleLogs();
    });
    exportConsole.addEventListener('click', exportConsoleLogs);
    
    // Network
    networkSearch.addEventListener('input', filterNetworkRequests);
    networkFilter.addEventListener('change', filterNetworkRequests);
    exportNetwork.addEventListener('click', exportNetworkHAR);
    
    // Summary
    generateAiSummary.addEventListener('click', handleGenerateAiSummary);
    applyAiSuggestions.addEventListener('click', handleApplyAiSuggestions);
    dismissAiSuggestions.addEventListener('click', () => {
        aiSuggestions.style.display = 'none';
    });
    
    // Timeline
    timelineZoomIn.addEventListener('click', () => zoomTimeline(1.2));
    timelineZoomOut.addEventListener('click', () => zoomTimeline(0.8));
    
    // Header actions
    downloadBtn.addEventListener('click', handleDownloadAll);
    createJiraBtn.addEventListener('click', showJiraModal);
    
    // Jira Modal
    closeJiraModal.addEventListener('click', hideJiraModal);
    cancelJiraSubmit.addEventListener('click', hideJiraModal);
    submitJiraTicket.addEventListener('click', handleSubmitJira);
    jiraProject.addEventListener('change', handleProjectChange);
    
    // Close modal on outside click
    jiraModal.addEventListener('click', (e) => {
        if (e.target === jiraModal) {
            hideJiraModal();
        }
    });
}

function updateUI() {
    // Update counts
    consoleCount.textContent = currentRecording.consoleLogs?.length || 0;
    networkCount.textContent = currentRecording.networkLogs?.length || 0;
    
    // Initialize panels
    initializePlayer();
    initializeConsole();
    initializeNetwork();
    initializeTimeline();
}

function switchPanel(panel) {
    currentPanel = panel;
    
    // Update navigation
    navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.panel === panel);
    });
    
    // Update panels
    panels.forEach(p => {
        p.classList.toggle('active', p.id === `${panel}Panel`);
    });
}

function switchPlayer(player) {
    currentPlayer = player;
    
    // Update tabs
    playerTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.player === player);
    });
    
    // Update content
    playerContents.forEach(content => {
        content.classList.toggle('active', 
            (player === 'video' && content.id === 'videoPlayer') ||
            (player === 'dom' && content.id === 'domPlayer')
        );
    });
}

// Player Functions
function initializePlayer() {
    // Video player
    if (currentRecording.videoBlob) {
        const videoUrl = URL.createObjectURL(currentRecording.videoBlob);
        videoPlayer.src = videoUrl;
        videoPlayer.style.display = 'block';
        noVideoMessage.style.display = 'none';
    } else {
        videoPlayer.style.display = 'none';
        noVideoMessage.style.display = 'flex';
        document.getElementById('videoTab').disabled = true;
    }
    
    // rrweb player
    if (currentRecording.domEvents && currentRecording.domEvents.length > 0) {
        initializeRrwebPlayer();
        noDomMessage.style.display = 'none';
    } else {
        noDomMessage.style.display = 'flex';
        document.getElementById('domTab').disabled = true;
    }
    
    // If no video, default to DOM player if available
    if (!currentRecording.videoBlob && currentRecording.domEvents?.length > 0) {
        switchPlayer('dom');
    }
}

function initializeRrwebPlayer() {
    if (!window.rrwebPlayer) {
        console.error('rrweb-player not loaded');
        return;
    }
    
    rrwebPlayer = new window.rrwebPlayer({
        target: rrwebPlayerContainer,
        props: {
            events: currentRecording.domEvents,
            width: rrwebPlayerContainer.offsetWidth,
            height: rrwebPlayerContainer.offsetHeight - 80, // Account for controls
            autoPlay: false,
            showController: true,
            tags: {
                'error': 'red',
                'warn': 'orange',
                'info': 'blue'
            }
        }
    });
}

// Console Functions
function initializeConsole() {
    renderConsoleLogs(currentRecording.consoleLogs || []);
}

function renderConsoleLogs(logs) {
    consoleLogsContainer.innerHTML = '';
    
    if (logs.length === 0) {
        consoleLogsContainer.innerHTML = '<div class="empty-state">No console logs captured</div>';
        return;
    }
    
    logs.forEach(log => {
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.dataset.level = log.level;
        
        const timestamp = new Date(log.timestamp);
        const time = timestamp.toLocaleTimeString();
        
        entry.innerHTML = `
            <span class="log-level ${log.level}">${log.level}</span>
            <span class="log-timestamp">${time}</span>
            <div class="log-message">${formatLogMessage(log.args)}</div>
        `;
        
        consoleLogsContainer.appendChild(entry);
    });
}

function formatLogMessage(args) {
    return args.map(arg => {
        if (typeof arg === 'object') {
            return JSON.stringify(arg, null, 2);
        }
        return String(arg);
    }).join(' ');
}

function filterConsoleLogs() {
    const searchTerm = consoleSearch.value.toLowerCase();
    const filterLevel = consoleFilter.value;
    
    const entries = consoleLogsContainer.querySelectorAll('.log-entry');
    entries.forEach(entry => {
        const message = entry.querySelector('.log-message').textContent.toLowerCase();
        const level = entry.dataset.level;
        
        const matchesSearch = !searchTerm || message.includes(searchTerm);
        const matchesFilter = filterLevel === 'all' || level === filterLevel;
        
        entry.style.display = matchesSearch && matchesFilter ? 'flex' : 'none';
    });
}

function exportConsoleLogs() {
    const logs = formatConsoleLogsForReport(currentRecording.consoleLogs || []);
    downloadFile('console-logs.txt', logs, 'text/plain');
}

// Network Functions
function initializeNetwork() {
    renderNetworkRequests(currentRecording.networkLogs || []);
}

function renderNetworkRequests(logs) {
    networkRequests.innerHTML = '';
    
    if (logs.length === 0) {
        networkRequests.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">No network requests captured</td></tr>';
        return;
    }
    
    // Group by request ID
    const requests = {};
    logs.forEach(log => {
        const id = log.params?.requestId || log.requestId;
        if (!id) return;
        
        if (!requests[id]) {
            requests[id] = {};
        }
        requests[id][log.type] = log;
    });
    
    // Render each request
    Object.entries(requests).forEach(([id, events]) => {
        const request = events['Network.requestWillBeSent'];
        const response = events['Network.responseReceived'];
        const finished = events['Network.loadingFinished'];
        const failed = events['Network.loadingFailed'];
        
        if (!request) return;
        
        const row = document.createElement('tr');
        const url = new URL(request.params.request.url);
        const method = request.params.request.method;
        const status = response?.params.response.status || (failed ? 'Failed' : 'Pending');
        const mimeType = response?.params.response.mimeType || '-';
        const size = finished?.params.encodedDataLength || '-';
        const time = calculateRequestTime(request, response, finished);
        
        row.innerHTML = `
            <td><span class="status-badge ${getStatusClass(status)}">${status}</span></td>
            <td>${method}</td>
            <td title="${request.params.request.url}">${url.pathname}</td>
            <td>${getResourceType(mimeType, url)}</td>
            <td>${formatBytes(size)}</td>
            <td>${time}ms</td>
        `;
        
        networkRequests.appendChild(row);
    });
}

function getStatusClass(status) {
    if (status === 'Failed' || status >= 400) return 'error';
    if (status === 'Pending') return 'pending';
    return 'success';
}

function getResourceType(mimeType, url) {
    if (mimeType.includes('javascript')) return 'JS';
    if (mimeType.includes('css')) return 'CSS';
    if (mimeType.includes('html')) return 'Document';
    if (mimeType.includes('image')) return 'Image';
    if (mimeType.includes('json')) return 'XHR';
    if (url.pathname.endsWith('.js')) return 'JS';
    if (url.pathname.endsWith('.css')) return 'CSS';
    return 'Other';
}

function formatBytes(bytes) {
    if (bytes === '-' || !bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function calculateRequestTime(request, response, finished) {
    if (!response || !finished) return '-';
    const start = request.timestamp || 0;
    const end = finished.timestamp || response.timestamp || 0;
    return Math.round((end - start) * 1000);
}

function filterNetworkRequests() {
    // Implementation similar to console filtering
}

function exportNetworkHAR() {
    // Create HAR format export
    const har = {
        log: {
            version: '1.2',
            creator: {
                name: 'Advanced Bug Reporter',
                version: '2.0.0'
            },
            entries: []
            // ... populate with network data
        }
    };
    
    downloadFile('network.har', JSON.stringify(har, null, 2), 'application/json');
}

// Timeline Functions
function initializeTimeline() {
    renderTimeline();
}

function renderTimeline() {
    // Create visual timeline of events
    // This would create a combined view of console logs, network requests, and user actions
}

function zoomTimeline(factor) {
    // Implement timeline zoom
}

// AI Summary Functions
async function handleGenerateAiSummary() {
    try {
        generateAiSummary.disabled = true;
        generateAiSummary.innerHTML = '<div class="loading"></div> Generating...';
        
        const response = await sendMessage('GENERATE_AI_SUGGESTIONS', {
            recordingId: recordingId,
            summary: bugTitle.value,
            description: bugDescription.value
        });
        
        if (!response.success) {
            throw new Error(response.error || 'Failed to generate suggestions');
        }
        
        displayAiSuggestions(response.aiSummary, response.aiSteps);
        
    } catch (error) {
        showError('Failed to generate AI suggestions: ' + error.message);
    } finally {
        generateAiSummary.disabled = false;
        generateAiSummary.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7V17C2 19.21 3.79 21 6 21H18C20.21 21 22 19.21 22 17V7L12 2Z" stroke="currentColor" stroke-width="2"/>
            </svg>
            Generate AI Summary
        `;
    }
}

function displayAiSuggestions(summary, steps) {
    suggestionContent.innerHTML = `
        <div class="suggestion-section">
            <h4>Suggested Summary:</h4>
            <p>${escapeHtml(summary)}</p>
        </div>
        <div class="suggestion-section">
            <h4>Suggested Steps to Reproduce:</h4>
            <pre>${escapeHtml(steps)}</pre>
        </div>
    `;
    
    aiSuggestions.style.display = 'block';
}

function handleApplyAiSuggestions() {
    const sections = suggestionContent.querySelectorAll('.suggestion-section');
    if (sections.length >= 2) {
        const summary = sections[0].querySelector('p').textContent;
        const steps = sections[1].querySelector('pre').textContent;
        
        if (!bugTitle.value) bugTitle.value = summary;
        if (!stepsToReproduce.value) stepsToReproduce.value = steps;
        
        aiSuggestions.style.display = 'none';
    }
}

// Download Functions
async function handleDownloadAll() {
    if (!JSZip) {
        showError('JSZip not loaded. Cannot create download package.');
        return;
    }
    
    try {
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = '<div class="loading"></div> Preparing...';
        
        // Create a zip file with all data
        const zip = new JSZip();
        
        // Add video if available
        if (currentRecording.videoBlob) {
            zip.file('recording.webm', currentRecording.videoBlob);
        }
        
        // Add DOM events
        if (currentRecording.domEvents?.length > 0) {
            zip.file('dom-recording.json', JSON.stringify(currentRecording.domEvents, null, 2));
        }
        
        // Add console logs
        if (currentRecording.consoleLogs?.length > 0) {
            const consoleText = formatConsoleLogsForReport(currentRecording.consoleLogs);
            zip.file('console-logs.txt', consoleText);
            zip.file('console-logs.json', JSON.stringify(currentRecording.consoleLogs, null, 2));
        }
        
        // Add network logs
        if (currentRecording.networkLogs?.length > 0) {
            const networkText = formatNetworkLogsForReport(currentRecording.networkLogs);
            zip.file('network-logs.txt', networkText);
            zip.file('network-logs.json', JSON.stringify(currentRecording.networkLogs, null, 2));
        }
        
        // Add metadata
        const metadata = {
            id: currentRecording.id,
            timestamp: currentRecording.timestamp,
            duration: currentRecording.duration,
            pageUrl: currentRecording.pageUrl,
            pageTitle: currentRecording.pageTitle,
            userAgent: currentRecording.userAgent,
            screenResolution: currentRecording.screenResolution
        };
        zip.file('metadata.json', JSON.stringify(metadata, null, 2));
        
        // Generate and download zip
        const blob = await zip.generateAsync({ type: 'blob' });
        const filename = `bug-report-${currentRecording.id}.zip`;
        downloadFile(filename, blob);
        
    } catch (error) {
        showError('Failed to prepare download: ' + error.message);
    } finally {
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M21 15V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V15" stroke="currentColor" stroke-width="2"/>
                <path d="M7 10L12 15L17 10" stroke="currentColor" stroke-width="2"/>
                <path d="M12 15V3" stroke="currentColor" stroke-width="2"/>
            </svg>
            Download All
        `;
    }
}

// Jira Functions
async function showJiraModal() {
    jiraModal.classList.add('show');
    await loadJiraProjects();
}

function hideJiraModal() {
    jiraModal.classList.remove('show');
}

async function loadJiraProjects() {
    try {
        jiraProject.innerHTML = '<option value="">Loading projects...</option>';
        jiraProject.disabled = true;
        
        const response = await sendMessage('FETCH_JIRA_PROJECTS');
        
        if (!response.success) {
            throw new Error(response.error || 'Failed to load projects');
        }
        
        jiraProject.innerHTML = '<option value="">Select a project...</option>';
        response.projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.key;
            option.textContent = `${project.name} (${project.key})`;
            jiraProject.appendChild(option);
        });
        
        jiraProject.disabled = false;
        
    } catch (error) {
        jiraProject.innerHTML = '<option value="">Failed to load projects</option>';
        showError('Failed to load Jira projects: ' + error.message);
    }
}

async function handleProjectChange() {
    const projectKey = jiraProject.value;
    if (!projectKey) {
        jiraIssueType.innerHTML = '<option value="">Select project first...</option>';
        jiraIssueType.disabled = true;
        return;
    }
    
    try {
        jiraIssueType.innerHTML = '<option value="">Loading issue types...</option>';
        jiraIssueType.disabled = true;
        
        const response = await sendMessage('FETCH_JIRA_ISSUE_TYPES', { projectKey });
        
        if (!response.success) {
            throw new Error(response.error || 'Failed to load issue types');
        }
        
        jiraIssueType.innerHTML = '<option value="">Select issue type...</option>';
        response.issueTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type.name;
            option.textContent = type.name;
            jiraIssueType.appendChild(option);
        });
        
        jiraIssueType.disabled = false;
        
    } catch (error) {
        jiraIssueType.innerHTML = '<option value="">Failed to load issue types</option>';
        showError('Failed to load issue types: ' + error.message);
    }
}

async function handleSubmitJira() {
    try {
        const projectKey = jiraProject.value;
        const issueTypeName = jiraIssueType.value;
        const summary = bugTitle.value || 'Bug Report';
        const description = `
${bugDescription.value || 'No description provided'}

Steps to Reproduce:
${stepsToReproduce.value || 'Not specified'}

Expected Behavior:
${expectedBehavior.value || 'Not specified'}

Actual Behavior:
${actualBehavior.value || 'Not specified'}

Recording Details:
- Page: ${currentRecording.pageTitle} (${currentRecording.pageUrl})
- Date: ${new Date(currentRecording.timestamp).toLocaleString()}
- Duration: ${formatDuration(currentRecording.duration)}
- Console Logs: ${currentRecording.consoleLogs?.length || 0}
- Network Requests: ${currentRecording.networkLogs?.length || 0}
        `.trim();
        
        if (!projectKey || !issueTypeName) {
            showError('Please select project and issue type');
            return;
        }
        
        submitJiraTicket.disabled = true;
        submitJiraTicket.innerHTML = '<div class="loading"></div> Creating...';
        
        const attachments = {
            video: document.getElementById('attachVideo').checked,
            logs: document.getElementById('attachLogs').checked,
            dom: document.getElementById('attachDom').checked
        };
        
        const response = await sendMessage('SUBMIT_TO_JIRA', {
            recordingId,
            projectKey,
            issueTypeName,
            summary,
            description,
            attachments
        });
        
        if (!response.success) {
            throw new Error(response.error || 'Failed to create Jira ticket');
        }
        
        hideJiraModal();
        showSuccess(`Jira ticket created: ${response.issueKey}`);
        
    } catch (error) {
        showError('Failed to create Jira ticket: ' + error.message);
    } finally {
        submitJiraTicket.disabled = false;
        submitJiraTicket.innerHTML = 'Create Ticket';
    }
}

// Utility Functions
function sendMessage(type, payload = {}) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type, payload }, response => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(response);
            }
        });
    });
}

function showLoading(message) {
    document.getElementById('loadingMessage').textContent = message;
    loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    loadingOverlay.classList.add('hidden');
}

function showError(message) {
    console.error(message);
    // Could show a toast notification
}

function showSuccess(message) {
    console.log(message);
    // Could show a toast notification
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
}

function downloadFile(filename, content, mimeType = 'application/octet-stream') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}