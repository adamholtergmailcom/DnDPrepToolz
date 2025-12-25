'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Project, Asset, PipelineState } from '@/lib/types';
import { getProject, saveProject } from '@/lib/db';
import { getSettings } from '@/lib/storage';
import { generatePlan } from '@/lib/pipeline/plan';
import { generateDraft } from '@/lib/pipeline/draft';
import { generateAllAssets } from '@/lib/pipeline/assets';
import { renderToHtml } from '@/lib/pipeline/render';
import { editImageBananaPro } from '@/lib/falai';

type TabType = 'request' | 'plan' | 'draft' | 'assets' | 'preview';

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('request');
  const [pipeline, setPipeline] = useState<PipelineState>({ step: 'idle' });
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [twoColumn, setTwoColumn] = useState(true);

  // Editable fields
  const [editedRequest, setEditedRequest] = useState('');
  const [editedDocType, setEditedDocType] = useState('');
  const [editedMarkdown, setEditedMarkdown] = useState('');

  useEffect(() => {
    loadProject();
  }, [projectId]);

  const loadProject = async () => {
    try {
      const data = await getProject(projectId);
      if (!data) {
        router.push('/');
        return;
      }
      setProject(data);
      setEditedRequest(data.userRequest);
      setEditedDocType(data.docType || '');
      setEditedMarkdown(data.markdown || '');
    } catch (err) {
      console.error('Failed to load project:', err);
      router.push('/');
    } finally {
      setLoading(false);
    }
  };

  const saveProjectData = useCallback(async (updates: Partial<Project>) => {
    if (!project) return;
    const updated = { ...project, ...updates };
    setProject(updated);
    await saveProject(updated);
  }, [project]);

  const handleSaveRequest = async () => {
    await saveProjectData({
      userRequest: editedRequest,
      docType: editedDocType || undefined,
    });
  };

  const handleSaveMarkdown = async () => {
    await saveProjectData({ markdown: editedMarkdown });
  };

  // PIPELINE: Generate Plan
  const handleGeneratePlan = async () => {
    const settings = getSettings();
    if (!settings.openRouterApiKey) {
      alert('Please set your OpenRouter API key in Settings.');
      return;
    }

    setPipeline({ step: 'planning', progress: 'Generating document plan...' });
    setActiveTab('plan');

    try {
      const plan = await generatePlan(
        settings.openRouterApiKey,
        settings.defaultModelId,
        project!.userRequest,
        project!.docType
      );
      await saveProjectData({ docPlan: plan });
      setPipeline({ step: 'idle' });
    } catch (err) {
      setPipeline({
        step: 'idle',
        error: err instanceof Error ? err.message : 'Failed to generate plan',
      });
    }
  };

  // PIPELINE: Generate Draft
  const handleGenerateDraft = async () => {
    if (!project?.docPlan) {
      alert('Please generate a plan first.');
      return;
    }

    const settings = getSettings();
    if (!settings.openRouterApiKey) {
      alert('Please set your OpenRouter API key in Settings.');
      return;
    }

    setPipeline({ step: 'drafting', progress: 'Generating document content...' });
    setActiveTab('draft');

    try {
      const markdown = await generateDraft(
        settings.openRouterApiKey,
        settings.defaultModelId,
        project.docPlan
      );
      await saveProjectData({ markdown });
      setEditedMarkdown(markdown);
      setPipeline({ step: 'idle' });
    } catch (err) {
      setPipeline({
        step: 'idle',
        error: err instanceof Error ? err.message : 'Failed to generate draft',
      });
    }
  };

  // PIPELINE: Generate Assets
  const handleGenerateAssets = async () => {
    if (!project?.docPlan) {
      alert('Please generate a plan first.');
      return;
    }

    const settings = getSettings();
    if (!settings.falApiKey) {
      alert('Please set your fal.ai API key in Settings.');
      return;
    }

    setPipeline({ step: 'generating-assets', progress: 'Generating images...' });
    setActiveTab('assets');

    try {
      const { assets, pendingApprovals } = await generateAllAssets(
        settings.falApiKey,
        project.docPlan.assetPlan,
        project.assets,
        (assetId, status) => {
          setPipeline({ step: 'generating-assets', progress: `${assetId}: ${status}` });
        }
      );
      await saveProjectData({ assets });

      if (pendingApprovals.length > 0) {
        setPipeline({
          step: 'idle',
          progress: `${pendingApprovals.length} map(s) awaiting approval`,
        });
      } else {
        setPipeline({ step: 'idle' });
      }
    } catch (err) {
      setPipeline({
        step: 'idle',
        error: err instanceof Error ? err.message : 'Failed to generate assets',
      });
    }
  };

  // PIPELINE: Approve Pro Map
  const handleApproveProMap = async (assetId: string) => {
    const asset = project?.assets.find(a => a.id === assetId);
    if (!asset || asset.mapStatus !== 'preview') return;

    const settings = getSettings();
    if (!settings.falApiKey) {
      alert('Please set your fal.ai API key in Settings.');
      return;
    }

    setPipeline({ step: 'generating-assets', progress: `Generating Pro map for ${assetId}...` });

    try {
      const result = await editImageBananaPro(settings.falApiKey, {
        prompt: asset.prompt,
        image_urls: [asset.previewUrl!],
        resolution: '2K',
      });

      const updatedAsset: Asset = {
        ...asset,
        urls: [result.images[0]?.url || asset.urls[0]],
        width: result.images[0]?.width,
        height: result.images[0]?.height,
        model: 'fal-ai/nano-banana-pro/edit',
        mapStatus: 'pro-generated',
      };

      const updatedAssets = project!.assets.map(a =>
        a.id === assetId ? updatedAsset : a
      );

      await saveProjectData({ assets: updatedAssets });
      setPipeline({ step: 'idle' });
    } catch (err) {
      setPipeline({
        step: 'idle',
        error: err instanceof Error ? err.message : 'Failed to generate Pro map',
      });
    }
  };

  // PIPELINE: Build Preview
  const handleBuildPreview = () => {
    if (!project?.markdown) {
      alert('Please generate a draft first.');
      return;
    }

    setPipeline({ step: 'rendering', progress: 'Building preview...' });
    setActiveTab('preview');

    try {
      const html = renderToHtml(project.markdown, project.assets, {
        twoColumn,
        includeStyles: true,
      });
      setPreviewHtml(html);
      setPipeline({ step: 'idle' });
    } catch (err) {
      setPipeline({
        step: 'idle',
        error: err instanceof Error ? err.message : 'Failed to build preview',
      });
    }
  };

  // PIPELINE: Export PDF
  const handleExportPdf = async () => {
    if (!previewHtml) {
      alert('Please build a preview first.');
      return;
    }

    setPipeline({ step: 'rendering', progress: 'Generating PDF...' });

    try {
      const response = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: previewHtml }),
      });

      if (!response.ok) {
        throw new Error('PDF generation failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project?.name || 'document'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      setPipeline({ step: 'idle' });
    } catch (err) {
      setPipeline({
        step: 'idle',
        error: err instanceof Error ? err.message : 'Failed to export PDF',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-red-800 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  const pendingMapApprovals = project.assets.filter(a => a.isMap && a.mapStatus === 'preview');

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-red-900 text-white py-4 px-6 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-2xl font-serif font-bold hover:text-yellow-300 transition">
              D&D PDF Studio
            </Link>
            <span className="text-yellow-300">/</span>
            <h1 className="text-lg font-medium">{project.name}</h1>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/settings" className="text-sm hover:text-yellow-300 transition">
              Settings
            </Link>
          </nav>
        </div>
      </header>

      {/* Pipeline Status */}
      {(pipeline.step !== 'idle' || pipeline.error) && (
        <div className={`px-6 py-3 ${pipeline.error ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
          <div className="max-w-7xl mx-auto flex items-center gap-3">
            {pipeline.step !== 'idle' && (
              <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></div>
            )}
            <span>{pipeline.error || pipeline.progress}</span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="bg-white border-b px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-3">
          <button
            onClick={handleGeneratePlan}
            disabled={pipeline.step !== 'idle'}
            className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
          >
            Generate Plan
          </button>
          <button
            onClick={handleGenerateDraft}
            disabled={pipeline.step !== 'idle' || !project.docPlan}
            className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
          >
            Generate Draft
          </button>
          <button
            onClick={handleGenerateAssets}
            disabled={pipeline.step !== 'idle' || !project.docPlan}
            className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
          >
            Generate Assets
          </button>
          <button
            onClick={handleBuildPreview}
            disabled={pipeline.step !== 'idle' || !project.markdown}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
          >
            Build Preview
          </button>
          <button
            onClick={handleExportPdf}
            disabled={pipeline.step !== 'idle' || !previewHtml}
            className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
          >
            Export PDF
          </button>

          <div className="flex-1"></div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={twoColumn}
              onChange={(e) => setTwoColumn(e.target.checked)}
              className="w-4 h-4"
            />
            Two-column layout
          </label>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b px-6">
        <div className="max-w-7xl mx-auto flex">
          {(['request', 'plan', 'draft', 'assets', 'preview'] as TabType[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === tab
                  ? 'border-red-800 text-red-800'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'assets' && pendingMapApprovals.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-500 text-white rounded-full">
                  {pendingMapApprovals.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto">
          {/* Request Tab */}
          {activeTab === 'request' && (
            <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Your Request
                </label>
                <textarea
                  value={editedRequest}
                  onChange={(e) => setEditedRequest(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document Type (optional)
                </label>
                <input
                  type="text"
                  value={editedDocType}
                  onChange={(e) => setEditedDocType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <button
                onClick={handleSaveRequest}
                className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-700 transition"
              >
                Save Changes
              </button>
            </div>
          )}

          {/* Plan Tab */}
          {activeTab === 'plan' && (
            <div className="bg-white rounded-lg shadow-md p-6">
              {project.docPlan ? (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-serif font-bold text-red-900">{project.docPlan.title}</h2>
                    {project.docPlan.subtitle && (
                      <p className="text-lg text-gray-600 italic">{project.docPlan.subtitle}</p>
                    )}
                    <p className="text-sm text-gray-500 mt-1">Tone: {project.docPlan.tone}</p>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-gray-900 mb-3">Sections</h3>
                    <div className="space-y-2">
                      {project.docPlan.sections.map(section => (
                        <div key={section.id} className="border-l-4 border-amber-500 pl-3 py-1">
                          <div className="font-medium">{section.heading}</div>
                          <div className="text-sm text-gray-500">~{section.wordCount} words</div>
                          {section.subsections && section.subsections.length > 0 && (
                            <ul className="ml-4 mt-1 text-sm text-gray-600">
                              {section.subsections.map(sub => (
                                <li key={sub.id}>{sub.heading} (~{sub.wordCount} words)</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-3">Entity Registry</h3>
                      <div className="space-y-4 text-sm">
                        {project.docPlan.entityRegistry.npcs.length > 0 && (
                          <div>
                            <h4 className="font-medium text-gray-700">NPCs</h4>
                            <ul className="ml-2">
                              {project.docPlan.entityRegistry.npcs.map(e => (
                                <li key={e.id} className="text-gray-600">
                                  <span className="font-medium">{e.name}</span>: {e.summary}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {project.docPlan.entityRegistry.locations.length > 0 && (
                          <div>
                            <h4 className="font-medium text-gray-700">Locations</h4>
                            <ul className="ml-2">
                              {project.docPlan.entityRegistry.locations.map(e => (
                                <li key={e.id} className="text-gray-600">
                                  <span className="font-medium">{e.name}</span>: {e.summary}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {project.docPlan.entityRegistry.monsters.length > 0 && (
                          <div>
                            <h4 className="font-medium text-gray-700">Monsters</h4>
                            <ul className="ml-2">
                              {project.docPlan.entityRegistry.monsters.map(e => (
                                <li key={e.id} className="text-gray-600">
                                  <span className="font-medium">{e.name}</span>: {e.summary}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {project.docPlan.entityRegistry.items.length > 0 && (
                          <div>
                            <h4 className="font-medium text-gray-700">Items</h4>
                            <ul className="ml-2">
                              {project.docPlan.entityRegistry.items.map(e => (
                                <li key={e.id} className="text-gray-600">
                                  <span className="font-medium">{e.name}</span>{e.rarity && ` [${e.rarity}]`}: {e.summary}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-3">Asset Plan</h3>
                      <div className="space-y-2 text-sm">
                        {project.docPlan.assetPlan.map(asset => (
                          <div key={asset.id} className="p-2 bg-gray-50 rounded">
                            <div className="font-medium">{asset.purpose}</div>
                            <div className="text-gray-500 text-xs">
                              {asset.isMap && <span className="text-amber-600">[MAP] </span>}
                              {asset.aspectRatio && <span>{asset.aspectRatio}</span>}
                            </div>
                            <div className="text-gray-600 mt-1 text-xs">{asset.promptSeed}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <details>
                      <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                        View Raw JSON
                      </summary>
                      <pre className="mt-2 p-4 bg-gray-100 rounded text-xs overflow-auto">
                        {JSON.stringify(project.docPlan, null, 2)}
                      </pre>
                    </details>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <p>No plan generated yet.</p>
                  <p className="text-sm mt-2">Click &quot;Generate Plan&quot; to create a document plan.</p>
                </div>
              )}
            </div>
          )}

          {/* Draft Tab */}
          {activeTab === 'draft' && (
            <div className="bg-white rounded-lg shadow-md p-6">
              {project.markdown ? (
                <div className="space-y-4">
                  <textarea
                    value={editedMarkdown}
                    onChange={(e) => setEditedMarkdown(e.target.value)}
                    rows={30}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <button
                    onClick={handleSaveMarkdown}
                    className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-700 transition"
                  >
                    Save Changes
                  </button>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <p>No draft generated yet.</p>
                  <p className="text-sm mt-2">Click &quot;Generate Draft&quot; to create document content.</p>
                </div>
              )}
            </div>
          )}

          {/* Assets Tab */}
          {activeTab === 'assets' && (
            <div className="space-y-6">
              {pendingMapApprovals.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h3 className="font-bold text-amber-900 mb-2">Maps Awaiting Approval</h3>
                  <p className="text-sm text-amber-800 mb-4">
                    These maps have preview versions. Click &quot;Approve Pro Map&quot; to generate high-quality versions using the Pro model.
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    {pendingMapApprovals.map(asset => (
                      <div key={asset.id} className="bg-white rounded-lg p-4 shadow-sm">
                        <div className="font-medium mb-2">{asset.purpose}</div>
                        {asset.previewUrl && (
                          <img
                            src={asset.previewUrl}
                            alt={asset.purpose}
                            className="w-full rounded mb-3"
                          />
                        )}
                        <button
                          onClick={() => handleApproveProMap(asset.id)}
                          disabled={pipeline.step !== 'idle'}
                          className="w-full px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
                        >
                          Approve Pro Map
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {project.assets.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {project.assets.map(asset => (
                    <div key={asset.id} className="bg-white rounded-lg shadow-md overflow-hidden">
                      {asset.urls[0] && (
                        <img
                          src={asset.urls[0]}
                          alt={asset.purpose}
                          className="w-full h-48 object-cover"
                        />
                      )}
                      <div className="p-4">
                        <div className="font-medium text-gray-900">{asset.purpose}</div>
                        <div className="text-sm text-gray-500 mt-1">
                          {asset.isMap && (
                            <span className={`inline-block px-2 py-0.5 rounded text-xs mr-2 ${
                              asset.mapStatus === 'pro-generated'
                                ? 'bg-green-100 text-green-800'
                                : asset.mapStatus === 'approved'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {asset.mapStatus === 'pro-generated' ? 'Pro' : asset.mapStatus === 'approved' ? 'Approved' : 'Preview'}
                            </span>
                          )}
                          {asset.model}
                        </div>
                        <div className="text-xs text-gray-400 mt-2 line-clamp-2">{asset.prompt}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow-md p-12 text-center text-gray-500">
                  <p>No assets generated yet.</p>
                  <p className="text-sm mt-2">Click &quot;Generate Assets&quot; to create images.</p>
                </div>
              )}
            </div>
          )}

          {/* Preview Tab */}
          {activeTab === 'preview' && (
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              {previewHtml ? (
                <iframe
                  srcDoc={previewHtml}
                  className="w-full h-[800px] border-0"
                  title="Document Preview"
                />
              ) : (
                <div className="p-12 text-center text-gray-500">
                  <p>No preview built yet.</p>
                  <p className="text-sm mt-2">Click &quot;Build Preview&quot; to render the document.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
