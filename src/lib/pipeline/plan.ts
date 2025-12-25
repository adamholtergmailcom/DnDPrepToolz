// Step A: PLAN - Generate document plan from user request
// Outputs structured JSON with title, sections, entities, and asset plan

import { DocPlan, ChatMessage, EntityRegistry, PlanSection, AssetPlanEntry } from '../types';
import { chatCompletionJson } from '../openrouter';

const PLAN_SYSTEM_PROMPT = `You are an expert D&D content designer and writer. Your task is to create a detailed document plan for D&D content.

You MUST respond with ONLY valid JSON, no markdown formatting, no extra text.

The plan should include:
1. A compelling title and optional subtitle
2. The tone/style of the content (e.g., "dark fantasy", "whimsical adventure", "gritty noir")
3. A list of sections with headings and estimated word counts
4. An entity registry tracking all NPCs, factions, locations, monsters, and items
5. An asset plan for images to generate

Rules:
- Each entity must have a unique stable ID (use snake_case, e.g., "lord_vantus", "twisted_caverns")
- Cross-link related entities using their IDs
- For monsters, include a "needsStatBlock: true" flag if a full 5e stat block is needed
- For maps (isMap: true), provide detailed promptSeed for visual generation
- Be thorough but focused on what the user requested

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
      "id": "asset_id",
      "purpose": "What this image is for (e.g., 'Town Map', 'NPC Portrait')",
      "promptSeed": "Detailed visual description for image generation",
      "aspectRatio": "landscape_16_9 or square or portrait_4_3",
      "isMap": false
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

export async function generatePlan(
  apiKey: string,
  modelId: string,
  userRequest: string,
  docType?: string
): Promise<DocPlan> {
  const messages: ChatMessage[] = [
    { role: 'system', content: PLAN_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Create a document plan for the following D&D content request:

User Request: ${userRequest}
${docType ? `Document Type: ${docType}` : ''}

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
