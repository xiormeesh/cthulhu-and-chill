import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import {
  getDatabase, ref, set, get, push, update, remove, onValue,
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

// TODO: add games cleanup — delete old/unused games to stay under limit
const MAX_GAMES = 10;
const MAX_PORTRAIT_SIZE = 1 * 1024 * 1024;
const MAX_BACKGROUND_SIZE = 5 * 1024 * 1024;

async function createGame(name, musicLink = '', frameStyle = 'vintage') {
  const snapshot = await get(ref(db, 'games'));
  if (snapshot.exists() && Object.keys(snapshot.val()).length >= MAX_GAMES) {
    alert(`Cannot create more than ${MAX_GAMES} games. Delete an existing game first.`);
    return null;
  }
  const gamesRef = ref(db, 'games');
  const newGameRef = push(gamesRef);
  await set(newGameRef, {
    name,
    musicLink,
    frameStyle,
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

// --- localStorage identity ---

const IDENTITY_KEY = 'cthulhu-and-chill-identity';

function getIdentityMap() {
  try { return JSON.parse(localStorage.getItem(IDENTITY_KEY)) || {}; }
  catch { return {}; }
}

function setIdentityForGame(gameId, charId) {
  const map = getIdentityMap();
  map[gameId] = charId;
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(map));
}

function getLinkedCharacterId() {
  if (!currentGameId) return null;
  return getIdentityMap()[currentGameId] || null;
}

// --- Character CRUD ---

async function addCharacter({ playerName, characterName, hp, sanity, luck, role }) {
  if (!currentGameId) return null;
  const charsRef = ref(db, `games/${currentGameId}/characters`);
  const newCharRef = push(charsRef);
  await set(newCharRef, {
    playerName,
    characterName,
    role: role || 'player',
    hp: parseInt(hp, 10) || 0,
    sanity: parseInt(sanity, 10) || 0,
    luck: parseInt(luck, 10) || 0,
  });
  setIdentityForGame(currentGameId, newCharRef.key);
  return newCharRef.key;
}

async function updateCharacterField(charId, field, value) {
  if (!currentGameId) return;
  await update(ref(db, `games/${currentGameId}/characters/${charId}`), { [field]: value });
}

// --- Character tile rendering ---

const PLAYER_SLOTS = ['slot-r1c1', 'slot-r1c3', 'slot-r2c1', 'slot-r2c3', 'slot-r3c1', 'slot-r3c3'];

function renderCharacterTiles(characters) {
  const keeperSlot = document.getElementById('slot-keeper');
  keeperSlot.innerHTML = '';
  PLAYER_SLOTS.forEach(id => { document.getElementById(id).innerHTML = ''; });

  const charEntries = characters ? Object.entries(characters) : [];
  const linkedId = getLinkedCharacterId();
  let playerIndex = 0;

  charEntries.forEach(([charId, char]) => {
    const tile = createCharacterTile(charId, char, charId === linkedId);
    if (char.role === 'keeper') {
      keeperSlot.appendChild(tile);
    } else if (playerIndex < PLAYER_SLOTS.length) {
      document.getElementById(PLAYER_SLOTS[playerIndex]).appendChild(tile);
      playerIndex++;
    }
  });

  if (currentGameId && playerIndex < PLAYER_SLOTS.length) {
    const addTile = createAddCharacterTile();
    document.getElementById(PLAYER_SLOTS[playerIndex]).appendChild(addTile);
  }

  updateRollIdentity(characters);
}

function createCharacterTile(charId, char, isSelf) {
  const template = document.getElementById('character-tile-template');
  const tile = template.content.cloneNode(true).querySelector('.character-tile');
  tile.dataset.charId = charId;
  tile.dataset.role = char.role || 'player';
  if (isSelf) tile.classList.add('is-self');
  const frameStyle = currentGameData?.frameStyle || 'engraved';
  tile.classList.add(`frame-${frameStyle}`);

  tile.querySelector('.tile-player-name').textContent = char.playerName;
  tile.querySelector('.tile-character-name').textContent = char.characterName;

  const img = tile.querySelector('.tile-portrait');
  if (char.portrait) {
    img.src = char.portrait;
    img.alt = char.characterName;
  }

  // Claim button — always visible, styled differently when claimed
  const claimBtn = tile.querySelector('.btn-tile-claim');
  if (isSelf) {
    claimBtn.classList.add('claimed');
    claimBtn.title = 'Claimed';
  } else {
    claimBtn.addEventListener('click', () => {
      setIdentityForGame(currentGameId, charId);
      renderCharacterTiles(currentGameData?.characters);
    });
  }

  // Edit button — only for claimed character
  const editBtn = tile.querySelector('.btn-tile-edit');
  if (!isSelf) {
    editBtn.hidden = true;
  } else {
    const editPlayerName = tile.querySelector('.edit-player-name');
    const editCharName = tile.querySelector('.edit-character-name');
    const avatarUploadBtn = tile.querySelector('.btn-upload-avatar');
    const avatarFileInput = tile.querySelector('.avatar-file-input');

    const setStatsEditable = (enabled) => {
      tile.querySelectorAll('.stat-dec, .stat-inc, .stat-value').forEach(el => {
        el.disabled = !enabled;
      });
    };

    editBtn.addEventListener('click', () => {
      tile.classList.add('editing');
      editPlayerName.value = char.playerName;
      editCharName.value = char.characterName;
      setStatsEditable(true);
    });

    tile.querySelector('.btn-cancel-edit').addEventListener('click', () => {
      tile.classList.remove('editing');
      setStatsEditable(false);
    });

    tile.querySelector('.btn-save-edit').addEventListener('click', async () => {
      const newPlayerName = editPlayerName.value.trim();
      const newCharName = editCharName.value.trim();
      if (newPlayerName) await updateCharacterField(charId, 'playerName', newPlayerName);
      if (newCharName) await updateCharacterField(charId, 'characterName', newCharName);
      tile.classList.remove('editing');
      setStatsEditable(false);
    });

    async function uploadAvatar(file) {
      if (!file || !currentGameId) return;
      if (!file.type.startsWith('image/')) {
        alert('Please upload an image file.');
        return;
      }
      if (file.size > MAX_PORTRAIT_SIZE) {
        alert('Portrait must be under 1 MB.');
        return;
      }
      const portraitRef = storageRef(storage, `games/${currentGameId}/portraits/${charId}`);
      await uploadBytes(portraitRef, file, { contentType: file.type });
      const url = await getDownloadURL(portraitRef);
      await updateCharacterField(charId, 'portrait', url);
    }

    avatarUploadBtn.addEventListener('click', () => avatarFileInput.click());
    avatarFileInput.addEventListener('change', (e) => uploadAvatar(e.target.files[0]));

    const portraitWrap = tile.querySelector('.tile-portrait-wrap');
    portraitWrap.addEventListener('click', () => {
      if (tile.classList.contains('editing')) avatarFileInput.click();
    });

    tile._uploadAvatar = uploadAvatar;
  }

  // Stats — display for all, editable in edit mode for claimed
  if (char.role !== 'keeper') {
    tile.querySelectorAll('.stat').forEach(statEl => {
      const statName = statEl.dataset.stat;
      const input = statEl.querySelector('.stat-value');
      input.value = char[statName] || 0;
      input.disabled = true;
      statEl.querySelector('.stat-dec').disabled = true;
      statEl.querySelector('.stat-inc').disabled = true;

      if (isSelf) {
        statEl.querySelector('.stat-dec').addEventListener('click', () => {
          const newVal = Math.max(0, parseInt(input.value, 10) - 1);
          input.value = newVal;
          updateCharacterField(charId, statName, newVal);
        });
        statEl.querySelector('.stat-inc').addEventListener('click', () => {
          const newVal = parseInt(input.value, 10) + 1;
          input.value = newVal;
          updateCharacterField(charId, statName, newVal);
        });
        input.addEventListener('change', () => {
          const val = parseInt(input.value, 10) || 0;
          updateCharacterField(charId, statName, val);
        });
      }
    });
  }

  return tile;
}

const FRAME_COLORS = {
  engraved: ['rgba(155,142,196,0.3)', 'rgba(155,142,196,0.6)'],
  'art-deco': ['rgba(155,142,196,0.35)', 'rgba(155,142,196,0.65)'],
  vintage: ['rgba(155,142,196,0.3)', 'rgba(155,142,196,0.6)'],
  eldritch: ['rgba(80,180,120,0.3)', 'rgba(80,180,120,0.6)'],
};

function createAddCharacterTile() {
  const template = document.getElementById('add-character-template');
  const tile = template.content.cloneNode(true).querySelector('.add-character-tile');
  const btn = tile.querySelector('.btn-add-character');
  const form = tile.querySelector('.add-character-form');
  const frameStyle = currentGameData?.frameStyle || 'engraved';
  const [color, hover] = FRAME_COLORS[frameStyle] || FRAME_COLORS.engraved;
  tile.style.setProperty('--add-char-color', color);
  tile.style.setProperty('--add-char-color-hover', hover);
  const keeperCheckbox = form.querySelector('input[name="isKeeper"]');
  const statsDiv = form.querySelector('.add-char-stats');

  btn.addEventListener('click', () => {
    btn.hidden = true;
    form.hidden = false;
  });

  tile.querySelector('.add-char-cancel').addEventListener('click', () => {
    btn.hidden = false;
    form.hidden = true;
    form.reset();
  });

  keeperCheckbox.addEventListener('change', () => {
    statsDiv.hidden = keeperCheckbox.checked;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    await addCharacter({
      playerName: fd.get('playerName'),
      characterName: fd.get('characterName'),
      hp: fd.get('hp'),
      sanity: fd.get('sanity'),
      luck: fd.get('luck'),
      role: keeperCheckbox.checked ? 'keeper' : 'player',
    });
  });

  return tile;
}

function updateRollIdentity(characters) {
  const container = document.getElementById('roll-identity');
  const linkedId = getLinkedCharacterId();
  if (linkedId && characters && characters[linkedId]) {
    container.textContent = `as ${characters[linkedId].playerName}`;
  } else {
    container.textContent = '';
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
    elements.trayContent.innerHTML = '<span class="tray-empty"></span>';
    return;
  }
  elements.trayContent.innerHTML = '';
  tray.forEach((sides, index) => {
    const chip = document.createElement('span');
    chip.className = 'die-chip';
    const file = sides === 100 ? 'd10' : `d${sides}`;
    chip.innerHTML = `<img src="icons/${file}.svg" width="22" height="22" alt="">`;
    chip.title = `d${sides}`;
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

function getRollerName() {
  const linkedId = getLinkedCharacterId();
  if (linkedId && currentGameData?.characters?.[linkedId]) {
    const c = currentGameData.characters[linkedId];
    return `${c.playerName} (${c.characterName})`;
  }
  return 'Anonymous';
}

function addToLog(message, outcome = null) {
  const emptyMsg = elements.rollLogContent.querySelector('.log-empty');
  if (emptyMsg) emptyMsg.remove();

  const entry = document.createElement('div');
  entry.className = 'log-entry';
  if (outcome) entry.classList.add(outcome);

  entry.textContent = `${getRollerName()}: ${message}`;

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

  // Game modal (create + edit)
  const modal = document.getElementById('new-game-modal');
  const modalTitle = document.getElementById('game-modal-title');
  const modalSubmitBtn = document.getElementById('game-modal-submit');
  const gameForm = document.getElementById('new-game-form');
  const gameNameInput = document.getElementById('new-game-name');
  const gameMusicInput = document.getElementById('new-game-music');
  const gameFrameSelect = document.getElementById('new-game-frame');
  const gameCancel = document.getElementById('new-game-cancel');
  const deleteGameBtn = document.getElementById('delete-game-btn');
  let editingGameId = null;

  function openGameModal(editing = false) {
    editingGameId = editing ? currentGameId : null;
    if (editing && currentGameData) {
      modalTitle.textContent = 'Edit Game';
      modalSubmitBtn.textContent = 'Save';
      gameNameInput.value = currentGameData.name || '';
      gameMusicInput.value = currentGameData.musicLink || '';
      gameFrameSelect.value = currentGameData.frameStyle || 'engraved';
      deleteGameBtn.hidden = false;
    } else {
      modalTitle.textContent = 'New Game';
      modalSubmitBtn.textContent = 'Create';
      gameForm.reset();
      deleteGameBtn.hidden = true;
    }
    modal.hidden = false;
    gameNameInput.focus();
  }

  deleteGameBtn.addEventListener('click', async () => {
    if (!editingGameId) return;
    if (!confirm('Are you sure you want to remove this game?')) return;
    const deletedId = editingGameId;
    await remove(ref(db, `games/${deletedId}`));
    modal.hidden = true;
    editingGameId = null;
    const games = await loadGameList();
    if (games.length > 0) {
      await switchGame(games[games.length - 1].id);
    } else {
      currentGameId = null;
      currentGameData = null;
      elements.gameName.textContent = 'New Game';
    }
    await updateGameSelect();
  });

  elements.newGameBtn.addEventListener('click', () => openGameModal(false));

  document.querySelector('.game-title').addEventListener('click', () => {
    if (currentGameId) openGameModal(true);
  });

  gameCancel.addEventListener('click', () => {
    modal.hidden = true;
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.hidden = true;
  });

  gameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = gameNameInput.value.trim();
    if (!name) return;
    const musicLink = gameMusicInput.value.trim();
    const frameStyle = gameFrameSelect.value;

    if (editingGameId) {
      await update(ref(db, `games/${editingGameId}`), { name, musicLink, frameStyle });
      await updateGameSelect();
      modal.hidden = true;
    } else {
      const gameId = await createGame(name, musicLink, frameStyle);
      if (gameId) modal.hidden = true;
    }
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

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file.');
      return;
    }
    if (file.size > MAX_BACKGROUND_SIZE) {
      alert('Background must be under 5 MB.');
      return;
    }

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

  // Paste avatar from clipboard anywhere on the page
  window.addEventListener('paste', (e) => {
    const editingTile = document.querySelector('.character-tile.editing');
    if (!editingTile || !editingTile._uploadAvatar) return;
    const cd = e.clipboardData;
    if (!cd) return;

    // Check items first (Chrome/Edge)
    if (cd.items) {
      for (const item of cd.items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          editingTile._uploadAvatar(item.getAsFile());
          return;
        }
      }
    }
    // Fallback to files (Firefox)
    if (cd.files?.length) {
      for (const file of cd.files) {
        if (file.type.startsWith('image/')) {
          e.preventDefault();
          editingTile._uploadAvatar(file);
          return;
        }
      }
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
      renderCharacterTiles(game.characters);
      if (game.backgroundImage) {
        elements.backgroundLayer.style.backgroundImage = `url(${game.backgroundImage})`;
      } else {
        elements.backgroundLayer.style.backgroundImage = '';
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
