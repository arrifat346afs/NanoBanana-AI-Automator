# NanoBanana AI Automator

A Chrome Extension designed to automate the process of generating images from a list of prompts. This tool works by sequentially inputting prompts into a web interface and triggering the generation process, allowing for hands-off batch processing.

## Features

- **Batch Automation**: Load a list of prompts from a `.txt` file and process them one by one.
- **Configurable Delay**: Set a custom delay between prompt submissions to respect rate limits or generation times.
- **Smart Input Simulation**: Robust text injection that handles complex React forms and simulates human typing to ensure prompts are correctly recognized.
- **Real-time Progress**: Track the status of your automation with a progress counter and detailed logs in the side panel.
- **Background Friendly**: Operates from a side panel, allowing you to monitor progress without obstructing the main view.

## Installation

1.  Clone or download this repository to your local machine.
2.  Open Google Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** in the top right corner.
4.  Click on **Load unpacked**.
5.  Select the directory where you saved this project (the folder containing `manifest.json`).
6.  The "NanoBanana AI Automator" extension should now appear in your list.

## Usage

1.  **Open the Side Panel**: Click on the extension icon in your browser toolbar and open the side panel.
2.  **Navigate to Target Site**: Go to the image generation website you wish to automate.
3.  **Prepare Prompts**: Create a `.txt` file with your prompts, one per line.
4.  **Upload Prompts**: In the side panel, click "Upload Prompts" and select your text file.
5.  **Set Delay**: Adjust the delay (in seconds) to allow enough time for each image to generate before the next one starts.
6.  **Start Automation**: Click **Start Automation**. The extension will begin entering prompts and clicking the "Create" button.

> **Note**: Ensure the web page is active and the text area is visible. The extension attempts to find the input field automatically.

## Development

- `manifest.json`: Extension configuration.
- `sidepanel.html` & `sidepanel.js`: The user interface and logic for the control panel.
- `content.js`: The script that runs on the web page to interact with the DOM (inject text, click buttons).
- `styles.css`: Styling for the side panel.

## Disclaimer

This tool is for educational and personal automation purposes. Please use responsibly and adhere to the terms of service of the websites you interact with.
