/* ================== GLOBAL STATE & UTILS ================== */
import { db, auth } from './modules/firebase.js';

// The main application container
const appContainer = document.getElementById('app-container');
let currentSportModule = null;
let globalUser = null;

/**
 * Utility: Gets an element by its ID
 */
function $(id) {
    return document.getElementById(id);
}

/**
 * Utility: Gets all elements by a selector
 */
function $$(selector) {
    return document.querySelectorAll(selector);
}

/**
 * Utility: Shows a toast notification
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
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, duration);
}

/**
 * Utility: Copies text to the clipboard
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

// Make utilities globally available
window.utils = {
    $,
    $$,
    showToast,
    copyToClipboard
};

/* ================== APP INITIALIZATION ================== */

/**
 * Loads and initializes the correct sport module
 */
async function loadSportModule(urlParams, user) {
    try {
        const sportName = urlParams.get('sport');
        if (!sportName) {
            appContainer.innerHTML = '<h1>No sport selected. Please go back.</h1>';
            return;
        }

        const sportModule = await import(`./sports/${sportName}.js`);
        
        if (!sportModule || !sportModule.default) {
            throw new Error(`Sport module for "${sportName}" is invalid.`);
        }

        currentSportModule = sportModule.default;
        document.title = `${currentSportModule.sportName} Scoreboard`;
        appContainer.innerHTML = currentSportModule.buildHtml();

        // Initialize the sport module
        // Pass the user object (or null) and all URL params
        currentSportModule.init(window.utils, user, urlParams);
        
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
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);

    // This runs auth check *first*
    auth.onAuthStateChanged(user => {
        // Once we know the user status, load the module
        // This ensures the module's init() has the user object
        loadSportModule(urlParams, user);
    });
});