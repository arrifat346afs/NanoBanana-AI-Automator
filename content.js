if (!window.hasRun) {
    window.hasRun = true;

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'generate_image') {
            handleGeneration(request.prompt)
                .then(() => sendResponse({ success: true }))
                .catch((err) => sendResponse({ success: false, error: err.message }));
            return true;
        }
        if (request.action === 'ping') {
            sendResponse({ status: 'ok' });
        }
    });
}

function logToSidePanel(msg, type = 'info') {
    chrome.runtime.sendMessage({ action: 'log', message: msg, type: type }).catch(() => { });
    console.log(`[AI Automator] ${msg}`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
}

function getPromptInput() {
    return document.getElementById('PINHOLE_TEXT_AREA_ELEMENT_ID') ||
        document.querySelector('[data-slate-editor="true"]') ||
        document.querySelector('div[contenteditable="true"][role="textbox"]') ||
        document.querySelector('div[contenteditable="true"]') ||
        document.querySelector('textarea.sc-e586993-0') ||
        document.querySelector('textarea');
}

function dispatchTextEvents(element, inputType, data = null) {
    try {
        element.dispatchEvent(new InputEvent('beforeinput', {
            bubbles: true,
            composed: true,
            cancelable: true,
            inputType,
            data
        }));
    } catch (e) {
        // Ignore browsers/pages that reject synthetic beforeinput.
    }

    try {
        element.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            composed: true,
            inputType,
            data
        }));
    } catch (e) {
        element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }

    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

function isNativeTextInput(element) {
    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
}

function isRichTextInput(element) {
    return !!element && element.isContentEditable;
}

function setNativeValue(element, value) {
    if (!isNativeTextInput(element)) {
        return false;
    }

    const prototype = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');

    if (descriptor && descriptor.set) {
        descriptor.set.call(element, value);
    } else {
        element.value = value;
    }

    return true;
}

function selectEditorContents(element) {
    const selection = window.getSelection();
    if (!selection) return false;

    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
}

function placeCaretAtEnd(element) {
    if (isNativeTextInput(element) && element.setSelectionRange && typeof element.value === 'string') {
        const end = element.value.length;
        element.setSelectionRange(end, end);
        return true;
    }

    if (!isRichTextInput(element)) return false;

    const selection = window.getSelection();
    if (!selection) return false;

    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function clearPromptInput(element) {
    element.focus();

    if (setNativeValue(element, '')) {
        dispatchTextEvents(element, 'deleteContentBackward', null);
        return true;
    }

    if (!isRichTextInput(element)) {
        return false;
    }

    selectEditorContents(element);

    let cleared = false;

    try {
        cleared = document.execCommand('delete', false);
    } catch (e) {
        cleared = false;
    }

    if (!cleared) {
        try {
            cleared = document.execCommand('insertText', false, '');
        } catch (e) {
            cleared = false;
        }
    }

    return cleared || getInputText(element).trim().length === 0;
}

function insertPromptText(element, promptText) {
    element.focus();

    if (setNativeValue(element, promptText)) {
        dispatchTextEvents(element, 'insertText', promptText);
        return true;
    }

    if (!isRichTextInput(element)) {
        return false;
    }

    placeCaretAtEnd(element);

    let inserted = false;
    try {
        inserted = document.execCommand('insertText', false, promptText);
    } catch (e) {
        inserted = false;
    }

    if (!inserted) {
        try {
            inserted = document.execCommand(
                'insertHTML',
                false,
                escapeHtml(promptText).replace(/\r?\n/g, '<br>')
            );
        } catch (e) {
            inserted = false;
        }
    }

    return inserted;
}

function getInputText(element) {
    if (!element) return '';
    if (element.value !== undefined) return element.value;
    return element.innerText || element.textContent || '';
}

function getButtonText(button) {
    return [
        button.getAttribute('aria-label'),
        button.textContent,
        button.innerText,
        ...Array.from(button.querySelectorAll('[aria-label]')).map(node => node.getAttribute('aria-label'))
    ]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function isButtonEnabled(button) {
    return !!button &&
        isVisible(button) &&
        !button.disabled &&
        button.getAttribute('aria-disabled') !== 'true';
}

function scoreSubmitButton(button) {
    const text = getButtonText(button);
    let score = 0;

    if (!text) return -1;
    if (text.includes('create')) score += 100;
    if (text.includes('generate')) score += 90;
    if (text.includes('submit')) score += 80;
    if (text.includes('send')) score += 70;
    if (text.includes('run')) score += 60;
    if ((button.getAttribute('type') || '').toLowerCase() === 'submit') score += 50;

    const iconText = (button.querySelector('i')?.textContent || '').toLowerCase();
    if (iconText.includes('arrow_forward')) score += 15;

    if (!isVisible(button)) score -= 1000;
    if (button.disabled) score -= 500;
    if (button.getAttribute('aria-disabled') === 'true') score -= 400;

    return score;
}

function getRectCenter(rect) {
    return {
        x: rect.left + (rect.width / 2),
        y: rect.top + (rect.height / 2)
    };
}

function getDistanceBetweenElements(first, second) {
    if (!first || !second) return Number.MAX_SAFE_INTEGER;

    const firstCenter = getRectCenter(first.getBoundingClientRect());
    const secondCenter = getRectCenter(second.getBoundingClientRect());
    const dx = firstCenter.x - secondCenter.x;
    const dy = firstCenter.y - secondCenter.y;
    return Math.hypot(dx, dy);
}

function getAncestorChain(element, maxDepth = 8) {
    const chain = [];
    let current = element;

    while (current && current !== document.body && chain.length < maxDepth) {
        chain.push(current);
        current = current.parentElement;
    }

    if (document.body) {
        chain.push(document.body);
    }

    return chain;
}

function findSubmitButton(textArea = null) {
    const scopedButtons = textArea
        ? getAncestorChain(textArea)
            .flatMap(node => Array.from(node.querySelectorAll ? node.querySelectorAll('button') : []))
        : [];

    const buttons = Array.from(new Set([
        ...scopedButtons,
        ...Array.from(document.querySelectorAll('button'))
    ]));

    const ranked = buttons
        .map((button) => {
            let score = scoreSubmitButton(button);

            if (textArea) {
                const distance = getDistanceBetweenElements(textArea, button);
                score += Math.max(0, 300 - Math.min(distance, 300));

                if (button.closest('form') && textArea.closest('form') && button.closest('form') === textArea.closest('form')) {
                    score += 150;
                }

                if (textArea.parentElement && textArea.parentElement.contains(button)) {
                    score += 100;
                }
            }

            return { button, score };
        })
        .filter(entry => entry.score > 0)
        .sort((a, b) => b.score - a.score);

    return ranked[0]?.button || null;
}

async function waitForSubmitButton(textArea, timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    let lastSeenButton = null;
    let loggedDisabledState = false;

    while (Date.now() < deadline) {
        const button = findSubmitButton(textArea);
        if (button) {
            lastSeenButton = button;
            if (isButtonEnabled(button)) {
                return button;
            }

            if (!loggedDisabledState) {
                logToSidePanel('Found Create button but it is still disabled; waiting for it to enable...', 'info');
                loggedDisabledState = true;
            }
        }

        await sleep(250);
    }

    return lastSeenButton;
}

function clickButton(button) {
    if (!button) return false;

    const rect = button.getBoundingClientRect();
    const center = getRectCenter(rect);

    button.scrollIntoView({ block: 'center', inline: 'center' });
    button.focus();

    for (const eventName of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        try {
            const EventCtor = eventName.startsWith('pointer') && typeof PointerEvent === 'function'
                ? PointerEvent
                : MouseEvent;

            button.dispatchEvent(new EventCtor(eventName, {
                bubbles: true,
                cancelable: true,
                composed: true,
                view: window,
                clientX: center.x,
                clientY: center.y,
                button: 0,
                buttons: 1,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true
            }));
        } catch (e) {
            // Ignore and still try native click.
        }
    }

    button.click();
    return true;
}

function tryFormSubmit(textArea, submitButton = null) {
    const form = submitButton?.closest('form') || textArea.closest('form');
    if (!form) return false;

    try {
        if (typeof form.requestSubmit === 'function') {
            form.requestSubmit(submitButton || undefined);
        } else {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
        return true;
    } catch (e) {
        logToSidePanel(`Form submit fallback failed: ${e.message}`, 'info');
        return false;
    }
}

function focusPromptInputForEnter(textArea) {
    textArea.scrollIntoView({ block: 'center', inline: 'center' });
    textArea.focus();
    textArea.click();

    placeCaretAtEnd(textArea);
}

function pressEnterOnInput(textArea, combo = { ctrlKey: false, metaKey: false }) {
    focusPromptInputForEnter(textArea);

    for (const type of ['keydown', 'keypress', 'keyup']) {
        textArea.dispatchEvent(new KeyboardEvent(type, {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            composed: true,
            cancelable: true,
            ctrlKey: combo.ctrlKey,
            metaKey: combo.metaKey
        }));
    }
}

async function tryEnterFallback(textArea) {
    logToSidePanel('Fallback: focusing prompt input and pressing Enter...', 'info');

    for (const combo of [
        { key: 'Enter', ctrlKey: false, metaKey: false },
        { key: 'Enter', ctrlKey: true, metaKey: false },
        { key: 'Enter', ctrlKey: false, metaKey: true }
    ]) {
        pressEnterOnInput(textArea, combo);
        await sleep(150);
    }

    return true;
}

async function requestTrustedTypeAndSubmit(promptText) {
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'trusted_type_and_submit_prompt',
            prompt: promptText
        });

        if (response && response.success) {
            logToSidePanel('Trusted input typed prompt and pressed Enter.', 'success');
            return true;
        }

        if (response && response.error) {
            logToSidePanel(`Trusted prompt input was not available: ${response.error}`, 'info');
        }
    } catch (e) {
        logToSidePanel(`Trusted prompt input was not available: ${e.message}`, 'info');
    }

    return false;
}

async function handleGeneration(promptText) {
    logToSidePanel("Finding input element...");

    const textArea = getPromptInput();

    if (!textArea) {
        throw new Error('Prompt textarea not found.');
    }

    // Step 1: Focus the input (put cursor inside)
    logToSidePanel("Focusing input...");
    focusPromptInputForEnter(textArea);
    await sleep(300);

    // Step 2: Use Chrome's trusted input path so Flow updates its internal editor state.
    logToSidePanel("Typing prompt and pressing Enter with trusted input...", "info");
    const didUseTrustedInput = await requestTrustedTypeAndSubmit(promptText);
    if (!didUseTrustedInput) {
        logToSidePanel('Trusted input failed; falling back to synthetic text insertion.', 'info');

        const cleared = clearPromptInput(textArea);
        if (!cleared) {
            logToSidePanel('Could not safely clear the editor; continuing only if it was already empty.', 'info');
        }

        const inserted = insertPromptText(textArea, promptText);
        if (!inserted) {
            throw new Error('Prompt text could not be inserted safely into the editor.');
        }

        await sleep(300);
        await tryEnterFallback(textArea);
    }

    await sleep(300);
    logToSidePanel("Generation trigger attempted with trusted input.", "success");
}