import { BrowserMultiFormatReader } from 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm';

const OFF_API = 'https://world.openfoodfacts.org/api/v2/product';

let zxingReader  = null;
let foundProduct = null;

function hasCameraSupport() {
  return !!(navigator.mediaDevices?.getUserMedia);
}

// Parse Open Food Facts quantity string e.g. "500g", "1.5L", "6 x 330ml"
function parseQuantity(raw) {
  if (!raw) return { qty: '1', unit: 'each' };
  const m = String(raw).match(/^([\d.]+)\s*([a-zA-Z]+)/);
  if (m) return { qty: m[1], unit: m[2].toLowerCase() };
  return { qty: '1', unit: 'each' };
}

// Map Open Food Facts category tags to our default category IDs
function mapToCategory(tags) {
  const s = (tags || []).join(' ').toLowerCase();
  if (/\b(beverage|drink|juice|water|soda|coffee|tea|beer|wine|spirit)\b/.test(s)) return 'beverages';
  if (/\b(dairy|milk|cheese|yogurt|butter|cream)\b/.test(s)) return 'dairy';
  if (/\b(meat|beef|chicken|pork|fish|seafood|poultry)\b/.test(s)) return 'meat';
  if (/\b(frozen)\b/.test(s)) return 'frozen';
  if (/\b(bread|bakery|pastry|cake|biscuit|cracker|cereal)\b/.test(s)) return 'bakery';
  if (/\b(fruit|vegetable|produce|fresh)\b/.test(s)) return 'produce';
  return 'pantry';
}

function defaultExpiry() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

async function lookupBarcode(barcode) {
  const url = `${OFF_API}/${encodeURIComponent(barcode)}.json?fields=product_name,quantity,categories_tags,brands`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('LOOKUP_FAILED');
  const data = await res.json();
  if (data.status !== 1 || !data.product) throw new Error('PRODUCT_NOT_FOUND');

  const p = data.product;
  const rawName = [p.brands, p.product_name].filter(Boolean).join(' ').trim();
  if (!rawName) throw new Error('PRODUCT_NOT_FOUND');

  const { qty, unit } = parseQuantity(p.quantity);
  return {
    name: rawName,
    qty,
    unit,
    category: mapToCategory(p.categories_tags),
    purchaseDate:   new Date().toISOString().slice(0, 10),
    expirationDate: defaultExpiry(),
  };
}

function stopScanner() {
  if (zxingReader) {
    try { zxingReader.reset(); } catch { /* ignore */ }
    zxingReader = null;
  }
}

function startScanLoop(videoEl, onDetected) {
  // Always create a fresh instance — reusing after reset() is unreliable
  zxingReader = new BrowserMultiFormatReader();

  let detected = false;

  zxingReader.decodeFromConstraints(
    { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } },
    videoEl,
    (result, err) => {
      if (detected) return;
      if (result) {
        detected = true;
        onDetected(result.getText());
      }
      // err fires on every frame without a barcode — not a real error, ignore it
    }
  ).catch(() => {
    // Stream setup failed (permission denied etc) — handled by caller showing unsupported section
  });
}

function initBarcodeScanner(openItemModal) {
  const modal              = document.getElementById('barcode-modal');
  const closeBtn           = document.getElementById('barcode-close-btn');
  const triggerBtn         = document.getElementById('barcode-scan-btn');
  const video              = document.getElementById('barcode-video');
  const cameraSection      = document.getElementById('barcode-camera-section');
  const unsupportedSection = document.getElementById('barcode-unsupported-section');
  const statusEl           = document.getElementById('barcode-status');
  const resultEl           = document.getElementById('barcode-result');
  const productNameEl      = document.getElementById('barcode-product-name');
  const productMetaEl      = document.getElementById('barcode-product-meta');
  const addBtn             = document.getElementById('barcode-add-btn');
  const scanAgainBtn       = document.getElementById('barcode-scan-again-btn');
  const manualInput        = document.getElementById('barcode-manual-input');
  const lookupBtn          = document.getElementById('barcode-lookup-btn');

  function setStatus(msg, type = '') {
    statusEl.textContent = msg;
    statusEl.className = `scan-status ${type}`;
    statusEl.hidden = !msg;
  }

  function showResult(product) {
    foundProduct = product;
    productNameEl.textContent = product.name || '(unnamed product)';
    productMetaEl.textContent = `${product.qty} ${product.unit} · ${product.category}`;
    resultEl.hidden = false;
  }

  function clearResult() {
    foundProduct = null;
    resultEl.hidden = true;
    setStatus('');
  }

  async function doLookup(code) {
    setStatus('Looking up product…');
    clearResult();
    try {
      showResult(await lookupBarcode(code));
      setStatus('');
    } catch (err) {
      if (err.message === 'PRODUCT_NOT_FOUND') {
        setStatus('Barcode not found in database. Add manually below.', 'error');
      } else {
        setStatus('Lookup failed. Check your connection and try again.', 'error');
      }
    }
  }

  function beginCamera() {
    if (!hasCameraSupport()) {
      cameraSection.hidden = true;
      unsupportedSection.hidden = false;
      return;
    }
    cameraSection.hidden = false;
    unsupportedSection.hidden = true;
    setStatus('');

    startScanLoop(video, async (code) => {
      stopScanner();
      cameraSection.hidden = true;
      await doLookup(code);
    });
  }

  function openModal() {
    clearResult();
    manualInput.value = '';
    modal.classList.add('open');
    beginCamera();
  }

  function closeModal() {
    stopScanner();
    modal.classList.remove('open');
  }

  triggerBtn?.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  lookupBtn?.addEventListener('click', () => {
    const code = manualInput.value.trim();
    if (code) doLookup(code);
  });
  manualInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') lookupBtn.click(); });

  scanAgainBtn?.addEventListener('click', () => {
    clearResult();
    manualInput.value = '';
    cameraSection.hidden = false;
    beginCamera();
  });

  addBtn?.addEventListener('click', () => {
    if (!foundProduct) return;
    closeModal();
    openItemModal(null, foundProduct);
  });
}

export { initBarcodeScanner };


// Parse Open Food Facts quantity string e.g. "500g", "1.5L", "6 x 330ml"
function parseQuantity(raw) {
  if (!raw) return { qty: '1', unit: 'each' };
  const m = String(raw).match(/^([\d.]+)\s*([a-zA-Z]+)/);
  if (m) return { qty: m[1], unit: m[2].toLowerCase() };
  return { qty: '1', unit: 'each' };
}

// Map Open Food Facts category tags to our default category IDs
function mapToCategory(tags) {
  const s = (tags || []).join(' ').toLowerCase();
  if (/\b(beverage|drink|juice|water|soda|coffee|tea|beer|wine|spirit)\b/.test(s)) return 'beverages';
  if (/\b(dairy|milk|cheese|yogurt|butter|cream)\b/.test(s)) return 'dairy';
  if (/\b(meat|beef|chicken|pork|fish|seafood|poultry)\b/.test(s)) return 'meat';
  if (/\b(frozen)\b/.test(s)) return 'frozen';
  if (/\b(bread|bakery|pastry|cake|biscuit|cracker|cereal)\b/.test(s)) return 'bakery';
  if (/\b(fruit|vegetable|produce|fresh)\b/.test(s)) return 'produce';
  return 'pantry';
}

function defaultExpiry() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

async function lookupBarcode(barcode) {
  const url = `${OFF_API}/${encodeURIComponent(barcode)}.json?fields=product_name,quantity,categories_tags,brands`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('LOOKUP_FAILED');
  const data = await res.json();
  if (data.status !== 1 || !data.product) throw new Error('PRODUCT_NOT_FOUND');

  const p = data.product;
  const rawName = [p.brands, p.product_name].filter(Boolean).join(' ').trim();
  if (!rawName) throw new Error('PRODUCT_NOT_FOUND');

  const { qty, unit } = parseQuantity(p.quantity);
  return {
    name: rawName,
    qty,
    unit,
    category: mapToCategory(p.categories_tags),
    purchaseDate:   new Date().toISOString().slice(0, 10),
    expirationDate: defaultExpiry(),
  };
}

async function startCamera(videoEl) {
  cameraStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
  });
  videoEl.srcObject = cameraStream;
}

function stopCamera() {
  if (stopScanLoop) { stopScanLoop(); stopScanLoop = null; }
  if (cameraStream) { cameraStream.getTracks().forEach((t) => t.stop()); cameraStream = null; }
}

function startScanLoop(videoEl, onDetected) {
  if (!zxingReader) zxingReader = new BrowserMultiFormatReader();

  let active = true;
  stopScanLoop = () => {
    active = false;
    zxingReader.reset();
  };

  zxingReader.decodeFromVideoElement(videoEl, (result, err) => {
    if (!active) return;
    if (result) {
      active = false;
      onDetected(result.getText());
    }
    // err is set on every frame that has no barcode — not a real error
  });
}

function initBarcodeScanner(openItemModal) {
  const modal       = document.getElementById('barcode-modal');
  const closeBtn    = document.getElementById('barcode-close-btn');
  const triggerBtn  = document.getElementById('barcode-scan-btn');
  const video       = document.getElementById('barcode-video');
  const cameraSection     = document.getElementById('barcode-camera-section');
  const unsupportedSection= document.getElementById('barcode-unsupported-section');
  const statusEl    = document.getElementById('barcode-status');
  const resultEl    = document.getElementById('barcode-result');
  const productNameEl = document.getElementById('barcode-product-name');
  const productMetaEl = document.getElementById('barcode-product-meta');
  const addBtn      = document.getElementById('barcode-add-btn');
  const scanAgainBtn= document.getElementById('barcode-scan-again-btn');
  const manualInput = document.getElementById('barcode-manual-input');
  const lookupBtn   = document.getElementById('barcode-lookup-btn');

  function setStatus(msg, type = '') {
    statusEl.textContent = msg;
    statusEl.className = `scan-status ${type}`;
    statusEl.hidden = !msg;
  }

  function showResult(product) {
    foundProduct = product;
    productNameEl.textContent = product.name || '(unnamed product)';
    productMetaEl.textContent = `${product.qty} ${product.unit} · ${product.category}`;
    resultEl.hidden = false;
  }

  function clearResult() {
    foundProduct = null;
    resultEl.hidden = true;
    setStatus('');
  }

  async function doLookup(code) {
    setStatus('Looking up product…');
    clearResult();
    try {
      showResult(await lookupBarcode(code));
      setStatus('');
    } catch (err) {
      if (err.message === 'PRODUCT_NOT_FOUND') {
        setStatus(`Barcode not found in database. Add manually below.`, 'error');
      } else {
        setStatus('Lookup failed. Check your connection and try again.', 'error');
      }
    }
  }

  async function beginCamera() {
    if (!hasCameraSupport()) {
      cameraSection.hidden = true;
      unsupportedSection.hidden = false;
      return;
    }
    cameraSection.hidden = false;
    unsupportedSection.hidden = true;
    setStatus('Starting camera…');
    try {
      // Request camera permission and attach stream to video element
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
      });
      video.srcObject = cameraStream;
      setStatus('');
      startScanLoop(video, async (code) => {
        stopCamera();
        cameraSection.hidden = true;
        await doLookup(code);
      });
    } catch {
      cameraSection.hidden = true;
      unsupportedSection.hidden = false;
      setStatus('Camera access denied. Enter barcode manually.', 'error');
    }
  }

  function openModal() {
    clearResult();
    manualInput.value = '';
    modal.classList.add('open');
    beginCamera();
  }

  function closeModal() {
    stopCamera();
    modal.classList.remove('open');
  }

  triggerBtn?.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  lookupBtn?.addEventListener('click', () => {
    const code = manualInput.value.trim();
    if (code) doLookup(code);
  });
  manualInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') lookupBtn.click(); });

  scanAgainBtn?.addEventListener('click', () => {
    clearResult();
    manualInput.value = '';
    cameraSection.hidden = false;
    beginCamera();
  });

  addBtn?.addEventListener('click', () => {
    if (!foundProduct) return;
    closeModal();
    openItemModal(null, foundProduct);
  });
}

export { initBarcodeScanner };
