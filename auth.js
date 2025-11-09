// This file controls the new index.html page (the 3-box layout)

// Import the firebase services
import { db, auth } from './modules/firebase.js';

/* ================== UTILITIES ================== */
// We need a few utils here since main.js isn't loaded
function $(id) {
    return document.getElementById(id);
}

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

async function loadGameState(code) {
    if (!db) {
        showToast('Database not connected', 'error', 3000);
        return null;
    }
    try {
        const doc = await db.collection('games').doc(code).get();
        if (doc.exists) {
            return doc.data();
        } else {
            console.warn(`Game doc '${code}' does not exist`);
            return null;
        }
    } catch (e) {
        console.warn('Failed to load game from Firebase:', e);
        return null;
    }
}

/* ================== AUTH HANDLERS ================== */

function handleSignUp() {
    const email = $('globalEmail').value;
    const password = $('globalPassword').value;
    if (password.length < 6) {
        showToast('Password must be at least 6 characters', 'error', 3000);
        return;
    }
    auth.createUserWithEmailAndPassword(email, password)
        .then(userCredential => {
            showToast('Account created successfully!', 'success', 2000);
            // Auth state change will handle redirect
        })
        .catch(error => {
            console.error('Sign up error:', error);
            showToast(error.message, 'error', 4000);
        });
}

function handleLogin() {
    const email = $('globalEmail').value;
    const password = $('globalPassword').value;
    auth.signInWithEmailAndPassword(email, password)
        .then(userCredential => {
            showToast('Logged in successfully!', 'success', 2000);
            // Auth state change will handle redirect
        })
        .catch(error => {
            console.error('Login error:', error);
            showToast(error.message, 'error', 4000);
        });
}

function handleFreeHost() {
    // Redirect to sport selection as a guest
    window.location.href = 'sports.html?mode=free';
}

async function handleGlobalWatch() {
    const code = $('globalWatchCode').value.trim();
    if (code.length !== 6) return;

    // Check if game exists before redirecting
    const game = await loadGameState(code);
    if (game) {
        // Game exists, redirect to sport selection as a watcher
        window.location.href = `sports.html?mode=watch&code=${code}`;
    } else {
        const msg = $('globalCodeValidationMessage');
        msg.textContent = 'Game not found. Check the code.';
        msg.className = 'validation-message error';
        msg.classList.remove('hidden');
        showToast('Game not found', 'error', 3000);
    }
}

/* ================== INITIALIZATION ================== */

// Listen for auth state changes
auth.onAuthStateChanged(user => {
    if (user) {
        // User is logged in
        console.log('User is logged in, redirecting to sport selection.');
        // Redirect to sport selection as a logged-in host
        window.location.href = 'sports.html?mode=host';
    } else {
        // User is logged out
        console.log('User is logged out, showing login page.');
    }
});

// Attach all listeners
$('globalLoginBtn').addEventListener('click', handleLogin);
$('globalSignupBtn').addEventListener('click', handleSignUp);
$('globalFreeHostBtn').addEventListener('click', handleFreeHost);
$('globalWatchBtn').addEventListener('click', handleGlobalWatch);

// Watch code input validation
$('globalWatchCode').addEventListener('input', (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    e.target.value = value;
    $('globalWatchBtn').disabled = value.length !== 6;
    $('globalCodeValidationMessage').classList.add('hidden');
});