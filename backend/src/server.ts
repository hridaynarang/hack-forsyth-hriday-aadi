import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import vision from '@google-cloud/vision'
import OpenAI from 'openai'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configure dotenv to look in the backend directory
dotenv.config({ path: path.join(__dirname, '../.env') })

import { supabase } from './supabase.js'

// Initialize Google Cloud Vision client
const visionClient = new vision.ImageAnnotatorClient({
  apiKey: process.env.GOOGLE_VISION_API_KEY
})

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const app = express()
const port = process.env.PORT || 8080

// Middleware
app.use(cors())
app.use(express.json())

// Serve static files from frontend dist
const frontendDistPath = path.join(__dirname, '../../frontend/dist')
app.use(express.static(frontendDistPath))

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
})

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Vision API route for text extraction
app.post('/api/vision', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' })
    }

    const { buffer, mimetype } = req.file

    // For PDFs, we need to convert to image first (simplified approach)
    if (mimetype === 'application/pdf') {
      return res.status(400).json({ 
        error: 'PDF support requires additional processing. Please upload an image instead.' 
      })
    }

    // Call Google Vision API for text detection
    const [result] = await visionClient.textDetection({
      image: {
        content: buffer
      }
    })

    const detections = result.textAnnotations || []
    const text = detections.length > 0 ? detections[0].description || '' : ''
    
    // Calculate confidence (average of all detection confidences)
    const confidence = detections.length > 0 
      ? detections.reduce((sum, det) => sum + (det.confidence || 0.9), 0) / detections.length
      : 0

    console.log('Vision API result:', { textLength: text.length, confidence })

    res.json({
      success: true,
      text: text.trim(),
      confidence,
      detectionCount: detections.length
    })

  } catch (error) {
    console.error('Vision API error:', error)
    res.status(500).json({ 
      error: 'Failed to process image with Vision API',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// Batches route
app.post('/api/batches', (req, res) => {
  const { name } = req.body
  
  if (!name) {
    return res.status(400).json({ error: 'Name is required' })
  }
  
  res.json({ name })
})

// Documents route (multipart)
app.post('/api/documents', upload.array('files'), (req, res) => {
  const files = req.files as Express.Multer.File[]
  
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No files provided' })
  }
  
  const filenames = files.map(file => file.originalname)
  res.json({ filenames })
})

// OCR results persistence route
app.post('/api/ocr', async (req, res) => {
  try {
    const { filename, text, confidence } = req.body
    
    if (!filename || !text) {
      return res.status(400).json({ error: 'Filename and text are required' })
    }
    
    try {
      const { data, error } = await supabase
        .from('documents')
        .insert([{
          filename,
          ocr_text: text,
          ocr_confidence: confidence || 0,
          status: 'ocr_completed'
        }])
        .select()
      
      if (error) {
        console.error('Supabase OCR insert error:', error)
        // Continue without database - return success anyway
        return res.json({ success: true, warning: 'Database unavailable, results not persisted' })
      }
      
      res.json({ success: true, document: data[0] })
    } catch (dbError) {
      console.error('Database connection failed:', dbError)
      // Return success even if database fails - core functionality still works
      res.json({ success: true, warning: 'Database unavailable, results not persisted' })
    }
  } catch (error) {
    console.error('OCR endpoint error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Cipher analysis results persistence route
app.post('/api/analyze', async (req, res) => {
  try {
    const { ciphertext, detection, results } = req.body
    
    if (!ciphertext || !results) {
      return res.status(400).json({ error: 'Ciphertext and results are required' })
    }
    
    // Store each solution result
    const solutions = []
    
    for (const result of results.slice(0, 5)) { // Store top 5 results
      try {
        const { data, error } = await supabase
          .from('solutions')
          .insert([{
            ciphertext,
            type: result.type,
            key: result.key || null,
            shift: result.shift || null,
            mapping_json: result.mapping || null,
            plaintext: result.plaintext,
            ngram_score: result.ngramScore,
            confidence: result.confidence,
            formula: result.formula,
            detection_ic: detection?.ic || null,
            detection_type: detection?.likelyType || null,
            key_lengths: detection?.keyLengths || null
          }])
          .select()
        
        if (error) {
          console.error('Supabase solution insert error:', error)
        } else if (data && data[0]) {
          solutions.push(data[0])
        }
      } catch (dbError) {
        console.error('Database connection failed for solution:', dbError)
        // Continue with next result
      }
    }
    
    // Always return success, even if database fails - crypto analysis still works
    res.json({ success: true, solutions, warning: solutions.length === 0 ? 'Database unavailable, results not persisted' : undefined })
  } catch (error) {
    console.error('Analysis endpoint error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// LLM ranking endpoint - rank decryption candidates by coherence
app.post('/api/rank-decryptions', async (req, res) => {
  try {
    const { candidates, originalCipher } = req.body
    
    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
      return res.status(400).json({ error: 'No candidates provided' })
    }
    
    if (!process.env.OPENAI_API_KEY) {
      // Fallback: return candidates sorted by existing ngramScore if OpenAI unavailable
      const sortedCandidates = candidates
        .sort((a, b) => (b.ngramScore || 0) - (a.ngramScore || 0))
        .slice(0, 3)
      
      return res.json({
        rankedCandidates: sortedCandidates,
        usedLLM: false,
        warning: 'OpenAI API key not configured, using fallback ranking'
      })
    }
    
    // Log candidate details for debugging
    console.log(`Received ${candidates.length} candidates for LLM ranking:`)
    candidates.forEach((c, i) => {
      console.log(`${i + 1}. [${c.type.toUpperCase()}] Length: ${c.plaintext?.length || 0}, Preview: "${c.plaintext?.substring(0, 30) || 'N/A'}..."`)
    })
    
    // Prepare prompt for OpenAI - show more of each plaintext
    const candidateTexts = candidates.map((c, i) => 
      `${i + 1}. [${c.type.toUpperCase()}] ${c.plaintext || 'NO PLAINTEXT'}${c.plaintext && c.plaintext.length > 300 ? '\n   (truncated at 300 chars)' : ''}`
    ).join('\n\n')
    
    const prompt = `You are a cryptanalyst evaluating decrypted cipher texts. Below are several decryption attempts of the same historical cipher. Evaluate them for:

1. Grammatical correctness and natural language flow
2. Historical plausibility (1940s military/intelligence context)
3. Coherent meaning and logical content
4. Proper English vocabulary and structure

Original cipher snippet: ${originalCipher.substring(0, 100)}${originalCipher.length > 100 ? '...' : ''}

Decryption candidates:
${candidateTexts}

Return ONLY a JSON object with this exact format:
{
  "rankings": [
    {
      "candidate": 1,
      "score": 0.95,
      "reasoning": "Clear, grammatically correct military dispatch with proper structure"
    },
    {
      "candidate": 2,
      "score": 0.72,
      "reasoning": "Mostly coherent but some awkward phrasing"
    }
  ]
}

Rank ALL candidates from most to least likely. Score from 0.0 to 1.0.`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 1500
    })
    
    const responseText = completion.choices[0]?.message?.content
    if (!responseText) {
      throw new Error('No response from OpenAI')
    }
    
    // Parse OpenAI response
    const llmResult = JSON.parse(responseText.trim())
    
    // Map LLM rankings back to original candidates
    const rankedCandidates = llmResult.rankings
      .map(ranking => ({
        ...candidates[ranking.candidate - 1],
        llmScore: ranking.score,
        llmReasoning: ranking.reasoning,
        confidence: Math.max(candidates[ranking.candidate - 1].confidence, ranking.score)
      }))
      .slice(0, 3) // Top 3
    
    res.json({
      rankedCandidates,
      usedLLM: true,
      model: "gpt-4o-mini"
    })
    
  } catch (error) {
    console.error('LLM ranking error:', error)
    
    // Fallback to original scoring on error
    const fallbackCandidates = req.body.candidates
      ?.sort((a, b) => (b.ngramScore || 0) - (a.ngramScore || 0))
      ?.slice(0, 3) || []
    
    res.json({
      rankedCandidates: fallbackCandidates,
      usedLLM: false,
      error: error.message,
      warning: 'LLM ranking failed, using fallback scoring'
    })
  }
})

// Catch-all handler: send back frontend's index.html file for SPA routing
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDistPath, 'index.html'))
})

app.listen(port, () => {
  console.log(`Server running on port ${port}`)
  console.log(`Frontend available at http://localhost:${port}`)
})