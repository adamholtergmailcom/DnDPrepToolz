'use client';

import { useState } from 'react';
import { DocPlan, EntityRegistry, ChatMessage } from '@/lib/types';
import { chatCompletion } from '@/lib/openrouter';
import { getSettings } from '@/lib/storage';

interface EntityEditorProps {
  docPlan: DocPlan;
  onUpdate: (newPlan: DocPlan) => Promise<void>;
  onRegenerateSection?: (sectionHeading: string, feedback?: string) => Promise<void>;
}

type EntityType = 'npcs' | 'locations' | 'monsters' | 'items' | 'factions';

interface EntityItem {
  id: string;
  name: string;
  summary: string;
  crossLinks?: string[];
  rarity?: string;
  type: EntityType;
}

export default function EntityEditor({ docPlan, onUpdate, onRegenerateSection }: EntityEditorProps) {
  const [selectedEntity, setSelectedEntity] = useState<EntityItem | null>(null);
  const [editMode, setEditMode] = useState<'view' | 'edit' | 'link'>('view');
  const [editPrompt, setEditPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [linkTarget, setLinkTarget] = useState('');

  // Flatten all entities into a single list
  const getAllEntities = (): EntityItem[] => {
    const entities: EntityItem[] = [];

    for (const npc of docPlan.entityRegistry.npcs) {
      entities.push({ ...npc, type: 'npcs' });
    }
    for (const loc of docPlan.entityRegistry.locations) {
      entities.push({ ...loc, type: 'locations' });
    }
    for (const monster of docPlan.entityRegistry.monsters) {
      entities.push({ ...monster, type: 'monsters' });
    }
    for (const item of docPlan.entityRegistry.items) {
      entities.push({ ...item, type: 'items' });
    }
    for (const faction of docPlan.entityRegistry.factions) {
      entities.push({ ...faction, type: 'factions' });
    }

    return entities;
  };

  const allEntities = getAllEntities();

  const getEntityTypeLabel = (type: EntityType): string => {
    switch (type) {
      case 'npcs': return 'NPC';
      case 'locations': return 'Location';
      case 'monsters': return 'Monster';
      case 'items': return 'Item';
      case 'factions': return 'Faction';
    }
  };

  const getEntityTypeColor = (type: EntityType): string => {
    switch (type) {
      case 'npcs': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'locations': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'monsters': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'items': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'factions': return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
    }
  };

  const handleEditEntity = async () => {
    if (!selectedEntity || !editPrompt.trim()) return;

    const settings = getSettings();
    if (!settings.openRouterApiKey) {
      alert('Please set your OpenRouter API key in Settings.');
      return;
    }

    setLoading(true);

    try {
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: `You are editing a D&D entity. Update the entity based on the user's request. Respond with ONLY valid JSON containing the updated entity.

Current entity:
${JSON.stringify(selectedEntity, null, 2)}

The response MUST be valid JSON with these fields:
{
  "name": "Updated name (or keep original)",
  "summary": "Updated summary description (make it detailed and useful for DMs)",
  "crossLinks": ["array", "of", "related", "entity", "ids"]
}

Available entity IDs to link to:
${allEntities.filter(e => e.id !== selectedEntity.id).map(e => `- ${e.id}: ${e.name} (${e.type})`).join('\n')}`,
        },
        {
          role: 'user',
          content: editPrompt,
        },
      ];

      const response = await chatCompletion(
        settings.openRouterApiKey,
        settings.defaultModelId,
        messages,
        undefined,
        0.5
      );

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('No response from model');

      // Parse the JSON response
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
      else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
      if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
      jsonStr = jsonStr.trim();

      const updated = JSON.parse(jsonStr);

      // Update the entity in the plan
      const newRegistry: EntityRegistry = { ...docPlan.entityRegistry };
      const typeKey = selectedEntity.type;

      newRegistry[typeKey] = newRegistry[typeKey].map((e) =>
        e.id === selectedEntity.id
          ? {
              ...e,
              name: updated.name || e.name,
              summary: updated.summary || e.summary,
              crossLinks: updated.crossLinks || e.crossLinks,
            }
          : e
      );

      await onUpdate({
        ...docPlan,
        entityRegistry: newRegistry,
      });

      // Find related sections and offer to regenerate
      const relatedSections = docPlan.sections.filter(s =>
        s.heading.toLowerCase().includes(selectedEntity.name.toLowerCase()) ||
        s.id.includes(selectedEntity.id)
      );

      if (relatedSections.length > 0 && onRegenerateSection) {
        const regenerate = confirm(
          `Entity updated! Would you like to regenerate related sections?\n\n` +
          `Sections that may need updating:\n${relatedSections.map(s => `- ${s.heading}`).join('\n')}`
        );

        if (regenerate) {
          for (const section of relatedSections) {
            await onRegenerateSection(section.heading, `Updated entity "${updated.name}": ${updated.summary}`);
          }
        }
      }

      setEditMode('view');
      setEditPrompt('');
      setSelectedEntity({ ...selectedEntity, ...updated });
    } catch (error) {
      console.error('Failed to edit entity:', error);
      alert('Failed to edit entity. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddLink = async () => {
    if (!selectedEntity || !linkTarget) return;

    const newRegistry: EntityRegistry = { ...docPlan.entityRegistry };
    const typeKey = selectedEntity.type;

    newRegistry[typeKey] = newRegistry[typeKey].map((e) =>
      e.id === selectedEntity.id
        ? {
            ...e,
            crossLinks: [...(e.crossLinks || []), linkTarget].filter(
              (v, i, a) => a.indexOf(v) === i
            ),
          }
        : e
    );

    await onUpdate({
      ...docPlan,
      entityRegistry: newRegistry,
    });

    setSelectedEntity({
      ...selectedEntity,
      crossLinks: [...(selectedEntity.crossLinks || []), linkTarget].filter(
        (v, i, a) => a.indexOf(v) === i
      ),
    });
    setLinkTarget('');
  };

  const handleRemoveLink = async (linkId: string) => {
    if (!selectedEntity) return;

    const newRegistry: EntityRegistry = { ...docPlan.entityRegistry };
    const typeKey = selectedEntity.type;

    newRegistry[typeKey] = newRegistry[typeKey].map((e) =>
      e.id === selectedEntity.id
        ? {
            ...e,
            crossLinks: (e.crossLinks || []).filter((l) => l !== linkId),
          }
        : e
    );

    await onUpdate({
      ...docPlan,
      entityRegistry: newRegistry,
    });

    setSelectedEntity({
      ...selectedEntity,
      crossLinks: (selectedEntity.crossLinks || []).filter((l) => l !== linkId),
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Entity Manager</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Click an entity to view, edit, or link it to other entities.
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Entity List */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">All Entities</h4>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {allEntities.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">No entities in plan yet.</p>
            ) : (
              allEntities.map((entity) => (
                <button
                  key={entity.id}
                  onClick={() => {
                    setSelectedEntity(entity);
                    setEditMode('view');
                    setEditPrompt('');
                  }}
                  className={`w-full text-left p-3 rounded-lg border transition ${
                    selectedEntity?.id === entity.id
                      ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getEntityTypeColor(entity.type)}`}>
                      {getEntityTypeLabel(entity.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {entity.name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                        {entity.summary}
                      </div>
                      {entity.crossLinks && entity.crossLinks.length > 0 && (
                        <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          Links: {entity.crossLinks.length}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Entity Details */}
        <div>
          {selectedEntity ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {selectedEntity.name}
                </h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditMode('view')}
                    className={`px-2 py-1 text-xs rounded ${
                      editMode === 'view'
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    View
                  </button>
                  <button
                    onClick={() => setEditMode('edit')}
                    className={`px-2 py-1 text-xs rounded ${
                      editMode === 'edit'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setEditMode('link')}
                    className={`px-2 py-1 text-xs rounded ${
                      editMode === 'link'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    Link
                  </button>
                </div>
              </div>

              {editMode === 'view' && (
                <div className="space-y-3">
                  <div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getEntityTypeColor(selectedEntity.type)}`}>
                      {getEntityTypeLabel(selectedEntity.type)}
                    </span>
                    {selectedEntity.rarity && (
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                        [{selectedEntity.rarity}]
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{selectedEntity.summary}</p>

                  {selectedEntity.crossLinks && selectedEntity.crossLinks.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Linked To:</div>
                      <div className="flex flex-wrap gap-1">
                        {selectedEntity.crossLinks.map((linkId) => {
                          const linked = allEntities.find((e) => e.id === linkId);
                          return (
                            <span
                              key={linkId}
                              className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-xs"
                            >
                              {linked?.name || linkId}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {editMode === 'edit' && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Describe how you want to modify this entity. The AI will update it based on your prompt.
                  </p>
                  <textarea
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder="e.g., Make this NPC more mysterious and add a secret connection to the villain..."
                    className="w-full h-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleEditEntity}
                    disabled={loading || !editPrompt.trim()}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
                  >
                    {loading ? 'Updating...' : 'Update Entity'}
                  </button>
                </div>
              )}

              {editMode === 'link' && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Link this entity to other entities in your document.
                  </p>

                  {/* Current Links */}
                  {selectedEntity.crossLinks && selectedEntity.crossLinks.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Current Links:</div>
                      <div className="flex flex-wrap gap-1">
                        {selectedEntity.crossLinks.map((linkId) => {
                          const linked = allEntities.find((e) => e.id === linkId);
                          return (
                            <span
                              key={linkId}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-xs"
                            >
                              {linked?.name || linkId}
                              <button
                                onClick={() => handleRemoveLink(linkId)}
                                className="hover:text-red-500"
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Add Link */}
                  <div>
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Add Link:</div>
                    <div className="flex gap-2">
                      <select
                        value={linkTarget}
                        onChange={(e) => setLinkTarget(e.target.value)}
                        className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                      >
                        <option value="">Select entity...</option>
                        {allEntities
                          .filter(
                            (e) =>
                              e.id !== selectedEntity.id &&
                              !selectedEntity.crossLinks?.includes(e.id)
                          )
                          .map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.name} ({getEntityTypeLabel(e.type)})
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={handleAddLink}
                        disabled={!linkTarget}
                        className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <p>Select an entity to view or edit</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
