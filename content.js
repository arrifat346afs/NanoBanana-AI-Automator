if (!window.hasRun) {
    window.hasRun = true;

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'generate_image') {
            handleGeneration(request.prompt)
                .then(() => sendResponse({ success: true }))
                .catch((err) => sendResponse({ success: false, error: err.message }));
            return true; // Keep channel open for async response
        }
        // Simple ping handler to check if script is alive
        if (request.action === 'ping') {
            sendResponse({ status: 'ok' });
        }
    });
}

function logToSidePanel(msg, type = 'info') {
    chrome.runtime.sendMessage({ action: 'log', message: msg, type: type }).catch(() => { });
    console.log(`[AI Automator] ${msg}`);
}

async function handleGeneration(promptText) {
    logToSidePanel("Finding textarea...");
    const textArea = document.getElementById('PINHOLE_TEXT_AREA_ELEMENT_ID') ||
        document.querySelector('textarea.sc-e586993-0');

    if (!textArea) {
        throw new Error('Prompt textarea not found.');
    }

    // 2. Insert Text with robust event simulation
    logToSidePanel("Setting text...");
    textArea.focus();
    textArea.value = promptText;

    // React Tracker Hack
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    if (nativeInputValueSetter) {
        nativeInputValueSetter.call(textArea, promptText);
    }

    // Dispatch standard events
    textArea.dispatchEvent(new Event('input', { bubbles: true }));
    textArea.dispatchEvent(new Event('change', { bubbles: true }));

    logToSidePanel("Waiting 2s to simulate human typing...", "info");
    await new Promise(r => setTimeout(r, 2000));

    // Dispatch key events (some apps rely on this)
    textArea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
    textArea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));

    // IMMEDIATE ENTER SEQUENCE (As requested)
    logToSidePanel("Simulating ENTER key immediately...", "info");

    const keySequence = [
        { type: 'keydown', code: 'Enter', key: 'Enter', keyCode: 13, which: 13 },
        { type: 'keypress', code: 'Enter', key: 'Enter', keyCode: 13, which: 13 },
        { type: 'keyup', code: 'Enter', key: 'Enter', keyCode: 13, which: 13 }
    ];

    keySequence.forEach(evtData => {
        const { type, ...rest } = evtData;
        const evt = new KeyboardEvent(type, {
            bubbles: true,
            cancelable: true,
            view: window,
            ...rest
        });
        textArea.dispatchEvent(evt);
    });

    await new Promise(r => setTimeout(r, 100));

    // 3. Find Button (Backup/Confirmation)
    // The 'Add' button shares the class 'sc-c177465c-1', so we must be more specific.
    // Create Button Class: sc-c177465c-1 gdArnN sc-408537d4-2 gdXWm
    // Add Button Class:    sc-c177465c-1 hVamcH sc-d02e9a37-1 hvUQuN

    const getBtn = () => {
        // Priority 1: Exact class match for Create button
        let b = document.querySelector('button.sc-c177465c-1.gdArnN');

        // Priority 2: Text match "Create", ensuring we don't pick up the "Add" button
        if (!b) {
            const buttons = Array.from(document.querySelectorAll('button'));
            b = buttons.find(btn => {
                const text = btn.innerText.trim();
                // Strict check: Must contain "Create" and NOT be the "add" button
                return text.includes('Create') && !btn.querySelector('i.google-symbols.sc-d02e9a37-7');
            });
        }
        return b;
    };

    logToSidePanel("Waiting for button to be enabled (backup)...");

    // 4. Wait for button to be enabled
    let attempts = 0;
    let buttonClicked = false;

    while (attempts < 20) {
        const btn = getBtn();
        if (btn) {
            if (!btn.disabled) {
                logToSidePanel("Button is enabled. Clicking...", "success");

                // Mouse Events
                ['mousedown', 'mouseup', 'click'].forEach(type => {
                    btn.dispatchEvent(new MouseEvent(type, {
                        view: window,
                        bubbles: true,
                        cancelable: true,
                        buttons: 1
                    }));
                });

                btn.click();
                buttonClicked = true;
                return;
            }
        }

        // Pulse events periodically in case UI needs wakeup
        if (attempts % 5 === 0) {
            textArea.dispatchEvent(new Event('input', { bubbles: true }));
        }

        await new Promise(r => setTimeout(r, 500));
        attempts++;
    }
}
