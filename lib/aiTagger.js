// Replaces the manual Ipek/Sino stylist pass: builds a prompt describing the
// fixed taxonomy (from tag_categories) and asks Claude to pick values for a
// given product from its title, description, and photo. Prompt-building and
// response-parsing are pure/testable; generateProductTags is the only part
// that talks to the network.

const DEFAULT_MODEL = 'claude-sonnet-5';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

// Rate-limit (429) and transient server (5xx) responses get retried with
// backoff rather than failing the product outright — on a long bulk-tagging
// run these show up disproportionately toward the end, once enough
// requests have gone by to trip Anthropic's per-minute limit.
const MAX_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function retryDelayMs(response, attempt) {
  const retryAfter = response?.headers?.get?.('retry-after');
  const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : NaN;
  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) return retryAfterMs;
  return RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
}

export function buildTaggingPrompt(product, categories) {
  const categoryLines = categories
    .map((category) => {
      const constraint =
        category.is_multi === false
          ? 'choose exactly 1'
          : category.max_tags != null
            ? `choose up to ${category.max_tags}`
            : 'choose any number that genuinely apply';
      return `- "${category.key}" (${constraint}): ${category.values.join(', ')}`;
    })
    .join('\n');

  return `You are a fashion stylist tagging a product photo for a boutique's style taxonomy.

Product title: ${product.title}
Product description: ${product.description || '(none provided)'}

For each category below, choose only from its listed allowed values (copy them
character-for-character) that genuinely apply to this garment, judging from
the photo, title, and description together. Leave a category as an empty
array if nothing on the list genuinely fits — never invent a value that
isn't listed, and never pick a value just to fill the category.

${categoryLines}

Respond with ONLY a single JSON object mapping each category key to an array
of the chosen values, and nothing else. Example shape:
{"body_shape": ["Hourglass"], "occasion": ["Party"], "vibe": ["Romantic","Glam"], "skin_tone": []}`;
}

export function parseAiTagResponse(text, categories) {
  const match = typeof text === 'string' ? text.match(/\{[\s\S]*\}/) : null;
  if (!match) {
    throw new Error('No JSON object found in AI response');
  }

  const parsed = JSON.parse(match[0]);
  const result = {};

  for (const category of categories) {
    const raw = Array.isArray(parsed[category.key]) ? parsed[category.key] : [];
    const allowed = new Set(category.values);
    let values = [...new Set(raw.filter((v) => allowed.has(v)))];

    if (category.max_tags != null && values.length > category.max_tags) {
      values = values.slice(0, category.max_tags);
    }
    if (category.is_multi === false && values.length > 1) {
      values = values.slice(0, 1);
    }

    result[category.key] = values;
  }

  return result;
}

export async function generateProductTags(product, categories, options = {}) {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const model = options.model ?? DEFAULT_MODEL;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY must be set');
  }

  const prompt = buildTaggingPrompt(product, categories);
  const content = [{ type: 'text', text: prompt }];
  if (product.image_url) {
    content.unshift({ type: 'image', source: { type: 'url', url: product.image_url } });
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: 'user', content }],
      }),
    });

    if (response.ok) {
      const json = await response.json();
      const textBlock = json.content?.find((block) => block.type === 'text');
      return parseAiTagResponse(textBlock?.text ?? '', categories);
    }

    const text = await response.text();
    lastError = new Error(`Anthropic API request failed (${response.status}): ${text}`);

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS) {
      throw lastError;
    }
    await sleep(retryDelayMs(response, attempt));
  }
  throw lastError;
}

// Generates and writes tags for one product. `queryFn` is any function with
// the pg-style (text, params) => Promise<{ rows }> signature — lib/db.js's
// `query` export or a Pool's own `.query`, so this works the same from an
// API route and from a plain script. Shared by the per-product "Tag with
// AI" route (force: true — a deliberate single-product action that should
// always overwrite) and the bulk script/batch route (force: false — never
// clobber a category a human already reviewed).
export async function applyAiTags(queryFn, product, categories, { force = false } = {}) {
  const tagsByCategory = await generateProductTags(product, categories);
  const results = [];

  for (const category of categories) {
    if (!force) {
      const { rows: existing } = await queryFn(
        'SELECT category_key, values, tagged_by, updated_at FROM product_tags WHERE product_id = $1 AND category_key = $2',
        [product.id, category.key]
      );
      if (existing[0]?.tagged_by === 'Sinem') {
        results.push(existing[0]);
        continue;
      }
    }

    const values = tagsByCategory[category.key] ?? [];
    const { rows: upserted } = await queryFn(
      `INSERT INTO product_tags (product_id, category_key, values, tagged_by, updated_at)
       VALUES ($1, $2, $3, 'AI', now())
       ON CONFLICT (product_id, category_key) DO UPDATE SET
         values = EXCLUDED.values,
         tagged_by = EXCLUDED.tagged_by,
         updated_at = now()
       RETURNING category_key, values, tagged_by, updated_at`,
      [product.id, category.key, values]
    );
    results.push(upserted[0]);
  }

  return results;
}

// Products with at least one category still empty — the pool of work for
// both the bulk script and the batched "Tag all with AI" UI action.
export async function findUntaggedProductIds(queryFn, { limit } = {}) {
  const { rows } = await queryFn(
    `SELECT p.id FROM products p
     WHERE EXISTS (
       SELECT 1 FROM product_tags pt
       WHERE pt.product_id = p.id AND array_length(pt.values, 1) IS NULL
     )
     ORDER BY p.title
     ${limit != null ? 'LIMIT $1' : ''}`,
    limit != null ? [limit] : []
  );
  return rows.map((row) => row.id);
}

export async function countUntaggedProducts(queryFn) {
  const { rows } = await queryFn(
    `SELECT COUNT(DISTINCT p.id)::int AS count
     FROM products p
     WHERE EXISTS (
       SELECT 1 FROM product_tags pt
       WHERE pt.product_id = p.id AND array_length(pt.values, 1) IS NULL
     )`
  );
  return rows[0].count;
}
