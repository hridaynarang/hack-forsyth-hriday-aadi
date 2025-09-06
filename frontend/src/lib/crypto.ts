// Core cryptographic analysis functions

// Seeded random number generator for deterministic results
class SeededRandom {
  private seed: number;
  
  constructor(seed: number) {
    this.seed = seed;
  }
  
  next(): number {
    // Linear congruential generator
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
  
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }
}

export interface CipherResult {
  type: 'caesar' | 'vigenere' | 'mono';
  key?: string;
  shift?: number;
  mapping?: { [key: string]: string };
  plaintext: string;
  confidence: number;
  formula: string;
  ngramScore: number;
  llmScore?: number;
  llmReasoning?: string;
}

export interface DetectionResult {
  likelyType: 'caesar' | 'vigenere' | 'mono';
  ic: number;
  keyLengths: number[];
  confidence: number;
}

// Normalize text to uppercase A-Z only
export function normalizeText(text: string): string {
  return text.replace(/[^A-Z]/g, '').toUpperCase();
}

// Calculate Index of Coincidence
export function calculateIC(text: string): number {
  const normalized = normalizeText(text);
  const n = normalized.length;
  if (n <= 1) return 0;
  
  const freq: { [key: string]: number } = {};
  for (const char of normalized) {
    freq[char] = (freq[char] || 0) + 1;
  }
  
  let sum = 0;
  for (const count of Object.values(freq)) {
    sum += count * (count - 1);
  }
  
  return sum / (n * (n - 1));
}

// Friedman test to estimate key length
export function friedmanTest(text: string): number[] {
  const normalized = normalizeText(text);
  const ic = calculateIC(normalized);
  
  // Corrected Friedman's formula: m = (kp - kr) / (ic - kr)
  const kp = 0.0667; // IC for English
  const kr = 0.0385; // IC for random text
  
  if (ic <= kr) return []; // Invalid IC, can't estimate
  
  const estimatedKeyLength = (kp - kr) / (ic - kr);
  
  const candidates: number[] = [];
  const base = Math.round(estimatedKeyLength);
  
  // Generate candidates around the estimate
  for (let i = Math.max(2, base - 3); i <= Math.min(20, base + 3); i++) {
    candidates.push(i);
  }
  
  // If estimate is very low, still include some small key lengths
  if (base < 5) {
    [2, 3, 4, 5, 6].forEach(k => {
      if (!candidates.includes(k)) candidates.push(k);
    });
  }
  
  return candidates.filter(k => k >= 2 && k <= 20).slice(0, 8);
}

// Kasiski examination for repeated patterns
export function kasiskiExamination(text: string): number[] {
  const normalized = normalizeText(text);
  const patterns: { [pattern: string]: number[] } = {};
  
  // Find all 3-grams and their positions
  for (let i = 0; i <= normalized.length - 3; i++) {
    const trigram = normalized.substring(i, i + 3);
    if (!patterns[trigram]) patterns[trigram] = [];
    patterns[trigram].push(i);
  }
  
  const distances: number[] = [];
  
  // Calculate distances between repeated patterns
  for (const positions of Object.values(patterns)) {
    if (positions.length > 1) {
      for (let i = 0; i < positions.length - 1; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          distances.push(positions[j] - positions[i]);
        }
      }
    }
  }
  
  // Find common factors (GCD analysis)
  const factorCounts: { [factor: number]: number } = {};
  
  for (const distance of distances) {
    for (let factor = 2; factor <= Math.min(20, distance); factor++) {
      if (distance % factor === 0) {
        factorCounts[factor] = (factorCounts[factor] || 0) + 1;
      }
    }
  }
  
  // Return most common factors as key length candidates
  return Object.entries(factorCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([factor]) => parseInt(factor));
}

// Additional detection heuristics
function detectRepeatingPatterns(text: string): { avgDistance: number, patternCount: number } {
  const normalized = normalizeText(text);
  const patterns: { [pattern: string]: number[] } = {};
  
  // Find all 3-grams and their positions
  for (let i = 0; i <= normalized.length - 3; i++) {
    const trigram = normalized.substring(i, i + 3);
    if (!patterns[trigram]) patterns[trigram] = [];
    patterns[trigram].push(i);
  }
  
  let totalDistance = 0;
  let patternCount = 0;
  
  // Calculate average distance between repeated patterns
  for (const positions of Object.values(patterns)) {
    if (positions.length > 1) {
      patternCount++;
      for (let i = 0; i < positions.length - 1; i++) {
        totalDistance += positions[i + 1] - positions[i];
      }
    }
  }
  
  return {
    avgDistance: patternCount > 0 ? totalDistance / patternCount : 0,
    patternCount
  };
}

function calculateCharacterDistribution(text: string): number {
  const normalized = normalizeText(text);
  const freq: { [key: string]: number } = {};
  
  for (const char of normalized) {
    freq[char] = (freq[char] || 0) + 1;
  }
  
  // Calculate chi-squared statistic against English frequencies
  const englishFreq: { [key: string]: number } = {
    'A': 0.082, 'B': 0.015, 'C': 0.028, 'D': 0.043, 'E': 0.127, 'F': 0.022,
    'G': 0.020, 'H': 0.061, 'I': 0.070, 'J': 0.002, 'K': 0.008, 'L': 0.040,
    'M': 0.024, 'N': 0.067, 'O': 0.075, 'P': 0.019, 'Q': 0.001, 'R': 0.060,
    'S': 0.063, 'T': 0.091, 'U': 0.028, 'V': 0.010, 'W': 0.023, 'X': 0.001,
    'Y': 0.020, 'Z': 0.001
  };
  
  let chiSquared = 0;
  const textLen = normalized.length;
  
  for (let i = 0; i < 26; i++) {
    const char = String.fromCharCode(65 + i);
    const observed = freq[char] || 0;
    const expected = englishFreq[char] * textLen;
    if (expected > 0) {
      chiSquared += Math.pow(observed - expected, 2) / expected;
    }
  }
  
  return chiSquared;
}

// Improved cipher type detection
export function detectCipherType(text: string): DetectionResult {
  const ic = calculateIC(text);
  const friedmanKeyLengths = friedmanTest(text);
  const kasiskiKeyLengths = kasiskiExamination(text);
  const patterns = detectRepeatingPatterns(text);
  const chiSquared = calculateCharacterDistribution(text);
  
  // Combine and weight key length estimates
  const keyLengthCounts: { [key: number]: number } = {};
  friedmanKeyLengths.forEach(k => keyLengthCounts[k] = (keyLengthCounts[k] || 0) + 2);
  kasiskiKeyLengths.forEach(k => keyLengthCounts[k] = (keyLengthCounts[k] || 0) + 3);
  
  const allKeyLengths = Object.entries(keyLengthCounts)
    .sort(([,a], [,b]) => b - a)
    .map(([k]) => parseInt(k))
    .slice(0, 8);
  
  // Enhanced detection logic with refined thresholds
  let likelyType: 'caesar' | 'vigenere' | 'mono';
  let confidence: number;
  
  // More precise IC thresholds based on statistical analysis:
  // - English plaintext: ~0.067
  // - Random text: ~0.038
  // - Vigenère (polyalphabetic): 0.038-0.050
  // - Monoalphabetic substitution: 0.060-0.067
  // - Caesar (shift cipher): 0.065-0.069
  
  // Caesar cipher indicators:
  // - Very high IC (>0.063) indicating preserved letter frequencies
  // - Low chi-squared (close to English distribution)
  // - Few repeating patterns (no polyalphabetic structure)
  if (ic >= 0.063 && chiSquared < 60 && patterns.patternCount <= 3) {
    likelyType = 'caesar';
    confidence = Math.min(0.95, (ic - 0.050) * 18 + (60 - chiSquared) / 120);
  }
  // Vigenère cipher indicators:
  // - Lower IC (0.038-0.052) due to polyalphabetic nature
  // - Multiple repeating patterns indicating key repetition
  // - Clear key length candidates from analysis
  else if (ic >= 0.038 && ic <= 0.052 && patterns.patternCount >= 3 && allKeyLengths.length > 0) {
    likelyType = 'vigenere';
    confidence = Math.min(0.95, (0.070 - ic) * 12 + patterns.patternCount / 8);
  }
  // Monoalphabetic substitution indicators:
  // - High IC (0.055-0.065) but scrambled distribution
  // - High chi-squared indicates non-English frequency pattern
  // - May have some patterns but not systematic like Vigenère
  else if (ic >= 0.055 && ic < 0.063 && chiSquared > 40) {
    likelyType = 'mono';
    confidence = Math.min(0.95, (ic - 0.040) * 10 + Math.min(chiSquared / 120, 0.25));
  }
  // Edge case: very high IC but high chi-squared (unusual substitution)
  else if (ic >= 0.063 && chiSquared >= 60) {
    likelyType = 'mono';
    confidence = Math.min(0.85, (ic - 0.040) * 8);
  }
  // Fallback logic with conservative confidence
  else if (ic >= 0.055) {
    likelyType = ic >= 0.063 ? 'caesar' : 'mono';
    confidence = Math.min(0.75, ic * 10);
  }
  else {
    likelyType = 'vigenere';
    confidence = Math.min(0.75, (0.070 - ic) * 12);
  }
  
  return {
    likelyType,
    ic,
    keyLengths: allKeyLengths.length > 0 ? allKeyLengths : [2, 3, 4, 5, 6],
    confidence
  };
}

// Load quadgrams data
let quadgrams: { [key: string]: number } | null = null;

export async function loadQuadgrams(): Promise<{ [key: string]: number }> {
  if (quadgrams) return quadgrams;
  
  try {
    const response = await fetch('/quadgrams.json');
    quadgrams = await response.json();
    return quadgrams!;
  } catch (error) {
    console.error('Failed to load quadgrams:', error);
    return {};
  }
}

// Score text using quadgrams
export async function scoreText(text: string): Promise<number> {
  const quadgramData = await loadQuadgrams();
  const normalized = normalizeText(text);
  
  if (normalized.length < 4) return -999999;
  
  let score = 0;
  for (let i = 0; i <= normalized.length - 4; i++) {
    const quad = normalized.substring(i, i + 4);
    score += quadgramData[quad] || -12; // Default penalty for unknown quadgrams
  }
  
  return score / Math.max(1, normalized.length - 3);
}

// Enhanced Caesar cipher solver with better scoring
export async function solveCaesar(ciphertext: string): Promise<CipherResult[]> {
  const normalized = normalizeText(ciphertext);
  const results: CipherResult[] = [];
  
  for (let shift = 0; shift < 26; shift++) {
    let plaintext = '';
    for (const char of normalized) {
      const charCode = char.charCodeAt(0) - 65;
      const shiftedCode = (charCode - shift + 26) % 26;
      plaintext += String.fromCharCode(shiftedCode + 65);
    }
    
    const ngramScore = await scoreText(plaintext);
    const ic = calculateIC(plaintext);
    const chiSquared = calculateCharacterDistribution(plaintext);
    
    // Combined scoring: ngram score + IC bonus + chi-squared penalty
    const icBonus = ic > 0.060 ? (ic - 0.060) * 10 : 0;
    const chiPenalty = chiSquared > 30 ? (chiSquared - 30) / 100 : 0;
    const combinedScore = ngramScore + icBonus - chiPenalty;
    
    // Better confidence calculation
    let confidence = Math.max(0.01, Math.min(0.99, (combinedScore + 10) / 6));
    
    // Bonus for common shifts (ROT13, etc.)
    if (shift === 13) confidence = Math.min(0.99, confidence + 0.05);
    if (shift === 1 || shift === 25) confidence = Math.min(0.99, confidence + 0.03);
    
    results.push({
      type: 'caesar',
      shift,
      plaintext,
      confidence,
      formula: `E(x) = (x - ${shift}) mod 26`,
      ngramScore: combinedScore
    });
  }
  
  // Return more Caesar results for comprehensive analysis
  return results.sort((a, b) => b.ngramScore - a.ngramScore).slice(0, 10);
}

// Enhanced Vigenère cipher solver with improved key recovery
export async function solveVigenere(ciphertext: string, keyLengths: number[]): Promise<CipherResult[]> {
  const normalized = normalizeText(ciphertext);
  const results: CipherResult[] = [];
  
  // Try most promising key lengths first, ensuring we have enough text per column
  const sortedKeyLengths = keyLengths
    .filter(k => k >= 2 && k <= Math.min(20, normalized.length / 3))
    .slice(0, 8);
  
  for (const keyLen of sortedKeyLengths) {
    // Split text into columns based on key length
    const columns: string[] = new Array(keyLen).fill('');
    for (let i = 0; i < normalized.length; i++) {
      columns[i % keyLen] += normalized[i];
    }
    
    // Solve each column more thoroughly with multiple methods
    const key: number[] = [];
    let columnScores: number[] = [];
    
    for (let col = 0; col < columns.length; col++) {
      const column = columns[col];
      if (column.length === 0) {
        key.push(0);
        columnScores.push(-999);
        continue;
      }
      
      // Method 1: N-gram scoring
      let bestShift = 0;
      let bestScore = -999999;
      
      for (let shift = 0; shift < 26; shift++) {
        let decryptedColumn = '';
        for (const char of column) {
          const charCode = char.charCodeAt(0) - 65;
          const shiftedCode = (charCode - shift + 26) % 26;
          decryptedColumn += String.fromCharCode(shiftedCode + 65);
        }
        
        const ngramScore = await scoreText(decryptedColumn);
        
        // Method 2: Add IC and frequency analysis bonus
        const ic = calculateIC(decryptedColumn);
        const icBonus = ic > 0.060 ? (ic - 0.060) * 5 : 0;
        
        const combinedScore = ngramScore + icBonus;
        
        if (combinedScore > bestScore) {
          bestScore = combinedScore;
          bestShift = shift;
        }
      }
      
      key.push(bestShift);
      columnScores.push(bestScore);
    }
    
    // Reconstruct plaintext with the found key
    let plaintext = '';
    for (let i = 0; i < normalized.length; i++) {
      const charCode = normalized.charCodeAt(i) - 65;
      const keyChar = key[i % keyLen];
      const decryptedCode = (charCode - keyChar + 26) % 26;
      plaintext += String.fromCharCode(decryptedCode + 65);
    }
    
    const finalScore = await scoreText(plaintext);
    const ic = calculateIC(plaintext);
    const avgColumnScore = columnScores.reduce((a, b) => a + b, 0) / columnScores.length;
    
    // Enhanced scoring
    const icBonus = ic > 0.060 ? (ic - 0.060) * 8 : 0;
    const combinedScore = finalScore + icBonus + avgColumnScore * 0.3;
    
    const keyString = key.map(k => String.fromCharCode(k + 65)).join('');
    
    // Better confidence calculation
    let confidence = Math.max(0.01, Math.min(0.99, (combinedScore + 10) / 8));
    
    // Bonus for key length consistency with detection
    if (keyLengths.indexOf(keyLen) <= 2) confidence = Math.min(0.99, confidence + 0.05);
    
    results.push({
      type: 'vigenere',
      key: keyString,
      plaintext,
      confidence,
      formula: `E(x_i) = (x_i - k_i) mod 26, key="${keyString}"`,
      ngramScore: combinedScore
    });
  }
  
  // Return more Vigenère results for comprehensive analysis  
  return results.sort((a, b) => b.ngramScore - a.ngramScore).slice(0, 8);
}

// Enhanced monoalphabetic substitution solver with multiple techniques
export async function solveMonoSubstitution(ciphertext: string): Promise<CipherResult[]> {
  const normalized = normalizeText(ciphertext);
  const results: CipherResult[] = [];
  
  // English letter frequencies (more precise)
  const englishFreqOrder = 'ETAOINSHRDLCUMWFGYPBVKJXQZ';
  
  // Calculate cipher letter frequencies
  const cipherFreq: { [key: string]: number } = {};
  for (const char of normalized) {
    cipherFreq[char] = (cipherFreq[char] || 0) + 1;
  }
  
  // Convert to percentages
  const totalChars = normalized.length;
  Object.keys(cipherFreq).forEach(char => {
    cipherFreq[char] = (cipherFreq[char] / totalChars) * 100;
  });
  
  // Method 1: Pure frequency analysis
  const frequencyMapping: { [key: string]: string } = {};
  const cipherFreqSorted = Object.entries(cipherFreq)
    .sort(([,a], [,b]) => b - a)
    .map(([char]) => char);
  
  for (let i = 0; i < Math.min(26, cipherFreqSorted.length); i++) {
    frequencyMapping[cipherFreqSorted[i]] = englishFreqOrder[i] || 'Z';
  }
  
  // Fill remaining mappings
  const usedChars = new Set(Object.values(frequencyMapping));
  let englishIndex = 0;
  for (let i = 0; i < 26; i++) {
    const cipherChar = String.fromCharCode(65 + i);
    if (!frequencyMapping[cipherChar]) {
      while (usedChars.has(englishFreqOrder[englishIndex]) && englishIndex < 26) {
        englishIndex++;
      }
      frequencyMapping[cipherChar] = englishFreqOrder[englishIndex] || 'Z';
      englishIndex++;
    }
  }
  
  // Apply frequency mapping
  let plaintext1 = '';
  for (const char of normalized) {
    plaintext1 += frequencyMapping[char] || char;
  }
  
  const score1 = await scoreText(plaintext1);
  const ic1 = calculateIC(plaintext1);
  const chi1 = calculateCharacterDistribution(plaintext1);
  
  results.push({
    type: 'mono',
    mapping: frequencyMapping,
    plaintext: plaintext1,
    confidence: Math.max(0.01, Math.min(0.99, (score1 + 8) / 5 + (ic1 > 0.060 ? 0.1 : 0) - (chi1 > 30 ? 0.1 : 0))),
    formula: 'E(x) = σ⁻¹(x), frequency analysis',
    ngramScore: score1
  });
  
  // Method 2: Pattern-based approach for common words
  if (normalized.length > 10) {
    const patternMapping = { ...frequencyMapping };
    
    // Try to refine mapping based on patterns  
    // This is a simplified pattern analysis - in practice, you'd do much more
    
    let plaintext2 = '';
    for (const char of normalized) {
      plaintext2 += patternMapping[char] || char;
    }
    
    const score2 = await scoreText(plaintext2);
    
    if (score2 > score1) { // Only add if it's better
      results.push({
        type: 'mono',
        mapping: patternMapping,
        plaintext: plaintext2,
        confidence: Math.max(0.01, Math.min(0.99, (score2 + 8) / 5)),
        formula: 'E(x) = σ⁻¹(x), pattern analysis',
        ngramScore: score2
      });
    }
  }
  
  // Method 3: Hill climbing optimization (deterministic)
  if (normalized.length > 20) {
    let bestMapping = { ...frequencyMapping };
    let bestScore = score1;
    const maxIterations = 50;
    
    // Create seeded RNG for deterministic results
    const rng = new SeededRandom(normalized.length + score1 * 1000);
    
    for (let iter = 0; iter < maxIterations; iter++) {
      // Try swapping two random mappings (deterministic)
      const mapping = { ...bestMapping };
      const chars = Object.keys(mapping);
      if (chars.length >= 2) {
        const i = rng.nextInt(chars.length);
        const j = rng.nextInt(chars.length);
        if (i !== j) {
          const temp = mapping[chars[i]];
          mapping[chars[i]] = mapping[chars[j]];
          mapping[chars[j]] = temp;
          
          let testPlaintext = '';
          for (const char of normalized) {
            testPlaintext += mapping[char] || char;
          }
          
          const testScore = await scoreText(testPlaintext);
          if (testScore > bestScore) {
            bestMapping = mapping;
            bestScore = testScore;
          }
        }
      }
    }
    
    if (bestScore > score1 + 0.5) { // Only add if significantly better
      let plaintext3 = '';
      for (const char of normalized) {
        plaintext3 += bestMapping[char] || char;
      }
      
      results.push({
        type: 'mono',
        mapping: bestMapping,
        plaintext: plaintext3,
        confidence: Math.max(0.01, Math.min(0.99, (bestScore + 8) / 5)),
        formula: 'E(x) = σ⁻¹(x), optimized',
        ngramScore: bestScore
      });
    }
  }
  
  // Return more mono substitution results for comprehensive analysis
  return results.sort((a, b) => b.ngramScore - a.ngramScore).slice(0, 5);
}