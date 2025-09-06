import UploadDropzone from './components/UploadDropzone'

function App() {
  const handleFilesSelected = (files: File[]) => {
    console.log('Files selected:', files.map(f => f.name))
  }

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
          <div className="max-w-xl mx-auto">
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Upload Cipher Documents
              </h2>
              <p className="text-gray-600 text-sm">
                Upload images or PDFs containing ciphertext for analysis
              </p>
            </div>
            
            <UploadDropzone onFilesSelected={handleFilesSelected} />
          </div>
        </div>
      </main>
    </div>
  )
}

export default App