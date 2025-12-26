// Step C: ASSETS - Generate images using fal.ai

import { Asset, AssetPlanEntry, ToolCall } from '../types';
import { generateImageZ, editImageBanana, removeBackground } from '../falai';

export interface AssetGenerationResult {
  asset: Asset;
  needsApproval?: boolean;
}

// Map aspect ratio strings to fal.ai z-image format
function mapAspectRatio(ratio?: string): 'square_hd' | 'square' | 'portrait_4_3' | 'portrait_16_9' | 'landscape_4_3' | 'landscape_16_9' {
  switch (ratio) {
    case '16:9':
    case 'landscape_16_9':
      return 'landscape_16_9';
    case '4:3':
    case 'landscape_4_3':
      return 'landscape_4_3';
    case '9:16':
    case 'portrait_16_9':
      return 'portrait_16_9';
    case '3:4':
    case 'portrait_4_3':
      return 'portrait_4_3';
    case '1:1':
    case 'square':
      return 'square';
    case 'square_hd':
      return 'square_hd';
    default:
      return 'landscape_16_9';
  }
}

// Map aspect ratio to Nano Banana format (simpler format like '16:9')
function mapAspectRatioToBanana(ratio?: string): '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9' {
  switch (ratio) {
    case '16:9':
    case 'landscape_16_9':
      return '16:9';
    case '4:3':
    case 'landscape_4_3':
      return '4:3';
    case '9:16':
    case 'portrait_16_9':
      return '9:16';
    case '3:4':
    case 'portrait_4_3':
      return '3:4';
    case '21:9':
      return '21:9';
    case '1:1':
    case 'square':
    case 'square_hd':
      return '1:1';
    default:
      return '16:9';
  }
}

// Generate a single asset
export async function generateAsset(
  falApiKey: string,
  planEntry: AssetPlanEntry,
  existingAsset?: Asset
): Promise<AssetGenerationResult> {
  const assetId = planEntry.id;
  const prompt = enhancePrompt(planEntry.promptSeed, planEntry.purpose, planEntry.isMap);
  const imageSize = mapAspectRatio(planEntry.aspectRatio);

  // For maps, we generate a preview first
  if (planEntry.isMap) {
    // If we already have a preview, return it with needsApproval flag
    if (existingAsset?.mapStatus === 'preview' || existingAsset?.mapStatus === 'approved') {
      return {
        asset: existingAsset,
        needsApproval: existingAsset.mapStatus === 'preview',
      };
    }

    // Import the text-to-image function
    const { generateImageBanana } = await import('../falai');

    // Generate map preview directly with Nano Banana text-to-image
    const result = await generateImageBanana(falApiKey, {
      prompt: `${prompt}, top-down fantasy map, detailed cartography, parchment style, crisp lines, clear labels`,
      aspect_ratio: mapAspectRatioToBanana(planEntry.aspectRatio),
    });

    const previewUrl = result.images[0]?.url;

    if (!previewUrl) {
      throw new Error('Failed to generate map preview');
    }

    const asset: Asset = {
      id: assetId,
      purpose: planEntry.purpose,
      prompt: prompt,
      promptSeed: planEntry.promptSeed,
      model: 'fal-ai/nano-banana',
      urls: [previewUrl],
      width: result.images[0]?.width,
      height: result.images[0]?.height,
      isMap: true,
      mapStatus: 'preview',
      previewUrl: previewUrl,
      createdAt: new Date().toISOString(),
    };

    return { asset, needsApproval: true };
  }

  // Non-map assets: generate with z-image
  const result = await generateImageZ(falApiKey, {
    prompt: prompt,
    image_size: imageSize,
    num_images: 1,
    enable_prompt_expansion: false,
  });

  const imageUrl = result.images[0]?.url;

  if (!imageUrl) {
    throw new Error('Failed to generate image');
  }

  // Check if this is a token/icon that needs background removal
  const needsBgRemoval = planEntry.purpose.toLowerCase().includes('token') ||
    planEntry.purpose.toLowerCase().includes('icon') ||
    planEntry.purpose.toLowerCase().includes('portrait');

  let finalUrl = imageUrl;
  let model = 'fal-ai/z-image/turbo';

  if (needsBgRemoval && planEntry.purpose.toLowerCase().includes('token')) {
    try {
      const bgRemoved = await removeBackground(falApiKey, { image_url: imageUrl });
      finalUrl = bgRemoved.image.url;
      model = 'fal-ai/z-image/turbo + smoretalk-ai/rembg-enhance';
    } catch {
      console.error('Background removal failed, using original image');
    }
  }

  const asset: Asset = {
    id: assetId,
    purpose: planEntry.purpose,
    prompt: prompt,
    promptSeed: planEntry.promptSeed,
    model: model,
    urls: [finalUrl],
    width: result.images[0]?.width,
    height: result.images[0]?.height,
    isMap: false,
    createdAt: new Date().toISOString(),
  };

  return { asset };
}

// Generate all assets from plan
export async function generateAllAssets(
  falApiKey: string,
  assetPlan: AssetPlanEntry[],
  existingAssets: Asset[],
  onProgress?: (assetId: string, status: string) => void
): Promise<{ assets: Asset[]; pendingApprovals: string[] }> {
  const assets: Asset[] = [...existingAssets];
  const pendingApprovals: string[] = [];

  for (const planEntry of assetPlan) {
    // Check if we already have this asset
    const existingIndex = assets.findIndex(a => a.id === planEntry.id);
    const existing = existingIndex >= 0 ? assets[existingIndex] : undefined;

    // Skip if we already have a final version
    if (existing && !existing.isMap) {
      continue;
    }

    if (existing?.isMap && existing.mapStatus === 'finalized') {
      continue;
    }

    onProgress?.(planEntry.id, 'generating');

    try {
      const result = await generateAsset(falApiKey, planEntry, existing);

      if (existingIndex >= 0) {
        assets[existingIndex] = result.asset;
      } else {
        assets.push(result.asset);
      }

      if (result.needsApproval) {
        pendingApprovals.push(planEntry.id);
      }

      onProgress?.(planEntry.id, result.needsApproval ? 'pending-approval' : 'complete');
    } catch (error) {
      onProgress?.(planEntry.id, `error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return { assets, pendingApprovals };
}

// Enhance prompt with D&D-specific styling
function enhancePrompt(promptSeed: string, purpose: string, isMap: boolean): string {
  const baseEnhancements = 'high quality, detailed, fantasy art style';

  if (isMap) {
    return `${promptSeed}, top-down view, fantasy map, detailed cartography, ${baseEnhancements}`;
  }

  if (purpose.toLowerCase().includes('portrait') || purpose.toLowerCase().includes('npc')) {
    return `${promptSeed}, character portrait, fantasy RPG art, dramatic lighting, ${baseEnhancements}`;
  }

  if (purpose.toLowerCase().includes('item') || purpose.toLowerCase().includes('weapon') || purpose.toLowerCase().includes('armor')) {
    return `${promptSeed}, fantasy item illustration, detailed, isolated on dark background, ${baseEnhancements}`;
  }

  if (purpose.toLowerCase().includes('monster') || purpose.toLowerCase().includes('creature')) {
    return `${promptSeed}, fantasy creature illustration, dynamic pose, ${baseEnhancements}`;
  }

  if (purpose.toLowerCase().includes('scene') || purpose.toLowerCase().includes('location')) {
    return `${promptSeed}, fantasy landscape, atmospheric, ${baseEnhancements}`;
  }

  return `${promptSeed}, ${baseEnhancements}`;
}

// Execute tool call for asset generation
export async function executeAssetToolCall(
  falApiKey: string,
  toolCall: ToolCall,
  mapApprovalFlags: Record<string, boolean>
): Promise<string> {
  const args = JSON.parse(toolCall.function.arguments);

  switch (toolCall.function.name) {
    case 'create_image_z': {
      const result = await generateImageZ(falApiKey, {
        prompt: args.prompt,
        image_size: args.image_size,
        num_images: parseInt(args.num_images) || 1,
        enable_prompt_expansion: false,
      });
      return JSON.stringify({
        success: true,
        images: result.images.map(img => ({ url: img.url, width: img.width, height: img.height })),
      });
    }

    case 'edit_image_banana': {
      const imageUrls = JSON.parse(args.image_urls);
      const result = await editImageBanana(falApiKey, {
        prompt: args.prompt,
        image_urls: imageUrls,
        aspect_ratio: args.aspect_ratio,
      });
      return JSON.stringify({
        success: true,
        images: result.images.map(img => ({ url: img.url, width: img.width, height: img.height })),
      });
    }

    case 'remove_bg': {
      const result = await removeBackground(falApiKey, {
        image_url: args.image_url,
      });
      return JSON.stringify({
        success: true,
        image: { url: result.image.url, width: result.image.width, height: result.image.height },
      });
    }

    case 'propose_map_pro': {
      // Check if this map has been approved
      const mapId = args.map_id || 'unknown';
      if (!mapApprovalFlags[mapId]) {
        return JSON.stringify({
          success: false,
          status: 'NEEDS_APPROVAL',
          message: 'Pro map generation requires user approval. The map preview must be approved before running the pro model.',
        });
      }

      // If approved, this would trigger pro generation
      // For now, return that it's approved and will be processed
      return JSON.stringify({
        success: true,
        status: 'APPROVED',
        message: 'Map approved for pro generation. Process separately.',
      });
    }

    default:
      return JSON.stringify({
        success: false,
        error: `Unknown tool: ${toolCall.function.name}`,
      });
  }
}

// Approve a map preview as the final version (no Pro upgrade)
export function approveMap(asset: Asset): Asset {
  return {
    ...asset,
    mapStatus: 'approved',
  };
}

// Revise a map with user feedback using Nano Banana (regular)
export async function reviseMapWithFeedback(
  falApiKey: string,
  asset: Asset,
  feedback: string
): Promise<Asset> {
  if (!asset.previewUrl) {
    throw new Error('No preview URL to revise');
  }

  const revisedPrompt = `${asset.prompt}. User feedback: ${feedback}`;

  const result = await editImageBanana(falApiKey, {
    prompt: revisedPrompt,
    image_urls: [asset.previewUrl],
    aspect_ratio: '16:9',
  });

  const revisedUrl = result.images[0]?.url;

  if (!revisedUrl) {
    throw new Error('Failed to generate revised map');
  }

  return {
    ...asset,
    urls: [revisedUrl],
    previewUrl: revisedUrl,
    mapStatus: 'preview',
    mapFeedback: feedback,
    model: 'fal-ai/nano-banana/edit (revised)',
  };
}

// Finalize a map by refining with edit and upscaling with SeedVR2
export async function finalizeMapWithPro(
  falApiKey: string,
  asset: Asset
): Promise<Asset> {
  const { editImageBanana, upscaleImageSeedVR } = await import('../falai');

  if (!asset.previewUrl) {
    throw new Error('No preview URL to finalize');
  }

  // Step 1: Refine with Nano Banana edit
  const refined = await editImageBanana(falApiKey, {
    prompt: `${asset.prompt}. Sharpen fine details, improve clarity, fix any visual artifacts or inconsistencies, create a high-quality finalized render of this map`,
    image_urls: [asset.previewUrl],
    aspect_ratio: '16:9',
  });

  const refinedUrl = refined.images[0]?.url;

  if (!refinedUrl) {
    throw new Error('Failed to refine map');
  }

  // Step 2: Upscale to 4K with SeedVR2
  const upscaled = await upscaleImageSeedVR(falApiKey, {
    image_url: refinedUrl,
    upscale_mode: 'target',
    target_resolution: '2160p',
    output_format: 'png',
  });

  const finalUrl = upscaled.image?.url;

  if (!finalUrl) {
    throw new Error('Failed to upscale map');
  }

  return {
    ...asset,
    urls: [finalUrl],
    mapStatus: 'finalized',
    model: 'fal-ai/nano-banana/edit + fal-ai/seedvr/upscale (4K)',
    width: upscaled.image?.width,
    height: upscaled.image?.height,
  };
}
