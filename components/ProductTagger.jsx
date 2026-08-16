'use client';

import { useEffect, useState } from 'react';
import NotesField from './NotesField.jsx';
import { toggleTagValue } from '../lib/tagLogic.js';

// Tags are either AI-generated (tagged_by 'AI', pending review) or reviewed/
// edited by hand — this is a single-reviewer tool, so any manual edit is
// attributed to 'Sinem' rather than picking from a list of stylists.
const REVIEWER = 'Sinem';

export default function ProductTagger({ productId, categories, onCategoryValueAdded, onTagsChanged, onDeleted }) {
  // Shopify GIDs (e.g. gid://shopify/Product/123) contain literal "/" —
  // must be encoded or Next.js splits them across route segments.
  const encodedId = encodeURIComponent(productId);
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState(null);
  const [tagsByCategory, setTagsByCategory] = useState({});
  const [taggedByCategory, setTaggedByCategory] = useState({});
  const [notes, setNotes] = useState('');
  const [publishStatus, setPublishStatus] = useState('');
  const [newValueDrafts, setNewValueDrafts] = useState({});
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [aiTagging, setAiTagging] = useState(false);
  const [aiTagError, setAiTagError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPublishStatus('');
    setAiTagError('');

    fetch(`/api/products/${encodedId}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        setProduct(json.product);
        const byCategory = {};
        const taggedBy = {};
        for (const row of json.tags) {
          byCategory[row.category_key] = row.values;
          taggedBy[row.category_key] = row.tagged_by;
        }
        setTagsByCategory(byCategory);
        setTaggedByCategory(taggedBy);
        setNotes(json.notes?.notes ?? '');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [productId]);

  async function handleToggle(category, value) {
    const current = tagsByCategory[category.key] ?? [];
    const next = toggleTagValue(current, value, category);
    if (next === current) return;

    setTagsByCategory((prev) => ({ ...prev, [category.key]: next }));
    setTaggedByCategory((prev) => ({ ...prev, [category.key]: REVIEWER }));

    await fetch(`/api/products/${encodedId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_key: category.key, values: next, tagged_by: REVIEWER }),
    });
    onTagsChanged?.();
  }

  async function handleAiTag() {
    setAiTagging(true);
    setAiTagError('');
    try {
      const res = await fetch(`/api/products/${encodedId}/ai-tag`, { method: 'POST' });
      const text = await res.text();
      let json;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`AI tagging failed (${res.status}): server returned a non-JSON response`);
      }
      if (!res.ok) throw new Error(json.error || 'AI tagging failed');

      const byCategory = {};
      const taggedBy = {};
      for (const row of json.tags) {
        byCategory[row.category_key] = row.values;
        taggedBy[row.category_key] = row.tagged_by;
      }
      setTagsByCategory(byCategory);
      setTaggedByCategory(taggedBy);
      onTagsChanged?.();
    } catch (err) {
      setAiTagError(err.message);
    } finally {
      setAiTagging(false);
    }
  }

  async function handleAddValue(category) {
    const draft = (newValueDrafts[category.key] || '').trim();
    if (!draft) return;

    const res = await fetch(`/api/categories/${category.key}/values`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: draft }),
    });
    const json = await res.json();
    if (res.ok) {
      onCategoryValueAdded(category.key, json.category.values);
      setNewValueDrafts((prev) => ({ ...prev, [category.key]: '' }));
    }
  }

  async function handlePublish() {
    setPublishStatus('Publishing...');
    const res = await fetch(`/api/products/${encodedId}/publish-to-shopify`, { method: 'POST' });
    const json = await res.json();
    setPublishStatus(res.ok ? 'Published to Shopify.' : json.error);
  }

  async function handleToggleMark() {
    const marked = !product.marked_for_removal;
    setProduct((prev) => ({ ...prev, marked_for_removal: marked }));
    await fetch(`/api/products/${encodedId}/mark-removal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marked }),
    });
    onTagsChanged?.(); // reuses the existing refresh hook so the list picks up the badge
  }

  async function handleDelete() {
    const ok = window.confirm(`Delete "${product.title}" from Shopify? This cannot be undone.`);
    if (!ok) return;

    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/products/${encodedId}/delete`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      onDeleted?.();
    } catch (err) {
      setDeleteError(err.message);
      setDeleting(false);
    }
  }

  if (loading) return <div className="status-text">Loading product...</div>;
  if (!product) return <div className="status-text">Product not found.</div>;

  return (
    <div>
      <div className="detail-header">
        {product.image_url && <img src={product.image_url} alt="" />}
        <div>
          <h2>{product.title}</h2>
          <div className="price">
            {product.price != null ? `$${Number(product.price).toFixed(2)}` : ''} · {product.status}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <button className="btn" onClick={handleAiTag} disabled={aiTagging} type="button">
          {aiTagging ? 'Tagging with AI...' : 'Tag with AI'}
        </button>
        {aiTagError && <div className="status-text">{aiTagError}</div>}
      </div>

      {categories.map((category) => {
        const selected = tagsByCategory[category.key] ?? [];
        const atCap = category.max_tags != null && selected.length >= category.max_tags;
        const taggedBy = taggedByCategory[category.key];

        return (
          <div className="category-block" key={category.key}>
            <div className="cat-label">
              {category.label}
              {taggedBy && (
                <span className={`cat-badge${taggedBy === REVIEWER ? ' cat-badge-reviewed' : ''}`}>
                  {taggedBy === REVIEWER ? 'Reviewed' : 'AI'}
                </span>
              )}
            </div>
            {category.sub_label && <div className="cat-sub">{category.sub_label}</div>}
            <div className="chip-row">
              {category.values.map((value) => {
                const isSelected = selected.includes(value);
                const disabled = !isSelected && atCap;
                return (
                  <button
                    key={value}
                    type="button"
                    className={`chip${isSelected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
                    onClick={() => !disabled && handleToggle(category, value)}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
            <form
              className="add-value-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleAddValue(category);
              }}
            >
              <input
                placeholder="Add new value..."
                value={newValueDrafts[category.key] || ''}
                onChange={(e) => setNewValueDrafts((prev) => ({ ...prev, [category.key]: e.target.value }))}
              />
              <button className="btn" type="submit">
                Add
              </button>
            </form>
          </div>
        );
      })}

      <NotesField productId={productId} initialNotes={notes} />

      <div style={{ marginTop: 24 }}>
        <button className="btn btn-gold" onClick={handlePublish} type="button">
          Publish to Shopify
        </button>
        {publishStatus && <div className="status-text">{publishStatus}</div>}
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button
          type="button"
          className={`mark-toggle${product.marked_for_removal ? ' marked' : ''}`}
          onClick={handleToggleMark}
        >
          {product.marked_for_removal ? 'Unmark for removal' : 'Mark for removal'}
        </button>
        <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
          {deleting ? 'Deleting...' : 'Delete from Shopify now'}
        </button>
      </div>
      {deleteError && <div className="status-text">{deleteError}</div>}
    </div>
  );
}
