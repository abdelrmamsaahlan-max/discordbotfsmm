'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../src/steal-egg-catalog');
const tracker = require('../src/steal-egg-tracker');

test('catalog contains Kraken as Secret with 15M/s base income', () => {
  const x = catalog.find('Kraken');
  assert.equal(x.rarity, 'SECRET');
  assert.equal(x.baseIncome, 15000000);
  assert.equal(x.location, 'Abyss Ocean');
});

test('normalization corrects a high-confidence rarity mismatch', () => {
  const x = tracker.normalize({
    id: 'test-kraken-mismatch',
    eggName: 'Kraken Egg',
    itemName: 'Kraken',
    rarity: 'DIVINE',
    location: 'Abyss Ocean',
    spawnedAt: Math.floor(Date.now() / 1000)
  });
  assert.equal(x.rarity, 'SECRET');
  assert.equal(x.sourceRarity, 'DIVINE');
  assert.ok(x.warnings.some(w => w.includes('RARITY_MISMATCH')));
});

test('unknown rarity is rejected instead of guessed', () => {
  const x = tracker.normalize({
    id: 'test-unknown-rarity',
    eggName: 'Kraken Egg',
    itemName: 'Kraken',
    rarity: 'SUPER_RARE',
    location: 'Abyss Ocean',
    spawnedAt: Math.floor(Date.now() / 1000)
  });
  assert.equal(x, null);
});

test('same event fields produce a deterministic fallback identity', () => {
  const a = tracker.normalize({eggName:'Kraken Egg',itemName:'Kraken',rarity:'SECRET',location:'Abyss Ocean',spawnedAt:1790000000});
  const b = tracker.normalize({eggName:'Kraken Egg',itemName:'Kraken',rarity:'SECRET',location:'Abyss Ocean',spawnedAt:1790000000});
  assert.equal(a.id, b.id);
});


test('tracker rejects future events instead of alerting them', async () => {
  const result = await tracker.processEvent({
    id: 'future-test-' + Date.now(),
    eggName: 'Kraken Egg', itemName: 'Kraken', rarity: 'SECRET', location: 'Abyss Ocean',
    spawnedAt: Math.floor(Date.now() / 1000) + 3600
  });
  assert.equal(result.reason, 'future-event');
});
