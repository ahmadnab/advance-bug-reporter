# Advanced Bug Reporter

**Advanced Bug Reporter** is a Chrome extension that streamlines bug reporting by recording screen activity, capturing console logs and network requests, and enabling direct submission to Jira. It also leverages Google Gemini AI to generate concise bug summaries and reproduction steps.

## Features

- **Screen Recording**: Capture browser tab activity as a video.
- **Console & Network Logging**: Automatically logs console output and network requests during a session.
- **Jira Integration**: Submit bug reports directly to your Jira Cloud projects, including attachments.
- **AI Assistance**: Uses Gemini AI to suggest bug summaries and steps to reproduce.
- **Customizable Settings**: Configure Jira and Gemini API credentials via the options page.
- **Modern UI**: Clean, user-friendly popup and options interface.

## Installation

1. **Clone or Download** this repository.
2. Open `chrome://extensions` in your browser.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the project directory.

## Usage

1. Click the extension icon to open the popup.
2. Click **Start Recording** to begin capturing your session.
3. Reproduce the bug in the browser tab.
4. Click **Stop Recording**.
5. Fill in the bug summary and description.
6. (Optional) Click **Generate AI Suggestions** for automated summary and steps.
7. Select the Jira project and issue type.
8. Click **Submit to Jira**.

## Configuration

Go to the **Settings** (Options) page to set up:

- **Jira Base URL** (e.g., `https://your-domain.atlassian.net`)
- **Jira Email** and **API Token**
- **Default Jira Project Key**
- **Gemini API Key** (from [Google AI Studio](https://ai.google.dev/gemini-api/docs/api-key))

## Permissions

- `tabCapture`, `scripting`, `debugger`, `offscreen`, `storage`, `alarms`
- Access to Jira Cloud and Gemini API endpoints

## Development

- Main logic: `service-worker.js`
- Popup UI: `popup/popup.html`, `popup/popup.js`, `popup/popup.css`
- Options UI: `options/options.html`, `options/options.js`, `options/options.css`
- Content scripts: `content_scripts/console-interceptor.js`
- Utilities: `utils/`
- Offscreen recording: `offscreen/`

## Building & Packaging

No build step is required. All dependencies are included locally.

## License

MIT License
