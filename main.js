/* ================== GLOBAL STATE & UTILS ================== */

// The main application container
const appContainer = document.getElementById('app-container');
let currentSportModule = null; // To hold the loaded sport logic

/**
 * Utility: Gets an element by its ID
 * @param {string} id
 * @returns {HTMLElement}
 */
function $(id) {
    return document.getElementById(id);
}

/**
 * Utility: Gets all elements by a selector
 * @param {string} selector
 * @returns {NodeListOf<HTMLElement>}
 */
function $$(selector) {
    return document.querySelectorAll(selector);
}

/**
 * Utility: Shows a toast notification
 * @param {string} message
 * @param {'info' | 'success' | 'warning' | 'error'} type
 * @param {number} duration
 */
function showToast(message, type = 'info', duration = 2000) {
    const container = $('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    let size = 'small';
    if (type === 'warning' || message.length > 30) size = 'medium';
    if (type === 'error' || message.length > 50) size = 'large';
    
    toast.className = `toast ${type} ${size}`;
    toast.innerHTML = `<span class="toast-message">${message}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, duration);
}

/**
 * Utility: Copies text to the clipboard
 * @param {string} text
 */
async function copyToClipboard(text) {
    console.log('Copying to clipboard:', text);
    
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('Game code copied!', 'success', 1500);
            return;
        } catch (err) {
            console.warn('Clipboard API failed, using fallback:', err);
        }
    }
    
    // Fallback for insecure contexts (like 127.0.0.1 without HTTPS)
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
            showToast('Game code copied!', 'success', 1500);
        } else {
            showToast('Copy failed - please select and copy manually', 'warning', 3000);
        }
    } catch (err) {
        console.error('Copy failed:', err);
        showToast('Copy not supported - please select and copy manually', 'warning', 3000);
    }
}

// Make utilities globally available for sport modules to use
// This is a simple way to provide shared functionality
window.utils = {
    $,
    $$,
    showToast,
    copyToClipboard
};

/* ================== APP INITIALIZATION ================== */

/**
 * Loads and initializes the correct sport module based on the URL
 */
async function initializeApp() {
    try {
        // 1. Get the sport from the URL query parameter
        const urlParams = new URLSearchParams(window.location.search);
        const sportName = urlParams.get('sport');

        if (!sportName) {
            appContainer.innerHTML = '<h1>No sport selected. Please go back to the home page.</h1>';
            return;
        }

        // 2. Dynamically import the correct module
        // This uses the 'sportName' variable to build the file path
        const sportModule = await import(`./sports/${sportName}.js`);
        
        if (!sportModule || !sportModule.default) {
            throw new Error(`Sport module for "${sportName}" is invalid.`);
        }

        currentSportModule = sportModule.default;

        // 3. Set the page title
        document.title = `${currentSportModule.sportName} Scoreboard`;

        // 4. Build the initial HTML for the sport
        // The module provides the HTML, main.js just injects it
        appContainer.innerHTML = currentSportModule.buildHtml();

        // 5. Initialize the sport module
        // This tells the module to attach all its event listeners
        // We pass it the utilities so it can use them
        currentSportModule.init(window.utils);
        
        console.log(`Successfully initialized ${currentSportModule.sportName} module.`);

    } catch (error) {
        console.error('Failed to initialize app:', error);
        appContainer.innerHTML = `
            <div class="container" style="text-align: center; padding-top: 50px;">
                <h1 style="color: var(--color-error);">Error</h1>
                <p>Could not load the sport module.</p>
                <p style="color: var(--color-text-secondary);">${error.message}</p>
                <a href="index.html" class="btn btn--primary">Go Back Home</a>
            </div>
        `;
    }
}

// Start the application when the DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);