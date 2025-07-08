# Advanced Bug Reporter Pro 2.0

A professional Chrome extension for comprehensive bug reporting with screen/DOM recording, console/network logging, AI-powered summaries, and direct Jira integration.

## 🚀 New Features in Version 2.0

### Enhanced Recording Options
- **Multiple Capture Modes**: Record current tab, entire window, or full screen
- **DOM Recording with rrweb**: Capture and replay exact user interactions and DOM changes
- **Video Recording**: Traditional screen recording for visual reference
- **Selective Recording**: Toggle console logs, network activity, video, and DOM recording independently

### Professional Review Interface
- **Dedicated Review Page**: Opens recordings in a new tab with full playback controls
- **Dual Playback Modes**: Switch between video playback and DOM replay
- **Advanced Log Viewing**: Search, filter, and export console logs and network requests
- **Timeline Visualization**: See all events in chronological order
- **AI-Powered Summaries**: Generate bug descriptions and reproduction steps automatically

### Improved UI/UX
- **Modern Design**: Clean, professional interface with smooth animations
- **Recording History**: Quick access to recent recordings from the popup
- **Real-time Status**: Live recording timer and visual indicators
- **Dark Mode Support**: For console log viewing

## 📋 Prerequisites

1. **Chrome Browser** (version 88 or higher)
2. **Jira Cloud Account** with API access
3. **Google AI Studio Account** for Gemini API
4. **Node.js** (for downloading dependencies)

## 🛠️ Installation

### Step 1: Download Required Libraries

Create a `libs` folder in the extension directory and download these files:

```bash
# Create libs directory
mkdir libs

# Download rrweb
curl -o libs/rrweb.min.js https://unpkg.com/rrweb@latest/dist/rrweb.min.js

# Download rrweb-player
curl -o libs/rrweb-player.min.js https://unpkg.com/rrweb-player@latest/dist/index.js
curl -o libs/rrweb-player.min.css https://unpkg.com/rrweb-player@latest/dist/style.css

# Download JSZip (get the ESM version)
curl -o libs/jszip.esm.js https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js
```

### Step 2: Create Icons

Create an `icons` folder and add these icon files:
- `icon16.png` - 16x16px icon
- `icon48.png` - 48x48px icon  
- `icon128.png` - 128x128px icon

### Step 3: Load Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the extension directory

### Step 4: Configure Settings

1. Click the extension icon and then the settings gear
2. Enter your configuration:
   - **Jira Base URL**: `https://your-domain.atlassian.net`
   - **Jira Email**: Your Jira account email
   - **Jira API Token**: [Generate here](https://id.atlassian.com/manage-profile/security/api-tokens)
   - **Gemini API Key**: [Get from Google AI Studio](https://makersuite.google.com/app/apikey)

## 📖 Usage Guide

### Starting a Recording

1. **Click the extension icon** in your browser toolbar
2. **Select recording options**:
   - Capture Mode: Tab, Window, or Screen
   - Enable/disable specific features (Video, DOM, Console, Network)
3. **Click "Start Recording"**
4. Perform the actions that demonstrate the bug
5. **Click "Stop Recording"** when done

### Reviewing Recordings

After stopping, the review page automatically opens with:

#### Player Tab
- **Video Player**: Watch the screen recording
- **DOM Player**: Replay exact user interactions with rrweb
- Full playback controls (play, pause, speed, timeline)

#### Console Logs Tab
- View all captured console output
- Filter by log level (error, warn, info, log)
- Search through logs
- Export as text file

#### Network Tab
- See all HTTP requests made during recording
- Filter by request type
- View status codes, response times, and sizes
- Export as HAR file

#### Summary Tab
- Write bug title and description
- Add steps to reproduce
- Generate AI suggestions based on captured data
- Review and edit AI-generated content

#### Timeline Tab
- Visual representation of all events
- Correlate user actions with logs and network requests

### Creating Jira Tickets

1. Click **"Create Jira Ticket"** in the review page
2. Select your project and issue type
3. Choose which attachments to include
4. Click **"Create Ticket"**

The extension will create a Jira issue with:
- Your bug summary and description
- A ZIP file containing all selected recordings and logs
- Formatted description with recording metadata

## 🔧 Technical Details

### Architecture Improvements

- **Service Worker**: Manages recording state and coordinates all components
- **Content Scripts**: 
  - `console-interceptor.js`: Captures console output
  - `rrweb-recorder.js`: Records DOM changes and interactions
- **Offscreen Document**: Handles MediaRecorder API for video capture
- **Review Interface**: Full-featured SPA for reviewing recordings

### Data Storage

- Recordings are stored in Chrome's local storage
- Large blobs (video, DOM events) are stored separately
- Automatic cleanup keeps only the 10 most recent recordings

### Security & Privacy

- All data is stored locally
- Sensitive inputs can be masked in DOM recordings
- Network requests are filtered to essential information
- No telemetry or external data sharing

## 🎯 Best Practices

1. **Keep recordings focused** - Record only what's needed to demonstrate the bug
2. **Use appropriate capture mode** - Tab recording is usually sufficient
3. **Add context** - Use the summary fields to provide additional information
4. **Review before submitting** - Check that sensitive information is not included
5. **Use AI suggestions as a starting point** - Always review and edit AI-generated content

## 🐛 Troubleshooting

### Recording won't start
- Check that you're not on a Chrome system page (chrome://)
- Ensure all permissions are granted
- Try reloading the extension

### No video in review
- Some sites may block screen recording
- Try using DOM recording instead
- Check browser console for errors

### Jira submission fails
- Verify your API credentials
- Check that the project and issue type exist
- Ensure you have permission to create issues

## 📄 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📞 Support

- **Issues**: Report bugs on GitHub Issues
- **Email**: ahmadnabeel@outlook.com

## 🚀 Roadmap

- [ ] Cloud storage integration
- [ ] Team collaboration features
- [ ] Additional export formats
- [ ] Browser automation for reproduction
- [ ] Integration with other issue trackers
- [ ] Performance profiling during recording

---

Made with ❤️ for QA engineers and developers