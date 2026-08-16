// Replaces the manual Ipek/Sino stylist pass: builds a prompt describing the
// fixed taxonomy (from tag_categories) and asks Claude to pick values for a
// given product from its title, description, and photo. Prompt-building and
// response-parsing are pure/testable; generateProductTags is the only part
// that talks to the network.

const DEFAULT_MODEL = 'claude-sonnet-5';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

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

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API request failed (${response.status}): ${text}`);
  }

  const json = await response.json();
  const textBlock = json.content?.find((block) => block.type === 'text');
  return parseAiTagResponse(textBlock?.text ?? '', categories);
}
