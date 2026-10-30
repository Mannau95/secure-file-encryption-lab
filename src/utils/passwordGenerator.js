/**
 * Cryptographically Secure Password & Passphrase Generator
 * Backed by Web Crypto API (window.crypto.getRandomValues)
 */

const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NUMBERS = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{}|;:,.<>?';

const AMBIGUOUS = /[0Oo1lI|`'"]/;

// Curated French words for Diceware-style passphrases (5+ letters, unambiguous, evocative)
const WORDS_FR = [
  'abricot', 'acacia', 'agile', 'aimant', 'albatros', 'alchimie', 'amande', 'ambre',
  'amiral', 'ancre', 'anneau', 'arcade', 'archipel', 'ardent', 'armure', 'atlas',
  'aurore', 'azimut', 'bambou', 'bastion', 'bivouac', 'boreale', 'bouclier', 'boussole',
  'braise', 'brume', 'buisson', 'canyon', 'cascade', 'cedre', 'celeste', 'centaure',
  'cerisier', 'chalet', 'chimere', 'chrysalide', 'citadelle', 'clairiere', 'cobalt',
  'colibri', 'comete', 'compas', 'constellation', 'corail', 'cosmos', 'cratere', 'cristal',
  'cyclone', 'dauphin', 'diamant', 'drakkar', 'dune', 'eclair', 'eclipse', 'ecume',
  'emeraude', 'enigme', 'ephémere', 'equinoxe', 'erable', 'etoile', 'falaise', 'faucon',
  'flambeau', 'foudre', 'galaxie', 'geyser', 'glacier', 'granit', 'griffon', 'hermine',
  'hibou', 'horizon', 'iceberg', 'iguane', 'iris', 'jaspe', 'jonquille', 'kaolin',
  'lagune', 'lapis', 'lavande', 'leopard', 'licorne', 'linx', 'lueur', 'lune',
  'magenta', 'maelstrom', 'mangrove', 'marbre', 'meteorite', 'mirage', 'mousson', 'nebuleuse',
  'nectar', 'nomade', 'oasis', 'obsidienne', 'oceane', 'olympe', 'onyx', 'opale',
  'orchidee', 'orion', 'paladin', 'panthere', 'pegase', 'perle', 'petale', 'phare',
  'phenix', 'pirogue', 'planete', 'prisme', 'poussiere', 'pyramide', 'quartz', 'radieux',
  'rafale', 'recif', 'reflet', 'renard', 'rivage', 'rubis', 'safari', 'saphir',
  'satellite', 'scarabee', 'sequoia', 'silex', 'sirius', 'soleil', 'solstice', 'steppe',
  'stratus', 'symbole', 'taiga', 'talion', 'tempete', 'titane', 'topaze', 'tornade',
  'totem', 'toundra', 'treffle', 'tribord', 'tropique', 'tsunami', 'turbine', 'univers',
  'vallee', 'vapeur', 'vecteur', 'vertige', 'vignoble', 'vortex', 'voyage', 'zenith',
  'zephir', 'zodiaque'
];

// Curated English words for Diceware-style passphrases
const WORDS_EN = [
  'acorn', 'albatross', 'alchemy', 'amber', 'anchor', 'anthem', 'apex', 'arcade',
  'archipelago', 'arctic', 'armor', 'arrow', 'atlas', 'aurora', 'avalanche', 'badger',
  'bamboo', 'bastion', 'beacon', 'bison', 'blizzard', 'boulder', 'breeze', 'bronze',
  'cactus', 'canyon', 'cascade', 'castle', 'cedar', 'celestial', 'chariot', 'chimera',
  'citadel', 'cliff', 'clover', 'cobalt', 'comet', 'compass', 'condor', 'coral',
  'cosmos', 'crater', 'crystal', 'cyclone', 'dagger', 'dawn', 'desert', 'diamond',
  'dolphin', 'dragon', 'dune', 'eagle', 'echo', 'eclipse', 'emerald', 'enigma',
  'equinox', 'falcon', 'feather', 'fjord', 'flame', 'forest', 'fossil', 'fountain',
  'galaxy', 'garnet', 'glacier', 'glimmer', 'granite', 'griffin', 'grove', 'harbor',
  'hawk', 'helix', 'horizon', 'iceberg', 'iguana', 'island', 'jasper', 'javelin',
  'jungle', 'jupiter', 'kinetic', 'lagoon', 'lantern', 'lapis', 'laser', 'legend',
  'leopard', 'lightning', 'lunar', 'magnet', 'mammoth', 'mantle', 'meadow', 'meteor',
  'mirage', 'monolith', 'monsoon', 'moon', 'mountain', 'nebula', 'nectar', 'nomad',
  'nova', 'oasis', 'obsidian', 'ocean', 'olympus', 'onyx', 'opal', 'orbit',
  'orchid', 'orion', 'panther', 'pegasus', 'phantom', 'phoenix', 'pioneer', 'planet',
  'platinum', 'prism', 'pyramid', 'quantum', 'quartz', 'quasar', 'radiant', 'rainbow',
  'raven', 'redwood', 'reef', 'ridge', 'river', 'rocket', 'ruby', 'safari',
  'sapphire', 'satellite', 'saturn', 'sequoia', 'shadow', 'shield', 'siren', 'sirius',
  'solar', 'solstice', 'sparrow', 'sphinx', 'spirit', 'spring', 'star', 'stellar',
  'summit', 'sunburst', 'taiga', 'tempest', 'thunder', 'titan', 'topaz', 'tornado',
  'totem', 'tundra', 'typhoon', 'universe', 'valley', 'vanguard', 'vector', 'vortex',
  'voyage', 'vulcan', 'walrus', 'willow', 'winter', 'zenith', 'zephyr', 'zodiac'
];

/**
 * Returns an unbiased random integer in [0, max - 1] using CSPRNG
 */
function getSecureRandomInt(max) {
  if (max <= 1) return 0;
  const uint32Max = 0xffffffff;
  const limit = uint32Max - (uint32Max % max);
  const buffer = new Uint32Array(1);

  let val;
  do {
    window.crypto.getRandomValues(buffer);
    val = buffer[0];
  } while (val >= limit);

  return val % max;
}

/**
 * Generates a high-entropy random password with mixed charsets
 */
export function generateRandomPassword({
  length = 20,
  includeLower = true,
  includeUpper = true,
  includeNumbers = true,
  includeSymbols = true,
  avoidAmbiguous = true,
} = {}) {
  const safeLength = Math.min(64, Math.max(10, Number(length) || 20));

  let pool = '';
  const requiredChars = [];

  const filterAmbiguous = (str) =>
    avoidAmbiguous ? str.split('').filter((c) => !AMBIGUOUS.test(c)).join('') : str;

  const filteredLower = filterAmbiguous(LOWERCASE);
  const filteredUpper = filterAmbiguous(UPPERCASE);
  const filteredNumbers = filterAmbiguous(NUMBERS);
  const filteredSymbols = filterAmbiguous(SYMBOLS);

  if (includeLower && filteredLower.length > 0) {
    pool += filteredLower;
    requiredChars.push(filteredLower[getSecureRandomInt(filteredLower.length)]);
  }
  if (includeUpper && filteredUpper.length > 0) {
    pool += filteredUpper;
    requiredChars.push(filteredUpper[getSecureRandomInt(filteredUpper.length)]);
  }
  if (includeNumbers && filteredNumbers.length > 0) {
    pool += filteredNumbers;
    requiredChars.push(filteredNumbers[getSecureRandomInt(filteredNumbers.length)]);
  }
  if (includeSymbols && filteredSymbols.length > 0) {
    pool += filteredSymbols;
    requiredChars.push(filteredSymbols[getSecureRandomInt(filteredSymbols.length)]);
  }

  // Fallback if user unchecks everything
  if (pool.length === 0) {
    pool = filteredLower + filteredUpper + filteredNumbers;
  }

  const result = [...requiredChars];
  while (result.length < safeLength) {
    result.push(pool[getSecureRandomInt(pool.length)]);
  }

  // Cryptographic Fisher-Yates shuffle
  for (let i = result.length - 1; i > 0; i--) {
    const j = getSecureRandomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result.join('');
}

/**
 * Generates a Diceware-style passphrase with high entropy and readability
 */
export function generatePassphrase({
  wordCount = 5,
  separator = '-',
  capitalize = true,
  includeNumber = true,
  language = 'fr',
} = {}) {
  const safeWordCount = Math.min(8, Math.max(4, Number(wordCount) || 5));
  const wordsList = language === 'fr' ? WORDS_FR : WORDS_EN;

  const chosenWords = [];
  for (let i = 0; i < safeWordCount; i++) {
    const word = wordsList[getSecureRandomInt(wordsList.length)];
    if (capitalize) {
      chosenWords.push(word.charAt(0).toUpperCase() + word.slice(1));
    } else {
      chosenWords.push(word);
    }
  }

  if (includeNumber) {
    // Generate a 2 to 4 digit random number
    const num = getSecureRandomInt(9000) + 1000;
    chosenWords.push(num.toString());
  }

  return chosenWords.join(separator);
}

/**
 * Calculates theoretical entropy bits for generated password configuration
 */
export function estimateGeneratedEntropy(mode, config, language = 'fr') {
  if (mode === 'passphrase') {
    const wordCount = Math.min(8, Math.max(4, Number(config.wordCount) || 5));
    const wordsList = language === 'fr' ? WORDS_FR : WORDS_EN;
    const bitsPerWord = Math.log2(wordsList.length);
    let total = wordCount * bitsPerWord;
    if (config.capitalize) total += wordCount * 1; // 1 bit per capitalized word
    if (config.includeNumber) total += Math.log2(9000); // ~13.1 bits
    return Math.round(total);
  }

  let poolSize = 0;
  if (config.includeLower) poolSize += 26;
  if (config.includeUpper) poolSize += 26;
  if (config.includeNumbers) poolSize += 10;
  if (config.includeSymbols) poolSize += 27;
  if (config.avoidAmbiguous) poolSize -= 7;

  if (poolSize <= 0) poolSize = 26;
  return Math.round(config.length * Math.log2(poolSize));
}
