/**
 * Main application logic for Cthulhu & Chill dice roller
 * Checkpoint 2: Dice rolling UI only, no Firebase
 */

import { rollDie, rollDice, rollD100, interpretCoC } from './dice.js';

// State
const tray = []; // Array of die sizes: [6, 6, 20, etc.]

// DOM elements
const elements = {
  // Dice area
  presetButtons: document.querySelectorAll('.btn-die, .btn-d100'),
  trayContent: document.getElementById('tray-content'),
  clearTrayBtn: document.getElementById('clear-tray-btn'),
  skillValue: document.getElementById('skill-value'),
  rollBtn: document.getElementById('roll-btn'),
  resultDisplay: document.getElementById('result-display'),
  resultNumber: document.getElementById('result-number'),
  resultOutcome: document.getElementById('result-outcome'),
  resultDetail: document.getElementById('result-detail'),

  // Roll log
  rollLogContent: document.getElementById('roll-log-content'),

  // Background
  backgroundUploadBtn: document.getElementById('background-upload-btn'),
  backgroundFileInput: document.getElementById('background-file-input'),
  backgroundLayer: document.getElementById('background-layer'),
};

// Format helpers
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

// Tray management
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

// Result display
function displayResult(number, outcome = null, detail = '') {
  // Clear previous outcome classes
  elements.resultDisplay.className = 'result-display';

  // Set number
  elements.resultNumber.textContent = number;

  // Set outcome and apply color class if provided
  if (outcome) {
    elements.resultOutcome.textContent = formatOutcome(outcome);
    elements.resultDisplay.classList.add(`outcome-${outcome}`);
  } else {
    elements.resultOutcome.textContent = '';
  }

  // Set detail
  elements.resultDetail.textContent = detail;
}

// Roll log
function addToLog(message, outcome = null) {
  // Remove empty message if present
  const emptyMsg = elements.rollLogContent.querySelector('.log-empty');
  if (emptyMsg) {
    emptyMsg.remove();
  }

  const entry = document.createElement('div');
  entry.className = 'log-entry';
  if (outcome) {
    entry.classList.add(outcome);
  }

  const timestamp = new Date().toLocaleTimeString();
  entry.textContent = `[${timestamp}] ${message}`;

  elements.rollLogContent.prepend(entry);
  elements.rollLogContent.scrollTop = 0;
}

// Roll handlers
function rollD100WithSkill() {
  const roll = rollD100();
  const skill = parseInt(elements.skillValue.value) || 0;

  let outcome = null;
  let detail = '';

  if (skill > 0) {
    outcome = interpretCoC(roll, skill);
    detail = `Skill: ${skill}%`;
    displayResult(padToTwoDigits(roll), outcome, detail);
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

  // Roll all dice in tray
  const results = tray.map(sides => ({ sides, result: rollDie(sides) }));
  const total = results.reduce((sum, r) => sum + r.result, 0);

  // Display
  const resultText = results.map(r => `${r.result}`).join(' + ');
  const detail = results.map(r => `d${r.sides}: ${r.result}`).join(', ');

  displayResult(total, null, detail);

  // Log
  const diceList = tray.map(sides => `d${sides}`).join(', ');
  addToLog(`[${diceList}] → ${resultText} = ${total}`);

  // Clear tray after rolling
  clearTray();
}

// Event listeners
function setupEventListeners() {
  // Preset buttons
  elements.presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const sides = parseInt(btn.dataset.die);

      if (sides === 100) {
        // d100 rolls immediately with CoC interpretation
        rollD100WithSkill();
      } else {
        // Other dice add to tray
        addToTray(sides);
      }
    });
  });

  // Clear tray button
  elements.clearTrayBtn.addEventListener('click', clearTray);

  // Roll button
  elements.rollBtn.addEventListener('click', rollTray);

  // Background upload
  elements.backgroundUploadBtn.addEventListener('click', () => {
    elements.backgroundFileInput.click();
  });

  elements.backgroundFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        elements.backgroundLayer.style.backgroundImage = `url(${event.target.result})`;
      };
      reader.readAsDataURL(file);
    }
  });
}

// Initialize
function init() {
  renderTray();
  setupEventListeners();
  console.log('Cthulhu & Chill dice roller initialized');
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
