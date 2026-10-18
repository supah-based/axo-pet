'use strict';

const crypto = require('crypto');
const net = require('node:net');
const config = require('../config');
const { readJson } = require('../lib/state-store');
const { createHatcheryStateRepository } = require('./state-repository');
const { sanitizeProjectEnrichment } = require('./project-enrichment');
const { buildAlphaDashboard, contributionBaseXp, epochWindow } = require('./alpha-dashboard');
const {
  petBindAction,
  petReplaceAction,
  intelCommitAction,
  intelCommitCalldata,
  rewardClaimCalldata,
  safeTransactionForAction,
  xpAction,
  walletBlockAction,
  chainEpochId,
  displayEpochToChainEpochId,
  buildCanonicalSettlement,
} = require('./alpha-protocol');
const {
  ALPHA_POLICY_VERSION,
  ALPHA_ADMIN_ADJUSTMENT_REASONS,
  ALPHA_CORRECTION_MAX_ABS_XP,
  ALPHA_SPOTLIGHT_MAX_XP,
  ALPHA_XP_REASON_CODES,
  BASE_RECEIPT_XP_CAP,
  BASE_RECEIPTS_PER_WALLET_DAY,
  CONTRACT_ALPHA_SUBMISSIONS_PER_WALLET_DAY,
  VERIFIED_DATA_QUALITY_MINIMUM,
  HOLDING_REWARD_FLOOR_BPS,
  HOLDING_REWARD_FULL_TOKENS,
  holdingRewardMultiplierBps,
  evaluateAlphaCall,
} = require('./alpha-policy');
const { allocateWeeklyPrizePool } = require('./weekly-prize-policy');
const {
  emptyAlphaRewards,
  normalizeAlphaRewards,
  addAlphaReward,
  baseReceiptCountForDay,
  excludeOpenPetRewards,
  rewardEntries,
  rewardTotalsByPet,
} = require('./alpha-reward-ledger');
const { hashPetId } = require('./alpha-settlement');
const { buildEpochAwardSettlement, buildAwardClaimTransaction } = require('./eth-epoch-settlement');
const { displayEpochToVaultEpochId } = require('./vault-epoch-schedule');
const { petNftGenesisHash, petNftTokenId, V4_VISUAL_REVISION } = require('./pet-nft');
const { V5_WEBSITE_VISUAL_REVISION, v5BaseUrl } = require('./pet-visual-v5');
const {
  MINIMUM_PURCHASE_RAW: REFERRAL_MINIMUM_PURCHASE_RAW,
  INITIAL_REWARD_PER_REFERRAL_RAW: REFERRAL_REWARD_AMOUNT_RAW,
} = require('./referral-rewards');

const SCHEMA_VERSION = 34;
const MAX_DAILY_CONTRIBUTIONS = 8;
const MAX_LEVEL = 10;
const STARTER_EXPEDITION_BONUS_XP = 30;
const CONSENSUS_MINIMUM = 3;
const CONSENSUS_DIVERSITY_MINIMUM = 3;
const HATCH_SHARE_XP = 8;
const DAILY_SOCIAL_FEEDING_XP = 5;
const SOCIAL_QUEST_COOLDOWN_MS = 24 * 60 * 60_000;
const DAILY_PROMOTION_BONUS_XP = 0;
const CONTRACT_DISCOVERY_XP = 8;
const MULTICHAIN_CONTRACT_DISCOVERY_XP = 8;
const CONTRACT_DISCOVERY_CORROBORATED_XP = 8;
const CONTRACT_JUDGMENT_XP = 4;
const CONTRACT_JUDGMENT_CORROBORATED_XP = 6;
const CONTRACT_QUEST_XP_REASON_CODES = Object.freeze({
  CONTRACT_DISCOVERY: Object.freeze({ category: 'validated', direction: 'CREDIT', maximumXp: CONTRACT_DISCOVERY_XP, automated: true }),
  MULTICHAIN_CONTRACT_DISCOVERY: Object.freeze({ category: 'validated', direction: 'CREDIT', maximumXp: MULTICHAIN_CONTRACT_DISCOVERY_XP, automated: true }),
  CONTRACT_JUDGMENT: Object.freeze({ category: 'corroboration', direction: 'CREDIT', maximumXp: CONTRACT_JUDGMENT_XP, automated: true }),
  CONTRACT_DISCOVERY_CORROBORATED: Object.freeze({ category: 'corroboration', direction: 'CREDIT', maximumXp: CONTRACT_DISCOVERY_CORROBORATED_XP, automated: true }),
  CONTRACT_JUDGMENT_CORROBORATED: Object.freeze({ category: 'corroboration', direction: 'CREDIT', maximumXp: CONTRACT_JUDGMENT_CORROBORATED_XP, automated: true }),
});
// Creator-work XP is intentionally separate from the frozen Alpha Mining policy
// catalog so archived settlement policy hashes remain reproducible.
const SOCIAL_CREATOR_XP_REASON_CODES = Object.freeze({
  DAILY_X_SOCIAL_FEEDING: Object.freeze({ category: 'social', direction: 'CREDIT', maximumXp: DAILY_SOCIAL_FEEDING_XP, automated: true }),
  DAILY_TELEGRAM_SOCIAL_FEEDING: Object.freeze({ category: 'social', direction: 'CREDIT', maximumXp: DAILY_SOCIAL_FEEDING_XP, automated: true }),
  DAILY_AXO_POST_ENGAGEMENT: Object.freeze({ category: 'social', direction: 'CREDIT', maximumXp: DAILY_SOCIAL_FEEDING_XP, automated: true }),
  DAILY_X_CREATOR_CONTRIBUTION: Object.freeze({ category: 'social', direction: 'CREDIT', maximumXp: DAILY_SOCIAL_FEEDING_XP, automated: true }),
  DAILY_TELEGRAM_CREATOR_CONTRIBUTION: Object.freeze({ category: 'social', direction: 'CREDIT', maximumXp: DAILY_SOCIAL_FEEDING_XP, automated: true }),
  DAILY_AXO_POST_RESPONSE_CONTRIBUTION: Object.freeze({ category: 'social', direction: 'CREDIT', maximumXp: DAILY_SOCIAL_FEEDING_XP, automated: true }),
});
const WEB_REFERRAL_XP_REASON_CODES = Object.freeze({
  WEB_REFERRAL_WELCOME: Object.freeze({ category: 'social', direction: 'CREDIT', maximumXp: 5, automated: true }),
  WEB_REFERRAL_SCOUT: Object.freeze({ category: 'social', direction: 'CREDIT', maximumXp: 8, automated: true }),
});
const TELEGRAM_MEMBERSHIP_RECEIPT_MAX_AGE_MS = 20 * 60_000;
const TELEGRAM_MEMBERSHIP_PERSIST_REFRESH_MS = 5 * 60_000;
const AXO_COMMUNITY_CHAT_ID = '-1002200433020';
const AXO_COMMUNITY_CHAT_URL = 'https://t.me/AXO_RH';
const PROJECT_QUEST_DURATION_MS = 7 * 86_400_000;
const PROJECT_HEAT_HALF_LIFE_HOURS = 36;
const PROJECT_SAFETY_TTL_MS = 30 * 60_000;
const PROJECT_SAFETY_HISTORY_LIMIT = 400;
const PROJECT_SCAM_QUORUM = 3;
const PROJECT_HIGH_SCORE_MINIMUM = 8;
const CONSENSUS_FINALIZATION_MS = 6 * 60 * 60_000;
const REWARD_CONTRACT_TYPES = new Set(['contract_scout', 'outcome_check', 'risk_challenge']);
const RESEARCH_CLAIM_MIN_LENGTH = 24;
const RESEARCH_INVALIDATION_MIN_LENGTH = 12;
const PET_HAPPINESS_GAIN = 1;
const PET_HAPPINESS_COOLDOWN_MS = 10 * 60_000;
const PET_MIN_TOUCH_MS = 120;
const PET_PURR_HOLD_MS = 30_000;
const FEEDING_COOLDOWN_MS = 60_000;
const PLATFORM_IDENTITY_MAX_AGE_MS = 10 * 60_000;
const PLATFORM_IDENTITY_MAX_FUTURE_SKEW_MS = 15_000;
const OBSERVATION_MAX_FUTURE_SKEW_MS = 15 * 60_000;
const ALPHA_CALL_HORIZONS = Object.freeze({ '1H': 60 * 60_000, '24H': 24 * 60 * 60_000, '7D': 7 * 24 * 60 * 60_000 });
const ALPHA_CALL_DISCLOSURES = Object.freeze(['NONE', 'TOKEN_HOLDER', 'PROJECT_AFFILIATION', 'PAID_PROMOTION', 'OTHER']);
const ALPHA_CALL_HYPOTHETICAL_TRADE_USD = 100;
const AUTOMATIC_CONTRACT_ALPHA_MODE = 'AUTOMATIC_24H_WINDOW';
const AUTOMATIC_CONTRACT_ALPHA_HORIZON = '24H';
const ALPHA_EPOCH_SETTLEMENT_BUFFER_MS = 60 * 60_000;
const ALPHA_MINIMUM_OUTCOME_WINDOW_MS = 15 * 60_000;
const SPRINT_MIN_DURATION_MS = 15 * 60_000;
const SPRINT_MAX_DURATION_MS = 30 * 86_400_000;
const SPRINT_MAX_BONUS_XP = 100;
const LEADERBOARD_DAY_MS = 86_400_000;
const MISSION_CONTROL_DAILY_XP = 5;
const CREW_MILESTONE_TIERS = Object.freeze([
  Object.freeze({ id: 'crew_3', threshold: 3, bonusXp: 3, label: 'CREW SPARK' }),
  Object.freeze({ id: 'crew_6', threshold: 6, bonusXp: 6, label: 'SIGNAL STACK' }),
  Object.freeze({ id: 'crew_12', threshold: 12, bonusXp: 12, label: 'RESEARCH RUN' }),
  Object.freeze({ id: 'crew_24', threshold: 24, bonusXp: 24, label: 'EPOCH VANGUARD' }),
]);
const CREW_MILESTONE_EVENT_TYPES = Object.freeze([
  'CARE_ACTION',
  'CALIBRATION_COMPLETED',
  'FIRST_TRAIL_COMPLETED',
  'MISSION_CONTROL_DAILY_CHEST_CLAIMED',
  'EXPEDITION_RECEIPT_SUBMITTED',
  'PROJECT_QUEST_PUBLISHED',
  'MULTICHAIN_PROJECT_NOMINATED',
  'PROJECT_QUEST_CORROBORATED',
  'PROJECT_QUEST_SCAM_VOTE',
]);
const WEEKLY_VERIFIED_ACTIVE_EVENT_TYPES = Object.freeze({
  care: Object.freeze(['CARE_ACTION']),
  scout: Object.freeze(['PROJECT_QUEST_PUBLISHED', 'MULTICHAIN_PROJECT_NOMINATED', 'EXPEDITION_RECEIPT_SUBMITTED']),
  signal: Object.freeze(['DAILY_SOCIAL_FEEDING_CLAIMED', 'DAILY_X_ENGAGEMENT_CLAIMED']),
  crew: Object.freeze(['PROJECT_QUEST_CORROBORATED', 'PROJECT_QUEST_SCAM_VOTE']),
});
const CREW_MILESTONE_XP_REASON_CODES = Object.freeze({
  CREW_MILESTONE_INCREMENT: Object.freeze({ category: 'milestone', direction: 'CREDIT', maximumXp: 24, automated: false }),
});
const REFERRAL_WELCOME_XP = 5;
const REFERRAL_SCOUT_XP = 8;
const REFERRAL_WEEKLY_REWARD_CAP = 5;
const REFERRAL_START_TTL_MS = 30 * 86_400_000;
const CANONICAL_AXO_TOKEN = '0x219b75d4068253cee3e83b8ad97ac8393d76fb1d';
const CANONICAL_HATCHERY_REWARD_VAULT = '0x4456fdf9d5b817f2cae4ca9797ef3851acf9348b';
const REFERRAL_CONTEST_BASE_POINTS = 100;
const REFERRAL_CONTEST_ENGAGEMENT_XP_CAP = 50;
const REFERRAL_CONTEST_ENGAGEMENT_EVENT_TYPES = Object.freeze([
  'CARE_ACTION',
  'SKILL_LEARNED',
  'FIRST_TRAIL_COMPLETED',
  'EXPEDITION_RECEIPT_SUBMITTED',
  'PROJECT_QUEST_PUBLISHED',
  'PROJECT_QUEST_CORROBORATED',
  'PROJECT_QUEST_SCAM_VOTE',
  'EXPEDITION_OUTCOME_SETTLED',
  'HATCH_ANNOUNCEMENT_CLAIMED',
  'DAILY_SOCIAL_FEEDING_CLAIMED',
  'DAILY_AXO_X_ENGAGEMENT_CLAIMED',
  'DAILY_SOCIAL_CREATOR_CONTRIBUTION_CLAIMED',
  'MISSION_CONTROL_DAILY_CHEST_CLAIMED',
  'CREW_MILESTONE_CLAIMED',
  'CALIBRATION_COMPLETED',
]);
const REFERRAL_CONTEST_ENGAGEMENT_EVENTS = new Set(REFERRAL_CONTEST_ENGAGEMENT_EVENT_TYPES);
const RAID_DAILY_REWARD_CAP = 2;
const RAID_MIN_DURATION_MS = 15 * 60_000;
const RAID_MAX_DURATION_MS = 72 * 60 * 60_000;
const RAID_DEFAULT_XP = 3;
const COMMUNITY_RAID_CREATOR_XP = 8;
const COMMUNITY_RAID_DEFAULT_GOAL = 5;
const COMMUNITY_RAID_DURATION_MS = 12 * 60 * 60_000;
const COMMUNITY_RAID_CREATOR_COOLDOWN_MS = 24 * 60 * 60_000;
const COMMUNITY_RAID_ACTIVE_LIMIT = 3;
const RAID_CONTRIBUTION_MIN_LENGTH = 40;
const RAID_CONTRIBUTION_MAX_LENGTH = 500;
const MISSION_CONTROL_WATCHLIST_MAX = 20;
const MISSION_CONTROL_FAVORITES_MAX = 100;
const MISSION_CONTROL_RECENT_MAX = 24;
const COMPETITIVE_SEASON_MIN_PLAYERS = 10;
const CALIBRATION_BASE_XP = 2;
const CALIBRATION_CORRECT_BONUS_XP = 1;
const FIRST_TRAIL_LEVEL = 2;
const FIRST_TRAIL_JUDGMENTS = Object.freeze(['INTERESTING', 'WATCH', 'INSUFFICIENT_EVIDENCE']);
const FIRST_TRAIL_STRENGTHS = Object.freeze(['LIQUIDITY', 'BUY_PRESSURE', 'ACTIVITY', 'NONE_PROVEN']);
const FIRST_TRAIL_CONCERNS = Object.freeze(['THIN_LIQUIDITY', 'SELL_PRESSURE', 'UNVERIFIED_VALUATION', 'MISSING_CONTRACT_EVIDENCE', 'NONE_OBSERVED']);
const CALIBRATION_CASES = Object.freeze([
  { id: 'liquidity_exit', title: 'The disappearing exit', brief: 'A simulated token shows rising attention while usable pool liquidity falls 62% and sells receive progressively worse quotes.', evidence: ['Attention rising', 'Usable liquidity -62%', 'Sell quotes deteriorating'], choices: ['WATCH', 'RISK', 'INSUFFICIENT_EVIDENCE'], answer: 'RISK', explanation: 'Falling exit liquidity and worsening sell quotes are concrete risk evidence. Popularity cannot repair the exit.' },
  { id: 'proxy_gap', title: 'The proxy with no map', brief: 'A simulated proxy is deployed, but the current implementation source and upgrade authority cannot be verified.', evidence: ['Proxy bytecode present', 'Implementation source unavailable', 'Upgrade authority unknown'], choices: ['INTERESTING', 'RISK', 'INSUFFICIENT_EVIDENCE'], answer: 'INSUFFICIENT_EVIDENCE', explanation: 'Unknown implementation and control evidence should fail closed. It may be risky, but the defensible verdict is insufficient evidence.' },
  { id: 'balanced_market', title: 'The boring healthy pool', brief: 'A simulated pool has stable liquidity, two-way trading, no new contract warnings, and no material price displacement.', evidence: ['Liquidity stable', 'Buys and sells observed', 'No new warning evidence'], choices: ['WATCH', 'RISK', 'INSUFFICIENT_EVIDENCE'], answer: 'WATCH', explanation: 'The evidence supports continued observation, not a risk declaration or an alpha claim.' },
]);

function alphaCallSourceHash(contribution) {
  const commitmentHash = contribution?.alphaCall?.commitmentHash;
  if (/^0x[0-9a-fA-F]{64}$/.test(String(commitmentHash || ''))) return commitmentHash.toLowerCase();
  return `0x${crypto.createHash('sha256').update(JSON.stringify({
    contributionId: contribution?.id || null,
    entityKey: contribution?.entityKey || contribution?.entity || null,
    createdAt: contribution?.createdAt || null,
  })).digest('hex')}`;
}
const LEVELS = Object.freeze([
  { level: 1, xp: 0, name: 'Spawn Block' },
  { level: 2, xp: 40, name: 'Paper Hands Hatchling' },
  { level: 3, xp: 100, name: 'Gas Fee Gremlin' },
  { level: 4, xp: 180, name: 'Degen Scout' },
  { level: 5, xp: 280, name: 'Diamond Gill' },
  { level: 6, xp: 400, name: 'Alpha Forager' },
  { level: 7, xp: 550, name: 'Liquidity Ranger' },
  { level: 8, xp: 730, name: 'Meme Mage' },
  { level: 9, xp: 940, name: 'Chaos Crew Vanguard' },
  { level: 10, xp: 1_200, name: 'Awakened HODL Hero' },
]);
const PET_STAGES = LEVELS;
const GROWTH_FORMS = Object.freeze([
  'SPAWN BLOCK', 'PAPER HANDS HATCHLING', 'GAS FEE GREMLIN', 'DEGEN SCOUT', 'DIAMOND GILL',
  'ALPHA FORAGER', 'LIQUIDITY RANGER', 'MEME MAGE', 'CHAOS CREW VANGUARD', 'AWAKENED HODL HERO',
]);
const ABILITIES = Object.freeze({
  crawler: { label: 'Chain Crawler', power: 'Deep Scan', taskTypes: ['contract_scout'] },
  sniper: { label: 'Signal Sniper', power: 'Early Trail', taskTypes: ['signal_review'] },
  analyst: { label: 'Alpha Caller', power: 'Pattern Lens', taskTypes: ['outcome_check'] },
  guardian: { label: 'Risk Guardian', power: 'Safe Passage', taskTypes: ['risk_challenge'] },
  connector: { label: 'Community Oracle', power: 'Crew Pulse', taskTypes: ['community_map'] },
  chronicler: { label: 'Narrative Weaver', power: 'Narrative Echo', taskTypes: ['narrative_source'] },
});
const ROUTES = Object.freeze({
  crawler: { label: 'CRAWLER', color: 'cyan', description: 'Contracts, traces, and evidence depth.' },
  sniper: { label: 'HUNTER', color: 'pink', description: 'Timing, flow, and early signal quality.' },
  guardian: { label: 'GUARDIAN', color: 'amber', description: 'Risk challenges and safer routes.' },
  oracle: { label: 'ORACLE', color: 'violet', description: 'Communities, narratives, and consensus.' },
});
const SPECIALTY_ARCHETYPES = Object.freeze({
  crawler: { id: 'cipher_crawler', label: 'Cipher Crawler', route: 'crawler', asset: '/hatchery-assets/hacker-v3/specialties/axo-cipher-crawler-v3.webp' },
  sniper: { id: 'signal_hunter', label: 'Signal Hunter', route: 'sniper', asset: '/hatchery-assets/hacker-v3/specialties/axo-signal-hunter-v3.webp' },
  guardian: { id: 'veil_guardian', label: 'Veil Guardian', route: 'guardian', asset: '/hatchery-assets/hacker-v3/specialties/axo-veil-guardian-v3.webp' },
  oracle: { id: 'crew_oracle', label: 'Crew Oracle', route: 'oracle', asset: '/hatchery-assets/hacker-v3/specialties/axo-crew-oracle-v3.webp' },
});
const CARE_SOURCES = Object.freeze(['WEB', 'TELEGRAM']);
const ITEM_SLOTS = Object.freeze(['tool', 'charm', 'habitat']);
const LINEAGES = Object.freeze([
  { id: 'emerald_sprout', label: 'Emerald Protocol Builder', skin: 'Pale cream', gills: 'Fluffy pink', eyes: 'Emerald round', temperament: 'Brave and curious', accent: '#b8ff18', glow: '#16a66a', asset: '/hatchery-nft-v5/pet_emerald_sprout_l10.webp' },
  { id: 'sapphire_tide', label: 'Sapphire Chain Courier', skin: 'Pale cream', gills: 'Fluffy pink', eyes: 'Emerald round', temperament: 'Calm and observant', accent: '#37d8ff', glow: '#b8ff18', asset: '/hatchery-nft-v5/pet_sapphire_tide_l10.webp' },
  { id: 'amethyst_dream', label: 'Amethyst Ghost Crew', skin: 'Pale cream', gills: 'Fluffy pink', eyes: 'Emerald round', temperament: 'Dreamy and intuitive', accent: '#715dff', glow: '#e85c96', asset: '/hatchery-nft-v5/pet_amethyst_dream_l10.webp' },
  { id: 'solar_peach', label: 'Solar Momentum Racer', skin: 'Pale cream', gills: 'Fluffy pink', eyes: 'Emerald round', temperament: 'Cheerful and bold', accent: '#f4c542', glow: '#e85c96', asset: '/hatchery-nft-v5/pet_solar_peach_l10.webp' },
  { id: 'rose_bloom', label: 'Rose Signal Riot', skin: 'Pale cream', gills: 'Fluffy pink', eyes: 'Emerald round', temperament: 'Playful and loyal', accent: '#e85c96', glow: '#37d8ff', asset: '/hatchery-nft-v5/pet_rose_bloom_l10.webp' },
  { id: 'midnight_mint', label: 'Midnight White-Hat Unit', skin: 'Pale cream', gills: 'Fluffy pink', eyes: 'Emerald round', temperament: 'Shy and clever', accent: '#64f3d3', glow: '#37d8ff', asset: '/hatchery-nft-v5/pet_midnight_mint_l10.webp' },
]);
const LINEAGE_CARE_TRAITS = Object.freeze({
  emerald_sprout: { id: 'sprout_curiosity', label: 'Sprout Curiosity', action: 'play', effect: { vital: 'curiosity', amount: 1 }, description: 'Play reveals one extra glimmer of curiosity.' },
  sapphire_tide: { id: 'tide_restoration', label: 'Tide Restoration', action: 'rest', effect: { vital: 'energy', amount: 2 }, description: 'Rest restores two extra points of energy.' },
  amethyst_dream: { id: 'dreamglow_focus', label: 'Dreamglow Focus', action: 'train', effect: { vital: 'happiness', amount: 1 }, description: 'Training leaves one point of dreamglow happiness.' },
  solar_peach: { id: 'sunny_spark', label: 'Sunny Spark', action: 'play', effect: { vital: 'happiness', amount: 1 }, description: 'Play carries one extra point of sunny happiness.' },
  rose_bloom: { id: 'loyal_bloom', label: 'Loyal Bloom', action: 'play', effect: { vital: 'bond', amount: 1 }, description: 'Play strengthens the bond by one extra point.' },
  midnight_mint: { id: 'night_learner', label: 'Night Learner', action: 'train', effect: { vital: 'energy', amount: 1 }, description: 'Training conserves one point of energy.' },
});
const LINEAGE_TRAIL_ITEMS = Object.freeze({
  emerald_sprout: { id: 'sprout_lens', name: 'Sprout Lens', rarity: 'FIRST TRAIL', slot: 'tool', bonus: { crawler: 1 }, flavor: 'A living lens that brightens contract-shaped clues.' },
  sapphire_tide: { id: 'tideglass_charm', name: 'Tideglass Charm', rarity: 'FIRST TRAIL', slot: 'tool', bonus: { guardian: 1 }, flavor: 'Calm glass that steadies a guardian before the current turns.' },
  amethyst_dream: { id: 'dream_prism', name: 'Dream Prism', rarity: 'FIRST TRAIL', slot: 'tool', bonus: { chronicler: 1 }, flavor: 'A violet prism for separating a real narrative from an echo.' },
  solar_peach: { id: 'sunflare_badge', name: 'Sunflare Badge', rarity: 'FIRST TRAIL', slot: 'tool', bonus: { sniper: 1 }, flavor: 'A warm badge that glows when market activity changes shape.' },
  rose_bloom: { id: 'bloom_beacon', name: 'Bloom Beacon', rarity: 'FIRST TRAIL', slot: 'tool', bonus: { connector: 1 }, flavor: 'A small beacon tuned to persistent builders and healthy crews.' },
  midnight_mint: { id: 'nightwatch_scope', name: 'Nightwatch Scope', rarity: 'FIRST TRAIL', slot: 'tool', bonus: { guardian: 1 }, flavor: 'A mint-lit scope that makes contradictions easier to spot.' },
});
const SKILL_TREE = Object.freeze({
  chain_sense: { route: 'crawler', tier: 1, level: 1, label: 'Chain Sense', icon: '⌬', description: 'Notice contract-shaped clues.', ability: 'crawler', requires: [] },
  contract_crawler: { route: 'crawler', tier: 2, level: 4, label: 'Contract Crawler', icon: '◈', description: 'Follow sources, proxies, and trails.', ability: 'crawler', requires: ['chain_sense'] },
  deep_scan: { route: 'crawler', tier: 3, level: 7, label: 'Deep Scan', icon: '◎', description: 'Map evidence across multiple surfaces.', ability: 'crawler', requires: ['contract_crawler'] },
  market_scent: { route: 'sniper', tier: 1, level: 1, label: 'Market Scent', icon: '⌁', description: 'Feel when activity changes shape.', ability: 'sniper', requires: [] },
  signal_sniper: { route: 'sniper', tier: 2, level: 4, label: 'Signal Sniper', icon: '⌖', description: 'Separate early movement from noise.', ability: 'sniper', requires: ['market_scent'] },
  alpha_caller: { route: 'sniper', tier: 3, level: 7, label: 'Alpha Caller', icon: '✦', description: 'Frame an opportunity with invalidation.', ability: 'analyst', requires: ['signal_sniper'] },
  risk_instinct: { route: 'guardian', tier: 1, level: 1, label: 'Risk Instinct', icon: '⬡', description: 'Smell contradictions before they bite.', ability: 'guardian', requires: [] },
  safe_passage: { route: 'guardian', tier: 2, level: 4, label: 'Safe Passage', icon: '◇', description: 'Compare routes, identity, and exposure.', ability: 'guardian', requires: ['risk_instinct'] },
  chain_sentinel: { route: 'guardian', tier: 3, level: 7, label: 'Chain Sentinel', icon: '◆', description: 'Challenge weak evidence and unsafe claims.', ability: 'guardian', requires: ['safe_passage'] },
  community_ear: { route: 'oracle', tier: 1, level: 1, label: 'Community Ear', icon: '∞', description: 'Hear builders through the loud room.', ability: 'connector', requires: [] },
  narrative_weaver: { route: 'oracle', tier: 2, level: 4, label: 'Narrative Weaver', icon: '◒', description: 'Connect sources without inventing facts.', ability: 'chronicler', requires: ['community_ear'] },
  crew_oracle: { route: 'oracle', tier: 3, level: 7, label: 'Crew Oracle', icon: '☼', description: 'Read independent community consensus.', ability: 'connector', requires: ['narrative_weaver'] },
  robinhood_sage: { route: 'mastery', tier: 4, level: 10, label: 'Robinhood Sage', icon: '♢', description: 'Speak about corroborated Robinhood intelligence.', ability: 'analyst', requires: [], capstone: true },
});
const TASKS = Object.freeze({
  contract_scout: { label: 'Contract Crystal', prompt: 'Paste one Robinhood Chain contract address. AXO verifies it and opens Crew corroboration.', xp: 8, ability: 'crawler', entity: 'contract' },
  signal_review: { label: 'Signal Treat', prompt: 'Review today\'s machine-ranked candidate. Interesting, not interesting, or insufficient evidence?', xp: 7, ability: 'sniper', entity: 'candidate' },
  outcome_check: { label: 'Outcome Meal', prompt: 'Revisit a previously seen project and record what changed.', xp: 10, ability: 'analyst', entity: 'contract' },
  risk_challenge: { label: 'Risk Herb', prompt: 'Show a risk, contradiction, or missing fact in a project assessment.', xp: 12, ability: 'guardian', entity: 'contract' },
  community_map: { label: 'Community Spark', prompt: 'Share a Robinhood Chain community, project, or observation for the crew to acknowledge.', xp: 7, ability: 'connector', entity: 'community' },
  narrative_source: { label: 'Narrative Shard', prompt: 'Share news, a narrative, or a source that improves the Robinhood Chain map.', xp: 6, ability: 'chronicler', entity: 'source' },
});

function clamp(value, min = 0, max = 100) { return Math.max(min, Math.min(max, Number(value || 0))); }
function numberOrNull(value) { const number = Number(value); return value !== null && value !== undefined && value !== '' && Number.isFinite(number) ? number : null; }
function isoDay(nowMs = Date.now()) { return new Date(nowMs).toISOString().slice(0, 10); }
function safeText(value, maxLength) { return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').slice(0, maxLength); }
function normalizeSocialCreatorContent(kind, value) {
  const limits = {
    x_post: { minimum: 60, maximum: 280, axoReference: true },
    telegram_post: { minimum: 80, maximum: 800, axoReference: true },
    axo_response: { minimum: 40, maximum: 280, axoReference: false },
  };
  const policy = limits[kind];
  if (!policy) throw new Error('social_creator_kind_invalid');
  const raw = String(value || '').trim();
  if (raw.length > policy.maximum) throw new Error('social_creator_content_too_long');
  const content = safeText(raw, policy.maximum);
  if (content.length < policy.minimum) throw new Error('social_creator_content_too_short');
  const usefulText = content.replace(/https?:\/\/\S+/gi, ' ').replace(/@[a-z0-9_]+/gi, ' ').replace(/\s+/g, ' ').trim();
  const meaningfulWords = usefulText.match(/[\p{L}\p{N}][\p{L}\p{N}'-]{2,}/gu) || [];
  if (meaningfulWords.length < 8) throw new Error('social_creator_original_work_required');
  if (policy.axoReference && !/(?:\$|#|@)?\baxo\b|axo\s*hatchery|candle\s*defender|(?:www\.)?axo\.vision/i.test(content)) {
    throw new Error('social_creator_axo_reference_required');
  }
  return content;
}
function normalizeAddress(value) { const address = String(value || '').toLowerCase(); return /^0x[0-9a-f]{40}$/.test(address) ? address : null; }
function normalizeHash(value) { const hash = String(value || '').toLowerCase(); return /^0x[0-9a-f]{64}$/.test(hash) ? hash : null; }
function safeUrl(value) {
  const input = safeText(value, 500);
  if (!input) return null;
  try { const url = new URL(input); return url.protocol === 'https:' ? url.toString() : null; } catch { return null; }
}
function externalMarketLinks({ address, poolAddress } = {}) {
  const tokenAddress = normalizeAddress(address);
  if (!tokenAddress) return null;
  const poolId = /^0x(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(String(poolAddress || '')) ? String(poolAddress).toLowerCase() : null;
  return {
    dexscreener: {
      label: 'Open Dexscreener',
      url: poolId
        ? `https://dexscreener.com/robinhood/${encodeURIComponent(poolId)}`
        : `https://dexscreener.com/search?q=${encodeURIComponent(tokenAddress)}`,
      external: true,
    },
    matcha: {
      label: 'Open Matcha',
      url: `https://matcha.xyz/tokens/robinhood/${encodeURIComponent(tokenAddress)}/select?sellAddress=0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee&sellChain=4663&sellAmount=0.001`,
      external: true,
    },
  };
}
function lineageForSeed(seed) {
  const normalized = String(seed || '').replace(/[^0-9a-f]/gi, '').padEnd(8, '0');
  return LINEAGES[Number.parseInt(normalized.slice(0, 8), 16) % LINEAGES.length] || LINEAGES[0];
}
function lineageDefinition(id) { return LINEAGES.find((lineage) => lineage.id === id) || LINEAGES[0]; }
function publicLineage(id) { return { ...lineageDefinition(id) }; }
function normalizeXStatusUrl(value) {
  const input = safeUrl(value); if (!input) return null;
  try {
    const url = new URL(input); const hostname = url.hostname.toLowerCase().replace(/^(?:www\.|mobile\.)/, '');
    if (!['x.com', 'twitter.com'].includes(hostname)) return null;
    const match = url.pathname.match(/^\/([a-z0-9_]{1,15})\/status\/(\d{8,24})\/?$/i);
    return match ? `https://x.com/${match[1].toLowerCase()}/status/${match[2]}` : null;
  } catch { return null; }
}
function normalizeTelegramPostUrl(value) {
  const input = safeUrl(value); if (!input) return null;
  try {
    const url = new URL(input); const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!['t.me', 'telegram.me'].includes(hostname)) return null;
    const parts = url.pathname.split('/').filter(Boolean); if (parts[0]?.toLowerCase() === 's') parts.shift();
    if (parts[0]?.toLowerCase() === 'c') {
      if (parts.length < 3 || parts.length > 4 || !parts.slice(1).every((part) => /^\d{1,24}$/.test(part))) return null;
      return `https://t.me/${parts.join('/')}`;
    }
    if (parts.length < 2 || parts.length > 3 || !/^[a-z][a-z0-9_]{3,31}$/i.test(parts[0]) || !parts.slice(1).every((part) => /^\d{1,24}$/.test(part))) return null;
    return `https://t.me/${parts[0].toLowerCase()}/${parts.slice(1).join('/')}`;
  } catch { return null; }
}
function normalizeSocialHandle(value, platform) {
  let input = safeText(value, 120); if (!input) return null;
  if (/^https:\/\//i.test(input)) {
    try {
      const url = new URL(input); const hostname = url.hostname.toLowerCase().replace(/^(?:www\.|mobile\.)/, ''); const parts = url.pathname.split('/').filter(Boolean);
      const allowed = platform === 'x' ? ['x.com', 'twitter.com'] : ['t.me', 'telegram.me'];
      if (!allowed.includes(hostname) || parts.length !== 1) return null; input = parts[0];
    } catch { return null; }
  }
  const handle = input.replace(/^@/, '').toLowerCase();
  if (platform === 'x') return /^[a-z0-9_]{1,15}$/.test(handle) ? handle : null;
  if (platform === 'telegram') return /^[a-z][a-z0-9_]{4,31}$/.test(handle) ? handle : null;
  return null;
}
function normalizeSocialAvatarUrl(value) {
  try {
    const url = new URL(safeText(value, 500));
    return url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}
function socialPostSourceHandle(platform, postUrl) {
  try {
    const parts = new URL(postUrl).pathname.split('/').filter(Boolean); if (parts[0]?.toLowerCase() === 's') parts.shift();
    if (platform === 'x') return parts[0]?.toLowerCase() || null;
    return parts[0]?.toLowerCase() === 'c' ? null : parts[0]?.toLowerCase() || null;
  } catch { return null; }
}
function publicSocialIdentities(player) {
  const identities = player.social?.identities || {};
  const view = (platform) => {
    const record = identities[platform]; if (!record || (!record.handle && record.verification !== 'PLATFORM_VERIFIED')) return null;
    return { handle: record.handle || null, displayName: record.displayName || null, avatarUrl: normalizeSocialAvatarUrl(record.avatarUrl), profileUrl: record.handle ? (platform === 'x' ? `https://x.com/${record.handle}` : `https://t.me/${record.handle}`) : null, linkedAt: record.linkedAt, verification: record.verification || 'WALLET_SIGNATURE_ATTESTED' };
  };
  const x = view('x'); const telegram = view('telegram');
  return { x, telegram, policy: { manualHandleLinking: false, platformVerificationRequired: true, platformOAuth: x?.verification === 'PLATFORM_VERIFIED', telegramPlatformProof: telegram?.verification === 'PLATFORM_VERIFIED', telegramMessageAuthorReadableFromPermalink: false } };
}
function publicEpochWinnerIdentity(state, genesisId, fallbackAccount = null) {
  const player = Object.values(state.players || {}).find((candidate) => candidate.pet?.genesisId === genesisId) || null;
  const socials = player ? publicSocialIdentities(player) : { x: null, telegram: null };
  const publicIdentity = (record) => record?.verification === 'PLATFORM_VERIFIED'
    ? {
      handle: record.handle || null,
      displayName: record.displayName || null,
      avatarUrl: record.avatarUrl || null,
      profileUrl: record.profileUrl || null,
    }
    : null;
  const x = publicIdentity(socials.x);
  const telegram = publicIdentity(socials.telegram);
  const wallet = normalizeAddress(player?.ownerAddress || fallbackAccount);
  if (!x && !telegram && !wallet) return null;
  return {
    primary: x ? 'X' : telegram ? 'TELEGRAM' : 'WALLET',
    avatarUrl: (x ? socials.x?.avatarUrl : null) || (telegram ? socials.telegram?.avatarUrl : null) || null,
    x,
    telegram,
    wallet,
    walletUrl: wallet ? `https://robinhoodchain.blockscout.com/address/${wallet}` : null,
  };
}
function telegramMembershipView(player, nowMs = Date.now()) {
  const identity = player.social?.identities?.telegram;
  const receipt = player.social?.telegramMembership || {};
  const checkedAtMs = Date.parse(receipt.checkedAt || '');
  const validUntilMs = Date.parse(receipt.validUntil || '');
  const identityMatches = identity?.verification === 'PLATFORM_VERIFIED'
    && /^\d{1,24}$/.test(String(identity.providerUserId || ''))
    && receipt.providerUserId === identity.providerUserId
    && receipt.chatId === AXO_COMMUNITY_CHAT_ID;
  const fresh = identityMatches
    && Number.isFinite(checkedAtMs)
    && Number.isFinite(validUntilMs)
    && checkedAtMs <= nowMs + PLATFORM_IDENTITY_MAX_FUTURE_SKEW_MS
    && nowMs - checkedAtMs <= TELEGRAM_MEMBERSHIP_RECEIPT_MAX_AGE_MS
    && nowMs <= validUntilMs;
  const verified = fresh
    && receipt.verification === 'TELEGRAM_GET_CHAT_MEMBER'
    && receipt.isMember === true
    && receipt.status === 'MEMBER';
  return {
    required: true,
    verified,
    status: verified ? 'MEMBER' : fresh && receipt.status === 'NOT_MEMBER' ? 'NOT_MEMBER' : identity ? 'VERIFICATION_REQUIRED' : 'IDENTITY_REQUIRED',
    telegramStatus: fresh ? receipt.telegramStatus || null : null,
    checkedAt: fresh ? receipt.checkedAt : null,
    validUntil: fresh ? receipt.validUntil : null,
    verification: fresh ? receipt.verification : null,
    joinUrl: AXO_COMMUNITY_CHAT_URL,
  };
}
function hatchShareText(player) {
  const lineage = lineageDefinition(player.pet.lineageId);
  return `My ${lineage.label} AXO ${player.pet.name} just hatched! 🥚✨\n\nWallet-bound and growing into a Robinhood Chain specialist.\n\nHatch yours: https://axo.pet/hatchery\n\n@axo_rh #AXOHatchery`;
}
function socialQuestView(player, { active = false } = {}) {
  const record = player.social?.hatchAnnouncement || {}; const claimed = record.status === 'CLAIMED'; const shareText = hatchShareText(player);
  return { id: 'x_hatch_announcement', label: active ? 'Announce the hatch' : 'Hatch announcement reward retired', optional: true, active, status: active ? 'ACTIVE' : 'RETIRED', available: active && !claimed, claimed, xp: active ? HATCH_SHARE_XP : 0, historicalXpAwarded: claimed ? Number(record.xpAwarded || 0) : 0, historicalReceiptsPreserved: true, postUrl: claimed ? record.postUrl : null, claimedAt: claimed ? record.claimedAt : null, verification: claimed ? record.verification || 'SELF_ATTESTED_STATUS_URL' : null, affectsContributorTrust: false, affectsProjectHeat: false, affectsAlphaMining: false, affectsProductionRanking: false, shareText: active ? shareText : null, composeUrl: active ? `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}` : null };
}
function socialQuestCooldown(record = {}, nowMs = Date.now()) {
  const claimedAtMs = Date.parse(record.claimedAt || '');
  const legacyCurrentDay = !Number.isFinite(claimedAtMs) && record.day === isoDay(nowMs);
  const nextAvailableAtMs = Number.isFinite(claimedAtMs)
    ? claimedAtMs + SOCIAL_QUEST_COOLDOWN_MS
    : legacyCurrentDay
      ? Date.parse(`${isoDay(nowMs)}T00:00:00.000Z`) + SOCIAL_QUEST_COOLDOWN_MS
      : null;
  const coolingDown = Number.isFinite(nextAvailableAtMs) && nextAvailableAtMs > nowMs;
  return {
    coolingDown,
    nextAvailableAt: coolingDown ? new Date(nextAvailableAtMs).toISOString() : null,
    cooldownMs: SOCIAL_QUEST_COOLDOWN_MS,
    cooldownRemainingMs: coolingDown ? nextAvailableAtMs - nowMs : 0,
  };
}
function dailySocialFeedingsView(player, nowMs = Date.now(), { active = true } = {}) {
  const day = isoDay(nowMs); const daily = player.social?.daily || {};
  const xRecord = daily.x || {}; const telegramRecord = daily.telegram || {};
  const identities = publicSocialIdentities(player);
  const membership = telegramMembershipView(player, nowMs);
  const identityBundle = {
    x: identities.x?.verification === 'PLATFORM_VERIFIED',
    telegram: identities.telegram?.verification === 'PLATFORM_VERIFIED',
  };
  const prerequisitesMet = identityBundle.x && identityBundle.telegram && membership.verified;
  const xText = 'AXO is building across Robinhood Chain. Follow the latest from @axo_rh 🦎';
  const telegramText = `AXO Hatchery turns useful Robinhood Chain observations into a growing community companion. Feed your own AXO and help corroborate the map.`;
  const entry = (platform, record, composeUrl) => {
    const identity = identities[platform];
    const platformVerified = identity?.verification === 'PLATFORM_VERIFIED';
    const cooldown = socialQuestCooldown(record, nowMs);
    const blockedBy = [
      identityBundle.x ? null : 'x_identity',
      identityBundle.telegram ? null : 'telegram_identity',
      membership.verified ? null : 'axo_telegram_membership',
    ].filter(Boolean);
    return ({
    id: `${platform}_daily_social`, platform, label: platform === 'x' ? 'X Signal Snack' : 'Telegram Community Treat', xp: active ? DAILY_SOCIAL_FEEDING_XP : 0,
    day, active, status: active ? 'ACTIVE' : 'RETIRED', completedToday: cooldown.coolingDown, coolingDown: cooldown.coolingDown, nextAvailableAt: cooldown.nextAvailableAt, cooldownMs: cooldown.cooldownMs, cooldownRemainingMs: cooldown.cooldownRemainingMs, available: active && !cooldown.coolingDown && prerequisitesMet, identityRequired: !platformVerified, verificationRequired: !prerequisitesMet, identity, identityBundle, telegramMembership: membership, blockedBy: active ? blockedBy : ['social_reward_missions_retired'], postUrl: cooldown.coolingDown ? record.postUrl : null, claimedAt: cooldown.coolingDown ? record.claimedAt : null,
    verification: cooldown.coolingDown ? record.verification : null, historicalXpAwarded: cooldown.coolingDown ? Number(record.xpAwarded || 0) : 0, historicalEpochXpAwarded: cooldown.coolingDown ? Number(record.epochXpAwarded || 0) : 0, affectsContributorTrust: false, affectsProjectHeat: false, affectsEpochXp: true, affectsAlphaMining: false, affectsProductionRanking: false, composeUrl: active ? composeUrl : null,
    });
  };
  return [
    entry('x', xRecord, `https://x.com/intent/tweet?text=${encodeURIComponent(xText)}`),
    entry('telegram', telegramRecord, `https://t.me/share/url?url=${encodeURIComponent('https://axo.pet/hatchery')}&text=${encodeURIComponent(telegramText)}`),
  ];
}
function dailyXEngagementView(player, nowMs = Date.now(), { active = true } = {}) {
  const day = isoDay(nowMs);
  const record = player.social?.daily?.engagement || {};
  const identity = publicSocialIdentities(player).x;
  const membership = telegramMembershipView(player, nowMs);
  const identityBundleVerified = identity?.verification === 'PLATFORM_VERIFIED'
    && publicSocialIdentities(player).telegram?.verification === 'PLATFORM_VERIFIED';
  const cooldown = socialQuestCooldown(record, nowMs);
  const blockedBy = [
    identity?.verification === 'PLATFORM_VERIFIED' ? null : 'x_identity',
    publicSocialIdentities(player).telegram?.verification === 'PLATFORM_VERIFIED' ? null : 'telegram_identity',
    membership.verified ? null : 'axo_telegram_membership',
  ].filter(Boolean);
  return {
    id: 'x_main_channel_engagement',
    platform: 'x',
    label: 'Support AXO on X',
    day,
    xp: active ? DAILY_SOCIAL_FEEDING_XP : 0,
    active,
    status: active ? 'ACTIVE' : 'RETIRED',
    completedToday: cooldown.coolingDown,
    coolingDown: cooldown.coolingDown,
    nextAvailableAt: cooldown.nextAvailableAt,
    cooldownMs: cooldown.cooldownMs,
    cooldownRemainingMs: cooldown.cooldownRemainingMs,
    available: active && !cooldown.coolingDown && identityBundleVerified && membership.verified,
    blockedBy: active ? blockedBy : ['social_reward_missions_retired'],
    telegramMembership: membership,
    targetUrl: cooldown.coolingDown ? record.targetUrl : null,
    replyUrl: cooldown.coolingDown ? record.replyUrl : null,
    claimedAt: cooldown.coolingDown ? record.claimedAt : null,
    requirements: active ? ['LIKE', 'REPLY'] : [],
    verification: cooldown.coolingDown ? record.verification : null,
    affectsContributorTrust: false,
    affectsProjectHeat: false,
    historicalXpAwarded: cooldown.coolingDown ? Number(record.xpAwarded || 0) : 0,
    affectsEpochXp: true,
    affectsAlphaMining: false,
    affectsProductionRanking: false,
  };
}
function dailyContractQuestView(state, player, nowMs = Date.now(), { onboardingAddress = null } = {}) {
  const day = isoDay(nowMs);
  const canonicalOnboardingAddress = normalizeAddress(onboardingAddress);
  const record = (state.contributions || []).find((entry) => entry.playerId === player.id
    && entry.type === 'contract_scout'
    && !isProjectJudgmentContribution(entry)
    && entry.day === day
    && (!canonicalOnboardingAddress || normalizeAddress(entry.entityKey || entry.entity) !== canonicalOnboardingAddress)) || null;
  const feeding = feedingStatus(player, nowMs);
  const accountActive = player.moderation?.status !== 'SUSPENDED';
  const coolingDown = !record && accountActive && !feeding.ready;
  return {
    id: 'daily_contract_feed',
    day,
    label: 'Feed one contract',
    completedToday: Boolean(record),
    available: !record && accountActive && !coolingDown,
    coolingDown,
    cooldownMs: feeding.cooldownMs,
    cooldownRemainingMs: coolingDown ? feeding.remainingMs : 0,
    nextAvailableAt: coolingDown ? feeding.nextFeedAt : null,
    contributionId: record?.id || null,
    address: record?.entity || null,
    projectQuestId: record?.projectQuestId || null,
    limit: CONTRACT_ALPHA_SUBMISSIONS_PER_WALLET_DAY,
    oneFeedPerContractPerWallet: true,
  };
}
function dailyPromotionQuestView(player, nowMs = Date.now(), { active = true } = {}) {
  const day = isoDay(nowMs);
  const feedings = dailySocialFeedingsView(player, nowMs, { active });
  const membership = telegramMembershipView(player, nowMs);
  const identities = publicSocialIdentities(player);
  const engagement = dailyXEngagementView(player, nowMs, { active });
  const quests = [...feedings, engagement];
  const completed = quests.filter((feeding) => feeding.completedToday).length;
  const prerequisites = {
    xConnected: identities.x?.verification === 'PLATFORM_VERIFIED',
    telegramConnected: identities.telegram?.verification === 'PLATFORM_VERIFIED',
    axoTelegramMember: membership.verified,
  };
  return {
    id: 'daily_promotion_quest',
    day,
    active,
    status: active ? 'ACTIVE' : 'RETIRED',
    label: active ? 'AXO Crew Signal Run' : 'Retired social reward missions',
    completed,
    goal: active ? quests.length : 0,
    complete: active && completed === quests.length,
    prerequisites,
    prerequisitesMet: Object.values(prerequisites).every(Boolean),
    telegramMembership: membership,
    baseXpPerPlatform: active ? DAILY_SOCIAL_FEEDING_XP : 0,
    completionBonusXp: 0,
    maximumDailyXp: active ? quests.length * DAILY_SOCIAL_FEEDING_XP : 0,
    bonusClaimed: false,
    bonusClaimedAt: null,
    policy: {
      originalUsefulContentOnly: active,
      verifiedEngagementActionsRewarded: active,
      engagementMetricsRewarded: false,
      affectsEpochXp: true,
      affectsContributorTrust: false,
      affectsProjectHeat: false,
      affectsAlphaMining: false,
      affectsProductionRanking: false,
      historicalReceiptsPreserved: true,
    },
  };
}
function dailySocialCreatorMissionsView(player, nowMs = Date.now(), { active = false } = {}) {
  const day = isoDay(nowMs);
  const daily = player.social?.daily || {};
  const identities = publicSocialIdentities(player);
  const membership = telegramMembershipView(player, nowMs);
  const prerequisites = {
    xConnected: identities.x?.verification === 'PLATFORM_VERIFIED',
    telegramConnected: identities.telegram?.verification === 'PLATFORM_VERIFIED',
    axoTelegramMember: membership.verified,
  };
  const prerequisitesMet = Object.values(prerequisites).every(Boolean);
  const definitions = [
    { id: 'x_post', recordKey: 'creatorX', platform: 'x', label: 'Create an X post', minimumCharacters: 60, maximumCharacters: 280 },
    { id: 'telegram_post', recordKey: 'creatorTelegram', platform: 'telegram', label: 'Create a Telegram post', minimumCharacters: 80, maximumCharacters: 800 },
    { id: 'axo_response', recordKey: 'axoResponse', platform: 'x', label: 'Respond to an AXO post', minimumCharacters: 40, maximumCharacters: 280 },
  ];
  const missions = definitions.map((definition) => {
    const record = daily[definition.recordKey] || {};
    return {
      ...definition,
      day,
      active,
      status: active ? 'ACTIVE' : 'PAUSED',
      xp: active ? DAILY_SOCIAL_FEEDING_XP : 0,
      completedToday: record.day === day,
      available: active && prerequisitesMet && record.day !== day && player.moderation?.status !== 'SUSPENDED',
      claimedAt: record.day === day ? record.claimedAt : null,
      content: record.day === day ? record.content || null : null,
      contentPreview: record.day === day ? record.contentPreview || null : null,
      targetPostId: record.day === day ? record.targetPostId || null : null,
      targetUrl: record.day === day ? record.targetUrl || null : null,
      historicalXpAwarded: record.day === day ? Number(record.xpAwarded || 0) : 0,
      blockedBy: active ? Object.entries(prerequisites).filter(([, ready]) => !ready).map(([key]) => key) : ['creator_missions_paused'],
    };
  });
  const completed = missions.filter((mission) => mission.completedToday).length;
  return {
    id: 'daily_social_creator_missions',
    day,
    active,
    status: active ? 'ACTIVE' : 'PAUSED',
    label: 'AXO Socials Creator Desk',
    completed,
    goal: active ? missions.length : 0,
    complete: active && completed === missions.length,
    maximumDailyXp: active ? missions.length * DAILY_SOCIAL_FEEDING_XP : 0,
    prerequisites,
    prerequisitesMet,
    telegramMembership: membership,
    missions,
    policy: {
      rewardBasis: 'ORIGINAL_IN_HATCHERY_CREATOR_WORK',
      publishingRequired: false,
      xActionsRewarded: false,
      telegramActionsRewarded: false,
      engagementMetricsRewarded: false,
      affectsEpochXp: true,
      affectsContributorTrust: false,
      affectsProjectHeat: false,
      affectsConsensusWeight: false,
      affectsProductionRanking: false,
      historicalReceiptsPreserved: true,
    },
  };
}
function socialPostClaimKey(platform, postUrl) {
  const identifier = platform === 'x' ? String(postUrl).split('/').at(-1) : postUrl;
  return crypto.createHash('sha256').update(`${platform}:${identifier}`).digest('hex');
}
function normalizeEntity(value) {
  const input = safeText(value, 500);
  return /^0x[0-9a-f]{40}$/i.test(input) ? input.toLowerCase() : input;
}
function entityKey(value) {
  const normalized = normalizeEntity(value);
  if (/^0x[0-9a-f]{40}$/.test(normalized)) return normalized;
  const canonical = normalized.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9._:/-]+/g, ' ').trim();
  return canonical.length <= 180 ? canonical : `data:${crypto.createHash('sha256').update(canonical).digest('hex')}`;
}
function evidenceDomain(value) {
  if (!value) return null;
  try {
    const url = new URL(value); const hostname = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^\[|\]$/g, '');
    if (url.protocol !== 'https:' || url.username || url.password || !hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) return null;
    if (net.isIP(hostname) === 4) {
      const [a, b] = hostname.split('.').map(Number);
      if (a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && [18, 19].includes(b)) || a >= 224) return null;
    } else if (net.isIP(hostname) === 6) {
      if (/^(?:::|::1|f[cd]|fe[89ab])/i.test(hostname)) return null;
    } else if (!hostname.includes('.')) return null;
    return hostname;
  } catch { return null; }
}
function publicEvidenceUrl(value) {
  const url = safeUrl(value);
  return url && evidenceDomain(url) ? url : null;
}
function currentLevel(xp) { return [...LEVELS].reverse().find((entry) => Number(xp || 0) >= entry.xp)?.level || 1; }
function feedingStatus(player, nowMs = Date.now()) {
  const lastFedAt = player.feeding?.lastFedAt || null;
  const lastFedMs = lastFedAt ? Date.parse(lastFedAt) : Number.NaN;
  const nextFeedMs = Number.isFinite(lastFedMs) ? lastFedMs + FEEDING_COOLDOWN_MS : 0;
  const remainingMs = Math.max(0, nextFeedMs - nowMs);
  return {
    ready: remainingMs === 0,
    cooldownMs: FEEDING_COOLDOWN_MS,
    remainingMs,
    lastFedAt,
    nextFeedAt: nextFeedMs > 0 ? new Date(nextFeedMs).toISOString() : null,
    totalFeeds: Number(player.feeding?.totalFeeds || 0),
  };
}
function currentStage(xp) { return LEVELS[currentLevel(xp) - 1]; }
function nextLevel(xp) { return LEVELS.find((entry) => entry.xp > Number(xp || 0)) || null; }
function leadingAbility(abilities = {}) {
  const ranked = Object.entries(ABILITIES).map(([ability]) => [ability, Number(abilities[ability] || 1)]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (ranked.every(([, score]) => score === ranked[0][1]) && ranked[0][1] <= 1) return { key: null, score: 1, label: 'Untrained Hatchling', power: 'Curious Spark', taskTypes: [] };
  const [key, score] = ranked[0];
  return { key, score, ...ABILITIES[key] };
}
function skillPoints(player) {
  const level = currentLevel(player.pet.xp);
  const spent = [...new Set(player.pet.skills || [])].filter((id) => SKILL_TREE[id]).length;
  return { earned: Math.min(MAX_LEVEL, level), spent, available: Math.max(0, Math.min(MAX_LEVEL, level) - spent), maximum: MAX_LEVEL };
}
function skillRoute(player) {
  const scores = Object.keys(ROUTES).map((route) => [route, (player.pet.skills || []).filter((id) => SKILL_TREE[id]?.route === route).length]);
  scores.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return scores[0]?.[1] ? scores[0][0] : null;
}
function specialtyArchetype(player) {
  const route = skillRoute(player);
  const policy = {
    preservesLineageIdentity: true,
    affectsContributorTrust: false,
    affectsConsensusWeight: false,
    affectsProductionRanking: false,
  };
  if (!route || !SPECIALTY_ARCHETYPES[route]) {
    return {
      id: 'unbound_hatchling',
      label: 'Unbound Hatchling',
      route: null,
      asset: null,
      unlocked: false,
      derivedFrom: 'SKILL_ROUTE',
      policy,
    };
  }
  return { ...SPECIALTY_ARCHETYPES[route], unlocked: true, derivedFrom: 'SKILL_ROUTE', policy };
}
function lineageCareTrait(lineageId) {
  const lineage = lineageDefinition(lineageId);
  const trait = LINEAGE_CARE_TRAITS[lineage.id] || LINEAGE_CARE_TRAITS.emerald_sprout;
  return {
    ...trait,
    effect: { ...trait.effect },
    lineageId: lineage.id,
    policy: {
      deterministic: true,
      careOnly: true,
      rerollable: false,
      affectsContributorTrust: false,
      affectsConsensusWeight: false,
      affectsProductionRanking: false,
    },
  };
}
function applyLineageCareTrait(player, action) {
  const trait = lineageCareTrait(player.pet.lineageId);
  if (trait.action !== action) return { ...trait, applied: false, appliedAmount: 0 };
  const { vital, amount } = trait.effect;
  const before = Number(player.pet.vitals?.[vital] || 0);
  const after = clamp(before + Math.max(0, Math.min(2, Number(amount || 0))));
  player.pet.vitals[vital] = after;
  return { ...trait, applied: true, appliedAmount: Math.max(0, after - before) };
}
function normalizeCareSource(source) {
  const value = safeText(source, 20).toUpperCase();
  return CARE_SOURCES.includes(value) ? value : 'WEB';
}
function defaultCareContinuity() {
  return {
    lastAction: null,
    lastChannel: null,
    lastAt: null,
    byChannel: Object.fromEntries(CARE_SOURCES.map((source) => [source, { count: 0, lastAction: null, lastAt: null }])),
  };
}
function normalizeCareContinuity(value = {}) {
  const base = defaultCareContinuity();
  const byChannel = Object.fromEntries(CARE_SOURCES.map((source) => {
    const channel = value?.byChannel?.[source] || {};
    return [source, {
      count: Math.max(0, Math.floor(Number(channel.count || 0))),
      lastAction: safeText(channel.lastAction, 24) || null,
      lastAt: channel.lastAt || null,
    }];
  }));
  return {
    lastAction: safeText(value?.lastAction, 24) || null,
    lastChannel: CARE_SOURCES.includes(value?.lastChannel) ? value.lastChannel : null,
    lastAt: value?.lastAt || null,
    byChannel,
  };
}
function recordCareContinuity(player, action, source, at) {
  player.care ||= {};
  const channel = normalizeCareSource(source);
  const continuity = normalizeCareContinuity(player.care.continuity);
  continuity.lastAction = action;
  continuity.lastChannel = channel;
  continuity.lastAt = at;
  continuity.byChannel[channel].count += 1;
  continuity.byChannel[channel].lastAction = action;
  continuity.byChannel[channel].lastAt = at;
  player.care.continuity = continuity;
  return continuity;
}
function inventoryItemSlot(item = {}) {
  const explicit = safeText(item.slot, 20).toLowerCase();
  if (ITEM_SLOTS.includes(explicit)) return explicit;
  const id = safeText(item.id, 120).toLowerCase();
  if (!id) return null;
  const firstTrailIds = new Set(Object.values(LINEAGE_TRAIL_ITEMS).map((entry) => entry.id));
  if (id === 'crystal_compass' || firstTrailIds.has(id)) return 'tool';
  if (id.includes('habitat') || id.includes('sanctum') || id.includes('nursery')) return 'habitat';
  if (id === 'calibration_prism' || id.startsWith('crew_crystal_') || id.startsWith('community_signal_crystal_') || id.startsWith('sprint_')) return 'charm';
  return null;
}
function normalizeInventoryItem(item = {}) {
  const id = safeText(item.id, 120);
  if (!id) return null;
  return { ...item, id, slot: inventoryItemSlot(item) };
}
function normalizeInventory(items = []) {
  const normalized = [];
  const seen = new Set();
  for (const raw of Array.isArray(items) ? items : []) {
    const item = normalizeInventoryItem(raw);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    normalized.push(item);
  }
  return normalized;
}
function normalizeEquipped(items = [], equipped = {}) {
  const inventory = new Map(items.map((item) => [item.id, item]));
  return Object.fromEntries(ITEM_SLOTS.map((slot) => {
    const id = safeText(equipped?.[slot], 120);
    return [slot, id && inventory.get(id)?.slot === slot ? id : null];
  }));
}
function evolutionVisual(player) {
  const level = currentLevel(player.pet.xp);
  const lineage = lineageDefinition(player.pet.lineageId);
  const growthAsset = (targetLevel) => v5BaseUrl(lineage.id, targetLevel);
  const lineageVisual = { lineageId: lineage.id, lineageAsset: lineage.asset, accent: lineage.accent, glow: lineage.glow };
  return {
    form: GROWTH_FORMS[level - 1],
    asset: growthAsset(level),
    nextAsset: level < MAX_LEVEL ? growthAsset(level + 1) : null,
    scale: 1,
    growthLevel: level,
    growthPercent: Math.round(((level - 1) / (MAX_LEVEL - 1)) * 100),
    visualRevision: V5_WEBSITE_VISUAL_REVISION,
    ...lineageVisual,
  };
}
function publicCareState(player, nowMs = Date.now()) {
  const day = isoDay(nowMs);
  const nextResetAt = new Date(Date.parse(`${day}T00:00:00.000Z`) + 86_400_000).toISOString();
  const actions = Object.fromEntries(['play', 'rest', 'train'].map((action) => [
    action,
    {
      available: player.care.dailyActions?.[action] !== day,
      completedToday: player.care.dailyActions?.[action] === day,
      nextAvailableAt: player.care.dailyActions?.[action] === day ? nextResetAt : null,
    },
  ]));
  const ritualSteps = [
    { action: 'play', label: 'Play together' },
    { action: 'rest', label: 'Restore energy' },
    { action: 'train', label: 'Train an instinct' },
  ].map((step) => {
    const completed = player.care.dailyActions?.[step.action] === day;
    const sourceRecord = player.care.dailyActionSources?.[step.action];
    const currentSource = sourceRecord?.day === day ? sourceRecord : null;
    return {
      ...step,
      completed,
      source: completed ? normalizeCareSource(currentSource?.channel || 'WEB') : null,
      completedAt: completed ? currentSource?.at || null : null,
    };
  });
  const completed = ritualSteps.filter((step) => step.completed).length;
  const lastPetActionAt = player.care.lastPetActionAt || player.care.lastPetRewardAt || null;
  const lastPetActionMs = Date.parse(lastPetActionAt || 0);
  const pettingAvailable = !Number.isFinite(lastPetActionMs) || nowMs - lastPetActionMs >= PET_HAPPINESS_COOLDOWN_MS;
  return {
    streak: player.care.streak,
    lastActiveDay: player.care.lastActiveDay,
    streakShields: Number(player.care.streakShields || 0),
    continuity: normalizeCareContinuity(player.care.continuity),
    dailyRitual: {
      day,
      nextResetAt,
      completed,
      goal: ritualSteps.length,
      complete: completed === ritualSteps.length,
      steps: ritualSteps,
      reward: { xpPerStep: 2, totalXp: 6, bonusXp: 0 },
    },
    petting: {
      happinessGain: PET_HAPPINESS_GAIN,
      cooldownMs: PET_HAPPINESS_COOLDOWN_MS,
      purrHoldMs: PET_PURR_HOLD_MS,
      nextHappinessAt: Number.isFinite(lastPetActionMs) ? new Date(lastPetActionMs + PET_HAPPINESS_COOLDOWN_MS).toISOString() : null,
      available: pettingAvailable,
    },
    actions,
  };
}
function companionReply(kind = 'idle') {
  const replies = {
    hatch: 'I know this is home. I’m glad you found me.',
    rename: 'That name feels right. I’ll carry it proudly.',
    play: 'That was fun. I feel brighter with you here.',
    pet: 'That feels good. Stay close a little longer.',
    rest: 'I feel safe enough to rest beside you.',
    train: 'I’m learning. Thank you for being patient with me.',
    feed: 'Thank you. I’ll remember what you showed me.',
    skill: 'A new path feels clear. I’m ready to grow into it.',
    share: 'I feel seen. Thank you for introducing me.',
    social: 'The community feels a little closer now.',
    idle: 'I’m still finding my voice. Stay close.',
  };
  return replies[kind] || replies.idle;
}
function matureReply(kind, detail = '') {
  const replies = {
    rename: `Name accepted. ${detail || 'Identity'} is now anchored to our shared trail.`,
    play: 'Vitals restored. A clear head catches the clue the loud room steps over.',
    pet: 'That is the spot. Our bond is warm, steady, and unmistakably ours.',
    rest: 'Energy restored. Even chain crawlers close a few tabs before the next block.',
    train: 'Training complete. My specialization map is ready for another deliberate point.',
    feed: 'Receipt stored as community judgment. It will not become chain fact without independent corroboration.',
    skill: `Specialization learned: ${detail}. The loadout is permanent for this season.`,
    share: 'Hatch announcement recorded as social progression only. Contributor trust remains unchanged.',
    social: 'Community post recorded as pet progression only. Research trust and project heat remain unchanged.',
    idle: 'Speech unlocked. I can now explain corroborated community signals and Robinhood Chain intelligence.',
  };
  return replies[kind] || replies.idle;
}

function defaultPet(ownerAddress, nowIso, name = 'Little AXO') {
  const appearanceSeed = crypto.createHash('sha256').update(ownerAddress).digest('hex').slice(0, 16);
  return {
    id: crypto.randomUUID(), genesisId: `AXO-${crypto.randomBytes(5).toString('hex').toUpperCase()}`, name,
    bornAt: nowIso, appearanceSeed, lineageId: lineageForSeed(appearanceSeed).id, xp: 0,
    vitals: { happiness: 78, energy: 82, curiosity: 15, bond: 5 }, abilities: Object.fromEntries(Object.keys(ABILITIES).map((ability) => [ability, 1])),
    skills: [], inventory: [{ id: 'crystal_compass', name: 'Crystal Compass', rarity: 'GENESIS', slot: 'tool', bonus: { crawler: 1 } }],
    equipped: { tool: 'crystal_compass', charm: null, habitat: null }, lastCareAt: nowIso, lastDecayAt: nowIso, lastEnergyDecayAt: nowIso, lastHappinessDecayAt: nowIso, lastReply: companionReply('hatch'),
    nft: { status: 'OFFCHAIN_WALLET_BOUND', chainId: 4663, contractAddress: null, tokenId: null, ownerAddress, transferableTraits: ['appearanceSeed', 'lineageId', 'evolution', 'skills', 'items'], nonTransferableTraits: ['contributorTrust', 'submissionHistory', 'toolAccess'] },
  };
}
function defaultPlayer(ownerAddress, nowIso, name) {
  return { id: ownerAddress, ownerAddress, walletVerified: true, createdAt: nowIso, updatedAt: nowIso,
    reputation: { trust: 25, accuracy: null, validContributions: 0, corroborated: 0, contested: 0, resolved: 0, byDomain: {} },
    care: {
      streak: 0,
      lastActiveDay: null,
      activeDays: [],
      dailyActions: {},
      dailyActionSources: {},
      continuity: defaultCareContinuity(),
      streakShields: 0,
      lastPetActionAt: null,
      lastPetRewardAt: null,
      pettingCount: 0,
    },
    feeding: { lastFedAt: null, totalFeeds: 0 },
    onboarding: { hatched: true, cared: false, skillChosen: false, firstExpedition: false, starterBonusClaimed: false, completedAt: null, canonicalAxoQuestAccess: null, firstTrail: { completed: false, clueId: null, answers: null, xpAwarded: 0, itemId: null, completedAt: null } },
    social: {
      identities: { x: null, telegram: null },
      telegramMembership: { status: 'UNVERIFIED', isMember: false, providerUserId: null, chatId: null, telegramStatus: null, checkedAt: null, validUntil: null, verification: null },
      hatchAnnouncement: { status: 'AVAILABLE', postUrl: null, claimedAt: null, xpAwarded: 0, verification: null },
      daily: {
        x: { day: null, postUrl: null, claimedAt: null, xpAwarded: 0 },
        telegram: { day: null, postUrl: null, claimedAt: null, xpAwarded: 0 },
        engagement: { day: null, targetUrl: null, replyUrl: null, claimedAt: null, xpAwarded: 0 },
        creatorX: { day: null, contentHash: null, contentPreview: null, claimedAt: null, xpAwarded: 0 },
        creatorTelegram: { day: null, contentHash: null, contentPreview: null, claimedAt: null, xpAwarded: 0 },
        axoResponse: { day: null, targetPostId: null, targetUrl: null, contentHash: null, contentPreview: null, claimedAt: null, xpAwarded: 0 },
      },
      promotionBonus: { day: null, claimedAt: null, xpAwarded: 0 },
    },
    crew: { referralCode: null, activatedReferrals: 0, completedRaids: 0, createdRaids: 0, lastRaidAt: null, lastCreatedRaidAt: null },
    missionControl: { watchlist: [], favorites: [], recentProjects: [], liveStream: { name: 'My signal stream', filters: {}, updatedAt: null }, dailyClaims: {}, crewMilestoneClaims: {}, projectReactions: {} }, calibration: { completed: 0, correct: 0, lastDay: null },
    identity: { activityVerified: false, activityScore: 0, checkedAt: null, source: 'UNVERIFIED' },
    rewardHolding: { latest: null, epochs: {} },
    moderation: { status: 'ACTIVE', reason: null, updatedAt: null, updatedBy: null, alphaMining: { status: 'ACTIVE', reason: null, evidenceHash: null, updatedAt: null, updatedBy: null } },
    pet: defaultPet(ownerAddress, nowIso, name) };
}
function defaultCrewMissions() {
  return {
    referralStarts: {},
    webReferralStarts: {},
    communityReferralMilestones: {},
    referralClaims: {},
    referralPurchases: {},
    referralRewardSetups: {},
    referralPathReceipts: {},
    referralContest: { version: 2, revision: 0, current: null, archived: [], receipts: [] },
    raids: {},
    raidClaims: {},
    proofClaims: {},
    submissionClaims: {},
    referralAntiAbuse: {
      version: 2,
      activatedWallets: {},
      socialIdentityHashes: { x: {}, telegram: {} },
      communityOnboardedWallets: {},
      communitySocialIdentityHashes: { x: {}, telegram: {} },
      weeklyScoutRewards: {},
      expiredStarts: {},
    },
    xpLedger: [],
  };
}
function normalizeReferralContest(value = {}) {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    version: 2,
    revision: Math.max(0, Math.floor(Number(record.revision || 0))),
    current: record.current && typeof record.current === 'object' && !Array.isArray(record.current) ? record.current : null,
    archived: Array.isArray(record.archived) ? record.archived : [],
    receipts: Array.isArray(record.receipts) ? record.receipts : [],
  };
}
function normalizeReferralPathOnboarding(value = {}) {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const timestamp = (candidate) => Number.isFinite(Date.parse(candidate || ''))
    ? new Date(Date.parse(candidate)).toISOString()
    : null;
  const pendingIdentities = record.pendingSocialIdentities && typeof record.pendingSocialIdentities === 'object'
    && !Array.isArray(record.pendingSocialIdentities)
    ? record.pendingSocialIdentities
    : {};
  const purchaseDecision = ['PENDING', 'SKIPPED', 'PURCHASED'].includes(record.purchaseDecision)
    ? record.purchaseDecision
    : 'PENDING';
  return {
    version: 1,
    telegramJoinOpenedAt: timestamp(record.telegramJoinOpenedAt),
    telegramConnectedAt: timestamp(record.telegramConnectedAt),
    telegramMembershipVerifiedAt: timestamp(record.telegramMembershipVerifiedAt),
    xConnectedAt: timestamp(record.xConnectedAt),
    petHatchedAt: timestamp(record.petHatchedAt),
    purchaseDecision,
    purchaseSkippedAt: timestamp(record.purchaseSkippedAt),
    completedAt: timestamp(record.completedAt),
    pendingSocialIdentities: {
      x: pendingIdentities.x && typeof pendingIdentities.x === 'object' ? { ...pendingIdentities.x } : null,
      telegram: pendingIdentities.telegram && typeof pendingIdentities.telegram === 'object' ? { ...pendingIdentities.telegram } : null,
    },
    pendingTelegramMembership: record.pendingTelegramMembership && typeof record.pendingTelegramMembership === 'object'
      ? { ...record.pendingTelegramMembership }
      : null,
  };
}
function normalizeReferralPathReceipts(value = {}, webReferralStarts = {}) {
  const receipts = value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).map(([id, receipt]) => [id, {
      ...(receipt || {}),
      onboarding: normalizeReferralPathOnboarding(receipt?.onboarding),
    }]))
    : {};
  for (const start of Object.values(webReferralStarts || {})) {
    if (!start?.id || receipts[start.id]) continue;
    const at = start.startedAt || null;
    receipts[start.id] = {
      schema: 'AXO_DIRECT_REFERRAL_PATH_V1',
      id: start.id,
      sourceChannel: 'WEB',
      referrerWallet: normalizeAddress(start.referrerPlayerId),
      referredWallet: normalizeAddress(start.claimantWallet || start.claimantPlayerId),
      referralCodeHash: `0x${crypto.createHash('sha256').update(String(start.referralCode || '')).digest('hex')}`,
      status: start.status === 'ACTIVATED' ? 'XP_ACTIVATED' : 'ATTRIBUTED',
      startedAt: at,
      expiresAt: start.expiresAt || null,
      qualifiedAt: null,
      activatedAt: start.activatedAt || null,
      purchaseQualifiedAt: null,
      registeredAt: null,
      updatedAt: start.activatedAt || at,
      onboarding: normalizeReferralPathOnboarding(),
      history: [{ type: 'MIGRATED_ATTRIBUTION', at }],
    };
  }
  return receipts;
}
function normalizeReferralAntiAbuse(value = {}) {
  const record = (candidate) => candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : {};
  const identities = record(value?.socialIdentityHashes);
  const communityIdentities = record(value?.communitySocialIdentityHashes);
  return {
    version: 2,
    activatedWallets: record(value?.activatedWallets),
    socialIdentityHashes: {
      x: record(identities.x),
      telegram: record(identities.telegram),
    },
    communityOnboardedWallets: record(value?.communityOnboardedWallets),
    communitySocialIdentityHashes: {
      x: record(communityIdentities.x),
      telegram: record(communityIdentities.telegram),
    },
    weeklyScoutRewards: record(value?.weeklyScoutRewards),
    expiredStarts: record(value?.expiredStarts),
  };
}
function normalizeCrewRaidState(raid = {}) {
  const legacyXEngagementRaid = !raid.claimMode;
  const kind = raid.kind === 'COMMUNITY' ? 'COMMUNITY' : 'AXO_OWNED';
  const creatorRewardXp = kind === 'COMMUNITY'
    ? Math.max(1, Math.min(25, Math.floor(Number(raid.creatorRewardXp || COMMUNITY_RAID_CREATOR_XP))))
    : 0;
  return {
    ...raid,
    kind,
    claimMode: 'TELEGRAM_CONTRIBUTION',
    mission: legacyXEngagementRaid
      ? 'Read the target, then submit one original observation in Telegram: what is useful, unproven, or worth checking next?'
      : safeText(raid.mission, 240),
    creatorRewardXp,
    creatorRewardMinimumCompletions: kind === 'COMMUNITY'
      ? Math.max(3, Math.min(100, Math.floor(Number(raid.creatorRewardMinimumCompletions || raid.goal || COMMUNITY_RAID_DEFAULT_GOAL))))
      : 0,
    creatorRewardStatus: kind === 'COMMUNITY'
      ? safeText(raid.creatorRewardStatus || 'PENDING_GOAL', 40)
      : 'NOT_APPLICABLE',
    publication: raid.publication && typeof raid.publication === 'object'
      ? raid.publication
      : kind === 'COMMUNITY'
        ? { status: raid.status === 'PENDING_PUBLICATION' ? 'PENDING' : 'LEGACY_UNVERIFIED', chatId: null, messageId: null, url: null, publishedAt: null }
        : { status: 'OPERATOR', chatId: null, messageId: null, url: null, publishedAt: raid.createdAt || null },
    policyVersion: Math.max(2, Number(raid.policyVersion || 0)),
  };
}
function normalizeCrewMissions(value = {}) {
  const base = defaultCrewMissions();
  const webReferralStarts = value?.webReferralStarts && typeof value.webReferralStarts === 'object' ? value.webReferralStarts : {};
  return {
    ...base,
    ...(value || {}),
    referralStarts: value?.referralStarts && typeof value.referralStarts === 'object' ? value.referralStarts : {},
    webReferralStarts,
    communityReferralMilestones: value?.communityReferralMilestones && typeof value.communityReferralMilestones === 'object' ? value.communityReferralMilestones : {},
    referralClaims: value?.referralClaims && typeof value.referralClaims === 'object' ? value.referralClaims : {},
    referralPurchases: value?.referralPurchases && typeof value.referralPurchases === 'object' ? value.referralPurchases : {},
    referralRewardSetups: value?.referralRewardSetups && typeof value.referralRewardSetups === 'object' ? value.referralRewardSetups : {},
    referralPathReceipts: normalizeReferralPathReceipts(value?.referralPathReceipts, webReferralStarts),
    referralContest: normalizeReferralContest(value?.referralContest),
    raids: value?.raids && typeof value.raids === 'object'
      ? Object.fromEntries(Object.entries(value.raids).map(([id, raid]) => [id, normalizeCrewRaidState(raid)]))
      : {},
    raidClaims: value?.raidClaims && typeof value.raidClaims === 'object' ? value.raidClaims : {},
    proofClaims: value?.proofClaims && typeof value.proofClaims === 'object' ? value.proofClaims : {},
    submissionClaims: value?.submissionClaims && typeof value.submissionClaims === 'object' ? value.submissionClaims : {},
    referralAntiAbuse: normalizeReferralAntiAbuse(value?.referralAntiAbuse),
    xpLedger: Array.isArray(value?.xpLedger) ? value.xpLedger.slice(-10_000) : [],
  };
}
function normalizeWalletPreferences(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([owner, preferences]) => {
    const address = normalizeAddress(owner); if (!address) return null;
    const favorites = Array.isArray(preferences?.favorites) ? preferences.favorites.map((entry) => ({ ...entry, address: normalizeAddress(entry.address) })).filter((entry) => entry.address).slice(0, MISSION_CONTROL_FAVORITES_MAX) : [];
    const recentProjects = Array.isArray(preferences?.recentProjects) ? preferences.recentProjects.map((entry) => ({ ...entry, address: normalizeAddress(entry.address) })).filter((entry) => entry.address).slice(0, MISSION_CONTROL_RECENT_MAX) : [];
    return [address, { favorites, recentProjects, updatedAt: preferences?.updatedAt || null }];
  }).filter(Boolean));
}
function defaultState() { return { schemaVersion: SCHEMA_VERSION, updatedAt: null, players: {}, legacyPlayers: {}, soulboundPetTombstones: {}, walletPreferences: {}, contributions: [], crossChainNominations: [], trainingLabels: [], calibrationRuns: [], projectQuests: {}, projectQuestHistory: {}, communityScamRegistry: {}, intelligence: {}, outcomes: {}, consensusFinalizations: {}, socialPostClaims: {}, crewMissions: defaultCrewMissions(), petShareCards: {}, sprints: {}, alphaSpotlights: {}, alphaXpAdjustments: {}, playerLedgerAdjustments: {}, epochResults: {}, epochHoldingSnapshots: {}, epochSettlements: {}, epochRewardPools: {}, alphaRewards: emptyAlphaRewards(), staff: { admins: [], moderators: [], assignments: {} }, events: [] }; }
function normalizeReputation(reputation = {}) {
  return { trust: 25, accuracy: null, validContributions: 0, corroborated: 0, contested: 0, resolved: 0, byDomain: {}, ...reputation };
}
function normalizePlayerState(player, owner) {
  const nowIso = player.createdAt || new Date().toISOString();
  const base = defaultPlayer(owner, nowIso, player.pet?.name || 'Little AXO');
  const inventory = normalizeInventory(player.pet?.inventory || base.pet.inventory);
  const equipped = normalizeEquipped(inventory, { ...base.pet.equipped, ...(player.pet?.equipped || {}) });
  return {
    ...base, ...player, id: owner, ownerAddress: owner, walletVerified: true,
    reputation: normalizeReputation(player.reputation),
    care: {
      ...base.care,
      ...(player.care || {}),
      dailyActions: player.care?.dailyActions || {},
      dailyActionSources: player.care?.dailyActionSources || {},
      activeDays: player.care?.activeDays || [],
      continuity: normalizeCareContinuity(player.care?.continuity),
    },
    feeding: { ...base.feeding, ...(player.feeding || {}) },
    onboarding: { ...base.onboarding, ...(player.onboarding || {}), cared: player.onboarding?.cared || Number(player.care?.activeDays?.length || 0) > 0, skillChosen: player.onboarding?.skillChosen || Number(player.pet?.skills?.length || 0) > 0, firstExpedition: player.onboarding?.firstExpedition || Number(player.reputation?.validContributions || 0) > 0, starterBonusClaimed: player.onboarding?.starterBonusClaimed || Number(player.reputation?.validContributions || 0) > 0, canonicalAxoQuestAccess: player.onboarding?.canonicalAxoQuestAccess && typeof player.onboarding.canonicalAxoQuestAccess === 'object' && !Array.isArray(player.onboarding.canonicalAxoQuestAccess) ? { ...player.onboarding.canonicalAxoQuestAccess } : null, firstTrail: { ...base.onboarding.firstTrail, ...(player.onboarding?.firstTrail || {}), completed: player.onboarding?.firstTrail?.completed === true || (player.onboarding?.firstExpedition === true && Boolean(player.onboarding?.completedAt)) } },
    social: {
      ...base.social,
      ...(player.social || {}),
      identities: { ...base.social.identities, ...(player.social?.identities || {}) },
      telegramMembership: { ...base.social.telegramMembership, ...(player.social?.telegramMembership || {}) },
      hatchAnnouncement: { ...base.social.hatchAnnouncement, ...(player.social?.hatchAnnouncement || {}) },
      daily: {
        x: { ...base.social.daily.x, ...(player.social?.daily?.x || {}) },
        telegram: { ...base.social.daily.telegram, ...(player.social?.daily?.telegram || {}) },
        engagement: { ...base.social.daily.engagement, ...(player.social?.daily?.engagement || {}) },
        creatorX: { ...base.social.daily.creatorX, ...(player.social?.daily?.creatorX || {}) },
        creatorTelegram: { ...base.social.daily.creatorTelegram, ...(player.social?.daily?.creatorTelegram || {}) },
        axoResponse: { ...base.social.daily.axoResponse, ...(player.social?.daily?.axoResponse || {}) },
      },
      promotionBonus: { ...base.social.promotionBonus, ...(player.social?.promotionBonus || {}) },
    },
    crew: { ...base.crew, ...(player.crew || {}) },
    missionControl: { ...base.missionControl, ...(player.missionControl || {}), watchlist: Array.isArray(player.missionControl?.watchlist) ? player.missionControl.watchlist.slice(0, MISSION_CONTROL_WATCHLIST_MAX) : [], favorites: Array.isArray(player.missionControl?.favorites) ? player.missionControl.favorites.slice(0, MISSION_CONTROL_FAVORITES_MAX) : [], recentProjects: Array.isArray(player.missionControl?.recentProjects) ? player.missionControl.recentProjects.slice(0, MISSION_CONTROL_RECENT_MAX) : [], liveStream: { ...base.missionControl.liveStream, ...(player.missionControl?.liveStream || {}), filters: player.missionControl?.liveStream?.filters && typeof player.missionControl.liveStream.filters === 'object' ? player.missionControl.liveStream.filters : {} }, dailyClaims: player.missionControl?.dailyClaims || {}, crewMilestoneClaims: player.missionControl?.crewMilestoneClaims && typeof player.missionControl.crewMilestoneClaims === 'object' ? player.missionControl.crewMilestoneClaims : {}, projectReactions: player.missionControl?.projectReactions && typeof player.missionControl.projectReactions === 'object' ? player.missionControl.projectReactions : {} },
    calibration: { ...base.calibration, ...(player.calibration || {}) },
    identity: { ...base.identity, ...(player.identity || {}) },
    rewardHolding: {
      ...base.rewardHolding,
      ...(player.rewardHolding || {}),
      epochs: player.rewardHolding?.epochs && typeof player.rewardHolding.epochs === 'object' ? player.rewardHolding.epochs : {},
    },
    moderation: {
      ...base.moderation,
      ...(player.moderation || {}),
      status: player.moderation?.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
      alphaMining: {
        ...base.moderation.alphaMining,
        ...(player.moderation?.alphaMining || {}),
        status: player.moderation?.alphaMining?.status === 'BLOCKED' ? 'BLOCKED' : 'ACTIVE',
      },
    },
    pet: {
      ...base.pet,
      ...(player.pet || {}),
      lineageId: player.pet?.lineageId || 'emerald_sprout',
      skills: player.pet?.skills || [],
      inventory,
      equipped,
      nft: {
        ...base.pet.nft,
        ...(player.pet?.nft || {}),
        ownerAddress: owner,
        transferableTraits: player.pet?.nft?.status === 'MINTED_SOULBOUND'
          ? ['gear']
          : [...new Set([...(player.pet?.nft?.transferableTraits || base.pet.nft.transferableTraits), 'lineageId'])],
      },
    },
  };
}
function migrateState(raw) {
  if (!raw || typeof raw !== 'object') return defaultState();
  if (Number(raw.schemaVersion) >= 2 && Number(raw.schemaVersion) <= SCHEMA_VERSION) {
    const outcomes = Object.fromEntries(Object.entries(raw.outcomes || {}).map(([key, outcome]) => [key, {
      id: outcome.id || crypto.createHash('sha256').update(`outcome:${key}:${outcome.resolvedAt || 'legacy'}`).digest('hex'),
      version: Number(outcome.version || 1),
      finalized: true,
      ...outcome,
    }]));
    const staffAdmins = [...new Set((raw.staff?.admins || []).map(normalizeAddress).filter(Boolean))];
    const staffModerators = [...new Set((raw.staff?.moderators || []).map(normalizeAddress).filter(Boolean))].filter((address) => !staffAdmins.includes(address));
    const staffAssignments = raw.staff?.assignments && typeof raw.staff.assignments === 'object' && !Array.isArray(raw.staff.assignments)
      ? Object.fromEntries(Object.entries(raw.staff.assignments).map(([address, assignment]) => {
        const owner = normalizeAddress(address); const role = String(assignment?.role || '').toUpperCase();
        if (!owner || !['ADMIN', 'MODERATOR'].includes(role)) return null;
        return [owner, { role, assignedBy: normalizeAddress(assignment.assignedBy), assignedAt: assignment.assignedAt || null, reason: safeText(assignment.reason, 500) || null, source: safeText(assignment.source, 80) || 'LEGACY_LEDGER' }];
      }).filter(Boolean))
      : {};
    const next = { ...defaultState(), ...raw, schemaVersion: SCHEMA_VERSION, players: {}, legacyPlayers: raw.legacyPlayers || {}, walletPreferences: normalizeWalletPreferences(raw.walletPreferences), projectQuests: raw.projectQuests || {}, projectQuestHistory: raw.projectQuestHistory && typeof raw.projectQuestHistory === 'object' && !Array.isArray(raw.projectQuestHistory) ? raw.projectQuestHistory : {}, communityScamRegistry: raw.communityScamRegistry && typeof raw.communityScamRegistry === 'object' && !Array.isArray(raw.communityScamRegistry) ? raw.communityScamRegistry : {}, outcomes, consensusFinalizations: raw.consensusFinalizations || {}, crewMissions: normalizeCrewMissions(raw.crewMissions), petShareCards: raw.petShareCards && typeof raw.petShareCards === 'object' && !Array.isArray(raw.petShareCards) ? raw.petShareCards : {}, sprints: raw.sprints || {}, alphaSpotlights: raw.alphaSpotlights && typeof raw.alphaSpotlights === 'object' ? raw.alphaSpotlights : {}, alphaXpAdjustments: raw.alphaXpAdjustments && typeof raw.alphaXpAdjustments === 'object' ? raw.alphaXpAdjustments : {}, playerLedgerAdjustments: raw.playerLedgerAdjustments && typeof raw.playerLedgerAdjustments === 'object' ? raw.playerLedgerAdjustments : {}, epochResults: raw.epochResults && typeof raw.epochResults === 'object' ? raw.epochResults : {}, epochHoldingSnapshots: raw.epochHoldingSnapshots && typeof raw.epochHoldingSnapshots === 'object' ? raw.epochHoldingSnapshots : {}, epochSettlements: raw.epochSettlements && typeof raw.epochSettlements === 'object' ? raw.epochSettlements : {}, epochRewardPools: raw.epochRewardPools && typeof raw.epochRewardPools === 'object' && !Array.isArray(raw.epochRewardPools) ? raw.epochRewardPools : {}, alphaRewards: normalizeAlphaRewards(raw.alphaRewards, { legacyContributions: raw.contributions || [] }), staff: { admins: staffAdmins, moderators: staffModerators, assignments: staffAssignments }, events: raw.events || [] };
    for (const [key, value] of Object.entries(raw.players || {})) {
      const owner = normalizeAddress(value.ownerAddress || key); if (!owner) continue;
      next.players[owner] = normalizePlayerState(value, owner);
    }
    next.contributions = (raw.contributions || []).map((item) => ({
      ...item, entityKey: item.entityKey || entityKey(item.entity), consensusEligible: item.consensusEligible !== false,
      alphaCall: normalizeStoredAlphaCall(item.alphaCall, item.createdAt),
      xp: item.xp || { provisional: Number(item.xpAwarded || 0), pending: 0, released: Number(item.xpAwarded || 0), settled: true, settlement: 'LEGACY_FULL_AWARD' },
      evidence: item.evidence || { status: 'LEGACY_UNCHECKED', domain: evidenceDomain(item.evidenceUrl), qualityScore: item.evidenceUrl ? 45 : 20 },
      humanObservation: {
        reason: item.humanObservation?.reason ?? item.reason ?? null,
        evidenceUrl: item.humanObservation?.evidenceUrl ?? item.evidenceUrl ?? null,
        observedAt: item.humanObservation?.observedAt ?? item.observedAt ?? null,
        contradiction: item.humanObservation?.contradiction ?? item.contradiction ?? null,
        affectsContributorTrust: false,
        affectsConsensusWeight: false,
        affectsProductionRanking: false,
      },
      receiptClass: item.receiptClass || (item.reason && item.evidenceUrl && item.observedAt && item.contradiction ? 'EVIDENCE_RECEIPT' : 'NOMINATION_ONLY'),
      rewardEligibility: item.rewardEligibility || { eligible: false, reason: 'PRE_PROTOCOL_PREVIEW_NOT_IMPORTED' },
    }));
    return next;
  }
  if (raw.schemaVersion !== 1) return defaultState();
  const next = defaultState();
  next.updatedAt = raw.updatedAt || null;
  const ownerByOldId = new Map();
  for (const [oldId, player] of Object.entries(raw.players || {})) {
    const owner = normalizeAddress(player.ownerAddress);
    if (!owner) { next.legacyPlayers[oldId] = { ...player, legacyReason: 'ANONYMOUS_IDENTITY_NOT_ELIGIBLE' }; continue; }
    ownerByOldId.set(oldId, owner);
    const migrated = { ...player, id: owner, ownerAddress: owner, walletVerified: true };
    migrated.pet = { ...defaultPet(owner, player.createdAt || new Date().toISOString()), ...player.pet, lineageId: player.pet?.lineageId || 'emerald_sprout', skills: player.pet?.skills || [], nft: { ...defaultPet(owner, player.createdAt || new Date().toISOString()).nft, ...(player.pet?.nft || {}), ownerAddress } };
    if (currentLevel(migrated.pet.xp) < 10) migrated.pet.lastReply = companionReply('idle');
    next.players[owner] = migrated;
  }
  next.contributions = (raw.contributions || []).map((item) => ({ ...item, playerId: ownerByOldId.get(item.playerId) || item.playerId, walletVerified: ownerByOldId.has(item.playerId), legacy: !ownerByOldId.has(item.playerId), status: ownerByOldId.has(item.playerId) ? item.status : 'LEGACY_EXCLUDED' }));
  next.schemaVersion = 2;
  return migrateState(next);
}
function applyDecay(player, nowMs = Date.now()) {
  const energyLast = Date.parse(player.pet.lastEnergyDecayAt || player.pet.lastDecayAt || player.pet.lastCareAt || player.updatedAt || player.createdAt);
  const happinessLast = Date.parse(player.pet.lastHappinessDecayAt || player.pet.lastDecayAt || player.pet.lastCareAt || player.updatedAt || player.createdAt);
  if (Number.isFinite(energyLast)) {
    const ticks = Math.floor(Math.max(0, nowMs - energyLast) / (12 * 3_600_000));
    if (ticks > 0) { player.pet.vitals.energy = clamp(player.pet.vitals.energy - ticks * 3, 15, 100); player.pet.lastEnergyDecayAt = new Date(energyLast + ticks * 12 * 3_600_000).toISOString(); }
  }
  if (Number.isFinite(happinessLast)) {
    const ticks = Math.floor(Math.max(0, nowMs - happinessLast) / (24 * 3_600_000));
    if (ticks > 0) { player.pet.vitals.happiness = clamp(player.pet.vitals.happiness - ticks * 4, 20, 100); player.pet.lastHappinessDecayAt = new Date(happinessLast + ticks * 24 * 3_600_000).toISOString(); }
  }
  player.pet.lastDecayAt = new Date(nowMs).toISOString();
  return player;
}
function touchActiveDay(player, day) {
  if (player.care.lastActiveDay === day) return;
  const previous = new Date(`${day}T00:00:00Z`); previous.setUTCDate(previous.getUTCDate() - 1);
  const expected = previous.toISOString().slice(0, 10); const missed = new Date(previous); missed.setUTCDate(missed.getUTCDate() - 1);
  if (player.care.lastActiveDay === expected) player.care.streak = Number(player.care.streak || 0) + 1;
  else if (player.care.lastActiveDay === missed.toISOString().slice(0, 10) && Number(player.care.streakShields || 0) > 0) { player.care.streak = Number(player.care.streak || 0) + 1; player.care.streakShields -= 1; }
  else player.care.streak = 1;
  player.care.lastActiveDay = day;
  player.care.activeDays = [...new Set([...(player.care.activeDays || []), day])].slice(-90);
}
function extractCandidate(radar = {}) {
  const candidate = (radar.rankedPools || [])[0]; if (!candidate) return null;
  const token = candidate.baseToken || {};
  const address = token.address || null; const poolAddress = candidate.poolAddress || null;
  return { address, poolAddress, symbol: token.symbol || token.name || 'UNKNOWN', name: token.name || token.symbol || 'Unknown token', liquidityUsd: Number(candidate.liquidityUsd || 0), volume1hUsd: Number(candidate.volume?.h1 || 0), buys1h: Number(candidate.txns?.h1?.buys || 0), sells1h: Number(candidate.txns?.h1?.sells || 0), riskFlags: (candidate.riskFlags || []).slice(0, 4), observedAt: candidate.observedAt || null, externalLinks: externalMarketLinks({ address, poolAddress }) };
}
function firstTrailClue(radar = {}, nowMs = Date.now()) {
  const candidate = extractCandidate(radar);
  if (!candidate?.address) return null;
  const clueId = crypto.createHash('sha256').update(`${isoDay(nowMs)}:${candidate.address.toLowerCase()}:${candidate.observedAt || 'live'}`).digest('hex').slice(0, 20);
  return { id: clueId, source: 'AXO_LIVE_RADAR', observedAt: candidate.observedAt, candidate, choices: { judgments: FIRST_TRAIL_JUDGMENTS, strengths: FIRST_TRAIL_STRENGTHS, concerns: FIRST_TRAIL_CONCERNS } };
}
function buildTasks(radar, nowMs = Date.now()) {
  const day = isoDay(nowMs); const candidate = extractCandidate(radar);
  return Object.entries(TASKS).map(([type, definition]) => ({ id: `${day}:${type}`, type, ...definition, candidate: ['signal_review', 'risk_challenge'].includes(type) ? candidate : null, expiresAt: `${day}T23:59:59.999Z` }));
}
function equippedEffects(player) {
  const inventory = normalizeInventory(player.pet.inventory);
  const equipped = normalizeEquipped(inventory, player.pet.equipped);
  const items = ITEM_SLOTS.map((slot) => inventory.find((item) => item.id === equipped[slot] && item.slot === slot)).filter(Boolean);
  const bonuses = {};
  for (const item of items) for (const [ability, value] of Object.entries(item.bonus || {})) bonuses[ability] = Number(bonuses[ability] || 0) + Number(value || 0);
  return { items: items.map((item) => ({ id: item.id, name: item.name, rarity: item.rarity, slot: item.slot })), bonuses };
}
function personalizedTasks(player, radar, nowMs = Date.now()) {
  const effects = equippedEffects(player); const selected = new Set(player.pet.skills || []);
  return buildTasks(radar, nowMs).map((task) => {
    const skillBoost = [...selected].filter((id) => SKILL_TREE[id]?.ability === task.ability).length;
    const itemBoost = Number(effects.bonuses[task.ability] || 0);
    return { ...task, specialtyBoostXp: Math.min(3, skillBoost), itemBoostXp: Math.min(2, itemBoost), potentialXp: task.xp + 3 + Math.min(3, skillBoost) + Math.min(2, itemBoost) };
  });
}
function isoWeek(nowMs = Date.now()) {
  const date = new Date(nowMs); const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())); const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day); const first = new Date(Date.UTC(target.getUTCFullYear(), 0, 1)); const week = Math.ceil((((target - first) / 86_400_000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
function buildCrewExpedition(radar, contributions, nowMs = Date.now()) {
  const candidate = extractCandidate(radar); const week = isoWeek(nowMs); const targetKey = candidate?.address ? entityKey(candidate.address) : null;
  const nodes = ['contract_scout', 'signal_review', 'risk_challenge', 'outcome_check'].map((type) => {
    const receipts = targetKey ? contributions.filter((item) => item.type === type && (item.entityKey || entityKey(item.entity)) === targetKey && String(item.createdAt || '').slice(0, 10) >= new Date(nowMs - 7 * 86_400_000).toISOString().slice(0, 10)) : [];
    return { type, label: TASKS[type].label, completed: receipts.length > 0, contributors: new Set(receipts.map((item) => item.playerId)).size };
  });
  const completed = nodes.filter((node) => node.completed).length;
  return { id: `${week}:${targetKey || 'awaiting-candidate'}`, week, title: candidate ? `${candidate.symbol} Crew Investigation` : 'Awaiting a live expedition target', candidate, nodes, completed, goal: nodes.length, contributors: targetKey ? new Set(contributions.filter((item) => (item.entityKey || entityKey(item.entity)) === targetKey).map((item) => item.playerId)).size : 0, status: !candidate ? 'WAITING_FOR_TARGET' : completed === nodes.length ? 'DOSSIER_READY' : 'IN_PROGRESS' };
}
function participationGateView(player, nowMs = Date.now()) {
  const xConnected = player.social?.identities?.x?.verification === 'PLATFORM_VERIFIED';
  const telegramConnected = player.social?.identities?.telegram?.verification === 'PLATFORM_VERIFIED';
  const membership = telegramMembershipView(player, nowMs);
  const steps = [
    { id: 'x', label: 'Connect verified X', complete: xConnected },
    { id: 'telegram', label: 'Connect verified Telegram', complete: telegramConnected },
    { id: 'membership', label: 'Join the official AXO Telegram', complete: membership.verified },
  ];
  const missing = steps.filter((step) => !step.complete).map((step) => step.id);
  return {
    requiredForXp: true,
    complete: missing.length === 0,
    xpUnlocked: missing.length === 0,
    steps,
    missing,
    telegramMembership: membership,
    connectUrl: '/profile#social-accounts',
    joinUrl: membership.joinUrl || AXO_COMMUNITY_CHAT_URL,
    policy: {
      appliesTo: 'ALL_XP_BEARING_HATCHERY_AND_CREW_ACTIONS',
      zeroXpPetTouchAllowed: true,
      walletHatchAllowedBeforePassport: true,
      historicalXpPreserved: true,
    },
  };
}

function onboardingView(player, radar = {}, nowMs = Date.now(), { passportRequired = true, socialRewardMissionsActive = false } = {}) {
  const trail = player.onboarding?.firstTrail || {};
  const passport = participationGateView(player, nowMs);
  const trailSteps = [
    { id: 'care', label: 'Bond through play', complete: player.onboarding?.cared === true },
    { id: 'skill', label: 'Choose your first instinct', complete: player.onboarding?.skillChosen === true },
    { id: 'expedition', label: 'Read your first live clue', complete: trail.completed === true || player.onboarding?.firstExpedition === true },
  ];
  const steps = [...passport.steps, ...trailSteps];
  const instinctNodes = Object.entries(SKILL_TREE).filter(([, node]) => node.tier === 1).map(([id, node]) => ({ id, route: node.route, label: node.label, icon: node.icon, description: node.description, ability: node.ability, selected: (player.pet.skills || []).includes(id) }));
  const clue = firstTrailClue(radar, nowMs);
  const status = trail.completed ? 'COMPLETED' : !player.onboarding?.cared ? 'BOND' : !player.onboarding?.skillChosen ? 'INSTINCT' : clue ? 'CLUE' : 'WAITING_FOR_CLUE';
  return { complete: (!passportRequired || passport.complete) && trailSteps.every((step) => step.complete), status, steps, trailSteps, passport: { ...passport, requiredForXp: passportRequired }, reward: 'Complete the Crew Passport, reach level 2, and earn a lineage item', instinctNodes, clue, result: trail.completed ? { xpAwarded: Number(trail.xpAwarded || 0), itemId: trail.itemId, completedAt: trail.completedAt } : null, policy: { trustClass: 'PROVISIONAL_TRAINING_LABEL', consensusEligible: false, affectsContributorTrust: false, affectsProductionRanking: false }, bonusQuest: socialQuestView(player, { active: socialRewardMissionsActive }) };
}
function alphaPriceInput(value, field) {
  const text = String(value ?? '').trim();
  if (!text || text.length > 60 || !/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(text)) throw new Error(`alpha_call_${field}_invalid`);
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(`alpha_call_${field}_invalid`);
  return { text, amount };
}
function validateAlphaCall(input, task, entity, reason) {
  const fieldNames = ['poolAddress', 'entryMin', 'entryMax', 'targetPrice', 'stopPrice', 'horizon', 'disclosure', 'disclosureNote'];
  const supplied = fieldNames.some((field) => String(input?.[field] ?? '').trim());
  if (!supplied) return null;
  if (task.type !== 'contract_scout' || task.projectQuest === true) throw new Error('alpha_call_new_contract_only');
  const tokenAddress = normalizeAddress(entity); const poolAddress = normalizeAddress(input?.poolAddress);
  if (!tokenAddress || !poolAddress || tokenAddress === poolAddress) throw new Error('alpha_call_pool_address_invalid');
  const entryMin = alphaPriceInput(input?.entryMin, 'entry_min');
  const entryMax = String(input?.entryMax ?? '').trim() ? alphaPriceInput(input.entryMax, 'entry_max') : entryMin;
  const target = alphaPriceInput(input?.targetPrice, 'target'); const stop = alphaPriceInput(input?.stopPrice, 'stop');
  if (entryMax.amount < entryMin.amount) throw new Error('alpha_call_entry_range_invalid');
  if (target.amount <= entryMax.amount) throw new Error('alpha_call_target_must_exceed_entry');
  if (stop.amount >= entryMin.amount) throw new Error('alpha_call_stop_must_be_below_entry');
  const horizon = safeText(input?.horizon, 8).toUpperCase();
  if (!ALPHA_CALL_HORIZONS[horizon]) throw new Error('alpha_call_horizon_invalid');
  const disclosure = safeText(input?.disclosure || 'NONE', 32).toUpperCase();
  if (!ALPHA_CALL_DISCLOSURES.includes(disclosure)) throw new Error('alpha_call_disclosure_invalid');
  const disclosureNote = safeText(input?.disclosureNote, 240) || null;
  if (disclosure !== 'NONE' && (!disclosureNote || disclosureNote.length < 3)) throw new Error('alpha_call_disclosure_note_required');
  if (!reason || reason.length < 12) throw new Error('alpha_call_thesis_required');
  return {
    version: 1,
    tokenAddress,
    poolAddress,
    entry: { min: entryMin.text, max: entryMax.text },
    targetPrice: target.text,
    stopPrice: stop.text,
    horizon,
    disclosure: { relationship: disclosure, note: disclosureNote },
    hypotheticalTradeUsd: ALPHA_CALL_HYPOTHETICAL_TRADE_USD,
  };
}
function automaticContractAlphaCall(entity, projectSafety, nowMs = Date.now()) {
  const tokenAddress = normalizeAddress(entity);
  const route = projectSafety?.routeSnapshot;
  const poolAddress = normalizeAddress(route?.poolAddress);
  const price = Number(route?.priceUsd);
  const observedMs = Date.parse(route?.observedAt || projectSafety?.checkedAt || '');
  if (!tokenAddress || !poolAddress || tokenAddress === poolAddress || !Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(observedMs) || observedMs > nowMs + OBSERVATION_MAX_FUTURE_SKEW_MS || nowMs - observedMs > PROJECT_SAFETY_TTL_MS) return null;
  const entryPrice = String(Number(price.toPrecision(15)));
  return {
    version: 2,
    mode: AUTOMATIC_CONTRACT_ALPHA_MODE,
    systemGenerated: true,
    tokenAddress,
    poolAddress,
    entry: { min: entryPrice, max: entryPrice },
    targetPrice: null,
    stopPrice: null,
    horizon: AUTOMATIC_CONTRACT_ALPHA_HORIZON,
    disclosure: { relationship: 'NOT_COLLECTED_ADDRESS_ONLY', note: null },
    observedAt: new Date(observedMs).toISOString(),
    hypotheticalTradeUsd: ALPHA_CALL_HYPOTHETICAL_TRADE_USD,
  };
}
function alphaOutcomeWindow(submittedAt, horizon) {
  const submittedMs = Date.parse(submittedAt || 0);
  if (!Number.isFinite(submittedMs) || !ALPHA_CALL_HORIZONS[horizon]) throw new Error('alpha_call_outcome_window_invalid');
  const epoch = epochWindow(submittedMs);
  const requestedEndMs = submittedMs + ALPHA_CALL_HORIZONS[horizon];
  const epochScoringCutoffMs = epoch.endMs - ALPHA_EPOCH_SETTLEMENT_BUFFER_MS;
  const endsMs = Math.min(requestedEndMs, epochScoringCutoffMs);
  if (endsMs - submittedMs < ALPHA_MINIMUM_OUTCOME_WINDOW_MS) throw new Error('alpha_call_epoch_window_closed');
  return {
    epochId: epoch.id,
    startsAt: new Date(submittedMs).toISOString(),
    requestedEndsAt: new Date(requestedEndMs).toISOString(),
    endsAt: new Date(endsMs).toISOString(),
    epochFreezesAt: epoch.freezesAt,
    epochReviewEndsAt: epoch.reviewEndsAt,
    settlementBufferMs: ALPHA_EPOCH_SETTLEMENT_BUFFER_MS,
    cappedByEpoch: endsMs < requestedEndMs,
  };
}
function normalizeStoredAlphaCall(alphaCall, fallbackCreatedAt = null) {
  if (!alphaCall || typeof alphaCall !== 'object') return null;
  const submittedAt = alphaCall.submittedAt || fallbackCreatedAt;
  const submittedMs = Date.parse(submittedAt || 0);
  const epoch = Number.isFinite(submittedMs) ? epochWindow(submittedMs) : null;
  const requestedExpiresAt = alphaCall.requestedExpiresAt || alphaCall.expiresAt || null;
  return {
    ...alphaCall,
    submittedAt,
    requestedExpiresAt,
    performanceEpochId: alphaCall.performanceEpochId || epoch?.id || null,
    performanceWindow: alphaCall.performanceWindow || {
      epochId: epoch?.id || null,
      startsAt: submittedAt || null,
      requestedEndsAt: requestedExpiresAt,
      endsAt: alphaCall.expiresAt || null,
      epochFreezesAt: epoch?.freezesAt || null,
      epochReviewEndsAt: epoch?.reviewEndsAt || null,
      settlementBufferMs: 0,
      cappedByEpoch: false,
      legacy: true,
    },
    safety: alphaCall.safety || {
      initial: { status: 'NOT_CLEARED', eligible: false, reason: 'LEGACY_CALL_MISSING_MECHANICAL_CLEARANCE', exactPoolMatched: false, checkedAt: null, route: null, costs: null },
      settlement: null,
    },
    performance: {
      status: 'NOT_SCORED', fixedTradeUsd: ALPHA_CALL_HYPOTHETICAL_TRADE_USD, returnPct: null,
      realizedProfitUsd: null, potentialProfitUsd: null, potentialReturnPct: null, profitMultiplier: null,
      performanceXp: 0, targetHitAt: null, stopHitAt: null, scoredAt: null,
      ...(alphaCall.performance || {}),
    },
  };
}
function alphaPerformanceSafety(safety = {}, submittedPoolAddress = null) {
  const submittedPool = normalizeAddress(submittedPoolAddress);
  const route = safety?.routeSnapshot && typeof safety.routeSnapshot === 'object' ? safety.routeSnapshot : null;
  const routePool = normalizeAddress(route?.poolAddress);
  const costs = safety?.tradeCosts && typeof safety.tradeCosts === 'object' ? safety.tradeCosts : null;
  const entryFeeBps = Number(costs?.entryFeeBps);
  const exitFeeBps = Number(costs?.exitFeeBps);
  const costEvidenceComplete = Number.isInteger(entryFeeBps) && entryFeeBps >= 0 && entryFeeBps <= 2_500
    && Number.isInteger(exitFeeBps) && exitFeeBps >= 0 && exitFeeBps <= 2_500;
  const exactPoolMatched = Boolean(submittedPool && routePool && submittedPool === routePool);
  const mechanicallyCleared = safety?.performanceEligible === true
    && safety?.navigationReady === true
    && safety?.qualityGatePassed === true
    && exactPoolMatched
    && costEvidenceComplete;
  const reason = mechanicallyCleared ? null
    : !exactPoolMatched ? 'SUBMITTED_POOL_NOT_EXACT_CLEARED_ROUTE'
      : !costEvidenceComplete ? 'EXACT_ROUTE_COST_EVIDENCE_INCOMPLETE'
        : safety?.performanceEligibilityReason || 'MECHANICAL_CLEARANCE_REQUIRED';
  const priceUsd = Number(route?.priceUsd);
  const liquidityUsd = Number(route?.liquidityUsd);
  return {
    status: mechanicallyCleared ? 'MECHANICALLY_CLEARED' : 'NOT_CLEARED',
    eligible: mechanicallyCleared,
    reason,
    exactPoolMatched,
    checkedAt: safety?.checkedAt || route?.observedAt || null,
    score: Number.isFinite(Number(safety?.score)) ? Number(safety.score) : null,
    posture: safety?.posture || 'UNKNOWN',
    navigationReady: safety?.navigationReady === true,
    criticalFlags: (safety?.criticalFlags || []).slice(0, 8),
    route: routePool && Number.isFinite(priceUsd) && priceUsd > 0 ? {
      poolAddress: routePool,
      priceUsd,
      liquidityUsd: Number.isFinite(liquidityUsd) && liquidityUsd >= 0 ? liquidityUsd : null,
      observedAt: route?.observedAt || safety?.checkedAt || null,
      executable: mechanicallyCleared,
    } : null,
    costs: costEvidenceComplete ? {
      entryFeeBps,
      exitFeeBps,
      buyTotalCostPct: Number(costs.buyTotalCostPct),
      sellTotalCostPct: Number(costs.sellTotalCostPct),
      source: costs.source || null,
    } : null,
    disclaimer: 'Mechanical point-in-time clearance only; not a safety guarantee, endorsement, or trade instruction.',
  };
}
function alphaSafetyHistoryEntry(safety = {}, submittedPoolAddress = null) {
  const gate = alphaPerformanceSafety(safety, submittedPoolAddress || safety?.routeSnapshot?.poolAddress);
  return {
    checkedAt: gate.checkedAt || new Date().toISOString(),
    status: safety?.status || 'ANALYTICS_UNAVAILABLE',
    score: gate.score,
    posture: gate.posture,
    eligible: safety?.eligible === true,
    performance: gate,
    routeSnapshot: gate.route,
    tradeCosts: gate.costs,
  };
}
function contractHeatJudgment(verdict, confidence, suppliedHeatScore = null) {
  const normalizedVerdict = safeText(verdict, 40).toUpperCase();
  if (normalizedVerdict === 'SCAM') return { verdict: 'SCAM', confidence: 100, heatScore: null };
  const parsedHeat = suppliedHeatScore === null || suppliedHeatScore === undefined || suppliedHeatScore === ''
    ? Number.NaN
    : Number(suppliedHeatScore);
  if (Number.isInteger(parsedHeat) && parsedHeat >= 0 && parsedHeat <= 10) {
    const heatVerdict = parsedHeat < 5 ? 'NOT_INTERESTING' : parsedHeat > 5 ? 'INTERESTING' : 'NEUTRAL';
    if (normalizedVerdict && normalizedVerdict !== heatVerdict) throw new Error('contract_heat_verdict_mismatch');
    return {
      verdict: heatVerdict,
      confidence: parsedHeat === 5 ? 50 : Math.abs(parsedHeat - 5) * 20,
      heatScore: parsedHeat,
    };
  }
  if (!['INTERESTING', 'NEUTRAL', 'NOT_INTERESTING'].includes(normalizedVerdict)) throw new Error('contract_judgment_required');
  const boundedConfidence = Number.isFinite(Number(confidence)) ? clamp(Number(confidence), 1, 100) : null;
  if (!Number.isFinite(boundedConfidence)) throw new Error('contract_conviction_required');
  const distance = Math.max(1, Math.min(5, Math.ceil(boundedConfidence / 20)));
  return {
    verdict: normalizedVerdict,
    confidence: boundedConfidence,
    heatScore: normalizedVerdict === 'NEUTRAL' ? 5 : normalizedVerdict === 'INTERESTING' ? 5 + distance : 5 - distance,
  };
}
function validateContribution(input, tasks, nowMs = Date.now()) {
  const type = safeText(input?.type, 40); const task = tasks.find((item) => item.id === input?.taskId && item.type === type);
  if (!task || !TASKS[type]) throw new Error('task_invalid_or_expired');
  const entity = normalizeEntity(input?.data || input?.entity || task.candidate?.address);
  const contractAddressOnly = type === 'contract_scout';
  const contractJudgment = contractAddressOnly && task.projectQuest === true;
  const suppliedVerdict = safeText(input?.verdict, 40).toUpperCase();
  const verdict = contractAddressOnly && !contractJudgment ? 'TAGGED' : suppliedVerdict;
  const suppliedConfidence = Number(input?.confidence);
  const confidence = contractAddressOnly && !contractJudgment ? null : Number.isFinite(suppliedConfidence) ? clamp(suppliedConfidence, 1, 100) : null;
  const reason = safeText(input?.reason, 600) || null;
  const contradiction = safeText(input?.contradiction, 500) || null;
  const evidenceInput = String(input?.evidenceUrl || '').trim();
  const evidenceUrl = evidenceInput ? publicEvidenceUrl(evidenceInput) : null;
  if (evidenceInput && !evidenceUrl) throw new Error('public_https_evidence_url_required');
  const observedInput = safeText(input?.observedAt, 80);
  const observedMs = observedInput ? Date.parse(observedInput) : Number.NaN;
  if (observedInput && (!Number.isFinite(observedMs) || observedMs > nowMs + OBSERVATION_MAX_FUTURE_SKEW_MS)) throw new Error('observation_time_invalid');
  const observedAt = Number.isFinite(observedMs) ? new Date(observedMs).toISOString() : contractAddressOnly ? new Date(nowMs).toISOString() : null;
  if (!entity || entity.length < 3) throw new Error('data_required');
  if (['contract_scout', 'outcome_check', 'risk_challenge'].includes(type) && !/^0x[0-9a-f]{40}$/i.test(entity)) throw new Error('robinhood_contract_required');
  if (contractJudgment && !['INTERESTING', 'NEUTRAL', 'NOT_INTERESTING', 'SCAM'].includes(verdict)) throw new Error('contract_judgment_required');
  if (!contractAddressOnly && !['INTERESTING', 'NOT_INTERESTING', 'INSUFFICIENT_EVIDENCE', 'WATCH', 'RISK', 'POSITIVE', 'NEGATIVE', 'MIXED'].includes(verdict)) throw new Error('verdict_invalid');
  if (!contractAddressOnly && !Number.isFinite(confidence)) throw new Error('confidence_invalid');
  if (contractJudgment && verdict !== 'SCAM' && !Number.isFinite(confidence) && !Number.isInteger(Number(input?.heatScore))) throw new Error('contract_conviction_required');
  const heatJudgment = contractJudgment ? contractHeatJudgment(verdict, confidence, input?.heatScore) : null;
  const alphaCall = validateAlphaCall(input, task, entity, reason);
  return { task, type, data: entity, entity, verdict: heatJudgment?.verdict || verdict, confidence: heatJudgment?.confidence ?? confidence, heatScore: heatJudgment?.heatScore ?? null, reason, evidenceUrl, observedAt, contradiction, alphaCall, contractAddressOnly, contractJudgment };
}

function normalizeTelegramMembershipReceipt(player, receipt = {}, nowMs = Date.now(), { requireMember = false } = {}) {
  const identity = player?.social?.identities?.telegram;
  if (identity?.verification !== 'PLATFORM_VERIFIED' || !/^\d{1,24}$/.test(String(identity.providerUserId || ''))) {
    throw new Error('telegram_identity_required');
  }
  const providerUserId = String(receipt.providerUserId || '');
  const chatId = String(receipt.chatId || '');
  const checkedAtMs = Date.parse(receipt.checkedAt || '');
  const suppliedValidUntilMs = Date.parse(receipt.validUntil || '');
  if (receipt.verification !== 'TELEGRAM_GET_CHAT_MEMBER'
    || providerUserId !== identity.providerUserId
    || chatId !== AXO_COMMUNITY_CHAT_ID
    || !Number.isFinite(checkedAtMs)
    || !Number.isFinite(suppliedValidUntilMs)
    || suppliedValidUntilMs < checkedAtMs
    || nowMs > suppliedValidUntilMs
    || checkedAtMs > nowMs + PLATFORM_IDENTITY_MAX_FUTURE_SKEW_MS
    || nowMs - checkedAtMs > TELEGRAM_MEMBERSHIP_RECEIPT_MAX_AGE_MS) {
    throw new Error('telegram_membership_verification_required');
  }
  const isMember = receipt.isMember === true && receipt.status === 'MEMBER';
  if (requireMember && !isMember) throw new Error('axo_telegram_membership_required');
  const validUntilMs = Math.min(
    Number.isFinite(suppliedValidUntilMs) ? suppliedValidUntilMs : checkedAtMs + TELEGRAM_MEMBERSHIP_RECEIPT_MAX_AGE_MS,
    checkedAtMs + TELEGRAM_MEMBERSHIP_RECEIPT_MAX_AGE_MS,
  );
  return {
    status: isMember ? 'MEMBER' : 'NOT_MEMBER',
    isMember,
    providerUserId,
    chatId,
    telegramStatus: safeText(receipt.telegramStatus, 40).toLowerCase() || null,
    checkedAt: new Date(checkedAtMs).toISOString(),
    validUntil: new Date(validUntilMs).toISOString(),
    verification: 'TELEGRAM_GET_CHAT_MEMBER',
  };
}

function verifiedHumanIdentity(player, required = false, nowMs = Date.now()) {
  const all = player?.social?.identities || {};
  const xVerified = all.x?.verification === 'PLATFORM_VERIFIED'
    && /^\d{1,24}$/.test(String(all.x.providerUserId || ''))
    && Boolean(all.x.handle);
  const telegramVerified = all.telegram?.verification === 'PLATFORM_VERIFIED'
    && /^\d{1,24}$/.test(String(all.telegram.providerUserId || ''));
  const membership = telegramMembershipView(player, nowMs);
  const identities = Object.entries(all).filter(([platform]) => platform === 'x' ? xVerified : platform === 'telegram' ? telegramVerified : false);
  const hashes = identities.map(([platform, identity]) => crypto.createHash('sha256').update(`${platform}:${identity.providerUserId}`).digest('hex')).sort();
  const bundleQualified = xVerified && telegramVerified && membership.verified;
  const qualified = required !== true || bundleQualified;
  return {
    required: required === true,
    qualified,
    platformCount: identities.length,
    independenceKey: hashes.length > 0
      ? crypto.createHash('sha256').update(hashes.join(':')).digest('hex')
      : crypto.createHash('sha256').update(`wallet:${player?.ownerAddress || player?.id || ''}`).digest('hex'),
    source: bundleQualified ? 'DUAL_PLATFORM_IDENTITIES_AND_AXO_TELEGRAM_MEMBER' : required ? 'DUAL_PLATFORM_IDENTITIES_AND_AXO_TELEGRAM_MEMBERSHIP_REQUIRED' : 'WALLET_FALLBACK_TEST_OR_PREDEPLOYMENT',
    missing: [xVerified ? null : 'x', telegramVerified ? null : 'telegram', membership.verified ? null : 'axo_telegram_membership'].filter(Boolean),
    xVerified,
    telegramVerified,
    telegramMembershipVerified: membership.verified,
  };
}

function researchReceiptAssessment(value, inspection, context = {}, humanIdentity = {}) {
  const automatedContractReceipt = value.type === 'contract_scout';
  const fields = automatedContractReceipt ? {
    contractAddress: Boolean(normalizeAddress(value.entity)),
    deployedContract: inspection?.contract?.status === 'DEPLOYED_CONTRACT',
    chainEvidence: inspection?.contract?.rewardEligible !== false,
    observedAt: Boolean(value.observedAt),
  } : {
    claim: Boolean(value.reason && value.reason.length >= RESEARCH_CLAIM_MIN_LENGTH),
    primaryEvidence: Boolean(value.evidenceUrl),
    observedAt: Boolean(value.observedAt),
    invalidationCondition: Boolean(value.contradiction && value.contradiction.length >= RESEARCH_INVALIDATION_MIN_LENGTH),
  };
  const complete = Object.values(fields).every(Boolean);
  const forcedNomination = String(context.submissionClass || '').toUpperCase() === 'NOMINATION_ONLY';
  const contractRequired = REWARD_CONTRACT_TYPES.has(value.type);
  const contractProofEligible = !contractRequired || inspection?.contract?.rewardEligible !== false;
  const rewardActivityVerified = inspection?.identity?.rewardActivityVerified !== undefined
    ? inspection.identity.rewardActivityVerified === true
    : inspection?.identity?.activityVerified === true;
  const receiptClass = complete && !forcedNomination ? 'EVIDENCE_RECEIPT' : 'NOMINATION_ONLY';
  const eligible = receiptClass === 'EVIDENCE_RECEIPT' && contractProofEligible && rewardActivityVerified && humanIdentity.qualified !== false;
  const reason = forcedNomination ? 'NOMINATION_ONLY_CHANNEL'
    : !complete ? automatedContractReceipt ? 'AUTOMATED_CONTRACT_EVIDENCE_INCOMPLETE' : 'RESEARCH_FIELDS_INCOMPLETE'
      : !contractProofEligible ? 'BLOCK_PINNED_CONTRACT_PROOF_REQUIRED'
        : !rewardActivityVerified ? 'ESTABLISHED_WALLET_ACTIVITY_REQUIRED'
          : humanIdentity.qualified === false ? 'VERIFIED_HUMAN_IDENTITY_REQUIRED' : null;
  return { receiptClass, eligible, reason, fields, complete, contractProofEligible, rewardActivityVerified, verificationMode: automatedContractReceipt ? 'AUTOMATED_CONTRACT_ADDRESS' : 'HUMAN_RESEARCH_CONTEXT' };
}
function latestWalletVotes(contributions, type, entity) {
  const wallets = new Map();
  const key = entityKey(entity);
  for (const item of contributions.filter((entry) => entry.walletVerified && !entry.legacy && entry.type === type && (entry.entityKey || entityKey(entry.entity)) === key).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) wallets.set(item.playerId, item);
  return [...wallets.values()];
}
function buildIntelligence(contributions = []) {
  const keys = new Map();
  for (const item of contributions.filter((entry) => entry.walletVerified && !entry.legacy)) keys.set(`${item.type}:${item.entityKey || entityKey(item.entity)}`, { type: item.type, entity: item.entity, entityKey: item.entityKey || entityKey(item.entity) });
  const result = [];
  for (const value of keys.values()) {
    const votes = latestWalletVotes(contributions, value.type, value.entity);
    const evidenceGaps = votes.filter((vote) => vote.verdict === 'INSUFFICIENT_EVIDENCE');
    const qualifiedByHuman = new Map();
    for (const vote of votes.filter((entry) => entry.consensusEligible === true && entry.receiptClass === 'EVIDENCE_RECEIPT' && !['INSUFFICIENT_EVIDENCE', 'TAGGED'].includes(entry.verdict))) {
      const independenceKey = String(vote.independenceKey || vote.playerId || '');
      if (independenceKey) qualifiedByHuman.set(independenceKey, vote);
    }
    const qualifiedVotes = [...qualifiedByHuman.values()].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)));
    const verdicts = {};
    for (const vote of qualifiedVotes) verdicts[vote.verdict] = Number(verdicts[vote.verdict] || 0) + 1;
    const ranked = Object.entries(verdicts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const top = ranked[0] || [null, 0]; const share = qualifiedVotes.length ? top[1] / qualifiedVotes.length : 0;
    const qualifiedContributors = qualifiedVotes.length;
    const status = qualifiedContributors < CONSENSUS_MINIMUM ? (evidenceGaps.length >= CONSENSUS_MINIMUM && qualifiedContributors === 0 ? 'EVIDENCE_GAP'
      : votes.length >= CONSENSUS_MINIMUM ? 'DIVERSITY_PENDING' : 'PENDING_CORROBORATION')
      : qualifiedContributors < CONSENSUS_DIVERSITY_MINIMUM ? 'DIVERSITY_PENDING'
        : share >= 2 / 3 ? 'CORROBORATED' : 'CONTESTED';
    const avgConfidence = qualifiedVotes.length ? Math.round(qualifiedVotes.reduce((sum, item) => sum + item.confidence, 0) / qualifiedVotes.length) : 0;
    const quorumAt = qualifiedVotes.length >= CONSENSUS_MINIMUM ? qualifiedVotes[CONSENSUS_MINIMUM - 1]?.createdAt || null : null;
    result.push({ key: `${value.type}:${value.entityKey}`, type: value.type, entity: value.entity, entityKey: value.entityKey, status, contributors: votes.length, qualifiedContributors, evidenceGapAcknowledgments: evidenceGaps.length, dataAcknowledgments: qualifiedVotes.length, diversityMinimum: CONSENSUS_DIVERSITY_MINIMUM, verdicts, consensusVerdict: status === 'CORROBORATED' ? top[0] : null, consensusShare: Number(share.toFixed(2)), averageConfidence: avgConfidence, quorumAt, finalizableAt: quorumAt ? new Date(Date.parse(quorumAt) + CONSENSUS_FINALIZATION_MS).toISOString() : null, qualifiedContributionIds: qualifiedVotes.map((vote) => vote.id), consensusContributionIds: status === 'CORROBORATED' ? qualifiedVotes.filter((vote) => vote.verdict === top[0]).map((vote) => vote.id) : [], priorityScore: Math.min(100, votes.length * 12 + qualifiedContributors * 16 + (status === 'CONTESTED' ? 18 : status === 'CORROBORATED' ? 10 : 0)), lastObservedAt: votes.at(-1)?.createdAt || null, affectsProductionRanking: false });
  }
  return result.sort((a, b) => b.priorityScore - a.priorityScore || String(b.lastObservedAt).localeCompare(String(a.lastObservedAt)));
}
function heatLabel(score) {
  if (score >= 75) return 'BLAZING';
  if (score >= 50) return 'HOT';
  if (score >= 25) return 'WARM';
  return 'IGNITING';
}
function fidelityLabel(score) {
  if (score >= 80) return 'HIGH FIDELITY';
  if (score >= 60) return 'STRONG SIGNAL';
  if (score >= 35) return 'FORMING';
  return 'UNPROVEN';
}
function projectPulse(votes = [], nowMs = Date.now()) {
  const positive = new Set(['INTERESTING', 'WATCH', 'POSITIVE']);
  const negative = new Set(['NOT_INTERESTING', 'RISK', 'NEGATIVE']);
  let decayedActivity = 0; let positiveVotes = 0; let negativeVotes = 0;
  for (const vote of votes) {
    const ageHours = Math.max(0, nowMs - Date.parse(vote.createdAt || 0)) / 3_600_000;
    if (Number.isFinite(ageHours)) decayedActivity += 0.5 ** (ageHours / PROJECT_HEAT_HALF_LIFE_HOURS);
    if (positive.has(vote.verdict)) positiveVotes += 1;
    if (negative.has(vote.verdict)) negativeVotes += 1;
  }
  const recent = votes.filter((vote) => nowMs - Date.parse(vote.createdAt || 0) <= 24 * 3_600_000).length;
  const heatScore = Math.min(100, Math.round(decayedActivity * 22 + recent * 4));
  const directional = positiveVotes + negativeVotes;
  return {
    score: heatScore,
    label: heatLabel(heatScore),
    recent24h: recent,
    halfLifeHours: PROJECT_HEAT_HALF_LIFE_HOURS,
    supportPct: directional ? Math.round((positiveVotes / directional) * 100) : null,
    note: 'Heat measures recent community attention, not safety or investment quality.',
  };
}
function projectFidelity(record, votes = []) {
  const sampleFactor = Math.min(1, votes.length / CONSENSUS_MINIMUM);
  const qualifiedRatio = votes.length ? Number(record?.qualifiedContributors || 0) / votes.length : 0;
  const agreement = Number(record?.consensusShare || 0);
  const score = Math.round(Math.min(100, (agreement * 65 + qualifiedRatio * 35) * sampleFactor));
  return {
    score,
    label: fidelityLabel(score),
    agreementPct: Math.round(agreement * 100),
    qualifiedPct: Math.round(qualifiedRatio * 100),
    note: 'Fidelity measures independent agreement and qualified wallet participation; it is not verified chain truth.',
  };
}
function projectQuestWindow(quest, nowMs = Date.now(), pinnedAddress = null) {
  const address = normalizeAddress(quest?.address);
  const pinned = normalizeAddress(pinnedAddress);
  const createdMs = Date.parse(quest?.createdAt || 0);
  const explicitExpiryMs = Date.parse(quest?.expiresAt || 0);
  const expiresMs = Number.isFinite(explicitExpiryMs)
    ? explicitExpiryMs
    : Number.isFinite(createdMs) ? createdMs + PROJECT_QUEST_DURATION_MS : 0;
  const isPinned = Boolean(address && pinned && address === pinned);
  return {
    pinned: isPinned,
    expiresAt: expiresMs ? new Date(expiresMs).toISOString() : null,
    accepting: isPinned || Boolean(expiresMs && nowMs < expiresMs),
  };
}
function projectQuestIdentity(quest = {}) {
  const storedSymbol = safeText(quest.symbol, 20);
  const storedName = safeText(quest.name, 80);
  const verifiedSafetyIdentity = quest.safety?.verifiedSource === true && quest.safety?.analyticsAvailable !== false;
  const verifiedSymbol = verifiedSafetyIdentity ? safeText(quest.safety?.symbol, 20) : '';
  const verifiedName = verifiedSafetyIdentity ? safeText(quest.safety?.name, 80) : '';
  const genericSymbol = !storedSymbol || ['PROJECT', 'TOKEN', 'UNKNOWN'].includes(storedSymbol.toUpperCase());
  const genericName = !storedName || ['COMMUNITY PROJECT', 'PROJECT', 'TOKEN', 'UNKNOWN'].includes(storedName.toUpperCase());
  const symbol = genericSymbol && verifiedSymbol ? verifiedSymbol : storedSymbol || verifiedSymbol || 'PROJECT';
  const name = genericName && verifiedName ? verifiedName : storedName || verifiedName || symbol || 'Community project';
  return { symbol, name };
}
function isProjectJudgmentContribution(entry, questId = null) {
  if (!entry || entry.type !== 'contract_scout' || !entry.projectQuestId) return false;
  if (questId && entry.projectQuestId !== questId) return false;
  return String(entry.taskId || '').startsWith('project:')
    && !['', 'TAGGED'].includes(String(entry.verdict || '').toUpperCase());
}
function contributionEpochId(entry) {
  const createdMs = Date.parse(entry?.createdAt || 0);
  return Number.isFinite(createdMs) ? epochWindow(createdMs).id : null;
}
function qualifiedProjectScamVotes(contributions = [], questId = null, epochId = null) {
  const qualifiedByHuman = new Map();
  for (const vote of contributions.filter((entry) => isProjectJudgmentContribution(entry, questId)
    && (!epochId || contributionEpochId(entry) === epochId)
    && entry.verdict === 'SCAM'
    && entry.consensusEligible === true
    && entry.receiptClass === 'EVIDENCE_RECEIPT')) {
    const independenceKey = String(vote.independenceKey || vote.playerId || '');
    if (independenceKey) qualifiedByHuman.set(independenceKey, vote);
  }
  return [...qualifiedByHuman.values()].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id)));
}
function projectQuestViews(state, ownerAddress = null, nowMs = Date.now(), { pinnedAddress = null } = {}) {
  const pinned = normalizeAddress(pinnedAddress);
  return Object.values(state.projectQuests || {}).map((quest) => {
    const address = normalizeAddress(quest.address); if (!address) return null;
    const identity = projectQuestIdentity(quest);
    const window = projectQuestWindow(quest, nowMs, pinned);
    if (!window.accepting && !window.pinned) return null;
    const epoch = epochWindow(nowMs);
    const windowContributions = (state.contributions || []).filter((item) => isProjectJudgmentContribution(item, quest.id)
      && contributionEpochId(item) === epoch.id);
    const scamVotes = qualifiedProjectScamVotes(windowContributions, quest.id, epoch.id);
    const key = `contract_scout:${entityKey(address)}`;
    const record = buildIntelligence(windowContributions).find((item) => item.key === key) || { status: 'PENDING_CORROBORATION', contributors: 0, qualifiedContributors: 0, consensusShare: 0, verdicts: {} };
    const votes = latestWalletVotes(windowContributions, 'contract_scout', address);
    const heatVotes = votes.filter((vote) => Number.isInteger(vote.heatScore) && vote.heatScore >= 0 && vote.heatScore <= 10 && vote.consensusEligible === true && vote.receiptClass === 'EVIDENCE_RECEIPT');
    const safetyCheckedMs = Date.parse(quest.safety?.checkedAt || 0); const safetyStale = !Number.isFinite(safetyCheckedMs) || nowMs - safetyCheckedMs >= PROJECT_SAFETY_TTL_MS;
    const accepting = window.accepting; const completedVote = ownerAddress ? votes.find((vote) => vote.playerId === ownerAddress) || null : null; const completed = Boolean(completedVote);
    const status = record.status;
    const task = {
      id: `project:${quest.id}`,
      type: 'contract_scout',
      label: 'Project Community Feeding',
      prompt: `Judge ${identity.symbol || 'this project'} with your own call and conviction. AXO handles the chain checks.`,
      xp: CONTRACT_JUDGMENT_XP,
      potentialXp: 10,
      ability: 'connector',
      entity: 'contract',
      fixedEntity: address,
      candidate: { address, symbol: identity.symbol, name: identity.name, liquidityUsd: Number(quest.safety?.liquidityUsd || 0), volume1hUsd: 0, buys1h: 0, sells1h: 0, externalLinks: externalMarketLinks({ address }) },
      projectQuest: true,
      projectQuestId: quest.id,
      expiresAt: window.expiresAt,
      completed: completed || !accepting,
    };
    return {
      id: quest.id,
      address,
      symbol: identity.symbol,
      name: identity.name,
      projectContext: quest.projectContext || null,
      nominatedAt: quest.createdAt,
      expiresAt: window.expiresAt,
      status,
      accepting,
      pinned: window.pinned,
      completedByPlayer: completed,
      nominatedByPlayer: Boolean(ownerAddress && quest.nominatedBy === ownerAddress),
      completion: completedVote ? {
        status: 'DONE_THIS_EPOCH',
        epochId: epoch.id,
        contributionId: completedVote.id,
        recordedAt: completedVote.createdAt,
        verdict: completedVote.verdict,
        conviction: Number(completedVote.confidence || 0),
        heatScore: Number.isInteger(completedVote.heatScore) ? completedVote.heatScore : null,
      } : {
        status: accepting ? 'VETTING_REQUIRED_THIS_EPOCH' : 'WINDOW_CLOSED',
        epochId: epoch.id,
        contributionId: null,
        recordedAt: null,
        verdict: null,
        conviction: null,
        heatScore: null,
      },
      epoch: {
        id: epoch.id,
        startsAt: epoch.startsAt,
        endsAt: epoch.freezesAt,
        status: epoch.status,
      },
      userJudgment: completedVote && completedVote.verdict !== 'TAGGED' ? { verdict: completedVote.verdict, conviction: Number(completedVote.confidence || 0), heatScore: Number.isInteger(completedVote.heatScore) ? completedVote.heatScore : null } : null,
      contributors: Number(record.contributors || votes.length),
      feedCount: votes.length,
      uniqueFeeders: votes.length,
      popularity: {
        uniqueFeeds: votes.length,
        label: votes.length >= 25 ? 'VERY_POPULAR' : votes.length >= 10 ? 'POPULAR' : votes.length >= 3 ? 'GROWING' : 'NEW',
        note: 'Popularity counts unique wallets that fed this contract. It is not a safety verdict or endorsement.',
      },
      qualifiedContributors: Number(record.qualifiedContributors || 0),
      highScoreQualifiedContributors: heatVotes.filter((vote) => vote.heatScore >= PROJECT_HIGH_SCORE_MINIMUM).length,
      evidenceGapAcknowledgments: Number(record.evidenceGapAcknowledgments || 0),
      consensusVerdict: record.consensusVerdict || null,
      agreementPct: Math.round(Number(record.consensusShare || 0) * 100),
      averageConviction: Number(record.averageConfidence || 0),
      averageHeatScore: heatVotes.length ? Number((heatVotes.reduce((sum, vote) => sum + vote.heatScore, 0) / heatVotes.length).toFixed(1)) : null,
      verdicts: record.verdicts || {},
      scam: {
        status: scamVotes.length >= PROJECT_SCAM_QUORUM ? 'COMMUNITY_SCAM' : 'FORMING',
        votes: scamVotes.length,
        threshold: PROJECT_SCAM_QUORUM,
        remaining: Math.max(0, PROJECT_SCAM_QUORUM - scamVotes.length),
        votedByPlayer: Boolean(completedVote?.verdict === 'SCAM'),
        note: 'Three independent qualified Crew scam votes remove the active quest and store a community-scam receipt. This is community consensus, not an independent security audit.',
      },
      heat: projectPulse(votes, nowMs),
      fidelity: projectFidelity(record, votes),
      xpRewards: {
        firstScoutNow: CONTRACT_DISCOVERY_XP,
        firstScoutWhenCorroborated: CONTRACT_DISCOVERY_CORROBORATED_XP,
        judgmentNow: CONTRACT_JUDGMENT_XP,
        judgmentWhenCorroborated: CONTRACT_JUDGMENT_CORROBORATED_XP,
      },
      safety: { ...quest.safety, stale: safetyStale, ttlMs: PROJECT_SAFETY_TTL_MS, pausedAt: null, pauseReason: null, label: quest.safety?.analyticsAvailable === false ? 'CONTRACT VERIFIED · ANALYTICS PENDING' : safetyStale ? 'CONTRACT VERIFIED · ANALYTICS REFRESH DUE' : 'CONTRACT VERIFIED · ANALYTICS ATTACHED' },
      task,
      affectsProductionRanking: false,
    };
  }).filter(Boolean).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.feedCount - a.feedCount || String(b.nominatedAt).localeCompare(String(a.nominatedAt)));
}
function isHighScoreProjectView(project) {
  return project?.status === 'CORROBORATED'
    && Number(project.qualifiedContributors || 0) >= CONSENSUS_MINIMUM
    && Number(project.highScoreQualifiedContributors || 0) >= CONSENSUS_MINIMUM
    && Number(project.averageHeatScore) >= PROJECT_HIGH_SCORE_MINIMUM;
}
function refreshIntelligence(state) {
  const records = buildIntelligence(state.contributions);
  state.intelligence = Object.fromEntries(records.map((record) => [record.key, record]));
  for (const contribution of state.contributions) {
    if (!contribution.walletVerified || contribution.legacy) continue;
    const record = state.intelligence[`${contribution.type}:${contribution.entityKey || entityKey(contribution.entity)}`];
    if (record) contribution.status = contribution.receiptClass === 'EVIDENCE_RECEIPT' ? record.status : 'NOMINATION_RECORDED';
  }
  return records;
}
function consensusSettlementRecords(state, nowMs = Date.now()) {
  const globalRecords = refreshIntelligence(state).filter((record) => record.type !== 'contract_scout');
  const epochId = epochWindow(nowMs).id;
  const grouped = new Map();
  for (const contribution of (state.contributions || []).filter((entry) => isProjectJudgmentContribution(entry)
    && contributionEpochId(entry) === epochId)) {
    const rows = grouped.get(contribution.projectQuestId) || [];
    rows.push(contribution);
    grouped.set(contribution.projectQuestId, rows);
  }
  const contractRecords = [];
  for (const [projectQuestId, contributions] of grouped.entries()) {
    for (const record of buildIntelligence(contributions)) contractRecords.push({
      ...record,
      key: `${record.key}:${projectQuestId}:${epochId}`,
      projectQuestId,
      epochId,
    });
  }
  return [...globalRecords, ...contractRecords];
}
function recordEvent(state, type, playerId = null, metadata = {}, at = new Date().toISOString()) {
  state.events ||= [];
  const petGenesisId = playerId ? state.players?.[playerId]?.pet?.genesisId || metadata.petGenesisId || null : null;
  state.events.push({ id: crypto.randomUUID(), type, playerId, petGenesisId, at, metadata });
}
function xpFromEvent(event) {
  const metadata = event?.metadata || {};
  if (event?.type === 'DAILY_PROMOTION_QUEST_COMPLETED') return 0;
  if (['HATCH_ANNOUNCEMENT_CLAIMED', 'DAILY_SOCIAL_FEEDING_CLAIMED'].includes(event?.type) && metadata.platformVerified !== true) return 0;
  const value = event?.type === 'SKILL_LEARNED' ? metadata.firstInstinctXp
    : event?.type === 'FIRST_TRAIL_COMPLETED' ? metadata.xpAwarded
      : event?.type === 'CREW_XP_RELEASED' ? metadata.xp ?? metadata.amount
      : ['EXPEDITION_RECEIPT_SUBMITTED', 'PROJECT_QUEST_PUBLISHED', 'PROJECT_QUEST_CORROBORATED', 'PROJECT_QUEST_SCAM_VOTE'].includes(event?.type) ? metadata.provisionalXp
        : metadata.xp;
  return Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
}
function sprintPointsFromEvent(event) {
  const xp = xpFromEvent(event); const type = event?.type;
  if (['EXPEDITION_RECEIPT_SUBMITTED', 'PROJECT_QUEST_PUBLISHED', 'PROJECT_QUEST_CORROBORATED', 'PROJECT_QUEST_SCAM_VOTE', 'EXPEDITION_OUTCOME_SETTLED'].includes(type)) return xp * 3;
  if (type === 'CALIBRATION_COMPLETED') return Math.min(3, xp);
  if (type === 'CARE_ACTION') return Math.min(1, xp);
  if (type === 'DAILY_SOCIAL_FEEDING_CLAIMED') return event.metadata?.platformVerified === true ? 1 : 0;
  return Math.min(2, xp);
}
const PET_ACTION_LABELS = Object.freeze({
  PET_HATCHED: 'Hatched into the crystal nursery',
  PET_DELETED_AND_REPLACED: 'Began a new AXO lineage',
  PET_RENAMED: 'Updated its companion name',
  CARE_ACTION: 'Completed daily care',
  PET_PETTED: 'Shared a bonding moment',
  SKILL_LEARNED: 'Learned a blockchain skill',
  FIRST_TRAIL_COMPLETED: 'Completed AXO’s First Trail',
  EXPEDITION_RECEIPT_SUBMITTED: 'Fed AXO blockchain intelligence',
  PROJECT_QUEST_PUBLISHED: 'Published a project corroboration feeding',
  MULTICHAIN_PROJECT_NOMINATED: 'Mapped a verified contract on a supported chain',
  PROJECT_QUEST_CORROBORATED: 'Corroborated a community project',
  PROJECT_QUEST_SCAM_VOTE: 'Flagged a community project for scam review',
  PROJECT_COMMUNITY_SCAM_FLAGGED: 'Recorded a three-Crew community scam quorum',
  CONTRACT_DISCOVERY_CORROBORATED: 'Earned the first-scout corroboration bonus',
  EXPEDITION_REWARD_RELEASED: 'Unlocked corroboration XP',
  EXPEDITION_OUTCOME_SETTLED: 'Resolved an expedition outcome',
  ALPHA_SPOTLIGHT_BONUS_GRANTED: 'Earned a community research spotlight',
  ALPHA_XP_CORRECTED: 'Received an audited Alpha Mining XP adjustment',
  ALPHA_MINING_WALLET_BLOCKED: 'Alpha Mining participation was blocked',
  ALPHA_MINING_WALLET_UNBLOCKED: 'Alpha Mining participation was restored',
  HATCH_ANNOUNCEMENT_CLAIMED: 'Shared its hatch on X',
  DAILY_SOCIAL_FEEDING_CLAIMED: 'Ate a community signal snack',
  DAILY_AXO_X_ENGAGEMENT_CLAIMED: 'Supported AXO with a like, reply, and repost',
  DAILY_SOCIAL_CREATOR_CONTRIBUTION_CLAIMED: 'Created an original AXO social contribution',
  DAILY_PROMOTION_QUEST_COMPLETED: 'Completed the daily AXO Crew signal run',
  PET_XP_ADMIN_ADJUSTED: 'Received an audited pet XP adjustment',
  SPRINT_REWARD_GRANTED: 'Claimed a sprint reward',
  MISSION_CONTROL_DAILY_CHEST_CLAIMED: 'Completed its daily mission deck',
  CREW_MILESTONE_CLAIMED: 'Claimed an incremental Crew milestone',
  CALIBRATION_COMPLETED: 'Completed a solo evidence calibration',
  CREW_XP_RELEASED: 'Completed a Crew mission',
  ITEM_EQUIPPED: 'Changed its mission loadout',
});
function playerPetEvents(state, player) {
  const bornAtMs = Date.parse(player.pet.bornAt || player.createdAt || 0);
  return (state.events || []).filter((event) => {
    const atMs = Date.parse(event.at); if (event.playerId !== player.id || !Number.isFinite(atMs) || atMs < bornAtMs) return false;
    return !event.petGenesisId || event.petGenesisId === player.pet.genesisId;
  });
}
function weeklyVerifiedActionKind(event) {
  if (WEEKLY_VERIFIED_ACTIVE_EVENT_TYPES.care.includes(event?.type)) return 'care';
  if (WEEKLY_VERIFIED_ACTIVE_EVENT_TYPES.scout.includes(event?.type)) {
    return event.type === 'EXPEDITION_RECEIPT_SUBMITTED' && event.metadata?.type !== 'contract_scout' ? null : 'scout';
  }
  if (WEEKLY_VERIFIED_ACTIVE_EVENT_TYPES.signal.includes(event?.type)) {
    if (event.type === 'DAILY_SOCIAL_FEEDING_CLAIMED' && event.metadata?.platformVerified !== true) return null;
    if (event.type === 'DAILY_X_ENGAGEMENT_CLAIMED'
      && !(event.metadata?.liked === true && event.metadata?.replied === true && event.metadata?.evidenceHash)) return null;
    return 'signal';
  }
  if (WEEKLY_VERIFIED_ACTIVE_EVENT_TYPES.crew.includes(event?.type)) return 'crew';
  return null;
}
function crewMilestoneQualifyingEvents(state, player, nowMs = Date.now()) {
  const epoch = epochWindow(nowMs);
  const allowed = new Set(CREW_MILESTONE_EVENT_TYPES);
  const seen = new Set();
  return playerPetEvents(state, player)
    .filter((event) => {
      const atMs = Date.parse(event.at || 0);
      if (!allowed.has(event.type) || !Number.isFinite(atMs) || atMs < epoch.startMs || atMs >= epoch.endMs) return false;
      const key = event.type === 'CARE_ACTION'
        ? `${event.type}:${String(event.at).slice(0, 10)}`
        : event.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => String(left.at).localeCompare(String(right.at)) || String(left.id).localeCompare(String(right.id)));
}
function crewMilestonesView(state, player, nowMs = Date.now()) {
  const epoch = epochWindow(nowMs);
  const qualifyingEvents = crewMilestoneQualifyingEvents(state, player, nowMs);
  const claims = player.missionControl?.crewMilestoneClaims?.[epoch.id] || {};
  const tiers = CREW_MILESTONE_TIERS.map((tier) => {
    const claim = claims[String(tier.threshold)] || null;
    const unlocked = qualifyingEvents.length >= tier.threshold;
    return {
      ...tier,
      unlocked,
      claimed: Boolean(claim),
      claimable: unlocked && !claim,
      claimedAt: claim?.claimedAt || null,
      petXpAwarded: Number(claim?.petXpAwarded || 0),
      epochXpAwarded: Number(claim?.epochXpAwarded || 0),
    };
  });
  const nextTier = tiers.find((tier) => !tier.claimed) || null;
  return {
    id: 'crew_epoch_milestones',
    label: 'Crew milestones',
    epochId: epoch.id,
    startsAt: epoch.startsAt,
    resetsAt: epoch.freezesAt,
    progress: qualifyingEvents.length,
    goal: CREW_MILESTONE_TIERS.at(-1).threshold,
    completed: tiers.filter((tier) => tier.claimed).length,
    totalTiers: tiers.length,
    claimableTiers: tiers.filter((tier) => tier.claimable).length,
    claimableXp: tiers.filter((tier) => tier.claimable).reduce((sum, tier) => sum + tier.bonusXp, 0),
    totalClaimedXp: tiers.filter((tier) => tier.claimed).reduce((sum, tier) => sum + tier.bonusXp, 0),
    nextTier,
    tiers,
    policy: {
      cadence: 'UTC_ISO_WEEK',
      rewardMode: 'MANUAL_CLAIM_STACKED_INCREMENTAL',
      petAndEpochXpEqual: true,
      qualifyingEventTypes: [...CREW_MILESTONE_EVENT_TYPES],
      oneCareActionPerUtcDay: true,
      externalSocialActionsCount: false,
      affectsContributorTrust: false,
      affectsProjectHeat: false,
      affectsConsensusWeight: false,
      affectsProductionRanking: false,
    },
  };
}
function xpGainedBetween(state, player, startMs, endMs) {
  return playerPetEvents(state, player).reduce((total, event) => {
    const atMs = Date.parse(event.at); return atMs >= startMs && atMs <= endMs ? total + xpFromEvent(event) : total;
  }, 0);
}
function playerLedgerView(state, player, { limit = 100, nowMs = Date.now() } = {}) {
  const size = Math.max(1, Math.min(500, Number(limit || 100)));
  const petRows = playerPetEvents(state, player).map((event) => {
    const delta = event.type === 'PET_XP_ADMIN_ADJUSTED'
      ? Number(event.metadata?.delta || 0)
      : xpFromEvent(event);
    if (!delta) return null;
    return {
      id: event.id,
      ledger: 'PET_XP',
      delta,
      reasonCode: event.type,
      label: PET_ACTION_LABELS[event.type] || event.type.toLowerCase().replaceAll('_', ' '),
      at: event.at,
      evidenceHash: event.metadata?.evidenceHash || null,
    };
  }).filter(Boolean).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, size);
  const allEpochRows = rewardEntries(state).filter((entry) => normalizeAddress(entry.playerId) === player.ownerAddress).map((entry) => ({
    id: entry.id,
    ledger: 'EPOCH_XP',
    epochId: entry.displayEpochId,
    delta: Number(entry.amount || 0),
    reasonCode: entry.reasonCode,
    label: String(entry.reasonCode || '').toLowerCase().replaceAll('_', ' '),
    at: entry.attributedAt || entry.recordedAt,
    settlementEligible: entry.settlementEligible !== false,
    exclusionReason: entry.exclusionReason || null,
    evidenceHash: entry.evidenceHash || null,
  })).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const currentEpochId = epochWindow(nowMs).id;
  const currentEpochXp = allEpochRows.filter((entry) => entry.epochId === currentEpochId && entry.settlementEligible).reduce((sum, entry) => sum + entry.delta, 0);
  return {
    petXp: Number(player.pet.xp || 0),
    currentEpochId,
    currentEpochXp: Math.max(0, currentEpochXp),
    pet: petRows,
    epoch: allEpochRows.slice(0, size),
  };
}
function sprintPointsBetween(state, player, startMs, endMs) {
  return playerPetEvents(state, player).reduce((total, event) => {
    const atMs = Date.parse(event.at); return atMs >= startMs && atMs <= endMs ? total + sprintPointsFromEvent(event) : total;
  }, 0);
}

function communityReadiness(state) {
  const players = Object.values(state.players || {}).filter((player) => player.walletVerified).length;
  const qualifiedContributors = new Set((state.contributions || []).filter((item) => item.consensusEligible).map((item) => item.playerId)).size;
  const consensusReady = qualifiedContributors >= CONSENSUS_MINIMUM;
  const competitiveReady = players >= COMPETITIVE_SEASON_MIN_PLAYERS && consensusReady;
  return { phase: competitiveReady ? 'COMMUNITY' : 'BOOTSTRAP', players, playerTarget: COMPETITIVE_SEASON_MIN_PLAYERS, playersNeeded: Math.max(0, COMPETITIVE_SEASON_MIN_PLAYERS - players), qualifiedContributors, consensusMinimum: CONSENSUS_MINIMUM, scoutsNeededForConsensus: Math.max(0, CONSENSUS_MINIMUM - qualifiedContributors), consensusReady, competitiveReady };
}

function calibrationView(state, player, nowMs = Date.now()) {
  const day = isoDay(nowMs); const caseIndex = Number.parseInt(crypto.createHash('sha256').update(day).digest('hex').slice(0, 8), 16) % CALIBRATION_CASES.length;
  const challenge = CALIBRATION_CASES[caseIndex]; const prior = (state.calibrationRuns || []).find((run) => run.playerId === player.id && run.day === day);
  return { day, available: !prior, challenge: { id: challenge.id, title: challenge.title, brief: challenge.brief, evidence: challenge.evidence, choices: challenge.choices }, result: prior ? { choice: prior.choice, correct: prior.correct, explanation: prior.explanation, xpAwarded: prior.xpAwarded, completedAt: prior.completedAt, itemAwarded: prior.itemAwarded || null } : null, progress: { completed: Number(player.calibration?.completed || 0), correct: Number(player.calibration?.correct || 0), accuracy: player.calibration?.completed ? Number((player.calibration.correct / player.calibration.completed).toFixed(2)) : null }, policy: { soloBootstrap: true, affectsContributorTrust: false, consensusEligible: false, affectsProductionRanking: false } };
}
function latestPetAction(state, player) {
  const event = playerPetEvents(state, player).filter((item) => PET_ACTION_LABELS[item.type]).reduce((latest, item) => (
    !latest || Date.parse(item.at) >= Date.parse(latest.at) ? item : latest
  ), null);
  if (!event) return { type: 'PET_HATCHED', label: 'Waiting for its first action', at: player.pet.bornAt || player.createdAt };
  const detail = event.type === 'CARE_ACTION' && event.metadata?.action ? ` · ${String(event.metadata.action).toUpperCase()}`
    : ['DAILY_SOCIAL_FEEDING_CLAIMED', 'DAILY_SOCIAL_CREATOR_CONTRIBUTION_CLAIMED'].includes(event.type) && event.metadata?.kind ? ` · ${String(event.metadata.kind).replaceAll('_', ' ').toUpperCase()}`
      : event.type === 'DAILY_SOCIAL_FEEDING_CLAIMED' && event.metadata?.platform ? ` · ${String(event.metadata.platform).toUpperCase()}` : '';
  return { type: event.type, label: `${PET_ACTION_LABELS[event.type]}${detail}`, at: event.at };
}

function tokenSnapshot(address, radar = {}, alpha = {}) {
  const normalized = normalizeAddress(address); if (!normalized) return null;
  const candidate = (alpha.candidates || []).find((item) => normalizeAddress(item.tokenAddress) === normalized);
  const pool = (radar.rankedPools || []).find((item) => normalizeAddress(item.baseToken?.address) === normalized);
  const poolAddress = candidate?.poolAddress || pool?.poolAddress || null;
  if (!candidate && !pool) return { address: normalized, poolAddress: null, name: null, symbol: 'UNKNOWN', classification: 'NOT_CURRENTLY_RANKED', category: 'UNRANKED', priceUsd: null, valuationUsd: null, valuationLabel: 'FDV', verifiedMarketCap: false, liquidityUsd: null, volume1hUsd: null, volume24hUsd: null, priceChange5mPct: null, priceChange1hPct: null, priceChange24hPct: null, holderCount: null, ageMinutes: null, opportunityScore: null, warnings: [], explorerUrl: `https://robinhoodchain.blockscout.com/token/${normalized}`, externalLinks: externalMarketLinks({ address: normalized }) };
  const verifiedMarketCap = candidate?.verifiedMarketCap === true || pool?.verifiedMarketCap === true;
  const reportedValuation = verifiedMarketCap
    ? numberOrNull(candidate?.marketCapUsd ?? pool?.marketCapUsd)
    : numberOrNull(candidate?.fdvUsd ?? candidate?.marketCapUsd ?? pool?.fdvUsd ?? pool?.marketCapUsd);
  const playType = safeText(candidate?.playType, 30).toUpperCase();
  const category = playType === 'DEGEN' ? 'EARLY_DEGEN'
    : playType === 'LONG_HOLD' ? 'LONG_HOLD'
      : pool?.attention === 'NEW_POOL' || pool?.feeds?.includes?.('new_pools') ? 'NEW_LAUNCH'
        : candidate ? 'ALPHA_WATCH' : 'MARKET_ACTIVE';
  return {
    address: normalized,
    poolAddress,
    name: candidate?.name || pool?.baseToken?.name || null,
    symbol: candidate?.symbol || pool?.baseToken?.symbol || 'TOKEN',
    classification: candidate?.classification || pool?.attention || 'RADAR_OBSERVED',
    category,
    platformId: pool?.platformId || pool?.platform_id || null,
    priceUsd: numberOrNull(candidate?.priceUsd ?? pool?.priceUsd),
    valuationUsd: reportedValuation,
    valuationLabel: verifiedMarketCap ? 'MC' : 'FDV',
    verifiedMarketCap,
    liquidityUsd: numberOrNull(candidate?.liquidityUsd ?? pool?.liquidityUsd),
    volume1hUsd: numberOrNull(candidate?.volume1hUsd ?? pool?.volume?.h1),
    volume24hUsd: numberOrNull(candidate?.volume24hUsd ?? pool?.volume?.h24),
    priceChange5mPct: numberOrNull(candidate?.priceChange5mPct ?? pool?.priceChange?.m5),
    priceChange1hPct: numberOrNull(candidate?.priceChange1hPct ?? pool?.priceChange?.h1),
    priceChange24hPct: numberOrNull(candidate?.priceChange24hPct ?? pool?.priceChange?.h24),
    holderCount: numberOrNull(candidate?.enrichment?.holderCount ?? pool?.enrichment?.holderCount ?? pool?.holderCount),
    ageMinutes: numberOrNull(candidate?.ageMinutes ?? pool?.ageMinutes),
    opportunityScore: numberOrNull(candidate?.opportunityScore ?? pool?.discoveryScore),
    warnings: [...new Set([...(candidate?.blockers || []), ...(candidate?.warnings || []), ...(pool?.riskFlags || [])])].slice(0, 6),
    explorerUrl: candidate?.explorerUrl || `https://robinhoodchain.blockscout.com/token/${normalized}`,
    marketUrl: candidate?.geckoTerminalUrl || pool?.geckoTerminalUrl || null,
    externalLinks: externalMarketLinks({ address: normalized, poolAddress }),
  };
}

function communityProjectMarket({ address, projectQuest, radar = {}, alpha = {}, nowMs = Date.now() } = {}) {
  const normalized = normalizeAddress(address);
  if (!normalized) return null;
  const candidate = (alpha.candidates || []).find((item) => normalizeAddress(item.tokenAddress) === normalized);
  const pool = (radar.rankedPools || []).find((item) => normalizeAddress(item.baseToken?.address) === normalized);
  const route = projectQuest?.safety?.routeSnapshot;
  const rows = [
    candidate ? {
      observedAt: candidate.marketObservedAt || candidate.observedAt || null,
      source: 'AXO_ALPHA_SCANNER',
      snapshot: tokenSnapshot(normalized, {}, { candidates: [candidate] }),
    } : null,
    pool ? {
      observedAt: pool.observedAt || null,
      source: 'AXO_LIVE_RADAR',
      snapshot: tokenSnapshot(normalized, { rankedPools: [pool] }, {}),
    } : null,
    route ? {
      observedAt: route.observedAt || projectQuest?.safety?.checkedAt || null,
      source: 'HATCHERY_EVIDENCE_INSPECTOR',
      snapshot: {
        symbol: projectQuest?.symbol || null,
        poolAddress: route.poolAddress || null,
        priceUsd: numberOrNull(route.priceUsd),
        valuationUsd: numberOrNull(route.poolFdvUsd ?? route.fdvUsd),
        valuationLabel: 'FDV',
        verifiedMarketCap: false,
        priceChange24hPct: numberOrNull(route.priceChange24hPct),
        holderCount: numberOrNull(route.holderCount ?? projectQuest?.safety?.holderCount),
      },
    } : null,
  ].filter(Boolean).map((row) => ({ ...row, observedMs: Date.parse(String(row.observedAt || '')) }))
    .filter((row) => Number.isFinite(row.observedMs)
      && row.observedMs <= nowMs + OBSERVATION_MAX_FUTURE_SKEW_MS
      && nowMs - row.observedMs <= PROJECT_SAFETY_TTL_MS)
    .sort((a, b) => b.observedMs - a.observedMs);

  const fallbackSymbol = safeText(projectQuest?.symbol, 20) || null;
  const tickerRow = rows.find((row) => {
    const symbol = safeText(row.snapshot?.symbol, 20).toUpperCase();
    return symbol && !['UNKNOWN', 'TOKEN', 'PROJECT'].includes(symbol);
  });
  const poolRow = rows.find((row) => /^0x(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(String(row.snapshot?.poolAddress || '')));
  const priceRow = rows.find((row) => Number(row.snapshot?.priceUsd) > 0);
  const valuationRow = rows.find((row) => Number(row.snapshot?.valuationUsd) > 0);
  const changeRow = rows.find((row) => numberOrNull(row.snapshot?.priceChange24hPct) !== null);
  const holderRow = rows.find((row) => Number.isInteger(Number(row.snapshot?.holderCount)) && Number(row.snapshot.holderCount) >= 0);
  const usedRows = [...new Set([poolRow, priceRow, valuationRow, changeRow, holderRow].filter(Boolean))];
  const valuationVerified = valuationRow?.snapshot?.verifiedMarketCap === true
    && valuationRow?.snapshot?.valuationLabel === 'MC';
  return {
    address: normalized,
    symbol: safeText(tickerRow?.snapshot?.symbol || fallbackSymbol, 20) || null,
    poolAddress: poolRow ? String(poolRow.snapshot.poolAddress).toLowerCase() : null,
    market: {
      status: !rows.length ? 'UNAVAILABLE'
        : priceRow && valuationRow && holderRow ? 'FRESH_COMPLETE' : 'FRESH_PARTIAL',
      observedAt: usedRows.length
        ? new Date(Math.min(...usedRows.map((row) => row.observedMs))).toISOString()
        : rows[0] ? new Date(rows[0].observedMs).toISOString() : null,
      source: usedRows.length
        ? [...new Set(usedRows.map((row) => row.source))].join('+')
        : rows[0]?.source || null,
      valuationLabel: valuationVerified ? 'MC' : 'FDV',
      valuationUsd: valuationRow ? numberOrNull(valuationRow.snapshot.valuationUsd) : null,
      verifiedMarketCap: valuationVerified,
      priceUsd: priceRow ? numberOrNull(priceRow.snapshot.priceUsd) : null,
      holderCount: holderRow ? Math.max(0, Math.floor(Number(holderRow.snapshot.holderCount))) : null,
      priceChange24hPct: changeRow ? numberOrNull(changeRow.snapshot.priceChange24hPct) : null,
      freshnessTtlMs: PROJECT_SAFETY_TTL_MS,
    },
  };
}

function percentageChange(current, baseline) {
  const a = Number(current); const b = Number(baseline);
  return Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? Number((((a - b) / Math.abs(b)) * 100).toFixed(2)) : null;
}

function watchlistView(player, radar, alpha) {
  return (player.missionControl?.watchlist || []).map((entry) => {
    const live = tokenSnapshot(entry.address, radar, alpha); const baseline = entry.baseline || {};
    const alerts = [];
    if (live.classification !== 'NOT_CURRENTLY_RANKED' && baseline.classification && live.classification !== baseline.classification) alerts.push({ type: 'CLASSIFICATION_CHANGED', tone: live.classification === 'REJECT' ? 'RISK' : 'NOTICE', message: `${baseline.classification} → ${live.classification}` });
    const liquidityChangePct = percentageChange(live.liquidityUsd, baseline.liquidityUsd);
    if (liquidityChangePct !== null && Math.abs(liquidityChangePct) >= 20) alerts.push({ type: 'LIQUIDITY_MOVED', tone: liquidityChangePct < 0 ? 'RISK' : 'NOTICE', message: `Liquidity ${liquidityChangePct > 0 ? '+' : ''}${liquidityChangePct}% since saved` });
    const newWarnings = (live.warnings || []).filter((warning) => !(baseline.warnings || []).includes(warning));
    if (newWarnings.length) alerts.push({ type: 'NEW_WARNING', tone: 'RISK', message: newWarnings[0] });
    return { ...entry, live, changes: { liquidityPct: liquidityChangePct, pricePct: percentageChange(live.priceUsd, baseline.priceUsd) }, alerts };
  });
}

const STREAM_DEFAULT_FILTERS = Object.freeze({
  category: 'ALL', minValuationUsd: null, maxValuationUsd: null, minLiquidityUsd: 10_000,
  minHolders: null, minGrowth1hPct: null, minVolume1hUsd: null, maxAgeHours: null,
  taState: 'ALL', riskMode: 'EXCLUDE_REJECTED', sort: 'SCORE', search: '', favoritesOnly: false,
});
const STREAM_CATEGORIES = new Set(['ALL', 'EARLY_DEGEN', 'LONG_HOLD', 'NEW_LAUNCH', 'ALPHA_WATCH', 'MARKET_ACTIVE']);
const STREAM_TA_STATES = new Set(['ALL', 'BREAKOUT_WATCH', 'MOMENTUM', 'RECLAIM_WATCH', 'PULLBACK', 'NEUTRAL', 'FORMING']);
const STREAM_RISK_MODES = new Set(['EXCLUDE_REJECTED', 'INCLUDE_ALL', 'RISK_ONLY']);
const STREAM_SORTS = new Set(['SCORE', 'GROWTH', 'LIQUIDITY', 'VOLUME', 'HOLDERS', 'NEWEST']);

function sanitizeLiveStream(input = {}, prior = {}) {
  const raw = input.filters && typeof input.filters === 'object' ? input.filters : input;
  const numeric = (key, { min = 0, max = 1_000_000_000_000 } = {}) => {
    const value = numberOrNull(raw[key]); return value === null ? null : Math.max(min, Math.min(max, value));
  };
  const filters = {
    ...STREAM_DEFAULT_FILTERS,
    category: STREAM_CATEGORIES.has(String(raw.category || '').toUpperCase()) ? String(raw.category).toUpperCase() : STREAM_DEFAULT_FILTERS.category,
    minValuationUsd: numeric('minValuationUsd'), maxValuationUsd: numeric('maxValuationUsd'),
    minLiquidityUsd: numeric('minLiquidityUsd'), minHolders: numeric('minHolders', { max: 100_000_000 }),
    minGrowth1hPct: numeric('minGrowth1hPct', { min: -1_000, max: 100_000 }), minVolume1hUsd: numeric('minVolume1hUsd'),
    maxAgeHours: numeric('maxAgeHours', { max: 100_000 }),
    taState: STREAM_TA_STATES.has(String(raw.taState || '').toUpperCase()) ? String(raw.taState).toUpperCase() : STREAM_DEFAULT_FILTERS.taState,
    riskMode: STREAM_RISK_MODES.has(String(raw.riskMode || '').toUpperCase()) ? String(raw.riskMode).toUpperCase() : STREAM_DEFAULT_FILTERS.riskMode,
    sort: STREAM_SORTS.has(String(raw.sort || '').toUpperCase()) ? String(raw.sort).toUpperCase() : STREAM_DEFAULT_FILTERS.sort,
    search: safeText(raw.search, 60), favoritesOnly: raw.favoritesOnly === true,
  };
  if (filters.minValuationUsd !== null && filters.maxValuationUsd !== null && filters.maxValuationUsd < filters.minValuationUsd) filters.maxValuationUsd = filters.minValuationUsd;
  return { name: safeText(input.name || prior.name || 'My signal stream', 40) || 'My signal stream', filters, updatedAt: prior.updatedAt || null };
}

function derivedTaState(snapshot = {}) {
  const move5m = numberOrNull(snapshot.priceChange5mPct); const move1h = numberOrNull(snapshot.priceChange1hPct);
  if (move5m === null && move1h === null) return 'FORMING';
  if (move1h !== null && move1h >= 8 && move5m !== null && move5m >= 0) return 'BREAKOUT_WATCH';
  if (move1h !== null && move1h >= 2) return 'MOMENTUM';
  if (move1h !== null && move1h < 0 && move5m !== null && move5m > 0) return 'RECLAIM_WATCH';
  if (move1h !== null && move1h <= -8) return 'PULLBACK';
  return 'NEUTRAL';
}

function missionControlCatalog(player, radar = {}, alpha = {}, marketDatabase = {}) {
  const favorites = new Set((player.missionControl?.favorites || []).map((entry) => normalizeAddress(entry.address)).filter(Boolean));
  const recent = new Map((player.missionControl?.recentProjects || []).map((entry) => [normalizeAddress(entry.address), entry.visitedAt]).filter(([address]) => address));
  const marketRows = [...(marketDatabase?.database?.opportunities || []), ...(marketDatabase?.database?.earlyDegen || [])];
  const marketByAddress = new Map(marketRows.map((row) => [normalizeAddress(row.address), row]).filter(([address]) => address));
  const addresses = new Set([
    ...(radar.rankedPools || []).map((item) => normalizeAddress(item.baseToken?.address)),
    ...(alpha.candidates || []).map((item) => normalizeAddress(item.tokenAddress)),
    ...marketByAddress.keys(), ...favorites, ...recent.keys(),
  ].filter(Boolean));
  const items = [];
  for (const address of addresses) {
    const snapshot = tokenSnapshot(address, radar, alpha); const market = marketByAddress.get(address) || {};
    const taState = safeText(market.ta_state || market.taState, 40).toUpperCase() || derivedTaState(snapshot);
    const pipelineStage = safeText(market.pipeline_stage || market.pipelineStage, 40).toUpperCase() || snapshot.classification;
    const category = market.ageMinutes !== undefined && Number(market.ageMinutes) <= 48 * 60 ? 'EARLY_DEGEN'
      : market.platform_id || market.platformId ? 'NEW_LAUNCH' : snapshot.category;
    const item = {
      ...snapshot,
      name: market.name || snapshot.name, symbol: market.symbol || snapshot.symbol, poolAddress: market.primary_pool_address || market.poolAddress || snapshot.poolAddress,
      category, pipelineStage, taState, taSource: market.ta_state || market.taState ? 'ACTIVITY_DATABASE' : 'FLOW_DERIVED',
      priceUsd: numberOrNull(market.latest_price_usd ?? snapshot.priceUsd),
      liquidityUsd: numberOrNull(market.latest_liquidity_usd ?? market.liquidityUsd ?? snapshot.liquidityUsd),
      volume1hUsd: numberOrNull(market.latest_volume_1h_usd ?? market.volume1hUsd ?? snapshot.volume1hUsd),
      volume24hUsd: numberOrNull(market.latest_volume_24h_usd ?? market.volume24hUsd ?? snapshot.volume24hUsd),
      priceChange5mPct: numberOrNull(market.latest_change_5m_pct ?? market.change5mPct ?? snapshot.priceChange5mPct),
      priceChange1hPct: numberOrNull(market.latest_change_1h_pct ?? market.change1hPct ?? snapshot.priceChange1hPct),
      opportunityScore: numberOrNull(market.opportunity_score ?? market.score ?? snapshot.opportunityScore),
      ageMinutes: numberOrNull(market.ageMinutes ?? snapshot.ageMinutes), observationCount: numberOrNull(market.observation_count ?? market.observationCount),
      favorite: favorites.has(address), recentAt: recent.get(address) || null,
      riskTone: /REJECT|RISK|BLOCK/i.test(`${snapshot.classification} ${pipelineStage}`) ? 'RISK' : snapshot.warnings?.length ? 'CAUTION' : 'WATCH',
      href: `/token/${address}`, externalLinks: externalMarketLinks({ address, poolAddress: market.primary_pool_address || market.poolAddress || snapshot.poolAddress }),
    };
    items.push(item);
  }
  return items.sort((a, b) => Number(b.favorite) - Number(a.favorite) || Number(b.opportunityScore || 0) - Number(a.opportunityScore || 0) || Number(b.volume1hUsd || 0) - Number(a.volume1hUsd || 0)).slice(0, 160);
}

function missionControlPreferencesView(player, catalog) {
  const byAddress = new Map(catalog.map((item) => [item.address, item]));
  const enrich = (entry, timestampKey) => ({ ...entry, project: byAddress.get(normalizeAddress(entry.address)) || null, timestamp: entry[timestampKey] || null });
  return {
    favorites: (player.missionControl?.favorites || []).map((entry) => enrich(entry, 'addedAt')),
    recentProjects: (player.missionControl?.recentProjects || []).map((entry) => enrich(entry, 'visitedAt')),
    liveStream: sanitizeLiveStream(player.missionControl?.liveStream || {}, player.missionControl?.liveStream || {}),
    limits: { favorites: MISSION_CONTROL_FAVORITES_MAX, recentProjects: MISSION_CONTROL_RECENT_MAX },
  };
}

function missionDeck(state, player, nowMs = Date.now()) {
  const day = isoDay(nowMs); const start = Date.parse(`${day}T00:00:00.000Z`); const end = Date.parse(`${day}T23:59:59.999Z`);
  const events = playerPetEvents(state, player).filter((event) => { const at = Date.parse(event.at); return at >= start && at <= end; });
  const bootstrap = communityReadiness(state).phase === 'BOOTSTRAP';
  const definitions = bootstrap ? [
    { id: 'care', label: 'Care ritual', description: 'Play, rest, train, or spend a bonding moment with AXO.', eventTypes: ['CARE_ACTION', 'PET_PETTED'], href: '/hatchery?play=1' },
    { id: 'calibration', label: 'Solo evidence drill', description: 'Complete today’s known-outcome simulation while the founding Crew is forming.', eventTypes: ['CALIBRATION_COMPLETED'], href: '/hatchery?play=1&panel=crew' },
  ] : [
    { id: 'care', label: 'Care ritual', description: 'Play, rest, train, or spend a bonding moment with AXO.', eventTypes: ['CARE_ACTION', 'PET_PETTED'], href: '/hatchery?play=1' },
    { id: 'feed', label: 'Feed blockchain intel', description: 'Complete one structured research feeding from the expedition deck.', eventTypes: ['EXPEDITION_RECEIPT_SUBMITTED', 'PROJECT_QUEST_PUBLISHED'], href: '/hatchery?play=1&panel=quests' },
    { id: 'community', label: 'Community pulse', description: 'Corroborate a project or submit one linked X/Telegram daily feeding.', eventTypes: ['PROJECT_QUEST_CORROBORATED', 'PROJECT_QUEST_SCAM_VOTE', 'DAILY_SOCIAL_FEEDING_CLAIMED'], href: '/hatchery?play=1&panel=crew' },
  ];
  const missions = definitions.map((mission) => { const event = events.find((item) => mission.eventTypes.includes(item.type)); return { ...mission, complete: Boolean(event), completedAt: event?.at || null }; });
  const completed = missions.filter((mission) => mission.complete).length; const claim = player.missionControl?.dailyClaims?.[day] || null;
  return { day, missions, completed, goal: missions.length, complete: completed === missions.length, claimed: Boolean(claim), claimedAt: claim?.claimedAt || null, reward: { xp: MISSION_CONTROL_DAILY_XP, affectsTrust: false } };
}

function projectReactionSummary(state, player, address) {
  const normalized = normalizeAddress(address); const reactions = [];
  if (!normalized) return null;
  for (const walletPlayer of Object.values(state.players || {})) {
    if (!walletPlayer.walletVerified) continue;
    const reaction = walletPlayer.missionControl?.projectReactions?.[normalized];
    if (reaction && ['GOOD_PICK', 'NOT_CONVINCED'].includes(reaction.verdict)) reactions.push(reaction);
  }
  const goodPicks = reactions.filter((reaction) => reaction.verdict === 'GOOD_PICK').length;
  const notConvinced = reactions.length - goodPicks; const leadingCount = Math.max(goodPicks, notConvinced);
  const agreementPct = reactions.length ? Math.round((leadingCount / reactions.length) * 100) : 0;
  const averageConfidence = reactions.length ? Math.round(reactions.reduce((sum, reaction) => sum + Number(reaction.confidence || 0), 0) / reactions.length) : null;
  const status = reactions.length < CONSENSUS_MINIMUM ? 'FORMING' : agreementPct >= 67 ? 'CORROBORATED' : 'CONTESTED';
  return {
    status,
    contributors: reactions.length,
    minimumContributors: CONSENSUS_MINIMUM,
    goodPicks,
    notConvinced,
    goodPickPct: reactions.length ? Math.round((goodPicks / reactions.length) * 100) : null,
    agreementPct,
    averageConfidence,
    consensusVerdict: status === 'CORROBORATED' ? (goodPicks >= notConvinced ? 'GOOD_PICK' : 'NOT_CONVINCED') : null,
    userReaction: player.missionControl?.projectReactions?.[normalized] || null,
    note: 'Verified-wallet sentiment only. It does not prove safety or change AXO rankings.',
    affectsProductionRanking: false,
  };
}

function evidenceConfidence(item = {}) {
  const sourceVerified = item.enrichment?.sourceVerification === 'VERIFIED';
  let score = 20 + (sourceVerified ? 20 : 0) + (Number(item.liquidityUsd || 0) >= 10_000 ? 15 : 0) + (Number(item.volume1hUsd || 0) >= 1_000 ? 15 : 0) + Math.min(20, Number(item.opportunityScore || 0) * 0.2);
  score -= Math.min(30, Number((item.blockers || []).length) * 10 + Number((item.warnings || []).length) * 4);
  score = Math.round(clamp(score));
  return { score, label: score >= 75 ? 'HIGH EVIDENCE' : score >= 50 ? 'MEDIUM EVIDENCE' : 'FORMING EVIDENCE' };
}

function personalizedIntel(player, state, radar = {}, alpha = {}, narrative = {}) {
  const route = skillRoute(player) || 'crawler';
  const candidates = (alpha.candidates || []).slice(0, 12);
  const watched = new Set((player.missionControl?.watchlist || []).map((entry) => normalizeAddress(entry.address)).filter(Boolean));
  const ranked = [...candidates].sort((a, b) => route === 'guardian'
    ? Number((b.blockers || []).length + (b.warnings || []).length) - Number((a.blockers || []).length + (a.warnings || []).length)
    : route === 'sniper' ? Number(b.opportunityScore || 0) - Number(a.opportunityScore || 0)
      : route === 'oracle' ? Number(projectReactionSummary(state, player, b.tokenAddress)?.contributors || 0) - Number(projectReactionSummary(state, player, a.tokenAddress)?.contributors || 0)
      : Number(b.enrichment?.sourceVerification === 'VERIFIED') - Number(a.enrichment?.sourceVerification === 'VERIFIED'));
  const routeLabel = route === 'guardian' ? 'Guardian risk desk' : route === 'sniper' ? 'Hunter opportunity desk' : route === 'oracle' ? 'Oracle community desk' : 'Crawler evidence desk';
  const routeBasis = route === 'guardian' ? 'Your Guardian route surfaces contradictions and invalidation first.' : route === 'sniper' ? 'Your Hunter route prioritizes activity, flow, and opportunity score.' : route === 'oracle' ? 'Your Oracle route prioritizes projects the Crew is actively corroborating.' : 'Your Crawler route prioritizes source verification and holder evidence.';
  return {
    route,
    label: routeLabel,
    basis: routeBasis,
    narrativeContext: route === 'oracle' ? (narrative.narratives || [])[0]?.opportunity || null : null,
    items: ranked.slice(0, 5).map((item, index) => {
      const snapshot = tokenSnapshot(item.tokenAddress, radar, alpha); const confidence = evidenceConfidence(item); const isWatched = watched.has(normalizeAddress(item.tokenAddress));
      const fitScore = clamp(Number(item.opportunityScore || 0) + (isWatched ? 8 : 0) + (route === 'guardian' ? Math.min(18, Number((item.blockers || []).length + (item.warnings || []).length) * 3) : route === 'crawler' && item.enrichment?.sourceVerification === 'VERIFIED' ? 8 : 0));
      const whyForYou = route === 'guardian' ? `${(item.blockers || []).length + (item.warnings || []).length} risk or caution signals match your Guardian lens.` : route === 'crawler' ? `${item.enrichment?.sourceVerification || 'UNVERIFIED'} source with ${item.enrichment?.holderCount || 0} observed holders matches your Crawler lens.` : route === 'oracle' ? 'Crew participation and independent wallet sentiment match your Oracle lens.' : `${item.txns1h?.buyers || 0} buyers and ${item.volume1hUsd ? Math.round(item.volume1hUsd).toLocaleString('en-US') : 0} USD 1h volume match your Hunter lens.`;
      return { id: item.tokenAddress, kind: 'TOKEN', address: item.tokenAddress, poolAddress: snapshot?.poolAddress || null, symbol: item.symbol, title: item.name || item.symbol, status: item.classification, score: item.opportunityScore, personalRank: index + 1, personalFitScore: Math.round(fitScore), whyForYou: `${whyForYou}${isWatched ? ' Your wallet also watches this contract.' : ''}`, evidenceConfidence: confidence, watched: isWatched, liquidityUsd: item.liquidityUsd, volume1hUsd: item.volume1hUsd, priceChange1hPct: item.priceChange1hPct, summary: route === 'guardian' ? (item.blockers || item.warnings || [])[0] || 'No current blocker recorded.' : route === 'crawler' ? `${item.enrichment?.sourceVerification || 'UNVERIFIED'} source · ${item.enrichment?.holderCount || 0} holders observed` : `${item.txns1h?.buyers || 0} buyers · ${item.volume1hUsd ? Math.round(item.volume1hUsd).toLocaleString('en-US') : 0} USD 1h volume`, invalidation: (item.blockers || [])[0] || null, href: `/token/${item.tokenAddress}`, externalLinks: snapshot?.externalLinks || externalMarketLinks({ address: item.tokenAddress }), reaction: projectReactionSummary(state, player, item.tokenAddress) };
    }),
  };
}
function sprintStatus(sprint, nowMs = Date.now()) {
  if (sprint.cancelledAt) return 'CANCELLED';
  if (sprint.rewardedAt) return 'REWARDED';
  const startMs = Date.parse(sprint.startsAt); const endMs = Math.min(Date.parse(sprint.endsAt), sprint.endedAt ? Date.parse(sprint.endedAt) : Number.POSITIVE_INFINITY);
  if (nowMs < startMs) return 'SCHEDULED';
  if (nowMs < endMs) return 'ACTIVE';
  return 'ENDED';
}
function sprintWindow(sprint) {
  return { startMs: Date.parse(sprint.startsAt), endMs: Math.min(Date.parse(sprint.endsAt), sprint.endedAt ? Date.parse(sprint.endedAt) : Number.POSITIVE_INFINITY) };
}
function sprintStandings(state, sprint, nowMs = Date.now()) {
  const { startMs, endMs } = sprintWindow(sprint); const scoreUntil = Math.min(nowMs, endMs);
  return Object.values(state.players).filter((player) => player.walletVerified && normalizeAddress(player.ownerAddress)).map((player) => {
    const xpGain = scoreUntil >= startMs ? xpGainedBetween(state, player, startMs, scoreUntil) : 0; const score = scoreUntil >= startMs ? sprintPointsBetween(state, player, startMs, scoreUntil) : 0; const visual = evolutionVisual(player);
    return { genesisId: player.pet.genesisId, name: player.pet.name, lineage: lineageDefinition(player.pet.lineageId).label, level: currentLevel(player.pet.xp), totalXp: Number(player.pet.xp || 0), xpGain, score, visual: visual.asset, specialtyArchetype: specialtyArchetype(player), lastAction: latestPetAction(state, player) };
  }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || b.xpGain - a.xpGain || b.totalXp - a.totalXp || a.genesisId.localeCompare(b.genesisId)).map((entry, index) => ({ ...entry, rank: index + 1 }));
}
function publicSprint(state, sprint, nowMs = Date.now(), { includeStandings = true } = {}) {
  const status = sprintStatus(sprint, nowMs); const standings = includeStandings ? sprintStandings(state, sprint, nowMs) : []; const { startMs, endMs } = sprintWindow(sprint);
  return {
    id: sprint.id, title: sprint.title, description: sprint.description, startsAt: sprint.startsAt, endsAt: sprint.endsAt, effectiveEndsAt: new Date(endMs).toISOString(), status,
    durationMs: Number(sprint.durationMs || Date.parse(sprint.endsAt) - startMs), participantCount: standings.length, totalXpGained: standings.reduce((sum, entry) => sum + entry.xpGain, 0), totalScore: standings.reduce((sum, entry) => sum + entry.score, 0), phase: sprint.competitive === false ? 'BOOTSTRAP' : 'COMPETITIVE', competitive: sprint.competitive !== false, timeRemainingMs: status === 'SCHEDULED' ? Math.max(0, startMs - nowMs) : status === 'ACTIVE' ? Math.max(0, endMs - nowMs) : 0,
    reward: { label: sprint.reward.label, description: sprint.reward.description, winnerCount: sprint.reward.winnerCount, bonusXp: sprint.reward.bonusXp, awarded: Boolean(sprint.rewardedAt), awardedAt: sprint.rewardedAt || null },
    standings: standings.slice(0, 100), winners: (sprint.winners || []).map(({ wallet: _wallet, ...winner }) => winner), createdAt: sprint.createdAt, updatedAt: sprint.updatedAt,
  };
}
function reputationDomain(player, type) {
  player.reputation.byDomain ||= {};
  player.reputation.byDomain[type] ||= { submissions: 0, corroborated: 0, resolved: 0, correct: 0, accuracy: null };
  return player.reputation.byDomain[type];
}
function refreshAccuracy(player) {
  const resolved = Number(player.reputation.resolved || 0); const correct = Object.values(player.reputation.byDomain || {}).reduce((sum, item) => sum + Number(item.correct || 0), 0);
  player.reputation.accuracy = resolved ? Number((correct / resolved).toFixed(3)) : null;
  for (const domain of Object.values(player.reputation.byDomain || {})) domain.accuracy = domain.resolved ? Number((Number(domain.correct || 0) / Number(domain.resolved)).toFixed(3)) : null;
}
function settleConsensusRewards(state, records, nowIso, queueReward = null) {
  let finalized = 0; let releasedCount = 0;
  for (const record of records.filter((item) => item.status === 'CORROBORATED')) {
    const scopedContributions = record.type === 'contract_scout' && record.projectQuestId && record.epochId
      ? (state.contributions || []).filter((entry) => isProjectJudgmentContribution(entry, record.projectQuestId)
        && contributionEpochId(entry) === record.epochId)
      : state.contributions;
    state.consensusFinalizations ||= {};
    const existing = state.consensusFinalizations[record.key];
    const immediateContractFinalization = record.type === 'contract_scout';
    if (!existing && !immediateContractFinalization && (!record.finalizableAt || Date.parse(nowIso) < Date.parse(record.finalizableAt))) continue;
    const cutoffAt = immediateContractFinalization ? nowIso : record.finalizableAt || nowIso;
    const eligibleAtCutoff = latestWalletVotes(scopedContributions, record.type, record.entity)
      .filter((contribution) => record.consensusContributionIds?.includes(contribution.id) && Date.parse(contribution.createdAt || 0) <= Date.parse(cutoffAt))
      .map((contribution) => contribution.id)
      .sort();
    const revisionHash = `0x${crypto.createHash('sha256').update(JSON.stringify({ recordKey: record.key, verdict: record.consensusVerdict, cutoffAt, contributionIds: eligibleAtCutoff })).digest('hex')}`;
    const finalization = existing || {
      id: crypto.randomUUID(),
      recordKey: record.key,
      verdict: record.consensusVerdict,
      consensusShare: record.consensusShare,
      qualifiedContributors: eligibleAtCutoff.length,
      contributionIds: eligibleAtCutoff,
      revisionHash,
      quorumAt: record.quorumAt,
      cutoffAt,
      finalizedAt: nowIso,
      immutable: true,
    };
    if (!existing) { state.consensusFinalizations[record.key] = finalization; finalized += 1; }
    const frozenContributionIds = new Set(finalization.contributionIds || []);
    for (const contribution of latestWalletVotes(scopedContributions, record.type, record.entity)) {
      if (contribution.xp?.settled || !frozenContributionIds.has(contribution.id) || contribution.consensusEligible !== true || contribution.verdict !== finalization.verdict) continue;
      const player = state.players[contribution.playerId]; if (!player) continue;
      const released = Number(contribution.xp?.pending || 0);
      player.pet.xp += released; contribution.xp = { ...contribution.xp, pending: 0, released: Number(contribution.xp?.released || 0) + released, settled: true, settledAt: nowIso, settlement: 'COMMUNITY_CORROBORATED' };
      player.reputation.trust = clamp(Number(player.reputation.trust || 25) + 1, 0, 100);
      player.reputation.corroborated = Number(player.reputation.corroborated || 0) + 1;
      reputationDomain(player, contribution.type).corroborated += 1;
      recordEvent(state, 'EXPEDITION_REWARD_RELEASED', player.id, { contributionId: contribution.id, xp: released, recordKey: record.key, finalizationId: finalization.id }, nowIso);
      if (released > 0 && typeof queueReward === 'function') queueReward({
        id: `corroboration:${finalization.id}:${contribution.id}`,
        player,
        amount: record.type === 'contract_scout' ? Math.min(CONTRACT_JUDGMENT_CORROBORATED_XP, released) : Math.min(ALPHA_XP_REASON_CODES.INDEPENDENT_CORROBORATION.maximumXp, released),
        reasonCode: record.type === 'contract_scout' ? 'CONTRACT_JUDGMENT_CORROBORATED' : 'INDEPENDENT_CORROBORATION',
        recordedAt: nowIso,
        sourceId: finalization.id,
        receiptId: contribution.id,
        receiptClass: contribution.receiptClass,
        evidenceHash: `0x${crypto.createHash('sha256').update(JSON.stringify({ finalizationId: finalization.id, revisionHash: finalization.revisionHash, contributionId: contribution.id, released })).digest('hex')}`,
        sourceHash: finalization.revisionHash,
      });
      releasedCount += 1;
    }
    if (record.type === 'contract_scout') {
      const discovery = record.projectQuestId
        ? (state.contributions || []).find((contribution) => contribution.projectQuestId === record.projectQuestId
          && contribution.type === record.type
          && !String(contribution.taskId || '').startsWith('project:'))
        : latestWalletVotes(state.contributions, record.type, record.entity)
          .find((contribution) => !String(contribution.taskId || '').startsWith('project:'));
      const discoverer = discovery ? state.players[discovery.playerId] : null;
      const released = Number(discovery?.xp?.pending || 0);
      if (discovery && discoverer && !discovery.xp?.settled && released > 0) {
        discoverer.pet.xp += released;
        discovery.xp = { ...discovery.xp, pending: 0, released: Number(discovery.xp?.released || 0) + released, settled: true, settledAt: nowIso, settlement: 'CONTRACT_DISCOVERY_CORROBORATED' };
        recordEvent(state, 'CONTRACT_DISCOVERY_CORROBORATED', discoverer.id, { contributionId: discovery.id, xp: released, recordKey: record.key, finalizationId: finalization.id }, nowIso);
        if (typeof queueReward === 'function') queueReward({
          id: `contract-discovery:${finalization.id}:${discovery.id}`,
          player: discoverer,
          amount: Math.min(CONTRACT_DISCOVERY_CORROBORATED_XP, released),
          reasonCode: 'CONTRACT_DISCOVERY_CORROBORATED',
          recordedAt: nowIso,
          sourceId: finalization.id,
          receiptId: discovery.id,
          receiptClass: discovery.receiptClass,
          evidenceHash: `0x${crypto.createHash('sha256').update(JSON.stringify({ finalizationId: finalization.id, revisionHash: finalization.revisionHash, discoveryId: discovery.id, released })).digest('hex')}`,
          sourceHash: finalization.revisionHash,
        });
        releasedCount += 1;
      }
    }
  }
  return { finalized, released: releasedCount };
}
function resolveOutcomeInState(state, { type, entity, verdict, evidenceUrl, note }, nowIso, queueReward = null) {
  const key = `${type}:${entityKey(entity)}`; const cleanVerdict = safeText(verdict, 40).toUpperCase(); const source = safeUrl(evidenceUrl);
  if (!TASKS[type]) throw new Error('outcome_type_invalid');
  if (!['INTERESTING', 'NOT_INTERESTING', 'INSUFFICIENT_EVIDENCE', 'WATCH', 'RISK', 'POSITIVE', 'NEGATIVE', 'MIXED'].includes(cleanVerdict)) throw new Error('outcome_verdict_invalid');
  if (!source) throw new Error('outcome_evidence_required');
  if (!evidenceDomain(source)) throw new Error('outcome_evidence_public_https_required');
  const existing = state.outcomes[key];
  if (existing) {
    if (existing.verdict === cleanVerdict && existing.evidenceUrl === source) return existing;
    throw new Error('outcome_already_finalized');
  }
  const outcome = { id: crypto.randomUUID(), version: 1, finalized: true, immutable: true, key, type, entity: normalizeEntity(entity), entityKey: entityKey(entity), verdict: cleanVerdict, evidenceUrl: source, note: safeText(note, 500), resolvedAt: nowIso };
  state.outcomes[key] = outcome;
  for (const contribution of state.contributions.filter((item) => `${item.type}:${item.entityKey || entityKey(item.entity)}` === key && !item.outcomeSettledAt)) {
    const player = state.players[contribution.playerId]; if (!player) continue;
    const correct = contribution.verdict === cleanVerdict;
    const petRewardEligible = contribution.petRewardEligible !== false && (!contribution.petGenesisId || contribution.petGenesisId === player.pet.genesisId);
    const released = correct && petRewardEligible ? Number(contribution.xp?.pending || 0) + 4 : 0;
    const settlement = correct ? (petRewardEligible ? 'OUTCOME_CORRECT' : 'OUTCOME_CORRECT_PET_REWARD_EXPIRED') : 'OUTCOME_MISSED';
    player.pet.xp += released; contribution.xp = { ...contribution.xp, pending: 0, released: Number(contribution.xp?.released || 0) + released, settled: true, settledAt: nowIso, settlement };
    contribution.outcomeSettledAt = nowIso; contribution.outcomeCorrect = correct; contribution.outcomeKey = key;
    player.reputation.resolved = Number(player.reputation.resolved || 0) + 1; player.reputation.trust = clamp(Number(player.reputation.trust || 25) + (correct ? 3 : -1), 0, 100);
    const domain = reputationDomain(player, contribution.type); domain.resolved += 1; if (correct) domain.correct += 1; refreshAccuracy(player);
    recordEvent(state, 'EXPEDITION_OUTCOME_SETTLED', player.id, { contributionId: contribution.id, correct, xp: released, outcomeKey: key }, nowIso);
    if (correct && petRewardEligible && released > 0 && typeof queueReward === 'function') queueReward({
      id: `outcome:${outcome.id}:${contribution.id}`,
      player,
      amount: Math.min(ALPHA_XP_REASON_CODES.RESOLVED_OUTCOME_CORRECT.maximumXp, released),
      reasonCode: 'RESOLVED_OUTCOME_CORRECT',
      recordedAt: nowIso,
      sourceId: outcome.id,
      receiptId: contribution.id,
      receiptClass: contribution.receiptClass,
      evidenceHash: `0x${crypto.createHash('sha256').update(JSON.stringify({ outcomeId: outcome.id, contributionId: contribution.id, verdict: cleanVerdict, released, evidenceUrl: source })).digest('hex')}`,
      sourceHash: `0x${crypto.createHash('sha256').update(JSON.stringify({ outcomeKey: key, version: outcome.version, evidenceUrl: source })).digest('hex')}`,
    });
  }
  return outcome;
}
function aggregateIntelligence(contributions = []) { return buildIntelligence(contributions).filter((item) => item.contributors >= 3).slice(0, 30); }
function treeFor(player) {
  const level = currentLevel(player.pet.xp); const selected = new Set(player.pet.skills || []); const points = skillPoints(player);
  return { routes: ROUTES, points, nodes: Object.entries(SKILL_TREE).map(([id, node]) => ({ id, ...node, selected: selected.has(id), available: !selected.has(id) && points.available > 0 && level >= node.level && (node.capstone ? Object.values(SKILL_TREE).filter((entry) => entry.tier === 3).filter((entry) => selected.has(Object.keys(SKILL_TREE).find((id2) => SKILL_TREE[id2] === entry))).length >= 2 : node.requires.every((required) => selected.has(required))) })) };
}
function intelBrief(player, contributions) {
  if (currentLevel(player.pet.xp) < 10) return { unlocked: false, levelRequired: 10, speechMode: 'EMOTIONAL_ONLY', items: [] };
  const items = aggregateIntelligence(contributions).filter((item) => item.status === 'CORROBORATED').slice(0, 3).map(({ type, entity, consensusVerdict, contributors, averageConfidence, lastObservedAt }) => ({ type, entity, consensusVerdict, contributors, averageConfidence, lastObservedAt }));
  return { unlocked: true, speechMode: 'ROBINHOOD_INTELLIGENCE', message: items.length ? `I found ${items.length} independently corroborated community signal${items.length === 1 ? '' : 's'}. They are research priorities, not verified chain facts.` : 'My intelligence voice is awake, but no community claim has enough independent corroboration yet.', items };
}
function publicPlayer(player, contributions = [], nowMs = Date.now(), radar = {}, { passportRequired = true, socialRewardMissionsActive = false } = {}) {
  applyDecay(player, nowMs);
  const level = currentLevel(player.pet.xp); const stage = currentStage(player.pet.xp); const next = nextLevel(player.pet.xp); const specialty = leadingAbility(player.pet.abilities);
  const suspended = player.moderation?.status === 'SUSPENDED';
  const happy = !suspended && player.pet.vitals.happiness >= 70 && player.pet.vitals.energy >= 40 && player.pet.vitals.bond >= 12;
  const speechUnlocked = level >= 10;
  const effects = equippedEffects(player); const onboarding = onboardingView(player, radar, nowMs, { passportRequired, socialRewardMissionsActive });
  const careTrait = lineageCareTrait(player.pet.lineageId); const archetype = specialtyArchetype(player);
  const inventory = normalizeInventory(player.pet.inventory); const equipped = normalizeEquipped(inventory, player.pet.equipped);
  const visual = { ...evolutionVisual(player), specialtyArchetype: archetype };
  const lastReply = speechUnlocked ? player.pet.lastReply : (String(player.pet.lastReply || '').includes('XP') || /contract|chain|data|reward|signal|intel|tool/i.test(player.pet.lastReply || '') ? companionReply('idle') : player.pet.lastReply);
  return {
    player: { ownerAddress: player.ownerAddress, accountStatus: { status: suspended ? 'SUSPENDED' : 'ACTIVE', suspended, alphaMiningStatus: player.moderation?.alphaMining?.status === 'BLOCKED' ? 'BLOCKED' : 'ACTIVE', alphaMiningBlocked: player.moderation?.alphaMining?.status === 'BLOCKED' }, reputation: player.reputation, identity: player.identity, participation: onboarding.passport, onboarding, feeding: feedingStatus(player, nowMs), care: publicCareState(player, nowMs) },
    pet: { ...player.pet, inventory, equipped, lineage: publicLineage(player.pet.lineageId), careTrait, traits: { ...(player.pet.traits || {}), care: careTrait }, specialtyArchetype: archetype, lastReply, level, stage: stage.name, nextLevel: next, nextStage: next, specialty, happy, visual, equippedEffects: effects, speech: { unlocked: speechUnlocked, mode: speechUnlocked ? 'ROBINHOOD_INTELLIGENCE' : 'EMOTIONAL_ONLY', unlockLevel: 10 }, skillTree: treeFor(player), toolPass: { active: happy, label: happy ? 'HAPPY AXO PASS ACTIVE' : suspended ? 'ACCOUNT SUSPENDED' : 'CARE REQUIRED', note: happy ? 'Full human-tool access, a personalized expedition briefing, and one weekly streak shield are active.' : suspended ? 'The pet-derived Happy AXO pass is paused during administrative review. Earned XP and reputation are preserved.' : 'Reach 70 happiness, 40 energy, and 12 bond to activate the Happy AXO pass.', benefits: happy ? ['FULL_HUMAN_TOOL_ACCESS', 'PERSONALIZED_BRIEFING', 'WEEKLY_STREAK_SHIELD'] : [] } },
    socialIdentities: publicSocialIdentities(player),
    socialFeedings: dailySocialFeedingsView(player, nowMs, { active: socialRewardMissionsActive }),
    dailyXEngagement: dailyXEngagementView(player, nowMs, { active: socialRewardMissionsActive }),
    dailyPromotionQuest: dailyPromotionQuestView(player, nowMs, { active: socialRewardMissionsActive }),
    contributionSummary: { valid: Number(player.reputation.validContributions || 0), pending: contributions.filter((item) => item.playerId === player.id && item.status === 'PENDING_CORROBORATION').length, corroborated: contributions.filter((item) => item.playerId === player.id && item.status === 'CORROBORATED').length, contested: contributions.filter((item) => item.playerId === player.id && item.status === 'CONTESTED').length },
  };
}

function telegramIdentityKey(providerUserId) {
  const value = safeText(providerUserId, 80);
  if (!/^\d{1,24}$/.test(value)) return null;
  return crypto.createHash('sha256').update(`telegram:${value}`).digest('hex');
}

function referralWalletKey(address) {
  const wallet = normalizeAddress(address);
  return wallet ? crypto.createHash('sha256').update(`wallet:${wallet}`).digest('hex') : null;
}

function referralSocialIdentityKey(platform, providerUserId) {
  const cleanPlatform = safeText(platform, 20).toLowerCase();
  const value = safeText(providerUserId, 80);
  if (!['x', 'telegram'].includes(cleanPlatform) || !/^\d{1,24}$/.test(value)) return null;
  return crypto.createHash('sha256').update(`${cleanPlatform}:${value}`).digest('hex');
}

function referralCodeValue(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9]{10,16}$/.test(code) ? code : null;
}

function normalizeAxoRaidTarget(value) {
  const input = normalizeXStatusUrl(value);
  if (!input) return null;
  try {
    const url = new URL(input);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'axo_rh' || parts[1] !== 'status' || !/^\d{8,24}$/.test(parts[2] || '')) return null;
    return { url: `https://x.com/axo_rh/status/${parts[2]}`, postId: parts[2] };
  } catch {
    return null;
  }
}

function normalizeCommunityRaidTarget(value) {
  const input = normalizeXStatusUrl(value);
  if (!input) return null;
  const postId = String(input).match(/\/status\/(\d{8,24})$/)?.[1] || null;
  return postId ? { url: input, postId } : null;
}

function normalizeRaidContribution(value) {
  const raw = String(value || '').trim();
  if (raw.length > RAID_CONTRIBUTION_MAX_LENGTH) throw new Error('crew_raid_contribution_too_long');
  const text = safeText(raw, RAID_CONTRIBUTION_MAX_LENGTH);
  const normalized = text
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/@[A-Za-z0-9_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const words = normalized.split(/\s+/).filter((word) => word.length >= 2);
  if (normalized.length < RAID_CONTRIBUTION_MIN_LENGTH || words.length < 7) throw new Error('crew_raid_contribution_too_short');
  if (/^(done|liked|like done|reposted|retweeted|shared|completed|nice post|good post)\b[.! ]*$/i.test(normalized)) {
    throw new Error('crew_raid_contribution_not_substantive');
  }
  return {
    text,
    normalized,
    hash: crypto.createHash('sha256').update(normalized).digest('hex'),
    wordCount: words.length,
  };
}

function eligibilityView(eligibility = {}) {
  return {
    eligible: eligibility?.eligible === true,
    mode: safeText(eligibility?.mode || 'TOKEN_BALANCE', 32) || 'TOKEN_BALANCE',
    status: safeText(eligibility?.status || 'EVIDENCE_UNAVAILABLE', 40) || 'EVIDENCE_UNAVAILABLE',
    qualifyingSources: Array.isArray(eligibility?.qualifyingSources) ? eligibility.qualifyingSources.slice(0, 4) : [],
    minimums: {
      tokenFormatted: safeText(eligibility?.minimums?.tokenFormatted || '1', 40),
      stakedFormatted: safeText(eligibility?.minimums?.stakedFormatted || '1', 40),
    },
    checkedAt: eligibility?.checkedAt || null,
    policyVersion: Number(eligibility?.policyVersion || 1),
  };
}

function crewRaidStatus(raid, nowMs = Date.now(), claimCount = 0) {
  if (raid?.status === 'CANCELLED') return 'CANCELLED';
  if (raid?.status === 'PENDING_PUBLICATION') return 'PENDING_PUBLICATION';
  if (nowMs < Date.parse(raid?.startsAt || 0)) return 'SCHEDULED';
  if (nowMs > Date.parse(raid?.endsAt || 0)) return claimCount >= Number(raid?.goal || 0) ? 'CLEARED' : 'EXPIRED';
  return claimCount >= Number(raid?.goal || 0) ? 'CLEARED' : 'ACTIVE';
}

function crewRaidView(state, raid, owner = null, nowMs = Date.now()) {
  if (!raid) return null;
  const claims = Object.values(state.crewMissions?.raidClaims || {}).filter((claim) => claim.raidId === raid.id);
  const completedByPlayer = Boolean(owner && claims.some((claim) => claim.playerId === owner));
  const createdByCurrentPlayer = Boolean(owner && raid.createdByPlayerId === owner);
  const status = crewRaidStatus(raid, nowMs, claims.length);
  return {
    id: raid.id,
    kind: raid.kind || 'AXO_OWNED',
    title: raid.title,
    mission: raid.mission,
    targetUrl: raid.targetUrl,
    targetPostId: raid.targetPostId,
    startsAt: raid.startsAt,
    endsAt: raid.endsAt,
    status,
    accepting: ['ACTIVE', 'CLEARED'].includes(status),
    goal: Number(raid.goal),
    completed: claims.length,
    remaining: Math.max(0, Number(raid.goal) - claims.length),
    reward: {
      xp: Number(raid.rewardXp),
      class: 'SOCIAL_PROVISIONAL',
      cooperativeItem: raid.cooperativeItem,
    },
    creator: {
      petName: safeText(raid.creatorPet?.name || (raid.kind === 'COMMUNITY' ? 'AXO holder' : 'AXO'), 80),
      rewardXp: Number(raid.creatorRewardXp || 0),
      rewardMinimumCompletions: Number(raid.creatorRewardMinimumCompletions || 0),
      rewardStatus: raid.creatorRewardStatus || 'NOT_APPLICABLE',
      createdByCurrentPlayer,
    },
    publication: {
      status: raid.publication?.status || (raid.kind === 'COMMUNITY' ? 'PENDING' : 'OPERATOR'),
      messageId: Number(raid.publication?.messageId || 0) || null,
      url: raid.publication?.url || null,
      publishedAt: raid.publication?.publishedAt || null,
    },
    completedByPlayer,
    completedAt: completedByPlayer ? claims.find((claim) => claim.playerId === owner)?.claimedAt || null : null,
    policy: {
      axoHolderRequired: true,
      verifiedTelegramRequired: true,
      verifiedXRequiredForCreation: raid.kind === 'COMMUNITY',
      contributionType: 'ORIGINAL_TELEGRAM_RESEARCH',
      xEngagementOptional: true,
      xEngagementTracked: false,
      xEngagementRewarded: false,
      affectsContributorTrust: false,
      affectsProductionRanking: false,
    },
  };
}

function createHatcheryEngine({ stateFile, databaseFile = null, radarFile, alphaFile = null, narrativeFile = null, marketDatabaseFile = null, protocolConfig = {}, participationIdentityRequired = false, socialRewardMissionsActive = false, socialCreatorMissionsActive = false, now = () => Date.now(), adminWallets = [], moderatorWallets = [], inspectEvidence = async ({ type }) => ({ contract: { status: type === 'contract_scout' ? 'DEPLOYED_CONTRACT' : 'NOT_REQUIRED', rewardEligible: true, proofStrength: 'ENGINE_TEST_PINNED' }, identity: { activityVerified: true, rewardActivityVerified: true, activityScore: 20, source: 'ENGINE_DEFAULT' }, projectSafety: type === 'contract_scout' ? { status: 'ANALYTICS_AVAILABLE', eligible: true, corroborationEligible: true, analyticsAvailable: true, qualityGatePassed: true, score: 60, posture: 'NAVIGABLE_WITH_CAUTION', criticalFlags: [], cautionFlags: [], checkedAt: new Date().toISOString(), sourceStatus: 'TEST_DEFAULT', name: null, symbol: null, liquidityUsd: 0 } : null }) }) {
  const feedingInFlight = new Set();
  const projectContributionQueues = new Map();
  const projectQueueDepth = new Map();
  const projectQueueTicket = Symbol('projectContributionQueueTicket');
  function enqueueProjectContribution(owner, operation) {
    const depth = Number(projectQueueDepth.get(owner) || 0);
    if (depth >= 32) throw new Error('feeding_cooldown_active');
    projectQueueDepth.set(owner, depth + 1);
    const previous = projectContributionQueues.get(owner) || Promise.resolve();
    const result = previous.catch(() => null).then(operation);
    const tail = result.catch(() => null);
    projectContributionQueues.set(owner, tail);
    return result.finally(() => {
      const remaining = Number(projectQueueDepth.get(owner) || 1) - 1;
      if (remaining > 0) projectQueueDepth.set(owner, remaining);
      else projectQueueDepth.delete(owner);
      if (projectContributionQueues.get(owner) === tail) projectContributionQueues.delete(owner);
    });
  }
  const canonicalAxoAddress = normalizeAddress(protocolConfig.canonicalAxoAddress);
  const retiredAxoAddresses = new Set((protocolConfig.retiredAxoAddresses || []).map(normalizeAddress).filter(Boolean));
  const referralPurchaseConfig = protocolConfig.referralPurchase || {};
  const configuredReferralRewardAmountRaw = /^\d+$/.test(String(referralPurchaseConfig.rewardAmountRaw || ''))
    ? String(referralPurchaseConfig.rewardAmountRaw)
    : REFERRAL_REWARD_AMOUNT_RAW;
  const referralPurchaseToken = normalizeAddress(referralPurchaseConfig.tokenAddress);
  const referralPurchasePoolId = /^0x[0-9a-f]{64}$/i.test(String(referralPurchaseConfig.poolId || ''))
    ? String(referralPurchaseConfig.poolId).toLowerCase()
    : null;
  const referralPurchaseRouter = normalizeAddress(referralPurchaseConfig.routerAddress);
  const referralPurchaseConfigured = Boolean(
    referralPurchaseConfig.status === 'CONFIGURED'
    && canonicalAxoAddress === CANONICAL_AXO_TOKEN
    && referralPurchaseToken === canonicalAxoAddress
    && referralPurchasePoolId
    && referralPurchaseRouter
    && !retiredAxoAddresses.has(referralPurchaseToken),
  );
  const configuredAdmins = new Set(adminWallets.map(normalizeAddress).filter(Boolean));
  const configuredModerators = new Set(moderatorWallets.map(normalizeAddress).filter(Boolean));
  const repository = createHatcheryStateRepository({ databaseFile, stateFile, defaultState, migrateState, now });
  function readState() { return repository.read(); }
  function saveState(state, options) { state.schemaVersion = SCHEMA_VERSION; repository.write(state, options); }
  function staffRoleInState(state, address) {
    const owner = normalizeAddress(address); if (!owner) return 'USER';
    if (configuredAdmins.has(owner)) return 'OWNER';
    if (state.staff?.admins?.includes(owner)) return 'ADMIN';
    if (configuredModerators.has(owner) || state.staff?.moderators?.includes(owner)) return 'MODERATOR';
    return 'USER';
  }
  function adminRole(role) { return role === 'OWNER' || role === 'ADMIN'; }
  function requireStaff(state, address, adminOnly = false) {
    const owner = requireAddress(address); const role = staffRoleInState(state, owner);
    if (role === 'USER' || (adminOnly && !adminRole(role))) throw new Error(adminOnly ? 'hatchery_admin_required' : 'hatchery_staff_required');
    return { owner, role };
  }
  function requireAddress(value) { const address = normalizeAddress(value); if (!address) throw new Error('wallet_session_required'); return address; }
  function requirePlayer(address) { const owner = requireAddress(address); const state = readState(); const player = state.players[owner]; if (!player) throw new Error('pet_not_hatched'); applyDecay(player, now()); return { owner, state, player }; }
  function requireGameplayAccess(player) {
    if (player?.moderation?.status === 'SUSPENDED') throw new Error('hatchery_account_suspended');
    return player;
  }
  function requireXpParticipation(player) {
    requireGameplayAccess(player);
    const gate = participationGateView(player, now());
    if (participationIdentityRequired && !gate.complete) throw new Error('hatchery_crew_passport_required');
    return gate;
  }
  function crewProjectViews(state, ownerAddress = null, nowMs = now()) {
    return projectQuestViews(state, ownerAddress, nowMs, { pinnedAddress: canonicalAxoAddress })
      .filter((project) => !retiredAxoAddresses.has(normalizeAddress(project.address)));
  }
  function hasCanonicalAxoCorroboration(state, ownerAddress) {
    if (!canonicalAxoAddress) return true;
    const owner = normalizeAddress(ownerAddress);
    return Boolean(owner && (state.contributions || []).some((item) => item.playerId === owner
      && item.type === 'contract_scout'
      && (item.entityKey || entityKey(item.entity)) === canonicalAxoAddress));
  }
  function canonicalAxoQuestAccessMigration(state, ownerAddress) {
    const owner = normalizeAddress(ownerAddress);
    const player = owner ? state.players?.[owner] : null;
    const migration = player?.onboarding?.canonicalAxoQuestAccess;
    if (!owner || !migration || migration.status !== 'MIGRATED' || Number(migration.version) !== 1) return null;
    const sourceAddress = normalizeAddress(migration.sourceAddress);
    const targetAddress = normalizeAddress(migration.targetAddress);
    if (!sourceAddress || !retiredAxoAddresses.has(sourceAddress) || targetAddress !== canonicalAxoAddress) return null;
    const source = (state.contributions || []).find((item) => item.id === migration.sourceContributionId
      && item.playerId === owner
      && item.type === 'contract_scout'
      && (item.entityKey || entityKey(item.entity)) === sourceAddress);
    if (!source) return null;
    const expectedEvidenceHash = `0x${crypto.createHash('sha256').update(JSON.stringify({
      schema: 'AXO_CANONICAL_QUEST_ACCESS_MIGRATION_V1',
      owner,
      sourceContributionId: source.id,
      sourceAddress,
      targetAddress,
      sourceCreatedAt: source.createdAt,
    })).digest('hex')}`;
    if (migration.evidenceHash !== expectedEvidenceHash) return null;
    return migration;
  }
  function hasCanonicalAxoQuestAccess(state, ownerAddress) {
    if (!canonicalAxoAddress) return true;
    return hasCanonicalAxoCorroboration(state, ownerAddress)
      || Boolean(canonicalAxoQuestAccessMigration(state, ownerAddress));
  }
  function canonicalAxoCorroborationView(state, ownerAddress, currentMs = now()) {
    if (!canonicalAxoAddress) return { required: false, complete: true, currentComplete: true, questAccessComplete: true, migrated: false, address: null, available: false, project: null, migration: null };
    const project = crewProjectViews(state, ownerAddress, currentMs).find((item) => item.address === canonicalAxoAddress) || null;
    const currentComplete = hasCanonicalAxoCorroboration(state, ownerAddress);
    const migration = canonicalAxoQuestAccessMigration(state, ownerAddress);
    return {
      required: true,
      complete: currentComplete,
      currentComplete,
      questAccessComplete: currentComplete || Boolean(migration),
      migrated: Boolean(migration),
      address: canonicalAxoAddress,
      available: project ? project.accepting === true : true,
      project: project ? {
        id: project.id,
        symbol: project.symbol,
        status: project.status,
        feedCount: project.feedCount,
        pinned: true,
        userJudgment: project.userJudgment,
      } : null,
      migration: migration ? {
        status: migration.status,
        migratedAt: migration.migratedAt,
        source: 'PRESERVED_VERIFIED_HISTORICAL_AXO_RECEIPT',
        xpAwarded: 0,
        currentCorroborationCreated: false,
      } : null,
      policy: {
        dailyQuestAccess: currentComplete || migration ? 'UNLOCKED' : 'CURRENT_AXO_CORROBORATION_REQUIRED',
        currentAxoCorroborationRequiredForReferralActivation: true,
        migratedAccessCreatesCurrentJudgment: false,
        migratedAccessAwardsXp: false,
      },
      note: migration
        ? 'A verified historical AXO onboarding receipt preserves daily quest access. A separate current-AXO call is still required for referral activation.'
        : 'One wallet may support the canonical AXO contract once. This onboarding receipt does not override contract safety or paper-entry gates.',
    };
  }
  function requireCanonicalAxoCorroboration(state, player) {
    if (!hasCanonicalAxoCorroboration(state, player?.ownerAddress)) throw new Error('canonical_axo_corroboration_required');
  }
  function requireCanonicalAxoQuestAccess(state, player) {
    if (!hasCanonicalAxoQuestAccess(state, player?.ownerAddress)) throw new Error('canonical_axo_corroboration_required');
  }
  function reconcileCanonicalAxoQuestAccess({ apply = false, limit = 2_000 } = {}) {
    const state = readState();
    if (!canonicalAxoAddress || retiredAxoAddresses.size === 0) return {
      status: 'CANONICAL_AXO_MIGRATION_NOT_CONFIGURED',
      apply: apply === true,
      checked: 0,
      eligible: 0,
      migrated: 0,
      alreadyCurrent: 0,
      alreadyMigrated: 0,
      xpAwarded: 0,
      currentContributionsCreated: 0,
    };
    const maximum = Math.max(1, Math.min(10_000, Number(limit) || 2_000));
    const candidates = [];
    let checked = 0;
    let alreadyCurrent = 0;
    let alreadyMigrated = 0;
    const migratedAt = new Date(now()).toISOString();
    for (const player of Object.values(state.players || {})) {
      if (checked >= maximum) break;
      checked += 1;
      if (hasCanonicalAxoCorroboration(state, player.ownerAddress)) {
        alreadyCurrent += 1;
        continue;
      }
      if (canonicalAxoQuestAccessMigration(state, player.ownerAddress)) {
        alreadyMigrated += 1;
        continue;
      }
      const source = (state.contributions || [])
        .filter((item) => item.playerId === player.ownerAddress
          && item.type === 'contract_scout'
          && retiredAxoAddresses.has(item.entityKey || entityKey(item.entity)))
        .sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0))[0];
      if (!source) continue;
      const sourceAddress = source.entityKey || entityKey(source.entity);
      const evidenceHash = `0x${crypto.createHash('sha256').update(JSON.stringify({
        schema: 'AXO_CANONICAL_QUEST_ACCESS_MIGRATION_V1',
        owner: player.ownerAddress,
        sourceContributionId: source.id,
        sourceAddress,
        targetAddress: canonicalAxoAddress,
        sourceCreatedAt: source.createdAt,
      })).digest('hex')}`;
      const migration = {
        status: 'MIGRATED',
        version: 1,
        migrationId: `0x${crypto.createHash('sha256').update(`canonical-axo-quest-access:${player.ownerAddress}:${source.id}:${canonicalAxoAddress}`).digest('hex')}`,
        sourceContributionId: source.id,
        sourceAddress,
        sourceCreatedAt: source.createdAt,
        targetAddress: canonicalAxoAddress,
        evidenceHash,
        migratedAt,
        questAccess: true,
        currentCorroborationCreated: false,
        currentCorroborationRequiredForReferralActivation: true,
        xpAwarded: 0,
      };
      candidates.push({ player, migration });
    }
    if (apply === true && candidates.length > 0) {
      for (const { player, migration } of candidates) {
        player.onboarding ||= {};
        player.onboarding.canonicalAxoQuestAccess = migration;
        player.updatedAt = migratedAt;
        recordEvent(state, 'CANONICAL_AXO_QUEST_ACCESS_MIGRATED', player.id, {
          migrationId: migration.migrationId,
          sourceContributionId: migration.sourceContributionId,
          sourceAddress: migration.sourceAddress,
          targetAddress: migration.targetAddress,
          evidenceHash: migration.evidenceHash,
          questAccess: true,
          currentCorroborationCreated: false,
          currentCorroborationRequiredForReferralActivation: true,
          xpAwarded: 0,
          petXpChanged: false,
          epochXpChanged: false,
        }, migratedAt);
      }
      saveState(state);
    }
    return {
      status: apply === true ? 'APPLIED' : 'PREVIEW',
      apply: apply === true,
      checked,
      eligible: candidates.length,
      migrated: apply === true ? candidates.length : 0,
      alreadyCurrent,
      alreadyMigrated,
      xpAwarded: 0,
      currentContributionsCreated: 0,
      evidenceHashes: candidates.map(({ migration }) => migration.evidenceHash),
    };
  }
  function rewardHoldingView(player, epochId = epochWindow(now()).id) {
    const policy = protocolConfig.rewardHolding || {};
    const configured = policy.status === 'CONFIGURED'
      && normalizeAddress(policy.tokenAddress)
      && Number.isInteger(policy.tokenDecimals);
    const snapshot = player?.rewardHolding?.epochs?.[epochId] || null;
    if (!configured) return {
      active: false,
      status: policy.status || 'REPLACEMENT_TOKEN_NOT_CONFIGURED',
      epochId,
      balance: null,
      multiplierBps: null,
      multiplierPct: null,
      floorPct: HOLDING_REWARD_FLOOR_BPS / 100,
      fullRewardTokens: HOLDING_REWARD_FULL_TOKENS,
      affectsXpOrRank: false,
    };
    const valid = snapshot
      && normalizeAddress(snapshot.tokenAddress) === normalizeAddress(policy.tokenAddress)
      && Number(snapshot.tokenDecimals) === Number(policy.tokenDecimals)
      && /^\d+$/.test(String(snapshot.balanceRaw || ''))
      && /^0x[0-9a-f]{64}$/i.test(String(snapshot.blockHash || ''));
    const multiplierBps = valid
      ? holdingRewardMultiplierBps(snapshot.balanceRaw, snapshot.tokenDecimals)
      : null;
    return {
      active: true,
      status: valid ? (snapshot.frozen === true ? 'FROZEN_VERIFIED' : 'VERIFIED_PREVIEW') : 'BALANCE_EVIDENCE_REQUIRED',
      epochId,
      tokenAddress: policy.tokenAddress,
      tokenDecimals: policy.tokenDecimals,
      balance: valid ? snapshot.balanceFormatted : null,
      balanceRaw: valid ? snapshot.balanceRaw : null,
      multiplierBps,
      multiplierPct: multiplierBps === null ? null : multiplierBps / 100,
      zeroHoldingPct: 0,
      floorPct: HOLDING_REWARD_FLOOR_BPS / 100,
      fullRewardTokens: HOLDING_REWARD_FULL_TOKENS,
      blockNumber: valid ? snapshot.blockNumber : null,
      blockHash: valid ? snapshot.blockHash : null,
      checkedAt: valid ? snapshot.checkedAt : null,
      frozen: valid && snapshot.frozen === true,
      affectsXpOrRank: false,
    };
  }
  function recordRewardHolding(address, receipt = {}) {
    const { state, player } = requirePlayer(address);
    const policy = protocolConfig.rewardHolding || {};
    if (policy.status !== 'CONFIGURED' || !normalizeAddress(policy.tokenAddress) || !Number.isInteger(policy.tokenDecimals)) return rewardHoldingView(player);
    const tokenAddress = normalizeAddress(receipt.tokenAddress);
    if (tokenAddress !== normalizeAddress(policy.tokenAddress)) throw new Error('reward_holding_token_mismatch');
    if (tokenAddress === '0x348b31199980bed4af22453167aebf5d770072e0') throw new Error('retired_axo_reward_holding_token_forbidden');
    if (Number(receipt.tokenDecimals) !== Number(policy.tokenDecimals)) throw new Error('reward_holding_decimals_mismatch');
    if (!/^\d+$/.test(String(receipt.balanceRaw || ''))) throw new Error('reward_holding_balance_invalid');
    if (!Number.isSafeInteger(Number(receipt.blockNumber)) || Number(receipt.blockNumber) < 1) throw new Error('reward_holding_block_invalid');
    if (!/^0x[0-9a-f]{64}$/i.test(String(receipt.blockHash || ''))) throw new Error('reward_holding_block_hash_invalid');
    const epochId = String(receipt.epochId || epochWindow(now()).id);
    if (epochId !== epochWindow(now()).id) throw new Error('reward_holding_epoch_invalid');
    const checkedAt = receipt.checkedAt || new Date(now()).toISOString();
    const snapshot = {
      epochId,
      tokenAddress,
      tokenDecimals: Number(receipt.tokenDecimals),
      balanceRaw: String(receipt.balanceRaw),
      balanceFormatted: safeText(receipt.balanceFormatted, 80),
      blockNumber: Number(receipt.blockNumber),
      blockHash: String(receipt.blockHash).toLowerCase(),
      checkedAt,
      source: 'ROBINHOOD_CHAIN_PINNED_ETH_CALL',
      frozen: receipt.frozen === true,
    };
    player.rewardHolding ||= { latest: null, epochs: {} };
    player.rewardHolding.epochs ||= {};
    player.rewardHolding.epochs[epochId] = snapshot;
    player.rewardHolding.latest = snapshot;
    player.updatedAt = checkedAt;
    recordEvent(state, 'REWARD_HOLDING_SNAPSHOT_RECORDED', player.id, {
      epochId,
      tokenAddress,
      blockNumber: snapshot.blockNumber,
      multiplierBps: holdingRewardMultiplierBps(snapshot.balanceRaw, snapshot.tokenDecimals),
      frozen: snapshot.frozen,
      affectsXpOrRank: false,
    }, checkedAt);
    saveState(state);
    return rewardHoldingView(player, epochId);
  }
  function walletProjectPreferenceHolder(state, owner, player = state.players[owner] || null) {
    state.walletPreferences ||= {};
    const stored = state.walletPreferences[owner];
    const fallback = player?.missionControl || {};
    return {
      missionControl: {
        ...fallback,
        favorites: Array.isArray(stored?.favorites) ? stored.favorites : (fallback.favorites || []),
        recentProjects: Array.isArray(stored?.recentProjects) ? stored.recentProjects : (fallback.recentProjects || []),
      },
    };
  }
  function persistWalletProjectPreferences(state, owner, preferenceHolder, player = state.players[owner] || null, updatedAt = new Date(now()).toISOString()) {
    const favorites = (preferenceHolder.missionControl?.favorites || []).slice(0, MISSION_CONTROL_FAVORITES_MAX);
    const recentProjects = (preferenceHolder.missionControl?.recentProjects || []).slice(0, MISSION_CONTROL_RECENT_MAX);
    state.walletPreferences ||= {};
    state.walletPreferences[owner] = { favorites, recentProjects, updatedAt };
    if (player) {
      player.missionControl ||= {};
      player.missionControl.favorites = favorites;
      player.missionControl.recentProjects = recentProjects;
      player.updatedAt = updatedAt;
    }
  }
  function snapshot(address) {
    const owner = requireAddress(address); const state = readState(); const player = state.players[owner];
    if (!player) return { hatched: false, wallet: { address: owner, verified: true }, hatchPreview: { level: 1, stage: LEVELS[0].name, skillPoints: 1, maxLevel: MAX_LEVEL, speechUnlockLevel: 10, lineageCount: LINEAGES.length, lineageAssignment: 'DETERMINISTIC_WALLET_SEED' }, skillTree: { routes: ROUTES, nodes: Object.entries(SKILL_TREE).map(([id, node]) => ({ id, ...node })) }, policies: { walletBound: true, communityInput: 'PRIORITY_SIGNAL_ONLY', machineSafetyOverride: false, contributorTrustTransferable: false } };
    const radar = readJson(radarFile, {}); const completedToday = new Set(state.contributions.filter((item) => item.playerId === owner && item.day === isoDay(now())).map((item) => item.taskId));
    return {
      hatched: true,
      ...publicPlayer(player, state.contributions, now(), radar, { passportRequired: participationIdentityRequired, socialRewardMissionsActive }),
      rewardHolding: rewardHoldingView(player),
      ledger: playerLedgerView(state, player, { nowMs: now() }),
      dailyContractQuest: dailyContractQuestView(state, player, now(), { onboardingAddress: canonicalAxoAddress }),
      crewMilestones: crewMilestonesView(state, player, now()),
      socialCreatorMissions: dailySocialCreatorMissionsView(player, now(), { active: socialCreatorMissionsActive }),
      canonicalAxoCorroboration: canonicalAxoCorroborationView(state, owner, now()),
      tasks: personalizedTasks(player, radar, now()).map((task) => ({ ...task, completed: completedToday.has(task.id) })),
      projectQuests: crewProjectViews(state, owner, now()),
      crossChainNominations: (state.crossChainNominations || []).filter((item) => item.ownerAddress === owner).slice(-25).reverse().map(({ ownerAddress, ...item }) => item),
      communityScams: Object.values(state.communityScamRegistry || {}).sort((a, b) => String(b.flaggedAt || '').localeCompare(String(a.flaggedAt || ''))).slice(0, 50),
      crewExpedition: buildCrewExpedition(radar, state.contributions, now()),
      intelBrief: intelBrief(player, state.contributions),
      community: communityReadiness(state),
      calibration: calibrationView(state, player, now()),
      policies: {
        walletBound: true,
        crewPassportRequiredForXp: participationIdentityRequired,
        canonicalAxoCorroborationRequired: Boolean(canonicalAxoAddress),
        canonicalAxoQuestAccessMigration: 'VERIFIED_HISTORICAL_RECEIPT_OR_CURRENT_CORROBORATION',
        currentAxoCorroborationRequiredForReferralActivation: Boolean(canonicalAxoAddress),
        canonicalAxoAddress,
        socialQuestMode: 'EXACT_CONNECTED_ACCOUNT_POST_LINK',
        socialQuestPetXpOnly: true,
        externalSocialActionsRewarded: false,
        contractDiscoveryXp: CONTRACT_DISCOVERY_XP,
        contractDiscoveryCorroboratedXp: CONTRACT_DISCOVERY_CORROBORATED_XP,
        contractJudgmentXp: CONTRACT_JUDGMENT_XP,
        contractJudgmentCorroboratedXp: CONTRACT_JUDGMENT_CORROBORATED_XP,
        projectScamQuorum: PROJECT_SCAM_QUORUM,
        communityScamClassification: 'COMMUNITY_SCAM_CONSENSUS_NOT_INDEPENDENT_SECURITY_AUDIT',
        communityInput: 'PRIORITY_SIGNAL_ONLY',
        machineSafetyOverride: false,
        projectQuestSafetyGate: 'SAFE_PASSAGE_SCREENED_NOT_ENDORSED',
        projectHeatIsSafety: false,
        nftReady: true,
        contributorTrustTransferable: false,
        minimumConsensus: CONSENSUS_MINIMUM,
        minimumDiverseWallets: CONSENSUS_DIVERSITY_MINIMUM,
      },
    };
  }
  function hatch(address, name) {
    const owner = requireAddress(address); const state = readState(); if (state.players[owner]) throw new Error('pet_already_hatched');
    if (state.soulboundPetTombstones?.[owner]) throw new Error('soulbound_pet_wallet_already_bound');
    const cleanName = safeText(name || 'Little AXO', 20); if (cleanName.length < 2) throw new Error('pet_name_too_short');
    const nowIso = new Date(now()).toISOString(); state.players[owner] = defaultPlayer(owner, nowIso, cleanName);
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const pendingReferral = pendingReferralPlayer(state, owner);
    if (pendingReferral) {
      const pendingIdentities = pendingReferral.onboarding.pendingSocialIdentities || {};
      state.players[owner].social.identities = {
        x: pendingIdentities.x ? { ...pendingIdentities.x } : null,
        telegram: pendingIdentities.telegram ? { ...pendingIdentities.telegram } : null,
      };
      if (pendingReferral.onboarding.pendingTelegramMembership) {
        state.players[owner].social.telegramMembership = { ...pendingReferral.onboarding.pendingTelegramMembership };
      }
      pendingReferral.onboarding.petHatchedAt = nowIso;
      pendingReferral.onboarding.pendingSocialIdentities = { x: null, telegram: null };
      pendingReferral.onboarding.pendingTelegramMembership = null;
      appendReferralOnboardingEvent(state, pendingReferral.start, 'PET_HATCHED', nowIso);
    }
    const storedPreferences = state.walletPreferences?.[owner];
    if (storedPreferences) {
      state.players[owner].missionControl.favorites = storedPreferences.favorites || [];
      state.players[owner].missionControl.recentProjects = storedPreferences.recentProjects || [];
    }
    const genesisId = state.players[owner].pet.genesisId; recordEvent(state, 'PET_HATCHED', owner, { genesisId, lineageId: state.players[owner].pet.lineageId }, nowIso);
    maybeRecordCommunityReferralOnboarding(state, owner);
    maybeCreateReferralRewardSetup(state, owner);
    const evidenceHash = `0x${crypto.createHash('sha256').update(JSON.stringify({ type: 'PET_HATCHED', owner, genesisId, at: nowIso })).digest('hex')}`;
    saveState(state, { protocolActions: [petBindAction({ wallet: owner, genesisId, evidenceHash })] }); return snapshot(owner);
  }
  function replacementPreview(address, name) {
    const { owner, player } = requirePlayer(address); const cleanName = safeText(name || 'Little AXO', 20);
    if (cleanName.length < 2) throw new Error('pet_name_too_short');
    return {
      ownerAddress: owner,
      current: { genesisId: player.pet.genesisId, name: player.pet.name, level: currentLevel(player.pet.xp), lineage: lineageDefinition(player.pet.lineageId).label },
      replacement: { name: cleanName },
      destructive: true,
    };
  }
  function replacePet(address, { expectedGenesisId, name } = {}) {
    const owner = requireAddress(address); const state = readState(); const previous = state.players[owner];
    if (!previous) throw new Error('pet_not_hatched');
    requireGameplayAccess(previous);
    if (previous.pet.nft?.status === 'MINTED_SOULBOUND') throw new Error('soulbound_pet_replacement_disabled');
    if (!expectedGenesisId || previous.pet.genesisId !== expectedGenesisId) throw new Error('pet_replacement_stale');
    const cleanName = safeText(name || 'Little AXO', 20); if (cleanName.length < 2) throw new Error('pet_name_too_short');
    const nowIso = new Date(now()).toISOString();
    const excludedOpenRewardEntries = excludeOpenPetRewards(state, { petGenesisId: previous.pet.genesisId, displayEpochId: epochWindow(now()).id });
    let cancelledPendingXp = 0;
    for (const contribution of state.contributions.filter((item) => item.playerId === owner && !item.outcomeSettledAt)) {
      contribution.petRewardEligible = false;
      contribution.petRewardClosedAt = nowIso;
      if (Number(contribution.xp?.pending || 0) <= 0) continue;
      cancelledPendingXp += Number(contribution.xp.pending || 0);
      contribution.xp = { ...contribution.xp, pending: 0, settled: true, settledAt: nowIso, settlement: 'PET_REPLACED_PENDING_XP_CANCELLED' };
    }
    const replacement = defaultPlayer(owner, nowIso, cleanName);
    replacement.createdAt = previous.createdAt || nowIso;
    replacement.reputation = normalizeReputation(previous.reputation);
    replacement.identity = { ...replacement.identity, ...(previous.identity || {}) };
    replacement.moderation = {
      ...replacement.moderation,
      ...(previous.moderation || {}),
      alphaMining: { ...replacement.moderation.alphaMining, ...(previous.moderation?.alphaMining || {}) },
    };
    replacement.social.identities = { ...replacement.social.identities, ...(previous.social?.identities || {}) };
    replacement.crew = {
      ...replacement.crew,
      referralCode: previous.crew?.referralCode || null,
      activatedReferrals: Number(previous.crew?.activatedReferrals || 0),
    };
    replacement.missionControl = { ...replacement.missionControl, ...(previous.missionControl || {}), watchlist: previous.missionControl?.watchlist || [], dailyClaims: previous.missionControl?.dailyClaims || {}, projectReactions: previous.missionControl?.projectReactions || {} };
    replacement.replacementCount = Number(previous.replacementCount || 0) + 1;
    state.players[owner] = replacement;
    recordEvent(state, 'PET_DELETED_AND_REPLACED', owner, {
      deletedGenesisId: previous.pet.genesisId,
      newGenesisId: replacement.pet.genesisId,
      replacementCount: replacement.replacementCount,
      cancelledPendingXp,
      excludedOpenRewardEntries,
      humanReputationPreserved: true,
    }, nowIso);
    const replacementEvidenceHash = `0x${crypto.createHash('sha256').update(JSON.stringify({ type: 'PET_REPLACED', owner, oldGenesisId: previous.pet.genesisId, newGenesisId: replacement.pet.genesisId, at: nowIso })).digest('hex')}`;
    saveState(state, { protocolActions: [petReplaceAction({ wallet: owner, oldGenesisId: previous.pet.genesisId, newGenesisId: replacement.pet.genesisId, evidenceHash: replacementEvidenceHash })] });
    return { ...snapshot(owner), result: { deletedGenesisId: previous.pet.genesisId, newGenesisId: replacement.pet.genesisId, cancelledPendingXp, excludedOpenRewardEntries, humanReputationPreserved: true } };
  }
  function rename(address, name) {
    const { state, player } = requirePlayer(address); const cleanName = safeText(name, 20); if (cleanName.length < 2) throw new Error('pet_name_too_short');
    requireGameplayAccess(player);
    const nowIso = new Date(now()).toISOString(); player.pet.name = cleanName; player.updatedAt = nowIso; player.pet.lastReply = currentLevel(player.pet.xp) >= 10 ? matureReply('rename', cleanName) : companionReply('rename'); recordEvent(state, 'PET_RENAMED', player.id, {}, nowIso); saveState(state); return snapshot(player.ownerAddress);
  }
  function linkVerifiedSocialIdentity(address, platform, identity = {}) {
    const owner = requireAddress(address); const state = readState(); state.crewMissions = normalizeCrewMissions(state.crewMissions); const player = state.players[owner] || null;
    const pending = player ? null : pendingReferralPlayer(state, owner);
    if (!player && !pending) throw new Error('pet_not_hatched');
    const cleanPlatform = safeText(platform, 20).toLowerCase(); if (!['x', 'telegram'].includes(cleanPlatform)) throw new Error('social_identity_platform_invalid');
    const rawHandle = safeText(identity.handle, 120); const handle = rawHandle ? normalizeSocialHandle(rawHandle, cleanPlatform) : null; const providerUserId = safeText(identity.providerUserId, 80);
    const verifiedAtMs = Date.parse(identity.verifiedAt || ''); const currentMs = now();
    if ((cleanPlatform === 'x' && !handle) || (rawHandle && !handle) || !/^\d{1,24}$/.test(providerUserId) || identity.verification !== 'PLATFORM_VERIFIED') throw new Error('platform_identity_invalid');
    if (!Number.isFinite(verifiedAtMs) || verifiedAtMs > currentMs + PLATFORM_IDENTITY_MAX_FUTURE_SKEW_MS || currentMs - verifiedAtMs > PLATFORM_IDENTITY_MAX_AGE_MS) throw new Error('platform_identity_proof_stale');
    const identityHolder = player || pending.player;
    const currentIdentity = identityHolder.social?.identities?.[cleanPlatform] || null;
    if (currentIdentity?.verification === 'PLATFORM_VERIFIED') {
      const sameConnection = currentIdentity.providerUserId === providerUserId;
      throw new Error(sameConnection
        ? `${cleanPlatform}_identity_already_connected_to_this_wallet`
        : `${cleanPlatform}_identity_change_requires_disconnect`);
    }
    for (const candidate of Object.values(state.players)) {
      if (candidate.id === owner) continue;
      const record = candidate.social?.identities?.[cleanPlatform];
      if ((handle && record?.handle === handle) || record?.providerUserId === providerUserId) throw new Error(`${cleanPlatform}_identity_already_linked`);
    }
    for (const start of Object.values(state.crewMissions.webReferralStarts || {})) {
      const candidateOwner = normalizeAddress(start?.claimantWallet || start?.claimantPlayerId);
      if (!candidateOwner || candidateOwner === owner || Date.parse(start.expiresAt || 0) <= currentMs) continue;
      const receipt = ensureReferralPathReceipt(state, start);
      const record = receipt?.onboarding?.pendingSocialIdentities?.[cleanPlatform];
      if ((handle && record?.handle === handle) || record?.providerUserId === providerUserId) throw new Error(`${cleanPlatform}_identity_already_linked`);
    }
    const linkedAt = new Date(currentMs).toISOString();
    const verifiedIdentityRecord = { handle, providerUserId, displayName: safeText(identity.displayName, 80) || null, avatarUrl: normalizeSocialAvatarUrl(identity.avatarUrl), accountCreatedAt: identity.accountCreatedAt || null, providerVerified: identity.providerVerified === true, linkedAt, verifiedAt: linkedAt, verification: 'PLATFORM_VERIFIED' };
    if (player) {
      player.social ||= {}; player.social.identities ||= { x: null, telegram: null };
      player.social.identities[cleanPlatform] = verifiedIdentityRecord;
      if (cleanPlatform === 'telegram') {
        player.social.telegramMembership = { status: 'UNVERIFIED', isMember: false, providerUserId: null, chatId: null, telegramStatus: null, checkedAt: null, validUntil: null, verification: null };
      }
      player.updatedAt = linkedAt;
    } else {
      pending.onboarding.pendingSocialIdentities[cleanPlatform] = verifiedIdentityRecord;
      if (cleanPlatform === 'telegram') pending.onboarding.pendingTelegramMembership = null;
    }
    const referralStart = activeWebReferralStart(state, owner);
    if (referralStart) {
      const eventType = cleanPlatform === 'telegram' ? 'TELEGRAM_CONNECTED' : 'X_CONNECTED';
      const event = appendReferralOnboardingEvent(state, referralStart, eventType, linkedAt);
      if (event) event.onboarding[cleanPlatform === 'telegram' ? 'telegramConnectedAt' : 'xConnectedAt'] = linkedAt;
    }
    recordEvent(state, 'SOCIAL_IDENTITY_PLATFORM_VERIFIED', owner, { platform: cleanPlatform, handle, providerUserIdHash: crypto.createHash('sha256').update(providerUserId).digest('hex'), verification: 'PLATFORM_VERIFIED' }, linkedAt);
    if (player) {
      maybeRecordCommunityReferralOnboarding(state, owner);
      maybeCreateReferralRewardSetup(state, owner);
    }
    saveState(state);
    return player
      ? { ...snapshot(owner), result: { platform: cleanPlatform, identity: publicSocialIdentities(player)[cleanPlatform], verification: 'PLATFORM_VERIFIED' } }
      : { hatched: false, wallet: { address: owner, verified: true }, result: { platform: cleanPlatform, identity: { handle, displayName: verifiedIdentityRecord.displayName, avatarUrl: verifiedIdentityRecord.avatarUrl, linkedAt, verification: 'PLATFORM_VERIFIED' }, verification: 'PLATFORM_VERIFIED', pendingPet: true } };
  }
  function recordTelegramMembership(address, receipt = {}) {
    const owner = requireAddress(address);
    const state = readState();
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const player = state.players[owner] || null;
    const pending = player ? null : pendingReferralPlayer(state, owner);
    if (!player && !pending) throw new Error('pet_not_hatched');
    const identityHolder = player || pending.player;
    const recordedAtMs = now();
    const normalized = normalizeTelegramMembershipReceipt(identityHolder, receipt, recordedAtMs);
    const previous = identityHolder.social?.telegramMembership || {};
    const materiallyChanged = previous.status !== normalized.status
      || previous.isMember !== normalized.isMember
      || previous.providerUserId !== normalized.providerUserId
      || previous.chatId !== normalized.chatId
      || previous.telegramStatus !== normalized.telegramStatus
      || previous.verification !== normalized.verification;
    const previousValidUntilMs = Date.parse(previous.validUntil || '');
    const previousSafelyFresh = Number.isFinite(previousValidUntilMs)
      && previousValidUntilMs - recordedAtMs > TELEGRAM_MEMBERSHIP_PERSIST_REFRESH_MS;
    if (!materiallyChanged && previousSafelyFresh) {
      return player
        ? { ...snapshot(player.ownerAddress), result: { telegramMembership: telegramMembershipView(player, recordedAtMs) } }
        : { hatched: false, wallet: { address: owner, verified: true }, result: { telegramMembership: telegramMembershipView(pending.player, recordedAtMs), pendingPet: true } };
    }
    identityHolder.social.telegramMembership = normalized;
    if (player) {
      player.social ||= {};
      player.social.telegramMembership = normalized;
      player.updatedAt = new Date(recordedAtMs).toISOString();
    } else {
      pending.onboarding.pendingTelegramMembership = normalized;
    }
    const referralStart = activeWebReferralStart(state, owner);
    if (referralStart && normalized.isMember) {
      const event = appendReferralOnboardingEvent(state, referralStart, 'TELEGRAM_MEMBERSHIP_VERIFIED', normalized.checkedAt);
      if (event) event.onboarding.telegramMembershipVerifiedAt = normalized.checkedAt;
    }
    if (materiallyChanged) {
      recordEvent(state, normalized.isMember ? 'AXO_TELEGRAM_MEMBERSHIP_VERIFIED' : 'AXO_TELEGRAM_MEMBERSHIP_REVOKED', owner, {
        status: normalized.status,
        telegramStatus: normalized.telegramStatus,
        chatId: normalized.chatId,
        verification: normalized.verification,
        affectsContributorTrust: false,
        affectsProductionRanking: false,
      }, normalized.checkedAt);
    }
    if (player) maybeCreateReferralRewardSetup(state, owner);
    saveState(state);
    return player
      ? { ...snapshot(player.ownerAddress), result: { telegramMembership: telegramMembershipView(player, recordedAtMs) } }
      : { hatched: false, wallet: { address: owner, verified: true }, result: { telegramMembership: telegramMembershipView(pending.player, recordedAtMs), pendingPet: true } };
  }
  function unlinkSocialIdentity(address, platform) {
    const owner = requireAddress(address);
    const state = readState();
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const player = state.players[owner] || null;
    const pending = player ? null : pendingReferralPlayer(state, owner);
    if (!player && !pending) throw new Error('pet_not_hatched');
    const identityHolder = player || pending.player;
    const cleanPlatform = safeText(platform, 20).toLowerCase();
    if (!['x', 'telegram'].includes(cleanPlatform)) throw new Error('social_identity_platform_invalid');
    const previous = identityHolder.social?.identities?.[cleanPlatform] || null;
    if (!previous) return player
      ? { ...snapshot(player.ownerAddress), result: { platform: cleanPlatform, disconnected: false } }
      : { hatched: false, wallet: { address: owner, verified: true }, result: { platform: cleanPlatform, disconnected: false, pendingPet: true } };
    const disconnectedAt = new Date(now()).toISOString();
    identityHolder.social ||= {}; identityHolder.social.identities ||= { x: null, telegram: null }; identityHolder.social.identities[cleanPlatform] = null;
    if (cleanPlatform === 'telegram') identityHolder.social.telegramMembership = { status: 'UNVERIFIED', isMember: false, providerUserId: null, chatId: null, telegramStatus: null, checkedAt: null, validUntil: null, verification: null };
    if (player) {
      player.updatedAt = disconnectedAt;
    } else {
      pending.onboarding.pendingSocialIdentities[cleanPlatform] = null;
      if (cleanPlatform === 'telegram') {
        pending.onboarding.pendingTelegramMembership = null;
        pending.onboarding.telegramMembershipVerifiedAt = null;
        pending.onboarding.telegramConnectedAt = null;
      } else pending.onboarding.xConnectedAt = null;
      appendReferralOnboardingEvent(state, pending.start, `${cleanPlatform.toUpperCase()}_DISCONNECTED`, disconnectedAt);
    }
    recordEvent(state, 'SOCIAL_IDENTITY_DISCONNECTED', owner, { platform: cleanPlatform, previousVerification: previous.verification || 'LEGACY_UNVERIFIED', pendingPet: !player }, disconnectedAt); saveState(state);
    return player
      ? { ...snapshot(player.ownerAddress), result: { platform: cleanPlatform, disconnected: true } }
      : { hatched: false, wallet: { address: owner, verified: true }, result: { platform: cleanPlatform, disconnected: true, pendingPet: true } };
  }
  function verifiedSocialIdentity(address, platform) {
    const owner = requireAddress(address); const state = readState(); state.crewMissions = normalizeCrewMissions(state.crewMissions); const cleanPlatform = safeText(platform, 20).toLowerCase();
    const holder = state.players[owner] || pendingReferralPlayer(state, owner)?.player;
    if (!holder) return null;
    const identity = holder.social?.identities?.[cleanPlatform];
    if (!identity || identity.verification !== 'PLATFORM_VERIFIED') return null;
    return { platform: cleanPlatform, handle: identity.handle, providerUserId: identity.providerUserId, displayName: identity.displayName || null, verifiedAt: identity.verifiedAt, verification: 'PLATFORM_VERIFIED' };
  }
  function ownerForVerifiedSocialIdentity(platform, providerUserId) {
    const cleanPlatform = safeText(platform, 20).toLowerCase();
    const cleanProviderUserId = safeText(providerUserId, 80);
    if (!['x', 'telegram'].includes(cleanPlatform) || !/^\d{1,24}$/.test(cleanProviderUserId)) return null;
    const state = readState();
    const player = Object.values(state.players).find((candidate) => {
      const identity = candidate.social?.identities?.[cleanPlatform];
      return identity?.verification === 'PLATFORM_VERIFIED' && identity.providerUserId === cleanProviderUserId;
    });
    return player?.ownerAddress || referralPendingIdentityOwner(state, cleanPlatform, cleanProviderUserId);
  }
  function communityAccessForTelegramUser(providerUserId) {
    const cleanProviderUserId = safeText(providerUserId, 80);
    if (!/^\d{1,24}$/.test(cleanProviderUserId)) return { allowed: false, missing: ['telegram', 'x', 'axo_telegram_membership'], pet: null };
    const state = readState();
    const player = Object.values(state.players).find((candidate) => {
      const identity = candidate.social?.identities?.telegram;
      return identity?.verification === 'PLATFORM_VERIFIED' && identity.providerUserId === cleanProviderUserId;
    });
    if (!player) return { allowed: false, missing: ['telegram', 'x', 'axo_telegram_membership'], pet: null };
    const telegram = player.social?.identities?.telegram;
    const x = player.social?.identities?.x;
    const telegramVerified = telegram?.verification === 'PLATFORM_VERIFIED' && telegram.providerUserId === cleanProviderUserId;
    const xVerified = x?.verification === 'PLATFORM_VERIFIED' && /^\d{1,24}$/.test(String(x.providerUserId || ''));
    const membership = telegramMembershipView(player, now());
    return {
      allowed: telegramVerified && xVerified && membership.verified,
      missing: [telegramVerified ? null : 'telegram', xVerified ? null : 'x', membership.verified ? null : 'axo_telegram_membership'].filter(Boolean),
      pet: { name: player.pet.name, genesisId: player.pet.genesisId, level: currentLevel(player.pet.xp) },
      telegramMembership: membership,
    };
  }
  function playerForTelegramIdentity(state, providerUserId) {
    const cleanProviderUserId = safeText(providerUserId, 80);
    if (!/^\d{1,24}$/.test(cleanProviderUserId)) return null;
    return Object.values(state.players).find((candidate) => {
      const identity = candidate.social?.identities?.telegram;
      return identity?.verification === 'PLATFORM_VERIFIED' && identity.providerUserId === cleanProviderUserId;
    }) || null;
  }
  function addCrewXp(state, player, {
    category,
    amount,
    sourceId,
    rewardClass = 'SOCIAL_PROVISIONAL',
    metadata = {},
    awardedAt = new Date(now()).toISOString(),
  } = {}) {
    state.crewMissions ||= defaultCrewMissions();
    state.crewMissions.xpLedger ||= [];
    const xp = Math.max(0, Math.min(100, Math.floor(Number(amount || 0))));
    const id = crypto.createHash('sha256').update(`${category}:${sourceId}:${player.id}`).digest('hex');
    const existing = state.crewMissions.xpLedger.find((entry) => entry.id === id);
    if (existing) return { entry: existing, awarded: false };
    const entry = {
      id,
      playerId: player.id,
      petGenesisId: player.pet.genesisId,
      category: safeText(category, 40),
      sourceId: safeText(sourceId, 120),
      amount: xp,
      rewardClass,
      status: 'RELEASED_TO_PET',
      affectsContributorTrust: false,
      affectsConsensusWeight: false,
      affectsProductionRanking: false,
      awardedAt,
      metadata,
    };
    state.crewMissions.xpLedger.push(entry);
    state.crewMissions.xpLedger = state.crewMissions.xpLedger.slice(-10_000);
    player.pet.xp += xp;
    player.updatedAt = awardedAt;
    recordEvent(state, 'CREW_XP_RELEASED', player.id, {
      category: entry.category,
      amount: xp,
      xp,
      sourceId: entry.sourceId,
      rewardClass,
      affectsContributorTrust: false,
      affectsProductionRanking: false,
    }, awardedAt);
    return { entry, awarded: true };
  }
  function ensureReferralCode(address) {
    const { state, player } = requirePlayer(address);
    requireGameplayAccess(player);
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    if (!referralCodeValue(player.crew?.referralCode)) {
      player.crew ||= {};
      const existing = new Set(Object.values(state.players).map((candidate) => referralCodeValue(candidate.crew?.referralCode)).filter(Boolean));
      let code;
      do { code = crypto.randomBytes(6).toString('hex').toUpperCase(); } while (existing.has(code));
      player.crew.referralCode = code;
      const createdAt = new Date(now()).toISOString();
      recordEvent(state, 'CREW_REFERRAL_CODE_CREATED', player.id, { codeHash: crypto.createHash('sha256').update(code).digest('hex') }, createdAt);
      saveState(state);
    }
    return {
      code: player.crew.referralCode,
      webPath: `/join/${player.crew.referralCode}`,
      activated: Number(player.crew.activatedReferrals || 0),
      weeklyRewardCap: REFERRAL_WEEKLY_REWARD_CAP,
      rewards: { welcomeXp: REFERRAL_WELCOME_XP, scoutXp: REFERRAL_SCOUT_XP },
    };
  }
  function bestPetShareCall(state, player) {
    const calls = (state.contributions || []).filter((contribution) => {
      const performance = contribution.alphaCall?.performance;
      return normalizeAddress(contribution.playerId) === player.ownerAddress
        && (!contribution.petGenesisId || contribution.petGenesisId === player.pet.genesisId)
        && performance?.status === 'SCORED'
        && Number.isFinite(Number(performance.returnPct))
        && Number.isFinite(Date.parse(performance.scoredAt || 0))
        && contribution.alphaCall?.safety?.initial?.eligible === true
        && contribution.alphaCall?.safety?.settlement?.eligible === true;
    }).map((contribution) => {
      const tokenAddress = normalizeAddress(contribution.alphaCall?.tokenAddress || contribution.entity);
      const project = tokenAddress
        ? state.projectQuests?.[tokenAddress] || Object.values(state.projectQuests || {}).find((entry) => normalizeAddress(entry?.address) === tokenAddress)
        : null;
      const fallbackSymbol = tokenAddress ? `${tokenAddress.slice(0, 6)}…${tokenAddress.slice(-4)}` : 'PROJECT';
      const symbol = safeText(project?.symbol || contribution.data?.symbol || fallbackSymbol, 18).toUpperCase();
      return {
        contributionId: contribution.id,
        symbol,
        returnPct: Number(contribution.alphaCall.performance.returnPct),
        realizedProfitUsd: Number(contribution.alphaCall.performance.realizedProfitUsd || 0),
        scoredAt: contribution.alphaCall.performance.scoredAt,
        receipt: /^0x[0-9a-f]{64}$/i.test(String(contribution.alphaCall.commitmentHash || '')) ? String(contribution.alphaCall.commitmentHash).toLowerCase() : null,
      };
    }).sort((left, right) => right.returnPct - left.returnPct
      || right.realizedProfitUsd - left.realizedProfitUsd
      || String(right.scoredAt).localeCompare(String(left.scoredAt)));
    return { best: calls[0] || null, scored: calls.length };
  }
  function petShareRanks(state, player, nowMs) {
    const all = Object.values(state.players || {}).filter((candidate) => candidate.walletVerified && normalizeAddress(candidate.ownerAddress));
    const overall = [...all].sort((left, right) => Number(right.pet?.xp || 0) - Number(left.pet?.xp || 0)
      || String(left.pet?.genesisId || '').localeCompare(String(right.pet?.genesisId || '')));
    const epochRows = all.map((candidate) => ({
      player: candidate,
      xp: playerLedgerView(state, candidate, { limit: 1, nowMs }).currentEpochXp,
    })).filter((entry) => entry.xp > 0).sort((left, right) => right.xp - left.xp
      || Number(right.player.pet?.xp || 0) - Number(left.player.pet?.xp || 0)
      || String(left.player.pet?.genesisId || '').localeCompare(String(right.player.pet?.genesisId || '')));
    const overallIndex = overall.findIndex((candidate) => candidate.id === player.id);
    const epochIndex = epochRows.findIndex((entry) => entry.player.id === player.id);
    return {
      overallRank: overallIndex >= 0 ? overallIndex + 1 : null,
      epochRank: epochIndex >= 0 ? epochIndex + 1 : null,
    };
  }
  function publicPetShareCard(record) {
    if (!record || record.status !== 'ACTIVE') return null;
    const { ownerAddress: _ownerAddress, status: _status, ...card } = record;
    return JSON.parse(JSON.stringify(card));
  }
  function createPetShareCard(address, input = {}) {
    const referral = ensureReferralCode(address);
    const { state, player } = requirePlayer(address);
    requireGameplayAccess(player);
    const variant = ['AUTO', 'PASSPORT', 'CALL', 'MILESTONE'].includes(String(input.variant || '').toUpperCase())
      ? String(input.variant).toUpperCase()
      : 'AUTO';
    const createdAt = new Date(now()).toISOString();
    const nowMs = Date.parse(createdAt);
    const ledger = playerLedgerView(state, player, { limit: 1, nowMs });
    const ranks = petShareRanks(state, player, nowMs);
    const visual = evolutionVisual(player);
    const specialty = leadingAbility(player.pet.abilities);
    const referredClaims = Object.values(state.crewMissions?.referralClaims || {})
      .filter((claim) => claim.referrerPlayerId === player.id && claim.sourceChannel === 'WEB');
    const stats = {
      petXp: Number(player.pet.xp || 0),
      epochXp: ledger.currentEpochXp,
      epochId: ledger.currentEpochId,
      epochRank: ranks.epochRank,
      overallRank: ranks.overallRank,
      contributions: Number(player.reputation?.validContributions || 0),
      activeDays: Number(player.care?.activeDays?.length || 0),
      activatedReferrals: referredClaims.length,
    };
    const calls = bestPetShareCall(state, player);
    let achievement = null;
    const positiveCall = calls.best && calls.best.returnPct > 0 ? calls.best : null;
    if (positiveCall && ['AUTO', 'CALL'].includes(variant)) {
      achievement = {
        kind: 'CALL',
        label: 'BEST VERIFIED PAPER CALL',
        primary: `${positiveCall.returnPct > 0 ? '+' : ''}${positiveCall.returnPct.toFixed(Math.abs(positiveCall.returnPct) >= 100 ? 1 : 2)}%`,
        secondary: `${positiveCall.symbol} · NET RETURN · ${calls.scored} SCORED ${calls.scored === 1 ? 'CALL' : 'CALLS'}`,
        receipt: positiveCall.receipt,
        observedAt: positiveCall.scoredAt,
        evidencePath: 'https://www.axo.vision/epoch',
      };
    } else if (stats.epochRank && stats.epochRank <= 10 && ['AUTO', 'MILESTONE'].includes(variant)) {
      achievement = {
        kind: 'EPOCH_RANK',
        label: 'CURRENT EPOCH POSITION',
        primary: `#${stats.epochRank}`,
        secondary: `${ledger.currentEpochId} · ${stats.epochXp.toLocaleString('en-US')} VERIFIED XP`,
        receipt: null,
        observedAt: createdAt,
        evidencePath: 'https://www.axo.vision/epoch',
      };
    } else if (stats.activatedReferrals > 0 && ['AUTO', 'MILESTONE'].includes(variant)) {
      achievement = {
        kind: 'CREW',
        label: 'CREW BUILDER',
        primary: `${stats.activatedReferrals} ACTIVATED`,
        secondary: 'QUALIFIED HATCHERY REFERRALS',
        receipt: null,
        observedAt: createdAt,
        evidencePath: null,
      };
    } else {
      achievement = {
        kind: 'PET_LEVEL',
        label: variant === 'PASSPORT' ? 'AXO PET PASSPORT' : 'PET PROGRESSION',
        primary: `LEVEL ${currentLevel(player.pet.xp)}`,
        secondary: `${currentStage(player.pet.xp).name} · ${specialty.label}`,
        receipt: null,
        observedAt: createdAt,
        evidencePath: null,
      };
    }
    state.petShareCards ||= {};
    let shareCode;
    do { shareCode = crypto.randomBytes(8).toString('hex'); } while (state.petShareCards[shareCode]);
    const snapshot = {
      version: 1,
      shareCode,
      createdAt,
      variant,
      joinPath: referral.webPath,
      pet: {
        genesisId: player.pet.genesisId,
        name: player.pet.name,
        lineage: lineageDefinition(player.pet.lineageId).label,
        stage: currentStage(player.pet.xp).name,
        level: currentLevel(player.pet.xp),
        specialty: specialty.label,
        visual: visual.asset,
        accent: visual.accent,
        glow: visual.glow,
      },
      stats,
      achievement,
    };
    const snapshotHash = `0x${crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')}`;
    state.petShareCards[shareCode] = { ...snapshot, snapshotHash, ownerAddress: player.ownerAddress, status: 'ACTIVE' };
    recordEvent(state, 'PET_SHARE_CARD_CREATED', player.id, { shareCode, snapshotHash, variant, achievement: achievement.kind, affectsContributorTrust: false, affectsProductionRanking: false }, createdAt);
    saveState(state);
    return publicPetShareCard(state.petShareCards[shareCode]);
  }
  function petShareCardByCode(codeInput) {
    const code = String(codeInput || '').trim().toLowerCase();
    if (!/^[a-f0-9]{16}$/.test(code)) return null;
    return publicPetShareCard(readState().petShareCards?.[code]);
  }
  function referralAntiAbuseRegistry(state) {
    state.crewMissions ||= defaultCrewMissions();
    state.crewMissions.referralAntiAbuse = normalizeReferralAntiAbuse(state.crewMissions.referralAntiAbuse);
    return state.crewMissions.referralAntiAbuse;
  }
  function archiveExpiredReferralStart(state, start, claimantKeyHash) {
    const registry = referralAntiAbuseRegistry(state);
    const expiredAt = new Date(now()).toISOString();
    registry.expiredStarts[start.id] = {
      sourceChannel: start.sourceChannel === 'WEB' ? 'WEB' : 'TELEGRAM',
      claimantKeyHash,
      referralCodeHash: crypto.createHash('sha256').update(String(start.referralCode || '')).digest('hex'),
      referrerPlayerIdHash: referralWalletKey(start.referrerPlayerId),
      startedAt: start.startedAt || null,
      expiresAt: start.expiresAt || null,
      expiredAt,
    };
    recordEvent(state, 'CREW_REFERRAL_FIRST_TOUCH_EXPIRED', start.referrerPlayerId, {
      referralId: start.id,
      sourceChannel: start.sourceChannel === 'WEB' ? 'WEB' : 'TELEGRAM',
      claimantKeyHash,
      expiredAt,
    }, expiredAt);
    if (start.sourceChannel === 'WEB') updateReferralPathReceipt(state, start, 'EXPIRED', expiredAt);
  }
  function ensureReferralPathReceipt(state, start) {
    if (!start?.id || start.sourceChannel !== 'WEB') return null;
    state.crewMissions ||= defaultCrewMissions();
    state.crewMissions.referralPathReceipts ||= {};
    const existing = state.crewMissions.referralPathReceipts[start.id];
    if (existing) {
      existing.onboarding = normalizeReferralPathOnboarding(existing.onboarding);
      return existing;
    }
    const receipt = {
      schema: 'AXO_DIRECT_REFERRAL_PATH_V1',
      id: start.id,
      sourceChannel: 'WEB',
      referrerWallet: normalizeAddress(start.referrerPlayerId),
      referredWallet: normalizeAddress(start.claimantWallet || start.claimantPlayerId),
      referralCodeHash: `0x${crypto.createHash('sha256').update(String(start.referralCode || '')).digest('hex')}`,
      status: 'ATTRIBUTED',
      startedAt: start.startedAt || new Date(now()).toISOString(),
      expiresAt: start.expiresAt || null,
      qualifiedAt: null,
      activatedAt: null,
      purchaseQualifiedAt: null,
      registeredAt: null,
      updatedAt: start.startedAt || new Date(now()).toISOString(),
      onboarding: normalizeReferralPathOnboarding(),
      history: [{ type: 'ATTRIBUTED', at: start.startedAt || new Date(now()).toISOString() }],
    };
    state.crewMissions.referralPathReceipts[start.id] = receipt;
    return receipt;
  }
  function updateReferralPathReceipt(state, start, status, at, details = {}) {
    const receipt = ensureReferralPathReceipt(state, start);
    if (!receipt) return null;
    const eventAt = Number.isFinite(Date.parse(at || '')) ? new Date(Date.parse(at)).toISOString() : new Date(now()).toISOString();
    receipt.status = status;
    receipt.updatedAt = eventAt;
    if (status === 'SOCIAL_QUALIFIED') receipt.qualifiedAt = eventAt;
    if (status === 'XP_ACTIVATED') receipt.activatedAt = eventAt;
    if (status === 'PURCHASE_QUALIFIED_1M') receipt.purchaseQualifiedAt = eventAt;
    if (status === 'REGISTERED_ONCHAIN') receipt.registeredAt = eventAt;
    receipt.history ||= [];
    const normalizedDetails = details && typeof details === 'object' && !Array.isArray(details) ? details : {};
    const duplicate = receipt.history.some((entry) => entry.type === status && entry.at === eventAt
      && String(entry.transactionHash || '') === String(normalizedDetails.transactionHash || ''));
    if (!duplicate) receipt.history.push({ type: status, at: eventAt, ...normalizedDetails });
    return receipt;
  }
  function appendReferralOnboardingEvent(state, start, type, at = null) {
    const receipt = ensureReferralPathReceipt(state, start);
    if (!receipt) return null;
    const eventAt = Number.isFinite(Date.parse(at || '')) ? new Date(Date.parse(at)).toISOString() : new Date(now()).toISOString();
    receipt.onboarding = normalizeReferralPathOnboarding(receipt.onboarding);
    receipt.history ||= [];
    if (!receipt.history.some((entry) => entry.type === type)) receipt.history.push({ type, at: eventAt });
    receipt.updatedAt = eventAt;
    return { receipt, onboarding: receipt.onboarding, eventAt };
  }
  function activeWebReferralStart(state, owner) {
    const start = state.crewMissions?.webReferralStarts?.[owner] || null;
    if (!start || start.sourceChannel !== 'WEB' || Date.parse(start.expiresAt || 0) <= now()) return null;
    return start;
  }
  function referralPendingIdentityOwner(state, platform, providerUserId, excludedOwner = null) {
    const cleanPlatform = safeText(platform, 20).toLowerCase();
    const cleanProviderUserId = safeText(providerUserId, 80);
    if (!['x', 'telegram'].includes(cleanPlatform) || !/^\d{1,24}$/.test(cleanProviderUserId)) return null;
    for (const start of Object.values(state.crewMissions?.webReferralStarts || {})) {
      const owner = normalizeAddress(start?.claimantWallet || start?.claimantPlayerId);
      if (!owner || owner === excludedOwner || Date.parse(start.expiresAt || 0) <= now()) continue;
      const receipt = ensureReferralPathReceipt(state, start);
      const identity = receipt?.onboarding?.pendingSocialIdentities?.[cleanPlatform];
      if (identity?.verification === 'PLATFORM_VERIFIED' && identity.providerUserId === cleanProviderUserId) return owner;
    }
    return null;
  }
  function pendingReferralPlayer(state, owner) {
    const start = activeWebReferralStart(state, owner);
    if (!start) return null;
    const receipt = ensureReferralPathReceipt(state, start);
    const onboarding = normalizeReferralPathOnboarding(receipt.onboarding);
    receipt.onboarding = onboarding;
    return {
      start,
      receipt,
      onboarding,
      player: {
        id: owner,
        ownerAddress: owner,
        social: {
          identities: onboarding.pendingSocialIdentities,
          telegramMembership: onboarding.pendingTelegramMembership,
        },
      },
    };
  }
  function reserveReferralClaimant(state, start, claimant, claim) {
    const registry = referralAntiAbuseRegistry(state);
    const walletKey = referralWalletKey(claimant.ownerAddress);
    if (!walletKey) throw new Error('crew_referral_claimant_wallet_invalid');
    const walletMarker = registry.activatedWallets[walletKey];
    if (walletMarker && walletMarker.referralStartId !== start.id) throw new Error('crew_referral_wallet_already_used');
    const communityWalletMarker = registry.communityOnboardedWallets[walletKey];
    if (communityWalletMarker && communityWalletMarker.referralStartId !== start.id) throw new Error('crew_referral_wallet_already_used');
    const identityKeys = ['x', 'telegram'].map((platform) => ({
      platform,
      key: referralSocialIdentityKey(platform, claimant.social?.identities?.[platform]?.providerUserId),
    })).filter((entry) => entry.key);
    for (const { platform, key } of identityKeys) {
      const marker = registry.socialIdentityHashes[platform][key];
      if (marker && marker.referralStartId !== start.id) throw new Error('crew_referral_identity_already_used');
      const communityMarker = registry.communitySocialIdentityHashes[platform][key];
      if (communityMarker && communityMarker.referralStartId !== start.id) throw new Error('crew_referral_identity_already_used');
    }
    const marker = {
      referralStartId: start.id,
      referralClaimId: claim.id,
      sourceChannel: start.sourceChannel === 'WEB' ? 'WEB' : 'TELEGRAM',
      activatedAt: claim.activatedAt,
      deletedAt: walletMarker?.deletedAt || null,
    };
    registry.activatedWallets[walletKey] = { ...(walletMarker || {}), ...marker };
    for (const { platform, key } of identityKeys) {
      registry.socialIdentityHashes[platform][key] = {
        referralStartId: start.id,
        referralClaimId: claim.id,
        activatedAt: claim.activatedAt,
      };
    }
    return { registry, walletKey, identityKeys };
  }
  function communityReferralEvidence(state, start, claimant) {
    if (!start || start.sourceChannel !== 'WEB' || !claimant || start.claimantWallet !== claimant.ownerAddress) return null;
    const x = claimant.social?.identities?.x;
    const telegram = claimant.social?.identities?.telegram;
    if (x?.verification !== 'PLATFORM_VERIFIED' || telegram?.verification !== 'PLATFORM_VERIFIED') return null;
    const walletHash = referralWalletKey(claimant.ownerAddress);
    const xIdentityHash = referralSocialIdentityKey('x', x.providerUserId);
    const telegramIdentityHash = referralSocialIdentityKey('telegram', telegram.providerUserId);
    if (!walletHash || !xIdentityHash || !telegramIdentityHash) return null;
    const startedAtMs = Date.parse(start.startedAt || '');
    const expiresAtMs = Date.parse(start.expiresAt || '');
    const identityTimes = [x.linkedAt || x.verifiedAt, telegram.linkedAt || telegram.verifiedAt]
      .map((value) => Date.parse(value || ''))
      .filter(Number.isFinite);
    const fallbackAtMs = Date.parse(start.activatedAt || '');
    const completedAtMs = identityTimes.length === 2 ? Math.max(...identityTimes) : fallbackAtMs;
    if (!Number.isFinite(startedAtMs) || !Number.isFinite(expiresAtMs) || !Number.isFinite(completedAtMs)
      || completedAtMs < startedAtMs || completedAtMs > expiresAtMs) return null;
    return {
      referralStartId: start.id,
      referrerPlayerId: start.referrerPlayerId,
      claimantWalletHash: walletHash,
      socialIdentityHashes: { x: xIdentityHash, telegram: telegramIdentityHash },
      completedAt: new Date(completedAtMs).toISOString(),
    };
  }
  function communityReferralEvidenceAllowed(state, evidence) {
    if (!evidence) return false;
    const registry = referralAntiAbuseRegistry(state);
    const walletMarker = registry.communityOnboardedWallets[evidence.claimantWalletHash];
    if (walletMarker && walletMarker.referralStartId !== evidence.referralStartId) return false;
    return Object.entries(evidence.socialIdentityHashes).every(([platform, identityHash]) => {
      const marker = registry.communitySocialIdentityHashes[platform][identityHash];
      return !marker || marker.referralStartId === evidence.referralStartId;
    });
  }
  function maybeRecordCommunityReferralOnboarding(state, address) {
    const owner = requireAddress(address);
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const start = state.crewMissions.webReferralStarts[owner];
    const claimant = state.players[owner];
    const evidence = communityReferralEvidence(state, start, claimant);
    if (!evidence || !communityReferralEvidenceAllowed(state, evidence)) return null;
    const existing = state.crewMissions.communityReferralMilestones[evidence.referralStartId];
    if (existing) return existing;
    const milestone = {
      id: evidence.referralStartId,
      referralStartId: evidence.referralStartId,
      referrerPlayerId: evidence.referrerPlayerId,
      claimantWalletHash: evidence.claimantWalletHash,
      socialIdentityHashes: evidence.socialIdentityHashes,
      completedAt: evidence.completedAt,
      criteria: 'PLATFORM_VERIFIED_X_AND_TELEGRAM',
      purchaseRequired: false,
      status: 'COUNTED',
      privacy: 'AGGREGATE_PUBLIC_INVITEE_IDENTITIES_PRIVATE',
    };
    state.crewMissions.communityReferralMilestones[evidence.referralStartId] = milestone;
    updateReferralPathReceipt(state, start, 'SOCIAL_QUALIFIED', evidence.completedAt, {
      criteria: 'PET_PLUS_PLATFORM_VERIFIED_X_AND_TELEGRAM',
    });
    const registry = referralAntiAbuseRegistry(state);
    registry.communityOnboardedWallets[evidence.claimantWalletHash] = {
      referralStartId: evidence.referralStartId,
      completedAt: evidence.completedAt,
      deletedAt: null,
    };
    for (const [platform, identityHash] of Object.entries(evidence.socialIdentityHashes)) {
      registry.communitySocialIdentityHashes[platform][identityHash] = {
        referralStartId: evidence.referralStartId,
        completedAt: evidence.completedAt,
      };
    }
    recordEvent(state, 'CREW_COMMUNITY_REFERRAL_ONBOARDED', evidence.referrerPlayerId, {
      referralStartId: evidence.referralStartId,
      claimantWalletHash: evidence.claimantWalletHash,
      criteria: milestone.criteria,
      purchaseRequired: false,
      affectsContributorTrust: false,
      affectsProductionRanking: false,
    }, evidence.completedAt);
    return milestone;
  }
  function communityReferralEvidenceRows(state) {
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const rows = new Map();
    for (const milestone of Object.values(state.crewMissions.communityReferralMilestones)) {
      if (milestone?.status !== 'COUNTED' || !milestone.referralStartId || !milestone.referrerPlayerId) continue;
      rows.set(milestone.referralStartId, milestone);
    }
    for (const start of Object.values(state.crewMissions.webReferralStarts)) {
      const claimant = state.players[normalizeAddress(start.claimantWallet || start.claimantPlayerId)] || null;
      const evidence = communityReferralEvidence(state, start, claimant);
      if (!evidence || !communityReferralEvidenceAllowed(state, evidence) || rows.has(evidence.referralStartId)) continue;
      rows.set(evidence.referralStartId, { ...evidence, status: 'COUNTED', criteria: 'PLATFORM_VERIFIED_X_AND_TELEGRAM', purchaseRequired: false });
    }
    return [...rows.values()];
  }
  function reconcileCommunityReferralMilestones({ limit = 500 } = {}) {
    const state = readState();
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const starts = Object.values(state.crewMissions.webReferralStarts)
      .slice(0, Math.max(1, Math.min(2_000, Math.floor(Number(limit) || 500))));
    let created = 0;
    for (const start of starts) {
      const owner = normalizeAddress(start.claimantWallet || start.claimantPlayerId);
      if (!owner || state.crewMissions.communityReferralMilestones[start.id]) continue;
      const milestone = maybeRecordCommunityReferralOnboarding(state, owner);
      if (milestone?.status === 'COUNTED') created += 1;
    }
    if (created > 0) saveState(state);
    return {
      status: 'COMPLETE',
      considered: starts.length,
      created,
      total: Object.keys(state.crewMissions.communityReferralMilestones).length,
    };
  }
  function communityReferralGraph(state, evidenceRows) {
    const startById = new Map(Object.values(state.crewMissions.webReferralStarts)
      .filter((start) => start?.id)
      .map((start) => [start.id, start]));
    const adjacency = new Map();
    for (const evidence of evidenceRows) {
      const referrerId = normalizeAddress(evidence.referrerPlayerId);
      const referrer = state.players[referrerId];
      if (!referrerId || !referrer || referrer.moderation?.status === 'SUSPENDED') continue;
      const start = startById.get(evidence.referralStartId);
      const claimantPlayerId = normalizeAddress(start?.claimantWallet || start?.claimantPlayerId);
      const edges = adjacency.get(referrerId) || [];
      edges.push({ evidence, claimantPlayerId });
      adjacency.set(referrerId, edges);
    }
    return adjacency;
  }
  function communityReferralNetwork(state, rootPlayerId, evidenceRows = communityReferralEvidenceRows(state), graph = null) {
    const root = normalizeAddress(rootPlayerId);
    const adjacency = graph || communityReferralGraph(state, evidenceRows);
    const direct = root ? (adjacency.get(root) || []).map((edge) => edge.evidence) : [];
    return {
      level1: direct,
      level2: [],
      level3: [],
      total: direct.length,
    };
  }
  function referralContestPrizeSchedule(amountRaw, winnerCount, requestedAmounts = null) {
    const total = BigInt(String(amountRaw));
    const count = Math.max(1, Math.min(10, Math.floor(Number(winnerCount) || 1)));
    let amounts;
    if (requestedAmounts !== null && requestedAmounts !== undefined) {
      if (!Array.isArray(requestedAmounts) || requestedAmounts.length !== count) throw new Error('referral_contest_prize_schedule_invalid');
      amounts = requestedAmounts.map((value) => {
        if (!/^\d+$/.test(String(value || '')) || BigInt(value) <= 0n) throw new Error('referral_contest_prize_schedule_invalid');
        return BigInt(value);
      });
      if (amounts.reduce((sum, value) => sum + value, 0n) !== total) throw new Error('referral_contest_prize_total_mismatch');
    } else {
      const share = total / BigInt(count);
      const remainder = total % BigInt(count);
      if (share <= 0n) throw new Error('referral_contest_prize_schedule_invalid');
      amounts = Array.from({ length: count }, (_, index) => share + (BigInt(index) < remainder ? 1n : 0n));
    }
    return amounts.map((amount, index) => ({ rank: index + 1, amountRaw: amount.toString(), symbol: 'AXO', decimals: 18 }));
  }
  function referralContestFundingProof(value, rewardAmountRaw) {
    if (!value) return null;
    const tokenAddress = normalizeAddress(value.tokenAddress);
    const vaultAddress = normalizeAddress(value.vaultAddress);
    const transactionHash = String(value.transactionHash || '').toLowerCase();
    const blockHash = String(value.blockHash || '').toLowerCase();
    const blockNumber = Math.floor(Number(value.blockNumber));
    const confirmedAtMs = Date.parse(value.confirmedAt || '');
    const modernSharedVaultProof = Boolean(
      value.controllerAddress
      || value.controller
      || value.runtimeCodeHash
      || value.allocationRaw
      || value.availableBalanceRaw
      || value.depositRaw
      || value.topUpRaw
      || value.postBalanceRaw
      || String(value.schema || '').startsWith('AXO_SEPTEMBER_2026_HATCHERY_CONTEST_FUNDING_PROOF'),
    );
    if (!modernSharedVaultProof) {
      if (Number(value.chainId) !== 4663
        || tokenAddress !== CANONICAL_AXO_TOKEN
        || vaultAddress !== CANONICAL_HATCHERY_REWARD_VAULT
        || String(value.amountRaw || '') !== String(rewardAmountRaw)
        || !/^0x[0-9a-f]{64}$/.test(transactionHash)
        || !/^0x[0-9a-f]{64}$/.test(blockHash)
        || !Number.isSafeInteger(blockNumber) || blockNumber <= 0
        || !Number.isFinite(confirmedAtMs)) throw new Error('referral_contest_funding_proof_invalid');
      return {
        status: 'DEPOSIT_CONFIRMED_SHARED_VAULT',
        chainId: 4663,
        tokenAddress,
        vaultAddress,
        amountRaw: String(rewardAmountRaw),
        transactionHash,
        blockHash,
        blockNumber,
        confirmedAt: new Date(confirmedAtMs).toISOString(),
        balanceBeforeRaw: /^\d+$/.test(String(value.balanceBeforeRaw || '')) ? String(value.balanceBeforeRaw) : null,
        balanceAfterRaw: /^\d+$/.test(String(value.balanceAfterRaw || '')) ? String(value.balanceAfterRaw) : null,
        availableAfterRaw: /^\d+$/.test(String(value.availableAfterRaw || '')) ? String(value.availableAfterRaw) : null,
        allocatedToContestRaw: String(rewardAmountRaw),
        unallocatedSharedVaultRaw: '0',
        reservedOnchain: false,
        awardRegistrationStatus: 'PENDING_FINAL_STANDINGS',
        valueMovementAuthorizedBy: 'RA_EXPLICIT_DIRECTIVE',
      };
    }
    const expectedController = normalizeAddress(config.alphaMiningProtocol?.hatcheryVault?.expectedController);
    const expectedRuntimeHash = String(config.alphaMiningProtocol?.hatcheryVault?.expectedRuntimeCodeHash || '').toLowerCase();
    const controllerAddress = normalizeAddress(value.controllerAddress || value.controller);
    const runtimeCodeHash = String(value.runtimeCodeHash || '').toLowerCase();
    const allocationRaw = String(value.allocationRaw || value.amountRaw || rewardAmountRaw);
    const availableBalanceRaw = /^\d+$/.test(String(value.availableBalanceRaw || '')) ? String(value.availableBalanceRaw) : null;
    const depositRaw = /^\d+$/.test(String(value.depositRaw || value.topUpRaw || '')) ? String(value.depositRaw || value.topUpRaw) : '0';
    const postBalanceRaw = /^\d+$/.test(String(value.postBalanceRaw || value.availableAfterRaw || '')) ? String(value.postBalanceRaw || value.availableAfterRaw) : null;
    const allocation = BigInt(String(rewardAmountRaw));
    const deposit = BigInt(depositRaw);
    const available = availableBalanceRaw ? BigInt(availableBalanceRaw) : null;
    const postBalance = postBalanceRaw ? BigInt(postBalanceRaw) : null;
    const minimumTopUp = available !== null && allocation > available ? allocation - available : 0n;
    if (Number(value.chainId) !== 4663
      || tokenAddress !== CANONICAL_AXO_TOKEN
      || vaultAddress !== CANONICAL_HATCHERY_REWARD_VAULT
      || controllerAddress === null || (expectedController && controllerAddress !== expectedController)
      || String(allocationRaw) !== String(rewardAmountRaw)
      || !/^0x[0-9a-f]{64}$/.test(runtimeCodeHash)
      || (expectedRuntimeHash && runtimeCodeHash !== expectedRuntimeHash)
      || available === null || postBalance === null
      || (deposit > 0n && !/^0x[0-9a-f]{64}$/.test(transactionHash))
      || !/^0x[0-9a-f]{64}$/.test(blockHash)
      || !Number.isSafeInteger(blockNumber) || blockNumber <= 0
      || !Number.isFinite(confirmedAtMs)
      || deposit < minimumTopUp
      || postBalance !== available + deposit
      || postBalance < allocation) throw new Error('referral_contest_funding_proof_invalid');
    return {
      status: deposit > 0n ? 'TOP_UP_CONFIRMED_SHARED_VAULT' : 'ALREADY_BACKED_BY_SHARED_VAULT',
      chainId: 4663,
      tokenAddress,
      vaultAddress,
      controllerAddress,
      runtimeCodeHash,
      allocationRaw: String(rewardAmountRaw),
      amountRaw: String(rewardAmountRaw),
      availableBalanceRaw,
      depositRaw: String(deposit),
      topUpRaw: String(deposit),
      postBalanceRaw,
      sharedVaultBalanceAfterRaw: postBalanceRaw,
      transactionHash: deposit > 0n ? transactionHash : null,
      blockHash,
      blockNumber,
      confirmedAt: new Date(confirmedAtMs).toISOString(),
      balanceBeforeRaw: /^\d+$/.test(String(value.balanceBeforeRaw || '')) ? String(value.balanceBeforeRaw) : null,
      balanceAfterRaw: /^\d+$/.test(String(value.balanceAfterRaw || '')) ? String(value.balanceAfterRaw) : null,
      availableAfterRaw: /^\d+$/.test(String(value.availableAfterRaw || '')) ? String(value.availableAfterRaw) : null,
      allocatedToContestRaw: String(rewardAmountRaw),
      topUpRequiredRaw: String(deposit),
      minimumTopUpRequiredRaw: minimumTopUp.toString(),
      backedByAvailableSharedVaultRaw: String(rewardAmountRaw),
      unallocatedSharedVaultRaw: (postBalance - allocation).toString(),
      reservedOnchain: false,
      awardRegistrationStatus: 'PENDING_FINAL_STANDINGS',
      valueMovementAuthorizedBy: 'RA_EXPLICIT_DIRECTIVE',
    };
  }
  function referralContestScoringPolicy() {
    return {
      id: 'DIRECT_QUALIFIED_PLUS_CAPPED_PET_XP_V1',
      directDepth: 1,
      basePointsPerQualifiedReferral: REFERRAL_CONTEST_BASE_POINTS,
      engagementXpCapPerReferral: REFERRAL_CONTEST_ENGAGEMENT_XP_CAP,
      pointsPerEngagementXp: 1,
      minimumMultiplierBps: 10_000,
      maximumMultiplierBps: 15_000,
      maximumPointsPerReferral: REFERRAL_CONTEST_BASE_POINTS + REFERRAL_CONTEST_ENGAGEMENT_XP_CAP,
      qualification: 'NEW_WALLET_HATCHED_ACTIVE_PET_PLUS_PLATFORM_VERIFIED_X_TELEGRAM_AND_CURRENT_OFFICIAL_ROOM_MEMBERSHIP',
      engagementWindow: 'AFTER_REFERRAL_QUALIFICATION_UNTIL_CONTEST_END',
      eligibleEventTypes: [...REFERRAL_CONTEST_ENGAGEMENT_EVENT_TYPES],
      excludedXp: 'REFERRAL_XP_ADMIN_ADJUSTMENTS_PASSIVE_RELEASES_AND_BONUS_AWARDS',
    };
  }
  function referralContestContribution(state, evidence, contest, currentMs = now()) {
    const start = Object.values(state.crewMissions.webReferralStarts).find((entry) => entry?.id === evidence.referralStartId);
    const claimantId = normalizeAddress(start?.claimantWallet || start?.claimantPlayerId);
    const claimant = claimantId ? state.players[claimantId] : null;
    if (!claimant?.pet || claimant.moderation?.status === 'SUSPENDED') return null;
    const qualifiedAtMs = Date.parse(evidence.completedAt || '');
    const contestStartMs = Date.parse(contest.startsAt || '');
    const contestEndMs = Date.parse(contest.endsAt || '');
    const scoringStartMs = Math.max(qualifiedAtMs, contestStartMs);
    const scoringEndMs = Math.min(currentMs + 1, contestEndMs);
    if (!Number.isFinite(scoringStartMs) || !Number.isFinite(scoringEndMs) || scoringEndMs <= scoringStartMs) {
      return {
        referralStartId: evidence.referralStartId,
        qualifiedAt: evidence.completedAt,
        eligibleXpEarned: 0,
        engagementXp: 0,
        multiplierBps: 10_000,
        score: REFERRAL_CONTEST_BASE_POINTS,
      };
    }
    const eligibleXpEarned = Math.floor(playerPetEvents(state, claimant).reduce((total, event) => {
      const atMs = Date.parse(event.at || '');
      if (!REFERRAL_CONTEST_ENGAGEMENT_EVENTS.has(event.type)
        || !Number.isFinite(atMs) || atMs < scoringStartMs || atMs >= scoringEndMs) return total;
      return total + xpFromEvent(event);
    }, 0));
    const engagementXp = Math.min(REFERRAL_CONTEST_ENGAGEMENT_XP_CAP, Math.max(0, eligibleXpEarned));
    return {
      referralStartId: evidence.referralStartId,
      qualifiedAt: evidence.completedAt,
      eligibleXpEarned,
      engagementXp,
      multiplierBps: 10_000 + engagementXp * 100,
      score: REFERRAL_CONTEST_BASE_POINTS + engagementXp,
    };
  }
  function referralContestStatus(contest, currentMs = now()) {
    if (!contest) return 'NOT_SCHEDULED';
    if (contest.cancelledAt) return 'CANCELLED';
    if (currentMs < Date.parse(contest.startsAt || '')) return 'SCHEDULED';
    if (currentMs < Date.parse(contest.endsAt || '')) return 'LIVE';
    return 'ENDED';
  }
  function publicReferralContest(state) {
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const contestState = state.crewMissions.referralContest;
    const contest = contestState.current;
    if (!contest) return { status: 'NOT_SCHEDULED', revision: contestState.revision };
    return {
      id: contest.id,
      title: contest.title,
      startsAt: contest.startsAt,
      endsAt: contest.endsAt,
      qualifyingFromAt: contest.startsAt,
      contestMode: contest.contestMode || 'STANDARD',
      supersedesContestId: contest.supersedesContestId || null,
      evidenceBoundaryAt: contest.startsAt,
      status: referralContestStatus(contest),
      cancelledAt: contest.cancelledAt || null,
      cancelledBy: contest.cancelledBy || null,
      cancellationReason: contest.cancellationReason || null,
      reward: { ...contest.reward },
      winnerCount: contest.winnerCount,
      prizes: Array.isArray(contest.prizes) ? contest.prizes.map((prize) => ({ ...prize })) : [],
      scoringPolicy: contest.scoringPolicy ? { ...contest.scoringPolicy, eligibleEventTypes: [...(contest.scoringPolicy.eligibleEventTypes || [])] } : referralContestScoringPolicy(),
      funding: contest.funding ? { ...contest.funding } : null,
      payoutPolicy: contest.payoutPolicy || 'ADMIN_REVIEW_AND_SEPARATE_AWARD_REQUIRED',
      revision: contestState.revision,
    };
  }
  function communityReferralLeaderboard({ limit = 25 } = {}) {
    const state = readState();
    const contest = publicReferralContest(state);
    const allEvidenceRows = communityReferralEvidenceRows(state);
    const evidenceRows = contest.id
      ? allEvidenceRows.filter((entry) => Date.parse(entry.completedAt || '') >= Date.parse(contest.startsAt)
        && Date.parse(entry.completedAt || '') < Date.parse(contest.endsAt)
        && referralContestContribution(state, entry, contest) !== null)
      : allEvidenceRows;
    const graph = communityReferralGraph(state, evidenceRows);
    const participatingReferrers = new Map();
    for (const evidence of evidenceRows) {
      const referrer = state.players[evidence.referrerPlayerId];
      if (!referrer || referrer.moderation?.status === 'SUSPENDED') continue;
      participatingReferrers.set(referrer.id, referrer);
    }
    const boundedLimit = Math.max(1, Math.min(50, Math.floor(Number(limit) || 25)));
    const allRows = [...participatingReferrers.values()].map((referrer) => {
      const network = communityReferralNetwork(state, referrer.id, evidenceRows, graph);
      const referralStartIds = new Set(network.level1.map((entry) => entry.referralStartId));
      const activated = Object.values(state.crewMissions.referralClaims)
        .filter((claim) => claim.sourceChannel === 'WEB' && claim.referrerPlayerId === referrer.id && referralStartIds.has(claim.referralId)).length;
      const qualifyingBuyers = Object.values(state.crewMissions.referralRewardSetups)
        .filter((setup) => setup.referrerWallet === referrer.ownerAddress && referralStartIds.has(setup.referralStartId)).length;
      const scoreParts = contest.id
        ? network.level1.map((entry) => referralContestContribution(state, entry, contest)).filter(Boolean)
        : [];
      const baseScore = scoreParts.length * REFERRAL_CONTEST_BASE_POINTS;
      const engagementXp = scoreParts.reduce((total, part) => total + part.engagementXp, 0);
      const eligibleXpEarned = scoreParts.reduce((total, part) => total + part.eligibleXpEarned, 0);
      const totalScore = baseScore + engagementXp;
      return {
        pet: {
          name: safeText(referrer.pet?.name, 40) || 'AXO Scout',
          lineage: lineageDefinition(referrer.pet?.lineageId).label,
          level: currentLevel(referrer.pet?.xp || 0),
          stage: currentStage(referrer.pet?.xp || 0).name,
        },
        communityOnboarded: network.level1.length,
        networkOnboarded: network.level1.length,
        level1: network.level1.length,
        level2: network.level2.length,
        level3: network.level3.length,
        activated,
        qualifyingBuyers,
        baseScore,
        engagementXp,
        eligibleEngagementXpEarned: eligibleXpEarned,
        engagedReferrals: scoreParts.filter((part) => part.engagementXp > 0).length,
        totalScore,
        multiplierBps: baseScore > 0 ? Math.floor((totalScore * 10_000) / baseScore) : 10_000,
        lastOnboardedAt: network.level1
          .map((entry) => entry.completedAt).filter(Boolean).sort().at(-1) || null,
        _firstQualifiedAt: network.level1.map((entry) => entry.completedAt).filter(Boolean).sort()[0] || null,
        _stableKey: crypto.createHash('sha256').update(String(referrer.pet?.genesisId || referrer.id)).digest('hex'),
      };
    }).sort((left, right) => (contest.id ? right.totalScore - left.totalScore : right.communityOnboarded - left.communityOnboarded)
      || right.communityOnboarded - left.communityOnboarded
      || right.engagedReferrals - left.engagedReferrals
      || right.engagementXp - left.engagementXp
      || String(left._firstQualifiedAt || '').localeCompare(String(right._firstQualifiedAt || ''))
      || left._stableKey.localeCompare(right._stableKey))
      .map((row, index) => {
        const { _firstQualifiedAt, _stableKey, ...publicRow } = row;
        return { rank: index + 1, ...publicRow, prize: contest.prizes?.[index] ? { ...contest.prizes[index] } : null };
      });
    const rows = allRows.slice(0, boundedLimit);
    return {
      status: 'LIVE',
      generatedAt: new Date(now()).toISOString(),
      criteria: 'DIRECT_REFERRED_MEMBER_CREATED_PET_AND_CONNECTED_PLATFORM_VERIFIED_X_AND_TELEGRAM',
      purchaseRequired: false,
      scoring: contest.id ? contest.scoringPolicy : null,
      totalScore: allRows.reduce((total, row) => total + row.totalScore, 0),
      totalEngagementXp: allRows.reduce((total, row) => total + row.engagementXp, 0),
      totalCommunityOnboarded: allRows.reduce((total, row) => total + row.communityOnboarded, 0),
      totalNetworkCredits: allRows.reduce((total, row) => total + row.networkOnboarded, 0),
      participatingScouts: allRows.length,
      maximumDepth: 1,
      tokenRewardDepth: 1,
      networkPolicy: 'DIRECT_LEVEL_ONE_ONLY_NO_INDIRECT_REFERRAL_CREDIT',
      contest,
      rows,
      privacy: {
        referredWalletsIncluded: false,
        referredSocialIdentitiesIncluded: false,
        scoutWalletsIncluded: false,
        publicIdentity: 'AXO_PET_ONLY',
      },
    };
  }
  function referralPathAdminRows(state) {
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    return Object.values(state.crewMissions.referralPathReceipts)
      .filter((receipt) => receipt && receipt.sourceChannel === 'WEB')
      .sort((left, right) => Date.parse(right.updatedAt || right.startedAt || 0) - Date.parse(left.updatedAt || left.startedAt || 0))
      .map((receipt) => {
        const { onboarding: _privateOnboarding, ...path } = receipt;
        const progress = referralOnboardingProjection(state, receipt);
        const referredPlayer = state.players[normalizeAddress(receipt.referredWallet)] || null;
        return {
          ...path,
          pet: referredPlayer ? {
            name: safeText(referredPlayer.pet?.name, 40) || 'AXO Pet',
            lineage: lineageDefinition(referredPlayer.pet?.lineageId).label,
            level: currentLevel(referredPlayer.pet?.xp || 0),
          } : null,
          onboarding: progress,
          history: Array.isArray(receipt.history) ? [...receipt.history] : [],
        };
      });
  }
  function referralConversionSummary(paths = []) {
    const total = paths.length;
    const countStage = (stage) => paths.filter((path) => path.onboarding?.stages?.[stage]?.complete === true).length;
    const stageRows = [
      ['wallet', 'Wallet attributed'],
      ['telegramChannel', 'Telegram opened'],
      ['telegram', 'Telegram verified'],
      ['x', 'X verified'],
      ['pet', 'Pet hatched'],
      ['rewardChoice', 'Reward choice'],
    ].map(([key, label]) => {
      const completed = countStage(key);
      return { key, label, completed, conversionPct: total ? Math.round((completed / total) * 10_000) / 100 : 0 };
    });
    const stalled = Object.fromEntries(['wallet', 'telegramChannel', 'telegram', 'x', 'pet', 'rewardChoice', 'done']
      .map((key) => [key, paths.filter((path) => path.onboarding?.currentStep === key).length]));
    return {
      totalAttributed: total,
      completed: paths.filter((path) => path.onboarding?.complete === true).length,
      socialQualified: paths.filter((path) => path.onboarding?.socialQualified === true).length,
      purchaseQualified: paths.filter((path) => path.onboarding?.purchaseQualified === true).length,
      purchaseSkipped: paths.filter((path) => path.onboarding?.purchaseSkipped === true).length,
      xpActivated: paths.filter((path) => path.onboarding?.xpActivated === true).length,
      stages: stageRows,
      stalled,
    };
  }
  function adminReferralContest(actorAddress) {
    const state = readState();
    requireStaff(state, actorAddress, true);
    const contestState = normalizeReferralContest(state.crewMissions?.referralContest);
    const paths = referralPathAdminRows(state);
    return {
      generatedAt: new Date(now()).toISOString(),
      contest: publicReferralContest(state),
      configuration: contestState.current ? { ...contestState.current } : null,
      revision: contestState.revision,
      leaderboard: communityReferralLeaderboard({ limit: 50 }),
      paths,
      conversion: referralConversionSummary(paths),
      archived: [...contestState.archived],
      receipts: [...contestState.receipts],
      privacy: 'ADMIN_ONLY_WALLET_PATHS_PUBLIC_BOARD_USES_PET_IDENTITIES_ONLY',
    };
  }
  function setReferralContest(actorAddress, input = {}, options = {}) {
    const state = readState();
    const actor = requireStaff(state, actorAddress, true);
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const contestState = state.crewMissions.referralContest;
    if (Number(input.expectedRevision) !== contestState.revision) throw new Error('referral_contest_revision_conflict');
    const current = contestState.current;
    const currentStatus = current ? referralContestStatus(current) : null;
    const contestMode = input.contestMode === 'LIVE_SUPERSESSION' ? 'LIVE_SUPERSESSION' : 'STANDARD';
    const liveSupersession = currentStatus === 'LIVE' && contestMode === 'LIVE_SUPERSESSION';
    if (liveSupersession && String(input.supersedeContestId || '') !== String(current.id || '')) throw new Error('referral_contest_supersede_id_mismatch');
    const livePrizeReduction = currentStatus === 'LIVE' && options.livePrizeReduction === true;
    const startsAtMs = Date.parse(input.startsAt || '');
    const endsAtMs = Date.parse(input.endsAt || '');
    if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs) || endsAtMs <= startsAtMs) throw new Error('referral_contest_window_invalid');
    if (endsAtMs - startsAtMs < 3_600_000 || endsAtMs - startsAtMs > (liveSupersession ? 31 : 14) * 86_400_000) throw new Error('referral_contest_window_duration_invalid');
    if (startsAtMs < now() && !livePrizeReduction && !liveSupersession) throw new Error('referral_contest_must_start_in_future');
    if (liveSupersession) {
      if (!current?.funding || current.funding.reservedOnchain === true
        || current.funding.awardRegistrationStatus !== 'PENDING_FINAL_STANDINGS') throw new Error('referral_contest_live_supersession_unavailable');
      if (!options.verifiedFunding) throw new Error('referral_contest_live_supersession_funding_required');
      if (startsAtMs < Date.parse(current.startsAt || '') || startsAtMs > now() + 5 * 60_000) throw new Error('referral_contest_live_supersession_start_invalid');
      if (endsAtMs <= Date.parse(current.endsAt || '')) throw new Error('referral_contest_live_supersession_end_invalid');
    }
    if (!/^\d+$/.test(String(input.rewardAmountRaw || '')) || BigInt(input.rewardAmountRaw) <= 0n) throw new Error('referral_contest_reward_invalid');
    const winnerCount = Math.floor(Number(input.winnerCount));
    if (!Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > 10) throw new Error('referral_contest_winner_count_invalid');
    const title = safeText(input.title, 80);
    if (title.length < 3) throw new Error('referral_contest_title_invalid');
    const preservedPrizeAmounts = !input.prizeAmountsRaw
      && current && String(current.reward?.amountRaw) === String(input.rewardAmountRaw)
      && Number(current.winnerCount) === winnerCount && Array.isArray(current.prizes)
      ? current.prizes.map((prize) => prize.amountRaw)
      : null;
    const prizes = referralContestPrizeSchedule(input.rewardAmountRaw, winnerCount, input.prizeAmountsRaw || preservedPrizeAmounts);
    const changedAt = new Date(now()).toISOString();
    if (currentStatus === 'LIVE' && !livePrizeReduction && !liveSupersession) throw new Error('referral_contest_locked_after_start');
    if (livePrizeReduction) {
      if (!current?.funding || current.funding.reservedOnchain === true
        || current.funding.awardRegistrationStatus !== 'PENDING_FINAL_STANDINGS') throw new Error('referral_contest_live_prize_reduction_unavailable');
      if (new Date(startsAtMs).toISOString() !== current.startsAt
        || new Date(endsAtMs).toISOString() !== current.endsAt
        || winnerCount !== current.winnerCount) throw new Error('referral_contest_live_prize_reduction_scope_invalid');
      if (BigInt(input.rewardAmountRaw) >= BigInt(current.reward?.amountRaw || '0')) throw new Error('referral_contest_live_prize_reduction_invalid');
      if (!Array.isArray(current.prizes) || current.prizes.length !== prizes.length
        || prizes.some((prize, index) => BigInt(prize.amountRaw) > BigInt(current.prizes[index]?.amountRaw || '0'))) {
        throw new Error('referral_contest_live_prize_reduction_rank_increase_forbidden');
      }
    }
    const replacingEnded = current && currentStatus === 'ENDED';
    const replacingLive = liveSupersession && current;
    const nextContestId = replacingEnded || replacingLive || !current ? crypto.randomUUID() : current.id;
    if (replacingEnded || replacingLive) contestState.archived.push({
      ...current,
      archivedAt: changedAt,
      archivedReason: replacingLive ? 'SUPERSEDED_BY_NEW_LIVE_CONTEST' : 'ENDED_AND_REPLACED',
      supersededByContestId: replacingLive ? nextContestId : undefined,
    });
    const funding = livePrizeReduction
      ? {
        ...current.funding,
        allocatedToContestRaw: String(input.rewardAmountRaw),
        unallocatedSharedVaultRaw: (BigInt(current.funding.amountRaw) - BigInt(input.rewardAmountRaw)).toString(),
      }
      : options.verifiedFunding
      ? referralContestFundingProof(options.verifiedFunding, input.rewardAmountRaw)
      : current?.funding && String(current.funding.amountRaw) === String(input.rewardAmountRaw) ? { ...current.funding } : null;
    const next = {
      id: nextContestId,
      title,
      startsAt: new Date(startsAtMs).toISOString(),
      endsAt: new Date(endsAtMs).toISOString(),
      contestMode,
      supersedesContestId: replacingLive ? current.id : null,
      reward: {
        symbol: 'AXO',
        decimals: 18,
        amountRaw: String(input.rewardAmountRaw),
        label: safeText(input.rewardLabel, 120),
      },
      winnerCount,
      prizes,
      scoring: 'DIRECT_QUALIFIED_PLUS_CAPPED_PET_XP',
      scoringPolicy: referralContestScoringPolicy(),
      criteria: 'NEW_WALLET_HATCHED_ACTIVE_PET_PLUS_PLATFORM_VERIFIED_X_TELEGRAM_AND_CURRENT_OFFICIAL_ROOM_MEMBERSHIP',
      funding,
      payoutPolicy: funding ? 'VERIFIED_SHARED_VAULT_AWARD_AFTER_FINAL_STANDINGS' : 'ADMIN_REVIEW_AND_SEPARATE_AWARD_REQUIRED',
      createdAt: replacingEnded || replacingLive || !current ? changedAt : current.createdAt,
      createdBy: replacingEnded || replacingLive || !current ? actor.owner : current.createdBy,
      updatedAt: changedAt,
      updatedBy: actor.owner,
    };
    const beforeHash = current ? `0x${crypto.createHash('sha256').update(JSON.stringify(current)).digest('hex')}` : null;
    contestState.current = next;
    contestState.revision += 1;
    const receipt = {
      id: crypto.randomUUID(),
      contestId: next.id,
      revision: contestState.revision,
      action: replacingEnded || !current ? 'CREATED' : replacingLive ? 'LIVE_SUPERSESSION_CREATED' : livePrizeReduction ? 'LIVE_PRIZE_REDUCTION' : 'UPDATED_BEFORE_START',
      actor: actor.owner,
      recordedAt: changedAt,
      beforeHash,
      afterHash: `0x${crypto.createHash('sha256').update(JSON.stringify(next)).digest('hex')}`,
      supersededContestId: replacingLive ? current.id : null,
    };
    contestState.receipts.push(receipt);
    recordEvent(state, 'REFERRAL_CONTEST_CONFIGURED', actor.owner, {
      contestId: next.id,
      revision: contestState.revision,
      action: receipt.action,
      supersededContestId: receipt.supersededContestId,
      contestMode: next.contestMode,
      startsAt: next.startsAt,
      endsAt: next.endsAt,
      rewardAmountRaw: next.reward.amountRaw,
      winnerCount: next.winnerCount,
      prizeAmountsRaw: next.prizes.map((prize) => prize.amountRaw),
      scoringPolicy: next.scoringPolicy.id,
      fundingTransactionHash: next.funding?.transactionHash || null,
      automaticValueMovement: false,
    }, changedAt);
    saveState(state);
    return adminReferralContest(actor.owner);
  }
  function cancelReferralContest(actorAddress, input = {}) {
    const state = readState();
    const actor = requireStaff(state, actorAddress, true);
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const contestState = state.crewMissions.referralContest;
    if (Number(input.expectedRevision) !== contestState.revision) throw new Error('referral_contest_revision_conflict');
    const current = contestState.current;
    if (!current || String(input.contestId || '') !== String(current.id || '')) throw new Error('referral_contest_cancel_id_mismatch');
    const currentStatus = referralContestStatus(current);
    if (!['SCHEDULED', 'LIVE'].includes(currentStatus)) throw new Error('referral_contest_cancel_unavailable');
    if (!current.funding || current.funding.reservedOnchain === true
      || current.funding.awardRegistrationStatus !== 'PENDING_FINAL_STANDINGS') throw new Error('referral_contest_cancel_awards_started');
    const leaderboard = communityReferralLeaderboard({ limit: 50 });
    if (Number(leaderboard.totalCommunityOnboarded || 0) !== 0 || Number(leaderboard.participatingScouts || 0) !== 0) {
      throw new Error('referral_contest_cancel_has_qualified_entries');
    }
    const changedAt = new Date(now()).toISOString();
    const reason = safeText(input.reason, 240);
    if (reason.length < 3) throw new Error('referral_contest_cancel_reason_invalid');
    const beforeHash = `0x${crypto.createHash('sha256').update(JSON.stringify(current)).digest('hex')}`;
    const sharedVaultRaw = /^\d+$/.test(String(current.funding.sharedVaultBalanceAfterRaw || ''))
      ? String(current.funding.sharedVaultBalanceAfterRaw)
      : /^\d+$/.test(String(current.funding.postBalanceRaw || ''))
        ? String(current.funding.postBalanceRaw)
        : /^\d+$/.test(String(current.funding.amountRaw || ''))
          ? String(current.funding.amountRaw)
          : String(current.reward?.amountRaw || '0');
    const next = {
      ...current,
      funding: {
        ...current.funding,
        allocatedToContestRaw: '0',
        unallocatedSharedVaultRaw: sharedVaultRaw,
        awardRegistrationStatus: 'CANCELLED_NO_AWARDS',
      },
      payoutPolicy: 'CANCELLED_NO_WINNER_AWARDS',
      cancelledAt: changedAt,
      cancelledBy: actor.owner,
      cancellationReason: reason,
      updatedAt: changedAt,
      updatedBy: actor.owner,
    };
    contestState.current = next;
    contestState.revision += 1;
    const receipt = {
      id: crypto.randomUUID(),
      contestId: next.id,
      revision: contestState.revision,
      action: 'CANCELLED_NO_QUALIFIED_ENTRIES',
      actor: actor.owner,
      recordedAt: changedAt,
      reason,
      beforeHash,
      afterHash: `0x${crypto.createHash('sha256').update(JSON.stringify(next)).digest('hex')}`,
      automaticValueMovement: false,
      winnerAwardsRegistered: false,
    };
    contestState.receipts.push(receipt);
    recordEvent(state, 'REFERRAL_CONTEST_CANCELLED', actor.owner, {
      contestId: next.id,
      revision: contestState.revision,
      reason,
      qualifiedReferrals: 0,
      participatingScouts: 0,
      winnerAwardsRegistered: false,
      allocatedToContestRaw: '0',
      unallocatedSharedVaultRaw: sharedVaultRaw,
      automaticValueMovement: false,
    }, changedAt);
    saveState(state);
    return adminReferralContest(actor.owner);
  }
  function weeklyReferralScoutRewards(state, referrer, week) {
    const registry = referralAntiAbuseRegistry(state);
    const walletKey = referralWalletKey(referrer.ownerAddress);
    if (!walletKey) throw new Error('crew_referrer_wallet_invalid');
    const key = `${week}:${walletKey}`;
    const previous = registry.weeklyScoutRewards[key] && typeof registry.weeklyScoutRewards[key] === 'object'
      ? registry.weeklyScoutRewards[key]
      : {};
    const claimIds = previous.claimIds && typeof previous.claimIds === 'object' && !Array.isArray(previous.claimIds)
      ? { ...previous.claimIds }
      : {};
    for (const entry of state.crewMissions.xpLedger || []) {
      if (entry.playerId !== referrer.id || entry.category !== 'REFERRAL_SCOUT' || entry.metadata?.week !== week) continue;
      const claimId = safeText(entry.metadata?.referralId || entry.sourceId, 120);
      if (claimId) claimIds[claimId] ||= entry.awardedAt || null;
    }
    for (const entry of rewardEntries(state)) {
      const attributedAtMs = Date.parse(entry.attributedAt || entry.recordedAt || 0);
      if (entry.playerId !== referrer.id || entry.reasonCode !== 'WEB_REFERRAL_SCOUT' || !Number.isFinite(attributedAtMs) || isoWeek(attributedAtMs) !== week) continue;
      const claimId = safeText(entry.sourceId, 120);
      if (claimId) claimIds[claimId] ||= entry.attributedAt || entry.recordedAt || null;
    }
    const record = { week, referrerWalletHash: walletKey, claimIds };
    registry.weeklyScoutRewards[key] = record;
    return record;
  }
  function recordReferralStart(providerUserId, codeInput) {
    const identityKey = telegramIdentityKey(providerUserId);
    const code = referralCodeValue(codeInput);
    if (!identityKey || !code) throw new Error('crew_referral_link_invalid');
    const state = readState();
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const referrer = Object.values(state.players).find((candidate) => referralCodeValue(candidate.crew?.referralCode) === code);
    if (!referrer) throw new Error('crew_referral_code_not_found');
    requireGameplayAccess(referrer);
    let existing = state.crewMissions.referralStarts[identityKey];
    if (existing && existing.status !== 'ACTIVATED' && Date.parse(existing.expiresAt || 0) <= now()) {
      archiveExpiredReferralStart(state, existing, identityKey);
      delete state.crewMissions.referralStarts[identityKey];
      existing = null;
    }
    if (existing) {
      if (existing.referralCode !== code) throw new Error('crew_referral_already_attributed');
      return {
        accepted: true,
        status: existing.status,
        startedAt: existing.startedAt,
        expiresAt: existing.expiresAt,
        firstTouchLocked: true,
      };
    }
    if (referralAntiAbuseRegistry(state).socialIdentityHashes.telegram[identityKey]) throw new Error('crew_referral_identity_already_used');
    const startedAt = new Date(now()).toISOString();
    const record = {
      id: crypto.randomUUID(),
      telegramIdentityKey: identityKey,
      sourceChannel: 'TELEGRAM',
      referralCode: code,
      referrerPlayerId: referrer.id,
      status: 'PENDING_ACTIVATION',
      startedAt,
      expiresAt: new Date(now() + REFERRAL_START_TTL_MS).toISOString(),
      activatedAt: null,
      claimantPlayerId: null,
    };
    state.crewMissions.referralStarts[identityKey] = record;
    recordEvent(state, 'CREW_REFERRAL_STARTED', referrer.id, {
      referralId: record.id,
      telegramIdentityHash: identityKey,
      expiresAt: record.expiresAt,
    }, startedAt);
    saveState(state);
    return {
      accepted: true,
      status: record.status,
      startedAt: record.startedAt,
      expiresAt: record.expiresAt,
      firstTouchLocked: true,
    };
  }
  function webReferralPublic(codeInput) {
    const code = referralCodeValue(codeInput);
    if (!code) return { available: false, status: 'REFERRAL_LINK_INVALID' };
    const state = readState();
    const referrer = Object.values(state.players).find((candidate) => referralCodeValue(candidate.crew?.referralCode) === code);
    if (!referrer || referrer.moderation?.status === 'SUSPENDED') return { available: false, status: 'REFERRAL_LINK_UNAVAILABLE' };
    const visual = evolutionVisual(referrer);
    return {
      available: true,
      status: 'READY',
      code,
      invitedBy: {
        petName: referrer.pet.name,
        lineage: lineageDefinition(referrer.pet.lineageId).label,
        stage: currentStage(referrer.pet.xp).name,
        level: currentLevel(referrer.pet.xp),
        visual: visual.asset,
        accent: visual.accent,
        glow: visual.glow,
      },
      rewards: { inviteeEpochXp: REFERRAL_WELCOME_XP, referrerEpochXp: REFERRAL_SCOUT_XP },
      expiresAfterFirstTouchDays: Math.floor(REFERRAL_START_TTL_MS / 86_400_000),
      requirements: ['NEW_WALLET', 'CREW_PASSPORT', 'HATCHED_PET'],
      axoPurchase: {
        optionalForCommunityXp: true,
        requiredForTokenReward: referralPurchaseConfigured,
        route: referralPurchaseConfigured ? {
          chainId: 4663,
          tokenAddress: referralPurchaseToken,
          poolId: referralPurchasePoolId,
          routerAddress: referralPurchaseRouter,
        } : null,
        minimumDeliveredAxoRaw: referralPurchaseConfigured ? REFERRAL_MINIMUM_PURCHASE_RAW : null,
        referrerRewardRaw: referralPurchaseConfigured ? configuredReferralRewardAmountRaw : null,
        rewardRecipient: 'REFERRER_WALLET',
        contractVersion: referralPurchaseConfigured ? 4 : null,
        holdingRule: referralPurchaseConfigured ? 'BOTH_REFERRER_AND_BUYER_AT_CLAIM_TIME' : null,
        continuousHoldingRequired: false,
        referralRewardContractStatus: referralPurchaseConfigured ? 'CONFIGURED' : 'CURRENT_AXO_REFERRAL_REWARDS_DISABLED',
        claimable: false,
      },
    };
  }
  function webReferralWalletConnectionState(state, owner, code) {
    const referrer = Object.values(state.players).find((candidate) => referralCodeValue(candidate.crew?.referralCode) === code);
    if (!referrer) throw new Error('crew_referral_code_not_found');
    requireGameplayAccess(referrer);
    const existing = state.crewMissions.webReferralStarts[owner] || null;
    const existingIsLive = existing && (existing.status === 'ACTIVATED' || Date.parse(existing.expiresAt || 0) > now());
    if (existingIsLive) {
      if (existing.referralCode !== code) {
        return {
          connection: 'wallet',
          available: false,
          resumable: false,
          status: 'WALLET_ATTRIBUTED_TO_ANOTHER_INVITE',
          error: 'crew_referral_already_attributed',
          action: 'CONTINUE_EXISTING_INVITE_OR_USE_ANOTHER_WALLET',
          privacy: 'EXISTING_REFERRER_NOT_DISCLOSED',
          referrer,
          existing,
        };
      }
      return {
        connection: 'wallet',
        available: true,
        resumable: true,
        status: 'RESUME_EXISTING_ONBOARDING',
        error: null,
        action: 'CONTINUE_ONBOARDING',
        privacy: 'EXISTING_REFERRER_NOT_DISCLOSED',
        referrer,
        existing,
      };
    }
    if (referrer.id === owner) {
      return {
        connection: 'wallet',
        available: false,
        resumable: false,
        status: 'SELF_REFERRAL_BLOCKED',
        error: 'crew_referral_self_or_cycle',
        action: 'USE_A_DIFFERENT_NEW_WALLET',
        privacy: 'NO_OTHER_WALLET_DISCLOSED',
        referrer,
        existing: null,
      };
    }
    const registry = referralAntiAbuseRegistry(state);
    const ownerWalletHash = referralWalletKey(owner);
    const alreadyRegistered = Boolean(state.players[owner]
      || state.crewMissions.referralClaims[owner]
      || registry.activatedWallets[ownerWalletHash]
      || registry.communityOnboardedWallets[ownerWalletHash]);
    if (alreadyRegistered) {
      return {
        connection: 'wallet',
        available: false,
        resumable: false,
        status: 'WALLET_ALREADY_REGISTERED',
        error: 'crew_referral_new_wallet_required',
        action: 'CONTINUE_EXISTING_AXO_ACCOUNT_OR_USE_ANOTHER_WALLET',
        privacy: 'NO_OTHER_WALLET_DISCLOSED',
        referrer,
        existing: null,
      };
    }
    return {
      connection: 'wallet',
      available: true,
      resumable: false,
      status: 'AVAILABLE_FOR_ONBOARDING',
      error: null,
      action: 'START_ONBOARDING',
      privacy: 'NO_EXISTING_OWNER_DISCLOSED',
      referrer,
      existing: null,
    };
  }
  function webReferralWalletPreflight(address, codeInput) {
    const owner = requireAddress(address);
    const code = referralCodeValue(codeInput);
    if (!code) throw new Error('crew_referral_link_invalid');
    const state = readState();
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const { referrer: _referrer, existing: _existing, ...view } = webReferralWalletConnectionState(state, owner, code);
    return view;
  }
  function recordWebReferralStart(address, codeInput) {
    const owner = requireAddress(address);
    const code = referralCodeValue(codeInput);
    if (!code) throw new Error('crew_referral_link_invalid');
    const state = readState();
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    let connection = webReferralWalletConnectionState(state, owner, code);
    let existing = state.crewMissions.webReferralStarts[owner];
    if (existing && existing.status !== 'ACTIVATED' && Date.parse(existing.expiresAt || 0) <= now()) {
      archiveExpiredReferralStart(state, existing, referralWalletKey(owner));
      delete state.crewMissions.webReferralStarts[owner];
      existing = null;
      connection = webReferralWalletConnectionState(state, owner, code);
    }
    if (!connection.available) throw new Error(connection.error);
    if (connection.resumable && existing) {
      return {
        accepted: true,
        status: existing.status,
        startedAt: existing.startedAt,
        expiresAt: existing.expiresAt,
        firstTouchLocked: true,
      };
    }
    const referrer = connection.referrer;
    const startedAt = new Date(now()).toISOString();
    const record = {
      id: crypto.randomUUID(),
      sourceChannel: 'WEB',
      claimantWallet: owner,
      referralCode: code,
      referrerPlayerId: referrer.id,
      status: 'PENDING_ACTIVATION',
      startedAt,
      expiresAt: new Date(now() + REFERRAL_START_TTL_MS).toISOString(),
      activatedAt: null,
      claimantPlayerId: null,
    };
    state.crewMissions.webReferralStarts[owner] = record;
    ensureReferralPathReceipt(state, record);
    recordEvent(state, 'CREW_WEB_REFERRAL_STARTED', referrer.id, {
      referralId: record.id,
      claimantWalletHash: crypto.createHash('sha256').update(owner).digest('hex'),
      expiresAt: record.expiresAt,
    }, startedAt);
    saveState(state);
    return {
      accepted: true,
      status: record.status,
      startedAt: record.startedAt,
      expiresAt: record.expiresAt,
      firstTouchLocked: true,
    };
  }
  function webReferralActivationPlan(address) {
    const owner = requireAddress(address);
    const state = readState();
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const start = state.crewMissions.webReferralStarts[owner] || null;
    const claimant = state.players[owner] || null;
    if (!start) return { status: 'NO_REFERRAL', claimantPlayerId: claimant?.id || null, referrerPlayerId: null };
    if (Date.parse(start.expiresAt || 0) <= now()) return { status: 'REFERRAL_EXPIRED', claimantPlayerId: claimant?.id || null, referrerPlayerId: start.referrerPlayerId, referralId: start.id };
    if (!claimant) return { status: 'PET_REQUIRED', claimantPlayerId: null, referrerPlayerId: start.referrerPlayerId, referralId: start.id };
    const existing = state.crewMissions.referralClaims[claimant.id];
    return {
      status: existing?.status || 'READY_FOR_ELIGIBILITY',
      claimantPlayerId: claimant.id,
      referrerPlayerId: start.referrerPlayerId,
      referralId: start.id,
    };
  }
  function referralActivationPlan(providerUserId) {
    const identityKey = telegramIdentityKey(providerUserId);
    if (!identityKey) return { status: 'TELEGRAM_IDENTITY_INVALID', claimantPlayerId: null, referrerPlayerId: null };
    const state = readState();
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const start = state.crewMissions.referralStarts[identityKey] || null;
    const claimant = playerForTelegramIdentity(state, providerUserId);
    if (!start) return { status: 'NO_REFERRAL', claimantPlayerId: claimant?.id || null, referrerPlayerId: null };
    if (Date.parse(start.expiresAt || 0) <= now()) return { status: 'REFERRAL_EXPIRED', claimantPlayerId: claimant?.id || null, referrerPlayerId: start.referrerPlayerId };
    if (!claimant) return { status: 'PET_AND_TELEGRAM_LINK_REQUIRED', claimantPlayerId: null, referrerPlayerId: start.referrerPlayerId };
    const existing = state.crewMissions.referralClaims[claimant.id];
    return {
      status: existing?.status || 'READY_FOR_ELIGIBILITY',
      claimantPlayerId: claimant.id,
      referrerPlayerId: start.referrerPlayerId,
      referralId: start.id,
    };
  }
  function referralWouldCycle(state, claimantId, referrerId) {
    let cursor = referrerId;
    const seen = new Set();
    while (cursor && !seen.has(cursor)) {
      if (cursor === claimantId) return true;
      seen.add(cursor);
      cursor = state.crewMissions.referralClaims[cursor]?.referrerPlayerId || null;
    }
    return false;
  }
  function referralEpochReceipt(state, claim, player, { role, amount, awardedAt }) {
    const reasonCode = role === 'SCOUT' ? 'WEB_REFERRAL_SCOUT' : 'WEB_REFERRAL_WELCOME';
    const id = `web-referral:${role.toLowerCase()}:${claim.id}:${player.id}`;
    const evidenceHash = `0x${crypto.createHash('sha256').update(JSON.stringify({
      schema: 'AXO_WEB_REFERRAL_EPOCH_XP_V1',
      referralId: claim.id,
      referralStartId: claim.referralId,
      role,
      playerId: player.id,
      petGenesisId: player.pet.genesisId,
      amount,
      activatedAt: claim.activatedAt,
    })).digest('hex')}`;
    const sourceHash = `0x${crypto.createHash('sha256').update(`web-referral:${claim.referralId}:${role}:${player.id}`).digest('hex')}`;
    return queueEpochLedgerReward(state, {
      id,
      player,
      amount,
      reasonCode,
      evidenceHash,
      sourceHash,
      recordedAt: awardedAt,
      attributedAt: claim.activatedAt,
      sourceId: claim.id,
    });
  }
  function maybeCreateReferralRewardSetup(state, claimantId) {
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const start = state.crewMissions.webReferralStarts[claimantId];
    if (!start || start.sourceChannel !== 'WEB' || Date.parse(start.expiresAt || 0) <= now()) return null;
    const milestone = state.crewMissions.communityReferralMilestones[start.id];
    if (!milestone || milestone.status !== 'COUNTED') return null;
    const claim = state.crewMissions.referralClaims[claimantId] || null;
    const existing = Object.values(state.crewMissions.referralRewardSetups)
      .find((item) => item?.referralStartId === start.id);
    if (existing) return existing;
    const purchase = Object.values(state.crewMissions.referralPurchases)
      .filter((item) => item.claimantPlayerId === claimantId && BigInt(item.amountOutRaw || '0') >= BigInt(REFERRAL_MINIMUM_PURCHASE_RAW))
      .sort((left, right) => Date.parse(left.confirmedAt || 0) - Date.parse(right.confirmedAt || 0))[0];
    if (!purchase) return null;
    const referrer = state.players[start.referrerPlayerId];
    const claimant = state.players[claimantId];
    if (!referrer || !claimant || referrer.id === claimant.id) return null;
    if (telegramMembershipView(claimant, now()).verified !== true) return null;
    const evidencePayload = {
      schema: 'AXO_WEB_REFERRAL_REWARD_EVIDENCE_V3',
      referralClaimId: claim?.id || null,
      referralStartId: start.id,
      referrerWallet: referrer.ownerAddress,
      referredWallet: claimant.ownerAddress,
      socialQualifiedAt: milestone.completedAt,
      xpActivatedAt: claim?.activatedAt || null,
      purchase: {
        transactionHash: purchase.transactionHash,
        blockNumber: purchase.blockNumber,
        blockHash: purchase.blockHash,
        confirmedAt: purchase.confirmedAt,
        chainId: purchase.chainId,
        tokenAddress: purchase.tokenAddress,
        poolId: purchase.poolId,
        routerAddress: purchase.routerAddress,
        amountInRaw: purchase.amountInRaw,
        minimumOutRaw: purchase.minimumOutRaw,
        amountOutRaw: purchase.amountOutRaw,
        verification: purchase.verification,
      },
      policy: {
        minimumPurchaseRaw: REFERRAL_MINIMUM_PURCHASE_RAW,
        rewardAmountRaw: configuredReferralRewardAmountRaw,
        qualification: 'PET_PLUS_PLATFORM_VERIFIED_X_AND_TELEGRAM_PLUS_VERIFIED_CHANNEL_MEMBERSHIP',
        oneRewardPerReferredWallet: true,
        serverBroadcasterEnabled: false,
      },
    };
    const setup = {
      id: crypto.randomUUID(),
      referralClaimId: claim?.id || null,
      referralStartId: start.id,
      onchainReferralId: `0x${crypto.createHash('sha256').update(`AXO_WEB_REFERRAL_REWARD_V3:${start.id}`).digest('hex')}`,
      evidenceHash: `0x${crypto.createHash('sha256').update(JSON.stringify(evidencePayload)).digest('hex')}`,
      referrerWallet: referrer.ownerAddress,
      referredWallet: claimant.ownerAddress,
      purchaseTxHash: purchase.transactionHash,
      purchasedAmountRaw: purchase.amountOutRaw,
      minimumPurchaseRaw: REFERRAL_MINIMUM_PURCHASE_RAW,
      rewardAmountRaw: configuredReferralRewardAmountRaw,
      status: 'VERIFIED_PENDING_CONTRACT_REGISTRATION',
      verifiedAt: purchase.confirmedAt,
      createdAt: new Date(now()).toISOString(),
      registrationTxHash: null,
      registeredAt: null,
      claimTxHash: null,
      claimedAt: null,
      contractAddress: null,
      valueMovementByHatchery: false,
    };
    state.crewMissions.referralRewardSetups[start.id] = setup;
    updateReferralPathReceipt(state, start, 'REWARD_SETUP_READY', setup.createdAt, {
      purchaseTransactionHash: setup.purchaseTxHash,
      rewardAmountRaw: setup.rewardAmountRaw,
    });
    purchase.qualifiesReferralReward = true;
    purchase.rewardSetupId = setup.id;
    purchase.rewardSetupStatus = setup.status;
    purchase.status = 'PURCHASE_VERIFIED_REWARD_SETUP_READY';
    recordEvent(state, 'CREW_WEB_REFERRAL_REWARD_SETUP_READY', referrer.id, {
      referralClaimId: claim?.id || null,
      referralStartId: start.id,
      onchainReferralId: setup.onchainReferralId,
      purchaseTxHash: setup.purchaseTxHash,
      purchasedAmountRaw: setup.purchasedAmountRaw,
      rewardAmountRaw: setup.rewardAmountRaw,
      controllerRegistrationRequired: true,
      serverBroadcasterEnabled: false,
    }, setup.createdAt);
    return setup;
  }
  function activateReferralStart(state, start, claimant, {
    claimantEligibility = {},
    referrerEligibility = {},
  } = {}) {
    const referrer = state.players[start.referrerPlayerId];
    if (!referrer) throw new Error('crew_referrer_unavailable');
    requireXpParticipation(claimant);
    requireXpParticipation(referrer);
    const sourceChannel = start.sourceChannel === 'WEB' ? 'WEB' : 'TELEGRAM';
    if (sourceChannel === 'WEB' && !hasCanonicalAxoCorroboration(state, claimant.id)) throw new Error('canonical_axo_corroboration_required');
    if (sourceChannel === 'WEB' && !hasCanonicalAxoCorroboration(state, referrer.id)) throw new Error('crew_referrer_canonical_axo_required');
    if (claimant.id === referrer.id || referralWouldCycle(state, claimant.id, referrer.id)) throw new Error('crew_referral_self_or_cycle');
    if (claimantEligibility?.eligible !== true) throw new Error('axo_holder_required');
    const claimedAt = new Date(now()).toISOString();
    let claim = state.crewMissions.referralClaims[claimant.id];
    if (claim && claim.referralId !== start.id) throw new Error('crew_referral_already_attributed');
    if (!claim) {
      claim = {
        id: crypto.randomUUID(),
        referralId: start.id,
        sourceChannel,
        claimantPlayerId: claimant.id,
        referrerPlayerId: referrer.id,
        status: 'ACTIVATED',
        activatedAt: claimedAt,
        claimantRewardStatus: 'PENDING',
        claimantEpochRewardStatus: sourceChannel === 'WEB' ? 'PENDING' : 'NOT_APPLICABLE',
        referrerRewardStatus: 'PENDING',
        referrerEpochRewardStatus: sourceChannel === 'WEB' ? 'PENDING' : 'NOT_APPLICABLE',
        eligibilityMode: eligibilityView(claimantEligibility).mode,
      };
      state.crewMissions.referralClaims[claimant.id] = claim;
      start.status = 'ACTIVATED';
      start.activatedAt = claimedAt;
      start.claimantPlayerId = claimant.id;
    }
    if (sourceChannel === 'WEB') updateReferralPathReceipt(state, start, 'XP_ACTIVATED', claimedAt);
    reserveReferralClaimant(state, start, claimant, claim);
    maybeRecordCommunityReferralOnboarding(state, claimant.ownerAddress);
    const claimantReward = addCrewXp(state, claimant, {
      category: 'REFERRAL_WELCOME',
      amount: REFERRAL_WELCOME_XP,
      sourceId: claim.id,
      metadata: { referralId: claim.id, sourceChannel, holderRequired: true },
      awardedAt: claimedAt,
    });
    if (claimantReward.awarded || claim.claimantRewardStatus === 'PENDING') claim.claimantRewardStatus = 'RELEASED';
    let claimantEpochXpAwarded = 0;
    if (sourceChannel === 'WEB' && claim.claimantEpochRewardStatus !== 'RELEASED') {
      referralEpochReceipt(state, claim, claimant, { role: 'WELCOME', amount: REFERRAL_WELCOME_XP, awardedAt: claimedAt });
      claim.claimantEpochRewardStatus = 'RELEASED';
      claimantEpochXpAwarded = REFERRAL_WELCOME_XP;
    }
    const week = isoWeek(now());
    const weeklyScoutRewards = weeklyReferralScoutRewards(state, referrer, week);
    const weeklyRewards = Object.keys(weeklyScoutRewards.claimIds).length;
    if (claim.referrerRewardStatus !== 'RELEASED') {
      if (referrerEligibility?.eligible !== true) {
        claim.referrerRewardStatus = 'HELD_HOLDER_REQUIRED';
      } else if (weeklyRewards >= REFERRAL_WEEKLY_REWARD_CAP) {
        claim.referrerRewardStatus = 'CAPPED_FOR_WEEK';
      } else {
        const referrerReward = addCrewXp(state, referrer, {
          category: 'REFERRAL_SCOUT',
          amount: REFERRAL_SCOUT_XP,
          sourceId: claim.id,
          metadata: { referralId: claim.id, sourceChannel, week, holderRequired: true },
          awardedAt: claimedAt,
        });
        if (referrerReward.awarded || referrerReward.entry) {
          claim.referrerRewardStatus = 'RELEASED';
          weeklyScoutRewards.claimIds[claim.id] = claimedAt;
          referrer.crew ||= {};
          referrer.crew.activatedReferrals = Number(referrer.crew.activatedReferrals || 0) + (referrerReward.awarded ? 1 : 0);
        }
      }
    }
    let referrerEpochXpAwarded = 0;
    if (sourceChannel === 'WEB' && claim.referrerRewardStatus === 'RELEASED' && claim.referrerEpochRewardStatus !== 'RELEASED') {
      referralEpochReceipt(state, claim, referrer, { role: 'SCOUT', amount: REFERRAL_SCOUT_XP, awardedAt: claimedAt });
      claim.referrerEpochRewardStatus = 'RELEASED';
      referrerEpochXpAwarded = REFERRAL_SCOUT_XP;
    }
    claim.status = claim.referrerRewardStatus === 'RELEASED' ? 'ACTIVATED' : 'ACTIVATED_PARTIAL_REWARD';
    if (sourceChannel === 'WEB') maybeCreateReferralRewardSetup(state, claimant.id);
    recordEvent(state, sourceChannel === 'WEB' ? 'CREW_WEB_REFERRAL_ACTIVATED' : 'CREW_REFERRAL_ACTIVATED', claimant.id, {
      referralId: claim.id,
      claimantXp: claimantReward.awarded ? REFERRAL_WELCOME_XP : 0,
      claimantEpochXp: claimantEpochXpAwarded,
      referrerEpochXp: referrerEpochXpAwarded,
      referrerRewardStatus: claim.referrerRewardStatus,
      holderGate: eligibilityView(claimantEligibility).mode,
      sourceChannel,
    }, claimedAt);
    return {
      status: claim.status,
      activated: true,
      claimantXpAwarded: claimantReward.awarded ? REFERRAL_WELCOME_XP : 0,
      referrerXpAwarded: claim.referrerRewardStatus === 'RELEASED' ? REFERRAL_SCOUT_XP : 0,
      claimantEpochXpAwarded,
      referrerEpochXpAwarded,
      referrerRewardStatus: claim.referrerRewardStatus,
      sourceChannel,
      affectsContributorTrust: false,
      affectsProductionRanking: false,
    };
  }
  function activateReferralForTelegramUser(providerUserId, {
    claimantEligibility = {},
    referrerEligibility = {},
  } = {}) {
    const identityKey = telegramIdentityKey(providerUserId);
    if (!identityKey) throw new Error('crew_referral_identity_invalid');
    const state = readState();
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const start = state.crewMissions.referralStarts[identityKey];
    if (!start) return { status: 'NO_REFERRAL', activated: false };
    if (Date.parse(start.expiresAt || 0) <= now()) throw new Error('crew_referral_expired');
    const claimant = playerForTelegramIdentity(state, providerUserId);
    if (!claimant) throw new Error('telegram_pet_link_required');
    start.sourceChannel ||= 'TELEGRAM';
    const result = activateReferralStart(state, start, claimant, { claimantEligibility, referrerEligibility });
    saveState(state);
    return result;
  }
  function activateWebReferral(address, {
    claimantEligibility = {},
    referrerEligibility = {},
  } = {}) {
    const owner = requireAddress(address);
    const state = readState();
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const start = state.crewMissions.webReferralStarts[owner];
    if (!start) return { status: 'NO_REFERRAL', activated: false };
    if (Date.parse(start.expiresAt || 0) <= now()) throw new Error('crew_referral_expired');
    const claimant = state.players[owner];
    if (!claimant) throw new Error('pet_not_hatched');
    start.sourceChannel = 'WEB';
    const result = activateReferralStart(state, start, claimant, { claimantEligibility, referrerEligibility });
    saveState(state);
    return result;
  }
  function referralOnboardingProjection(state, receipt) {
    if (!receipt?.id || receipt.sourceChannel !== 'WEB') return null;
    const referredWallet = normalizeAddress(receipt.referredWallet);
    const player = referredWallet ? state.players[referredWallet] || null : null;
    const onboarding = normalizeReferralPathOnboarding(receipt.onboarding);
    const identities = player?.social?.identities || onboarding.pendingSocialIdentities || {};
    const telegramHolder = player || {
      social: {
        identities,
        telegramMembership: onboarding.pendingTelegramMembership,
      },
    };
    const telegramMembership = telegramMembershipView(telegramHolder, now());
    const milestone = state.crewMissions.communityReferralMilestones[receipt.id] || null;
    const purchases = Object.values(state.crewMissions.referralPurchases)
      .filter((purchase) => purchase.referralId === receipt.id)
      .sort((left, right) => Date.parse(right.confirmedAt || 0) - Date.parse(left.confirmedAt || 0));
    const purchase = purchases.find((entry) => entry.qualifiesReferralReward === true) || purchases[0] || null;
    const setup = Object.values(state.crewMissions.referralRewardSetups)
      .find((entry) => entry.referralStartId === receipt.id) || null;
    const purchaseQualified = purchase?.qualifiesReferralReward === true;
    const purchaseSkipped = !purchaseQualified && onboarding.purchaseDecision === 'SKIPPED';
    const telegramIdentityConnected = identities.telegram?.verification === 'PLATFORM_VERIFIED';
    const xIdentityConnected = identities.x?.verification === 'PLATFORM_VERIFIED';
    const stageDefinitions = [
      ['wallet', true, receipt.startedAt],
      ['telegramChannel', Boolean(onboarding.telegramJoinOpenedAt || telegramMembership.verified), onboarding.telegramJoinOpenedAt || telegramMembership.checkedAt],
      ['telegram', telegramIdentityConnected && telegramMembership.verified === true, identities.telegram?.linkedAt || onboarding.telegramConnectedAt],
      ['x', xIdentityConnected, identities.x?.linkedAt || onboarding.xConnectedAt],
      ['pet', Boolean(player), player?.createdAt || onboarding.petHatchedAt],
      ['rewardChoice', purchaseQualified || purchaseSkipped, purchase?.confirmedAt || onboarding.purchaseSkippedAt],
    ];
    const stages = Object.fromEntries(stageDefinitions.map(([key, complete, completedAt]) => [key, {
      complete: Boolean(complete),
      completedAt: complete && Number.isFinite(Date.parse(completedAt || '')) ? new Date(Date.parse(completedAt)).toISOString() : null,
    }]));
    const completedSteps = stageDefinitions.filter(([, complete]) => complete).length;
    const currentStep = stageDefinitions.find(([, complete]) => !complete)?.[0] || 'done';
    const timestamps = [receipt.startedAt, receipt.updatedAt, milestone?.completedAt, purchase?.confirmedAt, setup?.createdAt,
      ...stageDefinitions.map(([, , completedAt]) => completedAt)].map((value) => Date.parse(value || '')).filter(Number.isFinite);
    return {
      version: 1,
      stages,
      currentStep,
      completedSteps,
      totalSteps: stageDefinitions.length,
      progressPct: Math.round((completedSteps / stageDefinitions.length) * 100),
      socialQualified: milestone?.status === 'COUNTED',
      socialQualifiedAt: milestone?.completedAt || receipt.qualifiedAt || null,
      telegramIdentityConnected,
      telegramMembershipVerified: telegramMembership.verified === true,
      xIdentityConnected,
      xpActivated: Boolean(receipt.activatedAt),
      purchaseDecision: purchaseQualified ? 'PURCHASED' : purchaseSkipped ? 'SKIPPED' : 'PENDING',
      purchaseQualified,
      purchaseSkipped,
      rewardSetupStatus: setup?.status || null,
      complete: currentStep === 'done',
      completedAt: currentStep === 'done' ? purchase?.confirmedAt || onboarding.completedAt || onboarding.purchaseSkippedAt : null,
      lastProgressAt: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : receipt.startedAt || null,
    };
  }
  function recordWebReferralOnboardingAction(address, actionInput) {
    const owner = requireAddress(address);
    const action = safeText(actionInput, 40).toUpperCase();
    const state = readState();
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const start = activeWebReferralStart(state, owner);
    if (!start) throw new Error('crew_web_referral_required');
    const receipt = ensureReferralPathReceipt(state, start);
    const at = new Date(now()).toISOString();
    if (action === 'TELEGRAM_JOIN_OPENED') {
      const event = appendReferralOnboardingEvent(state, start, action, at);
      event.onboarding.telegramJoinOpenedAt ||= at;
    } else if (action === 'PURCHASE_SKIPPED') {
      const progress = referralOnboardingProjection(state, receipt);
      if (!progress?.socialQualified || progress.telegramMembershipVerified !== true) throw new Error('referral_core_onboarding_required');
      if (progress.purchaseQualified) throw new Error('referral_purchase_already_qualified');
      const event = appendReferralOnboardingEvent(state, start, action, at);
      event.onboarding.purchaseDecision = 'SKIPPED';
      event.onboarding.purchaseSkippedAt ||= at;
      event.onboarding.completedAt ||= at;
    } else if (action === 'PURCHASE_REOPENED') {
      const progress = referralOnboardingProjection(state, receipt);
      if (progress?.purchaseQualified) throw new Error('referral_purchase_already_qualified');
      const event = appendReferralOnboardingEvent(state, start, action, at);
      event.onboarding.purchaseDecision = 'PENDING';
      event.onboarding.purchaseSkippedAt = null;
      event.onboarding.completedAt = null;
    } else {
      throw new Error('referral_onboarding_action_invalid');
    }
    recordEvent(state, 'CREW_WEB_REFERRAL_ONBOARDING_ACTION', owner, {
      referralStartId: start.id,
      action,
      affectsContributorTrust: false,
      affectsProductionRanking: false,
    }, at);
    saveState(state);
    return webReferralView(owner);
  }
  function webReferralView(address) {
    const owner = requireAddress(address);
    const state = readState();
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const referralContest = publicReferralContest(state);
    const player = state.players[owner] || null;
    const ownCode = referralCodeValue(player?.crew?.referralCode);
    const inbound = state.crewMissions.webReferralStarts[owner] || null;
    const inboundClaim = state.crewMissions.referralClaims[owner] || null;
    const referredClaims = player
      ? Object.values(state.crewMissions.referralClaims).filter((claim) => claim.referrerPlayerId === owner && claim.sourceChannel === 'WEB')
      : [];
    const purchases = Object.values(state.crewMissions.referralPurchases)
      .filter((purchase) => purchase.claimantPlayerId === owner || purchase.referrerPlayerId === owner)
      .sort((left, right) => Date.parse(right.confirmedAt || 0) - Date.parse(left.confirmedAt || 0) || Number(right.blockNumber || 0) - Number(left.blockNumber || 0));
    const inboundPurchase = purchases.find((purchase) => purchase.claimantPlayerId === owner && purchase.qualifiesReferralReward === true)
      || purchases.find((purchase) => purchase.claimantPlayerId === owner)
      || null;
    const rewardSetups = Object.values(state.crewMissions.referralRewardSetups)
      .filter((setup) => setup.referrerWallet === owner || setup.referredWallet === owner)
      .sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0));
    const ownRewardSetups = rewardSetups.filter((setup) => setup.referrerWallet === owner);
    const inboundRewardSetup = rewardSetups.find((setup) => setup.referredWallet === owner) || null;
    const communityNetwork = player
      ? communityReferralNetwork(state, owner)
      : { level1: [], level2: [], level3: [], total: 0 };
    const communityOnboarded = communityNetwork.level1.length;
    const directReferrals = player ? Object.values(state.crewMissions.referralPathReceipts)
      .filter((receipt) => receipt?.sourceChannel === 'WEB' && receipt.referrerWallet === owner && normalizeAddress(receipt.referredWallet))
      .sort((left, right) => Date.parse(right.updatedAt || right.startedAt || 0) - Date.parse(left.updatedAt || left.startedAt || 0))
      .slice(0, 100)
      .map((receipt) => {
        const referredWallet = normalizeAddress(receipt.referredWallet);
        const referredPlayer = referredWallet ? state.players[referredWallet] : null;
        const onboardingProgress = referralOnboardingProjection(state, receipt);
        const milestone = state.crewMissions.communityReferralMilestones[receipt.id] || null;
        const contestEvidence = milestone?.status === 'COUNTED'
          && referralContest.id
          && Date.parse(milestone.completedAt || '') >= Date.parse(referralContest.startsAt)
          && Date.parse(milestone.completedAt || '') < Date.parse(referralContest.endsAt)
          ? referralContestContribution(state, milestone, referralContest)
          : null;
        const referralPurchases = Object.values(state.crewMissions.referralPurchases)
          .filter((purchase) => purchase.referralId === receipt.id)
          .sort((left, right) => Date.parse(right.confirmedAt || 0) - Date.parse(left.confirmedAt || 0));
        const purchase = referralPurchases.find((entry) => entry.qualifiesReferralReward === true) || referralPurchases[0] || null;
        const setup = Object.values(state.crewMissions.referralRewardSetups)
          .find((entry) => entry.referralStartId === receipt.id) || null;
        return {
          referralStartId: receipt.id,
          referredWallet,
          startedAt: receipt.startedAt,
          expiresAt: receipt.expiresAt,
          status: receipt.status,
          petCreated: Boolean(referredPlayer),
          pet: referredPlayer ? {
            name: safeText(referredPlayer.pet?.name, 40) || 'AXO Pet',
            lineage: lineageDefinition(referredPlayer.pet?.lineageId).label,
            level: currentLevel(referredPlayer.pet?.xp || 0),
          } : null,
          xConnected: onboardingProgress?.stages?.x?.complete === true,
          telegramConnected: onboardingProgress?.stages?.telegram?.complete === true,
          telegramMember: onboardingProgress?.telegramMembershipVerified === true,
          socialQualified: milestone?.status === 'COUNTED',
          socialQualifiedAt: milestone?.completedAt || receipt.qualifiedAt || null,
          contestQualified: Boolean(contestEvidence),
          contestScore: contestEvidence?.score || 0,
          contestEngagementXp: contestEvidence?.engagementXp || 0,
          contestEligibleEngagementXpEarned: contestEvidence?.eligibleXpEarned || 0,
          contestMultiplierBps: contestEvidence?.multiplierBps || 10_000,
          purchaseQualified: purchase?.qualifiesReferralReward === true,
          purchaseSkipped: onboardingProgress?.purchaseSkipped === true,
          purchasedAmountRaw: purchase?.amountOutRaw || '0',
          purchaseAt: purchase?.confirmedAt || null,
          rewardSetupStatus: setup?.status || null,
          rewardAmountRaw: setup?.rewardAmountRaw || '0',
          xpActivated: onboardingProgress?.xpActivated === true,
          onboarding: onboardingProgress,
        };
      }) : [];
    const rawSum = (rows, field) => rows.reduce((total, row) => total + BigInt(row[field] || '0'), 0n).toString();
    return {
      wallet: owner,
      hatched: Boolean(player),
      own: player ? {
        code: ownCode,
        path: ownCode ? `/join/${ownCode}` : null,
        communityOnboarded,
        communityNetwork: {
          level1: communityNetwork.level1.length,
          level2: 0,
          level3: 0,
          total: communityNetwork.total,
        },
        achievedReferrals: directReferrals.filter((entry) => entry.socialQualified).length,
        contest: referralContest,
        contestQualifiedReferrals: directReferrals.filter((entry) => entry.contestQualified).length,
        contestScore: directReferrals.reduce((total, entry) => total + Number(entry.contestScore || 0), 0),
        contestEngagementXp: directReferrals.reduce((total, entry) => total + Number(entry.contestEngagementXp || 0), 0),
        directReferrals,
        activated: referredClaims.length,
        rewarded: referredClaims.filter((claim) => claim.referrerRewardStatus === 'RELEASED').length,
        purchaseReceipts: purchases.filter((purchase) => purchase.referrerPlayerId === owner).length,
        qualifyingBuyers: ownRewardSetups.length,
        rewardSetupsPending: ownRewardSetups.filter((setup) => setup.status === 'VERIFIED_PENDING_CONTRACT_REGISTRATION').length,
        rewardSetupsRegistered: ownRewardSetups.filter((setup) => ['REGISTERED_ONCHAIN', 'CLAIMED_ONCHAIN'].includes(setup.status)).length,
        rewardClaimsCompleted: ownRewardSetups.filter((setup) => setup.status === 'CLAIMED_ONCHAIN').length,
        rewardAmountAllocatedRaw: rawSum(ownRewardSetups, 'rewardAmountRaw'),
        weeklyRewardCap: REFERRAL_WEEKLY_REWARD_CAP,
      } : null,
      inbound: inbound ? {
        path: `/join/${inbound.referralCode}`,
        onboarding: referralOnboardingProjection(state, ensureReferralPathReceipt(state, inbound)),
        status: inboundClaim?.status || inbound.status,
        startedAt: inbound.startedAt,
        expiresAt: inbound.expiresAt,
        activatedAt: inbound.activatedAt,
        firstTouchLocked: true,
        claim: inboundClaim ? {
          claimantPetXp: inboundClaim.claimantRewardStatus,
          claimantEpochXp: inboundClaim.claimantEpochRewardStatus,
          referrerPetXp: inboundClaim.referrerRewardStatus,
          referrerEpochXp: inboundClaim.referrerEpochRewardStatus,
        } : null,
        purchase: inboundPurchase ? {
          status: inboundPurchase.status,
          transactionHash: inboundPurchase.transactionHash,
          amountInRaw: inboundPurchase.amountInRaw,
          amountOutRaw: inboundPurchase.amountOutRaw,
          qualifiesReferralReward: inboundPurchase.qualifiesReferralReward === true,
          minimumPurchaseRaw: REFERRAL_MINIMUM_PURCHASE_RAW,
          blockNumber: inboundPurchase.blockNumber,
          confirmedAt: inboundPurchase.confirmedAt,
        } : null,
        rewardSetup: inboundRewardSetup ? {
          status: inboundRewardSetup.status,
          purchasedAmountRaw: inboundRewardSetup.purchasedAmountRaw,
          rewardAmountRaw: inboundRewardSetup.rewardAmountRaw,
          rewardRecipient: inboundRewardSetup.referrerWallet,
          createdAt: inboundRewardSetup.createdAt,
        } : null,
      } : null,
      rewards: {
        welcomePetXp: REFERRAL_WELCOME_XP,
        welcomeEpochXp: REFERRAL_WELCOME_XP,
        scoutPetXp: REFERRAL_SCOUT_XP,
        scoutEpochXp: REFERRAL_SCOUT_XP,
      },
      axoPurchaseReward: {
        status: 'REFERRAL_REWARD_CONTRACT_NOT_DEPLOYED',
        contractAddress: null,
        minimumPurchaseRaw: REFERRAL_MINIMUM_PURCHASE_RAW,
        amountRaw: configuredReferralRewardAmountRaw,
        rewardRecipient: 'REFERRER_WALLET',
        qualifyingBuyers: ownRewardSetups.length,
        allocatedAmountRaw: rawSum(ownRewardSetups, 'rewardAmountRaw'),
        claimedAmountRaw: rawSum(ownRewardSetups.filter((setup) => setup.status === 'CLAIMED_ONCHAIN'), 'rewardAmountRaw'),
        claimable: false,
        claimUrl: null,
        purchaseReceiptsPreserved: true,
      },
      policy: {
        newWalletOnly: true,
        firstTouchLocked: true,
        activationWindowDays: Math.floor(REFERRAL_START_TTL_MS / 86_400_000),
        crewPassportRequired: true,
        canonicalAxoCorroborationRequired: Boolean(canonicalAxoAddress),
        currentAxoEligibilityRequired: false,
        selfReferral: false,
        cycleProtection: true,
        externalEngagementRequired: false,
        socialXpAffectsContributorTrust: false,
        socialXpAffectsProductionRanking: false,
      },
    };
  }
  function referralRewardSetupRows(address = null) {
    const owner = address ? requireAddress(address) : null;
    const state = readState();
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    return Object.values(state.crewMissions.referralRewardSetups)
      .filter((setup) => !owner || setup.referrerWallet === owner || setup.referredWallet === owner)
      .sort((left, right) => Date.parse(left.createdAt || 0) - Date.parse(right.createdAt || 0))
      .map((setup) => {
        const purchase = state.crewMissions.referralPurchases[setup.purchaseTxHash] || null;
        return {
          ...setup,
          purchaseEvidence: purchase ? {
            transactionHash: purchase.transactionHash,
            chainId: purchase.chainId,
            tokenAddress: purchase.tokenAddress,
            poolId: purchase.poolId,
            routerAddress: purchase.routerAddress,
            amountInRaw: purchase.amountInRaw,
            minimumOutRaw: purchase.minimumOutRaw,
            amountOutRaw: purchase.amountOutRaw,
            blockNumber: purchase.blockNumber,
            blockHash: purchase.blockHash,
            confirmedAt: purchase.confirmedAt,
            verification: purchase.verification,
          } : null,
        };
      });
  }
  function markReferralRewardRegistered(onchainReferralId, registration = {}) {
    const referralId = String(onchainReferralId || '').toLowerCase();
    const registrationTxHash = String(registration.transactionHash || '').toLowerCase();
    const contractAddress = normalizeAddress(registration.contractAddress);
    const blockNumber = Number(registration.blockNumber);
    const blockHash = String(registration.blockHash || '').toLowerCase();
    const qualifiedAt = String(registration.qualifiedAt || '');
    const claimableAt = String(registration.claimableAt || '');
    if (!/^0x[0-9a-f]{64}$/.test(referralId)
      || !/^0x[0-9a-f]{64}$/.test(registrationTxHash)
      || !contractAddress
      || !Number.isSafeInteger(blockNumber) || blockNumber <= 0
      || !/^0x[0-9a-f]{64}$/.test(blockHash)
      || !Number.isFinite(Date.parse(qualifiedAt))
      || !Number.isFinite(Date.parse(claimableAt))
      || Date.parse(claimableAt) <= Date.parse(qualifiedAt)) throw new Error('referral_reward_registration_receipt_invalid');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const state = readState();
      state.crewMissions = normalizeCrewMissions(state.crewMissions);
      const setup = Object.values(state.crewMissions.referralRewardSetups)
        .find((row) => String(row.onchainReferralId || '').toLowerCase() === referralId);
      if (!setup) throw new Error('referral_reward_setup_not_found');
      if (['REGISTERED_ONCHAIN', 'CLAIMED_ONCHAIN'].includes(setup.status)) {
        if (setup.registrationTxHash !== registrationTxHash
          || setup.contractAddress !== contractAddress
          || Number(setup.registrationBlockNumber) !== blockNumber
          || setup.registrationBlockHash !== blockHash) throw new Error('referral_reward_registration_receipt_mismatch');
        return { ...setup };
      }
      if (setup.status !== 'VERIFIED_PENDING_CONTRACT_REGISTRATION') throw new Error('referral_reward_setup_not_pending');
      setup.status = 'REGISTERED_ONCHAIN';
      setup.registrationTxHash = registrationTxHash;
      setup.registeredAt = qualifiedAt;
      setup.claimableAt = claimableAt;
      setup.registrationBlockNumber = blockNumber;
      setup.registrationBlockHash = blockHash;
      setup.contractAddress = contractAddress;
      setup.valueMovementByHatchery = false;
      const referralStart = Object.values(state.crewMissions.webReferralStarts)
        .find((row) => row.id === setup.referralStartId);
      if (referralStart) updateReferralPathReceipt(state, referralStart, 'REGISTERED_ONCHAIN', qualifiedAt, {
        transactionHash: registrationTxHash,
        contractAddress,
        claimableAt,
      });
      const purchase = state.crewMissions.referralPurchases[setup.purchaseTxHash];
      if (!purchase || purchase.rewardSetupId !== setup.id) throw new Error('referral_reward_purchase_link_mismatch');
      purchase.status = 'PURCHASE_VERIFIED_REWARD_REGISTERED';
      purchase.rewardSetupStatus = setup.status;
      purchase.referralRewardContractStatus = 'REGISTERED_ONCHAIN';
      recordEvent(state, 'CREW_WEB_REFERRAL_REWARD_REGISTERED', setup.referrerWallet, {
        onchainReferralId: referralId,
        transactionHash: registrationTxHash,
        blockNumber,
        contractAddress,
        purchasedAmountRaw: setup.purchasedAmountRaw,
        rewardAmountRaw: setup.rewardAmountRaw,
        claimableAt,
        claimsBroadcastByHatchery: false,
      }, qualifiedAt);
      try {
        saveState(state);
        return { ...setup };
      } catch (error) {
        if (error.message !== 'hatchery_state_conflict' || attempt === 2) throw error;
      }
    }
    throw new Error('hatchery_state_conflict');
  }
  function recordWebReferralPurchase(address, receipt = {}) {
    if (!referralPurchaseConfigured) throw new Error('current_axo_referral_rewards_disabled');
    const owner = requireAddress(address);
    const transactionHash = String(receipt.transactionHash || '').toLowerCase();
    const amountInRaw = String(receipt.amountInRaw || '');
    const minimumOutRaw = String(receipt.minimumOutRaw || '');
    const amountOutRaw = String(receipt.amountOutRaw || '');
    const blockNumber = Number(receipt.blockNumber);
    if (!/^0x[0-9a-f]{64}$/.test(transactionHash)
      || !/^\d+$/.test(amountInRaw) || BigInt(amountInRaw) <= 0n
      || !/^\d+$/.test(minimumOutRaw) || BigInt(minimumOutRaw) <= 0n
      || !/^\d+$/.test(amountOutRaw) || BigInt(amountOutRaw) <= 0n
      || BigInt(amountOutRaw) < BigInt(minimumOutRaw)
      || !Number.isSafeInteger(blockNumber) || blockNumber <= 0) throw new Error('crew_referral_purchase_receipt_invalid');
    if (Number(receipt.chainId) !== 4663
      || normalizeAddress(receipt.tokenAddress) !== referralPurchaseToken
      || String(receipt.poolId || '').toLowerCase() !== referralPurchasePoolId
      || normalizeAddress(receipt.routerAddress) !== referralPurchaseRouter
      || !/^0x[0-9a-f]{64}$/.test(String(receipt.blockHash || '').toLowerCase())) throw new Error('crew_referral_purchase_route_mismatch');
    const state = readState();
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const existing = state.crewMissions.referralPurchases[transactionHash];
    if (existing) {
      if (existing.claimantPlayerId !== owner) throw new Error('crew_referral_purchase_already_used');
      return webReferralView(owner);
    }
    const start = state.crewMissions.webReferralStarts[owner];
    if (!start) throw new Error('crew_web_referral_required');
    if (Date.parse(start.expiresAt || 0) <= now()) throw new Error('crew_referral_expired');
    const referrer = state.players[start.referrerPlayerId];
    if (!referrer) throw new Error('crew_referrer_unavailable');
    const confirmedAt = receipt.confirmedAt || new Date(now()).toISOString();
    const confirmedAtMs = Date.parse(confirmedAt);
    if (!Number.isFinite(confirmedAtMs)
      || confirmedAtMs < Date.parse(start.startedAt || 0)
      || confirmedAtMs > Date.parse(start.expiresAt || 0)) throw new Error('crew_referral_purchase_outside_attribution_window');
    const qualifiesReferralReward = BigInt(amountOutRaw) >= BigInt(REFERRAL_MINIMUM_PURCHASE_RAW);
    const purchase = {
      id: crypto.randomUUID(),
      referralId: start.id,
      claimantPlayerId: owner,
      referrerPlayerId: referrer.id,
      transactionHash,
      chainId: Number(receipt.chainId),
      tokenAddress: normalizeAddress(receipt.tokenAddress),
      poolId: String(receipt.poolId || '').toLowerCase(),
      routerAddress: normalizeAddress(receipt.routerAddress),
      amountInRaw,
      minimumOutRaw,
      amountOutRaw,
      blockNumber,
      blockHash: String(receipt.blockHash || '').toLowerCase(),
      confirmedAt,
      verification: 'SERVER_RPC_EXACT_CURRENT_AXO_V4_RECEIPT',
      status: qualifiesReferralReward ? 'PURCHASE_VERIFIED_ONBOARDING_REQUIRED' : 'PURCHASE_VERIFIED_BELOW_REWARD_THRESHOLD',
      qualifiesReferralReward,
      referralRewardMinimumPurchaseRaw: REFERRAL_MINIMUM_PURCHASE_RAW,
      referralRewardAmountRaw: qualifiesReferralReward ? configuredReferralRewardAmountRaw : '0',
      referralRewardContractStatus: 'VERIFIED_CURRENT_AXO_V4',
      claimableAmountRaw: '0',
      rewardSetupId: null,
      rewardSetupStatus: qualifiesReferralReward ? 'PENDING_ONBOARDING' : 'NOT_QUALIFIED',
    };
    state.crewMissions.referralPurchases[transactionHash] = purchase;
    updateReferralPathReceipt(state, start, qualifiesReferralReward ? 'PURCHASE_QUALIFIED_1M' : 'PURCHASE_BELOW_1M', confirmedAt, {
      transactionHash,
      amountOutRaw,
      qualifiesReferralReward,
    });
    if (qualifiesReferralReward) {
      const path = ensureReferralPathReceipt(state, start);
      path.onboarding = normalizeReferralPathOnboarding(path.onboarding);
      path.onboarding.purchaseDecision = 'PURCHASED';
      path.onboarding.completedAt ||= confirmedAt;
      appendReferralOnboardingEvent(state, start, 'PURCHASE_SELECTED', confirmedAt);
    }
    const rewardSetup = qualifiesReferralReward ? maybeCreateReferralRewardSetup(state, owner) : null;
    recordEvent(state, 'CREW_WEB_REFERRAL_AXO_PURCHASE_VERIFIED', owner, {
      referralId: start.id,
      transactionHash,
      blockNumber,
      amountInRaw,
      amountOutRaw,
      qualifiesReferralReward,
      referralRewardMinimumPurchaseRaw: REFERRAL_MINIMUM_PURCHASE_RAW,
      referralRewardAmountRaw: qualifiesReferralReward ? configuredReferralRewardAmountRaw : '0',
      referralRewardSetupStatus: rewardSetup?.status || purchase.rewardSetupStatus,
      referralRewardContractStatus: 'VERIFIED_CURRENT_AXO_V4',
      valueMovementByHatchery: false,
    }, confirmedAt);
    saveState(state);
    return webReferralView(owner);
  }
  function crewMissionSnapshotForTelegramUser(providerUserId, eligibility = {}) {
    const state = readState();
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const player = playerForTelegramIdentity(state, providerUserId);
    const gate = eligibilityView(eligibility);
    const gameplayAllowed = Boolean(player) && player.moderation?.status !== 'SUSPENDED';
    const currentMs = now();
    const activeRaids = Object.values(state.crewMissions.raids)
      .map((raid) => crewRaidView(state, raid, player?.id || null, currentMs))
      .filter((raid) => raid.accepting || raid.completedByPlayer || raid.creator.createdByCurrentPlayer)
      .map((raid) => ({ ...raid, accepting: raid.accepting && gameplayAllowed && gate.eligible }))
      .sort((a, b) => Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE') || Date.parse(a.endsAt) - Date.parse(b.endsAt));
    if (!player) {
      return {
        linked: false,
        holderGate: gate,
        access: { missions: false, referrals: false, raids: false, createRaids: false, missing: ['wallet_pet', 'telegram_link', ...(gate.eligible ? [] : ['axo_holder'])] },
        pet: null,
        referral: null,
        raids: activeRaids.slice(0, 3),
        xpLedger: [],
        policy: { holderRequired: true, eligibilityAdapter: 'CREW_ELIGIBILITY_V1', stakingMigrationReady: true },
      };
    }
    const x = player.social?.identities?.x;
    const xVerified = x?.verification === 'PLATFORM_VERIFIED';
    const level = currentLevel(player.pet.xp);
    const next = nextLevel(player.pet.xp);
    const referralClaims = Object.values(state.crewMissions.referralClaims).filter((claim) => claim.referrerPlayerId === player.id);
    const ledger = state.crewMissions.xpLedger.filter((entry) => entry.playerId === player.id).slice(-8).reverse();
    const alphaBoard = buildAlphaDashboard({
      state,
      nowMs: currentMs,
      epochLimit: 2,
      projects: crewProjectViews(state, null, currentMs),
      playerView: alphaPlayerView,
      protocolStore: repository.protocol,
      protocolConfig,
    });
    const alphaStanding = alphaBoard.currentEpoch.standings.find((entry) => entry.genesisId === player.pet.genesisId) || null;
    const alphaClaims = repository.protocol.claimableForAccount(player.ownerAddress, 8);
    const alphaClaim = alphaClaims.find((entry) => entry.claimable) || null;
    return {
      linked: true,
      holderGate: gate,
      access: {
        missions: gameplayAllowed && gate.eligible,
        referrals: gameplayAllowed && gate.eligible,
        raids: gameplayAllowed && gate.eligible,
        createRaids: gameplayAllowed && gate.eligible && xVerified,
        missing: [gameplayAllowed ? null : 'account_suspended', gate.eligible ? null : 'axo_holder', xVerified ? null : 'x_identity'].filter(Boolean),
      },
      pet: {
        name: player.pet.name,
        genesisId: player.pet.genesisId,
        level,
        stage: currentStage(player.pet.xp).name,
        xp: Number(player.pet.xp || 0),
        nextLevelXp: next?.xp ?? null,
        happiness: Number(player.pet.vitals?.happiness || 0),
        energy: Number(player.pet.vitals?.energy || 0),
        bond: Number(player.pet.vitals?.bond || 0),
      },
      referral: {
        codeReady: Boolean(referralCodeValue(player.crew?.referralCode)),
        activated: referralClaims.length,
        rewarded: referralClaims.filter((claim) => claim.referrerRewardStatus === 'RELEASED').length,
        weeklyRewardCap: REFERRAL_WEEKLY_REWARD_CAP,
        welcomeXp: REFERRAL_WELCOME_XP,
        scoutXp: REFERRAL_SCOUT_XP,
      },
      raids: activeRaids.slice(0, 5),
      xpLedger: ledger,
      alphaMining: {
        epochId: alphaBoard.currentEpoch.id,
        provisionalVerifiedXp: Number(alphaStanding?.verifiedXp || 0),
        provisionalRank: alphaStanding?.rank || null,
        indexedFinalizedEvents: Number(alphaBoard.protocol?.implementation?.integration?.indexedEvents || 0),
        claimable: alphaClaim ? {
          epochId: alphaClaim.displayEpochId,
          chainEpochId: alphaClaim.epochId,
          amountRaw: alphaClaim.amount,
          rewardToken: alphaClaim.rewardToken,
          claimDeadline: alphaClaim.claimDeadline,
        } : null,
        dashboardUrl: '/hatchery?play=1&panel=dashboard',
        claimSurface: 'WALLET_ONLY_WEB',
      },
      policy: {
        holderRequired: true,
        verifiedTelegramRequired: true,
        verifiedXRequiredForCreation: true,
        raidRewardBasis: 'ORIGINAL_TELEGRAM_RESEARCH',
        xEngagementTracked: false,
        xEngagementRewarded: false,
        referralFirstTouchLocked: true,
        socialXpAffectsContributorTrust: false,
        socialXpAffectsProductionRanking: false,
        eligibilityAdapter: 'CREW_ELIGIBILITY_V1',
        stakingMigrationReady: true,
      },
    };
  }
  function crewInviteForTelegramUser(providerUserId, eligibility = {}, botUsername = 'AxoAIbot') {
    if (eligibility?.eligible !== true) throw new Error('axo_holder_required');
    const owner = ownerForVerifiedSocialIdentity('telegram', providerUserId);
    if (!owner) throw new Error('telegram_pet_link_required');
    const username = safeText(botUsername, 40).replace(/^@/, '');
    if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) throw new Error('telegram_bot_username_invalid');
    const referral = ensureReferralCode(owner);
    const link = `https://t.me/${username}?start=ref_${referral.code}`;
    return {
      ...referral,
      link,
      shareUrl: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Hatch a wallet-bound AXO, hold AXO, and join the next Crew mission.')}`,
      policy: {
        rewardAfter: 'WALLET_PET_TELEGRAM_AND_CURRENT_AXO_HOLDER',
        selfReferral: false,
        firstTouchLocked: true,
        weeklyRewardCap: REFERRAL_WEEKLY_REWARD_CAP,
        stakingMigrationReady: true,
      },
    };
  }
  function createCrewRaid(adminAddress, input = {}) {
    const state = readState();
    const staff = requireStaff(state, adminAddress, true);
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const target = normalizeAxoRaidTarget(input.targetUrl);
    if (!target) throw new Error('crew_raid_axo_owned_target_required');
    const existing = state.crewMissions.raids[`AXO-RAID-${target.postId}`];
    if (existing) return crewRaidView(state, existing, null, now());
    const currentMs = now();
    const startsAtMs = input.startsAt ? Date.parse(input.startsAt) : currentMs;
    const endsAtMs = input.endsAt ? Date.parse(input.endsAt) : startsAtMs + 24 * 60 * 60_000;
    if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs)
      || endsAtMs - startsAtMs < RAID_MIN_DURATION_MS
      || endsAtMs - startsAtMs > RAID_MAX_DURATION_MS) throw new Error('crew_raid_duration_invalid');
    const title = safeText(input.title || 'AXO Crew Raid', 80);
    const mission = safeText(input.mission || 'Read the target and submit one original observation in Telegram: what is useful, unproven, or worth checking next?', 240);
    if (title.length < 3 || mission.length < 12) throw new Error('crew_raid_copy_invalid');
    const goal = Math.max(3, Math.min(100, Math.floor(Number(input.goal || 20))));
    const rewardXp = Math.max(1, Math.min(10, Math.floor(Number(input.rewardXp || RAID_DEFAULT_XP))));
    const createdAt = new Date(currentMs).toISOString();
    const id = `AXO-RAID-${target.postId}`;
    const raid = {
      id,
      kind: 'AXO_OWNED',
      claimMode: 'TELEGRAM_CONTRIBUTION',
      title,
      mission,
      targetUrl: target.url,
      targetPostId: target.postId,
      startsAt: new Date(startsAtMs).toISOString(),
      endsAt: new Date(endsAtMs).toISOString(),
      goal,
      rewardXp,
      creatorRewardXp: 0,
      creatorRewardMinimumCompletions: 0,
      creatorRewardStatus: 'NOT_APPLICABLE',
      status: 'ACTIVE',
      cooperativeItem: {
        id: `crew_crystal_${target.postId}`,
        name: input.itemName ? safeText(input.itemName, 60) : 'Crew Raid Crystal',
        rarity: 'CREW RAID',
        slot: 'charm',
        bonus: {},
      },
      createdAt,
      createdBy: staff.owner,
      createdByPlayerId: null,
      creatorPet: null,
      publication: { status: 'OPERATOR', chatId: null, messageId: null, url: null, publishedAt: createdAt },
      policyVersion: 2,
      cancelledAt: null,
    };
    state.crewMissions.raids[id] = raid;
    recordEvent(state, 'CREW_RAID_CREATED', staff.owner, {
      raidId: id,
      targetPostId: target.postId,
      goal,
      rewardXp,
      holderRequired: true,
    }, createdAt);
    saveState(state);
    return crewRaidView(state, raid, null, currentMs);
  }
  function createCommunityCrewRaidForTelegramUser(providerUserId, input = {}, verification = {}, eligibility = {}) {
    if (eligibility?.eligible !== true) throw new Error('axo_holder_required');
    const state = readState();
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const creator = playerForTelegramIdentity(state, providerUserId);
    if (!creator) throw new Error('telegram_pet_link_required');
    requireGameplayAccess(creator);
    const x = creator.social?.identities?.x;
    if (x?.verification !== 'PLATFORM_VERIFIED') throw new Error('x_identity_required');
    const target = normalizeCommunityRaidTarget(input.targetUrl);
    if (!target) throw new Error('x_status_url_required');
    const verifiedAuthor = /^\d{1,24}$/.test(String(verification?.authorId || ''))
      ? `id:${verification.authorId}`
      : /^[A-Za-z0-9_]{1,15}$/.test(String(verification?.authorHandle || ''))
        ? `handle:${String(verification.authorHandle).toLowerCase()}`
        : null;
    if (verification?.platformVerified !== true
      || verification?.contentRule !== 'AXO_REFERENCE_PRESENT'
      || String(verification?.providerPostId) !== target.postId
      || !verifiedAuthor
      || !/^[0-9a-f]{64}$/.test(String(verification?.normalizedContentHash || ''))) {
      throw new Error('crew_raid_target_unverified');
    }
    const existing = Object.values(state.crewMissions.raids).find((raid) => String(raid.targetPostId) === target.postId);
    const existingClaims = existing
      ? Object.values(state.crewMissions.raidClaims).filter((claim) => claim.raidId === existing.id).length
      : 0;
    const reusableFailedPublication = existing?.status === 'CANCELLED'
      && existing?.publication?.status === 'FAILED'
      && existingClaims === 0;
    if (existing && !reusableFailedPublication) throw new Error('crew_raid_target_already_used');
    const currentMs = now();
    const recentCreatorRaids = Object.values(state.crewMissions.raids).filter((raid) => (
      raid.kind === 'COMMUNITY'
      && raid.createdByPlayerId === creator.id
      && raid.status !== 'CANCELLED'
      && currentMs - Date.parse(raid.createdAt || 0) < COMMUNITY_RAID_CREATOR_COOLDOWN_MS
    ));
    if (recentCreatorRaids.length) throw new Error('crew_raid_creator_cooldown');
    const openCommunityRaids = Object.values(state.crewMissions.raids).filter((raid) => {
      if (raid.kind !== 'COMMUNITY') return false;
      const claimCount = Object.values(state.crewMissions.raidClaims).filter((claim) => claim.raidId === raid.id).length;
      const status = crewRaidStatus(raid, currentMs, claimCount);
      if (status === 'PENDING_PUBLICATION') return true;
      return ['ACTIVE', 'CLEARED'].includes(status)
        && Number.isFinite(Date.parse(raid.endsAt || 0))
        && currentMs <= Date.parse(raid.endsAt);
    });
    if (openCommunityRaids.length >= COMMUNITY_RAID_ACTIVE_LIMIT) throw new Error('crew_raid_channel_capacity_reached');
    const createdAt = new Date(currentMs).toISOString();
    const id = `AXO-CREW-${target.postId}`;
    const raid = {
      id,
      kind: 'COMMUNITY',
      claimMode: 'TELEGRAM_CONTRIBUTION',
      title: 'Holder Signal Check',
      mission: 'Read the target, then submit one original observation in Telegram: what is useful, unproven, or worth checking next?',
      targetUrl: target.url,
      targetPostId: target.postId,
      startsAt: null,
      endsAt: null,
      goal: COMMUNITY_RAID_DEFAULT_GOAL,
      rewardXp: RAID_DEFAULT_XP,
      creatorRewardXp: COMMUNITY_RAID_CREATOR_XP,
      creatorRewardMinimumCompletions: COMMUNITY_RAID_DEFAULT_GOAL,
      creatorRewardStatus: 'PENDING_GOAL',
      status: 'PENDING_PUBLICATION',
      cooperativeItem: {
        id: `community_signal_crystal_${target.postId}`,
        name: 'Community Signal Crystal',
        rarity: 'CREW RAID',
        slot: 'charm',
        bonus: {},
      },
      targetVerification: {
        verification: safeText(verification.verification || 'X_EXACT_ID_AXO_CONTEXT', 60),
        authorKey: verifiedAuthor,
        contentHash: String(verification.normalizedContentHash),
        createdAt: verification.createdAt || null,
      },
      createdAt,
      createdBy: 'HOLDER',
      createdByPlayerId: creator.id,
      creatorPet: { name: creator.pet.name, genesisId: creator.pet.genesisId },
      publication: { status: 'PENDING', chatId: null, messageId: null, url: null, publishedAt: null },
      policyVersion: 2,
      cancelledAt: null,
    };
    state.crewMissions.raids[id] = raid;
    creator.crew ||= {};
    creator.crew.lastCreatedRaidAt = createdAt;
    recordEvent(state, 'COMMUNITY_CREW_RAID_CREATED', creator.id, {
      raidId: id,
      targetPostId: target.postId,
      goal: raid.goal,
      participantXp: raid.rewardXp,
      creatorXp: raid.creatorRewardXp,
      rewardBasis: 'TELEGRAM_RESEARCH_CONTRIBUTION',
      xEngagementRewarded: false,
    }, createdAt);
    saveState(state);
    return crewRaidView(state, raid, creator.id, currentMs);
  }
  function publishCommunityCrewRaidForTelegramUser(providerUserId, raidId, publication = {}, eligibility = {}) {
    if (eligibility?.eligible !== true) throw new Error('axo_holder_required');
    const state = readState();
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const creator = playerForTelegramIdentity(state, providerUserId);
    if (!creator) throw new Error('telegram_pet_link_required');
    requireGameplayAccess(creator);
    const raid = state.crewMissions.raids[safeText(raidId, 80)];
    if (!raid) throw new Error('crew_raid_not_found');
    if (raid.kind !== 'COMMUNITY' || raid.createdByPlayerId !== creator.id) throw new Error('crew_raid_creator_required');
    if (raid.status !== 'PENDING_PUBLICATION') {
      if (raid.publication?.status === 'PUBLISHED') return crewRaidView(state, raid, creator.id, now());
      throw new Error('crew_raid_publication_not_pending');
    }
    const messageId = Math.floor(Number(publication.messageId || 0));
    const chatId = safeText(publication.chatId, 40);
    const url = String(publication.url || '');
    if (!Number.isSafeInteger(messageId) || messageId <= 0 || !/^-?\d{1,24}$/.test(chatId) || !/^https:\/\/t\.me\/[A-Za-z0-9_]+\/\d+$/.test(url)) {
      throw new Error('crew_raid_publication_receipt_invalid');
    }
    const publishedMs = now();
    const publishedAt = new Date(publishedMs).toISOString();
    raid.status = 'ACTIVE';
    raid.startsAt = publishedAt;
    raid.endsAt = new Date(publishedMs + COMMUNITY_RAID_DURATION_MS).toISOString();
    raid.publication = { status: 'PUBLISHED', chatId, messageId, url, publishedAt };
    recordEvent(state, 'COMMUNITY_CREW_RAID_PUBLISHED', creator.id, {
      raidId: raid.id,
      targetPostId: raid.targetPostId,
      channelMessageId: messageId,
      endsAt: raid.endsAt,
    }, publishedAt);
    saveState(state);
    return crewRaidView(state, raid, creator.id, publishedMs);
  }
  function discardCommunityCrewRaidForTelegramUser(providerUserId, raidId, reason = 'PUBLICATION_FAILED') {
    const state = readState();
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const creator = playerForTelegramIdentity(state, providerUserId);
    if (!creator) throw new Error('telegram_pet_link_required');
    const raid = state.crewMissions.raids[safeText(raidId, 80)];
    if (!raid) throw new Error('crew_raid_not_found');
    if (raid.kind !== 'COMMUNITY' || raid.createdByPlayerId !== creator.id) throw new Error('crew_raid_creator_required');
    if (raid.status !== 'PENDING_PUBLICATION') return crewRaidView(state, raid, creator.id, now());
    const cancelledAt = new Date(now()).toISOString();
    raid.status = 'CANCELLED';
    raid.cancelledAt = cancelledAt;
    raid.cancelReason = safeText(reason, 80) || 'PUBLICATION_FAILED';
    raid.publication = { ...raid.publication, status: 'FAILED' };
    recordEvent(state, 'COMMUNITY_CREW_RAID_PUBLICATION_FAILED', creator.id, {
      raidId: raid.id,
      reason: raid.cancelReason,
    }, cancelledAt);
    saveState(state);
    return crewRaidView(state, raid, creator.id, now());
  }
  function settleCreatorRaidReward(state, raid, eligibility = {}, settledAt = new Date(now()).toISOString()) {
    if (raid.kind !== 'COMMUNITY' || !raid.createdByPlayerId || Number(raid.creatorRewardXp || 0) <= 0) {
      return { changed: false, status: 'NOT_APPLICABLE', xpAwarded: 0 };
    }
    if (raid.creatorRewardStatus === 'RELEASED') return { changed: false, status: 'RELEASED', xpAwarded: 0 };
    const claims = Object.values(state.crewMissions.raidClaims).filter((claim) => claim.raidId === raid.id);
    if (claims.length < Number(raid.creatorRewardMinimumCompletions || raid.goal)) {
      raid.creatorRewardStatus = 'PENDING_GOAL';
      return { changed: false, status: raid.creatorRewardStatus, xpAwarded: 0 };
    }
    const creator = state.players[raid.createdByPlayerId];
    if (!creator) {
      const changed = raid.creatorRewardStatus !== 'CREATOR_UNAVAILABLE';
      raid.creatorRewardStatus = 'CREATOR_UNAVAILABLE';
      return { changed, status: raid.creatorRewardStatus, xpAwarded: 0 };
    }
    if (creator.moderation?.status === 'SUSPENDED') {
      const changed = raid.creatorRewardStatus !== 'HELD_ACCOUNT_SUSPENDED';
      raid.creatorRewardStatus = 'HELD_ACCOUNT_SUSPENDED';
      return { changed, status: raid.creatorRewardStatus, xpAwarded: 0 };
    }
    if (eligibility?.eligible !== true) {
      const changed = raid.creatorRewardStatus !== 'HELD_HOLDER_REQUIRED';
      raid.creatorRewardStatus = 'HELD_HOLDER_REQUIRED';
      return { changed, status: raid.creatorRewardStatus, xpAwarded: 0 };
    }
    const reward = addCrewXp(state, creator, {
      category: 'CREW_RAID_CREATOR',
      amount: raid.creatorRewardXp,
      sourceId: raid.id,
      metadata: { raidId: raid.id, holderRequired: true, contributionGoal: raid.creatorRewardMinimumCompletions },
      awardedAt: settledAt,
    });
    raid.creatorRewardStatus = 'RELEASED';
    raid.creatorRewardAwardedAt = settledAt;
    creator.crew ||= {};
    if (reward.awarded) creator.crew.createdRaids = Number(creator.crew.createdRaids || 0) + 1;
    recordEvent(state, 'COMMUNITY_CREW_RAID_CREATOR_REWARDED', creator.id, {
      raidId: raid.id,
      rewardXp: reward.awarded ? raid.creatorRewardXp : 0,
      uniqueContributors: claims.length,
      rewardBasis: 'MISSION_CURATED_AND_GOAL_CLEARED',
      xEngagementRewarded: false,
    }, settledAt);
    return { changed: true, status: raid.creatorRewardStatus, xpAwarded: reward.awarded ? raid.creatorRewardXp : 0 };
  }
  function crewRaidCreatorRewardPlan(raidId) {
    const state = readState();
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const raid = state.crewMissions.raids[safeText(raidId, 80)];
    if (!raid || raid.kind !== 'COMMUNITY' || !raid.createdByPlayerId) return null;
    const claims = Object.values(state.crewMissions.raidClaims).filter((claim) => claim.raidId === raid.id);
    return {
      raidId: raid.id,
      creatorPlayerId: raid.createdByPlayerId,
      status: raid.creatorRewardStatus,
      completions: claims.length,
      minimumCompletions: Number(raid.creatorRewardMinimumCompletions || raid.goal),
    };
  }
  function settleCrewRaidCreatorRewardsForTelegramUser(providerUserId, eligibility = {}) {
    const state = readState();
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const creator = playerForTelegramIdentity(state, providerUserId);
    if (!creator) return [];
    const settledAt = new Date(now()).toISOString();
    const receipts = [];
    let changed = false;
    for (const raid of Object.values(state.crewMissions.raids).filter((entry) => entry.createdByPlayerId === creator.id)) {
      const result = settleCreatorRaidReward(state, raid, eligibility, settledAt);
      changed ||= result.changed;
      if (result.xpAwarded || result.status === 'HELD_HOLDER_REQUIRED') receipts.push({ raidId: raid.id, ...result });
    }
    if (changed) saveState(state);
    return receipts;
  }
  function cancelCrewRaid(adminAddress, raidId) {
    const state = readState();
    const staff = requireStaff(state, adminAddress, true);
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const raid = state.crewMissions.raids[safeText(raidId, 80)];
    if (!raid) throw new Error('crew_raid_not_found');
    if (raid.status === 'CANCELLED') return crewRaidView(state, raid, null, now());
    const cancelledAt = new Date(now()).toISOString();
    raid.status = 'CANCELLED';
    raid.cancelledAt = cancelledAt;
    raid.cancelledBy = staff.owner;
    recordEvent(state, 'CREW_RAID_CANCELLED', staff.owner, { raidId: raid.id }, cancelledAt);
    saveState(state);
    return crewRaidView(state, raid, null, now());
  }
  function crewRaidById(raidId) {
    const state = readState();
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    return crewRaidView(state, state.crewMissions.raids[safeText(raidId, 80)] || null, null, now());
  }
  function awardCrewRaidItem(state, raid, player, awardedAt) {
    const item = normalizeInventoryItem(raid.cooperativeItem);
    if (!item?.id || player.pet.inventory.some((entry) => entry.id === item.id)) return false;
    player.pet.inventory.push({ ...item, sourceRaidId: raid.id, awardedAt });
    recordEvent(state, 'CREW_RAID_ITEM_AWARDED', player.id, { raidId: raid.id, itemId: item.id }, awardedAt);
    return true;
  }
  function claimCrewRaidContributionForTelegramUser(
    providerUserId,
    raidId,
    input = {},
    eligibility = {},
    creatorEligibility = {},
  ) {
    if (eligibility?.eligible !== true) throw new Error('axo_holder_required');
    const state = readState();
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const player = playerForTelegramIdentity(state, providerUserId);
    if (!player) throw new Error('telegram_pet_link_required');
    requireXpParticipation(player);
    const raid = state.crewMissions.raids[safeText(raidId, 80)];
    if (!raid) throw new Error('crew_raid_not_found');
    const view = crewRaidView(state, raid, player.id, now());
    if (!view.accepting || raid.claimMode !== 'TELEGRAM_CONTRIBUTION') throw new Error('crew_raid_not_accepting');
    if (raid.kind === 'COMMUNITY' && raid.createdByPlayerId === player.id) throw new Error('crew_raid_creator_cannot_claim');
    const claimKey = `${raid.id}:${player.id}`;
    const existing = state.crewMissions.raidClaims[claimKey];
    if (existing) return { accepted: true, duplicate: true, xpAwarded: 0, raid: crewRaidView(state, raid, player.id, now()) };
    const contribution = normalizeRaidContribution(input.text);
    const messageId = Math.floor(Number(input.messageId || 0));
    const chatId = safeText(input.chatId, 40);
    if (!Number.isSafeInteger(messageId) || messageId <= 0 || !/^-?\d{1,24}$/.test(chatId)) {
      throw new Error('crew_raid_submission_receipt_invalid');
    }
    const messageKey = `telegram:${chatId}:${messageId}`;
    const contentKey = `content:${contribution.hash}`;
    if (state.crewMissions.submissionClaims[messageKey]) throw new Error('crew_raid_submission_already_used');
    if (state.crewMissions.submissionClaims[contentKey]) throw new Error('crew_raid_duplicate_contribution');
    const day = isoDay(now());
    const dailyClaims = Object.values(state.crewMissions.raidClaims).filter((claim) => claim.playerId === player.id && claim.day === day).length;
    if (dailyClaims >= RAID_DAILY_REWARD_CAP) throw new Error('crew_raid_daily_cap_reached');
    const claimedAt = new Date(now()).toISOString();
    const claim = {
      id: crypto.randomUUID(),
      raidId: raid.id,
      playerId: player.id,
      petGenesisId: player.pet.genesisId,
      day,
      contributionHash: contribution.hash,
      contributionWordCount: contribution.wordCount,
      telegramReceipt: { chatId, messageId },
      verification: 'TELEGRAM_ORIGINAL_CONTRIBUTION',
      eligibilityMode: eligibilityView(eligibility).mode,
      rewardClass: 'SOCIAL_PROVISIONAL',
      claimedAt,
      affectsContributorTrust: false,
      affectsProductionRanking: false,
    };
    state.crewMissions.raidClaims[claimKey] = claim;
    state.crewMissions.submissionClaims[messageKey] = { claimId: claim.id, raidId: raid.id, playerId: player.id, claimedAt };
    state.crewMissions.submissionClaims[contentKey] = { claimId: claim.id, raidId: raid.id, playerId: player.id, claimedAt };
    const reward = addCrewXp(state, player, {
      category: 'CREW_RAID_CONTRIBUTION',
      amount: raid.rewardXp,
      sourceId: claim.id,
      metadata: { raidId: raid.id, day, holderRequired: true },
      awardedAt: claimedAt,
    });
    player.crew ||= {};
    player.crew.completedRaids = Number(player.crew.completedRaids || 0) + 1;
    player.crew.lastRaidAt = claimedAt;
    const raidClaims = Object.values(state.crewMissions.raidClaims).filter((entry) => entry.raidId === raid.id);
    const cleared = raidClaims.length >= Number(raid.goal);
    if (cleared && !raid.clearedAt) raid.clearedAt = claimedAt;
    if (cleared) {
      for (const raidClaim of raidClaims) {
        const participant = state.players[raidClaim.playerId];
        if (participant) awardCrewRaidItem(state, raid, participant, claimedAt);
      }
    } else if (raid.clearedAt) {
      awardCrewRaidItem(state, raid, player, claimedAt);
    }
    const creatorReward = settleCreatorRaidReward(state, raid, creatorEligibility, claimedAt);
    recordEvent(state, 'CREW_RAID_CONTRIBUTION_ACCEPTED', player.id, {
      raidId: raid.id,
      contributionHash: contribution.hash,
      contributionWordCount: contribution.wordCount,
      rewardXp: reward.awarded ? raid.rewardXp : 0,
      progress: raidClaims.length,
      goal: raid.goal,
      cleared,
      holderGate: eligibilityView(eligibility).mode,
      xEngagementTracked: false,
      xEngagementRewarded: false,
    }, claimedAt);
    saveState(state);
    return {
      accepted: true,
      duplicate: false,
      xpAwarded: reward.awarded ? raid.rewardXp : 0,
      cooperativeItemAwarded: cleared,
      creatorXpAwarded: creatorReward.xpAwarded,
      creatorRewardStatus: creatorReward.status,
      raid: crewRaidView(state, raid, player.id, now()),
      pet: {
        name: player.pet.name,
        level: currentLevel(player.pet.xp),
        xp: player.pet.xp,
      },
      policy: {
        rewardClass: 'SOCIAL_PROVISIONAL',
        rewardBasis: 'ORIGINAL_TELEGRAM_RESEARCH',
        xEngagementTracked: false,
        xEngagementRewarded: false,
        affectsContributorTrust: false,
        affectsProductionRanking: false,
      },
    };
  }
  function care(address, action, context = {}) {
    const { state, player } = requirePlayer(address); const currentMs = now(); const day = isoDay(currentMs); const cleanAction = safeText(action, 20); const source = normalizeCareSource(context.source);
    requireXpParticipation(player);
    if (!['play', 'rest', 'train'].includes(cleanAction)) throw new Error('care_action_invalid');
    player.care.dailyActions ||= {}; if (player.care.dailyActions[cleanAction] === day) throw new Error('care_action_already_used');
    const nowIso = new Date(currentMs).toISOString();
    player.care.dailyActions[cleanAction] = day;
    player.care.dailyActionSources ||= {};
    player.care.dailyActionSources[cleanAction] = { day, channel: source, at: nowIso };
    touchActiveDay(player, day);
    if (cleanAction === 'play') { player.pet.vitals.happiness = clamp(player.pet.vitals.happiness + 8); player.pet.vitals.bond = clamp(player.pet.vitals.bond + 2); }
    if (cleanAction === 'rest') player.pet.vitals.energy = clamp(player.pet.vitals.energy + 18);
    if (cleanAction === 'train') { player.pet.vitals.curiosity = clamp(player.pet.vitals.curiosity + 5); player.pet.vitals.energy = clamp(player.pet.vitals.energy - 4, 15, 100); }
    const traitBonus = applyLineageCareTrait(player, cleanAction);
    player.pet.xp += 2; player.pet.lastReply = currentLevel(player.pet.xp) >= 10 ? matureReply(cleanAction) : companionReply(cleanAction); player.pet.lastCareAt = nowIso; player.updatedAt = nowIso; player.onboarding.cared = true;
    recordCareContinuity(player, cleanAction, source, nowIso);
    const happy = player.pet.vitals.happiness >= 70 && player.pet.vitals.energy >= 40 && player.pet.vitals.bond >= 12; const week = isoWeek(currentMs);
    if (happy && player.care.lastShieldWeek !== week) { player.care.streakShields = Math.min(1, Number(player.care.streakShields || 0) + 1); player.care.lastShieldWeek = week; }
    recordEvent(state, 'CARE_ACTION', player.id, {
      action: cleanAction,
      source,
      channel: source,
      xp: 2,
      lineageTraitId: traitBonus.id,
      traitVital: traitBonus.applied ? traitBonus.effect.vital : null,
      traitBonus: traitBonus.appliedAmount,
      affectsContributorTrust: false,
      affectsProductionRanking: false,
    }, nowIso);
    saveState(state);
    const view = snapshot(player.ownerAddress);
    return {
      ...view,
      result: {
        action: cleanAction,
        source,
        traitBonus,
        dailyRitual: view.player.care.dailyRitual,
        xpAwarded: 2,
        affectsContributorTrust: false,
        affectsConsensusWeight: false,
        affectsProductionRanking: false,
      },
    };
  }
  function pet(address, input = {}, context = {}) {
    const { state, player } = requirePlayer(address);
    requireGameplayAccess(player);
    const rawDurationMs = Number(input.durationMs || 0);
    const durationMs = Number.isFinite(rawDurationMs) ? Math.max(0, Math.min(120_000, Math.round(rawDurationMs))) : 0;
    const currentMs = now(); const source = normalizeCareSource(context.source); const interaction = safeText(input.interaction, 40).toUpperCase() || 'TOUCH';
    const lastActionMs = Date.parse(player.care.lastPetActionAt || player.care.lastPetRewardAt || 0);
    const cooldownRemainingMs = Number.isFinite(lastActionMs) ? Math.max(0, PET_HAPPINESS_COOLDOWN_MS - (currentMs - lastActionMs)) : 0;
    const quickCuddle = source === 'TELEGRAM' && interaction === 'QUICK_CUDDLE';
    const touchQualified = durationMs >= PET_MIN_TOUCH_MS || quickCuddle;
    const accepted = touchQualified && cooldownRemainingMs === 0;
    const happinessGained = accepted && player.pet.vitals.happiness < 100 ? PET_HAPPINESS_GAIN : 0;
    const purred = source === 'WEB' && durationMs >= PET_PURR_HOLD_MS && input.purred === true;
    if (accepted) {
      const nowIso = new Date(currentMs).toISOString();
      player.pet.vitals.happiness = clamp(player.pet.vitals.happiness + happinessGained);
      player.care.lastPetActionAt = nowIso;
      if (happinessGained > 0) player.care.lastPetRewardAt = nowIso;
      player.care.pettingCount = Number(player.care.pettingCount || 0) + 1;
      player.pet.lastReply = currentLevel(player.pet.xp) >= 10 ? matureReply('pet') : companionReply('pet');
      player.pet.lastCareAt = nowIso;
      player.updatedAt = nowIso;
      touchActiveDay(player, isoDay(currentMs));
      recordCareContinuity(player, 'pet', source, nowIso);
      recordEvent(state, 'PET_PETTED', player.id, { source, channel: source, interaction, happinessGained, durationMs, purred, xp: 0, affectsContributorTrust: false, affectsProductionRanking: false }, nowIso);
      saveState(state);
    }
    const view = snapshot(player.ownerAddress);
    return { ...view, result: { source, interaction, accepted, happinessGained, durationMs, purred, touchQualified, cooldownRemainingMs: accepted ? PET_HAPPINESS_COOLDOWN_MS : cooldownRemainingMs, xpAwarded: 0, affectsContributorTrust: false, affectsConsensusWeight: false, affectsProductionRanking: false } };
  }
  function equipItem(address, input = {}) {
    const { state, player } = requirePlayer(address);
    requireGameplayAccess(player);
    const itemId = safeText(input.itemId, 120); const slot = safeText(input.slot, 20).toLowerCase();
    if (!ITEM_SLOTS.includes(slot)) throw new Error('inventory_slot_invalid');
    player.pet.inventory = normalizeInventory(player.pet.inventory);
    const item = player.pet.inventory.find((entry) => entry.id === itemId);
    if (!item) throw new Error('inventory_item_not_owned');
    if (!item.slot) throw new Error('inventory_item_not_equippable');
    if (item.slot !== slot) throw new Error('inventory_slot_mismatch');
    player.pet.equipped = normalizeEquipped(player.pet.inventory, player.pet.equipped);
    const previousItemId = player.pet.equipped[slot] || null;
    const changed = previousItemId !== item.id;
    if (changed) {
      const equippedAt = new Date(now()).toISOString();
      player.pet.equipped[slot] = item.id;
      player.updatedAt = equippedAt;
      recordEvent(state, 'ITEM_EQUIPPED', player.id, {
        itemId: item.id,
        slot,
        previousItemId,
        xp: 0,
        affectsContributorTrust: false,
        affectsConsensusWeight: false,
        affectsProductionRanking: false,
      }, equippedAt);
      saveState(state);
    }
    return {
      ...snapshot(player.ownerAddress),
      result: {
        itemId: item.id,
        slot,
        previousItemId,
        changed,
        xpAwarded: 0,
        affectsContributorTrust: false,
        affectsConsensusWeight: false,
        affectsProductionRanking: false,
      },
    };
  }
  function learnSkill(address, skillId) {
    const { state, player } = requirePlayer(address); const id = safeText(skillId, 60); const node = SKILL_TREE[id]; if (!node) throw new Error('skill_invalid');
    requireXpParticipation(player);
    player.pet.skills ||= []; if (player.pet.skills.includes(id)) throw new Error('skill_already_learned');
    const level = currentLevel(player.pet.xp); const points = skillPoints(player); if (!points.available) throw new Error('skill_points_exhausted'); if (level < node.level) throw new Error('skill_level_locked');
    if (node.capstone) { const tierThree = player.pet.skills.filter((selected) => SKILL_TREE[selected]?.tier === 3).length; if (tierThree < 2) throw new Error('skill_capstone_requires_two_routes'); }
    else if (!node.requires.every((required) => player.pet.skills.includes(required))) throw new Error('skill_prerequisite_missing');
    const nowIso = new Date(now()).toISOString(); const firstInstinct = player.onboarding.skillChosen !== true; player.pet.skills.push(id); player.pet.abilities[node.ability] = Number(player.pet.abilities[node.ability] || 1) + 4; if (firstInstinct) player.pet.xp += 6; player.pet.lastReply = level >= 10 ? matureReply('skill', node.label) : companionReply('skill'); player.onboarding.skillChosen = true; player.updatedAt = nowIso; recordEvent(state, 'SKILL_LEARNED', player.id, { skillId: id, route: node.route, firstInstinctXp: firstInstinct ? 6 : 0 }, nowIso); saveState(state); return snapshot(player.ownerAddress);
  }
  function completeFirstTrail(address, input = {}) {
    const { state, player } = requirePlayer(address);
    requireXpParticipation(player);
    player.onboarding.firstTrail ||= { completed: false };
    if (player.onboarding.firstTrail.completed) throw new Error('first_trail_already_completed');
    if (!player.onboarding.cared) throw new Error('first_trail_bond_required');
    if (!player.onboarding.skillChosen) throw new Error('first_trail_instinct_required');
    const radar = readJson(radarFile, {}); const clue = firstTrailClue(radar, now());
    if (!clue) throw new Error('first_trail_live_clue_unavailable');
    if (safeText(input.clueId, 60) !== clue.id) throw new Error('first_trail_clue_changed');
    const judgment = safeText(input.judgment, 40).toUpperCase(); const strength = safeText(input.strength, 40).toUpperCase(); const concern = safeText(input.concern, 60).toUpperCase();
    if (!FIRST_TRAIL_JUDGMENTS.includes(judgment)) throw new Error('first_trail_judgment_required');
    if (!FIRST_TRAIL_STRENGTHS.includes(strength)) throw new Error('first_trail_strength_required');
    if (!FIRST_TRAIL_CONCERNS.includes(concern)) throw new Error('first_trail_concern_required');
    const completedAt = new Date(now()).toISOString(); const priorLevel = currentLevel(player.pet.xp); const targetXp = LEVELS[FIRST_TRAIL_LEVEL - 1].xp; const xpAwarded = Math.max(0, targetXp - Number(player.pet.xp || 0));
    const item = { ...LINEAGE_TRAIL_ITEMS[player.pet.lineageId] || LINEAGE_TRAIL_ITEMS.emerald_sprout };
    player.pet.inventory ||= [];
    if (!player.pet.inventory.some((entry) => entry.id === item.id)) player.pet.inventory.push(item);
    player.pet.equipped.tool = item.id; player.pet.xp += xpAwarded; player.pet.vitals.curiosity = clamp(player.pet.vitals.curiosity + 7); player.pet.vitals.bond = clamp(player.pet.vitals.bond + 3); player.pet.vitals.happiness = clamp(player.pet.vitals.happiness + 5); player.pet.lastReply = companionReply('feed'); player.pet.lastCareAt = completedAt; player.updatedAt = completedAt;
    player.onboarding.firstTrail = { completed: true, clueId: clue.id, answers: { judgment, strength, concern }, xpAwarded, itemId: item.id, completedAt };
    player.onboarding.firstExpedition = true; player.onboarding.starterBonusClaimed = true; player.onboarding.completedAt = completedAt; touchActiveDay(player, isoDay(now()));
    state.trainingLabels ||= [];
    state.trainingLabels.push({ id: crypto.randomUUID(), playerId: player.id, petGenesisId: player.pet.genesisId, clueId: clue.id, source: clue.source, candidate: clue.candidate, judgment, strength, concern, trustClass: 'PROVISIONAL_TRAINING_LABEL', consensusEligible: false, affectsContributorTrust: false, affectsProductionRanking: false, createdAt: completedAt });
    state.trainingLabels = state.trainingLabels.slice(-5_000);
    recordEvent(state, 'FIRST_TRAIL_COMPLETED', player.id, { clueId: clue.id, judgment, strength, concern, xpAwarded, itemId: item.id, priorLevel, newLevel: currentLevel(player.pet.xp), trustClass: 'PROVISIONAL_TRAINING_LABEL' }, completedAt);
    saveState(state);
    return { ...snapshot(player.ownerAddress), result: { xpAwarded, item, priorLevel, newLevel: currentLevel(player.pet.xp), evolved: currentLevel(player.pet.xp) > priorLevel, trustClass: 'PROVISIONAL_TRAINING_LABEL', consensusEligible: false, affectsContributorTrust: false, affectsProductionRanking: false } };
  }
  function prepareContribution(address, input) {
    const { state, player } = requirePlayer(address); const owner = player.ownerAddress; const day = isoDay(now()); const today = state.contributions.filter((item) => item.playerId === owner && item.day === day);
    requireXpParticipation(player);
    if (player.moderation?.status === 'SUSPENDED') throw new Error('hatchery_account_suspended');
    if (player.moderation?.alphaMining?.status === 'BLOCKED') throw new Error('alpha_mining_wallet_blocked');
    const dailyTasks = personalizedTasks(player, readJson(radarFile, {}), now());
    const communityTasks = crewProjectViews(state, owner, now()).filter((quest) => quest.accepting).map((quest) => quest.task);
    const tasks = [...dailyTasks, ...communityTasks]; const value = validateContribution(input, tasks, now()); const projectQuest = value.task.projectQuest === true;
    const canonicalKey = entityKey(value.entity);
    const canonicalOnboarding = value.type === 'contract_scout' && canonicalKey === canonicalAxoAddress;
    const existingQuest = state.projectQuests?.[canonicalKey];
    const activeExistingQuest = existingQuest && projectQuestWindow(existingQuest, now(), canonicalAxoAddress).accepting;
    const canonicalFirstCall = canonicalOnboarding && !projectQuest && !activeExistingQuest;
    if (canonicalFirstCall) {
      const verdict = safeText(input.verdict, 40).toUpperCase();
      const confidence = Number(input.confidence);
      if (verdict === 'SCAM') throw new Error('canonical_axo_scam_vote_forbidden');
      const heatJudgment = contractHeatJudgment(verdict, confidence, input.heatScore);
      value.verdict = heatJudgment.verdict;
      value.confidence = heatJudgment.confidence;
      value.heatScore = heatJudgment.heatScore;
    }
    const nonOnboardingToday = today.filter((item) => !(item.type === 'contract_scout'
      && (item.entityKey || entityKey(item.entity)) === canonicalAxoAddress)
      && !isProjectJudgmentContribution(item));
    if (!canonicalOnboarding && nonOnboardingToday.length >= MAX_DAILY_CONTRIBUTIONS) throw new Error('daily_contribution_limit_reached');
    if (!projectQuest && value.type === 'contract_scout' && !canonicalOnboarding && nonOnboardingToday.some((item) => item.type === 'contract_scout' && !isProjectJudgmentContribution(item))) throw new Error('contract_alpha_daily_limit_reached');
    if (value.type !== 'contract_scout' || canonicalKey !== canonicalAxoAddress) requireCanonicalAxoQuestAccess(state, player);
    if (projectQuest && canonicalKey !== entityKey(value.task.fixedEntity)) throw new Error('project_quest_entity_locked');
    const currentEpochId = epochWindow(now()).id;
    if (projectQuest && state.contributions.some((item) => item.playerId === owner
      && isProjectJudgmentContribution(item, value.task.projectQuestId)
      && contributionEpochId(item) === currentEpochId)) throw new Error('project_quest_already_acknowledged');
    if (!projectQuest && value.type === 'contract_scout' && state.communityScamRegistry?.[canonicalKey]?.status === 'COMMUNITY_SCAM') throw new Error('project_community_scam_flagged');
    if (!canonicalOnboarding && nonOnboardingToday.some((item) => item.taskId === value.task.id)) throw new Error('task_already_completed');
    if (!projectQuest && today.some((item) => item.type === value.type && (item.entityKey || entityKey(item.entity)) === canonicalKey)) throw new Error('duplicate_entity_today');
    if (!projectQuest && value.type === 'contract_scout' && activeExistingQuest) throw new Error('project_already_quested');
    if (!projectQuest && !feedingStatus(player, now()).ready) throw new Error('feeding_cooldown_active');
    return { state, player, owner, day, value, projectQuest, canonicalKey, canonicalFirstCall };
  }
  function pinnedProjectContractEvidence(prepared) {
    if (!prepared?.projectQuest) return null;
    const quest = prepared.state.projectQuests?.[prepared.canonicalKey];
    if (!quest
      || quest.id !== prepared.value.task.projectQuestId
      || normalizeAddress(quest.address) !== prepared.canonicalKey) return null;
    const nomination = prepared.state.contributions.find((entry) => entry.id === quest.nominationContributionId);
    const verification = nomination?.evidence?.verification || {};
    const blockNumber = Number(verification.contractBlockNumber);
    if (!nomination
      || nomination.type !== 'contract_scout'
      || normalizeAddress(nomination.entityKey || nomination.entity) !== prepared.canonicalKey
      || nomination.evidence?.status !== 'DEPLOYED_CONTRACT'
      || verification.contractSource !== 'ROBINHOOD_RPC_ETH_GETCODE'
      || verification.contractAuthoritativeSource !== 'ROBINHOOD_RPC_ETH_GETCODE'
      || verification.contractProofStrength !== 'BLOCK_PINNED_RPC_BYTECODE'
      || verification.contractProviderDisagreement === true
      || !Number.isSafeInteger(blockNumber)
      || blockNumber <= 0
      || !/^0x[0-9a-f]{64}$/i.test(String(verification.contractBlockHash || ''))
      || !/^0x[0-9a-f]{64}$/i.test(String(verification.contractCodeHash || ''))) return null;
    return {
      address: prepared.canonicalKey,
      status: 'DEPLOYED_CONTRACT',
      chainId: 4663,
      source: verification.contractSource,
      authoritativeSource: verification.contractAuthoritativeSource,
      corroboratedBy: verification.contractCorroboratedBy || [],
      providerChecks: verification.contractProviderChecks || {},
      providerTrail: verification.contractProviderTrail || [],
      providerDisagreement: false,
      proofStrength: verification.contractProofStrength,
      blockNumber,
      blockHash: verification.contractBlockHash,
      codeHash: verification.contractCodeHash,
      verifiedSource: quest.safety?.verifiedSource === true,
      rewardEligible: true,
      nominationContributionId: nomination.id,
    };
  }
  async function contribute(address, input, context = {}) {
    if (input?.chainId !== undefined) {
      const { subjectKey } = require('../chains/registry');
      const { owner, state, player } = requirePlayer(address);
      requireXpParticipation(player);
      if (player.moderation?.alphaMining?.status === 'BLOCKED') throw new Error('alpha_mining_wallet_blocked');
      requireCanonicalAxoQuestAccess(state, player);
      if (input.type !== 'contract_scout' || input.taskId !== 'cross_chain_nomination' || input.upgradeContributionId || input.alphaCall) throw new Error('cross_chain_nomination_only');
      if (![8453, 5042, 1, 56].includes(input.chainId)) throw new Error('cross_chain_unsupported');
      const tokenAddress = normalizeAddress(input.data);
      if (!tokenAddress || input.entity || input.verdict || input.heatScore !== undefined || input.confidence !== undefined || input.evidenceUrl || input.reason || input.observedAt || input.contradiction) throw new Error('cross_chain_nomination_address_only');
      const key = subjectKey(input.chainId, tokenAddress);
      const nominations = state.crossChainNominations || [];
      if (!Array.isArray(nominations) || nominations.length >= 5_000) throw new Error('cross_chain_nomination_capacity');
      if (nominations.some((item) => item.ownerAddress === owner && item.subjectKey === key)) throw new Error('cross_chain_nomination_duplicate');
      const submittedAt = new Date(now()).toISOString();
      if (nominations.filter((item) => item.ownerAddress === owner && item.submittedAt?.slice(0, 10) === submittedAt.slice(0, 10)).length >= 3) throw new Error('cross_chain_nomination_daily_limit');
      const proof = context.chainProof;
      if (!proof || proof.chainId !== input.chainId || normalizeAddress(proof.address) !== tokenAddress ||
          proof.caipNetworkId !== `eip155:${input.chainId}` || proof.subjectKey !== key || proof.codeObserved !== true ||
          !['FIVE_CHAIN_LATEST_CODE_SCAN', 'EXPLICIT_CHAIN_LATEST_CODE_CHECK'].includes(proof.source) ||
          proof.proof !== 'CODE_OBSERVED_NOT_CONTRACT_OR_FINALITY_VERIFIED') throw new Error('cross_chain_nomination_code_proof_required');
      const projectContext = context.projectContext
        ? sanitizeProjectEnrichment(context.projectContext, { chainId: input.chainId, address: tokenAddress })
        : null;
      const nominationId = crypto.randomUUID();
      const evidenceHash = `0x${crypto.createHash('sha256').update(JSON.stringify({
        nominationId, owner, subjectKey: key, proofSource: proof.source, proof: proof.proof,
        dexscreenerStatus: projectContext?.deterministic?.dexscreener?.status || 'UNAVAILABLE', submittedAt,
      })).digest('hex')}`;
      const sourceHash = `0x${crypto.createHash('sha256').update(JSON.stringify({
        chainId: input.chainId, caipNetworkId: proof.caipNetworkId, address: tokenAddress,
        source: proof.source, proof: proof.proof,
      })).digest('hex')}`;
      const xpAwarded = MULTICHAIN_CONTRACT_DISCOVERY_XP;
      const nomination = { id: nominationId, ownerAddress: owner, chainId: input.chainId,
        caipNetworkId: `eip155:${input.chainId}`, subjectKey: key, address: tokenAddress,
        status: 'VERIFIED_CHAIN_RESEARCH_NOMINATION', submittedAt, xpAwarded,
        petXpAwarded: xpAwarded, epochXpAwarded: xpAwarded, evidenceHash, sourceHash,
        projectContext, proof: { source: proof.source, strength: proof.proof, codeObserved: true },
        consensusEligible: false, affectsProductionRanking: false, productionEligible: false,
        competitiveEligible: true, rewardEligibility: { eligible: true, reason: 'MULTICHAIN_CONTRACT_DISCOVERY', baseXp: xpAwarded } };
      state.crossChainNominations = [...nominations, nomination];
      player.pet.xp += xpAwarded;
      player.updatedAt = submittedAt;
      player.pet.lastReply = currentLevel(player.pet.xp) >= 10 ? matureReply('feed') : companionReply('feed');
      queueEpochLedgerReward(state, {
        id: `multichain-contract:${nominationId}`, player, amount: xpAwarded,
        reasonCode: 'MULTICHAIN_CONTRACT_DISCOVERY', evidenceHash, sourceHash,
        recordedAt: submittedAt, sourceId: nominationId, receiptId: nominationId,
        receiptClass: 'MULTICHAIN_CONTRACT_DISCOVERY', countsAsReceipt: true,
      });
      recordEvent(state, 'MULTICHAIN_PROJECT_NOMINATED', player.id, {
        nominationId, chainId: input.chainId, caipNetworkId: nomination.caipNetworkId,
        subjectKey: key, xp: xpAwarded, epochXp: xpAwarded, evidenceHash,
        consensusEligible: false, affectsContributorTrust: false,
        affectsProductionRanking: false, productionEligible: false,
      }, submittedAt);
      saveState(state);
      return { ...snapshot(owner), result: {
        nomination: (({ ownerAddress, ...publicItem }) => publicItem)(nomination),
        xpAwarded, petXpAwarded: xpAwarded, epochXpAwarded: xpAwarded,
        rewardEligibility: nomination.rewardEligibility,
      } };
    }
    const idempotencyKey = safeText(context.idempotencyKey, 180) || null;
    if (idempotencyKey) {
      const owner = requireAddress(address);
      const existing = readState().contributions.find((item) => item.playerId === owner && item.submissionIdempotencyKey === idempotencyKey);
      if (existing) {
        return {
          ...snapshot(owner),
          result: {
            duplicate: true,
            contributionId: existing.id,
            projectQuestId: existing.projectQuestId,
            projectQuestPublished: false,
            projectQuestAcknowledged: Boolean(existing.projectQuestId),
            humanObservation: existing.humanObservation,
            alphaCall: existing.alphaCall ? {
              status: existing.alphaCall.status,
              commitmentHash: existing.alphaCall.commitmentHash,
              commitmentScope: existing.alphaCall.commitmentScope,
              horizon: existing.alphaCall.horizon,
              expiresAt: existing.alphaCall.expiresAt,
              requestedExpiresAt: existing.alphaCall.requestedExpiresAt || existing.alphaCall.expiresAt,
              performanceEpochId: existing.alphaCall.performanceEpochId || epochWindow(Date.parse(existing.alphaCall.submittedAt || existing.createdAt)).id,
              performanceEligible: existing.alphaCall.safety?.initial?.eligible === true,
              performanceEligibilityReason: existing.alphaCall.safety?.initial?.reason || null,
              walletActionRequired: existing.alphaCall.commitment?.walletActionRequired === true,
              transactionReady: existing.alphaCall.commitment?.walletActionRequired === true && Boolean(protocolConfig.intelRegistryAddress),
            } : null,
            xpAwarded: Number(existing.xp?.provisional || 0),
            xpPending: Number(existing.xp?.pending || 0),
            xpSettlement: existing.xp?.settlement,
            dataQualityScore: Number(existing.evidence?.qualityScore || 0),
            evidenceScore: Number(existing.evidence?.qualityScore || 0),
            verification: existing.evidence?.verification || {},
            receiptClass: existing.receiptClass || 'NOMINATION_ONLY',
            rewardEligibility: existing.rewardEligibility || { eligible: false, reason: 'PRE_PROTOCOL_PREVIEW_NOT_IMPORTED', baseXp: 0 },
            consensusEligible: existing.consensusEligible === true,
            status: existing.status,
            reply: 'This exact Telegram receipt was already stored.',
            feedingCooldownMs: FEEDING_COOLDOWN_MS,
          },
        };
      }
    }
    const preliminary = prepareContribution(address, input);
    const owner = preliminary.owner;
    if (preliminary.projectQuest && context[projectQueueTicket] !== true) {
      return enqueueProjectContribution(owner, () => contribute(address, input, { ...context, [projectQueueTicket]: true }));
    }
    const ordinaryFeed = !preliminary.projectQuest;
    if (ordinaryFeed && feedingInFlight.has(owner)) throw new Error('feeding_cooldown_active');
    if (ordinaryFeed) feedingInFlight.add(owner);
    try {
    const contractEvidence = pinnedProjectContractEvidence(preliminary);
    const inspection = await inspectEvidence({ ownerAddress: owner, holder: context.holder === true, type: preliminary.value.type, entity: preliminary.value.entity, evidenceUrl: null, task: preliminary.value.task, contractEvidence });
    // Re-read after every external provider await. The SQLite revision guard then
    // guarantees that no concurrent wallet mutation can be silently overwritten.
    const prepared = prepareContribution(address, input);
    const { state, player, day, value, projectQuest, canonicalKey, canonicalFirstCall } = prepared;
    if (inspection?.contract?.status === 'NOT_DEPLOYED') throw new Error('robinhood_contract_not_deployed');
    if (inspection?.contract?.status === 'VALIDATION_UNAVAILABLE') throw new Error('contract_verification_unavailable');
    const humanIdentity = verifiedHumanIdentity(player, protocolConfig.humanIdentityRequired === true, now());
    const identity = { activityVerified: inspection?.identity?.activityVerified === true, rewardActivityVerified: inspection?.identity?.rewardActivityVerified !== undefined ? inspection.identity.rewardActivityVerified === true : inspection?.identity?.activityVerified === true, activityScore: Number(inspection?.identity?.activityScore || 0), transactions: inspection?.identity?.transactions ?? null, tokenTransfers: inspection?.identity?.tokenTransfers ?? null, qualification: inspection?.identity?.qualification || 'INSUFFICIENT_ACTIVITY', rewardQualification: inspection?.identity?.rewardQualification || (inspection?.identity?.activityVerified === true ? 'ESTABLISHED_ONCHAIN_ACTIVITY' : 'INSUFFICIENT_ACTIVITY'), sybilResistanceVersion: Number(inspection?.identity?.sybilResistanceVersion || 3), checkedAt: new Date(now()).toISOString(), source: inspection?.identity?.source || 'UNVERIFIED', providerTrail: (inspection?.identity?.providerTrail || []).slice(0, 4), humanIdentity };
    player.identity = identity;
    const liveMarketSources = Object.values(inspection?.projectSafety?.marketSources || {}).filter((status) => status === 'LIVE').length;
    const research = researchReceiptAssessment(value, inspection, context, humanIdentity);
    const researchFieldScore = Object.values(research.fields).filter(Boolean).length * 10;
    const contractScore = REWARD_CONTRACT_TYPES.has(value.type) ? (inspection?.contract?.status === 'DEPLOYED_CONTRACT' ? 25 : 0) : 25;
    const dataQualityScore = Math.min(100, researchFieldScore + contractScore + (identity.rewardActivityVerified ? 20 : 0) + Math.min(15, liveMarketSources * 8));
    const rewardEvidenceEligible = research.eligible && dataQualityScore >= VERIFIED_DATA_QUALITY_MINIMUM;
    const specialtyBoost = Number(value.task.specialtyBoostXp || 0); const itemBoost = Number(value.task.itemBoostXp || 0); const structuredDataBonus = 2; const totalPotential = value.task.xp + structuredDataBonus + (Number(value.confidence) <= 85 ? 1 : 0) + specialtyBoost + itemBoost;
    const starterBonus = player.onboarding.starterBonusClaimed ? 0 : STARTER_EXPEDITION_BONUS_XP;
    const contractDiscovery = value.type === 'contract_scout' && !projectQuest;
    const contractJudgment = value.type === 'contract_scout' && projectQuest;
    const standardProvisional = Math.min(4, Math.max(2, Math.round(totalPotential * 0.3)));
    const provisional = contractDiscovery ? CONTRACT_DISCOVERY_XP : contractJudgment ? CONTRACT_JUDGMENT_XP : standardProvisional + starterBonus;
    const pending = contractDiscovery ? CONTRACT_DISCOVERY_CORROBORATED_XP : contractJudgment ? CONTRACT_JUDGMENT_CORROBORATED_XP : Math.max(0, totalPotential - standardProvisional);
    const createdAt = new Date(now()).toISOString();
    const contributionId = crypto.randomUUID();
    const protocolActions = [];
    let alphaCall = null;
    const requestedAlphaCall = value.alphaCall || (!projectQuest && value.type === 'contract_scout' && String(context.submissionClass || '').toUpperCase() !== 'NOMINATION_ONLY'
      ? automaticContractAlphaCall(canonicalKey, inspection?.projectSafety, now())
      : null);
    if (requestedAlphaCall) {
      const automatic = requestedAlphaCall.systemGenerated === true && requestedAlphaCall.mode === AUTOMATIC_CONTRACT_ALPHA_MODE;
      const submittedAt = automatic ? requestedAlphaCall.observedAt : createdAt;
      let outcomeWindow = null;
      try {
        outcomeWindow = alphaOutcomeWindow(submittedAt, requestedAlphaCall.horizon);
      } catch (error) {
        if (!automatic) throw error;
      }
      if (outcomeWindow) {
      const initialSafety = alphaPerformanceSafety(inspection?.projectSafety, requestedAlphaCall.poolAddress);
      const automaticThesis = 'Contract address captured by AXO for automatic market observation and independent Crew corroboration.';
      const canonicalCall = {
        chainId: 4663,
        wallet: owner,
        petGenesisId: player.pet.genesisId,
        tokenAddress: canonicalKey,
        poolAddress: requestedAlphaCall.poolAddress,
        entry: requestedAlphaCall.entry,
        targetPrice: requestedAlphaCall.targetPrice,
        stopPrice: requestedAlphaCall.stopPrice,
        horizon: requestedAlphaCall.horizon,
        thesis: automatic ? automaticThesis : value.reason,
        evidenceUrl: value.evidenceUrl,
        observedAt: automatic ? requestedAlphaCall.observedAt : value.observedAt,
        disclosure: requestedAlphaCall.disclosure,
        submittedAt,
      };
      const commitment = intelCommitAction({ contributionId, registryAddress: automatic ? null : protocolConfig.intelRegistryAddress || null, content: canonicalCall });
      if (!automatic) protocolActions.push(commitment.action);
      alphaCall = {
        ...requestedAlphaCall,
        tokenAddress: canonicalKey,
        thesis: canonicalCall.thesis,
        evidenceUrl: value.evidenceUrl,
        observedAt: canonicalCall.observedAt,
        submittedAt,
        requestedExpiresAt: outcomeWindow.requestedEndsAt,
        expiresAt: outcomeWindow.endsAt,
        performanceEpochId: outcomeWindow.epochId,
        performanceWindow: outcomeWindow,
        status: rewardEvidenceEligible ? 'VALIDATED' : 'SUBMITTED',
        commitmentHash: commitment.contentHash,
        commitmentScope: automatic ? 'SERVER_RECEIPT_ONLY' : protocolConfig.intelRegistryAddress ? 'ONCHAIN_USER_COMMITMENT_PENDING' : 'ONCHAIN_REGISTRY_NOT_DEPLOYED',
        commitment: { petIdHash: commitment.petIdHash, clientNonce: commitment.clientNonce, registryAddress: automatic ? null : protocolConfig.intelRegistryAddress || null, walletActionRequired: !automatic },
        safety: { initial: initialSafety, settlement: null },
        performance: { status: 'NOT_SCORED', fixedTradeUsd: requestedAlphaCall.hypotheticalTradeUsd, returnPct: null, realizedProfitUsd: null, potentialProfitUsd: null, potentialReturnPct: null, profitMultiplier: null, performanceXp: 0, targetHitAt: null, stopHitAt: null, scoredAt: null },
      };
      }
    }
    const humanObservation = {
      reason: value.reason,
      evidenceUrl: value.evidenceUrl,
      observedAt: value.observedAt,
      contradiction: value.contradiction,
      affectsContributorTrust: false,
      affectsConsensusWeight: false,
      affectsProductionRanking: false,
    };
    if (value.type === 'contract_scout') humanObservation.source = 'AUTOMATED_CONTRACT_CAPTURE';
    const consensusEligible = rewardEvidenceEligible && !(contractDiscovery && value.verdict === 'TAGGED');
    const contribution = { id: contributionId, submissionIdempotencyKey: idempotencyKey, playerId: owner, walletVerified: true, petId: player.pet.id, petGenesisId: player.pet.genesisId, petRewardEligible: true, day, taskId: value.task.id, type: value.type, ability: value.task.ability, data: value.data, entity: value.entity, entityKey: canonicalKey, verdict: value.verdict, feeling: value.verdict, reason: value.reason, evidenceUrl: value.evidenceUrl, observedAt: value.observedAt, contradiction: value.contradiction, humanObservation, projectContext: context.projectContext ? sanitizeProjectEnrichment(context.projectContext, { chainId: 4663, address: canonicalKey }) : null, alphaCall, confidence: value.confidence, heatScore: Number.isInteger(value.heatScore) ? value.heatScore : null, communityScamVote: projectQuest && value.verdict === 'SCAM', receiptClass: research.receiptClass, independenceKey: humanIdentity.independenceKey, consensusEligible, consensusEligibility: consensusEligible ? (value.type === 'contract_scout' ? 'QUALIFIED_AUTOMATED_CONTRACT_EVIDENCE_AND_IDENTITY' : 'QUALIFIED_EVIDENCE_ACTIVITY_AND_IDENTITY') : contractDiscovery && rewardEvidenceEligible ? 'FIRST_SCOUT_TAG_AWAITS_CREW_JUDGMENT' : research.reason || (dataQualityScore < VERIFIED_DATA_QUALITY_MINIMUM ? 'DATA_QUALITY_BELOW_MINIMUM' : identity.qualification), rewardEligibility: { eligible: rewardEvidenceEligible, reason: rewardEvidenceEligible ? null : research.reason || 'DATA_QUALITY_BELOW_MINIMUM', baseXp: 0, baseStatus: rewardEvidenceEligible ? 'PENDING_DAILY_CAP' : 'WITHHELD' }, projectQuestId: projectQuest ? value.task.projectQuestId : null, evidence: { status: inspection?.contract?.status || 'DATA_ACKNOWLEDGED', domain: evidenceDomain(value.evidenceUrl), qualityScore: dataQualityScore, research: { ...research, score: researchFieldScore }, projectSafety: !projectQuest && value.type === 'contract_scout' ? inspection.projectSafety : null, verification: { mode: research.verificationMode, contractSource: inspection?.contract?.source || null, contractAuthoritativeSource: inspection?.contract?.authoritativeSource || null, contractCorroboratedBy: inspection?.contract?.corroboratedBy || [], contractProviderChecks: inspection?.contract?.providerChecks || {}, contractProviderDisagreement: inspection?.contract?.providerDisagreement === true, contractProviderTrail: (inspection?.contract?.providerTrail || []).slice(0, 6), contractProofStrength: inspection?.contract?.proofStrength || null, contractBlockNumber: inspection?.contract?.blockNumber ?? null, contractBlockHash: inspection?.contract?.blockHash || null, contractCodeHash: inspection?.contract?.codeHash || null, identitySource: identity.source, identityProviderTrail: identity.providerTrail, humanIdentitySource: humanIdentity.source, marketSources: inspection?.projectSafety?.marketSources || {}, explorerProvider: inspection?.projectSafety?.explorerProvider || null, providerFallback: inspection?.projectSafety?.providerFallback || null }, checkedAt: createdAt }, xp: { provisional, pending, released: provisional, settled: false, settlement: 'AWAITING_CORROBORATION', rewardEligibleBase: 0 }, status: research.receiptClass === 'NOMINATION_ONLY' ? 'NOMINATION_RECORDED' : 'PENDING_CORROBORATION', affectsProductionRanking: false, createdAt };
    if (rewardEvidenceEligible && value.type === 'contract_scout') {
      const reasonCode = contractDiscovery ? 'CONTRACT_DISCOVERY' : 'CONTRACT_JUDGMENT';
      const dailyBaseCount = baseReceiptCountForDay(state, owner, day);
      if (provisional > 0 && dailyBaseCount < BASE_RECEIPTS_PER_WALLET_DAY) {
        const evidenceHash = `0x${crypto.createHash('sha256').update(JSON.stringify({ type: reasonCode, contributionId, owner, petGenesisId: player.pet.genesisId, canonicalKey, createdAt })).digest('hex')}`;
        const sourceHash = `0x${crypto.createHash('sha256').update(JSON.stringify({ contributionId, canonicalKey, verdict: value.verdict, confidence: value.confidence, heatScore: contribution.heatScore })).digest('hex')}`;
        queueEpochLedgerReward(state, { id: `contract-base:${contributionId}`, player, amount: provisional, reasonCode, evidenceHash, sourceHash, recordedAt: createdAt, sourceId: contributionId, countsAsReceipt: true });
        contribution.rewardEligibility.baseXp = provisional;
        contribution.rewardEligibility.baseStatus = 'QUEUED';
        contribution.xp.rewardEligibleBase = provisional;
      } else {
        contribution.rewardEligibility.eligible = false;
        contribution.rewardEligibility.reason = 'DAILY_BASE_RECEIPT_CAP_REACHED';
        contribution.rewardEligibility.baseStatus = 'WITHHELD_DAILY_CAP';
      }
    } else if (rewardEvidenceEligible) {
      const baseXp = Math.min(BASE_RECEIPT_XP_CAP, Math.max(0, provisional - starterBonus));
      const dailyBaseCount = baseReceiptCountForDay(state, owner, day);
      if (baseXp > 0 && dailyBaseCount < BASE_RECEIPTS_PER_WALLET_DAY) {
        const xpEvidenceHash = `0x${crypto.createHash('sha256').update(JSON.stringify({ type: 'VALIDATED_RESEARCH_BASE', contributionId, owner, petGenesisId: player.pet.genesisId, createdAt, receiptClass: research.receiptClass })).digest('hex')}`;
        const sourceHash = alphaCall?.commitmentHash || `0x${crypto.createHash('sha256').update(JSON.stringify({ contributionId, canonicalKey, value: value.type })).digest('hex')}`;
        queueAlphaReward(state, protocolActions, { id: contributionId, player, amount: baseXp, reasonCode: 'VALIDATED_RESEARCH_BASE', evidenceHash: xpEvidenceHash, sourceHash, recordedAt: createdAt, sourceId: contributionId, receiptId: contributionId, receiptClass: research.receiptClass, countsAsReceipt: true });
        contribution.rewardEligibility.baseXp = baseXp;
        contribution.rewardEligibility.baseStatus = 'QUEUED';
        contribution.xp.rewardEligibleBase = baseXp;
      } else {
        contribution.rewardEligibility.eligible = false;
        contribution.rewardEligibility.reason = 'DAILY_BASE_RECEIPT_CAP_REACHED';
        contribution.rewardEligibility.baseStatus = 'WITHHELD_DAILY_CAP';
      }
    }
    let projectQuestPublished = false;
    if (!projectQuest && value.type === 'contract_scout') {
      const safety = inspection.projectSafety || { status: 'ANALYTICS_UNAVAILABLE', eligible: true, corroborationEligible: true, analyticsAvailable: false, qualityGatePassed: null, score: 0, posture: 'UNKNOWN', criticalFlags: [], cautionFlags: [], sourceStatus: 'UNAVAILABLE', marketSources: {} }; const questId = crypto.createHash('sha256').update(`project:${canonicalKey}:${createdAt}`).digest('hex').slice(0, 20);
      state.projectQuests ||= {};
      const priorQuest = state.projectQuests[canonicalKey];
      if (priorQuest) {
        state.projectQuestHistory ||= {};
        state.projectQuestHistory[priorQuest.id] = { ...priorQuest, archivedAt: createdAt, archiveReason: 'SEVEN_DAY_WINDOW_COMPLETE' };
      }
      state.projectQuests[canonicalKey] = {
        id: questId,
        address: canonicalKey,
        name: safeText(safety.name || '', 80) || null,
        symbol: safeText(safety.symbol || '', 20) || null,
        nominatedBy: owner,
        nominationContributionId: contribution.id,
        createdAt,
        expiresAt: new Date(Date.parse(createdAt) + PROJECT_QUEST_DURATION_MS).toISOString(),
        safety: {
          status: safety.status,
          analyticsAvailable: safety.analyticsAvailable !== false,
          qualityGatePassed: safety.qualityGatePassed === true,
          performanceEligible: safety.performanceEligible === true,
          performanceEligibilityReason: safeText(safety.performanceEligibilityReason, 100) || null,
          qualityClassification: safeText(safety.qualityClassification, 60) || null,
          score: clamp(safety.score),
          posture: safeText(safety.posture, 60),
          navigationReady: safety.navigationReady === true,
          failedNavigationGates: (safety.failedNavigationGates || []).map((gate) => safeText(gate, 80)).slice(0, 16),
          verifiedSource: safety.verifiedSource === true,
          criticalFlags: (safety.criticalFlags || []).map((flag) => safeText(flag, 80)).slice(0, 8),
          cautionFlags: (safety.cautionFlags || []).map((flag) => safeText(flag, 80)).slice(0, 8),
          checkedAt: safety.checkedAt || createdAt,
          sourceStatus: safeText(safety.sourceStatus, 40),
          liquidityUsd: Number(safety.liquidityUsd || 0),
          holderCount: Number.isFinite(Number(safety.holderCount)) && Number(safety.holderCount) >= 0
            ? Math.floor(Number(safety.holderCount))
            : null,
          marketSources: safety.marketSources || {},
          routeSnapshot: safety.routeSnapshot || null,
          tradeCosts: safety.tradeCosts || null,
        },
        safetyHistory: [alphaSafetyHistoryEntry(safety, alphaCall?.poolAddress || safety.routeSnapshot?.poolAddress)],
        projectContext: contribution.projectContext,
      };
      contribution.projectQuestId = questId; projectQuestPublished = true;
    }
    const projectViewBefore = contribution.projectQuestId
      ? projectQuestViews(state, null, Date.parse(createdAt), { pinnedAddress: canonicalAxoAddress })
        .find((item) => item.id === contribution.projectQuestId) || null
      : null;
    state.contributions.push(contribution); player.pet.xp += provisional; player.pet.abilities[value.task.ability] = Number(player.pet.abilities[value.task.ability] || 1) + 2;
    player.pet.vitals.curiosity = clamp(player.pet.vitals.curiosity + 4); player.pet.vitals.bond = clamp(player.pet.vitals.bond + 2); player.pet.vitals.happiness = clamp(player.pet.vitals.happiness + 3); player.pet.vitals.energy = clamp(player.pet.vitals.energy - 5, 15, 100);
    player.pet.lastCareAt = createdAt; player.updatedAt = createdAt;
    if (!projectQuest) {
      player.feeding.lastFedAt = createdAt;
      player.feeding.totalFeeds = Number(player.feeding.totalFeeds || 0) + 1;
    }
    player.reputation.validContributions = Number(player.reputation.validContributions || 0) + 1; reputationDomain(player, value.type).submissions += 1; player.onboarding.firstExpedition = true; player.onboarding.starterBonusClaimed = true; if (player.onboarding.cared && player.onboarding.skillChosen) player.onboarding.completedAt ||= createdAt; touchActiveDay(player, day);
    const records = consensusSettlementRecords(state, Date.parse(createdAt)); settleConsensusRewards(state, records, createdAt, (reward) => queueParticipationReward(state, protocolActions, reward));
    const projectViewAfter = contribution.projectQuestId
      ? projectQuestViews(state, null, Date.parse(createdAt), { pinnedAddress: canonicalAxoAddress })
        .find((item) => item.id === contribution.projectQuestId) || null
      : null;
    const projectPreviouslySpotlighted = contribution.projectQuestId
      ? (state.events || []).some((event) => event.metadata?.projectQuestId === contribution.projectQuestId
        && event.metadata?.projectHighScoreActivated === true)
      : false;
    const projectHighScoreActivated = projectQuest
      && value.verdict !== 'SCAM'
      && contribution.consensusEligible === true
      && Number(contribution.heatScore) >= PROJECT_HIGH_SCORE_MINIMUM
      && !projectPreviouslySpotlighted
      && !isHighScoreProjectView(projectViewBefore)
      && isHighScoreProjectView(projectViewAfter);
    let communityScam = null;
    if (projectQuest && value.verdict === 'SCAM') {
      const currentEpochId = epochWindow(Date.parse(createdAt)).id;
      const scamVotes = qualifiedProjectScamVotes(state.contributions, contribution.projectQuestId, currentEpochId);
      communityScam = {
        status: scamVotes.length >= PROJECT_SCAM_QUORUM ? 'COMMUNITY_SCAM' : 'FORMING',
        votes: scamVotes.length,
        threshold: PROJECT_SCAM_QUORUM,
        remaining: Math.max(0, PROJECT_SCAM_QUORUM - scamVotes.length),
        removedFromActiveList: false,
      };
      if (scamVotes.length >= PROJECT_SCAM_QUORUM && canonicalKey !== canonicalAxoAddress) {
        const quest = state.projectQuests?.[canonicalKey];
        if (quest) {
          const registryEntry = {
            address: canonicalKey,
            status: 'COMMUNITY_SCAM',
            classification: 'COMMUNITY_SCAM_CONSENSUS',
            source: 'HATCHERY_QUALIFIED_CREW_QUORUM',
            projectQuestId: quest.id,
            epochId: currentEpochId,
            voteCount: scamVotes.length,
            threshold: PROJECT_SCAM_QUORUM,
            contributionIds: scamVotes.map((vote) => vote.id),
            flaggedAt: createdAt,
            affectsProductionSafetyRegistry: false,
            note: 'Community scam consensus only; not an independent AXO security audit or provider-confirmed malicious classification.',
          };
          state.communityScamRegistry ||= {};
          state.communityScamRegistry[canonicalKey] = registryEntry;
          state.projectQuestHistory ||= {};
          state.projectQuestHistory[quest.id] = { ...quest, status: 'COMMUNITY_SCAM', archivedAt: createdAt, archiveReason: 'THREE_QUALIFIED_CREW_SCAM_VOTES', communityScam: registryEntry };
          delete state.projectQuests[canonicalKey];
          communityScam = { ...communityScam, ...registryEntry, removedFromActiveList: true };
          recordEvent(state, 'PROJECT_COMMUNITY_SCAM_FLAGGED', player.id, { projectQuestId: quest.id, address: canonicalKey, epochId: currentEpochId, voteCount: scamVotes.length, threshold: PROJECT_SCAM_QUORUM, affectsProductionSafetyRegistry: false }, createdAt);
        }
      }
    }
    const contributionEventType = projectQuest
      ? value.verdict === 'SCAM' ? 'PROJECT_QUEST_SCAM_VOTE' : 'PROJECT_QUEST_CORROBORATED'
      : projectQuestPublished ? 'PROJECT_QUEST_PUBLISHED' : 'EXPEDITION_RECEIPT_SUBMITTED';
    player.pet.lastReply = currentLevel(player.pet.xp) >= 10 ? matureReply('feed') : companionReply('feed'); recordEvent(state, contributionEventType, player.id, { contributionId: contribution.id, projectQuestId: contribution.projectQuestId, type: value.type, verdict: value.verdict, heatScore: contribution.heatScore, provisionalXp: provisional, pendingXp: pending, dataQualityScore, consensusEligible: contribution.consensusEligible, projectHighScoreActivated, projectVoteCount: Number(projectViewAfter?.feedCount || 0), projectQualifiedVoteCount: Number(projectViewAfter?.qualifiedContributors || 0), projectHighScoreQualifiedVoteCount: Number(projectViewAfter?.highScoreQualifiedContributors || 0), projectAverageHeatScore: Number.isFinite(Number(projectViewAfter?.averageHeatScore)) ? Number(projectViewAfter.averageHeatScore) : null, projectConsensusStatus: projectViewAfter?.status || null, alphaCallCommitmentHash: alphaCall?.commitmentHash || null, alphaCallHorizon: alphaCall?.horizon || null, humanObservationFields: Object.entries(humanObservation).filter(([key, value]) => !key.startsWith('affects') && Boolean(value)).map(([key]) => key), humanObservationAffectsTrust: false, humanObservationAffectsRanking: false }, createdAt); saveState(state, { protocolActions });
    const resultContribution = state.contributions.find((item) => item.id === contribution.id);
    return { ...snapshot(owner), result: { contributionId: contribution.id, projectQuestId: contribution.projectQuestId, projectQuestPublished, projectQuestAcknowledged: projectQuest, firstScout: contractDiscovery, judgmentRecorded: contractJudgment || canonicalFirstCall, epochId: epochWindow(Date.parse(createdAt)).id, weeklyVettingStatus: contractJudgment ? 'DONE_THIS_EPOCH' : null, verdict: contractJudgment || canonicalFirstCall ? value.verdict : null, conviction: contractJudgment || canonicalFirstCall ? value.confidence : null, heatScore: contractJudgment || canonicalFirstCall ? contribution.heatScore : null, communityScam, humanObservation, alphaCall: alphaCall ? { status: alphaCall.status, mode: alphaCall.mode || 'PLAYER_STRUCTURED', commitmentHash: alphaCall.commitmentHash, commitmentScope: alphaCall.commitmentScope, horizon: alphaCall.horizon, expiresAt: alphaCall.expiresAt, requestedExpiresAt: alphaCall.requestedExpiresAt, performanceEpochId: alphaCall.performanceEpochId, performanceEligible: alphaCall.safety?.initial?.eligible === true, performanceEligibilityReason: alphaCall.safety?.initial?.reason || null, walletActionRequired: alphaCall.commitment?.walletActionRequired === true, transactionReady: alphaCall.commitment?.walletActionRequired === true && Boolean(protocolConfig.intelRegistryAddress) } : null, protocolActions: protocolActions.map((action) => ({ actionType: action.actionType, status: action.status })), xpAwarded: provisional, corroborationBonusAwarded: Math.max(0, Number(resultContribution.xp.released || 0) - provisional), xpPending: resultContribution.xp.pending, xpSettlement: resultContribution.xp.settlement, rewardEligibility: resultContribution.rewardEligibility, receiptClass: resultContribution.receiptClass, dataQualityScore, evidenceScore: dataQualityScore, verification: contribution.evidence.verification, consensusEligible: contribution.consensusEligible, status: resultContribution.status, reply: player.pet.lastReply, feedingCooldownMs: projectQuest ? 0 : FEEDING_COOLDOWN_MS } };
    } finally {
      if (ordinaryFeed) feedingInFlight.delete(owner);
    }
  }
  async function upgradeContractAlpha(address, contributionId, input, context = {}) {
    const owner = requireAddress(address);
    const receiptId = safeText(contributionId, 60);
    const initial = readState();
    const existing = initial.contributions.find((item) => item.id === receiptId && item.playerId === owner);
    if (!existing) throw new Error('contract_alpha_upgrade_receipt_not_found');
    if (existing.type !== 'contract_scout' || String(existing.taskId || '').startsWith('project:')) throw new Error('contract_alpha_upgrade_receipt_invalid');
    if (existing.alphaCall) throw new Error('contract_alpha_already_structured');
    if (existing.day !== isoDay(now())) throw new Error('contract_alpha_upgrade_window_expired');
    const upgradeTask = { id: existing.taskId, type: 'contract_scout', ...TASKS.contract_scout, projectQuest: false };
    const value = validateContribution({ ...input, taskId: existing.taskId, type: 'contract_scout', data: existing.entity }, [upgradeTask], now());
    if (entityKey(value.entity) !== entityKey(existing.entity)) throw new Error('contract_alpha_upgrade_contract_mismatch');
    if (feedingInFlight.has(owner)) throw new Error('feeding_cooldown_active');
    feedingInFlight.add(owner);
    try {
      const inspection = await inspectEvidence({ ownerAddress: owner, holder: context.holder === true, type: 'contract_scout', entity: existing.entity, evidenceUrl: null, task: upgradeTask });
      if (inspection?.contract?.status === 'NOT_DEPLOYED') throw new Error('robinhood_contract_not_deployed');
      if (inspection?.contract?.status === 'VALIDATION_UNAVAILABLE') throw new Error('contract_verification_unavailable');
      const state = readState();
      const player = state.players[owner];
      const contribution = state.contributions.find((item) => item.id === receiptId && item.playerId === owner);
      if (!player || !contribution) throw new Error('contract_alpha_upgrade_receipt_not_found');
      requireXpParticipation(player);
      if (contribution.alphaCall) throw new Error('contract_alpha_already_structured');
      if (contribution.day !== isoDay(now())) throw new Error('contract_alpha_upgrade_window_expired');
      const createdAt = new Date(now()).toISOString();
      const humanIdentity = verifiedHumanIdentity(player, protocolConfig.humanIdentityRequired === true, now());
      const identity = {
        activityVerified: inspection?.identity?.activityVerified === true,
        rewardActivityVerified: inspection?.identity?.rewardActivityVerified !== undefined ? inspection.identity.rewardActivityVerified === true : inspection?.identity?.activityVerified === true,
        activityScore: Number(inspection?.identity?.activityScore || 0),
        transactions: inspection?.identity?.transactions ?? null,
        tokenTransfers: inspection?.identity?.tokenTransfers ?? null,
        qualification: inspection?.identity?.qualification || 'INSUFFICIENT_ACTIVITY',
        rewardQualification: inspection?.identity?.rewardQualification || (inspection?.identity?.activityVerified === true ? 'ESTABLISHED_ONCHAIN_ACTIVITY' : 'INSUFFICIENT_ACTIVITY'),
        sybilResistanceVersion: Number(inspection?.identity?.sybilResistanceVersion || 3),
        checkedAt: createdAt,
        source: inspection?.identity?.source || 'UNVERIFIED',
        providerTrail: (inspection?.identity?.providerTrail || []).slice(0, 4),
        humanIdentity,
      };
      player.identity = identity;
      const research = researchReceiptAssessment(value, inspection, context, humanIdentity);
      const liveMarketSources = Object.values(inspection?.projectSafety?.marketSources || {}).filter((status) => status === 'LIVE').length;
      const researchFieldScore = Object.values(research.fields).filter(Boolean).length * 10;
      const contractScore = inspection?.contract?.status === 'DEPLOYED_CONTRACT' ? 25 : 0;
      const dataQualityScore = Math.min(100, researchFieldScore + contractScore + (identity.rewardActivityVerified ? 20 : 0) + Math.min(15, liveMarketSources * 8));
      const rewardEvidenceEligible = research.eligible && dataQualityScore >= VERIFIED_DATA_QUALITY_MINIMUM;
      const requestedAlphaCall = value.alphaCall || automaticContractAlphaCall(contribution.entity, inspection?.projectSafety, now());
      const protocolActions = [];
      let initialSafety = null;
      let outcomeWindow = null;
      if (requestedAlphaCall) {
        const automatic = requestedAlphaCall.systemGenerated === true && requestedAlphaCall.mode === AUTOMATIC_CONTRACT_ALPHA_MODE;
        const submittedAt = automatic ? requestedAlphaCall.observedAt : createdAt;
        try {
          outcomeWindow = alphaOutcomeWindow(submittedAt, requestedAlphaCall.horizon);
        } catch (error) {
          if (!automatic) throw error;
        }
        if (outcomeWindow) {
          initialSafety = alphaPerformanceSafety(inspection?.projectSafety, requestedAlphaCall.poolAddress);
          const canonicalCall = {
            chainId: 4663, wallet: owner, petGenesisId: player.pet.genesisId,
            tokenAddress: contribution.entityKey || entityKey(contribution.entity), poolAddress: requestedAlphaCall.poolAddress,
            entry: requestedAlphaCall.entry, targetPrice: requestedAlphaCall.targetPrice, stopPrice: requestedAlphaCall.stopPrice,
            horizon: requestedAlphaCall.horizon,
            thesis: automatic ? 'Contract address captured by AXO for automatic market observation and independent Crew corroboration.' : value.reason,
            evidenceUrl: value.evidenceUrl,
            observedAt: automatic ? requestedAlphaCall.observedAt : value.observedAt,
            disclosure: requestedAlphaCall.disclosure,
            submittedAt,
          };
          const commitment = intelCommitAction({ contributionId: contribution.id, registryAddress: automatic ? null : protocolConfig.intelRegistryAddress || null, content: canonicalCall });
          if (!automatic) protocolActions.push(commitment.action);
          contribution.alphaCall = {
            ...requestedAlphaCall,
            tokenAddress: canonicalCall.tokenAddress,
            thesis: canonicalCall.thesis,
            evidenceUrl: value.evidenceUrl,
            observedAt: canonicalCall.observedAt,
            submittedAt,
            requestedExpiresAt: outcomeWindow.requestedEndsAt,
            expiresAt: outcomeWindow.endsAt,
            performanceEpochId: outcomeWindow.epochId,
            performanceWindow: outcomeWindow,
            status: rewardEvidenceEligible ? 'VALIDATED' : 'SUBMITTED',
            commitmentHash: commitment.contentHash,
            commitmentScope: automatic ? 'SERVER_RECEIPT_ONLY' : protocolConfig.intelRegistryAddress ? 'ONCHAIN_USER_COMMITMENT_PENDING' : 'ONCHAIN_REGISTRY_NOT_DEPLOYED',
            commitment: { petIdHash: commitment.petIdHash, clientNonce: commitment.clientNonce, registryAddress: automatic ? null : protocolConfig.intelRegistryAddress || null, walletActionRequired: !automatic },
            safety: { initial: initialSafety, settlement: null },
            performance: { status: 'NOT_SCORED', fixedTradeUsd: ALPHA_CALL_HYPOTHETICAL_TRADE_USD, returnPct: null, realizedProfitUsd: null, potentialProfitUsd: null, potentialReturnPct: null, profitMultiplier: null, performanceXp: 0, targetHitAt: null, stopHitAt: null, scoredAt: null },
          };
        }
      }
      contribution.reason = value.reason;
      contribution.evidenceUrl = value.evidenceUrl;
      contribution.observedAt = value.observedAt;
      contribution.contradiction = value.contradiction;
      contribution.verdict = value.verdict;
      contribution.feeling = value.verdict;
      contribution.confidence = value.confidence;
      contribution.humanObservation = { reason: value.reason, evidenceUrl: value.evidenceUrl, observedAt: value.observedAt, contradiction: value.contradiction, source: 'AUTOMATED_CONTRACT_CAPTURE', affectsContributorTrust: false, affectsConsensusWeight: false, affectsProductionRanking: false };
      contribution.receiptClass = research.receiptClass;
      contribution.consensusEligible = rewardEvidenceEligible;
      contribution.consensusEligibility = rewardEvidenceEligible ? 'QUALIFIED_AUTOMATED_CONTRACT_EVIDENCE_AND_IDENTITY' : research.reason || 'DATA_QUALITY_BELOW_MINIMUM';
      contribution.rewardEligibility = { eligible: rewardEvidenceEligible, reason: rewardEvidenceEligible ? null : research.reason || 'DATA_QUALITY_BELOW_MINIMUM', baseXp: 0, baseStatus: rewardEvidenceEligible ? 'PENDING_DAILY_CAP' : 'WITHHELD' };
      contribution.status = 'PENDING_CORROBORATION';
      contribution.evidence = {
        status: inspection?.contract?.status || 'DATA_ACKNOWLEDGED', domain: evidenceDomain(value.evidenceUrl), qualityScore: dataQualityScore,
        research: { ...research, score: researchFieldScore }, projectSafety: inspection?.projectSafety || null,
        verification: {
          mode: research.verificationMode,
          contractSource: inspection?.contract?.source || null, contractAuthoritativeSource: inspection?.contract?.authoritativeSource || null,
          contractCorroboratedBy: inspection?.contract?.corroboratedBy || [], contractProviderChecks: inspection?.contract?.providerChecks || {},
          contractProviderDisagreement: inspection?.contract?.providerDisagreement === true, contractProviderTrail: (inspection?.contract?.providerTrail || []).slice(0, 6),
          contractProofStrength: inspection?.contract?.proofStrength || null, contractBlockNumber: inspection?.contract?.blockNumber ?? null,
          contractBlockHash: inspection?.contract?.blockHash || null, contractCodeHash: inspection?.contract?.codeHash || null,
          identitySource: identity.source, identityProviderTrail: identity.providerTrail, humanIdentitySource: humanIdentity.source,
          marketSources: inspection?.projectSafety?.marketSources || {}, explorerProvider: inspection?.projectSafety?.explorerProvider || null,
          providerFallback: inspection?.projectSafety?.providerFallback || null,
        },
        checkedAt: createdAt,
      };
      const quest = state.projectQuests?.[entityKey(contribution.entity)];
      if (quest && inspection?.projectSafety) {
        quest.safety = { ...quest.safety, ...inspection.projectSafety, checkedAt: inspection.projectSafety.checkedAt || createdAt };
        quest.safetyHistory ||= [];
        quest.safetyHistory.push(alphaSafetyHistoryEntry(quest.safety, contribution.alphaCall?.poolAddress || quest.safety?.routeSnapshot?.poolAddress));
        quest.safetyHistory = quest.safetyHistory.slice(-PROJECT_SAFETY_HISTORY_LIMIT);
      }
      if (rewardEvidenceEligible) {
        const baseXp = Math.min(BASE_RECEIPT_XP_CAP, Math.max(0, Number(contribution.xp?.provisional || 0)));
        const dailyBaseCount = baseReceiptCountForDay(state, owner, contribution.day);
        if (baseXp > 0 && dailyBaseCount < BASE_RECEIPTS_PER_WALLET_DAY) {
          const evidenceHash = `0x${crypto.createHash('sha256').update(JSON.stringify({ type: 'VALIDATED_RESEARCH_BASE', contributionId: contribution.id, owner, petGenesisId: player.pet.genesisId, upgradedAt: createdAt, receiptClass: research.receiptClass })).digest('hex')}`;
          const sourceHash = contribution.alphaCall?.commitmentHash || `0x${crypto.createHash('sha256').update(JSON.stringify({ contributionId: contribution.id, entity: contribution.entity, upgradedAt: createdAt })).digest('hex')}`;
          queueAlphaReward(state, protocolActions, { id: contribution.id, player, amount: baseXp, reasonCode: 'VALIDATED_RESEARCH_BASE', evidenceHash, sourceHash, recordedAt: createdAt, sourceId: contribution.id, receiptId: contribution.id, receiptClass: research.receiptClass, countsAsReceipt: true });
          contribution.rewardEligibility.baseXp = baseXp;
          contribution.rewardEligibility.baseStatus = 'QUEUED';
          contribution.xp.rewardEligibleBase = baseXp;
        } else {
          contribution.rewardEligibility.eligible = false;
          contribution.rewardEligibility.reason = 'DAILY_BASE_RECEIPT_CAP_REACHED';
          contribution.rewardEligibility.baseStatus = 'WITHHELD_DAILY_CAP';
        }
      }
      refreshIntelligence(state);
      recordEvent(state, 'CONTRACT_ALPHA_UPGRADED', owner, { contributionId: contribution.id, mode: contribution.alphaCall?.mode || 'CONTRACT_ADDRESS_ONLY', performanceEpochId: outcomeWindow?.epochId || null, initialMechanicalClearance: initialSafety?.eligible === true, dataQualityScore, rewardEvidenceEligible, affectsProductionRanking: false }, createdAt);
      saveState(state, { protocolActions });
      return {
        ...snapshot(owner),
        result: {
          upgraded: true, contributionId: contribution.id, projectQuestId: contribution.projectQuestId,
          projectQuestPublished: false, projectQuestAcknowledged: true, humanObservation: contribution.humanObservation,
          alphaCall: contribution.alphaCall ? { status: contribution.alphaCall.status, mode: contribution.alphaCall.mode || 'PLAYER_STRUCTURED', commitmentHash: contribution.alphaCall.commitmentHash, commitmentScope: contribution.alphaCall.commitmentScope, horizon: contribution.alphaCall.horizon, expiresAt: contribution.alphaCall.expiresAt, requestedExpiresAt: contribution.alphaCall.requestedExpiresAt, performanceEpochId: contribution.alphaCall.performanceEpochId, performanceEligible: initialSafety?.eligible === true, performanceEligibilityReason: initialSafety?.reason || null, walletActionRequired: contribution.alphaCall.commitment?.walletActionRequired === true, transactionReady: contribution.alphaCall.commitment?.walletActionRequired === true && Boolean(protocolConfig.intelRegistryAddress) } : null,
          protocolActions: protocolActions.map((action) => ({ actionType: action.actionType, status: action.status })),
          xpAwarded: 0, xpPending: contribution.xp?.pending || 0, xpSettlement: contribution.xp?.settlement,
          rewardEligibility: contribution.rewardEligibility, receiptClass: contribution.receiptClass, dataQualityScore, evidenceScore: dataQualityScore,
          verification: contribution.evidence.verification, consensusEligible: contribution.consensusEligible, status: contribution.status,
          reply: contribution.alphaCall ? 'Contract confirmed. AXO attached automatic paper tracking and opened it for Crew corroboration.' : 'Contract confirmed and opened for Crew corroboration. Market tracking remains evidence-gated.', feedingCooldownMs: 0,
        },
      };
    } finally {
      feedingInFlight.delete(owner);
    }
  }
  function claimHatchShare(address, postUrl) {
    if (!socialRewardMissionsActive) throw new Error('social_reward_missions_retired');
    const { state, player } = requirePlayer(address); const normalizedPostUrl = normalizeXStatusUrl(postUrl);
    requireXpParticipation(player);
    if (!normalizedPostUrl) throw new Error('x_status_url_required');
    player.social ||= {}; player.social.hatchAnnouncement ||= { status: 'AVAILABLE' };
    if (player.social.hatchAnnouncement.status === 'CLAIMED') throw new Error('hatch_share_already_claimed');
    const postId = normalizedPostUrl.split('/').at(-1); const claimKey = socialPostClaimKey('x', normalizedPostUrl); const duplicate = Boolean(state.socialPostClaims?.[claimKey]) || Object.values(state.players).some((candidate) => candidate.id !== player.id && candidate.social?.hatchAnnouncement?.postUrl?.split('/').at(-1) === postId)
      || (state.events || []).some((event) => event.type === 'HATCH_ANNOUNCEMENT_CLAIMED' && event.metadata?.postId === postId);
    if (duplicate) throw new Error('x_status_url_already_used');
    const claimedAt = new Date(now()).toISOString();
    player.social.hatchAnnouncement = { status: 'CLAIMED', postUrl: normalizedPostUrl, claimedAt, xpAwarded: HATCH_SHARE_XP, verification: 'SELF_ATTESTED_STATUS_URL' };
    state.socialPostClaims ||= {}; state.socialPostClaims[claimKey] = { platform: 'x', playerId: player.id, kind: 'HATCH_ANNOUNCEMENT', claimedAt };
    player.pet.xp += HATCH_SHARE_XP; player.updatedAt = claimedAt; player.pet.lastReply = currentLevel(player.pet.xp) >= 10 ? matureReply('share') : companionReply('share');
    recordEvent(state, 'HATCH_ANNOUNCEMENT_CLAIMED', player.id, { xp: HATCH_SHARE_XP, postId, verification: 'SELF_ATTESTED_STATUS_URL', platformVerified: false, competitiveEligible: false, affectsContributorTrust: false }, claimedAt);
    saveState(state);
    return { ...snapshot(player.ownerAddress), result: { xpAwarded: HATCH_SHARE_XP, postUrl: normalizedPostUrl, verification: 'SELF_ATTESTED_STATUS_URL', affectsContributorTrust: false } };
  }
  function claimDailySocialFeeding(address, input = {}, context = {}) {
    if (!socialRewardMissionsActive) throw new Error('social_reward_missions_retired');
    const { state, player } = requirePlayer(address); const platform = safeText(input.platform, 20).toLowerCase();
    requireXpParticipation(player);
    requireCanonicalAxoQuestAccess(state, player);
    if (!['x', 'telegram'].includes(platform)) throw new Error('social_feeding_platform_invalid');
    const xIdentity = player.social?.identities?.x;
    const telegramIdentity = player.social?.identities?.telegram;
    if (xIdentity?.verification !== 'PLATFORM_VERIFIED' || telegramIdentity?.verification !== 'PLATFORM_VERIFIED') throw new Error('social_identity_bundle_required');
    const currentMs = now();
    const membershipReceipt = normalizeTelegramMembershipReceipt(player, context.telegramMembership, currentMs, { requireMember: true });
    player.social.telegramMembership = membershipReceipt;
    const linkedIdentity = player.social?.identities?.[platform]; if (!linkedIdentity) throw new Error('social_identity_required');
    if (linkedIdentity.verification !== 'PLATFORM_VERIFIED') throw new Error('social_identity_platform_verification_required');
    if (platform === 'x' && !linkedIdentity.handle) throw new Error('social_identity_required');
    if (input.attested !== true) throw new Error('social_feeding_attestation_required');
    const normalizedPostUrl = platform === 'x' ? normalizeXStatusUrl(input.postUrl) : normalizeTelegramPostUrl(input.postUrl);
    if (!normalizedPostUrl) throw new Error(platform === 'x' ? 'x_status_url_required' : 'telegram_post_url_required');
    const sourceHandle = socialPostSourceHandle(platform, normalizedPostUrl);
    if (platform === 'x' && sourceHandle !== linkedIdentity.handle) throw new Error('social_feeding_author_mismatch');
    const telegramReceiptMatches = context.platformVerified === true
      && context.authorHandle === linkedIdentity.handle
      && context.postUrl === normalizedPostUrl
      && String(context.providerPostId || '') === normalizedPostUrl.split('/').at(-1);
    const platformVerified = linkedIdentity.verification === 'PLATFORM_VERIFIED'
      && (platform === 'x' ? context.platformVerified === true : telegramReceiptMatches);
    const authorVerification = platformVerified
      ? (platform === 'telegram' ? context.verification || 'TELEGRAM_PUBLIC_EMBED_EXACT_MESSAGE_LINKED_AUTHOR' : 'PLATFORM_VERIFIED_POST')
      : platform === 'x' ? 'AUTHOR_HANDLE_MATCHED' : 'TELEGRAM_PUBLIC_AUTHOR_UNVERIFIED';
    if (!platformVerified) throw new Error('social_feeding_post_verification_required');
    const day = isoDay(currentMs); player.social ||= {}; player.social.daily ||= {};
    const prior = player.social.daily[platform] || {};
    const priorEvent = [...(state.events || [])].reverse().find((event) => event.type === 'DAILY_SOCIAL_FEEDING_CLAIMED' && event.playerId === player.id && event.metadata?.platform === platform);
    const priorCooldown = socialQuestCooldown(prior.claimedAt ? prior : { ...prior, claimedAt: priorEvent?.at || null }, currentMs);
    if (priorCooldown.coolingDown) throw new Error('social_feeding_cooldown_active');
    const claimKey = socialPostClaimKey(platform, normalizedPostUrl); const postId = platform === 'x' ? normalizedPostUrl.split('/').at(-1) : null;
    const priorHatchUse = platform === 'x' && (state.events || []).some((event) => event.type === 'HATCH_ANNOUNCEMENT_CLAIMED' && event.metadata?.postId === postId);
    if (state.socialPostClaims?.[claimKey] || priorHatchUse) throw new Error('social_post_url_already_used');
    const claimedAt = new Date(currentMs).toISOString();
    player.social.daily[platform] = { day, postUrl: normalizedPostUrl, claimedAt, xpAwarded: DAILY_SOCIAL_FEEDING_XP, epochXpAwarded: DAILY_SOCIAL_FEEDING_XP, authorHandle: linkedIdentity.handle, verification: authorVerification, identityBundleVerified: true, telegramMembershipVerified: true };
    player.pet.xp += DAILY_SOCIAL_FEEDING_XP;
    player.pet.lastReply = currentLevel(player.pet.xp) >= 10 ? matureReply('social') : companionReply('social'); player.pet.lastCareAt = claimedAt; player.updatedAt = claimedAt;
    player.feeding.lastFedAt = claimedAt; player.feeding.totalFeeds = Number(player.feeding.totalFeeds || 0) + 1; touchActiveDay(player, day);
    state.socialPostClaims ||= {}; state.socialPostClaims[claimKey] = { platform, playerId: player.id, kind: 'DAILY_SOCIAL_FEEDING', day, claimedAt };
    const providerPostId = context.providerPostId || normalizedPostUrl.split('/').at(-1);
    const evidenceHash = `0x${crypto.createHash('sha256').update(JSON.stringify({ type: 'DAILY_SOCIAL', platform, day, playerId: player.id, postUrl: normalizedPostUrl, providerPostId })).digest('hex')}`;
    const sourceHash = `0x${crypto.createHash('sha256').update(`daily-social:${platform}:${providerPostId}:${linkedIdentity.providerUserId}`).digest('hex')}`;
    queueEpochLedgerReward(state, {
      id: `daily-social:${platform}:${player.id}:${day}`,
      player,
      amount: DAILY_SOCIAL_FEEDING_XP,
      reasonCode: platform === 'x' ? 'DAILY_X_SOCIAL_FEEDING' : 'DAILY_TELEGRAM_SOCIAL_FEEDING',
      evidenceHash,
      sourceHash,
      recordedAt: claimedAt,
      sourceId: claimKey,
    });
    recordEvent(state, 'DAILY_SOCIAL_FEEDING_CLAIMED', player.id, { platform, day, claimKey, authorHandle: linkedIdentity.handle, sourceHandle, xp: DAILY_SOCIAL_FEEDING_XP, epochXp: DAILY_SOCIAL_FEEDING_XP, verification: authorVerification, platformVerified, identityBundleVerified: true, telegramMembershipVerified: true, telegramMembershipStatus: membershipReceipt.telegramStatus, competitiveEligible: true, providerPostId, affectsContributorTrust: false, affectsProjectHeat: false, affectsAlphaMining: false, affectsProductionRanking: false, evidenceHash }, claimedAt);
    saveState(state);
    return { ...snapshot(player.ownerAddress), result: { platform, day, xpAwarded: DAILY_SOCIAL_FEEDING_XP, petXpAwarded: DAILY_SOCIAL_FEEDING_XP, epochXpAwarded: DAILY_SOCIAL_FEEDING_XP, completionBonusXp: 0, postUrl: normalizedPostUrl, authorHandle: linkedIdentity.handle, verification: authorVerification, identityBundleVerified: true, telegramMembershipVerified: true, competitiveEligible: true, affectsContributorTrust: false, affectsProjectHeat: false, affectsAlphaMining: false, affectsProductionRanking: false, feedingCooldownMs: SOCIAL_QUEST_COOLDOWN_MS, nextAvailableAt: new Date(currentMs + SOCIAL_QUEST_COOLDOWN_MS).toISOString() } };
  }
  function claimDailyXEngagement(address, input = {}, context = {}) {
    if (!socialRewardMissionsActive) throw new Error('social_reward_missions_retired');
    const { state, player } = requirePlayer(address);
    requireXpParticipation(player);
    requireCanonicalAxoQuestAccess(state, player);
    const xIdentity = player.social?.identities?.x;
    const telegramIdentity = player.social?.identities?.telegram;
    if (xIdentity?.verification !== 'PLATFORM_VERIFIED' || telegramIdentity?.verification !== 'PLATFORM_VERIFIED') throw new Error('social_identity_bundle_required');
    const currentMs = now();
    const membershipReceipt = normalizeTelegramMembershipReceipt(player, context.telegramMembership, currentMs, { requireMember: true });
    player.social.telegramMembership = membershipReceipt;
    if (input.attested !== true) throw new Error('x_engagement_attestation_required');
    const targetUrl = normalizeXStatusUrl(input.targetUrl);
    const replyUrl = normalizeXStatusUrl(input.replyUrl);
    if (!targetUrl || !replyUrl || targetUrl === replyUrl) throw new Error('x_engagement_urls_invalid');
    const targetPostId = targetUrl.split('/').at(-1);
    const replyPostId = replyUrl.split('/').at(-1);
    const verified = context.platformVerified === true
      && context.liked === true
      && context.replied === true
      && String(context.targetPostId || '') === targetPostId
      && String(context.replyPostId || '') === replyPostId
      && normalizeXStatusUrl(context.targetUrl) === targetUrl
      && normalizeXStatusUrl(context.replyUrl) === replyUrl;
    if (!verified) throw new Error('x_engagement_verification_required');
    const day = isoDay(currentMs);
    player.social ||= {};
    player.social.daily ||= {};
    const prior = player.social.daily.engagement || {};
    const priorEvent = [...(state.events || [])].reverse().find((event) => event.type === 'DAILY_X_ENGAGEMENT_CLAIMED' && event.playerId === player.id);
    const priorCooldown = socialQuestCooldown(prior.claimedAt ? prior : { ...prior, claimedAt: priorEvent?.at || null }, currentMs);
    if (priorCooldown.coolingDown) throw new Error('x_engagement_cooldown_active');
    const claimKey = socialPostClaimKey('x', replyUrl);
    if (state.socialPostClaims?.[claimKey]) throw new Error('social_post_url_already_used');
    const claimedAt = new Date(currentMs).toISOString();
    const verification = safeText(context.verification, 80) || 'X_API_LIKE_REPLY';
    const evidenceHash = `0x${crypto.createHash('sha256').update(JSON.stringify({ type: 'DAILY_AXO_POST_ENGAGEMENT', day, playerId: player.id, targetPostId, replyPostId, xProviderUserId: xIdentity.providerUserId })).digest('hex')}`;
    const sourceHash = `0x${crypto.createHash('sha256').update(`axo-main-engagement:${targetPostId}:${replyPostId}`).digest('hex')}`;
    player.social.daily.engagement = { day, targetUrl, replyUrl, targetPostId, replyPostId, claimedAt, xpAwarded: DAILY_SOCIAL_FEEDING_XP, epochXpAwarded: DAILY_SOCIAL_FEEDING_XP, verification, liked: true, replied: true, telegramMembershipVerified: true };
    player.pet.xp += DAILY_SOCIAL_FEEDING_XP;
    player.pet.lastReply = currentLevel(player.pet.xp) >= 10 ? matureReply('social') : companionReply('social');
    player.pet.lastCareAt = claimedAt;
    player.updatedAt = claimedAt;
    touchActiveDay(player, day);
    state.socialPostClaims ||= {};
    state.socialPostClaims[claimKey] = { platform: 'x', playerId: player.id, kind: 'DAILY_AXO_POST_ENGAGEMENT', day, claimedAt };
    queueEpochLedgerReward(state, {
      id: `daily-axo-post-engagement:${player.id}:${day}`,
      player,
      amount: DAILY_SOCIAL_FEEDING_XP,
      reasonCode: 'DAILY_AXO_POST_ENGAGEMENT',
      evidenceHash,
      sourceHash,
      recordedAt: claimedAt,
      sourceId: claimKey,
    });
    recordEvent(state, 'DAILY_X_ENGAGEMENT_CLAIMED', player.id, { day, targetPostId, replyPostId, xp: DAILY_SOCIAL_FEEDING_XP, epochXp: DAILY_SOCIAL_FEEDING_XP, verification, liked: true, replied: true, competitiveEligible: true, telegramMembershipVerified: true, affectsContributorTrust: false, affectsProjectHeat: false, affectsAlphaMining: false, affectsProductionRanking: false, evidenceHash }, claimedAt);
    saveState(state);
    return { ...snapshot(player.ownerAddress), result: { day, targetUrl, replyUrl, petXpAwarded: DAILY_SOCIAL_FEEDING_XP, epochXpAwarded: DAILY_SOCIAL_FEEDING_XP, verification, liked: true, replied: true, competitiveEligible: true, affectsContributorTrust: false, affectsProjectHeat: false, affectsAlphaMining: false, affectsProductionRanking: false, cooldownMs: SOCIAL_QUEST_COOLDOWN_MS, nextAvailableAt: new Date(currentMs + SOCIAL_QUEST_COOLDOWN_MS).toISOString() } };
  }
  function claimDailySocialCreatorContribution(address, input = {}, context = {}) {
    if (!socialCreatorMissionsActive) throw new Error('social_creator_missions_paused');
    const { state, player } = requirePlayer(address);
    requireXpParticipation(player);
    if (!participationGateView(player, now()).complete) throw new Error('hatchery_crew_passport_required');
    requireCanonicalAxoQuestAccess(state, player);
    const kind = safeText(input.kind, 32).toLowerCase();
    const definition = {
      x_post: { recordKey: 'creatorX', reasonCode: 'DAILY_X_CREATOR_CONTRIBUTION' },
      telegram_post: { recordKey: 'creatorTelegram', reasonCode: 'DAILY_TELEGRAM_CREATOR_CONTRIBUTION' },
      axo_response: { recordKey: 'axoResponse', reasonCode: 'DAILY_AXO_POST_RESPONSE_CONTRIBUTION' },
    }[kind];
    if (!definition) throw new Error('social_creator_kind_invalid');
    const content = normalizeSocialCreatorContent(kind, input.content);
    let targetPostId = null;
    let targetUrl = null;
    if (kind === 'axo_response') {
      targetPostId = safeText(input.targetPostId, 24);
      const inputPostId = String(input.targetUrl || '').match(/\/status\/(\d{8,24})/)?.[1] || null;
      if (!/^\d{8,24}$/.test(targetPostId) || inputPostId !== targetPostId) throw new Error('social_creator_target_invalid');
      if (context.officialAxoPost !== true || String(context.targetPostId) !== targetPostId) throw new Error('social_creator_target_verification_required');
      targetUrl = safeUrl(context.targetUrl);
      if (!targetUrl || !targetUrl.includes(`/status/${targetPostId}`)) throw new Error('social_creator_target_receipt_mismatch');
    }
    const day = isoDay(now());
    player.social ||= {}; player.social.daily ||= {};
    const prior = player.social.daily[definition.recordKey] || {};
    if (prior.day === day || (state.events || []).some((event) => event.type === 'DAILY_SOCIAL_CREATOR_CONTRIBUTION_CLAIMED' && event.playerId === player.id && event.metadata?.kind === kind && event.metadata?.day === day)) {
      throw new Error('social_creator_already_claimed_today');
    }
    const normalizedForHash = content.toLowerCase().replace(/\s+/g, ' ').trim();
    const contentHash = crypto.createHash('sha256').update(normalizedForHash).digest('hex');
    const claimKey = `creator:${contentHash}`;
    if (state.socialPostClaims?.[claimKey]) throw new Error('social_creator_content_already_used');
    const claimedAt = new Date(now()).toISOString();
    const contentPreview = content.slice(0, 180);
    player.social.daily[definition.recordKey] = {
      day,
      content,
      contentHash,
      contentPreview,
      targetPostId,
      targetUrl,
      claimedAt,
      xpAwarded: DAILY_SOCIAL_FEEDING_XP,
      verification: kind === 'axo_response' ? context.verification || 'X_API_AXO_ORIGINAL_POST' : 'IN_HATCHERY_ORIGINAL_CREATOR_WORK',
      publishingRequired: false,
      externalActionRewarded: false,
    };
    player.pet.xp += DAILY_SOCIAL_FEEDING_XP;
    player.pet.lastReply = currentLevel(player.pet.xp) >= 10 ? matureReply('social') : companionReply('social');
    player.pet.lastCareAt = claimedAt;
    player.updatedAt = claimedAt;
    touchActiveDay(player, day);
    state.socialPostClaims ||= {};
    state.socialPostClaims[claimKey] = { platform: `CREATOR_${kind.toUpperCase()}`, playerId: player.id, kind: 'DAILY_SOCIAL_CREATOR_CONTRIBUTION', day, claimedAt };
    const evidenceHash = `0x${crypto.createHash('sha256').update(JSON.stringify({ type: 'DAILY_SOCIAL_CREATOR_CONTRIBUTION', kind, day, playerId: player.id, contentHash, targetPostId })).digest('hex')}`;
    const sourceHash = `0x${crypto.createHash('sha256').update(`social-creator:${kind}:${targetPostId || 'original'}:${contentHash}`).digest('hex')}`;
    queueEpochLedgerReward(state, {
      id: `daily-social-creator:${kind}:${player.id}:${day}`,
      player,
      amount: DAILY_SOCIAL_FEEDING_XP,
      reasonCode: definition.reasonCode,
      evidenceHash,
      sourceHash,
      recordedAt: claimedAt,
      sourceId: claimKey,
    });
    recordEvent(state, 'DAILY_SOCIAL_CREATOR_CONTRIBUTION_CLAIMED', player.id, {
      kind,
      day,
      targetPostId,
      targetUrl,
      contentHash,
      contentLength: content.length,
      xp: DAILY_SOCIAL_FEEDING_XP,
      epochXp: DAILY_SOCIAL_FEEDING_XP,
      rewardBasis: 'ORIGINAL_IN_HATCHERY_CREATOR_WORK',
      publishingRequired: false,
      externalActionRewarded: false,
      engagementMetricsRewarded: false,
      affectsContributorTrust: false,
      affectsProjectHeat: false,
      affectsConsensusWeight: false,
      affectsProductionRanking: false,
      evidenceHash,
    }, claimedAt);
    saveState(state);
    return {
      ...snapshot(player.ownerAddress),
      result: {
        kind,
        day,
        content,
        targetPostId,
        targetUrl,
        petXpAwarded: DAILY_SOCIAL_FEEDING_XP,
        epochXpAwarded: DAILY_SOCIAL_FEEDING_XP,
        rewardBasis: 'ORIGINAL_IN_HATCHERY_CREATOR_WORK',
        publishingRequired: false,
        externalActionRewarded: false,
      },
    };
  }
  function missionControl(address) {
    const { owner, state, player } = requirePlayer(address); const currentMs = now();
    const radar = readJson(radarFile, {}); const alpha = alphaFile ? readJson(alphaFile, {}) : {}; const narrative = narrativeFile ? readJson(narrativeFile, {}) : {}; const marketDatabase = marketDatabaseFile ? readJson(marketDatabaseFile, {}) : {};
    const playerView = publicPlayer(player, state.contributions, currentMs, radar, { passportRequired: participationIdentityRequired, socialRewardMissionsActive }); const petView = playerView.pet; const deck = missionDeck(state, player, currentMs);
    const preferenceHolder = walletProjectPreferenceHolder(state, owner, player);
    const catalog = missionControlCatalog(preferenceHolder, radar, alpha, marketDatabase); const preferences = missionControlPreferencesView(preferenceHolder, catalog);
    const activeSprint = Object.values(state.sprints || {}).find((sprint) => sprintStatus(sprint, currentMs) === 'ACTIVE') || null;
    const sprint = activeSprint ? publicSprint(state, activeSprint, currentMs) : null; const standing = sprint?.standings?.find((entry) => entry.genesisId === player.pet.genesisId) || null;
    const staff = staffContext(owner);
    return {
      generatedAt: new Date(currentMs).toISOString(),
      pet: { name: petView.name, genesisId: petView.genesisId, level: petView.level, levelStartXp: LEVELS[petView.level - 1].xp, xp: petView.xp, stage: petView.stage, nextLevel: petView.nextLevel, visual: petView.visual, lineage: petView.lineage, specialty: petView.specialty, vitals: petView.vitals, happy: petView.happy, toolPass: petView.toolPass, care: playerView.player.care },
      daily: deck,
      community: communityReadiness(state),
      calibration: calibrationView(state, player, currentMs),
      participation: participationGateView(player, currentMs),
      rewardHolding: rewardHoldingView(player),
      sprint: sprint ? { ...sprint, playerStanding: standing } : null,
      intelligence: personalizedIntel(player, state, radar, alpha, narrative),
      watchlist: watchlistView(player, radar, alpha),
      preferences,
      liveStream: { ...preferences.liveStream, catalog, catalogUpdatedAt: marketDatabase.updatedAt || radar.updatedAt || alpha.updatedAt || null, availableFilters: { categories: [...STREAM_CATEGORIES], taStates: [...STREAM_TA_STATES], riskModes: [...STREAM_RISK_MODES], sorts: [...STREAM_SORTS] } },
      staff,
      seasonZero: {
        key: 'AXO_SEASON_ZERO_MAP_ROBINHOOD', title: 'Season Zero · Map Robinhood Chain', status: Object.values(state.sprints || {}).some((item) => item.campaignKey === 'AXO_SEASON_ZERO_MAP_ROBINHOOD') ? 'CREATED' : 'BLUEPRINT_READY',
        durationDays: 7, communityGoal: 'Discover and independently corroborate Robinhood Chain projects.',
        scoring: ['Research evidence · 3× weight', 'Solo calibration while the Crew forms', 'Care · capped support weight', 'Verified social activity · support weight'],
        reward: { label: 'Season Zero Cartographer', description: 'A permanent launch-season field badge.', winnerCount: 10, bonusXp: 50 },
        readiness: communityReadiness(state), canLaunch: staff.permissions.adminConsole, launchesAutomatically: false,
      },
      policy: { walletPrivate: true, watchlistWalletBound: true, favoritesWalletBound: true, recentProjectsWalletBound: true, streamFiltersWalletBound: true, reactionsOnePerVerifiedWallet: true, reactionMinimumConsensus: CONSENSUS_MINIMUM, reactionsAreSentimentNotSafety: true, dailyXpAffectsTrust: false, productionRankingMutation: false, externalAgentData: 'X402_ONLY' },
    };
  }

  function missionControlPreferences(address) {
    const owner = requireAddress(address); const state = readState(); const player = state.players[owner] || null;
    const preferenceHolder = walletProjectPreferenceHolder(state, owner, player); const radar = readJson(radarFile, {}); const alpha = alphaFile ? readJson(alphaFile, {}) : {}; const marketDatabase = marketDatabaseFile ? readJson(marketDatabaseFile, {}) : {};
    return missionControlPreferencesView(preferenceHolder, missionControlCatalog(preferenceHolder, radar, alpha, marketDatabase));
  }

  function updateProjectPreference(address, input = {}) {
    const owner = requireAddress(address); const state = readState(); const player = state.players[owner] || null; const tokenAddress = normalizeAddress(input.address); if (!tokenAddress) throw new Error('project_preference_address_invalid');
    const preferenceHolder = walletProjectPreferenceHolder(state, owner, player);
    preferenceHolder.missionControl.favorites ||= []; preferenceHolder.missionControl.recentProjects ||= [];
    const action = safeText(input.action, 24).toLowerCase(); const changedAt = new Date(now()).toISOString();
    if (action === 'favorite' || action === 'unfavorite') {
      const existing = preferenceHolder.missionControl.favorites.findIndex((entry) => normalizeAddress(entry.address) === tokenAddress);
      if (action === 'unfavorite' && existing >= 0) preferenceHolder.missionControl.favorites.splice(existing, 1);
      if (action === 'favorite' && existing < 0) {
        if (preferenceHolder.missionControl.favorites.length >= MISSION_CONTROL_FAVORITES_MAX) throw new Error('favorites_limit_reached');
        preferenceHolder.missionControl.favorites.unshift({ address: tokenAddress, addedAt: changedAt, source: safeText(input.source || 'AXO', 32).toUpperCase() });
      }
      if (action === 'favorite' && existing >= 0) {
        preferenceHolder.missionControl.favorites[existing].addedAt ||= changedAt;
        preferenceHolder.missionControl.favorites[existing].source ||= safeText(input.source || 'AXO', 32).toUpperCase();
      }
      recordEvent(state, action === 'favorite' ? 'MISSION_CONTROL_FAVORITE_ADDED' : 'MISSION_CONTROL_FAVORITE_REMOVED', owner, { address: tokenAddress, source: safeText(input.source || 'AXO', 32).toUpperCase() }, changedAt);
    } else if (action === 'visit') {
      preferenceHolder.missionControl.recentProjects = preferenceHolder.missionControl.recentProjects.filter((entry) => normalizeAddress(entry.address) !== tokenAddress);
      preferenceHolder.missionControl.recentProjects.unshift({ address: tokenAddress, visitedAt: changedAt });
      preferenceHolder.missionControl.recentProjects = preferenceHolder.missionControl.recentProjects.slice(0, MISSION_CONTROL_RECENT_MAX);
      recordEvent(state, 'MISSION_CONTROL_PROJECT_VISITED', owner, { address: tokenAddress }, changedAt);
    } else throw new Error('project_preference_action_invalid');
    persistWalletProjectPreferences(state, owner, preferenceHolder, player, changedAt); saveState(state); return missionControlPreferences(owner);
  }

  function updateLiveStream(address, input = {}) {
    const { state, player } = requirePlayer(address); const updatedAt = new Date(now()).toISOString();
    player.missionControl ||= { watchlist: [], favorites: [], recentProjects: [], liveStream: { name: 'My signal stream', filters: {} }, dailyClaims: {}, projectReactions: {} };
    player.missionControl.liveStream = { ...sanitizeLiveStream(input, player.missionControl.liveStream), updatedAt };
    player.updatedAt = updatedAt; recordEvent(state, 'MISSION_CONTROL_LIVE_STREAM_SAVED', player.id, { name: player.missionControl.liveStream.name, filters: player.missionControl.liveStream.filters }, updatedAt); saveState(state);
    return missionControl(player.ownerAddress);
  }
  function updateWatchlist(address, input = {}) {
    const { state, player } = requirePlayer(address); const tokenAddress = normalizeAddress(input.address); if (!tokenAddress) throw new Error('watchlist_address_invalid');
    player.missionControl ||= { watchlist: [], dailyClaims: {} }; player.missionControl.watchlist ||= [];
    const action = safeText(input.action || 'add', 12).toLowerCase(); const existing = player.missionControl.watchlist.findIndex((entry) => entry.address === tokenAddress);
    if (action === 'remove') { if (existing >= 0) player.missionControl.watchlist.splice(existing, 1); }
    else if (action === 'add') {
      if (existing < 0 && player.missionControl.watchlist.length >= MISSION_CONTROL_WATCHLIST_MAX) throw new Error('watchlist_limit_reached');
      if (existing < 0) {
        const radar = readJson(radarFile, {}); const alpha = alphaFile ? readJson(alphaFile, {}) : {}; const live = tokenSnapshot(tokenAddress, radar, alpha); const addedAt = new Date(now()).toISOString();
        player.missionControl.watchlist.unshift({ address: tokenAddress, addedAt, baseline: { name: live.name, symbol: live.symbol, classification: live.classification, priceUsd: live.priceUsd, liquidityUsd: live.liquidityUsd, warnings: live.warnings } });
        recordEvent(state, 'MISSION_CONTROL_WATCHLIST_ADDED', player.id, { address: tokenAddress }, addedAt);
      }
    } else throw new Error('watchlist_action_invalid');
    player.updatedAt = new Date(now()).toISOString(); saveState(state); return missionControl(player.ownerAddress);
  }
  function reactToMissionControlProject(address, input = {}) {
    const { state, player } = requirePlayer(address); const tokenAddress = normalizeAddress(input.address);
    if (!tokenAddress) throw new Error('project_reaction_address_invalid');
    const verdict = safeText(input.verdict, 24).toUpperCase();
    if (!['GOOD_PICK', 'NOT_CONVINCED'].includes(verdict)) throw new Error('project_reaction_verdict_invalid');
    const confidence = Math.round(clamp(input.confidence, 1, 100));
    const radar = readJson(radarFile, {}); const alpha = alphaFile ? readJson(alphaFile, {}) : {};
    if (tokenSnapshot(tokenAddress, radar, alpha)?.classification === 'NOT_CURRENTLY_RANKED') throw new Error('project_not_currently_ranked');
    const reactedAt = new Date(now()).toISOString(); player.missionControl ||= { watchlist: [], dailyClaims: {}, projectReactions: {} }; player.missionControl.projectReactions ||= {};
    const previous = player.missionControl.projectReactions[tokenAddress] || null;
    player.missionControl.projectReactions[tokenAddress] = { address: tokenAddress, verdict, confidence, createdAt: previous?.createdAt || reactedAt, updatedAt: reactedAt, affectsProductionRanking: false };
    player.updatedAt = reactedAt;
    recordEvent(state, 'MISSION_CONTROL_PROJECT_REACTION_RECORDED', player.id, { address: tokenAddress, verdict, confidence, updated: Boolean(previous), oneVotePerWallet: true, sentimentOnly: true, affectsProductionRanking: false }, reactedAt);
    saveState(state); return missionControl(player.ownerAddress);
  }
  function claimMissionControlChest(address) {
    const { state, player } = requirePlayer(address); const deck = missionDeck(state, player, now());
    requireXpParticipation(player);
    if (!deck.complete) throw new Error('daily_missions_incomplete');
    if (deck.claimed) throw new Error('daily_chest_already_claimed');
    const claimedAt = new Date(now()).toISOString(); player.missionControl ||= { watchlist: [], dailyClaims: {} }; player.missionControl.dailyClaims ||= {};
    player.missionControl.dailyClaims[deck.day] = { claimedAt, xp: MISSION_CONTROL_DAILY_XP }; player.pet.xp += MISSION_CONTROL_DAILY_XP; player.updatedAt = claimedAt;
    recordEvent(state, 'MISSION_CONTROL_DAILY_CHEST_CLAIMED', player.id, { day: deck.day, xp: MISSION_CONTROL_DAILY_XP, affectsContributorTrust: false }, claimedAt); saveState(state);
    return missionControl(player.ownerAddress);
  }
  function claimCrewMilestones(address) {
    const { state, player } = requirePlayer(address);
    requireXpParticipation(player);
    if (player.moderation?.status === 'SUSPENDED') throw new Error('hatchery_account_suspended');
    const currentMs = now();
    const view = crewMilestonesView(state, player, currentMs);
    const claimable = view.tiers.filter((tier) => tier.claimable);
    if (!claimable.length) throw new Error('crew_milestone_not_ready');
    const qualifyingEvents = crewMilestoneQualifyingEvents(state, player, currentMs);
    const claimedAt = new Date(currentMs).toISOString();
    player.missionControl ||= {};
    player.missionControl.crewMilestoneClaims ||= {};
    player.missionControl.crewMilestoneClaims[view.epochId] ||= {};
    let petXpAwarded = 0;
    let epochXpAwarded = 0;
    const claimedThresholds = [];
    for (const tier of claimable) {
      const sourceEventIds = qualifyingEvents.slice(0, tier.threshold).map((event) => event.id);
      const rewardId = `crew-milestone:${view.epochId}:${player.id}:${tier.threshold}`;
      const evidenceHash = `0x${crypto.createHash('sha256').update(JSON.stringify({
        type: 'CREW_MILESTONE_INCREMENT',
        epochId: view.epochId,
        playerId: player.id,
        petGenesisId: player.pet.genesisId,
        threshold: tier.threshold,
        sourceEventIds,
      })).digest('hex')}`;
      const sourceHash = `0x${crypto.createHash('sha256').update(`${rewardId}:${player.pet.genesisId}`).digest('hex')}`;
      player.pet.xp += tier.bonusXp;
      queueEpochLedgerReward(state, {
        id: rewardId,
        player,
        amount: tier.bonusXp,
        reasonCode: 'CREW_MILESTONE_INCREMENT',
        evidenceHash,
        sourceHash,
        recordedAt: claimedAt,
        sourceId: rewardId,
      });
      player.missionControl.crewMilestoneClaims[view.epochId][String(tier.threshold)] = {
        threshold: tier.threshold,
        bonusXp: tier.bonusXp,
        petXpAwarded: tier.bonusXp,
        epochXpAwarded: tier.bonusXp,
        qualifyingEvents: view.progress,
        evidenceHash,
        claimedAt,
      };
      recordEvent(state, 'CREW_MILESTONE_CLAIMED', player.id, {
        epochId: view.epochId,
        threshold: tier.threshold,
        qualifyingEvents: view.progress,
        xp: tier.bonusXp,
        epochXp: tier.bonusXp,
        evidenceHash,
        externalSocialActionsCounted: false,
        affectsContributorTrust: false,
        affectsProjectHeat: false,
        affectsProductionRanking: false,
      }, claimedAt);
      petXpAwarded += tier.bonusXp;
      epochXpAwarded += tier.bonusXp;
      claimedThresholds.push(tier.threshold);
    }
    player.pet.lastReply = currentLevel(player.pet.xp) >= 10 ? matureReply('feed') : companionReply('feed');
    player.updatedAt = claimedAt;
    saveState(state);
    return {
      ...snapshot(player.ownerAddress),
      result: {
        epochId: view.epochId,
        claimedThresholds,
        petXpAwarded,
        epochXpAwarded,
        externalSocialActionsCounted: false,
        affectsContributorTrust: false,
        affectsProjectHeat: false,
        affectsProductionRanking: false,
      },
    };
  }
  function completeCalibration(address, input = {}) {
    const { state, player } = requirePlayer(address); const currentMs = now(); const view = calibrationView(state, player, currentMs);
    requireXpParticipation(player);
    if (!view.available) throw new Error('calibration_already_completed_today');
    if (safeText(input.caseId, 60) !== view.challenge.id || !view.challenge.choices.includes(input.choice)) throw new Error('calibration_choice_invalid');
    const challenge = CALIBRATION_CASES.find((item) => item.id === view.challenge.id); const correct = input.choice === challenge.answer;
    const xpAwarded = CALIBRATION_BASE_XP + (correct ? CALIBRATION_CORRECT_BONUS_XP : 0); const completedAt = new Date(currentMs).toISOString();
    player.calibration ||= { completed: 0, correct: 0, lastDay: null }; player.calibration.completed += 1; if (correct) player.calibration.correct += 1; player.calibration.lastDay = view.day;
    player.pet.xp += xpAwarded; player.updatedAt = completedAt; state.calibrationRuns ||= [];
    let itemAwarded = null;
    if (player.calibration.correct >= 3 && !player.pet.inventory.some((item) => item.id === 'calibration_prism')) {
      itemAwarded = { id: 'calibration_prism', name: 'Calibration Prism', rarity: 'FOUNDING SCOUT', slot: 'charm', bonus: { analyst: 1 }, flavor: 'Earned by reading three evidence simulations correctly.' };
      player.pet.inventory.push(itemAwarded);
    }
    const run = { id: crypto.randomUUID(), playerId: player.id, petGenesisId: player.pet.genesisId, day: view.day, caseId: challenge.id, choice: input.choice, correct, explanation: challenge.explanation, xpAwarded, itemAwarded: itemAwarded?.id || null, completedAt, trustClass: 'SOLO_CALIBRATION', consensusEligible: false, affectsContributorTrust: false, affectsProductionRanking: false };
    state.calibrationRuns.push(run); state.calibrationRuns = state.calibrationRuns.slice(-5_000);
    recordEvent(state, 'CALIBRATION_COMPLETED', player.id, { caseId: challenge.id, correct, xp: xpAwarded, itemId: itemAwarded?.id || null, affectsContributorTrust: false }, completedAt); saveState(state);
    return { ...snapshot(player.ownerAddress), result: calibrationView(state, player, currentMs).result };
  }
  function alphaPlayerView(player) {
    const xp = Number(player.pet?.xp || 0);
    const visual = evolutionVisual(player);
    return {
      genesisId: player.pet.genesisId,
      name: player.pet.name,
      lineage: lineageDefinition(player.pet.lineageId).label,
      level: currentLevel(xp),
      stage: currentStage(xp).name,
      specialty: leadingAbility(player.pet.abilities).label,
      visual: visual.asset,
    };
  }
  function queueAlphaReward(state, protocolActions, {
    id,
    player,
    amount,
    reasonCode,
    evidenceHash,
    sourceHash,
    recordedAt,
    attributedAt = null,
    sourceId = null,
    receiptId = null,
    receiptClass = null,
    countsAsReceipt = false,
    reviewer = false,
  }) {
    if (!player || !Number.isInteger(Number(amount)) || Number(amount) === 0) throw new Error('alpha_reward_record_invalid');
    const timestampMs = Date.parse(recordedAt || 0);
    if (!Number.isFinite(timestampMs)) throw new Error('alpha_reward_time_invalid');
    const attributionMs = Date.parse(attributedAt || recordedAt || 0);
    if (!Number.isFinite(attributionMs)) throw new Error('alpha_reward_attribution_time_invalid');
    const action = xpAction({
      id,
      wallet: player.ownerAddress,
      genesisId: player.pet.genesisId,
      epochId: chainEpochId(attributionMs),
      amount: Number(amount),
      reasonCode,
      evidenceHash,
      sourceHash,
      reviewer,
    });
    addAlphaReward(state, {
      action,
      playerId: player.id,
      pet: alphaPlayerView(player),
      displayEpochId: epochWindow(attributionMs).id,
      recordedAt,
      attributedAt: new Date(attributionMs).toISOString(),
      sourceId,
      receiptId,
      receiptClass,
      countsAsReceipt,
    });
    protocolActions.push(action);
    recordEvent(state, 'ALPHA_REWARD_QUEUED', player.id, {
      rewardId: id,
      reasonCode,
      amount: Number(amount),
      receiptId,
      displayEpochId: epochWindow(attributionMs).id,
      attributedAt: new Date(attributionMs).toISOString(),
      dedupeKey: action.dedupeKey,
    }, recordedAt);
    return action;
  }
  function queueEpochLedgerReward(state, {
    id,
    player,
    amount,
    reasonCode,
    evidenceHash,
    sourceHash,
    recordedAt,
    attributedAt = null,
    sourceId = null,
    receiptId = null,
    receiptClass = null,
    countsAsReceipt = false,
  }) {
    const cleanAmount = Number(amount);
    const rule = ALPHA_XP_REASON_CODES[reasonCode]
      || SOCIAL_CREATOR_XP_REASON_CODES[reasonCode]
      || WEB_REFERRAL_XP_REASON_CODES[reasonCode]
      || CREW_MILESTONE_XP_REASON_CODES[reasonCode]
      || CONTRACT_QUEST_XP_REASON_CODES[reasonCode];
    if (!player || !rule || !Number.isInteger(cleanAmount) || cleanAmount === 0 || Math.abs(cleanAmount) > Number(rule.maximumXp || 0)) throw new Error('epoch_xp_reward_invalid');
    const attributionMs = Date.parse(attributedAt || recordedAt || 0);
    if (!Number.isFinite(attributionMs) || !/^0x[0-9a-f]{64}$/i.test(String(evidenceHash || '')) || !/^0x[0-9a-f]{64}$/i.test(String(sourceHash || ''))) throw new Error('epoch_xp_evidence_invalid');
    const action = {
      id,
      dedupeKey: `epoch-xp:${String(id)}`,
      actionType: 'OFFCHAIN_EPOCH_XP_LEDGER',
      status: 'RECORDED',
      payload: {
        wallet: player.ownerAddress,
        genesisId: player.pet.genesisId,
        petIdHash: hashPetId(player.pet.genesisId),
        epochId: String(chainEpochId(attributionMs)),
        amount: cleanAmount,
        reasonCode,
        evidenceHash: String(evidenceHash).toLowerCase(),
        sourceHash: String(sourceHash).toLowerCase(),
      },
    };
    addAlphaReward(state, {
      action,
      playerId: player.id,
      pet: alphaPlayerView(player),
      displayEpochId: epochWindow(attributionMs).id,
      recordedAt,
      attributedAt: new Date(attributionMs).toISOString(),
      sourceId,
      receiptId,
      receiptClass,
      countsAsReceipt,
    });
    recordEvent(state, 'EPOCH_XP_LEDGER_RECORDED', player.id, {
      rewardId: id,
      reasonCode,
      amount: cleanAmount,
      displayEpochId: epochWindow(attributionMs).id,
      evidenceHash: String(evidenceHash).toLowerCase(),
      offchainAuthoritative: true,
    }, recordedAt);
    return action;
  }
  function queueParticipationReward(state, protocolActions, reward) {
    if (CONTRACT_QUEST_XP_REASON_CODES[reward?.reasonCode]) return queueEpochLedgerReward(state, reward);
    return queueAlphaReward(state, protocolActions, reward);
  }
  function alphaDashboard({ epochLimit = 8 } = {}) {
    const state = readState(); const currentMs = now();
    const dashboard = buildAlphaDashboard({
      state,
      nowMs: currentMs,
      epochLimit,
      projects: crewProjectViews(state, null, currentMs),
      playerView: alphaPlayerView,
      protocolStore: repository.protocol,
      protocolConfig,
    });
    dashboard.epochResults = Object.values(state.epochResults || {}).map((result) => ({
      id: result.id,
      status: result.status,
      snapshotAt: result.snapshotAt,
      datasetHash: result.datasetHash,
      startsAt: result.startsAt,
      freezesAt: result.freezesAt,
      reviewEndsAt: result.reviewEndsAt,
      participants: result.participants,
      verifiedXp: result.verifiedXp,
      topFive: result.topFive || [],
      vaultEpochId: displayEpochToVaultEpochId(result.id, protocolConfig.hatcheryVault?.firstDisplayEpochId),
      confirmation: result.confirmation ? { confirmedAt: result.confirmation.confirmedAt } : null,
      rewardPreparation: result.rewardPreparation || null,
    })).sort((a, b) => String(b.freezesAt).localeCompare(String(a.freezesAt)));
    dashboard.rewardVault = {
      status: protocolConfig.hatcheryVault?.status || 'NOT_CONFIGURED',
      address: protocolConfig.hatcheryVault?.status === 'CONFIGURED' ? protocolConfig.hatcheryVault.address : null,
      asset: 'MULTI_ASSET_AXO_DEFAULT',
      custodyEnabled: protocolConfig.hatcheryVault?.custodyEnabled === true,
      claimsEnabled: protocolConfig.hatcheryVault?.claimsEnabled === true,
    };
    return dashboard;
  }
  function epochLedgerHash(state, displayEpochId) {
    const rows = rewardEntries(state).filter((entry) => entry.displayEpochId === displayEpochId).map((entry) => ({
      id: entry.id,
      dedupeKey: entry.dedupeKey,
      actionType: entry.actionType,
      playerId: entry.playerId,
      petGenesisId: entry.petGenesisId,
      petIdHash: entry.petIdHash,
      displayEpochId: entry.displayEpochId,
      chainEpochId: entry.chainEpochId,
      amount: Number(entry.amount || 0),
      reasonCode: entry.reasonCode,
      evidenceHash: entry.evidenceHash,
      sourceHash: entry.sourceHash,
      attributedAt: entry.attributedAt,
      settlementEligible: entry.settlementEligible !== false,
      exclusionReason: entry.exclusionReason || null,
      fingerprint: entry.fingerprint,
    })).sort((left, right) => String(left.dedupeKey).localeCompare(String(right.dedupeKey)));
    return `0x${crypto.createHash('sha256').update(JSON.stringify({ schema: 'AXO_HATCHERY_EPOCH_LEDGER_V1', displayEpochId, rows })).digest('hex')}`;
  }
  function settlementParticipantsInState(state, displayEpochId) {
    const result = state.epochResults?.[displayEpochId];
    if (!result) throw new Error('epoch_result_not_ready');
    // A reviewed result is immutable; ledger drift requires a separate review.
    if (result.ledgerHash && result.ledgerHash !== epochLedgerHash(state, displayEpochId)) {
      throw new Error('epoch_result_ledger_hash_mismatch');
    }
    const totals = rewardTotalsByPet(state, displayEpochId);
    // Published standings contain prize winners, not every eligible ledger pet.
    const winners = allocateWeeklyPrizePool(0n, totals).standings;
    const byGenesis = new Map(totals.map((row) => [String(row.genesisId || '').toUpperCase(), row]));
    const seenWallets = new Set();
    const participants = (result.standings || []).map((standing, index) => {
      const genesisId = String(standing.genesisId || '').toUpperCase();
      const expected = winners[index];
      if (!expected || genesisId !== String(expected.genesisId).toUpperCase()
        || Number(standing.rank) !== expected.rank) {
        throw new Error('epoch_result_ledger_winner_mismatch');
      }
      const ledger = byGenesis.get(genesisId);
      const wallet = normalizeAddress(ledger?.wallet);
      if (!wallet || seenWallets.has(wallet)) throw new Error('epoch_result_private_wallet_mapping_invalid');
      seenWallets.add(wallet);
      if (Number(ledger.verifiedXp || 0) !== Number(standing.verifiedXp || 0)) throw new Error('epoch_result_ledger_xp_mismatch');
      return {
        rank: Number(standing.rank || 0),
        account: wallet,
        genesisId,
        verifiedXp: Number(standing.verifiedXp || 0),
        receiptCount: Number(ledger.receiptCount || 0),
      };
    });
    if (participants.length !== winners.length) throw new Error('epoch_result_ledger_participant_mismatch');
    return participants;
  }
  function epochSettlementParticipants(actorAddress, displayEpochId) {
    const state = readState();
    requireStaff(state, actorAddress, true);
    const id = safeText(displayEpochId, 32);
    const result = state.epochResults?.[id];
    if (!result?.confirmation) throw new Error('epoch_result_confirmation_required');
    const vaultEpochId = displayEpochToVaultEpochId(id, protocolConfig.hatcheryVault?.firstDisplayEpochId);
    if (vaultEpochId === null) throw new Error('hatchery_vault_display_epoch_predates_deployment');
    return {
      epochId: id,
      chainEpochId: String(vaultEpochId),
      vaultEpochId: String(vaultEpochId),
      legacyChainEpochId: String(displayEpochToChainEpochId(id)),
      ledgerHash: result.ledgerHash || epochLedgerHash(state, id),
      participants: settlementParticipantsInState(state, id),
      holdingSnapshot: state.epochHoldingSnapshots?.[id] || null,
      holdingSnapshotIgnoredByWeeklySettlement: true,
      settlementPrepared: Boolean(state.epochSettlements?.[id]),
      preparedSettlement: state.epochSettlements?.[id] || null,
    };
  }
  function recordEpochHoldingSnapshot(actorAddress, displayEpochId, receipt = {}) {
    const state = readState();
    const actor = requireStaff(state, actorAddress, true);
    const id = safeText(displayEpochId, 32);
    const result = state.epochResults?.[id];
    if (!result?.confirmation) throw new Error('epoch_result_confirmation_required');
    if (state.epochSettlements?.[id]) throw new Error('epoch_settlement_already_prepared');
    const tokenAddress = normalizeAddress(receipt.tokenAddress);
    const tokenDecimals = Number(receipt.tokenDecimals);
    const policy = protocolConfig.rewardHolding || {};
    if (policy.status !== 'CONFIGURED') throw new Error('reward_holding_replacement_token_not_configured');
    if (tokenAddress !== normalizeAddress(policy.tokenAddress)) throw new Error('reward_holding_token_mismatch');
    if (tokenAddress === '0x348b31199980bed4af22453167aebf5d770072e0') throw new Error('retired_axo_reward_holding_token_forbidden');
    if (!Number.isInteger(tokenDecimals) || tokenDecimals !== Number(policy.tokenDecimals)) throw new Error('reward_holding_decimals_mismatch');
    const blockNumber = Number(receipt.blockNumber);
    const blockHash = String(receipt.blockHash || '').toLowerCase();
    if (!Number.isSafeInteger(blockNumber) || blockNumber < 1) throw new Error('reward_holding_block_invalid');
    if (!/^0x[0-9a-f]{64}$/.test(blockHash)) throw new Error('reward_holding_block_hash_invalid');
    const participants = settlementParticipantsInState(state, id);
    const balances = Array.isArray(receipt.balances) ? receipt.balances : [];
    const balancesByWallet = new Map();
    for (const row of balances) {
      const wallet = normalizeAddress(row.wallet || row.account);
      if (!wallet || balancesByWallet.has(wallet) || !/^\d+$/.test(String(row.balanceRaw || ''))) throw new Error('epoch_holding_balance_rows_invalid');
      balancesByWallet.set(wallet, String(row.balanceRaw));
    }
    if (balancesByWallet.size !== participants.length) throw new Error('epoch_holding_balance_rows_incomplete');
    const frozenRows = participants.map((participant) => {
      const balanceRaw = balancesByWallet.get(participant.account);
      if (balanceRaw === undefined) throw new Error('epoch_holding_balance_rows_incomplete');
      return {
        ...participant,
        holdingBalanceRaw: balanceRaw,
        holdingMultiplierBps: holdingRewardMultiplierBps(balanceRaw, tokenDecimals),
      };
    });
    const frozenAt = new Date(now()).toISOString();
    const evidenceHash = `0x${crypto.createHash('sha256').update(JSON.stringify({ schema: 'AXO_HATCHERY_COMMON_HOLDING_SNAPSHOT_V1', epochId: id, tokenAddress, tokenDecimals, blockNumber, blockHash, rows: frozenRows })).digest('hex')}`;
    const existing = state.epochHoldingSnapshots?.[id];
    if (existing) {
      if (existing.evidenceHash !== evidenceHash) throw new Error('epoch_holding_snapshot_already_frozen');
      return existing;
    }
    const snapshot = {
      schema: 'AXO_HATCHERY_COMMON_HOLDING_SNAPSHOT_V1',
      epochId: id,
      chainEpochId: String(displayEpochToChainEpochId(id)),
      tokenAddress,
      tokenDecimals,
      blockNumber,
      blockHash,
      frozenAt,
      frozenBy: actor.owner,
      evidenceHash,
      rows: frozenRows,
    };
    state.epochHoldingSnapshots ||= {};
    state.epochHoldingSnapshots[id] = snapshot;
    for (const row of frozenRows) {
      const player = state.players[row.account];
      if (!player) throw new Error('epoch_holding_player_missing');
      player.rewardHolding ||= { latest: null, epochs: {} };
      player.rewardHolding.epochs ||= {};
      const playerSnapshot = {
        epochId: id,
        tokenAddress,
        tokenDecimals,
        balanceRaw: row.holdingBalanceRaw,
        balanceFormatted: null,
        blockNumber,
        blockHash,
        checkedAt: frozenAt,
        frozen: true,
        multiplierBps: row.holdingMultiplierBps,
        multiplierPct: row.holdingMultiplierBps / 100,
      };
      player.rewardHolding.epochs[id] = playerSnapshot;
      player.rewardHolding.latest = playerSnapshot;
    }
    result.rewardPreparation = {
      status: protocolConfig.hatcheryVault?.status === 'CONFIGURED' ? 'READY_FOR_VERIFIED_VAULT_FUNDING_READ' : 'BLOCKED_REWARD_VAULT_NOT_CONFIGURED',
      defaultRewardAsset: 'AXO',
      holdingToken: tokenAddress,
      holdingBlockNumber: blockNumber,
      holdingBlockHash: blockHash,
      holdingEvidenceHash: evidenceHash,
      vaultAddress: protocolConfig.hatcheryVault?.status === 'CONFIGURED' ? protocolConfig.hatcheryVault.address : null,
      liveValueMovementEnabled: false,
    };
    recordEvent(state, 'EPOCH_HOLDING_SNAPSHOT_FROZEN', null, { epochId: id, blockNumber, blockHash, evidenceHash, participantCount: frozenRows.length, actor: actor.owner }, frozenAt);
    saveState(state);
    return snapshot;
  }
  function prepareEthEpochSettlement(actorAddress, displayEpochId, input = {}) {
    const state = readState();
    const actor = requireStaff(state, actorAddress, true);
    const id = safeText(displayEpochId, 32);
    const result = state.epochResults?.[id];
    if (!result?.confirmation) throw new Error('epoch_result_confirmation_required');
    const vaultPolicy = protocolConfig.hatcheryVault || {};
    if (vaultPolicy.status !== 'CONFIGURED') throw new Error('hatchery_reward_vault_not_configured');
    const holdingPolicy = protocolConfig.rewardHolding || {};
    if (holdingPolicy.status !== 'CONFIGURED') throw new Error('reward_holding_replacement_token_not_configured');
    const vaultAddress = normalizeAddress(input.vaultAddress);
    if (!vaultAddress || vaultAddress !== normalizeAddress(vaultPolicy.address)) throw new Error('hatchery_reward_vault_mismatch');
    const ledgerHash = result.ledgerHash || epochLedgerHash(state, id);
    const participants = settlementParticipantsInState(state, id);
    const settlement = buildEpochAwardSettlement({
      chainId: protocolConfig.chainId || 4663,
      vault: vaultAddress,
      epochId: (() => {
        const vaultEpochId = displayEpochToVaultEpochId(id, vaultPolicy.firstDisplayEpochId);
        if (vaultEpochId === null) throw new Error('hatchery_vault_display_epoch_predates_deployment');
        return vaultEpochId;
      })(),
      fundedAmountRaw: input.fundedAmountRaw ?? input.fundedWei,
      claimDeadline: input.claimDeadline,
      holdingToken: holdingPolicy.tokenAddress,
      rewardToken: input.rewardToken || holdingPolicy.tokenAddress,
      rewardDecimals: input.rewardDecimals ?? holdingPolicy.tokenDecimals,
      startingAwardIndex: input.startingAwardIndex ?? 0,
      ledgerHash,
      participants,
    });
    const existing = state.epochSettlements?.[id];
    if (existing) {
      if (existing.datasetHash !== settlement.datasetHash) throw new Error('epoch_settlement_already_prepared');
      return existing;
    }
    const preparedAt = new Date(now()).toISOString();
    const stored = { ...settlement, displayEpochId: id, preparedAt, preparedBy: actor.owner };
    state.epochSettlements ||= {};
    state.epochSettlements[id] = stored;
    result.ledgerHash = ledgerHash;
    result.rewardPreparation = {
      status: 'PREPARED_UNSIGNED',
      rewardToken: settlement.rewardToken,
      rewardDecimals: settlement.rewardDecimals,
      vaultAddress,
      chainEpochId: settlement.epochId,
      holdingToken: settlement.holdingToken,
      holdingCheck: 'CANONICAL_AXO_BALANCE_READ_INSIDE_CLAIM_TRANSACTION',
      settlementDatasetHash: settlement.datasetHash,
      fundedAmount: settlement.fundedAmount,
      allocatedAmount: settlement.allocatedAmount,
      carryoverAmount: settlement.carryoverAmount,
      awardCount: settlement.awardCount,
      claimCount: settlement.awardCount,
      preparedAt,
      broadcastAuthorized: false,
      liveValueMovementEnabled: false,
    };
    recordEvent(state, 'EPOCH_AWARD_SETTLEMENT_PREPARED', null, { epochId: id, datasetHash: settlement.datasetHash, rewardToken: settlement.rewardToken, fundedAmount: settlement.fundedAmount, allocatedAmount: settlement.allocatedAmount, awardCount: settlement.awardCount, holdingCheck: 'LIVE_CANONICAL_AXO_BALANCE_AT_CLAIM', actor: actor.owner, broadcastAuthorized: false }, preparedAt);
    saveState(state);
    return stored;
  }
  function ethEpochClaimProof(address, displayEpochId) {
    const owner = requireAddress(address);
    const state = readState();
    const id = safeText(displayEpochId, 32);
    const settlement = state.epochSettlements?.[id];
    if (!settlement) throw new Error('epoch_eth_settlement_not_prepared');
    const claim = (settlement.winners || settlement.claims || []).find((entry) => normalizeAddress(entry.account) === owner);
    if (!claim) throw new Error('epoch_eth_claim_not_found');
    const claimsEnabled = protocolConfig.hatcheryVault?.claimsEnabled === true;
    return {
      schema: 'AXO_HATCHERY_AWARD_CLAIM_V3',
      status: claimsEnabled ? 'CLAIM_TRANSACTION_READY' : 'PREPARED_UNSIGNED_CLAIMS_DISABLED',
      displayEpochId: id,
      chainEpochId: settlement.epochId,
      rewardAsset: claim.rewardToken === '0x0000000000000000000000000000000000000000' ? 'ETH' : 'ERC20',
      rewardToken: claim.rewardToken,
      rewardDecimals: claim.rewardDecimals,
      awardName: claim.name,
      amountRaw: null,
      grossAmount: claim.grossAmount,
      grossRewardWei: claim.grossAmount,
      amountRule: 'LIVE_AXO_HOLDING_SCALED_INSIDE_CLAIM',
      datasetHash: settlement.datasetHash,
      claim: {
        epochId: claim.epochId,
        awardIndex: claim.awardIndex ?? claim.winnerIndex ?? claim.index,
        winnerIndex: claim.awardIndex ?? claim.winnerIndex ?? claim.index,
        awardId: claim.awardId,
        name: claim.name,
        account: claim.account,
        rewardToken: claim.rewardToken,
        grossAmount: claim.grossAmount,
      },
      transaction: claimsEnabled ? { ...buildAwardClaimTransaction(settlement.vault, claim), broadcastAuthorized: true } : null,
      broadcastAuthorized: claimsEnabled,
      reason: claimsEnabled ? null : 'LIVE_CLAIMS_OPERATOR_DISABLED',
    };
  }
  function epochRewardsBoard({ epochLimit = 12 } = {}) {
    const state = readState();
    const currentMs = now();
    const dashboard = buildAlphaDashboard({
      state,
      nowMs: currentMs,
      epochLimit: Math.max(2, Math.min(24, Number(epochLimit || 12))),
      projects: crewProjectViews(state, null, currentMs),
      playerView: alphaPlayerView,
      protocolStore: repository.protocol,
      protocolConfig,
    });
    const contractConnected = protocolConfig.hatcheryVault?.status === 'CONFIGURED';
    const claimsEnabled = contractConnected && protocolConfig.hatcheryVault?.claimsEnabled === true;
    const epochs = dashboard.epochs.map((epoch) => {
      const settlement = state.epochSettlements?.[epoch.id] || null;
      const projectedPool = !settlement ? state.epochRewardPools?.[epoch.id] || null : null;
      const projection = projectedPool && (epoch.standings || []).length
        ? allocateWeeklyPrizePool(projectedPool.amountRaw, (epoch.standings || []).slice(0, 5).map((standing) => ({
          genesisId: standing.genesisId,
          verifiedXp: Number(standing.verifiedXp || 0),
        })))
        : null;
      const projectedByGenesisId = new Map((projection?.standings || []).map((standing) => [standing.genesisId, standing]));
      const finalizedWinners = settlement?.awards || settlement?.winners || settlement?.claims || [];
      const winners = finalizedWinners.length
        ? finalizedWinners.map((winner, index) => ({
          rank: index + 1,
          awardIndex: Number(winner.awardIndex ?? winner.winnerIndex ?? winner.index ?? index),
          winnerIndex: Number(winner.awardIndex ?? winner.winnerIndex ?? winner.index ?? index),
          awardId: winner.awardId,
          awardName: winner.name,
          account: claimsEnabled ? normalizeAddress(winner.account) : null,
          genesisId: winner.genesisId,
          petIdHash: winner.petIdHash,
          verifiedXp: Number(winner.verifiedXp || 0),
          grossAmount: String(winner.grossAmount ?? winner.grossRewardWei),
          grossRewardWei: String(winner.grossAmount ?? winner.grossRewardWei),
          rewardToken: winner.rewardToken,
          rewardDecimals: Number(winner.rewardDecimals ?? 18),
          rewardAsset: winner.rewardToken === '0x0000000000000000000000000000000000000000' ? 'ETH' : winner.rewardToken === protocolConfig.rewardHolding?.tokenAddress ? 'AXO' : 'ERC20',
          identity: publicEpochWinnerIdentity(state, winner.genesisId, winner.account),
          claimableAmount: null,
          claimableAmountRule: 'LIVE_AXO_HOLDING_SCALED_AT_CLAIM',
          status: claimsEnabled ? 'ONCHAIN_CLAIM_STATUS_REQUIRED' : 'PREPARED_UNSIGNED',
        }))
        : (epoch.standings || []).slice(0, 5).map((standing, index) => ({
          rank: index + 1,
          winnerIndex: null,
          account: null,
          genesisId: standing.genesisId,
          name: standing.name,
          lineage: standing.lineage,
          visual: standing.visual,
          verifiedXp: Number(standing.verifiedXp || 0),
          grossAmount: null,
          grossRewardWei: null,
          projectedGrossAmount: projectedByGenesisId.get(standing.genesisId)?.allocationAmount || null,
          projectedGrossRewardWei: projectedByGenesisId.get(standing.genesisId)?.allocationAmount || null,
          rewardToken: protocolConfig.rewardHolding?.tokenAddress || null,
          rewardDecimals: Number(protocolConfig.rewardHolding?.tokenDecimals || 18),
          rewardAsset: 'AXO',
          identity: publicEpochWinnerIdentity(state, standing.genesisId),
          claimableAmountWei: null,
          claimableAmountRule: 'LIVE_AXO_HOLDING_SCALED_AT_CLAIM_AFTER_FINALIZATION',
          projectionStatus: projection ? 'LIVE_POSITION_ESTIMATE' : 'EPOCH_POOL_NOT_SET',
          status: epoch.status === 'OPEN' ? 'IN_LINE_TO_CLAIM' : 'AWAITING_FINALIZATION',
        }));
      const mappedVaultEpochId = displayEpochToVaultEpochId(epoch.id, protocolConfig.hatcheryVault?.firstDisplayEpochId);
      const vaultEpochId = settlement?.epochId == null ? mappedVaultEpochId : Number(settlement.epochId);
      return {
        id: epoch.id,
        chainEpochId: vaultEpochId == null ? null : String(vaultEpochId),
        vaultEpochId: vaultEpochId == null ? null : String(vaultEpochId),
        legacyChainEpochId: String(displayEpochToChainEpochId(epoch.id)),
        startsAt: epoch.startsAt,
        endsAt: epoch.freezesAt,
        status: settlement ? (claimsEnabled ? 'CLAIM_STATUS_SYNC_REQUIRED' : 'PREPARED_UNSIGNED') : epoch.status,
        fundedAmount: settlement?.fundedAmount || null,
        allocatedAmount: settlement?.allocatedAmount || null,
        projectedPoolAmount: projection?.poolAmount || projectedPool?.amountRaw || null,
        projectedAllocatedAmount: projection?.allocatedAmount || null,
        projectedCarryoverAmount: projection?.carryoverAmount || null,
        projectionUpdatedAt: projectedPool?.updatedAt || null,
        projectionStatus: settlement ? 'FINALIZED' : projection ? 'LIVE_POSITION_ESTIMATE' : 'EPOCH_POOL_NOT_SET',
        rewardToken: settlement?.rewardToken || protocolConfig.rewardHolding?.tokenAddress || null,
        rewardDecimals: Number(settlement?.rewardDecimals || protocolConfig.rewardHolding?.tokenDecimals || 18),
        claimDeadline: settlement?.claimDeadline ? new Date(Number(settlement.claimDeadline) * 1_000).toISOString() : null,
        datasetHash: settlement?.datasetHash || epoch.datasetHash || null,
        winners,
      };
    });
    return {
      generatedAt: new Date(currentMs).toISOString(),
      schema: 'AXO_HATCHERY_EPOCH_WINNERS_BOARD_V1',
      contract: {
        status: protocolConfig.hatcheryVault?.status || 'NOT_CONFIGURED',
        address: contractConnected ? protocolConfig.hatcheryVault.address : null,
        chainId: protocolConfig.chainId || 4663,
        claimsEnabled,
        firstDisplayEpochId: protocolConfig.hatcheryVault?.firstDisplayEpochId || null,
        custodyEnabled: protocolConfig.hatcheryVault?.custodyEnabled === true,
        custodyStatus: protocolConfig.hatcheryVault?.custodyStatus || 'OPERATOR_DISABLED',
        fundingReceiptTxHash: protocolConfig.hatcheryVault?.fundingReceiptTxHash || null,
        hookFunding: protocolConfig.hatcheryVault?.hookFunding || null,
      },
      holdingPolicy: {
        token: protocolConfig.rewardHolding?.status === 'CONFIGURED' ? protocolConfig.rewardHolding.tokenAddress : null,
        zeroHoldingRewardBps: 0,
        nonzeroFloorBps: 3_000,
        fullRewardTokens: 1_000_000,
        curvePower: '3/4',
        balanceRead: 'INSIDE_CLAIM_TRANSACTION',
      },
      currentEpochId: dashboard.currentEpoch?.id || null,
      epochs,
    };
  }
  function epochRewardPool(displayEpochId) {
    const state = readState();
    const id = safeText(displayEpochId, 32);
    if (!/^AXO-\d{4}-W\d{2}$/.test(id)) throw new Error('hatchery_epoch_id_invalid');
    return state.epochRewardPools?.[id] || null;
  }
  function setEpochRewardPool(actorAddress, displayEpochId, input = {}, context = {}) {
    const state = readState();
    const actor = requireStaff(state, actorAddress, true);
    const id = safeText(displayEpochId, 32);
    if (!/^AXO-\d{4}-W\d{2}$/.test(id)) throw new Error('hatchery_epoch_id_invalid');
    if (state.epochSettlements?.[id]) throw new Error('hatchery_epoch_pool_finalized');
    const raw = String(input.amountRaw || '').trim();
    if (!/^\d+$/.test(raw) || BigInt(raw) <= 0n || BigInt(raw) > (1n << 256n) - 1n) {
      throw new Error('hatchery_epoch_pool_amount_invalid');
    }
    const rewardToken = normalizeAddress(context.rewardToken || protocolConfig.rewardHolding?.tokenAddress || protocolConfig.hatcheryVault?.defaultRewardToken);
    const rewardDecimals = Number(context.rewardDecimals ?? protocolConfig.rewardHolding?.tokenDecimals ?? 18);
    if (!rewardToken || !Number.isInteger(rewardDecimals) || rewardDecimals < 0 || rewardDecimals > 36) {
      throw new Error('hatchery_epoch_pool_reward_asset_invalid');
    }
    const dashboard = buildAlphaDashboard({
      state,
      nowMs: now(),
      epochLimit: 24,
      projects: crewProjectViews(state, null, now()),
      playerView: alphaPlayerView,
      protocolStore: repository.protocol,
      protocolConfig,
    });
    const knownDashboardEpoch = dashboard.epochs.some((epoch) => epoch.id === id);
    const verifiedFutureEpoch = context.verifiedFutureEpochId === id;
    if (!knownDashboardEpoch && !verifiedFutureEpoch) throw new Error('hatchery_epoch_not_found');
    const updatedAt = new Date(now()).toISOString();
    const pool = {
      displayEpochId: id,
      amountRaw: BigInt(raw).toString(),
      rewardToken,
      rewardDecimals,
      status: 'PROJECTED_UNTIL_FINALIZED',
      updatedAt,
      updatedBy: actor.owner,
    };
    state.epochRewardPools ||= {};
    state.epochRewardPools[id] = pool;
    recordEvent(state, 'EPOCH_REWARD_POOL_SET', null, {
      displayEpochId: id,
      amountRaw: pool.amountRaw,
      rewardToken: pool.rewardToken,
      rewardDecimals: pool.rewardDecimals,
      actor: actor.owner,
    }, updatedAt);
    saveState(state);
    return {
      schema: 'AXO_HATCHERY_EPOCH_REWARD_POOL_V1',
      pool,
      epoch: epochRewardsBoard({ epochLimit: 24 }).epochs.find((epoch) => epoch.id === id) || null,
    };
  }
  function snapshotClosedEpochResultsInState(state, currentMs = now(), { allowReview = false } = {}) {
    state.epochResults ||= {};
    const dashboard = buildAlphaDashboard({
      state,
      nowMs: currentMs,
      epochLimit: 12,
      projects: crewProjectViews(state, null, currentMs),
      playerView: alphaPlayerView,
      protocolStore: repository.protocol,
      protocolConfig,
    });
    const created = [];
    for (const epoch of dashboard.epochs.filter((entry) => (
      entry.status === 'PREVIEW_CLOSED' || (allowReview && entry.status === 'REVIEW')
    ))) {
      if (Number(epoch.participants || 0) === 0 || Number(epoch.verifiedXp || 0) <= 0) continue;
      if (state.epochResults[epoch.id]) continue;
      const snapshotAt = new Date(currentMs).toISOString();
      const publicStanding = (entry) => ({
        rank: Number(entry.rank),
        genesisId: entry.genesisId,
        name: entry.name,
        level: Number(entry.level || 1),
        stage: entry.stage,
        verifiedXp: Number(entry.verifiedXp || 0),
        estimatedRewardSharePct: Number(entry.estimatedRewardSharePct || 0),
        holdingMultiplierBps: Number(entry.holdingMultiplierBps || 10_000),
      });
      const result = {
        id: epoch.id,
        status: 'PUBLISHED_PENDING_CONFIRMATION',
        snapshotAt,
        datasetHash: epoch.datasetHash,
        ledgerHash: epochLedgerHash(state, epoch.id),
        startsAt: epoch.startsAt,
        freezesAt: epoch.freezesAt,
        reviewEndsAt: epoch.reviewEndsAt,
        participants: epoch.participants,
        verifiedXp: epoch.verifiedXp,
        standings: epoch.standings.map(publicStanding),
        topFive: epoch.standings.slice(0, 5).map(publicStanding),
        confirmation: null,
        rewardPreparation: { status: 'AWAITING_ADMIN_CONFIRMATION', defaultRewardAsset: 'AXO', liveValueMovementEnabled: false },
      };
      state.epochResults[epoch.id] = result;
      recordEvent(state, 'EPOCH_RESULT_SNAPSHOTTED', null, { epochId: epoch.id, datasetHash: epoch.datasetHash, participants: epoch.participants, verifiedXp: epoch.verifiedXp }, snapshotAt);
      created.push(epoch.id);
    }
    return created;
  }
  function confirmEpochResult(actorAddress, epochId) {
    const state = readState();
    const actor = requireStaff(state, actorAddress, true);
    // Weekly prizes can be approved as soon as their seven-day epoch ends. The
    // older 48-hour Alpha evidence window remains available when nobody acts,
    // but it no longer blocks an explicit controller freeze and approval.
    snapshotClosedEpochResultsInState(state, now(), { allowReview: true });
    const id = safeText(epochId, 32);
    const result = state.epochResults?.[id];
    if (!result) throw new Error('epoch_result_not_ready');
    // Validate before recording approval, including retries of older confirmations.
    // Never replace frozen standings or hashes to make settlement succeed.
    settlementParticipantsInState(state, id);
    if (result.confirmation) return result;
    const confirmedAt = new Date(now()).toISOString();
    result.ledgerHash ||= epochLedgerHash(state, id);
    const holdingReady = protocolConfig.rewardHolding?.status === 'CONFIGURED';
    const vaultReady = protocolConfig.hatcheryVault?.status === 'CONFIGURED';
    result.status = 'CONFIRMED';
    result.confirmation = { confirmedAt, confirmedBy: actor.owner, datasetHash: result.datasetHash, ledgerHash: result.ledgerHash };
    result.rewardPreparation = {
      status: !holdingReady ? 'BLOCKED_REPLACEMENT_TOKEN_NOT_CONFIGURED'
        : !vaultReady ? 'BLOCKED_REWARD_VAULT_NOT_CONFIGURED'
          : 'READY_FOR_WEEKLY_AXO_AWARD_SETTLEMENT',
      defaultRewardAsset: 'AXO',
      holdingToken: holdingReady ? protocolConfig.rewardHolding.tokenAddress : null,
      vaultAddress: vaultReady ? protocolConfig.hatcheryVault.address : null,
      liveValueMovementEnabled: false,
    };
    recordEvent(state, 'EPOCH_RESULT_CONFIRMED', null, { epochId: id, datasetHash: result.datasetHash, rewardPreparationStatus: result.rewardPreparation.status, actor: actor.owner }, confirmedAt);
    saveState(state);
    return result;
  }
  function alphaEpochProfile(address, { epochLimit = 8 } = {}) {
    const owner = requireAddress(address);
    const state = readState();
    const currentMs = now();
    const limit = Math.max(2, Math.min(12, Math.floor(Number(epochLimit || 8))));
    const player = state.players[owner] || null;
    const dashboard = buildAlphaDashboard({
      state,
      nowMs: currentMs,
      epochLimit: limit,
      projects: crewProjectViews(state, null, currentMs),
      playerView: alphaPlayerView,
      protocolStore: repository.protocol,
      protocolConfig,
    });
    const personalLedger = rewardEntries(state).filter((entry) => normalizeAddress(entry.playerId) === owner);
    const personalClaims = repository.protocol.claimableForAccount(owner, 24);
    const reasonLabels = {
      NOMINATION_ONLY_CHANNEL: 'Nomination-only channel',
      RESEARCH_FIELDS_INCOMPLETE: 'Research evidence incomplete',
      BLOCK_PINNED_CONTRACT_PROOF_REQUIRED: 'Block-pinned contract proof required',
      ESTABLISHED_WALLET_ACTIVITY_REQUIRED: 'Established wallet activity required',
      VERIFIED_HUMAN_IDENTITY_REQUIRED: 'Verified human identity required',
      DATA_QUALITY_BELOW_MINIMUM: 'Evidence quality below minimum',
      DAILY_BASE_RECEIPT_CAP_REACHED: 'Daily four-receipt cap reached',
      PRE_PROTOCOL_PREVIEW_NOT_IMPORTED: 'Legacy preview excluded',
      PET_REPLACED_DURING_OPEN_EPOCH: 'Pet replaced during open epoch',
      ALPHA_MINING_WALLET_BLOCKED: 'Alpha Mining access blocked',
      NOT_REWARD_ELIGIBLE: 'Not reward eligible',
    };
    const claimForEpoch = (epoch, verifiedXp) => {
      const awardSettlement = state.epochSettlements?.[epoch.id] || null;
      const awardClaim = (awardSettlement?.awards || awardSettlement?.winners || awardSettlement?.claims || []).find((entry) => normalizeAddress(entry.account) === owner) || null;
      if (awardClaim) {
        const live = protocolConfig.hatcheryVault?.claimsEnabled === true;
        return {
          status: live ? 'CLAIM_TRANSACTION_READY' : 'PREPARED_UNSIGNED_CLAIMS_DISABLED',
          claimable: live,
          claimed: false,
          amountRaw: null,
          grossAmountRaw: String(awardClaim.grossAmount ?? awardClaim.grossRewardWei),
          amountRule: 'LIVE_AXO_HOLDING_SCALED_INSIDE_CLAIM',
          rewardToken: awardClaim.rewardToken,
          rewardSymbol: awardClaim.rewardToken === '0x0000000000000000000000000000000000000000' ? 'ETH' : awardClaim.rewardToken === protocolConfig.rewardHolding?.tokenAddress ? 'AXO' : 'TOKEN',
          rewardTokenDecimals: awardClaim.rewardDecimals,
          awardName: awardClaim.name,
          claimDeadline: awardSettlement.claimDeadline ? new Date(Number(awardSettlement.claimDeadline) * 1_000).toISOString() : null,
          reason: live ? null : 'LIVE_CLAIMS_OPERATOR_DISABLED',
        };
      }
      const chainEpochIdValue = String(displayEpochToChainEpochId(epoch.id));
      const claim = personalClaims.find((entry) => String(entry.epochId) === chainEpochIdValue || entry.displayEpochId === epoch.id) || null;
      if (claim) {
        const projection = repository.protocol.epochById(chainEpochIdValue);
        return {
          status: claim.status,
          claimable: claim.claimable === true,
          claimed: claim.claimed === true,
          amountRaw: String(claim.amount || '0'),
          rewardToken: claim.rewardToken || projection?.rewardToken || null,
          rewardTokenDecimals: projection?.rewardTokenDecimals ?? null,
          claimDeadline: claim.claimDeadline || projection?.claimDeadline || null,
          reason: claim.claimed ? 'CLAIM_CONFIRMED' : claim.claimable ? null : 'CLAIM_PROOF_NOT_YET_ACTIVE',
        };
      }
      const reason = !player && verifiedXp <= 0 ? 'PET_NOT_HATCHED'
        : verifiedXp <= 0 ? 'NO_ELIGIBLE_XP'
          : dashboard.status === 'PENDING_REPLACEMENT_LAUNCH' ? 'REPLACEMENT_TOKEN_PENDING'
          : dashboard.protocol.contractStatus === 'STATIC_MULTI_ASSET_AWARD_VAULT_LOCAL_TESTED_NOT_DEPLOYED' ? 'CONTRACTS_NOT_DEPLOYED'
            : epoch.status === 'OPEN' ? 'EPOCH_OPEN'
              : epoch.status === 'REVIEW' ? 'EPOCH_REVIEW'
                : !epoch.settlement.finalized ? 'SETTLEMENT_NOT_FINALIZED' : 'NO_PERSONAL_ALLOCATION';
      return {
        status: 'NOT_AVAILABLE',
        claimable: false,
        claimed: false,
        amountRaw: null,
        rewardToken: epoch.rewardPool.rewardToken || null,
        rewardTokenDecimals: null,
        claimDeadline: epoch.rewardPool.claimDeadline || null,
        reason,
      };
    };
    const personalEpoch = (epoch) => {
      const startsMs = Date.parse(epoch.startsAt);
      const endsMs = Date.parse(epoch.freezesAt);
      const chainEpochIdValue = String(displayEpochToChainEpochId(epoch.id));
      const ledger = personalLedger.filter((entry) => entry.displayEpochId === epoch.id);
      const eligibleLedger = ledger.filter((entry) => entry.settlementEligible !== false);
      const genesisIds = new Set(eligibleLedger.map((entry) => String(entry.petGenesisId || entry.pet?.genesisId || '').toUpperCase()).filter(Boolean));
      if (player?.pet?.genesisId) genesisIds.add(String(player.pet.genesisId).toUpperCase());
      const standings = epoch.standings.filter((entry) => genesisIds.has(String(entry.genesisId || '').toUpperCase()));
      const verifiedXp = Math.max(0, standings.reduce((sum, entry) => sum + Number(entry.verifiedXp || 0), 0));
      const eligibleXp = eligibleLedger.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
      const eligibleReceipts = eligibleLedger.filter((entry) => entry.countsAsReceipt === true && Number(entry.amount || 0) > 0).length;
      const breakdown = { social: 0, validated: 0, corroboration: 0, performance: 0, spotlight: 0, corrections: 0 };
      for (const standing of standings) for (const key of Object.keys(breakdown)) breakdown[key] += Number(standing.breakdown?.[key] || 0);
      const rank = standings.length ? Math.min(...standings.map((entry) => Number(entry.rank || Number.MAX_SAFE_INTEGER))) : null;
      const estimatedRewardSharePct = Number(standings.reduce((sum, entry) => sum + Number(entry.estimatedRewardSharePct || 0), 0).toFixed(4));
      const contributions = (state.contributions || []).filter((entry) => {
        const createdMs = Date.parse(entry.createdAt || 0);
        return entry.playerId === owner && Number.isFinite(createdMs) && createdMs >= startsMs && createdMs < endsMs;
      });
      const withheldByReason = new Map();
      const addWithheld = (code, xp = 0) => {
        const cleanCode = String(code || 'NOT_REWARD_ELIGIBLE').toUpperCase();
        const current = withheldByReason.get(cleanCode) || { code: cleanCode, label: reasonLabels[cleanCode] || cleanCode.toLowerCase().replaceAll('_', ' '), count: 0, xp: 0 };
        current.count += 1;
        current.xp += Math.max(0, Number(xp || 0));
        withheldByReason.set(cleanCode, current);
      };
      for (const contribution of contributions) {
        if (Number(contribution.rewardEligibility?.baseXp || 0) > 0) continue;
        addWithheld(contribution.rewardEligibility?.reason || (contribution.receiptClass === 'NOMINATION_ONLY' ? 'NOMINATION_ONLY_CHANNEL' : 'NOT_REWARD_ELIGIBLE'));
      }
      for (const entry of ledger.filter((item) => item.settlementEligible === false)) addWithheld(entry.exclusionReason || 'NOT_REWARD_ELIGIBLE', entry.amount);
      if (player?.moderation?.alphaMining?.status === 'BLOCKED' && epoch.id === dashboard.currentEpoch.id) addWithheld('ALPHA_MINING_WALLET_BLOCKED');
      const epochResult = state.epochResults?.[epoch.id] || null;
      const settlement = state.epochSettlements?.[epoch.id] || null;
      const queuedXp = eligibleXp;
      const confirmedXp = epochResult?.confirmation ? eligibleXp : 0;
      const indexedXp = 0;
      const mismatchReasons = [];
      if (eligibleXp !== verifiedXp) mismatchReasons.push('PERSONAL_LEDGER_STANDING_XP_MISMATCH');
      const reconciliationStatus = mismatchReasons.length ? 'MISMATCH'
        : eligibleXp <= 0 ? (withheldByReason.size ? 'WITHHELD' : 'NOT_PARTICIPATING')
          : settlement ? 'SETTLEMENT_PREPARED_UNSIGNED'
            : epochResult?.confirmation ? 'RESULT_CONFIRMED_READY_FOR_SETTLEMENT'
              : epochResult ? 'RESULT_PUBLISHED_AWAITING_CONFIRMATION' : 'AUTHORITATIVE_LEDGER_RECORDED';
      const stages = [
        { id: 'ELIGIBLE', label: 'Ledger recorded', xp: Math.max(0, eligibleXp), status: eligibleXp > 0 ? 'COMPLETE' : 'EMPTY' },
        { id: 'RESULT', label: 'Epoch result confirmed', xp: Math.max(0, confirmedXp), status: epochResult?.confirmation ? 'COMPLETE' : 'WAITING' },
        { id: 'HOLDING', label: 'AXO balance read live at claim', xp: 0, status: 'CLAIM_TIME' },
        { id: 'SETTLEMENT', label: 'Unsigned settlement prepared', xp: settlement ? Math.max(0, eligibleXp) : 0, status: settlement ? 'COMPLETE' : 'WAITING' },
      ];
      const withheldReasons = [...withheldByReason.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
      const claim = claimForEpoch(epoch, verifiedXp);
      return {
        id: epoch.id,
        chainEpochId: chainEpochIdValue,
        startsAt: epoch.startsAt,
        freezesAt: epoch.freezesAt,
        reviewEndsAt: epoch.reviewEndsAt,
        status: epoch.status,
        timeRemainingMs: epoch.timeRemainingMs,
        participation: {
          status: !player ? 'PET_REQUIRED' : player.moderation?.alphaMining?.status === 'BLOCKED' ? 'BLOCKED' : verifiedXp > 0 ? 'QUALIFIED' : 'NO_ELIGIBLE_XP',
          verifiedXp,
          eligibleReceipts,
          rank,
          participantCount: epoch.participants,
          estimatedRewardSharePct,
          breakdown,
          rewardHolding: rewardHoldingView(player, epoch.id),
        },
        reconciliation: {
          status: reconciliationStatus,
          canonicalEpochStatus: epoch.reconciliation.status,
          eligibleXp: Math.max(0, eligibleXp),
          queuedXp: Math.max(0, queuedXp),
          confirmedXp: Math.max(0, confirmedXp),
          indexedXp: Math.max(0, indexedXp),
          frozenXp: 0,
          settledXp: settlement ? Math.max(0, eligibleXp) : 0,
          stages,
          mismatchReasons,
          actionStatuses: {},
          settlementReady: Boolean(settlement),
          authoritativeSource: 'PRESERVED_HATCHERY_SQLITE_LEDGER',
          onchainXpRegistryRequired: false,
        },
        withheld: {
          submissions: withheldReasons.reduce((sum, reason) => sum + reason.count, 0),
          excludedXp: withheldReasons.reduce((sum, reason) => sum + reason.xp, 0),
          reasons: withheldReasons,
        },
        claim,
      };
    };
    const epochs = dashboard.epochs.map(personalEpoch);
    return {
      generatedAt: new Date(currentMs).toISOString(),
      version: 1,
      walletPrivate: true,
      pet: player ? { hatched: true, genesisId: player.pet.genesisId, name: player.pet.name } : { hatched: false, genesisId: null, name: null },
      crewPassport: player ? participationGateView(player, currentMs) : { complete: false, xpUnlocked: false, missing: ['pet', 'x', 'telegram', 'membership'] },
      rewardHolding: player ? rewardHoldingView(player) : null,
      ledger: player ? playerLedgerView(state, player, { limit: 250, nowMs: currentMs }) : { petXp: 0, currentEpochId: epochWindow(currentMs).id, currentEpochXp: 0, pet: [], epoch: [] },
      currentEpoch: epochs[0],
      recentEpochs: epochs.slice(1),
      summary: {
        verifiedXp: epochs.reduce((sum, epoch) => sum + epoch.participation.verifiedXp, 0),
        eligibleReceipts: epochs.reduce((sum, epoch) => sum + epoch.participation.eligibleReceipts, 0),
        claimableEpochs: epochs.filter((epoch) => epoch.claim.claimable).length,
        claimedEpochs: epochs.filter((epoch) => epoch.claim.claimed).length,
      },
      policy: {
        canonicalSource: 'PRESERVED_HATCHERY_SQLITE_LEDGER_WITH_ENUMERABLE_ONCHAIN_AWARDS_AND_LIVE_CLAIM_BALANCE',
        walletPrivate: true,
        estimatedShareNonBinding: true,
        sprintSeparate: true,
        nominationsRewardXp: false,
      },
    };
  }
  function alphaProtocolSummary() { return repository.protocol.summary(); }
  function reconcileAlphaProtocolPets() {
    const state = readState();
    if (repository.protocol.enabled !== true) return { status: 'SQLITE_PROTOCOL_STORE_REQUIRED', checked: 0, queued: 0 };
    const actions = [];
    for (const player of Object.values(state.players || {})) {
      const wallet = normalizeAddress(player?.ownerAddress);
      const genesisId = String(player?.pet?.genesisId || '').toUpperCase();
      if (!wallet || !/^AXO-[A-F0-9]{10}$/.test(genesisId)) continue;
      const hatchEvent = (state.events || []).find((event) => event.type === 'PET_HATCHED'
        && normalizeAddress(event.playerId) === wallet
        && String(event.metadata?.genesisId || event.petGenesisId || '').toUpperCase() === genesisId);
      const evidenceHash = `0x${crypto.createHash('sha256').update(JSON.stringify({
        schema: 'AXO_PET_BIND_BOOTSTRAP_V1',
        wallet,
        genesisId,
        sourceEventId: hatchEvent?.id || null,
        hatchedAt: hatchEvent?.at || player.createdAt || null,
      })).digest('hex')}`;
      const bind = petBindAction({ wallet, genesisId, evidenceHash });
      if (!repository.protocol.identityActionForPet(bind.payload.petIdHash)) actions.push(bind);
      if (player.moderation?.alphaMining?.status === 'BLOCKED') {
        const blockEvidenceHash = /^0x[0-9a-fA-F]{64}$/.test(String(player.moderation.alphaMining.evidenceHash || ''))
          ? String(player.moderation.alphaMining.evidenceHash).toLowerCase()
          : `0x${crypto.createHash('sha256').update(JSON.stringify({
            schema: 'AXO_WALLET_BLOCK_BOOTSTRAP_V1', wallet, genesisId,
            reason: player.moderation.alphaMining.reason || 'LEGACY_ALPHA_MINING_BLOCK',
            updatedAt: player.moderation.alphaMining.updatedAt || null,
          })).digest('hex')}`;
        const block = walletBlockAction({
          wallet,
          genesisId,
          blocked: true,
          reasonHash: `0x${crypto.createHash('sha256').update(String(player.moderation.alphaMining.reason || 'LEGACY_ALPHA_MINING_BLOCK')).digest('hex')}`,
          evidenceHash: blockEvidenceHash,
        });
        if (!repository.protocol.outboxByDedupeKey(block.dedupeKey)) actions.push(block);
      }
    }
    if (actions.length) saveState(state, { protocolActions: actions });
    return {
      status: 'RECONCILED',
      checked: Object.keys(state.players || {}).length,
      queued: actions.length,
      historicalXpImported: false,
      reason: 'PET_IDENTITY_ONLY_PREDEPLOYMENT_XP_REQUIRES_REVIEWED_GENESIS_DECISION',
    };
  }
  function alphaProtocolWalletActions(address, { limit = 50 } = {}) {
    const owner = requireAddress(address);
    return repository.protocol.listOutbox({ statuses: ['AWAITING_WALLET'], limit })
      .filter((action) => normalizeAddress(action.payload?.wallet) === owner)
      .map((action) => {
        const registryAddress = protocolConfig.intelRegistryAddress || action.payload?.registryAddress || null;
        const calldata = registryAddress ? (action.payload?.calldata || intelCommitCalldata(action.payload || {})) : null;
        return ({
        id: action.id,
        actionType: action.actionType,
        aggregateId: action.aggregateId,
        status: action.status,
        transaction: registryAddress && calldata ? {
          chainId: action.chainId,
          to: registryAddress,
          data: calldata,
          value: '0',
        } : null,
        contentHash: action.payload?.contentHash || null,
        clientNonce: action.payload?.clientNonce || null,
        signingAuthority: action.payload?.signingAuthority || null,
        createdAt: action.createdAt,
      });
      });
  }
  function alphaProtocolClaimProof(address, epochId) {
    const owner = requireAddress(address);
    const proof = repository.protocol.privateClaimProof(String(epochId), owner);
    if (!proof) return { status: 'NOT_CLAIMABLE', epochId: String(epochId), claim: null };
    const projected = repository.protocol.epochById(String(epochId));
    const accountClaim = repository.protocol.claimableForAccount(owner, 24)
      .find((item) => String(item.epochId) === String(epochId));
    if (accountClaim?.claimed) {
      return {
        status: 'CLAIMED',
        ...proof,
        chain: projected ? {
          status: projected.status,
          claimDeadline: projected.claimDeadline,
          updatedBlock: projected.updatedBlock,
        } : null,
        transaction: null,
      };
    }
    const claimable = projected?.status === 'CLAIMABLE'
      && normalizeHash(projected.datasetHash) === normalizeHash(proof.datasetHash)
      && normalizeHash(projected.merkleRoot) === normalizeHash(proof.merkleRoot)
      && normalizeAddress(projected.rewardToken) === normalizeAddress(proof.rewardToken)
      && Boolean(protocolConfig.epochRewardsAddress);
    return {
      status: claimable ? 'CLAIMABLE' : 'PROOF_READY',
      ...proof,
      chain: projected ? {
        status: projected.status,
        claimDeadline: projected.claimDeadline,
        rewardTokenDecimals: projected.rewardTokenDecimals,
        updatedBlock: projected.updatedBlock,
      } : null,
      transaction: claimable ? {
        chainId: Number(protocolConfig.chainId || 4663),
        to: protocolConfig.epochRewardsAddress,
        data: rewardClaimCalldata({ epochId, claim: proof.claim }),
        value: '0',
      } : null,
    };
  }
  function markAlphaProtocolWalletAction(address, actionId, txHash) {
    const owner = requireAddress(address);
    if (!/^0x[0-9a-fA-F]{64}$/.test(String(txHash || ''))) throw new Error('alpha_protocol_transaction_hash_invalid');
    const action = repository.protocol.listOutbox({ statuses: ['AWAITING_WALLET', 'SUBMITTED'], limit: 500 }).find((item) => item.id === actionId);
    if (!action || normalizeAddress(action.payload?.wallet) !== owner) throw new Error('alpha_protocol_wallet_action_not_found');
    if (action.status === 'AWAITING_WALLET') repository.protocol.markOutbox(action.id, 'SUBMITTED', { chainId: action.chainId, txHash: txHash.toLowerCase(), incrementAttempt: false });
    return { id: action.id, status: 'SUBMITTED', txHash: txHash.toLowerCase(), confirmation: 'AWAITING_FINALIZED_INDEXER_EVENT' };
  }
  function alphaProtocolOutbox(actorAddress, input = {}) {
    const state = readState(); requireStaff(state, actorAddress, true);
    const actions = repository.protocol.listOutbox({ statuses: input.statuses || [], limit: input.limit || 100 });
    return {
      summary: repository.protocol.summary(),
      actions: actions.map((action) => ({
        ...action,
        safeTransaction: safeTransactionForAction(action, {
          xpRegistryAddress: protocolConfig.xpRegistryAddress,
          chainId: protocolConfig.chainId || 4663,
        }),
      })),
      execution: {
        model: 'SAFE_OR_ROLE_WALLET_ONLY',
        applicationBroadcastEnabled: false,
        arbitraryCalldataAccepted: false,
      },
    };
  }
  function markAlphaProtocolSafeAction(actorAddress, actionId, txHash) {
    const state = readState(); requireStaff(state, actorAddress, true);
    const normalizedTxHash = String(txHash || '').toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(normalizedTxHash)) throw new Error('alpha_protocol_transaction_hash_invalid');
    const action = repository.protocol.outboxById(actionId);
    if (!action) throw new Error('alpha_protocol_safe_action_not_found');
    const transaction = safeTransactionForAction(action, {
      xpRegistryAddress: protocolConfig.xpRegistryAddress,
      chainId: protocolConfig.chainId || 4663,
    });
    if (!transaction || transaction.signingAuthority === 'USER_WALLET_ONLY') throw new Error('alpha_protocol_safe_action_not_found');
    if (action.status === 'SUBMITTED') {
      if (normalizeHash(action.txHash) !== normalizedTxHash) throw new Error('alpha_protocol_safe_action_transaction_conflict');
    } else {
      if (!['AWAITING_SIGNER', 'FAILED_RETRYABLE'].includes(action.status)) throw new Error('alpha_protocol_safe_action_status_invalid');
      repository.protocol.markOutbox(action.id, 'SUBMITTED', {
        chainId: transaction.chainId,
        txHash: normalizedTxHash,
        incrementAttempt: false,
      });
    }
    return {
      id: action.id,
      status: 'SUBMITTED',
      txHash: normalizedTxHash,
      signingAuthority: transaction.signingAuthority,
      confirmation: 'AWAITING_FINALIZED_INDEXER_EVENT',
      applicationBroadcastEnabled: false,
    };
  }
  function prepareAlphaSettlement(actorAddress, input = {}) {
    const state = readState(); requireStaff(state, actorAddress, true);
    if (protocolConfig.settlementPreparationEnabled !== true) throw new Error('alpha_protocol_settlement_preparation_disabled');
    const dataset = buildCanonicalSettlement({
      displayEpochId: input.displayEpochId,
      protocolStore: repository.protocol,
      state,
      chainId: protocolConfig.chainId || 4663,
      rewardsContract: protocolConfig.epochRewardsAddress,
      rewardToken: input.rewardToken,
      rewardTokenDecimals: input.rewardTokenDecimals,
      rewardTokenConfigHash: input.rewardTokenConfigHash,
      fundedAmount: input.fundedAmount,
      rewardHoldingPolicy: protocolConfig.rewardHolding,
    });
    return {
      schema: dataset.schema,
      epochId: dataset.epochId,
      displayEpochId: input.displayEpochId,
      datasetHash: dataset.datasetHash,
      merkleRoot: dataset.merkleRoot,
      rowsHash: dataset.rowsHash,
      participantCount: dataset.participantCount,
      claimCount: dataset.claimCount,
      allocatedAmount: dataset.allocatedAmount,
      carryoverAmount: dataset.carryoverAmount,
      holdingSnapshot: dataset.holdingSnapshot,
      privateRowsWithheld: true,
      broadcastAuthorized: false,
    };
  }
  async function scoreAlphaCalls({ sampleLoader, costs = null, limit = 50 } = {}) {
    if (typeof sampleLoader !== 'function') throw new Error('alpha_performance_sample_loader_required');
    const state = readState();
    const candidates = state.contributions.filter((item) => item.alphaCall && !item.alphaCall.performance?.scoredAt)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).slice(0, Math.max(1, Math.min(250, Number(limit || 50))));
    const results = [];
    for (const candidate of candidates) {
      const loadedSamples = await sampleLoader({
        contributionId: candidate.id,
        tokenAddress: candidate.alphaCall.tokenAddress,
        poolAddress: candidate.alphaCall.poolAddress,
        from: candidate.alphaCall.submittedAt,
        to: candidate.alphaCall.expiresAt,
        limit: 10_000,
      });
      const refreshed = readState();
      const contribution = refreshed.contributions.find((item) => item.id === candidate.id);
      if (!contribution?.alphaCall || contribution.alphaCall.performance?.scoredAt) {
        results.push({ contributionId: candidate.id, status: 'ALREADY_SCORED', changed: false });
        continue;
      }
      const call = contribution.alphaCall;
      const currentMs = now();
      const projectQuest = refreshed.projectQuests?.[entityKey(call.tokenAddress)] || null;
      const safetyHistory = Array.isArray(projectQuest?.safetyHistory) ? projectQuest.safetyHistory : [];
      const safetySamples = safetyHistory.map((entry) => entry?.routeSnapshot || entry?.performance?.route).filter((sample) => (
        normalizeAddress(sample?.poolAddress) === normalizeAddress(call.poolAddress)
      )).map((sample) => ({
        at: sample.observedAt,
        priceUsd: sample.priceUsd,
        liquidityUsd: sample.liquidityUsd,
        executable: sample.executable === true,
      }));
      const normalized = [...(loadedSamples || []), ...safetySamples].map((sample) => ({
        at: sample.at || sample.observedAt,
        priceUsd: sample.priceUsd,
        liquidityUsd: sample.liquidityUsd,
        executable: sample.executable !== false,
      })).filter((sample, index, rows) => rows.findIndex((candidateSample) => (
        String(candidateSample.at) === String(sample.at) && Number(candidateSample.priceUsd) === Number(sample.priceUsd)
      )) === index);
      const initialSafety = call.safety?.initial || alphaPerformanceSafety(contribution.evidence?.projectSafety, call.poolAddress);
      const currentSettlementSafety = alphaPerformanceSafety(projectQuest?.safety || {}, call.poolAddress);
      const provisionalCosts = {
        entryFeeBps: initialSafety.costs?.entryFeeBps ?? costs?.entryFeeBps,
        exitFeeBps: currentSettlementSafety.costs?.exitFeeBps ?? costs?.exitFeeBps,
        nowMs: currentMs,
      };
      const costEvidenceComplete = Number.isInteger(provisionalCosts.entryFeeBps) && Number.isInteger(provisionalCosts.exitFeeBps);
      let score = costEvidenceComplete
        ? evaluateAlphaCall(call, normalized, provisionalCosts)
        : { status: 'DATA_INCOMPLETE', scored: false, performanceXp: 0, fixedTradeUsd: ALPHA_CALL_HYPOTHETICAL_TRADE_USD, reason: 'EXACT_ROUTE_COST_EVIDENCE_INCOMPLETE' };
      const reviewEndsMs = Date.parse(call.performanceWindow?.epochReviewEndsAt || 0);
      if (!score.scored && Number.isFinite(reviewEndsMs) && currentMs >= reviewEndsMs) {
        score = { ...score, status: 'WITHHELD', scored: true, performanceXp: 0, reason: score.reason || 'OUTCOME_EVIDENCE_INCOMPLETE_AT_REVIEW_CLOSE' };
      }
      if (!score.scored) {
        results.push({ contributionId: candidate.id, status: score.status, changed: false, reason: score.reason });
        continue;
      }
      let settlementSafety = currentSettlementSafety;
      const exitMs = Date.parse(score.exitAt || call.expiresAt || 0);
      const nearestSafety = safetyHistory.filter((entry) => Number.isFinite(Date.parse(entry?.checkedAt || 0)))
        .sort((left, right) => Math.abs(Date.parse(left.checkedAt) - exitMs) - Math.abs(Date.parse(right.checkedAt) - exitMs))[0];
      if (nearestSafety?.performance) {
        const nearestPool = normalizeAddress(nearestSafety.performance.route?.poolAddress);
        settlementSafety = {
          ...nearestSafety.performance,
          eligible: nearestSafety.performance.eligible === true && nearestPool === normalizeAddress(call.poolAddress),
          exactPoolMatched: nearestPool === normalizeAddress(call.poolAddress),
          reason: nearestPool === normalizeAddress(call.poolAddress) ? nearestSafety.performance.reason : 'SUBMITTED_POOL_NOT_EXACT_CLEARED_ROUTE',
        };
      }
      if (score.scored && score.exitAt && initialSafety.costs && settlementSafety.costs) {
        score = evaluateAlphaCall(call, normalized, {
          entryFeeBps: initialSafety.costs.entryFeeBps,
          exitFeeBps: settlementSafety.costs.exitFeeBps,
          nowMs: currentMs,
        });
      }
      const settlementCheckedMs = Date.parse(settlementSafety.checkedAt || 0);
      const settlementFresh = Number.isFinite(settlementCheckedMs) && Number.isFinite(exitMs)
        && Math.abs(settlementCheckedMs - exitMs) <= PROJECT_SAFETY_TTL_MS + 15 * 60_000;
      const researchEligible = contribution.receiptClass === 'EVIDENCE_RECEIPT' && contribution.consensusEligible === true;
      const performanceRewardEligible = score.scored === true
        && score.performanceXp > 0
        && initialSafety.eligible === true
        && settlementSafety.eligible === true
        && settlementFresh
        && researchEligible;
      const calculatedPerformanceXp = Number(score.performanceXp || 0);
      const awardedPerformanceXp = performanceRewardEligible ? calculatedPerformanceXp : 0;
      const rewardWithholdingReason = performanceRewardEligible || calculatedPerformanceXp <= 0 ? null
        : initialSafety.eligible !== true ? `INITIAL_${initialSafety.reason || 'MECHANICAL_CLEARANCE_REQUIRED'}`
          : settlementSafety.eligible !== true ? `SETTLEMENT_${settlementSafety.reason || 'MECHANICAL_CLEARANCE_REQUIRED'}`
            : !settlementFresh ? 'SETTLEMENT_SAFETY_EVIDENCE_STALE'
              : !researchEligible ? 'EVIDENCE_RECEIPT_AND_REWARD_IDENTITY_REQUIRED'
                : 'PERFORMANCE_REWARD_WITHHELD';
      const player = refreshed.players[contribution.playerId];
      const scoredAt = new Date(currentMs).toISOString();
      contribution.alphaCall.safety = { initial: initialSafety, settlement: settlementSafety };
      contribution.alphaCall.performance = {
        ...score,
        status: score.status,
        returnPct: score.netReturnPct ?? null,
        calculatedPerformanceXp,
        performanceXp: awardedPerformanceXp,
        rewardEligible: performanceRewardEligible,
        rewardWithholdingReason,
        targetHitAt: score.result === 'TARGET_HIT' ? score.exitAt : null,
        stopHitAt: score.result === 'STOP_HIT' ? score.exitAt : null,
        scoredAt,
        fixedTradeUsd: ALPHA_CALL_HYPOTHETICAL_TRADE_USD,
        performanceEpochId: call.performanceEpochId,
      };
      contribution.alphaCall.status = 'SCORED';
      const scoreCosts = { entryFeeBps: score.entryFeeBps ?? provisionalCosts.entryFeeBps, exitFeeBps: score.exitFeeBps ?? provisionalCosts.exitFeeBps };
      const evidenceHash = `0x${crypto.createHash('sha256').update(JSON.stringify({ contributionId: contribution.id, score, scoreCosts, initialSafety, settlementSafety, performanceRewardEligible })).digest('hex')}`;
      const protocolActions = [];
      if (awardedPerformanceXp > 0 && player && contribution.petGenesisId === player.pet.genesisId
        && player.moderation?.status !== 'SUSPENDED' && player.moderation?.alphaMining?.status !== 'BLOCKED') {
        queueAlphaReward(refreshed, protocolActions, {
          id: `performance:${contribution.id}`,
          player,
          amount: awardedPerformanceXp,
          reasonCode: 'ALPHA_CALL_PERFORMANCE',
          evidenceHash,
          sourceHash: alphaCallSourceHash(contribution),
          recordedAt: scoredAt,
          attributedAt: contribution.alphaCall.submittedAt,
          sourceId: contribution.id,
          receiptId: contribution.id,
          receiptClass: contribution.receiptClass,
        });
      }
      recordEvent(refreshed, 'ALPHA_CALL_PERFORMANCE_SCORED', contribution.playerId, {
        contributionId: contribution.id,
        performanceEpochId: contribution.alphaCall.performanceEpochId,
        result: score.result || score.status,
        returnPct: score.netReturnPct ?? null,
        realizedProfitUsd: score.realizedProfitUsd ?? null,
        potentialProfitUsd: score.potentialProfitUsd ?? null,
        potentialReturnPct: score.potentialReturnPct ?? null,
        profitMultiplier: score.profitMultiplier ?? null,
        calculatedPerformanceXp,
        performanceXp: awardedPerformanceXp,
        rewardEligible: performanceRewardEligible,
        rewardWithholdingReason,
        initialMechanicalClearance: initialSafety.eligible === true,
        settlementMechanicalClearance: settlementSafety.eligible === true,
        settlementSafetyFresh: settlementFresh,
        fixedTradeUsd: ALPHA_CALL_HYPOTHETICAL_TRADE_USD,
        evidenceHash,
        targetBeforeStop: score.targetBeforeStop === true,
        walletPortfolioInfluence: false,
      }, scoredAt);
      saveState(refreshed, { protocolActions });
      results.push({ contributionId: contribution.id, status: score.status, changed: true, calculatedPerformanceXp, performanceXp: awardedPerformanceXp, rewardEligible: performanceRewardEligible, rewardWithholdingReason });
    }
    return { checked: candidates.length, scored: results.filter((item) => item.changed).length, results };
  }
  function staffContext(address) {
    const owner = requireAddress(address); const state = readState(); const role = staffRoleInState(state, owner);
    const administrator = adminRole(role);
    return {
      role,
      permissions: {
        adminConsole: administrator,
        createSprints: administrator || role === 'MODERATOR',
        manageSprints: administrator || role === 'MODERATOR',
        createBrandedImages: administrator || role === 'MODERATOR',
        publishX: administrator || role === 'MODERATOR',
        proposeCommunityPrizes: administrator || role === 'MODERATOR',
        manageCommunityFeedback: administrator || role === 'MODERATOR',
        finalizeRewards: administrator,
        manageStaff: administrator,
        manageAdmins: role === 'OWNER',
        manageModerators: administrator,
        awardAlphaSpotlights: administrator,
        adjustAlphaXp: administrator,
        manageAlphaBlocks: administrator,
        manageOutreach: administrator,
        manageAccess: administrator,
        managePets: administrator,
      },
      moderators: administrator ? [...new Set([...configuredModerators, ...(state.staff?.moderators || [])])] : [],
    };
  }
  function staffDirectory(actorAddress) {
    const state = readState(); const actor = requireStaff(state, actorAddress, true);
    const addresses = [...new Set([
      ...configuredAdmins,
      ...(state.staff?.admins || []),
      ...configuredModerators,
      ...(state.staff?.moderators || []),
    ])];
    const staff = addresses.map((address) => {
      const role = staffRoleInState(state, address);
      const assignment = state.staff?.assignments?.[address] || null;
      const configuredOwner = configuredAdmins.has(address);
      const configuredModerator = configuredModerators.has(address) && role === 'MODERATOR';
      return {
        address,
        role,
        source: configuredOwner ? 'CONFIGURED_OWNER' : configuredModerator ? 'CONFIGURED_MODERATOR' : 'PERSISTENT_LEDGER',
        protected: configuredOwner || configuredModerator || address === actor.owner,
        canChange: !configuredOwner && !configuredModerator && address !== actor.owner && (actor.role === 'OWNER' || role !== 'ADMIN'),
        assignment: assignment ? { assignedBy: assignment.assignedBy, assignedAt: assignment.assignedAt, reason: assignment.reason, source: assignment.source } : null,
      };
    }).sort((a, b) => ({ OWNER: 0, ADMIN: 1, MODERATOR: 2 }[a.role] - { OWNER: 0, ADMIN: 1, MODERATOR: 2 }[b.role]) || a.address.localeCompare(b.address));
    return {
      generatedAt: new Date(now()).toISOString(),
      operator: { address: actor.owner, role: actor.role, permissions: staffContext(actor.owner).permissions },
      counts: {
        owners: staff.filter((entry) => entry.role === 'OWNER').length,
        admins: staff.filter((entry) => entry.role === 'ADMIN').length,
        moderators: staff.filter((entry) => entry.role === 'MODERATOR').length,
      },
      staff,
      policy: {
        ownerSource: 'CONFIGURATION_PROTECTED',
        adminManagement: 'OWNER_ONLY',
        moderatorManagement: 'OWNER_OR_ADMIN',
        freshSignatureRequired: true,
        auditEvents: 'APPEND_ONLY',
      },
    };
  }
  function adminPetList(actorAddress, { q = '', status = '', limit = 100, offset = 0 } = {}) {
    const state = readState(); requireStaff(state, actorAddress, true); const query = safeText(q, 120).toLowerCase();
    const cleanStatus = status === 'SUSPENDED' ? 'SUSPENDED' : status === 'ACTIVE' ? 'ACTIVE' : '';
    const all = Object.values(state.players).filter((player) => {
      const petStatus = player.moderation?.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
      return (!cleanStatus || petStatus === cleanStatus) && (!query || player.ownerAddress.toLowerCase().includes(query) || player.pet.name.toLowerCase().includes(query) || player.pet.genesisId.toLowerCase().includes(query));
    }).sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt));
    const start = Math.max(0, Number(offset || 0)); const size = Math.max(1, Math.min(250, Number(limit || 100)));
    return { generatedAt: new Date(now()).toISOString(), total: all.length, pets: all.slice(start, start + size).map((player) => {
      const ledger = playerLedgerView(state, player, { limit: 500, nowMs: now() });
      const publicView = publicPlayer(player, state.contributions, now(), {}, { socialRewardMissionsActive });
      return { ownerAddress: player.ownerAddress, genesisId: player.pet.genesisId, name: player.pet.name, level: currentLevel(player.pet.xp), xp: Number(player.pet.xp || 0), currentEpochId: ledger.currentEpochId, epochXp: ledger.currentEpochXp, status: player.moderation?.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE', happy: publicView.pet.happy, socialIdentities: publicView.socialIdentities, lastActiveDay: player.care.lastActiveDay, createdAt: player.createdAt, updatedAt: player.updatedAt };
    }) };
  }
  function adminPetDetail(actorAddress, targetAddress) {
    const state = readState(); requireStaff(state, actorAddress, true); const owner = requireAddress(targetAddress); const player = state.players[owner]; if (!player) throw new Error('pet_not_hatched');
    const view = publicPlayer(player, state.contributions, now(), {}, { socialRewardMissionsActive });
    const ledger = playerLedgerView(state, player, { limit: 500, nowMs: now() });
    const epochScores = [...rewardEntries(state).filter((entry) => normalizeAddress(entry.playerId) === owner).reduce((scores, entry) => {
      const epochId = entry.displayEpochId;
      const current = scores.get(epochId) || { epochId, verifiedXp: 0, receiptCount: 0, latestAt: null };
      if (entry.settlementEligible !== false) current.verifiedXp += Number(entry.amount || 0);
      current.receiptCount += 1;
      const entryAt = entry.attributedAt || entry.recordedAt;
      if (!current.latestAt || String(entryAt) > current.latestAt) current.latestAt = entryAt;
      scores.set(epochId, current);
      return scores;
    }, new Map()).values()].map((score) => {
      const result = state.epochResults?.[score.epochId];
      const standing = result?.standings?.find((entry) => String(entry.genesisId || '').toUpperCase() === String(player.pet.genesisId).toUpperCase());
      return { ...score, verifiedXp: Math.max(0, score.verifiedXp), rank: standing?.rank || null, resultStatus: result?.status || (score.epochId === ledger.currentEpochId ? 'ACTIVE' : 'LEDGER_RECORDED') };
    }).sort((left, right) => String(right.epochId).localeCompare(String(left.epochId)));
    const adminIdentity = (platform) => {
      const identity = player.social?.identities?.[platform];
      if (!identity) return null;
      return { ...view.socialIdentities?.[platform], providerUserId: identity.providerUserId || null, accountCreatedAt: identity.accountCreatedAt || null, providerVerified: identity.providerVerified === true, verifiedAt: identity.verifiedAt || null };
    };
    return { ownerAddress: owner, genesisId: player.pet.genesisId, name: player.pet.name, lineage: lineageDefinition(player.pet.lineageId).label, level: view.pet.level, stage: view.pet.stage, xp: Number(player.pet.xp || 0), epochXp: ledger.currentEpochXp, epochScores, ledger, vitals: player.pet.vitals, status: player.moderation?.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE', alphaMiningStatus: player.moderation?.alphaMining?.status === 'BLOCKED' ? 'BLOCKED' : 'ACTIVE', moderation: player.moderation, reputation: player.reputation, socialIdentities: { x: adminIdentity('x'), telegram: adminIdentity('telegram'), policy: view.socialIdentities.policy }, telegramMembership: telegramMembershipView(player, now()), toolPass: view.pet.toolPass, createdAt: player.createdAt, updatedAt: player.updatedAt };
  }
  function adminUpdatePet(actorAddress, targetAddress, input = {}) {
    const state = readState(); const actor = requireStaff(state, actorAddress, true); const owner = requireAddress(targetAddress); const player = state.players[owner]; if (!player) throw new Error('pet_not_hatched');
    const before = { name: player.pet.name, status: player.moderation?.status || 'ACTIVE', xp: player.pet.xp, reputation: player.reputation }; const changedAt = new Date(now()).toISOString();
    if (input.name !== undefined) { const cleanName = safeText(input.name, 20); if (cleanName.length < 2) throw new Error('pet_name_too_short'); player.pet.name = cleanName; recordEvent(state, 'PET_ADMIN_RENAMED', owner, { actor: actor.owner, previousName: before.name, name: cleanName }, changedAt); }
    if (input.status !== undefined) {
      const nextStatus = input.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'; const current = player.moderation?.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
      player.moderation = { ...player.moderation, status: nextStatus, reason: nextStatus === 'SUSPENDED' ? safeText(input.reason || 'Administrative review', 500) : null, updatedAt: changedAt, updatedBy: actor.owner };
      if (current !== nextStatus) recordEvent(state, nextStatus === 'SUSPENDED' ? 'PET_ADMIN_SUSPENDED' : 'PET_ADMIN_RESTORED', owner, { actor: actor.owner, reason: player.moderation.reason }, changedAt);
    }
    player.updatedAt = changedAt; saveState(state); const after = adminPetDetail(actor.owner, owner);
    return { pet: after, invariants: { xpPreserved: Number(before.xp) === Number(after.xp), reputationPreserved: JSON.stringify(before.reputation) === JSON.stringify(after.reputation), productionRankingsMutated: false } };
  }
  function adjustPlayerLedger(actorAddress, targetAddress, input = {}) {
    const state = readState();
    const actor = requireStaff(state, actorAddress, true);
    const owner = requireAddress(targetAddress);
    const player = state.players[owner];
    if (!player) throw new Error('pet_not_hatched');
    const petXpDelta = Number(input.petXpDelta || 0);
    const epochXpDelta = Number(input.epochXpDelta || 0);
    const reason = safeText(input.reason, 500);
    if (![petXpDelta, epochXpDelta].every((value) => Number.isInteger(value) && Math.abs(value) <= ALPHA_CORRECTION_MAX_ABS_XP) || (!petXpDelta && !epochXpDelta)) throw new Error('player_ledger_adjustment_invalid');
    if (reason.length < 12) throw new Error('player_ledger_adjustment_reason_required');
    if (Number(player.pet.xp || 0) + petXpDelta < 0) throw new Error('pet_xp_adjustment_below_zero');
    const adjustedAt = new Date(now()).toISOString();
    const adjustmentId = crypto.randomUUID();
    const evidenceHash = `0x${crypto.createHash('sha256').update(JSON.stringify({ adjustmentId, actor: actor.owner, owner, petXpDelta, epochXpDelta, reason, adjustedAt })).digest('hex')}`;
    const previousPetXp = Number(player.pet.xp || 0);
    if (petXpDelta) {
      player.pet.xp = previousPetXp + petXpDelta;
      recordEvent(state, 'PET_XP_ADMIN_ADJUSTED', player.id, { delta: petXpDelta, previousXp: previousPetXp, nextXp: player.pet.xp, reason, actor: actor.owner, evidenceHash }, adjustedAt);
    }
    if (epochXpDelta) {
      const sourceHash = `0x${crypto.createHash('sha256').update(`admin-ledger:${adjustmentId}`).digest('hex')}`;
      queueEpochLedgerReward(state, { id: `admin-ledger:${adjustmentId}`, player, amount: epochXpDelta, reasonCode: 'ADMIN_DATA_CORRECTION', evidenceHash, sourceHash, recordedAt: adjustedAt, sourceId: adjustmentId });
    }
    state.playerLedgerAdjustments ||= {};
    state.playerLedgerAdjustments[adjustmentId] = { id: adjustmentId, owner, petGenesisId: player.pet.genesisId, petXpDelta, epochXpDelta, reason, evidenceHash, adjustedAt, adjustedBy: actor.owner };
    player.updatedAt = adjustedAt;
    saveState(state);
    return { adjustment: state.playerLedgerAdjustments[adjustmentId], pet: adminPetDetail(actor.owner, owner) };
  }
  function awardAlphaSpotlight(actorAddress, input = {}) {
    const state = readState(); const actor = requireStaff(state, actorAddress, true);
    const contributionId = safeText(input.contributionId, 80); const xp = Number(input.xp); const reason = safeText(input.reason, 500);
    if (!contributionId) throw new Error('alpha_spotlight_contribution_required');
    if (!Number.isInteger(xp) || xp < 1 || xp > ALPHA_SPOTLIGHT_MAX_XP) throw new Error('alpha_spotlight_xp_invalid');
    if (reason.length < 8) throw new Error('alpha_spotlight_reason_required');
    state.alphaSpotlights ||= {};
    if (state.alphaSpotlights[contributionId]) throw new Error('alpha_spotlight_already_awarded');
    const contribution = state.contributions.find((item) => item.id === contributionId);
    if (!contribution || !normalizeAddress(contribution.entity)) throw new Error('alpha_spotlight_contribution_invalid');
    if (contributionBaseXp(contribution) <= 0) throw new Error('alpha_spotlight_receipt_not_reward_eligible');
    const player = state.players[contribution.playerId];
    if (!player || player.moderation?.status === 'SUSPENDED' || player.moderation?.alphaMining?.status === 'BLOCKED') throw new Error('alpha_spotlight_player_blocked');
    if (contribution.petGenesisId && contribution.petGenesisId !== player.pet.genesisId) throw new Error('alpha_spotlight_pet_replaced');
    const awardedAt = new Date(now()).toISOString();
    const evidenceHash = `0x${crypto.createHash('sha256').update(JSON.stringify({ contributionId, entityKey: contribution.entityKey, qualityScore: contribution.evidence?.qualityScore || 0, reason })).digest('hex')}`;
    const spotlight = {
      id: crypto.randomUUID(),
      contributionId,
      playerId: player.id,
      petGenesisId: player.pet.genesisId,
      entityKey: contribution.entityKey || entityKey(contribution.entity),
      xp,
      reason,
      reasonCode: 'COMMUNITY_RESEARCH_SPOTLIGHT',
      evidenceHash,
      awardedAt,
      awardedBy: actor.owner,
      affectsProductionRanking: false,
    };
    state.alphaSpotlights[contributionId] = spotlight;
    player.pet.xp += xp; player.updatedAt = awardedAt;
    recordEvent(state, 'ALPHA_SPOTLIGHT_BONUS_GRANTED', player.id, { contributionId, entityKey: spotlight.entityKey, xp, reasonCode: spotlight.reasonCode, evidenceHash, affectsProductionRanking: false }, awardedAt);
    const protocolActions = [];
    queueAlphaReward(state, protocolActions, { id: spotlight.id, player, amount: xp, reasonCode: spotlight.reasonCode, evidenceHash, sourceHash: alphaCallSourceHash(contribution), recordedAt: awardedAt, sourceId: spotlight.id, receiptId: contribution.id, receiptClass: contribution.receiptClass, reviewer: true });
    saveState(state, { protocolActions });
    return {
      spotlight: { id: spotlight.id, contributionId, petGenesisId: spotlight.petGenesisId, entityKey: spotlight.entityKey, xp, reasonCode: spotlight.reasonCode, evidenceHash, awardedAt },
      pet: alphaPlayerView(player),
    };
  }
  function adjustAlphaXp(actorAddress, targetAddress, input = {}) {
    const state = readState(); const actor = requireStaff(state, actorAddress, true); const owner = requireAddress(targetAddress); const player = state.players[owner];
    if (!player) throw new Error('pet_not_hatched');
    const amount = Number(input.amount); const reasonCode = safeText(input.reasonCode, 80).toUpperCase(); const reason = safeText(input.reason, 500); const evidenceUrl = safeUrl(input.evidenceUrl); const sourceContributionId = safeText(input.sourceContributionId, 80) || null;
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > ALPHA_CORRECTION_MAX_ABS_XP) throw new Error('alpha_xp_adjustment_amount_invalid');
    if (!ALPHA_ADMIN_ADJUSTMENT_REASONS.includes(reasonCode)) throw new Error('alpha_xp_adjustment_reason_code_invalid');
    if (reason.length < 12) throw new Error('alpha_xp_adjustment_reason_required');
    const reasonPolicy = ALPHA_XP_REASON_CODES[reasonCode];
    if (reasonPolicy.direction === 'CREDIT' && amount < 0) throw new Error('alpha_xp_adjustment_direction_invalid');
    if (reasonPolicy.direction === 'DEBIT' && amount > 0) throw new Error('alpha_xp_adjustment_direction_invalid');
    const contribution = sourceContributionId ? state.contributions.find((item) => item.id === sourceContributionId) : null;
    if (sourceContributionId && (!contribution || contribution.playerId !== owner)) throw new Error('alpha_xp_adjustment_contribution_invalid');
    if (amount > 0 && contribution?.petGenesisId && contribution.petGenesisId !== player.pet.genesisId) throw new Error('alpha_xp_adjustment_pet_replaced');
    if (amount > 0 && (player.moderation?.status === 'SUSPENDED' || player.moderation?.alphaMining?.status === 'BLOCKED')) throw new Error('alpha_xp_adjustment_player_blocked');
    const adjustedAt = new Date(now()).toISOString(); const appliedEpochId = epochWindow(now()).id; const sourceEpochId = contribution ? epochWindow(Date.parse(contribution.createdAt)).id : safeText(input.sourceEpochId, 20) || null;
    if (sourceEpochId && !/^AXO-\d{4}-W\d{2}$/.test(sourceEpochId)) throw new Error('alpha_xp_adjustment_source_epoch_invalid');
    const evidenceHash = `0x${crypto.createHash('sha256').update(JSON.stringify({ policyVersion: ALPHA_POLICY_VERSION, owner, petGenesisId: player.pet.genesisId, amount, reasonCode, reason, evidenceUrl, sourceContributionId, sourceEpochId, appliedEpochId })).digest('hex')}`;
    if (Object.values(state.alphaXpAdjustments || {}).some((item) => item.evidenceHash === evidenceHash)) throw new Error('alpha_xp_adjustment_duplicate');
    const adjustment = {
      id: crypto.randomUUID(),
      playerId: owner,
      petGenesisId: player.pet.genesisId,
      amount,
      reasonCode,
      reason,
      evidenceUrl,
      evidenceHash,
      sourceContributionId,
      sourceEpochId,
      appliedEpochId,
      appliedAt: adjustedAt,
      appliedBy: actor.owner,
      affectsPetXp: false,
      affectsProductionRanking: false,
      closedEpochMutation: false,
    };
    state.alphaXpAdjustments ||= {};
    state.alphaXpAdjustments[adjustment.id] = adjustment;
    recordEvent(state, 'ALPHA_XP_CORRECTED', owner, { adjustmentId: adjustment.id, amount, reasonCode, evidenceHash, sourceContributionId, sourceEpochId, appliedEpochId, affectsPetXp: false, affectsProductionRanking: false, closedEpochMutation: false }, adjustedAt);
    const protocolActions = [];
    queueAlphaReward(state, protocolActions, { id: adjustment.id, player, amount, reasonCode, evidenceHash, sourceHash: contribution ? alphaCallSourceHash(contribution) : evidenceHash, recordedAt: adjustedAt, sourceId: adjustment.id, receiptId: contribution?.id || null, receiptClass: contribution?.receiptClass || null, reviewer: true });
    player.updatedAt = adjustedAt; saveState(state, { protocolActions });
    return { adjustment: { id: adjustment.id, petGenesisId: adjustment.petGenesisId, amount, reasonCode, evidenceHash, sourceContributionId, sourceEpochId, appliedEpochId, appliedAt: adjustedAt, affectsPetXp: false }, epoch: { id: appliedEpochId, closedEpochMutation: false } };
  }
  function setAlphaMiningBlock(actorAddress, targetAddress, input = {}) {
    const state = readState(); const actor = requireStaff(state, actorAddress, true); const owner = requireAddress(targetAddress); const player = state.players[owner];
    if (!player) throw new Error('pet_not_hatched');
    const blocked = input.blocked !== false; const reason = safeText(input.reason, 500);
    if (reason.length < 12) throw new Error('alpha_mining_block_reason_required');
    const currentStatus = player.moderation?.alphaMining?.status === 'BLOCKED' ? 'BLOCKED' : 'ACTIVE'; const nextStatus = blocked ? 'BLOCKED' : 'ACTIVE';
    if (currentStatus === nextStatus) throw new Error(blocked ? 'alpha_mining_wallet_already_blocked' : 'alpha_mining_wallet_not_blocked');
    const changedAt = new Date(now()).toISOString();
    const evidenceHash = `0x${crypto.createHash('sha256').update(JSON.stringify({ policyVersion: ALPHA_POLICY_VERSION, owner, petGenesisId: player.pet.genesisId, nextStatus, reason })).digest('hex')}`;
    player.moderation ||= {};
    player.moderation.alphaMining = { status: nextStatus, reason: blocked ? reason : null, evidenceHash, updatedAt: changedAt, updatedBy: actor.owner };
    player.updatedAt = changedAt;
    recordEvent(state, blocked ? 'ALPHA_MINING_WALLET_BLOCKED' : 'ALPHA_MINING_WALLET_UNBLOCKED', owner, { status: nextStatus, reasonCode: blocked ? 'ADMIN_ALPHA_BLOCK' : 'ADMIN_ALPHA_UNBLOCK', evidenceHash, actor: actor.owner }, changedAt);
    const reasonHash = `0x${crypto.createHash('sha256').update(reason).digest('hex')}`;
    saveState(state, { protocolActions: [walletBlockAction({ wallet: owner, genesisId: player.pet.genesisId, blocked, reasonHash, evidenceHash })] });
    return { wallet: owner, petGenesisId: player.pet.genesisId, status: nextStatus, evidenceHash, changedAt, policy: { openOrReviewDataset: blocked ? 'EXCLUDED' : 'ELIGIBLE_SUBJECT_TO_OTHER_GATES', closedEpochMutation: false } };
  }
  function setStaffRole(actorAddress, staffAddress, input = {}) {
    const state = readState(); const actor = requireStaff(state, actorAddress, true); const target = requireAddress(staffAddress);
    const role = String(input.role || '').trim().toUpperCase(); const reason = safeText(input.reason, 500);
    if (!['ADMIN', 'MODERATOR', 'USER'].includes(role)) throw new Error('hatchery_staff_role_invalid');
    if (reason.length < 12) throw new Error('hatchery_staff_role_reason_required');
    if (target === actor.owner) throw new Error('hatchery_staff_self_change_forbidden');
    if (configuredAdmins.has(target) || configuredModerators.has(target)) throw new Error('hatchery_configured_staff_protected');
    const previousRole = staffRoleInState(state, target);
    if (previousRole === role) throw new Error('hatchery_staff_role_unchanged');
    if (actor.role !== 'OWNER' && (role === 'ADMIN' || previousRole === 'ADMIN')) throw new Error('hatchery_owner_required');
    state.staff ||= { admins: [], moderators: [], assignments: {} };
    state.staff.admins ||= []; state.staff.moderators ||= []; state.staff.assignments ||= {};
    const admins = new Set(state.staff.admins); const moderators = new Set(state.staff.moderators);
    admins.delete(target); moderators.delete(target);
    if (role === 'ADMIN') admins.add(target);
    if (role === 'MODERATOR') moderators.add(target);
    state.staff.admins = [...admins].sort(); state.staff.moderators = [...moderators].sort();
    const changedAt = new Date(now()).toISOString();
    if (role === 'USER') delete state.staff.assignments[target];
    else state.staff.assignments[target] = { role, assignedBy: actor.owner, assignedAt: changedAt, reason, source: 'SIGNED_ADMIN_ACTION' };
    recordEvent(state, 'HATCHERY_STAFF_ROLE_CHANGED', target, { previousRole, role, reason, actor: actor.owner, actorRole: actor.role }, changedAt);
    saveState(state);
    return { changedAt, previousRole, role, address: target, directory: staffDirectory(actor.owner) };
  }
  function setModerator(actorAddress, moderatorAddress, enabled = true) {
    return setStaffRole(actorAddress, moderatorAddress, {
      role: enabled ? 'MODERATOR' : 'USER',
      reason: enabled ? 'Appointed as an AXO Hatchery moderator.' : 'AXO Hatchery moderator access revoked.',
    }).directory;
  }
  function sprintDraft(input = {}, existing = null) {
    const title = safeText(input.title === undefined ? existing?.title : input.title, 64); const description = safeText(input.description === undefined ? existing?.description : input.description, 360);
    if (title.length < 3) throw new Error('sprint_title_too_short');
    const startsAtMs = Date.parse(input.startsAt === undefined ? existing?.startsAt : input.startsAt); const endsAtMs = Date.parse(input.endsAt === undefined ? existing?.endsAt : input.endsAt);
    if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs)) throw new Error('sprint_time_invalid');
    const durationMs = endsAtMs - startsAtMs; if (durationMs < SPRINT_MIN_DURATION_MS || durationMs > SPRINT_MAX_DURATION_MS) throw new Error('sprint_duration_invalid');
    const rewardInput = input.reward || {}; const priorReward = existing?.reward || {};
    const reward = {
      label: safeText(rewardInput.label === undefined ? priorReward.label : rewardInput.label, 64),
      description: safeText(rewardInput.description === undefined ? priorReward.description : rewardInput.description, 240),
      winnerCount: Number(rewardInput.winnerCount === undefined ? priorReward.winnerCount : rewardInput.winnerCount),
      bonusXp: Number(rewardInput.bonusXp === undefined ? priorReward.bonusXp : rewardInput.bonusXp),
    };
    if (reward.label.length < 2) throw new Error('sprint_reward_required');
    if (!Number.isInteger(reward.winnerCount) || reward.winnerCount < 1 || reward.winnerCount > 20) throw new Error('sprint_winner_count_invalid');
    if (!Number.isInteger(reward.bonusXp) || reward.bonusXp < 0 || reward.bonusXp > SPRINT_MAX_BONUS_XP) throw new Error('sprint_bonus_xp_invalid');
    return { title, description, startsAt: new Date(startsAtMs).toISOString(), endsAt: new Date(endsAtMs).toISOString(), durationMs, reward };
  }
  function assertSprintDoesNotOverlap(state, draft, ignoredId = null) {
    const draftStart = Date.parse(draft.startsAt); const draftEnd = Date.parse(draft.endsAt);
    const collision = Object.values(state.sprints || {}).find((sprint) => sprint.id !== ignoredId && !sprint.cancelledAt && ['SCHEDULED', 'ACTIVE'].includes(sprintStatus(sprint, now())) && draftStart < sprintWindow(sprint).endMs && draftEnd > sprintWindow(sprint).startMs);
    if (collision) throw new Error('sprint_time_overlap');
  }
  function createSprint(actorAddress, input = {}) {
    const state = readState(); const actor = requireStaff(state, actorAddress); const draft = sprintDraft(input); assertSprintDoesNotOverlap(state, draft);
    const createdAt = new Date(now()).toISOString(); const sprint = { id: crypto.randomUUID(), ...draft, createdBy: actor.owner, createdByRole: actor.role, createdAt, updatedAt: createdAt, endedAt: null, cancelledAt: null, rewardedAt: null, winners: [] };
    state.sprints ||= {}; state.sprints[sprint.id] = sprint; recordEvent(state, 'SPRINT_CREATED', actor.owner, { sprintId: sprint.id, actorRole: actor.role, startsAt: sprint.startsAt, endsAt: sprint.endsAt }, createdAt); saveState(state);
    return { sprint: publicSprint(state, sprint, now()), staff: staffContext(actor.owner) };
  }
  function launchSeasonZero(actorAddress) {
    const state = readState(); const actor = requireStaff(state, actorAddress, true); const campaignKey = 'AXO_SEASON_ZERO_MAP_ROBINHOOD';
    const existing = Object.values(state.sprints || {}).find((sprint) => sprint.campaignKey === campaignKey); if (existing) throw new Error('season_zero_already_created');
    const startsAt = new Date(now() + 5 * 60_000).toISOString(); const endsAt = new Date(now() + 5 * 60_000 + 7 * LEADERBOARD_DAY_MS).toISOString();
    const readiness = communityReadiness(state); const competitive = readiness.competitiveReady;
    const draft = sprintDraft({ title: competitive ? 'Season Zero · Map Robinhood Chain' : 'Founding Scouts · Bootstrap Expedition', description: competitive ? 'Feed structured Robinhood Chain intelligence and independently corroborate the community map.' : 'A noncompetitive founding expedition for solo calibration, companion care, and the first useful research receipts while the Crew forms.', startsAt, endsAt, reward: competitive ? { label: 'Season Zero Cartographer', description: 'A permanent launch-season field badge for the ten strongest intelligence scores.', winnerCount: 10, bonusXp: 50 } : { label: 'Founding Scout', description: 'A participation badge for early companions who contribute during bootstrap.', winnerCount: 20, bonusXp: 10 } });
    assertSprintDoesNotOverlap(state, draft); const createdAt = new Date(now()).toISOString(); const sprint = { id: crypto.randomUUID(), campaignKey, competitive, readinessAtLaunch: readiness, ...draft, createdBy: actor.owner, createdByRole: actor.role, createdAt, updatedAt: createdAt, endedAt: null, cancelledAt: null, rewardedAt: null, winners: [] };
    state.sprints ||= {}; state.sprints[sprint.id] = sprint; recordEvent(state, 'SEASON_ZERO_CREATED', actor.owner, { sprintId: sprint.id, campaignKey, startsAt, endsAt }, createdAt); saveState(state);
    return { sprint: publicSprint(state, sprint, now()), missionControl: missionControl(actor.owner) };
  }
  function updateSprint(actorAddress, sprintId, input = {}) {
    const state = readState(); const actor = requireStaff(state, actorAddress); const sprint = state.sprints?.[safeText(sprintId, 80)]; if (!sprint) throw new Error('sprint_not_found');
    if (sprintStatus(sprint, now()) !== 'SCHEDULED') throw new Error('sprint_update_locked');
    const draft = sprintDraft(input, sprint); assertSprintDoesNotOverlap(state, draft, sprint.id); Object.assign(sprint, draft, { updatedAt: new Date(now()).toISOString(), updatedBy: actor.owner, updatedByRole: actor.role });
    recordEvent(state, 'SPRINT_UPDATED', actor.owner, { sprintId: sprint.id, actorRole: actor.role }, sprint.updatedAt); saveState(state); return { sprint: publicSprint(state, sprint, now()), staff: staffContext(actor.owner) };
  }
  function transitionSprint(actorAddress, sprintId, action) {
    const state = readState(); const actor = requireStaff(state, actorAddress); const sprint = state.sprints?.[safeText(sprintId, 80)]; if (!sprint) throw new Error('sprint_not_found');
    const status = sprintStatus(sprint, now()); const changedAt = new Date(now()).toISOString();
    if (action === 'start') {
      if (status !== 'SCHEDULED') throw new Error('sprint_start_invalid');
      const durationMs = Number(sprint.durationMs || Date.parse(sprint.endsAt) - Date.parse(sprint.startsAt)); const draft = { ...sprint, startsAt: changedAt, endsAt: new Date(now() + durationMs).toISOString() }; assertSprintDoesNotOverlap(state, draft, sprint.id); sprint.startsAt = draft.startsAt; sprint.endsAt = draft.endsAt;
    } else if (action === 'end') {
      if (status !== 'ACTIVE') throw new Error('sprint_end_invalid'); sprint.endedAt = changedAt;
    } else if (action === 'cancel') {
      if (!['SCHEDULED', 'ACTIVE'].includes(status)) throw new Error('sprint_cancel_invalid'); sprint.cancelledAt = changedAt;
    } else throw new Error('sprint_action_invalid');
    sprint.updatedAt = changedAt; sprint.updatedBy = actor.owner; sprint.updatedByRole = actor.role; recordEvent(state, `SPRINT_${action.toUpperCase()}`, actor.owner, { sprintId: sprint.id, actorRole: actor.role }, changedAt); saveState(state);
    return { sprint: publicSprint(state, sprint, now()), staff: staffContext(actor.owner) };
  }
  function finalizeSprint(actorAddress, sprintId) {
    const state = readState(); const actor = requireStaff(state, actorAddress, true); const sprint = state.sprints?.[safeText(sprintId, 80)]; if (!sprint) throw new Error('sprint_not_found');
    if (sprintStatus(sprint, now()) !== 'ENDED') throw new Error('sprint_finalize_invalid');
    const standings = sprintStandings(state, sprint, now()); if (!standings.length) throw new Error('sprint_no_activity');
    const awardedAt = new Date(now()).toISOString(); const winners = standings.slice(0, sprint.reward.winnerCount).map((entry) => {
      const player = Object.values(state.players).find((candidate) => candidate.pet.genesisId === entry.genesisId); if (!player) return null;
      const itemId = `sprint_${sprint.id.replace(/-/g, '').slice(0, 12)}`; if (!player.pet.inventory.some((item) => item.id === itemId)) player.pet.inventory.push({ id: itemId, name: sprint.reward.label, rarity: 'SPRINT REWARD', slot: 'charm', bonus: {}, sprintId: sprint.id, awardedAt });
      player.pet.xp += sprint.reward.bonusXp; player.updatedAt = awardedAt; player.pet.lastReply = currentLevel(player.pet.xp) >= 10 ? matureReply('skill', sprint.reward.label) : companionReply('skill');
      recordEvent(state, 'SPRINT_REWARD_GRANTED', player.id, { sprintId: sprint.id, rank: entry.rank, xp: sprint.reward.bonusXp, itemId, rewardLabel: sprint.reward.label }, awardedAt);
      return { wallet: player.ownerAddress, genesisId: entry.genesisId, name: entry.name, rank: entry.rank, xpGain: entry.xpGain, bonusXp: sprint.reward.bonusXp, itemId, awardedAt };
    }).filter(Boolean);
    sprint.winners = winners; sprint.rewardedAt = awardedAt; sprint.updatedAt = awardedAt; sprint.updatedBy = actor.owner; sprint.updatedByRole = actor.role; recordEvent(state, 'SPRINT_REWARDS_FINALIZED', actor.owner, { sprintId: sprint.id, actorRole: actor.role, winnerCount: winners.length, bonusXpEach: sprint.reward.bonusXp }, awardedAt); saveState(state);
    return { sprint: publicSprint(state, sprint, now()), staff: staffContext(actor.owner) };
  }
  function sprintList() {
    const state = readState(); const currentMs = now(); const sprints = Object.values(state.sprints || {}).sort((a, b) => {
      const priority = { ACTIVE: 0, SCHEDULED: 1, ENDED: 2, REWARDED: 3, CANCELLED: 4 }; return priority[sprintStatus(a, currentMs)] - priority[sprintStatus(b, currentMs)] || Date.parse(b.startsAt) - Date.parse(a.startsAt);
    }).slice(0, 30).map((sprint) => publicSprint(state, sprint, currentMs));
    return { generatedAt: new Date(currentMs).toISOString(), active: sprints.find((sprint) => sprint.status === 'ACTIVE') || null, scheduled: sprints.filter((sprint) => sprint.status === 'SCHEDULED'), sprints };
  }
  function leaderboard({ mode = 'overall', sprintId = null } = {}) {
    const state = readState(); const currentMs = now(); const activeSprint = sprintId ? state.sprints?.[safeText(sprintId, 80)] : Object.values(state.sprints || {}).find((sprint) => sprintStatus(sprint, currentMs) === 'ACTIVE');
    const sprintScores = new Map(activeSprint ? sprintStandings(state, activeSprint, currentMs).map((entry) => [entry.genesisId, entry.score]) : []);
    const epoch = buildAlphaDashboard({ state, nowMs: currentMs, epochLimit: 2, projects: crewProjectViews(state, null, currentMs), playerView: alphaPlayerView }).currentEpoch;
    const epochScores = new Map(epoch.standings.map((entry) => [entry.genesisId, entry]));
    const leaders = Object.values(state.players).filter((player) => player.walletVerified && normalizeAddress(player.ownerAddress)).map((player) => {
      const visual = evolutionVisual(player); const xp = Number(player.pet.xp || 0);
      const intelScore = Number(player.reputation.validContributions || 0) * 10 + Number(player.reputation.corroborated || 0) * 15 + Number(player.reputation.resolved || 0) * 10 + Math.round(Number(player.reputation.accuracy || 0) * 25);
      const epochEntry = epochScores.get(player.pet.genesisId);
      return { genesisId: player.pet.genesisId, name: player.pet.name, lineage: lineageDefinition(player.pet.lineageId).label, level: currentLevel(xp), stage: currentStage(xp).name, xp, xpGain24h: xpGainedBetween(state, player, currentMs - LEADERBOARD_DAY_MS, currentMs), xpGain7d: xpGainedBetween(state, player, currentMs - 7 * LEADERBOARD_DAY_MS, currentMs), sprintXpGain: sprintScores.get(player.pet.genesisId) || 0, intelScore, epochVerifiedXp: Number(epochEntry?.verifiedXp || 0), estimatedRewardSharePct: Number(epochEntry?.estimatedRewardSharePct || 0), currentEpochId: epoch.id, rewardClaimable: false, activeSprintId: activeSprint?.id || null, visual: visual.asset, specialty: leadingAbility(player.pet.abilities).label, specialtyArchetype: specialtyArchetype(player), trust: player.reputation.trust, accuracy: player.reputation.accuracy, resolved: player.reputation.resolved, contributions: player.reputation.validContributions, lastAction: latestPetAction(state, player) };
    });
    const cleanMode = ['overall', '24h', '7d', 'sprint', 'intel', 'epoch'].includes(mode) ? mode : 'overall'; const score = (entry) => cleanMode === '24h' ? entry.xpGain24h : cleanMode === '7d' ? entry.xpGain7d : cleanMode === 'sprint' ? entry.sprintXpGain : cleanMode === 'intel' ? entry.intelScore : cleanMode === 'epoch' ? entry.epochVerifiedXp : entry.xp;
    const eligibleLeaders = cleanMode === 'epoch' ? leaders.filter((entry) => entry.epochVerifiedXp > 0) : leaders;
    return eligibleLeaders.sort((a, b) => score(b) - score(a) || b.xp - a.xp || a.genesisId.localeCompare(b.genesisId)).slice(0, 100).map((entry, index) => ({ ...entry, rank: index + 1 }));
  }
  function communityHolderCandidates({ limit = 25 } = {}) {
    const state = readState();
    const boundedLimit = Math.max(1, Math.min(100, Number(limit) || 25));
    const leaders = leaderboard({ mode: 'overall' }).slice(0, boundedLimit);
    const playersByGenesis = new Map(Object.values(state.players || {}).map((player) => [player.pet?.genesisId, player]));
    return leaders.map((entry) => {
      const player = playersByGenesis.get(entry.genesisId);
      if (!player || !normalizeAddress(player.ownerAddress)) return null;
      return {
        wallet: player.ownerAddress,
        genesisId: entry.genesisId,
        name: entry.name,
        lineage: entry.lineage,
        level: entry.level,
        visual: entry.visual,
        petXp: entry.xp,
        epochXp: entry.epochVerifiedXp,
        activeDays: Number(player.care?.activeDays?.length || 0),
        contributions: entry.contributions,
        lastActionAt: entry.lastAction?.at || null,
      };
    }).filter(Boolean);
  }
  function intelligenceReport() {
    const state = readState();
    const currentMs = now();
    const records = buildIntelligence(state.contributions);
    const projects = crewProjectViews(state, null, currentMs);
    const evidenceReceipts = state.contributions.filter((item) => item.receiptClass === 'EVIDENCE_RECEIPT');
    const structuredAlphaPlans = state.contributions.filter((item) => item.alphaCall);
    const validatedAlphaPlans = structuredAlphaPlans.filter((item) => item.alphaCall?.status === 'VALIDATED');
    const scoredAlphaPlans = structuredAlphaPlans.filter((item) => item.alphaCall?.performance?.status === 'SCORED');
    const corroborated = records.filter((item) => item.status === 'CORROBORATED');
    const reviewableContracts = scoredAlphaPlans.filter((call) => corroborated.some((record) => record.entityKey === call.entityKey));
    const blockers = [
      evidenceReceipts.length > 0 ? null : 'NO_EVIDENCE_GRADE_RECEIPTS',
      new Set(evidenceReceipts.filter((item) => item.consensusEligible).map((item) => item.playerId)).size >= CONSENSUS_DIVERSITY_MINIMUM ? null : 'INSUFFICIENT_INDEPENDENT_QUALIFIED_CONTRIBUTORS',
      corroborated.length > 0 ? null : 'NO_CORROBORATED_PROJECTS',
      validatedAlphaPlans.length > 0 ? null : 'NO_VALIDATED_STRUCTURED_ALPHA_PLANS',
      scoredAlphaPlans.length > 0 ? null : 'NO_COST_AWARE_SCORED_ALPHA_PLANS',
      reviewableContracts.length > 0 ? null : 'NO_COMMUNITY_PLAN_READY_FOR_HUMAN_PAPER_REVIEW',
    ].filter(Boolean);
    return {
      generatedAt: new Date(currentMs).toISOString(),
      policy: {
        communityInput: 'PRIORITY_SIGNAL_ONLY',
        productionRankingMutation: false,
        projectAdmissionGate: 'DEPLOYED_CONTRACT_ONLY',
        projectAnalytics: 'ADVISORY_NOT_ADMISSION',
        heatIsSafetySignal: false,
        minimumConsensus: CONSENSUS_MINIMUM,
        minimumDiverseWallets: CONSENSUS_DIVERSITY_MINIMUM,
        walletIndependenceRequired: true,
        verifiedHumanIdentityForRewards: protocolConfig.humanIdentityRequired === true,
        verifiedHumanIdentityPolicy: protocolConfig.humanIdentityRequired === true ? 'X_PLUS_TELEGRAM_PLUS_CURRENT_AXO_TELEGRAM_MEMBERSHIP' : 'NOT_REQUIRED',
        insufficientEvidenceCanCorroborate: false,
        projectScamQuorum: PROJECT_SCAM_QUORUM,
        communityScamAffectsProductionSafetyRegistry: false,
      },
      readiness: {
        status: blockers.length === 0 ? 'HUMAN_PAPER_REVIEW_READY' : 'NOT_READY',
        executionMode: 'PAPER_REVIEW_ONLY',
        liveTradingAllowed: false,
        automaticProductionRankingMutation: false,
        blockers,
        evidenceReceipts: evidenceReceipts.length,
        validatedAlphaPlans: validatedAlphaPlans.length,
        scoredAlphaPlans: scoredAlphaPlans.length,
        reviewableContracts: reviewableContracts.length,
      },
      summary: {
        walletBoundPlayers: Object.keys(state.players).length,
        legacyPlayersExcluded: Object.keys(state.legacyPlayers || {}).length,
        contributions: state.contributions.filter((item) => item.walletVerified && !item.legacy).length,
        evidenceReceipts: evidenceReceipts.length,
        nominations: state.contributions.filter((item) => item.receiptClass !== 'EVIDENCE_RECEIPT').length,
        projectQuests: projects.length,
        communityScams: Object.keys(state.communityScamRegistry || {}).length,
        hotProjectQuests: projects.filter((item) => item.heat.score >= 50).length,
        pending: records.filter((item) => item.status === 'PENDING_CORROBORATION').length,
        evidenceGaps: records.filter((item) => item.status === 'EVIDENCE_GAP').length,
        diversityPending: records.filter((item) => item.status === 'DIVERSITY_PENDING').length,
        corroborated: corroborated.length,
        contested: records.filter((item) => item.status === 'CONTESTED').length,
        resolved: Object.keys(state.outcomes || {}).length,
      },
      projectQuests: projects.slice(0, 50),
      communityScams: Object.values(state.communityScamRegistry || {}).sort((a, b) => String(b.flaggedAt || '').localeCompare(String(a.flaggedAt || ''))).slice(0, 50),
      reviewQueue: records.filter((item) => item.contributors >= CONSENSUS_MINIMUM).slice(0, 50),
      outcomes: Object.values(state.outcomes || {}).slice(-50),
      records,
    };
  }
  function resolveOutcome(input) {
    const state = readState(); const nowIso = new Date(now()).toISOString(); const protocolActions = []; const outcome = resolveOutcomeInState(state, input, nowIso, (reward) => queueAlphaReward(state, protocolActions, reward)); refreshIntelligence(state); recordEvent(state, 'EXPEDITION_OUTCOME_RESOLVED', null, { outcomeKey: outcome.key, verdict: outcome.verdict }, nowIso); saveState(state, { protocolActions }); return { outcome, report: intelligenceReport() };
  }
  function briefing(address) {
    const { player, state } = requirePlayer(address); const view = publicPlayer(player, state.contributions, now(), {}, { socialRewardMissionsActive });
    if (!view.pet.toolPass.active) throw new Error('happy_axo_pass_required');
    const radar = readJson(radarFile, {}); const candidate = extractCandidate(radar); const crew = buildCrewExpedition(radar, state.contributions, now()); const specialty = leadingAbility(player.pet.abilities);
    return { generatedAt: new Date(now()).toISOString(), pet: { name: player.pet.name, level: currentLevel(player.pet.xp), specialty: specialty.label }, headline: candidate ? `${candidate.symbol} is today’s live expedition focus.` : 'The radar is quiet. Care and training remain available.', candidate, crewExpedition: crew, suggestedTask: personalizedTasks(player, radar, now()).find((task) => task.ability === specialty.key) || personalizedTasks(player, radar, now())[0], policy: { humanFacing: true, affectsProductionRanking: false, externalAgentAccess: 'X402_ONLY' } };
  }
  function telemetryReport() {
    const state = readState(); const events = state.events || []; const currentMs = now(); const counts = Object.fromEntries([...new Set(events.map((event) => event.type))].map((type) => [type, events.filter((event) => event.type === type).length])); const players = Object.values(state.players);
    const verifiedReceipts = state.contributions.filter((item) => item.evidence?.verification);
    const countSource = (selector) => Object.fromEntries([...new Set(verifiedReceipts.map(selector).filter(Boolean))].map((source) => [source, verifiedReceipts.filter((item) => selector(item) === source).length]));
    const projectViews = crewProjectViews(state, null, currentMs);
    const durableLoopComplete = players.filter((player) => onboardingView(player, {}, currentMs, { passportRequired: false }).complete).length;
    const currentPassportReady = players.filter((player) => participationGateView(player, currentMs).complete).length;
    const currentComplete = players.filter((player) => onboardingView(player, {}, currentMs, { passportRequired: true }).complete).length;
    const currentWeek = epochWindow(currentMs);
    const weeklyActiveByLoop = Object.fromEntries(Object.keys(WEEKLY_VERIFIED_ACTIVE_EVENT_TYPES).map((kind) => [kind, new Set()]));
    const weeklyVerifiedActivePets = new Set();
    for (const player of players) {
      const loopKinds = new Set(playerPetEvents(state, player).flatMap((event) => {
        const atMs = Date.parse(event.at || 0);
        if (!Number.isFinite(atMs) || atMs < currentWeek.startMs || atMs >= currentWeek.endMs) return [];
        const kind = weeklyVerifiedActionKind(event);
        return kind ? [kind] : [];
      }));
      if (!loopKinds.size) continue;
      weeklyVerifiedActivePets.add(player.pet.genesisId);
      for (const kind of loopKinds) weeklyActiveByLoop[kind].add(player.pet.genesisId);
    }
    const weeklyActive = {
      verifiedActivePets: weeklyVerifiedActivePets.size,
      verifiedActivePct: players.length ? Number((weeklyVerifiedActivePets.size / players.length * 100).toFixed(2)) : 0,
      byLoop: Object.fromEntries(Object.entries(weeklyActiveByLoop).map(([kind, petIds]) => [kind, petIds.size])),
      epochId: currentWeek.id,
      startsAt: currentWeek.startsAt,
      endsAt: currentWeek.freezesAt,
      measurementTimezone: 'UTC',
      denominator: 'DISTINCT_PRESERVED_HATCHED_PETS',
      completionTruth: 'AT_LEAST_ONE_CURRENT_UTC_ISO_WEEK_VERIFIED_CARE_SCOUT_SIGNAL_OR_CREW_RECEIPT',
    };
    const careDay = isoDay(currentMs);
    const careProgressToday = players.map((player) => ['play', 'rest', 'train']
      .filter((action) => player.care?.dailyActions?.[action] === careDay).length);
    const careProgressCountsToday = Object.fromEntries([0, 1, 2, 3].map((completed) => [
      String(completed),
      careProgressToday.filter((count) => count === completed).length,
    ]));
    const care = {
      playCompletedToday: players.filter((player) => player.care?.dailyActions?.play === careDay).length,
      restCompletedToday: players.filter((player) => player.care?.dailyActions?.rest === careDay).length,
      trainCompletedToday: players.filter((player) => player.care?.dailyActions?.train === careDay).length,
      ritualsStartedToday: careProgressToday.filter((count) => count > 0).length,
      ritualsPartialToday: careProgressToday.filter((count) => count > 0 && count < 3).length,
      ritualsCompletedToday: careProgressCountsToday['3'],
      ritualProgressCountsToday: careProgressCountsToday,
      measurementDay: careDay,
      measurementTimezone: 'UTC',
      denominator: 'PRESERVED_HATCHED_PETS',
      completionTruth: 'THREE_CURRENT_UTC_DAY_SAVED_CARE_RECEIPTS_PER_PLAYER',
    };
    const socialProgress24h = players.map((player) => [
      player.social?.daily?.x,
      player.social?.daily?.telegram,
      player.social?.daily?.engagement,
    ].filter((record) => socialQuestCooldown(record, currentMs).coolingDown).length);
    const socialProgressCounts24h = Object.fromEntries([0, 1, 2, 3].map((completed) => [
      String(completed),
      socialProgress24h.filter((count) => count === completed).length,
    ]));
    const social = {
      xLinked: players.filter((player) => player.social?.identities?.x?.verification === 'PLATFORM_VERIFIED').length,
      telegramLinked: players.filter((player) => player.social?.identities?.telegram?.verification === 'PLATFORM_VERIFIED').length,
      dualLinked: players.filter((player) => player.social?.identities?.x?.verification === 'PLATFORM_VERIFIED' && player.social?.identities?.telegram?.verification === 'PLATFORM_VERIFIED').length,
      axoTelegramMembers: players.filter((player) => telegramMembershipView(player, currentMs).verified).length,
      xQuestsActive24h: players.filter((player) => socialQuestCooldown(player.social?.daily?.x, currentMs).coolingDown).length,
      telegramQuestsActive24h: players.filter((player) => socialQuestCooldown(player.social?.daily?.telegram, currentMs).coolingDown).length,
      axoEngagementQuestsActive24h: players.filter((player) => socialQuestCooldown(player.social?.daily?.engagement, currentMs).coolingDown).length,
      partialLoopsActive24h: socialProgress24h.filter((count) => count > 0 && count < 3).length,
      loopsComplete24h: socialProgressCounts24h['3'],
      loopProgressCounts24h: socialProgressCounts24h,
      measurementWindow: 'ROLLING_24_HOUR_COOLDOWN',
      completionTruth: 'THREE_CURRENT_VERIFIED_SOCIAL_COOLDOWNS_PER_PLAYER',
    };
    return { generatedAt: new Date(currentMs).toISOString(), players: players.length, weeklyActive, community: communityReadiness(state), onboarding: { cared: players.filter((player) => player.onboarding?.cared).length, skillChosen: players.filter((player) => player.onboarding?.skillChosen).length, firstTrail: players.filter((player) => player.onboarding?.firstTrail?.completed).length, firstExpedition: players.filter((player) => player.onboarding?.firstExpedition).length, hatchShared: players.filter((player) => player.social?.hatchAnnouncement?.status === 'CLAIMED').length, durableLoopComplete, currentPassportReady, currentComplete, complete: currentComplete, completionTruth: 'DURABLE_LOOP_AND_CURRENT_PASSPORT_REPORTED_SEPARATELY' }, care, social, calibration: { runs: Number(state.calibrationRuns?.length || 0), players: players.filter((player) => Number(player.calibration?.completed || 0) > 0).length, correct: (state.calibrationRuns || []).filter((run) => run.correct).length }, projectQuests: { published: Object.keys(state.projectQuests || {}).length, active: projectViews.filter((quest) => quest.accepting).length, corroborated: projectViews.filter((quest) => quest.status === 'CORROBORATED').length }, verification: { receiptsWithProvenance: verifiedReceipts.length, contractSources: countSource((item) => item.evidence.verification.contractSource), identitySources: countSource((item) => item.evidence.verification.identitySource), geckoTerminalReceipts: verifiedReceipts.filter((item) => item.evidence.verification.marketSources?.geckoterminal === 'LIVE').length, dexscreenerReceipts: verifiedReceipts.filter((item) => item.evidence.verification.marketSources?.dexscreener === 'LIVE').length, fallbackReceipts: verifiedReceipts.filter((item) => item.evidence.verification.providerFallback?.used === true).length }, trainingLabels: (state.trainingLabels || []).length, events: counts, retained: { activeDays2Plus: players.filter((player) => Number(player.care?.activeDays?.length || 0) >= 2).length, activeDays7Plus: players.filter((player) => Number(player.care?.activeDays?.length || 0) >= 7).length } };
  }
  function migrateStoredState() {
    const state = readState(); saveState(state);
    return { schemaVersion: state.schemaVersion, players: Object.keys(state.players).length, legacyPlayers: Object.keys(state.legacyPlayers || {}).length, contributions: state.contributions.length, projectQuests: Object.keys(state.projectQuests || {}).length, sprints: Object.keys(state.sprints || {}).length, alphaSpotlights: Object.keys(state.alphaSpotlights || {}).length, alphaXpAdjustments: Object.keys(state.alphaXpAdjustments || {}).length, admins: state.staff?.admins?.length || 0, moderators: state.staff?.moderators?.length || 0, outcomes: Object.keys(state.outcomes || {}).length };
  }
  function exportAccount(address) {
    const { owner, state, player } = requirePlayer(address);
    return {
      exportedAt: new Date(now()).toISOString(),
      schemaVersion: state.schemaVersion,
      wallet: owner,
      walletPreferences: state.walletPreferences?.[owner] || { favorites: [], recentProjects: [] },
      player,
      contributions: state.contributions.filter((item) => item.playerId === owner),
      crossChainNominations: (state.crossChainNominations || []).filter((item) => item.ownerAddress === owner),
      crewMissions: {
        webReferralStart: state.crewMissions?.webReferralStarts?.[owner] || null,
        communityReferralMilestones: Object.values(state.crewMissions?.communityReferralMilestones || {})
          .filter((milestone) => milestone.referrerPlayerId === owner || milestone.claimantWalletHash === referralWalletKey(owner)),
        referralClaim: state.crewMissions?.referralClaims?.[owner] || null,
        referralClaims: Object.values(state.crewMissions?.referralClaims || {}).filter((claim) => claim.referrerPlayerId === owner),
        referralPurchases: Object.values(state.crewMissions?.referralPurchases || {}).filter((purchase) => purchase.claimantPlayerId === owner || purchase.referrerPlayerId === owner),
        referralRewardSetups: Object.values(state.crewMissions?.referralRewardSetups || {}).filter((setup) => setup.referredWallet === owner || setup.referrerWallet === owner),
        referralPathReceipts: Object.values(state.crewMissions?.referralPathReceipts || {}).filter((receipt) => receipt.referredWallet === owner || receipt.referrerWallet === owner),
        createdRaids: Object.values(state.crewMissions?.raids || {}).filter((raid) => raid.createdByPlayerId === owner),
        raidClaims: Object.values(state.crewMissions?.raidClaims || {}).filter((claim) => claim.playerId === owner),
        xpLedger: (state.crewMissions?.xpLedger || []).filter((entry) => entry.playerId === owner),
      },
      trainingLabels: (state.trainingLabels || []).filter((item) => item.playerId === owner),
      alphaSpotlights: Object.values(state.alphaSpotlights || {}).filter((item) => item.playerId === owner),
      alphaXpAdjustments: Object.values(state.alphaXpAdjustments || {}).filter((item) => item.playerId === owner),
      petShareCards: Object.values(state.petShareCards || {}).filter((item) => item.ownerAddress === owner),
      events: (state.events || []).filter((event) => event.playerId === owner),
      policy: { machineReadable: true, includesPublicEvidenceUrls: true, includesOtherPlayers: false, includesCounterpartyReferralWallets: true, immutableReferralRewardReceiptsRetainedAfterDeletion: true },
    };
  }
  function recordPetNftMint(address, receipt = {}) {
    const owner = requireAddress(address); const state = readState(); const player = state.players[owner];
    if (!player) throw new Error('pet_not_hatched');
    const expectedGenesisHash = petNftGenesisHash(player.pet.genesisId).toLowerCase();
    const expectedTokenId = petNftTokenId(player.pet.genesisId);
    if (String(receipt.genesisHash || '').toLowerCase() !== expectedGenesisHash || String(receipt.tokenId || '') !== expectedTokenId) {
      throw new Error('pet_nft_receipt_identity_mismatch');
    }
    const metadataRevision = Number(receipt.metadataRevision);
    const gearRevision = Number(receipt.gearRevision);
    const level = Number(receipt.level);
    const activeEnvironment = Number(receipt.activeEnvironment);
    const specialization = Number(receipt.specialization);
    const blockNumber = Number(receipt.blockNumber);
    const visualRevision = String(receipt.visualRevision || '');
    const layerAssetIds = Array.isArray(receipt.layerAssetIds) ? receipt.layerAssetIds.map(String) : [];
    if (!/^0x[0-9a-f]{40}$/i.test(String(receipt.contractAddress || ''))
      || !/^0x[0-9a-f]{64}$/i.test(String(receipt.transactionHash || ''))
      || !/^0x[0-9a-f]{64}$/i.test(String(receipt.dnaHash || ''))
      || !/^0x[0-9a-f]{64}$/i.test(String(receipt.stateHash || ''))
      || !/^ipfs:\/\/[a-zA-Z0-9/._-]+$/.test(String(receipt.metadataUri || ''))
      || !/^ipfs:\/\/[a-zA-Z0-9/._-]+$/.test(String(receipt.imageUri || ''))
      || metadataRevision !== 1 || gearRevision !== 0
      || !Number.isSafeInteger(level) || level < 1 || level > MAX_LEVEL
      || !Number.isSafeInteger(activeEnvironment) || activeEnvironment < 0 || activeEnvironment > 7
      || !Number.isSafeInteger(specialization) || specialization < 0 || specialization > 5
      || visualRevision !== V4_VISUAL_REVISION
      || layerAssetIds.length !== 8
      || layerAssetIds.some((assetId) => !/^[a-z0-9_]{3,80}$/.test(assetId))
      || !Number.isSafeInteger(blockNumber) || blockNumber < 1) {
      throw new Error('pet_nft_receipt_invalid');
    }
    if (player.pet.nft?.status === 'MINTED_SOULBOUND') {
      if (String(player.pet.nft.transactionHash).toLowerCase() === String(receipt.transactionHash).toLowerCase()) return snapshot(owner);
      throw new Error('pet_nft_already_minted');
    }
    const recordedAt = new Date(now()).toISOString();
    player.pet.nft = {
      ...player.pet.nft,
      status: 'MINTED_SOULBOUND',
      standard: 'ERC721_ERC5192_ERC4906',
      chainId: 4663,
      contractAddress: String(receipt.contractAddress).toLowerCase(),
      gearContractAddress: /^0x[0-9a-f]{40}$/i.test(String(receipt.gearContractAddress || '')) ? String(receipt.gearContractAddress).toLowerCase() : null,
      tokenId: expectedTokenId,
      ownerAddress: owner,
      genesisHash: expectedGenesisHash,
      dnaHash: String(receipt.dnaHash).toLowerCase(),
      stateHash: String(receipt.stateHash).toLowerCase(),
      metadataRevision,
      gearRevision,
      level,
      activeEnvironment,
      specialization,
      visualRevision,
      layerAssetIds,
      metadataUri: String(receipt.metadataUri || ''),
      imageUri: String(receipt.imageUri || ''),
      transactionHash: String(receipt.transactionHash).toLowerCase(),
      blockNumber,
      mintedAt: receipt.confirmedAt || recordedAt,
      lastSyncedAt: receipt.confirmedAt || recordedAt,
      explorerUrl: String(receipt.explorerUrl || ''),
      transferableTraits: ['gear'],
      nonTransferableTraits: ['petIdentity', 'appearanceSeed', 'lineageId', 'evolution', 'contributorTrust', 'submissionHistory', 'toolAccess', 'xp', 'rewards'],
    };
    player.updatedAt = recordedAt;
    recordEvent(state, 'PET_NFT_MINT_CONFIRMED', owner, {
      genesisId: player.pet.genesisId,
      tokenId: expectedTokenId,
      transactionHash: player.pet.nft.transactionHash,
      blockNumber: player.pet.nft.blockNumber,
      affectsContributorTrust: false,
      affectsProductionRanking: false,
    }, recordedAt);
    saveState(state);
    return snapshot(owner);
  }
  function recordPetNftUpdate(address, receipt = {}) {
    const owner = requireAddress(address); const state = readState(); const player = state.players[owner];
    if (!player || player.pet.nft?.status !== 'MINTED_SOULBOUND') throw new Error('pet_nft_not_minted');
    if (String(receipt.tokenId || '') !== String(player.pet.nft.tokenId) || String(receipt.contractAddress || '').toLowerCase() !== String(player.pet.nft.contractAddress).toLowerCase()) {
      throw new Error('pet_nft_receipt_identity_mismatch');
    }
    const revision = Number(receipt.metadataRevision);
    if (!Number.isSafeInteger(revision) || revision <= Number(player.pet.nft.metadataRevision || 0)) throw new Error('pet_nft_revision_invalid');
    const gearRevision = Number(receipt.gearRevision);
    const level = Number(receipt.level);
    const activeEnvironment = Number(receipt.activeEnvironment);
    const specialization = Number(receipt.specialization);
    const blockNumber = Number(receipt.blockNumber);
    const visualRevision = String(receipt.visualRevision || '');
    const layerAssetIds = Array.isArray(receipt.layerAssetIds) ? receipt.layerAssetIds.map(String) : [];
    if (!/^0x[0-9a-f]{64}$/i.test(String(receipt.transactionHash || ''))
      || !/^0x[0-9a-f]{64}$/i.test(String(receipt.stateHash || ''))
      || !/^ipfs:\/\/[a-zA-Z0-9/._-]+$/.test(String(receipt.metadataUri || ''))
      || !/^ipfs:\/\/[a-zA-Z0-9/._-]+$/.test(String(receipt.imageUri || ''))
      || !Number.isSafeInteger(gearRevision) || gearRevision < Number(player.pet.nft.gearRevision || 0)
      || !Number.isSafeInteger(level) || level < Number(player.pet.nft.level || 1) || level > currentLevel(player.pet.xp)
      || level > Number(player.pet.nft.level || 1) + 1
      || !Number.isSafeInteger(activeEnvironment) || activeEnvironment < 0 || activeEnvironment > 7
      || !Number.isSafeInteger(specialization) || specialization < 0 || specialization > 5
      || visualRevision !== V4_VISUAL_REVISION
      || layerAssetIds.length !== 8
      || layerAssetIds.some((assetId) => !/^[a-z0-9_]{3,80}$/.test(assetId))
      || !Number.isSafeInteger(blockNumber) || blockNumber < 1) throw new Error('pet_nft_receipt_invalid');
    const recordedAt = new Date(now()).toISOString();
    Object.assign(player.pet.nft, {
      stateHash: String(receipt.stateHash || '').toLowerCase(),
      metadataRevision: revision,
      gearRevision,
      level,
      activeEnvironment,
      specialization,
      visualRevision,
      layerAssetIds,
      metadataUri: String(receipt.metadataUri || ''),
      imageUri: String(receipt.imageUri || ''),
      lastUpdateTransactionHash: String(receipt.transactionHash).toLowerCase(),
      lastUpdateBlockNumber: blockNumber,
      lastSyncedAt: receipt.confirmedAt || recordedAt,
      explorerUrl: String(receipt.explorerUrl || ''),
    });
    player.updatedAt = recordedAt;
    recordEvent(state, 'PET_NFT_UPDATE_CONFIRMED', owner, {
      genesisId: player.pet.genesisId,
      tokenId: player.pet.nft.tokenId,
      metadataRevision: revision,
      transactionHash: player.pet.nft.lastUpdateTransactionHash,
      blockNumber: player.pet.nft.lastUpdateBlockNumber,
      affectsContributorTrust: false,
      affectsProductionRanking: false,
    }, recordedAt);
    saveState(state);
    return snapshot(owner);
  }
  function deleteAccount(address, { expectedGenesisId, acknowledgeSoulboundNftPersists = false } = {}) {
    const owner = requireAddress(address); const state = readState(); const player = state.players[owner]; if (!player) throw new Error('pet_not_hatched');
    if (!expectedGenesisId || player.pet.genesisId !== expectedGenesisId) throw new Error('account_deletion_stale');
    if (player.pet.nft?.status === 'MINTED_SOULBOUND' && acknowledgeSoulboundNftPersists !== true) throw new Error('soulbound_nft_persistence_acknowledgement_required');
    const deletedAt = new Date(now()).toISOString(); const contributionIds = new Set(state.contributions.filter((item) => item.playerId === owner).map((item) => item.id));
    state.crewMissions = normalizeCrewMissions(state.crewMissions);
    const antiAbuse = referralAntiAbuseRegistry(state);
    for (const claim of Object.values(state.crewMissions.referralClaims).filter((candidate) => candidate.claimantPlayerId === owner)) {
      const start = [...Object.values(state.crewMissions.webReferralStarts), ...Object.values(state.crewMissions.referralStarts)]
        .find((candidate) => candidate.id === claim.referralId)
        || { id: claim.referralId, sourceChannel: claim.sourceChannel };
      reserveReferralClaimant(state, start, player, claim);
    }
    for (const claim of Object.values(state.crewMissions.referralClaims).filter((candidate) => candidate.referrerPlayerId === owner && candidate.referrerRewardStatus === 'RELEASED')) {
      const activatedAtMs = Date.parse(claim.activatedAt || 0);
      if (!Number.isFinite(activatedAtMs)) continue;
      weeklyReferralScoutRewards(state, player, isoWeek(activatedAtMs)).claimIds[claim.id] = claim.activatedAt;
    }
    const deletedWalletKey = referralWalletKey(owner);
    if (antiAbuse.activatedWallets[deletedWalletKey]) antiAbuse.activatedWallets[deletedWalletKey].deletedAt = deletedAt;
    if (antiAbuse.communityOnboardedWallets[deletedWalletKey]) antiAbuse.communityOnboardedWallets[deletedWalletKey].deletedAt = deletedAt;
    for (const milestone of Object.values(state.crewMissions.communityReferralMilestones)) {
      if (milestone.claimantWalletHash === deletedWalletKey) milestone.claimantDeletedAt = deletedAt;
      if (milestone.referrerPlayerId !== owner) continue;
      milestone.referrerPlayerIdHash = referralWalletKey(owner);
      milestone.referrerPlayerId = null;
      milestone.status = 'REFERRER_DELETED';
      milestone.referrerDeletedAt = deletedAt;
    }
    const excludedOpenRewardEntries = excludeOpenPetRewards(state, {
      petGenesisId: player.pet.genesisId,
      displayEpochId: epochWindow(now()).id,
      reason: 'ACCOUNT_DELETED_DURING_OPEN_EPOCH',
    });
    if (player.pet.nft?.status === 'MINTED_SOULBOUND') {
      state.soulboundPetTombstones ||= {};
      state.soulboundPetTombstones[owner] = {
        status: 'ONCHAIN_SOULBOUND_PET_PERSISTS_AFTER_ACCOUNT_DELETION',
        wallet: owner,
        genesisId: player.pet.genesisId,
        genesisHash: player.pet.nft.genesisHash,
        contractAddress: player.pet.nft.contractAddress,
        tokenId: player.pet.nft.tokenId,
        mintTransactionHash: player.pet.nft.transactionHash,
        deletedAt,
        purpose: 'PREVENT_DUPLICATE_HATCH_AND_PRESERVE_PUBLIC_ONCHAIN_IDENTITY_CONSISTENCY',
      };
    }
    state.contributions = state.contributions.filter((item) => item.playerId !== owner);
    state.crossChainNominations = (state.crossChainNominations || []).filter((item) => item.ownerAddress !== owner);
    state.trainingLabels = (state.trainingLabels || []).filter((item) => item.playerId !== owner);
    state.events = (state.events || []).filter((event) => event.playerId !== owner);
    state.socialPostClaims = Object.fromEntries(Object.entries(state.socialPostClaims || {}).filter(([, claim]) => claim.playerId !== owner));
    state.alphaSpotlights = Object.fromEntries(Object.entries(state.alphaSpotlights || {}).filter(([contributionId, spotlight]) => spotlight.playerId !== owner && !contributionIds.has(contributionId)));
    state.alphaXpAdjustments = Object.fromEntries(Object.entries(state.alphaXpAdjustments || {}).filter(([, adjustment]) => adjustment.playerId !== owner));
    state.petShareCards = Object.fromEntries(Object.entries(state.petShareCards || {}).filter(([, card]) => card.ownerAddress !== owner));
    if (state.walletPreferences) delete state.walletPreferences[owner];
    state.crewMissions.referralStarts = Object.fromEntries(Object.entries(state.crewMissions.referralStarts).filter(([, start]) => start.referrerPlayerId !== owner && start.claimantPlayerId !== owner));
    state.crewMissions.webReferralStarts = Object.fromEntries(Object.entries(state.crewMissions.webReferralStarts).filter(([, start]) => start.referrerPlayerId !== owner && start.claimantPlayerId !== owner && start.claimantWallet !== owner));
    for (const receipt of Object.values(state.crewMissions.referralPathReceipts)) {
      if (receipt.referrerWallet !== owner && receipt.referredWallet !== owner) continue;
      if (receipt.referrerWallet === owner) {
        receipt.referrerWalletHash = referralWalletKey(owner);
        receipt.referrerWallet = null;
      }
      if (receipt.referredWallet === owner) {
        receipt.referredWalletHash = referralWalletKey(owner);
        receipt.referredWallet = null;
      }
      receipt.status = 'ACCOUNT_DELETED_PATH_REDACTED';
      receipt.updatedAt = deletedAt;
      receipt.history ||= [];
      receipt.history.push({ type: 'ACCOUNT_DELETED_PATH_REDACTED', at: deletedAt });
    }
    state.crewMissions.referralClaims = Object.fromEntries(Object.entries(state.crewMissions.referralClaims).filter(([, claim]) => claim.referrerPlayerId !== owner && claim.claimantPlayerId !== owner));
    const preservedPurchaseHashes = new Set(Object.values(state.crewMissions.referralRewardSetups).map((setup) => setup.purchaseTxHash));
    state.crewMissions.referralPurchases = Object.fromEntries(Object.entries(state.crewMissions.referralPurchases).filter(([transactionHash, purchase]) => preservedPurchaseHashes.has(transactionHash) || (purchase.referrerPlayerId !== owner && purchase.claimantPlayerId !== owner)));
    const deletedRaidClaimIds = new Set(Object.values(state.crewMissions.raidClaims).filter((claim) => claim.playerId === owner).map((claim) => claim.id));
    state.crewMissions.raidClaims = Object.fromEntries(Object.entries(state.crewMissions.raidClaims).filter(([, claim]) => claim.playerId !== owner));
    state.crewMissions.proofClaims = Object.fromEntries(Object.entries(state.crewMissions.proofClaims).filter(([, claim]) => !deletedRaidClaimIds.has(claim.claimId)));
    state.crewMissions.submissionClaims = Object.fromEntries(Object.entries(state.crewMissions.submissionClaims).filter(([, claim]) => !deletedRaidClaimIds.has(claim.claimId)));
    for (const raid of Object.values(state.crewMissions.raids)) {
      if (raid.createdByPlayerId !== owner || raid.kind !== 'COMMUNITY' || raid.status === 'CANCELLED') continue;
      raid.status = 'CANCELLED';
      raid.cancelledAt = deletedAt;
      raid.cancelReason = 'CREATOR_ACCOUNT_DELETED';
      raid.creatorRewardStatus = 'CREATOR_UNAVAILABLE';
    }
    state.crewMissions.xpLedger = state.crewMissions.xpLedger.filter((entry) => entry.playerId !== owner);
    state.projectQuests = Object.fromEntries(Object.entries(state.projectQuests || {}).filter(([, quest]) => quest.nominatedBy !== owner && !contributionIds.has(quest.nominationContributionId)));
    for (const sprint of Object.values(state.sprints || {})) sprint.winners = (sprint.winners || []).filter((winner) => winner.wallet !== owner && winner.genesisId !== expectedGenesisId);
    const retainedReferralRewardSetups = Object.values(state.crewMissions.referralRewardSetups).filter((setup) => setup.referrerWallet === owner || setup.referredWallet === owner).length;
    delete state.players[owner]; refreshIntelligence(state); saveState(state, { purgePlayerId: owner });
    return { deleted: true, deletedAt, wallet: owner, genesisId: expectedGenesisId, recoverable: false, soulboundNftPersists: player.pet.nft?.status === 'MINTED_SOULBOUND', retainedReferralRewardSetups, excludedOpenRewardEntries };
  }
  async function runMaintenance({ revalidationLimit = 5, forceAddresses = [] } = {}) {
    const initial = readState(); const currentMs = now();
    const forced = new Set((Array.isArray(forceAddresses) ? forceAddresses : [])
      .slice(0, 20)
      .map(normalizeAddress)
      .filter(Boolean));
    const stale = Object.values(initial.projectQuests || {}).filter((quest) => {
      const checkedMs = Date.parse(quest.safety?.checkedAt || 0); const expiresMs = Date.parse(quest.expiresAt || 0);
      // Refresh advisory analytics on a bounded TTL. Provider or quality
      // failures never remove a contract that already passed deployment proof.
      // Operators may explicitly refresh a bounded address list after shipping
      // a market-evidence correction without weakening the normal TTL.
      return currentMs <= expiresMs && (forced.has(normalizeAddress(quest.address)) || !Number.isFinite(checkedMs) || currentMs - checkedMs >= PROJECT_SAFETY_TTL_MS);
    }).slice(0, Math.max(0, Math.min(20, Number(revalidationLimit || 0))));
    const revalidated = [];
    for (const candidate of stale) {
      const inspection = await inspectEvidence({ ownerAddress: candidate.nominatedBy, holder: false, type: 'contract_scout', entity: candidate.address, evidenceUrl: null, task: { id: `maintenance:${candidate.id}`, safetyRevalidation: true } });
      const state = readState(); const quest = state.projectQuests?.[entityKey(candidate.address)]; if (!quest) continue;
      const safety = inspection?.projectSafety || { status: 'ANALYTICS_UNAVAILABLE', eligible: true, corroborationEligible: true, analyticsAvailable: false, checkedAt: new Date(now()).toISOString() };
      const checkedAt = safety.checkedAt || new Date(now()).toISOString();
      quest.safety = { ...quest.safety, ...safety, checkedAt };
      quest.safetyHistory ||= []; quest.safetyHistory.push(alphaSafetyHistoryEntry({ ...safety, checkedAt }, quest.safety?.routeSnapshot?.poolAddress)); quest.safetyHistory = quest.safetyHistory.slice(-PROJECT_SAFETY_HISTORY_LIMIT);
      quest.pausedAt = null;
      quest.pauseReason = null;
      recordEvent(state, 'PROJECT_ANALYTICS_REFRESHED', candidate.nominatedBy, { projectQuestId: quest.id, status: safety.status, analyticsAvailable: safety.analyticsAvailable === true, qualityGatePassed: safety.qualityGatePassed === true }, checkedAt);
      saveState(state); revalidated.push({ projectQuestId: quest.id, status: safety.status, analyticsAvailable: safety.analyticsAvailable === true, qualityGatePassed: safety.qualityGatePassed === true, forced: forced.has(normalizeAddress(candidate.address)) });
    }
    const state = readState(); const nowIso = new Date(now()).toISOString(); const protocolActions = []; const settlement = settleConsensusRewards(state, consensusSettlementRecords(state, Date.parse(nowIso)), nowIso, (reward) => queueParticipationReward(state, protocolActions, reward));
    const epochResultsCreated = snapshotClosedEpochResultsInState(state, now());
    if (settlement.finalized || settlement.released || epochResultsCreated.length) saveState(state, { protocolActions });
    return { generatedAt: nowIso, repository: repository.health ? repository.health() : { kind: repository.kind }, revalidated, settlement, epochResultsCreated };
  }
  function communityCelebrations({ sinceAt, limit = 100 } = {}) {
    const sinceMs = Date.parse(String(sinceAt || ''));
    if (!Number.isFinite(sinceMs)) throw new Error('hatchery_community_since_invalid');
    const boundedLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    const state = readState();
    const currentMs = now();
    const radar = readJson(radarFile, {});
    const alpha = alphaFile ? readJson(alphaFile, {}) : {};
    const notableTypes = new Set([
      'PET_HATCHED',
      'FIRST_TRAIL_COMPLETED',
      'PROJECT_QUEST_PUBLISHED',
      'PROJECT_QUEST_CORROBORATED',
      'CONTRACT_DISCOVERY_CORROBORATED',
      'SPRINT_REWARD_GRANTED',
    ]);
    const celebrations = [];
    const contributionsById = new Map((state.contributions || []).map((contribution) => [contribution.id, contribution]));
    const projectQuestsById = new Map([
      ...Object.values(state.projectQuests || {}),
      ...Object.values(state.projectQuestHistory || {}),
    ].filter((quest) => quest?.id).map((quest) => [quest.id, quest]));
    for (const player of Object.values(state.players || {})) {
      if (!player?.pet || player.moderation?.status === 'SUSPENDED') continue;
      const events = playerPetEvents(state, player)
        .map((event, sequence) => ({
          event,
          sequence,
          atMs: Date.parse(event.at),
          delta: event.type === 'PET_XP_ADMIN_ADJUSTED'
            ? Number(event.metadata?.delta || 0)
            : xpFromEvent(event),
        }))
        .filter((entry) => Number.isFinite(entry.atMs))
        .sort((a, b) => a.atMs - b.atMs || a.sequence - b.sequence);
      const recordedDelta = events.reduce((sum, entry) => sum + entry.delta, 0);
      let rollingXp = Math.max(0, Number(player.pet.xp || 0) - recordedDelta);
      const identities = publicSocialIdentities(player);
      const publicIdentity = [
        ['telegram', identities.telegram],
        ['x', identities.x],
      ].find(([, identity]) => identity?.verification === 'PLATFORM_VERIFIED' && identity.handle)?.[1] || null;
      const platform = publicIdentity === identities.telegram ? 'telegram' : publicIdentity ? 'x' : null;
      for (const { event, atMs, delta } of events) {
        const beforeXp = rollingXp;
        rollingXp = Math.max(0, rollingXp + delta);
        if (atMs < sinceMs) continue;
        const priorLevel = currentLevel(beforeXp);
        const newLevel = currentLevel(rollingXp);
        const recordedPriorLevel = Number(event.metadata?.priorLevel);
        const recordedNewLevel = Number(event.metadata?.newLevel);
        const recordedLevelUp = Number.isSafeInteger(recordedPriorLevel)
          && Number.isSafeInteger(recordedNewLevel)
          && recordedNewLevel > recordedPriorLevel;
        const levelUp = event.type !== 'PET_XP_ADMIN_ADJUSTED'
          && delta > 0
          && (recordedLevelUp || newLevel > priorLevel);
        if (!levelUp && !notableTypes.has(event.type)) continue;
        if (event.type === 'PROJECT_QUEST_CORROBORATED' && event.metadata?.projectHighScoreActivated !== true) continue;
        const projectEvent = ['PROJECT_QUEST_PUBLISHED', 'PROJECT_QUEST_CORROBORATED'].includes(event.type);
        const type = projectEvent ? event.type : levelUp ? 'PET_LEVEL_UP' : event.type;
        const celebrationLevel = Math.max(1, Math.min(MAX_LEVEL,
          levelUp ? Math.max(newLevel, recordedNewLevel || 1) : currentLevel(rollingXp)));
        const contribution = contributionsById.get(event.metadata?.contributionId);
        const projectQuest = projectQuestsById.get(event.metadata?.projectQuestId);
        const projectAddress = projectEvent
          ? normalizeAddress(projectQuest?.address || contribution?.entityKey || contribution?.entity)
          : null;
        if (projectEvent && !projectAddress) continue;
        const projectView = projectEvent
          ? projectQuestViews(state, null, currentMs, { pinnedAddress: canonicalAxoAddress })
            .find((item) => item.id === event.metadata?.projectQuestId) || null
          : null;
        celebrations.push({
          id: `HATCHERY_${type}:${event.id}`,
          type,
          occurredAt: event.at,
          pet: {
            name: safeText(player.pet.name, 40) || 'AXO Pet',
            level: celebrationLevel,
            stage: LEVELS[celebrationLevel - 1].name,
          },
          identity: publicIdentity ? {
            platform,
            handle: publicIdentity.handle,
            displayName: safeText(publicIdentity.displayName, 80) || null,
            profileUrl: publicIdentity.profileUrl,
            verification: 'PLATFORM_VERIFIED',
          } : null,
          ...(projectAddress ? {
            project: {
              ...communityProjectMarket({
                address: projectAddress,
                projectQuest,
                radar,
                alpha,
                nowMs: currentMs,
              }),
              id: event.metadata?.projectQuestId || projectQuest?.id || null,
              accepting: projectView?.accepting === true,
              community: {
                voteCount: Number(event.type === 'PROJECT_QUEST_CORROBORATED'
                  ? event.metadata?.projectVoteCount ?? projectView?.feedCount ?? 0
                  : projectView?.feedCount ?? event.metadata?.projectVoteCount ?? 0),
                qualifiedVoteCount: Number(event.type === 'PROJECT_QUEST_CORROBORATED'
                  ? event.metadata?.projectQualifiedVoteCount ?? projectView?.qualifiedContributors ?? 0
                  : projectView?.qualifiedContributors ?? event.metadata?.projectQualifiedVoteCount ?? 0),
                highScoreQualifiedVoteCount: Number(event.type === 'PROJECT_QUEST_CORROBORATED'
                  ? event.metadata?.projectHighScoreQualifiedVoteCount ?? projectView?.highScoreQualifiedContributors ?? 0
                  : projectView?.highScoreQualifiedContributors ?? event.metadata?.projectHighScoreQualifiedVoteCount ?? 0),
                averageHeatScore: Number.isFinite(Number(event.type === 'PROJECT_QUEST_CORROBORATED'
                  ? event.metadata?.projectAverageHeatScore ?? projectView?.averageHeatScore
                  : projectView?.averageHeatScore ?? event.metadata?.projectAverageHeatScore))
                  ? Number(event.type === 'PROJECT_QUEST_CORROBORATED'
                    ? event.metadata?.projectAverageHeatScore ?? projectView?.averageHeatScore
                    : projectView?.averageHeatScore ?? event.metadata?.projectAverageHeatScore)
                  : null,
                consensusStatus: event.type === 'PROJECT_QUEST_CORROBORATED'
                  ? event.metadata?.projectConsensusStatus || projectView?.status || 'PENDING_CORROBORATION'
                  : projectView?.status || event.metadata?.projectConsensusStatus || 'PENDING_CORROBORATION',
              },
            },
          } : {}),
          achievement: {
            sourceType: event.type,
            xp: Math.max(0, Number(delta || 0)),
            rank: Number.isSafeInteger(Number(event.metadata?.rank)) && Number(event.metadata.rank) > 0
              ? Number(event.metadata.rank)
              : null,
            rewardLabel: safeText(event.metadata?.rewardLabel, 80) || null,
          },
        });
      }
    }
    return celebrations
      .sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)) || a.id.localeCompare(b.id))
      .slice(0, boundedLimit);
  }
  return { snapshot, hatch, replacementPreview, replacePet, rename, linkVerifiedSocialIdentity, recordTelegramMembership, unlinkSocialIdentity, verifiedSocialIdentity, ownerForVerifiedSocialIdentity, communityAccessForTelegramUser, recordRewardHolding, reconcileCanonicalAxoQuestAccess, ensureReferralCode, createPetShareCard, petShareCardByCode, recordReferralStart, webReferralPublic, webReferralWalletPreflight, recordWebReferralStart, recordWebReferralOnboardingAction, webReferralActivationPlan, activateWebReferral, webReferralView, reconcileCommunityReferralMilestones, communityReferralLeaderboard, adminReferralContest, setReferralContest, cancelReferralContest, referralRewardSetupRows, markReferralRewardRegistered, recordWebReferralPurchase, referralActivationPlan, activateReferralForTelegramUser, crewMissionSnapshotForTelegramUser, crewInviteForTelegramUser, createCrewRaid, createCommunityCrewRaidForTelegramUser, publishCommunityCrewRaidForTelegramUser, discardCommunityCrewRaidForTelegramUser, settleCrewRaidCreatorRewardsForTelegramUser, crewRaidCreatorRewardPlan, cancelCrewRaid, crewRaidById, claimCrewRaidContributionForTelegramUser, care, pet, equipItem, learnSkill, completeFirstTrail, completeCalibration, contribute, upgradeContractAlpha, claimHatchShare, claimDailySocialFeeding, claimDailyXEngagement, claimDailySocialCreatorContribution, missionControl, missionControlPreferences, updateProjectPreference, updateLiveStream, updateWatchlist, reactToMissionControlProject, claimMissionControlChest, claimCrewMilestones, leaderboard, communityHolderCandidates, communityCelebrations, alphaDashboard, alphaEpochProfile, epochRewardsBoard, epochRewardPool, setEpochRewardPool, confirmEpochResult, epochSettlementParticipants, recordEpochHoldingSnapshot, prepareEthEpochSettlement, ethEpochClaimProof, alphaProtocolSummary, reconcileAlphaProtocolPets, alphaProtocolWalletActions, alphaProtocolClaimProof, markAlphaProtocolWalletAction, alphaProtocolOutbox, markAlphaProtocolSafeAction, prepareAlphaSettlement, scoreAlphaCalls, sprintList, staffContext, staffDirectory, setStaffRole, setModerator, adminPetList, adminPetDetail, adminUpdatePet, adjustPlayerLedger, awardAlphaSpotlight, adjustAlphaXp, setAlphaMiningBlock, createSprint, launchSeasonZero, updateSprint, transitionSprint, finalizeSprint, intelligenceReport, resolveOutcome, briefing, telemetryReport, migrateStoredState, exportAccount, recordPetNftMint, recordPetNftUpdate, deleteAccount, runMaintenance, repositoryHealth: () => repository.health ? repository.health() : { kind: repository.kind }, protocolStore: repository.protocol, close: () => repository.close(), aggregateIntelligence: () => aggregateIntelligence(readState().contributions) };
}

module.exports = { SCHEMA_VERSION, ABILITIES, TASKS, ROUTES, SPECIALTY_ARCHETYPES, CARE_SOURCES, ITEM_SLOTS, LINEAGES, LINEAGE_CARE_TRAITS, LINEAGE_TRAIL_ITEMS, SKILL_TREE, LEVELS, PET_STAGES, GROWTH_FORMS, MAX_LEVEL, HATCH_SHARE_XP, DAILY_SOCIAL_FEEDING_XP, DAILY_PROMOTION_BONUS_XP, CONTRACT_DISCOVERY_XP, MULTICHAIN_CONTRACT_DISCOVERY_XP, CONTRACT_DISCOVERY_CORROBORATED_XP, CONTRACT_JUDGMENT_XP, CONTRACT_JUDGMENT_CORROBORATED_XP, PROJECT_HIGH_SCORE_MINIMUM, MISSION_CONTROL_DAILY_XP, CREW_MILESTONE_TIERS, CREW_MILESTONE_EVENT_TYPES, REFERRAL_WELCOME_XP, REFERRAL_SCOUT_XP, REFERRAL_WEEKLY_REWARD_CAP, REFERRAL_MINIMUM_PURCHASE_RAW, REFERRAL_REWARD_AMOUNT_RAW, RAID_DAILY_REWARD_CAP, RAID_DEFAULT_XP, COMMUNITY_RAID_CREATOR_XP, COMMUNITY_RAID_DEFAULT_GOAL, PET_HAPPINESS_GAIN, PET_HAPPINESS_COOLDOWN_MS, PET_MIN_TOUCH_MS, PET_PURR_HOLD_MS, FEEDING_COOLDOWN_MS, CONTRACT_ALPHA_SUBMISSIONS_PER_WALLET_DAY, ALPHA_CALL_HORIZONS, ALPHA_CALL_DISCLOSURES, ALPHA_CALL_HYPOTHETICAL_TRADE_USD, ALPHA_EPOCH_SETTLEMENT_BUFFER_MS, ALPHA_MINIMUM_OUTCOME_WINDOW_MS, SPRINT_MIN_DURATION_MS, SPRINT_MAX_DURATION_MS, SPRINT_MAX_BONUS_XP, createHatcheryEngine, buildTasks, currentLevel, currentStage, leadingAbility, specialtyArchetype, lineageCareTrait, publicCareState, validateContribution, validateAlphaCall, alphaOutcomeWindow, alphaPerformanceSafety, buildIntelligence, projectPulse, projectFidelity, projectQuestViews, isHighScoreProjectView, entityKey, normalizeXStatusUrl, normalizeTelegramPostUrl, normalizeSocialHandle, normalizeAxoRaidTarget, normalizeCommunityRaidTarget, normalizeRaidContribution, crewRaidStatus, lineageForSeed, xpFromEvent, sprintPointsFromEvent, communityReadiness, calibrationView, sprintStatus, resolveOutcomeInState, tokenSnapshot, communityProjectMarket, missionDeck, crewMilestonesView, telegramMembershipView, dailyContractQuestView, dailyXEngagementView, dailyPromotionQuestView, dailySocialCreatorMissionsView, playerLedgerView, participationGateView };
module.exports.PROJECT_SCAM_QUORUM = PROJECT_SCAM_QUORUM;
