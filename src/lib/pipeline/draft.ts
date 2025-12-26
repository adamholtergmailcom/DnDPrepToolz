// Step B: DRAFT - Generate book-style markdown from document plan

import { DocPlan, ChatMessage, StatBlock } from '../types';
import { chatCompletion } from '../openrouter';

const DRAFT_SYSTEM_PROMPT = `You are an expert D&D writer creating COMPREHENSIVE, PRODUCTION-READY content that DMs can use directly at the table. Your content should be detailed enough that a DM never needs to improvise basic information.

## CRITICAL: Detail Requirements

Generate COMPLETE content with these standards:

### For Adventures/One-Shots:
- Full room/area descriptions with sensory details (sight, sound, smell)
- Every NPC has personality, motivations, secrets, and sample dialogue
- Combat encounters include monster tactics, terrain features, and environmental hazards
- Skill check DCs are specified for all challenges
- Multiple paths to success - don't railroad players
- Include "what happens if" contingencies for player choices
- Treasure is specific with gold values and item descriptions

### For Mysteries:
- At least 3-5 discoverable clues per major revelation
- Red herrings that make sense in context
- Suspects with alibis, motives, and means
- Investigation mechanics (DC checks, Information rewards)
- Timeline of events that led to the mystery
- Multiple possible resolutions

### For NPCs:
- Physical description (2-3 sentences)
- Personality traits, ideals, bonds, and flaws
- Background and how they came to be here
- Current goals and what they want from the party
- Secrets they're hiding
- 2-3 lines of sample dialogue showing their voice
- Hooks for future adventures

### For Locations:
- Detailed physical description
- Notable features and hidden elements
- Who's here and what they're doing
- History and purpose
- Connected hooks and dangers

Generate rich, evocative markdown following these conventions:

## Formatting Rules

1. **Headings**: Use # for chapter titles, ## for major sections, ### for subsections
2. **Emphasis**: Use *italics* for emphasis, **bold** for important terms
3. **Callout Boxes**: Use this format for read-aloud text, notes, and warnings:

:::readaloud
This boxed text is meant to be read aloud to players...
:::

:::note
This is a DM note or tip...
:::

:::warning
This is a warning or caution...
:::

4. **Tables**: Use standard markdown tables for organized data

5. **Stat Blocks**: For monsters and NPCs with combat stats, use this exact format:

:::statblock
name: Creature Name
size: Medium
type: humanoid (human)
alignment: neutral evil
ac: 15
ac_type: chain shirt
hp: 65
hit_dice: 10d8 + 20
speed: 30 ft.
str: 16
dex: 14
con: 14
int: 10
wis: 12
cha: 8
saves: Str +5, Con +4
skills: Athletics +5, Intimidation +2
senses: passive Perception 11
languages: Common
cr: 3
proficiency: +2
traits:
- name: Brave
  desc: The warrior has advantage on saving throws against being frightened.
actions:
- name: Multiattack
  desc: The warrior makes two longsword attacks.
- name: Longsword
  desc: Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) slashing damage.
reactions:
- name: Parry
  desc: The warrior adds 2 to its AC against one melee attack that would hit it.
:::

6. **Magic Items**: Format with rarity in parentheses:

### Blazing Blade (Rare)
*Weapon (longsword), rare (requires attunement)*

This sword...

7. **Asset Placeholders**: Reference images from the asset plan:

![Town Map](asset:town_map_id)
![NPC Portrait](asset:npc_portrait_id)

## Style Guidelines

- Write in present tense for descriptions, past tense for history
- Use evocative, immersive language
- Include practical DM information alongside narrative
- Reference entity IDs from the plan to maintain consistency
- Ensure stat blocks are complete and follow 5e conventions`;

export async function generateDraft(
  apiKey: string,
  modelId: string,
  docPlan: DocPlan
): Promise<string> {
  // Build entity reference for the prompt
  const entitySummary = buildEntitySummary(docPlan);

  const messages: ChatMessage[] = [
    { role: 'system', content: DRAFT_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Generate the complete D&D document based on this plan:

# Document Plan

**Title**: ${docPlan.title}
${docPlan.subtitle ? `**Subtitle**: ${docPlan.subtitle}` : ''}
**Tone**: ${docPlan.tone}

## Sections to Write

${docPlan.sections.map(s => `
### ${s.heading} (${s.id})
Target word count: ~${s.wordCount} words
${s.subsections ? s.subsections.map(sub => `  - ${sub.heading} (${sub.id}): ~${sub.wordCount} words`).join('\n') : ''}
`).join('\n')}

## Entity Registry

${entitySummary}

## Asset References - USE THESE EXACT IDs

You MUST use these exact asset IDs when placing images. Use the format: ![Description](asset:EXACT_ID_HERE)

${docPlan.assetPlan.map(a => `- ID: "${a.id}" → ${a.purpose}${a.isMap ? ' [MAP]' : ''}`).join('\n')}

---

Now write the COMPLETE document with ALL sections. This must be production-ready content a DM can run directly.

## REQUIRED Content Standards:

1. **Evocative Descriptions**: Every area gets 2-3 paragraphs of sensory detail
2. **DM Notes**: Use :::note boxes for tactical advice, DC recommendations, and contingencies
3. **Read-Aloud Text**: Use :::readaloud boxes for every major location and dramatic moment
4. **Complete Stat Blocks**: Full 5e stat blocks for ALL monsters using :::statblock format
5. **NPC Details**: Every named NPC gets personality, motivations, secrets, and sample dialogue
6. **Skill Challenges**: Specify DCs for all skill checks (Easy 10, Medium 15, Hard 20)
7. **Combat Tactics**: How do monsters fight? What's their strategy? When do they flee?
8. **Treasure**: Specific items and gold amounts, not vague "some treasure"
9. **Consequences**: What happens if players fail? What if they take a different approach?
10. **Image Placeholders**: Use ![Description](asset:exact_asset_id) syntax with EXACT IDs from above

## Length Expectations:
- A town guide should be 3,000-6,000 words minimum
- A one-shot adventure should be 8,000-15,000 words minimum
- A mystery should include full investigation mechanics and multiple clues
- A dungeon should have complete room-by-room descriptions

IMPORTANT: When placing monster or NPC images, use the corresponding asset ID from the list above. For maps, place them prominently at the start of relevant sections.

Write the COMPLETE, DETAILED markdown document now. DO NOT summarize or abbreviate - write everything out fully:`,
    },
  ];

  // Use high max_tokens for comprehensive content generation (16K tokens ≈ 12K words)
  const response = await chatCompletion(apiKey, modelId, messages, undefined, 0.8, 16000);
  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error('No content generated');
  }

  return content;
}

function buildEntitySummary(plan: DocPlan): string {
  const parts: string[] = [];

  if (plan.entityRegistry.npcs.length > 0) {
    parts.push('**NPCs:**');
    parts.push(...plan.entityRegistry.npcs.map(e =>
      `- ${e.name} (${e.id}): ${e.summary}`
    ));
  }

  if (plan.entityRegistry.factions.length > 0) {
    parts.push('\n**Factions:**');
    parts.push(...plan.entityRegistry.factions.map(e =>
      `- ${e.name} (${e.id}): ${e.summary}`
    ));
  }

  if (plan.entityRegistry.locations.length > 0) {
    parts.push('\n**Locations:**');
    parts.push(...plan.entityRegistry.locations.map(e =>
      `- ${e.name} (${e.id}): ${e.summary}`
    ));
  }

  if (plan.entityRegistry.monsters.length > 0) {
    parts.push('\n**Monsters:**');
    parts.push(...plan.entityRegistry.monsters.map(e =>
      `- ${e.name} (${e.id}): ${e.summary}`
    ));
  }

  if (plan.entityRegistry.items.length > 0) {
    parts.push('\n**Magic Items:**');
    parts.push(...plan.entityRegistry.items.map(e =>
      `- ${e.name} (${e.id})${e.rarity ? ` [${e.rarity}]` : ''}: ${e.summary}`
    ));
  }

  return parts.join('\n');
}

// Parse stat block from markdown format
export function parseStatBlock(content: string): StatBlock | null {
  const lines = content.trim().split('\n');
  const block: Partial<StatBlock> = {};
  let currentSection: 'traits' | 'actions' | 'bonus_actions' | 'reactions' | 'legendary' | null = null;
  let currentItem: { name: string; desc: string } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('name:')) {
      block.name = trimmed.slice(5).trim();
    } else if (trimmed.startsWith('size:')) {
      block.size = trimmed.slice(5).trim();
    } else if (trimmed.startsWith('type:')) {
      block.type = trimmed.slice(5).trim();
    } else if (trimmed.startsWith('alignment:')) {
      block.alignment = trimmed.slice(10).trim();
    } else if (trimmed.startsWith('ac:')) {
      block.armorClass = parseInt(trimmed.slice(3).trim()) || undefined;
    } else if (trimmed.startsWith('ac_type:')) {
      block.armorType = trimmed.slice(8).trim();
    } else if (trimmed.startsWith('hp:')) {
      block.hitPoints = parseInt(trimmed.slice(3).trim()) || undefined;
    } else if (trimmed.startsWith('hit_dice:')) {
      block.hitDice = trimmed.slice(9).trim();
    } else if (trimmed.startsWith('speed:')) {
      block.speed = trimmed.slice(6).trim();
    } else if (trimmed.startsWith('str:')) {
      block.str = parseInt(trimmed.slice(4).trim()) || undefined;
    } else if (trimmed.startsWith('dex:')) {
      block.dex = parseInt(trimmed.slice(4).trim()) || undefined;
    } else if (trimmed.startsWith('con:')) {
      block.con = parseInt(trimmed.slice(4).trim()) || undefined;
    } else if (trimmed.startsWith('int:')) {
      block.int = parseInt(trimmed.slice(4).trim()) || undefined;
    } else if (trimmed.startsWith('wis:')) {
      block.wis = parseInt(trimmed.slice(4).trim()) || undefined;
    } else if (trimmed.startsWith('cha:')) {
      block.cha = parseInt(trimmed.slice(4).trim()) || undefined;
    } else if (trimmed.startsWith('saves:')) {
      block.savingThrows = trimmed.slice(6).trim();
    } else if (trimmed.startsWith('skills:')) {
      block.skills = trimmed.slice(7).trim();
    } else if (trimmed.startsWith('damage_resistances:')) {
      block.damageResistances = trimmed.slice(19).trim();
    } else if (trimmed.startsWith('damage_immunities:')) {
      block.damageImmunities = trimmed.slice(18).trim();
    } else if (trimmed.startsWith('condition_immunities:')) {
      block.conditionImmunities = trimmed.slice(21).trim();
    } else if (trimmed.startsWith('senses:')) {
      block.senses = trimmed.slice(7).trim();
    } else if (trimmed.startsWith('languages:')) {
      block.languages = trimmed.slice(10).trim();
    } else if (trimmed.startsWith('cr:')) {
      block.challenge = trimmed.slice(3).trim();
    } else if (trimmed.startsWith('proficiency:')) {
      block.proficiencyBonus = trimmed.slice(12).trim();
    } else if (trimmed === 'traits:') {
      currentSection = 'traits';
      block.traits = [];
    } else if (trimmed === 'actions:') {
      currentSection = 'actions';
      block.actions = [];
    } else if (trimmed === 'bonus_actions:') {
      currentSection = 'bonus_actions';
      block.bonusActions = [];
    } else if (trimmed === 'reactions:') {
      currentSection = 'reactions';
      block.reactions = [];
    } else if (trimmed === 'legendary_actions:') {
      currentSection = 'legendary';
      block.legendaryActions = [];
    } else if (trimmed.startsWith('- name:') && currentSection) {
      if (currentItem) {
        addItemToSection(block, currentSection, currentItem);
      }
      currentItem = { name: trimmed.slice(7).trim(), desc: '' };
    } else if (trimmed.startsWith('desc:') && currentItem) {
      currentItem.desc = trimmed.slice(5).trim();
    }
  }

  // Add last item
  if (currentItem && currentSection) {
    addItemToSection(block, currentSection, currentItem);
  }

  if (!block.name) return null;
  return block as StatBlock;
}

function addItemToSection(
  block: Partial<StatBlock>,
  section: 'traits' | 'actions' | 'bonus_actions' | 'reactions' | 'legendary',
  item: { name: string; desc: string }
) {
  switch (section) {
    case 'traits':
      block.traits = block.traits || [];
      block.traits.push({ name: item.name, description: item.desc });
      break;
    case 'actions':
      block.actions = block.actions || [];
      block.actions.push({ name: item.name, description: item.desc });
      break;
    case 'bonus_actions':
      block.bonusActions = block.bonusActions || [];
      block.bonusActions.push({ name: item.name, description: item.desc });
      break;
    case 'reactions':
      block.reactions = block.reactions || [];
      block.reactions.push({ name: item.name, description: item.desc });
      break;
    case 'legendary':
      block.legendaryActions = block.legendaryActions || [];
      block.legendaryActions.push({ name: item.name, description: item.desc });
      break;
  }
}

// Parse markdown into sections for regeneration
export function parseSections(markdown: string): { heading: string; level: number; content: string; startIndex: number; endIndex: number }[] {
  const sections: { heading: string; level: number; content: string; startIndex: number; endIndex: number }[] = [];
  const lines = markdown.split('\n');
  let currentSection: { heading: string; level: number; startIndex: number; contentStart: number } | null = null;
  let lineIndex = 0;
  let charIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);

    if (headingMatch) {
      // Close previous section
      if (currentSection) {
        sections.push({
          heading: currentSection.heading,
          level: currentSection.level,
          content: markdown.slice(currentSection.contentStart, charIndex).trim(),
          startIndex: currentSection.startIndex,
          endIndex: charIndex,
        });
      }

      currentSection = {
        heading: headingMatch[2],
        level: headingMatch[1].length,
        startIndex: charIndex,
        contentStart: charIndex + line.length + 1,
      };
    }

    charIndex += line.length + 1; // +1 for newline
    lineIndex++;
  }

  // Close last section
  if (currentSection) {
    sections.push({
      heading: currentSection.heading,
      level: currentSection.level,
      content: markdown.slice(currentSection.contentStart).trim(),
      startIndex: currentSection.startIndex,
      endIndex: markdown.length,
    });
  }

  return sections;
}

// Regenerate a specific section
export async function regenerateSection(
  apiKey: string,
  modelId: string,
  fullMarkdown: string,
  sectionHeading: string,
  plan: DocPlan,
  feedback?: string
): Promise<string> {
  const sections = parseSections(fullMarkdown);
  const targetSection = sections.find(s => s.heading === sectionHeading);

  if (!targetSection) {
    throw new Error(`Section "${sectionHeading}" not found`);
  }

  const prompt = `You are regenerating a specific section of a D&D document. Your goal is to produce COMPREHENSIVE, PRODUCTION-READY content.

## Context
Document Title: ${plan.title}
Section to Regenerate: ${targetSection.heading}

## Entity Registry (for reference)
${JSON.stringify(plan.entityRegistry, null, 2)}

## Previous Section Content
${targetSection.content}

${feedback ? `## User Feedback\n${feedback}` : ''}

## Instructions
Regenerate this section with SIGNIFICANTLY MORE DETAIL than before. Make it production-ready content a DM can run directly at the table.

REQUIRED:
- Use :::readaloud boxes for descriptions players should hear
- Use :::note boxes for DM tips, DCs, and tactical advice
- Full stat blocks in :::statblock format for any monsters
- Every NPC gets personality, motivations, and sample dialogue
- Specify DCs for all skill checks (Easy 10, Medium 15, Hard 20)
- Include "what happens if" contingencies for player choices
- Detailed physical descriptions (2-3 paragraphs for major locations)
- Specific treasure amounts and item descriptions

Do NOT include the section heading itself, just the content.
Match the tone and style of the document.
Make this section LONGER and MORE DETAILED than the previous version.

Generate the improved section content:`;

  const messages: ChatMessage[] = [
    { role: 'system', content: DRAFT_SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ];

  // Use high max_tokens for section regeneration
  const response = await chatCompletion(apiKey, modelId, messages, undefined, 0.8, 8000);
  const newContent = response.choices[0]?.message?.content || '';

  // Replace the section in the original markdown
  const headingPrefix = '#'.repeat(targetSection.level);
  const newSection = `${headingPrefix} ${targetSection.heading}\n\n${newContent.trim()}`;

  return fullMarkdown.slice(0, targetSection.startIndex) + newSection + '\n\n' + fullMarkdown.slice(targetSection.endIndex).trim();
}
