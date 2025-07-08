// popup/popup.js - Enhanced with modern features
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const statusSection = document.getElementById('status-section');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const statusMessage = document.getElementById('statusMessage');
    const errorContainer = document.getElementById('error-message-container');
    const errorMessage = document.getElementById('errorMessage');
    
    const recordingOptions = document.getElementById('recording-options');
    const toggleRecordButton = document.getElementById('toggleRecordButton');
    const recordingTimer = document.getElementById('recordingTimer');
    const timerDisplay = document.getElementById('timerDisplay');
    
    const recentRecordingsSection = document.getElementById('recent-recordings');
    const recordingsList = document.getElementById('recordingsList');
    
    const settingsBtn = document.getElementById('settingsBtn');
    const viewAllRecordings = document.getElementById('viewAllRecordings');
    const helpLink = document.getElementById('helpLink');
    
    // State
    let isRecording = false;
    let recordingInterval = null;
    let recordingStartTime = null;
    
    // Initialize
    init();
    
    async function init() {
        try {
            // Get current recording state
            const state = await sendMessage('GET_RECORDING_STATE');
            updateUI(state);
            
            // Load recent recordings
            loadRecentRecordings();
            
            // Set up event listeners
            setupEventListeners();
            
            // Listen for state updates
            chrome.runtime.onMessage.addListener(handleMessage);
        } catch (error) {
            showError('Failed to initialize: ' + error.message);
        }
    }
    
    function setupEventListeners() {
        // Recording button
        toggleRecordButton.addEventListener('click', handleToggleRecording);
        
        // Settings button
        settingsBtn.addEventListener('click', () => {
            chrome.runtime.openOptionsPage();
        });
        
        // View all recordings
        viewAllRecordings.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.create({
                url: chrome.runtime.getURL('review/recordings.html')
            });
        });
        
        // Help link
        helpLink.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.create({
                url: 'https://github.com/your-repo/advanced-bug-reporter/wiki'
            });
        });
        
        // Recording options
        document.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(input => {
            input.addEventListener('change', updateRecordingOptions);
        });
    }
    
    async function handleToggleRecording() {
        if (isRecording) {
            await stopRecording();
        } else {
            await startRecording();
        }
    }
    
    async function startRecording() {
        try {
            // Disable button during operation
            toggleRecordButton.disabled = true;
            toggleRecordButton.innerHTML = `
                <div class="loading"></div>
                Starting...
            `;
            
            // Get current tab
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!activeTab) {
                throw new Error('No active tab found');
            }
            
            if (activeTab.url.startsWith('chrome://')) {
                throw new Error('Cannot record browser pages');
            }
            
            // Get recording options
            const options = {
                captureMode: document.querySelector('input[name="captureMode"]:checked').value,
                recordVideo: document.getElementById('recordVideo').checked,
                recordDOM: document.getElementById('recordDOM').checked,
                recordConsole: document.getElementById('recordConsole').checked,
                recordNetwork: document.getElementById('recordNetwork').checked
            };
            
            // Start recording
            const response = await sendMessage('START_RECORDING', { 
                tabId: activeTab.id, 
                options 
            });
            
            if (!response.success) {
                throw new Error(response.error || 'Failed to start recording');
            }
            
            // Update UI
            isRecording = true;
            recordingStartTime = Date.now();
            updateRecordingUI(true);
            startTimer();
            
        } catch (error) {
            showError(error.message);
            toggleRecordButton.disabled = false;
            updateRecordingUI(false);
        }
    }
    
    async function stopRecording() {
        try {
            toggleRecordButton.disabled = true;
            toggleRecordButton.innerHTML = `
                <div class="loading"></div>
                Stopping...
            `;
            
            const response = await sendMessage('STOP_RECORDING');
            
            if (!response.success) {
                throw new Error(response.error || 'Failed to stop recording');
            }
            
            // Update UI
            isRecording = false;
            updateRecordingUI(false);
            stopTimer();
            
            // Show success message
            statusMessage.textContent = 'Recording saved! Opening review page...';
            
        } catch (error) {
            showError(error.message);
            toggleRecordButton.disabled = false;
        }
    }
    
    function updateUI(state) {
        isRecording = state.isRecording;
        
        if (state.isRecording) {
            recordingStartTime = Date.now() - (state.recordingDuration || 0);
            updateRecordingUI(true);
            startTimer();
        } else {
            updateRecordingUI(false);
        }
        
        // Update options if provided
        if (state.options) {
            const captureMode = document.querySelector(`input[name="captureMode"][value="${state.options.captureMode}"]`);
            if (captureMode) captureMode.checked = true;
            
            document.getElementById('recordVideo').checked = state.options.recordVideo;
            document.getElementById('recordDOM').checked = state.options.recordDOM;
            document.getElementById('recordConsole').checked = state.options.recordConsole;
            document.getElementById('recordNetwork').checked = state.options.recordNetwork;
        }
    }
    
    function updateRecordingUI(recording) {
        if (recording) {
            statusDot.classList.add('recording');
            statusText.textContent = 'Recording';
            statusMessage.textContent = 'Recording in progress...';
            
            toggleRecordButton.classList.add('recording');
            toggleRecordButton.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
                </svg>
                Stop Recording
            `;
            
            recordingOptions.style.opacity = '0.5';
            recordingOptions.style.pointerEvents = 'none';
            
            recordingTimer.style.display = 'flex';
        } else {
            statusDot.classList.remove('recording');
            statusText.textContent = 'Ready to Record';
            statusMessage.textContent = 'Choose your recording options below';
            
            toggleRecordButton.classList.remove('recording');
            toggleRecordButton.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                    <circle cx="12" cy="12" r="3" fill="currentColor"/>
                </svg>
                Start Recording
            `;
            
            recordingOptions.style.opacity = '1';
            recordingOptions.style.pointerEvents = 'auto';
            
            recordingTimer.style.display = 'none';
        }
        
        toggleRecordButton.disabled = false;
    }
    
    function startTimer() {
        if (recordingInterval) clearInterval(recordingInterval);
        
        recordingInterval = setInterval(() => {
            const elapsed = Date.now() - recordingStartTime;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }
    
    function stopTimer() {
        if (recordingInterval) {
            clearInterval(recordingInterval);
            recordingInterval = null;
        }
        timerDisplay.textContent = '00:00';
    }
    
    async function loadRecentRecordings() {
        try {
            const response = await sendMessage('GET_RECENT_RECORDINGS');
            
            if (!response.success || !response.recordings || response.recordings.length === 0) {
                recentRecordingsSection.style.display = 'none';
                return;
            }
            
            recentRecordingsSection.style.display = 'block';
            recordingsList.innerHTML = '';
            
            // Show only the 3 most recent recordings
            response.recordings.slice(0, 3).forEach(recording => {
                const item = createRecordingItem(recording);
                recordingsList.appendChild(item);
            });
            
        } catch (error) {
            console.error('Failed to load recent recordings:', error);
            recentRecordingsSection.style.display = 'none';
        }
    }
    
    function createRecordingItem(recording) {
        const item = document.createElement('div');
        item.className = 'recording-item';
        item.dataset.recordingId = recording.id;
        
        const date = new Date(recording.timestamp);
        const timeAgo = getTimeAgo(date);
        const duration = formatDuration(recording.duration);
        
        item.innerHTML = `
            <div class="recording-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2"/>
                    <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2"/>
                    <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2"/>
                </svg>
            </div>
            <div class="recording-info">
                <div class="recording-title">${escapeHtml(recording.pageTitle || 'Untitled Recording')}</div>
                <div class="recording-meta">${timeAgo} · ${duration} · ${recording.consoleLogs} logs</div>
            </div>
        `;
        
        item.addEventListener('click', () => openRecording(recording.id));
        
        return item;
    }
    
    function openRecording(recordingId) {
        sendMessage('OPEN_RECORDING', { recordingId });
    }
    
    function updateRecordingOptions() {
        // This could be used to save preferences or validate options
        const videoChecked = document.getElementById('recordVideo').checked;
        const domChecked = document.getElementById('recordDOM').checked;
        
        // Ensure at least one recording method is selected
        if (!videoChecked && !domChecked) {
            document.getElementById('recordVideo').checked = true;
            showError('At least one recording method must be selected');
        }
    }
    
    function handleMessage(message) {
        switch (message.type) {
            case 'RECORDING_STARTED':
                isRecording = true;
                recordingStartTime = Date.now();
                updateRecordingUI(true);
                startTimer();
                break;
                
            case 'RECORDING_STOPPED':
                isRecording = false;
                updateRecordingUI(false);
                stopTimer();
                if (!message.payload.error) {
                    // Reload recent recordings
                    loadRecentRecordings();
                }
                break;
                
            case 'RECORDING_STATE_UPDATED':
                updateUI(message.payload);
                break;
        }
    }
    
    // Utility functions
    function sendMessage(type, payload = {}) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type, ...payload }, response => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
    }
    
    function showError(message, duration = 5000) {
        errorMessage.textContent = message;
        errorContainer.style.display = 'flex';
        
        setTimeout(() => {
            errorContainer.style.display = 'none';
        }, duration);
    }
    
    function getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }
    
    function formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        
        if (minutes === 0) return `${seconds}s`;
        return `${minutes}m ${remainingSeconds}s`;
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});