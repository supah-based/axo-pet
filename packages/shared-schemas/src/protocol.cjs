'use strict';

const XP_THRESHOLDS = Object.freeze([0, 40, 100, 180, 280, 400, 550, 730, 940, 1200]);
const GEAR_SLOTS = Object.freeze(['head', 'face', 'body', 'back', 'tool', 'charm', 'companion', 'habitat']);
const ARENA_STATS = Object.freeze(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']);
const LINEAGES = Object.freeze(['emerald_sprout', 'sapphire_tide', 'amethyst_dream', 'solar_peach', 'rose_bloom', 'midnight_mint']);
const VISUAL_Z_ORDER = Object.freeze(['background', 'aura', 'back', 'habitat', 'tool', 'pet', 'body', 'face', 'head', 'charm', 'companion', 'foreground_fx', 'hud_front', 'frame']);
const MIN_EQUIP_LEVEL = 10;
function levelForXp(xp) {
  if (!Number.isSafeInteger(xp) || xp < 0) throw new RangeError('Invalid Hatchery XP');
  return XP_THRESHOLDS.filter(threshold => xp >= threshold).length;
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
module.exports = { XP_THRESHOLDS, GEAR_SLOTS, ARENA_STATS, LINEAGES, VISUAL_Z_ORDER, MIN_EQUIP_LEVEL, levelForXp, deepFreeze };
