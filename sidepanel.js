let prompts = [];
let currentIndex = 0;
let isRunning = false;
let currentTabId = null;

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const promptFile = document.getElementById('promptFile');
const delayInput = document.getElementById('delayInput');
const promptCount = document.getElementById('promptCount');
const statusText = document.getElementById('statusText');
const progressText = document.getElementById('progressText');
const logArea = document.getElementById('logArea');

// Helper for logging
function log(msg, type = 'info') {
  const div = document.createElement('div');
  div.className = `log-entry log-${type}`;
  div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logArea.appendChild(div);
  logArea.scrollTop = logArea.scrollHeight;
}

// Message Listener for Content Script logs
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'log') {
    log(request.message, request.type || 'info');
  }
});

// File Upload
promptFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const text = event.target.result;
    // Filter empty lines
    prompts = text.split('\n').map(p => p.trim()).filter(p => p.length > 0);
    promptCount.textContent = prompts.length;

    if (prompts.length > 0) {
      startBtn.disabled = false;
      log(`Loaded ${prompts.length} prompts.`);
    } else {
      startBtn.disabled = true;
      log('No prompts found in file.', 'error');
    }
  };
  reader.readAsText(file);
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  // Fallback if user clicked sidepanel and focus shifted, query current window active tab
  if (!tab) {
    const [wTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return wTab;
  }
  return tab;
}

async function processNextPrompt() {
  if (!isRunning || currentIndex >= prompts.length) {
    stopAutomation(currentIndex >= prompts.length);
    return;
  }

  const prompt = prompts[currentIndex];
  updateStatus(`Processing ${currentIndex + 1}/${prompts.length}`);
  log(`Starting prompt: "${prompt.substring(0, 20)}..."`);

  try {
    // Ensure we have a valid tab
    if (!currentTabId) {
      const tab = await getActiveTab();
      if (!tab) throw new Error("No active tab found");
      currentTabId = tab.id;
    }

    // Attempt to send message, with auto-injection fallback
    let response;
    try {
      response = await chrome.tabs.sendMessage(currentTabId, {
        action: 'generate_image',
        prompt: prompt
      });
    } catch (e) {
      // If connection failed, try injecting the script
      if (e.message.includes("Could not establish connection")) {
        log("Injecting content script...", "info");
        await chrome.scripting.executeScript({
          target: { tabId: currentTabId },
          files: ['content.js']
        });
        // Retry sending message after injection
        await new Promise(r => setTimeout(r, 500)); // Wait a bit for script to init
        response = await chrome.tabs.sendMessage(currentTabId, {
          action: 'generate_image',
          prompt: prompt
        });
      } else {
        throw e; // Rethrow other errors
      }
    }

    if (response && response.success) {
      log('Prompt input successful.', 'success');

      const delay = parseInt(delayInput.value, 10) || 15;
      log(`Waiting ${delay}s...`);

      // Wait for delay
      await new Promise(resolve => setTimeout(resolve, delay * 1000));

      currentIndex++;
      processNextPrompt(); // Recursion for next step
    } else {
      throw new Error(response ? response.error : 'Unknown error from content script');
    }
  } catch (err) {
    log(`Error: ${err.message}`, 'error');
    isRunning = false;
    updateUIState();
    log('Automation stopped due to error.', 'error');
  }
}

function startAutomation() {
  if (prompts.length === 0) return;

  isRunning = true;
  currentIndex = 0; // Restart from 0 or we could add "resume" logic later
  updateUIState();

  // Get tab ID once at start
  getActiveTab().then(tab => {
    if (!tab) {
      log("Please open the target website tab.", "error");
      isRunning = false;
      updateUIState();
      return;
    }
    currentTabId = tab.id;
    processNextPrompt();
  });
}

function stopAutomation(completed = false) {
  isRunning = false;
  updateUIState();
  if (completed) {
    statusText.textContent = "Completed";
    log("All prompts finished!", "success");
  } else {
    statusText.textContent = "Stopped";
    log("Stopped by user.", "error");
  }
}

function updateStatus(text) {
  statusText.textContent = text;
  progressText.textContent = `${currentIndex}/${prompts.length}`;
}

function updateUIState() {
  startBtn.disabled = isRunning || prompts.length === 0;
  stopBtn.disabled = !isRunning;
  promptFile.disabled = isRunning;
  delayInput.disabled = isRunning;
}

startBtn.addEventListener('click', startAutomation);
stopBtn.addEventListener('click', () => stopAutomation(false));
