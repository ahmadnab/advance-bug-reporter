// utils/geminiApi.js
// This module handles communication with the Google Gemini API
// for generating AI-assisted bug report content.

// Safely determine the global object
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

// Create global namespace
if (!globalObj.BugReporter) globalObj.BugReporter = {};
if (!globalObj.BugReporter.utils) globalObj.BugReporter.utils = {};

globalObj.BugReporter.utils.geminiApi = (function() {
    'use strict';

    // The specific model can be adjusted based on needs
    const GEMINI_API_ENDPOINT_TEMPLATE = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=";

    /**
     * Sends a prompt to the Gemini API and returns the generated text.
     * @param {string} apiKey - The user's Gemini API key.
     * @param {string} promptText - The fully constructed prompt for the AI.
     * @returns {Promise<{summary: string, steps: string}>} A promise that resolves with an object
     * containing the AI-generated summary and steps, or rejects on error.
     */
    async function generateAiSuggestions(apiKey, promptText) {
        if (!apiKey) {
            console.error('Gemini API key is missing.');
            throw new Error('Gemini API key not provided.');
        }
        if (!promptText) {
            console.error('Prompt text is missing for Gemini API call.');
            throw new Error('Prompt text not provided for AI generation.');
        }

        const apiUrl = `${GEMINI_API_ENDPOINT_TEMPLATE}${apiKey}`;

        const requestBody = {
            contents: [{
                parts: [{
                    text: promptText
                }]
            }],
            generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 1024,
            }
        };

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorBody = await response.json().catch(() => response.text());
                console.error('Gemini API request failed:', response.status, errorBody);
                throw new Error(`Gemini API request failed: ${response.status} - ${JSON.stringify(errorBody)}`);
            }

            const responseData = await response.json();

            // Extract the generated text from the response
            if (responseData.candidates && responseData.candidates.length > 0 &&
                responseData.candidates[0].content && responseData.candidates[0].content.parts &&
                responseData.candidates[0].content.parts.length > 0) {

                const generatedText = responseData.candidates[0].content.parts[0].text;
                console.log('Raw AI Generated Text:', generatedText);

                // Parse the generated text to separate summary and steps
                let aiSummary = "Could not parse AI summary.";
                let aiSteps = "Could not parse AI steps.";

                // Attempt to parse based on expected headers or patterns
                const summaryMatch = generatedText.match(/1\.\s*A concise bug summary(?:.*?:)?\s*([\s\S]*?)(?=\n\s*2\.\s*Numbered steps|\n\n|$)/i);
                if (summaryMatch && summaryMatch[1]) {
                    aiSummary = summaryMatch[1].trim();
                } else {
                    const firstParagraph = generatedText.split(/\n\n/)[0];
                    if (firstParagraph && !firstParagraph.toLowerCase().includes("steps to reproduce")) {
                        aiSummary = firstParagraph.trim();
                    }
                }

                const stepsMatch = generatedText.match(/2\.\s*Numbered steps to reproduce the bug(?:.*?:)?\s*([\s\S]*)/i);
                if (stepsMatch && stepsMatch[1]) {
                    aiSteps = stepsMatch[1].trim();
                } else {
                    const potentialSteps = generatedText.substring(aiSummary.length).trim();
                    if (potentialSteps.toLowerCase().startsWith("steps") || potentialSteps.match(/^\d\./)) {
                        aiSteps = potentialSteps;
                    } else if (generatedText.includes("\n1.") || generatedText.includes("\n-")) {
                        const listStartIndex = Math.min(
                            generatedText.indexOf("\n1.") > -1 ? generatedText.indexOf("\n1.") : Infinity,
                            generatedText.indexOf("\n- ") > -1 ? generatedText.indexOf("\n- ") : Infinity
                        );
                        if (listStartIndex !== Infinity) {
                            aiSteps = generatedText.substring(listStartIndex).trim();
                        }
                    }
                }

                if (aiSummary.includes("Numbered steps to reproduce")) {
                    aiSummary = aiSummary.split("Numbered steps to reproduce")[0].trim();
                }

                console.log('Parsed AI Summary:', aiSummary);
                console.log('Parsed AI Steps:', aiSteps);

                return { summary: aiSummary, steps: aiSteps };

            } else {
                console.error('Invalid response structure from Gemini API:', responseData);
                throw new Error('Failed to parse AI response: No valid candidates found.');
            }

        } catch (error) {
            console.error('Error calling Gemini API:', error);
            throw error;
        }
    }

    console.log('geminiApi.js loaded');

    // Public API
    return {
        generateAiSuggestions
    };
})();