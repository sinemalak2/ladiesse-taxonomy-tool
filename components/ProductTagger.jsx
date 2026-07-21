'use client';

import { useEffect, useState } from 'react';
import TaggedByToggle from './TaggedByToggle.jsx';
import NotesField from './NotesField.jsx';
import { toggleTagValue } from '../lib/tagLogic.js';

export default function ProductTagger({ productId, categories, onCategoryValueAdded }) {
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState(null);
  const [tagsByCategory, setTagsByCategory] = useState({});
  const [notes, setNotes] = useState('');
  const [taggedBy, setTaggedBy] = useState('Ipek');
  const [publishStatus, setPublishStatus] = useState('');
  const [newValueDrafts, setNewValueDrafts] = useState({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPublishStatus('');

    fetch(`/api/products/${productId}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        setProduct(json.product);
        const byCategory = {};
        for (const row of json.tags) {
          byCategory[row.category_key] = row.values;
          if (row.tagged_by) setTaggedBy(row.tagged_by);
        }
        setTagsByCategory(byCategory);
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

    await fetch(`/api/products/${productId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_key: category.key, values: next, tagged_by: taggedBy }),
    });
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
    const res = await fetch(`/api/products/${productId}/publish-to-shopify`, { method: 'POST' });
    const json = await res.json();
    setPublishStatus(res.ok ? 'Published to Shopify.' : json.error);
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

      <TaggedByToggle value={taggedBy} onChange={setTaggedBy} />

      {categories.map((category) => {
        const selected = tagsByCategory[category.key] ?? [];
        const atCap = category.max_tags != null && selected.length >= category.max_tags;

        return (
          <div className="category-block" key={category.key}>
            <div className="cat-label">{category.label}</div>
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
    </div>
  );
}
