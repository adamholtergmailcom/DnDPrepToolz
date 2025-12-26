'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getSettings, saveSettings } from '@/lib/storage';
import { AppSettings } from '@/lib/types';
import ModelPicker from '@/components/ModelPicker';
import { useTheme } from '@/components/ThemeProvider';

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
  const { theme, setTheme } = useTheme();

  const handleSave = () => {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
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
        <h1 className="text-3xl font-serif font-bold text-gray-900 dark:text-gray-100 mb-6">Settings</h1>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 space-y-6">
          {/* OpenRouter API Key */}
          <div>
            <label htmlFor="openrouter-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              OpenRouter API Key
            </label>
            <input
              id="openrouter-key"
              type="password"
              value={settings.openRouterApiKey}
              onChange={(e) => setSettings({ ...settings, openRouterApiKey: e.target.value })}
              placeholder="sk-or-..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
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
            <label htmlFor="fal-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              fal.ai API Key
            </label>
            <input
              id="fal-key"
              type="password"
              value={settings.falApiKey}
              onChange={(e) => setSettings({ ...settings, falApiKey: e.target.value })}
              placeholder="fal-..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
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

          {/* Theme Selection */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Appearance</h3>
            <div className="flex gap-2">
              {(['light', 'dark', 'system'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition ${
                    theme === t
                      ? 'bg-red-800 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {t === 'light' && 'Light'}
                  {t === 'dark' && 'Dark'}
                  {t === 'system' && 'System'}
                </button>
              ))}
            </div>
          </div>

          {/* Shared Context / Campaign Defaults */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Campaign Defaults</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              This context is automatically included in all generations across all projects.
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="party-level" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Default Party Level
                  </label>
                  <select
                    id="party-level"
                    value={settings.sharedContext?.defaultPartyLevel || 5}
                    onChange={(e) => setSettings({
                      ...settings,
                      sharedContext: {
                        ...settings.sharedContext,
                        defaultPartyLevel: parseInt(e.target.value),
                        defaultPartySize: settings.sharedContext?.defaultPartySize || 4,
                        worldDescription: settings.sharedContext?.worldDescription || '',
                        customInstructions: settings.sharedContext?.customInstructions || '',
                      }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  >
                    {Array.from({ length: 20 }, (_, i) => i + 1).map(level => (
                      <option key={level} value={level}>Level {level}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="party-size" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Default Party Size
                  </label>
                  <select
                    id="party-size"
                    value={settings.sharedContext?.defaultPartySize || 4}
                    onChange={(e) => setSettings({
                      ...settings,
                      sharedContext: {
                        ...settings.sharedContext,
                        defaultPartySize: parseInt(e.target.value),
                        defaultPartyLevel: settings.sharedContext?.defaultPartyLevel || 5,
                        worldDescription: settings.sharedContext?.worldDescription || '',
                        customInstructions: settings.sharedContext?.customInstructions || '',
                      }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  >
                    {Array.from({ length: 8 }, (_, i) => i + 1).map(size => (
                      <option key={size} value={size}>{size} players</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="world-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  World/Setting Description
                </label>
                <textarea
                  id="world-description"
                  value={settings.sharedContext?.worldDescription || ''}
                  onChange={(e) => setSettings({
                    ...settings,
                    sharedContext: {
                      ...settings.sharedContext,
                      worldDescription: e.target.value,
                      defaultPartyLevel: settings.sharedContext?.defaultPartyLevel || 5,
                      defaultPartySize: settings.sharedContext?.defaultPartySize || 4,
                      customInstructions: settings.sharedContext?.customInstructions || '',
                    }
                  })}
                  placeholder="e.g., Forgotten Realms, high magic setting. Sword Coast region. Year 1492 DR..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 h-24 resize-none bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <label htmlFor="custom-instructions" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Custom Generation Instructions
                </label>
                <textarea
                  id="custom-instructions"
                  value={settings.sharedContext?.customInstructions || ''}
                  onChange={(e) => setSettings({
                    ...settings,
                    sharedContext: {
                      ...settings.sharedContext,
                      customInstructions: e.target.value,
                      defaultPartyLevel: settings.sharedContext?.defaultPartyLevel || 5,
                      defaultPartySize: settings.sharedContext?.defaultPartySize || 4,
                      worldDescription: settings.sharedContext?.worldDescription || '',
                    }
                  })}
                  placeholder="e.g., Always include RP opportunities. Favor non-combat solutions. Include loot tables..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 h-24 resize-none bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex items-center gap-4 border-t border-gray-200 dark:border-gray-700 pt-6">
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-red-800 text-white rounded-md hover:bg-red-700 transition font-medium"
            >
              Save Settings
            </button>
            {saved && (
              <span className="text-green-600 dark:text-green-400 font-medium">Settings saved!</span>
            )}
          </div>
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-6">
          <h2 className="text-lg font-serif font-bold text-amber-900 dark:text-amber-200 mb-3">About API Keys</h2>
          <ul className="space-y-2 text-sm text-amber-800 dark:text-amber-300">
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
