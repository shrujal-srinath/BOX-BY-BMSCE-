/**
 * Basketball Scoreboard Pro - Firebase (Online) Edition
 *
 * This version replaces all localStorage and BroadcastChannel logic with
 * Firebase Firestore for real-time, multi-device synchronization.
 *
 * Changes:
 * - Removed: broadcastChannel, initBroadcastChannel, handleBroadcastMessage, broadcastUpdate
 * - Added: `gameRunning` and `shotClockRunning` to gameState to be synced.
 * - Added: Firestore `onSnapshot` listeners to `showControlView` and `showSpectatorView`
 * to listen for real-time game state changes.
 * - Added: Local timer management in listeners. Viewers now run their own timers
 * based on the `gameRunning` state from Firebase, minimizing db writes.
 * - Modified: `saveGameState` and `loadGameState` are now `async` and use Firestore.
 * - Modified: `validateGameCode` and `joinSpectatorMode` are now `async` to await db calls.
 * - Modified: All clock-related functions (toggleMasterGame, etc.) now update
 * the `appState.game.gameState.gameRunning` properties, which
 * are then saved to Firebase and synced to all clients.
 */

// ================== GLOBAL STATE ==================
const appState = {
    view: 'landing',
    isHost: false,
    gameCode: null,
    game: null,
    gameType: 'friendly',
    timers: {
        masterTimer: null,
        autoSave: null,
        shotClockTimer: null
    },
    // broadcastChannel: null, // REMOVED
    // gameRunning: false, // MOVED to appState.game.gameState
    // shotClockRunning: false, // MOVED to appState.game.gameState
    selectedPlayer: null,
    actionHistory: [],
    clockEditing: false,
    firestoreListener: null // To keep track of our live listener
};

// ================== UTILITY FUNCTIONS ==================
function $(id) {
    return document.getElementById(id);
}

function $$(selector) {
    return document.querySelectorAll(selector);
}

function generateGameCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function formatTime(minutes, seconds) {
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// ================== ENHANCED TOAST SYSTEM ==================
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

// ================== FIXED CLIPBOARD FUNCTIONALITY ==================
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

// ================== VIEW SWITCHING ==================
function showView(viewName) {
    console.log(`Switching to view: ${viewName}`);
    const views = ['landing', 'config', 'setup', 'control', 'viewer'];
    
    views.forEach(view => {
        const element = $(`${view}-view`);
        if (element) {
            if (view === viewName) {
                element.classList.remove('hidden');
                element.style.display = 'block';
            } else {
                element.classList.add('hidden');
                element.style.display = 'none';
            }
        }
    });
    
    appState.view = viewName;

    // Detach any existing firestore listener if we are not on a game view
    if (viewName === 'landing' || viewName === 'config') {
        if (appState.firestoreListener) {
            appState.firestoreListener(); // This detaches the listener
            appState.firestoreListener = null;
            console.log('Detached Firestore listener.');
        }
        stopMasterTimer();
    }
    
    console.log(`✓ Successfully switched to ${viewName} view`);
}

// ================== ENHANCED SHOT CLOCK VIOLATION SYSTEM ==================
function playShotClockViolationBuzzer() {
    const buzzer = $('buzzerSound');
    if (buzzer) {
        buzzer.currentTime = 0;
        buzzer.play().catch(e => console.log('Audio play failed:', e));
    }
    
    const violationAlert = $('shotClockViolation');
    if (violationAlert) {
        violationAlert.classList.remove('hidden');
        setTimeout(() => {
            violationAlert.classList.add('hidden');
        }, 2000);
    }
}

function handleShotClockViolation() {
    console.log('Shot clock violation!');
    
    playShotClockViolationBuzzer();
    showToast('SHOT CLOCK VIOLATION!', 'error', 3000);
    
    if (appState.game) {
        // This function is only called by the host, so it's safe to modify state
        appState.game.gameState.shotClockRunning = false;
        
        const currentPossession = appState.game.gameState.possession;
        const newPossession = currentPossession === 'teamA' ? 'teamB' : 'teamA';
        appState.game.gameState.possession = newPossession;
        
        appState.game.gameState.shotClock = 0;
        updateControlDisplay();
        // updateSpectatorView(); // No longer needed, listener will handle
        saveGameState(); // This will trigger all listeners
        
        showToast('Shot clock stopped - use restart buttons', 'warning', 4000);
    }
}

// ================== ENHANCED TIMER SYSTEM ==================
function startMasterTimer() {
    if (appState.timers.masterTimer) {
        clearInterval(appState.timers.masterTimer);
    }
    
    appState.timers.masterTimer = setInterval(() => {
        if (!appState.game) {
            stopMasterTimer();
            return;
        }
        
        let updated = false;
        
        // Use the synced game state to run the timer
        if (appState.game.gameState.gameRunning) {
            if (appState.game.gameState.gameTime.seconds > 0) {
                appState.game.gameState.gameTime.seconds--;
                updated = true;
            } else if (appState.game.gameState.gameTime.minutes > 0) {
                appState.game.gameState.gameTime.minutes--;
                appState.game.gameState.gameTime.seconds = 59;
                updated = true;
            } else {
                // Game clock hit 0
                appState.game.gameState.gameRunning = false;
                appState.game.gameState.shotClockRunning = false;
                
                // Only host saves the state change
                if(appState.isHost) {
                    showToast('Period ended!', 'warning', 3000);
                    saveGameState(); // Sync the stopped clocks
                }
            }
        }
        
        if (appState.game.gameState.shotClockRunning && appState.game.settings.shotClockDuration > 0) {
            if (appState.game.gameState.shotClock > 0) {
                appState.game.gameState.shotClock--;
                updated = true;
                
                if (appState.game.gameState.shotClock === 5) {
                    const shotClockDisplay = $('shotClockDisplay');
                    const viewerShotClock = $('viewerShotClock');
                    if (shotClockDisplay) shotClockDisplay.classList.add('warning');
                    if (viewerShotClock) viewerShotClock.classList.add('warning');
                }
            } else {
                // Shot clock hit 0
                // Only the host can trigger a violation
                if (appState.isHost) {
                    handleShotClockViolation(); // This will stop the clock and save state
                } else {
                    // Viewers just stop their local timer
                    appState.game.gameState.shotClockRunning = false;
                }
                updated = true;
            }
        }
        
        if (updated) {
            // Update the display locally for this client
            if (appState.view === 'control') updateControlDisplay();
            if (appState.view === 'viewer') updateSpectatorView();
        }

        // Stop the master timer if both clocks are paused
        if (!appState.game.gameState.gameRunning && !appState.game.gameState.shotClockRunning) {
            stopMasterTimer();
            // Update button visuals *after* timer is confirmed stopped
            if (appState.view === 'control') updateMasterStartButton();
        }
    }, 1000);
}

function stopMasterTimer() {
    if (appState.timers.masterTimer) {
        clearInterval(appState.timers.masterTimer);
        appState.timers.masterTimer = null;
    }
    // Update button visuals when timer stops
    if (appState.view === 'control') updateMasterStartButton();
}

// ================== ENHANCED CLOCK CONTROLS (HOST-ONLY ACTIONS) ==================
function toggleMasterGame() {
    if (!appState.game) return;
    
    // Check current state and toggle it
    if (appState.game.gameState.gameRunning || appState.game.gameState.shotClockRunning) {
        // PAUSE
        appState.game.gameState.gameRunning = false;
        appState.game.gameState.shotClockRunning = false;
        stopMasterTimer();
        showToast('Game paused', 'info', 1500);
    } else {
        // START
        appState.game.gameState.gameRunning = true;
        if (appState.game.settings.shotClockDuration > 0 && appState.game.gameState.shotClock > 0) {
            appState.game.gameState.shotClockRunning = true;
        }
        startMasterTimer(); // Start local timer immediately
        showToast('Game started!', 'success', 1500);
    }
    
    updateMasterStartButton();
    saveGameState(); // Sync the new (running or paused) state to all clients
}

function updateMasterStartButton() {
    const btn = $('startGameBtn');
    if (!btn || !appState.game) return;
    
    // Base decision on the synced game state
    if (appState.game.gameState.gameRunning || appState.game.gameState.shotClockRunning) {
        btn.textContent = 'PAUSE GAME';
        btn.className = 'btn btn--primary master-start-btn pause';
    } else {
        btn.textContent = 'START GAME';
        btn.className = 'btn btn--primary master-start-btn resume';
    }
}

function resetAllClocks() {
    if (!appState.game) return;
    
    appState.game.gameState.gameTime.minutes = appState.game.settings.periodDuration;
    appState.game.gameState.gameTime.seconds = 0;
    
    if (appState.game.settings.shotClockDuration > 0) {
        appState.game.gameState.shotClock = appState.game.settings.shotClockDuration;
    }

    // Ensure clocks are stopped
    appState.game.gameState.gameRunning = false;
    appState.game.gameState.shotClockRunning = false;
    
    removeShotClockWarning();
    updateControlDisplay();
    // updateSpectatorView(); // Listener will handle
    saveGameState(); // Sync new clock values
    showToast('All clocks reset', 'info', 1500);
}

function removeShotClockWarning() {
    const shotClockDisplay = $('shotClockDisplay');
    const viewerShotClock = $('viewerShotClock');
    if (shotClockDisplay) shotClockDisplay.classList.remove('warning');
    if (viewerShotClock) viewerShotClock.classList.remove('warning');
}

function resetShotClockTo14() {
    if (!appState.game || appState.game.settings.shotClockDuration === 0) return;
    
    appState.game.gameState.shotClock = 14;
    removeShotClockWarning();
    updateControlDisplay();
    // updateSpectatorView(); // Listener will handle
    saveGameState(); // Sync new shot clock value
    showToast('Shot clock reset to 14s', 'info', 1500);
}

function resetShotClockTo24() {
    if (!appState.game || appState.game.settings.shotClockDuration === 0) return;
    
    appState.game.gameState.shotClock = 24;
    removeShotClockWarning();
    updateControlDisplay();
    // updateSpectatorView(); // Listener will handle
    saveGameState(); // Sync new shot clock value
    showToast('Shot clock reset to 24s', 'info', 1500);
}
// ✅ CHANGE START
document.addEventListener('keydown', function(event) {
    if (
        event.key === 'Enter' &&
        appState.view === 'control' &&
        !appState.clockEditing &&
        document.activeElement.tagName !== 'INPUT' &&
        document.activeElement.tagName !== 'TEXTAREA'
    ) {
        resetShotClockTo24();
    }
});
// ✅ CHANGE END

function startShotClockOnly() {
    if (!appState.game || appState.game.settings.shotClockDuration === 0) return;
    
    if (appState.game.gameState.shotClock <= 0) {
        showToast('Reset shot clock first', 'warning', 2000);
        return;
    }
    
    appState.game.gameState.shotClockRunning = true;
    startMasterTimer(); // Start local timer
    showToast('Shot clock started', 'success', 1500);
    updateControlDisplay();
    saveGameState(); // Sync shot clock running state
}

// ================== ENHANCED CLOCK EDITING MODALS ==================
function showEditClockModal() {
    const modal = $('editClockModal');
    const editMinutes = $('editMinutes');
    const editSeconds = $('editSeconds');
    
    if (!modal || !appState.game) return;
    
    editMinutes.value = appState.game.gameState.gameTime.minutes;
    editSeconds.value = appState.game.gameState.gameTime.seconds;
    
    modal.classList.remove('hidden');
    appState.clockEditing = true;
    
    const saveBtn = $('saveClockEdit');
    const cancelBtn = $('cancelClockEdit');
    
    saveBtn.onclick = () => {
        const minutes = Math.max(0, parseInt(editMinutes.value) || 0);
        const seconds = Math.max(0, Math.min(59, parseInt(editSeconds.value) || 0));
        
        appState.game.gameState.gameTime.minutes = minutes;
        appState.game.gameState.gameTime.seconds = seconds;
        
        updateControlDisplay();
        // updateSpectatorView(); // Listener will handle
        saveGameState();
        
        modal.classList.add('hidden');
        appState.clockEditing = false;
        showToast('Game clock updated', 'success', 1500);
    };
    
    cancelBtn.onclick = () => {
        modal.classList.add('hidden');
        appState.clockEditing = false;
    };
}

function showEditShotClockModal() {
    const modal = $('editShotClockModal');
    const editShotClockSeconds = $('editShotClockSeconds');
    
    if (!modal || !appState.game || appState.game.settings.shotClockDuration === 0) return;
    
    editShotClockSeconds.value = appState.game.gameState.shotClock;
    
    modal.classList.remove('hidden');
    appState.clockEditing = true;
    
    const saveBtn = $('saveShotClockEdit');
    const cancelBtn = $('cancelShotClockEdit');
    
    saveBtn.onclick = () => {
        const seconds = Math.max(0, Math.min(60, parseInt(editShotClockSeconds.value) || 0));
        
        appState.game.gameState.shotClock = seconds;
        removeShotClockWarning();
        
        updateControlDisplay();
        // updateSpectatorView(); // Listener will handle
        saveGameState();
        
        modal.classList.add('hidden');
        appState.clockEditing = false;
        showToast('Shot clock updated', 'success', 1500);
    };
    
    cancelBtn.onclick = () => {
        modal.classList.add('hidden');
        appState.clockEditing = false;
    };
}

// ================== GAME STATE MANAGEMENT (FIREBASE) ==================
function createGameSkeleton(code, config = {}) {
    return {
        code: code,
        gameType: appState.gameType,
        settings: {
            gameName: config.gameName || 'Basketball Game',
            periodDuration: config.periodDuration || 12,
            shotClockDuration: config.shotClockDuration || 24,
            timeoutsPerTeam: config.timeoutsPerTeam || 7
        },
        teamA: {
            name: config.teamAName || 'Team A',
            color: config.teamAColor || '#FF6B35',
            score: 0,
            timeouts: config.timeoutsPerTeam || 7,
            fouls: 0,
            roster: [],
            stats: {}
        },
        teamB: {
            name: config.teamBName || 'Team B',
            color: config.teamBColor || '#1B263B',
            score: 0,
            timeouts: config.timeoutsPerTeam || 7,
            fouls: 0,
            roster: [],
            stats: {}
        },
        gameState: {
            period: 1,
            gameTime: {
                minutes: config.periodDuration || 12,
                seconds: 0
            },
            shotClock: config.shotClockDuration || 24,
            possession: 'teamA',
            gameRunning: false, // ADDED for sync
            shotClockRunning: false // ADDED for sync
        },
        lastUpdate: Date.now()
    };
}

// MODIFIED for Firebase
async function saveGameState() {
    if (appState.game && appState.gameCode && db && appState.isHost) {
        try {
            appState.game.lastUpdate = Date.now();
            // 'games' is the collection, appState.gameCode is the document ID
            await db.collection('games').doc(appState.gameCode).set(appState.game);
            // Still use localStorage to remember the *last game code* this browser hosted
            localStorage.setItem('lastGameCode', appState.gameCode);
        } catch (e) {
            console.warn('Failed to save game to Firebase:', e);
            showToast('Sync failed. Check connection.', 'error', 2000);
        }
    }
}

// MODIFIED for Firebase
async function loadGameState(code) {
    if (!db) {
        showToast('Database not connected', 'error', 3000);
        return null;
    }
    try {
        const doc = await db.collection('games').doc(code).get();
        if (doc.exists) {
            return doc.data(); // This is your game object
        } else {
            console.warn(`Game doc '${code}' does not exist`);
            return null; // Game not found
        }
    } catch (e) {
        console.warn('Failed to load game from Firebase:', e);
        return null;
    }
}

// ================== BROADCAST CHANNEL MANAGEMENT (REMOVED) ==================
// All functions (initBroadcastChannel, broadcastUpdate, handleBroadcastMessage) removed.
// They are replaced by `saveGameState` (for sending) and the `onSnapshot` listeners (for receiving).

// ================== TOP SCORER TRACKING ==================
function getTopScorer(team) {
    if (!appState.game || !appState.game[team] || !appState.game[team].stats) {
        return null;
    }
    
    let topScorer = null;
    let highestPoints = 0;
    
    const stats = appState.game[team].stats;
    const roster = appState.game[team].roster;
    
    Object.keys(stats).forEach(playerNumber => {
        const playerStats = stats[playerNumber];
        if (playerStats && playerStats.totalPoints > highestPoints) {
            highestPoints = playerStats.totalPoints;
            topScorer = {
                number: playerNumber,
                name: roster.find(p => p.number == playerNumber)?.name || `#${playerNumber}`,
                points: playerStats.totalPoints
            };
        }
    });
    
    return topScorer;
}

function updateTopScorerDisplay() {
    const teamATopScorer = getTopScorer('teamA');
    const teamBTopScorer = getTopScorer('teamB');
    
    const teamADisplay = $('teamATopScorer');
    const teamBDisplay = $('teamBTopScorer');
    
    if (teamADisplay) {
        if (teamATopScorer && teamATopScorer.points > 0) {
            teamADisplay.textContent = `Top: ${teamATopScorer.name} (${teamATopScorer.points} pts)`;
        } else {
            teamADisplay.textContent = 'No scorer yet';
        }
    }
    
    if (teamBDisplay) {
        if (teamBTopScorer && teamBTopScorer.points > 0) {
            teamBDisplay.textContent = `Top: ${teamBTopScorer.name} (${teamBTopScorer.points} pts)`;
        } else {
            teamBDisplay.textContent = 'No scorer yet';
        }
    }
    
    const viewerTeamATopScorer = $('viewerTeamATopScorer');
    const viewerTeamBTopScorer = $('viewerTeamBTopScorer');
    
    if (viewerTeamATopScorer) {
        if (teamATopScorer && teamATopScorer.points > 0) {
            viewerTeamATopScorer.textContent = `Top: ${teamATopScorer.name} (${teamATopScorer.points} pts)`;
        } else {
            viewerTeamATopScorer.textContent = 'No scorer yet';
        }
    }
    
    if (viewerTeamBTopScorer) {
        if (teamBTopScorer && teamBTopScorer.points > 0) {
            viewerTeamBTopScorer.textContent = `Top: ${teamBTopScorer.name} (${teamBTopScorer.points} pts)`;
        } else {
            viewerTeamBTopScorer.textContent = 'No scorer yet';
        }
    }
}

// ================== FIXED EVENT HANDLERS ==================
function handleCreateGame(event) {
    console.log('✓ handleCreateGame called');
    event.preventDefault();
    
    const hostPasswordInput = $('hostPasswordInput');
    const password = hostPasswordInput ? hostPasswordInput.value.trim() : '';
    
    if (password.length < 4) {
        showToast('Password must be at least 4 characters', 'error', 3000);
        return;
    }
    
    appState.gameCode = generateGameCode();
    appState.isHost = true;
    
    console.log('✓ Game code generated:', appState.gameCode);
    
    // initBroadcastChannel(); // REMOVED
    showToast('Game created successfully!', 'success', 1500);
    
    console.log('✓ Navigating to configuration view...');
    showConfigurationView();
}

// MODIFIED for Firebase
async function handleWatchGame(event) {
    console.log('✓ handleWatchGame called');
    event.preventDefault();
    
    const watchCodeInput = $('watchCodeInput');
    const code = watchCodeInput ? watchCodeInput.value.trim() : '';
    
    if (code.length !== 6) {
        showToast('Enter a valid 6-digit code', 'error', 2000);
        return;
    }
    
    await joinSpectatorMode(code);
}

// MODIFIED for Firebase
async function handleWatchCodeInput(event) {
    const value = event.target.value.replace(/\D/g, '').slice(0, 6);
    event.target.value = value;
    
    const watchGameBtn = $('watchGameBtn');
    if (watchGameBtn) {
        watchGameBtn.disabled = value.length !== 6;
    }
    
    if (value.length === 6) {
        await validateGameCode(value); // Needs to be async
    } else {
        const message = $('codeValidationMessage');
        if (message) {
            message.classList.add('hidden');
        }
    }
}

// ================== LANDING PAGE ==================
// MODIFIED for Firebase
async function validateGameCode(code) {
    const message = $('codeValidationMessage');
    if (!message) return;

    message.textContent = 'Checking code...';
    message.className = 'validation-message info';
    message.classList.remove('hidden');
    
    const gameExists = await loadGameState(code); // Async call
    
    if (gameExists) {
        message.textContent = 'Game found!';
        message.className = 'validation-message success';
    } else {
        message.textContent = 'Game not found';
        message.className = 'validation-message error';
    }
}

// MODIFIED for Firebase
async function joinSpectatorMode(code) {
    console.log('Joining spectator mode for code:', code);
    const savedGame = await loadGameState(code); // Async call
    if (!savedGame) {
        showToast('Game not found', 'error', 2000);
        return;
    }
    
    appState.gameCode = code;
    appState.game = savedGame;
    appState.gameType = savedGame.gameType || 'friendly';
    appState.isHost = false;
    
    // initBroadcastChannel(); // REMOVED
    showSpectatorView(); // This will now set up the listener
}

// ================== CONFIGURATION VIEW ==================
function showConfigurationView() {
    console.log('✓ Showing configuration view');
    showView('config');
    
    const configGameCode = $('configGameCode');
    if (configGameCode) {
        configGameCode.textContent = appState.gameCode;
    }
    
    setupConfigurationHandlers();
    updateColorPreviews();
}

function updateColorPreviews() {
    const teamAColor = $('teamAColor');
    const teamBColor = $('teamBColor');
    const teamAPreview = $('teamAColorPreview');
    const teamBPreview = $('teamBColorPreview');
    
    if (teamAColor && teamAPreview) {
        teamAPreview.style.backgroundColor = teamAColor.value;
    }
    if (teamBColor && teamBPreview) {
        teamBPreview.style.backgroundColor = teamBColor.value;
    }
}

function setupConfigurationHandlers() {
    console.log('✓ Setting up configuration handlers');
    
    const copyConfigCode = $('copyConfigCode');
    if (copyConfigCode) {
        copyConfigCode.onclick = (event) => {
            event.preventDefault();
            copyToClipboard(appState.gameCode);
        };
    }
    
    const gameTypeRadios = $$('input[name="gameType"]');
    gameTypeRadios.forEach(radio => {
        radio.onchange = (event) => {
            appState.gameType = event.target.value;
            console.log('Game type selected:', appState.gameType);
        };
    });
    
    const shotClockSelect = $('shotClockSelect');
    const customShotClockGroup = $('customShotClockGroup');
    
    if (shotClockSelect && customShotClockGroup) {
        shotClockSelect.onchange = (event) => {
            customShotClockGroup.classList.toggle('hidden', event.target.value !== 'custom');
        };
    }
    
    const teamAColor = $('teamAColor');
    const teamBColor = $('teamBColor');
    
    if (teamAColor) {
        teamAColor.onchange = updateColorPreviews;
    }
    if (teamBColor) {
        teamBColor.onchange = updateColorPreviews;
    }
    
    const backToLandingBtn = $('backToLandingFromConfig');
    const proceedToSetupBtn = $('proceedToSetup');
    
    if (backToLandingBtn) {
        backToLandingBtn.onclick = (event) => {
            event.preventDefault();
            showView('landing');
        };
    }
    
    if (proceedToSetupBtn) {
        proceedToSetupBtn.onclick = (event) => {
            event.preventDefault();
            const config = gatherConfigurationData();
            if (validateConfiguration(config)) {
                appState.game = createGameSkeleton(appState.gameCode, config);
                saveGameState(); // Initial save to Firebase
                
                if (appState.gameType === 'friendly') {
                    initializeFriendlyGame();
                    showControlView();
                } else {
                    showTeamSetupView();
                }
            }
        };
    }
}

function gatherConfigurationData() {
    const gameName = $('gameNameInput')?.value.trim() || 'Basketball Game';
    const periodDuration = parseInt($('periodDurationSelect')?.value || '12');
    const shotClockSelect = $('shotClockSelect')?.value;
    let shotClockDuration = 24;
    
    if (shotClockSelect === 'custom') {
        shotClockDuration = parseInt($('customShotClock')?.value || '24');
    } else {
        shotClockDuration = parseInt(shotClockSelect);
    }
    
    const teamAName = $('teamAName')?.value.trim() || 'Team A';
    const teamBName = $('teamBName')?.value.trim() || 'Team B';
    const teamAColor = $('teamAColor')?.value || '#FF6B35';
    const teamBColor = $('teamBColor')?.value || '#1B263B';
    
    return {
        gameName, periodDuration, shotClockDuration, timeoutsPerTeam: 7,
        teamAName, teamBName, teamAColor, teamBColor
    };
}

function validateConfiguration(config) {
    if (config.shotClockDuration < 0 || config.shotClockDuration > 60) {
        showToast('Shot clock: 0-60 seconds (0 = disabled)', 'error', 3000);
        return false;
    }
    
    if (config.teamAName === config.teamBName) {
        showToast('Team names must be different', 'error', 2000);
        return false;
    }
    
    if (config.teamAColor === config.teamBColor) {
        showToast('Team colors must be different', 'error', 2000);
        return false;
    }
    
    return true;
}

function initializeFriendlyGame() {
    appState.game.teamA.stats = {};
    appState.game.teamB.stats = {};
    showToast('Friendly game ready!', 'success', 1500);
}

// ================== TEAM SETUP VIEW ==================
function showTeamSetupView() {
    console.log('Showing team setup view');
    showView('setup');
    
    const setupGameCode = $('setupGameCode');
    if (setupGameCode) {
        setupGameCode.textContent = appState.gameCode;
    }
    
    updateTeamSetupTitles();
    setupTeamSetupHandlers();
    updateRosterDisplays();
}

function updateTeamSetupTitles() {
    const teamATitle = $('teamASetupTitle');
    const teamBTitle = $('teamBSetupTitle');
    
    if (teamATitle && appState.game) {
        teamATitle.textContent = appState.game.teamA.name;
        teamATitle.style.color = appState.game.teamA.color;
    }
    
    if (teamBTitle && appState.game) {
        teamBTitle.textContent = appState.game.teamB.name;
        teamBTitle.style.color = appState.game.teamB.color;
    }
}

function setupTeamSetupHandlers() {
    console.log('Setting up team setup handlers');
    
    const copySetupCode = $('copySetupCode');
    if (copySetupCode) {
        copySetupCode.onclick = (event) => {
            event.preventDefault();
            copyToClipboard(appState.gameCode);
        };
    }
    
    const addTeamABtn = $('addTeamAPlayer');
    const addTeamBBtn = $('addTeamBPlayer');
    
    if (addTeamABtn) {
        addTeamABtn.onclick = (event) => {
            event.preventDefault();
            addPlayer('teamA');
        };
    }
    if (addTeamBBtn) {
        addTeamBBtn.onclick = (event) => {
            event.preventDefault();
            addPlayer('teamB');
        };
    }
    
    const backToConfigBtn = $('backToConfig');
    const skipRosterBtn = $('skipRosterSetup');
    const startGameBtn = $('startGame');
    
    if (backToConfigBtn) {
        backToConfigBtn.onclick = (event) => {
            event.preventDefault();
            showView('config');
        };
    }
    
    if (skipRosterBtn) {
        skipRosterBtn.onclick = (event) => {
            event.preventDefault();
            initializeFriendlyGame();
            saveGameState(); // Save the friendly game setup
            showControlView();
        };
    }
    
    if (startGameBtn) {
        startGameBtn.onclick = (event) => {
            event.preventDefault();
            if (validateTeamSetup()) {
                initializePlayerStats();
                saveGameState(); // Save the roster and stats setup
                showControlView();
            }
        };
    }
}

function addPlayer(team) {
    console.log('Adding player to team:', team);
    const numberInput = $(`${team}PlayerNumber`);
    const nameInput = $(`${team}PlayerName`);
    const positionSelect = $(`${team}PlayerPosition`);
    
    const number = parseInt(numberInput?.value);
    const name = nameInput?.value.trim();
    const position = positionSelect?.value || '';
    
    if (!validatePlayerInput(team, number, name)) {
        return;
    }
    
    const player = { number, name, position };
    appState.game[team].roster.push(player);
    
    if (numberInput) numberInput.value = '';
    if (nameInput) nameInput.value = '';
    if (positionSelect) positionSelect.value = '';
    
    updateRosterDisplays();
    saveGameState(); // Sync new roster
    showToast(`${name} added`, 'success', 1500);
}

function validatePlayerInput(team, number, name) {
    if (!number || number < 0 || number > 99 || isNaN(number)) {
        showToast('Jersey #: 0-99', 'error', 2000);
        return false;
    }
    
    if (!name) {
        showToast('Player name required', 'error', 2000);
        return false;
    }
    
    if (appState.game[team].roster.length >= 15) {
        showToast('Max 15 players per team', 'error', 2000);
        return false;
    }
    
    const existingPlayer = appState.game[team].roster.find(p => p.number === number);
    if (existingPlayer) {
        showToast(`#${number} already taken`, 'error', 2000);
        return false;
    }
    
    return true;
}

function updateRosterDisplays() {
    updateTeamRoster('teamA');
    updateTeamRoster('teamB');
    updateStartGameButton();
}

function updateTeamRoster(team) {
    const rosterContainer = $(`${team}Roster`);
    const countElement = $(`${team}Count`);
    
    if (!rosterContainer || !appState.game) return;
    
    const roster = appState.game[team].roster;
    
    rosterContainer.innerHTML = '';
    
    roster.forEach((player, index) => {
        const rosterItem = document.createElement('div');
        rosterItem.className = 'roster-item';
        
        rosterItem.innerHTML = `
            <div class="roster-info">
                <div class="roster-number">${player.number}</div>
                <div class="roster-details">
                    <div class="roster-name">${player.name}</div>
                    ${player.position ? `<div class="roster-position">${player.position}</div>` : ''}
                </div>
            </div>
            <button class="remove-player" onclick="removePlayer('${team}', ${index})" title="Remove Player">✕</button>
        `;
        
        rosterContainer.appendChild(rosterItem);
    });
    
    if (countElement) {
        countElement.textContent = roster.length;
    }
}

function removePlayer(team, index) {
    if (appState.game && appState.game[team].roster[index]) {
        const playerName = appState.game[team].roster[index].name;
        appState.game[team].roster.splice(index, 1);
        updateRosterDisplays();
        saveGameState(); // Sync removed player
        showToast(`${playerName} removed`, 'info', 1500);
    }
}

function validateTeamSetup() {
    const teamARoster = appState.game.teamA.roster.length;
    const teamBRoster = appState.game.teamB.roster.length;
    
    if (teamARoster < 1 || teamBRoster < 1) {
        showToast('Each team needs at least 1 player', 'error', 2000);
        return false;
    }
    
    return true;
}

function updateStartGameButton() {
    const startGameBtn = $('startGame');
    if (!startGameBtn || !appState.game) return;
    
    const teamARoster = appState.game.teamA.roster.length;
    const teamBRoster = appState.game.teamB.roster.length;
    
    startGameBtn.disabled = teamARoster < 1 || teamBRoster < 1;
}

function initializePlayerStats() {
    ['teamA', 'teamB'].forEach(team => {
        appState.game[team].roster.forEach(player => {
            appState.game[team].stats[player.number] = {
                freeThrows: 0,
                fieldGoals: 0,
                threePointers: 0,
                offensiveRebounds: 0,
                defensiveRebounds: 0,
                assists: 0,
                steals: 0,
                blocks: 0,
                turnovers: 0,
                fouls: 0,
                minutes: 0,
                totalPoints: 0
            };
        });
    });
}

// ================== ENHANCED CONTROL VIEW (NOW WITH LISTENER) ==================
function showControlView() {
    console.log('Showing control view');
    showView('control');
    
    const controlGameCode = $('controlGameCode');
    const gameNameDisplay = $('gameNameDisplay');
    
    if (controlGameCode) {
        controlGameCode.textContent = appState.gameCode;
    }
    
    if (gameNameDisplay && appState.game) {
        gameNameDisplay.textContent = appState.game.settings.gameName;
    }
    
    const shotClockSection = $('shotClockSection');
    const viewerShotClock = $('viewerShotClock');
    if (appState.game.settings.shotClockDuration === 0) {
        if (shotClockSection) shotClockSection.classList.add('hidden');
        if (viewerShotClock) viewerShotClock.style.display = 'none';
    } else {
        if (shotClockSection) shotClockSection.classList.remove('hidden');
        if (viewerShotClock) viewerShotClock.style.display = 'block';
    }
    
    const statsSection = $('statsSection');
    if (statsSection) {
        if (appState.game.gameType === 'full') {
            statsSection.classList.add('show');
            setupPlayerScoringGrid();
            setupQuickStatControls();
            updateComprehensiveStatsTable();
        } else {
            statsSection.classList.remove('show');
        }
    }
    
    setupControlHandlers();
    updateControlDisplay();
    updateMasterStartButton();
    setupAutoSave();

    // ADDED: Firestore listener for Control Panel
    // This keeps the host in sync if they have multiple control panels open
    // or if they refresh the page.
    if (db && appState.gameCode) {
        if (appState.firestoreListener) appState.firestoreListener(); // Detach old listener

        appState.firestoreListener = db.collection('games').doc(appState.gameCode)
          .onSnapshot((doc) => {
              console.log('ControlView received snapshot');
              if (doc.exists) {
                  const oldState = appState.game.gameState;
                  appState.game = doc.data();
                  
                  // Update all UI elements
                  updateControlDisplay();
                  if (appState.game.gameType === 'full') {
                      setupPlayerScoringGrid();
                      updateComprehensiveStatsTable();
                  }

                  // Check if timer state has changed FROM FIREBASE
                  const newState = appState.game.gameState;
                  if (
                      (newState.gameRunning || newState.shotClockRunning) && 
                      !appState.timers.masterTimer
                  ) {
                      // Clocks are running in DB, but not locally. Start local timer.
                      startMasterTimer();
                  } else if (
                      !newState.gameRunning && !newState.shotClockRunning && 
                      appState.timers.masterTimer
                  ) {
                      // Clocks are stopped in DB, but running locally. Stop local timer.
                      stopMasterTimer();
                  }
                  
              } else {
                  showToast('Game session not found', 'error', 3000);
                  showView('landing');
              }
          }, (error) => {
              console.error("Error in Firestore listener:", error);
              showToast('Connection lost', 'error', 3000);
          });
    }
}

// ================== COMPREHENSIVE STATISTICS SYSTEM ==================
function setupPlayerScoringGrid() {
    const playerScoringGrid = $('playerScoringGrid');
    if (!playerScoringGrid || !appState.game) return;
    
    const statTeamSelect = $('statTeamSelect');
    const selectedTeam = statTeamSelect?.value || 'teamA';
    
    playerScoringGrid.innerHTML = '';
    
    const roster = appState.game[selectedTeam].roster;
    if (roster.length === 0) {
        playerScoringGrid.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary);">No players added yet</p>';
        return;
    }
    
    roster.forEach(player => {
        const playerStats = appState.game[selectedTeam].stats[player.number] || {
            totalPoints: 0, freeThrows: 0, fieldGoals: 0, threePointers: 0,
            offensiveRebounds: 0, defensiveRebounds: 0, assists: 0, steals: 0,
            blocks: 0, turnovers: 0, fouls: 0
        };
        
        const totalRebounds = playerStats.offensiveRebounds + playerStats.defensiveRebounds;
        
        const playerCard = document.createElement('div');
        playerCard.className = 'player-score-card';
        playerCard.innerHTML = `
            <div class="player-info">
                <div class="player-number">${player.number}</div>
                <div class="player-name">${player.name}</div>
            </div>
            <div class="player-stats">
                ${playerStats.totalPoints} PTS • ${playerStats.freeThrows} FT • ${playerStats.fieldGoals} 2PT • ${playerStats.threePointers} 3PT<br>
                ${totalRebounds} REB • ${playerStats.assists} AST • ${playerStats.steals} STL • ${playerStats.blocks} BLK • ${playerStats.turnovers} TO
            </div>
            <div class="player-scoring-buttons">
                <button class="btn btn--sm btn--score-1" onclick="addPlayerScore('${selectedTeam}', ${player.number}, 'freeThrows', 1)">+1</button>
                <button class="btn btn--sm btn--score-2" onclick="addPlayerScore('${selectedTeam}', ${player.number}, 'fieldGoals', 2)">+2</button>
                <button class="btn btn--sm btn--score-3" onclick="addPlayerScore('${selectedTeam}', ${player.number}, 'threePointers', 3)">+3</button>
            </div>
        `;
        
        playerScoringGrid.appendChild(playerCard);
    });
}

function setupQuickStatControls() {
    const quickStatPlayer = $('quickStatPlayer');
    const statTeamSelect = $('statTeamSelect');
    
    if (!quickStatPlayer || !statTeamSelect) return;
    
    const updateQuickStatPlayers = () => {
        const selectedTeam = statTeamSelect.value;
        const roster = appState.game[selectedTeam].roster;
        
        quickStatPlayer.innerHTML = '<option value="">Select Player</option>';
        roster.forEach(player => {
            const option = document.createElement('option');
            option.value = player.number;
            option.textContent = `#${player.number} ${player.name}`;
            quickStatPlayer.appendChild(option);
        });
    };
    
    statTeamSelect.onchange = () => {
        setupPlayerScoringGrid();
        updateComprehensiveStatsTable();
        updateQuickStatPlayers();
    };
    
    updateQuickStatPlayers();
    
    $$('.stat-btn').forEach(btn => {
        btn.onclick = (event) => {
            event.preventDefault();
            const selectedTeam = statTeamSelect.value;
            const playerNumber = quickStatPlayer.value;
            const statType = event.target.dataset.stat;
            
            if (!playerNumber) {
                showToast('Select a player first', 'warning', 2000);
                return;
            }
            
            addPlayerStat(selectedTeam, playerNumber, statType);
        };
    });
}

function addPlayerScore(team, playerNumber, statType, points) {
    if (!appState.game || !appState.game[team].stats[playerNumber]) return;
    
    const playerStats = appState.game[team].stats[playerNumber];
    const playerName = appState.game[team].roster.find(p => p.number == playerNumber)?.name || `#${playerNumber}`;
    
    playerStats[statType]++;
    playerStats.totalPoints += points;
    
    appState.game[team].score += points;
    
    showScoreAnimation(points, team);
    
    setupPlayerScoringGrid();
    updateControlDisplay();
    updateTopScorerDisplay();
    updateComprehensiveStatsTable();
    saveGameState(); // Sync new score
    
    const statDisplay = statType === 'freeThrows' ? 'Free Throw' : 
                        statType === 'fieldGoals' ? 'Field Goal' : '3-Pointer';
    showToast(`+${points} ${statDisplay} for ${playerName}`, 'success', 1500);
}

function addPlayerStat(team, playerNumber, statType) {
    if (!appState.game || !appState.game[team].stats[playerNumber]) return;
    
    const playerStats = appState.game[team].stats[playerNumber];
    const playerName = appState.game[team].roster.find(p => p.number == playerNumber)?.name || `#${playerNumber}`;
    
    playerStats[statType]++;
    
    setupPlayerScoringGrid();
    updateComprehensiveStatsTable();
    saveGameState(); // Sync new stat
    
    const statNames = {
        'offensiveRebounds': 'Offensive Rebound',
        'defensiveRebounds': 'Defensive Rebound', 
        'assists': 'Assist',
        'steals': 'Steal',
        'blocks': 'Block',
        'turnovers': 'Turnover',
        'fouls': 'Personal Foul'
    };
    
    showToast(`${statNames[statType]} for ${playerName}`, 'success', 1500);
}

function updateComprehensiveStatsTable() {
    const tableBody = $('comprehensiveStatsTableBody');
    if (!tableBody || !appState.game || appState.game.gameType !== 'full') return;
    
    tableBody.innerHTML = '';
    
    const teamSelect = $('statTeamSelect');
    const selectedTeam = teamSelect?.value || 'teamA';
    
    appState.game[selectedTeam].roster.forEach(player => {
        const stats = appState.game[selectedTeam].stats[player.number] || {
            freeThrows: 0, fieldGoals: 0, threePointers: 0, 
            offensiveRebounds: 0, defensiveRebounds: 0, assists: 0, 
            steals: 0, blocks: 0, turnovers: 0, fouls: 0, 
            minutes: 0, totalPoints: 0
        };
        
        const totalRebounds = stats.offensiveRebounds + stats.defensiveRebounds;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${player.number}</td>
            <td style="text-align: left; padding-left: 8px;">${player.name}</td>
            <td>${stats.totalPoints}</td>
            <td>${stats.freeThrows}</td>
            <td>${stats.fieldGoals}</td>
            <td>${stats.threePointers}</td>
            <td>${stats.offensiveRebounds}</td>
            <td>${stats.defensiveRebounds}</td>
            <td>${totalRebounds}</td>
            <td>${stats.assists}</td>
            <td>${stats.steals}</td>
            <td>${stats.blocks}</td>
            <td>${stats.turnovers}</td>
            <td>${stats.fouls}</td>
            <td>${stats.minutes}</td>
        `;
        
        tableBody.appendChild(row);
    });
}

function setupControlHandlers() {
    console.log('Setting up control handlers');
    
    const copyControlCode = $('copyControlCode');
    if (copyControlCode) {
        copyControlCode.onclick = (event) => {
            event.preventDefault();
            copyToClipboard(appState.gameCode);
        };
    }
    
    const startGameBtn = $('startGameBtn');
    if (startGameBtn) {
        startGameBtn.onclick = (event) => {
            event.preventDefault();
            toggleMasterGame();
        };
    }
    
    const resetAllBtn = $('resetAllBtn');
    if (resetAllBtn) {
        resetAllBtn.onclick = (event) => {
            event.preventDefault();
            resetAllClocks();
        };
    }
    
    const editGameClock = $('editGameClock');
    if (editGameClock) {
        editGameClock.onclick = (event) => {
            event.preventDefault();
            showEditClockModal();
        };
    }
    
    const gameClockDisplay = $('gameClockDisplay');
    if (gameClockDisplay) {
        gameClockDisplay.onclick = (event) => {
            event.preventDefault();
            showEditClockModal();
        };
    }
    
    const shotClockDisplay = $('shotClockDisplay');
    const editShotClock = $('editShotClock');
    if (shotClockDisplay) {
        shotClockDisplay.onclick = (event) => {
            event.preventDefault();
            showEditShotClockModal();
        };
    }
    if (editShotClock) {
        editShotClock.onclick = (event) => {
            event.preventDefault();
            showEditShotClockModal();
        };
    }
    
    const nextPeriod = $('nextPeriod');
    if (nextPeriod) {
        nextPeriod.onclick = (event) => {
            event.preventDefault();
            nextPeriodFunc();
        };
    }
    
    const resetShotClock14 = $('resetShotClock14');
    const resetShotClock24 = $('resetShotClock24');
    const startShotClock = $('startShotClock');
    
    if (resetShotClock14) {
        resetShotClock14.onclick = (event) => {
            event.preventDefault();
            resetShotClockTo14();
        };
    }
    
    if (resetShotClock24) {
        resetShotClock24.onclick = (event) => {
            event.preventDefault();
            resetShotClockTo24();
        };
    }
    
    if (startShotClock) {
        startShotClock.onclick = (event) => {
            event.preventDefault();
            startShotClockOnly();
        };
    }
    
    $$('.score-btn').forEach(btn => {
        btn.onclick = (event) => {
            event.preventDefault();
            const team = event.target.dataset.team;
            const points = parseInt(event.target.dataset.points);
            updateScore(team, points);
        };
    });
    
    $$('[data-action]').forEach(btn => {
        btn.onclick = (event) => {
            event.preventDefault();
            const action = event.target.dataset.action;
            const team = event.target.dataset.team;
            handleCounterAction(action, team);
        };
    });
    
    const possessionTeamA = $('possessionTeamA');
    const possessionTeamB = $('possessionTeamB');
    
    if (possessionTeamA) {
        possessionTeamA.onclick = (event) => {
            event.preventDefault();
            setPossession('teamA');
        };
    }
    if (possessionTeamB) {
        possessionTeamB.onclick = (event) => {
            event.preventDefault();
            setPossession('teamB');
        };
    }
    
    const exportBtn = $('exportGame');
    if (exportBtn) {
        exportBtn.onclick = (event) => {
            event.preventDefault();
            exportGameData();
        };
    }
}

function nextPeriodFunc() {
    if (!appState.game) return;
    
    appState.game.gameState.period++;
    appState.game.gameState.gameTime.minutes = appState.game.settings.periodDuration;
    appState.game.gameState.gameTime.seconds = 0;
    
    if (appState.game.settings.shotClockDuration > 0) {
        appState.game.gameState.shotClock = appState.game.settings.shotClockDuration;
    }
    
    appState.game.gameState.gameRunning = false;
    appState.game.gameState.shotClockRunning = false;
    stopMasterTimer();
    
    updateControlDisplay();
    // updateSpectatorView(); // Listener will handle
    updateMasterStartButton();
    saveGameState();
    
    showToast(`Period ${appState.game.gameState.period} started`, 'info', 2000);
}

function updateScore(team, points) {
    if (!appState.game) return;
    
    const newScore = Math.max(0, appState.game[team].score + points);
    appState.game[team].score = newScore;
    
    showScoreAnimation(points, team);
    updateControlDisplay();
    updateTopScorerDisplay();
    saveGameState();
}

function showScoreAnimation(points, team) {
    const scoreElement = $(`${team}Score`);
    if (!scoreElement) return;
    
    const rect = scoreElement.getBoundingClientRect();
    const animation = document.createElement('div');
    animation.className = 'score-animation';
    animation.textContent = points > 0 ? `+${points}` : points.toString();
    animation.style.position = 'fixed';
    animation.style.left = `${rect.left + rect.width / 2 - 20}px`;
    animation.style.top = `${rect.top + rect.height / 2 - 20}px`;
    animation.style.color = points > 0 ? 'var(--color-success)' : 'var(--color-error)';
    animation.style.zIndex = '1500';
    
    document.body.appendChild(animation);
    
    setTimeout(() => {
        if (animation.parentNode) {
            animation.parentNode.removeChild(animation);
        }
    }, 1500);
}

function updateControlDisplay() {
    if (!appState.game) return;
    
    const teamAScore = $('teamAScore');
    const teamBScore = $('teamBScore');
    const teamAName = $('teamAName');
    const teamBName = $('teamBName');
    
    if (teamAScore) teamAScore.textContent = appState.game.teamA.score;
    if (teamBScore) teamBScore.textContent = appState.game.teamB.score;
    if (teamAName) teamAName.textContent = appState.game.teamA.name;
    if (teamBName) teamBName.textContent = appState.game.teamB.name;
    
    const gameClockDisplay = $('gameClockDisplay');
    if (gameClockDisplay) {
        gameClockDisplay.textContent = formatTime(
            appState.game.gameState.gameTime.minutes,
            appState.game.gameState.gameTime.seconds
        );
    }
    
    const shotClockDisplay = $('shotClockDisplay');
    if (shotClockDisplay && appState.game.settings.shotClockDuration > 0) {
        shotClockDisplay.textContent = appState.game.gameState.shotClock;
    }
    
    const periodDisplay = $('periodDisplay');
    if (periodDisplay) {
        periodDisplay.textContent = appState.game.gameState.period;
    }
    
    const teamATimeouts = $('teamATimeouts');
    const teamBTimeouts = $('teamBTimeouts');
    const teamAFouls = $('teamAFouls');
    const teamBFouls = $('teamBFouls');
    
    if (teamATimeouts) teamATimeouts.textContent = appState.game.teamA.timeouts;
    if (teamBTimeouts) teamBTimeouts.textContent = appState.game.teamB.timeouts;
    if (teamAFouls) teamAFouls.textContent = appState.game.teamA.fouls;
    if (teamBFouls) teamBFouls.textContent = appState.game.teamB.fouls;
    
    updatePossessionDisplay();
    updateTopScorerDisplay();
    
    if (appState.game.gameType === 'full') {
        updateComprehensiveStatsTable();
    }
}

function handleCounterAction(action, team) {
    if (!appState.game) return;
    
    const [type, operation] = action.split('-');
    const change = operation === 'plus' ? 1 : -1;
    
    if (type === 'timeout') {
        appState.game[team].timeouts = Math.max(0, Math.min(7, appState.game[team].timeouts + change));
    } else if (type === 'foul') {
        appState.game[team].fouls = Math.max(0, appState.game[team].fouls + change);
    }
    
    updateControlDisplay();
    saveGameState();
}

function setPossession(team) {
    if (!appState.game) return;
    
    appState.game.gameState.possession = team;
    updatePossessionDisplay();
    saveGameState();
}

function updatePossessionDisplay() {
    const possessionTeamA = $('possessionTeamA');
    const possessionTeamB = $('possessionTeamB');
    
    if (possessionTeamA && possessionTeamB && appState.game) {
        const isTeamA = appState.game.gameState.possession === 'teamA';
        
        possessionTeamA.classList.toggle('active', isTeamA);
        possessionTeamB.classList.toggle('active', !isTeamA);
        
        possessionTeamA.textContent = appState.game.teamA.name;
        possessionTeamB.textContent = appState.game.teamB.name;
    }
}

function exportGameData() {
    if (!appState.game || typeof XLSX === 'undefined') {
        showToast('Export not available', 'error', 2000);
        return;
    }
    
    try {
        const workbook = XLSX.utils.book_new();
        
        if (appState.game.gameType === 'full') {
            const boxScoreData = createComprehensiveBoxScoreData();
            const worksheet = XLSX.utils.aoa_to_sheet(boxScoreData);
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Comprehensive Box Score');
        } else {
            const basicData = createBasicGameData();
            const worksheet = XLSX.utils.aoa_to_sheet(basicData);
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Game Summary');
        }
        
        const fileName = `${appState.game.settings.gameName.replace(/\s+/g, '_')}_${appState.game.gameType === 'full' ? 'Full' : 'Friendly'}_Game.xlsx`;
        XLSX.writeFile(workbook, fileName);
        
        showToast('Data exported successfully!', 'success', 2000);
    } catch (error) {
        console.error('Export error:', error);
        showToast('Export failed', 'error', 2000);
    }
}

function createBasicGameData() {
    const data = [];
    
    data.push([appState.game.settings.gameName]);
    data.push([`${appState.game.teamA.name} vs ${appState.game.teamB.name}`]);
    data.push(['Basketball Game Summary']);
    data.push(['']);
    
    data.push(['Final Score']);
    data.push([appState.game.teamA.name, appState.game.teamA.score]);
    data.push([appState.game.teamB.name, appState.game.teamB.score]);
    data.push(['']);
    
    data.push(['Game Stats']);
    data.push(['Period', appState.game.gameState.period]);
    data.push(['Game Time', formatTime(appState.game.gameState.gameTime.minutes, appState.game.gameState.gameTime.seconds)]);
    if (appState.game.settings.shotClockDuration > 0) {
        data.push(['Shot Clock', appState.game.gameState.shotClock]);
    }
    
    return data;
}

function createComprehensiveBoxScoreData() {
    const data = [];
    
    data.push([appState.game.settings.gameName]);
    data.push([`${appState.game.teamA.name} vs ${appState.game.teamB.name}`]);
    data.push(['Comprehensive Basketball Statistics']);
    data.push(['']);
    
    data.push([appState.game.teamA.name]);
    data.push(['#', 'Player', 'PTS', 'FT', '2PT', '3PT', 'ORB', 'DRB', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF', 'MIN']);
    
    appState.game.teamA.roster.forEach(player => {
        const stats = appState.game.teamA.stats[player.number] || {
            totalPoints: 0, freeThrows: 0, fieldGoals: 0, threePointers: 0,
            offensiveRebounds: 0, defensiveRebounds: 0, assists: 0, steals: 0, 
            blocks: 0, turnovers: 0, fouls: 0, minutes: 0
        };
        const totalRebounds = stats.offensiveRebounds + stats.defensiveRebounds;
        data.push([
            player.number, player.name, stats.totalPoints, stats.freeThrows, 
            stats.fieldGoals, stats.threePointers, stats.offensiveRebounds, 
            stats.defensiveRebounds, totalRebounds, stats.assists, stats.steals, 
            stats.blocks, stats.turnovers, stats.fouls, stats.minutes
        ]);
    });
    
    data.push(['']);
    
    data.push([appState.game.teamB.name]);
    data.push(['#', 'Player', 'PTS', 'FT', '2PT', '3PT', 'ORB', 'DRB', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF', 'MIN']);
    
    appState.game.teamB.roster.forEach(player => {
        const stats = appState.game.teamB.stats[player.number] || {
            totalPoints: 0, freeThrows: 0, fieldGoals: 0, threePointers: 0,
            offensiveRebounds: 0, defensiveRebounds: 0, assists: 0, steals: 0, 
            blocks: 0, turnovers: 0, fouls: 0, minutes: 0
        };
        const totalRebounds = stats.offensiveRebounds + stats.defensiveRebounds;
        data.push([
            player.number, player.name, stats.totalPoints, stats.freeThrows, 
            stats.fieldGoals, stats.threePointers, stats.offensiveRebounds, 
            stats.defensiveRebounds, totalRebounds, stats.assists, stats.steals, 
            stats.blocks, stats.turnovers, stats.fouls, stats.minutes
        ]);
    });
    
    data.push(['']);
    data.push(['Final Score']);
    data.push([appState.game.teamA.name, appState.game.teamA.score]);
    data.push([appState.game.teamB.name, appState.game.teamB.score]);
    
    return data;
}

// MODIFIED for Firebase (Added Listener)
function showSpectatorView() {
    console.log('Showing spectator view');
    showView('viewer');
    
    // Show initial data first
    if(appState.game) {
        updateSpectatorView();
    }

    // ADDED: Firestore listener for Spectator View
    if (db && appState.gameCode) {
        if (appState.firestoreListener) appState.firestoreListener(); // Detach old listener

        appState.firestoreListener = db.collection('games').doc(appState.gameCode)
          .onSnapshot((doc) => {
              console.log('SpectatorView received snapshot');
              if (doc.exists) {
                  const oldState = appState.game ? appState.game.gameState : null;
                  appState.game = doc.data();
                  
                  // Update all UI elements
                  updateSpectatorView();

                  // Check if timer state has changed FROM FIREBASE
                  const newState = appState.game.gameState;
                  if (
                      (newState.gameRunning || newState.shotClockRunning) && 
                      !appState.timers.masterTimer
                  ) {
                      // Clocks are running in DB, but not locally. Start local timer.
                      startMasterTimer();
                  } else if (
                      !newState.gameRunning && !newState.shotClockRunning && 
                      appState.timers.masterTimer
                  ) {
                      // Clocks are stopped in DB, but running locally. Stop local timer.
                      stopMasterTimer();
                  }

              } else {
                  showToast('Game session has ended', 'error', 3000);
                  showView('landing');
              }
          }, (error) => {
              console.error("Error in Firestore listener:", error);
              showToast('Connection lost', 'error', 3000);
          });
    }
}

function updateSpectatorView() {
    if (!appState.game) return;
    
    const viewerTeamAName = $('viewerTeamAName');
    const viewerTeamBName = $('viewerTeamBName');
    const viewerTeamAScore = $('viewerTeamAScore');
    const viewerTeamBScore = $('viewerTeamBScore');
    
    if (viewerTeamAName) viewerTeamAName.textContent = appState.game.teamA.name;
    if (viewerTeamBName) viewerTeamBName.textContent = appState.game.teamB.name;
    if (viewerTeamAScore) viewerTeamAScore.textContent = appState.game.teamA.score;
    if (viewerTeamBScore) viewerTeamBScore.textContent = appState.game.teamB.score;
    
    const viewerGameClock = $('viewerGameClock');
    if (viewerGameClock) {
        viewerGameClock.textContent = formatTime(
            appState.game.gameState.gameTime.minutes,
            appState.game.gameState.gameTime.seconds
        );
    }
    
    const viewerShotClock = $('viewerShotClock');
    if (viewerShotClock && appState.game.settings.shotClockDuration > 0) {
        viewerShotClock.textContent = appState.game.gameState.shotClock;
        viewerShotClock.style.display = 'block';
    } else if (viewerShotClock) {
        viewerShotClock.style.display = 'none';
    }
    
    const viewerPeriod = $('viewerPeriod');
    if (viewerPeriod) {
        viewerPeriod.textContent = appState.game.gameState.period;
    }
    
    const viewerGameName = $('viewerGameName');
    if (viewerGameName) {
        viewerGameName.textContent = appState.game.settings.gameName;
    }
    
    const viewerPossession = $('viewerPossession');
    if (viewerPossession) {
        const possessionTeam = appState.game.gameState.possession === 'teamA' ? 
            appState.game.teamA.name : appState.game.teamB.name;
        viewerPossession.textContent = possessionTeam;
    }
    
    updateTopScorerDisplay();
}

// MODIFIED for Firebase (Only host runs autosave)
function setupAutoSave() {
    if (appState.timers.autoSave) {
        clearInterval(appState.timers.autoSave);
    }
    if (appState.isHost) {
        appState.timers.autoSave = setInterval(saveGameState, 30000);
    }
}

// ================== FIXED INITIALIZATION ==================
function initializeApp() {
    console.log('Basketball Scoreboard Pro Enhanced (Firebase) - Initializing...');
    
    const initialize = () => {
        try {
            console.log('✓ DOM ready, setting up event handlers...');
            
            const createGameBtn = $('createGameBtn');
            const watchGameBtn = $('watchGameBtn');
            const watchCodeInput = $('watchCodeInput');
            
            if (createGameBtn) {
                createGameBtn.addEventListener('click', handleCreateGame);
                console.log('✓ Create game button handler attached');
            } else {
                console.error('✗ Create game button not found');
            }
            
            if (watchGameBtn) {
                watchGameBtn.addEventListener('click', handleWatchGame);
                console.log('✓ Watch game button handler attached');
            } else {
                console.error('✗ Watch game button not found');
            }
            
            if (watchCodeInput) {
                watchCodeInput.addEventListener('input', handleWatchCodeInput);
                console.log('✓ Watch code input handler attached');
            } else {
                console.error('✗ Watch code input not found');
            }
            
            showView('landing');
            
            window.addEventListener('beforeunload', () => {
                stopMasterTimer();
                if (appState.timers.autoSave) clearInterval(appState.timers.autoSave);
                if (appState.firestoreListener) appState.firestoreListener(); // Detach listener
            });
            
            console.log('✓ Basketball Scoreboard Pro Enhanced (Firebase) - Ready!');
            
        } catch (error) {
            console.error('✗ Error during initialization:', error);
            showToast('Application error - please refresh', 'error', 5000);
        }
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
}

// Make functions globally available for onclick handlers
window.removePlayer = removePlayer;
window.addPlayerScore = addPlayerScore;

// Start the application
initializeApp();