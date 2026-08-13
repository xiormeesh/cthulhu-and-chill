/**
 * Pure ES module for dice rolling and Call of Cthulhu skill check interpretation
 */

/**
 * Roll a single die with the given number of sides
 * @param {number} sides - Number of sides on the die
 * @returns {number} Random integer from 1 to sides (inclusive)
 */
export function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Roll multiple dice
 * @param {number} count - Number of dice to roll
 * @param {number} sides - Number of sides on each die
 * @returns {{results: number[], total: number}} Individual results and their sum
 */
export function rollDice(count, sides) {
  const results = [];
  for (let i = 0; i < count; i++) {
    results.push(rollDie(sides));
  }
  const total = results.reduce((sum, val) => sum + val, 0);
  return { results, total };
}

/**
 * Roll a d100 (percentile die)
 * @returns {number} Random integer from 1 to 100 (inclusive)
 */
export function rollD100() {
  return rollDie(100);
}

/**
 * Interpret a d100 roll against a Call of Cthulhu skill value
 * @param {number} roll - The d100 roll result (1-100)
 * @param {number} skillValue - The skill percentage (0-100+)
 * @returns {string} Outcome: 'critical_success', 'extreme_success', 'hard_success',
 *                   'regular_success', 'failure', or 'fumble'
 */
export function interpretCoC(roll, skillValue) {
  // Priority order per spec
  if (roll === 1) {
    return 'critical_success';
  }

  if (roll === 100 && skillValue >= 50) {
    return 'fumble';
  }

  if (roll >= 96 && skillValue < 50) {
    return 'fumble';
  }

  if (roll <= Math.floor(skillValue / 5)) {
    return 'extreme_success';
  }

  if (roll <= Math.floor(skillValue / 2)) {
    return 'hard_success';
  }

  if (roll <= skillValue) {
    return 'regular_success';
  }

  return 'failure';
}

/**
 * Parse dice notation like "2d6", "1d20", "3d8"
 * @param {string} notation - Dice notation string
 * @returns {{count: number, sides: number}|null} Parsed values or null if invalid
 */
export function parseDiceNotation(notation) {
  if (typeof notation !== 'string') {
    return null;
  }

  const match = notation.trim().toLowerCase().match(/^(\d+)d(\d+)$/);
  if (!match) {
    return null;
  }

  const count = parseInt(match[1], 10);
  const sides = parseInt(match[2], 10);

  if (count < 1 || sides < 1) {
    return null;
  }

  return { count, sides };
}
