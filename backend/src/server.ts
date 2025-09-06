import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configure dotenv to look in the backend directory
dotenv.config({ path: path.join(__dirname, '../.env') })

import { supabase } from './supabase.js'

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
      return res.status(500).json({ error: 'Failed to save OCR results' })
    }
    
    res.json({ success: true, document: data[0] })
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
    }
    
    res.json({ success: true, solutions })
  } catch (error) {
    console.error('Analysis endpoint error:', error)
    res.status(500).json({ error: 'Internal server error' })
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