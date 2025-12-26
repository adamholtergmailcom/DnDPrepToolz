// OpenRouter API integration with tool-calling support
// Never logs API keys

import { OpenRouterModel, ChatMessage, ToolDefinition, ToolCall } from './types';

const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';

// Fetch available models from OpenRouter
export async function fetchModels(apiKey: string): Promise<OpenRouterModel[]> {
  const response = await fetch(`${OPENROUTER_API_BASE}/models`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`);
  }

  const data = await response.json();
  return data.data || [];
}

// Chat completion response type
export interface ChatCompletionResponse {
  id: string;
  choices: {
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }[];
}

// Chat completion with optional tool calling
export async function chatCompletion(
  apiKey: string,
  modelId: string,
  messages: ChatMessage[],
  tools?: ToolDefinition[],
  temperature: number = 0.7,
  maxTokens?: number
): Promise<ChatCompletionResponse> {
  const body: Record<string, unknown> = {
    model: modelId,
    messages,
    temperature,
  };

  // Use high max_tokens for content generation - most models support at least 16K output
  if (maxTokens) {
    body.max_tokens = maxTokens;
  }

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
      'X-Title': 'D&D PDF Studio',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Tool definitions for the agent pipeline
export const agentTools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'create_image_z',
      description: 'Generate an image using fal-ai/z-image/turbo text-to-image model',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'The detailed prompt describing the image to generate',
          },
          image_size: {
            type: 'string',
            description: 'Image size. Options: square_hd, square, portrait_4_3, portrait_16_9, landscape_4_3, landscape_16_9',
            enum: ['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'],
          },
          num_images: {
            type: 'string',
            description: 'Number of images to generate (1-4)',
          },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_image_banana',
      description: 'Edit or refine an existing image using fal-ai/nano-banana/edit',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'The prompt describing the desired edits or refinements',
          },
          image_urls: {
            type: 'string',
            description: 'JSON array of image URLs to use as reference/input',
          },
          aspect_ratio: {
            type: 'string',
            description: 'Aspect ratio. Options: 1:1, 16:9, 9:16, 4:3, 3:4, 21:9',
            enum: ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'],
          },
        },
        required: ['prompt', 'image_urls'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_bg',
      description: 'Remove background from an image using smoretalk-ai/rembg-enhance',
      parameters: {
        type: 'object',
        properties: {
          image_url: {
            type: 'string',
            description: 'The URL of the image to remove background from',
          },
        },
        required: ['image_url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_map_pro',
      description: 'Request a high-quality Pro map generation. This requires user approval before execution.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'The prompt for the Pro map',
          },
          image_urls: {
            type: 'string',
            description: 'JSON array of reference/preview image URLs',
          },
          resolution: {
            type: 'string',
            description: 'Resolution. Options: 1K, 2K, 4K',
            enum: ['1K', '2K', '4K'],
          },
        },
        required: ['prompt', 'image_urls'],
      },
    },
  },
];

// Execute a tool-calling loop
export async function executeToolLoop(
  apiKey: string,
  modelId: string,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  executeToolFn: (toolCall: ToolCall) => Promise<string>,
  maxIterations: number = 10
): Promise<{ messages: ChatMessage[]; finalContent: string | null }> {
  const currentMessages = [...messages];
  let iterations = 0;

  while (iterations < maxIterations) {
    const response = await chatCompletion(apiKey, modelId, currentMessages, tools);
    const choice = response.choices[0];

    if (!choice) {
      throw new Error('No response from model');
    }

    // Add assistant message
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: choice.message.content,
    };

    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      assistantMessage.tool_calls = choice.message.tool_calls;
    }

    currentMessages.push(assistantMessage);

    // If no tool calls, we're done
    if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
      return { messages: currentMessages, finalContent: choice.message.content };
    }

    // Execute tool calls
    for (const toolCall of choice.message.tool_calls) {
      const result = await executeToolFn(toolCall);
      currentMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result,
      });
    }

    iterations++;
  }

  throw new Error('Max tool iterations reached');
}

// JSON-only chat completion with validation and retry
export async function chatCompletionJson<T>(
  apiKey: string,
  modelId: string,
  messages: ChatMessage[],
  validateFn: (data: unknown) => T | null,
  maxRetries: number = 3
): Promise<T> {
  let lastError: string = '';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const currentMessages = [...messages];

    if (attempt > 0 && lastError) {
      currentMessages.push({
        role: 'user',
        content: `Your previous response was invalid JSON or failed validation. Error: ${lastError}\n\nPlease provide a valid JSON response only, with no markdown formatting or extra text.`,
      });
    }

    const response = await chatCompletion(apiKey, modelId, currentMessages, undefined, 0.3);
    const content = response.choices[0]?.message?.content;

    if (!content) {
      lastError = 'Empty response from model';
      continue;
    }

    try {
      // Try to extract JSON from the response
      let jsonStr = content.trim();

      // Remove markdown code blocks if present
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
      jsonStr = jsonStr.trim();

      const parsed = JSON.parse(jsonStr);
      const validated = validateFn(parsed);

      if (validated) {
        return validated;
      }

      lastError = 'JSON validation failed - missing required fields';
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'JSON parse error';
    }
  }

  throw new Error(`Failed to get valid JSON after ${maxRetries} attempts. Last error: ${lastError}`);
}
