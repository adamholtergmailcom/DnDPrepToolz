// Core Types for D&D PDF Studio

// Settings stored in localStorage
export interface AppSettings {
  openRouterApiKey: string;
  falApiKey: string;
  defaultModelId: string;
}

// OpenRouter Model
export interface OpenRouterModel {
  id: string;
  name: string;
  context_length?: number;
  pricing?: {
    prompt: string;
    completion: string;
  };
}

// Asset in a project
export interface Asset {
  id: string;
  purpose: string;
  prompt: string;
  promptSeed?: string;
  model: string;
  urls: string[];
  width?: number;
  height?: number;
  isMap?: boolean;
  mapStatus?: 'preview' | 'approved' | 'pro-generated';
  previewUrl?: string;
  createdAt: string;
}

// Entity types for the plan
export interface EntityNPC {
  id: string;
  name: string;
  summary: string;
  crossLinks?: string[];
}

export interface EntityFaction {
  id: string;
  name: string;
  summary: string;
  crossLinks?: string[];
}

export interface EntityLocation {
  id: string;
  name: string;
  summary: string;
  crossLinks?: string[];
}

export interface EntityMonster {
  id: string;
  name: string;
  summary: string;
  crossLinks?: string[];
  statBlock?: StatBlock;
}

export interface EntityItem {
  id: string;
  name: string;
  summary: string;
  crossLinks?: string[];
  rarity?: string;
}

// Stat Block for 5e monsters/NPCs
export interface StatBlock {
  name: string;
  size?: string;
  type?: string;
  alignment?: string;
  armorClass?: number;
  armorType?: string;
  hitPoints?: number;
  hitDice?: string;
  speed?: string;
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
  savingThrows?: string;
  skills?: string;
  damageResistances?: string;
  damageImmunities?: string;
  conditionImmunities?: string;
  senses?: string;
  languages?: string;
  challenge?: string;
  proficiencyBonus?: string;
  traits?: { name: string; description: string }[];
  actions?: { name: string; description: string }[];
  bonusActions?: { name: string; description: string }[];
  reactions?: { name: string; description: string }[];
  legendaryActions?: { name: string; description: string; cost?: number }[];
}

// Entity Registry in Plan
export interface EntityRegistry {
  npcs: EntityNPC[];
  factions: EntityFaction[];
  locations: EntityLocation[];
  monsters: EntityMonster[];
  items: EntityItem[];
}

// Section in the document plan
export interface PlanSection {
  id: string;
  heading: string;
  wordCount: number;
  subsections?: { id: string; heading: string; wordCount: number }[];
}

// Asset plan entry
export interface AssetPlanEntry {
  id: string;
  purpose: string;
  promptSeed: string;
  aspectRatio?: string;
  isMap: boolean;
}

// Document Plan (output of Step A)
export interface DocPlan {
  title: string;
  subtitle?: string;
  tone: string;
  sections: PlanSection[];
  entityRegistry: EntityRegistry;
  assetPlan: AssetPlanEntry[];
}

// Project
export interface Project {
  id: string;
  name: string;
  userRequest: string;
  docType?: string;
  docPlan?: DocPlan;
  markdown?: string;
  assets: Asset[];
  createdAt: string;
  updatedAt: string;
}

// Tool definitions for OpenRouter
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
      }>;
      required: string[];
    };
  };
}

// Tool call from LLM
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// Message for OpenRouter
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

// Pipeline status
export type PipelineStep = 'idle' | 'planning' | 'drafting' | 'generating-assets' | 'rendering';

export interface PipelineState {
  step: PipelineStep;
  progress?: string;
  error?: string;
}
