# Security Policy

## Supported Versions

The following versions of Aegis Browser are currently being supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of Aegis Browser seriously. If you discover a security vulnerability, please bring it to our attention.

### How to Report

Please **DO NOT** report security vulnerabilities through public GitHub issues.

Instead, please report them by sending an email to the maintainer or by opening a private security advisory if enabled on the repository.

1.  Describe the vulnerability.
2.  Provide steps to reproduce the issue.
3.  Include any relevant logs or screenshots.

We will acknowledge your report within 48 hours and will prioritize a fix.

## Security Features

Aegis Browser is built with multiple layers of security:

-   **Sandbox**: The renderer processes run within Electron's sandbox environment.
-   **Context Isolation**: Enabled (`contextIsolation: true`) to bridge the gap between specific preload scripts and the frontend.
-   **Node Integration Disabled**: `nodeIntegration: false` prevents malicious code from accessing Node.js primitives.
-   **Ad & Tracker Blocker**: Blocks known tracking domains and aggressive ad scripts.
-   **HTTPS**: Indicators for secure/insecure connections.

## User Best Practices

-   Always keep the application updated to the latest version.
-   Be careful when manually whitelisting domains.
-   Use Incognito mode for sessions where you want to minimize local traces.
