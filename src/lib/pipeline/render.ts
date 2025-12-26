// Step D: RENDER - Convert markdown + assets to print-ready HTML

import { marked } from 'marked';
import { Asset, StatBlock } from '../types';
import { parseStatBlock } from './draft';

// Pre-process markdown to replace asset: URLs with actual image URLs
function replaceAssetUrls(markdown: string, assetMap: Map<string, Asset>): string {
  // Replace ![alt](asset:id) with ![alt](actual_url) or error message
  return markdown.replace(/!\[([^\]]*)\]\(asset:([^)]+)\)/g, (match, alt, assetId) => {
    const asset = assetMap.get(assetId);
    if (asset && asset.urls.length > 0) {
      const url = asset.urls[0];
      // Add a data attribute to mark maps for special styling
      if (asset.isMap) {
        return `<figure class="dnd-figure dnd-map-full"><img src="${url}" alt="${alt}" />${alt ? `<figcaption>${alt}</figcaption>` : ''}</figure>`;
      }
      return `<figure class="dnd-figure"><img src="${url}" alt="${alt}" />${alt ? `<figcaption>${alt}</figcaption>` : ''}</figure>`;
    }
    return `<div class="missing-asset">[Missing Asset: ${assetId}]</div>`;
  });
}

// Custom renderer for D&D-style output
export function renderToHtml(
  markdown: string,
  assets: Asset[],
  options: {
    twoColumn?: boolean;
    includeStyles?: boolean;
  } = {}
): string {
  // Create asset URL map
  const assetMap = new Map<string, Asset>();
  for (const asset of assets) {
    assetMap.set(asset.id, asset);
  }

  // Step 1: Replace asset: URLs with actual URLs FIRST
  let processed = replaceAssetUrls(markdown, assetMap);

  // Step 2: Pre-process custom blocks
  processed = preprocessCustomBlocks(processed);

  // Step 3: Configure marked for D&D styling
  // Track first paragraph for drop caps
  let isFirstParagraph = true;

  marked.use({
    renderer: {
      // Custom heading renderer with drop cap support
      heading(token: { text: string; depth: number }) {
        isFirstParagraph = true;
        const { text, depth } = token;
        const id = String(text).toLowerCase().replace(/[^\w]+/g, '-');
        const classes = depth === 1 ? 'dnd-title' : depth === 2 ? 'dnd-section' : 'dnd-subsection';
        // Parse inline markdown for bold/italic/links
        const parsedText = marked.parseInline(text) as string;
        return `<h${depth} id="${id}" class="${classes}">${parsedText}</h${depth}>\n`;
      },

      // Custom paragraph with first-paragraph detection for drop caps
      paragraph(token: { text: string }) {
        const text = token.text;
        const textStr = String(text);
        // Parse inline markdown for bold/italic/links
        const parsedText = marked.parseInline(textStr) as string;

        // Skip drop cap if starts with HTML (like a figure tag from an image)
        if (isFirstParagraph && parsedText.length > 0 && !parsedText.startsWith('<')) {
          isFirstParagraph = false;
          // We need to find the first actual character for the drop cap, 
          // skip tags if they was added by parseInline (unlikely at start of p, but safe)
          const firstLetter = parsedText.charAt(0);
          const rest = parsedText.slice(1);
          return `<p class="first-paragraph"><span class="drop-cap">${firstLetter}</span>${rest}</p>\n`;
        }
        return `<p>${parsedText}</p>\n`;
      },

      // Custom table renderer - marked v17 uses TableCell objects
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      table(token: any) {
        const headerCells = Array.isArray(token.header)
          ? token.header.map((cell: { text: string }) => {
            const parsed = marked.parseInline(cell.text || '') as string;
            return `<th>${parsed}</th>`;
          }).join('')
          : '';
        const headerHtml = headerCells ? `<tr>${headerCells}</tr>` : '';

        const bodyHtml = Array.isArray(token.rows)
          ? token.rows.map((row: Array<{ text: string }>) =>
            `<tr>${row.map(cell => {
              const parsed = marked.parseInline(cell.text || '') as string;
              return `<td>${parsed}</td>`;
            }).join('')}</tr>`
          ).join('')
          : '';

        return `<table class="dnd-table">
          <thead>${headerHtml}</thead>
          <tbody>${bodyHtml}</tbody>
        </table>\n`;
      },
    },
  });

  const htmlContent = marked.parse(processed) as string;

  // Wrap in document structure
  const bodyClass = options.twoColumn ? 'two-column' : 'single-column';

  if (options.includeStyles) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>D&D Document</title>
  <style>${getDndStyles()}</style>
</head>
<body class="${bodyClass}">
  <main class="dnd-content">
    ${htmlContent}
  </main>
</body>
</html>`;
  }

  return `<div class="${bodyClass}"><main class="dnd-content">${htmlContent}</main></div>`;
}

// Preprocess custom block syntax
function preprocessCustomBlocks(markdown: string): string {
  let result = markdown;

  // Helper to process content - use parseInline for inline formatting (bold, italic)
  // Images are already converted to HTML by replaceAssetUrls
  const processBlockContent = (content: string): string => {
    const trimmed = content.trim();
    // Parse inline markdown for bold/italic/links
    return marked.parseInline(trimmed) as string;
  };

  // Process :::readaloud blocks
  result = result.replace(/:::readaloud\n([\s\S]*?)\n:::/g, (_, content) => {
    const parsed = processBlockContent(content);
    return `<div class="read-aloud">${parsed}</div>`;
  });

  // Process :::note blocks
  result = result.replace(/:::note\n([\s\S]*?)\n:::/g, (_, content) => {
    const parsed = processBlockContent(content);
    return `<div class="dnd-note">${parsed}</div>`;
  });

  // Process :::warning blocks
  result = result.replace(/:::warning\n([\s\S]*?)\n:::/g, (_, content) => {
    const parsed = processBlockContent(content);
    return `<div class="dnd-warning">${parsed}</div>`;
  });

  // Process :::statblock blocks
  result = result.replace(/:::statblock\n([\s\S]*?)\n:::/g, (_, content) => {
    const statBlock = parseStatBlock(content);
    if (statBlock) {
      return renderStatBlock(statBlock);
    }
    return `<div class="stat-block-error">Error parsing stat block</div>`;
  });

  return result;
}

// Render a stat block to HTML
function renderStatBlock(block: StatBlock): string {
  const modStr = (score?: number) => {
    if (!score) return '+0';
    const mod = Math.floor((score - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  };

  let html = `<div class="stat-block">
  <div class="stat-block-header">
    <h3 class="creature-name">${block.name}</h3>
    <p class="creature-type">${block.size || 'Medium'} ${block.type || 'creature'}${block.alignment ? `, ${block.alignment}` : ''}</p>
  </div>
  <div class="stat-block-divider"></div>
  <div class="stat-block-basics">
    <p><strong>Armor Class</strong> ${block.armorClass || 10}${block.armorType ? ` (${block.armorType})` : ''}</p>
    <p><strong>Hit Points</strong> ${block.hitPoints || 1}${block.hitDice ? ` (${block.hitDice})` : ''}</p>
    <p><strong>Speed</strong> ${block.speed || '30 ft.'}</p>
  </div>
  <div class="stat-block-divider"></div>
  <div class="stat-block-abilities">
    <div class="ability"><span class="ability-name">STR</span><span class="ability-score">${block.str || 10} (${modStr(block.str)})</span></div>
    <div class="ability"><span class="ability-name">DEX</span><span class="ability-score">${block.dex || 10} (${modStr(block.dex)})</span></div>
    <div class="ability"><span class="ability-name">CON</span><span class="ability-score">${block.con || 10} (${modStr(block.con)})</span></div>
    <div class="ability"><span class="ability-name">INT</span><span class="ability-score">${block.int || 10} (${modStr(block.int)})</span></div>
    <div class="ability"><span class="ability-name">WIS</span><span class="ability-score">${block.wis || 10} (${modStr(block.wis)})</span></div>
    <div class="ability"><span class="ability-name">CHA</span><span class="ability-score">${block.cha || 10} (${modStr(block.cha)})</span></div>
  </div>
  <div class="stat-block-divider"></div>
  <div class="stat-block-details">`;

  if (block.savingThrows) {
    html += `<p><strong>Saving Throws</strong> ${block.savingThrows}</p>`;
  }
  if (block.skills) {
    html += `<p><strong>Skills</strong> ${block.skills}</p>`;
  }
  if (block.damageResistances) {
    html += `<p><strong>Damage Resistances</strong> ${block.damageResistances}</p>`;
  }
  if (block.damageImmunities) {
    html += `<p><strong>Damage Immunities</strong> ${block.damageImmunities}</p>`;
  }
  if (block.conditionImmunities) {
    html += `<p><strong>Condition Immunities</strong> ${block.conditionImmunities}</p>`;
  }
  if (block.senses) {
    html += `<p><strong>Senses</strong> ${block.senses}</p>`;
  }
  if (block.languages) {
    html += `<p><strong>Languages</strong> ${block.languages}</p>`;
  }
  if (block.challenge) {
    html += `<p><strong>Challenge</strong> ${block.challenge}${block.proficiencyBonus ? ` (${block.proficiencyBonus} proficiency bonus)` : ''}</p>`;
  }

  html += `</div>`;

  // Traits
  if (block.traits && block.traits.length > 0) {
    html += `<div class="stat-block-divider"></div><div class="stat-block-traits">`;
    for (const trait of block.traits) {
      html += `<p><strong><em>${trait.name}.</em></strong> ${trait.description}</p>`;
    }
    html += `</div>`;
  }

  // Actions
  if (block.actions && block.actions.length > 0) {
    html += `<div class="stat-block-divider"></div><h4 class="stat-block-section-title">Actions</h4><div class="stat-block-actions">`;
    for (const action of block.actions) {
      html += `<p><strong><em>${action.name}.</em></strong> ${action.description}</p>`;
    }
    html += `</div>`;
  }

  // Bonus Actions
  if (block.bonusActions && block.bonusActions.length > 0) {
    html += `<div class="stat-block-divider"></div><h4 class="stat-block-section-title">Bonus Actions</h4><div class="stat-block-bonus-actions">`;
    for (const action of block.bonusActions) {
      html += `<p><strong><em>${action.name}.</em></strong> ${action.description}</p>`;
    }
    html += `</div>`;
  }

  // Reactions
  if (block.reactions && block.reactions.length > 0) {
    html += `<div class="stat-block-divider"></div><h4 class="stat-block-section-title">Reactions</h4><div class="stat-block-reactions">`;
    for (const reaction of block.reactions) {
      html += `<p><strong><em>${reaction.name}.</em></strong> ${reaction.description}</p>`;
    }
    html += `</div>`;
  }

  // Legendary Actions
  if (block.legendaryActions && block.legendaryActions.length > 0) {
    html += `<div class="stat-block-divider"></div><h4 class="stat-block-section-title">Legendary Actions</h4>`;
    html += `<p>The creature can take 3 legendary actions, choosing from the options below. Only one legendary action option can be used at a time and only at the end of another creature's turn. The creature regains spent legendary actions at the start of its turn.</p>`;
    html += `<div class="stat-block-legendary-actions">`;
    for (const action of block.legendaryActions) {
      html += `<p><strong>${action.name}${action.cost && action.cost > 1 ? ` (Costs ${action.cost} Actions)` : ''}.</strong> ${action.description}</p>`;
    }
    html += `</div>`;
  }

  html += `</div>`;

  return html;
}

// D&D Book Styles
function getDndStyles(): string {
  return `
/* D&D Book Styles */
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Spectral:ital,wght@0,400;0,600;1,400&display=swap');

:root {
  --dnd-red: #58170D;
  --dnd-tan: #EEE5CE;
  --dnd-gold: #C9AD6A;
  --dnd-dark: #1a1a1a;
  --heading-font: 'Cinzel', serif;
  --body-font: 'Spectral', serif;
}

* {
  box-sizing: border-box;
}

body {
  font-family: var(--body-font);
  font-size: 11pt;
  line-height: 1.5;
  color: var(--dnd-dark);
  background: var(--dnd-tan);
  margin: 0;
  padding: 0;
}

.dnd-content {
  max-width: 8.5in;
  margin: 0 auto;
  padding: 0.5in;
  background: white;
  box-shadow: 0 0 20px rgba(0,0,0,0.2);
}

.two-column .dnd-content {
  column-count: 2;
  column-gap: 0.4in;
  column-rule: 1px solid var(--dnd-gold);
  column-fill: balance;
}

/* Print-specific page layout */
@page {
  size: letter;
  margin: 0.75in;
}

@media print {
  body {
    background: white;
  }
  
  .dnd-content {
    box-shadow: none;
    padding: 0;
    max-width: none;
  }
  
  .two-column .dnd-content {
    column-count: 2;
    column-gap: 0.4in;
    column-fill: balance;
  }
}

/* Headings */
.dnd-title {
  font-family: var(--heading-font);
  font-size: 28pt;
  color: var(--dnd-red);
  border-bottom: 3px solid var(--dnd-gold);
  padding-bottom: 0.2em;
  margin-bottom: 0.5em;
  column-span: all;
}

.dnd-section {
  font-family: var(--heading-font);
  font-size: 18pt;
  color: var(--dnd-red);
  border-bottom: 2px solid var(--dnd-gold);
  padding-bottom: 0.1em;
  margin-top: 1em;
  margin-bottom: 0.5em;
}

.dnd-subsection {
  font-family: var(--heading-font);
  font-size: 14pt;
  color: var(--dnd-red);
  margin-top: 0.8em;
  margin-bottom: 0.3em;
}

h4, h5, h6 {
  font-family: var(--heading-font);
  color: var(--dnd-red);
  margin-top: 0.5em;
  margin-bottom: 0.3em;
}

/* Drop Cap */
.first-paragraph .drop-cap {
  float: left;
  font-family: var(--heading-font);
  font-size: 3.5em;
  line-height: 0.8;
  padding-right: 0.1em;
  color: var(--dnd-red);
}

/* Read-aloud box */
.read-aloud {
  background: linear-gradient(135deg, #f4f0e4 0%, #e8e0cc 100%);
  border-left: 4px solid var(--dnd-red);
  padding: 1em;
  margin: 1em 0;
  font-style: italic;
  box-shadow: 2px 2px 6px rgba(0,0,0,0.15);
  break-inside: avoid;
}

/* Note box */
.dnd-note {
  background: #f8f5ed;
  border: 1px solid var(--dnd-gold);
  border-radius: 4px;
  padding: 0.8em;
  margin: 1em 0;
  font-size: 10pt;
  break-inside: avoid;
}

.dnd-note::before {
  content: "📜 Note";
  display: block;
  font-family: var(--heading-font);
  font-weight: bold;
  color: var(--dnd-red);
  margin-bottom: 0.3em;
}

/* Warning box */
.dnd-warning {
  background: #fff3e0;
  border: 2px solid #e65100;
  border-radius: 4px;
  padding: 0.8em;
  margin: 1em 0;
  break-inside: avoid;
}

.dnd-warning::before {
  content: "⚠️ Warning";
  display: block;
  font-family: var(--heading-font);
  font-weight: bold;
  color: #e65100;
  margin-bottom: 0.3em;
}

/* Tables */
.dnd-table {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
  font-size: 10pt;
  break-inside: avoid;
}

.dnd-table th {
  background: var(--dnd-red);
  color: white;
  font-family: var(--heading-font);
  padding: 0.5em;
  text-align: left;
}

.dnd-table td {
  padding: 0.4em 0.5em;
  border-bottom: 1px solid #ddd;
}

.dnd-table tr:nth-child(even) {
  background: #f8f5ed;
}

/* Figures */
.dnd-figure {
  margin: 1em 0;
  text-align: center;
  break-inside: avoid;
}

.dnd-figure img {
  max-width: 100%;
  max-height: 250px;
  width: auto;
  height: auto;
  object-fit: contain;
  border: 2px solid var(--dnd-gold);
  box-shadow: 3px 3px 8px rgba(0,0,0,0.2);
}

.dnd-figure figcaption {
  font-style: italic;
  font-size: 9pt;
  color: #666;
  margin-top: 0.3em;
}

/* Full-width maps that span columns */
.dnd-map-full {
  column-span: all;
  margin: 1.5em 0;
}

.dnd-map-full img {
  width: 100%;
  max-height: 60vh;
  object-fit: contain;
}

/* Stat Block */
.stat-block {
  background: linear-gradient(135deg, #fdf9f0 0%, #f4ecd8 100%);
  border: 2px solid var(--dnd-red);
  padding: 1em;
  margin: 1em 0;
  font-size: 10pt;
  break-inside: avoid;
  box-shadow: 2px 2px 6px rgba(0,0,0,0.15);
}

.stat-block-header {
  border-bottom: 2px solid var(--dnd-red);
  padding-bottom: 0.5em;
  margin-bottom: 0.5em;
}

.creature-name {
  font-family: var(--heading-font);
  font-size: 16pt;
  color: var(--dnd-red);
  margin: 0;
}

.creature-type {
  font-style: italic;
  margin: 0.2em 0 0 0;
  color: #666;
}

.stat-block-divider {
  height: 2px;
  background: linear-gradient(to right, transparent, var(--dnd-red), transparent);
  margin: 0.5em 0;
}

.stat-block-basics p,
.stat-block-details p {
  margin: 0.2em 0;
}

.stat-block-abilities {
  display: flex;
  justify-content: space-between;
  text-align: center;
  padding: 0.3em 0;
}

.ability {
  flex: 1;
}

.ability-name {
  display: block;
  font-weight: bold;
  font-size: 9pt;
  color: var(--dnd-red);
}

.ability-score {
  display: block;
  font-size: 10pt;
}

.stat-block-section-title {
  font-family: var(--heading-font);
  font-size: 12pt;
  color: var(--dnd-red);
  margin: 0.5em 0 0.3em 0;
  border-bottom: 1px solid var(--dnd-gold);
}

.stat-block-traits p,
.stat-block-actions p,
.stat-block-bonus-actions p,
.stat-block-reactions p,
.stat-block-legendary-actions p {
  margin: 0.3em 0;
}

/* Missing asset placeholder */
.missing-asset {
  background: #ffebee;
  border: 2px dashed #e57373;
  padding: 1em;
  text-align: center;
  color: #c62828;
  font-style: italic;
}

/* Print styles */
@media print {
  body {
    background: white;
  }

  .dnd-content {
    box-shadow: none;
    max-width: none;
    padding: 0;
  }

  .stat-block,
  .read-aloud,
  .dnd-note,
  .dnd-warning,
  .dnd-table,
  .dnd-figure {
    break-inside: avoid;
  }
}

@page {
  size: letter;
  margin: 0.75in;
}
`;
}

export { getDndStyles };
