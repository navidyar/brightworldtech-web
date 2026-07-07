(() => {
  const sidebar = document.querySelector('#app-sidebar');
  const toggle = document.querySelector('[data-sidebar-toggle]');
  const backdrop = document.querySelector('[data-sidebar-backdrop]');

  if (!sidebar || !toggle || !backdrop) {
    return;
  }

  const mobileQuery = window.matchMedia('(max-width: 980px)');

  const setOpen = (open) => {
    const shouldOpen = mobileQuery.matches && open;

    sidebar.classList.toggle('is-mobile-open', shouldOpen);
    document.body.classList.toggle('sidebar-mobile-open', shouldOpen);
    toggle.setAttribute('aria-expanded', String(shouldOpen));
    backdrop.hidden = !shouldOpen;
  };

  toggle.addEventListener('click', () => {
    setOpen(!sidebar.classList.contains('is-mobile-open'));
  });

  backdrop.addEventListener('click', () => setOpen(false));

  sidebar.addEventListener('click', (event) => {
    if (mobileQuery.matches && event.target.closest('a')) {
      setOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setOpen(false);
    }
  });

  mobileQuery.addEventListener('change', () => setOpen(false));
})();
