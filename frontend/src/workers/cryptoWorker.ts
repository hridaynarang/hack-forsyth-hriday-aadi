import { 
  detectCipherType, 
  solveCaesar, 
  solveVigenere, 
  solveMonoSubstitution,
  CipherResult,
  DetectionResult
} from '../lib/crypto';

export interface CryptoProgress {
  status: 'detecting' | 'solving' | 'completed' | 'error';
  progress: number;
  detection?: DetectionResult;
  results?: CipherResult[];
  message?: string;
  error?: string;
}

async function analyzeCipher(ciphertext: string): Promise<CryptoProgress> {
  try {
    // Step 1: Detect cipher type
    self.postMessage({
      status: 'detecting',
      progress: 10,
      message: 'Analyzing cipher characteristics...'
    });
    
    const detection = detectCipherType(ciphertext);
    
    self.postMessage({
      status: 'detecting',
      progress: 30,
      detection,
      message: `Detected likely cipher: ${detection.likelyType.toUpperCase()}`
    });
    
    // Step 2: Solve based on detected type
    self.postMessage({
      status: 'solving',
      progress: 40,
      message: 'Attempting decryption...'
    });
    
    let results: CipherResult[] = [];
    
    if (detection.likelyType === 'caesar') {
      self.postMessage({
        status: 'solving',
        progress: 60,
        message: 'Trying Caesar cipher shifts...'
      });
      
      results = await solveCaesar(ciphertext);
      
    } else if (detection.likelyType === 'vigenere') {
      self.postMessage({
        status: 'solving',
        progress: 60,
        message: 'Solving Vigenère cipher with estimated key lengths...'
      });
      
      results = await solveVigenere(ciphertext, detection.keyLengths);
      
    } else if (detection.likelyType === 'mono') {
      self.postMessage({
        status: 'solving',
        progress: 60,
        message: 'Attempting monoalphabetic substitution...'
      });
      
      results = await solveMonoSubstitution(ciphertext);
    }
    
    // Also try other methods as fallback
    self.postMessage({
      status: 'solving',
      progress: 80,
      message: 'Trying alternative methods...'
    });
    
    const caesarResults = detection.likelyType !== 'caesar' ? await solveCaesar(ciphertext) : [];
    const vigenereResults = detection.likelyType !== 'vigenere' ? 
      await solveVigenere(ciphertext, detection.keyLengths.length > 0 ? detection.keyLengths : [3, 4, 5]) : [];
    const monoResults = detection.likelyType !== 'mono' ? await solveMonoSubstitution(ciphertext) : [];
    
    // Combine all results and sort by confidence
    const allResults = [...results, ...caesarResults, ...vigenereResults, ...monoResults]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5); // Keep top 5 results
    
    return {
      status: 'completed',
      progress: 100,
      detection,
      results: allResults,
      message: `Analysis complete. Found ${allResults.length} potential solutions.`
    };
    
  } catch (error) {
    return {
      status: 'error',
      progress: 0,
      error: error instanceof Error ? error.message : 'Crypto analysis failed'
    };
  }
}

// Web Worker message handler
self.onmessage = async (event) => {
  const { type, ciphertext } = event.data;
  
  if (type === 'ANALYZE') {
    const result = await analyzeCipher(ciphertext);
    self.postMessage(result);
  }
};

export default null; // For TypeScript module