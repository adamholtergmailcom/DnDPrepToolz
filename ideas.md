# D&D PDF Studio - Feature Ideas

## Implemented Features

The following features have been implemented:

| # | Feature | Status |
|---|---------|--------|
| 1 | Regenerate & Edit Images | DONE |
| 2 | Multiple Image Variations | DONE |
| 3 | Image Lightbox/Zoom | DONE |
| 5 | Download Assets (individual + all) | DONE |
| 7 | Aspect Ratio Controls Per Asset | DONE |
| 8 | Section Regeneration | DONE |
| 9 | Duplicate Project | DONE |
| 10 | Print Format Options (Letter, A4, A5, Digest) | DONE |
| 11 | Keyboard Shortcuts | DONE |
| 12 | Auto-Save Indicator | DONE |
| 13 | Asset Type Filtering | DONE |
| 14 | Dark Mode | DONE |

---

## Not Implemented (by request)

| # | Feature | Reason |
|---|---------|--------|
| 4 | Additional Image Models | User prefers current model selection |
| 6 | Style Presets | Deferred for later |

---

## How to Use New Features

### Image Regeneration & Variations
- In the **Assets** tab, each image card has:
  - **Regenerate** - regenerate with same prompt
  - **Edit** - modify prompt and aspect ratio, then regenerate
  - **Variations** - generate 2-4 variations and pick your favorite
  - **Download** - download the image
- Click any image to open the **lightbox** for full-size viewing
- Use the **filter buttons** to show only portraits, maps, items, or scenes
- **Download All** downloads every asset

### Section Regeneration
- In the **Draft** tab, click any section heading to regenerate just that section
- Optionally provide feedback to guide the regeneration

### Duplicate Project
- On the home page, click **Duplicate** on any project card to create a copy

### Print Format Options
- Click **Export PDF** and choose from Letter, A4, A5, or Digest (5.5" x 8.5")

### Keyboard Shortcuts
Press **?** to see all shortcuts:
- **1-5** - Switch tabs
- **Cmd/Ctrl + G** - Generate next step
- **Cmd/Ctrl + B** - Build preview
- **Cmd/Ctrl + E** - Export PDF
- **Esc** - Close modals

### Dark Mode
- Go to **Settings** and choose Light, Dark, or System under Appearance

### Auto-Save
- The header shows "Saved [time]" when changes are persisted

---

## Future Ideas

### Higher Priority
- ZIP export for all assets (requires JSZip dependency)
- Batch regenerate assets that match criteria
- Character consistency with reference images (ReferenceAsset type exists but not implemented)

### Lower Priority
- Drag-and-drop asset reordering
- Custom stat block builder UI
- Encounter balancer suggestions
- Export to Foundry VTT format
- Version history for drafts
