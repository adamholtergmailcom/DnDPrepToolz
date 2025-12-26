'use client';

import { useState, useEffect, useMemo } from 'react';
import { OpenRouterModel } from '@/lib/types';
import { fetchModels } from '@/lib/openrouter';

interface ModelPickerProps {
  apiKey: string;
  selectedModelId: string;
  onSelect: (modelId: string) => void;
}

export default function ModelPicker({ apiKey, selectedModelId, onSelect }: ModelPickerProps) {
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!apiKey) {
      setModels([]);
      return;
    }

    const loadModels = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchModels(apiKey);
        // Sort by name
        const sorted = data.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
        setModels(sorted);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load models');
      } finally {
        setLoading(false);
      }
    };

    loadModels();
  }, [apiKey]);

  const filteredModels = useMemo(() => {
    if (!searchQuery) return models;
    const query = searchQuery.toLowerCase();
    return models.filter(
      m => m.id.toLowerCase().includes(query) || (m.name && m.name.toLowerCase().includes(query))
    );
  }, [models, searchQuery]);

  const selectedModel = models.find(m => m.id === selectedModelId);

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Default LLM Model
      </label>

      {!apiKey ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">Enter OpenRouter API key to load models</p>
      ) : loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          Loading models...
        </div>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="w-full px-3 py-2 text-left border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {selectedModel ? (
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">{selectedModel.name || selectedModel.id}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedModel.id}
                  {selectedModel.context_length && ` • ${(selectedModel.context_length / 1000).toFixed(0)}K context`}
                </div>
              </div>
            ) : (
              <span className="text-gray-500 dark:text-gray-400">{selectedModelId || 'Select a model...'}</span>
            )}
          </button>

          {isOpen && (
            <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-80 overflow-hidden">
              <div className="p-2 border-b dark:border-gray-600">
                <input
                  type="text"
                  placeholder="Search models..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div className="max-h-60 overflow-y-auto">
                {filteredModels.length === 0 ? (
                  <div className="p-3 text-center text-gray-500 dark:text-gray-400">No models found</div>
                ) : (
                  filteredModels.map(model => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                        onSelect(model.id);
                        setIsOpen(false);
                        setSearchQuery('');
                      }}
                      className={`w-full px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-900 ${
                        model.id === selectedModelId ? 'bg-blue-100 dark:bg-blue-800' : ''
                      }`}
                    >
                      <div className="font-medium text-gray-900 dark:text-gray-100">{model.name || model.id}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {model.id}
                        {model.context_length && ` • ${(model.context_length / 1000).toFixed(0)}K context`}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Default: google/gemini-3-flash-preview
      </p>
    </div>
  );
}
