// popup/popup.js
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const toggleRecordButton = document.getElementById('toggleRecordButton');
    const statusMessage = document.getElementById('statusMessage');
    const bugForm = document.getElementById('bug-form');

    // Jira dynamic fields
    const jiraProjectSelect = document.getElementById('jiraProject');
    const jiraIssueTypeSelect = document.getElementById('jiraIssueType');
    const jiraProjectLoader = document.getElementById('jiraProjectLoader');
    const jiraIssueTypeLoader = document.getElementById('jiraIssueTypeLoader');

    const bugSummaryInput = document.getElementById('bugSummary');
    const bugDescriptionInput = document.getElementById('bugDescription');
    const generateAIButton = document.getElementById('generateAIButton');
    const aiSuggestionsDiv = document.getElementById('ai-suggestions');
    const aiSummaryInput = document.getElementById('aiSummary');
    const aiStepsInput = document.getElementById('aiSteps');
    const submitJiraButton = document.getElementById('submitJiraButton');
    const submissionStatus = document.getElementById('submissionStatus');
    const optionsLink = document.getElementById('optionsLink');
    const errorMessageContainer = document.getElementById('error-message-container');
    const errorMessageElement = document.getElementById('errorMessage');

    let currentJiraProjects = [];
    let currentJiraIssueTypes = [];

    // --- Utility Functions ---
    function showGeneralError(message, permanent = false) {
        errorMessageElement.textContent = message;
        errorMessageContainer.style.display = 'block';
        if (!permanent) {
            setTimeout(() => {
                errorMessageContainer.style.display = 'none';
            }, 7000); // Increased display time for errors
        }
    }

    function updateButtonState(button, text, disabled) {
        if (button) {
            button.textContent = text;
            button.disabled = disabled;
        }
    }

    function checkSubmitButtonState() {
        const projectSelected = jiraProjectSelect.value && jiraProjectSelect.value !== "";
        const issueTypeSelected = jiraIssueTypeSelect.value && jiraIssueTypeSelect.value !== "";
        const summaryProvided = bugSummaryInput.value.trim() !== "";
        submitJiraButton.disabled = !(projectSelected && issueTypeSelected && summaryProvided);
    }

    // --- Jira Dropdown Functions ---
    function populateProjectsDropdown(projects) {
        currentJiraProjects = projects || [];
        jiraProjectSelect.innerHTML = ''; // Clear existing options

        if (!currentJiraProjects || currentJiraProjects.length === 0) {
            const option = new Option('No projects found or Jira not configured.', '');
            jiraProjectSelect.add(option);
            jiraProjectSelect.disabled = true;
            showGeneralError('No Jira projects found. Please check Jira configuration in Options.', true);
            return;
        }

        jiraProjectSelect.add(new Option('Select a project...', ''));
        currentJiraProjects.forEach(project => {
            // Ensure project.name and project.key exist
            if (project && project.name && project.key) {
                 const option = new Option(`${project.name} (${project.key})`, project.key);
                 jiraProjectSelect.add(option);
            } else {
                console.warn("Skipping project due to missing name or key:", project);
            }
        });
        jiraProjectSelect.disabled = false;
        checkSubmitButtonState();
    }

    function populateIssueTypesDropdown(issueTypes) {
        currentJiraIssueTypes = issueTypes || [];
        jiraIssueTypeSelect.innerHTML = ''; // Clear existing options

        if (!currentJiraIssueTypes || currentJiraIssueTypes.length === 0) {
            const option = new Option('No issue types found for this project.', '');
            jiraIssueTypeSelect.add(option);
            jiraIssueTypeSelect.disabled = true;
            return;
        }

        jiraIssueTypeSelect.add(new Option('Select an issue type...', ''));
        currentJiraIssueTypes.forEach(issueType => {
            // Ensure issueType.name exists
            if (issueType && issueType.name) {
                const option = new Option(issueType.name, issueType.name); // Using name as value for simplicity
                jiraIssueTypeSelect.add(option);
            } else {
                console.warn("Skipping issue type due to missing name:", issueType);
            }
        });
        jiraIssueTypeSelect.disabled = false;
        checkSubmitButtonState();
    }

    async function fetchJiraProjects() {
        jiraProjectLoader.style.display = 'inline';
        jiraProjectSelect.disabled = true;
        jiraIssueTypeSelect.innerHTML = '<option value="">Select a project first...</option>';
        jiraIssueTypeSelect.disabled = true;

        chrome.runtime.sendMessage({ type: 'FETCH_JIRA_PROJECTS' }, (response) => {
            jiraProjectLoader.style.display = 'none';
            if (chrome.runtime.lastError || !response || !response.success) {
                const errorMsg = (response && response.error) || chrome.runtime.lastError?.message || 'Failed to fetch Jira projects.';
                showGeneralError(errorMsg, true); // Keep error visible
                populateProjectsDropdown([]); // Show no projects
                console.error('Error fetching Jira projects:', errorMsg);
            } else {
                populateProjectsDropdown(response.projects);
            }
        });
    }

    async function fetchJiraIssueTypes(projectKey) {
        if (!projectKey) {
            jiraIssueTypeSelect.innerHTML = '<option value="">Select a project first...</option>';
            jiraIssueTypeSelect.disabled = true;
            currentJiraIssueTypes = [];
            checkSubmitButtonState();
            return;
        }
        jiraIssueTypeLoader.style.display = 'inline';
        jiraIssueTypeSelect.disabled = true;
        jiraIssueTypeSelect.innerHTML = '<option value="">Loading issue types...</option>';


        chrome.runtime.sendMessage({ type: 'FETCH_JIRA_ISSUE_TYPES', payload: { projectKey } }, (response) => {
            jiraIssueTypeLoader.style.display = 'none';
            if (chrome.runtime.lastError || !response || !response.success) {
                const errorMsg = (response && response.error) || chrome.runtime.lastError?.message || 'Failed to fetch Jira issue types.';
                showGeneralError(errorMsg);
                populateIssueTypesDropdown([]); // Show no issue types
                console.error(`Error fetching Jira issue types for ${projectKey}:`, errorMsg);
            } else {
                populateIssueTypesDropdown(response.issueTypes);
            }
        });
    }

    // --- UI Update Functions ---
    function updateRecordingUI(isRecording, hasRecordedData, error = null) {
        // *** ADDED LOGGING ***
        console.log(`[Popup] updateRecordingUI called. isRecording: ${isRecording}, hasRecordedData: ${hasRecordedData}, error: ${error}`);

        if (error) {
            statusMessage.textContent = `Error: ${error}`;
            statusMessage.style.color = 'red';
        } else {
            statusMessage.style.color = '#555';
            statusMessage.textContent = isRecording ? 'Status: Recording...' : (hasRecordedData ? 'Status: Recording stopped. Fill details.' : 'Status: Idle');
        }

        toggleRecordButton.textContent = isRecording ? 'Stop Recording' : 'Start Recording';
        toggleRecordButton.disabled = false;

        if (isRecording) {
            bugForm.style.display = 'none';
            aiSuggestionsDiv.style.display = 'none';
        } else {
            // *** Check the condition here ***
            if (hasRecordedData) {
                console.log("[Popup] 'hasRecordedData' is true, showing bug form.");
                bugForm.style.display = 'block';
                generateAIButton.disabled = !(bugSummaryInput.value.trim() || bugDescriptionInput.value.trim());
                // Fetch projects only if the form is being newly displayed
                // Check if projects dropdown is already populated or loading to avoid redundant calls
                if (jiraProjectSelect.options.length <= 1 || jiraProjectSelect.options[0].value === "") {
                     fetchJiraProjects();
                }
            } else {
                console.log("[Popup] 'hasRecordedData' is false, hiding bug form.");
                bugForm.style.display = 'none';
            }
        }
        checkSubmitButtonState(); // Always check submit button state
    }

    // --- Event Listeners ---
    toggleRecordButton.addEventListener('click', async () => {
        updateButtonState(toggleRecordButton, 'Processing...', true);
        try {
            // Use sendMessage with callback for state consistency
            chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATE' }, (state) => {
                 if (chrome.runtime.lastError) {
                    throw new Error(chrome.runtime.lastError.message || "Communication error.");
                 }
                 if (!state) {
                    throw new Error("Invalid state received from service worker.");
                 }

                if (state.isRecording) {
                    // Send STOP_RECORDING message
                    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }, (response) => {
                        if (chrome.runtime.lastError || !response || !response.success) {
                            const errorMsg = (response && response.error) || chrome.runtime.lastError?.message || 'Failed to stop.';
                            showGeneralError(errorMsg);
                            updateRecordingUI(true, state.hasRecordedData); // Revert UI
                        } else {
                            // Update UI immediately, assuming data *will* be available
                            // The RECORDING_STATE_UPDATED message will provide the final confirmation
                            updateRecordingUI(false, true); // Optimistically assume data exists
                        }
                        toggleRecordButton.disabled = false;
                    });
                } else {
                    // Send START_RECORDING message
                    chrome.tabs.query({ active: true, currentWindow: true }).then(([activeTab]) => {
                        if (!activeTab) {
                             showGeneralError("No active tab found.");
                             updateButtonState(toggleRecordButton, 'Start Recording', false); return;
                        }
                        if (activeTab.url.startsWith("chrome://")) {
                             showGeneralError("Cannot record system pages.");
                             updateButtonState(toggleRecordButton, 'Start Recording', false); return;
                        }
                        chrome.runtime.sendMessage({ type: 'START_RECORDING', tabId: activeTab.id }, (response) => {
                            if (chrome.runtime.lastError || !response || !response.success) {
                                const errorMsg = (response && response.error) || chrome.runtime.lastError?.message || 'Failed to start.';
                                showGeneralError(errorMsg);
                                updateRecordingUI(false, state.hasRecordedData);
                            } else {
                                updateRecordingUI(true, false);
                            }
                            toggleRecordButton.disabled = false;
                        });
                    }).catch(e => { // Catch error from chrome.tabs.query
                         showGeneralError(`Error getting active tab: ${e.message}`);
                         updateButtonState(toggleRecordButton, 'Start Recording', false);
                    });
                }
            }); // End sendMessage callback for GET_RECORDING_STATE
        } catch (e) { // Catch synchronous errors or errors from the sendMessage itself
            showGeneralError(`Error: ${e.message}`);
            // Attempt to reset UI based on potentially fetched state
             chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATE' }, (stateResponse) => {
                 if (stateResponse) updateRecordingUI(stateResponse.isRecording, stateResponse.hasRecordedData);
                 else updateRecordingUI(false, false); // Fallback
             });
        }
    });

    jiraProjectSelect.addEventListener('change', (event) => {
        const selectedProjectKey = event.target.value;
        fetchJiraIssueTypes(selectedProjectKey);
        checkSubmitButtonState();
    });

    jiraIssueTypeSelect.addEventListener('change', checkSubmitButtonState);
    bugSummaryInput.addEventListener('input', checkSubmitButtonState);


    generateAIButton.addEventListener('click', () => {
        const userSummary = bugSummaryInput.value.trim();
        const userDescription = bugDescriptionInput.value.trim();

        if (!userSummary && !userDescription) {
            showGeneralError('Please provide a summary or description before generating AI suggestions.');
            return;
        }
        updateButtonState(generateAIButton, 'Generating...', true);
        submissionStatus.textContent = 'Requesting AI suggestions...';
        aiSuggestionsDiv.style.display = 'none';

        chrome.runtime.sendMessage({
            type: 'GENERATE_AI_SUGGESTIONS',
            payload: { summary: userSummary, description: userDescription }
        }, (response) => {
            updateButtonState(generateAIButton, 'Generate AI Suggestions', false);
            submissionStatus.textContent = '';
            if (chrome.runtime.lastError || !response || !response.success) {
                const errorMsg = (response && response.error) || chrome.runtime.lastError?.message || 'AI suggestions failed.';
                showGeneralError(errorMsg);
                aiSummaryInput.value = ''; aiStepsInput.value = '';
            } else {
                aiSummaryInput.value = response.aiSummary || '';
                aiStepsInput.value = response.aiSteps || '';
                aiSuggestionsDiv.style.display = 'block';
                submissionStatus.textContent = 'AI suggestions generated. Review and edit.';
            }
        });
    });

    bugSummaryInput.addEventListener('input', () => {
        generateAIButton.disabled = !(bugSummaryInput.value.trim() || bugDescriptionInput.value.trim());
        checkSubmitButtonState();
    });
    bugDescriptionInput.addEventListener('input', () => {
        generateAIButton.disabled = !(bugSummaryInput.value.trim() || bugDescriptionInput.value.trim());
    });


    submitJiraButton.addEventListener('click', () => {
        const projectKey = jiraProjectSelect.value;
        const issueTypeName = jiraIssueTypeSelect.value;
        const summaryToSubmit = aiSummaryInput.value.trim() ? aiSummaryInput.value.trim() : bugSummaryInput.value.trim();
        const descriptionToSubmit = aiStepsInput.value.trim() ? aiStepsInput.value.trim() : bugDescriptionInput.value.trim();

        if (!projectKey || !issueTypeName || !summaryToSubmit) {
            showGeneralError('Project, Issue Type, and Summary are required for Jira submission.');
            return;
        }

        updateButtonState(submitJiraButton, 'Submitting...', true);
        submissionStatus.textContent = 'Submitting to Jira...';

        chrome.runtime.sendMessage({
            type: 'SUBMIT_TO_JIRA',
            payload: {
                projectKey,
                issueTypeName,
                summary: summaryToSubmit,
                description: descriptionToSubmit
            }
        }, (response) => {
            updateButtonState(submitJiraButton, 'Submit to Jira', false); // Re-enable after attempt
            if (chrome.runtime.lastError || !response || !response.success) {
                const errorMsg = (response && response.error) || chrome.runtime.lastError?.message || 'Jira submission failed.';
                showGeneralError(`Jira Submission Error: ${errorMsg}`);
                submissionStatus.textContent = `Error: ${errorMsg}`;
                submissionStatus.style.color = 'red';
            } else {
                submissionStatus.textContent = `Successfully created Jira issue: ${response.issueKey}`;
                submissionStatus.style.color = 'green';
                setTimeout(() => {
                    // Reset form for next submission
                    jiraProjectSelect.value = '';
                    jiraIssueTypeSelect.innerHTML = '<option value="">Select a project first...</option>';
                    jiraIssueTypeSelect.disabled = true;
                    bugSummaryInput.value = '';
                    bugDescriptionInput.value = '';
                    aiSummaryInput.value = '';
                    aiStepsInput.value = '';
                    aiSuggestionsDiv.style.display = 'none';
                    submissionStatus.textContent = '';
                    // Reset UI state
                    initializePopup();
                }, 4000);
            }
            checkSubmitButtonState(); // Re-check after submission attempt
        });
    });

    optionsLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
        else window.open(chrome.runtime.getURL('options/options.html'));
    });

    // --- Initialization ---
    function initializePopup() {
        updateButtonState(toggleRecordButton, 'Loading...', true);
        chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATE' }, (response) => {
            if (chrome.runtime.lastError) {
                showGeneralError('Error connecting to service worker. Try reloading extension.', true);
                updateRecordingUI(false, false, "Connection error");
                toggleRecordButton.disabled = true; return;
            }
            if (response) {
                console.log("[Popup] Initial state received:", response); // Log initial state
                updateRecordingUI(response.isRecording, response.hasRecordedData);
                // No need to call fetchJiraProjects here, updateRecordingUI handles it
            } else {
                updateRecordingUI(false, false, "Could not get state");
            }
            toggleRecordButton.disabled = false;
            checkSubmitButtonState();
        });
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'RECORDING_STATE_UPDATED') {
             console.log("[Popup] Received RECORDING_STATE_UPDATED:", message.payload); // Log state update
            updateRecordingUI(message.payload.isRecording, message.payload.hasRecordedData, message.payload.error);
            // No need to call fetchJiraProjects here, updateRecordingUI handles it
        }
    });

    initializePopup();
});
