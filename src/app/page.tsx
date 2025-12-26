'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Project } from '@/lib/types';
import { getAllProjects, createProject, deleteProject, duplicateProject, exportAllProjects, importProjects } from '@/lib/db';

export default function HomePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newUserRequest, setNewUserRequest] = useState('');
  const [newDocType, setNewDocType] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const data = await getAllProjects();
      setProjects(data);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newProjectName.trim() || !newUserRequest.trim()) return;

    setCreating(true);
    try {
      const project = await createProject(
        newProjectName.trim(),
        newUserRequest.trim(),
        newDocType.trim() || undefined
      );
      router.push(`/project/${project.id}`);
    } catch (err) {
      console.error('Failed to create project:', err);
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return;

    try {
      await deleteProject(id);
      setProjects(projects.filter(p => p.id !== id));
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const duplicate = await duplicateProject(id, true);
      if (duplicate) {
        setProjects([duplicate, ...projects]);
      }
    } catch (err) {
      console.error('Failed to duplicate project:', err);
      alert('Failed to duplicate project');
    }
  };

  const handleExport = async () => {
    try {
      const json = await exportAllProjects();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dnd-pdf-studio-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export:', err);
      alert('Failed to export projects');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const count = await importProjects(text);
      alert(`Imported ${count} project(s)`);
      loadProjects();
    } catch (err) {
      console.error('Failed to import:', err);
      alert('Failed to import projects. Check the file format.');
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <header className="bg-red-900 text-white py-4 px-6 shadow-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-serif font-bold">D&D PDF Studio</h1>
          <nav className="flex items-center gap-4">
            <Link href="/settings" className="text-sm hover:text-yellow-300 transition">
              Settings
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-serif font-bold text-gray-900 dark:text-gray-100">Projects</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition"
            >
              Export All
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition"
            >
              Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
            <button
              onClick={() => setShowNewModal(true)}
              className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700 transition font-medium"
            >
              + New Project
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-red-800 border-t-transparent rounded-full"></div>
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-12 text-center">
            <div className="text-6xl mb-4">📜</div>
            <h3 className="text-xl font-serif font-bold text-gray-900 dark:text-gray-100 mb-2">No Projects Yet</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Create your first D&D content project to get started.
            </p>
            <button
              onClick={() => setShowNewModal(true)}
              className="px-6 py-3 bg-red-800 text-white rounded-md hover:bg-red-700 transition font-medium"
            >
              Create Your First Project
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {projects.map(project => (
              <div
                key={project.id}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <Link
                      href={`/project/${project.id}`}
                      className="text-lg font-serif font-bold text-red-900 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition"
                    >
                      {project.name}
                    </Link>
                    {project.docType && (
                      <span className="ml-2 px-2 py-0.5 text-xs bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 rounded">
                        {project.docType}
                      </span>
                    )}
                    <p className="text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{project.userRequest}</p>
                    <div className="flex items-center gap-4 mt-3 text-sm text-gray-500 dark:text-gray-400">
                      <span>
                        {project.docPlan ? '✓ Plan' : '○ No plan'}
                      </span>
                      <span>
                        {project.markdown ? '✓ Draft' : '○ No draft'}
                      </span>
                      <span>
                        {project.assets.length > 0 ? `✓ ${project.assets.length} assets` : '○ No assets'}
                      </span>
                      <span className="text-gray-400">
                        Updated {new Date(project.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Link
                      href={`/project/${project.id}`}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md transition text-sm"
                    >
                      Open
                    </Link>
                    <button
                      onClick={() => handleDuplicate(project.id)}
                      className="px-3 py-2 text-blue-600 hover:bg-blue-50 rounded-md transition text-sm"
                      title="Duplicate project"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => handleDelete(project.id)}
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-md transition text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* New Project Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h2 className="text-xl font-serif font-bold text-gray-900 mb-4">New Project</h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="project-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Project Name
                </label>
                <input
                  id="project-name"
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g., The Haunted Village"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label htmlFor="user-request" className="block text-sm font-medium text-gray-700 mb-1">
                  What do you want to create?
                </label>
                <textarea
                  id="user-request"
                  value={newUserRequest}
                  onChange={(e) => setNewUserRequest(e.target.value)}
                  placeholder="Describe your D&D content request in detail. For example: 'A spooky one-shot adventure set in an abandoned fishing village where the townsfolk have been replaced by shapeshifting creatures from the Shadowfell.'"
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div>
                <label htmlFor="doc-type" className="block text-sm font-medium text-gray-700 mb-1">
                  Document Type (optional)
                </label>
                <input
                  id="doc-type"
                  type="text"
                  value={newDocType}
                  onChange={(e) => setNewDocType(e.target.value)}
                  placeholder="e.g., One-Shot, Town Guide, Monster Manual, etc."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowNewModal(false);
                  setNewProjectName('');
                  setNewUserRequest('');
                  setNewDocType('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newProjectName.trim() || !newUserRequest.trim() || creating}
                className="px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
