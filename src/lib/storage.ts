// LocalStorage helpers for settings
// Never logs API keys

import { AppSettings } from './types';

const SETTINGS_KEY = 'dnd-pdf-studio-settings';

const DEFAULT_SETTINGS: AppSettings = {
  openRouterApiKey: '',
  falApiKey: '',
  defaultModelId: 'google/gemini-3-flash-preview',
};

export function getSettings(): AppSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }

  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) {
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(stored);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    console.error('Failed to save settings');
  }
}

export function clearSettings(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch {
    console.error('Failed to clear settings');
  }
}

// Theme helpers
export function getTheme(): 'light' | 'dark' | 'system' {
  return getSettings().theme || 'system';
}

export function setTheme(theme: 'light' | 'dark' | 'system'): void {
  const settings = getSettings();
  saveSettings({ ...settings, theme });
}

export function getEffectiveTheme(): 'light' | 'dark' {
  const theme = getTheme();
  if (theme === 'system') {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }
  return theme;
}
