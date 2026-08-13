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
  apiKey: 'AIzaSyDeXkwwToK0EpbWc_B-ZMVfyQYc3aH7j1g',
  authDomain: 'katya-ai.firebaseapp.com',
  projectId: 'katya-ai',
  storageBucket: 'katya-ai.firebasestorage.app',
  messagingSenderId: '996414421339',
  appId: '1:996414421339:web:5c87bd6bbf1e6a270d827e',
  databaseURL: 'https://katya-ai-default-rtdb.europe-west1.firebasedatabase.app',
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
const DEFAULT_AVATARS = [
  'avatar-bat.svg', 'avatar-beast-eye.svg', 'avatar-book.svg', 'avatar-brain.svg',
  'avatar-daemon.svg', 'avatar-dragon.svg', 'avatar-eye.svg', 'avatar-eyestalk.svg',
  'avatar-fish.svg', 'avatar-flesh.svg', 'avatar-gargoyle.svg', 'avatar-ghost.svg',
  'avatar-haunting.svg', 'avatar-hydra.svg', 'avatar-infested.svg', 'avatar-kraken.svg',
  'avatar-medusa.svg', 'avatar-mummy.svg', 'avatar-reaper.svg', 'avatar-sea-creature.svg',
  'avatar-shade.svg', 'avatar-shadow.svg', 'avatar-skull.svg', 'avatar-spectre.svg',
  'avatar-spider.svg', 'avatar-spiked-dragon.svg', 'avatar-tentacles.svg',
  'avatar-vampire.svg', 'avatar-werewolf.svg', 'avatar-zombie.svg',
].map(f => `icons/${f}`);

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
let currentRollsListener = null;

function listenToGame(gameId, callback) {
  if (currentGameListener) currentGameListener();
  if (currentRollsListener) currentRollsListener();

  currentGameListener = onValue(ref(db, `games/${gameId}`), (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const { rolls, ...gameWithoutRolls } = data;
      callback({ id: gameId, ...gameWithoutRolls });
    }
  });

  currentRollsListener = onValue(ref(db, `games/${gameId}/rolls`), (snapshot) => {
    renderRollLog(snapshot.val());
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
    elements.musicLinkArea.hidden = false;
    elements.musicLink.href = game.musicLink;
    elements.musicLink.textContent = 'Music';
    elements.musicLink.target = '_blank';
    elements.musicLink.rel = 'noopener';
  } else {
    elements.musicLinkArea.hidden = !game.musicLink;
    elements.musicLink.href = '#';
    elements.musicLink.textContent = 'Music (invalid link)';
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

async function addCharacter({ playerName, characterName, hp, sanity, luck, role, portrait }) {
  if (!currentGameId) return null;
  if (role === 'keeper' && currentGameData?.characters) {
    const hasKeeper = Object.values(currentGameData.characters).some(c => c.role === 'keeper');
    if (hasKeeper) {
      alert('This game already has a Keeper.');
      return null;
    }
  }
  const charsRef = ref(db, `games/${currentGameId}/characters`);
  const newCharRef = push(charsRef);
  await set(newCharRef, {
    playerName,
    characterName,
    role: role || 'player',
    hp: parseInt(hp, 10) || 0,
    sanity: parseInt(sanity, 10) || 0,
    luck: parseInt(luck, 10) || 0,
    portrait: portrait || DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)],
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
    if (char.portrait.startsWith('icons/')) img.classList.add('default-avatar');
  }

  // Claim button
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

  // Edit button — opens character modal
  const editBtn = tile.querySelector('.btn-tile-edit');
  if (!isSelf) {
    editBtn.hidden = true;
  } else {
    editBtn.addEventListener('click', () => openCharacterModal('edit', charId, char));
  }

  // Stats — display for all, +/- for claimed character
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
  const frameStyle = currentGameData?.frameStyle || 'engraved';
  const [color, hover] = FRAME_COLORS[frameStyle] || FRAME_COLORS.engraved;
  tile.style.setProperty('--add-char-color', color);
  tile.style.setProperty('--add-char-color-hover', hover);

  btn.addEventListener('click', () => openCharacterModal('create'));

  return tile;
}

// --- Character modal (create & edit) ---

let charModalAvatarBlob = null;
let charModalAvatarPreview = null;

function openCharacterModal(mode, charId = null, charData = null) {
  const modal = document.getElementById('char-modal');
  const form = document.getElementById('char-modal-form');
  const title = document.getElementById('char-modal-title');
  const portrait = document.getElementById('char-modal-portrait');
  const portraitWrap = document.getElementById('char-modal-portrait-wrap');
  const fileInput = document.getElementById('char-modal-file-input');
  const keeperToggle = document.getElementById('char-modal-keeper-toggle');
  const keeperCb = document.getElementById('char-modal-keeper-cb');
  const statsDiv = document.getElementById('char-modal-stats');
  const submitBtn = document.getElementById('char-modal-submit');

  charModalAvatarBlob = null;
  charModalAvatarPreview = null;
  form.reset();

  if (mode === 'create') {
    title.textContent = 'New Character';
    submitBtn.textContent = 'Join';
    const hasKeeper = currentGameData?.characters &&
      Object.values(currentGameData.characters).some(c => c.role === 'keeper');
    keeperToggle.hidden = hasKeeper;
    keeperCb.checked = false;
    statsDiv.hidden = false;
    const randomAvatar = DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];
    portrait.src = randomAvatar;
    portrait.classList.add('default-avatar');
    charModalAvatarPreview = randomAvatar;
  } else {
    title.textContent = 'Edit Character';
    submitBtn.textContent = 'Save';
    keeperToggle.hidden = true;
    statsDiv.hidden = charData.role === 'keeper';
    form.elements.playerName.value = charData.playerName;
    form.elements.characterName.value = charData.characterName;
    if (charData.role !== 'keeper') {
      form.elements.hp.value = charData.hp || 0;
      form.elements.sanity.value = charData.sanity || 0;
      form.elements.luck.value = charData.luck || 0;
    }
    if (charData.portrait) {
      portrait.src = charData.portrait;
      portrait.classList.toggle('default-avatar', charData.portrait.startsWith('icons/'));
      charModalAvatarPreview = charData.portrait;
    } else {
      portrait.src = '';
    }
  }

  keeperCb.addEventListener('change', () => {
    statsDiv.hidden = keeperCb.checked;
  });

  async function handleAvatarFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const croppedBlob = await openCropModal(file);
    if (!croppedBlob) return;
    charModalAvatarBlob = croppedBlob;
    const url = URL.createObjectURL(croppedBlob);
    portrait.src = url;
    portrait.classList.remove('default-avatar');
    charModalAvatarPreview = url;
  }

  portraitWrap.onclick = () => fileInput.click();
  fileInput.onchange = (e) => handleAvatarFile(e.target.files[0]);

  function onPaste(e) {
    if (modal.hidden) return;
    const cd = e.clipboardData;
    if (!cd) return;
    if (cd.items) {
      for (const item of cd.items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          handleAvatarFile(item.getAsFile());
          return;
        }
      }
    }
    if (cd.files?.length) {
      for (const file of cd.files) {
        if (file.type.startsWith('image/')) {
          e.preventDefault();
          handleAvatarFile(file);
          return;
        }
      }
    }
  }
  window.addEventListener('paste', onPaste);

  modal.hidden = false;

  function cleanup() {
    modal.hidden = true;
    window.removeEventListener('paste', onPaste);
    portraitWrap.onclick = null;
    fileInput.onchange = null;
    form.onsubmit = null;
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);

    if (mode === 'create') {
      const role = keeperCb.checked ? 'keeper' : 'player';
      const defaultPortrait = !charModalAvatarBlob ? charModalAvatarPreview : undefined;
      const newCharId = await addCharacter({
        playerName: fd.get('playerName'),
        characterName: fd.get('characterName'),
        hp: fd.get('hp'),
        sanity: fd.get('sanity'),
        luck: fd.get('luck'),
        role,
        portrait: defaultPortrait,
      });
      if (!newCharId) { cleanup(); return; }
      if (charModalAvatarBlob) {
        const portraitRef = storageRef(storage, `games/${currentGameId}/portraits/${newCharId}`);
        await uploadBytes(portraitRef, charModalAvatarBlob, { contentType: 'image/png' });
        const url = await getDownloadURL(portraitRef);
        await updateCharacterField(newCharId, 'portrait', url);
      }
    } else {
      const newPlayerName = fd.get('playerName').trim();
      const newCharName = fd.get('characterName').trim();
      if (newPlayerName) await updateCharacterField(charId, 'playerName', newPlayerName);
      if (newCharName) await updateCharacterField(charId, 'characterName', newCharName);
      if (charData.role !== 'keeper') {
        await updateCharacterField(charId, 'hp', parseInt(fd.get('hp'), 10) || 0);
        await updateCharacterField(charId, 'sanity', parseInt(fd.get('sanity'), 10) || 0);
        await updateCharacterField(charId, 'luck', parseInt(fd.get('luck'), 10) || 0);
      }
      if (charModalAvatarBlob) {
        const portraitRef = storageRef(storage, `games/${currentGameId}/portraits/${charId}`);
        await uploadBytes(portraitRef, charModalAvatarBlob, { contentType: 'image/png' });
        const url = await getDownloadURL(portraitRef);
        await updateCharacterField(charId, 'portrait', url);
      }
    }
    cleanup();
  };

  document.getElementById('char-modal-cancel').onclick = cleanup;
  modal.addEventListener('click', (e) => {
    if (e.target === modal) cleanup();
  }, { once: true });
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

// --- Portrait crop modal ---

const CROP_SIZE = 256;

function openCropModal(file) {
  return new Promise((resolve) => {
    const modal = document.getElementById('crop-modal');
    const img = document.getElementById('crop-image');
    const viewport = modal.querySelector('.crop-viewport');
    const confirmBtn = document.getElementById('crop-confirm');
    const cancelBtn = document.getElementById('crop-cancel');

    let offsetX = 0, offsetY = 0, scale = 1;
    let dragging = false, startX, startY, startOffsetX, startOffsetY;

    modal.hidden = false;

    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        const vw = viewport.clientWidth;
        const vh = viewport.clientHeight;
        scale = Math.max(vw / img.naturalWidth, vh / img.naturalHeight);
        offsetX = (vw - img.naturalWidth * scale) / 2;
        offsetY = (vh - img.naturalHeight * scale) / 2;
        applyTransform();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);

    function applyTransform() {
      img.style.width = (img.naturalWidth * scale) + 'px';
      img.style.height = (img.naturalHeight * scale) + 'px';
      img.style.left = offsetX + 'px';
      img.style.top = offsetY + 'px';
    }

    function clampOffset() {
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      const iw = img.naturalWidth * scale;
      const ih = img.naturalHeight * scale;
      offsetX = Math.min(0, Math.max(vw - iw, offsetX));
      offsetY = Math.min(0, Math.max(vh - ih, offsetY));
    }

    function onPointerDown(e) {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startOffsetX = offsetX;
      startOffsetY = offsetY;
      e.preventDefault();
    }

    function onPointerMove(e) {
      if (!dragging) return;
      offsetX = startOffsetX + (e.clientX - startX);
      offsetY = startOffsetY + (e.clientY - startY);
      clampOffset();
      applyTransform();
    }

    function onPointerUp() {
      dragging = false;
    }

    function onWheel(e) {
      e.preventDefault();
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      const minScale = Math.max(vw / img.naturalWidth, vh / img.naturalHeight);
      const delta = e.deltaY > 0 ? 0.95 : 1.05;
      scale = Math.max(minScale, scale * delta);
      clampOffset();
      applyTransform();
    }

    viewport.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    viewport.addEventListener('wheel', onWheel, { passive: false });

    function cleanup() {
      modal.hidden = true;
      viewport.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      viewport.removeEventListener('wheel', onWheel);
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
    }

    confirmBtn.onclick = () => {
      const canvas = document.createElement('canvas');
      canvas.width = CROP_SIZE;
      canvas.height = CROP_SIZE;
      const ctx = canvas.getContext('2d');
      const vw = viewport.clientWidth;
      const sx = -offsetX / scale;
      const sy = -offsetY / scale;
      const sSize = vw / scale;
      ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, CROP_SIZE, CROP_SIZE);
      canvas.toBlob((blob) => {
        cleanup();
        resolve(blob);
      }, 'image/png');
    };

    cancelBtn.onclick = () => {
      cleanup();
      resolve(null);
    };

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        cleanup();
        resolve(null);
      }
    }, { once: true });
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

// --- Roll log (Firebase-synced) ---

function getRollerName() {
  const linkedId = getLinkedCharacterId();
  if (linkedId && currentGameData?.characters?.[linkedId]) {
    const c = currentGameData.characters[linkedId];
    return `${c.playerName} (${c.characterName})`;
  }
  return 'Anonymous';
}

async function saveRoll(message, outcome = null) {
  if (!currentGameId) return;
  const rollsRef = ref(db, `games/${currentGameId}/rolls`);
  await push(rollsRef, {
    playerName: getRollerName(),
    message,
    outcome: outcome || '',
    timestamp: Date.now(),
  });
}

function renderRollLog(rolls) {
  elements.rollLogContent.innerHTML = '';
  if (!rolls) return;

  const entries = Object.values(rolls)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 30);

  entries.forEach(roll => {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    if (roll.outcome) entry.classList.add(roll.outcome);

    const player = document.createElement('span');
    player.className = 'log-player';
    player.textContent = roll.playerName;

    const msg = document.createElement('span');
    msg.className = 'log-message';
    msg.textContent = roll.message;

    entry.appendChild(player);
    entry.appendChild(msg);
    elements.rollLogContent.appendChild(entry);
  });
}

// --- Roll handlers ---

async function rollD100WithSkill() {
  const roll = rollD100();
  const skill = parseInt(elements.skillValue.value) || 0;

  if (skill > 0) {
    const outcome = interpretCoC(roll, skill);
    displayResult(padToTwoDigits(roll), outcome, `Skill: ${skill}%`);
    await saveRoll(`d100: ${padToTwoDigits(roll)} vs ${skill}% → ${formatOutcome(outcome)}`, outcome);
  } else {
    displayResult(padToTwoDigits(roll), null, 'Enter skill % for interpretation');
    await saveRoll(`d100: ${padToTwoDigits(roll)}`);
  }
}

async function rollTray() {
  if (tray.length === 0) {
    await rollD100WithSkill();
    return;
  }
  const results = tray.map(sides => ({ sides, result: rollDie(sides) }));
  const total = results.reduce((sum, r) => sum + r.result, 0);
  const detail = results.map(r => `d${r.sides}: ${r.result}`).join(', ');
  const diceList = tray.map(sides => `d${sides}`).join(', ');

  displayResult(total, null, detail);
  await saveRoll(`[${diceList}] → ${results.map(r => r.result).join(' + ')} = ${total}`);
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
    if (!confirm('Switch the game for the whole party?')) {
      e.target.value = currentGameId;
      return;
    }
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
