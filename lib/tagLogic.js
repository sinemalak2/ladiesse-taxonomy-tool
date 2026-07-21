export function toggleTagValue(currentValues, value, category) {
  const isSelected = currentValues.includes(value);

  if (isSelected) {
    return currentValues.filter((v) => v !== value);
  }

  if (category.is_multi === false) {
    return [value];
  }

  if (category.max_tags != null && currentValues.length >= category.max_tags) {
    return currentValues; // at cap — no-op
  }

  return [...currentValues, value];
}
