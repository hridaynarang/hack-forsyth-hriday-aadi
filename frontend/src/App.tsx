import { useState } from 'react'
import UploadDropzone from './components/UploadDropzone'
import CipherResults from './components/CipherResults'
import { CipherResult, DetectionResult } from './lib/crypto'

interface ProcessingState {
  phase: 'idle' | 'ocr' | 'crypto';
  progress: number;
  message: string;
}

function App() {
  const [processing, setProcessing] = useState<ProcessingState>({
    phase: 'idle',
    progress: 0,
    message: ''
  });
  const [ocrText, setOcrText] = useState<string>('');
  const [ocrConfidence, setOcrConfidence] = useState<number>(0);
  const [detection, setDetection] = useState<DetectionResult | undefined>();
  const [results, setResults] = useState<CipherResult[]>([]);
  
  // Extract text using Google Vision API
  const extractTextFromFile = async (file: File): Promise<{ text: string; confidence: number }> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/vision', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to extract text');
    }

    const result = await response.json();
    return {
      text: result.text || '',
      confidence: result.confidence || 0
    };
  };

  const handleFilesSelected = async (files: File[]) => {
    const file = files[0]; // Process first file only for now
    console.log('File selected:', file?.name, file?.type, file?.size);
    
    if (!file || !file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, GIF, etc.)');
      return;
    }

    // Reset state
    setOcrText('');
    setOcrConfidence(0);
    setDetection(undefined);
    setResults([]);

    try {
      // Step 1: Extract text using Google Vision API
      setProcessing({
        phase: 'ocr',
        progress: 20,
        message: 'Extracting text with Google Vision...'
      });

      console.log('Calling Google Vision API...');
      const { text, confidence } = await extractTextFromFile(file);
      
      console.log('Vision API completed. Text length:', text?.length, 'Confidence:', confidence);
      setOcrText(text || '');
      setOcrConfidence(confidence || 0);
      
      // Persist OCR results
      await persistOCRResults(file.name, text, confidence);

      // Step 2: Crypto Analysis
      if (text && text.trim()) {
        console.log('Starting crypto analysis with text:', text.trim().substring(0, 100));
        startCryptoAnalysis(text.trim());
      } else {
        console.log('No text detected, stopping process');
        setProcessing({
          phase: 'idle',
          progress: 100,
          message: 'No text detected in image'
        });
      }

    } catch (error) {
      console.error('Processing error:', error);
      setProcessing({
        phase: 'idle',
        progress: 0,
        message: error instanceof Error ? error.message : 'Processing failed'
      });
    }
  };

  const startCryptoAnalysis = (ciphertext: string) => {
    setProcessing({
      phase: 'crypto',
      progress: 0,
      message: 'Starting cipher analysis...'
    });

    const cryptoWorker = new Worker(
      new URL('./workers/cryptoWorker.ts', import.meta.url),
      { type: 'module' }
    );

    cryptoWorker.postMessage({ type: 'ANALYZE', ciphertext });

    cryptoWorker.onmessage = async (event) => {
      const { status, progress, detection, results, message, error } = event.data;
      console.log('Crypto Worker Message:', { status, progress, detection, results: results?.length, message, error });

      if (status === 'detecting' || status === 'solving') {
        setProcessing({
          phase: 'crypto',
          progress,
          message: message || 'Analyzing cipher...'
        });
        
        if (detection) {
          console.log('Detection results:', detection);
          setDetection(detection);
        }
      } else if (status === 'completed') {
        console.log('Crypto analysis completed:', { detection, resultsCount: results?.length });
        setDetection(detection);
        setResults(results || []);
        
        // Persist analysis results
        await persistAnalysisResults(ciphertext, detection, results);
        
        setProcessing({
          phase: 'idle',
          progress: 100,
          message: 'Analysis complete!'
        });
        
        cryptoWorker.terminate();
      } else if (status === 'error') {
        console.error('Crypto Analysis Error:', error);
        setProcessing({
          phase: 'idle',
          progress: 0,
          message: `Analysis failed: ${error}`
        });
        cryptoWorker.terminate();
      }
    };

    cryptoWorker.onerror = (error) => {
      console.error('Crypto Worker Error:', error);
      setProcessing({
        phase: 'idle',
        progress: 0,
        message: 'Crypto analysis worker failed'
      });
    };
  };

  const persistOCRResults = async (filename: string, text: string, confidence: number) => {
    try {
      await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          text,
          confidence
        })
      });
    } catch (error) {
      console.error('Failed to persist OCR results:', error);
    }
  };

  const persistAnalysisResults = async (
    ciphertext: string, 
    detection: DetectionResult, 
    results: CipherResult[]
  ) => {
    try {
      await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ciphertext,
          detection,
          results
        })
      });
    } catch (error) {
      console.error('Failed to persist analysis results:', error);
    }
  };

  // Test function with sample ciphertext
  const testWithSampleText = () => {
    const sampleCiphertext = "WKDW LV D VHFUHW PHVVDJH";
    console.log('Testing with sample ciphertext:', sampleCiphertext);
    setOcrText(sampleCiphertext);
    setOcrConfidence(1.0);
    startCryptoAnalysis(sampleCiphertext);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">
            CipherCrack Workbench
          </h1>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {processing.phase === 'idle' && !results.length ? (
            <div className="max-w-xl mx-auto">
              <div className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Upload Cipher Documents
                </h2>
                <p className="text-gray-600 text-sm">
                  Upload images containing ciphertext for Google Vision OCR and cryptographic analysis
                </p>
              </div>
              
              <UploadDropzone onFilesSelected={handleFilesSelected} />
              
              {/* Test Button */}
              <div className="mt-4 text-center">
                <button 
                  onClick={testWithSampleText}
                  className="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded"
                >
                  Test with Sample Caesar Cipher
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Processing Status */}
              {processing.phase !== 'idle' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-blue-900">
                      {processing.phase === 'ocr' ? 'OCR Processing' : 'Cipher Analysis'}
                    </h3>
                    <span className="text-sm text-blue-700 font-medium">
                      {processing.progress}%
                    </span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${processing.progress}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-blue-800">{processing.message}</p>
                </div>
              )}

              {/* Results */}
              <CipherResults 
                detection={detection}
                results={results}
                ocrText={ocrText}
                ocrConfidence={ocrConfidence}
              />

              {/* New Upload Button */}
              {processing.phase === 'idle' && (
                <div className="text-center pt-6">
                  <button 
                    onClick={() => {
                      setOcrText('');
                      setOcrConfidence(0);
                      setDetection(undefined);
                      setResults([]);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md font-medium"
                  >
                    Analyze Another Document
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App