# D&D PDF Studio

A local-first web application for generating book-style, print-ready PDFs for D&D content. Built with Next.js (App Router), TypeScript, and AI-powered generation.

## Features

- **AI-Powered Content Generation**: Generate complete D&D documents from simple text descriptions
- **Book-Style PDF Output**: Professional formatting with two-column layouts, drop caps, stat blocks, and D&D-style typography
- **Image Generation**: Create portraits, maps, items, and other art using fal.ai
- **Map Approval Workflow**: Preview maps before committing to Pro-quality generation
- **Local-First Storage**: All projects stored in IndexedDB - your data stays on your device
- **Model Selection**: Choose from any LLM available on OpenRouter
- **Export/Import**: Full project backup and restore as JSON files

## Quick Start

```bash
# Install dependencies
npm install

# Install Playwright browsers (for PDF export)
npx playwright install chromium

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## API Keys Setup

Navigate to **Settings** (top-right corner) to enter your API keys:

### OpenRouter API Key
- Get your key from [openrouter.ai/keys](https://openrouter.ai/keys)
- Used for LLM text generation (planning and drafting)
- Supports many models including GPT-4, Claude, Gemini, etc.

### fal.ai API Key
- Get your key from [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys)
- Used for image generation (portraits, maps, items)
- Uses models like z-image/turbo and nano-banana

### Default Model
- Default: `google/gemini-3-flash-preview`
- Select any available model from the live model picker
- Shows model ID, name, and context length

**Security Note**: API keys are stored locally in your browser's localStorage. They are never sent to any server except the respective API providers (OpenRouter and fal.ai).

## Model Picker

The model picker in Settings:
1. Loads available models live from OpenRouter's API
2. Displays model ID, name, and context length
3. Supports search/filter by model name or ID
4. Automatically populates when you enter a valid OpenRouter API key

## Workflow

### 1. Create a Project
- Enter a project name and your D&D content request
- Optionally specify a document type (One-Shot, Town Guide, etc.)

### 2. Generate Plan
- Creates a structured document plan including:
  - Title, subtitle, and tone
  - Section outline with word counts
  - Entity registry (NPCs, factions, locations, monsters, items)
  - Asset plan for images to generate
- Output is validated JSON - auto-retries if invalid

### 3. Generate Draft
- Produces book-style markdown with:
  - Headings and sections following the plan
  - Read-aloud boxes for player text
  - DM notes and warnings
  - Full 5e stat blocks for monsters
  - Magic item descriptions
  - Image placeholders referencing asset IDs

### 4. Generate Assets
- Creates images for each asset in the plan
- Uses different models based on purpose:
  - `fal-ai/z-image/turbo` for portraits, illustrations
  - `smoretalk-ai/rembg-enhance` for tokens (background removal)
  - Map workflow (see below)

### 5. Map Approval Workflow

Maps require approval before Pro generation to control costs:

1. **Preview Generation**: Maps are first generated using z-image/turbo
2. **Refinement**: Preview is refined using nano-banana/edit
3. **Review**: Preview appears in the Assets tab with "Approve Pro Map" button
4. **Approval**: Click to generate using `fal-ai/nano-banana-pro/edit` at 2K resolution
5. **Final**: Pro maps are marked as "Pro-generated"

**Never auto-runs Pro maps** - you always control the approval.

### 6. Build Preview
- Renders markdown + assets into styled HTML
- D&D book styling with:
  - Two-column layout (optional)
  - Cinzel headings, Spectral body text
  - Drop caps for section openings
  - Styled callout boxes
  - 5e-style stat blocks
  - Image embedding

### 7. Export PDF
- Uses Playwright to generate print-ready PDF
- Proper margins and page breaks
- Fallback: Downloads HTML for browser printing if Playwright unavailable

## Project Structure

```
src/
├── app/
│   ├── page.tsx              # Project list
│   ├── settings/page.tsx     # API keys & model picker
│   ├── project/[id]/page.tsx # Project editor
│   └── api/export/pdf/       # PDF generation endpoint
├── components/
│   └── ModelPicker.tsx       # Live model selector
├── lib/
│   ├── types.ts              # TypeScript types
│   ├── storage.ts            # localStorage helpers
│   ├── db.ts                 # IndexedDB operations
│   ├── openrouter.ts         # OpenRouter API
│   ├── falai.ts              # fal.ai API
│   └── pipeline/
│       ├── plan.ts           # Step A: Plan generation
│       ├── draft.ts          # Step B: Markdown drafting
│       ├── assets.ts         # Step C: Image generation
│       └── render.ts         # Step D: HTML rendering
```

## Custom Markdown Syntax

The draft uses extended markdown with custom blocks:

### Read-Aloud Text
```
:::readaloud
The tavern door creaks open, revealing a dimly lit room filled with the murmur of hushed conversations...
:::
```

### DM Notes
```
:::note
This is a good time to have players make Perception checks.
:::
```

### Warnings
```
:::warning
Combat encounter ahead - ensure players are rested.
:::
```

### Stat Blocks
```
:::statblock
name: Goblin Boss
size: Small
type: humanoid (goblinoid)
alignment: neutral evil
ac: 17
ac_type: chain shirt, shield
hp: 21
hit_dice: 6d6
speed: 30 ft.
str: 10
dex: 14
con: 10
int: 10
wis: 8
cha: 10
skills: Stealth +6
senses: darkvision 60 ft., passive Perception 9
languages: Common, Goblin
cr: 1
traits:
- name: Nimble Escape
  desc: The goblin can take the Disengage or Hide action as a bonus action on each of its turns.
actions:
- name: Multiattack
  desc: The goblin makes two attacks with its scimitar.
- name: Scimitar
  desc: Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.
:::
```

### Image Placeholders
```
![Town Map](asset:town_map_id)
```

## Export/Import

- **Export All**: Downloads all projects as a single JSON file
- **Import**: Restores projects from a previously exported JSON file

Useful for backup, sharing, or moving between devices.

## PDF Export Notes

The PDF export uses Playwright with headless Chromium:

1. If Playwright browsers are installed, generates proper PDF
2. If browsers unavailable, falls back to HTML download
3. HTML fallback includes print-ready CSS for browser printing (Ctrl/Cmd + P)

To ensure PDF export works:
```bash
npx playwright install chromium
```

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Storage**: IndexedDB (via idb)
- **LLM**: OpenRouter API
- **Image Gen**: fal.ai
- **PDF**: Playwright
- **Fonts**: Cinzel (headings), Spectral (body)

## License

MIT
