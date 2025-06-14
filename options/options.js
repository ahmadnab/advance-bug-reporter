// options/options.js
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const optionsForm = document.getElementById('optionsForm');
    const jiraBaseUrlInput = document.getElementById('jiraBaseUrl');
    const jiraEmailInput = document.getElementById('jiraEmail');
    const jiraApiTokenInput = document.getElementById('jiraApiToken');
    const jiraProjectKeyInput = document.getElementById('jiraProjectKey'); // Added
    const aiApiKeyInput = document.getElementById('aiApiKey');
    const saveButton = document.getElementById('saveButton');
    const optionsStatus = document.getElementById('optionsStatus');

    // Function to display status messages
    function showStatus(message, isError = false) {
        optionsStatus.textContent = message;
        optionsStatus.className = 'status-message'; // Reset classes
        if (isError) {
            optionsStatus.classList.add('error');
        } else {
            optionsStatus.classList.add('success');
        }
        // Clear message after a few seconds, only for success
        if (!isError) {
            setTimeout(() => {
                optionsStatus.textContent = '';
                optionsStatus.className = 'status-message';
            }, 3000);
        }
    }

    // Load saved settings when the page opens
    function loadSettings() {
        // Keys to retrieve from storage
        const keys = ['jiraBaseUrl', 'jiraEmail', 'jiraApiToken', 'jiraProjectKey', 'aiApiKey'];
        chrome.storage.local.get(keys, (items) => {
            if (chrome.runtime.lastError) {
                console.error("Error loading settings:", chrome.runtime.lastError.message);
                showStatus('Error loading settings. Check console.', true);
                return;
            }
            jiraBaseUrlInput.value = items.jiraBaseUrl || '';
            jiraEmailInput.value = items.jiraEmail || '';
            jiraApiTokenInput.value = items.jiraApiToken || '';
            jiraProjectKeyInput.value = items.jiraProjectKey || ''; // Load project key
            aiApiKeyInput.value = items.aiApiKey || '';
            console.log('Settings loaded.');
        });
    }

    // Save settings when the form is submitted
    optionsForm.addEventListener('submit', (event) => {
        event.preventDefault(); // Prevent actual form submission

        const jiraBaseUrl = jiraBaseUrlInput.value.trim();
        const jiraEmail = jiraEmailInput.value.trim();
        const jiraApiToken = jiraApiTokenInput.value.trim(); // API tokens usually don't have leading/trailing spaces
        const jiraProjectKey = jiraProjectKeyInput.value.trim().toUpperCase(); // Project keys are often uppercase
        const aiApiKey = aiApiKeyInput.value.trim();

        // Basic validation
        if (!jiraBaseUrl || !jiraEmail || !jiraApiToken || !jiraProjectKey || !aiApiKey) {
            showStatus('All fields are required. Please fill them all.', true);
            return;
        }

        try {
            // Validate Jira Base URL format
            const url = new URL(jiraBaseUrl);
            if (url.protocol !== "http:" && url.protocol !== "https:") {
                throw new Error("Jira Base URL must start with http:// or https://");
            }
        } catch (e) {
            showStatus('Invalid Jira Base URL format. Please include http:// or https://.', true);
            return;
        }

        // Validate Jira Project Key (simple validation: alphanumeric)
        if (!/^[A-Z0-9_]+$/.test(jiraProjectKey)) {
            showStatus('Invalid Jira Project Key format. Use uppercase letters, numbers, and underscores.', true);
            return;
        }


        saveButton.disabled = true;
        saveButton.textContent = 'Saving...';

        chrome.storage.local.set({
            jiraBaseUrl: jiraBaseUrl,
            jiraEmail: jiraEmail,
            jiraApiToken: jiraApiToken,
            jiraProjectKey: jiraProjectKey, // Save project key
            aiApiKey: aiApiKey
        }, () => {
            saveButton.disabled = false;
            saveButton.textContent = 'Save Settings';
            if (chrome.runtime.lastError) {
                console.error("Error saving settings:", chrome.runtime.lastError.message);
                showStatus(`Error saving settings: ${chrome.runtime.lastError.message}`, true);
            } else {
                console.log('Settings saved successfully.');
                showStatus('Settings saved successfully!', false);
            }
        });
    });

    // Initial load of settings
    loadSettings();
});
