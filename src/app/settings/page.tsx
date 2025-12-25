'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getSettings, saveSettings } from '@/lib/storage';
import { AppSettings } from '@/lib/types';
import ModelPicker from '@/components/ModelPicker';

// Wrapper to safely initialize settings on client side
function useClientSettings(): [AppSettings, React.Dispatch<React.SetStateAction<AppSettings>>] {
  const [settings, setSettings] = useState<AppSettings>(() => {
    // This runs only on client since getSettings checks for window
    return getSettings();
  });
  return [settings, setSettings];
}

export default function SettingsPage() {
  const [settings, setSettings] = useClientSettings();
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-red-900 text-white py-4 px-6 shadow-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-2xl font-serif font-bold hover:text-yellow-300 transition">
            D&D PDF Studio
          </Link>
          <nav>
            <Link href="/" className="text-sm hover:text-yellow-300 transition">
              ← Back to Projects
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-3xl font-serif font-bold text-gray-900 mb-6">Settings</h1>

        <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
          {/* OpenRouter API Key */}
          <div>
            <label htmlFor="openrouter-key" className="block text-sm font-medium text-gray-700 mb-1">
              OpenRouter API Key
            </label>
            <input
              id="openrouter-key"
              type="password"
              value={settings.openRouterApiKey}
              onChange={(e) => setSettings({ ...settings, openRouterApiKey: e.target.value })}
              placeholder="sk-or-..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Get your API key from{' '}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                openrouter.ai/keys
              </a>
            </p>
          </div>

          {/* fal.ai API Key */}
          <div>
            <label htmlFor="fal-key" className="block text-sm font-medium text-gray-700 mb-1">
              fal.ai API Key
            </label>
            <input
              id="fal-key"
              type="password"
              value={settings.falApiKey}
              onChange={(e) => setSettings({ ...settings, falApiKey: e.target.value })}
              placeholder="fal-..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Get your API key from{' '}
              <a
                href="https://fal.ai/dashboard/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                fal.ai/dashboard/keys
              </a>
            </p>
          </div>

          {/* Model Picker */}
          <ModelPicker
            apiKey={settings.openRouterApiKey}
            selectedModelId={settings.defaultModelId}
            onSelect={(modelId) => setSettings({ ...settings, defaultModelId: modelId })}
          />

          {/* Save Button */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-red-800 text-white rounded-md hover:bg-red-700 transition font-medium"
            >
              Save Settings
            </button>
            {saved && (
              <span className="text-green-600 font-medium">Settings saved!</span>
            )}
          </div>
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-amber-50 border border-amber-200 rounded-lg p-6">
          <h2 className="text-lg font-serif font-bold text-amber-900 mb-3">About API Keys</h2>
          <ul className="space-y-2 text-sm text-amber-800">
            <li>
              <strong>OpenRouter:</strong> Used for LLM text generation (planning, drafting). Supports many models including GPT-4, Claude, and Gemini.
            </li>
            <li>
              <strong>fal.ai:</strong> Used for image generation (portraits, maps, item art). Uses models like z-image/turbo and nano-banana for high-quality results.
            </li>
            <li>
              <strong>Security:</strong> API keys are stored locally in your browser&apos;s localStorage. They are never sent to any server except the respective API providers.
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}
