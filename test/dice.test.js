/**
 * Unit tests for dice.js using Node's built-in test runner
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  rollDie,
  rollDice,
  rollD100,
  interpretCoC,
  parseDiceNotation
} from '../dice.js';

describe('rollDie', () => {
  it('returns value between 1 and sides', () => {
    for (let i = 0; i < 100; i++) {
      const result = rollDie(6);
      assert.ok(result >= 1 && result <= 6, `Expected 1-6, got ${result}`);
    }
  });

  it('handles different die sizes', () => {
    [4, 6, 8, 10, 12, 20, 100].forEach(sides => {
      const result = rollDie(sides);
      assert.ok(result >= 1 && result <= sides, `Expected 1-${sides}, got ${result}`);
    });
  });
});

describe('rollDice', () => {
  it('returns correct number of results', () => {
    const result = rollDice(3, 6);
    assert.strictEqual(result.results.length, 3);
  });

  it('returns correct total', () => {
    const result = rollDice(2, 6);
    const expectedTotal = result.results[0] + result.results[1];
    assert.strictEqual(result.total, expectedTotal);
  });

  it('each die is in range', () => {
    const result = rollDice(5, 8);
    result.results.forEach(val => {
      assert.ok(val >= 1 && val <= 8, `Expected 1-8, got ${val}`);
    });
  });
});

describe('rollD100', () => {
  it('returns value between 1 and 100', () => {
    for (let i = 0; i < 100; i++) {
      const result = rollD100();
      assert.ok(result >= 1 && result <= 100, `Expected 1-100, got ${result}`);
    }
  });
});

describe('interpretCoC', () => {
  describe('critical success', () => {
    it('roll of 1 is always critical success', () => {
      assert.strictEqual(interpretCoC(1, 5), 'critical_success');
      assert.strictEqual(interpretCoC(1, 50), 'critical_success');
      assert.strictEqual(interpretCoC(1, 100), 'critical_success');
    });
  });

  describe('fumble', () => {
    it('roll of 100 is fumble when skill >= 50', () => {
      assert.strictEqual(interpretCoC(100, 50), 'fumble');
      assert.strictEqual(interpretCoC(100, 75), 'fumble');
      assert.strictEqual(interpretCoC(100, 100), 'fumble');
    });

    it('roll >= 96 is fumble when skill < 50', () => {
      assert.strictEqual(interpretCoC(96, 49), 'fumble');
      assert.strictEqual(interpretCoC(97, 30), 'fumble');
      assert.strictEqual(interpretCoC(98, 10), 'fumble');
      assert.strictEqual(interpretCoC(99, 0), 'fumble');
      assert.strictEqual(interpretCoC(100, 0), 'fumble');
    });

    it('roll of 95 is NOT fumble when skill < 50', () => {
      const result = interpretCoC(95, 49);
      assert.notStrictEqual(result, 'fumble');
    });

    it('roll of 99 is NOT fumble when skill >= 50', () => {
      const result = interpretCoC(99, 50);
      assert.notStrictEqual(result, 'fumble');
    });
  });

  describe('extreme success', () => {
    it('roll <= skill/5 is extreme success', () => {
      assert.strictEqual(interpretCoC(10, 50), 'extreme_success');
      assert.strictEqual(interpretCoC(20, 100), 'extreme_success');
      assert.strictEqual(interpretCoC(3, 15), 'extreme_success');
    });

    it('uses floor for odd skill values', () => {
      // skill 51: floor(51/5) = floor(10.2) = 10
      assert.strictEqual(interpretCoC(10, 51), 'extreme_success');
      assert.strictEqual(interpretCoC(11, 51), 'hard_success'); // not extreme
    });
  });

  describe('hard success', () => {
    it('roll <= skill/2 is hard success (if not extreme)', () => {
      assert.strictEqual(interpretCoC(25, 50), 'hard_success');
      assert.strictEqual(interpretCoC(40, 80), 'hard_success');
    });

    it('uses floor for odd skill values', () => {
      // skill 51: floor(51/2) = floor(25.5) = 25
      assert.strictEqual(interpretCoC(25, 51), 'hard_success');
      assert.strictEqual(interpretCoC(26, 51), 'regular_success'); // not hard
    });

    it('boundary: exactly skill/2 succeeds', () => {
      assert.strictEqual(interpretCoC(25, 50), 'hard_success');
    });
  });

  describe('regular success', () => {
    it('roll <= skill is regular success (if not hard/extreme)', () => {
      assert.strictEqual(interpretCoC(40, 50), 'regular_success');
      assert.strictEqual(interpretCoC(70, 80), 'regular_success');
    });

    it('boundary: exactly skill value succeeds', () => {
      assert.strictEqual(interpretCoC(50, 50), 'regular_success');
      assert.strictEqual(interpretCoC(75, 75), 'regular_success');
    });
  });

  describe('failure', () => {
    it('roll > skill is failure (if not fumble)', () => {
      assert.strictEqual(interpretCoC(51, 50), 'failure');
      assert.strictEqual(interpretCoC(81, 80), 'failure');
      assert.strictEqual(interpretCoC(95, 50), 'failure'); // not fumble for skill >= 50
    });
  });

  describe('edge cases', () => {
    it('handles skill value 0', () => {
      assert.strictEqual(interpretCoC(1, 0), 'critical_success');
      assert.strictEqual(interpretCoC(50, 0), 'failure');
      assert.strictEqual(interpretCoC(96, 0), 'fumble');
    });

    it('handles very high skill values', () => {
      assert.strictEqual(interpretCoC(1, 200), 'critical_success');
      assert.strictEqual(interpretCoC(40, 200), 'extreme_success'); // 200/5 = 40
      assert.strictEqual(interpretCoC(99, 200), 'hard_success'); // 200/2 = 100, but 99 < 100
      // Note: roll 100 would still be fumble since skill >= 50
      assert.strictEqual(interpretCoC(100, 200), 'fumble');
    });

    it('priority: critical beats everything', () => {
      // Even with skill 100, roll of 1 is critical, not extreme
      assert.strictEqual(interpretCoC(1, 100), 'critical_success');
    });

    it('priority: fumble beats success tiers', () => {
      // skill 60: roll 100 should be fumble, not success
      assert.strictEqual(interpretCoC(100, 60), 'fumble');
    });
  });
});

describe('parseDiceNotation', () => {
  it('parses valid notation', () => {
    assert.deepStrictEqual(parseDiceNotation('2d6'), { count: 2, sides: 6 });
    assert.deepStrictEqual(parseDiceNotation('1d20'), { count: 1, sides: 20 });
    assert.deepStrictEqual(parseDiceNotation('3d8'), { count: 3, sides: 8 });
  });

  it('handles uppercase D', () => {
    assert.deepStrictEqual(parseDiceNotation('2D6'), { count: 2, sides: 6 });
  });

  it('handles whitespace', () => {
    assert.deepStrictEqual(parseDiceNotation('  2d6  '), { count: 2, sides: 6 });
  });

  it('returns null for invalid notation', () => {
    assert.strictEqual(parseDiceNotation('invalid'), null);
    assert.strictEqual(parseDiceNotation('d6'), null);
    assert.strictEqual(parseDiceNotation('2d'), null);
    assert.strictEqual(parseDiceNotation('2x6'), null);
    assert.strictEqual(parseDiceNotation(''), null);
  });

  it('returns null for non-string input', () => {
    assert.strictEqual(parseDiceNotation(null), null);
    assert.strictEqual(parseDiceNotation(undefined), null);
    assert.strictEqual(parseDiceNotation(123), null);
  });

  it('returns null for invalid counts/sides', () => {
    assert.strictEqual(parseDiceNotation('0d6'), null);
    assert.strictEqual(parseDiceNotation('2d0'), null);
    assert.strictEqual(parseDiceNotation('-1d6'), null);
  });
});
