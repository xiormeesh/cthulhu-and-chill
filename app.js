import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import {
  getDatabase, ref, set, get, push, update, onValue,
  connectDatabaseEmulator
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-database.js';
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL,
  connectStorageEmulator
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js';
import { rollDie, rollDice, rollD100, interpretCoC } from './dice.js';

// Firebase init
const firebaseConfig = {
  apiKey: 'demo-key',
  projectId: 'demo-cthulhu-and-chill',
  storageBucket: 'demo-cthulhu-and-chill.firebasestorage.app',
  databaseURL: 'https://demo-cthulhu-and-chill-default-rtdb.firebaseio.com'
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);
const storage = getStorage(firebaseApp);

if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  connectDatabaseEmulator(db, '127.0.0.1', 9000);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}

// State
let currentGameId = null;
let currentGameData = null;
const tray = [];

// DOM elements
const elements = {
  presetButtons: document.querySelectorAll('.btn-die, .btn-d100'),
  trayContent: document.getElementById('tray-content'),
  clearTrayBtn: document.getElementById('clear-tray-btn'),
  skillValue: document.getElementById('skill-value'),
  rollBtn: document.getElementById('roll-btn'),
  resultDisplay: document.getElementById('result-display'),
  resultNumber: document.getElementById('result-number'),
  resultOutcome: document.getElementById('result-outcome'),
  resultDetail: document.getElementById('result-detail'),
  rollLogContent: document.getElementById('roll-log-content'),
  backgroundUploadBtn: document.getElementById('background-upload-btn'),
  backgroundFileInput: document.getElementById('background-file-input'),
  backgroundLayer: document.getElementById('background-layer'),
  gameName: document.getElementById('game-name'),
  gameSelect: document.getElementById('game-select'),
  newGameBtn: document.getElementById('new-game-btn'),
  musicLinkArea: document.getElementById('music-link-area'),
  musicLink: document.getElementById('music-link'),
};

// --- Game management ---

async function createGame(name, musicLink = '') {
  const gamesRef = ref(db, 'games');
  const newGameRef = push(gamesRef);
  await set(newGameRef, {
    name,
    musicLink,
    backgroundImage: ''
  });
  await set(ref(db, 'activeGameId'), newGameRef.key);
  return newGameRef.key;
}

async function loadGameList() {
  const snapshot = await get(ref(db, 'games'));
  const games = [];
  if (snapshot.exists()) {
    snapshot.forEach(child => {
      games.push({ id: child.key, ...child.val() });
    });
  }
  return games;
}

async function switchGame(gameId) {
  await set(ref(db, 'activeGameId'), gameId);
}

function listenToActiveGame(callback) {
  onValue(ref(db, 'activeGameId'), (snapshot) => {
    const gameId = snapshot.val();
    if (gameId && gameId !== currentGameId) {
      currentGameId = gameId;
      callback(gameId);
    }
  });
}

let currentGameListener = null;

function listenToGame(gameId, callback) {
  if (currentGameListener) currentGameListener();
  currentGameListener = onValue(ref(db, `games/${gameId}`), (snapshot) => {
    if (snapshot.exists()) {
      callback({ id: gameId, ...snapshot.val() });
    }
  });
}

async function updateGameSelect() {
  const games = await loadGameList();
  elements.gameSelect.innerHTML = '';
  if (games.length === 0) {
    elements.gameSelect.innerHTML = '<option value="">No games yet</option>';
    return;
  }
  games.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    if (g.id === currentGameId) opt.selected = true;
    elements.gameSelect.appendChild(opt);
  });
}

function isValidUrl(str) {
  return /^https?:\/\//i.test(str);
}

function renderGameHeader(game) {
  elements.gameName.textContent = game.name || 'New Game';
  if (game.musicLink && isValidUrl(game.musicLink)) {
    elements.musicLink.href = game.musicLink;
    elements.musicLink.textContent = 'Music';
    elements.musicLink.target = '_blank';
    elements.musicLink.rel = 'noopener';
  } else {
    elements.musicLink.href = '#';
    elements.musicLink.textContent = game.musicLink ? 'Music (invalid link)' : 'Music';
  }
}

// --- Format helpers ---

function formatOutcome(outcome) {
  const labels = {
    critical_success: 'Critical Success!',
    extreme_success: 'Extreme Success!',
    hard_success: 'Hard Success',
    regular_success: 'Success',
    failure: 'Failure',
    fumble: 'FUMBLE!'
  };
  return labels[outcome] || '';
}

function padToTwoDigits(num) {
  return num.toString().padStart(2, '0');
}

// --- Tray management ---

function addToTray(sides) {
  tray.push(sides);
  renderTray();
}

function removeFromTray(index) {
  tray.splice(index, 1);
  renderTray();
}

function clearTray() {
  tray.length = 0;
  renderTray();
}

function renderTray() {
  if (tray.length === 0) {
    elements.trayContent.innerHTML = '<span class="tray-empty">Empty</span>';
    return;
  }
  elements.trayContent.innerHTML = '';
  tray.forEach((sides, index) => {
    const chip = document.createElement('span');
    chip.className = 'die-chip';
    chip.textContent = `d${sides}`;
    chip.addEventListener('click', () => removeFromTray(index));
    elements.trayContent.appendChild(chip);
  });
}

// --- Result display ---

function displayResult(number, outcome = null, detail = '') {
  elements.resultDisplay.className = 'result-display';
  elements.resultNumber.textContent = number;
  if (outcome) {
    elements.resultOutcome.textContent = formatOutcome(outcome);
    elements.resultDisplay.classList.add(`outcome-${outcome}`);
  } else {
    elements.resultOutcome.textContent = '';
  }
  elements.resultDetail.textContent = detail;
}

// --- Roll log (local for now, Firebase in checkpoint 5) ---

function addToLog(message, outcome = null) {
  const emptyMsg = elements.rollLogContent.querySelector('.log-empty');
  if (emptyMsg) emptyMsg.remove();

  const entry = document.createElement('div');
  entry.className = 'log-entry';
  if (outcome) entry.classList.add(outcome);

  const timestamp = new Date().toLocaleTimeString();
  entry.textContent = `[${timestamp}] ${message}`;

  elements.rollLogContent.prepend(entry);
  elements.rollLogContent.scrollTop = 0;
}

// --- Roll handlers ---

function rollD100WithSkill() {
  const roll = rollD100();
  const skill = parseInt(elements.skillValue.value) || 0;

  if (skill > 0) {
    const outcome = interpretCoC(roll, skill);
    displayResult(padToTwoDigits(roll), outcome, `Skill: ${skill}%`);
    addToLog(`d100: ${padToTwoDigits(roll)} vs ${skill}% → ${formatOutcome(outcome)}`, outcome);
  } else {
    displayResult(padToTwoDigits(roll), null, 'Enter skill % for interpretation');
    addToLog(`d100: ${padToTwoDigits(roll)}`);
  }
}

function rollTray() {
  if (tray.length === 0) {
    rollD100WithSkill();
    return;
  }
  const results = tray.map(sides => ({ sides, result: rollDie(sides) }));
  const total = results.reduce((sum, r) => sum + r.result, 0);
  const detail = results.map(r => `d${r.sides}: ${r.result}`).join(', ');
  const diceList = tray.map(sides => `d${sides}`).join(', ');

  displayResult(total, null, detail);
  addToLog(`[${diceList}] → ${results.map(r => r.result).join(' + ')} = ${total}`);
  clearTray();
}

// --- Event listeners ---

function setupEventListeners() {
  elements.presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const sides = parseInt(btn.dataset.die);
      if (sides === 100) {
        rollD100WithSkill();
      } else {
        addToTray(sides);
      }
    });
  });

  elements.clearTrayBtn.addEventListener('click', clearTray);
  elements.rollBtn.addEventListener('click', rollTray);

  // New Game modal
  const modal = document.getElementById('new-game-modal');
  const newGameForm = document.getElementById('new-game-form');
  const newGameNameInput = document.getElementById('new-game-name');
  const newGameMusicInput = document.getElementById('new-game-music');
  const newGameCancel = document.getElementById('new-game-cancel');

  elements.newGameBtn.addEventListener('click', () => {
    newGameForm.reset();
    modal.hidden = false;
    newGameNameInput.focus();
  });

  newGameCancel.addEventListener('click', () => {
    modal.hidden = true;
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
  });

  newGameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = newGameNameInput.value.trim();
    if (!name) return;
    const musicLink = newGameMusicInput.value.trim();
    modal.hidden = true;
    await createGame(name, musicLink);
  });

  // Game select
  elements.gameSelect.addEventListener('change', async (e) => {
    const gameId = e.target.value;
    if (!gameId) return;
    if (gameId === currentGameId) return;
    await switchGame(gameId);
  });

  // Music link — click to edit
  elements.musicLink.addEventListener('click', (e) => {
    if (!currentGameId) return;
    if (currentGameData?.musicLink) return;
    e.preventDefault();
    const url = prompt('Music link (YouTube, Spotify, etc.):');
    if (url !== null) {
      update(ref(db, `games/${currentGameId}`), { musicLink: url });
    }
  });

  // Long-click music area to edit existing link
  elements.musicLinkArea.addEventListener('dblclick', (e) => {
    if (!currentGameId) return;
    e.preventDefault();
    const url = prompt('Update music link:', currentGameData?.musicLink || '');
    if (url !== null) {
      update(ref(db, `games/${currentGameId}`), { musicLink: url });
    }
  });

  // Background upload — store in Firebase Storage when game exists
  elements.backgroundUploadBtn.addEventListener('click', () => {
    elements.backgroundFileInput.click();
  });

  elements.backgroundFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (currentGameId) {
      const bgRef = storageRef(storage, `games/${currentGameId}/background`);
      await uploadBytes(bgRef, file, { contentType: file.type });
      const url = await getDownloadURL(bgRef);
      await update(ref(db, `games/${currentGameId}`), { backgroundImage: url });
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        elements.backgroundLayer.style.backgroundImage = `url(${event.target.result})`;
      };
      reader.readAsDataURL(file);
    }
  });
}

// --- Initialize ---

function init() {
  renderTray();
  setupEventListeners();

  listenToActiveGame(async (gameId) => {
    await updateGameSelect();
    listenToGame(gameId, (game) => {
      currentGameData = game;
      renderGameHeader(game);
      if (game.backgroundImage) {
        elements.backgroundLayer.style.backgroundImage = `url(${game.backgroundImage})`;
      }
    });
  });

  updateGameSelect();
  console.log('Cthulhu & Chill initialized');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
