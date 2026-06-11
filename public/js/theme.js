(() => {
  const FIXED_THEME = 'hybrid';

  function applyFixedTheme() {
    document.documentElement.setAttribute('data-theme', FIXED_THEME);

    try {
      window.localStorage.setItem('bwt-theme', FIXED_THEME);
    } catch (error) {
      // Local storage may be unavailable in private browsing or restricted environments.
    }

    const themeToggle = document.querySelector('[data-theme-toggle]');

    if (themeToggle) {
      themeToggle.remove();
    }
  }

  applyFixedTheme();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyFixedTheme, { once: true });
  }
})();
