import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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

// Catch-all handler: send back frontend's index.html file for SPA routing
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDistPath, 'index.html'))
})

app.listen(port, () => {
  console.log(`Server running on port ${port}`)
  console.log(`Frontend available at http://localhost:${port}`)
})