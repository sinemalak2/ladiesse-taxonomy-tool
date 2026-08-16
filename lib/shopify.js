import { getShopifyAccessToken } from './shopifyAuth.js';

export function shopifyGraphqlEndpoint({ storeDomain, apiVersion }) {
  return `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`;
}

export async function shopifyGraphql(query, variables = {}) {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-01';

  if (!storeDomain) {
    throw new Error('SHOPIFY_STORE_DOMAIN must be set');
  }

  const token = await getShopifyAccessToken();

  const response = await fetch(shopifyGraphqlEndpoint({ storeDomain, apiVersion }), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
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

export const PRODUCTS_QUERY = `
  query SyncProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          handle
          status
          description
          featuredImage {
            url
          }
          variants(first: 1) {
            edges {
              node {
                price
              }
            }
          }
        }
      }
    }
  }
`;

export const PRODUCT_IDS_QUERY = `
  query ProductIds($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
        }
      }
    }
  }
`;

export function extractProductNode(node) {
  const price = node.variants?.edges?.[0]?.node?.price;
  return {
    id: node.id,
    title: node.title,
    handle: node.handle,
    status: node.status,
    description: node.description ?? null,
    imageUrl: node.featuredImage?.url ?? null,
    price: price != null ? Number(price) : null,
    raw: node,
  };
}

export const PRODUCT_DELETE_MUTATION = `
  mutation DeleteProduct($input: ProductDeleteInput!) {
    productDelete(input: $input) {
      deletedProductId
      userErrors {
        field
        message
      }
    }
  }
`;

export const METAFIELDS_SET_MUTATION = `
  mutation SetTaxonomyMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        key
        namespace
      }
      userErrors {
        field
        message
      }
    }
  }
`;
