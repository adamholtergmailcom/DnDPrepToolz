# D&D PDF Studio - Architecture Documentation

This document provides technical details for developers working on the codebase.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 |
| Storage | IndexedDB (via `idb`) + localStorage |
| LLM API | OpenRouter (any model) |
| Image Gen | fal.ai (z-image, nano-banana, etc.) |
| PDF Export | Playwright (Chromium) |
| Fonts | Cinzel (headings), Spectral (body) |

## Directory Structure

```
src/
├── app/                           # Next.js App Router pages
│   ├── page.tsx                   # Home - project list
│   ├── layout.tsx                 # Root layout
│   ├── globals.css                # Tailwind styles
│   ├── settings/page.tsx          # API keys, model picker, campaign defaults
│   ├── project/[id]/page.tsx      # Main project editor (897 lines)
│   └── api/export/pdf/route.ts    # PDF generation endpoint
│
├── components/
│   ├── ModelPicker.tsx            # Live model selector with search
│   └── PageFlipper.tsx            # Book-style page flipping view
│
└── lib/
    ├── types.ts                   # All TypeScript interfaces (237 lines)
    ├── db.ts                      # IndexedDB CRUD operations
    ├── storage.ts                 # localStorage helpers for settings
    ├── openrouter.ts              # OpenRouter API client (286 lines)
    ├── falai.ts                   # fal.ai API client (257 lines)
    └── pipeline/
        ├── index.ts               # Pipeline exports
        ├── plan.ts                # Step A: Plan generation
        ├── draft.ts               # Step B: Markdown drafting
        ├── assets.ts              # Step C: Image generation
        └── render.ts              # Step D: HTML rendering
```

## Data Flow

```
User Request
    │
    ▼
┌─────────────────┐
│  Step A: Plan   │  OpenRouter LLM → DocPlan JSON
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Step B: Draft  │  OpenRouter LLM → Markdown with custom blocks
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Step C: Assets  │  fal.ai → Images (portraits, maps, items)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Step D: Render  │  Markdown + Assets → Styled HTML
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Step E: Export  │  Playwright → PDF (or HTML fallback)
└─────────────────┘
```

## Core Data Models

### Project (stored in IndexedDB)

```typescript
interface Project {
  id: string;                    // UUID
  name: string;                  // Display name
  userRequest: string;           // Original prompt
  docType?: string;              // "One-Shot", "Town Guide", etc.
  docPlan?: DocPlan;             // Step A output
  markdown?: string;             // Step B output
  assets: Asset[];               // Step C output
  context?: ProjectContext;      // Party level, campaign notes
  referenceAssets?: ReferenceAsset[];  // (Planned) Character consistency
  createdAt: string;
  updatedAt: string;
}
```

### DocPlan (LLM-generated structure)

```typescript
interface DocPlan {
  title: string;
  subtitle?: string;
  tone: string;                  // "dark", "whimsical", etc.
  sections: PlanSection[];       // Document outline with word counts
  entityRegistry: EntityRegistry; // NPCs, locations, monsters, items
  assetPlan: AssetPlanEntry[];   // What images to generate
}
```

### Asset (generated image)

```typescript
interface Asset {
  id: string;                    // Matches entity ID
  purpose: string;               // "Portrait of the tavern owner"
  prompt: string;                // Enhanced prompt sent to fal.ai
  promptSeed?: string;           // Original seed from plan
  model: string;                 // Which fal.ai model was used
  urls: string[];                // Generated image URLs
  width?: number;
  height?: number;
  isMap?: boolean;
  mapStatus?: 'preview' | 'approved' | 'finalized';
  mapFeedback?: string;          // User revision feedback
  previewUrl?: string;           // Original preview for maps
  createdAt: string;
}
```

## API Integrations

### OpenRouter (`lib/openrouter.ts`)

- **fetchModels()**: Lists available LLMs with pricing/context length
- **chatCompletion()**: Standard chat with optional tool calling
- **chatCompletionJson()**: JSON-only responses with validation & retry
- **executeToolLoop()**: Agentic loop for multi-step tool use

All API keys stored in localStorage, never logged or sent elsewhere.

### fal.ai (`lib/falai.ts`)

| Function | Model | Use Case |
|----------|-------|----------|
| `generateImageZ()` | z-image/turbo | Fast portraits, illustrations |
| `generateImageBanana()` | nano-banana | Map previews |
| `generateImageBananaPro()` | nano-banana-pro | High-quality generation |
| `editImageBanana()` | nano-banana/edit | Map refinement |
| `editImageBananaPro()` | nano-banana-pro/edit | Pro map finalization |
| `removeBackground()` | rembg-enhance | Token/icon background removal |
| `upscaleImageSeedVR()` | seedvr/upscale | 4K map upscaling |

## Pipeline Details

### Step A: Plan Generation (`pipeline/plan.ts`)

- Input: User request + optional context (party level, world description)
- LLM Task: Generate structured JSON document plan
- Output: `DocPlan` with sections, entities, asset plan
- Validation: JSON parsing with retry (up to 3 attempts)
- Temperature: 0.7 (balanced creativity)

### Step B: Draft Generation (`pipeline/draft.ts`)

- Input: `DocPlan` from Step A
- LLM Task: Write full book-style markdown
- Output: Markdown with custom blocks
- Temperature: 0.8 (more creative)
- Features: Read-aloud boxes, DM notes, stat blocks, image placeholders

### Step C: Asset Generation (`pipeline/assets.ts`)

- Input: `AssetPlanEntry[]` from DocPlan
- Process: Generate each asset with appropriate model
- Map Workflow:
  1. Preview with nano-banana (fast)
  2. User reviews: Approve / Feedback / Finalize
  3. If finalized: nano-banana/edit + SeedVR upscale to 4K
- Non-maps: z-image/turbo with optional background removal

### Step D: Render (`pipeline/render.ts`)

- Input: Markdown + Assets
- Process:
  1. Replace `asset:id` placeholders with URLs
  2. Parse custom blocks (:::readaloud, :::note, :::statblock)
  3. Convert to styled HTML
- Output: Complete HTML with embedded D&D book styles
- Options: Two-column layout toggle

### Step E: PDF Export (`api/export/pdf/route.ts`)

- Primary: Playwright → PDF with proper margins
- Fallback: Return HTML with print-ready CSS
- Format: Letter size, 0.75in margins

## Custom Markdown Syntax

```markdown
:::readaloud
Text to read aloud to players
:::

:::note
DM notes and tips
:::

:::warning
Important warnings
:::

:::statblock
name: Creature Name
size: Medium
type: humanoid
ac: 15
hp: 45
str: 16
...
actions:
- name: Multiattack
  desc: The creature makes two attacks.
:::

![Image Caption](asset:entity_id)
```

## State Management

- **React useState/useCallback**: Component-level state
- **IndexedDB**: Project persistence (via `db.ts`)
- **localStorage**: Settings and API keys (via `storage.ts`)
- No global state library - straightforward prop drilling

## Styling

D&D book design implemented in `render.ts`:

- **Colors**: #58170D (D&D red), #EEE5CE (parchment), #C9AD6A (gold)
- **Typography**: Cinzel for headings, Spectral for body
- **Layout**: Optional two-column with dividing rule
- **Special**: Drop caps, styled callout boxes, 5e stat block format

## Security Considerations

- API keys never leave browser except to respective APIs
- No backend database - fully local-first
- No user authentication required
- Export/import for backups

## Adding New Features

### Adding a new fal.ai model

1. Add interface and function in `lib/falai.ts`
2. Update `pipeline/assets.ts` to use the new model
3. Update UI in `project/[id]/page.tsx` if user-selectable

### Adding a new custom markdown block

1. Add regex pattern in `renderToHtml()` in `pipeline/render.ts`
2. Add CSS styles in `getDndStyles()` function
3. Update system prompt in `pipeline/draft.ts` to teach LLM the syntax

### Adding new pipeline steps

1. Create new file in `lib/pipeline/`
2. Export from `lib/pipeline/index.ts`
3. Add handler in `project/[id]/page.tsx`
4. Add pipeline step to `PipelineStep` type in `types.ts`
