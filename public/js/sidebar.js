(() => {
  const sidebar = document.querySelector('#app-sidebar');
  const toggle = document.querySelector('[data-sidebar-toggle]');
  const backdrop = document.querySelector('[data-sidebar-backdrop]');
  const edgeHandle = document.querySelector('[data-sidebar-edge-handle]');
  const edgeHandleLabel = edgeHandle?.querySelector('[data-sidebar-edge-label]') || null;

  if (!sidebar || !backdrop) {
    return;
  }

  const mobileQuery = window.matchMedia('(max-width: 980px)');
  const phoneQuery = window.matchMedia('(max-width: 720px)');
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
    syncSidebarControl();
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

  const syncSidebarControl = () => {
    if (!edgeHandle) return;

    const pinned = isPinned();
    const mobileOpen = sidebar.classList.contains('is-mobile-open');
    const desktopOpen = sidebar.classList.contains('is-desktop-open');
    let label = 'Menu';
    let ariaLabel = 'Open navigation';
    let title = 'Menu — hover to open, click to pin; drag vertically to move';

    if (mobileQuery.matches) {
      label = mobileOpen ? 'Close' : 'Menu';
      ariaLabel = mobileOpen ? 'Close navigation' : 'Open navigation';
      title = mobileOpen
        ? (phoneQuery.matches ? 'Close navigation' : 'Close navigation — drag vertically to move')
        : (phoneQuery.matches ? 'Open navigation' : 'Open navigation — drag vertically to move');
      edgeHandle.setAttribute('aria-expanded', String(mobileOpen));
    } else if (pinned) {
      edgeHandle.removeAttribute('aria-expanded');
      label = 'Unpin';
      ariaLabel = 'Unpin navigation';
      title = 'Unpin navigation — drag vertically to move';
    } else if (desktopOpen) {
      edgeHandle.removeAttribute('aria-expanded');
      label = 'Pin';
      ariaLabel = 'Pin navigation';
      title = 'Pin navigation — drag vertically to move';
    } else {
      edgeHandle.removeAttribute('aria-expanded');
    }

    edgeHandle.setAttribute('aria-label', ariaLabel);
    edgeHandle.title = title;
    if (edgeHandleLabel) edgeHandleLabel.textContent = label;

    const sidebarVisible = pinned || mobileOpen || desktopOpen;
    sidebar.inert = !sidebarVisible;
    if (sidebarVisible) sidebar.removeAttribute('aria-hidden');
    else sidebar.setAttribute('aria-hidden', 'true');
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

      desktopUnpinTimer = window.setTimeout(() => {
        desktopUnpinTimer = null;
        sidebar.classList.remove('is-desktop-unpinning');
      }, 220);
    }

    syncSidebarControl();
  };

  const setOpen = (open) => {
    const shouldOpen = mobileQuery.matches && open;

    sidebar.classList.toggle('is-mobile-open', shouldOpen);
    document.body.classList.toggle('sidebar-mobile-open', shouldOpen);
    if (toggle) toggle.setAttribute('aria-expanded', String(shouldOpen));
    backdrop.hidden = !shouldOpen;
    syncSidebarControl();
  };

  if (toggle) {
    toggle.addEventListener('click', () => {
      setOpen(!sidebar.classList.contains('is-mobile-open'));
    });
  }

  backdrop.addEventListener('click', () => setOpen(false));

  sidebar.addEventListener('mouseleave', scheduleDesktopClose);

  sidebar.addEventListener('focusout', scheduleDesktopClose);

  sidebar.addEventListener('click', (event) => {
    if (mobileQuery.matches && event.target.closest('a')) {
      setOpen(false);
    }
  });

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
    syncSidebarControl();
  });

  if (edgeHandle) {
    const handleStorageKey = 'bwtdallas-sidebar-handle-y';
    let draggingHandle = false;
    let movedHandle = false;
    let pointerStartY = 0;
    let handleStartY = 0;

    const clampHandleY = (value) => Math.max(70, Math.min(window.innerHeight - 70, value));
    const setHandleY = (value, persist = false) => {
      const y = clampHandleY(Number(value) || window.innerHeight * 0.45);
      edgeHandle.style.setProperty('--sidebar-edge-handle-top', `${y}px`);
      if (persist) {
        try { localStorage.setItem(handleStorageKey, String(Math.round(y))); } catch (error) {}
      }
    };

    try { setHandleY(localStorage.getItem(handleStorageKey) || window.innerHeight * 0.45); } catch (error) { setHandleY(window.innerHeight * 0.45); }

    edgeHandle.addEventListener('pointerdown', (event) => {
      if (phoneQuery.matches) return;
      draggingHandle = true;
      movedHandle = false;
      pointerStartY = event.clientY;
      handleStartY = edgeHandle.getBoundingClientRect().top + edgeHandle.offsetHeight / 2;
      edgeHandle.setPointerCapture?.(event.pointerId);
    });

    edgeHandle.addEventListener('pointermove', (event) => {
      if (!draggingHandle) return;
      const delta = event.clientY - pointerStartY;
      if (Math.abs(delta) > 4) movedHandle = true;
      setHandleY(handleStartY + delta);
    });

    const finishHandleDrag = (event) => {
      if (!draggingHandle) return;
      draggingHandle = false;
      const currentY = edgeHandle.getBoundingClientRect().top + edgeHandle.offsetHeight / 2;
      setHandleY(currentY, true);
      try { edgeHandle.releasePointerCapture?.(event.pointerId); } catch (error) {}
    };
    edgeHandle.addEventListener('pointerup', finishHandleDrag);
    edgeHandle.addEventListener('pointercancel', finishHandleDrag);
    edgeHandle.addEventListener('mouseenter', () => {
      cancelDesktopClose();
      if (!mobileQuery.matches && !isPinned() && !draggingHandle) setDesktopOpen(true);
    });
    edgeHandle.addEventListener('mouseleave', () => { if (!mobileQuery.matches && !isPinned()) scheduleDesktopClose(); });
    edgeHandle.addEventListener('click', () => {
      if (movedHandle) { movedHandle = false; return; }
      if (mobileQuery.matches) {
        setOpen(!sidebar.classList.contains('is-mobile-open'));
        return;
      }
      if (isPinned()) {
        setPinned(false);
        return;
      }
      if (sidebar.classList.contains('is-desktop-open')) {
        setPinned(true);
      }
    });
    window.addEventListener('resize', () => {
      if (phoneQuery.matches) return;
      const currentY = edgeHandle.getBoundingClientRect().top + edgeHandle.offsetHeight / 2;
      setHandleY(currentY);
    });
  }

  syncSidebarControl();
})();
