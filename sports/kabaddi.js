// This file exports ONE object: the 'kabaddi' module.
// (Apply the same logic to basketball.js)

import { db } from '../modules/firebase.js';

let $;
let $$;
let showToast;
let copyToClipboard;

// ================== MODULE-SPECIFIC STATE ==================
const state = {
    view: 'config', // Default view
    isHost: false,
    user: null, 
    gameCode: null,
    game: null,
    gameType: 'easy', 
    timers: {
        gameTimer: null,
        raidTimer: null,
        autoSave: null
    },
    clockEditing: false,
    firestoreListener: null
};

// ================== HTML BUILDER ==================
function buildHtml() {
    // NO LANDING VIEW
    return `
    <section id="config-view" class="view hidden">
        <div class="container">
            <header class="section-header">
                <div>
                    <h2>Game Configuration</h2>
                    <p>Set up your Kabaddi game parameters</p>
                </div>
                <div class="game-code-display">
                    <span class="status status--info">
                        Game Code: <span id="configGameCode">...</span>
                    </span>
                    <button id="copyConfigCode" class="btn btn--outline btn--sm">Copy</button>
                </div>
            </header>
            
            <div class="config-grid">
                <div class="card">
                    <div class="card__body">
                        <h3>1. Game Type</h3>
                        <div class="game-type-selection">
                            <label class="game-type-option">
                                <input type="radio" name="gameType" value="easy" checked>
                                <div class="game-type-card">
                                    <div class="game-type-icon">👍</div>
                                    <h4>Easy Game</h4>
                                    <p>Simple scoring, no player tracking.</p>
                                </div>
                            </label>
                            <label class="game-type-option">
                                <input type="radio" name="gameType" value="advanced">
                                <div class="game-type-card">
                                    <div class="game-type-icon">📊</div>
                                    <h4>Advanced Game</h4>
                                    <p>Full game with player stats & revival.</p>
                                </div>
                            </label>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card__body">
                        <h3>2. Game Settings</h3>
                        <div class="form-group">
                            <label class="form-label" for="gameNameInput">Game Name</label>
                            <input id="gameNameInput" class="form-control" placeholder="Kabaddi Championship" maxlength="50">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="halfDurationSelect">Half Duration</label>
                                <select id="halfDurationSelect" class="form-control">
                                    <option value="15">15 minutes</option>
                                    <option value="20" selected>20 minutes</option>
                                    <option value="25">25 minutes</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="raidClockSelect">Raid Clock</label>
                                <select id="raidClockSelect" class="form-control">
                                    <option value="20">20 seconds</option>
                                    <option value="25">25 seconds</option>
                                    <option value="30" selected>30 seconds</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Clock Options</label>
                            <div class="form-check">
                                <input type="checkbox" id="enableGameClock" checked>
                                <label for="enableGameClock">Enable Game Clock</label>
                            </div>
                            <div class="form-check">
                                <input type="checkbox" id="enableRaidClock" checked>
                                <label for="enableRaidClock">Enable Raid Clock</label>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card__body">
                        <h3>3. Team Configuration</h3>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="teamAName">Team A Name</label>
                                <input id="teamAName" class="form-control" placeholder="Team A" maxlength="20">
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="teamAColor">Team A Color</label>
                                <input id="teamAColor" class="form-control color-input" type="color" value="#FF6B35">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="teamBName">Team B Name</label>
                                <input id="teamBName" class="form-control" placeholder="Team B" maxlength="20">
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="teamBColor">Team B Color</label>
                                <input id="teamBColor" class="form-control color-input" type="color" value="#1B263B">
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="section-actions">
                <button id="proceedToSetup" class="btn btn--primary">Create or Resume Game</button>
            </div>
        </div>
    </section>

    <section id="setup-view" class="view hidden">
        <div class="container">
            <header class="section-header">
                <div>
                    <h2>Team Setup (Advanced)</h2>
                    <p>Add players to both teams. (Min 7, Max 12)</p>
                </div>
                <div class="game-code-display">
                    <span class="status status--info">
                        Game Code: <span id="setupGameCode">...</span>
                    </span>
                    <button id="copySetupCode" class="btn btn--outline btn--sm">Copy</button>
                </div>
            </header>
            
            <p style="text-align: center; font-size: 1.2rem; padding: 40px; color: var(--color-text-secondary);">
                The "Advanced Mode" with player tracking and revival logic is the next step.
                <br><br>
                For now, you can skip this and use the "Easy Mode" scoreboard.
            </p>
            
            <div class="section-actions">
                <button id="backToConfig" class="btn btn--outline">← Back to Configuration</button>
                <button id="startGameEasy" class="btn btn--primary">Start "Easy Mode" Game</button>
            </div>
        </div>
    </section>

    <section id="control-view" class="view hidden">
        <div class="container-fluid">
            <header class="control-header">
                <div class="control-title">
                    <h2 id="gameNameDisplay">Kabaddi Game</h2>
                    <div class="game-code-display">
                        <span class="status status--info">
                            Game Code: <span id="controlGameCode">...</span>
                        </span>
                        <button id="copyControlCode" class="btn btn--outline btn--sm">Copy</button>
                    </div>
                </div>
            </header>

            <div class="scoreboard">
                <div class="team-score" id="teamAScoreSection">
                    <h3 id="teamAName">Team A</h3>
                    <div class="score-display" id="teamAScore">0</div>
                    <div class="score-controls">
                        <button class="btn btn--sm score-btn" data-team="teamA" data-points="1">+1</button>
                        <button class="btn btn--sm score-btn" data-team="teamA" data-points="2">+2</button>
                        <button class="btn btn--sm score-btn" data-team="teamA" data-points="3">+3</button>
                        <button class="btn btn--sm score-btn" data-team="teamA" data-points="4">+4</button>
                        <button class="btn btn--sm score-btn btn--warning" data-team="teamA" data-points="2" data-type="all-out">+2 All Out</button>
                        <button class="btn btn--sm score-btn" data-team="teamA" data-points="-1">-1</button>
                    </div>
                </div>

                <div class="clock-section">
                    <div id="gameClockSection" style="display: none; flex-direction: column; align-items: center;">
                        <div class="clock-display game-clock" id="gameClockDisplay" title="Click to edit">20:00</div>
                        <div class="period-display">Half <span id="halfDisplay">1</span></div>
                        <div class="master-clock-controls">
                            <button id="startGameClockBtn" class="btn btn--primary master-start-btn">START GAME</button>
                            <div class="clock-control-row">
                                <button id="editGameClock" class="btn btn--secondary btn--sm">Edit Time</button>
                                <button id="nextHalf" class="btn btn--secondary btn--sm">Next Half</button>
                            </div>
                        </div>
                    </div>
                    <div class="shot-clock-section" id="raidClockSection" style="display: none;">
                        <div class="shot-clock-display" id="raidClockDisplay" title="Click to edit">30</div>
                        <div class="shot-clock-label">Raid Clock</div>
                        <div class="shot-clock-actions">
                            <button id="startRaidClock" class="btn btn--success btn--sm">Start Raid</button>
                            <button id="resetRaidClock" class="btn btn--warning btn--sm">Reset Raid</button>
                            <button id="editRaidClock" class="btn btn--secondary btn--sm">Edit</button>
                        </div>
                    </div>
                </div>

                <div class="team-score" id="teamBScoreSection">
                    <h3 id="teamBName">Team B</h3>
                    <div class="score-display" id="teamBScore">0</div>
                    <div class="score-controls">
                        <button class="btn btn--sm score-btn" data-team="teamB" data-points="1">+1</button>
                        <button class="btn btn--sm score-btn" data-team="teamB" data-points="2">+2</button>
                        <button class="btn btn--sm score-btn" data-team="teamB" data-points="3">+3</button>
                        <button class="btn btn--sm score-btn" data-team="teamB" data-points="4">+4</button>
                        <button class="btn btn--sm score-btn btn--warning" data-team="teamB" data-points="2" data-type="all-out">+2 All Out</button>
                        <button class="btn btn--sm score-btn" data-team="teamB" data-points="-1">-1</button>
                    </div>
                </div>
            </div>

            <div style="max-width: 400px; margin: 16px auto;">
                <div class="card">
                    <div class="card__body">
                        <h4>Possession (Next Raid)</h4>
                        <div class="possession-controls">
                            <button id="possessionTeamA" class="btn btn--outline possession-btn active">Team A</button>
                            <button id="possessionTeamB" class="btn btn--outline possession-btn">Team B</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <section id="viewer-view" class="view hidden">
        <div class="container-fluid">
            <div class="viewer-scoreboard">
                <div class="viewer-team" id="viewerTeamA">
                    <h2 id="viewerTeamAName">Team A</h2>
                    <div class="viewer-score" id="viewerTeamAScore">0</div>
                </div>
                <div class="viewer-center" style="display: flex;">
                    <div class="viewer-clock" id="viewerGameClock" style="display: none;">20:00</div>
                    <div class="viewer-period" id="viewerHalfArea" style="display: none;">Half <span id="viewerHalf">1</span></div>
                    <div class="viewer-shot-clock" id="viewerRaidClock" style="display: none;">30</div>
                </div>
                <div class="viewer-team" id="viewerTeamB">
                    <h2 id="viewerTeamBName">Team B</h2>
                    <div class="viewer-score" id="viewerTeamBScore">0</div>
                </div>
            </div>
            <div class="viewer-info">
                <div class="game-name" id="viewerGameName">Kabaddi Game</div>
                <div class="possession-indicator">
                    <span>Possession:</span>
                    <span id="viewerPossession">Team A</span>
                </div>
            </div>
        </div>
    </section>

    <div id="editGameClockModal" class="modal hidden">
        <div class="modal-content">
            <h3>Edit Game Clock</h3>
            <div class="form-group">
                <label for="editMinutes">Minutes:</label>
                <input id="editMinutes" type="number" min="0" max="99" class="form-control">
            </div>
            <div class="form-group">
                <label for="editSeconds">Seconds:</label>
                <input id="editSeconds" type="number" min="0" max="59" class="form-control">
            </div>
            <div class="modal-actions">
                <button id="cancelGameClockEdit" class="btn btn--outline">Cancel</button>
                <button id="saveGameClockEdit" class="btn btn--primary">Save</button>
            </div>
        </div>
    </div>

    <div id="editRaidClockModal" class="modal hidden">
        <div class="modal-content">
            <h3>Edit Raid Clock</h3>
            <div class="form-group">
                <label for="editRaidClockSeconds">Seconds:</label>
                <input id="editRaidClockSeconds" type="number" min="0" max="60" class="form-control">
            </div>
            <div class="modal-actions">
                <button id="cancelRaidClockEdit" class="btn btn--outline">Cancel</button>
                <button id="saveRaidClockEdit" class="btn btn--primary">Save</button>
            </div>
        </div>
    </div>
    `;
}

// ================== KABADDI FUNCTIONS ==================
// ... (All functions from handleFormatTime to setupAutoSave remain) ...
// ... (No changes to the core game logic functions) ...

// --- Utility Functions ---
function formatTime(minutes, seconds) {
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function generateGameCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function showView(viewName) {
    console.log(`Switching to view: ${viewName}`);
    // Now includes 'landing'
    const views = ['landing', 'config', 'setup', 'control', 'viewer'];
    
    views.forEach(view => {
        const element = $(`${view}-view`);
        if (element) {
            if (view === viewName) {
                element.classList.remove('hidden');
            } else {
                element.classList.add('hidden');
            }
        }
    });
    
    state.view = viewName;

    if (viewName === 'landing' || viewName === 'config') {
        if (state.firestoreListener) {
            state.firestoreListener(); 
            state.firestoreListener = null;
            console.log('Detached Firestore listener.');
        }
        stopGameTimer();
        stopRaidTimer();
    }
}

// --- Clock Functions ---

function playRaidClockBuzzer() {
    const buzzer = $('buzzerSound'); 
    if (buzzer) {
        buzzer.currentTime = 0;
        buzzer.play().catch(e => console.log('Audio play failed:', e));
    }
    showToast('RAID TIME OVER!', 'error', 3000);
}

function handleRaidClockEnd() {
    console.log('Raid time over!');
    playRaidClockBuzzer();
    
    if (state.game) {
        state.game.gameState.raidRunning = false;
        state.game.gameState.raidClock = 0;
        
        const newPossession = state.game.gameState.possession === 'teamA' ? 'teamB' : 'teamA';
        state.game.gameState.possession = newPossession;
        
        updateControlDisplay();
        saveGameState();
        showToast('Raid ended. Possession switched.', 'warning', 4000);
    }
}

function startGameTimer() {
    if (state.timers.gameTimer) {
        clearInterval(state.timers.gameTimer);
    }
    
    state.timers.gameTimer = setInterval(() => {
        if (!state.game || !state.game.gameState.gameRunning) {
            stopGameTimer();
            return;
        }
        
        if (state.game.gameState.gameTime.seconds > 0) {
            state.game.gameState.gameTime.seconds--;
        } else if (state.game.gameState.gameTime.minutes > 0) {
            state.game.gameState.gameTime.minutes--;
            state.game.gameState.gameTime.seconds = 59;
        } else {
            state.game.gameState.gameRunning = false;
            stopGameTimer();
            stopRaidTimer();
            if(state.isHost) {
                showToast('Half ended!', 'warning', 3000);
                saveGameState();
            }
        }
        
        if (state.view === 'control') updateControlDisplay();
        if (state.view === 'viewer') updateSpectatorView();

    }, 1000);
}

function stopGameTimer() {
    if (state.timers.gameTimer) {
        clearInterval(state.timers.gameTimer);
        state.timers.gameTimer = null;
    }
    if (state.view === 'control' && $('startGameClockBtn')) {
         updateGameClockButton();
    }
}

function toggleGameClock(forceStart = false) {
    if (!state.game || !state.isHost) return;
    
    if (forceStart && !state.game.gameState.gameRunning) {
        state.game.gameState.gameRunning = true;
        startGameTimer();
        showToast('Game started!', 'success', 1500);
    } else if (!forceStart) {
        if (state.game.gameState.gameRunning) {
            state.game.gameState.gameRunning = false;
            stopGameTimer();
            stopRaidTimer(); // CLOCK SYNC
            showToast('Game paused', 'info', 1500);
        } else {
            state.game.gameState.gameRunning = true;
            startGameTimer();
            showToast('Game started!', 'success', 1500);
        }
    }
    
    updateGameClockButton();
    saveGameState();
}

function updateGameClockButton() {
    const btn = $('startGameClockBtn');
    if (!btn || !state.game) return;
    
    if (state.game.gameState.gameRunning) {
        btn.textContent = 'PAUSE GAME';
        btn.className = 'btn btn--primary master-start-btn pause';
    } else {
        btn.textContent = 'START GAME';
        btn.className = 'btn btn--primary master-start-btn resume';
    }
}

function startRaidTimer() {
    if (!state.game || !state.isHost) return;

    if (!state.game.gameState.gameRunning && state.game.settings.enableGameClock) {
        toggleGameClock(true); // CLOCK SYNC
    }

    if (state.timers.raidTimer) {
        clearInterval(state.timers.raidTimer);
    }
    
    if (state.game.gameState.raidClock === 0) {
        state.game.gameState.raidClock = state.game.settings.raidClockDuration;
    }

    state.game.gameState.raidRunning = true;
    showToast('Raid started!', 'success', 1500);

    state.timers.raidTimer = setInterval(() => {
        if (!state.game || !state.game.gameState.raidRunning) {
            stopRaidTimer();
            return;
        }

        if (state.game.gameState.raidClock > 0) {
            state.game.gameState.raidClock--;
        } else {
            state.game.gameState.raidRunning = false;
            stopRaidTimer();
            if (state.isHost) {
                handleRaidClockEnd(); 
            }
        }
        
        if (state.view === 'control') updateControlDisplay();
        if (state.view === 'viewer') updateSpectatorView();

    }, 1000);
}

function stopRaidTimer() {
    if (state.timers.raidTimer) {
        clearInterval(state.timers.raidTimer);
        state.timers.raidTimer = null;
    }
    if (state.game) {
        state.game.gameState.raidRunning = false;
    }
}

function resetRaidClock() {
    if (!state.game || !state.isHost) return;
    stopRaidTimer();
    state.game.gameState.raidClock = state.game.settings.raidClockDuration;
    updateControlDisplay();
    saveGameState();
    showToast('Raid clock reset', 'info', 1500);
}

function showEditGameClockModal() {
    if (!state.isHost) return;
    const modal = $('editGameClockModal');
    const editMinutes = $('editMinutes');
    const editSeconds = $('editSeconds');
    if (!modal || !state.game) return;
    
    editMinutes.value = state.game.gameState.gameTime.minutes;
    editSeconds.value = state.game.gameState.gameTime.seconds;
    modal.classList.remove('hidden');
    state.clockEditing = true;
    
    $('saveGameClockEdit').onclick = () => {
        state.game.gameState.gameTime.minutes = Math.max(0, parseInt(editMinutes.value) || 0);
        state.game.gameState.gameTime.seconds = Math.max(0, Math.min(59, parseInt(editSeconds.value) || 0));
        updateControlDisplay();
        saveGameState();
        modal.classList.add('hidden');
        state.clockEditing = false;
        showToast('Game clock updated', 'success', 1500);
    };
    $('cancelGameClockEdit').onclick = () => {
        modal.classList.add('hidden');
        state.clockEditing = false;
    };
}

function showEditRaidClockModal() {
    if (!state.isHost) return;
    const modal = $('editRaidClockModal');
    const editRaidClockSeconds = $('editRaidClockSeconds');
    if (!modal || !state.game) return;
    
    editRaidClockSeconds.value = state.game.gameState.raidClock;
    modal.classList.remove('hidden');
    state.clockEditing = true;
    
    $('saveRaidClockEdit').onclick = () => {
        state.game.gameState.raidClock = Math.max(0, Math.min(60, parseInt(editRaidClockSeconds.value) || 0));
        updateControlDisplay();
        saveGameState();
        modal.classList.add('hidden');
        state.clockEditing = false;
        showToast('Raid clock updated', 'success', 1500);
    };
    $('cancelRaidClockEdit').onclick = () => {
        modal.classList.add('hidden');
        state.clockEditing = false;
    };
}


// --- Game State & Firebase ---

function createGameSkeleton(code, config = {}) {
    const hostId = state.user ? state.user.uid : null;
    
    return {
        hostId: hostId,
        code: code,
        gameType: state.gameType,
        settings: {
            gameName: config.gameName || 'Kabaddi Game',
            halfDuration: config.halfDuration || 20,
            raidClockDuration: config.raidClockDuration || 30,
            enableGameClock: config.enableGameClock,
            enableRaidClock: config.enableRaidClock
        },
        teamA: {
            name: config.teamAName || 'Team A',
            color: config.teamAColor || '#FF6B35',
            score: 0,
            allOuts: 0,
            roster: [], 
            stats: {}     
        },
        teamB: {
            name: config.teamBName || 'Team B',
            color: config.teamBColor || '#1B263B',
            score: 0,
            allOuts: 0,
            roster: [], 
            stats: {}     
        },
        gameState: {
            half: 1,
            gameTime: {
                minutes: config.halfDuration || 20,
                seconds: 0
            },
            raidClock: config.raidClockDuration || 30,
            possession: 'teamA',
            gameRunning: false,
            raidRunning: false
        },
        lastUpdate: Date.now()
    };
}

async function saveGameState() {
    // Only save if logged in
    if (!state.user || !state.isHost) return; 

    if (state.game && state.gameCode && db) {
        try {
            state.game.lastUpdate = Date.now();
            await db.collection('games').doc(state.gameCode).set(state.game);
        } catch (e) {
            console.warn('Failed to save game to Firebase:', e);
            showToast('Sync failed. Check permissions.', 'error', 2000);
        }
    }
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

// --- View Handlers ---

async function handleWatchGame() {
    console.log('✓ handleWatchGame called');
    const code = $('watchCodeInput').value.trim();
    
    await joinSpectatorMode(code);
}

async function handleHostGame() {
    console.log('✓ handleHostGame called');
    state.isHost = true;
    let code = $('hostCodeInput').value.trim();

    // Generate default code if empty
    if (code === "") {
        code = generateGameCode();
        showToast(`Generated random code: ${code}`, 'info', 2000);
    }

    if (code.length !== 6 || !/^\d+$/.test(code)) {
        showToast('Please enter a valid 6-digit code', 'error', 3000);
        return;
    }

    await checkCodeAndProceed(code);
}

async function checkCodeAndProceed(code) {
    const validationMsg = $('hostCodeValidation');
    validationMsg.textContent = 'Checking code...';
    validationMsg.className = 'validation-message info';
    validationMsg.classList.remove('hidden');

    const existingGame = await loadGameState(code);

    if (state.user) {
        // --- Logged-in Host ---
        if (existingGame) {
            if (existingGame.hostId === state.user.uid) {
                // It's THEIR game, let them resume
                validationMsg.textContent = 'Resuming your existing game...';
                validationMsg.className = 'validation-message success';
                showToast('Resuming your existing game...', 'success', 2000);
                
                state.game = existingGame;
                state.gameCode = code;
                state.gameType = existingGame.gameType;

                // Go straight to controls
                showControlView();

            } else {
                // Code is used by SOMEONE ELSE
                validationMsg.textContent = 'This code is already in use. Try another.';
                validationMsg.className = 'validation-message error';
                showToast('Code already in use. Try another.', 'error', 3000);
                return;
            }
        } else {
            // Logged in host + new code = OK
            validationMsg.classList.add('hidden');
            state.gameCode = code;
            showConfigurationView();
        }
    } else {
        // --- Free Host ---
        if (existingGame) {
            // Free hosts can't resume or overwrite
            validationMsg.textContent = 'This code is already in use. Try another.';
            validationMsg.className = 'validation-message error';
            showToast('Code already in use. Try another.', 'error', 3000);
            return;
        } else {
            // Free host + new code = OK
            validationMsg.classList.add('hidden');
            state.gameCode = code;
            showConfigurationView();
        }
    }
}


async function handleWatchCodeInput() {
    const value = $('watchCodeInput').value.replace(/\D/g, '').slice(0, 6);
    $('watchCodeInput').value = value;
    $('watchGameBtn').disabled = value.length !== 6;
    
    if (value.length === 6) {
        await validateWatchCode(value);
    } else {
        $('watchCodeValidation').classList.add('hidden');
    }
}

async function validateWatchCode(code) {
    const message = $('watchCodeValidation');
    if (!message) return;
    message.textContent = 'Checking code...';
    message.className = 'validation-message info';
    message.classList.remove('hidden');
    
    const gameExists = await loadGameState(code);
    
    if (gameExists) {
        message.textContent = 'Game found!';
        message.className = 'validation-message success';
    } else {
        message.textContent = 'Game not found';
        message.className = 'validation-message error';
    }
}

async function joinSpectatorMode(code) {
    console.log('Joining spectator mode for code:', code);
    const savedGame = await loadGameState(code);
    if (!savedGame) {
        showToast('Game not found', 'error', 2000);
        $('watchCodeValidation').textContent = 'Game not found';
        $('watchCodeValidation').className = 'validation-message error';
        $('watchCodeValidation').classList.remove('hidden');
        return;
    }
    
    state.gameCode = code;
    state.game = savedGame;
    state.gameType = savedGame.gameType || 'easy';
    state.isHost = false; // Spectators are never hosts
    
    showSpectatorView();
}

function showConfigurationView() {
    console.log('✓ Showing configuration view');
    showView('config');
    $('configGameCode').textContent = state.gameCode;
    setupConfigurationHandlers();
}

function setupConfigurationHandlers() {
    console.log('✓ Setting up configuration handlers');
    
    $('copyConfigCode').onclick = (e) => { e.preventDefault(); copyToClipboard(state.gameCode); };
    
    $$('input[name="gameType"]').forEach(radio => {
        radio.onchange = (e) => { state.gameType = e.target.value; };
    });

    $('backToLanding').onclick = (e) => { e.preventDefault(); showView('landing'); };
    
    $('proceedToSetup').onclick = (e) => {
        e.preventDefault();
        const config = gatherConfigurationData();
        
        state.game = createGameSkeleton(state.gameCode, config);
        saveGameState(); // Initial save
        
        if (state.gameType === 'easy') {
            showControlView();
        } else {
            showTeamSetupView();
        }
    };
}

function gatherConfigurationData() {
    return {
        gameName: $('gameNameInput').value.trim() || 'Kabaddi Game',
        halfDuration: parseInt($('halfDurationSelect').value || '20'),
        raidClockDuration: parseInt($('raidClockSelect').value || '30'),
        enableGameClock: $('enableGameClock').checked,
        enableRaidClock: $('enableRaidClock').checked,
        teamAName: $('teamAName').value.trim() || 'Team A',
        teamBName: $('teamBName').value.trim() || 'Team B',
        teamAColor: $('teamAColor').value || '#FF6B35',
        teamBColor: $('teamBColor').value || '#1B263B'
    };
}

function showTeamSetupView() {
    console.log('Showing team setup view');
    showView('setup');
    $('setupGameCode').textContent = state.gameCode;
    setupTeamSetupHandlers();
}

function setupTeamSetupHandlers() {
    $('copySetupCode').onclick = (e) => { e.preventDefault(); copyToClipboard(state.gameCode); };
    $('backToConfig').onclick = (e) => { e.preventDefault(); showView('config'); };
    $('startGameEasy').onclick = (e) => {
        e.preventDefault();
        state.game.gameType = 'easy';
        saveGameState();
        showControlView();
    };
}

function showControlView() {
    console.log('Showing control view');
    showView('control');
    
    $('controlGameCode').textContent = state.gameCode;
    $('copyControlCode').onclick = (e) => { e.preventDefault(); copyToClipboard(state.gameCode); };
    $('gameNameDisplay').textContent = state.game.settings.gameName;
    
    const gameClockOn = state.game.settings.enableGameClock;
    const raidClockOn = state.game.settings.enableRaidClock;
    $('gameClockSection').style.display = gameClockOn ? 'flex' : 'none';
    $('raidClockSection').style.display = raidClockOn ? 'flex' : 'none';
    
    const clockSection = $('.clock-section');
    if (gameClockOn && raidClockOn) {
        clockSection.style.flexDirection = 'column';
    } else {
        clockSection.style.flexDirection = 'row'; 
    }
    if (!gameClockOn && !raidClockOn) {
        clockSection.style.display = 'none';
    } else {
        clockSection.style.display = 'flex';
    }

    setupControlHandlers();
    updateControlDisplay();
    updateGameClockButton();
    setupAutoSave();

    if (db && state.user && state.isHost) {
        if (state.firestoreListener) state.firestoreListener(); 

        state.firestoreListener = db.collection('games').doc(state.gameCode)
          .onSnapshot((doc) => {
              console.log('ControlView received snapshot');
              if (doc.exists) {
                  state.game = doc.data();
                  updateControlDisplay();
                  
                  const newState = state.game.gameState;
                  if (newState.gameRunning && !state.timers.gameTimer) {
                      startGameTimer();
                  } else if (!newState.gameRunning && state.timers.gameTimer) {
                      stopGameTimer();
                  }
                  if (newState.raidRunning && !state.timers.raidTimer) {
                      startRaidTimer();
                  } else if (!newState.raidRunning && state.timers.raidTimer) {
                      stopRaidTimer();
                  }
              } else {
                  showToast('Game session not found', 'error', 3000);
              }
          }, (error) => {
              console.error("Error in Firestore listener:", error);
              showToast('Connection lost', 'error', 3000);
          });
    }
}

function setupControlHandlers() {
    console.log('Setting up control handlers');
    
    $('startGameClockBtn').onclick = (e) => { e.preventDefault(); toggleGameClock(); };
    $('editGameClock').onclick = (e) => { e.preventDefault(); showEditGameClockModal(); };
    $('gameClockDisplay').onclick = (e) => { if (state.isHost) showEditGameClockModal(); };
    $('nextHalf').onclick = (e) => { e.preventDefault(); nextHalfFunc(); };

    $('startRaidClock').onclick = (e) => { e.preventDefault(); startRaidTimer(); };
    $('resetRaidClock').onclick = (e) => { e.preventDefault(); resetRaidClock(); };
    $('editRaidClock').onclick = (e) => { e.preventDefault(); showEditRaidClockModal(); };
    $('raidClockDisplay').onclick = (e) => { if (state.isHost) showEditRaidClockModal(); };
    
    $$('.score-btn').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            if (!state.isHost) {
                showToast('Only the host can control the game', 'warning');
                return;
            }
            const points = parseInt(e.target.dataset.points);
            const team = e.target.dataset.team;
            const type = e.target.dataset.type || 'default';
            updateScore(team, points, type);
        };
    });
    
    $('possessionTeamA').onclick = (e) => { 
        e.preventDefault(); 
        if (!state.isHost) return;
        setPossession('teamA'); 
    };
    $('possessionTeamB').onclick = (e) => { 
        e.preventDefault(); 
        if (!state.isHost) return;
        setPossession('teamB'); 
    };
}

function nextHalfFunc() {
    if (!state.game || !state.isHost) return;
    state.game.gameState.half++;
    state.game.gameState.gameTime.minutes = state.game.settings.halfDuration;
    state.game.gameState.gameTime.seconds = 0;
    state.game.gameState.raidClock = state.game.settings.raidClockDuration;
    
    state.game.gameState.gameRunning = false;
    state.game.gameState.raidRunning = false;
    stopGameTimer();
    stopRaidTimer();
    
    updateControlDisplay();
    updateGameClockButton();
    saveGameState();
    showToast(`Half ${state.game.gameState.half} started`, 'info', 2000);
}

function updateScore(team, points, type = 'default') {
    if (!state.game || !state.isHost) return;
    state.game[team].score = Math.max(0, state.game[team].score + points);
    
    if (type === 'all-out') {
        state.game[team].allOuts++;
        showToast('All Out!', 'success', 2000);
    }

    if (state.game.settings.enableRaidClock) {
        resetRaidClock();
    }
    
    const newPossession = team === 'teamA' ? 'teamB' : 'teamA';
    setPossession(newPossession);
    
    showScoreAnimation(points, team);
    updateControlDisplay();
    saveGameState();
}

function showScoreAnimation(points, team) {
    const scoreElement = $(`${team}Score`);
    if (!scoreElement) return;
    const rect = scoreElement.getBoundingClientRect();
    const anim = document.createElement('div');
    anim.className = 'score-animation';
    anim.textContent = points > 0 ? `+${points}` : points.toString();
    anim.style.left = `${rect.left + rect.width / 2 - 20}px`;
    anim.style.top = `${rect.top}px`;
    anim.style.color = points > 0 ? 'var(--color-success)' : 'var(--color-error)';
    document.body.appendChild(anim);
    setTimeout(() => { if (anim.parentNode) anim.parentNode.removeChild(anim); }, 1500);
}

function updateControlDisplay() {
    if (!state.game) return;
    $('teamAScore').textContent = state.game.teamA.score;
    $('teamBScore').textContent = state.game.teamB.score;
    $('teamAName').textContent = state.game.teamA.name;
    $('teamBName').textContent = state.game.teamB.name;
    
    if (state.game.settings.enableGameClock) {
        $('gameClockDisplay').textContent = formatTime(state.game.gameState.gameTime.minutes, state.game.gameState.gameTime.seconds);
        $('halfDisplay').textContent = state.game.gameState.half;
    }
    if (state.game.settings.enableRaidClock) {
        $('raidClockDisplay').textContent = state.game.gameState.raidClock;
    }
    
    updatePossessionDisplay();
}

function setPossession(team) {
    if (!state.game || !state.isHost) return;
    state.game.gameState.possession = team;
    updatePossessionDisplay();
    saveGameState();
}

function updatePossessionDisplay() {
    const btnA = $('possessionTeamA');
    const btnB = $('possessionTeamB');
    if (btnA && btnB && state.game) {
        const isTeamA = state.game.gameState.possession === 'teamA';
        btnA.classList.toggle('active', isTeamA);
        btnB.classList.toggle('active', !isTeamA);
        btnA.textContent = state.game.teamA.name;
        btnB.textContent = state.game.teamB.name;
    }
    const viewerPossession = $('viewerPossession');
    if(viewerPossession && state.game) {
        viewerPossession.textContent = state.game.gameState.possession === 'teamA' ? state.game.teamA.name : state.game.teamB.name;
    }
}

function showSpectatorView() {
    console.log('Showing spectator view');
    showView('viewer');
    
    // Disable all host controls for spectator
    $$('.score-btn, .possession-btn, .master-start-btn, .clock-control-row button, .shot-clock-actions button').forEach(btn => {
        btn.disabled = true;
    });
    $$('.clock-display, .shot-clock-display').forEach(el => {
        el.title = "Spectator View";
        el.style.cursor = 'default';
    });
    
    if (state.game) {
        const gameClockOn = state.game.settings.enableGameClock;
        const raidClockOn = state.game.settings.enableRaidClock;

        $('viewerGameClock').style.display = gameClockOn ? 'block' : 'none';
        $('viewerHalfArea').style.display = gameClockOn ? 'block' : 'none';
        $('viewerRaidClock').style.display = raidClockOn ? 'block' : 'none';
        
        const viewerCenter = $('.viewer-center');
        if (!gameClockOn && !raidClockOn) {
            viewerCenter.style.display = 'none';
        } else {
            viewerCenter.style.display = 'flex';
        }
    }

    if(state.game) updateSpectatorView();

    if (db && state.gameCode) {
        if (state.firestoreListener) state.firestoreListener();
        state.firestoreListener = db.collection('games').doc(state.gameCode)
          .onSnapshot((doc) => {
              console.log('SpectatorView received snapshot');
              if (doc.exists) {
                  state.game = doc.data();
                  updateSpectatorView();

                  const newState = state.game.gameState;
                  if (newState.gameRunning && !state.timers.gameTimer) {
                      startGameTimer();
                  } else if (!newState.gameRunning && state.timers.gameTimer) {
                      stopGameTimer();
                  }
                  if (newState.raidRunning && !state.timers.raidTimer) {
                      startRaidTimer();
                  } else if (!newState.raidRunning && state.timers.raidTimer) {
                      stopRaidTimer();
                  }
              } else {
                  showToast('Game session has ended', 'error', 3000);
              }
          }, (error) => {
              console.error("Error in Firestore listener:", error);
              showToast('Connection lost', 'error', 3000);
          });
    }
}

function updateSpectatorView() {
    if (!state.game) return;
    $('viewerTeamAName').textContent = state.game.teamA.name;
    $('viewerTeamBName').textContent = state.game.teamB.name;
    $('viewerTeamAScore').textContent = state.game.teamA.score;
    $('viewerTeamBScore').textContent = state.game.teamB.score;
    $('viewerGameName').textContent = state.game.settings.gameName;

    if (state.game.settings.enableGameClock) {
        $('viewerGameClock').textContent = formatTime(state.game.gameState.gameTime.minutes, state.game.gameState.gameTime.seconds);
        $('viewerHalf').textContent = state.game.gameState.half;
    }
    if (state.game.settings.enableRaidClock) {
        $('viewerRaidClock').textContent = state.game.gameState.raidClock;
    }
    
    updatePossessionDisplay();
}

function setupAutoSave() {
    if (state.timers.autoSave) clearInterval(state.timers.autoSave);
    if (state.isHost && state.user) { // Only save if logged in
        state.timers.autoSave = setInterval(saveGameState, 30000); 
    }
}

// ================== INITIALIZER (CALLED BY MAIN.JS) ==================

/**
 * @param {object} utils - The global utilities from main.js
 * @param {firebase.User | null} user - The authenticated user (or null)
 * @param {URLSearchParams} urlParams - The URL parameters
 */
function init(utils, user, urlParams) {
    console.log('Kabaddi module initializing...');
    
    $ = utils.$;
    $$ = utils.$$;
    showToast = utils.showToast;
    copyToClipboard = utils.copyToClipboard;

    state.user = user; // Set user state (null if not logged in)
    
    const watchCode = urlParams.get('watch');
    const hostMode = urlParams.get('host'); // 'true' (logged in) or 'free'

    if (watchCode) {
        // This is a spectator
        state.isHost = false;
        joinSpectatorMode(watchCode);
    } else if (hostMode) {
        // This is a host
        state.isHost = true;
        // init landing page
        showView('landing');
        setupLandingPageHandlers();
    } else {
        // How did they get here? Send 'em home.
        window.location.href = 'index.html';
    }
    
    console.log('✓ Kabaddi module ready!');
}

function setupLandingPageHandlers() {
    // Setup Landing Page Listeners
    $('watchGameBtn').addEventListener('click', handleWatchGame);
    $('watchCodeInput').addEventListener('input', handleWatchCodeInput);
    $('hostGameBtn').addEventListener('click', handleHostGame);
    $('hostCodeInput').addEventListener('input', (e) => {
        const value = e.target.value.replace(/\D/g, '').slice(0, 6);
        e.target.value = value;
    });
}

// ================== EXPORT ==================
export default {
    sportName: "Kabaddi",
    buildHtml,
    init
};