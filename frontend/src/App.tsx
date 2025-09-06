import { useState } from 'react'
import UploadDropzone from './components/UploadDropzone'
import CipherResults from './components/CipherResults'
import { CipherResult, DetectionResult } from './lib/crypto'
import * as pdfjsLib from 'pdfjs-dist'

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

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
  
  // Convert PDF to image
  const convertPDFToImage = async (file: File): Promise<Blob> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1); // Get first page
    
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    await page.render({
      canvasContext: ctx,
      viewport: viewport,
      canvas: canvas
    }).promise;
    
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob!);
      }, 'image/png');
    });
  };

  // Preprocess image for better OCR results
  const preprocessImage = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Convert to grayscale and apply threshold
    for (let i = 0; i < data.length; i += 4) {
      // Grayscale conversion
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      
      // Apply threshold for better text recognition
      const threshold = 128;
      const binaryValue = gray > threshold ? 255 : 0;
      
      data[i] = binaryValue;     // Red
      data[i + 1] = binaryValue; // Green
      data[i + 2] = binaryValue; // Blue
      // Alpha channel (i + 3) stays the same
    }
    
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  };

  const handleFilesSelected = async (files: File[]) => {
    const file = files[0]; // Process first file only for now
    console.log('File selected:', file?.name, file?.type, file?.size);
    
    if (!file || !(file.type.startsWith('image/') || file.type === 'application/pdf')) {
      alert('Please select an image file (PNG, JPG) or PDF');
      return;
    }

    // Reset state
    setOcrText('');
    setOcrConfidence(0);
    setDetection(undefined);
    setResults([]);

    try {
      let imageBlob: Blob;

      if (file.type === 'application/pdf') {
        // Handle PDF files
        setProcessing({
          phase: 'ocr',
          progress: 10,
          message: 'Converting PDF to image...'
        });
        
        console.log('Converting PDF to image...');
        imageBlob = await convertPDFToImage(file);
        console.log('PDF converted to image blob');
      } else {
        // Handle image files
        setProcessing({
          phase: 'ocr',
          progress: 10,
          message: 'Loading image...'
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        const img = new Image();
        const imageUrl = URL.createObjectURL(file);
        console.log('Image URL created:', imageUrl);

        imageBlob = await new Promise<Blob>((resolve, reject) => {
          img.onload = async () => {
            try {
              console.log('Image loaded successfully:', img.width, 'x', img.height);
              canvas.width = img.width;
              canvas.height = img.height;
              ctx.drawImage(img, 0, 0);
              
              // Preprocess for better OCR
              const preprocessedCanvas = preprocessImage(canvas);
              
              // Convert canvas to blob
              preprocessedCanvas.toBlob((blob) => {
                if (!blob) {
                  reject(new Error('Failed to preprocess image'));
                  return;
                }
                resolve(blob);
              }, 'image/png');
              
              // Clean up
              URL.revokeObjectURL(imageUrl);
            } catch (error) {
              reject(error);
            }
          };

          img.onerror = () => {
            URL.revokeObjectURL(imageUrl);
            reject(new Error('Failed to load image'));
          };

          img.src = imageUrl;
        });
      }

      // Step 2: OCR Processing with processed image
      setProcessing({
        phase: 'ocr',
        progress: 20,
        message: 'Starting OCR...'
      });

      const ocrWorker = new Worker(
        new URL('./workers/ocrWorker.ts', import.meta.url),
        { type: 'module' }
      );

      ocrWorker.postMessage({ type: 'OCR', imageBlob });

      ocrWorker.onmessage = async (event) => {
        const { status, progress, text, confidence, message, error } = event.data;
        console.log('OCR Worker Message:', { status, progress, text: text?.substring(0, 50), confidence, message, error });

        if (status === 'processing') {
          setProcessing({
            phase: 'ocr',
            progress,
            message: message || 'Processing OCR...'
          });
        } else if (status === 'completed') {
          console.log('OCR Completed. Text length:', text?.length, 'Confidence:', confidence);
          setOcrText(text || '');
          setOcrConfidence(confidence || 0);
          
          // Persist OCR results
          await persistOCRResults(file.name, text, confidence);
          
          ocrWorker.terminate();

          // Step 3: Crypto Analysis
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
        } else if (status === 'error') {
          console.error('OCR Error:', error);
          setProcessing({
            phase: 'idle',
            progress: 0,
            message: `OCR failed: ${error}`
          });
          ocrWorker.terminate();
        }
      };

      ocrWorker.onerror = (error) => {
        console.error('OCR Worker Error:', error);
        setProcessing({
          phase: 'idle',
          progress: 0,
          message: 'OCR worker failed to start'
        });
      };

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
                  Upload images containing ciphertext for automatic OCR and cryptographic analysis
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