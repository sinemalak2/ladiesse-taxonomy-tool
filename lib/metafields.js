export const TAXONOMY_NAMESPACE = 'ladiesse_taxonomy';

export function buildTaxonomyMetafields(productId, tagRows) {
  return tagRows
    .filter((row) => Array.isArray(row.values) && row.values.length > 0)
    .map((row) => ({
      ownerId: productId,
      namespace: TAXONOMY_NAMESPACE,
      key: row.category_key,
      type: 'list.single_line_text_field',
      value: JSON.stringify(row.values),
    }));
}
