import { useState, useEffect } from 'react';
import { loadFromStorage, saveToStorage } from '@/utils/storage';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'osrs-lt:theme';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    loadFromStorage<Theme>(STORAGE_KEY, 'light'),
  );

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    saveToStorage(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  return { theme, toggleTheme };
}
