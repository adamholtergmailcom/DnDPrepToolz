// Step A: PLAN - Generate document plan from user request
// Outputs structured JSON with title, sections, entities, and asset plan

import { DocPlan, ChatMessage, EntityRegistry, PlanSection, AssetPlanEntry } from '../types';
import { chatCompletionJson } from '../openrouter';

const PLAN_SYSTEM_PROMPT = `You are an expert D&D content designer and writer. Your task is to create a COMPREHENSIVE, PRODUCTION-READY document plan for D&D content that a DM can run directly at the table.

You MUST respond with ONLY valid JSON, no markdown formatting, no extra text.

## CRITICAL: Content Depth Requirements

Your plans MUST be detailed enough to produce COMPLETE, RUNNABLE content:

- **One-Shots/Adventures**: Plan for 8,000-15,000+ words minimum. Include all encounters, NPCs with dialogue, room descriptions, plot hooks, clues, and resolutions.
- **Mysteries**: Must be fully solvable with multiple clues, red herrings, suspects with alibis, investigation mechanics, and dramatic reveals.
- **Town/Location Guides**: Include every notable building, multiple NPCs with names/personalities/secrets, local conflicts, rumors, and adventure hooks.
- **Dungeons**: Every room fully detailed with descriptions, traps, treasure, and monster tactics.
- **NPCs**: Full backgrounds, motivations, secrets, example dialogue, and hooks to involve them in adventures.
- **Monsters**: Complete stat blocks, tactics, lair descriptions, and plot hooks for using them.

The plan should include:
1. A compelling title and optional subtitle
2. The tone/style of the content (e.g., "dark fantasy", "whimsical adventure", "gritty noir")
3. A list of sections with headings and REALISTIC word counts (be generous - DMs need details!)
4. An entity registry tracking all NPCs, factions, locations, monsters, and items
5. An asset plan for images to generate

## Word Count Guidelines (MINIMUM per section type):
- Introduction/Overview: 300-500 words
- Major Location (with sub-areas): 1,500-3,000 words
- Key NPC: 400-800 words (background, personality, motivations, dialogue)
- Combat Encounter: 500-1,000 words (setup, tactics, environment, aftermath)
- Mystery/Investigation: 2,000-4,000 words (clues, suspects, investigation, resolution)
- Full Dungeon Room: 200-400 words each
- Plot Hooks/Adventure Seeds: 150-300 words each

Rules:
- Each entity must have a unique stable ID (use snake_case, e.g., "lord_vantus", "twisted_caverns")
- Cross-link related entities using their IDs
- For monsters, include a "needsStatBlock: true" flag if a full 5e stat block is needed
- For maps (isMap: true), provide detailed promptSeed for visual generation
- BE THOROUGH - Create enough sections with enough word counts to make a complete, usable document

IMPORTANT - Asset Plan Requirements:
- Generate an image asset for EVERY monster in the monsters list
- Generate a portrait asset for EVERY major NPC in the npcs list
- Generate at least one location illustration for key locations
- Generate at least one map if the content involves exploration or combat areas
- Each asset must have a unique ID that matches the entity it represents (e.g., monster "shadow_drake" should have asset "shadow_drake_image")

Response format:
{
  "title": "string",
  "subtitle": "string or null",
  "tone": "string describing the style/mood",
  "sections": [
    {
      "id": "section_id",
      "heading": "Section Title",
      "wordCount": 500,
      "subsections": [
        { "id": "subsection_id", "heading": "Subsection Title", "wordCount": 200 }
      ]
    }
  ],
  "entityRegistry": {
    "npcs": [
      { "id": "npc_id", "name": "NPC Name", "summary": "Brief description", "crossLinks": ["location_id", "faction_id"] }
    ],
    "factions": [
      { "id": "faction_id", "name": "Faction Name", "summary": "Brief description", "crossLinks": [] }
    ],
    "locations": [
      { "id": "location_id", "name": "Location Name", "summary": "Brief description", "crossLinks": [] }
    ],
    "monsters": [
      { "id": "monster_id", "name": "Monster Name", "summary": "Brief description", "crossLinks": [], "needsStatBlock": true }
    ],
    "items": [
      { "id": "item_id", "name": "Item Name", "summary": "Brief description", "rarity": "uncommon", "crossLinks": [] }
    ]
  },
  "assetPlan": [
    {
      "id": "npc_portrait_id",
      "purpose": "Portrait of major NPC",
      "promptSeed": "Detailed visual description for image generation",
      "aspectRatio": "portrait_4_3",
      "isMap": false
    },
    {
      "id": "location_map_id",
      "purpose": "Map of the location",
      "promptSeed": "Top-down map of the area showing key features, entrances, and points of interest",
      "aspectRatio": "landscape_16_9",
      "isMap": true
    }
  ]
}`;


function validateDocPlan(data: unknown): DocPlan | null {
  if (!data || typeof data !== 'object') return null;

  const plan = data as Record<string, unknown>;

  // Required fields
  if (typeof plan.title !== 'string' || !plan.title) return null;
  if (typeof plan.tone !== 'string' || !plan.tone) return null;
  if (!Array.isArray(plan.sections) || plan.sections.length === 0) return null;
  if (!plan.entityRegistry || typeof plan.entityRegistry !== 'object') return null;
  if (!Array.isArray(plan.assetPlan)) return null;

  // Validate sections
  const sections: PlanSection[] = [];
  for (const s of plan.sections) {
    if (typeof s !== 'object' || !s) return null;
    const section = s as Record<string, unknown>;
    if (typeof section.id !== 'string' || typeof section.heading !== 'string') return null;

    sections.push({
      id: section.id,
      heading: section.heading,
      wordCount: typeof section.wordCount === 'number' ? section.wordCount : 500,
      subsections: Array.isArray(section.subsections)
        ? section.subsections.map((sub: Record<string, unknown>) => ({
          id: String(sub.id || ''),
          heading: String(sub.heading || ''),
          wordCount: typeof sub.wordCount === 'number' ? sub.wordCount : 200,
        }))
        : undefined,
    });
  }

  // Validate entity registry
  const er = plan.entityRegistry as Record<string, unknown>;
  const entityRegistry: EntityRegistry = {
    npcs: Array.isArray(er.npcs)
      ? er.npcs.map((e: Record<string, unknown>) => ({
        id: String(e.id || ''),
        name: String(e.name || ''),
        summary: String(e.summary || ''),
        crossLinks: Array.isArray(e.crossLinks) ? e.crossLinks.map(String) : [],
      }))
      : [],
    factions: Array.isArray(er.factions)
      ? er.factions.map((e: Record<string, unknown>) => ({
        id: String(e.id || ''),
        name: String(e.name || ''),
        summary: String(e.summary || ''),
        crossLinks: Array.isArray(e.crossLinks) ? e.crossLinks.map(String) : [],
      }))
      : [],
    locations: Array.isArray(er.locations)
      ? er.locations.map((e: Record<string, unknown>) => ({
        id: String(e.id || ''),
        name: String(e.name || ''),
        summary: String(e.summary || ''),
        crossLinks: Array.isArray(e.crossLinks) ? e.crossLinks.map(String) : [],
      }))
      : [],
    monsters: Array.isArray(er.monsters)
      ? er.monsters.map((e: Record<string, unknown>) => ({
        id: String(e.id || ''),
        name: String(e.name || ''),
        summary: String(e.summary || ''),
        crossLinks: Array.isArray(e.crossLinks) ? e.crossLinks.map(String) : [],
      }))
      : [],
    items: Array.isArray(er.items)
      ? er.items.map((e: Record<string, unknown>) => ({
        id: String(e.id || ''),
        name: String(e.name || ''),
        summary: String(e.summary || ''),
        rarity: typeof e.rarity === 'string' ? e.rarity : undefined,
        crossLinks: Array.isArray(e.crossLinks) ? e.crossLinks.map(String) : [],
      }))
      : [],
  };

  // Validate asset plan
  const assetPlan: AssetPlanEntry[] = Array.isArray(plan.assetPlan)
    ? plan.assetPlan.map((a: Record<string, unknown>) => ({
      id: String(a.id || crypto.randomUUID()),
      purpose: String(a.purpose || ''),
      promptSeed: String(a.promptSeed || ''),
      aspectRatio: typeof a.aspectRatio === 'string' ? a.aspectRatio : undefined,
      isMap: Boolean(a.isMap),
    }))
    : [];

  return {
    title: String(plan.title),
    subtitle: typeof plan.subtitle === 'string' ? plan.subtitle : undefined,
    tone: String(plan.tone),
    sections,
    entityRegistry,
    assetPlan,
  };
}

// Context options for plan generation
export interface PlanContext {
  partyLevel?: number;
  partySize?: number;
  worldDescription?: string;
  campaignNotes?: string;
  customInstructions?: string;
}

export async function generatePlan(
  apiKey: string,
  modelId: string,
  userRequest: string,
  docType?: string,
  context?: PlanContext
): Promise<DocPlan> {
  // Build context section if provided
  let contextSection = '';
  if (context) {
    const contextParts: string[] = [];
    if (context.partyLevel) {
      contextParts.push(`Party Level: ${context.partyLevel}`);
    }
    if (context.partySize) {
      contextParts.push(`Party Size: ${context.partySize} players`);
    }
    if (context.worldDescription) {
      contextParts.push(`World/Setting: ${context.worldDescription}`);
    }
    if (context.campaignNotes) {
      contextParts.push(`Campaign Notes: ${context.campaignNotes}`);
    }
    if (context.customInstructions) {
      contextParts.push(`Special Instructions: ${context.customInstructions}`);
    }
    if (contextParts.length > 0) {
      contextSection = `\n\nCampaign Context:\n${contextParts.join('\n')}`;
    }
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: PLAN_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Create a document plan for the following D&D content request:

User Request: ${userRequest}
${docType ? `Document Type: ${docType}` : ''}${contextSection}

Available image generation tools:
- create_image_z: Text-to-image generation (portraits, illustrations, icons)
- edit_image_banana: Refine/edit existing images
- remove_bg: Remove background for tokens/icons
- propose_map_pro: High-quality map generation (requires user approval)

For maps, set isMap: true in the asset plan. Maps will go through a preview → approval → pro generation workflow.

Respond with ONLY the JSON plan, no other text.`,
    },
  ];

  return chatCompletionJson<DocPlan>(apiKey, modelId, messages, validateDocPlan);
}

