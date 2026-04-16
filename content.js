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
    logToSidePanel("Finding input element...");
    const textArea = document.getElementById('PINHOLE_TEXT_AREA_ELEMENT_ID') ||
        document.querySelector('[data-slate-editor="true"]') ||
        document.querySelector('div[contenteditable="true"][role="textbox"]') ||
        document.querySelector('textarea.sc-e586993-0');

    if (!textArea) {
        throw new Error('Prompt textarea not found.');
    }

    // Detect if contenteditable div or textarea
    const isContentEditable = textArea.hasAttribute('contenteditable') && textArea.getAttribute('role') === 'textbox';

    logToSidePanel("Setting text...");
    textArea.focus();

    if (isContentEditable) {
        // Handle Slate.js contenteditable div
        textArea.focus();
        await new Promise(r => setTimeout(r, 100));
        
        // Dispatch beforeinput event (what Slate.js actually listens to)
        const beforeInputEvent = new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: promptText
        });
        textArea.dispatchEvent(beforeInputEvent);
        
        // If beforeinput not handled, use execCommand
        if (!beforeInputEvent.defaultPrevented) {
            document.execCommand('insertText', false, promptText);
        }
        
        // Dispatch input event
        const inputEvent = new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: promptText
        });
        textArea.dispatchEvent(inputEvent);
        
        // Dispatch compositionend
        textArea.dispatchEvent(new CompositionEvent('compositionend', {
            bubbles: true,
            cancelable: true
        }));
    } else {
        // Handle textarea (fallback)
        textArea.value = promptText;

        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(textArea, promptText);
        }

        textArea.dispatchEvent(new Event('input', { bubbles: true }));
        textArea.dispatchEvent(new Event('change', { bubbles: true }));
    }

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

    logToSidePanel("Generation triggered via Enter key.", "success");
}
