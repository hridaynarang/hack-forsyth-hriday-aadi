// Core cryptographic analysis functions

export interface CipherResult {
  type: 'caesar' | 'vigenere' | 'mono';
  key?: string;
  shift?: number;
  mapping?: { [key: string]: string };
  plaintext: string;
  confidence: number;
  formula: string;
  ngramScore: number;
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
  const n = normalized.length;
  
  // Friedman's formula: kappa = (kp * ic - kr) / (ic - kr)
  const kp = 0.0667; // IC for English
  const kr = 0.0385; // IC for random text
  
  const estimatedKeyLength = (kp * n - kr * n) / ((n - 1) * ic - kr * n + kp);
  
  const candidates = [];
  const base = Math.round(estimatedKeyLength);
  for (let i = Math.max(2, base - 2); i <= base + 2; i++) {
    candidates.push(i);
  }
  
  return candidates.filter(k => k >= 2 && k <= 20);
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

// Detect cipher type
export function detectCipherType(text: string): DetectionResult {
  const ic = calculateIC(text);
  const friedmanKeyLengths = friedmanTest(text);
  const kasiskiKeyLengths = kasiskiExamination(text);
  
  // Combine key length estimates
  const allKeyLengths = [...new Set([...friedmanKeyLengths, ...kasiskiKeyLengths])];
  
  let likelyType: 'caesar' | 'vigenere' | 'mono';
  let confidence: number;
  
  if (ic >= 0.060) {
    // High IC suggests monoalphabetic (including Caesar)
    likelyType = allKeyLengths.includes(1) || ic >= 0.065 ? 'caesar' : 'mono';
    confidence = Math.min(0.95, ic * 15);
  } else {
    // Low IC suggests polyalphabetic (Vigenère)
    likelyType = 'vigenere';
    confidence = Math.min(0.95, (0.067 - ic) * 20);
  }
  
  return {
    likelyType,
    ic,
    keyLengths: allKeyLengths,
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

// Caesar cipher solver
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
    
    const score = await scoreText(plaintext);
    results.push({
      type: 'caesar',
      shift,
      plaintext,
      confidence: Math.min(0.99, Math.max(0.01, (score + 8) / 4)),
      formula: 'E(x) = (x + k) mod 26',
      ngramScore: score
    });
  }
  
  return results.sort((a, b) => b.ngramScore - a.ngramScore).slice(0, 3);
}

// Vigenère cipher solver
export async function solveVigenere(ciphertext: string, keyLengths: number[]): Promise<CipherResult[]> {
  const normalized = normalizeText(ciphertext);
  const results: CipherResult[] = [];
  
  for (const keyLen of keyLengths.slice(0, 5)) {
    if (keyLen < 2 || keyLen > 20) continue;
    
    // Split text into columns based on key length
    const columns: string[] = new Array(keyLen).fill('');
    for (let i = 0; i < normalized.length; i++) {
      columns[i % keyLen] += normalized[i];
    }
    
    // Solve each column as a Caesar cipher
    const key: number[] = [];
    let totalScore = 0;
    
    for (const column of columns) {
      if (column.length === 0) {
        key.push(0);
        continue;
      }
      
      const caesarResults = await solveCaesar(column);
      const bestShift = caesarResults[0]?.shift || 0;
      key.push(bestShift);
      totalScore += caesarResults[0]?.ngramScore || -999;
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
    const keyString = key.map(k => String.fromCharCode(k + 65)).join('');
    
    results.push({
      type: 'vigenere',
      key: keyString,
      plaintext,
      confidence: Math.min(0.99, Math.max(0.01, (finalScore + 8) / 4)),
      formula: 'E(x_i) = (x_i + k_i) mod 26',
      ngramScore: finalScore
    });
  }
  
  return results.sort((a, b) => b.ngramScore - a.ngramScore).slice(0, 3);
}

// Simple monoalphabetic substitution solver using frequency analysis
export async function solveMonoSubstitution(ciphertext: string): Promise<CipherResult[]> {
  const normalized = normalizeText(ciphertext);
  
  // English letter frequencies (approximate)
  const englishFreq = 'ETAOINSHRDLCUMWFGYPBVKJXQZ';
  
  // Calculate cipher letter frequencies
  const freq: { [key: string]: number } = {};
  for (const char of normalized) {
    freq[char] = (freq[char] || 0) + 1;
  }
  
  // Sort cipher letters by frequency
  const cipherFreq = Object.entries(freq)
    .sort(([,a], [,b]) => b - a)
    .map(([char]) => char);
  
  // Create initial mapping based on frequency
  const mapping: { [key: string]: string } = {};
  for (let i = 0; i < Math.min(26, cipherFreq.length); i++) {
    mapping[cipherFreq[i]] = englishFreq[i] || 'Z';
  }
  
  // Fill remaining mappings
  const usedChars = new Set(Object.values(mapping));
  let englishIndex = 0;
  for (let i = 0; i < 26; i++) {
    const cipherChar = String.fromCharCode(65 + i);
    if (!mapping[cipherChar]) {
      while (usedChars.has(englishFreq[englishIndex]) && englishIndex < 26) {
        englishIndex++;
      }
      mapping[cipherChar] = englishFreq[englishIndex] || 'Z';
      englishIndex++;
    }
  }
  
  // Apply mapping
  let plaintext = '';
  for (const char of normalized) {
    plaintext += mapping[char] || char;
  }
  
  const score = await scoreText(plaintext);
  
  return [{
    type: 'mono',
    mapping,
    plaintext,
    confidence: Math.min(0.99, Math.max(0.01, (score + 6) / 4)),
    formula: 'E(x) = P(σ(x))',
    ngramScore: score
  }];
}