(() => {
  const sidebar = document.querySelector('#app-sidebar');
  const toggle = document.querySelector('[data-sidebar-toggle]');
  const backdrop = document.querySelector('[data-sidebar-backdrop]');
  const pinButton = document.querySelector('[data-sidebar-pin]');

  if (!sidebar || !toggle || !backdrop) {
    return;
  }

  const mobileQuery = window.matchMedia('(max-width: 980px)');
  const storageKey = 'bwtdallas-sidebar-pinned';
  let desktopCloseTimer = null;
  let desktopUnpinTimer = null;

  const isPinned = () => document.documentElement.getAttribute('data-sidebar-pinned') === 'true';

  const setDesktopOpen = (open) => {
    if (mobileQuery.matches || isPinned()) {
      sidebar.classList.remove('is-desktop-open');
      return;
    }

    sidebar.classList.toggle('is-desktop-open', Boolean(open));
  };

  const cancelDesktopClose = () => {
    if (desktopCloseTimer) {
      window.clearTimeout(desktopCloseTimer);
      desktopCloseTimer = null;
    }
  };

  const scheduleDesktopClose = () => {
    cancelDesktopClose();

    desktopCloseTimer = window.setTimeout(() => {
      desktopCloseTimer = null;

      if (!sidebar.matches(':hover') && !sidebar.contains(document.activeElement)) {
        setDesktopOpen(false);
      }
    }, 160);
  };

  const syncPinButton = () => {
    if (!pinButton) {
      return;
    }

    const pinned = isPinned();
    pinButton.setAttribute('aria-pressed', String(pinned));
    pinButton.textContent = pinned ? 'Unpin' : 'Pin';
    pinButton.title = pinned ? 'Auto-hide sidebar' : 'Pin sidebar';
  };

  const setPinned = (pinned) => {
    if (desktopUnpinTimer) {
      window.clearTimeout(desktopUnpinTimer);
      desktopUnpinTimer = null;
    }

    sidebar.classList.remove('is-desktop-unpinning');

    if (pinned) {
      document.documentElement.setAttribute('data-sidebar-pinned', 'true');
    } else {
      document.documentElement.removeAttribute('data-sidebar-pinned');
    }

    try {
      localStorage.setItem(storageKey, pinned ? 'true' : 'false');
    } catch (error) {
      // Keep the current-page behavior even when localStorage is unavailable.
    }

    cancelDesktopClose();
    sidebar.classList.remove('is-desktop-open');

    if (!pinned && !mobileQuery.matches) {
      sidebar.classList.add('is-desktop-unpinning');

      if (pinButton && document.activeElement === pinButton) {
        pinButton.blur();
      }

      desktopUnpinTimer = window.setTimeout(() => {
        desktopUnpinTimer = null;
        sidebar.classList.remove('is-desktop-unpinning');
      }, 220);
    }

    syncPinButton();
  };

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

  sidebar.addEventListener('mouseenter', () => {
    cancelDesktopClose();
    setDesktopOpen(true);
  });

  sidebar.addEventListener('mouseleave', scheduleDesktopClose);

  sidebar.addEventListener('focusin', () => {
    cancelDesktopClose();
    setDesktopOpen(true);
  });

  sidebar.addEventListener('focusout', scheduleDesktopClose);

  sidebar.addEventListener('click', (event) => {
    if (mobileQuery.matches && event.target.closest('a')) {
      setOpen(false);
    }
  });

  if (pinButton) {
    pinButton.addEventListener('click', () => setPinned(!isPinned()));
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mobileQuery.matches) {
      setOpen(false);
    }
  });

  mobileQuery.addEventListener('change', () => {
    cancelDesktopClose();

    if (desktopUnpinTimer) {
      window.clearTimeout(desktopUnpinTimer);
      desktopUnpinTimer = null;
    }

    sidebar.classList.remove('is-desktop-unpinning');
    setOpen(false);
    sidebar.classList.remove('is-desktop-open');
    syncPinButton();
  });

  syncPinButton();
})();
