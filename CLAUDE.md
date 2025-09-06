# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Development Commands

```bash
# RECOMMENDED: Run everything on single port (backend serves frontend)
npm run dev:single  # http://localhost:8080

# Alternative: Run frontend and backend separately (development only)
npm run dev         # Frontend: http://localhost:5173, Backend: http://localhost:8080

# Production build and start (single port)
npm run start       # http://localhost:8080

# Build for production
npm run build

# Lint frontend code
cd frontend && npm run lint

# Install all dependencies
npm run install:all
```

**For demos and production, use `npm run dev:single` or `npm run start` to serve everything from port 8080.**

## Project Overview

**CipherCrack** is an AI-powered document analysis and cipher breaking tool that turns scanned historical cipher documents into decrypted plaintext. The application features:

- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Backend**: Express + TypeScript + Google Vision API + Supabase + OpenAI
- **Architecture**: Monorepo with workspaces, Web Workers for crypto processing
- **Database**: Supabase (Postgres + Storage)
- **AI Integration**: OpenAI GPT-4o-mini for intelligent ranking of decryption results

**Judging goals**: 🏆 Best UI/UX · 🧠 Most Advanced Coding · ✨ Most Creative

## Environment Setup

Required environment variables:

**Frontend (.env):**
```
VITE_SUPABASE_URL=https://grwktwsicmiqssemvcah.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

**Backend (.env):**
```
PORT=8080
SUPABASE_URL=https://grwktwsicmiqssemvcah.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
GOOGLE_VISION_API_KEY=your_google_vision_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

## Code Architecture

**Frontend Structure:**
- `/src/components/` - React components (UploadDropzone, CipherResults)
- `/src/lib/` - Utilities (crypto.ts for cipher algorithms, supabase.ts)
- `/src/workers/` - Web Workers (cryptoWorker.ts for background crypto processing)
- Main app flow: Upload → OCR via Google Vision → Crypto analysis → LLM ranking → Results display

**Backend Structure:**
- `/src/server.ts` - Express server with Vision API + OpenAI integration
- `/src/supabase.ts` - Supabase client configuration
- Key routes: `/api/vision` for OCR, `/api/rank-decryptions` for LLM ranking, `/api/health` for health checks

**Key Patterns:**
- Web Workers handle heavy crypto computations to keep UI responsive
- TypeScript interfaces define data structures (CipherResult, DetectionResult)
- Progress tracking through state management for long-running operations
- LLM integration provides intelligent ranking of decryption candidates
- Fallback scoring ensures functionality without OpenAI API key

---

## Development Guidelines for Claude Code

- **You are coding inside a real repo.** Prefer incremental, working commits over huge rewrites.
- **Always show a plan first** (bullet list of changes & files). Then implement in small PR-sized chunks.
- **Never hallucinate plaintext.** Only crypto solvers determine plaintext; RAG can suggest *cribs* and *rank candidates*, but must **not alter** the decrypted text automatically.
- **Determinism matters**: use seeded randomness for simulated annealing; ensure reproducible results for the demo.
- **Ask only blocking questions**. If a detail is ambiguous but doesn’t block progress, make a reasonable default and note it in `TODO:`.
- **Performance**: move heavy compute off the UI thread (Web Workers). Keep the UI snappy at 60fps.
- **Security**: do not exfiltrate user data. If Cloud OCR is disabled, keep everything local.
- **Accessibility**: keyboard navigation, high-contrast theme, reduced motion setting.

---

## 1) Product Overview

**CipherCrack** lets users:  
1) Upload images (JPG/PNG/PDF) of old ciphertext documents.  
2) OCR + preprocess to extract text.  
3) Auto-detect cipher family (Caesar / monoalphabetic substitution / Vigenère).  
4) Run parallel solvers (IC/Friedman/Kasiski + n‑gram scoring + hill-climb/SA).  
5) View top candidates with confidence & **live explainers** (IC gauge, frequency bars, Kasiski repeats, annealing chart).  
6) Use **RAG** to propose crib chips (likely words/phrases) and **rank candidate plaintexts** by corpus fit (never auto-edit).  
7) Lock mappings / apply cribs interactively; re-solve instantly.  
8) Export a one‑page **Operations Brief** PDF (cipher, key/mapping, confidence, rationale, citations).

---

## 2) Tech Stack

- **Frontend**: React + Vite + TypeScript + Tailwind (shadcn/ui optional).  
- **Workers**: Web Workers for crypto, OCR preprocess, and RAG retrieval. OpenCV.js (WASM) for deskew/threshold (optional if time).  
- **Backend**: Node + Express + TypeScript (used mainly for persistence and PDF export).  
- **Database/Storage**: **Supabase** (Postgres + Storage bucket).  
- **OCR**: `tesseract.js` (local, default). Optional Cloud OCR mode through backend (Google Vision / AWS Textract).  
- **RAG**: Local **MiniSearch** (BM25) over bundled JSON corpus; optional tiny precomputed embeddings later.
- **Testing**: Vitest (FE), Jest (BE), simple crypto unit tests.  
- **Build/Deploy**: Vite for FE; Node on Render/Fly for BE; Supabase hosted DB & Storage.

---

## 3) Repository Structure (target)

```
/frontend
  /public
    /corpus          # RAG JSONs (lexicon, telegrams, wordlists) + prebuilt index (optional)
    /ngrams          # quadgrams.json (log-prob table)
  /src
    /components
      IcGauge.tsx
      FreqBars.tsx
      MappingMatrix.tsx
      CandidateTabs.tsx
      AnnealingChart.tsx
      KasiskiVisualizer.tsx
      Workbench.tsx
      UploadDropzone.tsx
    /features
      batches/
      documents/
      rag/
      ocr/
      export/
    /hooks
      useOcr.ts
      usePreprocess.ts
      useCribs.ts
    /lib
      supabase.ts
      pdf.ts
      utils.ts
    /workers
      cryptoWorker.ts
      preprocessWorker.ts
      ragWorker.ts
    /styles
      index.css
    main.tsx
    App.tsx

/backend
  /src
    server.ts
    routes/
      batches.ts
      documents.ts
      ocr.ts         # if cloud mode is used
      analyze.ts
      rag.ts
      export.ts
    supabase.ts
    pdf/
      makeBrief.ts
  prisma/
    schema.prisma

/packages
  /crypto           # shared pure TS modules: IC, Kasiski, ngrams, solvers
  /rag              # shared retrieval utilities
```

---

## 4) Environment & Config

- **Frontend `.env`**  
  - `VITE_SUPABASE_URL`  
  - `VITE_SUPABASE_ANON_KEY`  
  - `VITE_ENABLE_CLOUD_OCR=false`

- **Backend `.env`**  
  - `PORT=8080`  
  - `SUPABASE_URL`  
  - `SUPABASE_SERVICE_ROLE_KEY`  
  - `GOOGLE_APPLICATION_CREDENTIALS` (if using Vision) / `AWS_*` (if Textract)

- **Supabase**  
  - Bucket: `cipher-images`  
  - Tables: `batches`, `documents`, `solutions` (see schema below)

---

## 5) Database Schema (Supabase / Postgres)

```sql
create table if not exists batches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references batches(id) on delete cascade,
  filename text not null,
  image_url text not null,
  ocr_text text,
  ocr_confidence float,
  cipher_type text,
  status text not null default 'uploaded',
  created_at timestamptz default now()
);

create table if not exists solutions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  type text not null,          -- caesar | mono | vigenere
  key text,                    -- vigenere key if any
  mapping_json jsonb,          -- mono substitution mapping
  plaintext text not null,
  ngram_score float not null,
  confidence float not null,
  created_at timestamptz default now()
);
```

> **Indexes**: add btree indexes on `document_id`, `batch_id` for joins.  
> **RLS**: for hackathon, can be disabled; otherwise owner-based policies.

---

## 6) API Contract (Backend)

- `POST /api/batches` → `{ name }` → `{ batchId }`
- `POST /api/documents` (multipart) → `{ batchId, files[] }` → `{ docIds: [] }` (upload to Supabase Storage and insert rows)
- `POST /api/ocr` → `{ docId, text, confidence }` → persists OCR result (when OCR runs in FE)
- `POST /api/analyze` → `{ docId, cipherGuess?, locks?, cribs? }` → stores top candidates/solutions
- `POST /api/analyze/batch` → `{ batchId, locks?, cribs? }` → shared-key inference (concat → solve → project)
- `POST /api/refine` → `{ docId, locks, cribs }` → recompute for this doc and persist
- `GET  /api/documents/:id` → document + solutions
- `GET  /api/rag/cribs` → crib chips (by domain/category; local JSON or indexed corpus)
- `POST /api/rag/rank` → rank candidate plaintexts vs corpus; return scores + supporting snippets
- `GET  /api/rag/glossary?term=…` → short definition + citation
- `POST /api/export/brief` → `{ batchId | docId }` → PDF buffer (operations brief)

All routes validate payloads with Zod and return typed shapes.

---

## 7) Core Algorithms (Crypto)

### 7.1 Normalization
- Uppercase A–Z, strip punctuation (keep spaces), collapse whitespace. Return both **raw** and **normalized**.

### 7.2 Detection
- **Index of Coincidence (IC)**:  
  - ≈0.066 → mono (incl. Caesar)  
  - ≈0.038–0.045 → poly (e.g., Vigenère)
- **Friedman test**: estimate key length for poly.  
- **Kasiski**: find repeating trigrams, compute distance GCDs → candidate key lengths.  
- Output: `{ cipherGuess, candidates: [{type, keyLen[]?, score}], ic }`

### 7.3 Solvers (run in parallel)
- **Caesar**: test 26 shifts; n‑gram score → best.  
- **Monoalphabetic**: initialize mapping with frequency (ETAOIN); **hill‑climb / simulated annealing** with pair swaps; n‑gram scoring; accepts **locked mappings**; **crib bonus** (if plaintext contains crib tokens).  
- **Vigenère**: for each key length `k` from Kasiski/Friedman, split into columns; solve each as Caesar; assemble key; score; accept **crib constraints** (restrict letter choices for positions).  
- **Ensemble**: emit top 3 candidates across solvers with normalized confidence (softmax over n‑gram scores, weighted by OCR conf and stability).

### 7.4 Confidence
`finalConfidence = 0.6*solverScoreNorm + 0.25*ocrConf + 0.15*stability`  
- **Stability**: small mapping/key perturbations should drop score; if not, lower confidence.  
- Report confidence per doc and per batch (if shared key).

---

## 8) RAG (Retrieval‑Augmented Guidance)

- **Corpus** (bundled offline JSON):  
  - `lexicon.json` (domain word/phrase lists),  
  - `telegrams.json` (short period dispatches),  
  - `wordlists.json` (crib categories).  
- **Index**: MiniSearch (BM25) built at app start in a worker; optional prebuilt JSON index to avoid build time.
- **Capabilities**:  
  1) **Crib discovery**: propose likely words/phrases → UI chips.  
  2) **Candidate ranking**: re‑rank 2–3 solver candidates by corpus similarity; show “support cards” with snippets.  
  3) **Glossary**: definitions + short citations.  
- **Guardrails**: RAG **never edits plaintext**; suggestions are labeled and optional.

---

## 9) OCR Pipeline

- **Preprocess** (OpenCV.js in `preprocessWorker.ts`): grayscale → deskew (Hough) → adaptive threshold → denoise → (optional) CLAHE.  
- **OCR**: `tesseract.js` (default) in a worker.  
- **Cloud mode**: simple backend proxy to Vision/Textract (behind env toggle).  
- **Low confidence** (<0.6): allow manual correction or concatenating multiple pages before solve.

---

## 10) Frontend UX (Workbench)

- **Layout**: three main panes + explainers + batch sidebar.  
  - Left: Image viewer (zoom/pan).  
  - Center: Cipher text (monospace), **IC gauge**, **frequency bars**, **Kasiski visualizer**.  
  - Right: **Decrypted candidates tabs** with typewriter reveal; **confidence badge**; actions.  
  - Bottom: **Mapping Matrix** (26×26) with drag‑to‑map and lock icons; **Annealing Chart** (live).  
  - Sidebar: batch docs list (confidence sparklines), shared‑key toggle.  
  - Drawer: **Crib chips** (RAG), grouped by Time/Places/Actions.  
- **Shortcuts**: `[` `]` next/prev candidate; `L` lock mapping; `R` re‑solve; `G` toggle gauges; `T` typewriter on/off.  
- **Accessibility**: WCAG contrast, keyboard reachability, reduced‑motion toggle, alt text for charts.

---

## 11) Exports

- **Operations Brief PDF** (client or server):  
  - Batch/Doc name, date.  
  - Cipher type, key/mapping (table).  
  - Confidence meters.  
  - Decrypted excerpt (first 2–3 lines).  
  - Mini charts (IC gauge, frequency bars thumbnail).  
  - Analyst notes: which cribs/locks used.  
  - RAG support citations (if any).

- **JSON bundle**: original image URLs, OCR text, cipher guess, solutions, mapping/key, confidence, and actions log.

---

## 12) Development Milestones (Claude: follow sequentially)

### Milestone A — Scaffolding (60–90 min)
- Create FE (Vite React TS + Tailwind).  
- Build **UploadDropzone** → routes for creating **Batch** and **Documents** (Supabase Storage + rows).  
- Implement **preprocessWorker** + **useOcr** hook (tesseract.js).  
- Persist OCR to backend `/api/ocr`.

### Milestone B — Crypto Engine (60–90 min)
- Implement **cryptoWorker** with: normalize, IC, Kasiski, quadgram scorer, Caesar, Vigenère, mono SA (basic first).  
- Stream progress; show top 3 candidates in **CandidateTabs**.  
- Add **IcGauge**, **FreqBars**, **KasiskiVisualizer** placeholders.  
- Save solutions via `/api/analyze`.

### Milestone C — UX Polish + RAG (60 min)
- **MappingMatrix** (drag/lock) → re-solve with constraints.  
- **RAG crib chips** via `ragWorker` on local corpus; apply crib constraints → re-solve.  
- **Operations Brief** export (client-side pdf).  
- Seed demo images and validate E2E flow.

**Stretch**: Batch shared‑key inference; AnnealingChart; Cloud OCR toggle; RAG candidate re‑rank & support cards.

---

## 13) Testing & Quality

- **Unit tests** (packages/crypto): IC, Kasiski (known examples), Caesar (golden tests), Vigenère (known key), mono hill‑climb recovers mapping ≥90% on sample.  
- **Smoke tests**: upload → OCR → detect → solve on seed data.  
- **Performance**: crypto in workers; target time < 2s for 1k‑char ciphertext on laptop.  
- **Telemetry (optional)**: simple console timing; no third‑party analytics for hackathon.

---

## 14) Demo Data & Seeding

- Create 10 intercepts (1–3 sentences).  
  - 5 **mono** (single mapping across all 5).  
  - 5 **Vigenère** (key like `RATIONS` across that batch).  
- Typeset with a typewriter font on paper texture; export PNG; optionally re‑photograph for realism.  
- Keep plaintext & keys for char/word accuracy metrics (shown as small badges).

---

## 15) Prompts (LLM post‑processor & RAG)

**Post‑processor (optional and constrained)**  
_System_: “You are a decryption post‑processor. Only fix spacing/casing and obvious OCR spelling errors. **Do not add, remove, or infer words.** If uncertain, leave text unchanged.”  
_User_:  
```
Cipher: VIGENERE
Key: RATIONS
Proposed plaintext:
"CONUOY AT DAWN EAST HRABOR STOP"
Tasks:
1) Fix spacing and spelling.
2) Keep meaning identical.
3) Return cleaned text and a 0–1 confidence.
Output JSON: { cleaned, confidence }
```

**RAG Crib Discovery**  
_System_: “Return likely words/phrases used in 1930s–1940s naval/army dispatches. Short uppercase tokens only.”  
_Output_: `["CONVOY","RENDEZVOUS","HARBOR","AT DAWN","SUPPLY","STOP"]`

**RAG Glossary**  
_System_: “Define the selected term in ≤2 sentences and cite 1 short snippet from the local corpus by title.”

---

## 16) Non‑Goals / Out of Scope

- Breaking **machine ciphers** (e.g., Enigma) in real‑time.  
- Full handwriting OCR accuracy; we support it only if Cloud OCR is enabled.  
- Auto‑rewriting decrypted text; edits must be user‑approved.

---

## 17) Acceptance Criteria (per prize)

**Best UI/UX**  
- Tri‑pane workbench, smooth 60fps interactions, **MappingMatrix** drag‑to‑map, live charts, keyboard shortcuts, accessible theme, one‑click PDF brief.

**Most Advanced Coding**  
- Web Workers for crypto; Kasiski+Friedman; Vigenère & mono SA solvers; quadgram scoring; shared‑key batch inference; deterministic seeds; clean modular code.

**Most Creative**  
- RAG‑assisted crib suggestions & support cards; “alternate‑history” explanation (clearly labeled); compelling war‑room aesthetic and narrative.

---

## 18) How to Work (Claude Task Protocol)

1) **/plan** — Propose a short, bullet‑point plan for the next 30–60 minutes of work with file paths.  
2) **/implement** — Create/modify files, explaining diffs only when non‑obvious.  
3) **/run** — Provide exact commands to run FE/BE dev servers and any seed scripts.  
4) **/verify** — Outline manual test steps (upload → OCR → detect → solve).  
5) **/commit** — Suggest a conventional commit message (e.g., `feat(crypto): add vigenere solver with kasiski keylen`).

Keep PR‑sized chunks; don’t block on non‑critical polish. Leave `TODO:` notes inline when needed.

---

## 19) Quick Start Commands (for the human)

```bash
# Frontend
cd frontend && pnpm i && pnpm dev

# Backend
cd backend && pnpm i && pnpm dev
```

Ensure `.env` files are set and Supabase keys configured. Toggle Cloud OCR via `VITE_ENABLE_CLOUD_OCR`.

---

## 20) Final Demo Script (90 seconds)

1) Create batch → drop 5 scans.  
2) Watch **Preprocess → OCR → Detect**; IC gauge & Kasiski highlights appear.  
3) Click **Solve**; candidates stream in with typewriter reveal.  
4) Apply crib chip “AT DAWN”; mapping locks update; confidence jumps.  
5) Toggle **Shared Key**; all docs decode.  
6) Export **Operations Brief** PDF; show key, confidence, and charts.  
7) Close: “Hours to minutes — actionable intelligence that could have saved lives.”

---

*End of CLAUDE.md*
