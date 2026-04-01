import { useState, useEffect } from 'react';

export type LayoutMode = 'mobile' | 'tablet' | 'desktop';

// Breakpoints for layout switching.
// We keep the mobile breakpoint relatively small (e.g., 640px) to ensure that
// half-width desktop windows still get the desktop table experience.
const BREAKPOINTS = {
  mobile: 640,
  tablet: 1024,
};

export function useLayoutMode(): LayoutMode {
  // Start with a reasonable default, which will be updated immediately on mount
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('desktop');

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      
      if (width < BREAKPOINTS.mobile) {
        setLayoutMode('mobile');
      } else if (width < BREAKPOINTS.tablet) {
        setLayoutMode('tablet');
      } else {
        setLayoutMode('desktop');
      }
    };

    // Run once on mount to set initial state
    handleResize();
    
    // Listen for resize events
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return layoutMode;
}
