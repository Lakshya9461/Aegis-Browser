# Aegis Browser

🛡️ **Aegis Browser** is a privacy-focused, feature-rich web browser built with Electron and Chromium. It offers advanced ad blocking, anti-fingerprinting, incognito browsing, a customizable dashboard, and a modern user interface. Designed for users who value privacy, performance, and productivity.

---

## Features

- 🚫 **Advanced Ad Blocking**: 500+ domain filters, real-time ad and tracker blocking
- 🔒 **Anti-Fingerprinting**: Multiple levels of fingerprinting protection
- 🕵️ **Incognito Mode**: No persistent data, isolated sessions
- 📥 **Download Manager**: Track, pause, and manage downloads
- 🎬 **Video Grabber**: Download media from supported sites
- 🖼️ **Mini Player**: Picture-in-picture for videos
- ⚡ **Tab Suspension**: Auto-suspend inactive tabs to save memory
- 🧩 **Customizable Dashboard**: Widgets for productivity, quick links, notes, and more
- 🔍 **Autocomplete & Suggestions**: Smart address bar with search, history, and bookmark suggestions
- 🎨 **Themes & Appearance**: Dark/light/system themes, accent color, compact mode
- 🛠️ **Settings Page**: Full control over privacy, appearance, downloads, and more
- ⌨️ **Keyboard Shortcuts**: Fast tab and window management
- 🧪 **Built-in Testing**: Performance and reliability test scripts

---

## Installation

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+ recommended)
- [pnpm](https://pnpm.io/) or [npm](https://www.npmjs.com/)

### Steps
1. **Clone the repository:**
   ```sh
   git clone https://github.com/Lakshya9461/Aegis-Browser.git
   cd Aegis-Browser
   ```
2. **Install dependencies:**
   ```sh
   pnpm install
   # or
   npm install
   ```
3. **Start the browser:**
   ```sh
   pnpm start
   # or
   npm start
   ```

   **On Linux (if you encounter sandbox errors):**
   ```sh
   npm run start:linux
   ```

---

## Usage
- **Main Browser:** Launches a Chromium-based window with tabbed browsing, adblock, and privacy features.
- **Dashboard:** Customizable homepage with widgets and quick access to productivity tools.
- **Settings:** Access via the menu or `Ctrl+,` to configure privacy, appearance, downloads, and more.
- **Incognito:** Open from the menu for private browsing sessions.
- **Mini Player:** Use the video grabber or right-click on videos to pop out a mini player.

---

## Project Structure

```
├── src/
│   ├── main.js                # Electron main process
│   ├── preload.js             # Secure context bridge
│   ├── adblock.js             # Ad blocking engine
│   ├── renderer/              # UI and renderer process
│   │   ├── app.js             # Main browser UI logic
│   │   ├── settings-app.js    # Settings page logic
│   │   ├── incognito-app.js   # Incognito window logic
│   │   ├── dashboard/         # Dashboard widgets and config
│   │   └── ...
│   └── ...
├── package.json
├── webpack.config.js
└── ...
```

---

## Contributing

Contributions are welcome! To contribute:
1. Fork the repository
2. Create a new branch (`git checkout -b feature/your-feature`)
3. Commit your changes
4. Push to your fork and open a Pull Request

Please follow the code style and add tests where appropriate.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## Credits
- Built with [Electron](https://electronjs.org/), [Chromium](https://www.chromium.org/), and open-source libraries.
- Icon: [Shield Emoji](https://emojipedia.org/shield)

---

## Screenshots

> _Add screenshots of the browser UI, dashboard, settings, and features here._

---

## Contact

For questions, suggestions, or support, open an issue or contact the maintainer via GitHub.
