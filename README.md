# Multi-Document Intelligence Workbench

A small full-stack TypeScript application that lets a user upload several documents, give a natural-language analysis instruction, and receive a structured, provenance-preserving comparison of the documents.

- **Frontend**: React + Vite + TypeScript
- **Backend**: Node.js + Express + TypeScript
- **Database**: SQLite (via `better-sqlite3`) — satisfies the "relational database" requirement with zero service setup
- **Document processing**: `pdf-parse` (PDF), `csv-parse` (CSV), native text reader (TXT/MD)
- **AI**: deterministic **mock LLM** analyzer (no external key required; the brief explicitly allows a "mocked AI implementation")

---

## Quick start

Two terminals. First time:

```bash
# backend
cd backend
cp .env.example .env
npm install
npm run dev          # http://localhost:4000

# frontend (second terminal)
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Open `http://localhost:5173`. Upload any two files from `samples/` (e.g. `application-form.txt` and `supporting-statement.txt`), type an instruction such as *"Compare the application form and the supporting statement and flag discrepancies"*, and click **Analyse**.

### Running the test

```bash
cd backend
npm test
```

---

## Architecture

```
┌──────────────┐    multipart POST     ┌──────────────────────────────┐
│  React SPA   │ ───────────────────►  │  Express API                 │
│  (Vite 5173) │    JSON analysis      │  /api/documents              │
│              │ ◄───────────────────  │  /api/analyses               │
└──────────────┘                       │                              │
                                       │  ┌────────────────────────┐  │
                                       │  │ Extractor pipeline     │  │
                                       │  │  pdf-parse / csv-parse │  │
                                       │  │  / fs-utf8             │  │
                                       │  └────────────────────────┘  │
                                       │  ┌────────────────────────┐  │
                                       │  │ Mock analyzer          │  │
                                       │  │  per-document rules →  │  │
                                       │  │  comparison, diffs,    │  │
                                       │  │  missing-info report   │  │
                                       │  └────────────────────────┘  │
                                       │  ┌────────────────────────┐  │
                                       │  │ SQLite (better-sqlite3)│  │
                                       │  │  documents / analyses  │  │
                                       │  └────────────────────────┘  │
                                       └──────────────────────────────┘
```

### Request flow

1. **Upload** — `POST /api/documents` accepts a `multipart/form-data` payload with one or more files under the `files` field. `multer` enforces per-file size and count limits; `fileFilter` rejects anything outside PDF/TXT/CSV before it hits disk.
2. **Extraction** — each file is dispatched to the correct extractor based on extension *and* MIME type. On failure the document is stored with `extraction_status = failed` and the error is surfaced to the UI rather than silently dropped.
3. **Analysis** — `POST /api/analyses` validates the body with `zod`, loads the chosen documents from SQLite, and runs the analyzer. The analyzer processes each document **independently** (its own regex pass), then builds the comparison, discrepancies, and missing-info reports across the per-document maps. Each finding carries the originating `documentId` + `documentName`.
4. **Persistence** — the full structured result is stored as JSON in the `analyses` table so it can be retrieved later via `GET /api/analyses/:id`.

### Why the analyzer is not a single merged prompt

The brief is explicit: *"The candidate should not simply merge all documents into one unstructured prompt."* The mock analyzer is designed to make that violation structurally impossible — documents are only ever processed one at a time, and the cross-document reasoning (discrepancies, missing fields) operates on the typed per-document maps, not on concatenated text. Swapping the mock for a real LLM is a drop-in: feed each document to the model separately, then run the same cross-document aggregator over the per-document JSON responses.

### Fact vs. interpretation

The output deliberately separates the two:

| Section | Source | How it is produced |
| --- | --- | --- |
| **Extracted facts** | `source: "extracted"` | Deterministic regex / label matches against a single document's text. Values are verbatim. |
| **Comparison table** | `source: "extracted"` | A pivot of the per-document facts. No inference — empty cells are rendered as `—`. |
| **Discrepancies** | `source: "interpretation"` | AI-generated: flags fields whose normalised values differ across documents. |
| **Missing information** | `source: "interpretation"` | AI-generated: flags fields present in some documents but not others. |

The UI tags each section with a `verbatim` or `interpretation` badge and shows a disclaimer. The frontend's **Copy output** button produces a Markdown rendering of the same structure.

---

## Project layout

```
.
├── backend/
│   ├── src/
│   │   ├── index.ts                 Express bootstrap + createApp()
│   │   ├── db.ts                    SQLite schema + typed accessors
│   │   ├── types.ts                 Shared result shapes
│   │   ├── routes/
│   │   │   ├── documents.ts         Upload / list
│   │   │   └── analyses.ts          Create / fetch analyses
│   │   └── services/
│   │       ├── analyzer.ts          Mock LLM — per-doc extraction + cross-doc aggregation
│   │       ├── validation.ts        zod schemas
│   │       └── extractors/
│   │           ├── index.ts         Format detection + dispatch
│   │           ├── pdf.ts, text.ts, csv.ts
│   ├── tests/analyzer.test.ts       Vitest — provenance + discrepancy + graceful failure
│   └── .env.example
├── frontend/
│   └── src/
│       ├── App.tsx                  Page composition + state
│       ├── api.ts                   Fetch wrappers with structured errors
│       └── components/
│           ├── FileUploader.tsx
│           ├── DocumentList.tsx
│           ├── PromptBox.tsx
│           └── ResultsView.tsx      Table + discrepancies + facts + copy-to-clipboard
├── samples/
│   ├── application-form.txt
│   ├── supporting-statement.txt
│   └── financial-summary.csv
└── README.md
```

### Database schema

Created on first boot by `initDb()` in [backend/src/db.ts](backend/src/db.ts):

```sql
CREATE TABLE documents (
  id                 TEXT PRIMARY KEY,
  original_name      TEXT NOT NULL,
  format             TEXT NOT NULL,
  size_bytes         INTEGER NOT NULL,
  storage_path       TEXT NOT NULL,
  extracted_text     TEXT NOT NULL,
  extraction_status  TEXT NOT NULL,       -- 'ok' | 'failed'
  extraction_error   TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE analyses (
  id                 TEXT PRIMARY KEY,
  prompt             TEXT NOT NULL,
  result_json        TEXT NOT NULL,
  document_ids_json  TEXT NOT NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## Assumptions

- The reviewer runs the app locally; auth is out of scope for a 60-minute exercise.
- Supported formats are **PDF, TXT/MD, CSV**. The brief requires "at least two"; shipping three covers the common cases.
- Documents are assumed to be modest in size (default max 10 MB per file, configurable via `MAX_UPLOAD_BYTES`). Very large PDFs are truncated to 50 000 characters inside the analyzer to keep responses bounded.
- A "discrepancy" is defined as the same labelled field (e.g. `Annual Revenue`) resolving to two or more values that differ after whitespace/case normalisation.
- "Mocked AI implementation" is explicitly permitted by the brief. The mock produces deterministic, structured, JSON output — which is in many ways *easier* to reason about than real-LLM output for a reviewer.

---

## Completed functionality

- [x] Multiple-file upload (drag-friendly native input).
- [x] Three supported formats: PDF, TXT/MD, CSV.
- [x] Per-document text extraction with graceful failure reporting.
- [x] Free-form user instruction, with example prompts.
- [x] Per-document independent analysis **plus** cross-document aggregation.
- [x] Output includes: summary, structured comparison table, discrepancy list, missing-info report, extracted-facts list.
- [x] Every finding carries its originating `documentId` + `documentName`.
- [x] Copy-to-clipboard produces a Markdown-formatted bundle.
- [x] Invalid or unreadable documents are flagged in the UI and excluded from the comparison.
- [x] Backend validates request bodies with `zod` and returns structured 4xx errors.
- [x] File-type gate at both extension *and* MIME layers.
- [x] Vitest suite covering the provenance guarantee, the discrepancy detector, and the graceful-failure branch.

---

## Known limitations

- **No OCR for scanned PDFs or images.** `pdf-parse` only reads text layers. Adding `tesseract.js` would plug straight into `services/extractors/`.
- The mock analyzer is **pattern-based**, so it only detects fields that match its labelled-value regexes (Company Name, Address, Email, Phone, Licence Number, Registration Number, Annual Revenue, Net Profit, Date of Incorporation, plus generic money/date sweeps). Swapping in a real LLM would broaden coverage.
- No pagination on the document list — acceptable for a demo, not for production volumes.
- Uploaded files are kept on disk for the session; there is no retention policy or cleanup job.
- No auth, no rate limiting, no CSRF (single-user local tool).

---

## Security considerations

- **File-type validation at two layers** — extension *and* MIME — before `multer` keeps the bytes. Anything else is rejected with a 400 before extraction.
- **Size and count limits** are enforced by `multer` (`MAX_UPLOAD_BYTES`, `MAX_FILES_PER_UPLOAD`) so the process cannot be exhausted by a single request.
- **Filenames are never used as storage paths.** Each upload is written as `<uuid><ext>` under `UPLOAD_DIR`; the `originalName` is stored separately for display only. This prevents path traversal and name collisions.
- **No shell-outs, no `eval`** in the extraction pipeline. All parsers are library calls operating on in-memory buffers.
- **CORS is a strict allow-list** read from `CORS_ORIGIN`; no wildcard origin in any default.
- **JSON body size is capped** at 1 MB at the Express layer.
- **Errors are sanitised** before being returned — the global handler returns the error message but not stack traces.
- **SQL**: all queries use prepared statements via `better-sqlite3`.
- **Extracted text is stored as a blob of text in the DB** — in a production setting I would additionally hash the file, store the binary in an object store (S3/GCS) with server-side encryption, and only keep the extracted text + metadata in the relational store.

---

## How I'd productionise this

1. **Replace the mock analyzer with a real LLM** behind the same `analyseDocuments()` contract. Call the model once *per document* with a structured-output schema (OpenAI's `response_format: { type: "json_schema" }` or the Anthropic tool-use pattern), then run the existing cross-document aggregator over the resulting JSON. This preserves the "no merged prompt" property.
2. **Move file storage off the API box** (S3/GCS) and switch the DB to Postgres with a managed service. The `better-sqlite3` abstraction already matches a thin repository layer, so the swap is contained.
3. **Background extraction queue** (BullMQ / SQS) for large PDFs with OCR, so the upload endpoint returns immediately with `extraction_status = pending` and the UI polls.
4. **Auth + multi-tenancy**: JWT on every request, documents scoped by `tenant_id`, row-level security in Postgres.
5. **Observability**: structured logs (pino), request-ID correlation, OTEL traces around extraction and LLM calls, Prometheus metrics for queue depth and extraction failure rate.
6. **Rate limiting** (per-IP for anon, per-token for authed) and a virus scan step (ClamAV) between upload and extraction.
7. **CI**: typecheck + vitest + a lightweight Playwright smoke test that uploads a sample and asserts the comparison table renders.
8. **Content-security hardening**: serve the frontend behind a CDN with strict CSP, use signed URLs for any file download, rotate upload tokens.

---

## AI tools used

- **Claude Code (Claude Sonnet 4.6)** was used as a coding collaborator — I used it to accelerate scaffolding (Express boilerplate, Vite config, CSS), to help structure the per-document analyzer, and to sanity-check TypeScript types and the test shape. I reviewed every file it produced and made the following decisions personally:
  - **"Mock analyzer that preserves per-document boundaries"** — this is the core design decision of the project, chosen to directly satisfy the brief's explicit anti-pattern ("do not merge documents into one unstructured prompt"). The analyzer is structured so a real LLM drops in without changing the aggregator.
  - **SQLite over Postgres** — chosen for zero-install reviewer experience; the repository abstraction is thin enough to swap later.
  - **Fact-vs-interpretation separation in both the API response *and* the UI** — the `source: "extracted" | "interpretation"` discriminator and the coloured badges are deliberately redundant so a reviewer sees the distinction without reading the JSON.
  - **Extraction failure is a first-class result**, not an exception — this is why `extraction_status` is on the document row and why failed documents still appear in the UI with an explanation instead of silently disappearing.
  - **Storage path randomisation** (UUID filename, original name only for display) — chosen for path-traversal and collision safety.
- Example synthetic documents in `samples/` were written by hand to exercise the discrepancy and missing-info branches (differing company suffix, differing revenue, email present in only one document).

No real customer or banking data is used anywhere in this repository.
