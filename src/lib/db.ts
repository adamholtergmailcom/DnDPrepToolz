// IndexedDB layer for project persistence

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Project } from './types';

interface DnDStudioDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: { 'by-updated': string };
  };
}

const DB_NAME = 'dnd-pdf-studio';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<DnDStudioDB> | null = null;

async function getDB(): Promise<IDBPDatabase<DnDStudioDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<DnDStudioDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore('projects', { keyPath: 'id' });
      store.createIndex('by-updated', 'updatedAt');
    },
  });

  return dbInstance;
}

export async function getAllProjects(): Promise<Project[]> {
  const db = await getDB();
  const projects = await db.getAll('projects');
  // Sort by updatedAt descending
  return projects.sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await getDB();
  return db.get('projects', id);
}

export async function saveProject(project: Project): Promise<void> {
  const db = await getDB();
  project.updatedAt = new Date().toISOString();
  await db.put('projects', project);
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('projects', id);
}

export async function createProject(name: string, userRequest: string, docType?: string): Promise<Project> {
  const project: Project = {
    id: crypto.randomUUID(),
    name,
    userRequest,
    docType,
    assets: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveProject(project);
  return project;
}

// Export all projects as JSON
export async function exportAllProjects(): Promise<string> {
  const projects = await getAllProjects();
  return JSON.stringify({ projects, exportedAt: new Date().toISOString() }, null, 2);
}

// Import projects from JSON
export async function importProjects(jsonData: string): Promise<number> {
  const data = JSON.parse(jsonData);
  const projects: Project[] = data.projects;

  const db = await getDB();
  let count = 0;

  for (const project of projects) {
    await db.put('projects', project);
    count++;
  }

  return count;
}
