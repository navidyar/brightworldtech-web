'use strict';

(() => {
  const ALLOWED_TYPES = new Set(['image/png', 'image/svg+xml']);
  const MAX_BYTES = 5 * 1024 * 1024;

  function getForm() {
    return document.querySelector('[data-label-asset-upload-form]');
  }

  function replaceAssetSection(html) {
    const current = document.querySelector('[data-label-library-assets-section]');
    if (!current || !String(html || '').trim()) return false;
    const holder = document.createElement('template');
    holder.innerHTML = String(html).trim();
    const replacement = holder.content.querySelector('[data-label-library-assets-section]') || holder.content.firstElementChild;
    if (!replacement) return false;

    // Preserve the live section node and replace only its contents. Several other page
    // behaviors keep references to this section; swapping the entire node proved fragile
    // after modal-driven uploads. Keeping the node stable also makes the visual update
    // immediate without depending on a second page/fragment navigation.
    current.className = replacement.className;
    current.innerHTML = replacement.innerHTML;
    if (replacement.dataset.repositoryStorage) current.dataset.repositoryStorage = replacement.dataset.repositoryStorage;
    window.htmx?.process?.(current);

    const storage = document.querySelector('[data-label-library-repository-storage]');
    if (storage && current.dataset.repositoryStorage) storage.textContent = current.dataset.repositoryStorage;
    return true;
  }

  async function refreshAssetSection() {
    const response = await fetch(`/management/label-library/assets/fragment?_=${Date.now()}`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'text/html', 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    });
    if (!response.ok) throw new Error('The Shared Assets list could not be refreshed.');
    const html = await response.text();
    if (!replaceAssetSection(html)) throw new Error('The Shared Assets list could not be refreshed.');
  }


  function closeAssetModal() {
    document.querySelector('#modal-root')?.replaceChildren();
  }

  function getState(form) {
    if (!form._labelAssetUploadState) form._labelAssetUploadState = { file: null, previewUrl: null };
    return form._labelAssetUploadState;
  }

  function showErrors(form, messages) {
    const box = form.closest('.modal-body')?.querySelector('[data-label-asset-errors]');
    if (!box) return;
    const safeMessages = Array.isArray(messages) ? messages.filter(Boolean) : [];
    box.replaceChildren(...safeMessages.map((message) => {
      const p = document.createElement('p');
      p.textContent = message;
      return p;
    }));
    box.hidden = safeMessages.length === 0;
  }

  function extensionFor(file) {
    const name = String(file?.name || '').toLowerCase();
    if (name.endsWith('.png')) return '.png';
    if (name.endsWith('.svg')) return '.svg';
    return '';
  }

  function validateClientFile(file) {
    if (!file) return 'Choose a PNG or SVG file to upload.';
    const extension = extensionFor(file);
    const type = String(file.type || '').toLowerCase();
    if (!ALLOWED_TYPES.has(type) || !['.png', '.svg'].includes(extension)) {
      return 'Only PNG and SVG Label Assets are supported.';
    }
    if ((type === 'image/png' && extension !== '.png') || (type === 'image/svg+xml' && extension !== '.svg')) {
      return 'The file extension must match the PNG or SVG image type.';
    }
    if (file.size <= 0) return 'The selected image is empty.';
    if (file.size > MAX_BYTES) return 'Label Assets cannot exceed 5 MB.';
    return null;
  }

  function defaultAssetName(file) {
    return String(file?.name || '')
      .replace(/\.(?:png|svg)$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function revokePreview(state) {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
  }

  function renderSelection(form) {
    const state = getState(form);
    const selected = form.querySelector('[data-label-asset-selection]');
    const preview = form.querySelector('[data-label-asset-selection-preview]');
    const name = form.querySelector('[data-label-asset-selection-name]');
    const meta = form.querySelector('[data-label-asset-selection-meta]');
    const submit = form.querySelector('[data-label-asset-upload-submit]');
    if (!selected || !preview || !name || !meta || !submit) return;

    preview.replaceChildren();
    revokePreview(state);
    if (!state.file) {
      selected.hidden = true;
      submit.disabled = true;
      return;
    }

    selected.hidden = false;
    submit.disabled = false;
    name.textContent = state.file.name;
    meta.textContent = `${state.file.type === 'image/svg+xml' ? 'SVG' : 'PNG'} · ${(state.file.size / 1024).toFixed(state.file.size >= 1024 ? 1 : 0)} KB`;

    if (state.file.type === 'image/png') {
      state.previewUrl = URL.createObjectURL(state.file);
      const image = document.createElement('img');
      image.src = state.previewUrl;
      image.alt = '';
      preview.appendChild(image);
    } else {
      const badge = document.createElement('span');
      badge.textContent = 'SVG';
      badge.setAttribute('aria-hidden', 'true');
      preview.appendChild(badge);
    }
  }

  function selectFile(form, file, { fromClipboard = false } = {}) {
    const error = validateClientFile(file);
    if (error) {
      showErrors(form, [error]);
      return false;
    }

    const state = getState(form);
    state.file = file;
    const nameInput = form.elements.assetName;
    if (nameInput && (!nameInput.value.trim() || fromClipboard)) {
      nameInput.value = fromClipboard ? defaultAssetName(file) : defaultAssetName(file);
    }
    showErrors(form, []);
    renderSelection(form);
    return true;
  }

  function clipboardFilename() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `Clipboard Image ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}.png`;
  }

  document.addEventListener('click', (event) => {
    const dropzone = event.target.closest('[data-label-asset-dropzone]');
    if (!dropzone || event.target.closest('input, select, button, a')) return;
    dropzone.closest('form')?.querySelector('[data-label-asset-file-input]')?.click();
  });

  document.addEventListener('keydown', (event) => {
    const dropzone = event.target.closest?.('[data-label-asset-dropzone]');
    if (!dropzone || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    dropzone.closest('form')?.querySelector('[data-label-asset-file-input]')?.click();
  });

  document.addEventListener('change', (event) => {
    if (!event.target.matches('[data-label-asset-file-input]')) return;
    const form = event.target.closest('form');
    if (!form) return;
    selectFile(form, event.target.files?.[0] || null);
    event.target.value = '';
  });

  document.addEventListener('dragover', (event) => {
    const dropzone = event.target.closest?.('[data-label-asset-dropzone]');
    if (!dropzone) return;
    event.preventDefault();
    dropzone.classList.add('is-dragover');
  });

  document.addEventListener('dragleave', (event) => {
    const dropzone = event.target.closest?.('[data-label-asset-dropzone]');
    if (!dropzone) return;
    if (event.relatedTarget && dropzone.contains(event.relatedTarget)) return;
    dropzone.classList.remove('is-dragover');
  });

  document.addEventListener('drop', (event) => {
    const dropzone = event.target.closest?.('[data-label-asset-dropzone]');
    if (!dropzone) return;
    event.preventDefault();
    dropzone.classList.remove('is-dragover');
    const form = dropzone.closest('form');
    if (!form) return;
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length !== 1) {
      showErrors(form, ['Drop exactly one PNG or SVG asset at a time.']);
      return;
    }
    selectFile(form, files[0]);
  });

  document.addEventListener('paste', (event) => {
    const form = getForm();
    if (!form) return;
    const items = Array.from(event.clipboardData?.items || []);
    const imageItems = items.filter((item) => String(item.type || '').startsWith('image/'));
    if (!imageItems.length) return;

    event.preventDefault();
    const pngItem = imageItems.find((item) => item.type === 'image/png');
    if (!pngItem) {
      showErrors(form, ['Clipboard images must be PNG. JPEG, WebP, GIF, and other formats are not accepted.']);
      return;
    }
    const blob = pngItem.getAsFile();
    if (!blob) {
      showErrors(form, ['The clipboard image could not be read.']);
      return;
    }
    const file = new File([blob], clipboardFilename(), { type: 'image/png', lastModified: Date.now() });
    selectFile(form, file, { fromClipboard: true });
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target.closest?.('[data-label-asset-upload-form]');
    if (!form) return;
    event.preventDefault();
    const state = getState(form);
    const fileError = validateClientFile(state.file);
    const assetName = String(form.elements.assetName?.value || '').trim();
    const assetKind = String(form.elements.assetKind?.value || '').trim();
    const errors = [];
    if (fileError) errors.push(fileError);
    if (!assetName) errors.push('Asset name is required.');
    if (!['logo', 'image', 'background'].includes(assetKind)) errors.push('Choose a valid asset type.');
    if (errors.length) {
      showErrors(form, errors);
      return;
    }

    const submit = form.querySelector('[data-label-asset-upload-submit]');
    submit.disabled = true;
    submit.textContent = 'Uploading…';
    showErrors(form, []);

    try {
      const params = new URLSearchParams({ name: assetName, kind: assetKind, filename: state.file.name });
      const response = await fetch(`/management/label-library/assets/upload?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': state.file.type },
        body: state.file
      });

      // The database commit is the success boundary. Once the server confirms success, do not
      // depend on response JSON parsing, fragment rendering, modal teardown, or DOM insertion to
      // make the new asset visible. Navigate immediately to a fresh server-rendered Label Library.
      if (response.ok) {
        const location = response.headers.get('Location')
          || `/management/label-library?asset_uploaded=1&_assets=${Date.now()}#label-library-assets-section`;
        window.location.assign(new URL(location, window.location.origin).toString());
        return;
      }

      const payload = await response.json().catch(() => null);
      throw new Error((payload?.errors || ['The Label Asset could not be uploaded.']).join('\n'));
    } catch (error) {
      showErrors(form, String(error.message || error).split('\n'));
      submit.disabled = false;
      submit.textContent = 'Upload Asset';
    }
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target.closest?.('[data-label-asset-rename-form]');
    if (!form) return;
    event.preventDefault();
    const submit = form.querySelector('[data-label-asset-rename-submit]');
    const name = String(form.elements.name?.value || '').trim();
    const assetKind = String(form.elements.assetKind?.value || '').trim();
    if (!name || !['logo', 'image', 'background'].includes(assetKind)) return;
    if (submit) { submit.disabled = true; submit.textContent = 'Saving…'; }
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ name, assetKind })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok !== true) {
        throw new Error((payload.errors || ['The Shared Asset could not be renamed.']).join('\n'));
      }
      await refreshAssetSection();
      closeAssetModal();
    } catch (error) {
      const box = form.closest('.modal-body')?.querySelector('[data-label-asset-rename-errors]');
      if (box) {
        box.hidden = false;
        box.replaceChildren(...String(error.message || error).split('\n').map((message) => {
          const paragraph = document.createElement('p');
          paragraph.textContent = message;
          return paragraph;
        }));
      } else {
        window.alert(error.message || 'The Shared Asset could not be renamed.');
      }
      if (submit) { submit.disabled = false; submit.textContent = 'Save Asset'; }
    }
  });

  document.addEventListener('htmx:beforeCleanupElement', (event) => {
    const form = event.target.querySelector?.('[data-label-asset-upload-form]');
    if (!form) return;
    revokePreview(getState(form));
  });

})();
