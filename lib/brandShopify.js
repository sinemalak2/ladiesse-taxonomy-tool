// Per-brand Shopify GraphQL client — structurally the same shape as
// lib/shopify.js (Ladiesse's own store), but parameterized by shop domain
// and access token instead of reading fixed env vars, since each brand has
// its own store and its own OAuth token. lib/shopify.js is left untouched.

import { createHmac, timingSafeEqual } from 'node:crypto';

// Shopify webhook payloads use the REST Admin API shape (plain numeric
// IDs), unlike the GraphQL sync below (full GIDs) — converted to the same
// GID format so both paths write consistent shopify_*_gid values into
// brand_products/brand_product_variants.
export function toProductGid(numericId) {
  return `gid://shopify/Product/${numericId}`;
}

export function toVariantGid(numericId) {
  return `gid://shopify/ProductVariant/${numericId}`;
}

export function toInventoryItemGid(numericId) {
  return `gid://shopify/InventoryItem/${numericId}`;
}

// Verifies the X-Shopify-Hmac-Sha256 header Shopify sends on every webhook
// POST — HMAC-SHA256 of the raw (unparsed) request body, base64-encoded.
export function verifyWebhookHmac(rawBody, headerValue, clientSecret) {
  if (!headerValue) return false;
  const computed = createHmac('sha256', clientSecret).update(rawBody, 'utf8').digest('base64');
  const headerBuf = Buffer.from(headerValue, 'base64');
  const computedBuf = Buffer.from(computed, 'base64');
  return headerBuf.length === computedBuf.length && timingSafeEqual(headerBuf, computedBuf);
}

// REST webhook payloads name option values positionally on each variant
// (option1/option2/option3) rather than as named pairs — the option NAMES
// live once on the product's own `options` array. Reassembled here into the
// same [{name, value}] shape the GraphQL sync's extractBrandProductNode
// produces, so both paths write identical option_values JSON.
export function extractRestOptionValues(productOptions, variant) {
  const positional = [variant.option1, variant.option2, variant.option3];
  return (productOptions ?? [])
    .map((opt, i) => (positional[i] != null ? { name: opt.name, value: positional[i] } : null))
    .filter(Boolean);
}

const REST_TO_GRAPHQL_WEIGHT_UNIT = {
  g: 'GRAMS',
  kg: 'KILOGRAMS',
  lb: 'POUNDS',
  oz: 'OUNCES',
};

// REST webhook payloads use short lowercase weight_unit codes ('kg', 'lb');
// the GraphQL WeightUnit enum (used by productSet on import) spells them
// out ('KILOGRAMS', 'POUNDS') — normalized here so both sync paths store
// the same representation in weight_unit.
export function toGraphqlWeightUnit(restUnit) {
  if (!restUnit) return null;
  return REST_TO_GRAPHQL_WEIGHT_UNIT[restUnit.toLowerCase()] ?? null;
}

export const SHOP_CURRENCY_QUERY = `
  query ShopCurrency {
    shop {
      currencyCode
    }
  }
`;

export async function brandShopifyGraphql({ shopDomain, accessToken, query, variables = {} }) {
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-01';
  const endpoint = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify GraphQL request failed (${response.status}): ${text}`);
  }

  const json = await response.json();
  if (json.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// Pulls everything the brief's product sync needs: full description,
// product type/vendor, all images, and full variant list with SKU,
// pricing, and the inventory item ID (needed to match inventory_levels
// webhooks to a specific variant later).
export const BRAND_PRODUCTS_QUERY = `
  query BrandSyncProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          handle
          bodyHtml
          productType
          vendor
          status
          options {
            name
            values
          }
          tags
          category {
            id
            name
            fullName
          }
          metafields(first: 50) {
            edges {
              node {
                namespace
                key
                value
                type
              }
            }
          }
          featuredImage {
            url
          }
          images(first: 10) {
            edges {
              node {
                url
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                price
                compareAtPrice
                inventoryQuantity
                inventoryItem {
                  id
                  measurement {
                    weight {
                      value
                      unit
                    }
                  }
                }
                image {
                  url
                }
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
        }
      }
    }
  }
`;

export function extractBrandProductNode(node) {
  return {
    shopifyProductGid: node.id,
    title: node.title,
    handle: node.handle,
    bodyHtml: node.bodyHtml ?? null,
    productType: node.productType ?? null,
    vendor: node.vendor ?? null,
    status: node.status ? node.status.toLowerCase() : null,
    // Product-level option definitions (e.g. [{name:'Size', values:['S','M']}])
    // — needed to rebuild productOptions when pushing into another store;
    // a flattened variant.title ("M / Black") alone can't reconstruct this.
    options: (node.options ?? []).map((o) => ({ name: o.name, values: o.values })),
    imageUrls: (node.images?.edges ?? []).map((edge) => edge.node.url),
    tags: node.tags ?? [],
    categoryGid: node.category?.id ?? null,
    categoryName: node.category?.fullName ?? node.category?.name ?? null,
    metafields: (node.metafields?.edges ?? []).map((edge) => ({
      namespace: edge.node.namespace,
      key: edge.node.key,
      value: edge.node.value,
      type: edge.node.type,
    })),
    raw: node,
    variants: (node.variants?.edges ?? []).map((edge) => {
      const v = edge.node;
      return {
        shopifyVariantGid: v.id,
        title: v.title,
        sku: v.sku ?? null,
        price: v.price != null ? Number(v.price) : null,
        compareAtPrice: v.compareAtPrice != null ? Number(v.compareAtPrice) : null,
        inventoryQuantity: v.inventoryQuantity ?? 0,
        inventoryItemGid: v.inventoryItem?.id ?? null,
        imageUrl: v.image?.url ?? node.featuredImage?.url ?? null,
        // [{name:'Size', value:'M'}, {name:'Color', value:'Black'}]
        optionValues: (v.selectedOptions ?? []).map((so) => ({ name: so.name, value: so.value })),
        weightValue: v.inventoryItem?.measurement?.weight?.value ?? null,
        weightUnit: v.inventoryItem?.measurement?.weight?.unit ?? null,
      };
    }),
  };
}
