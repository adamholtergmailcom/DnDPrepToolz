// fal.ai API integration for image generation
// Never logs API keys

// Image generation with z-image/turbo
export interface ZImageInput {
  prompt: string;
  image_size?: 'square_hd' | 'square' | 'portrait_4_3' | 'portrait_16_9' | 'landscape_4_3' | 'landscape_16_9';
  num_images?: number;
  output_format?: 'jpeg' | 'png';
  enable_prompt_expansion?: boolean;
}

export interface ZImageOutput {
  images: {
    url: string;
    content_type: string;
    width?: number;
    height?: number;
  }[];
  seed?: number;
  prompt?: string;
}

export async function generateImageZ(apiKey: string, input: ZImageInput): Promise<ZImageOutput> {
  const response = await fetch('https://fal.run/fal-ai/z-image/turbo', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: input.prompt,
      image_size: input.image_size,
      num_images: input.num_images || 1,
      output_format: input.output_format || 'png',
      enable_prompt_expansion: input.enable_prompt_expansion ?? false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`fal.ai z-image error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Image editing with nano-banana/edit
export interface NanoBananaEditInput {
  prompt: string;
  image_urls: string[];
  aspect_ratio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9';
  output_format?: 'jpeg' | 'png';
}

export interface NanoBananaOutput {
  images: {
    url: string;
    content_type: string;
    width?: number;
    height?: number;
  }[];
}

export async function editImageBanana(apiKey: string, input: NanoBananaEditInput): Promise<NanoBananaOutput> {
  const response = await fetch('https://fal.run/fal-ai/nano-banana/edit', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: input.prompt,
      image_urls: input.image_urls,
      aspect_ratio: input.aspect_ratio,
      output_format: input.output_format || 'png',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`fal.ai nano-banana/edit error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Pro map generation with nano-banana-pro/edit
export interface NanoBananaProEditInput {
  prompt: string;
  image_urls: string[];
  resolution?: '1K' | '2K' | '4K';
  output_format?: 'jpeg' | 'png';
}

export async function editImageBananaPro(apiKey: string, input: NanoBananaProEditInput): Promise<NanoBananaOutput> {
  const response = await fetch('https://fal.run/fal-ai/nano-banana-pro/edit', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: input.prompt,
      image_urls: input.image_urls,
      resolution: input.resolution || '2K',
      output_format: input.output_format || 'png',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`fal.ai nano-banana-pro/edit error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Text-to-image with nano-banana-pro (fresh generation)
export interface NanoBananaProInput {
  prompt: string;
  aspect_ratio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9';
  resolution?: '1K' | '2K' | '4K';
  output_format?: 'jpeg' | 'png';
}

export async function generateImageBananaPro(apiKey: string, input: NanoBananaProInput): Promise<NanoBananaOutput> {
  const response = await fetch('https://fal.run/fal-ai/nano-banana-pro', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: input.prompt,
      aspect_ratio: input.aspect_ratio,
      resolution: input.resolution || '2K',
      output_format: input.output_format || 'png',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`fal.ai nano-banana-pro error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Background removal with rembg-enhance
export interface RembgInput {
  image_url: string;
}

export interface RembgOutput {
  image: {
    url: string;
    content_type: string;
    width?: number;
    height?: number;
  };
}

export async function removeBackground(apiKey: string, input: RembgInput): Promise<RembgOutput> {
  const response = await fetch('https://fal.run/smoretalk-ai/rembg-enhance', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_url: input.image_url,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`fal.ai rembg-enhance error: ${response.status} - ${errorText}`);
  }

  return response.json();
}
