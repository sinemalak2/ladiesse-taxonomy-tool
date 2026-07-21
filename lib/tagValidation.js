export function validateTagValues(values, category) {
  if (!Array.isArray(values)) {
    return 'values must be an array';
  }
  if (category.max_tags != null && values.length > category.max_tags) {
    return `${category.label} allows at most ${category.max_tags} tags`;
  }
  const allowed = new Set(category.values);
  const unknown = values.filter((v) => !allowed.has(v));
  if (unknown.length > 0) {
    return `Unknown value(s) for ${category.label}: ${unknown.join(', ')}`;
  }
  return null;
}
