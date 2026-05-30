const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

function getApiKey() {
  return localStorage.getItem('mk_api_key') || '';
}

function setApiKey(key) {
  localStorage.setItem('mk_api_key', key.trim());
}

function makeHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': getApiKey(),
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

// Strip markdown code fences from Claude's response text
function extractJSON(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw.trim());
}

// Resize image to max 1200px on the longest side and return base64 JPEG
async function resizeImage(file, maxPx = 1200, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(maxPx / img.width, maxPx / img.height, 1);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      // Strip the "data:image/jpeg;base64," prefix
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl.replace(/^data:image\/jpeg;base64,/, ''));
    };
    img.onerror = () => reject(new Error('IMAGE_LOAD_ERROR'));
    img.src = url;
  });
}

async function scanReceipt(imageFile) {
  const key = getApiKey();
  if (!key) throw new Error('NO_KEY');

  const base64 = await resizeImage(imageFile);

  const payload = {
    model: MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: base64,
            },
          },
          {
            type: 'text',
            text: `Analyze this grocery receipt image. Extract each purchased item and return ONLY a raw JSON array (no markdown, no explanation) with this shape:
[
  {
    "name": "item name",
    "qty": "1",
    "unit": "each",
    "price": "3.49",
    "category": "produce|dairy|meat|bakery|frozen|beverages|pantry|household|other",
    "expirationDate": null
  }
]
Rules:
- "price" is the total line-item price for this item as it appears on the receipt (e.g. "3.49"). Use null if not visible.
- "qty" is the quantity purchased. Use "each" unit for countable items. Use common units (lbs, oz, gal, L, kg) when visible.
- If no quantity is visible use "1".
Return only the JSON array, no other text.`,
          },
        ],
      },
    ],
  };

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: makeHeaders(),
    body: JSON.stringify(payload),
  });

  if (res.status === 401 || res.status === 403) throw new Error('INVALID_KEY');
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API_ERROR:${res.status}:${body}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || '';

  try {
    const items = extractJSON(text);
    if (!Array.isArray(items)) throw new Error('Expected array');
    return items.map((item) => ({
      name: String(item.name || '').trim(),
      qty: String(item.qty || '1').trim(),
      unit: String(item.unit || 'each').trim(),
      price: item.price != null && item.price !== '' ? String(parseFloat(item.price) || '') : null,
      category: String(item.category || 'other').trim(),
      expirationDate: item.expirationDate || null,
      purchaseDate: new Date().toISOString().slice(0, 10),
    }));
  } catch {
    throw new Error('PARSE_ERROR');
  }
}

async function getMealRecommendations(inventoryItems) {
  const key = getApiKey();
  if (!key) throw new Error('NO_KEY');

  // Limit to 50 oldest items to stay within context limits
  const items = inventoryItems.slice(0, 50);
  const inventoryText = items
    .map((i) => `- ${i.name}: ${i.qty} ${i.unit}${i.purchaseDate ? ` (bought ${i.purchaseDate})` : ''}`)
    .join('\n');

  const payload = {
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Based on my current pantry inventory below, suggest 5 meals I can make. Prioritize using the items that have been in my pantry the longest (listed first). For each meal provide: name, a one-sentence description, and the key ingredients from my inventory it uses.

My inventory (oldest items first):
${inventoryText}

Format your response as a numbered list of meals. Keep it practical and home-cooking focused.`,
      },
    ],
  };

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: makeHeaders(),
    body: JSON.stringify(payload),
  });

  if (res.status === 401 || res.status === 403) throw new Error('INVALID_KEY');
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API_ERROR:${res.status}:${body}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

export { getApiKey, setApiKey, scanReceipt, getMealRecommendations };
