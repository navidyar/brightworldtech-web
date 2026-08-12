(function () {
  'use strict';

  const modalRoot = document.getElementById('modal-root');

  if (!modalRoot) {
    return;
  }

  let requestSequence = 0;

  function setBusy(element, busy) {
    if (!element) {
      return;
    }

    if (busy) {
      element.setAttribute('aria-busy', 'true');
      element.classList.add('is-disabled');
      return;
    }

    element.removeAttribute('aria-busy');
    element.classList.remove('is-disabled');
  }

  function installModalMarkup(markup) {
    const template = document.createElement('template');
    template.innerHTML = String(markup || '').trim();

    if (!template.content.querySelector('[data-modal-backdrop]')) {
      return false;
    }

    modalRoot.replaceChildren(template.content.cloneNode(true));
    document.dispatchEvent(new CustomEvent('processor-catalog:modal-loaded', { detail: { root: modalRoot } }));
    return true;
  }

  function renderRequestError(message) {
    modalRoot.innerHTML = `
      <div class="modal-backdrop" data-modal-backdrop>
        <section class="modal-panel site-clean-modal" role="alertdialog" aria-modal="true" aria-labelledby="processor-catalog-request-error-title">
          <header class="modal-header">
            <div><h2 id="processor-catalog-request-error-title">Processor Action Could Not Be Loaded</h2></div>
            <button type="button" class="modal-close-button" data-modal-close aria-label="Close modal">×</button>
          </header>
          <div class="modal-body">
            <div class="message error"><p>${message}</p></div>
            <div class="form-actions"><button type="button" class="secondary-button" data-modal-close>Close</button></div>
          </div>
        </section>
      </div>`;
  }

  async function openProcessorModal(trigger) {
    const url = trigger.getAttribute('data-processor-catalog-modal-url') || trigger.getAttribute('href');

    if (!url || trigger.dataset.processorCatalogLoading === '1') {
      return;
    }

    const sequence = ++requestSequence;
    trigger.dataset.processorCatalogLoading = '1';
    setBusy(trigger, true);

    try {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Accept': 'text/html',
          'HX-Request': 'true'
        }
      });

      if (response.redirected) {
        window.location.assign(response.url);
        return;
      }

      const markup = await response.text();

      if (sequence !== requestSequence) {
        return;
      }

      if (!installModalMarkup(markup)) {
        if (!response.ok) {
          renderRequestError('The server returned an error while loading this processor action. Refresh the page and try again.');
          return;
        }

        window.location.assign(url);
      }
    } catch (error) {
      renderRequestError('The processor action request could not reach the server. Refresh the page and try again.');
    } finally {
      delete trigger.dataset.processorCatalogLoading;
      setBusy(trigger, false);
    }
  }

  function serializeForm(form) {
    const body = new URLSearchParams();
    const formData = new FormData(form);

    formData.forEach((value, key) => {
      body.append(key, typeof value === 'string' ? value : value.name);
    });

    return body.toString();
  }

  async function submitProcessorForm(form, submitter) {
    if (form.dataset.processorCatalogSubmitting === '1') {
      return;
    }

    const confirmation = form.getAttribute('data-processor-catalog-confirm');
    if (confirmation && !window.confirm(confirmation)) {
      return;
    }

    const button = submitter || form.querySelector('button[type="submit"], input[type="submit"]');
    const originalLabel = button && 'textContent' in button ? button.textContent : '';
    form.dataset.processorCatalogSubmitting = '1';
    form.setAttribute('aria-busy', 'true');

    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      if ('textContent' in button && originalLabel) {
        button.textContent = 'Saving...';
      }
    }

    try {
      const response = await fetch(form.action, {
        method: String(form.method || 'POST').toUpperCase(),
        credentials: 'same-origin',
        headers: {
          'Accept': 'text/html',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'HX-Request': 'true'
        },
        body: serializeForm(form)
      });

      if (response.redirected) {
        window.location.assign(response.url);
        return;
      }

      const redirectUrl = response.headers.get('HX-Redirect');
      if (redirectUrl) {
        window.location.assign(redirectUrl);
        return;
      }

      const markup = await response.text();

      if (installModalMarkup(markup)) {
        return;
      }

      if (response.ok) {
        window.location.reload();
        return;
      }

      renderRequestError('The server could not complete this processor action. No successful change was confirmed.');
    } catch (error) {
      renderRequestError('The processor action request failed before the server confirmed a change.');
    } finally {
      if (form.isConnected) {
        delete form.dataset.processorCatalogSubmitting;
        form.removeAttribute('aria-busy');
      }

      if (button && button.isConnected) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        if ('textContent' in button && originalLabel) {
          button.textContent = originalLabel;
        }
      }
    }
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-processor-catalog-modal-url]');

    if (!trigger) {
      return;
    }

    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();
    openProcessorModal(trigger);
  });

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-processor-catalog-form]');

    if (!form) {
      return;
    }

    event.preventDefault();
    submitProcessorForm(form, event.submitter);
  });
})();
