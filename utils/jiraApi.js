// utils/jiraApi.js
// This module handles communication with the Jira Cloud REST API.

/**
 * Helper function to make authenticated GET requests to Jira API.
 * @param {string} apiUrl - The full API URL to fetch.
 * @param {object} credentials - Object containing { email, apiToken }.
 * @returns {Promise<object>} A promise that resolves with the JSON response.
 */
async function fetchJiraData(apiUrl, credentials) {
    if (!credentials || !credentials.email || !credentials.apiToken) {
        throw new Error('Jira credentials for fetching data are missing.');
    }

    const headers = new Headers();
    headers.append('Authorization', `Basic ${btoa(`${credentials.email}:${credentials.apiToken}`)}`);
    headers.append('Accept', 'application/json');

    let response;
    try {
        response = await fetch(apiUrl, {
            method: 'GET',
            headers: headers
        });

        if (response.ok) {
            return await response.json();
        } else {
            let errorBodyText = '';
            try {
                const clonedResponse = response.clone();
                try {
                    const errorData = await clonedResponse.json();
                    console.error('[jiraApi] Jira API GET request error response (JSON):', errorData);
                    errorBodyText = JSON.stringify(errorData.errors || errorData.errorMessages || errorData);
                } catch (jsonError) {
                    console.warn('[jiraApi] Failed to parse error response as JSON, trying text.', jsonError);
                    errorBodyText = await response.text();
                    console.error('[jiraApi] Jira API GET request error response (Text):', errorBodyText);
                }
            } catch (bodyReadError) {
                 console.error('[jiraApi] Failed to read error response body.', bodyReadError);
                 errorBodyText = '(Could not read error response body)';
            }
            const errorDetails = `HTTP status ${response.status}: ${response.statusText} - ${errorBodyText}`;
            throw new Error(`Failed to fetch Jira data from ${apiUrl}: ${errorDetails}`);
        }
    } catch (networkOrProcessingError) {
        console.error(`[jiraApi] Network or processing error during fetch from ${apiUrl}:`, networkOrProcessingError);
        if (networkOrProcessingError instanceof Error) { throw networkOrProcessingError; }
        else { throw new Error(`Network or processing error: ${networkOrProcessingError}`); }
    }
}

/**
 * Fetches metadata required for creating an issue (fields available on the create screen).
 * @param {object} credentials - Object containing { baseUrl, email, apiToken }.
 * @param {string} projectKey - The key of the project.
 * @param {string} issueTypeName - The name of the issue type.
 * @returns {Promise<object>} A promise that resolves with the createmeta response object.
 * This object contains details about projects and their issue types, including available fields.
 */
export async function getCreateMetadata(credentials, projectKey, issueTypeName) {
    if (!credentials || !credentials.baseUrl) {
        throw new Error('Jira base URL is missing for fetching createmeta.');
    }
     if (!projectKey || !issueTypeName) {
        throw new Error('Project Key and Issue Type Name are required for fetching createmeta.');
    }

    // Construct the API URL with query parameters
    // expand=projects.issuetypes.fields helps get field details directly
    const apiUrl = new URL(`${credentials.baseUrl.replace(/\/$/, '')}/rest/api/3/issue/createmeta`);
    apiUrl.searchParams.append('projectKeys', projectKey);
    apiUrl.searchParams.append('issuetypeNames', issueTypeName);
    apiUrl.searchParams.append('expand', 'projects.issuetypes.fields');

    console.log(`[jiraApi] Fetching createmeta for Project: ${projectKey}, IssueType: ${issueTypeName} from:`, apiUrl.toString());

    try {
        const metadata = await fetchJiraData(apiUrl.toString(), credentials);
        console.log(`[jiraApi] Fetched createmeta response:`, metadata);

        // Basic validation of the response structure
        if (!metadata || !Array.isArray(metadata.projects) || metadata.projects.length === 0) {
            console.warn("[jiraApi] Createmeta response does not contain expected project data.", metadata);
            throw new Error(`Could not find createmeta for project ${projectKey}. Check project key or permissions.`);
        }
        const projectMeta = metadata.projects[0]; // Assuming only one project was requested
        if (!projectMeta || !Array.isArray(projectMeta.issuetypes) || projectMeta.issuetypes.length === 0) {
             console.warn("[jiraApi] Createmeta response does not contain expected issue type data for the project.", projectMeta);
             throw new Error(`Could not find createmeta for issue type ${issueTypeName} in project ${projectKey}.`);
        }
        const issueTypeMeta = projectMeta.issuetypes[0]; // Assuming only one issue type was requested
         if (!issueTypeMeta || !issueTypeMeta.fields) {
             console.warn("[jiraApi] Createmeta response does not contain expected field data for the issue type.", issueTypeMeta);
             throw new Error(`Could not find field metadata for issue type ${issueTypeName} in project ${projectKey}.`);
         }

        // Return the specific issue type metadata which contains the fields object
        return issueTypeMeta;

    } catch (error) {
        console.error(`[jiraApi] Error in getCreateMetadata (Project: ${projectKey}, IssueType: ${issueTypeName}):`, error);
        throw error; // Re-throw original error
    }
}

/**
 * Fetches a list of all issue types accessible by the user.
 * @param {object} credentials - Object containing { baseUrl, email, apiToken }.
 * @returns {Promise<Array<object>>} A promise that resolves with an array of all issue type objects.
 */
export async function getAllJiraIssueTypes(credentials) {
    if (!credentials || !credentials.baseUrl) {
        throw new Error('Jira base URL is missing for fetching all issue types.');
    }
    const apiUrl = `${credentials.baseUrl.replace(/\/$/, '')}/rest/api/3/issuetype`;
    console.log("[jiraApi] Fetching ALL issue types from:", apiUrl);
    try {
        const allIssueTypes = await fetchJiraData(apiUrl, credentials);
        const validIssueTypes = Array.isArray(allIssueTypes) ? allIssueTypes : [];
        console.log(`[jiraApi] Fetched total issue types count:`, validIssueTypes.length);
        return validIssueTypes;
    } catch (error) {
        console.error('[jiraApi] Error in getAllJiraIssueTypes:', error);
        throw error;
    }
}

/**
 * Fetches a list of projects accessible by the user.
 * @param {object} credentials - Object containing { baseUrl, email, apiToken }.
 * @returns {Promise<Array<object>>} A promise that resolves with an array of project objects.
 */
export async function getJiraProjects(credentials) {
    if (!credentials || !credentials.baseUrl) {
        throw new Error('Jira base URL is missing for fetching projects.');
    }
    const apiUrl = `${credentials.baseUrl.replace(/\/$/, '')}/rest/api/3/project/search?maxResults=200`;
    console.log("[jiraApi] Fetching Jira projects from:", apiUrl);
    try {
        const result = await fetchJiraData(apiUrl, credentials);
        const projects = Array.isArray(result?.values) ? result.values : [];
        console.log("[jiraApi] Fetched projects count:", projects.length);
        return projects;
    } catch (error) {
        console.error('[jiraApi] Error in getJiraProjects:', error);
        throw error;
    }
}

/**
 * Fetches issue types applicable to a specific project by fetching all types and filtering.
 * @param {object} credentials - Object containing { baseUrl, email, apiToken }.
 * @param {string} projectIdOrKey - The ID or key of the project to filter by.
 * @returns {Promise<Array<object>>} A promise that resolves with an array of filtered issue type objects for the project.
 */
export async function getJiraIssueTypesForProject(credentials, projectIdOrKey) {
    if (!projectIdOrKey) {
        throw new Error('Project ID or Key is missing for filtering issue types.');
    }
    console.log(`[jiraApi] Fetching all issue types and filtering for project ${projectIdOrKey}...`);
    try {
        const allIssueTypes = await getAllJiraIssueTypes(credentials);
        const filteredIssueTypes = allIssueTypes.filter(issueType => {
            if (!issueType.scope) return true;
            if (issueType.scope.type === 'PROJECT' && String(issueType.scope.project?.key) === String(projectIdOrKey)) return true;
            if (issueType.scope.type === 'PROJECT' && String(issueType.scope.project?.id) === String(projectIdOrKey)) return true;
            return false;
        });
        console.log(`[jiraApi] Filtered issue types for project ${projectIdOrKey}:`, filteredIssueTypes);
        if (filteredIssueTypes.length === 0) {
             console.warn(`[jiraApi] No applicable issue types found for project ${projectIdOrKey} after filtering.`);
        }
        return filteredIssueTypes;
    } catch (error) {
        console.error(`[jiraApi] Error fetching/filtering issue types for project ${projectIdOrKey}:`, error.message);
        throw error;
    }
}

/**
 * Creates a new issue in Jira, respecting available fields from metadata if provided.
 * @param {object} credentials - Object containing { baseUrl, email, apiToken, projectKey }.
 * @param {object} issueData - Object containing { summary, descriptionAdf, issueTypeName }.
 * @param {object|null} availableFields - Optional: The 'fields' object from the createmeta response for the target issue type.
 * If provided, only fields present in this object will be included in the request.
 * @returns {Promise<object>} A promise that resolves with the created issue data.
 */
export async function createJiraIssue(credentials, issueData, availableFields = null) {
    if (!credentials || !credentials.baseUrl || !credentials.email || !credentials.apiToken || !credentials.projectKey) {
        throw new Error('Jira credentials or project key are missing or incomplete.');
    }
    if (!issueData || !issueData.summary || !issueData.issueTypeName) {
        throw new Error('Issue data (summary, issueTypeName) is missing or incomplete.');
    }

    const { baseUrl, email, apiToken, projectKey } = credentials;
    const { summary, descriptionAdf, issueTypeName } = issueData;

    const apiUrl = `${baseUrl.replace(/\/$/, '')}/rest/api/3/issue`;

    // Start building the fields payload
    const requestBodyFields = {};

    // Always include required fields (assuming these are always on the screen,
    // which is generally true but createmeta would confirm)
    requestBodyFields.project = { key: projectKey };
    requestBodyFields.summary = summary;
    requestBodyFields.issuetype = { name: issueTypeName };

    // Conditionally add description based on metadata and content
    let hasMeaningfulDescription = false;
    if (descriptionAdf && descriptionAdf.content && Array.isArray(descriptionAdf.content)) {
        hasMeaningfulDescription = descriptionAdf.content.some(block =>
            block.content && Array.isArray(block.content) &&
            block.content.some(item => item.text && String(item.text).trim() !== '')
        );
    }

    // Check if description field is available based on createmeta response
    const isDescriptionAvailable = availableFields ? !!availableFields.description : true; // Assume available if no metadata provided

    if (hasMeaningfulDescription && isDescriptionAvailable) {
        requestBodyFields.description = descriptionAdf;
        console.log("[jiraApi] Sending description field (available and has content).");
    } else if (hasMeaningfulDescription && !isDescriptionAvailable) {
         console.warn("[jiraApi] Description field has content but is NOT available on the create screen according to metadata. Not sending description field.");
    } else {
        console.log("[jiraApi] Description empty or not provided. Not sending description field.");
    }

    // --- Add other fields conditionally based on availableFields here if needed ---
    // Example: Check for 'labels' field
    // if (availableFields && availableFields.labels && issueData.labels && issueData.labels.length > 0) {
    //     requestBodyFields.labels = issueData.labels;
    // }

    const requestBody = { fields: requestBodyFields };
    const headers = new Headers();
    headers.append('Authorization', `Basic ${btoa(`${email}:${apiToken}`)}`);
    headers.append('Content-Type', 'application/json');
    headers.append('Accept', 'application/json');

    let response;
    try {
        console.log("[jiraApi] Creating Jira issue with payload:", JSON.stringify(requestBody, null, 2));
        response = await fetch(apiUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        });

        if (response.ok) {
            const createdIssue = await response.json();
            console.log('[jiraApi] Jira issue created successfully:', createdIssue);
            return createdIssue;
        } else {
            let errorDetails = `HTTP status ${response.status}: ${response.statusText}`;
            let errorBodyText = '';
            try {
                const clonedResponse = response.clone();
                try {
                    const errorData = await clonedResponse.json();
                    console.error('[jiraApi] Jira API POST error response (JSON):', errorData);
                    errorBodyText = JSON.stringify(errorData.errors || errorData.errorMessages || errorData);
                } catch (jsonError) {
                    console.warn('[jiraApi] Failed to parse POST error response as JSON, trying text.', jsonError);
                    errorBodyText = await response.text();
                    console.error('[jiraApi] Jira API POST error response (Text):', errorBodyText);
                }
            } catch (bodyReadError) {
                 console.error('[jiraApi] Failed to read POST error response body.', bodyReadError);
                 errorBodyText = '(Could not read error response body)';
            }
            errorDetails += ` - ${errorBodyText}`;
            throw new Error(`Failed to create Jira issue: ${errorDetails}`);
        }
    } catch (error) {
        console.error('[jiraApi] Error in createJiraIssue:', error);
        if (error instanceof Error) { throw error; }
        else { throw new Error(`Network or processing error during issue creation: ${error}`); }
    }
}

/**
 * Adds an attachment to an existing Jira issue.
 * @param {object} credentials - Object containing { baseUrl, email, apiToken }.
 * @param {string} issueIdOrKey - The ID or key of the Jira issue.
 * @param {Blob} attachmentBlob - The Blob object of the file to attach.
 * @param {string} attachmentFilename - The desired filename for the attachment in Jira.
 * @returns {Promise<Array<object>>} A promise that resolves with an array of attachment metadata objects.
 */
export async function addJiraAttachment(credentials, issueIdOrKey, attachmentBlob, attachmentFilename) {
     if (!credentials || !credentials.baseUrl || !credentials.email || !credentials.apiToken) {
        throw new Error('Jira credentials are missing or incomplete for adding attachment.');
    }
    if (!issueIdOrKey || !attachmentBlob || !attachmentFilename) {
        throw new Error('Issue ID/Key, attachment blob, or filename is missing for adding attachment.');
    }

    const { baseUrl, email, apiToken } = credentials;
    const apiUrl = `${baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${issueIdOrKey}/attachments`;

    const formData = new FormData();
    formData.append('file', attachmentBlob, attachmentFilename);

    const headers = new Headers();
    headers.append('Authorization', `Basic ${btoa(`${email}:${apiToken}`)}`);
    headers.append('X-Atlassian-Token', 'no-check');

    let response;
    try {
        response = await fetch(apiUrl, {
            method: 'POST',
            headers: headers,
            body: formData
        });

        if (response.ok) {
            const attachmentResult = await response.json();
            console.log('[jiraApi] Attachment added successfully to Jira issue:', attachmentResult);
            return attachmentResult;
        } else {
            let errorDetails = `HTTP status ${response.status}: ${response.statusText}`;
            let errorBodyText = '';
            try {
                 const clonedResponse = response.clone();
                try {
                    const errorData = await clonedResponse.json();
                    console.error('[jiraApi] Jira attachment API error response (JSON):', errorData);
                    errorBodyText = JSON.stringify(errorData.errors || errorData.errorMessages || errorData);
                } catch (jsonError) {
                    console.warn('[jiraApi] Failed to parse attachment error response as JSON, trying text.', jsonError);
                    errorBodyText = await response.text();
                    console.error('[jiraApi] Jira attachment API error response (Text):', errorBodyText);
                }
            } catch (bodyReadError) {
                 console.error('[jiraApi] Failed to read attachment error response body.', bodyReadError);
                 errorBodyText = '(Could not read error response body)';
            }
            errorDetails += ` - ${errorBodyText}`;
            throw new Error(`Failed to add attachment to Jira issue: ${errorDetails}`);
        }
    } catch (error) {
        console.error('[jiraApi] Error in addJiraAttachment:', error);
         if (error instanceof Error) { throw error; }
         else { throw new Error(`Network or processing error during attachment upload: ${error}`); }
    }
}

// For service worker environment
if (typeof self !== 'undefined' && self.ServiceWorkerGlobalScope) {
    self.jiraApi = {
        getCreateMetadata,
        getAllJiraIssueTypes,
        getJiraProjects,
        getJiraIssueTypesForProject,
        createJiraIssue,
        addJiraAttachment
    };
    console.log('jiraApi.js: Attached to service worker global scope');
}

console.log('jiraApi.js loaded (with getCreateMetadata, alternative issue type fetch, and refined error handling)');