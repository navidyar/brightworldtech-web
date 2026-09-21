(() => {
  'use strict';

  const root = document.querySelector('[data-label-builder-root]');
  if (!root) return;

  const canvas = root.querySelector('[data-builder-canvas]');
  const workspace = root.querySelector('[data-builder-workspace]');
  const mediaWidthSelect = root.querySelector('[data-builder-media-width]');
  const lengthInput = root.querySelector('[data-builder-length-mm]');
  const lengthDeltaButtons = [...root.querySelectorAll('[data-builder-length-delta]')];
  const gridVisible = root.querySelector('[data-builder-grid-visible]');
  const snapToggle = root.querySelector('[data-builder-snap]');
  const gridSizeSelect = root.querySelector('[data-builder-grid-size]');
  const addButton = root.querySelector('[data-builder-add-region]');
  const deleteButton = root.querySelector('[data-builder-delete]');
  const saveButton = root.querySelector('[data-builder-save]');
  const testPrintButton = root.querySelector('[data-builder-test-print]');
  const testPrintUnitInput = root.querySelector('[data-builder-test-print-unit]');
  const undoButton = root.querySelector('[data-builder-undo]');
  const redoButton = root.querySelector('[data-builder-redo]');
  const saveState = root.querySelector('[data-builder-save-state]');
  const canvasSize = root.querySelector('[data-builder-canvas-size]');
  const mediaSummary = root.querySelector('[data-builder-media-summary]');
  const selectionLabel = root.querySelector('[data-builder-selection-label]');
  const emptyInspector = root.querySelector('[data-builder-empty-inspector]');
  const geometryPanel = root.querySelector('[data-builder-geometry]');
  const geometryFields = [...root.querySelectorAll('[data-builder-geometry-field]')];
  const contentTypeSelect = root.querySelector('[data-builder-content-type]');
  const staticTextWrap = root.querySelector('[data-builder-static-text]');
  const staticTextInput = root.querySelector('[data-builder-static-value]');
  const dynamicTextWrap = root.querySelector('[data-builder-dynamic-text]');
  const dynamicFieldSelect = root.querySelector('[data-builder-dynamic-field]');
  const imageProperties = root.querySelector('[data-builder-image-properties]');
  const imageAssetSelect = root.querySelector('[data-builder-image-asset]');
  const imageLockToggle = root.querySelector('[data-builder-image-lock]');
  const imagePreview = root.querySelector('[data-builder-image-preview]');
  const imagePreviewImg = root.querySelector('[data-builder-image-preview-img]');
  const imagePreviewName = root.querySelector('[data-builder-image-preview-name]');
  const imagePreviewMeta = root.querySelector('[data-builder-image-preview-meta]');
  const codeProperties = root.querySelector('[data-builder-code-properties]');
  const codePayloadTypeSelect = root.querySelector('[data-builder-code-payload-type]');
  const codeFieldWrap = root.querySelector('[data-builder-code-field-wrap]');
  const codeFieldSelect = root.querySelector('[data-builder-code-field]');
  const codeStaticWrap = root.querySelector('[data-builder-code-static-wrap]');
  const codeStaticInput = root.querySelector('[data-builder-code-static]');
  const codeCaseWrap = root.querySelector('[data-builder-code-case-wrap]');
  const codeCaseSelect = root.querySelector('[data-builder-code-case]');
  const barcodeProperties = root.querySelector('[data-builder-barcode-properties]');
  const barcodeSymbologySelect = root.querySelector('[data-builder-barcode-symbology]');
  const barcodeShowTextToggle = root.querySelector('[data-builder-barcode-show-text]');
  const barcodeTextSizeWrap = root.querySelector('[data-builder-barcode-text-size-wrap]');
  const barcodeTextSizeInput = root.querySelector('[data-builder-barcode-text-size]');
  const qrProperties = root.querySelector('[data-builder-qr-properties]');
  const qrErrorCorrectionSelect = root.querySelector('[data-builder-qr-error-correction]');
  const shapeProperties = root.querySelector('[data-builder-shape-properties]');
  const shapeThicknessWrap = root.querySelector('[data-builder-shape-thickness-wrap]');
  const shapeThicknessLabel = root.querySelector('[data-builder-shape-thickness-label]');
  const shapeThicknessInput = root.querySelector('[data-builder-shape-thickness]');
  const rectangleFillWrap = root.querySelector('[data-builder-rectangle-fill-wrap]');
  const rectangleFillSelect = root.querySelector('[data-builder-rectangle-fill]');
  const composedEditor = root.querySelector('[data-builder-composed-editor]');
  const composedPartsWrap = root.querySelector('[data-builder-composed-parts]');
  const composedPreview = root.querySelector('[data-builder-composed-preview]');
  const composedExpression = root.querySelector('[data-builder-composed-expression]');
  const composedApplyExpression = root.querySelector('[data-builder-composed-apply-expression]');
  const composedAddButtons = [...root.querySelectorAll('[data-builder-composed-add]')];
  const composedPresetButtons = [...root.querySelectorAll('[data-builder-composed-preset]')];
  const textStylePanel = root.querySelector('[data-builder-text-style]');
  const fontFamilySelect = root.querySelector('[data-builder-font-family]');
  const fontSizeInput = root.querySelector('[data-builder-font-size]');
  const fontWeightSelect = root.querySelector('[data-builder-font-weight]');
  const textAlignSelect = root.querySelector('[data-builder-text-align]');
  const textCaseSelect = root.querySelector('[data-builder-text-case]');
  const rotationSelect = root.querySelector('[data-builder-rotation]');
  const rotateButtons = [...root.querySelectorAll('[data-builder-rotate]')];
  const layerPosition = root.querySelector('[data-builder-layer-position]');
  const layerButtons = [...root.querySelectorAll('[data-builder-layer]')];
  const errorBox = root.querySelector('[data-builder-errors]');
  const previewSummary = root.querySelector('[data-builder-preview-summary]');
  const previewStatus = root.querySelector('[data-builder-preview-status]');
  const unitSearchInput = root.querySelector('[data-builder-unit-search]');
  const unitSearchButton = root.querySelector('[data-builder-unit-search-button]');
  const unitClearButton = root.querySelector('[data-builder-unit-clear]');
  const unitResults = root.querySelector('[data-builder-unit-results]');

  const MIN_LENGTH_MM = 12.7;
  const MAX_LENGTH_MM = 1000;
  const DPI = 300;
  const MAX_HISTORY_STATES = 500;
  const HISTORY_INPUT_DEBOUNCE_MS = 300;
  const CENTER_GUIDE_SNAP_PX = 5;
  const ROTATIONS = [0, 90, 180, 270];
  const TEXT_TYPES = new Set(['static_text', 'dynamic_text', 'composed_text']);
  const CODE_TYPES = new Set(['barcode', 'qr']);
  const SHAPE_TYPES = new Set(['line', 'rectangle']);
  const PAYLOAD_TYPES = new Set(['field', 'static', 'composed']);
  const CODE39_PATTERNS = Object.freeze({
    '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw',
    '5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn',
    'A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn',
    'F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn','I':'nnwnnwwnn','J':'nnnnwwwnn',
    'K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww','O':'wnnnwnnwn',
    'P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn',
    'U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn',
    'Z':'nwwwwnnnn','-':'nwnnnnwnw','.':'wwnnnnwnn',' ':'nwwnnnwnn','$':'nwnwnwnnn',
    '/':'nwnwnnnwn','+':'nwnnnwnwn','%':'nnnwnwnwn','*':'nwnnwnwnn'
  });
  const LEGACY_BARCODE_TEXT_SIZE = 20;
  const NEW_BARCODE_TEXT_SIZE = 24;
  const MIN_BARCODE_TEXT_SIZE = 8;
  const MAX_BARCODE_TEXT_SIZE = 48;
  const DEFAULT_STYLE = Object.freeze({
    fontFamily: 'DejaVu Sans',
    fontSize: 24,
    fontWeight: 400,
    align: 'left',
    textCase: 'plain',
    overflow: 'shrink'
  });

  const parseJsonScript = (id) => JSON.parse(document.getElementById(id)?.textContent || '{}');
  const mediaWidths = parseJsonScript('label-builder-media-widths-json');
  const initialLayout = parseJsonScript('label-builder-layout-json');
  const fontFamilies = parseJsonScript('label-builder-fonts-json');
  const fieldGroups = parseJsonScript('label-builder-field-groups-json');
  const sharedImageAssets = parseJsonScript('label-builder-assets-json');
  const composedValuePresets = parseJsonScript('label-builder-composed-presets-json');
  const mediaByCode = new Map(mediaWidths.map((media) => [media.code, media]));
  const fontByCode = new Map(fontFamilies.map((font) => [font.code, font]));
  const fieldByKey = new Map(fieldGroups.flatMap((group) => group.fields || []).map((field) => [field.key, field]));
  const imageAssetByKey = new Map((Array.isArray(sharedImageAssets) ? sharedImageAssets : []).map((asset) => [String(asset.assetKey || ''), asset]));
  const composedPresetById = new Map(
    ['common', 'recent', 'starter']
      .flatMap((group) => Array.isArray(composedValuePresets?.[group]) ? composedValuePresets[group] : [])
      .map((preset) => [String(preset.id || ''), preset])
  );

  function mmToDots(mm) {
    return Math.round((Number(mm) * DPI) / 25.4);
  }

  function normalizeLengthMm(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    const rounded = Math.round(number * 10) / 10;
    if (rounded < MIN_LENGTH_MM || rounded > MAX_LENGTH_MM) return null;
    return rounded;
  }

  function normalizeRotation(value) {
    const number = Number(value || 0);
    return ROTATIONS.includes(number) ? number : 0;
  }

  function legacyMediaCode(layout) {
    const code = String(layout.mediaPresetCode || '');
    return code ? code.split('_').slice(0, 2).join('_') : '';
  }

  function legacyLengthMm(layout) {
    const match = String(layout.mediaPresetCode || '').match(/_(\d+(?:\.\d+)?)mm$/i);
    return match ? normalizeLengthMm(match[1]) : null;
  }

  const initialMediaCode = initialLayout.mediaWidthCode || legacyMediaCode(initialLayout) || mediaWidthSelect.value;
  const initialMedia = mediaByCode.get(initialMediaCode) || mediaWidths[0];
  const initialLengthMm = normalizeLengthMm(initialLayout.lengthMm) || legacyLengthMm(initialLayout) || normalizeLengthMm(lengthInput.value) || 30;

  const state = {
    layout: {
      ...initialLayout,
      schemaVersion: 1,
      builderVersion: 2,
      mediaWidthCode: initialMedia.code,
      lengthMm: initialLengthMm,
      elements: Array.isArray(initialLayout.elements) ? initialLayout.elements.map((element) => ({ ...element })) : []
    },
    media: initialMedia,
    lengthMm: initialLengthMm,
    geometry: null,
    selectedId: null,
    scale: 1,
    dirty: false,
    pointerAction: null,
    qrPreviewCache: new Map(),
    previewFieldValues: null,
    previewUnit: null,
    previewSearchRequest: 0,
    history: [],
    historyIndex: -1,
    historyTimer: null,
    historyRestoring: false,
    savedSignature: '',
    templateStatus: String(root.dataset.templateStatus || 'draft'),
    savedRevision: Number(root.dataset.templateRevision || 0),
    savedReady: root.dataset.builderSavedReady === '1',
    savedStatusText: 'Not saved this session',
    savedStatusGreen: false
  };
  delete state.layout.mediaPresetCode;
  mediaWidthSelect.value = state.media.code;
  lengthInput.value = String(state.lengthMm);

  function updateGeometry() {
    state.geometry = {
      canvasWidthDots: Number(state.media.printableWidthDots),
      canvasHeightDots: mmToDots(state.lengthMm)
    };
  }
  updateGeometry();

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function selectedRegion() {
    return state.layout.elements.find((element) => element.id === state.selectedId) || null;
  }

  function getGridSize() {
    const size = Number(gridSizeSelect.value);
    return [1, 5, 10].includes(size) ? size : 5;
  }

  function snapValue(value) {
    if (!snapToggle.checked) return Math.round(value);
    const size = getGridSize();
    return Math.round(value / size) * size;
  }

  function setCenterGuides({ vertical = false, horizontal = false } = {}) {
    canvas.classList.toggle('show-vertical-center-guide', vertical);
    canvas.classList.toggle('show-horizontal-center-guide', horizontal);
  }

  function applyCenterGuideAssist(region, x, y) {
    const centeredX = Math.round((state.geometry.canvasWidthDots - region.width) / 2);
    const centeredY = Math.round((state.geometry.canvasHeightDots - region.height) / 2);
    const vertical = Math.abs(x - centeredX) * state.scale <= CENTER_GUIDE_SNAP_PX;
    const horizontal = Math.abs(y - centeredY) * state.scale <= CENTER_GUIDE_SNAP_PX;
    return {
      x: vertical ? centeredX : x,
      y: horizontal ? centeredY : y,
      vertical,
      horizontal
    };
  }

  function normalizeBarcodeTextSize(value, fallback = LEGACY_BARCODE_TEXT_SIZE) {
    const size = Number(value);
    return Number.isFinite(size)
      ? clamp(Math.round(size), MIN_BARCODE_TEXT_SIZE, MAX_BARCODE_TEXT_SIZE)
      : fallback;
  }

  function normalizeTextStyle(region) {
    region.style = { ...DEFAULT_STYLE, ...(region.style || {}) };
    if (!fontByCode.has(region.style.fontFamily)) region.style.fontFamily = DEFAULT_STYLE.fontFamily;
    const size = Number(region.style.fontSize);
    region.style.fontSize = Number.isFinite(size) ? clamp(Math.round(size), 6, 300) : DEFAULT_STYLE.fontSize;
    region.style.fontWeight = [400, 500, 700].includes(Number(region.style.fontWeight)) ? Number(region.style.fontWeight) : 400;
    region.style.align = ['left', 'center', 'right'].includes(region.style.align) ? region.style.align : 'left';
    region.style.textCase = ['plain', 'upper', 'lower', 'camel'].includes(region.style.textCase) ? region.style.textCase : 'plain';
    region.style.overflow = 'shrink';
    if (region.type === 'dynamic_text') {
      region.source = { ...(region.source || {}), field: String(region.source?.field || ''), format: 'plain' };
      if (!region.style.textCase && ['upper', 'lower', 'camel'].includes(region.source?.format)) region.style.textCase = region.source.format;
      region.source.format = 'plain';
    }
  }

  function getTextLocalBoxDots(region) {
    const quarterTurn = normalizeRotation(region?.rotation) === 90 || normalizeRotation(region?.rotation) === 270;
    return {
      width: Math.max(2, Number(quarterTurn ? region?.height : region?.width) || 2),
      height: Math.max(2, Number(quarterTurn ? region?.width : region?.height) || 2)
    };
  }

  function constrainTextFontSizeToRegion(region) {
    if (!region || !TEXT_TYPES.has(region.type)) return;
    normalizeTextStyle(region);
    const localBox = getTextLocalBoxDots(region);
    if (localBox.height >= 6) region.style.fontSize = Math.min(region.style.fontSize, Math.floor(localBox.height));
  }

  function getFittedTextFontSize(region, text) {
    const localBox = getTextLocalBoxDots(region);
    let fontSize = Math.min(Number(region?.style?.fontSize || DEFAULT_STYLE.fontSize), localBox.height);
    const safeText = String(text || '');
    while (fontSize > 6 && safeText.length * fontSize * 0.59 > localBox.width) fontSize -= 1;
    return Math.max(6, fontSize);
  }

  function normalizeRegion(region) {
    region.width = clamp(Math.round(Number(region.width) || 2), 2, state.geometry.canvasWidthDots);
    region.height = clamp(Math.round(Number(region.height) || 2), 2, state.geometry.canvasHeightDots);
    region.x = clamp(Math.round(Number(region.x) || 0), 0, state.geometry.canvasWidthDots - region.width);
    region.y = clamp(Math.round(Number(region.y) || 0), 0, state.geometry.canvasHeightDots - region.height);
    region.rotation = normalizeRotation(region.rotation);
    if (TEXT_TYPES.has(region.type)) constrainTextFontSizeToRegion(region);
    if (region.type === 'composed_text') region.parts = normalizeComposedParts(region.parts);
    if (region.type === 'image') {
      const assetKey = String(region.assetKey || '').trim().toLowerCase();
      region.assetKey = imageAssetByKey.has(assetKey) ? assetKey : '';
      region.fit = 'contain';
      region.lockAspectRatio = region.lockAspectRatio !== false;
    }
    if (CODE_TYPES.has(region.type)) {
      normalizeCodePayload(region);
      if (region.type === 'barcode') {
        region.symbology = 'code39';
        region.showText = region.showText === true;
        region.humanReadableFontSize = normalizeBarcodeTextSize(region.humanReadableFontSize);
      } else {
        region.errorCorrection = ['L', 'M', 'Q', 'H'].includes(String(region.errorCorrection || '').toUpperCase())
          ? String(region.errorCorrection).toUpperCase()
          : 'M';
      }
    }
    if (SHAPE_TYPES.has(region.type)) {
      const lineLocalHeight = region.rotation === 90 || region.rotation === 270 ? region.width : region.height;
      const maxThickness = region.type === 'rectangle'
        ? Math.max(1, Math.min(40, Math.floor(Math.min(region.width, region.height) / 2)))
        : Math.max(1, Math.min(40, lineLocalHeight));
      region.thickness = clamp(Math.round(Number(region.thickness) || 2), 1, maxThickness);
      if (region.type === 'rectangle') region.fill = region.fill === 'filled' ? 'filled' : 'outline';
      else delete region.fill;
    }
    return region;
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function syncLayoutIdentity() {
    state.layout.mediaWidthCode = state.media.code;
    state.layout.lengthMm = state.lengthMm;
    delete state.layout.mediaPresetCode;
  }

  function buildHistorySnapshot() {
    syncLayoutIdentity();
    const documentState = {
      mediaWidthCode: state.media.code,
      lengthMm: state.lengthMm,
      layout: cloneJson(state.layout)
    };
    return {
      ...documentState,
      selectedId: state.selectedId,
      signature: JSON.stringify(documentState)
    };
  }

  function updateDirtyIndicator(signature = buildHistorySnapshot().signature) {
    state.dirty = signature !== state.savedSignature;
    if (state.dirty) {
      saveState.textContent = 'Unsaved changes';
      saveState.classList.remove('green');
      updateTestPrintControl();
      return;
    }
    saveState.textContent = state.savedStatusText;
    saveState.classList.toggle('green', state.savedStatusGreen);
    updateTestPrintControl();
  }

  function updateTestPrintControl() {
    if (!testPrintButton) return;
    const unitId = Number(state.previewUnit?.unitId || 0);
    if (testPrintUnitInput) testPrintUnitInput.value = unitId > 0 ? String(unitId) : '';
    testPrintButton.disabled = state.dirty || !state.savedReady;
    testPrintButton.title = state.dirty
      ? 'Save the current layout before sending a Test Print.'
      : state.savedReady
        ? 'Print one physical test label from the saved layout using Representative Data or the selected Unit.'
        : 'Complete and save a print-ready layout before sending a Test Print.';
  }

  function updateHistoryControls() {
    undoButton.disabled = state.historyIndex <= 0;
    redoButton.disabled = state.historyIndex < 0 || state.historyIndex >= state.history.length - 1;
    const undoCount = Math.max(0, state.historyIndex);
    const redoCount = Math.max(0, state.history.length - state.historyIndex - 1);
    undoButton.title = undoCount ? `Undo (Ctrl+Z) · ${undoCount} available` : 'Undo (Ctrl+Z)';
    redoButton.title = redoCount ? `Redo (Ctrl+Y) · ${redoCount} available` : 'Redo (Ctrl+Y)';
  }

  function clearHistoryTimer() {
    if (!state.historyTimer) return;
    window.clearTimeout(state.historyTimer);
    state.historyTimer = null;
  }

  function commitHistoryCheckpoint() {
    if (state.historyRestoring) return false;
    clearHistoryTimer();
    const snapshot = buildHistorySnapshot();
    const current = state.history[state.historyIndex];
    if (current?.signature === snapshot.signature) {
      current.selectedId = snapshot.selectedId;
      updateDirtyIndicator(snapshot.signature);
      updateHistoryControls();
      return false;
    }

    if (state.historyIndex < state.history.length - 1) {
      state.history.splice(state.historyIndex + 1);
    }
    state.history.push(snapshot);
    if (state.history.length > MAX_HISTORY_STATES) {
      const removeCount = state.history.length - MAX_HISTORY_STATES;
      state.history.splice(0, removeCount);
      state.historyIndex = Math.max(-1, state.historyIndex - removeCount);
    }
    state.historyIndex = state.history.length - 1;
    updateDirtyIndicator(snapshot.signature);
    updateHistoryControls();
    return true;
  }

  function scheduleHistoryCheckpoint() {
    if (state.historyRestoring) return;
    clearHistoryTimer();
    state.historyTimer = window.setTimeout(() => {
      state.historyTimer = null;
      commitHistoryCheckpoint();
    }, HISTORY_INPUT_DEBOUNCE_MS);
  }

  function initializeHistory() {
    clearHistoryTimer();
    const snapshot = buildHistorySnapshot();
    state.history = [snapshot];
    state.historyIndex = 0;
    state.savedSignature = snapshot.signature;
    state.dirty = false;
    updateHistoryControls();
  }

  function restoreHistorySnapshot(snapshot) {
    if (!snapshot) return;
    state.historyRestoring = true;
    try {
      const media = mediaByCode.get(snapshot.mediaWidthCode);
      if (!media) return;
      state.media = media;
      state.lengthMm = normalizeLengthMm(snapshot.lengthMm) || 30;
      state.layout = cloneJson(snapshot.layout);
      state.selectedId = state.layout.elements.some((element) => element.id === snapshot.selectedId) ? snapshot.selectedId : null;
      mediaWidthSelect.value = state.media.code;
      lengthInput.value = String(state.lengthMm);
      updateGeometry();
      renderRegions();
      updateScale();
      updateGrid();
      updateDirtyIndicator(buildHistorySnapshot().signature);
    } finally {
      state.historyRestoring = false;
      updateHistoryControls();
    }
  }

  function undoHistory() {
    commitHistoryCheckpoint();
    if (state.historyIndex <= 0) return;
    state.historyIndex -= 1;
    restoreHistorySnapshot(state.history[state.historyIndex]);
  }

  function redoHistory() {
    commitHistoryCheckpoint();
    if (state.historyIndex < 0 || state.historyIndex >= state.history.length - 1) return;
    state.historyIndex += 1;
    restoreHistorySnapshot(state.history[state.historyIndex]);
  }

  function restoreBuilderShortcutFocus() {
    const active = document.activeElement;
    if (active instanceof Node && root.contains(active)) return;
    const selectedNode = state.selectedId
      ? [...canvas.querySelectorAll('[data-builder-region]')].find((node) => node.dataset.builderRegion === state.selectedId)
      : null;
    (selectedNode || canvas).focus({ preventScroll: true });
  }

  function markDirty() {
    if (state.historyRestoring) return;
    state.dirty = true;
    saveState.textContent = 'Unsaved changes';
    saveState.classList.remove('green');
    updateTestPrintControl();
    scheduleHistoryCheckpoint();
  }

  function clearErrors() {
    errorBox.hidden = true;
    errorBox.replaceChildren();
  }

  function showErrors(messages) {
    errorBox.replaceChildren();
    const list = Array.isArray(messages) ? messages : [messages];
    list.filter(Boolean).forEach((message) => {
      const p = document.createElement('p');
      p.textContent = message;
      errorBox.appendChild(p);
    });
    errorBox.hidden = false;
    errorBox.scrollIntoView({ block: 'nearest' });
  }

  function updateScale() {
    const availableWidth = Math.max(280, workspace.clientWidth - 36);
    state.scale = Math.min(1, availableWidth / state.geometry.canvasWidthDots);
    canvas.style.width = `${Math.round(state.geometry.canvasWidthDots * state.scale)}px`;
    canvas.style.height = `${Math.round(state.geometry.canvasHeightDots * state.scale)}px`;
    canvas.style.setProperty('--label-grid-size', `${Math.max(1, getGridSize() * state.scale)}px`);
    canvasSize.textContent = `${state.geometry.canvasWidthDots} × ${state.geometry.canvasHeightDots}`;
    mediaSummary.textContent = `${state.media.widthMm} mm roll × ${state.lengthMm} mm length`;
    for (const node of canvas.querySelectorAll('[data-builder-region]')) {
      const region = state.layout.elements.find((element) => element.id === node.dataset.builderRegion);
      if (region) applyRegionStyle(node, region);
    }
  }

  function applyTextCase(value, textCase) {
    const text = String(value || '');
    if (textCase === 'upper') return text.toUpperCase();
    if (textCase === 'lower') return text.toLowerCase();
    if (textCase === 'camel') return text.toLowerCase().replace(/\b[a-z]+\b/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
    return text;
  }

  function getRegionPreviewText(region) {
    if (region.type === 'static_text') return applyTextCase(region.text || 'Static Text', region.style?.textCase);
    if (region.type === 'dynamic_text') return applyTextCase(getFieldPreviewValue(region.source?.field), region.style?.textCase);
    if (region.type === 'composed_text') return applyTextCase(getComposedPreviewValue(region.parts), region.style?.textCase);
    return '';
  }

  function normalizePayloadFormat(value) {
    return ['plain', 'upper', 'lower', 'camel'].includes(String(value || '')) ? String(value) : 'plain';
  }

  function normalizeComposedParts(parts) {
    if (!Array.isArray(parts)) return [];
    return parts.slice(0, 40).map((part) => {
      if (part?.type === 'static') {
        return { type: 'static', value: String(part.value || '').slice(0, 500) };
      }
      if (part?.type === 'field') {
        return {
          type: 'field',
          field: String(part.field || ''),
          fallback: String(part.fallback || '').slice(0, 160),
          format: normalizePayloadFormat(part.format)
        };
      }
      return null;
    }).filter(Boolean);
  }

  function parseComposedPayloadTemplate(value) {
    const input = String(value || '').slice(0, 1000);
    const parts = [];
    const tokenPattern = /\{\{([a-z0-9_.-]+)\}\}/gi;
    let cursor = 0;
    let match;
    while ((match = tokenPattern.exec(input)) !== null && parts.length < 40) {
      if (match.index > cursor) parts.push({ type: 'static', value: input.slice(cursor, match.index) });
      parts.push({ type: 'field', field: match[1], fallback: '', format: 'plain' });
      cursor = tokenPattern.lastIndex;
    }
    if (cursor < input.length && parts.length < 40) parts.push({ type: 'static', value: input.slice(cursor) });
    return normalizeComposedParts(parts);
  }

  function payloadPartsToTemplate(parts) {
    return normalizeComposedParts(parts).map((part) => {
      if (part.type === 'field') return `{{${String(part.field || '')}}}`;
      return String(part.value || '');
    }).join('');
  }

  function getFieldPreviewValue(fieldKey) {
    const key = String(fieldKey || '');
    if (state.previewFieldValues) {
      if (Object.prototype.hasOwnProperty.call(state.previewFieldValues, key)) {
        return String(state.previewFieldValues[key] ?? '');
      }
      return '';
    }
    const field = fieldByKey.get(key);
    return String(field?.sampleValue || field?.label || fieldKey || 'Dynamic Value');
  }

  function setPreviewResultsMessage(message, { isError = false } = {}) {
    unitResults.replaceChildren();
    const row = document.createElement('p');
    row.className = `label-builder-live-preview-result-message${isError ? ' is-error' : ''}`;
    row.textContent = message;
    unitResults.appendChild(row);
    unitResults.hidden = false;
  }

  function renderPreviewUnitResults(units) {
    unitResults.replaceChildren();
    const list = Array.isArray(units) ? units : [];
    if (!list.length) {
      setPreviewResultsMessage('No matching Units found.');
      return;
    }

    for (const unit of list) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'label-builder-live-preview-result';
      button.dataset.builderPreviewUnitId = String(unit.unitId);

      const primary = document.createElement('strong');
      primary.textContent = unit.assetTag || `Unit #${unit.unitId}`;
      const meta = document.createElement('small');
      meta.textContent = [
        `Unit #${unit.unitId}`,
        unit.modelDisplay || '',
        unit.lotName ? `Lot: ${unit.lotName}` : '',
        unit.isParked ? 'Parked' : ''
      ].filter(Boolean).join(' · ');
      button.append(primary, meta);
      button.addEventListener('click', () => selectPreviewUnit(unit.unitId));
      unitResults.appendChild(button);
    }
    unitResults.hidden = false;
  }

  function updatePreviewUnitStatus() {
    if (!state.previewUnit) {
      previewStatus.textContent = 'Representative data';
      previewStatus.classList.remove('good');
      previewStatus.classList.add('slate');
      previewSummary.textContent = 'Representative values are shown until you select a Unit.';
      unitClearButton.hidden = true;
      updateTestPrintControl();
      return;
    }

    previewStatus.textContent = `Live · ${state.previewUnit.primaryLabel || `Unit #${state.previewUnit.unitId}`}`;
    previewStatus.classList.remove('slate');
    previewStatus.classList.add('good');
    previewSummary.textContent = [
      state.previewUnit.modelDisplay || '',
      state.previewUnit.lotName ? `Lot: ${state.previewUnit.lotName}` : '',
      state.previewUnit.isParked ? 'Parked Unit' : ''
    ].filter(Boolean).join(' · ') || `Unit #${state.previewUnit.unitId}`;
    unitClearButton.hidden = false;
    updateTestPrintControl();
  }

  async function selectPreviewUnit(unitId) {
    const requestId = ++state.previewSearchRequest;
    unitSearchButton.disabled = true;
    try {
      const response = await fetch(`/management/label-library/builder/units/${encodeURIComponent(unitId)}`, {
        headers: { 'Accept': 'application/json' }
      });
      const payload = await response.json().catch(() => ({ ok: false, errors: ['The server returned an invalid response.'] }));
      if (requestId !== state.previewSearchRequest) return;
      if (!response.ok || !payload.ok) throw new Error((payload.errors || ['The Unit preview could not be loaded.']).join(' '));
      state.previewFieldValues = payload.fieldValues && typeof payload.fieldValues === 'object' ? payload.fieldValues : {};
      state.previewUnit = payload.unit || { unitId: Number(unitId) };
      unitResults.hidden = true;
      updatePreviewUnitStatus();
      renderRegions();
    } catch (error) {
      if (requestId === state.previewSearchRequest) setPreviewResultsMessage(error.message || 'The Unit preview could not be loaded.', { isError: true });
    } finally {
      if (requestId === state.previewSearchRequest) unitSearchButton.disabled = false;
    }
  }

  async function searchPreviewUnits() {
    const search = String(unitSearchInput.value || '').trim();
    if (!search) {
      setPreviewResultsMessage('Enter an Asset Tag, Unit ID, serial, or UUID.');
      unitSearchInput.focus();
      return;
    }

    const requestId = ++state.previewSearchRequest;
    unitSearchButton.disabled = true;
    setPreviewResultsMessage('Searching…');
    try {
      const response = await fetch(`/management/label-library/builder/units?q=${encodeURIComponent(search)}`, {
        headers: { 'Accept': 'application/json' }
      });
      const payload = await response.json().catch(() => ({ ok: false, errors: ['The server returned an invalid response.'] }));
      if (requestId !== state.previewSearchRequest) return;
      if (!response.ok || !payload.ok) throw new Error((payload.errors || ['Unit search failed.']).join(' '));
      renderPreviewUnitResults(payload.units);
    } catch (error) {
      if (requestId === state.previewSearchRequest) setPreviewResultsMessage(error.message || 'Unit search failed.', { isError: true });
    } finally {
      if (requestId === state.previewSearchRequest) unitSearchButton.disabled = false;
    }
  }

  function clearPreviewUnit() {
    state.previewSearchRequest += 1;
    state.previewFieldValues = null;
    state.previewUnit = null;
    unitSearchInput.value = '';
    unitResults.hidden = true;
    unitResults.replaceChildren();
    unitSearchButton.disabled = false;
    updatePreviewUnitStatus();
    renderRegions();
  }

  function getComposedPreviewValue(parts) {
    return normalizeComposedParts(parts).map((part) => {
      if (part.type === 'static') return String(part.value || '');
      return applyTextCase(getFieldPreviewValue(part.field), part.format);
    }).join('');
  }

  function normalizeCodePayload(region) {
    const current = region.payload && typeof region.payload === 'object' ? region.payload : {};
    const type = PAYLOAD_TYPES.has(String(current.type || '')) ? String(current.type) : 'field';
    if (type === 'static') {
      region.payload = { type, value: String(current.value || '').slice(0, 500) };
    } else if (type === 'composed') {
      region.payload = { type, parts: normalizeComposedParts(current.parts) };
    } else {
      region.payload = {
        type: 'field',
        field: String(current.field || ''),
        fallback: String(current.fallback || '').slice(0, 160),
        format: normalizePayloadFormat(current.format)
      };
    }
  }

  function getPayloadFormat(payload) {
    if (payload?.type === 'field') return normalizePayloadFormat(payload.format);
    return 'plain';
  }

  function getPayloadPreviewValue(payload) {
    if (!payload || typeof payload !== 'object') return '';
    if (payload.type === 'static') return String(payload.value || '');
    if (payload.type === 'field') return applyTextCase(getFieldPreviewValue(payload.field), payload.format);
    if (payload.type === 'composed') return getComposedPreviewValue(payload.parts);
    return '';
  }

  function buildCode39Bars(value, narrow = 2, wide = 5, gap = 2) {
    const safeValue = String(value || '').toUpperCase().replace(/[^0-9A-Z.\- $/+%]/g, '').slice(0, 48);
    if (!safeValue) return null;
    const bars = [];
    let x = 0;
    for (const character of `*${safeValue}*`) {
      const pattern = CODE39_PATTERNS[character];
      if (!pattern) continue;
      let isBar = true;
      for (const unit of pattern) {
        const width = unit === 'w' ? wide : narrow;
        if (isBar) bars.push({ x, width });
        x += width;
        isBar = !isBar;
      }
      x += gap;
    }
    return { bars, width: x, value: safeValue };
  }

  function buildCode39BarsToFit(value, maxWidth) {
    const availableWidth = Math.max(1, Math.floor(Number(maxWidth) || 0));
    let best = null;
    for (let narrow = 1; narrow <= 64; narrow += 1) {
      const gap = narrow;
      const quietZone = narrow * 10;
      for (let wide = narrow * 2; wide <= narrow * 3; wide += 1) {
        const barcode = buildCode39Bars(value, narrow, wide, gap);
        if (!barcode) return null;
        if (barcode.width + (quietZone * 2) > availableWidth) break;
        if (!best || barcode.width > best.width) {
          best = { ...barcode, narrow, wide, gap, quietZone };
        }
      }
    }
    if (best) return best;
    const fallback = buildCode39Bars(value, 1, 3, 1);
    return fallback && fallback.width <= availableWidth ? fallback : null;
  }

  function renderBarcodePreview(svg, region, widthPx, heightPx) {
    svg.replaceChildren();
    const value = getPayloadPreviewValue(region.payload);
    const widthDots = Math.max(1, widthPx / Math.max(0.001, state.scale));
    const heightDots = Math.max(1, heightPx / Math.max(0.001, state.scale));
    const barcode = buildCode39BarsToFit(value, widthDots);
    if (!barcode) return;
    const requestedTextSize = normalizeBarcodeTextSize(region.humanReadableFontSize);
    const previewTextSize = Math.max(6, requestedTextSize);
    const textHeight = region.showText
      ? Math.min(Math.max(0, heightDots - 1), Math.max(previewTextSize + 4, 10))
      : 0;
    const barHeight = Math.max(1, heightDots - textHeight);
    const startX = Math.max(0, (widthDots - barcode.width) / 2);
    svg.setAttribute('viewBox', `0 0 ${Math.max(1, widthDots)} ${Math.max(1, heightDots)}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    const ns = 'http://www.w3.org/2000/svg';
    for (const bar of barcode.bars) {
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', String(startX + bar.x));
      rect.setAttribute('y', '0');
      rect.setAttribute('width', String(bar.width));
      rect.setAttribute('height', String(barHeight));
      rect.setAttribute('fill', '#000');
      svg.appendChild(rect);
    }
    if (region.showText) {
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', String(widthDots / 2));
      text.setAttribute('y', String(heightDots - 2));
      text.setAttribute('font-size', String(Math.min(previewTextSize, Math.max(6, textHeight - 2))));
      text.setAttribute('font-family', '"Liberation Sans", Arial, sans-serif');
      text.setAttribute('font-weight', '700');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', '#000');
      text.textContent = barcode.value;
      svg.appendChild(text);
    }
  }

  async function getQrPreviewUrl(region) {
    const value = getPayloadPreviewValue(region.payload).slice(0, 500);
    if (!value) return '';
    const errorCorrection = ['L', 'M', 'Q', 'H'].includes(region.errorCorrection) ? region.errorCorrection : 'M';
    const key = `${errorCorrection}\n${value}`;
    if (state.qrPreviewCache.has(key)) return state.qrPreviewCache.get(key);
    const promise = fetch('/management/label-library/builder/qr-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'image/svg+xml' },
      body: JSON.stringify({ value, errorCorrection })
    }).then(async (response) => {
      if (!response.ok) throw new Error('QR preview could not be generated.');
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    }).catch(() => '');
    state.qrPreviewCache.set(key, promise);
    return promise;
  }

  function updateQrPreviewImage(image, region) {
    const previewKey = `${region.errorCorrection || 'M'}\n${getPayloadPreviewValue(region.payload)}`;
    if (image.dataset.builderQrPreviewKey === previewKey) return;
    image.dataset.builderQrPreviewKey = previewKey;
    getQrPreviewUrl(region).then((url) => {
      if (image.dataset.builderQrPreviewKey !== previewKey) return;
      if (url) image.src = url;
      else image.removeAttribute('src');
    });
  }

  function getImageAsset(region) {
    return imageAssetByKey.get(String(region?.assetKey || '')) || null;
  }

  function getImageAspectRatio(region) {
    const asset = getImageAsset(region);
    const nativeWidth = Number(asset?.width);
    const nativeHeight = Number(asset?.height);
    let ratio = nativeWidth > 0 && nativeHeight > 0 ? nativeWidth / nativeHeight : Number(region?.width) / Math.max(1, Number(region?.height));
    if (!Number.isFinite(ratio) || ratio <= 0) ratio = 1;
    const rotation = normalizeRotation(region?.rotation);
    return rotation === 90 || rotation === 270 ? 1 / ratio : ratio;
  }

  function fitRegionToImageAspect(region) {
    if (!region || region.type !== 'image' || !region.lockAspectRatio || !getImageAsset(region)) return;
    const ratio = getImageAspectRatio(region);
    let width = Math.max(2, Math.round(region.width));
    let height = Math.max(2, Math.round(width / ratio));
    const maxWidth = state.geometry.canvasWidthDots - region.x;
    const maxHeight = state.geometry.canvasHeightDots - region.y;
    if (height > maxHeight) {
      height = Math.max(2, maxHeight);
      width = Math.max(2, Math.round(height * ratio));
    }
    if (width > maxWidth) {
      width = Math.max(2, maxWidth);
      height = Math.max(2, Math.round(width / ratio));
    }
    region.width = width;
    region.height = Math.min(height, maxHeight);
  }

  function renderShapePreview(svg, region, widthPx, heightPx) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const width = Math.max(1, Number(widthPx) || 1);
    const height = Math.max(1, Number(heightPx) || 1);
    const thickness = Math.max(1, Math.min(40, Number(region.thickness) || 2)) * state.scale;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    if (region.type === 'line') {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '0');
      line.setAttribute('y1', String(height / 2));
      line.setAttribute('x2', String(width));
      line.setAttribute('y2', String(height / 2));
      line.setAttribute('stroke', '#000');
      line.setAttribute('stroke-width', String(Math.max(1, thickness)));
      line.setAttribute('stroke-linecap', 'butt');
      line.setAttribute('shape-rendering', 'crispEdges');
      svg.appendChild(line);
      return;
    }
    if (region.type === 'rectangle') {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      if (region.fill === 'filled') {
        rect.setAttribute('x', '0');
        rect.setAttribute('y', '0');
        rect.setAttribute('width', String(width));
        rect.setAttribute('height', String(height));
        rect.setAttribute('fill', '#000');
      } else {
        const inset = Math.max(0.5, thickness / 2);
        rect.setAttribute('x', String(inset));
        rect.setAttribute('y', String(inset));
        rect.setAttribute('width', String(Math.max(0, width - (inset * 2))));
        rect.setAttribute('height', String(Math.max(0, height - (inset * 2))));
        rect.setAttribute('fill', 'none');
        rect.setAttribute('stroke', '#000');
        rect.setAttribute('stroke-width', String(Math.max(1, thickness)));
      }
      rect.setAttribute('shape-rendering', 'crispEdges');
      svg.appendChild(rect);
    }
  }

  function applyRegionContentStyle(node, region) {
    const content = node.querySelector('[data-builder-region-content]');
    const image = node.querySelector('[data-builder-region-image]');
    const barcode = node.querySelector('[data-builder-region-barcode]');
    const qr = node.querySelector('[data-builder-region-qr]');
    const shape = node.querySelector('[data-builder-region-shape]');
    const isText = TEXT_TYPES.has(region.type);
    const isImage = region.type === 'image';
    const isBarcode = region.type === 'barcode';
    const isQr = region.type === 'qr';
    const isShape = SHAPE_TYPES.has(region.type);
    if (content) content.hidden = !isText;
    if (image) image.hidden = !isImage;
    if (barcode) barcode.hidden = !isBarcode;
    if (qr) qr.hidden = !isQr;
    if (shape) shape.hidden = !isShape;

    const rotation = normalizeRotation(region.rotation);
    const quarterTurn = rotation === 90 || rotation === 270;
    const localWidth = (quarterTurn ? region.height : region.width) * state.scale;
    const localHeight = (quarterTurn ? region.width : region.height) * state.scale;
    const physicalWidth = region.width * state.scale;
    const physicalHeight = region.height * state.scale;
    const left = (physicalWidth - localWidth) / 2;
    const top = (physicalHeight - localHeight) / 2;

    if (isText && content) {
      normalizeTextStyle(region);
      content.style.width = `${localWidth}px`;
      content.style.height = `${localHeight}px`;
      content.style.left = `${left}px`;
      content.style.top = `${top}px`;
      content.style.transform = `rotate(${rotation}deg)`;
      content.style.fontFamily = fontByCode.get(region.style.fontFamily)?.cssFamily || region.style.fontFamily;
      const fittedFontSizeDots = getFittedTextFontSize(region, getRegionPreviewText(region));
      const previewFontSize = Math.max(6, fittedFontSizeDots * state.scale);
      content.style.fontSize = `${previewFontSize}px`;
      if (Number(region.style.fontWeight) === 500) {
        const mediumStrokePx = Math.max(0.45, Math.min(1.5, previewFontSize * 0.025));
        content.style.fontWeight = '400';
        content.style.setProperty('-webkit-text-stroke', `${mediumStrokePx}px currentColor`);
      } else {
        content.style.fontWeight = String(region.style.fontWeight);
        content.style.removeProperty('-webkit-text-stroke');
      }
      content.style.justifyContent = region.style.align === 'center' ? 'center' : region.style.align === 'right' ? 'flex-end' : 'flex-start';
      content.style.textAlign = region.style.align;
      content.textContent = getRegionPreviewText(region);
    }

    if (isImage && image) {
      const asset = getImageAsset(region);
      image.style.width = `${localWidth}px`;
      image.style.height = `${localHeight}px`;
      image.style.left = `${left}px`;
      image.style.top = `${top}px`;
      image.style.transform = `rotate(${rotation}deg)`;
      if (asset?.fileUrl) {
        if (image.dataset.builderAssetKey !== String(asset.assetKey)) {
          image.src = asset.fileUrl;
          image.dataset.builderAssetKey = String(asset.assetKey);
        }
        image.alt = asset.name || 'Shared Asset';
      } else {
        image.removeAttribute('src');
        delete image.dataset.builderAssetKey;
        image.alt = '';
      }
    }

    if (isBarcode && barcode) {
      barcode.style.width = `${localWidth}px`;
      barcode.style.height = `${localHeight}px`;
      barcode.style.left = `${left}px`;
      barcode.style.top = `${top}px`;
      barcode.style.transform = `rotate(${rotation}deg)`;
      renderBarcodePreview(barcode, region, Math.max(1, localWidth), Math.max(1, localHeight));
    }

    if (isQr && qr) {
      const side = Math.max(1, Math.min(localWidth, localHeight));
      qr.style.width = `${side}px`;
      qr.style.height = `${side}px`;
      qr.style.left = `${left + ((localWidth - side) / 2)}px`;
      qr.style.top = `${top + ((localHeight - side) / 2)}px`;
      qr.style.transform = `rotate(${rotation}deg)`;
      updateQrPreviewImage(qr, region);
    }

    if (isShape && shape) {
      shape.style.width = `${localWidth}px`;
      shape.style.height = `${localHeight}px`;
      shape.style.left = `${left}px`;
      shape.style.top = `${top}px`;
      shape.style.transform = `rotate(${rotation}deg)`;
      renderShapePreview(shape, region, Math.max(1, localWidth), Math.max(1, localHeight));
    }
  }

  function applyRegionStyle(node, region) {
    node.style.left = `${region.x * state.scale}px`;
    node.style.top = `${region.y * state.scale}px`;
    node.style.width = `${region.width * state.scale}px`;
    node.style.height = `${region.height * state.scale}px`;
    node.dataset.builderRotation = String(normalizeRotation(region.rotation));
    node.dataset.builderType = String(region.type || 'unconfigured');
    node.dataset.builderHasAsset = region.type === 'image' && Boolean(getImageAsset(region)) ? 'true' : 'false';
    const badge = node.querySelector('[data-builder-region-label]');
    if (badge) {
      badge.textContent = region.type === 'unconfigured' ? 'Region' : String(region.type).replaceAll('_', ' ');
      badge.hidden = TEXT_TYPES.has(region.type)
        || (region.type === 'image' && Boolean(getImageAsset(region)))
        || (CODE_TYPES.has(region.type) && Boolean(getPayloadPreviewValue(region.payload)))
        || SHAPE_TYPES.has(region.type);
    }
    applyRegionContentStyle(node, region);
  }

  function updateGrid() {
    canvas.classList.toggle('show-grid', gridVisible.checked);
    canvas.style.setProperty('--label-grid-size', `${Math.max(1, getGridSize() * state.scale)}px`);
  }

  function setPropertyVisibility(region) {
    const isStatic = region?.type === 'static_text';
    const isDynamic = region?.type === 'dynamic_text';
    const isImage = region?.type === 'image';
    const isBarcode = region?.type === 'barcode';
    const isQr = region?.type === 'qr';
    const isLine = region?.type === 'line';
    const isRectangle = region?.type === 'rectangle';
    staticTextWrap.hidden = !isStatic;
    dynamicTextWrap.hidden = !isDynamic;
    imageProperties.hidden = !isImage;
    codeProperties.hidden = !(isBarcode || isQr);
    barcodeProperties.hidden = !isBarcode;
    qrProperties.hidden = !isQr;
    shapeProperties.hidden = !(isLine || isRectangle);
    rectangleFillWrap.hidden = !isRectangle;
    textStylePanel.hidden = !TEXT_TYPES.has(region?.type);
  }

  function updateImageInspector(region) {
    if (!region || region.type !== 'image') return;
    const asset = getImageAsset(region);
    imageAssetSelect.value = asset ? String(asset.assetKey) : '';
    imageLockToggle.checked = region.lockAspectRatio !== false;
    imagePreview.hidden = !asset;
    if (!asset) {
      imagePreviewImg.removeAttribute('src');
      imagePreviewName.textContent = '';
      imagePreviewMeta.textContent = '';
      return;
    }
    imagePreviewImg.src = asset.fileUrl;
    imagePreviewName.textContent = asset.name || 'Shared Asset';
    const dimensions = asset.width && asset.height ? `${asset.width} × ${asset.height}` : 'Scalable';
    imagePreviewMeta.textContent = `${asset.mimeType === 'image/svg+xml' ? 'SVG' : 'PNG'} · ${dimensions}`;
  }

  function getComposedTargetParts(region) {
    if (!region) return null;
    if (region.type === 'composed_text') {
      region.parts = normalizeComposedParts(region.parts);
      return region.parts;
    }
    if (CODE_TYPES.has(region.type) && region.payload?.type === 'composed') {
      normalizeCodePayload(region);
      return region.payload.parts;
    }
    return null;
  }

  function setComposedTargetParts(region, parts) {
    const normalized = normalizeComposedParts(parts);
    if (region.type === 'composed_text') {
      region.parts = normalized;
      return;
    }
    if (CODE_TYPES.has(region.type)) region.payload = { type: 'composed', parts: normalized };
  }

  function updateSelectedRegionVisualOnly() {
    const region = selectedRegion();
    if (!region) return;
    const node = canvas.querySelector(`[data-builder-region="${CSS.escape(region.id)}"]`);
    if (node) applyRegionStyle(node, region);
  }

  function updateComposedPreview(region) {
    const parts = getComposedTargetParts(region) || [];
    composedPreview.textContent = getComposedPreviewValue(parts) || '—';
    composedExpression.value = payloadPartsToTemplate(parts);
  }

  function makeComposedFieldSelect(part, index) {
    const select = document.createElement('select');
    select.className = 'label-builder-composed-part-input';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'Choose a field…';
    select.appendChild(blank);
    for (const group of fieldGroups) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = group.label;
      for (const field of group.fields || []) {
        const option = document.createElement('option');
        option.value = field.key;
        option.textContent = field.label;
        optgroup.appendChild(option);
      }
      select.appendChild(optgroup);
    }
    select.value = part.field || '';
    select.addEventListener('change', () => {
      const region = selectedRegion();
      const parts = getComposedTargetParts(region);
      if (!parts?.[index]) return;
      parts[index].field = select.value;
      setComposedTargetParts(region, parts);
      updateComposedPreview(region);
      updateSelectedRegionVisualOnly();
      markDirty();
    });
    return select;
  }

  function makeComposedCaseSelect(part, index) {
    const select = document.createElement('select');
    select.className = 'label-builder-composed-part-case';
    for (const [value, label] of [['plain', 'As Stored'], ['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['camel', 'Camel Case']]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    }
    select.value = normalizePayloadFormat(part.format);
    select.addEventListener('change', () => {
      const region = selectedRegion();
      const parts = getComposedTargetParts(region);
      if (!parts?.[index]) return;
      parts[index].format = normalizePayloadFormat(select.value);
      setComposedTargetParts(region, parts);
      updateComposedPreview(region);
      updateSelectedRegionVisualOnly();
      markDirty();
    });
    return select;
  }

  function moveComposedPart(fromIndex, toIndex) {
    const region = selectedRegion();
    const parts = getComposedTargetParts(region);
    if (!parts || fromIndex < 0 || fromIndex >= parts.length || toIndex < 0 || toIndex >= parts.length || fromIndex === toIndex) return;
    const [part] = parts.splice(fromIndex, 1);
    parts.splice(toIndex, 0, part);
    setComposedTargetParts(region, parts);
    renderComposedEditor(region);
    updateSelectedRegionVisualOnly();
    markDirty();
  }

  function renderComposedParts(region) {
    const parts = getComposedTargetParts(region) || [];
    composedPartsWrap.replaceChildren();
    if (!parts.length) {
      const empty = document.createElement('p');
      empty.className = 'label-builder-composed-empty';
      empty.textContent = 'Add a BWTDallas field or static text part.';
      composedPartsWrap.appendChild(empty);
      return;
    }

    parts.forEach((part, index) => {
      const row = document.createElement('div');
      row.className = 'label-builder-composed-part';
      row.dataset.builderComposedIndex = String(index);

      const grip = document.createElement('span');
      grip.className = 'label-builder-composed-grip';
      grip.textContent = '⋮⋮';
      grip.title = 'Drag to reorder';
      grip.draggable = true;
      grip.setAttribute('aria-hidden', 'true');

      const kind = document.createElement('span');
      kind.className = 'label-builder-composed-kind';
      kind.textContent = part.type === 'field' ? 'Field' : 'Text';

      const editor = document.createElement('div');
      editor.className = `label-builder-composed-part-editor ${part.type === 'field' ? 'is-field' : 'is-static'}`;
      if (part.type === 'field') {
        editor.append(makeComposedFieldSelect(part, index), makeComposedCaseSelect(part, index));
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 500;
        input.placeholder = 'Static text or separator';
        input.value = String(part.value || '');
        input.className = 'label-builder-composed-part-input';
        input.addEventListener('input', () => {
          const activeRegion = selectedRegion();
          const activeParts = getComposedTargetParts(activeRegion);
          if (!activeParts?.[index]) return;
          activeParts[index].value = input.value.slice(0, 500);
          setComposedTargetParts(activeRegion, activeParts);
          updateComposedPreview(activeRegion);
          updateSelectedRegionVisualOnly();
          markDirty();
        });
        editor.appendChild(input);
      }

      const actions = document.createElement('div');
      actions.className = 'label-builder-composed-part-actions';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'secondary-button compact-button danger-button';
      remove.textContent = '×';
      remove.title = 'Remove part';
      remove.addEventListener('click', () => {
        const activeRegion = selectedRegion();
        const activeParts = getComposedTargetParts(activeRegion) || [];
        activeParts.splice(index, 1);
        setComposedTargetParts(activeRegion, activeParts);
        renderComposedEditor(activeRegion);
        updateSelectedRegionVisualOnly();
        markDirty();
      });
      actions.append(remove);

      grip.addEventListener('dragstart', (event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(index));
        row.classList.add('dragging');
      });
      grip.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      });
      row.addEventListener('drop', (event) => {
        event.preventDefault();
        const fromIndex = Number(event.dataTransfer.getData('text/plain'));
        if (Number.isInteger(fromIndex)) moveComposedPart(fromIndex, index);
      });

      row.append(grip, kind, editor, actions);
      composedPartsWrap.appendChild(row);
    });
  }

  function renderComposedEditor(region) {
    const parts = getComposedTargetParts(region);
    composedEditor.hidden = !parts;
    if (!parts) return;
    renderComposedParts(region);
    updateComposedPreview(region);
  }

  function addComposedPart(type) {
    const region = selectedRegion();
    const parts = getComposedTargetParts(region);
    if (!parts || parts.length >= 40) return;
    parts.push(type === 'static'
      ? { type: 'static', value: '' }
      : { type: 'field', field: '', fallback: '', format: 'plain' });
    setComposedTargetParts(region, parts);
    renderComposedEditor(region);
    updateSelectedRegionVisualOnly();
    markDirty();
  }

  function applyComposedPreset(presetId) {
    const region = selectedRegion();
    if (!region) return;
    const preset = composedPresetById.get(String(presetId || ''));
    if (!preset) return;
    const parts = normalizeComposedParts(preset.parts || []);

    // Apply the preset directly to the selected object's canonical state. In particular,
    // QR/Barcode objects must be forced into composed mode before the inspector is rebuilt;
    // trying to incrementally synchronize the prior payload object can leave the editor and
    // generated preview showing different values.
    if (region.type === 'composed_text') {
      region.parts = parts;
    } else if (CODE_TYPES.has(region.type)) {
      region.payload = { type: 'composed', parts };
      codePayloadTypeSelect.value = 'composed';
    } else {
      return;
    }

    // Rebuild the selected canvas object from canonical state. This creates a fresh QR image
    // node with no stale preview key and repopulates the Field/Text rows, expression, and
    // composed preview from the same parts in one deterministic pass.
    renderRegions();
    markDirty();
    const node = canvas.querySelector(`[data-builder-region="${CSS.escape(region.id)}"]`);
    node?.focus({ preventScroll: true });
  }

  function applyAdvancedComposedExpression() {
    const region = selectedRegion();
    if (!getComposedTargetParts(region)) return;
    setComposedTargetParts(region, parseComposedPayloadTemplate(composedExpression.value));
    renderComposedEditor(region);
    updateSelectedRegionVisualOnly();
    markDirty();
  }

  function updateCodePayloadVisibility(region) {
    if (!region || !CODE_TYPES.has(region.type)) return;
    normalizeCodePayload(region);
    const payloadType = region.payload.type;
    codeFieldWrap.hidden = payloadType !== 'field';
    codeStaticWrap.hidden = payloadType !== 'static';
    codeCaseWrap.hidden = payloadType !== 'field';
  }

  function updateCodeInspector(region) {
    if (!region || !CODE_TYPES.has(region.type)) return;
    normalizeCodePayload(region);
    codePayloadTypeSelect.value = region.payload.type;
    codeFieldSelect.value = region.payload.type === 'field' ? String(region.payload.field || '') : '';
    codeStaticInput.value = region.payload.type === 'static' ? String(region.payload.value || '') : '';
    codeCaseSelect.value = getPayloadFormat(region.payload);
    updateCodePayloadVisibility(region);
    if (region.type === 'barcode') {
      barcodeSymbologySelect.value = 'code39';
      barcodeShowTextToggle.checked = region.showText === true;
      barcodeTextSizeInput.value = String(normalizeBarcodeTextSize(region.humanReadableFontSize));
      barcodeTextSizeWrap.hidden = region.showText !== true;
    } else {
      qrErrorCorrectionSelect.value = ['L', 'M', 'Q', 'H'].includes(region.errorCorrection) ? region.errorCorrection : 'M';
    }
  }

  function updateShapeInspector(region) {
    if (!region || !SHAPE_TYPES.has(region.type)) return;
    const lineLocalHeight = region.rotation === 90 || region.rotation === 270 ? region.width : region.height;
    const maxThickness = region.type === 'rectangle'
      ? Math.max(1, Math.min(40, Math.floor(Math.min(region.width, region.height) / 2)))
      : Math.max(1, Math.min(40, lineLocalHeight));
    region.thickness = clamp(Math.round(Number(region.thickness) || 2), 1, maxThickness);
    shapeThicknessInput.max = String(maxThickness);
    shapeThicknessInput.value = String(region.thickness);
    if (region.type === 'rectangle') {
      region.fill = region.fill === 'filled' ? 'filled' : 'outline';
      rectangleFillSelect.value = region.fill;
      shapeThicknessLabel.textContent = 'Border Thickness (dots)';
      shapeThicknessWrap.hidden = region.fill === 'filled';
    } else {
      shapeThicknessLabel.textContent = 'Line Thickness (dots)';
      shapeThicknessWrap.hidden = false;
    }
  }

  function updateInspector() {
    const region = selectedRegion();
    deleteButton.disabled = !region;
    emptyInspector.hidden = Boolean(region);
    geometryPanel.hidden = !region;
    if (!region) {
      selectionLabel.textContent = 'Select a region on the canvas.';
      composedEditor.hidden = true;
      if (layerPosition) layerPosition.textContent = '—';
      for (const button of layerButtons) button.disabled = true;
      return;
    }

    normalizeRegion(region);
    selectionLabel.textContent = region.id;
    contentTypeSelect.value = [...contentTypeSelect.options].some((option) => option.value === region.type) ? region.type : 'unconfigured';
    setPropertyVisibility(region);
    rotationSelect.value = String(normalizeRotation(region.rotation));
    const layerIndex = state.layout.elements.findIndex((element) => element.id === region.id);
    if (layerPosition) layerPosition.textContent = `Layer ${layerIndex + 1} of ${state.layout.elements.length}`;
    for (const button of layerButtons) {
      const direction = Number(button.dataset.builderLayer || 0);
      button.disabled = direction < 0 ? layerIndex <= 0 : layerIndex >= state.layout.elements.length - 1;
    }

    if (region.type === 'static_text') staticTextInput.value = String(region.text || '');
    if (region.type === 'dynamic_text') dynamicFieldSelect.value = String(region.source?.field || '');
    if (TEXT_TYPES.has(region.type)) {
      fontFamilySelect.value = region.style.fontFamily;
      const localTextBox = getTextLocalBoxDots(region);
      fontSizeInput.max = String(Math.max(6, Math.floor(localTextBox.height)));
      fontSizeInput.value = String(region.style.fontSize);
      fontWeightSelect.value = String(region.style.fontWeight);
      textAlignSelect.value = region.style.align;
      textCaseSelect.value = region.style.textCase;
    }

    if (region.type === 'image') updateImageInspector(region);
    if (CODE_TYPES.has(region.type)) updateCodeInspector(region);
    if (SHAPE_TYPES.has(region.type)) updateShapeInspector(region);
    renderComposedEditor(region);

    for (const input of geometryFields) {
      input.value = region[input.dataset.builderGeometryField];
      if (input.dataset.builderGeometryField === 'x') input.max = state.geometry.canvasWidthDots - region.width;
      if (input.dataset.builderGeometryField === 'y') input.max = state.geometry.canvasHeightDots - region.height;
      if (input.dataset.builderGeometryField === 'width') input.max = state.geometry.canvasWidthDots - region.x;
      if (input.dataset.builderGeometryField === 'height') input.max = state.geometry.canvasHeightDots - region.y;
    }
  }

  function selectRegion(id) {
    state.selectedId = id;
    for (const node of canvas.querySelectorAll('[data-builder-region]')) {
      node.classList.toggle('selected', node.dataset.builderRegion === id);
    }
    updateInspector();
  }

  function makeHandle(position) {
    const handle = document.createElement('span');
    handle.className = `label-builder-resize-handle ${position}`;
    handle.dataset.builderResize = position;
    handle.setAttribute('aria-hidden', 'true');
    return handle;
  }

  function renderRegions() {
    canvas.replaceChildren();
    for (const [layerIndex, region] of state.layout.elements.entries()) {
      normalizeRegion(region);
      const node = document.createElement('div');
      node.className = 'label-builder-region';
      node.dataset.builderRegion = region.id;
      node.style.zIndex = String(layerIndex + 1);
      node.tabIndex = 0;
      node.setAttribute('role', 'button');
      node.setAttribute('aria-label', `Region ${region.id}`);

      const content = document.createElement('span');
      content.className = 'label-builder-region-content';
      content.dataset.builderRegionContent = '';
      content.setAttribute('aria-hidden', 'true');

      const image = document.createElement('img');
      image.className = 'label-builder-region-image';
      image.dataset.builderRegionImage = '';
      image.hidden = true;
      image.draggable = false;
      image.setAttribute('aria-hidden', 'true');

      const barcode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      barcode.classList.add('label-builder-region-barcode');
      barcode.dataset.builderRegionBarcode = '';
      barcode.hidden = true;
      barcode.setAttribute('aria-hidden', 'true');

      const qr = document.createElement('img');
      qr.className = 'label-builder-region-qr';
      qr.dataset.builderRegionQr = '';
      qr.hidden = true;
      qr.draggable = false;
      qr.setAttribute('aria-hidden', 'true');

      const shape = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      shape.classList.add('label-builder-region-shape');
      shape.dataset.builderRegionShape = '';
      shape.hidden = true;
      shape.setAttribute('aria-hidden', 'true');

      const badge = document.createElement('span');
      badge.className = 'label-builder-region-label';
      badge.dataset.builderRegionLabel = '';

      node.append(content, image, barcode, qr, shape, badge, makeHandle('nw'), makeHandle('ne'), makeHandle('sw'), makeHandle('se'));
      applyRegionStyle(node, region);
      canvas.appendChild(node);
    }
    selectRegion(state.layout.elements.some((element) => element.id === state.selectedId) ? state.selectedId : null);
  }

  function addRegion() {
    const width = Math.min(180, Math.max(60, Math.floor(state.geometry.canvasWidthDots / 3)));
    const height = Math.min(80, Math.max(40, Math.floor(state.geometry.canvasHeightDots / 5)));
    const id = `region-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${state.layout.elements.length + 1}`}`;
    const region = normalizeRegion({
      id,
      type: 'unconfigured',
      rotation: 0,
      x: Math.round((state.geometry.canvasWidthDots - width) / 2),
      y: Math.round((state.geometry.canvasHeightDots - height) / 2),
      width,
      height
    });
    state.layout.elements.push(region);
    markDirty();
    renderRegions();
    selectRegion(id);
    canvas.querySelector(`[data-builder-region="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  }

  function deleteSelected() {
    if (!state.selectedId) return;
    state.layout.elements = state.layout.elements.filter((element) => element.id !== state.selectedId);
    state.selectedId = null;
    markDirty();
    renderRegions();
  }

  function moveSelectedLayer(direction) {
    if (!state.selectedId) return;
    const currentIndex = state.layout.elements.findIndex((element) => element.id === state.selectedId);
    if (currentIndex < 0) return;
    const nextIndex = currentIndex + (direction < 0 ? -1 : 1);
    if (nextIndex < 0 || nextIndex >= state.layout.elements.length) return;

    const [region] = state.layout.elements.splice(currentIndex, 1);
    state.layout.elements.splice(nextIndex, 0, region);
    markDirty();
    renderRegions();
    const node = canvas.querySelector(`[data-builder-region="${CSS.escape(region.id)}"]`);
    node?.focus({ preventScroll: true });
  }

  function refreshSelectedRegion() {
    const region = selectedRegion();
    if (!region) return;
    const node = canvas.querySelector(`[data-builder-region="${CSS.escape(region.id)}"]`);
    if (node) applyRegionStyle(node, region);
    updateInspector();
    markDirty();
  }

  function constrainImageResize(region, original, position, bounds) {
    if (region.type !== 'image' || region.lockAspectRatio === false || !getImageAsset(region)) return bounds;
    const ratio = getImageAspectRatio(region);
    if (!Number.isFinite(ratio) || ratio <= 0) return bounds;

    let { left, top, right, bottom } = bounds;
    const rawWidth = Math.max(2, right - left);
    const rawHeight = Math.max(2, bottom - top);
    const widthChange = Math.abs(rawWidth - original.width);
    const heightChange = Math.abs(rawHeight - original.height);
    let width;
    let height;
    if (widthChange >= heightChange * ratio) {
      width = rawWidth;
      height = Math.max(2, width / ratio);
    } else {
      height = rawHeight;
      width = Math.max(2, height * ratio);
    }

    const fixedX = position.includes('w') ? right : left;
    const fixedY = position.includes('n') ? bottom : top;
    const maxWidth = position.includes('w') ? fixedX : state.geometry.canvasWidthDots - fixedX;
    const maxHeight = position.includes('n') ? fixedY : state.geometry.canvasHeightDots - fixedY;
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    width = Math.max(2, Math.round(width * scale));
    height = Math.max(2, Math.round(height * scale));

    if (position.includes('w')) left = fixedX - width;
    else right = fixedX + width;
    if (position.includes('n')) top = fixedY - height;
    else bottom = fixedY + height;

    return { left, top, right, bottom };
  }

  function beginPointerAction(event, node, resizePosition = null) {
    const region = state.layout.elements.find((element) => element.id === node.dataset.builderRegion);
    if (!region) return;
    event.preventDefault();
    selectRegion(region.id);
    node.focus({ preventScroll: true });
    setCenterGuides();
    state.pointerAction = {
      pointerId: event.pointerId,
      mode: resizePosition ? 'resize' : 'move',
      resizePosition,
      startX: event.clientX,
      startY: event.clientY,
      original: { x: region.x, y: region.y, width: region.width, height: region.height }
    };
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', endPointerAction);
    document.addEventListener('pointercancel', endPointerAction);
  }

  function handlePointerMove(event) {
    const action = state.pointerAction;
    const region = selectedRegion();
    if (!action || !region || event.pointerId !== action.pointerId) return;
    const dx = (event.clientX - action.startX) / state.scale;
    const dy = (event.clientY - action.startY) / state.scale;
    const original = action.original;

    if (action.mode === 'move') {
      const x = clamp(snapValue(original.x + dx), 0, state.geometry.canvasWidthDots - region.width);
      const y = clamp(snapValue(original.y + dy), 0, state.geometry.canvasHeightDots - region.height);
      const centerAssist = applyCenterGuideAssist(region, x, y);
      region.x = centerAssist.x;
      region.y = centerAssist.y;
      setCenterGuides(centerAssist);
    } else {
      setCenterGuides();
      let left = original.x;
      let top = original.y;
      let right = original.x + original.width;
      let bottom = original.y + original.height;
      if (action.resizePosition.includes('w')) left = snapValue(original.x + dx);
      if (action.resizePosition.includes('e')) right = snapValue(original.x + original.width + dx);
      if (action.resizePosition.includes('n')) top = snapValue(original.y + dy);
      if (action.resizePosition.includes('s')) bottom = snapValue(original.y + original.height + dy);
      left = clamp(left, 0, right - 2);
      top = clamp(top, 0, bottom - 2);
      right = clamp(right, left + 2, state.geometry.canvasWidthDots);
      bottom = clamp(bottom, top + 2, state.geometry.canvasHeightDots);
      ({ left, top, right, bottom } = constrainImageResize(region, original, action.resizePosition, { left, top, right, bottom }));
      region.x = Math.round(left);
      region.y = Math.round(top);
      region.width = Math.round(right - left);
      region.height = Math.round(bottom - top);
      constrainTextFontSizeToRegion(region);
    }

    const node = canvas.querySelector(`[data-builder-region="${CSS.escape(region.id)}"]`);
    if (node) applyRegionStyle(node, region);
    updateInspector();
    markDirty();
  }

  function endPointerAction(event) {
    if (!state.pointerAction || event.pointerId !== state.pointerAction.pointerId) return;
    state.pointerAction = null;
    setCenterGuides();
    commitHistoryCheckpoint();
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', endPointerAction);
    document.removeEventListener('pointercancel', endPointerAction);
  }

  function nudgeSelected(dx, dy) {
    const region = selectedRegion();
    if (!region) return;
    region.x = clamp(region.x + dx, 0, state.geometry.canvasWidthDots - region.width);
    region.y = clamp(region.y + dy, 0, state.geometry.canvasHeightDots - region.height);
    refreshSelectedRegion();
  }

  function applyGeometryInput(input) {
    const region = selectedRegion();
    if (!region) return;
    const field = input.dataset.builderGeometryField;
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    if (field === 'x') region.x = clamp(Math.round(value), 0, state.geometry.canvasWidthDots - region.width);
    if (field === 'y') region.y = clamp(Math.round(value), 0, state.geometry.canvasHeightDots - region.height);
    if (field === 'width') {
      region.width = clamp(Math.round(value), 2, state.geometry.canvasWidthDots - region.x);
      if (region.type === 'image' && region.lockAspectRatio && getImageAsset(region)) {
        const ratio = getImageAspectRatio(region);
        region.height = clamp(Math.round(region.width / ratio), 2, state.geometry.canvasHeightDots - region.y);
        region.width = clamp(Math.round(region.height * ratio), 2, state.geometry.canvasWidthDots - region.x);
      }
    }
    if (field === 'height') {
      region.height = clamp(Math.round(value), 2, state.geometry.canvasHeightDots - region.y);
      if (region.type === 'image' && region.lockAspectRatio && getImageAsset(region)) {
        const ratio = getImageAspectRatio(region);
        region.width = clamp(Math.round(region.height * ratio), 2, state.geometry.canvasWidthDots - region.x);
        region.height = clamp(Math.round(region.width / ratio), 2, state.geometry.canvasHeightDots - region.y);
      }
    }
    constrainTextFontSizeToRegion(region);
    refreshSelectedRegion();
  }

  function setContentType(type) {
    const region = selectedRegion();
    if (!region) return;
    const rememberedParts = normalizeComposedParts(
      region.type === 'composed_text'
        ? region.parts
        : region.payload?.type === 'composed'
          ? region.payload.parts
          : []
    );
    const nextType = ['unconfigured', 'static_text', 'dynamic_text', 'composed_text', 'image', 'barcode', 'qr', 'line', 'rectangle'].includes(type) ? type : 'unconfigured';
    region.type = nextType;
    if (!SHAPE_TYPES.has(nextType)) {
      delete region.thickness;
      delete region.fill;
    }
    if (nextType === 'static_text') {
      region.text = String(region.text || '');
      delete region.source;
      delete region.parts;
      delete region.payload;
      normalizeTextStyle(region);
    } else if (nextType === 'dynamic_text') {
      region.source = { field: String(region.source?.field || ''), format: 'plain' };
      delete region.text;
      delete region.parts;
      delete region.payload;
      normalizeTextStyle(region);
    } else if (nextType === 'composed_text') {
      region.parts = rememberedParts;
      delete region.text;
      delete region.source;
      delete region.payload;
      delete region.assetKey;
      delete region.fit;
      delete region.lockAspectRatio;
      delete region.symbology;
      delete region.showText;
      delete region.humanReadableFontSize;
      delete region.errorCorrection;
      normalizeTextStyle(region);
    } else if (nextType === 'image') {
      delete region.text;
      delete region.source;
      delete region.parts;
      delete region.style;
      delete region.payload;
      region.assetKey = imageAssetByKey.has(String(region.assetKey || '')) ? String(region.assetKey) : '';
      region.fit = 'contain';
      region.lockAspectRatio = region.lockAspectRatio !== false;
    } else if (nextType === 'barcode' || nextType === 'qr') {
      delete region.text;
      delete region.source;
      delete region.parts;
      delete region.style;
      delete region.assetKey;
      delete region.fit;
      delete region.lockAspectRatio;
      region.payload = rememberedParts.length
        ? { type: 'composed', parts: rememberedParts }
        : { type: 'field', field: '', fallback: '', format: 'plain' };
      if (nextType === 'barcode') {
        region.symbology = 'code39';
        region.showText = false;
        region.humanReadableFontSize = NEW_BARCODE_TEXT_SIZE;
        delete region.errorCorrection;
      } else {
        region.errorCorrection = 'M';
        delete region.symbology;
        delete region.showText;
        delete region.humanReadableFontSize;
      }
    } else if (SHAPE_TYPES.has(nextType)) {
      delete region.text;
      delete region.source;
      delete region.parts;
      delete region.style;
      delete region.assetKey;
      delete region.fit;
      delete region.lockAspectRatio;
      delete region.payload;
      delete region.symbology;
      delete region.showText;
      delete region.humanReadableFontSize;
      delete region.errorCorrection;
      region.thickness = clamp(Math.round(Number(region.thickness) || 2), 1, 40);
      if (nextType === 'rectangle') region.fill = region.fill === 'filled' ? 'filled' : 'outline';
      else delete region.fill;
    } else {
      delete region.text;
      delete region.source;
      delete region.parts;
      delete region.style;
      delete region.assetKey;
      delete region.fit;
      delete region.lockAspectRatio;
      delete region.payload;
      delete region.symbology;
      delete region.showText;
      delete region.humanReadableFontSize;
      delete region.errorCorrection;
    }
    renderRegions();
    selectRegion(region.id);
    markDirty();
  }

  function updateTextProperties() {
    const region = selectedRegion();
    if (!region || !TEXT_TYPES.has(region.type)) return;
    normalizeTextStyle(region);
    if (region.type === 'static_text') region.text = String(staticTextInput.value || '').slice(0, 500);
    if (region.type === 'dynamic_text') region.source = { ...(region.source || {}), field: dynamicFieldSelect.value, format: 'plain' };
    region.style.fontFamily = fontFamilySelect.value;
    const localTextBox = getTextLocalBoxDots(region);
    const maxFontSize = Math.max(6, Math.floor(localTextBox.height));
    region.style.fontSize = clamp(Math.round(Number(fontSizeInput.value) || DEFAULT_STYLE.fontSize), 6, Math.min(300, maxFontSize));
    fontSizeInput.value = String(region.style.fontSize);
    region.style.fontWeight = [400, 500, 700].includes(Number(fontWeightSelect.value)) ? Number(fontWeightSelect.value) : 400;
    region.style.align = ['left', 'center', 'right'].includes(textAlignSelect.value) ? textAlignSelect.value : 'left';
    region.style.textCase = ['plain', 'upper', 'lower', 'camel'].includes(textCaseSelect.value) ? textCaseSelect.value : 'plain';
    refreshSelectedRegion();
  }

  function updateImageProperties({ assetChanged = false } = {}) {
    const region = selectedRegion();
    if (!region || region.type !== 'image') return;
    const assetKey = String(imageAssetSelect.value || '').trim();
    region.assetKey = imageAssetByKey.has(assetKey) ? assetKey : '';
    region.fit = 'contain';
    region.lockAspectRatio = imageLockToggle.checked;
    if (assetChanged && region.assetKey && region.lockAspectRatio) fitRegionToImageAspect(region);
    refreshSelectedRegion();
  }

  function updateCodeProperties() {
    const region = selectedRegion();
    if (!region || !CODE_TYPES.has(region.type)) return;
    const current = region.payload && typeof region.payload === 'object' ? region.payload : {};
    const payloadType = PAYLOAD_TYPES.has(codePayloadTypeSelect.value) ? codePayloadTypeSelect.value : 'field';
    const format = normalizePayloadFormat(codeCaseSelect.value);
    if (payloadType === 'static') {
      region.payload = { type: 'static', value: String(codeStaticInput.value || current.value || '').slice(0, 500) };
    } else if (payloadType === 'composed') {
      let parts = current.type === 'composed' ? normalizeComposedParts(current.parts) : [];
      if (!parts.length && current.type === 'field' && current.field) {
        parts = [{ type: 'field', field: String(current.field), fallback: String(current.fallback || ''), format: normalizePayloadFormat(current.format) }];
      } else if (!parts.length && current.type === 'static' && current.value) {
        parts = [{ type: 'static', value: String(current.value).slice(0, 500) }];
      }
      region.payload = { type: 'composed', parts };
    } else {
      region.payload = {
        type: 'field',
        field: String(codeFieldSelect.value || current.field || ''),
        fallback: '',
        format
      };
    }
    if (region.type === 'barcode') {
      region.symbology = 'code39';
      region.showText = barcodeShowTextToggle.checked;
      region.humanReadableFontSize = normalizeBarcodeTextSize(barcodeTextSizeInput.value);
      barcodeTextSizeWrap.hidden = !region.showText;
    } else {
      region.errorCorrection = ['L', 'M', 'Q', 'H'].includes(qrErrorCorrectionSelect.value) ? qrErrorCorrectionSelect.value : 'M';
    }
    updateCodePayloadVisibility(region);
    refreshSelectedRegion();
  }

  function updateShapeProperties() {
    const region = selectedRegion();
    if (!region || !SHAPE_TYPES.has(region.type)) return;
    const lineLocalHeight = region.rotation === 90 || region.rotation === 270 ? region.width : region.height;
    const maxThickness = region.type === 'rectangle'
      ? Math.max(1, Math.min(40, Math.floor(Math.min(region.width, region.height) / 2)))
      : Math.max(1, Math.min(40, lineLocalHeight));
    region.thickness = clamp(Math.round(Number(shapeThicknessInput.value) || 2), 1, maxThickness);
    if (region.type === 'rectangle') region.fill = rectangleFillSelect.value === 'filled' ? 'filled' : 'outline';
    updateShapeInspector(region);
    refreshSelectedRegion();
  }

  function rotateRegionTo(targetRotation) {
    clearErrors();
    const region = selectedRegion();
    if (!region) return false;
    const current = normalizeRotation(region.rotation);
    const target = normalizeRotation(targetRotation);
    if (current === target) return true;
    const currentQuarter = current === 90 || current === 270;
    const targetQuarter = target === 90 || target === 270;
    let nextWidth = region.width;
    let nextHeight = region.height;
    if (currentQuarter !== targetQuarter) {
      nextWidth = region.height;
      nextHeight = region.width;
    }
    if (nextWidth > state.geometry.canvasWidthDots || nextHeight > state.geometry.canvasHeightDots) {
      showErrors('This region is too large to rotate inside the current label canvas. Resize it first.');
      rotationSelect.value = String(current);
      return false;
    }
    const centerX = region.x + (region.width / 2);
    const centerY = region.y + (region.height / 2);
    region.width = nextWidth;
    region.height = nextHeight;
    region.x = clamp(Math.round(centerX - (nextWidth / 2)), 0, state.geometry.canvasWidthDots - nextWidth);
    region.y = clamp(Math.round(centerY - (nextHeight / 2)), 0, state.geometry.canvasHeightDots - nextHeight);
    region.rotation = target;
    constrainTextFontSizeToRegion(region);
    refreshSelectedRegion();
    return true;
  }

  function rotateRegionBy(delta) {
    const region = selectedRegion();
    if (!region) return;
    const currentIndex = ROTATIONS.indexOf(normalizeRotation(region.rotation));
    const direction = Number(delta) < 0 ? -1 : 1;
    const target = ROTATIONS[(currentIndex + direction + ROTATIONS.length) % ROTATIONS.length];
    rotateRegionTo(target);
  }

  function applyMediaWidth(code) {
    clearErrors();
    const next = mediaByCode.get(code);
    if (!next) return false;
    const nextWidth = Number(next.printableWidthDots);
    const outside = state.layout.elements.filter((element) => Number(element.x) + Number(element.width) > nextWidth);
    if (outside.length) {
      showErrors(`The ${next.widthMm} mm roll is too narrow for ${outside.length} current region(s). Move or resize those regions before changing roll width.`);
      mediaWidthSelect.value = state.media.code;
      return false;
    }
    state.media = next;
    state.layout.mediaWidthCode = next.code;
    updateGeometry();
    markDirty();
    renderRegions();
    updateScale();
    updateGrid();
    return true;
  }

  function applyLength(value) {
    clearErrors();
    const nextLengthMm = normalizeLengthMm(value);
    if (nextLengthMm === null) {
      showErrors(`Label length must be between ${MIN_LENGTH_MM} mm and ${MAX_LENGTH_MM} mm.`);
      lengthInput.value = String(state.lengthMm);
      return false;
    }
    const nextHeight = mmToDots(nextLengthMm);
    const lowestBottom = state.layout.elements.reduce((max, element) => Math.max(max, Number(element.y) + Number(element.height)), 0);
    if (lowestBottom > nextHeight) {
      const minimumMm = Math.ceil(((lowestBottom * 25.4) / DPI) * 10) / 10;
      showErrors(`The label cannot be shortened to ${nextLengthMm} mm because a region extends below that edge. Move or resize the region first, or use at least ${minimumMm} mm.`);
      lengthInput.value = String(state.lengthMm);
      return false;
    }
    state.lengthMm = nextLengthMm;
    state.layout.lengthMm = nextLengthMm;
    lengthInput.value = String(nextLengthMm);
    updateGeometry();
    markDirty();
    renderRegions();
    updateScale();
    updateGrid();
    return true;
  }

  async function saveLayout() {
    clearErrors();
    commitHistoryCheckpoint();
    const submittedSnapshot = buildHistorySnapshot();
    saveButton.disabled = true;
    saveState.textContent = 'Saving…';
    try {
      const response = await fetch(`/management/label-library/templates/${root.dataset.templateId}/builder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          mediaWidthCode: submittedSnapshot.mediaWidthCode,
          lengthMm: submittedSnapshot.lengthMm,
          layout: submittedSnapshot.layout
        })
      });
      const payload = await response.json().catch(() => ({ ok: false, errors: ['The server returned an invalid response.'] }));
      if (!response.ok || !payload.ok) throw new Error((payload.errors || ['The layout could not be saved.']).join('\n'));
      state.savedRevision = Number(payload.revision || state.savedRevision || 0);
      state.savedReady = Boolean(payload.ready);
      state.savedSignature = submittedSnapshot.signature;
      state.savedStatusText = payload.changed === false
        ? `No layout changes · revision ${state.savedRevision}`
        : payload.ready
          ? `${state.templateStatus === 'active' ? 'Saved Live' : 'Saved'} · revision ${state.savedRevision}`
          : `Saved Draft · revision ${state.savedRevision} · ${payload.issues?.length || 0} item(s) need configuration`;
      state.savedStatusGreen = Boolean(payload.ready);
      updateDirtyIndicator(buildHistorySnapshot().signature);
    } catch (error) {
      saveState.textContent = 'Save failed';
      showErrors(String(error.message || error).split('\n'));
    } finally {
      saveButton.disabled = false;
    }
  }

  canvas.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('[data-builder-resize]');
    const node = event.target.closest('[data-builder-region]');
    if (!node) {
      selectRegion(null);
      canvas.focus({ preventScroll: true });
      return;
    }
    beginPointerAction(event, node, handle?.dataset.builderResize || null);
  });

  canvas.addEventListener('click', (event) => {
    const node = event.target.closest('[data-builder-region]');
    if (!node) return;
    selectRegion(node.dataset.builderRegion);
    node.focus({ preventScroll: true });
  });

  unitSearchButton.addEventListener('click', searchPreviewUnits);
  unitSearchInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    searchPreviewUnits();
  });
  unitClearButton.addEventListener('click', clearPreviewUnit);

  addButton.addEventListener('click', addRegion);
  deleteButton.addEventListener('click', deleteSelected);
  saveButton.addEventListener('click', saveLayout);
  undoButton.addEventListener('click', undoHistory);
  redoButton.addEventListener('click', redoHistory);
  gridVisible.addEventListener('change', updateGrid);
  gridSizeSelect.addEventListener('change', updateGrid);
  contentTypeSelect.addEventListener('change', () => setContentType(contentTypeSelect.value));
  staticTextInput.addEventListener('input', updateTextProperties);
  dynamicFieldSelect.addEventListener('change', updateTextProperties);
  imageAssetSelect.addEventListener('change', () => updateImageProperties({ assetChanged: true }));
  imageLockToggle.addEventListener('change', () => updateImageProperties({ assetChanged: imageLockToggle.checked }));
  codePayloadTypeSelect.addEventListener('change', updateCodeProperties);
  codeFieldSelect.addEventListener('change', updateCodeProperties);
  codeStaticInput.addEventListener('input', updateCodeProperties);
  codeCaseSelect.addEventListener('change', updateCodeProperties);
  barcodeSymbologySelect.addEventListener('change', updateCodeProperties);
  barcodeShowTextToggle.addEventListener('change', updateCodeProperties);
  barcodeTextSizeInput.addEventListener('input', updateCodeProperties);
  barcodeTextSizeInput.addEventListener('change', updateCodeProperties);
  qrErrorCorrectionSelect.addEventListener('change', updateCodeProperties);
  shapeThicknessInput.addEventListener('input', updateShapeProperties);
  shapeThicknessInput.addEventListener('change', updateShapeProperties);
  rectangleFillSelect.addEventListener('change', updateShapeProperties);
  for (const button of composedAddButtons) button.addEventListener('click', () => addComposedPart(button.dataset.builderComposedAdd));
  for (const button of composedPresetButtons) button.addEventListener('click', () => applyComposedPreset(button.dataset.builderComposedPreset));
  composedApplyExpression.addEventListener('click', applyAdvancedComposedExpression);
  fontFamilySelect.addEventListener('change', updateTextProperties);
  fontSizeInput.addEventListener('input', updateTextProperties);
  fontSizeInput.addEventListener('change', updateTextProperties);
  fontWeightSelect.addEventListener('change', updateTextProperties);
  textAlignSelect.addEventListener('change', updateTextProperties);
  textCaseSelect.addEventListener('change', updateTextProperties);
  rotationSelect.addEventListener('change', () => rotateRegionTo(rotationSelect.value));
  for (const button of rotateButtons) button.addEventListener('click', () => rotateRegionBy(button.dataset.builderRotate));
  for (const button of layerButtons) button.addEventListener('click', () => moveSelectedLayer(Number(button.dataset.builderLayer || 0)));

  mediaWidthSelect.addEventListener('change', () => applyMediaWidth(mediaWidthSelect.value));
  lengthInput.addEventListener('change', () => applyLength(lengthInput.value));
  lengthInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    applyLength(lengthInput.value);
  });
  for (const button of lengthDeltaButtons) {
    button.addEventListener('click', () => applyLength(state.lengthMm + Number(button.dataset.builderLengthDelta || 0)));
  }

  for (const input of geometryFields) {
    input.addEventListener('change', () => applyGeometryInput(input));
    input.addEventListener('input', () => applyGeometryInput(input));
  }

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const builderTarget = target instanceof Node && root.contains(target);
    const accelerator = (event.ctrlKey || event.metaKey) && !event.altKey;
    const key = String(event.key || '').toLowerCase();
    if (builderTarget && accelerator && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) redoHistory();
      else undoHistory();
      restoreBuilderShortcutFocus();
      return;
    }
    if (builderTarget && accelerator && key === 'y') {
      event.preventDefault();
      redoHistory();
      restoreBuilderShortcutFocus();
      return;
    }

    if (!state.selectedId) return;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
    const step = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowLeft') nudgeSelected(-step, 0);
    else if (event.key === 'ArrowRight') nudgeSelected(step, 0);
    else if (event.key === 'ArrowUp') nudgeSelected(0, -step);
    else if (event.key === 'ArrowDown') nudgeSelected(0, step);
    else if (event.key === 'Delete' || event.key === 'Backspace') deleteSelected();
    else return;
    event.preventDefault();
    commitHistoryCheckpoint();
  });

  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-builder-undo], [data-builder-redo], [data-builder-save], [data-builder-test-print]')) return;
    if (state.historyTimer) commitHistoryCheckpoint();
  });
  root.addEventListener('change', () => {
    if (state.historyTimer) commitHistoryCheckpoint();
  });

  window.addEventListener('resize', updateScale);
  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  updatePreviewUnitStatus();
  renderRegions();
  updateScale();
  updateGrid();
  initializeHistory();
})();
