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
    
    // Also try other methods as fallback with more comprehensive testing
    self.postMessage({
      status: 'solving',
      progress: 80,
      message: 'Trying all decryption methods comprehensively...'
    });
    
    // Always try all methods to get maximum candidates
    const caesarResults = await solveCaesar(ciphertext);
    const vigenereResults = await solveVigenere(ciphertext, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const monoResults = await solveMonoSubstitution(ciphertext);
    
    // Combine all results and deduplicate by plaintext
    const allResults = [...results, ...caesarResults, ...vigenereResults, ...monoResults];
    const uniqueResults: CipherResult[] = [];
    const seenPlaintexts = new Set<string>();
    
    for (const result of allResults) {
      const key = result.plaintext.substring(0, 100).toUpperCase().trim();
      if (!seenPlaintexts.has(key)) {
        seenPlaintexts.add(key);
        uniqueResults.push(result);
      }
    }
    
    // Sort by existing scores and keep more candidates for comprehensive LLM evaluation
    const candidatesForLLM = uniqueResults
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 15); // Increased from 10 to 15
    
    // Debug logging to verify complete plaintexts
    console.log('Candidates being sent to LLM:', candidatesForLLM.map(c => ({
      type: c.type,
      plaintext: c.plaintext.substring(0, 50) + (c.plaintext.length > 50 ? '...' : ''),
      fullLength: c.plaintext.length,
      confidence: c.confidence
    })));
    
    // Step 3: Send to LLM for intelligent ranking
    self.postMessage({
      status: 'solving',
      progress: 90,
      message: 'Getting AI evaluation of results...'
    });
    
    let finalResults = candidatesForLLM.slice(0, 3); // Fallback to top 3
    
    try {
      const response = await fetch('/api/rank-decryptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          candidates: candidatesForLLM,
          originalCipher: ciphertext
        }),
      });
      
      if (response.ok) {
        const rankingData = await response.json();
        finalResults = rankingData.rankedCandidates || candidatesForLLM.slice(0, 3);
        
        // Add LLM metadata to the final message
        const llmInfo = rankingData.usedLLM 
          ? `AI-ranked results using ${rankingData.model || 'LLM'}`
          : `Fallback ranking used${rankingData.warning ? ': ' + rankingData.warning : ''}`;
        
        return {
          status: 'completed',
          progress: 100,
          detection,
          results: finalResults,
          message: `Analysis complete. ${llmInfo}. Showing top ${finalResults.length} solutions.`
        };
      }
    } catch (error) {
      console.warn('LLM ranking failed, using fallback:', error);
    }
    
    return {
      status: 'completed',
      progress: 100,
      detection,
      results: finalResults,
      message: `Analysis complete. Found ${finalResults.length} potential solutions (fallback ranking).`
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