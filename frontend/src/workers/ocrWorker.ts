import Tesseract from 'tesseract.js';

export interface OCRProgress {
  status: 'processing' | 'completed' | 'error';
  progress: number;
  text?: string;
  confidence?: number;
  message?: string;
  error?: string;
}

// Main OCR processing function - now accepts preprocessed image data
async function performOCR(imageBlob: Blob): Promise<OCRProgress> {
  try {
    // Perform OCR with Tesseract.js directly on the preprocessed blob
    const result = await Tesseract.recognize(imageBlob, 'eng', {
      logger: (m) => {
        // Send progress updates
        if (m.status === 'recognizing text') {
          self.postMessage({
            status: 'processing',
            progress: Math.round(m.progress * 100),
            message: 'Recognizing text...'
          });
        }
      }
    });
    
    return {
      status: 'completed',
      progress: 100,
      text: result.data.text,
      confidence: result.data.confidence / 100,
      message: 'OCR completed successfully'
    };
    
  } catch (error) {
    return {
      status: 'error',
      progress: 0,
      error: error instanceof Error ? error.message : 'OCR failed'
    };
  }
}

// Web Worker message handler
self.onmessage = async (event) => {
  const { type, imageBlob } = event.data;
  
  if (type === 'OCR') {
    const result = await performOCR(imageBlob);
    self.postMessage(result);
  }
};

export default null; // For TypeScript module