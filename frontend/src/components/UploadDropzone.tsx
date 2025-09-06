import React, { useCallback, useState } from 'react'
import { Upload } from 'lucide-react'

interface UploadDropzoneProps {
  onFilesSelected: (files: File[]) => void
  accept?: string
  multiple?: boolean
}

export default function UploadDropzone({ 
  onFilesSelected, 
  accept = "image/*,.pdf", 
  multiple = true 
}: UploadDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      onFilesSelected(files)
    }
  }, [onFilesSelected])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      onFilesSelected(files)
    }
  }, [onFilesSelected])

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        isDragOver
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-300 hover:border-gray-400'
      }`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <Upload className="mx-auto h-12 w-12 text-gray-400" />
      <p className="mt-4 text-sm text-gray-600">
        <label htmlFor="file-upload" className="cursor-pointer font-medium text-blue-600 hover:text-blue-500">
          Click to upload
        </label>
        {' '}or drag and drop
      </p>
      <p className="text-xs text-gray-500">
        PNG, JPG, PDF files
      </p>
      <input
        id="file-upload"
        type="file"
        className="sr-only"
        accept={accept}
        multiple={multiple}
        onChange={handleFileInput}
      />
    </div>
  )
}