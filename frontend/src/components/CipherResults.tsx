import React from 'react';
import { CipherResult, DetectionResult } from '../lib/crypto';

interface CipherResultsProps {
  detection?: DetectionResult;
  results: CipherResult[];
  ocrText?: string;
  ocrConfidence?: number;
}

const CipherResults: React.FC<CipherResultsProps> = ({ 
  detection, 
  results, 
  ocrText, 
  ocrConfidence 
}) => {
  if (!results.length && !detection) return null;

  const formatConfidence = (confidence: number) => {
    return `${Math.round(confidence * 100)}%`;
  };

  const formatKey = (result: CipherResult) => {
    if (result.type === 'caesar') {
      return `Shift: ${result.shift}`;
    } else if (result.type === 'vigenere') {
      return `Key: ${result.key}`;
    } else if (result.type === 'mono' && result.mapping) {
      const mappingStr = Object.entries(result.mapping)
        .slice(0, 6)
        .map(([cipher, plain]) => `${cipher}→${plain}`)
        .join(' ');
      return `Mapping: ${mappingStr}...`;
    }
    return 'N/A';
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-50';
    if (confidence >= 0.5) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <div className="space-y-6">
      {/* OCR Results */}
      {ocrText && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">OCR Results</h3>
          <div className="mb-2">
            <span className="text-sm text-gray-600">Confidence: </span>
            <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
              getConfidenceColor(ocrConfidence || 0)
            }`}>
              {formatConfidence(ocrConfidence || 0)}
            </span>
          </div>
          <div className="bg-white p-3 rounded border font-mono text-sm">
            {ocrText}
          </div>
        </div>
      )}

      {/* Cipher Detection */}
      {detection && (
        <div className="bg-blue-50 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Cipher Analysis</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="font-medium">Likely Type:</span>
              <div className="mt-1 text-blue-700 font-semibold uppercase">
                {detection.likelyType}
              </div>
            </div>
            <div>
              <span className="font-medium">Index of Coincidence:</span>
              <div className="mt-1 font-mono">
                {detection.ic.toFixed(4)}
              </div>
            </div>
            <div>
              <span className="font-medium">Key Lengths:</span>
              <div className="mt-1">
                {detection.keyLengths.join(', ') || 'N/A'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cipher Solutions */}
      {results.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Decryption Results</h3>
          
          {results.map((result, index) => (
            <div key={index} className="bg-white border rounded-lg p-4 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center space-x-3">
                  <span className="inline-block w-6 h-6 bg-blue-100 text-blue-800 rounded-full text-xs font-bold flex items-center justify-center">
                    {index + 1}
                  </span>
                  <div>
                    <h4 className="font-semibold text-gray-900 capitalize">
                      {result.type === 'mono' ? 'Monoalphabetic' : result.type} Cipher
                    </h4>
                    <p className="text-xs text-gray-500 font-mono">
                      {result.formula}
                    </p>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                    getConfidenceColor(result.confidence)
                  }`}>
                    {formatConfidence(result.confidence)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Score: {result.ngramScore.toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <span className="text-sm font-medium text-gray-700">Key/Mapping:</span>
                  <div className="mt-1 text-sm font-mono bg-gray-50 p-2 rounded">
                    {formatKey(result)}
                  </div>
                </div>

                <div>
                  <span className="text-sm font-medium text-gray-700">Decrypted Text:</span>
                  <div className="mt-1 bg-green-50 p-3 rounded border font-mono text-sm leading-relaxed">
                    {result.plaintext}
                  </div>
                </div>

                {result.type === 'mono' && result.mapping && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-gray-600 hover:text-gray-800">
                      View Full Substitution Mapping
                    </summary>
                    <div className="mt-2 bg-gray-50 p-3 rounded">
                      <div className="grid grid-cols-13 gap-1 font-mono text-xs">
                        {Object.entries(result.mapping).map(([cipher, plain]) => (
                          <div key={cipher} className="text-center">
                            <div className="text-red-600">{cipher}</div>
                            <div className="text-gray-400">↓</div>
                            <div className="text-green-600">{plain}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </details>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CipherResults;