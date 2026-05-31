const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

function defaultExpiry() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

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
    "category": "produce|dairy|meat|bakery|frozen|beverages|pantry|other",
    "expirationDate": null,
    "include": "yes"
  }
]
Rules:
- "price" is the total line-item price for this item as it appears on the receipt (e.g. "3.49"). Use null if not visible.
- "qty" is the quantity purchased. Use "each" unit for countable items. Use common units (lbs, oz, gal, L, kg) when visible.
- If no quantity is visible use "1".
- "include": set to "yes" for clear food/drink items, "no" for clear non-food items (cleaning supplies, paper products, toiletries, pet supplies, batteries, etc.), and "ask" if you are unsure whether it belongs in a food pantry (e.g. vitamins, supplements, baby food, protein powder, cooking spray, foil, parchment paper).
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
      expirationDate: item.expirationDate || defaultExpiry(),
      purchaseDate: new Date().toISOString().slice(0, 10),
    }));
  } catch {
    throw new Error('PARSE_ERROR');
  }
}

async function getMealRecommendations(inventoryItems) {
  const key = getApiKey();
  if (!key) throw new Error('NO_KEY');

  const today = new Date().toISOString().slice(0, 10);
  const items = inventoryItems.slice(0, 60);
  const inventoryText = items.map((i) => {
    const exp = i.expirationDate ? `, expires ${i.expirationDate}` : '';
    const expired = i.expirationDate && i.expirationDate < today ? ' [EXPIRED]' : '';
    return `- ${i.name}: ${i.qty} ${i.unit}${exp}${expired}`;
  }).join('\n');

  const payload = {
    model: MODEL,
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `You are a helpful kitchen assistant. Based on the pantry inventory below, suggest 5 practical home-cooking meals.

Priorities:
1. Use items expiring soonest first (not expired items — flag those separately)
2. Account for quantity — if an ingredient is low (e.g. half a vegetable, small amount), note a suggested substitute or addition from a similar food group
3. Do NOT use expired items in recipes — instead flag them at the top
4. Be practical and realistic about what can actually be made

Return ONLY a raw JSON object (no markdown) with this exact shape:
{
  "expired": ["item name", ...],
  "meals": [
    {
      "name": "Meal Name",
      "description": "One sentence description.",
      "ingredients": [
        { "name": "ingredient from pantry", "qty": "amount needed", "status": "ok|low|substitute", "note": "optional note, e.g. low — add a carrot or bell pepper" }
      ],
      "tip": "Optional short cooking tip or variation idea."
    }
  ]
}

"status" values:
- "ok" — sufficient quantity available
- "low" — item exists but quantity is small; include a "note" suggesting a similar ingredient to supplement
- "substitute" — item is missing or expired; include a "note" with what to use instead

Pantry inventory (soonest expiring first):
${inventoryText}`,
    }],
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
    return extractJSON(text);
  } catch {
    throw new Error('PARSE_ERROR');
  }
}

async function rerollMeal(meal, inventoryItems) {
  const key = getApiKey();
  if (!key) throw new Error('NO_KEY');

  const today = new Date().toISOString().slice(0, 10);
  const items = inventoryItems.slice(0, 60);
  const inventoryText = items.map((i) => {
    const exp = i.expirationDate ? `, expires ${i.expirationDate}` : '';
    const expired = i.expirationDate && i.expirationDate < today ? ' [EXPIRED]' : '';
    return `- ${i.name}: ${i.qty} ${i.unit}${exp}${expired}`;
  }).join('\n');

  const payload = {
    model: MODEL,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `I have this meal suggestion: "${meal.name}" — ${meal.description}

Give me ONE variation on this meal using the same pantry. It should be meaningfully different (different cuisine style, cooking method, or flavor profile) but still practical.

Return ONLY a raw JSON object (no markdown) with this exact shape:
{
  "name": "Variation Name",
  "description": "One sentence description.",
  "ingredients": [
    { "name": "ingredient", "qty": "amount", "status": "ok|low|substitute", "note": "optional note" }
  ],
  "tip": "Optional short tip."
}

Pantry:
${inventoryText}`,
    }],
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
    return extractJSON(text);
  } catch {
    throw new Error('PARSE_ERROR');
  }
}

async function getShoppingSuggestions(items) {
  const key = getApiKey();
  if (!key) throw new Error('NO_KEY');

  const inventory = items.length
    ? items.map((i) => `- ${i.name}: ${i.qty} ${i.unit}${i.expirationDate ? `, expires ${i.expirationDate}` : ''}`).join('\n')
    : '(pantry is empty)';

  const payload = {
    model: MODEL,
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `You are a helpful kitchen assistant. Based on the pantry inventory below, suggest 6–8 items to add to a shopping list. Prioritise: restocking items that are nearly gone or expiring soon, common staples that appear to be missing, and ingredients that would complement what's already there.

Pantry:
${inventory}

Return ONLY a JSON array of item name strings with no extra text. Example: ["Milk","Bread","Olive Oil"]`,
    }],
  };

  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: makeHeaders(),
    body: JSON.stringify(payload),
  });

  if (res.status === 401 || res.status === 403) throw new Error('INVALID_KEY');
  if (!res.ok) throw new Error(`API_ERROR:${res.status}`);

  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  try {
    const list = extractJSON(text);
    if (!Array.isArray(list)) throw new Error('Expected array');
    return list.map((s) => String(s).trim()).filter(Boolean);
  } catch {
    throw new Error('PARSE_ERROR');
  }
}

export { getApiKey, setApiKey, scanReceipt, getMealRecommendations, rerollMeal, getShoppingSuggestions };
