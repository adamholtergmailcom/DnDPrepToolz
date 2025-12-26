'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Project, PipelineState } from '@/lib/types';
import { getProject, saveProject } from '@/lib/db';
import { getSettings } from '@/lib/storage';
import { generatePlan } from '@/lib/pipeline/plan';
import { generateDraft, parseSections, regenerateSection } from '@/lib/pipeline/draft';
import {
  generateAllAssets,
  approveMap,
  reviseMapWithFeedback,
  finalizeMapWithPro,
  regenerateAsset,
  selectVariation,
} from '@/lib/pipeline/assets';
import { renderToHtml } from '@/lib/pipeline/render';

// Dynamic import for PageFlipper to avoid SSR issues
const PageFlipper = dynamic(() => import('@/components/PageFlipper'), {
  ssr: false,
  loading: () => <div className="p-12 text-center text-gray-500">Loading book view...</div>,
});

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
  const [previewMode, setPreviewMode] = useState<'document' | 'book'>('document');

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
    setSaveStatus('saving');
    const updated = { ...project, ...updates };
    setProject(updated);
    await saveProject(updated);
    setSaveStatus('saved');
    setLastSaved(new Date());
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

    if (!project) return;

    setPipeline({ step: 'planning', progress: 'Generating document plan...' });
    setActiveTab('plan');

    try {
      // Merge shared context from settings with project-specific context
      const planContext = {
        partyLevel: project.context?.partyLevel || settings.sharedContext?.defaultPartyLevel,
        partySize: project.context?.partySize || settings.sharedContext?.defaultPartySize,
        worldDescription: settings.sharedContext?.worldDescription,
        campaignNotes: project.context?.campaignNotes,
        customInstructions: settings.sharedContext?.customInstructions,
      };

      const plan = await generatePlan(
        settings.openRouterApiKey,
        settings.defaultModelId,
        project!.userRequest,
        project!.docType,
        planContext
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

  // Map workflow state
  const [feedbackModal, setFeedbackModal] = useState<{ assetId: string; isOpen: boolean }>({ assetId: '', isOpen: false });
  const [feedbackText, setFeedbackText] = useState('');

  // Asset edit/regenerate modal state
  const [assetEditModal, setAssetEditModal] = useState<{
    assetId: string;
    isOpen: boolean;
    mode: 'edit' | 'variations';
  }>({ assetId: '', isOpen: false, mode: 'edit' });
  const [editPrompt, setEditPrompt] = useState('');
  const [editAspectRatio, setEditAspectRatio] = useState('');
  const [numVariations, setNumVariations] = useState(4);

  // Lightbox state
  const [lightbox, setLightbox] = useState<{ isOpen: boolean; imageUrl: string; assetPurpose: string }>({
    isOpen: false,
    imageUrl: '',
    assetPurpose: '',
  });

  // Asset filter state
  const [assetFilter, setAssetFilter] = useState<'all' | 'portraits' | 'maps' | 'items' | 'scenes'>('all');

  // PDF export format modal
  const [exportModal, setExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'Letter' | 'A4' | 'A5' | 'Digest'>('Letter');

  // Save status for auto-save indicator
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Keyboard shortcuts state
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Section regeneration modal
  const [sectionModal, setSectionModal] = useState<{ isOpen: boolean; sectionHeading: string }>({
    isOpen: false,
    sectionHeading: '',
  });
  const [sectionFeedback, setSectionFeedback] = useState('');

  // MAP WORKFLOW: Approve (use preview as final)
  const handleApproveMap = async (assetId: string) => {
    const asset = project?.assets.find(a => a.id === assetId);
    if (!asset || asset.mapStatus !== 'preview') return;

    const approvedAsset = approveMap(asset);
    const updatedAssets = project!.assets.map(a => a.id === assetId ? approvedAsset : a);
    await saveProjectData({ assets: updatedAssets });
  };

  // MAP WORKFLOW: Finalize (upgrade to Pro)
  const handleFinalizeMap = async (assetId: string) => {
    const asset = project?.assets.find(a => a.id === assetId);
    if (!asset || !asset.previewUrl) return;

    const settings = getSettings();
    if (!settings.falApiKey) {
      alert('Please set your fal.ai API key in Settings.');
      return;
    }

    setPipeline({ step: 'generating-assets', progress: `Finalizing ${asset.purpose} with Pro...` });

    try {
      const finalizedAsset = await finalizeMapWithPro(settings.falApiKey, asset);
      const updatedAssets = project!.assets.map(a => a.id === assetId ? finalizedAsset : a);
      await saveProjectData({ assets: updatedAssets });
      setPipeline({ step: 'idle' });
    } catch (err) {
      setPipeline({
        step: 'idle',
        error: err instanceof Error ? err.message : 'Failed to finalize map',
      });
    }
  };

  // MAP WORKFLOW: Submit Feedback (revise with Nano Banana)
  const handleSubmitFeedback = async () => {
    const asset = project?.assets.find(a => a.id === feedbackModal.assetId);
    if (!asset || !feedbackText.trim()) return;

    const settings = getSettings();
    if (!settings.falApiKey) {
      alert('Please set your fal.ai API key in Settings.');
      return;
    }

    setPipeline({ step: 'generating-assets', progress: `Revising ${asset.purpose}...` });
    setFeedbackModal({ assetId: '', isOpen: false });

    try {
      const revisedAsset = await reviseMapWithFeedback(settings.falApiKey, asset, feedbackText);
      const updatedAssets = project!.assets.map(a => a.id === feedbackModal.assetId ? revisedAsset : a);
      await saveProjectData({ assets: updatedAssets });
      setFeedbackText('');
      setPipeline({ step: 'idle' });
    } catch (err) {
      setPipeline({
        step: 'idle',
        error: err instanceof Error ? err.message : 'Failed to revise map',
      });
    }
  };

  // ASSET EDIT: Open edit modal
  const openAssetEditModal = (assetId: string, mode: 'edit' | 'variations') => {
    const asset = project?.assets.find(a => a.id === assetId);
    if (!asset) return;

    setEditPrompt(asset.prompt);
    setEditAspectRatio(asset.aspectRatio || '');
    setAssetEditModal({ assetId, isOpen: true, mode });
  };

  // ASSET EDIT: Regenerate with new prompt
  const handleRegenerateAsset = async () => {
    const asset = project?.assets.find(a => a.id === assetEditModal.assetId);
    if (!asset) return;

    const settings = getSettings();
    if (!settings.falApiKey) {
      alert('Please set your fal.ai API key in Settings.');
      return;
    }

    setPipeline({ step: 'generating-assets', progress: `Regenerating ${asset.purpose}...` });
    setAssetEditModal({ assetId: '', isOpen: false, mode: 'edit' });

    try {
      const regenerated = await regenerateAsset(settings.falApiKey, asset, {
        newPrompt: editPrompt,
        aspectRatio: editAspectRatio || undefined,
        numVariations: assetEditModal.mode === 'variations' ? numVariations : 1,
      });

      const updatedAssets = project!.assets.map(a =>
        a.id === assetEditModal.assetId ? regenerated : a
      );
      await saveProjectData({ assets: updatedAssets });
      setPipeline({ step: 'idle' });
    } catch (err) {
      setPipeline({
        step: 'idle',
        error: err instanceof Error ? err.message : 'Failed to regenerate asset',
      });
    }
  };

  // ASSET EDIT: Select a variation
  const handleSelectVariation = async (assetId: string, variationIndex: number) => {
    const asset = project?.assets.find(a => a.id === assetId);
    if (!asset) return;

    const updated = selectVariation(asset, variationIndex);
    const updatedAssets = project!.assets.map(a => a.id === assetId ? updated : a);
    await saveProjectData({ assets: updatedAssets });
  };

  // ASSET EDIT: Quick regenerate (same prompt)
  const handleQuickRegenerate = async (assetId: string) => {
    const asset = project?.assets.find(a => a.id === assetId);
    if (!asset) return;

    const settings = getSettings();
    if (!settings.falApiKey) {
      alert('Please set your fal.ai API key in Settings.');
      return;
    }

    setPipeline({ step: 'generating-assets', progress: `Regenerating ${asset.purpose}...` });

    try {
      const regenerated = await regenerateAsset(settings.falApiKey, asset);
      const updatedAssets = project!.assets.map(a => a.id === assetId ? regenerated : a);
      await saveProjectData({ assets: updatedAssets });
      setPipeline({ step: 'idle' });
    } catch (err) {
      setPipeline({
        step: 'idle',
        error: err instanceof Error ? err.message : 'Failed to regenerate asset',
      });
    }
  };

  // Filter assets by type
  const getFilteredAssets = () => {
    if (!project?.assets) return [];
    if (assetFilter === 'all') return project.assets;

    return project.assets.filter(asset => {
      const purpose = asset.purpose.toLowerCase();
      switch (assetFilter) {
        case 'portraits':
          return purpose.includes('portrait') || purpose.includes('npc') || purpose.includes('character');
        case 'maps':
          return asset.isMap || purpose.includes('map');
        case 'items':
          return purpose.includes('item') || purpose.includes('weapon') || purpose.includes('armor') || purpose.includes('artifact');
        case 'scenes':
          return purpose.includes('scene') || purpose.includes('location') || purpose.includes('illustration');
        default:
          return true;
      }
    });
  };

  // SECTION REGENERATION
  const handleRegenerateSection = async () => {
    if (!project?.markdown || !project?.docPlan) return;

    const settings = getSettings();
    if (!settings.openRouterApiKey) {
      alert('Please set your OpenRouter API key in Settings.');
      return;
    }

    setSectionModal({ isOpen: false, sectionHeading: '' });
    setPipeline({ step: 'drafting', progress: `Regenerating "${sectionModal.sectionHeading}"...` });

    try {
      const newMarkdown = await regenerateSection(
        settings.openRouterApiKey,
        settings.defaultModelId,
        project.markdown,
        sectionModal.sectionHeading,
        project.docPlan,
        sectionFeedback || undefined
      );

      await saveProjectData({ markdown: newMarkdown });
      setEditedMarkdown(newMarkdown);
      setSectionFeedback('');
      setPipeline({ step: 'idle' });
    } catch (err) {
      setPipeline({
        step: 'idle',
        error: err instanceof Error ? err.message : 'Failed to regenerate section',
      });
    }
  };

  // Get sections from markdown for the draft view
  const markdownSections = project?.markdown ? parseSections(project.markdown) : [];

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

  // PIPELINE: Export PDF - opens format selector modal
  const handleExportPdf = () => {
    if (!previewHtml) {
      alert('Please build a preview first.');
      return;
    }
    setExportModal(true);
  };

  // PIPELINE: Actual PDF export with format
  const doExportPdf = async () => {
    setExportModal(false);
    setPipeline({ step: 'rendering', progress: `Generating ${exportFormat} PDF...` });

    try {
      const response = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: previewHtml, format: exportFormat }),
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

  // Keyboard shortcuts effect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;

      // ? - Show shortcuts help
      if (e.key === '?' && !isMod) {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
        return;
      }

      // Escape - Close modals
      if (e.key === 'Escape') {
        setShowShortcuts(false);
        setLightbox({ isOpen: false, imageUrl: '', assetPurpose: '' });
        setAssetEditModal({ assetId: '', isOpen: false, mode: 'edit' });
        setFeedbackModal({ assetId: '', isOpen: false });
        setExportModal(false);
        return;
      }

      // Tab navigation with 1-5
      if (!isMod && ['1', '2', '3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        const tabs: TabType[] = ['request', 'plan', 'draft', 'assets', 'preview'];
        setActiveTab(tabs[parseInt(e.key) - 1]);
        return;
      }

      // Mod+G - Generate (plan, draft, or assets depending on state)
      if (isMod && e.key === 'g') {
        e.preventDefault();
        if (!project?.docPlan) {
          handleGeneratePlan();
        } else if (!project?.markdown) {
          handleGenerateDraft();
        } else if (project.assets.length === 0) {
          handleGenerateAssets();
        }
        return;
      }

      // Mod+B - Build preview
      if (isMod && e.key === 'b') {
        e.preventDefault();
        handleBuildPreview();
        return;
      }

      // Mod+E - Export PDF
      if (isMod && e.key === 'e') {
        e.preventDefault();
        handleExportPdf();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

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
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col">
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
            {/* Save Status Indicator */}
            <span className="text-xs text-yellow-200">
              {saveStatus === 'saving' && 'Saving...'}
              {saveStatus === 'saved' && lastSaved && `Saved ${lastSaved.toLocaleTimeString()}`}
            </span>
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
      <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-3">
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
      <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6">
        <div className="max-w-7xl mx-auto flex">
          {(['request', 'plan', 'draft', 'assets', 'preview'] as TabType[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${activeTab === tab
                ? 'border-red-800 text-red-800 dark:text-red-400 dark:border-red-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
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
            <div className="space-y-6">
              {/* Main Request */}
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

              {/* Campaign Context */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Campaign Context</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Override global defaults or add project-specific context.
                </p>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Party Level
                      </label>
                      <select
                        value={project.context?.partyLevel || ''}
                        onChange={(e) => saveProjectData({
                          context: {
                            ...project.context,
                            partyLevel: e.target.value ? parseInt(e.target.value) : undefined,
                          }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        <option value="">Use default</option>
                        {Array.from({ length: 20 }, (_, i) => i + 1).map(level => (
                          <option key={level} value={level}>Level {level}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Party Size
                      </label>
                      <select
                        value={project.context?.partySize || ''}
                        onChange={(e) => saveProjectData({
                          context: {
                            ...project.context,
                            partySize: e.target.value ? parseInt(e.target.value) : undefined,
                          }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        <option value="">Use default</option>
                        {Array.from({ length: 8 }, (_, i) => i + 1).map(size => (
                          <option key={size} value={size}>{size} players</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Campaign Notes (optional)
                    </label>
                    <textarea
                      value={project.context?.campaignNotes || ''}
                      onChange={(e) => saveProjectData({
                        context: {
                          ...project.context,
                          campaignNotes: e.target.value,
                        }
                      })}
                      rows={4}
                      placeholder="Add any specific context for this project... e.g., this is set in a desert, the party just defeated the local bandit lord..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                </div>
              </div>
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
            <div className="space-y-4">
              {project.markdown ? (
                <>
                  {/* Section Navigation */}
                  {markdownSections.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Sections (click to regenerate)</h3>
                      <div className="flex flex-wrap gap-2">
                        {markdownSections.map((section, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setSectionModal({ isOpen: true, sectionHeading: section.heading });
                              setSectionFeedback('');
                            }}
                            disabled={pipeline.step !== 'idle'}
                            className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            style={{ paddingLeft: `${(section.level - 1) * 8 + 12}px` }}
                          >
                            {'#'.repeat(section.level)} {section.heading}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Editor */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                    <div className="space-y-4">
                      <textarea
                        value={editedMarkdown}
                        onChange={(e) => setEditedMarkdown(e.target.value)}
                        rows={30}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                      />
                      <button
                        onClick={handleSaveMarkdown}
                        className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-700 transition"
                      >
                        Save Changes
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-12 text-center text-gray-500 dark:text-gray-400">
                  <p>No draft generated yet.</p>
                  <p className="text-sm mt-2">Click &quot;Generate Draft&quot; to create document content.</p>
                </div>
              )}
            </div>
          )}

          {/* Assets Tab */}
          {activeTab === 'assets' && (
            <div className="space-y-6">
              {/* Asset Filter Buttons and Actions */}
              {project.assets.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={async () => {
                      for (const asset of project.assets) {
                        if (asset.urls[0]) {
                          const link = document.createElement('a');
                          link.href = asset.urls[0];
                          link.download = `${asset.purpose.replace(/\s+/g, '_')}.png`;
                          link.click();
                          await new Promise(r => setTimeout(r, 300)); // Small delay between downloads
                        }
                      }
                    }}
                    className="px-3 py-1.5 rounded-full text-sm font-medium bg-green-600 text-white hover:bg-green-500 transition"
                  >
                    Download All ({project.assets.length})
                  </button>
                  <span className="text-gray-300">|</span>
                  {(['all', 'portraits', 'maps', 'items', 'scenes'] as const).map(filter => (
                    <button
                      key={filter}
                      onClick={() => setAssetFilter(filter)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                        assetFilter === filter
                          ? 'bg-red-800 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {filter.charAt(0).toUpperCase() + filter.slice(1)}
                      <span className="ml-1 text-xs opacity-75">
                        ({filter === 'all'
                          ? project.assets.length
                          : project.assets.filter(a => {
                              const p = a.purpose.toLowerCase();
                              if (filter === 'portraits') return p.includes('portrait') || p.includes('npc') || p.includes('character');
                              if (filter === 'maps') return a.isMap || p.includes('map');
                              if (filter === 'items') return p.includes('item') || p.includes('weapon') || p.includes('armor') || p.includes('artifact');
                              if (filter === 'scenes') return p.includes('scene') || p.includes('location') || p.includes('illustration');
                              return false;
                            }).length
                        })
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {pendingMapApprovals.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h3 className="font-bold text-amber-900 mb-2">Maps Awaiting Review</h3>
                  <p className="text-sm text-amber-800 mb-4">
                    Review each map preview. <strong>Approve</strong> to use as-is, <strong>Finalize</strong> to upgrade with Pro model, or provide <strong>Feedback</strong> to revise.
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    {pendingMapApprovals.map(asset => (
                      <div key={asset.id} className="bg-white rounded-lg p-4 shadow-sm">
                        <div className="font-medium mb-2">{asset.purpose}</div>
                        {asset.mapFeedback && (
                          <div className="text-xs text-blue-600 mb-2 italic">
                            Previous feedback: {asset.mapFeedback}
                          </div>
                        )}
                        {asset.previewUrl && (
                          <img
                            src={asset.previewUrl}
                            alt={asset.purpose}
                            className="w-full rounded mb-3 cursor-pointer hover:opacity-90"
                            onClick={() => setLightbox({ isOpen: true, imageUrl: asset.previewUrl!, assetPurpose: asset.purpose })}
                          />
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApproveMap(asset.id)}
                            disabled={pipeline.step !== 'idle'}
                            className="flex-1 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleFinalizeMap(asset.id)}
                            disabled={pipeline.step !== 'idle'}
                            className="flex-1 px-3 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
                          >
                            Finalize Pro
                          </button>
                          <button
                            onClick={() => setFeedbackModal({ assetId: asset.id, isOpen: true })}
                            disabled={pipeline.step !== 'idle'}
                            className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
                          >
                            Feedback
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {project.assets.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {getFilteredAssets().map(asset => (
                    <div key={asset.id} className="bg-white rounded-lg shadow-md overflow-hidden">
                      {asset.urls[0] && (
                        <div
                          className="bg-gray-100 p-2 cursor-pointer hover:bg-gray-200 transition"
                          onClick={() => setLightbox({ isOpen: true, imageUrl: asset.urls[0], assetPurpose: asset.purpose })}
                        >
                          <img
                            src={asset.urls[0]}
                            alt={asset.purpose}
                            className="w-full h-auto max-h-64 object-contain mx-auto"
                          />
                        </div>
                      )}

                      {/* Variations Preview */}
                      {asset.allVariations && asset.allVariations.length > 1 && (
                        <div className="px-2 py-2 bg-gray-50 border-t">
                          <div className="text-xs text-gray-500 mb-1">Variations ({asset.allVariations.length}):</div>
                          <div className="flex gap-1 overflow-x-auto">
                            {asset.allVariations.map((url, idx) => (
                              <button
                                key={idx}
                                onClick={() => handleSelectVariation(asset.id, idx)}
                                className={`flex-shrink-0 w-12 h-12 rounded border-2 overflow-hidden transition ${
                                  asset.selectedVariationIndex === idx
                                    ? 'border-red-500'
                                    : 'border-transparent hover:border-gray-400'
                                }`}
                              >
                                <img src={url} alt={`Variation ${idx + 1}`} className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="p-4">
                        <div className="font-medium text-gray-900">{asset.purpose}</div>
                        <div className="text-sm text-gray-500 mt-1">
                          {asset.isMap && (
                            <span className={`inline-block px-2 py-0.5 rounded text-xs mr-2 ${asset.mapStatus === 'finalized'
                              ? 'bg-green-100 text-green-800'
                              : asset.mapStatus === 'approved'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                              }`}>
                              {asset.mapStatus === 'finalized' ? 'Pro' : asset.mapStatus === 'approved' ? 'Approved' : 'Preview'}
                            </span>
                          )}
                          {asset.model}
                        </div>
                        <div className="text-xs text-gray-400 mt-2 line-clamp-2">{asset.prompt}</div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                          <button
                            onClick={() => handleQuickRegenerate(asset.id)}
                            disabled={pipeline.step !== 'idle'}
                            className="flex-1 px-2 py-1.5 bg-gray-100 text-gray-700 rounded text-xs font-medium hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            title="Regenerate with same prompt"
                          >
                            Regenerate
                          </button>
                          <button
                            onClick={() => openAssetEditModal(asset.id, 'edit')}
                            disabled={pipeline.step !== 'idle'}
                            className="flex-1 px-2 py-1.5 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            title="Edit prompt and regenerate"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => openAssetEditModal(asset.id, 'variations')}
                            disabled={pipeline.step !== 'idle'}
                            className="flex-1 px-2 py-1.5 bg-purple-100 text-purple-700 rounded text-xs font-medium hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            title="Generate multiple variations"
                          >
                            Variations
                          </button>
                          <a
                            href={asset.urls[0]}
                            download={`${asset.purpose.replace(/\s+/g, '_')}.png`}
                            className="px-2 py-1.5 bg-green-100 text-green-700 rounded text-xs font-medium hover:bg-green-200 transition"
                            title="Download image"
                          >
                            Download
                          </a>
                        </div>

                        {/* Version History */}
                        {asset.previousVersions && asset.previousVersions.length > 0 && (
                          <details className="mt-2">
                            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                              History ({asset.previousVersions.length} previous)
                            </summary>
                            <div className="mt-1 flex gap-1 overflow-x-auto py-1">
                              {asset.previousVersions.slice(-5).map((version, idx) => (
                                <img
                                  key={idx}
                                  src={version.url}
                                  alt={`Previous version ${idx + 1}`}
                                  className="w-10 h-10 rounded object-cover cursor-pointer hover:ring-2 ring-gray-400"
                                  onClick={() => setLightbox({ isOpen: true, imageUrl: version.url, assetPurpose: `${asset.purpose} (previous)` })}
                                  title={new Date(version.timestamp).toLocaleString()}
                                />
                              ))}
                            </div>
                          </details>
                        )}
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
            <div className="space-y-4">
              {/* Preview Mode Toggle */}
              <div className="flex items-center justify-center gap-4 bg-white rounded-lg shadow-md p-4">
                <span className="text-sm font-medium text-gray-600">View Mode:</span>
                <div className="flex rounded-lg overflow-hidden border border-gray-300">
                  <button
                    onClick={() => setPreviewMode('document')}
                    className={`px-4 py-2 text-sm font-medium transition ${previewMode === 'document'
                      ? 'bg-red-900 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                      }`}
                  >
                    📄 Document
                  </button>
                  <button
                    onClick={() => setPreviewMode('book')}
                    className={`px-4 py-2 text-sm font-medium transition ${previewMode === 'book'
                      ? 'bg-red-900 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                      }`}
                  >
                    📖 Book View
                  </button>
                </div>
              </div>

              {/* Preview Content */}
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                {previewHtml ? (
                  previewMode === 'document' ? (
                    <iframe
                      srcDoc={previewHtml}
                      className="w-full h-[800px] border-0"
                      title="Document Preview"
                    />
                  ) : (
                    <PageFlipper htmlContent={previewHtml} />
                  )
                ) : (
                  <div className="p-12 text-center text-gray-500">
                    <p>No preview built yet.</p>
                    <p className="text-sm mt-2">Click &quot;Build Preview&quot; to render the document.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Feedback Modal */}
      {feedbackModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Provide Feedback for Map</h3>
            <p className="text-sm text-gray-600 mb-4">
              Describe what changes you&apos;d like to see. The map will be regenerated with your feedback.
            </p>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="e.g., Make the forest area larger, add a river on the east side, remove the mountain..."
              className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleSubmitFeedback}
                disabled={!feedbackText.trim() || pipeline.step !== 'idle'}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
              >
                Submit & Revise
              </button>
              <button
                onClick={() => {
                  setFeedbackModal({ assetId: '', isOpen: false });
                  setFeedbackText('');
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Asset Edit Modal */}
      {assetEditModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              {assetEditModal.mode === 'variations' ? 'Generate Variations' : 'Edit & Regenerate'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Image Prompt
                </label>
                <textarea
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Aspect Ratio
                </label>
                <select
                  value={editAspectRatio}
                  onChange={(e) => setEditAspectRatio(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Default</option>
                  <option value="1:1">Square (1:1)</option>
                  <option value="3:4">Portrait (3:4)</option>
                  <option value="4:3">Landscape (4:3)</option>
                  <option value="16:9">Wide (16:9)</option>
                  <option value="9:16">Tall (9:16)</option>
                  <option value="21:9">Ultra-wide (21:9)</option>
                </select>
              </div>

              {assetEditModal.mode === 'variations' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Number of Variations
                  </label>
                  <div className="flex gap-2">
                    {[2, 3, 4].map(num => (
                      <button
                        key={num}
                        onClick={() => setNumVariations(num)}
                        className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition ${
                          numVariations === num
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {num} images
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleRegenerateAsset}
                disabled={pipeline.step !== 'idle'}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
              >
                {assetEditModal.mode === 'variations' ? `Generate ${numVariations} Variations` : 'Regenerate'}
              </button>
              <button
                onClick={() => {
                  setAssetEditModal({ assetId: '', isOpen: false, mode: 'edit' });
                  setEditPrompt('');
                  setEditAspectRatio('');
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightbox.isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 cursor-pointer"
          onClick={() => setLightbox({ isOpen: false, imageUrl: '', assetPurpose: '' })}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightbox.imageUrl}
              alt={lightbox.assetPurpose}
              className="max-w-full max-h-[85vh] object-contain"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 text-white p-3 flex justify-between items-center">
              <span className="text-sm">{lightbox.assetPurpose}</span>
              <a
                href={lightbox.imageUrl}
                download={`${lightbox.assetPurpose.replace(/\s+/g, '_')}.png`}
                className="px-3 py-1 bg-white text-black rounded text-sm font-medium hover:bg-gray-200 transition"
                onClick={(e) => e.stopPropagation()}
              >
                Download
              </a>
            </div>
            <button
              onClick={() => setLightbox({ isOpen: false, imageUrl: '', assetPurpose: '' })}
              className="absolute top-2 right-2 w-10 h-10 bg-black bg-opacity-50 text-white rounded-full hover:bg-opacity-75 transition text-xl"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Section Regeneration Modal */}
      {sectionModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
              Regenerate Section: {sectionModal.sectionHeading}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Optionally provide feedback to guide the regeneration. Leave empty to regenerate with fresh content.
            </p>
            <textarea
              value={sectionFeedback}
              onChange={(e) => setSectionFeedback(e.target.value)}
              placeholder="e.g., Make this section more dramatic, add more detail about the NPC's motivations, include a read-aloud box..."
              className="w-full h-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleRegenerateSection}
                disabled={pipeline.step !== 'idle'}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
              >
                Regenerate
              </button>
              <button
                onClick={() => {
                  setSectionModal({ isOpen: false, sectionHeading: '' });
                  setSectionFeedback('');
                }}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowShortcuts(false)}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Keyboard Shortcuts</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Navigate tabs</span>
                <kbd className="px-2 py-1 bg-gray-100 rounded font-mono">1-5</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Generate next step</span>
                <kbd className="px-2 py-1 bg-gray-100 rounded font-mono">Cmd/Ctrl + G</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Build preview</span>
                <kbd className="px-2 py-1 bg-gray-100 rounded font-mono">Cmd/Ctrl + B</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Export PDF</span>
                <kbd className="px-2 py-1 bg-gray-100 rounded font-mono">Cmd/Ctrl + E</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Close modal</span>
                <kbd className="px-2 py-1 bg-gray-100 rounded font-mono">Esc</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Show this help</span>
                <kbd className="px-2 py-1 bg-gray-100 rounded font-mono">?</kbd>
              </div>
            </div>
            <button
              onClick={() => setShowShortcuts(false)}
              className="mt-6 w-full px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Export Format Modal */}
      {exportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Export PDF</h3>
            <p className="text-sm text-gray-600 mb-4">Choose a page format for your PDF:</p>

            <div className="space-y-2">
              {([
                { value: 'Letter', label: 'Letter (8.5" x 11")', desc: 'US standard' },
                { value: 'A4', label: 'A4 (210mm x 297mm)', desc: 'International standard' },
                { value: 'A5', label: 'A5 (148mm x 210mm)', desc: 'Half A4, compact' },
                { value: 'Digest', label: 'Digest (5.5" x 8.5")', desc: 'RPG book size' },
              ] as const).map(format => (
                <button
                  key={format.value}
                  onClick={() => setExportFormat(format.value)}
                  className={`w-full text-left px-4 py-3 rounded-lg border-2 transition ${
                    exportFormat === format.value
                      ? 'border-red-500 bg-red-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium">{format.label}</div>
                  <div className="text-xs text-gray-500">{format.desc}</div>
                </button>
              ))}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={doExportPdf}
                className="flex-1 px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700 transition font-medium"
              >
                Export PDF
              </button>
              <button
                onClick={() => setExportModal(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
